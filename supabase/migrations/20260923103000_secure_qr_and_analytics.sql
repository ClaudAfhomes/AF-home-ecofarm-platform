-- Secure QR redemption and time-bucketed sales analytics.
-- Down: drop the RPCs, policies, indexes, and qr_scan_events table added here.

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  scanner_id uuid not null references public.profiles(id) on delete restrict,
  token_hash text,
  invite_code_id uuid references public.invite_codes(id) on delete restrict,
  manager_id uuid references public.profiles(id) on delete restrict,
  referred_member_id uuid references public.profiles(id) on delete restrict,
  result text not null check (result in ('success','invalid','expired','revoked','duplicate','unauthorized','error')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists qr_scan_events_scanner_created_idx
  on public.qr_scan_events(scanner_id, created_at desc);
create index if not exists qr_scan_events_token_hash_idx
  on public.qr_scan_events(token_hash, created_at desc);

alter table public.qr_scan_events enable row level security;

drop policy if exists qr_scan_events_read on public.qr_scan_events;
create policy qr_scan_events_read on public.qr_scan_events
for select to authenticated
using (
  scanner_id = (select auth.uid())
  or private.has_permission('users.manage')
  or private.has_permission('audit.view')
);

revoke all on public.qr_scan_events from anon;
grant select on public.qr_scan_events to authenticated;

create or replace function public.scan_qr_code(
  p_token text,
  p_referred_member_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scanner uuid := (select auth.uid());
  v_token text := trim(coalesce(p_token, ''));
  v_token_hash text;
  v_invite public.invite_codes;
  v_member public.profiles;
  v_member_role text;
  v_credit public.qr_credits;
  v_credit_number integer;
  v_max_depth integer := 1;
  v_max_credits integer := 3;
  v_referred_member_id uuid;
  v_reason text;
begin
  if v_scanner is null then
    raise exception 'Authentication required';
  end if;
  if not private.has_permission('qr_credits.manage') then
    raise exception 'QR credit permission required';
  end if;
  if length(v_token) < 8 then
    insert into public.qr_scan_events(scanner_id, result, reason)
    values(v_scanner, 'invalid', 'QR token is too short');
    return jsonb_build_object('status', 'invalid', 'message', 'The QR code is not a valid AFhomes token.');
  end if;

  v_token_hash := encode(public.digest(v_token, 'sha256'), 'hex');
  v_referred_member_id := coalesce(p_referred_member_id, v_scanner);

  select * into v_invite
  from public.invite_codes
  where code_hash = v_token_hash
  for update;

  if v_invite.id is null then
    insert into public.qr_scan_events(scanner_id, token_hash, result, reason)
    values(v_scanner, v_token_hash, 'invalid', 'Token was not found');
    return jsonb_build_object('status', 'invalid', 'message', 'This QR code is not recognized.');
  end if;

  if v_invite.revoked_at is not null then
    insert into public.qr_scan_events(scanner_id, token_hash, invite_code_id, result, reason)
    values(v_scanner, v_token_hash, v_invite.id, 'revoked', 'Token was revoked');
    return jsonb_build_object('status', 'revoked', 'message', 'This QR code has been revoked.');
  end if;

  if v_invite.expires_at <= now() then
    insert into public.qr_scan_events(scanner_id, token_hash, invite_code_id, result, reason)
    values(v_scanner, v_token_hash, v_invite.id, 'expired', 'Token expired');
    return jsonb_build_object('status', 'expired', 'message', 'This QR code has expired.');
  end if;

  if v_invite.use_count >= v_invite.max_uses then
    insert into public.qr_scan_events(scanner_id, token_hash, invite_code_id, result, reason)
    values(v_scanner, v_token_hash, v_invite.id, 'duplicate', 'Token has already been redeemed');
    return jsonb_build_object('status', 'duplicate', 'message', 'This QR code has already been used.');
  end if;

  if p_referred_member_id is not null
     and p_referred_member_id <> v_scanner
     and not private.has_permission('genealogy.manage') then
    insert into public.qr_scan_events(
      scanner_id, token_hash, invite_code_id, referred_member_id, result, reason
    )
    values(v_scanner, v_token_hash, v_invite.id, p_referred_member_id, 'unauthorized', 'Target member is outside scanner scope');
    return jsonb_build_object('status', 'unauthorized', 'message', 'You cannot redeem a QR credit for this member.');
  end if;

  select p.*
  into v_member
  from public.profiles p
  where p.id = v_referred_member_id
    and p.is_active
    and p.employment_status = 'active';
  select r.slug
  into v_member_role
  from public.roles r
  where r.id = v_member.role_id;

  if v_member.id is null then
    insert into public.qr_scan_events(
      scanner_id, token_hash, invite_code_id, referred_member_id, result, reason
    )
    values(v_scanner, v_token_hash, v_invite.id, v_referred_member_id, 'invalid', 'Member is not active');
    return jsonb_build_object('status', 'invalid', 'message', 'The referred member is not active.');
  end if;

  if v_member_role <> (select slug from public.roles where id = v_invite.intended_role_id) then
    insert into public.qr_scan_events(
      scanner_id, token_hash, invite_code_id, referred_member_id, result, reason
    )
    values(v_scanner, v_token_hash, v_invite.id, v_referred_member_id, 'invalid', 'QR role does not match member role');
    return jsonb_build_object('status', 'invalid', 'message', 'This QR code is not valid for the selected member role.');
  end if;

  select coalesce((value->>'maximum_eligible_referral_number')::integer, 3),
         coalesce((value->>'maximum_depth')::integer, 1)
  into v_max_credits, v_max_depth
  from public.business_rules
  where key = 'referral_credit_policy';

  select count(*) + 1 into v_credit_number
  from public.qr_credits
  where manager_id = v_invite.vice_director_id
    and referred_member_id = v_referred_member_id;

  if v_member.referral_depth > v_max_depth or v_credit_number > v_max_credits then
    v_reason := 'Referral credit policy limit reached';
    insert into public.qr_scan_events(
      scanner_id, token_hash, invite_code_id, manager_id, referred_member_id, result, reason
    )
    values(v_scanner, v_token_hash, v_invite.id, v_invite.vice_director_id, v_referred_member_id, 'invalid', v_reason);
    return jsonb_build_object('status', 'invalid', 'message', 'This referral is outside the current QR credit policy.');
  end if;

  if exists (
    select 1 from public.qr_credits
    where manager_id = v_invite.vice_director_id
      and referred_member_id = v_referred_member_id
  ) then
    insert into public.qr_scan_events(
      scanner_id, token_hash, invite_code_id, manager_id, referred_member_id, result, reason
    )
    values(v_scanner, v_token_hash, v_invite.id, v_invite.vice_director_id, v_referred_member_id, 'duplicate', 'Credit already exists for this referral');
    return jsonb_build_object('status', 'duplicate', 'message', 'This member already has a QR credit.');
  end if;

  insert into public.qr_credits(
    manager_id, referred_member_id, referral_depth, credit_number, eligible, manager_shoulders_payment
  )
  values(
    v_invite.vice_director_id,
    v_referred_member_id,
    v_member.referral_depth,
    v_credit_number,
    true,
    coalesce((select (value->>'manager_shoulders_payment')::boolean
              from public.business_rules where key = 'referral_credit_policy'), false)
  )
  on conflict (manager_id, referred_member_id) do nothing
  returning * into v_credit;

  if v_credit.id is null then
    insert into public.qr_scan_events(
      scanner_id, token_hash, invite_code_id, manager_id, referred_member_id, result, reason
    )
    values(v_scanner, v_token_hash, v_invite.id, v_invite.vice_director_id, v_referred_member_id, 'duplicate', 'Credit already exists for this referral');
    return jsonb_build_object('status', 'duplicate', 'message', 'This member already has a QR credit.');
  end if;

  update public.invite_codes
  set use_count = use_count + 1
  where id = v_invite.id;

  insert into public.qr_scan_events(
    scanner_id, token_hash, invite_code_id, manager_id, referred_member_id, result, reason
  )
  values(v_scanner, v_token_hash, v_invite.id, v_invite.vice_director_id, v_referred_member_id, 'success', 'QR credit granted');

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_values)
  values(
    v_scanner,
    'QR_CREDIT_REDEEMED',
    'qr_credits',
    v_credit.id::text,
    jsonb_build_object(
      'invite_code_id', v_invite.id,
      'manager_id', v_invite.vice_director_id,
      'referred_member_id', v_referred_member_id,
      'credit_number', v_credit_number
    )
  );

  return jsonb_build_object(
    'status', 'success',
    'message', 'QR credit granted successfully.',
    'creditId', v_credit.id,
    'memberId', v_referred_member_id,
    'creditNumber', v_credit_number
  );
end;
$$;

revoke all on function public.scan_qr_code(text, uuid) from public, anon;
grant execute on function public.scan_qr_code(text, uuid) to authenticated;

create or replace function public.sales_analytics(
  p_from timestamptz,
  p_to timestamptz,
  p_grouping text default 'day',
  p_product_type text default 'All',
  p_salesperson_id uuid default null,
  p_vice_director_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_filter jsonb;
  v_buckets jsonb;
  v_summary jsonb;
begin
  if v_user is null or not private.has_permission('dashboard.view') then
    raise exception 'Dashboard permission required';
  end if;
  if p_to <= p_from then raise exception 'Analytics end must be after start'; end if;
  if p_grouping not in ('day','week','month','year') then raise exception 'Unsupported analytics grouping'; end if;
  if p_product_type not in ('All','Bronze','Silver','Gold') then raise exception 'Unsupported product type'; end if;
  if p_salesperson_id is not null
     and p_salesperson_id <> v_user
     and not private.has_permission('users.manage')
     and not private.has_permission('finance.manage') then
    raise exception 'Salesperson filter is outside your scope';
  end if;
  if p_vice_director_id is not null
     and p_vice_director_id <> v_user
     and not private.is_super_admin() then
    raise exception 'Genealogy filter is outside your scope';
  end if;

  with scoped_sales as (
    select s.*, p.name as product_name
    from public.sales s
    join public.products p on p.id = s.product_id
    join public.profiles sp on sp.id = s.salesperson_id
    where s.created_at >= p_from
      and s.created_at < p_to
      and not sp.is_test_account
      and (p_product_type = 'All' or p.name = p_product_type)
      and (p_salesperson_id is null or s.salesperson_id = p_salesperson_id)
      and (
        p_vice_director_id is null
        or s.vice_director_id = p_vice_director_id
        or exists (
          select 1 from public.profiles scoped_member
          where scoped_member.id = s.salesperson_id
            and scoped_member.vice_director_id = p_vice_director_id
        )
      )
      and (
        private.has_permission('users.manage')
        or private.has_permission('finance.manage')
        or s.salesperson_id = v_user
        or s.vice_director_id = v_user
        or exists (
          select 1 from public.profiles scoped_member
          where scoped_member.id = s.salesperson_id
            and scoped_member.vice_director_id = v_user
        )
      )
  ),
  periods as (
    select generate_series(
      date_trunc(p_grouping, p_from),
      date_trunc(p_grouping, p_to - interval '1 microsecond'),
      case p_grouping when 'day' then interval '1 day'
        when 'week' then interval '1 week'
        when 'month' then interval '1 month'
        else interval '1 year' end
    ) as bucket
  ),
  sales_grouped as (
    select date_trunc(p_grouping, ss.created_at) as bucket,
      count(*)::bigint as sales_created,
      count(*) filter (where ss.status in ('verified','completed'))::bigint as verified_sales
    from scoped_sales ss
    group by date_trunc(p_grouping, ss.created_at)
  ),
  payment_grouped as (
    select date_trunc(p_grouping, ss.created_at) as bucket,
      coalesce(sum(py.amount) filter (where py.status = 'verified' and py.created_at >= p_from and py.created_at < p_to), 0)::numeric as collected_amount,
      coalesce(sum(py.amount) filter (where py.status = 'verified'), 0)::numeric as total_collected_amount,
      count(py.id) filter (where py.status = 'pending')::bigint as pending_payments,
      coalesce(sum(py.amount) filter (where py.status = 'pending'), 0)::numeric as pending_amount
    from scoped_sales ss
    left join public.payments py on py.sale_id = ss.id
    group by date_trunc(p_grouping, ss.created_at)
  ),
  grouped as (
    select coalesce(sales_grouped.bucket, payment_grouped.bucket) as bucket,
      sales_grouped.sales_created,
      sales_grouped.verified_sales,
      payment_grouped.collected_amount,
      payment_grouped.total_collected_amount,
      payment_grouped.pending_payments,
      payment_grouped.pending_amount
    from sales_grouped
    full join payment_grouped using (bucket)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', periods.bucket,
    'salesCreated', coalesce(grouped.sales_created, 0),
    'verifiedSales', coalesce(grouped.verified_sales, 0),
    'collectedAmount', coalesce(grouped.collected_amount, 0)::text,
    'totalCollectedAmount', coalesce(grouped.total_collected_amount, 0)::text,
    'pendingPayments', coalesce(grouped.pending_payments, 0),
    'pendingAmount', coalesce(grouped.pending_amount, 0)::text
  ) order by periods.bucket), '[]'::jsonb)
  into v_buckets
  from periods
  left join grouped on grouped.bucket = periods.bucket;

  with scoped_sales as (
    select s.id, s.created_at, s.status, s.transaction_type
    from public.sales s
    join public.profiles sp on sp.id = s.salesperson_id
    join public.products p on p.id = s.product_id
    where s.created_at >= p_from and s.created_at < p_to
      and not sp.is_test_account
      and (p_product_type = 'All' or p.name = p_product_type)
      and (p_salesperson_id is null or s.salesperson_id = p_salesperson_id)
      and (
        p_vice_director_id is null
        or s.vice_director_id = p_vice_director_id
        or exists (
          select 1 from public.profiles scoped_member
          where scoped_member.id = s.salesperson_id
            and scoped_member.vice_director_id = p_vice_director_id
        )
      )
      and (
        private.has_permission('users.manage')
        or private.has_permission('finance.manage')
        or s.salesperson_id = v_user
        or s.vice_director_id = v_user
        or exists (
          select 1 from public.profiles scoped_member
          where scoped_member.id = s.salesperson_id
            and scoped_member.vice_director_id = v_user
        )
      )
  ),
  totals as (
    select
      count(*)::bigint as created_count,
      count(*) filter (where status in ('verified','completed'))::bigint as verified_count
    from scoped_sales
  ),
  payments_total as (
    select
      coalesce(sum(py.amount) filter (
        where py.status = 'verified'
          and py.created_at >= p_from and py.created_at < p_to
          and ss.transaction_type = 'down_payment'
      ), 0)::numeric as collected,
      coalesce(sum(py.amount) filter (where py.status = 'verified'), 0)::numeric as total_collected,
      count(*) filter (where py.status = 'pending')::bigint as pending_count,
      coalesce(sum(py.amount) filter (where py.status = 'pending'), 0)::numeric as pending_amount
    from public.payments py
    join scoped_sales ss on ss.id = py.sale_id
  ),
  bucket_values as (
    select value->>'bucket' as bucket, (value->>'verifiedSales')::numeric as verified_sales,
      (value->>'totalCollectedAmount')::numeric as total_collected
    from jsonb_array_elements(v_buckets)
  )
  select jsonb_build_object(
    'totalSalesCreated', totals.created_count,
    'totalVerifiedSales', totals.verified_count,
    'downPaymentCollection', payments_total.collected::text,
    'totalCollection', payments_total.total_collected::text,
    'averageSalesPerPeriod', coalesce((totals.verified_count / nullif(jsonb_array_length(v_buckets), 0)::numeric), 0)::text,
    'highestPeriod', coalesce((
      select jsonb_build_object('bucket', bucket, 'verifiedSales', verified_sales, 'amount', total_collected::text)
      from bucket_values order by verified_sales desc, total_collected desc limit 1
    ), jsonb_build_object('bucket', null, 'verifiedSales', 0, 'amount', '0')),
    'lowestPeriod', coalesce((
      select jsonb_build_object('bucket', bucket, 'verifiedSales', verified_sales, 'amount', total_collected::text)
      from bucket_values order by verified_sales asc, total_collected asc limit 1
    ), jsonb_build_object('bucket', null, 'verifiedSales', 0, 'amount', '0')),
    'pendingPayments', payments_total.pending_count,
    'pendingAmount', payments_total.pending_amount::text
  )
  into v_summary
  from totals cross join payments_total;

  v_filter := jsonb_build_object(
    'from', p_from, 'to', p_to, 'grouping', p_grouping,
    'productType', p_product_type, 'salespersonId', p_salesperson_id,
    'viceDirectorId', p_vice_director_id
  );
  return jsonb_build_object('filters', v_filter, 'summary', v_summary, 'buckets', v_buckets);
end;
$$;

revoke all on function public.sales_analytics(timestamptz,timestamptz,text,text,uuid,uuid) from public, anon;
grant execute on function public.sales_analytics(timestamptz,timestamptz,text,text,uuid,uuid) to authenticated;

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
    'pendingPaymentCount', payment_totals.pending_count,
    'pendingPaymentAmount', payment_totals.pending_amount::text,
    'overduePaymentCount', overdue.overdue_count,
    'overduePaymentAmount', overdue.overdue_amount::text
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

revoke all on function public.vice_director_analytics(timestamptz,timestamptz,text,text,uuid) from public, anon;
grant execute on function public.vice_director_analytics(timestamptz,timestamptz,text,text,uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.sales;
exception
  when duplicate_object then null;
end
$$;

notify pgrst, 'reload schema';
