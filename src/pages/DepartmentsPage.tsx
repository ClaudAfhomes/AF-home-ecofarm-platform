import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { createDepartment, listDepartments, updateDepartment, type Department } from '../services/operations';

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['departments'], queryFn: () => listDepartments(true) });
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const mutation = useMutation({ mutationFn: () => editing === 'new' ? createDepartment(name, description) : updateDepartment({ ...editing!, name, description: description || null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['departments'] }); setEditing(null); } });
  const open = (department: Department | 'new') => { setEditing(department); setName(department === 'new' ? '' : department.name); setDescription(department === 'new' ? '' : department.description ?? ''); };
  const toggle = useMutation({ mutationFn: (department: Department) => updateDepartment({ ...department, is_active: !department.is_active }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }) });
  return <>
    <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>Department Management</h1><p>Maintain accountable teams. Departments with active staff must be reassigned before deactivation.</p></div><button className="primary" onClick={() => open('new')}><Plus /> Add department</button></header>
    <section className="panel">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : <DataTable rows={query.data ?? []} caption="Departments" columns={[
      { key: 'name', label: 'Department' }, { key: 'description', label: 'Description' }, { key: 'is_active', label: 'Status', render: (row) => <StatusChip value={row.is_active ? 'active' : 'inactive'} /> },
      { key: 'actions', label: 'Actions', render: (row) => <div className="row-actions"><button className="text-button" onClick={() => open(row)}>Edit</button><button className="text-button" onClick={() => toggle.mutate(row)}>{row.is_active ? 'Deactivate' : 'Reactivate'}</button></div> },
    ]} />}{toggle.error ? <p className="inline-error">{toggle.error.message}</p> : null}</section>
    {editing ? <div className="dialog-backdrop"><form className="dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><h2>{editing === 'new' ? 'Add department' : 'Edit department'}</h2><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>{mutation.error ? <p className="inline-error">{mutation.error.message}</p> : null}<div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary">Save department</button></div></form></div> : null}
  </>;
}
