import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const headers = { 'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  const url = Deno.env.get('SUPABASE_URL'); const publishable = Deno.env.get('SUPABASE_ANON_KEY'); const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishable || !secret) return new Response(JSON.stringify({ error: 'Server configuration incomplete' }), { status: 503, headers });
  const auth = createClient(url, publishable, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: claims } = await auth.auth.getClaims();
  if (!claims?.claims?.sub) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  const { data: permissions } = await auth.rpc('current_permissions');
  if (!permissions?.includes('users.manage')) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
  const body = await request.json();
  if (request.method !== 'POST' || !body.email || !body.fullName || !body.roleId) return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers });
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(body.email, { data: { display_name: body.fullName } });
  if (error || !data.user) return new Response(JSON.stringify({ error: error?.message ?? 'Invite failed' }), { status: 400, headers });
  const { error: profileError } = await admin.from('profiles').insert({ id: data.user.id, email: body.email, full_name: body.fullName, role_id: body.roleId, department_id: body.departmentId ?? null });
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers }); }
  return new Response(JSON.stringify({ id: data.user.id }), { status: 201, headers });
});
