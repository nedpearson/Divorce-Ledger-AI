# Railway Deployment Guide - Backend

This guide covers deploying the Divorce Ledger AI backend to Railway.

## Prerequisites

- Railway account (https://railway.app)
- GitHub repository connected to Railway
- Supabase project with database schema deployed

## Deployment Steps

### 1. Create New Railway Project

```bash
# Install Railway CLI (optional)
npm install -g @railway/cli

# Login
railway login

# Link to existing project or create new
railway link
```

### 2. Configure Environment Variables

In Railway dashboard, go to **Variables** and add:

**Required:**
```
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Supabase (from your Supabase project settings)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here

# Frontend URL (for CORS)
FRONTEND_URL=https://your-frontend.railway.app
```

**Optional:**
```
# OAuth (if using)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# AI Providers (if using)
OPENAI_API_KEY=...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...

# Features
ENABLE_RATE_LIMITING=true
ENABLE_CORS=true
LOG_LEVEL=info
```

### 3. Configure Build Settings

Railway will auto-detect Node.js app. Verify settings:

**Root Directory:** `backend` (if monorepo) or `/` (if backend is root)

**Build Command:**
```bash
npm run build
```

**Start Command:**
```bash
npm start
```

**Dockerfile:** Railway will use `Dockerfile` if present in backend directory

### 4. Configure Health Checks

In Railway dashboard:

- **Health Check Path:** `/health`
- **Health Check Interval:** 30 seconds
- **Health Check Timeout:** 10 seconds

### 5. Deploy

#### Option A: GitHub Integration (Recommended)

1. Connect GitHub repository in Railway dashboard
2. Select branch (e.g., `main`)
3. Railway will auto-deploy on every push to that branch

#### Option B: Railway CLI

```bash
# From backend directory
cd backend

# Deploy
railway up
```

#### Option C: Docker

Railway will automatically use the Dockerfile if present.

### 6. Verify Deployment

After deployment:

```bash
# Get your Railway URL
railway domain

# Test health endpoint
curl https://your-backend.railway.app/health

# Test readiness
curl https://your-backend.railway.app/ready
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "divorce-ledger-backend",
  "environment": "production"
}
```

## Monitoring

### View Logs

**Railway Dashboard:**
- Go to your service
- Click **Logs** tab
- Filter by level (info, warn, error)

**Railway CLI:**
```bash
railway logs
```

### Metrics

Railway provides automatic metrics:
- CPU usage
- Memory usage
- Network traffic
- Request count

Access metrics in Railway dashboard under **Metrics** tab.

### Custom Metrics

Your app exposes custom metrics:
```bash
curl https://your-backend.railway.app/metrics
```

Response includes:
- Uptime
- Memory usage
- Database stats (user count, document count, etc.)
- Queued jobs count

## Scaling

### Horizontal Scaling

Railway supports horizontal scaling (multiple instances):

1. Go to **Settings** → **Scaling**
2. Adjust number of instances
3. Railway will load balance automatically

**Note:** Backend is stateless and can scale horizontally.

### Vertical Scaling

Adjust resources per instance:
- Memory: 512MB to 32GB
- CPU: Shared to 8 vCPUs

## Troubleshooting

### Deployment Fails

**Check build logs:**
```bash
railway logs --build
```

**Common issues:**
- Missing environment variables
- TypeScript compilation errors
- Dependency installation failures

### 502 Bad Gateway

**Possible causes:**
- Server not listening on correct host/port
- Health check failing
- Server crashing on startup

**Fix:**
- Ensure `HOST=0.0.0.0` (not `localhost`)
- Ensure `PORT=3000` or use Railway's `$PORT`
- Check logs for startup errors

### Database Connection Issues

**Symptoms:**
- `/ready` endpoint returns 503
- Database queries fail

**Fix:**
- Verify `SUPABASE_URL` and keys are correct
- Check Supabase project is not paused
- Verify RLS policies allow service role access

### Storage Issues

**Symptoms:**
- File uploads fail
- Storage operations timeout

**Fix:**
- Verify Supabase Storage buckets exist
- Check storage policies allow service role access
- Verify file size limits

### Authentication Issues

**Symptoms:**
- Login/signup fails
- JWT verification fails

**Fix:**
- Verify `SUPABASE_JWT_SECRET` matches Supabase project
- Check JWT token is valid and not expired
- Verify auth header format: `Bearer <token>`

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/deploy-backend.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Use Node.js 18
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      
      - name: Install dependencies
        working-directory: backend
        run: npm ci
      
      - name: Run tests
        working-directory: backend
        run: npm test
      
      - name: Build
        working-directory: backend
        run: npm run build
      
      - name: Deploy to Railway
        uses: railway/railway-cli@v1
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        with:
          command: up
```

Add `RAILWAY_TOKEN` to GitHub repository secrets.

## Environment-Specific Configuration

### Development

```
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_CORS=true
FRONTEND_URL=http://localhost:3000
```

### Staging

```
NODE_ENV=staging
LOG_LEVEL=info
ENABLE_CORS=true
FRONTEND_URL=https://staging.divorcedger.com
```

### Production

```
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_CORS=true
ENABLE_RATE_LIMITING=true
FRONTEND_URL=https://app.divorcedger.com
```

## Cost Optimization

### Tips to Reduce Costs

1. **Right-size instances:** Start with small instances, scale up as needed
2. **Enable rate limiting:** Prevent abuse and excessive API calls
3. **Optimize database queries:** Use indexes, limit result sets
4. **Cache responses:** Use Redis or in-memory cache for frequently accessed data
5. **Monitor logs:** Set appropriate log level (`warn` or `error` in production)

### Railway Pricing

- **Starter:** $5/mo + usage
- **Developer:** $20/mo + usage
- **Team:** Custom pricing

Usage charges:
- CPU: $0.000463/vCPU-min
- Memory: $0.000231/GB-min
- Network: $0.10/GB egress

**Estimated monthly cost for production:**
- Small app (low traffic): $10-30
- Medium app (moderate traffic): $50-100
- Large app (high traffic): $200-500+

## Security Best Practices

1. **Rotate secrets regularly:** Update API keys, JWT secrets every 90 days
2. **Use environment variables:** Never commit secrets to Git
3. **Enable rate limiting:** Protect against DDoS and abuse
4. **Validate all inputs:** Use Zod schemas for request validation
5. **Implement audit logging:** Track all sensitive operations
6. **Use HTTPS only:** Railway provides automatic HTTPS
7. **Restrict CORS:** Only allow specific frontend origins
8. **Monitor logs:** Set up alerts for errors and suspicious activity
9. **Keep dependencies updated:** Run `npm audit` regularly
10. **Use security headers:** Helmet is configured by default

## Support

- **Railway Documentation:** https://docs.railway.app
- **Railway Discord:** https://discord.gg/railway
- **Supabase Documentation:** https://supabase.com/docs
- **Supabase Discord:** https://discord.supabase.com

## Next Steps

After backend is deployed:

1. Test all API endpoints with cURL or Postman
2. Deploy frontend and configure `FRONTEND_URL`
3. Set up monitoring and alerts
4. Configure custom domain (optional)
5. Set up automated backups (Supabase handles database backups)
6. Implement CI/CD pipeline for automated deployments
