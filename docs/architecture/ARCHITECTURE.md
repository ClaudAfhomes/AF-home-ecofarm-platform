# JAD - Technical Architecture SSOT (ARCHITECTURE.md)

> **Authority:** This document is part of the **Technical Architecture SSOT** for the JA&D (JAD) system. It defines the target system architecture derived from the approved planning documents.
>
> **Precedence:** BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → this document → TECH-STACK.md → FOLDER-STRUCTURE.md → API-SPECIFICATION.md.
>
> **Status vocabulary:** **CONFIRMED** = established by approved project documentation/session decisions. **PROPOSED** = recommended decision not yet formally approved. **ASSUMPTION** = necessary working assumption. **REQUIRES APPROVAL** = decision that materially affects architecture, security, cost, production, or long-term maintainability.
>
> **Version:** Project 03 - Architecture & System Design (Baseline v1.0)
>
> **Current verified state:** The repository contains **React SPAs (`apps/web`, `apps/admin`), shared packages (`packages/contracts`, `config`, `shared`, `ui`, `mock`), and a Supabase Postgres foundation (`supabase/migrations`). No dedicated backend exists yet; the target backend is **Vercel Functions / REST API + Supabase (Q1 2026-08-30)**. All implementation elements below are the **proposed target** for phases P1..P12 of ROADMAP.md.

---

## 1. System Overview

JAD is a direct-selling and network-growth platform with a financial ledger at its core. Active + Qualified members earn a **Direct Commission (8%, configurable)** on qualifying customer sales and a **Direct Referral commission (4%, configurable)** to the direct sponsor, under a **strict Single-Level Referral** structure. Earnings flow through a commission lifecycle (Pending → clearing → Available) into an **eWallet** from which members request withdrawals to verified payout accounts. The platform additionally provides **digital vouchers with atomic QR redemption** (secured by a CTO-controlled signing boundary), Admin-managed content/notifications, reporting views, and separate **Domestic/Abroad programs**.

Critical business properties that shape the architecture:

| Business property | Source | Architectural consequence |
|---|---|---|
| Immutable financial records | BR-LED-001, BI-005 | Append-only ledger; no UPDATE/DELETE on financial records; corrections via reversals |
| Available Balance never negative | BR-WAL-002, BI-001 | Database-enforced invariants + atomic balance operations |
| Pending commissions excluded from Available | BR-COM-006, BI-002 | Two-state money model (Pending vs Available) computed from immutable ledger |
| Single-level referral only | BR-REF-001/002, BI-003/004 | No MLM logic; genealogy is reporting-only |
| Payment execution is external | BR-BND-001..003 | Record-only payment boundary; no money movement inside JAD |
| Master signing key CTO-controlled | BR-SEC-001..004, BI-008 | Separate CTO-authorized signing service outside app infrastructure |
| Atomic voucher redemption | BR-VCH-006, BI-007 | Transactional + constraint-enforced single redemption |
| Property value frozen at transaction time | BR-PRP-004, BI-006 | Value snapshot on the sale record |
| Configurable business parameters | BR-CFG-001 | Dynamic config service; no code changes for rates/limits |
| Audit of sensitive actions | BR-GEO-004, BR-ADJ-002, BR-SAL-007, BR-REF-007 | Audit subsystem capturing all staff decisions/exceptions |

---

## 2. Architecture Style / Pattern

### 2.1 Recommendation: Modular Serverless via Vercel Functions (modular within functions)

**CONFIRMED direction: TypeScript full-stack** (approved session decision). **CONFIRMED: Modular via Vercel Functions (ARCH-DEC-001 as updated Q1)** - the backend is a set of serverless `Vercel Functions / REST API` handlers (`api/**/*.ts`) sharing Supabase Postgres, plus shared services. Business logic remains server-side and modular (FG-aligned), but there is **no NestJS modular monolith process**. One Supabase `public` schema still provides the single ACID boundary; functions are stateless and share `packages/contracts` validation.

**Why this fits the requirements:**
- **Single ACID boundary still via Supabase Postgres.** Financial correctness (BI-001, BI-002, BI-005, BI-007) is enforced in Postgres (RLS, constraints, transactions) even though compute is serverless.
- **No requirement supports microservices or a NestJS monolith for v1.** ROADMAP §2 prefers the simplest architecture; Q1 chooses `Vercel Functions + Supabase` over NestJS to minimize ops for v1 while keeping the design modular enough for a dedicated backend later.
- **Module boundaries still protect the domain.** Commission, eWallet, Voucher etc. remain logical modules (now `api/<domain>/` handlers + `lib/` services) communicating through shared services and `packages/contracts` - not each other's internals.
- **Configurable business rules** (BR-CFG-001) live in `cms_contents` / `config` via Supabase, so Super Admin changes never require redeployment.

**Explicitly excluded for v1:** NestJS/Express monolith, microservices, event-sourced ledger (ledger is append-only, not event-sourced), in-app payment processing (BR-BND-003).

> **CONFIRMED (ARCH-DEC-001 as updated Q1):** modular serverless via Vercel Functions (vs. any alternative decomposition). Supersedes the prior “Modular Monolith (NestJS)” description.

### 2.2 Layering (applied per Vercel Function)

Within each function/handler, three logical layers (no Nest `app.module.ts`):

```
Handler (validation + authZ + mapping)
   → Service (use cases / orchestration, transactions)
   → Domain (business rules, invariants, calculations) → Persistence (Supabase client, RLS)
```

- Handler validates input (Zod from `packages/contracts`) and maps HTTP semantics only - **no business logic**.
- Service owns use cases, transaction boundaries, and cross-domain orchestration.
- Domain owns business rules and calculations.
- Persistence owns Supabase access; only service-called helpers touch the DB.

---

## 3. System Boundaries

| Boundary | In scope | Out of scope |
|---|---|---|
| Members & qualification | Registration, verification, approval, qualification | Purchase requirement (SUPERSEDED) |
| Referral | Single-level structure, sponsor governance | Multi-level commissions |
| Property catalog | Admin-managed catalog, historical value snapshots | Seller-created properties |
| Sales | Submission, approval, payment verification, locking | Money movement |
| Commission | Pending → clearing → available, reversal, immutable ledger | Group Incentive parameters (OD-006..012) |
| eWallet | Ledger, available balance, adjustments | External fund custody |
| Payouts/withdrawals | Records, reservations, requests | Executing transfers (external platforms) |
| Vouchers | Issuance (via signing service), online redemption, history | Payment/refund infrastructure |
| Marketing | Media, policies, broadcasts | - |
| Programs | Domestic/Abroad separation | Exact rule differences (OD-001..005) |
| Payments | Recording of payment/payout info | Payment gateways, card processors, wallet APIs, POS (BR-BND-003) |
| Signing | Verification of vouchers; request to CTO signing service | Master key custody (CTO-controlled external) |

**Trust boundaries:**
1. **Public Internet → Frontend apps.** Authentication gates all member/admin/merchant access.
2. **Frontend → API.** HTTPS-only; authorization enforced server-side on every request (never trusted from client).
3. **API → Database.** API never executes untrusted SQL; repository layer only; least-privilege DB roles.
4. **API → CTO Signing Service.** Unidirectional request → signed response; the master key never crosses into application infrastructure (BR-SEC-002, BI-008).
5. **API → External payout platforms.** Outbound records only; no inbound money hooks.
6. **Member data isolation.** Object-level authorization prevents cross-member access (NFR-AUTHZ-002).

---

## 4. Major Components

### 4.1 Applications

| Component | Purpose | Roles | Phase |
|---|---|---|---|
| **API** (Vercel Functions / REST API) | All business logic, authN/authZ, ledger, workflow orchestration (server-side) | - | P1..P12 |
| **Member Web App** | Registration, qualification, profile, referral/genealogy, sales, wallet, withdrawals, vouchers | Member, Active + Qualified Member | P2..P10 |
| **Admin / Back-Office App** | Verification, approvals, catalog, exceptions, config, content, reporting | Admin, Finance, Super Admin | P2..P11 |
| **Merchant Redemption Portal** | Online voucher redemption | Merchant | P8 |
| **CTO Signing Service** (external) | Signs vouchers only; holds master key | CTO | P8 |

> Mobile: Abroad geolocation (FR-GEO-001) requires GPS/device location. **CONFIRMED (ARCH-DEC-005):** the Member app is delivered as a responsive web app with browser geolocation; native mobile app revisited under ARCH-DEC-006 (REQUIRES APPROVAL). IP geolocation remains the server-side fallback (BR-GEO-001).

### 4.2 Backend Modules (mirroring feature groups FG-*)

| Module | Feature group | Core responsibilities |
|---|---|---|
| `auth` | FG-PLATFORM | Email verify, login, session, referral-code introspect |
| `members` | FG-MEMBERS | Registration, profiles, qualification, admin approval/rejection |
| `geolocation` | FG-PROGRAMS | Device/IP location, PH-block, location exceptions |
| `referral` | FG-REF | Referral codes, sponsor assignment, single-level relationship |
| `catalog` | FG-CATALOG | Property catalog, customer records, historical value snapshots |
| `sales` | FG-SALES | Submission, approval, payment verification, qualifying sale, locking |
| `commission` | FG-COMMISSION | Direct 8% / Referral 4% calculation, Pending creation, clearing, cancel/reverse |
| `ewallet` | FG-EWALLET | Ledger posting, available balance, financial adjustments |
| `payout` | FG-PAYOUT | Payout accounts, verification, primary designation |
| `withdrawal` | FG-WDR | Requests, reservations, completion, rejection/release |
| `voucher` | FG-VOUCHER | Issuance requests, redemption verification, atomic redemption, history |
| `signing` | FG-SECURITY | Client to CTO signing service; verification only |
| `content` | FG-CONTENT | Media, policies, broadcasts |
| `reporting` | FG-REPORTING | Direct referrals, group network, total earned, genealogy |
| `programs` | FG-PROGRAMS | Domestic/Abroad program separation & independent config |
| `config` | FG-CONFIG | Dynamic business parameter store (rates, limits, periods) |
| `audit` | FG-PLATFORM | Immutable audit records for staff actions/exceptions |

### 4.3 Shared / Platform services

- **Identity & RBAC service** (in `auth`): roles per BUSINESS-RULES.md §3; object-level authorization helpers (NFR-AUTHZ-002).
- **Config service** (`config`): all parameters in FR-ADM-001 / BR-CFG-001.
- **Audit service** (`audit`): append-only records; read by staff dashboards.
- **Worker/Job runner**: commission clearing scheduler (FEAT-036); email/push dispatch; voucher expiry checks (when defined, OD-021).
- **File/media store**: for ID uploads, profile photos, marketing media (content module).

---

## 5. Application Layers (Detailed)

| Layer | Responsibilities | Rules |
|---|---|---|
| **API layer** (Vercel Functions handlers) | Routing, HTTP semantics, DTO validation (Zod), response mapping | No business logic; thin |
| **Application layer** (use-case services) | Orchestration, transaction boundaries, event emission | Coordinates modules; opens/commits transactions |
| **Domain layer** | Entities, value objects, business rules, calculations, invariants | Never depends on framework/DB; pure functions where possible |
| **Persistence layer** (repositories) | Schema access, migrations, row-locking, snapshot queries | Only repositories touch the database |
| **Infrastructure layer** (adapters) | Email, geolocation provider, push, signing client, storage | Replaces via interfaces for tests |

---

## 6. Module Boundaries & Rules

- Modules communicate only through **application-layer use cases / shared contracts** (`packages/contracts`). Direct cross-module repository access is prohibited.
- **Financial modules** (`commission`, `ewallet`, `withdrawal`, `payout`, `voucher`) may only mutate the ledger through the ledger's own application services - single writer for balance invariants.
- **Immutability**: financial records (commissions, ledger entries) are append-only; corrections are new transactions (BR-LED-002).
- **Snapshot rule**: sales store the property value at transaction time (BR-PRP-004, BI-006).
- **Program rule**: Domestic/Abroad operate as separate programs with independent configuration (BR-PRG-001/002); gated specifics pending OD-001..005.
- **No MLM**: `referral` and `reporting` must never compute multi-level commission (BI-004).

---

## 7. Data Flow

### 7.1 End-to-end money flow (MVP core - ROADMAP P1..P7)

```text
Register → qualify (Active + Qualified)
   → submit sale (catalog property, customer)
   → Admin approve → payment verified (Admin/Finance/Super Admin)
   → QUALIFYING SALE
   → commission created PENDING (8% seller; 4% direct sponsor)
   → clearing (configurable, default 7d) → AVAILABLE
   → eWallet Available Balance (append-only ledger)
   → withdrawal request → reserve → complete (external execution) / reject (release + reason)
```

### 7.2 Voucher flow (P8)

```text
Issue request → CTO Signing Service signs → voucher persisted (signed payload)
Merchant scans QR → API verifies signature/authenticity/status/expiry/conditions/balance/history
→ atomic redemption (DB transaction + unique constraint) → remaining value updated → history recorded
```

### 7.3 Registration with geolocation (P11)

```text
Abroad registration → device location (primary) → IP fallback
→ Philippines detected? → BLOCK
→ exception request → Admin review (approve/reject) → audit
```

---

## 8. Integration Boundaries

| Integration | Direction | Protocol | Notes |
|---|---|---|---|
| Email service | Outbound | HTTP/SMTP | Verification + notifications (ASSUMPTION 2; provider OPEN) |
| Geolocation provider (GPS/IP) | Outbound | HTTP | Server-side IP fallback; client geolocation (ASSUMPTION 3) |
| Push notification infrastructure | Outbound | HTTP | Broadcasts (ASSUMPTION 6) |
| CTO Signing Service | Outbound request / signed response | HTTP + crypto | Signs only; app never holds master key (BI-008) |
| External payout platforms | Outbound record/reference | HTTP (record-only) | Bank transfer / GCash / approved; JAD records only (BR-BND-002) |

**Rule:** Every integration is behind a port/adapter interface so provider changes do not ripple through domain code.

---

## 9. Authentication / Authorization Architecture

- **Authentication (CONFIRMED FR-AUTH-004; mechanism Q1/Q3):** Supabase Auth (JWT, PKCE, verified server-side per Q3). Vercel handlers verify `Authorization` / Supabase session and resolve `MemberRole→Role` (`normalizeRole`) - `admin` → `/admin`, `user` → `/member`. Email verification is a hard gate before approval (BR-AUTH-001). No DB HttpOnly session for v1 (ARCH-DEC-007 superseded).
- **Authorization (PROPOSED):**
  - **Role-based access control** via Vercel middleware + RLS enforcing BUSINESS-RULES.md §3.
  - **Object-level authorization (NFR-AUTHZ-002):** every resource access verifies the principal owns the resource (or holds a staff role). Prevents IDOR/BOLA; RLS `auth.uid()=id` as defense-in-depth.
  - **Business eligibility separate from roles** (e.g., "Member" role ≠ eligibility to submit sales; requires Active + Qualified status - BR-SAL-001).
- **Audit (CONFIRMED NFR-SEC-002, NFR-AUD-001):** all staff decisions and financial events write to the immutable `audit` store.

---

## 10. Scalability Strategy

- **Stateless API tier:** horizontal scaling of the API behind a load balancer; session store centralized (DB-backed) or token-based where acceptable.
- **Single source of truth database (PostgreSQL):** all financial invariants enforced at the database layer (constraints, checks, transactions) - correctness over sharding.
- **Write paths are hot:** commission creation, redemption, withdrawals → controlled by transaction isolation + row locks, not by scaling shards.
- **Read scaling:** reporting/genealogy reads can be served from the same DB with tuned indexes; read replicas only if data grows (deferred, not speculative).
- **Jobs:** clearing scheduler runs as a worker process; horizontally scalable with lease-based single-writer semantics.
- **Targets:** NFR-PERF-001 / NFR-SCAL-001 / NFR-AVAIL-001 / NFR-REL-001 have **no approved numbers** - targets are TBD (REQUIRES APPROVAL).

---

## 11. Maintainability Strategy

- **Modular monolith:** clear module boundaries (FG-aligned) keep change impact local; config-driven business parameters (BR-CFG-001) avoid redeployment for rate/limit changes.
- **Contracts package:** shared, versioned DTOs between frontend and backend keep API drift minimal.
- **Testability:** domain logic framework-free and unit-testable; acceptance criteria (AC-*) map to tests; invariant tests (BI-001..BI-010) run continuously.
- **Docs as SSOT:** architecture/stack/folder/API docs are the authoritative technical baseline; updated per phase exit criteria (ROADMAP §9).

---

## 12. Reliability / Resilience

- **Financial integrity:** ACID transactions; invariants BI-001..BI-007 enforced at DB level (CHECK constraints, NOT NULL, unique constraints) plus application-level tests.
- **Atomic voucher redemption (BI-007):** single DB transaction with unique redemption constraint to make double redemption impossible under concurrency (NFR-ATOM-001).
- **Idempotency:** withdrawal requests and voucher redemptions accept `Idempotency-Key` to survive retries (see API-SPECIFICATION.md).
- **Failure behavior:** rejected/retried operations never partially apply to the ledger; job failures are retried with lease and recorded.
- **Availability:** production targets TBD (NFR-AVAIL-001). A single-region, DB-backed deployment is the baseline; multi-AZ is deployment-stage decision (REQUIRES APPROVAL).
- **Recovery:** append-only ledger + audit records support reconstruction; backups are deployment-stage (REQUIRES APPROVAL).

---

## 13. Deployment Architecture (PROPOSED - Q1 Vercel + Supabase)

```text
[CDN/Edge] → [Member Web App] [Admin App] on Vercel
                     ↘            ↘
                    [Vercel Functions / REST API (/api/v1)]
                             ↘
                [Supabase Postgres 15+ (+ RLS) + Auth + Storage (marketing-tools) + Realtime]
                             ↘
                [Object/File Storage] [External integrations]
                                          [CTO Signing Service (separate control plane)]
```

- **Frontend + Functions on Vercel; managed Postgres/Auth/Storage on Supabase** (Q1). No `apps/api` Docker monolith for v1. Env/config via Vercel env + Supabase Dashboard; `VITE_SUPABASE_URL`/`ANON_KEY` (`VITE_`) + server `DATABASE_URL`/`SERVICE_ROLE_KEY` never `VITE_`. **Deployment provider/region is Vercel + Supabase** - still REQUIRES APPROVAL for region.
- The **CTO Signing Service** is deployed in a separate control plane with no network path from application servers to the master key (BI-008).
- Modular for future dedicated backend: Vercel handlers are `api/<domain>/[id].ts` + shared `lib/` services.

---

## 14. Architectural Constraints

Derived strictly from the approved SSOT:

1. **Single-level referral only** - no multi-level commission anywhere (BR-REF-002, BI-004).
2. **Immutable financial records** - no edit/delete; corrections are new transactions (BR-LED-001/002, BI-005).
3. **Available Balance never negative** (BR-WAL-002, BI-001).
4. **Pending commissions never available/withdrawable** (BR-COM-006, BI-002).
5. **No money movement inside JAD** - payment execution is external (BR-BND-001..003).
6. **No payment gateway / card / wallet-API / POS** (BR-BND-003; ROADMAP §3.2).
7. **Master signing key never in app infrastructure** (BR-SEC-002, BI-008).
8. **Property values from Admin catalog, snapshotted** (BR-PRP-003/004, BI-006).
9. **Config-driven business parameters** (BR-CFG-001).
10. **No automatic refund workflow** (BR-CAN-004, BI-010).
11. **No TBD/OD-gated behavior implemented without Owner approval** (BI-010 spirit; ROADMAP §8.2).

---

## 15. Architectural Principles

1. **Correctness over distribution** - single transactional boundary; avoid premature microservices.
2. **Immutability-first for financial data** - append-only ledger; reversal via new transactions.
3. **Single writer for balance** - ledger services are the only path that mutates balances.
4. **Security-by-design** - server-side authorization on every request; least privilege; secrets out of code.
5. **Trust boundaries explicit** - especially the CTO signing boundary (never weakened).
6. **Simplest architecture that satisfies approved requirements** - no speculative infrastructure.
7. **Module boundaries mirror feature groups** (FG-*) for traceability and incremental delivery.
8. **Domain free of framework dependencies** - testability and durability of business rules.

---

## 16. Open Architectural Decisions / Requires Approval

| ID | Decision | Options considered | Recommendation | Trade-offs | Consequences | Status |
|---|---|---|---|---|---|---|
| ARCH-DEC-001 | Backend decomposition | Modular Monolith / Microservices / Serverless | **Modular via Vercel Functions (Q1)** supersedes monolith; modular for future dedicated backend | Avoids NestJS monolith for v1, keeps single Postgres ACID boundary | Functions per domain, shared services | **CONFIRMED (Q1)** |
| ARCH-DEC-002 | API framework | Vercel Functions / Express / Fastify / minimal Node | **Vercel Functions (Q1 2026-08-30)** supersedes NestJS; see ADR-002b | Serverless handlers + Supabase, minimal ops for v1 | Framework lock-in via Vercel | **CONFIRMED (Q1)** |
| ARCH-DEC-003 | Database | PostgreSQL / MySQL / SQL Server / Mongo | **PostgreSQL** | Relational ACID needed for ledger; Mongo lacks join/constraint rigor for finances | - | **CONFIRMED** |
| ARCH-DEC-004 | ORM / data access | Prisma / Drizzle / TypeORM / raw SQL | **Supabase JS + RLS + raw SQL for ledger writes (Drizzle optional for future)** | Supabase client for CMS reads/writes; row locks via SQL when needed | - | **CONFIRMED (Q1)** |
| ARCH-DEC-005 | Member client delivery | Responsive web (browser geolocation) / native mobile / PWA | **Responsive web app first**; native revisited post-MVP | Native gives best GPS; web is cheaper and matches TypeScript-only constraint | Abroad GPS accuracy dependent on OD-014 | **CONFIRMED** (native mobile = ARCH-DEC-006) |
| ARCH-DEC-006 | CTO signing service mechanism | Cloud KMS / HSM / air-gapped signer | **Cloud KMS or HSM-based dedicated service** | Must guarantee BI-008; mechanism must be CTO-chosen | Hard security boundary | **REQUIRES APPROVAL (CTO)** |
| ARCH-DEC-007 | Authentication mechanism | Session cookies / JWT / hybrid | **Supabase Auth JWT verified server-side (Q1/Q3)** supersedes HttpOnly | JWT via PKCE cookie 5173↔5174; service verifies `MemberRole` | RLS `auth.uid()=id` | **CONFIRMED (Q1/Q3)** |
| ARCH-DEC-008 | Deployment/infrastructure | Provider, region, container orchestration, DB hosting | **Vercel (Functions + web/admin) + Supabase (Postgres/Auth/Storage)** per Q1 | Provider Vercel+Supabase | - | **REQUIRES APPROVAL** |
| ARCH-DEC-009 | NFR numerical targets | - | **TBD** | No approved targets (NFR-AVAIL/PERF/SCAL/REL) | - | **REQUIRES APPROVAL** |

---

## 17. Traceability Summary

| Planning doc | Mapping to architecture |
|---|---|
| REQUIREMENTS.md (FR/NFR) | §4 modules; §7 data flows; §9 authZ; §10-12 NFR handling |
| BUSINESS-RULES.md (BR/BI) | §2.1; §6 boundaries; §14 constraints; §15 principles |
| FEATURES.md (FEAT-*) | §4.2 modules mirror feature groups (FG-*) |
| ROADMAP.md (P1..P12) | §4.1 component phases; §13 deployment; §16 decisions gate phases |

Every architectural element above exists to satisfy an approved requirement or rule; nothing is speculative infrastructure.