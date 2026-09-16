import { catalogPropertySchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { syncCatalogPropertyToCms } from '../../../_lib/catalog-cms-sync.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapPropertyRow } from '../../../_lib/pipeline.js';
import { validateUpdateProperty } from '../../../_lib/cutover.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * GET /admin/properties/:id (super_admin, admin).
 * PATCH / DELETE (super_admin, admin). Sales snapshot property data as text,
 * so deletes are unrestricted; every mutation is audited.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Property id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Property')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Property not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;

  if (req.method === 'GET') {
    const parsed = catalogPropertySchema.safeParse(mapPropertyRow(current));
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        'Stored property failed validation',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsed.data);
    return;
  }

  if (req.method === 'DELETE') {
    // Presentation rows may exist without sales, but a property referenced by
    // a Sale is part of financial history (BI-006 snapshot) - keep it.
    const { count } = await supabase
      .from('Sale')
      .select('id', { count: 'exact', head: true })
      .eq('propertyId', id);
    if ((count ?? 0) > 0) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'Cannot delete a property that is referenced by sales. Set it to INACTIVE instead.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const { error } = await supabase.from('Property').delete().eq('id', id);
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    await appendAudit(supabase, {
      action: 'PROPERTY_DELETED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'admin',
      targetType: 'Property',
      targetId: id,
      targetName: String(current.name ?? id),
      detail: `Deleted property ${String(current.name ?? id)}`,
    });
    // Unlink the CMS listing so it no longer points at a deleted catalog row.
    await syncCatalogPropertyToCms(
      supabase,
      {
        id,
        name: String(current.name ?? id),
        categorySlug: String(current.categorySlug ?? ''),
      },
      auth.userId,
      { clearCatalogLink: true },
    );
    res.status(200).json({ id, deleted: true });
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = validateUpdateProperty(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid property update.', 400);
    res.status(status).json({ error });
    return;
  }
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.categoryId !== undefined) patch.categorySlug = parsed.data.categoryId;
  if (parsed.data.price !== undefined) patch.price = parsed.data.price;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (Object.keys(patch).length === 0) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  if (patch.categorySlug !== undefined) {
    const { data: category } = await supabase
      .from('PropertyCategory')
      .select('slug')
      .eq('slug', patch.categorySlug)
      .maybeSingle();
    if (!category) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Unknown category.', 400);
      res.status(status).json({ error });
      return;
    }
  }
  const { data: updated, error: updateError } = await supabase
    .from('Property')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      updateError?.message ?? 'Update failed',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'PROPERTY_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Property',
    targetId: id,
    targetName: String((updated as Record<string, unknown>).name ?? id),
    detail: `Updated property ${id}`,
  });
  // Keep the linked CMS listing consistent (name/price/category).
  const updatedRow = updated as Record<string, unknown>;
  await syncCatalogPropertyToCms(
    supabase,
    {
      id,
      name: String(updatedRow.name ?? ''),
      categorySlug: String(updatedRow.categorySlug ?? ''),
      price: (updatedRow.price as string | null | undefined) ?? null,
      status: String(updatedRow.status ?? 'ACTIVE'),
    },
    auth.userId,
  );
  const validated = catalogPropertySchema.safeParse(
    mapPropertyRow(updated as Record<string, unknown>),
  );
  if (!validated.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored property failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(validated.data);
}
