# Divorce Ledger AI - Backend

Production-ready backend API for the Divorce Ledger AI platform, built with Fastify, TypeScript, and Supabase.

## Features

- **Authentication**: Email/password + OAuth (Google, GitHub) via Supabase Auth
- **Document Management**: Upload, classify, version, and manage legal documents
- **AI Classification**: Automatic document classification using AI services
- **Storage**: Secure file storage with Supabase Storage and quota management
- **Audit Logging**: Comprehensive audit trail for all user actions
- **Integrations**: Connect with external services (Google Drive, Dropbox, etc.)
- **Job Queue**: Background job processing for classification, thumbnails, etc.
- **Security**: Row-level security (RLS), rate limiting, CORS, helmet
- **Monitoring**: Health checks, metrics, structured logging

## Tech Stack

- **Framework**: Fastify 4.x
- **Language**: TypeScript 5.x
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Auth**: Supabase Auth
- **Validation**: Zod
- **Logging**: Pino
- **Module**: ESM

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Supabase project (get started at https://supabase.com)

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your Supabase credentials
# Get these from your Supabase project settings
```

## Environment Variables

Required environment variables (see `.env.example`):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (admin)
- `SUPABASE_JWT_SECRET` - JWT secret for token verification

Optional:
- OAuth credentials for social login
- AI provider API keys for classification
- Feature flags, logging level, etc.

## Development

```bash
# Start development server with hot reload
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test
```

The server will start on `http://localhost:3000`.

## Production Build

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

## API Documentation

### Health Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (checks database, storage)
- `GET /metrics` - Application metrics
- `GET /version` - API version

### Authentication

- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login with email/password
- `POST /auth/logout` - Logout current user
- `GET /auth/session` - Get current user session
- `POST /auth/refresh` - Refresh access token
- `POST /auth/password/reset-request` - Request password reset
- `POST /auth/password/update` - Update password
- `GET /auth/oauth/:provider` - Initiate OAuth (google, github)
- `POST /auth/oauth/callback` - Handle OAuth callback

### Documents

- `GET /documents` - List documents (paginated, filterable)
- `GET /documents/:id` - Get document by ID
- `POST /documents` - Create document
- `PATCH /documents/:id` - Update document
- `DELETE /documents/:id` - Delete document (soft delete by default)
- `POST /documents/:id/classify` - Trigger classification
- `GET /documents/:id/versions` - Get version history
- `GET /documents/stats` - Get document statistics

### Uploads

- `POST /uploads/generate-url` - Generate signed upload URL
- `POST /uploads/complete` - Complete upload after file stored
- `POST /uploads` - Direct multipart upload
- `GET /uploads/storage` - Get storage usage
- `DELETE /uploads/:filePath` - Delete uploaded file

### Classifications

- `GET /classifications` - List classifications
- `GET /classifications/document/:documentId` - Get classification for document
- `GET /classifications/stats` - Get classification statistics
- `GET /classifications/search` - Search classifications

### Webhooks

- `POST /webhooks/supabase` - Generic Supabase webhook
- `POST /webhooks/document-upload` - Document upload webhook
- `POST /webhooks/classification-complete` - Classification complete webhook

## Authentication

All endpoints except health checks and auth endpoints require authentication.

Include JWT token in `Authorization` header:

```
Authorization: Bearer <access_token>
```

Get access token from login/signup response.

## Error Handling

All errors return JSON response:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "request_id": "req-123456"
}
```

HTTP status codes:
- `400` - Validation error
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `409` - Conflict
- `429` - Rate limit exceeded
- `500` - Internal server error
- `502` - External service error

## Deployment

### Railway

See `railway-notes.md` for deployment instructions.

### Docker

```bash
# Build image
docker build -t divorce-ledger-backend .

# Run container
docker run -p 3000:3000 --env-file .env divorce-ledger-backend
```

### Manual

```bash
# Build
npm run build

# Set environment variables
export NODE_ENV=production
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
# ... other env vars

# Start
npm start
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts           # Environment variable validation
│   ├── errors/
│   │   ├── AppError.ts      # Custom error classes
│   │   └── errorHandler.ts  # Global error handling
│   ├── logging/
│   │   └── logger.ts        # Pino structured logging
│   ├── middleware/
│   │   └── auth.ts          # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.ts          # Authentication routes
│   │   ├── documents.ts     # Document CRUD routes
│   │   ├── uploads.ts       # Upload routes
│   │   ├── classifications.ts  # Classification routes
│   │   ├── health.ts        # Health check routes
│   │   └── webhooks.ts      # Webhook routes
│   ├── services/
│   │   ├── AuthService.ts          # Auth business logic
│   │   ├── DocumentService.ts      # Document operations
│   │   ├── ClassificationService.ts  # Classification logic
│   │   ├── UploadService.ts        # Upload/storage logic
│   │   ├── AuditService.ts         # Audit logging
│   │   └── IntegrationService.ts   # External integrations
│   ├── supabase/
│   │   ├── clientAnon.ts    # Supabase anon client (RLS)
│   │   └── clientServiceRole.ts  # Supabase admin client
│   ├── validators/
│   │   ├── authValidators.ts      # Auth request schemas
│   │   ├── documentValidators.ts  # Document schemas
│   │   └── uploadValidators.ts    # Upload schemas
│   └── server.ts            # Main server entry point
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Contributing

1. Create feature branch from `main`
2. Make changes with tests
3. Run `npm run lint` and `npm test`
4. Submit pull request

## License

Proprietary - All rights reserved
