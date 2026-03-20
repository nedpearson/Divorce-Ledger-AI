import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface AuditLogRequest {
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      user_id,
      action,
      resource_type,
      resource_id,
      metadata = {},
      ip_address,
      user_agent,
      severity = 'info',
    }: AuditLogRequest = await req.json();

    // Validate required fields
    if (!action || !resource_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: action, resource_type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Extract IP and user agent from request if not provided
    const finalIpAddress =
      ip_address || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const finalUserAgent = user_agent || req.headers.get('user-agent') || 'unknown';

    console.log(
      `Logging audit event: ${action} on ${resource_type} by user ${user_id || 'system'}`
    );

    // Insert audit log
    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: user_id || null,
        action,
        resource_type,
        resource_id: resource_id || null,
        metadata: {
          ...metadata,
          ip_address: finalIpAddress,
          user_agent: finalUserAgent,
          timestamp: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert audit log: ${error.message}`);
    }

    console.log(`Audit log created: ${data.id}`);

    // Send webhooks for critical events
    if (severity === 'critical' || shouldTriggerWebhook(action)) {
      await sendWebhookNotifications(data, supabase);
    }

    return new Response(
      JSON.stringify({
        success: true,
        audit_log_id: data.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error creating audit log:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Determine if action should trigger webhook notifications
 */
function shouldTriggerWebhook(action: string): boolean {
  const webhookActions = [
    'user.delete',
    'document.delete_permanent',
    'classification.failed',
    'upload.failed',
    'auth.failed_login_attempts',
    'integration.disconnected',
    'subscription.cancelled',
    'payment.failed',
  ];

  return webhookActions.includes(action);
}

/**
 * Send webhook notifications for critical events
 */
async function sendWebhookNotifications(auditLog: any, supabase: any): Promise<void> {
  try {
    // Get configured webhooks (in production, store webhooks in database)
    const webhookUrl = Deno.env.get('WEBHOOK_URL');
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');

    if (webhookUrl) {
      console.log('Sending webhook notification to:', webhookUrl);

      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'audit.critical',
          data: auditLog,
        }),
      });
    }

    if (slackWebhookUrl) {
      console.log('Sending Slack notification');

      const slackMessage = {
        text: `🚨 Critical Audit Event`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 Critical Audit Event',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Action:*\n${auditLog.action}`,
              },
              {
                type: 'mrkdwn',
                text: `*Resource:*\n${auditLog.resource_type}`,
              },
              {
                type: 'mrkdwn',
                text: `*User:*\n${auditLog.user_id || 'System'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${new Date(auditLog.created_at).toLocaleString()}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Metadata:*\n\`\`\`${JSON.stringify(auditLog.metadata, null, 2)}\`\`\``,
            },
          },
        ],
      };

      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      });
    }

    // Send email notifications for critical events (optional)
    if (auditLog.user_id) {
      await sendEmailNotification(auditLog, supabase);
    }
  } catch (error) {
    console.error('Error sending webhook notifications:', error);
    // Don't throw - webhook failures shouldn't prevent audit logging
  }
}

/**
 * Send email notification for critical events
 */
async function sendEmailNotification(auditLog: any, supabase: any): Promise<void> {
  try {
    // Get user email
    const { data: userData } = await supabase.auth.admin.getUserById(auditLog.user_id);

    if (!userData?.user?.email) {
      return;
    }

    // In production, integrate with email service (SendGrid, Mailgun, etc.)
    console.log(`Would send email notification to: ${userData.user.email}`);

    // Example: Using Supabase Edge Function to send email
    // await supabase.functions.invoke('send-email', {
    //   body: {
    //     to: userData.user.email,
    //     subject: `Critical Alert: ${auditLog.action}`,
    //     body: `A critical action was performed on your account: ${auditLog.action}`,
    //   },
    // });
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
}
