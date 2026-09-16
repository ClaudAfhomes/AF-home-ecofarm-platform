# F2-B Delivery Report - Member Referrals, Vouchers & Content (Mock-Backed)

Phase F2-B delivers the Member Referrals / Vouchers / Content suite (SCR-MEM-016..024) as frontend-only screens backed by the API-shaped mock. All rules come from the SSOT docs; referral/genealogy views are reporting-only and never imply multi-level payout; Total Earned is an OD-025-gated placeholder awaiting approval.

## Scope delivered

10 new screens under `/member/*`, wired into `navigation.ts` (4 flat reporting items under Referrals) and `App.tsx`; the F1 Referral Code screen (`/member/referrals`) is preserved unchanged:

| Screen | Route | Key requirements enforced |
|---|---|---|
| Direct Referrals | `/member/referrals/direct` | Strictly single-level (BR-REF-001/002); status + qualified flag; empty state links to referral code; "single-level only" note (BR-REF-002) |
| Group Network | `/member/referrals/network` | Reporting-only summary counts (BR-RPT-002); explicit "not multi-level commission" note (BI-004) |
| My Genealogy | `/member/referrals/genealogy` | Recursive tree (FR-RPT-004), expanded by default, per-node collapse + status filter (matches always visible when filtering); "reporting only, never MLM" note (BR-RPT-004) |
| Total Earned | `/member/referrals/earned` | **REQUIRES APPROVAL placeholder** (OD-025); no figure, no endpoint; links to ledger/commissions |
| Vouchers | `/member/vouchers` | Own vouchers only (object-level NFR-AUTHZ-002); Original / Remaining (BR-VCH-002), status vocabulary ACTIVE / FULLY_REDEEMED; no transfer/revoke/expiry (BLOCKED OD-019..023, BR-VCH-007) |
| Voucher detail | `/member/vouchers/:voucherId` | Server-computed remaining; unknown id → NotFound; no gated actions shown; "pending approval" note |
| Content Library | `/member/news` | Server-provided share (Messenger/Viber) + download URLs (BR-MKT-002); download-only content shows no download button; safe external links |
| Policies | `/member/policies` | Public endpoint (#69); titles/types from API, never invented (FR-ADM-004, BR-NOT-001) |
| Policy detail | `/member/policies/:policyId` | Resolved from the policy list (no `GET /policies/:id` endpoint exists); content rendered as PLAIN TEXT - no raw HTML (SECURITY.md) |
| Notifications | `/member/notifications` | Broadcast/announcement feed (FR-ADM-005); read state derived from server `readAt`; no client mark-read (no endpoint) |

## Contracts (@jad/contracts)

- `referral.ts` - `directReferralSchema` (name, status, `isQualified`, `joinedAt`), `groupNetworkSchema` (`totalMembers`, `directReferrals`, `qualified`, `pending`, `rejected`), recursive `genealogyNodeSchema` via `z.lazy` with exported `GenealogyNodeShape` interface (children are `GenealogyNodeShape[]`, not `unknown[]`), `genealogySchema`.
- `voucher.ts` - `voucherStatusSchema` (`ACTIVE | FULLY_REDEEMED`, no invented states), `voucherSchema` with exact-decimal string `originalValue`/`remainingValue` (BR-WAL-002 §1.3). Expiry/transfer/revoke fields deliberately absent (OD-gated).
- `content.ts` - `contentKindSchema` (`DOCUMENT | IMAGE | VIDEO | PROMO`), `forwardableContentSchema` with optional `downloadUrl` and `share { messengerUrl?, viberUrl?, copyUrl? }` - URLs are always server-provided.
- All exported from `packages/contracts/src/index.ts`.

## Mock API (apps/web mock)

- Seed extended for a coherent demo network: members `mem-005` (Ramon Reyes, approved+qualified), `mem-006` (Liza Lopez, PENDING), `mem-007` (Kevin Kintanar, approved+qualified), `mem-008` (Nina Navarro, REJECTED); `sponsorId` edges on existing mem-002; `registeredAt` added to `MockMember` (factory default + set in the register handler).
- Vouchers (3) for `mem-001`: vch-001 Welcome Gift 500.00 ACTIVE; vch-002 Referral Rewards 1000.00/350.00 ACTIVE; vch-003 Season Promo 250.00/0.00 FULLY_REDEEMED.
- Content (3): two DOCUMENT items (data:`text/plain` `downloadUrl` so the demo works without a media backend) and one PROMO (no download); all with Messenger/Viber share URLs.
- Policies (3): Terms and Conditions, Program Guidelines, Privacy Policy - PUBLIC, no session required.
- Handlers: `GET /me/direct-referrals`, `GET /me/reports/group-network`, `GET /me/genealogy` (recursive `buildGenealogyNode`), `GET /me/vouchers` (own, newest first), `GET /vouchers/` (prefix match, own-only, 404 otherwise), `GET /content/forwardable`, `GET /policies`. **No** `/me/reports/total-earned` endpoint (OD-025 gated).

## Client layers

- `services/member.ts`: `getDirectReferrals`, `getGroupNetwork`, `getGenealogy`, `getVouchers`, `getVoucher`, `getContentLibrary`, `getPolicies`.
- `hooks/useMember.ts`: matching hooks `useDirectReferrals` … `usePolicies`.
- `lib/presentation.ts`: `voucherStatusLabel`/`VOUCHER_STATUS_TONE`, `contentKindLabel`.

## Validation

- 50 web test files / **213 tests** green (was 40/188). New coverage: F2-B mock handler flows (direct referrals single-level, group-network summary, recursive genealogy, vouchers newest-first + remaining, voucher 404, content share/download targets, policies public) and one spec per screen (load / empty / error / collapse+filter / not-found / safe external links / read-unread).
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass; `pnpm format` applied.
- Security/accessibility: own-vouchers-only enforced server-side (unknown/foreign id → 404); every external share/download link uses `target="_blank"` + `rel="noopener noreferrer"`; policy content rendered as plain text (no `dangerouslySetInnerHTML` - raw HTML rendering remains REQUIRES APPROVAL); no client-side authorization anywhere; `aria-expanded`/`aria-pressed` on the genealogy toggles/filters; clipboard copy via `CopyLinkButton`.

## Assumptions & deviations (need Owner sign-off)

1. **Total Earned is a placeholder only** - no figure and no endpoint were added; building the real screen is BLOCKED on **OD-025** (FEAT-064).
2. **Contract additions are PROPOSED** - `referral.ts`, `voucher.ts`, `content.ts` shapes (incl. `GenealogyNodeShape`, voucher status vocabulary, `share` URLs, `downloadUrl`) must be confirmed against the real API contract.
3. **Voucher status vocabulary is limited** to `ACTIVE | FULLY_REDEEMED`; expiry/transfer/revoke are BLOCKED on OD-019..023 (BR-VCH-007) and no extra statuses were invented.
4. **Policy detail resolves from the policy list** because no `GET /policies/:id` endpoint exists (API-SPEC #69); content is plain text.
5. **No mark-read / dismiss** for notifications - `readAt` is server-derived and there is no endpoint; only the read/unread indicator is shown.
6. **Genealogy is visualization-only** - the tree never computes or suggests multi-level payout (BI-004, BR-RPT-004); large trees need virtualized rendering (UI-UX §11.4) before real API rollout.

## Gaps / out of scope (F2-C+)

- Total Earned real figure (OD-025), voucher transfer/revoke/expiry (OD-019..023), voucher QR presentment (OD-024, API-SPEC #74), social rewards (OD-026).
- Genealogy filtering beyond status, and tree virtualization.
- Real backend / DB / media storage / external share-service integration (mock uses data: URIs for downloads).
