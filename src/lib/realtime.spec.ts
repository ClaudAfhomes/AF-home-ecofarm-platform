import { describe, expect, it, vi } from 'vitest';

const { channel, removeChannel } = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock('./supabase', () => ({ supabase: { channel, removeChannel } }));

describe('operations realtime subscriptions', () => {
  it('subscribes analytics invalidation to sales and payment changes', async () => {
    const subscribe = vi.fn();
    const on = vi.fn();
    on.mockImplementation(() => ({ on, subscribe }));
    channel.mockReturnValue({ on, subscribe });
    const { subscribeToOperations } = await import('./realtime');
    const cleanup = subscribeToOperations(vi.fn());
    expect(on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, expect.any(Function));
    expect(on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, expect.any(Function));
    expect(subscribe).toHaveBeenCalled();
    cleanup();
    expect(removeChannel).toHaveBeenCalled();
  });
});
