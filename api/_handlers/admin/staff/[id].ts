import { createClient } from '@supabase/supabase-js';

import { SUPER_ADMIN_ONLY } from '../../../_lib/access.js';
import { verifyStaff } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import { getSupabaseEnv } from '../../../_lib/env.js';
import { isLastGovernor } from '../../../_lib/governance.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { listRoleRecords, listStaffEntries } from '../../../_lib/rbac.js';
import { methodNotAllowed, readJsonBody } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import { staffMemberSchema } from '@jad/contracts';

/** GET / PATCH / DELETE /admin/staff/:id (super_admin only, guards enforced). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaff(req, [...SUPER_ADMIN_ONLY]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Staff member not found', 404);
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
  const entries = await listStaffEntries(supabase);
  const target = entries.find((e) => e.id === id);
  if (!target) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Staff member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const roles = await listRoleRecords(supabase);
  const govMembers = entries.map((e) => ({ id: e.id, status: e.status, roleId: e.roleId }));
  const govRoles = roles.map((r) => ({ id: r.id, permissions: [...r.permissions] }));

  if (req.method === 'GET') {
    const parsed = staffMemberSchema.safeParse(target);
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope('INTERNAL', 'Stored staff record failed validation', 500);
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsed.data);
    return;
  }

  if (req.method === 'DELETE') {
    if (auth.userId === id) {
      const { error, status } = toErrorEnvelope('CONFLICT', 'You cannot delete your own staff account.', 409);
      res.status(status).json({ error });
      return;
    }
    if (isLastGovernor(govMembers, govRoles, { id: target.id, status: target.status, roleId: target.roleId })) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        `${target.name} is the last active administrator. Grant the Staff module to another role with an active member first.`,
        409,
      );
      res.status(status).json({ error });
      return;
    }
    // Safe hard delete (Phase 1 staff domain): StaffUser owns no financial
    // history, so unlike the old Member-row delete this cannot trip ledger
    // RESTRICTs. Assignments cascade; audit keeps its text snapshot.
    const { error: assignmentError } = await supabase.from('StaffAssignment').delete().eq('staffUserId', id);
    if (assignmentError) {
      const { error, status } = toErrorEnvelope('INTERNAL', assignmentError.message, 500);
      res.status(status).json({ error });
      return;
    }
    const { error: staffError } = await supabase.from('StaffUser').delete().eq('id', id);
    if (staffError) {
      const { error, status } = toErrorEnvelope('INTERNAL', staffError.message, 500);
      res.status(status).json({ error });
      return;
    }
    try {
      await supabase.auth.admin.deleteUser(id);
    } catch {
      // Auth cleanup is best-effort; the roster rows are already gone.
    }
    await appendAudit(supabase, {
      action: 'STAFF_DELETED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'super_admin',
      targetType: 'Staff',
      targetId: target.id,
      targetName: target.name,
      detail: `Deleted staff account ${target.name} (${target.email})`,
    });
    res.status(200).json({ id, deleted: true });
    return;
  }

  // PATCH — { roleId?, status? } with self + governance guards.
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = ((parsedBody.body ?? {}) as Record<string, unknown>);
  const isSelf = auth.userId === id;
  let applied = false;
  if (input.roleId !== undefined) {
    if (typeof input.roleId !== 'string' || !input.roleId) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'A valid roleId is required.', 400);
      res.status(status).json({ error });
      return;
    }
    if (!roles.some((r) => r.id === input.roleId)) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Selected role does not exist.', 400);
      res.status(status).json({ error });
      return;
    }
    if (isSelf) {
      const { error, status } = toErrorEnvelope('CONFLICT', 'You cannot change your own role.', 409);
      res.status(status).json({ error });
      return;
    }
    if (isLastGovernor(govMembers, govRoles, { id: target.id, status: target.status, roleId: target.roleId })) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        `${target.name} is the last active administrator. Grant the Staff module to another role with an active member first.`,
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const { data: newRole } = await supabase.from('Role').select('id').or(`key.eq.${input.roleId},slug.eq.${input.roleId}`).limit(1);
    const newUuid = ((newRole as { id: string }[] | null) ?? [])[0]?.id;
    if (!newUuid) {
      const { error, status } = toErrorEnvelope('INTERNAL', 'Role record unresolvable', 500);
      res.status(status).json({ error });
      return;
    }
    // Exactly one staff assignment: replace, never merge (one staff role per user).
    const { error: clearError } = await supabase.from('StaffAssignment').delete().eq('staffUserId', id);
    if (clearError) {
      const { error, status } = toErrorEnvelope('INTERNAL', clearError.message, 500);
      res.status(status).json({ error });
      return;
    }
    const { error: linkError } = await supabase
      .from('StaffAssignment')
      .upsert({ staffUserId: id, roleId: newUuid }, { onConflict: '"staffUserId","roleId"' });
    if (linkError) {
      const { error, status } = toErrorEnvelope('INTERNAL', linkError.message, 500);
      res.status(status).json({ error });
      return;
    }
    await appendAudit(supabase, {
      action: 'STAFF_ROLE_ASSIGNED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'super_admin',
      targetType: 'Staff',
      targetId: target.id,
      targetName: target.name,
      detail: `Changed role from ${target.roleId} to ${input.roleId}`,
    });
    applied = true;
  }
  if (input.status !== undefined) {
    if (input.status !== 'ACTIVE' && input.status !== 'DISABLED') {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Status must be ACTIVE or DISABLED.', 400);
      res.status(status).json({ error });
      return;
    }
    if (isSelf) {
      const { error, status } = toErrorEnvelope('CONFLICT', 'You cannot change your own status.', 409);
      res.status(status).json({ error });
      return;
    }
    if (
      input.status === 'DISABLED' &&
      isLastGovernor(govMembers, govRoles, { id: target.id, status: target.status, roleId: target.roleId })
    ) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        `${target.name} is the last active administrator. Grant the Staff module to another role with an active member first.`,
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const { error: statusError } = await supabase
      .from('StaffUser')
      .update({ status: input.status })
      .eq('id', id);
    if (statusError) {
      const { error, status } = toErrorEnvelope('INTERNAL', statusError.message, 500);
      res.status(status).json({ error });
      return;
    }
    await appendAudit(supabase, {
      action: input.status === 'ACTIVE' ? 'STAFF_ENABLED' : 'STAFF_DISABLED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'super_admin',
      targetType: 'Staff',
      targetId: target.id,
      targetName: target.name,
      detail: input.status === 'ACTIVE' ? 'Re-enabled staff access' : 'Disabled staff access',
    });
    applied = true;
  }
  if (!applied) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  const refreshed = (await listStaffEntries(supabase)).find((e) => e.id === id);
  if (!refreshed) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Staff member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const parsed = staffMemberSchema.safeParse(refreshed);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored staff record failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
