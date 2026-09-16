# ADR-010: TypeScript-Only Full Stack

## Status
**Accepted** (TypeScript full-stack is an approved session decision, cited as an approved anchor in FRONTEND-ARCHITECTURE, BACKEND-ARCHITECTURE, and MOBILE-ARCHITECTURE headers; ARCH-DEC-005 rationale; TECH-STACK §2/§3).

## Context
The platform has React + Vite frontends (web/admin), Vercel Functions / REST API backend (Q1), shared contracts, and a future mobile option (ADR-005). Financial correctness and security boundaries are centralized in the backend (NFR-AUTHZ-001/002; client is never the security boundary). The engineering team is TypeScript-only (DEVELOPMENT-GUIDELINES; TECH-STACK).

## Problem
Choose the language architecture across all tiers to minimize stack diversity while preserving the platform's correctness and security model.

## Options Considered
- **TypeScript everywhere** (frontend, backend, shared contracts) - chosen.
- **Polyglot** (different languages per tier) - rejected: increases cross-tier contract risk and team burden.

## Decision
The entire platform is **TypeScript**: React + Vite SPAs, Vercel Functions backend, and shared packages (`packages/contracts`, `packages/config`, `packages/shared`) all use TypeScript. No other language is used in application code (TECH-STACK §2/§3; approved anchors). Native mobile, if ever approved, would be **React Native** - a TypeScript-adjacent stack - but any native code module requires approval (ADR-005; MOBILE-ARCHITECTURE).

## Rationale
- Single language across all tiers enables shared, typed contracts (OpenAPI → `packages/contracts`, ADR-008).
- TypeScript strictness (DEVELOPMENT-GUIDELINES §2) aligns with the correctness-by-construction stance (ADRs 001/004/008/009).
- Reduces cross-tier integration risk versus a polyglot stack.

## Trade-offs
- No per-tier language specialization (e.g., no systems-language hotspots).
- RN native modules require native code - gated by approval (ADR-005).

## Consequences
- All code, tooling, and CI conventions are TypeScript (DEVELOPMENT-GUIDELINES; CODE-REVIEW-GUIDELINES).
- `packages/shared` is framework-free TS (no React, no business logic - FOLDER-STRUCTURE §4.3/§9.7).
- Contract types are shared, never duplicated per client.

## Validation / Evidence
- FRONTEND-ARCHITECTURE.md header (approved anchor); BACKEND-ARCHITECTURE.md header; MOBILE-ARCHITECTURE.md header.
- TECH-STACK.md §2/§3; ARCHITECTURE.md §2.1 (CONFIRMED direction: TypeScript full-stack).

## References
- ARCHITECTURE.md §2.1; TECH-STACK.md §2/§3; FRONTEND-ARCHITECTURE.md header; BACKEND-ARCHITECTURE.md header; MOBILE-ARCHITECTURE.md header; FOLDER-STRUCTURE.md §4.3.