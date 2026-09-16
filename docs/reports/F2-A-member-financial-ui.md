# F2-A Delivery Report - Member Financial UI (Mock-Backed)

Phase F2-A delivers the Member Financial suite (SCR-MEM-008..015) as frontend-only screens backed by the API-shaped mock. All rules come from the SSOT docs; nothing here moves real money or changes the backend/DB.

## Scope delivered

8 new screens under `/member/*`, wired into `navigation.ts` and `App.tsx` (placeholders for eWallet/Payouts removed):

| Screen | Route | Key requirements enforced |
|---|---|---|
| EWallet | `/member/ewallet` | Server-computed Available vs Pending (BI-002, BR-WAL-003); actions to Withdraw / Ledger; BR-BND-001..003 note (JA&D records, never moves money) |
| Ledger | `/member/ewallet/ledger` | Append-only entries (BI-005), server-computed `balanceAfter` running balance, cursor "Load more" pagination (API-SPEC §4), allowlisted type filter (SCR-MEM-009) |
| Payouts | `/member/payouts` | Masked identifiers only (SECURITY.md), lifecycle Pending → Admin Review → Confirmed (BR-PAY-004), single Primary (BR-PAY-006) with Set-as-primary action |
| Add payout account | `/member/payouts/new` | POST `/me/payout-accounts`; new account starts PENDING; identifier stored encrypted & never re-shown; OD-016 method set flagged as PROPOSED |
| Request withdrawal | `/member/withdrawals/new` | Verified account required (empty state otherwise); amount ≤ Available; ConfirmDialog before irreversible reservation (BR-WDR-001/002); `Idempotency-Key` header (API-SPEC §5.3); 409/422 mapped to friendly copy |
| Withdrawals | `/member/withdrawals` | Confirmed status vocabulary (BUSINESS-RULES §5); external reference on completed (BR-BND-001) |
| Withdrawal detail | `/member/withdrawals/:id` | Rejected ⇒ mandatory reason shown (BR-WDR-004) + new-request link (BR-WDR-005, not editable/resubmittable) |
| Commissions | `/member/commissions` | Immutable records (BI-005), server snapshots (BI-006), 8%/4% Direct Commission/Referral can co-exist on the same sale (BR-COM-001/002), status vocabulary |

## Contracts (@jad/contracts)

- `commission.ts` - `commissionSchema` + status/type enums (`PENDING|AVAILABLE|CANCELLED|REVERSED`; `DIRECT_COMMISSION|DIRECT_REFERRAL|GROUP_INCENTIVE`). `GROUP_INCENTIVE` kept in type union but flagged OD-gated; mock never produces it.
- `payout.ts` - `payoutAccountSchema` with `accountIdentifierMasked` (raw value never leaves the server), status enum (`PENDING|ADMIN_REVIEW|CONFIRMED`), `createPayoutAccountRequestSchema`, `setPrimaryPayoutAccountRequestSchema` (`{isPrimary: true}` literal).
- `withdrawal.ts` - `withdrawalSchema` with embedded masked payout summary, optional `rejectionReason`/`externalReference`, status enum (`REQUESTED|RESERVED|COMPLETED|REJECTED`, no added states), `createWithdrawalRequestSchema`.
- `ewallet.ts` - added optional server-computed `balanceAfter` to `ledgerEntrySchema` (client never derives balances, BI-001).

## Shared (@jad/shared)

`money.ts` + tests: `compareMoney`, `addMoney`, `subtractMoney` built on BigInt cents - exact-decimal strings in, exact-decimal strings out, no float arithmetic.

## Mock API (apps/web mock)

- Seed for `mem-001` is coherent end-to-end: wallet `140000.00` available / `636000.00` pending; 6 commissions (AVAILABLE ×2, PENDING ×2, REVERSED, CANCELLED); 4 payout accounts (2 CONFIRMED incl. Primary, PENDING, ADMIN_REVIEW); 3 withdrawals (COMPLETED with reference, REJECTED with reason, RESERVED); 10 ledger entries whose running balance lands exactly on the wallet available (WITHDRAWAL_COMPLETION does not change the balance - reservation already deducted).
- Handlers: `GET /me/commissions` (joins sale property name, newest first), `GET/POST /me/payout-accounts`, `PATCH /me/payout-accounts/:id` (Set Primary, single Primary invariant), `POST /me/withdrawals` (Idempotency-Key required ⇒ 400; unverified account ⇒ 422 `PAYOUT_ACCOUNT_UNVERIFIED`; amount > available ⇒ 409 `INSUFFICIENT_BALANCE`; creates RESERVED + deducts wallet + appends WITHDRAWAL_RESERVATION; replays the stored response on a repeated key), `GET /me/withdrawals`, `GET /me/withdrawals/:id` (object-level 404), cursor-paginated `GET /me/ledger` with allowlisted `?type=` filter and server-computed `balanceAfter`.
- Fixed the mock server route matcher to compare pathnames only (query strings no longer break suffix/prefix matching) - a latent issue for any query-parameter endpoint; the web test `mockFetchRoutes` util was aligned the same way.

## Client layers

- `client.ts`: `requestPage` + `PageResult<T>` reading `meta.pagination.nextCursor` (cursor pagination).
- `services/member.ts`: `getCommissions`, `getPayoutAccounts`, `createPayoutAccount`, `setPrimaryPayoutAccount`, `getWithdrawals`, `getWithdrawal`, `createWithdrawal` (Idempotency-Key header), `getLedgerPage(cursor?, type?, limit?)`. Removed the unbounded `getLedger` (API-SPEC §4 forbids unbounded reads).
- `hooks/useMember.ts`: `useCommissions`, `usePayoutAccounts`, `useWithdrawals`, `useWithdrawal`, `useLedgerPage` (`useInfiniteQuery` with `initialPageParam`; changing the type filter starts a fresh stream).
- `lib/presentation.ts`: labels/tones for commission/payout/withdrawal statuses and methods, ledger entry types, and `formatSignedMoney` (presentation only, no arithmetic).

## Validation

- 40 web test files / 188 tests green (was 32/156). New coverage: F2-A mock handler flows (commissions, ledger pagination + running balance + type filter, payout create/promote, withdrawal idempotency/409/422/400, list/detail) and one spec per screen (load/error/empty/primary/invalid-budget/confirm flows).
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass; `pnpm format` applied.
- Security/accessibility: masked payout identifiers everywhere, no raw account numbers rendered, `role="status"`/`role="alert"` announcements via Alert, labelled form fields (`TextField`/`SelectField`), keyboard-focusable 44px+ controls, ConfirmDialog before irreversible actions.

## Assumptions & deviations (need Owner sign-off)

1. **Payout method set is PROPOSED** - `TRADITIONAL_BANK | DIGITAL_BANK | GCASH | OTHER` is a mock candidate set; the final supported methods are BLOCKED on **OD-016** (FEAT-047).
2. **Contract additions are PROPOSED** - `ledgerEntrySchema.balanceAfter` (server-computed running balance), `meta.pagination.nextCursor`, and `commission.salePropertyName` (server-side join for display) were added to make the screens feasible; they must be confirmed with the real API contract.
3. **`WITHDRAWAL_COMPLETION` balance semantics** - treated as informational (no running-balance change) because the reservation already deducted the funds (BR-WDR-002/003). Final withdrawal model is TBD (OD-017/018); no extra statuses were invented.
4. **No client-side authority** - the UI never derives balances; the 409/422 handling relies on the server being authoritative, and the client pre-checks only for UX.
5. **Ledger filter is server-side** and allowlisted; `?type=` filtering resets the cursor stream (no client-side filtering of loaded pages, which would be misleading).

## Gaps / out of scope (F2-B+)

- Group Incentive commissions (OD-gated, BR-COM-008) - union type present but never produced.
- Payout method catalog (OD-016), withdrawal final state machine (OD-017/018).
- Ledger export (REQUIRES APPROVAL per SCR-MEM-009), jump-to-sale/commission deep links beyond the commission list link.
- Real backend / DB / payment gateway integration.