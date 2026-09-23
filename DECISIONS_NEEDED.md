# Decisions needed

The following requirements were intentionally implemented as configuration or left behind a secure integration boundary rather than guessed.

| Decision | Current safe default | Where configured |
|---|---|---|
| Bronze, Silver, and Gold prices | PHP 0.00; product cannot represent an approved commercial price until updated | `products.price` |
| Card down-payment amounts/rules | Fixed PHP 0.00 | Product catalog |
| QR credit value | No monetary value assigned | Future business rule |
| “Not exceeding the third referred person” interpretation | First three direct referrals eligible; max depth 1 | `referral_credit_policy` |
| Manager-shoulders-payment amount and enforcement | Disabled; status field retained | `business_rules` and `qr_credits` |
| Vice Director invite code lifetime | Schema requires an explicit expiry; no default duration | Invite creation workflow |
| Spot-cash grace period after seven days | Zero days | `business_rules` |
| OCR/barcode provider and supported Philippine ID formats | Disabled; manual entry remains available. Provider must support the approved QR, barcode, PDF417, and visible-text field map and return source/confidence metadata where available. | `OCR_PROVIDER_*` secrets |
| PII requiring application-layer encryption | Government ID number only, pending privacy review | Edge Function/KMS design in `SECURITY.md` |
| Document retention/deletion schedule | No automatic deletion | Compliance policy required |
| Employee document categories | Free-form secure records | HR policy required |
| Final role-permission matrix | Least-privilege seed matrix | Super Admin role management |
| Top-performer formula | Not ranked until sales/credit weighting is approved | Vice Director analytics rule |
| Cancellation vs reversal approval authority | Finance permission required by default | Finance workflow policy |
| Required MFA roles | Not enforced in code; recommend all Finance, HR, Admin, and Super Admin users | Supabase Auth policy |
