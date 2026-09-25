-- Force every newly created staff account to replace its administrator-issued
-- temporary password before entering operational routes.
-- Validation: select must_change_password from public.profiles limit 1;
-- Down: alter table public.profiles drop column must_change_password;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True until the account holder verifies the temporary password and chooses a private password.';
