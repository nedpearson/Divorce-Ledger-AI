# Railway Deployment Checklist

## ✅ Pre-Deployment (Completed)

- [x] Added automatic database migration runner to `server/index.ts`
- [x] Fixed SendGrid to use direct API key instead of Replit connectors
- [x] Added Railway domain support to WebSocket CORS
- [x] Updated base URL configuration to detect Railway environment
- [x] Created `railway.json` configuration file
- [x] Verified file uploads use Appwrite (memory storage, compatible with Railway)
- [x] Generated session secret: `MwgDqYU6GLolFeqmSFerdKmPZVCutYYh3uK4VWFQ1k4=`

## 🚀 Railway Deployment Steps

### 1. Update DATABASE_URL in Railway Variables

**CRITICAL:** Your current DATABASE_URL is missing SSL mode requirement.

✅ **Correct format:**
```
postgresql://postgres:26-DivorceLedgerAI$@db.ntkegkbhvgltdcfoakyk.supabase.co:5432/postgres?sslmode=require
```

**Action:**
1. Go to Railway dashboard → Your project → Variables
2. Find or add `DATABASE_URL`
3. Set value to the connection string above (with `?sslmode=require` at the end)
4. Save

### 2. Add Required Environment Variables

**In Railway Variables section, add these:**

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://postgres:26-DivorceLedgerAI$@db.ntkegkbhvgltdcfoakyk.supabase.co:5432/postgres?sslmode=require` | ✅ Already have credentials |
| `SESSION_SECRET` | `MwgDqYU6GLolFeqmSFerdKmPZVCutYYh3uK4VWFQ1k4=` | ✅ Generated for you |
| `NODE_ENV` | `production` | Required |
| `APP_MODE` | `live` | For production mode |
| `BASE_URL` | `https://[your-railway-app].up.railway.app` | Replace with your actual Railway URL |

**Important features (add if you want full functionality):**

| Variable | Where to Get It |
|----------|----------------|
| `SENDGRID_API_KEY` | https://app.sendgrid.com/settings/api_keys |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/apikeys |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |

**Optional (already in Railway from previous setup):**
- `CRON_ADMIN_SECRET` - Already set ✅
- `GEMINI_API_KEY` - Already set ✅
- `QB_CLIENT_SECRET` - Already set ✅
- `REMEMBER_ME_SECRET` - Already set ✅
- `FIREFLY_ACCESS_TOKEN` - Already set ✅

### 3. Configure Appwrite (For File Uploads)

If you want to accept file uploads (evidence, documents, media):

1. **Create Appwrite Account:** https://appwrite.io (or self-host)
2. **Create Project:** Name it "Divorce Ledger"
3. **Create Database:** Database ID: `divorce_ledger_db`
4. **Create Storage Bucket:** Bucket ID: `document_files`
5. **Generate API Key:** 
   - Scopes: Database (Read/Write), Storage (Read/Write)
   - Never expire (or long expiration)
6. **Add to Railway Variables:**
   ```
   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   APPWRITE_PROJECT_ID=[your-project-id]
   APPWRITE_API_KEY=[your-api-key]
   ```

**Skip this if:** You're testing and don't need file uploads yet.

### 4. Deploy to Railway

**Option A: Redeploy Existing Deployment**
1. Go to Railway → Deployments tab
2. Click "Redeploy" on the latest deployment
3. Watch logs in real-time

**Option B: Trigger New Deploy**
1. Make any small commit to your repo (if connected to GitHub)
2. Railway auto-deploys
3. Or click "Deploy Now" in Railway dashboard

### 5. Monitor First Deployment

**Watch for these log messages (in order):**

```
✅ [Config] Environment sanity check passed
✅ Database connection successful
✅ [STARTUP] Running database migrations...
✅ [STARTUP] Database migrations completed successfully
✅ Stripe schema ready (if Stripe configured)
✅ [STARTUP] Application mode: LIVE
✅ serving on port 5000 (or Railway's assigned port)
```

**If you see errors:**
- `DATABASE_URL not set` → Check Railway Variables
- `Database connection failed` → Verify Supabase connection string
- `Migration failed` → Check Supabase allows connections from Railway IPs
- `SENDGRID_API_KEY not found` → Email will be disabled (app continues)

**First deploy takes 30-60 seconds:**
- Building application
- Installing dependencies
- Running database migrations
- Creating all tables in Supabase

### 6. Verify Deployment Success

#### Check 1: Health Endpoint
```bash
curl https://[your-railway-app].up.railway.app/api/health
```
**Expected:** `{"status": "healthy"}` or similar

#### Check 2: Supabase Tables Created
1. Go to Supabase dashboard → SQL Editor
2. Run query:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```
**Expected tables:**
- users
- billing_records
- violation_records
- evidence_files
- time_series_data
- audit_logs
- tier_migrations
- quota_resets
- auth_sessions
- (13+ tables total)

#### Check 3: Application Loads
Visit: `https://[your-railway-app].up.railway.app`

**Expected:** Login/registration page loads

#### Check 4: WebSocket Connection
Open browser console while on the application, check for:
```
WebSocket connected
```
No CORS errors

### 7. Post-Deployment Configuration

#### Update Stripe Webhook (If using Stripe)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://[your-railway-app].up.railway.app/api/stripe/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.*`
4. Copy webhook signing secret
5. Add to Railway Variables: `STRIPE_WEBHOOK_SECRET=whsec_...`
6. Redeploy

#### Update QuickBooks Redirect URI (If using QuickBooks)
1. Go to QuickBooks Developer Portal
2. Update redirect URI to: `https://[your-railway-app].up.railway.app/api/quickbooks/callback`
3. Save

#### Test Core Functionality
1. **Register new user** → Check Supabase `users` table for record
2. **Upload document** (if Appwrite configured) → Verify appears in Appwrite storage
3. **Create violation** → Check `violation_records` table
4. **Check billing tier** → Verify tier logic works

## 🔍 Troubleshooting

### Database Connection Errors
**Symptom:** `Database connection failed` in logs  
**Fix:**
1. Verify `?sslmode=require` is in DATABASE_URL
2. Check Supabase password is correct
3. Ensure Supabase project is active (go to project dashboard)
4. Check Railway can connect to Supabase (no IP restrictions)

### Migration Errors
**Symptom:** `Migration failed` in logs  
**Fix:**
1. Check `migrations/` folder exists in deployed code
2. Verify DATABASE_URL is valid
3. Run migrations manually:
   ```bash
   # In Railway shell or locally with production DATABASE_URL
   npx drizzle-kit push
   ```

### SendGrid Email Errors
**Symptom:** `SendGrid not configured` warnings  
**Fix:**
1. Add `SENDGRID_API_KEY` to Railway Variables
2. Verify API key is valid at SendGrid dashboard
3. Emails will fail silently if not configured (app continues)

### File Upload Fails
**Symptom:** Upload endpoint returns 500 error  
**Fix:**
1. Configure Appwrite (see step 3 above)
2. Add Appwrite environment variables to Railway
3. Redeploy
4. App will reject uploads gracefully if Appwrite not configured

### WebSocket CORS Errors
**Symptom:** `CORS error` in browser console for WebSocket  
**Fix:**
1. Verify `BASE_URL` is set in Railway Variables
2. Should match your Railway app URL exactly
3. Redeploy to pick up new BASE_URL

### Port Binding Errors
**Symptom:** `EADDRINUSE` or port errors  
**Fix:**
1. Application uses `process.env.PORT` (Railway requirement) ✅
2. Railway automatically assigns PORT - don't set it manually
3. If error persists, check Railway logs for other service conflicts

## 📊 Monitoring Production

### Railway Dashboard
- **Metrics:** CPU, Memory, Network usage
- **Logs:** Real-time application logs with filtering
- **Deployments:** History, rollback capability

### Supabase Dashboard
- **Database:** Table browser, SQL editor
- **Logs:** Query logs, slow queries
- **Extensions:** Enable pg_stat_statements for query analysis

### Application Health
- **Endpoint:** `GET /api/health` - Database connection status
- **Endpoint:** `GET /api/status` - Full system status (if implemented)
- **WebSocket:** `/dashboard` - Real-time metrics (if enabled)

## 🎉 Success Criteria

✅ **Deployment is successful when:**
1. Railway build completes without errors
2. Application starts and binds to assigned PORT
3. Health check endpoint returns 200 OK
4. Supabase shows 13+ tables created
5. Frontend loads and can register/login
6. No critical errors in Railway logs
7. WebSocket connects without CORS errors

## 📝 Next Steps After Successful Deploy

1. **Custom Domain:** Add custom domain in Railway settings (optional)
2. **Environment Separation:** Create staging environment (duplicate project)
3. **Monitoring:** Set up error tracking (Sentry, LogRocket, etc.)
4. **Backups:** Configure Supabase automated backups
5. **CDN:** Consider Cloudflare for static assets (optional)
6. **Testing:** Run smoke tests on production URL
7. **Documentation:** Update team with new production URL

## 🆘 Need Help?

**Check Railway Logs:**
```bash
railway logs --follow
```

**Check Supabase Connection:**
```bash
psql "postgresql://postgres:26-DivorceLedgerAI$@db.ntkegkbhvgltdcfoakyk.supabase.co:5432/postgres?sslmode=require"
```

**Verify Environment Variables:**
Railway Dashboard → Variables tab → Verify all required variables are set

**Rollback if needed:**
Railway Dashboard → Deployments → Click previous deployment → "Redeploy"
