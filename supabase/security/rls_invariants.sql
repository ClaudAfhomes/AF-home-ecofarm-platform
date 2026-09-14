-- RLS invariant audit (Phase 3B) — run read-only in the SQL editor / CI after
-- every migration batch. Each query must return ZERO rows (empty = PASS).
--
-- Triage: any returned row is either a real finding (fix the policy/grant it
-- names, not this file) or a deliberately granted exception — document
-- exceptions inline below with owner + date instead of deleting the check.
--
-- NOTE: pg_policies.roles is name[], so the literal must be cast (42883
-- otherwise). `public` is included everywhere: PUBLIC-role grants bypass
-- anon/authenticated scoping and the original queries missed them.

-- 1) No write policy reachable by untrusted roles (was: 42883 type error).
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where roles && array['anon', 'authenticated', 'public']::name[]
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

-- 2) No table-level write privilege for untrusted roles on identity tables
-- (member + staff identities; Phase 1 staff domain).
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
  and table_name in ('Member', 'MemberRole', 'Role', 'StaffUser', 'StaffAssignment')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

-- 3) No table-level write privilege for untrusted roles anywhere
-- (all writes are service-role-only by design).
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

-- 4) No Storage write policy reachable by untrusted roles.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and roles && array['anon', 'authenticated', 'public']::name[]
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

-- 5) No public-schema routine executable by untrusted roles without review.
-- Money functions (withdraw_reserve, withdrawal_complete, withdrawal_reject,
-- sale_qualify, …) must be service_role-only; any row naming one is a FAIL.
-- Other rows are triage candidates, not automatic failures.
-- Deliberate exception (owner, 2026-09-14, ADR-013): is_staff_user() is
-- EXECUTE-to-authenticated by design — a read-only, parameterless standing
-- check used only inside SELECT-only RLS policies on "Message" and
-- "Conversation" (staff realtime). It writes nothing and reveals only the
-- caller's own standing.
select grantee, routine_schema, routine_name
from information_schema.role_routine_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
  and routine_schema = 'public';

-- 6) RLS enabled on every public application table (a table with RLS
-- enabled but no policies is deny-by-default, which is safe and passes).
select n.nspname as schemaname, c.relname as tablename
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity;

-- 7) Authenticated reads on Role expose slug/name columns only
-- (mirrors 20260915000001_rls_hardening.sql; fixed by
-- 20260927000001_role_read_columns_fix.sql). Scoped to SELECT: residual
-- REFERENCES rows without DDL rights are inert, not findings.
select grantee, table_name, column_name, privilege_type
from information_schema.role_column_grants
where grantee = 'authenticated'
  and table_name = 'Role'
  and privilege_type = 'SELECT'
  and column_name not in ('slug', 'name');
