-- Returns zero rows when the core authorization invariants hold.

select 'RLS_DISABLED' as violation, c.relname as object_name
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in (
  'roles','permissions','role_permissions','departments','profiles','employee_documents',
  'product_categories','products','customers','customer_documents','sales','payments',
  'payment_corrections','qr_credits','invite_codes','staff_invitations','business_rules','notifications','audit_logs'
) and not c.relrowsecurity
union all
select distinct 'ANON_TABLE_PRIVILEGE', table_name from information_schema.role_table_grants
where grantee='anon' and table_schema='public' and table_name in (
  'profiles','employee_documents','customers','customer_documents','sales','payments',
  'payment_corrections','qr_credits','invite_codes','staff_invitations','business_rules','audit_logs'
)
union all
select distinct 'FORBIDDEN_AUTHENTICATED_MUTATION', table_name from information_schema.role_table_grants
where grantee='authenticated' and table_schema='public'
  and ((table_name in ('audit_logs','payments') and privilege_type in ('UPDATE','DELETE'))
    or (table_name='employee_documents' and privilege_type='DELETE')
    or (table_name='profiles' and privilege_type in ('INSERT','UPDATE','DELETE'))
    or (table_name='staff_invitations' and privilege_type in ('INSERT','UPDATE','DELETE')))
union all
select 'LEGACY_GENEALOGY_RPC_EXECUTABLE', 'reparent_genealogy_member'
where has_function_privilege('authenticated','public.reparent_genealogy_member(uuid,uuid,text)','execute');
