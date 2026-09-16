import { z } from 'zod';

/**
 * Platform account roles - Phase 1 fresh-start (Supabase Auth).
 * DEVELOPMENT/PHASE-1 scope: only `admin` and `user` are active.
 * Leaves clean path for PostgreSQL/RLS-based authorization later.
 * Legacy values (`MEMBER`, `SUPER_ADMIN`, `member_basic`, etc.) are normalized
 * for backward compat with existing Supabase rows and mock data.
 */
export const roleSchema = z.enum(['admin', 'user']);

export type Role = z.infer<typeof roleSchema>;

/**
 * Normalize raw role values from DB/auth to canonical `admin`/`user`.
 * Handles legacy slugs: `super_admin`, `super-admin`, `SUPER_ADMIN` → `admin`;
 * `member`, `MEMBER`, `member_basic`, `member_qualified` → `user`.
 * Unknown values fall back to `user`.
 */
export function normalizeRole(raw: unknown): Role {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '_');
  if (normalized === 'admin' || normalized === 'super_admin' || normalized === 'superadmin')
    return 'admin';
  if (
    normalized === 'user' ||
    normalized === 'member' ||
    normalized === 'member_basic' ||
    normalized === 'member_qualified'
  )
    return 'user';
  // compact check for SUPERADMIN without underscore
  if (normalized.replace(/_/g, '') === 'superadmin') return 'admin';
  return 'user';
}
