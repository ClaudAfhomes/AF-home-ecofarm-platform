# ADR-011: pnpm Workspaces + Turborepo Monorepo

## Status
**Proposed** (TECH-STACK.md §11: pnpm workspaces + Turborepo - **PROPOSED / REQUIRES APPROVAL**; FOLDER-STRUCTURE.md documents the intended layout).

## Context
The platform is a TypeScript monorepo (ADR-010) with React apps (web/admin), Vercel Functions API, and shared packages, plus infra/CI definitions (FOLDER-STRUCTURE §4 as updated Q1). Tool versions are `REQUIRES VERIFICATION` (TECH-STACK §14). The repository is documentation-only; the monorepo has not been scaffolded.

## Problem
Choose the workspace/task tooling that keeps the multi-app TS monorepo fast, reproducible, and simple to build in CI.

## Options Considered
- **pnpm workspaces + Turborepo** - chosen direction (PROPOSED).
- **npm / yarn workspaces** - alternatives; slower task caching.
- **Single package (no monorepo)** - rejected: three apps + shared packages would be unmanageable.
- **Nx** - more powerful but heavier.

## Decision
Use **pnpm workspaces** as the package manager and **Turborepo** as the task runner (TECH-STACK §11 - PROPOSED). Structure per FOLDER-STRUCTURE: `apps/api`, `apps/web`, `apps/admin`, `apps/merchant`, `packages/contracts`, `packages/config`, `packages/shared`, `infra/`.

## Rationale
- pnpm workspaces give isolated, fast installs and strict dependency handling.
- Turborepo provides cached task orchestration (build/lint/test/typecheck) across the monorepo.
- Matches the TypeScript-only full stack and the "three frontends, one contract" model (TECH-STACK §20).

## Trade-offs
- Toolchain complexity vs. a single-package repo.
- Adopting pnpm/Turborepo in a real implementation remains REQUIRES APPROVAL (FRONTEND-ARCHITECTURE header §1.2; BACKEND-ARCHITECTURE §21).
- Current-stable versions are REQUIRES VERIFICATION (TECH-STACK §14).

## Consequences
- CI runs build + lint + tests + typecheck per PR via Turborepo (DEPLOYMENT §5).
- Lockfile pinning and additive migrations apply across the workspace (DATABASE-DESIGN §18).
- Shared contract/client packages are consumed by all apps (ADR-008).

## Validation / Evidence
- TECH-STACK.md §11 (PROPOSED), §14 (versions REQUIRES VERIFICATION).
- FOLDER-STRUCTURE.md §1/§4 (monorepo layout, `pnpm-workspace.yaml`).
- FRONTEND-ARCHITECTURE.md header §1.2 (adoption REQUIRES APPROVAL).

## References
- TECH-STACK.md §11/§14; FOLDER-STRUCTURE.md §1/§4; FRONTEND-ARCHITECTURE.md §1.2; DEPLOYMENT.md §5.