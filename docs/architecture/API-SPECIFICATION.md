# JAD — API Specification SSOT (API-SPECIFICATION.md)

> **Authority:** Defines the REST API architecture, conventions, and endpoint inventory for the JA&D platform. Companion to `ARCHITECTURE.md` (modular Vercel Functions, backend handlers) and `TECH-STACK.md` (Vercel Functions, OpenAPI 3.1) as updated Q1 2026-08-30.
>
> **Status of endpoints:** The repository contains **no implementation**. Every endpoint below is **PLANNED** unless marked otherwise. No endpoint is invented without a feature/requirement justification (§6 traceability). Endpoints #84–#89 (§6.16) are **PROPOSED** additions from the Project 09 audit, closing evidence-backed gaps; they require approval before implementation.
>
> **Status vocabulary:** **CONFIRMED** (established requirement) · **PROPOSED** (recommended, not approved) · **REQUIRES APPROVAL** (material decision).
>
> **Version:** Project 09 — API & Integration Engineering (Audited Baseline v1.1). This version is the companion API contract to `INTEGRATION-SPECIFICATION.md`; integration concerns (external systems, reliability, webhooks/events, security) are owned there.

---

## 1. API Conventions

### 1.1 Style
- REST over HTTPS, JSON (`application/json`).
- Base path: `/api/v1`.
- Resource naming: kebab-case plural nouns (`/payout-accounts`).
- Actions expressed as HTTP verbs; sub-resource verbs only when no noun fits (e.g., `/sales/:id/verify-payment`).
- Collection endpoints return `{ data, meta }`; single-resource endpoints return the resource object directly; errors always use the error envelope (§5).

### 1.2 HTTP Semantics & Status Codes

| Method | Meaning | Codes |
|---|---|---|
| `GET` | Read (no side effects) | 200 |
| `POST` | Create / submit / action (state change) | 201 (create), 200 (action) |
| `PATCH` | Partial update of mutable (non-financial) fields | 200 |
| `PUT` | Not used by default (avoided for partial semantics) | — |
| `DELETE` | Prohibited on financial records; allowed only on reversible, approved resources | 204 |

| Code | Use |
|---|---|
| 200 | Success (GET/actions) |
| 201 | Resource created |
| 204 | No content (delete/void) |
| 400 | Malformed request / validation error |
| 401 | Unauthenticated |
| 403 | Authenticated but not authorized (role/eligibility/ownership) |
| 404 | Not found (never leak existence of others' resources) |
| 409 | Conflict (business state, e.g., sale LOCKED, insufficient balance) |
| 422 | Business-rule violation (e.g., member not Active + Qualified) |
| 429 | Rate limited |
| 500 | Server error (generic; no internals leaked) |

**Important:** Business-eligibility failures return 403 (role/eligibility) or 422 (business rule) — never 401.

### 1.3 Validation
- All request bodies validated against Zod schemas in `packages/contracts` (single source).
- Validation happens in the presentation layer before any business logic.
- Rejection of sales, members, and withdrawals requires a **mandatory reason** (BR-REG-004, BR-SAL-005, BR-WDR-004) — enforced at the API level.
- Money/rates are exact decimals (`NUMERIC`); floats are rejected.

---

## 2. Authentication & Authorization

### 2.1 Authentication (Q1/Q3)
- **Supabase Auth JWT** (PKCE, `Authorization: Bearer` or Supabase cookie) verified server-side per Q3 — supersedes `HttpOnly` session (ARCH-DEC-007 archived). `supabase.auth.signInWithPassword` in `supabase.ts:50-65` with `cookieStorage` cross-port `5173↔5174`.
- No new `HttpOnly` DB session for v1; `POST /auth/verify-email` remains the gate before approval (BR-AUTH-001).
- Internal/service-to-service calls use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) — never user JWT for seed.

### 2.2 Authorization
- **RBAC (Vercel middleware + RLS)** enforces BUSINESS-RULES.md §3 for every endpoint.
- **Object-level authorization (NFR-AUTHZ-002):** member-scoped endpoints verify the session user owns the resource (prevents IDOR/BOLA). Staff roles use staff-scoped paths; no staff role can act on a member's behalf through member endpoints.
- **Business eligibility is separate from roles:** e.g., `POST /sales` requires role Member **and** status Active + Qualified (BR-SAL-001). Returns 422 `MEMBER_NOT_QUALIFIED` otherwise.
- Role shorthand used below: `PUBLIC`, `AUTH` (any authenticated principal — member or staff), `MEM` (any authenticated member), `AQ` (Active + Qualified), `ADM` (Admin), `FIN` (Finance), `SUP` (Super Admin), `MRCH` (Merchant), `SYS` (internal service identity).
- `SYS` is an **internal service identity**, not a database account role (the `accounts.role` CHECK holds `MEMBER, ADMIN, FINANCE, SUPER_ADMIN, MERCHANT`). Internal/service-to-service calls use a short-lived token from the secret manager, never user cookies.

---

## 3. Error Format

All errors use one envelope:

```json
{
  "error": {
    "code": "SALE_LOCKED",
    "message": "Sale has reached the maximum resubmission attempts and is locked.",
    "details": { "maxAttempts": 3 },
    "requestId": "a1b2c3",
    "timestamp": "2026-08-18T10:00:00Z"
  }
}
```

### Error codes (initial, non-exhaustive)

| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Input failed Zod schema |
| `UNAUTHORIZED` | No/invalid session |
| `FORBIDDEN` | Role/eligibility/ownership violation |
| `NOT_FOUND` | Resource not found (404) |
| `CONFLICT` | State conflict (409) |
| `RATE_LIMITED` | 429 |
| `MEMBER_NOT_QUALIFIED` | Action requires Active + Qualified (422) |
| `SALE_LOCKED` | Sale locked after max attempts (409) |
| `REJECTION_REASON_REQUIRED` | Mandatory reason missing (422) |
| `INSUFFICIENT_BALANCE` | Withdrawal exceeds Available Balance (409) |
| `RESERVATION_CONFLICT` | Reservation race (409) |
| `VOUCHER_INVALID_SIGNATURE` | Signature verification failed (403) |
| `VOUCHER_INVALID` | Not authentic / wrong status (403) |
| `VOUCHER_EXPIRED` | Expired (403) |
| `VOUCHER_ALREADY_REDEEMED` | Double redemption attempt (409) |
| `VOUCHER_INSUFFICIENT_BALANCE` | Redeem amount > remaining (409) |
| `PAYOUT_ACCOUNT_UNVERIFIED` | Unverified account selected (422) |
| `INTERNAL` | Unhandled server error (500) |

---

## 4. Pagination, Filtering, Sorting

| Area | Convention |
|---|---|
| Admin lists | Page-based: `?page=1&pageSize=50` (default 50, max 100) |
| Ledger / financial streams | Cursor-based: `?cursor=<opaque>&limit=50` — stable order (id asc) |
| Sorting | `?sort=field&order=asc\|desc`; **allowlisted per endpoint** (never arbitrary column names) |
| Filtering | `?status=...`, `?q=...`; allowlisted keys per endpoint |
| Meta | List responses: `{ "data": [...], "meta": { "pagination": {...} } }` |
| Response size | Never return ledger/commission history unbounded |

---

## 5. Versioning, Rate Limiting, Idempotency

### 5.1 Versioning
- URI prefix `/api/v1`. Breaking changes create `/api/v2`; deprecated endpoints are announced per phase. PROPOSED.

### 5.2 Rate Limiting
- Per-IP and per-user limits.
- Strict limits: `POST /auth/login`, `/auth/register`, `/auth/verify-email`, `POST /vouchers/:id/redemptions`.
- Limits are configurable (BR-CFG-001). Exact values TBD (REQUIRES APPROVAL).

### 5.3 Idempotency
- `Idempotency-Key` header (UUID) **required** on: `POST /sales`, `POST /me/withdrawals`, `POST /vouchers/:id/redemptions`, `POST /financial-adjustments`.
- Server stores key → response; retries return the stored response without re-applying side effects (prevents double redemption / double reservation — BI-007, BR-WDR-002).
- Key TTL proposed: 24h (REQUIRES APPROVAL).

### 5.4 OpenAPI / Swagger
- OpenAPI 3.1 authored from `packages/contracts` Zod schemas + handler routes; published at `/api/v1/docs`.
- `packages/contracts` Zod schemas generate TS types consumed by frontends.
- Every endpoint documented with auth, request schema, response schema, and error codes.

---

## 6. Endpoint Inventory

Legend: **M** method · **Auth** role shorthand · **Feature** FEAT ID · **Req** FR/BR refs · **Status** `PLANNED` (not implemented) unless noted.

### 6.1 Auth (FG-PLATFORM / FG-MEMBERS)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 1 | POST | `/auth/register` | PUBLIC | FEAT-007 | FR-REG-001..013 | Creates application in `Pending`; optional referral code; no purchase step |
| 2 | POST | `/auth/verify-email` | PUBLIC | FEAT-009 | FR-AUTH-001 | Email verification token |
| 3 | POST | `/auth/login` | PUBLIC | FEAT-002 | FR-AUTH-004 | Establishes session |
| 4 | POST | `/auth/logout` | AUTH | FEAT-002 | FR-AUTH-004 | Invalidates session |
| 5 | POST | `/auth/refresh` | AUTH | FEAT-002 | FR-AUTH-004 | Rotates session |
| 6 | GET | `/auth/me` | AUTH | FEAT-002 | FR-AUTH-004 | Current principal + status (session restore; staff and merchants included) |

### 6.2 Members & Qualification (FG-MEMBERS)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 7 | GET | `/members` | ADM/SUP | FEAT-007 | FR-AUTH-002 | List/filter by status; page-based |
| 8 | GET | `/members/:id` | ADM/SUP/MEM(own) | FEAT-007 | FR-AUTH-002 | Object-level: member access limited to self |
| 9 | PATCH | `/me` | MEM | FEAT-008 | FR-MEM-001 | Profile update; country not editable (BR-REG-010) |
| 10 | POST | `/members/:id/verify-id` | ADM | FEAT-010 | FR-REG-002 | Marks ID verified |
| 11 | POST | `/members/:id/approve` | ADM | FEAT-007/011 | FR-REG-004, FR-AUTH-003 | → Approved-Active |
| 12 | POST | `/members/:id/reject` | ADM | FEAT-011 | FR-REG-004 | `reason` mandatory |
| 13 | POST | `/me/resubmit` | MEM | FEAT-011 | FR-REG-005 | Rejected → Pending (unlimited currently; OD-024) |
| 14 | GET | `/me/referral-code` | MEM | FEAT-019 | FR-REF-001 | Unique, immutable (BR-REF-004) |
| 15 | GET | `/me/qualification` | MEM | FEAT-012 | FR-REG-008 | Eligibility status summary |

### 6.3 Geolocation (FG-PROGRAMS — P11)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 16 | POST | `/registration/location-verify` | PUBLIC | FEAT-014/015 | FR-GEO-001..003 | Device location + IP fallback; PH-block (BR-GEO-002) |
| 17 | POST | `/me/location-exceptions` | MEM | FEAT-016 | FR-GEO-004 | Applicant requests exception |
| 18 | POST | `/location-exceptions/:id/decision` | ADM | FEAT-016 | FR-GEO-005 | Approve/reject; audited (BR-GEO-004) |
| 19 | GET | `/location-exceptions` | ADM/SUP | FEAT-016 | FR-GEO-006 | Audit view |

### 6.4 Referral & Sponsor (FG-REF)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 20 | POST | `/members/:id/sponsor` | ADM | FEAT-020 | FR-REF-006 | Assign sponsor via approval |
| 21 | POST | `/members/:id/sponsor-change` | ADM | FEAT-022 | FR-REF-007 | Approval + audit; **circumstances gated OD-013** |
| 22 | GET | `/me/direct-referrals` | MEM | FEAT-064 | FR-RPT-001 | Single-level list |

### 6.5 Customers & Catalog (FG-CATALOG)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 23 | POST | `/customers` | AQ | FEAT-024 | FR-CUS-001/002 | Non-member customer record |
| 24 | GET | `/customers` | AQ (own)/ADM | FEAT-024 | FR-CUS-001 | Seller-scoped list |
| 25 | GET | `/customers/:id` | AQ (own)/ADM | FEAT-024 | FR-CUS-001 | Object-level |
| 26 | GET | `/properties` | MEM/ADM | FEAT-025 | FR-PRP-003 | Catalog listing |
| 27 | GET | `/properties/:id` | MEM/ADM | FEAT-025 | FR-PRP-003 | Catalog detail |
| 28 | POST | `/properties` | ADM | FEAT-025 | FR-PRP-001 | Admin creates catalog entry |
| 29 | PATCH | `/properties/:id` | ADM | FEAT-025/026 | FR-PRP-001/004 | Price changes; existing sales keep snapshots (BI-006) |

### 6.6 Sales & Qualifying Sale (FG-SALES)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 30 | POST | `/sales` | AQ | FEAT-027 | FR-SAL-001 | Submit; `Idempotency-Key` required; property from catalog |
| 31 | GET | `/sales` | AQ (own)/ADM/FIN/SUP | FEAT-027 | FR-SAL-001 | Member sees own; staff see all (Finance works the sales queue — SCR-ADM-008) |
| 32 | GET | `/sales/:id` | AQ (own)/ADM/FIN/SUP | FEAT-027 | FR-SAL-001 | Object-level |
| 33 | POST | `/sales/:id/approve` | ADM | FEAT-028 | FR-SAL-002 | Admin approval |
| 34 | POST | `/sales/:id/reject` | ADM | FEAT-028 | FR-SAL-005 | `reason` mandatory |
| 35 | POST | `/sales/:id/verify-payment` | ADM/FIN/SUP | FEAT-029 | FR-SAL-003 | Payment verification (record-only) |
| 36 | POST | `/sales/:id/resubmit` | AQ | FEAT-028/031 | FR-SAL-005/006 | Correct + resubmit; counts toward max (configurable) |
| 37 | POST | `/sales/:id/reopen` | ADM/SUP | FEAT-032 | FR-SAL-007 | Unlock after review; audited |
| 38 | POST | `/sales/:id/cancel` | ADM/SUP | FEAT-037/038 | FR-COM-009/010, BR-CAN | Cancels Pending or reverses Available commission. **Actor REQUIRES APPROVAL** |

### 6.7 Commission (FG-COMMISSION)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 39 | GET | `/me/commissions` | MEM | FEAT-033/034/035 | FR-COM-001..008 | Own commissions incl. status |
| 40 | GET | `/commissions` | ADM/FIN/SUP | FEAT-033..040 | FR-COM-001..012 | Staff list with filters |
| 41 | GET | `/commissions/:id` | MEM (own)/ADM/FIN/SUP | FEAT-033..040 | FR-COM-001..012 | Object-level |
| 42 | GET | `/me/group-incentives` | MEM | FEAT-041 | FR-COM-013 | **Gated OD-006..012; not implemented until approved** |

### 6.8 eWallet & Ledger (FG-EWALLET)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 43 | GET | `/me/wallet` | MEM | FEAT-043 | FR-WAL-003/004 | Available + pending summary; never negative (BI-001) |
| 44 | GET | `/me/ledger` | MEM | FEAT-042 | FR-WAL-001/002 | Append-only ledger; cursor pagination |
| 45 | POST | `/financial-adjustments` | SUP | FEAT-071 | FR-ADJ-001/002 | `Idempotency-Key`; full audit fields |
| 46 | GET | `/financial-adjustments` | SUP | FEAT-071 | FR-ADJ-002 | Audit list |
| 47 | GET | `/members/:id/ledger` | ADM/SUP | FEAT-042 | FR-WAL-001 | Member ledger (staff) |

### 6.9 Payout Accounts (FG-PAYOUT)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 48 | GET | `/me/payout-accounts` | MEM | FEAT-044 | FR-PAY-001 | List incl. primary (FR-PAY-006) |
| 49 | POST | `/me/payout-accounts` | MEM | FEAT-044 | FR-PAY-001 | Create; methods per OD-016 |
| 50 | PATCH | `/me/payout-accounts/:id` | MEM | FEAT-044 | FR-PAY-006 | Set Primary (one) |
| 51 | POST | `/payout-accounts/:id/verify` | ADM | FEAT-045 | FR-PAY-003/004 | Pending → Confirmed |
| 52 | POST | `/payout-accounts/:id/reject` | ADM | FEAT-045 | FR-PAY-004 | Reason mandatory |
| 53 | GET | `/payout-accounts` | ADM/SUP | FEAT-045 | FR-PAY-003/004 | Verification queue |

### 6.10 Withdrawals (FG-WDR)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 54 | POST | `/me/withdrawals` | MEM | FEAT-048 | FR-WDR-001/002 | Reserve; `Idempotency-Key`; ≤ Available; verified account only (FR-PAY-005) |
| 55 | GET | `/me/withdrawals` | MEM | FEAT-048 | FR-WDR-001 | Own list |
| 56 | GET | `/me/withdrawals/:id` | MEM (own) | FEAT-048 | FR-WDR-001 | Object-level; staff use staff-scoped `GET /withdrawals/:id` (#84) per §2.2 |
| 57 | GET | `/withdrawals` | ADM/FIN/SUP | FEAT-048..050 | FR-WDR-001..005 | Staff queue |
| 58 | POST | `/withdrawals/:id/complete` | ADM/FIN/SUP | FEAT-049 | FR-WDR-003 | Confirms external execution; record-only (BR-BND-001) |
| 59 | POST | `/withdrawals/:id/reject` | ADM/FIN/SUP | FEAT-050 | FR-WDR-004 | `reason` mandatory; releases reservation; new request required (BR-WDR-005) |

### 6.11 Vouchers & QR (FG-VOUCHER)

> **Implemented model (ADR-014, 2026-09-15):** the P8 CTO-signing/merchant-redemption
> endpoints below are **PROPOSED / future**. The implemented flow is admin-created voucher
> definitions assigned to members (each a unique voucher with a locally-generated QR) and an
> **admin** scan/verify/redeem storefront (no merchant app, no signing service, no partial
> redemption):
>
> | # | M | Path | Auth | Req | Notes |
> |---|---|---|---|---|---|
> | 60a | POST | `/admin/voucher-templates` | ADM/SUP | FR-VCH-001..003 | "Create Voucher" — definition (title + value); no member |
> | 60b | POST | `/admin/vouchers/assign` | ADM/SUP | FR-VCH-001..003 | Assign to a member with per-assignment `expiresAt`/`validityDays`; unique code; duplicate `(memberId, templateId)` → 409; audit `VOUCHER_ASSIGNED` |
> | 60c | POST | `/admin/vouchers/scan` | ADM/SUP | FR-VCH-001..003 | Verify-only; 404 unknown code, 409 already-redeemed/expired |
> | 60d | POST | `/admin/vouchers/:id/redeem` | ADM/SUP | FR-VCH-001..003 | Conditional UPDATE (ACTIVE only); remaining → `0.00`; `redeemedAt`/`redeemedBy`; audit `VOUCHER_REDEEMED` |

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 60 | POST | `/vouchers` | ADM/SUP | FEAT-052 | FR-SEC-001..003 | Issue via CTO signing service |
| 61 | GET | `/me/vouchers` | MEM | FEAT-053 | FR-VCH-001 | Own vouchers |
| 62 | GET | `/vouchers/:id` | MEM (own)/ADM/SUP | FEAT-053 | FR-VCH-001 | Object-level |
| 63 | POST | `/vouchers/:id/redemptions` | MRCH | FEAT-055/056/057 | FR-VCH-004..006 | **Atomic**; `Idempotency-Key`; full verification; race-safe (BI-007) |
| 64 | GET | `/vouchers/:id/redemptions` | ADM/SUP | FEAT-054 | FR-VCH-003 | Redemption history |
| 65 | POST | `/signing/verify` | SYS | FEAT-059 | FR-SEC-001..004 | Verify-only (public key); never signs; master key never present (BI-008) |

### 6.12 Content & Notifications (FG-CONTENT)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 66 | POST | `/media` | ADM | FEAT-060 | FR-ADM-002 | Photos/videos/ads/landing/promo |
| 67 | GET | `/media/:id` | MEM/ADM | FEAT-060 | FR-ADM-002 | Retrieve permitted media |
| 68 | GET | `/content/forwardable` | MEM | FEAT-061 | FR-ADM-003 | Permitted shareable/downloadable content |
| 69 | GET | `/policies` | PUBLIC | FEAT-062 | FR-ADM-004 | Policies, guidelines, T&C |
| 70 | POST | `/policies` | ADM | FEAT-062 | FR-ADM-004 | Create policy |
| 71 | PATCH | `/policies/:id` | ADM | FEAT-062 | FR-ADM-004 | Update policy |
| 72 | POST | `/broadcasts` | ADM | FEAT-063 | FR-ADM-005 | Promotions/training/invites/announcements |
| 73 | GET | `/me/broadcasts` | MEM | FEAT-063 | FR-ADM-005 | My notifications (incl. push dispatch) |

### 6.12a Admin ↔ Member Messaging (FG-MESSAGING — FEAT-072, ADR-013)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 90 | GET | `/me/messages` | MEM | FEAT-072 | FR-MEM (messaging) | Own thread, cursor-paginated (newest first) |
| 90a | POST | `/me/messages` | MEM | FEAT-072 | FR-MEM (messaging) | Send a message to the admin team |
| 91 | POST | `/me/messages/read` | MEM | FEAT-072 | FR-MEM (messaging) | Mark own thread read (member watermark) |
| 91a | GET | `/me/messages/summary` | MEM | FEAT-072 | FR-MEM (messaging) | Thread badge (unread staff replies) |
| 92 | GET | `/admin/conversations` | ADM | FEAT-072 | FR-ADM (messaging) | Inbox: one row per member with a thread; module `messages` |
| 92a | GET | `/admin/conversations/:memberId` | ADM | FEAT-072 | FR-ADM (messaging) | One member's thread, cursor-paginated |
| 93 | POST | `/admin/conversations/:memberId/messages` | ADM | FEAT-072 | FR-ADM (messaging) | Staff reply (audited `MESSAGE_SENT`) |
| 93a | POST | `/admin/conversations/:memberId/read` | ADM | FEAT-072 | FR-ADM (messaging) | Mark thread read for staff |
| 94 | GET | `/admin/messages/summary` | ADM | FEAT-072 | FR-ADM (messaging) | Inbox badge (unread member messages) |

### 6.13 Reporting & Genealogy (FG-REPORTING)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 74 | GET | `/me/reports/direct-referrals` | MEM | FEAT-064 | FR-RPT-001 | Reporting-module view of the single-level list; same data as #22 (SCR-MEM-016) |
| 75 | GET | `/me/reports/group-network` | MEM | FEAT-065 | FR-RPT-002 | Network view; **no MLM commission implication (BI-004)** |
| 76 | GET | `/me/reports/total-earned` | MEM | FEAT-066 | FR-RPT-003 | **Gated OD-025; excludes pending funds** |
| 77 | GET | `/me/genealogy` | MEM | FEAT-067 | FR-RPT-004 | Tree visualization; no MLM (BI-004) |

### 6.14 Programs (FG-PROGRAMS — P11)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 78 | GET | `/programs` | PUBLIC | FEAT-068 | FR-PRG-001 | Domestic / Abroad; PUBLIC for registration program choice (SCR-AUTH-002) |
| 79 | GET | `/programs/:id/config` | ADM/SUP | FEAT-068 | FR-PRG-002 | Program configuration |
| 80 | PATCH | `/programs/:id/config` | SUP | FEAT-068/069 | FR-PRG-002 | Independent config; **rule differences gated OD-001..005** |

### 6.15 Config (FG-CONFIG)

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 81 | GET | `/config/public` | PUBLIC | FEAT-005 | FR-ADM-001 | Non-sensitive parameters |
| 82 | GET | `/config` | SUP | FEAT-005 | FR-ADM-001 | Full parameter view |
| 83 | PATCH | `/config` | SUP | FEAT-005 | FR-ADM-001 | Update rates/periods/limits (BR-CFG-001) |

### 6.16 Additional Proposed Endpoints (Project 09 audit — evidence-backed gaps)

> Added to close gaps confirmed in the authoritative docs (UI-UX screen register, ARCHITECTURE §4.2, REQUIREMENTS, FEATURES, DATABASE-DESIGN). All are **PROPOSED** — they extend the planned contract and must be approved before implementation. Numbering continues from #83 to preserve the original inventory numbering referenced by UI-UX.md.

| # | M | Path | Auth | Feature | Req | Notes |
|---|---|---|---|---|---|---|
| 84 | GET | `/withdrawals/:id` | ADM/FIN/SUP | FEAT-048..050 | FR-WDR-001..005 | Staff withdrawal detail (SCR-ADM-012); object-level; completes the staff-scoped withdrawal path per §2.2 |
| 85 | POST | `/me/media` | MEM | FEAT-010/060 | FR-REG-002, FR-MEM-001, FR-ADM-002 | Member uploads government ID document (FR-REG-002, FEAT-010) and optional profile photo (FR-MEM-001); `media_assets.media_type` includes `ID_DOCUMENT`/`PROFILE_PHOTO` (E-24); `POST /media` (#66) remains Admin-only |
| 86 | GET | `/programs/:id/qualification-questions` | PUBLIC | FEAT-012 | FR-REG-003 | Registration question set per program (E-04, FK `program_id`); question content per program TBD (OD-002) |
| 87 | GET | `/referral-codes/:code` | PUBLIC | FEAT-007 | FR-REG-010 | Referral-code introspect for optional registration code (ARCHITECTURE §4.2 auth module); returns validity only — no PII |
| 88 | GET | `/audit-log` | SUP | FEAT-004 | NFR-AUD-001, NFR-SEC-002 | Immutable audit trail browse (SCR-ADM-021); page-based; read-only; filter by entity/actor/action (I-21, I-22) |
| 89 | POST | `/me/sales/:id/reopen-request` | MEM | FEAT-032 | FR-SAL-007 | Member requests reopen of a LOCKED sale (SCR-MEM-007); Admin/SUP decision via #37; audited |

---

## 7. Request/Response Examples

### 7.1 Sale submission (AQ)
```http
POST /api/v1/sales
Authorization: Bearer <session>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "customerId": "cus_001",
  "propertyId": "prp_002"
}
```
```json
{
  "id": "sal_001",
  "status": "SUBMITTED",
  "propertyValue": "1000000.00",
  "sellerId": "m_042",
  "createdAt": "2026-08-18T10:00:00Z"
}
```
> Property value is snapshotted from the catalog at submission (BI-006).

### 7.2 Withdrawal request (MEM)
```http
POST /api/v1/me/withdrawals
Idempotency-Key: 6ba7b810-9dad-11d1-80b4-00c04fd430c8

{ "amount": "120000.00", "payoutAccountId": "pa_007" }
```
```json
{
  "id": "wdr_001",
  "status": "RESERVED",
  "amount": "120000.00",
  "reservedAt": "2026-08-18T10:05:00Z"
}
```
> Amount reserved and not reusable (BR-WDR-002). Rejected requests require a new request (BR-WDR-005).

### 7.3 Voucher redemption (MRCH) — atomic
```http
POST /api/v1/vouchers/vch_003/redemptions
Idempotency-Key: 66ba7b81-9dad-11d1-80b4-00c04fd430c9

{ "amount": "500.00", "signature": "<signed payload from QR>" }
```
```json
{
  "id": "rdm_009",
  "voucherId": "vch_003",
  "redeemedAmount": "500.00",
  "remainingValue": "500.00",
  "redeemedAt": "2026-08-18T10:10:00Z"
}
```
> Exactly one success under concurrency (BI-007). Errors: `VOUCHER_INVALID_SIGNATURE`, `VOUCHER_ALREADY_REDEEMED`, `VOUCHER_EXPIRED`.

---

## 8. API Security (Security-by-Design)

| Concern | Control |
|---|---|
| Authentication | HttpOnly/Secure/SameSite cookies; CSRF protection for cookie-authenticated requests; refresh rotation |
| Authorization | RBAC guards (BUSINESS-RULES §3) + object-level ownership checks on every member-scoped resource (NFR-AUTHZ-002) |
| Least privilege | No staff endpoint exposes more than the role needs; DB roles mirror app roles |
| Input validation | Zod schemas on all requests; strict money/rate formats |
| Injection | Parameterized queries only; repositories never concatenate SQL |
| Sensitive data | No PII/financial data in logs or error responses; 500s are generic; profiles/IDs are redacted where not needed |
| IDOR/BOLA | Ownership verification by resource owner id vs. session principal; 404 hides others' resources |
| CORS | Allowlist of first-party origins only |
| Secrets | All secrets via environment/secret manager; never committed; `.env*` ignored |
| Rate limiting | Per-IP/per-user; strict on auth and redemption (§5.2) |
| Auditability | Every mutation on approvals/verifications/exceptions/adjustments writes to `audit` (NFR-SEC-002) |
| Failure behavior | Atomic transactions; idempotency for retries; partial application impossible on financial paths |
| Signing boundary | Application can only **verify** signatures (public key); master key exists only in the CTO-controlled service (BI-008) |

---

## 9. Endpoint Traceability

Every endpoint maps to a confirmed feature/requirement:

| Endpoint group | Feature(s) | Requirement(s) |
|---|---|---|
| §6.1 Auth | FEAT-002, FEAT-007, FEAT-009 | FR-AUTH-001..004, FR-REG-001..013 |
| §6.2 Members | FEAT-007..013, FEAT-019 | FR-REG-001..012, FR-MEM-001, FR-REF-001, FR-AUTH-002/003 |
| §6.3 Geolocation | FEAT-014..016 | FR-GEO-001..006 |
| §6.4 Referral | FEAT-020, FEAT-022, FEAT-064 | FR-REF-006/007, FR-RPT-001 |
| §6.5 Catalog | FEAT-024..026 | FR-CUS-001/002, FR-PRP-001..004 |
| §6.6 Sales | FEAT-027..032, FEAT-037/038 | FR-SAL-001..007, FR-COM-009/010 |
| §6.7 Commission | FEAT-033..041 | FR-COM-001..013 |
| §6.8 eWallet | FEAT-042, FEAT-043, FEAT-071 | FR-WAL-001..004, FR-ADJ-001/002 |
| §6.9 Payout | FEAT-044..046 | FR-PAY-001..006 |
| §6.10 Withdrawals | FEAT-048..050 | FR-WDR-001..005 |
| §6.11 Vouchers | FEAT-052..059 | FR-VCH-001..006, FR-SEC-001..004 |
| §6.12 Content | FEAT-060..063 | FR-ADM-002..005 |
| §6.13 Reporting | FEAT-064..067 | FR-RPT-001..004 |
| §6.14 Programs | FEAT-068/069 | FR-PRG-001..003 |
| §6.15 Config | FEAT-005 | FR-ADM-001 |
| §6.16 Additional (PROPOSED) | FEAT-004, FEAT-007, FEAT-010, FEAT-012, FEAT-032, FEAT-048..050, FEAT-060 | FR-REG-002/003/010, FR-MEM-001, FR-ADM-002, FR-SAL-007, FR-WDR-001..005, NFR-AUD-001, NFR-SEC-002 (no new requirements) |

**No endpoint is invented for unapproved functionality.** Gated endpoints (#21, #42, #76, #80 and any OD-gated detail) must not be implemented until the corresponding Owner decision is approved (OD-001..025). Endpoints #84–#89 (§6.16) are PROPOSED additions that close evidence-backed gaps; they must be approved before implementation.