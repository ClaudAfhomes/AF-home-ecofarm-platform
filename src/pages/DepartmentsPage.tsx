import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { createDepartment, listDepartmentCounts, listDepartments, listStaff, updateDepartment, type Department } from '../services/operations';

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['departments'], queryFn: () => listDepartments(true) });
  const counts = useQuery({ queryKey: ['department-counts'], queryFn: listDepartmentCounts });
  const leaders = useQuery({ queryKey: ['department-leaders'], queryFn: () => listStaff({ page: 0, pageSize: 250, search: '', role: '', status: 'active', department: '' }) });
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const mutation = useMutation({ mutationFn: () => editing === 'new' ? createDepartment(name, description, leaderId || null) : updateDepartment({ ...editing!, name, description: description || null, accountable_leader_id: leaderId || null }), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['departments'] }), queryClient.invalidateQueries({ queryKey: ['department-counts'] }), queryClient.invalidateQueries({ queryKey: ['audit_logs'] })]); setEditing(null); } });
  const open = (department: Department | 'new') => { setEditing(department); setName(department === 'new' ? '' : department.name); setDescription(department === 'new' ? '' : department.description ?? ''); setLeaderId(department === 'new' ? '' : department.accountable_leader_id ?? ''); };
  const toggle = useMutation({ mutationFn: (department: Department) => updateDepartment({ ...department, is_active: !department.is_active }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }) });
  return <>
    <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>Department Management</h1><p>Maintain accountable teams. Departments with active staff must be reassigned before deactivation.</p></div><button className="primary" onClick={() => open('new')}><Plus /> Add department</button></header>
    <section className="panel">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : <DataTable rows={query.data ?? []} caption="Departments" columns={[
      { key: 'name', label: 'Department' }, { key: 'description', label: 'Description' }, { key: 'is_active', label: 'Status', render: (row) => <StatusChip value={row.is_active ? 'active' : 'inactive'} /> },
      { key: 'leader', label: 'Accountable leader', render: (row) => leaders.data?.rows.find((profile) => profile.id === row.accountable_leader_id)?.full_name ?? '—' },
      { key: 'count', label: 'Assigned profiles', render: (row) => counts.data?.[row.id] ?? 0 },
      { key: 'actions', label: 'Actions', render: (row) => <div className="row-actions"><button className="text-button" onClick={() => open(row)}>Edit</button><button className="text-button" onClick={() => toggle.mutate(row)}>{row.is_active ? 'Deactivate' : 'Reactivate'}</button></div> },
    ]} />}{toggle.error ? <p className="inline-error">{toggle.error.message}</p> : null}</section>
    {editing ? <div className="dialog-backdrop"><form className="dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><h2>{editing === 'new' ? 'Add department' : 'Edit department'}</h2><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Accountable leader<select value={leaderId} onChange={(event) => setLeaderId(event.target.value)}><option value="">No leader assigned</option>{leaders.data?.rows.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} — {profile.roles.name}</option>)}</select></label>{mutation.error ? <p className="inline-error">{mutation.error.message}</p> : null}<div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary">Save department</button></div></form></div> : null}
  </>;
}
