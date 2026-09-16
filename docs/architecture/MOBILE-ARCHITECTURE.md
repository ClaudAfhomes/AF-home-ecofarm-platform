# JAD - Mobile Architecture (MOBILE-ARCHITECTURE.md)

> **Authority:** This document defines the **mobile implementation context** for the JA&D (JAD) platform. It is the mobile counterpart of `FRONTEND-ARCHITECTURE.md` and `BACKEND-ARCHITECTURE.md`, and sits above `DEVELOPMENT-GUIDELINES.md` in the authority chain.
>
> **Precedence:** BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → API-SPECIFICATION.md → TECH-STACK.md → UI-UX.md → DESIGN-SYSTEM.md → FOLDER-STRUCTURE.md → FRONTEND-ARCHITECTURE.md → BACKEND-ARCHITECTURE.md → DATABASE-DESIGN.md → **this document** → DEVELOPMENT-GUIDELINES.md.
>
> **Status vocabulary:** **CONFIRMED** = derived from approved SSOT decisions. **PROPOSED** = recommended standard not yet formally approved. **REQUIRES APPROVAL** = decision that materially affects architecture, security, or cost. **ASSUMPTION** = working assumption. **TBD** = unresolved; must not be invented. **RECOMMENDED** = a convention with **no repository precedent**. **NOT APPLICABLE** = explicitly out of scope.
>
> **Version:** Project 08 - Mobile Engineering (Baseline v1.0)
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only** - there is **no application source code** (web, mobile, or native) to inspect. `FOLDER-STRUCTURE.md` is the *proposed future structure*; `TECH-STACK.md` defines the *proposed target stack*. There is **no React Native code, no native config, no mobile navigation/API/storage/permission/test implementation** in the repository. This document therefore describes the **recommended target architecture** derived from the approved/proposed SSOTs - **not an implemented system**.
>
> **Approved anchors (CONFIRMED):** TypeScript full-stack; React + Vite responsive web SPAs (`apps/web`, `apps/admin`, `apps/merchant` - ARCH-DEC-005); session authentication via HttpOnly cookies (ARCH-DEC-007); REST JSON `/api/v1` as single source of truth; money as exact-decimal strings, never floats (BR-WAL-002); **responsive web is the approved mobile/on-device experience for MVP** (UI-UX §11, ARCH-DEC-005).
>
> **Native-mobile status (CRITICAL):** **React Native / native mobile is NOT approved.** It is ARCH-DEC-006, marked **PROPOSED / REQUIRES APPROVAL**, "revisited post-MVP" (ARCHITECTURE.md §3.5/§4.1, TECH-STACK.md §4, UI-UX.md UX-DEC-004). Every section below that depends on a native decision is explicitly marked `REQUIRES APPROVAL` and **must not be treated as approved** or enacted without Owner/CTO approval.
>
> **Document shape:** Part A (§1.5, §4.4, §10, §11, §14) documents the **CONFIRMED web-first mobile experience** (the approved on-device behavior today). Part B (§2-§9, §12, §13, §15-§20) documents the **conditional React Native plan** for when ARCH-DEC-006 is approved. Part B is a plan, not a decision.

---

## 1. Document Overview

### 1.1 Purpose

Provide an implementation-ready mobile architecture that explains how a mobile experience for JAD should be structured and behave - currently via the **approved responsive web apps**, and post-MVP via a **conditional React Native application** (ARCH-DEC-006). The document aligns with the SSOT hierarchy and introduces no requirements, business rules, APIs, permissions, dependencies, or platform requirements that are not already confirmed or explicitly flagged.

### 1.2 Scope

**In scope:**

- Mobile architecture definition for both the confirmed web-first mobile experience and the conditional React Native plan.
- Navigation, screen, component, state, API, authentication, secure storage, permissions, offline/network, push, deep-linking, platform-difference, performance, accessibility, security, and testing coverage.
- Architecture traceability to requirements/features/API/architectural decisions.
- Open decisions (`REQUIRES APPROVAL`) and `TBD` items.

**Out of scope:**

- Implementing any mobile/React Native code, creating screens/components, installing dependencies, changing API contracts, database design, business rules, requirements, or the design system.
- Any native architecture decision that has not been approved (all marked `REQUIRES APPROVAL` in §19).

### 1.3 Relationship to other architecture documents

| Document | Relationship |
|---|---|
| `ARCHITECTURE.md` | Trust boundaries (§3), application inventory (§4.1), ARCH-DEC-005/006/007 |
| `API-SPECIFICATION.md` | The API contract the mobile client consumes (§1-§9) - **single source of truth for behavior** |
| `TECH-STACK.md` | Stack/statuses (§2 frontend, §4 mobile, §7 auth, §8 money) |
| `FRONTEND-ARCHITECTURE.md` | Web frontend architecture; **the pattern this document mirrors** for mobile (structure, features, state, API layer, components, client-side authorization, error boundaries, performance) |
| `BACKEND-ARCHITECTURE.md` | Backend modules, session auth (§8), API rules (§16); mobile depends on the same API |
| `DATABASE-DESIGN.md` | Entities the mobile client renders; no client-side business truth |
| `UI-UX.md` | Screen register (§6), navigation (§4), patterns (§8/§9), UI states (§10), responsive behavior (§11), accessibility (§12), constraints (§13) |
| `DESIGN-SYSTEM.md` | Visual/component contract (§1-§10) |
| `DEVELOPMENT-GUIDELINES.md` | Coding standards the mobile code must follow |

### 1.4 Source-of-truth hierarchy

Business and behavior truth flows: BUSINESS-RULES → REQUIREMENTS → FEATURES → ROADMAP → ARCHITECTURE → API-SPECIFICATION → TECH-STACK → UI-UX → DESIGN-SYSTEM → FOLDER-STRUCTURE → FRONTEND-ARCHITECTURE / BACKEND-ARCHITECTURE / DATABASE-DESIGN → **MOBILE-ARCHITECTURE** → DEVELOPMENT-GUIDELINES.

**Critical rule:** the mobile client is a **read-only consumer** of the REST API. The API enforces all business rules and authorization (ARCHITECTURE.md trust boundary; NFR-AUTHZ-001/002). The mobile client never re-derives or overrides business truth.

### 1.5 Project / phase context

| Phase | Mobile relevance |
|---|---|
| MVP (P1..P7) | **Responsive web apps** deliver the mobile experience (ARCH-DEC-005, CONFIRMED); browser geolocation for Abroad (FR-GEO-001) |
| P8 (vouchers) | Merchant redemption portal = web app; RN merchant app **NOT APPROVED / NOT APPLICABLE** |
| P9 (content) | Broadcasts & push (FEAT-063) - push infrastructure ASSUMPTION 6 (provider OPEN); native push **REQUIRES APPROVAL** |
| P10 (reporting) | Genealogy/reports in web apps; large-tree virtualization (UI-UX §11.4) |
| P11 (programs & geolocation) | Abroad GPS/device location (FEAT-014/015/016); native GPS is the **only confirmed reason native may be revisited** (ARCH-DEC-005 note; OD-014/015 gated) |
| P12+ (post-MVP) | **React Native revisited under ARCH-DEC-006 - REQUIRES APPROVAL** |

> MVP mobile scope = **Member Web App** (`apps/web`) on small viewports. Admin/Back-office (`apps/admin`) and Merchant (`apps/merchant`) remain web-only; RN versions of those are **NOT APPROVED / NOT APPLICABLE** unless separately approved.

---

## 2. React Native Architecture

> **This section is Part B - the conditional React Native plan (ARCH-DEC-006, REQUIRES APPROVAL).** Nothing here is implemented.

### 2.1 Application architecture

**Proposed:** a single React Native application covering the member-facing scope (auth, registration, qualification, profile, sales, eWallet, withdrawals, payout accounts, vouchers, genealogy, notifications - i.e., the `apps/web` scope per FRONTEND-ARCHITECTURE §1.1), delivered for Android and iOS from a shared TypeScript codebase. **REQUIRES APPROVAL** - the app split (one member app vs. separate apps) must be approved before implementation.

| Item | Proposal | Status |
|---|---|---|
| Framework | React Native (ARCH-DEC-006 name only) | **REQUIRES APPROVAL** |
| Language | TypeScript (project-wide session decision) | CONFIRMED |
| Navigation | React Navigation (bottom tabs + native stack + drawer) | **REQUIRES APPROVAL** (no repo precedent; FRONTEND-ARCHITECTURE uses React Router for web) |
| State | Same model as FRONTEND-ARCHITECTURE §4 (local + server state + minimal global) | **REQUIRES APPROVAL** (client choice) |
| API client | Typed client from the OpenAPI contract (`openapi-typescript` pattern, FRONTEND-ARCHITECTURE §5) | **REQUIRES APPROVAL** |
| Monorepo placement | `apps/mobile` inside the existing monorepo (FOLDER-STRUCTURE §1) | **REQUIRES APPROVAL** - FOLDER-STRUCTURE.md does **not** define a mobile app; adding `apps/mobile` is a FOLDER-STRUCTURE change |
| Package sharing | `packages/contracts`, `packages/config`, `packages/shared` reused as-is (no React/DOM in shared - FOLDER-STRUCTURE §9.7) | CONFIRMED reusable; RN-safe subset **REQUIRES APPROVAL** (see §2.5) |

### 2.2 Module / screen boundaries

- Screens map 1:1 to the **confirmed screen register** (`UI-UX.md` §6.2/§6.3): `SCR-AUTH-*`, `SCR-MEM-*`. **No new screens are invented.** Screens for staff (`SCR-ADM-*`) and merchant (`SCR-MCH-*`) are **NOT APPLICABLE** to the member RN app.
- Feature boundaries mirror FG-* and the feature slices of FRONTEND-ARCHITECTURE §2 (e.g., `registration/`, `profile/`, `qualification/`, `referral/`, `catalog/`, `sales/`, `ewallet/`, `withdrawals/`, `payout/`, `vouchers/`, `genealogy/`, `notifications/`). Each feature owns its components, data hooks, form models, and local state (FRONTEND-ARCHITECTURE §2).

### 2.3 Presentation / business / data responsibilities

Identical to FRONTEND-ARCHITECTURE §1/§4 (container/presentation split, pragmatic):

| Layer | Responsibility | Rule |
|---|---|---|
| Presentation (screens/components) | Render UI states (UI-UX §10); user input; navigation | No business logic |
| Data hooks / services | Call the typed API client; expose data to components | Only API calls + formatting |
| Client state | Local + server cache + minimal global (session context) | No business truth, no financial math (BR-WAL-002, FRONTEND-ARCHITECTURE §4) |
| Business truth | **The API only** | Server-authoritative; client renders results (BI-001..BI-007) |

### 2.4 Component organization

Mirror FRONTEND-ARCHITECTURE §6's three tiers:

1. **Shared primitives** - buttons, inputs, cards, list rows, dialogs, sheets, toasts, money display (DESIGN-SYSTEM §6/§9). Token-styled.
2. **Feature components** - domain compositions (`SaleCard`, `WithdrawalDetail`, `VoucherRedeemPanel`), private to the feature.
3. **Route/screen components** - compose tiers 1-2 into the confirmed screens (UI-UX §6).

### 2.5 Platform-specific code strategy

**Proposed:** platform files via the `.ios.tsx`/`.android.tsx` (and `.native.tsx`) convention for the **confirmed platform differences only** (§14): safe areas, back navigation, permissions, notifications, keyboards. **REQUIRES APPROVAL.** No platform divergence for business behavior - business behavior is identical on both platforms because it is server-enforced.

### 2.6 Approved framework / tooling

| Item | Proposal | Status |
|---|---|---|
| RN version | Current stable at implementation time | **REQUIRES VERIFICATION** (no manifests exist; TECH-STACK §9 convention) |
| Build tooling | Metro (default RN) | **REQUIRES APPROVAL** |
| Form handling | React Hook Form (same as web, PROPOSED in TECH-STACK §2) | **REQUIRES APPROVAL** |
| Server state | TanStack Query (same as web) | **REQUIRES APPROVAL** |
| Validation schemas | From `packages/contracts` (Zod) - single source | CONFIRMED reuse |
| Design tokens | Consumed from `packages/config`/design tokens per DESIGN-SYSTEM §1 | **REQUIRES APPROVAL** (token consumption mechanism) |
| Lint/test tooling | Per DEVELOPMENT-GUIDELINES; RN test runner choice | **REQUIRES APPROVAL** |

> **No dependency is adopted here.** Every native dependency (navigation, storage, permissions, push, geolocation, image picker, secure storage, deep-linking) is `REQUIRES APPROVAL` (§19) and must be evaluated for security/supply-chain risk before approval (DEVELOPMENT-GUIDELINES §17).

---

## 3. Navigation Architecture

> **Part B - REQUIRES APPROVAL.**

### 3.1 Navigation hierarchy

**Proposed** (mapped to UI-UX §4.6 "Mobile navigation behavior" and the screen register):

```
Auth (public)
├── Login            SCR-AUTH-001
├── Register         SCR-AUTH-002 (program choice, profile, qualification,
│                      referral code, ID upload, email verification)
├── Email verify     SCR-AUTH-003
└── Registration done SCR-AUTH-004/005

App (authenticated member)
├── Tabs (bottom nav - 5 destinations per UI-UX §4.6)
│   ├── Dashboard    SCR-MEM-001
│   ├── Sales        SCR-MEM-005/006/007
│   ├── eWallet      SCR-MEM-008/009
│   ├── Referrals    SCR-MEM-016/017/018
│   └── Notifications SCR-MEM-022..024
├── Drawer ("More")  profile (SCR-MEM-002..004), payout (SCR-MEM-010/011),
│                      withdrawals (SCR-MEM-012..014), vouchers (SCR-MEM-020/021),
│                      policies, support
└── Stacks (from any tab) - deep detail screens (sale detail, ledger, genealogy)
```

### 3.2 Navigation containers

| Container | Use | Source |
|---|---|---|
| Stack navigator | Auth flow; detail screens with back | UI-UX §4.7 (back preserves filters/scroll where practical) |
| Bottom tabs | Member app's 5 most frequent destinations (Dashboard, Sales, eWallet, Referrals, Notifications) | UI-UX §4.6 |
| Drawer | Remaining destinations ("More") | UI-UX §4.6 |

### 3.3 Authentication / public / private routes

- **Public:** `SCR-AUTH-001..005` (auth/registration). Unauthenticated users are redirected to login (UI-UX §10 "401 → route to login preserving the intended destination").
- **Private:** all `SCR-MEM-*`. Gated by session state derived from the API (§8), not by any client-held secret.
- **Route guards are UI affordance only** - the server enforces access on every request (FRONTEND-ARCHITECTURE §8, CONFIRMED).

### 3.4 Role-based navigation

- The member app is scoped to roles `MEM` (Member) and `AQ` (Active + Qualified Member). Eligibility-gated items (Submit sale, Sponsor) are **shown disabled with a link to Qualification status**, never a 403 dead-end (UI-UX §4.5). No `ADM`/`FIN`/`SUP`/`MRCH` navigation exists in the member RN app (roles per API-SPECIFICATION §2).
- Admin-only and Super Admin-only items are not rendered (least privilege, NFR-SEC-001) - **NOT APPLICABLE** to the member app.

### 3.5 Deep-link entry points

See §13. **No URL schemes/domains are defined anywhere in the SSOTs** - deep linking is `TBD / REQUIRES APPROVAL`.

### 3.6 Back-navigation behavior

- Android hardware back and iOS swipe-back both map to the navigation stack (pop) and must preserve the same back semantics (UI-UX §4.7).
- Back on a form with unsaved changes shows the unsaved-changes confirmation (UI-UX §9.7).
- Back must never exit an in-flight idempotent mutation silently (API-SPECIFICATION §5.3); the request continues and the result is surfaced on return.

### 3.7 Navigation state considerations

- Navigation state is **not persisted across cold starts** by default (no approved requirement). Session restore is via `/auth/me` (§8). **REQUIRES APPROVAL** if state restoration is ever desired.
- URL-is-state does **not** apply to RN the same way as web (FRONTEND-ARCHITECTURE §3); selection/filters are held in screen-local state or query params of the RN navigation params. **REQUIRES APPROVAL** for the exact param model.

---

## 4. Screen Architecture

### 4.1 Screen responsibilities

Each screen:

- Renders **exactly one confirmed screen spec** (UI-UX §6.2/§6.3); no invented screens.
- Owns its data fetching through feature hooks (server state), renders the standard UI states (§4.2), and forwards user actions to the API.
- Never computes or infers business truth (balance, eligibility, commission, qualifying-sale status) - it renders the API's response (FRONTEND-ARCHITECTURE §4/§8).

### 4.2 Loading / empty / error states

Every screen implements the **UI-UX §10 UI-state contract**:

| State | Behavior (from UI-UX §10) |
|---|---|
| Initial | Skeleton/structured placeholder; never blank |
| Loading | Visible progress; submit buttons disabled during idempotent submits; no double-submit |
| Empty | Friendly empty state with primary action; financial empty states show `Available = ₱0.00` as a valid state (BI-002) |
| Error | Map error code → readable message (API-SPECIFICATION §3); keep entered data; retry reuses Idempotency-Key |
| Validation | Inline errors; focus first invalid field |
| Success | Positive feedback with resulting record/status/amount |
| Disabled | Explain why + link to remedy (UI-UX §9.8) |
| Unauthorized/forbidden | 401 → login preserving destination; 403 → clear message; 404 hides others' resources |
| Network failure | Offline banner; retry preserves form + Idempotency-Key |
| Partial data | Show available summary with explicit "partial" indicator |
| Confirmation / destructive | Confirmation dialog; mandatory reason input; audit acknowledgment (NFR-SEC-002) |

### 4.3 Data ownership & navigation dependencies

- Data ownership: server-state cache owned by feature hooks (FRONTEND-ARCHITECTURE §4). Cross-feature sharing via the same query keys, never duplicated state.
- Navigation dependencies: screen params carry selection (sale id, withdrawal id, tab); navigation never carries business data (server data is fetched by id).

### 4.4 Reusable screen patterns

- **Confirmed web patterns that apply to the RN plan unchanged** (UI-UX §11): single-column forms (11.8), tables → stacked cards on small screens (11.3/11.7), full-screen modals on mobile (11.10), touch targets ≥ 44px (11.5, DESIGN-SYSTEM §3.2), money/statuses never wrap (11.11), financial tables read-only (BI-005 - no row-edit affordance).
- These apply to the **web apps today** (Part A) and to the RN plan when approved (Part B).

---

## 5. Mobile-Specific Components

> **Part B - REQUIRES APPROVAL.**

### 5.1 Shared mobile components

Primitives derived from DESIGN-SYSTEM §6, implemented natively (not reusing DOM components):

| Component | Design-system source | Mobile notes |
|---|---|---|
| Button / IconButton | DESIGN-SYSTEM §6 | Touch target ≥ 44px (UI-UX §12.8) |
| TextInput / FormField | §6.2 | Keyboard-aware; numeric/money keyboards for money/phone (UI-UX §11.8) |
| Card | §6.3 | Used for list rows (tables → cards) |
| List row / ListItem | §6.4 | FlatList-based (§15) |
| Dialog / BottomSheet | §6.5 | Bottom sheet on mobile; full-screen sheet per UI-UX §11.10 |
| Notification/Toast | §6.6 | Safe-area aware (§14) |
| Money display | §9 | Exact decimals, ₱, Pending/Available labels (BI-002); display-only |
| StatusChip | §6.7 | Icon + label, never color-only (UI-UX §12.6) |

### 5.2 Forms

- React Hook Form + Zod schemas from `packages/contracts` (single source; FRONTEND-ARCHITECTURE §4).
- Per UI-UX §9: visible associated labels (9.2), required/optional marks (9.3), inline errors with first-field focus (9.4/9.5), submission disables + idempotent submit (9.6), unsaved-change warnings (9.7), disabled/ineligible states with remedies (9.8).

### 5.3 Lists

- `FlatList` (virtualized) for all lists: sales, ledger, commissions, withdrawals, referrals, genealogy (UI-UX §11.4 large-tree virtualization).
- **Cursor pagination** from the API for ledger/financial streams; page-based for admin-style lists - but admin lists are NOT APPLICABLE in the member app (API-SPECIFICATION §4).
- List rows for financial data: status, amount, date first; remainder behind expand (UI-UX §11.7).

### 5.4 Modals & bottom sheets

- Full-screen sheets on mobile per UI-UX §11.10; standard confirmation pattern for destructive actions (UI-UX §8.4/§8.5); destructive confirmations never rendered without the standard pattern.

### 5.5 Feedback / loading components

- Skeletons (initial), spinners/progress (loading), toasts (success/error), offline banner (network failure) - UI-UX §10, DESIGN-SYSTEM §6.6.

### 5.6 Device-specific UI

- Safe areas: `SafeAreaView`/`useSafeAreaInsets` for notches/home indicators (Android/iOS) - §14.
- Keyboard: `KeyboardAvoidingView` + scroll-to-focused-field (iOS vs Android differences) - §14.

### 5.7 Responsive / adaptive patterns

- Adaptive, not shrink-to-fit (UI-UX §11): breakpoints from DESIGN-SYSTEM §5 (PROPOSED values: mobile <640, tablet 640-1023, desktop ≥1024 - **REQUIRES APPROVAL**). RN plan targets **mobile-first**; tablet layouts are `TBD / REQUIRES APPROVAL` (RN tablet support is not a confirmed requirement).

---

## 6. State Management

> **Part B - REQUIRES APPROVAL.** Mirrors FRONTEND-ARCHITECTURE §4 exactly.

| Kind | Owner (proposal) | Notes |
|---|---|---|
| Local UI state | `useState`/`useReducer` in components/hooks | open/close, toggles, current tab, pagination cursor |
| Form state | React Hook Form | forms + validation (schemas from `packages/contracts`) |
| Server state | TanStack Query | all API reads/mutations, caching, retries, invalidation |
| Global client state | minimal (e.g., Zustand) | current member context, notification prefs, session indicator |
| Navigation state | React Navigation | params - selection, filters |

- **Server state is the source of truth for all business data.** No client-side financial computation; money arrives as exact-decimal strings; `packages/shared` provides formatting-only helpers (FRONTEND-ARCHITECTURE §4; BR-WAL-002).
- **Avoid duplicated state:** default to local → server state; introduce global store only for a true cross-cutting client concern; no global store for server data.
- **Persistent state:** limited to non-business UI prefs (e.g., last visited tab) and secure session/sensitive data (§9). Business data is never persisted as authoritative. **REQUIRES APPROVAL** for the exact persistence layer.
- **Cache strategy:** TanStack Query caching with per-resource `staleTime`; invalidation after mutations on the same query keys. Financial data stays server-authoritative; no optimistic financial mutations (FRONTEND-ARCHITECTURE §5/§10).

---

## 7. API Integration

> **Part B - REQUIRES APPROVAL (client implementation). The API contract itself is CONFIRMED (API-SPECIFICATION.md).**

- **Single typed client:** a fetch-based client generated from the OpenAPI contract (`openapi-typescript` pattern), in `lib/api` (FRONTEND-ARCHITECTURE §5). All requests through it; no ad-hoc requests in features (API-SPECIFICATION §1.1 `/api/v1`).
- **Request/response:** collections `{ data, meta }`; cursor for ledger/financial streams, page-based for lists (API-SPECIFICATION §4); resources returned directly. Pagination always server-driven, never "load all".
- **Authentication transport:** the web apps use HttpOnly session cookies (ARCH-DEC-007). **In React Native there is no browser cookie jar** - the session-transport mechanism for RN is **REQUIRES APPROVAL** (either maintain server-issued session cookies through an RN cookie jar, or a session token - see §8). This is an open architectural decision, not decided here.
- **Error handling:** normalize to the API error envelope `{error:{code,message,details,requestId,timestamp}}` (API-SPECIFICATION §3) and map to UI-UX §10 states; surface 400/401/403/404/409/422/429/500/503.
- **Retry behavior:** read retries are safe; **mutation retries reuse the same Idempotency-Key** (API-SPECIFICATION §5.3) - generated client-side and persisted for the operation (§9). Keys are required on `POST /sales`, `/me/withdrawals`, `/vouchers/:id/redemptions`, `/financial-adjustments` (24h TTL **PROPOSED / REQUIRES APPROVAL**).
- **Timeout behavior:** configurable per-request timeouts with a global default; **value TBD / REQUIRES APPROVAL** (NFR-PERF-001 targets TBD - do not invent).
- **Request cancellation:** on screen unmount (TanStack Query cancellation / AbortController in the fetch client) to avoid state updates after unmount. **REQUIRES APPROVAL** for the exact mechanism.
- **Loading states:** derived from the query layer (isPending/isFetching) → UI-UX §10 Loading state; submit buttons disabled during idempotent submits.
- **Cache/invalidation:** same query keys for the same resource; invalidate on mutation success; no optimistic financial updates (FRONTEND-ARCHITECTURE §5).
- **Concurrency contract:** render server-confirmed statuses only (`SUBMITTED`, `RESERVED` - API-SPECIFICATION §7.1/§7.2); never assume side effects client-side.

---

## 8. Authentication & Authorization

> **Part B - REQUIRES APPROVAL for the RN transport mechanism. The session-auth model itself is CONFIRMED (ARCH-DEC-007).**

- **Authentication flow (CONFIRMED contract):** member login → server establishes a session (ARCH-DEC-007; HttpOnly/Secure/SameSite cookies for web). Session restore is via the session endpoint (`/auth/me`, API-SPECIFICATION §6.1). Email verification is a hard gate to approval (BR-AUTH-001).
- **Session lifecycle (CONFIRMED contract):** server-side session store (BACKEND-ARCHITECTURE §8; DB-backed sessions PROPOSED - DATABASE-DESIGN §7.7); sessions revocable, survive restarts.
- **Token handling - REQUIRES APPROVAL for RN:** the confirmed web mechanism (HttpOnly cookie) does not exist natively in RN. Options that **must be decided by Owner/CTO**, not assumed here:
  - (a) RN-side session cookie jar (keeps ARCH-DEC-007 unchanged);
  - (b) a server-issued opaque session token stored in the OS secure store (Keychain/Keystore) and sent via a header - this is an authN transport change and therefore an **architecture change REQUIRES APPROVAL**;
  - (c) WebView-based auth (rejected for the general UI; not a decision).
  - JWT is **NOT** approved (ARCH-DEC-007 explicitly: session cookies, no JWT) - do not adopt JWT without approval.
- **Session expiration:** 401 → drop to login preserving the intended destination (UI-UX §10); in-flight data is not trusted after expiry (FRONTEND-ARCHITECTURE §8).
- **Logout:** call the logout endpoint; revoke server session; clear all local session/sensitive data (§9). Logout must also clear the server-state cache.
- **Protected screens:** route guards redirect unauthenticated users; guards are **UX, not security** (FRONTEND-ARCHITECTURE §8, CONFIRMED).
- **Role/permission-based UI:** member app renders `MEM`/`AQ`-scoped UI; eligibility items shown disabled with remedy links (UI-UX §4.5); least-privilege rendering (NFR-SEC-001).
- **Server-side authorization dependency (CONFIRMED, explicit):** **client-side checks never replace backend authorization.** Every request is authorized server-side (RBAC, object-level ownership, business eligibility - ARCHITECTURE §3/§9, NFR-AUTHZ-001/002, API-SPECIFICATION §8). A user can always craft a request directly to the API; the mobile app never gates real access. Business eligibility verdicts (e.g., `MEMBER_NOT_QUALIFIED`, `PAYOUT_ACCOUNT_UNVERIFIED`, `INSUFFICIENT_BALANCE`) come from the server; the client only reflects them (UI-UX §9.8).

---

## 9. Secure Storage

> **Part B - REQUIRES APPROVAL (mechanism). The classification rules below are CONFIRMED derivations.**

### 9.1 What sensitive data may be stored

| Data | Allowed | Storage (proposal) | Status |
|---|---|---|---|
| Session token (if option (b) of §8 is approved) | Yes, on device | **OS secure store** (iOS Keychain / Android Keystore-backed storage) | **REQUIRES APPROVAL** |
| Idempotency-Key for an in-flight operation | Yes (transient) | In-memory while the form is open; persisted only for the retry window | **REQUIRES APPROVAL** |
| Server-returned PII/financial data (cache) | Transient cache only | In-memory server-state cache; **not** persisted to disk | CONFIRMED derivation |
| Auth cookies (if option (a) of §8) | Yes | OS secure store-backed cookie jar | **REQUIRES APPROVAL** |

### 9.2 Data that must NOT use ordinary storage

- Password, password hashes, or raw email-verification tokens - never stored on device.
- Raw session tokens/credentials in AsyncStorage, files, or logs - prohibited.
- Application secrets (API keys, signing keys, config secrets) - **never in the mobile bundle** (see 9.4).
- Full ledger/balance caches persisted to disk - not authorized (no approved offline requirement, §11).

### 9.3 Logging restrictions (CONFIRMED)

- No PII or financial data in logs (NFR-CONF-001, API-SPECIFICATION §8 "no PII/financial data in logs or error responses"). Mobile diagnostics include only non-sensitive markers and `requestId` when available (API-SPECIFICATION §3).

### 9.4 Application secrets / bundle protection

- **Never store application secrets or privileged credentials in the mobile bundle.** No client secret, no signing key (BI-008: master signing key never in application infrastructure), no hard-coded credentials. Server-issued public verification material is the only cryptographic material the app holds (BR-SEC-001..004, API-SPECIFICATION §8 Signing boundary).

### 9.5 Logout cleanup (CONFIRMED)

- On logout (and on 401 session-expiry): clear secure-stored session data, the server-state cache, and any in-flight Idempotency-Keys. No residual authenticated data remains on the device.

---

## 10. Device Permissions

> Only permissions **justified by confirmed requirements** are documented. No permission is added without a confirmed requirement (task rule).

### 10.1 Justified permissions (confirmed requirement basis)

| # | Permission | Purpose | Requirement/feature basis | Platform |
|---|---|---|---|---|
| P-01 | **Location** (GPS/device) | Abroad program location determination; primary method (GPS), IP fallback server-side | FR-GEO-001, BR-GEO-001, FEAT-014 | Android + iOS |
| P-02 | **Camera** | Government ID document capture at registration | FR-REG-002, BR-REG-002, FEAT-010 | Android + iOS |
| P-03 | **Photo library / media** | Government ID upload, optional profile photo (FR-MEM-001), marketing media viewing | FR-REG-002, FR-MEM-001, FR-ADM-002, FEAT-010/060 | Android + iOS |
| P-04 | **Notifications** | Broadcasts/push (member dashboard, SCR-MEM-001) | FR-ADM-005, BR-NOT-002, FEAT-063 | Android + iOS |

> Not justified → not documented as required: contacts, phone, SMS, calendar, health, storage (Android 13+ scoped), microphone, bluetooth, etc. **No such permission may be added without a confirmed requirement and approval.**

### 10.2 Web-first (Part A - CONFIRMED) permission behavior

- The approved web apps use **browser geolocation** for Abroad (FR-GEO-001; ARCH-DEC-005, CONFIRMED) and browser file input for ID/uploads. IP geolocation is the server-side fallback (BR-GEO-001).
- **Location accuracy threshold (OD-014) and anti-spoofing (OD-015) are BLOCKED** - the apps surface a blocking/allow state per server response but no accuracy threshold is enforced until those decisions land (FEAT-017/018, BR-GEO-005/006).
- Browser permission prompts are shown at the point of use; denial degrades to the server IP fallback where permitted, and to the location-exception workflow for Abroad (FEAT-016, BR-GEO-003).

### 10.3 RN plan (Part B - REQUIRES APPROVAL) permission behavior

| Aspect | Location (P-01) | Camera (P-02) | Media (P-03) | Notifications (P-04) |
|---|---|---|---|---|
| Request timing | At Abroad registration step only (never at app launch) | At ID-upload step during registration | At ID-upload/profile-photo step | After login, during onboarding (FEAT-063 is P9; native push gated) |
| UX | Explain purpose first ("why" screen) before OS prompt | Explain purpose first; single-flow capture | OS picker; optional step | Permission rationale + later opt-in |
| Denied | Degrade to server IP fallback (BR-GEO-001); Abroad blocked per BR-GEO-002 unless exception approved (FEAT-016) | Block registration path with clear guidance; user can re-open settings | Profile photo optional (FR-MEM-001); ID can be added later if supported | Features degrade; no push; in-app broadcast list still available (SCR-MEM-001) |
| Revoked | Next Abroad attempt re-requests with rationale; fallback applies | Re-request with rationale at next ID upload | Re-request at next use | Re-prompt with rationale; in-app fallback |
| Graceful degradation | IP fallback; location-exception workflow (BR-GEO-003) | Require ID for approval (BR-REG-002) - no bypass | Profile photo optional; ID required but deferrable | In-app notification feed remains the non-permission path |

---

## 11. Offline & Network Behavior

### 11.1 Web-first (Part A - CONFIRMED) behavior

- **Online-only platform behavior.** Voucher redemption is online-only and atomic (BR-VCH-004, BR-VCH-006) - **no offline redemption, ever** (BI-007). Mutations require connectivity; the UI uses the **Network failure** and retry-preserving-Idempotency-Key states (UI-UX §10, API-SPECIFICATION §5.3).
- **No offline mode is approved** for any flow (registration, sale, withdrawal, adjustment). Do not invent offline functionality; it is outside the approved scope.
- Reads: the server-state cache may serve recent data when the network fails, clearly marked stale - **REQUIRES APPROVAL** if this "stale-while-offline" display is desired (no requirement mandates it).

### 11.2 RN plan (Part B - REQUIRES APPROVAL)

| Concern | Behavior | Status |
|---|---|---|
| Online/offline states | Connectivity detection (banner) - UI-UX §10 Network failure | **REQUIRES APPROVAL** |
| Network failures | Read retries safe; mutation retries reuse Idempotency-Key | CONFIRMED (API-SPEC §5.3) |
| Reconnection | Automatic refetch on reconnect (TanStack Query) | **REQUIRES APPROVAL** |
| Cached/stale data | Read-only stale display with visible "partial/offline" indicator; financial data never presented as fresh when stale | **REQUIRES APPROVAL** |
| Mutations while offline | **Not supported.** Blocked with clear messaging (BR-VCH-004 online-only applies to all financial mutations; no offline queue approved) | CONFIRMED boundary |
| Duplicate requests | Idempotency-Key prevents double-submit (BI-007 spirit, API-SPEC §5.3) | CONFIRMED |
| Partial failures | UI-UX §10 Partial data state; explicit "partial" indicator | CONFIRMED |
| User feedback | Offline banner, retry affordances, no data loss | CONFIRMED |

---

## 12. Push Notifications

> **Status (CONFIRMED):** broadcasts and push are a confirmed feature (FR-ADM-005, BR-NOT-002, FEAT-063) but the **push infrastructure provider is OPEN (ASSUMPTION 6)** and **native push in RN is REQUIRES APPROVAL**. Native push is part of the Part B RN plan; it is not required for the approved web MVP.

| Aspect | Web-first (Part A) | RN plan (Part B) |
|---|---|---|
| Architecture | In-app notifications/announcements (broadcast feed on SCR-MEM-001) + optional web push (provider OPEN) | FCM (Android) / APNs (iOS) via a notification adapter - **REQUIRES APPROVAL** |
| Permission flow | n/a (in-app feed) or browser prompt | P-04 rationale + later opt-in (§10.3) |
| Token registration | - | Device token registered with the backend (API contract addition **REQUIRES APPROVAL**; not in API-SPECIFICATION today) |
| Backend integration | `content` module dispatch via adapter (BACKEND-ARCHITECTURE §13 - jobs/dispatch; ASSUMPTION 6) | Same adapter; per-device token table **REQUIRES APPROVAL** (not in DATABASE-DESIGN) |
| Foreground behavior | In-app feed + toast (DESIGN-SYSTEM §6.6) | In-app feed; foreground presentation configurable |
| Background behavior | n/a | Push received while backgrounded (no background processing beyond the OS delivery - no silent sync approved) |
| Tap handling | Link into the relevant screen | Map notification type → navigation target (deep links §13) |
| Auth/security | Server-authoritative (BR-NOT-002) | Tokens are device identifiers only; never a credential; token revocation on logout (§9.5) |
| Platform differences | - | iOS prompt/permission semantics differ from Android (§14) |

> **No push notification schema, token endpoint, or native dependency is added here.** Adding any of these requires approval (approval boundary; DATABASE-DESIGN §24 open-decisions table, §22 security boundary).

---

## 13. Deep Linking

- **Status: NOT APPLICABLE / TBD.** No URL scheme, app scheme, or link domain is defined anywhere in the SSOTs (ARCHITECTURE, API-SPECIFICATION, UI-UX, TECH-STACK). Deep-link architecture is therefore **TBD / REQUIRES APPROVAL**.
- Until approved: no custom scheme, no universal links/app links, no link registration. Navigation is in-app only.
- If later approved, the mapping must follow the screen register (SCR-* → route) and be scoped to authenticated members only (deep links never bypass authN/authZ; every target screen still loads via the server).
- Security note for when approved: deep links must never carry secrets or session material, must validate against an allowlist, and must route unauthenticated users to login (UI-UX §10 401 behavior), never to an authenticated view.

---

## 14. Platform Differences

> **Part B - REQUIRES APPROVAL.** Only confirmed/justified differences are listed; business behavior is identical on both platforms (server-enforced).

| Concern | Android | iOS | Source/rule |
|---|---|---|---|
| Permissions | Runtime permission requests (Android 6+); location background not used | System prompt; sensitive-location rationale | §10 |
| Back navigation | Hardware/system back must pop the stack | Swipe-back gesture; no hardware back | UI-UX §4.7, §3.6 |
| Safe areas | Edge-to-edge status bar handling; navigation bar inset | Notch + home indicator insets | DESIGN-SYSTEM responsive; §5.6 |
| Status/navigation bars | Custom handling per app theme | `SafeAreaProvider` behavior | DESIGN-SYSTEM §1 |
| Keyboard | Pan behavior + window resize (adjustResize) | `KeyboardAvoidingView` (keyboard overlap) | §5.6 |
| Notifications | FCM; icon/notification-channel config | APNs; provisional auth option | §12 |
| File/device APIs | Camera/media via OS intents; scoped storage | Photo library authorization | §10 P-02/P-03 |
| Background behavior | No background processing approved | No background processing approved | §11/§12 (no silent sync) |
| Native config | `AndroidManifest.xml` permissions, `gradle` config | `Info.plist` usage descriptions | Only for the four justified permissions (§10) |

> **No native configuration file, permission entry, or dependency is authored by this document.** All entries above are flagged for approval with the implementing app.

---

## 15. Performance

> Targets come from NFR-PERF-001 (currently **TBD** - do not invent numbers; ARCH-DEC-009). Avoid premature optimization (FRONTEND-ARCHITECTURE §10, CONFIRMED).

| Area | Strategy | Status |
|---|---|---|
| Large lists | `FlatList` (virtualized) for ledger, sales, referrals, genealogy; cursor pagination (API-SPECIFICATION §4); never load-all | **REQUIRES APPROVAL** |
| Rendering | Plain React; memoize only where measured/identity-sensitive; no blanket memoization | CONFIRMED (FRONTEND-ARCHITECTURE §10) |
| Images | Optimized media delivery for property/marketing media (FEAT-060); image caching with size caps; no oversized originals | **REQUIRES APPROVAL** |
| Network | Server-state caching with per-resource `staleTime`; debounced search; batched preloads where justified | **REQUIRES APPROVAL** |
| Memory | No persistent business-data caches (§9); release on unmount; `requestId`-tagged diagnostics only | CONFIRMED |
| Startup | Lazy-load non-critical tabs/screens; defer heavy features until used | **REQUIRES APPROVAL** |
| Bundle size | Code-split by feature where the toolchain allows; type-only imports (DEVELOPMENT-GUIDELINES §12); dependency audit (DEVELOPMENT-GUIDELINES §17) | **REQUIRES APPROVAL** |
| Battery/background | No background work, no silent sync, no polling (only push-driven updates when approved - §12) | CONFIRMED boundary |

> Measurement targets are TBD; do not set arbitrary performance goals (NFR-PERF-001, FRONTEND-ARCHITECTURE §10).

---

## 16. Accessibility

> **Status:** No accessibility NFR exists in REQUIREMENTS.md. UI-UX §12 and DESIGN-SYSTEM §7 are **PROPOSED platform standards (REQUIRES APPROVAL)**. The RN plan inherits the same standards, mapped to native accessibility APIs.

| Requirement | Web (Part A, confirmed standards) | RN plan (Part B) |
|---|---|---|
| Touch targets | ≥ 44px (DESIGN-SYSTEM §3.2, UI-UX §12.8) | Same; `hitSlop` where spacing limited |
| Screen-reader support | aria-live, landmarks, table headers | `accessibilityLabel`, `accessibilityRole`, live regions for status changes |
| Labels | Visible + programmatically-associated (§9.2) | `accessibilityLabel` + visible labels; errors linked to fields |
| Focus behavior | Visible focus; logical tab order; Escape closes dialogs | `accessible` grouping; focus on dialog open; Android focus traversal |
| Dynamic text scaling | Fluid type; body never below 14px (DESIGN-SYSTEM §2.2) | `allowFontScaling`; text scales with system; no fixed heights that clip |
| Contrast | WCAG-2.1 AA (DESIGN-SYSTEM §7.1) | Same tokens → same contrast |
| Keyboard/accessibility interaction | Keyboard-only operation (UI-UX §12.2) | Hardware-keyboard/switch-access operability; actions reachable without touch |
| Responsive layouts | Breakpoints per DESIGN-SYSTEM §5 (PROPOSED values) | Mobile-first; safe-area-aware; no horizontal scroll for financial data (UI-UX §11.4) |
| Reduced motion | `prefers-reduced-motion` (UI-UX §12.9) | `accessibilityReduceMotion` |

---

## 17. Security-by-Design

Security-by-design is mandatory; critical decisions are not invented (API-SPECIFICATION §8, FRONTEND-ARCHITECTURE §8, BACKEND-ARCHITECTURE §17, NFR-SEC-001/002).

| Concern | Control | Status |
|---|---|---|
| Secure token storage | OS secure store (Keychain/Keystore) only for the RN session mechanism (§9) | **REQUIRES APPROVAL** |
| Sensitive-data exposure | No PII/financial data in logs or error text; redaction (API-SPECIFICATION §8); no persistent business-data caches | CONFIRMED |
| Logs | Minimal non-sensitive diagnostics; `requestId` correlation only | CONFIRMED |
| Screenshots | Not controllable on Android/iOS; therefore **no sensitive data may be displayed when it can be avoided**; flag-screening (FLAG_SECURE) is **REQUIRES APPROVAL** (not mandated by requirements) | **REQUIRES APPROVAL** |
| Deep links | Not implemented until approved; when approved, allowlist + no secrets in links (§13) | TBD / REQUIRES APPROVAL |
| Device permissions | Only the four justified permissions; least-privilege requests at point of use (§10) | CONFIRMED (scope) / REQUIRES APPROVAL (RN impl) |
| Local persistence | Secure store for session only; no business data persistence; logout cleanup (§9) | **REQUIRES APPROVAL** (mechanism) |
| API authorization | Server-enforced RBAC + object-level ownership; client is never the security boundary (§8) | CONFIRMED |
| Network security | TLS to the API; pinning **REQUIRES APPROVAL** (not mandated); no cleartext HTTP | CONFIRMED (TLS) / REQUIRES APPROVAL (pinning) |
| Reverse engineering | No secrets in the bundle (BI-008); no client-side enforcement of business rules; secrets live server-side (§9.4) | CONFIRMED |
| Certificate/audit | Staff actions audited server-side (NFR-SEC-002, NFR-AUD-001) - mobile does not duplicate audit | CONFIRMED |

---

## 18. Testing Strategy

> **Part B - REQUIRES APPROVAL (tooling).** Testing approach mirrors the web strategy (TECH-STACK §10, DEVELOPMENT-GUIDELINES) mapped to native tooling.

| Test type | Scope | Notes |
|---|---|---|
| Unit tests | Business-free helpers: formatting, hooks, schemas | Same approach as web; RN-safe subset of `packages/shared` |
| Component tests | Primitives + feature components rendering UI states (UI-UX §10) | Renderer of choice **REQUIRES APPROVAL** |
| Integration tests | Feature flows against mocked API | Query-client + navigation integration |
| Navigation tests | Route guards, back behavior, tab/drawer transitions | **REQUIRES APPROVAL** tooling |
| API tests | Typed client, error-envelope mapping, Idempotency-Key reuse, retries/timeouts | Mirrors API-SPECIFICATION §3/§5.3 |
| Authentication tests | Session restore, 401 handling, logout cleanup (§8/§9) | - |
| Permission tests | All four permissions: request timing, denied/revoked/degradation (§10.3) | OS-level validation required |
| Offline/network tests | Network-failure states, retry preserving Idempotency-Key, no offline mutations (§11) | - |
| Error/failure tests | UI-UX §10 states incl. partial data, 429 (rate-limit messaging - API-SPEC §5.2), 404-hides-others | - |
| Security tests | No-secrets-in-bundle check, secure-storage behavior, logout cleanup, no PII in logs (§9/§17) | Static scan + manual |
| Android/iOS validation | Both platforms for the confirmed differences (§14): back nav, safe areas, keyboard, permissions, notifications | CI device-farm **REQUIRES APPROVAL** |
| E2E tests | Critical journeys (registration→qualification, sale submit, withdrawal request, voucher redemption) against staging | **REQUIRES APPROVAL** (e.g., Detox/Maestro) |

---

## 19. Architecture Decisions & Open Questions

### 19.1 Confirmed decisions (not mobile-specific - inherited)

- TypeScript full-stack; session auth via HttpOnly cookies (web) - ARCH-DEC-007; REST `/api/v1` single source of truth; money exact-decimal strings (BR-WAL-002); client is never the security boundary (NFR-AUTHZ-001/002); responsive web is the mobile experience for MVP (ARCH-DEC-005); no payment/money-movement UI (BR-BND-001..003); no offline mode (BR-VCH-004); no MLM UI (BI-004).

### 19.2 Constraints

- RN/native mobile is **NOT approved** (ARCH-DEC-006, REQUIRES APPROVAL, post-MVP).
- FOLDER-STRUCTURE.md defines no mobile app; adding `apps/mobile` is a FOLDER-STRUCTURE change (approval boundary).
- No new screens beyond `SCR-AUTH-*`/`SCR-MEM-*`; no new permissions beyond the four justified (§10); no new API endpoints (deep links, push tokens, device registration are all contract changes → REQUIRES APPROVAL).
- Browser-cookie session transport does not exist in RN - auth transport for RN is an open decision (§8).

### 19.3 Assumptions

| # | Assumption | Basis |
|---|---|---|
| A-01 | Native mobile is revisited only post-MVP and only if the member app justifies it (GPS fidelity is the named reason) | ARCHITECTURE §3.5/§4.1, ARCH-DEC-005 |
| A-02 | The RN app would replace `apps/web` for members (not add a second member surface) - until approval, both remain `apps/web` only | No SSOT defines a second surface; **flag for approval** |
| A-03 | Push provider OPEN (ASSUMPTION 6) and geolocation provider OPEN (ASSUMPTION 3) apply to any RN integration | ROADMAP §5.6 |
| A-04 | Tablet/iPad RN layouts are not a confirmed requirement | UI-UX breakpoints PROPOSED only |

### 19.4 `REQUIRES APPROVAL` items (mobile decisions NOT decided here)

| # | Decision | Why it matters |
|---|---|---|
| MA-01 | Approve React Native at all (ARCH-DEC-006) | Whole Part B premise |
| MA-02 | `apps/mobile` placement in FOLDER-STRUCTURE | Structure change |
| MA-03 | RN navigation library (React Navigation vs alternative) | Architecture |
| MA-04 | RN auth transport (cookie jar vs secure-store token vs WebView) | AuthN architecture (ARCH-DEC-007 interplay) |
| MA-05 | RN secure-storage library + persistence scope | Security |
| MA-06 | Native dependencies (permissions, geolocation, image picker, push, deep links) | Security/supply-chain (DEVELOPMENT-GUIDELINES §17) |
| MA-07 | Push notification architecture + device-token schema/endpoint | API + DB contract changes |
| MA-08 | Deep-link scheme/domains + mapping | API/external surface |
| MA-09 | Offline/stale-while-offline display | Scope (currently online-only) |
| MA-10 | Performance/caching/startup specifics | NFR-PERF-001 TBD |
| MA-11 | Testing/E2E tooling and device farm | Cost/infra |
| MA-12 | Accessibility implementation depth | UI-UX §12 PROPOSED only |
| MA-13 | Screenshot protection (FLAG_SECURE) | Not mandated |
| MA-14 | Geodata accuracy/spoofing enforcement in RN (OD-014/015) | BLOCKED decisions |

### 19.5 `TBD` items

- NFR-PERF-001 / NFR-SCAL-001 targets (ARCH-DEC-009) - performance measurement.
- Deep-link structure (§13).
- Push provider (ASSUMPTION 6).
- Session/verification-token TTLs (DATABASE-DESIGN DA-04).
- Idempotency-Key TTL (24h PROPOSED; DATABASE-DESIGN DA-05).

### 19.6 Risks / dependencies

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R-01 | Proceeding on RN without ARCH-DEC-006 approval | Contradicts confirmed SSOTs | This document is conditional; MA-01 gate |
| R-02 | RN session-transport drift from ARCH-DEC-007 | Security regression | MA-04 decision before implementation |
| R-03 | Unapproved native dependencies | Supply-chain/security risk | MA-06 gate; DEVELOPMENT-GUIDELINES §17 |
| R-04 | Geolocation gated on OD-014/015 | Abroad GPS cannot be finalized | Keep IP fallback + exception workflow (BR-GEO-001/003) |
| R-05 | No performance targets | Premature or insufficient optimization | Do not invent targets (NFR-PERF-001) |

---

## 20. Traceability

| Mobile concern | Requirements | Business rules | Features | API / architecture | Related docs |
|---|---|---|---|---|---|
| Auth & session | FR-AUTH-001..004, NFR-AUTH-001/002 | BR-AUTH-001..003 | FEAT-002 | API-SPEC §2.1, §6.1; ARCH-DEC-007 | BACKEND §8 |
| Authorization (client is UX only) | NFR-AUTHZ-001/002, NFR-SEC-001 | BUSINESS-RULES §3 | FEAT-003 | API-SPEC §2.2, §8 | FRONTEND §8 |
| Registration/qualification screens | FR-REG-001..012, FR-MEM-001, FR-AUTH-001 | BR-REG-001..011, BR-QUAL-001/002 | FEAT-007..013 | API-SPEC §6.2; DATABASE E-01/02/03/05 | UI-UX SCR-AUTH-002..005 |
| Referral/genealogy (reporting only) | FR-REF-001..007, FR-RPT-001..004 | BR-REF-001..007, BI-003/004/009 | FEAT-019..023, FEAT-064..067 | API-SPEC §6.4, §6.13 | UI-UX SCR-MEM-016..018 |
| Sales | FR-SAL-001..007 | BR-SAL-001..007, BI-006 | FEAT-027..032 | API-SPEC §6.6, §7.1; Idempotency §5.3 | UI-UX SCR-MEM-005..007 |
| eWallet/ledger (display-only) | FR-WAL-001..004, FR-ADJ-001/002 | BR-WAL-001..003, BR-LED-001/002, BI-001/002/005 | FEAT-042/043/071 | API-SPEC §6.8; DATABASE E-17/18 | UI-UX SCR-MEM-008/009 |
| Payout/withdrawals | FR-PAY-001..006, FR-WDR-001..006 | BR-PAY-001..006, BR-WDR-001..006, BI-001 | FEAT-044..051, FEAT-070 | API-SPEC §6.9/§6.10, §7.2 | UI-UX SCR-MEM-010..014 |
| Vouchers | FR-VCH-001..007, FR-SEC-001..004 | BR-VCH-001..007, BR-SEC-001..004, BI-007/008 | FEAT-052..059 | API-SPEC §6.11, §7.3 | UI-UX SCR-MEM-020/021 |
| Geolocation (Abroad) | FR-GEO-001..008 | BR-GEO-001..006 | FEAT-014..018 | API-SPEC §6.3; OD-014/015 | UI-UX SCR-MEM-025 |
| Content/broadcasts/push | FR-ADM-002..005, FR-MEM-001 | BR-MKT-001/002, BR-NOT-001/002 | FEAT-060..063 | API-SPEC §6.12 | UI-UX SCR-MEM-022..024, SCR-ADM-014..016 |
| Config-driven UI (gender, rates) | FR-ADM-001, NFR-MAINT-001 | BR-CFG-001, BR-REG-011 | FEAT-005 | API-SPEC §6.15 (#81 config/public) | FRONTEND §7 |
| UI states / components / money | - | BI-002, BR-WAL-002 | - | API-SPEC §3 | UI-UX §8-§12, DESIGN-SYSTEM §6/§9 |
| Permissions (4) | FR-GEO-001, FR-REG-002, FR-MEM-001, FR-ADM-005 | BR-GEO-001, BR-REG-002 | FEAT-010/014/060/063 | - | §10 of this doc |
| Security-by-design | NFR-SEC-001/002, NFR-CONF-001, NFR-DATA-001, NFR-CRYPTO-001 | BR-SEC-001..004, BI-008 | FEAT-004, FEAT-059 | API-SPEC §8 | §9/§17 of this doc |
| Mobile decision gates | - | - | - | ARCH-DEC-006 | §19 (MA-01..14) |

---

## Governance & Traceability

- This document references only existing SSOT IDs (`FR-*`, `NFR-*`, `BR-*`, `BI-*`, `FEAT-*`, `FG-*`, `ARCH-DEC-*`, `SCR-*`, `UX-DEC-*`, `OD-*`, `DA-*`). It introduces **no** new product, role, workflow, screen, permission (beyond the four justified), API endpoint, or business rule.
- **New to this document:** the mobile target architecture (Part B, all native items marked PROPOSED/REQUIRES APPROVAL only), the RN decision gates (MA-01..14), and the explicit web-first mobile behavior mapping (Part A).
- **Approval boundaries (must stop and request approval, never enact silently):** any native decision (navigation, dependencies, permissions, auth transport, offline sync, push, deep links, native config), any API/DB contract change, and any FOLDER-STRUCTURE change to add a mobile app.
- If an authoritative SSOT changes (e.g., ARCH-DEC-006 approval, ARCH-DEC-008 deployment, ARCH-DEC-009 NFR targets, OD-014/015), re-derive the affected sections here before proceeding.
- Cross-document check: this doc is consistent with `FRONTEND-ARCHITECTURE.md` (structure/state/API/authorization pattern), `BACKEND-ARCHITECTURE.md` (session/authN), `API-SPECIFICATION.md` (contract, idempotency, errors, security), `DATABASE-DESIGN.md` (entities, session store, security), `UI-UX.md`/`DESIGN-SYSTEM.md` (screens, states, components, accessibility), `TECH-STACK.md` (mobile status), and `ARCHITECTURE.md` (ARCH-DEC-005/006, trust boundaries).

---

*End of Mobile Architecture - sections 1-20 complete.*