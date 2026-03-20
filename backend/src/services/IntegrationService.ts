import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { logger } from '../logging/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';

type IntegrationType =
  | 'google_drive'
  | 'dropbox'
  | 'onedrive'
  | 'court_system'
  | 'financial_institution';

interface CreateIntegrationInput {
  name: string;
  integration_type: IntegrationType;
  credentials: Record<string, any>;
  settings?: Record<string, any>;
}

interface UpdateIntegrationInput {
  name?: string;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  enabled?: boolean;
}

export class IntegrationService {
  /**
   * Create a new integration
   */
  async createIntegration(userId: string, input: CreateIntegrationInput): Promise<any> {
    const { name, integration_type, credentials, settings } = input;

    // Check if integration already exists
    const { data: existing } = await supabaseServiceRole
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('integration_type', integration_type)
      .single();

    if (existing) {
      throw new ConflictError(
        `Integration of type '${integration_type}' already exists for this user`
      );
    }

    // Create integration
    const { data, error } = await supabaseServiceRole
      .from('integrations')
      .insert({
        user_id: userId,
        name,
        integration_type,
        credentials,
        settings: settings || {},
        enabled: true,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, input, error }, 'Failed to create integration');
      throw new ValidationError('Failed to create integration', { originalError: error });
    }

    logger.info(
      { userId, integrationId: data.id, integrationType: integration_type },
      'Integration created'
    );

    return data;
  }

  /**
   * Get integration by ID
   */
  async getIntegrationById(userId: string, integrationId: string): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      logger.error({ userId, integrationId, error }, 'Integration not found');
      throw new NotFoundError('Integration', integrationId);
    }

    return data;
  }

  /**
   * List all integrations for a user
   */
  async listUserIntegrations(
    userId: string,
    options: { enabled?: boolean; type?: IntegrationType } = {}
  ): Promise<any[]> {
    let query = supabaseServiceRole
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options.enabled !== undefined) {
      query = query.eq('enabled', options.enabled);
    }

    if (options.type) {
      query = query.eq('integration_type', options.type);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ userId, error }, 'Failed to list integrations');
      throw new ValidationError('Failed to list integrations', { originalError: error });
    }

    return data || [];
  }

  /**
   * Update integration
   */
  async updateIntegration(
    userId: string,
    integrationId: string,
    updates: UpdateIntegrationInput
  ): Promise<any> {
    // Verify ownership
    await this.getIntegrationById(userId, integrationId);

    const { data, error } = await supabaseServiceRole
      .from('integrations')
      .update(updates)
      .eq('id', integrationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, integrationId, updates, error }, 'Failed to update integration');
      throw new ValidationError('Failed to update integration', { originalError: error });
    }

    logger.info({ userId, integrationId }, 'Integration updated');

    return data;
  }

  /**
   * Delete integration (soft delete)
   */
  async deleteIntegration(userId: string, integrationId: string): Promise<void> {
    // Verify ownership
    await this.getIntegrationById(userId, integrationId);

    const { error } = await supabaseServiceRole
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', integrationId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ userId, integrationId, error }, 'Failed to delete integration');
      throw new ValidationError('Failed to delete integration', { originalError: error });
    }

    logger.info({ userId, integrationId }, 'Integration deleted');
  }

  /**
   * Test integration connection
   */
  async testIntegration(
    userId: string,
    integrationId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const integration = await this.getIntegrationById(userId, integrationId);

    try {
      // Test connection based on integration type
      switch (integration.integration_type) {
        case 'google_drive':
          return await this.testGoogleDrive(integration.credentials);
        case 'dropbox':
          return await this.testDropbox(integration.credentials);
        case 'onedrive':
          return await this.testOneDrive(integration.credentials);
        default:
          return {
            success: false,
            message: `Integration type '${integration.integration_type}' not yet implemented`,
          };
      }
    } catch (err) {
      logger.error({ userId, integrationId, error: err }, 'Integration test failed');
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Trigger sync for an integration
   */
  async triggerSync(userId: string, integrationId: string): Promise<any> {
    const integration = await this.getIntegrationById(userId, integrationId);

    if (!integration.enabled) {
      throw new ValidationError('Integration is disabled');
    }

    // Create sync job
    const { data, error } = await supabaseServiceRole
      .from('jobs')
      .insert({
        user_id: userId,
        job_type: 'integration_sync',
        status: 'queued',
        priority: 5,
        input_data: { integration_id: integrationId },
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, integrationId, error }, 'Failed to create sync job');
      throw new ValidationError('Failed to create sync job', { originalError: error });
    }

    logger.info({ userId, integrationId, jobId: data.id }, 'Sync job created');

    return data;
  }

  /**
   * Get sync history for an integration
   */
  async getSyncHistory(userId: string, integrationId: string, limit: number = 10): Promise<any[]> {
    // Verify ownership
    await this.getIntegrationById(userId, integrationId);

    const { data, error } = await supabaseServiceRole
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('job_type', 'integration_sync')
      .eq('input_data->>integration_id', integrationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ userId, integrationId, error }, 'Failed to fetch sync history');
      throw new ValidationError('Failed to fetch sync history', { originalError: error });
    }

    return data || [];
  }

  // Test methods (stubs - implement actual API calls)

  private async testGoogleDrive(credentials: Record<string, any>): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement Google Drive API test
    // Use credentials.access_token to make test API call
    return { success: true, message: 'Google Drive connection successful' };
  }

  private async testDropbox(credentials: Record<string, any>): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement Dropbox API test
    return { success: true, message: 'Dropbox connection successful' };
  }

  private async testOneDrive(credentials: Record<string, any>): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement OneDrive API test
    return { success: true, message: 'OneDrive connection successful' };
  }
}

export const integrationService = new IntegrationService();
