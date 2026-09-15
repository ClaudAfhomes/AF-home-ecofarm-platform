import { createClient } from '@supabase/supabase-js';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { setCors } from '../../_lib/cors.js';
import { getSupabaseEnv } from '../../_lib/env.js';
import { toErrorEnvelope as toError } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

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

  let fileName = '';
  let mimeType = '';
  let buffer: Buffer | null = null;

  const body = req.body as Record<string, unknown> | undefined;
  // Support JSON base64: { name, type, data: "data:image/...;base64,..." or raw base64 }
  if (body && typeof body === 'object' && 'data' in body) {
    fileName = (body.name as string) ?? 'upload';
    mimeType = (body.type as string) ?? 'application/octet-stream';
    let b64 = body.data as string;
    const comma = b64.indexOf(',');
    if (comma !== -1) b64 = b64.slice(comma + 1);
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      const { error, status } = toError('VALIDATION_ERROR', 'Invalid base64', 400);
      res.status(status).json({ error });
      return;
    }
  } else {
    const { error, status } = toError(
      'VALIDATION_ERROR',
      'Missing file data (expected {name,type,data} base64 JSON)',
      400,
    );
    res.status(status).json({ error });
    return;
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const validExts = ['jpg', 'jpeg', 'png', 'webp'];
  const typeOk = mimeType ? validTypes.includes(mimeType) : validExts.includes(ext);
  if (!typeOk) {
    const { error, status } = toError(
      'VALIDATION_ERROR',
      'Only JPG, PNG and WebP are allowed',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  if (!buffer || buffer.length > 20 * 1024 * 1024) {
    const { error, status } = toError('VALIDATION_ERROR', 'File must be 20 MB or less', 400);
    res.status(status).json({ error });
    return;
  }

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'image';
  const key = `cms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error: upErr } = await supabase.storage.from('marketing-tools').upload(key, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (upErr) {
    const { error, status } = toError('INTERNAL', upErr.message, 500);
    res.status(status).json({ error });
    return;
  }
  const { data: pub } = supabase.storage.from('marketing-tools').getPublicUrl(key);
  res.status(201).json({ id: pub.publicUrl, storageRef: key, publicUrl: pub.publicUrl });
}
