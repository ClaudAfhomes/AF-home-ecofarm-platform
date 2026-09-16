# JAD - Integration Specification SSOT (INTEGRATION-SPECIFICATION.md)

> **Authority:** Defines how the JA&D platform integrates with **external systems** (email, geolocation, payout, push, CTO signing service, object storage) and how those integrations behave under normal and failure conditions. Companion to `API-SPECIFICATION.md` (the API contract), `ARCHITECTURE.md` (modular monolith, trust boundaries), `BACKEND-ARCHITECTURE.md` (modules, adapters, operational concerns), and `TECH-STACK.md` (stack/statuses).
>
> **Status of integration points:** The repository contains **no implementation**. Every integration below is **PLANNED** unless marked otherwise. No external system is assumed beyond those named here; provider selections and numeric values that are not confirmed are marked accordingly.
>
> **Status vocabulary:** **CONFIRMED** (established requirement) · **PROPOSED** (recommended, not approved) · **ASSUMPTION** (working assumption) · **REQUIRES APPROVAL** (material decision) · **REQUIRES VERIFICATION** (value unconfirmed) · **TBD** (undecided).
>
> **Version:** Project 09 - API & Integration Engineering (Baseline v1.0)

---

## 1. Overview

The JA&D platform is a TypeScript full-stack modular monolith (ARCH-DEC-001, ARCH-DEC-002). It owns all business logic, authN/authZ, ledger, and workflow orchestration; **it never moves money** (BR-BND-001). Integration is therefore asymmetric: JA&D is a **consumer** of external commodity services (email, geolocation, push, object storage) and a **consumer of a restricted signing service**, while **payout execution is external and record-only** (FEAT-049).

Integration principles:

- **Consumer-first:** all external calls are initiated by JA&D through infrastructure adapters (BACKEND-ARCHITECTURE §2.1); no external system can trigger internal side effects except through the public API surface (API-SPECIFICATION §6).
- **Record-only financials:** external payout/payment events are recorded by staff actions, never auto-executed by JA&D (BR-BND-001, FR-SAL-003, FR-WDR-003).
- **Data-at-rest:** JA&D stores metadata and storage references only; binary blobs (media, ID documents, profile photos) live in external object storage (DATABASE-DESIGN A-08, §2).
- **Boundaries:** the only cryptographically trusted external party is the CTO-authorized signing service, and it is **sign-only** - JA&D can only verify (BI-008).

---

## 2. External Systems

| System | Purpose | Evidence | Auth direction | Status |
|---|---|---|---|---|
| Email service | Transactional email incl. email verification tokens (BR-AUTH-001, FR-AUTH-001) and broadcast emails | FEAT-006, ASSUMPTION 2 | JA&D → provider (API key) | Provider selection **OPEN** (ASSUMPTION 2) |
| Geolocation service | Registration location verification; device location + IP fallback; PH-block (BR-GEO-002) | FEAT-014/015, ASSUMPTION 3 | JA&D → provider | Accuracy threshold **BLOCKED OD-014**; anti-spoofing **BLOCKED OD-015** |
| Payout provider | External execution of withdrawals/payouts; JA&D records confirmation only | FEAT-047/049, ASSUMPTION 5 | Staff-action initiated; JA&D records result | Providers **BLOCKED OD-016** |
| Push notification service | Broadcast/announcement delivery to member devices | FEAT-063, ASSUMPTION 6 | JA&D → provider | Provider unconfirmed (ASSUMPTION 6) |
| CTO signing service | Voucher signing; JA&D verifies only; master key never in JA&D infrastructure (BI-008) | FEAT-052/059, ASSUMPTION 7 | JA&D → CTO service | CONFIRMED boundary; transport/method TBD |
| Object storage | Media, government ID documents, profile photos, landing/promo assets | DATABASE-DESIGN A-08, E-24 | JA&D ↔ provider | Adapter approach CONFIRMED; provider TBD |
| Authentication as platform capability | Credentials/session handling | FEAT-002, ASSUMPTION 1 | - | Credential policy **TBD** (ASSUMPTION 1) |

**Rules for any external system:** never expose provider credentials to clients; never place provider data in the primary DB except as metadata/storage references; every adapter call is time-bounded (BACKEND-ARCHITECTURE §11.7); provider failures must not produce raw provider errors to clients (API-SPECIFICATION §3).

---

## 3. Boundaries

Confirmed boundaries (must not be crossed without approval):

| Boundary | Rule | Evidence |
|---|---|---|
| No money movement | JA&D never initiates/executes payment or payout transfers; `POST /withdrawals/:id/complete` and `POST /sales/:id/verify-payment` record external execution only | BR-BND-001, FR-SAL-003, FR-WDR-003 |
| No automatic refunds | No automatic refund/cancellation workflow exists; corrections are new transactions | ARCHITECTURE §14; BR-LED-002, BI-005 |
| Signing boundary | JA&D can only **verify** signatures; the signing master key exists only in the CTO-controlled service; JA&D never signs | BI-008, FEAT-059, API-SPECIFICATION §8 |
| Storage boundary | Object storage holds blobs; the database holds metadata and storage references only; no blobs in primary DB | DATABASE-DESIGN §2, A-08 |
| No external-triggered writes | External providers never write into JA&D state; all state changes flow through the API use cases and the single-writer rule | ARCHITECTURE §6 |
| No webhook trust by default | Inbound webhooks from third parties are **not** confirmed and would be introduced only with approval (§6) | - |

---

## 4. Authentication & Authorization

### 4.1 Human principals
- **Session-based** auth for web clients: HttpOnly, Secure, SameSite cookies; `POST /auth/login` establishes, `POST /auth/logout` invalidates, `POST /auth/refresh` rotates (ARCH-DEC-007, API-SPECIFICATION §2.1). Session store is DB-backed (**PROPOSED**, BACKEND-ARCHITECTURE §8).
- RBAC guards enforce BUSINESS-RULES §3 on every endpoint; object-level ownership checks prevent IDOR/BOLA (NFR-AUTHZ-002). Staff never act through member `/me` scoped paths (API-SPECIFICATION §2.2).

### 4.2 Service-to-service (internal)
- Internal/service-to-service calls use a **separate, short-lived token** from the secret manager - never user cookies (API-SPECIFICATION §2.1, §2.2). The `SYS` identity is an internal service identity, not a database role (`accounts.role` CHECK: `MEMBER, ADMIN, FINANCE, SUPER_ADMIN, MERCHANT`).
- Used by the voucher signing/verification path (`POST /signing/verify`, SYS) and any future internal operation endpoints.

### 4.3 External providers
- Outbound calls authenticate to providers with provider-issued credentials stored **only** in environment/secret manager; never committed, never in logs, never sent to clients (API-SPECIFICATION §8, DEVELOPMENT-GUIDELINES).
- Provider identity verification (TLS certificate pinning or provider SDK verification) is a deployment-stage decision - **REQUIRES APPROVAL**.

---

## 5. Request/Response Mapping

### 5.1 Client ↔ JA&D (public contract)
- REST/HTTPS/JSON, base path `/api/v1` (API-SPECIFICATION §1.1).
- Collections: `{ data, meta }`; single resources returned directly; errors always use the error envelope (§3). Pagination/filtering/sorting per API-SPECIFICATION §4.
- Money/rates are exact decimals (`NUMERIC`); floats rejected (API-SPECIFICATION §1.3, BR-WAL-002).
- Every request validated against shared Zod schemas in `packages/contracts`; OpenAPI 3.1 generated from Nest metadata (`/api/v1/docs`) (API-SPECIFICATION §5.4).

### 5.2 JA&D ↔ external providers (adapter mapping)
- Each provider integration is isolated behind an infrastructure adapter (BACKEND-ARCHITECTURE §2.1); the domain layer never calls a provider directly.
- Provider errors are mapped to the error envelope with a **generic client-safe message**; provider-specific detail is logged server-side only (BACKEND-ARCHITECTURE §11.7, API-SPECIFICATION §3).
- External data entering JA&D (e.g., geolocation result, payout confirmation) is validated/narrowed with schemas before use (DEVELOPMENT-GUIDELINES §2.7 - `unknown` → narrowed).
- Confirmed mapping examples:
  - **Geolocation:** registration location check → result recorded as `Location Exception` request/decision (BR-GEO-003/004, FEAT-016) or PH-block rejection.
  - **Payout:** staff `POST /withdrawals/:id/complete` records the external confirmation (BR-BND-001); `POST /withdrawals/:id/reject` releases the reservation (BR-WDR-005).
  - **Signing:** voucher issuance payload → CTO service signature → stored `signed_payload`/`signature`; redemption verifies against the public key (FEAT-052/059, API-SPECIFICATION §7.3).

### 5.3 Client retry contract
- Idempotent reads: safe to retry (TanStack Query default).
- Non-idempotent mutations: **no automatic retry**; client resends with the same `Idempotency-Key` (DEVELOPMENT-GUIDELINES §5.2, API-SPECIFICATION §5.3).

---

## 6. Webhooks / Events

- **No inbound webhook endpoints are confirmed.** No third-party system is authorized to push state into JA&D. Any inbound webhook surface would require approval (§3 boundary) and a signed/authenticated delivery contract.
- **No outbound webhooks are confirmed.** External notification is limited to the push notification service (FEAT-063) and email (FEAT-006), both initiated by JA&D.
- **Outbound webhooks to partners (e.g., merchant/lead notifications) are PROPOSED / REQUIRES APPROVAL** and must not be built without an approved requirement.
- Internal event flow: the modular monolith uses in-process orchestration plus the database as the system of record (single-writer rule, ARCHITECTURE §6). Cross-module state (ledger, audit, notifications) is written in the same transaction (DATABASE-DESIGN §15.2). No external event bus is required or assumed.
- Broadcast → push: `broadcasts`/`notifications` entities (E-26/E-27) record intent; delivery dispatch to the push provider is an adapter concern (FEAT-063).

---

## 7. Reliability

- **Atomicity (NFR-ATOM-001/002):** financial mutations (sales, reservations, redemptions, adjustments, ledger entries, audit entries) commit in a single transaction; partial application is impossible on financial paths (API-SPECIFICATION §8; DATABASE-DESIGN §15).
- **Idempotency:** `Idempotency-Key` (UUID) required on `POST /sales`, `POST /me/withdrawals`, `POST /vouchers/:id/redemptions`, `POST /financial-adjustments`; server stores key → response; retries return the stored response (API-SPECIFICATION §5.3, BI-007). Keys hashed at rest (DATABASE-DESIGN §20, U-06).
- **Time-bounded external calls:** every adapter call has a timeout; failures map to a safe generic client response with server-side logging; idempotent operations remain safe to retry (BACKEND-ARCHITECTURE §11.7).
- **Reservation model:** withdrawals reserve funds at request (FR-WDR-002, BR-WDR-002); rejection releases the reservation; a new request is required (BR-WDR-005). Balance invariants BI-001/BI-002 enforced at DB layer.
- **Concurrency:** single-writer per aggregate; unique constraints enforce exactly-one-success on redemption (BI-007, `uq_redemption_idem`) and reservation races are rejected (`RESERVATION_CONFLICT`).
- **Circuit-breaking/fallback:** not required to be built until provider choices and targets are confirmed - **REQUIRES APPROVAL** when provider selection (OD-016, ASSUMPTIONS 2/3/6) is made.

---

## 8. Idempotency

Contract (mirrors API-SPECIFICATION §5.3):

| Concern | Rule |
|---|---|
| Header | `Idempotency-Key: <UUID>` required on the four financial mutations listed in §7 |
| Scope | Key scoped to (principal, operation); stored response returned on retry; no side effects re-applied |
| Storage | `idempotency_keys` table; key stored **hashed**; never logged (sensitive replay token) |
| TTL | 24h - **REQUIRES APPROVAL** |
| Failure | If the stored response is lost (e.g., cleanup), a repeated request creates a new side effect only if the operation is no longer the same logical action - documented per use case; invariants BI-007/BR-WDR-002 still hold |
| Never logged | `Idempotency-Key` values are redacted in logs (BACKEND-ARCHITECTURE §11) |

---

## 9. Failure Handling

- **Client errors:** error envelope with stable codes (§3 of API-SPECIFICATION); business-eligibility failures return 403/422, never 401.
- **External provider failures:** mapped to a generic safe response; provider details logged server-side only; audit unaffected (audit is immutable and separate from runtime logs - BACKEND-ARCHITECTURE §11).
- **Financial path failure:** any failure before commit rolls back the whole transaction; no partial ledger/audit state (DATABASE-DESIGN §15.2, NFR-ATOM-001/002).
- **Idempotent retry:** client retains and resends the `Idempotency-Key`; the server returns the original stored response (API-SPECIFICATION §5.3).
- **No auto-refund / no compensation workflow** exists (BR-BND-001; corrections are new transactions).
- **Graceful degradation:** read paths that depend on external content (media, forwardable content) surface a designed empty/error state; never raw provider errors or stack traces (UI-UX §10, FRONTEND-ARCHITECTURE §6.4).

---

## 10. Integration Security

| Concern | Control |
|---|---|
| Secrets | Provider credentials and signing material in environment/secret manager only; never committed (`.env*` ignored); never in logs/errors; `Idempotency-Key`s and voucher signatures never logged |
| Transport | TLS everywhere; no plaintext external calls |
| Outbound auth | Provider API keys / service tokens via secret manager; short-lived for internal service-to-service (never user cookies) |
| Signing boundary | JA&D verifies only (public key); master key only in the CTO-controlled service (BI-008) |
| Client-facing | CORS allowlist of first-party origins; CSRF protection for cookie-authenticated requests; strict rate limits on auth and redemption paths (API-SPECIFICATION §5.2, §8) |
| Logging | Redaction fields configured; audit trail (`audit_log`, insert-only) is separate from runtime logs and never truncated by log rotation (NFR-SEC-002, NFR-AUD-001) |
| IDOR/BOLA | Object-level ownership on every member-scoped resource; 404 hides others' resources (NFR-AUTHZ-002) |
| Injection | Parameterized queries only; repositories never concatenate SQL (API-SPECIFICATION §8) |

---

## 11. Monitoring & Observability

- **Health endpoints (PROPOSED):** `/health` (liveness) and `/ready` (readiness: DB connectivity, session store, critical adapters) for the orchestrator/load balancer (BACKEND-ARCHITECTURE §15).
- **Structured logs:** `requestId` correlation in the error envelope and logs; redaction fields per §10 (BACKEND-ARCHITECTURE §11).
- **Audit vs logs:** immutable audit trail for financial/exception events; runtime logs are operational and rotatable - never the two conflated.
- **Metrics/APM:** deferred until NFR-PERF-001 targets are approved (TECH-STACK §12); if introduced, scope is read-path and operational counters - never financial values (BACKEND-ARCHITECTURE §15).
- **Tracing:** distributed tracing only if the deployment (ARCH-DEC-008) requires it - **REQUIRES APPROVAL**.
- **External-service monitoring:** adapter timeouts/errors logged server-side; slow-query/connection monitoring is deployment-stage - **REQUIRES APPROVAL**.

---

## 12. External Dependency Assumptions

| # | Assumption | Status |
|---|---|---|
| ASSUMPTION 1 | Authentication as platform capability (credential policy not approved) | TBD - no mechanism approved |
| ASSUMPTION 2 | Email service is external | Provider selection **OPEN** |
| ASSUMPTION 3 | Geolocation services are external | Accuracy threshold BLOCKED OD-014; anti-spoofing BLOCKED OD-015 |
| ASSUMPTION 4 | Customers have no self-service access (members record them) | CONFIRMED (FR-CUS-001/002) |
| ASSUMPTION 5 | Payout providers are external | Final providers BLOCKED OD-016 |
| ASSUMPTION 6 | Push notification infrastructure is external | Provider unconfirmed |
| ASSUMPTION 7 | CTO signing service external to app infrastructure | Boundary CONFIRMED; transport/method TBD |
| A-08 (DATABASE-DESIGN) | Object storage external; DB holds metadata only | Adapter approach CONFIRMED; provider TBD |
| NFR targets | NFR-AVAIL-001, NFR-REL-001, NFR-PERF-001, NFR-SCAL-001 | TBD - **REQUIRES VERIFICATION** |

**Rule:** no new external dependency may be introduced beyond those above without an approved requirement and approval (ARCHITECTURE approval boundaries; BACKEND-ARCHITECTURE §21).

---

## 13. Testing Requirements

- **Contract tests:** request/response and error-code contracts are tested from `packages/contracts` (Zod schemas) against OpenAPI-generated types on both sides; a schema change fails CI.
- **Unit tests:** domain/use-case logic (Vitest) with provider adapters mocked/stubbed; business rules invoked from the domain layer (BACKEND-ARCHITECTURE §7).
- **Integration tests (Supertest):** API/e2e against the monolith with external providers **stubbed**; every confirmed integration (email, geolocation, payout, push, signing, object storage) has a stub that simulates success and each mapped failure.
- **Invariant tests:** BI-001..BI-010 run in CI (DEVELOPMENT-GUIDELINES §9); concurrency tests for redemption/withdrawal races (exactly-one-success, BI-007; `RESERVATION_CONFLICT`).
- **Idempotency tests:** replay of the same `Idempotency-Key` returns the stored response with no side-effect duplication for all four financial mutations.
- **Failure tests:** provider timeouts/errors map to the generic error envelope; no provider internals leak; audit rows still written on audited actions.
- **UI e2e (Playwright):** screens in the UI-UX register that depend on external content (media, policies, notifications) render designed empty/error states.
- **Tooling:** Vitest, Supertest, Playwright are **PROPOSED** (TECH-STACK §10) pending approval.

---

## Cross-Reference

- API contract & inventory: `API-SPECIFICATION.md`
- Trust boundaries / modules: `ARCHITECTURE.md`, `BACKEND-ARCHITECTURE.md`
- Entities & invariants: `DATABASE-DESIGN.md` (E-24..E-27, E-33; BI-001..010)
- Features & assumptions: `FEATURES.md` (§6.4; FEAT-002/006/014/015/047/049/052/059/060/063/071)
- Requirements: `REQUIREMENTS.md` (FR-AUTH-001, FR-SAL-003, FR-WDR-003, FR-ADM-005, NFR-ATOM-001/002, NFR-AUD-001, NFR-SEC-002)
- Business rules: `BUSINESS-RULES.md` (BR-BND-001, BR-WAL-002, BR-VCH-006, BR-GEO-003/004, BI-001..010)
- UI consumption: `UI-UX.md` (SCR register), `FRONTEND-ARCHITECTURE.md`, `MOBILE-ARCHITECTURE.md`