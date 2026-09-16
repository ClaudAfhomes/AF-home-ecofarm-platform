import { describe, expect, it } from 'vitest';

import {
  isValidContentItemRow,
  isValidNotificationRow,
  mapContentItemRow,
  mapNotificationRow,
} from './mappers.js';

describe('mapNotificationRow', () => {
  it('maps snake_case rows to the contract shape', () => {
    expect(
      mapNotificationRow({
        id: 'ntf-001',
        title: 'Welcome',
        body: 'Hello',
        read_at: null,
        created_at: '2026-08-18T09:00:00.000Z',
      }),
    ).toEqual({
      id: 'ntf-001',
      title: 'Welcome',
      body: 'Hello',
      createdAt: '2026-08-18T09:00:00.000Z',
      readAt: undefined,
    });
  });

  it('accepts mapped rows and rejects title-less rows', () => {
    expect(
      isValidNotificationRow({ id: 'a', title: 'T', created_at: '2026-08-18T09:00:00.000Z' }),
    ).toBe(true);
    expect(isValidNotificationRow({ id: 'a', created_at: '2026-08-18T09:00:00.000Z' })).toBe(false);
  });

  it('keeps valid rows through map-then-validate (list handlers filter mapped rows)', () => {
    const mapped = mapNotificationRow({
      id: 'ntf-001',
      title: 'Welcome',
      body: 'Hello',
      read_at: null,
      created_at: '2026-08-18T09:00:00.000Z',
    });
    expect(isValidNotificationRow(mapped)).toBe(true);
  });
});

describe('mapContentItemRow', () => {
  it('maps snake_case rows to the contract shape', () => {
    expect(
      mapContentItemRow({
        id: 'ctn-001',
        title: 'Overview',
        description: 'Desc',
        kind: 'DOCUMENT',
        download_url: 'https://example.test/f.pdf',
        share: { copyUrl: 'https://example.test/f' },
        created_at: '2026-08-10T09:00:00.000Z',
      }),
    ).toEqual({
      id: 'ctn-001',
      title: 'Overview',
      description: 'Desc',
      kind: 'DOCUMENT',
      downloadUrl: 'https://example.test/f.pdf',
      share: { copyUrl: 'https://example.test/f' },
      createdAt: '2026-08-10T09:00:00.000Z',
    });
  });

  it('accepts mapped rows and rejects unknown kinds', () => {
    expect(
      isValidContentItemRow({
        id: 'a',
        title: 'T',
        kind: 'DOCUMENT',
        created_at: '2026-08-10T09:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isValidContentItemRow({
        id: 'a',
        title: 'T',
        kind: 'NOPE',
        created_at: '2026-08-10T09:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('keeps valid rows through map-then-validate (list handlers filter mapped rows)', () => {
    const mapped = mapContentItemRow({
      id: 'cnt-001',
      title: 'Showcase',
      description: null,
      kind: 'IMAGE',
      download_url: 'https://cdn.test/showcase.jpg',
      share: { copyUrl: 'https://cdn.test/showcase.jpg' },
      created_at: '2026-09-08T04:14:34.260445+00:00',
    });
    expect(isValidContentItemRow(mapped)).toBe(true);
  });
});
