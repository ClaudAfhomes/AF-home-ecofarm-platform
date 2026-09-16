# ADR-007: CTO-Controlled Voucher Signing Boundary

## Status
**Accepted** for the boundary and custody model (BI-008; BR-SEC-001..004 - CONFIRMED business rules). **Proposed** for the mechanism: Cloud KMS / HSM-based dedicated signing service (ARCHITECTURE.md §16, ARCH-DEC-006: `REQUIRES APPROVAL (CTO)`).

## Context
Vouchers and QR redemptions carry financial value (FR-VCH-004..006). Business invariant **BI-008** requires that the master voucher-signing key be under **CTO control only** and never accessible to application infrastructure, developers, or DBAs. BR-SEC-001..004 mandate the custody controls. The acceptance test **AC-SEC-001** simulates a compromise and asserts the master key cannot be extracted. Voucher issuance/redemption (P8) depends on the signing service - identified as a critical dependency risk R-02.

## Problem
Define the architectural boundary that lets the application **issue and verify** vouchers without ever possessing the master signing key.

## Options Considered
- **In-application signing** (key material in app servers) - rejected: violates BI-008.
- **Cloud KMS / HSM-based dedicated signing service** - the chosen direction.
- **Air-gapped signer** - more isolated, higher operational cost.

## Decision
The application **can only verify** signatures using the public key; the **master signing key exists only inside the CTO-controlled signing service** (API-SPECIFICATION §8, "Signing boundary"). The signing service mechanism is **Cloud KMS or HSM-based** and **must be CTO-chosen** (ARCH-DEC-006, `REQUIRES APPROVAL (CTO)`). The DB stores the signed payload and signature only - never key material.

## Rationale
- BI-008 and BR-SEC-001..004 mandate CTO custody; any in-app key violates them.
- AC-SEC-001 requires that a simulated compromise cannot expose the master key.
- A dedicated service with public-key verification keeps the app side simple while preserving the hard security boundary.

## Trade-offs
- Signing service is a **critical dependency** for voucher issuance and redemption (R-02) - availability must be planned.
- Operational complexity: key rotation, access governance, and incident handling are CTO-owned.
- The specific mechanism (KMS vs HSM vs air-gapped) is **not decided** - it is an explicit CTO approval item (BACKEND-ARCHITECTURE §21).

## Consequences
- Voucher issuance/redemption (P8) is **gated** on the signing service and its approval.
- Application infrastructure never holds key material; test-only signing keys are used for fixtures (SECURITY.md §7/§17).
- Any attempt to embed signing keys in source or app servers is prohibited (TECH-STACK §16; BACKEND-ARCHITECTURE §17).
- The mechanism decision (ADR) must be revisited when the CTO chooses KMS/HSM/air-gapped; this ADR's mechanism sub-status will be updated to Accepted then.

## Validation / Evidence
- BUSINESS-RULES.md BI-008; BR-SEC-001..004; AC-SEC-001.
- ARCHITECTURE.md §16 (ARCH-DEC-006 = REQUIRES APPROVAL (CTO)); ARCHITECTURE §9/§14 (trust boundaries).
- API-SPECIFICATION.md §8 (signing boundary); BACKEND-ARCHITECTURE.md §17/§21; SECURITY.md §7/§17.
- ROADMAP.md R-02 (critical dependency); TESTING.md (security tests incl. AC-SEC-001).

## References
- BI-008; BR-SEC-001..004; AC-SEC-001; ARCH-DEC-006; API-SPECIFICATION.md §8; BACKEND-ARCHITECTURE.md §17/§21; SECURITY.md §7/§17; ROADMAP.md R-02.