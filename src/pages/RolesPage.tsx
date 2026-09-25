import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '../components/States';
import { configureRolePermission, createCustomRole, listRoleRegistry, type Permission } from '../services/operations';

type Scope = 'own' | 'branch' | 'department' | 'global';
type DraftGrant = { enabled: boolean; scope: Scope };
const dependencyNotes: Record<string, string> = {
  'membership.activate': 'Card activation requires Payments View.',
  'payments.verify': 'Payment verification requires Payments View.',
  'customer_documents.view_private': 'Private documents require Customer View.',
  'pos.redeem': 'Redemption requires QR Scan/Validate and an active membership.',
};

export function RolesPage() {
  const queryClient = useQueryClient();
  const registry = useQuery({ queryKey: ['role-registry'], queryFn: listRoleRegistry });
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, DraftGrant>>({});
  const [reason, setReason] = useState('');
  const [newRole, setNewRole] = useState({ name: '', description: '' });
  const selected = registry.data?.roles.find((role) => role.id === selectedId) ?? registry.data?.roles[0];
  const grants = useMemo(() => new Map((registry.data?.grants ?? []).filter((grant) => grant.role_id === selected?.id).map((grant) => [grant.permission_id, grant])), [registry.data?.grants, selected?.id]);
  const valueFor = (permission: NonNullable<typeof registry.data>['permissions'][number]): DraftGrant => draft[permission.key] ?? { enabled: grants.has(permission.id), scope: grants.get(permission.id)?.data_scope ?? 'own' };
  const grouped = useMemo(() => Object.entries((registry.data?.permissions ?? []).reduce<Record<string, Permission[]>>((result, permission) => {
    const key = `${permission.group_key ?? 'other'}|${permission.module_key ?? permission.module}`;
    (result[key] ??= []).push(permission); return result;
  }, {})), [registry.data?.permissions]);
  const save = useMutation({ mutationFn: async () => {
    if (!selected) throw new Error('Select a role.');
    if (reason.trim().length < 8) throw new Error('Enter a meaningful reason with at least 8 characters.');
    await Promise.all(Object.entries(draft).map(([permissionKey, value]) => configureRolePermission({ roleId: selected.id, permissionKey, ...value, reason })));
  }, onSuccess: async () => { setDraft({}); setReason(''); await queryClient.invalidateQueries({ queryKey: ['role-registry'] }); } });
  const create = useMutation({ mutationFn: () => createCustomRole(newRole.name, newRole.description), onSuccess: async (role) => { setNewRole({ name: '', description: '' }); await queryClient.invalidateQueries({ queryKey: ['role-registry'] }); if (role) setSelectedId(role.id); } });
  if (registry.isLoading) return <LoadingState label="Loading permission registry…" />;
  if (registry.error || !registry.data) return <ErrorState message={registry.error?.message ?? 'Permission registry unavailable.'} retry={() => void registry.refetch()} />;
  const roles = registry.data.roles.filter((role) => `${role.name} ${role.slug}`.toLowerCase().includes(search.toLowerCase()));
  const assigned = registry.data.profiles.filter((profile) => profile.role_id === selected?.id);
  const protectedTemplate = selected?.slug === 'super_admin';
  return <>
    <header className="page-header"><div><h1>Roles &amp; Permissions</h1><p>Configure action-level access, data scope, and audited role templates.</p></div></header>
    <section className="role-editor">
      <aside className="panel role-list"><input aria-label="Search roles" placeholder="Search roles…" value={search} onChange={(event) => setSearch(event.target.value)} />{roles.map((role) => <button key={role.id} className={selected?.id === role.id ? 'role-option active' : 'role-option'} onClick={() => { setSelectedId(role.id); setDraft({}); }}><strong>{role.name}</strong><span>{role.is_system ? 'System role' : 'Custom role'} · {registry.data.profiles.filter((profile) => profile.role_id === role.id).length} members</span></button>)}<form className="create-role" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><h2>Create custom role</h2><input required minLength={2} placeholder="Role name" value={newRole.name} onChange={(event) => setNewRole({ ...newRole, name: event.target.value })} /><textarea placeholder="Description" value={newRole.description} onChange={(event) => setNewRole({ ...newRole, description: event.target.value })} /><button className="secondary" disabled={create.isPending}>Create role</button>{create.error ? <p className="inline-error">{create.error.message}</p> : null}</form></aside>
      <div className="role-permissions"><section className="panel role-summary"><div><h2>{selected?.name}</h2><p>{selected?.description || 'No role description.'}</p></div><div><strong>{Object.values(draft).length ? 'Unsaved changes' : 'Saved template'}</strong><span>{assigned.length} assigned users</span></div></section>{protectedTemplate ? <div className="access-notice"><strong>Protected Super Admin policy</strong><span>Super Admin receives governance access globally, except customer card usage and point redemption. This template cannot be weakened here.</span></div> : null}
        {grouped.map(([groupModule, permissions]) => { const [group, module] = groupModule.split('|'); const enabledCount = permissions.filter((permission) => valueFor(permission).enabled).length; return <section className="panel permission-card" key={groupModule}><header><div><small>{group.replaceAll('_', ' ')}</small><h2>{module.replaceAll('_', ' ')}</h2></div><label className="check"><input type="checkbox" disabled={protectedTemplate} checked={enabledCount === permissions.length} onChange={(event) => setDraft((current) => ({ ...current, ...Object.fromEntries(permissions.map((permission) => [permission.key, { ...valueFor(permission), enabled: event.target.checked }])) }))} /> Module enabled</label></header>{permissions.map((permission) => { const value = valueFor(permission); return <div className="permission-action" key={permission.key}><label className="check"><input type="checkbox" disabled={protectedTemplate} checked={value.enabled} onChange={(event) => setDraft((current) => ({ ...current, [permission.key]: { ...value, enabled: event.target.checked } }))} /><span><strong>{permission.name}</strong><small>{permission.description}</small>{dependencyNotes[permission.key] ? <em>{dependencyNotes[permission.key]}</em> : null}</span></label>{permission.scope_kind !== 'none' ? <select aria-label={`${permission.name} data scope`} disabled={protectedTemplate || !value.enabled} value={value.scope} onChange={(event) => setDraft((current) => ({ ...current, [permission.key]: { ...value, scope: event.target.value as Scope } }))}><option value="own">Own</option><option value="branch">Branch</option><option value="department">Department</option><option value="global">Global</option></select> : null}</div>; })}</section>; })}
        <section className="panel effective-summary"><h2>Effective access summary</h2><p>{registry.data.permissions.filter((permission) => valueFor(permission).enabled).length} actions enabled for this template.</p><h3>Assigned users</h3>{assigned.length ? <ul>{assigned.map((profile) => <li key={profile.id}>{profile.full_name}</li>)}</ul> : <p className="muted">No users currently assigned.</p>}<h3>Permission audit history</h3>{registry.data.audit.filter((event) => event.entity_id === selected?.id).slice(0, 8).map((event) => <p key={event.id}><strong>{event.action}</strong> · {new Date(event.created_at).toLocaleString()}</p>)}</section>
        {!protectedTemplate ? <div className="permission-save"><label>Reason for changes<input value={reason} minLength={8} onChange={(event) => setReason(event.target.value)} placeholder="Required for audit history" /></label><button className="primary" disabled={!Object.keys(draft).length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save permission template'}</button>{save.error ? <p className="inline-error">{save.error.message}</p> : null}</div> : null}
      </div>
    </section>
  </>;
}
