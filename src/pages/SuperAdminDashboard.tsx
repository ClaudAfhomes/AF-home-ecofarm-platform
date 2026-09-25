import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BadgeCheck, Banknote, Clock3, Coins, CreditCard, ShoppingBag, UserCheck, UserX, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SuperAdminLineChart } from '../components/SuperAdminLineChart';
import { ErrorState, LoadingState } from '../components/States';
import { defaultGrouping, formatBucket, getAnalyticsRange, type AnalyticsPeriod } from '../lib/analytics';
import { formatMoney } from '../lib/format';
import { subscribeToOperations } from '../lib/realtime';
import { fetchSuperAdminDashboard, type SuperAdminDashboard as DashboardData } from '../services/operations';

const periods: Array<[AnalyticsPeriod, string]> = [['today','Today'],['week','Week'],['month','Month'],['year','Year'],['custom','Custom']];
const queueMeta = {
  paymentVerification: ['Payment verification', '/finance'], cardActivation: ['Card activation', '/finance'],
  finalQualification: ['Final qualification', ''], ostApplications: ['Pending OST applications', '/ost/applications'],
  commissionPayout: ['Commission payout review', ''],
} as const;

function Kpis({ data }: { data: DashboardData }) {
  const k = data.kpis;
  const cards = [
    [ShoppingBag,'Verified sales',k.verifiedSales],[Banknote,'Verified collections',formatMoney(k.verifiedCollections)],
    [CreditCard,'Active VIP memberships',k.activeMemberships],[Clock3,'Pending accounts',k.pendingAccounts],
    [Clock3,'Down-payment accounts',k.downPaymentAccounts],[Clock3,'Overdue accounts',k.overdueAccounts],
    [Coins,'Points issued',k.pointsIssued.toLocaleString()],[Coins,'Points redeemed',k.pointsRedeemed.toLocaleString()],
    [BadgeCheck,'Pending final qualifications',k.pendingFinalQualifications ?? 'Not configured'],
    [Banknote,'Earned / unpaid OST commission',k.earnedUnpaidCommissions == null ? 'Not configured' : formatMoney(k.earnedUnpaidCommissions)],
    [UserCheck,'Active sellers',k.activeSellers],[UserX,'Inactive sellers',k.inactiveSellers],
    [Users,'Active employees',k.activeEmployees],[Users,'Inactive employees',k.inactiveEmployees],
  ] as const;
  return <section className="super-metric-grid">{cards.map(([Icon,label,value]) => <article className="metric" key={label}><div className="metric-icon"><Icon /></div><p>{label}</p><strong className={value === 'Not configured' ? 'metric-unavailable' : ''}>{value}</strong></article>)}</section>;
}

function Queues({ queues }: { queues: DashboardData['queues'] }) {
  return <section className="panel super-queues"><div className="panel-heading"><div><p className="eyebrow">ACTION CENTER</p><h2>Operational queues</h2></div></div><div className="queue-grid">
    {(Object.keys(queueMeta) as Array<keyof typeof queueMeta>).map((key) => { const queue=queues[key]; const [label,path]=queueMeta[key]; return <article className="queue-card" key={key}><div><h3>{label}</h3><strong>{queue.available ? queue.count ?? 0 : 'Coming in a later phase'}</strong></div>{queue.available && queue.items.length ? <ul>{queue.items.map((item) => <li key={item.id}><span>{item.label}</span><small>{item.detail}</small></li>)}</ul> : <p>{queue.available ? 'No items need action.' : 'No production value is shown until this workflow exists.'}</p>}{queue.available && path ? <Link className="text-button" to={path}>Review queue →</Link> : null}</article>; })}
  </div></section>;
}

export function SuperAdminDashboard() {
  const queryClient=useQueryClient();
  const [period,setPeriod]=useState<AnalyticsPeriod>('month'); const [customFrom,setCustomFrom]=useState(''); const [customTo,setCustomTo]=useState('');
  const grouping=defaultGrouping(period); const range=useMemo(()=>getAnalyticsRange(period,customFrom,customTo),[period,customFrom,customTo]);
  const customReady=period!=='custom'||Boolean(customFrom&&customTo);
  const query=useQuery({queryKey:['super-admin-dashboard',range.from,range.to,grouping],queryFn:()=>fetchSuperAdminDashboard({from:range.from,to:range.to,grouping}),enabled:customReady});
  useEffect(()=>subscribeToOperations(()=>void queryClient.invalidateQueries({queryKey:['super-admin-dashboard']})),[queryClient]);
  if (!customReady) return <><DashboardHeader/><Filters period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/><section className="panel"><div className="state"><h3>Select a custom range</h3><p>Choose both start and end dates to load verified data.</p></div></section></>;
  if (query.isLoading) return <LoadingState label="Loading verified Super Admin analytics…"/>;
  if (query.error) return <ErrorState message={query.error.message} retry={()=>void query.refetch()}/>;
  if (!query.data) return <ErrorState message="The dashboard returned no data." retry={()=>void query.refetch()}/>;
  const d=query.data;
  return <><DashboardHeader/><Filters period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo}/><Kpis data={d}/>
    <section className="dashboard-grid super-dashboard-grid"><article className="panel"><div className="panel-heading"><div><p className="eyebrow">VERIFIED PERFORMANCE</p><h2>AF Homes activity</h2></div><span className="muted">Real production records only</span></div><SuperAdminLineChart data={d.series} grouping={grouping}/></article>
    <article className="panel"><p className="eyebrow">SALES PERIODS</p><h2>High and low</h2><dl className="insight-list"><div><dt>Highest</dt><dd>{d.extremes.highest.bucket?formatBucket(d.extremes.highest.bucket,grouping):'—'}<strong>{d.extremes.highest.cardSales} sales · {formatMoney(d.extremes.highest.collections)}</strong></dd></div><div><dt>Lowest</dt><dd>{d.extremes.lowest.bucket?formatBucket(d.extremes.lowest.bucket,grouping):'—'}<strong>{d.extremes.lowest.cardSales} sales · {formatMoney(d.extremes.lowest.collections)}</strong></dd></div></dl></article></section>
    <Queues queues={d.queues}/><section className="panel"><div className="panel-heading"><div><p className="eyebrow">GOVERNANCE</p><h2>Recent activity</h2></div><Link className="text-button" to="/audit">View audit log →</Link></div>{d.activity.length?<ol className="activity-feed">{d.activity.map((item)=><li key={item.id}><Activity/><div><strong>{item.action.replaceAll('_',' ')}</strong><span>{item.actorName} · {item.entityType}</span></div><time>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.createdAt))}</time></li>)}</ol>:<div className="state compact"><h3>No recent activity</h3><p>Audited actions will appear here.</p></div>}</section></>;
}

function DashboardHeader(){return <header className="page-header"><div><p className="eyebrow">SUPER ADMIN CONTROL CENTER</p><h1>AF Homes overview</h1><p>Verified sales, collections, memberships, points, staffing, and operational work in one view.</p></div><span className="live-dot">Live</span></header>}
function Filters({period,setPeriod,customFrom,setCustomFrom,customTo,setCustomTo}:{period:AnalyticsPeriod;setPeriod:(v:AnalyticsPeriod)=>void;customFrom:string;setCustomFrom:(v:string)=>void;customTo:string;setCustomTo:(v:string)=>void}){return <div className="analytics-filters"><div className="period-tabs" aria-label="Dashboard period">{periods.map(([value,label])=><button className={period===value?'active':''} key={value} onClick={()=>setPeriod(value)}>{label}</button>)}</div>{period==='custom'?<div className="filter-row custom-range"><label>From<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label>To<input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label></div>:null}</div>}
