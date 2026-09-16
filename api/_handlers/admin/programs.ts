import { programAdminSchema, programCreateSchema } from '@jad/contracts';

import { verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { prefixedId } from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';

/**
 * GET + POST /admin/programs - super_admin program management (FR-PRG-001).
 * The public `GET /programs` only returns active programs; this list includes
 * inactive ones so staff can reactivate them.
 */
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
  const auth = await verifyStaffModule(req, 'programs', ['super_admin']);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('Program')
      .select('id, code, name, description, isActive')
      .order('id');
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const rows = ((data as unknown[]) ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description ?? undefined,
        isActive: r.isActive ?? true,
      };
    });
    okList(
      res,
      rows.filter((row) => programAdminSchema.safeParse(row).success),
    );
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = programCreateSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter a program code and name.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const row = {
    id: prefixedId('prg'),
    code: parsed.data.code.trim().toUpperCase(),
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    isActive: parsed.data.isActive ?? true,
  };
  const { data, error } = await supabase.from('Program').insert(row).select().single();
  if (error || !data) {
    const conflict = /duplicate key|unique constraint/i.test(error?.message ?? '');
    const { error: env, status } = toErrorEnvelope(
      conflict ? 'CONFLICT' : 'INTERNAL',
      conflict
        ? 'A program with that code already exists.'
        : (error?.message ?? 'Failed to save program'),
      conflict ? 409 : 500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const created = data as {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
  };
  const mapped = {
    id: created.id,
    code: created.code,
    name: created.name,
    description: created.description ?? undefined,
    isActive: created.isActive ?? true,
  };
  const validated = programAdminSchema.safeParse(mapped);
  if (!validated.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored program record failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'PROGRAM_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'super_admin',
    targetType: 'Program',
    targetId: validated.data.id,
    targetName: validated.data.name,
    detail: `Created program ${validated.data.name} (${validated.data.code})`,
  });
  res.status(201).json(validated.data);
}
