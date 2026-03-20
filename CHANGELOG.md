# Changelog

All notable changes to the Divorce Ledger project will be documented in this file.

## [2026-01-21] - Product Name & URL Normalization

### Changed

#### Product Naming

- **Normalized all product names** from "Divorce Ledger AI", "DivorceASE AI", "DivorceAES-AI", and "Divorce Forensic" to the canonical name: **"Divorce Ledger"**
- Updated user-facing text in:
  - Page titles (`client/index.html`)
  - Mobile header (`client/src/App.tsx`)
  - Sidebar branding (`client/src/components/app-sidebar.tsx`)
  - Login page (`client/src/pages/login.tsx`)
  - Signup page (`client/src/pages/signup.tsx`)
  - Email templates (`server/email.ts`)
  - AI parsing prompts (`server/services/parseDocument.ts`)
  - Integration notes for Firefly III (`server/routes/firefly.ts`, `server/services/firefly-iii.service.ts`, `server/services/documentToTransaction.ts`)
  - Documentation files (`docs/APPWRITE_*.md`, `QA_SMOKE_CHECKLIST.md`)
  - Scripts (`scripts/checkConfig.ts`, `scripts/smoke-test.sh`)
  - Main project README (`replit.md`)

#### URL Configuration

- **Canonical URLs established**:
  - Dev/Preview: `https://divorceledger.replit.app`
  - Production: `https://divorceledger.live`
- **QuickBooks OAuth redirect URI** now dynamically uses `REPLIT_DOMAINS` or defaults to `divorceledger.replit.app`
- **WebSocket CORS** updated to allow connections from:
  - `localhost:3000`, `localhost:5000`
  - `divorceledger.replit.app`
  - `divorceledger.live`
  - All domains in `REPLIT_DOMAINS` environment variable
- **Email URL generation** now uses environment-aware `getAppBaseUrl()` helper:
  - Production: `https://divorceledger.live`
  - Development: Uses `REPLIT_DOMAINS` or `REPLIT_DEV_DOMAIN`
  - Fallback: `http://localhost:5000`

### Architecture (Unchanged)

- **Appwrite remains the universal file analyzer/filer** - all documents and pictures flow through Appwrite for:
  - Storage
  - OCR and text extraction
  - AI-powered categorization
  - Financial data extraction
- Express continues to serve as the primary backend API layer

### Technical Notes

- Internal identifiers like `divorce-ledger-expense-*`, `divorce-ledger-income-*` remain unchanged for backward compatibility
- Demo email credentials (`demo@divorcease.ai`) unchanged as they are internal test fixtures
- PostCSS warning about `from` option is a known Vite 7.x limitation and cannot be fixed without upstream changes
