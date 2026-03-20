# Environment Variables Reference

## Complete list of environment variables for production deployment

## Frontend Environment Variables

### Required (Next.js)

```bash
# Supabase Configuration (Public - safe to commit to public repos)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # Anon/Public key from Supabase

# Backend API URL
NEXT_PUBLIC_API_URL=https://divorce-ledger-ai-production.up.railway.app

# Application Configuration
NEXT_PUBLIC_APP_NAME="Divorce Ledger AI"
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Optional (Frontend)

```bash
# Analytics (Optional)
NEXT_PUBLIC_GA_TRACKING_ID=UA-XXXXXXXXX-X

# Sentry Error Tracking (Optional)
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Feature Flags (Optional)
NEXT_PUBLIC_ENABLE_OAUTH=true
NEXT_PUBLIC_ENABLE_FILE_UPLOAD=true
```

## Backend Environment Variables

### Required (Fastify + Supabase)

```bash
# Node Environment
NODE_ENV=production
PORT=5000

# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Anon key (safe to use in backend)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # SERVICE ROLE KEY - KEEP SECRET!

# Session Security
SESSION_SECRET=your_64_char_random_string_here  # Generate with: openssl rand -hex 64

# CORS Configuration
CORS_ORIGIN=https://your-frontend.vercel.app,https://your-custom-domain.com
# Comma-separated list of allowed origins
```

### Optional (Backend)

```bash
# Logging
LOG_LEVEL=info  # Options: debug, info, warn, error

# Rate Limiting
RATE_LIMIT_MAX=100  # Max requests per time window
RATE_LIMIT_WINDOW=60000  # Time window in milliseconds (60000 = 1 minute)

# File Upload Limits
MAX_FILE_SIZE=52428800  # 50MB in bytes
MAX_FILES_PER_UPLOAD=10

# Sentry Backend Error Tracking (Optional)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Email Configuration (if using custom SMTP)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key

# Redis (for caching - optional)
REDIS_URL=redis://default:xxxxx@redis-xxxxx.railway.app:6379
```

## Supabase Project Settings

### Database Settings (Supabase Dashboard → Settings → Database)

```
Database Host: db.xxxxx.supabase.co
Database Name: postgres
Database Port: 5432
Database User: postgres
Database Password: [Your project password]

Connection String (for backups):
postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

### API Settings (Supabase Dashboard → Settings → API)

```
Project URL: https://xxxxx.supabase.co
Project API Key (anon public): eyJhbGc...
Project API Key (service_role): eyJhbGc... [KEEP SECRET]

JWT Secret: [Auto-generated, used internally]
```

### Auth Settings (Supabase Dashboard → Authentication → Settings)

```
Site URL: https://your-frontend-domain.com

Additional Redirect URLs:
- https://your-frontend-domain.com/auth/callback
- https://your-frontend-domain.vercel.app/auth/callback
- http://localhost:3000/auth/callback  (for local development)

JWT Expiry: 3600 (1 hour)
Enable Email Confirmations: true
Enable anonymous sign-ins: false
```

## Railway Configuration

### Backend Service (Railway Dashboard → Service → Variables)

```bash
# Copy all "Backend Environment Variables - Required" from above
NODE_ENV=production
PORT=5000
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SESSION_SECRET=...
CORS_ORIGIN=...
```

### Deployment Settings (Railway Dashboard → Service → Settings)

```
Build Command: npm run build
Start Command: npm start
Root Directory: /backend  (if monorepo)
Deployment Region: us-west1 (or nearest to users)
```

## Vercel Configuration (if using for frontend)

### Environment Variables (Vercel Dashboard → Settings → Environment Variables)

Add all "Frontend Environment Variables - Required" from above. Make sure to add them for:

- Production
- Preview (optional)
- Development (optional)

### Build Settings

```
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm install
Root Directory: frontend  (if monorepo)
Node Version: 18.x
```

## Local Development

### `.env.local` (Frontend)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME="Divorce Ledger AI (Dev)"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `.env` (Backend)

```bash
NODE_ENV=development
PORT=5000
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SESSION_SECRET=dev_secret_not_for_production
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=debug
```

## Security Notes

### ⚠️ CRITICAL: Never Expose These

```bash
SUPABASE_SERVICE_ROLE_KEY  # Has full database access, bypasses RLS
SESSION_SECRET              # Protects session cookies
SMTP_PASS                  # Email service credentials
Database Password          # Direct DB access
```

### ✅ Safe to Expose (Public Keys)

```bash
NEXT_PUBLIC_SUPABASE_URL       # Public endpoint
NEXT_PUBLIC_SUPABASE_ANON_KEY  # Anon key (RLS still enforced)
NEXT_PUBLIC_API_URL            # Public API endpoint
NEXT_PUBLIC_APP_URL            # Public app URL
```

## Generating Secrets

### Generate SESSION_SECRET

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -hex 64

# Using Python
python -c "import secrets; print(secrets.token_hex(64))"
```

### Generate JWT Secret (if needed)

```bash
openssl rand -base64 32
```

## Verifying Configuration

### Test Frontend → Supabase Connection

```javascript
// Run in browser console on your deployed site
const { data, error } = await supabase
  .from('profiles')
  .select('count', { count: 'exact', head: true });
console.log('Connection test:', error ? 'FAILED' : 'SUCCESS');
```

### Test Backend → Supabase Connection

```bash
# Test health endpoint
curl https://your-backend.railway.app/api/health

# Should return:
{
  "status": "ok",
  "database": "connected",
  "timestamp": "..."
}
```

### Test CORS Configuration

```bash
# Test from your frontend domain
curl -H "Origin: https://your-frontend-domain.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://your-backend.railway.app/api/health
```

## Troubleshooting

### "Invalid API key" Error

- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` matches Supabase Dashboard → Settings → API
- Check that URL matches (include https:// and .supabase.co domain)

### "CORS Error" in Browser

- Add your frontend domain to `CORS_ORIGIN` in backend env vars
- Include both production and preview URLs if using Vercel

### "Database connection failed"

- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check Supabase project is not paused (free tier auto-pauses after inactivity)
- Verify database is accepting connections

### Environment variables not updating

**Railway:**

- Redeploy after changing env vars (click Redeploy button)

**Vercel:**

- Re-run build after changing env vars
- Different values for Production/Preview/Development

## Backup & Recovery

### Backup Environment Variables

```bash
# Railway CLI
railway variables > env-backup-$(date +%Y%m%d).txt

# Vercel CLI
vercel env pull .env.vercel.backup
```

### Restore from Backup

Manually re-add through dashboard or use CLI tools.

## Conclusion

Keep this reference handy during deployment. Double-check all environment variables before going live, especially the sensitive ones marked as ⚠️ CRITICAL.
