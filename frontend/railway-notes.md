# Railway Deployment Notes - Frontend

Configuration and notes for deploying the Next.js frontend to Railway.

## Quick Deploy

1. **Connect Repository**: Link your GitHub repository to Railway
2. **Select Service**: Choose "Deploy from GitHub repo" → Select frontend directory
3. **Configure Build**:
   - **Root Directory**: `/frontend` (if monorepo)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. **Set Environment Variables** (see below)
5. **Deploy**: Railway will automatically build and deploy

## Environment Variables

Configure in Railway Dashboard → Your Service → Variables:

### Required Variables

```bash
# Backend API URL - Use your Railway backend service URL
NEXT_PUBLIC_API_URL=https://your-backend.railway.app

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Important**:

- Railway will automatically set `PORT` - don't override it
- `NEXT_PUBLIC_*` variables must be set in Railway before each deployment
- Variables are baked into the build at build time

### Getting Supabase Credentials

1. Go to https://app.supabase.com
2. Select your project
3. Go to Settings → API
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Dockerfile Configuration

Railway can use the provided `Dockerfile` for deployment:

```dockerfile
# Highlights:
- Multi-stage build (deps → builder → runner)
- Build args for NEXT_PUBLIC_* variables
- Non-root user (nextjs)
- Health check enabled
- Standalone output for smaller image
```

To use Dockerfile deployment:

1. Railway Dashboard → Settings → Build Method → Dockerfile
2. Ensure environment variables are set as build args

## Custom Domain

1. Railway Dashboard → Settings → Networking
2. Click "Generate Domain" for a Railway subdomain
3. Or add custom domain:
   - Click "Add Custom Domain"
   - Enter your domain (e.g., `app.yourdomain.com`)
   - Add CNAME record to your DNS:
     - Type: `CNAME`
     - Name: `app` (or subdomain)
     - Value: Your Railway domain (e.g., `yourservice.railway.app`)
   - Wait for DNS propagation (5-60 minutes)

### SSL/TLS

Railway automatically provisions SSL certificates for all domains (Let's Encrypt).

## Supabase OAuth Configuration

After deploying, configure OAuth redirect URLs in Supabase:

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add Site URL: `https://your-frontend.railway.app`
3. Add Redirect URLs:
   - `https://your-frontend.railway.app/auth/callback`
   - `http://localhost:3001/auth/callback` (for local development)

### Google OAuth

1. Google Cloud Console → APIs & Services → Credentials
2. OAuth 2.0 Client → Add Authorized Redirect URI:
   - `https://your-project.supabase.co/auth/v1/callback`
3. Copy Client ID and Secret to Supabase → Auth → Providers → Google

### GitHub OAuth

1. GitHub → Settings → Developer settings → OAuth Apps → New
2. Authorization callback URL: `https://your-project.supabase.co/auth/v1/callback`
3. Copy Client ID and Secret to Supabase → Auth → Providers → GitHub

## Build Configuration

### Railway Settings

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Install Command**: Auto-detected (npm ci)
- **Watch Paths**: `/frontend/**` (if monorepo)

### next.config.js Settings

Key configurations for production:

```javascript
{
  output: 'standalone',  // Required for Docker/Railway
  reactStrictMode: true,
  swcMinify: true,       // Fast minification
  images: {
    domains: ['*.supabase.co'],  // Allow Supabase images
  },
}
```

## Healthcheck

Railway automatically monitors your service. The Dockerfile includes a health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

Create a health endpoint at `src/pages/api/health.ts`:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

## Monitoring

### Railway Dashboard

- **Logs**: View real-time logs in the Deployments tab
- **Metrics**: CPU, Memory, Network usage in Metrics tab
- **Deployments**: View deployment history and rollback if needed

### Log Viewing

```bash
# View logs in Railway Dashboard
# Or use Railway CLI:
railway logs
```

## Troubleshooting

### Build Failures

**Issue**: Build fails with "Module not found"

**Solution**:

- Ensure all dependencies are in `package.json`
- Run `npm install` locally first to verify
- Check Railway build logs for specific error

**Issue**: "NEXT*PUBLIC*\* is undefined"

**Solution**:

- Variables must be set in Railway before build
- Redeploy after adding missing variables

### Runtime Issues

**Issue**: "Failed to fetch" errors in browser console

**Solution**:

- Verify `NEXT_PUBLIC_API_URL` points to correct backend service
- Check backend CORS configuration allows frontend origin
- Ensure backend service is running

**Issue**: "Supabase client initialization failed"

**Solution**:

- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Check Supabase project is active
- Test connection from local environment first

**Issue**: OAuth redirect fails

**Solution**:

- Add Railway domain to Supabase redirect URLs
- Verify OAuth provider configuration (Google/GitHub)
- Check browser network tab for redirect errors

### Performance Issues

**Issue**: Slow page loads

**Solution**:

- Enable CDN/caching via Railway's CDN feature
- Optimize images (use Next.js Image component)
- Enable SWC minification (already in config)
- Consider upgrading Railway plan for more resources

### Memory Issues

**Issue**: "JavaScript heap out of memory" during build

**Solution**: Add to build command:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

## Scaling

### Horizontal Scaling

Railway supports horizontal scaling (multiple instances):

1. Dashboard → Settings → Scaling
2. Enable "Horizontal Scaling"
3. Set min/max replicas

**Note**: Ensure your app is stateless for horizontal scaling.

### Vertical Scaling

Upgrade Railway plan for more CPU/memory per instance.

## CI/CD Integration

Railway automatically deploys on git push. For custom workflows:

### GitHub Actions

```yaml
name: Deploy to Railway
on:
  push:
    branches: [main]
    paths: ['frontend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Railway CLI
        run: npm i -g @railway/cli
      - name: Deploy
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### Railway CLI Deployment

```bash
# Install CLI
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

## Cost Optimization

- **Use Hobby plan** ($5/mo per project) for production
- **Optimize build cache**: Railway caches node_modules
- **Monitor usage**: Dashboard → Metrics shows resource usage
- **Hibernate unused services**: Settings → Sleep mode

## Security Checklist

- ✅ Environment variables set (no hardcoded secrets)
- ✅ HTTPS enabled (automatic with Railway)
- ✅ Security headers configured (next.config.js)
- ✅ CORS configured on backend
- ✅ OAuth redirect URLs set in providers
- ✅ Supabase RLS policies enabled
- ✅ Rate limiting configured (backend)

## Rollback Procedure

If deployment breaks:

1. Railway Dashboard → Deployments tab
2. Find last working deployment
3. Click "..." → "Redeploy"
4. Or use CLI:
   ```bash
   railway rollback
   ```

## Backup Strategy

- **Code**: Committed to Git (automatic backup)
- **Deployments**: Railway keeps deployment history
- **Environment Variables**: Export from Dashboard → Variables → Export

## Support Resources

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Next.js Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs

## Production Checklist

Before going live:

- [ ] All environment variables set in Railway
- [ ] Custom domain configured and DNS updated
- [ ] SSL certificate active (green padlock in browser)
- [ ] OAuth providers configured with production URLs
- [ ] Supabase redirect URLs include production domain
- [ ] Backend API CORS allows frontend domain
- [ ] Health check endpoint created and working
- [ ] Monitoring/alerting configured
- [ ] Error tracking setup (e.g., Sentry)
- [ ] Performance monitoring (e.g., Vercel Analytics or similar)
- [ ] Backup and rollback procedures tested

## Contact

For Railway-specific issues: https://help.railway.app
For application issues: Check backend logs and frontend browser console
