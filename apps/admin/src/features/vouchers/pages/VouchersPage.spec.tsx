import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { VouchersPage } from './VouchersPage';

describe('VouchersPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  it('renders the vouchers header with create and scan actions', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Vouchers')).toBeInTheDocument();
    expect(screen.getByText('Create Voucher')).toBeInTheDocument();
    expect(screen.getByText('Scan QR')).toBeInTheDocument();
  });

  it('renders voucher definitions with assigned counts', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Welcome Gift')).toBeInTheDocument();
    expect(screen.getByText('Referral Rewards')).toBeInTheDocument();
    expect(screen.getByText('Season Promo')).toBeInTheDocument();
  });

  it('shows formatted currency values', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Welcome Gift');
    expect(screen.getAllByText('₱500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₱1,000.00')).toBeInTheDocument();
  });

  it('shows assignment counts', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Welcome Gift');
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('opens the create voucher dialog with no member selector', async () => {
    renderWithProviders(<VouchersPage />, { user: MOCK_ADMIN });
    await screen.findByText('Welcome Gift');
    await userEvent.click(screen.getByText('Create Voucher'));
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Original Value')).toBeInTheDocument();
    expect(screen.queryByLabelText('Member')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expiry Date')).not.toBeInTheDocument();
  });
});
