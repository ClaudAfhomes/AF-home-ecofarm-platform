-- Align staff invitations with the users.manage permission while preventing role escalation.
-- Validation: an active admin with users.manage may create non-Super-Admin profiles; only a
-- Super Admin may create another Super Admin. Existing genealogy and department validation remains.
-- Down: restore admin_create_profile from 20260923073000_test_accounts_and_auth_audit.sql.

create or replace function public.admin_create_profile(
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
  v_actor_role text;
  v_role_slug text;
  v_full_name text;
begin
  if not private.has_permission('users.manage') then
    raise exception 'Staff management permission required';
  end if;
  select r.slug into v_actor_role
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = (select auth.uid())
    and p.is_active
    and p.employment_status = 'active';
  if v_actor_role not in ('super_admin','admin') then
    raise exception 'Only Super Admin or Admin can create staff profiles';
  end if;
  if p_user_id = (select auth.uid()) then raise exception 'Self-provisioning is not allowed'; end if;
  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'Full name is required'; end if;
  if not exists (select 1 from auth.users where id=p_user_id and lower(email)=lower(trim(p_email))) then
    raise exception 'Auth user and email do not match';
  end if;
  if exists(select 1 from public.profiles where lower(email)=lower(trim(p_email))) then
    raise exception 'A staff profile already exists for this email';
  end if;
  select slug into v_role_slug from public.roles where id=p_role_id and is_system;
  if v_role_slug is null then raise exception 'Role not found'; end if;
  if v_actor_role = 'admin' and v_role_slug = 'super_admin' then
    raise exception 'Admins cannot create Super Admin profiles';
  end if;
  if p_is_test_account and v_role_slug not in ('admin','finance','hr','vice_director','senior_sales_manager','sales_manager','ost') then
    raise exception 'This role is not permitted for a test account';
  end if;
  if p_department_id is not null and not exists(
    select 1 from public.departments where id=p_department_id and is_active
  ) then raise exception 'Department must be active'; end if;
  select * into v_placement from private.resolve_genealogy_placement(p_user_id,p_role_id,p_parent_id);
  v_full_name := trim(p_full_name);
  if p_is_test_account and upper(v_full_name) not like 'TEST - %' then v_full_name := 'TEST - ' || v_full_name; end if;
  insert into public.profiles(
    id,email,full_name,role_id,department_id,phone,employee_no,genealogy_parent_id,
    vice_director_id,referral_depth,is_test_account
  ) values(
    p_user_id,lower(trim(p_email)),v_full_name,p_role_id,p_department_id,
    nullif(trim(p_phone),''),nullif(trim(p_employee_no),''),p_parent_id,
    v_placement.vice_director_id,v_placement.referral_depth,p_is_test_account
  ) returning * into v_profile;
  insert into public.staff_invitations(user_id,email,invited_by)
  values(p_user_id,lower(trim(p_email)),(select auth.uid()));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(
    (select auth.uid()),'STAFF_INVITED','profiles',p_user_id::text,
    jsonb_build_object(
      'email',lower(trim(p_email)),'role_id',p_role_id,'department_id',p_department_id,
      'parent_id',p_parent_id,'is_test_account',p_is_test_account
    )
  );
  return v_profile;
end;
$$;
revoke all on function public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid,boolean) from public, anon;
grant execute on function public.admin_create_profile(uuid,text,text,uuid,uuid,text,text,uuid,boolean) to authenticated;
