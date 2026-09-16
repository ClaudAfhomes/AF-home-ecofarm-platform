# ADR-002: NestJS API Framework - SUPERSEDED

> **Status: SUPERSEDED (2026-08-30) - replaced by ADR-002b.** Preserved as archive; do not delete or renumber. See **ADR-002b-Vercel-Functions.md** and Q1 Final Decision (Supabase + Vercel Functions).

## Status
**Superseded** - originally **Accepted** (ARCHITECTURE.md §16, ARCH-DEC-002: **CONFIRMED**; TECH-STACK.md §2/§3). Replaced on 2026-08-30 by **ADR-002b: Vercel Functions / REST API** per authoritative Q1 decision: backend is **React/RN → TanStack Query → Vercel Functions/REST API → Supabase → PostgreSQL**, Supabase + Vercel infra, keep business logic server-side, modular for future dedicated backend. NestJS is **not** implemented or retained.

## Context (archived)
The backend was planned as a modular monolith (ADR-001) in a **TypeScript-only full stack** (see ADR-010). The platform exposes a single REST JSON `/api/v1` contract (ADR-008). The choice below was the approved target for P1..P12 before Q1.

## Problem (archived)
Select the Node.js backend framework that best fits a modular monolith, supports strict typing, and enables contract generation from application metadata.

## Options Considered (archived)
- **NestJS** - opinionated, DI + module system, decorator-based controllers, guards/interceptors.
- **Express** - minimal, unopinionated.
- **Fastify** - high-performance minimal framework.
- **Minimal Node** - no framework.

## Decision (archived)
Use **NestJS on Node.js LTS** as the API framework (ARCH-DEC-002; TECH-STACK §2/§3/§9). OpenAPI 3.1 is generated from NestJS controller metadata (API-SPECIFICATION §5.4).

## Rationale (archived)
- Strong DI and module system matches the modular-monolith structure (ARCH-DEC-001).
- Guards/interceptors map directly to the RBAC authorization model (BUSINESS-RULES §3) and request validation pipeline.
- TypeScript-native; aligns with the TypeScript-only constraint (ADR-010).
- OpenAPI generation from controller metadata supports the single-contract model (ADR-008) and typed clients.

## Trade-offs (archived)
- Heavier than Express/Fastify.
- Framework coupling: migration cost if Nest is ever rejected.
- The specific Node.js LTS / NestJS version is `REQUIRES VERIFICATION` (TECH-STACK §14).

## Consequences (archived)
- `/api/v1` OpenAPI 3.1 contract generated from controllers (API-SPECIFICATION §5.4).
- RBAC guards enforce BUSINESS-RULES §3 for every endpoint (API-SPECIFICATION §2.2).
- Fastify/Express are permitted **only** if NestJS is rejected under ARCH-DEC-002 (TECH-STACK §15/§16).

## Supersession
Per **Q1 Final Decision 2026-08-30 (Supabase + Vercel Functions)**, NestJS is removed from the target architecture. New stack: **Frontend React/RN → Server State TanStack Query → Backend Vercel Functions/REST API → Supabase Auth (JWT verified server-side) → PostgreSQL via Supabase (RLS) → Supabase + Vercel infra**. See **ADR-002b-Vercel-Functions.md**. SSOT docs `TECH-STACK.md`, `ARCHITECTURE.md`, `API-SPECIFICATION.md`, `FOLDER-STRUCTURE.md`, `BACKEND-ARCHITECTURE.md`, `DATABASE-DESIGN.md`, `DEPLOYMENT.md`, `AGENTS.md` updated accordingly; no blind text replacement.

## Validation / Evidence (archived)
- ARCHITECTURE.md §16 (ARCH-DEC-002 = CONFIRMED) - now superseded.
- TECH-STACK.md §2/§3/§9/§14/§15.
- API-SPECIFICATION.md §5.4.

## References
- Original: ARCH-DEC-002; TECH-STACK.md §2/§3/§9/§14/§15/§16; API-SPECIFICATION.md §5.4; BACKEND-ARCHITECTURE.md §1.
- Superseding: ADR-002b-Vercel-Functions.md; Q1 2026-08-30; TECH-STACK.md (Vercel Functions), ARCHITECTURE.md §2/§16, API-SPECIFICATION.md §5.4.