import { beforeEach, describe, expect, it, vi } from 'vitest';

import Swal from 'sweetalert2';

import { notifyError, notifySuccess, notifyWarning } from './notify.js';

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn(() => Promise.resolve()) },
}));

const fire = Swal.fire as unknown as ReturnType<typeof vi.fn>;

describe('notify', () => {
  beforeEach(() => {
    fire.mockClear();
  });

  it('shows a centered auto-dismissing success notice', () => {
    notifySuccess({ title: 'Policy updated', message: 'Saved.' });
    expect(fire).toHaveBeenCalledTimes(1);
    const [config] = fire.mock.calls[0] as [Record<string, unknown>];
    expect(config.toast).toBe(true);
    expect(config.position).toBe('center');
    expect(config.icon).toBe('success');
    expect(config.title).toBe('Policy updated');
    expect(config.text).toBe('Saved.');
    expect(config.showConfirmButton).toBe(false);
    expect(typeof config.timer).toBe('number');
  });

  it('shows a blocking error modal', () => {
    notifyError({ title: 'Delete failed' });
    const [config] = fire.mock.calls[0] as [Record<string, unknown>];
    expect(config.icon).toBe('error');
    expect(config.title).toBe('Delete failed');
    expect(config.showConfirmButton).not.toBe(false);
  });

  it('shows a warning modal', () => {
    notifyWarning({ title: 'Auth user remains', message: 'details' });
    const [config] = fire.mock.calls[0] as [Record<string, unknown>];
    expect(config.icon).toBe('warning');
    expect(config.title).toBe('Auth user remains');
  });
});
