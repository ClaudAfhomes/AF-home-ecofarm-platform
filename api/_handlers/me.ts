import { memberProfileSchema } from '@jad/contracts';

import { verifyUser } from '../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { mapMemberRow } from '../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../_lib/rest.js';
import { toErrorEnvelope } from '../_lib/envelope.js';

const EDITABLE = [
  'firstName',
  'lastName',
  'middleInitial',
  'nameSuffix',
  'gender',
  'address',
  'phone',
] as const;

/** PATCH /me — own mutable profile fields; country immutable (BR-REG-010). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PATCH') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyUser(req);
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
  const input = ((parsedBody.body ?? {}) as Record<string, unknown>);
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: current, error: readError } = await supabase
    .from('Member')
    .select('*')
    .eq('id', auth.userId)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!current) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  const row = current as Record<string, unknown>;
  if (
    (input.countryCode !== undefined && input.countryCode !== row.countryCode) ||
    (input.countryName !== undefined && input.countryName !== row.countryName)
  ) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Country cannot be changed.', 400);
    res.status(status).json({ error });
    return;
  }
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    const value = input[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (field === 'firstName' || field === 'lastName' || field === 'phone') {
      if (!trimmed) continue;
      patch[field] = trimmed;
    } else {
      patch[field] = value;
    }
  }
  if (Object.keys(patch).length > 0) {
    const { error: writeError } = await supabase.from('Member').update(patch).eq('id', auth.userId);
    if (writeError) {
      const { error, status } = toErrorEnvelope('INTERNAL', writeError.message, 500);
      res.status(status).json({ error });
      return;
    }
  }
  const { data: updated, error: rereadError } = await supabase
    .from('Member')
    .select('*')
    .eq('id', auth.userId)
    .single();
  if (rereadError || !updated) {
    const { error, status } = toErrorEnvelope('INTERNAL', rereadError?.message ?? 'Update failed', 500);
    res.status(status).json({ error });
    return;
  }
  const parsed = memberProfileSchema.safeParse(mapMemberRow(updated as Record<string, unknown>));
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored profile failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
