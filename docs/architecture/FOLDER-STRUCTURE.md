# JAD - Repository & Folder Structure SSOT (FOLDER-STRUCTURE.md)

> **Authority:** Defines the intended repository organization for the JA&D platform, aligned with `ARCHITECTURE.md` (modular Vercel Functions, FG-aligned domains) and `TECH-STACK.md` (pnpm monorepo, React + Vercel + Supabase) as updated **Q1 2026-08-30** (Supabase + Vercel Functions, supersedes NestJS).
>
> **Status of this structure:** **PROPOSED future structure** - the repository currently contains `apps/web`, `apps/admin`, `packages/*`, `supabase/migrations` and `docs/`. No dedicated backend exists yet; the target backend is **Vercel Functions** per Q1. Migration to this layout occurs when implementation begins (ROADMAP P1).
>
> **Version:** Project 03 - Architecture & System Design (Baseline v1.0, updated Q1 2026-08-30 for Vercel Functions)

---

## 1. Root Structure

```text
jad-realty/
├── api/                # Vercel Functions (or apps/api/api/ keeping pnpm workspace apps/*)
│   ├── cms/
│   │   ├── [key].ts    # GET/PUT /api/v1/cms/:key
│   │   └── upload.ts   # POST /api/v1/cms/upload (marketing-tools)
│   └── _lib/           # shared handlers, supabase client, validation
├── apps/
│   ├── web/            # Member-facing web app (React + Vite, :5173)
│   ├── admin/          # Admin / back-office app (React + Vite, :5174)
│   └── merchant/       # Merchant redemption portal (React + Vite) - future
├── supabase/
│   ├── migrations/     # versioned SQL (cms_contents, auth foundation)
│   └── seed.ts         # upserts cms_contents 8 keys + Member/Role
├── packages/
│   ├── contracts/      # Shared DTOs, Zod schemas (cms.ts), OpenAPI types, enums - single source
│   ├── config/         # Environment config schema + shared runtime config types
│   └── shared/         # Utilities, money math, invariants, constants
├── vercel.json         # Functions + rewrites (if needed)
├── docs/               # SSOT documentation
├── .github/            # CI workflows, PR templates
├── .env.example        # Environment template (values never committed)
├── package.json        # Workspace root
├── pnpm-workspace.yaml # apps/* + api/* + packages/* + supabase/*
├── turbo.json
├── tsconfig.base.json
└── README.md
```

> `docs/` already exists and is the documentation SSOT location - unchanged.

---

## 2. Backend Structure - Vercel Functions (Q1)

```text
api/  (Vercel Functions - or apps/api/api/ if keeping workspace)
├── cms/
│   ├── [key].ts        # Vercel handler: GET public / PUT admin (Supabase JWT + Zod)
│   └── upload.ts       # POST admin image upload → marketing-tools
├── _lib/
│   ├── supabase.ts     # getSupabaseClient (SERVICE_ROLE for writes)
│   └── validation.ts   # Zod via @jad/contracts per cms key
└── vercel.json (optional)

# Legacy NestJS structure below is superseded - preserved for migration reference only
# apps/api/src/ (NestJS) - archived
# ├── src/
# │   ├── main.ts                 # Bootstrap (NestJS - superseded)
# │   ├── app.module.ts           # Root module (superseded)
│   ├── common/                 # Cross-cutting (no business logic)
│   │   ├── guards/             # AuthN, RBAC, ownership/object-level guards
│   │   ├── decorators/         # @Roles(), @CurrentUser(), @Public()...
│   │   ├── interceptors/       # Logging, response shaping
│   │   ├── filters/            # Global exception → error envelope
│   │   ├── pagination/         # Page & cursor helpers
│   │   └── dto/                # Shared request/response primitives
│   ├── database/
│   │   ├── schema/             # SQL schema definitions (Drizzle)
│   │   ├── migrations/         # Versioned migrations
│   │   └── seed/               # Seed data (roles, defaults)
│   ├── modules/                # FG-aligned feature modules (see below)
│   ├── jobs/                   # Worker processes (clearing scheduler, email/push)
│   └── infrastructure/         # Adapters: email, geolocation, push, storage, signing client
├── test/
│   ├── unit/                   # Domain/use-case unit tests (optional colocation per module)
│   ├── integration/            # DB + app integration tests
│   └── e2e/                    # Supertest end-to-end flows
├── openapi/                    # Generated OpenAPI spec output
├── .env.example
└── tsconfig.json
```

### 2.1 Feature modules (`src/modules/`) - mirror FG-* and ARCHITECTURE §4.2

```text
src/modules/
├── auth/          # FEAT-002, 009       (FG-PLATFORM / FG-MEMBERS)
├── members/       # FEAT-007..013       (FG-MEMBERS)
├── geolocation/   # FEAT-014..018       (FG-PROGRAMS)
├── referral/      # FEAT-019..023       (FG-REF)
├── catalog/       # FEAT-024..026       (FG-CATALOG)
├── sales/         # FEAT-027..032       (FG-SALES)
├── commission/    # FEAT-033..041       (FG-COMMISSION)
├── ewallet/       # FEAT-042, 043, 071  (FG-EWALLET)
├── payout/        # FEAT-044..047       (FG-PAYOUT)
├── withdrawal/    # FEAT-048..051       (FG-WDR)
├── voucher/       # FEAT-052..058       (FG-VOUCHER)
├── signing/       # FEAT-059            (FG-SECURITY) - client to CTO service
├── content/       # FEAT-060..063       (FG-CONTENT)
├── reporting/     # FEAT-064..067       (FG-REPORTING)
├── programs/      # FEAT-068, 069       (FG-PROGRAMS)
├── config/        # FEAT-005            (FG-CONFIG) - dynamic business parameters (BR-CFG-001)
└── audit/         # FEAT-004            (FG-PLATFORM)
```

### 2.2 Per-module layout (hexagonal - ARCHITECTURE §2.2)

```text
sales/
├── sales.module.ts
├── controllers/        # presentation
│   └── sales.controller.ts
├── dto/                # request/response validation (Zod)
├── application/        # use cases / orchestration + transaction boundaries
│   └── submit-sale.usecase.ts
├── domain/             # entities, value objects, business rules
│   ├── sale.entity.ts
│   └── qualifying-sale.rules.ts
├── repository/         # persistence (only layer that touches DB)
│   └── sale.repository.ts
└── test/
    ├── domain/         # pure domain tests (Vitest)
    └── application/    # use-case tests with mocked adapters
```

**Rules:**
- Controllers contain **no business logic**.
- Domain files depend on nothing framework/DB-specific.
- Repositories are the only DB access point within a module.
- Modules never import another module's repository or domain internals - only its application services/contracts (ARCHITECTURE §6).

---

## 3. Frontend Structure (`apps/web`, `apps/admin`, `apps/merchant`)

All three share the same layout (differences noted):

```text
apps/web/
├── src/
│   ├── main.tsx
│   ├── app/                 # routing (React Router)
│   ├── features/            # feature-scoped modules (FG-aligned)
│   │   ├── auth/
│   │   ├── members/
│   │   ├── referral/
│   │   ├── sales/
│   │   ├── wallet/
│   │   ├── withdrawal/
│   │   ├── voucher/
│   │   ├── reporting/
│   │   └── ...
│   ├── components/          # shared UI primitives
│   ├── hooks/               # shared hooks
│   ├── lib/                 # api client, auth context, query client
│   ├── styles/
│   └── types/               # re-exported from packages/contracts
├── test/                    # component + Playwright e2e
└── vite.config.ts
```

- `apps/admin` additionally contains `features/` for staff modules: `verification`, `catalog`, `sales-approval`, `payout-verification`, `exceptions`, `config`, `content`, `reporting`, `audit`.
- `apps/merchant` contains `features/voucher-redemption` only.

---

## 4. Shared Packages

```text
packages/contracts/
├── src/
│   ├── api/                 # request/response DTO types
│   ├── schemas/             # Zod schemas (single validation source)
│   ├── enums/               # statuses: Member, Sale, Commission, Withdrawal, Voucher, PayoutAccount
│   └── errors/              # error codes shared with API envelope
packages/config/
└── src/                     # env schema (Zod), typed runtime config
packages/shared/
└── src/                     # money math (exact decimal), invariants (BI-*) helpers, id/slug utils
```

**Rules:**
- `packages/contracts` is the only place request/response shapes and status enums are defined (prevents API drift).
- `packages/shared` must remain framework-free.
- Status enums mirror BUSINESS-RULES.md §5 state models exactly.

---

## 5. Infrastructure (`infra/`)

```text
infra/
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   ├── admin.Dockerfile
│   ├── merchant.Dockerfile
│   └── worker.Dockerfile
├── docker-compose.yml        # local dev: api, db (postgres), worker, web, admin, merchant
└── ci/                       # CI/CD pipeline definitions (provider OPEN - ARCH-DEC-008)
```

---

## 6. Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files | kebab-case | `submit-sale.usecase.ts` |
| Classes | PascalCase | `SubmitSaleUseCase`, `SaleController` |
| Module folders | singular feature name | `sales/`, `ewallet/` |
| DTO files | `<name>.dto.ts` | `sale.dto.ts` |
| Use cases | `<verb>-<noun>.usecase.ts` | `approve-sale.usecase.ts` |
| Repositories | `<name>.repository.ts` | `sale.repository.ts` |
| Tests | `<target>.spec.ts` (colocated or in `test/`) | `sale.repository.spec.ts` |
| REST endpoints | kebab-case plural nouns | `/api/v1/payout-accounts` |
| DB tables | snake_case plural | `available_balance`, `voucher_redemptions` |
| Env vars | `UPPER_SNAKE_CASE` | `DATABASE_URL` |

---

## 7. Configuration Locations

- Environment templates: `.env.example` at each app root + root. **Secrets never committed** (NFR-SEC-001, security-by-design).
- Runtime env schema: `packages/config/src`.
- Business parameters (BR-CFG-001): stored in DB via `config` module - **not** in env/code.
- Deployment/CI config: `infra/`.

---

## 8. Documentation Locations

- SSOT documents (existing, unchanged): `docs/requirements/`, `docs/business/`, `docs/features/`, `docs/roadmap/`, `docs/architecture/` (this set).
- API docs: generated OpenAPI at `apps/api/openapi/`; conventions in `docs/architecture/API-SPECIFICATION.md`.
- Architecture decisions: `docs/architecture/ARCHITECTURE.md` §16 (open decision register).

---

## 9. Rules Against Inappropriate Structures

1. **No business logic in controllers or React components.**
2. **No cross-module repository/domain imports** in `apps/api` - modules communicate via application services/contracts.
3. **No financial table UPDATE/DELETE** - ledger/commission data is append-only (BI-005); enforced by module rules and DB roles.
4. **No secrets, credentials, or `.env` files committed.**
5. **No framework-dependent code in `packages/shared` or domain layers.**
6. **No duplicate DTO/status definitions** - everything shared lives in `packages/contracts`.
7. **No speculative folders** (e.g., no `microservices/`, no separate app for functionality that belongs in an existing module).
8. **Status enums must match BUSINESS-RULES.md §5** - no invented states.

---

## 10. Structure ↔ Architecture Consistency

| Architecture element | Folder mapping |
|---|---|
| Modular monolith backend | `apps/api/src/modules/*` (one per FG-*) |
| Hexagonal layering | `controllers / application / domain / repository` per module |
| Contracts & DTOs | `packages/contracts` |
| Integrations (email/geo/push/signing) | `apps/api/src/infrastructure/*` |
| Worker (clearing scheduler) | `apps/api/src/jobs/*` + `infra/docker/worker.Dockerfile` |
| Three frontends | `apps/web`, `apps/admin`, `apps/merchant` |
| Documentation SSOT | `docs/*` (existing) |