import { saleSchema } from '@jad/contracts';

import { ADMIN_STAFF, FINANCE_VIEW } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapSaleRow, validateSaleTransition } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

const TRANSITION_ACTIONS: Record<string, string> = {
  ADMIN_APPROVED: 'SALE_APPROVED',
  PAYMENT_VERIFIED: 'SALE_PAYMENT_VERIFIED',
  QUALIFYING_SALE: 'SALE_QUALIFIED',
  REJECTED: 'SALE_REJECTED',
};

/** GET / PATCH / DELETE /admin/sales/:id. Reads extend to finance; writes are staff-only. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const allowed = req.method === 'GET' ? FINANCE_VIEW : ADMIN_STAFF;
  const auth = await verifyStaffModule(req, 'sales', allowed);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Sale id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Sale')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Sale not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;

  if (req.method === 'GET') {
    // Configured rates for the estimate preview (never hard-code 8%/4%).
    const { data: rateRows } = await supabase
      .from('SystemConfig')
      .select('key,value')
      .in('key', ['COMMISSION_DIRECT_RATE', 'COMMISSION_REFERRAL_RATE']);
    const rateByKey: Record<string, string> = {};
    for (const r of (rateRows as { key: string; value: string }[] | null) ?? []) {
      rateByKey[r.key] = r.value;
    }
    const withRates = {
      ...mapSaleRow(current),
      ...(rateByKey.COMMISSION_DIRECT_RATE && rateByKey.COMMISSION_REFERRAL_RATE
        ? {
            commissionRates: {
              direct: rateByKey.COMMISSION_DIRECT_RATE,
              referral: rateByKey.COMMISSION_REFERRAL_RATE,
            },
          }
        : {}),
    };
    const parsed = saleSchema.safeParse(withRates);
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope('INTERNAL', 'Stored sale failed validation', 500);
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsed.data);
    return;
  }

  if (req.method === 'DELETE') {
    // Guarded by the atomic sale_delete function: blocked while any AVAILABLE
    // (credited) commission exists; non-credited commissions are removed with
    // the sale so no orphans are left.
    const { data: result, error: rpcError } = await supabase.rpc('sale_delete', {
      p_id: id,
      p_actor: auth.userId,
      p_role: auth.slugs[0] ?? 'admin',
    });
    if (rpcError) {
      const { error, status } = toErrorEnvelope('INTERNAL', rpcError.message, 500);
      res.status(status).json({ error });
      return;
    }
    const outcome = (result ?? {}) as {
      error?: { code: string; message: string; status?: number };
      deleted?: boolean;
    };
    if (outcome.error) {
      const { error, status } = toErrorEnvelope(
        outcome.error.code as never,
        outcome.error.message,
        outcome.error.status ?? 500,
      );
      res.status(status).json({ error });
      return;
    }
    res.status(200).json({ id, deleted: true });
    return;
  }

  // PATCH - field edits plus guarded status transitions.
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of [
    'propertyId',
    'propertyName',
    'propertyValue',
    'customerId',
    'customerName',
    'sellerId',
    'sellerName',
    'referrerId',
    'referrerName',
  ] as const) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  // Validate referrerId when provided: must be a direct referral of the
  // (possibly new) seller. No free-text referrerName commission.
  if (patch.referrerId !== undefined) {
    const rId = String(patch.referrerId ?? '').trim();
    if (rId) {
      const sellerForRef = String(
        (patch.sellerId as string | undefined) ?? (current.sellerId as string) ?? '',
      ).trim();
      const { data: ref } = await supabase
        .from('Member')
        .select('id, sponsorId')
        .eq('id', rId)
        .maybeSingle();
      if (!ref || (ref as { sponsorId?: string | null }).sponsorId !== sellerForRef) {
        const { error, status } = toErrorEnvelope(
          'VALIDATION_ERROR',
          'The selected referrer must be one of the seller’s direct referrals.',
          400,
        );
        res.status(status).json({ error });
        return;
      }
      // Normalize to the canonical id/name; also sync referrerName.
      const { data: full } = await supabase
        .from('Member')
        .select('firstName, lastName, name')
        .eq('id', rId)
        .maybeSingle();
      const fn = (full as { firstName?: string; lastName?: string; name?: string } | null) ?? null;
      const canonical = fn
        ? `${(fn.firstName ?? '').trim()} ${(fn.lastName ?? '').trim()}`.trim() ||
          String(fn.name ?? '').trim()
        : '';
      if (canonical) patch.referrerName = canonical;
    } else {
      patch.referrerId = null;
      patch.referrerName = null;
    }
  }
  if (patch.customerId !== undefined) {
    const { data: customer } = await supabase
      .from('Customer')
      .select('id')
      .eq('id', patch.customerId)
      .maybeSingle();
    if (!customer) {
      const { error, status } = toErrorEnvelope('NOT_FOUND', 'Customer not found.', 404);
      res.status(status).json({ error });
      return;
    }
  }
  if (patch.sellerId !== undefined) {
    const { data: seller } = await supabase
      .from('Member')
      .select('id')
      .eq('id', patch.sellerId)
      .maybeSingle();
    if (!seller) {
      const { error, status } = toErrorEnvelope('NOT_FOUND', 'Seller not found.', 404);
      res.status(status).json({ error });
      return;
    }
  }
  if (input.status !== undefined) {
    if (typeof input.status !== 'string') {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid status.', 400);
      res.status(status).json({ error });
      return;
    }
    const problem = validateSaleTransition(String(current.status), {
      status: input.status,
      rejectionReason:
        typeof input.rejectionReason === 'string' ? input.rejectionReason : undefined,
    });
    if (problem) {
      const { error, status } = toErrorEnvelope('CONFLICT', problem, 409);
      res.status(status).json({ error });
      return;
    }
    const isSameStatus = String(input.status) === String(current.status);
    if (input.status === 'QUALIFYING_SALE') {
      // Always route through the atomic function (idempotent re-entry emits
      // any missing referral and credits only new rows).
      patch.status = input.status;
    } else if (!isSameStatus) {
      patch.status = input.status;
      const now = new Date().toISOString();
      if (input.status === 'ADMIN_APPROVED') patch.approvedAt = now;
      if (input.status === 'PAYMENT_VERIFIED') patch.paymentVerifiedAt = now;
      if (input.status === 'REJECTED')
        patch.rejectionReason = (input.rejectionReason as string).trim();
    }
    // Same-status non-qualify is a field-only edit (or pure no-op) - do not
    // re-stamp timestamps or include the unchanged status.
  }
  if (Object.keys(patch).length === 0) {
    // Pure idempotent same-status PATCH with no field edits - return the
    // current sale as a success rather than a validation error.
    if (input.status !== undefined && String(input.status) === String(current.status)) {
      const parsedSame = saleSchema.safeParse(mapSaleRow(current));
      if (!parsedSame.success) {
        const { error, status } = toErrorEnvelope('INTERNAL', 'Stored sale failed validation', 500);
        res.status(status).json({ error });
        return;
      }
      res.status(200).json(parsedSame.data);
      return;
    }
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  // QUALIFYING_SALE goes through the atomic DB function: status transition +
  // commission generation + audit in one transaction (single tx, idempotent
  // re-entry). All other writes keep the existing sequential path.
  if (input.status === 'QUALIFYING_SALE') {
    const { status, ...fieldEdits } = patch;
    const { data: result, error: rpcError } = await supabase.rpc('sale_qualify', {
      p_id: id,
      p_actor: auth.userId,
      p_role: auth.slugs[0] ?? 'admin',
      p_patch: fieldEdits,
    });
    if (rpcError) {
      const { error, status } = toErrorEnvelope('INTERNAL', rpcError.message, 500);
      res.status(status).json({ error });
      return;
    }
    const outcome = (result ?? {}) as {
      error?: { code: string; message: string; status?: number };
      sale?: Record<string, unknown>;
    };
    if (outcome.error) {
      const { error, status } = toErrorEnvelope(
        outcome.error.code as never,
        outcome.error.message,
        outcome.error.status ?? 500,
      );
      res.status(status).json({ error });
      return;
    }
    // Defensive unwrap: older function versions returned {"sale":{"to_jsonb":{...}}}.
    const rawSale =
      (outcome.sale as Record<string, unknown> & { to_jsonb?: Record<string, unknown> })
        ?.to_jsonb ?? outcome.sale;
    const parsedQual = saleSchema.safeParse(mapSaleRow(rawSale as Record<string, unknown>));
    if (!parsedQual.success) {
      const { error, status } = toErrorEnvelope('INTERNAL', 'Stored sale failed validation', 500);
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsedQual.data);
    return;
  }
  const { data: updated, error: writeError } = await supabase
    .from('Sale')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (writeError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      writeError?.message ?? 'Update failed',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  const parsed = saleSchema.safeParse(mapSaleRow(updated as Record<string, unknown>));
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored sale failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  const action =
    typeof patch.status === 'string'
      ? (TRANSITION_ACTIONS[patch.status] ?? 'SALE_UPDATED')
      : 'SALE_UPDATED';
  await appendAudit(supabase, {
    action,
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Sale',
    targetId: id,
    targetName: `${parsed.data.propertyName} - ${parsed.data.customerName}`,
    detail:
      typeof patch.status === 'string'
        ? `Sale ${String(current.status)} → ${patch.status}`
        : `Updated sale ${id}`,
  });
  res.status(200).json(parsed.data);
}
