import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error('CRITICAL: SESSION_SECRET or ADMIN_SECRET required for encryption');
  }
  return crypto.scryptSync(secret, 'qb-token-salt', 32);
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  if (!encrypted || !encrypted.includes(':')) return encrypted;
  
  try {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
    
    if (!ivHex || !authTagHex || !ciphertext) {
      return encrypted;
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Token decryption failed:', error);
    return encrypted;
  }
}

export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === IV_LENGTH * 2;
}

// QB-specific encryption with separate IV and auth tag for database storage
export interface QBEncryptedToken {
  encrypted: string;
  iv: string;
  authTag: string;
}

export function encryptQBToken(plaintext: string): QBEncryptedToken {
  if (!plaintext) {
    return { encrypted: '', iv: '', authTag: '' };
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decryptQBToken(encrypted: string, iv: string, authTag: string): string {
  if (!encrypted || !iv || !authTag) {
    return '';
  }
  
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTagBuffer);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('QB token decryption failed');
    return '';
  }
}

// Encrypt OAuth state for security
export function encryptState(userId: string): string {
  const payload = JSON.stringify({ userId, timestamp: Date.now() });
  return encryptToken(payload);
}

export function decryptState(state: string): { userId: string; timestamp: number } | null {
  try {
    const decrypted = decryptToken(state);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}
