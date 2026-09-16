# JAD - Security SSOT (SECURITY.md)

> **Purpose:** Authoritative security baseline for the JAD platform. Defines security principles, authentication, authorization, RBAC/permissions, input validation, output encoding, secrets management, data protection, encryption, session security, API security, rate limiting, audit logging, file-upload security, dependency security, OWASP considerations, threat model, security testing, and incident considerations.
>
> **Authority:** This document derives controls **only** from the project's SSOT set - `REQUIREMENTS.md` (NFR-*), `BUSINESS-RULES.md` (BR-*, BI-*), `FEATURES.md`, `ARCHITECTURE.md` (ARCH-DEC-*, §3/§9/§14), `API-SPECIFICATION.md` (§2/§3/§5/§8), `INTEGRATION-SPECIFICATION.md`, `BACKEND-ARCHITECTURE.md` (§8-§12/§15/§17/§21), `DATABASE-DESIGN.md` (§4.5/§8.3/§15/§22), `FRONTEND-ARCHITECTURE.md` (§8), `MOBILE-ARCHITECTURE.md` (§8/§9/§17), `TECH-STACK.md` (§5/§7/§12/§16/§17), `DEVELOPMENT-GUIDELINES.md` (§15/§17/§18), and `TESTING.md` (§8/§9). It introduces **no** new security requirement, rule, mechanism, or threshold unless explicitly marked `REQUIRES APPROVAL` or `TBD`.
>
> **Status vocabulary:** **CONFIRMED** = established by approved SSOT decisions. **PROPOSED** = recommended, not yet approved. **REQUIRES APPROVAL** = material decision (security, architecture, cost, production, or SSOT). **ASSUMPTION** = working assumption. **TBD** = unresolved; must not be invented. **REQUIRED** / **OPTIONAL** = normative / permissive for implementers. **REQUIRES VERIFICATION** = claim not yet confirmed.

---

## 1. Security Principles

Non-negotiable principles derived from approved decisions; listed in priority order:

1. **Server-side authorization only.** The API authorizes every request; the frontend/mobile client is never the security boundary. Client-side guards are UX only (NFR-AUTHZ-001/002; FRONTEND-ARCHITECTURE §8; MOBILE-ARCHITECTURE §8; BACKEND-ARCHITECTURE §9). A user can always craft a request directly to the API.
2. **Financial integrity is invariant.** Available Balance never negative (BI-001), Pending never withdrawable (BI-002), historical records immutable (BI-005), voucher redemption atomic and duplicate-free (BI-007), no general automatic refunds (BI-010). These are enforced in the database layer (constraints) and transactionally, not merely in application code (DATABASE-DESIGN §4.5/§12.6; ARCHITECTURE §14).
3. **The signing boundary is critical and non-negotiable.** The master voucher signing key is exclusively under CTO control; application infrastructure, developers, vendors, and DBAs never access it (BI-008; BR-SEC-001..004). The app only verifies signatures with the public key (API-SPECIFICATION §8).
4. **Least privilege.** Every role and every DB account holds the minimum authority required; DB roles mirror app roles; no `UPDATE`/`DELETE` on financial tables (API-SPECIFICATION §8; DATABASE-DESIGN §4.5; NFR-SEC-001).
5. **No sensitive data in transit, logs, or errors.** PII and financial data are never written to logs or error responses; `500`s are generic; secrets never enter code or logs (API-SPECIFICATION §8; BACKEND-ARCHITECTURE §11; REQUIREMENTS NFR-CONF-001).
6. **Defense in depth on financial paths.** DB constraints + application checks + audit trail + idempotency + atomic transactions; partial application is impossible on financial paths (ARCHITECTURE §14; API-SPECIFICATION §8; BACKEND-ARCHITECTURE §12).
7. **Security boundaries require approval to change.** Changes to authentication, authorization, the signing boundary, or external-provider handling are approval-gated (ROADMAP §11; ARCHITECTURE §16; MOBILE-ARCHITECTURE §17; DATABASE-DESIGN §22/§24).
8. **Prohibited behaviors are absolute.** No payment-gateway/wallet/auto-refund functionality, no weakening of the CTO-controlled signing boundary, no silently-converted `TBD` rules (BUSINESS-RULES §11; TECH-STACK §16).

---

## 2. Authentication

CONFIRMED baseline:

| Concern | Decision | Status | Source |
|---|---|---|---|
| Web sessions | **Session-based** authentication via HttpOnly, Secure, SameSite cookies (ARCH-DEC-007) | **CONFIRMED** | ARCHITECTURE §16; API-SPECIFICATION §2.1; TECH-STACK §7 |
| Session lifecycle | `POST /auth/login` establishes; `POST /auth/logout` invalidates; `POST /auth/refresh` rotates | **CONFIRMED** | API-SPECIFICATION §2.1 |
| Session storage | Database-backed session store | **PROPOSED** | BACKEND-ARCHITECTURE §8; TECH-STACK §7 |
| Email verification | Verification token flow (`POST /auth/verify-email`) precedes account approval (BR-AUTH-001) | **CONFIRMED** | API-SPECIFICATION §2.1; REQUIREMENTS NFR-AUTH-002 |
| Service identity | Internal/service-to-service calls use a short-lived token from the secret manager - never user cookies; `SYS` is an internal service identity, not a DB role | **CONFIRMED** | API-SPECIFICATION §2.1/§2.2; INTEGRATION-SPECIFICATION §4 |
| Credential policy | Password rules, lockout policy, MFA. (Hashing - Argon2/bcrypt - already specified: DATABASE-DESIGN §22) | **TBD** - ASSUMPTION 1 (REQUIREMENTS §10) | REQUIREMENTS ASSUMPTION 1; TECH-STACK §7 |

**Consequences for implementation:**
- All endpoints are authenticated by default; unauthenticated access requires explicit `PUBLIC` declaration (BACKEND-ARCHITECTURE §8).
- Authentication failures return `401 UNAUTHORIZED`; they never disclose whether the account exists (API-SPECIFICATION §3; 404 hides existence).
- Session rotation on refresh must invalidate the prior session (refresh rotation per API-SPECIFICATION §8).
- Mobile/secure-storage session handling and token revocation on logout: MOBILE-ARCHITECTURE §8/§9.5.
- No component may rely on client-held tokens as a credential; push tokens are device identifiers only, revocable on logout (MOBILE-ARCHITECTURE §8/§9).

---

## 3. Authorization

- **RBAC guards** enforce BUSINESS-RULES §3 for every endpoint (API-SPECIFICATION §2.2; BACKEND-ARCHITECTURE §9).
- **Object-level authorization (NFR-AUTHZ-002):** member-scoped endpoints verify the session user owns the resource - prevents IDOR/BOLA. Staff roles use staff-scoped paths; no staff role acts on a member's behalf through member endpoints (API-SPECIFICATION §2.2).
- **Business eligibility is separate from roles:** e.g., `POST /sales` requires role Member **and** status Active + Qualified, else `422 MEMBER_NOT_QUALIFIED` (API-SPECIFICATION §2.2; BR-SAL-001).
- **404 hides existence:** resources belonging to others are indistinguishable from nonexistent resources (API-SPECIFICATION §3; §8).
- **Role shorthand** (`PUBLIC`, `AUTH`, `MEM`, `AQ`, `ADM`, `FIN`, `SUP`, `MRCH`, `SYS`) used in the endpoint inventory (API-SPECIFICATION §2.2).
- **DB roles mirror app roles**; least privilege; financial tables restrict `UPDATE`/`DELETE` (DATABASE-DESIGN §4.5; API-SPECIFICATION §8).
- **Frontend guards are UX, not security**; hidden UI controls are never proof of authorization (FRONTEND-ARCHITECTURE §8; TESTING.md §8).
- **Sensitive object access is audited:** staff access to approvals, verifications, exceptions, and adjustments writes to the audit trail (NFR-SEC-002; API-SPECIFICATION §8).

---

## 4. RBAC / Permissions

- Role model and full permission matrix live in **BUSINESS-RULES §3** (authoritative; do not duplicate here).
- Database enforces role membership: `accounts.role` CHECK constraint on `MEMBER, ADMIN, FINANCE, SUPER_ADMIN, MERCHANT` (API-SPECIFICATION §2.2; DATABASE-DESIGN).
- `SYS` is an internal service identity for service-to-service calls, not a database role and not available to user sessions (API-SPECIFICATION §2.2; INTEGRATION-SPECIFICATION §4).
- Role checks are applied per endpoint by guards in the controller layer; business eligibility checks (status/qualification) are separate and return `422` (BACKEND-ARCHITECTURE §9).
- **No staff role may impersonate a member** through member endpoints (API-SPECIFICATION §2.2) - a permanent control, not a temporary privilege.
- Super Admin exceptions (financial adjustment, recovery after reversal) are role-gated **and** audited (BUSINESS-RULES §8; BR-ADJ-*; NFR-SEC-002).

---

## 5. Input Validation

- **All** API request bodies, query, and path inputs are validated against shared **Zod schemas** in `packages/contracts` (API-SPECIFICATION §1.3/§8; BACKEND-ARCHITECTURE §7; INTEGRATION-SPECIFICATION §2).
- Strict money/rate formats; money is exact-decimal strings (`NUMERIC`, never floating point) (API-SPECIFICATION §8; TECH-STACK §5/§17; BR-WAL-002).
- Validation failures return the unified error envelope with `VALIDATION_ERROR` and `details`; no internal data is exposed (API-SPECIFICATION §3).
- **Two validation layers:** technical/schema validation (Zod, DTO) and **business validation** (status, eligibility, mandatory rejection reasons, limits) - BUSINESS-RULES §9; BACKEND-ARCHITECTURE §6/§7.
- Database re-validates business rules via CHECK constraints (e.g., balance never negative, media-type allowlist, status transitions) (DATABASE-DESIGN §12.6).
- Input is never concatenated into SQL: parameterized queries only; repositories never build dynamic SQL (API-SPECIFICATION §8; BACKEND-ARCHITECTURE §5).

---

## 6. Output Encoding

- **Frontend:** rendering is declarative (React/RN) with automatic escaping; no raw HTML injection of user or staff content (FRONTEND-ARCHITECTURE; MOBILE-ARCHITECTURE). Any raw-content rendering is `REQUIRES APPROVAL`.
- **API responses** never include internal details, stack traces, or PII not required by the caller; `500` responses are generic (API-SPECIFICATION §3; BACKEND-ARCHITECTURE §10).
- **Logs** never contain passwords, verification tokens, session ids/values, `Idempotency-Key`s, voucher payloads/signatures, payout account numbers, or secrets; sensitive fields are redacted (BACKEND-ARCHITECTURE §11).
- **Admin/marketing content** (photos, videos, landing pages, promo materials, policies, Terms) is managed content (BR-MKT-001/BR-NOT-001); forward/download capabilities are controlled (BR-MKT-002). Rendering it safely is the responsibility of the client component that displays it.
- Content-Type driven responses; money displayed per DESIGN-SYSTEM §9 (exact-decimal display).

---

## 7. Secrets Management

| Concern | Control | Status | Source |
|---|---|---|---|
| Storage | Secrets via environment/secret manager only; never committed; `.env*` ignored | **CONFIRMED** | API-SPECIFICATION §8; FOLDER-STRUCTURE §env; DEVELOPMENT-GUIDELINES §18; NFR-SEC-001 |
| Bundles | No secret may be compiled into a web/mobile bundle (`VITE_*` typed env; public config only) | **CONFIRMED** | DEVELOPMENT-GUIDELINES §18; MOBILE-ARCHITECTURE §17 |
| Service tokens | Service-to-service credentials short-lived, from secret manager | **CONFIRMED** | API-SPECIFICATION §2.1; INTEGRATION-SPECIFICATION §4 |
| Master signing key | Exclusively under CTO control; never in code, workstations, app servers, vendor/DBD access; dedicated signing process | **CONFIRMED** | BR-SEC-001..004; BI-008 |
| Signing mechanism | Cloud KMS / HSM-based dedicated service, CTO-chosen | **REQUIRES APPROVAL (CTO)** | ARCHITECTURE §16 (ARCH-DEC-006) |
| External provider credentials | Stored in secret manager; used only by server-side integration | **CONFIRMED** | INTEGRATION-SPECIFICATION §4/§10 |
| Verification | `REQUIRES VERIFICATION` - no dependency manifests exist; `.env.example` templates only | **REQUIRES VERIFICATION** | FOLDER-STRUCTURE §env |

**Rules:** no secrets in source, logs, error responses, or client code; secret rotation and audit of access to secret-managed values follow the audit/approval boundary (NFR-SEC-001/002).

---

## 8. Data Protection

- **Classification:** PII and financial data are classified as sensitive in the database design (DATABASE-DESIGN §8.3). This includes member identity documents, geolocation checks, location exceptions, payout accounts, wallet balances, and voucher data.
- **Restricted access roles:** DB roles `app`, `migration/ddl`, `reporting`, and append-only `audit`; least privilege; no `UPDATE`/`DELETE` on financial tables (DATABASE-DESIGN §4.5).
- **Redaction and access auditing:** sensitive fields redacted where not needed; access to sensitive data is auditable (API-SPECIFICATION §8; DATABASE-DESIGN §8.3; NFR-CONF-001).
- **Storage boundary:** document/media files (identity documents, photos, promo material) live in **object storage**; the primary database holds metadata only (DATABASE-DESIGN A-08; BACKEND-ARCHITECTURE §2.1 storage adapter).
- **Backups:** backups are managed; financial and audit tables are considered irreplaceable and are subject to the documented backup/recovery policy (DATABASE-DESIGN §21).
- **Compliance:** personal and financial data protection follows NFR-DATA-001/NFR-CONF-001; GDPR/specific-regulation applicability is **not** defined - `REQUIRES APPROVAL` (see §20).
- **Data lifecycle** and retention are defined in DATABASE-DESIGN §17 (authoritative); hard deletion of financial/audit data is **REQUIRES APPROVAL** (DATABASE-DESIGN §16).

---

## 9. Encryption

| Layer | Control | Status | Source |
|---|---|---|---|
| Transport | TLS for all external traffic; no cleartext HTTP | **CONFIRMED** | MOBILE-ARCHITECTURE §17 (TLS); INTEGRATION-SPECIFICATION §10 |
| TLS pinning | Mobile certificate pinning | **REQUIRES APPROVAL** (not mandated) | MOBILE-ARCHITECTURE §17 |
| At rest | Managed encryption at rest via the chosen DB/provider; key handling by provider/CTO-managed | **CONFIRMED** (managed) / specifics **REQUIRES APPROVAL** | DATABASE-DESIGN §8.3; TECH-STACK §5/§17 |
| Signing | Asymmetric voucher signing; public key verifies, master key signs only in CTO service | **CONFIRMED** | BR-SEC-001..004; BI-008; API-SPECIFICATION §8 |
| Client storage | Mobile secure storage for tokens/session artifacts (Part B); no secrets in bundles | **REQUIRES APPROVAL** (native dependency) | MOBILE-ARCHITECTURE §9/§17 |
| Hashing | Session cookie tokens, email-verification tokens, and `Idempotency-Key`s stored hashed - raw values never stored | **CONFIRMED** | DATABASE-DESIGN §4 (session_token_hash/token_hash), §12.6 (U-06/U-08), §22 |
| Password hashing | Argon2/bcrypt hash; never stored in clear | **CONFIRMED** (design; DATABASE-DESIGN §22) | DATABASE-DESIGN §22; policy TBD (ASSUMPTION 1) |
| Field-level encryption | `payout_accounts.account_identifier` field-level encryption | **REQUIRES APPROVAL** (DA-08) | DATABASE-DESIGN §22/§24 |

---

## 10. Session Security

- HttpOnly, Secure, SameSite cookies; CSRF protection for cookie-authenticated requests (API-SPECIFICATION §8). The specific CSRF mechanism (double-submit token / Origin check / dedicated header) is **REQUIRES APPROVAL** (BACKEND-ARCHITECTURE §21).
- Refresh rotation: `POST /auth/refresh` rotates the session; previous session invalidated (API-SPECIFICATION §2.1/§8).
- Logout invalidates the session (API-SPECIFICATION §2.1); mobile revokes its device token on logout (MOBILE-ARCHITECTURE §9.5).
- DB-backed session store is **PROPOSED** (BACKEND-ARCHITECTURE §8; TECH-STACK §7).
- Session identifiers are never logged or embedded in URLs (BACKEND-ARCHITECTURE §11).
- No session/sensitive value may be exposed to the client bundle or to service-to-service calls (API-SPECIFICATION §2.1).

---

## 11. API Security

Consolidates API-SPECIFICATION §8 (Security-by-Design). Applicable to every endpoint:

| Concern | Control |
|---|---|
| Authentication | HttpOnly/Secure/SameSite cookies; CSRF protection; refresh rotation |
| Authorization | RBAC guards (BUSINESS-RULES §3) + object-level ownership (NFR-AUTHZ-002) |
| Least privilege | Endpoints expose only what the role needs; DB roles mirror app roles |
| Input validation | Zod schemas; strict money/rate formats |
| Injection | Parameterized queries only |
| Sensitive data | No PII/financial data in logs/errors; generic 500s; redaction |
| IDOR/BOLA | Ownership verification; 404 hides others' resources |
| CORS | Allowlist of first-party origins only |
| Secrets | Environment/secret manager; `.env*` ignored |
| Rate limiting | Per-IP/per-user; strict on auth and redemption (§5.2) |
| Auditability | Every approval/verification/exception/adjustment mutation audited |
| Failure behavior | Atomic transactions; idempotency; no partial financial application |
| Signing boundary | App verifies only; master key in CTO service |

Additional API security rules:
- Unified error envelope; codes never leak internals (API-SPECIFICATION §3).
- Idempotency-Key required on the four financial mutations; keys hashed in store (API-SPECIFICATION §5.3; DATABASE-DESIGN §12.6 U-08).
- Versioned `/api/v1` contract; OpenAPI 3.1 published at `/api/v1/docs` (API-SPECIFICATION §5.4).
- No inbound webhooks are confirmed; outbound events are **PROPOSED / REQUIRES APPROVAL**; external parties never trigger writes into JAD (INTEGRATION-SPECIFICATION §6; ARCHITECTURE §3).
- Every financial write happens inside a single ACID transaction; no auto refunds (BACKEND-ARCHITECTURE §12; BI-010).

---

## 12. Rate Limiting

- **Per-IP and per-user** rate limiting (API-SPECIFICATION §5.2/§8).
- **Strict limits on sensitive endpoints:** `POST /auth/login`, `POST /auth/register`, `POST /auth/verify-email`, and `POST /vouchers/:id/redemptions` (API-SPECIFICATION §5.2).
- Rate-limit violations return `429 RATE_LIMITED` (API-SPECIFICATION §3).
- Limit values are configurable (BR-CFG-001) but **not yet specified** - exact values and burst/window policy are **TBD → REQUIRES APPROVAL** (API-SPECIFICATION §5.2).
- Rate limiting is an availability/abuse control; it never replaces authentication or authorization.

---

## 13. Audit Logging

- **Authoritative design:** DATABASE-DESIGN §15 (audit entity and same-transaction writes).
- **Invariant:** every mutation on approvals, verifications, exceptions, and adjustments writes to `audit` in the **same transaction** (NFR-SEC-002; API-SPECIFICATION §8; ARCHITECTURE §4.3/§9).
- **Immutability:** audit log is insert-only, append-only; no `UPDATE`/`DELETE` (BI-005; DATABASE-DESIGN §4.5/§15).
- Audit events include actor, action, affected entity, timestamp, reason where applicable, and result (e.g., exception workflows per BUSINESS-RULES §8).
- Application logging is **separate** from audit logging; request-id correlation is used (BACKEND-ARCHITECTURE §11/§15). Logs must never contain PII/financial data, secrets, session ids, verification tokens, `Idempotency-Key`s, voucher signatures, or payout account numbers (BACKEND-ARCHITECTURE §11).
- Audit access is restricted to privileged roles; the audit role is insert/read-only at the DB level (DATABASE-DESIGN §4.5/§15).

---

## 14. File Upload Security

Scope: media assets (photos, videos, advertisement images, landing pages, promo materials - BR-MKT-001) and identity documents (registration - FR-REG / ID-document upload), served from object storage (DATABASE-DESIGN A-08).

| Rule | Status |
|---|---|
| Uploads are stored in object storage; the primary DB stores metadata only | **CONFIRMED** (DATABASE-DESIGN A-08) |
| Media type constrained by DB CHECK (e.g., `media_type` allowlist) | **CONFIRMED** (DATABASE-DESIGN §12.6) |
| Access to files is controlled per resource: members access their own media; staff access staff-scoped media; download/forward restricted per BR-MKT-002 | **CONFIRMED** (API-SPECIFICATION §6.16) |
| Identity documents are sensitive PII (classification §8.3); access and retention follow §8/§13 | **CONFIRMED** (DATABASE-DESIGN §8.3) |
| Content-type/size validation, malware scanning, safe-render handling, signed-URL expiry and scope | **REQUIRES APPROVAL** (mechanisms not yet specified) |

- Files are served via the storage adapter behind interfaces (BACKEND-ARCHITECTURE §2.1); the client never reaches the bucket directly without a controlled, authorized path.
- Executable/scriptable content and server-side execution of uploaded content are implicitly excluded by the storage-boundary design; a formal file-type policy is **REQUIRES APPROVAL**.

---

## 15. Dependency Security

- **Supply-chain posture:** supply-chain review before adding any dependency; versions pinned once manifests exist; no prohibited technologies (TECH-STACK §16/§14; DEVELOPMENT-GUIDELINES §17).
- **Prohibited categories:** payment-gateway SDKs, wallet APIs/moving-money libraries, floating-point money libraries, NoSQL for financial data, MLM libraries, auto-refund frameworks, and any library that embeds signing keys/HSM secrets in source or app bundles (TECH-STACK §16; MOBILE-ARCHITECTURE §17).
- Every native mobile dependency (navigation, storage, permissions, push, geolocation, secure storage, deep-linking, image picker) is **REQUIRES APPROVAL** and must be evaluated for security/supply-chain risk before approval (MOBILE-ARCHITECTURE §19).
- Major dependency upgrades are approval-gated; lockfiles enforce reproducibility (DEVELOPMENT-GUIDELINES §17; FOLDER-STRUCTURE).
- No dependency manifests exist in the repository - this is **REQUIRES VERIFICATION** until implementation begins (TECH-STACK §14).

---

## 16. OWASP Considerations

Mapping of OWASP Top 10 categories to confirmed controls. This is a **coverage mapping, not a guarantee of compliance**; a formal security-assessment program is `REQUIRES APPROVAL` (see §20).

| OWASP category | JAD control (source) | Status |
|---|---|---|
| A01 Broken Access Control | RBAC guards + object-level ownership + 404-hides-existence (API-SPECIFICATION §2.2/§3/§8; NFR-AUTHZ-001/002) | **CONFIRMED** design |
| A02 Cryptographic Failures | TLS in transit; managed encryption at rest; asymmetric signing boundary (BR-SEC-001..004; MOBILE-ARCHITECTURE §17; DATABASE-DESIGN §8.3) | **CONFIRMED** design; algorithm choices TBD |
| A03 Injection | Zod validation + parameterized queries only (API-SPECIFICATION §8; BACKEND-ARCHITECTURE §5) | **CONFIRMED** design |
| A04 Insecure Design | Financial invariants in DB layer; atomic transactions; no auto refunds (BI-001..010; ARCHITECTURE §14; BACKEND-ARCHITECTURE §12) | **CONFIRMED** design |
| A05 Security Misconfiguration | `.env*` ignored; env/secret-manager secrets; CORS first-party allowlist; least-privilege DB roles (API-SPECIFICATION §8; DATABASE-DESIGN §4.5) | **CONFIRMED** design |
| A06 Vulnerable/Outdated Components | Supply-chain review; pinned versions; prohibited-tech list (DEVELOPMENT-GUIDELINES §17; TECH-STACK §16) | **CONFIRMED** policy |
| A07 Identification/AuthN Failures | Session-based auth; email verification precedes approval; refresh rotation (API-SPECIFICATION §2.1; BR-AUTH-001) | **CONFIRMED** design; credential policy TBD |
| A08 Software/Data Integrity Failures | Idempotency on financial mutations; hashed keys; immutable audit; no inbound webhooks (API-SPECIFICATION §5.3; INTEGRATION-SPECIFICATION §6) | **CONFIRMED** design |
| A09 Security Logging/Monitoring Failures | Audit log append-only same-transaction; structured logs with redaction; health/readiness (DATABASE-DESIGN §15; BACKEND-ARCHITECTURE §11/§15) | **CONFIRMED** design; alerting TBD |
| A10 SSRF / server-side request forgery | External integrations use scoped server-side clients behind interfaces; no user-controlled arbitrary outbound requests (INTEGRATION-SPECIFICATION §3/§10) | **CONFIRMED** design |

**Not yet defined (each REQUIRES APPROVAL):** credential/password policy and MFA, CSRF mechanism, CSP/HSTS and other hardening headers, exact TLS versions and pinning, malware scanning, vulnerability-scanning cadence, and a formal security-assessment/penetration-test schedule.

---

## 17. Threat Model

**Scope:** derived from the confirmed trust boundaries and actors. A formal threat-model process (STRIDE walkthroughs, owner-approved) is `REQUIRES APPROVAL`; this section documents the confirmed boundaries the model must respect.

**Trust boundaries (ARCHITECTURE §3; §16):**
- **Client ↔ API:** untrusted client devices (web/mobile) interact with the API over TLS; sessions are server-side; the client is never a security boundary (NFR-AUTHZ-001/002).
- **Signing boundary:** application infrastructure, developers, vendors, and DBAs never touch the master key; only the CTO-controlled signing service signs (BR-SEC-001..004; BI-008). This is the most critical boundary in the system.
- **JAD ↔ external providers:** email, geolocation, push, object storage, payout/reporting providers are external; JAD records but does not move money (BR-BND-001..003); provider credentials are in the secret manager; failures are time-bounded and never corrupt local state (INTEGRATION-SPECIFICATION §3/§10; BACKEND-ARCHITECTURE §2.1).
- **Storage boundary:** media/files live in object storage; DB holds metadata only (DATABASE-DESIGN A-08).
- **No inbound-webhook trust:** external parties never trigger writes; no automatic refunds (INTEGRATION-SPECIFICATION §6; ARCHITECTURE §3).

**Assets of highest value:**
1. Financial records (wallet balances, commission ledger, withdrawals, vouchers) - integrity and immutability (BI-001..BI-010).
2. Member PII and identity documents - confidentiality (NFR-CONF-001; DATABASE-DESIGN §8.3).
3. Voucher signing keys - secrecy (BI-008; BR-SEC-001..004).
4. Audit trail - integrity (NFR-SEC-002; BI-005).

**Threats implied by the confirmed design (must be addressed in the threat model):**
- **R-05 Authorization / object-level leakage** (confidentiality-critical risk; ROADMAP §10): mitigated by NFR-AUTHZ-002 + 404-hides-existence.
- **R-04 Financial integrity** (ROADMAP §10): mitigated by DB invariants, atomic transactions, idempotency.
- **R-07 Atomicity** (ROADMAP §10): mitigated by single-transaction financial writes and serializable ledger operations (BACKEND-ARCHITECTURE §12).
- **R-02 Signing-service availability** (ROADMAP §10): signing is a critical dependency; voucher issuance/redemption depends on it.
- **Key exposure / signing-key compromise:** controlled by BI-008/BR-SEC-001..004 and tested by AC-SEC-001 (simulated compromise must not expose the key).
- **Credential theft / session hijacking:** mitigated by HttpOnly/Secure/SameSite cookies, refresh rotation, and CSRF protection; residual risk until credential policy is approved.
- **Abuse / enumeration:** mitigated by rate limiting (strict on auth and redemption) and generic 401/404 responses.
- **Data exfiltration via logs:** mitigated by logging redaction rules (BACKEND-ARCHITECTURE §11).

**Ongoing requirement:** the threat model must be re-verified whenever a security boundary changes; boundary changes are approval-gated (ROADMAP §11; ARCHITECTURE §16).

---

## 18. Security Testing

Authoritative test strategy: **TESTING.md** (§8 Authorization Tests, §9 Security Tests). Summary of confirmed coverage:

| Security area | Tested via (TESTING.md reference) | Notes |
|---|---|---|
| Authentication | AuthN contract tests (§5), authN spec tests (§8) | login/logout/refresh, verification, service tokens |
| Authorization / RBAC | Full role × endpoint matrix; forbidden attempts; hidden UI never proof (§8) | Every endpoint × role; object-level ownership negative tests |
| Business eligibility | 422 `MEMBER_NOT_QUALIFIED` cases; 403/422 distinction (§5/§8) | status/qualification gating |
| IDOR/BOLA | Ownership negative tests; 404-hides-existence assertions (§8/§9) | member-scoped resources |
| Signing boundary | AC-SEC-001 simulation: compromised app infra must not expose the master key (§9) | explicit acceptance criterion |
| Injection | All data-access paths parameterized; negative payload tests (§9) | Zod + parameterized queries |
| Rate limiting | 429 behavior on auth/redemption endpoints (§9/§5) | per-IP/per-user |
| Audit integrity | Audit entries written in same transaction; insert-only (§9) | BI-005 enforcement |
| Money/financial invariants | BI-001..BI-010 invariant tests in CI (§3/§4/§9) | DB constraint + app level |
| Secrets in artifacts | No-secret-in-bundle verification; `.env*` ignore check (§9/§17) | web + mobile |
| Concurrency | Redemption/withdrawal race tests (§4/§10/§11) | atomicity of BI-007 |

**Security testing that is REQUIRES APPROVAL:** penetration testing, SAST/DAST tooling and cadence, malware-scanning validation for uploads, vulnerability scanning schedule, and security-focused test environments beyond the standard environments (§14/§20).

---

## 19. Incident Considerations

> **Baseline reality:** no incident-response (IR) plan, runbook, escalation matrix, or on-call policy is currently documented in the SSOT set. This section records the confirmed building blocks and the gaps. **The IR plan itself is REQUIRES APPROVAL** and must not be invented here.

**Confirmed building blocks the IR plan must integrate:**
- **Detection/monitoring:** health/readiness endpoints (`/health`, `/ready`); structured logs with request correlation; metrics deferred; distributed tracing **REQUIRES APPROVAL** (BACKEND-ARCHITECTURE §15).
- **Recovery:** documented backup/recovery policy; financial and audit tables are irreplaceable (DATABASE-DESIGN §21). Restore procedures and RTO/RPO are **REQUIRES APPROVAL** (RA targets TBD per REQUIREMENTS §7).
- **Integrity forensics:** append-only immutable audit log enables after-the-fact reconstruction of approvals, verifications, exceptions, and adjustments (DATABASE-DESIGN §15; BI-005).
- **Containment of the signing boundary:** even under compromise of application infrastructure, the master key must remain unexposed (BI-008; BR-SEC-001..004; AC-SEC-001).
- **Financial incident handling:** the only confirmed manual recovery path is Super Admin recovery after a withdrawn-commission reversal (BUSINESS-RULES §8); no automatic refund workflow exists (BI-010).

**Gaps requiring approval/definition:** IR plan, severity/classification, escalation and owner communication, breach-notification/compliance obligations, evidence handling, post-incident review cadence, RTO/RPO, and monitoring/alerting thresholds.

---

## 20. REQUIRES APPROVAL Register

Items that materially affect security and must be approved before implementation. **They must not be invented by the development team.**

| ID | Item | Current state | Needed |
|---|---|---|---|
| SA-01 | Credential policy (password rules, lockout, MFA). Hashing (Argon2/bcrypt, DATABASE-DESIGN §22) is already specified | **TBD** (REQUIREMENTS ASSUMPTION 1) | Owner decision |
| SA-02 | CSRF protection mechanism for cookie-authenticated requests | Unspecified (API-SPECIFICATION §8; BACKEND-ARCHITECTURE §21) | Mechanism decision |
| SA-03 | Rate-limit values and window policy (strict on auth/redemption) | Configurable, values TBD (API-SPECIFICATION §5.2; BR-CFG-001) | Values |
| SA-04 | Idempotency-Key retention window (currently 24h PROPOSED) | **PROPOSED** (API-SPECIFICATION §5.3) | Confirm |
| SA-05 | Signing-service mechanism (KMS/HSM/air-gapped) | Cloud KMS/HSM dedicated service recommended; CTO-chosen (ARCHITECTURE §16 ARCH-DEC-006) | CTO approval |
| SA-06 | TLS specifics: versions, cipher policy, mobile pinning | TLS CONFIRMED; pinning REQUIRES APPROVAL (MOBILE-ARCHITECTURE §17) | Policy |
| SA-07 | Encryption-at-rest specifics (managed vs key ownership) | Managed via provider; specifics TBD (DATABASE-DESIGN §8.3) | Decision |
| SA-08 | File-upload security: type/size policy, malware scanning, signed-URL controls | Not specified | Decision |
| SA-09 | Dependency and supply-chain policy, vulnerability-scanning cadence, SAST/DAST, penetration testing | Policy CONFIRMED; cadence/tooling TBD (DEVELOPMENT-GUIDELINES §17) | Program |
| SA-10 | Mobile secure storage for tokens and native dependencies | Part B, REQUIRES APPROVAL (MOBILE-ARCHITECTURE §9/§19) | Approvals |
| SA-11 | Data-protection/compliance scope (GDPR and equivalents) | NFR-DATA-001; applicability undefined | Compliance decision |
| SA-12 | Incident-response plan, RTO/RPO, monitoring/alerting thresholds, distributed tracing | Undefined (BACKEND-ARCHITECTURE §15; DATABASE-DESIGN §21) | Owner approval |
| SA-13 | Formal threat-model process and security-assessment schedule | Boundaries confirmed; process TBD | Owner approval |

---

## 21. Traceability / Authority

| Section | Sources (authoritative) |
|---|---|
| §1 Security Principles | REQUIREMENTS NFR-*; BUSINESS-RULES BI-*, §11; ARCHITECTURE §14/§15; API-SPECIFICATION §8 |
| §2 Authentication | ARCHITECTURE §16 (ARCH-DEC-007); API-SPECIFICATION §2.1; BACKEND-ARCHITECTURE §8; TECH-STACK §7; REQUIREMENTS NFR-AUTH-001/002, ASSUMPTION 1; BR-AUTH-001 |
| §3 Authorization | API-SPECIFICATION §2.2/§3/§8; NFR-AUTHZ-001/002; BACKEND-ARCHITECTURE §9; FRONTEND-ARCHITECTURE §8; BUSINESS-RULES §3 |
| §4 RBAC / Permissions | BUSINESS-RULES §3; API-SPECIFICATION §2.2; DATABASE-DESIGN (roles); INTEGRATION-SPECIFICATION §4 |
| §5 Input Validation | API-SPECIFICATION §1.3/§8; BACKEND-ARCHITECTURE §6/§7; BUSINESS-RULES §9; DATABASE-DESIGN §12.6; TECH-STACK §5 |
| §6 Output Encoding | API-SPECIFICATION §3/§8; BACKEND-ARCHITECTURE §10/§11; FRONTEND-ARCHITECTURE; MOBILE-ARCHITECTURE; BR-MKT-001/002; DESIGN-SYSTEM §9 |
| §7 Secrets Management | API-SPECIFICATION §8; FOLDER-STRUCTURE §env; DEVELOPMENT-GUIDELINES §18; MOBILE-ARCHITECTURE §17; NFR-SEC-001; BR-SEC-001..004; BI-008; ARCHITECTURE §16 |
| §8 Data Protection | DATABASE-DESIGN §4.5/§8.3/§16/§17/§21; API-SPECIFICATION §8; REQUIREMENTS NFR-CONF-001, NFR-DATA-001 |
| §9 Encryption | MOBILE-ARCHITECTURE §17; INTEGRATION-SPECIFICATION §10; DATABASE-DESIGN §8.3; BR-SEC-001..004; BI-008; TECH-STACK §5/§17 |
| §10 Session Security | API-SPECIFICATION §2.1/§8; BACKEND-ARCHITECTURE §8/§11/§21; MOBILE-ARCHITECTURE §9.5 |
| §11 API Security | API-SPECIFICATION §8; §2/§3/§5; BACKEND-ARCHITECTURE §12; INTEGRATION-SPECIFICATION §3/§6; ARCHITECTURE §3/§14 |
| §12 Rate Limiting | API-SPECIFICATION §5.2/§8; BUSINESS-RULES §9; BR-CFG-001 |
| §13 Audit Logging | DATABASE-DESIGN §15/§4.5; API-SPECIFICATION §8; ARCHITECTURE §4.3/§9; BACKEND-ARCHITECTURE §11; NFR-SEC-002; BUSINESS-RULES §8; BI-005 |
| §14 File Upload Security | DATABASE-DESIGN A-08/§8.3/§12.6; BR-MKT-001/002; API-SPECIFICATION §6.16; BACKEND-ARCHITECTURE §2.1 |
| §15 Dependency Security | DEVELOPMENT-GUIDELINES §17; TECH-STACK §14/§16; MOBILE-ARCHITECTURE §17/§19 |
| §16 OWASP Considerations | Same controls as §2-§15 (mapping only) |
| §17 Threat Model | ARCHITECTURE §3/§16; BR-SEC-001..004; BI-008; BR-BND-001..003; INTEGRATION-SPECIFICATION §3/§6/§10; DATABASE-DESIGN §8.3; ROADMAP §10 (R-02/R-04/R-05/R-07); AC-SEC-001 |
| §18 Security Testing | TESTING.md §8/§9/§17; AC-SEC-001; BI-001..BI-010 |
| §19 Incident Considerations | BACKEND-ARCHITECTURE §15; DATABASE-DESIGN §21; BUSINESS-RULES §8; BI-005/BI-008/BI-010; AC-SEC-001 |

---

## 22. Cross-Reference Index

| Security topic | Owning SSOT location |
|---|---|
| Role/permission matrix | BUSINESS-RULES §3 |
| Business invariants (incl. BI-008) | BUSINESS-RULES §10 |
| Explicitly prohibited behaviors | BUSINESS-RULES §11 |
| Unresolved decisions (OD-*) | BUSINESS-RULES §12; REQUIREMENTS §14 |
| NFRs (SEC/AUTHZ/AUTH/CONF/AUD/INT/CRYPTO/ATOM) | REQUIREMENTS §7 |
| Acceptance criteria (incl. AC-SEC-001) | REQUIREMENTS §12 |
| Cryptographic signing rules | BUSINESS-RULES §1.18; FEATURES FEAT-059 |
| API security-by-design | API-SPECIFICATION §8 |
| Error format / status codes | API-SPECIFICATION §3 |
| Rate limiting / idempotency | API-SPECIFICATION §5.2/§5.3 |
| Auth architecture (backend) | BACKEND-ARCHITECTURE §8/§9 |
| Logging & observability | BACKEND-ARCHITECTURE §11/§15 |
| Transactions / atomicity | BACKEND-ARCHITECTURE §12 |
| DB security roles & encryption | DATABASE-DESIGN §4.5/§8.3 |
| Audit trail | DATABASE-DESIGN §15 |
| Backup/recovery | DATABASE-DESIGN §21 |
| Client-side authorization (UX only) | FRONTEND-ARCHITECTURE §8; MOBILE-ARCHITECTURE §8 |
| Mobile secure storage / permissions | MOBILE-ARCHITECTURE §9/§10/§17 |
| Prohibited technologies | TECH-STACK §16 |
| Dependency security | DEVELOPMENT-GUIDELINES §17 |
| Secrets / env config | DEVELOPMENT-GUIDELINES §18; FOLDER-STRUCTURE §env |
| Authorization & security tests | TESTING.md §8/§9 |
| Approval boundary | ROADMAP §11; ARCHITECTURE §16 |

---

## Validation performed
- Re-read full document; every citation cross-checked against the authoritative sources (grep-verified section numbers).
- No security requirement, mechanism, or threshold introduced beyond the SSOT set; all open items are explicitly `REQUIRES APPROVAL`/`TBD` (§20) and reference the owner decision IDs where they exist (OD-014/015 geolocation, ASSUMPTION 1 credentials).
- No contradictions with `TESTING.md`, `INTEGRATION-SPECIFICATION.md`, or `API-SPECIFICATION.md`; terminology matches the project's status vocabulary.