import { resendVerificationRequestSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { issueVerificationCode } from '../../../_lib/verification-code.js';

/**
 * POST /api/v1/auth/verify-email/resend - re-issue the email-verification
 * one-time code (FEAT-009). Public. A fresh code is generated and delivered
 * via EmailJS; no code is returned here (`devOnlyCode` is mock-only).
 * Enforces a 60s resend cooldown and an hourly send cap.
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
  const parsed = resendVerificationRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Enter your email address.', 400);
    res.status(status).json({ error });
    return;
  }
  const { email } = parsed.data;
  const supabase = requireService(res);
  if (!supabase) return;
  const result = await issueVerificationCode(supabase, { email });
  if (result.rateLimited) {
    const { error, status } = toErrorEnvelope(
      'TOO_MANY_REQUESTS',
      'Too many codes requested. Please try again later.',
      429,
    );
    res.status(status).json({ error });
    return;
  }
  if (!result.sent) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'We could not send a new code right now. Please try again shortly.',
      503,
    );
    res.status(status).json({ error });
    return;
  }
  res.status(200).json({
    email,
    ...(result.cooldownSeconds !== undefined && { retryAfterSeconds: result.cooldownSeconds }),
  });
}
