import type { VoucherAssignment, VoucherTemplate } from '@jad/contracts';
import { computeMemberExpiry } from '@jad/shared';

import { MOCK_VOUCHER_ASSIGNMENTS, MOCK_VOUCHERS } from './data';
import { registrationStore } from './registrationMockStore';

/**
 * Canonical in-memory mock store for the voucher flow: "Create Voucher" makes
 * a definition (title + value); "Assign to Member" creates a unique member
 * voucher with its own expiry/validity. Mirrors the API contract — duplicates
 * rejected, code generation, verify-only scan, full redemption.
 */

let seq = 110;

export const voucherStore: {
  definitions: VoucherTemplate[];
  vouchers: VoucherAssignment[];
} = {
  definitions: MOCK_VOUCHERS.map((v) => ({ ...v })),
  vouchers: MOCK_VOUCHER_ASSIGNMENTS.map((v) => ({ ...v })),
};

function nextCode(): string {
  seq += 1;
  return `JAD-VCH-2026-${seq}`;
}

function memberNameFor(memberId: string): string | undefined {
  const member = registrationStore.members.find((m) => m.id === memberId);
  if (!member) return undefined;
  return `${member.firstName} ${member.lastName}`.trim() || memberId;
}

export function createMockVoucher(input: {
  title: string;
  originalValue: string;
}): VoucherTemplate {
  const definition: VoucherTemplate = {
    id: `vtpl-${seq}`,
    title: input.title,
    originalValue: input.originalValue,
    createdAt: new Date().toISOString(),
  };
  voucherStore.definitions.push(definition);
  return definition;
}

export function mockVoucherTemplateById(id: string): VoucherTemplate | undefined {
  return voucherStore.definitions.find((d) => d.id === id);
}

export function assignMockVoucher(input: {
  templateId: string;
  memberId: string;
  expiresAt?: string;
  validityDays?: number;
}): VoucherAssignment {
  const definition = mockVoucherTemplateById(input.templateId);
  if (!definition) throw new Error('Voucher not found.');
  const name = memberNameFor(input.memberId);
  if (!name) throw new Error('Member not found.');
  const duplicate = voucherStore.vouchers.find(
    (v) => v.templateId === input.templateId && v.memberId === input.memberId,
  );
  if (duplicate) throw new Error('This member already has this voucher.');
  const voucher: VoucherAssignment = {
    id: `vch-${seq}`,
    templateId: definition.id,
    code: nextCode(),
    title: definition.title,
    originalValue: definition.originalValue,
    remainingValue: definition.originalValue,
    status: 'ACTIVE',
    memberId: input.memberId,
    memberName: name,
    createdAt: new Date().toISOString(),
    expiresAt:
      computeMemberExpiry(
        { expiresAt: input.expiresAt, validityDays: input.validityDays },
        new Date(),
      ) ?? undefined,
  };
  voucherStore.vouchers.push(voucher);
  return voucher;
}

export function scanMockVoucher(code: string): VoucherAssignment {
  const voucher = voucherStore.vouchers.find((v) => v.code === code.trim());
  if (!voucher) throw new Error('No voucher matches this code.');
  if (voucher.status === 'FULLY_REDEEMED')
    throw new Error('This voucher has already been redeemed.');
  return voucher;
}

export function redeemMockVoucher(id: string): VoucherAssignment {
  const voucher = voucherStore.vouchers.find((v) => v.id === id);
  if (!voucher) throw new Error('Voucher not found');
  if (voucher.status !== 'ACTIVE') throw new Error('This voucher has already been redeemed.');
  voucher.status = 'FULLY_REDEEMED';
  voucher.remainingValue = '0.00';
  voucher.redeemedAt = new Date().toISOString();
  voucher.redeemedBy = 'mock-staff';
  return voucher;
}

export function mockVoucherById(id: string): VoucherAssignment | undefined {
  return voucherStore.vouchers.find((v) => v.id === id);
}
