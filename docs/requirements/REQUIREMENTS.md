# JAD — Functional & Non-Functional Requirements SSOT

> **Authority:** This document is the **authoritative source for approved functional and non-functional requirements** for the JA&D (JAD) system.
>
> **Companion document:** Business rules (business eligibility, role permissions, calculations, state models) are maintained in `../business/BUSINESS-RULES.md` (the authoritative Business Rules SSOT). Rules are not duplicated here beyond the traceability needed to keep requirements testable.
>
> **Governance:** If another document conflicts with this SSOT, do **not** silently overwrite it. Identify the conflict, record the conflicting source, determine whether an approved newer decision exists, and if unresolved, mark it **REQUIRES OWNER APPROVAL**. Do not invent a resolution.
>
> **Version:** Project 01 — Requirements & Business Analysis (Baseline v1.0)

---

## 1. Project Overview

### 1.1 System Purpose

JA&D (JAD) is a direct-selling and network-growth platform that enables **Active + Qualified members** to earn a **Direct Commission (8%)** on qualifying customer sales and a **Direct Referral commission (4%)** on qualifying sales made by members they directly referred, under a **strict Single-Level Referral** structure. Members manage earnings through a full **eWallet financial ledger** and may withdraw available funds through verified payout accounts. The system also provides **digital vouchers with QR redemption**, Admin-managed marketing/policy content, and separate **Domestic and Abroad** business programs.

### 1.2 System Boundaries

- JAD manages **records and business logic**: members, qualification, sales, commissions, eWallet ledger, withdrawals, payout accounts, vouchers/QR redemption.
- JAD **does not execute actual money movement**. Payment/payout execution occurs through external platforms (bank transfer, GCash, other approved providers).
- Payment gateway / card processing / wallet-payment-API / POS infrastructure is **OUT OF SCOPE**.
- Voucher **signing** is performed by a separately controlled, CTO-authorized signing process/service; the master key is never accessible to application infrastructure.

### 1.3 Major System Capabilities

- Member registration, verification, approval, and qualification (no purchase required).
- Single-Level referral structure with persistent, immutable referral codes.
- Admin-controlled property catalog with historical value preservation.
- Sale submission, admin approval, payment verification, and qualifying-sale determination.
- Commission engine: Direct Commission (8%) and Direct Referral (4%), configurable, with pending → clearing → available lifecycle.
- eWallet with a complete, immutable financial ledger and non-negative available balance.
- Payout accounts (multiple, admin-verified) and withdrawals with reservation.
- Digital vouchers with full/partial QR redemption, atomic and online-verified.
- Marketing, media, policies, notifications, and broadcasts.
- Reporting views: Direct Referrals, Group Network (no MLM implication), Total Earned, My Genealogy.
- Separate Domestic and Abroad program configuration.
- Role-based access for Super Admin, Admin, Finance, and Members; CTO-controlled signing boundary.

### 1.4 Intended Users

- **Members** (and **Active + Qualified Members**)
- **Admin**
- **Finance**
- **Super Admin**
- **Merchants** (voucher redemption)
- **CTO** (signing control)
- **Customers** (non-member; recorded by sellers)
- **External payment providers/platforms** (out-of-boundary integration points)

---

## 2. Business Objectives

| ID | Business Objective | Problem Addressed | Expected Outcome |
|---|---|---|---|
| BO-01 | Enable membership without purchase requirement. | Removing purchase barriers to entry. | Higher member acquisition; faster network growth. |
| BO-02 | Reward qualifying sales with Direct Commission (8%). | Incentivize members to sell. | Increased sales volume. |
| BO-03 | Reward direct referrals with Direct Referral commission (4%). | Incentivize network growth without MLM complexity/risk. | Sustainable single-level network growth. |
| BO-04 | Ensure financial integrity (immutable ledger, clearing, reservation). | Prevent errors, double-spend, and balance misuse. | Trustworthy eWallet; no negative balances. |
| BO-05 | Deliver secure digital vouchers with atomic QR redemption. | Prevent fraud and double redemption. | Safe, auditable voucher ecosystem. |
| BO-06 | Support marketing and communications. | Enable Admin-led promotion and member forwarding. | Effective promotional reach. |
| BO-07 | Operate Domestic and Abroad as separate programs. | Different market rules and geolocation needs. | Program-specific compliance and configuration. |
| BO-08 | Enforce a CTO-controlled cryptographic signing boundary. | Protect voucher integrity at the highest level. | Vouchers remain unforgeable even if app infrastructure is compromised. |

---

## 3. Scope

### 3.1 In Scope

All requirements listed in Sections 6 and 7 below whose status is **CONFIRMED** or **CONFIRMED / PROVISIONAL**, including:
- Registration, verification, approval, qualification, and member profiles.
- Single-Level referral and sponsor management.
- Admin-controlled property catalog with historical value preservation.
- Sales submission/approval/payment verification and qualifying-sale determination.
- Direct Commission (8%) and Direct Referral (4%) with configurable rates.
- Commission lifecycle, clearing, cancellation, and reversal.
- Immutable commission ledger.
- eWallet and available balance with reservations.
- Financial adjustments (Super Admin only).
- Payout accounts and withdrawals.
- Digital vouchers and QR redemption (atomic, online-verified).
- CTO-controlled signing process/service.
- Marketing, media, policies, and notifications.
- Reporting views (Direct Referrals, Group Network, Total Earned, My Genealogy).
- Domestic/Abroad program separation (rule details per OD-001..005).

### 3.2 Out of Scope

The following must **not** be implemented as part of the current JAD scope without explicit authorization:
- Payment gateway development.
- Card processing infrastructure.
- Wallet/payment APIs for actual money movement.
- POS payment processing.
- Automatic customer refund system.
- Multi-level referral commissions / automatic downline commissions.
- Arbitrary seller-created properties.
- Editable historical commission transactions / editable historical sales values.

### 3.3 Future Scope

Only explicitly identified future scope may be listed here. TBD items are **not** silently moved into scope:
- Configurable maximum registration attempts (currently unlimited resubmission) — see OD-024.

All other open questions (see OD-001..025) remain **REQUIRES OWNER APPROVAL** and are **not** in scope until approved.

---

## 4. Actors and Roles

| Actor | System Role | Business Eligibility (separate concern) |
|---|---|---|
| **Member** | Authenticated member with registration, profile, ledger, payout, and referral views. | May register, qualify, view genealogy. |
| **Active + Qualified Member** | Member satisfying qualification criteria. | May refer (sponsor) and submit sales. |
| **Admin** | Operates verification, approval, catalog, and content workflows. | Performs ID verification, sale/payment/payout verification, geolocation exceptions, sponsor assignment. |
| **Finance** | Verifies payments. | Payment verification authority. |
| **Super Admin** | Global configuration and exception authority. | Configures business parameters; performs financial adjustments; resolves recovered amounts; reopens locked sales. |
| **Merchant** | Redeems vouchers online through JAD. | Subject to voucher verification rules. |
| **CTO** | Owns the master voucher signing key and authorizes the signing process/service. | Exclusive signing authority; no access by other actors. |
| **Customer** | Non-member recorded by a seller. | Not a system user; no self-service capabilities. |
| **External payment providers/platforms** | Execute actual money movement. | Out-of-boundary integration; JAD records only. |

**Note:** Role permissions and business eligibility are distinct. A role granting an action (e.g., Admin sale approval) does not change who is *business-eligible* (e.g., only Active + Qualified members may submit sales). See BUSINESS-RULES.md §3.

**Object-level authorization:** Members may access only their own records (profile, sales, ledger, payout accounts, withdrawals, genealogy). Staff roles may access records within their operational scope; all exception/override actions are audited.

---

## 5. Requirement Status Legend

| Status | Meaning |
|---|---|
| CONFIRMED | Approved requirement |
| CONFIRMED / PROVISIONAL | Approved requirement; working value/rate may still be revised by Owner |
| TBD / REQUIRES APPROVAL | Rule value unresolved; must not be invented |
| REQUIRES IMPLEMENTATION DEFINITION | Approved concept; precise definition pending |

---

## 6. Functional Requirements

### 6.1 Authentication & Account — FR-AUTH

| ID | Requirement | Status |
|---|---|---|
| FR-AUTH-001 | Email verification is required before an account may be approved. | **CONFIRMED** |
| FR-AUTH-002 | Member account statuses shall be limited to `Pending`, `Approved-Active`, `Rejected`. | **CONFIRMED** |
| FR-AUTH-003 | Admin approval is required before a member becomes Active. | **CONFIRMED** |
| FR-AUTH-004 | Members and staff shall authenticate to access role-scoped functionality. | **CONFIRMED** (platform capability) |

### 6.2 Registration & Qualification — FR-REG

| ID | Requirement | Status |
|---|---|---|
| FR-REG-001 | Registration shall enforce a minimum age of 18, with the value configurable by Super Admin. | **CONFIRMED** |
| FR-REG-002 | Registration shall require a valid government-issued ID subject to manual Admin verification. | **CONFIRMED** |
| FR-REG-003 | Registration shall require completion of qualification questions. | **CONFIRMED** |
| FR-REG-004 | Registration approval/rejection shall be performed by Admin; rejection requires a mandatory reason. | **CONFIRMED** |
| FR-REG-005 | A rejected registration may be resubmitted (currently unlimited attempts). | **CONFIRMED** |
| FR-REG-006 | Maximum registration attempts may become configurable (future). | **FUTURE / TBD (OD-024)** |
| FR-REG-007 | No purchase shall be required for membership. | **CONFIRMED** |
| FR-REG-008 | A member shall reach Active + Qualified status only upon: minimum age, email verified, ID verified, Admin approval, and qualification requirements satisfied. | **CONFIRMED** |
| FR-REG-009 | A member may register without a sponsor (initial `Sponsor = None`). | **CONFIRMED** |
| FR-REG-010 | A referral/sponsor code shall be optional during registration. | **CONFIRMED** |
| FR-REG-011 | Gender shall be a configurable set of values (defaults: Male, Female, LGBT), configurable by Super Admin. | **CONFIRMED** |
| FR-REG-012 | Country shall be a structured value that a member cannot change manually. | **CONFIRMED** |

### 6.3 Member Profile — FR-MEM

| ID | Requirement | Status |
|---|---|---|
| FR-MEM-001 | Member profiles shall capture structured fields: First Name, Last Name, Middle Initial, Extension/Suffix, Date of Birth, Gender, Address, Country, Phone, Email, optional Profile Photo. | **CONFIRMED** |
| FR-MEM-002 | Members shall view their own admin-team thread, send text messages, and receive replies in the same thread with live (Realtime) updates. | **CONFIRMED** (owner-approved scope, 2026-09-14 — ADR-013) |

### 6.4 Abroad Geolocation — FR-GEO

| ID | Requirement | Status |
|---|---|---|
| FR-GEO-001 | Abroad location determination shall use GPS/device location as primary method. | **CONFIRMED** |
| FR-GEO-002 | IP geolocation shall be used as fallback when device location is unavailable. | **CONFIRMED** |
| FR-GEO-003 | Abroad registration shall be blocked when the applicant is detected to be in the Philippines. | **CONFIRMED** |
| FR-GEO-004 | An applicant shall be able to request a location exception for Admin review. | **CONFIRMED** |
| FR-GEO-005 | Admin may approve or reject a location exception. | **CONFIRMED** |
| FR-GEO-006 | Every location override/exception shall be audited with: applicant, Admin, date/time, reason, result. | **CONFIRMED** |
| FR-GEO-007 | Location accuracy threshold. | **TBD / REQUIRES APPROVAL (OD-014)** |
| FR-GEO-008 | Anti-GPS-spoofing requirements. | **TBD / REQUIRES APPROVAL (OD-015)** |

### 6.5 Referral & Sponsor — FR-REF

| ID | Requirement | Status |
|---|---|---|
| FR-REF-001 | The system shall auto-generate a unique referral code per member; the member cannot modify it. | **CONFIRMED** |
| FR-REF-002 | Admin shall normally not be able to modify a referral code; referral relationships shall be persistent. | **CONFIRMED** |
| FR-REF-003 | Referrals shall follow a strict Single-Level structure. | **CONFIRMED** |
| FR-REF-004 | Only an Active + Qualified Member may become a sponsor. | **CONFIRMED** |
| FR-REF-005 | The system shall not award multi-level direct referral commissions. | **CONFIRMED** |
| FR-REF-006 | A sponsor may be assigned to a member through Admin approval. | **CONFIRMED** |
| FR-REF-007 | Sponsor changes shall require Admin approval and be audited; exact permitted circumstances are TBD. | **CONFIRMED** (control) / **TBD** (circumstances, OD-013) |

### 6.6 Customers — FR-CUS

| ID | Requirement | Status |
|---|---|---|
| FR-CUS-001 | A seller shall be able to record a non-member customer without customer membership. | **CONFIRMED** |
| FR-CUS-002 | Customer records shall capture: Full Name, Phone, Email, Property, Property Value. | **CONFIRMED** |

### 6.7 Property Management — FR-PRP

| ID | Requirement | Status |
|---|---|---|
| FR-PRP-001 | Properties shall be managed in an Admin-controlled catalog. | **CONFIRMED** |
| FR-PRP-002 | Agents/sellers shall not create arbitrary properties. | **CONFIRMED** |
| FR-PRP-003 | Property values shall come from the Admin-managed catalog. | **CONFIRMED** |
| FR-PRP-004 | Historical transactions shall preserve the property value applicable at transaction time; catalog price changes shall not alter existing sales. | **CONFIRMED** |

### 6.8 Sales & Qualifying Sales — FR-SAL

| ID | Requirement | Status |
|---|---|---|
| FR-SAL-001 | Only Active + Qualified members may submit customer sales. | **CONFIRMED** |
| FR-SAL-002 | Sales shall require Admin approval. | **CONFIRMED** |
| FR-SAL-003 | Applicable payment shall be verified by Admin, Finance, or Super Admin before a sale becomes commission-qualifying. | **CONFIRMED** |
| FR-SAL-004 | A sale becomes a Qualifying Sale only when: submitted + Admin approved + payment verified. | **CONFIRMED** |
| FR-SAL-005 | Sale rejection shall require a mandatory reason; the seller may correct and resubmit. | **CONFIRMED** |
| FR-SAL-006 | Maximum sale resubmission attempts shall be configurable; after the maximum, the sale is LOCKED. | **CONFIRMED** |
| FR-SAL-007 | Reopening a locked sale shall require Admin/Super Admin review and be audited. | **CONFIRMED** |

### 6.9 Commission — FR-COM

| ID | Requirement | Status |
|---|---|---|
| FR-COM-001 | Direct Commission shall equal a configurable percentage (baseline 8%) of the applicable Property/Sale Value. | **CONFIRMED / PROVISIONAL** |
| FR-COM-002 | Direct Referral shall equal a configurable percentage (baseline 4%) of the applicable Property/Sale Value, paid to the direct sponsor. | **CONFIRMED / PROVISIONAL** |
| FR-COM-003 | Direct Commission and Direct Referral may both apply to the same qualifying sale. | **CONFIRMED** |
| FR-COM-004 | An Active + Qualified Member completing a Qualifying Sale is eligible for Direct Commission. | **CONFIRMED** |
| FR-COM-005 | A commission shall be created immediately as Pending upon qualification. | **CONFIRMED** |
| FR-COM-006 | A Pending commission shall not be included in Available eWallet Balance, shall not be withdrawable, and shall not fund other transactions. | **CONFIRMED** |
| FR-COM-007 | Commission clearing period shall default to 7 days and be configurable by Super Admin; changes apply to future commissions only. | **CONFIRMED** |
| FR-COM-008 | Commission lifecycle: Pending → (clearing) → Confirmed/Available → eWallet Available Balance → Withdrawal Eligible. | **CONFIRMED** |
| FR-COM-009 | A Pending commission shall be cancelled if the underlying transaction is cancelled before clearing. | **CONFIRMED** |
| FR-COM-010 | An Available commission shall be reversed (Commission Reversal) if the applicable transaction is cancelled after clearing; the original transaction remains immutable. | **CONFIRMED** |
| FR-COM-011 | Recovery of an already-withdrawn reversed commission shall be resolved manually by Super Admin. | **CONFIRMED** |
| FR-COM-012 | Commission records shall be immutable; corrections use separate transactions. | **CONFIRMED** |
| FR-COM-013 | Group Incentive shall be a separate company-defined bonus and shall not create multi-level commission. Eligibility, rate, formula, trigger, basis, timing, and program applicability. | **CONFIRMED** (concept) / **TBD** (parameters, OD-006..012) |

### 6.10 eWallet & Financial Ledger — FR-WAL

| ID | Requirement | Status |
|---|---|---|
| FR-WAL-001 | The eWallet shall maintain a complete financial ledger. | **CONFIRMED** |
| FR-WAL-002 | Ledger transaction types: Direct Commission, Direct Referral, Group Incentive, Withdrawal, Withdrawal Reservation, Withdrawal Completion, Withdrawal Reversal, Commission Reversal, Financial Adjustment. | **CONFIRMED** |
| FR-WAL-003 | Available Balance shall never become negative. | **CONFIRMED** |
| FR-WAL-004 | Pending commissions shall be excluded from Available Balance. | **CONFIRMED** |

### 6.11 Financial Adjustments — FR-ADJ

| ID | Requirement | Status |
|---|---|---|
| FR-ADJ-001 | Financial adjustments shall be performed only by Super Admin. | **CONFIRMED** |
| FR-ADJ-002 | Adjustments shall record: Member, Amount, Credit/Debit, Reason, Performing Super Admin, Date/time. | **CONFIRMED** |

### 6.12 Payout Accounts — FR-PAY

| ID | Requirement | Status |
|---|---|---|
| FR-PAY-001 | Members may maintain multiple payout accounts. | **CONFIRMED** |
| FR-PAY-002 | Supported methods include traditional banks, digital banks, GCash, and other supported methods; final methods TBD. | **CONFIRMED** (concept) / **TBD** (methods, OD-016) |
| FR-PAY-003 | Payout accounts require Admin verification before use. | **CONFIRMED** |
| FR-PAY-004 | Payout account lifecycle: Pending → Admin Review → Confirmed. | **CONFIRMED** |
| FR-PAY-005 | Only verified accounts may be selected for withdrawal. | **CONFIRMED** |
| FR-PAY-006 | One account may be designated as Primary. | **CONFIRMED** |

### 6.13 Withdrawal — FR-WDR

| ID | Requirement | Status |
|---|---|---|
| FR-WDR-001 | A member may request a withdrawal up to Available Balance. | **CONFIRMED** |
| FR-WDR-002 | On request, the amount shall be reserved; reserved funds cannot be reused. | **CONFIRMED** |
| FR-WDR-003 | Successful withdrawal: Reserved → Completed → Permanently Deducted. | **CONFIRMED** |
| FR-WDR-004 | Rejected withdrawal: Rejected → Reservation Released → Available Balance Restored; rejection requires a reason. | **CONFIRMED** |
| FR-WDR-005 | A rejected withdrawal shall not be editable/resubmittable; a new withdrawal request is required. | **CONFIRMED** |
| FR-WDR-006 | Final withdrawal status model and processing workflow. | **TBD / REQUIRES APPROVAL (OD-017, OD-018)** |

### 6.14 Digital Voucher / QR Credits — FR-VCH

| ID | Requirement | Status |
|---|---|---|
| FR-VCH-001 | Vouchers shall support full or partial redemption depending on configuration. | **CONFIRMED** |
| FR-VCH-002 | Partial redemption: Original Value − Redeemed Amount = Remaining Value. | **CONFIRMED** |
| FR-VCH-003 | Redemption history shall be retained. | **CONFIRMED** |
| FR-VCH-004 | Merchant redemption shall occur online through JAD. | **CONFIRMED** |
| FR-VCH-005 | Redemption shall verify: cryptographic signature, voucher authenticity, voucher status, expiration, redemption conditions, remaining balance, redemption history. | **CONFIRMED** |
| FR-VCH-006 | Redemption shall be atomic, preventing double redemption and race conditions. | **CONFIRMED** |
| FR-VCH-007 | Voucher transferability, revocation, expiration behavior, merchant permissions, and voucher-specific restrictions. | **TBD / REQUIRES APPROVAL (OD-019..023)** |

### 6.15 Cryptographic Signing — FR-SEC

| ID | Requirement | Status |
|---|---|---|
| FR-SEC-001 | The master voucher signing key shall remain exclusively under CTO control. | **CONFIRMED** |
| FR-SEC-002 | The key shall not be embedded in source code, stored on developer workstations, or accessible by application servers, developers, vendors, or database administrators. | **CONFIRMED** |
| FR-SEC-003 | Signing shall occur through a separately controlled, CTO-authorized signing process/service. | **CONFIRMED** |
| FR-SEC-004 | The key shall not be exposed if application infrastructure is compromised. | **CONFIRMED** |

### 6.16 Admin, Marketing & Communications — FR-ADM

| ID | Requirement | Status |
|---|---|---|
| FR-ADM-001 | Super Admin shall configure business parameters: minimum age, gender values, commission rates, clearing period, sale resubmission limits, voucher redemption mode. | **CONFIRMED** |
| FR-ADM-002 | Admins shall manage photos, videos, advertisement images, landing pages, and promotional materials. | **CONFIRMED** |
| FR-ADM-003 | Members shall be able to forward permitted content via Facebook Messenger and Viber, and download permitted materials. | **CONFIRMED** |
| FR-ADM-004 | Admins shall manage policies, program guidelines, Terms and Conditions, and company rules. | **CONFIRMED** |
| FR-ADM-005 | Admins shall broadcast promotions, training invitations, Zoom/Google Meet invitations, company announcements, and push notifications. | **CONFIRMED** |
| FR-ADM-006 | Admins (super_admin/admin) shall view a per-member conversation inbox and reply within each member's thread; every staff reply is audited. | **CONFIRMED** (owner-approved scope, 2026-09-14 — ADR-013) |

### 6.17 Reporting & Genealogy — FR-RPT

| ID | Requirement | Status |
|---|---|---|
| FR-RPT-001 | Members shall view their Direct Referrals. | **CONFIRMED** |
| FR-RPT-002 | Group Network may exist as a reporting/network concept but must not imply multi-level commission entitlement. | **CONFIRMED** |
| FR-RPT-003 | Total Earned shall be defined against the financial ledger and shall exclude pending/non-available funds; precise definition TBD. | **REQUIRES IMPLEMENTATION DEFINITION (OD-025)** |
| FR-RPT-004 | My Genealogy shall visualize referral relationships without implying multi-level direct referral commissions. | **CONFIRMED** |

### 6.18 Domestic / Abroad Programs — FR-PRG

| ID | Requirement | Status |
|---|---|---|
| FR-PRG-001 | Domestic and Abroad shall operate as separate business programs. | **CONFIRMED** |
| FR-PRG-002 | Programs shall support independent configuration of: registration rules, qualification questions, geolocation requirements, commission rates, referral rules, incentive rules, eligible properties/products. | **CONFIRMED** |
| FR-PRG-003 | Exact differences between Domestic and Abroad rules. | **TBD / REQUIRES APPROVAL (OD-001..005)** |

### 6.19 External Payment Boundary — FR-BND

| ID | Requirement | Status |
|---|---|---|
| FR-BND-001 | JAD shall record payment/payout information without executing actual money movement. | **CONFIRMED** |
| FR-BND-002 | External execution may occur through bank transfer, GCash, or other approved external platforms. | **CONFIRMED** |
| FR-BND-003 | Payment gateway / card processing / wallet-payment-API / POS infrastructure shall be out of scope. | **CONFIRMED** |

---

## 7. Non-Functional Requirements

Numerical targets are marked **TBD** unless explicitly approved. Do not invent targets.

| ID | Category | Requirement | Status |
|---|---|---|---|
| NFR-SEC-001 | Security | The platform shall implement least-privilege access control over all roles and objects. | **CONFIRMED** |
| NFR-SEC-002 | Security | Staff actions on sensitive records (approval, verification, exceptions, adjustments) shall be recorded for audit. | **CONFIRMED** |
| NFR-AUTH-001 | Authentication | Members and staff shall authenticate with verifiable credentials. | **CONFIRMED** |
| NFR-AUTH-002 | Authentication | Email verification shall be required for member accounts. | **CONFIRMED** |
| NFR-AUTHZ-001 | Authorization | Role-based access control shall restrict actions per BUSINESS-RULES.md §3. | **CONFIRMED** |
| NFR-AUTHZ-002 | Authorization | Members shall only access their own records (object-level). | **CONFIRMED** |
| NFR-CONF-001 | Confidentiality | Personal and financial data shall be protected against unauthorized access. | **CONFIRMED** |
| NFR-AUD-001 | Auditability | Financial events and exception workflows shall produce immutable audit trails. | **CONFIRMED** |
| NFR-AVAIL-001 | Availability | Availability target for production services. | **TBD** |
| NFR-INT-001 | Integrity | Financial ledger and voucher redemption operations shall preserve integrity and atomicity. | **CONFIRMED** |
| NFR-REL-001 | Reliability | Reliability/error-handling requirements. | **TBD** |
| NFR-PERF-001 | Performance | Performance targets (throughput, latency) for key operations. | **TBD** |
| NFR-SCAL-001 | Scalability | Scaling requirements for users, sales, and ledger volume. | **TBD** |
| NFR-MAINT-001 | Maintainability | Configurable business parameters shall not require code changes. | **CONFIRMED** |
| NFR-DATA-001 | Data protection | Compliance with applicable data protection obligations for member/customer data. | **CONFIRMED** |
| NFR-CRYPTO-001 | Cryptographic security | Voucher signatures shall be produced only by the CTO-controlled signing process/service; master key inaccessible to application infrastructure. | **CONFIRMED** |
| NFR-ATOM-001 | Atomic transactions | Voucher redemption shall be an atomic transaction preventing double/race redemption. | **CONFIRMED** |
| NFR-ATOM-002 | Atomic transactions | eWallet balance operations (reservation, completion, reversal, adjustment) shall be atomic and prevent negative available balance. | **CONFIRMED** |

---

## 8. User / System Interactions

Concise workflows. (State details are in BUSINESS-RULES.md §5.)

### 8.1 Registration & Qualification
```text
Applicant ─► Register (age, ID, email, qualification questions, optional sponsor code)
    │  Age < min? ─► Blocked (configurable min age, default 18)
    ▼
Email verify ─► Admin ID verification ─► Admin approval
    │                                    │
    ├─ Rejected (reason) ─► Resubmit ─► Pending
    └─ Approved ─► Active + Qualified
```

### 8.2 Sponsor Assignment
```text
Registered without sponsor (Sponsor = None)
    ─► Admin assigns sponsor (approval) ─► Audited
    ─► Sponsor change (circumstances TBD) ─► Admin approval ─► Audited
```

### 8.3 Abroad Geolocation Verification
```text
Abroad registration ─► GPS/device location (primary)
    ─► unavailable ─► IP geolocation (fallback)
    ─► Philippines detected? ─► BLOCK Abroad registration
    ─► Location exception request ─► Admin review (approve/reject) ─► Audited
```

### 8.4 Sale Submission → Qualifying Sale
```text
Active + Qualified seller submits sale ─► Admin approval
    ├─ Rejected (reason) ─► Correct ─► Resubmit (configurable max attempts ─► LOCKED)
    │                                                     └─ Reopen: Admin/Super Admin review (audited)
    └─ Approved ─► Payment verified (Admin/Finance/Super Admin) ─► QUALIFYING SALE
```

### 8.5 Commission Lifecycle
```text
Qualifying Sale ─► Commission created (PENDING) ─► clearing (7 days, configurable)
    ─► CONFIRMED/AVAILABLE ─► eWallet Available Balance ─► Withdrawal eligible

Cancellation before clearing ─► Pending cancelled
Cancellation after clearing   ─► Commission Reversal (original immutable)
Recovery after withdrawal     ─► Super Admin manual resolution
```

### 8.6 eWallet & Withdrawal
```text
Qualifying commission → Available Balance
Member requests withdrawal (≤ Available) → amount Reserved (not reusable)
    ├─ Completed → Permanently Deducted
    └─ Rejected (reason) → Reservation Released → Balance Restored → new request required
```

### 8.7 Voucher Redemption
```text
Merchant scans QR ─► Online redemption via JAD
    ─► Verify: signature, authenticity, status, expiration, conditions, remaining balance, history
    ─► ATOMIC redeem (full/partial) ─► Update remaining value ─► Record history
```

### 8.8 Admin / Super Admin Exceptions
```text
Super Admin: financial adjustment (member, amount, credit/debit, reason, date/time) ─► audited
Super Admin: manual recovery of withdrawn reversed commission ─► audited
Admin: payout account verification (Pending → Review → Confirmed)
```

---

## 9. Business Constraints

- **Single-Level Referral:** Direct Referral commission is paid only to the direct sponsor (BR-REF-001, BR-REF-002).
- **No multi-level direct referral commission** (BR-REF-002; BI-003, BI-004).
- **Admin-controlled properties** — no arbitrary seller-created properties (BR-PRP-001, BR-PRP-002).
- **Immutable financial records** — commissions and ledger entries cannot be edited/deleted (BR-LED-001; BI-005).
- **Pending commissions cannot be withdrawn** and are excluded from Available Balance (BR-COM-006; BI-002).
- **Available Balance must never become negative** (BR-WAL-002; BI-001).
- **Payment execution remains external** — JAD records only (BR-BND-001).
- **CTO-controlled signing key** — master key inaccessible to application infrastructure (BR-SEC-001..004; BI-008).
- **Domestic/Abroad may have separate rules** (BR-PRG-001, BR-PRG-002).
- **No general automatic refund workflow** (BR-CAN-004; BI-010).

---

## 10. Assumptions

The following are working assumptions, **not** confirmed requirements:

> **ASSUMPTION 1:** Authentication ("login") is a required platform capability for members and staff to exercise role-scoped functionality; no specific authentication mechanism or credential policy has been approved (see NFR-AUTH-001).

> **ASSUMPTION 2:** Email delivery (verification, notifications) is an external dependency; no specific provider or deliverability target has been approved.

> **ASSUMPTION 3:** Geolocation services (GPS/IP) are external dependencies; no specific provider or accuracy target has been approved (see OD-014, OD-015).

> **ASSUMPTION 4:** "Customers" are recorded by sellers and have no self-service access to the system (BR-CUS-001).

> **ASSUMPTION 5:** Payout "providers" (banks, GCash, etc.) are external; the final set is TBD (OD-016).

> **ASSUMPTION 6:** Push notification infrastructure is an external dependency (FR-ADM-005).

> **ASSUMPTION 7:** The CTO-controlled signing process/service is external to the application infrastructure (FR-SEC-001..004).

---

## 11. Dependencies

### 11.1 Technical Dependencies
- Email service (verification and notifications) — NFR-AUTH-002, FR-ADM-005.
- Geolocation services (GPS/IP) — FR-GEO-001, FR-GEO-002.
- Push notification infrastructure — FR-ADM-005.
- CTO-controlled signing process/service — FR-SEC-003.
- External payment/payout platforms (bank transfer, GCash, other approved) — FR-BND-002.

### 11.2 Business / Operational Dependencies
- Owner-defined business rules for all OD-001..025 items before those features can be finalized.
- Payment/accounting verification performed by Admin/Finance/Super Admin — FR-SAL-003.
- Admin/Finance operational processes (ID verification, payout verification, sale/payment approval) — FR-REG-002, FR-SAL-002, FR-PAY-003.

---

## 12. Acceptance Criteria

Objective, testable criteria for major requirements.

| AC ID | Requirement | Acceptance Criteria |
|---|---|---|
| AC-REG-001 | FR-REG-001..008 | Given a new applicant: (a) registration is blocked if declared age < configured minimum; (b) status is `Pending` until email verified, ID manually verified, and Admin approves; (c) if rejected, the reason is recorded and displayed and the applicant may resubmit; (d) status becomes `Approved-Active` only when all criteria are satisfied; (e) no purchase step exists at any point in the flow. |
| AC-GEO-001 | FR-GEO-001..006 | Given an Abroad registration: (a) device location is used first, IP as fallback; (b) if the applicant is in the Philippines, registration is blocked with no bypass path except an approved exception; (c) a location exception records applicant, Admin, date/time, reason, and result. |
| AC-REF-001 | FR-REF-001..006 | (a) Every member has a unique, auto-generated referral code that cannot be modified by the member; (b) only Active + Qualified members can become sponsors; (c) a referral relationship is single-level (member's direct referrer only); (d) a member who registered without a sponsor can be assigned one only via Admin approval. |
| AC-SAL-001 | FR-SAL-001..007 | (a) Only Active + Qualified members can submit sales; (b) a sale is Qualifying only after Admin approval and payment verification; (c) rejection requires a reason; (d) resubmission stops and the sale is LOCKED after the configured maximum attempts; (e) reopening a locked sale requires Admin/Super Admin review and is audited. |
| AC-COM-001 | FR-COM-001..008 | (a) Direct Commission = value × configurable rate (baseline 8%); (b) Direct Referral = value × configurable rate (baseline 4%) to the direct sponsor; (c) both may appear for the same qualifying sale; (d) commission is created Pending and does not appear in Available Balance; (e) after the configured clearing period (default 7 days) the commission becomes Available. |
| AC-COM-002 | FR-COM-009..012 | (a) Cancelling the transaction before clearing cancels the Pending commission; (b) cancelling after clearing creates a Commission Reversal leaving the original transaction immutable; (c) no commission record can be edited or deleted through any UI or API. |
| AC-WAL-001 | FR-WAL-001..004 | Given any sequence of ledger operations, Available Balance is never negative, and Pending commissions never contribute to it. |
| AC-WDR-001 | FR-WDR-001..005 | (a) A withdrawal request reserves the amount, which cannot be reused; (b) completion permanently deducts it; (c) rejection releases the reservation, restores the balance, records a reason, and requires a new request (the rejected request cannot be edited/resubmitted). |
| AC-VCH-001 | FR-VCH-001..006 | Given a merchant redemption attempt: (a) all listed verifications run online; (b) the redemption is atomic — two simultaneous attempts result in exactly one successful redemption; (c) partial redemption reduces remaining value correctly and history is recorded. |
| AC-SEC-001 | FR-SEC-001..004 | (a) No application component can access the master signing key; (b) signing is performed only through the CTO-authorized process/service; (c) a simulated application-infrastructure compromise does not expose the key. |
| AC-ADJ-001 | FR-ADJ-001..002 | Only Super Admin can perform a financial adjustment, and every adjustment records member, amount, credit/debit, reason, performing Super Admin, and date/time. |
| AC-BND-001 | FR-BND-001..003 | The system records payment/payout information without executing money movement, and exposes no payment gateway/processing capabilities. |

---

## 13. Requirement Traceability

Maps: Requirement ID → Business Objective → Business Rule ID → Actor → Feature/Capability → Acceptance Criteria → Source → Status.

Source legend: **QA** = latest approved Q&A baseline (reconciled). **TECH** = JA&D Technical Scope. **ADD** = Business Requirements Addendum.

| Requirement | BO | Business Rule | Actor | Feature | AC | Source | Status |
|---|---|---|---|---|---|---|---|
| FR-AUTH-001 | BO-01 | BR-AUTH-001 | Member | Account verification | AC-REG-001 | QA | CONFIRMED |
| FR-AUTH-002 | BO-01 | BR-AUTH-002 | Member | Account statuses | AC-REG-001 | QA | CONFIRMED |
| FR-AUTH-003 | BO-01 | BR-AUTH-003 | Admin | Account approval | AC-REG-001 | QA | CONFIRMED |
| FR-AUTH-004 | BO-08 | — | All | Authentication | — | TECH | CONFIRMED |
| FR-REG-001 | BO-01 | BR-REG-001 | Member | Registration | AC-REG-001 | QA | CONFIRMED |
| FR-REG-002 | BO-01 | BR-REG-002 | Admin | ID verification | AC-REG-001 | QA | CONFIRMED |
| FR-REG-003 | BO-01 | BR-REG-003 | Member | Qualification questions | AC-REG-001 | QA | CONFIRMED |
| FR-REG-004 | BO-01 | BR-REG-004 | Admin | Approval/rejection | AC-REG-001 | QA | CONFIRMED |
| FR-REG-005 | BO-01 | BR-REG-005 | Member | Resubmission | AC-REG-001 | QA | CONFIRMED |
| FR-REG-006 | BO-01 | BR-REG-005 | Super Admin | Resubmission limits | AC-REG-001 | QA | FUTURE / TBD |
| FR-REG-007 | BO-01 | BR-REG-006 | Member | No purchase required | AC-REG-001 | QA | CONFIRMED |
| FR-REG-008 | BO-01 | BR-QUAL-001 | Member | Qualification | AC-REG-001 | QA | CONFIRMED |
| FR-REG-009 | BO-03 | BR-REG-008 | Member | Sponsor-less registration | AC-REF-001 | QA | CONFIRMED |
| FR-REG-010 | BO-03 | BR-REG-009 | Member | Optional sponsor code | AC-REF-001 | QA | CONFIRMED |
| FR-REG-011 | BO-01 | BR-REG-011 | Super Admin | Gender config | — | QA | CONFIRMED |
| FR-REG-012 | BO-01 | BR-REG-010 | Member | Country immutability | — | QA | CONFIRMED |
| FR-MEM-001 | BO-01 | BR-REG-010 | Member | Member profile | — | QA | CONFIRMED |
| FR-GEO-001 | BO-07 | BR-GEO-001 | Member | Abroad geolocation | AC-GEO-001 | QA | CONFIRMED |
| FR-GEO-002 | BO-07 | BR-GEO-001 | Member | IP fallback | AC-GEO-001 | QA | CONFIRMED |
| FR-GEO-003 | BO-07 | BR-GEO-002 | Member | PH block | AC-GEO-001 | QA | CONFIRMED |
| FR-GEO-004 | BO-07 | BR-GEO-003 | Member | Location exception | AC-GEO-001 | QA | CONFIRMED |
| FR-GEO-005 | BO-07 | BR-GEO-003 | Admin | Exception decision | AC-GEO-001 | QA | CONFIRMED |
| FR-GEO-006 | BO-07 | BR-GEO-004 | Admin | Override audit | AC-GEO-001 | QA | CONFIRMED |
| FR-GEO-007 | BO-07 | BR-GEO-005 | Admin | Accuracy threshold | AC-GEO-001 | QA | TBD / REQUIRES APPROVAL |
| FR-GEO-008 | BO-07 | BR-GEO-006 | Admin | Anti-spoofing | AC-GEO-001 | QA | TBD / REQUIRES APPROVAL |
| FR-REF-001 | BO-03 | BR-REF-004 | Member | Referral code | AC-REF-001 | QA | CONFIRMED |
| FR-REF-002 | BO-03 | BR-REF-005 | Admin | Code immutability | AC-REF-001 | QA | CONFIRMED |
| FR-REF-003 | BO-03 | BR-REF-001 | Member | Single-level structure | AC-REF-001 | QA | CONFIRMED |
| FR-REF-004 | BO-03 | BR-REF-003 | Member | Sponsor eligibility | AC-REF-001 | QA | CONFIRMED |
| FR-REF-005 | BO-04 | BR-REF-002 | System | No MLM commission | AC-COM-001 | QA | CONFIRMED |
| FR-REF-006 | BO-03 | BR-REF-006 | Admin | Sponsor assignment | AC-REF-001 | QA | CONFIRMED |
| FR-REF-007 | BO-03 | BR-REF-007 | Admin | Sponsor change | AC-REF-001 | QA | CONFIRMED / TBD |
| FR-CUS-001 | BO-02 | BR-CUS-001 | Active+Qualified | Customer records | — | QA | CONFIRMED |
| FR-CUS-002 | BO-02 | BR-CUS-002 | Active+Qualified | Customer fields | — | QA | CONFIRMED |
| FR-PRP-001 | BO-02 | BR-PRP-001 | Admin | Property catalog | — | QA | CONFIRMED |
| FR-PRP-002 | BO-04 | BR-PRP-002 | Admin | No seller properties | — | QA | CONFIRMED |
| FR-PRP-003 | BO-02 | BR-PRP-003 | Admin | Catalog values | — | QA | CONFIRMED |
| FR-PRP-004 | BO-04 | BR-PRP-004 | System | Historical value | AC-COM-001 | QA | CONFIRMED |
| FR-SAL-001 | BO-02 | BR-SAL-001 | Active+Qualified | Sale submission | AC-SAL-001 | QA | CONFIRMED |
| FR-SAL-002 | BO-02 | BR-SAL-002 | Admin | Sale approval | AC-SAL-001 | QA | CONFIRMED |
| FR-SAL-003 | BO-02 | BR-SAL-003 | Admin/Finance/Super Admin | Payment verification | AC-SAL-001 | QA | CONFIRMED |
| FR-SAL-004 | BO-02 | BR-SAL-004 | System | Qualifying sale | AC-SAL-001 | QA | CONFIRMED |
| FR-SAL-005 | BO-02 | BR-SAL-005 | Active+Qualified | Rejection/resubmit | AC-SAL-001 | QA | CONFIRMED |
| FR-SAL-006 | BO-04 | BR-SAL-006 | Super Admin | Resubmission limit | AC-SAL-001 | QA | CONFIRMED |
| FR-SAL-007 | BO-04 | BR-SAL-007 | Admin/Super Admin | Reopen lock | AC-SAL-001 | QA | CONFIRMED |
| FR-COM-001 | BO-02 | BR-COM-001 | System | Direct Commission | AC-COM-001 | QA | CONFIRMED / PROVISIONAL |
| FR-COM-002 | BO-03 | BR-COM-002 | System | Direct Referral | AC-COM-001 | QA | CONFIRMED / PROVISIONAL |
| FR-COM-003 | BO-02/03 | BR-COM-003 | System | Dual commission | AC-COM-001 | QA | CONFIRMED |
| FR-COM-004 | BO-02 | BR-COM-004 | System | Commission eligibility | AC-COM-001 | QA | CONFIRMED |
| FR-COM-005 | BO-04 | BR-COM-005 | System | Pending creation | AC-COM-001 | QA | CONFIRMED |
| FR-COM-006 | BO-04 | BR-COM-006 | System | Pending exclusion | AC-WAL-001 | QA | CONFIRMED |
| FR-COM-007 | BO-04 | BR-COM-007 | Super Admin | Clearing period | AC-COM-001 | QA | CONFIRMED |
| FR-COM-008 | BO-04 | BR-CLC-001 | System | Lifecycle | AC-COM-001 | QA | CONFIRMED |
| FR-COM-009 | BO-04 | BR-CAN-001 | System | Pending cancel | AC-COM-002 | QA | CONFIRMED |
| FR-COM-010 | BO-04 | BR-CAN-002 | System | Available reversal | AC-COM-002 | QA | CONFIRMED |
| FR-COM-011 | BO-04 | BR-CAN-003 | Super Admin | Withdrawn recovery | AC-COM-002 | QA | CONFIRMED |
| FR-COM-012 | BO-04 | BR-LED-001/002 | System | Ledger immutability | AC-COM-002 | QA | CONFIRMED |
| FR-COM-013 | BO-04 | BR-COM-008 | System | Group Incentive | — | QA | CONFIRMED / TBD |
| FR-WAL-001 | BO-04 | BR-WAL-001 | System | Financial ledger | AC-WAL-001 | QA | CONFIRMED |
| FR-WAL-002 | BO-04 | BR-WAL-001 | System | Ledger types | AC-WAL-001 | QA | CONFIRMED |
| FR-WAL-003 | BO-04 | BR-WAL-002 | System | Non-negative balance | AC-WAL-001 | QA | CONFIRMED |
| FR-WAL-004 | BO-04 | BR-WAL-003 | System | Pending exclusion | AC-WAL-001 | QA | CONFIRMED |
| FR-ADJ-001 | BO-04 | BR-ADJ-001 | Super Admin | Adjustments | AC-ADJ-001 | QA | CONFIRMED |
| FR-ADJ-002 | BO-04 | BR-ADJ-002 | Super Admin | Adjustment audit | AC-ADJ-001 | QA | CONFIRMED |
| FR-PAY-001 | BO-04 | BR-PAY-001 | Member | Multiple accounts | — | QA | CONFIRMED |
| FR-PAY-002 | BO-04 | BR-PAY-002 | Super Admin | Methods | — | QA | CONFIRMED / TBD |
| FR-PAY-003 | BO-04 | BR-PAY-003 | Admin | Verification | — | QA | CONFIRMED |
| FR-PAY-004 | BO-04 | BR-PAY-004 | Admin | Lifecycle | — | QA | CONFIRMED |
| FR-PAY-005 | BO-04 | BR-PAY-005 | System | Verified only | — | QA | CONFIRMED |
| FR-PAY-006 | BO-04 | BR-PAY-006 | Member | Primary account | — | QA | CONFIRMED |
| FR-WDR-001 | BO-04 | BR-WDR-001 | Member | Withdrawal request | AC-WDR-001 | QA | CONFIRMED |
| FR-WDR-002 | BO-04 | BR-WDR-002 | System | Reservation | AC-WDR-001 | QA | CONFIRMED |
| FR-WDR-003 | BO-04 | BR-WDR-003 | System | Completion | AC-WDR-001 | QA | CONFIRMED |
| FR-WDR-004 | BO-04 | BR-WDR-004 | System | Rejection | AC-WDR-001 | QA | CONFIRMED |
| FR-WDR-005 | BO-04 | BR-WDR-005 | System | New request only | AC-WDR-001 | QA | CONFIRMED |
| FR-WDR-006 | BO-04 | BR-WDR-006 | System | Status model | AC-WDR-001 | QA | TBD / REQUIRES APPROVAL |
| FR-VCH-001 | BO-05 | BR-VCH-001 | Merchant | Redemption mode | AC-VCH-001 | QA | CONFIRMED |
| FR-VCH-002 | BO-05 | BR-VCH-002 | System | Partial redemption | AC-VCH-001 | QA | CONFIRMED |
| FR-VCH-003 | BO-05 | BR-VCH-003 | System | History | AC-VCH-001 | QA | CONFIRMED |
| FR-VCH-004 | BO-05 | BR-VCH-004 | Merchant | Online redemption | AC-VCH-001 | QA | CONFIRMED |
| FR-VCH-005 | BO-05 | BR-VCH-005 | System | Verification checks | AC-VCH-001 | QA | CONFIRMED |
| FR-VCH-006 | BO-05 | BR-VCH-006 | System | Atomic redemption | AC-VCH-001 | QA | CONFIRMED |
| FR-VCH-007 | BO-05 | BR-VCH-007 | Merchant | Voucher rules | AC-VCH-001 | QA | TBD / REQUIRES APPROVAL |
| FR-SEC-001 | BO-08 | BR-SEC-001 | CTO | Key control | AC-SEC-001 | QA | CONFIRMED |
| FR-SEC-002 | BO-08 | BR-SEC-002 | CTO | Key isolation | AC-SEC-001 | QA | CONFIRMED |
| FR-SEC-003 | BO-08 | BR-SEC-003 | CTO | Signing service | AC-SEC-001 | QA | CONFIRMED |
| FR-SEC-004 | BO-08 | BR-SEC-004 | System | Compromise resilience | AC-SEC-001 | QA | CONFIRMED |
| FR-ADM-001 | BO-04 | BR-CFG-001 | Super Admin | Config service | — | QA | CONFIRMED |
| FR-ADM-002 | BO-06 | BR-MKT-001 | Admin | Media management | — | QA | CONFIRMED |
| FR-ADM-003 | BO-06 | BR-MKT-002 | Member | Forwarding/download | — | QA | CONFIRMED |
| FR-ADM-004 | BO-06 | BR-NOT-001 | Admin | Policies | — | QA | CONFIRMED |
| FR-ADM-005 | BO-06 | BR-NOT-002 | Admin | Broadcasts | — | QA | CONFIRMED |
| FR-RPT-001 | BO-03 | BR-RPT-001 | Member | Direct Referrals | — | QA | CONFIRMED |
| FR-RPT-002 | BO-03 | BR-RPT-002 | Member | Group Network | — | QA | CONFIRMED |
| FR-RPT-003 | BO-04 | BR-RPT-003 | Member | Total Earned | — | QA | REQUIRES IMPLEMENTATION DEFINITION |
| FR-RPT-004 | BO-03 | BR-RPT-004 | Member | Genealogy | — | QA | CONFIRMED |
| FR-PRG-001 | BO-07 | BR-PRG-001 | Super Admin | Program separation | — | QA | CONFIRMED |
| FR-PRG-002 | BO-07 | BR-PRG-002 | Super Admin | Independent config | — | QA | CONFIRMED |
| FR-PRG-003 | BO-07 | BR-PRG-003 | Super Admin | Program rules | — | QA | TBD / REQUIRES APPROVAL |
| FR-BND-001 | BO-04 | BR-BND-001 | System | Record-only | AC-BND-001 | QA | CONFIRMED |
| FR-BND-002 | BO-04 | BR-BND-002 | External | External execution | AC-BND-001 | QA | CONFIRMED |
| FR-BND-003 | BO-04 | BR-BND-003 | System | Gateway out of scope | AC-BND-001 | QA | CONFIRMED |

---

## 14. Open Owner Decision Items (Summary)

All TBD items are tracked as Owner Decision Items (OD-001..025) in `../business/BUSINESS-RULES.md` §12. Requirements referencing an OD are **not in scope** until the decision is approved:

- FR-REG-006 (OD-024) — max registration attempts
- FR-GEO-007/008 (OD-014/015) — geolocation accuracy & anti-spoofing
- FR-REF-007 (OD-013) — sponsor-change circumstances
- FR-COM-013 (OD-006..012) — Group Incentive parameters
- FR-PAY-002 (OD-016) — payout providers
- FR-WDR-006 (OD-017/018) — withdrawal status model/workflow
- FR-VCH-007 (OD-019..023) — voucher rules
- FR-PRG-003 (OD-001..005) — Domestic/Abroad differences
- FR-RPT-003 (OD-025) — Total Earned definition