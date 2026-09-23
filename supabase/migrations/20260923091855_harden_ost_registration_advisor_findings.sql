-- Resolve advisor findings for the OST workflow without granting client access.
-- Down: drop policy ost_submission_attempts_deny and the four indexes below.

create policy ost_submission_attempts_deny on public.ost_submission_attempts
for select to authenticated using (false);

create index ost_referral_codes_vice_director_idx
  on public.ost_referral_codes(vice_director_id);
create index ost_registrations_referral_code_idx
  on public.ost_registrations(referral_code_id);
create index ost_registrations_vice_director_idx
  on public.ost_registrations(vice_director_id);
create index ost_registrations_reviewed_by_idx
  on public.ost_registrations(reviewed_by) where reviewed_by is not null;
