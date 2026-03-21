import { db } from '../../db';
import { users, integrationConnections, driveTransferAudits, driveFolderBindings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export class GoogleDriveService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly appSecretKey: string; 

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    // We use a dedicated callback for the integration flow to avoid merging constraints with login auth 
    this.redirectUri = process.env.GOOGLE_DRIVE_CALLBACK_URL || 'http://localhost:5000/api/integrations/google-drive/callback';
    this.appSecretKey = process.env.SESSION_SECRET || 'fallback-secret-for-drive-encryption-12345678901234567890123456789012'; 
  }

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.appSecretKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = parts.join(':');
    const key = crypto.scryptSync(this.appSecretKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      // Strict constraint to drive.file only per instructions
      scope: 'https://www.googleapis.com/auth/drive.file email profile',
      state: state,
      access_type: 'offline', 
      prompt: 'consent' // Force consent to guarantee refresh token is issued
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange Google Drive token.');
    }

    return response.json();
  }

  async getUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch user email bound to Drive token');
    return response.json();
  }

  async connectIntegration(userId: string, code: string): Promise<void> {
    const tokens = await this.exchangeCodeForToken(code);
    const userInfo = await this.getUserInfo(tokens.access_token);
    
    // Calculate expiry 
    const expiry = new Date();
    expiry.setSeconds(expiry.getSeconds() + tokens.expires_in);

    // Upsert the integration connection for 'drive'
    const existingConnection = await db.query.integrationConnections.findFirst({
        where: and(eq(integrationConnections.userId, userId), eq(integrationConnections.integrationType, 'drive'))
    });

    const payload = {
        userId,
        provider: 'google',
        integrationType: 'drive',
        externalAccountId: userInfo.email,
        displayName: userInfo.name,
        grantedScopes: ['drive.file'],
        accessTokenEncrypted: this.encrypt(tokens.access_token),
        refreshTokenEncrypted: tokens.refresh_token ? this.encrypt(tokens.refresh_token) : existingConnection?.refreshTokenEncrypted,
        tokenExpiryAt: expiry,
        updatedAt: new Date()
    };

    if (existingConnection) {
        await db.update(integrationConnections).set(payload).where(eq(integrationConnections.id, existingConnection.id));
    } else {
        await db.insert(integrationConnections).values(payload as any);
    }
  }

  async disconnectIntegration(userId: string): Promise<void> {
    const connection = await db.query.integrationConnections.findFirst({
        where: and(eq(integrationConnections.userId, userId), eq(integrationConnections.integrationType, 'drive'))
    });

    if (connection) {
        if (connection.accessTokenEncrypted) {
           const token = this.decrypt(connection.accessTokenEncrypted);
           // Attempt to proactively revoke it using google's endpoint
           try {
             await fetch('https://oauth2.googleapis.com/revoke', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                 body: new URLSearchParams({ token })
             });
           } catch(e) { } // Ignore failures, we will delete locally regardless
        }
        await db.delete(integrationConnections).where(eq(integrationConnections.id, connection.id));
        await db.delete(driveFolderBindings).where(eq(driveFolderBindings.integrationConnectionId, connection.id));
    }
  }

  async logTransferAudit(params: {
      userId: string;
      integrationConnectionId: string;
      direction: 'export' | 'import';
      fileName: string;
      action: string;
      status: string;
      errorMessage?: string;
  }) {
      await db.insert(driveTransferAudits).values({
          userId: params.userId,
          integrationConnectionId: params.integrationConnectionId,
          direction: params.direction,
          fileName: params.fileName,
          action: params.action,
          status: params.status,
          redactedErrorMessage: params.errorMessage?.substring(0, 255) || null
      });
  }

  // ----------------------------------------------------
  // Drive API REST Proxies
  // ----------------------------------------------------
  private async getValidToken(userId: string): Promise<string> {
    const connection = await db.query.integrationConnections.findFirst({
        where: and(eq(integrationConnections.userId, userId), eq(integrationConnections.integrationType, 'drive'))
    });

    if (!connection || !connection.accessTokenEncrypted) {
        throw new Error('Google Drive is not connected.');
    }

    if (connection.tokenExpiryAt && new Date() >= connection.tokenExpiryAt) {
        // Implement refresh logic if offline refresh tokens are supported
        if (!connection.refreshTokenEncrypted) throw new Error('Google Drive token expired and no refresh token available.');
        
        try {
            const refreshToken = this.decrypt(connection.refreshTokenEncrypted);
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token'
                })
            });

            if (!refreshRes.ok) throw new Error('Drive token refresh denied.');
            const data = await refreshRes.json();
            
            const expiry = new Date();
            expiry.setSeconds(expiry.getSeconds() + data.expires_in);

            const newAccessTokenEnc = this.encrypt(data.access_token);
            await db.update(integrationConnections)
                .set({ accessTokenEncrypted: newAccessTokenEnc, tokenExpiryAt: expiry, updatedAt: new Date() })
                .where(eq(integrationConnections.id, connection.id));

            return data.access_token;
        } catch (e: any) {
            throw new Error(`Google Drive token refresh failed: ${e.message}`);
        }
    }

    return this.decrypt(connection.accessTokenEncrypted);
  }

  async findOrCreateDedicatedFolder(userId: string, folderName: string = 'Divorce Ledger'): Promise<string> {
      const accessToken = await this.getValidToken(userId);

      // Search for folder by name where it is explicitly owned and not trashed
      const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!searchRes.ok) throw new Error('Failed to query Google Drive directories.');
      const searchData = await searchRes.json();
      
      if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
      }

      // Create physical folder
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder'
          })
      });

      if (!createRes.ok) {
          throw new Error('Could not create dedicated Divorce Ledger folder on Google Drive.');
      }

      const folderData = await createRes.json();
      return folderData.id;
  }

  async uploadFile(userId: string, fileBuffer: Buffer, fileName: string, mimeType: string, parentFolderId?: string): Promise<{ id: string, name: string }> {
      const accessToken = await this.getValidToken(userId);
      
      const boundary = 'foo_bar_baz';
      const metadata = {
          name: fileName,
          parents: parentFolderId ? [parentFolderId] : []
      };

      const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
          Buffer.from(JSON.stringify(metadata) + '\r\n'),
          Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
          fileBuffer,
          Buffer.from(`\r\n--${boundary}--`)
      ]);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
              'Content-Length': multipartBody.length.toString()
          },
          body: multipartBody
      });

      if (!uploadRes.ok) {
          const text = await uploadRes.text();
          throw new Error('Failed to upload file to Google Drive.');
      }

      return uploadRes.json();
  }

  async downloadFile(userId: string, fileId: string): Promise<{ buffer: Buffer, mimeType: string, name: string }> {
      const accessToken = await this.getValidToken(userId);
      
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`, {
          headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!metaRes.ok) throw new Error('Failed to retrieve file metadata from Google Drive.');
      const metadata = await metaRes.json();

      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!contentRes.ok) throw new Error('Failed to download file content from Google Drive (Google Workspace formats are unsupported without manual export).');
      
      const arrayBuffer = await contentRes.arrayBuffer();
      return {
          buffer: Buffer.from(arrayBuffer),
          mimeType: metadata.mimeType,
          name: metadata.name
      };
  }
}

export const googleDriveService = new GoogleDriveService();
