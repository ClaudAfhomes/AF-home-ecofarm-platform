/**
 * Server-side audit writer for api/ mutating handlers.
 * Appends to the `AuditLog` table (see supabase/migrations/*_audit_log.sql).
 * Never throws - audit failure must not break the request it records; errors
 * are logged server-side only.
 */
export type AuditEntry = {
  action: string;
  actorId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  detail?: string;
};

/**
 * Minimal table handle - structurally satisfied by both the real Supabase
 * client and unit-test fakes.
 */
export type AuditTable = {
  insert: (row: Record<string, unknown>) => PromiseLike<unknown>;
};

export async function appendAudit(
  client: { from: (table: string) => AuditTable },
  entry: AuditEntry,
): Promise<void> {
  try {
    const result = (await client.from('AuditLog').insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole ?? null,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_name: entry.targetName ?? null,
      detail: entry.detail ?? null,
      created_at: new Date().toISOString(),
    })) as { error?: { message?: string } | null } | null | undefined;
    const message = result?.error?.message;
    if (message) {
      console.error('[audit] append failed:', message);
    }
  } catch (e) {
    console.error('[audit] append threw:', (e as Error)?.message ?? e);
  }
}
