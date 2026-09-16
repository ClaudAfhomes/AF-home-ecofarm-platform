# ADR-002b: Vercel Functions / REST API Backend

## Status
**Accepted** - supersedes **ADR-002 (NestJS)** per **Q1 Final Decision 2026-08-30** (Supabase + Vercel Functions). Source: authoritative Q1 `React/RN → TanStack Query → Vercel Functions/REST API → Supabase → PostgreSQL` (Supabase + Vercel infra, business logic server-side, modular for future dedicated backend).

## Context
The platform is **TypeScript-only** (ADR-010) with three React SPAs (`apps/web`, `apps/admin`, `apps/merchant` future) and shared `packages/contracts` / `packages/config` / `packages/shared`. The prior target was a NestJS modular monolith (ADR-001 + ADR-002) with `apps/api` hexagonal modules. Q1 replaces the `NestJS` layer with serverless functions while keeping the domain boundary discipline and Supabase Postgres as the system of record (ARCH-DEC-003).

## Problem
Select the server-side API layer that (a) enforces all business/security rules server-side, (b) integrates with **Supabase Auth JWT (verified server-side) + PostgreSQL RLS**, (c) remains modular for a future dedicated backend, and (d) minimizes operational + cold-start overhead for v1.

## Options Considered
- **Vercel Functions / REST API on Node (chosen)** - per-function handlers (`api/cms/[key].ts`, `api/cms/upload.ts`), shared `lib/supabase` + `packages/contracts` Zod validation, `Supabase Auth` JWT verification + `MemberRole` RBAC, `Supabase Postgres` via `DATABASE_URL` / `supabase-js`, `Vercel` infra. Business logic lives in shared services called by handlers.
- **NestJS modular monolith** - rejected per Q1 (archived as ADR-002). Heavier, requires container orchestration, `HttpOnly` session migration, overkill for v1.
- **Express / Fastify minimal** - viable but less integrated with Vercel deploy than native Functions; not chosen over Vercel Functions for v1.
- **Supabase Edge Functions** - considered but Q1 chose **Vercel Functions** as the API surface (Supabase = DB/Auth/Storage/Realtime).

## Decision
Use **Vercel Functions / REST API (Node)** as the API framework (replaces ARCH-DEC-002 NestJS). OpenAPI 3.1 is **authored from `packages/contracts` Zod schemas and `api/**` handler routes** (not Nest controller metadata).

Monorepo keeps `apps/api/` (workspace `apps/*` in `pnpm-workspace.yaml`) for local dev of the same handlers, verified by `vercel.json` / `Vercel` configuration. No Nest `app.module.ts`, `Controllers`, `Modules`, `Guards`, `DI` are retained.

## Rationale
- Keeps **critical business logic server-side** (commission, ledger, approval, authZ) - frontends render via TanStack Query, never compute truth.
- **Modular** - `api/cms/`, `api/auth/`, `lib/` map to FG-*; handlers call domain services, easy to extract to a dedicated `apps/api` server later.
- **Matches existing auth** - `Supabase Auth` JWT (PKCE cookie `5173↔5174` via `supabase.ts:33-48`) verified server-side per Q3; no new `HttpOnly` session for v1.
- **Matches existing data** - `cms_contents(key, content JSONB, version)` single table (Q2) + `marketing-tools` bucket hybrid (Q4) validated by `contracts` schemas already covering CMS.
- **Lowest infra for v1** - `Supabase + Vercel` (no `infra/docker/api.Dockerfile` / `worker.Dockerfile` needed until scale).

## Trade-offs
- No Nest DI - shared logic is plain TypeScript modules imported by handlers.
- No built-in Nest guards/interceptors - authZ is Vercel middleware + `MemberRole` lookup.
- Cold starts on Vercel vs always-on Nest - acceptable for CMS/P1, mitigated by Vercel.

## Consequences
- `ARCH-DEC-002` now reads **Vercel Functions (Q1)** - see `ARCHITECTURE.md §16` + `TECH-STACK.md §1/§3`.
- `API-SPECIFICATION.md §5.4` OpenAPI is **authored**, not generated from Nest metadata.
- `FOLDER-STRUCTURE.md §1-2` documents `api/` Vercel Functions (or `apps/api/api/`) + `supabase/migrations/`; no Nest `app.module.ts`.
- `BACKEND-ARCHITECTURE.md` scope is **Vercel Functions backend**; no Nest artifacts.
- `TECH-STACK.md §3/§9/§14/§15` lists `Vercel Functions` as CONFIRMED.
- `AGENTS.md` updated to `Supabase + Vercel Functions` per Q1.
- History: `AUDIT-REPORT`, `DEPLOYMENT`, `TESTING` tables updated.

## Validation / Evidence
- Q1 Final Decision 2026-08-30 (Supabase + Vercel Functions stack).
- `ARCHITECTURE.md §2/§16` + `TECH-STACK.md §3` + `FOLDER-STRUCTURE.md §2` updated this PR.
- `api` workspace kept (`pnpm-workspace.yaml` `apps/*`).

## References
- Q1 2026-08-30; ADR-002 (superseded); TECH-STACK.md §3/§9/§14; ARCHITECTURE.md §2/§16; API-SPECIFICATION.md §5.4; FOLDER-STRUCTURE.md §2; BACKEND-ARCHITECTURE.md §1; AGENTS.md.
