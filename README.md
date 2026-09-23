# AFhomes-ecofarm

Production-oriented internal operations application for AFhomes Ecofarm. It covers staff access, finance, HR, product cards, customer onboarding, onsite sales, payment verification, genealogy, QR credits, notifications, and immutable audit history. There is no customer portal.

## Stack

- React 19, TypeScript, Vite, TanStack Query
- Supabase Auth, PostgreSQL, Storage, Realtime, Edge Functions
- Vercel static SPA hosting
- PostgreSQL RLS plus permission checks for authorization

Requires Node.js 22+.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase publishable key. Never use a service-role key in a `VITE_` variable.
3. Install Docker Desktop if using the local Supabase stack.
4. Run `npx supabase start`, then `npx supabase db reset` to apply migrations and seed data locally.
5. Run `npm run dev` and open `http://localhost:5175`.

The first Super Admin must be provisioned through a controlled administrator process: create the Auth identity, then insert its `profiles` row with the seeded `super_admin` role using the Supabase SQL editor or a one-time server-side script. Do not add public registration.

Once provisioned, Super Admin management is available at:

- `/settings/users` for invitations, role/department assignment, status changes, and profile edits.
- `/settings/test-accounts` for controlled role-testing accounts and secure password setup.
- `/settings/departments` for audited department creation and activation changes.
- `/genealogy/members` for validated sales placement, tree, and table views.

Auth identities are created only by the `admin-users` Edge Function. Direct profile mutations are revoked from browser roles; audited database functions validate Super Admin authority and genealogy rules. Deactivation changes status and Auth access without deleting historical records.

### Role-account test checklist

1. As Super Admin, open **Settings → Test accounts** and create a Vice Director.
2. Create a Senior Sales Manager under that Vice Director, a Sales Manager under the senior manager, and an OST under the sales manager.
3. Create Finance, HR, and Admin test accounts. Use email delivery when SMTP is configured.
4. If email delivery is unavailable, choose **Generate secure setup link**, copy the one-time link, and send it to the intended tester through a trusted channel. The server generates the Supabase invite link; no password or service-role key is stored in the browser or source.
5. Set each password, then sign in and out at `https://afhomes-ecofarm.vercel.app/login`. Confirm the dashboard and profile menu display the expected role and `Test Account` label.
6. Confirm each sales role sees only its permitted navigation and genealogy scope. Create a second Vice Director and confirm neither Vice Director can view the other's tree.
7. Confirm Finance and HR cannot access `/genealogy/members` or `/settings/test-accounts`.
8. Review **Governance → Audit log** for `AUTH_LOGIN`, `AUTH_LOGOUT`, invitation, profile, and genealogy events.
9. Deactivate each test account from **Settings → Test accounts**, confirm login is blocked, then reactivate only when another test is needed.

Users never choose their own role. The Super Admin assigns it through the server-authorized `admin-users` Edge Function, and test-account activity is excluded from production dashboard metrics by default.

### OST registration and approval

- Prospective OST applicants use the separate public route `/ost/register`; no other role can self-register.
- Sales Managers create hashed, expiring links and scannable QR codes at `/ost/referrals` and see only their branch through RLS.
- Sales Managers, Admin, and Super Admin review scoped applications at `/ost/applications`. Approval creates the locked `ost` profile and sends the normal Supabase password-setup invitation in one controlled server flow.
- Pending, rejected, incomplete, and suspended applications have no active internal access. Government IDs are stored in the private `ost-registration-documents` bucket; reviewers receive 60-second signed links and every file has a SHA-256 integrity hash.
- The endpoint limits public submissions to five attempts per hashed source IP per hour and rejects duplicate email or ID hashes. Public Data API access to the intake tables remains revoked.

Manual acceptance check: create a code as a Sales Manager, open its QR/link in a private browser, test an invalid code, submit a valid application with non-production identity fixtures, confirm another Sales Manager cannot see it, request a correction, approve it as an authorized reviewer, complete the emailed password setup, then confirm the OST appears under the originating Sales Manager and Vice Director. Confirm the audit log records code creation, review, approval, and invitation.

Operational decision still required: choose a document-retention period and a malware-scanning provider. Until a scanner is configured, uploads are MIME/size validated, kept private, integrity-hashed, and never rendered inline by the public application.

## Supabase deployment

Target project: `rfkfsxiganebzaeioopg`.

```sh
npx supabase login
npx supabase link --project-ref rfkfsxiganebzaeioopg
npx supabase db push
npx supabase functions deploy admin-users
npx supabase functions deploy ocr-document
npx supabase functions deploy ost-registration --no-verify-jwt
```

Set Edge Function secrets without committing them:

```sh
npx supabase secrets set ALLOWED_ORIGIN=https://YOUR-VERCEL-DOMAIN
npx supabase secrets set OCR_PROVIDER_URL=... OCR_PROVIDER_API_KEY=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to hosted Edge Functions by Supabase. Run Supabase Security and Performance Advisors after applying migrations. Use the Dashboard RLS Tester to verify each role before production access.

## Vercel deployment

The app is not remotely linked until Vercel authentication is confirmed. In the Vercel team area:

```sh
vercel login
vercel link --yes --scope afhomes --project AFhomes-ecofarm
vercel env add VITE_SUPABASE_URL production preview development
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production preview development
vercel deploy
vercel deploy --prod
```

Use the project URL as the Supabase Auth Site URL and add its recovery callback URL. Keep all server-only keys out of Vercel's client build variables.

## Quality commands

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Operational notes

- Money is persisted as `numeric(14,2)` and received by the client as exact decimal strings.
- Dates display in `Asia/Manila`; database timestamps remain UTC.
- Financial records are never deleted. Corrections use `payment_corrections` and explicit reversals.
- Document links are signed for 60 seconds and every document row stores a SHA-256 checksum.
- Realtime is intentionally limited to payments, notifications, and profile status changes.
- See [SECURITY.md](SECURITY.md) and [DECISIONS_NEEDED.md](DECISIONS_NEEDED.md) before production rollout.
- Product requirements, including the customer ID scanning and OCR workflow, are maintained in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).
