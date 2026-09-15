import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { appendAudit } from '../../../../_lib/audit.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import { signGovernmentIdUrl } from '../../../../_lib/documents.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/**
 * GET /admin/registrations/:id/government-id — short-lived viewer URL for
 * the applicant's ID document (super_admin, admin). The bucket is private;
 * this endpoint mints the signed URL server-side and audits every access
 * (PII). Rows captured before file upload return 404 with a clear message.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'registrations', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Registration id is required',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Registration')
    .select('id,firstName,lastName,governmentId')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Registration not found', 404);
    res.status(status).json({ error });
    return;
  }
  const row = found as {
    id: string;
    firstName?: string;
    lastName?: string;
    governmentId?: { storagePath?: unknown } | null;
  };
  const storagePath =
    typeof row.governmentId?.storagePath === 'string' ? row.governmentId.storagePath : '';
  if (!storagePath) {
    const { error, status } = toErrorEnvelope(
      'NOT_FOUND',
      'No file on record for this application — only metadata was captured.',
      404,
    );
    res.status(status).json({ error });
    return;
  }
  const signed = await signGovernmentIdUrl(supabase, storagePath);
  if (!signed.ok) {
    const { error, status } = toErrorEnvelope('INTERNAL', signed.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'GOVERNMENT_ID_VIEWED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Registration',
    targetId: id,
    targetName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || id,
    detail: `Viewed government ID for application ${id}`,
  });
  res.status(200).json({ url: signed.url });
}
