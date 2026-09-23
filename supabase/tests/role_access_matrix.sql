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

-- sales_manager / ost: finance queue and other salespeople's customers must not be visible.
select id,status from public.payments;
select id,created_by,assigned_salesperson_id from public.customers;
