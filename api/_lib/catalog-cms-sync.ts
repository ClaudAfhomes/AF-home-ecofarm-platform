import type { PropertiesContent } from '@jad/contracts';
import { propertiesContentSchema } from '@jad/contracts';

import type { serviceClient } from './rest.js';

/**
 * Catalog <-> CMS properties reconciliation.
 *
 * The catalog (`Property` table) owns identity, price, category, and status;
 * the Website CMS (`cms_contents.properties`) owns presentation and may link
 * a listing via `catalogId` (or the listing `id` when it matches the catalog
 * id). Both admin editors are expected to stay consistent:
 *
 * - Catalog create/update/delete mirrors `name` / `price` / `category` into
 *   the linked CMS listing (never creates/fabricates a CMS listing).
 * - A CMS `properties` save mirrors `name` / `price` / `category` into the
 *   linked catalog row (never creates a catalog row).
 *
 * Price rule: the catalog is exact-decimal (`^[0-9]+(\.[0-9]{1,2})?$`). CMS
 * prices are free text ("Starting at P6,860/sqm"); a CMS value only flows
 * into the catalog when it is empty or exact-decimal, otherwise the catalog
 * price is preserved and the difference is logged.
 */

type CmsClient = NonNullable<ReturnType<typeof serviceClient>>;

const EXACT_DECIMAL_RE = /^[0-9]+(?:\.[0-9]{1,2})?$/;

function isExactDecimal(value: string | undefined): boolean {
  return value !== undefined && value !== '' && EXACT_DECIMAL_RE.test(value.trim());
}

export interface CatalogPropertySnapshot {
  id: string;
  name: string;
  categorySlug: string;
  price?: string | null;
  status?: string;
}

async function broadcastCmsUpdate(
  supabase: CmsClient,
  key: string,
  version: number,
): Promise<void> {
  try {
    const channel = supabase.channel('cms:public', {
      config: { broadcast: { ack: false } },
    } as never);
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        void channel
          .send({ type: 'broadcast', event: 'cms_update', payload: { key, version } } as never)
          .then(() => {
            setTimeout(() => {
              void supabase.removeChannel(channel);
            }, 1000);
          });
      }
    });
  } catch (e) {
    console.error(`[cms-sync] realtime broadcast failed for ${key}:`, (e as Error).message);
  }
}

async function readPropertiesContent(supabase: CmsClient): Promise<{
  content: PropertiesContent;
  version: number;
} | null> {
  const { data } = await supabase
    .from('cms_contents')
    .select('content, version')
    .eq('key', 'properties')
    .maybeSingle();
  if (!data) return null;
  const row = data as { content: unknown; version: number };
  const parsed = propertiesContentSchema.safeParse(row.content);
  if (!parsed.success) {
    console.error('[cms-sync] stored properties CMS content failed validation; skipping sync');
    return null;
  }
  return { content: parsed.data, version: row.version ?? 1 };
}

async function writePropertiesContent(
  supabase: CmsClient,
  content: PropertiesContent,
  version: number,
  actorId: string,
): Promise<boolean> {
  const { error } = await supabase.from('cms_contents').upsert(
    {
      key: 'properties',
      content,
      version,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) {
    console.error('[cms-sync] failed to write properties CMS content:', error.message);
    return false;
  }
  await broadcastCmsUpdate(supabase, 'properties', version);
  return true;
}

/** CMS category slug to mirror into the catalog for a CMS listing. */
function catalogCategoryForListing(
  content: PropertiesContent,
  cmsCategoryId: string,
): string | undefined {
  const category = content.categories.find((candidate) => candidate.slug === cmsCategoryId);
  if (!category) return undefined;
  return category.catalogSlug ?? category.slug;
}

/**
 * Mirror a catalog property (create/update) into the linked CMS listing.
 * No-op when no CMS listing links this property. `clearCatalogLink` unlinks
 * a deleted catalog row without touching the CMS-owned presentation.
 */
export async function syncCatalogPropertyToCms(
  supabase: CmsClient,
  property: CatalogPropertySnapshot,
  actorId: string,
  options?: { clearCatalogLink?: boolean },
): Promise<void> {
  const current = await readPropertiesContent(supabase);
  if (!current) return;
  const links = (listing: PropertiesContent['properties'][number]) =>
    (listing.catalogId ?? listing.id) === property.id;
  const index = current.content.properties.findIndex(links);
  if (index === -1) return;

  const listing = current.content.properties[index]!;
  const next = { ...listing };
  if (options?.clearCatalogLink) {
    delete next.catalogId;
  } else {
    next.name = property.name;
    if (property.price != null && property.price !== '') next.price = property.price;
    else delete next.price;
    const cmsCategory = current.content.categories.find(
      (category) =>
        category.catalogSlug === property.categorySlug || category.slug === property.categorySlug,
    );
    if (cmsCategory) next.categoryId = cmsCategory.slug;
  }
  const categories = current.content.categories;
  const properties = [...current.content.properties];
  properties[index] = next;
  const content: PropertiesContent = { ...current.content, categories, properties };
  await writePropertiesContent(supabase, content, current.version + 1, actorId);
}

/**
 * Mirror linked CMS listings into the catalog. Called after a CMS
 * `properties` save; only fields the catalog owns are written (name, price
 * when exact-decimal, category). Listings without a catalog row are skipped.
 */
export async function syncCmsPropertiesToCatalog(
  supabase: CmsClient,
  content: PropertiesContent,
  actorId: string,
): Promise<void> {
  const linked = content.properties
    .map((listing) => ({
      listing,
      catalogId: listing.catalogId ?? listing.id,
    }))
    .filter((entry) => Boolean(entry.catalogId));
  if (linked.length === 0) return;

  const { data } = await supabase.from('Property').select('id, name, price, categorySlug, status');
  const rows = ((data as unknown[]) ?? []) as CatalogPropertySnapshot[];
  for (const { listing, catalogId } of linked) {
    const existing = rows.find((row) => row.id === catalogId);
    if (!existing) continue;
    const patch: Record<string, unknown> = {};
    if (listing.name && listing.name !== existing.name) patch.name = listing.name;
    const cmsPrice = listing.price?.trim();
    if (cmsPrice !== undefined && cmsPrice !== '' && isExactDecimal(cmsPrice)) {
      if (cmsPrice !== existing.price) patch.price = cmsPrice;
    } else if (cmsPrice && !isExactDecimal(cmsPrice)) {
      console.warn(
        `[cms-sync] CMS price for ${catalogId} is not exact-decimal ("${cmsPrice}"); catalog price preserved`,
      );
    }
    const categorySlug = catalogCategoryForListing(content, listing.categoryId);
    if (categorySlug && categorySlug !== existing.categorySlug) patch.categorySlug = categorySlug;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from('Property').update(patch).eq('id', catalogId);
    if (error) {
      console.error(`[cms-sync] failed to sync catalog property ${catalogId}:`, error.message);
    } else {
      console.log(
        `[cms-sync] catalog property ${catalogId} updated from CMS by ${actorId}: ${Object.keys(patch).join(', ')}`,
      );
    }
  }
}
