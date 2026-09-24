import { describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }));

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
    const select = vi.fn((_selection: string, _options: { count: string }) => ({ order }));
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
  });
});
