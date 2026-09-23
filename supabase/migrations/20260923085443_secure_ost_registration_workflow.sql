-- Secure public OST application intake and controlled post-verification provisioning.
-- Down: drop ost_registration_documents, ost_registrations, ost_referral_codes,
-- ost_submission_attempts, approve_ost_registration, and the ost-registration-documents bucket.

create type public.ost_registration_status as enum (
  'pending_verification','needs_correction','verified','rejected',
  'invited','active','suspended'
);

create table public.ost_referral_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  sales_manager_id uuid not null references public.profiles(id) on delete restrict,
  vice_director_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check(status in ('active','inactive')),
  expires_at timestamptz not null,
  max_uses integer not null default 25 check(max_uses between 1 and 500),
  use_count integer not null default 0 check(use_count >= 0),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create table public.ost_registrations (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.ost_referral_codes(id) on delete restrict,
  sales_manager_id uuid not null references public.profiles(id) on delete restrict,
  vice_director_id uuid not null references public.profiles(id) on delete restrict,
  email text not null,
  email_hash text not null,
  mobile text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date not null,
  sex text check(sex in ('female','male','prefer_not_to_say')),
  address_line text not null,
  barangay text not null,
  city text not null,
  province text not null,
  postal_code text not null,
  id_type text not null,
  id_number_hash text not null,
  id_number_last4 text not null,
  id_issue_date date,
  id_expiration_date date,
  consented_at timestamptz not null,
  certified_at timestamptz not null,
  status public.ost_registration_status not null default 'pending_verification',
  review_reason text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  auth_user_id uuid unique,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email_hash),
  unique(id_number_hash)
);

create table public.ost_registration_documents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.ost_registrations(id) on delete restrict,
  side text not null check(side in ('front','back')),
  storage_path text not null unique,
  sha256 text not null,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint not null check(size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  unique(registration_id,side)
);

create table public.ost_submission_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index ost_referral_codes_manager_idx on public.ost_referral_codes(sales_manager_id,created_at desc);
create index ost_registrations_manager_status_idx on public.ost_registrations(sales_manager_id,status,submitted_at desc);
create index ost_submission_attempts_ip_idx on public.ost_submission_attempts(ip_hash,created_at desc);

alter table public.ost_referral_codes enable row level security;
alter table public.ost_registrations enable row level security;
alter table public.ost_registration_documents enable row level security;
alter table public.ost_submission_attempts enable row level security;

create policy ost_codes_read on public.ost_referral_codes for select to authenticated using (
  sales_manager_id=(select auth.uid()) or private.has_permission('users.manage')
);
create policy ost_registrations_read on public.ost_registrations for select to authenticated using (
  sales_manager_id=(select auth.uid()) or private.has_permission('users.manage')
);
create policy ost_documents_read on public.ost_registration_documents for select to authenticated using (
  exists(select 1 from public.ost_registrations a where a.id=registration_id and
    (a.sales_manager_id=(select auth.uid()) or private.has_permission('users.manage')))
);

revoke all on public.ost_referral_codes,public.ost_registrations,
  public.ost_registration_documents,public.ost_submission_attempts from public,anon;
grant select on public.ost_referral_codes,public.ost_registrations,
  public.ost_registration_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ost-registration-documents','ost-registration-documents',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy ost_registration_documents_storage_read on storage.objects for select to authenticated using (
  bucket_id='ost-registration-documents' and exists(
    select 1 from public.ost_registration_documents d
    join public.ost_registrations a on a.id=d.registration_id
    where d.storage_path=name and
      (a.sales_manager_id=(select auth.uid()) or private.has_permission('users.manage'))
  )
);

create or replace function public.approve_ost_registration(
  p_registration_id uuid,p_auth_user_id uuid,p_reviewer_id uuid
) returns public.ost_registrations
language plpgsql security definer set search_path='' as $$
declare v_app public.ost_registrations; v_role uuid; v_profile public.profiles; v_manager public.profiles;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'Server-only operation';
  end if;
  select * into v_app from public.ost_registrations where id=p_registration_id for update;
  if v_app.id is null or v_app.status not in ('pending_verification','needs_correction') then
    raise exception 'Application is not eligible for approval';
  end if;
  if not exists(select 1 from auth.users where id=p_auth_user_id and lower(email)=lower(v_app.email)) then
    raise exception 'Auth invitation does not match application';
  end if;
  if exists(select 1 from public.profiles where id=p_auth_user_id or lower(email)=lower(v_app.email)) then
    raise exception 'An active member profile already exists';
  end if;
  select p.* into v_manager from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=v_app.sales_manager_id and r.slug='sales_manager' and p.is_active
    and p.employment_status='active' and p.vice_director_id=v_app.vice_director_id;
  if v_manager.id is null or v_manager.referral_depth is null then
    raise exception 'The assigned Sales Manager placement is no longer valid';
  end if;
  if not exists(
    select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=v_app.vice_director_id and r.slug='vice_director'
      and p.is_active and p.employment_status='active'
  ) then raise exception 'The assigned Vice Director is no longer valid'; end if;
  select id into v_role from public.roles where slug='ost';
  insert into public.profiles(
    id,email,full_name,phone,role_id,employment_status,genealogy_parent_id,
    vice_director_id,referral_depth,is_active
  ) values(
    p_auth_user_id,lower(v_app.email),trim(concat_ws(' ',v_app.first_name,v_app.middle_name,v_app.last_name)),
    v_app.mobile,v_role,'active',v_app.sales_manager_id,v_app.vice_director_id,
    v_manager.referral_depth+1,true
  ) returning * into v_profile;
  insert into public.staff_invitations(user_id,email,invited_by)
  values(p_auth_user_id,lower(v_app.email),p_reviewer_id);
  update public.ost_registrations set status='invited',auth_user_id=p_auth_user_id,
    reviewed_by=p_reviewer_id,reviewed_at=now(),updated_at=now() where id=v_app.id
  returning * into v_app;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(p_reviewer_id,'OST_REGISTRATION_APPROVED','ost_registrations',v_app.id::text,
    jsonb_build_object('auth_user_id',p_auth_user_id,'sales_manager_id',v_app.sales_manager_id,
      'vice_director_id',v_app.vice_director_id,'referral_code_id',v_app.referral_code_id));
  return v_app;
end;
$$;
revoke all on function public.approve_ost_registration(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_ost_registration(uuid,uuid,uuid) to service_role;

create or replace function private.sync_ost_registration_activation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.ost_registrations set status='active',updated_at=now()
    where auth_user_id=new.id and status='invited';
  end if;
  return new;
end;
$$;
create trigger sync_ost_registration_activation after update of email_confirmed_at on auth.users
for each row execute function private.sync_ost_registration_activation();

do $$ declare t text; begin foreach t in array array[
  'ost_referral_codes','ost_registrations','ost_registration_documents'
] loop execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_trigger()',t,t); end loop; end $$;

notify pgrst,'reload schema';
