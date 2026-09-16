# Supabase-first migration — sunny-dawn

> **Owner:** vibe coder flow — `pnpm + Turborepo` `apps/web` React 19 Vite 8 SPA, `packages/contracts` SSOT must not be re-declared `AGENTS.md:10`
> **Stack:** `Supabase Postgres 15+` managed implementation of `PostgreSQL` SSOT `docs/database/DATABASE-DESIGN.md:134` via `DATABASE_URL` `prisma/schema.prisma:9` + `VITE_SUPABASE_URL`/`ANON_KEY` `packages/config/src/env.ts:3`

## Context

`P1` is public marketing pages only. No backend exists yet `AGENTS.md:3`; auth is `F0 mock` `localStorage jad:mock:session` `packages/mock/src/session/MockSessionProvider.tsx:8` + in-memory `apps/web/src/mock/store.ts:1` (1170L, 8 members/9 sales/6 commissions) + `handlers.ts:1` (42 routes) stubbing `fetch` `apps/web/src/lib/api/client.ts:19` (`VITE_API_BASE_URL=/api/v1`). Supabase client `apps/web/src/lib/supabase.ts:98` already stubbed 80% (`isSupabaseConfigured`, `cookieStorage` for `5173` vs `5174`, `listMarketingToolsFromStorage` stub, `subscribeNotificationsRealtime` stub). Prisma `prisma/schema.prisma:246` mirrors `store.ts` + `contracts/*` Zod but has 19 models vs 33 entities `DATABASE-DESIGN.md:7`, no `prisma/migrations` or `supabase/migrations` exist (glob 0), RLS declared in comment `DATABASE-DESIGN.md:138` (`members auth.uid()=id`) but `§22:128` says `RLS Not proposed` — `DA-09 REQUIRES APPROVAL` conflict.

User approved **Option A (Supabase-first, no custom backend)** for vibe-coder ease; ask “is it secured?” — answer: only with `ENABLE RLS`.

## What must change

1. **Env/config** — set `VITE_SUPABASE_URL`/`ANON_KEY` (`apps/web/.env.example:18` public) + `DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (server-only never `VITE_` `SECURITY.md:97` + `apps/web/.env.example:21`). `packages/config/src/env.ts:3` `vitePublicEnvSchema` already optional; `prisma/seed.ts:1` derives `supabaseUrl` from `DATABASE_URL` hostname if placeholder.

2. **Auth/session** — `apps/web/src/lib/session.tsx:1` `SupabaseSessionProvider` `getSession()+onAuthStateChange` + `resolveRole` `member_roles`→`roles` (authoritative `SUPER_ADMIN` not `user_metadata`), `loginAs/logout` via `supabase.auth`. Fix `Member.id cuid() -> uuid` `prisma/schema.prisma:15` to `auth.users.id`, drop `passwordHash String?` dual surface when `VITE_SUPABASE_URL` set.

3. **DDL — create migrations** — 19→33 tables, `NUMERIC(18,2)` `@db.Decimal` + `CHECK available_balance>=0` `BI-001` + `UNIQUE(voucher_id,idempotency_key)` `BI-007` + `REVOKE UPDATE,DELETE` on `ledger_entries/commissions/financial_adjustments/voucher_redemptions/audit_log` `BI-005` `DATABASE-DESIGN.md:124`, `ENABLE RLS` policies `members USING(auth.uid()=id)`, `vouchers memberId=auth.uid()`, `SUPER_ADMIN bypass service_role` `DATABASE-DESIGN.md:138`.

4. **API split** — `apps/web/src/lib/api/client.ts:19` `credentials same-origin` + `endpoints.ts:1` keep `request/requestList` validating `@jad/contracts`; public reads via `anon_key` (PostgREST), financial writes (`POST /sales|withdrawals|vouchers/:id/redemptions` + `Idempotency-Key` `API-SPEC §5.3`) via `service_role` `SECURITY DEFINER` RPCs to preserve same-transaction `audit_log` `DATABASE-DESIGN.md:753`.

5. **Storage/Realtime** — implement `listMarketingToolsFromStorage` → `supabase.storage.from('marketing-tools').list()` (public read `SUPER_ADMIN` write `DATABASE-DESIGN.md:139`) + `channel notifications:memberId=eq.*` + `pg_cron` `vouchers.expiresAt`.

6. **Roles** — `packages/contracts/src/schemas/role.ts:1` 2 roles vs 5 `DATABASE-DESIGN.md:59`; reconcile `member_roles` slugs `member_basic|admin|finance|super_admin` `prisma/seed.ts:130`.

7. **Tests** — `apps/web/src/test/utils.tsx:1` `mockFetchRoutes endsWith` stays for `MODE==='test'` forced mock `session.tsx:1`; add `supabase-js` mocks for PostgREST.

## What can remain

`packages/ui/src/styles/tokens.css:1` + `base.css` vars, 70+ `*.module.css` (`Button.module.css:1`), `packages/ui/src/components/index.ts:1` (`AppShell/Button/Table/Dialog`), `packages/shared/src/money.ts:1` `formatMoney` `BigInt` exact-decimal `BR-WAL-002`, `packages/contracts/src/index.ts:1` Zod SSOT (20 schemas), `apps/web/src/components/*` `Alert/Card/Skeleton`, `pnpm-workspace.yaml:1` + `turbo.json:1` (packages export raw TS, no build). Supabase adds no build step.

## What should be removed (after cutover, never before)

`apps/web/src/mock/store.ts:1` + `handlers.ts:1` + `index.ts` (42 routes), `apps/web/src/main.tsx:1` `if(DEV) createMemberMockServer().install()` (already tree-shaken prod `F2-C-remediation.md:16`), `@jad/mock` dep from `apps/web/package.json:17` (keep for `vitest` `MODE==='test'`), legacy `apps/web/src/styles/tokens.css:1` duplicate, `AGENTS.md:38` stale `localStorage` docs + `MockUserSwitcher`.

## Security/business-rule risks

**P0 blockers:** `R-1` RLS absent → IDOR/BOLA `SECURITY.md:52`; `R-2` `BI-005` PostgREST can `UPDATE ledger_entries` without `REVOKE`+RPCs; `R-3` `BI-008` signing boundary `Voucher` missing `signed_payload/signature` forgeable; `R-4` `value String` not `NUMERIC` accepts overflow/negative; `R-7` `cookieStorage` not `HttpOnly/Secure` `SECURITY.md:138` SA-02 CSRF TBD.

**P1:** `R-5` polymorphic `ledger source_type` dangling, `R-6` missing `idempotency_keys` 24h TTL double charge, `R-8` `payout account_identifier` plaintext `DA-08`, `R-9` `audit_log` not same-transaction via anon REST, `R-12` no `PITR/RPO/RTO` `DATABASE-DESIGN.md:1163`. Gated `GROUP_INCENTIVE` `OD-006..012`, `WITHDRAWAL/VOUCHER` states `OD-017..023` must not produce.

## Plan phases

**Phase 0 (prep, done):** approve `DA-09` RLS, `DA-08` encryption, `SA-05` KMS, `SA-02` CSRF — user Approved 2026-08-28.

**Phase 1 — scaffold:** `supabase/migrations/20260828000001_enable_rls.sql` (RLS+grants+checks) + `supabase/README.md`, `apps/web/src/lib/supabase.ts:98` harden storage/realtime, `prisma/schema.prisma:15` `@db.Uuid` + `@db.Decimal(18,2)` + `@map` where needed.

**Phase 2 — wire:** `session.tsx` hard cutover, `endpoints.ts` public vs `service_role` split, `storage marketing-tools` bucket + Realtime channel.

**Phase 3 — cleanup:** delete `apps/web/src/mock/*`, update `AGENTS.md:38`, enable `pgaudit` + backup `PITR` + `429` limits `SECURITY.md:179`.

## Verification

- `pnpm typecheck` — all workspaces `tsc --noEmit`.
- `pnpm test` — `vitest run` (jsdom) `apps/web` + `packages/*` mocks still pass (`renderWithProviders` `initialUser`).
- `pnpm build` — `@jad/web` `tsc --noEmit && vite build`.
- Manual: `VITE_SUPABASE_URL` unset → mock still works (fallback `UnauthenticatedSessionProvider` `session.tsx:1`); set → `supabase.auth.signInWithPassword` `superadmin@gmail.com/P@ssword` → `5173/login` → `member_roles super_admin` → `/admin`.
- Supabase: `supabase db reset` applies `supabase/migrations/*`; `anon` cannot `SELECT` other `memberId`; `ledger_entries UPDATE` denied; `pgcrypto` masking verified.

## Decisions made

- Keep `Prisma` as migration source (already `8.0.0-rc.9` `package.json:23`) — supplements `supabase/migrations` SQL (Prisma generates baseline, SQL adds `RLS`/`REVOKE`).
- Public reads via `anon_key` PostgREST; financial writes via `service_role` RPCs — approved.
- Keep `member_roles` 5 slugs `prisma/seed.ts:130` as RBAC source; `normalizeRole` stays 2-value client helper `role.ts:1`.

---

References: `AGENTS.md:3` no backend, `docs/database/DATABASE-DESIGN.md:134` Supabase Postgres, `docs/security/SECURITY.md:97` never `VITE_` service key, `BUSINESS-RULES.md:10` BI-001..010, `ARCH-DEC-007` session cookie.
