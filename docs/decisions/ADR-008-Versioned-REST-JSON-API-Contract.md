# ADR-008: Versioned REST JSON `/api/v1` as the Single API Contract

## Status
**Accepted** for the contract model (REST JSON `/api/v1` as the single source of truth - CONFIRMED in approved anchors: FRONTEND-ARCHITECTURE header, MOBILE-ARCHITECTURE header, ARCHITECTURE.md, API-SPECIFICATION.md). Versioning mechanics are **Proposed** (API-SPECIFICATION §5.1).

## Context
The platform has three web clients and a future mobile client (ADR-005) consuming one backend (ADR-001/ADR-002). Money is exact-decimal (ADR-009); financial mutations must be idempotent and race-safe (BI-007). The API contract is authoritative via API-SPECIFICATION.md (v1.1 audit). The repository is documentation-only; every endpoint is PLANNED.

## Problem
Choose the API style and contract discipline that give all clients one typed, versioned, and verifiable interface.

## Options Considered
- **REST JSON with URI versioning** - chosen direction.
- **GraphQL** - single flexible endpoint, typed schema.
- **RPC-style** - method-oriented.
- **Unversioned REST** - rejected: would break contract evolution.

## Decision
Adopt **REST JSON `/api/v1`** as the single source of truth for all clients (approved anchors). OpenAPI 3.1 is authored from `packages/contracts` Zod schemas + handler routes (API-SPECIFICATION §5.4 as updated Q1); typed clients are generated from the contract into `packages/contracts` (TECH-STACK §9). Breaking changes create `/api/v2`; deprecated endpoints are announced per phase (§5.1 - PROPOSED). Conventions: unified error envelope with machine codes (§3), pagination/filtering/sorting with allowlisted sort fields (§4), `Idempotency-Key` (UUID) required on the four financial mutations - `POST /sales`, `POST /me/withdrawals`, `POST /vouchers/:id/redemptions`, `POST /financial-adjustments` (§5.3). Rate limiting applies on strict paths with configurable limits (§5.2, values REQUIRES APPROVAL).

## Rationale
- One versioned contract serves all three web apps and future mobile without per-client APIs.
- Typed contract generation (OpenAPI → `packages/contracts`) enforces compile-time alignment across stack (TECH-STACK §9).
- Idempotency on financial mutations is required for retry-safety (API-SPECIFICATION §5.3; INTEGRATION-SPECIFICATION §8).
- REST keeps business-eligibility failures explicit (403/422, never 401 - §1.2).

## Trade-offs
- REST is more verbose than GraphQL for flexible queries; GraphQL lacks the same contract/versioning simplicity here.
- Versioning overhead (`/api/v2`) must be maintained over time.
- Idempotency-key TTL (24h proposed) and rate-limit values remain REQUIRES APPROVAL.

## Consequences
- API-SPECIFICATION.md is the authoritative contract SSOT; endpoints carry FEAT/FR/BR traceability (§6/§9).
- Clients never compute balances; server is the source of truth (FRONTEND-ARCHITECTURE §4).
- Money fields travel as exact-decimal strings (§1.3; ADR-009).
- Endpoints #84-#89 (v1.1 audit additions) are PROPOSED and gated.

## Validation / Evidence
- API-SPECIFICATION.md §1/§3/§4/§5/§8/§9 (incl. v1.1 audit).
- TECH-STACK.md §9; FRONTEND-ARCHITECTURE.md header/§5; MOBILE-ARCHITECTURE.md header.
- INTEGRATION-SPECIFICATION.md §8 (idempotency).

## References
- API-SPECIFICATION.md §1-§9; TECH-STACK.md §9; FRONTEND-ARCHITECTURE.md §5; INTEGRATION-SPECIFICATION.md §8; BI-007.