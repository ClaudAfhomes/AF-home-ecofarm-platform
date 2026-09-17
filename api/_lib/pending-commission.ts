import { addMoney, multiplyMoney } from '@jad/shared';

/**
 * Estimate pending commission for a member from open sales.
 * A sale is "pending" when its status is SUBMITTED, ADMIN_APPROVED, or
 * PAYMENT_VERIFIED. Direct commission = own sales x direct rate; referral =
 * sales where the member is the selected referrer x referral rate, plus
 * direct-downline open sales with no referrer picked x referral rate (the
 * sponsor fallback the member automatically receives on qualification).
 * Exact-decimal BigInt math, never floats.
 */
const PENDING_SALE_STATUSES = new Set(['SUBMITTED', 'ADMIN_APPROVED', 'PAYMENT_VERIFIED']);

function isPendingSale(status: unknown): boolean {
  return typeof status === 'string' && PENDING_SALE_STATUSES.has(status);
}

function isValidAmount(value: unknown): boolean {
  return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value);
}

function isValidRate(value: unknown): boolean {
  return typeof value === 'string' && /^\d+(\.\d{1,4})?$/.test(value);
}

export function sumPendingCommission(params: {
  ownSales: { status: unknown; propertyValue: unknown }[];
  referredSales: { status: unknown; propertyValue: unknown }[];
  downlineSales: { status: unknown; propertyValue: unknown }[];
  directRate: string | null | undefined;
  referralRate: string | null | undefined;
}): string {
  let total = '0.00';
  const { ownSales, referredSales, downlineSales, directRate, referralRate } = params;

  if (directRate && isValidRate(directRate)) {
    for (const s of ownSales) {
      if (!isPendingSale(s.status)) continue;
      if (!isValidAmount(s.propertyValue)) continue;
      total = addMoney(total, multiplyMoney(s.propertyValue as string, directRate));
    }
  }
  if (referralRate && isValidRate(referralRate)) {
    for (const s of [...referredSales, ...downlineSales]) {
      if (!isPendingSale(s.status)) continue;
      if (!isValidAmount(s.propertyValue)) continue;
      total = addMoney(total, multiplyMoney(s.propertyValue as string, referralRate));
    }
  }
  return total;
}
