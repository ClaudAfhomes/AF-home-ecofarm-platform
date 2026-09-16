import { z } from 'zod';

/**
 * API error envelope - CONFIRMED by API-SPECIFICATION.md §3.
 * Shape is authoritative; codes are the stable set listed in §3.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
    timestamp: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'MEMBER_NOT_QUALIFIED',
  'SALE_LOCKED',
  'REJECTION_REASON_REQUIRED',
  'INSUFFICIENT_BALANCE',
  'RESERVATION_CONFLICT',
  'VOUCHER_INVALID_SIGNATURE',
  'VOUCHER_INVALID',
  'VOUCHER_EXPIRED',
  'VOUCHER_ALREADY_REDEEMED',
  'VOUCHER_INSUFFICIENT_BALANCE',
  'PAYOUT_ACCOUNT_UNVERIFIED',
  'INTERNAL',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
