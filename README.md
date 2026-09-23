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

## Supabase deployment

Target project: `rfkfsxiganebzaeioopg`.

```sh
npx supabase login
npx supabase link --project-ref rfkfsxiganebzaeioopg
npx supabase db push
npx supabase functions deploy admin-users
npx supabase functions deploy ocr-document
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
