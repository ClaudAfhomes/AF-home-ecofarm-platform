import { createContentItemRequestSchema, forwardableContentSchema } from '@jad/contracts';

import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidContentItemRow, mapContentItemRow } from '../../_lib/mappers.js';
import { prefixedId } from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** Build server-provided share targets from the download URL (BR-MKT-002). */
export function buildContentShare(title: string, downloadUrl: string) {
  const encodedUrl = encodeURIComponent(downloadUrl);
  const encodedText = encodeURIComponent(title);
  return {
    messengerUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    viberUrl: `https://www.viber.com/forward?text=${encodedText}`,
    copyUrl: downloadUrl,
  };
}

/** GET /admin/content - full library incl. unpublished (super_admin + admin). */
export async function listAdminContent(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'marketing_tools', ['super_admin', 'admin']);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('ContentItem')
    .select('id, title, description, kind, download_url, share, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapContentItemRow);
  okList(res, rows.filter(isValidContentItemRow));
}

/** POST /admin/content - publish marketing content (super_admin + admin, FR-ADM-003). */
export async function createAdminContent(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'marketing_tools', ['super_admin', 'admin']);
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
  const parsed = createContentItemRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter a title, type, and uploaded file.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const input = parsed.data;
  const description = (input.description ?? '').trim() || null;
  const share = input.share ?? buildContentShare(input.title.trim(), input.downloadUrl);
  const row = {
    id: prefixedId('cnt'),
    title: input.title.trim(),
    description,
    kind: input.kind,
    download_url: input.downloadUrl,
    share,
    published: input.published ?? true,
  };
  const { data, error } = await supabase.from('ContentItem').insert(row).select().single();
  if (error || !data) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      error?.message ?? 'Failed to save content',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const mapped = mapContentItemRow(data as Record<string, unknown>);
  const validated = forwardableContentSchema.safeParse(mapped);
  if (!validated.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored content record failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(201).json(validated.data);
}

/** GET + POST /admin/content - full library and publish (super_admin + admin). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listAdminContent(req, res);
  if (req.method === 'POST') return createAdminContent(req, res);
  methodNotAllowed(res, req.method);
}
