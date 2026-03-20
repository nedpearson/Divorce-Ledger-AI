import twilio from 'twilio';
import { createHash, randomInt } from 'crypto';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: twilio.Twilio | null = null;

export function isTwilioConfigured(): boolean {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
}

function getClient(): twilio.Twilio {
  if (!twilioClient) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export function generateVerificationCode(): string {
  return String(randomInt(100000, 999999));
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function maskPhoneNumber(phone: string): string {
  if (phone.length < 6) return '***';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

export interface SendSmsResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  errorCode?: string;
}

export async function sendVerificationSms(
  toPhoneNumber: string,
  code: string
): Promise<SendSmsResult> {
  if (!isTwilioConfigured()) {
    console.log(
      `[SMS] Twilio not configured. Would send code ${code} to ${maskPhoneNumber(toPhoneNumber)}`
    );
    return { success: true, messageSid: 'demo-mode' };
  }

  try {
    const client = getClient();
    const message = await client.messages.create({
      body: `Your Divorce Ledger verification code is: ${code}. This code expires in 10 minutes. Do not share this code with anyone.`,
      from: TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
    });

    console.log(
      `[SMS] Sent verification to ${maskPhoneNumber(toPhoneNumber)}, SID: ${message.sid}`
    );
    return { success: true, messageSid: message.sid };
  } catch (error: any) {
    console.error(`[SMS] Failed to send to ${maskPhoneNumber(toPhoneNumber)}:`, error.message);
    return {
      success: false,
      error: error.message,
      errorCode: error.code?.toString(),
    };
  }
}

export async function sendLoginAlertSms(
  toPhoneNumber: string,
  deviceInfo: string,
  location: string
): Promise<SendSmsResult> {
  if (!isTwilioConfigured()) {
    console.log(`[SMS] Login alert would be sent to ${maskPhoneNumber(toPhoneNumber)}`);
    return { success: true, messageSid: 'demo-mode' };
  }

  try {
    const client = getClient();
    const message = await client.messages.create({
      body: `Divorce Ledger: New login detected on ${deviceInfo} from ${location}. If this wasn't you, change your password immediately.`,
      from: TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
    });

    return { success: true, messageSid: message.sid };
  } catch (error: any) {
    console.error(`[SMS] Failed to send login alert:`, error.message);
    return {
      success: false,
      error: error.message,
      errorCode: error.code?.toString(),
    };
  }
}

export function parseUserAgent(ua: string): {
  browser: string;
  platform: string;
  deviceName: string;
} {
  let browser = 'Unknown Browser';
  let platform = 'Unknown Platform';

  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  if (ua.includes('Windows')) platform = 'Windows';
  else if (ua.includes('Mac OS')) platform = 'MacOS';
  else if (ua.includes('iPhone')) platform = 'iPhone';
  else if (ua.includes('iPad')) platform = 'iPad';
  else if (ua.includes('Android')) platform = 'Android';
  else if (ua.includes('Linux')) platform = 'Linux';

  const deviceName = `${browser} on ${platform}`;
  return { browser, platform, deviceName };
}

export function hashFingerprint(components: string): string {
  return createHash('sha256').update(components).digest('hex');
}
