import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Clock3, Network, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { SalesLineChart } from '../components/SalesLineChart';
import { StatusChip } from '../components/StatusChip';
import {
  fetchSalesAnalytics,
  fetchViceDirectorAnalytics,
  listStaff,
  type AnalyticsFilters,
  type AnalyticsGrouping,
  type AnalyticsProductType,
  type SalesAnalytics,
  type ViceDirectorAnalytics,
} from '../services/operations';
import { formatBucket, getAnalyticsRange, performanceLabel, defaultGrouping, type AnalyticsPeriod } from '../lib/analytics';
import { chartMetricLabel, type ChartMetric } from '../lib/chart';
import { formatMoney } from '../lib/format';
import { subscribeToOperations } from '../lib/realtime';
import { SuperAdminDashboard } from './SuperAdminDashboard';

const periodLabels: Array<[AnalyticsPeriod, string]> = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['year', 'This year'],
  ['custom', 'Custom range'],
];

function AnalyticsFiltersPanel({
  period,
  setPeriod,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  grouping,
  setGrouping,
  productType,
  setProductType,
  metric,
  setMetric,
  salespersonId,
  setSalespersonId,
  salespeople,
  viceDirectorId,
  setViceDirectorId,
  viceDirectors,
  allowSalesperson,
  allowViceDirector,
}: {
  period: AnalyticsPeriod;
  setPeriod: (value: AnalyticsPeriod) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  grouping: AnalyticsGrouping;
  setGrouping: (value: AnalyticsGrouping) => void;
  productType: AnalyticsProductType;
  setProductType: (value: AnalyticsProductType) => void;
  metric: ChartMetric;
  setMetric: (value: ChartMetric) => void;
  salespersonId: string;
  setSalespersonId: (value: string) => void;
  salespeople: Array<{ id: string; full_name: string }>;
  viceDirectorId: string;
  setViceDirectorId: (value: string) => void;
  viceDirectors: Array<{ id: string; full_name: string }>;
  allowSalesperson: boolean;
  allowViceDirector: boolean;
}) {
  return (
    <div className="analytics-filters" aria-label="Analytics filters">
      <div className="filter-row">
        <label>Period
          <select value={period} onChange={(event) => setPeriod(event.target.value as AnalyticsPeriod)}>
            {periodLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Grouping
          <select value={grouping} onChange={(event) => setGrouping(event.target.value as AnalyticsGrouping)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </label>
        <label>Product/card
          <select value={productType} onChange={(event) => setProductType(event.target.value as AnalyticsProductType)}>
            <option value="All">All cards</option>
            <option value="Bronze">Bronze</option>
            <option value="Silver">Silver</option>
            <option value="Gold">Gold</option>
          </select>
        </label>
        <label>Chart metric
          <select value={metric} onChange={(event) => setMetric(event.target.value as ChartMetric)}>
            {(['salesCreated', 'verifiedSales', 'collectedAmount', 'totalCollectedAmount'] as ChartMetric[]).map((value) => (
              <option key={value} value={value}>{chartMetricLabel(value)}</option>
            ))}
          </select>
        </label>
        {allowSalesperson && <label>Salesperson/member
          <select value={salespersonId} onChange={(event) => setSalespersonId(event.target.value)}>
            <option value="">All permitted salespeople</option>
            <option value="self">My sales</option>
            {salespeople.map((salesperson) => <option key={salesperson.id} value={salesperson.id}>{salesperson.full_name}</option>)}
          </select>
        </label>}
        {allowViceDirector && <label>Genealogy branch
          <select value={viceDirectorId} onChange={(event) => setViceDirectorId(event.target.value)}>
            <option value="">Select a Vice Director</option>
            {viceDirectors.map((director) => <option key={director.id} value={director.id}>{director.full_name}</option>)}
          </select>
        </label>}
      </div>
      {period === 'custom' && <div className="filter-row custom-range">
        <label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
        <label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
      </div>}
    </div>
  );
}

function SummaryCards({ analytics }: { analytics: SalesAnalytics | undefined }) {
  if (!analytics) return null;
  const cards = [
    [Users, 'Verified sales', analytics.summary.totalVerifiedSales],
    [ShoppingBag, 'Sales created', analytics.summary.totalSalesCreated],
    [Banknote, 'Total collection', formatMoney(analytics.summary.totalCollection)],
    [TrendingUp, 'Average per period', formatMoney(analytics.summary.averageSalesPerPeriod)],
    [Clock3, 'Pending payments', analytics.summary.pendingPayments],
    [Network, 'Pending amount', formatMoney(analytics.summary.pendingAmount)],
  ] as const;
  return <section className="metric-grid">{cards.map(([Icon, label, value]) => <article className="metric" key={label}><div className="metric-icon"><Icon /></div><p>{label}</p><strong>{value}</strong></article>)}</section>;
}

function AnalyticsPage({
  viceDirector = false,
}: {
  viceDirector?: boolean;
}) {
  const { role, profile } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [grouping, setGrouping] = useState<AnalyticsGrouping>('week');
  const [productType, setProductType] = useState<AnalyticsProductType>('All');
  const [metric, setMetric] = useState<ChartMetric>('totalCollectedAmount');
  const [salespersonId, setSalespersonId] = useState('');
  const [viceDirectorId, setViceDirectorId] = useState('');
  const canSelectBranch = role === 'super_admin';
  const canSelectSalesperson = role === 'super_admin' || role === 'admin';
  const staffQuery = useQuery({
    queryKey: ['analytics-vice-directors'],
    queryFn: () => listStaff({ page: 0, pageSize: 100, search: '', role: 'vice_director', status: 'active', department: '' }),
    enabled: canSelectBranch,
  });
  const salespeopleQuery = useQuery({
    queryKey: ['analytics-salespeople'],
    queryFn: () => listStaff({ page: 0, pageSize: 250, search: '', role: '', status: 'active', department: '' }),
    enabled: canSelectSalesperson,
  });
  const viceDirectors = (staffQuery.data?.rows ?? []).map((staff) => ({ id: staff.id, full_name: staff.full_name }));
  const salespeople = (salespeopleQuery.data?.rows ?? []).map((staff) => ({ id: staff.id, full_name: staff.full_name }));
  const effectiveViceDirectorId = viceDirectorId || viceDirectors[0]?.id || '';
  // Keep the server range stable for the lifetime of the selected filters. Calling
  // getAnalyticsRange on every render changes `to` by a few milliseconds, which
  // changes the React Query key and creates an unbounded RPC request loop.
  const range = useMemo(
    () => getAnalyticsRange(period, customFrom, customTo),
    [customFrom, customTo, period],
  );
  const filters: AnalyticsFilters = useMemo(() => ({
    from: range.from,
    to: range.to,
    grouping,
    productType,
    salespersonId: salespersonId === 'self' ? profile?.id : salespersonId || null,
    viceDirectorId: viceDirector ? (canSelectBranch ? effectiveViceDirectorId || null : null) : null,
  }), [canSelectBranch, effectiveViceDirectorId, grouping, productType, profile?.id, range.from, range.to, salespersonId, viceDirector]);
  const query = useQuery({
    queryKey: [viceDirector ? 'vice-director-analytics' : 'sales-analytics', filters],
    queryFn: () => viceDirector ? fetchViceDirectorAnalytics(filters) : fetchSalesAnalytics(filters),
    enabled: !viceDirector || !canSelectBranch || Boolean(effectiveViceDirectorId),
  });
  useEffect(() => subscribeToOperations(() => {
    void queryClient.invalidateQueries({ queryKey: [viceDirector ? 'vice-director-analytics' : 'sales-analytics'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
  }), [queryClient, viceDirector]);

  const analytics = query.data;
  const title = viceDirector ? 'Vice Director Analytics' : 'Sales performance';
  const roleLabel = `${role?.replaceAll('_', ' ') ?? 'staff'}${profile?.is_test_account ? ' · Test Account' : ''}`;
  const defaultRangeLabel = `${formatBucket(range.from, grouping)} – ${formatBucket(range.to, grouping)}`;

  if (query.isLoading || (canSelectBranch && staffQuery.isLoading) || (canSelectSalesperson && salespeopleQuery.isLoading)) return <LoadingState label="Loading verified analytics…" />;
  const queryError = query.error ?? staffQuery.error ?? salespeopleQuery.error;
  if (queryError) return <ErrorState message={queryError.message} retry={() => void Promise.all([query.refetch(), staffQuery.refetch(), salespeopleQuery.refetch()])} />;
  if (!analytics) return <EmptyState title="No analytics available" body="Choose an authorized genealogy branch or date range." />;

  const vdAnalytics = viceDirector ? analytics as ViceDirectorAnalytics : null;
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">LIVE OPERATIONS</p><h1>{title}</h1><p>Role: <strong>{roleLabel}</strong></p><p>Verified Supabase sales and payment data only · {defaultRangeLabel}</p></div>
        <span className="live-dot">Live</span>
      </header>
      <AnalyticsFiltersPanel
        period={period}
        setPeriod={(value) => { setPeriod(value); setGrouping(defaultGrouping(value)); }}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        grouping={grouping}
        setGrouping={setGrouping}
        productType={productType}
        setProductType={setProductType}
        metric={metric}
        setMetric={setMetric}
        salespersonId={salespersonId}
        setSalespersonId={setSalespersonId}
        salespeople={salespeople}
        viceDirectorId={viceDirectorId || effectiveViceDirectorId}
        setViceDirectorId={setViceDirectorId}
        viceDirectors={viceDirectors}
        allowSalesperson={canSelectSalesperson}
        allowViceDirector={canSelectBranch && viceDirector}
      />
      {vdAnalytics ? <ViceDirectorSummary analytics={vdAnalytics} /> : <SummaryCards analytics={analytics} />}
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">VERIFIED PERFORMANCE</p><h2>{chartMetricLabel(metric)}</h2></div><span className="muted">Updated automatically</span></div>
          <SalesLineChart analytics={analytics} grouping={grouping} metric={metric} />
          {analytics.buckets.length > 0 && <div className="chart-legend"><span className="legend-dot" />{chartMetricLabel(metric)} <span className="muted">· Tooltips include sales count and PHP collection</span></div>}
        </article>
        <article className="panel">
          <p className="eyebrow">PERIOD EXTREMES</p>
          <h2>Collection range</h2>
          <dl className="insight-list">
            <div><dt>Highest period</dt><dd>{analytics.summary.highestPeriod.bucket ? formatBucket(analytics.summary.highestPeriod.bucket, grouping) : '—'}<strong>{formatMoney(analytics.summary.highestPeriod.amount)}</strong></dd></div>
            <div><dt>Lowest period</dt><dd>{analytics.summary.lowestPeriod.bucket ? formatBucket(analytics.summary.lowestPeriod.bucket, grouping) : '—'}<strong>{formatMoney(analytics.summary.lowestPeriod.amount)}</strong></dd></div>
            <div><dt>Down/payment collection</dt><dd><strong>{formatMoney(analytics.summary.downPaymentCollection)}</strong></dd></div>
          </dl>
        </article>
      </section>
      {vdAnalytics && <MemberPerformanceTable analytics={vdAnalytics} />}
    </>
  );
}

function ViceDirectorSummary({ analytics }: { analytics: ViceDirectorAnalytics }) {
  const cards = [
    [Users, 'Genealogy members', analytics.summary.totalMembers],
    [Users, 'Active accounts', analytics.summary.activeMembers],
    [Users, 'Inactive accounts', analytics.summary.inactiveMembers],
    [ShoppingBag, 'Members with verified sales', analytics.summary.membersWithSalesActivity],
    [Network, 'No sales activity', analytics.summary.membersWithNoSalesActivity],
    [TrendingUp, 'New members', analytics.summary.newMembers],
    [Clock3, 'Pending payments', formatMoney(analytics.summary.pendingPaymentAmount)],
    [Banknote, 'Overdue payments', formatMoney(analytics.summary.overduePaymentAmount)],
  ] as const;
  return <section className="metric-grid vd-metric-grid">{cards.map(([Icon, label, value]) => <article className="metric" key={label}><div className="metric-icon"><Icon /></div><p>{label}</p><strong>{value}</strong></article>)}</section>;
}

function MemberPerformanceTable({ analytics }: { analytics: ViceDirectorAnalytics }) {
  if (!analytics.members.length) return <section className="panel"><EmptyState title="No genealogy members" body="No authorized members were found for this Vice Director." /></section>;
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">GENEALOGY PERFORMANCE</p><h2>Member performance</h2></div><span className="muted">{analytics.members.length} members</span></div><div className="table-wrap"><table><caption className="sr-only">Vice Director member performance</caption><thead><tr><th>Member</th><th>Role</th><th>Account status</th><th>Direct referrals</th><th>Verified sales</th><th>Verified collection</th><th>Last sale</th><th>Performance</th></tr></thead><tbody>{analytics.members.map((member) => <tr key={member.memberId}><td><strong>{member.memberName}</strong></td><td>{member.role}</td><td><StatusChip value={member.accountStatus} /></td><td>{member.directReferrals}</td><td>{member.verifiedSaleCount}</td><td>{formatMoney(member.totalVerifiedCollection)}</td><td>{member.lastSaleDate ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(member.lastSaleDate)) : '—'}</td><td><span className={member.performanceLabel.startsWith('No ') ? 'performance-muted' : 'performance-positive'}>{member.performanceLabel || performanceLabel(member.verifiedSaleCount)}</span></td></tr>)}</tbody></table></div></section>;
}

export function DashboardPage({ viceDirector = false }: { viceDirector?: boolean }) {
  const { role } = useAuth();
  if (!viceDirector && role === 'super_admin') return <SuperAdminDashboard />;
  return <AnalyticsPage viceDirector={viceDirector} />;
}
