# JAD - Business Rules SSOT

> **Authority:** This document is the **authoritative source for approved business rules** for the JA&D (JAD) system.
>
> **Governance:** If another document conflicts with these rules, do **not** silently overwrite this SSOT. Identify the conflict, record the conflicting source, determine whether an approved newer decision exists, and if unresolved, mark it **REQUIRES OWNER APPROVAL**. Do not invent a resolution.
>
> **Version:** Project 01 - Requirements & Business Analysis (Baseline v1.0)

---

## Status Classification

| Status | Meaning |
|---|---|
| **CONFIRMED** | Explicitly established and may be treated as a business rule |
| **PROVISIONAL** | Current working rule, but Owner may still revise it |
| **TBD** | Requirement exists but the actual rule is not yet defined |
| **REQUIRES APPROVAL** | Decision must be formally approved before implementation |
| **OUT OF SCOPE** | Must not be implemented |
| **SUPERSEDED** | Previous assumption/rule replaced by a newer decision |

---

## Table of Contents

1. [Authoritative Business Rules](#1-authoritative-business-rules)
2. [Eligibility Rules](#2-eligibility-rules)
3. [Role / Permission Business Rules](#3-role--permission-business-rules)
4. [Transaction Rules](#4-transaction-rules)
5. [Status / State Rules](#5-status--state-rules)
6. [Calculation Rules](#6-calculation-rules)
7. [Restrictions](#7-restrictions)
8. [Exceptions](#8-exceptions)
9. [Validation Rules](#9-validation-rules)
10. [Business Invariants](#10-business-invariants)
11. [Explicitly Prohibited Behaviors](#11-explicitly-prohibited-behaviors)
12. [Unresolved Rules Requiring Owner Decision](#12-unresolved-rules-requiring-owner-decision)
13. [Sources & Superseded Rules](#13-sources--superseded-rules)

---

# 1. Authoritative Business Rules

Each rule has a stable ID (`BR-<MODULE>-<NNN>`). Statuses reflect the latest approved Q&A baseline.

## 1.1 Authentication & Account (AUTH)

| ID | Rule | Status |
|---|---|---|
| BR-AUTH-001 | Email verification is required before an account may proceed to approval. | **CONFIRMED** |
| BR-AUTH-002 | Account statuses are limited to: `Pending`, `Approved-Active`, `Rejected`. | **CONFIRMED** |
| BR-AUTH-003 | Admin approval is required before a member may become Active/Qualified. | **CONFIRMED** |

## 1.2 Registration (REG)

| ID | Rule | Status |
|---|---|---|
| BR-REG-001 | Minimum member age is **18 years old**; value is configurable by Super Admin. | **CONFIRMED** |
| BR-REG-002 | A valid government-issued ID is required and is verified **manually by Admin**. | **CONFIRMED** |
| BR-REG-003 | Qualification questions are required at registration. | **CONFIRMED** |
| BR-REG-004 | Rejection of a registration requires a **mandatory rejection reason**. | **CONFIRMED** |
| BR-REG-005 | Registration resubmission is **currently unlimited**; a maximum attempt count may become configurable later. | **CONFIRMED / FUTURE (TBD)** |
| BR-REG-006 | **Purchase is NOT required** for membership. | **CONFIRMED** |
| BR-REG-007 | **Active + Qualified** = Age + Email verification + Government ID + Admin approval + Qualification requirements. | **CONFIRMED** |
| BR-REG-008 | A member may register **without a sponsor** (initial `Sponsor = None`). | **CONFIRMED** |
| BR-REG-009 | Referral/Sponsor code is **optional** during registration. | **CONFIRMED** |
| BR-REG-010 | Country is a structured value; a member cannot manually change it. | **CONFIRMED** |
| BR-REG-011 | Gender is a configurable set of values; initial defaults: `Male`, `Female`, `LGBT`. Super Admin configurable. | **CONFIRMED** |

## 1.3 Qualification (QUAL)

| ID | Rule | Status |
|---|---|---|
| BR-QUAL-001 | A member is Active + Qualified only when all of the following hold: minimum age, email verified, government ID verified, Admin approval granted, qualification requirements satisfied. | **CONFIRMED** |
| BR-QUAL-002 | Purchase is **NOT required** for Active + Qualified status or sponsor eligibility. | **CONFIRMED** |

## 1.4 Abroad Geolocation (GEO)

| ID | Rule | Status |
|---|---|---|
| BR-GEO-001 | Primary location method is **GPS/device location**; fallback is **IP geolocation**. | **CONFIRMED** |
| BR-GEO-002 | If the applicant's location is detected as the **Philippines**, Abroad registration is **blocked**. | **CONFIRMED** |
| BR-GEO-003 | An applicant may request a **location exception**; Admin may approve or reject the exception. | **CONFIRMED** |
| BR-GEO-004 | Every location override/exception must be audited with: applicant, Admin, date/time, reason, result. | **CONFIRMED** |
| BR-GEO-005 | Location accuracy threshold. | **TBD / REQUIRES APPROVAL** |
| BR-GEO-006 | Anti-GPS-spoofing requirements. | **TBD / REQUIRES APPROVAL** |

## 1.5 Referral & Sponsor (REF)

| ID | Rule | Status |
|---|---|---|
| BR-REF-001 | JAD uses a **strict Single-Level Referral** structure (direct referrer only). | **CONFIRMED** |
| BR-REF-002 | **No Multi-Level Direct Referral Commission.** A member receives Direct Referral commission only for members they directly referred. | **CONFIRMED** |
| BR-REF-003 | Sponsor eligibility: any **Active + Qualified Member**. Purchase is **not** required. | **CONFIRMED** |
| BR-REF-004 | Referral code is **automatically generated**, **unique**, and **cannot be modified by the member**. | **CONFIRMED** |
| BR-REF-005 | Admin **cannot normally modify** the referral code; the referral relationship is **persistent**. | **CONFIRMED** |
| BR-REF-006 | A sponsor may be assigned later through **Admin approval** for members who registered without a sponsor. | **CONFIRMED** |
| BR-REF-007 | Sponsor changes: **cannot be freely performed by members**, require **Admin approval**, and **must be audited**. Exact circumstances permitting a change are TBD. | **CONFIRMED** (rule) / **TBD** (circumstances) |

## 1.6 Customers (CUS)

| ID | Rule | Status |
|---|---|---|
| BR-CUS-001 | Customers do **not** need to become JA&D members. A seller may record a non-member customer. | **CONFIRMED** |
| BR-CUS-002 | Customer information captured: Full Name, Phone, Email, Property, Property Value. | **CONFIRMED** |

## 1.7 Property Management (PRP)

| ID | Rule | Status |
|---|---|---|
| BR-PRP-001 | Properties are **controlled by Admin**. | **CONFIRMED** |
| BR-PRP-002 | Agents/sellers **cannot create arbitrary properties**. | **CONFIRMED** |
| BR-PRP-003 | Property value must come from the **Admin-managed catalog**. | **CONFIRMED** |
| BR-PRP-004 | Historical transactions preserve the property value applicable **at transaction time**; catalog price changes do not alter existing sales. | **CONFIRMED** |

## 1.8 Sales (SAL)

| ID | Rule | Status |
|---|---|---|
| BR-SAL-001 | Only **Active + Qualified** members may submit customer sales. | **CONFIRMED** |
| BR-SAL-002 | **Admin approval** is required for a sale. | **CONFIRMED** |
| BR-SAL-003 | Payment must be **verified** before the sale becomes commission-qualifying. Authorized roles: **Admin, Finance, Super Admin**. | **CONFIRMED** |
| BR-SAL-004 | A sale becomes a **Qualifying Sale** only when: Submitted → Admin Approved → Payment Verified. | **CONFIRMED** |
| BR-SAL-005 | Sale rejection requires a **mandatory reason**; the seller may correct applicable information and **resubmit**. | **CONFIRMED** |
| BR-SAL-006 | Maximum sale resubmission attempts **must be configurable**; after the maximum is reached the sale is **LOCKED**. | **CONFIRMED** |
| BR-SAL-007 | Reopening a locked sale requires **Admin/Super Admin review** and **must be audited**. | **CONFIRMED** |

## 1.9 Commission (COM)

| ID | Rule | Status |
|---|---|---|
| BR-COM-001 | **Direct Commission = 8% of applicable Property/Sale Value.** Rate is configurable by Super Admin. | **CONFIRMED / PROVISIONAL RATE** |
| BR-COM-002 | **Direct Referral = 4% of applicable Property/Sale Value.** Paid to the **sale's selected referrer** when one is picked; otherwise automatically to the **seller's direct sponsor**; never both. Rate is configurable by Super Admin. | **CONFIRMED / PROVISIONAL RATE** |
| BR-COM-003 | Both Direct Commission (8%) and Direct Referral (4%) may apply to the **same** qualifying sale. | **CONFIRMED** |
| BR-COM-004 | An **Active + Qualified Member** who completes a **Qualifying Sale** is eligible for Direct Commission. | **CONFIRMED** |
| BR-COM-005 | Commission is created **immediately as Pending** after qualification. | **CONFIRMED** |
| BR-COM-006 | A **Pending commission is NOT included in Available eWallet Balance**, cannot be withdrawn, and cannot fund other transactions. | **CONFIRMED** |
| BR-COM-007 | Default commission clearing period is **7 days** and is **configurable by Super Admin**. Changes apply to future commissions only; they do not retroactively modify existing commission transactions unless explicitly defined. | **CONFIRMED** |
| BR-COM-008 | Group Incentive is a **separate company-defined bonus** and does **not** automatically create multi-level commission. | **CONFIRMED** (concept) / **TBD** (all parameters) |

## 1.10 Commission Lifecycle & Clearing (CLC)

| ID | Rule | Status |
|---|---|---|
| BR-CLC-001 | Commission lifecycle: Qualifying Sale → Commission Created → **PENDING** → (clearing) → **CONFIRMED / AVAILABLE** → eWallet Available Balance → Withdrawal Eligible. | **CONFIRMED** |
| BR-CLC-002 | Clearing period default is **7 days** (configurable). | **CONFIRMED** |

## 1.11 Cancellation / Reversal (CAN)

| ID | Rule | Status |
|---|---|---|
| BR-CAN-001 | If the underlying transaction is cancelled **before clearing**, the Pending commission is **Cancelled**. | **CONFIRMED** |
| BR-CAN-002 | If an applicable transaction is cancelled **after the commission is available**, the commission is reversed via a **Commission Reversal**; the original transaction remains immutable. | **CONFIRMED** |
| BR-CAN-003 | If recovery is required **after withdrawal**, the **Super Admin manually resolves/recovers** the amount. | **CONFIRMED** |
| BR-CAN-004 | There is **no general member/customer refund policy** after payment. The system must **not** invent a general automatic refund workflow. | **CONFIRMED** |

## 1.12 Commission Ledger (LED)

| ID | Rule | Status |
|---|---|---|
| BR-LED-001 | Commission records are **immutable**; they cannot be edited or deleted. | **CONFIRMED** |
| BR-LED-002 | Corrections use **separate transactions** (e.g., `Original Commission +₱80,000`, `Commission Reversal -₱80,000`). | **CONFIRMED** |

## 1.13 eWallet (WAL)

| ID | Rule | Status |
|---|---|---|
| BR-WAL-001 | The eWallet maintains a **complete financial ledger** covering: Direct Commission, Direct Referral, Group Incentive, Withdrawal, Withdrawal Reservation, Withdrawal Completion, Withdrawal Reversal, Commission Reversal, Financial Adjustment. | **CONFIRMED** |
| BR-WAL-002 | **Available Balance must never become negative.** | **CONFIRMED** |
| BR-WAL-003 | Pending commissions are **excluded** from Available Balance. | **CONFIRMED** |

## 1.14 Financial Adjustments (ADJ)

| ID | Rule | Status |
|---|---|---|
| BR-ADJ-001 | Only **Super Admin** may perform manual financial adjustments. | **CONFIRMED** |
| BR-ADJ-002 | Required audit information: Member, Amount, Credit/Debit, Reason, Performing Super Admin, Date/time. | **CONFIRMED** |

## 1.15 Payout Accounts (PAY)

| ID | Rule | Status |
|---|---|---|
| BR-PAY-001 | Members may maintain **multiple** payout accounts. | **CONFIRMED** |
| BR-PAY-002 | Potential methods: traditional banks, digital banks, GCash, other supported methods. **Final supported methods are TBD.** | **CONFIRMED** (concept) / **TBD** (methods) |
| BR-PAY-003 | Accounts require **Admin verification before use**. | **CONFIRMED** |
| BR-PAY-004 | Lifecycle: `Pending → Admin Review → Confirmed`. | **CONFIRMED** |
| BR-PAY-005 | Only **verified** accounts may be selected for withdrawal. | **CONFIRMED** |
| BR-PAY-006 | **One** account may be designated as Primary. | **CONFIRMED** |

## 1.16 Withdrawal (WDR)

| ID | Rule | Status |
|---|---|---|
| BR-WDR-001 | A member may request a withdrawal **up to Available Balance**. | **CONFIRMED** |
| BR-WDR-002 | On request, the amount is **Reserved**; reserved funds **cannot be reused**. | **CONFIRMED** |
| BR-WDR-003 | Successful withdrawal: `Reserved → Completed → Permanently Deducted`. | **CONFIRMED** |
| BR-WDR-004 | Rejected withdrawal: `Rejected → Reservation Released → Available Balance Restored`. **Rejection requires a reason.** | **CONFIRMED** |
| BR-WDR-005 | A rejected withdrawal **cannot** be edited/resubmitted; a **new withdrawal request** must be created. | **CONFIRMED** |
| BR-WDR-006 | Final withdrawal status model and processing workflow. | **TBD** |

## 1.17 Digital Voucher / QR Credits (VCH)

| ID | Rule | Status |
|---|---|---|
| BR-VCH-001 | Vouchers may support **full** or **partial** redemption, depending on configuration. | **CONFIRMED** |
| BR-VCH-002 | Partial redemption: `Original Value − Redeemed Amount = Remaining Value`. | **CONFIRMED** |
| BR-VCH-003 | The system must retain **redemption history**. | **CONFIRMED** |
| BR-VCH-004 | Merchant redemption must be performed **online through JAD**. | **CONFIRMED** |
| BR-VCH-005 | Redemption verifies: cryptographic signature, voucher authenticity, voucher status, expiration, redemption conditions, remaining balance, redemption history. | **CONFIRMED** |
| BR-VCH-006 | Redemption is an **atomic transaction** to prevent double redemption / race conditions. | **CONFIRMED** |
| BR-VCH-007 | Transferability, revocation, expiration behavior, merchant permissions, voucher-specific restrictions. | **TBD** |

## 1.18 Cryptographic Signing (SEC)

| ID | Rule | Status |
|---|---|---|
| BR-SEC-001 | The master voucher signing key must remain **exclusively under CTO control**. | **CONFIRMED** |
| BR-SEC-002 | The key must **not** be: embedded in source code, stored on developer workstations, accessible by normal application servers, accessible by developers/vendors, accessible by database administrators. | **CONFIRMED** |
| BR-SEC-003 | Signing must occur through a **separately controlled, CTO-authorized signing process/service**. | **CONFIRMED** |
| BR-SEC-004 | The key must **not** be exposed if application infrastructure is compromised. | **CONFIRMED** |

> This is a **critical security boundary** and must not be weakened during implementation without explicit Owner/CTO approval.

## 1.19 Marketing & Communications (MKT)

| ID | Rule | Status |
|---|---|---|
| BR-MKT-001 | Admins can manage: photos, videos, advertisement images, landing pages, promotional materials. | **CONFIRMED** |
| BR-MKT-002 | Members may forward permitted content through **Facebook Messenger**, **Viber**, and may **download** permitted materials. | **CONFIRMED** |

## 1.20 Policies & Notifications (NOT)

| ID | Rule | Status |
|---|---|---|
| BR-NOT-001 | Admin-managed: policies, program guidelines, Terms and Conditions, company rules. | **CONFIRMED** |
| BR-NOT-002 | Admin broadcast capabilities: promotions, training invitations, Zoom/Google Meet invitations, company announcements, push notifications. | **CONFIRMED** |

## 1.20a Admin ↔ Member Messaging (MSG)

| ID | Rule | Status |
|---|---|---|
| BR-MSG-001 | Each member has exactly **one conversation thread** with the admin team; messages are text-only (1-4000 chars, plain text, never rendered as HTML). | **CONFIRMED** |
| BR-MSG-002 | Threads are retained (no hard delete except the sanctioned member purge); message content is member-generated PII subject to the open general retention decision (DATABASE-DESIGN DA-13). | **CONFIRMED** |
| BR-MSG-003 | Staff replies are visible to authorized staff only (staff module `messages`; SELECT-only RLS gated by `is_staff_user()`); every staff reply is audited (`MESSAGE_SENT`, NFR-SEC-002). | **CONFIRMED** |
| BR-MSG-004 | All message writes go through service-role API handlers; authenticated users hold SELECT-only RLS, and per-side read watermarks drive unread counts. | **CONFIRMED** |

## 1.21 Reporting / Genealogy (RPT)

| ID | Rule | Status |
|---|---|---|
| BR-RPT-001 | **Direct Referrals** is valid and consistent with the Single-Level model. | **CONFIRMED** |
| BR-RPT-002 | **Group Network** may remain as a reporting/network concept but must **not** imply multi-level commission entitlement. | **CONFIRMED** |
| BR-RPT-003 | **Total Earned** must be defined against the financial ledger and must **not** incorrectly include pending/non-available funds. Definition requires implementation definition. | **REQUIRES IMPLEMENTATION DEFINITION** |
| BR-RPT-004 | **My Genealogy** may represent the member's referral relationship/network visualization but must **not** imply multi-level direct referral commissions. | **CONFIRMED** |

## 1.22 Domestic / Abroad Programs (PRG)

| ID | Rule | Status |
|---|---|---|
| BR-PRG-001 | Domestic and Abroad are treated as **separate business programs**. | **CONFIRMED** |
| BR-PRG-002 | Independent configuration is required for: registration rules, qualification questions, geolocation requirements, commission rates, referral rules, incentive rules, eligible properties/products. | **CONFIRMED** |
| BR-PRG-003 | Exact differences between the two programs. | **TBD** |

## 1.23 External Payment Boundary (BND)

| ID | Rule | Status |
|---|---|---|
| BR-BND-001 | JAD records payment/payout information but **does not execute actual money movement**. | **CONFIRMED** |
| BR-BND-002 | External execution may occur through: bank transfer, GCash, other approved external platforms. | **CONFIRMED** |
| BR-BND-003 | Payment gateway/payment infrastructure (gateway development, card processors, wallet APIs, payment APIs, POS infrastructure) is **OUT OF SCOPE**. | **CONFIRMED** |

## 1.24 Platform Configuration (CFG)

| ID | Rule | Status |
|---|---|---|
| BR-CFG-001 | Super Admin configures business parameters, including: minimum age, gender values, commission rates, clearing period, sale resubmission limits, voucher redemption mode. Configurable parameters must not require code changes. | **CONFIRMED** |

---

# 2. Eligibility Rules

| Rule | Applicability | Eligibility Criteria | Status |
|---|---|---|---|
| Registration | All applicants | Minimum age (18, configurable); government ID provided; email verified; qualification questions completed; country set. | **CONFIRMED** |
| Active status | Members | Email verified + Admin approval (ID manually verified). | **CONFIRMED** |
| Active + Qualified | Members | Age + email verification + government ID + Admin approval + qualification requirements. | **CONFIRMED** |
| Sponsor / Referrer | Members | **Active + Qualified Member.** Purchase is NOT required. | **CONFIRMED** |
| Sale submission | Members | Active + Qualified. | **CONFIRMED** |
| Qualifying Sale | Sale | Sale submitted → Admin approved → payment verified (Admin/Finance/Super Admin). | **CONFIRMED** |
| Direct Commission | Members | Active + Qualified who completes a Qualifying Sale. | **CONFIRMED** |
| Direct Referral | Members | Direct sponsor of the qualifying member (single-level). | **CONFIRMED** |
| Withdrawal | Members | Request up to Available Balance; only verified payout accounts selectable. | **CONFIRMED** |
| Voucher redemption | Merchants | Online through JAD with verified signature/authenticity/status/expiration/conditions/balance/history. | **CONFIRMED** |

---

# 3. Role / Permission Business Rules

Role permissions are **distinct from business eligibility**. Business eligibility determines *what the business permits*; roles determine *who may perform an action*.

| Role | May Do | May NOT Do |
|---|---|---|
| **Member** | Register; complete qualification; refer (if Active + Qualified); submit sales (if Active + Qualified); download permitted materials; forward permitted content via Messenger/Viber; request withdrawal; view own genealogy/ledger. | Change own country; modify own referral code; change sponsor freely; create properties; edit/deleted financial records; withdraw pending commissions. |
| **Active + Qualified Member** | All Member actions, plus: become a sponsor/referrer; submit sales. | (Same member prohibitions above.) |
| **Admin** | Manually verify government ID; approve/reject registration (with mandatory reason); approve sales; verify payments; review geolocation exceptions; assign sponsor via approval; review/reopen locked sales; manage properties catalog; verify payout accounts; manage marketing/media/policies/notifications. | Normally modify member referral codes; perform financial adjustments (Super Admin only); execute money movement. |
| **Finance** | Verify applicable payments. | Financial adjustments (Super Admin only); execute money movement. |
| **Super Admin** | Everything Admin/Finance can do, plus: configure business parameters (min age, gender values, commission rates, clearing period, resubmission limits, voucher redemption mode); perform financial adjustments; resolve/recover already-withdrawn reversed commissions; reopen locked sales. | Expose/possess the master signing key (CTO boundary). |
| **Merchant** | Redeem vouchers online through JAD (subject to verification). | Redeem offline; double-redeem. |
| **CTO** | Controls the master voucher signing key and signing process/service exclusively. | - |
| **Customer** | Non-member subject of a recorded sale. | Nothing system-facing (recorded by seller). |
| **External payment providers/platforms** | Execute actual money movement (bank transfer, GCash, other approved platforms). | None within JAD scope (payment gateway infra is OUT OF SCOPE). |

**Object-level authorization:** role permissions apply to the member's own records (e.g., a Member may view/edit only their own profile, sales, ledger, payout accounts, withdrawals). Admin/Finance/Super Admin permissions apply to records within their operational scope and are subject to the audit requirements below.

---

# 4. Transaction Rules

| Transaction | Flow | Notes |
|---|---|---|
| **Sale lifecycle** | Submitted → Admin Approved → Payment Verified → **Qualifying Sale** | Rejection requires reason; seller may correct and resubmit; configurable max attempts → **LOCKED**. |
| **Payment verification** | Performed by Admin, Finance, or Super Admin | Required before commission-qualifying. |
| **Commission creation** | On qualification → created immediately as **Pending** | - |
| **Commission clearing** | Pending → (7-day clearing, configurable) → Confirmed/Available | Applies to future commissions only. |
| **Withdrawal reservation** | Request → amount Reserved → funds not reusable | Up to Available Balance. |
| **Withdrawal completion** | Reserved → Completed → Permanently Deducted | - |
| **Withdrawal rejection** | Rejected → Reservation Released → Available Balance Restored | Reason required; new request required (no edit/resubmit). |
| **Voucher redemption** | Online through JAD → verify signature/authenticity/status/expiration/conditions/balance/history → **atomic** decrement | Prevents double/race redemption. |
| **Financial adjustment** | Super Admin only; recorded with member, amount, credit/debit, reason, performing Super Admin, date/time | Never automated for the general case. |

---

# 5. Status / State Rules

Only states explicitly established are listed. Incomplete models are marked **TBD** and must not be invented.

### Member
```text
Pending ──────────────► Approved-Active
    │                        │
    └──────────► Rejected ◄──┘
                    │
                    └──► (Resubmit) ──► Pending   [currently unlimited; max attempts TBD/FUTURE]
```

### Sale
```text
Submitted ──► Admin Approved ──► Payment Verified ──► Qualifying Sale
    │               │
    └──► Rejected ◄─┘
            │
            └──► (Correct & Resubmit) ──► Submitted   [configurable max attempts]
                                                        [after max: LOCKED]
                                                    [reopen requires Admin/Super Admin review + audit]
```

### Commission
```text
Pending ──────────────► Available (after clearing)
    │
    └──► Cancelled (transaction cancelled before clearing)

Available ────────────► Reversed (transaction cancelled after clearing; original immutable)
```

### Payout Account
```text
Pending ──► Admin Review ──► Confirmed
```

### Withdrawal
```text
Requested ──► Reserved ──► Completed (permanently deducted)
                  │
                  └──► Rejected (reason) ──► Reservation Released ──► Balance Restored
```

> **TBD:** Final withdrawal status model / processing workflow. Do not invent additional states.

---

# 6. Calculation Rules

Confirmed calculations (rates are **configurable by Super Admin**):

```text
Direct Commission = applicable Property/Sale Value × 8%
Direct Referral   = applicable Property/Sale Value × 4%
```

Example:
```text
Property = ₱1,000,000

Direct Commission (seller) = ₱1,000,000 × 8% = ₱80,000
Direct Referral (sponsor)  = ₱1,000,000 × 4% = ₱40,000
Total commission           = ₱120,000
```

**Not yet defined (do not invent):**
- Group Incentive: eligibility, rate, formula, trigger, calculation basis, payment timing, Domestic/Abroad differences.
- Any rate outside the confirmed 8% / 4% baselines.
- Geolocation accuracy threshold.

---

# 7. Restrictions

- **No multi-level direct referral commission.** Only the direct referrer qualifies.
- Members **cannot freely change** sponsors; changes require Admin approval and audit (circumstances TBD).
- Members **cannot modify** referral codes; Admin normally cannot either.
- Agents/sellers **cannot arbitrarily create properties** or change property values.
- **Pending commissions cannot be withdrawn** and do not contribute to Available Balance.
- **Available Balance must never become negative.**
- **Historical commission records cannot be edited or deleted.**
- **Historical sales values cannot be edited** when catalog pricing changes.
- No general automatic customer refund workflow.
- Payment gateway/processing infrastructure is OUT OF SCOPE.

---

# 8. Exceptions

Approved exception workflows (all must be audited unless stated otherwise):

| Exception | Workflow | Status |
|---|---|---|
| **Abroad geolocation exception** | Applicant requests Admin review → Admin approves/rejects → audit (applicant, Admin, date/time, reason, result). | **CONFIRMED** |
| **Sponsor assignment** | Member registered without sponsor → sponsor assigned through Admin approval. | **CONFIRMED** |
| **Sponsor change** | Admin approval required; audited. Exact circumstances TBD. | **CONFIRMED** (workflow) / **TBD** (circumstances) |
| **Reopening locked sales** | Admin/Super Admin review; audited. | **CONFIRMED** |
| **Financial recovery after withdrawn commission reversal** | Super Admin manually resolves/recovers the amount. | **CONFIRMED** |
| **Financial adjustment** | Super Admin only; audited (member, amount, credit/debit, reason, Super Admin, date/time). | **CONFIRMED** |

---

# 9. Validation Rules

Business-level validations (distinct from technical schema validation):

- Registration rejected only with a mandatory reason.
- Sale rejected only with a mandatory reason.
- Withdrawal rejected only with a mandatory reason.
- Only Active + Qualified members may submit sales or become sponsors.
- Only verified payout accounts may be selected for withdrawal.
- Withdrawal amount must not exceed Available Balance.
- Commission calculation applies the property/sale value recorded at transaction time.
- Voucher redemption requires full online verification and must be atomic.
- No Pending commission may enter Available Balance or fund any transaction.
- Location override for Abroad requires Admin approval and audit record.

---

# 10. Business Invariants

Rules that must **ALWAYS** remain true:

| ID | Invariant |
|---|---|
| **BI-001** | Available Balance must never be negative. |
| **BI-002** | Pending commissions must never be withdrawable and must never contribute to Available Balance. |
| **BI-003** | A Direct Referral commission may only be awarded to the direct sponsor. |
| **BI-004** | Genealogy must never automatically create multi-level commission entitlement. |
| **BI-005** | Historical commission records are immutable (no edit/delete). |
| **BI-006** | Historical transaction property value must not change when catalog pricing changes. |
| **BI-007** | Voucher redemption must not permit duplicate/simultaneous unauthorized redemption (atomic). |
| **BI-008** | The master voucher signing key must never be accessible to application infrastructure, developers, vendors, or database administrators. |
| **BI-009** | Referral relationships are persistent; referral codes are immutable by members and normally by Admin. |
| **BI-010** | No general automatic refund workflow may exist without explicit Owner approval. |

---

# 11. Explicitly Prohibited Behaviors

The system must **never** implement the following without explicit Owner approval:

1. Multi-level direct referral commissions.
2. Automatic downline commissions.
3. Arbitrary seller-created properties.
4. Editable historical commission transactions.
5. Editable historical sales values.
6. Withdrawal of Pending commissions.
7. Negative Available Balance.
8. Payment gateway / card processing / wallet-payment-API / POS infrastructure within JAD.
9. Automatic customer refund system.
10. Any rule marked TBD being silently converted into an implementation decision.
11. Weakening of the CTO-controlled signing boundary.
12. Purchase required for membership or referral eligibility (SUPERSEDED assumption - must not be reintroduced).

---

# 12. Unresolved Rules Requiring Owner Decision

For every item: a stable **Decision ID**, the open question, why it matters, affected requirements, and current status. These must **not** be invented by the development team.

| Decision ID | Question | Why it matters | Affected Requirements | Current Status |
|---|---|---|---|---|
| OD-001 | What are the exact Domestic registration differences? | Registration flow diverges per program. | BR-PRG-001..003, FR-PRG-001..003 | **REQUIRES OWNER APPROVAL** |
| OD-002 | What are the exact Domestic qualification differences? | Qualification rules diverge per program. | BR-PRG-001..003 | **REQUIRES OWNER APPROVAL** |
| OD-003 | What are the exact eligible properties/products per program? | Governs sale eligibility. | BR-PRG-002 | **REQUIRES OWNER APPROVAL** |
| OD-004 | What are the exact Domestic rules? | Program definition incomplete. | BR-PRG-001..003 | **REQUIRES OWNER APPROVAL** |
| OD-005 | What are the exact Abroad rules? | Program definition incomplete. | BR-PRG-001..003 | **REQUIRES OWNER APPROVAL** |
| OD-006 | Group Incentive: eligibility? | Blocks Group Incentive implementation. | BR-COM-008, FR-COM-012 | **REQUIRES OWNER APPROVAL** |
| OD-007 | Group Incentive: rate? | Blocks calculation. | BR-COM-008 | **REQUIRES OWNER APPROVAL** |
| OD-008 | Group Incentive: formula? | Blocks calculation. | BR-COM-008 | **REQUIRES OWNER APPROVAL** |
| OD-009 | Group Incentive: trigger? | Blocks lifecycle implementation. | BR-COM-008 | **REQUIRES OWNER APPROVAL** |
| OD-010 | Group Incentive: calculation basis? | Blocks calculation. | BR-COM-008 | **REQUIRES OWNER APPROVAL** |
| OD-011 | Group Incentive: payment timing? | Blocks lifecycle implementation. | BR-COM-008 | **REQUIRES OWNER APPROVAL** |
| OD-012 | Group Incentive: Domestic/Abroad applicability? | Program divergence. | BR-COM-008 | **REQUIRES OWNER APPROVAL** |
| OD-013 | Under what exact circumstances may a sponsor be changed? | Sponsor-change workflow scope. | BR-REF-007, FR-REF-007 | **REQUIRES OWNER APPROVAL** |
| OD-014 | What is the required geolocation accuracy threshold? | Abroad registration integrity. | BR-GEO-005, FR-GEO-007 | **REQUIRES APPROVAL** |
| OD-015 | What anti-GPS-spoofing requirements apply? | Abroad registration integrity. | BR-GEO-006, FR-GEO-008 | **REQUIRES APPROVAL** |
| OD-016 | What are the final supported payout providers? | Payout account configuration. | BR-PAY-002, FR-PAY-002 | **REQUIRES APPROVAL** |
| OD-017 | What is the final withdrawal processing workflow? | Withdrawal behavior. | BR-WDR-006, FR-WDR-006 | **REQUIRES APPROVAL** |
| OD-018 | What is the final withdrawal status model? | Withdrawal state transitions. | BR-WDR-006, FR-WDR-006 | **REQUIRES APPROVAL** |
| OD-019 | Are vouchers transferable? | Voucher ownership rules. | BR-VCH-007, FR-VCH-007 | **REQUIRES APPROVAL** |
| OD-020 | Can vouchers be revoked? | Voucher lifecycle. | BR-VCH-007, FR-VCH-007 | **REQUIRES APPROVAL** |
| OD-021 | What is voucher expiration behavior? | Voucher lifecycle. | BR-VCH-007, FR-VCH-007 | **REQUIRES APPROVAL** |
| OD-022 | What merchant permissions apply to vouchers? | Redemption authorization. | BR-VCH-007, FR-VCH-007 | **REQUIRES APPROVAL** |
| OD-023 | What voucher-specific restrictions apply? | Redemption constraints. | BR-VCH-007, FR-VCH-007 | **REQUIRES APPROVAL** |
| OD-024 | Should maximum registration attempts be configured, and to what value? | Registration resubmission policy. | BR-REG-005, FR-REG-006 | **FUTURE / TBD** |
| OD-025 | How is "Total Earned" precisely defined against the financial ledger? | Reporting accuracy. | BR-RPT-003, FR-RPT-003 | **REQUIRES IMPLEMENTATION DEFINITION** |

---

# 13. Sources & Superseded Rules

### Sources
- JA&D App Technical Scope (original)
- JAD Business Requirements Addendum
- Latest approved Q&A decisions (reconciled baseline - authoritative)

### Superseded Rules

| Previous Assumption | Superseded By |
|---|---|
| Purchase/sale may be required before a member can qualify or refer. | Purchase is **not required** for Active + Qualified status or sponsor eligibility. (**CONFIRMED**) |
| Any implied multi-level direct referral commission. | JAD uses **strict Single-Level Referral**; no MLM direct referral commission. (**CONFIRMED**) |
| Any implied automatic refund workflow. | **No general refund policy** exists; system must not invent one. (**CONFIRMED**) |

### Conflict Handling
If a conflicting document appears, do not silently overwrite this SSOT: identify the conflict, record the conflicting source, determine whether a newer approved decision exists, and if unresolved, mark it **REQUIRES OWNER APPROVAL**.