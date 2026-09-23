import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

type InviteBody = {
  action: 'invite'; email: string; fullName: string; roleId: string;
  departmentId?: string | null; phone?: string | null; employeeNo?: string | null;
  parentId?: string | null;
  isTestAccount?: boolean; deliveryMode?: 'email' | 'link';
};
type UpdateBody = {
  action: 'update'; userId: string; fullName: string; roleId: string;
  departmentId?: string | null; employmentStatus: 'active' | 'inactive' | 'suspended' | 'resigned';
  phone?: string | null; employeeNo?: string | null; parentId?: string | null; reason: string;
};
type ResendBody = { action: 'resend'; userId: string };

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
};
const reply = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return reply(request, 405, { error: 'Method not allowed' });
  const url = Deno.env.get('SUPABASE_URL'); const publishable = Deno.env.get('SUPABASE_ANON_KEY'); const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishable || !secret) return reply(request, 503, { error: 'Server configuration incomplete' });
  const auth = createClient(url, publishable, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: claims, error: claimError } = await auth.auth.getClaims();
  const actorId = claims?.claims?.sub as string | undefined;
  if (claimError || !actorId) return reply(request, 401, { error: 'Unauthorized' });
  const { data: actor } = await auth.from('profiles').select('id,is_active,employment_status,roles!inner(slug)').eq('id', actorId).single();
  const actorRole = (actor?.roles as unknown as { slug?: string } | null)?.slug;
  if (!actor?.is_active || actor.employment_status !== 'active' || actorRole !== 'super_admin') {
    return reply(request, 403, { error: 'Only Super Admin can manage staff users' });
  }
  let body: InviteBody | UpdateBody | ResendBody;
  try { body = await request.json(); } catch { return reply(request, 400, { error: 'Invalid JSON body' }); }
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  if (body.action === 'invite') {
    if (!body.email || !body.fullName || !body.roleId) return reply(request, 400, { error: 'Email, full name, and role are required' });
    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL');
    const normalizedEmail = body.email.trim().toLowerCase();
    const options = { data: { display_name: body.fullName.trim() }, ...(redirectTo ? { redirectTo } : {}) };
    const generated = body.deliveryMode === 'link'
      ? await admin.auth.admin.generateLink({ type: 'invite', email: normalizedEmail, options })
      : await admin.auth.admin.inviteUserByEmail(normalizedEmail, options);
    const data = generated.data;
    const error = generated.error;
    if (error || !data.user) return reply(request, 400, { error: error?.message ?? 'Invite failed' });
    const { error: profileError } = await auth.rpc('admin_create_profile', {
      p_user_id: data.user.id, p_email: body.email, p_full_name: body.fullName, p_role_id: body.roleId,
      p_department_id: body.departmentId ?? null, p_phone: body.phone ?? null,
      p_employee_no: body.employeeNo ?? null, p_parent_id: body.parentId ?? null,
      p_is_test_account: body.isTestAccount ?? false,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return reply(request, 400, { error: profileError.message });
    }
    const actionLink = body.deliveryMode === 'link' && 'properties' in data ? data.properties?.action_link : undefined;
    return reply(request, 201, { id: data.user.id, ...(actionLink ? { actionLink } : {}) });
  }

  if (body.action === 'resend') {
    const { data: invitation, error: invitationError } = await admin.from('staff_invitations').select('email,status').eq('user_id', body.userId).single();
    if (invitationError || !invitation) return reply(request, 404, { error: 'Invitation not found' });
    if (invitation.status === 'accepted') return reply(request, 409, { error: 'Invitation has already been accepted' });
    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL');
    const { error } = await admin.auth.resend({ type: 'signup', email: invitation.email, options: redirectTo ? { emailRedirectTo: redirectTo } : undefined });
    if (error) return reply(request, 400, { error: error.message });
    const now = new Date().toISOString();
    await admin.from('staff_invitations').update({ last_sent_at: now, updated_at: now }).eq('user_id', body.userId);
    await admin.from('audit_logs').insert({ actor_id: actorId, action: 'INVITATION_RESENT', entity_type: 'profiles', entity_id: body.userId, new_values: { reason: 'Super Admin requested invitation resend' } });
    return reply(request, 200, { id: body.userId });
  }

  if (body.action === 'update') {
    if (!body.userId || !body.fullName || !body.roleId || !body.employmentStatus || !body.reason) return reply(request, 400, { error: 'Incomplete profile update' });
    const { data: previousAuth, error: getUserError } = await admin.auth.admin.getUserById(body.userId);
    if (getUserError || !previousAuth.user) return reply(request, 404, { error: 'Auth user not found' });
    const shouldBan = body.employmentStatus !== 'active';
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(body.userId, { ban_duration: shouldBan ? '876000h' : 'none' });
    if (authUpdateError) return reply(request, 400, { error: authUpdateError.message });
    const { error: profileError } = await auth.rpc('admin_update_profile', {
      p_member_id: body.userId, p_full_name: body.fullName, p_role_id: body.roleId,
      p_department_id: body.departmentId ?? null, p_employment_status: body.employmentStatus,
      p_phone: body.phone ?? null, p_employee_no: body.employeeNo ?? null,
      p_parent_id: body.parentId ?? null, p_reason: body.reason,
    });
    if (profileError) {
      const wasBanned = Boolean(previousAuth.user.banned_until && new Date(previousAuth.user.banned_until) > new Date());
      await admin.auth.admin.updateUserById(body.userId, { ban_duration: wasBanned ? '876000h' : 'none' });
      return reply(request, 400, { error: profileError.message });
    }
    return reply(request, 200, { id: body.userId });
  }

  return reply(request, 400, { error: 'Unknown action' });
});
