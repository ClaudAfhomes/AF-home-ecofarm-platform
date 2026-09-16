# SESSION.md - handoff for a new chat session

Date: 2026-09-16 (UTC). This session (plan mode → build mode): planned then built
**Phase 1** (admin Members card, genealogy sponsor, `sale_qualify` COALESCE fix), **Phase 2**
(Supabase-native forgot-password + email verification), **Phase 3** (API perf: cached clients,
queues badge, lazy router, indexes, daily crons), then bug batch **H/I/J** (Role-grant login
fix, referral-commission generation + clearing, qualification `idVerified`), plus a live
`.00`-formatting bug found during verification. **Deployed twice** (`vercel --prod`); latest
production deployment is `jad-realty-yzysy8i1w-orlando-workspace-afhomes.vercel.app`
(aliased `https://jadrealty.vercel.app`). All working-tree changes below are **uncommitted**.

## Deployment - current state (the important part)

**Live site:** `https://jadrealty.vercel.app` (production alias of the `jad-realty` Vercel
project under `orlando-workspace-afhomes`). All deploys are **manual**: `pnpm dlx vercel
--prod` from the repo root (deploy source shows as the `staging` branch). Branch history is
`feature/chat` → merged/committed by the user; there is no git auto-deploy wired up.

**Topology (all one origin - required for auth):**

- `/` → web SPA (`apps/web/dist`)
- `/admin` → admin SPA (`apps/admin/dist`, Vite `base: '/admin/'` in production)
- `/api/v1/*` → ONE Vercel Function (`api/router.ts`)
- `/health` → readiness probe (`api/_handlers/health.ts`)
- `/crons/commission-clearing` → daily commission-clearing trigger (GET, see below)

**Supabase:** project `vudwoqduebdgtzvybywb.supabase.co` (URL is in root `.env`).
**Super-admin login is `jad@admin.com` / `SUPABASE_PROD_SUPERADMIN_PASSWORD`** (both in root
`.env`). `admin@jad.local` and `user@jad.local` **do not exist** on the deployed DB - do not
suggest them. Migrations + seed are applied (`pnpm db:migrate` uses root `.env`
`DATABASE_URL`; versions recorded in `supabase_migrations.schema_migrations`).

**New endpoints since the last handoff:**

- `POST /auth/verify-email`, `POST /auth/verify-email/resend` (Supabase OTP; real API, was
  mock-only) - `api/_handlers/auth/verify-email[.ts|/resend.ts]`, anon client via
  `api/_lib/otp.ts`
- `POST /admin/commissions/clear-due` (staff `withdrawals`+FINANCE_VIEW, audited)
- `GET /crons/commission-clearing` (daily Vercel cron; **intentionally unauthenticated** -
  idempotent + time-gated, can create no money; system actor)
- Frontend routes: `/auth/forgot-password`, `/auth/reset-password` (Supabase
  `resetPasswordForEmail` → PKCE recovery session → `updateUser`)

**New migrations applied (all live, verified in prod):**

- `20261016000001_sale_qualify_coalesce_fix.sql` - `(v_patch ->> 'sellerId')::uuid` cast
  (was: `COALESCE types text and uuid cannot be matched` on every confirm)
- `20261016000002_list_order_indexes.sql` - `Member(createdAt)`, `Sale(submittedAt)`,
  `Sale(sellerId,submittedAt)`, `Commission(memberId,createdAt)`
- `20261017000001_role_authenticated_read.sql` - `grant select (slug, name) on "Role" to
authenticated` (fixes member-login 42501; see Phase H)
- `20261017000002_sale_qualify_referral_fix.sql` - per-`commissionType` idempotency + missing-
  `DIRECT_REFERRAL` backfill
- `20261017000003_commission_clearing.sql` - `commission_clear`, `commission_clear_batch`,
  `SystemConfig COMMISSION_CLEARING_DAYS='7'` (service_role-only; also added to
  `CONFIG_SEEDS`)
- `20261017000004_member_id_verified.sql` - `Member.idVerified` + backfill (0 remaining)
- `20261017000005_commission_clear_format_fix.sql` - `…990.00` mask (see `.00` lesson below)

### How the deploy is wired

- `scripts/prepare-vercel-env.mjs` - writes `VITE_WEB_URL`/`VITE_ADMIN_URL` into
  `apps/{web,admin}/.env.production` from **`VERCEL_PROJECT_PRODUCTION_URL`** (fallback
  `VERCEL_URL`). MUST be the canonical host, otherwise login redirects to a per-deployment URL
  (different origin → different localStorage → login loop). Do not set these vars in Vercel env.
- `scripts/assemble-vercel-output.mjs` - copies `apps/web/dist` → `vercel-static/` and
  `apps/admin/dist` → `vercel-static/admin/`.
- `vercel.json` - `framework: null`, buildCommand chain (prepare → `turbo run build` →
  assemble), `outputDirectory: vercel-static`, rewrites (`/api/v1/:path*`→`/api/router`,
  `/health`→`/api/router?path=health`, `/admin*`→admin index, `/(.*)`→web index),
  `functions: { "api/router.ts": { "includeFiles": "packages/**" } }`, and `crons`:
  `/health` daily `0 0 * * *` (midnight UTC = 8am PHT) + `/crons/commission-clearing` daily
  `0 1 * * *`. **Hobby allows max 2 daily crons** - an hourly schedule is rejected at
  deploy validation (`Hobby accounts are limited to daily cron jobs`); keep both daily.
- **CRITICAL:** `includeFiles` must stay `packages/**`. Narrowing it (e.g. to
  `packages/contracts/src/**`, or even `packages/{contracts,shared}/{src/**,package.json}`)
  risks a runtime `ERR_MODULE_NOT_FOUND .../@jad/contracts/src/index.ts` (workspace packages
  resolve through `node_modules` symlinks that need the full package dir; the compiled func
  also rewrites `src/*.ts`→`*.js` while `exports` points at `.ts`). Tried and reverted this
  session - do not retry without a live runtime test.
- `.vercelignore` - excludes `**/*.spec.ts(x)`, `api/dev-server.ts`, `supabase/`, `docs/`,
  `node_modules/`, `.turbo/`, `vercel-static/`, **`.env*` (keeps `.env.example`)**, `.vercel/`,
  `test-cleanup.ts`, `test-realtime.ts`. Without the `.env*`/`.vercel/` rules the CLI uploads
  secrets into every deployment snapshot.
- `.gitignore` - added `vercel-static/`.

### Single-function API (Vercel Hobby caps at 12 functions)

- `api/v1/**` handlers live in **`api/_handlers/**`** (underscore dirs are not functions).
- `api/_lib/router.ts` - shared URL→handler router. **Handlers are now lazy-loaded**
  (`lazy(() => import(...))` per branch, cached per instance - cold-start win); shared libs
  stay eager. `api/_lib/route-coverage.ts` recognizes dynamic-import branches; a new handler
  still needs a branch or `route-coverage.spec.ts` fails CI.
- `api/router.ts` - the single Vercel Function; `resolveRequestUrl` rebuilds the path from the
  rewrite's `?path=` param.
- `api/_handlers/health.ts` - `GET /health` + `/api/v1/health`, DB readiness probe.
- `api/_lib/rest.ts` - `serviceClient()`/`anonClient()` are **cached per instance** (keyed by
  key); `requireService` delegates. All handlers that built clients directly now use the
  cache (3 `createClient`/request → 1). Cache types come from unannotated `make*Client`
  factories (call-inferred) - see lesson below.
- `api/_lib/cors.ts` - `setCors` allow-list helper (no wildcard); applied to `admin/session`,
  `cms/upload`, `cms/upload/sign`, `cms/[key]`, `registration/location-verify`.
- `api/_lib/env.ts` - no hardcoded URL fallback (fail loudly); trims `url`/`serviceKey`/`anonKey`.
- `api/tsconfig.json` - include `_handlers/**`, `router.ts`, `dev-server.ts`.

### What this session built (all uncommitted, most deployed)

- **Admin dashboard:** Payouts queue card replaced by a **Members** card (total non-archived
  members, neutral "registered" chip, excluded from pending sum; `adminQueuesSchema`
  `payouts`→`members`, handler counts `Member`).
- **Genealogy:** tree now returns `sponsor` + `ancestors` (new `ancestorChainOf`, topmost→sponsor);
  `MyGenealogyPage` shows a "Sponsorship" chain; approval **rejects 400** on unresolvable
  sponsor codes (was silent skip), resolved before auth provisioning.
- **Auth:** forgot-password pages + real verify-email endpoints (Supabase OTP; register sends
  OTP on all success paths, best-effort). `session.tsx` skips orphan force-sign-out on
  `PASSWORD_RECOVERY` events (otherwise unapproved applicants lose the recovery session).
- **Perf:** cached clients; `AdminLayout` badge via cheap `GET /admin/queues` (was the full
  registrations list on every page); lazy router imports; order indexes; daily crons.
- **Phase H (login):** root cause was `20260930000001` revoking `authenticated`'s
  `Role SELECT(slug,name)`; restored by migration (verified: exactly `name,slug`; anon none).
- **Phase I (referral money):** per-type idempotency; `sponsorId` linkable via quick-create
  `referralCode` + super_admin PATCH link/unlink (with auto-repair of missing referrals for
  that member's qualifying sales, exact-decimal integer math); admin detail shows sponsor +
  link UI (`adminMemberSchema` += `sponsorId/sponsorReferralCode/sponsorName`);
  `commission_clear(_batch)` + `COMMISSION_CLEARING_DAYS` + cron + `commissionClearBatchSchema`.
- **Phase J (qualification):** `Member.idVerified` set at approval, cleared on resubmit;
  `qualification.ts` reads the flag (Registration fallback only while pending) → approved
  members with IDs show 100% automatically.

### Production auth fixes (cumulative)

- Bearer header on every request; 401 → one rotation → retry → `clearSession` (no warning for
  public requests). `VITE_SUPABASE_ANON_KEY` trimmed (trailing-newline `%0A` realtime bug).
- Role reads for login go through the restored `authenticated` `SELECT(slug,name)` grant.

### Security audit - done + still open

Done: secrets excluded, hardcoded URL removed, CORS scoped, `/health`, money functions +
`commission_clear(_batch)` service_role-only, cron trigger intentionally public (idempotent +
time-gated), SELECT-only Role re-grant (rls_invariants #1-3,#7 PASS).
**Still open (do these next):**

1. **Rate limiting** on public endpoints (`/auth/register`, `/registration/location-verify`,
   `POST /contact` when built) - API-SPEC §5.2.
2. **Decide staging-vs-public:** `jadrealty.vercel.app` is the production URL, registration is
   open, and it shares the DB that will later hold production data.
3. **Clean the Vercel env var `VITE_SUPABASE_ANON_KEY`** - trailing newline (realtime `%0A`).
4. **Rotate the Supabase service-role key** - pre-`.vercelignore` snapshots may hold it.
5. **Supabase dashboard → Authentication → URL Configuration:** Site URL
   `https://jadrealty.vercel.app` + redirect URL `.../auth/reset-password` (forgot-password
   needs it; not yet confirmed done).
6. **Orlando's missing referral:** sale `sal-mu2w09bk` is QUALIFYING_SALE but seller
   `sponsorId` is null → admin → Members → Orlando → link member 2's code (super_admin);
   the repair auto-issues the 4% `DIRECT_REFERRAL`, then the daily cron (or
   `POST /admin/commissions/clear-due`) clears it to wallet. Note: wallet shows ~688,000.00
   in other PENDING commissions - clears on schedule.

## Repo map

Root: `C:\Users\SSD-ORLANDO\Documents\Project\jad-realty` (pnpm + Turborepo).

- `apps/web` (`:5173`) - member/public SPA (React 19 + Vite 8). Prod base `/`.
- `apps/admin` (`:5174`) - staff SPA. Prod base `/admin/`.
- `api/` - `api/router.ts` (single Vercel Function), `api/_handlers/**`, `api/_lib/**`
  (auth/rbac/router/cors/money/pipeline/otp/…), `api/dev-server.ts` (local :3000).
- `packages/contracts` - DTO types + Zod schemas, single source; now also
  `resendVerificationRequestSchema`, `commissionClearBatchSchema`, admin member sponsor fields.
- `packages/config`, `packages/shared` - typed env; framework-free utils.
- `packages/mock`, `packages/ui` - test mocks/session fixtures; tokens + shared components.
- `scripts/` - `prepare-vercel-env.mjs`, `assemble-vercel-output.mjs`.
- `vercel-static/` - assembled deploy output (gitignored).
- `supabase/migrations/` - one idempotent migration per change + header validation queries;
  `supabase/seed.ts` (now seeds `COMMISSION_CLEARING_DAYS`); `supabase/security/rls_invariants.sql`
  (empty = PASS, except documented `is_staff_user` §5; Q2/Q3 storage/staff-table findings are
  pre-existing managed-project state, untouched by these phases).
- `docs/` - SSOT; **never reformat** (`.prettierignore`). Largely stale (still claims
  "documentation-only"); `AGENTS.md` + this file + code are authoritative.

## Stack / conventions (do not violate)

- Money is exact-decimal **strings**; format with `@jad/shared`; no float math anywhere
  (including TS repair math - use integer/BigInt).
- `to_char(x, 'FM…99.00')` renders zero as **`.00`**, which violates the exact-decimal CHECK
  and contracts - always use the `…990.00` mask (trailing `0` forces `0.00`). Bit us live on
  the cron endpoint (500) before the fix.
- All HTTP via typed clients (`request`/`requestList`/`requestPage`/`requestListEnvelope`)
  validated against `@jad/contracts`; no ad-hoc `fetch` in features.
- Authenticated users: SELECT-only RLS on identity/member tables; all writes via service-role
  handlers or `SECURITY DEFINER` functions. `Role` reads are restricted to `slug`/`name`.
- Money transitions are atomic DB functions (withdraw_*, `sale_qualify`, `commission_clear*`)
- single transaction, wallet row-locked, ledger + wallet + audit in one unit; EXECUTE
  restricted to `service_role`. Never re-implement money state changes as sequential API writes.
- Migration discipline: one migration per change, idempotent; run the validation queries in
  each file header before applying; include a down note. `.sql` files are hand-formatted
  (no SQL prettier in repo). Apply with `pnpm db:migrate` (root `.env` `DATABASE_URL`;
  versions in `supabase_migrations.schema_migrations`).
- CSS Modules per component; tokens in `@jad/ui`.
- Tests colocated `*.spec.ts(x)`; web `renderWithProviders`/`mockFetchRoutes`; admin
  `installMockApi()` (install + `server.install()`/`restore()` per test).
- Secrets never committed; root `.env` gitignored AND excluded from Vercel uploads. Do not
  paste keys into chat/docs.
- Deployment is Vercel + Supabase, single-origin, one API function (Hobby cap 12); see above.

## Verification status

- `pnpm typecheck`: 8/8 workspaces pass. `pnpm exec turbo run build` + assemble OK.
- Tests: api **448/448**, contracts 75, ui 42, mock 10, web **355**, admin **500** (known
  **pre-existing** admin CMS/policy parallel-load flakes + one genealogy collapse-timing flake
  pass in isolation - rerun those if they fail once).
- `pnpm dlx vercel build --yes` produces exactly **1 function**, exit 0; check
  `.vercel/output/config.json` routes when debugging routing. NOTE: the build log prints
  `SupabaseAuthClient` TS notes (`Property 'admin'/'getUser'/… does not exist`) - verified
  **pre-existing and non-blocking** (pristine HEAD prints 20 and deploys fine); the func ships
  supabase-js without `.d.ts`.
- `pnpm db:migrate` - idempotent; new versions recorded; always re-check grants + run
  `rls_invariants.sql` after money/grant batches.
- Live probes: `GET /health` → `{ok:true,db:"ok"}`; `GET /api/v1/crons/commission-clearing`
  → `{cleared,total,windowDays}`; responses ~1.0-1.8s (was 8s). Rolled-back live test proved
  the full clear path (AVAILABLE + wallet + CREDIT ledger, self-healing pending recompute).
- Vercel function logs: `pnpm dlx vercel logs <deployment-url>` (exact
  `jad-realty-<hash>-orlando-workspace-afhomes.vercel.app` URL from `vercel ls --prod`).

## Useful commands

- Local: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`,
  `pnpm seed`, `pnpm db:migrate [--mark-existing]`.
- Local API: `pnpm exec tsx api/dev-server.ts` (:3000; Vite proxies `/api`).
- Deploy: `pnpm dlx vercel --prod` (login/link already done; `vercel ls --prod` to list).
- Single spec: `pnpm --filter @jad/admin exec vitest run <path>` (same per workspace).
- Read-only prod DB check: `node -e` with `pg` + root `.env` `DATABASE_URL` (SELECTs only;
  wrap write-tests in `BEGIN`/`ROLLBACK`).

## Session notes for the next agent

- **Login account is `jad@admin.com`** (password in root `.env`) on the deployed Supabase.
- **The `includeFiles` must remain `packages/**`** - narrowing crashes the deployed function.
- **Hobby cron limit: max 2 daily crons** - hourly schedules are rejected at deploy
  validation; keep `/health` + `/crons/commission-clearing` daily.
- **`VITE_WEB_URL`/`VITE_ADMIN_URL` are auto-derived** from `VERCEL_PROJECT_PRODUCTION_URL`;
  never set them in Vercel env, and never log into an old per-deployment URL (cross-origin loop).
- **Cached Supabase clients** (`serviceClient()`/`anonClient()` in `api/_lib/rest.ts`) must keep
  call-inferred types via the unannotated `make*Client` factories - `ReturnType<typeof
createClient>` breaks `.from()` typing (`never[]`); bare `SupabaseClient` is fine locally
  but keep the factory form (it passes both).
- Shared mock stores are module singletons - tests that mutate them affect later tests; reset in
  `beforeEach`.
- jsdom has no canvas: QR upload-decode specs stub `Image` + `getContext` and use
  `fireEvent.change`.
- `vi.restoreAllMocks()` can break `@supabase/supabase-js` mocks in api specs - prefer
  builder-level error injection.
- `git stash`/`pop` converts working-tree line endings (CRLF); run `pnpm format` after to
  renormalize (HEAD was prettier-clean, so only touched files change).
- The `SESSION.md` working-tree modification predates these phases (never edited until now).
- Docs (`docs/deployment/DEPLOYMENT.md` etc.) claim "documentation-only / no deploy" - stale.
  The deploy described here is real and authoritative.
- Proposed-but-unbuilt backlog (from the approved plan): contact page + admin Inquiries queue,
  programs CRUD + `{{programs}}` token in policies, responsive public nav drawer, dashboard
  Spinner/shaped skeletons, SweetAlert-everywhere (admin+web, success+errors, drop
  `ToastProvider`), real Terms/Privacy copy (user supplies), rate limiting, staging-vs-public
  decision, anon-key newline cleanup, service-role rotation, splitting the API into multiple
  functions if cold starts still hurt.
