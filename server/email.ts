// Email service using SendGrid integration
import sgMail from '@sendgrid/mail';
import { getBaseUrl } from './lib/baseUrl';

const ADMIN_EMAIL = "nedpearson@gmail.com";
const DEFAULT_FROM_EMAIL = "noreply@divorceledger.live";

/**
 * Get SendGrid credentials from environment
 * Supports both direct API key and Replit connectors (for backward compatibility)
 */
async function getCredentials() {
  // Try direct environment variable first (Railway, standard deployment)
  const directApiKey = process.env.SENDGRID_API_KEY;
  const directFromEmail = process.env.SENDGRID_FROM_EMAIL || DEFAULT_FROM_EMAIL;
  
  if (directApiKey) {
    return { apiKey: directApiKey, email: directFromEmail };
  }

  // Fallback to Replit connectors if available (backward compatibility)
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (hostname && xReplitToken) {
    try {
      const response = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      );
      const data = await response.json();
      const connectionSettings = data.items?.[0];

      if (connectionSettings?.settings?.api_key && connectionSettings?.settings?.from_email) {
        return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
      }
    } catch (error) {
      console.warn('[Email] Replit connector failed:', error);
    }
  }

  throw new Error('SendGrid not configured. Set SENDGRID_API_KEY environment variable.');
}

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export async function sendWelcomeEmail(userEmail: string, fullName: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    const msg = {
      to: userEmail,
      from: fromEmail,
      bcc: ADMIN_EMAIL,
      subject: 'Welcome to Divorce Ledger',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a2e;">Welcome to Divorce Ledger, ${fullName}!</h1>
          <p>Thank you for creating your account. You now have access to our forensic financial analysis and legal case management platform.</p>
          <h3>Getting Started:</h3>
          <ul>
            <li><strong>Documents:</strong> Upload and analyze financial documents with AI assistance</li>
            <li><strong>Violations:</strong> Track and document court order violations</li>
            <li><strong>Finances:</strong> Manage income, expenses, assets, and debts</li>
            <li><strong>Case Builder:</strong> Generate court-ready summaries and timelines</li>
          </ul>
          <p>If you have any questions, please don't hesitate to reach out.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            &copy; Divorce Ledger - Forensic Financial & Legal Case Management
          </p>
        </div>
      `
    };

    await client.send(msg);
    console.log(`Welcome email sent to ${userEmail} (BCC: ${ADMIN_EMAIL})`);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    throw error;
  }
}

export async function sendPasswordResetEmail(userEmail: string, fullName: string, resetToken: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    const baseUrl = getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const msg = {
      to: userEmail,
      from: fromEmail,
      bcc: ADMIN_EMAIL,
      subject: 'Reset Your Divorce Ledger Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a2e;">Password Reset Request</h1>
          <p>Hi ${fullName},</p>
          <p>We received a request to reset your Divorce Ledger password. Click the button below to create a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #1a1a2e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
          <p style="color: #666;">This link will expire in 1 hour for security reasons.</p>
          <p style="color: #666;">If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            &copy; Divorce Ledger - Forensic Financial & Legal Case Management
          </p>
        </div>
      `
    };

    await client.send(msg);
    console.log(`Password reset email sent to ${userEmail} (BCC: ${ADMIN_EMAIL})`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}
