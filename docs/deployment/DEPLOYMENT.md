# JAD - Deployment & Operations SSOT (DEPLOYMENT.md)

> **Purpose:** Authoritative deployment and operations documentation for the JA&D (JAD) platform: environments, local development, CI/CD, build and deployment flows, configuration and secrets, infrastructure and hosting, monitoring, logging, health checks, rollback, backup/recovery, scaling, incident procedures, and operational security.
>
> **Authority:** This document derives deployment and operations content **only** from the project's SSOT set - `ARCHITECTURE.md` (ARCH-DEC-008/009, §8/§10/§12/§13), `TECH-STACK.md` (§11/§12/§14/§16), `FOLDER-STRUCTURE.md` (§5/§7), `BACKEND-ARCHITECTURE.md` (§13/§15/§16/§21), `DATABASE-DESIGN.md` (§4.2/§18/§19/§21/§22/§24/§25), `TESTING.md` (§14/§17/§20), `SECURITY.md` (§7/§9/§19/§20), `DEVELOPMENT-GUIDELINES.md` (§16/§18), `CODE-REVIEW-GUIDELINES.md` (§5), `INTEGRATION-SPECIFICATION.md`, `REQUIREMENTS.md` (§7), `BUSINESS-RULES.md` (§11/§13), and `ROADMAP.md` (§9/§10/§11). It introduces **no** new provider, tool, service, environment, command, or procedure unless explicitly marked `TBD`, `Not yet configured`, or `REQUIRES APPROVAL`.
>
> **Precedence:** Reviews and operations resolve conflicts via the project's established authority chain (BUSINESS-RULES → REQUIREMENTS → FEATURES → ROADMAP → ARCHITECTURE → API-SPECIFICATION → TECH-STACK → UI-UX → DESIGN-SYSTEM → FOLDER-STRUCTURE → frontend/backend/database/mobile architecture → DEVELOPMENT-GUIDELINES), with companion quality SSOTs (`INTEGRATION-SPECIFICATION`, `TESTING`, `SECURITY`, `CODE-REVIEW-GUIDELINES`). See §21 and `BUSINESS-RULES.md §13`.
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only**. There is **no source code, no `package.json`, no lockfile, no Dockerfile or docker-compose file, no CI/CD configuration, no infrastructure files, no `.env.example`, no hosting configuration, no monitoring configuration, and no Git repository.** Consequently every deployment and infrastructure item below is **PROPOSED / REQUIRES APPROVAL / TBD / Not yet configured** unless stated otherwise. **No build or deployment command in this document can be verified against the repository** - none exist yet. Nothing is deployed, and no environment except "this documentation workspace" exists.
>
> **Status vocabulary:** **CONFIRMED** (established SSOT decision) · **PROPOSED** (recommended, not approved) · **REQUIRES APPROVAL** (material decision - architecture, security, cost, production, or SSOT) · **REQUIRES VERIFICATION** (value/claim unconfirmed) · **TBD** (undecided; must not be invented) · **Not yet configured** (no artifact exists) · **REQUIRED** / **OPTIONAL** (normative / permissive for operators and implementers).
>
> **Version:** Project 13 - Deployment & Operations Engineering (Baseline v1.0)

---

## 1. Purpose

- Define the **target deployment and operations model** for JAD and the boundaries between environments, so that implementation (ROADMAP P1 onward) deploys consistently and securely.
- Document the **planned deployment flow** - build → validate → deploy → post-deployment verify - and the CI/CD responsibilities and gates required before code reaches an environment.
- Document **what exists today vs. what requires approval**: the repository contains none of the deployment artifacts; all of them are defined here at the requirement level and must not be enacted without approval (ROADMAP §11).
- Serve as the single reference for operators, implementers, reviewers, and AI agents when implementation and infrastructure work begin.
- This document does **not** redesign the project, choose a provider, or invent procedures. Open decisions are listed (§20) and gated by the approval boundary (ROADMAP §11; ARCH-DEC-008/009).

---

## 2. Deployment Architecture (Q1 Vercel + Supabase)

Target deployment architecture is **PROPOSED as updated Q1 2026-08-30** (ARCHITECTURE §13; TECH-STACK §12 - Vercel Functions + Supabase, supersedes NestJS/Docker monolith). Diagram (from ARCHITECTURE §13 as updated):

```text
[CDN/Edge] → [Member Web App] [Admin App] [Merchant Portal] on Vercel
                     ↘            ↘
                    [Vercel Functions / REST API (/api/v1)]
                             ↘
                [Supabase Postgres 15+ (RLS) + Auth + Storage + Realtime]
                             ↘
                [Object/File Storage (marketing-tools)] [External integrations]
                                          [CTO Signing Service (separate control plane)]
```

Established elements and their status (Q1):

| Element | Intended design (Q1) | Status | Source |
|---|---|---|---|
| Applications | `apps/web` (member), `apps/admin`, `apps/merchant` on Vercel; `api/` Vercel Functions (or `apps/api/api/` keeping workspace `apps/*`) | **PROPOSED** | Q1; FOLDER-STRUCTURE §1-2 (updated) |
| Functions | Vercel Functions per domain (`api/cms/[key].ts`, `api/cms/upload.ts`); stateless, auto-scaled | **PROPOSED** (no Functions exist yet) | Q1; TECH-STACK §3 |
| Hosting | **Vercel (Functions + web/admin)** + **Supabase (Postgres/Auth/Storage)** | **REQUIRES APPROVAL** for region | Q1; ARCH-DEC-008 (updated) |
| Reverse proxy / load balancer | Vercel Edge (standard) | **PROPOSED** | TECH-STACK §12 (updated) |
| API tier | Stateless Vercel Functions; Supabase JWT verified server-side (Q3) + RLS | **PROPOSED** | ARCHITECTURE §10/§13 (updated) |
| Worker | Vercel Cron / `pg_cron` for clearing (lease-based) - no Docker worker for v1 | **PROPOSED** | BACKEND-ARCHITECTURE §13 (updated) |
| Database | Managed PostgreSQL via Supabase (`supabase/migrations/`); `cms_contents` JSONB | **REQUIRES APPROVAL** for region | ARCH-DEC-003/008; TECH-STACK §12 (updated) |
| Object/file storage | Supabase Storage `marketing-tools` (public read, `SUPER_ADMIN` write); DB holds metadata | **CONFIRMED** (Q4 hybrid) | DATABASE-DESIGN §4.3/§25; Q4 |
| CTO signing service | Separate control plane; **no network path** from app servers to the master key | **CONFIRMED** (boundary) / mechanism **REQUIRES APPROVAL (CTO)** | ARCHITECTURE §13; BI-008; ARCH-DEC-006 |
| Caching | **Not currently required**; explicit, not an omission | **CONFIRMED** | BACKEND-ARCHITECTURE §14 |

Operational implications of the architecture (all PROPOSED until the above are approved):
- **Single deployable core:** modular monolith → one API build + one worker build + three web builds (ARCH-DEC-001).
- **Signing boundary:** the signing service is deployed and operated outside application infrastructure; application servers only ever verify signatures (BI-008; SECURITY §17).
- **No money movement:** JAD never executes payment; payout events are recorded via staff actions (BR-BND-001..003) - no payment processing infrastructure in JAD (TECH-STACK §16).
- **No premature distribution:** no event brokers, stream processing, or microservices frameworks (TECH-STACK §16; ARCH-DEC-001).

---

## 3. Environment Strategy

Established environments (DATABASE-DESIGN §4.2; TESTING §14). Separation is explicit and strict:

| Environment | Purpose | Data posture | External services / providers | Status |
|---|---|---|---|---|
| **Local development** | Engineers; fast unit/component/API feedback | Local fixtures; fresh disposable DB; no real PII | Stubbed adapters | **PROPOSED** (docker-compose) |
| **Test / CI** | Automated tests against a disposable database | Synthetic data; fresh + deterministic (migrations + idempotent seeds) | Stubbed; real provider sandboxes only where provider approved (OD-016, ASSUMPTIONS) | **PROPOSED** |
| **Staging / UAT** | Pre-production validation; release/MVP gate; E2E critical journeys; performance (when approved) | Anonymized / synthetic data **only**; never production data | Sandbox / approved providers; required for any real-provider integration test | **REQUIRES APPROVAL** (provisioning) |
| **Production** | Live JAD platform | Real data; strict least-privilege roles; backups per §15 | Approved production providers | **Not yet configured**; **REQUIRES APPROVAL** |

**Rules (REQUIRED):**
- **Isolation:** no environment shares credentials, secrets, data, or provider accounts with another (SECURITY §7; DATABASE-DESIGN §4.2).
- **No production data or secrets in non-production environments** - never, under any circumstance (TESTING §14; DEVELOPMENT-GUIDELINES §18; DATABASE-DESIGN §19/§21). Anonymization for staging **REQUIRES APPROVAL**.
- **No testing in production.** Production is restricted to health/readiness probes (`/health`, `/ready`) - PROPOSED (BACKEND-ARCHITECTURE §15; TESTING §14).
- **Promotion order:** code/data/configuration flow Local → Test/CI → Staging → Production. A change reaching production must have passed the gates in §6/§7/§8.
- **Seeds:** reference data seeded in all environments; dev/test seeds are synthetic; production seed is **reference/config data only** - production admin/staff accounts are provisioned operationally via secret manager, never seeded (DATABASE-DESIGN §19).
- **Environment provisioning** (hosting, orchestration, DB, storage) is a deployment-stage decision and **REQUIRES APPROVAL** (ARCH-DEC-008; ROADMAP §11; TESTING §14).

---

## 4. Local Development

- **Intended local topology (PROPOSED):** `docker-compose` providing `api`, `db` (PostgreSQL), `worker`, `web`, `admin`, `merchant` (FOLDER-STRUCTURE §5). **No compose file exists in the repository yet** - the service set is the documented intent, not a runnable artifact.
- **Databases:** isolated local PostgreSQL container; fresh + deterministic state via migrations + idempotent seeds (DATABASE-DESIGN §18/§19). Dev seeds are clearly fake; **no real PII, no real secrets, no production data** (§19 seeds).
- **External integrations:** adapters are **stubbed** locally (email, geolocation, push, object storage, signing) - provider-free development (BACKEND-ARCHITECTURE §2.1; TESTING §14). Voucher test fixtures are signed by a **test-only signing key**, never the production master key (BI-008; TESTING §15).
- **Configuration:** `.env.example` at each app root + workspace root (PROPOSED - does not exist yet); typed env schema in `packages/config`; business parameters via the config service (BR-CFG-001), never local env (FOLDER-STRUCTURE §7; DEVELOPMENT-GUIDELINES §18).
- **Quality loop:** local changes must pass typecheck, lint, unit/component tests and targeted API tests before PR (CI responsibilities in §6; conventions in DEVELOPMENT-GUIDELINES §16).
- **Exact local commands are `Not yet defined`** - no package scripts, build commands, or compose commands exist in the repository. They are defined when the monorepo is scaffolded (ROADMAP P1) and must be added to this document's future revision.

---

## 5. Environment Configuration

- **Templates:** `.env.example` at each app root + root; **secrets never committed**; `.env*` ignored (FOLDER-STRUCTURE §7; SECURITY §7; API-SPECIFICATION §8). **None exist yet** - `REQUIRES VERIFICATION`.
- **Runtime schema:** typed env via `packages/config` (Zod). Env vars are `UPPER_SNAKE_CASE` (FOLDER-STRUCTURE §6/§7).
- **Public vs private configuration:**
  - **Public (frontend-exposed):** only values safe to ship to a client bundle, via Vite `VITE_`-prefixed variables (e.g., API base URL, app origin). Anything in a client bundle is public by definition (DEVELOPMENT-GUIDELINES §18).
  - **Private (backend-only):** database credentials, provider credentials, secrets - resolved server-side from environment/secret manager; never in the frontend (DEVELOPMENT-GUIDELINES §18; SECURITY §7).
- **Business parameters are NOT environment variables:** configurable rules/rates/limits are served by the config module via the API per `BR-CFG-001` - they must remain changeable without redeploy (NFR-MAINT-001) and are never baked into `.env` or bundles (DEVELOPMENT-GUIDELINES §18).
- **Expected variable categories (names REQUIRES VERIFICATION until `.env.example`/`packages/config` exist):**

| Category | Examples | Where | Visibility |
|---|---|---|---|
| Database connection | `DATABASE_URL` (naming per FOLDER-STRUCTURE §6) | backend/worker | Private |
| Session store | DB-backed session connection/settings | backend/worker | Private |
| Service identity | Internal service-to-service tokens (short-lived, from secret manager) | backend | Private |
| External providers | Email, geolocation, push, object storage, signing-service endpoint | backend/worker | Private |
| Public frontend | `VITE_`-prefixed base URL / origin | web/admin/merchant | Public |
| Business parameters | **None** - via config service (`GET /config/public`, API-SPECIFICATION §6.15) | - | Config-driven |

- **Per-environment values:** resolved through typed env + the config service per environment; no environment shares another environment's values (SECURITY §7; §3).
- Full variable inventory is `TBD / Not yet configured` and must be recorded when the scaffold lands (ROADMAP P1).

---

## 6. CI/CD

**Current state:** **no CI/CD pipeline, provider, or configuration exists.** Pipeline definitions are intended to live in `infra/ci/` (FOLDER-STRUCTURE §5) and the CI/CD **provider is OPEN** (ARCH-DEC-008). CI responsibilities and gates below are **REQUIRED** once CI exists; their enforcement is **REQUIRES APPROVAL** (TECH-STACK §11; TESTING §20 RA-02).

**CI responsibilities (per PR) - REQUIRED (PROPOSED until approved):**
- **Build:** monorepo builds (pnpm workspaces + Turborepo - PROPOSED) for all apps and packages (TECH-STACK §11).
- **Lint + typecheck:** static checks and strict TypeScript (DEVELOPMENT-GUIDELINES §2/§16).
- **Tests:** unit (Vitest), API/e2e (Supertest), UI e2e (Playwright), component tests - per TESTING.md. **Invariant tests BI-001..BI-010 run in CI** (ARCHITECTURE §11; TESTING §1).
- **Migration tests:** DB migrations applied on a disposable database; invariant/constraint suite runs against the migrated schema (DATABASE-DESIGN §18/§22; TESTING §12.2).
- **Contract tests:** schema/DTO/error-code changes fail CI (INTEGRATION-SPECIFICATION §13; TESTING §12.2).
- **Security/authorization suites:** rerun automatically after authN/authZ, session, logging, or signing-boundary changes (TESTING §12.1/§12.2).
- **Documentation gates:** per ROADMAP §9 (documentation updated with phase exit criteria).

**Required validation gates before promotion (from TESTING §17 and ROADMAP §9):**
- All phase `FR-*`/`NFR-*` implemented and verified; governing `BR-*` enforced; **no BI invariant violated**.
- Phase acceptance criteria `AC-*` pass (REQUIREMENTS §12).
- RBAC matrix and object-level rules validated; audit trails captured (NFR-SEC-001/002, NFR-AUTHZ-001/002).
- No unresolved `BLOCKED` features within phase scope; OD-gated items formally excluded (ROADMAP §8.2/§9).
- Code review outcome is `Approved` or `Approved with minor issues` (CODE-REVIEW-GUIDELINES §5); no open `CRITICAL`/`HIGH` findings without resolution or explicit authorized exception.

**CI/CD decisions not yet made (`TBD / REQUIRES APPROVAL`):** CI provider (ARCH-DEC-008), E2E scheduling (per-PR vs nightly - TESTING §20 RA-02), coverage thresholds (TESTING §16), artifact registry, deploy pipeline mechanics, environment promotion automation.

---

## 7. Build Process

**Current state:** no build system, manifests, or scripts exist - nothing can be built. Intended design (PROPOSED, TECH-STACK §11/§12/§14):

- **Monorepo:** pnpm workspaces + Turborepo; shared packages `packages/contracts`, `packages/config`, `packages/shared` (FOLDER-STRUCTURE §4).
- **Backend:** Vercel Functions build (`api/`); worker via Vercel Cron / pg_cron; Supabase SQL migrations in `supabase/migrations/` (Q1).
- **Frontends:** React + Vite builds for `web`, `admin`, `merchant` (TECH-STACK §2; ARCH-DEC-005).
- **Container images:** `Dockerfile` per app (api, web, admin, merchant, worker) - PROPOSED, none exist (FOLDER-STRUCTURE §5).
- **Generated artifacts:** OpenAPI 3.1 generated from Nest metadata, published at `/api/v1/docs`; typed client generated from it (API-SPECIFICATION §5.4; BACKEND-ARCHITECTURE §16).
- **Versions:** all version claims are `REQUIRES VERIFICATION` until manifests exist (TECH-STACK §14); Node.js current LTS suggested - REQUIRES APPROVAL.
- **Reproducibility:** pinned versions via lockfile once manifests exist; no floating/phantom versions (DEVELOPMENT-GUIDELINES §17).
- **Build-time security:** no secrets in bundles; only `VITE_`-prefixed public vars compiled in; server-only env never imported into clients (DEVELOPMENT-GUIDELINES §18; SECURITY §7).
- **Exact build commands are `Not yet defined`** - they will be defined at scaffold time (P1) and must be recorded here.

---

## 8. Deployment Process

**Current state:** no deployment exists; no provider, orchestrator, or pipeline is configured. The flow below is the **required target behavior** once ARCH-DEC-008 and the CI/CD design are approved. Concrete mechanics are `TBD / Not yet configured`.

**Required flow (build → validate → deploy → verify):**
1. **Build:** reproducible artifacts (container images / compiled bundles) produced by the pipeline (§7).
2. **Validate:**
   - CI gates green: build, lint, typecheck, tests, invariants BI-001..BI-010, migration tests, contract tests (§6).
   - Code review approved (CODE-REVIEW-GUIDELINES §5).
   - Phase/AC gates satisfied for release scope (ROADMAP §9).
   - Staging validated for any release, especially MVP gate M5 and all real-provider integrations (TESTING §14; ROADMAP §7.4).
3. **Deploy:**
   - **Database migrations** run under the `migration`/`ddl` role in the deploy pipeline - **never the app role**; additive-only by default; destructive operations gated `REQUIRES APPROVAL` (DATABASE-DESIGN §18/§22).
   - App/worker/images deployed behind the load balancer; API remains stateless (ARCHITECTURE §10).
   - **Secrets** injected per environment from the secret manager - never from source or bundles (SECURITY §7; API-SPECIFICATION §8).
   - CTO signing service and any signing deployment is operated in its separate control plane (BI-008; ARCHITECTURE §13).
4. **Post-deployment verification:**
   - Health/readiness probes pass (`/health`, `/ready`) - PROPOSED (BACKEND-ARCHITECTURE §15).
   - Production is **restricted to health/readiness probes only**; no functional testing on production data (TESTING §14).
   - Smoke checks of critical flows run in **staging**, not production.
   - Audit/log integrity confirmed (audit rows written, logs flowing) per operational security (§18).

**Deployment decisions `REQUIRES APPROVAL`:** provider/region, orchestrator, artifact registry, migration-in-pipeline mechanics, zero-downtime strategy, environment promotion automation (ARCH-DEC-008; ROADMAP §11; TESTING §20 RA-02).

---

## 9. Hosting and Infrastructure

**Current state:** no hosting, no infrastructure, no provider. All items below are decisions **open** for approval.

| Concern | Intended | Status |
|---|---|---|
| Compute / orchestration | Docker containers + orchestration (provider OPEN) | **REQUIRES APPROVAL** (ARCH-DEC-008, R-10) |
| Reverse proxy / LB | Standard, provider-agnostic | **PROPOSED** |
| Database hosting | Managed PostgreSQL; provider/region OPEN; private network only, **no public DB exposure** | **REQUIRES APPROVAL** (DA-01) |
| Object/file storage | External object storage via adapters; DB holds metadata | **CONFIRMED** (assumption A-08) |
| CDN/Edge | Intended in the deployment diagram | **PROPOSED** |
| CTO signing service | Separate control plane, CTO-operated; mechanism (KMS/HSM/air-gapped) CTO-chosen | **REQUIRES APPROVAL (CTO)** (ARCH-DEC-006) |
| External providers | Email, geolocation, push, payout (record-only) - provider set OPEN | **REQUIRES APPROVAL** (R-03, OD-016) |
| Region / multi-AZ | Single-region baseline; multi-AZ deployment-stage decision | **REQUIRES APPROVAL** (ARCHITECTURE §12) |

Infrastructure provisioning is explicitly out of scope for this documentation task; no infrastructure is created, and none exists to operate. The approval boundary for all of the above is ROADMAP §11.

---

## 10. Secrets Management

Authoritative standards: `SECURITY.md §7`; `API-SPECIFICATION.md §8`; `DEVELOPMENT-GUIDELINES.md §18`. Requirements:

- **Storage:** all secrets via environment / secret manager per environment; **never committed**; `.env*` ignored (NFR-SEC-001; FOLDER-STRUCTURE §7).
- **Least privilege:** deployment credentials are scoped to their environment and function; no shared cross-environment credentials; production deployment access is protected and limited (SECURITY §4/§18).
- **Bundles:** no secret may be compiled into web/mobile bundles; only `VITE_`-prefixed public vars ship to clients (DEVELOPMENT-GUIDELINES §18; SECURITY §7).
- **Service identity:** service-to-service calls use short-lived tokens from the secret manager - never user cookies (API-SPECIFICATION §2.1).
- **Signing boundary:** the master voucher signing key is exclusively under CTO control; never in app infrastructure, developer workstations, or DBAs; the app only verifies signatures (BR-SEC-001..004; BI-008). The signing mechanism is CTO-chosen (ARCH-DEC-006).
- **Provider credentials:** external provider credentials live in the secret manager, used server-side only (INTEGRATION-SPECIFICATION §4/§10).
- **Rotation:** a formal rotation procedure is **`Not yet defined` / REQUIRES APPROVAL** (SECURITY §20 SA-12). Until approved, rotation must follow the least-privilege and audit rules above.
- **No weakening for convenience:** security controls are not relaxed to simplify deployment (SECURITY §1.7; ROADMAP §11.6).
- **Verification:** `REQUIRES VERIFICATION` - no manifests or env examples exist to confirm the final secret inventory.

---

## 11. Monitoring and Observability

**Current state:** no monitoring/alerting system is configured; metrics/APM are explicitly deferred until NFR targets are approved (TECH-STACK §12; BACKEND-ARCHITECTURE §15). Nothing is invented here.

- **Application monitoring:** structured logs (§12) with `requestId` correlation; **log aggregation is a deployment-stage decision - REQUIRES APPROVAL** (ARCH-DEC-008; BACKEND-ARCHITECTURE §15).
- **Metrics/APM:** deferred until NFR-PERF-001/AVAIL-001/REL-001 targets are approved (TECH-STACK §12; BACKEND-ARCHITECTURE §15). If introduced later, scope is read-path and operational counters - **never financial values**.
- **Error tracking:** server-side error logs with stack + correlation, **no PII/financial data**; third-party error tracking **REQUIRES APPROVAL** (BACKEND-ARCHITECTURE §15).
- **Request tracing:** `requestId` in the error envelope and logs today; distributed tracing only if deployment requires it - **REQUIRES APPROVAL** (BACKEND-ARCHITECTURE §15; SECURITY §20 SA-12).
- **DB/external-service monitoring:** slow-query and connection monitoring are deployment-stage - **REQUIRES APPROVAL**; adapter timeouts/errors are logged server-side (BACKEND-ARCHITECTURE §15).
- **Worker visibility:** the clearing scheduler logs per-batch results and failures; failures are recorded and never partially applied (BACKEND-ARCHITECTURE §13).
- **Alerting thresholds:** **`Not yet defined` / REQUIRES APPROVAL** - no thresholds exist and none are invented (SECURITY §20 SA-12).
- **Availability/reliability/performance targets:** **TBD** (NFR-AVAIL/PERF/REL/SCAL-001) - no numbers are invented (REQUIREMENTS §7; ARCH-DEC-009).

---

## 12. Logging

Authoritative standard: `BACKEND-ARCHITECTURE.md §11`; `SECURITY.md §6/§13`.

- **Structured logs:** Pino structured logging - PROPOSED (TECH-STACK §3).
- **Correlation:** `requestId` present in logs and the error envelope (API-SPECIFICATION §3).
- **Redaction (REQUIRED):** logs never contain passwords, verification tokens, session ids/values, `Idempotency-Key`s, voucher payloads/signatures, payout account numbers, or secrets; sensitive fields redacted (BACKEND-ARCHITECTURE §11; SECURITY §6).
- **No PII/financial data in runtime logs** (NFR-CONF-001, NFR-DATA-001; API-SPECIFICATION §8).
- **Audit vs logs (REQUIRED):** the immutable `audit` trail is **separate** from runtime logs; audit is never truncated/rotated by log rotation; runtime logs are operational and rotatable (BACKEND-ARCHITECTURE §11; SECURITY §13).
- **Log aggregation** is deployment-stage - **REQUIRES APPROVAL** (§11).
- Client-side logging is minimal, non-PII, with `requestId` only; full audit happens server-side (DEVELOPMENT-GUIDELINES §10).

---

## 13. Health Checks

- **Endpoints (PROPOSED):** `/health` (liveness) and `/ready` (readiness: DB connectivity, session store, critical adapters) for the orchestrator/load balancer (BACKEND-ARCHITECTURE §15).
- **Usage:** orchestrator/LB probe routing and post-deployment verification (§8). Production permits health/readiness probes **only** - no functional testing (TESTING §14).
- **Operational use:** readiness failures should gate traffic; liveness failures trigger restart policy. Exact probe policies are **`Not yet defined` / REQUIRES APPROVAL** with the orchestration decision (ARCH-DEC-008).
- **Not configured:** no health endpoint is implemented today; the contract above is the documented intent.

---

## 14. Rollback and Recovery

**Current state:** no deployment tooling or versioned artifacts exist, so no rollback mechanism exists. Requirements below are derived from the SSOTs.

**Confirmed constraints that shape rollback:**
- **Financial immutability (BI-005):** financial records are never edited or deleted; corrections are new ledger transactions (BR-LED-001/002). **A code/data rollback must never revert or delete financial/audit rows** (DATABASE-DESIGN §16/§21/§22).
- **No automatic refunds (BI-010):** recovery from a bad financial operation is a new transaction / Super Admin exception workflow - not a rollback (BUSINESS-RULES §8).
- **Additive migrations by default (PROPOSED):** migrations are additive-safe where possible; dropping tables/columns, irreversible transforms, and major relationship changes **REQUIRE APPROVAL** (DATABASE-DESIGN §18; DA-12).
- **API versioning:** breaking changes create `/api/v2` with deprecation (API-SPECIFICATION §5.1) - the API contract rolls **forward**, not backward.

**Rollback strategy (intended, PROPOSED):**
1. **Code rollback:** revert to the previous approved artifact/container image; redeploy stateless API + frontends; fast and safe for the stateless tier (ARCHITECTURE §10).
2. **Data/schema:** roll forward with a corrective additive migration; destructive reversal requires approval and staging validation (DATABASE-DESIGN §18).
3. **Configuration:** revert config via the config service; values are changeable without redeploy (BR-CFG-001).
4. **Signing service:** never roll back security controls; the signing boundary and its audit remain intact during any rollback (BI-008; SECURITY §17).
5. **Prerequisites (REQUIRED):** every release must have a documented rollback plan (previous artifact identifiable), staging verification before production, and post-rollback verification via `/health` + `/ready` + audit/log checks (§8/§13).

**Not yet defined (`TBD / REQUIRES APPROVAL`):** RTO (ARCH-DEC-009), rollback automation mechanics, zero-downtime/blue-green/canary strategy (ARCH-DEC-008), artifact retention policy.

---

## 15. Backup and Disaster Recovery

Authoritative standard: `DATABASE-DESIGN.md §21`. Current state: **no backups exist; the backup strategy is PROPOSED / REQUIRES APPROVAL.**

| Item | Intended | Status |
|---|---|---|
| Backup strategy | Managed PostgreSQL backups: continuous WAL archiving + periodic full backups (provider-dependent) | **PROPOSED / REQUIRES APPROVAL** (ARCH-DEC-008, DA-01) |
| Point-in-time recovery (PITR) | Enabled on managed PostgreSQL (WAL) | **PROPOSED** |
| Restore strategy | Restore to staging first for validation; verified restore drills before/periodically | **PROPOSED** |
| RPO | **TBD - REQUIRES APPROVAL** (not defined anywhere) | REQUIRES APPROVAL |
| RTO | **TBD - REQUIRES APPROVAL** | REQUIRES APPROVAL |
| Disaster recovery | Multi-AZ/region strategy | **REQUIRES APPROVAL** (provider/region OPEN) |
| Data-loss priorities | Financial/audit tables are **irreplaceable**; backup policy must prioritize them; RESTRICT FKs mean no cascade-recovery needed | **CONFIRMED** |
| Environment posture | Dev/test DBs disposable; production backups per approved policy; **no real data copied into dev/test without approval** | **CONFIRMED** |

Rules (REQUIRED):
- **No RPO/RTO values are invented** - they remain `REQUIRES APPROVAL` until ARCH-DEC-009 / NFR-AVAIL-001 / NFR-REL-001 targets are approved (DATABASE-DESIGN §21).
- Restore is validated in staging before any production reliance; drills are part of the intended operating procedure.
- Backups and recovery must respect encryption at rest and least-privilege access (§9/§10; DATABASE-DESIGN §8.3/§22).
- Any recovery procedure involving financial data must never violate BI-005 (no in-place edits/reverts of financial rows).

---

## 16. Scaling

Authoritative standard: `ARCHITECTURE.md §10`; `BACKEND-ARCHITECTURE.md §13/§14`. **Targets are TBD** (NFR-PERF/SCAL-001); the strategy below is the documented design, not invented numbers.

- **API tier:** stateless, horizontal scaling behind the load balancer; sessions centralized in the DB (PROPOSED) so any replica serves any request (ARCHITECTURE §10).
- **Database:** single source of truth (PostgreSQL). **Correctness over sharding** - write paths (commission creation, redemption, withdrawals) are controlled by transaction isolation and row locks, not by scaling shards (ARCHITECTURE §10; NFR-ATOM-001/002).
- **Read scaling:** reporting/genealogy reads served from the same DB with tuned indexes; **read replicas deferred, not speculative** (ARCHITECTURE §10; DATABASE-DESIGN A-10).
- **Worker:** clearing scheduler is horizontally scalable with lease-based single-writer semantics (no double-processing); queue/scheduler choice REQUIRES APPROVAL (BACKEND-ARCHITECTURE §13).
- **Caching:** **not currently required**; if introduced later, it is read-only/non-authoritative and never on a financial path, with explicit invalidation - REQUIRES APPROVAL (BACKEND-ARCHITECTURE §14).
- **No premature distribution:** event brokers/stream processing/microservices are prohibited absent approval (TECH-STACK §16; ARCH-DEC-001).
- **Performance/scalability targets and any load-generation commitments are `TBD / REQUIRES APPROVAL`** (NFR-PERF-001/SCAL-001, ARCH-DEC-009; TESTING §13).

---

## 17. Incident Procedures

> **Baseline reality:** no incident-response (IR) plan, runbook, escalation matrix, or on-call policy is documented in the SSOT set. The IR plan itself is **REQUIRES APPROVAL** (SECURITY §19/§20 SA-12). This section records the confirmed building blocks and the required shape of a procedure appropriate to current maturity - it does not invent an operational program.

**Confirmed building blocks the IR procedure must integrate (SECURITY §19):**
- **Detection:** `/health`/`/ready` probes (PROPOSED); structured logs with `requestId`; metrics/alerting thresholds `TBD / REQUIRES APPROVAL` (§11).
- **Triage priority (from the confirmed risk register, ROADMAP §10):** financial integrity (R-04), authorization/object-level leakage (R-05), atomicity/race conditions (R-07), signing-service availability (R-02). These are the first concerns to triage.
- **Containment:** the signing boundary remains intact under any compromise - the master key must not be exposed (BI-008; BR-SEC-001..004; AC-SEC-001).
- **Recovery:** backup/restore per §15 (staging-validated); the only confirmed manual financial recovery path is Super Admin recovery after a withdrawn-commission reversal (BUSINESS-RULES §8); **no automatic refunds** (BI-010).
- **Forensics:** append-only immutable audit enables reconstruction of approvals, verifications, exceptions, and adjustments (DATABASE-DESIGN §15; BI-005).
- **Approval boundaries:** security-boundary changes during incident response require the documented approval process; no silent weakening of security controls (ROADMAP §11; SECURITY §1.7).

**Required procedure elements (REQUIRED once approved):** severity/classification, escalation and owner communication, breach-notification/compliance obligations, evidence handling, post-incident review cadence, RTO/RPO, and monitoring/alerting thresholds - all currently **TBD / REQUIRES APPROVAL** (SECURITY §20 SA-12). Until an IR plan is approved, the documented building blocks above are the operating baseline.

---

## 18. Operational Security

Authoritative standards: `SECURITY.md §1-§15`, `API-SPECIFICATION.md §8`, `DATABASE-DESIGN.md §22`. Operational requirements:

- **Least-privilege deployment credentials:** CI/CD and operator credentials are scoped per environment/function; DB roles mirror app roles (`app`, `migration`/`ddl`, `reporting`, `audit`); **no role holds blanket DDL/DML** (DATABASE-DESIGN §4.5/§22; SECURITY §4).
- **No public DB exposure:** database reachable only from the private network/app tier; TLS in transit; encrypted at rest (managed) (DATABASE-DESIGN §22; SECURITY §9).
- **Environment isolation:** no cross-environment credentials, secrets, data, or provider accounts (§3; SECURITY §7).
- **Production deployment access protected** and limited to authorized operators; deployment acts are auditable (NFR-SEC-002).
- **Migration role separation:** schema changes run under the `migration`/`ddl` role in the deploy pipeline; app role never runs DDL (DATABASE-DESIGN §18/§22).
- **Signing boundary:** master key never in app infrastructure or accessible to operators/DBAs; app verifies only (BI-008; BR-SEC-001..004).
- **Rate limiting / abuse controls:** per-IP/per-user limits, strict on auth and redemption; values configurable but **TBD** (API-SPECIFICATION §5.2).
- **Secret rotation:** procedure `Not yet defined / REQUIRES APPROVAL` (§10).
- **Sensitive information handling:** no secrets or sensitive values in logs, error responses, or documentation (SECURITY §6; API-SPECIFICATION §8).
- **No weakening for convenience:** security controls are never relaxed to simplify deployment, rollback, or debugging (SECURITY §1.7; ROADMAP §11.6).

---

## 19. Validation Checklist

Use when reviewing or executing any deployment/ops change. Each item cites its authority.

- [ ] Repository artifacts (manifests, scripts, compose, Dockerfiles, CI, `.env.example`) match this document and FOLDER-STRUCTURE §5/§7. *(REQUIRES VERIFICATION - none exist yet.)*
- [ ] No secret, credential, token, key, or sensitive production value is present in any file, log, artifact, or this document. *(SECURITY §7; API-SPECIFICATION §8.)*
- [ ] Environment boundaries respected: no production data/secrets in non-production; no testing in production. *(TESTING §14; DATABASE-DESIGN §4.2/§21.)*
- [ ] CI gates defined and green before promotion: build, lint, typecheck, tests, invariants BI-001..BI-010, migration tests, contract tests. *(TECH-STACK §11; TESTING §17; ROADMAP §9.)*
- [ ] Code review approved with no unresolved `CRITICAL`/`HIGH` findings (or explicit authorized exception). *(CODE-REVIEW-GUIDELINES §5.)*
- [ ] Migrations additive-safe, run under the `migration` role, destructive operations approved. *(DATABASE-DESIGN §18/§22.)*
- [ ] Health/readiness probes configured and passing post-deploy (`/health`, `/ready`). *(BACKEND-ARCHITECTURE §15.)*
- [ ] Rollback plan documented for the release (previous artifact identifiable). *(§14; ARCHITECTURE §10.)*
- [ ] Backup strategy and restore-to-staging validation in place before production reliance. *(DATABASE-DESIGN §21.)*
- [ ] Monitoring/logging/alerting aligned with §11/§12; alerting thresholds approved. *(BACKEND-ARCHITECTURE §15.)*
- [ ] No invented provider, tool, service, target, threshold, or procedure introduced. *(§20; ARCH-DEC-008/009.)*

---

## 20. Known Gaps / TBD Items

Everything below requires owner/CTO/approval action before implementation; **none may be silently decided** (ROADMAP §11; BUSINESS-RULES §13).

| # | Item | Current state | Decision required |
|---|---|---|---|
| D-01 | Deployment provider, region, orchestration | **OPEN** (ARCH-DEC-008, ROADMAP R-10) | Approve provider/region/orchestrator |
| D-02 | Database hosting provider/region (managed PostgreSQL) | **OPEN** (DA-01) | Approve provider/region |
| D-03 | CI/CD provider and pipeline definition | Provider OPEN (ARCH-DEC-008); none exists | Approve CI design |
| D-04 | Docker/container images and compose file | PROPOSED (FOLDER-STRUCTURE §5); **none exist** | Create + approve |
| D-05 | `.env.example` / `packages/config` env schema / env variable inventory | **Not yet configured** (FOLDER-STRUCTURE §7) | Create + approve |
| D-06 | Secret manager selection and secret inventory; rotation procedure | Not selected; rotation procedure **Not yet defined** (SECURITY §20 SA-12) | Approve |
| D-07 | Log aggregation and observability platform | Deployment-stage (BACKEND §15); none exists | Approve |
| D-08 | Metrics/APM; alerting thresholds | Deferred (targets TBD); thresholds undefined | Approve after targets |
| D-09 | Distributed tracing / third-party error tracking | **REQUIRES APPROVAL** (BACKEND §15) | Approve or defer |
| D-10 | NFR-PERF/AVAIL/REL/SCAL-001 targets; RPO/RTO | **TBD** (ARCH-DEC-009; REQUIREMENTS §7; DATABASE-DESIGN §21/§24 DA-02/DA-03) | Approve targets |
| D-11 | Backup/DR implementation (WAL + full, PITR, restore drills, multi-AZ/region) | PROPOSED / REQUIRES APPROVAL (DATABASE-DESIGN §21; DA-01) | Approve strategy |
| D-12 | Migration pipeline mechanics; destructive migration instances | Gated (DATABASE-DESIGN §18, DA-12) | Approve per instance |
| D-13 | DB-backed session store + TTLs; Idempotency-Key TTL | PROPOSED (DA-04/DA-05) | Approve |
| D-14 | Transaction isolation strategy per operation | PROPOSED (DA-06) | Approve |
| D-15 | Scheduler/queue choice for the worker | PROPOSED (BACKEND §13) | Approve |
| D-16 | Scaling commitments (replicas, read replicas, caching) | TBD (ARCHITECTURE §10; NFR-SCAL-001) | Approve after targets |
| D-17 | Staging provisioning and real-provider sandbox usage | Deployment-stage (TESTING §20 RA-07; R-03; OD-016) | Approve |
| D-18 | Test-data anonymization policy for staging | Not defined (TESTING §20 RA-08) | Approve |
| D-19 | IR plan, severity/escalation, RTO/RPO, alerting thresholds, post-incident cadence | Undefined (SECURITY §19/§20 SA-12) | Approve IR program |
| D-20 | TLS specifics, pinning, encryption-at-rest ownership | TLS CONFIRMED; specifics/pinning REQUIRES APPROVAL (SECURITY §9/§20 SA-06/SA-07) | Approve policy |
| D-21 | Field-level encryption for payout identifiers | **REQUIRES APPROVAL** (DA-08) | Approve mechanism |
| D-22 | Rate-limit values (strict on auth/redemption) | Configurable, values TBD (API-SPECIFICATION §5.2) | Approve values |
| D-23 | External provider selections (email, geolocation, push, payout) | OPEN (R-03; OD-016; ASSUMPTIONS 2/3/6/7) | Approve providers |
| D-24 | CTO signing service mechanism (KMS/HSM/air-gapped) | CTO-chosen (ARCH-DEC-006) | CTO approval |

---

## 21. Traceability / Authority

| Section | Sources (authoritative) |
|---|---|
| §1 Purpose | ROADMAP §11; ARCH-DEC-008/009 |
| §2 Deployment Architecture | ARCHITECTURE §13/§10/§12; TECH-STACK §12/§16; FOLDER-STRUCTURE §2/§3/§5; BACKEND-ARCHITECTURE §13/§14; BI-008; BR-BND-001..003; ARCH-DEC-001/006 |
| §3 Environment Strategy | DATABASE-DESIGN §4.2/§19/§21; TESTING §14; DEVELOPMENT-GUIDELINES §18; SECURITY §7 |
| §4 Local Development | FOLDER-STRUCTURE §5/§7; DATABASE-DESIGN §18/§19; BACKEND-ARCHITECTURE §2.1; TESTING §14/§15; BI-008; BR-CFG-001 |
| §5 Environment Configuration | FOLDER-STRUCTURE §6/§7; DEVELOPMENT-GUIDELINES §18; SECURITY §7; BR-CFG-001; API-SPECIFICATION §6.15; NFR-MAINT-001 |
| §6 CI/CD | TECH-STACK §11/§12; FOLDER-STRUCTURE §5; ARCH-DEC-008; TESTING §1/§12/§16/§17/§20; INTEGRATION-SPECIFICATION §13; ROADMAP §9; CODE-REVIEW-GUIDELINES §5; DEVELOPMENT-GUIDELINES §16 |
| §7 Build Process | TECH-STACK §2/§3/§6/§11/§14; FOLDER-STRUCTURE §4; DATABASE-DESIGN §18; API-SPECIFICATION §5.4; DEVELOPMENT-GUIDELINES §17/§18; ARCH-DEC-005 |
| §8 Deployment Process | DATABASE-DESIGN §18/§22; ARCHITECTURE §10/§13; SECURITY §7; BACKEND-ARCHITECTURE §15; TESTING §14; ROADMAP §9/§7.4 |
| §9 Hosting and Infrastructure | ARCH-DEC-008; TECH-STACK §12; DATABASE-DESIGN §4.3/§25 (A-08)/§22; ARCH-DEC-006; ROADMAP §11/R-03; OD-016 |
| §10 Secrets Management | SECURITY §7/§9; API-SPECIFICATION §8; DEVELOPMENT-GUIDELINES §18; BR-SEC-001..004; BI-008; ARCH-DEC-006; INTEGRATION-SPECIFICATION §4/§10; ROADMAP §11.6 |
| §11 Monitoring and Observability | BACKEND-ARCHITECTURE §15; TECH-STACK §12; REQUIREMENTS §7; ARCH-DEC-009 |
| §12 Logging | BACKEND-ARCHITECTURE §11; SECURITY §6/§13; API-SPECIFICATION §3; TECH-STACK §3; NFR-CONF-001, NFR-DATA-001 |
| §13 Health Checks | BACKEND-ARCHITECTURE §15; TESTING §14; ARCH-DEC-008 |
| §14 Rollback and Recovery | BI-005; BR-LED-001/002; BI-010; DATABASE-DESIGN §16/§18/§21/§22; API-SPECIFICATION §5.1; BUSINESS-RULES §8; ARCHITECTURE §10; BR-CFG-001 |
| §15 Backup and Disaster Recovery | DATABASE-DESIGN §21/§24 (DA-01/DA-02)/§22; ARCH-DEC-008/009; NFR-AVAIL-001/REL-001 |
| §16 Scaling | ARCHITECTURE §10; BACKEND-ARCHITECTURE §13/§14; NFR-ATOM-001/002; NFR-PERF-001/SCAL-001; TECH-STACK §16; DATABASE-DESIGN A-10 |
| §17 Incident Procedures | SECURITY §19/§20 (SA-12); ROADMAP §10 (R-02/R-04/R-05/R-07); BI-008; BUSINESS-RULES §8; DATABASE-DESIGN §15/§21; BI-010; ROADMAP §11 |
| §18 Operational Security | SECURITY §1-§15; API-SPECIFICATION §8; DATABASE-DESIGN §4.5/§22; BI-008; BR-SEC-001..004; ROADMAP §11.6 |
| §19 Validation Checklist | All sections above; TESTING §17; CODE-REVIEW-GUIDELINES §5; ROADMAP §9 |
| §20 Known Gaps | ARCH-DEC-008/009; ROADMAP §11; DATABASE-DESIGN §24; TESTING §20; SECURITY §20; BACKEND-ARCHITECTURE §13/§15/§21 |

---

## Validation performed
- **Repository inspected:** confirmed the repository contained **only** the 19 pre-existing SSOT markdown files (no code, manifests, scripts, Docker/compose, CI/CD, hosting, monitoring, env examples, Git, or `CLAUDE.md`) before this document was added. No build/deploy/CI command can be verified against repository artifacts - this is stated explicitly and no commands are invented.
- **Environment names** are taken from `DATABASE-DESIGN.md §4.2` and `TESTING.md §14` (Local / Test-CI / Staging-UAT / Production) - no new environments introduced.
- **Deployment architecture, hosting, CI/CD, monitoring, backup, scaling, and incident content** are derived from the cited SSOT sections only; all unestablished items are marked `PROPOSED` / `REQUIRES APPROVAL` / `TBD` / `Not yet configured`.
- **No secrets or sensitive values** are included; environment variables are described by category with documented example names only.
- **Contradiction handling:** no contradictions were found between authoritative sources; the precedence chain (§21) matches the project's established hierarchy (`BUSINESS-RULES.md §13`; `MOBILE-ARCHITECTURE.md` header). Where the repository (no artifacts) and documentation (proposed artifacts) differ, the discrepancy is identified in §20 rather than resolved by invention.
- **Consistency:** terminology, status vocabulary, and section conventions match `TESTING.md`, `SECURITY.md`, and `CODE-REVIEW-GUIDELINES.md`.
- **Issues requiring human approval:** the complete gated list is in §20 (D-01..D-24); the highest-priority blockers are deployment/infrastructure provider (D-01/D-02, ARCH-DEC-008), CI/CD provider (D-03), NFR/RPO/RTO targets (D-10), and the incident-response program (D-19). No production, infrastructure, security-boundary, hosting, CI/CD, or SSOT changes were made - documentation creation only.