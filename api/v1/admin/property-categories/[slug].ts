import { cmsPropertyCategorySchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mergeCategory } from '../../../_lib/cutover.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

type Service = NonNullable<ReturnType<typeof requireService>>;

async function readCmsCategories(supabase: Service) {
  const { data, error } = await supabase
    .from('cms_contents')
    .select('key,content,version')
    .eq('key', 'properties')
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const content = (row.content ?? {}) as { categories?: Record<string, unknown>[] };
  return { row, categories: Array.isArray(content.categories) ? content.categories : [] };
}

/**
 * PATCH / DELETE /admin/property-categories/:slug (super_admin, admin).
 * PATCH updates the title key and/or the CMS presentation. DELETE is blocked
 * while listings reference the category (409), mirroring the admin mock.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawSlug = req.query.slug ?? req.query.id;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Category slug is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('PropertyCategory')
    .select('slug,title')
    .eq('slug', slug)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Category not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as { slug: string; title: string };
  const cms = await readCmsCategories(supabase);
  if (!cms) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Catalog CMS content unavailable.', 500);
    res.status(status).json({ error });
    return;
  }

  if (req.method === 'DELETE') {
    const { count } = await supabase
      .from('Property')
      .select('id', { count: 'exact', head: true })
      .eq('categorySlug', slug);
    if ((count ?? 0) > 0) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'Cannot delete category with existing listings.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const { error } = await supabase.from('PropertyCategory').delete().eq('slug', slug);
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const content = { ...((cms.row.content ?? {}) as Record<string, unknown>) };
    const version = typeof cms.row.version === 'number' ? cms.row.version + 1 : 1;
    const { error: cmsError } = await supabase.from('cms_contents').upsert(
      {
        key: 'properties',
        content: { ...content, categories: cms.categories.filter((c) => c.slug !== slug) },
        version,
        updated_by: auth.userId,
      },
      { onConflict: 'key' },
    );
    if (cmsError) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', cmsError.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    await appendAudit(supabase, {
      action: 'CATEGORY_DELETED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'admin',
      targetType: 'PropertyCategory',
      targetId: slug,
      targetName: current.title,
      detail: `Deleted category ${current.title}`,
    });
    res.status(200).json({ id: slug, deleted: true });
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = cmsPropertyCategorySchema
    .omit({ slug: true })
    .partial()
    .safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid category update.', 400);
    res.status(status).json({ error });
    return;
  }
  if (Object.values(parsed.data).every((value) => value === undefined)) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  let title = current.title;
  if (parsed.data.title !== undefined) {
    const { error } = await supabase
      .from('PropertyCategory')
      .update({ title: parsed.data.title })
      .eq('slug', slug);
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    title = parsed.data.title;
  }
  const existing = cms.categories.find((c) => c.slug === slug) ?? { slug };
  const next = { ...existing };
  for (const field of [
    'title',
    'shortDescription',
    'description',
    'image',
    'isFeatured',
  ] as const) {
    if (parsed.data[field] !== undefined)
      (next as Record<string, unknown>)[field] = parsed.data[field];
  }
  // Title stays in sync on both stores.
  next.title = title;
  const content = { ...((cms.row.content ?? {}) as Record<string, unknown>) };
  const version = typeof cms.row.version === 'number' ? cms.row.version + 1 : 1;
  const { error: cmsError } = await supabase.from('cms_contents').upsert(
    {
      key: 'properties',
      content: {
        ...content,
        categories: [...cms.categories.filter((c) => c.slug !== slug), next],
      },
      version,
      updated_by: auth.userId,
    },
    { onConflict: 'key' },
  );
  if (cmsError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', cmsError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'CATEGORY_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'PropertyCategory',
    targetId: slug,
    targetName: title,
    detail: `Updated category ${title}`,
  });
  const { count } = await supabase
    .from('Property')
    .select('id', { count: 'exact', head: true })
    .eq('categorySlug', slug);
  res.status(200).json(mergeCategory(slug, title, next, count ?? 0));
}
