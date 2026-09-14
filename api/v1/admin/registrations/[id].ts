import { registrationSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapRegistrationRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/** GET /admin/registrations/:id — single application. */
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
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Registration id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase.from('Registration').select('*').eq('id', id).maybeSingle();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'Registration not found', 404);
    res.status(status).json({ error: env });
    return;
  }
  const parsed = registrationSchema.safeParse(mapRegistrationRow(data as Record<string, unknown>));
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Stored registration failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
