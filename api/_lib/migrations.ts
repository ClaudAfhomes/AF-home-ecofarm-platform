/**
 * Migration bookkeeping (pure) shared by the `pnpm db:migrate` runner.
 *
 * Supabase migrations are plain `.sql` files named `<version>_<name>.sql`
 * where `<version>` is a 14-digit `YYYYMMDDHHMMSS` stamp. The runner records
 * applied versions in `supabase_migrations.schema_migrations` (the Supabase
 * CLI convention) and applies only the pending files in filename order.
 *
 * This module is intentionally free of I/O so the pending-resolution logic is
 * unit-testable (see migrations.spec.ts). The runner lives in
 * supabase/apply-migrations.ts and imports from here - the same cross-package
 * pattern as supabase/seed.ts importing api/_lib/auth.
 */

const VERSION_RE = /^(\d{14})_/;

/** The 14-digit version prefix of a migration filename, or null if absent. */
export function parseMigrationVersion(filename: string): string | null {
  const match = VERSION_RE.exec(filename);
  return match ? match[1]! : null;
}

/**
 * Files that still need applying: every file with a parseable version not
 * present in `applied`, preserving the given (filename-sorted) order.
 */
export function resolvePendingMigrations(
  files: readonly string[],
  applied: readonly string[],
): string[] {
  const appliedVersions = new Set(applied);
  return files.filter((file) => {
    const version = parseMigrationVersion(file);
    return version !== null && !appliedVersions.has(version);
  });
}
