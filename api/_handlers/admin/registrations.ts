import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { mapRegistrationRow } from '../../_lib/pipeline.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import { registrationSchema } from '@jad/contracts';

/** GET /admin/registrations — application queue, newest first. */
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
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Registration')
    .select('*')
    .order('submittedAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapRegistrationRow);
  // Never silently lose queue rows: a row that fails validation is dropped
  // from the list while the dashboard count still includes it. Log the id +
  // failing field paths (never values — PII) so the next mismatch is
  // diagnosable from server logs alone. The envelope reports `meta.invalid`
  // (`meta` is passthrough for `requestList`, so old clients ignore it) so
  // the queue page can banner hidden rows instead of claiming "Queue is
  // clear" while the dashboard card shows pending work.
  const valid: unknown[] = [];
  let invalid = 0;
  for (const row of rows) {
    const parsed = registrationSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
      continue;
    }
    invalid += 1;
    console.warn(
      '[registrations] dropping invalid row',
      String(row.id ?? '?'),
      `status=${String(row.status ?? '?')}`,
      parsed.error.issues.map((issue) => issue.path.join('.')).join(','),
    );
  }
  res.status(200).json({
    data: valid,
    meta: { page: 1, pageSize: valid.length, total: valid.length, invalid },
  });
}
