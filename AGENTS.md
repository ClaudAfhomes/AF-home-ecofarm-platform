# AGENTS.md

pnpm + Turborepo monorepo for the JAD realty platform. Stack per **Q1 2026-08-30: React/RN → TanStack Query → Vercel Functions/REST API → Supabase → PostgreSQL** (Supabase + Vercel infra). `apps/web` (`:5173`) + `apps/admin` (`:5174`) are React 19 + Vite 8 SPAs; backend is **Vercel Functions** (`api/` or `apps/api/api/`). No Git repo.

## Layout

- `apps/web` + `apps/admin` - SPAs (`apps/web` `:5173`, `apps/admin` `:5174`). Entry `src/main.tsx`. Routing/layout in `src/app/`, shared primitives in `src/components/`, feature slice in `src/features/public/` (pages, components, hooks, `content/`).
- `api/` (or `apps/api/api/`) - Vercel Functions / REST API (`/api/v1`), Supabase JWT verified server-side per Q3, single `cms_contents(key, content JSONB, version)` table (Q2), hybrid images `photo-*` + `marketing-tools` (Q4), `updatedAt/By` only (Q5), public fallback to static (Q6). No NestJS.
- `supabase/` - migrations + seed (`supabase/migrations/`, `supabase/seed.ts`); CMS seed upserts 8 keys.
- `packages/contracts` - DTO types + Zod schemas + error envelope. **Single source** for shared types; never re-declare them in apps.
- `packages/config` - typed env schema (`loadPublicEnv`).
- `packages/shared` - framework-free utilities only (money formatting). No React, no business logic.
- `docs/` - SSOT; **never reformatted** (`.prettierignore`). Read it before inventing business rules, copy, or API contracts. Many docs still claim the repo is "documentation only" - stale; the code above is authoritative.

## Database invariants (post Phase 1-4 remediation)

- **No hard member deletion.** Members own financial history (`Wallet`, `LedgerEntry`, `Commission`, `Sale`, `Customer`) held by `ON DELETE RESTRICT` FKs; the sanctioned lifecycle is Archive (`POST /admin/members/:id/archive`). Owner-approved exception (2026-09-09): `DELETE /admin/members/:id` performs a super_admin-only permanent purge via the `member_purge_cascade` SECURITY DEFINER function (single transaction, mandatory reason, `MEMBER_PURGED` audit) plus auth-user removal - the sole member hard-delete path. Archive remains the default; never add any other member hard-delete path. `StaffUser` is the exception: it owns no financial history, so `DELETE /admin/staff/:id` (self-delete and last-governor guarded) is the sanctioned staff lifecycle. Staff and member identities are strictly separate (`StaffUser` + `StaffAssignment` vs `Member` + `MemberRole`); no human holds both profiles.
- **Authenticated users have SELECT-only RLS on `Member`/`MemberRole` and NO table privileges to write them** - all member writes go through service-role API handlers or SECURITY DEFINER functions. `Role` reads are restricted to `slug`/`name`. Before adding any anon/authenticated policy, confirm it is SELECT-only.
- **Money transitions are atomic DB functions** (`withdraw_reserve`, `withdrawal_complete`, `withdrawal_reject`) - single transaction, wallet row-locked, ledger + wallet + audit in one unit; EXECUTE restricted to `service_role`. Never re-implement money state changes as sequential API writes.
- **Money is exact-decimal text** (`CHECK` format regex on every money/rate column); statuses are DB-enforced `CHECK`s mirroring `@jad/contracts`. Keep wire formats unchanged.
- **Migration discipline:** one migration per change, idempotent; run the validation queries in each file header before applying; add CHECK/UNIQUE only after backfill; include a down note naming constraints/functions to drop. Run `supabase/security/rls_invariants.sql` (empty = PASS) after each batch. `.sql` files are hand-formatted (no SQL prettier in repo).

## Commands (run from root)

```sh
pnpm install
pnpm dev            # vite dev server on :5173
pnpm test           # vitest run (all workspaces)
pnpm typecheck      # tsc --noEmit (all workspaces)
pnpm lint           # eslint (apps/web only)
pnpm build          # apps/web only
pnpm format         # prettier --write . (docs/ excluded by .prettierignore)
```

Scoped to one workspace: `pnpm --filter @jad/web <script>`. Workspaces: `@jad/web`, `@jad/contracts`, `@jad/config`, `@jad/shared`.

Single test file: `pnpm --filter @jad/web exec vitest run src/features/public/pages/HomePage.spec.tsx` (same pattern in packages; they run vitest in node env, web runs in jsdom via `vite.config.ts`).

Only `apps/web` has `build`/`lint` scripts. Packages have no build step - they export raw TS source (`exports: "./src/index.ts"`) and are type-checked/compiled by the consuming app. Edit a package and it takes effect immediately in `apps/web`.

## Environment

- Only `VITE_`-prefixed vars ship to the client. `VITE_API_BASE_URL` defaults to `/api/v1` (same-origin). Typed at runtime by `@jad/config` in `apps/web/src/lib/env.ts`.
- Never commit `.env*`; copy `apps/web/.env.example` to `.env.local` for overrides.

## Temporary Auth Accounts (Phase 1 - Supabase)

Reuses **member** `LoginPage` (Supabase Auth `supabase.auth.signInWithPassword` via `SupabaseSessionProvider`, PKCE cookieStorage). No dedicated `admin` login page yet.

- `ADMIN` - `admin@jad.local` / `SUPABASE_SEED_ADMIN_PASSWORD` (env, never committed) → `/admin` (`admin` role via `MemberRole`)
- `USER` - `user@jad.local` / `SUPABASE_SEED_USER_PASSWORD` → `/user` (`user` role)

Legacy `F0 mock` (`superadmin@gmail.com` / `P@ssword`, localStorage `jad:mock:session`) remains only when `VITE_SUPABASE_URL` is unset (dev fallback / tests). After login, `LoginPage` role-redirects `admin` → `/admin`, `user` → `/user`; cross-role → denied. `logout` via `supabase.auth.signOut()`.

## Supabase (Auth foundation - Phase 1)

`Supabase Postgres 15+` is the managed implementation of the `PostgreSQL` SSOT (`docs/database/DATABASE-DESIGN.md §4`). `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public, `VITE_`) + server-only `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (never `VITE_`) + `SUPABASE_SEED_ADMIN_PASSWORD` / `SUPABASE_SEED_USER_PASSWORD` (local `.env` only, never committed). Auth is `Supabase Auth` (`email/password`) via `apps/web/src/lib/supabase.ts` and `apps/web/src/lib/session.tsx` (`SupabaseSessionProvider`). Roles `admin` / `user` via `Member` + `Role` + `MemberRole` (`admin@jad.local` / `user@jad.local` - passwords from env). `RLS` `Member auth.uid()=id`, `Storage` bucket `marketing-tools`, `Realtime` `notifications`. Prisma has been removed - migrations live in `supabase/migrations/`, seed in `supabase/seed.ts` (`pnpm seed`).

## Authentication (fresh-start)

- **Stack:** Supabase + PostgreSQL + Supabase Auth + TanStack Query + React 19 + Vite 8 + TypeScript + Vercel Functions. **No Prisma / no ORM. No NestJS (superseded by Q1 - see ADR-002b).**
- **Accounts:** `admin@jad.local` → `/admin`, `user@jad.local` → `/user` (seeded via `supabase/seed.ts` using `SUPABASE_SERVICE_ROLE_KEY`, passwords from `SUPABASE_SEED_*` env).
- **Flow:** `POST` via `supabase.auth.signInWithPassword` (`apps/web/src/features/auth/pages/LoginPage.tsx`), `supabase.auth.signOut()` for logout, session persistence via `supabase-js` PKCE + `cookieStorage` cross-port `5173↔5174` (`apps/web/src/lib/supabase.ts`). Protected routes `RequireRole` (`apps/web/src/app/App.tsx` + `apps/admin/src/app/RequireRole.tsx`) redirect unauth → `/login` and cross-role → denied.
- **Scope:** Only `Member` / `Role` / `MemberRole` are active for auth. All other tables (`Customer`, `Sale`, etc) remain untouched (empty) until CRM phase. No registration, MFA, or guest flows in this phase.

## Code conventions

- Styling: CSS Modules (`X.module.css`) imported per component; design tokens in `src/styles/tokens.css`. The `@/*` alias maps to `apps/web/src`.
- Tests colocated as `<target>.spec.ts(x)`. Web tests use `src/test/utils.tsx`: render with `renderWithProviders` (fresh QueryClient, no retries, MemoryRouter); mock `fetch` with `mockFetchRoutes`/`mockFetchJson`/`mockFetchNetworkError`. `mockFetchRoutes` matches URLs by `endsWith(path)` because the client prefixes `VITE_API_BASE_URL`.
- All HTTP goes through `apps/web/src/lib/api/client.ts` (`request`/`requestList`), which validates responses against `@jad/contracts` Zod schemas. No ad-hoc `fetch` in features.
- Most page copy/data is static placeholder content in `features/public/content/*` (pending approval); a few hooks (`usePrograms`, `usePolicies`, `usePublicConfig`) fetch real API data.
- Money is exact-decimal **strings** from the API; format with `formatMoney` from `@jad/shared`. No float math anywhere.
- No business logic in components; shared types/schemas only in `@jad/contracts`.
- Formatting: prettier with `semi`, `singleQuote`, `printWidth: 100`, `trailingComma: all`.

## Session handoff

When the user says **"hand-off to `SESSION.md`"** (variants: "handoff", "hand off",
"update the session file"), do this job automatically, no clarification needed:

1. Summarize the current session into `SESSION.md`: what changed (code, migrations,
   endpoints, routes), key decisions and why, verification status (typecheck/tests/build
   results), production state (last deploy, live probes), and open items for next time.
2. Preserve `SESSION.md`'s existing structure; update the date line; keep it tight but
   include small load-bearing details (exact migration/handler names, cron schedules,
   plan limits hit, gotchas like the `includeFiles` rule).
3. Never paste secrets (keys, passwords, tokens) into `SESSION.md` or chat.
