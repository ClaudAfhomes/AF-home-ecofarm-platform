import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { StaffDialog } from '../components/StaffDialog';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { formatDate } from '../lib/format';
import { listDepartments, listRoles, listStaff, resendStaffInvitation, type StaffProfile } from '../services/operations';

const pageSize = 10;
export function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [dialog, setDialog] = useState<StaffProfile | 'new' | null>(null);
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => listDepartments(true) });
  const staff = useQuery({ queryKey: ['staff', page, search, role, status, department], queryFn: () => listStaff({ page, pageSize, search, role, status, department }) });
  const resend = useMutation({ mutationFn: resendStaffInvitation, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }) });
  const pages = Math.max(1, Math.ceil((staff.data?.count ?? 0) / pageSize));
  const resetPage = () => setPage(0);
  const queryError = staff.error ?? roles.error ?? departments.error;
  return <>
    <header className="page-header"><div><h1>Users &amp; Accounts</h1><p>Create controlled accounts, assign roles and restrictions, and preserve a complete audit trail.</p></div><button className="primary" onClick={() => setDialog('new')}><Plus /> Create account</button></header>
    <section className="panel table-panel">
      <div className="filters">
        <label className="search"><Search /><span className="sr-only">Search staff</span><input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Name, email, employee no.…" /></label>
        <label>Role<select value={role} onChange={(event) => { setRole(event.target.value); resetPage(); }}><option value="">All roles</option>{roles.data?.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}><option value="">All statuses</option>{['active','inactive','suspended','resigned'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Department<select value={department} onChange={(event) => { setDepartment(event.target.value); resetPage(); }}><option value="">All departments</option>{departments.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {staff.isLoading || roles.isLoading || departments.isLoading ? <LoadingState /> : queryError ? <ErrorState message={queryError.message} retry={() => void Promise.all([staff.refetch(), roles.refetch(), departments.refetch()])} /> : <>
        <DataTable rows={staff.data?.rows ?? []} caption="Staff and members" columns={[
          { key: 'full_name', label: 'Staff member', render: (row) => <div><strong>{row.full_name}</strong><small className="table-subtitle">{row.email}</small></div> },
          { key: 'role', label: 'Role', render: (row) => row.roles.name },
          { key: 'department', label: 'Department', render: (row) => row.departments?.name ?? '—' },
          { key: 'genealogy_parent', label: 'Genealogy parent', render: (row) => row.genealogy_parent?.full_name ?? '—' },
          { key: 'employment_status', label: 'Status', render: (row) => <StatusChip value={row.employment_status} /> },
          { key: 'invitation', label: 'Activation', render: (row) => { const invite = row.staff_invitations[0]; return invite ? <div><StatusChip value={invite.status} /><small className="table-subtitle">{formatDate(invite.invited_at)}</small></div> : 'Provisioned directly'; } },
          { key: 'created_at', label: 'Created', render: (row) => formatDate(row.created_at) },
          { key: 'actions', label: 'Actions', render: (row) => <div className="row-actions"><button className="text-button" onClick={() => setDialog(row)}>Edit</button>{row.staff_invitations[0]?.status === 'pending' ? <button className="text-button" disabled={resend.isPending} onClick={() => resend.mutate(row.id)}>Resend setup email</button> : null}</div> },
        ]} />
        <div className="pagination"><button className="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page + 1} of {pages} · {staff.data?.count ?? 0} records</span><button className="secondary" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      </>}
      {resend.error ? <p className="inline-error" role="alert">{resend.error.message}</p> : null}
    </section>
    <p className="muted">Sensitive account and activation actions are available in the <a href="/audit">Audit Log</a>.</p>
    {dialog ? <StaffDialog profile={dialog === 'new' ? undefined : dialog} onClose={() => setDialog(null)} /> : null}
  </>;
}
