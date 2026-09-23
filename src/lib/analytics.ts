import type { AnalyticsGrouping } from '../services/operations';

export type AnalyticsPeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

export function getAnalyticsRange(period: AnalyticsPeriod, customFrom?: string, customTo?: string) {
  const now = new Date();
  if (period === 'custom' && customFrom && customTo) {
    const to = new Date(`${customTo}T23:59:59.999`);
    return { from: new Date(`${customFrom}T00:00:00`).toISOString(), to: to.toISOString() };
  }
  const from = startOfDay(now);
  if (period === 'week') {
    const mondayOffset = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - mondayOffset);
  } else if (period === 'month') {
    from.setDate(1);
  } else if (period === 'year') {
    from.setMonth(0, 1);
  }
  const to = period === 'today' ? new Date(from.getTime() + 86_400_000) : now;
  return { from: from.toISOString(), to: to.toISOString() };
}

export function defaultGrouping(period: AnalyticsPeriod): AnalyticsGrouping {
  if (period === 'year') return 'month';
  if (period === 'month') return 'week';
  return 'day';
}

export function performanceLabel(verifiedSaleCount: number) {
  return verifiedSaleCount === 0 ? 'No verified sales in selected period' : 'Verified sales activity';
}

export function formatBucket(value: string, grouping: AnalyticsGrouping) {
  const date = new Date(value);
  if (grouping === 'year') return new Intl.DateTimeFormat('en-PH', { year: 'numeric' }).format(date);
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(date);
}
