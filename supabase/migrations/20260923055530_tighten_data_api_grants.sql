-- Remove Supabase default Data API grants, then restore the least privileges required by RLS.
-- Down: restore the grants from 20260923025231_initial_secure_schema.sql if rollback is required.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant usage on schema public to authenticated;
grant select on
  public.roles, public.permissions, public.role_permissions, public.departments,
  public.profiles, public.employee_documents, public.product_categories, public.products,
  public.customers, public.customer_documents, public.sales, public.payments,
  public.payment_corrections, public.qr_credits, public.invite_codes,
  public.staff_invitations, public.business_rules, public.notifications, public.audit_logs
to authenticated;

grant insert, update on public.customers, public.customer_documents, public.sales, public.notifications to authenticated;
grant insert on public.payments, public.payment_corrections, public.invite_codes to authenticated;
grant insert, update, delete on public.product_categories, public.products, public.role_permissions, public.business_rules to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;

notify pgrst, 'reload schema';
