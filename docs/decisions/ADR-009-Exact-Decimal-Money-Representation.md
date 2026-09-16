# ADR-009: Exact-Decimal Money Representation (Never Floating Point)

## Status
**Accepted** for the representation rule (BR-WAL-002: money must never be represented as floating point - CONFIRMED business rule; TECH-STACK §5/§8/§17; DATABASE-DESIGN §5). Precision/schema values are **Proposed** (`NUMERIC(18,2)` amounts, `NUMERIC(5,4)` rates - DA-22).

## Context
The platform computes, stores, and displays money: commission lifecycle (Pending → clearing → Available), eWallet balances (BI-002), voucher amounts, and payout records. Financial invariants BI-001..BI-010 are DB-enforced (DATABASE-DESIGN §12.6). Clients must never perform financial computation (FRONTEND-ARCHITECTURE §4; MOBILE-ARCHITECTURE §11.2). Currency is PHP (single-currency assumption A-01, DATABASE-DESIGN).

## Problem
Choose the money representation across DB, API, and clients that guarantees exact financial correctness (no float rounding errors).

## Options Considered
- **Floating point (float/double)** - rejected: rounding errors violate correctness.
- **Integer minor units (cents)** - viable but requires unit convention discipline.
- **Exact decimal (`NUMERIC` / decimal strings)** - chosen.

## Decision
Money is **exact decimal everywhere** and **never floating point** (BR-WAL-002). On the wire, money is an exact-decimal **string** (API-SPECIFICATION §1.3; TECH-STACK §8). In the database, money columns are **`NUMERIC`** (DATABASE-DESIGN §5). In clients, money arrives as strings and is **formatting-only** - no financial arithmetic (FRONTEND-ARCHITECTURE §4; DESIGN-SYSTEM §9). Input validation rejects floats for money fields (BACKEND-ARCHITECTURE §7; API-SPECIFICATION §8). Precision proposal: `NUMERIC(18,2)` amounts, `NUMERIC(5,4)` rates - **PROPOSED** (DA-22).

## Rationale
- Exact-decimal representation eliminates float rounding errors in financial totals and comparisons.
- Consistent rule across DB/API/client prevents drift (the rule is cited in the approved anchors of FRONTEND, BACKEND, and MOBILE architecture docs).
- DB `NUMERIC` and wire strings pair naturally with the DB-level invariant enforcement (DATABASE-DESIGN §12.6).

## Trade-offs
- Wire representation as strings (no native decimal type in JSON) - clients must treat money as opaque formatted values.
- Requires validation discipline to reject floats at every input boundary.
- Exact precision/scale values are not yet approved (DA-22) - do not infer them beyond the proposal.

## Consequences
- Zod/contract schemas reject floats for money/rate fields (API-SPECIFICATION §8; BACKEND-ARCHITECTURE §7).
- `packages/shared` provides formatting-only money helpers (FOLDER-STRUCTURE §4.3; DESIGN-SYSTEM §9).
- No client-side balance computation; server is the source of truth.
- Float money is a prohibited technology/behavior (TECH-STACK §16; BACKEND-ARCHITECTURE §17).

## Validation / Evidence
- BUSINESS-RULES.md BR-WAL-002; DATABASE-DESIGN.md §5 (NUMERIC), §12.6, DA-22; TECH-STACK.md §5/§8/§17.
- API-SPECIFICATION.md §1.3/§8; FRONTEND-ARCHITECTURE.md §4; BACKEND-ARCHITECTURE.md §7.

## References
- BR-WAL-002; TECH-STACK.md §5/§8/§17; DATABASE-DESIGN.md §5/§12.6/DA-22; API-SPECIFICATION.md §1.3/§8; DESIGN-SYSTEM.md §9.