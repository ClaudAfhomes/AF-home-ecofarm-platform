import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CMS_PROPERTIES_SEED } from '@jad/contracts';

import { syncCatalogPropertyToCms, syncCmsPropertiesToCatalog } from './catalog-cms-sync.js';

/**
 * Catalog <-> CMS properties reconciliation. Supabase is a scriptable mock:
 * `cms_contents` holds one properties row, `Property` holds catalog rows.
 */
const mocks = vi.hoisted(() => {
  const state = {
    cmsContent: null as Record<string, unknown> | null,
    cmsVersion: 1,
    upserts: [] as Record<string, unknown>[],
    properties: [] as Record<string, unknown>[],
    updates: [] as { patch: Record<string, unknown>; id: string }[],
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () =>
      table === 'cms_contents'
        ? { data: { content: state.cmsContent, version: state.cmsVersion }, error: null }
        : { data: null, error: null };
    chain.upsert = async (row: Record<string, unknown>) => {
      state.upserts.push(row);
      state.cmsContent = row.content as Record<string, unknown>;
      state.cmsVersion = row.version as number;
      return { data: { content: row.content }, error: null };
    };
    chain.update = (patch: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        state.updates.push({ patch, id });
        return { error: null };
      },
    });
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'Property') resolve({ data: state.properties, error: null });
      else resolve({ data: null, error: null });
    };
    return chain;
  };
  return {
    state,
    client: {
      from: (table: string) => chainFor(table),
      channel: () => ({
        subscribe: (cb: (status: string) => void) => cb('SUBSCRIBED'),
        send: () => Promise.resolve(),
      }),
      removeChannel: () => Promise.resolve(),
    },
  };
});

function buildContent() {
  const draft = structuredClone(CMS_PROPERTIES_SEED) as unknown as {
    categories: { slug: string; catalogSlug?: string }[];
    properties: {
      id: string;
      catalogId?: string;
      name: string;
      categoryId: string;
      price?: string;
    }[];
  };
  const listing = draft.properties[0]!;
  listing.catalogId = 'prop-1';
  // Keep the linked category coherent for the price/category assertions.
  const categoryId = listing.categoryId;
  const category = draft.categories.find((candidate) => candidate.slug === categoryId);
  if (category) category.catalogSlug = category.slug;
  return draft as unknown as typeof CMS_PROPERTIES_SEED;
}

const content = buildContent();

describe('catalog-cms-sync', () => {
  beforeEach(() => {
    mocks.state.cmsContent = structuredClone(content);
    mocks.state.cmsVersion = 1;
    mocks.state.upserts = [];
    mocks.state.properties = [];
    mocks.state.updates = [];
  });

  it('mirrors a catalog property name/price/category into the linked CMS listing', async () => {
    const categorySlug = (content.properties[0] as { categoryId: string }).categoryId;
    await syncCatalogPropertyToCms(
      mocks.client as never,
      { id: 'prop-1', name: 'New Name', categorySlug, price: '250.00' },
      'actor-1',
    );
    expect(mocks.state.upserts).toHaveLength(1);
    const written = mocks.state.upserts[0]!.content as typeof content;
    expect(written.properties[0]).toMatchObject({
      name: 'New Name',
      price: '250.00',
      categoryId: categorySlug,
    });
    expect(mocks.state.upserts[0]!.version).toBe(2);
  });

  it('unlinks the CMS listing when the catalog row is deleted', async () => {
    const originalName = content.properties[0]!.name;
    await syncCatalogPropertyToCms(
      mocks.client as never,
      { id: 'prop-1', name: originalName, categorySlug: 'x' },
      'actor-1',
      { clearCatalogLink: true },
    );
    const written = mocks.state.upserts[0]!.content as typeof content;
    expect(written.properties[0]).not.toHaveProperty('catalogId');
    expect(written.properties[0]!.name).toBe(originalName);
  });

  it('mirrors linked CMS listings into the catalog (exact-decimal price only)', async () => {
    const categorySlug = (content.properties[0] as { categoryId: string }).categoryId;
    mocks.state.properties = [
      { id: 'prop-1', name: 'Old Name', price: '100.00', categorySlug, status: 'ACTIVE' },
    ];
    const draft = structuredClone(content) as unknown as typeof content;
    draft.properties[0]!.name = 'CMS Name';
    draft.properties[0]!.price = '999.99';
    await syncCmsPropertiesToCatalog(mocks.client as never, draft as never, 'actor-1');
    expect(mocks.state.updates).toHaveLength(1);
    expect(mocks.state.updates[0]).toMatchObject({ id: 'prop-1' });
    expect(mocks.state.updates[0]!.patch).toEqual({ name: 'CMS Name', price: '999.99' });
  });

  it('preserves the catalog price when the CMS price is free text', async () => {
    const categorySlug = (content.properties[0] as { categoryId: string }).categoryId;
    mocks.state.properties = [
      {
        id: 'prop-1',
        name: content.properties[0]!.name,
        price: '100.00',
        categorySlug,
        status: 'ACTIVE',
      },
    ];
    const draft = structuredClone(content) as unknown as typeof content;
    draft.properties[0]!.price = 'Starting at P6,860/sqm';
    await syncCmsPropertiesToCatalog(mocks.client as never, draft as never, 'actor-1');
    expect(mocks.state.updates).toHaveLength(0);
  });

  it('skips CMS listings with no catalog row', async () => {
    mocks.state.properties = [];
    const draft = structuredClone(content) as unknown as typeof content;
    draft.properties[0]!.name = 'CMS Name';
    await syncCmsPropertiesToCatalog(mocks.client as never, draft as never, 'actor-1');
    expect(mocks.state.updates).toHaveLength(0);
  });
});
