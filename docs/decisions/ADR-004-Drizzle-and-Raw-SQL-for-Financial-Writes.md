# ADR-004: Drizzle ORM + Raw SQL for Financial Writes

## Status
**Accepted** (established by approved SSOT material - ARCHITECTURE.md §16, ARCH-DEC-004: **CONFIRMED**; TECH-STACK.md §6). Sub-elements (exact SQL strategy for hot writes) remain PROPOSED.

## Context
PostgreSQL is the system of record (ADR-003). The backend performs reads/CRUD across the domain and a small set of **hot financial writes** - ledger posts, balance updates, voucher redemption - that must be race-safe and atomic (BI-005, BI-007). Money is exact-decimal (ADR-009).

## Problem
Choose the data-access approach that provides TypeScript type-safety while preserving explicit control over locking, constraints, and transaction boundaries for financial writes.

## Options Considered
- **Drizzle ORM** - typed queries, SQL-like API.
- **Prisma** - managed schema/CLI, typed client.
- **TypeORM** - traditional ORM.
- **Raw SQL** - full manual control.

## Decision
Use **Drizzle (typed queries)** for general reads/CRUD and **raw SQL for ledger writes** with explicit locking and transaction control (ARCH-DEC-004; TECH-STACK §6; BACKEND-ARCHITECTURE §7). **Prisma is not adopted**; adopting Prisma requires approval (TECH-STACK §15).

## Rationale
- Drizzle offers ORM speed with type-safety while keeping the developer close to SQL.
- Raw SQL gives explicit control over row locks/constraints for financial writes - matching the DB-level invariant enforcement (DATABASE-DESIGN §12.6) and race-safe requirements (BI-007).
- Prisma's managed schema/constraint model was considered and not chosen; it is a documented alternative gated by approval.

## Trade-offs
- More manual SQL than a fully managed ORM.
- The exact raw-SQL write strategy for ledger operations is **PROPOSED** (TECH-STACK §6; BACKEND-ARCHITECTURE §7) - must be reviewed under the code-review and testing gates (CODE-REVIEW-GUIDELINES; TESTING §9 financial integrity tests).
- Drizzle/PostgreSQL versions `REQUIRES VERIFICATION` (TECH-STACK §14).

## Consequences
- Migrations are additive-by-default, managed per DATABASE-DESIGN §18.
- Ledger/balance/redemption writes use explicit locking within one transaction.
- Typed client schemas come from `packages/contracts`; DB schemas are migrated via Drizzle/versioned SQL.

## Validation / Evidence
- ARCHITECTURE.md §16 (ARCH-DEC-004 = CONFIRMED).
- TECH-STACK.md §6/§15/§17 (alternatives gated; prohibited technologies).
- DATABASE-DESIGN.md §18 (migrations).
- BACKEND-ARCHITECTURE.md §7 (data access; raw SQL for hot writes PROPOSED).

## References
- ARCH-DEC-004; TECH-STACK.md §6/§15/§16/§17; DATABASE-DESIGN.md §18; BACKEND-ARCHITECTURE.md §7; TESTING.md §9.