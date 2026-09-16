# ADR-003: PostgreSQL as System of Record

## Status
**Accepted** (established by approved SSOT material - ARCHITECTURE.md §16, ARCH-DEC-003: **CONFIRMED**; TECH-STACK.md §5).

## Context
The platform is financial-grade: eWallet ledger, commission lifecycle, voucher redemption, and withdrawal records must satisfy invariants BI-001..BI-010, which the Database SSOT requires to be enforced **at the database layer** (DATABASE-DESIGN §12.6; AC-04). Money must be represented as exact-decimal `NUMERIC`, never floating point (BR-WAL-002; ADR-009).

## Problem
Choose the system-of-record database that provides relational ACID transactions, strong constraint enforcement, and exact-decimal numeric support for the financial domain.

## Options Considered
- **PostgreSQL** - relational, ACID, rich constraint support (CHECK/UNIQUE/FK), `NUMERIC`, `citext`.
- **MySQL** - relational alternative.
- **SQL Server** - commercial relational option.
- **MongoDB / NoSQL** - document store.

## Decision
Use **PostgreSQL** as the platform's system of record (ARCH-DEC-003; TECH-STACK §5). Single database; single public schema; DB-enforced invariants per DATABASE-DESIGN §12.6.

## Rationale
- Relational ACID is required for the ledger (ADR-001 single transactional boundary).
- Constraint rigor (CHECK/UNIQUE/FK, `citext` for case-insensitive uniqueness) directly supports DB-level enforcement of BI-001..BI-010.
- `NUMERIC` provides exact-decimal money (BR-WAL-002, ADR-009).
- MongoDB/NoSQL lacks the join/constraint rigor required for finances (ARCH-DEC-003 rationale).

## Trade-offs
- Relational modeling overhead vs. document flexibility.
- Horizontal scale is harder than sharded NoSQL; the project chooses **correctness over distribution** (ARCH-DEC-001, ARCHITECTURE §12) - managed PostgreSQL is the target.

## Consequences
- Managed PostgreSQL hosting is a **REQUIRES APPROVAL** decision (ARCH-DEC-008; ADR-012).
- DB roles are least-privilege; DBA is not granted plaintext access to secrets (DATABASE-DESIGN §4.5/§22; SECURITY.md).
- PostgreSQL version is `REQUIRES VERIFICATION` (TECH-STACK §14).
- Constraints enforce invariants at the DB layer (DATABASE-DESIGN §12.6).

## Validation / Evidence
- ARCHITECTURE.md §16 (ARCH-DEC-003 = CONFIRMED; Mongo rejected).
- TECH-STACK.md §5.
- DATABASE-DESIGN.md §3, §5, §12.6, §22 (DB-enforced invariants AC-04; `NUMERIC`).

## References
- ARCH-DEC-003; TECH-STACK.md §5/§14/§16; DATABASE-DESIGN.md §3/§5/§12.6/§22; ARCHITECTURE.md §12.