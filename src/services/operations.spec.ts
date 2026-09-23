import { describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }));

describe('QR verification contract', () => {
  it('preserves duplicate-scan status returned by the secure RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'duplicate', message: 'This QR code has already been used.' }, error: null });
    const { scanQrCode } = await import('./operations');
    await expect(scanQrCode('opaque-token-123')).resolves.toMatchObject({ status: 'duplicate' });
    expect(rpc).toHaveBeenCalledWith('scan_qr_code', { p_token: 'opaque-token-123', p_referred_member_id: null });
  });
});
