# JAD - Backend Architecture SSOT (BACKEND-ARCHITECTURE.md)

> **Authority:** This document is the **backend implementation architecture** for the JA&D (JAD) platform. It translates the approved requirements, business rules, API specification, overall architecture, folder structure, technology stack, and development guidelines into the backend implementation model that guides **Project 06 - Backend Engineering** and all subsequent backend work.
>
> **Precedence:** BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → API-SPECIFICATION.md → TECH-STACK.md → UI-UX.md → DESIGN-SYSTEM.md → FOLDER-STRUCTURE.md → {FRONTEND-ARCHITECTURE.md, **this document**} → DEVELOPMENT-GUIDELINES.md.
>
> **Status vocabulary:** **CONFIRMED** = established by approved SSOT decisions. **PROPOSED** = recommended, not yet approved. **REQUIRES APPROVAL** = material decision (architecture, security, cost, production, or SSOT). **ASSUMPTION** = working assumption. **TBD** = unresolved; must not be invented. **RECOMMENDED** = convention with no repository precedent. **REQUIRES VERIFICATION** = claim not yet confirmed (no dependency manifests exist).
>
> **Version:** Project 06 - Backend Engineering (Baseline v1.0)
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only** - no backend source code, no dependency manifests, no database schema, no deployment configuration. Every implementation element below is the **target model** for phases P1..P12 of ROADMAP.md. No version number is verified (TECH-STACK §14 - REQUIRES VERIFICATION until manifests exist).
>
> **Approved anchors (CONFIRMED as updated Q1 2026-08-30):** TypeScript full-stack; Modular via Vercel Functions (supersedes Modular Monolith/NestJS, ARCH-DEC-001/002 per Q1 + ADR-002b); Supabase Postgres 15+ + RLS (ARCH-DEC-003/004 as updated Q1); Supabase Auth JWT verified server-side (Q3, supersedes HttpOnly per ARCH-DEC-007); exact-decimal money, never floats (BR-WAL-002); append-only financial records (BR-LED-001/002, BI-005); record-only payments, no money movement inside JAD (BR-BND-001..003); Stack `React/RN → TanStack Query → Vercel Functions/REST API → Supabase → PostgreSQL`, infra `Supabase + Vercel`.
>
> **Approval boundaries (must stop and request approval - never enact silently):** business-rule changes; API contract changes; authentication/authorization architecture changes; major backend architecture changes; major new dependencies; destructive database operations; production-impacting infrastructure; changes to any other SSOT document. Unresolved items are marked `REQUIRES APPROVAL` with the reason and the decision required (§21).

---

## 1. Backend Architecture Overview

### 1.1 Backend responsibilities (Q1 Vercel Functions)

The backend is **Vercel Functions / REST API (`api/` or `apps/api/api/`) + Supabase (Postgres/Auth/Storage/Realtime)** - handlers are stateless, share `packages/contracts` validation and `lib/supabase` access. It is the sole owner of:

- All business logic and domain rules (BR-*, BI-*) - the frontends render results, they never compute business truth.
- Authentication (session) and **authorization** on every request (NFR-AUTH-001/002, NFR-AUTHZ-001/002).
- The financial ledger: commissions, eWallet balances, withdrawals, adjustments, voucher redemptions - as the single writer for balance invariants (ARCHITECTURE §6).
- Validation of all input (presentation-layer Zod + domain rules + DB constraints).
- The immutable `audit` trail for staff decisions and financial events (NFR-SEC-002, NFR-AUD-001).
- Outbound integration to external systems (email, geolocation, push, CTO signing, payout records) through adapters.
- Background work: the commission clearing scheduler (FEAT-036) and outbound notification dispatch.

**Out of scope (enforced):** moving or holding real money (BR-BND-001..003); payment gateway/card/wallet-API integration (BR-BND-003); MLM/network-commission computation (BI-004); signing-key custody (BI-008); any microservices/event-broker decomposition (ARCH-DEC-001, TECH-STACK §16).

### 1.2 Architectural style / pattern (Q1)

**CONFIRMED as updated Q1:** Modular via **Vercel Functions** - handlers `api/<domain>/[id].ts` organized by FG-*, plus shared `lib/` services. One Supabase `public` ACID boundary still enforces invariants; modularity is logical (folder + contracts), not a Nest monolith process.

**Explicitly excluded for v1:** NestJS/Express monolith, microservices, event-sourced ledger (append-only), in-app payment processing (ARCHITECTURE §2.1). Business logic remains server-side; functions are thin.

### 1.3 Major backend layers (per function, adapted from ARCHITECTURE §5)

| Layer | Vercel artifacts | Responsibilities | Rules |
|---|---|---|---|
| **Handler** | `api/<domain>/[id].ts`, Zod, middleware | HTTP semantics, request parsing/validation, authZ, response mapping | No business logic |
| **Application** | shared use-case services (`lib/`) | Orchestration, transaction boundaries, cross-domain calls | Opens/commits transactions; coordinates |
| **Domain** | entities, value objects, rules | Business rules, calculations, invariants | No framework/DB dependencies; pure where possible |
| **Persistence** | Supabase client + RLS | Schema access, migrations (`supabase/migrations/`), row-locking, snapshots | Only service helpers touch the DB |
| **Infrastructure** | adapters | Email, geolocation, push, signing client, Storage | Behind interfaces; replaceable for tests |

Cross-cutting helpers live in `api/_lib/` / `lib/supabase` + `packages/contracts` (no `apps/api/src/common/` Nest guards).

### 1.4 Module boundaries

Backend modules mirror feature groups (FG-*) and the API endpoint groups (API-SPECIFICATION §6.1-§6.15). See §2 for the full list. Rules (ARCHITECTURE §6):

- Modules communicate only through **application-layer use cases / shared contracts** (`packages/contracts`). Direct cross-module repository/domain access is prohibited (FOLDER-STRUCTURE §2.2).
- **Financial modules** (`commission`, `ewallet`, `withdrawal`, `payout`, `voucher`) may mutate the ledger **only through the ledger's own application services** - single writer for balance invariants.
- Financial records are **append-only**; corrections are new transactions (BR-LED-002).
- `referral` and `reporting` never compute multi-level commission (BI-004).
- Status enums match BUSINESS-RULES §5 exactly - no invented states (FOLDER-STRUCTURE §9.8).

### 1.5 Request-to-response flow (Vercel Functions)

```
HTTPS (Vercel Edge) → Vercel Function handler (`api/<domain>/[id].ts`)
  → middleware: requestId, log context, rate limiting, Supabase JWT verify (Q3)
  → authZ: MemberRole lookup + RBAC + RLS + ownership/eligibility (as scoped)
  → Zod validation (handler layer, `packages/contracts`)
  → service: open Supabase transaction, orchestrate, apply domain rules, commit
  → persistence: Supabase client / parameterized SQL (RLS)
  → map result → response shape / envelope
  → global error mapper → error envelope
```

Request context (`requestId`) is propagated into logs and the error envelope for correlation (API-SPECIFICATION §3).

### 1.6 Relationship with frontends and external systems

- **Frontends** (`apps/web`, `apps/admin`, `apps/merchant`): read-only REST consumers over HTTPS; typed via `packages/contracts`. Authorization is always server-enforced; the frontend is never trusted (ARCHITECTURE §3 trust boundary 2; FRONTEND-ARCHITECTURE §8).
- **External integrations** (all untrusted): email, geolocation (IP/GPS), push, CTO Signing Service, external payout platforms - each behind a port/adapter interface (ARCHITECTURE §8). See §5.4 and §17.

---

## 2. Backend Module Architecture

### 2.1 Module inventory (mirrors FG-* and FOLDER-STRUCTURE §2.1)

| Module | Features | Focus |
|---|---|---|
| `auth` | FEAT-002, FEAT-009 | Session login/logout/refresh, email verification flow |
| `members` | FEAT-007..013 | Registration, profiles, qualification, admin approval/rejection |
| `geolocation` | FEAT-014..018 | Abroad location checks, exceptions (P11) |
| `referral` | FEAT-019..023 | Single-level referral, sponsor governance, immutable codes |
| `catalog` | FEAT-024..026 | Customers, property catalog, value snapshots |
| `sales` | FEAT-027..032, FEAT-037/038 | Sale submission/approval/verification/locking; cancellation |
| `commission` | FEAT-033..041 | Commission creation, clearing scheduler, reversals (no MLM) |
| `ewallet` | FEAT-042/043/071 | Append-only ledger, available balance, financial adjustments |
| `payout` | FEAT-044..047 | Payout account records and verification |
| `withdrawal` | FEAT-048..051 | Reservation, completion, rejection/release |
| `voucher` | FEAT-052..058 | Issuance (via signing), atomic redemption, history |
| `signing` | FEAT-059 | Client to CTO signing service (verify-only in app) |
| `content` | FEAT-060..063 | Media, policies, broadcasts/push |
| `reporting` | FEAT-064..067 | Genealogy/report views (reporting-only, no MLM) |
| `programs` | FEAT-068/069 | Domestic/Abroad program separation (gated OD-001..005) |
| `config` | FEAT-005 | Dynamic business parameters (BR-CFG-001) - no redeploy for changes |
| `audit` | FEAT-004 | Immutable audit trail (NFR-SEC-002, NFR-AUD-001) |

### 2.2 Module responsibilities

Each module owns its horizontal slice end-to-end: controllers (presentation), DTOs, use cases, domain rules, and repositories - under `apps/api/src/modules/<module>/` with the hexagonal layout of FOLDER-STRUCTURE §2.2. Shared cross-module primitives (DTOs, schemas, enums, error codes) live **only** in `packages/contracts` (FOLDER-STRUCTURE §4.1, §9.6).

### 2.3 Inter-module communication and dependency rules

- **Allowed:** a module's application services (use cases) may call another module's **application services** and read shared contracts from `packages/contracts`.
- **Prohibited:** importing another module's repository, domain internals, or controllers (FOLDER-STRUCTURE §2.2, ARCHITECTURE §6).
- **Ledger single-writer:** balance mutations flow only through `ewallet`'s ledger application services; `commission`, `withdrawal`, `payout`, `voucher`, and `sales` (cancellation/reversal) call those services - they never write ledger tables directly.
- **Config is read, not duplicated:** any module needing a business parameter reads it through the `config` module's application service (BR-CFG-001, NFR-MAINT-001). No module hard-codes configurable values.

### 2.4 Separation of concerns (summary)

| Concern | Owner | Never |
|---|---|---|
| HTTP semantics | controllers | business decisions |
| Orchestration + transactions | use cases | framework/DB coupling |
| Business rules/calculations | domain layer | framework/DB dependencies |
| Data access | repositories | SQL outside repositories |
| External I/O | infrastructure adapters | domain logic |

---

## 3. Controllers

Derived from ARCHITECTURE §5 (API layer) and FOLDER-STRUCTURE §2.2.

- **Responsibilities:** handlers define routes as Vercel Functions (`api/<resource>/[id].ts`, kebab-case plural nouns - API-SPECIFICATION §1.1), receive validated data, call one service, and return a mapped response (`{ data, meta }` for collections).
- **Route handling:** one handler file per resource group; routes match endpoint inventory in API-SPECIFICATION §6. HTTP methods/status codes per §1.2.
- **Request parsing:** handlers receive **already-validated** DTOs (Zod in-handler, §7). Handlers never hand-parse beyond `req.json()` + Zod.
- **Authentication/authorization integration:** middleware verifies Supabase JWT server-side (Q3) + `MemberRole` lookup, then RBAC/ownership checks (see §8/§9). Handlers declare required roles; they do not implement checks inline beyond calling the middleware.
- **Delegation to services:** handler body is a thin call to a service (e.g., `submitSale(dto, principal)`), then returns the result.
- **Response handling:** shared helper shapes responses (envelope for errors, `{ data, meta }`); handlers return domain-shaped results, never raw DB rows.
- **What handlers must NOT contain:** business logic, domain rules, calculations, direct DB access, transaction management, sensitive leakage.

---

## 4. Services / Use Cases

Derived from ARCHITECTURE §5 (application layer) and FOLDER-STRUCTURE §2.2 (`application/`).

- **Business logic placement:** the **application layer** orchestrates; the **domain layer** decides. Use cases compose domain rules and repositories; they hold no framework-specific logic.
- **Service responsibilities:** load/verify the aggregate, apply domain rules and calculations, enforce authorization preconditions (ownership/eligibility), open/commit the transaction boundary, emit required audit events, and map results for the controller.
- **Use-case boundaries:** one use case = one business operation (e.g., `submit-sale`, `approve-sale`, `request-withdrawal`, `redeem-voucher`, `apply-financial-adjustment`). Files named `<verb>-<noun>.usecase.ts` (FOLDER-STRUCTURE §6). Use cases are the **only** cross-module entry point.
- **Service dependencies:** inject repositories (own module), domain services/rules (own module), other modules' **application services** (cross-module), the audit service, and infrastructure ports (adapters). Never inject another module's repositories or domain internals.
- **Business-rule enforcement:** every use case validates the business preconditions in BUSINESS-RULES.md (e.g., seller must be Active + Qualified - BR-SAL-001; withdrawal ≤ Available Balance - BR-WAL-002; mandatory rejection reasons - BR-REG-004/BR-SAL-005/BR-WDR-004; single-level referral only - BR-REF-002). Rules live in the domain layer and are called by the use case, not inlined in controllers.
- **Transaction ownership:** the use case opens, commits, or rolls back the transaction; repositories participate; the domain layer never manages transactions (§12).

---

## 5. Repositories / Data Access

Derived from ARCHITECTURE §5 (persistence layer) and TECH-STACK §5/§6.

### 5.1 Repository responsibilities

- Own all SQL for the module: Drizzle typed queries for reads/CRUD (CONFIRMED ARCH-DEC-004); **raw SQL** for hot financial writes (ledger posts, balance updates, redemption) with explicit locking and transaction control (PROPOSED - TECH-STACK §6).
- Execute **parameterized queries only**; repositories never concatenate user input into SQL (API-SPECIFICATION §8 - injection control).
- Map rows to domain-shaped results / DTOs; never leak raw schema shapes upward.

### 5.2 Database access rules

- Repositories are the **only** components that touch the database within a module (ARCHITECTURE §5, FOLDER-STRUCTURE §2.2). Services/controllers never run SQL.
- **Financial immutability (BI-005):** no UPDATE/DELETE on financial tables - enforced by schema design and DB roles (§9, §17). Corrections are new ledger transactions (BR-LED-002).
- **Money is `NUMERIC`** (exact decimal) - never floating point (TECH-STACK §5, BR-WAL-002). Repositories parse/return decimal strings/`numeric`, never floats.
- DB roles mirror app roles and enforce least privilege (API-SPECIFICATION §8): a runtime app role with no DDL; a migration role used only for schema changes; restricted privileges on financial tables.
- Migrations are **versioned SQL migrations** in `apps/api/src/database/migrations/` (Drizzle Kit / SQL - PROPOSED). Destructive migrations require approval (§21).

### 5.3 Query organization

- Typed reads through Drizzle for the bulk of queries (listings, admin queues, catalog).
- Raw SQL for the hot paths that need explicit control: balance queries and ledger posts (`SELECT ... FOR UPDATE`), voucher redemption (atomic decrement + unique constraint), reservation/release.
- Pagination/filtering/sorting implemented per API-SPECIFICATION §4: page-based for admin lists, cursor-based for ledger/financial streams, **allowlisted** sort/filter keys per endpoint (never arbitrary column names).

### 5.4 Data-access boundaries / infrastructure ports

- Repositories talk only to the primary PostgreSQL schema.
- External stores (object/file storage for media - FEAT-060) are accessed via infrastructure adapters, not repositories.
- Session storage is DB-backed (PROPOSED - TECH-STACK §7); session reads/writes go through the auth module's persistence, not ad-hoc SQL.

### 5.5 Transaction interaction

Repositories participate in the transaction opened by the use case: they execute within it, apply row locks where required, and never commit/rollback themselves (the use case controls the boundary). See §12.

---

## 6. DTOs / Schemas

Derived from API-SPECIFICATION §1.3/§3 and FOLDER-STRUCTURE §4.

- **Request DTOs:** typed, validated by Zod schemas; defined once in `packages/contracts` (single source shared with frontends). Controller receives the validated DTO. Files `<name>.dto.ts` (FOLDER-STRUCTURE §6).
- **Response DTOs:** typed shapes returned by endpoints - single resource directly; collections as `{ data, meta }` with `meta.pagination` (API-SPECIFICATION §1.1/§4). Never expose internal entity fields beyond the contract.
- **Domain models:** internal entities/value objects in the module's `domain/`; they are framework-free and never serialized directly to the API.
- **Mapping rules:** controllers/interceptors map domain results → response DTOs; repositories map rows → domain shapes. Mapping is explicit; no automatic serialization of entities.
- **Input/output separation:** request DTOs ≠ response DTOs ≠ domain entities. A field accepted on input is not automatically output.
- **Type-safety requirements:** `strict` TypeScript; no `any`; shared types from `packages/contracts` re-exported (DEVELOPMENT-GUIDELINES §2). Status enums mirror BUSINESS-RULES §5 exactly; error codes mirror API-SPECIFICATION §3 (FOLDER-STRUCTURE §9.8).

---

## 7. Validation

Derived from API-SPECIFICATION §1.3, TECH-STACK §8, and NFR-INT-001.

**Trust boundary: all client-provided data and all external system responses are untrusted.** Validation is layered and each layer has a distinct responsibility:

| Layer | Responsibility | Failure mapping |
|---|---|---|
| **Presentation (Zod pipes)** | Request shape/type/format: required fields, bounds, enums, money as exact decimals (floats rejected), mandatory reasons (BR-REG-004, BR-SAL-005, BR-WDR-004, FR-ADJ-002) | 400 `VALIDATION_ERROR` |
| **Application / domain** | Business-rule validation: eligibility (Active + Qualified - BR-SAL-001), balance rules (BR-WAL-002), state transitions (BUSINESS-RULES §4), config-driven limits | 409 `CONFLICT` / 422 business codes / 403 |
| **Database** | Final backstop: `CHECK` constraints (balance ≥ 0 - BI-001), unique redemption (BI-007), NOT NULL, FKs; append-only financial tables (BI-005) | mapped to business codes (never raw) |
| **Infrastructure adapters** | Validate external responses (schemas) before use; treat provider data as untrusted | mapped to generic `INTERNAL` (retryable); a dedicated code/status requires API-SPECIFICATION approval |

- **Schemas:** all request/response and external-response schemas in `packages/contracts` (single source) and validated with Zod (PROPOSED - TECH-STACK §8). No ad-hoc per-app duplicate schemas (FOLDER-STRUCTURE §9.6).
- **Malformed input:** rejected at the presentation layer before any business logic; 400 `VALIDATION_ERROR` with field details that contain no internals.
- **Invalid states:** guarded in domain rules and DB constraints; mapped to 409 `CONFLICT` or the specific business code (e.g., `SALE_LOCKED`, `VOUCHER_ALREADY_REDEEMED`).
- **Money/rates:** exact-decimal parsing everywhere; float math is prohibited on any financial value (TECH-STACK §8, BR-COM-001/002).

---

## 8. Authentication (Q1/Q3 Supabase JWT)

Derived from ARCHITECTURE §9, TECH-STACK §7, API-SPECIFICATION §2.1 as updated Q1/Q3.

- **Mechanism (CONFIRMED Q1/Q3):** **Supabase Auth JWT** (PKCE, `supabase.auth.signInWithPassword` via `supabase-js`, `cookieStorage` cross-port `5173↔5174` per `supabase.ts:33-48`) **verified server-side** on every Vercel handler. The handler extracts the JWT from `Authorization: Bearer` or Supabase cookie and calls `supabase.auth.getUser` / verifies via `SERVICE_ROLE_KEY` + RLS. No `HttpOnly` DB session for v1 (supersedes ARCH-DEC-007 - see ADR-002b).
- **Flow:** `supabase.auth.signInWithPassword` establishes the session; `supabase.auth.signOut` invalidates it; `POST /auth/verify-email` remains the email-verification gate before approval (BR-AUTH-001). No `/auth/refresh` DB session for v1 (Supabase handles refresh via `autoRefreshToken`).
- **Email verification is a hard gate** before account approval (BR-AUTH-001, NFR-AUTH-002) - a member cannot be Approved-Active without it.
- **Session handling:** Supabase session (JWT) + `Member`/`MemberRole` lookup for RBAC (`normalizeRole`, `session.tsx:89-141`). `auth.uid()=id` RLS as defense-in-depth. DB `sessions` table not used for v1.
- **Authentication middleware:** a Vercel middleware resolves the Supabase principal for every protected handler except `PUBLIC` endpoints; it never trusts client claims beyond JWT verification.
- **Protected endpoints:** every endpoint is authenticated unless explicitly `PUBLIC` in API-SPECIFICATION §6. `/auth/me` requires a valid JWT. Health (`/health`) is public.
- **Failure behavior:** no/invalid/expired JWT → 401 `UNAUTHORIZED`; expiry → 401 and client routes to login. Never 403 for missing authentication (API-SPECIFICATION §1.2).
- **Internal service calls:** use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) - never user JWT for seed/migration.
- **CSRF:** JWT in `Authorization` header needs no CSRF; if cookie-based, `SameSite=Lax` + `VITE_SUPABASE` cookie is used - still `REQUIRES APPROVAL` for any cookie state-changing flow (§21).

---

## 9. Authorization

Derived from NFR-AUTHZ-001/002, ARCHITECTURE §9, API-SPECIFICATION §2.2. **The frontend is never the security boundary; the API authorizes every request server-side.**

- **RBAC / permission model:** roles per BUSINESS-RULES §3 (Super Admin, Admin, Finance, Member, Active + Qualified, Merchant; plus CTO and Customer as non-system roles). Guards enforce role scoping for every endpoint (NFR-AUTHZ-001). Role shorthand per API-SPECIFICATION §2.2 (`PUBLIC`, `MEM`, `AQ`, `ADM`, `FIN`, `SUP`, `MRCH`, `SYS`).
- **Resource ownership (object-level):** every member-scoped resource verifies the session principal owns it (NFR-AUTHZ-002) - prevents IDOR/BOLA. Staff roles use staff-scoped paths; no staff role acts on a member's behalf through member endpoints (API-SPECIFICATION §2.2).
- **Business eligibility is separate from roles:** a `MEM` role does not imply eligibility to submit sales (requires Active + Qualified - BR-SAL-001) or to withdraw; eligibility checks return 403/422 `MEMBER_NOT_QUALIFIED`/`PAYOUT_ACCOUNT_UNVERIFIED` as applicable.
- **Privileged operations:** approvals, verifications, exceptions, adjustments, cancellations, reopening, and voucher issuance are staff-only and **audited** (NFR-SEC-002, NFR-AUD-001). Financial adjustments are Super Admin only (BR-ADJ-*).
- **Server-side enforcement:** guards (RBAC, ownership, eligibility) run on every request path; no client assertion is trusted. Object existence is not revealed - 404 hides others' resources (API-SPECIFICATION §1.2, §8).
- **Least privilege:** endpoints expose only what the role needs; DB roles mirror app roles; financial tables forbid UPDATE/DELETE; the migration role is separate from the runtime role (§5, §17).
- **Failure behavior:** authenticated but unauthorized → 403 `FORBIDDEN`; business-rule ineligibility → 422 (or 409 for state conflicts); unauthenticated → 401. Never 401 for authorization failures (API-SPECIFICATION §1.2).

---

## 10. Error Handling

Derived from API-SPECIFICATION §3/§8.

- **Single error envelope** for all failures:

```json
{ "error": { "code": "SALE_LOCKED", "message": "...", "details": {}, "requestId": "...", "timestamp": "..." } }
```

- **Error classes and mappings:**

| Category | Mapping | Code |
|---|---|---|
| Validation errors (malformed/missing/invalid input) | 400 | `VALIDATION_ERROR` |
| Authentication errors (missing/invalid/expired session) | 401 | `UNAUTHORIZED` |
| Authorization errors (role/eligibility/ownership) | 403 | `FORBIDDEN` / voucher codes |
| Not-found (incl. hiding others' resources) | 404 | `NOT_FOUND` |
| Conflict (state, balance, locks) | 409 | `CONFLICT`, `SALE_LOCKED`, `INSUFFICIENT_BALANCE`, `RESERVATION_CONFLICT`, `VOUCHER_*` |
| Business-rule violations | 422 | `MEMBER_NOT_QUALIFIED`, `REJECTION_REASON_REQUIRED`, `PAYOUT_ACCOUNT_UNVERIFIED` |
| Rate limited | 429 | `RATE_LIMITED` |
| Unhandled server error | 500 | `INTERNAL` (generic) |
| External-service failure / dependency unavailable | 500 (retryable semantics via `Idempotency-Key`) | `INTERNAL` (generic) |

- **Database errors:** unique-violation / check-violation / lock-timeout are caught and mapped to the corresponding business code (e.g., double redemption → 409 `VOUCHER_ALREADY_REDEEMED`); raw DB messages are never surfaced.
- **External-service failures:** time-bounded calls; failures mapped to a safe, generic client response with server-side logging; idempotent operations remain safe to retry (client retains `Idempotency-Key`).
- **Timeout/failure scenarios:** request timeouts, external timeouts, and job failures never leave partial ledger state (§12).
- **Logging vs client-visible errors:** stack traces and internals go to server logs only; the client receives only the envelope. 500s are generic; sensitive/private details are never included.
- **Sensitive-information protection:** no PII/financial data in error responses; profiles/IDs redacted where not required (API-SPECIFICATION §8); secrets never appear in any error payload.

---

## 11. Logging

Derived from TECH-STACK §3 (Pino - PROPOSED) and NFR-AUD-001/NFR-SEC-002/NFR-CONF-001.

- **Strategy:** structured JSON logs (Pino, PROPOSED) for all runtime components (API and worker). Human-readable logs only in local dev.
- **Log levels:** `debug` (verbose dev), `info` (request lifecycle, business events), `warn` (recoverable anomalies, external timeouts), `error` (failures with stack), `fatal` (process-level). Level configurable per environment.
- **Request/error context:** every log line carries `requestId`, `method`, `path`, `status`, and - where safe - `principalId`/`role`. Errors log `error.code` and stack server-side.
- **Security considerations:** audit records (NFR-SEC-002, NFR-AUD-001) are written to the immutable `audit` store by the audit service - **audit is not application logging** and is never truncated/rotated by log rotation.
- **Sensitive-data restrictions:** no PII, no financial figures beyond operational identifiers, no password/secret material, no full ID numbers, no cookie/session values (NFR-CONF-001, NFR-DATA-001; API-SPECIFICATION §8 - "No PII/financial data in logs").
- **What must never be logged:** passwords, verification tokens, session ids/values, `Idempotency-Key`s (they are sensitive replay tokens), voucher payloads/signatures, payout account numbers, and any secret from environment/secret manager. Use redaction fields in the logger config.

---

## 12. Transactions

Derived from ARCHITECTURE §2.1/§12, TECH-STACK §5, NFR-INT-001/ATOM-001/ATOM-002, BI-001/BI-005/BI-007.

- **Single ACID boundary:** the modular monolith keeps all financial operations inside one transactional database/application boundary (ARCHITECTURE §2.1). No distributed transactions, no event brokers.
- **When transactions are required:** every mutation that touches the ledger or balances (commission creation/clearing/reversal, withdrawal reservation/completion/rejection-release, financial adjustments, voucher redemption, sale qualification) runs in a transaction opened by the **use case** (application layer, §4). Reads outside a transaction except where snapshot/cursor pagination needs it.
- **Atomic operations:**
  - **Balance invariants (BI-001/BI-002/BI-005):** balance updates validated against ledger within the same transaction; `CHECK` constraints at the DB as backstop.
  - **Voucher redemption (BI-007, NFR-ATOM-001):** single transaction with a unique redemption constraint; exactly one success under concurrency; `Idempotency-Key` prevents replay.
  - **Withdrawal reservation/release (NFR-ATOM-002):** row-locked balance update + reservation record atomically; rejection releases the reservation and restores balance in the same transaction.
  - **Sale qualification → commission creation:** commission created as `Pending` atomically with the qualifying-sale transition.
- **Rollback behavior:** on any failure the transaction rolls back entirely; rejected/retried operations never partially apply to the ledger (ARCHITECTURE §12). Rollback also covers audit writes (they commit with the same transaction where required by the rule).
- **Data consistency:** append-only ledger is the source of truth; balances are derived/validated from ledger entries (TECH-STACK §5). Corrections are new transactions (BR-LED-002), never edits.
- **Concurrency considerations (PROPOSED - TECH-STACK §5):** default isolation `READ COMMITTED`; explicit row locks (`SELECT ... FOR UPDATE`) for balance/reservation paths; `SERIALIZABLE` or equivalent where race-prevention demands it (redemption, balance mutation). The exact isolation strategy per operation is REQUIRES APPROVAL (§21).
- **Avoiding partial state:** single writer for balances (ledger application services only, ARCHITECTURE §6); idempotency keys stored server-side so retries return the stored response without re-applying side effects (API-SPECIFICATION §5.3).

---

## 13. Background Jobs

Derived from FOLDER-STRUCTURE §2 (worker), ARCHITECTURE §10/§12, TECH-STACK §3, FEATURES FEAT-036.

**Currently required background work:**

1. **Commission Clearing Scheduler (FEAT-036, P5)** - the only business-required scheduled job:
   - Moves commissions `Pending → Available` after the configurable clearing period (default 7 days; changes apply to **future** commissions only - BR-COM-007, BR-CLC-002, AC-COM-001).
   - Runs in a **worker process** (`apps/api/src/jobs/`, `infra/docker/worker.Dockerfile`) with **lease-based single-writer semantics** so multiple workers do not double-process (ARCHITECTURE §10).
   - **Retry/failure:** failed batches retry with the lease; failures are recorded (audit/job log) and never partially applied (each clearing action is transactional, §12).
   - **Idempotency:** a commission clears at most once (state check + constraint); the worker is safe to rerun.
   - **Scheduling:** interval-driven (node-cron) or queue (BullMQ) - both PROPOSED (TECH-STACK §3); the concrete queue/scheduler choice is REQUIRES APPROVAL (§21).
2. **Outbound notification dispatch (email/push)** - asynchronous delivery via infrastructure adapters (FEAT-006 email, FEAT-063 push). Delivery is behind ports; a durable queue is only introduced when required and approved - **do not invent a queue** (ARCHITECTURE §8; simplest architecture principle).

**Explicitly out of scope:** distributed job frameworks, event brokers, or stream processing (TECH-STACK §16 - premature distributed systems). If additional background work becomes required (e.g., voucher expiry, report generation), it is documented here only after approval.

---

## 14. Caching

**Decision: caching is NOT currently required.** This is explicit, not an omission (simplest-architecture principle, ARCHITECTURE §15; NFR-PERF-001 targets are TBD - do not introduce caching for theoretical benefit).

- **Cache boundaries if introduced later (REQUIRES APPROVAL):** read-only, non-authoritative data only (e.g., public config values, catalog reads). **Never** cache balances, ledger, or any financial truth - correctness over performance (ARCHITECTURE §10).
- **Cacheable data (candidates only, not adopted):** `config` public parameters (short TTL + invalidation on `PATCH /config`), read-heavy catalog media metadata.
- **Invalidation strategy (if adopted):** must be explicit and correct - config changes invalidate immediately (NFR-MAINT-001); no stale financial display.
- **TTL considerations:** TTLs never extend beyond the operation's freshness requirement; financial views always read live (FRONTEND-ARCHITECTURE §10).
- **Consistency:** any cache is eventually-consistent with the DB; it must never be the source of truth and never on a financial path.
- **Security implications:** cached responses must not leak data across principals - no caching of member-scoped responses (NFR-AUTHZ-002). A shared external cache (e.g., Redis) is REQUIRES APPROVAL.

---

## 15. Observability

Derived from TECH-STACK §12 (metrics/APM deferred, targets TBD) and NFR-AVAIL-001/PERF-001/REL-001 (TBD).

- **Application monitoring:** structured logs (§11) with `requestId` correlation; log aggregation is a deployment-stage decision (ARCH-DEC-008 - REQUIRES APPROVAL).
- **Health checks (PROPOSED):** `/health` (liveness) and `/ready` (readiness: DB connectivity, session store, critical adapters) endpoints for the orchestrator/load balancer.
- **Error tracking:** server-side error logs with stack + correlation; **no PII/financial data** captured. Third-party error tracking is REQUIRES APPROVAL (dependency).
- **Metrics:** metrics/APM are deferred until NFR-PERF-001 targets are approved (TECH-STACK §12). If introduced, scope is read-path and operational counters - never financial values.
- **Request tracing:** `requestId` in the envelope and logs today; distributed tracing only if the deployment (ARCH-DEC-008) requires it - REQUIRES APPROVAL.
- **Database/external-service monitoring:** slow-query and connection monitoring are deployment-stage (REQUIRES APPROVAL); adapter timeouts/errors are logged server-side (§11).
- **Operational visibility:** the worker (clearing scheduler) logs per-batch results and failures; audit store covers decisions/events (NFR-SEC-002). Availability/reliability/performance **targets are TBD (NFR-AVAIL/PERF/REL/SCAL-001)** - do not invent numbers.

---

## 16. API Implementation Rules

Align strictly with `API-SPECIFICATION.md`; **do not redefine the contract.**

- **Route implementation:** controllers map exactly the endpoint inventory of API-SPECIFICATION §6 (paths, methods, roles, features, requirements). Kebab-case plural nouns; sub-resource verbs only where no noun fits.
- **HTTP methods:** GET (read, no side effects), POST (create/action), PATCH (partial update of mutable non-financial fields), PUT avoided; DELETE prohibited on financial records (API-SPECIFICATION §1.2).
- **Status codes:** 200/201/204 success; 400/401/403/404/409/422/429/500 per §1.2 table. Business-eligibility failures are 403/422 - never 401.
- **Request/response handling:** `application/json`; base path `/api/v1`; collections `{ data, meta }`; single resources direct; errors via the envelope (§10).
- **Validation:** Zod schemas from `packages/contracts` at the presentation layer before business logic; mandatory rejection reasons enforced; floats rejected for money (§7).
- **Authentication:** session cookie per §8; internal calls use short-lived secret-manager tokens, never user cookies.
- **Authorization:** RBAC + ownership/eligibility guards per §9 on every endpoint; never trust client authorization.
- **Error contracts:** envelope with `code`, `message`, `details`, `requestId`, `timestamp`; codes from the §3 table only (additions require API-SPECIFICATION change → approval).
- **Pagination/filtering/sorting:** page-based for admin lists (default 50, max 100); cursor-based for ledger/financial streams; allowlisted sort/filter keys per endpoint; never unbounded responses (API-SPECIFICATION §4).
- **Idempotency:** `Idempotency-Key` (UUID) required on `POST /sales`, `POST /me/withdrawals`, `POST /vouchers/:id/redemptions`, `POST /financial-adjustments`; server stores key→response; retries return stored response without re-applying side effects; TTL 24h PROPOSED/REQUIRES APPROVAL (API-SPECIFICATION §5.3).
- **Rate limiting:** per-IP and per-user; strict limits on `/auth/login`, `/auth/register`, `/auth/verify-email`, `POST /vouchers/:id/redemptions`; limits configurable (BR-CFG-001), exact values TBD (API-SPECIFICATION §5.2).
- **API versioning:** URI prefix `/api/v1`; breaking changes create `/api/v2` with deprecation per phase (API-SPECIFICATION §5.1).
- **OpenAPI/documentation:** OpenAPI 3.1 generated from Nest controller metadata, published at `/api/v1/docs`; every endpoint documents auth, request/response schemas, and error codes; `packages/contracts` Zod schemas generate the typed client types (API-SPECIFICATION §5.4).

---

## 17. Security-by-Design Requirements

All client-provided data and all external systems are **untrusted**. Controls are applied at the API tier on every request (ARCHITECTURE §3, API-SPECIFICATION §8).

| Risk | Required control |
|---|---|
| **Broken access control / excessive permissions** | RBAC guards per BUSINESS-RULES §3 on every endpoint; least-privilege roles; no staff endpoint exceeds the role's need; DB roles mirror app roles (NFR-AUTHZ-001, NFR-SEC-001) |
| **Object-level authorization failure (IDOR/BOLA)** | Ownership verification of every member-scoped resource against the session principal; staff-scoped paths only; 404 hides others' resources (NFR-AUTHZ-002) |
| **Injection** | Parameterized queries only; repositories never concatenate SQL; allowlisted sort/filter/schema keys (API-SPECIFICATION §8) |
| **Authentication weaknesses** | Session-based HttpOnly/Secure/SameSite cookies (ARCH-DEC-007); email-verification hard gate (BR-AUTH-001); session rotation on refresh; password policy TBD (ASSUMPTION 1) |
| **Sensitive-data exposure** | HTTPS-only; error responses generic (no internals); no PII/financial data in logs or responses; redaction; secrets never in responses (NFR-CONF-001) |
| **Improper input validation** | Zod schemas on all requests (presentation layer); strict money/rate formats; business-rule + DB constraint layers (§7) |
| **Abuse / rate limiting** | Per-IP and per-user limits; strict on auth and redemption endpoints; values configurable (API-SPECIFICATION §5.2) |
| **Secrets management** | All secrets via environment/secret manager per environment; never in source; `.env*` ignored; separate service tokens (TECH-STACK §12, API-SPECIFICATION §8) |
| **Sensitive logging** | Redaction fields; audit (immutable) separate from runtime logs; never log PII/financial data (§11) |
| **Database security** | Least-privilege DB roles; no UPDATE/DELETE on financial tables (BI-005); migrations via separate role; parameterized access (§5) |
| **External-service trust boundaries** | Every integration behind a port/adapter; external responses validated; outbound only for money movement records (no inbound money hooks); app can only **verify** signatures (BI-008); time-bounded calls (§5.4, §10) |
| **Dependency/security considerations** | Supply-chain review before adding dependencies; no prohibited technologies (TECH-STACK §16); versions pinned once manifests exist (TECH-STACK §14) |
| **CSRF** | Cookie-authenticated state-changing requests require CSRF protection (API-SPECIFICATION §8); mechanism REQUIRES APPROVAL (§21) |

---

## 18. Backend Architecture Principles

Derived from ARCHITECTURE §15 and DEVELOPMENT-GUIDELINES §14.

1. **Correctness over distribution** - single transactional boundary; no premature microservices (ARCH-DEC-001).
2. **Immutability-first for financial data** - append-only ledger; corrections are new transactions (BR-LED-001/002, BI-005).
3. **Single writer for balance** - ledger application services are the only path that mutates balances (ARCHITECTURE §6).
4. **Security-by-design** - server-side authorization on every request; least privilege; secrets out of code (§17).
5. **Trust boundaries explicit** - especially the CTO signing boundary, never weakened (BI-008, ARCHITECTURE §15).
6. **Simplest architecture that satisfies approved requirements** - no speculative infrastructure, caching, queues, or microservices (ARCHITECTURE §15).
7. **Module boundaries mirror feature groups (FG-*)** for traceability and incremental delivery (ARCHITECTURE §15).
8. **Domain free of framework dependencies** - testable, durable business rules (§1.3, §4).
9. **No duplication of contracts** - DTOs/schemas/enums/error codes single-sourced in `packages/contracts` (FOLDER-STRUCTURE §9.6).

---

## 19. Layer Responsibilities (consolidated)

| Layer | Owns | Must not |
|---|---|---|
| Controllers | Routes, HTTP semantics, validated input, delegation | Business logic, DB access, transactions, sensitive leakage |
| Use cases (application) | Orchestration, transactions, cross-module calls, audit events | Framework/DB coupling, UI logic |
| Domain | Business rules, calculations, invariants, state machines | Framework/DB dependencies, persistence |
| Repositories (persistence) | Parameterized SQL, locking, migrations, snapshots | Business decisions, external I/O |
| Infrastructure adapters | Email, geolocation, push, signing client, storage | Business logic |

---

## 20. Backend Development Constraints

- **Current state is documentation-only:** no code, no manifests, no DB schema. Every version is REQUIRES VERIFICATION until a manifest exists (TECH-STACK §14). This document defines the target; it never claims an implemented system.
- **Stack constraints:** TypeScript / Vercel Functions / Supabase Postgres / RLS CONFIRMED (Q1); Zod, Pino, Vitest, pnpm/Turborepo, REST versioning PROPOSED - adopt only with approval where marked REQUIRES APPROVAL.
- **Prohibited (TECH-STACK §16):** payment gateway/card SDKs; wallet APIs moving money; float money; NoSQL as financial system of record; in-app MLM/network libs; auto-refund frameworks; signing key/HSM secret in source or app servers; premature distributed systems (brokers/microservices).
- **Architectural constraints (ARCHITECTURE §14):** single-level referral only; immutable financial records; Available Balance never negative; Pending never available; no money movement in JAD; master signing key never in app infrastructure; catalog values snapshotted; config-driven parameters; no automatic refund workflow; no TBD/OD-gated behavior without Owner approval.
- **Quality gates:** BI-001..BI-010 invariant tests in CI; concurrency tests for redemption/withdrawal races; unit (domain/use cases), API/e2e (Supertest), UI (Playwright) per TECH-STACK §10; acceptance criteria (AC-*) map to tests (ARCHITECTURE §11). Coverage targets TBD (REQUIRES APPROVAL).
- **Documentation discipline:** implement in phase order (ROADMAP P1..P12); update SSOT statuses per phase exit criteria (ROADMAP §9). Never modify existing SSOT documents without explicit instruction.

---

## 21. Architectural Decisions / REQUIRES APPROVAL

| Item | Reason | Decision required |
|---|---|---|
| CTO signing service mechanism (ARCH-DEC-006) | BI-008: master key must be CTO-controlled; mechanism not chosen | Approve KMS/HSM/air-gapped design |
| Deployment provider/region (ARCH-DEC-008) | Provider, region, orchestration, DB hosting OPEN | Approve provider/region/infra |
| NFR numerical targets (ARCH-DEC-009) | NFR-AVAIL/PERF/REL/SCAL have no approved numbers | Approve targets |
| Session store technology (DB-backed, PROPOSED) | TECH-STACK §7 PROPOSED; ARCHITECTURE §10 allows DB or token-based | Approve store |
| Session isolation/locking strategy | TECH-STACK §5 PROPOSED (`READ COMMITTED` + row locks + `SERIALIZABLE`) | Approve per-operation strategy |
| Idempotency-Key TTL (24h) | API-SPECIFICATION §5.3 PROPOSED | Approve TTL |
| Rate-limit values | API-SPECIFICATION §5.2 - values TBD | Approve limits |
| CSRF protection mechanism | API-SPECIFICATION §8 requires it; mechanism unspecified | Approve mechanism |
| Job scheduler/queue (BullMQ vs node-cron) | TECH-STACK §3 PROPOSED | Approve choice (only if a queue is needed) |
| Caching / Redis / read replicas | Not currently required (§14) | Approve if introduced |
| Password policy | ASSUMPTION 1 - TBD | Approve policy |
| Observability tooling / error tracker | TECH-STACK §12 deferred; targets TBD | Approve if introduced |
| Any new major dependency or destructive DB migration | Approval boundary (§ header) | Approve explicitly |

---

## 22. Relationship to Other Documentation

| Document | Relationship |
|---|---|
| BUSINESS-RULES.md | Source of BR-*/BI-* the backend enforces; role model §3; state model §5; transaction rules §4 |
| REQUIREMENTS.md | Source of FR-*/NFR-* (authN/AuthZ/audit/atomicity/integrity) that §8-§12 implement |
| FEATURES.md | FEAT-* module mapping (§2); FEAT-036 clearing scheduler (§13) |
| ROADMAP.md | Phase order P1..P12 and phase exit criteria drive implementation sequence and doc updates |
| ARCHITECTURE.md | Style (modular monolith), layers, boundaries, data flows, constraints, principles this doc operationalizes |
| API-SPECIFICATION.md | The exact API contract this doc implements (§16) |
| TECH-STACK.md | Approved/proposed technologies and prohibitions referenced throughout |
| FOLDER-STRUCTURE.md | Module layout, per-module hexagonal structure, naming, config locations (§2, §5) |
| FRONTEND-ARCHITECTURE.md | Frontend consumption patterns; shared `packages/contracts`; session/auth behavior |
| DESIGN-SYSTEM.md / UI-UX.md | UI conventions; backend only supplies the data/status vocabulary they render |
| DEVELOPMENT-GUIDELINES.md | Cross-cutting engineering standards (TypeScript strict, imports, dependencies) the backend follows |

---

## 23. Document Maintenance / Update Rules

- This document is part of the Technical Architecture SSOT; it is updated only through an explicit documentation task, per phase exit criteria (ROADMAP §9).
- Changes that affect another SSOT (business rules, API contract, auth, stack, structure) must update that SSOT first; this document then reflects it - never the reverse.
- Approved decisions (e.g., resolving any `REQUIRES APPROVAL` item in §21) must be recorded here and in ARCHITECTURE.md / API-SPECIFICATION.md / TECH-STACK.md as applicable before implementation proceeds.
- New modules, jobs, caches, or integrations are added here only after their feature/requirement exists in the source SSOT (FEATURES/REQUIREMENTS) - no speculative architecture.
- Version numbers and statuses (`REQUIRES VERIFICATION`) are refreshed only when manifests exist.
- Contradictions discovered during maintenance are reported, not silently resolved.