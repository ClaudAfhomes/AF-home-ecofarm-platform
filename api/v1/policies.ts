import { policyCreateSchema, policySchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../_lib/access.js';
import { verifyStaffModule } from '../_lib/auth.js';
import { appendAudit } from '../_lib/audit.js';
import { toErrorEnvelope } from '../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { prefixedId } from '../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../_lib/rest.js';

/** GET /policies — public list (API-SPECIFICATION #69). */
async function listPolicies(req: VercelRequest, res: VercelResponse) {
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Policy')
    .select('id, type, title, content, document_url, updated_at')
    .order('id');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    documentUrl: row.document_url ?? row.documentUrl,
    updatedAt: row.updated_at ?? row.updatedAt,
  }));
  okList(
    res,
    rows.filter((row) => policySchema.safeParse(row).success),
  );
}

/** POST /policies — admin policy create (FR-ADM-004). The PDF is required. */
async function createPolicy(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'policies', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = policyCreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter a title, type, and uploaded PDF.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const row = {
    id: prefixedId('pol'),
    title: parsed.data.title,
    type: parsed.data.type,
    content: parsed.data.content?.trim() ? parsed.data.content.trim() : null,
    document_url: parsed.data.documentUrl,
  };
  const { data, error } = await supabase.from('Policy').insert(row).select().single();
  if (error || !data) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      error?.message ?? 'Failed to save policy',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const created = data as {
    id: string;
    type: string;
    title: string;
    content: unknown;
    document_url: string;
    updated_at: string;
  };
  const mapped = {
    id: created.id,
    type: created.type,
    title: created.title,
    content: created.content,
    documentUrl: created.document_url,
    updatedAt: created.updated_at,
  };
  const validated = policySchema.safeParse(mapped);
  if (!validated.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored policy record failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'POLICY_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Policy',
    targetId: validated.data.id,
    targetName: validated.data.title,
    detail: `Created policy ${validated.data.title}`,
  });
  res.status(201).json(validated.data);
}

/** GET + POST /policies — public list, admin create. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listPolicies(req, res);
  if (req.method === 'POST') return createPolicy(req, res);
  methodNotAllowed(res, req.method);
}
