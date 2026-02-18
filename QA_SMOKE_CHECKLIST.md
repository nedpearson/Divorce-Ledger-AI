# QA Smoke Test Checklist - Demo Readiness

This checklist ensures the Divorce Ledger platform is functional for a law firm demonstration.

## 1. Startup & Environment
- [ ] Backend starts cleanly (Pre-flight config check passes).
- [ ] CRON scheduler initializes without errors.
- [ ] Frontend loads without white screens (ErrorBoundary verification).
- [ ] Database connection is successful.

## 2. Authentication Flow
- [ ] **Sign Up**: Create a new account with email/password.
- [ ] **Log In**: Authenticate using the newly created account.
- [ ] **Logout**: Ensure session is cleared and redirects to landing page.
- [ ] **Demo Mode**: Verify demo credentials (demo@divorceledger.live / demo123) work correctly.

## 3. Subscription & Usage
- [ ] **Status**: Navigate to Dashboard/Settings and verify subscription tier is visible.
- [ ] **Pricing**: View the 5-tier subscription model at `/pricing`.

## 4. Case Management
- [ ] **Create Case**: Add a new legal case from the dashboard or side navigation.
- [ ] **Log Violation**: Document a custody or financial violation with description.
- [ ] **View Timeline**: Confirm the violation appears in the evidence chronology.

## 5. Document Handling
- [ ] **Upload**: Upload a sample PDF or image evidence.
- [ ] **OCR/Analysis**: Verify the AI extraction engine triggers (mocked in demo if keys missing).
- [ ] **Categorization**: Confirm document shows up in the "Documents" module.

## 6. Financial Tracking
- [ ] **Income/Expense**: Log a manual financial entry.
- [ ] **Drill-down**: Click a dashboard stat card and verify the side drawer opens with details.

## 7. Forensic Tools
- [ ] **PDF Export**: Generate a "Court-Ready PDF" of a case timeline.
- [ ] **Integrations**: (Optional) Verify QuickBooks/Firefly status badges in Settings.
