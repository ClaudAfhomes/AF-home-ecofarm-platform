# Architectural Decision Records - JAD (JA&D) Platform

> **Purpose:** Log of the JA&D platform's major architectural decisions. Each ADR explains **why** a decision exists (Context / Problem / Options / Rationale / Trade-offs / Consequences), not merely what is implemented.
>
> **Source of truth:** ADRs are derived **only** from authoritative repository evidence - `ARCHITECTURE.md §16` (decision register), `TECH-STACK.md`, `API-SPECIFICATION.md`, `DATABASE-DESIGN.md`, `BUSINESS-RULES.md`, `SECURITY.md`, `DEPLOYMENT.md`, and the frontend/backend/mobile architecture documents. Decisions that cannot be confidently established from evidence are **not** recorded here (see "Documentation gaps").
>
> **Statuses:** **Accepted** = decision established by approved SSOT material (CONFIRMED in the source docs). **Proposed** = recommended, not yet approved (PROPOSED / REQUIRES APPROVAL in the source docs). **Superseded / Deprecated / Rejected** = for future use when a newer decision replaces an older one; superseded ADRs are preserved, never renumbered.
>
> **Relationship to ARCHITECTURE §16:** the ARCH-DEC-* register is the authoritative decision record; these ADRs are the detailed records of those decisions (plus decisions sourced from other SSOTs). ADR numbering starts at 001 - no ADR files previously existed.
>
> **Repository state:** the repository is **documentation-only**. No decision below is implemented or deployed; `Accepted` means the decision is established as the approved SSOT baseline, not that code exists.

## ADR Index

| ADR | Decision | Status | Primary source |
|---|---|---|---|
| [ADR-001-Modular-Monolith.md](./ADR-001-Modular-Monolith.md) | Modular monolith (hexagonal within modules) | Accepted | ARCH-DEC-001 |
| [ADR-002-NestJS-API-Framework.md](./ADR-002-NestJS-API-Framework.md) | NestJS API framework | **Superseded** - see ADR-002b | ARCH-DEC-002 (archived) |
| [ADR-002b-Vercel-Functions.md](./ADR-002b-Vercel-Functions.md) | Vercel Functions / REST API | **Accepted** | Q1 2026-08-30 |
| [ADR-003-PostgreSQL-System-of-Record.md](./ADR-003-PostgreSQL-System-of-Record.md) | PostgreSQL as system of record | Accepted | ARCH-DEC-003 |
| [ADR-004-Drizzle-and-Raw-SQL-for-Financial-Writes.md](./ADR-004-Drizzle-and-Raw-SQL-for-Financial-Writes.md) | Drizzle ORM + raw SQL for financial writes | Accepted | ARCH-DEC-004 |
| [ADR-005-Responsive-Web-First-Member-Client.md](./ADR-005-Responsive-Web-First-Member-Client.md) | Responsive web-first client; native mobile deferred | Accepted (Part B Proposed) | ARCH-DEC-005 |
| [ADR-006-Session-Based-Authentication.md](./ADR-006-Session-Based-Authentication.md) | Session-based auth with HttpOnly cookies | Accepted | ARCH-DEC-007 |
| [ADR-007-CTO-Controlled-Voucher-Signing-Boundary.md](./ADR-007-CTO-Controlled-Voucher-Signing-Boundary.md) | CTO-controlled voucher signing boundary | Accepted (boundary) / Proposed (mechanism) | BI-008, BR-SEC-001..004, ARCH-DEC-006 |
| [ADR-008-Versioned-REST-JSON-API-Contract.md](./ADR-008-Versioned-REST-JSON-API-Contract.md) | Versioned REST JSON `/api/v1` as the single API contract | Accepted | API-SPECIFICATION §1/§5 |
| [ADR-009-Exact-Decimal-Money-Representation.md](./ADR-009-Exact-Decimal-Money-Representation.md) | Exact-decimal money (never floating point) | Accepted (precision values Proposed) | BR-WAL-002; TECH-STACK §5/§8/§17 |
| [ADR-010-TypeScript-Only-Full-Stack.md](./ADR-010-TypeScript-Only-Full-Stack.md) | TypeScript-only full stack | Accepted | TECH-STACK §2/§3; ARCH-DEC-005 |
| [ADR-011-pnpm-Workspaces-Monorepo.md](./ADR-011-pnpm-Workspaces-Monorepo.md) | pnpm workspaces + Turborepo monorepo | Proposed | TECH-STACK §11 |
| [ADR-012-Deployment-Infrastructure-Provider.md](./ADR-012-Deployment-Infrastructure-Provider.md) | Containerized deployment; provider/region OPEN | Proposed | ARCH-DEC-008 |
| [ADR-013-Admin-Member-Messaging.md](./ADR-013-Admin-Member-Messaging.md) | Admin ↔ member messaging (one thread per member, text-only, realtime) | **Accepted** | Owner-approved scope (2026-09-14); FEAT-072 |
| [ADR-014-One-Step-Voucher-Creation-and-Admin-QR-Scan.md](./ADR-014-One-Step-Voucher-Creation-and-Admin-QR-Scan.md) | Voucher creation (definition) + assign to members + admin QR scan/redeem (local QR; unique member-scoped vouchers) | **Accepted** | Owner-approved scope (2026-09-15) |

## Adding or changing an ADR

1. Use the template in the ADRs below (`Status`, `Context`, `Problem`, `Options Considered`, `Decision`, `Rationale`, `Trade-offs`, `Consequences`, `Validation / Evidence`, `References`).
2. Number sequentially; **never renumber existing ADRs**.
3. When a newer decision replaces an older one, mark the older ADR `Superseded` with a reference to the replacement - do not delete it.
4. Do not formalize a decision as `Accepted` without authoritative evidence. Unverifiable decisions are reported as documentation gaps (see `CHANGELOG.md` and the validation notes in DEPLOYMENT.md §20).

## Known source inconsistency (to resolve with the owning human)

- **ARCH-DEC-006 is overloaded in the source docs:** ARCHITECTURE.md §16 defines it as the *CTO signing-service mechanism* (Cloud KMS / HSM; REQUIRES APPROVAL (CTO)), while ARCHITECTURE §3.5, TECH-STACK §4/§23, and MOBILE-ARCHITECTURE use it as the *native-mobile approval* (React Native NOT approved; revisited post-MVP). This ADR set preserves each source's usage - ADR-007 (signing mechanism) and ADR-005 (native mobile deferral) both cite ARCH-DEC-006 - and does **not** invent a resolution. This inconsistency should be reconciled by the Owner/CTO before implementation.

## Documentation gaps (decisions NOT recorded)

The following are **not** recorded as ADRs because evidence is insufficient or the item is open (must not be invented):

- **NFR numeric targets** (ARCH-DEC-009) - `TBD`; no decision exists to record.
- **Deployment provider/region/orchestrator** (ARCH-DEC-008) - `REQUIRES APPROVAL`; recorded as **ADR-012 (Proposed)** only to capture the intended shape, not an accepted provider.
- **CTO signing-service mechanism** (KMS / HSM / air-gapped) - CTO-chosen; not yet decided. Covered as the Proposed mechanism within **ADR-007**.
- **CSRF mechanism, rate-limit values, session-store and TTL choices, transaction-isolation strategy, scheduler/queue choice, Prisma-as-alternative** - `PROPOSED`/`REQUIRES APPROVAL` in the SSOTs; not yet decisions.
- **Any decision that would require changing BUSINESS-RULES, REQUIREMENTS, or ARCHITECTURE SSOT content** - excluded by the approval boundary; must not be invented.

---
*Maintained alongside `CHANGELOG.md`. See also ARCHITECTURE.md §16 (ARCH-DEC-* register) and ROADMAP.md §11 (approval boundary).*