import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBucket } from '../lib/analytics';
import { chartMetricLabel, type ChartMetric } from '../lib/chart';
import { formatMoney } from '../lib/format';
import type { AnalyticsGrouping, SalesAnalytics } from '../services/operations';

export function SalesLineChart({
  analytics,
  grouping,
  metric,
}: {
  analytics: SalesAnalytics | undefined;
  grouping: AnalyticsGrouping;
  metric: ChartMetric;
}) {
  const rows = (analytics?.buckets ?? []).map((bucket) => ({
    ...bucket,
    label: formatBucket(bucket.bucket, grouping),
    value: metric === 'salesCreated' || metric === 'verifiedSales'
      ? bucket[metric]
      : Number(bucket[metric]),
  }));

  if (!rows.length || rows.every((row) => row.value === 0)) {
    return <div className="chart-empty">No verified sales or collection data for this period.</div>;
  }

  return (
    <div className="line-chart" aria-label={`${chartMetricLabel(metric)} over time`}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            tickFormatter={(value: number) => metric.includes('Amount') ? formatMoney(value) : String(value)}
            width={metric.includes('Amount') ? 84 : 42}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <div className="chart-tooltip">
                  <strong>{row.label}</strong>
                  <span>{chartMetricLabel(metric)}: {metric.includes('Amount') ? formatMoney(row.value) : row.value}</span>
                  <span>Sales count: {row.salesCreated}</span>
                  <span>Verified collection: {formatMoney(row.totalCollectedAmount)}</span>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={chartMetricLabel(metric)}
            stroke="var(--leaf)"
            strokeWidth={3}
            dot={{ r: 3, fill: 'var(--leaf)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
