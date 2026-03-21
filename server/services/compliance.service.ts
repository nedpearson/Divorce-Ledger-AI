import { db } from '../db';
import { users, securityAlerts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export class ComplianceService {
  private interval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60000; // Check every minute (can be adjusted)

  constructor() {}

  public start() {
    console.log('[Compliance Agent] Service started. Monitoring for security and privacy risks.');
    this.runChecks(); // Run immediately

    this.interval = setInterval(() => {
      this.runChecks();
    }, this.CHECK_INTERVAL_MS);
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runChecks() {
    try {
      await this.checkAdminsWithout2FA();
      await this.checkWorkspaceDataIsolation();
      await this.detectAnomalousTraffic();
    } catch (err) {
      console.error('[Compliance Agent] Error during continuous checks:', err);
    }
  }

  private async checkAdminsWithout2FA() {
    // Audit for admins that do not have 2FA enabled
    const admins = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'));

    for (const admin of admins) {
      // In a real scenario, we might have a robust 2FA system.
      // We simulate reading a property or checking auth mechanisms here.
      // If we see missing MFA flags or weak credentials:
      const has2FA = !!admin.twoFactorEnabled; 
      
      if (!has2FA) {
        await this.createOrUpdateAlert(
          admin.id,
          '2FA_MISSING',
          'high',
          'Admin account lacks Two-Factor Authentication (2FA). Fix immediately to comply with data security standards.'
        );
      }
    }
  }

  private async checkWorkspaceDataIsolation() {
    // Check if there are any users mapped to an invalid workspace, risking cross-tenant data.
    // For demo purposes, we'll flag 'demo-firm-admin' user as needing isolation checks if workspaceId is missing or default.
    const riskyUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, 'demo-firm-admin')); // In production, query those with cross-workspace permissions.

    for (const user of riskyUsers) {
      // If there's an isolation concern:
      if (user.environment === 'demo') {
        await this.createOrUpdateAlert(
          user.id,
          'DATA_ISOLATION',
          'critical',
          `User ${user.email} lacks strict workspace isolation binding. High risk of cross-tenant data exposure.`
        );
      }
    }
  }

  private async detectAnomalousTraffic() {
     // A mock check representing log inspection for abnormal API access.
     // Could be tied to actual analytics data.
  }

  private async createOrUpdateAlert(userId: string, type: string, severity: string, message: string) {
    // Check if an unresolved alert of this type already exists for this user
    const existing = await db
      .select()
      .from(securityAlerts)
      .where(and(
         eq(securityAlerts.userId, userId),
         eq(securityAlerts.type, type),
         eq(securityAlerts.isResolved, false)
      ))
      .limit(1);

    if (existing.length === 0) {
      console.log(`[Compliance Agent] Generating ${severity} alert for user ${userId}: ${type}`);
      await db.insert(securityAlerts).values({
        userId,
        type,
        severity,
        message,
        isResolved: false
      });
    }
  }
}

export const complianceService = new ComplianceService();
