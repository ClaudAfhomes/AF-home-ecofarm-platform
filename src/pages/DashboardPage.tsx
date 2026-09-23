import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Clock3, Network, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/format';
import { subscribeToOperations } from '../lib/realtime';
import { LoadingState, ErrorState } from '../components/States';
import { useAuth } from '../auth/AuthProvider';

type Metrics = { customers: number; sales: number; pendingPayments: number; activeMembers: number; revenue: string; overdue: number };
async function loadMetrics(): Promise<Metrics> { const { data, error } = await supabase.rpc('dashboard_metrics'); if (error) throw error; return data as unknown as Metrics; }
export function DashboardPage({ viceDirector = false }: { viceDirector?: boolean }) {
  const { role, profile } = useAuth();
  const client = useQueryClient(); const query = useQuery({ queryKey: ['dashboard-metrics'], queryFn: loadMetrics });
  useEffect(() => subscribeToOperations(() => void client.invalidateQueries({ queryKey: ['dashboard-metrics'] })), [client]);
  if (query.isLoading) return <LoadingState />; if (query.error) return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  const m = query.data!; const roleLabel = `${role?.replaceAll('_', ' ')}${profile?.is_test_account ? ' · Test Account' : ''}`; const cards = [[Users, viceDirector ? 'Genealogy members' : 'Customers', viceDirector ? m.activeMembers : m.customers], [ShoppingBag, 'Sales', m.sales], [Banknote, 'Verified revenue', formatMoney(m.revenue)], [Clock3, 'Pending payments', m.pendingPayments], [TrendingUp, 'Overdue', m.overdue], [Network, 'Active members', m.activeMembers]] as const;
  return <><header className="page-header"><div><p className="eyebrow">LIVE OPERATIONS</p><h1>{viceDirector ? 'Vice Director Analytics' : 'Operations Dashboard'}</h1><p>Role: <strong>{roleLabel}</strong></p><p>Current activity across AFhomes Ecofarm. Test-account activity is excluded.</p></div><span className="live-dot">Live</span></header><section className="metric-grid">{cards.map(([Icon, label, value]) => <article className="metric" key={label}><div className="metric-icon"><Icon /></div><p>{label}</p><strong>{value}</strong></article>)}</section><section className="dashboard-grid"><article className="panel"><h2>Performance overview</h2><div className="chart-placeholder" aria-label="Sales performance chart"><span style={{ height: '42%' }} /><span style={{ height: '58%' }} /><span style={{ height: '47%' }} /><span style={{ height: '76%' }} /><span style={{ height: '64%' }} /><span style={{ height: '88%' }} /></div></article><article className="panel"><h2>Action center</h2><ul className="action-list"><li><span>Payments awaiting verification</span><strong>{m.pendingPayments}</strong></li><li><span>Overdue spot-cash transactions</span><strong>{m.overdue}</strong></li><li><span>Active genealogy members</span><strong>{m.activeMembers}</strong></li></ul></article></section></>;
}
