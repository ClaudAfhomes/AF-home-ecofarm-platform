import { cmsPropertyCategorySchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { appendAudit } from '../../_lib/audit.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidMergedCategory, mergeCategory } from '../../_lib/cutover.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

type Service = NonNullable<ReturnType<typeof requireService>>;

type CmsPropertiesContent = {
  categories?: Record<string, unknown>[];
  [key: string]: unknown;
};

/**
 * Category endpoints own the merge of the transactional key
 * (`PropertyCategory`: slug + title) and the CMS presentation
 * (`cms_contents.properties.categories`). Reads join all three sources
 * (key, presentation, listing count); writes update both stores so the
 * admin UI keeps its single-endpoint contract.
 */
async function readCmsCategories(
  supabase: Service,
): Promise<{ row: Record<string, unknown>; categories: Record<string, unknown>[] } | null> {
  const { data, error } = await supabase
    .from('cms_contents')
    .select('key,content,version')
    .eq('key', 'properties')
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const content = (row.content ?? {}) as CmsPropertiesContent;
  const categories = Array.isArray(content.categories) ? content.categories : [];
  return { row, categories };
}

async function writeCmsCategories(
  supabase: Service,
  row: Record<string, unknown>,
  categories: Record<string, unknown>[],
  actorId: string,
): Promise<string | null> {
  const content = { ...((row.content ?? {}) as Record<string, unknown>), categories };
  const version = typeof row.version === 'number' ? row.version + 1 : 1;
  const { error } = await supabase
    .from('cms_contents')
    .upsert({ key: 'properties', content, version, updated_by: actorId }, { onConflict: 'key' });
  return error ? error.message : null;
}

/** GET /admin/property-categories — merged key + presentation + counts. */
export async function listCategories(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'properties', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const [{ data: dbCategories }, { data: properties }, cms] = await Promise.all([
    supabase.from('PropertyCategory').select('slug,title').order('slug', { ascending: true }),
    supabase.from('Property').select('categorySlug'),
    readCmsCategories(supabase),
  ]);
  const counts = new Map<string, number>();
  for (const p of (properties as { categorySlug?: unknown }[] | null) ?? []) {
    if (typeof p.categorySlug === 'string')
      counts.set(p.categorySlug, (counts.get(p.categorySlug) ?? 0) + 1);
  }
  const presentation = new Map<string, Record<string, unknown>>();
  for (const c of cms?.categories ?? []) {
    if (typeof c.slug === 'string') presentation.set(c.slug, c);
  }
  const rows = ((dbCategories as { slug: string; title: string }[] | null) ?? []).map((cat) =>
    mergeCategory(cat.slug, cat.title, presentation.get(cat.slug), counts.get(cat.slug) ?? 0),
  );
  res.status(200).json({
    data: rows.filter(isValidMergedCategory),
    meta: { page: 1, pageSize: rows.length, total: rows.length },
  });
}

/** POST /admin/property-categories — create key + presentation. */
export async function createCategory(req: VercelRequest, res: VercelResponse) {
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
  const parsed = cmsPropertyCategorySchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter a slug, title, descriptions, and image.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: existing } = await supabase
    .from('PropertyCategory')
    .select('slug')
    .eq('slug', parsed.data.slug)
    .maybeSingle();
  if (existing) {
    const { error, status } = toErrorEnvelope('CONFLICT', 'Category slug already exists.', 409);
    res.status(status).json({ error });
    return;
  }
  const cms = await readCmsCategories(supabase);
  if (!cms) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Catalog CMS content unavailable.', 500);
    res.status(status).json({ error });
    return;
  }
  const { error: insertError } = await supabase
    .from('PropertyCategory')
    .insert({ slug: parsed.data.slug, title: parsed.data.title });
  if (insertError) {
    const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const presentation = {
    title: parsed.data.title,
    shortDescription: parsed.data.shortDescription,
    description: parsed.data.description,
    image: parsed.data.image,
    isFeatured: parsed.data.isFeatured ?? false,
  };
  const writeError = await writeCmsCategories(
    supabase,
    cms.row,
    [...cms.categories, { slug: parsed.data.slug, ...presentation }],
    auth.userId,
  );
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'CATEGORY_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'PropertyCategory',
    targetId: parsed.data.slug,
    targetName: parsed.data.title,
    detail: `Created category ${parsed.data.title}`,
  });
  res.status(201).json(mergeCategory(parsed.data.slug, parsed.data.title, presentation, 0));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listCategories(req, res);
  if (req.method === 'POST') return createCategory(req, res);
  methodNotAllowed(res, req.method);
}
