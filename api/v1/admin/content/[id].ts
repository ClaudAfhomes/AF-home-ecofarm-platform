import { forwardableContentSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { isValidContentItemRow, mapContentItemRow } from '../../../_lib/mappers.js';
import { validateUpdateContentItem } from '../../../_lib/cutover.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import { buildContentShare } from '../content.js';

/** Bucket markers inside public download URLs (see `cms/upload/sign.ts`). */
const MARKETING_TOOLS_OBJECT_MARKERS = [
  '/storage/v1/object/public/marketing-tools/',
  '/storage/v1/object/authenticated/marketing-tools/',
];

/**
 * Extract the `marketing-tools` bucket object key from a download URL, or
 * null when the URL points elsewhere (external links are never touched).
 * Query strings are stripped; path traversal is rejected.
 */
export function marketingToolsObjectKey(downloadUrl: unknown): string | null {
  if (typeof downloadUrl !== 'string' || !downloadUrl) return null;
  const path = (downloadUrl.split('?')[0] ?? '').trim();
  for (const marker of MARKETING_TOOLS_OBJECT_MARKERS) {
    const at = path.indexOf(marker);
    if (at === -1) continue;
    const key = path.slice(at + marker.length).replace(/^\/+/, '');
    if (!key || key.includes('..')) return null;
    return key;
  }
  return null;
}

/**
 * DELETE /admin/content/:id (super_admin + admin, FR-ADM-003) — permanently
 * remove a marketing tool: its `ContentItem` row plus the uploaded object
 * when the download URL lives in the `marketing-tools` bucket. Row deletion
 * is authoritative: a storage failure still deletes the row
 * (`fileRemoved: false`, noted in the audit detail). Nothing references
 * `ContentItem`, so no cascade handling is needed.
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
  const auth = await verifyStaffModule(req, 'marketing_tools', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Content id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('ContentItem')
    .select('id, title, download_url')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Marketing tool not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;

  if (req.method === 'DELETE') {
    return deleteContentItem(res, supabase, auth, id, current);
  }

  // PATCH — title / description / kind / downloadUrl (file replacement).
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = validateUpdateContentItem(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid content update.', 400);
    res.status(status).json({ error });
    return;
  }
  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description.trim() || null;
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  const nextDownloadUrl =
    parsed.data.downloadUrl !== undefined ? parsed.data.downloadUrl : undefined;
  if (nextDownloadUrl !== undefined) patch.download_url = nextDownloadUrl;
  if (Object.keys(patch).length === 0) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }

  // File transitions: a new URL swaps the download target (share targets
  // rebuilt); explicit null detaches the file (URL + share cleared). Either
  // way the superseded bucket object is best-effort removed.
  let replacedFile = false;
  let clearedFile = false;
  if (nextDownloadUrl !== undefined && nextDownloadUrl !== current.download_url) {
    if (nextDownloadUrl === null) {
      patch.share = null;
      clearedFile = true;
    } else {
      const nextTitle = typeof patch.title === 'string' ? patch.title : String(current.title ?? '');
      patch.share = buildContentShare(nextTitle, nextDownloadUrl);
    }
    const oldKey = marketingToolsObjectKey(current.download_url);
    const nextKey =
      typeof nextDownloadUrl === 'string' ? marketingToolsObjectKey(nextDownloadUrl) : null;
    if (oldKey && oldKey !== nextKey) {
      try {
        const { error: removalError } = await supabase.storage
          .from('marketing-tools')
          .remove([oldKey]);
        if (!removalError) replacedFile = true;
      } catch {
        replacedFile = false;
      }
    }
  }
  const { data: updated, error: updateError } = await supabase
    .from('ContentItem')
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
  const mapped = mapContentItemRow(updated as Record<string, unknown>);
  if (!isValidContentItemRow(mapped)) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored content failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  const validated = forwardableContentSchema.safeParse(mapped);
  if (!validated.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored content failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'CONTENT_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'ContentItem',
    targetId: id,
    targetName: String((updated as Record<string, unknown>).title ?? id),
    detail:
      `Updated marketing tool ${id} (${Object.keys(patch).join(', ')})` +
      (clearedFile
        ? replacedFile
          ? ' — file removed (old object removed)'
          : ' — file removed'
        : nextDownloadUrl !== undefined && nextDownloadUrl !== current.download_url
          ? replacedFile
            ? ' — file replaced (old object removed)'
            : ' — file replaced'
          : ''),
  });
  res.status(200).json(validated.data);
}

type ServiceClient = NonNullable<ReturnType<typeof requireService>>;
type StaffAuth = { userId: string; slugs: string[] };

async function deleteContentItem(
  res: VercelResponse,
  supabase: ServiceClient,
  auth: StaffAuth,
  id: string,
  current: Record<string, unknown>,
) {
  // Best-effort bucket cleanup — never blocks the row delete.
  let fileRemoved = false;
  const objectKey = marketingToolsObjectKey(current.download_url);
  if (objectKey) {
    try {
      const { error: storageError } = await supabase.storage
        .from('marketing-tools')
        .remove([objectKey]);
      fileRemoved = !storageError;
    } catch {
      fileRemoved = false;
    }
  }
  const { error: deleteError } = await supabase.from('ContentItem').delete().eq('id', id);
  if (deleteError) {
    const { error, status } = toErrorEnvelope('INTERNAL', deleteError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'CONTENT_DELETED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'ContentItem',
    targetId: id,
    targetName: String(current.title ?? id),
    detail:
      `Permanently deleted marketing tool ${String(current.title ?? id)}` +
      (objectKey
        ? fileRemoved
          ? ' (uploaded file removed)'
          : ' (uploaded file removal failed)'
        : ''),
  });
  res.status(200).json({ id, deleted: true, fileRemoved });
}
