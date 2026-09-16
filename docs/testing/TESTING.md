# JAD - Testing SSOT (TESTING.md)

> **Authority:** Defines **how the JA&D platform is validated** - strategy, test levels, coverage expectations, quality gates, and Definition of Done. It is the single source of truth for testing and must govern all verification work. Companion to `API-SPECIFICATION.md` (contract), `INTEGRATION-SPECIFICATION.md` (integration behavior), `BUSINESS-RULES.md` (rules/invariants), `REQUIREMENTS.md` (requirements/acceptance criteria), `TECH-STACK.md` (tooling), `FOLDER-STRUCTURE.md` (test locations), and `DEVELOPMENT-GUIDELINES.md` (engineering conventions).
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only**. There is **no source code, no `package.json`, no test configuration, no CI configuration, and no Git repository**. All tooling and test infrastructure below is **PROPOSED** (per `TECH-STACK.md` §10/§11) unless marked otherwise; nothing is implemented or verified.
>
> **Status vocabulary:** **CONFIRMED** (established requirement/rule) · **PROPOSED** (recommended, not approved) · **REQUIRES APPROVAL** (material decision) · **REQUIRES VERIFICATION** (value/claim unconfirmed) · **TBD** (undecided) · **REQUIRED** (must be done for a phase/feature to be complete) · **OPTIONAL** (recommended but not a gate).
>
> **Version:** Project 10 - Testing & Quality Engineering (Baseline v1.0)

---

## 1. Testing Strategy

### 1.1 Quality strategy

- **Risk-based, not checkbox-based.** Testing effort is allocated to the risks that threaten the confirmed invariants and requirements (ROADMAP §10). Highest-priority risks: **financial integrity** (R-04), **authorization/object-level leakage** (R-05), and **atomicity/race conditions** (R-07). These are tested at every level and are always part of the critical regression suite (§12).
- **Requirements and rules drive tests.** Every accepted feature is validated against its acceptance criteria (AC-* in REQUIREMENTS §12) and its governing business rules (BR/BI in BUSINESS-RULES). A test suite is not considered complete because it "passes" - it must demonstrably cover the confirmed requirements (§16, §17).
- **Invariants are continuously enforced.** BI-001..BI-010 are tested as automated invariant tests in CI from the moment their governing feature ships (ARCHITECTURE §11, ROADMAP §5.2, BACKEND-ARCHITECTURE §21).
- **Security and authorization are proven server-side.** Hidden UI controls are never treated as proof of authorization (§8). Every protected action is tested against the role matrix directly at the API boundary.
- **No invented scope.** Testing covers only confirmed requirements, business rules, invariants, and the endpoints in `API-SPECIFICATION.md`. Nothing is tested "for completeness" merely to inflate coverage; equally, no confirmed requirement may go untested.

### 1.2 Risk-based testing

Priority is derived from the confirmed risk register (ROADMAP §10):

| Priority | Risk | Testing emphasis |
|---|---|---|
| Critical | R-04 Financial integrity (negative balance, double redemption, double-spend, reservation misuse) | Invariant tests BI-001..BI-010; concurrency tests; API tests on every financial endpoint; failure/rollback tests (§11) |
| Critical | R-05 Authorization/object-level leakage | Full RBAC matrix tests + object-level (IDOR/BOLA) tests for every member-scoped endpoint (§8) |
| High | R-07 Atomicity (redemption/balance race conditions) | Concurrency tests for redemption and withdrawal reservation (§4, §10) |
| High | R-02 Signing boundary (BI-008, AC-SEC-001) | Security tests proving the app cannot access the master key (§9) |
| High | R-03 External providers unconfirmed | Adapter integration tests with stubs; failure-mode tests (§4, §11) |
| Medium | R-06/R-09/R-08/R-11 ambiguity (Total Earned, withdrawal model, payout set, rates) | OD-gated items are **not tested as implemented**; they are excluded until approved (ROADMAP §8.2) |
| Medium | R-12 Schema/migration risk | Migration tests; seed-idempotency tests (§4) |

**Rule:** OD-gated behavior (OD-001..025) must never be tested as if it were implemented. Tests for gated features are excluded from scope until the Owner decision is approved (ROADMAP §8.2, §11).

### 1.3 Requirement-to-test traceability

- Every **FR** maps to an **AC** (REQUIREMENTS §12); every AC maps to executable tests that are the phase gate (ROADMAP §5.8, §9).
- Every **BR/BI** in BUSINESS-RULES has at least one test asserting it; invariants BI-001..BI-010 have automated tests in CI.
- Every **endpoint** in API-SPECIFICATION §6 is covered by API tests (method, status semantics, validation, auth, authZ, business rules, errors).
- Every **UI screen** in UI-UX §6.2/§6.3 has at least one component/UI test covering its required states (UI-UX §10).
- Traceability is recorded in test metadata (e.g., `test(AC-SAL-001 (a))` or an id-style prefix referencing FR/BR/BI/AC IDs). See §16 for coverage reporting.

### 1.4 Test ownership and responsibilities

Ownership follows the confirmed engineering conventions (DEVELOPMENT-GUIDELINES §13, §16; FOLDER-STRUCTURE §9) - no separate organizational structure is defined in the SSOT:

| Responsibility | Who | Evidence |
|---|---|---|
| Feature-scoped unit/component/integration tests | Feature owners (developers) - tests colocated with the feature (FOLDER-STRUCTURE §2.2, §3) | DEVELOPMENT-GUIDELINES §13 ("shared code is owned"), §15 |
| Shared package tests (`packages/contracts`, `packages/shared`) | Owners of the shared code; every shared item has defined owners and tests | DEVELOPMENT-GUIDELINES §13 |
| Invariant tests (BI-001..BI-010) | Platform-wide, run in CI; owned by the backend team | TECH-STACK §10, BACKEND-ARCHITECTURE §21 |
| Authorization/security tests | Backend + security review (CTO boundary per ROADMAP §11) | NFR-AUTHZ-001/002, NFR-SEC-001/002, BI-008 |
| Acceptance-criteria validation per phase | Reviewer/QA validation as defined by the phase exit criteria | ROADMAP §9 (validation of AC-*) |
| Approval of gates and unresolved items | Owner/Stakeholder (and CTO for the signing boundary) | ROADMAP §11 approval boundary |
| Tooling/environment provisioning | Deployment-stage decision - **REQUIRES APPROVAL** | ARCH-DEC-008, ROADMAP §11 |

> A dedicated QA team structure, test-environment SLA, and CI runner ownership are **not defined in the SSOT** and are **REQUIRES APPROVAL** before they are relied on (§20).

### 1.5 Test levels used

Levels in this document (ordered bottom-up): **Unit → Component → Integration → API → E2E/UI**. **Authorization** and **security** are cross-cutting suites applied at the API and UI levels. Each level is defined in §3-§9; the pyramid shape is defined in §2.

### 1.6 Testing throughout the lifecycle

- **During development (per feature):** unit + component tests first (fast feedback), integration for cross-module paths, API tests for the feature's endpoints, authorization tests for the feature's roles/ownership, and the invariant suite must still pass.
- **Per PR (PROPOSED):** CI runs build + lint + test + typecheck (TECH-STACK §11). Trunk must always build + typecheck + pass tests (DEVELOPMENT-GUIDELINES §16).
- **Per phase (REQUIRED):** the phase's AC-* pass; RBAC and object-level rules validated; integration tests across the phase boundary pass; documentation statuses updated (ROADMAP §9).
- **Per release/MVP gate (REQUIRED):** critical regression suite (§12) green; invariants hold; MVP exit criteria satisfied (ROADMAP §7.4).
- **After any SSOT change:** tests derived from the changed document are re-verified before proceeding (DEVELOPMENT-GUIDELINES §19; ROADMAP §12).

---

## 2. Testing Pyramid

Prefer fast, deterministic, lower-level tests; reserve broader tests for critical workflows.

```text
            /       E2E  (Playwright) - few, critical journeys only
          /      UI / Component (states, a11y) - feature screens
        /     API (Supertest) - contract, authZ, business rules, errors
      /   Integration - DB + app, cross-module, stubbed providers
    /  Unit (Vitest) - domain rules, use cases, pure logic, shared math
```

| Level | When used | Volume | Determinism |
|---|---|---|---|
| Unit | Domain rules, use cases, validation, money math, utilities, state transitions | Highest | Highest |
| Component | Frontend primitives/features rendering required states (UI-UX §10) | High | High |
| Integration | App + DB, cross-module flows, external adapters (stubbed) | Medium | Medium-high |
| API | Every endpoint: contract, auth/authZ, business rules, error envelope | Medium | High |
| E2E/UI | Critical business journeys (AC-*), end-to-end across API + UI | Low | Lower (most flake risk) |

**Rule:** a behavior must be tested at the **lowest level that can deterministically verify it**. E2E is reserved for workflows that span layers and that constitute confirmed critical journeys (§6); everything else is pushed down.

---

## 3. Unit Tests

**Tooling (PROPOSED):** Vitest (TECH-STACK §10; DEVELOPMENT-GUIDELINES §15).

**Scope (REQUIRED):**
- **Domain logic:** entities, value objects, and business rules in the domain layer - framework-free by design (ARCHITECTURE §14; FOLDER-STRUCTURE §2.2 "domain files depend on nothing framework/DB-specific"). Examples: sale eligibility (BR-SAL-001), commission calculation (BR-COM-001/002, §6 formulas), clearing lifecycle (BR-CLC-001), cancellation/reversal (BR-CAN-001/002), withdrawal reservation (BR-WDR-001/002), voucher verification conditions (FR-VCH-005).
- **Use cases (application layer):** orchestration and transaction boundaries, with adapters **mocked/stubbed** (FOLDER-STRUCTURE §2.2 `test/application`). Use cases contain no framework logic (BACKEND-ARCHITECTURE §4/§18).
- **Validation:** Zod schemas in `packages/contracts` - every schema has boundary and invalid-input tests; money/rate are exact decimals and floats are rejected (API-SPECIFICATION §1.3; BR-WAL-002).
- **Utility functions:** money math (exact decimal; no float math - BR-COM-001/002, TECH-STACK §5/§8), id/slug helpers, pagination/cursor helpers (API-SPECIFICATION §4), `packages/shared` (must remain framework-free - FOLDER-STRUCTURE §4).
- **Pure logic in frontends:** formatting, hooks, schema-derived logic (MOBILE-ARCHITECTURE §18 maps the same approach for mobile).

**Boundary conditions (REQUIRED)** for every validated rule:
- Age boundary at the configured minimum (18, configurable - BUSINESS-RULES §2; FR-ADM-001).
- Balance at exactly 0, at Available limit, and above it (BI-001, BI-002).
- Redeem amount equal to, below, and above remaining voucher value (BR-VCH-002).
- Commission rate changes applying to future transactions only (BR-COM-007).
- Resubmission attempt equal to and over the configured maximum → LOCKED (FR-SAL-006, BR-SAL-006).

**Mocking/stubbing rules:**
- Adapters (email, geolocation, push, signing client, storage) are always behind interfaces and are replaced in tests (ARCHITECTURE §5; BACKEND-ARCHITECTURE §2.1). **Mock the interface, not the provider.**
- Database is **not** mocked in use-case unit tests; repositories are replaced with in-memory fakes for pure orchestration tests, while **real DB behavior is covered by integration tests** (§4) - never substitute mocked DB behavior for the invariant/constraint tests.
- Mocks must not encode the behavior under test (no self-confirming mocks).

---

## 4. Integration Tests

**Tooling (PROPOSED):** Supertest against the app; real PostgreSQL via docker-compose (FOLDER-STRUCTURE §5; BACKEND-ARCHITECTURE §21). Location: `apps/api/test/integration` (FOLDER-STRUCTURE §2).

**Scope (REQUIRED):**
- **App ↔ database:** constraints and invariants enforced at the DB layer - CHECK (balance ≥ 0, BI-001), unique redemption (BI-007), immutability via REVOKE UPDATE/DELETE on financial tables (BI-005, DATABASE-DESIGN §22), FK integrity, `SERIALIZABLE` ledger writes (TECH-STACK §5).
- **Migrations:** every versioned migration applies cleanly on a fresh DB; seeds are idempotent (DATABASE-DESIGN §18/§19; ROADMAP R-12).
- **Cross-module flows:** qualifying sale → commission creation → clearing → ledger (ROADMAP §9 "integration tests passed"); referral → direct referral commission; withdrawal → reservation → completion/rejection releasing balance (BR-WDR-005); voucher → atomic redemption → history (BI-007).
- **Authentication integration:** email-verification token flow with the email adapter stubbed (BR-AUTH-001, FR-AUTH-001); session creation/rotation/revocation against the DB-backed session store (PROPOSED - BACKEND-ARCHITECTURE §8).
- **External services (stubbed):** every confirmed integration (email, geolocation, payout, push, signing, object storage) has a stub that simulates success **and each mapped failure** (INTEGRATION-SPECIFICATION §13). Provider timeouts/errors map to the generic error envelope; provider internals never leak; audit rows are still written for audited actions.
- **Frontend/backend boundary:** the typed client generated from OpenAPI (PROPOSED) is tested against the contract; a schema change fails CI (contract tests - INTEGRATION-SPECIFICATION §13; API-SPECIFICATION §5.4).

**Idempotency tests (REQUIRED):** replay of the same `Idempotency-Key` on `POST /sales`, `POST /me/withdrawals`, `POST /vouchers/:id/redemptions`, `POST /financial-adjustments` returns the stored response with no side-effect duplication (API-SPECIFICATION §5.3; BI-007; BR-WDR-002).

**Concurrency tests (REQUIRED):** exactly-one-success under concurrent redemption attempts (BI-007, NFR-ATOM-001); concurrent withdrawal reservations produce at most one success and never a negative balance (`RESERVATION_CONFLICT`, NFR-ATOM-002, BI-001).

---

## 5. API Tests

**Tooling (PROPOSED):** Vitest fetch against Vercel dev (Supertest only if dedicated backend added - TECH-STACK §10). Location: `apps/api/test/e2e` or `api/_lib` unit. Every endpoint in API-SPECIFICATION §6 is covered.

For **each endpoint** the following are REQUIRED:

| Concern | What is asserted |
|---|---|
| HTTP method & status codes | Correct code per API-SPECIFICATION §1.2 semantics (200/201/204/400/401/403/404/409/422/429/500) |
| Request validation | Zod rejects malformed/missing/extra fields; money as exact decimal, floats rejected (§1.3) |
| Response schema | Shape matches the shared contract (`{ data, meta }` for collections; resource object for single; error envelope for errors - §1.1, §3) |
| Authentication | Unauthenticated → 401; `/auth/me`, `/auth/refresh`, `/auth/logout` require an authenticated session |
| Authorization | Role matrix enforced (BUSINESS-RULES §3) - see §8 |
| Business rules | Eligibility and rule violations return 403/422/409 with the documented code (e.g., `MEMBER_NOT_QUALIFIED`, `SALE_LOCKED`, `INSUFFICIENT_BALANCE`, `PAYOUT_ACCOUNT_UNVERIFIED`) |
| Error responses | Error envelope fields (`code`, `message`, `details`, `requestId`, `timestamp`); stable codes (§3) |
| Invalid/missing input | Mandatory rejection reasons (BR-REG-004, BR-SAL-005, BR-WDR-004) → `REJECTION_REASON_REQUIRED`; required fields missing → 400 |
| Resource ownership | A member cannot read/modify another member's resource (404 hides existence - §1.2, §8); object-level enforcement on every member-scoped endpoint |
| Direct API access | Every protected mutation is tested with an unauthenticated and a wrong-role principal - client-side hiding is never the protection (§8) |
| Pagination/filtering/sort | Page vs cursor behavior per §4; allowlisted filter/sort keys; no unbounded responses |
| Rate limiting | Strict limits on auth and redemption paths return 429 when exceeded (§5.2) |
| Idempotency | Duplicate submission returns stored response without re-application (§5.3) |

**Envelope/error-code tests (REQUIRED):** every error code in API-SPECIFICATION §3 has at least one test that produces it.

---

## 6. E2E Tests

**Tooling (PROPOSED):** Playwright (TECH-STACK §10; DEVELOPMENT-GUIDELINES §15). Location: `apps/*/test` (component + Playwright e2e - FOLDER-STRUCTURE §3).

**Guiding rule:** E2E is reserved for **confirmed critical journeys** (the AC-* phase gates and the MVP path). Not every scenario is an E2E test - most behavior is covered at lower levels (§2).

**Critical journeys (REQUIRED E2E):**
1. **Registration → qualification → approval** (AC-REG-001): register → email verify → Admin ID verify → approve → `Approved-Active`; reject → reason shown → resubmit.
2. **Referral + sale → commission → clearing → eWallet** (AC-REF-001, AC-SAL-001, AC-COM-001/002, AC-WAL-001): AQ member records customer + property → sale submitted → Admin approves → Finance verifies payment → Qualifying Sale → commissions created Pending → after clearing become Available and appear in the ledger and Available Balance.
3. **Withdrawal request → reserve → complete/reject** (AC-WDR-001): request to a verified payout account → reserved → (staff) complete; or reject → reason → release → balance restored → new request required.
4. **Voucher redemption (atomic)** (AC-VCH-001, P8): merchant scans → verifies → full/partial redemption → remaining value → double-attempt prevented.
5. **Financial adjustment** (AC-ADJ-001): Super Admin applies credit/debit with reason → ledger + audit updated.

**Gated journeys (NOT E2E until approved):** Abroad geolocation PH-block/exception (P11, FR-GEO-001..006 confirmed mechanics - may be E2E once integrated), Group Incentive (P12), voucher extended rules (OD-019..023), Total Earned (OD-025). These must not be automated as implemented until the Owner decisions are approved.

**E2E scheduling:** a minimal, stable critical-journey suite runs per release gate and per MVP gate (ROADMAP §7.4); full nightly E2E is **REQUIRES APPROVAL** (infra/scheduling decision, §20).

---

## 7. UI Tests

**Tooling (PROPOSED):** Vitest (component) + Playwright (UI). Scope follows the screen register (UI-UX §6.2/§6.3) - **no invented screens**.

**Required UI coverage per screen:** every screen must be tested for the states it is required to render (UI-UX §10):

| Concern | Coverage |
|---|---|
| Critical UI behavior | Primary and secondary actions per screen register (UI-UX §6.2); navigation flows (§6.2 "Navigation") |
| Form validation | Inline field errors (UI-UX §9.4, §10; DEVELOPMENT-GUIDELINES §6/§7); shared Zod schemas as the source (DEVELOPMENT-GUIDELINES §7) |
| Loading states | Fetch/loading render (UI-UX §10) |
| Empty states | Designed empty states (e.g., no catalog properties, no payout accounts, no transactions) |
| Error states | Generic recoverable error UI; never raw stack traces or provider internals; `requestId` shown where useful (DEVELOPMENT-GUIDELINES §6) |
| Success states | Success feedback and next action (UI-UX §8.12) |
| Navigation | Route guards (session restore via `/auth/me`), 401 → login preserving destination, back behavior (FRONTEND-ARCHITECTURE §1.4/§8; MOBILE-ARCHITECTURE §8) |
| Responsive behavior | Member/merchant web is responsive-first (ARCH-DEC-005/006); tested at supported breakpoints defined in DESIGN-SYSTEM |
| Accessibility | UI meets UI-UX §12 / DESIGN-SYSTEM §7 - a11y defects are bugs (DEVELOPMENT-GUIDELINES §15) |
| Server-state behavior | Retry of idempotent reads; **no automatic retry of non-idempotent mutations**; Idempotency-Key preserved (DEVELOPMENT-GUIDELINES §5.2) |

**Config-driven UI:** options rendered from the config service (`GET /config/public`) are tested with the configurable values changing, never hard-coded (DEVELOPMENT-GUIDELINES §18; BR-CFG-001, NFR-MAINT-001).

---

## 8. Authorization Tests

**Foundation:** RBAC matrix in BUSINESS-RULES §3, object-level rules (NFR-AUTHZ-002), and the role shorthand/Auth column in API-SPECIFICATION §2.2/§6. **Hidden UI controls are never proof of authorization** - every assertion is made at the API boundary (DEVELOPMENT-GUIDELINES §15; FRONTEND-ARCHITECTURE §8).

For **every protected endpoint**, the following are REQUIRED:

| Case | Expected |
|---|---|
| Correct role | Authorized principal succeeds |
| Incorrect role | 403; business-eligibility failures return 422/403 as specified (§2.2) |
| Missing permission | Staff role without the action's permission → 403 (e.g., Admin attempting a financial adjustment → 403; only Super Admin may adjust - BR-ADJ-001) |
| Resource ownership | Member accessing another member's resource → 404 (never 403/200 - existence hidden, §1.2) |
| Cross-user access | Member A cannot act on member B's sales/ledger/withdrawals/payout accounts/vouchers |
| Cross-role access | Member cannot invoke staff paths (e.g., `POST /sales/:id/approve`); staff cannot act through member `/me` paths (§2.2) |
| Privileged operations | Super Admin-only (adjustments, config, audit), Admin-only (registration decisions, ID/payout verification, catalog), Admin/Finance/Super Admin (payment verification, withdrawal completion/rejection) |
| Direct API bypass | A crafted request to a protected endpoint without the UI - asserts server-side enforcement |

**Coverage matrix (REQUIRED):** maintain a role × endpoint matrix test that iterates every (endpoint, role) pair to a pass/fail expectation derived from API-SPECIFICATION §6 + BUSINESS-RULES §3. The matrix must include at minimum: `PUBLIC`, `AUTH`, `MEM`, `AQ`, `ADM`, `FIN`, `SUP`, `MRCH`, and the unauthenticated principal.

---

## 9. Security Tests

Security testing is scoped to the **actual architecture** (session auth, cookie CSRF, object-level authZ, record-only payments, external signing boundary). No irrelevant tests are added for completeness.

| Area | What is tested | Source |
|---|---|---|
| Authentication | Session lifecycle (login/logout/refresh rotation); email-verification gate before approval (BR-AUTH-001); 401 on missing/invalid session | API-SPECIFICATION §2.1; NFR-AUTH-001/002 |
| Authorization | Full RBAC matrix + object-level tests (§8) - the primary security control | NFR-AUTHZ-001/002 |
| Broken access control | IDOR/BOLA attempts on every member-scoped resource (404 hides existence) | NFR-AUTHZ-002; API-SPECIFICATION §8 |
| Input validation | Zod rejection of malformed input; exact-decimal money; oversized input limits | API-SPECIFICATION §1.3 |
| Injection | Parameterized queries only; no concatenated SQL; a malicious-value API test asserts no SQL error leaks | API-SPECIFICATION §8; DATABASE-DESIGN §22 |
| XSS | React escaping; no `dangerouslySetInnerHTML` with untrusted content; user/admin-supplied text rendered safely | FRONTEND-ARCHITECTURE; DEVELOPMENT-GUIDELINES §15 |
| Sensitive-data exposure | No PII/financial data in logs or error responses; 500s generic; profiles/IDs redacted where not needed; no secrets in client bundles | API-SPECIFICATION §8; NFR-CONF-001, NFR-DATA-001; DEVELOPMENT-GUIDELINES §18 |
| Session handling | HttpOnly/Secure/SameSite cookie attributes; CSRF protection for cookie-authenticated requests; refresh rotation | API-SPECIFICATION §8 (CSRF mechanism REQUIRES APPROVAL - BACKEND-ARCHITECTURE §21) |
| API security | Rate limiting (429) on auth/redemption; CORS first-party allowlist; `Idempotency-Key` never logged (sensitive replay token) | API-SPECIFICATION §5.2/§8; BACKEND-ARCHITECTURE §11 |
| Database security | Least-privilege DB roles; UPDATE/DELETE revoked on financial/audit tables (BI-005); no role holds blanket DDL/DML | DATABASE-DESIGN §22 |
| Secrets/configuration | Secrets only in environment/secret manager; `.env*` ignored; no committed credentials; config params served via API (never env/bundle) | API-SPECIFICATION §8; DEVELOPMENT-GUIDELINES §18; FOLDER-STRUCTURE §7 |
| Signing boundary | AC-SEC-001: a simulated application-infrastructure compromise does not expose the master key; the app can only verify, never sign (BI-008, NFR-CRYPTO-001) | REQUIREMENTS §12; TECH-STACK §16 |
| Abuse scenarios | Brute-force/rate-limit on login and verification; double redemption; idempotency-key reuse; voucher signature tampering (`VOUCHER_INVALID_SIGNATURE`) | API-SPECIFICATION §3/§5.2; NFR-ATOM-001 |

**Static/scan checks (REQUIRED):** secret scan in CI; no-secrets-in-bundle check for frontends (DEVELOPMENT-GUIDELINES §18). **Dependency supply-chain review** is part of adding dependencies (DEVELOPMENT-GUIDELINES §17).

---

## 10. Edge Cases

Systematic edge-case coverage is REQUIRED, applied at the lowest level that deterministically verifies the behavior:

| Category | Confirmed examples |
|---|---|
| Boundary values | Age = configured minimum; balance = 0 / = Available / > Available; redeem amount = remaining value; resubmission = max attempts (→ LOCKED); clearing period boundary (future-only - BR-COM-007) |
| Empty values | Empty catalog (no properties for sale submission); no payout accounts (guidance state); no transactions in ledger; empty referral list |
| Missing values | Missing mandatory fields; missing mandatory rejection reason (BR-REG-004, BR-SAL-005, BR-WDR-004) |
| Invalid values | Float money; negative amount; negative remaining value (C-13); unknown status/role; invalid referral code (BR-REG-009); invalid voucher signature |
| Duplicate actions/data | Double submission with same Idempotency-Key; duplicate redemption (BI-007); duplicate registration with same email; duplicate referral code (BI-009) |
| Large inputs | Oversized payloads rejected (400); large genealogy tree virtualization (UI-UX §6.3 SCR-MEM-018, §11.4 overflow); no unbounded ledger/commission responses (§4) |
| Unexpected states | Action attempted in a state that does not permit it (e.g., resubmit a LOCKED sale → 409 `SALE_LOCKED`); withdraw without verified payout account (422) |
| Concurrent actions | Concurrent redemptions (exactly one success); concurrent reservations (at most one success, no negative balance) |
| State transitions | Every confirmed state model (BUSINESS-RULES §5): Member, Sale, Commission, Payout Account, Withdrawal - invalid transitions rejected; no invented states (FOLDER-STRUCTURE §9.8) |
| Data inconsistencies | Ledger/audit rows never modified/deleted (BI-005); historical property value unchanged after catalog price change (BI-006); rejection reason recorded and displayed |

---

## 11. Failure Scenarios

**Goal:** failures must never leave the system in an invalid or inconsistent state. For each scenario, the test asserts the safe outcome and, where financial, a full rollback.

| Scenario | Expected behavior | Source |
|---|---|---|
| Validation failures | 400/422 before any side effect; nothing persisted | API-SPECIFICATION §1.3 |
| Network failures (client) | Offline/banner state; in-progress forms and Idempotency-Key preserved; safe retry; no offline mutations (mobile) | DEVELOPMENT-GUIDELINES §6; MOBILE-ARCHITECTURE §11 |
| API failures | Error envelope with stable code; generic, recoverable UI; no raw internals | API-SPECIFICATION §3; UI-UX §10 |
| Database failures | Transaction rolls back - no partial ledger/audit state (NFR-ATOM-001/002); 500 generic; readiness `/ready` reflects DB connectivity | BACKEND-ARCHITECTURE §15 |
| Timeouts | Time-bounded external calls; safe generic client response; server-side logging | BACKEND-ARCHITECTURE §11.7; INTEGRATION-SPECIFICATION §9 |
| External-service failures | Mapped to generic error; provider detail logged server-side only; audit still written; idempotent ops remain safe to retry | INTEGRATION-SPECIFICATION §9; API-SPECIFICATION §8 |
| Partial failures | No partial application on financial paths (atomic transactions) | API-SPECIFICATION §8; DATABASE-DESIGN §15.2 |
| Retry behavior | Idempotent reads retried; **non-idempotent mutations never auto-retried**; client resends with same Idempotency-Key | DEVELOPMENT-GUIDELINES §5.2; API-SPECIFICATION §5.3 |
| Recovery | Rejection releases reservation and restores balance (BR-WDR-005); a failed redemption leaves remaining value intact; a failed adjustment leaves the ledger unchanged | BUSINESS-RULES §5; AC-WDR-001/AC-VCH-001 |
| Interrupted operations | Re-running an interrupted idempotent operation completes at most once | BI-007, BR-WDR-002 |

---

## 12. Regression Testing

### 12.1 Strategy
- **Critical regression suite (REQUIRED, always green):** invariant tests BI-001..BI-010; the authorization role × endpoint matrix (§8); all financial-path API tests (sales, commission, ledger, withdrawal, voucher, adjustment); idempotency and concurrency tests. This suite must pass after **any** change and is a release gate.
- **Feature-level regression (REQUIRED):** when a feature changes, its unit/component/API/UI suites rerun; cross-module integration tests touching that feature rerun (e.g., a sale change reruns commission and ledger paths).
- **Security regression (REQUIRED):** after any change to authN/authZ, session handling, logging, or the signing boundary, the security suite (§9) and authorization suite (§8) fully rerun.
- **API regression (REQUIRED):** after any change to contracts, DTOs, schemas, or error codes, contract tests + all API tests rerun; a schema change fails CI (INTEGRATION-SPECIFICATION §13).
- **E2E regression:** the critical-journey suite reruns at phase and release gates (ROADMAP §9, §7.4); full nightly E2E is **REQUIRES APPROVAL**.
- **Regression after SSOT changes:** when an authoritative document changes, the derived tests are re-verified (DEVELOPMENT-GUIDELINES §19; ROADMAP §12).

### 12.2 What must be rerun after a change

| Change type | Required rerun |
|---|---|
| Domain rule change | Unit + invariant suite + affected API tests |
| Contract/schema/DTO change | Contract tests + API tests + typed-client integration tests |
| AuthN/AuthZ change | Authorization matrix + security suite + affected API tests |
| DB migration/constraint change | Migration tests + invariant suite + integration tests |
| Adapter/provider change | Adapter integration tests (stubbed) + failure-mode tests |
| Frontend change | Component/UI tests for affected screens + critical E2E journeys touching them |

---

## 13. Performance Testing

Performance testing is **not** a blanket requirement. It is defined only where confirmed risks justify it, and **no numeric targets are invented** (NFR-PERF-001 is TBD - REQUIRES APPROVAL).

**Justified areas (risk-based, PROPOSED):**
- **Large datasets:** genealogy/reporting reads with large trees (UI-UX §6.3 SCR-MEM-018 - large-tree virtualization); ledger/commission history pagination must never be unbounded (API-SPECIFICATION §4).
- **Expensive operations:** atomic voucher redemption under contention; withdrawal reservation under concurrent load (NFR-ATOM-001/002); the clearing scheduler job processing many commissions.
- **High traffic:** registration/login and redemption are rate-limited paths (§5.2) - load checks should not contradict the documented limits.
- **Broadcast fan-out:** push/notification delivery (FEAT-063) at scale - depends on provider (ASSUMPTION 6).

**Requirements (REQUIRED once targets exist):**
- NFR-PERF-001, NFR-AVAIL-001, NFR-REL-001, NFR-SCAL-001 targets are **TBD** - performance test scope, tooling, and pass criteria are **REQUIRES APPROVAL** and must not be invented.
- Tests assert **correctness under load** (e.g., exactly-one-success redemption, no negative balance) in addition to any latency/throughput measures.
- No performance test may bypass invariants, rate limits, or authorization.

---

## 14. Test Environments

| Environment | Purpose | Data | External services | Notes |
|---|---|---|---|---|
| Local development | Fast unit/component/API feedback | Local fixtures; fresh DB | Stubbed adapters | `docker-compose` provides api, db, worker, web, admin, merchant (FOLDER-STRUCTURE §5) |
| Test/QA | Integration + E2E against a shared instance | Controlled, reproducible fixtures | Stubbed; real provider sandboxes only where provider approved (OD-016, ASSUMPTIONS) | Full AC-* validation |
| Staging | Release/MVP gate; E2E critical journeys; performance (when approved) | Anonymized, non-production data | Sandbox/approved providers | Required for any real-provider integration test |
| Production | **Restricted** - no testing | Never production data for tests | - | Health/readiness probes only (`/health`, `/ready` - PROPOSED, BACKEND-ARCHITECTURE §15) |

**Rules (REQUIRED):**
- **Never rely on production data or production secrets for ordinary testing.** Production credentials are never used in test environments; seeds are non-real (DEVELOPMENT-GUIDELINES §18; DATABASE-DESIGN §19).
- Business parameters are served via the config module (BR-CFG-001) - tests must set them via the API/seed, not env, so NFR-MAINT-001 behavior is validated.
- Every environment uses typed env via `packages/config`; `.env.example` at each app root; `.env*` never committed (FOLDER-STRUCTURE §7).
- Database state for tests is **fresh and deterministic** (migrations + idempotent seed); no cumulative drift between runs.
- Provider selections and staging/infrastructure provisioning are deployment-stage decisions - **REQUIRES APPROVAL** (ARCH-DEC-008, ROADMAP §11).

---

## 15. Test Data

**Requirements (REQUIRED):**
- **Controlled and reproducible:** deterministic fixtures per feature; seeded via idempotent seeds (DATABASE-DESIGN §19). No dependence on manual environment state.
- **Isolation:** each test (or test class) operates on isolated data - transaction-per-test or unique fixture keys - so tests never collide.
- **Reset/cleanup:** test environments reset to a known baseline (migrations + seeds); no cross-test leakage.
- **Boundary and negative data:** explicit fixtures for the boundary cases in §10 (age minimum, balance zero/limit, redemption full/partial, max resubmission, invalid money/rates).
- **Role/permission test accounts:** a controlled set of principals covering the RBAC matrix - unauthenticated, Member, AQ, Admin, Finance, Super Admin, Merchant (BUSINESS-RULES §3) - with known credentials scoped to test environments only.
- **No sensitive real-world data:** seeds contain placeholder, non-real data (DATABASE-DESIGN §19: dev accounts are random/non-real; payout identifiers and ID documents are placeholders). Anonymization for staging **REQUIRES APPROVAL**.
- **No secrets:** test environments never contain production secrets or the signing master key (BI-008). Voucher test fixtures are signed by a **test-only signing key** - never the production master key.
- **Financial data:** test ledger/commission/audit rows follow immutability rules (BI-005) - tests must not UPDATE/DELETE financial rows, mirroring production roles.

---

## 16. Coverage Expectations

Coverage is **risk- and requirement-based**. Code-coverage percentage alone is never proof of quality.

| Coverage type | Meaning | Requirement |
|---|---|---|
| Requirement coverage | Every FR has its AC exercised by tests | REQUIRED - 100% of confirmed FRs mapped to ≥1 test (REQUIREMENTS §12; ROADMAP §9) |
| Business-rule coverage | Every BR asserted by ≥1 test; BI-001..BI-010 automated in CI | REQUIRED (BUSINESS-RULES; ARCHITECTURE §11) |
| Critical-path coverage | The MVP/E2E journeys (§6) exercised end-to-end | REQUIRED at phase/release gates (ROADMAP §7.4) |
| Permission coverage | Role × endpoint matrix fully executed (§8) | REQUIRED |
| Security coverage | §9 security suite + signing boundary (AC-SEC-001) | REQUIRED |
| Error-path coverage | Every error code (API-SPECIFICATION §3) produced by ≥1 test | REQUIRED |
| Regression coverage | Critical regression suite green after every change (§12) | REQUIRED |
| Code coverage | Line/branch measures where useful | Thresholds **REQUIRES APPROVAL** (TECH-STACK §10: "Coverage targets not approved - TBD") |

**Reporting (REQUIRED):** traceability is recorded in test metadata (FR/BR/BI/AC references). A feature is not covered if a required FR/BR has no executable test - regardless of line coverage.

---

## 17. Quality Gates

A change, feature, or phase is **not** releasable unless the following hold (derived from ROADMAP §9 exit criteria, MVP exit §7.4, and the CI contract in TECH-STACK §11/DEVELOPMENT-GUIDELINES §16):

| Gate | Criterion |
|---|---|
| CI execution | Build + lint + test + typecheck pass per PR (PROPOSED pipeline - provider REQUIRES APPROVAL) |
| Critical test failures | Zero critical-suite failures: invariants, authorization matrix, financial-path API tests, idempotency/concurrency |
| Requirement coverage | All phase FRs/NFRs implemented **and verified by tests**; no confirmed requirement untested |
| Authorization/security validation | RBAC matrix + object-level tests pass; audit trails verified (NFR-SEC-002, NFR-AUD-001); no unresolved security finding |
| Regression status | Critical regression suite green; affected feature suites green |
| Known defects | No open **critical/high** defects affecting the phase scope; medium/low defects triaged and documented |
| Environment/data integrity | Fresh deterministic environment; no production data; no secret leakage |
| Release readiness | Phase AC-* pass (ROADMAP §9); MVP gate M5 criteria hold (ROADMAP §7.4); out-of-scope boundaries respected (no money movement, no MLM, no auto-refund, no OD-gated behavior) |

> **A feature is not complete merely because "all tests passed" if critical requirements were never tested.** Test existence for every confirmed requirement is itself a gate (§16).

---

## 18. Definition of Done (testing-specific)

A feature is **Done** only when **all** of the following hold:

- [ ] Critical tests pass (invariants, authorization matrix, financial-path, idempotency, concurrency) - none failing or skipped.
- [ ] All confirmed requirements of the feature are **tested** (not just implemented) - AC-* exercised; no critical requirement untested.
- [ ] Authorization is verified at the API boundary for every protected action (correct role, wrong role, ownership, bypass) - not assumed from hidden UI.
- [ ] Security risks for the feature are resolved or explicitly accepted with approval; no unresolved high/critical findings.
- [ ] Important edge cases (§10) and failure scenarios (§11) for the feature are tested; failures leave no inconsistent state.
- [ ] No failure is ignored or silenced; no test was weakened, deleted, or de-prioritized merely to make the suite pass.
- [ ] Required regression testing (§12) was run - affected feature, contract, security, and API suites are green.
- [ ] Traceability is recorded (FR/BR/BI/AC references present in the tests).
- [ ] OD-gated behavior was not silently implemented or tested as approved.

---

## 19. Traceability / Authority

| This section | Derives from |
|---|---|
| Strategy, risk-based approach | ROADMAP §10 (risks), §9 (exit criteria); ARCHITECTURE §11 (testability/invariants) |
| Test levels & tooling | TECH-STACK §10 (Vitest/Supertest/Playwright), §11 (CI); FOLDER-STRUCTURE §2/§3 (test locations) |
| Unit tests (domain/use cases/validation/money) | ARCHITECTURE §14, FOLDER-STRUCTURE §2.2, API-SPECIFICATION §1.3, BUSINESS-RULES §6, BACKEND-ARCHITECTURE §7 |
| Integration tests (DB, migrations, adapters) | DATABASE-DESIGN §22 (invariants), INTEGRATION-SPECIFICATION §13, BACKEND-ARCHITECTURE §21, TECH-STACK §5 |
| API tests | API-SPECIFICATION §1.2/§3/§4/§5/§6; BUSINESS-RULES §3/§5; REQUIREMENTS FR/NFR |
| E2E tests | REQUIREMENTS §12 (AC-*); ROADMAP §7.4 (MVP journeys), §9 |
| UI tests | UI-UX §6.2/§6.3/§10; DESIGN-SYSTEM §7 (a11y); FRONTEND-ARCHITECTURE §5/§6; DEVELOPMENT-GUIDELINES §6 |
| Authorization tests | BUSINESS-RULES §3; API-SPECIFICATION §2.2; NFR-AUTHZ-001/002; FRONTEND-ARCHITECTURE §8 |
| Security tests | API-SPECIFICATION §8; NFR-SEC-001/002, NFR-CONF-001, NFR-CRYPTO-001, NFR-DATA-001; BI-008; DATABASE-DESIGN §22; DEVELOPMENT-GUIDELINES §18 |
| Edge cases | BUSINESS-RULES §5 (state models), §10 (invariants); API-SPECIFICATION §1.2/§3/§4; UI-UX §11.4 |
| Failure scenarios | INTEGRATION-SPECIFICATION §9; BACKEND-ARCHITECTURE §11.7; NFR-ATOM-001/002; BR-WDR-005 |
| Regression | ROADMAP §9/§12; TECH-STACK §11; DEVELOPMENT-GUIDELINES §16/§19 |
| Performance | NFR-PERF-001/AVAIL-001/REL-001/SCAL-001 (TBD); UI-UX §11.4; NFR-ATOM-001/002 |
| Environments/data | FOLDER-STRUCTURE §5/§7; DATABASE-DESIGN §18/§19; DEVELOPMENT-GUIDELINES §18; BACKEND-ARCHITECTURE §15 |
| Coverage/gates/DoD | REQUIREMENTS §12 (AC-*); ROADMAP §7.4/§9; TECH-STACK §10/§11; ARCHITECTURE §11 |

This document introduces **no** new requirement, business rule, role, workflow, invariant, endpoint, or technology. Unresolved testing decisions are listed in §20 and must not be silently decided.

---

## 20. REQUIRES APPROVAL

| # | Unresolved item | Why | Decision required |
|---|---|---|---|
| RA-01 | Testing toolchain adoption (Vitest, Supertest, Playwright) | PROPOSED, not approved (TECH-STACK §10) | Approve toolchain |
| RA-02 | CI provider, pipeline definition, and E2E scheduling (per-PR vs nightly) | Provider OPEN (ARCH-DEC-008); pipeline PROPOSED (TECH-STACK §11); E2E scheduling not defined | Approve CI design |
| RA-03 | Code-coverage thresholds (%) | "Coverage targets not approved - TBD" (TECH-STACK §10) | Set thresholds |
| RA-04 | NFR-PERF-001 / AVAIL-001 / REL-001 / SCAL-001 targets and performance test scope/tooling | All TBD (REQUIREMENTS §7) | Set targets |
| RA-05 | CSRF mechanism for cookie-authenticated requests | Required (§8) but mechanism unspecified (BACKEND-ARCHITECTURE §21) | Approve mechanism |
| RA-06 | Mobile (RN) test tooling, renderer, and E2E framework (Detox/Maestro) | REQUIRES APPROVAL (MOBILE-ARCHITECTURE §18, MA-11) | Approve mobile tooling |
| RA-07 | Staging environment provisioning and real-provider sandbox usage | Deployment-stage (ARCH-DEC-008); provider set OPEN (OD-016, ASSUMPTIONS 2/3/6) | Approve staging + providers |
| RA-08 | Test-data anonymization policy for staging | Not defined; non-real seed data confirmed (DATABASE-DESIGN §19) | Approve policy |
| RA-09 | Dedicated QA organizational structure / responsibilities beyond feature ownership | No such structure in the SSOT | Approve or defer |
| RA-10 | Whether gated (OD-*) E2E journeys are pre-built before Owner decisions | OD-001..025 gate features (ROADMAP §8.2) | Approve per decision |

---

## 21. Cross-Reference Index

| Doc | Used for |
|---|---|
| `docs/business/BUSINESS-RULES.md` | BR rules, BI invariants, role matrix (§3), state models (§5), calculations (§6) |
| `docs/requirements/REQUIREMENTS.md` | FR/NFR IDs, AC-* acceptance criteria (§12) |
| `docs/features/FEATURES.md` | FEAT inventory, gating decisions (§6.1), assumptions (§6.4) |
| `docs/roadmap/ROADMAP.md` | Phases, MVP scope/exit, risks (R-01..R-12), exit criteria (§9), approval boundary (§11) |
| `docs/architecture/API-SPECIFICATION.md` | Contract, status codes, error envelope, pagination, rate limiting, idempotency, endpoint inventory |
| `docs/architecture/INTEGRATION-SPECIFICATION.md` | Integration testing requirements (§13), failure handling (§9), external assumptions (§12) |
| `docs/architecture/ARCHITECTURE.md` | Testability, invariants, trust boundaries, adapters |
| `docs/architecture/FOLDER-STRUCTURE.md` | Test file locations and naming, module boundaries |
| `docs/architecture/TECH-STACK.md` | Testing tooling (§10), CI (§11), versions (§14), alternatives (§15) |
| `docs/architecture/BACKEND-ARCHITECTURE.md` | Layers, guards, logging redaction, health/readiness, quality gates (§21) |
| `docs/architecture/FRONTEND-ARCHITECTURE.md` | Frontend state/API/authorization patterns, typed client |
| `docs/architecture/MOBILE-ARCHITECTURE.md` | Mobile testing strategy (§18) and native-tooling approvals |
| `docs/database/DATABASE-DESIGN.md` | Entities, invariants, constraints, roles, seeds, immutable tables |
| `docs/ui-ux/UI-UX.md`, `docs/ui-ux/DESIGN-SYSTEM.md` | Screen register, required UI states (§10), accessibility (§7) |
| `docs/development/DEVELOPMENT-GUIDELINES.md` | Engineering/testing conventions, retries, env config, review blockers |