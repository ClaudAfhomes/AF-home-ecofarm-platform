import { createClient } from '@supabase/supabase-js';

import { SUPER_ADMIN_ONLY } from '../../_lib/access.js';
import { findAuthUserId, isAuthConflict, verifyStaff } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import { getSupabaseEnv } from '../../_lib/env.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { listRoleRecords, listStaffEntries, MEMBER_SLUGS } from '../../_lib/rbac.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import { staffMemberSchema, staffPasswordSchema } from '@jad/contracts';

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** GET /admin/staff — directory. POST — create staff + auth account + audit. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaff(req, [...SUPER_ADMIN_ONLY]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });

  if (req.method === 'GET') {
    const entries = await listStaffEntries(supabase);
    okList(
      res,
      entries.filter((e) => staffMemberSchema.safeParse(e).success),
    );
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const roleId = typeof input.roleId === 'string' ? input.roleId : '';
  if (!name) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Name is required.', 400);
    res.status(status).json({ error });
    return;
  }
  if (!validEmail(email)) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'A valid email address is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const roles = await listRoleRecords(supabase);
  const role = roles.find((r) => r.id === roleId);
  if (!role) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Selected role does not exist.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  if (MEMBER_SLUGS.includes(roleId)) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Selected role is not a staff role.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const temporaryPassword =
    typeof input.temporaryPassword === 'string' ? input.temporaryPassword : '';
  if (!staffPasswordSchema.safeParse(temporaryPassword).success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'A temporary password of at least 8 characters is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const { data: dupeStaff } = await supabase
    .from('StaffUser')
    .select('id')
    .eq('email', email)
    .limit(1);
  if (Array.isArray(dupeStaff) && dupeStaff.length > 0) {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'A staff member with this email already exists.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  // Strict separation: a staff email must not collide with a member account.
  const { data: dupeMember } = await supabase
    .from('Member')
    .select('id')
    .eq('email', email)
    .limit(1);
  if (Array.isArray(dupeMember) && dupeMember.length > 0) {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'This email belongs to a member account and cannot be used for staff.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  const created = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (created.error && !isAuthConflict(created.error)) {
    const { error, status } = toErrorEnvelope('INTERNAL', created.error.message, 500);
    res.status(status).json({ error });
    return;
  }
  let authId = (created.data as { user?: { id: string } } | null)?.user?.id ?? null;
  // Duplicate identity (orphaned auth row): adopt the existing account AND
  // reset its password to the super-admin-provided temporary password — the
  // orphan's stored credential is unknown, so without this the new staff
  // could never sign in with the password they were given.
  if (!authId) {
    authId = await findAuthUserId(supabase, { email });
    if (authId) {
      const { error: resetError } = await supabase.auth.admin.updateUserById(authId, {
        password: temporaryPassword,
        email_confirm: true,
      });
      if (resetError) {
        const { error, status } = toErrorEnvelope('INTERNAL', resetError.message, 500);
        res.status(status).json({ error });
        return;
      }
    }
  }
  if (!authId) {
    const { error, status } = toErrorEnvelope(
      'AUTH_IDENTITY_UNRESOLVABLE',
      'An auth account already exists for this email but could not be matched. Reconcile the identity in Supabase Auth (or remove the stray account) and retry.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const { error: staffError } = await supabase.from('StaffUser').upsert(
    {
      id: authId,
      email,
      name,
      status: 'ACTIVE',
      mustChangePassword: true,
    },
    { onConflict: 'id' },
  );
  if (staffError) {
    const { error, status } = toErrorEnvelope('INTERNAL', staffError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const { data: roleUuidRows } = await supabase
    .from('Role')
    .select('id')
    .or(`key.eq.${roleId},slug.eq.${roleId}`)
    .limit(1);
  const roleUuid = ((roleUuidRows as { id: string }[] | null) ?? [])[0]?.id;
  if (!roleUuid) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Role record unresolvable', 500);
    res.status(status).json({ error });
    return;
  }
  const { error: linkError } = await supabase
    .from('StaffAssignment')
    .upsert({ staffUserId: authId, roleId: roleUuid }, { onConflict: '"staffUserId","roleId"' });
  if (linkError) {
    const { error, status } = toErrorEnvelope('INTERNAL', linkError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const entry = {
    id: authId,
    name,
    email,
    roleId,
    status: 'ACTIVE',
    createdAt: now,
    createdBy: 'System',
  };
  await appendAudit(supabase, {
    action: 'STAFF_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'super_admin',
    targetType: 'Staff',
    targetId: authId,
    targetName: name,
    detail: `Created staff account with role ${role.name}`,
  });
  const parsed = staffMemberSchema.safeParse(entry);
  res.status(201).json(parsed.success ? parsed.data : entry);
}
