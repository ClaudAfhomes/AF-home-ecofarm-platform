/**
 * Schema self-check for the messaging feature (ADR-013, FEAT-072).
 *
 * The API queries `Conversation`/`Message` via PostgREST. When the
 * migrations are missing the schema cache, PostgREST returns PGRST205 and
 * every messaging endpoint fails with INTERNAL. `findMissingSchemaRelations`
 * probes the required relations and reports any the schema cache cannot
 * resolve, so the dev server (and tests) can fail loudly at startup instead
 * of at runtime. Pure + client-shaped for unit testing (schema-check.spec.ts).
 */

export const REQUIRED_MESSAGING_RELATIONS = ['Conversation', 'Message'] as const;

/** PostgREST PGRST205: the relation is not in the schema cache. */
export function isMissingTableError(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    (typeof error.message === 'string' && error.message.includes('Could not find the table'))
  );
}

export interface RelationProbe {
  select(columns: string): {
    limit(count: number): Promise<{ error?: { code?: unknown; message?: unknown } | null }>;
  };
}

export interface SchemaProbeClient {
  from(table: string): RelationProbe;
}

/** Relations the schema cache cannot resolve, in the order given. */
export async function findMissingSchemaRelations(
  client: SchemaProbeClient,
  relations: readonly string[] = REQUIRED_MESSAGING_RELATIONS,
): Promise<string[]> {
  const missing: string[] = [];
  for (const relation of relations) {
    const { error } = await client.from(relation).select('*').limit(1);
    if (isMissingTableError(error)) missing.push(relation);
  }
  return missing;
}