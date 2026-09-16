# ADR-014: Voucher Creation (definition) + Assign to Members + Admin QR Scan/Redeem

## Status
**Accepted** (owner-approved scope, 2026-09-15; amended same day - see Decision). The vouchers
feature is implemented end-to-end (frontend, API, database, admin + member apps) as an
**admin-created voucher definition** that is **assigned to members** (each assignment = a
unique, member-scoped voucher with a locally-generated QR code) and an **admin storefront
scan/redeem flow**. The CTO-signing / merchant-redemption model described in ADR-007 and the
P8 SSOT docs remains a **future PROPOSED architecture** - it is not the implemented model.

## Context
The SSOT docs describe a P8 vouchers model: CTO-controlled signing service (ADR-007,
BI-008), Merchant (`MRCH`) redemption portal, partial redemption with a redemption ledger,
and `Idempotency-Key` atomicity. The implemented Phase B7 system is materially simpler and
was built for the confirmed "unique QR voucher" requirement: an admin creates a voucher
*definition*, assigns it to members (each gets a unique code + QR), the member displays the
QR, and an **admin** scans the QR to verify and redeem it - there is no separate merchant
app, no signing service, and no partial redemption in the implemented scope.

## Problem
Give the admin a "Create Voucher" action (no member selection) and then an "Assign to
Member" step (with per-assignment expiry/validity), plus a storefront QR scanner, and make
each member's voucher a **unique, verifiable, redeemable-once** instrument - end to end, from
the database to both SPAs.

## Options Considered
- **One-step create with member in the dialog** - initially chosen, then **amended**: the
  owner asked to remove the member select from the create dialog. "Create Voucher" now makes
  a definition (title + value only); assignment is a separate step.
- **One created voucher → one member only** - rejected: the owner chose one definition →
  many members (each assignment a unique voucher), matching the `VoucherTemplate` → `Voucher`
  DB model.
- **Redemption that decrements remaining value (partial)** - rejected for this scope: the
  owner chose verify + redeem in full (`FULLY_REDEEMED`, remaining → `0.00`), matching the
  existing `ACTIVE`/`FULLY_REDEEMED` status vocabulary and avoiding a new redemption ledger.
- **Allow duplicate issuance** - rejected: the owner chose to block duplicates, enforced by a
  DB unique index on `(memberId, templateId)`.
- **Keep the external `api.qrserver.com` for QR images** - rejected: production-ready means
  local QR generation (no third-party privacy leak, works offline); the owner approved adding
  client-side QR libs (`qrcode` in `@jad/ui`, `jsqr` in the admin scanner).

## Decision
- **"Create Voucher" makes a definition (`VoucherTemplate`: title + value).** `POST
  /admin/voucher-templates` creates it (the admin UI labels this "Create Voucher"; no member
  field).
- **"Assign to Member" issues a unique voucher.** `POST /admin/vouchers/assign` takes
  `templateId` + `memberId` + optional per-assignment `expiresAt`/`validityDays` (request
  wins over the template rule, which is the fallback), snapshots the value, and creates a
  member-scoped `Voucher` with a unique code (`JAD-VCH-<year>-<nnn>`). The `(memberId,
  templateId)` unique index enforces one voucher per member per definition (409 CONFLICT on
  duplicates). A code-unique collision is retried up to 3×. The one-step `POST /admin/vouchers`
  endpoint from the first iteration was removed (dead code).
- **QR payload = the unique voucher code.** The member app renders the QR locally via the new
  `@jad/ui` `QrCode` component (data-URL image, no external service); `downloadQrImage`
  replaces the old hot-linked download links.
- **Admin storefront flow:** `POST /admin/vouchers/scan` (verify-only: 404 unknown code, 409
  already-redeemed/expired) then `POST /admin/vouchers/:id/redeem` (conditional single UPDATE
  on `status='ACTIVE'`, remaining → `0.00`, `redeemedAt`/`redeemedBy` stamps, audit
  `VOUCHER_REDEEMED`). The admin `ScanVoucherPage` uses a camera (`getUserMedia` + `jsqr`)
  with a manual code-entry fallback.
- **RBAC:** create/assign/scan/redeem require the `vouchers` module at `ADMIN_STAFF`
  (super_admin, admin). Merchant storefront scanning is future work.
- **Admin UI:** `VouchersPage` lists voucher definitions (title, value, assigned count) with
  "Create Voucher" + "Scan QR" actions; `VoucherDetailPage` shows the definition with an
  "Assign to Member" dialog (member + expiry/validity) and the assignments table (member,
  code, QR, remaining, status, Revoke). The one-step member-select dialog was removed.

## Rationale
The owner selected the recommended options on 2026-09-15 (definition + assign, verify + full
redemption, block duplicates, local QR generation) and amended the create step to drop the
member select and defer expiry to assignment. This keeps the feature production-ready and
minimal: no new redemption ledger, no signing service, and no merchant role - all of which
the SSOT already describes as PROPOSED/future.

## Trade-offs
- **Definition + assign is a two-step admin flow** - matches "Create Voucher" without a
  member, then "Assign to Member" with expiry/validity; the member select moved out of the
  create dialog onto the detail page.
- **Full redemption only** - partial redemption (FR-VCH-001/002) is deferred; the status
  vocabulary stays `ACTIVE`/`FULLY_REDEEMED`.
- **Admin scans, not merchants** - matches the confirmed workflow but is narrower than the
  P8 merchant portal.

## Consequences
- DB: unique index `Voucher_member_template_uidx`; columns `redeemedAt`, `redeemedBy` (→
  `StaffUser`). No new tables. `VoucherTemplate.expiresAt/validityDays` stay as fallback
  defaults; assign-time expiry is stored on the `Voucher`.
- Contracts: `voucherSchema` gains `redeemedAt`/`redeemedBy`; `assignVoucherRequestSchema`
  gains per-assignment `expiresAt`/`validityDays`; `createVoucherRequestSchema` (one-step)
  was removed; `scanVoucherRequestSchema`, `redeemVoucherRequestSchema` retained.
- API: `POST /admin/voucher-templates` (create definition), `POST /admin/vouchers/assign`
  (with expiry/validity), `POST /admin/vouchers/scan`, `POST /admin/vouchers/:id/redeem`.
  One-step `POST /admin/vouchers` removed.
- Apps: `@jad/ui` gains `QrCode` + `downloadQrImage`; admin vouchers UI is definition +
  assignments with an assign dialog; member QR renders locally and shows redeemed state.

## Validation / Evidence
- `pnpm typecheck` (8/8 workspaces), full `pnpm test` per workspace (api 403, admin 479,
  web 148, contracts 60, ui 42, mock 10 - the one admin PolicyDetailPage failure is the
  documented pre-existing parallel-load flake, green in isolation).
- New specs: `api/v1/admin/vouchers/scan-redeem.spec.ts` (scan 200/404/409, redeem
  200/409), `api/v1/admin/vouchers.spec.ts` assign cases (per-assignment expiry, 409
  duplicate, code retry), `packages/ui QrCode.spec.tsx`, admin `VouchersPage`,
  `VoucherDetailPage` (definition + assignments + assign dialog), `ScanVoucherPage` specs,
  contracts voucher schema specs.
- Migration `20261009000001_voucher_scan_redeem.sql` with header validation queries +
  `supabase/security/rls_invariants.sql` (empty = PASS expected; no RLS change).

## References
- ADR-007 (CTO signing boundary) - PROPOSED future, not this scope.
- API-SPECIFICATION §6.11 (voucher endpoints), DATABASE-DESIGN E-22/E-23.
- FEATURES FG-VOUCHER, REQUIREMENTS FR-VCH, BUSINESS-RULES BR-VCH.