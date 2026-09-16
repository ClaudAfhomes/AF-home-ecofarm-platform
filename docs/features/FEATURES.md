# JAD - Feature & Implementation Inventory

> **Authority:** This document is the **authoritative feature and implementation inventory** for the JA&D (JAD) system.
>
> **Governance:** Features are derived from `../requirements/REQUIREMENTS.md` (requirements SSOT) and `../business/BUSINESS-RULES.md` (business rules SSOT). If a feature conflicts with either source, the requirements/business-rules SSOT prevails; record the conflict and mark **REQUIRES OWNER APPROVAL**. Do not invent requirements or business rules.
>
> **Planning authority:** Implementation sequencing, phases, milestones, and MVP scope are defined in `ROADMAP.md`.
>
> **Version:** Project 01 - Feature & Implementation Planning (Baseline v1.0)

---

## 1. Status Vocabulary

| Status | Meaning |
|---|---|
| `NOT_STARTED` | Approved feature; no verified implementation exists |
| `PLANNED` | Approved feature; scheduled in a phase |
| `IN_PROGRESS` | Verified implementation in progress |
| `IMPLEMENTED` | Verified implementation exists |
| `TESTING` | Implementation exists; verification/testing ongoing |
| `COMPLETED` | Implementation verified complete |
| `BLOCKED` | Cannot proceed until an owner decision / external dependency is resolved |
| `DEFERRED` | Deliberately scheduled beyond current planning horizon |

> All features are `NOT_STARTED` at this baseline (verified: repository contains documentation only - no application code).

## 2. Priority Model

| Priority | Meaning |
|---|---|
| `P0` | Critical - required for the core business model / MVP |
| `P1` | High - required for approved capabilities |
| `P2` | Medium - supporting capabilities |
| `P3` | Low / future - owner-decision-gated or deferred |

Where the source documents do not establish a priority, it is marked `TBD - Owner confirmation required`.

---

## 3. Module / Feature Group Mapping

| Feature Group | Group Name | Module (Requirements SSOT) | Features | Phase |
|---|---|---|---|---|
| FG-PLATFORM | Platform Foundation | Global / NFR (AUTH, AUTHZ, AUD, CONF, DATA) | FEAT-001..006 | P1 |
| FG-MEMBERS | Members & Qualification | REG, MEM, AUTH | FEAT-007..013 | P2 |
| FG-REF | Referral & Sponsor | REF, REG | FEAT-019..023 | P3 |
| FG-CATALOG | Customers & Property Catalog | CUS, PRP | FEAT-024..026 | P4 |
| FG-SALES | Sales & Qualifying Sale | SAL | FEAT-027..032 | P4 |
| FG-COMMISSION | Commission Engine | COM, CLC, CAN, LED | FEAT-033..FEAT-040 (FEAT-041 → P12) | P5 / P12 |
| FG-EWALLET | eWallet & Financial Ledger | WAL, ADJ | FEAT-042, FEAT-043, FEAT-071 | P6 |
| FG-MESSAGING | Admin ↔ Member Messaging | MEM, ADM | FEAT-072 | P9 |
| FG-PAYOUT | Payout Accounts | PAY | FEAT-044..047 | P7 |
| FG-WDR | Withdrawals | WDR | FEAT-048..051 | P7 |
| FG-BND | External Payment Boundary | BND | FEAT-070 | P7 |
| FG-VOUCHER | Vouchers & QR Redemption | VCH | FEAT-052..058 | P8 |
| FG-SECURITY | Security & Signing | SEC | FEAT-059 | P8 |
| FG-CONTENT | Marketing, Policies & Notifications | ADM (2..5), MKT, NOT | FEAT-060..063 | P9 |
| FG-REPORTING | Reporting & Genealogy | RPT | FEAT-064..067 | P10 |
| FG-PROGRAMS | Domestic / Abroad Programs | PRG, GEO | FEAT-014..FEAT-018, FEAT-068, FEAT-069 | P11 |
| FG-CONFIG | Platform Configuration | ADM (1), CFG | FEAT-005 | P1 |

> Phase references correspond to `ROADMAP.md` Phase IDs (P1..P12). P0 (Planning & Requirements Baseline) contains no feature records.

---

## 4. Feature Inventory

### FG-PLATFORM - Platform Foundation (P1)

#### FEAT-001 - Platform Foundation & Data Model
| Field | Value |
|---|---|
| Module / Group | FG-PLATFORM |
| Phase | P1 - Foundation & Platform Core |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | NFR-SEC-001 (base), NFR-CONF-001, NFR-DATA-001, NFR-INT-001, NFR-AVAIL-001, NFR-REL-001, NFR-PERF-001, NFR-SCAL-001 |
| Business rules | - (platform enabler) |
| Dependencies | - |

Description: Monorepo/project scaffolding for the approved TypeScript full-stack stack; core data model covering all confirmed entities (members, accounts, sales, commissions, ledger, payout accounts, withdrawals, vouchers, properties, customers, referral relationships); transactional and atomicity foundations.

User story: As a platform engineer, I want a sound foundation and data model, so that confirmed business entities and financial integrity can be built reliably.

Acceptance criteria: Repository scaffolds; schema covers every confirmed entity with stable identities; no payment-gateway/money-movement schema or capabilities exist. Availability/reliability/performance/scalability targets remain **TBD** (NFR-AVAIL-001, NFR-REL-001, NFR-PERF-001, NFR-SCAL-001).

Notes: Tech-stack choice (TypeScript full-stack) recorded as an approved session decision; deployment/infrastructure choices are **OPEN**.

#### FEAT-002 - Authentication & Session Management
| Field | Value |
|---|---|
| Module / Group | FG-PLATFORM |
| Phase | P1 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-AUTH-004, NFR-AUTH-001 |
| Business rules | - |
| Dependencies | FEAT-001 |

Description: Members and staff authenticate to access role-scoped functionality.

User story: As a member, I want to sign in securely, so that I can access my JAD account.

Acceptance criteria: Members and staff authenticate with verifiable credentials; sessions enforce role scoping. Specific credential policy is **ASSUMPTION 1** (no mechanism approved).

#### FEAT-003 - RBAC & Object-Level Authorization
| Field | Value |
|---|---|
| Module / Group | FG-PLATFORM |
| Phase | P1 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | NFR-SEC-001, NFR-AUTHZ-001, NFR-AUTHZ-002 |
| Business rules | BUSINESS-RULES §3 (Role / Permission) |
| Dependencies | FEAT-001, FEAT-002 |

Description: Role-based access control for Super Admin, Admin, Finance, Member, Active + Qualified Member, Merchant; object-level restriction of members to their own records.

User story: As a platform administrator, I want least-privilege role controls, so that members and staff only access authorized records.

Acceptance criteria: Actions are restricted per BUSINESS-RULES.md §3; members cannot access other members' records; no escalation path violates the defined matrix.

#### FEAT-004 - Audit Logging & Immutable Trails
| Field | Value |
|---|---|
| Module / Group | FG-PLATFORM |
| Phase | P1 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | NFR-SEC-002, NFR-AUD-001 |
| Business rules | BR-GEO-004, BR-ADJ-002, BR-SAL-007, BR-REF-007 |
| Dependencies | FEAT-001, FEAT-003 |

Description: Immutable audit trails for financial events and exception workflows (registration approval/rejection, sale approval, payment verification, geolocation override, sponsor changes, locked-sale reopening, financial adjustments, withdrawal actions).

User story: As a Super Admin, I want audit trails on sensitive actions, so that exceptions and adjustments are always traceable.

Acceptance criteria: Every defined exception/verification/approval action records actor, target, date/time, reason (where applicable), and result; trails cannot be edited or deleted.

#### FEAT-005 - Platform Configuration Service
| Field | Value |
|---|---|
| Module / Group | FG-CONFIG |
| Phase | P1 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-ADM-001, NFR-MAINT-001 |
| Business rules | BR-CFG-001 |
| Dependencies | FEAT-001 |

Description: Super Admin configurable business parameters without code changes: minimum age, gender values, commission rates (8%/4% baselines), clearing period (7-day default), sale resubmission limits, voucher redemption mode.

User story: As a Super Admin, I want to adjust business parameters, so that rates and rules can change without redeploying code.

Acceptance criteria: Parameters listed in FR-ADM-001 are configurable by Super Admin; changes take effect for future transactions; parameter changes require no code changes.

#### FEAT-006 - Email Service Integration
| Field | Value |
|---|---|
| Module / Group | FG-PLATFORM |
| Phase | P1 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | NFR-AUTH-002, FR-ADM-005 (email channel) |
| Business rules | BR-AUTH-001 |
| Dependencies | FEAT-001 (external dependency: provider unconfirmed - ASSUMPTION 2) |

Description: Email delivery for verification and notifications.

User story: As an applicant, I want to verify my email, so that my account can be approved.

Acceptance criteria: Verification emails are delivered and processed; provider selection is **OPEN** (ASSUMPTION 2).

---

### FG-MEMBERS - Members & Qualification (P2)

#### FEAT-007 - Member Registration & Account Statuses
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 - Members & Qualification |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-AUTH-002, FR-AUTH-003, FR-REG-007, FR-REG-009, FR-REG-010, FR-REG-012 |
| Business rules | BR-AUTH-002, BR-AUTH-003, BR-REG-006, BR-REG-008, BR-REG-009, BR-REG-010 |
| Dependencies | FEAT-001, FEAT-002, FEAT-003 |

Description: Registration intake with no purchase requirement; optional referral/sponsor code; optional sponsor (Sponsor = None); account statuses Pending / Approved-Active / Rejected; country structured and member-immutable.

User story: As an applicant, I want to register without purchasing anything, so that I can join and eventually qualify.

Acceptance criteria: No purchase step exists in the flow (AC-REG-001); statuses limited to the three confirmed values; registration without sponsor is allowed; optional referral code accepted; member cannot change country.

#### FEAT-008 - Member Profile
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-MEM-001 |
| Business rules | BR-REG-010 |
| Dependencies | FEAT-001, FEAT-007 |

Description: Structured profile fields: First Name, Last Name, Middle Initial, Extension/Suffix, Date of Birth, Gender, Address, Country, Phone, Email, optional Profile Photo.

User story: As a member, I want a complete profile, so that my identity and contact details are on record.

Acceptance criteria: All confirmed fields are captured; profile photo is optional; country is not user-editable.

#### FEAT-009 - Email Verification
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-AUTH-001, NFR-AUTH-002 |
| Business rules | BR-AUTH-001 |
| Dependencies | FEAT-006 |
| Acceptance criteria | Account cannot proceed to approval until the email is verified (AC-REG-001). |

User story: As an applicant, I want my email verified, so that my account can be approved.

#### FEAT-010 - Government ID Submission & Manual Verification
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REG-002 |
| Business rules | BR-REG-002 |
| Dependencies | FEAT-007 |
| Acceptance criteria | Registration requires a valid government-issued ID; only manual Admin verification can mark it verified (AC-REG-001). |

User story: As an applicant, I want to submit my government ID, so that I can be verified for qualification.

#### FEAT-011 - Admin Registration Approval / Rejection
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REG-004, FR-REG-005 |
| Business rules | BR-REG-004, BR-REG-005 |
| Dependencies | FEAT-003, FEAT-009, FEAT-010 |
| Acceptance criteria | Rejection records a mandatory reason; rejected registration can be resubmitted (currently unlimited attempts - OD-024) (AC-REG-001). |

User story: As an Admin, I want to approve or reject registrations with a reason, so that only qualified members become Active.

#### FEAT-012 - Qualification Questions
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REG-003, FR-REG-008 |
| Business rules | BR-REG-003, BR-QUAL-001 |
| Dependencies | FEAT-007 |
| Acceptance criteria | Qualification questions are required and their completion contributes to Active + Qualified status (AC-REG-001). Question content per program is TBD (OD-002). |

User story: As an applicant, I want to complete qualification questions, so that I can reach Active + Qualified status.

#### FEAT-013 - Age Validation (Configurable Minimum)
| Field | Value |
|---|---|
| Module / Group | FG-MEMBERS |
| Phase | P2 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REG-001 |
| Business rules | BR-REG-001 |
| Dependencies | FEAT-005, FEAT-007 |
| Acceptance criteria | Registration blocked when declared age < configured minimum (default 18); minimum configurable by Super Admin (AC-REG-001). |

User story: As a Super Admin, I want the minimum age enforced and configurable, so that eligibility stays current.

---

### FG-REF - Referral & Sponsor (P3)

#### FEAT-019 - Referral Code Generation
| Field | Value |
|---|---|
| Module / Group | FG-REF |
| Phase | P3 - Referral & Sponsor |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REF-001, FR-REF-002 |
| Business rules | BR-REF-004, BR-REF-005, BI-009 |
| Dependencies | FEAT-007 |
| Acceptance criteria | Unique auto-generated code per member; member cannot modify it; Admin normally cannot modify it; relationship persistent (AC-REF-001). |

User story: As a member, I want a unique referral code, so that I can refer others under my account.

#### FEAT-020 - Sponsor Assignment
| Field | Value |
|---|---|
| Module / Group | FG-REF |
| Phase | P3 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REF-006, FR-REG-009, FR-REG-010 |
| Business rules | BR-REF-006, BR-REG-008, BR-REG-009 |
| Dependencies | FEAT-007, FEAT-019 |
| Acceptance criteria | Member registered without sponsor can be assigned one only via Admin approval (AC-REF-001). |

User story: As an Admin, I want to assign sponsors through approval, so that sponsor-less members can be placed in the network.

#### FEAT-021 - Single-Level Referral Relationship
| Field | Value |
|---|---|
| Module / Group | FG-REF |
| Phase | P3 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REF-003, FR-REF-005 |
| Business rules | BR-REF-001, BR-REF-002, BI-003, BI-004 |
| Dependencies | FEAT-019 |
| Acceptance criteria | Referral relationships are strictly single-level; no multi-level direct referral commission is ever awarded (AC-REF-001, AC-COM-001). |

User story: As a member, I want referrals recognized only one level deep, so that the network model stays compliant.

#### FEAT-022 - Sponsor Change Workflow
| Field | Value |
|---|---|
| Module / Group | FG-REF |
| Phase | P3 |
| Priority | P1 |
| Status | BLOCKED |
| Requirements | FR-REF-007 |
| Business rules | BR-REF-007 |
| Dependencies | FEAT-003, FEAT-020 |
| Acceptance criteria | Sponsor changes require Admin approval and are audited. **Exact permitted circumstances are TBD (OD-013).** |
| User story | As an Admin, I want sponsor changes controlled and audited, so that network integrity is preserved. |
| Notes | Workflow control (approval + audit) is CONFIRMED; the circumstances allowing a change are **BLOCKED on OD-013**. |

#### FEAT-023 - Sponsor Eligibility Enforcement
| Field | Value |
|---|---|
| Module / Group | FG-REF |
| Phase | P3 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-REF-004 |
| Business rules | BR-REF-003, BR-QUAL-002 |
| Dependencies | FEAT-007, FEAT-021 |
| Acceptance criteria | Only Active + Qualified members can become sponsors; no purchase is required (AC-REF-001). |

User story: As an Active + Qualified member, I want to sponsor others, so that I can earn Direct Referral commission.

---

### FG-CATALOG - Customers & Property Catalog (P4)

#### FEAT-024 - Customer Records
| Field | Value |
|---|---|
| Module / Group | FG-CATALOG |
| Phase | P4 - Catalog, Customers & Sales |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-CUS-001, FR-CUS-002 |
| Business rules | BR-CUS-001, BR-CUS-002 |
| Dependencies | FEAT-003 |
| Acceptance criteria | Seller can record a non-member customer with Full Name, Phone, Email, Property, Property Value; customer needs no membership (ASSUMPTION 4). |

User story: As an Active + Qualified member, I want to record non-member customers, so that I can submit qualifying sales.

#### FEAT-025 - Admin Property Catalog
| Field | Value |
|---|---|
| Module / Group | FG-CATALOG |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-PRP-001, FR-PRP-002, FR-PRP-003 |
| Business rules | BR-PRP-001, BR-PRP-002, BR-PRP-003 |
| Dependencies | FEAT-001, FEAT-003 |
| Acceptance criteria | Only Admin can manage properties; sellers cannot create arbitrary properties; sale property values come from the catalog. |

User story: As an Admin, I want to control the property catalog, so that values are authoritative and consistent.

#### FEAT-026 - Historical Property Value Preservation
| Field | Value |
|---|---|
| Module / Group | FG-CATALOG |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-PRP-004 |
| Business rules | BR-PRP-004, BI-006 |
| Dependencies | FEAT-025 |
| Acceptance criteria | Transactions snapshot the property value at transaction time; later catalog price changes do not alter existing sales (AC-COM-001). |

User story: As a system, I want historical sale values frozen, so that past commissions remain accurate.

---

### FG-SALES - Sales & Qualifying Sale (P4)

#### FEAT-027 - Sale Submission
| Field | Value |
|---|---|
| Module / Group | FG-SALES |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-SAL-001 |
| Business rules | BR-SAL-001 |
| Dependencies | FEAT-007, FEAT-024, FEAT-025 |
| Acceptance criteria | Only Active + Qualified members can submit sales (AC-SAL-001). |

User story: As an Active + Qualified member, I want to submit customer sales, so that I can earn commission.

#### FEAT-028 - Sale Approval / Rejection with Reason
| Field | Value |
|---|---|
| Module / Group | FG-SALES |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-SAL-002, FR-SAL-005 |
| Business rules | BR-SAL-002, BR-SAL-005 |
| Dependencies | FEAT-003, FEAT-027 |
| Acceptance criteria | Admin approval required; rejection requires a mandatory reason; seller can correct and resubmit (AC-SAL-001). |

User story: As an Admin, I want to approve or reject sales with a reason, so that only valid sales progress.

#### FEAT-029 - Payment Verification
| Field | Value |
|---|---|
| Module / Group | FG-SALES |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-SAL-003 |
| Business rules | BR-SAL-003 |
| Dependencies | FEAT-003, FEAT-028 |
| Acceptance criteria | Payment verification is restricted to Admin, Finance, and Super Admin (AC-SAL-001); JAD records verification only, no money movement (FEAT-070). |

User story: As a Finance officer, I want to verify payments, so that sales can become commission-qualifying.

#### FEAT-030 - Qualifying Sale Determination
| Field | Value |
|---|---|
| Module / Group | FG-SALES |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-SAL-004 |
| Business rules | BR-SAL-004 |
| Dependencies | FEAT-028, FEAT-029 |
| Acceptance criteria | A sale is Qualifying only when submitted + Admin approved + payment verified (AC-SAL-001). |

User story: As a system, I want to determine Qualifying Sales, so that commissions are created correctly.

#### FEAT-031 - Sale Resubmission & Lock
| Field | Value |
|---|---|
| Module / Group | FG-SALES |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-SAL-006 |
| Business rules | BR-SAL-006 |
| Dependencies | FEAT-005, FEAT-028 |
| Acceptance criteria | Maximum resubmission attempts configurable by Super Admin; after max the sale is LOCKED (AC-SAL-001). |

User story: As a Super Admin, I want resubmission limits configurable, so that abuse is prevented.

#### FEAT-032 - Reopening Locked Sales
| Field | Value |
|---|---|
| Module / Group | FG-SALES |
| Phase | P4 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-SAL-007 |
| Business rules | BR-SAL-007 |
| Dependencies | FEAT-003, FEAT-031 |
| Acceptance criteria | Reopening a locked sale requires Admin/Super Admin review and is audited (AC-SAL-001). |

User story: As an Admin, I want to review and reopen locked sales, so that legitimate corrections are possible.

---

### FG-COMMISSION - Commission Engine (P5)

#### FEAT-033 - Direct Commission Engine
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 - Commission Engine |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-001, FR-COM-004 |
| Business rules | BR-COM-001, BR-COM-004 |
| Dependencies | FEAT-005, FEAT-030 |
| Acceptance criteria | Direct Commission = applicable value × configurable rate (baseline 8%); only Active + Qualified members with a Qualifying Sale are eligible (AC-COM-001). |

User story: As an Active + Qualified member, I want to earn Direct Commission on qualifying sales, so that I am rewarded for selling.

#### FEAT-034 - Direct Referral Engine
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-002, FR-COM-003 |
| Business rules | BR-COM-002, BR-COM-003, BI-003 |
| Dependencies | FEAT-005, FEAT-021, FEAT-030 |
| Acceptance criteria | Direct Referral = applicable value × configurable rate (baseline 4%) paid to the direct sponsor; both 8% and 4% may apply to the same qualifying sale (AC-COM-001). |

User story: As a direct sponsor, I want Direct Referral commission, so that I am rewarded for growing the network.

#### FEAT-035 - Commission Creation & Pending Lifecycle
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-005, FR-COM-008 |
| Business rules | BR-COM-005, BR-CLC-001 |
| Dependencies | FEAT-030, FEAT-042 |
| Acceptance criteria | Commission is created immediately as Pending upon qualification; lifecycle Pending → (clearing) → Available → eWallet → withdrawal-eligible (AC-COM-001). |

User story: As a system, I want commissions created as Pending, so that availability is controlled by clearing.

#### FEAT-036 - Commission Clearing Scheduler
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-007 |
| Business rules | BR-COM-007, BR-CLC-002 |
| Dependencies | FEAT-005, FEAT-035 |
| Acceptance criteria | Clearing period defaults to 7 days and is configurable; changes apply to future commissions only (AC-COM-001). |

User story: As a Super Admin, I want the clearing period configurable, so that payout timing can be adjusted.

#### FEAT-037 - Commission Cancellation (Pre-Clearing)
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-009 |
| Business rules | BR-CAN-001 |
| Dependencies | FEAT-035 |
| Acceptance criteria | Cancelling the underlying transaction before clearing cancels the Pending commission (AC-COM-002). |

User story: As a system, I want Pending commissions cancelled on early transaction cancellation, so that ledger stays accurate.

#### FEAT-038 - Commission Reversal (Post-Clearing)
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-010 |
| Business rules | BR-CAN-002 |
| Dependencies | FEAT-035, FEAT-042 |
| Acceptance criteria | Cancelling after clearing creates a Commission Reversal; original transaction remains immutable (AC-COM-002). |

User story: As a system, I want Available commissions reversed on late cancellation, so that the ledger reconciles.

#### FEAT-039 - Withdrawn Commission Recovery
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-011 |
| Business rules | BR-CAN-003 |
| Dependencies | FEAT-003, FEAT-038 |
| Acceptance criteria | Super Admin manually resolves/recovers amounts after an already-withdrawn commission is reversed; action audited. |

User story: As a Super Admin, I want to manually recover withdrawn reversed commissions, so that balances can be corrected.

#### FEAT-040 - Immutable Commission Ledger
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P5 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-COM-012 |
| Business rules | BR-LED-001, BR-LED-002, BI-005 |
| Dependencies | FEAT-001, FEAT-038 |
| Acceptance criteria | Commission records cannot be edited or deleted through any UI/API; corrections use separate transactions (AC-COM-002). |

User story: As a system, I want an immutable commission ledger, so that financial history is trustworthy.

#### FEAT-041 - Group Incentive
| Field | Value |
|---|---|
| Module / Group | FG-COMMISSION |
| Phase | P12 - Group Incentive (deferred) |
| Priority | P3 (concept confirmed; parameters TBD) |
| Status | DEFERRED |
| Requirements | FR-COM-013 |
| Business rules | BR-COM-008 |
| Dependencies | **OD-006..012** (eligibility, rate, formula, trigger, basis, timing, program applicability) |
| Acceptance criteria | TBD - defined only after Owner decisions OD-006..012. Must not create multi-level commission (BI-004). |
| User story | As an Active + Qualified member, I want to earn a group bonus, so that team performance is rewarded. |
| Notes | Concept is CONFIRMED; **all parameters are BLOCKED on OD-006..012**. Do not invent. |

---

### FG-EWALLET - eWallet & Financial Ledger (P6)

#### FEAT-042 - Financial Ledger
| Field | Value |
|---|---|
| Module / Group | FG-EWALLET |
| Phase | P6 - eWallet & Financial Ledger |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-WAL-001, FR-WAL-002 |
| Business rules | BR-WAL-001 |
| Dependencies | FEAT-001, FEAT-035 |
| Acceptance criteria | Ledger covers: Direct Commission, Direct Referral, Group Incentive, Withdrawal, Withdrawal Reservation, Withdrawal Completion, Withdrawal Reversal, Commission Reversal, Financial Adjustment; records immutable (AC-WAL-001). |

User story: As a member, I want a complete financial ledger, so that every credit and debit is traceable.

#### FEAT-043 - Available Balance (Non-Negative, Excludes Pending)
| Field | Value |
|---|---|
| Module / Group | FG-EWALLET |
| Phase | P6 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-WAL-003, FR-WAL-004 |
| Business rules | BR-WAL-002, BR-WAL-003, BI-001, BI-002 |
| Dependencies | FEAT-042 |
| Acceptance criteria | Available Balance is never negative across any operation sequence; Pending commissions never contribute to it (AC-WAL-001, NFR-ATOM-002). |

User story: As a member, I want my available balance accurate, so that I only withdraw real funds.

#### FEAT-071 - Financial Adjustments (Super Admin)
| Field | Value |
|---|---|
| Module / Group | FG-EWALLET |
| Phase | P6 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-ADJ-001, FR-ADJ-002 |
| Business rules | BR-ADJ-001, BR-ADJ-002 |
| Dependencies | FEAT-003, FEAT-042 |
| Acceptance criteria | Only Super Admin can adjust; every adjustment records Member, Amount, Credit/Debit, Reason, Performing Super Admin, Date/time (AC-ADJ-001). |

User story: As a Super Admin, I want to apply financial adjustments, so that verified corrections can be made.

---

### FG-MESSAGING - Admin ↔ Member Messaging (P9)

#### FEAT-072 - Admin ↔ Member Messaging (one thread per member)
| Field | Value |
|---|---|
| Module / Group | FG-MESSAGING |
| Phase | P9 |
| Priority | P0 |
| Status | CONFIRMED |
| Requirements | FR-MEM-0xx, FR-ADM-0xx (messaging) |
| Business rules | BR-MSG-001, BR-MSG-002, BR-MSG-003, BR-MSG-004 |
| Dependencies | FEAT-003 (auth), FEAT-063 (content/notification foundation) |
| Acceptance criteria | Members can send messages to the admin team and receive replies in the same thread; staff can reply from the inbox; unread counts and read watermarks are maintained per side; live updates arrive via Realtime (ADR-013). |

User story: As a member, I want to message the admin team and read their replies, so that I can get questions answered without leaving the platform.

---

### FG-PAYOUT - Payout Accounts (P7)

#### FEAT-044 - Payout Account Management
| Field | Value |
|---|---|
| Module / Group | FG-PAYOUT |
| Phase | P7 - Payouts & Withdrawals |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-PAY-001, FR-PAY-006 |
| Business rules | BR-PAY-001, BR-PAY-006 |
| Dependencies | FEAT-003 |
| Acceptance criteria | Members can maintain multiple payout accounts; one may be designated Primary. |

User story: As a member, I want to manage payout accounts, so that I can receive withdrawals.

#### FEAT-045 - Payout Account Verification
| Field | Value |
|---|---|
| Module / Group | FG-PAYOUT |
| Phase | P7 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-PAY-003, FR-PAY-004 |
| Business rules | BR-PAY-003, BR-PAY-004 |
| Dependencies | FEAT-003, FEAT-044 |
| Acceptance criteria | Accounts require Admin verification before use; lifecycle Pending → Admin Review → Confirmed. |

User story: As an Admin, I want to verify payout accounts, so that only legitimate accounts receive funds.

#### FEAT-046 - Verified-Account Withdrawal Selection
| Field | Value |
|---|---|
| Module / Group | FG-PAYOUT |
| Phase | P7 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-PAY-005 |
| Business rules | BR-PAY-005 |
| Dependencies | FEAT-045 |
| Acceptance criteria | Only verified accounts are selectable for withdrawal. |

User story: As a member, I want to withdraw only through verified accounts, so that payouts are safe.

#### FEAT-047 - Payout Methods
| Field | Value |
|---|---|
| Module / Group | FG-PAYOUT |
| Phase | P7 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-PAY-002 |
| Business rules | BR-PAY-002 |
| Dependencies | **OD-016** (final supported providers) |
| Acceptance criteria | TBD - final provider set per OD-016. |
| User story | As a member, I want supported payout methods, so that I can choose how to receive funds. |
| Notes | Candidates: traditional banks, digital banks, GCash, other. **Final set BLOCKED on OD-016.** |

---

### FG-WDR - Withdrawals (P7)

#### FEAT-048 - Withdrawal Request & Reservation
| Field | Value |
|---|---|
| Module / Group | FG-WDR |
| Phase | P7 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-WDR-001, FR-WDR-002 |
| Business rules | BR-WDR-001, BR-WDR-002 |
| Dependencies | FEAT-043, FEAT-046 |
| Acceptance criteria | Request up to Available Balance; amount reserved and not reusable (AC-WDR-001). |

User story: As a member, I want to request withdrawals up to my available balance, so that I can cash out.

#### FEAT-049 - Withdrawal Completion
| Field | Value |
|---|---|
| Module / Group | FG-WDR |
| Phase | P7 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-WDR-003 |
| Business rules | BR-WDR-003 |
| Dependencies | FEAT-048 |
| Acceptance criteria | Completed withdrawal is permanently deducted (AC-WDR-001). |

User story: As a member, I want completed withdrawals final, so that my balance reflects reality.

#### FEAT-050 - Withdrawal Rejection & Release
| Field | Value |
|---|---|
| Module / Group | FG-WDR |
| Phase | P7 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-WDR-004, FR-WDR-005 |
| Business rules | BR-WDR-004, BR-WDR-005 |
| Dependencies | FEAT-048 |
| Acceptance criteria | Rejection releases reservation and restores balance; rejection records a reason; rejected request cannot be edited/resubmitted - a new request is required (AC-WDR-001). |

User story: As a member, I want rejected withdrawals released and re-requested, so that I retain control of my funds.

#### FEAT-051 - Withdrawal Status Model
| Field | Value |
|---|---|
| Module / Group | FG-WDR |
| Phase | P7 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-WDR-006 |
| Business rules | BR-WDR-006 |
| Dependencies | **OD-017, OD-018** (final processing workflow & status model) |
| Acceptance criteria | TBD - defined only after OD-017/018. Do not invent additional states. |
| User story | As an operator, I want a defined withdrawal status model, so that processing is predictable. |
| Notes | **BLOCKED on OD-017/018.** |

---

### FG-BND - External Payment Boundary (P7)

#### FEAT-070 - External Payment/Payout Boundary Records
| Field | Value |
|---|---|
| Module / Group | FG-BND |
| Phase | P7 |
| Priority | P0 |
| Status | NOT_STARTED |
| Requirements | FR-BND-001, FR-BND-002, FR-BND-003 |
| Business rules | BR-BND-001, BR-BND-002, BR-BND-003 |
| Dependencies | FEAT-029, FEAT-048 |
| Acceptance criteria | JAD records payment/payout information without executing money movement; external execution (bank transfer, GCash, other approved) is referenced but not implemented; no payment gateway/processing capabilities exposed (AC-BND-001). |

User story: As a system, I want to record payments and payouts, so that external platforms can execute money movement.

---

### FG-VOUCHER - Vouchers & QR Redemption (P8)

> **Implemented model (ADR-014, 2026-09-15):** the FEAT-052..059 P8 entries below describe
> the CTO-signing / merchant-redemption architecture and are **PROPOSED / future**. The
> implemented vouchers flow (Phase B7, in the admin + member apps) is: **admin "Create
> Voucher"** (a definition - title + value, no member), **"Assign to Member"** on the voucher
> detail page (member + per-assignment expiry/validity → unique member voucher +
> locally-generated QR), **admin QR scan** (`/admin/vouchers/scan` verify-only) and **admin
> redeem in full** (`/admin/vouchers/:id/redeem`). Partial redemption, merchant portal, and
> signing service remain gated (OD-019..023, ADR-007).

#### FEAT-052 - Voucher Issuance & Signing Flow
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 - Vouchers & QR Redemption Security |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-SEC-001..003 (signing enablers) |
| Business rules | BR-SEC-001..003 |
| Dependencies | FEAT-059 (CTO signing service), FEAT-005 |
| Acceptance criteria | Vouchers are issued through the CTO-authorized signing process only; no application component produces signatures. |
| User story | As the CTO, I want vouchers signed only through the controlled process, so that they cannot be forged. |
| Notes | Voucher issuance is a necessary consequence of the confirmed signing/redemption requirements; issuance workflow specifics are **ASSUMPTION** (no issuance requirements exist beyond signing and redemption). |

#### FEAT-053 - Voucher Redemption (Full / Partial)
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-VCH-001, FR-VCH-002 |
| Business rules | BR-VCH-001, BR-VCH-002 |
| Dependencies | FEAT-005, FEAT-056 |
| Acceptance criteria | Redemption mode (full/partial) configurable; partial redemption reduces remaining value by redeemed amount (AC-VCH-001). |

User story: As a merchant, I want to redeem vouchers fully or partially, so that value is consumed accurately.

#### FEAT-054 - Redemption History
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-VCH-003 |
| Business rules | BR-VCH-003 |
| Dependencies | FEAT-053 |
| Acceptance criteria | Every redemption is recorded and retained (AC-VCH-001). |

User story: As an Admin, I want redemption history retained, so that voucher usage is auditable.

#### FEAT-055 - Online Merchant Redemption Portal
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-VCH-004 |
| Business rules | BR-VCH-004 |
| Dependencies | FEAT-003, FEAT-053 |
| Acceptance criteria | Merchant redemption occurs online through JAD; no offline redemption path (AC-VCH-001). |

User story: As a merchant, I want to redeem vouchers online through JAD, so that redemption is secure and verified.

#### FEAT-056 - Redemption Verification Checks
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-VCH-005 |
| Business rules | BR-VCH-005 |
| Dependencies | FEAT-052, FEAT-054 |
| Acceptance criteria | Redemption verifies signature, authenticity, status, expiration, conditions, remaining balance, and history (AC-VCH-001). |

User story: As a system, I want full verification before redemption, so that invalid vouchers are rejected.

#### FEAT-057 - Atomic Redemption
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-VCH-006 |
| Business rules | BR-VCH-006, BI-007 |
| Dependencies | FEAT-056 |
| Acceptance criteria | Two simultaneous redemption attempts yield exactly one successful redemption; no double/spoofed redemption (AC-VCH-001, NFR-ATOM-001). |

User story: As a system, I want atomic redemption, so that vouchers cannot be double-redeemed.

#### FEAT-058 - Voucher Rules (Transfer / Revoke / Expiry / Merchant Permissions)
| Field | Value |
|---|---|
| Module / Group | FG-VOUCHER |
| Phase | P8 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-VCH-007 |
| Business rules | BR-VCH-007 |
| Dependencies | **OD-019..023** |
| Acceptance criteria | TBD - defined only after OD-019..023. |
| User story | As an Admin, I want voucher rules defined, so that voucher use is controlled. |
| Notes | **BLOCKED on OD-019..023.** |

---

### FG-SECURITY - Security & Signing (P8)

#### FEAT-059 - CTO-Controlled Signing Service Integration
| Field | Value |
|---|---|
| Module / Group | FG-SECURITY |
| Phase | P8 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-SEC-001..004 |
| Business rules | BR-SEC-001..004, BI-008 |
| Dependencies | External CTO-authorized signing process/service (ASSUMPTION 7); FEAT-052 |
| Acceptance criteria | Master signing key never embedded in code, never on dev workstations, never accessible by app servers, developers, vendors, or DBAs; signing only through the CTO-authorized service; app-infrastructure compromise does not expose the key (AC-SEC-001, NFR-CRYPTO-001). |

User story: As the CTO, I want the signing key exclusively under my control, so that vouchers cannot be forged.

---

### FG-CONTENT - Marketing, Policies & Notifications (P9)

#### FEAT-060 - Media Management
| Field | Value |
|---|---|
| Module / Group | FG-CONTENT |
| Phase | P9 - Marketing, Policies & Notifications |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-ADM-002 |
| Business rules | BR-MKT-001 |
| Dependencies | FEAT-003 |
| Acceptance criteria | Admins manage photos, videos, advertisement images, landing pages, promotional materials. |

User story: As an Admin, I want to manage media, so that promotions are current.

#### FEAT-061 - Content Forwarding & Download
| Field | Value |
|---|---|
| Module / Group | FG-CONTENT |
| Phase | P9 |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-ADM-003 |
| Business rules | BR-MKT-002 |
| Dependencies | FEAT-060 |
| Acceptance criteria | Members can forward permitted content via Facebook Messenger and Viber, and download permitted materials. |

User story: As a member, I want to forward permitted materials, so that I can share promotions with my network.

#### FEAT-062 - Policies & Guidelines Management
| Field | Value |
|---|---|
| Module / Group | FG-CONTENT |
| Phase | P9 |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-ADM-004 |
| Business rules | BR-NOT-001 |
| Dependencies | FEAT-003 |
| Acceptance criteria | Admins manage policies, program guidelines, Terms and Conditions, company rules. |

User story: As an Admin, I want to manage policies, so that members see the latest rules.

#### FEAT-063 - Broadcasts & Push Notifications
| Field | Value |
|---|---|
| Module / Group | FG-CONTENT |
| Phase | P9 |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-ADM-005 |
| Business rules | BR-NOT-002 |
| Dependencies | External push infrastructure (ASSUMPTION 6); FEAT-003 |
| Acceptance criteria | Admins broadcast promotions, training invitations, Zoom/Google Meet invitations, company announcements, push notifications. |

User story: As an Admin, I want to broadcast updates, so that members are informed.

---

### FG-REPORTING - Reporting & Genealogy (P10)

#### FEAT-064 - Direct Referrals View
| Field | Value |
|---|---|
| Module / Group | FG-REPORTING |
| Phase | P10 - Reporting & Genealogy |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-RPT-001 |
| Business rules | BR-RPT-001 |
| Dependencies | FEAT-021, FEAT-042 |
| Acceptance criteria | Member can view their direct referrals consistent with the single-level model. |

User story: As a member, I want to view my direct referrals, so that I understand my network.

#### FEAT-065 - Group Network View
| Field | Value |
|---|---|
| Module / Group | FG-REPORTING |
| Phase | P10 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-RPT-002 |
| Business rules | BR-RPT-002, BI-004 |
| Dependencies | FEAT-064 |
| Acceptance criteria | Group Network is a reporting concept only; it never implies or computes multi-level commission entitlement. |

User story: As a member, I want a network overview, so that I can monitor growth without implied commissions.

#### FEAT-066 - Total Earned
| Field | Value |
|---|---|
| Module / Group | FG-REPORTING |
| Phase | P10 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-RPT-003 |
| Business rules | BR-RPT-003 |
| Dependencies | **OD-025** (precise definition against the ledger); FEAT-042 |
| Acceptance criteria | TBD - must be ledger-defined and must exclude pending/non-available funds once OD-025 is decided. |
| User story | As a member, I want an accurate Total Earned, so that I know what I have truly earned. |
| Notes | **BLOCKED on OD-025.** |

#### FEAT-067 - My Genealogy Visualization
| Field | Value |
|---|---|
| Module / Group | FG-REPORTING |
| Phase | P10 |
| Priority | P1 |
| Status | NOT_STARTED |
| Requirements | FR-RPT-004 |
| Business rules | BR-RPT-004, BI-004 |
| Dependencies | FEAT-021 |
| Acceptance criteria | Genealogy visualizes referral relationships without implying multi-level direct referral commissions. |

User story: As a member, I want to view my genealogy, so that I can see my referral tree.

---

### FG-PROGRAMS - Domestic / Abroad Programs (P11)

#### FEAT-014 - Abroad Geolocation Determination
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS (GEO) |
| Phase | P11 - Abroad Program & Geolocation |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-GEO-001, FR-GEO-002 |
| Business rules | BR-GEO-001 |
| Dependencies | External geolocation services (ASSUMPTION 3); FEAT-001 |
| Acceptance criteria | Device location primary; IP geolocation fallback (AC-GEO-001). |

User story: As an Abroad applicant, I want my location determined, so that I can register in the correct program.

#### FEAT-015 - Philippines Detection & Abroad Block
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS (GEO) |
| Phase | P11 |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-GEO-003 |
| Business rules | BR-GEO-002 |
| Dependencies | FEAT-014 |
| Acceptance criteria | Philippines detection blocks Abroad registration with no bypass except an approved exception (AC-GEO-001). |

User story: As a system, I want to block Philippines-based applicants from the Abroad program, so that program boundaries hold.

#### FEAT-016 - Location Exception Workflow
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS (GEO) |
| Phase | P11 |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-GEO-004, FR-GEO-005, FR-GEO-006 |
| Business rules | BR-GEO-003, BR-GEO-004 |
| Dependencies | FEAT-003, FEAT-015 |
| Acceptance criteria | Applicant can request a location exception; Admin approves/rejects; every override records applicant, Admin, date/time, reason, result (AC-GEO-001). |

User story: As an Abroad applicant, I want to request a location exception, so that genuine edge cases can be reviewed.

#### FEAT-017 - Geolocation Accuracy Threshold
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS (GEO) |
| Phase | P11 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-GEO-007 |
| Business rules | BR-GEO-005 |
| Dependencies | **OD-014** |
| Acceptance criteria | TBD - defined only after OD-014. |
| User story | As a system, I want a location accuracy threshold, so that spoofed locations are rejected. |
| Notes | **BLOCKED on OD-014.** |

#### FEAT-018 - Anti-GPS-Spoofing
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS (GEO) |
| Phase | P11 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-GEO-008 |
| Business rules | BR-GEO-006 |
| Dependencies | **OD-015** |
| Acceptance criteria | TBD - defined only after OD-015. |
| User story | As a system, I want anti-spoofing protections, so that Abroad eligibility is not gamed. |
| Notes | **BLOCKED on OD-015.** |

#### FEAT-068 - Program Separation & Independent Configuration
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS |
| Phase | P11 |
| Priority | P2 |
| Status | NOT_STARTED |
| Requirements | FR-PRG-001, FR-PRG-002 |
| Business rules | BR-PRG-001, BR-PRG-002 |
| Dependencies | FEAT-005, FEAT-007 |
| Acceptance criteria | Domestic and Abroad operate as separate programs with independent configuration for registration rules, qualification questions, geolocation requirements, commission rates, referral rules, incentive rules, eligible properties/products. |

User story: As a Super Admin, I want programs configured independently, so that Domestic and Abroad operate by their own rules.

#### FEAT-069 - Domestic / Abroad Rule Differences
| Field | Value |
|---|---|
| Module / Group | FG-PROGRAMS |
| Phase | P11 |
| Priority | P3 |
| Status | BLOCKED |
| Requirements | FR-PRG-003 |
| Business rules | BR-PRG-003 |
| Dependencies | **OD-001..005** |
| Acceptance criteria | TBD - defined only after OD-001..005. |
| User story | As a Super Admin, I want exact program rules defined, so that program-specific behavior is correct. |
| Notes | **BLOCKED on OD-001..005.** |

---

## 5. Traceability

### 5.1 Functional Requirements → Feature

| Requirement | Feature(s) |
|---|---|
| FR-AUTH-001 | FEAT-009 |
| FR-AUTH-002 | FEAT-007 |
| FR-AUTH-003 | FEAT-007 |
| FR-AUTH-004 | FEAT-002 |
| FR-REG-001 | FEAT-013 |
| FR-REG-002 | FEAT-010 |
| FR-REG-003 | FEAT-012 |
| FR-REG-004 | FEAT-011 |
| FR-REG-005 | FEAT-011 |
| FR-REG-006 | (future - OD-024; no active feature) |
| FR-REG-007 | FEAT-007 |
| FR-REG-008 | FEAT-012 |
| FR-REG-009 | FEAT-007, FEAT-020 |
| FR-REG-010 | FEAT-007, FEAT-020 |
| FR-REG-011 | FEAT-005 |
| FR-REG-012 | FEAT-007 |
| FR-MEM-001 | FEAT-008 |
| FR-GEO-001 | FEAT-014 |
| FR-GEO-002 | FEAT-014 |
| FR-GEO-003 | FEAT-015 |
| FR-GEO-004 | FEAT-016 |
| FR-GEO-005 | FEAT-016 |
| FR-GEO-006 | FEAT-016 |
| FR-GEO-007 | FEAT-017 |
| FR-GEO-008 | FEAT-018 |
| FR-REF-001 | FEAT-019 |
| FR-REF-002 | FEAT-019 |
| FR-REF-003 | FEAT-021 |
| FR-REF-004 | FEAT-023 |
| FR-REF-005 | FEAT-021 |
| FR-REF-006 | FEAT-020 |
| FR-REF-007 | FEAT-022 |
| FR-CUS-001 | FEAT-024 |
| FR-CUS-002 | FEAT-024 |
| FR-PRP-001 | FEAT-025 |
| FR-PRP-002 | FEAT-025 |
| FR-PRP-003 | FEAT-025 |
| FR-PRP-004 | FEAT-026 |
| FR-SAL-001 | FEAT-027 |
| FR-SAL-002 | FEAT-028 |
| FR-SAL-003 | FEAT-029 |
| FR-SAL-004 | FEAT-030 |
| FR-SAL-005 | FEAT-028 |
| FR-SAL-006 | FEAT-031 |
| FR-SAL-007 | FEAT-032 |
| FR-COM-001 | FEAT-033 |
| FR-COM-002 | FEAT-034 |
| FR-COM-003 | FEAT-034 |
| FR-COM-004 | FEAT-033 |
| FR-COM-005 | FEAT-035 |
| FR-COM-006 | FEAT-043 |
| FR-COM-007 | FEAT-036 |
| FR-COM-008 | FEAT-035 |
| FR-COM-009 | FEAT-037 |
| FR-COM-010 | FEAT-038 |
| FR-COM-011 | FEAT-039 |
| FR-COM-012 | FEAT-040 |
| FR-COM-013 | FEAT-041 |
| FR-WAL-001 | FEAT-042 |
| FR-WAL-002 | FEAT-042 |
| FR-WAL-003 | FEAT-043 |
| FR-WAL-004 | FEAT-043 |
| FR-ADJ-001 | FEAT-071 |
| FR-ADJ-002 | FEAT-071 |
| FR-PAY-001 | FEAT-044 |
| FR-PAY-002 | FEAT-047 |
| FR-PAY-003 | FEAT-045 |
| FR-PAY-004 | FEAT-045 |
| FR-PAY-005 | FEAT-046 |
| FR-PAY-006 | FEAT-044 |
| FR-WDR-001 | FEAT-048 |
| FR-WDR-002 | FEAT-048 |
| FR-WDR-003 | FEAT-049 |
| FR-WDR-004 | FEAT-050 |
| FR-WDR-005 | FEAT-050 |
| FR-WDR-006 | FEAT-051 |
| FR-VCH-001 | FEAT-053 |
| FR-VCH-002 | FEAT-053 |
| FR-VCH-003 | FEAT-054 |
| FR-VCH-004 | FEAT-055 |
| FR-VCH-005 | FEAT-056 |
| FR-VCH-006 | FEAT-057 |
| FR-VCH-007 | FEAT-058 |
| FR-SEC-001 | FEAT-052, FEAT-059 |
| FR-SEC-002 | FEAT-059 |
| FR-SEC-003 | FEAT-052, FEAT-059 |
| FR-SEC-004 | FEAT-059 |
| FR-ADM-001 | FEAT-005 |
| FR-ADM-002 | FEAT-060 |
| FR-ADM-003 | FEAT-061 |
| FR-ADM-004 | FEAT-062 |
| FR-ADM-005 | FEAT-063 |
| FR-RPT-001 | FEAT-064 |
| FR-RPT-002 | FEAT-065 |
| FR-RPT-003 | FEAT-066 |
| FR-RPT-004 | FEAT-067 |
| FR-PRG-001 | FEAT-068 |
| FR-PRG-002 | FEAT-068 |
| FR-PRG-003 | FEAT-069 |
| FR-BND-001 | FEAT-070 |
| FR-BND-002 | FEAT-070 |
| FR-BND-003 | FEAT-070 |

### 5.2 Non-Functional Requirements → Feature

| Requirement | Feature(s) |
|---|---|
| NFR-SEC-001 | FEAT-003 |
| NFR-SEC-002 | FEAT-004 |
| NFR-AUTH-001 | FEAT-002 |
| NFR-AUTH-002 | FEAT-009 |
| NFR-AUTHZ-001 | FEAT-003 |
| NFR-AUTHZ-002 | FEAT-003 |
| NFR-CONF-001 | FEAT-001, FEAT-003 |
| NFR-AUD-001 | FEAT-004 |
| NFR-AVAIL-001 | FEAT-001 (target TBD) |
| NFR-INT-001 | FEAT-043, FEAT-057 |
| NFR-REL-001 | FEAT-001 (target TBD) |
| NFR-PERF-001 | FEAT-001 (target TBD) |
| NFR-SCAL-001 | FEAT-001 (target TBD) |
| NFR-MAINT-001 | FEAT-005 |
| NFR-DATA-001 | FEAT-001 |
| NFR-CRYPTO-001 | FEAT-059 |
| NFR-ATOM-001 | FEAT-057 |
| NFR-ATOM-002 | FEAT-043 |

### 5.3 Business Rules → Feature

Every feature references its governing business rules in the Feature Inventory above. Rule coverage is summarized:

| Business Rule module | Governing feature(s) |
|---|---|
| BR-AUTH-001..003 | FEAT-007, FEAT-009 |
| BR-REG-001..011 | FEAT-005, FEAT-007, FEAT-010..013, FEAT-020 |
| BR-QUAL-001..002 | FEAT-012, FEAT-023 |
| BR-GEO-001..006 | FEAT-014..018 |
| BR-REF-001..007 | FEAT-019..023 |
| BR-CUS-001..002 | FEAT-024 |
| BR-PRP-001..004 | FEAT-025, FEAT-026 |
| BR-SAL-001..007 | FEAT-027..032 |
| BR-COM-001..008 | FEAT-033..036, FEAT-041 |
| BR-CLC-001..002 | FEAT-035, FEAT-036 |
| BR-CAN-001..004 | FEAT-037..039 |
| BR-LED-001..002 | FEAT-040 |
| BR-WAL-001..003 | FEAT-042, FEAT-043 |
| BR-ADJ-001..002 | FEAT-071 |
| BR-PAY-001..006 | FEAT-044..047 |
| BR-WDR-001..006 | FEAT-048..051 |
| BR-VCH-001..007 | FEAT-053..058 |
| BR-SEC-001..004 | FEAT-052, FEAT-059 |
| BR-MKT-001..002 | FEAT-060, FEAT-061 |
| BR-NOT-001..002 | FEAT-062, FEAT-063 |
| BR-RPT-001..004 | FEAT-064..067 |
| BR-PRG-001..003 | FEAT-014..018, FEAT-068, FEAT-069 |
| BR-BND-001..003 | FEAT-070 |
| BR-CFG-001 | FEAT-005 |

---

## 6. Gaps & Open Items

### 6.1 Features Blocked on Owner Decisions

| Feature | Blocking decision(s) |
|---|---|
| FEAT-017 | OD-014 (geolocation accuracy threshold) |
| FEAT-018 | OD-015 (anti-GPS-spoofing) |
| FEAT-022 | OD-013 (sponsor-change circumstances; workflow itself is confirmed) |
| FEAT-041 | OD-006..012 (Group Incentive parameters) - status DEFERRED |
| FEAT-047 | OD-016 (final payout providers) |
| FEAT-051 | OD-017, OD-018 (withdrawal status model / workflow) |
| FEAT-058 | OD-019..023 (voucher transfer/revoke/expiry/merchant permissions) |
| FEAT-066 | OD-025 (Total Earned definition) |
| FEAT-069 | OD-001..005 (Domestic/Abroad rule differences) |

### 6.2 Requirements with No Active Feature
- **FR-REG-006** (max registration attempts) - explicitly FUTURE scope (OD-024). No feature until approved. Recorded intentionally.

### 6.3 Traceability Status
- All CONFIRMED functional requirements mapped to at least one feature. **No orphaned confirmed requirements.**
- NFR numerical targets (NFR-AVAIL-001, NFR-REL-001, NFR-PERF-001, NFR-SCAL-001) are TBD and apply to FEAT-001.
- Business-rule coverage is complete (see §5.3).

### 6.4 Assumptions Applied
- ASSUMPTION 1 (authentication as platform capability) → FEAT-002.
- ASSUMPTION 2 (email service external) → FEAT-006.
- ASSUMPTION 3 (geolocation services external) → FEAT-014.
- ASSUMPTION 4 (customers have no self-service access) → FEAT-024.
- ASSUMPTION 5 (payout providers external) → FEAT-047.
- ASSUMPTION 6 (push notification infrastructure external) → FEAT-063.
- ASSUMPTION 7 (CTO signing service external to app infrastructure) → FEAT-052, FEAT-059.
- Voucher issuance is a necessary consequence of confirmed signing/redemption requirements; issuance workflow specifics are an assumption (see FEAT-052).