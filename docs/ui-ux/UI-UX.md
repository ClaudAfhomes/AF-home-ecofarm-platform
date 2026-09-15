# JAD — Product / UI / UX Specification SSOT (UI-UX.md)

> **Authority:** This document is the **authoritative source for product experience, user-interface behavior, information architecture, and interaction design** for the JA&D (JAD) system.
>
> **Precedence:** BUSINESS-RULES.md → REQUIREMENTS.md → FEATURES.md → ROADMAP.md → ARCHITECTURE.md → TECH-STACK.md → FOLDER-STRUCTURE.md → API-SPECIFICATION.md → **this document** → DESIGN-SYSTEM.md.
>
> **Governance:** UI/UX decisions are derived strictly from the approved business rules, requirements, features, roadmap, and architecture. If another document conflicts, do **not** silently overwrite. Identify the conflict, record the source, and mark unresolved items **REQUIRES APPROVAL**. No business rule, role, permission, workflow, or product behavior may be invented here.
>
> **Status vocabulary:** **CONFIRMED** = derived from approved SSOT decisions. **PROPOSED** = recommended UI/UX decision not yet formally approved. **ASSUMPTION** = working assumption. **REQUIRES APPROVAL** = material UI/UX decision needing Owner approval. **TBD** = unresolved; must not be invented.
>
> **Version:** Project 04 — Product / UI / UX (Baseline v1.0)
>
> **Current verified state:** Application code exists under `apps/web` (Member Web, React 19 + Vite 8) and `apps/admin` (Admin, React 19 + Vite), styling via CSS Modules + `tokens.css`/`DESIGN-SYSTEM.md`, `packages/contracts` Zod schemas, `packages/mock` local API — screens below are **implemented per phases** (P2..P10 member F1 F2-A/B), not just proposed. Legacy wording “documentation only” is stale.

---

## 1. Scope

### 1.1 Applications in scope

| App | Folder (FOLDER-STRUCTURE.md) | Roles served | Phases |
|---|---|---|---|
| **Member Web App** | `apps/web` | Member, Active + Qualified Member | P2..P10 |
| **Admin / Back-Office App** | `apps/admin` | Admin, Finance, Super Admin | P2..P11 |
| **Merchant Redemption Portal** | `apps/merchant` | Merchant | P8 |
| **API** (backend) | `apps/api` | (no UI; drives all apps) | P1..P12 |

> **CTO Signing Service** (ARCHITECTURE §4.1) is an external service with **no user-facing UI**. It is out of scope for this document except as an integration the Merchant/Admin voucher flows depend on (FEAT-052, FEAT-059).

### 1.2 Delivery model (CONFIRMED)

- **Responsive web first (ARCH-DEC-005, CONFIRMED):** all three apps are responsive web applications. Native mobile is revisited post-MVP under ARCH-DEC-006 (**REQUIRES APPROVAL**).
- **Session authentication (ARCH-DEC-007, CONFIRMED):** HttpOnly, Secure, SameSite cookies; all frontends authenticate via the shared session (API-SPECIFICATION §2).
- **Framework:** React + Vite SPAs (TECH-STACK §2, CONFIRMED). Routing, state, forms, and styling choices below are PROPOSED per TECH-STACK §2 unless noted.

### 1.3 Scope boundaries

- UI/UX must never present actions the business rules prohibit (e.g., edit/delete of financial records, withdrawal of Pending commissions, sale of arbitrary seller-created properties, purchase required for membership, multi-level commissions, refunds, money movement).
- Gated features (FEAT-017, FEAT-018, FEAT-022, FEAT-041, FEAT-047, FEAT-051, FEAT-058, FEAT-066, FEAT-069) and gated endpoints (API-SPECIFICATION #21, #42, #76, #80) must not surface **implementable** UI until the corresponding Owner decisions (OD-001..025) are approved. Their screens may exist only as **planned placeholders** clearly labeled `REQUIRES APPROVAL`.

---

## 2. UX Principles

### 2.1 Core principles (PROPOSED unless derived)

1. **Financial clarity first (CONFIRMED derivation).** Because the eWallet and commission state model is the product's core, every money value must be shown with an explicit status label (`Pending` / `Available`), exact decimal amounts, and the currency symbol (`₱` — BUSINESS-RULES §6 examples). Never display a computed total that mixes Pending and Available funds without labeling both (BI-002).
2. **Honesty of state (CONFIRMED derivation).** UI state labels must match BUSINESS-RULES.md §5 state models exactly (`Pending`, `Approved-Active`, `Rejected`; `Submitted`, `Admin Approved`, `Payment Verified`, `Qualifying Sale`, `LOCKED`; `Reserved`, `Completed`, `Rejected`; etc.). No invented states.
3. **No dead-ends, always a path forward.** Every rejection includes a **mandatory reason** (BR-REG-004, BR-SAL-005, BR-WDR-004) and a visible next action (resubmit, new request, or escalation to staff).
4. **Object-level trust (CONFIRMED derivation).** Members see only their own data (NFR-AUTHZ-002). The UI never renders another member's identifiers or resources; missing resources render as "not found" rather than revealing existence (API-SPECIFICATION §1.2, 404).
5. **Progressive disclosure.** Dense financial/operational data (ledger, genealogy, queues) is layered: summary → detail → history. Default views are summaries; deep history requires deliberate navigation.
6. **Staff queues over raw lists.** Admin/Finance/Super Admin views are organized around **work queues** (registrations, sales, payouts, withdrawals, exceptions) with clear per-item status, because every staff action is an audited decision (NFR-SEC-002, NFR-AUD-001).

### 2.2 Usability principles

- **Learner-friendly core paths:** registration, sale submission, and withdrawal must require no training; help text explains eligibility gates (e.g., "You must be Active + Qualified to submit a sale — BR-SAL-001").
- **Efficiency for operators:** Admin/Final decision screens support keyboard-first review (approve/reject shortcuts), batching where safe, and persistent filters.
- **Consistent patterns:** one pattern per intent across all three apps (see §8 Interaction Patterns).

### 2.3 Clarity and consistency

- Terminology, labels, and status names match the SSOT exactly. A Pending commission is always "Pending" everywhere; a sale that passed approval but not payment verification is "Admin Approved", never "Pending approval" or "Half-done".
- Consistent placement of primary actions, cancel, and back navigation within each app.
- Money input/display is identical everywhere (see DESIGN-SYSTEM.md §1).

### 2.4 User efficiency

- **Pre-fill from catalog:** sale submission selects Property from the Admin catalog (FR-PRP-003) — the Property Value is a read-only snapshot at submission (BR-PRP-004, BI-006).
- **Idempotent submits:** Sale, withdrawal, redemption, and adjustment submissions carry an `Idempotency-Key` (API-SPECIFICATION §5.3). The UI generates and retains the key per submission so retries after network failure never double-apply (BI-007, BR-WDR-002).
- **Persistent filters** in staff queues; **saved page state** in member lists.

### 2.5 Error prevention and recovery

- Prevent errors at the source: constrained inputs (money as exact decimals, dropdowns from config for Gender per BR-REG-011), confirmation on destructive/irreversible actions, and warnings before actions with irreversible consequences (e.g., submitting a sale snapshots the property value).
- All server errors map to the API error envelope codes (API-SPECIFICATION §3) and surface human-readable, actionable messages (see §10 UI States).
- **Recovery is explicit:** a rejected withdrawal cannot be edited/resubmitted (BR-WDR-005) — the UI must say so and start a **new** request rather than pretending to reuse the old one.

### 2.6 Accessibility-first principles

- No approved accessibility NFR exists in REQUIREMENTS.md. The following are **PROPOSED platform standards** (RECOMMENDED — REQUIRES APPROVAL): semantic HTML, full keyboard operability, visible focus, WCAG-2.1 AA contrast, screen-reader labels, touch targets ≥ 44px, and reduced-motion support. See §12 Accessibility and DESIGN-SYSTEM.md §7.
- Accessibility is applied to all three apps from first build, not retrofitted.

---

## 3. User Journeys

Format per journey: **Actor · Entry point · Goal · Preconditions · Main steps · Decisions · Validation · Success · Failure/recovery · Completion state · Related**.

### 3.1 Applicant — Register & Qualify (Domestic) — core (P2)

- **Actor:** Applicant (not yet a member).
- **Entry point:** Public landing → "Register" (SCR-AUTH-002).
- **Goal:** Create an account and reach `Pending` with a path to Active + Qualified.
- **Preconditions:** None. No purchase required (BR-REG-006).
- **Main steps:** (1) Choose program — Domestic is the MVP operating program (ROADMAP §7.5); (2) enter profile fields (FR-MEM-001) including age, Gender (config-driven values, BR-REG-011), Country (structured, member-immutable, BR-REG-010); (3) enter optional referral/sponsor code (BR-REG-009) or skip (Sponsor = None, BR-REG-008); (4) answer qualification questions (FR-REG-003, FEAT-012); (5) upload government-issued ID (FR-REG-002, FEAT-010); (6) verify email (FR-AUTH-001, FEAT-009).
- **Decisions:** Apply with or without sponsor code; accept/decline optional profile photo.
- **Validation:** Age ≥ configured minimum (default 18, FR-REG-001/BR-REG-001, FEAT-013); all structured fields complete; ID attached; email verified (BR-AUTH-001).
- **Success:** Account created in `Pending`; confirmation screen explains next steps (Admin ID verification + approval).
- **Failure/recovery:** Age blocked at registration with explanation (AC-REG-001a). Missing fields shown inline. If rejected later by Admin: see 3.3.
- **Completion state:** `Pending` account awaiting Admin review.
- **Related:** FR-REG-001..012, FR-AUTH-001..003, FR-MEM-001, FEAT-007..013, BR-REG-001..011, BR-AUTH-001..003, AC-REG-001.

### 3.2 Abroad applicant — Geolocation (P11, confirmed mechanics only)

- **Actor:** Applicant registering for the Abroad program.
- **Entry point:** Registration → program selector → "Abroad".
- **Goal:** Prove Abroad location and continue registration.
- **Preconditions:** Program configuration exists (FEAT-068); geolocation mechanics FEAT-014..016 confirmed. Accuracy threshold (FEAT-017) and anti-spoofing (FEAT-018) are **BLOCKED on OD-014/OD-015** and must not be surfaced as enforced controls.
- **Main steps:** (1) Device location requested (browser geolocation — ARCH-DEC-005) with a clear privacy prompt; (2) fallback to IP geolocation if device location unavailable (FR-GEO-002); (3) system determines country.
- **Decisions:** If detected in the **Philippines**, Abroad registration is **blocked** with no bypass except an approved exception (BR-GEO-002, FR-GEO-003).
- **Validation:** Location determination result; exception requests are audited (FR-GEO-006).
- **Success:** Location accepted → continue to registration steps.
- **Failure/recovery:** PH block screen explains the program rule and offers "Request location exception" (FR-GEO-004, FEAT-016) → Admin review → result is audited and communicated.
- **Completion state:** Location verified OR exception submitted for Admin review.
- **Related:** FR-GEO-001..006, FEAT-014..016, FEAT-068, BR-GEO-001..004, AC-GEO-001, OD-014, OD-015.

### 3.3 Applicant — Rejection & Resubmit

- **Actor:** Applicant whose registration was rejected.
- **Entry point:** Notification/email + SCR-AUTH-004 status screen.
- **Goal:** Understand rejection and resubmit.
- **Preconditions:** Account status `Rejected`; Admin rejection reason recorded (BR-REG-004).
- **Main steps:** (1) See mandatory rejection reason; (2) correct the flagged fields; (3) resubmit (FR-REG-005, FEAT-011). Resubmission is **currently unlimited** (BR-REG-005; OD-024 future).
- **Validation:** Mandatory reason present; corrected data revalidated.
- **Success:** Status returns to `Pending` and re-enters Admin review.
- **Failure/recovery:** If fields still invalid, inline errors remain.
- **Completion state:** `Pending`.
- **Related:** FR-REG-004/005, FEAT-011, BR-REG-004/005, AC-REG-001c, OD-024.

### 3.4 Active + Qualified Member — Submit Sale → Qualifying Sale (core revenue path, P4/P5)

- **Actor:** Active + Qualified Member (BR-SAL-001, FEAT-023).
- **Entry point:** Member app → Sales → "Submit sale" (SCR-MEM-006).
- **Goal:** Record a customer sale and progress it to a Qualifying Sale.
- **Preconditions:** Member is Active + Qualified; Admin catalog has properties (FEAT-025); customer record exists or is created (FEAT-024).
- **Main steps:** (1) Select existing customer or record a non-member customer (FR-CUS-001/002); (2) select Property from the Admin catalog — Property Value shown read-only as the snapshot to be recorded (FR-PRP-003, BI-006); (3) review submission summary; (4) submit with `Idempotency-Key`.
- **Decisions:** Which customer; which catalog property.
- **Validation:** Eligible seller (422 `MEMBER_NOT_QUALIFIED` otherwise — API-SPECIFICATION §2.2); property from catalog only; idempotency enforced.
- **Success:** Sale created `Submitted` → visible in member's Sales list.
- **Failure/recovery:** Network failure → retry reuses the same `Idempotency-Key`, never double-submits. Business rejection → see 3.5.
- **Completion state:** `Submitted`, awaiting Admin approval.
- **Related:** FR-SAL-001..004, FR-CUS-001/002, FR-PRP-001..004, FEAT-024..030, BR-SAL-001..004, BR-CUS-001/002, BR-PRP-001..004, AC-SAL-001, AC-COM-001.

### 3.5 Member — Sale Rejection, Correction, Lock

- **Actor:** Active + Qualified Member.
- **Entry point:** Sale detail (SCR-MEM-007) after Admin rejection.
- **Goal:** Correct and resubmit a rejected sale.
- **Preconditions:** Sale `Rejected` with mandatory reason (BR-SAL-005).
- **Main steps:** (1) Read rejection reason; (2) correct applicable information; (3) resubmit (counts toward the configured maximum, FR-SAL-006/BR-SAL-006, FEAT-031).
- **Decisions:** Whether to correct/resubmit; whether to request reopen if locked.
- **Validation:** Resubmission attempts tracked; at the configured maximum the sale is **LOCKED** (FR-SAL-006).
- **Success:** Sale re-enters the approval flow.
- **Failure/recovery:** If `LOCKED`, the member cannot resubmit; the screen explains the state and that reopening requires Admin/Super Admin review (FR-SAL-007, FEAT-032).
- **Completion state:** `Submitted` (again) or `LOCKED`.
- **Related:** FR-SAL-005..007, FEAT-028/031/032, BR-SAL-005..007, AC-SAL-001d/e.

### 3.6 Member — Commission to eWallet (P5/P6)

- **Actor:** Active + Qualified Member (and direct sponsor, where applicable).
- **Entry point:** Qualifying Sale event → commission screens (SCR-MEM-015) and eWallet (SCR-MEM-008).
- **Goal:** See commissions move Pending → Available and into the eWallet.
- **Preconditions:** Qualifying Sale (BR-SAL-004); Direct Commission 8% (BR-COM-001) and/or Direct Referral 4% to direct sponsor (BR-COM-002, BI-003).
- **Main steps:** (1) Commission appears immediately as **Pending** (FR-COM-005); (2) after the configured clearing period (default 7 days, FR-COM-007/BR-COM-007) it becomes **Available** and is credited to eWallet Available Balance (FR-COM-008, BR-CLC-001).
- **Decisions:** None by the member (automatic lifecycle). Cancellation scenarios are staff/system-driven (FR-COM-009/010).
- **Validation:** Pending is never included in Available Balance (FR-COM-006, BI-002); ledger append-only (FR-COM-012, BI-005).
- **Success:** Available Balance reflects cleared commissions.
- **Failure/recovery:** Cancelled (pre-clearing) or Reversed (post-clearing) commissions are shown with the correct status and reference the original immutable transaction (BR-CAN-001/002). If already withdrawn and reversed, Super Admin resolves/recoveries (BR-CAN-003).
- **Completion state:** Commission `Available`, `Cancelled`, or `Reversed`; ledger immutable.
- **Related:** FR-COM-001..012, FEAT-033..040, FR-WAL-001..004, FEAT-042/043, BR-COM-001..007, BR-CLC-001/002, BR-CAN-001..004, BR-LED-001/002, AC-COM-001/002, AC-WAL-001.

### 3.7 Member — Request Withdrawal (P7)

- **Actor:** Member with Available Balance.
- **Entry point:** eWallet (SCR-MEM-008) → "Withdraw" (SCR-MEM-012).
- **Goal:** Withdraw up to Available Balance to a verified payout account.
- **Preconditions:** Available Balance > 0; at least one **verified** payout account (FR-PAY-005, FEAT-046).
- **Main steps:** (1) Review Available Balance and Pending amount (excluded — BI-002); (2) choose a verified payout account (only verified are selectable, FEAT-046); (3) enter amount ≤ Available (FR-WDR-001); (4) confirm — amount is **Reserved** immediately (FR-WDR-002, FEAT-048) and no longer reusable; submission carries `Idempotency-Key`.
- **Decisions:** Which payout account; how much.
- **Validation:** Amount ≤ Available Balance (409 `INSUFFICIENT_BALANCE`); verified account only (422 `PAYOUT_ACCOUNT_UNVERIFIED`); idempotent reservation.
- **Success:** Withdrawal `Reserved`; Available Balance reduced by the reserved amount.
- **Failure/recovery:** Rejection (reason required) releases the reservation and restores the balance; the UI tells the member to create a **new** request — the rejected one cannot be edited or resubmitted (FR-WDR-004/005, BR-WDR-004/005).
- **Completion state:** `Reserved` → `Completed` (permanently deducted) or `Rejected` (released). Final withdrawal status model is **TBD (OD-017/018)**; no invented states.
- **Related:** FR-WDR-001..005, FEAT-046/048/049/050, FR-PAY-001..006, FEAT-044..047, BR-WDR-001..005, BR-PAY-001..006, AC-WDR-001, OD-016..018.

### 3.8 Member — Refer & Sponsor (P3)

- **Actor:** Active + Qualified Member.
- **Entry point:** Referral area (SCR-MEM-003).
- **Goal:** Share a unique referral code and earn Direct Referral commission.
- **Preconditions:** Active + Qualified (BR-REF-003, FEAT-023); unique auto-generated code (BR-REF-004, FEAT-019).
- **Main steps:** (1) View/copy referral code (immutable — BR-REF-004/005, BI-009); (2) share via Messenger/Viber or download permitted materials (FR-ADM-003, FEAT-061); (3) referred member registers with the code (BR-REF-009).
- **Decisions:** Sharing channel.
- **Validation:** Code is unique and member-immutable; relationships are strictly single-level (BR-REF-001/002, BI-003/004).
- **Success:** Direct referrals appear in Direct Referrals (FEAT-064) and My Genealogy (FEAT-067) — reporting only, never implying multi-level commission (BR-RPT-001/004).
- **Failure/recovery:** Sponsor change is NOT a member action; requires Admin approval and audit (BR-REF-007, FEAT-022 — circumstances gated OD-013).
- **Completion state:** Referral relationships persisted and reportable.
- **Related:** FR-REF-001..006, FEAT-019..021/023, FEAT-061/064/067, BR-REF-001..006, BR-RPT-001/004, AC-REF-001, OD-013.

### 3.9 Member — Genealogy & Reporting (P10)

- **Actor:** Member.
- **Entry point:** Reporting area → Direct Referrals (SCR-MEM-016), Group Network (SCR-MEM-017), My Genealogy (SCR-MEM-018).
- **Goal:** Visualize referral network without implying multi-level commissions.
- **Preconditions:** Referral data exists (FEAT-021); ledger exists for Total Earned (FEAT-042).
- **Main steps:** (1) View single-level Direct Referrals (FR-RPT-001); (2) view Group Network as a reporting/network concept only (FR-RPT-002); (3) view My Genealogy tree (FR-RPT-004).
- **Decisions:** Scope of visualization (direct level / network).
- **Validation:** No screen may imply or compute multi-level commission (BI-004).
- **Success:** Clear, honest network visualization.
- **Failure/recovery:** Total Earned (FR-RPT-003) is **BLOCKED on OD-025**; until defined it must exclude pending/non-available funds and its screen is a labeled placeholder.
- **Completion state:** Reporting views consistent with the single-level model.
- **Related:** FR-RPT-001..004, FEAT-064..067, BR-RPT-001..004, BI-004, OD-025.

### 3.10 Admin — Registration Review (P2)

- **Actor:** Admin.
- **Entry point:** Admin app dashboard queue → Registrations (SCR-ADM-002).
- **Goal:** Verify identity and approve or reject a registration.
- **Preconditions:** Registration `Pending`; email verified (BR-AUTH-001); ID uploaded (FR-REG-002).
- **Main steps:** (1) Open registration detail (SCR-ADM-003); (2) review profile + government ID; (3) mark ID verified (POST /members/:id/verify-id); (4) **approve** (→ `Approved-Active`, FR-AUTH-003) or **reject** with **mandatory reason** (FR-REG-004).
- **Decisions:** Verified or not; approve or reject.
- **Validation:** Mandatory reason on rejection (BR-REG-004); only the three confirmed statuses (FR-AUTH-002); action audited (NFR-SEC-002).
- **Success:** Member becomes `Approved-Active`.
- **Failure/recovery:** Rejected member sees the reason and may resubmit (3.3).
- **Completion state:** `Approved-Active` or `Rejected`.
- **Related:** FR-AUTH-002/003, FR-REG-002/004/005, FEAT-007/010/011, BR-AUTH-002/003, BR-REG-002/004/005, AC-REG-001.

### 3.11 Admin — Sale Approval & Payment Verification (P4)

- **Actor:** Admin (and Finance for payment verification).
- **Entry point:** Sales review queue (SCR-ADM-008).
- **Goal:** Approve a submitted sale, then verify payment so it becomes a Qualifying Sale.
- **Preconditions:** Sale `Submitted` by an Active + Qualified seller (BR-SAL-001).
- **Main steps:** (1) Review sale detail (customer, catalog property, snapshotted value, seller) (SCR-ADM-009); (2) **approve** (→ `Admin Approved`) or **reject** with mandatory reason (FR-SAL-002/005); (3) **verify payment** (record-only — BR-BND-001; FR-SAL-003) → sale becomes **Qualifying** (FR-SAL-004, FEAT-030).
- **Decisions:** Approve/reject; verify payment.
- **Validation:** Payment verification restricted to Admin/Finance/Super Admin (FR-SAL-003); rejection reason mandatory; each action audited (NFR-SEC-002).
- **Success:** Qualifying Sale triggers Pending commission creation (FR-COM-005).
- **Failure/recovery:** Locked sale (max resubmissions) → reopen requires Admin/Super Admin review + audit (FR-SAL-007, FEAT-032). Cancellation uses FEAT-037/038 with the cancellation actor **REQUIRES APPROVAL** (API-SPECIFICATION #38).
- **Completion state:** `Qualifying Sale` (or `Rejected`/`LOCKED`).
- **Related:** FR-SAL-001..007, FR-COM-005/009/010, FEAT-027..032/037/038, BR-SAL-001..007, BR-CAN-001/002, AC-SAL-001, AC-COM-001/002.

### 3.12 Admin — Payout Account Verification (P7)

- **Actor:** Admin.
- **Entry point:** Payout verification queue (SCR-ADM-010).
- **Goal:** Verify a member's payout account before use.
- **Preconditions:** Account `Pending` (FR-PAY-004, FEAT-045).
- **Main steps:** (1) Review account details and supporting evidence; (2) verify (→ `Confirmed`) or reject with reason (POST /payout-accounts/:id/verify|reject).
- **Validation:** Only verified accounts usable for withdrawal (FR-PAY-005); audited.
- **Success:** Account `Confirmed`; one may be Primary (FR-PAY-006).
- **Failure/recovery:** Rejected accounts remain unusable until corrected.
- **Completion state:** `Confirmed` (or rejected).
- **Related:** FR-PAY-003..006, FEAT-044/045, BR-PAY-003..006, OD-016.

### 3.13 Staff — Withdrawal Processing (P7)

- **Actor:** Admin / Finance / Super Admin.
- **Entry point:** Withdrawal queue (SCR-ADM-011).
- **Goal:** Complete or reject a reserved withdrawal.
- **Preconditions:** Withdrawal `Reserved` (FR-WDR-002).
- **Main steps:** (1) Review request + verified payout account; (2) confirm external execution → **complete** (record-only, BR-BND-001, FR-WDR-003) or **reject** with reason → release reservation and restore balance (FR-WDR-004).
- **Validation:** Reason mandatory on rejection (BR-WDR-004); audited; no money movement by JAD (BR-BND-001).
- **Success:** `Completed` (permanently deducted) or `Rejected` (released; new request required).
- **Completion state:** Per confirmed lifecycle. Final model TBD (OD-017/018).
- **Related:** FR-WDR-003/004, FEAT-049/050, BR-WDR-003/004, BR-BND-001, AC-WDR-001.

### 3.14 Super Admin — Platform Configuration (P1/P11)

- **Actor:** Super Admin.
- **Entry point:** Config screen (SCR-ADM-019).
- **Goal:** Change business parameters without code (BR-CFG-001, FEAT-005).
- **Main steps:** (1) View current parameters; (2) edit minimum age, gender values, commission rates (8%/4% baselines), clearing period (7-day default), sale resubmission limits, voucher redemption mode (FR-ADM-001); (3) save; changes apply to **future** transactions (BR-COM-007).
- **Validation:** Rates/lifetime exact decimals; validation errors before save; audited change history.
- **Success:** Parameters updated; no redeploy required (NFR-MAINT-001).
- **Failure/recovery:** Invalid values rejected inline.
- **Completion state:** New parameters live for future transactions.
- **Related:** FR-ADM-001, FEAT-005, BR-CFG-001, BR-COM-007, NFR-MAINT-001.

### 3.15 Super Admin — Financial Adjustment (P6)

- **Actor:** Super Admin only (FR-ADJ-001, FEAT-071).
- **Entry point:** Adjustments (SCR-ADM-020).
- **Goal:** Apply a manual credit/debit to a member's ledger.
- **Preconditions:** Super Admin role; exact reason.
- **Main steps:** (1) Select member; (2) choose Credit or Debit; (3) enter exact amount and mandatory reason; (4) confirm (Idempotency-Key; full audit fields: member, amount, credit/debit, reason, performing Super Admin, date/time — FR-ADJ-002).
- **Validation:** Super Admin only (BR-ADJ-001); Available Balance never negative (BI-001); audited.
- **Success:** Ledger entry appended.
- **Failure/recovery:** Amount exceeding balance for a debit → rejected with explanation; balance never goes negative (NFR-ATOM-002).
- **Completion state:** New immutable ledger entry.
- **Related:** FR-ADJ-001/002, FEAT-071, BR-ADJ-001/002, BI-001, AC-ADJ-001.

### 3.16 Merchant — Voucher Redemption (P8)

- **Actor:** Merchant.
- **Entry point:** Merchant portal → login → scan/redeem (SCR-MCH-002).
- **Goal:** Redeem a JAD voucher fully or partially, online, atomically.
- **Preconditions:** Merchant authenticated (MRCH role — API-SPECIFICATION §6.11); voucher presented via QR; online connectivity (BR-VCH-004).
- **Main steps:** (1) Scan QR or enter voucher payload; (2) system verifies signature, authenticity, status, expiration, conditions, remaining balance, history (FR-VCH-005, FEAT-056); (3) confirm redeem amount (full/partial per configuration, FR-VCH-001/002); (4) atomic redemption (FR-VCH-006, BI-007) with `Idempotency-Key`.
- **Decisions:** Redeem amount (partial mode).
- **Validation:** All verification checks pass; atomicity prevents double redemption (NFR-ATOM-001).
- **Success:** Redemption result shows redeemed amount and remaining value.
- **Failure/recovery:** Error codes surface directly (e.g., `VOUCHER_INVALID_SIGNATURE`, `VOUCHER_EXPIRED`, `VOUCHER_ALREADY_REDEEMED`); offline redemption is impossible by design (BR-VCH-004).
- **Completion state:** Redemption recorded; remaining value updated (FEAT-054).
- **Related:** FR-VCH-001..006, FEAT-053..057, BR-VCH-001..006, BI-007, AC-VCH-001, OD-019..023.

### 3.17 Member — Vouchers (P8)

- **Actor:** Member.
- **Entry point:** Vouchers area (SCR-MEM-020).
- **Goal:** View own vouchers and remaining value.
- **Preconditions:** Voucher issued via CTO signing service (FEAT-052); member holds the voucher.
- **Main steps:** (1) List own vouchers (GET /me/vouchers); (2) view detail incl. remaining value (FR-VCH-001/002) and redemption history where permitted.
- **Success:** Accurate voucher state.
- **Failure/recovery:** Transfer/revocation/expiry/permission rules are **TBD (OD-019..023)** — the UI must not expose them until approved (FEAT-058).
- **Completion state:** Voucher state visible and accurate.
- **Related:** FR-VCH-001..003, FEAT-053/054, BR-VCH-001..003, OD-019..023.

### 3.18 Admin — Content, Policies & Broadcasts (P9)

- **Actor:** Admin.
- **Entry point:** Content area (SCR-ADM-014/015/016).
- **Goal:** Manage media, policies/guidelines/T&C, and broadcasts.
- **Main steps:** (1) Upload/manage media incl. photos, videos, ad images, landing pages, promos (FR-ADM-002); (2) manage policies, program guidelines, T&C, company rules (FR-ADM-004); (3) broadcast promotions, training invites (Zoom/Meet), announcements, push (FR-ADM-005).
- **Validation:** Only permitted content is forwardable/downloadable (BR-MKT-002); push depends on external infrastructure (ASSUMPTION 6).
- **Success:** Content live for members/public.
- **Completion state:** Published content; broadcast dispatched.
- **Related:** FR-ADM-002..005, FEAT-060..063, BR-MKT-001/002, BR-NOT-001/002.

### 3.19 Super Admin — Program Configuration (P11, gated)

- **Actor:** Super Admin.
- **Entry point:** Programs (SCR-ADM-022).
- **Goal:** Configure Domestic/Abroad independently (FR-PRG-002, FEAT-068).
- **Preconditions:** Program separation confirmed; **exact rule differences gated OD-001..005** (FEAT-069).
- **Main steps:** Independent configuration of registration rules, qualification questions, geolocation requirements, commission rates, referral rules, incentive rules, eligible properties/products (FR-PRG-002).
- **Completion state:** Program config persisted. Detailed rules remain **BLOCKED** until OD-001..005.
- **Related:** FR-PRG-001/002, FEAT-068/069, BR-PRG-001/002, OD-001..005.

---

## 4. Navigation

### 4.1 Navigation hierarchy

```text
Public (unauthenticated)               Member App              Admin App              Merchant Portal
├─ Landing / marketing (optional)      ├─ Dashboard             ├─ Dashboard (queues)   ├─ Redeem (scan)   ─┐
├─ Register (program choice)           ├─ Sales                 ├─ Registrations        └─ Result          ┘
└─ Login                               ├─ Commissions           ├─ Sales
                                       ├─ eWallet & Ledger      ├─ Payouts
                                       │   ├─ Ledger            ├─ Withdrawals
                                       │   └─ Withdrawals       ├─ Exceptions
                                       ├─ Payout Accounts       ├─ Catalog
                                       ├─ Referrals             ├─ Members
                                       │   ├─ My Code           ├─ Content (Media/Policy/Broadcast)
                                       │   ├─ Direct Referrals  ├─ Vouchers
                                       │   └─ My Genealogy      ├─ Adjustments (SUP)
                                       ├─ Vouchers (P8)         ├─ Programs (SUP, P11)
                                       ├─ News & Content (P9)   ├─ Config (SUP)
                                       ├─ Policies (public)     └─ Audit (SUP)
                                       ├─ Notifications
                                       └─ Profile
```

### 4.2 Primary navigation (CONFIRMED derivation)

- **Member app:** persistent top/side navigation: Dashboard, **Sales & Earnings** (`Sales`, `Qualification`, `Commissions`, `eWallet`/`Ledger`, `Withdrawals`, `Payouts`), `Referrals` (Direct/Group/Genealogy/Total Earned), `Resources` (Vouchers, News, Policies, Notifications), `Profile`. Secondary: reporting (Direct Referrals, Group Network, My Genealogy) nested under Referrals, matching FEAT groups FG-SALES, FG-EWALLET, FG-WDR, FG-PAYOUT, FG-REF, FG-VOUCHER, FG-CONTENT, FG-REPORTING, FG-MEMBERS. `Commissions` sits directly after `Sales` per `Sale → Commission → eWallet` spine `§5.5`.
- **Admin app:** queue-driven: Dashboard, Registrations, Sales, Payouts, Withdrawals, Exceptions, Catalog, Members, Content, Vouchers; Super Admin-only: Adjustments, Config, Programs, Audit. Role visibility per BUSINESS-RULES §3.
- **Merchant portal:** single-purpose flow (redemption + result); no secondary navigation.

### 4.3 Secondary navigation

- In-page tabs for multi-part resources: e.g., Ledger (Available/Pending summary vs full history), Member detail (Profile / Sales / Ledger / Payouts / Withdrawals).
- Contextual: breadcrumbs in deep operational screens (Admin app) and wallet/reporting (Member app).

### 4.4 Contextual navigation

- **Sale detail:** actions surface only when the state permits (e.g., "Resubmit" only when `Rejected`; "Verify payment" only when `Admin Approved`). This mirrors the state models (BUSINESS-RULES §5) and API action endpoints.
- **eWallet:** "Withdraw" surfaces when Available Balance > 0 and a verified account exists; otherwise a helpful explanatory state links to Payouts or Qualification.

### 4.5 Role/permission-dependent navigation

- Member nav item "Submit sale" requires role Member **and** status Active + Qualified (BR-SAL-001). For non-qualified members, show the item disabled with an explanatory link to Qualification status (SCR-MEM-004) — never a 403 dead-end.
- Admin-only and Super Admin-only items are **not rendered** for other staff roles (least privilege, NFR-SEC-001). Finance sees Sales queue (payment verification) and Withdrawals; Finance does **not** see Adjustments/Config (BR-ADJ-001).
- Merchant portal is a separate app; no cross-app navigation.

### 4.6 Mobile navigation behavior

- Member app: bottom navigation for the 5 most frequent destinations (Dashboard, Sales, eWallet, Referrals, Notifications); the rest via a drawer ("More"). 
- Admin app: persistent drawer with queue badges.
- No desktop-layout shrink (see §11 Responsive).

### 4.7 Breadcrumbs / back navigation

- Deep screens (sale detail, ledger, genealogy, registration detail, voucher detail) show a path back to their queue/section. Back must preserve filters/scroll state where practical.

---

## 5. Information Architecture

### 5.1 Content hierarchy

1. **Identity & status first** — the member's membership status, program (Domestic/Abroad), and key financial figures (Available vs Pending) are the top-level, persistent context.
2. **Workflows** — registration, sale, withdrawal, redemption, verification — are step-sequenced flows.
3. **Reference/records** — ledger, commissions, referrals, genealogy — are read-first, layered views.
4. **Governance** — Admin config, programs, policies, audit — are staff-only, permission-gated areas.

### 5.2 Major entities / content areas

| Entity | Screen(s) | Source of truth |
|---|---|---|
| Member / Applicant | SCR-AUTH-002..005, SCR-MEM-002, SCR-ADM-002..005 | FR-MEM-001, FR-REG-* |
| Referral relationship | SCR-MEM-003/016/017/018 | FR-REF-*, FR-RPT-* |
| Property catalog | SCR-ADM-006/007, SCR-MEM-006 (picker) | FR-PRP-* |
| Customer | SCR-MEM-006 (record), SCR-ADM-009 | FR-CUS-* |
| Sale | SCR-MEM-005..007, SCR-ADM-008/009 | FR-SAL-* |
| Commission | SCR-MEM-015, SCR-ADM-018 | FR-COM-* |
| eWallet / Ledger | SCR-MEM-008/009 | FR-WAL-* |
| Payout account | SCR-MEM-010/011, SCR-ADM-010 | FR-PAY-* |
| Withdrawal | SCR-MEM-012..014, SCR-ADM-011/012 | FR-WDR-* |
| Voucher | SCR-MEM-020/021, SCR-MCH-002/003, SCR-ADM-017 | FR-VCH-* |
| Content / Policy / Broadcast | SCR-MEM-022..024, SCR-ADM-014..016 | FR-ADM-002..005 |
| Program config | SCR-ADM-022 | FR-PRG-* |
| Platform config | SCR-ADM-019 | FR-ADM-001 |
| Audit trail | SCR-ADM-021 | FR-ADM-* (NFR-AUD-001) |

### 5.3 Grouping and categorization

- Group by **feature group** (FG-*) to mirror modules and folder structure (FOLDER-STRUCTURE §2.1): Sales under FG-SALES, eWallet+Withdrawals under FG-EWALLET/FG-WDR, etc.
- Staff screens grouped by **workflow**: Verification (IDs, payouts), Approvals (registrations, sales), Exceptions (location, sponsor, locks), Governance (config, adjustments, audit, programs).

### 5.4 Naming conventions

- Screen names and labels match SSOT terminology exactly (e.g., "Active + Qualified", "Qualifying Sale", "Available Balance", "Pending", "Direct Referral", "My Genealogy", "Direct Referrals", "Group Network", "Total Earned").
- Money always labeled with currency (₱) and status when ambiguous (Pending/Available).
- Status labels use the confirmed state vocabulary (BUSINESS-RULES §5).

### 5.5 Relationships between screens

- **Sale → Commission → eWallet → Withdrawal** is the spine: each screen links to its financial consequence (a Qualifying Sale links to its commission entries; a commission entry links to the ledger; the ledger is the source of Available Balance shown on the wallet; the wallet drives withdrawal).
- **Registration → Approval → Member**: Admin actions on a registration flow into the member record.
- **Referral → Genealogy**: referral relationships feed Direct Referrals and My Genealogy (reporting only, BI-004).

---

## 6. Screen Specifications

### 6.1 Screen specification template

| Field | Definition |
|---|---|
| **Screen ID** | Stable ID (`SCR-<APP>-<NNN>`); App codes: `AUTH` (public/member auth), `MEM` (Member app), `ADM` (Admin app), `MCH` (Merchant portal) |
| **Screen name** | SSOT-consistent name |
| **Purpose** | What the user accomplishes |
| **Target user/role** | Roles per BUSINESS-RULES §3 |
| **Entry points** | How the user reaches the screen |
| **Information displayed** | Data/content shown |
| **Primary actions** | Main intent actions |
| **Secondary actions** | Supporting actions |
| **Navigation** | Where the user can go from here |
| **Validation** | Input/eligibility validation applied |
| **Permissions** | RBAC + object-level constraints (NFR-AUTHZ-001/002) |
| **Required states** | BUSINESS-RULES §5 states this screen must render |
| **Related** | FEAT / FR / BR / BI / OD / AC references |

### 6.2 Screen register

Legend: App `A`=AUTH, `M`=Member, `D`=Admin/Back-Office, `C`=Merchant. States listed are the required renderable states. Detailed specs for the starred (\*) screens appear in §6.3.

| ID | Screen | App | Roles | Primary actions | Required states | Related |
|---|---|---|---|---|---|---|
| SCR-AUTH-001 | Login | A | Public/MEM/ADM/SUP/MRCH | Authenticate | — | FEAT-002, FR-AUTH-004 |
| SCR-AUTH-002 \* | Registration | A | Public | Submit registration (program choice, profile, qualification Qs, ID upload, optional referral code) | — | FEAT-007/010/012/013, FR-REG-*, FR-MEM-001 |
| SCR-AUTH-003 | Email verification | A | Public | Verify email | — | FEAT-009, FR-AUTH-001 |
| SCR-AUTH-004 | Registration status / Pending | A | Public | View status; (resubmit if Rejected) | `Pending`, `Rejected`, `Approved-Active` | FEAT-007/011, FR-AUTH-002 |
| SCR-AUTH-005 | Rejection & resubmit | A | Public | Read reason; correct; resubmit | `Rejected` | FEAT-011, FR-REG-004/005, BR-REG-004/005 |
| SCR-MEM-001 \* | Member dashboard | M | MEM, AQ | View summary (balance, queues, news) | — | FEAT-042/043/063, FR-WAL-* |
| SCR-MEM-002 | Profile | M | MEM | Edit profile; view immutable country | — | FEAT-008, FR-MEM-001, BR-REG-010 |
| SCR-MEM-003 | Referral code | M | MEM, AQ | View/copy code; share | — | FEAT-019, FR-REF-001/002, BR-REF-004/005 |
| SCR-MEM-004 | Qualification status | M | MEM | View eligibility checklist | `Pending`, `Approved-Active`, `Rejected` | FEAT-012, FR-REG-008, BR-QUAL-001 |
| SCR-MEM-005 | Sales list | M | AQ | List own sales; filter by status | `Submitted`, `Admin Approved`, `Payment Verified`, `Qualifying Sale`, `Rejected`, `LOCKED` | FEAT-027, FR-SAL-001..004 |
| SCR-MEM-006 \* | Sale submission | M | AQ | Select customer + catalog property; submit (Idempotency-Key) | — | FEAT-024/025/027, FR-CUS-*, FR-PRP-003, FR-SAL-001 |
| SCR-MEM-007 | Sale detail | M | AQ | View; resubmit (if Rejected); request reopen (if LOCKED) | `Submitted`, `Admin Approved`, `Payment Verified`, `Qualifying Sale`, `Rejected`, `LOCKED` | FEAT-028/031/032, FR-SAL-005..007 |
| SCR-MEM-008 \* | eWallet overview | M | MEM | View Available/Pending; start withdrawal | — | FEAT-042/043, FR-WAL-001..004, BI-001/002 |
| SCR-MEM-009 \* | Ledger | M | MEM | Browse append-only ledger (cursor pagination) | — | FEAT-042, FR-WAL-001/002, BI-005 |
| SCR-MEM-010 | Payout accounts | M | MEM | List; set Primary | `Pending`, `Admin Review`, `Confirmed` | FEAT-044, FR-PAY-001/006, BR-PAY-001/006 |
| SCR-MEM-011 | Add payout account | M | MEM | Add account (methods per OD-016) | — | FEAT-044/047, FR-PAY-001/002, BR-PAY-001/002, OD-016 |
| SCR-MEM-012 \* | Withdrawal request | M | MEM | Request up to Available to verified account (Idempotency-Key) | — | FEAT-046/048, FR-WDR-001/002, BR-WDR-001/002 |
| SCR-MEM-013 | Withdrawals list | M | MEM | List own withdrawals | `Requested`, `Reserved`, `Completed`, `Rejected` | FEAT-048/049/050, FR-WDR-* |
| SCR-MEM-014 | Withdrawal detail | M | MEM | View status + reason; start new request (if Rejected) | `Reserved`, `Completed`, `Rejected` | FEAT-048..050, FR-WDR-003..005 |
| SCR-MEM-015 | Commissions list | M | MEM, AQ | List own commissions by status | `Pending`, `Available`, `Cancelled`, `Reversed` | FEAT-033..035, FR-COM-001..008 |
| SCR-MEM-016 | Direct Referrals | M | MEM, AQ | View direct referrals (single-level) | — | FEAT-064, FR-RPT-001, BR-RPT-001 |
| SCR-MEM-017 | Group Network | M | MEM, AQ | View network (reporting only, BI-004) | — | FEAT-065, FR-RPT-002, BR-RPT-002 |
| SCR-MEM-018 \* | My Genealogy | M | MEM, AQ | Tree visualization (no MLM) | — | FEAT-067, FR-RPT-004, BR-RPT-004, BI-004 |
| SCR-MEM-019 | Total Earned | M | MEM | View ledger-defined total | — | FEAT-066, FR-RPT-003, BR-RPT-003, **OD-025 gated** |
| SCR-MEM-020 | Vouchers list | M | MEM | List own vouchers | — | FEAT-053, FR-VCH-001 |
| SCR-MEM-021 | Voucher detail | M | MEM | View voucher + remaining value | — | FEAT-053/054, FR-VCH-001..003 |
| SCR-MEM-022 | Content library | M | MEM | View/download/forward permitted content | — | FEAT-061, FR-ADM-003, BR-MKT-002 |
| SCR-MEM-023 | Policies | M | Public/MEM | View policies, guidelines, T&C | — | FEAT-062, FR-ADM-004 |
| SCR-MEM-024 | Notifications | M | MEM | View broadcasts/announcements | — | FEAT-063, FR-ADM-005 |
| SCR-MEM-025 | Location exception request | M | MEM | Request exception (Abroad) | — | FEAT-016, FR-GEO-004, BR-GEO-003 |
| SCR-MEM-026 | Messages | M | MEM | View own admin-team thread; send/receive text (Realtime) | — | FEAT-072, FR-MEM-002, BR-MSG-001..004 |
| SCR-ADM-001 | Admin dashboard | D | ADM, FIN, SUP | Route to queues; view workload | — | FEAT-003/004, NFR-AUD-001 |
| SCR-ADM-002 | Registration queue | D | ADM | List `Pending` registrations | `Pending` | FEAT-011, FR-REG-004, BR-AUTH-003 |
| SCR-ADM-003 \* | Registration detail | D | ADM | Verify ID; approve/reject (reason) | `Pending`, `Approved-Active`, `Rejected` | FEAT-010/011, FR-REG-002/004, BR-REG-002/004 |
| SCR-ADM-004 | Member list | D | ADM, SUP | List/filter members by status | `Pending`, `Approved-Active`, `Rejected` | FEAT-007, FR-AUTH-002 |
| SCR-ADM-005 | Member detail | D | ADM, SUP | Assign sponsor; view ledger; sponsor change (OD-013 gated) | — | FEAT-020/022/042, FR-REF-006/007, FR-WAL-001 |
| SCR-ADM-006 | Property catalog | D | ADM | List catalog | — | FEAT-025, FR-PRP-001..003 |
| SCR-ADM-007 | Property edit | D | ADM | Create/edit catalog entry (value snapshots preserved) | — | FEAT-025/026, FR-PRP-001/004, BI-006 |
| SCR-ADM-008 \* | Sales review queue | D | ADM, FIN, SUP | List sales; filter by state; approve/reject/verify payment | `Submitted`, `Admin Approved`, `Payment Verified`, `Qualifying Sale`, `Rejected`, `LOCKED` | FEAT-028..032, FR-SAL-002..007 |
| SCR-ADM-009 \* | Sale detail (staff) | D | ADM, FIN, SUP | Approve; reject (reason); verify payment; reopen; cancel | Same states as queue | FEAT-028..032/037/038, FR-SAL-*, FR-COM-009/010 |
| SCR-ADM-010 | Payout verification queue | D | ADM | Verify/reject payout accounts | `Pending`, `Admin Review`, `Confirmed` | FEAT-045, FR-PAY-003/004 |
| SCR-ADM-011 | Withdrawal queue | D | ADM, FIN, SUP | Complete/reject withdrawals | `Reserved`, `Completed`, `Rejected` | FEAT-049/050, FR-WDR-003/004 |
| SCR-ADM-012 | Withdrawal detail | D | ADM, FIN, SUP | Review + complete/reject (reason) | `Reserved`, `Completed`, `Rejected` | FEAT-049/050, FR-WDR-003/004, BR-BND-001 |
| SCR-ADM-013 | Location exceptions | D | ADM | Review/decide exceptions | — | FEAT-016, FR-GEO-005/006, BR-GEO-003/004 |
| SCR-ADM-014 | Media management | D | ADM | Upload/manage media | — | FEAT-060, FR-ADM-002, BR-MKT-001 |
| SCR-ADM-015 | Policies management | D | ADM | Create/update policies, guidelines, T&C | — | FEAT-062, FR-ADM-004, BR-NOT-001 |
| SCR-ADM-016 | Broadcasts | D | ADM | Create broadcasts/push | — | FEAT-063, FR-ADM-005, BR-NOT-002 |
| SCR-ADM-016a | Messages inbox | D | ADM | One row per member; open thread; reply | — | FEAT-072, FR-ADM-006, BR-MSG-001..004 |
| SCR-ADM-016b | Conversation detail | D | ADM | Member thread; staff composer; live updates | — | FEAT-072, FR-ADM-006, BR-MSG-001..004 |
| SCR-ADM-017 | Voucher management | D | ADM, SUP | Issue voucher (via signing); view redemption history | — | FEAT-052/054, FR-SEC-001..003, FR-VCH-003 |

> **SCR-ADM-017 implemented (ADR-014, 2026-09-15):** admin **Vouchers** list (voucher
> definitions: title, value, assigned count), **Create Voucher** dialog (title + value only —
> no member select), voucher **detail** (definition + assignments table, **Assign to Member**
> dialog with member + expiry/validity, per-assignment local QR, copy/download, Revoke), and
> the **Scan Voucher QR** camera page (`/admin/vouchers/scan`) that verifies a code then
> confirms full redemption. Scanning supports the camera, manual code entry, and **uploading
> a QR image** (decoded client-side via jsQR). The P8 signing/merchant flow is future.
| SCR-ADM-018 | Commissions (staff) | D | ADM, FIN, SUP | List/filter commissions | `Pending`, `Available`, `Cancelled`, `Reversed` | FEAT-033..040, FR-COM-001..012 |
| SCR-ADM-019 \* | Platform config | D | SUP | Edit business parameters (BR-CFG-001) | — | FEAT-005, FR-ADM-001, BR-CFG-001 |
| SCR-ADM-020 \* | Financial adjustments | D | SUP | Apply credit/debit with reason | — | FEAT-071, FR-ADJ-001/002, BR-ADJ-001/002 |
| SCR-ADM-021 | Audit log | D | SUP | Browse immutable audit trails | — | FEAT-004, NFR-AUD-001, BR-GEO-004/ADJ-002/SAL-007/REF-007 |
| SCR-ADM-022 | Programs config | D | SUP | Configure Domestic/Abroad independently | — | FEAT-068/069, FR-PRG-001/002, **OD-001..005 gated** |
| SCR-MCH-002 \* | Voucher redemption | C | MRCH | Scan QR; redeem full/partial (Idempotency-Key) | — | FEAT-053/055/056/057, FR-VCH-001..006, BI-007 |
| SCR-MCH-003 | Redemption result | C | MRCH | Confirm redemption; show remaining value | — | FEAT-053/057, FR-VCH-002/006, AC-VCH-001 |

### 6.3 Detailed screen specifications (key screens)

#### SCR-AUTH-002 — Registration
| Field | Value |
|---|---|
| **Purpose** | Collect registration and route the applicant to `Pending`. No purchase step (BR-REG-006). |
| **Target user/role** | Public applicant. |
| **Entry points** | Public landing → Register; referral/shared link (prefills optional referral code, BR-REG-009). |
| **Information displayed** | Multi-step form: (1) program choice (Domestic; Abroad per P11); (2) profile fields (FR-MEM-001) incl. DOB/age, Gender (config values, BR-REG-011), Country (structured, read-only per BR-REG-010); (3) qualification questions (FR-REG-003); (4) optional referral code (BR-REG-009); (5) government ID upload (FR-REG-002); (6) email + verification (FR-AUTH-001). |
| **Primary actions** | Continue/Next; Submit; Verify email. |
| **Secondary actions** | Back; save-and-return (if supported); help text. |
| **Navigation** | On success → SCR-AUTH-004; login link. |
| **Validation** | Age ≥ configured minimum (default 18, FEAT-013); all required fields; ID attached; referral code optional and validated if present (unique). |
| **Permissions** | PUBLIC (endpoint #1). |
| **Required states** | Form step states; age-block screen (AC-REG-001a); email-verified gate. |
| **Related** | FEAT-007/010/012/013, FR-REG-001..012, FR-MEM-001, FR-AUTH-001, BR-REG-001..011, BR-AUTH-001, AC-REG-001. |

#### SCR-MEM-001 — Member dashboard
| Field | Value |
|---|---|
| **Purpose** | At-a-glance status, money summary, and entry into all member workflows. |
| **Target user/role** | Member, Active + Qualified Member. |
| **Entry points** | Member app root after login. |
| **Information displayed** | Membership status (Pending/Approved-Active/Rejected); program; Available Balance vs Pending (clearly separated, BI-002); recent ledger entries; recent sales/withdrawal states; broadcast notifications (FEAT-063); qualification checklist if not yet Active + Qualified (FEAT-012). |
| **Primary actions** | Withdraw (if eligible); Submit sale (AQ only); view ledger. |
| **Secondary actions** | Profile; referral code; policies; content. |
| **Navigation** | All member sections. |
| **Validation** | Balance figures exact decimals; never negative (BI-001). |
| **Permissions** | MEM; object-level (own data only, NFR-AUTHZ-002). |
| **Required states** | Loading/empty/error per §10; eligibility-gated actions. |
| **Related** | FEAT-042/043/063/012, FR-WAL-001..004, FR-ADM-005, FR-REG-008, BI-001/002. |

#### SCR-MEM-006 — Sale submission
| Field | Value |
|---|---|
| **Purpose** | Record a customer sale against a catalog property and submit for approval. |
| **Target user/role** | Active + Qualified Member (BR-SAL-001). |
| **Entry points** | Sales list → Submit sale. |
| **Information displayed** | Customer selector (new or existing, FR-CUS-001/002); property picker from Admin catalog (FR-PRP-003) with read-only **Property Value** snapshot (BR-PRP-004, BI-006); submission summary; expected commission preview (8% Direct / 4% Direct Referral — configurable, FR-COM-001/002). |
| **Primary actions** | Submit (Idempotency-Key, API-SPECIFICATION §5.3). |
| **Secondary actions** | Save customer draft; cancel. |
| **Navigation** | On success → sale detail; back to Sales list. |
| **Validation** | Seller eligible (422 `MEMBER_NOT_QUALIFIED`); property from catalog; customer fields complete; idempotency prevents double-submit (BI-007 spirit; FR-SAL-001). |
| **Permissions** | AQ (endpoint #30); object-level. |
| **Required states** | Loading/empty catalog state (no properties → explanatory + link to catalog for Admin). |
| **Related** | FEAT-024/025/027, FR-CUS-001/002, FR-PRP-001..004, FR-SAL-001, FR-COM-001/002, BR-SAL-001, BR-PRP-003/004, AC-SAL-001. |

#### SCR-MEM-012 — Withdrawal request
| Field | Value |
|---|---|
| **Purpose** | Request a withdrawal up to Available Balance to a verified payout account. |
| **Target user/role** | Member. |
| **Entry points** | eWallet → Withdraw. |
| **Information displayed** | Available Balance (with Pending shown separately and excluded — BI-002); verified payout accounts (only verified selectable, FEAT-046/FR-PAY-005); amount input; reservation explanation ("amount will be reserved immediately", FR-WDR-002). |
| **Primary actions** | Confirm withdrawal (Idempotency-Key). |
| **Secondary actions** | Manage payout accounts; view withdrawal history. |
| **Navigation** | Success → withdrawal detail; back to eWallet. |
| **Validation** | Amount ≤ Available (409 `INSUFFICIENT_BALANCE`); verified account only (422 `PAYOUT_ACCOUNT_UNVERIFIED`); exact decimal amount; idempotent reservation (BR-WDR-002). |
| **Permissions** | MEM (endpoint #54); object-level. |
| **Required states** | No verified account → empty/guidance state linking to Add payout account (OD-016 for methods). |
| **Related** | FEAT-046/048, FR-WDR-001/002, FR-PAY-005, BR-WDR-001/002, BR-PAY-005, AC-WDR-001. |

#### SCR-MEM-009 — Ledger
| Field | Value |
|---|---|
| **Purpose** | Browse the member's immutable financial ledger. |
| **Target user/role** | Member. |
| **Entry points** | eWallet → Ledger. |
| **Information displayed** | Append-only ledger entries: Direct Commission, Direct Referral, Withdrawal, Withdrawal Reservation/Completion/Reversal, Commission Reversal, Financial Adjustment (FR-WAL-002); cursor pagination (API-SPECIFICATION §4); running balance with status. |
| **Primary actions** | Paginate (cursor); filter by type/status (allowlisted keys). |
| **Secondary actions** | Export (if approved later — **REQUIRES APPROVAL**); jump to related commission/sale. |
| **Navigation** | Related records; back to eWallet. |
| **Validation** | Cursor pagination; no unbounded responses (API-SPECIFICATION §4). |
| **Permissions** | MEM own ledger (endpoint #44; staff view #47 in admin). |
| **Required states** | Loading; empty (no transactions yet); error; pagination. |
| **Related** | FEAT-042, FR-WAL-001/002, BR-WAL-001, BI-005, AC-WAL-001. |

#### SCR-MEM-018 — My Genealogy
| Field | Value |
|---|---|
| **Purpose** | Visualize the member's referral tree as **reporting only** (FR-RPT-004). |
| **Target user/role** | Member, Active + Qualified Member. |
| **Entry points** | Referrals → My Genealogy. |
| **Information displayed** | Tree of direct referrals (single-level relationships, FR-REF-003); group network view (FR-RPT-002) rendered as a network concept only. |
| **Primary actions** | Expand/collapse; filter by status; jump to Direct Referrals list. |
| **Secondary actions** | Export (REQUIRES APPROVAL). |
| **Navigation** | Related reporting screens. |
| **Validation** | Never implies/computes multi-level commission (BI-004; BR-RPT-004). |
| **Permissions** | MEM own genealogy (endpoint #77). |
| **Required states** | Loading; empty; large-tree virtualization. |
| **Related** | FEAT-067/065/064, FR-RPT-001/002/004, BR-RPT-001/002/004, BI-004. |

#### SCR-ADM-003 — Registration detail
| Field | Value |
|---|---|
| **Purpose** | Review and decide a registration. |
| **Target user/role** | Admin. |
| **Entry points** | Registration queue → item. |
| **Information displayed** | Applicant profile (FR-MEM-001); program; email-verified status (BR-AUTH-001); government ID document; qualification answers; rejection history with reasons (BR-REG-004). |
| **Primary actions** | Verify ID (POST verify-id); Approve (→ `Approved-Active`, FR-AUTH-003); Reject with **mandatory reason** (FR-REG-004). |
| **Secondary actions** | Return to queue; view audit entry (NFR-SEC-002). |
| **Navigation** | Member detail after approval. |
| **Validation** | Reason required for rejection; statuses limited to the three confirmed values (FR-AUTH-002); audited. |
| **Permissions** | ADM (endpoints #10..12). |
| **Required states** | `Pending` (in review); post-decision states. |
| **Related** | FEAT-010/011, FR-REG-002/004/005, FR-AUTH-002/003, BR-REG-002/004, BR-AUTH-003, AC-REG-001. |

#### SCR-ADM-009 — Sale detail (staff)
| Field | Value |
|---|---|
| **Purpose** | Review and act on a sale. |
| **Target user/role** | Admin, Finance, Super Admin (role-scoped actions). |
| **Entry points** | Sales queue → item. |
| **Information displayed** | Seller (Active + Qualified, BR-SAL-001); customer; catalog property + snapshotted value (BI-006); payment record (record-only, BR-BND-001); state; resubmission count (FR-SAL-006); rejection/lock history. |
| **Primary actions** | Approve (ADM); Reject with reason (ADM); Verify payment (ADM/FIN/SUP → Qualifying, FR-SAL-004); Reopen (ADM/SUP, FR-SAL-007); Cancel (ADM/SUP, FEAT-037/038 — actor **REQUIRES APPROVAL**, API-SPECIFICATION #38). |
| **Secondary actions** | View related commission/ledger entries. |
| **Validation** | Action shown only when the state permits; reason mandatory on rejection; audited. |
| **Permissions** | ADM/FIN/SUP per endpoint #31..38; object-level for member's own view. |
| **Required states** | `Submitted`, `Admin Approved`, `Payment Verified`, `Qualifying Sale`, `Rejected`, `LOCKED`. |
| **Related** | FEAT-028..032/037/038, FR-SAL-002..007, FR-COM-009/010, BR-SAL-002..007, BR-CAN-001/002, AC-SAL-001. |

#### SCR-ADM-019 — Platform config
| Field | Value |
|---|---|
| **Purpose** | Edit business parameters without code (BR-CFG-001, FEAT-005). |
| **Target user/role** | Super Admin. |
| **Entry points** | Admin app → Config. |
| **Information displayed** | Parameters: minimum age, gender values, commission rates (8%/4% baselines), clearing period (7-day default), sale resubmission limits, voucher redemption mode (FR-ADM-001). |
| **Primary actions** | Edit; Save (applies to future transactions only — BR-COM-007); View change history. |
| **Secondary actions** | Reset to current values; audit link. |
| **Navigation** | Dashboard; Programs config (SCR-ADM-022). |
| **Validation** | Exact decimals for rates; allowed ranges; validation before save (API-SPECIFICATION §1.3). |
| **Permissions** | SUP (endpoints #81..83). |
| **Required states** | Loading (config fetch); save success/failure. |
| **Related** | FEAT-005, FR-ADM-001, BR-CFG-001, BR-COM-007, NFR-MAINT-001. |

> **SCR-ADM-019 implemented (2026-09-15):** edits persist via `PATCH /admin/config/:key`
> (super_admin-only, server-audited); other staff roles get a read-only view with no Edit
> affordance.

#### SCR-ADM-020 — Financial adjustments
| Field | Value |
|---|---|
| **Purpose** | Apply a manual credit/debit to a member's ledger. |
| **Target user/role** | Super Admin only (FR-ADJ-001). |
| **Entry points** | Admin app → Adjustments. |
| **Information displayed** | Member selector; current Available Balance; adjustment form (Credit/Debit, amount, mandatory reason); adjustment history. |
| **Primary actions** | Apply adjustment (Idempotency-Key; audit fields per FR-ADJ-002). |
| **Secondary actions** | View member ledger; view audit trail. |
| **Navigation** | Audit log; member detail. |
| **Validation** | Super Admin only; exact decimal amount; debit cannot exceed balance (BI-001, NFR-ATOM-002); reason mandatory. |
| **Permissions** | SUP (endpoints #45/46). |
| **Required states** | Confirmation dialog (irreversible); success/error states. |
| **Related** | FEAT-071, FR-ADJ-001/002, BR-ADJ-001/002, BI-001, AC-ADJ-001. |

#### SCR-MCH-002 — Voucher redemption
| Field | Value |
|---|---|
| **Purpose** | Redeem a JAD voucher online, fully or partially, atomically (BR-VCH-004/006). |
| **Target user/role** | Merchant. |
| **Entry points** | Merchant portal → Redeem. |
| **Information displayed** | QR scan input (camera or manual payload entry); voucher verification result; redeem amount (full/partial per configuration, FR-VCH-001/002); remaining value. |
| **Primary actions** | Scan/enter payload; Redeem (Idempotency-Key). |
| **Secondary actions** | Clear/reset; report issue. |
| **Navigation** | Result screen (SCR-MCH-003); login. |
| **Validation** | Signature/authenticity/status/expiration/conditions/balance/history verification (FR-VCH-005); atomic single redemption (FR-VCH-006, BI-007, NFR-ATOM-001); offline impossible (BR-VCH-004). |
| **Permissions** | MRCH (endpoint #63). |
| **Required states** | Scanning; verifying; success; error mapped to voucher error codes (API-SPECIFICATION §3). |
| **Related** | FEAT-053/055/056/057, FR-VCH-001..006, BR-VCH-001..006, BI-007, AC-VCH-001, OD-019..023. |

---

## 7. Screen coverage vs features (summary)

| Feature group | Member app screens | Admin app screens | Merchant screens |
|---|---|---|---|
| FG-PLATFORM | SCR-AUTH-001, SCR-MEM-001 | SCR-ADM-001, SCR-ADM-021 | — |
| FG-MEMBERS | SCR-AUTH-002..005, SCR-MEM-002/004 | SCR-ADM-002..005 | — |
| FG-REF | SCR-MEM-003/016/017/018 | SCR-ADM-005 (sponsor actions) | — |
| FG-CATALOG | SCR-MEM-006 (picker) | SCR-ADM-006/007 | — |
| FG-SALES | SCR-MEM-005..007 | SCR-ADM-008/009 | — |
| FG-COMMISSION | SCR-MEM-015 | SCR-ADM-018 | — |
| FG-EWALLET | SCR-MEM-001/008/009 | SCR-ADM-020 (adjustments) | — |
| FG-PAYOUT | SCR-MEM-010/011 | SCR-ADM-010 | — |
| FG-WDR | SCR-MEM-012..014 | SCR-ADM-011/012 | — |
| FG-BND | (record-only; reflected in withdrawal/payment views) | SCR-ADM-009/011/012 | — |
| FG-VOUCHER | SCR-MEM-020/021 | SCR-ADM-017 | SCR-MCH-002/003 |
| FG-SECURITY | — | SCR-ADM-017 (issue via signing) | (verification only) |
| FG-CONTENT | SCR-MEM-022/023/024 | SCR-ADM-014/015/016 | — |
| FG-REPORTING | SCR-MEM-016/017/018/019 | — | — |
| FG-PROGRAMS | SCR-MEM-025 (geo exception) | SCR-ADM-022 | — |
| FG-CONFIG | — | SCR-ADM-019 | — |

> **Coverage note:** Every feature with a user-facing capability maps to at least one screen. Gated features (FEAT-017/018/022/041/047/051/058/066/069) map to screens that exist only as placeholders until their OD decisions are approved.

---

## 8. Interaction Patterns

### 8.1 Create / Edit / Delete

- **Create:** consistent form pattern (see §9). Creates map to `POST`; non-financial edits map to `PATCH` (API-SPECIFICATION §1.2).
- **Edit:** restricted to **mutable, non-financial** fields (e.g., profile fields except Country — BR-REG-010; payout account primary designation — FR-PAY-006; policies — FR-ADM-004). Financial records are **never editable or deletable** (FR-COM-012, BI-005) — there is **no edit/delete affordance** on ledger, commissions, or any financial record.
- **Delete:** `DELETE` is allowed only on reversible, approved resources (API-SPECIFICATION §1.2). Where permitted, destructive delete requires the standard destructive-action confirmation (§8.5). Nothing financial is deletable.

### 8.2 Search / Filter / Sort

- Member and Admin lists support filtering by allowlisted keys and statuses (API-SPECIFICATION §4); sorting only by allowlisted fields. Filters are persistent per staff queue.
- Global search is a **PROPOSED enhancement** (REQUIRES APPROVAL) — not required by any confirmed feature.

### 8.3 Selection

- Radio for single choice; checkboxes for multi-select; catalog/property and payout-account pickers are constrained (catalog only — BR-PRP-003; verified only — FR-PAY-005).
- Money selection uses exact decimal inputs, never slider-based money.

### 8.4 Confirmation

- Required for all **irreversible** or high-impact actions: submit sale (snapshots value, BI-006), request withdrawal (reserves funds, FR-WDR-002), apply financial adjustment, redeem voucher, approve/reject/reopen/cancel any sale, issue voucher.
- Confirmations restate the consequence in plain language and include the affected amount/record.

### 8.5 Destructive actions

- Destructive = irreversible or financially consequential (rejections, cancellations, adjustments, reopening, voucher issue/redemption). Pattern: explicit action → typed/acknowledged confirmation → **mandatory reason field** (BR-REG-004, BR-SAL-005, BR-WDR-004) → audited result (NFR-SEC-002). No "undo" for financial records (BI-005); corrections are new transactions (BR-LED-002).

### 8.6 Pagination

- Member ledger and other financial streams: **cursor pagination** (API-SPECIFICATION §4) with loading state and preserved position.
- Admin lists: **page-based** pagination (`page`/`pageSize`), with counts. Never unbounded responses.

### 8.7 Tabs

- Used for multi-part entities (Ledger summary vs history; Member detail profile/sales/ledger). Tabs never hide conflicting states; the tab label reflects SSOT state vocabulary.

### 8.8 Dropdowns

- Used for constrained selection (Gender from config — BR-REG-011; program choice; payout account; property from catalog). Config-driven options come from the config service (FEAT-005); the UI never hard-codes configurable values.

### 8.9 Tooltips

- Help context for eligibility gates and financial semantics (e.g., "Pending commissions are not available for withdrawal — BI-002"). Tooltips never contain the sole source of critical info; they complement visible labels.

### 8.10 Expand / collapse

- Dense records (ledger entry details, genealogy branches, audit entries) use progressive disclosure. Default = collapsed; key data (amount, status, date) always visible.

### 8.11 Navigation

- See §4. Cross-section links preserve context (e.g., ledger entry → related sale → commission).

### 8.12 Feedback

- All mutations produce inline feedback (toast/alert per DESIGN-SYSTEM.md §6). Failure feedback maps the API error code to an actionable message (§10). Success feedback states the new record/status (e.g., "Withdrawal requested — ₱12,000.00 reserved").

---

## 9. Forms

### 9.1 Form structure

- Single-column forms on mobile; two-column only for compact non-financial fields on desktop.
- Fields grouped in logical sections (identity, contact, financial, documents) with section headings matching SSOT terms.
- The most important action (submit) is the primary button; cancel/back is secondary and never destructive.

### 9.2 Labels

- Visible labels always (never placeholder-only). Required fields marked; optional fields clearly labeled "Optional" (e.g., referral code — BR-REG-009, profile photo — FR-MEM-001).

### 9.3 Required / optional fields

- Derived from requirements: profile fields per FR-MEM-001; qualification questions required (FR-REG-003); ID required (FR-REG-002); referral code optional (BR-REG-009); profile photo optional (FR-MEM-001); rejection/adjustment reasons mandatory (BR-REG-004, BR-SAL-005, BR-WDR-004, FR-ADJ-002).

### 9.4 Validation

- Client-side validation for format/bounds (age, exact-decimal money, phone/email) mirrors server Zod schemas (API-SPECIFICATION §1.3). Business validation (eligibility, balance, status) is **server-authoritative**; the UI surfaces server messages verbatim.

### 9.5 Inline errors

- Errors appear inline at the offending field plus a form-level summary. Server error codes map to readable text; retry-safe submissions use the same `Idempotency-Key`.

### 9.6 Submission behavior

- Submissions that carry `Idempotency-Key` (sales, withdrawals, redemptions, adjustments) are single-submit; the button disables while pending; retries reuse the key (API-SPECIFICATION §5.3). Show a clear "submitting" state; never allow a second concurrent submit.

### 9.7 Unsaved changes

- Leaving a form with unsaved changes triggers a confirm dialog. This is especially important where data entry is long (registration, sale submission, adjustment).

### 9.8 Disabled states

- Fields/actions disabled when ineligible, with an adjacent explanation and, where applicable, a link to the qualifying screen (e.g., sale submission disabled for non-AQ members → Qualification status). Never disable without explanation.

### 9.9 Accessibility requirements

- Labels associated programmatically; error messages linked to fields (`aria-describedby`); focus moves to the first error; forms operable by keyboard and assistive tech (see §12 and DESIGN-SYSTEM.md §7).

---

## 10. UI States

Standard states, their triggers, and required content. States are PROPOSED platform standards (no approved NFR targets); the *trigger* mapping to API error codes is CONFIRMED from API-SPECIFICATION §3.

| State | When | Required behavior |
|---|---|---|
| **Initial** | Screen load, no data fetched yet | Skeleton or structured placeholder; never blank. |
| **Loading** | Data fetching / mutation in flight | Visible progress; submit buttons disabled during idempotent submits; no double-submit. |
| **Empty** | No records yet (e.g., no sales, no withdrawals, no ledger entries) | Friendly empty state with the primary action to begin (e.g., "Submit your first sale"). Financial empty states must not imply balance (Available = ₱0.00 is a valid, shown state). |
| **Error** | API error | Map error code → readable message (API-SPECIFICATION §3); keep entered data; offer retry (reusing Idempotency-Key where applicable). |
| **Validation** | Input invalid | Inline errors; focus first invalid field; form summary. |
| **Success** | Mutation succeeded | Positive feedback with resulting record/status/amount. |
| **Disabled** | Ineligible action | Explain why + link to remedy (see §9.8). |
| **Unauthorized / forbidden** | 401 / 403 (session invalid, role/eligibility/ownership) | For 401: route to login preserving intended destination. For 403: clear message; never reveal existence of other members' records (404 hides others' resources — API-SPECIFICATION §1.2, §8). |
| **Network failure** | Offline / request failed | Offline banner; retry preserves in-progress form and Idempotency-Key; no data loss. |
| **Partial data** | Ledger/commission partly unavailable | Show available summary with explicit "partial" indicator; never present partial as complete. |
| **Confirmation** | Pre-destructive/high-impact action | Confirmation dialog restating consequence (§8.4). |
| **Destructive action** | Rejection/cancellation/adjustment/redemption | Mandatory reason input; typed confirmation; audit acknowledgment (NFR-SEC-002). |

---

## 11. Responsive Behavior

Approach: **adaptive, not shrink-to-fit.** Each app is designed per breakpoint (DESIGN-SYSTEM.md §5). Viewport targets: mobile (< 640px), tablet (640–1023px), desktop (≥ 1024px) — **PROPOSED breakpoints (REQUIRES APPROVAL)**.

### 11.1 Desktop (≥ 1024px)

- Persistent side/top navigation; multi-column layouts for queues, tables, dashboards.
- Dense tables with sortable columns (Admin queues, ledger, commissions).

### 11.2 Tablet (640–1023px)

- Collapsible navigation (drawer); 2-column layouts collapse to 1–2; tables scroll horizontally or convert critical columns to cards.

### 11.3 Mobile (< 640px)

- Bottom navigation (Member app) / drawer (Admin app); single-column forms; **tables become stacked cards** (key fields first: status, amount, date); modals become full-screen sheets; touch targets ≥ 44px; money values always fully visible (never truncated without a detail view).

### 11.4 Different viewports / overflow

- Financial tables never horizontally scroll on mobile without a card fallback; long ledger rows wrap or expand (progressive disclosure); large trees (genealogy) virtualize.

### 11.5 Touch interaction

- Primary actions reachable with thumb (bottom placement on mobile); swipe is optional and never the only path; no hover-only affordances.

### 11.6 Keyboard interaction

- All actions reachable by keyboard (Tab order logical, Enter/Space activate); visible focus (see §12). Admin approval screens support keyboard-only review.

### 11.7 Tables / data-dense interfaces

- Column priority collapse on small screens: keep status, amount, date; hide secondary columns behind expand.

### 11.8 Forms

- Single column; inputs full width; numeric/money keyboards on mobile; autofill supported for identity fields where permitted by privacy (NFR-CONF-001, NFR-DATA-001).

### 11.9 Navigation

- Mobile patterns per §4.6; no hidden hamburger-only menus on desktop.

### 11.10 Dialogs / modals

- Full-screen on mobile; centered dialog on desktop; never render destructive confirmations without the standard confirmation pattern (§8.4/§8.5).

### 11.11 Overflow / content wrapping

- Money and statuses never wrap mid-token; long text truncates with expand; dates use a single approved format per locale.

---

## 12. Accessibility

> **Status:** No accessibility NFR exists in REQUIREMENTS.md. The following are **PROPOSED platform standards (RECOMMENDED — REQUIRES APPROVAL)**. They apply to all three apps from P1 forward.

### 12.1 Semantic HTML
- Use native landmarks (header, nav, main, aside, footer), headings in hierarchy, and native form controls before custom widgets.

### 12.2 Keyboard navigation
- Complete keyboard operability: logical tab order, Enter/Space activation, Escape closes dialogs, arrow keys for menus/tabs/tree. No keyboard traps.

### 12.3 Focus management
- Visible focus indicator (WCAG-2.1 AA); focus moves sensibly on dialog open/close, inline error, and state changes; skip-to-content link.

### 12.4 Screen readers
- Meaningful accessible names for all controls; status/state changes announced (aria-live for success/error/toast); tables with proper headers; icons with text alternatives.

### 12.5 Labels
- Visible, programmatically-associated labels (§9.2); error messages linked to fields (aria-describedby).

### 12.6 Error messaging
- Errors announced and focusable; color is never the only indicator (also use icon + text).

### 12.7 Contrast
- Text and interactive components meet WCAG-2.1 AA contrast (see DESIGN-SYSTEM.md §7.1).

### 12.8 Touch targets
- Interactive targets ≥ 44px (DESIGN-SYSTEM.md §7.3); adequate spacing between targets.

### 12.9 Reduced motion
- Respect `prefers-reduced-motion`: animations disabled/curtailed; no essential info conveyed by motion.

### 12.10 Accessible dialogs/forms/tables
- Dialogs: focus management, role=dialog, aria-modal, Escape. Forms/tables per above. `prefers-reduced-data` considered where image-heavy (PROPOSED).

---

## 13. UX Constraints

### 13.1 Known constraints (CONFIRMED derivation)
- **No money movement / no payment gateway / no refunds:** withdrawal and payment screens are **record-only** (BR-BND-001..003); no checkout, no card entry, no wallet-API UI.
- **Financial immutability:** no edit/delete UI on any financial record (FR-COM-012, BI-005); corrections via new transactions (BR-LED-002).
- **Pending ≠ Available:** every money view separates Pending from Available (BI-002); no UI implies Pending is spendable.
- **Balance non-negative:** withdrawal amounts capped at Available (BR-WDR-001, BI-001); UI never offers to exceed it.
- **Mandatory reasons** on member/sale/withdrawal rejection and adjustments (BR-REG-004, BR-SAL-005, BR-WDR-004, FR-ADJ-002).
- **Object-level privacy:** members see only own data; 404 for others' resources (NFR-AUTHZ-002, API-SPECIFICATION §1.2).
- **Country immutable** (BR-REG-010); **referral code immutable** (BR-REF-004/005, BI-009).
- **No purchase step** anywhere in registration (BR-REG-006).
- **No MLM:** genealogy/group-network UI must not imply commission entitlement (BI-004).

### 13.2 Technical constraints affecting UX
- **Responsive web only** for MVP (ARCH-DEC-005, CONFIRMED); browser geolocation for Abroad (FR-GEO-001) — accuracy/spoofing gated (OD-014/015).
- **Session cookies (HttpOnly)** — no client-side tokens; the UI relies on server sessions and refresh (ARCH-DEC-007).
- **Rate limiting** on auth and redemption (API-SPECIFICATION §5.2) — the UI must handle 429 with backoff messaging.
- **Idempotency-Key** required on sale/withdrawal/redemption/adjustment submits (API-SPECIFICATION §5.3) — the UI generates and persists keys.
- **CORS allowlist** (API-SPECIFICATION §8) — all apps are first-party origins.

### 13.3 Business constraints affecting UX
- Eligibility gating: sale submission and sponsoring require Active + Qualified (BR-SAL-001, BR-REF-003); UI reflects this with disabled states and links to qualification (FR-REG-008).
- Withdrawal requires a **verified** payout account (FR-PAY-005); provider set gated on OD-016.
- Voucher redemption is **online-only and atomic** (BR-VCH-004/006) — no offline mode, and simultaneous attempts produce exactly one success (BI-007).
- Staff actions are audited (NFR-SEC-002); every staff decision screen implies an audit record.

### 13.4 Accessibility constraints
- No approved accessibility NFR (see §12); contrast/focus/touch/reduced-motion standards are PROPOSED and REQUIRE APPROVAL.

### 13.5 Security/privacy constraints
- Least-privilege role rendering (NFR-SEC-001, NFR-AUTHZ-001); PII (ID documents, phone, email, address, DOB) minimized in UI and never logged (NFR-CONF-001, NFR-DATA-001, API-SPECIFICATION §8).
- Government ID documents displayed only to authorized staff in verification contexts (FR-REG-002).

### 13.6 Explicitly unresolved UX decisions (REQUIRES APPROVAL / TBD)

| UX-DEC | Unresolved decision | Why it matters | Related | Status |
|---|---|---|---|---|
| UX-DEC-001 | Brand identity: colors, logo, typography, tone | No brand values exist in any SSOT | DESIGN-SYSTEM.md §1–2 | **TBD / REQUIRES APPROVAL** |
| UX-DEC-002 | Approved breakpoint values & grid | Responsive definitions must be agreed | DESIGN-SYSTEM.md §5 | **PROPOSED / REQUIRES APPROVAL** |
| UX-DEC-003 | Accessibility NFR (WCAG level, conformance target) | No accessibility requirement exists | UI-UX §12 | **REQUIRES APPROVAL** |
| UX-DEC-004 | Native mobile app (post-MVP) | ARCH-DEC-006 | TECH-STACK §4 | **REQUIRES APPROVAL** |
| UX-DEC-005 | Visual design for money/status states (exact values) | Semantic tokens need approval | DESIGN-SYSTEM.md §1 | **PROPOSED / REQUIRES APPROVAL** |
| UX-DEC-006 | Export/download of reports & ledger | Not a confirmed feature | FEAT-064..067 | **REQUIRES APPROVAL** |
| UX-DEC-007 | Empty-state copy and microcopy library | Copy requires brand voice approval | DESIGN-SYSTEM.md §6 | **REQUIRES APPROVAL** |
| UX-DEC-008 | Notification channels beyond in-app + push (email/SMS) | FR-ADM-005 base confirmed; channels TBD | FEAT-063 | **TBD** |
| UX-DEC-009 | Biometric / passwordless login | Not confirmed; ASSUMPTION 1 | FEAT-002 | **TBD / REQUIRES APPROVAL** |
| UX-DEC-010 | Currency formatting beyond ₱ PHP and locale | Only PHP shown in SSOT examples | BUSINESS-RULES §6 | **TBD / REQUIRES APPROVAL** |

---

## 14. Traceability & Consistency

- Screen IDs, journeys, and patterns above reference only existing SSOT IDs: `FR-*`, `NFR-*`, `FEAT-*`, `BR-*`, `BI-*`, `OD-*`, `AC-*`, `ARCH-DEC-*`, `FG-*` (see REQUIREMENTS.md, BUSINESS-RULES.md, FEATURES.md, ARCHITECTURE.md, API-SPECIFICATION.md).
- **New IDs introduced by this document:** `SCR-*` (screen register), `UX-DEC-*` (unresolved UX decisions), and journey labels `§3.x`. These are this document's own namespaces and are not claimed to exist elsewhere.
- Where a decision is not derivable from the SSOT it is marked `PROPOSED`, `REQUIRES APPROVAL`, or `TBD` — it is **never silently approved**.
- If REQUIREMENTS.md, BUSINESS-RULES.md, FEATURES.md, ROADMAP.md, or the architecture/API SSOT changes, re-verify this document's screen/journey/state mappings before proceeding.

---