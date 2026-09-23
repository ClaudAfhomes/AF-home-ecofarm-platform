# Security

## Authentication and authorization

Supabase Auth owns password hashing, reset links, token refresh, and sessions. The application never encrypts passwords. Public registration is disabled. Staff invitations are issued by the `admin-users` Edge Function after checking `users.manage`; the service-role key exists only in Supabase's server environment.

Authorization data lives in `profiles`, `roles`, `permissions`, and `role_permissions`, never in user-editable metadata. Every exposed business table has RLS enabled. Policies restrict finance, HR, customer, genealogy, and audit rows using database permissions plus ownership/genealogy predicates. UI route checks are defense-in-depth only.

## Documents and checksums

`customer-documents`, `employee-documents`, and `payment-receipts` are private buckets with file size and MIME allowlists. Clients upload only when an RLS policy permits it. Views use 60-second signed URLs. Each document row stores a SHA-256 checksum computed before upload; checksum comparison should be part of any download/export verification procedure.

## Sensitive PII encryption

Supabase encrypts data at rest, but especially sensitive identifiers such as government ID numbers are represented by `id_number_encrypted`. Production writes must encrypt those values in a server-side Edge Function using authenticated encryption (AES-256-GCM) and `PII_ENCRYPTION_KEY`. The key must be a 256-bit value held in Supabase secrets or an external KMS, never in the browser or database. Store a version prefix, nonce, ciphertext, and authentication tag. Rotation requires dual-read support: decrypt with the recorded key version and re-encrypt with the current version on authorized access.

The current browser form passes the field to the database model for integration testing; do not enable government-ID-number persistence in production until the encryption Edge Function and key are configured. Uploaded ID files remain protected by private storage regardless.

## Auditing and financial integrity

Triggers append changes to `audit_logs` for identities, departments, permissions, customers, documents, sales, payments, corrections, genealogy credits, invites, and settings. Audit rows reject update/delete operations. Payment decisions and genealogy moves use locked `SECURITY DEFINER` functions that verify the caller, restrict execute privileges, set an empty search path, validate transitions, and append semantic audit events.

Finalized finance rows cannot be deleted through authenticated grants. Corrections and reversals are separate records with mandatory reasons. Exports call `record_export` with report, filter, and row-count metadata.

## Known limitations before production

- Apply the migration to a staging project and run Supabase Security/Performance Advisors.
- Complete the server-side PII encryption boundary described above.
- Configure custom SMTP, MFA policy, session duration, breached-password protection, and rate limits in Supabase Auth.
- Add malware scanning/quarantine for uploads if the business accepts documents from untrusted media.
- Add centralized monitoring and alerting for Auth, Storage, Edge Function, and PostgREST error-rate advisors.
- Confirm retention schedules and privacy-law obligations with counsel.
