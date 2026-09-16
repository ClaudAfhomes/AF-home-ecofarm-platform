import { programAdminSchema, programUpdateSchema } from '@jad/contracts';

import { verifyStaffModule } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';

/**
 * PATCH /admin/programs/:id - super_admin program update/retire (FR-PRG-001).
 * Retire via `isActive: false`; programs are never hard-deleted (existing
 * registrations/members keep their reference).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PATCH') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'programs', ['super_admin']);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Program id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = programUpdateSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.success
        ? 'Nothing to update'
        : (parsed.error.issues[0]?.message ?? 'Validation failed'),
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const patch: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) patch.code = parsed.data.code.trim().toUpperCase();
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description.trim() || null;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  const { data, error } = await supabase
    .from('Program')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    const conflict = /duplicate key|unique constraint/i.test(error.message);
    const notFound = /no rows|not found/i.test(error.message);
    const { error: env, status } = toErrorEnvelope(
      conflict ? 'CONFLICT' : notFound ? 'NOT_FOUND' : 'INTERNAL',
      conflict
        ? 'A program with that code already exists.'
        : notFound
          ? `Program not found: ${id}`
          : error.message,
      conflict ? 409 : notFound ? 404 : 500,
    );
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', `Program not found: ${id}`, 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = data as {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
  };
  const mapped = {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.isActive ?? true,
  };
  await appendAudit(supabase, {
    action: 'PROGRAM_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'super_admin',
    targetType: 'Program',
    targetId: row.id,
    targetName: row.name,
    detail:
      parsed.data.isActive !== undefined
        ? `${parsed.data.isActive ? 'Activated' : 'Deactivated'} program ${row.name}`
        : `Updated program ${row.name}`,
  });
  res.status(200).json(mapped);
}
