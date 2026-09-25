import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { StaffDialog } from '../components/StaffDialog';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { deleteTestAccount, listStaff, type StaffProfile } from '../services/operations';

export function TestAccountsPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<StaffProfile | 'new' | null>(null);
  const accounts = useQuery({ queryKey: ['staff', 'test-accounts'], queryFn: () => listStaff({ page: 0, pageSize: 100, search: '', role: '', status: '', department: '', testOnly: true }) });
  const remove = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => deleteTestAccount(id, reason), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }) });
  const requestDelete = (row: StaffProfile) => {
    const reason = window.prompt(`Permanently delete ${row.full_name}? Enter an audit reason (at least 8 characters). This is only allowed when the account has no protected history.`);
    if (reason !== null) remove.mutate({ id: row.id, reason });
  };
  return <>
    <header className="page-header"><div><p className="eyebrow">SUPER ADMIN</p><h1>Test Accounts / Staff Accounts</h1><p>Create controlled role accounts, test the shared login, and deactivate them without deleting audit or genealogy history.</p></div><button className="primary" onClick={() => setDialog('new')}><Plus /> Create test account</button></header>
    <section className="panel"><p className="muted">Test activity is excluded from production dashboard analytics. Role and placement remain database-enforced.</p>
      {accounts.isLoading ? <LoadingState /> : accounts.error ? <ErrorState message={accounts.error.message} retry={() => void accounts.refetch()} /> : <DataTable caption="Controlled test accounts" rows={accounts.data?.rows ?? []} columns={[
        { key: 'full_name', label: 'Test account', render: (row) => <div><strong>{row.full_name}</strong><small className="table-subtitle">{row.email}</small></div> },
        { key: 'role', label: 'Role', render: (row) => row.roles.name },
        { key: 'status', label: 'Status', render: (row) => <StatusChip value={row.employment_status} /> },
        { key: 'invitation', label: 'Invitation', render: (row) => <StatusChip value={row.staff_invitations[0]?.status ?? 'provisioned'} /> },
        { key: 'actions', label: 'Actions', render: (row) => <div className="row-actions"><button className="text-button" onClick={() => setDialog(row)}>{row.is_active ? 'Edit / deactivate' : 'Edit / reactivate'}</button><button className="text-button" disabled={remove.isPending} onClick={() => requestDelete(row)}>Delete account</button></div> },
      ]} />}
      {remove.error ? <p className="inline-error" role="alert">{remove.error.message}</p> : null}
    </section>
    {dialog ? <StaffDialog profile={dialog === 'new' ? undefined : dialog} testAccount onClose={() => setDialog(null)} /> : null}
  </>;
}
