import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidPropertyRow, mapPropertyRow, prefixedId } from '../../_lib/pipeline.js';
import { validateCreateProperty } from '../../_lib/cutover.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/properties - transactional catalog list (super_admin, admin). */
export async function listProperties(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Property')
    .select('*')
    .order('id', { ascending: true });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapPropertyRow);
  okList(res, rows.filter(isValidPropertyRow));
}

/** POST /admin/properties - create a listing (super_admin, admin). */
export async function createProperty(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
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
  const parsed = validateCreateProperty(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter a name, category, and valid price/status.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: category } = await supabase
    .from('PropertyCategory')
    .select('slug')
    .eq('slug', parsed.data.categoryId)
    .maybeSingle();
  if (!category) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Unknown category.', 400);
    res.status(status).json({ error });
    return;
  }
  const property = {
    id: prefixedId('prop'),
    name: parsed.data.name,
    categorySlug: parsed.data.categoryId,
    price: parsed.data.price ?? null,
    status: parsed.data.status,
  };
  const { error } = await supabase.from('Property').insert(property);
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'PROPERTY_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Property',
    targetId: property.id,
    targetName: property.name,
    detail: `Created property ${property.name}`,
  });
  res.status(201).json(mapPropertyRow(property as Record<string, unknown>));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listProperties(req, res);
  if (req.method === 'POST') return createProperty(req, res);
  methodNotAllowed(res, req.method);
}
