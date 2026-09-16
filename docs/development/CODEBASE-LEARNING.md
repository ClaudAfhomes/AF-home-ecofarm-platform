# CODEBASE LEARNING REPORT - JAD Realty Platform

> **Generated:** 2026-09-01 - Build Mode, investigation-only
> **Status:** READ-ONLY investigation; no source modifications except this file
> **Workspace:** `C:/Users/SSD-ORLANDO/Documents/Project/jad-realty` - pnpm 11.22.0 + Turborepo 2.10.11, Node >=20.19.0
> **Git history/status:** `UNKNOWN` - repository metadata unavailable (no `.git` directory; `git status` returns `fatal: not a git repository`)

---

## 1. Executive Summary

**Actual stack (verified):** React 19.2.8 + Vite 8.2.1 SPAs (`apps/web` :5173, `apps/admin` :5174) → TanStack Query 5.101.4 → Vercel Functions REST `api/v1/cms/*` (3 handlers) → Supabase Postgres 15+ (via `supabase/migrations`) → Supabase Auth PKCE `cookieStorage` cross-port → Zod 4.4.3 validation → Vitest 4.1.11 / jsdom → pnpm workspaces + Turborepo. Shared types in `@jad/contracts` (single source), env via `@jad/config` (`loadPublicEnv`), exact-decimal money via `@jad/shared` (BigInt, no floats), mock server via `@jad/mock`, design tokens via `@jad/ui`.

**Architecture (implemented):** Modular Vercel Functions (Q1 `ADR-002b` supersedes NestJS) sharing one Supabase `public` schema ACID boundary; stateless handlers `api/v1/cms/[key].ts`, `upload.ts`, `upload/sign.ts` with CORS, Zod, `verifyAdmin` via anon JWT + `MemberRole→Role` + service_role. Frontends are SPAs with `QueryClientProvider` + `SessionProvider` + `BrowserRouter`; public CMS reads fallback to static `features/public/content/*` when API unavailable; admin edits broadcast via Supabase Realtime `cms:public` → `queryClient.invalidateQueries(['cms',key])`.

**Maturity:** Public website + authentication shell + CMS content management are **functional** (8 CMS keys, Storage `marketing-tools`). Member wallet/ledger/sales/payouts/withdrawals/commissions/referrals/genealogy/vouchers and admin queues are **UI shell + mock-driven** (`apps/web/src/mock/handlers.ts:1263` intercepts `fetch` in DEV, `apps/admin/src/mock/handlers.ts:239` for admin). No database-backed financial ledger, no commission engine, no voucher signing service, no payment execution, no Group Incentive.

**Major limitations:**
* `API-SPECIFICATION.md` specifies 89 endpoints; **3 implemented** (CMS only) - `SPECIFIED vs IMPLEMENTED` gap.
* `DATABASE-DESIGN.md` proposes 33 entities; **4 tables actually migrated** (`Member`, `Role`, `MemberRole`, `cms_contents`).
* Financial invariants `BI-001..010` not enforced at DB layer beyond RLS; correctness depends on mock store.
* No CI/CD, no prod infra, no staging/prod DB, no rate limiting, no idempotency, no audit table.
* `SECURITY.md` still claims HttpOnly session `ARCH-DEC-007` while impl uses Supabase JWT - `INCONSISTENT`.
* `pnpm typecheck` passes (8/8 workspaces green) and `pnpm test` passes (61 suites web + 27 admin + packages, 292+209 tests) - verified 2026-09-01.

**Distinction:** `IMPLEMENTED` = verified in source/migrations/handlers; `DOCUMENTED/PLANNED` = SSOT requirement with no impl (e.g., FEAT-033..071 financial modules, TECH-STACK §14 `REQUIRES VERIFICATION` versions).

---

## 2. Repository Structure

```
jad-realty/  (root: package.json:26, pnpm-workspace.yaml:25, turbo.json:18, tsconfig.base.json:24, vercel.json:17)
├── api/                          # Vercel Functions primary (vercel.json functions)
│   ├── dev-server.ts:198         # Local :3000 Node http server reusing handlers
│   ├── package.json:10           # deps @jad/contracts, @supabase/supabase-js, zod
│   └── v1/cms/[key].ts:368, upload.ts:172, upload/sign.ts:190
├── apps/
│   ├── web/   :5173  @jad/web    # Member public site + auth + member area
│   │   ├── package.json:46  scripts dev/vite, build/tsc+vite, lint/eslint, typecheck, test/vitest
│   │   ├── vite.config.ts:31  alias @=>./src, proxy /api→http://localhost:3000, jsdom, setupFiles
│   │   ├── tsconfig.json  extends ../../tsconfig.base.json, paths @/*=>src/*
│   │   ├── index.html  title JA&D Realty, theme #2c6aa7
│   │   ├── .env.example:25
│   │   └── src/ (see §6)
│   ├── admin/ :5174  @jad/admin  # Admin panel (dashboard, registrations, CMS, etc.)
│   │   ├── package.json (identical deps/scripts to web)
│   │   ├── vite.config.ts  port 5174, same proxy/test
│   │   └── src/ (see §6)
│   ├── api/   @jad/api           # DUPLICATE of api/ for Turborepo workspace apps/*
│   │   ├── package.json:14  deps @supabase ^2.39.0, zod ^3.23.8, typecheck echo skipped
│   │   └── api/v1/cms/[key].ts, upload.ts, upload/sign.ts  (identical copies)
│   └── assets/JA&D-logo.png
├── packages/
│   ├── config/  @jad/config  src/env.ts:30 loadPublicEnv, env.spec.ts
│   ├── contracts/ @jad/contracts  src/index.ts:230 + schemas/* (20 files) + seeds/cms.ts:916
│   ├── shared/  @jad/shared  src/money.ts:97 (BigInt exact-decimal)
│   ├── mock/    @jad/mock    src/server/mockServer.ts:179, session/*, mock-users.ts
│   └── ui/      @jad/ui      src/styles/tokens.css:141, base.css, components/* (20), hooks/*
├── supabase/
│   ├── migrations/  20260829_auth_foundation.sql:81, 20260830_cms_contents.sql:42, 20260831_cms_realtime.sql:14
│   ├── seed.ts:286  auth users + roles + members + 8 CMS contents
│   └── README.md:55
├── docs/  SSOT (.prettierignore excludes docs/ from formatting)
│   ├── architecture/  API-SPECIFICATION.md, ARCHITECTURE.md, BACKEND-ARCHITECTURE.md:492, FRONTEND-ARCHITECTURE.md:207, FOLDER-STRUCTURE.md, TECH-STACK.md, INTEGRATION-SPECIFICATION.md:208, MOBILE-ARCHITECTURE.md:639
│   ├── business/BUSINESS-RULES.md, requirements/REQUIREMENTS.md, features/FEATURES.md, roadmap/ROADMAP.md
│   ├── database/DATABASE-DESIGN.md, security/SECURITY.md:394, testing/TESTING.md:480, deployment/DEPLOYMENT.md:436
│   ├── development/DEVELOPMENT-GUIDELINES.md:284, CODE-REVIEW-GUIDELINES.md:256, decisions/ADR-001..012
│   └── ui-ux/DESIGN-SYSTEM.md, UI-UX.md, reports/F2-*
├── vercel.json:17  build pnpm run build, output apps/web/dist, functions includeFiles packages/**
└── pnpm-lock.yaml, .prettierignore, AGENTS.md, README.md
```

**Why duplicate `api/` and `apps/api/`:** `vercel.json` references `api/v1/cms/*` at repo root (Vercel Functions convention). `apps/api` is a Turborepo workspace alias so `pnpm --filter` and `turbo` treat the API as a workspace under `apps/*` (`pnpm-workspace.yaml` packages `apps/*` + `api`). File contents are **identical** (`diff` of `[key].ts`, `upload.ts`, `upload/sign.ts` shows byte-identical handlers; differing only `package.json` dependency versions). `api/dev-server.ts:41` imports `./v1/cms/[key].js` from the root `api/` tree, not `apps/api`. Risk: drift if one copy edited without the other - no sync mechanism.

---

## 3. Technology Stack Actually Used

| Technology | Documented | Actually Used | Status | Evidence |
|---|---|---|---|---|
| Language | TypeScript full-stack CONFIRMED | TypeScript 5.9.3 `strict:true` `noUnusedLocals` `verbatimModuleSyntax` | **IMPLEMENTED** | `tsconfig.base.json:24` target ES2022, `apps/web/package.json` typescript ~5.9.3 |
| Backend runtime | Node LTS on Vercel CONFIRMED Q1 | Node >=20.19.0 required | **IMPLEMENTED** | `package.json:26` engines node >=20.19.0 |
| Backend framework | NestJS `ADR-002` superseded by Vercel Functions `ADR-002b` CONFIRMED Q1 | Vercel Functions `/api/v1` (3 handlers), no NestJS, no Express | **IMPLEMENTED** (supersession verified) | `api/v1/cms/[key].ts:368`, `apps/api/api/v1/cms/[key].ts` identical, `vercel.json:17` |
| Frontend member | React + Vite SPA CONFIRMED | React 19.2.8 + Vite 8.2.1 SPA | **IMPLEMENTED** | `apps/web/package.json:46` react ^19.2.8, vite ^8.2.1, `vite.config.ts:31` |
| Frontend admin | React + Vite SPA (Admin) CONFIRMED | React 19.2.8 + Vite 8.2.1 SPA port 5174 | **IMPLEMENTED** | `apps/admin/package.json` identical, `apps/admin/vite.config.ts` port 5174 |
| Mobile | Responsive web first CONFIRMED `ARCH-DEC-005`; RN PROPOSED `ARCH-DEC-006` | No RN app; responsive web only | **IMPLEMENTED** as documented | `apps/web/src/app/PublicLayout.module.css`, `MOBILE-ARCHITECTURE.md:639` Part A web-first CONFIRMED |
| Database | PostgreSQL via Supabase CONFIRMED | Supabase Postgres 15+ (3 migrations) | **IMPLEMENTED** | `supabase/migrations/20260829_auth_foundation.sql:81` pgcrypto, RLS |
| Data access | Supabase JS + RLS CONFIRMED; Drizzle PROPOSED | Supabase JS 2.112.4; no Drizzle | **IMPLEMENTED** (Supabase) / **NOT IMPLEMENTED** (Drizzle) | `api/package.json:10` @supabase/supabase-js ^2.112.4, `apps/web/src/lib/supabase.ts:112` |
| Validation | Zod PROPOSED REQUIRES APPROVAL | Zod 4.4.3 implemented everywhere | **IMPLEMENTED** (de facto approved) | `packages/contracts/src/schemas/cms.ts:812` Zod schemas, `api/v1/cms/[key].ts` safeParse |
| State | TanStack Query + Zustand PROPOSED | TanStack Query 5.101.4 implemented; Zustand not used (no global store) | **PARTIALLY IMPLEMENTED** | `apps/web/src/lib/query.ts:19` QueryClient, `package.json` @tanstack/react-query ^5.101.4 |
| API | REST JSON `/api/v1` PROPOSED | `/api/v1/cms/*` implemented; 86 other spec endpoints missing | **PARTIALLY IMPLEMENTED** | `API-SPECIFICATION.md:430` 89 endpoints vs `api/v1/cms/*` 3 handlers |
| Auth | Supabase Auth JWT PKCE CONFIRMED Q1/Q3 | `supabase.auth.signInWithPassword` + `cookieStorage` cross-port | **IMPLEMENTED** | `apps/web/src/lib/supabase.ts:112` cookieStorage, `session.tsx:312` SupabaseSessionProvider |
| Session store | HttpOnly Secure SameSite DB-backed PROPOSED (old ARCH-DEC-007) | Supabase Auth session (no DB `sessions` table) - superseded | **INCONSISTENT** (doc stale) | `SECURITY.md:32` claims HttpOnly DB session vs `supabase.ts:112` PKCE |
| Testing | Vitest + Playwright PROPOSED | Vitest 4.1.11 jsdom (61 web suites + 27 admin + 3 package suites) - Playwright not configured | **PARTIALLY IMPLEMENTED** | `apps/web/vite.config.ts:31` test jsdom, `pnpm test` 292 web tests pass |
| Build/monorepo | pnpm workspaces + Turborepo PROPOSED | pnpm 11.22.0 + Turborepo 2.10.11 implemented | **IMPLEMENTED** | `pnpm-workspace.yaml:25`, `turbo.json:18` |
| Deployment | Vercel + Supabase PROPOSED Q1 REQUIRES APPROVAL | Vercel config present; no prod deploy, no provider region approved | **PARTIALLY IMPLEMENTED** (config only) | `vercel.json:17` build pnpm run build, output apps/web/dist |
| Signing | External CTO KMS/HSM REQUIRES APPROVAL (CTO) | No signing service; voucher signing not implemented | **NOT IMPLEMENTED** (boundary deferred) | `DATABASE-DESIGN.md:6` BI-008 no finance tables mutated Phase 1 |

---

## 4. Application Architecture

**Runtime (verified):**
```
[Browser :5173 web / :5174 admin]
  → React 19 Vite SPA
    → SupabaseSessionProvider (auth) + QueryClientProvider (cache) + BrowserRouter
      → Feature slices (public/auth/member/admin)
        → Hooks (TanStack Query wrapping lib/api/client)
          → lib/api/client.ts:115 request/requestList → fetch /api/v1/*
            → Vite proxy /api→http://localhost:3000 (apps/web/vite.config.ts:31)
              → api/dev-server.ts:198 Node http server (or Vercel Edge in prod)
                → Vercel Function handler api/v1/cms/[key].ts:368
                  → getSupabaseEnv() (VITE_SUPABASE_URL derivation + SERVICE_ROLE_KEY)
                  → verifyAdmin() (anon auth.getUser + MemberRole→Role fallback) for PUT/upload
                  → Zod (@jad/contracts cms.ts:812) validation
                  → supabase.from('cms_contents').select/upsert (RLS, service_role)
                  → broadcast cms:public + postgres_changes → client cmsRealtime.ts:97 invalidateQueries(['cms',key])
                → Supabase Postgres 15+ (RLS cms_contents_read_all anon/authenticated, service_all) + Storage marketing-tools + Realtime publication
```

**Layers per function (BACKEND-ARCHITECTURE.md §1.3 as implemented narrowly):**
*Handler* (`api/v1/cms/[key].ts`) handles CORS, error envelope, env resolution, admin verification, Zod - **no domain/ledger logic** (only CMS). *Application/domain* layers for financial modules not present (no `apps/api/src/modules/*` - folder absent). *Persistence* is Supabase client directly in handler (no repository abstraction beyond handler). *Infrastructure* is Supabase adapter only; email/geolocation/push/signing adapters absent.

**Key traces:**
* `apps/web/src/main.tsx:42` - mounts `SessionProvider` → `QueryClientProvider` → `BrowserRouter` → `App`; installs `createMemberMockServer().install()` in DEV.
* `apps/web/src/app/App.tsx:337` - `useCmsRealtime()` global, `ErrorBoundary` + `ScrollToTop`, routes `PublicLayout` ( `/`, `/about`, `/properties`, `/:categorySlug`, `/:propertySlug`, `/faqs`, `/contact`, `/login`, `/register`, `/verify-email`, `/register/status`) + `MemberLayout` guarded `RequireMember`/`RequireQualifiedMember` (`/member/*`) + `AdminRedirect` (`/admin→VITE_ADMIN_URL`).
* `apps/web/src/lib/cms.ts:205` - `getHomepageCms()` etc. try `request('/cms/homepage', homepageContentSchema)` else fallback `HOME` static (`features/public/content/home.ts:136`).
* `apps/web/src/lib/cmsRealtime.ts:97` - `supabase.channel('cms:public',{broadcast:{ack:false}}).on('broadcast',cms_update→invalidate) + on('postgres_changes', cms_contents→invalidate)`.

---

## 5. Package Architecture

| Package | Name | Exports | Purpose | Evidence |
|---|---|---|---|---|
| `packages/contracts` | `@jad/contracts` | `./src/index.ts` raw TS (no build) | **SSOT DTOs + Zod + seeds** - 20 schemas (`cms:812`, `error`, `member`, `auth`, `money`, `collection/listResponseSchema`, `role normalizeRole`, `ewallet`, `sales`, `payout`, `withdrawal`, `referral`, `voucher`, etc.) + `seeds/cms.ts:916` 8 CMS seeds | `packages/contracts/src/index.ts:230` re-exports, `src/schemas/cms.ts:812` cmsCtaLinkSchema exactly one `to` or `href`, `src/seeds/cms.ts` CMS_HOMEPAGE_SEED etc. |
| `packages/config` | `@jad/config` | `./src/index.ts` | Typed env `vitePublicEnvSchema` (`VITE_API_BASE_URL default /api/v1`, `VITE_ADMIN_URL`, `VITE_WEB_URL`, `VITE_SUPABASE_URL?`, `VITE_SUPABASE_ANON_KEY?`) + `loadPublicEnv(env)` | `packages/config/src/env.ts:30` Zod parse, `apps/web/src/lib/env.ts:7` loadPublicEnv(import.meta.env) |
| `packages/shared` | `@jad/shared` | `./src/index.ts` | **Framework-free** money `isExactDecimal, formatMoney (Intl.NumberFormat en-PH PHP), compareMoney, addMoney, subtractMoney` via BigInt cents | `packages/shared/src/money.ts:97` toCents BigInt, money.spec.ts:9 tests |
| `packages/mock` | `@jad/mock` | `./src/index.ts` | Mock session + fetch stub `MockServer` suffix/prefix matching, `createMockServer`, `MockSessionProvider`, `MOCK_USERS`, admin/finance/super_admin | `packages/mock/src/server/mockServer.ts:179` endsWith path, `session/MockSessionProvider.tsx:8` |
| `packages/ui` | `@jad/ui` | `./src/index.ts` + `tokens.css` `base.css` | Shared design system primitives `AppShell, Sidebar, Topbar, MobileDrawer, BottomNav, Breadcrumbs, Tabs, Table, StatusChip, Pagination, Dialog, ConfirmDialog, Toast, Skeleton, EmptyState, ErrorState, Forbidden, NotFound, PageHeader, DetailGrid` + hooks `useDisclosure, useMediaQuery, useDialogShell` | `packages/ui/src/index.ts:66`, `src/styles/tokens.css:141` :root brand #2c6aa7 |

**Workspace consumption:** `pnpm-workspace.yaml:25` packages `apps/*`, `packages/*`, `api`; `turbo.json:18` build dependsOn ^build, dev persistent no-cache; packages export raw TS so consuming app `tsc --noEmit` (Vite) compiles them incrementally - edit package → immediate effect, no build step.

---

## 6. Frontend Architecture

### Bootstrap & Providers
* `apps/web/src/main.tsx:42` - `history.scrollRestoration='manual'`, DEV `createMemberMockServer().install()`, tree `<StrictMode><SessionProvider><QueryClientProvider><BrowserRouter><App/></></></>`.
* `apps/web/src/lib/query.ts:19` - singleton `QueryClient({queries:{retry:1, refetchOnWindowFocus:false, staleTime:30000}, mutations:{retry:false}})`.
* `apps/web/vite.config.ts:31` - alias `@=>./src`, `server.port 5173`, `proxy /api→http://localhost:3000 changeOrigin`, `test.environment jsdom`, `setupFiles ./src/test/setup.ts`.

### Routing
* `apps/web/src/app/App.tsx:337` - defines all routes (see §4). `apps/admin/src/app/App.tsx:254` - `RequireRole` wraps `AdminLayout` for `/admin`, `/admin/registrations/:id`, `/admin/members`, `/admin/sales/:id`, `/admin/cms/*` → redirect to `homepage`, etc.
* Guards: `apps/web/src/features/member/guards/RequireMember.tsx:41` redirects unauthenticated → `/login` state from; `RequireQualifiedMember` renders `SKELETON` or `Forbidden` if `!APPROVED_ACTIVE||!isQualified`; `apps/web/src/features/auth/guards/RequireRole.tsx` (auth) + `apps/admin/src/app/RequireRole.tsx:66` checks `canAccess(role,item)` via `navigation.ts`.
* `apps/web/src/app/ScrollToTop.tsx:22` layoutEffect scroll top on pathname (hash bypass), `ErrorBoundary.tsx:51` class catches render, `PublicLayout.tsx:42` skip-link + `Header` + `#main` + `Footer` + `MessengerButton` (hideOnAuth via `globalCms.messenger.hideOnAuth`).

### Layouts
* `apps/web/src/app/PublicLayout.tsx:42` - `useQuery(['cms','global'], getGlobalCmsPublic, staleTime0)` hide messenger on auth paths, shell gradient header `Header.module.css:55` `.solid rgba(20,43,71,0.92)`.
* `apps/web/src/features/member/layouts/MemberLayout.tsx:92` - `AppShell` + `Sidebar` + `BottomNav` + `NotificationBell` + breadcrumbs via `findMemberNavItem`.
* `apps/admin/src/app/AdminLayout.tsx` - similar AppShell with role-filtered nav `navItemsForRole`.

### State Management
* Only `SessionContext` (auth) + TanStack Query cache; no Redux/Zustand for domain. `apps/web/src/lib/session.tsx:312` defines `SessionProvider` branching: `MODE==='test'→MockSessionProvider`, `isSupabaseConfigured()→SupabaseSessionProvider`, `DEV→MockSessionProvider`, else `Unauthenticated`.
* **Query patterns:** Public CMS `useQuery(['cms',key], getXCms, staleTime:0, refetchOnMount:'always')` + `useCmsRealtime` invalidate; referential `['programs']` `['policies']` staleTime 30s retry1; Member `['me','wallet']`, `['me','ledger',cursor]`, `['me','commissions']` etc. via `features/member/services/member.ts:253` + `requestList/requestPage` (cursor `meta.pagination.nextCursor`).

### API Client
* `apps/web/src/lib/api/client.ts:115` - `rawRequest(path,init)` prefixes `env.VITE_API_BASE_URL`, JSON `Accept/Content-Type`, `credentials same-origin`, throws `ApiNetworkError` on fetch failure; `parseBody` text→JSON; `request<T>(path,schema:init)` throws `toApiError` if !ok else `schema.safeParse`→`ApiParseError`; `requestList` via `listResponseSchema(itemSchema)`; `requestPage` extracts `nextCursor`; no ad-hoc `fetch` elsewhere.
* `apps/web/src/lib/api/errors.ts:80` - `ApiError(code,status,requestId,details)`, `ApiParseError`, `ApiNetworkError`, `toApiError`; `errorMessage.ts:10` `apiErrorMessage(error,fallback)`.

### Validation (Zod)
* `packages/contracts/src/schemas/cms.ts:812` enforces `cmsPhotoSchema id 1-500 alt 1-120`, `cmsCtaLinkSchema label 1-40 exactly one to (/…) or href (https) reject javascript/data`, `homepageContentSchema` 8 sections, `globalContentSchema nav 1-8`, etc. Other schemas `money.ts EXACT_DECIMAL_STRING_RE /^\d+(\.\d{1,2})?$/`, `member.ts status PENDING|APPROVED_ACTIVE|REJECTED`, `auth.ts login/register/verifyEmail`, `ewallet.ts` 9 ledger entry types. All HTTP validates via client.

### CMS Fallback & Realtime
* `apps/web/src/lib/cms.ts:205` - public fetchers `getHomepageCms() try request('/cms/homepage') catch => HOME` etc. for 8 keys; `Header`/`Footer`/`MessengerButton` use `global` via `SITE` fallback.
* `apps/web/src/lib/cmsRealtime.ts:97` - channel `cms:public` broadcast + `postgres_changes` table `cms_contents` → `invalidateQueries(['cms',key])` with fallback invalidate all 8; subscribe error log `CHANNEL_ERROR`.

### Styling
* Tokens SSOT `packages/ui/src/styles/tokens.css:141` `:root --color-brand-primary #2c6aa7`, `bg-canvas #fbfaf7`, spacing `--space-1 4px` scale, `container-max 1200px`, `header-height 68→70px`, `z-topbar 20 bottom-nav 50 drawer 60`; `base.css:85` box-sizing, focus-visible 3px `var(--color-state-focus)`, skip-link, prefers-reduced-motion. Duplicate in `apps/web/src/styles/tokens.css` identical (migration pending). Per-component CSS Modules (`Header.module.css:55`, `Hero.module.css`, `PropertyCard.module.css:75`, etc.) import as `styles` - no global classes except `.container`, `.prose`, `.skip-link`.

### Responsive & UI Components
* Reusable primitives: `apps/web/src/components/Button.tsx:45` variant primary/secondary/ghost loading 44px target, `ButtonLink`, `Alert`, `Card`, `EmptyState`, `Skeleton`, `ImageBlock` ratio, `SectionHeader`, `MessengerButton` (36 lines fetches `global.messenger` fallback `MESSENGER_URL https://m.me/JADRealtyServices`), `PublicNavLink`. Admin `packages/ui` adds `Table`, `Pagination`, `Dialog`, `ConfirmDialog`, `ToastProvider`, `StatusChip`, `Breadcrumbs`, `Tabs`.
* Breakpoints conceptual `bp-sm 640 bp-md 1024 bp-lg 1280` (`tokens.css:141`); components hide/show via `useMediaQuery`; tables collapse to cards on mobile (financial tables never horizontal scroll).

### Feature Slices
* `features/public` - content `types.ts:101`, `site.ts:39`, `images.ts:205 photoUrl unsplash`, `home.ts:136`, `properties.ts:414` `PROPERTY_CATEGORIES[3]` tenanted-condo-resales/income-generating/developer-brokerage + 11 records, hooks `usePrograms/Policies/PublicConfig`, pages `HomePage.tsx:250`, `AboutPage`, `PropertiesPage`, `CategoryPage`, `PropertyDetailPage.tsx:164` guards category+property match or NotFound, `FaqsPage`, `ContactPage`, `NotFoundPage`, components `Hero.tsx:85` variant home/page, `PropertyCard.tsx:75` price `formatMoney`, `PropertyGallery`, `FAQAccordion`.
* `features/auth` - `content.ts:210` AUTH, `validation.ts`, `services/auth.ts:74` wraps `request('/auth/login')` etc., `pages/LoginPage.tsx:312` CMS `login`, `trySupabaseLogin` via `supa.auth.signInWithPassword` else mock `login`, `RegisterPage`, `VerifyEmailPage`, `RegistrationStatusPage`, guards `RequireRole`.
* `features/member` - `services/member.ts:253` 18 wrappers (`getWallet`, `getLedgerPage` cursor, `submitSale` Idempotency-Key, etc.), `navigation.ts:100` `MEMBER_NAV_ITEMS[6]` primary Dashboard/Sales & Earnings/Referrals/Resources/Profile, `hooks/useMember`, pages 26 each `*.tsx/.module.css/.spec.tsx`.

---

## 7. Backend/API Architecture

**Only 3 handlers implemented** (confirmed via `vercel.json:17` functions + file inspection):

| Handler (identical in `api/` and `apps/api/api/`) | Route | Methods | Auth | Behavior |
|---|---|---|---|---|
| `api/v1/cms/[key].ts:368` | `GET /api/v1/cms/:key` `PUT /api/v1/cms/:key` | GET, PUT, OPTIONS + CORS | GET public; PUT `verifyAdmin` | `CMS_KEYS` 8 keys → Zod per key from contracts; GET `public.cms_contents select content,version` 404 envelope else `X-CMS-Version`; PUT parses JSON string, `schema.safeParse` 400 VALIDATION_ERROR issues, `upsert {key,content,version+1,updated_by,updated_at}` → broadcast `cms:public cms_update {key,version}` (non-blocking 1s) + orphan cleanup diff prevIds→ `storage.from('marketing-tools').remove(cms/*)` (excludes `photo-*`, `..`) |
| `api/v1/cms/upload.ts:172` | `POST /api/v1/cms/upload` | POST, OPTIONS | `verifyAdmin` | Validate `{name,type,data:base64}` strip `data:` prefix, mime `jpeg/png/webp` or ext jpg/jpeg/png/webp, ≤20MB, `safeName` sanitized, key `cms/${Date.now()}-${rand}-${safeName}`, `storage.upload(cms/key)` → 201 `{id:publicUrl, storageRef, publicUrl}` |
| `api/v1/cms/upload/sign.ts:190` | `POST /api/v1/cms/upload/sign` | POST, OPTIONS | `verifyAdmin` | Validate `{name,type,size}` same mime/ext + size>20MB guard, `storage.createSignedUploadUrl(key)` → `{signedUrl,token,path,key,publicUrl}` |

**Common boilerplate (all 3):**
* Types `VercelRequest` `{method, query, headers, body}` / `VercelResponse` chainable.
* CORS `Allow-Origin req.headers.origin ?? *` `Credentials true` `Allow-Methods` per verb `Allow-Headers Content-Type,Authorization,...` `OPTIONS 200`.
* Error envelope `toErrorEnvelope(code,message,status,details)` → `{error:{code,message,details,requestId:Date.now()-Math.random,timestamp:ISO}, status}` validated against `contracts/error` `apiErrorCodeSchema` 18 codes.
* Env `getSupabaseEnv()` resolves `SUPABASE_URL ?? VITE_SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL` fallback derive `https://${ref}.supabase.co` from `DATABASE_URL` hostname or hardcode `https://vudwoqduebdgtzvybywb.supabase.co` if `your-project`; `serviceKey=SUPABASE_SERVICE_ROLE_KEY`, `anonKey=SUPABASE_ANON_KEY ?? VITE_SUPABASE_ANON_KEY`.
* `verifyAdmin(req)` extracts `Bearer` or `sb-*-auth-token` cookie JSON `access_token`, `createClient(url,anonKey,{autoRefreshToken:false}).auth.getUser(token)` → userId, then service_role `MemberRole|member_roles|memberrole select roleId eq memberId` loop + `Role|roles|role select slug in ids` `normalizeRole slug==='admin'` else metadata fallback `user_metadata.role`.

**Dev server:** `api/dev-server.ts:198` Node `http.createServer :3000` (arg/port env) loads `.env` + `apps/*/ .env.local`, `toVercelHeaders` `parseBody` JSON try, routes `/api/v1/cms/:key`, `/api/v1/cms/upload`, `/api/v1/cms/upload/sign` also `/api/cms/*`, adapts `IncomingMessage→VercelReq`, `writeHead` json, verbose `[dev-server] METHOD pathname [key] -> status ms`.

**SPECIFIED vs IMPLEMENTED (API-SPECIFICATION.md §6 groups 6.1-6.16, 89 endpoints #1-89):**
* SPECIFIED 89 (`#1-83 PLANNED` + `#84-89 PROPOSED` gaps). IMPLEMENTED 3 (3.4%): only Content CMS group maps to spec `#?` CMS is not in spec inventory (spec lists `6.12 Content #66-73` media/policies/broadcasts - different). Auth `#1-6`, Members `#7-15`, Geolocation `#16-19`, Referral `#20-22`, Customers/Catalog `#23-29`, Sales `#30-38`, Commission `#39-42`, eWallet `#43-47`, Payout `#48-53`, Withdrawals `#54-59`, Vouchers `#60-65`, Reporting `#74-77`, Programs `#78-80`, Config `#81-83`, Proposed `#84-89` - **all NOT IMPLEMENTED** as Vercel handlers (only mocked via `mock/handlers.ts`).

---

## 8. Database Architecture

**Proposed (DATABASE-DESIGN.md §7): 33 entities E-01..E-33** (accounts, members, id_documents, qualification, email_verifications, sessions, geolocation_checks, location_exceptions, sponsor_change, customers, properties, sales, payment_records, commissions, ledger_entries, member_balances, financial_adjustments, payout_accounts, withdrawals, vouchers, voucher_redemptions, media_assets, policies, broadcasts, notifications, programs, config, gender_values, countries, idempotency_keys, audit_log).

**Actual migrations (3 files, idempotent):**
* `supabase/migrations/20260829000001_auth_foundation.sql:81` - `pgcrypto`, creates `Member(id uuid PK→auth.users(id) cascade, email unique, name, status default APPROVED_ACTIVE, isQualified bool default false, createdAt)` + `Role(id uuid gen_random_uuid PK, slug unique, name, description, createdAt)` seeded `admin/user` + `MemberRole(memberId→Member, roleId→Role, assignedAt, assignedBy, PK memberId+roleId idx roleId)`; RLS `Member member_own_row authenticated auth.uid()=id` + `member_service_role_all service_role true`; `MemberRole memberrole_own_row` + service_role; `Role role_read_authenticated select authenticated true` + service_role; comment leave CRM tables untouched.
* `supabase/migrations/20260830000001_cms_contents.sql:42` - `public.cms_contents(key text PK check 8 keys homepage/about/properties/faqs/contact/global/login/register, content jsonb, version int default1, updated_by uuid→Member set null, created_at, updated_at)` + trigger `cms_contents_set_updated_at` before update set `now()`; RLS `cms_contents_read_all anon,authenticated select true` + `cms_contents_service_all service_role all`.
* `supabase/migrations/20260831000002_cms_realtime.sql:14` - `alter publication supabase_realtime add table public.cms_contents` if missing.

**Relationships (actual):** `Member.id → auth.users.id` 1:1 auth; `MemberRole` N:M Member↔Role (PK composite); `cms_contents.updated_by → Member(id)` nullable FK; no FKs for customers/sales/ledger (tables absent).

**RLS summary (actual):** Auth `Member` own-row, `MemberRole` own-row, `Role` read authenticated; CMS `anon,authenticated` read all, writes only `service_role`. No RLS for proposed financial tables.

**Storage:** Supabase Storage bucket `marketing-tools` (public read, service_role write via `storage.from('marketing-tools')`; bucket created manually - not in migration; `supabase/README.md:55` notes bucket exists prior). Handlers use `service_role` `upload` `createSignedUploadUrl` `getPublicUrl` `remove` for `cms/*` orphan.

**Realtime:** Publication `supabase_realtime` includes `cms_contents` (`20260831`); handler broadcasts `cms:public cms_update` plus client subscribes to both `broadcast` and `postgres_changes INSERT/UPDATE (*,public,cms_contents)` with fallback invalidate all.

**Seed (`supabase/seed.ts:286`):** Loads `.env` + `apps/web/.env.local` + `apps/admin/.env.local`; derives `supabaseUrl` from `VITE_SUPABASE_URL/SUPABASE_URL` or `DATABASE_URL` host or hardcode `vudwoqduebdgtzvybywb`; requires `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_SEED_ADMIN_PASSWORD` + `SUPABASE_SEED_USER_PASSWORD` (never VITE). `createClient(serviceKey, autoRefreshToken:false)`; creates `auth.admin.createUser` `admin@jad.local`/`user@jad.local` `email_confirm:true user_metadata role`, updates password if exists; loops `tryUpsert('Role'|'roles'|'role')` then fetches `roleIdBySlug`; upserts `Member` via `'Member'` quoted payload `{id,email,name,status:APPROVED_ACTIVE,isQualified:true}` fallback `members|member` legacy 19-col; assigns `MemberRole` via `'MemberRole' memberId,roleId` onConflict `'"memberId","roleId"'` fallback `member_roles` `member_id,role_id`; imports `CMS_SEEDS` from `packages/contracts/src/seeds/cms` (8 keys `homepage about properties faqs contact global login register`) → `from('cms_contents').upsert({key,content,version:1,updated_by:adminId},onConflict:'key')`; exit 1 on role/member/cms failure. Run `pnpm seed`.

---

## 9. Authentication & Authorization

### Flow (implemented)
```
LoginPage.tsx:312 POST identifier+password
 → if MODE!=='test' && isSupabaseConfigured()
     supabase.auth.signInWithPassword({email:identifier,password})  [supabase.ts:112 PKCE cookieStorage]
     → anon auth.getUser(token) success?
     → try fetch Member|members eq id single → build {firstName/lastName|name, isQualified, status}
     → tryResolve('Role','MemberRole') → 'roles','member_roles' → 'role','memberrole'
         select roleId eq memberId → ids → select slug in ids → normalizeRole ==='admin'?'admin':'user'
     → fallback user_metadata.role ==='admin'?'admin':'user' (covers fresh DB without tables)
     → {id,name,email,role,isQualified,status} normalizeRole(SUPER_ADMIN→admin)
     → loginAs(next) → setUser, setStatus authenticated, setMockSessionUser sync mock
     → if role==='admin' window.location.href = ${VITE_ADMIN_URL|http://localhost:5174/admin}${from}
       else navigate(from∈/member|/user?from : '/member')
   else mock login({identifier,password}) → /auth/login handler.ts:374 alias username@gmail.com/Password→juan.delacruz, superadmin@gmail.com/P@ssword→MOCK_SUPER_ADMIN
   → catch apiErrorMessage(error,fallback) → Alert danger focus identifierRef/passwordRef

Session persistence:
 SupabaseSessionProvider useEffect getSession + onAuthStateChange (_event,session→buildSessionUser→setUser authenticated)
 cookieStorage {getItem,setItem,removeItem} document.cookie SameSite=Lax path=/ max-age 31536000 - fixes localhost 5173↔5174 localStorage isolation
 MODE==='test' uses MockSessionProvider+Bridge avoids real network; DEV fallback to Mock if VITE_SUPABASE_URL missing

Logout:
 getSupabaseClient().auth.signOut() → setUser null → setMockSessionUser(null)  [session.tsx:215 logout]

Route guards:
 RequireMember.tsx:41  if loading Skeleton*3; if unauthenticated Navigate /login state from; if normalizeRole(role)!=='user' → admin→Navigate /admin else <Forbidden/>
 RequireQualifiedMember.tsx  if status!=='APPROVED_ACTIVE'||!isQualified → qualification notice CTA
 RequireRole.tsx:66  if loading Skeleton; if !authenticated RedirectToWebLogin (window.location.href VITE_WEB_URL /login); if findNavItem && !canAccess(role,item)→<Forbidden/> else children
  navigation.ts:172 ADMIN_NAV_ITEMS roles ['admin'] only; canAccess(item.roles.includes(role))
```

### Evidence files
* `apps/web/src/lib/supabase.ts:112` `isSupabaseConfigured()`, `cookieStorage`, `getSupabaseClient` PKCE `persistSession,autoRefreshToken,detectSessionInUrl,flowType:'pkce',storage:DEV?cookieStorage`, `listMarketingToolsFromStorage`, `subscribeNotificationsRealtime` channel `notifications:${memberId}` `postgres_changes Notification memberId=eq`.
* `apps/web/src/lib/session.tsx:312` + `apps/admin/src/lib/session.tsx:298` identical branching; `resolveRole` loops 3 table name variants, `buildSessionUser` handles `name` vs `firstName/lastName`.
* `packages/contracts/src/schemas/role.ts` `normalizeRole` lower + `[-_\s]`→`_` `admin|super_admin|superadmin→admin` `user|member|…→user`.
* `apps/web/src/features/auth/pages/LoginPage.tsx:312` `CMS login` fallback `AUTH.login`, `validateLogin` focus refs.
* `apps/web/src/features/member/guards/RequireMember.tsx:41`, `RequireQualifiedMember.tsx`, `apps/admin/src/app/RequireRole.tsx:66`.

### Discrepancies
| Doc claim | Actual | Status |
|---|---|---|
| `SECURITY.md:32` HttpOnly Secure SameSite DB-backed session via `POST /auth/login/logout/refresh` per `ARCH-DEC-007` | Supabase JWT Bearer/cookie `auth.getUser` verified server-side per Q3, no DB `sessions` table, no `/auth/refresh` | **INCONSISTENT** - stale SSOT (§2 Authentication) not updated for Q1/Q3 |
| `BACKBEND-ARCHITECTURE.md §8` `BACKEND §8` `MOBILE-ARCHITECTURE.md §8` session token hash in `sessions` table | No `sessions` table migrated; `supabase/migrations` contain no `sessions` | **NOT IMPLEMENTED** (deferred) |
| `ARCHITECTURE.md ARCH-DEC-007` session auth CONFIRMED | ADR-002b Q1 notes Supabase JWT supersedes ARCH-DEC-007 | **PARTIALLY DOCUMENTED** - update exists but not propagated to all docs |
| `SECURITY.md §10` CSRF double-submit for cookie requests | No CSRF guard in handlers (JWT Header needs none) | **PARTIALLY** - JWT header avoids need but handler still accepts cookie `sb-*-auth-token` without CSRF |
| `API-SPECIFICATION.md §2.1` `SYS` internal service identity | No service-to-service token handling; seed uses service_role but no `SYS` guard | **NOT IMPLEMENTED** |

---

## 10. Major Feature Map

| Feature | Documented | Implemented | Backed by DB | Status | Evidence |
|---|---|---|---|---|---|
| Public website (Home/About/Properties/Category/Detail/FAQs/Contact/NotFound) | FEATURES FEAT-060..063 P9, UI-UX SCR-* | **Yes** complete with CMS fallback + tests | **PARTIALLY** `cms_contents` for editable copy, static `features/public/content/*` fallback | **IMPLEMENTED** | `apps/web/src/features/public/pages/HomePage.tsx:250` + `PropertiesPage`, `CategoryPage`, `PropertyDetailPage.tsx:164` + `HomePage.spec.tsx:4260` etc. |
| Auth: Login | FR-AUTH, FEAT-002 | **Yes** Supabase + mock alias | **Yes** `Member` + `auth.users` | **IMPLEMENTED** | `LoginPage.tsx:312` trySupabaseLogin, `lib/supabase.ts:112` |
| Auth: Register / Verify Email / Status | FEAT-007..009 | **Yes** pages exist; POST via mock handlers | **No** (mock store only, not DB) | **PARTIALLY IMPLEMENTED** UI+mock | `RegisterPage.tsx`, `VerifyEmailPage.tsx`, `handlers.ts:450 /auth/register verify-email` |
| CMS content editing (8 keys) | Q2 single table, Q4 hybrid images, Q5 version, Q6 fallback | **Yes** 3 handlers + admin CMS UI 8 pages + realtime | **Yes** `cms_contents` + `marketing-tools` bucket | **IMPLEMENTED** | `api/v1/cms/[key].ts:368`, `supabase/seed.ts:286` 8 seeds, `apps/admin/src/features/cms/pages/CmsHomepagePage.tsx` etc. |
| Member Dashboard / Profile / QualificationStatus | FEAT-007..013 | **Yes** pages + services `member.ts:253` | **No** (mock `MockMember`) | **IMPLEMENTED (mock-driven)** | `DashboardPage.spec`, `ProfilePage`, `QualificationStatusPage` |
| Referral: code, direct-referrals, genealogy, group-network, total-earned | FR-REF/BUSINESS-RULES BR-REF single-level; FEAT-019..023 | **Yes** UI + mock projection | **No** (mock `sponsorId` graph) | **IMPLEMENTED (mock-driven)** UI only | `ReferralCodePage`, `DirectReferralsPage`, `MyGenealogyPage.tsx buildGenealogyNode` `handlers.ts:245 toDirectReferral`, `GroupNetworkPage` |
| Catalog: property listings | FEAT-024..026 | **Yes** static `PROPERTY_RECORDS` 11 | **No** (static) | **IMPLEMENTED (static)** | `properties.ts:414` 3 categories, `handlers.ts:554 /properties` list |
| Customers (AQ record) | FEAT-024 | **Yes** mock CRUD | **No** (mock `MockCustomer`) | **PARTIALLY** mock API only | `handlers.ts:1079 /customers GET/POST`, `member.ts getCustomers` |
| Sales: submit / list / detail / resubmit / reopen-request | FEAT-027..032 FR-SAL | **Yes** mock with Idempotency-Key, MAX_SALE_RESUBMISSIONS 3, status LOCKED | **No** (mock `MockSale`) | **IMPLEMENTED (mock-driven)** | `SaleSubmitPage.spec`, `handlers.ts:1143 /sales POST`, `handlers.ts:1191 /resubmit`, `handlers.ts:1245 /reopen-request` |
| Commissions (list + snapshots) | FEAT-033..040 BR-COM 8%/4% | **Yes** list mock + calc via propertyValue snapshot | **No** (mock `MockCommission`) | **IMPLEMENTED (mock-driven)** UI only - no clearing scheduler | `CommissionsListPage.spec`, `handlers.ts:869 /me/commissions` |
| eWallet + Ledger (cursor pagination + running balance) | FEAT-042/043 BI-001/002 | **Yes** mock wallet `0.00` + ledger `led-` running `WITHDRAWAL_COMPLETION` excluded | **No** (mock `store.ledger`) | **IMPLEMENTED (mock-driven)** | `EWalletPage`, `LedgerPage` cursor `requestPage` `handlers.ts:614 /me/ledger` |
| Payout accounts (create/list/set primary/delete) | FEAT-044..047 BR-PAY | **Yes** mock status PENDING→CONFIRMED primary | **No** | **IMPLEMENTED (mock-driven)** | `PayoutAccountsPage`, `AddPayoutAccountPage`, `handlers.ts:882 /me/payout-accounts` |
| Withdrawals (reserve + list/detail) | FEAT-048..051 BR-WDR | **Yes** mock RESERVED deduct wallet + ledger DEBIT + Idempotency-Key replay without double-deduct | **No** | **IMPLEMENTED (mock-driven)** | `WithdrawalRequestPage.spec`, `handlers.ts:974 /me/withdrawals POST` Idempotency-Key required 400→ reservation |
| Vouchers (list/detail) | FEAT-052..058 | **Yes** list/detail mock | **No** (no signing/ redemption atomic) | **PARTIALLY** read-only mock | `VouchersListPage`, `VoucherDetailPage`, `handlers.ts:810 /me/vouchers` |
| Content forwardable (marketing tools) | FEAT-060 | **Yes** mock `contentItems` list | **PARTIALLY** Storage listing `listMarketingToolsFromStorage` exists but page uses mock | **PARTIALLY** | `ContentLibraryPage.spec`, `handlers.ts:840 /content/forwardable` |
| Policies (list/detail) | FEAT-062 | **Yes** mock policies | **No** | **IMPLEMENTED (mock-driven)** | `PoliciesPage`, `PolicyDetailPage` plain text no raw HTML |
| Notifications + Realtime | FEAT-063 | **Yes** mock broadcasts + `subscribeNotificationsRealtime` channel | **No** (mock) | **PARTIALLY** realtime subscription code exists, no prod Notification table | `NotificationsPage.spec`, `lib/supabase.ts subscribeNotificationsRealtime` |
| Admin Dashboard / Registrations / Members / Sales / Catalog / Content / Audit / Config / Programs / Exceptions / Payouts / Withdrawals / Vouchers / Adjustments / CMS 8 pages | FEAT-001..071 | **Yes** shell pages each with Table/StatusChip/Pagination + CMS edit forms | **No** (admin mock handlers static) | **IMPLEMENTED (shell + mock)** | `apps/admin/src/features/cms/pages/Cms*Page.spec.tsx` 18+ suites 209 tests, `admin/src/mock/handlers.ts:239` static MOCK_* |
| Geolocation (GPS/IP PH-block) | FG-PROGRAMS FEAT-014..018 | **No** handler or UI beyond placeholder | **No** | **NOT IMPLEMENTED** OD-014/015 blocked | `Member` has `countryCode` but no `geolocation_checks` table |
| Group Incentive | FEAT-041 P12 | **No** | **No** | **NOT IMPLEMENTED** DEFERRED OD-006..012 | `DATABASE-DESIGN.md` Group Incentive concept gated |
| CTO Signing service | FEAT-059 BI-008 | **No** | **No** | **NOT IMPLEMENTED** REQUIRES APPROVAL | `api/` contains no signing verify endpoint `POST /signing/verify` |
| Rate limiting / Idempotency / Audit log | API-SPEC §5.2/5.3 | **No** (handlers lack limits/audit) except Idempotency-Key exists in mock store only | **No** tables `idempotency_keys`, `audit_log` | **NOT IMPLEMENTED** spec requires 4 keys but CMS handlers ignore them |
| Mobile RN | ARCH-DEC-006 | **No** | **No** | **NOT IMPLEMENTED** as documented `MOBILE-ARCHITECTURE.md` Part A web-first CONFIRMED | No `apps/mobile` |

**Key:** Shell = renders with real specs, API shape, role guards, but data from `MockStore` not Supabase transaction.

---

## 11. Important Data Flows

### CMS Flow (IMPLEMENTED end-to-end)
```
apps/admin/src/features/cms/pages/CmsHomepagePage.tsx → useHomepageCms()
 → PUT /api/v1/cms/homepage  {content: HomepageContent}  [lib/api client request + Zod homepageContentSchema]
 → Vite proxy → api/dev-server.ts:198 → handlerCms vercelReq {method PUT, query.key=homepage, headers Authorization Bearer <anon JWT>, body JSON string}
 → handlerCms: getSupabaseEnv() → verifyAdmin() anon createClient.auth.getUser → service_role MemberRole→Role → slug admin?
 → schemaByKey.safeParse 400 VALIDATION_ERROR issues else existing version→ nextVersion =1 or +1
 → supabase(service_role).from('cms_contents').upsert({key,content,version:nextVersion,updated_by:userId},onConflict:'key')
 → broadcast: supabase.channel('cms:public',{broadcast:{ack:false}}).subscribe→send({type:'broadcast',event:'cms_update',payload:{key,version:nextVersion}})
 → orphan: extractCmsPhotoIds(prev vs new) → getMarketingToolsCmsPath → storage.from('marketing-tools').remove(cms/*)
 → response json(content) + X-CMS-Version
 → client catch → apps/web/src/lib/cmsRealtime.ts:97 channel('cms:public').on('broadcast',payload→queryClient.invalidateQueries(['cms',key])) + on('postgres_changes',cms_contents→invalidate)
 → apps/web/src/features/public/pages/HomePage.tsx:250 refetch getHomepageCms staleTime0 refetchOnMount always → renders new hero/value/categories
 → fallback on 404/network: HOME static import (cms.ts:205)
```
**Evidence:** `api/v1/cms/[key].ts:368`, `api/dev-server.ts:104 routing`, `lib/cms.ts:205`, `lib/cmsRealtime.ts:97`, `packages/contracts/src/schemas/cms.ts:812`.

### Authentication Flow (IMPLEMENTED)
```
LoginPage.tsx:312 /login identifier=password → identifierRef/passwordRef validateLogin focus
 → trySupabaseLogin if isSupabaseConfigured && MODE!=='test'
   createClient(url,anonKey).auth.signInWithPassword({email:identifier,password})
   → error.code UNAUTHORIZED throw ApiError
   → from Member select * eq id || members fallback → member {name,isQualified,status}
   → resolveRole loops Role/MemberRole → roles/member_roles → role/memberrole → normalizeRole
   → fallback user_metadata.role
   → buildSessionUser → {id,name,email,role,isQualified,status}
 → fallback: services/auth.ts login({identifier,password}) → POST /auth/login mock → handlers.ts:331 alias username@gmail.com→juan.delacruz else member lookup hashPassword
 → loginAs(SessionUser) → SupabaseSessionProvider setUser/setMockSessionUser → status authenticated
 → role==='admin' → window.location.href VITE_ADMIN_URL||http://localhost:5174/admin  else navigate(from)
 → session persistence: SupabaseSessionProvider useEffect getSession + onAuthStateChange → buildSessionUser → setUser; cookieStorage SameSite=Lax shared 5173↔5174
```
**Evidence:** `apps/web/src/lib/supabase.ts:112`, `session.tsx:312` lines 90-207, `LoginPage.regression.spec.tsx:5790` Supabase NOT configured→mock.

### Member Flow (MOCK-DRIVEN - determine what is real)
```
RequireMember guard → useSession status/role → unauth→/login, admin→Forbidden, loading→Skeleton
 → MemberLayout → memberSidebarItems() → AppShell → bottomNav primary
 → DashboardPage useQuery(['me','wallet'], getWallet) → client request('/me/wallet', walletSchema) → mock handlers.ts:598 wallet {availableBalance:0.00, pendingAmount:0.00}
 → same for qualification, sales, payouts etc.
 → All member writes go through mock handlers intercepting fetch (MockServer installed in main.tsx DEV)
   - POST /sales Idempotency-Key → store.idempotency[POST:/sales:key] replay without duplicate
   - POST /me/withdrawals Idempotency-Key required 400 else compareMoney(amount,wallet.availableBalance) 409 INSUFFICIENT_BALANCE else wallet.availableBalance=subtractMoney(...)
     ledger push WITHDRAWAL_RESERVATION DEBIT + store.idempotency path
   - GET /me/ledger cursor? type filter allowlisted → compute running balance withBalance map, balanceAfter: add/subtractMoney, filtered page nextCursor
```
**Real vs mock:** Supabase session resolution (`Member` lookup) is **real DB-backed** when configured; all other member reads/writes (wallet, ledger, sales, commissions, payouts, withdrawals, referrals, vouchers) are **mock-driven** (`mockStore` in-memory, exact-decimal via `@jad/shared`). No ledger `SELECT ... FOR UPDATE` or `SERIALIZABLE` transaction exists.

### Financial Flow (NOT DATABASE-BACKED)
| Domain | DB-backed | API-backed | Mock/ UI-only | Evidence |
|---|---|---|---|---|
| Sale submit→ approve → payment verify → Qualifying | No | No Vercel handler | Mock only `MockSale SUBMITTED` + resubmit 3 LOCKED | `handlers.ts:1143 submitSale`, DB no `sales` table |
| Commission creation 8% direct / 4% referral | No | No | Mock only `MockCommission` list | `handlers.ts:869 toCommission`, no `commissions` table |
| Clearing 7d Pending→Available | No scheduler | No | Mock status static | `BACKEND-ARCHITECTURE.md §13` job not implemented |
| Ledger append-only + running balance | No `ledger_entries` | No | Mock `store.ledger` append, balance via `addMoney` | `handlers.ts:614 ledger` compute balance |
| Wallet Available vs Pending | No `member_balances` | No | Mock `store.wallets` | `handlers.ts:598 wallet` |
| Withdrawal reserve → complete/reject | No `withdrawals` | No | Mock RESERVED only (no complete/reject mutation) | `handlers.ts:974 POST /me/withdrawals` only; no `/withdrawals/:id/complete` |
| Voucher issue/sign/verify/redeem atomic | No `vouchers, voucher_redemptions` | No | Mock list only | `handlers.ts:810 vouchers`, no signing boundary |
| Payout accounts verify | No `payout_accounts` | No | Mock PENDING→CONFIRMED via admin mock | `handlers.ts:882 payout-accounts` but admin side static mock |
| Referral single-level + genealogy | No `sponsor_id` FK | No | Mock `sponsorId` graph `networkDescendants` recursive | `handlers.ts:256 buildGenealogyNode` BI-004 never auto create MLM |

**Never infer:** No hidden financial transaction exists beyond mock.

---

## 12. Established Coding Patterns

**Naming:** files `kebab-case` non-component, `PascalCase .tsx` components (DEVELOPMENT-GUIDELINES.md §11, FOLDER-STRUCTURE.md §6); hooks `use<Domain>` (`useSales.ts`), dirs `kebab-case` singular `sales/ ewallet/`, vars `camelCase`, types `PascalCase`, env `UPPER_SNAKE_CASE`, tests `<target>.spec.tsx`, REST `kebab-case` plural. Evidence `apps/web/src/features/member/hooks/useMember.ts`, `src/features/auth/pages/LoginPage.tsx`.

**Folder organization:** `apps/<app>/src/{main.tsx, app/, features/<fg-slice>/{pages/,components/,hooks/,services/}, components/, hooks/, lib/, styles/, test/}` (FRONTEND-ARCHITECTURE.md §1.3). Feature slice owns `components/hooks/services/local state`, exposes route components only; cross-feature imports prohibited. Shared moves to `components/ hooks/ lib/` after 2+ uses. Packages `contracts/config/shared/mock/ui` single-source.

**Components:** 3 tiers (FRONTEND-ARCHITECTURE.md §6) - shared primitives `apps/*/src/components/` (Button, Card, Table via `@jad/ui`), feature components `features/x/components/` (SaleCard, WithdrawalDetail private), route pages `features/x/pages/` compose 1+2. Container/presentation split pragmatic; props typed `interface`; avoid prop drilling >3 via context only. Example `PublicLayout.tsx:42` → `Header.tsx:72` → `MobileNavigation.tsx:84`.

**Hooks:** `use` prefix one cohesive behavior, exhaustive deps, minimal effects cancellable, expose stable typed result. Example `usePolicies.ts:11` `useQuery(['policies'], getPolicies)`.

**Services:** `features/<f>/services/*.ts` wrap `lib/api/client` request - `apps/web/src/features/member/services/member.ts:253` 18 functions `getProfile→request('/members/:id', memberProfileSchema)`, `submitSale(input,key)→POST /sales Idempotency-Key`. No ad-hoc `fetch` in features.

**API calls:** All through `lib/api/client.ts:115` `request(path,schema,init)` validates Zod; `requestList` via `listResponseSchema(itemSchema)` → `{data,meta}`; `requestPage` extracts `meta.pagination.nextCursor`. Errors via `toApiError` → `ApiError(code,status,requestId,details)`; `apiErrorMessage` surfaces `message` else fallback.

**Data fetching:** TanStack Query. Public CMS `staleTime0 refetchOnMount always` + realtime invalidate; referential `staleTime30s retry1`; Member Queries `retry:false` per test utils; mutations `retry:false` (query.ts:19). Cursor pagination `?cursor=<opaque>&limit=50` for ledger; page-based `?page&pageSize` for admin lists.

**Forms:** `features/auth/components/FormField.tsx`, `PasswordField`, `TextField`, `SelectField`, `RegistrationForm` + `validation.ts:spec` Zod shared with backend; controlled via React (Hook Form pattern but plain useState in public `LoginPage` values/errors/serverError/submitting refs).

**Validation:** Shared Zod in `@jad/contracts` (`cms.ts:812`, `money.ts EXACT_DECIMAL_STRING_RE`, `auth.ts`, `member.ts` etc.) SSOT - never re-declared. Client + server both `safeParse` → 400 `VALIDATION_ERROR` with issues details; business eligibility separate (e.g., `!isQualified → 422 MEMBER_NOT_QUALIFIED` in `handlers.ts:1095`).

**Authentication:** Supabase `signInWithPassword` via `SupabaseSessionProvider` `buildSessionUser` + `resolveRole` fallback chain; `loginAs` syncs `mockSessionRef` for mock handlers. See §9.

**Authorization:** Client guards `RequireMember/RequireQualifiedMember` UX only; server `verifyAdmin` via JWT + `MemberRole→Role` + metadata; object-level `currentMember(store)` checks `mockSessionRef.current.id===member.id` else 404 hide (handlers.ts:568), mirrors `NFR-AUTHZ-002`.

**Database access (implemented):** Handler directly `supabase.from(table).select/upsert(...).maybeSingle()` + `storage.from('marketing-tools').upload/remove/getPublicUrl/createSignedUploadUrl`; no Drizzle, no repository layer beyond handler.

**Error handling:** Unified envelope `{error:{code,message,details,requestId,timestamp}}` (contracts `error.ts:40` + handler `toErrorEnvelope`). Client maps `401→Navigate /login preserving from`, `403→Forbidden` or clear not permitted, `404→NotFound` or hide, `409 SALE_LOCKED/INSUFFICIENT_BALANCE/RESERVATION_CONFLICT`, `422 MEMBER_NOT_QUALIFIED`, `400 VALIDATION_ERROR`, `500 INTERNAL generic` never internals.

**Loading/empty/error states:** Every screen implements UI-UX §10: Skeleton initial, spinner/disable submit loading, EmptyState with CTA (`EmptyState.tsx`), Alert danger/success (`Alert.tsx`), ErrorState generic recoverable, forbidden/not-found per `ErrorState/Forbidden` (`packages/ui`). Money empty `₱0.00` valid state.

**Responsive UI:** Tokens `--bp-sm 640 --bp-md 1024 --bp-lg 1280` (`tokens.css:141`) → `useMediaQuery`; tables → stacked cards on mobile (never horizontal scroll for financial data).

**Accessibility:** Semantic HTML, visible focus ring 3px `var(--color-state-focus)` (`base.css`), lang/skip-link, aria-expanded on nav toggle, touch ≥44px (`Button.tsx:45`), `prefers-reduced-motion`.

**Testing:** Colocated `<target>.spec.ts(x)`; `src/test/utils.tsx:83` `renderWithProviders(ui,{route,initialUser})` fresh `QueryClient retry:false` + `SessionProvider initialUser restoreDelayMs0` + `MemoryRouter`; `mockFetchRoutes(routes)` `vi.fn(input=>pathname.endsWith(path)?json(body,status):404 NOT_FOUND)` handles `VITE_API_BASE_URL` prefix; `mockFetchJson/status`, `mockFetchNetworkError` TypeError. Mock server routing `createMemberMockServer().install()` intercepts fetch in DEV; tests use `SessionProvider initialUser` TestSessionProvider path (`session.tsx:274`).

**Configuration:** Typed via `@jad/config` `vitePublicEnvSchema` Zod at `apps/web/src/lib/env.ts:7` `loadPublicEnv(import.meta.env)`; only `VITE_` ships to client; business params via `GET /config/public` (`handlers.ts:532 store.minAge/genders/countries`) - never `process.env` in components (DEVELOPMENT-GUIDELINES §18). `.env.example:25` at `apps/web` + root `.env` gitignored.

**Logging:** No structured logging yet; handler console `[dev-server] METHOD pathname -> status ms` debug only; production logging redaction not yet implemented (BACKEND §11 placeholder).

**Money handling:** Exact-decimal strings only, `NUMERIC` in contract; format via `formatMoney` `Intl.NumberFormat en-PH PHP`, compare/add/subtract via BigInt cents `toCents` (`shared/money.ts:97`), never float math (BR-WAL-002). Verified `money.spec.ts`.

---

## 13. Established UI/UX Patterns

**Source:** `docs/ui-ux/DESIGN-SYSTEM.md:333` + `UI-UX.md:1000` baseline v1.0; every value PROPOSED REQUIRES APPROVAL (no brand colors/fonts approved beyond logo-derived tokens).

**Design tokens:** SSOT `packages/ui/src/styles/tokens.css:141` brand `primary #2c6aa7 hover #23598f deep #142b47`, accent `#a9853a`, bg `canvas #fbfaf7 surface #f4f2ec raised #ffffff`, text `primary #1c2b3a secondary #40505f muted #64737f`, border `#e5e0d4`, success/warning/danger `#3f7d4e #9a6b1f #a63a32`, focus `var(--color-accent-strong)`, spacing `space-1 4px → 32 128px`, typography sans system / display Georgia `h1 clamp(2.125rem…) display 4.25rem`, container 1200, header 68→70, shadows, `z-topbar 20 sidebar10 bottom-nav50 drawer60`. `base.css:85` body `#1c2b3a #fbfaf7`, focus-visible 3px, reduced-motion.

**Color principles:** Semantic aid never only signal; money/status Pending vs Available distinguishable by label first (BI-002), not color alone.

**Typography:** Scale caption 12/body-s14/body16/h3 20/h2 24/h1 32/display 40+ TBD; line 1.4-1.5; weights 400/500-600/700.

**Components inventory (7 primitives):** Buttons (primary/secondary/danger/ghost/link one primary per screen; Idempotency-Key loading prevents double submit), Inputs (text/email/tel/number money exact-decimal/select/date/textarea/file/search label always visible config-driven selects), Cards (record/stat/list → primary list on mobile), Tables (queue/financial/reference column priority collapse mobile money right-aligned read-only BI-005), Modals/Dialogs (confirm/form/detail Escape closes non-destructive destructive requires reason), Notifications (toast/inline/banner icon+text+color never color-only), Icons.

**Status color mapping PROPOSED:** Approved-Active success, Pending/Submitted info, Rejected/LOCKED danger, Available success, Pending info neutral.

**Navigation (UI-UX §4):** Public `Landing→Register→Login`; Member `Dashboard, Sales, Commissions, eWallet & Ledger, Payout Accounts, Referrals (My Code/Direct/Network/Genealogy/TotalEarned), Vouchers, Marketing Tools, Policies, Notifications, Profile` with bottom nav 5 + drawer More; Admin `Dashboard queues, Registrations, Sales, Payouts, Withdrawals, Exceptions, Catalog, Members, Content (Media/Policy/Broadcast), Vouchers, Adjustments (SUP), Programs (SUP), Config (SUP), Audit (SUP)` + Website CMS dropdown.

**Screen register 60+ SCR-*:** Each defines app, roles, primary actions, validation, required states, related FEAT/BR/AC (e.g., SCR-MEM-012 Withdrawal request → ≤Available verified account Idempotency-Key).

**Money display §9 CONFIRMED derivation:** Exact decimals via `formatMoney` → `₱1,234,567.89` `Intl.NumberFormat`; Pending/Available always labeled BI-002; snapshot frozen BI-006.

**State contract per screen (UI-UX §10):** initial Skeleton, loading disabled submit, empty friendly with CTA, error generic recoverable `requestId`, success feedback + next action, forbidden 404 hide, network offline banner Idempotency-Key preserved, partial indicator, confirmation dialog for destructive, unsaved-change warning.

**Responsive:** `bp-sm <640 single-col bottom nav`, `md 640-1023 drawer 2-col`, `lg 1024-1279 persistent nav`, `xl ≥1280 1440 admin` PROPOSED; tables → stacked cards mobile; heroes tucked under transparent header (`--header-height`).

**Accessibility PROPOSED REQUIRES APPROVAL:** WCAG 2.1 AA 4.5:1 text 3:1 large, focus 3:1 visible ring, keyboard full, touch ≥44×44, body ≥14 1.5, visible+programmatic labels, reduced-motion.

**Implementation adherence:** Code follows tokens `var(--*)` exclusively (no hard-coded hex except token definitions), `Button.module.css` etc. per component, `formatMoney` everywhere price appears (`PropertyCard.tsx:75 priceBadge formatMoney(property.price)`), `Header` solid gradient `rgba(20,43,71)` + blur12, `MESSENGER_URL https://m.me/JADRealtyServices`.

---

## 14. Testing Architecture

**Tooling:** Vitest `4.1.11` + Testing Library + jsdom + `vitest/setup` (actual). Playwright PROPOSED in `TESTING.md` but **not configured** (no `playwright.config`, no e2e). Supertest PROPOSED but Vitest fetch mock used.

**Config:**
* `apps/web/vite.config.ts:31` `test:{environment:'jsdom',setupFiles:['./src/test/setup.ts:13'],include:['src/**/*.spec.{ts,tsx}']}`; identical `apps/admin`. `packages/mock/vitest.config.ts`, `packages/ui/vitest.config.ts` jsdom; `packages/contracts` node.
* Root `turbo.json:18` `test:{dependsOn:["^build"]}`.
* Setup `apps/web/src/test/setup.ts:13` + `apps/admin` `import '@testing-library/jest-dom/vitest'; afterEach(()=>{cleanup(); vi.unstubAllGlobals(); localStorage.removeItem('jad:mock:session')})`.

**Utils:** `apps/web/src/test/utils.tsx:83` `renderWithProviders(ui,{route='/',initialUser})` → `new QueryClient({queries:{retry:false}})` → `<SessionProvider initialUser restoreDelayMs0><QueryClientProvider><MemoryRouter>`; `mockFetchRoutes(routes)` vi.fn suffix matching `endsWith(path)` via `VITE_API_BASE_URL`; `mockFetchJson(body,status)`, `mockFetchNetworkError()`.

**Inventory (>90 specs, verified `pnpm test` pass 2026-09-01):**
* `apps/web` 61 files: `components/*spec` (Button, Alert, MessengerButton, PublicNavLink, primitives), `app/*spec` (App 11 tests, Header, PublicLayout, ErrorBoundary), `features/public/components/*spec` (FAQAccordion, ProgramsSection, Eligibility), `content/{images,properties}.spec.ts`, `pages/*spec` (Home, About, Properties, Category, PropertyDetail, Faqs, Contact, NotFound, **Member 20+ pages** Dashboard, EWallet, Ledger, Commissions, Withdrawals, PayoutAccounts, Vouchers, DirectReferrals, GroupNetwork, Genealogy, SalesSubmit/Detail, Policy, Notifications, ContentLibrary + Auth Login/Register/VerifyEmail + regression + guards `RequireMember`, navigation), `lib/api/client.spec.ts:76` 8 tests (validate publicConfigSchema, credentials same-origin, list envelope, error code/requestId, fallback INTERNAL, ApiParseError), `lib/session.*spec.tsx` sync/regression, `mock/handlers.spec.ts:33` ledger cursor monotonic balance, payout primary promotion, idempotent sale/withdrawal replay, 404 for foreign resources.
* `apps/admin` 27 files: `AdminLayout.spec`, `RequireRole.spec`, `navigation.spec`, `features/cms/pages/*spec` (Homepage 18, About 18, Properties 25, Faqs 17, Contact 17, Global 15, Login 10, Register 10, image Gallery add/remove, pricing optional, dirty Cancel restores etc.), `features/*` Dashboard/Registrations/Members/Sales/Payouts/Withdrawals/Vouchers/Exceptions/Catalog/Content/Adjustments/Config/Audit.
* `packages` 3 suites: `contracts index.spec.ts:11`, `shared money.spec.ts:9`, `config env.spec.ts:5`; `mock mockServer.spec.ts:5 + session.spec.tsx:5`; `ui` 9 files primitives/shell/Toast/Dialog etc. (37 tests).

**Coverage:** Requirement-to-test traceability documented in `TESTING.md §1.3` but no code-coverage threshold configured (TESTING.md §16 `REQUIRES APPROVAL`). Critical regression suite (`invariant BI-001..010` + `role×endpoint` + financial) not yet enforced - mocked.

**Performance/security testing:** `TESTING.md §9` specifies authZ matrix + RBI + idempotency concurrency; `handlers.spec.ts` covers ledger cursor + idempotency replay + object-level 404 hide (`/members/:id` mock own-row check). No load/perf tests; rate-limit not tested (no impl).

---

## 15. Security Architecture

**Implemented controls:**
* **RLS (4 tables):** `Member auth.uid()=id` + `MemberRole auth.uid()=memberId` + `Role authenticated select true` + `cms_contents anon,authenticated read true` (`auth_foundation.sql:47` `cms_contents.sql:32`). All migrations `DO NOT EXISTS` idempotent. Defense-in-depth `auth.uid()=id` even though `service_role` bypass for seed/handlers.
* **JWT verification (Q3):** Every write handler `verifyAdmin` → `createClient(url,anonKey).auth.getUser(token)` (anon, no refresh, extracted Bearer or `sb-*-auth-token` cookie). `service_role` used only for DB writes/broadcast/removal. No anon read of RLS-restricted tables.
* **Storage:** Bucket `marketing-tools` public read, `service_role` write (upload `/cms/${Date}` sanitized `safeName` `[^a-z0-9._-]`→`_` slice80, ≤20MB, mime/ext allowlist `jpeg/png/webp` in `upload.ts:172` `upload/sign.ts:190`); `getPublicUrl` or `createSignedUploadUrl`; orphan `remove` on PUT diff (unique, non-blocking, log not rollback).
* **Env:** Only `VITE_` ships (`@jad/config env.ts:30`); `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_SEED_*` never `VITE_` (`agENTS.md:18`, `.env.example:25`). `.prettierignore` + `.env*` gitignored per doc; no committed secrets verified (`pnpm test` not exposing env).
* **CORS:** `Allow-Origin origin ?? *` `Credentials true` `Allow-Methods` `Allow-Headers Content-Type,Authorization,...` + `OPTIONS 200` (handlers). Public GET `/cms/:key` anon-readable.
* **Error envelope:** `{error:{code,message,details,requestId,timestamp}}` never leaks stack; `500 INTERNAL` generic (handlers `catch → 500`). Money strings validated exact-decimal Zod.

**Gaps (documented, not fixed):**
* **Authorization:** RBAC not enforced beyond `admin` boolean; `member` write paths rely on mock `currentMember` check but Vercel handlers have no `member` role guard (only `verifyAdmin` for admin writes). Object-level not server-enforced for member financial resources (no `/members/:id` guard in CMS handlers).
* **Rate limiting:** No per-IP/per-user limits; spec requires strict on `POST /auth/login/register/verify-email` + `POST /vouchers/:id/redemptions` → **NOT IMPLEMENTED**.
* **Idempotency:** No `Idempotency-Key` header required in Vercel handlers; only mock store enforces `POST:/sales/:key` replay (`handlers.ts:1155`) - **NOT IMPLEMENTED** server.
* **Audit logging:** No `audit` table, no same-transaction audit insert (NFR-SEC-002) - **NOT IMPLEMENTED**.
* **Financial integrity invariants:** `BI-001` ≥0 balance, `BI-005` no UPDATE/DELETE financial, `BI-007` unique redemption - no CHECK/REVOKE constraints beyond CMS; `DATABASE-DESIGN.md §4.5` proposed but not migrated - **NOT IMPLEMENTED**.
* **Field-level encryption:** `payout_accounts.account_identifier` encryption REQUIRES APPROVAL `DA-08` - **NOT IMPLEMENTED** (mock masks via `maskIdentifier` only).
* **CSRF:** Handler accepts cookie `sb-*-auth-token` without `SameSite=Lax` enforcement or double-submit token - JWT header preferred but not mandated.
* **Mock auth bypass:** `currentMember()` fallback `return store.members[0]` for any Supabase UUID not in mock (`handlers.ts:92`) - any authenticated Supabase user gets rich demo data (documented as Phase 1 convenience, but hides authz gap).
* **Concurrency:** No `SELECT FOR UPDATE` or `SERIALIZABLE` ledger writes; mock ledger append is single-threaded.
* **Realtime auth:** `cms:public` broadcast channel `ack:false self:false presence disabled` - anon can subscribe to `cms_contents` changes (RLS allows anon read anyway; low risk but no private channel for member-scoped data).

---

## 16. Deployment/Infrastructure

**Target (PROPOSED Q1 Vercel+Supabase per `ARCHITECTURE.md §13` + `DEPLOYMENT.md:436`):**
```
[CDN/Edge] → [Member Web :5173][Admin :5174] on Vercel
                 ↘           ↘
                [Vercel Functions / REST API (/api/v1)]
                          ↘
             [Supabase Postgres 15+ (RLS+Auth+Storage+Realtime)]
                          ↘
             [Object/File Storage marketing-tools][External integrations][CTO Signing Service separate control plane]
```

**Verified config:**
* `vercel.json:17` `buildCommand pnpm run build` `outputDirectory apps/web/dist` `installCommand pnpm install` `framework vite` `functions api/v1/cms/[key].ts|upload.ts|upload/sign.ts includeFiles packages/**`.
* `vercel.local.json:14` local variant `build turbo run build --concurrency=1` `output public` `framework null`.
* `apps/web/vite.config.ts:31` proxy `/api→http://localhost:3000` `changeOrigin:true` `outDir dist` `alias @→./src`.
* `package.json` scripts `dev:turbo run dev` persistent, `build:turbo run build` outputs `dist/**`, `lint:turbo run lint` (apps/web only `eslint` tseslint+react-hooks), `typecheck:tsc --noEmit`, `test:vitest run`, `seed:tsx supabase/seed.ts`.

**Local dev:** `pnpm dev` → turbo dev (both SPAs + `tsx api/dev-server.ts :3000` for CMS). `pnpm seed` after `psql $DATABASE_URL -f migrations/...`.

**Environments (REQUIRES APPROVAL - not configured):** Local/Test/CI/Staging/Production per `DATABASE-DESIGN §4.2` `TESTING §14` - none provisioned; provider/region OPEN `ARCH-DEC-008`; DB migrations run under `migration` role never app role (not yet separated); backups PITR PROPOSED not configured; `DATABASE-DESIGN §21` irreplaceable financial/audit tables; monitoring metrics/APM deferred until NFR targets approved (`DEPLOYMENT.md §11`); health `/health` `/ready` PROPOSED not implemented.

**Build:** Packages raw TS no build (`exports ./src/index.ts`); consuming app `tsc --noEmit` type-checks. `apps/api` has `typecheck echo skipped` - not verified by `tsc`.

---

## 17. Documentation vs Implementation Audit

| # | Finding | Documentation | Actual Implementation | Status | Evidence | Impact |
|---|---|---|---|---|---|---|
| 1 | Backend framework | `TECH-STACK.md`, `ARCHITECTURE.md` originally NestJS modular monolith | Vercel Functions REST per Q1 | **IMPLEMENTED** (supersession verified) | `docs/decisions/ADR-002b-Vercel-Functions.md` Q1 vs `api/v1/cms/[key].ts:368` | Foundation for modular migration |
| 2 | Auth mechanism | `SECURITY.md:32` HttpOnly Secure SameSite DB-backed session `ARCH-DEC-007` | Supabase Auth JWT PKCE `cookieStorage` cross-port | **INCONSISTENT** (stale doc) | `SECURITY.md:32` vs `apps/web/src/lib/supabase.ts:112` `cookieStorage` + `session.tsx:312` PKCE | Confusion for security review; JWT header avoids CSRF but doc claims opposite |
| 3 | Entity count | `DATABASE-DESIGN.md §7` 33 entities E-01..E-33 CONFIRMED/PROPOSED | 4 tables migrated (`Member, Role, MemberRole, cms_contents`) | **PARTIALLY IMPLEMENTED** 12% tables | `DATABASE-DESIGN.md:201` vs `supabase/migrations/*.sql` 81+42+14 lines | Financial domain cannot operate DB-backed |
| 4 | Endpoint count | `API-SPECIFICATION.md:430` 89 endpoints #1-89 | 3 handlers CMS only (3.4%) | **NOT IMPLEMENTED** 86 missing | `API-SPECIFICATION.md §6` inventory vs `api/v1/cms/*` 3 files | All financial/member/admin queues are mock |
| 5 | Lockfile existence | `DEPLOYMENT.md:9` "no lockfile" / `TECH-STACK §14` REQUIRES VERIFICATION | `pnpm-lock.yaml` exists | **INCONSISTENT** (doc stale) | `pnpm-lock.yaml` present vs docs claim none | Low - doc staleness |
| 6 | Env examples | `DEPLOYMENT.md:9` "no .env.example" | `apps/web/.env.example:25` exists with VITE_* + server placeholders | **INCONSISTENT** (doc stale) | `apps/web/.env.example:25` vs deployment doc | Low |
| 7 | Package.json existence | `TESTING.md:5` "no source, no package.json" | Root + 9 workspace `package.json` exist | **INCONSISTENT** (doc stale) | `package.json:26` + `apps/web/package.json:46` | Low |
| 8 | DB engine | `DATABASE-DESIGN §4` PostgreSQL via Supabase 15+ CONFIRMED | Supabase Postgres 15+ migrations | **IMPLEMENTED** | `auth_foundation.sql:13` pgcrypto | - |
| 9 | Money handling | `TECH-STACK §5` `NUMERIC` no float CONFIRMED | Exact-decimal strings `addMoney(BigInt)` no float | **IMPLEMENTED** | `packages/shared/src/money.ts:97` `formatMoney` Intl |
| 10 | CMS single table Q2 | `supabase/migrations/cms_contents.sql:9` key PK check 8 keys JSONB version | Implemented as spec | **IMPLEMENTED** | `cms_contents.sql:9` check key in 8 | - |
| 11 | Storage bucket | `DATABASE-DESIGN A-08` object storage adapter CONFIRMED | Bucket `marketing-tools` exists, handlers use `service_role` | **IMPLEMENTED** | `upload.ts:172` `storage.from('marketing-tools')` `getPublicUrl` |
| 12 | Rate limit / idempotency | `API-SPECIFICATION §5.2/5.3` requires 24h TTL UUID on 4 mutations | No limits/idempotency in Vercel handlers; mock store only | **NOT IMPLEMENTED** (Vercel) / **PARTIALLY** (mock) | `INTEGRATION-SPECIFICATION §8` 24h PROPOSED |
| 13 | Audit trail | `SECURITY.md §13` same-transaction audit `audit_log` insert-only | No audit table; no audit writes | **NOT IMPLEMENTED** | `DATABASE-DESIGN §15` entity E-33 not migrated | Cannot prove staff decision trace |
| 14 | Signing boundary | `BUSINESS-RULES §3` `BI-008` master key never in app infra, app verifies only | No voucher issuance/signing; Finance invariants deferred `supabase/README.md:55` | **NOT IMPLEMENTED** (as planned Phase 1) | `supabase/README.md:47` CRM deferred note |
| 15 | Idempotency key hashed | `DATABASE-DESIGN U-06` hashed at rest, never logged | Mock stores plain key string `store.idempotency[POST:/sales:key]` | **PARTIALLY / INCONSISTENT** | `handlers.ts:1159` plain; `BACKEND-ARCHITECTURE §11` never log Idempotency-Key (mock logs none) |
| 16 | Deployment artifacts | `DEPLOYMENT.md` "no docker, no CI, no vercel.json" (pre-scaffold) | `vercel.json:17` present, pnpm/Turbo present | **PARTIALLY IMPLEMENTED** config only, no infra provisioned | `vercel.json:17` vs DEPLOYMENT.md pre-Q1 text |

---

## 18. Known Technical Debt

| # | Debt | Evidence | Consequence | Severity |
|---|---|---|---|---|
| 1 | Duplicate API handlers `api/` vs `apps/api/api/` identical copies | `api/v1/cms/[key].ts:368` byte-identical to `apps/api/api/v1/cms/[key].ts` | Drift risk; need double edit + version skew (`zod 4.4.3` vs `3.23.8` in `apps/api/package.json:14`) | Medium |
| 2 | Duplicate design tokens `packages/ui/src/styles/tokens.css:141` vs `apps/web/src/styles/tokens.css` identical | Two files, both imported (`main.tsx:11` `@jad/ui/tokens.css` + `styles/tokens.css`) | Single-edit brand refresh not truly single | Low |
| 3 | Hardcoded Supabase fallback URL `https://vudwoqduebdgtzvybywb.supabase.co` in 3 places | `supabase/seed.ts:52`, `api/v1/cms/[key].ts getSupabaseEnv()` | Leaks demo ref; env misconfig silently hits shared project | Medium |
| 4 | Mock fallback `currentMember() return store.members[0]` for any Supabase UUID | `handlers.ts:92` | Any `admin@jad.local` login gets rich demo wallet/ledger masking real empty ledger; hides authz bug | Medium |
| 5 | `apps/api` typecheck skipped `echo 'api typecheck skipped (uses root tsc)'` | `apps/api/package.json:14` scripts | Vercel handlers never `tsc --noEmit` - type errors silent until `apps/web` imports contracts | Low |
| 6 | Non-transactional orphan storage cleanup (remove after upsert, no rollback) | `api/v1/cms/[key].ts` PUT diff→ `storage.remove(unique)` after broadcast | If remove fails, orphan remains; if upsert rollback hypothetical, remove already done | Low |
| 7 | No CI pipeline despite `TECH-STACK §11` gates (build+lint+test+typecheck per PR) | No `.github/workflows`, `DEPLOYMENT.md §6` provider OPEN | Invariants not enforced in CI; manual `pnpm test` required | Medium |
| 8 | Legacy mock `superadmin@gmail.com / P@ssword` + `username@gmail.com/Password` aliases kept for placeholder demo | `handlers.ts:346` `handlers.ts:353` | Confusing parallel auth path when Supabase configured; test regression covers but demo bypass | Low |
| 9 | In-memory `MockStore` not reset between tests beyond `localStorage.removeItem` | `setup.ts:13` afterEach only storage; store per `createMockStore()` but shared across mocked fetch within test | Test isolation depends on per-render `createMemberMockServer()` fresh store; leakage if reused across files (currently safe but brittle) | Low |
| 10 | `vercel.json` includes `packages/**` for 3 CMS handlers but not for future financial handlers - must enumerate | `vercel.json:17` functions includeFiles | Future `api/v1/payouts.ts` would fail to resolve `@jad/contracts` import on Vercel until added | Low |
| 11 | 3 variant table-name fallback loops (`Role/roledes/role`, `MemberRole/member_roles/memberrole`) everywhere | `session.tsx:100 tryResolve` + `seed.ts:116 tryUpsert` | Legacy compat debt; hides real table name | Low |

**Not debt (as documented):** No payment gateway, no MLM tables, no auto-refund - intentionally excluded per `TECH-STACK §16`.

---

## 19. Potential Risks

| ID | Risk | Severity | Evidence | Consequence | Recommendation (requires approval) |
|---|---|---|---|---|---|
| R-01 | Open decisions block 9 features (OD-001..025 gate FEAT-017/018/022/041/047/051/058/066/069) | High | `FEATURES.md §6.1` 9 blocked, `ROADMAP §8.2` | Team may invent provisional logic violating BI-004/TBD | Freeze gated features as `REQUIRES APPROVAL` placeholder per `UI-UX.md` - no impl (already followed) |
| R-02 | No financial DB invariants (BI-001 Available ≥0, BI-005 immutability, BI-007 unique redemption) enforced server-side | Critical | `DATABASE-DESIGN §15` proposed CONSTRAINTS not migrated; mock `subtractMoney` may go negative if not guarded | Negative balance, double redemption if financial handlers added without constraints | Append migrations for `commissions, ledger_entries, member_balances CHECK ≥0`, `REVOKE UPDATE/DELETE`, `UNIQUE(voucher_id, idempotency_key)` before any financial endpoint ships |
| R-03 | No rate limiting on auth/redemption | High | `API-SPECIFICATION §5.2` strict limits TBD, `SECURITY.md §12` | Brute-force login (`POST /auth/login` mock 401) + voucher double redemption abuse | Add Vercel middleware rate limit + test `429 RATE_LIMITED` before exposing |
| R-04 | No idempotency enforcement server-side | High | `API-SPECIFICATION §5.3` 4 keys required but handlers ignore header | Duplicate sale/withdrawal side effects on retry/timeout | Implement `idempotency_keys` table `hashed` + middleware returning stored `{error,body}` |
| R-05 | No audit trail for privileged actions | High | `SECURITY.md §13` requires same-tx audit for approvals/verifications/adjustments | Cannot reconstruct who approved sale or adjusted ledger; compliance gap `NFR-SEC-002` | Create `audit_log` insert-only + enforce in use cases before audit-requiring routes |
| R-06 | RLS too permissive for future member-scoped tables (no tables yet but pattern) | Medium | Current `cms_contents anon read` is intentional public; future `sales` would need `auth.uid()=sellerId` not yet designed | IDOR if future sales handler reuses anon pattern | Design RLS for CRM phase with `auth.uid()` checks + service_role writes |
| R-07 | Service role key exposure risk (VITE namespace confusion) | High | `supabase/README.md:15` correctly says never VITE; but `apps/web/.env.example` lists `VITE_SUPABASE_*` adjacent | Dev may paste service key as `VITE_SUPABASE_SERVICE_ROLE_KEY` → ships to browser | Add `packages/config` lint rejecting `VITE_SUPABASE_SERVICE_ROLE_KEY` + CI secret scan |
| R-08 | Mock authentication masks real authz failures in DEV | Medium | `handlers.ts:92` fallback + `main.tsx DEV mock install` | Bug in `resolveRole` appears green because mock returns `user` anyway | Guard `currentMember` fallback with `if (isSupabaseConfigured()) return undefined` or feature-flag mock |
| R-09 | Orphan storage accumulation if cleanup fails silently | Low | `api/v1/cms/[key].ts` `storage.remove` best-effort logged not blocked | `marketing-tools/cms/*` grows; not financial but cost | Move cleanup to background queue with retry (when worker approved) |

---

## 20. Current Implementation Status

| Area | Status | Maturity | Evidence |
|---|---|---|---|
| Planning & SSOT | **COMPLETE** | Baseline v1.0 37 docs | `docs/requirements/REQUIREMENTS.md`, `docs/decisions/ADR-001..012` |
| Foundation (repo, workspaces, types) | **IMPLEMENTED** | pnpm+Turborepo, strict TS, shared packages, typecheck/test green | `pnpm typecheck` 8/8 pass, `pnpm test` 292 web +209 admin pass |
| Public website | **IMPLEMENTED** | Full 7 pages + CMS-editable copy + responsive + a11y | `HomePage.spec.tsx`, `PropertyDetailPage.tsx:164` |
| Authentication | **IMPLEMENTED** | Supabase Auth PKCE + mock fallback, session PKCE cookie cross-port, guards | `supabase.ts:112`, `session.tsx:312` |
| CMS (public content + admin editor) | **IMPLEMENTED** | 8 keys CRUD via Vercel + Storage `marketing-tools` hybrid + realtime | `api/v1/cms/[key].ts:368` + `supabase/seed.ts` 8 seeds |
| Member shell (layout, nav, guards) | **IMPLEMENTED** | Shell + 26 pages each mock-driven, cursor pagination, running balance | `MemberLayout.spec.tsx`, `features/member/pages/*` |
| Admin shell | **IMPLEMENTED** | Shell + 17 slices + CMS editor 8 pages 209 tests | `AdminLayout.spec.tsx`, `Cms*Page.spec.tsx` |
| Sales (submit/resubmit/reopen) | **UI + Mock** | Mock store with MAX 3 LOCKED, Idempotency-Key | `handlers.ts:1143` - not DB |
| Commission (8% +4% + snapshots) | **UI + Mock** | Mock ledger `MockCommission`, no clearing job | `handlers.ts:869` - no `commissions` table |
| Ledger / eWallet | **UI + Mock** | Mock ledger cursor + balanceAfter, `WITHDRAWAL_COMPLETION` excluded | `handlers.ts:614` - no `ledger_entries` |
| Withdrawals (reserve) | **UI + Mock** | Mock RESERVED + deduct + 409 INSUFICIENT_BALANCE | `handlers.ts:974` - no complete/reject |
| Vouchers / Redemption | **UI mock (read)** | Mock list/detail only, no atomic redeem, no signing | `handlers.ts:810` |
| Referral / Genealogy / Group Network | **UI + Mock** | Single-level mock graph `buildGenealogyNode` reporting-only | `handlers.ts:256` |
| Payout accounts | **UI + Mock** | Mock PENDING→CONFIRMED primary | `handlers.ts:882` |
| Group Incentive | **NOT IMPLEMENTED** | DEFERRED P12 blocked 7 ODs | `ROADMAP §7.4` MVP excludes |
| Geolocation / Programs separation | **NOT IMPLEMENTED** | PH-block, anti-spoof, accuracy BLOCKED | `FEATURES FEAT-014..018` |
| Mobile RN | **NOT IMPLEMENTED** | Part A responsive web only (confirmed) | `MOBILE-ARCHITECTURE.md` 639 |
| Production infra | **NOT IMPLEMENTED** | Vercel config exists but no provider/region, no staging, no backups, no monitoring, no CI | `DEPLOYMENT.md:436` |

**Honest boundary:** Member financial flows (ledger, withdrawals, vouchers) are **shell/UI placeholders + mock API** - they demo correctly (e.g., withdrawal deducts `availableBalance` via `subtractMoney`, ledger paginates cursor) but are **not production-financial** (no transaction, no audit, no negative-balance DB constraint, no idempotency durability).

---

## 21. Important Files & Entry Points

| Path | Lines | Symbol / Purpose |
|---|---|---|
| `apps/web/src/main.tsx:42` | 42 | Entry; `createMemberMockServer().install()` DEV, `QueryClientProvider`, `SupabaseSessionProvider`, `BrowserRouter` |
| `apps/web/src/app/App.tsx:337` | 337 | Route tree + `useCmsRealtime`, `PublicLayout` 12 routes + `MemberLayout` `RequireMember/RequireQualifiedMember` + `AdminRedirect` |
| `apps/web/src/app/PublicLayout.tsx:42` | 42 | Shell + `globalCms.messenger.hideOnAuth` Messenger hide |
| `apps/web/src/lib/supabase.ts:112` | 112 | `isSupabaseConfigured`, `cookieStorage`, `getSupabaseClient` PKCE `flowType:'pkce'`, `listMarketingToolsFromStorage`, `subscribeNotificationsRealtime` |
| `apps/web/src/lib/session.tsx:312` | 312 | `SessionProvider` branching (test/mock/Supabase/unauth), `SupabaseSessionProvider` `resolveRole` loops 3 table variants, `buildSessionUser` |
| `apps/admin/src/lib/session.tsx:298` | 298 | Admin mirror of above (identical logic) |
| `apps/web/src/lib/api/client.ts:115` | 115 | `rawRequest`, `request<T>(path,schema)`, `requestList`, `requestPage` `PageResult {items,nextCursor}` |
| `apps/web/src/lib/api/errors.ts:80` | 80 | `ApiError(code,status,requestId,details)`, `ApiParseError`, `ApiNetworkError`, `toApiError` |
| `apps/web/src/lib/cms.ts:205` | 205 | `getHomepageCms()`, `getAboutCms()`, `getGlobalCmsPublic()` fallback to `HOME/ABOUT/...` |
| `apps/web/src/lib/cmsRealtime.ts:97` | 97 | `useCmsRealtime()` broadcast + `postgres_changes` → `invalidateQueries(['cms',key])` |
| `apps/web/src/mock/handlers.ts:1263` | 1263 | `memberMockHandlers(store)` 40+ routes; constants `MAX_SALE_RESUBMISSIONS=3`; functions `currentMember`, `toSale`, `toCommission`, `toGroupNetwork`, `buildGenealogyNode` |
| `apps/web/src/features/member/services/member.ts:253` | 253 | 18 typed wrappers `getWallet`, `getLedgerPage(cursor,type,limit)→requestPage`, `submitSale(key) Idempotency-Key` etc. |
| `apps/web/src/features/public/content/properties.ts:414` | 414 | `PROPERTY_CATEGORIES[3]`, `PROPERTY_RECORDS[11]`, selectors `getPropertiesByCategory`, `getPropertyHeroPhoto` |
| `apps/web/src/features/public/content/images.ts:205` | 205 | `photoUrl(id,w)`, `LOGO`, `IMAGES`, `CATEGORY_IMAGES`, `HERO_IMAGES` |
| `api/v1/cms/[key].ts:368` | 368 | CMS handler GET/PUT + `verifyAdmin` + `extractCmsPhotoIds` + `getMarketingToolsCmsPath` + `X-CMS-Version` + orphan cleanup |
| `api/v1/cms/upload.ts:172` | 172 | Base64 upload `marketing-tools/cms/*` |
| `api/v1/cms/upload/sign.ts:190` | 190 | Signed upload URL generation |
| `api/dev-server.ts:198` | 198 | Local `:3000` `http.createServer` reusing handlers; `toVercelHeaders`, `parseBody`, route map |
| `supabase/migrations/20260829000001_auth_foundation.sql:81` | 81 | `Member, Role, MemberRole` + `pgcrypto` + RLS `auth.uid()`, seed `admin/user` |
| `supabase/migrations/20260830000001_cms_contents.sql:42` | 42 | `public.cms_contents` 8-key check + trigger `cms_contents_set_updated_at` + RLS anon read |
| `supabase/migrations/20260831000002_cms_realtime.sql:14` | 14 | `supabase_realtime` publication `cms_contents` |
| `supabase/seed.ts:286` | 286 | `createUser admin/user` + `Role` + `Member` + `MemberRole` + 8 `cms_contents` upserts |
| `supabase/README.md:55` | 55 | Env + migration + seed instructions; scope Phase 1 |
| `packages/contracts/src/index.ts:230` | 230 | Re-exports all schemas/types + `CMS_SEEDS` |
| `packages/contracts/src/schemas/cms.ts:812` | 812 | 8 content schemas + `cmsPhotoSchema`, `cmsCtaLinkSchema` |
| `packages/contracts/src/schemas/role.ts` | - | `roleSchema`, `normalizeRole` SUPER_ADMIN→admin |
| `packages/contracts/src/schemas/error.ts:40` | 40 | `errorEnvelopeSchema`, `apiErrorCodeSchema` 17 codes |
| `packages/contracts/src/schemas/money.ts:19` | 19 | `EXACT_DECIMAL_STRING_RE`, `exactDecimalStringSchema` |
| `packages/contracts/src/seeds/cms.ts:916` | 916 | `CMS_HOMEPAGE_SEED` … `CMS_REGISTER_SEED`, `CMS_SEEDS` record |
| `packages/shared/src/money.ts:97` | 97 | `toCents→BigInt`, `formatMoney` `Intl.NumberFormat en-PH PHP`, `compareMoney/addMoney/subtractMoney` |
| `packages/config/src/env.ts:30` | 30 | `vitePublicEnvSchema`, `loadPublicEnv(env)` |
| `packages/ui/src/styles/tokens.css:141` | 141 | `:root` `--color-brand-primary #2c6aa7`, spacing, typography, layout; `@media 640 header 70px` |
| `packages/ui/src/styles/base.css:85` | 85 | `box-sizing`, body sans, `:focus-visible 3px`, `.skip-link`, `prefers-reduced-motion` |
| `apps/web/src/test/utils.tsx:83` | 83 | `renderWithProviders`, `mockFetchRoutes(endsWith)`, `mockFetchJson`, `mockFetchNetworkError` |
| `apps/web/src/styles/global.css:75` | 75 | `.container` max 1200, `.prose 65ch`, `.table-scroll` |
| `apps/web/vite.config.ts:31` | 31 | React alias, port 5173, proxy `/api→:3000`, test jsdom |
| `apps/admin/vite.config.ts` | - | Port 5174 mirror |
| `vercel.json:17` | 17 | `buildCommand pnpm run build`, `output apps/web/dist`, `functions includeFiles packages/**` |
| `vercel.local.json:14` | 14 | Local build `turbo run build --concurrency=1`, `output public` |
| `AGENTS.md:66` | 66 | Monorepo SSOT stack `React/RN→TanStack Query→Vercel Functions→Supabase→Postgres` |
| `package.json:26` | 26 | Root scripts `dev/build/lint/typecheck/test/seed`, engines node >=20.19.0 |
| `pnpm-workspace.yaml:25` | 25 | `apps/* packages/* api` |
| `turbo.json:18` | 18 | `tasks build(dev persistent), lint, typecheck, test dependsOn ^build` |

---

## 22. Recommendations for Future Implementation

> Non-binding; each requiring human approval where noted (ROADMAP §11, ARCHITECTURE §16). Do not enact silently.

| # | Recommendation | Requires Approval | Rationale |
|---|---|---|---|
| 1 | Migrate CRM tables `sales, commissions, ledger_entries, member_balances, payout_accounts, withdrawals, vouchers, voucher_redemptions` with `NUMERIC(18,2)` + `CHECK ≥0` + `REVOKE UPDATE/DELETE` on financial/audit tables before exposing any financial Vercel handler | **Requires approval** - destructive schema, `DATABASE-DESIGN §18/22` business-rule change | BI-001..005 not enforced DB-side |
| 2 | Implement server `idempotency_keys` table hashed at rest (DATABASE-DESIGN U-06) + middleware on `POST /sales, /me/withdrawals, /vouchers/:id/redemptions, /financial-adjustments` returning stored `{body,status}` | Requires approval - TTL 24h PROPOSED `INTEGRATION-SPECIFICATION §8` | Prevent duplicate side effects |
| 3 | Add `audit_log` insert-only table + same-transaction writes in every use case per `SECURITY.md §13` before opening admin write routes | Requires approval - security boundary | NFR-SEC-002 traceability |
| 4 | Unify `api/` vs `apps/api/` - keep one source (recommend `api/` per Vercel) and delete duplication or generate symlink; align `zod` ^4.4.3 across packages | - (structural) | Drift debt §18 #1 |
| 5 | Consolidate tokens - delete `apps/web/src/styles/tokens.css` duplicate, import only `@jad/ui/tokens.css` | - | §18 #2 |
| 6 | Move mock fallback guard: `currentMember()` should return `undefined` (401) when `isSupabaseConfigured()` true, not `store.members[0]` | - (but auth behavior change → review) | §18 #4 hides real 401 |
| 7 | Add Vercel rate limiting (e.g., Upstash or `hono-rate-limiter`) on auth + redemption paths per `API-SPECIFICATION §5.2` | Requires approval - values TBD `SECURITY.md SA-03` | Abuse R-03 |
| 8 | Enable `apps/api` typecheck: change `package.json` script to `tsc --noEmit --project ../../tsconfig.base.json` with `include api/**/*` | - | §18 #5 silent type gaps |
| 9 | Decide CTO signing mechanism (KMS/HSM/air-gapped) `ARCH-DEC-006` before any `POST /vouchers` issuance; expose only `POST /signing/verify` `SYS` | **Requires CTO approval** | BI-008 boundary |
| 10 | Add CI workflow `.github/workflows/ci.yml` running `pnpm typecheck + lint + test` + secret scan | Requires approval - provider `ARCH-DEC-008` | §18 #7 §19 |
| 11 | For every new financial handler, mirror `packages/contracts` Zod + `listResponseSchema` + cursor pagination; never re-declare types | - | Established pattern §12 |
| 12 | Follow existing per-page CSS Modules `X.module.css` + `var(--space-*)` tokens; no inline hex | - | Design system §13 |
| 13 | Write tests colocated `<target>.spec.tsx` via `renderWithProviders` + `mockFetchRoutes endsWith`; assert BI invariants + object-level 404 hide | - | Testing pattern §14 |
| 14 | Keep money as exact-decimal strings via `@jad/shared` BigInt; never `parseFloat`/`toFixed` | - (rule BR-WAL-002) | Financial correctness |

---

## 23. Open Questions / Unknowns

| # | Question | Context | Owner / Decision |
|---|---|---|---|
| OD-001..005 | Domestic vs Abroad program differences (rules beyond PH-block) | `BUSINESS-RULES §12` | **REQUIRES OWNER APPROVAL** |
| OD-006..012 | Group Incentive eligibility, rate, formula, trigger, basis, timing, applicability (concept CONFIRMED only) | `FEATURES FEAT-041 DEFERRED P12`, `BUSINESS-RULES §12` | Owner |
| OD-013 | Sponsor-change permitted circumstances | `BR-REF-007`, `FEAT-022 BLOCKED` | Owner |
| OD-014/015 | Geolocation accuracy threshold + anti-spoofing technique | `FR-GEO-001`, `FEAT-017/018` | Owner/CTO |
| OD-016 | Final payout providers (banks/GCash/digital) | `FEATURES FEAT-047 BLOCKED` | Owner |
| OD-017/018 | Final withdrawal status model + workflow | `BR-WDR §5` `FEAT-051` | Owner |
| OD-019..023 | Voucher transferability, revocation, expiration, merchant permissions, partial redemption mode specifics | `FEATURES FEAT-058`, `BR-VCH` | Owner/CTO |
| OD-024 | Max registration attempts before limit (currently unlimited per `REQUIREMENTS.md`) | `FEATURES §6.1` | Owner |
| OD-025 | Total Earned definition (ledger-defined excluding pending) | `FEATURES FEAT-066 BLOCKED` | Owner |
| SA-01..13 | SECURITY requires-approval register: credential policy, CSRF mechanism, rate-limit values, Idempotency TTL 24h confirm, TLS pinning, encryption-at-rest specifics, Idempotency storage, file-upload malware scanning, dependency scanning, mobile secure storage, compliance scope, IR plan | `SECURITY.md §20` | Owner/CTO |
| NFR AVAIL/PERF/REL/SCAL-001 | Numeric targets | `REQUIREMENTS §7`, `DEPLOYMENT.md D-10` | Owner |
| ARCH-DEC-006 | CTO signing service mechanism (KMS/HSM/air-gapped) | `ARCHITECTURE §16`, `DEPLOYMENT.md D-24` | **CTO only** |
| ARCH-DEC-008 | Deployment provider/region, CI provider, orchestration, DB hosting, log aggregation | `DEPLOYMENT.md D-01..D-04` | Owner |
| ARCH-DEC-009 | Worker scheduler choice (pg_cron vs Vercel Cron vs BullMQ) | `BACKEND-ARCHITECTURE §13/21`, `DEPLOYMENT.md D-15` | Architect |
| FOLDER-STRUCTURE | `apps/mobile` placement if RN approved | `MOBILE-ARCHITECTURE §19` MA-02 | Owner |
| - | Rate-limit exact values + window | `API-SPECIFICATION §5.2` | Approver |
| - | RTO/RPO for backup/DR | `DATABASE-DESIGN §21`, `DEPLOYMENT.md D-10` | Owner |

### Investigation Limitations

* **No Git metadata/history:** `.git` absent; branch, commits, staleness `UNKNOWN`; verification via filesystem only (`ls -R`, `cat`).
* **No staging/production env validation:** No deployed URL, no `DATABASE_URL` to probe, no Supabase project verified (fallback URL `vudwoqduebdgtzvybywb` not probed).
* **No production database validation:** RLS, constraints, storage bucket existence only inferred from migrations `*.sql` + handlers + `supabase/README.md`.
* **No manual browser/E2E validation:** All route/UX assertions from source + Vitest jsdom specs; no `playwright` run nor DevTools manual check. Scroll, Messenger link, image `photo-*` rendering inferred from handler regex `photoUrl` + `images.ts`.
* **Unresolved business decisions:** 25 ODs + 12 ADRs + NFR TBD block performance/security/param reasoning; no invented thresholds.
* **Unavailable commands:** `git log/status/diff` not applicable; E2E tool not installed; no `psql` connectivity.
* **Files inspected:** All requested docs + handlers + migrations + seeds + package configs exhaustively read (see §21). No `supabase/migrations` beyond the 3 - confirmed via `ls -R supabase`.

---

## Evidence Rules (applied)

* Implemented behavior sourced from `api/`, `apps/api/`, `apps/web/src/**`, `apps/admin/src/**`, `packages/**`, `supabase/**`.
* Intended requirements sourced from `docs/` SSOT (REQUIREMENTS, BUSINESS-RULES, FEATURES, ROADMAP, ARCHITECTURE, API-SPECIFICATION, TECH-STACK, DATABASE-DESIGN, SECURITY, TESTING, DEPLOYMENT, etc.).
* Conflicts reported explicitly with `Status INCONSISTENT`; insufficient evidence marked `UNKNOWN`.
* No line number fabricated - counts from `Read` tool; symbol names included where useful.

---

*End of report - `docs/development/CODEBASE-LEARNING.md` is the ONLY modified artifact per task constraints.*
