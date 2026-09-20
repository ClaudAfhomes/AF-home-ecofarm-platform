import { createHash } from 'node:crypto';

import { contactSubmissionRequestSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { prefixedId } from '../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../_lib/rest.js';
import { getSupabaseEnv } from '../_lib/env.js';
import { clientIp } from '../_lib/rate-limit.js';

/** Anti-spam: max submissions per client IP inside the window. */
const THROTTLE_WINDOW_MINUTES = 15;
const THROTTLE_MAX_PER_WINDOW = 5;

/**
 * POST /contact - public Contact page submission. Validates the payload,
 * drops honeypot fills silently (bots get a fake 201), throttles per IP,
 * and stores the inquiry for the admin Inquiries queue. The queue - not
 * email - is the delivery mechanism.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = contactSubmissionRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter your name, a valid email, and a message.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const { name, email, message, company } = parsed.data;
  // Honeypot: pretend success so bots learn nothing.
  if (company && company.trim().length > 0) {
    res.status(201).json({ id: 'ok', createdAt: new Date().toISOString() });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { serviceKey } = getSupabaseEnv();
  const ipHash = createHash('sha256')
    .update(`${clientIp(req)}:${serviceKey ?? 'jad-contact-throttle'}`)
    .digest('hex');
  const windowStart = new Date(Date.now() - THROTTLE_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error: countError } = await supabase
    .from('ContactInquiry')
    .select('id', { count: 'exact', head: true })
    .eq('ipHash', ipHash)
    .gte('createdAt', windowStart);
  if (countError) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', countError.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if ((count ?? 0) >= THROTTLE_MAX_PER_WINDOW) {
    const { error: env, status } = toErrorEnvelope(
      'TOO_MANY_REQUESTS',
      'Too many messages sent recently. Please try again later.',
      429,
    );
    res.status(status).json({ error: env });
    return;
  }
  const id = prefixedId('inq');
  const { error } = await supabase.from('ContactInquiry').insert({
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    message: message.trim(),
    status: 'NEW',
    ipHash,
  });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(201).json({ id, createdAt: new Date().toISOString() });
}
