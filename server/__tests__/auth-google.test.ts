// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { GoogleAuthService } from '../services/auth.google.service';

describe('Google Authentication Service', () => {
  it('should explicitly fail isConfigured() if environment tokens are absent', () => {
    // Ensuring the environment strictly prevents half-configured leaks
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = '';
    
    const unconfiguredService = new GoogleAuthService();
    expect(unconfiguredService.isConfigured()).toBe(false);
    
    // Restore
    process.env.GOOGLE_CLIENT_ID = originalClientId;
  });

  it('should dynamically inject the Anti-CSRF state nonce into the OAuth authorization URL', () => {
    // Generate mock env context to bypass the configured check natively
    process.env.GOOGLE_CLIENT_ID = 'mock-id';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost/callback';
    
    const configuredService = new GoogleAuthService();
    const mockState = 'random-cryptographic-nonce';
    const authUrl = configuredService.generateAuthUrl(mockState);
    
    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain(`state=${mockState}`);
    expect(authUrl).toContain('scope=openid+email+profile'); // Verification of hardcoded minimalist scopes
    expect(authUrl).toContain(`client_id=mock-id`);
  });
});
