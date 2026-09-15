import { createClient } from '@supabase/supabase-js';

import { verifyUser } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import { getSupabaseEnv } from '../../../_lib/env.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import { changeStaffPasswordRequestSchema } from '@jad/contracts';

/**
 * POST /admin/session/password — the signed-in staff member changes their
 * own password (My Account, forced first-login change).
 * Verifies the current password via a fresh anon sign-in (Supabase does not
 * require it by default), applies the new one with the admin API, clears the
 * temporary-password flag, and audits. Reachable while `mustChangePassword`
 * is set because it gates on `verifyUser`, not `verifyStaff`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const user = await verifyUser(req);
  if ('error' in user) {
    const { error, status } = user.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = changeStaffPasswordRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter the current and a new password.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !anonKey || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: staff, error: staffError } = await supabase
    .from('StaffUser')
    .select('id,email,name')
    .eq('id', user.userId)
    .maybeSingle();
  if (staffError || !staff) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'No staff profile', 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = staff as { id: string; email: string; name: string };
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false } });
  const { error: reauthError } = await anon.auth.signInWithPassword({
    email: row.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    const { error: env, status } = toErrorEnvelope(
      'UNAUTHORIZED',
      'Current password is incorrect.',
      401,
    );
    res.status(status).json({ error: env });
    return;
  }
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.userId, {
    password: parsed.data.newPassword,
  });
  if (updateError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', updateError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const { error: flagError } = await supabase
    .from('StaffUser')
    .update({ mustChangePassword: false })
    .eq('id', user.userId);
  if (flagError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', flagError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'STAFF_PASSWORD_CHANGED',
    actorId: user.userId,
    actorRole: 'self',
    targetType: 'Staff',
    targetId: row.id,
    targetName: row.name,
    detail: `Changed password for ${row.email}`,
  });
  res.status(200).json({ changed: true });
}
