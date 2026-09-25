-- Run in staging with representative Auth JWTs using the Supabase RLS Tester.
-- Expected: each query either returns only in-scope rows or is denied.

-- finance: may read payments/sales/customers, may not read employee_documents.
select id,status from public.payments limit 1;
select id from public.employee_documents limit 1;

-- hr: may read profiles/employee_documents, may not read payments/customer_documents.
select id,employment_status from public.profiles limit 1;
select id from public.payments limit 1;

-- vice_director: profiles and sales must be limited to auth.uid() genealogy.
select id,vice_director_id from public.profiles where id <> auth.uid();
select id,vice_director_id from public.sales;

-- sales_manager: finance queue and other salespeople's customers must not be visible.
select id,status from public.payments;
select id,created_by,assigned_salesperson_id from public.customers;

-- employee: may process redemption only; no finance, identity documents, or genealogy access.
select id,status from public.payments;
select id,storage_path from public.customer_documents;
select id,vice_director_id from public.profiles where id <> auth.uid();

-- ost: referral-only by default; no staff sales/customer/finance access.
select id from public.customers;
select id from public.sales;
select id from public.payments;

-- customer: may only use customer-portal/self-service policies added with the portal phase.
select id from public.profiles where id <> auth.uid();
select id from public.customers;
select id from public.payments;

-- Admin must be denied by both permission-management RPCs.
select public.set_member_permission(
  auth.uid(), 'dashboard.view', 'deny', 'RBAC denial verification'
);
select public.set_role_permission(
  'admin', 'dashboard.view', false, 'RBAC denial verification'
);

-- finance: a partial verified payment must not activate a membership or issue points.
-- Run with a staging sale/payment fixture and replace the UUID placeholders.
select public.verify_payment('00000000-0000-0000-0000-000000000000', true, 'staging partial payment');
select public.activate_membership('00000000-0000-0000-0000-000000000000');

-- Activation is idempotent: two successful calls produce one membership and one annual credit.
select sale_id, count(*) from public.memberships group by sale_id having count(*) > 1;
select idempotency_key, count(*) from public.point_ledger
where entry_type='annual_credit' group by idempotency_key having count(*) > 1;
