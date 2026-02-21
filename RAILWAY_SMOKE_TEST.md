# Post-Deployment Smoke Test Checklist

After Railway deployment, test these endpoints in order:

## 1. Health Check
```bash
curl https://your-app.up.railway.app/api/health
```
Expected: `{ "status": "ok" }`

## 2. Database Connection
Check Railway logs for:
```
✅ Database connection successful
✅ [STARTUP] Database migrations completed successfully
```

## 3. LLM Provider Initialization
Check Railway logs for:
```
[Document Analysis] Using gpt-4o (or claude, gemini-2.0-flash)
```
Should NOT crash after this message!

## 4. API Routes
```bash
# Should return route list
curl https://your-app.up.railway.app/api/health/routes
```

## 5. WebSocket Connection (if using real-time features)
Check Railway logs for:
```
WebSocket server initialized
```

## 6. Stripe Webhook (if configured)
```bash
# Should return 405 (Method Not Allowed is expected for GET)
curl https://your-app.up.railway.app/api/webhooks/stripe
```

## 7. Test User Registration
Use your frontend or:
```bash
curl -X POST https://your-app.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","fullName":"Test User"}'
```

## Common Issues

### Issue: "connect ECONNREFUSED"
- **Fix**: DATABASE_URL missing or incorrect
- **Check**: Railway Variables → DATABASE_URL has `?sslmode=require`

### Issue: "Session secret required"
- **Fix**: Add SESSION_SECRET to Railway Variables

### Issue: App crashes after "[Document Analysis]" message
- **Fix**: This was the bug we just fixed! Redeploy with updated build.ts

### Issue: "Stripe validation failed"
- **Fix**: Set STRIPE_SECRET_KEY or set STRIPE_MODE=test for testing

### Issue: CORS errors
- **Fix**: Set BASE_URL to your Railway domain
