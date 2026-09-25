-- current_permissions only reads rows already visible to the signed-in user.
-- Keep privileged execution limited to mutation RPCs with server-side role guards.
-- Down: alter function public.current_permissions() security definer;

alter function public.current_permissions() security invoker;
