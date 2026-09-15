import { describe, expect, it } from 'vitest';

import { resolveRequestUrl, selectHandler } from './router.js';

describe('selectHandler', () => {
  it('routes exact endpoints', () => {
    expect(selectHandler('/api/v1/config/public', {})?.routeKey).toBe('config/public');
    expect(selectHandler('/api/v1/admin/queues', {})?.routeKey).toBe('admin/queues');
    expect(selectHandler('/api/v1/me/wallet', {})?.routeKey).toBe('me/wallet');
  });

  it('routes nested dynamic endpoints and captures params', () => {
    const q: Record<string, string | undefined> = {};
    expect(selectHandler('/api/v1/admin/members', q)?.routeKey).toBe('admin/members');
    expect(selectHandler('/api/v1/admin/members/mem-001', q)?.routeKey).toBe('admin/members/[id]');
    expect(q.id).toBe('mem-001');
    expect(selectHandler('/api/v1/admin/vouchers/vch-1/redeem', q)?.routeKey).toBe(
      'admin/vouchers/[id]/redeem',
    );
    expect(selectHandler('/api/v1/admin/config/COMMISSION_DIRECT_RATE', q)?.routeKey).toBe(
      'admin/config/[key]',
    );
    expect(q.key).toBe('COMMISSION_DIRECT_RATE');
    expect(selectHandler('/api/v1/admin/property-categories/residential', q)?.routeKey).toBe(
      'admin/property-categories/[slug]',
    );
    expect(selectHandler('/api/v1/admin/conversations/uuid-1/messages', q)?.routeKey).toBe(
      'admin/conversations/[memberId]/messages',
    );
  });

  it('routes sub-actions over the plain id resource', () => {
    const q: Record<string, string | undefined> = {};
    expect(selectHandler('/api/v1/sales/sal-1/resubmit', q)?.routeKey).toBe('sales/resubmit');
    expect(selectHandler('/api/v1/sales/sal-1', q)?.routeKey).toBe('sales/[id]');
    expect(selectHandler('/api/v1/me/sales/sal-1/reopen-request', q)?.routeKey).toBe(
      'me/sales/reopen-request',
    );
  });

  it('routes the cms fallback by key', () => {
    expect(selectHandler('/api/v1/cms/homepage', {})?.routeKey).toBe('homepage');
    expect(selectHandler('/api/v1/cms/upload', {})?.routeKey).toBe('upload');
  });

  it('returns null for unknown paths', () => {
    expect(selectHandler('/api/v1/nope', {})).toBeNull();
    expect(selectHandler('/api/v1/admin/nope', {})).toBeNull();
  });
});

describe('resolveRequestUrl', () => {
  it('keeps the original /api/v1 URL and its query string', () => {
    const req = {
      url: '/api/v1/me/ledger?type=DIRECT_COMMISSION&cursor=abc',
      query: { path: 'me/ledger' },
    };
    expect(resolveRequestUrl(req)).toBe('/api/v1/me/ledger?type=DIRECT_COMMISSION&cursor=abc');
  });

  it('rebuilds the path from the rewrite query param', () => {
    expect(resolveRequestUrl({ url: '/api/router', query: { path: 'config/public' } })).toBe(
      '/api/v1/config/public',
    );
    expect(
      resolveRequestUrl({ url: '/api/router', query: { path: 'admin/members/mem-001' } }),
    ).toBe('/api/v1/admin/members/mem-001');
  });

  it('joins array path params and falls back to the raw url', () => {
    expect(resolveRequestUrl({ url: '/api/router', query: { path: ['admin', 'members'] } })).toBe(
      '/api/v1/admin/members',
    );
    expect(resolveRequestUrl({ url: '/', query: {} })).toBe('/');
  });
});
