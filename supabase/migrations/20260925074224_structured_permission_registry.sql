-- Structured allow-only permission registry. Role templates grant actions with
-- a maximum data scope; per-account overrides may only deny inherited actions.
-- System roles remain protected from rename/delete. Only Super Admin may edit
-- templates, create custom roles, or restrict an account.
-- Down: drop the RPCs below, permission columns, role_permissions.data_scope,
-- and restore the prior profile_permission_overrides effect constraint.

alter table public.permissions add column if not exists group_key text;
alter table public.permissions add column if not exists module_key text;
alter table public.permissions add column if not exists action_key text;
alter table public.permissions add column if not exists description text;
alter table public.permissions add column if not exists scope_kind text not null default 'none'
  check (scope_kind in ('none','own','branch','department','global'));
alter table public.role_permissions add column if not exists data_scope text not null default 'own'
  check (data_scope in ('own','branch','department','global'));

insert into public.permissions(key,name,module,group_key,module_key,action_key,description,scope_kind)
values
('analytics.view_own','View own analytics','dashboard_analytics','dashboard','analytics','view_own','View analytics for records owned by the account.','own'),
('analytics.view_branch','View branch analytics','dashboard_analytics','dashboard','analytics','view_branch','View analytics inside the resolved genealogy branch.','branch'),
('analytics.view_global','View global analytics','dashboard_analytics','dashboard','analytics','view_global','View organization-wide analytics.','global'),
('analytics.export','Export analytics','dashboard_analytics','dashboard','analytics','export','Export authorized analytics only.','global'),
('users.view','View users and members','users_members','organization','users','view','View accounts within the authorized scope.','global'),
('users.create','Create accounts','users_members','organization','users','create','Create controlled staff or member accounts.','global'),
('users.edit','Edit accounts','users_members','organization','users','edit','Edit authorized account details.','global'),
('users.deactivate','Deactivate accounts','users_members','organization','users','deactivate','Suspend or deactivate an authorized account.','global'),
('users.reset_access','Reset account access','users_members','organization','users','reset_access','Resend setup or reset account access.','global'),
('roles.view','View roles','roles_permissions','organization','roles','view','View role templates and effective access.','global'),
('roles.create','Create custom role','roles_permissions','organization','roles','create','Create a non-system role template.','global'),
('roles.edit','Edit custom role','roles_permissions','organization','roles','edit','Edit a non-system role template.','global'),
('roles.assign','Assign roles','roles_permissions','organization','roles','assign','Assign an allowed role to an account.','global'),
('roles.manage_templates','Manage role templates','roles_permissions','organization','roles','manage_templates','Change action grants and scopes.','global'),
('departments.view','View departments','departments_hr','organization','departments','view','View department records.','department'),
('departments.manage','Create or edit departments','departments_hr','organization','departments','manage','Create and edit departments.','global'),
('hr.manage_employees','Manage employees','departments_hr','organization','hr','manage_employees','Manage employee records.','department'),
('hr.export','Export HR records','departments_hr','organization','hr','export','Export authorized HR records.','department'),
('customers.view','View customers','customer_forms','sales','customer_forms','view','View customer records in scope.','branch'),
('customer_forms.create','Create customer form','customer_forms','sales','customer_forms','create','Create a customer form.','branch'),
('customer_forms.scan','Scan QR or barcode','customer_forms','sales','customer_forms','scan','Read machine-readable ID data for review.','branch'),
('customer_forms.ocr','OCR or upload ID','customer_forms','sales','customer_forms','ocr','Process a staff-selected ID image.','branch'),
('customer_forms.edit_draft','Edit customer draft','customer_forms','sales','customer_forms','edit_draft','Edit an unconfirmed customer form.','branch'),
('customer_forms.export','Export customer form','customer_forms','sales','customer_forms','export','Export an authorized customer form.','branch'),
('customer_documents.view_private','View private ID documents','customer_forms','sales','customer_forms','view_private_documents','Open private customer documents with a signed URL.','branch'),
('sales.create','Create card sale','card_sales','sales','sales','create','Create a card sale.','branch'),
('sales.edit_own_draft','Edit own sale draft','card_sales','sales','sales','edit_own_draft','Edit a sale draft created by the account.','own'),
('sales.issue','Issue card sale','card_sales','sales','sales','issue','Issue an authorized card sale record.','branch'),
('sales.view_branch','View branch sales','card_sales','sales','sales','view_branch','View sales inside the resolved branch.','branch'),
('sales.reverse_draft','Cancel or reverse draft','card_sales','sales','sales','reverse_draft','Cancel or reverse an eligible draft.','branch'),
('payments.view','View payments','payments_activation','finance','payments','view','View payment records.','global'),
('payments.record','Record payment','payments_activation','finance','payments','record','Record a customer payment.','global'),
('payments.verify','Verify payment','payments_activation','finance','payments','verify','Verify or reject a payment.','global'),
('membership.activate','Activate card','payments_activation','finance','membership','activate','Activate a fully paid membership.','global'),
('payments.correct','Reverse or correct payment','payments_activation','finance','payments','correct','Perform an audited payment correction.','global'),
('finance_reports.export','Export finance reports','payments_activation','finance','payments','export','Export authorized finance reports.','global'),
('genealogy.view_own','View own genealogy','genealogy','network','genealogy','view_own','View own placement and downstream.','own'),
('genealogy.view_branch','View branch genealogy','genealogy','network','genealogy','view_branch','View the resolved branch.','branch'),
('genealogy.view_global','View global genealogy','genealogy','network','genealogy','view_global','View all genealogy branches.','global'),
('genealogy.request_correction','Request placement correction','genealogy','network','genealogy','request_correction','Request an audited placement correction.','own'),
('genealogy.approve_correction','Approve placement correction','genealogy','network','genealogy','approve_correction','Approve an eligible placement correction.','global'),
('ost.generate_referral','Generate OST referral','ost_commissions','network','ost','generate_referral','Generate a referral QR or code.','own'),
('ost.review','Review OST applications','ost_commissions','network','ost','review','Review applications in scope.','branch'),
('ost.approve','Approve OST','ost_commissions','network','ost','approve','Approve an eligible OST application.','branch'),
('commissions.view_own','View own commissions','ost_commissions','network','commissions','view_own','View own commission status.','own'),
('commissions.view_branch','View branch commissions','ost_commissions','network','commissions','view_branch','View commission status in branch.','branch'),
('commissions.qualify','Qualify commission','ost_commissions','network','commissions','qualify','Approve final commission qualification.','global'),
('commissions.mark_paid','Mark commission paid','ost_commissions','network','commissions','mark_paid','Record an authorized payout.','global'),
('pos.catalog_view','View service catalog','redemption_pos','operations','pos','catalog_view','View approved redeemable services.','global'),
('pos.redeem','Redeem customer points','redemption_pos','operations','pos','redeem','Deduct points for an approved service.','own'),
('pos.history_own','View own POS history','redemption_pos','operations','pos','history_own','View transactions processed by the employee.','own'),
('pos.reverse','Reverse redemption','redemption_pos','operations','pos','reverse','Perform an authorized audited reversal.','global'),
('qr.generate','Generate QR','qr','operations','qr','generate','Generate an approved opaque QR token.','own'),
('qr.scan_validate','Scan and validate QR','qr','operations','qr','scan_validate','Validate an opaque QR token.','own'),
('qr.revoke','Revoke QR','qr','operations','qr','revoke','Revoke an eligible QR token.','global'),
('qr.audit_view','View QR audit events','qr','operations','qr','audit_view','View QR activity in scope.','global'),
('cms.view','View CMS','cms','governance','cms','view','View CMS records.','global'),
('cms.edit_draft','Create or edit CMS draft','cms','governance','cms','edit_draft','Create and edit unpublished content.','global'),
('cms.publish','Publish or unpublish','cms','governance','cms','publish','Publish or withdraw content.','global'),
('cms.manage_media','Manage media and settings','cms','governance','cms','manage_media','Manage CMS assets and configuration.','global'),
('reports.customer_forms','Export customer forms','reports_export','governance','reports','customer_forms','Export authorized customer forms.','branch'),
('reports.sales','Export sales reports','reports_export','governance','reports','sales','Export authorized sales data.','branch'),
('reports.finance','Export finance reports','reports_export','governance','reports','finance','Export finance data.','global'),
('reports.hr','Export HR reports','reports_export','governance','reports','hr','Export HR data.','department'),
('reports.commissions','Export commission reports','reports_export','governance','reports','commissions','Export commission data.','global'),
('audit.view_scoped','View scoped audit log','audit_settings','governance','audit','view_scoped','View audit activity in authorized scope.','branch'),
('audit.view_global','View global audit log','audit_settings','governance','audit','view_global','View all audit activity.','global'),
('settings.manage','Manage business settings','audit_settings','governance','settings','manage','Manage approved business configuration.','global')
on conflict (key) do update set
  name=excluded.name,module=excluded.module,group_key=excluded.group_key,module_key=excluded.module_key,
  action_key=excluded.action_key,description=excluded.description,scope_kind=excluded.scope_kind;

update public.permissions set
  group_key=coalesce(group_key,split_part(module,'_',1)),
  module_key=coalesce(module_key,module),
  action_key=coalesce(action_key,split_part(key,'.',2)),
  description=coalesce(description,name)
where group_key is null or module_key is null or action_key is null or description is null;

delete from public.profile_permission_overrides where effect='allow';
alter table public.profile_permission_overrides drop constraint if exists profile_permission_overrides_effect_check;
alter table public.profile_permission_overrides add constraint profile_permission_overrides_effect_check check (effect='deny');

create or replace function public.current_permissions() returns text[] language sql stable security definer set search_path='' as $$
  with actor as (
    select p.id,p.role_id,r.slug from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=(select auth.uid()) and p.is_active and p.employment_status='active'
  ), candidates as (
    select pm.id,pm.key from actor a join public.role_permissions rp on rp.role_id=a.role_id join public.permissions pm on pm.id=rp.permission_id
    union
    select pm.id,pm.key from actor a cross join public.permissions pm
    where a.slug='super_admin' and pm.key not in ('pos.redeem','pos.history_own')
  )
  select coalesce(array_agg(c.key order by c.key),'{}'::text[]) from candidates c
  where not exists(select 1 from public.profile_permission_overrides o where o.profile_id=(select id from actor) and o.permission_id=c.id and o.effect='deny');
$$;
revoke all on function public.current_permissions() from public,anon;
grant execute on function public.current_permissions() to authenticated;

create or replace function public.create_custom_role(p_name text,p_description text default null) returns public.roles
language plpgsql security definer set search_path='' as $$
declare v_role public.roles; v_slug text;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can create roles'; end if;
  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Role name is required'; end if;
  v_slug:=trim(both '_' from regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','_','g'));
  if v_slug='' or exists(select 1 from public.roles where slug=v_slug) then v_slug:=v_slug||'_'||substr(gen_random_uuid()::text,1,8); end if;
  insert into public.roles(slug,name,description,is_system,is_protected) values(v_slug,trim(p_name),nullif(trim(p_description),''),false,false) returning * into v_role;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values) values((select auth.uid()),'CUSTOM_ROLE_CREATED','roles',v_role.id::text,jsonb_build_object('name',v_role.name,'slug',v_role.slug));
  return v_role;
end; $$;
revoke all on function public.create_custom_role(text,text) from public,anon;
grant execute on function public.create_custom_role(text,text) to authenticated;

create or replace function public.configure_role_permission(p_role_id uuid,p_permission_key text,p_enabled boolean,p_scope text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_permission uuid; v_role public.roles;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can manage role templates'; end if;
  if length(trim(coalesce(p_reason,'')))<8 then raise exception 'A meaningful reason is required'; end if;
  select * into v_role from public.roles where id=p_role_id for update;
  if v_role.id is null then raise exception 'Role not found'; end if;
  if v_role.slug='super_admin' then raise exception 'Super Admin access is governed by the protected system policy'; end if;
  select id into v_permission from public.permissions where key=p_permission_key;
  if v_permission is null then raise exception 'Permission not found'; end if;
  if p_scope not in ('own','branch','department','global') then raise exception 'Invalid data scope'; end if;
  if p_enabled then insert into public.role_permissions(role_id,permission_id,data_scope) values(p_role_id,v_permission,p_scope)
    on conflict(role_id,permission_id) do update set data_scope=excluded.data_scope;
  else delete from public.role_permissions where role_id=p_role_id and permission_id=v_permission; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values) values((select auth.uid()),'ROLE_PERMISSION_CHANGED','roles',p_role_id::text,jsonb_build_object('permission',p_permission_key,'enabled',p_enabled,'scope',p_scope,'reason',trim(p_reason)));
end; $$;
revoke all on function public.configure_role_permission(uuid,text,boolean,text,text) from public,anon;
grant execute on function public.configure_role_permission(uuid,text,boolean,text,text) to authenticated;

create or replace function public.restrict_member_permission(p_profile_id uuid,p_permission_key text,p_restricted boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_permission uuid; v_role text;
begin
  if not private.is_super_admin() then raise exception 'Only Super Admin can restrict member access'; end if;
  if p_profile_id=(select auth.uid()) then raise exception 'Self permission changes are not allowed'; end if;
  if length(trim(coalesce(p_reason,'')))<8 then raise exception 'A meaningful reason is required'; end if;
  select r.slug into v_role from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_profile_id;
  if v_role is null then raise exception 'Profile not found'; end if;
  if v_role='super_admin' then raise exception 'Super Admin access is protected'; end if;
  select pm.id into v_permission from public.permissions pm join public.role_permissions rp on rp.permission_id=pm.id join public.profiles p on p.role_id=rp.role_id where p.id=p_profile_id and pm.key=p_permission_key;
  if v_permission is null then raise exception 'Permission is not granted by the role template'; end if;
  if p_restricted then insert into public.profile_permission_overrides(profile_id,permission_id,effect,reason,changed_by) values(p_profile_id,v_permission,'deny',trim(p_reason),(select auth.uid())) on conflict(profile_id,permission_id) do update set effect='deny',reason=excluded.reason,changed_by=excluded.changed_by,updated_at=now();
  else delete from public.profile_permission_overrides where profile_id=p_profile_id and permission_id=v_permission; end if;
end; $$;
revoke all on function public.restrict_member_permission(uuid,text,boolean,text) from public,anon;
grant execute on function public.restrict_member_permission(uuid,text,boolean,text) to authenticated;
