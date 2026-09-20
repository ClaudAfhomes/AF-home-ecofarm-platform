import { verifyEmailRequestSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { checkVerificationCode, resolveAuthUserId } from '../../_lib/verification-code.js';
import { enforceRateLimit } from '../../_lib/rate-limit.js';

/**
 * POST /api/v1/auth/verify-email - confirm an email address (BR-AUTH-001,
 * FEAT-009). Public: the one-time code is delivered by email, so possession
 * of a valid code proves ownership. The code is checked against the stored
 * hash (`EmailVerification`, EmailJS delivery), then the auth user is
 * authoritatively confirmed with `email_confirm: true`.
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
  // Per-IP brake against brute-forcing one-time codes (each code already
  // locks after 5 wrong attempts; this bounds guessing across many emails).
  if (
    !enforceRateLimit(req, res, {
      scope: 'auth/verify-email',
      max: process.env.VERIFY_EMAIL_RATE_LIMIT
        ? Number(process.env.VERIFY_EMAIL_RATE_LIMIT)
        : 20,
    })
  ) {
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
  const supabase = requireService(res);
  if (!supabase) return;
  const result = await checkVerificationCode(supabase, email, code);
  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? 'The verification code has expired. Request a new one.'
        : result.reason === 'locked'
          ? 'Too many incorrect attempts. Request a new code.'
          : 'The verification code is incorrect or has expired.';
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', message, 400);
    res.status(status).json({ error });
    return;
  }
  // Resolve the auth user for the authoritative confirmation. Fresh rows
  // carry user_id; legacy rows fall back to a bounded auth-users scan.
  const { data: row } = await supabase
    .from('EmailVerification')
    .select('user_id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  const storedUserId = (row as { user_id?: string | null } | null)?.user_id ?? null;
  const userId = storedUserId ?? (await resolveAuthUserId(supabase, email));
  if (!userId) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'We could not find your account. Please contact support.',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  const confirm = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
  if (confirm.error) {
    const { error, status } = toErrorEnvelope('INTERNAL', confirm.error.message, 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json({ email, verifiedAt: result.verifiedAt });
}
