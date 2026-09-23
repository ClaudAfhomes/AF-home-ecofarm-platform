-- AFhomes Ecofarm initial secure schema.
-- Down: drop schemas private/public business objects and the three storage buckets explicitly.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.employment_status as enum ('active','inactive','suspended','resigned');
create type public.sale_status as enum ('draft','submitted','awaiting_payment','partially_paid','verification_pending','verified','overdue','completed','cancelled','reversed');
create type public.payment_status as enum ('pending','verified','rejected','reversed');

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  module text not null,
  created_at timestamptz not null default now()
);
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
create table public.departments (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  employee_no text unique, full_name text not null, email text not null unique, phone text,
  department_id uuid references public.departments(id) on delete set null,
  role_id uuid not null references public.roles(id) on delete restrict,
  employment_status public.employment_status not null default 'active',
  genealogy_parent_id uuid references public.profiles(id) on delete restrict,
  vice_director_id uuid references public.profiles(id) on delete restrict,
  referral_depth integer not null default 0 check (referral_depth >= 0),
  credit_eligibility boolean not null default false,
  credit_count integer not null default 0 check (credit_count >= 0),
  manager_shoulders_payment boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (genealogy_parent_id is null or genealogy_parent_id <> id)
);
create table public.employee_documents (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null, storage_path text not null unique, sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null, size_bytes bigint not null check (size_bytes > 0), uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.product_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text, is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(), category_id uuid not null references public.product_categories(id) on delete restrict,
  name text not null unique, description text, status text not null default 'active' check (status in ('active','inactive','retired')),
  price numeric(14,2) not null check (price >= 0),
  down_payment_type text not null default 'fixed' check (down_payment_type in ('fixed','percentage','none')),
  down_payment_value numeric(14,2) not null default 0 check (down_payment_value >= 0),
  image_path text, created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), customer_no text not null unique default ('CUS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  first_name text not null, middle_name text, last_name text not null, email text, phone text not null, address text not null,
  id_type text not null, id_number_encrypted text,
  created_by uuid not null default auth.uid() references public.profiles(id), assigned_salesperson_id uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customer_documents (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  kind text not null, storage_path text not null unique, sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null, size_bytes bigint not null check (size_bytes > 0), uploaded_by uuid not null default auth.uid() references public.profiles(id),
  ocr_status text not null default 'not_configured' check (ocr_status in ('not_configured','pending','extracted','reviewed','failed')),
  ocr_result jsonb, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table public.sales (
  id uuid primary key default gen_random_uuid(), sale_no text not null unique default ('SAL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_id uuid not null references public.customers(id) on delete restrict, product_id uuid not null references public.products(id) on delete restrict,
  salesperson_id uuid not null references public.profiles(id) on delete restrict, vice_director_id uuid references public.profiles(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('spot_cash','down_payment','installment')),
  total_amount numeric(14,2) not null check (total_amount >= 0), status public.sale_status not null default 'draft', payment_deadline timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (transaction_type <> 'spot_cash' or payment_deadline is not null)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0), method text not null, reference_number text,
  status public.payment_status not null default 'pending', receipt_path text, receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[a-f0-9]{64}$'),
  collected_by uuid not null default auth.uid() references public.profiles(id), verified_by uuid references public.profiles(id), verified_at timestamptz,
  verification_notes text, created_at timestamptz not null default now(),
  check ((receipt_path is null) = (receipt_sha256 is null)),
  check ((status = 'pending' and verified_by is null and verified_at is null) or (status <> 'pending' and verified_by is not null and verified_at is not null))
);
create table public.payment_corrections (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id) on delete restrict,
  correction_type text not null check (correction_type in ('reversal','adjustment')), amount numeric(14,2) not null,
  reason text not null check (length(trim(reason)) >= 8), created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create table public.qr_credits (
  id uuid primary key default gen_random_uuid(), manager_id uuid not null references public.profiles(id) on delete restrict,
  referred_member_id uuid not null references public.profiles(id) on delete restrict, referral_depth integer not null check (referral_depth >= 1),
  credit_number integer not null check (credit_number >= 1), eligible boolean not null, manager_shoulders_payment boolean not null default false,
  created_at timestamptz not null default now(), unique(manager_id, referred_member_id)
);
create table public.invite_codes (
  id uuid primary key default gen_random_uuid(), code_hash text not null unique, vice_director_id uuid not null references public.profiles(id) on delete restrict,
  intended_role_id uuid not null references public.roles(id) on delete restrict, created_by uuid not null default auth.uid() references public.profiles(id),
  expires_at timestamptz not null, max_uses integer not null default 1 check (max_uses > 0), use_count integer not null default 0 check (use_count >= 0), revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.business_rules (
  key text primary key, value jsonb not null, description text not null, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete restrict,
  title text not null, body text not null, kind text not null default 'info', read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid, action text not null, entity_type text not null, entity_id text,
  old_values jsonb, new_values jsonb, ip_address inet, created_at timestamptz not null default now()
);
create index profiles_genealogy_parent_idx on public.profiles(genealogy_parent_id);
create index profiles_vice_director_idx on public.profiles(vice_director_id);
create index payments_status_created_idx on public.payments(status, created_at desc);
create index sales_vd_status_idx on public.sales(vice_director_id, status);
create index audit_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create function private.has_permission(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join public.role_permissions rp on rp.role_id=p.role_id join public.permissions pm on pm.id=rp.permission_id where p.id=(select auth.uid()) and p.is_active and pm.key=p_key);
$$;
revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.has_permission(text) to authenticated;

create function public.current_permissions() returns text[] language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(pm.key order by pm.key), '{}'::text[]) from public.profiles p join public.role_permissions rp on rp.role_id=p.role_id join public.permissions pm on pm.id=rp.permission_id where p.id=(select auth.uid()) and p.is_active;
$$;

create function private.audit_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_values,new_values)
  values((select auth.uid()),tg_op,tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'key',to_jsonb(old)->>'key',to_jsonb(new)->>'role_id',to_jsonb(old)->>'role_id'),case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new,old);
end; $$;
revoke all on function private.audit_trigger() from public, anon, authenticated;

do $$ declare t text; begin foreach t in array array['profiles','departments','products','customers','customer_documents','sales','payments','payment_corrections','qr_credits','invite_codes','business_rules','role_permissions'] loop execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_trigger()',t,t); end loop; end $$;
create function private.audit_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Audit records are immutable'; end; $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function private.audit_immutable();

create function public.verify_payment(p_payment_id uuid,p_approved boolean,p_notes text) returns void language plpgsql security definer set search_path='' as $$
declare v public.payments; begin
  if not private.has_permission('finance.manage') then raise exception 'permission denied'; end if;
  select * into v from public.payments where id=p_payment_id for update;
  if v.id is null or v.status <> 'pending' then raise exception 'payment is not pending'; end if;
  if not p_approved and length(trim(coalesce(p_notes,''))) < 3 then raise exception 'rejection reason required'; end if;
  update public.payments set status=case when p_approved then 'verified'::public.payment_status else 'rejected'::public.payment_status end,verified_by=(select auth.uid()),verified_at=now(),verification_notes=p_notes where id=p_payment_id;
  update public.sales set status=case when p_approved then 'verified'::public.sale_status else 'awaiting_payment'::public.sale_status end,updated_at=now() where id=v.sale_id;
end; $$;
revoke all on function public.verify_payment(uuid,boolean,text) from public, anon;
grant execute on function public.verify_payment(uuid,boolean,text) to authenticated;

create function public.reparent_genealogy_member(p_member_id uuid,p_parent_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_parent public.profiles; v_member public.profiles; begin
  if not private.has_permission('genealogy.manage') then raise exception 'permission denied'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'a meaningful reason is required'; end if;
  select * into v_parent from public.profiles where id=p_parent_id and is_active for update;
  select * into v_member from public.profiles where id=p_member_id for update;
  if v_parent.id is null or v_member.id is null or p_member_id=p_parent_id then raise exception 'invalid genealogy assignment'; end if;
  if v_parent.vice_director_id is distinct from v_member.vice_director_id and v_parent.id is distinct from v_member.vice_director_id then raise exception 'cross-genealogy assignment denied'; end if;
  if exists(with recursive descendants as (select id from public.profiles where genealogy_parent_id=p_member_id union all select p.id from public.profiles p join descendants d on p.genealogy_parent_id=d.id) select 1 from descendants where id=p_parent_id) then raise exception 'genealogy cycle denied'; end if;
  update public.profiles set genealogy_parent_id=p_parent_id,referral_depth=v_parent.referral_depth+1,updated_at=now() where id=p_member_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values) values((select auth.uid()),'GENEALOGY_REPARENT','profiles',p_member_id::text,jsonb_build_object('parent_id',p_parent_id,'reason',p_reason));
end; $$;
revoke all on function public.reparent_genealogy_member(uuid,uuid,text) from public, anon;
grant execute on function public.reparent_genealogy_member(uuid,uuid,text) to authenticated;

create function public.record_export(p_report text,p_filters jsonb,p_row_count integer) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_permission('reports.view') then raise exception 'permission denied'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,new_values) values((select auth.uid()),'EXPORT','report',jsonb_build_object('report',p_report,'filters',p_filters,'row_count',p_row_count));
end; $$;
revoke all on function public.record_export(text,jsonb,integer) from public, anon;
grant execute on function public.record_export(text,jsonb,integer) to authenticated;

create function public.dashboard_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('customers',(select count(*) from public.customers),'sales',(select count(*) from public.sales),'pendingPayments',(select count(*) from public.payments where status='pending'),'activeMembers',(select count(*) from public.profiles where is_active),'revenue',(select coalesce(sum(amount),0)::text from public.payments where status='verified'),'overdue',(select count(*) from public.sales where status='overdue'));
$$;
create function public.genealogy_tree() returns table(id uuid,full_name text,role_name text,is_active boolean,depth integer,parent_id uuid) language sql stable security invoker set search_path='' as $$
with recursive tree as (
 select p.id,p.full_name,r.name role_name,p.is_active,0 depth,p.genealogy_parent_id from public.profiles p join public.roles r on r.id=p.role_id where p.id=(select auth.uid()) or (p.vice_director_id=(select auth.uid()) and p.genealogy_parent_id is null)
 union all select c.id,c.full_name,r.name,c.is_active,t.depth+1,c.genealogy_parent_id from public.profiles c join public.roles r on r.id=c.role_id join tree t on c.genealogy_parent_id=t.id
) select distinct * from tree order by depth,full_name;
$$;

alter table public.roles enable row level security; alter table public.permissions enable row level security; alter table public.role_permissions enable row level security;
alter table public.departments enable row level security; alter table public.profiles enable row level security; alter table public.employee_documents enable row level security;
alter table public.product_categories enable row level security; alter table public.products enable row level security; alter table public.customers enable row level security;
alter table public.customer_documents enable row level security; alter table public.sales enable row level security; alter table public.payments enable row level security;
alter table public.payment_corrections enable row level security; alter table public.qr_credits enable row level security; alter table public.invite_codes enable row level security;
alter table public.business_rules enable row level security; alter table public.notifications enable row level security; alter table public.audit_logs enable row level security;

create policy roles_read on public.roles for select to authenticated using ((select auth.uid()) is not null);
create policy permissions_read on public.permissions for select to authenticated using ((select auth.uid()) is not null);
create policy role_permissions_read on public.role_permissions for select to authenticated using ((select auth.uid()) is not null);
create policy role_permissions_manage on public.role_permissions for all to authenticated using (private.has_permission('roles.manage')) with check (private.has_permission('roles.manage'));
create policy departments_read on public.departments for select to authenticated using ((select auth.uid()) is not null);
create policy departments_manage on public.departments for all to authenticated using (private.has_permission('departments.manage')) with check (private.has_permission('departments.manage'));
create policy profiles_read on public.profiles for select to authenticated using (id=(select auth.uid()) or private.has_permission('users.manage') or private.has_permission('hr.manage') or (private.has_permission('genealogy.view') and (vice_director_id=(select auth.uid()) or id=(select auth.uid()))));
create policy profiles_manage on public.profiles for update to authenticated using (private.has_permission('users.manage') or private.has_permission('hr.manage')) with check (private.has_permission('users.manage') or private.has_permission('hr.manage'));
create policy employee_docs_hr on public.employee_documents for all to authenticated using (private.has_permission('hr.manage')) with check (private.has_permission('hr.manage'));
create policy categories_read on public.product_categories for select to authenticated using ((select auth.uid()) is not null);
create policy categories_manage on public.product_categories for all to authenticated using (private.has_permission('products.manage')) with check (private.has_permission('products.manage'));
create policy products_read on public.products for select to authenticated using ((select auth.uid()) is not null);
create policy products_manage on public.products for all to authenticated using (private.has_permission('products.manage')) with check (private.has_permission('products.manage'));
create policy customers_read on public.customers for select to authenticated using (private.has_permission('customers.manage') and (private.has_permission('finance.manage') or private.has_permission('users.manage') or created_by=(select auth.uid()) or assigned_salesperson_id=(select auth.uid())));
create policy customers_insert on public.customers for insert to authenticated with check (private.has_permission('customers.manage') and created_by=(select auth.uid()));
create policy customers_update on public.customers for update to authenticated using (private.has_permission('customers.manage') and (created_by=(select auth.uid()) or assigned_salesperson_id=(select auth.uid()) or private.has_permission('users.manage'))) with check (private.has_permission('customers.manage'));
create policy customer_docs_access on public.customer_documents for select to authenticated using (private.has_permission('finance.manage') or private.has_permission('customers.manage'));
create policy customer_docs_insert on public.customer_documents for insert to authenticated with check (private.has_permission('customers.manage') and uploaded_by=(select auth.uid()));
create policy sales_read on public.sales for select to authenticated using (private.has_permission('finance.manage') or private.has_permission('users.manage') or salesperson_id=(select auth.uid()) or vice_director_id=(select auth.uid()));
create policy sales_insert on public.sales for insert to authenticated with check (private.has_permission('sales.manage') and created_by=(select auth.uid()));
create policy sales_update on public.sales for update to authenticated using (private.has_permission('sales.manage') and (salesperson_id=(select auth.uid()) or private.has_permission('finance.manage'))) with check (private.has_permission('sales.manage'));
create policy payments_read on public.payments for select to authenticated using (private.has_permission('finance.manage') or collected_by=(select auth.uid()) or exists(select 1 from public.sales s where s.id=sale_id and (s.salesperson_id=(select auth.uid()) or s.vice_director_id=(select auth.uid()))));
create policy payments_insert on public.payments for insert to authenticated with check (private.has_permission('sales.manage') and collected_by=(select auth.uid()) and status='pending');
create policy corrections_finance on public.payment_corrections for select to authenticated using (private.has_permission('finance.manage'));
create policy corrections_insert on public.payment_corrections for insert to authenticated with check (private.has_permission('finance.manage') and created_by=(select auth.uid()));
create policy qr_read on public.qr_credits for select to authenticated using (private.has_permission('qr_credits.manage') and (manager_id=(select auth.uid()) or private.has_permission('users.manage')));
create policy invites_read on public.invite_codes for select to authenticated using (vice_director_id=(select auth.uid()) or private.has_permission('users.manage'));
create policy invites_manage on public.invite_codes for insert to authenticated with check (created_by=(select auth.uid()) and (vice_director_id=(select auth.uid()) or private.has_permission('users.manage')));
create policy rules_read on public.business_rules for select to authenticated using ((select auth.uid()) is not null);
create policy rules_manage on public.business_rules for all to authenticated using (private.has_permission('settings.manage')) with check (private.has_permission('settings.manage'));
create policy notifications_own on public.notifications for select to authenticated using (recipient_id=(select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));
create policy audit_read on public.audit_logs for select to authenticated using (private.has_permission('audit.view'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('customer-documents','customer-documents',false,10485760,array['image/jpeg','image/png','application/pdf']),
('employee-documents','employee-documents',false,10485760,array['image/jpeg','image/png','application/pdf']),
('payment-receipts','payment-receipts',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do nothing;
create policy customer_storage_read on storage.objects for select to authenticated using (bucket_id='customer-documents' and (private.has_permission('customers.manage') or private.has_permission('finance.manage')));
create policy customer_storage_insert on storage.objects for insert to authenticated with check (bucket_id='customer-documents' and private.has_permission('customers.manage') and (storage.foldername(name))[1] is not null);
create policy employee_storage_hr on storage.objects for all to authenticated using (bucket_id='employee-documents' and private.has_permission('hr.manage')) with check (bucket_id='employee-documents' and private.has_permission('hr.manage'));
create policy receipts_storage_read on storage.objects for select to authenticated using (bucket_id='payment-receipts' and (private.has_permission('finance.manage') or private.has_permission('sales.manage')));
create policy receipts_storage_insert on storage.objects for insert to authenticated with check (bucket_id='payment-receipts' and private.has_permission('sales.manage'));

grant usage on schema public to authenticated;
grant select on public.roles,public.permissions,public.role_permissions,public.departments,public.profiles,public.employee_documents,public.product_categories,public.products,public.customers,public.customer_documents,public.sales,public.payments,public.payment_corrections,public.qr_credits,public.invite_codes,public.business_rules,public.notifications,public.audit_logs to authenticated;
grant insert,update on public.customers,public.customer_documents,public.sales,public.notifications to authenticated;
grant insert on public.payments,public.payment_corrections,public.invite_codes to authenticated;
grant insert,update,delete on public.departments,public.product_categories,public.products,public.role_permissions,public.business_rules to authenticated;
grant usage,select on sequence public.audit_logs_id_seq to authenticated;

alter publication supabase_realtime add table public.payments, public.notifications, public.profiles;
