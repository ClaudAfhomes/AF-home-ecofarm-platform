import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

type CreateBody = {
  action: 'create'; email: string; fullName: string; roleId: string; temporaryPassword: string;
  departmentId?: string | null; phone?: string | null; employeeNo?: string | null;
  parentId?: string | null;
  isTestAccount?: boolean; permissionKeys?: string[];
};
type UpdateBody = {
  action: 'update'; userId: string; fullName: string; roleId: string;
  departmentId?: string | null; employmentStatus: 'active' | 'inactive' | 'suspended' | 'resigned';
  phone?: string | null; employeeNo?: string | null; parentId?: string | null; reason: string;
};
type ResendBody = { action: 'resend'; userId: string };
type ChangePasswordBody = { action: 'change-password'; currentPassword: string; newPassword: string };
type DeleteBody = { action: 'delete'; userId: string; reason: string };

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
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const auth = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = token
    ? await admin.auth.getUser(token)
    : { data: { user: null }, error: new Error('Missing bearer token') };
  const actorId = identity.user?.id;
  if (identityError || !actorId) {
    console.warn(JSON.stringify({ event: 'admin_users_denied', code: 'INVALID_JWT' }));
    return reply(request, 401, { code: 'INVALID_JWT', error: 'Your session is invalid or expired. Please sign in again.' });
  }
  const { data: actor, error: actorError } = await admin.from('profiles').select('id,role_id,is_active,employment_status,roles!inner(slug)').eq('id', actorId).single();
  const actorRole = (actor?.roles as unknown as { slug?: string } | null)?.slug;
  const { data: effectivePermissions } = await auth.rpc('current_permissions');
  const auditFailure = async (code: string, message: string, email?: string) => {
    console.warn(JSON.stringify({ event: 'admin_users_failed', actorId, code }));
    const { error } = await admin.from('audit_logs').insert({
      actor_id: actorId,
      action: 'STAFF_INVITE_FAILED',
      entity_type: 'profiles',
      entity_id: email ?? null,
      new_values: { code, message },
    });
    if (error) console.error(JSON.stringify({ event: 'admin_users_audit_failed', actorId, code: error.code }));
  };
  let body: CreateBody | UpdateBody | ResendBody | ChangePasswordBody | DeleteBody;
  try { body = await request.json(); } catch {
    await auditFailure('INVALID_JSON', 'Invalid JSON body');
    return reply(request, 400, { code: 'INVALID_JSON', error: 'Invalid request body.' });
  }

  const canManageUsers = Array.isArray(effectivePermissions)
    && (effectivePermissions.includes('users.create') || effectivePermissions.includes('users.manage'));
  if (body.action !== 'change-password' && (actorError || !actor?.is_active || actor.employment_status !== 'active' || !['super_admin', 'admin'].includes(actorRole ?? '') || !canManageUsers)) {
    await auditFailure('FORBIDDEN', 'Caller does not have effective account creation permission');
    return reply(request, 403, { code: 'FORBIDDEN', error: 'You do not have permission to manage staff users.' });
  }

  if (body.action === 'change-password') {
    if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string' || body.newPassword.length < 10) {
      return reply(request, 400, { code: 'INVALID_PASSWORD', error: 'Enter the temporary password and a new password of at least 10 characters.' });
    }
    if (body.currentPassword === body.newPassword) return reply(request, 400, { code: 'PASSWORD_REUSED', error: 'Your new password must differ from the temporary password.' });
    const { data: target, error: targetError } = await admin.from('profiles').select('email,must_change_password').eq('id', actorId).single();
    if (targetError || !target?.must_change_password) return reply(request, 409, { code: 'ACTIVATION_NOT_REQUIRED', error: 'This account does not require activation.' });
    const { error: reauthError } = await auth.auth.signInWithPassword({ email: target.email, password: body.currentPassword });
    if (reauthError) {
      await auditFailure('TEMPORARY_PASSWORD_INVALID', 'Temporary password verification failed');
      return reply(request, 401, { code: 'TEMPORARY_PASSWORD_INVALID', error: 'The temporary password is incorrect.' });
    }
    const { error: passwordError } = await admin.auth.admin.updateUserById(actorId, { password: body.newPassword });
    if (passwordError) return reply(request, 500, { code: 'PASSWORD_CHANGE_FAILED', error: 'The new password could not be saved.' });
    const { error: flagError } = await admin.from('profiles').update({ must_change_password: false }).eq('id', actorId);
    if (flagError) return reply(request, 500, { code: 'ACTIVATION_FLAG_FAILED', error: 'Password changed, but account activation needs administrator attention.' });
    await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ACCOUNT_ACTIVATED', entity_type: 'profiles', entity_id: actorId, new_values: { temporary_password_replaced: true } });
    return reply(request, 200, { id: actorId });
  }

  if (body.action === 'create') {
    const normalizedEmail = body.email?.trim().toLowerCase() ?? '';
    const rejectInvite = async (status: number, code: string, message: string) => {
      await auditFailure(code, message, normalizedEmail || undefined);
      return reply(request, status, { code, error: message });
    };
    if (!normalizedEmail || !body.fullName?.trim() || !body.roleId || !body.temporaryPassword) return rejectInvite(400, 'REQUIRED_FIELDS', 'Email, full name, role, and temporary password are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return rejectInvite(400, 'INVALID_EMAIL', 'Enter a valid email address.');
    if (body.fullName.trim().length < 2) return rejectInvite(400, 'INVALID_NAME', 'Full name must contain at least two characters.');
    if (body.temporaryPassword.length < 10) return rejectInvite(400, 'INVALID_PASSWORD', 'Temporary password must contain at least 10 characters.');
    const { data: existingProfile, error: duplicateCheckError } = await admin.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle();
    if (duplicateCheckError) return rejectInvite(500, 'DUPLICATE_CHECK_FAILED', 'The email could not be validated. Please try again.');
    if (existingProfile) return rejectInvite(409, 'EMAIL_EXISTS', 'A staff profile already exists for this email address.');
    const { data: invitedRole, error: roleError } = await admin.from('roles').select('id,slug,is_system').eq('id', body.roleId).single();
    if (roleError || !invitedRole?.is_system) return rejectInvite(400, 'INVALID_ROLE', 'Select a valid staff role.');
    if (actorRole === 'admin' && invitedRole.slug === 'super_admin') return rejectInvite(403, 'ROLE_NOT_ALLOWED', 'Admins cannot invite Super Admin users.');
    if (body.departmentId) {
      const { data: department } = await admin.from('departments').select('id').eq('id', body.departmentId).eq('is_active', true).maybeSingle();
      if (!department) return rejectInvite(400, 'INVALID_DEPARTMENT', 'Select an active department.');
    }
    const allowedParentRoles: Record<string, string[]> = {
      senior_sales_manager: ['vice_director'],
      sales_manager: ['vice_director', 'senior_sales_manager'],
      ost: ['sales_manager'],
    };
    const permittedParents = allowedParentRoles[invitedRole.slug];
    if (invitedRole.slug === 'vice_director' && body.parentId) return rejectInvite(400, 'INVALID_PLACEMENT', 'A Vice Director must be a genealogy root.');
    if (!permittedParents && body.parentId) return rejectInvite(400, 'INVALID_PLACEMENT', 'This role cannot have a genealogy parent.');
    if (permittedParents) {
      if (!body.parentId) return rejectInvite(400, 'INVALID_PLACEMENT', 'Select an immediate referral parent.');
      const { data: parent } = await admin.from('profiles').select('id,is_active,employment_status,roles!inner(slug)').eq('id', body.parentId).single();
      const parentRole = (parent?.roles as unknown as { slug?: string } | null)?.slug;
      if (!parent?.is_active || parent.employment_status !== 'active' || !parentRole || !permittedParents.includes(parentRole)) {
        return rejectInvite(400, 'INVALID_PLACEMENT', 'Select an active genealogy parent permitted for this role.');
      }
    }
    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL');
    if (!redirectTo) return rejectInvite(503, 'INVITE_REDIRECT_MISSING', 'Invitation delivery is not configured.');
    const options = { data: { display_name: body.fullName.trim() }, ...(redirectTo ? { redirectTo } : {}) };
    const generated = await admin.auth.admin.inviteUserByEmail(normalizedEmail, options);
    const data = generated.data;
    const error = generated.error;
    if (error || !data.user) {
      const duplicate = error?.message.toLowerCase().includes('already') || error?.status === 422;
      return rejectInvite(duplicate ? 409 : 400, duplicate ? 'EMAIL_EXISTS' : 'INVITE_DELIVERY_FAILED', duplicate ? 'An Auth user already exists for this email address.' : (error?.message ?? 'Invitation delivery failed.'));
    }
    const { error: passwordError } = await admin.auth.admin.updateUserById(data.user.id, { password: body.temporaryPassword });
    if (passwordError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return rejectInvite(500, 'TEMPORARY_PASSWORD_FAILED', 'The temporary password could not be assigned. No account was created.');
    }
    const { error: profileError } = await auth.rpc('admin_create_profile', {
      p_user_id: data.user.id, p_email: normalizedEmail, p_full_name: body.fullName, p_role_id: body.roleId,
      p_department_id: body.departmentId ?? null, p_phone: body.phone ?? null,
      p_employee_no: body.employeeNo ?? null, p_parent_id: body.parentId ?? null,
      p_is_test_account: body.isTestAccount ?? false,
    });
    if (profileError) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(data.user.id);
      if (rollbackError) return rejectInvite(500, 'INVITE_ROLLBACK_FAILED', 'The profile could not be created and the invitation rollback needs administrator attention.');
      return rejectInvite(400, 'PROFILE_CREATE_FAILED', profileError.message);
    }
    const { error: activationFlagError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', data.user.id);
    if (activationFlagError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return rejectInvite(500, 'ACTIVATION_SETUP_FAILED', 'Account activation could not be secured. No account was created.');
    }
    if (body.permissionKeys !== undefined) {
      if (actorRole !== 'super_admin') {
        await admin.auth.admin.deleteUser(data.user.id);
        return rejectInvite(403, 'PERMISSION_ASSIGNMENT_FORBIDDEN', 'Only Super Admin can restrict account modules during creation.');
      }
      const requested = [...new Set(body.permissionKeys)];
      const { data: grants, error: grantsError } = await admin.from('role_permissions').select('permission_id,permissions!inner(key)').eq('role_id', body.roleId);
      if (grantsError) { await admin.auth.admin.deleteUser(data.user.id); return rejectInvite(500, 'PERMISSION_LOAD_FAILED', 'Role permissions could not be validated.'); }
      const inherited = new Map((grants ?? []).map((grant) => [(grant.permissions as unknown as { key: string }).key, grant.permission_id]));
      if (requested.some((key) => !inherited.has(key))) { await admin.auth.admin.deleteUser(data.user.id); return rejectInvite(400, 'PERMISSION_ESCALATION', 'Account access cannot exceed the selected role template.'); }
      const denied = [...inherited.entries()].filter(([key]) => !requested.includes(key)).map(([, permissionId]) => ({ profile_id: data.user.id, permission_id: permissionId, effect: 'deny', reason: 'Restricted during account creation', changed_by: actorId }));
      if (denied.length) {
        const { error: restrictionError } = await admin.from('profile_permission_overrides').insert(denied);
        if (restrictionError) { await admin.auth.admin.deleteUser(data.user.id); return rejectInvite(500, 'PERMISSION_SAVE_FAILED', 'Account restrictions could not be saved. No account was created.'); }
      }
    }
    await admin.from('audit_logs').insert({ actor_id: actorId, action: 'STAFF_ACCOUNT_CREATED', entity_type: 'profiles', entity_id: data.user.id, new_values: { email: normalizedEmail, role_id: body.roleId, activation_email_sent: true } });
    console.log(JSON.stringify({ event: 'admin_users_create_succeeded', actorId, userId: data.user.id }));
    return reply(request, 201, { id: data.user.id });
  }

  if (body.action === 'delete') {
    if (actorRole !== 'super_admin') return reply(request, 403, { code: 'DELETE_FORBIDDEN', error: 'Only Super Admin can delete test accounts.' });
    if (!body.userId || body.userId === actorId) return reply(request, 400, { code: 'INVALID_DELETE_TARGET', error: 'You cannot delete your own account.' });
    if (body.reason?.trim().length < 8) return reply(request, 400, { code: 'DELETE_REASON_REQUIRED', error: 'Enter a deletion reason with at least 8 characters.' });
    const { data: target, error: targetError } = await admin.from('profiles').select('id,email,full_name,is_test_account,roles!inner(slug)').eq('id', body.userId).single();
    const targetRole = (target?.roles as unknown as { slug?: string } | null)?.slug;
    if (targetError || !target) return reply(request, 404, { code: 'ACCOUNT_NOT_FOUND', error: 'Account not found.' });
    if (!target.is_test_account) return reply(request, 409, { code: 'NOT_TEST_ACCOUNT', error: 'Only accounts marked as test accounts can be permanently deleted.' });
    if (targetRole === 'super_admin') return reply(request, 403, { code: 'PROTECTED_ACCOUNT', error: 'Super Admin accounts cannot be deleted.' });
    const { error: deleteError } = await admin.auth.admin.deleteUser(body.userId);
    if (deleteError) {
      await auditFailure('TEST_ACCOUNT_DELETE_FAILED', deleteError.message, target.email);
      return reply(request, 409, { code: 'ACCOUNT_HAS_HISTORY', error: 'This test account has protected operational history and cannot be deleted. Deactivate it instead.' });
    }
    await admin.from('audit_logs').insert({ actor_id: actorId, action: 'TEST_ACCOUNT_DELETED', entity_type: 'profiles', entity_id: body.userId, new_values: { email: target.email, name: target.full_name, reason: body.reason.trim() } });
    console.log(JSON.stringify({ event: 'admin_users_test_account_deleted', actorId, userId: body.userId }));
    return reply(request, 200, { id: body.userId });
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
