# ADR-012: Deployment & Infrastructure (Provider OPEN)

## Status
**Proposed** (ARCHITECTURE.md §16, ARCH-DEC-008: containerized + managed PostgreSQL, provider/region OPEN - **REQUIRES APPROVAL**; TECH-STACK §12: **PROPOSED / REQUIRES APPROVAL**).

## Context
The repository is documentation-only; **nothing is deployed**. No infrastructure, provider, region, orchestration, or hosting decision has been made. ROADMAP risk **R-10** records the open deployment decision. The intended shape is documented in DEPLOYMENT.md (§9 hosting/infrastructure; gaps D-01/D-02) and TECH-STACK §12.

## Problem
Choose the deployment and infrastructure approach so the platform can be operated reliably once implementation begins, without prematurely binding to a provider.

## Options Considered
- **Containerized deployment (Docker) + managed PostgreSQL** - the documented target shape.
- **Bare-metal / manual hosting** - rejected as inconsistent with the documented target.
- **Provider-specific PaaS/serverless** - not selected; provider is OPEN.

## Decision
Adopt the documented target: **containerized deployment** (Docker; per-app `Dockerfile`s incl. `worker.Dockerfile`), **managed PostgreSQL** hosting, standard reverse proxy/load balancer, and environment configuration via a **secret manager** (TECH-STACK §12; DEPLOYMENT §9). **Provider, region, and orchestration are NOT decided** (ARCH-DEC-008) - they are `REQUIRES APPROVAL`.

## Rationale
- Matches the modular monolith (single API deployable + worker) and the pnpm monorepo layout (ADR-011).
- Managed PostgreSQL aligns with ADR-003 (managed hosting intent).
- Provider-agnostic design avoids premature commitment while the provider decision is open.

## Trade-offs
- The open provider decision **blocks deployment** - no environment can be stood up yet (DEPLOYMENT D-01/D-02).
- RPO/RTO and scaling targets are TBD (ARCH-DEC-009; NFR-AVAIL/PERF/SCAL/REL have no approved numbers).
- CI/CD tooling, log aggregation, and tracing remain deployment-stage decisions (REQUIRES APPROVAL - DEPLOYMENT; INTEGRATION-SPECIFICATION §11).

## Consequences
- No deployment, no releases, no migrations have occurred; the changelog records the implementation phases as **Not started**.
- When the provider is approved, this ADR's status will be updated to Accepted and the provider/region recorded (DEPLOYMENT D-01).
- Environment strategy (Local / Test-CI / Staging-UAT / Production) and gates apply once implementation begins (DEPLOYMENT §3/§5; TESTING §14).

## Validation / Evidence
- ARCHITECTURE.md §16 (ARCH-DEC-008 = REQUIRES APPROVAL), §12 (containers + managed PG; R-10).
- TECH-STACK.md §12 (PROPOSED); DEPLOYMENT.md §3/§5/§9/§20 (gaps D-01/D-02); FOLDER-STRUCTURE.md `infra/` (§4).

## References
- ARCH-DEC-008; TECH-STACK.md §12; DEPLOYMENT.md §3/§5/§9/§20; ROADMAP.md R-10; INTEGRATION-SPECIFICATION.md §11.