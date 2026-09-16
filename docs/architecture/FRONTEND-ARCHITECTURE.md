# JAD - Frontend Architecture SSOT (FRONTEND-ARCHITECTURE.md)

> **Authority:** This document defines the **target architecture of the JA&D (JAD) frontend** - application structure, feature organization, routing, state, the API layer, component architecture, UI composition, client-side authorization, error boundaries, and performance strategy. It is the frontend counterpart of `ARCHITECTURE.md` and sits above `DEVELOPMENT-GUIDELINES.md` in the authority chain.
>
> **Precedence:** BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → API-SPECIFICATION.md → TECH-STACK.md → UI-UX.md → DESIGN-SYSTEM.md → FOLDER-STRUCTURE.md → **this document** → DEVELOPMENT-GUIDELINES.md.
>
> **Status vocabulary:** **CONFIRMED** = derived from approved SSOT decisions. **PROPOSED** = recommended standard not yet formally approved. **REQUIRES APPROVAL** = decision that materially affects architecture, security, or cost. **ASSUMPTION** = working assumption. **TBD** = unresolved; must not be invented. **RECOMMENDED** = a convention with **no repository precedent**.
>
> **Version:** Project 05 - Frontend Engineering (Baseline v1.0)
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only** - there is **no frontend source code** to inspect. `FOLDER-STRUCTURE.md` is the *proposed future structure*; `TECH-STACK.md` defines the *proposed target stack*. This document therefore describes the **recommended target architecture** derived from those approved/proposed SSOTs, **not an implemented system**. It never claims code exists, and it does not invent a structure that contradicts `FOLDER-STRUCTURE.md`.
>
> **Approved anchors (CONFIRMED):** React + Vite SPAs (ARCH-DEC-005); TypeScript full-stack (session decision); session authentication via HttpOnly cookies (ARCH-DEC-007); REST JSON `/api/v1` API as the single source of truth (ARCHITECTURE.md, API-SPECIFICATION.md); money as exact-decimal strings, never floats (BR-WAL-002, TECH-STACK §8).
>
> **Frontend choices still PROPOSED / REQUIRES APPROVAL:** React Router, TanStack Query, Zustand, React Hook Form, CSS Modules/Tailwind, Vitest/Playwright, pnpm/Turborepo, OpenAPI client generation (`openapi-typescript`) - all per TECH-STACK §2/§11. This document adopts them **as the documented target**, but their adoption in a real implementation remains REQUIRES APPROVAL and must not be treated as approved.

---

## 1. Frontend Application Structure

The frontend is a set of three **single-page applications** (no SSR) plus shared packages, per `FOLDER-STRUCTURE.md §3-§4`. Each app is a **read-only consumer** of the REST API; the API enforces all business rules and authorization (ARCHITECTURE.md - trust boundary).

### 1.1 Applications

| App | Audience | Purpose | Routing scope |
|---|---|---|---|
| `apps/web` | Members (`MEM`) | Member-facing portal (auth, catalog, sales, e-wallet, vouchers, genealogy, support) | `SCR-MEM-*`, `SCR-AUTH-*` screens |
| `apps/admin` | Platform ops (`ADM`, `FIN`, `SUP`, `AQ`) | Admin console (verification, catalog, sales approval, payout verification, exceptions, config, content, reporting, audit) | `SCR-ADM-*` screens |
| `apps/merchant` | Merchants (`MRCH`) | Merchant-facing voucher redemption | `SCR-MCH-002/003` screens |

(Source of screen definitions: `../ui-ux/UI-UX.md` §6.2 screen register; roles: API-SPECIFICATION §2.)

### 1.2 Shared packages (`packages/`)

- `packages/contracts` - the **single source** for request/response DTO types, Zod schemas, status enums, and error codes (FOLDER-STRUCTURE §4.1). Frontend apps **only** consume these types; they never re-declare them (FOLDER-STRUCTURE §9.6).
- `packages/config` - typed environment schema and runtime config types (FOLDER-STRUCTURE §4.2; DEVELOPMENT-GUIDELINES §18).
- `packages/shared` - framework-free utilities: exact-decimal money helpers, id/slug utilities, invariant helpers (BI-*) (FOLDER-STRUCTURE §4.3). **No business logic and no React** in shared (FOLDER-STRUCTURE §9.7).

### 1.3 Per-app structure (derived from FOLDER-STRUCTURE §3)

Each app (`apps/<app>/src/`) follows the same skeleton:

```
src/
  main.tsx           # entry point; mounts <App/>
  app/               # router + layouts + route guards (UI-level only)
  features/          # feature slices (see §2) - FG-aligned, horizontal layers
  components/        # shared UI primitives (DESIGN-SYSTEM §6)
  hooks/             # shared app-level hooks
  lib/               # api client, query client, auth context, config
  styles/            # design tokens, global styles
  types/             # re-exports of packages/contracts types
  test/              # unit + Playwright e2e specs (PROPOSED - TECH-STACK §10)
  vite.config.ts
```

### 1.4 Bootstrap sequence

1. `main.tsx` loads runtime env config (typed via `packages/config`).
2. Mounts `<App/>` → initializes the server-state query client (TanStack Query - PROPOSED), the auth context (session cookie), and the theme/design-token wiring (DESIGN-SYSTEM §1).
3. The router (React Router - PROPOSED) resolves the initial route; route-level guards render a **UI loading state** while `/auth/me` resolves (session status).
4. Screens fetch their data through the API layer (§5) and render the UI states (UI-UX §10).

---

## 2. Feature Architecture

- **A feature is a horizontal slice** scoped to one business domain: components, hooks, services (API calls), local state, and contracts usage - co-located under `apps/*/src/features/<feature>/` (FOLDER-STRUCTURE §3).
- **Feature boundaries mirror FG (feature-group) boundaries** (FEATURES.md §3/§4) and the API modules (API-SPECIFICATION §6.1-§6.15): e.g. `verification/`, `catalog/`, `sales/`, `sales-approval/`, `ewallet/`, `voucher-redemption/`, `payout-verification/`, `exceptions/`, `config/`, `content/`, `reporting/`, `audit/`, `genealogy/`, `support/`.
- **A feature owns its:** components, data hooks (wrapping the API layer), form models, and local/client state. It exposes a public surface (typically the feature's route components); other features never import a feature's internals (FOLDER-STRUCTURE §9.5).
- **Shared functionality** (used by 2+ features) moves to `components/`, `hooks/`, or `lib/`; feature-specific logic stays private (DEVELOPMENT-GUIDELINES §13).
- **Adding a feature:** (1) confirm its FG/features and API module exist in FEATURES.md / API-SPECIFICATION.md (no speculative features - FOLDER-STRUCTURE §9.9); (2) create the feature folder per §1.3; (3) register its routes (§3); (4) reuse only shared primitives and `packages/contracts` types.
- **Authorization layering:** features may define *which roles/pages* they expose (UI-level), but every action remains server-enforced (§8).
- **UI behavior** for each feature follows its journey/flow in UI-UX.md §3-§4 and the screen specs (UI-UX.md §6.3).

---

## 3. Routing

Derived from UI-UX §4 (navigation) and the screen register (UI-UX §6.2). Tool: React Router (PROPOSED).

- **Per-app route trees:** defined in `app/`; one route tree per app. Routes map to screens in the screen register (SCR-*). No route defined outside its app.
- **URL is state:** route params and query params carry selection, filters, and pagination (member id, withdrawal id, sale id, tab, page). Back/forward and deep links work.
- **Route-level access:** guarded by UI-level checks (see §8) - public vs authenticated vs role-restricted. Guards are **UX**, not security.
- **Lazy loading:** route-level code splitting (Vite - PROPOSED, §10) for feature bundles; loading states per UI-UX §10.
- **Navigation conventions:** sidebar/topbar, breadcrumbs for deep admin flows, primary/secondary actions per UI-UX §4; unsaved-form navigation warnings on dirty state.
- **Not found:** a route that matches no screen shows a friendly not-found state; admin access to an unauthorized area shows the forbidden state (UI-UX §10), never a leak of the resource's existence.

---

## 4. State Architecture

Derived from TECH-STACK §2 (TanStack Query, Zustand - PROPOSED) and UI-UX §2.1.

**Five kinds of state (from DEVELOPMENT-GUIDELINES §6):**

| Kind | Owner | Notes |
|---|---|---|
| Local UI state | `useState`/`useReducer` in components/hooks | open/close, toggles, current tab, pagination cursor |
| Form state | React Hook Form (PROPOSED) | forms + validation (schemas from `packages/contracts`) |
| Server state | TanStack Query (PROPOSED) | all API reads/mutations, caching, retries, invalidation |
| Global client state | Zustand (PROPOSED, minimal) | current member context, theme, notification prefs |
| URL state | React Router (PROPOSED) | params/query - filters, pagination, selection |

- **Server state is the source of truth for all business data.** The client caches server responses and renders; it never recomputes business truth (balances, commissions, eligibility) locally (BI-001..BI-007, BR-WAL-002).
- **No client-side financial computation:** money arrives as exact-decimal strings from the API; `packages/shared` provides formatting-only helpers (DESIGN-SYSTEM §9). No float arithmetic anywhere (TECH-STACK §8).
- **Avoid unnecessary global state:** default to local, then server state; introduce a Zustand store only for a true cross-cutting client concern (§1 of DESIGN-SYSTEM governance; DEVELOPMENT-GUIDELINES §6). No global store for server data.
- **Cross-feature data sharing:** via the server-state cache (same query keys for the same resource), never by duplicating state across features.
- **Invariant helpers** (BI-*) in `packages/shared` are for formatting/presentation invariants, not for re-deriving business facts.

---

## 5. API Layer

Derived from API-SPECIFICATION.md (contract), TECH-STACK §9 (typed client, PROPOSED).

- **Single typed client:** a fetch-based client generated from the OpenAPI contract (`openapi-typescript` - PROPOSED) lives in each app's `lib/api`. All requests go through it; no ad-hoc `fetch` calls in features (API-SPECIFICATION §1.1 `/api/v1`).
- **Services per feature:** `features/<feature>/services/*.ts` wrap the typed client for that domain; hooks expose them to components. Request/response types come from `packages/contracts`.
- **Response handling:** collections `{ data, meta }` (page-based for admin lists; cursor for ledger/financial streams - API-SPECIFICATION §4); resources returned directly. Pagination is always cursor/page-driven, never "load all".
- **Auth transport:** HttpOnly session cookie (ARCH-DEC-007); the browser sends it automatically. **No tokens in JS/state**; token-less, store-less session (ARCHITECTURE.md - session auth).
- **Mutations:** POST/PATCH/DELETE per API-SPECIFICATION. Idempotency-Key required (and sent) for POST /sales, /me/withdrawals, /vouchers/:id/redemptions, /financial-adjustments (API-SPECIFICATION §5.3; TTL 24h PROPOSED). Mutation retries reuse the same key; read retries are safe.
- **Errors:** normalized to the API error envelope (API-SPECIFICATION §3) and mapped per DEVELOPMENT-GUIDELINES §10. Status codes surfaced: 400/401/403/404/409/422/429/500/503.
- **Concurrency contract:** the client renders server-confirmed statuses only (e.g., sale `SUBMITTED`, withdrawal `RESERVED` - API-SPECIFICATION §7.1/§7.2); it does not optimistically assume side effects.
- **No business-logic duplication:** the client never re-implements eligibility, qualifying-sale rules, commission math, or redemption atomics (BR-*, BI-*). It renders server results and communicates rejections.

---

## 6. Component Architecture

Derived from FOLDER-STRUCTURE §3 and DESIGN-SYSTEM §6.

- **Three component tiers:**
  1. **Shared primitives** - `apps/*/src/components/`: button, input, card, table, dialog, notifications, icons (DESIGN-SYSTEM §6). Generic, token-styled, reusable.
  2. **Feature components** - `features/<feature>/components/`: domain-specific compositions (e.g., `SaleCard`, `WithdrawalDetail`, `VoucherRedeemPanel`). Private to the feature.
  3. **Route/page components** - `app/` (pages) and `features/*/pages`: compose tiers 1-2 into screens per UI-UX screen specs.
- **Container/presentation split:** where useful, a container owns server-state + callbacks and a presentational component receives props. Applied pragmatically (§1/§4 of this doc; DEVELOPMENT-GUIDELINES §4).
- **Component rules (DESIGN-SYSTEM §8):** components must conform to the design-system tokens; no hard-coded brand colors/spacing; money shown only via the money display rule (₱, exact decimals, status labels per BI-002/BI-010, DESIGN-SYSTEM §9); labels/empty/disabled/error states always handled (UI-UX §10).
- **Ownership & reuse:** promote to shared only with 2+ real usages (DEVELOPMENT-GUIDELINES §13); feature internals stay private (FOLDER-STRUCTURE §9.5).
- **Accessibility:** semantic HTML, labels, focus management, keyboard, and screen-reader support per UI-UX §12 / DESIGN-SYSTEM §7 (a11y defects are bugs).

---

## 7. UI Composition

Derived from UI-UX.md and DESIGN-SYSTEM.md (the design-language contract).

- **Design system is the single source of visual truth:** apps consume DESIGN-SYSTEM.md tokens (color roles, typography, spacing, grid, breakpoints) and its 7 components. **No competing design system or component library** may be introduced (task boundary; TECH-STACK §15).
- **Styling approach:** CSS Modules or Tailwind (PROPOSED - TECH-STACK §2), scoped to tokens; responsive-first per UI-UX §11 and DESIGN-SYSTEM §5 (named breakpoints, PROPOSED values).
- **Composition:** screens compose layouts → shared primitives → feature components (§6). Layouts are responsive (mobile nav collapses to bottom nav / hamburger per UI-UX §4.3).
- **UI states:** every screen renders the defined UI states (initial/loading/empty/error/forbidden/not-found/success/disabled/ineligible - UI-UX §10) with the prescribed components (skeletons, alerts, empty states).
- **Forms:** composed from primitives per UI-UX §9; validation per DEVELOPMENT-GUIDELINES §8-9; disabled/ineligible states with remedies (UI-UX §9.8).
- **Feedback & notifications:** inline errors and toasts/notifications per DESIGN-SYSTEM component `Notification`; confirmation before destructive/irreversible actions per UI-UX §9.6 (withdrawal submission requires confirmation; no auto-refund - BR-BND-001/BI-010).
- **Money presentation:** display-only; exact decimal; status labels "Pending"/"Available" per BI-002; ₱ PHP (DESIGN-SYSTEM §9). No local currency/format invention.
- **Config-driven UI values:** options like Gender render from `GET /config/public` (API-SPECIFICATION #81) - never hard-coded (BR-REG-011, BR-CFG-001).

---

## 8. Client-Side Authorization

**Explicit position (CONFIRMED, derived from ARCHITECTURE.md trust boundaries and NFR-AUTHZ-001/002):**

> **The frontend is NOT the security boundary. Client-side authorization is UI affordance only.** Every request is authorized server-side by the API (RBAC guards, object-level ownership, business eligibility - ARCHITECTURE.md §3/§9, NFR-AUTHZ-001/002, API-SPECIFICATION §2/§8). A user can always craft a request directly to the API; the frontend never gates real access.

- **Auth state:** derived from the session via `/auth/me` (API-SPECIFICATION - session restore); held in the auth context (and optionally mirrored in the global store for UX). 401 → route to login preserving the destination.
- **Role-aware UI:** menus, routes, and actions are shown/hidden by the member's roles (ADM/FIN/SUP/AQ/MRCH/MEM - API-SPECIFICATION §2). Role display labels follow UI-UX vocabulary.
- **Object-level UI gating:** ownership/eligibility decisions come from server responses (e.g., an admin sees only resources they may act on; a 404 means "not yours/not visible" - never reveal existence, API-SPECIFICATION §8). The client does **not** infer ownership from client-held data.
- **Protected routes:** route guards (React Router - PROPOSED) redirect unauthenticated users and show the forbidden/not-found state for unauthorized roles (UI-UX §10). These guards are UX; the server enforces on every request.
- **Session expiry:** token-less session (ARCH-DEC-007); on 401 the app drops to the login screen; in-flight data is not trusted after expiry.
- **Business eligibility ≠ role:** a qualified member's capability (e.g., can withdraw) is server-determined (`MEMBER_NOT_QUALIFIED`, `PAYOUT_ACCOUNT_UNVERIFIED`, `INSUFFICIENT_BALANCE`); the client only reflects the server's verdict with the prescribed disabled/ineligible states (UI-UX §9.8).
- **Cross-cutting invariant:** no frontend logic may grant, restrict, or infer access. All authorization is server-enforced (NFR-AUTHZ-001/002).

---

## 9. Error Boundaries

- **Where:** an app-level error boundary at the router root plus per-feature boundaries for heavy/risky regions (render crashes must never blank the whole app).
- **What they catch:** **render-time (unexpected) exceptions only.** They are not a replacement for API/form error handling (§5, DEVELOPMENT-GUIDELINES §10).
- **Fallback UI:** a designed error state (UI-UX §10 - "Unexpected error") with a retry and a way back to a safe screen (home/dashboard); never a raw stack trace; no PII logged (NFR-CONF-001).
- **Recovery:** reset-and-render on retry; preserve safe navigation. Boundary resets route back to the feature entry, not deep state.
- **Logging:** boundary reports go to minimal client diagnostics with a correlation `requestId` when available (API-SPECIFICATION §3); full server-side audit is authoritative (NFR-AUD-001).
- **Boundary vs query errors:** server/network failures are handled in the API layer/query layer and UI states - not by error boundaries.

---

## 10. Performance Strategy

Derived from NFR-PERF-001 (targets TBD - do not invent numbers) and API-SPECIFICATION §4 (pagination).

- **Rendering cost:** prefer plain React; memoize (`React.memo`/`useMemo`/`useCallback`) only where measured or clearly identity-sensitive - never blanket (DEVELOPMENT-GUIDELINES §3). Large lists virtualized only where justified (long genealogy, reporting tables).
- **Code splitting & lazy loading:** route-level dynamic imports (Vite - PROPOSED) so each app shell is small; feature bundles load with their routes. Loading states per UI-UX §10.
- **Bundle discipline:** types are type-only imports (`import type`, DEVELOPMENT-GUIDELINES §12); no dead/duplicate dependencies (DEVELOPMENT-GUIDELINES §17); Vite production build analysis (PROPOSED) checked in CI.
- **Network efficiency:** server-state caching (TanStack Query - PROPOSED) with staleTime tuned per resource; cursor/page pagination for lists and ledgers (API-SPECIFICATION §4); debounced search inputs (UI-UX §9); no "fetch everything" lists.
- **Media/images:** optimized delivery for property media (FEAT-060); no oversized originals in member catalog.
- **Money/critical views:** financial data stays server-authoritative; background refresh only where staleness is acceptable, with visible freshness signals (§5). No optimistic financial mutations.
- **Measurement:** performance targets come from NFR-PERF-001 when defined (currently TBD); do not set arbitrary targets.

---

## 11. Governance & Traceability

- This document references only existing SSOT IDs: `FEAT-*`, `FG-*`, `FR-*`, `NFR-*`, `BR-*`, `BI-*`, `AC-*`, `ARCH-DEC-*`, `SCR-*`, `UX-DEC-*` (see the respective source docs). It introduces **no** new product, role, workflow, or business rule.
- **New to this document:** the frontend target architecture described in §1-§10 (stack items marked PROPOSED/REQUIRES APPROVAL; structure derived from FOLDER-STRUCTURE §3-§4; RECOMMENDED where no repository precedent exists).
- **Approval boundaries (must stop and request approval, never enact silently):** changes to the approved architecture, authN/authZ approach, API contract, design system, global state-management solution, or introduction of a major new dependency/framework - as defined in the Project 05 task and consistent with TECH-STACK §15/§16.
- If an authoritative SSOT changes (e.g., ARCH-DEC-008 deployment, ARCH-DEC-009 NFR targets), re-derive the affected sections here before proceeding.
- Cross-document check: this doc is consistent with `FOLDER-STRUCTURE.md` (structure), `TECH-STACK.md` (stack/statuses), `API-SPECIFICATION.md` (contract/authorization), `UI-UX.md` and `DESIGN-SYSTEM.md` (UI), and `DEVELOPMENT-GUIDELINES.md` (standards).

---