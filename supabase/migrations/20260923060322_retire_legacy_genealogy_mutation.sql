-- The audited admin_update_profile RPC now owns all genealogy corrections.
-- Down: grant execute on public.reparent_genealogy_member(uuid,uuid,text) to authenticated.

revoke execute on function public.reparent_genealogy_member(uuid,uuid,text) from authenticated;
