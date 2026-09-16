# ADR-013: Admin ↔ Member Messaging (one thread per member)

## Status
**Accepted** (owner-approved scope decision, 2026-09-14). Net-new functionality with no
prior SSOT entry - this ADR records the decision so the database "no entity for unapproved
functionality" gate (DATABASE-DESIGN §7 header) is satisfied.

## Context
The platform has one-way Admin→member communication only: broadcasts/notifications
(`Notification`, FEAT-063/FR-ADM-005). Members have no in-platform channel to ask questions
or receive direct replies. The SSOT has no FR/BR/FEAT/API/entity for messaging; a chat-like
channel is a material scope addition (REQUIREMENTS §3.3 approval boundary).

## Problem
Give members a way to communicate with the admin team in both directions, in near-real-time,
without weakening the project's security invariants (SELECT-only RLS for authenticated users,
service-role-only writes, staff/member identity separation, exact migration discipline).

## Options Considered
- **Reuse `Notification`/broadcasts as a reply thread** - rejected: broadcasts are shared rows
  (member_id NULL) with no per-thread ownership; adding replies would corrupt the read-receipt
  model and the broadcast semantics.
- **Multiple threads/subjects per member** - rejected for v1: one thread per member matches
  "admin team + member" and keeps the model/UI simple; extensible later.
- **Attachments/images** - deferred: member-generated uploads would require a new storage
  bucket and upload policy surface (invariant: no untrusted-role storage writes); v1 is
  text-only (1-4000 chars, plain text, React-escaped).
- **Staff realtime via polling** - rejected for the chosen delivery: staff realtime uses
  `postgres_changes` behind a SELECT-only RLS policy gated by a new `is_staff_user()`
  standing helper (the first staff RLS read policy; documented as a deliberate exception in
  `supabase/security/rls_invariants.sql` §5). Member realtime uses the existing own-row
  RLS pattern.

## Decision
- **One conversation thread per member** with the admin team; text-only messages.
- New tables `Conversation` (memberId PK, per-side read watermarks + unread counters,
  lastMessageAt) and `Message` (denormalized memberId for RLS + realtime, senderType
  MEMBER/STAFF, senderId across the two identity domains with no FK, senderName display
  snapshot, body 1-4000). An AFTER INSERT trigger maintains the conversation atomically.
- All writes go through **service-role API handlers**; authenticated users are SELECT-only
  (mirrors `Notification`/`NotificationRead`). Member deletion only via the sanctioned
  `member_purge_cascade` (extended to include messaging tables).
- **Realtime**: members subscribe to `Message` inserts for their own thread (RLS own-row);
  staff subscribe to all inserts behind the `message_staff_select`/`conversation_staff_select`
  policies gated by `is_staff_user()` (ACTIVE, not password-change-required, role-assigned).
  Realtime only invalidates TanStack Query caches - the API stays the authoritative read path.
- **RBAC**: new staff module `messages`, granted to `super_admin` + `admin` in
  `STAFF_PERMISSIONS`; endpoints guarded with `verifyStaffModule(req, 'messages', ADMIN_STAFF)`.
- **Audit**: staff replies are audited (`MESSAGE_SENT` → AuditLog, NFR-SEC-002); member sends
  are not (volume; not a staff action).
- **Endpoints**: member `GET/POST /me/messages`, `POST /me/messages/read`,
  `GET /me/messages/summary`; staff `GET /admin/conversations`,
  `GET /admin/conversations/:memberId`, `POST /admin/conversations/:memberId/messages`,
  `POST /admin/conversations/:memberId/read`, `GET /admin/messages/summary`.

## Rationale
- Mirrors proven patterns (notifications read-receipts, broadcasts API shape, migration/RLS
  discipline) so reviewers can verify against existing code.
- Service-role-only writes preserve the invariant that authenticated users never write
  business tables directly.
- The `is_staff_user()` helper is the minimal staff-visible RLS surface: parameterless,
  reads only the caller's own standing, and appears only in SELECT policies.
- One thread per member keeps cursor pagination, unread counts (watermarks), and the inbox
  trivial; counters are maintained by the trigger in the same transaction as the insert.

## Trade-offs
- First staff RLS read policy and first private member-scoped realtime channel - the
  `rls_invariants.sql` §5 triage must keep its documented exception note (owner, 2026-09-14).
- Text-only v1: no attachments, links are plain text (never rendered as HTML - SECURITY.md
  raw-content boundary).
- Message content is member-generated PII: retained indefinitely (no hard delete except
  purge); general PII retention remains open (DATABASE-DESIGN DA-13).
- No typing indicators, edit/delete, moderation, or Idempotency-Key dedupe in v1
  (optimistic UI covers retries).

## Consequences
- Docs updated to match: FEATURES (FEAT-072), REQUIREMENTS (FR-MEM/FR-ADM messaging),
  BUSINESS-RULES (BR-MSG-001..004), API-SPECIFICATION (#90-94), DATABASE-DESIGN (E-34/E-35),
  UI-UX (SCR-MEM Messages / SCR-ADM Messages).
- DB: three idempotent migrations - `20261008000001_messaging.sql`
  (tables + trigger + RLS + realtime), `20261008000002_member_purge_messaging.sql`
  (purge extension), `20261008000003_messaging_role_backfill.sql` (`messages` module).
- New staff module `messages` added to the permission matrix and role editor; existing
  deployments backfilled via migration.

## Validation / Evidence
- Contracts: `packages/contracts/src/schemas/message.ts` (+ staff-role `messages` module).
- API: `api/v1/me/messages*`, `api/v1/admin/conversations*`, `api/v1/admin/messages/summary`.
- DB: `supabase/migrations/20261008000001..03`, `supabase/security/rls_invariants.sql` §5 note.
- UI: `apps/web/src/features/member` (MessagesPage, useMessagesRealtime),
  `apps/admin/src/features/messages` (InboxPage, ConversationPage, useMessagesRealtime).

## References
- FEAT-072; API-SPECIFICATION §6 (Content & Notifications); DATABASE-DESIGN E-34/E-35;
  BUSINESS-RULES BR-MSG-001..004; UI-UX SCR-MEM Messages / SCR-ADM Messages; AGENTS.md
  database invariants.