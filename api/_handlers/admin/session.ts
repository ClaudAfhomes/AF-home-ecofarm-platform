import { queryStaffSlugs, verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import { appendAudit } from '../../_lib/audit.js';
import { listRoleRecords, pickStaffRoleId, staffRoleModules } from '../../_lib/rbac.js';
import {
  STAFF_ROLE_LABEL,
  staffSessionSchema,
  updateStaffProfileRequestSchema,
} from '@jad/contracts';

/**
 * GET /admin/session — own staff session (Phase 6 staff separation).
 * PATCH /admin/session — update own display name (My Account).
 * Any authenticated caller; resolves the StaffUser row + role slugs via
 * service_role so admin clients never read Role tables with the anon key.
 * 404 when the caller holds no staff identity (client treats as non-staff).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    methodNotAllowed(res, req.method);
    return;
  }
  const user = await verifyUser(req);
  if ('error' in user) {
    const { error, status } = user.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: staff, error } = await supabase
    .from('StaffUser')
    .select('id,email,name,status,mustChangePassword')
    .eq('id', user.userId)
    .maybeSingle();
  if (error || !staff) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'No staff profile', 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = staff as {
    id: string;
    email: string;
    name: string;
    status: string;
    mustChangePassword?: boolean;
  };
  // A disabled staff identity must not resolve a session — the shell would
  // otherwise load while every data call 403s. verifyStaff enforces the same.
  if (row.status === 'DISABLED') {
    const { error: env, status } = toErrorEnvelope('FORBIDDEN', 'Account disabled.', 403);
    res.status(status).json({ error: env });
    return;
  }

  if (req.method === 'PATCH') {
    const parsedBody = readJsonBody(req);
    if (!parsedBody.ok) {
      const { error: bodyError, status } = parsedBody.error;
      res.status(status).json({ error: bodyError });
      return;
    }
    const parsed = updateStaffProfileRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      const { error: env, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Enter a display name.',
        400,
        parsed.error.issues,
      );
      res.status(status).json({ error: env });
      return;
    }
    const { error: updateError } = await supabase
      .from('StaffUser')
      .update({ name: parsed.data.name })
      .eq('id', user.userId);
    if (updateError) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', updateError.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    row.name = parsed.data.name;
    // Keep the auth display cache in sync (the admin shell reads it for the
    // topbar). Best-effort: a metadata failure must not undo the StaffUser
    // write that the directory and session readers depend on.
    try {
      await supabase.auth.admin.updateUserById(user.userId, {
        user_metadata: { full_name: parsed.data.name },
      });
    } catch {
      // fall through — StaffUser already updated
    }
    await appendAudit(supabase, {
      action: 'STAFF_PROFILE_UPDATED',
      actorId: user.userId,
      actorRole: 'self',
      targetType: 'Staff',
      targetId: row.id,
      targetName: row.name,
      detail: `Updated display name to ${row.name}`,
    });
  }

  const slugs = await queryStaffSlugs(supabase, user.userId);
  // Resolve the caller's own role identity server-side so the admin shell
  // can render the topbar label and navigation from the session alone.
  // Non-super-admin staff cannot read the role catalog (`GET /admin/roles`
  // is super_admin-only), so without this the shell falls back to the raw
  // role id (custom roles) or the matrix seed (system roles). Record names
  // win; system ids fall back to the shared labels; effective modules come
  // from the stored set with the matrix fallback for seed-empty system
  // rows (via effectivePermissions / listRoleRecords).
  const sessionRoleId = pickStaffRoleId(slugs);
  let sessionRoleName: string | undefined;
  let sessionModules: string[] | undefined;
  if (sessionRoleId) {
    // Single source of role identity shared with verifyStaffModule:
    // record name wins and effective modules come from the stored set
    // (matrix fallback for seed-empty system rows). Never throws — a
    // failed lookup degrades to the shared labels/empty set and the
    // client's catalog fallback.
    const systemLabels = STAFF_ROLE_LABEL as Record<string, string>;
    try {
      const records = await listRoleRecords(supabase);
      const record = records.find((r) => r.id === sessionRoleId);
      sessionRoleName = record?.name ?? systemLabels[sessionRoleId] ?? sessionRoleId;
    } catch {
      sessionRoleName = systemLabels[sessionRoleId] ?? sessionRoleId;
    }
    try {
      sessionModules = await staffRoleModules(supabase, sessionRoleId);
    } catch {
      sessionModules = undefined;
    }
  }
  const parsed = staffSessionSchema.safeParse({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    slugs,
    mustChangePassword: row.mustChangePassword === true,
    ...(sessionRoleId
      ? { roleId: sessionRoleId, roleName: sessionRoleName, modules: sessionModules }
      : {}),
  });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored staff record failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
