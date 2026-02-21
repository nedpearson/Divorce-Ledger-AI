import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { logger as appLogger } from '../logging/logger.js';
import { ValidationError } from '../errors/AppError.js';

type AuditAction =
  | 'user_login'
  | 'user_logout'
  | 'user_signup'
  | 'document_uploaded'
  | 'document_viewed'
  | 'document_updated'
  | 'document_deleted'
  | 'classification_created'
  | 'classification_updated'
  | 'integration_created'
  | 'integration_updated'
  | 'integration_deleted'
  | 'settings_updated'
  | 'password_changed'
  | 'export_created';

type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

interface AuditLogEntry {
  user_id: string;
  action: AuditAction;
  resource_type?: string;
  resource_id?: string;
  severity: AuditSeverity;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<any> {
    const { user_id, action, resource_type, resource_id, severity, ip_address, user_agent, metadata } = entry;

    const { data, error } = await supabaseServiceRole
      .from('audit_logs')
      .insert({
        user_id,
        action,
        resource_type,
        resource_id,
        severity,
        ip_address,
        user_agent,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      appLogger.error({ entry, error }, 'Failed to create audit log');
      // Don't throw - audit logging should not break the main flow
      return null;
    }

    appLogger.debug({ auditId: data.id, action, userId: user_id }, 'Audit log created');

    return data;
  }

  /**
   * Get audit logs for a user
   */
  async getUserAuditLogs(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: AuditAction;
      severity?: AuditSeverity;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<any[]> {
    const { limit = 50, offset = 0, action, severity, startDate, endDate } = options;

    let query = supabaseServiceRole
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq('action', action);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      appLogger.error({ userId, error }, 'Failed to fetch audit logs');
      throw new ValidationError('Failed to fetch audit logs', { originalError: error });
    }

    return data || [];
  }

  /**
   * Get audit log statistics for a user
   */
  async getUserAuditStats(userId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabaseServiceRole
      .from('audit_logs')
      .select('action, severity')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      appLogger.error({ userId, error }, 'Failed to fetch audit stats');
      throw new ValidationError('Failed to fetch audit stats', { originalError: error });
    }

    // Aggregate stats
    const stats = {
      total: data?.length || 0,
      by_action: {} as Record<string, number>,
      by_severity: {} as Record<string, number>,
    };

    data?.forEach((log) => {
      stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;
      stats.by_severity[log.severity] = (stats.by_severity[log.severity] || 0) + 1;
    });

    return stats;
  }

  /**
   * Search audit logs (admin only)
   */
  async searchAuditLogs(
    searchParams: {
      userId?: string;
      action?: AuditAction;
      resourceType?: string;
      resourceId?: string;
      severity?: AuditSeverity;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    const { userId, action, resourceType, resourceId, severity, startDate, endDate, limit = 100, offset = 0 } = searchParams;

    let query = supabaseServiceRole
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (action) {
      query = query.eq('action', action);
    }

    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    if (resourceId) {
      query = query.eq('resource_id', resourceId);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      appLogger.error({ searchParams, error }, 'Failed to search audit logs');
      throw new ValidationError('Failed to search audit logs', { originalError: error });
    }

    return data || [];
  }

  /**
   * Delete old audit logs (retention policy enforcement)
   */
  async cleanupOldAuditLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = await supabaseServiceRole
      .from('audit_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      appLogger.error({ retentionDays, error }, 'Failed to cleanup old audit logs');
      throw new ValidationError('Failed to cleanup old audit logs', { originalError: error });
    }

    const deletedCount = data?.length || 0;
    appLogger.info({ retentionDays, deletedCount }, 'Old audit logs cleaned up');

    return deletedCount;
  }

  /**
   * Log user login
   */
  async logUserLogin(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'user_login',
      severity: 'info',
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * Log user logout
   */
  async logUserLogout(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'user_logout',
      severity: 'info',
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * Log document action
   */
  async logDocumentAction(
    userId: string,
    documentId: string,
    action: 'document_uploaded' | 'document_viewed' | 'document_updated' | 'document_deleted',
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action,
      resource_type: 'document',
      resource_id: documentId,
      severity: action === 'document_deleted' ? 'warning' : 'info',
      metadata,
    });
  }
}

export const auditService = new AuditService();
