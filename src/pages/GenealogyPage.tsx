import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, Search, Table2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { DataTable } from '../components/DataTable';
import { StaffDialog } from '../components/StaffDialog';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { formatMoney } from '../lib/format';
import { supabase } from '../lib/supabase';
import { listStaff, type StaffProfile } from '../services/operations';
import type { Database } from '../lib/database.types';

type Node = Database['public']['Functions']['genealogy_tree']['Returns'][number];
export function GenealogyPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'tree' | 'table'>('tree');
  const [editing, setEditing] = useState<StaffProfile | null>(null);
  const query = useQuery({ queryKey: ['genealogy'], queryFn: async () => { const { data, error } = await supabase.rpc('genealogy_tree'); if (error) throw error; return data as Node[]; } });
  const staff = useQuery({ queryKey: ['staff', 'genealogy-editor'], queryFn: () => listStaff({ page: 0, pageSize: 250, search: '', role: '', status: '', department: '' }), enabled: isSuperAdmin });
  const rows = useMemo(() => (query.data ?? []).filter((node) => `${node.full_name} ${node.role_name}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  const edit = (id: string) => setEditing(staff.data?.rows.find((profile) => profile.id === id) ?? null);
  return <>
    <header className="page-header"><div><p className="eyebrow">GENEALOGY</p><h1>Member Management</h1><p>{isSuperAdmin ? 'Search, inspect, and correct validated sales placements with a mandatory audit reason.' : 'Your Vice Director genealogy only. Other organizations are isolated by the database.'}</p></div><button className="secondary" onClick={() => setView((value) => value === 'tree' ? 'table' : 'tree')}>{view === 'tree' ? <Table2 /> : <Network />}{view === 'tree' ? 'Table view' : 'Tree view'}</button></header>
    <section className="panel"><div className="toolbar"><label className="search"><Search /><span className="sr-only">Search genealogy</span><input placeholder="Search members…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span>{rows.length} members</span></div>
      {query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.refetch()} /> : !rows.length ? <EmptyState title="No genealogy members" /> : view === 'tree' ? <div className="tree">{rows.map((node) => <article className="tree-node" key={node.id} style={{ marginLeft: `${Math.min(node.depth, 6) * 28}px` }}><span className={node.is_active ? 'avatar active' : 'avatar'}>{node.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{node.full_name}</strong><p>{node.role_name} · {node.direct_referrals} direct · {node.total_descendants} descendants · {formatMoney(node.sales_total)}</p></div><StatusChip value={node.employment_status} />{isSuperAdmin ? <button className="text-button" onClick={() => edit(node.id)}>Correct</button> : null}</article>)}</div> : <DataTable rows={rows} caption="Genealogy members" columns={[
        { key: 'full_name', label: 'Member' }, { key: 'role_name', label: 'Role' }, { key: 'employment_status', label: 'Status', render: (row) => <StatusChip value={row.employment_status} /> }, { key: 'direct_referrals', label: 'Direct' }, { key: 'total_descendants', label: 'Descendants' }, { key: 'sales_total', label: 'Verified sales', render: (row) => formatMoney(row.sales_total) }, { key: 'actions', label: 'Actions', render: (row) => isSuperAdmin ? <button className="text-button" onClick={() => edit(row.id)}>Correct placement</button> : '—' },
      ]} />}
    </section>
    {editing ? <StaffDialog profile={editing} onClose={() => setEditing(null)} /> : null}
  </>;
}
