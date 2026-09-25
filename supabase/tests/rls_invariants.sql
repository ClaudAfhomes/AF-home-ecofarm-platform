-- Returns zero rows when the core authorization invariants hold.

select 'RLS_DISABLED' as violation, c.relname as object_name
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in (
  'roles','permissions','role_permissions','departments','profiles','employee_documents',
  'product_categories','products','customers','customer_documents','sales','payments',
  'payment_corrections','qr_credits','invite_codes','staff_invitations','qr_scan_events','business_rules','notifications','audit_logs',
  'ost_referral_codes','ost_registrations','ost_registration_documents','ost_submission_attempts',
  'profile_permission_overrides','memberships','point_ledger'
) and not c.relrowsecurity
union all
select distinct 'ANON_TABLE_PRIVILEGE', table_name from information_schema.role_table_grants
where grantee='anon' and table_schema='public' and table_name in (
  'profiles','employee_documents','customers','customer_documents','sales','payments',
  'payment_corrections','qr_credits','invite_codes','staff_invitations','qr_scan_events','business_rules','audit_logs',
  'ost_referral_codes','ost_registrations','ost_registration_documents','ost_submission_attempts'
)
union all
select distinct 'FORBIDDEN_AUTHENTICATED_MUTATION', table_name from information_schema.role_table_grants
where grantee='authenticated' and table_schema='public'
  and ((table_name in ('audit_logs','payments') and privilege_type in ('UPDATE','DELETE'))
    or (table_name='employee_documents' and privilege_type='DELETE')
    or (table_name='profiles' and privilege_type in ('INSERT','UPDATE','DELETE'))
    or (table_name='staff_invitations' and privilege_type in ('INSERT','UPDATE','DELETE'))
    or (table_name in ('ost_referral_codes','ost_registrations','ost_registration_documents','ost_submission_attempts','profile_permission_overrides','memberships','point_ledger') and privilege_type in ('INSERT','UPDATE','DELETE')))
union all
select 'LEGACY_GENEALOGY_RPC_EXECUTABLE', 'reparent_genealogy_member'
where has_function_privilege('authenticated','public.reparent_genealogy_member(uuid,uuid,text)','execute');

-- Protected roles and required limited-role templates must remain present.
select 'MISSING_PROTECTED_ROLE', required.slug
from (values
  ('super_admin'),('admin'),('vice_director'),('senior_sales_manager'),
  ('sales_manager'),('finance'),('hr'),('employee'),('ost'),('customer')
) required(slug)
where not exists (
  select 1 from public.roles role_record
  where role_record.slug = required.slug
    and role_record.is_system
    and role_record.is_protected
);
