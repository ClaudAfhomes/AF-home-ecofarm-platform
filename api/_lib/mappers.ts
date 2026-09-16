import { forwardableContentSchema, notificationSchema } from '@jad/contracts';

/**
 * Row mappers: Supabase snake_case rows → contract camelCase shapes.
 * Pure functions - unit-tested; handlers filter mapped rows through the
 * contract schemas so malformed rows never reach clients.
 *
 * Mappers are idempotent: each renamed field also accepts its already-mapped
 * camelCase key (`??` fallback). List handlers map first and validate after,
 * so a mapper that only reads raw keys would silently drop every valid row
 * on the second pass - the fallbacks make validate-after-map safe.
 */

export function mapNotificationRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? undefined,
    createdAt: row.created_at ?? row.createdAt,
    readAt: row.read_at ?? row.readAt ?? undefined,
  };
}

export function isValidNotificationRow(row: Record<string, unknown>): boolean {
  return notificationSchema.safeParse(mapNotificationRow(row)).success;
}

export function mapContentItemRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    kind: row.kind,
    downloadUrl: row.download_url ?? row.downloadUrl ?? undefined,
    share: (row.share as Record<string, string> | null) ?? undefined,
    createdAt: row.created_at ?? row.createdAt,
  };
}

export function isValidContentItemRow(row: Record<string, unknown>): boolean {
  return forwardableContentSchema.safeParse(mapContentItemRow(row)).success;
}
