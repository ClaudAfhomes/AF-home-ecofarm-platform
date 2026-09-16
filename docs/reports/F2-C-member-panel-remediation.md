# F2-C Delivery Report - Member Panel Remediation & Hardening

Phase F2-C hardens the member portal built across F2-A/F2-B. Two P1 production hazards are fixed (DEV mock session leaking into the real app; `POST /sales` without idempotency) plus the prioritized P2 list (semantic link buttons, 44px touch targets, exact-decimal money validation in one place, validation status alignment). No SSOT/business-rule changes were made.

## P1 fixes

### P1-1 - Mock session is now a DEV-only stand-in, never an auth boundary

Previously the member/admin panels were implicitly "signed in" as mock users and the mock session rode along in production bundles. Now each app owns a session seam:

- `apps/web/src/lib/session.tsx` and `apps/admin/src/lib/session.tsx`: app-owned `SessionContext` + `useSession()`. `SessionProvider` statically branches on `import.meta.env.DEV` - DEV mounts the mock session (`MockSessionProvider` + `MockSessionBridge`, preserving the role switcher); production mounts `UnauthenticatedSessionProvider` (always `unauthenticated`, `user:null`, `role:null`, no-op `loginAs`/`logout`). Until real backend auth lands, every production visitor is unauthenticated - there is no client-side authz trust.
- The admin provider uses a `null` sentinel (`initialUser?: SessionUser | null`) so an explicit `null` forces unauthenticated while omitting the prop keeps the DEV auto-authenticated default. This fixes the earlier bug where an `undefined` default re-applied `MOCK_ADMIN` and broke the "Forbidden for unauthenticated" path.
- 8 web consumers (`RequireMember`, `RequireQualifiedMember`, `MemberLayout`, `useMember.ts`, `DashboardPage`, `ReferralCodePage`, `ResubmitPage`, `LoginPage`) and 3 admin consumers (`RequireRole`, `AdminLayout`, `DashboardPage`) now read state from `useSession`; `MockUserSwitcher` remains DEV-gated in `main.tsx`.
- Test helpers (`src/test/utils.tsx`, member and admin variants) and 6 specs migrated to `SessionProvider` with a typed `SessionUser` option.

**Prod-bundle verification (grep on built assets):** `apps/web/dist` and `apps/admin/dist` contain **zero** matches for `MockSessionProvider`, `useMockSession`, `MockUserSwitcher`, mock user ids/emails, or mock-server markers. The mock server (handlers/store) and the `@jad/mock` session are fully tree-shaken out of production.

### P1-2 - `POST /sales` is idempotent

`POST /sales` now requires and honors the `Idempotency-Key` (API-SPECIFICATION §5.3) exactly like `POST /me/withdrawals`:

- `apps/web/src/mock/handlers.ts` stores the created sale under `store.idempotency['POST:/sales:'+key]` and replays the stored response on a repeated key without re-applying side effects.
- **Correction to the F2-A report:** F2-A delivered and regression-tested idempotent replay for the **withdrawal** mutation; sales submission carried the header but the mock did not replay. That gap is closed and regression-tested in F2-C.
- Mock store seeded `sal-010` (REJECTED, `resubmissionCount: 3`) to exercise the BR-SAL-006 lock boundary; `nextSaleId` bumped to 11 to avoid an id collision.

## P2 fixes

| Item | Change |
|---|---|
| Semantic link buttons | Replaced nested `<Link><Button>` with `ButtonLink` in Sales list, EWallet (2), Payout accounts, Withdrawals list, Withdrawal detail (passing the existing `className`). Removed orphaned imports. |
| 44px touch targets | `MyGenealogyPage.module.css`: filter/toggle controls min-height/area 44px (placeholder dots stay 24px); `ContentLibraryPage.module.css`: `linkButton` min-height 44px. |
| Money regex single source | New `packages/contracts/src/schemas/money.ts` (`EXACT_DECIMAL_STRING_RE`, `EXACT_DECIMAL_RATE_RE` + schemas) is the one definition; `commission`, `ewallet`, `withdrawal`, `sales`, `voucher` schemas import it and `@jad/shared` now imports the regex from `@jad/contracts` (BR-WAL-002, API-SPEC §1.3). |
| Validation status | `validationError` helper, inline registration-schema failure, and the ledger-filter/VerifyEmail fixtures aligned to **400** for malformed/validation errors per API-SPEC §1.2 (422 reserved for business rules). |

## Validation

- **17 new tests** in 5 new spec files: `RequireQualifiedMember` (qualified/non-qualified/loading), `RegistrationStatusPage` (pending summary + sign-in link), `SalesListPage` (list + money formatting + hrefs, empty, error), `SaleDetailPage` (snapshot render, LOCKED reopen request, 404, network), `SaleSubmitPage` (form validation, successful submit + navigation, envelope error, network).
- `handlers.spec.ts` extended to **33 tests**: idempotent replay (same key → same sale, no duplicate), distinct keys, cross-user 404 (foreign member gets `NOT_FOUND` on `getSale`/`getWithdrawal`/`getVoucher`), `SALE_LOCKED` boundary (resubmit `sal-010` → 409), and an exact-balance withdrawal boundary (`availableBalance` `0.00`).
- Full gates green: **web 55 files / 235 tests** (was 50/213), `pnpm test` 7/7 workspaces, `pnpm typecheck` 7/7, `pnpm lint` (0 errors; 1 non-blocking `react-refresh` fast-refresh warning in `session.tsx` from exporting the `useSession` hook alongside the provider), `pnpm build` ok, `pnpm format` applied. Admin one-off `vite build` ok.

## Assumptions & deviations (need Owner sign-off)

1. **Session seam is app-owned and production is unauthenticated** - real auth (HttpOnly session cookie, `/auth/me`) is F3; the `UnauthenticatedSessionProvider` is the correct place to wire it in.
2. **Mock idempotency store is in-memory** - real persistence, key hashing, and TTL (24h, PROPOSED) are backend concerns (API-SPEC §5.3, DATABASE-DESIGN §20); the client behavior (reuse key on retry, never persist) is already correct.
3. **Validation status 400** is now consistent with API-SPEC §1.2 across the mock and the client test fixtures.
4. **Demo-credential copy literal** (`AUTH.login.demo`, `juan.delacruz@example.com` / `password123`) remains as inert text in the production web bundle. It is DEV-gated in `LoginPage.tsx` and never rendered in production, and it is approved placeholder content - not a mock-API leak. Removing it entirely would require splitting the demo block into a DEV-only module; deferred to keep this pass from expanding scope.
5. **Lazy loading / code-splitting not performed** - Vite flags a >500 kB chunk. Route-level splitting is an architectural expansion (new React.lazy/Suspense wiring) and is deferred to a dedicated performance phase; it is the top remaining perf item.

## Gaps / out of scope (F3+)

- Real backend auth + session restore (F3); persistence/TTL for idempotency keys; rate limiting.
- Optional lower-risk spec gaps not added: `ReferralCodePage`, `QualificationStatusPage`, `ResubmitPage`, `ProfilePage` (existing patterns cover load/error/empty states; low risk).
- Route-level code-splitting (lazy loading) - recommended next perf phase.
- Remove the inert demo-credential copy from the prod bundle via a DEV-only module (cosmetic).