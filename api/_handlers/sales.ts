import { submitSaleRequestSchema } from '@jad/contracts';

import { verifyUser } from '../_lib/auth.js';
import { appendAudit } from '../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { findCatalogPrice, isValidSaleRow, mapSaleRow, prefixedId } from '../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../_lib/rest.js';
import { toErrorEnvelope } from '../_lib/envelope.js';

function idempotencyKey(req: VercelRequest): string | undefined {
  const raw = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  return typeof key === 'string' && key ? key : undefined;
}

async function catalogContent(
  supabase: NonNullable<ReturnType<typeof requireService>>,
): Promise<unknown> {
  const { data } = await supabase
    .from('cms_contents')
    .select('content')
    .eq('key', 'properties')
    .maybeSingle();
  return (data as { content?: unknown } | null)?.content ?? null;
}

/** GET own sales / POST submit (Idempotency-Key required, qualified-only). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
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
      .from('Sale')
      .select('*')
      .eq('sellerId', auth.userId)
      .order('submittedAt', { ascending: false });
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapSaleRow);
    const valid = rows.filter(isValidSaleRow);
    if (valid.length !== rows.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sales] dropped ${rows.length - valid.length}/${rows.length} rows failing saleSchema for seller ${auth.userId}:`,
        rows.filter((r) => !isValidSaleRow(r)).map((r) => r.id),
      );
    }
    okList(res, valid);
    return;
  }

  const { data: member } = await supabase
    .from('Member')
    .select('isQualified, accountStatus, firstName, lastName, name')
    .eq('id', auth.userId)
    .maybeSingle();
  const memberRow = member as {
    isQualified?: boolean;
    accountStatus?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
  } | null;
  if (!memberRow) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  if (memberRow.isQualified !== true || memberRow.accountStatus !== 'ACTIVE') {
    const { error, status } = toErrorEnvelope(
      'MEMBER_NOT_QUALIFIED',
      'Only Active + Qualified members can submit sales.',
      422,
    );
    res.status(status).json({ error });
    return;
  }
  const key = idempotencyKey(req);
  if (!key) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Idempotency-Key header is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const idemPath = `POST:/sales:${key}`;
  const { data: replay } = await supabase
    .from('IdempotencyKey')
    .select('response,expiresAt')
    .eq('key', idemPath)
    .eq('memberId', auth.userId)
    .maybeSingle();
  const expired =
    replay !== null &&
    (replay as { expiresAt?: string | null }).expiresAt !== null &&
    new Date((replay as { expiresAt: string }).expiresAt).getTime() <= Date.now();
  if (expired) {
    await supabase.from('IdempotencyKey').delete().eq('key', idemPath);
  } else if (replay && (replay as { response?: unknown }).response) {
    res.status(200).json((replay as { response: unknown }).response);
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = submitSaleRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Select a customer and a property from the catalog.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const { data: customer } = await supabase
    .from('Customer')
    .select('id, name')
    .eq('id', parsed.data.customerId)
    .eq('memberId', auth.userId)
    .maybeSingle();
  if (!customer) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Customer not found.', 404);
    res.status(status).json({ error });
    return;
  }
  const property = findCatalogPrice(await catalogContent(supabase), parsed.data.propertyId);
  if (!property) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'This property is not available in the catalog.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const sellerName =
    `${memberRow.firstName ?? ''} ${memberRow.lastName ?? ''}`.trim() ||
    String(memberRow.name ?? '');
  const now = new Date().toISOString();
  let referrerName: string | undefined;
  let referrerId: string | undefined;
  if (parsed.data.referrerId !== undefined) {
    const { data: referrer } = await supabase
      .from('Member')
      .select('id, firstName, lastName, name, sponsorId, accountStatus, isQualified')
      .eq('id', parsed.data.referrerId)
      .maybeSingle();
    const r = referrer as {
      id?: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      sponsorId?: string | null;
      accountStatus?: string;
      isQualified?: boolean;
    } | null;
    if (!r || r.sponsorId !== auth.userId) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'The selected referrer must be one of your direct referrals.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    referrerName =
      `${(r.firstName ?? '').trim()} ${(r.lastName ?? '').trim()}`.trim() ||
      String(r.name ?? '').trim() ||
      undefined;
    referrerId = r.id;
  }
  const sale = {
    id: prefixedId('sal'),
    status: 'SUBMITTED',
    propertyId: parsed.data.propertyId,
    propertyName: property.name,
    propertyValue: property.price,
    customerId: parsed.data.customerId,
    customerName: (customer as { name: string }).name,
    sellerId: auth.userId,
    sellerName,
    submittedAt: now,
    resubmissionCount: 0,
    ...(referrerId !== undefined ? { referrerId } : {}),
    ...(referrerName !== undefined ? { referrerName } : {}),
  };
  const { error: insertError } = await supabase.from('Sale').insert(sale);
  if (insertError) {
    const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const response = mapSaleRow(sale as Record<string, unknown>);
  await supabase.from('IdempotencyKey').upsert(
    {
      key: idemPath,
      memberId: auth.userId,
      response,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'key' },
  );
  await appendAudit(supabase, {
    action: 'SALE_SUBMITTED',
    actorId: auth.userId,
    actorRole: 'user',
    targetType: 'Sale',
    targetId: sale.id,
    targetName: `${sale.propertyName} - ${sale.customerName}`,
    detail: `Submitted sale ${sale.id}`,
  });
  res.status(201).json(response);
}
