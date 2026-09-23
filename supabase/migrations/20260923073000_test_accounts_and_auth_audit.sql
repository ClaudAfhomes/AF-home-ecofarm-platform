-- Adds explicitly marked test accounts and auditable interactive authentication.
-- Down: drop record_auth_event(text); restore the prior dashboard_metrics and
-- admin_create_profile signatures; drop profiles.is_test_account.

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

create index if not exists profiles_test_account_idx
  on public.profiles(is_test_account) where is_test_account;

create or replace function private.is_test_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_test_account from public.profiles where id=p_profile_id),false);
$$;
revoke all on function private.is_test_profile(uuid) from public, anon, authenticated;

drop function if exists public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid);
create function public.admin_create_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role_id uuid,
  p_department_id uuid default null,
  p_phone text default null,
  p_employee_no text default null,
  p_parent_id uuid default null,
  p_is_test_account boolean default false
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_placement record;
  v_role_slug text;
  v_full_name text;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can create staff profiles'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'Self-provisioning is not allowed'; end if;
  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'Full name is required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and lower(email) = lower(trim(p_email))) then
    raise exception 'Auth user and email do not match';
  end if;
  select slug into v_role_slug from public.roles where id=p_role_id;
  if v_role_slug is null then raise exception 'Role not found'; end if;
  if p_is_test_account and v_role_slug not in ('admin','finance','hr','vice_director','senior_sales_manager','sales_manager','ost') then
    raise exception 'This role is not permitted for a test account';
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id=p_department_id and is_active) then
    raise exception 'Department must be active';
  end if;
  select * into v_placement from private.resolve_genealogy_placement(p_user_id,p_role_id,p_parent_id);
  v_full_name := trim(p_full_name);
  if p_is_test_account and upper(v_full_name) not like 'TEST - %' then v_full_name := 'TEST - ' || v_full_name; end if;
  insert into public.profiles(id,email,full_name,role_id,department_id,phone,employee_no,genealogy_parent_id,vice_director_id,referral_depth,is_test_account)
  values(p_user_id,lower(trim(p_email)),v_full_name,p_role_id,p_department_id,nullif(trim(p_phone),''),nullif(trim(p_employee_no),''),p_parent_id,v_placement.vice_director_id,v_placement.referral_depth,p_is_test_account)
  returning * into v_profile;
  insert into public.staff_invitations(user_id,email,invited_by)
  values(p_user_id,lower(trim(p_email)),(select auth.uid()));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values((select auth.uid()),'STAFF_INVITED','profiles',p_user_id::text,jsonb_build_object('email',lower(trim(p_email)),'role_id',p_role_id,'department_id',p_department_id,'parent_id',p_parent_id,'is_test_account',p_is_test_account));
  return v_profile;
end;
$$;
revoke all on function public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid,boolean) from public, anon;
grant execute on function public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid,boolean) to authenticated;

create or replace function public.record_auth_event(p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if lower(trim(p_event)) not in ('login','logout') then raise exception 'Unsupported authentication event'; end if;
  select * into v_profile from public.profiles where id=(select auth.uid());
  if v_profile.id is null then raise exception 'Profile not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(v_profile.id,'AUTH_' || upper(trim(p_event)),'profiles',v_profile.id::text,jsonb_build_object('role_id',v_profile.role_id,'is_test_account',v_profile.is_test_account));
end;
$$;
revoke all on function public.record_auth_event(text) from public, anon;
grant execute on function public.record_auth_event(text) to authenticated;

create or replace function public.dashboard_metrics() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'customers',(select count(*) from public.customers c where not private.is_test_profile(c.created_by)),
  'sales',(select count(*) from public.sales s where not private.is_test_profile(s.salesperson_id)),
  'pendingPayments',(select count(*) from public.payments py join public.sales s on s.id=py.sale_id where py.status='pending' and not private.is_test_profile(s.salesperson_id)),
  'activeMembers',(select count(*) from public.profiles where is_active and not is_test_account),
  'revenue',(select coalesce(sum(py.amount),0)::text from public.payments py join public.sales s on s.id=py.sale_id where py.status='verified' and not private.is_test_profile(s.salesperson_id)),
  'overdue',(select count(*) from public.sales s where s.status='overdue' and not private.is_test_profile(s.salesperson_id))
);
$$;

drop function if exists public.genealogy_tree();
create function public.genealogy_tree()
returns table(
  id uuid, full_name text, role_name text, role_slug text, employment_status text,
  is_active boolean, is_test_account boolean, depth integer, parent_id uuid, vice_director_id uuid,
  direct_referrals bigint, total_descendants bigint, sales_total numeric
) language sql stable security definer set search_path = '' as $$
  with recursive visible as (
    select p.id,p.full_name,r.name role_name,r.slug role_slug,p.employment_status::text,p.is_active,p.is_test_account,
      0 depth,p.genealogy_parent_id parent_id,p.vice_director_id
    from public.profiles p join public.roles r on r.id=p.role_id
    where (private.is_super_admin() and r.slug='vice_director')
       or (r.slug='vice_director' and p.id=(select auth.uid()))
    union all
    select c.id,c.full_name,r.name,r.slug,c.employment_status::text,c.is_active,c.is_test_account,
      v.depth+1,c.genealogy_parent_id,c.vice_director_id
    from public.profiles c join public.roles r on r.id=c.role_id join visible v on c.genealogy_parent_id=v.id
  ), descendants as (
    select p.id root_id,c.id descendant_id from public.profiles p join public.profiles c on c.genealogy_parent_id=p.id
    union all select d.root_id,c.id from descendants d join public.profiles c on c.genealogy_parent_id=d.descendant_id
  )
  select v.id,v.full_name,v.role_name,v.role_slug,v.employment_status,v.is_active,v.is_test_account,v.depth,v.parent_id,v.vice_director_id,
    (select count(*) from public.profiles c where c.genealogy_parent_id=v.id),
    (select count(*) from descendants d where d.root_id=v.id),
    coalesce((select sum(s.total_amount) from public.sales s where s.salesperson_id=v.id and s.status in ('verified','completed')),0)
  from visible v order by v.depth,v.full_name;
$$;
revoke all on function public.genealogy_tree() from public, anon;
grant execute on function public.genealogy_tree() to authenticated;
