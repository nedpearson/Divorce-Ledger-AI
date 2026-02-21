# System Architecture - Divorce Ledger AI

Complete technical architecture documentation for the Divorce Ledger AI document management system.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Component Architecture](#component-architecture)
5. [Data Flow](#data-flow)
6. [Security Architecture](#security-architecture)
7. [Deployment Architecture](#deployment-architecture)
8. [Scalability](#scalability)
9. [Monitoring & Observability](#monitoring--observability)
10. [Future Improvements](#future-improvements)

## Overview

Divorce Ledger AI is a cloud-native document management system designed for legal proceedings, specifically divorce and family law cases. The system provides:

- **Secure document storage** with encrypted transmission and storage
- **AI-powered classification** using OpenAI GPT models
- **Automated document processing** with Supabase Edge Functions
- **Role-based access control** with Row Level Security (RLS)
- **Real-time updates** using Supabase subscriptions
- **File upload with progress tracking** using signed URLs
- **Storage quota management** with tier-based limits

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Next.js 14 Frontend (Railway)                    │   │
│  │  - React 18 + TypeScript                                  │   │
│  │  - Zustand State Management                               │   │
│  │  - Tailwind CSS UI                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────┬───────────────┘
             │                                     │
             │ HTTPS                               │ HTTPS
             ↓                                     ↓
┌────────────────────────────────┐   ┌───────────────────────────┐
│   Backend API (Railway)        │   │   Supabase Platform       │
│  ┌──────────────────────────┐  │   │  ┌─────────────────────┐  │
│  │  Fastify + TypeScript    │  │   │  │  PostgreSQL DB      │  │
│  │  - REST API (40+         │  │   │  │  - 8 tables         │  │
│  │    endpoints)            │  │   │  │  - RLS policies     │  │
│  │  - JWT Auth              │──┼───┼──│  - Triggers         │  │
│  │  - Request validation    │  │   │  └─────────────────────┘  │
│  │  - Error handling        │  │   │                            │
│  │  - Structured logging    │  │   │  ┌─────────────────────┐  │
│  └──────────────────────────┘  │   │  │  Authentication     │  │
│                                 │   │  │  - Email/Password   │  │
│                                 │   │  │  - Google OAuth     │  │
│                                 │   │  │  - GitHub OAuth     │  │
│                                 │   │  │  - JWT tokens       │  │
│                                 │   │  └─────────────────────┘  │
│                                 │   │                            │
└────────────┬────────────────────┘   │  ┌─────────────────────┐  │
             │                        │  │  Storage Buckets    │  │
             │                        │  │  - documents        │  │
             ↓                        │  │  - thumbnails       │  │
┌────────────────────────────────┐   │  │  - audio            │  │
│   OpenAI API                   │   │  │  - exports          │  │
│  - GPT-4 for classification    │   │  │  - temp             │  │
│  - Text analysis               │   │  └─────────────────────┘  │
│  - Entity extraction           │   │                            │
└────────────────────────────────┘   │  ┌─────────────────────┐  │
                                      │  │  Edge Functions     │  │
                                      │  │  - process-upload   │  │
                                      │  │  - classify-doc     │  │
                                      │  │  - gen-thumbnail    │  │
                                      │  │  - sync-integrations│ │
                                      │  │  - audit-log        │  │
                                      │  └─────────────────────┘  │
                                      └───────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: Next.js 14.1.0 (React 18.2.0)
- **Language**: TypeScript 5.3.3 (strict mode)
- **Styling**: Tailwind CSS 3.4.1
- **State Management**: Zustand 4.5.0 with persistence
- **HTTP Client**: Axios 1.6.5
- **Auth/Database**: @supabase/supabase-js 2.39.0
- **Validation**: Zod 3.22.4
- **Icons**: lucide-react 0.316.0
- **Date Formatting**: date-fns 3.3.1

### Backend
- **Framework**: Fastify 4.25.2
- **Language**: TypeScript 5.3.3 (strict mode)
- **Runtime**: Node.js 18+
- **Database Client**: @supabase/supabase-js 2.39.0
- **Validation**: Zod 3.22.4
- **Logging**: Pino 8.17.2
- **HTTP Client**: Axios 1.6.5
- **AI Integration**: openai 4.24.1
- **Security**: helmet, cors, rate-limit

### Database & Storage
- **Database**: PostgreSQL 15 (Supabase)
- **Storage**: Supabase Storage (S3-compatible)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime

### Infrastructure
- **Hosting**: Railway (backend + frontend)
- **Database/Auth/Storage**: Supabase Platform
- **Edge Functions**: Supabase Edge Functions (Deno runtime)
- **CI/CD**: GitHub Actions
- **Monitoring**: Railway Dashboard, Supabase Dashboard

## Component Architecture

### Frontend Architecture

```
frontend/
├── src/
│   ├── pages/              # Next.js pages (routes)
│   │   ├── _app.tsx        # App wrapper, auth initialization
│   │   ├── index.tsx       # Landing page
│   │   ├── auth/           # Authentication pages
│   │   │   ├── login.tsx   # Email/password login
│   │   │   ├── signup.tsx  # User registration
│   │   │   └── callback.tsx # OAuth callback handler
│   │   ├── documents/      # Document pages
│   │   │   ├── index.tsx   # Document list with filters
│   │   │   └── [id].tsx    # Document detail view
│   │   └── settings/       # User settings
│   │       └── index.tsx   # Profile, storage, password
│   ├── components/         # Reusable React components
│   │   ├── Layout.tsx      # Sidebar layout with navigation
│   │   ├── AuthGuard.tsx   # Route protection HOC
│   │   ├── UploadButton.tsx # File upload with progress
│   │   └── DocumentList.tsx # Document cards/list view
│   ├── store/              # Zustand state management
│   │   ├── authStore.ts    # Auth state + actions
│   │   ├── documentStore.ts # Document CRUD + pagination
│   │   └── uploadStore.ts  # Upload progress + quota
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.ts      # Auth wrapper with requireAuth
│   │   ├── useDocuments.ts # Document management wrapper
│   │   └── useUpload.ts    # Upload management wrapper
│   ├── lib/                # Libraries and utilities
│   │   ├── supabase.ts     # Supabase client + helpers
│   │   └── api.ts          # Backend API client with interceptors
│   └── styles/             # Global styles
│       └── globals.css     # Tailwind + custom CSS
```

### Backend Architecture

```
backend/
├── src/
│   ├── server.ts           # Fastify app initialization
│   ├── config/             # Configuration management
│   │   └── env.ts          # Environment variable validation
│   ├── lib/                # Shared libraries
│   │   ├── supabase/       # Supabase clients
│   │   │   ├── clientAnon.ts        # Public client
│   │   │   └── clientServiceRole.ts # Service role client
│   │   ├── errors/         # Error handling
│   │   │   ├── AppError.ts          # Custom error classes
│   │   │   └── errorHandler.ts      # Global error handler
│   │   └── logging/        # Logging infrastructure
│   │       └── logger.ts   # Pino logger with redaction
│   ├── middleware/         # Request middleware
│   │   └── auth.ts         # JWT authentication
│   ├── validators/         # Request validation schemas
│   │   ├── authValidators.ts
│   │   ├── documentValidators.ts
│   │   └── uploadValidators.ts
│   ├── services/           # Business logic layer
│   │   ├── AuthService.ts  # Authentication logic
│   │   ├── DocumentService.ts # Document CRUD
│   │   ├── ClassificationService.ts # OpenAI integration
│   │   ├── UploadService.ts # Upload management
│   │   ├── AuditService.ts  # Audit logging
│   │   └── IntegrationService.ts # External integrations
│   └── routes/             # API routes
│       ├── auth.ts         # /auth/* endpoints
│       ├── documents.ts    # /documents/* endpoints
│       ├── uploads.ts      # /uploads/* endpoints
│       ├── classifications.ts # /classifications/* endpoints
│       ├── health.ts       # /health endpoint
│       └── webhooks.ts     # /webhooks/* endpoints
```

### Database Schema

```sql
-- Users (managed by Supabase Auth)
auth.users
  - id (uuid, PK)
  - email (text, unique)
  - created_at (timestamp)
  - user_metadata (jsonb)

-- Documents
public.documents
  - id (uuid, PK)
  - user_id (uuid, FK → auth.users)
  - storage_path (text, unique)
  - original_filename (text)
  - file_size (bigint)
  - mime_type (text)
  - document_type (enum: financial, legal, custody, property, communication, other)
  - status (enum: pending, processing, classified, failed)
  - metadata (jsonb)
  - tags (text[])
  - created_at, updated_at, deleted_at (timestamps)

-- Classifications
public.classifications
  - id (uuid, PK)
  - document_id (uuid, FK → documents)
  - primary_category (text)
  - confidence_score (float)
  - entities (jsonb)
  - sentiment (jsonb)
  - created_at (timestamp)

-- Uploads
public.uploads
  - id (uuid, PK)
  - user_id (uuid, FK → auth.users)
  - document_id (uuid, FK → documents)
  - signed_url (text)
  - status (enum: pending, uploading, completed, failed)
  - expires_at, completed_at, created_at (timestamps)

-- Storage Usage
public.storage_usage
  - id (uuid, PK)
  - user_id (uuid, FK → auth.users)
  - used_bytes (bigint)
  - limit_bytes (bigint)
  - updated_at (timestamp)

-- Audit Logs
public.audit_logs
  - id (uuid, PK)
  - user_id (uuid, FK → auth.users)
  - action (text)
  - resource_type (text)
  - resource_id (uuid)
  - metadata (jsonb)
  - created_at (timestamp)

-- Integrations
public.integrations
  - id (uuid, PK)
  - user_id (uuid, FK → auth.users)
  - integration_type (enum: google_drive, dropbox, onedrive)
  - credentials (jsonb, encrypted)
  - status (enum: active, inactive, error)
  - last_sync, created_at, updated_at (timestamps)

-- Jobs (Background tasks)
public.jobs
  - id (uuid, PK)
  - user_id (uuid, FK → auth.users)
  - job_type (text)
  - payload (jsonb)
  - status (enum: pending, running, completed, failed)
  - result (jsonb)
  - created_at, started_at, completed_at (timestamps)
```

## Data Flow

### Document Upload Flow

```
1. User selects file in frontend (UploadButton component)
   ↓
2. Frontend validates file (type, size, quota check)
   ↓
3. Request signed URL from backend API
   POST /uploads/generate-url { filename, contentType, fileSize }
   ↓
4. Backend validates request, creates upload record
   ↓
5. Backend generates signed URL via Supabase Storage
   Returns: { signed_url, upload_id, expires_at }
   ↓
6. Frontend uploads file directly to Supabase Storage
   PUT {signed_url} with file blob
   ↓
7. Frontend notifies backend of completion
   POST /uploads/complete { upload_id, storagePath }
   ↓
8. Backend creates document record
   ↓
9. Backend triggers classification job (edge function)
   ↓
10. Edge function downloads file, classifies with OpenAI
   ↓
11. Edge function saves classification results
   ↓
12. Frontend polls/subscribes for updates
   ↓
13. UI updates with classification results
```

### Authentication Flow

```
1. User submits credentials (email + password or OAuth)
   ↓
2. Frontend calls Supabase Auth API directly
   supabase.auth.signInWithPassword() or signInWithOAuth()
   ↓
3. Supabase validates credentials
   ↓
4. Supabase returns JWT access token + refresh token
   ↓
5. Frontend stores tokens (Supabase client handles this)
   ↓
6. Frontend updates auth store with user info
   ↓
7. Subsequent API requests include JWT in Authorization header
   ↓
8. Backend verifies JWT on each request (auth middleware)
   ↓
9. Backend extracts user_id from JWT claims
   ↓
10. Database RLS policies enforce user isolation
```

### Classification Flow

```
1. Document record created with status='pending'
   ↓
2. Database trigger fires process-upload edge function
   ↓
3. Edge function:
   a. Downloads file from Supabase Storage
   b. Extracts text content (PDFs, docs, images with OCR)
   c. Calls OpenAI API with prompt template
   d. Parses classification response
   e. Saves to classifications table
   f. Updates document status='classified'
   ↓
4. Frontend receives update via:
   - Real-time subscription (Supabase Realtime)
   - Or periodic polling
   ↓
5. UI displays classification results
```

## Security Architecture

### Authentication & Authorization

**JWT-based Authentication:**
- Supabase Auth issues JWT tokens on successful login
- Access token (1 hour expiry) + Refresh token (30 days)
- Frontend automatically refreshes expired tokens
- Backend validates JWT signature using Supabase JWKS

**Row Level Security (RLS):**
- PostgreSQL RLS policies enforce data isolation
- Users can only access their own documents
- Service role bypasses RLS for admin operations
- Example policy:
  ```sql
  CREATE POLICY "Users can only see own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);
  ```

### Data Security

**Encryption:**
- TLS 1.3 for all network communication
- Database encryption at rest (Supabase default)
- Storage encryption at rest (S3-compatible)
- Sensitive fields encrypted in database (credentials, tokens)

**Access Control:**
- Role-based access control (RBAC) via user_metadata
- Tiered access (free, pro, enterprise)
- Storage quotas enforced at application level
- Rate limiting on all API endpoints

**Audit Logging:**
- All document operations logged to audit_logs table
- IP address, user agent, timestamp captured
- Critical events trigger webhooks/notifications
- Audit logs immutable (no updates/deletes)

### Input Validation

- Zod schemas validate all API inputs
- File type whitelist (PDFs, docs, images, audio)
- File size limits (50MB per file)
- SQL injection protection via parameterized queries
- XSS protection via React escaping + CSP headers

## Deployment Architecture

### Railway Deployment

**Backend Service:**
- Docker container built from Dockerfile
- Environment variables configured in Railway dashboard
- Automatic deployment on git push to main
- Health checks monitor /health endpoint
- Logs streamed to Railway dashboard

**Frontend Service:**
- Next.js standalone build
- Environment variables baked into build
- CDN for static assets
- Automatic HTTPS with Let's Encrypt
- Custom domain support

### Supabase Platform

**Database:**
- Managed PostgreSQL 15
- Automatic backups (daily)
- Point-in-time recovery available
- Connection pooling enabled
- Read replicas for scaling (enterprise)

**Storage:**
- S3-compatible object storage
- CDN for global distribution
- Signed URLs for secure uploads/downloads
- Automatic image transformations
- Lifecycle policies for auto-deletion

**Edge Functions:**
- Deno runtime (TypeScript support)
- Global distribution (low latency)
- Automatic scaling
- Environment secrets management
- Logging and monitoring

### CI/CD Pipeline

**GitHub Actions:**
1. **CI Workflow** (on PR + push):
   - Lint backend + frontend
   - Type check TypeScript
   - Build both applications
   - Run security scans
   - Build Docker images

2. **CD Workflow** (on push to main):
   - Deploy backend to Railway
   - Deploy frontend to Railway
   - Deploy edge functions to Supabase
   - Run smoke tests
   - Send Slack notifications

## Scalability

### Horizontal Scaling

**Frontend:**
- Stateless Next.js app (scales horizontally)
- Railway supports multi-instance deployment
- Session stored in Supabase (no server-side state)
- CDN caches static assets

**Backend:**
- Stateless Fastify app (scales horizontally)
- No in-memory session storage
- All state in Supabase database
- Connection pooling for database efficiency

**Database:**
- Vertical scaling (upgrade plan)
- Read replicas for read-heavy workloads
- Connection pooling (Supavisor)
- Database indexes on frequently queried columns

### Caching Strategy

**Current:**
- Browser caching via Cache-Control headers
- Next.js automatic code splitting
- Supabase Storage CDN for files

**Future Improvements:**
- Redis cache for frequently accessed data
- API response caching (GET endpoints)
- Thumbnail caching in CDN
- Query result caching

### Performance Optimization

**Frontend:**
- Code splitting (Next.js automatic)
- Image optimization (Next.js Image component)
- Lazy loading components
- Zustand for efficient rerenders

**Backend:**
- Request validation at edge (Fastify hooks)
- Parallel database queries where possible
- Streaming large file downloads
- Efficient pagination (cursor-based)

**Database:**
- Indexes on foreign keys
- Indexes on commonly filtered columns
- Materialized views for complex queries
- Partitioning for large tables (future)

## Monitoring & Observability

### Application Monitoring

**Railway Dashboard:**
- Real-time logs (backend + frontend)
- CPU, memory, network metrics
- Deployment history and rollback
- Error rate tracking

**Supabase Dashboard:**
- Database performance metrics
- API request volume and latency
- Storage usage by bucket
- Edge function invocations

### Logging

**Backend:**
- Structured JSON logs (Pino)
- Log levels: error, warn, info, debug
- Sensitive data redaction (passwords, tokens, SSNs)
- Request ID tracking across services

**Edge Functions:**
- Console logs streamed to Supabase dashboard
- Error tracking with stack traces
- Performance timing logs

### Alerting

**Current:**
- Manual monitoring via dashboards
- Email notifications from Railway
- Supabase status page subscriptions

**Future Improvements:**
- Sentry for error tracking
- Datadog/New Relic for APM
- PagerDuty for on-call alerting
- Custom alerts (storage quota, failed jobs)

## Future Improvements

### Short-term (1-3 months)

1. **Enhanced Classification:**
   - Multi-language support
   - Custom ML models (fine-tuned on legal docs)
   - PDF table extraction
   - Signature detection

2. **User Features:**
   - Document sharing with expiring links
   - Collaboration (comments, annotations)
   - Bulk upload (upload multiple files)
   - Advanced search (full-text, filters)

3. **Integrations:**
   - Google Drive sync
   - Dropbox sync
   - OneDrive sync
   - Email attachments (IMAP)

### Medium-term (3-6 months)

1. **Performance:**
   - Redis caching layer
   - GraphQL API option
   - WebSocket real-time updates
   - Thumbnail generation for all file types

2. **Security:**
   - Two-factor authentication (2FA)
   - Single sign-on (SSO) for enterprises
   - Advanced audit logging with retention policies
   - Compliance reports (GDPR, HIPAA)

3. **Analytics:**
   - Document analytics dashboard
   - Storage usage trends
   - Classification accuracy metrics
   - User activity reports

### Long-term (6-12 months)

1. **AI Enhancements:**
   - Document comparison (diff between versions)
   - Automated redaction (PII detection)
   - Smart suggestions (next actions)
   - Natural language queries

2. **Enterprise Features:**
   - Multi-tenant architecture
   - White-label deployments
   - Custom workflows
   - Role-based permissions (granular)

3. **Infrastructure:**
   - Multi-region deployment
   - Disaster recovery (active-active)
   - Kubernetes migration (from Railway)
   - Microservices architecture refactor

---

## Architecture Decision Records (ADRs)

### ADR-001: Supabase for Backend Infrastructure

**Context**: Need managed database, auth, and storage.

**Decision**: Use Supabase Platform for PostgreSQL, Auth, and Storage.

**Rationale**:
- Managed PostgreSQL with automatic backups
- Built-in authentication with JWT
- S3-compatible storage with CDN
- Row Level Security (RLS) for data isolation
- Real-time subscriptions
- Edge functions for serverless logic

**Consequences**:
- ✅ Faster development (no auth implementation)
- ✅ Lower operational overhead
- ✅ Better security defaults
- ⚠️ Vendor lock-in (mitigated by PostgreSQL portability)

### ADR-002: Railway for Application Hosting

**Context**: Need simple deployment for backend + frontend.

**Decision**: Use Railway for hosting Fastify backend and Next.js frontend.

**Rationale**:
- Simple git-based deployments
- Automatic HTTPS
- Environment variable management
- Good free tier, affordable paid plans
- Built-in monitoring and logs
- Docker support

**Consequences**:
- ✅ Simple CI/CD pipeline
- ✅ Fast deployments
- ✅ Cost-effective
- ⚠️ Limited scaling options (vs. AWS/GCP)

### ADR-003: Next.js for Frontend Framework

**Context**: Need modern React framework with SSR/SSG.

**Decision**: Use Next.js 14 with App Router.

**Rationale**:
- Server-side rendering for better SEO
- Automatic code splitting
- Built-in image optimization
- TypeScript support
- Large ecosystem and community
- Vercel backing (stable roadmap)

**Consequences**:
- ✅ Better performance than SPA
- ✅ SEO-friendly
- ✅ Modern developer experience
- ⚠️ Steeper learning curve than plain React

### ADR-004: Zustand for State Management

**Context**: Need lightweight state management for frontend.

**Decision**: Use Zustand instead of Redux or Context API.

**Rationale**:
- Simpler API than Redux
- Better performance than Context
- Built-in persistence middleware
- TypeScript support
- Smaller bundle size

**Consequences**:
- ✅ Easier to learn and use
- ✅ Less boilerplate than Redux
- ✅ Good performance
- ⚠️ Smaller community than Redux

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-20  
**Maintained By**: Development Team
