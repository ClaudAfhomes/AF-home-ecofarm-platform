import { describe, expect, it } from 'vitest';

import {
  REQUIRED_MESSAGING_RELATIONS,
  findMissingSchemaRelations,
  isMissingTableError,
} from './schema-check.js';

const missing = (table: string) => ({
  code: 'PGRST205',
  message: `Could not find the table 'public.${table}' in the schema cache`,
});

function probeClient(errors: Record<string, unknown>) {
  return {
    from: (table: string) => ({
      select: () => ({
        limit: async () => ({ error: errors[table] ?? null }),
      }),
    }),
  };
}

describe('isMissingTableError', () => {
  it('recognizes PostgREST PGRST205 and schema-cache messages', () => {
    expect(isMissingTableError({ code: 'PGRST205', message: 'x' })).toBe(true);
    expect(
      isMissingTableError({ message: "Could not find the table 'public.Conversation' in the schema cache" }),
    ).toBe(true);
  });

  it('ignores null and unrelated errors', () => {
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
  });
});

describe('findMissingSchemaRelations', () => {
  it('reports every required relation the schema cache cannot resolve', async () => {
    const client = probeClient({
      Conversation: missing('Conversation'),
      Message: missing('Message'),
    });
    expect(await findMissingSchemaRelations(client)).toEqual(['Conversation', 'Message']);
  });

  it('returns an empty list when all relations resolve', async () => {
    expect(await findMissingSchemaRelations(probeClient({}))).toEqual([]);
  });

  it('reports only the missing relation when the rest resolve', async () => {
    const client = probeClient({ Message: missing('Message') });
    expect(await findMissingSchemaRelations(client)).toEqual(['Message']);
  });
});

describe('REQUIRED_MESSAGING_RELATIONS', () => {
  it('covers the messaging tables', () => {
    expect([...REQUIRED_MESSAGING_RELATIONS].sort()).toEqual(['Conversation', 'Message']);
  });
});