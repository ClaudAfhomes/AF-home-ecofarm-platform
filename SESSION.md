# SESSION.md — handoff for a new chat session

Date: 2026-09-16 (UTC). Earlier sessions built the member/admin features (referrer
dropdown, vouchers definition+assign+scan, config-connectivity, registrations queue fix).
This session was almost entirely **deployment**: getting the monorepo live on **Vercel +
Supabase**, and fixing every issue that surfaced (function-count limit, missing-auth 401s,
login loops, realtime failures, a function crash, a security audit).

## Deployment — current state (the important part)

**Live site:** `https://jadrealty.vercel.app` (production alias of the `jad-realty` Vercel
project under `orlando-workspace-afhomes`). Old `jad-realty.vercel.app` now 404s. All deploys
are **manual**: `pnpm dlx vercel --prod` from the repo root (git metadata shows the deploy
source as the `staging` branch). Branch history is `feature/chat` → merged/committed by the
user; there is no git auto-deploy wired up.

**Topology (all one origin — required for auth):**

- `/` → web SPA (`apps/web/dist`)
- `/admin` → admin SPA (`apps/admin/dist`, Vite `base: '/admin/'` in production)
- `/api/v1/*` → ONE Vercel Function (`api/router.ts`)
- `/health` → readiness probe (`api/_handlers/health.ts`)

**Supabase:** project `vudwoqduebdgtzvybywb.supabase.co` (URL is in root `.env`).
**Super-admin login is `jad@admin.com` / `SUPABASE_PROD_SUPERADMIN_PASSWORD`** (both in root
`.env`). `admin@jad.local` and `user@jad.local` **do not exist** on the deployed DB — do not
suggest them. Migrations + seed are applied.

### How the deploy is wired

- `scripts/prepare-vercel-env.mjs` — writes `VITE_WEB_URL`/`VITE_ADMIN_URL` into
  `apps/{web,admin}/.env.production` from **`VERCEL_PROJECT_PRODUCTION_URL`** (fallback
  `VERCEL_URL`). MUST be the canonical host, otherwise login redirects to a per-deployment URL
  (different origin → different localStorage → login loop). Do not set these vars in Vercel env.
- `scripts/assemble-vercel-output.mjs` — copies `apps/web/dist` → `vercel-static/` and
  `apps/admin/dist` → `vercel-static/admin/`.
- `vercel.json` — `framework: null`, buildCommand chain (prepare → `turbo run build` →
  assemble), `outputDirectory: vercel-static`, rewrites (`/api/v1/:path*`→`/api/router`,
  `/health`→`/api/router?path=health`, `/admin*`→admin index, `/(.*)`→web index), and
  `functions: { "api/router.ts": { "includeFiles": "packages/**" } }`.
- **CRITICAL:** `includeFiles` must stay `packages/**`. Narrowing it (e.g. to
  `packages/contracts/src/**`) crashes the function at load with
  `ERR_MODULE_NOT_FOUND .../@jad/contracts/src/index.ts` (workspace packages resolve through
  `node_modules` symlinks that need the full package dir). This bit us once already.
- `.vercelignore` — excludes `**/*.spec.ts(x)`, `api/dev-server.ts`, `supabase/`, `docs/`,
  `node_modules/`, `.turbo/`, `vercel-static/`, **`.env*` (keeps `.env.example`)**, `.vercel/`,
  `test-cleanup.ts`, `test-realtime.ts`, the stray `C：Users…lint.txt` (now deleted from git).
  Without the `.env*`/`.vercel/` rules the CLI uploads secrets into every deployment snapshot.
- `.gitignore` — added `vercel-static/`.

### Single-function API (Vercel Hobby caps at 12 functions)

- `api/v1/**` handlers moved to **`api/_handlers/**`** (same depth → all relative imports
  preserved). Underscore dirs are not treated as functions.
- `api/_lib/router.ts` — the shared URL→handler router (`selectHandler`, `routeRequest`,
  `resolveRequestUrl`) extracted from the old `api/dev-server.ts`. Both the dev server and the
  Vercel function dispatch through it. Add a new handler there (import + branch) or
  `route-coverage.spec.ts` fails CI.
- `api/router.ts` — the single Vercel Function; `resolveRequestUrl` rebuilds the path from the
  rewrite's `?path=` param (robust whether the runtime exposes original or rewritten `req.url`).
- `api/_handlers/health.ts` — `GET /health` + `/api/v1/health`, DB readiness probe.
- `api/_lib/cors.ts` — `setCors` allow-list helper (no wildcard); applied to `admin/session`,
  `cms/upload`, `cms/upload/sign`, `cms/[key]`, `registration/location-verify`.
- `api/_lib/env.ts` — removed the hardcoded `vudwoq…` fallback; a placeholder URL now resolves
  to `undefined` (fail loudly). Also trims `url`/`serviceKey`/`anonKey`.
- `api/tsconfig.json` — include `_handlers/**`, `router.ts`, `dev-server.ts`.

### Production auth fixes

- `apps/{web,admin}/src/lib/api/client.ts` — every request now attaches
  `Authorization: Bearer <token>` from `getSupabaseClient().auth.getSession()` (production uses
  localStorage, so the PKCE cookie is NOT present — without the header every authenticated call
  returned `401 "Missing authentication"`). 401 → one token rotation → retry → else `clearSession`
  with a `console.warn`. No warning for public requests without a session (that was noisy).
- `requestListEnvelope` added to the admin client — the registrations queue fetch was a raw
  unauthenticated `fetch` (the last raw-fetch gap); `getRegistrationsPage` now uses it and keeps
  `meta.invalid`.
- `apps/{web,admin}/src/lib/supabase.ts` — `.trim()` the URL + anon key (a trailing newline in
  `VITE_SUPABASE_ANON_KEY` produced `apikey=…%0A` and broke Realtime).

### Security audit — done + still open

Done: secrets excluded from upload (`.vercelignore`), hardcoded URL removed, CORS scoped,
`/health` added, stray files cleaned.
**Still open (do these next):**

1. **Rate limiting** on public endpoints (`/auth/register`, `/registration/location-verify`) —
   none implemented; registration spam/brute-force risk (API-SPEC §5.2 calls for it).
2. **Decide staging-vs-public:** `jadrealty.vercel.app` is the production URL, registration is
   open, and it shares the DB that will later hold production data. If it must be staging-only,
   add Vercel Deployment Protection or a separate project.
3. **Clean the Vercel env var `VITE_SUPABASE_ANON_KEY`** — it still has a trailing newline
   (realtime `%0A`). Re-paste clean.
4. **Rotate the Supabase service-role key** — it was in uploaded `.env` snapshots before the
   `.vercelignore` fix; treat old snapshots as compromised.
5. Redeploy HEAD `6f36a11` (`vercel --prod`) — the latest client fix is committed but may not
   be live yet.

## Repo map

Root: `C:\Users\SSD-ORLANDO\Documents\Project\jad-realty` (pnpm + Turborepo, branch `feature/chat`).

- `apps/web` (`:5173`) — member/public SPA (React 19 + Vite 8). Prod base `/`.
- `apps/admin` (`:5174`) — staff SPA. Prod base `/admin/` (served under `/admin` on the same origin).
- `api/` — the API: `api/router.ts` (single Vercel Function), `api/_handlers/**` (handlers),
  `api/_lib/**` (auth/rbac/router/cors/money/pipeline/…), `api/dev-server.ts` (local :3000).
- `packages/contracts` — DTO types + Zod schemas, single source for shared types.
- `packages/config` — typed public env (`loadPublicEnv`).
- `packages/shared` — framework-free utils (money formatting, voucher expiry).
- `packages/mock`, `packages/ui` — test mocks/session fixtures; design tokens + shared components.
- `scripts/` — `prepare-vercel-env.mjs`, `assemble-vercel-output.mjs` (Vercel build helpers).
- `vercel-static/` — assembled deploy output (gitignored).
- `supabase/migrations/` — one idempotent migration per change; `supabase/seed.ts`;
  `supabase/security/rls_invariants.sql` (empty = PASS, except the documented `is_staff_user` §5 exception).
- `docs/` — SSOT; **never reformat** (`.prettierignore`). Largely stale (still claims
  "documentation-only"); `AGENTS.md` + this file + code are authoritative.

## Stack / conventions (do not violate)

- Money is exact-decimal **strings**; format with `@jad/shared`; no float math.
- All HTTP via typed clients (`request`/`requestList`/`requestPage`/`requestListEnvelope`)
  validated against `@jad/contracts`; no ad-hoc `fetch` in features.
- Authenticated users: SELECT-only RLS on identity/member tables; all writes via service-role
  handlers or `SECURITY DEFINER` functions.
- CSS Modules per component; tokens in `@jad/ui`.
- Tests colocated `*.spec.ts(x)`; web `renderWithProviders`/`mockFetchRoutes`; admin
  `installMockApi()` (install + `server.install()`/`restore()` per test).
- Secrets never committed; root `.env` gitignored AND now excluded from Vercel uploads. Do not
  paste keys into chat/docs.
- Deployment is Vercel + Supabase, single-origin, one API function; see "Deployment" above.

## Verification status

- `pnpm typecheck`: 8/8 workspaces pass. `pnpm exec turbo run build` + assemble OK.
- Tests: api 423/423, contracts 70, ui 42, mock 10, web 345, admin 497 (known **pre-existing**
  admin CMS/policy parallel-load flakes pass in isolation — rerun those if they fail once).
- `pnpm dlx vercel build --yes` produces exactly **1 function**; check
  `.vercel/output/config.json` routes when debugging routing.
- Vercel function logs: `pnpm dlx vercel logs <deployment-url>` (use the exact
  `jad-realty-<hash>-orlando-workspace-afhomes.vercel.app` URL from `vercel ls --prod`).
- Deployed-site probes: `GET /health`, `GET /api/v1/config/public`, and sign-in via
  `jad@admin.com` then `GET /api/v1/admin/session` with the Bearer.

## Useful commands

- Local: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`,
  `pnpm seed`, `pnpm db:migrate [--mark-existing]`.
- Local API: `pnpm exec tsx api/dev-server.ts` (:3000; Vite proxies `/api`).
- Deploy: `pnpm dlx vercel --prod` (login/link already done; `vercel ls --prod` to list).
- Single spec: `pnpm --filter @jad/admin exec vitest run <path>` (same per workspace).

## Session notes for the next agent

- **Login account is `jad@admin.com`** (not `admin@jad.local`) on the deployed Supabase.
- **The `includeFiles` must remain `packages/**`** — narrowing crashes the deployed function.
- **`VITE_WEB_URL`/`VITE_ADMIN_URL` are auto-derived** from `VERCEL_PROJECT_PRODUCTION_URL`;
  never set them in Vercel env, and never log into an old per-deployment URL (cross-origin loop).
- Shared mock stores are module singletons — tests that mutate them affect later tests; reset in
  `beforeEach`.
- jsdom has no canvas: QR upload-decode specs stub `Image` + `getContext` and use
  `fireEvent.change`.
- `vi.restoreAllMocks()` can break `@supabase/supabase-js` mocks in api specs — prefer
  builder-level error injection.
- Docs (`docs/deployment/DEPLOYMENT.md` etc.) claim "documentation-only / no deploy" — stale.
  The deploy described here is real and authoritative.
