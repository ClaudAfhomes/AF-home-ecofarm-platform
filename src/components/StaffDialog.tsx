import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import type { EmploymentStatus } from '../lib/database.types';
import { allowedParentRoles, SALES_ROLES } from '../lib/staff-management';
import {
  inviteStaff,
  listDepartments,
  listRoles,
  listStaff,
  updateStaff,
  type StaffProfile,
} from '../services/operations';

const statuses: EmploymentStatus[] = ['active', 'inactive', 'suspended', 'resigned'];
export function StaffDialog({ profile, onClose }: { profile?: StaffProfile; onClose: () => void }) {
  const { profile: signedInProfile } = useAuth();
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const departments = useQuery({ queryKey: ['departments', 'active'], queryFn: () => listDepartments(false) });
  const members = useQuery({
    queryKey: ['staff-parent-options'],
    queryFn: () => listStaff({ page: 0, pageSize: 250, search: '', role: '', status: 'active', department: '' }),
  });
  const [email, setEmail] = useState(profile?.email ?? '');
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [employeeNo, setEmployeeNo] = useState(profile?.employee_no ?? '');
  const [roleId, setRoleId] = useState(profile?.role_id ?? '');
  const [departmentId, setDepartmentId] = useState(profile?.department_id ?? '');
  const [status, setStatus] = useState<EmploymentStatus>(profile?.employment_status ?? 'active');
  const [parentId, setParentId] = useState(profile?.genealogy_parent_id ?? '');
  const [reason, setReason] = useState('');
  const selectedRole = roles.data?.find((role) => role.id === roleId);
  const parentRoles = allowedParentRoles(selectedRole?.slug);
  const parentOptions = (members.data?.rows ?? []).filter(
    (member) => member.id !== profile?.id && parentRoles.has(member.roles.slug),
  );
  const isSelf = profile?.id === signedInProfile?.id;
  const mutation = useMutation({
    mutationFn: () => profile
      ? updateStaff(profile.id, {
          fullName, roleId, departmentId: departmentId || null, employmentStatus: status,
          phone: phone || null, employeeNo: employeeNo || null, parentId: parentId || null, reason,
        })
      : inviteStaff({ email, fullName, roleId, departmentId: departmentId || null, phone: phone || null, employeeNo: employeeNo || null, parentId: parentId || null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['staff'] }),
        queryClient.invalidateQueries({ queryKey: ['genealogy'] }),
        queryClient.invalidateQueries({ queryKey: ['audit_logs'] }),
      ]);
      onClose();
    },
  });
  const placementRequired = selectedRole && SALES_ROLES.has(selectedRole.slug) && selectedRole.slug !== 'vice_director';

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <h2 id="staff-dialog-title">{profile ? 'Edit staff or member' : 'Invite staff or member'}</h2>
        <div className="form-grid">
          <label>Email<input type="email" required disabled={Boolean(profile)} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Full name<input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label>Employee number<input value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} /></label>
          <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label>Role<select required disabled={isSelf} value={roleId} onChange={(event) => { setRoleId(event.target.value); setParentId(''); }}><option value="">Select role</option>{roles.data?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label>Department<select disabled={isSelf} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">No department</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          {profile ? <label>Status<select disabled={isSelf} value={status} onChange={(event) => setStatus(event.target.value as EmploymentStatus)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
          {selectedRole && SALES_ROLES.has(selectedRole.slug) ? <label>Immediate referral parent<select required={placementRequired} disabled={isSelf || selectedRole.slug === 'vice_director'} value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">{selectedRole.slug === 'vice_director' ? 'Genealogy root' : 'Select parent'}</option>{parentOptions.map((member) => <option key={member.id} value={member.id}>{member.full_name} — {member.roles.name}</option>)}</select></label> : null}
          {profile ? <label className="span-2">Reason for change<textarea required minLength={8} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the immutable audit log" /></label> : null}
        </div>
        {mutation.error ? <p className="inline-error" role="alert">{mutation.error.message}</p> : null}
        {isSelf ? <p className="muted">Your own role, department, status, and placement are locked by the database.</p> : null}
        <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : profile ? 'Save audited change' : 'Send invitation'}</button></div>
      </form>
    </div>
  );
}
