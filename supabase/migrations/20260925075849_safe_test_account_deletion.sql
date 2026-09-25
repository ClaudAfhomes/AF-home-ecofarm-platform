-- Auth deletion must atomically clean up the account's pending setup record.
-- Other profile references remain RESTRICT, so accounts with operational,
-- financial, genealogy, document, or audit dependencies cannot be deleted.
-- Down: restore staff_invitations_user_id_fkey with ON DELETE RESTRICT.

alter table public.staff_invitations
  drop constraint if exists staff_invitations_user_id_fkey;
alter table public.staff_invitations
  add constraint staff_invitations_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
