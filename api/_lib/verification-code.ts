import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { getSupabaseEnv } from './env.js';
import { sendVerificationEmail } from './emailjs.js';
import type { serviceClient } from './rest.js';

/**
 * Self-managed email verification codes (EmailJS delivery).
 *
 * Registration issues a 6-digit code and stores only its HMAC-SHA256 hash
 * in `EmailVerification`; verify/resend check the hash, expiry, attempts,
 * and send throttles. `user_id` links the auth user for the authoritative
 * `email_confirm: true` - populated from `createUser` on fresh
 * registrations; legacy rows (pre-feature) resolve it via a bounded
 * auth-users scan.
 */

export const CODE_TTL_MINUTES = 15;
export const CODE_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_SENDS_PER_HOUR = 5;

type ServiceClient = NonNullable<ReturnType<typeof serviceClient>>;

type VerificationRow = {
  email: string;
  user_id?: string | null;
  code_hash?: string;
  expires_at?: string;
  attempts?: number;
  send_count?: number;
  window_start?: string;
  sent_at?: string;
  verified_at?: string | null;
};

function pepper(): string {
  return process.env.EMAIL_OTP_PEPPER?.trim() || getSupabaseEnv().serviceKey || 'jad-email-otp-dev';
}

function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}:${pepper()}`).digest('hex');
}

/** Cryptographically random 6-digit code (`100000`-`999999`). */
export function generateCode(): string {
  return String(randomInt(100000, 1_000_000));
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

type Chain = {
  select: (...a: unknown[]) => Chain;
  eq: (...a: unknown[]) => Chain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  upsert: (...a: unknown[]) => Promise<{ error: unknown }>;
  update: (...a: unknown[]) => Chain;
};

function table(supabase: ServiceClient, name: string): Chain {
  return (supabase.from as unknown as (table: string) => Chain)(name);
}

async function readRow(supabase: ServiceClient, email: string): Promise<VerificationRow | null> {
  const { data } = await table(supabase, 'EmailVerification')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  return (data as VerificationRow | null) ?? null;
}

/**
 * Bounded legacy fallback: resolve the auth user id by scanning auth users
 * (max 300). Fresh rows always carry `user_id`; this runs only for
 * pre-feature registrations that never stored one.
 */
export async function resolveAuthUserId(
  supabase: ServiceClient,
  email: string,
): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  try {
    for (let page = 1; page <= 3; page++) {
      const { data, error } = (await supabase.auth.admin.listUsers({
        page,
        perPage: 100,
      })) as unknown as { data?: { users?: { id: string; email?: string }[] }; error?: unknown };
      if (error) {
        console.error('[email] auth user lookup failed:', (error as Error)?.message ?? error);
        return null;
      }
      const users = data?.users ?? [];
      const hit = users.find((u) => (u.email ?? '').toLowerCase() === wanted);
      if (hit) return hit.id;
      if (users.length < 100) break;
    }
  } catch (e) {
    console.error('[email] auth user lookup error:', (e as Error)?.message ?? e);
    return null;
  }
  return null;
}

export interface IssueResult {
  sent: boolean;
  /** Seconds until another send is allowed (existing live code kept). */
  cooldownSeconds?: number;
  /** True when the hourly send cap was hit (no new code issued). */
  rateLimited?: boolean;
}

/**
 * Issue (or re-issue) a verification code for `email` and deliver it via
 * EmailJS. Returns whether the email went out. Never throws - failures are
 * logged and reported as `sent: false` so registration still succeeds and
 * the applicant re-requests via resend.
 */
export async function issueVerificationCode(
  supabase: ServiceClient,
  input: { email: string; name?: string; userId?: string | null },
): Promise<IssueResult> {
  const email = input.email.trim().toLowerCase();
  const now = Date.now();
  try {
    const row = await readRow(supabase, email);
    if (row) {
      const sentAt = Date.parse(String(row.sent_at ?? ''));
      const expiresAt = Date.parse(String(row.expires_at ?? ''));
      const ageSec = (now - sentAt) / 1000;
      if (!Number.isNaN(sentAt) && !Number.isNaN(expiresAt) && expiresAt > now) {
        // Live code: respect the resend cooldown instead of burning sends.
        if (ageSec < RESEND_COOLDOWN_SECONDS) {
          return { sent: true, cooldownSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - ageSec) };
        }
        // Hourly cap on the rolling window.
        const windowStart = Date.parse(String(row.window_start ?? ''));
        const inWindow =
          !Number.isNaN(windowStart) && now - windowStart < 3_600_000
            ? Number(row.send_count ?? 0)
            : 0;
        if (inWindow >= MAX_SENDS_PER_HOUR) return { sent: false, rateLimited: true };
      }
    }
    const windowStart = row ? Date.parse(String(row.window_start ?? '')) : Number.NaN;
    const inWindow =
      row && !Number.isNaN(windowStart) && now - windowStart < 3_600_000
        ? Number(row.send_count ?? 0)
        : 0;
    if (inWindow >= MAX_SENDS_PER_HOUR) return { sent: false, rateLimited: true };
    const userId = input.userId ?? row?.user_id ?? (await resolveAuthUserId(supabase, email));
    const code = generateCode();
    const { error } = await table(supabase, 'EmailVerification').upsert({
      email,
      user_id: userId,
      code_hash: hashCode(email, code),
      expires_at: new Date(now + CODE_TTL_MINUTES * 60_000).toISOString(),
      attempts: 0,
      send_count: inWindow + 1,
      window_start:
        row && !Number.isNaN(windowStart) && now - windowStart < 3_600_000
          ? row.window_start
          : new Date(now).toISOString(),
      sent_at: new Date(now).toISOString(),
      verified_at: null,
    });
    if (error) {
      console.error('[email] verification code store failed:', (error as Error)?.message ?? error);
      return { sent: false };
    }
    const sent = await sendVerificationEmail({
      to: email,
      name: input.name,
      code,
      expiryMinutes: CODE_TTL_MINUTES,
    });
    return { sent };
  } catch (e) {
    console.error('[email] issue verification code error:', (e as Error)?.message ?? e);
    return { sent: false };
  }
}

export type CheckResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'locked' };

/**
 * Check a submitted code. On success the row is marked verified (idempotent:
 * re-submitting a verified code returns the stored `verifiedAt`).
 * Confirmation of the auth user (`email_confirm`) stays the caller's job -
 * it needs the service client.
 */
export async function checkVerificationCode(
  supabase: ServiceClient,
  email: string,
  code: string,
): Promise<CheckResult> {
  const normalized = email.trim().toLowerCase();
  const row = await readRow(supabase, normalized);
  if (!row?.code_hash) return { ok: false, reason: 'missing' };
  if (row.verified_at) return { ok: true, verifiedAt: String(row.verified_at) };
  if (Number(row.attempts ?? 0) >= CODE_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (Date.parse(String(row.expires_at ?? '')) <= Date.now())
    return { ok: false, reason: 'expired' };
  if (!safeEqual(hashCode(normalized, code.trim()), String(row.code_hash))) {
    await table(supabase, 'EmailVerification')
      .update({ attempts: Number(row.attempts ?? 0) + 1 })
      .eq('email', normalized);
    return { ok: false, reason: 'invalid' };
  }
  const verifiedAt = new Date().toISOString();
  await table(supabase, 'EmailVerification')
    .update({ verified_at: verifiedAt, attempts: 0 })
    .eq('email', normalized);
  return { ok: true, verifiedAt };
}
