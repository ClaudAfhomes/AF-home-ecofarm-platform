# JAD - Development Guidelines SSOT (DEVELOPMENT-GUIDELINES.md)

> **Authority:** This document defines the **implementation standards and engineering conventions** for the JA&D (JAD) platform: coding standards, TypeScript and React conventions, state management, API consumption, forms, validation, error handling, naming, imports, quality rules, Git, dependencies, and environment configuration.
>
> **Precedence:** BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → API-SPECIFICATION.md → TECH-STACK.md → UI-UX.md → DESIGN-SYSTEM.md → FOLDER-STRUCTURE.md → FRONTEND-ARCHITECTURE.md → **this document**.
>
> **Companion documents:** The frontend structural/behavioral context is defined in `FRONTEND-ARCHITECTURE.md`. Screen behavior is defined in `../ui-ux/UI-UX.md`; visual/component tokens in `../ui-ux/DESIGN-SYSTEM.md`.
>
> **Status vocabulary:** **CONFIRMED** = derived from approved SSOT decisions. **PROPOSED** = recommended standard not yet formally approved. **REQUIRES APPROVAL** = decision that materially affects architecture, security, or cost. **ASSUMPTION** = working assumption. **TBD** = unresolved; must not be invented. **RECOMMENDED** = a convention with **no repository precedent** (see below).
>
> **Version:** Project 05 - Frontend Engineering (Baseline v1.0)
>
> **Current verified state (IMPORTANT):** The repository contains **documentation only**. There is **no source code**, no `package.json`, no TypeScript/build/lint/test configuration, no React components or hooks, and **no Git repository**. Consequently:
>
> 1. **No code convention in this document is repository-derived.** Every standard below is either (a) **derived from an approved/proposed SSOT decision** (marked CONFIRMED/PROPOSED) or (b) a **RECOMMENDED convention with no repository precedent** that requires approval before enforcement.
> 2. The intended structure, stack, and layouts are defined in `FOLDER-STRUCTURE.md`, `TECH-STACK.md`, `ARCHITECTURE.md`, and `FRONTEND-ARCHITECTURE.md`. This document does **not** invent a competing structure.
> 3. Where a recommended standard conflicts with an approved SSOT decision, the SSOT prevails and the conflict must be reported - never silently resolved.

---

## 1. Coding Standards

Derived from `TECH-STACK.md` (stack) and `FOLDER-STRUCTURE.md` (structure).

- **Language: TypeScript only** for all frontend code (CONFIRMED - ARCH-DEC-005, TECH-STACK §2). No plain JavaScript in app code.
- **Framework: React (functional components) + Vite** (CONFIRMED - ARCH-DEC-005). No class components for new code.
- **Monorepo: pnpm workspaces + Turborepo** (PROPOSED - TECH-STACK §11). All apps/packages defined in `FOLDER-STRUCTURE.md`.
- **Style:** follow `DESIGN-SYSTEM.md` tokens and `UI-UX.md` patterns; never one-off styling when a pattern exists (DESIGN-SYSTEM §8).
- **Formatting/linting:** ESLint + Prettier are **PROPOSED / REQUIRES APPROVAL** (not yet in TECH-STACK). Until approved, keep code readable by manual discipline and rely on `typecheck` (CI: build + lint + test + typecheck per PR - PROPOSED, TECH-STACK §11).
- **No business logic in UI:** React components contain **no backend business logic** (FOLDER-STRUCTURE §9.1). Business rules live in the API (`apps/api`) and shared contracts.
- **No secrets in client code:** environment handling per §18; never place credentials in frontend bundles (NFR-SEC-001, NFR-CONF-001).

---

## 2. TypeScript Rules

Recommended target (no repository config exists - typecheck configuration is **REQUIRES APPROVAL**).

- **Strict mode:** `"strict": true` in `tsconfig.base.json`; no `strict` relaxations unless individually justified and approved.
- **No implicit `any`:** avoid `any` entirely in app code. Use `unknown` for unvalidated external data and narrow it with the shared Zod schemas (`packages/contracts`). Document the rare justified `any` with a reason; treat it as a review flag.
- **Interfaces vs types:** use `interface` for object contracts that may be extended/implemented (props, DTOs from `packages/contracts`); use `type` aliases for unions, intersections, tuples, and mapped types.
- **Explicit typing where useful:** type exported functions' parameters and return types explicitly (self-documenting API for other modules); allow inference for local variables.
- **Type inference:** prefer inference for internal expressions; avoid redundant annotations on inferred locals.
- **Null/undefined handling:** enable `strictNullChecks`; model absence explicitly (`?:` vs `| null` vs `| undefined`). Handle both branches; no unchecked optional chaining on required domain data.
- **Shared types:** request/response shapes, status enums, and error codes are defined **once** in `packages/contracts` (FOLDER-STRUCTURE §4) and re-exported - never re-declared in apps (FOLDER-STRUCTURE §9.6). Status enums must mirror BUSINESS-RULES §5 exactly.
- **Type-only imports:** use `import type { ... }` for types to keep client bundles clean (see §12).

---

## 3. React Conventions

Derived from TECH-STACK §2 and UI-UX §2.

- **Functional components only.** Components are functions returning JSX; no class components.
- **Composition over inheritance:** build screens by composing layouts, shared primitives, and feature components (FRONTEND-ARCHITECTURE §6-7).
- **Props:** typed via `interface`; default to `React.ComponentProps`/HTML extension for styled primitives where sensible; avoid prop-drilling beyond 2-3 levels (lift to context only for cross-cutting needs - §6).
- **Controlled vs uncontrolled:** prefer **controlled** inputs for form state managed by React Hook Form (PROPOSED) or component state; use uncontrolled only for trivial non-validated inputs.
- **Rendering patterns:** keep render logic pure; derive derived values with `useMemo`/`useCallback` only when they affect render cost or identity (memoize judiciously - FRONTEND-ARCHITECTURE §10). No render-phase side effects.
- **Side effects:** `useEffect` for external synchronization (fetch orchestration is delegated to the server-state layer, §6/§7). Effects must have complete dependency arrays; no effects to compute derived state that can be computed during render.
- **Conditional rendering:** explicit `if`/ternary; use the UI states from UI-UX §10 (initial/loading/empty/error/...) rather than ad-hoc conditional markup.
- **Keys:** stable, unique keys for lists (ids, not array indexes) to avoid reconciliation bugs.
- **Accessibility:** components must meet the accessibility standards in UI-UX §12 and DESIGN-SYSTEM §7 (semantic HTML, labels, focus, keyboard, touch targets, reduced motion). Accessibility is a correctness requirement, not a style choice (DESIGN-SYSTEM §8.9).

---

## 4. Component Conventions

Derived from FOLDER-STRUCTURE §3 and UI-UX §2.

- **Component responsibilities:** one component = one responsibility (present a slice of UI; handle its own interaction). Components receive data/props and emit callbacks; they do **not** fetch or mutate business state directly unless they are the owning container (§6/§7 patterns).
- **Component boundaries:** shared UI primitives live in `apps/*/src/components/`; feature-specific components live in `apps/*/src/features/<feature>/components/` (FRONTEND-ARCHITECTURE §6). No cross-feature imports of another feature's internals.
- **Container/presentation separation:** where useful, split a data-owning container (server-state queries, callbacks) from a presentational component (props + JSX). Apply pragmatically - a tiny component does not need a split.
- **Reusable components:** promote a component to `components/` only after 2+ real feature usages (see §13). Avoid premature generalization.
- **Feature-specific components:** stay within their feature folder; do not leak feature concepts into shared primitives.
- **Shared components:** generic, unstyled-by-token primitives (buttons, inputs, cards, tables, dialogs, notifications, icons) matching DESIGN-SYSTEM §6.
- **Avoid oversized components:** split components that exceed a screen of concern; favor extracting presentational subcomponents and hooks over long JSX (see §5). A file that mixes many unrelated concerns should be decomposed.

---

## 5. Hooks

Recommended target.

- **Custom hook conventions:** name with `use` prefix (`useSales`, `useWithdrawalList`); one hook = one cohesive behavior; return a stable, typed result.
- **Hook responsibilities:** encapsulate reusable logic - server-state queries (via the query layer, §7), form binding (React Hook Form - PROPOSED), auth context access, debounced search, money formatting.
- **Dependency handling:** exhaustive deps; never suppress lints without a documented reason; derive stable callbacks/values with `useCallback`/`useMemo` only where identity matters.
- **Side effects:** effects belong in the owning hook/container; keep them minimal and cancellable (ignore stale async results; use query cancellation where available).
- **Reusability:** extract a custom hook when the same logic appears in 2+ features (§13). Do **not** create a custom hook for a single one-off effect.
- **Avoid unnecessary custom hooks:** prefer built-in hooks, derived render-time values, and the server-state layer. A wrapper around one `useQuery` call is only worth it if it centralizes shared config or normalization.

---

## 6. State Management

Clearly distinguish the five state kinds. Derived from TECH-STACK §2 (TanStack Query, Zustand - PROPOSED) and FRONTEND-ARCHITECTURE §4.

| State kind | Tools (PROPOSED unless noted) | Use for | Do NOT use for |
|---|---|---|---|
| **Local UI state** | `useState` / `useReducer` | Component-local concerns (open/close, toggle, expand, current tab, pagination page) | Shared or server data |
| **Form state** | React Hook Form | Form values, validation, submission | Global app state |
| **Server state** | TanStack Query | All API data: queries, caching, retries, mutations, invalidation | Local-only UI flags |
| **Global application state** | Zustand (minimal) | True cross-cutting client state: current member context, theme, notifications preferences | Anything server-backed or component-local |
| **URL state** | React Router | Route parameters, query params (filters, page), selected record ids | Bulk data |

- **Do not introduce global state unnecessarily** (task mandate; UI-UX §2.1 "progressive disclosure"). Default to local state; lift to server state; use global client state only for cross-cutting concerns that are not server-owned.
- **Server state is the source of truth for all business data.** The backend API (API-SPECIFICATION.md) is authoritative; the client caches and renders, it does not duplicate business logic (UI-UX §2; FRONTEND-ARCHITECTURE §5).
- **No client-side financial computation** that can change truth: money must be displayed from exact-decimal strings supplied by the API (BR-WAL-002, DESIGN-SYSTEM §9); never compute balances/commissions client-side (BI-001..BI-007 live server-side).

---

## 7. API Consumption

Follow `API-SPECIFICATION.md`. Derived from TECH-STACK §2/§9 (typed client, PROPOSED).

- **Typed client:** a fetch-based client generated from OpenAPI (`openapi-typescript` - PROPOSED) consumed through `packages/contracts` types. All requests go through this single client (`apps/*/src/lib/api`, FRONTEND-ARCHITECTURE §5).
- **Base path:** `/api/v1` (API-SPECIFICATION §1.1). No hard-coded full URLs.
- **Request lifecycle:** model every request through the UI states (UI-UX §10): loading, success, error, empty. Never render data before a defined state.
- **Loading:** skeleton/structured placeholder (UI-UX §10); disable submit buttons during mutations (Idempotency-Key semantics, §8).
- **Success:** map success to the confirmed state vocabulary (e.g., "Withdrawal requested - reserved") per UI-UX §8.12.
- **Error:** normalize to the API error envelope and codes (API-SPECIFICATION §3) and map to user-facing messages (§10). Preserve entered data and offer retry.
- **Empty:** friendly empty states with the primary next action (UI-UX §10). Financial empty states show `₱0.00` accurately (never imply missing data).
- **Retries & caching:** handled by the server-state layer (TanStack Query - PROPOSED): default retry for idempotent reads; no automatic retry of non-idempotent mutations. Respect the `Idempotency-Key` contract (API-SPECIFICATION §5.3) for POST /sales, /me/withdrawals, /vouchers/:id/redemptions, /financial-adjustments.
- **Stale data:** mark stale/refetching states explicitly (background refresh indicator) when visible staleness could mislead financial views; avoid showing stale money figures without a freshness signal.
- **Authorization:** web apps rely on the HttpOnly session cookie (ARCH-DEC-007) - no client token storage. Handle 401 (session expired → route to login, preserve destination) and 403 (role/eligibility/ownership) per §10. 404 must not leak existence of others' resources (API-SPECIFICATION §1.2, §8).
- **Response handling:** collections are `{ data, meta }` with pagination (page-based for admin lists, cursor for ledger/financial streams - API-SPECIFICATION §4); single resources returned directly. Never unbounded list rendering.
- **Avoid duplicating backend business logic:** frontend never re-implements qualifying-sale rules, commission math, balance rules, or eligibility. It renders server results and communicates server rejections verbatim.

---

## 8. Form Handling

Derived from UI-UX §9 and DESIGN-SYSTEM §6.2. Tools: React Hook Form + Zod (PROPOSED - TECH-STACK §2).

- **Form state:** controlled by React Hook Form; validation schemas come from `packages/contracts` (single source, shared with backend - API-SPECIFICATION §1.3).
- **Validation:** client-side for UX (format, bounds, required) - **never the security boundary** (§9). Server remains authoritative.
- **Submission state:** single-submit; the submit control disables while in flight and shows progress (UI-UX §9.6). No concurrent submissions.
- **Disabled states:** fields/actions disabled only when ineligible, always with an explanation and, where applicable, a link to the remedy (UI-UX §9.8).
- **Duplicate submissions:** prevent double submit at the UI (disabled button) **and** rely on `Idempotency-Key` for sale, withdrawal, redemption, and adjustment submissions (API-SPECIFICATION §5.3). A retry after network failure reuses the same key - never re-applies side effects.
- **Server errors:** map server field errors back to the matching field (inline, UI-UX §9.5); non-field errors surface as a form-level alert mapped from the API error envelope.
- **Field-level errors:** inline at the offending field + form-level summary; focus moves to the first invalid field; errors announced (`aria-describedby`).
- **Recovery after failed submission:** keep entered data; allow correction and resubmit; for idempotent flows, resubmit reuses the original key where the submission is genuinely the same operation.

---

## 9. Validation

- **Client-side validation** improves UX: format, range, required/optional, and cross-field checks run before submit (UI-UX §9.4). It uses the same Zod schemas as the backend (single source in `packages/contracts`).
- **Server-side validation is authoritative:** the backend re-validates everything (API-SPECIFICATION §1.3) and enforces business rules and eligibility (BR-*, 403/422 codes). The client must render server rejections verbatim and never treat client checks as complete.
- **Money/rates:** client-side parsing of money is exact-decimal only - never float math (BR-WAL-002, TECH-STACK §8). Floats are rejected by schemas.
- **Config-driven values:** options such as Gender (BR-REG-011) come from the config service via the API (`GET /config/public` - API-SPECIFICATION #81), never hard-coded (BR-CFG-001; DESIGN-SYSTEM §8.8).

---

## 10. Error Handling

Derived from API-SPECIFICATION §3 and UI-UX §10.

- **Expected errors:** map every API error code to a readable, actionable message. Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `MEMBER_NOT_QUALIFIED`, `SALE_LOCKED`, `REJECTION_REASON_REQUIRED`, `INSUFFICIENT_BALANCE`, `RESERVATION_CONFLICT`, `VOUCHER_*`, `PAYOUT_ACCOUNT_UNVERIFIED`, `INTERNAL`.
- **API errors:** surface the envelope's `message` with context; never expose raw stack traces or internal details (API-SPECIFICATION §8 - 500s are generic).
- **Network failures:** offline/banner state; preserve in-progress forms and Idempotency-Key; retry safe (UI-UX §10).
- **Validation errors:** inline field errors (§8/§9).
- **Authentication failures (401):** route to login preserving the intended destination; no data shown.
- **Authorization failures (403):** clear "not permitted / not eligible" message; never reveal others' records (404 hides existence - API-SPECIFICATION §1.2, §8).
- **Unexpected errors:** catch at boundaries; show a generic, recoverable message; log without PII (NFR-CONF-001; API-SPECIFICATION §8). Do not show raw internals.
- **User-facing messages:** plain language, specific, with the next action. Money/status context always visible (UI-UX §8.12).
- **Logging:** minimal client logging of non-PII diagnostics (`requestId` from the error envelope); full audit happens server-side (NFR-AUD-001, NFR-SEC-002). Never log personal or financial data (NFR-DATA-001, NFR-CONF-001).

---

## 11. Naming Conventions

Repository-derived where they exist (`FOLDER-STRUCTURE.md §6`); the rest are RECOMMENDED.

| Item | Convention | Source |
|---|---|---|
| Files (non-component) | kebab-case | FOLDER-STRUCTURE §6 |
| React component files | PascalCase `.tsx` (e.g., `SaleCard.tsx`) | RECOMMENDED (matches FOLDER-STRUCTURE class rule) |
| Hooks | `use<Domain>` (`useSales.ts`) | RECOMMENDED |
| Directories | kebab-case, singular feature name (`sales/`, `ewallet/`) | FOLDER-STRUCTURE §6 |
| Variables / functions | camelCase | RECOMMENDED |
| Components (identifiers) | PascalCase | RECOMMENDED |
| Types / interfaces | PascalCase (`SaleDTO`, `WithdrawalStatus`) | RECOMMENDED |
| Constants | `UPPER_SNAKE_CASE` for env/static constants | FOLDER-STRUCTURE §6 (env) |
| API functions/services | camelCase verbs (`submitSale`, `getLedger`) | RECOMMENDED |
| Test files | `<target>.spec.tsx` / `<target>.spec.ts` | FOLDER-STRUCTURE §6 |
| REST endpoints | kebab-case plural | FOLDER-STRUCTURE §6 (unchanged) |
| Status enums | mirror BUSINESS-RULES §5 exactly | FOLDER-STRUCTURE §9.8 |

---

## 12. Import Organization

Recommended target (lint config is PROPOSED / REQUIRES APPROVAL).

- **Grouping order:** (1) external packages, (2) internal aliases (`@/` for app src, `@contracts/`, `@shared/`), (3) relative imports. Blank line between groups.
- **Absolute vs relative:** prefer absolute aliases for cross-feature and shared imports; use relative imports within a feature for its own internals.
- **Internal aliases:** `@/*` mapped via `tsconfig` paths + Vite aliases (PROPOSED - REQUIRES APPROVAL); `packages/contracts` and `packages/shared` imported via workspace package names.
- **External dependencies:** listed in the workspace root / app `package.json` (pnpm); no transitive/phantom imports.
- **Type-only imports:** use `import type { ... }` for all type-only imports to keep bundles clean.

---

## 13. Reusability Rules

- **Extract when real, repeated usage exists** - the same component/hook/util needed by 2+ features (§4/§5). One usage stays local.
- **Avoid premature generalization:** do not parameterize for hypothetical futures; keep the first implementation concrete.
- **Shared code is owned:** shared components/hooks/utils must have defined owners and tests; generic contracts (DTOs, schemas, enums) live only in `packages/contracts` (FOLDER-STRUCTURE §4).
- **Feature-specific stays private:** do not promote feature logic into shared packages just to reuse once.

---

## 14. DRY / KISS / SOLID - pragmatic application

- **DRY:** eliminate *meaningful* duplication. Business-rule logic is single-sourced **server-side** (never duplicated in the frontend); shared schemas/DTOs live once in `packages/contracts`. Do not abstract two similar-but-different screens into one prematurely (that is accidental duplication avoidance).
- **KISS:** prefer the simplest implementation that satisfies the requirement and its UI states (UI-UX §10). Default to plain React + query layer before adding abstractions.
- **SOLID:** apply pragmatically - single responsibility per component/hook (§4/§5), open/closed via props/composition, interfaces via `packages/contracts`, dependency inversion via the API/service layer (the client depends on contracts, not on backend internals). Do not apply patterns mechanically.
- **Priority:** maintainability > cleverness; simplicity > over-engineering; clear ownership (feature folders) > shared god-modules; low coupling (feature boundaries) > premature sharing.

---

## 15. Code Quality Rules

- **Readability:** descriptive names; clear control flow; presentational components read top-to-bottom.
- **Maintainability:** feature-scoped code (FRONTEND-ARCHITECTURE §2); no cross-feature coupling.
- **Type safety:** strict TS (§2); no `any` leaks; contracts are typed.
- **Dead code:** remove unused code, imports, and files; no commented-out blocks.
- **Duplication:** no duplicated DTOs/schemas/enums (FOLDER-STRUCTURE §9.6); no duplicated business logic (server-owned).
- **Complexity:** keep components/hooks small; split when readability suffers (§4/§5).
- **Comments:** comment **why** and **what cannot be expressed in code**; avoid obvious code comments. Prefer self-documenting code (matching the "no unnecessary comments" project style seen in prior tasks).
- **Documentation:** code that ships a feature updates the corresponding SSOT statuses per ROADMAP §9 (documentation updated per phase exit criteria).
- **Testing:** Vitest for unit (domain/use-case), Supertest for API/e2e, Playwright for UI e2e (PROPOSED - TECH-STACK §10); invariant tests BI-001..BI-010 run in CI; concurrency tests for redemption/withdrawal races.
- **Accessibility:** UI meets UI-UX §12 / DESIGN-SYSTEM §7 (a11y defects are bugs).
- **Security:** no secrets in bundles (§18); no business logic in client that could be bypassed; server authorization never assumed from client checks (FRONTEND-ARCHITECTURE §8).

---

## 16. Git Conventions

> **Important:** The repository is **not currently a Git repository** and **no Git policy is documented** in any SSOT. All conventions below are **RECOMMENDED** for when version control is initialized - none are repository-derived. Do not treat them as approved organizational policy.

- **Branches:** short-lived feature branches (e.g., `feat/sale-submission`, `fix/withdrawal-request`) merged to a shared trunk. Trunk must always build + typecheck + pass tests.
- **Commits:** small, focused commits with a concise message describing the change; one logical change per commit; no unrelated changes mixed in.
- **Pull requests:** one PR per logical change; description links the relevant FEAT/FR/BR IDs and references docs; review focuses on correctness, types, security, accessibility, and SSOT consistency.
- **Small focused changes:** keep diffs reviewable; split large features along the feature boundaries in FRONTEND-ARCHITECTURE §2.
- **Review expectations:** every change reviewed; blockers: `any`, missing types, unhandled error states, secret exposure, UI-state violations, business-logic duplication.
- **Avoiding unrelated changes:** no reformatting/refactoring mixed into feature PRs.

---

## 17. Dependency Rules

- **Adding dependencies:** only when justified by a requirement; prefer solutions already in TECH-STACK §2/§11 (React, Vite, React Router, TanStack Query, Zustand, React Hook Form, Zod, CSS Modules/Tailwind, Vitest, Playwright, pnpm/Turborepo - all PROPOSED unless noted).
- **Evaluating necessity:** one capability per library; prefer the documented stack over a new library (TECH-STACK §15 approved alternatives; §16 prohibitions).
- **Avoid duplicate libraries:** no two libraries for the same concern (one form library, one server-state library, one styling approach).
- **Security considerations:** prefer maintained libraries; review supply-chain posture; no library that embeds payment processing, moves money, or is on the prohibited list (TECH-STACK §16).
- **Version management:** versions pinned via pnpm `lockfile`; upgrades are PR-sized and verified; no floating/phantom versions. All versions remain REQUIRES VERIFICATION until a manifest exists (TECH-STACK §14).
- **Removing unused dependencies:** remove immediately when a dependency becomes unused.
- **Major/new dependencies REQUIRE APPROVAL** (approval boundary): introducing a new major library or framework is a material decision and must be approved before use.

---

## 18. Environment Configuration

Derived from TECH-STACK §12 and FOLDER-STRUCTURE §7.

- **Environment variables:** defined in `.env.example` at each app root + workspace root (FOLDER-STRUCTURE §7); typed schema in `packages/config` (Zod). Env vars are `UPPER_SNAKE_CASE`.
- **Public vs private configuration:**
  - **Private (backend-only):** database, secrets, provider credentials - resolved server-side from the secret manager / env (TECH-STACK §12). Never in the frontend.
  - **Public (frontend-exposed):** values that are safe to ship in a client bundle (API base URL, app origin) via Vite's `VITE_`-prefixed vars. Anything in a client bundle is public by definition.
- **Business parameters are NOT env:** configurable parameters (rates, clearing period, limits, gender values) are served by the config module via the API (`GET /config/public` - API-SPECIFICATION #81) per BR-CFG-001 and FOLDER-STRUCTURE §7. Never bake them into `.env` or the bundle; they must remain changeable without redeploy (NFR-MAINT-001).
- **Secrets:** never place secrets or privileged credentials in frontend code or env that ships to the client. `*.env` files are never committed (FOLDER-STRUCTURE §9.4). Secrets live server-side only (API-SPECIFICATION §8).
- **Dev/staging/production:** environment-specific values through typed env + the config service; CI does build + lint + test + typecheck per PR (PROPOSED - TECH-STACK §11).
- **Preventing secrets entering bundles:** only `VITE_`-prefixed vars are exposed; no import of server-only env; lint/scan guards (RECOMMENDED).

---

## 19. Governance & Traceability

- This document references only existing SSOT IDs where relevant: `FR-*`, `NFR-*`, `BR-*`, `BI-*`, `FEAT-*`, `ARCH-DEC-*`, `AC-*` (see REQUIREMENTS.md, BUSINESS-RULES.md, FEATURES.md, ARCHITECTURE.md, API-SPECIFICATION.md, TECH-STACK.md, FOLDER-STRUCTURE.md).
- **New to this document:** the development/engineering conventions above (marked CONFIRMED/PROPOSED/RECOMMENDED) and the "RECOMMENDED" label for conventions without repository precedent.
- If an authoritative SSOT changes, re-verify the conventions derived from it before proceeding.
- No section here invents a business rule, role, workflow, or product behavior. Where a standard would require an approval-boundary decision (new dependency, new global state solution, auth change, API contract change, design-system change), it is listed as REQUIRES APPROVAL and must not be enacted silently.

---