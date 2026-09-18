import {
  commissionReportRowSchema,
  salesCommissionsReportSchema,
  salesReportRowSchema,
  type CommissionReportRow,
  type ReportBreakdown,
  type SalesReportRow,
} from '@jad/contracts';
import { addMoney } from '@jad/shared';

import { FINANCE_VIEW } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * GET /admin/reports/sales-commissions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * (super_admin, admin, finance). Returns every sale (optionally bounded by
 * `submittedAt`), the commissions belonging to those sales, and per-status
 * count/money breakdowns computed server-side from server facts. Money is
 * summed with exact-decimal helpers - never floats. The response shape is
 * validated by contracts; CSV rendering happens client-side.
 *
 * Scale rationale: rows are fetched whole and date-filtered in JS - at the
 * current catalog/member scale this is small, mirroring the existing
 * unpaginated admin list handlers. Revisit with SQL aggregation before this
 * reaches tens of thousands of rows.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SALE_STATUSES = [
  'SUBMITTED',
  'ADMIN_APPROVED',
  'PAYMENT_VERIFIED',
  'QUALIFYING_SALE',
  'REJECTED',
  'LOCKED',
] as const;

const COMMISSION_STATUSES = ['PENDING', 'AVAILABLE', 'CANCELLED', 'REVERSED'] as const;

function emptyBreakdowns(statuses: readonly string[]): Record<string, ReportBreakdown> {
  const map: Record<string, ReportBreakdown> = {};
  for (const status of statuses) map[status] = { count: 0, total: '0.00' };
  return map;
}

function firstQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** Inclusive `to` date -> exclusive upper bound (next day, UTC midnight). */
function exclusiveUpperBound(day: string): string {
  const [y, m, d] = [...day.split('-').map(Number)] as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString();
}

function memberName(row: Record<string, unknown>): string {
  const joined = [row.firstName, row.lastName]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim())
    .join(' ');
  if (joined) return joined;
  return typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '';
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bump(breakdown: ReportBreakdown | undefined, money: string): void {
  if (!breakdown) return;
  breakdown.count += 1;
  breakdown.total = addMoney(breakdown.total, money);
}

export async function getSalesCommissionsReport(req: VercelRequest, res: VercelResponse) {
  const from = firstQuery(req.query?.from);
  const to = firstQuery(req.query?.to);
  if (
    (from !== undefined && !ISO_DATE_RE.test(from)) ||
    (to !== undefined && !ISO_DATE_RE.test(to))
  ) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'from and to must be YYYY-MM-DD dates',
      400,
    );
    res.status(status).json({ error });
    return;
  }

  const auth = await verifyStaffModule(req, 'sales', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  const [salesResult, commissionsResult] = await Promise.all([
    supabase.from('Sale').select('*').order('submittedAt', { ascending: false }),
    supabase.from('Commission').select('*').order('createdAt', { ascending: false }),
  ]);
  if (salesResult.error) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      `Sale report query failed: ${salesResult.error.message}`,
      500,
    );
    res.status(status).json({ error });
    return;
  }
  if (commissionsResult.error) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      `Commission report query failed: ${commissionsResult.error.message}`,
      500,
    );
    res.status(status).json({ error });
    return;
  }

  const fromLower = from === undefined ? null : `${from}T00:00:00.000Z`;
  const toUpper = to === undefined ? null : exclusiveUpperBound(to);
  const inRange = (row: Record<string, unknown>): boolean => {
    const submittedAt = row.submittedAt;
    if (typeof submittedAt !== 'string') return false;
    if (fromLower !== null && submittedAt < fromLower) return false;
    if (toUpper !== null && submittedAt >= toUpper) return false;
    return true;
  };

  const saleRows = (((salesResult.data as unknown[]) ?? []) as Record<string, unknown>[]).filter(
    inRange,
  );
  const saleIds = new Set(
    saleRows.map((row) => asNonEmptyString(row.id)).filter((id): id is string => Boolean(id)),
  );

  const commissionRowsAll = ((commissionsResult.data as unknown[]) ??
    []) as Record<string, unknown>[];
  const commissionRows = commissionRowsAll.filter((row) => {
    const saleId = asNonEmptyString(row.saleId);
    return saleId !== undefined && saleIds.has(saleId);
  });

  // Names for the payee of every reported commission (sellerName rides on the
  // Sale snapshot; commissions reference the earning member).
  const memberIds = [
    ...new Set(
      commissionRows
        .map((row) => asNonEmptyString(row.memberId))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const namesResult =
    memberIds.length > 0
      ? await supabase.from('Member').select('id, firstName, lastName, name').in('id', memberIds)
      : null;
  if (namesResult && namesResult.error) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      `Member name lookup failed: ${namesResult.error.message}`,
      500,
    );
    res.status(status).json({ error });
    return;
  }
  const memberNames = new Map<string, string>();
  for (const row of ((namesResult?.data as Record<string, unknown>[] | null) ?? [])) {
    const id = asNonEmptyString(row.id);
    const name = memberName(row);
    if (id && name) memberNames.set(id, name);
  }

  const sales: SalesReportRow[] = [];
  const salesByStatus = emptyBreakdowns(SALE_STATUSES);
  let salesCount = 0;
  let salesValueTotal = '0.00';
  for (const row of saleRows) {
    const referrerName = asNonEmptyString(row.referrerName);
    const candidate = salesReportRowSchema.safeParse({
      id: row.id,
      propertyName: row.propertyName,
      sellerName: asNonEmptyString(row.sellerName) ?? '',
      status: row.status,
      propertyValue: row.propertyValue,
      ...(referrerName !== undefined ? { referrerName } : {}),
      submittedAt: row.submittedAt,
    });
    if (!candidate.success) continue;
    sales.push(candidate.data);
    salesCount += 1;
    bump(salesByStatus[candidate.data.status], candidate.data.propertyValue);
    salesValueTotal = addMoney(salesValueTotal, candidate.data.propertyValue);
  }

  const commissions: CommissionReportRow[] = [];
  const commissionsByStatus = emptyBreakdowns(COMMISSION_STATUSES);
  for (const row of commissionRows) {
    const memberId = asNonEmptyString(row.memberId) ?? '';
    const clearedAt = asNonEmptyString(row.clearedAt);
    const candidate = commissionReportRowSchema.safeParse({
      id: row.id,
      saleId: row.saleId,
      memberName: memberNames.get(memberId) ?? memberId,
      commissionType: row.commissionType,
      amount: row.amount,
      status: row.status,
      createdAt: row.createdAt,
      ...(clearedAt !== undefined ? { clearedAt } : {}),
    });
    if (!candidate.success) continue;
    commissions.push(candidate.data);
    bump(commissionsByStatus[candidate.data.status], candidate.data.amount);
  }

  const parsed = salesCommissionsReportSchema.safeParse({
    range: { from: from ?? null, to: to ?? null },
    generatedAt: new Date().toISOString(),
    sales,
    commissions,
    summary: {
      salesCount,
      salesValueTotal,
      salesByStatus,
      commissionsByStatus,
    },
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Sales & commissions report failed validation',
      500,
    );
    res.status(status).json({ error });
    return;
  }

  await appendAudit(supabase, {
    action: 'REPORT_GENERATED',
    actorId: auth.userId,
    actorRole: auth.slugs.join(','),
    targetType: 'report',
    targetId: 'sales-commissions',
    detail: `range=${from ?? 'all'}..${to ?? 'all'} sales=${parsed.data.summary.salesCount}`,
  });

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
  return getSalesCommissionsReport(req, res);
}
