# Divorce Ledger - Forensic Financial & Legal Case Management

## Overview
Divorce Ledger is a forensic financial analysis and legal case management platform designed to assist individuals and legal professionals during divorce proceedings. It offers tools for tracking assets, expenses, income, and debts, enabling users to build robust legal cases. The platform includes a full MVP implementation with a 5-tier subscription system integrated with Stripe, aiming to provide comprehensive support for both financial and legal aspects of divorce. The project envisions becoming the leading platform for forensic financial analysis in family law, offering unparalleled clarity and efficiency to a market in need of specialized tools.

## Recent Changes (January 2026)
-   **TypeScript Error Resolution**: Fixed all remaining TypeScript compilation errors across the codebase. Updated TEST_USERS with password/fullName properties, fixed demo-reset.ts table deletion to avoid generic type issues, added ObjectStorageService singleton export, corrected Date type handling for calendar events and child support payments, and added missing ledger_bucket property to golden set validation.
-   **Mobile & PWA Hardening**: Added PWA manifest.json and service worker for offline caching. Implemented mobile-first responsive design with SidebarTrigger for mobile navigation (md:hidden), MobileBottomNav with touch-friendly targets. Added safe-area padding, 16px input font-size for iOS zoom prevention, and prefers-reduced-motion accessibility support.
-   **Frontend Performance Optimizations**: Implemented React.lazy code-splitting for 18 heavy pages (Mobile, Finances, Settings, Admin, etc.) reducing initial bundle size. Added React.memo memoization for list item components (StatCard, PaymentCard, TransactionRow, AlertRow). Wrapped expensive filter/sort operations in useMemo/useCallback across dashboard, documents, and violations pages.
-   **Branding Consolidation**: Global sweep completed to ensure 100% "Divorce Ledger" branding. All legacy references (DivorceASE, DivorceAES, divorcease.ai) removed from SMS messages, API docs, PDF exports, OpenAPI spec, Stripe products, and all frontend pages. Canonical URLs enforced: Dev (divorceledger.replit.app), Prod (divorceledger.live).
-   **Schema Alignment & ETL Disabling**: Data quality and reconciliation modules updated to use actual warehouse table names (dim_users, dim_date, fact_violations, fact_transactions, fact_usage_metrics). ETL and event-streaming routes disabled (return 503) pending schema migration - these modules had significant drift from implemented schema.
-   **Universal SQL Safety Layer**: Comprehensive `safeQuery` wrapper enforced across ALL 96+ database operations. Zero direct pool.query calls remain. Features: parameter validation, trace ID generation, sanitized error messages (no raw SQL/stack traces exposed), and descriptive query naming convention (`module:operation`).
-   **Environment-Based Debug Logging**: `DEBUG_SQL=true` enables query debug logging in development only. Auto-disabled in production for security. Configuration in `server/lib/safeQuery.ts`.
-   **Simplified Internal Finance Model**: Reduced from 9 ledger buckets to 5 core buckets (INCOME, EXPENSE, ASSET, LIABILITY, UNKNOWN). Extended buckets (COGS, TAX, OWNER_EQUITY, TRANSFER) exist only in mapping layer for QuickBooks/Firefly exports.
-   **Centralized Finance Mappings**: New `server/services/financeMappings.ts` module handles all internal→external mappings for QuickBooks and Firefly III integrations.
-   **Structured Logging System**: New `server/lib/logger.ts` with log levels (debug/info/warn/error) and context tagging.
-   **Global Error Handler**: New `server/lib/errorHandler.ts` with `asyncHandler`, `globalErrorHandler`, and standardized JSON error responses.
-   **Appwrite Extraction Pipeline Updated**: Uses core buckets only (5 values) for AI extraction prompts.
-   **Frontend Observability**: Added centralized error logging (`client/src/lib/error-logger.ts`), enhanced ErrorBoundary with structured reporting and recovery options, global error handlers for uncaught exceptions, and basic smoke tests. See `docs/FRONTEND_OBSERVABILITY.md` for details.
-   **CSS/Layout Consistency Hardening**: Normalized z-index values using semantic tokens (z-base, z-sticky, z-dropdown, z-modal, z-toast). Added success/warning semantic colors. Created layout utility classes (page-container, page-header, page-title). Z-index hierarchy: sticky (40) < dropdown/overlay/modal (50) < toast (100).

## User Preferences
No specific user preferences were provided.

## URLs
- **Dev/Preview**: https://divorceledger.replit.app
- **Production**: https://divorceledger.live

## System Architecture
The Divorce Ledger platform utilizes a modern web stack with a clear separation of frontend and backend concerns.

**UI/UX Decisions:**
-   **Theme Support:** Dark and light modes with persisted preferences.
-   **Mobile-First Design:** Prioritizes mobile experience with bottom navigation, gradient FAB for quick actions, and large action cards.
-   **Desktop Navigation:** QuickBooks-style sidebar navigation.
-   **Color Gradients:** Vibrant gradients are used to highlight primary actions and features.
-   **Components:** Leverages `shadcn/ui` for a consistent and modern design.

**Technical Implementations:**
-   **Frontend**: React, TypeScript, Vite, TanStack Query for data fetching, and Wouter for routing.
-   **Backend**: Express.js with PostgreSQL database and Drizzle ORM.
-   **Styling**: Tailwind CSS.
-   **Database**: PostgreSQL, with environment-based routing to separate LIVE and DEMO data. The DEMO environment resets daily.
-   **Subscription System**: A 5-tier model (Free, Individual, Pro, Team, Enterprise) with feature gating.
-   **Data Warehousing**: Kimball-style star schema for analytics, including dimension and fact tables, SCD Type 2, and incremental Change Data Capture (CDC).
-   **CI/CD**: GitHub Actions for continuous integration and deployment.
-   **Event Streaming**: PostgreSQL-backed event streaming with transactional outbox pattern, exactly-once delivery, consumer groups, and dead letter queue.
-   **API Documentation**: OpenAPI 3.0 specification with Swagger UI, detailing 72+ endpoints, validation schemas, and error responses. Versioning follows semantic versioning.
-   **QuickBooks Integration**: Multi-tenant OAuth 2.0 integration with secure, encrypted token storage and transparent token auto-refresh. Includes rate limiting and audit logging.
-   **Firefly III Integration**: Personal accounting integration with per-user encrypted token storage, complete API client, and document-to-transaction pipeline with chain of custody tracking.
-   **Analytics Dashboard**: Provides business intelligence at `/analytics`, tracking revenue (MRR, ARR), churn, LTV, violation patterns, and user cohort retention.
-   **Data Governance Framework**: Comprehensive framework at `/governance` covering PII cataloging, GDPR/CCPA compliant consent management, automated data subject requests, configurable retention policies, full audit trails, data lineage visualization, data quality tests, and AES-256-GCM encryption key management.
-   **dbt Transformation Models**: A complete dbt project with staging, dimension (SCD Type 2), fact (incremental loads), intermediate, and reporting models.
-   **QuickBooks-Style Drill-Down**: Dashboard stat cards are clickable, opening side drawers with detailed records, vendor information, and document indicators.
-   **Document Intake & Auto-Categorization Engine**: AI-powered system for document analysis, including multilingual OCR, classification, financial data extraction with confidence scores, and AI-proposed ledger actions requiring human approval.
-   **Forensic Financial Document Parser**: Specialized parsing for 11 canonical document types, using swappable LLM providers (OpenAI, Gemini), Zod schema validation, line item extraction, and amount/date normalization.
-   **Automatic Document → Expense Pipeline**: An automated workflow for financial documents involving upload, preliminary AI analysis, forensic parsing, and idempotent persistence of extracted financial records.
-   **Authentication Pattern**: Frontend uses X-User-Id header for authentication; backend verifies against session.
-   **Two-Factor Authentication (2FA)**: SMS-based 2FA via Twilio, requiring phone numbers for signups, device-bound sessions, MFA challenges, and logging of security events.
-   **User Security Settings**: Users can manage active sessions, trusted devices, and review security activity logs.
-   **Admin Security Dashboard**: Provides an overview of security events and the ability to force logout users.

**Feature Specifications:**
-   **Dashboard**: Compact overview of financial statistics, transactions, and alerts with drill-down capabilities.
-   **Finances Module**: Tracks income, expenses, assets, and debts with verification statuses.
-   **Violations Documentation**: Records court order violations with detailed information and evidence attachments.
-   **Case Management**: Includes Case Timeline for evidence chronology and Case Builder for court-ready summaries.
-   **Court Filing Assistant**: Aids in auto-populating legal documents.
-   **Court-Ready PDF Export**: Generates professional PDFs of timelines, violations, and chain of custody with SHA-256 integrity hashes.
-   **Alert System**: Notifies users of financial anomalies with varying severity levels.
-   **Admin Endpoints**: Secure endpoints for administrative tasks like demo data reset, billing, and ETL management.
-   **Admin Panel**: Protected console at `/admin` for managing test user accounts.
-   **Test User System**: Five isolated test accounts (test1-test5) with sandboxed environments, not subject to daily demo reset, and self-service options for data management.

## External Dependencies
-   **Database**: PostgreSQL
-   **Document Intake System**: Appwrite
-   **Payment Gateway**: Stripe
-   **SMS Provider**: Twilio
-   **Personal Accounting**: Firefly III
-   **ORM**: Drizzle ORM
-   **Frontend Libraries**: React, TypeScript, Vite, TanStack Query, Wouter
-   **Styling Framework**: Tailwind CSS
-   **UI Components**: shadcn/ui
-   **PDF Generation**: PDFKit
-   **Version Control & CI/CD**: GitHub Actions