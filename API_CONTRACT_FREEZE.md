# Frontend-Backend API Contract Freeze

This document establishes the strict boundaries, data contracts, and behavioral invariants currently relied upon by the `Divorce-Ledger-AI` frontend. As the initial step toward migrating to a Python-based core, these boundaries **must not change** from the perspective of the React UI.

---

## 1. Safe Backend Replacement Boundary

The entire system is decoupled via JSON REST over HTTP via standard standard Express routing. The frontend strictly expects `application/json` responses for all structured requests, and `multipart/form-data` for file uploads.

**The Boundary:**
- The new Python backend must expose exact `HTTP [METHOD] /api/...` signatures.
- Cookies (specifically `session` or JWT equivalent) must seamlessly propagate.
- 100% of the Drizzle Zod-inferred TypeScript interfaces must matching incoming/outgoing payloads exactly.
- The React Query `useQuery` / `useMutation` hooks dictate the cache invalidation triggers. Mutational side-effects on the backend must mimic existing invalidations.

---

## 2. Screen-by-Screen Contract Map

The following screens define the current routing and their data requirements:

### **Authentication & Onboarding (`/login`, `/signup`, `/workspace-setup`)**
*   **State Required**: Authenticated user session, workspace verification.
*   **APIs Consumed**:
    *   `POST /api/auth/login`, `POST /api/auth/signup`
    *   `GET /api/auth/session`, `GET /api/auth/me`
    *   `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`

### **Financial Dashboard (`/finances`, `/property`, `/child-support`)**
*   **UI Views**: Aggregated graphs, list tables for Assets, Debts, Incomes, Expenses, and Ledger Buckets.
*   **APIs Consumed**:
    *   `GET /api/dashboard/stats`
    *   `GET /api/transactions`, `GET /api/transactions/recent`, `POST /api/transactions`
    *   `GET /api/assets`, `POST /api/assets`, `DELETE /api/assets/:id`
    *   `GET /api/debts`, `POST /api/debts`, `DELETE /api/debts/:id`
    *   `GET /api/expenses`, `GET /api/incomes`
    *   `GET /api/child-support-payments`, `POST /api/child-support-payments`

### **Documentation & Evidence (`/documents`, `/timeline`)**
*   **UI Views**: Document grid/list, OCR processing status indicators, metadata editors.
*   **APIs Consumed**:
    *   `GET /api/documents`, `GET /api/documents/:id`
    *   `POST /api/documents` (Multipart handling), `DELETE /api/documents/:id`
    *   `POST /api/documents/:id/analyze`, `POST /api/documents/:id/forensic-parse`
    *   `GET /api/documents/:id/line-items`
    *   `GET /api/evidence/:id/custody`, `POST /api/evidence`
    *   `POST /api/capture/analyze`, `POST /api/capture/document-intake`

### **Violations & Tracking (`/violations`, `/journal`)**
*   **UI Views**: Logs and severity matrices for legal/documentary violations or timeline notes.
*   **APIs Consumed**:
    *   `GET /api/violations`, `POST /api/violations`, `PATCH /api/violations/:id/status`, `DELETE /api/violations/:id`
    *   `GET /api/journal`, `POST /api/journal`, `PATCH /api/journal/:id`, `DELETE /api/journal/:id`

### **Communications (`/communications`)**
*   **UI Views**: Message tracking, thread history, external integrations tracking.
*   **APIs Consumed**:
    *   `GET /api/conversations`, `POST /api/conversations`
    *   `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`

### **Administrative & Profile Options (`/settings`, `/admin`)**
*   **UI Views**: Quota management, billing overview, system controls.
*   **APIs Consumed**:
    *   `GET /api/users/:userId/billing`, `GET /api/users/:userId/usage-metrics`, `GET /api/users/:userId/quota-status`
    *   `GET /api/admin/users`, `GET /api/admin/analytics/platform`
    *   `POST /api/security/devices/:id/block`, `GET /api/security/events`

---

## 3. Endpoint-by-Endpoint Minimum Contract Definition

*   **Resources (`GET`)**: Must return a JSON body representing the array structure `[{...}, {...}]` natively. Collections like `GET /api/documents` must return an empty array `[]` (not `null` or `{ "data": [] }` unless expressly overridden by previous wrappers) if nothing is found.
*   **Single Fetch (`GET /:id`)**: Must return either the exact JSON entity `{...}` or HTTP 404/401 correctly.
*   **Mutations (`POST`, `PATCH`, `PUT`)**: Content-Type is typically `application/json` (unless submitting forms/media). Response must provide the updated object block `{ id: '...', ... }` mapping properties verbatim to trigger optimistic or state-based UI updates in the React cache.
*   **Deletions (`DELETE`)**: Must return `{ success: true }` natively. Attempting to traverse or return null will collapse queries.

---

## 4. Core Data Invariants & Structural Rules

To maintain frontend stability, the following constraints must be respected. Python replacements MUST not change the type or nature of these fields:

1.  **Unique Identifiers**: All resources (`id`) rely on string UUIDs or serial ints. The exact data type must be maintained since the frontend stores them directly against React `key=` props.
2.  **Date/Time Handling**: Fields like `createdAt`, `updatedAt`, `start_date`, and `date` must always be returned as ISO 8601 Strings. The frontend native JS `new Date()` constructs rely on this parsing.
3.  **Money/Currency**: Internal representations are strictly **Integer Cents** (`price`, `amount`, `balance`). The frontend divides by 100 for display. Decimals in REST payloads will break logic.
4.  **Enums**: String enum payloads must exactly match existing types. For example:
    *   `bucket`: `"INCOME" | "EXPENSE" | "ASSET" | "LIABILITY" | "UNKNOWN"`
    *   `status`: `"active" | "archived" | "deleted"` (for general entities)
    *   `severity_score`: standard numerical matrices tracking order magnitude.
5.  **Multi-Tenant Isolation**: The backend MUST scope every response to the Request Context. The frontend heavily caches resources blindly assuming that what it gets is definitively isolated.

---

## 5. Deduplication, Idempotency & Upload Rules

*   **Document Deduplication**: Submitting the same document binary must reject with a 409 Conflict natively OR return the existing unified document ID, matching exactly how the frontend upload hook handles success flows.
*   **Orphan Mitigation**: Deleting a document that generated Transactions must gracefully determine if the transactions are shared. If reference counting is applied, the backend executes it silently. The frontend simple blindly sends `DELETE /api/documents/:id` and expects cascading references to be handled serverside.
*   **Idempotency Guards**: Mutations like `POST /api/billing/save` or Quota consumption hooks must not trigger duplicate decrements if the UI clicks multiple times while latency causes overlapping requests.

---

## 6. Must-Not-Change List for Frontend Behavior

*   **TanStack Query Keys (React Query)**: The structural identity of keys (`["documents"]`, `["finances", "incomes"]`, `["auth"]`) defines how background polling resolves. Changing endpoint URLs or resource nests forces heavy UI refactors.
*   **Auth Layer**: Session parsing. The frontend explicitly uses standard HTTP-Only cookies. The Python implementation must securely set and respect this exact header syntax natively.
*   **Global Error Handling**: The frontend API client universally sniffs for payloads matching `{ error: string, ... }`. The Python backend must serialize all generic errors (4XX/5XX) into this JSON envelope. Standard tracebacks or plain text 500s will break toast notification rendering.
*   **Null Tolerances**: Over-fetching or returning `null` vs `undefined` vs `[]`. If an associative list is empty, the Python backend must return `[]` not `null`. Array `.map()` calls in the frontend will immediately crash if `null` is returned for collections.

---

## Conclusion
This mapping explicitly defines the surface area. The underlying implementations within the core API layer can be safely written in Python, but the HTTP protocol borders, REST serialization structures, API routes, formatting parameters, and specific JSON Error envelopes listed MUST be replicated exactly line-by-line to prevent fundamentally destroying the Application Client state.
