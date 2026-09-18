import { salesTrendReportSchema } from '@jad/contracts';
import { addMoney } from '@jad/shared';

import { FINANCE_VIEW } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * GET /admin/reports/sales-trend?granularity=month|year&months=12
 * (super_admin, admin, finance). Returns a continuous series of per-period
 * sale counts and exact-decimal property-value sums for the dashboard
 * overview chart:
 * - `month` (default): the last `months` calendar months ending with the
 *   current month; months with no sales are zero-filled so the line has no
 *   gaps.
 * - `year`: every calendar year from the earliest sale (or the current year
 *   when there are no sales) through the current year, zero-filled.
 *
 * Aggregation is JS-side over a small `select('submittedAt, propertyValue')`
 * payload with exact-decimal sums - same scale rationale as the other report
 * handlers. No audit entry: passive dashboard read (fires on every dashboard
 * load), not a generated report artifact.
 */

const DEFAULT_MONTHS = 12;

function firstQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

const ZERO_BUCKET = { count: 0, total: '0.00' };

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive month-iterator: continuous `YYYY-MM` keys oldest-first. */
function lastMonths(window: number): string[] {
  const keys: string[] = [];
  for (let i = window - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    keys.push(monthKey(d));
  }
  return keys;
}

export async function getSalesTrendReport(req: VercelRequest, res: VercelResponse) {
  const granularityRaw = firstQuery(req.query?.granularity) ?? 'month';
  const granularity = granularityRaw === 'year' ? 'year' : 'month';
  if (granularityRaw !== 'month' && granularityRaw !== 'year') {
    res
      .status(400)
      .json({ error: toErrorEnvelope('VALIDATION_ERROR', "granularity must be 'month' or 'year'", 400).error });
    return;
  }
  const monthsParamRaw = firstQuery(req.query?.months);
  let windowMonths = DEFAULT_MONTHS;
  if (monthsParamRaw !== undefined) {
    if (!/^\d{1,2}$/.test(monthsParamRaw)) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'months must be an integer between 1 and 12',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    windowMonths = Math.min(12, Math.max(1, Number(monthsParamRaw)));
  }

  const auth = await verifyStaffModule(req, 'sales', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  const result = await supabase.from('Sale').select('submittedAt, propertyValue');
  if (result.error) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      `Sales trend query failed: ${result.error.message}`,
      500,
    );
    res.status(status).json({ error });
    return;
  }
  const rows = ((result.data as unknown[]) ?? []) as Record<string, unknown>[];

  /** Buckets keyed by period (`YYYY-MM` or `YYYY`), zero-filled continuously. */
  const moneyRe = /^\d+(\.\d{1,2})?$/;
  const bucketAggregator = (keys: string[], keyOf: (d: Date) => string) => {
    const buckets = new Map(keys.map((key) => [key, { ...ZERO_BUCKET }]));
    for (const row of rows) {
      if (typeof row.submittedAt !== 'string') continue;
      const date = new Date(row.submittedAt);
      if (Number.isNaN(date.getTime())) continue;
      const bucket = buckets.get(keyOf(date));
      if (!bucket || typeof row.propertyValue !== 'string' || !moneyRe.test(row.propertyValue)) {
        continue;
      }
      bucket.count += 1;
      bucket.total = addMoney(bucket.total, row.propertyValue);
    }
    return keys.map((key) => ({ key, ...(buckets.get(key) ?? ZERO_BUCKET) }));
  };

  const periods =
    granularity === 'month'
      ? bucketAggregator(lastMonths(windowMonths), (d) => monthKey(d))
      : bucketAggregator(
          (() => {
            let firstYear: number | null = null;
            for (const row of rows) {
              if (typeof row.submittedAt !== 'string') continue;
              const date = new Date(row.submittedAt);
              if (Number.isNaN(date.getTime())) continue;
              if (firstYear === null || date.getUTCFullYear() < firstYear) {
                firstYear = date.getUTCFullYear();
              }
            }
            const start = firstYear ?? new Date().getUTCFullYear();
            const out: string[] = [];
            for (let y = start; y <= new Date().getUTCFullYear(); y += 1) out.push(String(y));
            return out;
          })(),
          (d) => String(d.getUTCFullYear()),
        );

  // Dirty rows (bad timestamp or money format) are skipped - a corrupt row
  // must not fail the whole dashboard read.

  const parsed = salesTrendReportSchema.safeParse({
    granularity,
    generatedAt: new Date().toISOString(),
    periods,
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Sales trend report failed validation',
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
  return getSalesTrendReport(req, res);
}
