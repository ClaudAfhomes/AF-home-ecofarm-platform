-- Phase 1 Super Admin dashboard aggregate.
-- Validate after apply: authenticated non-super-admin calls must fail; test accounts
-- must not contribute to KPIs, series, or operational queues.
-- Down: drop function public.super_admin_dashboard(timestamptz,timestamptz,text).

create or replace function public.super_admin_dashboard(
  p_from timestamptz,
  p_to timestamptz,
  p_grouping text default 'day'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_series jsonb;
  v_kpis jsonb;
  v_activity jsonb;
  v_queues jsonb;
  v_high jsonb;
  v_low jsonb;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then
    raise exception 'Super Admin access required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'A valid analytics date range is required' using errcode = '22023';
  end if;
  if p_grouping not in ('day', 'week', 'month', 'year') then
    raise exception 'Invalid analytics grouping' using errcode = '22023';
  end if;
  if p_to - p_from > interval '5 years' then
    raise exception 'Analytics range cannot exceed five years' using errcode = '22023';
  end if;

  with periods as (
    select generate_series(
      date_trunc(p_grouping, p_from),
      date_trunc(p_grouping, p_to - interval '1 microsecond'),
      case p_grouping when 'day' then interval '1 day' when 'week' then interval '1 week'
        when 'month' then interval '1 month' else interval '1 year' end
    ) as bucket
  ), sales_by_period as (
    select date_trunc(p_grouping, s.created_at) as bucket, count(*)::bigint as value
    from public.sales s join public.profiles seller on seller.id=s.salesperson_id and not seller.is_test_account
    where s.created_at >= p_from and s.created_at < p_to and s.status in ('verified','completed') group by 1
  ), collections_by_period as (
    select date_trunc(p_grouping, coalesce(py.verified_at,py.created_at)) as bucket, coalesce(sum(py.amount),0)::numeric as value
    from public.payments py join public.sales s on s.id=py.sale_id
    join public.profiles seller on seller.id=s.salesperson_id and not seller.is_test_account
    where py.status='verified' and coalesce(py.verified_at,py.created_at) >= p_from
      and coalesce(py.verified_at,py.created_at) < p_to group by 1
  ), activations_by_period as (
    select date_trunc(p_grouping,m.activated_at) as bucket,count(*)::bigint as value
    from public.memberships m join public.sales s on s.id=m.sale_id
    join public.profiles seller on seller.id=s.salesperson_id and not seller.is_test_account
    where m.status='active' and m.activated_at >= p_from and m.activated_at < p_to group by 1
  ), redemptions_by_period as (
    select date_trunc(p_grouping,pl.created_at) as bucket,coalesce(sum(abs(pl.points)),0)::bigint as value
    from public.point_ledger pl join public.memberships m on m.id=pl.membership_id
    join public.sales s on s.id=m.sale_id join public.profiles seller on seller.id=s.salesperson_id and not seller.is_test_account
    where pl.entry_type='redemption' and pl.created_at >= p_from and pl.created_at < p_to group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket',periods.bucket,'cardSales',coalesce(sales_by_period.value,0),
    'collections',coalesce(collections_by_period.value,0)::text,
    'cardActivations',coalesce(activations_by_period.value,0),
    'pointsRedeemed',coalesce(redemptions_by_period.value,0)
  ) order by periods.bucket),'[]'::jsonb) into v_series
  from periods left join sales_by_period using(bucket) left join collections_by_period using(bucket)
  left join activations_by_period using(bucket) left join redemptions_by_period using(bucket);

  with values_by_period as (
    select value->>'bucket' bucket,(value->>'cardSales')::bigint card_sales,(value->>'collections')::numeric collections
    from jsonb_array_elements(v_series)
  )
  select
    coalesce((select jsonb_build_object('bucket',bucket,'cardSales',card_sales,'collections',collections::text)
      from values_by_period order by card_sales desc,collections desc,bucket asc limit 1),jsonb_build_object('bucket',null,'cardSales',0,'collections','0')),
    coalesce((select jsonb_build_object('bucket',bucket,'cardSales',card_sales,'collections',collections::text)
      from values_by_period order by card_sales asc,collections asc,bucket asc limit 1),jsonb_build_object('bucket',null,'cardSales',0,'collections','0'))
  into v_high,v_low;

  select jsonb_build_object(
    'verifiedSales',(select count(*) from public.sales s join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and s.status in ('verified','completed') and s.created_at >= p_from and s.created_at < p_to),
    'verifiedCollections',(select coalesce(sum(py.amount),0)::text from public.payments py join public.sales s on s.id=py.sale_id join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and py.status='verified' and coalesce(py.verified_at,py.created_at) >= p_from and coalesce(py.verified_at,py.created_at) < p_to),
    'activeMemberships',(select count(*) from public.memberships m join public.sales s on s.id=m.sale_id join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and m.status='active' and m.expires_at > now()),
    'pendingAccounts',(select count(*) from public.sales s join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and s.status in ('submitted','awaiting_payment','verification_pending')),
    'downPaymentAccounts',(select count(*) from public.sales s join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and s.status='partially_paid'),
    'overdueAccounts',(select count(*) from public.sales s join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and (s.status='overdue' or (s.payment_deadline < current_date and s.status in ('awaiting_payment','partially_paid','verification_pending')))),
    'pointsIssued',(select coalesce(sum(pl.points),0) from public.point_ledger pl join public.memberships m on m.id=pl.membership_id join public.sales s on s.id=m.sale_id join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and pl.entry_type='annual_credit'),
    'pointsRedeemed',(select coalesce(sum(abs(pl.points)),0) from public.point_ledger pl join public.memberships m on m.id=pl.membership_id join public.sales s on s.id=m.sale_id join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and pl.entry_type='redemption'),
    'pendingFinalQualifications',null,'earnedUnpaidCommissions',null,
    'activeSellers',(select count(*) from public.profiles p join public.roles r on r.id=p.role_id where not p.is_test_account and r.slug in ('vice_director','senior_sales_manager','sales_manager') and p.is_active and p.employment_status='active'),
    'inactiveSellers',(select count(*) from public.profiles p join public.roles r on r.id=p.role_id where not p.is_test_account and r.slug in ('vice_director','senior_sales_manager','sales_manager') and (not p.is_active or p.employment_status<>'active')),
    'activeEmployees',(select count(*) from public.profiles p join public.roles r on r.id=p.role_id where not p.is_test_account and r.slug='employee' and p.is_active and p.employment_status='active'),
    'inactiveEmployees',(select count(*) from public.profiles p join public.roles r on r.id=p.role_id where not p.is_test_account and r.slug='employee' and (not p.is_active or p.employment_status<>'active'))
  ) into v_kpis;

  select coalesce(jsonb_agg(item order by item->>'createdAt' desc),'[]'::jsonb) into v_activity from (
    select jsonb_build_object('id',a.id,'action',a.action,'entityType',a.entity_type,'entityId',a.entity_id,
      'createdAt',a.created_at,'actorName',coalesce(actor.full_name,'System')) item
    from public.audit_logs a left join public.profiles actor on actor.id=a.actor_id
    where actor.id is null or not actor.is_test_account order by a.created_at desc limit 10
  ) recent;

  select jsonb_build_object(
    'paymentVerification',jsonb_build_object('available',true,
      'count',(select count(*) from public.payments py join public.sales s on s.id=py.sale_id join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and py.status='pending'),
      'items',coalesce((select jsonb_agg(item order by item->>'createdAt' desc) from (
        select jsonb_build_object('id',py.id,'label',s.sale_no,'detail',concat(c.first_name,' ',c.last_name),'createdAt',py.created_at) item
        from public.payments py join public.sales s on s.id=py.sale_id join public.customers c on c.id=s.customer_id join public.profiles p on p.id=s.salesperson_id
        where not p.is_test_account and py.status='pending' order by py.created_at desc limit 5) q),'[]'::jsonb)),
    'cardActivation',jsonb_build_object('available',true,
      'count',(select count(*) from public.sales s join public.profiles p on p.id=s.salesperson_id where not p.is_test_account and s.status='completed' and not exists(select 1 from public.memberships m where m.sale_id=s.id and m.status='active')),
      'items',coalesce((select jsonb_agg(item order by item->>'createdAt' desc) from (
        select jsonb_build_object('id',s.id,'label',s.sale_no,'detail',concat(c.first_name,' ',c.last_name),'createdAt',s.updated_at) item
        from public.sales s join public.customers c on c.id=s.customer_id join public.profiles p on p.id=s.salesperson_id
        where not p.is_test_account and s.status='completed' and not exists(select 1 from public.memberships m where m.sale_id=s.id and m.status='active') order by s.updated_at desc limit 5) q),'[]'::jsonb)),
    'finalQualification',jsonb_build_object('available',false,'count',null,'items','[]'::jsonb),
    'ostApplications',jsonb_build_object('available',true,
      'count',(select count(*) from public.ost_registrations o where o.status in ('pending_verification','needs_correction','verified')),
      'items',coalesce((select jsonb_agg(item order by item->>'createdAt' desc) from (
        select jsonb_build_object('id',o.id,'label',concat(o.first_name,' ',o.last_name),'detail',replace(o.status::text,'_',' '),'createdAt',o.submitted_at) item
        from public.ost_registrations o where o.status in ('pending_verification','needs_correction','verified') order by o.submitted_at desc limit 5) q),'[]'::jsonb)),
    'commissionPayout',jsonb_build_object('available',false,'count',null,'items','[]'::jsonb)
  ) into v_queues;

  return jsonb_build_object('range',jsonb_build_object('from',p_from,'to',p_to,'grouping',p_grouping),
    'kpis',v_kpis,'series',v_series,'extremes',jsonb_build_object('highest',v_high,'lowest',v_low),
    'activity',v_activity,'queues',v_queues);
end;
$$;

revoke all on function public.super_admin_dashboard(timestamptz,timestamptz,text) from public,anon;
grant execute on function public.super_admin_dashboard(timestamptz,timestamptz,text) to authenticated;
