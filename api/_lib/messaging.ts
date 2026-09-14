import { messageSchema } from '@jad/contracts';

/**
 * Admin↔member messaging helpers (ADR-013, FEAT-072): snake→camel row
 * mappers (idempotent `??` fallbacks, like api/_lib/mappers.ts) plus the
 * cursor-page helper shared by the member and admin thread endpoints.
 */

export function mapMessageRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    senderType: row.senderType ?? row.sender_type,
    senderName: row.senderName ?? row.sender_name,
    body: row.body,
    createdAt: row.createdAt ?? row.created_at,
  };
}

export function isValidMessageRow(row: Record<string, unknown>): boolean {
  return messageSchema.safeParse(row).success;
}

export function mapConversationRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    memberId: row.memberId ?? row.member_id,
    lastMessageAt: row.lastMessageAt ?? row.last_message_at ?? undefined,
    memberUnread:
      typeof row.memberUnread === 'number'
        ? row.memberUnread
        : typeof row.member_unread === 'number'
          ? row.member_unread
          : 0,
    staffUnread:
      typeof row.staffUnread === 'number'
        ? row.staffUnread
        : typeof row.staff_unread === 'number'
          ? row.staff_unread
          : 0,
  };
}

/** Ledger-style cursor page over an already-ordered row array (cursor = last id). */
export function paginateByCursor<T extends { id?: unknown }>(
  rows: T[],
  cursor: string | undefined,
  limit: number,
): { page: T[]; nextCursor: string | undefined } {
  const startIndex = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
  const page = rows.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < rows.length;
  const last = page[page.length - 1];
  return { page, nextCursor: hasMore && typeof last?.id === 'string' ? last.id : undefined };
}

/** Page clamp shared by collection endpoints (default 50, max 100). */
export function clampLimit(raw: unknown, fallback = 50): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100) : fallback;
}
