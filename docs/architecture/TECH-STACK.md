# JAD - Technology Stack SSOT (TECH-STACK.md)

> **Authority:** Defines the approved/proposed technology stack for the JA&D platform. Companion to `ARCHITECTURE.md`.
>
> **Status vocabulary:** **CONFIRMED** (approved by project documentation or session decisions) · **PROPOSED** (recommended, not yet approved) · **ASSUMPTION** (working assumption) · **REQUIRES APPROVAL** (material decision) · **REQUIRES VERIFICATION** (version/claim not yet confirmed).
>
> **Critical rule:** The repository contains **no code and no dependency manifests**. Therefore **no version number in this document is verified** - every version is `REQUIRES VERIFICATION` until a manifest/lockfile exists. Versions below are current known-good suggestions, not approvals.
>
> **Version:** Project 03 - Architecture & System Design (Baseline v1.0)

---

## 1. Decision Status Summary

| Decision | Choice | Status |
|---|---|---|
| Language (whole platform) | TypeScript | **CONFIRMED** (approved session decision) |
| Backend runtime | Node.js (LTS) on Vercel | **CONFIRMED** (Q1 2026-08-30) |
| Backend framework | Vercel Functions / REST API | **CONFIRMED** (Q1; supersedes ARCH-DEC-002 NestJS) |
| Frontend (member) | React + Vite SPA | **CONFIRMED** (ARCH-DEC-005) |
| Frontend (admin/back-office) | React + Vite SPA | **CONFIRMED** (ARCH-DEC-005) |
| Merchant redemption portal | React SPA (or shared web app) | **CONFIRMED** (ARCH-DEC-005) |
| Mobile client | Responsive web with browser geolocation first | **CONFIRMED** (ARCH-DEC-005); native revisited later REQUIRES APPROVAL (ARCH-DEC-006) |
| Database | PostgreSQL via Supabase | **CONFIRMED** (ARCH-DEC-003) |
| Data access | Supabase JS client + PostgreSQL RLS; Drizzle optional for future dedicated backend | **CONFIRMED** (Supabase); Drizzle **PROPOSED** for future |
| Validation | Zod | **PROPOSED / REQUIRES APPROVAL** |
| State management | TanStack Query (server state) + Zustand (client UI state) | **PROPOSED / REQUIRES APPROVAL** |
| API | REST (JSON) over HTTPS, versioned `/api/v1` via Vercel Functions | **PROPOSED / REQUIRES APPROVAL** |
| Auth | Supabase Auth (JWT, verified server-side) | **CONFIRMED** (Q1/Q3; supersedes ARCH-DEC-007 HttpOnly) |
| Testing | Vitest + Playwright (Supertest only if dedicated backend added) | **PROPOSED / REQUIRES APPROVAL** |
| Build/monorepo | pnpm workspaces + Turborepo | **PROPOSED / REQUIRES APPROVAL** |
| Deployment | Vercel (Functions) + Supabase (Postgres/Auth/Storage/Realtime) | **PROPOSED / REQUIRES APPROVAL** (Q1) |
| Signing | External CTO-controlled service (KMS/HSM-class) | **REQUIRES APPROVAL (CTO)** |

---

## 2. Frontend

| Item | Choice | Status |
|---|---|---|
| Language | TypeScript | CONFIRMED |
| Framework | React 19 + Vite | CONFIRMED (ARCH-DEC-005) |
| Routing | React Router (or Next.js alternative under ARCH-DEC-002 note) | PROPOSED |
| Server-state | TanStack Query | PROPOSED |
| Client state | Zustand | PROPOSED |
| Forms | React Hook Form + Zod | PROPOSED |
| Styling | CSS Modules / Tailwind (PROPOSED) | PROPOSED |
| HTTP client | fetch-based typed client generated from OpenAPI | PROPOSED |

Rationale: React is the most maintainable choice for three separate UIs (member, admin, merchant) sharing one contract package. Vite keeps the build simple vs. a full Next.js server (the backend is already a separate API).

---

## 3. Backend

| Item | Choice | Status |
|---|---|---|
| Language | TypeScript | CONFIRMED |
| Runtime | Node.js LTS on Vercel | CONFIRMED (Q1) |
| Framework | Vercel Functions / REST API | CONFIRMED (Q1) |
| CLI | Vercel CLI | PROPOSED |
| Validation | Zod (DTOs) in handlers | PROPOSED |
| Logging | Vercel logs + Pino (structured) optional | PROPOSED |
| Job scheduling | Vercel Cron / pg_cron | PROPOSED |
| AuthN | Supabase Auth (JWT verified server-side) | CONFIRMED (Q1/Q3) |
| AuthZ | Vercel middleware + Supabase RLS + MemberRole lookup | PROPOSED |

Rationale: Vercel Functions keep business logic server-side with minimal infra, integrate with Supabase Auth/Postgres/RLS, and map to the `React → TanStack Query → Vercel Functions → Supabase → PostgreSQL` stack (Q1). The design stays modular (`api/cms/[key].ts`, `lib/`) for a future dedicated backend.

---

## 4. Mobile

| Item | Choice | Status |
|---|---|---|
| Immediate | Responsive web app; browser geolocation for Abroad (FR-GEO-001) | CONFIRMED (ARCH-DEC-005) |
| Later | Native (React Native) revisited post-MVP | PROPOSED / REQUIRES APPROVAL |
| GPS specifics | Depends on OD-014 (accuracy) / OD-015 (anti-spoofing) | BLOCKED on decisions |

---

## 5. Database

| Item | Choice | Status |
|---|---|---|
| Engine | PostgreSQL | CONFIRMED (ARCH-DEC-003) |
| Transactions | ACID; row-level locks; `SERIALIZABLE` where needed for balance/redemption | PROPOSED |
| Money type | `NUMERIC` (exact decimal) - never floating point | PROPOSED (mandatory for BR-WAL-002) |
| Constraints | CHECK (balance ≥ 0), unique (redemption), FKs | PROPOSED (BI-001, BI-007) |
| Snapshot | Property value stored on sale record (BI-006) | CONFIRMED rule → implementation PROPOSED |
| Migrations | Drizzle Kit / SQL migrations in repo | PROPOSED |
| Ledger design | Append-only ledger table; balance derived/validated from ledger | PROPOSED |

**Mandatory DB constraints derived from invariants:** BI-001 (available_balance ≥ 0), BI-002 (pending not available), BI-005 (no UPDATE/DELETE on financial tables - enforced by schema/roles), BI-007 (unique voucher redemption).

---

## 6. ORM / Data Access

| Item | Choice | Status |
|---|---|---|
| Typed queries | Drizzle ORM | CONFIRMED (ARCH-DEC-004) |
| Ledger writes | Raw SQL within repositories (explicit `SELECT ... FOR UPDATE`, serializable) | PROPOSED |
| Migrations | Versioned SQL migrations | PROPOSED |
| Audit inserts | Append-only service | PROPOSED |

Rationale: Ledger correctness (single writer, row locking, invariants) favors explicit control over the hot financial write paths; Drizzle provides type safety for the rest.

---

## 7. Authentication & Session

| Item | Choice | Status |
|---|---|---|
| Mechanism | Supabase Auth (JWT, verified server-side, PKCE) | CONFIRMED (Q1/Q3) |
| Session store | Supabase Auth session (JWT + RLS); DB `Member`/`MemberRole` for RBAC | PROPOSED |
| Email verification | Token via email service (BR-AUTH-001) | CONFIRMED requirement |
| Password policy | Not approved - TBD (ASSUMPTION 1) | TBD |

---

## 8. Validation

| Item | Choice | Status |
|---|---|---|
| Backend | Zod schemas on every DTO; reject before business logic | PROPOSED |
| Shared | Validation schemas in `packages/contracts` (single source) | PROPOSED |
| Money/rate validation | Exact decimal parsing; no float math (BR-COM-001/002) | PROPOSED |

---

## 9. API Technology

| Item | Choice | Status |
|---|---|---|
| Style | REST over HTTPS, JSON (Vercel Functions) | PROPOSED |
| Versioning | URI prefix `/api/v1` | PROPOSED |
| Docs | OpenAPI 3.1 authored from `packages/contracts` Zod schemas + handler routes | PROPOSED |
| Client generation | `openapi-typescript` for typed clients (or direct `contracts` import) | PROPOSED |

See `API-SPECIFICATION.md` for full conventions.

---

## 10. Testing

| Item | Choice | Status |
|---|---|---|
| Unit (domain/use cases) | Vitest | PROPOSED |
| API/e2e | Vitest fetch against Vercel dev / Supertest if dedicated backend added | PROPOSED |
| UI e2e | Playwright | PROPOSED |
| Invariant tests | BI-001..BI-010 as automated tests in CI | PROPOSED |
| Concurrency tests | Redemption/withdrawal race-condition tests | PROPOSED |
| Coverage targets | Not approved - TBD (REQUIRES APPROVAL) | TBD |

---

## 11. Build & Monorepo

| Item | Choice | Status |
|---|---|---|
| Package manager | pnpm workspaces | PROPOSED |
| Task runner | Turborepo | PROPOSED |
| Shared packages | `packages/contracts`, `packages/config`, `packages/shared` | PROPOSED |
| CI | Build + lint + test + typecheck per PR | PROPOSED |

---

## 12. Deployment & Infrastructure

| Item | Choice | Status |
|---|---|---|
| Frontend hosting | Vercel (web/admin) | PROPOSED (Q1) |
| Backend | Vercel Functions (api/) | PROPOSED (Q1) |
| Database/Auth/Storage/Realtime | Supabase (Postgres 15+ / Auth / Storage / Realtime) | PROPOSED (Q1) |
| Orchestration / hosting | Provider **OPEN** (ROADMAP R-10) - Vercel + Supabase are target per Q1 | **REQUIRES APPROVAL** |
| Database hosting | Managed PostgreSQL via Supabase | **REQUIRES APPROVAL** |
| Reverse proxy / load balancer | Vercel edge (standard) | PROPOSED |
| Secrets | Secret manager / env per environment; never in source (NFR) | PROPOSED |
| Observability | Vercel logs; metrics/APM deferred (targets TBD) | PROPOSED |
| Backups & recovery | Supabase PITR + deployment-stage decision | **REQUIRES APPROVAL** |

---

## 13. External Dependencies (Integrations)

| Service | Used by | Status |
|---|---|---|
| Email provider | FEAT-006 | ASSUMPTION 2 (provider OPEN) |
| Geolocation (GPS/IP) | FEAT-014 | ASSUMPTION 3 (provider OPEN) |
| Push notifications | FEAT-063 | ASSUMPTION 6 (provider OPEN) |
| CTO Signing Service | FEAT-059 | ASSUMPTION 7; mechanism REQUIRES APPROVAL (CTO) |
| External payout platforms | FEAT-070 | Record-only (BR-BND-002); provider set OPEN (OD-016) |

---

## 14. Approved Versions

**None are verified.** All version claims below are **REQUIRES VERIFICATION** until manifests exist. Suggested current-known-good major lines (subject to change):

| Package | Suggested line | Status |
|---|---|---|
| Node.js | Current LTS (Vercel) | REQUIRES VERIFICATION / APPROVAL |
| TypeScript | Current stable | REQUIRES VERIFICATION |
| React | Current stable major | REQUIRES VERIFICATION |
| Vite | Current stable major | REQUIRES VERIFICATION |
| Vercel Functions | Current stable | REQUIRES VERIFICATION |
| Supabase | Current stable | REQUIRES VERIFICATION |
| PostgreSQL | Current stable major (Supabase 15+) | REQUIRES VERIFICATION |
| Zod | Current stable major | REQUIRES VERIFICATION |
| Vitest | Current stable major | REQUIRES VERIFICATION |
| Playwright | Current stable major | REQUIRES VERIFICATION |
| pnpm / Turborepo | Current stable | REQUIRES VERIFICATION |

---

## 15. Approved Alternatives

| Primary | Alternative (acceptable) |
|---|---|
| Vercel Functions | Fastify/Express or Supabase Edge Functions (only if Vercel rejected - REQUIRES APPROVAL) |
| React + Vite | Next.js (only for member app if SSR needed - REQUIRES APPROVAL) |
| Supabase JS client | Drizzle (if dedicated backend added - REQUIRES APPROVAL) |
| Vitest | Jest |
| Zustand + TanStack Query | Redux Toolkit (only if team mandates) |

---

## 16. Prohibited Technologies

Per approved out-of-scope boundaries and invariants:

1. **Payment gateway / card processor SDKs** (BR-BND-003) - e.g., Stripe/PayMongo/Braintree payment APIs for collecting or moving money.
2. **Wallet APIs that move real money** (BR-BND-001) - JAD records only.
3. **Any floating-point money representation** (BR-WAL-002 correctness).
4. **NoSQL as the system of record** for financial data (no ACID/constraints).
5. **In-app MLM/network-commission libraries** (BR-REF-002).
6. **Auto-refund frameworks** (BR-CAN-004).
7. **Embedding the signing key or any HSM/KMS secret in source or app servers** (BR-SEC-002).
8. **Premature distributed systems** (event brokers, microservices frameworks) absent approval (ARCH-DEC-001).

---

## 17. Technology Decision Rationale

| Requirement/Rule | Technology consequence |
|---|---|
| Financial invariants (BI-001..007) | PostgreSQL via Supabase + NUMERIC + constraints + RLS + explicit transactions (never floats; single transactional boundary) |
| Configurable rules (BR-CFG-001) | Config via `cms_contents` / `config` table; no code deploys for parameter changes |
| CTO signing boundary (BI-008) | External signing service; app only verifies |
| RBAC + object-level authZ (NFR-AUTHZ-001/002) | Supabase RLS + Vercel middleware + shared contract types; server-side checks always |
| Record-only payments (BR-BND-001) | No payment SDKs; payout records reference external execution |
| Separate programs (BR-PRG-001) | Program-scoped config |
| Three frontends, one contract | pnpm monorepo + `packages/contracts` (typed, OpenAPI authored from contracts) |

---

## 18. Decision Register (Cross-Reference to ARCHITECTURE.md)

| Tech decision | Architecture decision |
|---|---|
| Node / Vercel Functions | ARCH-DEC-002 (Q1) |
| PostgreSQL via Supabase | ARCH-DEC-003 |
| Supabase JS + RLS (Drizzle optional for future) | ARCH-DEC-004 |
| React + Vite | ARCH-DEC-005 |
| Signing service | ARCH-DEC-006 |
| Supabase Auth (JWT) | ARCH-DEC-007 (Q1/Q3) |
| Deployment (Vercel + Supabase) | ARCH-DEC-008 |
| NFR targets | ARCH-DEC-009 |