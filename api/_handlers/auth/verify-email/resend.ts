import { resendVerificationRequestSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { requireAnonClient } from '../../../_lib/otp.js';
import { methodNotAllowed, readJsonBody } from '../../../_lib/rest.js';

/**
 * POST /api/v1/auth/verify-email/resend — re-issue the email-verification
 * one-time code (FEAT-009). Public. The code is dispatched by Supabase Auth
 * (`signInWithOtp`); no code is returned here — the real email carries it
 * (`devOnlyCode` is mock-only).
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
  const anon = requireAnonClient();
  if (!anon) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) {
    // GoTrue rate-limit message ("For security purposes, you can only request
    // this after 60 seconds") plus generic rate/too-many signatures.
    const rateLimited = /rate|too many|temporar|you can only request/i.test(error.message);
    const { error: envelope, status } = toErrorEnvelope(
      rateLimited ? 'TOO_MANY_REQUESTS' : 'VALIDATION_ERROR',
      rateLimited
        ? 'Please wait a moment before requesting another code.'
        : 'We could not send a new code to this email address.',
      rateLimited ? 429 : 400,
    );
    res.status(status).json({ error: envelope });
    return;
  }
  res.status(200).json({ email });
}
