import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clientIp, enforceRateLimit, resetRateLimits } from './rate-limit.js';
import type { VercelRequest, VercelResponse } from './http.js';

function makeReq(ip?: string, headers?: Record<string, string>): VercelRequest {
  const h: Record<string, string | string[] | undefined> = { ...headers };
  if (ip) h['x-forwarded-for'] = ip;
  return { headers: h, query: {}, url: '/api/v1/test', method: 'POST' } as VercelRequest;
}

function makeRes(): { res: VercelResponse; statuses: number[]; headers: Record<string, string> } {
  const statuses: number[] = [];
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status: (code: number) => {
      statuses.push(code);
      return { json: () => undefined };
    },
  } as unknown as VercelResponse;
  return { res, statuses, headers };
}

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('extracts the first forwarded IP and falls back to headers', () => {
    expect(clientIp(makeReq('1.2.3.4, 5.6.7.8'))).toBe('1.2.3.4');
    expect(clientIp(makeReq(undefined, { 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(makeReq())).toBe('unknown');
  });

  it('allows requests under the limit and records each hit', () => {
    const { res } = makeRes();
    for (let i = 0; i < 5; i++) {
      expect(enforceRateLimit(makeReq('1.1.1.1'), res, { scope: 's', max: 5 })).toBe(true);
    }
  });

  it('returns 429 with Retry-After once the limit is exceeded', () => {
    const blocked = makeRes();
    for (let i = 0; i < 3; i++) {
      enforceRateLimit(makeReq('2.2.2.2'), blocked.res, { scope: 's', max: 3 });
    }
    const over = makeRes();
    expect(enforceRateLimit(makeReq('2.2.2.2'), over.res, { scope: 's', max: 3 })).toBe(false);
    expect(over.statuses).toEqual([429]);
    expect(over.headers['Retry-After']).toBeDefined();
  });

  it('scopes limits independently per endpoint and per IP', () => {
    const res = makeRes().res;
    for (let i = 0; i < 3; i++) {
      expect(enforceRateLimit(makeReq('3.3.3.3'), res, { scope: 'a', max: 3 })).toBe(true);
    }
    expect(enforceRateLimit(makeReq('3.3.3.3'), res, { scope: 'a', max: 3 })).toBe(false);
    // Same IP, different scope is unaffected. Different IP, same scope too.
    expect(enforceRateLimit(makeReq('3.3.3.3'), res, { scope: 'b', max: 3 })).toBe(true);
    expect(enforceRateLimit(makeReq('4.4.4.4'), res, { scope: 'a', max: 3 })).toBe(true);
  });

  it('frees the slot once the window passes', () => {
    const { res } = makeRes();
    const clock = fakeTimers();
    try {
      for (let i = 0; i < 2; i++) {
        enforceRateLimit(makeReq('5.5.5.5'), res, { scope: 's', max: 2, windowMs: 1000 });
      }
      expect(enforceRateLimit(makeReq('5.5.5.5'), res, { scope: 's', max: 2, windowMs: 1000 })).toBe(
        false,
      );
      clock.advance(1500);
      expect(enforceRateLimit(makeReq('5.5.5.5'), res, { scope: 's', max: 2, windowMs: 1000 })).toBe(
        true,
      );
    } finally {
      clock.stop();
    }
  });
});

/** Tiny manual clock so sliding windows are testable without fake timers. */
function fakeTimers(): { advance: (ms: number) => void; stop: () => void } {
  let offset = 0;
  const realNow = Date.now;
  const spy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  return {
    advance: (ms: number) => {
      offset += ms;
    },
    stop: () => spy.mockRestore(),
  };
}
