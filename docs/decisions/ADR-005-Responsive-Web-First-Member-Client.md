# ADR-005: Responsive Web-First Member Client (Native Mobile Deferred)

## Status
**Accepted** for the web-first decision (ARCHITECTURE.md §16, ARCH-DEC-005: **CONFIRMED**; TECH-STACK §4; UI-UX §11/UX-DEC-004). **Proposed** for the conditional React Native plan (native mobile is NOT approved - referenced in the source docs as ARCH-DEC-006, `REQUIRES APPROVAL`, "revisited post-MVP").

## Context
The platform must deliver member, admin/back-office, and merchant experiences, including a mobile/on-device experience. The Abroad program (P11) requires GPS/device location (FR-GEO-001); browser geolocation is the immediate mechanism, with IP geolocation as server-side fallback (BR-GEO-001). The platform is **TypeScript-only** (ADR-010) and web clients are React + Vite SPAs (`apps/web`, `apps/admin`, `apps/merchant`).

## Problem
Choose the delivery mechanism for the member mobile experience that satisfies MVP requirements at acceptable cost while respecting the TypeScript-only constraint.

## Options Considered
- **Responsive web app with browser geolocation** - immediate, TypeScript-only, single codebase.
- **Native mobile (React Native)** - best GPS fidelity, but introduces a second native stack and codebase.
- **PWA** - web plus installability.

## Decision
Deliver all client surfaces as **responsive web apps**; the responsive web app is the **approved mobile/on-device experience for MVP** (UI-UX §11; MOBILE-ARCHITECTURE Part A). Native mobile (React Native) is **revisited post-MVP only** and is **NOT approved** today (ARCH-DEC-006, `REQUIRES APPROVAL`; MOBILE-ARCHITECTURE Part B is a plan, not a decision).

## Rationale
- Web is cheaper and matches the TypeScript-only constraint (ARCH-DEC-005 rationale).
- Browser geolocation covers the immediate Abroad requirement; GPS fidelity of native is the **only** confirmed reason native may be revisited (MOBILE-ARCHITECTURE A-01).
- P11 Abroad details are gated on OD-001..005 and OD-014/015 - unresolved decisions, not enacted.

## Trade-offs
- Abroad GPS accuracy depends on unresolved OD-014 (browser geolocation) - flagged, not decided.
- Native gives the best GPS/device APIs but adds a second stack and native-code approval.
- RN auth transport differs from web cookies (no browser cookie jar) - an open decision (`MA-04`, REQUIRES APPROVAL).

## Consequences
- `apps/web`, `apps/admin`, `apps/merchant` are the approved client surfaces (FOLDER-STRUCTURE §4).
- Any React Native / native dependency work is REQUIRES APPROVAL (MOBILE-ARCHITECTURE header; MA-01 gate).
- Server-side IP geolocation fallback is used where browser geolocation is unavailable (BR-GEO-001).

## Validation / Evidence
- ARCHITECTURE.md §3.5/§16 (ARCH-DEC-005 = CONFIRMED; native = ARCH-DEC-006 REQUIRES APPROVAL).
- TECH-STACK.md §4/§23; UI-UX.md §11 (UX-DEC-004); MOBILE-ARCHITECTURE.md header/§2/§4/§19.

## References
- ARCH-DEC-005, ARCH-DEC-006; TECH-STACK.md §4; MOBILE-ARCHITECTURE.md (Part A/B, §19 MA-01..MA-14); UI-UX.md UX-DEC-004; OD-014/OD-015 (BUSINESS-RULES §12); FR-GEO-001.