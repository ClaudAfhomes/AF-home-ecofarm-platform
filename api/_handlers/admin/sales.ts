import { saleSchema } from '@jad/contracts';

import { ADMIN_STAFF, FINANCE_VIEW } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import {
  isValidSaleRow,
  mapSaleRow,
  prefixedId,
  validateSaleTransition,
} from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/sales — queue (super_admin, admin, finance). */
export async function listSales(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'sales', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Sale')
    .select('*')
    .order('submittedAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapSaleRow);
  okList(res, rows.filter(isValidSaleRow));
}

/** POST /admin/sales — staff-created sale (super_admin, admin). */
export async function createSale(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'sales', ADMIN_STAFF);
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
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  const propertyId = String(input.propertyId ?? '').trim();
  const propertyName = String(input.propertyName ?? '').trim();
  const propertyValue = String(input.propertyValue ?? '').trim();
  const sellerId = String(input.sellerId ?? '').trim();
  const sellerName = String(input.sellerName ?? '').trim();
  const customerName = String(input.customerName ?? '').trim();
  if (!propertyId || !propertyName || !propertyValue || !sellerId || !sellerName || !customerName) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'propertyId, propertyName, propertyValue, sellerId, sellerName, and customerName are required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: seller } = await supabase
    .from('Member')
    .select('id')
    .eq('id', sellerId)
    .maybeSingle();
  if (!seller) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Seller not found.', 404);
    res.status(status).json({ error });
    return;
  }
  let customerId =
    typeof input.customerId === 'string' && input.customerId ? input.customerId : null;
  if (customerId) {
    const { data: customer } = await supabase
      .from('Customer')
      .select('id')
      .eq('id', customerId)
      .maybeSingle();
    if (!customer) {
      const { error, status } = toErrorEnvelope('NOT_FOUND', 'Customer not found.', 404);
      res.status(status).json({ error });
      return;
    }
  } else {
    customerId = prefixedId('cust');
    const { error: customerError } = await supabase.from('Customer').insert({
      id: customerId,
      memberId: sellerId,
      name: customerName,
      phone: typeof input.customerPhone === 'string' ? input.customerPhone : null,
      email: typeof input.customerEmail === 'string' ? input.customerEmail : null,
    });
    if (customerError) {
      const { error, status } = toErrorEnvelope('INTERNAL', customerError.message, 500);
      res.status(status).json({ error });
      return;
    }
  }
  const now = new Date().toISOString();
  const sale = {
    id: prefixedId('sal'),
    status: 'SUBMITTED',
    propertyId,
    propertyName,
    propertyValue,
    customerId,
    customerName,
    sellerId,
    sellerName,
    submittedAt: now,
    resubmissionCount: 0,
  };
  const { error: insertError } = await supabase.from('Sale').insert(sale);
  if (insertError) {
    const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'SALE_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Sale',
    targetId: sale.id,
    targetName: `${propertyName} — ${customerName}`,
    detail: `Recorded sale ${sale.id}`,
  });
  const parsed = saleSchema.safeParse(mapSaleRow(sale as Record<string, unknown>));
  res.status(201).json(parsed.success ? parsed.data : sale);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listSales(req, res);
  if (req.method === 'POST') return createSale(req, res);
  methodNotAllowed(res, req.method);
}
