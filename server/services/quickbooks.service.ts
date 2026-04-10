import { db } from '../db';
import { users, quickbooksSyncLog } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { encryptQBToken, decryptQBToken, encryptState, decryptState } from '../lib/encryption';

const QB_API_LIMIT_PER_DAY = 100;

interface QBTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class QuickBooksService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private environment: 'sandbox' | 'production';

  constructor() {
    this.clientId = process.env.QB_CLIENT_ID || '';
    this.clientSecret = process.env.QB_CLIENT_SECRET || '';
    this.redirectUri =
      process.env.QB_REDIRECT_URI ||
      `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'divorceledger.replit.app'}/api/quickbooks/callback`;
    this.environment = (process.env.QB_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  getAuthorizationUrl(userId: string): string {
    if (!this.isConfigured()) {
      throw new Error('QuickBooks OAuth credentials not configured');
    }

    const state = encryptState(userId);
    const scopes = encodeURIComponent('com.intuit.quickbooks.accounting');
    const baseUrl =
      this.environment === 'sandbox'
        ? 'https://appcenter.intuit.com/connect/oauth2'
        : 'https://appcenter.intuit.com/connect/oauth2';

    return `${baseUrl}?client_id=${this.clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForTokens(code: string, realmId: string): Promise<QBTokens> {
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async refreshUserTokens(userId: string): Promise<QBTokens | null> {
    const user = await this.getUserQBCredentials(userId);
    if (!user || !user.refreshToken) {
      return null;
    }

    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: user.refreshToken,
        }),
      });

      if (!response.ok) {
        await this.disconnectUser(userId, 'Token refresh failed');
        return null;
      }

      const data = await response.json();
      const tokens: QBTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      };

      await this.storeUserTokens(userId, tokens, user.realmId!);
      await this.logAction(
        userId,
        'token_refresh',
        undefined,
        undefined,
        'POST',
        '/oauth2/v1/tokens/bearer',
        200
      );

      return tokens;
    } catch (error) {
      await this.disconnectUser(userId, 'Token refresh error');
      return null;
    }
  }

  async storeUserTokens(
    userId: string,
    tokens: QBTokens,
    realmId: string,
    companyName?: string
  ): Promise<void> {
    const accessTokenEnc = encryptQBToken(tokens.accessToken);
    const refreshTokenEnc = encryptQBToken(tokens.refreshToken);

    await db
      .update(users)
      .set({
        qbAccessTokenEncrypted: accessTokenEnc.encrypted,
        qbAccessTokenIv: accessTokenEnc.iv,
        qbAccessTokenAuthTag: accessTokenEnc.authTag,
        qbRefreshTokenEncrypted: refreshTokenEnc.encrypted,
        qbRefreshTokenIv: refreshTokenEnc.iv,
        qbRefreshTokenAuthTag: refreshTokenEnc.authTag,
        qbRealmId: realmId,
        qbTokenExpiresAt: tokens.expiresAt,
        qbConnected: true,
        qbConnectedAt: new Date(),
        qbScopes: ['com.intuit.quickbooks.accounting'],
        ...(companyName && { qbCompanyName: companyName }),
      })
      .where(eq(users.id, userId));
  }

  async getUserQBCredentials(userId: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    realmId: string | null;
    expiresAt: Date | null;
    connected: boolean;
    needsMigration: boolean;
  } | null> {
    const result = await db.execute(sql`
      SELECT 
        qb_access_token_encrypted,
        qb_access_token_iv,
        qb_access_token_auth_tag,
        qb_refresh_token_encrypted,
        qb_refresh_token_iv,
        qb_refresh_token_auth_tag,
        qb_token_iv,
        qb_token_auth_tag,
        qb_realm_id,
        qb_token_expires_at,
        qb_connected
      FROM users WHERE id = ${userId} LIMIT 1
    `);

    if (!result.rows.length) return null;

    const user = result.rows[0] as any;
    if (!user.qb_connected || !user.qb_access_token_encrypted) {
      return {
        accessToken: null,
        refreshToken: null,
        realmId: user.qb_realm_id,
        expiresAt: user.qb_token_expires_at,
        connected: false,
        needsMigration: false,
      };
    }

    const accessIv = user.qb_access_token_iv || user.qb_token_iv || '';
    const accessAuthTag = user.qb_access_token_auth_tag || user.qb_token_auth_tag || '';
    const refreshIv = user.qb_refresh_token_iv || user.qb_token_iv || '';
    const refreshAuthTag = user.qb_refresh_token_auth_tag || user.qb_token_auth_tag || '';

    const isLegacy = !user.qb_access_token_iv && !!user.qb_token_iv;

    const accessToken = decryptQBToken(user.qb_access_token_encrypted, accessIv, accessAuthTag);

    const refreshToken = user.qb_refresh_token_encrypted
      ? decryptQBToken(user.qb_refresh_token_encrypted, refreshIv, refreshAuthTag)
      : null;

    return {
      accessToken,
      refreshToken,
      realmId: user.qb_realm_id,
      expiresAt: user.qb_token_expires_at,
      connected: user.qb_connected,
      needsMigration: isLegacy,
    };
  }

  async migrateUserTokensIfNeeded(userId: string): Promise<void> {
    const creds = await this.getUserQBCredentials(userId);
    if (!creds || !creds.connected || !creds.needsMigration) {
      return;
    }

    if (!creds.accessToken || !creds.refreshToken) {
      console.log(
        `[QB Migration] User ${userId} has legacy tokens but decryption failed - requires reconnection`
      );
      return;
    }

    const accessTokenEnc = encryptQBToken(creds.accessToken);
    const refreshTokenEnc = encryptQBToken(creds.refreshToken);

    await db.execute(sql`
      UPDATE users SET
        qb_access_token_encrypted = ${accessTokenEnc.encrypted},
        qb_access_token_iv = ${accessTokenEnc.iv},
        qb_access_token_auth_tag = ${accessTokenEnc.authTag},
        qb_refresh_token_encrypted = ${refreshTokenEnc.encrypted},
        qb_refresh_token_iv = ${refreshTokenEnc.iv},
        qb_refresh_token_auth_tag = ${refreshTokenEnc.authTag},
        qb_token_iv = NULL,
        qb_token_auth_tag = NULL
      WHERE id = ${userId}
    `);

    await this.logAction(
      userId,
      'token_migration',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Migrated from legacy shared IV/authTag to separate fields'
    );
    console.log(
      `[QB Migration] Successfully migrated user ${userId} to new token encryption format`
    );
  }

  async getValidAccessToken(userId: string): Promise<{ token: string; realmId: string } | null> {
    await this.migrateUserTokensIfNeeded(userId);

    const creds = await this.getUserQBCredentials(userId);
    if (!creds || !creds.connected || !creds.accessToken) {
      return null;
    }

    if (creds.expiresAt && new Date() >= creds.expiresAt) {
      const refreshed = await this.refreshUserTokens(userId);
      if (!refreshed) return null;
      return { token: refreshed.accessToken, realmId: creds.realmId! };
    }

    return { token: creds.accessToken, realmId: creds.realmId! };
  }

  async checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const today = new Date().toISOString().split('T')[0];

    const result = await db
      .select({
        qbApiCallsToday: users.qbApiCallsToday,
        qbDailyResetAt: users.qbDailyResetAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length) {
      return { allowed: false, remaining: 0 };
    }

    const user = result[0];
    const resetDate = user.qbDailyResetAt;

    if (!resetDate || resetDate !== today) {
      await db
        .update(users)
        .set({
          qbApiCallsToday: 0,
          qbDailyResetAt: today,
        })
        .where(eq(users.id, userId));
      return { allowed: true, remaining: QB_API_LIMIT_PER_DAY };
    }

    const remaining = QB_API_LIMIT_PER_DAY - (user.qbApiCallsToday || 0);
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
    };
  }

  async incrementApiCallCount(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        qbApiCallsToday: sql`COALESCE(${users.qbApiCallsToday}, 0) + 1`,
      })
      .where(eq(users.id, userId));
  }

  async disconnectUser(userId: string, reason?: string): Promise<void> {
    await db
      .update(users)
      .set({
        qbAccessTokenEncrypted: null,
        qbAccessTokenIv: null,
        qbAccessTokenAuthTag: null,
        qbRefreshTokenEncrypted: null,
        qbRefreshTokenIv: null,
        qbRefreshTokenAuthTag: null,
        qbTokenExpiresAt: null,
        qbConnected: false,
        qbScopes: null,
      })
      .where(eq(users.id, userId));

    await this.logAction(
      userId,
      'disconnect',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      reason
    );
  }

  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    companyName: string | null;
    connectedAt: Date | null;
    lastSyncAt: Date | null;
    apiCallsRemaining: number;
  }> {
    const result = await db
      .select({
        qbConnected: users.qbConnected,
        qbCompanyName: users.qbCompanyName,
        qbConnectedAt: users.qbConnectedAt,
        qbLastSyncAt: users.qbLastSyncAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result.length) {
      return {
        connected: false,
        companyName: null,
        connectedAt: null,
        lastSyncAt: null,
        apiCallsRemaining: 0,
      };
    }

    const user = result[0];
    const rateLimit = await this.checkRateLimit(userId);

    return {
      connected: user.qbConnected,
      companyName: user.qbCompanyName,
      connectedAt: user.qbConnectedAt,
      lastSyncAt: user.qbLastSyncAt,
      apiCallsRemaining: rateLimit.remaining,
    };
  }

  async logAction(
    userId: string,
    action: string,
    entityType?: string,
    entityId?: string,
    method?: string,
    path?: string,
    status?: number,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await db.insert(quickbooksSyncLog).values({
      userId,
      action,
      qbEntityType: entityType || null,
      qbEntityId: entityId || null,
      requestMethod: method || null,
      requestPath: path || null,
      responseStatus: status || null,
      errorMessage: errorMessage || null,
      metadata: metadata || null,
    });
  }

  async fetchCompanyInfo(
    accessToken: string,
    realmId: string
  ): Promise<{ companyName: string } | null> {
    try {
      const baseUrl =
        this.environment === 'sandbox'
          ? 'https://sandbox-quickbooks.api.intuit.com'
          : 'https://quickbooks.api.intuit.com';

      // Validate realmId is a pure numeric Intuit ID (prevents SSRF path traversal)
      if (!/^\d{1,30}$/.test(realmId)) {
        console.error('[QB] Invalid realmId format — request blocked');
        return null;
      }

      const response = await fetch(`${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) return null;

      const data = await response.json();
      return { companyName: data.CompanyInfo?.CompanyName || 'Unknown Company' };
    } catch (error) {
      return null;
    }
  }

  validateState(state: string): { userId: string; timestamp: number } | null {
    const decoded = decryptState(state);
    if (!decoded) return null;

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (decoded.timestamp < fiveMinutesAgo) {
      return null;
    }

    return decoded;
  }
}

export const quickBooksService = new QuickBooksService();
