import type { StaffModule } from '@jad/contracts';

import { getSupabaseEnv } from './env.js';
import { toErrorEnvelope } from './envelope.js';
import type { VercelRequest } from './http.js';
import { pickStaffRoleId, staffRoleModules } from './rbac.js';
import { anonClient as cachedAnonClient, serviceClient as cachedServiceClient } from './rest.js';

export type StaffAuthError = { error: ReturnType<typeof toErrorEnvelope> };
export type StaffAuthSuccess = { userId: string; slugs: string[] };

/** Normalize a role slug for comparison (case/separator-insensitive). */
export function canonicalSlug(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '_');
}

/** True when any slug matches the allow-list (compact `superadmin` also matches `super_admin`). */
export function slugsAllowed(slugs: string[], allowed: string[]): boolean {
  const forms = new Set<string>();
  for (const a of allowed.map(canonicalSlug)) {
    forms.add(a);
    forms.add(a.replace(/_/g, ''));
  }
  return slugs.some((s) => {
    const c = canonicalSlug(s);
    return forms.has(c) || forms.has(c.replace(/_/g, ''));
  });
}

/**
 * True when a Supabase Auth admin error is a duplicate-identity conflict.
 * GoTrue's message is "A user with this email address has already been
 * registered" (NOT "already exists" - a substring guard on the latter misses
 * every real conflict and leaks the raw message as INTERNAL 500). Matches
 * status, code, and message broadly so wording drift can't reopen the hole.
 */
export function isAuthConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as Record<string, unknown>;
  const code = String((rec as { code?: unknown }).code ?? '').toLowerCase();
  if (['email_exists', 'phone_exists', 'user_already_exists'].includes(code)) return true;
  const message = String((rec as { message?: unknown }).message ?? '');
  return /already been registered|already exists|duplicate|email_exists|phone_exists/i.test(
    message,
  );
}

type AdminListUsers = {
  auth: {
    admin: {
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: unknown[] };
        error: unknown;
      }>;
    };
  };
};

/** Normalize an email for comparison (Supabase Auth stores emails lowercased). */
function normEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** Normalize a phone for comparison (digits only, tolerant of country code vs leading 0). */
function normPhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** True when two digit strings are the same number (63… vs 0…, spacing, etc.). */
function samePhone(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Tolerant of +63-country-code vs leading-0 forms: compare the trailing
  // local digits (PH mobile numbers are 10 digits).
  const ca = a.length > 10 ? a.slice(-10) : a;
  const cb = b.length > 10 ? b.slice(-10) : b;
  if (ca === cb) return true;
  return a.endsWith(b) || b.endsWith(a);
}

/** True when the listed user row matches the requested email (primary or identity). */
function userMatchesEmail(
  u: { email?: unknown; identities?: { identity_data?: { email?: unknown } }[] },
  email: string,
): boolean {
  const wanted = normEmail(email);
  if (wanted && normEmail(u.email) === wanted) return true;
  if (Array.isArray(u.identities)) {
    return u.identities.some((id) => normEmail(id?.identity_data?.email) === wanted);
  }
  return false;
}

/**
 * Find an existing auth user by email or phone (orphan adoption after an
 * `isAuthConflict`). Emails compare case-insensitively (GoTrue stores them
 * lowercased) and fall back to identity emails; phones compare by digits
 * only. Paginates wide (perPage 1000) - the default 50-user page can miss
 * the account and falsely report it unresolvable.
 */
export async function findAuthUserId(
  svc: AdminListUsers,
  identity: { email?: string; phone?: string },
): Promise<string | null> {
  try {
    const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) return null;
    const users = data.users as {
      id: string;
      email?: unknown;
      phone?: unknown;
      identities?: { identity_data?: { email?: unknown } }[];
    }[];
    const hit = users.find((u) => {
      if (identity.email) return userMatchesEmail(u, identity.email);
      if (identity.phone) return samePhone(normPhone(u.phone), normPhone(identity.phone));
      return false;
    });
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

function headerValue(headers: VercelRequest['headers'], name: string): string | undefined {
  const raw = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === 'string') return raw;
  return undefined;
}

/** Bearer token from `Authorization` header, else the Supabase auth cookie. */
export function extractBearerToken(req: VercelRequest): string | undefined {
  const authHeader = headerValue(req.headers, 'authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookie = headerValue(req.headers, 'cookie') ?? '';
  const match = cookie.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (!match) return undefined;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed: unknown = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.access_token === 'string') return rec.access_token;
      const first = Array.isArray(parsed)
        ? (parsed[0] as Record<string, unknown> | undefined)
        : undefined;
      if (first && typeof first.access_token === 'string') return first.access_token;
    }
    return decoded;
  } catch {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return undefined;
    }
  }
}

type SupaClient = {
  auth: { getUser: (token: string) => Promise<{ data: { user: unknown }; error: unknown }> };
};

export type VerifyStaffDeps = {
  anonClient?: SupaClient;
  serviceClient?: { from: (table: string) => unknown };
};

/**
 * Authenticated-member gate for `/me/*` endpoints: validates the caller JWT
 * and returns the auth user id (which equals `Member.id` per the auth
 * foundation). No role check - RLS scopes rows to self + broadcasts.
 */
export async function verifyUser(
  req: VercelRequest,
  anonClient?: SupaClient,
): Promise<{ userId: string } | StaffAuthError> {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const token = extractBearerToken(req);
  if (!token) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Missing authentication', 401) };
  }
  const anon = anonClient ?? cachedAnonClient();
  if (!anon) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const { data, error } = await anon.auth.getUser(token);
  const authedUser = data?.user as { id?: string } | null;
  if (error || !authedUser?.id) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Invalid session', 401) };
  }
  return { userId: authedUser.id };
}

type SlugQueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => Promise<{ data: unknown[] | null; error: unknown }>;
      in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

export type StaffStanding = { status: string | null; mustChangePassword: boolean };

/**
 * Own staff standing (status + temporary-password flag) for `verifyStaff`
 * enforcement. Defensive: a missing row/column (pre-migration) or a read
 * failure resolves to "unknown" and does NOT block - only an explicit
 * DISABLED status or a true mustChangePassword flag denies. Same shape
 * always, never throws.
 */
export async function staffStanding(
  svc: { from: (table: string) => unknown },
  userId: string,
): Promise<StaffStanding> {
  const fallback: StaffStanding = { status: null, mustChangePassword: false };
  try {
    const from = svc.from.bind(svc) as (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => Promise<{ data?: unknown; error?: unknown }>;
      };
    };
    const res = (await from('StaffUser').select('status,mustChangePassword').eq('id', userId)) as {
      data?: unknown;
      error?: unknown;
    };
    if (!res || res.error) return fallback;
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
      Record<string, unknown> | undefined;
    if (!row) return fallback;
    return {
      status: typeof row.status === 'string' ? row.status : null,
      mustChangePassword: row.mustChangePassword === true,
    };
  } catch {
    return fallback;
  }
}

/**
 * Staff-domain role slugs: StaffAssignment (keyed by auth user id) → Role.
 * Preferred source (Phase 1 staff separation); empty when the caller holds
 * no staff assignment. Never throws - callers fall back to legacy links.
 */
export async function queryStaffSlugs(
  svc: { from: (table: string) => unknown },
  userId: string,
): Promise<string[]> {
  try {
    const from = svc.from.bind(svc) as SlugQueryClient['from'];
    const { data: rows, error } = await from('StaffAssignment')
      .select('roleId')
      .eq('staffUserId', userId);
    if (error || !Array.isArray(rows)) return [];
    const roleIds = (rows as Record<string, string>[])
      .map((r) => r.roleId ?? r.role_id ?? '')
      .filter(Boolean);
    if (roleIds.length === 0) return [];
    const { data: roles, error: roleErr } = await from('Role').select('slug').in('id', roleIds);
    if (roleErr || !Array.isArray(roles)) return [];
    return (roles as { slug?: unknown }[])
      .map((r) => r.slug)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Staff gate for admin Functions: validates the caller JWT, resolves
 * StaffAssignment → Role slugs via service_role, and requires a slug match
 * against `allowed` (e.g. `['super_admin', 'admin']`). Member tables are
 * never consulted (Phase 5 staff separation). No metadata fallback:
 * `user_metadata` is client-writable, so an unlinked caller is always
 * denied. Returns the resolved slugs so callers can audit with the actor role.
 */
export async function verifyStaff(
  req: VercelRequest,
  allowed: string[],
  deps?: VerifyStaffDeps,
): Promise<StaffAuthSuccess | StaffAuthError> {
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const token = extractBearerToken(req);
  if (!token) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Missing authentication', 401) };
  }
  const anon = deps?.anonClient ?? cachedAnonClient();
  if (!anon) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const { data, error } = await anon.auth.getUser(token);
  const authedUser = data?.user as { id?: string; user_metadata?: Record<string, unknown> } | null;
  if (error || !authedUser?.id) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Invalid session', 401) };
  }
  if (!serviceKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Service role not configured', 500) };
  }
  const svc = deps?.serviceClient ?? cachedServiceClient();
  if (!svc) {
    return { error: toErrorEnvelope('INTERNAL', 'Service role not configured', 500) };
  }
  const standing = await staffStanding(svc, authedUser.id);
  if (standing.status === 'DISABLED') {
    return { error: toErrorEnvelope('FORBIDDEN', 'Account disabled.', 403) };
  }
  if (standing.mustChangePassword) {
    return {
      error: toErrorEnvelope('FORBIDDEN', 'Password change required before continuing.', 403),
    };
  }
  const slugs = await queryStaffSlugs(svc, authedUser.id);
  if (slugs.length > 0) {
    if (slugsAllowed(slugs, allowed)) return { userId: authedUser.id, slugs };
    return { error: toErrorEnvelope('FORBIDDEN', 'Insufficient role', 403) };
  }
  return { error: toErrorEnvelope('FORBIDDEN', 'Admin access required', 403) };
}

/**
 * Module-gated staff authorization (custom-role support). Keeps the
 * endpoint's legacy slug allow-list AND additionally authorizes a
 * custom-role holder when the caller's role holds the required module.
 * Governance endpoints stay slug-only (verifyStaff) so custom roles can
 * never escalate there.
 *
 * Behavior for system roles is identical to verifyStaff - the slug branch
 * is checked first, so allow-lists the UI matrix doesn't mirror (e.g.
 * finance on vouchers) keep working without matrix changes.
 */
export async function verifyStaffModule(
  req: VercelRequest,
  module: StaffModule,
  fallbackSlugs: readonly string[] = [],
  deps?: VerifyStaffDeps,
): Promise<StaffAuthSuccess | StaffAuthError> {
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const token = extractBearerToken(req);
  if (!token) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Missing authentication', 401) };
  }
  const anon = deps?.anonClient ?? cachedAnonClient();
  if (!anon) {
    return { error: toErrorEnvelope('INTERNAL', 'Supabase not configured', 500) };
  }
  const { data, error } = await anon.auth.getUser(token);
  const authedUser = data?.user as { id?: string } | null;
  if (error || !authedUser?.id) {
    return { error: toErrorEnvelope('UNAUTHORIZED', 'Invalid session', 401) };
  }
  if (!serviceKey) {
    return { error: toErrorEnvelope('INTERNAL', 'Service role not configured', 500) };
  }
  const svc = deps?.serviceClient ?? cachedServiceClient();
  if (!svc) {
    return { error: toErrorEnvelope('INTERNAL', 'Service role not configured', 500) };
  }
  const standing = await staffStanding(svc, authedUser.id);
  if (standing.status === 'DISABLED') {
    return { error: toErrorEnvelope('FORBIDDEN', 'Account disabled.', 403) };
  }
  if (standing.mustChangePassword) {
    return {
      error: toErrorEnvelope('FORBIDDEN', 'Password change required before continuing.', 403),
    };
  }
  const slugs = await queryStaffSlugs(svc, authedUser.id);
  if (slugs.length === 0) {
    return { error: toErrorEnvelope('FORBIDDEN', 'Admin access required', 403) };
  }
  // Legacy slug branch first: system roles keep exactly today's access.
  if (fallbackSlugs.length > 0 && slugsAllowed(slugs, [...fallbackSlugs])) {
    return { userId: authedUser.id, slugs };
  }
  // Custom-role branch: the caller's role must hold the required module.
  const roleId = pickStaffRoleId(slugs);
  if (!roleId) {
    return { error: toErrorEnvelope('FORBIDDEN', 'Insufficient role', 403) };
  }
  const modules = await staffRoleModules(svc, roleId);
  if (!modules.includes(module)) {
    return { error: toErrorEnvelope('FORBIDDEN', 'Insufficient role', 403) };
  }
  return { userId: authedUser.id, slugs };
}
