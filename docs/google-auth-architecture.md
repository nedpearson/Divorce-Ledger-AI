# Google Authentication & Integrations Architecture

## Overview
This document outlines the privacy-first Google authentication flow integrated into the Divorce Ledger application. Due to the sensitive nature of forensic and legal documents, strict principles of scope minimization have been mathematically enforced.

## 1. Authentication Configuration
To enable the "Continue with Google" feature, the following environment variables must be populated in the platform's execution context:
- `GOOGLE_CLIENT_ID`: The public identifier for your GCP OAuth Client.
- `GOOGLE_CLIENT_SECRET`: The secure secret for token exchange.
- `GOOGLE_CALLBACK_URL`: The registered redirect URI for the environment (e.g., `https://your-domain.com/api/auth/google/callback`).

## 2. Privacy Mechanics & Scope Limits
By design, the authentication layer uses the raw OpenID Connect protocols without encompassing massive third-party SDKs. 

Scope mappings requested during sign-in are explicitly limited to:
- `openid`
- `email`
- `profile`

**Crucial Note**: The application is structurally prevented from inadvertently requesting Calendar or Drive payload access during sign-in. This enforces a separation of identity from data.

## 3. Database Architecture
The implementation abstracts 3rd-party bridging logically:
1. `user_oauth_connections`: Tracks strict Single Sign-On mapping for `sub` claims to local `User` identities.
2. `auth_audit_logs`: Generates permanent telemetry trails for security visibility into connection links, authentications, and disconnections.
3. `integration_connections`: A dedicated table intentionally isolated from authentication, built as the future-state destination for localized Drive and Calendar access logic.

## 4. Workarounds and Fallbacks
To support both Passport session configurations and raw express-session instances across various node environments, the OAuth exchange falls back dynamically. It favors standard local `req.login()` hooks if the express-session is instrumented with Passport middleware, but will successfully default to `req.session.userId = user.id` as a fallback hydration.
