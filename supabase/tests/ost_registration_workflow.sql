-- Returns zero rows when OST registration boundaries are intact.
select 'ANON_CAN_READ_OST_DATA' as violation, table_name as object_name
from information_schema.role_table_grants
where grantee='anon' and table_schema='public'
  and table_name in ('ost_referral_codes','ost_registrations','ost_registration_documents','ost_submission_attempts')
union all
select 'CLIENT_CAN_MUTATE_OST_DATA', table_name
from information_schema.role_table_grants
where grantee='authenticated' and table_schema='public'
  and table_name in ('ost_referral_codes','ost_registrations','ost_registration_documents','ost_submission_attempts')
  and privilege_type in ('INSERT','UPDATE','DELETE')
union all
select 'CLIENT_CAN_APPROVE_OST', 'approve_ost_registration'
where has_function_privilege('authenticated','public.approve_ost_registration(uuid,uuid,uuid)','execute')
union all
select 'PUBLIC_ID_BUCKET', id
from storage.buckets where id='ost-registration-documents' and public;
