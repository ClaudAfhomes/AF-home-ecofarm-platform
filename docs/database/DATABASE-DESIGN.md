# JAD Realty Platform — Database Design (SSOT)

> **Document SSOT status:** This document is the **Database SSOT** — the authoritative source for the approved database architecture, entities, tables, columns, relationships, keys, constraints, indexes, lifecycle, and database-level integrity rules.
>
> **Precedence chain:** BUSINESS-RULES → REQUIREMENTS → FEATURES → ROADMAP → ARCHITECTURE → API-SPECIFICATION → TECH-STACK → UI-UX → DESIGN-SYSTEM → FOLDER-STRUCTURE → {FRONTEND-ARCHITECTURE, BACKEND-ARCHITECTURE, **DATABASE-DESIGN**} → DEVELOPMENT-GUIDELINES.
>
> **Approval boundaries (must stop and request approval — never enact silently):** destructive schema changes; dropping tables/collections; dropping columns/fields; irreversible data transformations; major relationship changes; ownership-model changes; security/RLS policy changes; major database technology changes; production data modification; unresolved business rules. Unresolved items are marked `REQUIRES APPROVAL` with the reason and the decision required (§24).
>
> **Status vocabulary:** `CONFIRMED` / `PROPOSED` / `ASSUMPTION` / `REQUIRES APPROVAL` / `REQUIRES VERIFICATION` / `TBD` (no repo precedent for other markers).

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | Database Design (Database SSOT) |
| Repository path | `docs/database/DATABASE-DESIGN.md` |
| Status | DRAFT — awaiting implementation review |
| Version | 1.0 |
| Last updated | 2026-08-18 |
| Owner | Database Architect / Engineering |
| Approvers | Owner, CTO (security boundary items), Super Admin configuration owner |
| Governing SSOTs | BUSINESS-RULES, REQUIREMENTS, FEATURES, ROADMAP, ARCHITECTURE, API-SPECIFICATION, TECH-STACK, FOLDER-STRUCTURE, BACKEND-ARCHITECTURE, FRONTEND-ARCHITECTURE, DEVELOPMENT-GUIDELINES |
| Change control | Changes follow the precedence chain; conflicting SSOTs are flagged, not silently overwritten (BUSINESS-RULES §13 Conflict Handling). Any change affecting financial invariants, security boundaries, or destructive schema operations requires approval (§24, header approval boundaries). Version numbers for PostgreSQL/Drizzle remain `REQUIRES VERIFICATION` until manifests exist |

---

## 2. Purpose

Define the approved target database architecture and data model for the JAD realty platform so that it can be implemented, migrated, seeded, secured, and operated without re-deriving business meaning. This document is **implementation-ready** and must remain consistent with the SSOT hierarchy above.

This document **does not**:

- Invent business rules, rates, eligibility, status models, or workflow rules (these are owned by `BUSINESS-RULES.md`, `REQUIREMENTS.md`, `FEATURES.md`).
- Implement or execute migrations, or modify any actual database (explicitly out of scope for this task).
- Duplicate unrelated business rules already owned by other SSOTs.

---

## 3. Scope

**In scope:**

- Database technology, architecture, environments, schema organization, data ownership boundaries, security architecture.
- Entities, tables, columns, relationships, keys, indexes, constraints, uniqueness rules.
- Normalization approach, audit strategy, soft-deletion policy, data lifecycle, migration strategy, seed strategy.
- Performance considerations, backup/recovery considerations.
- Traceability to requirements, business rules, features, and API contracts.
- Open decisions (`REQUIRES APPROVAL`) and risks/assumptions.

**Out of scope (must not be introduced):**

- Payment gateway / card processing / wallet-payment-API / POS schema or capabilities (BR-BND-003, FR-BND-003).
- Any money-movement/execution schema (BR-BND-001).
- Multi-level referral commission schema or downline-commission tables (BR-REF-002, BR-RPT-002/004, BI-004).
- Automatic refund workflows (BR-CAN-004, BI-010).
- Any rule marked TBD silently converted into a design decision (BUSINESS-RULES §11).
- Group Incentive parameters (OD-006..012) — concept CONFIRMED only; schema type exists but is blocked pending Owner decisions.

---

## 4. Database Architecture

| Item | Choice | Status | Source |
|---|---|---|---|
| Engine | **PostgreSQL via Supabase 15+** | **CONFIRMED** | ARCH-DEC-003, TECH-STACK §5, ARCHITECTURE §14, Q1 |
| Data access | **Supabase JS client + PostgreSQL RLS** for reads/writes (CMS `cms_contents` JSONB + `marketing-tools`); Drizzle + raw SQL **optional for future dedicated backend** | **CONFIRMED** (Supabase) / **PROPOSED** (Drizzle) | Q1, ARCH-DEC-004 (updated), TECH-STACK §6, BACKEND-ARCHITECTURE §5 |
| Money type | `NUMERIC` exact decimal — **never** floating point | **PROPOSED** (mandatory for BR-WAL-002) | TECH-STACK §5, API-SPECIFICATION §1.3, BR-WAL-002 |
| Constraints | CHECK (balance ≥ 0), unique (redemption), FKs | **PROPOSED** | TECH-STACK §5, BI-001, BI-007 |
| Snapshot | Property value stored on the sale record at submission | **CONFIRMED** rule → implementation **PROPOSED** | BI-006, BR-PRP-004, TECH-STACK §5 |
| Ledger design | **Append-only ledger table**; available balance derived/validated from the ledger | **PROPOSED** | TECH-STACK §5, BR-LED-001/002, BI-005 |
| Migrations | Drizzle Kit / versioned SQL migrations in-repo | **PROPOSED** | TECH-STACK §5/§6, BACKEND-ARCHITECTURE §5.2 |
| Transactions | ACID; default `READ COMMITTED`; explicit row locks; `SERIALIZABLE` where race-prevention demands (redemption, balance mutation) | **PROPOSED** | TECH-STACK §5, BACKEND-ARCHITECTURE §12 |
| Deployment | Containerized, **managed PostgreSQL** | **PROPOSED / REQUIRES APPROVAL** (provider/region OPEN) | ARCH-DEC-008 |
| Database name | Single primary database (proposal: `jad`) | **PROPOSED** | ARCHITECTURE §14 |
| Sharding | Not used — correctness over sharding | **CONFIRMED** principle | ARCHITECTURE §14 |

### 4.1 Database architecture (Q1 Vercel + Supabase)

- **Single relational database (PostgreSQL via Supabase), single `public` schema.** Vercel Functions share one Supabase Postgres ACID boundary; financial invariants are enforced at the DB layer (constraints, checks, RLS, transactions) — correctness over sharding (ARCHITECTURE §14, Q1).
- **All financial invariants enforced at DB layer:** BI-001 (available balance ≥ 0), BI-002 (pending not available), BI-005 (no UPDATE/DELETE on financial tables — schema/role-enforced), BI-007 (unique voucher redemption), BI-008 (signing key never stored/accessible to DBAs).
- **Ledger single-writer:** financial modules (`commission`, `ewallet`, `withdrawal`, `payout`, `voucher`) may only mutate the ledger through the ledger's own application services (ARCHITECTURE §6, BACKEND-ARCHITECTURE §2.3). The database enforces invariants; the single-writer rule is enforced at the application layer.
- **No microservice-per-entity fragmentation.** All tables live in one schema; module boundaries are logical (FOLDER-STRUCTURE §2.1), not physical.

### 4.2 Environment strategy

| Environment | Purpose | Data posture |
|---|---|---|
| Local dev | Engineers; isolated Postgres (container) | Seed reference data only; no real PII |
| Test / CI | Automated tests; disposable database | Synthetic data; `REQUIRES APPROVAL` for any real-data copy |
| Staging / UAT | Pre-production validation | Anonymized/synthetic data only |
| Production | Live JAD platform | Real data; strict least-privilege roles; backups per §21 |

> Environment provisioning is implementation detail; **database hosting provider/region is OPEN and `REQUIRES APPROVAL`** (ARCH-DEC-008).

### 4.3 Schema organization

- One database, one `public` schema (proposal). Table names are `snake_case`, plural, no module prefix (module ownership is documented in §7, not encoded in names).
- Shared cross-module enums/statuses live in `packages/contracts` and are mirrored as PostgreSQL CHECK constraints / native enums (see §12).
- Object storage for files (ID documents, media, profile photos) is **external** via infrastructure adapters (BACKEND-ARCHITECTURE §2.1, ARCHITECTURE §4.3); the database stores **metadata and storage references only**, never the binary blobs in the primary DB.

### 4.4 Data ownership boundaries

| Boundary | Owner | Rule |
|---|---|---|
| Accounts, sessions, email verification | `auth` module | Auth tables only touched by `auth` repositories |
| Member profile, qualification, ID documents, geolocation, sponsor requests | `members` / `geolocation` / `referral` modules | Own their tables exclusively |
| Customers, properties | `catalog` module | Admin-controlled catalog (BR-PRP-001..003) |
| Sales, payment boundary records | `sales` module | Owns `sales`; commission/wallet read via contracts |
| Commissions | `commission` module | Immutable records (BI-005) |
| Ledger, balances, adjustments | `ewallet` module | **Single writer for ledger** (ARCHITECTURE §6) |
| Payout accounts, withdrawals | `payout` / `withdrawal` modules | Own their tables |
| Vouchers, redemptions | `voucher` module | Atomic redemption (BI-007) |
| Media, policies, broadcasts, notifications | `content` module | Own their tables |
| Config, programs, gender, countries | `config` / `programs` modules | Reference & configuration data (BR-CFG-001, BR-PRG-002) |
| Audit trail | `audit` module | Append-only; never modified/deleted |

> Rule: **only a module's repositories touch its tables** (FOLDER-STRUCTURE §2.2, BACKEND-ARCHITECTURE §2.3). Cross-module reads go through application contracts.

### 4.5 Security architecture

- **Roles mirror app roles** (NFR-SEC-001, NFR-AUTHZ-001): dedicated database roles for `app` (application), `migration`/`ddl` (schema changes), `reporting` (read-only), `audit` (append-only writer). See §22.
- **Least privilege:** application role holds only DML it needs; **REVOKE UPDATE/DELETE on financial tables** (commissions, ledger, financial adjustments, audit log, redemptions) enforces BI-005 at the schema level.
- **No direct production DB exposure:** database reachable only from the private network / app tier; no public internet exposure.
- **Sensitive data classification** on every column (§8): PII (member profile, ID documents, payout account details) and financial data are protected per NFR-CONF-001 / NFR-DATA-001; never logged in clear.
- **Signing boundary (BI-008, BR-SEC-002):** the master voucher signing key is **never** stored in this database and is **not** accessible to DBAs; only signed payloads and public-key verification material are persisted.
- **RLS (row-level security):** single-tenant platform; object-level authorization is enforced in the application layer (NFR-AUTHZ-002, API-SPECIFICATION §8 IDOR/BOLA). PostgreSQL RLS is **not** proposed by default (see §22 — `REQUIRES APPROVAL` if introduced).

### 4.6 Multi-tenant considerations

**Not a multi-tenant SaaS.** The platform is a single JAD instance; programs (Domestic/Abroad, BR-PRG-001) are **separate business programs within one database**, not tenants. Program separation is modeled via a `program_id` discriminator (proposal) rather than separate schemas/databases. Tenant-isolation patterns are therefore **not applicable**; object-level ownership (member ↔ own records) is enforced per NFR-AUTHZ-002.

### 4.7 Supabase implementation (Phase 1 — F0 → Postgres)

- **Implementation of PostgreSQL SSOT:** `Supabase Postgres 15+` is the **managed implementation** of the `PostgreSQL` engine above (hosted). `DATABASE_URL` from `Supabase` Dashboard → `supabase/migrations/*` (`supabase/migrations/20260829000001_auth_foundation.sql` for auth). Prisma has been removed (no `prisma/schema.prisma`).
- **Env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public, `VITE_`, `loadPublicEnv`) + server-only `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (never `VITE_`, `.env` only). Documented in `apps/web/.env.example` + `apps/admin/.env.example`.
- **Auth:** `Supabase Auth` (`email/password` for `admin@jad.local` / `user@jad.local` — passwords from `SUPABASE_SEED_*` env) replaces `MockSessionProvider` `localStorage jad:mock:session` (cross-origin `5173` vs `5174` bug). `RLS` `members` `auth.uid() = id` `vouchers memberId = auth.uid()` `SUPER_ADMIN` bypass `service_role`. Fresh-start Phase 1 roles: `admin` / `user` via `MemberRole`. Phase 5 staff separation: internal staff live in `StaffUser` + `StaffAssignment` (keyed by auth id, `Role.domain='staff'`); `Member`/`MemberRole` are member-only, and member clients never read `Role`. Actor columns (`AuditLog.actor_id` dropped FK; `Registration.reviewedBy`, `Member.archivedBy`, `SystemConfig`/`cms_contents.updated_by` → `StaffUser` SET NULL). Phase 5 staff separation: internal staff live in `StaffUser` + `StaffAssignment` (keyed by auth id, `Role.domain='staff'`); `Member`/`MemberRole` are member-only, and member clients never read `Role`.
- **Storage:** bucket `marketing-tools` (public read, `SUPER_ADMIN` write) for `ContentItem` `IMAGE/VIDEO/PDF` `downloadUrl` (replaces `unsplash/gtv/w3` samples + `storage.objects` signed URLs, `admin/content` upload).
- **Realtime + pg_cron:** `Realtime` channel `notifications:memberId=eq.*` for `NotificationsPage` `useBroadcasts`; `pg_cron` for `voucher expiresAt`.

---

## 5. Data Modeling Principles

| # | Principle | Status |
|---|---|---|
| 1 | **Normalize first** (3NF baseline); introduce only *justified* denormalization (§14). | CONFIRMED approach |
| 2 | **Surrogate keys** for all tables; natural/business unique keys enforced by unique constraints (§10, §13). | PROPOSED |
| 3 | **Money is `NUMERIC`** everywhere; never floating point; scale consistent (proposal `NUMERIC(18,2)` for amounts, `NUMERIC(5,4)` for rates). | PROPOSED (BR-WAL-002) |
| 4 | **Immutable financial records:** commission, ledger, adjustments, audit, redemption rows are insert-only; corrections are new transactions (BR-LED-002, BI-005). | CONFIRMED |
| 5 | **Snapshot values at transaction time** (property value on sale — BI-006; rate/base on commission — BR-COM-007 "changes apply to future only"). | CONFIRMED |
| 6 | **Status via explicit state columns + immutable audit trail**, not destructive row changes. | PROPOSED |
| 7 | **Derived values are derived, not duplicated** where feasible (available balance from ledger, §14.2). | PROPOSED |
| 8 | **Timestamps are `timestamptz`** (UTC storage, presentation-aware). | PROPOSED |
| 9 | **No real secrets/PII in seeds** (§19). | CONFIRMED |
| 10 | **Backward-compatible schema evolution:** additive migrations preferred; destructive migrations `REQUIRES APPROVAL` (§18). | CONFIRMED |
| 11 | **Traceability:** every table maps to confirmed requirements/rules/features (§23). No table exists for unconfirmed functionality. | CONFIRMED |

---

## 6. Entity Model

The confirmed entities are drawn from the confirmed business model (ROADMAP §5.3, FEAT-001). Status column: `CONFIRMED` = the entity is explicitly confirmed by requirements/rules; `PROPOSED` = the entity/table is the proposed implementation vehicle for a confirmed requirement.

| # | Entity | Purpose | Module (owner) | Lifecycle | Related requirements / features / rules |
|---|---|---|---|---|---|
| E-01 | Account | Authentication identity for all login roles (Member, Admin, Finance, Super Admin, Merchant) | `auth` | Create → Activate → (Disable) | NFR-AUTH-001, FEAT-002, BUSINESS-RULES §3 |
| E-02 | Member | Member profile, program, qualification, referral relationship, status | `members` | Pending → Approved-Active / Rejected → (resubmit) | BR-AUTH-002, BR-REG-001..011, FR-MEM-001, FEAT-007..013 |
| E-03 | ID Document | Government-issued ID submissions; manual Admin verification | `members` | Pending → Verified / Rejected | BR-REG-002, FR-REG-002, FEAT-010 |
| E-04 | Qualification Question | Question bank (content per program **TBD** — OD-002) | `members` | Active / Inactive | BR-REG-003, FR-REG-003, FEAT-012, BR-PRG-002 |
| E-05 | Qualification Answer | Applicant answers at registration | `members` | One set per registration | BR-REG-003, FR-REG-003, FEAT-012 |
| E-06 | Email Verification | One-time email verification (hard gate to approval) | `auth` | Issued → Verified / Expired | BR-AUTH-001, FR-AUTH-001/002, FEAT-009 |
| E-07 | Session | DB-backed session (revocable, survives restarts) | `auth` | Create → Active → Expire/Revoke | NFR-AUTH-001, ARCH-DEC-007, TECH-STACK §7 |
| E-08 | Geolocation Check | GPS/IP determination at registration | `geolocation` | Recorded once per registration attempt | BR-GEO-001/002, FR-GEO-001..003, FEAT-014/015 |
| E-09 | Location Exception | Abroad location exception request/decision (audited) | `geolocation` | Pending → Approved / Rejected | BR-GEO-003/004, FR-GEO-004..006, FEAT-016 |
| E-10 | Referral / Sponsor relationship | Single-level direct sponsor; unique immutable referral code | `referral` | Persistent (BI-009); change only via audited Admin workflow | BR-REF-001..007, FR-REF-001..007, FEAT-019..023 |
| E-11 | Sponsor Change Request | Admin-approved sponsor change (**circumstances TBD — OD-013**) | `referral` | BLOCKED pending OD-013 | BR-REF-007, FR-REF-007, FEAT-022 |
| E-12 | Customer | Non-member customer recorded by a seller | `catalog` | Record → (referenced by sales) | BR-CUS-001/002, FR-CUS-001/002, FEAT-024 |
| E-13 | Property | Admin-managed catalog property | `catalog` | Active / Inactive (Admin only) | BR-PRP-001..003, FR-PRP-001..003, FEAT-025 |
| E-14 | Sale | Customer sale; Admin approval; payment verification; qualifying-sale determination | `sales` | Submitted → Admin Approved → Payment Verified → Qualifying Sale; Rejected → resubmit → LOCKED | BR-SAL-001..007, FR-SAL-001..007, FEAT-027..032 |
| E-15 | Payment Boundary Record | **Record-only** payment/payout information; no money movement | `sales` | Recorded; verified | BR-BND-001..003, FR-BND-001..003, FEAT-070 |
| E-16 | Commission | Direct Commission (8%) / Direct Referral (4%); Group Incentive concept gated | `commission` | Pending → Available / Cancelled / Reversed | BR-COM-001..008, BR-CLC, BR-CAN-001/002, FR-COM-001..013, FEAT-033..040 |
| E-17 | Ledger Entry | Append-only financial ledger record | `ewallet` | Insert-only; immutable | BR-WAL-001, FR-WAL-001/002, FEAT-042, BI-005 |
| E-18 | Member Balance | Available balance + pending amount (validated against ledger) | `ewallet` | Derived/validated per transaction | BR-WAL-002/003, BI-001, BI-002, FEAT-043 |
| E-19 | Financial Adjustment | Super Admin manual credit/debit with reason | `ewallet` | Insert-only; audited | BR-ADJ-001/002, FR-ADJ-001/002, FEAT-071 |
| E-20 | Payout Account | Member payout destination; Admin verification; one primary | `payout` | Pending → Admin Review → Confirmed | BR-PAY-001..006, FR-PAY-001..006, FEAT-044..046 |
| E-21 | Withdrawal | Withdrawal request/reservation/completion/rejection | `withdrawal` | Requested → Reserved → Completed / Rejected (final model **TBD** OD-017/018) | BR-WDR-001..005, FR-WDR-001..005, FEAT-048..050 |
| E-22 | Voucher | QR credit voucher; CTO-signed payload; remaining value | `voucher` | Issued → Redeemed (full/partial); expiry/revoke **TBD** OD-020/021 | BR-VCH-001..006, FR-VCH-001..006, FEAT-052..057 |

> **Implemented (ADR-014, 2026-09-15):** `VoucherTemplate` is the admin-created **definition**
> (title + value); `Voucher` is the issued instrument with a unique `code` (`JAD-VCH-…`),
> `memberId`/`memberName`, `templateId` → `VoucherTemplate`, snapshot
> `originalValue`/`remainingValue` (exact-decimal text), `status` `ACTIVE`/`FULLY_REDEEMED`,
> and a **per-assignment** `expiresAt` (set at assign from `expiresAt`/`validityDays`; the
> template rule is the fallback). Unique index `Voucher_member_template_uidx` on `(memberId,
> templateId)` blocks duplicate issuance. Redemption stamps `redeemedAt` + `redeemedBy` →
> `StaffUser` and sets `remainingValue` = `0.00`. No signing payload / redemption-ledger
> table in this scope (P8 PROPOSED, ADR-007).
| E-23 | Voucher Redemption | Atomic redemption record; history retained | `voucher` | Insert-only; atomic (BI-007) | BR-VCH-002/003/006, FR-VCH-003/006, FEAT-053/054/057 |
| E-24 | Media Asset | Photos/videos/ad images/landing pages/promo materials metadata | `content` | Upload → (referenced) → (deactivate) | BR-MKT-001, FR-ADM-002, FEAT-060 |
| E-25 | Policy Document | Policies, guidelines, T&C, company rules | `content` | Create → Publish → Version | BR-NOT-001, FR-ADM-004, FEAT-062 |
| E-26 | Broadcast | Promotions, invitations, announcements, push | `content` | Draft → Scheduled → Sent | BR-NOT-002, FR-ADM-005, FEAT-063 |
| E-27 | Notification | Per-member notification feed item | `content` | Created → Read | FR-ADM-005, FEAT-063 |
| E-28 | Program | Domestic / Abroad program | `programs` | Active (separation gated OD-001..005) | BR-PRG-001, FR-PRG-001, FEAT-068 |
| E-29 | Config Parameter | Super Admin business parameter (global) | `config` | Create → Update (effective dating) | BR-CFG-001, FR-ADM-001, FEAT-005, NFR-MAINT-001 |
| E-30 | Gender Value | Configurable gender set (defaults Male/Female/LGBT) | `config` | Active / Inactive | BR-REG-011, FR-REG-011 |
| E-31 | Country | Structured country value (ISO 3166) | `config` | Read-only reference | BR-REG-010, FR-REG-012 |
| E-32 | Idempotency Key | Server-side idempotency record (24h TTL **PROPOSED**) | Platform shared | Create → Expire | API-SPECIFICATION §5.3, BACKEND-ARCHITECTURE §16 |
| E-33 | Audit Log Entry | Immutable audit trail (staff actions, exceptions) | `audit` | Insert-only; never modified/deleted | NFR-SEC-002, NFR-AUD-001, FEAT-004 |
| E-34 | Conversation | One admin↔member thread (per member) | `messaging` | Created on first message; per-side read watermarks + unread counters | BR-MSG-001..004, FR-MEM/ADM (messaging), FEAT-072, ADR-013 |
| E-35 | Message | Chat message in a member's thread | `messaging` | Insert-only; display snapshot; trigger-maintained counters | BR-MSG-001..004, FR-MEM/ADM (messaging), FEAT-072, ADR-013 |

> Entities E-01..E-35 above are the complete confirmed/proposed entity set. No entity exists for unapproved functionality (e.g., no Group Incentive parameters, no MLM tables, no payment-gateway tables).

---

## 7. Table / Collection Definitions

Table status: `CONFIRMED` = table directly required; `PROPOSED` = proposed implementation for a confirmed requirement.

### 7.1 `accounts` — Entity E-01 (module: `auth`) — Status: PROPOSED

Purpose: identity + role + credential record for every login actor (Member, Admin, Finance, Super Admin, Merchant).
Record lifecycle: created at registration (member) or provisioning (staff/merchant); status ACTIVE/DISABLED; never hard-deleted (history).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate key | — | PK |
| `email` | `citext` | NO | — | — | PII | Unique; case-insensitive (BR-REG-012 country is member-level; email is login) |
| `email_verified_at` | `timestamptz` | YES | NULL | — | — | Set on verification (BR-AUTH-001) |
| `password_hash` | `text` | NO | — | — | SECRET | Argon2/bcrypt hash; never stored in clear (§22) |
| `role` | `text` | NO | — | — | — | CHECK IN `MEMBER, ADMIN, FINANCE, SUPER_ADMIN, MERCHANT` (BUSINESS-RULES §3) |
| `status` | `text` | NO | `'ACTIVE'` | — | — | CHECK IN `ACTIVE, DISABLED` (proposal) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.2 `members` — Entity E-02 (module: `members`) — Status: CONFIRMED (entity)

Purpose: member profile, program, qualification, referral relationship, membership status.
Record lifecycle: one row per member account across registration attempts; status PENDING → APPROVED_ACTIVE / REJECTED → (resubmit → PENDING); **never hard-deleted** (biographical + financial reference).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`, UNIQUE (1:1) |
| `program_id` | `uuid` | NO | — | — | — | FK → `programs(id)` (BR-PRG-001) |
| `status` | `text` | NO | `'PENDING'` | — | — | CHECK IN `PENDING, APPROVED_ACTIVE, REJECTED` (BR-AUTH-002) |
| `first_name` | `text` | NO | — | — | PII | FR-MEM-001 |
| `last_name` | `text` | NO | — | — | PII | FR-MEM-001 |
| `middle_initial` | `text` | YES | NULL | — | PII | FR-MEM-001 |
| `name_suffix` | `text` | YES | NULL | — | PII | FR-MEM-001 (Extension/Suffix) |
| `date_of_birth` | `date` | NO | — | — | PII | Age validation (BR-REG-001, FEAT-013); exact date stored, age derived |
| `age` | `smallint` | NO | — | derived | PII | Derived from DOB + configurable minimum age (BR-REG-001) — see §14.3 |
| `gender_id` | `uuid` | YES | NULL | — | PII | FK → `gender_values(id)` (BR-REG-011) |
| `address` | `text` | YES | NULL | — | PII | FR-MEM-001 |
| `country_code` | `text` | NO | — | — | PII | Structured value (BR-REG-010, FR-REG-012); FK → `countries(code)`; **not user-editable** |
| `phone` | `text` | NO | — | — | PII | FR-MEM-001 |
| `profile_photo_media_id` | `uuid` | YES | NULL | — | — | FK → `media_assets(id)`; optional (FR-MEM-001) |
| `referral_code` | `text` | NO | — | generated | — | Auto-generated, UNIQUE, immutable (BR-REF-004/005, FEAT-019) |
| `sponsor_id` | `uuid` | YES | NULL | — | — | Self-FK → `members(id)`; single-level (BR-REF-001/002, FEAT-021); initial `Sponsor = None` (BR-REG-008) |
| `is_qualified` | `boolean` | NO | `false` | derived | — | Active + Qualified eligibility (BR-REG-007, BR-QUAL-001, FEAT-023) — §14.3 |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.3 `id_documents` — Entity E-03 (module: `members`) — Status: PROPOSED

Purpose: government ID submission records and manual Admin verification status.
Record lifecycle: uploaded at registration → PENDING → VERIFIED / REJECTED; history retained (re-submission allowed, BR-REG-005).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `media_asset_id` | `uuid` | NO | — | — | — | FK → `media_assets(id)`; object storage reference |
| `document_type` | `text` | YES | NULL | — | — | Free/configured type (proposal) |
| `status` | `text` | NO | `'PENDING'` | — | — | CHECK IN `PENDING, VERIFIED, REJECTED` (proposal; manual Admin verification BR-REG-002, FEAT-010) |
| `verified_by_account_id` | `uuid` | YES | NULL | — | — | FK → `accounts(id)`; Admin (BR-REG-002) |
| `verified_at` | `timestamptz` | YES | NULL | — | — | — |
| `rejection_reason` | `text` | YES | NULL | — | — | Reason recorded (BR-REG-004 spirit — registration rejection audited) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.4 `qualification_questions` — Entity E-04 (module: `members`) — Status: PROPOSED

Purpose: question bank; content per program **TBD (OD-002)**. Managed as reference data.
Record lifecycle: Active / Inactive; versioned snapshots via answers.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `program_id` | `uuid` | NO | — | — | — | FK → `programs(id)`; per-program config (BR-PRG-002) |
| `question_text` | `text` | NO | — | — | — | Content **TBD (OD-002)** |
| `is_active` | `boolean` | NO | `true` | — | — | — |
| `sort_order` | `int` | NO | `0` | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.5 `qualification_answers` — Entity E-05 (module: `members`) — Status: PROPOSED

Purpose: applicant answers captured at registration (FR-REG-003).
Record lifecycle: created with registration; retained (history); not editable after submission.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `question_id` | `uuid` | NO | — | — | — | FK → `qualification_questions(id)` |
| `question_text_snapshot` | `text` | NO | — | — | — | Snapshot so history survives question edits (data-modeling principle 5) |
| `answer` | `text` | NO | — | — | PII | — |
| `answered_at` | `timestamptz` | NO | `now()` | — | — | — |

### 7.6 `email_verifications` — Entity E-06 (module: `auth`) — Status: PROPOSED

Purpose: one-time email verification tokens (BR-AUTH-001, FEAT-009).
Record lifecycle: issued → verified / expired; token hash only (never raw token).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)` |
| `token_hash` | `text` | NO | — | — | SECRET | Hash only (SPE/HMAC); raw token never stored |
| `expires_at` | `timestamptz` | NO | — | — | — | Expiry TTL — proposal; policy **REQUIRES APPROVAL** |
| `used_at` | `timestamptz` | YES | NULL | — | — | Set on success; one-time use |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.7 `sessions` — Entity E-07 (module: `auth`) — Status: PROPOSED

Purpose: DB-backed session store (TECH-STACK §7, ARCH-DEC-007) — revocable, survives restarts.
Record lifecycle: create on login → active → revoked/expired on logout/timeout.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)` |
| `session_token_hash` | `text` | NO | — | — | SECRET | Cookie token hash; never raw |
| `expires_at` | `timestamptz` | NO | — | — | — | Session TTL — **REQUIRES APPROVAL** |
| `revoked_at` | `timestamptz` | YES | NULL | — | — | Logout/revocation |
| `ip_address` | `inet` | YES | NULL | — | — | Audit |
| `user_agent` | `text` | YES | NULL | — | — | Audit |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `last_used_at` | `timestamptz` | YES | NULL | — | — | Rolling activity |

### 7.8 `geolocation_checks` — Entity E-08 (module: `geolocation`) — Status: PROPOSED

Purpose: record of GPS/IP location determination during Abroad registration.
Record lifecycle: insert per registration attempt; retained for audit.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `method` | `text` | NO | — | — | — | CHECK IN `GPS, IP` (BR-GEO-001/002) |
| `latitude` | `numeric(9,6)` | YES | NULL | — | PII | GPS primary (FR-GEO-001) |
| `longitude` | `numeric(9,6)` | YES | NULL | — | PII | — |
| `accuracy_meters` | `numeric(9,2)` | YES | NULL | — | — | Stored; threshold **TBD (OD-014)** |
| `detected_country_code` | `text` | NO | — | — | PII | FK → `countries(code)` (proposal) |
| `is_philippines` | `boolean` | NO | — | derived | — | Philippines → Abroad blocked (BR-GEO-002, FR-GEO-003) |
| `result` | `text` | NO | — | — | — | CHECK IN `ALLOWED, BLOCKED` (proposal) |
| `checked_at` | `timestamptz` | NO | `now()` | — | — | — |

### 7.9 `location_exceptions` — Entity E-09 (module: `geolocation`) — Status: PROPOSED

Purpose: Abroad location exception requests and Admin decisions (BR-GEO-003/004).
Record lifecycle: Pending → Approved / Rejected; audited (BR-GEO-004).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` (applicant) |
| `status` | `text` | NO | `'PENDING'` | — | — | CHECK IN `PENDING, APPROVED, REJECTED` |
| `request_reason` | `text` | NO | — | — | — | Applicant reason |
| `decision_reason` | `text` | YES | NULL | — | — | Admin reason (audited, BR-GEO-004) |
| `decided_by_account_id` | `uuid` | YES | NULL | — | — | FK → `accounts(id)`; Admin |
| `decided_at` | `timestamptz` | YES | NULL | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | — |

### 7.10 `sponsor_change_requests` — Entity E-11 (module: `referral`) — Status: PROPOSED (BLOCKED)

Purpose: Admin-approved sponsor change workflow (BR-REF-007). **BLOCKED pending OD-013** — table must not be implemented until OD-013 is approved.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` (requesting member) |
| `requested_sponsor_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `status` | `text` | NO | `'PENDING'` | — | — | CHECK IN `PENDING, APPROVED, REJECTED` (proposal) |
| `reason` | `text` | YES | NULL | — | — | — |
| `decided_by_account_id` | `uuid` | YES | NULL | — | — | FK → `accounts(id)`; Admin |
| `decided_at` | `timestamptz` | YES | NULL | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | — |

> Sponsor assignment for sponsor-less members (BR-REF-006, FEAT-020) is a direct Admin-set `members.sponsor_id` update **within an audited workflow** (audit_log entry); no separate table is required for the assignment itself.

### 7.11 `customers` — Entity E-12 (module: `catalog`) — Status: CONFIRMED (entity)

Purpose: non-member customer records recorded by sellers (BR-CUS-001/002).
Record lifecycle: created by seller; referenced by sales; not hard-deleted (referential integrity).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `full_name` | `text` | NO | — | — | PII | FR-CUS-002 |
| `phone` | `text` | NO | — | — | PII | FR-CUS-002 |
| `email` | `citext` | YES | NULL | — | PII | FR-CUS-002 |
| `created_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; seller |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

> **Property / Property Value** (BR-CUS-002) are captured at **sale time** via `sales.property_id` + `sales.property_value_snapshot` (BI-006, API-SPECIFICATION §7.1) — the customer row itself does not duplicate catalog/value data. See §25.

### 7.12 `properties` — Entity E-13 (module: `catalog`) — Status: CONFIRMED (entity)

Purpose: Admin-controlled property catalog (BR-PRP-001..003).
Record lifecycle: created by Admin → Active / Inactive; price changes do not alter past sales (BI-006, snapshot on sale).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `name` | `text` | NO | — | — | — | — |
| `description` | `text` | YES | NULL | — | — | — |
| `value` | `numeric(18,2)` | NO | — | — | — | Catalog value (BR-PRP-003); CHECK > 0 |
| `is_active` | `boolean` | NO | `true` | — | — | Admin activation (BR-PRP-001) |
| `created_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Admin |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.13 `sales` — Entity E-14 (module: `sales`) — Status: CONFIRMED (entity)

Purpose: customer sale record with snapshot value; state machine (Submitted → Admin Approved → Payment Verified → Qualifying Sale; Rejected → resubmit → LOCKED).
Record lifecycle: states per BUSINESS-RULES §5; **immutable financial result** — historical value never changes (BI-006); reopen of LOCKED sales audited (BR-SAL-007).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `seller_id` | `uuid` | NO | — | — | — | FK → `members(id)`; only Active + Qualified (BR-SAL-001) |
| `customer_id` | `uuid` | NO | — | — | — | FK → `customers(id)` |
| `property_id` | `uuid` | NO | — | — | — | FK → `properties(id)` (catalog, BR-PRP-003) |
| `property_value_snapshot` | `numeric(18,2)` | NO | — | — | — | Snapshotted at submission (BI-006, API-SPECIFICATION §7.1); CHECK > 0 |
| `status` | `text` | NO | `'SUBMITTED'` | — | — | CHECK IN `SUBMITTED, ADMIN_APPROVED, PAYMENT_VERIFIED, QUALIFYING_SALE, REJECTED, LOCKED` (BR-SAL §5, SCR-ADM-008) |
| `resubmission_count` | `int` | NO | `0` | — | — | Configurable max (BR-SAL-006, FEAT-031); derived from rejection history but cached for lock enforcement |
| `rejection_reason` | `text` | YES | NULL | — | — | Mandatory on rejection (BR-SAL-005) |
| `submitted_at` | `timestamptz` | NO | `now()` | — | — | — |
| `approved_at` | `timestamptz` | YES | NULL | — | — | — |
| `payment_verified_at` | `timestamptz` | YES | NULL | — | — | — |
| `locked_at` | `timestamptz` | YES | NULL | — | — | After max resubmission (BR-SAL-006) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

> State transitions are recorded in `audit_log` (actor, action, reason, result — FEAT-004: sale approval, payment verification, locked-sale reopening). A dedicated `sale_events` table is **not required** — `audit_log` is the single immutable trail (no duplication).

### 7.14 `payment_records` — Entity E-15 (module: `sales`) — Status: PROPOSED

Purpose: **record-only** payment/payout information (FEAT-070, BR-BND-001); no money movement.
Record lifecycle: recorded; verified by Admin/Finance/Super Admin (BR-SAL-003); immutable after verification.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `sale_id` | `uuid` | NO | — | — | — | FK → `sales(id)` |
| `method` | `text` | NO | — | — | — | Record-only method label (bank transfer, GCash, other — BR-BND-002); no gateway |
| `external_reference` | `text` | YES | NULL | — | — | Reference for external execution (FEAT-070) |
| `amount` | `numeric(18,2)` | NO | — | — | — | CHECK > 0 |
| `verified_by_account_id` | `uuid` | YES | NULL | — | — | FK → `accounts(id)`; Admin/Finance/Super Admin (BR-SAL-003) |
| `verified_at` | `timestamptz` | YES | NULL | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.15 `commissions` — Entity E-16 (module: `commission`) — Status: CONFIRMED (entity)

Purpose: Direct Commission (8%) / Direct Referral (4%) records; Group Incentive type reserved but **gated OD-006..012**.
Record lifecycle: created PENDING at qualification (BR-COM-005) → AVAILABLE after clearing (BR-CLC) → CANCELLED (pre-clearing) or REVERSED (post-clearing) (BR-CAN-001/002). **Immutable core values** (BI-005); corrections are new ledger transactions (BR-LED-002).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `beneficiary_member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `sale_id` | `uuid` | NO | — | — | — | FK → `sales(id)` |
| `commission_type` | `text` | NO | — | — | — | CHECK IN `DIRECT_COMMISSION, DIRECT_REFERRAL, GROUP_INCENTIVE` (GROUP_INCENTIVE blocked OD-006..012; FR-COM-013) |
| `base_value` | `numeric(18,2)` | NO | — | — | — | Snapshot of property/sale value at commission time (BI-006, BR-COM-007 "future only") |
| `rate` | `numeric(5,4)` | NO | — | — | — | Snapshot of configurable rate (baseline 8% / 4%; BR-COM-001/002) |
| `amount` | `numeric(18,2)` | NO | — | — | — | base_value × rate; CHECK > 0 |
| `status` | `text` | NO | `'PENDING'` | — | — | CHECK IN `PENDING, AVAILABLE, CANCELLED, REVERSED` (BR §5) |
| `cleared_at` | `timestamptz` | YES | NULL | — | — | Clearing scheduler (FEAT-036) |
| `cancelled_at` | `timestamptz` | YES | NULL | — | — | Pre-clearing cancellation (BR-CAN-001) |
| `reversed_at` | `timestamptz` | YES | NULL | — | — | Post-clearing reversal marker (BR-CAN-002) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

> **Reversal is not a value edit:** `Commission Reversal` is a **new ledger entry** (BR-LED-002) referencing this row; the original commission row is immutable.

### 7.16 `ledger_entries` — Entity E-17 (module: `ewallet`) — Status: PROPOSED (append-only core)

Purpose: complete append-only financial ledger (BR-WAL-001, FR-WAL-002).
Record lifecycle: **insert-only; no UPDATE/DELETE** (BI-005, enforced by role grants §22).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `entry_type` | `text` | NO | — | — | — | CHECK IN `DIRECT_COMMISSION, DIRECT_REFERRAL, GROUP_INCENTIVE, WITHDRAWAL, WITHDRAWAL_RESERVATION, WITHDRAWAL_COMPLETION, WITHDRAWAL_REVERSAL, COMMISSION_REVERSAL, FINANCIAL_ADJUSTMENT` (FR-WAL-002) |
| `direction` | `text` | NO | — | — | — | CHECK IN `CREDIT, DEBIT` (proposal) |
| `amount` | `numeric(18,2)` | NO | — | — | — | CHECK > 0; direction carries sign semantics |
| `source_type` | `text` | NO | — | — | — | Referenced source: `COMMISSION`, `WITHDRAWAL`, `FINANCIAL_ADJUSTMENT`, `VOUCHER` (proposal) |
| `source_id` | `uuid` | NO | — | — | — | FK target depends on source_type (soft link; integrity documented §9) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Cursor pagination key (API-SPECIFICATION §4) |

### 7.17 `member_balances` — Entity E-18 (module: `ewallet`) — Status: PROPOSED (validated cache)

Purpose: derived/validated Available Balance and Pending amount; **single-writer** maintained transactionally with ledger posts.
Record lifecycle: upserted inside the same transaction as ledger posts; CHECK guarantees BI-001/BI-002.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `member_id` | `uuid` | NO | — | — | — | PK (1:1 with members) + FK → `members(id)` |
| `available_balance` | `numeric(18,2)` | NO | `0` | derived/validated | — | CHECK ≥ 0 (BI-001); Pending excluded (BI-002, BR-WAL-003) |
| `pending_amount` | `numeric(18,2)` | NO | `0` | derived/validated | — | Sum of PENDING commissions; CHECK ≥ 0 (BI-002) |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.18 `financial_adjustments` — Entity E-19 (module: `ewallet`) — Status: PROPOSED

Purpose: Super Admin manual credit/debit with mandatory reason (BR-ADJ-001/002).
Record lifecycle: insert-only; audited; ledger entry created alongside.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` (BR-ADJ-002) |
| `direction` | `text` | NO | — | — | — | CHECK IN `CREDIT, DEBIT` |
| `amount` | `numeric(18,2)` | NO | — | — | — | CHECK > 0; debit cannot exceed available (BI-001, NFR-ATOM-002) |
| `reason` | `text` | NO | — | — | — | Mandatory (BR-ADJ-002) |
| `performed_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; **Super Admin only** (BR-ADJ-001) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.19 `payout_accounts` — Entity E-20 (module: `payout`) — Status: CONFIRMED (entity)

Purpose: member payout destinations; Admin verification; one primary (BR-PAY-001..006).
Record lifecycle: Pending → Admin Review → Confirmed (BR-PAY-004); not hard-deleted.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)`; multiple allowed (BR-PAY-001) |
| `method` | `text` | NO | — | — | — | Final methods **TBD (OD-016)**; CHECK against approved set once known |
| `account_name` | `text` | NO | — | — | PII | — |
| `account_identifier` | `text` | NO | — | — | **SENSITIVE** | e.g., account number/wallet id; encrypted/restricted (§22) |
| `status` | `text` | NO | `'PENDING'` | — | — | CHECK IN `PENDING, ADMIN_REVIEW, CONFIRMED` (BR-PAY-004) |
| `is_primary` | `boolean` | NO | `false` | — | — | One primary per member (BR-PAY-006; partial unique index §11) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.20 `withdrawals` — Entity E-21 (module: `withdrawal`) — Status: CONFIRMED (entity)

Purpose: withdrawal requests with reservation/completion/rejection (BR-WDR-001..005).
Record lifecycle: Requested → Reserved → Completed / Rejected → Reservation Released → Balance Restored. **Final status model TBD (OD-017/018)** — do not add states.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `payout_account_id` | `uuid` | NO | — | — | — | FK → `payout_accounts(id)`; verified only (BR-PAY-005) |
| `amount` | `numeric(18,2)` | NO | — | — | — | ≤ Available (BR-WDR-001); CHECK > 0 |
| `status` | `text` | NO | `'REQUESTED'` | — | — | CHECK IN `REQUESTED, RESERVED, COMPLETED, REJECTED` (BR-WDR §5; final model **TBD** OD-017/018) |
| `reserved_at` | `timestamptz` | YES | NULL | — | — | Reservation (BR-WDR-002) |
| `completed_at` | `timestamptz` | YES | NULL | — | — | Permanently deducted (BR-WDR-003) |
| `rejected_at` | `timestamptz` | YES | NULL | — | — | Reservation released, balance restored (BR-WDR-004) |
| `rejection_reason` | `text` | YES | NULL | — | — | Mandatory (BR-WDR-004) |
| `external_reference` | `text` | YES | NULL | — | — | Record-only external execution ref (FEAT-070); no money movement |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

> Rejected withdrawals are **not editable/resubmittable** — a new request is required (BR-WDR-005). Ledger records reservation/completion/reversal entries (FR-WAL-002).

### 7.21 `vouchers` — Entity E-22 (module: `voucher`) — Status: CONFIRMED (entity)

Purpose: QR credit vouchers with signed payload; remaining value (full/partial redemption).
Record lifecycle: issued (CTO-signed payload stored) → redeemed (full → value 0). Expiry/revocation/transfer **TBD (OD-019..023)**.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `owner_member_id` | `uuid` | NO | — | — | — | FK → `members(id)` (ownership rules TBD OD-019) |
| `code` | `text` | NO | — | generated | — | UNIQUE; QR content |
| `value` | `numeric(18,2)` | NO | — | — | — | Original value (BR-VCH-001); CHECK > 0 |
| `remaining_value` | `numeric(18,2)` | NO | — | derived | — | Original − redeemed (BR-VCH-002); CHECK ≥ 0 |
| `status` | `text` | NO | `'ACTIVE'` | — | — | CHECK IN `ACTIVE, REDEEMED` (confirmed); `EXPIRED`, `REVOKED` **gated OD-020/021** |
| `signed_payload` | `text` | NO | — | — | — | Payload signed by CTO service; app verifies only (BI-008, FR-SEC-001..004) |
| `signature` | `text` | NO | — | — | — | Signature produced by signing service (FEAT-059) |
| `issued_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Admin (SCR-ADM-017) |
| `issued_at` | `timestamptz` | NO | `now()` | — | — | — |
| `expires_at` | `timestamptz` | YES | NULL | — | — | Expiry behavior **TBD (OD-021)** |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.22 `voucher_redemptions` — Entity E-23 (module: `voucher`) — Status: PROPOSED (atomic core)

Purpose: atomic redemption records; history retained (BR-VCH-003). Exactly-one-success under concurrency (BI-007).
Record lifecycle: insert-only; immutable history.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `voucher_id` | `uuid` | NO | — | — | — | FK → `vouchers(id)` |
| `merchant_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Merchant role redeems (BR-VCH-004) |
| `redeemed_amount` | `numeric(18,2)` | NO | — | — | — | CHECK > 0 |
| `remaining_value_after` | `numeric(18,2)` | NO | — | derived | — | Voucher remaining after this redemption (API-SPECIFICATION §7.3) |
| `idempotency_key` | `text` | NO | — | — | — | Client Idempotency-Key (API-SPECIFICATION §5.3); uniqueness enforces atomicity |
| `redeemed_at` | `timestamptz` | NO | `now()` | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

> Atomicity (BI-007, FR-VCH-006): unique(`voucher_id`, `idempotency_key`) + row lock on `vouchers` + serializable transaction + remaining-value ≥ redeemed check. See §11, §12, §20.

### 7.23 `media_assets` — Entity E-24 (module: `content`) — Status: PROPOSED

Purpose: metadata/references for photos, videos, ad images, landing pages, promotional materials, ID documents, profile photos (object storage is external).
Record lifecycle: upload → referenced → (deactivate). Binary never in the DB.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `media_type` | `text` | NO | — | — | — | CHECK IN `PHOTO, VIDEO, AD_IMAGE, LANDING_PAGE, PROMO_MATERIAL, PROFILE_PHOTO, ID_DOCUMENT` (proposal; FR-ADM-002, FR-MEM-001, BR-REG-002) |
| `storage_ref` | `text` | NO | — | — | — | Object-storage key/reference (adapter; not the blob) |
| `mime_type` | `text` | YES | NULL | — | — | — |
| `size_bytes` | `bigint` | YES | NULL | — | — | — |
| `uploaded_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)` |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.24 `policies` — Entity E-25 (module: `content`) — Status: PROPOSED

Purpose: policies, program guidelines, Terms & Conditions, company rules (BR-NOT-001).
Record lifecycle: draft → published → versioned (history preserved).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `policy_type` | `text` | NO | — | — | — | CHECK IN `POLICY, GUIDELINE, TERMS, COMPANY_RULE` (proposal; FR-ADM-004) |
| `title` | `text` | NO | — | — | — | — |
| `content` | `text` | NO | — | — | — | — |
| `version` | `int` | NO | `1` | — | — | Versioning |
| `status` | `text` | NO | `'DRAFT'` | — | — | CHECK IN `DRAFT, PUBLISHED, ARCHIVED` (proposal) |
| `published_at` | `timestamptz` | YES | NULL | — | — | — |
| `created_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Admin |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.25 `broadcasts` — Entity E-26 (module: `content`) — Status: PROPOSED

Purpose: promotions, training invitations, Zoom/Google Meet invitations, announcements, push notifications (BR-NOT-002).
Record lifecycle: draft → scheduled → sent; retained.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `broadcast_type` | `text` | NO | — | — | — | CHECK IN `PROMOTION, TRAINING_INVITE, MEETING_INVITE, ANNOUNCEMENT, PUSH` (proposal; BR-NOT-002) |
| `title` | `text` | NO | — | — | — | — |
| `content` | `text` | YES | NULL | — | — | — |
| `target` | `text` | YES | NULL | — | — | Target audience selector (proposal; semantics TBD) |
| `scheduled_at` | `timestamptz` | YES | NULL | — | — | — |
| `sent_at` | `timestamptz` | YES | NULL | — | — | Dispatch via adapter (ASSUMPTION 6) |
| `created_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Admin |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.26 `notifications` — Entity E-27 (module: `content`) — Status: PROPOSED

Purpose: per-member notification feed (member dashboard, SCR-MEM-001).
Record lifecycle: created → read; retained.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `member_id` | `uuid` | NO | — | — | — | FK → `members(id)` |
| `broadcast_id` | `uuid` | YES | NULL | — | — | FK → `broadcasts(id)` (nullable; system notifications may not come from a broadcast) |
| `title` | `text` | NO | — | — | — | — |
| `body` | `text` | YES | NULL | — | — | — |
| `read_at` | `timestamptz` | YES | NULL | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.27 `programs` — Entity E-28 (module: `programs`) — Status: PROPOSED (gated)

Purpose: Domestic and Abroad as separate business programs (BR-PRG-001).
Record lifecycle: active; specifics **gated OD-001..005**.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `code` | `text` | NO | — | — | — | UNIQUE; CHECK IN `DOMESTIC, ABROAD` (proposal) |
| `name` | `text` | NO | — | — | — | — |
| `is_active` | `boolean` | NO | `true` | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.28 `program_config` — Entity E-29 variant (module: `programs`) — Status: PROPOSED (gated)

Purpose: independent per-program configuration (registration rules, qualification questions, geolocation, commission rates, referral rules, incentive rules, eligible properties — BR-PRG-002). **Rule differences gated OD-001..005.**
Record lifecycle: key/value with effective dating; Super Admin managed.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `program_id` | `uuid` | NO | — | — | — | FK → `programs(id)` |
| `param_key` | `text` | NO | — | — | — | e.g., `commission_rate`, `min_age` (proposal) |
| `param_value` | `jsonb` | NO | — | — | — | Typed value |
| `effective_from` | `timestamptz` | NO | `now()` | — | — | Future-only application (BR-COM-007 spirit) |
| `updated_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Super Admin |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.29 `config_parameters` — Entity E-29 (module: `config`) — Status: PROPOSED

Purpose: global Super Admin business parameters — min age, gender values, commission rates, clearing period, sale resubmission limits, voucher redemption mode (BR-CFG-001, FR-ADM-001, NFR-MAINT-001).
Record lifecycle: key/value with effective dating; changes apply to future transactions (BR-COM-007); changes audited.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `param_key` | `text` | NO | — | — | — | UNIQUE; one of FR-ADM-001 set (proposal) |
| `param_value` | `jsonb` | NO | — | — | — | Typed value (e.g., `{"rate":0.08}`, `{"days":7}`) |
| `description` | `text` | YES | NULL | — | — | — |
| `effective_from` | `timestamptz` | NO | `now()` | — | — | Future-only application (BR-COM-007) |
| `updated_by_account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)`; Super Admin (BR-CFG-001) |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.30 `gender_values` — Entity E-30 (module: `config`) — Status: PROPOSED

Purpose: configurable gender set; defaults Male/Female/LGBT (BR-REG-011).
Record lifecycle: Active / Inactive (Super Admin).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `code` | `text` | NO | — | — | — | UNIQUE (e.g., `MALE`, `FEMALE`, `LGBT`) |
| `label` | `text` | NO | — | — | — | Display label |
| `is_active` | `boolean` | NO | `true` | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updated_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.31 `countries` — Entity E-31 (module: `config`) — Status: PROPOSED

Purpose: structured country reference (ISO 3166) for structured, immutable country values (BR-REG-010).
Record lifecycle: read-only reference.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `code` | `text` | NO | — | — | — | PK; ISO 3166-1 alpha-2 |
| `name` | `text` | NO | — | — | — | — |
| `is_active` | `boolean` | NO | `true` | — | — | — |

### 7.32 `idempotency_keys` — Entity E-32 (module: platform shared) — Status: PROPOSED

Purpose: server-side Idempotency-Key storage (API-SPECIFICATION §5.3); required on sales, withdrawals, redemptions, financial adjustments.
Record lifecycle: create → expire (24h TTL **PROPOSED**; cleanup job). No financial truth held.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `account_id` | `uuid` | NO | — | — | — | FK → `accounts(id)` (scope) |
| `key_hash` | `text` | NO | — | — | — | Hash of client Idempotency-Key; raw key not stored |
| `method_path` | `text` | NO | — | — | — | Request route scope (proposal) |
| `request_hash` | `text` | YES | NULL | — | — | Hash of request payload (proposal) |
| `response_status` | `int` | YES | NULL | — | — | Cached response code |
| `response_body_ref` | `jsonb` | YES | NULL | — | — | Cached response or resource id (proposal) |
| `expires_at` | `timestamptz` | NO | — | — | — | TTL 24h **PROPOSED / REQUIRES APPROVAL** |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Audit field |

### 7.33 `audit_log` — Entity E-33 (module: `audit`) — Status: CONFIRMED (entity)

Purpose: immutable audit trail for financial events and exception workflows (approval/rejection, payment verification, geolocation override, sponsor changes, locked-sale reopening, adjustments, withdrawal actions) — NFR-SEC-002, NFR-AUD-001, FEAT-004.
Record lifecycle: **insert-only; never edited or deleted** (FEAT-004 acceptance criteria).

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | surrogate | — | PK |
| `actor_account_id` | `uuid` | YES | NULL | — | — | FK → `accounts(id)`; NULL for system events (e.g., clearing scheduler) |
| `action` | `text` | NO | — | — | — | Enum of audited actions (proposal; e.g., `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, `SALE_APPROVED`, `PAYMENT_VERIFIED`, `SALE_REOPENED`, `LOCATION_EXCEPTION`, `SPONSOR_CHANGE`, `FINANCIAL_ADJUSTMENT`, `WITHDRAWAL_COMPLETED`, `WITHDRAWAL_REJECTED`, `VOUCHER_ISSUED`) |
| `entity_type` | `text` | NO | — | — | — | Target entity (e.g., `member`, `sale`, `withdrawal`, `voucher`, `config`) |
| `entity_id` | `uuid` | YES | NULL | — | — | Target row |
| `reason` | `text` | YES | NULL | — | — | Where applicable (BR-REG-004, BR-SAL-005, BR-WDR-004, BR-GEO-004) |
| `result` | `text` | YES | NULL | — | — | Outcome (proposal) |
| `before` | `jsonb` | YES | NULL | — | — | Prior state (proposal; for status transitions) |
| `after` | `jsonb` | YES | NULL | — | — | Post state (proposal) |
| `ip_address` | `inet` | YES | NULL | — | — | — |
| `created_at` | `timestamptz` | NO | `now()` | — | — | Date/time required by audit rules |

### 7.34 `conversations` — Entity E-34 (module: `messaging`) — Status: CONFIRMED (implemented, ADR-013)

Purpose: one admin↔member thread per member (FEAT-072). Created on first message; per-side read
watermarks and unread counters for badges. No delete path except the sanctioned member purge.
Record lifecycle: created → (messages append) → retained.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `memberId` | `uuid` | NO | — | — | — | PK; FK → `Member(id)` ON DELETE CASCADE |
| `lastMessageAt` | `timestamptz` | YES | NULL | — | — | Set by trigger on each message |
| `memberLastReadAt` | `timestamptz` | YES | NULL | — | — | Member read watermark (`POST /me/messages/read`) |
| `staffLastReadAt` | `timestamptz` | YES | NULL | — | — | Staff read watermark (`POST /admin/conversations/:memberId/read`) |
| `memberUnread` | `integer` | NO | `0` | trigger | — | Unread staff replies; CHECK >= 0 |
| `staffUnread` | `integer` | NO | `0` | trigger | — | Unread member messages; CHECK >= 0 |
| `createdAt` | `timestamptz` | NO | `now()` | — | — | Audit field |
| `updatedAt` | `timestamptz` | NO | `now()` | — | — | Set by trigger |

RLS: `conversation_member_select_own` (own row), `conversation_staff_select` (staff standing via
`is_staff_user()`), `conversation_service_role_all`. All writes service-role-only.

### 7.35 `messages` — Entity E-35 (module: `messaging`) — Status: CONFIRMED (implemented, ADR-013)

Purpose: chat message in a member's thread (FEAT-072). Insert-only; `senderName` is a display
snapshot (no join across the two identity domains); body is plain text (1–4000, never rendered
as HTML). An AFTER INSERT trigger maintains the conversation row atomically.
Record lifecycle: insert → retained; deleted only via member purge.

| Column | Type | Null | Default | Generated/Derived | Sensitive | Notes |
|---|---|---|---|---|---|---|
| `id` | `text` | NO | — | server `msg-…` | — | PK |
| `memberId` | `uuid` | NO | — | — | — | FK → `Member(id)` ON DELETE CASCADE; denormalized for RLS + realtime filter |
| `senderType` | `text` | NO | — | — | — | CHECK IN `MEMBER, STAFF` |
| `senderId` | `uuid` | NO | — | — | — | `Member.id` or `StaffUser.id`; deliberately no FK across identity domains |
| `senderName` | `text` | NO | — | — | — | Display snapshot at send time |
| `body` | `text` | NO | — | — | PII | CHECK `char_length(btrim(body)) >= 1 AND char_length(body) <= 4000` |
| `createdAt` | `timestamptz` | NO | `now()` | — | — | Audit field |

RLS: `message_member_select_own` (own row), `message_staff_select` (staff standing via
`is_staff_user()`), `message_service_role_all`. All writes service-role-only. Realtime:
`Message` added to the `supabase_realtime` publication (member + staff live updates).

---

## 8. Column / Field Definitions

### 8.1 Naming & type conventions

| Convention | Rule | Status |
|---|---|---|
| Table names | `snake_case`, plural (`members`, `ledger_entries`) | PROPOSED |
| Column names | `snake_case`, descriptive, no reserved words | PROPOSED |
| Primary keys | `id` of type `uuid` default `gen_random_uuid()` | PROPOSED |
| Foreign keys | `<singular_table>_id` (e.g., `seller_id`, `member_id`, `payout_account_id`) | PROPOSED |
| Booleans | `is_` prefix (`is_active`, `is_primary`, `is_qualified`, `is_philippines`) | PROPOSED |
| Timestamps | `timestamptz` (UTC); `created_at`, `updated_at` (see §15) | PROPOSED |
| Money | `numeric(18,2)` for amounts; `numeric(5,4)` for rates (0.0800, 0.0400) | PROPOSED |
| Currency | All monetary values are Philippine Peso (JAD platform); `numeric(18,2)` (2 decimals). **REQUIRES VERIFICATION** if multi-currency ever needed | PROPOSED |
| Enums | PostgreSQL-native `enum` **or** `text` + CHECK IN (…); statuses mirrored in `packages/contracts` | PROPOSED |
| JSON | `jsonb` for config/audit `before`/`after` only; no JSON for structured business data | PROPOSED |

### 8.2 Common / audit columns

| Column | Type | Meaning | Present on |
|---|---|---|---|
| `created_at` | `timestamptz` | Row creation (UTC) | All tables |
| `updated_at` | `timestamptz` | Last update | Mutable tables only (not on immutable financial/audit tables) |
| `created_by_account_id` | `uuid` | Acting account | Where a human created the row (catalog, content, adjustments, id_documents) |
| `updated_by_account_id` | `uuid` | Acting account | Config/parameter tables |
| `*_by_account_id` | `uuid` | Verified/approved/rejected actor | `verified_by_account_id`, `decided_by_account_id`, `performed_by_account_id`, `issued_by_account_id` |

> Immutable tables (**no** `updated_at`): `ledger_entries`, `financial_adjustments`, `commissions` (core immutable; lifecycle columns only), `voucher_redemptions`, `audit_log`, `qualification_answers`, `idempotency_keys`.

### 8.3 Sensitive-data classification

| Class | Columns | Protection (§22) |
|---|---|---|
| `PII` | member name/DOB/address/phone/gender, customer name/phone/email, geolocation coordinates, account email, payout account name | Encryption at rest (managed), restricted read roles, redaction in logs, access auditing (NFR-CONF-001, NFR-DATA-001) |
| `SENSITIVE` | `payout_accounts.account_identifier` | Field-level encryption (application-layer) — **REQUIRES APPROVAL**; masked on read |
| `SECRET` | `accounts.password_hash`, `sessions.session_token_hash`, `email_verifications.token_hash`, `idempotency_keys.key_hash` | Hash only (never raw); never in logs; DBAs not granted plaintext access |
| Financial | amounts, rates, balances, commission/ledger values | Integrity: CHECK/immutability/roles (BI-001..007); read restricted to owner + authorized roles (NFR-AUTHZ-002) |

---

## 9. Relationships

### 9.1 Relationship inventory

| # | From | To | Cardinality | Ownership | Cascade | Referential integrity |
|---|---|---|---|---|---|---|
| R-01 | `accounts` | `members` | 1 : 1 | member owns account | **RESTRICT** on delete (never delete) | FK `members.account_id → accounts.id` UNIQUE |
| R-02 | `members` | `members` (self) | 1 : N (sponsor → referrals) | single-level (BR-REF-001/002) | **RESTRICT** | FK `members.sponsor_id → members.id`; **no recursive commission computation** (BI-004) |
| R-03 | `programs` | `members` | 1 : N | program | **RESTRICT** | FK `members.program_id → programs.id` |
| R-04 | `members` | `id_documents` | 1 : N | member | RESTRICT | FK `id_documents.member_id → members.id` |
| R-05 | `media_assets` | `id_documents` | 1 : 1 | member | RESTRICT | FK `id_documents.media_asset_id → media_assets.id` |
| R-06 | `programs` | `qualification_questions` | 1 : N | config/members | RESTRICT | FK `qualification_questions.program_id → programs.id` |
| R-07 | `members` | `qualification_answers` | 1 : N | member | RESTRICT | FK `qualification_answers.member_id → members.id` |
| R-08 | `qualification_questions` | `qualification_answers` | 1 : N | member | RESTRICT | FK `qualification_answers.question_id → qualification_questions.id` |
| R-09 | `accounts` | `email_verifications` | 1 : N | auth | RESTRICT | FK `email_verifications.account_id → accounts.id` |
| R-10 | `accounts` | `sessions` | 1 : N | auth | RESTRICT | FK `sessions.account_id → accounts.id` |
| R-11 | `members` | `geolocation_checks` | 1 : N | geolocation | RESTRICT | FK `geolocation_checks.member_id → members.id` |
| R-12 | `members` | `location_exceptions` | 1 : N | geolocation | RESTRICT | FK `location_exceptions.member_id → members.id` |
| R-13 | `members` | `sponsor_change_requests` | 1 : N | referral (gated OD-013) | RESTRICT | FK `sponsor_change_requests.member_id → members.id` |
| R-14 | `accounts` | `customers` | 1 : N | seller (member) | RESTRICT | FK `customers.created_by_account_id → accounts.id` |
| R-15 | `members` | `sales` (seller) | 1 : N | member | RESTRICT | FK `sales.seller_id → members.id` |
| R-16 | `customers` | `sales` | 1 : N | customer | RESTRICT | FK `sales.customer_id → customers.id` |
| R-17 | `properties` | `sales` | 1 : N | catalog | RESTRICT | FK `sales.property_id → properties.id` |
| R-18 | `sales` | `payment_records` | 1 : N | sales | RESTRICT | FK `payment_records.sale_id → sales.id` |
| R-19 | `members` | `commissions` (beneficiary) | 1 : N | commission | RESTRICT | FK `commissions.beneficiary_member_id → members.id` |
| R-20 | `sales` | `commissions` | 1 : N (≤1 Direct + ≤1 Direct Referral per sale — partial unique §13) | commission | RESTRICT | FK `commissions.sale_id → sales.id` |
| R-21 | `members` | `ledger_entries` | 1 : N | ewallet | RESTRICT | FK `ledger_entries.member_id → members.id` |
| R-22 | `members` | `member_balances` | 1 : 1 | ewallet (single writer) | RESTRICT | FK `member_balances.member_id → members.id` (PK) |
| R-23 | `members` | `financial_adjustments` | 1 : N | ewallet | RESTRICT | FK `financial_adjustments.member_id → members.id` |
| R-24 | `accounts` | `financial_adjustments` (performed_by) | 1 : N | ewallet | RESTRICT | FK `financial_adjustments.performed_by_account_id → accounts.id` |
| R-25 | `members` | `payout_accounts` | 1 : N | payout | RESTRICT | FK `payout_accounts.member_id → members.id` |
| R-26 | `members` | `withdrawals` | 1 : N | withdrawal | RESTRICT | FK `withdrawals.member_id → members.id` |
| R-27 | `payout_accounts` | `withdrawals` | 1 : N | withdrawal | RESTRICT | FK `withdrawals.payout_account_id → payout_accounts.id` |
| R-28 | `members` | `vouchers` (owner) | 1 : N | voucher | RESTRICT | FK `vouchers.owner_member_id → members.id` |
| R-29 | `accounts` | `vouchers` (issued_by) | 1 : N | voucher | RESTRICT | FK `vouchers.issued_by_account_id → accounts.id` |
| R-30 | `vouchers` | `voucher_redemptions` | 1 : N | voucher | RESTRICT | FK `voucher_redemptions.voucher_id → vouchers.id` |
| R-31 | `accounts` | `voucher_redemptions` (merchant) | 1 : N | voucher | RESTRICT | FK `voucher_redemptions.merchant_account_id → accounts.id` |
| R-32 | `accounts` | `media_assets` (uploaded_by) | 1 : N | content | RESTRICT | FK `media_assets.uploaded_by_account_id → accounts.id` |
| R-33 | `accounts` | `policies` (created_by) | 1 : N | content | RESTRICT | FK `policies.created_by_account_id → accounts.id` |
| R-34 | `accounts` | `broadcasts` (created_by) | 1 : N | content | RESTRICT | FK `broadcasts.created_by_account_id → accounts.id` |
| R-35 | `members` | `notifications` | 1 : N | content | RESTRICT | FK `notifications.member_id → members.id` |
| R-36 | `broadcasts` | `notifications` | 0..1 : N | content | RESTRICT | FK `notifications.broadcast_id → broadcasts.id` |
| R-37 | `programs` | `program_config` | 1 : N | programs | RESTRICT | FK `program_config.program_id → programs.id` |
| R-38 | `accounts` | `config_parameters` (updated_by) | 1 : N | config | RESTRICT | FK `config_parameters.updated_by_account_id → accounts.id` |
| R-39 | `accounts` | `idempotency_keys` | 1 : N | platform shared | RESTRICT (cleanup by expiry, not delete) | FK `idempotency_keys.account_id → accounts.id` |
| R-40 | `accounts` | `audit_log` (actor) | 1 : N | audit | RESTRICT | FK `audit_log.actor_account_id → accounts.id` (NULL for system actor) |

### 9.2 Polymorphic reference

`ledger_entries.source_type` + `source_id` is a **soft polymorphic link** (to `commissions`/`withdrawals`/`financial_adjustments`/`vouchers`). Because PostgreSQL cannot enforce a single FK across multiple tables, integrity is enforced by: (1) application single-writer rule (ARCHITECTURE §6), (2) `source_type` CHECK enumeration, (3) audit + reconciliation queries. **REQUIRES APPROVAL** if strict referential integrity is mandated for these references (would require per-type nullable FK columns or a mapping table).

---

## 10. Keys

### 10.1 Primary keys

- All tables use surrogate `uuid` PK `id` (default `gen_random_uuid()`). Exception: `countries` uses natural `code` PK.
- Rationale: stable identities (FEAT-001), no enumeration exposure, no sequential guessing (API-SPECIFICATION §8). **PROPOSED**.

### 10.2 Natural vs surrogate

- Surrogate PKs everywhere; natural business identifiers enforced by unique constraints (§13):
  - `accounts.email` (case-insensitive)
  - `members.referral_code` (immutable, BR-REF-004)
  - `vouchers.code`
  - `programs.code`
  - `config_parameters.param_key`
  - `gender_values.code`
  - `countries.code`

### 10.3 Composite / functional keys

| Key | Columns | Purpose |
|---|---|---|
| `uq_member_balance` | `member_balances.member_id` | 1:1 validated balance |
| `uq_sale_commission_type` | `commissions(sale_id, commission_type)` **partial** (see §13) | ≤1 Direct Commission + ≤1 Direct Referral per sale (BR-COM-003) |
| `uq_redemption_idem` | `voucher_redemptions(voucher_id, idempotency_key)` | Atomicity (BI-007) |
| `uq_idempotency` | `idempotency_keys(account_id, key_hash)` | Replay prevention (API-SPECIFICATION §5.3) |
| `uq_primary_payout` | `payout_accounts(member_id)` WHERE `is_primary` | One primary per member (BR-PAY-006) |

### 10.4 Key-generation strategy

- UUID v4 via `gen_random_uuid()` (PgCrypto built-in) — **PROPOSED**.
- Referral codes: auto-generated unique alphanumeric code (FEAT-019); generated in application, uniqueness enforced by DB constraint (BR-REF-004).
- API-facing string IDs shown in API examples (e.g., `sal_001`, `wdr_001`) are **presentation-level opaque identifiers**; mapping from UUID to these is an API concern (**REQUIRES APPROVAL** if sequential public IDs are required — they are not required by any SSOT).

---

## 11. Indexes

Only indexes justified by a confirmed access/query pattern are listed. Do **not** add indexes without a justified query (principle in §5).

| # | Index | Table (columns) | Type | Purpose / query pattern | Source |
|---|---|---|---|---|---|
| I-01 | `ix_accounts_email` | `accounts(email)` | UNIQUE (citext) | Login lookup by email | FR-AUTH-001, API-SPEC §6.1 |
| I-02 | `ix_members_referral_code` | `members(referral_code)` | UNIQUE | Referral lookup at registration | BR-REF-004, FEAT-019 |
| I-03 | `ix_members_sponsor` | `members(sponsor_id)` | B-tree | Direct Referrals / genealogy (single-level) | BR-RPT-001, FEAT-064/067 |
| I-04 | `ix_members_status` | `members(status)` | B-tree | Admin registration queue filter (SCR-ADM-002) | FEAT-011 |
| I-05 | `ix_members_program` | `members(program_id)` | B-tree | Program-scoped queries | BR-PRG-001 |
| I-06 | `ix_sessions_account` | `sessions(account_id)` | B-tree | Session enumeration/revocation | TECH-STACK §7 |
| I-07 | `ix_sales_seller_status` | `sales(seller_id, status)` | B-tree (composite) | Member sales list; admin queues | SCR-MEM-006, SCR-ADM-008 |
| I-08 | `ix_sales_status_created` | `sales(status, created_at DESC)` | B-tree (composite) | Admin sales review queue ordered by recency | SCR-ADM-008 |
| I-09 | `ix_commissions_beneficiary_status` | `commissions(beneficiary_member_id, status)` | B-tree (composite) | Member commission list/dashboard (SCR-MEM-001, SCR-ADM-018) | FR-COM-006..008 |
| I-10 | `ix_commissions_sale` | `commissions(sale_id)` | B-tree | Commission lookup from sale (reverse/cancellation paths) | FEAT-037/038 |
| I-11 | `ix_ledger_member_created` | `ledger_entries(member_id, created_at DESC)` | B-tree (composite) | Cursor pagination on member ledger (SCR-MEM-009, API-SPEC §4) | FR-WAL-001 |
| I-12 | `ix_ledger_source` | `ledger_entries(source_type, source_id)` | B-tree | Reconciliation/audit of ledger sources | BI-005, NFR-AUD-001 |
| I-13 | `ix_withdrawals_member` | `withdrawals(member_id, created_at DESC)` | B-tree (composite) | Member withdrawal history (SCR-MEM-012) | FR-WDR |
| I-14 | `ix_withdrawals_status` | `withdrawals(status)` | B-tree | Admin withdrawal queue (SCR-ADM-011/012) | FEAT-049/050 |
| I-15 | `ix_payout_accounts_member` | `payout_accounts(member_id)` | B-tree | Member payout account list (SCR-MEM-012) | FR-PAY-001 |
| I-16 | `ix_payout_primary` | `payout_accounts(member_id)` WHERE `is_primary` | UNIQUE partial | One primary per member (BR-PAY-006) | BR-PAY-006 |
| I-17 | `ix_vouchers_owner` | `vouchers(owner_member_id)` | B-tree | Owner voucher list | FR-VCH |
| I-18 | `ix_vouchers_code` | `vouchers(code)` | UNIQUE | QR redemption lookup | FR-VCH-005, FEAT-056 |
| I-19 | `ix_redemptions_voucher` | `voucher_redemptions(voucher_id, redeemed_at DESC)` | B-tree (composite) | Redemption history (BR-VCH-003) + verification (history check) | FR-VCH-003/005 |
| I-20 | `uq_redemption_idem` | `voucher_redemptions(voucher_id, idempotency_key)` | UNIQUE | Atomic single redemption (BI-007) | FR-VCH-006 |
| I-21 | `ix_audit_entity` | `audit_log(entity_type, entity_id, created_at DESC)` | B-tree (composite) | Audit trail browsing by entity (SCR-ADM-021) | NFR-SEC-002 |
| I-22 | `ix_audit_actor` | `audit_log(actor_account_id, created_at DESC)` | B-tree | Staff action history | NFR-AUD-001 |
| I-23 | `ix_idem_expires` | `idempotency_keys(expires_at)` | B-tree | Cleanup job | API-SPEC §5.3 |
| I-24 | `ix_notifications_member` | `notifications(member_id, created_at DESC)` | B-tree | Member notification feed (SCR-MEM-001) | FR-ADM-005 |

> **Performance trade-offs:** each index adds write cost + storage. Indexes I-11 and I-08 are the largest (ledger grows append-only; sales queue). Ledger partitioning is NOT proposed now (NFR-SCAL-001 TBD) — revisit only when volume demands (§20).

---

## 12. Constraints

### 12.1 NOT NULL

- All PKs, all FK columns, and every column documented as `NO` in §7 are `NOT NULL`.
- Reasonable nullable per §7 (e.g., `middle_initial`, optional profile photo, verification timestamps).

### 12.2 CHECK constraints (DB-enforced invariants)

| # | Constraint | Table | Condition | Invariant |
|---|---|---|---|---|
| C-01 | `chk_member_balance_ge_0` | `member_balances` | `available_balance >= 0` | **BI-001** |
| C-02 | `chk_pending_ge_0` | `member_balances` | `pending_amount >= 0` | BI-002 |
| C-03 | `chk_property_value_gt_0` | `properties` | `value > 0` | Catalog integrity |
| C-04 | `chk_sale_snapshot_gt_0` | `sales` | `property_value_snapshot > 0` | BI-006 |
| C-05 | `chk_commission_amount_gt_0` | `commissions` | `amount > 0` | Financial integrity |
| C-06 | `chk_commission_rate` | `commissions` | `rate >= 0 AND rate <= 1` | Rate sanity (8%/4% baselines) |
| C-07 | `chk_ledger_amount_gt_0` | `ledger_entries` | `amount > 0` | Direction carries sign |
| C-08 | `chk_withdrawal_amount_gt_0` | `withdrawals` | `amount > 0` | — |
| C-09 | `chk_adjustment_amount_gt_0` | `financial_adjustments` | `amount > 0` | — |
| C-10 | `chk_voucher_value_gt_0` | `vouchers` | `value > 0` | BR-VCH-001 |
| C-11 | `chk_voucher_remaining_ge_0` | `vouchers` | `remaining_value >= 0` | BR-VCH-002 |
| C-12 | `chk_redemption_amount_gt_0` | `voucher_redemptions` | `redeemed_amount > 0` | — |
| C-13 | `chk_remaining_after_ge_0` | `voucher_redemptions` | `remaining_value_after >= 0` | BR-VCH-002 |

> Withdrawal amount ≤ Available Balance (BR-WDR-001), debit ≤ balance (BI-001), redemption ≤ remaining value are enforced **transactionally** (row locks + serializable, §20) because they depend on derived state (`member_balances` / `vouchers.remaining_value`), not on static CHECK constraints.

### 12.3 Foreign-key constraints

- All FKs listed in §9.1. **Delete behavior = `RESTRICT` on every FK.** No `CASCADE` exists or is permitted: financial/biographical history must never be cascade-deleted (BI-005, §16).

### 12.4 Unique constraints

- See §13.

### 12.5 Domain / state constraints (status enums)

Status columns are `text` + CHECK IN (…) (or native enums), mirrored in `packages/contracts`:

| Column | Allowed values | Source |
|---|---|---|
| `accounts.role` | `MEMBER, ADMIN, FINANCE, SUPER_ADMIN, MERCHANT` | BUSINESS-RULES §3 |
| `accounts.status` | `ACTIVE, DISABLED` (proposal) | — |
| `members.status` | `PENDING, APPROVED_ACTIVE, REJECTED` | BR-AUTH-002 |
| `sales.status` | `SUBMITTED, ADMIN_APPROVED, PAYMENT_VERIFIED, QUALIFYING_SALE, REJECTED, LOCKED` | BUSINESS-RULES §5, SCR-ADM-008 |
| `commissions.status` | `PENDING, AVAILABLE, CANCELLED, REVERSED` | BUSINESS-RULES §5 |
| `payout_accounts.status` | `PENDING, ADMIN_REVIEW, CONFIRMED` | BR-PAY-004 |
| `withdrawals.status` | `REQUESTED, RESERVED, COMPLETED, REJECTED` (final model **TBD** OD-017/018) | BR-WDR §5 |
| `vouchers.status` | `ACTIVE, REDEEMED` (+ `EXPIRED`, `REVOKED` **gated OD-020/021**) | BR-VCH; FEAT-058 BLOCKED |
| `ledger_entries.entry_type` | 9 types per FR-WAL-002 | FR-WAL-002 |
| `commissions.commission_type` | `DIRECT_COMMISSION, DIRECT_REFERRAL, GROUP_INCENTIVE` (latter gated OD-006..012) | FR-COM-013 |
| `geolocation_checks.method` | `GPS, IP` | BR-GEO-001/002 |

> **Do not add statuses not listed** (BUSINESS-RULES §5 warning; BR-WDR-006, BR-VCH-007, OD-017/018/019..023).

### 12.6 Database-enforced invariants summary

| Invariant | Enforcement |
|---|---|
| BI-001 Available Balance ≥ 0 | CHECK C-01 on `member_balances` + transactional single-writer |
| BI-002 Pending never available | CHECK C-02 + ledger semantics (pending excluded from available derivation) |
| BI-003 Direct Referral only to direct sponsor | Application rule + `commissions.beneficiary_member_id` written from `members.sponsor_id` at qualification; single-level (no recursive computation) |
| BI-004 No MLM entitlement | No schema supports multi-level; genealogy is read-only reporting |
| BI-005 Financial records immutable | Role grants REVOKE UPDATE/DELETE on financial tables (§22) + RESTRICT FKs |
| BI-006 Historical value preserved | Snapshot columns (`sales.property_value_snapshot`, `commissions.base_value`) |
| BI-007 Atomic redemption | UNIQUE `(voucher_id, idempotency_key)` + row lock + serializable + CHECK remaining |
| BI-008 Signing key never accessible to DB | Key never stored; only payload + signature in `vouchers` |
| BI-009 Referral persistent/immutable | `members.referral_code` UNIQUE + no update path; `sponsor_id` change only via audited Admin workflow |
| BI-010 No auto-refund | No refund/chargeback tables exist |

---

## 13. Uniqueness Rules

| # | Scope | Columns | NULL behavior | Case sensitivity | Business driver |
|---|---|---|---|---|---|
| U-01 | `accounts.email` | UNIQUE on `citext` | Non-null; no NULL duplicates concern | **Case-insensitive** (citext) | Login identity (FR-AUTH-001) |
| U-02 | `members.account_id` | UNIQUE | Non-null | — | 1:1 account→member |
| U-03 | `members.referral_code` | UNIQUE | Non-null | Case-sensitive generated code; generated to avoid ambiguity | BR-REF-004 (unique, immutable) |
| U-04 | `members(id)` self FK sponsor | not unique (1:N) | `sponsor_id` NULL allowed (no sponsor, BR-REG-008) | — | Single-level referral |
| U-05 | `commissions(sale_id, commission_type)` | UNIQUE **partial** — `WHERE commission_type IN ('DIRECT_COMMISSION','DIRECT_REFERRAL')` | Non-null | — | ≤1 of each per sale (BR-COM-003) |
| U-06 | `voucher_redemptions(voucher_id, idempotency_key)` | UNIQUE | Non-null | Key hashed | Atomicity (BI-007) |
| U-07 | `payout_accounts(member_id)` WHERE `is_primary` | UNIQUE partial | — | — | One primary per member (BR-PAY-006) |
| U-08 | `idempotency_keys(account_id, key_hash)` | UNIQUE | Non-null | Hash | Replay prevention (API-SPEC §5.3) |
| U-09 | `vouchers.code` | UNIQUE | Non-null | Case-sensitive (QR) | Redemption lookup (FR-VCH-005) |
| U-10 | `programs.code` | UNIQUE | Non-null | — | Program separation (BR-PRG-001) |
| U-11 | `config_parameters.param_key` | UNIQUE | Non-null | — | Single source per parameter (BR-CFG-001) |
| U-12 | `gender_values.code` | UNIQUE | Non-null | — | Configurable gender set (BR-REG-011) |
| U-13 | `program_config(program_id, param_key)` | UNIQUE | Non-null | — | Independent per-program config (BR-PRG-002) |

> **Duplicate-prevention notes:** email uniqueness is case-insensitive (citext). Referral codes are generated (collision retried in application, uniqueness enforced at DB). No other business-scoped uniqueness exists in the confirmed rules; none are invented.

---

## 14. Normalization

### 14.1 Approach

- **3NF baseline.** Single logical rows for entities; multi-valued facts normalized into child tables (e.g., qualification answers, payout accounts, redemptions, ledger entries, audit entries).
- FKs (`RESTRICT`) provide referential integrity; no duplicated master data (customer not duplicated per sale; property value not duplicated except the justified snapshot).

### 14.2 Intentional denormalization (each justified)

| # | Denormalization | Justification |
|---|---|---|
| D-01 | `sales.property_value_snapshot` | **BI-006** — historical value must not change when catalog price changes (BR-PRP-004). Snapshot required, not a violation. |
| D-02 | `commissions.base_value` + `rate` snapshot | **BR-COM-007** — rate changes apply to future commissions only; historical commission must reflect value/rate at transaction time. |
| D-03 | `member_balances.available_balance` (validated cache) | Read efficiency for balance display/checks (SCR-MEM-001/012); **validated against the ledger** and updated in the same transaction (single writer). Not the source of truth — ledger is. |
| D-04 | `members.age` | Derived from DOB for efficient eligibility enforcement (BR-REG-001); recomputed on DOB/config change. |
| D-05 | `members.is_qualified` | Cached Active + Qualified eligibility flag (BR-REG-007, BR-QUAL-001) for fast sale/sponsor checks; maintained transactionally at approval/qualification events. |
| D-06 | `sales.resubmission_count` | Cached counter to enforce configurable max (BR-SAL-006); derived from rejection history, maintained in the sale state transition. |
| D-07 | `vouchers.remaining_value` | Needed for redemption verification/display (BR-VCH-002); updated atomically with redemptions. |
| D-08 | `qualification_answers.question_text_snapshot` | Preserves meaning of past answers when question text changes (data-modeling principle 5). |
| D-09 | `ledger_entries.source_type/source_id` | Enables traceability from ledger to origin without separate join tables; integrity by single-writer + audit (see §9.2). |

> Every denormalization is deliberate and traceable; none duplicates mutable master data in a way that can drift silently.

### 14.3 Derived-flag maintenance (no drift)

- `members.age`: recomputed from DOB at registration and when min-age config changes (FEAT-013).
- `members.is_qualified`: recomputed on email verification, ID verification, Admin approval, and qualification completion (BR-REG-007, BR-QUAL-001, FEAT-023).
- `member_balances`: recomputed only through the eWallet single-writer services inside the same transaction as ledger posts (ARCHITECTURE §6).

---

## 15. Audit Strategy

### 15.1 Standard audit fields

- `created_at` on **all** tables (UTC, `now()`).
- `updated_at` on **mutable** tables only (trigger-managed — `PROPOSED`; Drizzle raw SQL `SET updated_at = now()` alternative).
- Actor columns: `created_by_account_id` / `verified_by_account_id` / `decided_by_account_id` / `performed_by_account_id` / `issued_by_account_id` / `updated_by_account_id` where a human action is recorded.

### 15.2 Immutable audit trail (`audit_log`)

- Every audited mutation writes one `audit_log` row **in the same transaction** as the mutation (no partial audit).
- Audited actions (FEAT-004): registration approval/rejection (BR-REG-004), ID verification (BR-REG-002), sale approval/rejection (BR-SAL-005), payment verification (BR-SAL-003), geolocation override (BR-GEO-004), sponsor assignment/change (BR-REF-006/007), locked-sale reopening (BR-SAL-007), financial adjustments (BR-ADJ-002), withdrawal actions (BR-WDR-004), voucher issuance (SCR-ADM-017).
- `audit_log` is **insert-only**; UPDATE/DELETE revoked from all roles (FEAT-004 "cannot be edited or deleted").
- Retention: kept indefinitely per NFR-AUD-001 (no retention policy documented; **REQUIRES APPROVAL** if any archival/purge policy is later required).

### 15.3 History-vs-audit split

- State **history for review screens** (rejection reasons, transition timeline) is served from `audit_log` (single immutable trail) — no duplicated per-entity history tables (§7 notes). Exceptions where a dedicated snapshot is justified: `qualification_answers.question_text_snapshot`, sale/commission financial snapshots (§14).

---

## 16. Soft Deletion

- **No general soft-delete (`deleted_at`) column is introduced.** The confirmed business model uses **explicit statuses**, not soft deletion (BUSINESS-RULES §5): members use `status` (PENDING/APPROVED_ACTIVE/REJECTED), properties use `is_active`, policies use DRAFT/PUBLISHED/ARCHIVED, payout accounts use lifecycle statuses.
- **Hard-delete rules:**
  - **Financial/audit tables are never deleted, hard or soft** (`ledger_entries`, `commissions`, `financial_adjustments`, `voucher_redemptions`, `audit_log`) — BI-005, NFR-AUD-001.
  - **Referenced/biographical tables are never hard-deleted** (`accounts`, `members`, `customers`, `properties`, `sales`, `withdrawals`, `payout_accounts`, `vouchers`) — history and referential integrity (RESTRICT FKs) require retention. Deactivation uses status flags.
  - **Operational content** (`media_assets`, `policies`, `broadcasts`) may be deactivated via status; hard delete **REQUIRES APPROVAL** and is discouraged.
  - **Owner-approved exception (2026-09-09):** `DELETE /admin/members/:id` (super_admin only) permanently purges one member and their entire owned graph via the `member_purge_cascade` SECURITY DEFINER function (single transaction, mandatory reason, `MEMBER_PURGED` audit, auth-user removal). This is the sole member hard-delete path; archive remains the default lifecycle.
- **Query implications:** read queries filter by status/`is_active`; no `WHERE deleted_at IS NULL` pattern needed.
- **Restoration:** status-based (e.g., reactivate property, re-open locked sale via audited Admin review, BR-SAL-007). No soft-delete restoration flow exists.
- `sponsor_change_requests` and `email_verifications` expire/close via status, not deletion.

---

## 17. Data Lifecycle

| Stage | Rules |
|---|---|
| **Creation** | All rows created via module repositories only (FOLDER-STRUCTURE §2.2). Audit-worthy creations write `audit_log` in the same transaction (§15). |
| **Read / access** | Object-level authorization: member reads only own records (NFR-AUTHZ-002); staff reads scoped by role (BUSINESS-RULES §3); staff dashboards query queues by status (§11 indexes). |
| **Updates** | Mutable tables updated in place (`updated_at` bumped). Financial/audit tables **never updated** (BI-005). Status transitions are updates of the state column + audit entry in one transaction. |
| **State transitions** | See BUSINESS-RULES §5 (member, sale, commission, payout, withdrawal). Only confirmed states; TBD states not added (BR-WDR-006, OD-017/018). |
| **Archiving** | None defined in requirements; **REQUIRES APPROVAL** if ledger/content archival is ever required (none proposed now). |
| **Soft deletion** | Not used (§16). |
| **Hard deletion** | Prohibited for financial/audit/biographical/transactional tables; operational content deletion REQUIRES APPROVAL (§16). |
| **Retention** | Audit and financial records retained indefinitely (NFR-AUD-001). General retention policy for PII **REQUIRES APPROVAL** (NFR-DATA-001 compliance — no retention period documented). |
| **Historical records** | Snapshot columns preserve transaction-time facts (BI-006); append-only ledger preserves financial history (BI-005). |
| **Cascading behavior** | None — all FKs RESTRICT. No cascade delete exists (BI-005). |

---

## 18. Migration Strategy

| Item | Choice | Status |
|---|---|---|
| Tooling | Drizzle Kit / versioned SQL migrations in-repo (`apps/api/src/database/migrations/`) | **PROPOSED** (TECH-STACK §5/§6, BACKEND-ARCHITECTURE §5.2) |
| Versioning | Sequential numbered migration files (`0001_...sql`, `0002_...sql`) applied in order | PROPOSED |
| Ordering | Strict forward order; migration runs under the `migration`/`ddl` role (§22), never the app role | PROPOSED |
| Backward compatibility | Additive-only by default: new tables, nullable new columns, new CHECK/unique — never break running code before deployment completes | PROPOSED |
| Data migrations | SQL `UPDATE`/`INSERT` migrations separate from DDL where possible; idempotent (safe to re-run) | PROPOSED |
| Rollback | Forward + rollback scripts per migration where feasible; Drizzle up/down pattern | PROPOSED |
| Production safety | Migrations run in deploy pipeline with pre/post validation; destructive operations gated | PROPOSED |
| Destructive policy | **Dropping tables/columns, irreversible transforms, major relationship changes REQUIRE APPROVAL** (§24; BACKEND-ARCHITECTURE §5.2) | CONFIRMED boundary |

> Migrations never target financial tables destructively: append-only tables may only gain columns (additive); dropping or altering financial columns is `REQUIRES APPROVAL`.

---

## 19. Seed Strategy

| Seed | Environment | Content | Rules |
|---|---|---|---|
| Reference data | All | `countries` (ISO 3166), `programs` (Domestic/Abroad), `gender_values` (Male/Female/LGBT defaults), default `config_parameters` (min age 18, rates 8%/4%, clearing 7 days, resubmission limit, redemption mode), `qualification_questions` bank (content per program **TBD** OD-002) | Idempotent (upsert by natural key); no code changes required for config (NFR-MAINT-001) |
| Dev seed | Local dev / test | Synthetic members, customers, properties, sales, commissions, ledger, withdrawals, vouchers for UI/API dev | No real PII; clearly fake data; **never real secrets** |
| Test seed | Test/CI | Purpose-built fixtures per acceptance criteria (AC-REG-001, AC-COM-001, AC-WAL-001, AC-WDR-001, AC-VCH-001, AC-ADJ-001, AC-SAL-001) | Created by tests, not shipped; database disposable |
| Production seed | Production | Reference/config data **only** | No synthetic business rows; no real PII; **REQUIRES APPROVAL** for any production data seeding beyond reference data |
| Sensitive handling | — | Password hashes for dev accounts only (random, non-real); payout account identifiers are placeholders; ID documents are placeholder media | §22 protection applies to seeds too |

> **Never include real secrets, real PII, or production data in seeds.** Production admin/staff accounts are provisioned operationally (secret manager), not seeded.

---

## 20. Performance Considerations

| Concern | Design | Status |
|---|---|---|
| Query patterns | Confirmed patterns only (registration, login, admin queues, member ledger/wallet, redemption) drive indexes (§11) | PROPOSED |
| Indexing strategy | Indexes justified per pattern; composite indexes for queue+ordering; UNIQUE for identity/lookup | PROPOSED |
| Large-table considerations | `ledger_entries` is append-only and grows forever; supported by (member_id, created_at DESC) for cursor pagination (I-11). **No partitioning now** — revisit when NFR-SCAL-001 targets are set (**REQUIRES APPROVAL** to add) | PROPOSED |
| Pagination | **Cursor pagination** (API-SPECIFICATION §4) — no OFFSET on large tables; cursors use `(created_at, id)` | PROPOSED |
| Filtering / sorting | Allowlisted sort keys only (API-SPEC §4); supported by indexes above | PROPOSED |
| Joins | Repositories may join **within their own module's tables**; cross-module reads use contracts (FOLDER-STRUCTURE §2.2). No cross-module repository joins | CONFIRMED |
| Aggregations | Balance derivation = ledger aggregation; cached in `member_balances` within the same transaction | PROPOSED |
| N+1 risks | Repositories use batch queries (e.g., member lists, commission lists) with explicit joins/`IN`; ORM (Drizzle) typed queries for reads | PROPOSED |
| Connection considerations | Managed PostgreSQL + connection pool (application tier); pool sizing at deployment (**REQUIRES APPROVAL** — NFR-PERF-001 TBD) | PROPOSED |
| Expected growth | Unknown — NFR-SCAL-001 is TBD; no premature optimization, sharding, or partitioning | CONFIRMED |
| Caching considerations | **Database caching (Redis/read replicas) is NOT required** (BACKEND-ARCHITECTURE §14); financial truth is never cached outside the transactional boundary. Any cache REQUIRES APPROVAL | CONFIRMED |
| Write-hot paths | Commission creation, redemption, withdrawals → controlled by transaction isolation + row locks, not by scaling shards (ARCHITECTURE §14) | CONFIRMED |

> **Avoid premature optimization** (principle in §5): no read replicas, no partitioning, no materialized views until performance targets (NFR-PERF-001, NFR-SCAL-001) are approved.

---

## 21. Backup & Recovery

| Item | Choice | Status |
|---|---|---|
| Backup strategy | Managed PostgreSQL backups (continuous WAL archiving + periodic full backups) — provider-dependent | **PROPOSED / REQUIRES APPROVAL** (ARCH-DEC-008 provider OPEN) |
| RPO | **TBD — REQUIRES APPROVAL** (ARCH-DEC-009; not defined anywhere) | REQUIRES APPROVAL |
| RTO | **TBD — REQUIRES APPROVAL** | REQUIRES APPROVAL |
| Point-in-time recovery (PITR) | Enabled on managed PostgreSQL (WAL) | PROPOSED |
| Restore strategy | Restore to staging first for validation; verified restore drills before/periodically | PROPOSED |
| Disaster recovery | Multi-AZ/region strategy **REQUIRES APPROVAL** (provider/region OPEN, ARCH-DEC-008) | REQUIRES APPROVAL |
| Data-loss risks | Financial/audit tables are irreplaceable — backup policy must prioritize them; RESTRICT FKs mean no cascade recovery needed | CONFIRMED |
| Environment considerations | Dev/test databases are disposable; production backups per approved policy; **no real data copied into dev/test without approval** | CONFIRMED |

> No RPO/RTO values are invented; they remain `REQUIRES APPROVAL` until ARCH-DEC-009 / NFR-AVAIL-001 / NFR-REL-001 targets are approved.

---

## 22. Security Considerations

Security-by-design is mandatory; critical decisions are not invented (API-SPECIFICATION §8, BACKEND-ARCHITECTURE §17, NFR-SEC-001/002).

| Concern | Control | Status |
|---|---|---|
| Authentication boundary | App authenticates via session cookies (HttpOnly/Secure/SameSite — ARCH-DEC-007); credentials verified against `accounts`; password hashes only | CONFIRMED |
| Authorization model | RBAC per BUSINESS-RULES §3 (roles on `accounts.role`); object-level ownership checks on every member-scoped read (NFR-AUTHZ-002); DB roles mirror app roles | CONFIRMED |
| Row-level security (RLS) | **Not proposed** — single-tenant; object-level authorization in the application layer. If RLS is later required, it is **REQUIRES APPROVAL** (security-policy change) | PROPOSED (not used) |
| Least privilege | Dedicated DB roles: `app` (DML scoped to module tables), `migration`/`ddl` (schema changes), `reporting` (read-only), `audit` (append-only writer). No role holds blanket DDL/DML | CONFIRMED approach |
| App vs privileged/service roles | `app` role never runs DDL; destructive DDL only by `migration` role in deploy pipeline (§18); DBAs do not have plaintext access to SECRET columns (§8.3) | PROPOSED |
| BI-005 enforcement | **REVOKE UPDATE, DELETE** on `ledger_entries`, `commissions`, `financial_adjustments`, `voucher_redemptions`, `audit_log` (and write-only grants) | CONFIRMED (BI-005) → mechanism PROPOSED |
| Sensitive data protection | PII encrypted at rest (managed provider); `account_identifier` field-level encryption **REQUIRES APPROVAL**; passwords/tokens hashed; redaction in logs (API-SPEC §8) | PROPOSED |
| Tenant isolation | Not applicable (single-tenant; programs are not tenants — §4.6) | — |
| Database exposure | Private network only; no public DB access; TLS in transit | CONFIRMED approach |
| Injection protection | Parameterized queries only; repositories never concatenate SQL (API-SPEC §8, BACKEND-ARCHITECTURE §5) | CONFIRMED |
| Audit requirements | `audit_log` insert-only, same-transaction writes, actor/target/date/reason/result (FEAT-004) | CONFIRMED |
| Signing boundary | Master signing key **never** in DB or accessible to DBAs (BR-SEC-002, BI-008); DB stores only signed payload + signature | CONFIRMED |
| Secrets | Secrets via environment/secret manager; never in seeds (§19); `.env*` ignored | CONFIRMED |

---

## 23. Traceability

| Database area | Requirements | Business rules | Features |
|---|---|---|---|
| Accounts, sessions, email verification | FR-AUTH-001..004, FR-REG-010, NFR-AUTH-001/002 | BR-AUTH-001..003, BR-REG-009/010 | FEAT-002, FEAT-007, FEAT-009 |
| Members, ID documents, qualification | FR-MEM-001, FR-REG-001..012, FR-AUTH-002/003 | BR-REG-001..011, BR-QUAL-001/002, BR-AUTH-002/003 | FEAT-007..013 |
| Geolocation checks, exceptions | FR-GEO-001..008 | BR-GEO-001..006 | FEAT-014..018 |
| Referral, sponsor change | FR-REF-001..007, FR-RPT-001 | BR-REF-001..007, BI-009 | FEAT-019..023 |
| Customers, properties | FR-CUS-001/002, FR-PRP-001..004 | BR-CUS-001/002, BR-PRP-001..004, BI-006 | FEAT-024..026 |
| Sales, payment boundary | FR-SAL-001..007, FR-BND-001..003 | BR-SAL-001..007, BR-BND-001..003 | FEAT-027..032, FEAT-070 |
| Commissions | FR-COM-001..013 | BR-COM-001..008, BR-CLC-001/002, BR-CAN-001..004, BI-003 | FEAT-033..040 |
| Ledger, balances, adjustments | FR-WAL-001..004, FR-ADJ-001/002, NFR-ATOM-002, NFR-INT-001 | BR-WAL-001..003, BR-LED-001/002, BR-ADJ-001/002, BI-001/002/005 | FEAT-042, FEAT-043, FEAT-071 |
| Payout accounts | FR-PAY-001..006 | BR-PAY-001..006 | FEAT-044..046 |
| Withdrawals | FR-WDR-001..006 | BR-WDR-001..006, BI-001 | FEAT-048..050 |
| Vouchers, redemptions | FR-VCH-001..007, FR-SEC-001..004, NFR-ATOM-001, NFR-CRYPTO-001 | BR-VCH-001..007, BR-SEC-001..004, BI-007/008 | FEAT-052..057, FEAT-059 |
| Media, policies, broadcasts, notifications | FR-ADM-002..005, FR-MEM-001 | BR-MKT-001/002, BR-NOT-001/002 | FEAT-060..063 |
| Programs | FR-PRG-001..003 | BR-PRG-001..003 | FEAT-068/069 |
| Config, gender, countries | FR-ADM-001, NFR-MAINT-001 | BR-CFG-001, BR-REG-011, BR-REG-010 | FEAT-005 |
| Idempotency | — | — | API-SPECIFICATION §5.3 |
| Audit | NFR-SEC-002, NFR-AUD-001 | BR-GEO-004, BR-ADJ-002, BR-SAL-007, BR-REF-007 | FEAT-004 |

---

## 24. Open Decisions / `REQUIRES APPROVAL`

| # | Decision | Why it matters | Currently | Decision required |
|---|---|---|---|---|
| DA-01 | Database hosting provider/region, managed PostgreSQL | Environments, backups, DR | OPEN (ARCH-DEC-008) | Approve provider/region |
| DA-02 | RPO / RTO / availability & reliability targets | Backup/DR design | TBD (ARCH-DEC-009, NFR-AVAIL-001, NFR-REL-001) | Approve targets |
| DA-03 | Performance/scalability targets | Indexing, partitioning, pooling | TBD (NFR-PERF-001, NFR-SCAL-001) | Approve targets |
| DA-04 | DB-backed session store + session/verification-token TTLs | Sessions table schema | PROPOSED (TECH-STACK §7) | Approve store + TTLs |
| DA-05 | Idempotency-Key TTL (24h) and cleanup | Idempotency table | PROPOSED (API-SPEC §5.3) | Approve TTL/cleanup |
| DA-06 | Transaction isolation strategy per operation (`READ COMMITTED` + row locks + `SERIALIZABLE`) | Ledger/redemption correctness | PROPOSED (TECH-STACK §5, BACKEND §12) | Approve per-operation strategy |
| DA-07 | Native enums vs `text`+CHECK | Constraint style | PROPOSED | Approve style |
| DA-08 | Field-level encryption for `payout_accounts.account_identifier` | Sensitive-data protection | PROPOSED | Approve mechanism |
| DA-09 | RLS introduction (not currently proposed) | Security-policy change | Not used | Approve only if required later |
| DA-10 | `ledger_entries` polymorphic source link vs strict FK mapping | Referential integrity | PROPOSED (soft link) | Approve approach |
| DA-11 | Currency assumption (single PHP) | Money columns | ASSUMPTION | Verify multi-currency never needed |
| DA-12 | Destructive migrations / irreversible data transformations | Migration safety | Gated | Approve each instance |
| DA-13 | General retention/archival policy for PII & content | Compliance (NFR-DATA-001) | Not defined | Approve policy |
| DA-14 | Voucher expiry/revocation/transfer/merchant-permission fields | Voucher schema | Gated OD-019..023 | Approve after Owner decisions |
| DA-15 | Withdrawal final status model | Withdrawal schema | Gated OD-017/018 | Approve after Owner decisions |
| DA-16 | Program rule differences (config keys) | Program config schema | Gated OD-001..005 | Approve after Owner decisions |
| DA-17 | Group Incentive ledger type & schema | Commission/ledger schema | Gated OD-006..012 | Approve after Owner decisions |
| DA-18 | Sponsor-change workflow table | Sponsor schema | Gated OD-013 | Approve after Owner decision |
| DA-19 | Registration attempt limits | Member status handling | FUTURE/TBD (OD-024) | Approve later |
| DA-20 | "Total Earned" definition | Reporting queries | REQUIRES IMPLEMENTATION DEFINITION (OD-025) | Approve definition |
| DA-21 | API-facing sequential IDs (e.g., `sal_001`) vs UUID exposure | Key strategy | PROPOSED (UUID) | Approve mapping |
| DA-22 | Money scale `NUMERIC(18,2)` / rate `NUMERIC(5,4)` | Financial columns | PROPOSED | Approve precision |

> Decisions DA-01..DA-22 are documented but **not enacted** without approval (approval boundaries in header + §18/§22).

---

## 25. Risks and Assumptions

| # | Risk / Assumption | Impact | Mitigation |
|---|---|---|---|
| A-01 | **ASSUMPTION:** single currency (PHP) — no multi-currency requirement documented | Money schema fixed at `numeric(18,2)` | Verify with Owner (DA-11); additive if changed |
| A-02 | **RISK:** no RPO/RTO/performance/scalability targets defined (ARCH-DEC-009, NFR-* ) | Backup/DR + indexing may be over/under-provisioned | Do not invent targets; gate via DA-02/DA-03 |
| A-03 | **RISK:** polyglot `ledger_entries.source_type/source_id` lacks FK enforcement | Referential drift possible | Single-writer rule + audit + reconciliation (DA-10) |
| A-04 | **ASSUMPTION:** customer "Property / Property Value" (BR-CUS-002) is captured at sale time via snapshot (API-SPEC §7.1) | Customer table has no property/value columns | Documented reconciliation; flag for Owner if customer-scoped property is intended |
| A-05 | **RISK:** `member_balances` cache could drift from ledger | Balance errors | Same-transaction updates + reconciliation jobs; ledger remains source of truth |
| A-06 | **ASSUMPTION:** status enums (PENDING/APPROVED_ACTIVE/etc.) are exhaustive per BUSINESS-RULES §5 | Additional states would be schema changes | Gated: no new states without approval (BR-WDR-006, OD-017/018, OD-019..023) |
| A-07 | **RISK:** financial-table immutability depends on role grants that must be verified in the chosen hosting | Weakest point for BI-005 | Explicit migration-time grant checks; tested in CI |
| A-08 | **ASSUMPTION:** object storage (media/ID docs) is external; DB holds metadata only | Primary DB stays lean; no blob handling | Adapters per BACKEND-ARCHITECTURE §2.1 |
| A-09 | **RISK:** version numbers for PostgreSQL/Drizzle are `REQUIRES VERIFICATION` (no manifests exist) | Schema DDL syntax may differ | Confirm versions at implementation (TECH-STACK §9) |
| A-10 | **ASSUMPTION:** single primary database; no read replicas/partitions now | Scale handled later | Revisit when NFR-SCAL-001 approved (DA-03) |

---

## 26. Acceptance Criteria

This document is accepted as the **Database SSOT** when:

1. **AC-01** — `docs/database/DATABASE-DESIGN.md` exists and contains all sections 1–26.
2. **AC-02** — Database technology is the approved PostgreSQL (ARCH-DEC-003) with Drizzle + raw-SQL ledger writes (ARCH-DEC-004); no invented tech.
3. **AC-03** — Every entity/table maps to confirmed requirements/business rules/features (§23); no tables for unapproved functionality (no MLM, no payment gateway, no auto-refund).
4. **AC-04** — All financial invariants (BI-001..BI-010) are enforced at the database layer or explicitly flagged (§12.6); money is `NUMERIC` (BR-WAL-002).
5. **AC-05** — Keys, indexes, constraints, and uniqueness rules are documented and justified by confirmed query patterns (§10–§13); no unjustified indexes.
6. **AC-06** — Lifecycle, soft-deletion (none), audit strategy, and hard-delete rules are documented and consistent with BUSINESS-RULES §5 and FEAT-004 (§15–§17).
7. **AC-07** — Migration, seed, performance, backup/recovery, and security considerations are documented; destructive/irreversible decisions are `REQUIRES APPROVAL` (§18–§22).
8. **AC-08** — No business rule, rate, status, or behavior is silently invented; all `TBD`/`REQUIRES APPROVAL` items are explicitly flagged (§24–§25).
9. **AC-09** — The document is internally consistent and consistent with all existing SSOTs; contradictions are documented, not silently resolved (§25).
10. **AC-10** — The document is ready to serve as the authoritative Database SSOT for implementation (Drizzle schema, migrations, seeds).

---

*End of Database Design SSOT — sections 1–26 complete.*