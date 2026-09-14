import { assignVoucherRequestSchema, voucherAssignmentSchema } from '@jad/contracts';
import { computeMemberExpiry } from '@jad/shared';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapVoucherAssignmentRow } from '../../../_lib/pipeline.js';
import { nextVoucherCode } from '../../../_lib/cutover.js';
import { prefixedId } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * POST /admin/vouchers/assign — issue a template to a member
 * (super_admin, admin). Snapshots the template value + expiry rule at
 * issuance; the voucher starts ACTIVE with full remaining value.
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
  const parsed = assignVoucherRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Select a template and a member.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: template, error: templateError } = await supabase
    .from('VoucherTemplate')
    .select('*')
    .eq('id', parsed.data.templateId)
    .maybeSingle();
  if (templateError || !template) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Voucher template not found.', 404);
    res.status(status).json({ error });
    return;
  }
  const { data: member, error: memberError } = await supabase
    .from('Member')
    .select('id,firstName,lastName,name')
    .eq('id', parsed.data.memberId)
    .maybeSingle();
  if (memberError || !member) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found.', 404);
    res.status(status).json({ error });
    return;
  }
  const t = template as Record<string, unknown>;
  const m = member as Record<string, unknown>;
  const memberName =
    [m.firstName, m.lastName].filter((part) => typeof part === 'string' && part).join(' ') ||
    (typeof m.name === 'string' && m.name ? m.name : String(m.id));
  const now = new Date();
  const { data: existing } = await supabase.from('Voucher').select('code');
  const codes = ((existing as { code?: unknown }[] | null) ?? [])
    .map((row) => row.code)
    .filter((code): code is string => typeof code === 'string');
  const issuedAt = now.toISOString();
  const voucher = {
    id: prefixedId('vch'),
    templateId: String(t.id),
    code: nextVoucherCode(codes, now),
    title: String(t.title ?? ''),
    originalValue: String(t.originalValue ?? '0.00'),
    remainingValue: String(t.originalValue ?? '0.00'),
    status: 'ACTIVE',
    memberId: String(m.id),
    memberName,
    createdAt: issuedAt,
    expiresAt:
      computeMemberExpiry(
        {
          expiresAt: typeof t.expiresAt === 'string' ? t.expiresAt : undefined,
          validityDays: typeof t.validityDays === 'number' ? t.validityDays : undefined,
        },
        now,
      ) ?? null,
  };
  const { error: insertError } = await supabase.from('Voucher').insert(voucher);
  if (insertError) {
    const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'VOUCHER_ASSIGNED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Voucher',
    targetId: voucher.id,
    targetName: `${voucher.title} → ${memberName}`,
    detail: `Assigned ${voucher.title} (${voucher.code}) to ${memberName}`,
  });
  const validated = voucherAssignmentSchema.safeParse(
    mapVoucherAssignmentRow(voucher as Record<string, unknown>),
  );
  if (!validated.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Issued voucher failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(201).json(validated.data);
}
