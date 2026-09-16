import { describe, expect, it } from 'vitest';

import { parseMigrationVersion, resolvePendingMigrations } from './migrations.js';

const M1 = '20261008000001_messaging.sql';
const M2 = '20261008000002_member_purge_messaging.sql';
const M3 = '20261008000003_messaging_role_backfill.sql';

describe('parseMigrationVersion', () => {
  it('extracts the 14-digit version prefix from a migration filename', () => {
    expect(parseMigrationVersion(M1)).toBe('20261008000001');
    expect(parseMigrationVersion('20260829000001_auth_foundation.sql')).toBe('20260829000001');
  });

  it('returns null for non-migration files', () => {
    expect(parseMigrationVersion('README.md')).toBeNull();
    expect(parseMigrationVersion('no_version.sql')).toBeNull();
  });
});

describe('resolvePendingMigrations', () => {
  it('returns every migration in filename order when none are applied', () => {
    expect(resolvePendingMigrations([M1, M2, M3], [])).toEqual([M1, M2, M3]);
  });

  it('skips versions already recorded in the applied set', () => {
    expect(resolvePendingMigrations([M1, M2, M3], ['20261008000001'])).toEqual([M2, M3]);
    expect(resolvePendingMigrations([M1, M2, M3], ['20261008000001', '20261008000003'])).toEqual([
      M2,
    ]);
  });

  it('preserves order and ignores files without a parseable version', () => {
    expect(resolvePendingMigrations(['z_last.sql', M1, 'a_note.sql', M2], [])).toEqual([M1, M2]);
  });
});
