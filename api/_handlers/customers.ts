import { createCustomerRequestSchema, customerSchema } from '@jad/contracts';

import { verifyUser } from '../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { isValidCustomerRow, mapCustomerRow, prefixedId } from '../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../_lib/rest.js';
import { toErrorEnvelope } from '../_lib/envelope.js';

/** GET own customers / POST create (Active + Qualified only). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('Customer')
      .select('*')
      .eq('memberId', auth.userId)
      .order('createdAt', { ascending: false });
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapCustomerRow);
    okList(res, rows.filter(isValidCustomerRow));
    return;
  }

  const { data: member } = await supabase
    .from('Member')
    .select('isQualified, accountStatus')
    .eq('id', auth.userId)
    .maybeSingle();
  const row = member as { isQualified?: boolean; accountStatus?: string } | null;
  if (row?.isQualified !== true || row.accountStatus !== 'ACTIVE') {
    const { error, status } = toErrorEnvelope(
      'MEMBER_NOT_QUALIFIED',
      'Only Active + Qualified members can record sales.',
      422,
    );
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = createCustomerRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter the customer name and phone number.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const id = prefixedId('cus');
  const { error } = await supabase.from('Customer').insert({
    id,
    memberId: auth.userId,
    name: parsed.data.fullName,
    phone: parsed.data.phone,
    email: parsed.data.email ?? null,
  });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const created = customerSchema.safeParse({
    id,
    sellerId: auth.userId,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    email: parsed.data.email,
  });
  res.status(201).json(created.success ? created.data : { id });
}
