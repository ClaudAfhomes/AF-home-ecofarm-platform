/**
 * EmailJS delivery for verification codes (server-only).
 *
 * Registration/verify/resend send the 6-digit code through the EmailJS REST
 * API - never Supabase SMTP, so no dashboard template or custom SMTP is
 * required. The EmailJS template must define `to_email`, `to_name`,
 * `verification_code`, `app_name`, and `expiry_minutes` params (see
 * `.env.example`). Returns booleans, never throws: callers treat a failed
 * send as `emailSent: false` and the applicant re-requests via resend.
 */

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey?: string;
  apiUrl: string;
}

/** Resolved EmailJS config, or null when the service is not configured. */
export function getEmailJsConfig(): EmailJsConfig | null {
  const serviceId = process.env.EMAILJS_SERVICE_ID?.trim();
  const templateId = process.env.EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = process.env.EMAILJS_PUBLIC_KEY?.trim();
  if (!serviceId || !templateId || !publicKey) return null;
  return {
    serviceId,
    templateId,
    publicKey,
    privateKey: process.env.EMAILJS_PRIVATE_KEY?.trim() || undefined,
    apiUrl: process.env.EMAILJS_API_URL?.trim() || 'https://api.emailjs.com/api/v1.0/email/send',
  };
}

export interface VerificationEmail {
  to: string;
  name?: string;
  code: string;
  expiryMinutes: number;
}

/** Send the verification code; false on any failure (logged, never thrown). */
export async function sendVerificationEmail(input: VerificationEmail): Promise<boolean> {
  const config = getEmailJsConfig();
  if (!config) {
    console.error(
      '[email] EmailJS is not configured (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY).',
    );
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        ...(config.privateKey ? { accessToken: config.privateKey } : {}),
        template_params: {
          to_email: input.to,
          to_name: input.name?.trim() || input.to,
          verification_code: input.code,
          app_name: 'JA&D Realty',
          expiry_minutes: String(input.expiryMinutes),
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[email] EmailJS send failed (${res.status}): ${text.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] EmailJS send error:', (e as Error)?.message ?? e);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
