import { policySchema, policyUpdateSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';

const updateSchema = policyUpdateSchema;

/** PUT + DELETE /policies/:id - admin policy edit/delete (FR-ADM-004). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'policies', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Policy id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  if (req.method === 'DELETE') {
    const { data, error } = await supabase.from('Policy').delete().eq('id', id).select().single();
    if (error) {
      const notFound = /no rows|not found/i.test(error.message);
      const { error: env, status } = toErrorEnvelope(
        notFound ? 'NOT_FOUND' : 'INTERNAL',
        notFound ? `Policy not found: ${id}` : error.message,
        notFound ? 404 : 500,
      );
      res.status(status).json({ error: env });
      return;
    }
    if (!data) {
      const { error: env, status } = toErrorEnvelope('NOT_FOUND', `Policy not found: ${id}`, 404);
      res.status(status).json({ error: env });
      return;
    }
    const row = data as { id: string; title: string };
    await appendAudit(supabase, {
      action: 'POLICY_DELETED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'admin',
      targetType: 'Policy',
      targetId: row.id,
      targetName: row.title,
      detail: `Deleted policy ${row.title}`,
    });
    res.status(200).json({ id: row.id, deleted: true });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = updateSchema.safeParse(parsedBody.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.success
        ? 'Nothing to update'
        : (parsed.error.issues[0]?.message ?? 'Validation failed'),
      400,
      parsed.success ? undefined : parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
  if (parsed.data.type !== undefined) patch.type = parsed.data.type;
  if (parsed.data.content !== undefined) patch.content = parsed.data.content;
  if (parsed.data.documentUrl !== undefined) patch.document_url = parsed.data.documentUrl;
  const { data, error } = await supabase
    .from('Policy')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    const conflict = /duplicate key|unique constraint/i.test(error.message);
    const { error: env, status } = toErrorEnvelope(
      conflict ? 'CONFLICT' : 'INTERNAL',
      conflict ? 'That URL slug is already in use. Choose another.' : error.message,
      conflict ? 409 : 500,
    );
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', `Policy not found: ${id}`, 404);
    res.status(status).json({ error: env });
    return;
  }
  const row = data as {
    id: string;
    slug: string;
    type: string;
    title: string;
    content: unknown;
    document_url?: string;
    documentUrl?: string;
    updated_at?: string;
    updatedAt?: string;
  };
  await appendAudit(supabase, {
    action: 'POLICY_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Policy',
    targetId: row.id,
    targetName: row.title,
    detail: `Updated policy ${row.title}`,
  });
  res.status(200).json({
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    content: row.content,
    documentUrl: row.document_url ?? row.documentUrl,
    updatedAt: row.updated_at ?? row.updatedAt,
  });
}
