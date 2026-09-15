import { createClient } from '@supabase/supabase-js';

import { contentUploadSignRequestSchema, type ContentKind } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { setCors } from '../../../_lib/cors.js';
import { getSupabaseEnv } from '../../../_lib/env.js';
import { toErrorEnvelope as toError } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

/**
 * Per-kind upload rules — mirrors the admin dialog's `KIND_ACCEPT` /
 * `KIND_MAX_SIZE` maps (ContentPage). `kind` omitted = IMAGE (legacy CMS
 * image callers send name/type/size only).
 *
 * These caps must stay within the `marketing-tools` bucket's
 * `file_size_limit` / `allowed_mime_types` (see migration
 * 20260926000001_marketing_tools_bucket_limits.sql) — otherwise signing
 * succeeds here but Supabase rejects the direct PUT.
 */
const KIND_UPLOAD_RULES: Record<
  ContentKind,
  { mimeTypes: string[]; exts: string[]; maxBytes: number; typeMessage: string }
> = {
  DOCUMENT: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    exts: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'],
    maxBytes: 20 * 1024 * 1024,
    typeMessage: 'Documents must be PDF, DOC, DOCX, PPT, PPTX, XLS or XLSX',
  },
  IMAGE: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    exts: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 20 * 1024 * 1024,
    typeMessage: 'Only JPG, PNG and WebP are allowed',
  },
  VIDEO: {
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    exts: ['mp4', 'webm', 'mov'],
    maxBytes: 100 * 1024 * 1024,
    typeMessage: 'Videos must be MP4, WebM or MOV',
  },
  PROMO: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ],
    exts: [
      'pdf',
      'doc',
      'docx',
      'ppt',
      'pptx',
      'xls',
      'xlsx',
      'jpg',
      'jpeg',
      'png',
      'webp',
      'mp4',
      'webm',
      'mov',
    ],
    maxBytes: 50 * 1024 * 1024,
    typeMessage: 'Promos must be a document, image, or video file',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    const { error, status } = toError('NOT_FOUND', `Method ${req.method} not allowed`, 405);
    res.status(status).json({ error });
    return;
  }
  const auth = await verifyStaffModule(req, 'cms', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toError('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    const { error, status } = toError('VALIDATION_ERROR', 'Missing request body', 400);
    res.status(status).json({ error });
    return;
  }

  if (typeof body.name !== 'string' || !body.name.trim()) {
    const { error, status } = toError('VALIDATION_ERROR', 'File name is required', 400);
    res.status(status).json({ error });
    return;
  }
  if (typeof body.type !== 'string' || !body.type.trim()) {
    const { error, status } = toError('VALIDATION_ERROR', 'File type is required', 400);
    res.status(status).json({ error });
    return;
  }
  const parsed = contentUploadSignRequestSchema.safeParse(body);
  if (!parsed.success) {
    const { error, status } = toError(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'File name and type are required',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const fileName = parsed.data.name;
  const mimeType = parsed.data.type;
  const size = parsed.data.size;
  const rules = KIND_UPLOAD_RULES[parsed.data.kind ?? 'IMAGE'];

  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const typeOk = rules.mimeTypes.includes(mimeType) || rules.exts.includes(ext);
  if (!typeOk) {
    const { error, status } = toError('VALIDATION_ERROR', rules.typeMessage, 400);
    res.status(status).json({ error });
    return;
  }

  if (typeof size === 'number' && size > rules.maxBytes) {
    const maxMB = Math.round(rules.maxBytes / (1024 * 1024));
    const { error, status } = toError('VALIDATION_ERROR', `File must be ${maxMB} MB or less`, 400);
    res.status(status).json({ error });
    return;
  }

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'image';
  const key = `cms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { data, error } = await supabase.storage.from('marketing-tools').createSignedUploadUrl(key);

  if (error || !data) {
    const { error: err, status } = toError(
      'INTERNAL',
      error?.message ?? 'Failed to create signed upload URL',
      500,
    );
    res.status(status).json({ error: err });
    return;
  }

  const { data: pub } = supabase.storage.from('marketing-tools').getPublicUrl(key);

  res.status(200).json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    key,
    publicUrl: pub.publicUrl,
  });
}
