# Supabase Auth Configuration

## Dashboard Settings

### 1. Enable Auth Providers

Navigate to **Authentication → Providers** in Supabase Dashboard:

#### Email/Password

- ✅ **Enabled**: Yes
- **Confirm Email**: Required
- **Double Confirm Email Change**: Yes
- **Secure Email Change**: Yes
- **Minimum Password Length**: 8 characters

#### Google OAuth

- ✅ **Enabled**: Yes
- **Client ID**: `{YOUR_GOOGLE_OAUTH_CLIENT_ID}`
- **Client Secret**: `{YOUR_GOOGLE_OAUTH_CLIENT_SECRET}`
- **Authorized Redirect URIs**:
  - Local Dev: `http://localhost:3000/auth/callback`
  - Production: `https://app.divorcedger.com/auth/callback` _(replace with your Railway domain)_

#### GitHub OAuth

- ✅ **Enabled**: Yes
- **Client ID**: `{YOUR_GITHUB_OAUTH_CLIENT_ID}`
- **Client Secret**: `{YOUR_GITHUB_OAUTH_CLIENT_SECRET}`
- **Authorized Redirect URIs**:
  - Local Dev: `http://localhost:3000/auth/callback`
  - Production: `https://app.divorcedger.com/auth/callback` _(replace with your Railway domain)_

### 2. Site URL Configuration

Navigate to **Authentication → URL Configuration**:

- **Site URL** (Production): `https://app.divorcedger.com` _(replace with your Railway frontend URL)_
- **Redirect URLs** (allowed):
  ```
  http://localhost:3000/**
  http://localhost:3001/**
  https://app.divorcedger.com/**
  https://*.railway.app/**
  ```

### 3. Email Templates

Navigate to **Authentication → Email Templates**:

#### Confirm Signup

```html
<h2>Confirm Your Email</h2>
<p>Thank you for signing up to Divorce Ledger AI!</p>
<p>Click the link below to confirm your email address:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm Email</a></p>
<p>This link expires in 24 hours.</p>
```

#### Reset Password

```html
<h2>Reset Your Password</h2>
<p>We received a request to reset your password.</p>
<p>Click the link below to reset it:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>This link expires in 1 hour.</p>
```

#### Change Email

```html
<h2>Confirm Email Change</h2>
<p>Click the link below to confirm your new email address:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm New Email</a></p>
<p>This link expires in 24 hours.</p>
```

### 4. JWT Settings

Navigate to **Settings → API**:

- **JWT Expiry**: 3600 seconds (1 hour)
- **Refresh Token Rotation**: Enabled
- **Reuse Interval**: 10 seconds

## Frontend Auth Implementation

### Login Flow

```typescript
// 1. User submits email + password
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
});

// 2. On success, session is automatically stored
if (data.session) {
  // Redirect to dashboard
  router.push('/dashboard');
}
```

### Signup Flow

```typescript
// 1. User submits registration form
const { data, error } = await supabase.auth.signUp({
  email: 'newuser@example.com',
  password: 'securepassword',
  options: {
    data: {
      full_name: 'John Doe',
      avatar_url: '',
    },
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});

// 2. User receives confirmation email
// 3. They click link, redirected to /auth/callback
// 4. Frontend exchanges code for session
```

### OAuth Flow (Google/GitHub)

```typescript
// 1. User clicks "Sign in with Google" button
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    scopes: 'email profile',
  },
});

// 2. User redirected to Google consent screen
// 3. After approval, redirected to /auth/callback with code
// 4. Frontend exchanges code for session automatically
```

### Logout Flow

```typescript
// 1. User clicks logout
const { error } = await supabase.auth.signOut();

// 2. Local session cleared
// 3. Redirect to login page
router.push('/auth/login');
```

### Session Refresh

```typescript
// Automatic refresh handled by Supabase client
// Manual refresh if needed:
const { data, error } = await supabase.auth.refreshSession();
```

### Password Reset Flow

```typescript
// 1. User requests password reset
const { data, error } = await supabase.auth.resetPasswordForEmail('user@example.com', {
  redirectTo: `${window.location.origin}/auth/reset-password`,
});

// 2. User clicks link in email
// 3. Redirected to /auth/reset-password with access token
// 4. User submits new password
const { data, error } = await supabase.auth.updateUser({
  password: 'newpassword123',
});
```

## OAuth Provider Setup

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   ```
   https://{SUPABASE_PROJECT_REF}.supabase.co/auth/v1/callback
   ```
7. Copy Client ID and Client Secret to Supabase Dashboard

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: Divorce Ledger AI
   - **Homepage URL**: `https://app.divorcedger.com`
   - **Authorization callback URL**: `https://{SUPABASE_PROJECT_REF}.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret to Supabase Dashboard

## Session Management

### Client-Side Session Handling

```typescript
// Initialize Supabase client with auto-refresh
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('User signed in:', session.user);
  }
  if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  }
  if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed');
  }
});
```

### Server-Side Session Validation

```typescript
// Extract JWT from Authorization header
const token = request.headers.get('Authorization')?.replace('Bearer ', '');

// Verify and decode JWT
const {
  data: { user },
  error,
} = await supabaseServiceRole.auth.getUser(token);

if (error || !user) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Security Best Practices

1. **Never expose service role key** in frontend code
2. **Use HTTPS** in production (Railway provides this automatically)
3. **Enable CSRF protection** via Supabase settings
4. **Set appropriate session timeouts**
5. **Implement rate limiting** for auth endpoints (via backend)
6. **Log all auth events** to audit_logs table
7. **Use secure cookies** for session storage (handled by Supabase)
8. **Validate redirect URLs** to prevent phishing

## Troubleshooting

### Issue: OAuth redirect fails

- Verify redirect URL is in allowed list
- Check OAuth provider configuration
- Ensure site URL matches production domain

### Issue: Session expires too quickly

- Check JWT expiry setting in dashboard
- Verify auto-refresh is enabled in client
- Check for CORS issues

### Issue: Email confirmation not working

- Verify SMTP settings in Supabase
- Check email templates are configured
- Ensure confirmation URL matches site URL

## Environment Variables

Required in frontend (.env.local):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
```

Required in backend (.env):

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SUPABASE_JWT_SECRET=your-jwt-secret
```
