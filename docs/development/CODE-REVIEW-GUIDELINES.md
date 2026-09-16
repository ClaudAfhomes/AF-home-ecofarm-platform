# JAD - Code Review Guidelines SSOT (CODE-REVIEW-GUIDELINES.md)

> **Authority:** This document is the **authoritative code-review standard** for the JA&D (JAD) platform. It defines how implementation quality and compliance are reviewed: the review checklist, the principles every reviewer must apply, the severity model for findings, and the approval criteria. It governs all human and AI-assisted review activity.
>
> **Precedence:** Reviews evaluate implementation **against** the approved SSOT set. Resolution follows the project's established authority chain - BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → API-SPECIFICATION.md → TECH-STACK.md → UI-UX.md → DESIGN-SYSTEM.md → FOLDER-STRUCTURE.md → FRONTEND-ARCHITECTURE.md → BACKEND-ARCHITECTURE.md → DATABASE-DESIGN.md → MOBILE-ARCHITECTURE.md → DEVELOPMENT-GUIDELINES.md - plus the companion quality SSOTs `INTEGRATION-SPECIFICATION.md`, `TESTING.md`, and `SECURITY.md`. This document does **not** override any of those; where this document is silent, the higher-authority document prevails (see §6).
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only** - no source code, no manifests, no test/CI configuration, and no Git repository. This document therefore defines the **review standards that apply when implementation begins (ROADMAP P1)**. It does **not** describe an implemented system. Nothing here can be verified against code until it exists; all review checkpoints remain applicable by policy.
>
> **Status vocabulary:** **CONFIRMED** (established SSOT decision) · **PROPOSED** (recommended, not approved) · **REQUIRES APPROVAL** (material decision) · **REQUIRES VERIFICATION** (value/claim unconfirmed) · **TBD** (undecided; must not be invented) · **REQUIRED** (must be done for merge) · **OPTIONAL** (recommended, not a gate).
>
> **Audience:** human reviewers, reviewers using AI assistance, and AI coding agents. The checklist, severity rules, and approval criteria are written to be applied deterministically by both.
>
> **Version:** Project 12 - Engineering Quality (Baseline v1.0)

---

## 1. Scope and Purpose

- This document defines **what reviewers must verify** and **how findings are classified and resolved**. It is the single reference for review decisions.
- It covers web frontends (`apps/web`, `apps/admin`, `apps/merchant`), backend (`apps/api`), the mobile experience (responsive web - ARCH-DEC-005; native React Native is **NOT approved** - ARCH-DEC-006, `REQUIRES APPROVAL`), the database design, the API contract, and external integrations.
- Reviews assess **compliance and correctness against the approved SSOTs** - not personal preference. Cosmetic opinion is `LOW`/`INFORMATIONAL` at most and never blocks merge.
- This document introduces **no new architecture, requirement, business rule, or security policy**. Where a review finds a gap that requires one, it is reported and marked `REQUIRES APPROVAL` (§6) - never invented.
- **Out of scope for this document:** defining how code is written (see `DEVELOPMENT-GUIDELINES.md`), how the system is tested (see `TESTING.md`), and security controls (see `SECURITY.md`). This document references, and enforces consistency with, those sources.

---

## 2. Review Principles

Every reviewer must apply all of the following standards:

1. **Inspect the actual implementation before judging it.** Review the diff and the surrounding code in context - never review based on description, commit message, or assumption. Verify the change exists in the intended files (FOLDER-STRUCTURE §2).
2. **Verify behavior against requirements and business rules.** Every behavior change must map to a confirmed `FR-*`/`NFR-*` (REQUIREMENTS §6/§7) and its governing `BR-*`/`BI-*` (BUSINESS-RULES). Unreferenced behavior is a scope or traceability finding.
3. **Verify architectural consistency with the approved architecture.** Implementation must conform to the modular-monolith layering, module boundaries, and trust boundaries (ARCHITECTURE §2/§3/§6; BACKEND-ARCHITECTURE §1.3; FRONTEND-ARCHITECTURE §2) and to the proposed folder structure (FOLDER-STRUCTURE).
4. **Treat security-by-design as mandatory.** Security controls are not optional additions (API-SPECIFICATION §8; BACKEND-ARCHITECTURE §17; SECURITY §1). A missing confirmed control is at least `HIGH`.
5. **Review authorization and trust boundaries where applicable.** Verify RBAC guards, object-level ownership (NFR-AUTHZ-002), 404-hides-existence, the CTO signing boundary (BI-008), and that the client is never the security boundary (FRONTEND-ARCHITECTURE §8; SECURITY §3/§17).
6. **Check relevant tests, including failure and edge cases.** Confirm tests exist per `TESTING.md` levels, cover the acceptance criteria (AC-*), invariants BI-001..BI-010, and the failure/edge scenarios of the change (§3.7).
7. **Distinguish confirmed defects from optional improvements or speculative concerns.** A confirmed defect violates a confirmed requirement, rule, invariant, or contract. Optional improvements and speculation are labeled `LOW`/`INFORMATIONAL` and never block merge.
8. **Prioritize correctness, security, requirements, and architecture over cosmetic issues.** Style findings never block a correct, secure, compliant change; blocking severity is reserved for substance (§4).
9. **Identify scope creep and unapproved behavior.** Flag implementation of OD-gated items (ROADMAP §8.2), prohibited behaviors (BUSINESS-RULES §11), or any behavior with no requirement - these are `CRITICAL` until an authorized exception exists (ROADMAP §11).
10. **Consider frontend, backend, mobile, database, API, and integration implications when relevant.** A change rarely stays in one layer: an API change affects all consumers (web/admin/merchant/mobile); a schema change affects migrations and invariants; an adapter change affects failure behavior (INTEGRATION-SPECIFICATION §3).
11. **Review dependencies for necessity, compatibility, security, maintenance, and licensing concerns where applicable** (§3.10).
12. **Identify breaking changes and their impact before approval** (§3.11) - never approve a breaking change whose consumers or migration path are unassessed.
13. **No invented resolutions.** If a review finds a contradiction between authoritative documents, follow §6 - identify it, apply precedence, and escalate rather than silently resolving.

---

## 3. Review Checklist

Reviewers must work through each area. Findings reference the authoritative source; unverified assertions are labeled as such (`REQUIRES VERIFICATION`).

### 3.1 Architecture Compliance

- Conforms to the modular-monolith / hexagonal layering (ARCHITECTURE §2/§5; BACKEND-ARCHITECTURE §1.3): controllers → services/use cases → repositories → infrastructure adapters. No business logic in controllers or UI; no framework/DB coupling in domain logic (BACKEND-ARCHITECTURE §4/§18).
- Module boundaries respected: no cross-feature imports of another feature's internals (FRONTEND-ARCHITECTURE §2/§6); inter-module calls use application services only (BACKEND-ARCHITECTURE §2.3).
- File placement and naming follow `FOLDER-STRUCTURE.md` (§2/§3/§6): feature folders, `packages/contracts`, `packages/shared`, `apps/*`.
- Adapters (email, geolocation, push, signing client, storage, payout) are behind interfaces and replaceable in tests (BACKEND-ARCHITECTURE §2.1; ARCHITECTURE §5).
- Trust boundaries preserved: signing boundary (BI-008), storage boundary (media metadata only - DATABASE-DESIGN A-08), external-payment boundary (record-only - BR-BND-001..003), no inbound-webhook writes (INTEGRATION-SPECIFICATION §6).
- Single-writer rule respected; no concurrent writers to the same financial state (ARCHITECTURE §6; BACKEND-ARCHITECTURE §12).
- Native mobile code is **not** approved: any React Native / native dependency work is `REQUIRES APPROVAL` (ARCH-DEC-006; MOBILE-ARCHITECTURE header).
- No out-of-scope architecture introduced: no payment gateway, no wallet/money movement, no automatic refunds, no MLM (BUSINESS-RULES §11; TECH-STACK §16).

### 3.2 Requirements Compliance

- The change maps to confirmed `FR-*`/`NFR-*` (REQUIREMENTS §6/§7) and their acceptance criteria `AC-*` (§12). Every implemented behavior is traceable; nothing is implemented "just in case".
- Acceptance criteria are demonstrably satisfiable by the implementation and covered by tests (ROADMAP §9; TESTING §1/§16).
- No `TBD`/`ASSUMPTION` silently converted into an implementation decision (BUSINESS-RULES §11.10; ROADMAP §11); OD-gated items (OD-001..025) are not implemented (ROADMAP §8.2).
- Applicable NFRs are addressed - e.g., atomicity (NFR-ATOM-001/002), auditability (NFR-AUD-001, NFR-SEC-002), confidentiality (NFR-CONF-001), data protection (NFR-DATA-001), integrity (NFR-INT-001), cryptography (NFR-CRYPTO-001), authorization (NFR-AUTHZ-001/002).
- Configuration-driven business parameters are not hard-coded (BR-CFG-001; DEVELOPMENT-GUIDELINES §18).
- Traceability: PR description and code comments reference the relevant `FEAT-*`/`FR-*`/`BR-*` IDs (DEVELOPMENT-GUIDELINES §16).

### 3.3 Business-Rule Compliance

- Governing `BR-*` rules are enforced exactly as stated (BUSINESS-RULES §1.x) - not approximately, not reworded.
- Status/state vocabularies mirror BUSINESS-RULES §5 exactly; no invented transitions (DATABASE-DESIGN §5; DEVELOPMENT-GUIDELINES §2/§11).
- Invariants BI-001..BI-010 hold and are enforced at the database layer, not only in application code (DATABASE-DESIGN §12.6; SECURITY §1.2).
- Business eligibility is separate from roles: e.g., Active + Qualified required for sales, `422 MEMBER_NOT_QUALIFIED` otherwise (API-SPECIFICATION §2.2; BR-SAL-001).
- Money is exact-decimal strings / `NUMERIC`; no floating-point anywhere (BR-WAL-002; TECH-STACK §5/§8). Snapshot semantics respected (property value at transaction time - BI-006).
- Commission and clearing logic match the confirmed lifecycle and calculation rules (BR-COM, BR-CLC, BR-CAN; PROVISIONAL 8%/4% - ROADMAP R-11) - no invented formulas.
- Prohibited behaviors are not introduced (BUSINESS-RULES §11) and the no-refund, no-MLM, no-payment-boundary rules hold (BR-BND-001..003; BI-010).
- Exception workflows (approvals, sponsor change, reopen, financial adjustments, geolocation exceptions) follow the audited workflows in BUSINESS-RULES §8.

### 3.4 Security Review

Authoritative standard: `SECURITY.md`. Every checklist item there applies. Non-exhaustive critical checks:

- **Authentication/session:** HttpOnly/Secure/SameSite cookies, refresh rotation, logout invalidation, CSRF protection, DB-backed sessions (API-SPECIFICATION §2.1/§8; SECURITY §2/§10). No credential policy assumptions beyond ASSUMPTION 1.
- **Authorization:** RBAC guards on every endpoint (BUSINESS-RULES §3), object-level ownership (NFR-AUTHZ-002), 404-hides-existence, no staff impersonation of members (SECURITY §3/§4).
- **Input validation & injection:** all inputs validated by shared Zod schemas; parameterized queries only - no SQL concatenation (API-SPECIFICATION §8; SECURITY §5).
- **Secrets:** none in code, bundles, logs, or error responses; `.env*` ignored; server-side secret manager (SECURITY §7; DEVELOPMENT-GUIDELINES §18).
- **Signing boundary:** the app verifies signatures only; master key never reachable from app infra/dev/DBA (BI-008; BR-SEC-001..004; AC-SEC-001).
- **Rate limiting:** strict limits on login/register/verify-email/redemption endpoints (API-SPECIFICATION §5.2; SECURITY §12). Values remain `TBD` until approved - do not invent.
- **Audit:** approvals/verifications/exceptions/adjustments write audit in the same transaction; insert-only; immutable (NFR-SEC-002; DATABASE-DESIGN §15; SECURITY §13).
- **Logging redaction:** no PII/financial data, session ids, verification tokens, Idempotency-Keys, voucher signatures, payout account numbers in logs (BACKEND-ARCHITECTURE §11; SECURITY §6).
- **File uploads:** object storage, `media_type` allowlist, no executable content; identity documents treated as PII (SECURITY §14; DATABASE-DESIGN §8.3).
- **Dependency security:** no prohibited libraries, no payment/money-movement/MLM/auto-refund libraries, no key-embedding libraries (TECH-STACK §16; SECURITY §15).

### 3.5 Performance Review

- **No invented targets.** NFR-PERF/AVAIL/REL/SCAL-001 targets are `TBD` (REQUIREMENTS §7). Performance findings must reference confirmed behavior or contracts - never fabricated SLAs or thresholds (TESTING §13).
- Correct query patterns for confirmed access paths: indexes match the design (DATABASE-DESIGN §11); pagination follows the contract - cursor for ledger/financial streams, page-based for admin lists (API-SPECIFICATION §4; DEVELOPMENT-GUIDELINES §7).
- No N+1 queries; no unbounded list rendering; large member trees use virtualization per UI-UX §6.3 (SCR-MEM-018).
- Transaction scope kept minimal; serializable isolation applied only where required for ledger correctness (BACKEND-ARCHITECTURE §12).
- Frontend: memoization used judiciously (identity-sensitive only); no render-phase side effects; code-splitting where the toolchain allows (DEVELOPMENT-GUIDELINES §3; MOBILE-ARCHITECTURE §15).
- Concurrency on financial paths reviewed for races (redemption, reservation) - atomicity per NFR-ATOM-001/002 (TESTING §10/§11).

### 3.6 Maintainability

- Feature-scoped code with low coupling (FRONTEND-ARCHITECTURE §2); shared contracts single-sourced in `packages/contracts` - no duplicated DTOs/schemas/enums (FOLDER-STRUCTURE §4/§9.6; DEVELOPMENT-GUIDELINES §13/§15).
- Strict TypeScript: no implicit `any`, no `any` leaks; type-only imports (DEVELOPMENT-GUIDELINES §2/§12).
- Naming and import organization follow the conventions (§11/§12 of DEVELOPMENT-GUIDELINES); status enums mirror BUSINESS-RULES §5.
- No dead code, commented-out blocks, or unused imports (DEVELOPMENT-GUIDELINES §15).
- Comments explain *why* / non-obvious constraints; no obvious or duplicated comments (project style).
- Components/hooks stay small and single-responsibility (DEVELOPMENT-GUIDELINES §4/§5); DRY/KISS/SOLID applied pragmatically (§14).
- Shared code has defined owners and tests (DEVELOPMENT-GUIDELINES §13).
- Documentation updated per ROADMAP §9 exit criteria when a feature ships.

### 3.7 Test Coverage

Authoritative standard: `TESTING.md`. Checks:

- Tests exist at the appropriate level for the change (unit/integration/API/e2e/UI) using the lowest deterministic level that proves the behavior (TESTING §2).
- Acceptance criteria (AC-*) are exercised; governing BR/BI rules are covered; invariants BI-001..BI-010 have automated invariant tests in CI (TESTING §1/§3/§16; ARCHITECTURE §11).
- **Failure and edge cases** are covered: boundary conditions, 404-hides-existence, forbidden-role attempts, `RATE_LIMITED`, error-envelope mapping, rollback/atomicity, and concurrency races for redemption and withdrawal (TESTING §8/§9/§10/§11).
- Security/authorization tests hit the API boundary (server-side proof), not UI affordance (TESTING §8; SECURITY §18).
- Tests are deterministic and never depend on production data or secrets (TESTING §14/§15).
- No fabricated coverage percentages: numeric coverage thresholds are `REQUIRES APPROVAL` (TESTING §16) - do not invent.

### 3.8 Error Handling

- Every error path uses the unified envelope and confirmed codes (API-SPECIFICATION §3); no internal details, stack traces, or PII leak; `500` responses are generic (BACKEND-ARCHITECTURE §10; SECURITY §6).
- Client handling per DEVELOPMENT-GUIDELINES §10: `401` → login preserving destination; `403` → clear "not permitted/eligible"; `404` never reveals others' records; `422` eligibility; `429` rate-limited; validation errors inline.
- Financial mutations are atomic with idempotency (`Idempotency-Key` on sale, withdrawal, redemption, adjustment) and reuse the key on retry - no partial application (API-SPECIFICATION §5.3; BACKEND-ARCHITECTURE §12).
- External-provider failures map to a generic safe response; provider internals stay server-side; audit rows still written for audited actions (INTEGRATION-SPECIFICATION §13).
- Client forms preserve entered data, prevent double submit, and offer safe retry (DEVELOPMENT-GUIDELINES §8).

### 3.9 Code Smells

- `any` or implicit-any leaks; unvalidated `unknown` passed into domain code.
- Duplicated schemas/DTOs/enums instead of `packages/contracts`.
- Business logic in UI/controllers; framework/DB coupling in domain; duplicated server business logic client-side (DEVELOPMENT-GUIDELINES §6/§7; FRONTEND-ARCHITECTURE §8).
- Oversized components/hooks mixing unrelated concerns; prop-drilling beyond 2-3 levels (DEVELOPMENT-GUIDELINES §4/§5).
- Incomplete `useEffect` dependency arrays; render-phase side effects; derived state in effects (DEVELOPMENT-GUIDELINES §3).
- Magic numbers where business parameters should be config-driven (BR-CFG-001).
- Floating-point money math anywhere (BR-WAL-002).
- Unstable list keys; index-as-key; unbounded lists (DEVELOPMENT-GUIDELINES §3/§7).
- Dead code, commented-out blocks, unused imports, inconsistent naming/import order.

### 3.10 Dependency Review

- **Necessity:** every new dependency is justified by a confirmed requirement; existing TECH-STACK solutions preferred (TECH-STACK §2/§11/§15); no two libraries for the same concern (DEVELOPMENT-GUIDELINES §17).
- **Compatibility:** versions pinned via the pnpm lockfile; no floating/phantom versions; upgrades are PR-sized and verified (DEVELOPMENT-GUIDELINES §17). Versions remain `REQUIRES VERIFICATION` until manifests exist (TECH-STACK §14).
- **Security:** maintained libraries; supply-chain posture reviewed; no library on the prohibited list - payment processing, money movement, MLM, auto-refund, key/HSM-secret embedding (TECH-STACK §16; SECURITY §15).
- **Maintenance/licensing:** license and long-term maintenance considered; unused dependencies removed immediately (DEVELOPMENT-GUIDELINES §17).
- **Approval boundary:** major/new dependencies and all native mobile dependencies are `REQUIRES APPROVAL` (DEVELOPMENT-GUIDELINES §17; MOBILE-ARCHITECTURE §19; ROADMAP §11).

### 3.11 Breaking Changes

Before approving, confirm the impact of every breaking change:

- **API contract:** versioning and deprecation per API-SPECIFICATION §5.1; OpenAPI regenerated; typed client (`packages/contracts`) regenerated; all consumers (web, admin, merchant, mobile) re-assessed against the contract.
- **Database:** migrations are additive-safe where possible; financial/audit records are never edited or deleted (BI-005, R-12); destructive schema changes require approval (DATABASE-DESIGN §24; ROADMAP §11.7).
- **State/enums:** any change to status vocabularies must mirror BUSINESS-RULES §5 and propagate through `packages/contracts` and database CHECK constraints.
- **Idempotency/session semantics:** changes affecting retries or sessions are flagged (API-SPECIFICATION §5.3; SECURITY §10).
- **Integrations:** provider contract/behavior changes are assessed per INTEGRATION-SPECIFICATION (failure behavior, audit, boundaries).
- **Client bundling/mobile:** changes that affect the responsive-web mobile experience are reviewed; native additions remain unapproved (ARCH-DEC-006).
- A breaking change with unassessed impact is `HIGH` or `CRITICAL` and blocks approval (ROADMAP §11).

### 3.12 Approval Criteria

- Apply the severity model (§4) and the approval outcomes (§5).
- No merge while a `CRITICAL` finding is open; `HIGH` findings require resolution or an explicit authorized exception (§5).
- The reviewer confirms the change satisfies §3.1-§3.11 before approving.

---

## 4. Severity Model

Every finding is assigned exactly one severity. Meaningful findings **must** include evidence (affected file/line, endpoint, rule/requirement ID, or a test reference) and the affected location. Findings without evidence are `INFORMATIONAL` at most.

| Severity | Definition | Action |
|---|---|---|
| **CRITICAL** | Violates a confirmed security boundary or invariant; breaks financial integrity (BI-001..BI-010); introduces a prohibited behavior (BUSINESS-RULES §11); exposes a secret; allows authorization bypass/IDOR; corrupts or loses financial/audit data; implements an OD-gated or out-of-scope feature (ROADMAP §8.2); silently converts a `TBD` into a decision. | **Blocks merge.** Must be fixed, or an explicit authorized exception obtained (ROADMAP §11), before any approval. |
| **HIGH** | Correctness defect on a confirmed requirement or acceptance criterion; missing confirmed security control (e.g., rate limiting, audit write, CSRF); authorization gap on a non-critical path; unhandled financial error path; breaking change without impact assessment (§3.11); missing tests for a critical path; unverified or wrong business-rule enforcement. | **Blocks approval** unless resolved or an explicit authorized exception exists. Must be fixed in the change or a tracked follow-up with an owner. |
| **MEDIUM** | Deviation from an approved architecture/pattern that materially affects maintainability; missing edge/failure test; code smell that can hide defects; moderate duplication; contract/enum drift that is not yet breaking. | Should be fixed; may merge with a tracked follow-up. Non-blocking. |
| **LOW** | Minor style, naming, import-order, or readability issue; minor inefficiency; small documentation drift. | Non-blocking; fix opportunistically or in a cleanup PR. |
| **INFORMATIONAL** | Observation, suggestion, or speculative concern with no confirmed defect; unverified claim labeled `REQUIRES VERIFICATION`. | No action required to merge; recorded for consideration. |

Rules:
- Severity is based on **confirmed** impact against the SSOTs, not on reviewer preference. A finding that cannot be tied to a requirement, rule, invariant, contract, or security control is `INFORMATIONAL` unless it is an objective defect (crash, data loss, obvious type/safety bug) - those may still be `HIGH`.
- Escalate when uncertain: if a finding *could* violate an invariant or security boundary, treat it at the higher severity until disproven.
- `CRITICAL`/`HIGH` findings must reference the violated ID (e.g., `BI-007`, `NFR-AUTHZ-002`, `BR-SAL-001`, `AC-SAL-001`) or the affected security control (SECURITY §11).

---

## 5. Approval Criteria

Every change is assigned one of four outcomes by the reviewer(s):

| Outcome | Definition |
|---|---|
| **Approved** | No `CRITICAL` or `HIGH` findings; `MEDIUM`/`LOW`/`INFORMATIONAL` findings are either fixed, accepted with a tracked follow-up, or recorded. The change satisfies §3.1-§3.11. |
| **Approved with minor issues** | No `CRITICAL` or `HIGH` findings; one or more `MEDIUM`/`LOW` issues remain and are tracked with an owner and a timeline. Approval is granted with the explicit follow-up list recorded. |
| **Changes required** | One or more `HIGH` findings remain, or `MEDIUM` findings materially reduce safety/reviewability. The change is not approved until the named changes are made and re-reviewed. |
| **Blocked** | One or more `CRITICAL` findings remain, or an OD-gated / prohibited / out-of-scope behavior is present, or a required authorized exception is missing. The change must not be merged. |

**Mandatory rule:** `CRITICAL` and `HIGH` severity violations of security, correctness, requirements, business rules, or architecture **must not be approved** without resolution **or** an explicit authorized exception granted through the project's approval process (ROADMAP §11 - Owner/Stakeholder/CTO approval as applicable; CTO for the signing boundary, ARCH-DEC-006). An exception is not implicit in the review; it must be recorded with the change.

Additional rules:
- At least one reviewer who did not author the change approves it (four-eyes rule; DEVELOPMENT-GUIDELINES §16 review expectations).
- Approval is scoped to the diff as written; a change that grows beyond its declared feature/scope is flagged for scope creep (§2.9) and requires re-scoping before approval.
- Re-review is required after any fix that changes behavior, not after purely cosmetic edits.
- CI gates apply when CI exists (build + lint + test + typecheck per PR - PROPOSED, TECH-STACK §11); until CI is configured this remains `REQUIRES VERIFICATION`.

---

## 6. Contradiction and Precedence Handling

- **Established precedence:** resolve any conflict by the authority chain in the header - higher documents win. BUSINESS-RULES and REQUIREMENTS dominate FEATURES, ROADMAP, and all engineering/quality documents.
- **Companion quality SSOTs:** `TESTING.md`, `SECURITY.md`, and `INTEGRATION-SPECIFICATION.md` are the authorities for their domains; conflicts between them and an engineering-convention document are resolved toward the quality/security SSOT, then reported.
- **Never invent a resolution.** If two authoritative documents contradict, a reviewer must not silently pick one. Actions:
  1. Record the conflict and both sources.
  2. Apply the precedence chain to determine which governs (if the chain decides).
  3. If the chain does not decide (e.g., two same-tier docs conflict), mark the item `REQUIRES APPROVAL` and escalate per BUSINESS-RULES §13 Conflict Handling / ROADMAP §11.
- A review that relies on a superseded rule must be re-checked against the current `BUSINESS-RULES.md §13 Sources & Superseded Rules`.
- Any review finding that would require changing an SSOT (not just the code) is reported as a documentation issue, not resolved inline.

---

## 7. Traceability / Authority

| Section | Sources (authoritative) |
|---|---|
| §1 Scope and Purpose | ARCH-DEC-005/006; FOLDER-STRUCTURE; ROADMAP P1 |
| §2 Review Principles | All SSOTs; specifically TESTING §1, SECURITY §1/§17, ROADMAP §8.2/§11, BUSINESS-RULES §11/§13 |
| §3.1 Architecture | ARCHITECTURE §2/§3/§5/§6; BACKEND-ARCHITECTURE §1.3/§2.1/§2.3/§4/§18; FRONTEND-ARCHITECTURE §2/§6; FOLDER-STRUCTURE; BR-BND-001..003; BI-008; TECH-STACK §16 |
| §3.2 Requirements | REQUIREMENTS §6/§7/§12; ROADMAP §8.2/§9/§11; BUSINESS-RULES §11.10; BR-CFG-001; DEVELOPMENT-GUIDELINES §16/§18 |
| §3.3 Business Rules | BUSINESS-RULES §1.x/§5/§8/§10/§11; DATABASE-DESIGN §12.6; API-SPECIFICATION §2.2; BR-WAL-002; TECH-STACK §5/§8; ROADMAP R-11 |
| §3.4 Security | SECURITY §1-§15; API-SPECIFICATION §8; BACKEND-ARCHITECTURE §11/§17; NFR-AUTHZ-002; BI-008; BR-SEC-001..004; DATABASE-DESIGN §15; TESTING §8/§9 |
| §3.5 Performance | REQUIREMENTS §7 (NFR targets TBD); TESTING §13; API-SPECIFICATION §4; BACKEND-ARCHITECTURE §12; UI-UX §6.3; MOBILE-ARCHITECTURE §15 |
| §3.6 Maintainability | FRONTEND-ARCHITECTURE §2; FOLDER-STRUCTURE §4/§9.6; DEVELOPMENT-GUIDELINES §2/§3/§4/§5/§11/§12/§13/§14/§15; ROADMAP §9 |
| §3.7 Test Coverage | TESTING §1/§2/§8/§9/§10/§11/§14/§15/§16; ARCHITECTURE §11; SECURITY §18 |
| §3.8 Error Handling | API-SPECIFICATION §3/§5.3; BACKEND-ARCHITECTURE §10/§12; DEVELOPMENT-GUIDELINES §8/§10; INTEGRATION-SPECIFICATION §13; SECURITY §6 |
| §3.9 Code Smells | DEVELOPMENT-GUIDELINES §2-§7; FOLDER-STRUCTURE §9.6; BR-CFG-001; BR-WAL-002; FRONTEND-ARCHITECTURE §8 |
| §3.10 Dependencies | DEVELOPMENT-GUIDELINES §17; TECH-STACK §14/§15/§16; SECURITY §15; MOBILE-ARCHITECTURE §19; ROADMAP §11 |
| §3.11 Breaking Changes | API-SPECIFICATION §5.1; DATABASE-DESIGN §24; BUSINESS-RULES §5; BI-005; INTEGRATION-SPECIFICATION; ARCH-DEC-006; ROADMAP §11/R-12 |
| §4 Severity Model | BUSINESS-RULES §10/§11; ROADMAP §8.2/§11; SECURITY §1/§11; REQUIREMENTS §7/§12 |
| §5 Approval Criteria | ROADMAP §11; DEVELOPMENT-GUIDELINES §16; TECH-STACK §11; ARCH-DEC-006 |
| §6 Contradiction Handling | BUSINESS-RULES §13; ROADMAP §11/§12; header precedence chain |

---

## Validation performed
- Re-read the document; every section is grounded in the authoritative SSOTs and uses the project's status vocabulary.
- No new requirement, architecture decision, business rule, security policy, or threshold was introduced; all procedural content (severity model, approval outcomes) is review-process definition required by this document's charter and does not override any SSOT.
- The established precedence chain is reproduced from `MOBILE-ARCHITECTURE.md` (header) and supplemented by the companion quality SSOTs; no conflict was found between authoritative sources, and the handling rules (§6) match `BUSINESS-RULES.md §13` and `ROADMAP.md §11`.
- Repository state acknowledged: documentation-only; no code, manifests, CI, or Git to review until implementation begins.