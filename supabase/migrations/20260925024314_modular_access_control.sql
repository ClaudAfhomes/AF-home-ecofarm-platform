-- Modular RBAC with protected system roles and per-account permission overrides.
-- Validation: effective permissions are role grants plus explicit allows, minus explicit denies.
-- Only Super Admin may change templates or member overrides; Super Admin access is immutable.
-- Down: drop the two public RPCs and profile_permission_overrides; restore prior permission functions.

alter table public.roles
  add column if not exists is_protected boolean not null default false;

insert into public.roles(slug, name, description, is_system, is_protected)
values
  ('employee', 'Employee', 'Limited staff redemption access', true, true),
  ('customer', 'Customer', 'Customer self-service portal access', true, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    is_system = true,
    is_protected = true;

update public.roles
set is_protected = true
where slug in (
  'super_admin','admin','vice_director','senior_sales_manager','sales_manager',
  'finance','hr','employee','ost','customer'
);

insert into public.permissions(key, name, module)
values
  ('analytics.view', 'View analytics', 'dashboard_analytics'),
  ('cms.manage', 'Manage CMS content', 'cms'),
  ('identity.manage', 'Process customer identity documents', 'customer_identity'),
  ('card_issue.manage', 'Create and issue card sales', 'card_issuance'),
  ('membership.activate', 'Activate fully paid memberships', 'membership_activation'),
  ('ost.manage', 'Manage OST referrals and applications', 'ost'),
  ('commissions.manage', 'Manage commission qualification and payout', 'commissions'),
  ('redemption.process', 'Process point redemptions', 'redemption_pos'),
  ('redemption.manage', 'Manage redeemable catalog and reversals', 'redemption_pos'),
  ('notifications.view', 'View notifications', 'notifications'),
  ('notifications.manage', 'Manage notifications', 'notifications'),
  ('customer_portal.view', 'View own customer portal', 'customer_portal')
on conflict (key) do update
set name = excluded.name,
    module = excluded.module;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'super_admin'
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any(case r.slug
  when 'vice_director' then array[
    'dashboard.view','analytics.view','customers.manage','identity.manage',
    'card_issue.manage','sales.manage','genealogy.view','genealogy.manage',
    'qr_credits.manage','reports.view'
  ]
  when 'senior_sales_manager' then array[
    'dashboard.view','customers.manage','identity.manage','card_issue.manage',
    'sales.manage','genealogy.view','reports.view'
  ]
  when 'sales_manager' then array[
    'dashboard.view','customers.manage','identity.manage','card_issue.manage',
    'sales.manage','genealogy.view','reports.view','qr_credits.manage'
  ]
  when 'finance' then array[
    'dashboard.view','analytics.view','customers.manage','finance.manage',
    'membership.activate','commissions.manage','reports.view'
  ]
  when 'employee' then array['dashboard.view','redemption.process']
  when 'customer' then array['customer_portal.view','notifications.view']
  else array[]::text[]
end)
where r.slug in (
  'vice_director','senior_sales_manager','sales_manager','finance','employee','customer'
)
on conflict do nothing;

-- OST accounts are referral-only by default and do not inherit staff operations.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.slug = 'ost'
  and p.key in ('customers.manage','sales.manage');

create table public.profile_permission_overrides (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  reason text not null check (length(trim(reason)) >= 8),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, permission_id)
);

create index profile_permission_overrides_permission_idx
  on public.profile_permission_overrides(permission_id);
create index profile_permission_overrides_changed_by_idx
  on public.profile_permission_overrides(changed_by);

alter table public.profile_permission_overrides enable row level security;

create policy profile_permission_overrides_read
on public.profile_permission_overrides
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or private.has_permission('roles.manage')
);

grant select on public.profile_permission_overrides to authenticated;
revoke insert, update, delete on public.profile_permission_overrides from anon, authenticated;

create or replace function private.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.roles role_record on role_record.id = profile.role_id
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.employment_status = 'active'
      and (
        role_record.slug = 'super_admin'
        or (
          not exists (
            select 1
            from public.profile_permission_overrides denied
            join public.permissions permission on permission.id = denied.permission_id
            where denied.profile_id = profile.id
              and permission.key = p_key
              and denied.effect = 'deny'
          )
          and (
            exists (
              select 1
              from public.role_permissions role_permission
              join public.permissions permission on permission.id = role_permission.permission_id
              where role_permission.role_id = profile.role_id
                and permission.key = p_key
            )
            or exists (
              select 1
              from public.profile_permission_overrides allowed
              join public.permissions permission on permission.id = allowed.permission_id
              where allowed.profile_id = profile.id
                and permission.key = p_key
                and allowed.effect = 'allow'
            )
          )
        )
      )
  );
$$;

revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.has_permission(text) to authenticated;

create or replace function public.current_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select profile.id, profile.role_id, role_record.slug
    from public.profiles profile
    join public.roles role_record on role_record.id = profile.role_id
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.employment_status = 'active'
  ),
  candidates as (
    select permission.key
    from actor
    join public.role_permissions role_permission on role_permission.role_id = actor.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    union
    select permission.key
    from actor
    join public.profile_permission_overrides override_record
      on override_record.profile_id = actor.id and override_record.effect = 'allow'
    join public.permissions permission on permission.id = override_record.permission_id
    union
    select permission.key
    from actor
    cross join public.permissions permission
    where actor.slug = 'super_admin'
  )
  select coalesce(array_agg(candidate.key order by candidate.key), '{}'::text[])
  from candidates candidate
  where not exists (
    select 1
    from actor
    join public.profile_permission_overrides denied
      on denied.profile_id = actor.id and denied.effect = 'deny'
    join public.permissions permission on permission.id = denied.permission_id
    where permission.key = candidate.key
      and actor.slug <> 'super_admin'
  );
$$;

revoke all on function public.current_permissions() from public, anon;
grant execute on function public.current_permissions() to authenticated;

create or replace function public.set_member_permission(
  p_profile_id uuid,
  p_permission_key text,
  p_effect text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission_id uuid;
  v_target_role text;
begin
  if not private.is_super_admin() then
    raise exception 'Only Super Admin can change member permissions';
  end if;
  if p_profile_id = (select auth.uid()) then
    raise exception 'Self permission changes are not allowed';
  end if;
  if p_effect not in ('allow','deny','inherit') then
    raise exception 'Permission effect must be allow, deny, or inherit';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 then
    raise exception 'A meaningful reason is required';
  end if;

  select role_record.slug
  into v_target_role
  from public.profiles profile
  join public.roles role_record on role_record.id = profile.role_id
  where profile.id = p_profile_id
  for update of profile;
  if v_target_role is null then raise exception 'Profile not found'; end if;
  if v_target_role = 'super_admin' then
    raise exception 'Super Admin permissions are protected';
  end if;

  select id into v_permission_id
  from public.permissions
  where key = p_permission_key;
  if v_permission_id is null then raise exception 'Permission not found'; end if;

  if p_effect = 'inherit' then
    delete from public.profile_permission_overrides
    where profile_id = p_profile_id and permission_id = v_permission_id;
  else
    insert into public.profile_permission_overrides(
      profile_id, permission_id, effect, reason, changed_by
    ) values(
      p_profile_id, v_permission_id, p_effect, trim(p_reason), (select auth.uid())
    )
    on conflict (profile_id, permission_id) do update
    set effect = excluded.effect,
        reason = excluded.reason,
        changed_by = excluded.changed_by,
        updated_at = now();
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_values)
  values(
    (select auth.uid()), 'MEMBER_PERMISSION_CHANGED', 'profiles', p_profile_id::text,
    jsonb_build_object(
      'permission', p_permission_key,
      'effect', p_effect,
      'reason', trim(p_reason)
    )
  );
end;
$$;

revoke all on function public.set_member_permission(uuid,text,text,text) from public, anon;
grant execute on function public.set_member_permission(uuid,text,text,text) to authenticated;

create or replace function public.set_role_permission(
  p_role_slug text,
  p_permission_key text,
  p_enabled boolean,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_permission_id uuid;
begin
  if not private.is_super_admin() then
    raise exception 'Only Super Admin can change role templates';
  end if;
  if p_role_slug = 'super_admin' then
    raise exception 'Super Admin permissions are protected';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 then
    raise exception 'A meaningful reason is required';
  end if;

  select id into v_role_id from public.roles where slug = p_role_slug;
  select id into v_permission_id from public.permissions where key = p_permission_key;
  if v_role_id is null then raise exception 'Role not found'; end if;
  if v_permission_id is null then raise exception 'Permission not found'; end if;

  if p_enabled then
    insert into public.role_permissions(role_id, permission_id)
    values(v_role_id, v_permission_id)
    on conflict do nothing;
  else
    delete from public.role_permissions
    where role_id = v_role_id and permission_id = v_permission_id;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_values)
  values(
    (select auth.uid()), 'ROLE_PERMISSION_CHANGED', 'roles', v_role_id::text,
    jsonb_build_object(
      'role', p_role_slug,
      'permission', p_permission_key,
      'enabled', p_enabled,
      'reason', trim(p_reason)
    )
  );
end;
$$;

revoke all on function public.set_role_permission(text,text,boolean,text) from public, anon;
grant execute on function public.set_role_permission(text,text,boolean,text) to authenticated;

drop trigger if exists audit_profile_permission_overrides
  on public.profile_permission_overrides;
create trigger audit_profile_permission_overrides
after insert or update or delete on public.profile_permission_overrides
for each row execute function private.audit_trigger();

notify pgrst, 'reload schema';
