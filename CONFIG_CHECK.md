# Configuration Check

This project requires several environment variables to function correctly. This document lists all required and optional environment variables and their purpose.

## Required Variables

These variables MUST be present for the application to start in development or production.

| Variable         | Description                                      | Example / Format                    |
| ---------------- | ------------------------------------------------ | ----------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string                     | `postgres://user:pass@host:port/db` |
| `SESSION_SECRET` | Secret key for signing session cookies           | Any long random string              |
| `REPLIT_DOMAINS` | (Auto-set by Replit) List of domains for the app | `my-app.replit.app`                 |

## Integration Specific Variables

These are required if the corresponding feature is used.

### Stripe

| Variable                    | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `STRIPE_SECRET_KEY`         | Stripe API Secret Key                           |
| `STRIPE_PUBLISHABLE_KEY`    | Stripe Publishable Key                          |
| `STRIPE_WEBHOOK_SECRET`     | Stripe Webhook Signing Secret                   |
| `STRIPE_MODE`               | Stripe mode: `test` or `production`             |
| `WORKSPACE_BILLING_ENABLED` | Enable workspace billing flows (`true`/`false`) |
| `AI_CREDITS_DEFAULT_MODE`   | Default credits mode: `safe` or `metered`       |

### AI Integrations

| Variable         | Description           |
| ---------------- | --------------------- |
| `OPENAI_API_KEY` | OpenAI API Key        |
| `GEMINI_API_KEY` | Google Gemini API Key |

### Communication & Document Processing

| Variable              | Description           |
| --------------------- | --------------------- |
| `TWILIO_ACCOUNT_SID`  | Twilio Account SID    |
| `TWILIO_AUTH_TOKEN`   | Twilio Auth Token     |
| `TWILIO_PHONE_NUMBER` | Twilio Phone Number   |
| `SENDGRID_API_KEY`    | SendGrid API Key      |
| `APPWRITE_ENDPOINT`   | Appwrite API Endpoint |
| `APPWRITE_PROJECT_ID` | Appwrite Project ID   |
| `APPWRITE_API_KEY`    | Appwrite API Key      |

## Configuration Validation Script

We use `scripts/checkConfig.ts` to validate these variables at startup. If a required variable is missing, the process will exit with a non-zero code.

To run the check manually:

```bash
npm run check-config
```

The check is also integrated into `npm run dev`.
