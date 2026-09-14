import { STAFF_PERMISSIONS, staffModuleSchema, type StaffRole } from '@jad/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbQuery = any;

type Db = {
  from: (table: string) => {
    select: (cols: string) => DbQuery;
  };
};

/** Slugs that never confer shell access. */
export const MEMBER_SLUGS = ['member_basic', 'member_qualified', 'user'];

/** Priority order when a member holds several staff-capable roles. */
const STAFF_PRIORITY = ['super_admin', 'admin', 'finance', 'merchant'];

function canonical(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

/** Pick the effective staff role id from a member's slugs (null = no access). */
export function pickStaffRoleId(slugs: string[]): string | null {
  const lowered = slugs.map(canonical);
  for (const want of STAFF_PRIORITY) {
    if (lowered.includes(want)) return want;
  }
  const custom = slugs.find((s) => {
    const c = canonical(s);
    return c !== '' && !MEMBER_SLUGS.includes(c) && !STAFF_PRIORITY.includes(c);
  });
  return custom ?? null;
}

export type DbRole = { id: string; key: string | null; slug: string; name: string; permissions: unknown; is_system: boolean };

/**
 * Effective permission modules for a role row. Stored modules win when
 * present. Canonical system roles (`super_admin/admin/finance/merchant`)
 * fall back to the `STAFF_PERMISSIONS` matrix when the stored array is
 * empty — seed/provision scripts can create the row without permissions, and
 * without this the API (and every role select) would treat the role as
 * nonexistent. Custom roles keep their stored set (possibly empty).
 */
export function effectivePermissions(slugOrKey: string, stored: unknown): string[] {
  const valid = (Array.isArray(stored) ? stored : []).filter(
    (p): p is string =>
      typeof p === 'string' && (staffModuleSchema.options as readonly string[]).includes(p),
  );
  if (valid.length > 0) return valid;
  const canon = String(slugOrKey ?? '')
    .trim()
    .toLowerCase();
  const compact = canon.replace(/_/g, '');
  for (const sys of Object.keys(STAFF_PERMISSIONS) as StaffRole[]) {
    if (sys === canon || sys.replace(/_/g, '') === compact) {
      return [...STAFF_PERMISSIONS[sys]];
    }
  }
  return [];
}

async function roleRows(svc: Db): Promise<DbRole[]> {
  const { data, error } = await svc.from('Role').select('id,key,slug,name,permissions,is_system');
  if (error || !Array.isArray(data)) return [];
  return data as DbRole[];
}

/** All roles as records (key preferred, slug fallback). */
export async function listRoleRecords(svc: Db) {
  const rows = await roleRows(svc);
  return rows.map((r) => ({
    id: typeof r.key === 'string' && r.key ? r.key : r.slug,
    name: r.name,
    permissions: effectivePermissions(r.slug ?? r.key ?? '', r.permissions),
    isSystem: r.is_system === true,
    _uuid: r.id,
  }));
}

/**
 * Effective permission modules for a single role id (single source for
 * server-side custom-role authorization AND `GET /admin/session` identity).
 * Stored modules win; canonical system roles fall back to the
 * `STAFF_PERMISSIONS` matrix when the stored array is empty. Unknown ids
 * resolve to no modules (deny by default).
 */
export async function staffRoleModules(
  svc: { from: (table: string) => unknown },
  roleId: string,
): Promise<string[]> {
  const rows = await roleRows(svc as Db);
  const row = rows.find(
    (r) =>
      (typeof r.key === 'string' && r.key ? r.key : r.slug) === roleId || r.slug === roleId,
  );
  if (!row) return effectivePermissions(roleId, undefined);
  return effectivePermissions(row.slug ?? row.key ?? '', row.permissions);
}

/** Staff slugs held by a staff user (via StaffAssignment links — Phase 1 staff domain). */
export async function staffAssignmentSlugs(svc: Db, staffUserId: string): Promise<string[]> {
  const { data: links, error } = await svc.from('StaffAssignment').select('roleId').eq('staffUserId', staffUserId);
  if (error || !Array.isArray(links)) return [];
  const ids = (links as { roleId?: string; role_id?: string }[])
    .map((l) => l.roleId ?? l.role_id ?? '')
    .filter(Boolean);
  if (ids.length === 0) return [];
  const { data: matched } = await svc.from('Role').select('id,slug');
  const slugs: string[] = [];
  for (const row of ((matched as { id: string; slug: string }[] | null) ?? [])) {
    if (ids.includes(row.id) && typeof row.slug === 'string') slugs.push(row.slug);
  }
  return slugs;
}

export type StaffEntry = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  createdBy: string;
};

/**
 * All staff users holding at least one staff role, mapped to the directory
 * shape (Phase 1 staff domain — reads StaffUser, never Member).
 * `createdBy` is not stored — reported as `System` (documented).
 */
export async function listStaffEntries(svc: Db): Promise<StaffEntry[]> {
  const { data: users, error } = await svc.from('StaffUser').select('*');
  if (error || !Array.isArray(users)) return [];
  const { data: links } = await svc.from('StaffAssignment').select('staffUserId,roleId');
  const { data: roles } = await svc.from('Role').select('id,slug');
  const slugById = new Map(
    (((roles as { id: string; slug: string }[] | null) ?? []).map((r) => [r.id, r.slug])),
  );
  const slugsByUser = new Map<string, string[]>();
  for (const l of ((links as { staffUserId?: string; staff_user_id?: string; roleId?: string; role_id?: string }[] | null) ?? [])) {
    const uid = l.staffUserId ?? l.staff_user_id ?? '';
    const slug = slugById.get(l.roleId ?? l.role_id ?? '') ?? '';
    if (!uid || !slug) continue;
    const list = slugsByUser.get(uid) ?? [];
    list.push(slug);
    slugsByUser.set(uid, list);
  }
  const entries: StaffEntry[] = [];
  for (const u of (users as Record<string, unknown>[])) {
    const id = String(u.id ?? '');
    const roleId = pickStaffRoleId(slugsByUser.get(id) ?? []);
    if (!roleId) continue;
    entries.push({
      id,
      name: String(u.name ?? ''),
      email: String(u.email ?? ''),
      roleId,
      status: u.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : new Date().toISOString(),
      createdBy: 'System',
    });
  }
  return entries;
}
