import { describe, expect, it } from 'vitest';

import {
  LEDGER_TYPE_ALLOWLIST,
  fetchWithdrawalIdentifierMap,
  injectWithdrawalIdentifiers,
  isValidCommissionRow,
  isValidLedgerRow,
  isValidWalletRow,
  isValidWithdrawalRow,
  mapCommissionRow,
  mapLedgerRow,
  mapWithdrawalRow,
  maskIdentifier,
  validateReserve,
  withRunningBalance,
  zeroWallet,
} from './money.js';

describe('maskIdentifier', () => {
  it('masks all but the last four characters', () => {
    expect(maskIdentifier('1234567890')).toBe('•••• 7890');
    expect(maskIdentifier('09175550199')).toBe('•••• 0199');
  });

  it('fully masks short identifiers', () => {
    expect(maskIdentifier('123')).toBe('••••');
    expect(maskIdentifier('')).toBe('••••');
  });
});

describe('withRunningBalance', () => {
  const rows = [
    { id: 'led-001', entryType: 'DIRECT_COMMISSION', direction: 'CREDIT', amount: '160000.00' },
    { id: 'led-002', entryType: 'WITHDRAWAL_RESERVATION', direction: 'DEBIT', amount: '50000.00' },
    { id: 'led-003', entryType: 'WITHDRAWAL_COMPLETION', direction: 'DEBIT', amount: '50000.00' },
    { id: 'led-004', entryType: 'WITHDRAWAL_REVERSAL', direction: 'CREDIT', amount: '40000.00' },
  ];

  it('keeps a running balance and leaves completions balance-neutral (BR-WDR-003)', () => {
    const out = withRunningBalance(rows);
    expect(out.map((r) => r.balanceAfter)).toEqual([
      '160000.00',
      '110000.00',
      '110000.00',
      '150000.00',
    ]);
  });

  it('maps ledger rows with the computed balance', () => {
    const mapped = withRunningBalance(rows).map(mapLedgerRow);
    expect(mapped[1]).toMatchObject({ id: 'led-002', balanceAfter: '110000.00' });
    expect(
      isValidLedgerRow({
        ...rows[0],
        createdAt: '2026-08-01T00:00:00.000Z',
        balanceAfter: '160000.00',
      }),
    ).toBe(true);
  });
});

describe('validateReserve', () => {
  it('rejects zero and negative amounts', () => {
    expect(validateReserve('0.00', '1000.00')).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects amounts above the available balance', () => {
    expect(validateReserve('1000.01', '1000.00')).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      status: 409,
    });
  });

  it('accepts exact-balance reservations (never negative, BI-001)', () => {
    expect(validateReserve('1000.00', '1000.00')).toEqual({ ok: true });
  });
});

describe('money row mapping', () => {
  it('validates wallet rows and builds zero wallets', () => {
    expect(zeroWallet()).toEqual({
      availableBalance: '0.00',
      pendingAmount: '0.00',
      totalWithdrawals: '0.00',
      totalEarned: '0.00',
    });
    expect(isValidWalletRow(zeroWallet())).toBe(true);
  });

  it('embeds the payout snapshot on withdrawal rows', () => {
    const row = {
      id: 'wdr-001',
      payoutAccountId: 'pa-001',
      accountMethod: 'TRADITIONAL_BANK',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '•••• 7890',
      amount: '50000.00',
      status: 'COMPLETED',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    expect(mapWithdrawalRow(row).payoutAccount).toMatchObject({
      id: 'pa-001',
      method: 'TRADITIONAL_BANK',
    });
    expect(mapWithdrawalRow(row).payoutAccount).not.toHaveProperty('accountIdentifier');
    expect(isValidWithdrawalRow(row)).toBe(true);
    expect(isValidWithdrawalRow({ ...row, status: 'SENT' })).toBe(false);
  });

  it('passes through the raw identifier on withdrawal snapshots when joined', () => {
    const row = {
      id: 'wdr-001',
      payoutAccountId: 'pa-001',
      accountMethod: 'TRADITIONAL_BANK',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '•••• 0199',
      accountIdentifier: '09175550199',
      amount: '50000.00',
      status: 'COMPLETED',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    expect(mapWithdrawalRow(row).payoutAccount).toMatchObject({
      accountIdentifierMasked: '•••• 0199',
      accountIdentifier: '09175550199',
    });
    expect(isValidWithdrawalRow(row)).toBe(true);
  });

  it('keeps valid rows through map-then-validate (list handlers filter mapped rows)', () => {
    const mapped = mapWithdrawalRow({
      id: 'wdr-001',
      payoutAccountId: 'pa-001',
      accountMethod: 'TRADITIONAL_BANK',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '•••• 7890',
      amount: '50000.00',
      status: 'COMPLETED',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    expect(isValidWithdrawalRow(mapped)).toBe(true);
  });

  it('injects live identifiers and degrades to masked when missing', () => {
    const rows = [
      { id: 'wdr-001', payoutAccountId: 'pa-001', accountIdentifierMasked: '•••• 0199' },
      { id: 'wdr-002', payoutAccountId: 'pa-002', accountIdentifierMasked: '••••' },
    ];
    const enriched = injectWithdrawalIdentifiers(rows, new Map([['pa-001', '09175550199']]));
    expect(mapWithdrawalRow(enriched[0]!).payoutAccount.accountIdentifier).toBe('09175550199');
    expect(mapWithdrawalRow(enriched[1]!).payoutAccount).not.toHaveProperty('accountIdentifier');
  });

  it('fetchWithdrawalIdentifierMap returns an empty map on failure', async () => {
    const broken = {
      from: () => ({
        select: () => {
          throw new Error('boom');
        },
      }),
    };
    await expect(
      fetchWithdrawalIdentifierMap(broken as never, ['pa-001'], 'mem-1'),
    ).resolves.toEqual(new Map());
    await expect(fetchWithdrawalIdentifierMap(broken as never, [])).resolves.toEqual(new Map());
  });

  it('joins the sale property name on commission rows', () => {
    const row = {
      id: 'com-001',
      commissionType: 'DIRECT_COMMISSION',
      saleId: 'sal-004',
      baseValue: '2000000.00',
      rate: '0.0800',
      amount: '160000.00',
      status: 'AVAILABLE',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    expect(mapCommissionRow(row, 'Farm Lot').salePropertyName).toBe('Farm Lot');
    expect(mapCommissionRow(row).salePropertyName).toBe('sal-004');
    expect(isValidCommissionRow(row, 'Farm Lot')).toBe(true);
    expect(isValidCommissionRow({ ...row, rate: '0.12345' }, 'Farm Lot')).toBe(false);
  });

  it('exposes the ledger type allowlist', () => {
    expect([...LEDGER_TYPE_ALLOWLIST]).toContain('WITHDRAWAL_RESERVATION');
    expect([...LEDGER_TYPE_ALLOWLIST]).toContain('FINANCIAL_ADJUSTMENT');
  });
});
