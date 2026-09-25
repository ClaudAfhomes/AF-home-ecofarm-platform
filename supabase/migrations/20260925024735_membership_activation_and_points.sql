-- Finance-controlled membership activation and immutable point accounting.
-- Down: drop activate_membership, memberships and point_ledger after preserving history.

alter table public.products
  add column if not exists annual_points integer not null default 0 check (annual_points >= 0),
  add column if not exists membership_duration_days integer not null default 365
    check (membership_duration_days > 0);

update public.products
set price = case name
      when 'Gold' then 60000
      when 'Silver' then 40000
      when 'Bronze' then 30000
      else price
    end,
    down_payment_type = 'fixed',
    down_payment_value = case name
      when 'Gold' then 20000
      when 'Silver' then 15000
      when 'Bronze' then 10000
      else down_payment_value
    end,
    annual_points = case name
      when 'Gold' then 60000
      when 'Silver' then 40000
      when 'Bronze' then 25000
      else annual_points
    end,
    membership_duration_days = 365,
    updated_at = now()
where name in ('Gold','Silver','Bronze');

insert into public.business_rules(key,value,description)
values
  ('payment_balance_due_days','7','Calendar days allowed to complete a card balance'),
  ('payment_due_reminders','{"enabled":true,"days_before":[3,1],"overdue_enabled":true}',
   'Configurable balance due and overdue reminders; no late fee or cancellation rule')
on conflict (key) do nothing;

create function private.set_sale_payment_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.payment_deadline := new.created_at + interval '7 days';
  return new;
end;
$$;
revoke all on function private.set_sale_payment_deadline() from public, anon, authenticated;

drop trigger if exists set_sale_payment_deadline on public.sales;
create trigger set_sale_payment_deadline
before insert on public.sales
for each row execute function private.set_sale_payment_deadline();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  member_code text not null unique default ('AFH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  status text not null default 'inactive'
    check (status in ('inactive','active','expired','reversed')),
  activated_at timestamptz,
  expires_at timestamptz,
  activated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'inactive' and activated_at is null and expires_at is null and activated_by is null)
    or
    (status <> 'inactive' and activated_at is not null and expires_at is not null and activated_by is not null)
  )
);

create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete restrict,
  entry_type text not null
    check (entry_type in ('annual_credit','redemption','reversal','adjustment')),
  points integer not null check (points <> 0),
  idempotency_key text not null unique,
  description text not null,
  reversed_entry_id uuid references public.point_ledger(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (entry_type = 'reversal' and reversed_entry_id is not null)
    or (entry_type <> 'reversal' and reversed_entry_id is null)
  )
);

create index memberships_customer_status_idx on public.memberships(customer_id,status);
create index memberships_product_idx on public.memberships(product_id);
create index point_ledger_membership_created_idx on public.point_ledger(membership_id,created_at);
create unique index point_ledger_one_reversal_idx
  on public.point_ledger(reversed_entry_id) where reversed_entry_id is not null;

alter table public.memberships enable row level security;
alter table public.point_ledger enable row level security;

create policy memberships_staff_read on public.memberships for select to authenticated
using (
  private.has_permission('finance.manage')
  or private.has_permission('membership.activate')
  or private.has_permission('sales.manage')
);
create policy point_ledger_staff_read on public.point_ledger for select to authenticated
using (
  private.has_permission('finance.manage')
  or private.has_permission('membership.activate')
  or private.has_permission('redemption.process')
  or private.has_permission('redemption.manage')
);

grant select on public.memberships, public.point_ledger to authenticated;
revoke insert, update, delete on public.memberships, public.point_ledger from anon, authenticated;

create or replace function public.verify_payment(
  p_payment_id uuid,
  p_approved boolean,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_sale public.sales;
  v_verified_total numeric;
  v_status public.sale_status;
begin
  if not private.has_permission('finance.manage') then
    raise exception 'Finance permission required';
  end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if v_payment.id is null or v_payment.status <> 'pending' then
    raise exception 'Payment is not pending';
  end if;
  if not p_approved and length(trim(coalesce(p_notes,''))) < 3 then
    raise exception 'Rejection reason required';
  end if;
  select * into v_sale from public.sales where id=v_payment.sale_id for update;

  update public.payments
  set status=case when p_approved then 'verified'::public.payment_status else 'rejected'::public.payment_status end,
      verified_by=(select auth.uid()),
      verified_at=now(),
      verification_notes=nullif(trim(p_notes),'')
  where id=p_payment_id;

  select coalesce(sum(amount),0)
  into v_verified_total
  from public.payments
  where sale_id=v_sale.id and status='verified';

  v_status := case
    when v_verified_total >= v_sale.total_amount then 'completed'::public.sale_status
    when v_verified_total > 0 then 'partially_paid'::public.sale_status
    else 'awaiting_payment'::public.sale_status
  end;
  update public.sales set status=v_status,updated_at=now() where id=v_sale.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(
    (select auth.uid()),
    case when p_approved then 'PAYMENT_VERIFIED' else 'PAYMENT_REJECTED' end,
    'payments',v_payment.id::text,
    jsonb_build_object('approved',p_approved,'sale_id',v_sale.id,'verified_total',v_verified_total::text,'sale_status',v_status)
  );
end;
$$;

revoke all on function public.verify_payment(uuid,boolean,text) from public, anon;
grant execute on function public.verify_payment(uuid,boolean,text) to authenticated;

create function public.activate_membership(p_sale_id uuid)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_product public.products;
  v_verified_total numeric;
  v_membership public.memberships;
begin
  if not private.has_permission('membership.activate') then
    raise exception 'Membership activation permission required';
  end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null then raise exception 'Sale not found'; end if;
  select * into v_product from public.products where id=v_sale.product_id;
  select coalesce(sum(amount),0) into v_verified_total
  from public.payments where sale_id=v_sale.id and status='verified';
  if v_verified_total < v_sale.total_amount or v_sale.status <> 'completed' then
    raise exception 'Membership requires verified full payment';
  end if;

  insert into public.memberships(customer_id,sale_id,product_id,status,activated_at,expires_at,activated_by)
  values(
    v_sale.customer_id,v_sale.id,v_sale.product_id,'active',now(),
    now() + make_interval(days => v_product.membership_duration_days),(select auth.uid())
  )
  on conflict (sale_id) do update
  set status = case when public.memberships.status='inactive' then 'active' else public.memberships.status end,
      activated_at = coalesce(public.memberships.activated_at,excluded.activated_at),
      expires_at = coalesce(public.memberships.expires_at,excluded.expires_at),
      activated_by = coalesce(public.memberships.activated_by,excluded.activated_by),
      updated_at = now()
  returning * into v_membership;

  insert into public.point_ledger(
    membership_id,entry_type,points,idempotency_key,description,created_by
  ) values(
    v_membership.id,'annual_credit',v_product.annual_points,
    'membership-activation:' || v_sale.id::text,
    v_product.name || ' annual membership points',(select auth.uid())
  )
  on conflict (idempotency_key) do nothing;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(
    (select auth.uid()),'MEMBERSHIP_ACTIVATED','memberships',v_membership.id::text,
    jsonb_build_object('sale_id',v_sale.id,'points',v_product.annual_points,'expires_at',v_membership.expires_at)
  );
  return v_membership;
end;
$$;

revoke all on function public.activate_membership(uuid) from public, anon;
grant execute on function public.activate_membership(uuid) to authenticated;

create trigger audit_memberships
after insert or update or delete on public.memberships
for each row execute function private.audit_trigger();
create trigger audit_point_ledger
after insert or update or delete on public.point_ledger
for each row execute function private.audit_trigger();

notify pgrst, 'reload schema';
