import { describe, expect, it } from 'vitest';

import {
  listResponseSchema,
  errorEnvelopeSchema,
  publicConfigSchema,
  programSchema,
  policySchema,
  staffRoleSchema,
  staffModuleSchema,
  staffDomainSchema,
  STAFF_ROLE_LABEL,
  STAFF_PERMISSIONS,
  canStaffAccess,
  roleRecordSchema,
  systemRoleRecords,
  staffUserSchema,
  staffAssignmentSchema,
  staffSessionSchema,
  slugifyRoleName,
  isRoleNameUnique,
  resolveRoleModules,
  roleNameFor,
  STAFF_MODULE_LABEL,
  staffMemberSchema,
  auditLogEntrySchema,
  staffPasswordSchema,
  createStaffRequestSchema,
  updateStaffProfileRequestSchema,
  changeStaffPasswordRequestSchema,
  systemConfigEntrySchema,
  CONFIG_SEEDS,
  PROGRAM_SEEDS,
  PROGRAM_QUESTION_SEEDS,
  POLICY_SEEDS,
  qualificationQuestionSchema,
  voucherSchema,
  assignVoucherRequestSchema,
  scanVoucherRequestSchema,
  redeemVoucherRequestSchema,
  saleSchema,
  submitSaleRequestSchema,
} from '../src/index';
import type { RoleRecord, StaffModule, StaffRole } from '../src/index';

describe('errorEnvelopeSchema', () => {
  it('accepts a valid envelope', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: 'abc',
        timestamp: '2026-08-18T10:00:00Z',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing message', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'NOT_FOUND', timestamp: '2026-08-18T10:00:00Z' },
    });
    expect(result.success).toBe(false);
  });
});

describe('listResponseSchema', () => {
  const schema = listResponseSchema(programSchema);

  it('accepts a data array with optional meta', () => {
    const result = schema.safeParse({
      data: [{ id: 'p1', code: 'D', name: 'Domestic' }],
      meta: { pagination: { page: 1 } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid item in data', () => {
    const result = schema.safeParse({ data: [{ id: 'p1' }] });
    expect(result.success).toBe(false);
  });
});

describe('publicConfigSchema', () => {
  it('accepts a minimum age and optional genders', () => {
    expect(
      publicConfigSchema.safeParse({ minimumAge: 18, genders: ['Male', 'Female'] }).success,
    ).toBe(true);
  });

  it('accepts optional withdrawal limits', () => {
    expect(
      publicConfigSchema.safeParse({
        minimumAge: 18,
        withdrawalLimits: { min: '100.00', max: '50000.00' },
      }).success,
    ).toBe(true);
  });

  it('rejects a negative minimum age', () => {
    expect(publicConfigSchema.safeParse({ minimumAge: -1 }).success).toBe(false);
  });

  it('rejects a missing minimum age', () => {
    expect(publicConfigSchema.safeParse({}).success).toBe(false);
  });
});

describe('programSchema', () => {
  it('accepts a minimal program', () => {
    expect(programSchema.safeParse({ id: 'p1', code: 'D', name: 'Domestic' }).success).toBe(true);
  });

  it('rejects a program without a name', () => {
    expect(programSchema.safeParse({ id: 'p1', code: 'D' }).success).toBe(false);
  });
});

describe('saleSchema', () => {
  const base = {
    id: 'sal-1',
    status: 'SUBMITTED',
    propertyId: 'prop-1',
    propertyName: 'Lot',
    propertyValue: '1200000.00',
    customerId: 'cus-1',
    customerName: 'Ramon',
    sellerId: 'mem-1',
    sellerName: 'Juan',
    resubmissionCount: 0,
    submittedAt: '2026-08-18T10:00:00.000Z',
  };

  it('accepts a sale without a referrer', () => {
    expect(saleSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an optional referrer name snapshot', () => {
    expect(saleSchema.safeParse({ ...base, referrerName: 'Maria Santos' }).success).toBe(true);
  });

  it('accepts an optional referrerId', () => {
    expect(saleSchema.safeParse({ ...base, referrerId: 'mem-123' }).success).toBe(true);
  });
});

describe('submitSaleRequestSchema', () => {
  const base = { customerId: 'cus-1', propertyId: 'prop-1' };

  it('accepts customer + property only', () => {
    expect(submitSaleRequestSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an optional referrerId', () => {
    expect(submitSaleRequestSchema.safeParse({ ...base, referrerId: 'mem-123' }).success).toBe(
      true,
    );
  });

  it('rejects a blank referrerId', () => {
    expect(submitSaleRequestSchema.safeParse({ ...base, referrerId: '   ' }).success).toBe(false);
  });
});

describe('policySchema', () => {
  it('accepts a policy with content', () => {
    expect(
      policySchema.safeParse({
        id: 'pol1',
        slug: 'terms',
        title: 'Terms',
        type: 'TERMS',
        content: '...',
        updatedAt: '2026-08-18T10:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('rejects a policy without a slug', () => {
    expect(
      policySchema.safeParse({
        id: 'pol1',
        title: 'Terms',
        type: 'TERMS',
        updatedAt: '2026-08-18T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects a policy without a title', () => {
    expect(
      policySchema.safeParse({
        id: 'pol1',
        slug: 'terms',
        type: 'TERMS',
        updatedAt: '2026-08-18T10:00:00Z',
      }).success,
    ).toBe(false);
  });
});

describe('staffRoleSchema', () => {
  it('accepts the four staff roles', () => {
    for (const role of ['super_admin', 'admin', 'finance', 'merchant'] as const) {
      expect(staffRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects session/member role values', () => {
    expect(staffRoleSchema.safeParse('user').success).toBe(false);
    expect(staffRoleSchema.safeParse('member_basic').success).toBe(false);
    expect(staffRoleSchema.safeParse('').success).toBe(false);
  });

  it('labels every role', () => {
    const roles = staffRoleSchema.options as readonly StaffRole[];
    for (const role of roles) {
      expect(STAFF_ROLE_LABEL[role]).toBeTruthy();
    }
  });
});

describe('STAFF_PERMISSIONS matrix', () => {
  const allModules = staffModuleSchema.options as readonly StaffModule[];

  it('covers every module for super_admin', () => {
    expect([...STAFF_PERMISSIONS.super_admin].sort()).toEqual([...allModules].sort());
  });

  it('grants admin operational + content modules but not governance', () => {
    expect(canStaffAccess('admin', 'sales')).toBe(true);
    expect(canStaffAccess('admin', 'members')).toBe(true);
    expect(canStaffAccess('admin', 'properties')).toBe(true);
    expect(canStaffAccess('admin', 'marketing_tools')).toBe(true);
    expect(canStaffAccess('admin', 'cms')).toBe(true);
    expect(canStaffAccess('admin', 'messages')).toBe(true);
    expect(canStaffAccess('super_admin', 'messages')).toBe(true);
    expect(canStaffAccess('finance', 'messages')).toBe(false);
    expect(canStaffAccess('merchant', 'messages')).toBe(false);
    expect(canStaffAccess('admin', 'config')).toBe(false);
    expect(canStaffAccess('admin', 'programs')).toBe(false);
    expect(canStaffAccess('admin', 'audit')).toBe(false);
    expect(canStaffAccess('admin', 'staff')).toBe(false);
  });

  it('limits finance to sales queue, payouts and withdrawals', () => {
    expect(STAFF_PERMISSIONS.finance).toEqual(['dashboard', 'sales', 'payouts', 'withdrawals']);
    expect(canStaffAccess('finance', 'config')).toBe(false);
    expect(canStaffAccess('finance', 'audit')).toBe(false);
    expect(canStaffAccess('finance', 'members')).toBe(false);
  });

  it('limits merchant to vouchers redemption scope', () => {
    expect(STAFF_PERMISSIONS.merchant).toEqual(['vouchers']);
    expect(canStaffAccess('merchant', 'sales')).toBe(false);
    expect(canStaffAccess('merchant', 'dashboard')).toBe(false);
  });

  it('denies null role everything', () => {
    for (const module of allModules) {
      expect(canStaffAccess(null, module)).toBe(false);
    }
  });
});

describe('roleRecordSchema', () => {
  it('accepts a valid custom role record', () => {
    expect(
      roleRecordSchema.safeParse({
        id: 'role-finance-reviewer',
        name: 'Finance Reviewer',
        permissions: ['dashboard', 'sales', 'payouts', 'withdrawals'],
        isSystem: false,
      }).success,
    ).toBe(true);
  });

  it('rejects empty permissions, blank names, and overlong names', () => {
    expect(
      roleRecordSchema.safeParse({ id: 'r', name: 'X', permissions: [], isSystem: false }).success,
    ).toBe(false);
    expect(
      roleRecordSchema.safeParse({ id: 'r', name: '  ', permissions: ['sales'], isSystem: false })
        .success,
    ).toBe(false);
    expect(
      roleRecordSchema.safeParse({
        id: 'r',
        name: 'x'.repeat(61),
        permissions: ['sales'],
        isSystem: false,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown modules', () => {
    expect(
      roleRecordSchema.safeParse({ id: 'r', name: 'X', permissions: ['nope'], isSystem: false })
        .success,
    ).toBe(false);
  });
});

describe('staffUserSchema', () => {
  it('accepts a staff identity keyed by auth id', () => {
    expect(
      staffUserSchema.safeParse({
        id: 'd800d2e2-203b-4c42-aa9f-89419ba60e91',
        email: 'admin@jad.local',
        name: 'Admin User',
        status: 'ACTIVE',
        createdAt: '2026-09-08T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects bad emails and statuses', () => {
    expect(
      staffUserSchema.safeParse({
        id: 'x',
        email: 'nope',
        name: 'X',
        status: 'ACTIVE',
        createdAt: '2026-09-08T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      staffUserSchema.safeParse({
        id: 'x',
        email: 'a@b.com',
        name: 'X',
        status: 'SUSPENDED',
        createdAt: '2026-09-08T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('staffAssignmentSchema', () => {
  it('accepts a staff assignment link', () => {
    expect(
      staffAssignmentSchema.safeParse({
        staffUserId: 'd800d2e2-203b-4c42-aa9f-89419ba60e91',
        roleId: 'role-uuid-admin',
        assignedAt: '2026-09-08T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('staffMemberSchema', () => {
  it('accepts a roster-shaped staff member', () => {
    expect(
      staffMemberSchema.safeParse({
        id: 'stf-001',
        name: 'Saul Super',
        email: 'superadmin@gmail.com',
        roleId: 'super_admin',
        status: 'ACTIVE',
        createdAt: '2026-07-01T09:00:00.000Z',
        createdBy: 'System',
      }).success,
    ).toBe(true);
  });

  it('rejects bad emails, roles, and statuses', () => {
    const base = {
      id: 'stf-009',
      name: 'New Hire',
      email: 'new.hire@jad.example',
      roleId: 'admin',
      status: 'ACTIVE',
      createdAt: '2026-09-04T00:00:00.000Z',
      createdBy: 'Saul Super',
    };
    expect(staffMemberSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
    expect(staffMemberSchema.safeParse({ ...base, roleId: '' }).success).toBe(false);
    expect(staffMemberSchema.safeParse({ ...base, status: 'SUSPENDED' }).success).toBe(false);
  });
});

describe('auditLogEntrySchema', () => {
  it('accepts a fully attributed entry', () => {
    expect(
      auditLogEntrySchema.safeParse({
        id: 'aud-001',
        action: 'STAFF_CREATED',
        actor: 'Saul Super',
        actorRole: 'SUPER_ADMIN',
        targetType: 'Staff',
        targetId: 'stf-009',
        targetName: 'New Hire',
        detail: 'Created staff account with role Admin',
        createdAt: '2026-09-04T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects unattributed entries', () => {
    expect(
      auditLogEntrySchema.safeParse({
        id: 'aud-002',
        action: 'STAFF_CREATED',
        actor: '',
        actorRole: 'SUPER_ADMIN',
        targetType: 'Staff',
        targetId: 'stf-009',
        targetName: 'New Hire',
        detail: '',
        createdAt: '2026-09-04T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('systemRoleRecords seed parity', () => {
  it('builds one system record per matrix row with identical permissions', () => {
    const seeds = systemRoleRecords();
    expect(seeds.map((r) => r.id).sort()).toEqual(
      (staffRoleSchema.options as readonly StaffRole[]).map(String).sort(),
    );
    for (const seed of seeds) {
      expect(seed.isSystem).toBe(true);
      expect(seed.name).toBe(STAFF_ROLE_LABEL[seed.id as StaffRole]);
      expect([...seed.permissions].sort()).toEqual(
        [...STAFF_PERMISSIONS[seed.id as StaffRole]].sort(),
      );
      expect(seed.domain).toBe('staff');
    }
  });
});

describe('staffDomainSchema', () => {
  it('accepts member and staff only', () => {
    expect(staffDomainSchema.safeParse('staff').success).toBe(true);
    expect(staffDomainSchema.safeParse('member').success).toBe(true);
    expect(staffDomainSchema.safeParse('other').success).toBe(false);
  });

  it('role records carry an optional domain', () => {
    expect(
      roleRecordSchema.safeParse({
        id: 'admin',
        name: 'Admin',
        permissions: ['dashboard'],
        isSystem: true,
        domain: 'staff',
      }).success,
    ).toBe(true);
    expect(
      roleRecordSchema.safeParse({
        id: 'admin',
        name: 'Admin',
        permissions: ['dashboard'],
        isSystem: true,
        domain: 'other',
      }).success,
    ).toBe(false);
  });
});

describe('slugifyRoleName', () => {
  it('derives stable slugs', () => {
    expect(slugifyRoleName('Finance Reviewer')).toBe('role-finance-reviewer');
    expect(slugifyRoleName('  CMS  & Content!! ')).toBe('role-cms-content');
    expect(slugifyRoleName('')).toBe('role-custom');
  });
});

describe('isRoleNameUnique', () => {
  const roles: Pick<RoleRecord, 'id' | 'name'>[] = [
    { id: 'admin', name: 'Admin' },
    { id: 'role-finance-reviewer', name: 'Finance Reviewer' },
  ];

  it('compares case-insensitively with surrounding whitespace ignored', () => {
    expect(isRoleNameUnique(roles, 'finance reviewer')).toBe(false);
    expect(isRoleNameUnique(roles, '  ADMIN ')).toBe(false);
    expect(isRoleNameUnique(roles, 'Auditor')).toBe(true);
  });

  it('ignores the excluded id (rename keeps its own name)', () => {
    expect(isRoleNameUnique(roles, 'Finance Reviewer', 'role-finance-reviewer')).toBe(true);
    expect(isRoleNameUnique(roles, 'Finance Reviewer', 'admin')).toBe(false);
  });
});

describe('resolveRoleModules', () => {
  const custom: RoleRecord = {
    id: 'role-finance-reviewer',
    name: 'Finance Reviewer',
    permissions: ['dashboard', 'sales', 'payouts', 'withdrawals'],
    isSystem: false,
  };

  it('resolves custom record permissions', () => {
    expect(resolveRoleModules([custom], 'role-finance-reviewer')).toEqual([
      'dashboard',
      'sales',
      'payouts',
      'withdrawals',
    ]);
  });

  it('falls back to the matrix seed for system ids without records', () => {
    expect(resolveRoleModules(undefined, 'finance')).toEqual([
      'dashboard',
      'sales',
      'payouts',
      'withdrawals',
    ]);
    expect(resolveRoleModules([], 'merchant')).toEqual(['vouchers']);
  });

  it('denies null, undefined, and unknown ids by default', () => {
    expect(resolveRoleModules([custom], null)).toEqual([]);
    expect(resolveRoleModules([custom], undefined)).toEqual([]);
    expect(resolveRoleModules([custom], 'role-ghost')).toEqual([]);
    expect(resolveRoleModules(undefined, 'role-ghost')).toEqual([]);
  });

  it('prefers the record over the matrix seed when both exist', () => {
    const edited: RoleRecord = { ...custom, id: 'finance', permissions: ['sales'] };
    expect(resolveRoleModules([edited], 'finance')).toEqual(['sales']);
  });

  it('treats session modules as authoritative over records and fallbacks', () => {
    expect(resolveRoleModules([custom], 'role-finance-reviewer', ['dashboard'])).toEqual([
      'dashboard',
    ]);
    expect(resolveRoleModules(undefined, 'role-ghost', ['vouchers'])).toEqual(['vouchers']);
    expect(resolveRoleModules(undefined, 'finance', ['sales'])).toEqual(['sales']);
  });

  it('ignores an empty session-module override (falls through to records)', () => {
    expect(resolveRoleModules([custom], 'role-finance-reviewer', [])).toEqual([
      'dashboard',
      'sales',
      'payouts',
      'withdrawals',
    ]);
    expect(resolveRoleModules(undefined, 'finance', [])).toEqual([
      'dashboard',
      'sales',
      'payouts',
      'withdrawals',
    ]);
  });
});

describe('staffSessionSchema', () => {
  const base = {
    id: 'u-1',
    email: 'staffer@jad.local',
    name: 'Staffer',
    status: 'ACTIVE',
    slugs: ['role-admin-support'],
  };

  it('accepts the slugs-only shape (mock/legacy responses)', () => {
    const result = staffSessionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roleId).toBeUndefined();
      expect(result.data.roleName).toBeUndefined();
      expect(result.data.modules).toBeUndefined();
    }
  });

  it('accepts the server-resolved role identity shape', () => {
    const result = staffSessionSchema.safeParse({
      ...base,
      roleId: 'role-admin-support',
      roleName: 'Admin Support',
      modules: ['dashboard', 'members'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roleId).toBe('role-admin-support');
      expect(result.data.roleName).toBe('Admin Support');
      expect(result.data.modules).toEqual(['dashboard', 'members']);
    }
  });

  it('rejects unknown modules in the resolved set', () => {
    const result = staffSessionSchema.safeParse({
      ...base,
      roleId: 'admin',
      roleName: 'Admin',
      modules: ['nope'],
    });
    expect(result.success).toBe(false);
  });
});

describe('roleNameFor', () => {
  it('prefers record names, then system labels, then the raw id', () => {
    const records: Pick<RoleRecord, 'id' | 'name'>[] = [
      { id: 'role-finance-reviewer', name: 'Finance Reviewer' },
    ];
    expect(roleNameFor(records, 'role-finance-reviewer')).toBe('Finance Reviewer');
    expect(roleNameFor(records, 'admin')).toBe('Admin');
    expect(roleNameFor(records, 'role-ghost')).toBe('role-ghost');
    expect(roleNameFor(undefined, 'finance')).toBe('Finance');
  });
});

describe('systemConfigEntrySchema', () => {
  it('accepts a config row and rejects blanks', () => {
    expect(
      systemConfigEntrySchema.safeParse({
        key: 'QUALIFICATION_MIN_AGE',
        label: 'Minimum Member Age',
        value: '18',
        category: 'Qualification',
      }).success,
    ).toBe(true);
    expect(
      systemConfigEntrySchema.safeParse({ key: '', label: 'x', value: '1', category: 'y' }).success,
    ).toBe(false);
  });

  it('seeds cover the public surface plus governance rows', () => {
    const keys = CONFIG_SEEDS.map((c) => c.key);
    expect(keys).toContain('QUALIFICATION_MIN_AGE');
    expect(keys).toContain('GENDERS');
    expect(keys).toContain('COMMISSION_DIRECT_RATE');
    expect(JSON.parse(CONFIG_SEEDS.find((c) => c.key === 'GENDERS')!.value)).toEqual([
      'Male',
      'Female',
      'Others',
    ]);
  });

  it('seeds both programs with matching question sets', () => {
    expect(PROGRAM_SEEDS.map((p) => p.id).sort()).toEqual(['prg-abroad', 'prg-domestic']);
    for (const group of PROGRAM_QUESTION_SEEDS) {
      expect(group.questions.length).toBeGreaterThan(0);
      for (const q of group.questions) {
        expect(
          qualificationQuestionSchema.safeParse({ id: q.id, questionText: q.questionText }).success,
        ).toBe(true);
      }
    }
  });

  it('seeds the three published policies', () => {
    expect(POLICY_SEEDS.map((p) => p.id)).toEqual(['pol-001', 'pol-002', 'pol-003']);
    for (const p of POLICY_SEEDS) {
      expect(policySchema.safeParse({ ...p, updatedAt: p.updatedAt }).success).toBe(true);
    }
  });
});

describe('STAFF_MODULE_LABEL', () => {
  it('labels every module', () => {
    const modules = staffModuleSchema.options as readonly StaffModule[];
    for (const module of modules) {
      expect(STAFF_MODULE_LABEL[module]).toBeTruthy();
    }
    expect(STAFF_MODULE_LABEL.staff).toBe('Staff');
    expect(STAFF_MODULE_LABEL.marketing_tools).toBe('Marketing Tools');
  });
});

describe('staffPasswordSchema', () => {
  it('requires at least 8 characters', () => {
    expect(staffPasswordSchema.safeParse('short').success).toBe(false);
    expect(staffPasswordSchema.safeParse('TempPass1').success).toBe(true);
  });
});

describe('createStaffRequestSchema', () => {
  it('requires a temporary password', () => {
    expect(
      createStaffRequestSchema.safeParse({ name: 'A', email: 'a@b.com', roleId: 'admin' }).success,
    ).toBe(false);
    expect(
      createStaffRequestSchema.safeParse({
        name: 'A',
        email: 'a@b.com',
        roleId: 'admin',
        temporaryPassword: 'TempPass1',
      }).success,
    ).toBe(true);
  });
});

describe('updateStaffProfileRequestSchema', () => {
  it('requires a non-empty name', () => {
    expect(updateStaffProfileRequestSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(updateStaffProfileRequestSchema.safeParse({ name: 'Ada Admin' }).success).toBe(true);
  });
});

describe('changeStaffPasswordRequestSchema', () => {
  it('requires the current password and a strong new one', () => {
    expect(
      changeStaffPasswordRequestSchema.safeParse({
        currentPassword: 'old-pass-1',
        newPassword: 'short',
      }).success,
    ).toBe(false);
    expect(changeStaffPasswordRequestSchema.safeParse({ newPassword: 'NewPass12' }).success).toBe(
      false,
    );
    expect(
      changeStaffPasswordRequestSchema.safeParse({
        currentPassword: 'old-pass-1',
        newPassword: 'NewPass12',
      }).success,
    ).toBe(true);
  });
});

describe('voucherSchema redemption fields', () => {
  it('accepts a voucher without redemption stamps', () => {
    expect(
      voucherSchema.safeParse({
        id: 'vch-001',
        code: 'JAD-VCH-2026-101',
        title: 'Welcome Gift',
        originalValue: '500.00',
        remainingValue: '500.00',
        status: 'ACTIVE',
        createdAt: '2026-09-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a redeemed voucher with stamps', () => {
    expect(
      voucherSchema.safeParse({
        id: 'vch-001',
        code: 'JAD-VCH-2026-101',
        title: 'Welcome Gift',
        originalValue: '500.00',
        remainingValue: '0.00',
        status: 'FULLY_REDEEMED',
        createdAt: '2026-09-01T00:00:00.000Z',
        redeemedAt: '2026-09-10T00:00:00.000Z',
        redeemedBy: 'staff-uuid-1',
      }).success,
    ).toBe(true);
  });
});

describe('assignVoucherRequestSchema', () => {
  it('requires a template and a member', () => {
    expect(
      assignVoucherRequestSchema.safeParse({
        templateId: 'vtpl-001',
        memberId: 'mem-001',
      }).success,
    ).toBe(true);
    expect(assignVoucherRequestSchema.safeParse({ memberId: 'mem-001' }).success).toBe(false);
    expect(assignVoucherRequestSchema.safeParse({ templateId: 'vtpl-001' }).success).toBe(false);
  });

  it('accepts optional per-assignment expiry rules', () => {
    expect(
      assignVoucherRequestSchema.safeParse({
        templateId: 'vtpl-001',
        memberId: 'mem-001',
        expiresAt: '2026-12-31T00:00:00.000Z',
        validityDays: 90,
      }).success,
    ).toBe(true);
  });
});

describe('scanVoucherRequestSchema / redeemVoucherRequestSchema', () => {
  it('requires a code for scan', () => {
    expect(scanVoucherRequestSchema.safeParse({ code: 'JAD-VCH-2026-101' }).success).toBe(true);
    expect(scanVoucherRequestSchema.safeParse({ code: '' }).success).toBe(false);
    expect(scanVoucherRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts an empty redeem body', () => {
    expect(redeemVoucherRequestSchema.safeParse({}).success).toBe(true);
  });
});
