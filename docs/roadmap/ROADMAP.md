# JAD - Implementation Roadmap & Feature Planning

> **Authority:** This document defines the **implementation planning SSOT** for the JA&D (JAD) system: phases, milestones, feature groups, dependencies, implementation sequence, MVP scope, exit criteria, and risks.
>
> **Planning authority and limitations:** This roadmap sequences and schedules **only** requirements and rules already approved in `../requirements/REQUIREMENTS.md` and `../business/BUSINESS-RULES.md`. It does **not** approve, modify, or invent requirements, business rules, priorities, or decisions. Items marked `TBD`, `OPEN`, or `ASSUMPTION` require Owner/Stakeholder confirmation.
>
> **Companion document:** The feature inventory is maintained in `../features/FEATURES.md`. Features are referenced here by ID.
>
> **Version:** Project 01 - Feature & Implementation Planning (Baseline v1.0)

---

## 1. Project Overview

### 1.1 Purpose

The roadmap establishes the logical build order for the JAD platform from its confirmed requirements and business rules. It groups work into phases that respect hard dependencies (e.g., qualifying sale → commission → clearing → eWallet → withdrawal) and separates approved scope from owner-decision-gated scope.

### 1.2 Relationship to the SSOT

| Document | Role |
|---|---|
| `REQUIREMENTS.md` | Source of approved functional/non-functional requirements (FR/NFR IDs) |
| `BUSINESS-RULES.md` | Source of approved business rules (BR/BI/OD IDs) |
| `FEATURES.md` | Feature inventory (FEAT IDs) with acceptance criteria and status |
| `ROADMAP.md` (this) | Phases, milestones, dependencies, MVP, risks |

### 1.3 Current Verified State

- Repository contains **documentation only** (requirements, business rules, features, roadmap). **No application code exists.**
- All features are `NOT_STARTED` unless marked `BLOCKED` or `DEFERRED` in FEATURES.md.
- 25 Owner Decision Items (OD-001..025) remain open and gate specific features (FEATURES.md §6.1).

---

## 2. Development Phases

Phase ordering follows the confirmed business dependency chain: Foundation → Members → Referral → Sales → Commission → eWallet → Payouts/Withdrawals → Vouchers → Content → Reporting → Programs.

### P0 - Planning & Requirements Baseline (COMPLETE - documentation)
- **Objective:** Establish the authoritative requirements, business rules, and planning baseline.
- **Scope:** Requirements SSOT, business rules SSOT, feature inventory, roadmap.
- **Major deliverables:** `docs/requirements/REQUIREMENTS.md`, `docs/business/BUSINESS-RULES.md`, `docs/features/FEATURES.md`, `docs/roadmap/ROADMAP.md`.
- **Dependencies:** None.
- **Key features:** None (no application features).
- **Risks:** R-02, R-06 (documentation only).
- **Exit criteria:** All four documents exist; all FR/BR/BI/OD IDs unique and cross-referenced; no code introduced.

### P1 - Foundation & Platform Core
- **Objective:** Provide the secure, auditable platform core on which every business feature depends.
- **Scope:** FEAT-001..006 (foundation/data model, authentication, RBAC + object-level authorization, audit logging, config service, email service).
- **Major deliverables:** Scaffolded full-stack application (TypeScript), database schema, authN/authZ, audit framework, config service, email integration.
- **Dependencies (hard):** FEAT-001 first; FEAT-002/003/004/005 depend on it. FEAT-006 on external email provider (OPEN).
- **Key features:** FEAT-001, FEAT-002, FEAT-003, FEAT-004, FEAT-005, FEAT-006.
- **Risks:** R-03 (external providers), R-05 (authorization correctness).
- **Exit criteria:** FEAT-001..006 implemented; RBAC matrix (BUSINESS-RULES §3) enforced; audit trails captured; config parameters changeable without code; all NFR targets not yet defined (TBD) are recorded.

### P2 - Members & Qualification
- **Objective:** Deliver the membership and qualification path that gates all business eligibility.
- **Scope:** FEAT-007..013 (registration & statuses, profile, email verification, ID verification, admin approval/rejection, qualification questions, age validation).
- **Major deliverables:** Registration flow, verification, approval/rejection, profile, qualification.
- **Dependencies (hard):** FEAT-003, FEAT-005, FEAT-006 (from P1).
- **Key features:** FEAT-007..013.
- **Risks:** R-02 (OD-024 max attempts is future), R-05.
- **Exit criteria:** AC-REG-001 passes; no purchase step exists; statuses limited to the three confirmed values; mandatory rejection reasons; unlimited resubmission (current rule).

### P3 - Referral & Sponsor
- **Objective:** Implement the strict single-level referral structure and sponsor governance.
- **Scope:** FEAT-019..023 (referral codes, sponsor assignment, single-level relationship, sponsor eligibility, sponsor change).
- **Major deliverables:** Referral code generation, sponsor assignment/approval, eligibility enforcement.
- **Dependencies (hard):** FEAT-007 (Active + Qualified). FEAT-022 partially blocked on OD-013.
- **Key features:** FEAT-019..023.
- **Risks:** R-02 (OD-013), R-06 (BI-003/004 correctness).
- **Exit criteria:** AC-REF-001 passes; codes unique and immutable; only Active + Qualified sponsors; no MLM behavior (BI-004); sponsor-change workflow audited (circumstances pending OD-013).

### P4 - Catalog, Customers & Sales
- **Objective:** Deliver the property catalog, customer capture, and the qualifying-sale path.
- **Scope:** FEAT-024..032 (customer records, property catalog, historical value, sale submission/approval, payment verification, qualifying sale, resubmission/lock, reopen).
- **Major deliverables:** Admin catalog, customer records, sale lifecycle with payment verification and locking.
- **Dependencies (hard):** FEAT-007 (Active + Qualified sellers), FEAT-025 (catalog), FEAT-005 (resubmission limits), FEAT-003 (staff roles).
- **Key features:** FEAT-024..032.
- **Risks:** R-04 (sale integrity), R-08 (payout provider affects payment record format).
- **Exit criteria:** AC-SAL-001 passes; property values from catalog only (BR-PRP-003); historical values preserved (BI-006); payment verification restricted to Admin/Finance/Super Admin.

### P5 - Commission Engine
- **Objective:** Implement direct commission (8%) and direct referral (4%) with the full pending→clearing→available lifecycle and immutable corrections.
- **Scope:** FEAT-033..040 (FEAT-041 Group Incentive deferred to P12).
- **Major deliverables:** Commission calculation, creation, clearing scheduler, cancellation, reversal, recovery, immutable ledger.
- **Dependencies (hard):** FEAT-030 (qualifying sale), FEAT-005 (rates/clearing config), FEAT-021 (direct referral relationship), FEAT-001 (immutability foundations).
- **Key features:** FEAT-033..040.
- **Risks:** R-04 (financial correctness), R-01 (rate approval - PROVISIONAL).
- **Exit criteria:** AC-COM-001, AC-COM-002 pass; commission created Pending and excluded from Available (BI-002); clearing applies to future only; ledger immutable (BI-005); no MLM (BI-003/004).

### P6 - eWallet & Financial Ledger
- **Objective:** Deliver the financial ledger, available balance rules, and Super Admin adjustments.
- **Scope:** FEAT-042, FEAT-043, FEAT-071.
- **Major deliverables:** Complete ledger, non-negative available balance, adjustment workflow.
- **Dependencies (hard):** FEAT-035 (commission creation), FEAT-003 (Super Admin).
- **Key features:** FEAT-042, FEAT-043, FEAT-071.
- **Risks:** R-04 (double-spend/negative balance), R-07 (atomicity).
- **Exit criteria:** AC-WAL-001, AC-ADJ-001 pass; Available Balance never negative (BI-001); Pending excluded (BI-002); adjustment audit fields complete.

### P7 - Payouts & Withdrawals
- **Objective:** Deliver payout accounts, withdrawal requests/reservations, and the external payment boundary records.
- **Scope:** FEAT-044..047, FEAT-048..051, FEAT-070.
- **Major deliverables:** Payout account management/verification, withdrawal lifecycle, boundary records.
- **Dependencies (hard):** FEAT-043 (available balance), FEAT-046 (verified accounts). FEAT-047 blocked on OD-016; FEAT-051 blocked on OD-017/018.
- **Key features:** FEAT-044..051, FEAT-070.
- **Risks:** R-08 (providers), R-09 (status model), R-04 (reservation integrity).
- **Exit criteria:** AC-WDR-001, AC-BND-001 pass; reservation not reusable; rejection releases and requires a new request; no money movement executed by JAD.

### P8 - Vouchers & QR Redemption Security
- **Objective:** Deliver secure digital vouchers with atomic online redemption and the CTO-controlled signing boundary.
- **Scope:** FEAT-052..058, FEAT-059.
- **Major deliverables:** Voucher issuance/signing integration, redemption (full/partial), history, verification, atomicity, merchant portal.
- **Dependencies (hard):** FEAT-059 (CTO signing service - external), FEAT-005 (redemption mode), FEAT-003 (merchant role). FEAT-058 blocked on OD-019..023.
- **Key features:** FEAT-052..059.
- **Risks:** R-02 (security boundary), R-03 (signing service availability), R-04 (double redemption).
- **Exit criteria:** AC-VCH-001, AC-SEC-001 pass; atomic redemption verified under concurrency; master key never accessible to app infrastructure (BI-008).

### P9 - Marketing, Policies & Notifications
- **Objective:** Deliver Admin-managed content, forwarding, and broadcast capabilities.
- **Scope:** FEAT-060..063.
- **Major deliverables:** Media management, member forwarding/download, policies, broadcasts/push.
- **Dependencies (hard):** FEAT-003 (Admin role); FEAT-063 on external push infrastructure (ASSUMPTION 6).
- **Key features:** FEAT-060..063.
- **Risks:** R-03 (push provider).
- **Exit criteria:** FR-ADM-002..005 satisfied; only permitted content forwardable/downloadable.

### P10 - Reporting & Genealogy
- **Objective:** Deliver member-facing reporting that remains consistent with the single-level model.
- **Scope:** FEAT-064..067.
- **Major deliverables:** Direct Referrals, Group Network (non-commission), Total Earned (pending OD-025), My Genealogy.
- **Dependencies (hard):** FEAT-021 (referral data), FEAT-042 (ledger for Total Earned). FEAT-066 blocked on OD-025.
- **Key features:** FEAT-064..067.
- **Risks:** R-06 (Total Earned definition).
- **Exit criteria:** FR-RPT-001, 002, 004 satisfied; Group Network and Genealogy never imply MLM commission (BI-004); Total Earned excludes pending once defined.

### P11 - Abroad Program & Geolocation
- **Objective:** Implement geolocation mechanics and the Domestic/Abroad program separation.
- **Scope:** FEAT-014..018, FEAT-068, FEAT-069.
- **Major deliverables:** Geolocation determination, PH-block, location exceptions, program separation/configuration.
- **Dependencies (hard):** FEAT-007 (registration), FEAT-005 (config). FEAT-017/018 blocked on OD-014/015; FEAT-069 blocked on OD-001..005.
- **Key features:** FEAT-014..018, FEAT-068, FEAT-069.
- **Risks:** R-07 (accuracy/spoofing), R-02 (program rules).
- **Exit criteria:** AC-GEO-001 passes for confirmed mechanics (FR-GEO-001..006); program separation configurable; gated items remain unimplemented until Owner decisions.

### P12 - Group Incentive (Deferred)
- **Objective:** Implement the company-defined group bonus only after all parameters are approved.
- **Scope:** FEAT-041.
- **Major deliverables:** Group Incentive calculation and ledger integration.
- **Dependencies (hard):** **OD-006..012** (eligibility, rate, formula, trigger, basis, timing, program applicability). None of these are approved.
- **Key features:** FEAT-041.
- **Risks:** R-01, R-02 (parameter ambiguity).
- **Exit criteria:** All OD-006..012 approved; implementation produces a separate bonus with no multi-level commission (BI-004).

---

## 3. Major Milestones

| Milestone | Meaning | Achieved at | Blocking decisions |
|---|---|---|---|
| M0 - Requirements Baseline | Requirements, business rules, features, roadmap approved | P0 (complete) | - |
| M1 - Foundation Complete | Platform core secure and auditable | P1 | - |
| M2 - Core Membership & Referral | Members register/qualify; single-level referral operational | P2 + P3 | OD-013 (sponsor-change circumstances) |
| M3 - Core Revenue Path | Qualifying sales → commissions → clearing → eWallet | P4 + P5 + P6 | Rate approval (PROVISIONAL 8%/4%) |
| M4 - Payouts & Withdrawals | Members can withdraw available funds | P7 | OD-016, OD-017/018 |
| M5 - MVP Ready | End-to-end core business model usable | P1..P7 complete | OD-016/017/018 (minimal viable subset of withdrawal flow) |
| M6 - Vouchers & Security Ready | Secure voucher redemption live | P8 | OD-019..023 (extended voucher rules) |
| M7 - Integration & Content Ready | Marketing, notifications, reporting live | P9 + P10 | OD-025 (Total Earned) |
| M8 - Full Program Readiness | Domestic/Abroad and Group Incentive live | P11 + P12 | OD-001..005, OD-006..012, OD-014/015 |

> M5 is the **MVP readiness** gate. M8 represents full approved scope; it cannot be reached until the listed Owner decisions are made.

---

## 4. Feature Groups

Feature groups correspond to FEATURES.md §3. Every group maps to a phase:

| Feature Group | Features | Phase |
|---|---|---|
| FG-PLATFORM / FG-CONFIG | FEAT-001..006 | P1 |
| FG-MEMBERS | FEAT-007..013 | P2 |
| FG-REF | FEAT-019..023 | P3 |
| FG-CATALOG | FEAT-024..026 | P4 |
| FG-SALES | FEAT-027..032 | P4 |
| FG-COMMISSION | FEAT-033..040 (FEAT-041 → P12) | P5 / P12 |
| FG-EWALLET | FEAT-042, 043, 071 | P6 |
| FG-PAYOUT | FEAT-044..047 | P7 |
| FG-WDR | FEAT-048..051 | P7 |
| FG-BND | FEAT-070 | P7 |
| FG-VOUCHER | FEAT-052..058 | P8 |
| FG-SECURITY | FEAT-059 | P8 |
| FG-CONTENT | FEAT-060..063 | P9 |
| FG-REPORTING | FEAT-064..067 | P10 |
| FG-PROGRAMS | FEAT-014..018, 068, 069 | P11 |

---

## 5. Dependencies

### 5.1 Dependency Types
| Type | Meaning |
|---|---|
| **Hard** | Feature cannot start until the dependency is complete |
| **Soft** | Sequencing preferred; work can be partially parallelized |
| **External** | Depends on a third-party/infrastructure capability outside JAD |
| **Pending decision** | Depends on an Owner/CTO decision (OD item) |

### 5.2 Requirement / Business-Rule Dependencies
- Commission rules (BR-COM, BR-CLC, BR-CAN, BR-LED) depend on qualifying-sale rules (BR-SAL) - hard.
- Direct Referral (BR-COM-002) depends on single-level referral structure (BR-REF-001/002) - hard.
- Available Balance rules (BR-WAL-002/003) depend on commission lifecycle (BR-CLC-001) - hard.
- Withdrawal rules (BR-WDR) depend on available balance (BR-WAL) and payout verification (BR-PAY) - hard.
- Invariants BI-001..BI-010 must hold from the moment their governing feature ships; they are tested continuously.

### 5.3 Data Model
- Entities and relationships follow the confirmed business model (REQUIREMENTS §1.3). No payment-gateway/money-movement schema (FR-BND-003).

### 5.4 Authentication / Authorization
- Authentication (FEAT-002) precedes RBAC (FEAT-003); object-level authorization applies to all member-facing records.

### 5.5 Backend / API / Frontend
- Backend domain services are sequenced per phase; member-facing UIs ship with each phase's member capabilities. Reporting (P10) depends on ledger/referral data (P5/P3).

### 5.6 Integrations - External
| Integration | Used by | Type |
|---|---|---|
| Email service | FEAT-006 | External (provider OPEN - ASSUMPTION 2) |
| Geolocation services (GPS/IP) | FEAT-014 | External (provider OPEN - ASSUMPTION 3) |
| Push notification infrastructure | FEAT-063 | External (provider OPEN - ASSUMPTION 6) |
| CTO-authorized signing service | FEAT-059 | External (ASSUMPTION 7) |
| External payment/payout platforms | FEAT-070 | External (record-only; no money movement) |

### 5.7 Pending Decisions (Owner)
- OD-001..005 → FEAT-069 (program rules)
- OD-006..012 → FEAT-041 (Group Incentive)
- OD-013 → FEAT-022 (sponsor change)
- OD-014/015 → FEAT-017/018 (geolocation accuracy/spoofing)
- OD-016 → FEAT-047 (payout providers)
- OD-017/018 → FEAT-051 (withdrawal model)
- OD-019..023 → FEAT-058 (voucher rules)
- OD-024 → FR-REG-006 (future registration attempts)
- OD-025 → FEAT-066 (Total Earned)

### 5.8 Testing / Documentation
- Acceptance criteria (AC-* in REQUIREMENTS §12) are the phase gates; documentation must be updated per phase exit criteria.

---

## 6. Implementation Sequence

Recommended order follows the dependency chain; parallelize only within a phase:

```text
P1 Foundation
  → P2 Members & Qualification
  → P3 Referral & Sponsor
  → P4 Catalog, Customers & Sales
  → P5 Commission Engine
  → P6 eWallet & Financial Ledger
  → P7 Payouts & Withdrawals        ← M5 MVP Ready
  → P8 Vouchers & QR Security
  → P9 Marketing, Policies & Notifications
  → P10 Reporting & Genealogy
  → P11 Abroad Program & Geolocation
  → P12 Group Incentive (deferred)
```

**Sequencing rationale:**
- P2 must precede P3/P4 because Active + Qualified eligibility gates both sponsorship and sale submission.
- P4 must precede P5 because commissions are created only from Qualifying Sales.
- P5 must precede P6 because commissions populate the ledger.
- P6 must precede P7 because withdrawals draw on Available Balance.
- P8 is independent of P4-P7 but depends on P1 (RBAC, config) and the CTO signing service; it is scheduled after MVP so the core revenue path is proven first.
- P11 geolocation mechanics (FEAT-014..016) are CONFIRMED but integrated only once program separation is exercised; gated items (FEAT-017/018) wait on Owner decisions.
- P12 waits entirely on Owner decisions OD-006..012.

---

## 7. MVP Scope

### 7.1 MVP Definition
**MVP = Phases P1..P7** - the complete confirmed core business model: membership → qualification → referral → sale → commission → clearing → eWallet → payout/withdrawal.

Features in MVP: FEAT-001..013, FEAT-019..040, FEAT-042, FEAT-043, FEAT-071, FEAT-044..051, FEAT-070. (FEAT-017/018, FEAT-022, FEAT-041, FEAT-047, FEAT-051, FEAT-058, FEAT-066, FEAT-069 remain gated/deferred within or beyond this set - see §7.4.)

### 7.2 Explicitly Excluded from MVP
- Vouchers & QR redemption (P8 - FEAT-052..059).
- Marketing, policies & notifications (P9 - FEAT-060..063).
- Reporting & genealogy views (P10 - FEAT-064..067).
- Abroad program & geolocation (P11 - FEAT-014..018, FEAT-068, FEAT-069).
- Group Incentive (P12 - FEAT-041).

### 7.3 MVP Dependencies
- Hard: P1..P6 complete.
- Pending decisions that affect MVP withdrawal capability: OD-016 (payout providers) and OD-017/018 (withdrawal status model) - the minimal confirmed withdrawal flow (request → reserve → complete/reject → release) can be delivered; final model integration waits on Owner decisions.
- Pending decision OD-013 (sponsor-change circumstances) affects only the change-circumstances portion of FEAT-022; the approval+audit workflow is MVP-eligible.

### 7.4 MVP Exit Criteria
1. M5 gate: P1..P7 complete.
2. AC-REG-001, AC-REF-001, AC-SAL-001, AC-COM-001, AC-COM-002, AC-WAL-001, AC-ADJ-001, AC-WDR-001, AC-BND-001 all pass.
3. Invariants BI-001..BI-006, BI-009, BI-010 hold throughout.
4. RBAC matrix and audit requirements validated (NFR-SEC-001/002, NFR-AUTHZ-001/002).
5. No money movement, no payment gateway, no MLM, no automatic refunds (out-of-scope boundaries respected).
6. No TBD rule silently implemented; every OD-gated item either approved or explicitly excluded from the MVP build.

### 7.5 MVP Assumptions
- Domestic program is the primary MVP operating program (exact Domestic/Abroad rules are OD-gated).
- Payout method set minimal until OD-016; verified-account and withdrawal flows use the confirmed lifecycle.
- No customer self-service access (ASSUMPTION 4).

---

## 8. Future Scope

### 8.1 Approved but Beyond MVP (scheduled later)
- Vouchers & QR redemption (P8), Marketing/Policies/Notifications (P9), Reporting & Genealogy (P10), Abroad Program & Geolocation (P11), Group Incentive (P12, pending OD-006..012).

### 8.2 Future / Decision-Gated (NOT approved to implement)
These remain `TBD / REQUIRES OWNER APPROVAL` per the SSOT. Implementing them is **prohibited** until approval:
- Maximum registration attempts (OD-024 - FUTURE scope, REQUIREMENTS §3.3).
- Domestic/Abroad rule differences (OD-001..005).
- Group Incentive parameters (OD-006..012).
- Sponsor-change circumstances (OD-013).
- Geolocation accuracy threshold (OD-014) and anti-spoofing (OD-015).
- Final payout providers (OD-016).
- Final withdrawal status model/workflow (OD-017/018).
- Voucher transfer/revocation/expiration/merchant permissions (OD-019..023).
- Total Earned definition (OD-025).

---

## 9. Phase Exit Criteria (Summary)

For every phase, exit requires all of the following (as applicable):
- **Requirements satisfied:** All phase FRs/NFRs implemented and verified.
- **Business rules implemented:** Governing BRs enforced; no violations of BI invariants.
- **Functional tests passed:** Phase acceptance criteria (AC-*) pass.
- **Security/authorization validated:** RBAC matrix and object-level rules validated; audit trails captured.
- **Integration tests passed:** Cross-phase integrations (e.g., qualifying sale → commission → ledger) pass.
- **Documentation updated:** Requirements/business/features/roadmap statuses updated to reflect completion.
- **Known blockers resolved:** No unresolved `BLOCKED` features within phase scope (decision-gated features are formally excluded and tracked).

Phase-specific criteria are listed in §2.

---

## 10. Project Risks / Blockers

| Risk ID | Risk / Blocker | Impact | Likelihood | Affected Phase/Feature | Mitigation | Owner / Decision Required | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Open Owner decisions (OD-001..025) block 9 features | High - scope/eligibility ambiguity | Certain (already open) | P11/P12, FEAT-017/018/022/041/047/051/058/066/069 | Decision register; feature-level gates; no silent decisions | Owner | OPEN |
| R-02 | CTO-controlled signing service not available/defined | High - security boundary for vouchers | Medium | P8, FEAT-052/059 | Early CTO engagement; sign-off on boundary before P8 | CTO | OPEN |
| R-03 | External providers unconfirmed (email, geolocation, push, payout) | Medium - delivery dependency | High | FEAT-006/014/063/047 | Provider selection task early; contract for minimal interfaces | Owner/CTO | OPEN |
| R-04 | Financial integrity defects (negative balance, double redemption, double-spend, reservation misuse) | Critical - financial + reputational | Medium | P5/P6/P7/P8, FEAT-036/043/048/057 | Atomic transactions (NFR-ATOM-001/002); invariant tests (BI-001..010); ledger immutability | - | OPEN |
| R-05 | Authorization/object-level leakage | Critical - confidentiality (NFR-CONF-001) | Medium | P1, FEAT-003 | Enforce BUSINESS-RULES §3 matrix; object-level tests per role | - | OPEN |
| R-06 | Requirement ambiguity (Total Earned definition, program rules) | Medium - incorrect reporting | Medium | P10, FEAT-066 | OD-025 approval before P10 completion | Owner | OPEN |
| R-07 | Geolocation accuracy/spoofing decisions absent | Medium - Abroad integrity | Certain until decided | P11, FEAT-017/018 | OD-014/015 approval | Owner | OPEN |
| R-08 | Payout provider set undefined | Medium - payout format/config | Certain until decided | P7, FEAT-047 | OD-016 approval | Owner | OPEN |
| R-09 | Withdrawal status model undefined | Medium - processing ambiguity | Certain until decided | P7, FEAT-051 | OD-017/018 approval | Owner | OPEN |
| R-10 | No architecture/technical decision record yet | High - could force rework | High | All | Architecture decision log; capture infra/deployment decisions before P1 | Owner/CTO | OPEN |
| R-11 | Commission rate approval (PROVISIONAL 8%/4%) | Medium - payout exposure | Medium | P5, FEAT-033/034 | Rate configurability already required; confirm rates before production | Owner | PROVISIONAL |
| R-12 | Database/data-model migration risk on schema evolution | Medium - financial data migration | Medium | P1, FEAT-001 | Immutability-first design; migration safeguards; no in-place edits of financial records | - | OPEN |

---

## 11. Approval Boundary

The following require explicit Owner/Stakeholder approval before their implementing phase begins; they are **not** silently resolvable by the development team:

1. All OD-001..025 decisions (see §8.2 and FEATURES.md §6.1).
2. Commission rate finalization (PROVISIONAL 8%/4% - R-11).
3. CTO signing service design and availability (R-02).
4. External provider selection (email, geolocation, push, payout - R-03).
5. Architecture and infrastructure decisions (tech stack confirmed as TypeScript full-stack; deployment/infrastructure still OPEN - R-10).
6. Any change to security boundaries (CTO key control, authorization model).
7. Any destructive data implications or financial-data migration strategy.

---

## 12. Consistency Notes

- Phase/feature/status references align with FEATURES.md; acceptance criteria align with REQUIREMENTS.md §12; business-rule references align with BUSINESS-RULES.md.
- If REQUIREMENTS.md or BUSINESS-RULES.md is revised, re-verify this roadmap's phase/feature/status mappings before proceeding.