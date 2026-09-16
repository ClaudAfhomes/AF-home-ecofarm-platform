import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { setCors } from '../../_lib/cors.js';
import { getSupabaseEnv } from '../../_lib/env.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { serviceClient } from '../../_lib/rest.js';

import {
  aboutContentSchema,
  contactContentSchema,
  faqContentSchema,
  globalContentSchema,
  homepageContentSchema,
  loginContentSchema,
  propertiesContentSchema,
  registerContentSchema,
} from '@jad/contracts';

// Allowed CMS keys per Q2 + Q5 (single table, updatedAt/By only)
const CMS_KEYS = [
  'homepage',
  'about',
  'properties',
  'faqs',
  'contact',
  'global',
  'login',
  'register',
] as const;
type CmsKey = (typeof CMS_KEYS)[number];

const SCHEMA_BY_KEY: Record<CmsKey, import('zod').ZodTypeAny> = {
  homepage: homepageContentSchema,
  about: aboutContentSchema,
  properties: propertiesContentSchema,
  faqs: faqContentSchema,
  contact: contactContentSchema,
  global: globalContentSchema,
  login: loginContentSchema,
  register: registerContentSchema,
};

// --- Image cleanup helpers (Feature 1) ---
function extractCmsPhotoIds(content: unknown, out = new Set<string>()): Set<string> {
  if (!content || typeof content !== 'object') return out;
  if (Array.isArray(content)) {
    for (const item of content) extractCmsPhotoIds(item, out);
    return out;
  }
  const obj = content as Record<string, unknown>;
  if (
    typeof obj.id === 'string' &&
    typeof obj.alt === 'string' &&
    obj.id.length >= 1 &&
    obj.alt.length >= 1
  ) {
    // Heuristic: CmsPhoto is {id, alt} - Property/Category have id but no alt, CtaLink has label/to, so id+alt is distinctive
    // Ensure we don't collect non-photo objects that happen to have id+alt (none in CMS schemas)
    out.add(obj.id);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') extractCmsPhotoIds(value, out);
  }
  return out;
}

function getMarketingToolsCmsPath(id: string): string | null {
  if (!id || typeof id !== 'string') return null;
  if (id.startsWith('photo-')) return null;
  try {
    if (id.startsWith('cms/')) {
      if (id.includes('..')) return null;
      return id;
    }
    const url = new URL(id);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const pathname = decodeURIComponent(url.pathname);
    const marker = '/storage/v1/object/public/marketing-tools/';
    const idx = pathname.indexOf(marker);
    if (idx !== -1) {
      const after = pathname.slice(idx + marker.length);
      if (after.startsWith('cms/') && after.length > 4 && !after.includes('..')) return after;
      return null;
    }
    const marker2 = '/storage/v1/object/upload/sign/marketing-tools/';
    const idx2 = pathname.indexOf(marker2);
    if (idx2 !== -1) {
      const after = pathname.slice(idx2 + marker2.length);
      if (after.startsWith('cms/') && !after.includes('..')) return after;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS - same-origin + configured app origins only (no wildcard)
  setCors(res, req, 'GET,PUT,OPTIONS', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const key = (req.query.key as string | undefined)?.toLowerCase() as CmsKey | undefined;
  if (!key || !CMS_KEYS.includes(key as CmsKey)) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', `Unknown CMS key: ${key}`, 404);
    res.status(status).json({ error });
    return;
  }

  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const supabase = serviceClient();
  if (!supabase) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('cms_contents')
      .select('content, version, updated_at, updated_by')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    if (!data) {
      const { error: env, status } = toErrorEnvelope(
        'NOT_FOUND',
        `CMS content not found: ${key}`,
        404,
      );
      res.status(status).json({ error: env });
      return;
    }
    // Return the content object directly (validated shape) - public fallback handles 404 upstream
    // Include version metadata via headers for admin UI if needed
    res.setHeader('X-CMS-Version', String((data as { version: number }).version ?? 1));
    res.status(200).json((data as { content: unknown }).content);
    return;
  }

  if (req.method === 'PUT') {
    const auth = await verifyStaffModule(req, 'cms', ADMIN_STAFF);
    if ('error' in auth) {
      const { error, status } = auth.error;
      res.status(status).json({ error });
      return;
    }
    const schema = SCHEMA_BY_KEY[key];
    let body: unknown = req.body;
    // Vercel may give body as string if not parsed
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid JSON body', 400);
        res.status(status).json({ error });
        return;
      }
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Validation failed',
        400,
        parsed.error.issues,
      );
      res.status(status).json({ error });
      return;
    }
    // Fetch existing content and version for increment and cleanup
    const { data: existing } = await supabase
      .from('cms_contents')
      .select('content, version')
      .eq('key', key)
      .maybeSingle();
    const nextVersion = existing ? (existing as { version: number }).version + 1 : 1;
    const previousContent = (existing as { content: unknown } | null)?.content ?? null;
    const { data: upserted, error } = await supabase
      .from('cms_contents')
      .upsert(
        {
          key,
          content: parsed.data,
          version: nextVersion,
          updated_by: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
      .select('content')
      .single();
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    // Feature 2: Broadcast CMS update via Supabase Realtime (public clients invalidate ['cms', key])
    // Uses service_role channel; public clients subscribe via anon broadcast. Do not block response on failure.
    try {
      const rtChannel = supabase.channel('cms:public', {
        config: { broadcast: { ack: false } },
      } as never);
      rtChannel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          void rtChannel
            .send({
              type: 'broadcast',
              event: 'cms_update',
              payload: { key, version: nextVersion },
            } as never)
            .then(() => {
              setTimeout(() => {
                void supabase.removeChannel(rtChannel);
              }, 1000);
            });
        }
      });
    } catch (e) {
      console.error(`[cms:${key}] realtime broadcast failed:`, (e as Error).message);
    }
    // Feature 1: Successful save - now cleanup orphaned marketing-tools/cms images (server-side, service_role)
    // Do not block response on cleanup failure; do not roll back CMS on cleanup error
    if (previousContent) {
      try {
        const prevIds = extractCmsPhotoIds(previousContent);
        const newIds = extractCmsPhotoIds(parsed.data);
        const toDelete: string[] = [];
        for (const id of prevIds) {
          if (!newIds.has(id)) {
            const path = getMarketingToolsCmsPath(id);
            if (path) toDelete.push(path);
          }
        }
        if (toDelete.length > 0) {
          // Deduplicate
          const unique = [...new Set(toDelete)];
          const { error: delErr } = await supabase.storage.from('marketing-tools').remove(unique);
          if (delErr) {
            console.error(
              `[cms:${key}] cleanup failed for ${unique.length} objects:`,
              delErr.message,
            );
          } else {
            console.log(
              `[cms:${key}] cleaned up ${unique.length} orphaned images:`,
              unique.join(', '),
            );
          }
        }
      } catch (e) {
        console.error(`[cms:${key}] cleanup error:`, (e as Error).message);
      }
    }
    res.status(200).json((upserted as { content: unknown }).content);
    return;
  }

  const { error, status } = toErrorEnvelope('NOT_FOUND', `Method ${req.method} not allowed`, 405);
  res.status(status).json({ error });
}
