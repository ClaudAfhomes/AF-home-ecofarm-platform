import { operationalSummaryReportSchema } from '@jad/contracts';
import { addMoney } from '@jad/shared';

import { FINANCE_VIEW } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * GET /admin/reports/summary (super_admin, admin, finance). Whole-org
 * operational snapshot - head counts (mirroring admin/queues.ts) plus
 * outstanding/paid money totals. All aggregation happens server-side; the
 * request takes no parameters.
 *
 * Sums are computed in JS over fetched amount columns with exact-decimal
 * helpers (no floats). Bounded by current row counts; revisit with a SQL
 * aggregate view before those reach tens of thousands of rows.
 */

const SALE_STATUSES = [
  'SUBMITTED',
  'ADMIN_APPROVED',
  'PAYMENT_VERIFIED',
  'QUALIFYING_SALE',
  'REJECTED',
  'LOCKED',
] as const;

/** PENDING withdrawals = REQUESTED + RESERVED (reserved money not yet paid). */
const PENDING_WITHDRAWAL_STATUSES = ['REQUESTED', 'RESERVED'] as const;

function fail(label: string, result: { error?: { message: string } | null }) {
  if (result.error) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      `${label} query failed: ${result.error.message}`,
      500,
    );
    return { error, status };
  }
  return null;
}

function sumAmounts(rows: Record<string, unknown>[], status?: string): string {
  let total = '0.00';
  for (const row of rows) {
    if (status !== undefined && row.status !== status) continue;
    if (typeof row.amount === 'string') total = addMoney(total, row.amount);
  }
  return total;
}

function countByStatus(rows: Record<string, unknown>[], status: string): number {
  return rows.filter((row) => row.status === status).length;
}

export async function getOperationalSummaryReport(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'dashboard', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  const [
    membersActive,
    membersInactive,
    membersArchived,
    registrationsTotal,
    registrationsPending,
    registrationsRejected,
    salesAll,
    withdrawalsAll,
    commissionsAll,
    inquiriesNew,
  ] = await Promise.all([
    supabase
      .from('Member')
      .select('id', { count: 'exact', head: true })
      .is('archivedAt', null)
      .eq('accountStatus', 'ACTIVE'),
    supabase
      .from('Member')
      .select('id', { count: 'exact', head: true })
      .is('archivedAt', null)
      .neq('accountStatus', 'ACTIVE'),
    supabase
      .from('Member')
      .select('id', { count: 'exact', head: true })
      .not('archivedAt', 'is', null),
    supabase.from('Registration').select('id', { count: 'exact', head: true }),
    supabase
      .from('Registration')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING'),
    supabase
      .from('Registration')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'REJECTED'),
    supabase.from('Sale').select('status'),
    supabase.from('Withdrawal').select('amount, status'),
    supabase.from('Commission').select('amount, status'),
    supabase
      .from('ContactInquiry')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'NEW'),
  ]);

  for (const [label, result] of [
    ['Members (active)', membersActive],
    ['Members (inactive)', membersInactive],
    ['Members (archived)', membersArchived],
    ['Registrations (total)', registrationsTotal],
    ['Registrations (pending)', registrationsPending],
    ['Registrations (rejected)', registrationsRejected],
    ['Sales', salesAll],
    ['ContactInquiries', inquiriesNew],
  ] as const) {
    const failureResult = fail(label, result);
    if (failureResult) {
      res.status(failureResult.status).json({ error: failureResult.error });
      return;
    }
  }
  const withdrawalFailure = fail('Withdrawals', withdrawalsAll);
  if (withdrawalFailure) {
    res.status(withdrawalFailure.status).json({ error: withdrawalFailure.error });
    return;
  }
  const commissionFailure = fail('Commissions', commissionsAll);
  if (commissionFailure) {
    res.status(commissionFailure.status).json({ error: commissionFailure.error });
    return;
  }

  const saleRows = ((salesAll.data as unknown[]) ?? []) as Record<string, unknown>[];
  const withdrawalRows = ((withdrawalsAll.data as unknown[]) ??
    []) as Record<string, unknown>[];
  const commissionRows = ((commissionsAll.data as unknown[]) ?? []) as Record<string, unknown>[];

  const salesByStatus: Record<string, number> = {};
  for (const status of SALE_STATUSES) salesByStatus[status] = 0;
  for (const row of saleRows) {
    if (typeof row.status === 'string' && row.status in salesByStatus) {
      salesByStatus[row.status] += 1;
    }
  }

  const pendingWithdrawals = withdrawalRows.filter(
    (row) =>
      PENDING_WITHDRAWAL_STATUSES.includes(row.status as 'REQUESTED' | 'RESERVED'),
  );

  const parsed = operationalSummaryReportSchema.safeParse({
    generatedAt: new Date().toISOString(),
    members: {
      active: membersActive.count ?? 0,
      inactive: membersInactive.count ?? 0,
      archived: membersArchived.count ?? 0,
    },
    registrations: {
      total: registrationsTotal.count ?? 0,
      pending: registrationsPending.count ?? 0,
      rejected: registrationsRejected.count ?? 0,
    },
    sales: { total: saleRows.length, byStatus: salesByStatus },
    withdrawals: {
      pendingCount: pendingWithdrawals.length,
      pendingTotal: sumAmounts(pendingWithdrawals),
      completedCount: countByStatus(withdrawalRows, 'COMPLETED'),
      completedTotal: sumAmounts(withdrawalRows, 'COMPLETED'),
      rejectedCount: countByStatus(withdrawalRows, 'REJECTED'),
    },
    commissions: {
      pendingCount: countByStatus(commissionRows, 'PENDING'),
      pendingTotal: sumAmounts(commissionRows, 'PENDING'),
      availableCount: countByStatus(commissionRows, 'AVAILABLE'),
      availableTotal: sumAmounts(commissionRows, 'AVAILABLE'),
    },
    inquiries: { new: inquiriesNew.count ?? 0 },
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Operational summary report failed validation',
      500,
    );
    res.status(status).json({ error });
    return;
  }

  res.status(200).json(parsed.data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  return getOperationalSummaryReport(req, res);
}
