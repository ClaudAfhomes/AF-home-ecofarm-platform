# ADR-001: Modular Monolith (Hexagonal Within Modules)

## Status
**Accepted** (established by approved SSOT material - ARCHITECTURE.md §16, ARCH-DEC-001: **CONFIRMED**).

## Context
The JAD platform is a financial-grade direct-selling and network-growth system. Core operations - commission creation on qualifying sales, eWallet ledger posting, and voucher redemption - must be **atomic** within a single transactional boundary (BI-001, BI-002, BI-005, BI-007). The planning documents (ROADMAP §2) explicitly prefer the simplest architecture that satisfies requirements and prohibit premature microservices and speculative infrastructure. The repository is documentation-only; nothing is implemented or deployed.

## Problem
Choose a backend decomposition that (a) keeps financial invariants enforceable, (b) keeps change impact local and traceable to feature groups (FG-*), and (c) does not introduce distributed-systems complexity with no requirement benefit.

## Options Considered
- **Modular monolith (hexagonal within modules)** - one deployable backend with strongly-bounded internal modules.
- **Microservices** - multiple independently deployed services, potentially with event brokers.
- **Serverless by default** - function-as-a-service decomposition.

## Decision
Adopt the **Modular Monolith** with hexagonal (ports & adapters) layering **within** each module (ARCHITECTURE §2.1; ARCH-DEC-001). One deployable backend application; modules mirror the feature groups FG-*; modules communicate through application-layer use cases and shared, versioned contracts - never through each other's internals.

## Rationale
- **Single ACID boundary:** financial correctness (BI-001, BI-002, BI-005, BI-007) is far easier to guarantee inside one transactional database/application boundary (ARCHITECTURE §2.1).
- **No requirement supports microservices:** a split would introduce distributed-transaction risk precisely into the operations that must be atomic (commission creation, ledger posting, voucher redemption).
- **Module boundaries still protect the domain:** Commission, eWallet, and Voucher remain separate modules with explicit rules.
- **Explicitly excluded:** microservices, event-sourced ledger (ledger is append-only, not event-sourced), serverless-by-default (ARCHITECTURE §2.1).

## Trade-offs
- Framework lock-in (Vercel Functions - see ADR-002b, supersedes NestJS).
- Single unit of deployment: scaling means scaling the whole API service.
- Requires discipline to keep module boundaries enforced (ports & adapters); drift is a maintainability risk.
- Worker processes (e.g., clearing scheduler) run in-process/alongside - no separate service contracts.

## Consequences
- One API build and one worker build (FOLDER-STRUCTURE: `apps/api`, `infra/docker/worker.Dockerfile`).
- Cross-module state is written in the same transaction (DATABASE-DESIGN §15.2); no event brokers between modules (TECH-STACK §16 prohibition #8).
- Change impact is local and traceable to FG-* modules (BACKEND-ARCHITECTURE §1.2).
- Configurable business rules are implemented as a config module read by domain logic (BR-CFG-001) - no redeployment for config changes.

## Validation / Evidence
- ARCHITECTURE.md §2.1, §16 (ARCH-DEC-001 = CONFIRMED; alternatives rejected).
- BACKEND-ARCHITECTURE.md §1.2 (approved anchor; out-of-scope enforcement list).
- TECH-STACK.md §16 prohibition #8 (premature distributed systems).
- INTEGRATION-SPECIFICATION.md §1.1 (platform described as TypeScript full-stack modular monolith).

## References
- ARCHITECTURE.md §2.1, §15, §16; BACKEND-ARCHITECTURE.md §1.2, §12; TECH-STACK.md §16; ROADMAP.md §2.