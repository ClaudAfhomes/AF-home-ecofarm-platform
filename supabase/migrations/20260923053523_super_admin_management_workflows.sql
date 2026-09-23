-- Super Admin staff, department, and genealogy management.
-- Down: drop the functions/triggers/table added here, restore the original department
-- policy and profile UPDATE grant, then restore the original genealogy_tree signature.

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_invitations_email_key on public.staff_invitations(lower(email));
create index staff_invitations_status_idx on public.staff_invitations(status, invited_at desc);

alter table public.staff_invitations enable row level security;
create policy staff_invitations_super_admin_read on public.staff_invitations
for select to authenticated using (private.has_permission('roles.manage'));
grant select on public.staff_invitations to authenticated;

create function private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = (select auth.uid())
      and p.is_active
      and p.employment_status = 'active'
      and r.slug = 'super_admin'
  );
$$;
revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;

drop policy if exists departments_manage on public.departments;
create policy departments_super_admin_manage on public.departments
for all to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

revoke insert, update, delete on public.departments from authenticated;
grant insert, update on public.departments to authenticated;

drop policy if exists profiles_manage on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;

create function private.resolve_genealogy_placement(
  p_member_id uuid,
  p_role_id uuid,
  p_parent_id uuid
) returns table(vice_director_id uuid, referral_depth integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_role_slug text;
  v_parent public.profiles;
  v_parent_role text;
begin
  select slug into v_role_slug from public.roles where id = p_role_id and is_system;
  if v_role_slug is null then raise exception 'A seeded system role is required'; end if;

  if v_role_slug = 'vice_director' then
    if p_parent_id is not null then raise exception 'A Vice Director must be a genealogy root'; end if;
    return query select p_member_id, 0;
    return;
  end if;

  if v_role_slug not in ('senior_sales_manager','sales_manager','ost') then
    if p_parent_id is not null then raise exception 'This role cannot have a genealogy placement'; end if;
    return query select null::uuid, 0;
    return;
  end if;

  if p_parent_id is null or p_parent_id = p_member_id then
    raise exception 'A valid referral parent is required';
  end if;
  select p.* into v_parent
  from public.profiles p
  where p.id = p_parent_id and p.is_active and p.employment_status = 'active';
  if v_parent.id is null then raise exception 'Referral parent must be active'; end if;
  select r.slug into v_parent_role from public.roles r where r.id = v_parent.role_id;

  if v_role_slug = 'senior_sales_manager' and v_parent_role <> 'vice_director' then
    raise exception 'A Senior Sales Manager must be placed under a Vice Director';
  elsif v_role_slug = 'sales_manager' and v_parent_role not in ('vice_director','senior_sales_manager') then
    raise exception 'A Sales Manager must be placed under a Vice Director or Senior Sales Manager';
  elsif v_role_slug = 'ost' and v_parent_role <> 'sales_manager' then
    raise exception 'An OST member must be placed under a Sales Manager';
  end if;

  if exists (
    with recursive descendants as (
      select p.id from public.profiles p where p.genealogy_parent_id = p_member_id
      union all
      select p.id from public.profiles p join descendants d on p.genealogy_parent_id = d.id
    ) select 1 from descendants where id = p_parent_id
  ) then raise exception 'Genealogy placement would create a cycle'; end if;

  return query select
    case when v_parent_role = 'vice_director' then v_parent.id else v_parent.vice_director_id end,
    v_parent.referral_depth + 1;
end;
$$;
revoke all on function private.resolve_genealogy_placement(uuid,uuid,uuid) from public, anon, authenticated;

create function public.admin_create_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role_id uuid,
  p_department_id uuid default null,
  p_phone text default null,
  p_employee_no text default null,
  p_parent_id uuid default null
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_placement record;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can create staff profiles'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'Self-provisioning is not allowed'; end if;
  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'Full name is required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and lower(email) = lower(trim(p_email))) then
    raise exception 'Auth user and email do not match';
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id=p_department_id and is_active) then
    raise exception 'Department must be active';
  end if;
  select * into v_placement from private.resolve_genealogy_placement(p_user_id,p_role_id,p_parent_id);
  insert into public.profiles(id,email,full_name,role_id,department_id,phone,employee_no,genealogy_parent_id,vice_director_id,referral_depth)
  values(p_user_id,lower(trim(p_email)),trim(p_full_name),p_role_id,p_department_id,nullif(trim(p_phone),''),nullif(trim(p_employee_no),''),p_parent_id,v_placement.vice_director_id,v_placement.referral_depth)
  returning * into v_profile;
  insert into public.staff_invitations(user_id,email,invited_by)
  values(p_user_id,lower(trim(p_email)),(select auth.uid()));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values((select auth.uid()),'STAFF_INVITED','profiles',p_user_id::text,jsonb_build_object('email',lower(trim(p_email)),'role_id',p_role_id,'department_id',p_department_id,'parent_id',p_parent_id));
  return v_profile;
end;
$$;
revoke all on function public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid) to authenticated;

create function public.admin_update_profile(
  p_member_id uuid,
  p_full_name text,
  p_role_id uuid,
  p_department_id uuid,
  p_employment_status public.employment_status,
  p_phone text,
  p_employee_no text,
  p_parent_id uuid,
  p_reason text
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.profiles;
  v_new public.profiles;
  v_placement record;
  v_sensitive_change boolean;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can update staff profiles'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'A meaningful reason is required'; end if;
  select * into v_old from public.profiles where id=p_member_id for update;
  if v_old.id is null then raise exception 'Profile not found'; end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id=p_department_id and is_active) then
    raise exception 'Department must be active';
  end if;
  v_sensitive_change := v_old.role_id is distinct from p_role_id
    or v_old.department_id is distinct from p_department_id
    or v_old.employment_status is distinct from p_employment_status
    or v_old.genealogy_parent_id is distinct from p_parent_id;
  if p_member_id = (select auth.uid()) and v_sensitive_change then
    raise exception 'Users cannot change their own role, department, status, or genealogy placement';
  end if;
  if v_old.role_id is distinct from p_role_id and exists(select 1 from public.profiles where genealogy_parent_id=p_member_id) then
    raise exception 'Reassign direct referrals before changing this member role';
  end if;
  select * into v_placement from private.resolve_genealogy_placement(p_member_id,p_role_id,p_parent_id);
  update public.profiles set
    full_name=trim(p_full_name), role_id=p_role_id, department_id=p_department_id,
    employment_status=p_employment_status, is_active=(p_employment_status='active'),
    phone=nullif(trim(p_phone),''), employee_no=nullif(trim(p_employee_no),''),
    genealogy_parent_id=p_parent_id, vice_director_id=v_placement.vice_director_id,
    referral_depth=v_placement.referral_depth, updated_at=now()
  where id=p_member_id returning * into v_new;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_values,new_values)
  values((select auth.uid()),case when v_old.genealogy_parent_id is distinct from p_parent_id then 'GENEALOGY_CORRECTED' else 'STAFF_PROFILE_CHANGED' end,'profiles',p_member_id::text,to_jsonb(v_old),to_jsonb(v_new)||jsonb_build_object('reason',trim(p_reason)));
  return v_new;
end;
$$;
revoke all on function public.admin_update_profile(uuid,text,uuid,uuid,public.employment_status,text,text,uuid,text) from public, anon;
grant execute on function public.admin_update_profile(uuid,text,uuid,uuid,public.employment_status,text,text,uuid,text) to authenticated;

create function public.admin_update_department(
  p_department_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean
) returns public.departments
language plpgsql security definer set search_path = '' as $$
declare v_department public.departments;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can manage departments'; end if;
  if not p_is_active and exists(select 1 from public.profiles where department_id=p_department_id and is_active) then
    raise exception 'Reassign or deactivate active staff before deactivating this department';
  end if;
  update public.departments set name=trim(p_name),description=nullif(trim(p_description),''),is_active=p_is_active,updated_at=now()
  where id=p_department_id returning * into v_department;
  if v_department.id is null then raise exception 'Department not found'; end if;
  return v_department;
end;
$$;
revoke all on function public.admin_update_department(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_update_department(uuid,text,text,boolean) to authenticated;

create function public.admin_create_department(p_name text,p_description text default null)
returns public.departments language plpgsql security definer set search_path = '' as $$
declare v_department public.departments;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can manage departments'; end if;
  insert into public.departments(name,description) values(trim(p_name),nullif(trim(p_description),'')) returning * into v_department;
  return v_department;
end;
$$;
revoke all on function public.admin_create_department(text,text) from public, anon;
grant execute on function public.admin_create_department(text,text) to authenticated;

create function private.sync_staff_invitation_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.staff_invitations set status='accepted',accepted_at=new.email_confirmed_at,updated_at=now() where user_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_staff_invitation_acceptance() from public, anon, authenticated;
create trigger sync_staff_invitation_acceptance after update of email_confirmed_at on auth.users
for each row execute function private.sync_staff_invitation_acceptance();

drop function if exists public.genealogy_tree();
create function public.genealogy_tree()
returns table(
  id uuid, full_name text, role_name text, role_slug text, employment_status text,
  is_active boolean, depth integer, parent_id uuid, vice_director_id uuid,
  direct_referrals bigint, total_descendants bigint, sales_total numeric
) language sql stable security definer set search_path = '' as $$
  with recursive visible as (
    select p.id,p.full_name,r.name role_name,r.slug role_slug,p.employment_status::text,p.is_active,
      0 depth,p.genealogy_parent_id parent_id,p.vice_director_id
    from public.profiles p join public.roles r on r.id=p.role_id
    where (private.is_super_admin() and r.slug='vice_director')
       or (r.slug='vice_director' and p.id=(select auth.uid()))
    union all
    select c.id,c.full_name,r.name,r.slug,c.employment_status::text,c.is_active,
      v.depth+1,c.genealogy_parent_id,c.vice_director_id
    from public.profiles c join public.roles r on r.id=c.role_id join visible v on c.genealogy_parent_id=v.id
  ), descendants as (
    select p.id root_id,c.id descendant_id
    from public.profiles p join public.profiles c on c.genealogy_parent_id=p.id
    union all
    select d.root_id,c.id from descendants d join public.profiles c on c.genealogy_parent_id=d.descendant_id
  )
  select v.id,v.full_name,v.role_name,v.role_slug,v.employment_status,v.is_active,v.depth,v.parent_id,v.vice_director_id,
    (select count(*) from public.profiles c where c.genealogy_parent_id=v.id),
    (select count(*) from descendants d where d.root_id=v.id),
    coalesce((select sum(s.total_amount) from public.sales s where s.salesperson_id=v.id and s.status in ('verified','completed')),0)
  from visible v order by v.depth,v.full_name;
$$;
revoke all on function public.genealogy_tree() from public, anon;
grant execute on function public.genealogy_tree() to authenticated;

create function private.prevent_department_delete() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.profiles where department_id=old.id) then
    raise exception 'Departments with assigned staff cannot be deleted; reassign staff or deactivate the department';
  end if;
  return old;
end;
$$;
create trigger departments_prevent_assigned_delete before delete on public.departments
for each row execute function private.prevent_department_delete();

notify pgrst, 'reload schema';
