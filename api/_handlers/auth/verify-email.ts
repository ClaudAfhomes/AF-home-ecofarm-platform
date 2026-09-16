import { verifyEmailRequestSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { requireAnonClient } from '../../_lib/otp.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';

/**
 * POST /api/v1/auth/verify-email — confirm an email address (BR-AUTH-001,
 * FEAT-009). Public: the one-time code is delivered by email, so possession of
 * a valid code proves ownership. The code is validated against Supabase Auth
 * (`verifyOtp`), then the identity is authoritatively confirmed with
 * `email_confirm: true` (belt-and-suspenders: the OTP verify may not set
 * `email_confirmed_at` for admin-created users).
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
  const parsed = verifyEmailRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter your email address and the verification code.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const { email, code } = parsed.data;
  const anon = requireAnonClient();
  if (!anon) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const { data, error } = await anon.auth.verifyOtp({ email, token: code, type: 'email' });
  const userId = (data as { user?: { id?: string } | null } | null)?.user?.id;
  if (error || !userId) {
    const { error: envelope, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'The verification code is incorrect or has expired.',
      400,
    );
    res.status(status).json({ error: envelope });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const confirm = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
  if (confirm.error) {
    const { error: envelope, status } = toErrorEnvelope('INTERNAL', confirm.error.message, 500);
    res.status(status).json({ error: envelope });
    return;
  }
  res.status(200).json({ email, verifiedAt: new Date().toISOString() });
}
