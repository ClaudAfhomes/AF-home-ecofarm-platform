import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getEmailJsConfig, sendVerificationEmail } from './emailjs.js';

describe('emailjs', () => {
  beforeEach(() => {
    vi.stubEnv('EMAILJS_SERVICE_ID', 'service_test');
    vi.stubEnv('EMAILJS_TEMPLATE_ID', 'template_test');
    vi.stubEnv('EMAILJS_PUBLIC_KEY', 'public_test');
    vi.stubEnv('EMAILJS_PRIVATE_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns null config when env is missing', () => {
    vi.stubEnv('EMAILJS_SERVICE_ID', '');
    expect(getEmailJsConfig()).toBeNull();
  });

  it('sends through the EmailJS REST API with template params', async () => {
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sent = await sendVerificationEmail({
      to: 'maria@example.com',
      name: 'Maria',
      code: '123456',
      expiryMinutes: 15,
    });
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      service_id: 'service_test',
      template_id: 'template_test',
      user_id: 'public_test',
      template_params: {
        to_email: 'maria@example.com',
        to_name: 'Maria',
        verification_code: '123456',
        app_name: 'JA&D Realty',
        expiry_minutes: '15',
      },
    });
  });

  it('returns false (never throws) when EmailJS rejects or fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('DENIED', { status: 400 })),
    );
    await expect(
      sendVerificationEmail({ to: 'a@b.co', code: '123456', expiryMinutes: 15 }),
    ).resolves.toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(
      sendVerificationEmail({ to: 'a@b.co', code: '123456', expiryMinutes: 15 }),
    ).resolves.toBe(false);
  });

  it('returns false when unconfigured', async () => {
    vi.stubEnv('EMAILJS_SERVICE_ID', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      sendVerificationEmail({ to: 'a@b.co', code: '123456', expiryMinutes: 15 }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
