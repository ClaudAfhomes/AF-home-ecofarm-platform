import { scanVoucherRequestSchema, voucherAssignmentSchema } from '@jad/contracts';
import { isExpired } from '@jad/shared';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapVoucherAssignmentRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * POST /admin/vouchers/scan — resolve a voucher from its QR payload (the
 * unique code) for an admin storefront scan. Verify-only: no state changes
 * here. Already-redeemed and expired vouchers are rejected so the scanner can
 * surface them before the admin confirms a redemption.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'vouchers', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = scanVoucherRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'A voucher code is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const code = parsed.data.code.trim();
  const { data, error } = await supabase.from('Voucher').select('*').eq('code', code).maybeSingle();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope(
      'NOT_FOUND',
      'No voucher matches this code.',
      404,
    );
    res.status(status).json({ error: env });
    return;
  }
  const voucher = data as Record<string, unknown>;
  if (voucher.status === 'FULLY_REDEEMED') {
    const { error: env, status } = toErrorEnvelope(
      'CONFLICT',
      'This voucher has already been redeemed.',
      409,
    );
    res.status(status).json({ error: env });
    return;
  }
  if (isExpired(typeof voucher.expiresAt === 'string' ? voucher.expiresAt : undefined)) {
    const { error: env, status } = toErrorEnvelope('CONFLICT', 'This voucher has expired.', 409);
    res.status(status).json({ error: env });
    return;
  }
  const parsedVoucher = voucherAssignmentSchema.safeParse(mapVoucherAssignmentRow(voucher));
  if (!parsedVoucher.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Scanned voucher failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsedVoucher.data);
}
