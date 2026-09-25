-- Fix aggregate/scalar mixing in vice_director_analytics.
-- Authorization, genealogy scoping, and grants remain unchanged.
-- Down: restore the previous function from 20260923103000_secure_qr_and_analytics.sql.

create or replace function public.vice_director_analytics(
  p_from timestamptz,
  p_to timestamptz,
  p_grouping text default 'day',
  p_product_type text default 'All',
  p_vice_director_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_root uuid := coalesce(p_vice_director_id, v_user);
  v_members jsonb;
  v_summary jsonb;
  v_sales jsonb;
begin
  if v_user is null or not private.has_permission('genealogy.view') then
    raise exception 'Genealogy permission required';
  end if;
  if p_vice_director_id is not null and p_vice_director_id <> v_user and not private.is_super_admin() then
    raise exception 'Genealogy filter is outside your scope';
  end if;

  with recursive tree as (
    select p.id, p.full_name, p.employment_status::text as account_status, p.is_active,
    p.is_test_account, p.created_at, r.name as role_name, r.slug as role_slug, 0 as depth
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = v_root and r.slug = 'vice_director'
    union all
    select child.id, child.full_name, child.employment_status::text, child.is_active,
    child.is_test_account, child.created_at, r.name, r.slug, tree.depth + 1
    from public.profiles child
    join public.roles r on r.id = child.role_id
    join tree on child.genealogy_parent_id = tree.id
  ),
  stats as (
    select tree.*,
      (select count(*) from public.profiles direct where direct.genealogy_parent_id = tree.id)::bigint as direct_referrals,
      count(distinct s.id) filter (
        where s.created_at >= p_from and s.created_at < p_to
          and s.status in ('verified','completed')
      )::bigint as verified_sale_count,
      coalesce(sum(py.amount) filter (
        where py.status = 'verified' and s.created_at >= p_from and s.created_at < p_to
      ), 0)::numeric as total_verified_collection,
      max(s.created_at) filter (where s.status in ('verified','completed')) as last_sale_date,
      count(distinct s.id) filter (where s.created_at >= p_from and s.created_at < p_to)::bigint as period_sales
    from tree
    left join public.sales s on s.salesperson_id = tree.id
    left join public.payments py on py.sale_id = s.id
    where not tree.is_test_account
    group by tree.id, tree.full_name, tree.account_status, tree.is_active, tree.created_at,
      tree.is_test_account, tree.role_name, tree.role_slug, tree.depth
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'memberId', id,
    'memberName', full_name,
    'role', role_name,
    'roleSlug', role_slug,
    'accountStatus', account_status,
    'isActive', is_active,
    'directReferrals', direct_referrals,
    'verifiedSaleCount', verified_sale_count,
    'totalVerifiedCollection', total_verified_collection::text,
    'lastSaleDate', last_sale_date,
    'performanceLabel', case when verified_sale_count = 0
      then 'No verified sales in selected period' else 'Verified sales activity' end,
    'newMember', created_at >= p_from and created_at < p_to
  ) order by total_verified_collection desc, verified_sale_count desc, full_name), '[]'::jsonb)
  into v_members
  from stats;

  with recursive tree as (
    select id from public.profiles where id = v_root
    union all
    select p.id from public.profiles p join tree on p.genealogy_parent_id = tree.id
  ),
  members as (select id from tree),
  period_sales as (
    select s.* from public.sales s join members m on m.id = s.salesperson_id
    join public.profiles p on p.id = s.salesperson_id
    where s.created_at >= p_from and s.created_at < p_to and not p.is_test_account
  ),
  payment_totals as (
    select
      count(*) filter (where py.status = 'pending')::bigint as pending_count,
      coalesce(sum(py.amount) filter (where py.status = 'pending'), 0)::numeric as pending_amount
    from public.payments py join period_sales s on s.id = py.sale_id
  ),
  overdue as (
    select count(*)::bigint as overdue_count,
      coalesce(sum(greatest(s.total_amount - coalesce(verified.amount, 0), 0)), 0)::numeric as overdue_amount
    from period_sales s
    left join lateral (
      select coalesce(sum(py.amount), 0)::numeric as amount
      from public.payments py where py.sale_id = s.id and py.status = 'verified'
    ) verified on true
    where s.status = 'overdue'
  )
  select jsonb_build_object(
    'totalMembers', count(*)::bigint,
    'activeMembers', count(*) filter (where p.is_active and p.employment_status = 'active')::bigint,
    'inactiveMembers', count(*) filter (where not p.is_active or p.employment_status <> 'active')::bigint,
    'newMembers', count(*) filter (where p.created_at >= p_from and p.created_at < p_to)::bigint,
    'membersWithSalesActivity', (
      select count(*) from (
        select distinct s.salesperson_id from period_sales s
        where s.status in ('verified','completed')
      ) active_sales
    )::bigint,
    'membersWithNoSalesActivity', (
      count(*) - (
        select count(*) from (
          select distinct s.salesperson_id from period_sales s
          where s.status in ('verified','completed')
        ) active_sales
      )
    )::bigint,
    'pendingPaymentCount', max(payment_totals.pending_count),
    'pendingPaymentAmount', max(payment_totals.pending_amount)::text,
    'overduePaymentCount', max(overdue.overdue_count),
    'overduePaymentAmount', max(overdue.overdue_amount)::text
  )
  into v_summary
  from public.profiles p
  join members m on m.id = p.id
  cross join payment_totals
  cross join overdue;

  v_sales := public.sales_analytics(
    p_from, p_to, p_grouping, p_product_type, null, v_root
  );

  return jsonb_build_object(
    'summary', v_summary,
    'members', v_members,
    'buckets', coalesce(v_sales->'buckets', '[]'::jsonb),
    'filters', v_sales->'filters'
  );
end;
$$;

revoke all on function public.vice_director_analytics(timestamptz,timestamptz,text,text,uuid)
  from public, anon;
grant execute on function public.vice_director_analytics(timestamptz,timestamptz,text,text,uuid)
  to authenticated;

notify pgrst, 'reload schema';
