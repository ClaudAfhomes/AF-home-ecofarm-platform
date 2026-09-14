import { z } from 'zod';

/**
 * Staff roles for admin-shell RBAC — frontend/UI-UX pass (static mocks).
 * Distinct from the session `Role` (`admin`/`user` in `./role.js`), which
 * remains the authentication gate. `StaffRole` drives per-module visibility
 * in the admin shell. Exactly one staff role per staff user.
 *
 * SSOT: docs/business/BUSINESS-RULES.md #3 (Admin / Finance / Super Admin /
 * Merchant capabilities), docs/ui-ux/UI-UX.md #6.2 screen register,
 * docs/architecture/API-SPECIFICATION.md #6 endpoint inventory. Frontend
 * visibility is never authorization — the real backend enforces every
 * request server-side.
 */
export const staffRoleSchema = z.enum(['super_admin', 'admin', 'finance', 'merchant']);

export type StaffRole = z.infer<typeof staffRoleSchema>;

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  finance: 'Finance',
  merchant: 'Merchant',
};

/**
 * Admin-shell modules (one key per nav destination family). Keys are stable
 * module identifiers — they intentionally do not embed route paths, which
 * are still PROPOSED (no SSOT defines admin route paths yet).
 */
export const staffModuleSchema = z.enum([
  'dashboard',
  'registrations',
  'members',
  'sales',
  'payouts',
  'withdrawals',
  'vouchers',
  'properties',
  'marketing_tools',
  'policies',
  'config',
  'programs',
  'audit',
  'staff',
  'cms',
]);

export type StaffModule = z.infer<typeof staffModuleSchema>;

/**
 * Permission matrix: modules visible to each system staff role. This is the
 * system-role seed — the single source for default permissions. Custom
 * roles are `RoleRecord`s whose permissions start as a copy of (or a blank
 * set edited from) these rows; the seed itself never changes at runtime.
 *
 * - super_admin: everything (BUSINESS-RULES #3: all Admin/Finance +
 *   configure params + financial adjustments + recovery).
 * - admin: operational modules + content/catalog + CMS + staff-facing queues.
 *   NOT config/programs (SUP-only configure params, PATCH /config SUP),
 *   NOT audit (GET /audit-log SUP), NOT staff (governance, SUP-only).
 * - finance: sales queue + payouts + withdrawals only (UI-UX #6.2: Finance
 *   sees Sales queue + Withdrawals, NOT Adjustments/Config).
 * - merchant: vouchers redemption scope only (BUSINESS-RULES #3 Merchant:
 *   redeem vouchers online via JAD only).
 */
export const STAFF_PERMISSIONS: Record<StaffRole, readonly StaffModule[]> = {
  super_admin: [
    'dashboard',
    'registrations',
    'members',
    'sales',
    'payouts',
    'withdrawals',
    'vouchers',
    'properties',
    'marketing_tools',
    'policies',
    'config',
    'programs',
    'audit',
    'staff',
    'cms',
  ],
  admin: [
    'dashboard',
    'registrations',
    'members',
    'sales',
    'payouts',
    'withdrawals',
    'vouchers',
    'properties',
    'marketing_tools',
    'policies',
    'cms',
  ],
  finance: ['dashboard', 'sales', 'payouts', 'withdrawals'],
  merchant: ['vouchers'],
};

/** Module visibility check for a staff role (`null` role sees nothing). */
export function canStaffAccess(staffRole: StaffRole | null, module: StaffModule): boolean {
  if (staffRole === null) return false;
  return STAFF_PERMISSIONS[staffRole].includes(module);
}

/**
 * Role record: the permission unit of true RBAC. One staff member holds
 * exactly one role; many members may share a role; permissions belong to
 * the role, never to individual users (no per-user overrides).
 *
 * System roles (`isSystem`, ids equal to the `StaffRole` enum values) seed
 * from `STAFF_PERMISSIONS` and carry the SSOT guarantees; custom roles
 * (`role-<slug>` ids) are administrator-defined and always audited.
 */
/**
 * Role catalog domain (Phase 1 staff separation): staff slugs
 * (`super_admin/admin/finance/merchant`) vs member-tier slugs. Optional so
 * pre-split fixtures still validate; writers always set it.
 */
export const staffDomainSchema = z.enum(['member', 'staff']);

export type StaffDomain = z.infer<typeof staffDomainSchema>;

export const roleRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  permissions: z.array(staffModuleSchema).min(1),
  isSystem: z.boolean(),
  domain: staffDomainSchema.optional(),
});

export type RoleRecord = z.infer<typeof roleRecordSchema>;

/** Staff access standing — stored on StaffUser.status (Phase 1 staff domain). */
export const staffStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

export type StaffStatus = z.infer<typeof staffStatusSchema>;

/**
 * Staff password rule (ASSUMPTION 1 — no approved credential policy; the
 * 8-character minimum mirrors the member registration UI assumption).
 * Applies to super-admin-set temporary passwords and staff-chosen passwords.
 */
export const staffPasswordSchema = z.string().min(8).max(72);

export type StaffPassword = z.infer<typeof staffPasswordSchema>;

/** `POST /admin/staff` — create a staff account with a temporary password (FR-ADM). */
export const createStaffRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  roleId: z.string().min(1),
  temporaryPassword: staffPasswordSchema,
  actor: z.string().min(1).optional(),
  actorRole: z.string().min(1).optional(),
});

export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;

/** `PATCH /admin/session` — the signed-in staff member updates their own display name. */
export const updateStaffProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type UpdateStaffProfileRequest = z.infer<typeof updateStaffProfileRequestSchema>;

/** `POST /admin/session/password` — change own password (current verified server-side). */
export const changeStaffPasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: staffPasswordSchema,
});

export type ChangeStaffPasswordRequest = z.infer<typeof changeStaffPasswordRequestSchema>;

/**
 * Staff identity — internal user profile, separate from Member (Phase 1
 * staff separation). Keyed by the auth user id; owns no financial,
 * genealogy, or member data by construction.
 */
export const staffUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  status: staffStatusSchema,
  createdAt: z.string(),
  /**
   * True while the account still runs on a super-admin-set temporary
   * password — the holder must change it before using the admin shell.
   * Optional so pre-flag fixtures still validate; writers always set it.
   */
  mustChangePassword: z.boolean().optional(),
});

export type StaffUser = z.infer<typeof staffUserSchema>;

/** Staff role assignment — replaces MemberRole for staff users. */
export const staffAssignmentSchema = z.object({
  staffUserId: z.string().min(1),
  roleId: z.string().min(1),
  assignedAt: z.string(),
});

export type StaffAssignment = z.infer<typeof staffAssignmentSchema>;

/**
 * Staff session — `GET /admin/session` (Phase 6). Server-resolved via
 * service_role so admin clients never read Role tables with the anon key.
 */
export const staffSessionSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  status: staffStatusSchema,
  slugs: z.array(z.string().min(1)),
  /** Mirrors StaffUser.mustChangePassword; drives the forced-change gate. */
  mustChangePassword: z.boolean().optional(),
  /**
   * Server-resolved role identity (record key/slug, display name, effective
   * permission modules). Optional so pre-resolution fixtures and mock
   * sessions — which lack a resolving server — still validate; writers
   * (the real `GET /admin/session`) always set them. Lets the admin shell
   * render the signed-in staff member's role name and navigation without
   * fetching the super_admin-only role catalog for self-resolution.
   */
  roleId: z.string().min(1).optional(),
  roleName: z.string().min(1).optional(),
  modules: z.array(staffModuleSchema).optional(),
});

export type StaffSession = z.infer<typeof staffSessionSchema>;

/**
 * Staff directory entry — a Member holding exactly one role.
 * Served by `GET /admin/staff[/:id]`; `roleId` is the role key (system id or
 * custom `role-<slug>`).
 */
export const staffMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  roleId: z.string().min(1),
  status: staffStatusSchema,
  createdAt: z.string(),
  createdBy: z.string().min(1),
});

export type StaffMember = z.infer<typeof staffMemberSchema>;

/**
 * Audit log entry — served by `GET /admin/audit-log`, written by
 * `api/_lib/audit.ts` on every mutating admin call.
 */
export const auditLogEntrySchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  actor: z.string().min(1),
  actorRole: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  targetName: z.string().min(1),
  detail: z.string(),
  createdAt: z.string(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

/** System role records built from the matrix seed (single source). */
export function systemRoleRecords(): RoleRecord[] {
  return (staffRoleSchema.options as readonly StaffRole[]).map((id) => ({
    id,
    name: STAFF_ROLE_LABEL[id],
    permissions: [...STAFF_PERMISSIONS[id]],
    isSystem: true,
    domain: 'staff' as const,
  }));
}

/** Derive a stable custom-role id from a display name (`Finance Reviewer` → `role-finance-reviewer`). */
export function slugifyRoleName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `role-${slug || 'custom'}`;
}

/** Case-insensitive name uniqueness across role records (optionally ignoring one id, for renames). */
export function isRoleNameUnique(
  roles: Pick<RoleRecord, 'id' | 'name'>[],
  name: string,
  excludeId?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  return !roles.some((r) => r.id !== excludeId && r.name.trim().toLowerCase() === wanted);
}

/**
 * Resolve the effective modules for a role id against role records.
 * Falls back to the matrix seed for system ids when records are absent, so
 * the shell can render synchronously before the mock records load.
 * Unknown ids resolve to no modules (deny by default).
 *
 * A non-empty `sessionModules` set (carried on the server-resolved staff
 * session) is authoritative and wins over records — it is how non-
 * super-admin staff (who cannot read the role catalog) resolve their own
 * modules for navigation and route guards.
 */
export function resolveRoleModules(
  roles: readonly RoleRecord[] | undefined,
  roleId: string | null | undefined,
  sessionModules?: readonly StaffModule[],
): StaffModule[] {
  if (sessionModules && sessionModules.length > 0) return [...sessionModules];
  if (!roleId) return [];
  const record = roles?.find((r) => r.id === roleId);
  if (record) return [...record.permissions];
  const systemIds = staffRoleSchema.options as readonly string[];
  if (systemIds.includes(roleId)) {
    return [...STAFF_PERMISSIONS[roleId as StaffRole]];
  }
  return [];
}

/** Display names for modules (mirror the admin nav labels). */
export const STAFF_MODULE_LABEL: Record<StaffModule, string> = {
  dashboard: 'Dashboard',
  registrations: 'Registration',
  members: 'Members',
  sales: 'Sales',
  payouts: 'Payouts',
  withdrawals: 'Withdrawals',
  vouchers: 'Vouchers',
  properties: 'Properties',
  marketing_tools: 'Marketing Tools',
  policies: 'Policies',
  config: 'System Configuration',
  programs: 'Programs',
  audit: 'Audit Log',
  staff: 'Staff',
  cms: 'Website CMS',
};

/**
 * Modules a custom (non-system) role may never hold. The API keeps the
 * corresponding endpoints super_admin-slug-gated (`staff`, `audit`) or
 * super_admin-only for writes (`config`), so granting them would only
 * produce navigation that 403s — block them at creation/editing so the
 * shell and the API stay consistent. `programs` redirects into System
 * Configuration, which custom roles cannot read anyway.
 */
export const CUSTOM_ROLE_FORBIDDEN_MODULES: readonly StaffModule[] = [
  'staff',
  'audit',
  'config',
  'programs',
];

/** Display name for a role id (record name, else system label, else the raw id). */
export function roleNameFor(
  roles: readonly Pick<RoleRecord, 'id' | 'name'>[] | undefined,
  roleId: string,
): string {
  const record = roles?.find((r) => r.id === roleId);
  if (record) return record.name;
  const systemIds = staffRoleSchema.options as readonly string[];
  if (systemIds.includes(roleId)) return STAFF_ROLE_LABEL[roleId as StaffRole];
  return roleId;
}
