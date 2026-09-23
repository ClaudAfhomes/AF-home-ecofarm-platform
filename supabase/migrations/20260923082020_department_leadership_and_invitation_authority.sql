-- Adds accountable department leadership without weakening Super Admin-only management.
-- Invitation delegation remains controlled by the existing users.manage/genealogy permissions
-- and will be introduced separately after the invitee-role matrix is approved.
-- Down: drop the two replacement function signatures, drop departments.accountable_leader_id,
-- then restore the prior department functions.

alter table public.departments
  add column if not exists accountable_leader_id uuid
  references public.profiles(id) on delete restrict;

create index if not exists departments_accountable_leader_idx
  on public.departments(accountable_leader_id)
  where accountable_leader_id is not null;

drop function if exists public.admin_create_department(text,text);
create function public.admin_create_department(
  p_name text,
  p_description text default null,
  p_accountable_leader_id uuid default null
) returns public.departments
language plpgsql security definer set search_path = '' as $$
declare v_department public.departments;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can manage departments'; end if;
  if p_accountable_leader_id is not null and not exists(
    select 1 from public.profiles where id=p_accountable_leader_id and is_active
  ) then raise exception 'Accountable leader must be an active profile'; end if;
  insert into public.departments(name,description,accountable_leader_id)
  values(trim(p_name),nullif(trim(p_description),''),p_accountable_leader_id)
  returning * into v_department;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values((select auth.uid()),'DEPARTMENT_CREATED','departments',v_department.id::text,to_jsonb(v_department));
  return v_department;
end;
$$;
revoke all on function public.admin_create_department(text,text,uuid) from public, anon;
grant execute on function public.admin_create_department(text,text,uuid) to authenticated;

drop function if exists public.admin_update_department(uuid,text,text,boolean);
create function public.admin_update_department(
  p_department_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_accountable_leader_id uuid default null
) returns public.departments
language plpgsql security definer set search_path = '' as $$
declare v_old public.departments; v_new public.departments;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can manage departments'; end if;
  select * into v_old from public.departments where id=p_department_id for update;
  if v_old.id is null then raise exception 'Department not found'; end if;
  if not p_is_active and exists(select 1 from public.profiles where department_id=p_department_id and is_active) then
    raise exception 'Reassign or deactivate active staff before deactivating this department';
  end if;
  if p_accountable_leader_id is not null and not exists(
    select 1 from public.profiles where id=p_accountable_leader_id and is_active
  ) then raise exception 'Accountable leader must be an active profile'; end if;
  update public.departments set
    name=trim(p_name), description=nullif(trim(p_description),''),
    is_active=p_is_active, accountable_leader_id=p_accountable_leader_id, updated_at=now()
  where id=p_department_id returning * into v_new;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_values,new_values)
  values((select auth.uid()),'DEPARTMENT_CHANGED','departments',p_department_id::text,to_jsonb(v_old),to_jsonb(v_new));
  return v_new;
end;
$$;
revoke all on function public.admin_update_department(uuid,text,text,boolean,uuid) from public, anon;
grant execute on function public.admin_update_department(uuid,text,text,boolean,uuid) to authenticated;

notify pgrst, 'reload schema';
