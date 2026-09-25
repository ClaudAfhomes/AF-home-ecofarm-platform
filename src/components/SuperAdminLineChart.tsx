import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBucket } from '../lib/analytics';
import { formatMoney } from '../lib/format';
import type { AnalyticsGrouping, SuperAdminDashboard } from '../services/operations';

const series = [
  ['cardSales', 'Card sales', '#17643a'],
  ['collections', 'Collections', '#c4912f'],
  ['cardActivations', 'Card activations', '#2479a8'],
  ['pointsRedeemed', 'Points redeemed', '#7652a8'],
] as const;

export function SuperAdminLineChart({ data, grouping }: { data: SuperAdminDashboard['series']; grouping: AnalyticsGrouping }) {
  const rows = data.map((row) => ({ ...row, collections: Number(row.collections), label: formatBucket(row.bucket, grouping) }));
  const hasData = rows.some((row) => row.cardSales || row.collections || row.cardActivations || row.pointsRedeemed);
  if (!hasData) return <div className="chart-empty"><div><strong>No verified activity in this period</strong><p>Choose another date range or create a card sale to begin tracking performance.</p></div></div>;
  return <div className="line-chart" aria-label="AF Homes operational analytics over time">
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={rows} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
        <YAxis yAxisId="counts" tick={{ fill: 'var(--muted)', fontSize: 12 }} width={42} allowDecimals={false} />
        <YAxis yAxisId="money" orientation="right" hide />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const row = payload[0].payload as (typeof rows)[number];
          return <div className="chart-tooltip"><strong>{row.label}</strong><span>Card sales: {row.cardSales}</span><span>Collections: {formatMoney(row.collections)}</span><span>Card activations: {row.cardActivations}</span><span>Points redeemed: {row.pointsRedeemed.toLocaleString()}</span></div>;
        }} />
        {series.map(([key, label, color]) => <Line key={key} yAxisId={key === 'collections' ? 'money' : 'counts'} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} />)}
      </LineChart>
    </ResponsiveContainer>
    <div className="super-chart-legend">{series.map(([key, label, color]) => <span key={key}><i style={{ background: color }} />{label}</span>)}</div>
  </div>;
}
