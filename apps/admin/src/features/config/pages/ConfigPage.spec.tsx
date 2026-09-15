import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN, MOCK_STAFF_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { resetConfigStore } from '../../../mock/configMockStore';
import { ConfigPage } from './ConfigPage';

describe('ConfigPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    resetConfigStore();
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders page header with production copy', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('System Configuration')).toBeInTheDocument();
    expect(
      screen.getByText(/Manage platform parameters, commission rates, and qualification programs/),
    ).toBeInTheDocument();
  });

  it('renders config grouped by category', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Commissions')).toBeInTheDocument();
    expect(screen.getByText('Withdrawals')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Vouchers')).toBeInTheDocument();
  });

  it('formats config values without showing raw keys', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Direct Commission Rate')).toBeInTheDocument();
    expect(screen.getByText('8.00%')).toBeInTheDocument();
    expect(screen.getByText('Minimum Withdrawal Amount')).toBeInTheDocument();
    expect(screen.getByText('₱100.00')).toBeInTheDocument();
    expect(screen.queryByText('COMMISSION_DIRECT_RATE')).not.toBeInTheDocument();
  });

  it('renders Programs section with Domestic and Abroad', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Programs')).toBeInTheDocument();
    expect(await screen.findByText('Domestic Program')).toBeInTheDocument();
    expect(screen.getByText('Abroad Program')).toBeInTheDocument();
    expect(screen.getByText('DOMESTIC')).toBeInTheDocument();
    expect(screen.getByText('ABROAD')).toBeInTheDocument();
  });

  it('shows program descriptions', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Domestic Program');
    expect(screen.getByText(/For members based in the Philippines/)).toBeInTheDocument();
    expect(screen.getByText(/Overseas Filipino Workers/)).toBeInTheDocument();
  });

  it('saves via PATCH and persists after refetch', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    expect(await screen.findByText('Edit Direct Commission Rate')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /value/i });
    expect(input).toHaveValue('8.00');

    fireEvent.change(input, { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('10.00%')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A fresh mount refetches from the server — the edit must survive
    // navigation instead of living in local component state.
    first.unmount();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('10.00%')).toBeInTheDocument();
  });

  it('is read-only for non-super-admin staff (no Edit affordance)', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_STAFF_ADMIN });
    await screen.findByText('Direct Commission Rate');

    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.getByText('8.00%')).toBeInTheDocument();
  });

  it('shows an inline error when the save request fails', async () => {
    const user = userEvent.setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input).includes('/admin/config/') &&
        (init?.method ?? 'GET').toUpperCase() === 'PATCH'
      ) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL',
              message: 'Database unavailable.',
              timestamp: new Date().toISOString(),
            },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return (originalFetch as typeof fetch)(input, init);
    }) as typeof fetch;

    try {
      renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
      await screen.findByText('Direct Commission Rate');

      const editButtons = screen.getAllByRole('button', { name: /Edit/ });
      await user.click(editButtons[0]!);

      const input = await screen.findByRole('textbox', { name: /value/i });
      fireEvent.change(input, { target: { value: '10' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/Database unavailable/);
      // The dialog stays open so the operator can retry.
      expect(screen.getByText('Edit Direct Commission Rate')).toBeInTheDocument();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders Gender Options under the Registration category', async () => {
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Registration')).toBeInTheDocument();
    expect(screen.getByText('Gender Options')).toBeInTheDocument();
    expect(screen.getByText('Male, Female, Others')).toBeInTheDocument();
  });

  it('edits Gender Options with Save enabled while typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Gender Options');

    await user.click(screen.getByRole('button', { name: 'Edit Gender Options' }));

    expect(await screen.findByText('Edit Gender Options')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /value/i });
    expect(input).toHaveValue('Male, Female, Others');

    fireEvent.change(input, { target: { value: 'Male, Female, Others, X' } });
    // Non-numeric list values must not trigger the numeric validator.
    expect(screen.queryByText('Must be a number')).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).not.toBeDisabled();
    await user.click(save);

    expect(await screen.findByText('Male, Female, Others, X')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects an empty Gender Options value', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Gender Options');

    await user.click(screen.getByRole('button', { name: 'Edit Gender Options' }));
    const input = await screen.findByRole('textbox', { name: /value/i });
    fireEvent.change(input, { target: { value: '   ' } });

    await waitFor(() => {
      expect(screen.getByText('Value is required')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('cancels edit without persisting changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    const input = screen.getByRole('textbox', { name: /value/i });
    await user.clear(input);
    await user.type(input, '99');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('8.00%')).toBeInTheDocument();
  });

  it('validates non-numeric input and disables Save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    const input = screen.getByRole('textbox', { name: /value/i });
    fireEvent.change(input, { target: { value: 'abc' } });

    await waitFor(() => {
      expect(screen.getByText('Must be a number')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('validates rate out of range and shows error', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigPage />, { user: MOCK_ADMIN });
    await screen.findByText('Direct Commission Rate');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    await user.click(editButtons[0]!);

    const input = screen.getByRole('textbox', { name: /value/i });
    fireEvent.change(input, { target: { value: '150' } });

    await waitFor(() => {
      expect(screen.getByText('Rate must be between 0 and 100')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
