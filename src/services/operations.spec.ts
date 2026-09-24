import { describe, expect, it, vi } from 'vitest';

const { rpc, from, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc, from, functions: { invoke } } }));

describe('QR verification contract', () => {
  it('preserves duplicate-scan status returned by the secure RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'duplicate', message: 'This QR code has already been used.' }, error: null });
    const { scanQrCode } = await import('./operations');
    await expect(scanQrCode('opaque-token-123')).resolves.toMatchObject({ status: 'duplicate' });
    expect(rpc).toHaveBeenCalledWith('scan_qr_code', { p_token: 'opaque-token-123', p_referred_member_id: null });
  });
});

describe('staff query contract', () => {
  it('avoids ambiguous department and profile relationship embeds', async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
    const order = vi.fn(() => ({ range }));
    const select = vi.fn((selection: string, options: { count: string }) => {
      void selection;
      void options;
      return { order };
    });
    from.mockReturnValueOnce({ select });

    const { listStaff } = await import('./operations');
    await listStaff({
      page: 0,
      pageSize: 25,
      search: '',
      role: '',
      status: '',
      department: '',
    });

    const selection = select.mock.calls[0]?.[0] ?? '';
    expect(selection).not.toContain('departments(');
    expect(selection).not.toContain('genealogy_parent:profiles');
    expect(select).toHaveBeenCalledWith(expect.stringContaining('roles!inner(name,slug)'), {
      count: 'exact',
    });
    expect(selection).not.toContain('staff_invitations(');
  });

  it('maps invitations to the invited profile by user_id instead of invited_by', async () => {
    const profiles = [{ id: 'invitee-id', email: 'invitee@example.com', department_id: null, genealogy_parent_id: null }];
    const profileRange = vi.fn().mockResolvedValue({ data: profiles, error: null, count: 1 });
    const profileOrder = vi.fn(() => ({ range: profileRange }));
    const invitationIn = vi.fn().mockResolvedValue({ data: [{ user_id: 'invitee-id', status: 'pending', invited_at: '2026-09-24T00:00:00Z', last_sent_at: '2026-09-24T00:00:00Z', accepted_at: null }], error: null });
    from
      .mockReturnValueOnce({ select: vi.fn(() => ({ order: profileOrder })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: invitationIn })) });

    const { listStaff } = await import('./operations');
    const result = await listStaff({ page: 0, pageSize: 25, search: '', role: '', status: '', department: '' });

    expect(from).toHaveBeenCalledWith('staff_invitations');
    expect(invitationIn).toHaveBeenCalledWith('user_id', ['invitee-id']);
    expect(result.rows[0]?.staff_invitations[0]).toMatchObject({ user_id: 'invitee-id', status: 'pending' });
  });
});

describe('admin-users error contract', () => {
  it('shows the function JSON error instead of the generic SDK message', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ code: 'EMAIL_EXISTS', error: 'A staff profile already exists for this email address.' }), { status: 409 }),
      },
    });
    const { inviteStaff } = await import('./operations');
    await expect(inviteStaff({
      email: 'existing@example.com',
      fullName: 'Existing User',
      roleId: 'role-id',
      departmentId: null,
      phone: null,
      employeeNo: null,
      parentId: null,
    })).rejects.toThrow('A staff profile already exists for this email address.');
  });
});
