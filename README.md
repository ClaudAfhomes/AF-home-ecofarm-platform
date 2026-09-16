# JA&D (JAD) - Monorepo

TypeScript monorepo for the JAD platform (pnpm workspaces + Turborepo). Per
`docs/architecture/FOLDER-STRUCTURE.md`.

## Layout

- `apps/web` - public website frontend (React + Vite SPA). P1 scope: Home, About,
  Properties/Listings, FAQs, Contacts, 404.
- `packages/contracts` - shared DTO types, Zod schemas, error envelope (single source).
- `packages/config` - typed environment schema.
- `packages/shared` - framework-free utilities (exact-decimal money display helpers).
- `docs/` - SSOT documentation (existing, authoritative).

## Commands (from root)

```sh
pnpm install
pnpm dev        # run dev servers (turbo)
pnpm typecheck  # tsc --noEmit across packages
pnpm lint       # eslint
pnpm test       # vitest run
pnpm build      # production build

pnpm exec tsx api/dev-server.ts # To start API in localhost
pnpm seed # TO seed the data in the localhost
```

## Conventions

All engineering conventions and SSOT references live in `docs/`. Do not invent
business rules, API contracts, property data, or brand values - see
`docs/development/DEVELOPMENT-GUIDELINES.md` and the design-system tokens in
`apps/web/src/styles/tokens.css` (placeholder values pending approval).
