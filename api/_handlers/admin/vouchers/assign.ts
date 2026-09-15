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
 * POST /admin/vouchers/assign — assign a voucher (definition) to a member
 * (super_admin, admin). The expiry rule is set per assignment (fixed date wins
 * over validityDays; falls back to the template rule, then to the platform
 * default `VOUCHER_DEFAULT_EXPIRY_DAYS` from SystemConfig).
 * The voucher starts ACTIVE with full remaining value and a unique code. The
 * `(memberId, templateId)` unique index rejects duplicate assignments (409).
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
  const issuedAt = now.toISOString();
  // Per-assignment expiry rule wins; the template rule is the fallback; the
  // platform default (SystemConfig VOUCHER_DEFAULT_EXPIRY_DAYS) is the last
  // resort so definitions without any rule still expire (BR-VCH).
  let defaultValidityDays: number | undefined;
  if (
    parsed.data.expiresAt === undefined &&
    parsed.data.validityDays === undefined &&
    typeof t.expiresAt !== 'string' &&
    typeof t.validityDays !== 'number'
  ) {
    const { data: defaultRow } = await supabase
      .from('SystemConfig')
      .select('value')
      .eq('key', 'VOUCHER_DEFAULT_EXPIRY_DAYS')
      .maybeSingle();
    const raw = (defaultRow as { value?: unknown } | null)?.value;
    const days = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    if (Number.isInteger(days) && days > 0) defaultValidityDays = days;
  }
  const expiryRule = {
    expiresAt: parsed.data.expiresAt ?? (typeof t.expiresAt === 'string' ? t.expiresAt : undefined),
    validityDays:
      parsed.data.validityDays ??
      (typeof t.validityDays === 'number' ? t.validityDays : undefined) ??
      defaultValidityDays,
  };
  const voucherBase = {
    id: prefixedId('vch'),
    templateId: String(t.id),
    title: String(t.title ?? ''),
    originalValue: String(t.originalValue ?? '0.00'),
    remainingValue: String(t.originalValue ?? '0.00'),
    status: 'ACTIVE',
    memberId: String(m.id),
    memberName,
    createdAt: issuedAt,
    expiresAt: computeMemberExpiry(expiryRule, now) ?? null,
  };

  // Code is `JAD-VCH-<year>-<nnn>` from a full select + max suffix; under
  // concurrent assigns the unique `code` index can reject us. Retry with the
  // next suffix. A member+template 23505 is a duplicate assignment, not a race.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing } = await supabase.from('Voucher').select('code');
    const codes = ((existing as { code?: unknown }[] | null) ?? [])
      .map((row) => row.code)
      .filter((code): code is string => typeof code === 'string') as string[];
    const code = nextVoucherCode(codes, now);
    const { error: insertError } = await supabase.from('Voucher').insert({
      ...voucherBase,
      code,
    });
    if (!insertError) {
      await appendAudit(supabase, {
        action: 'VOUCHER_ASSIGNED',
        actorId: auth.userId,
        actorRole: auth.slugs[0] ?? 'admin',
        targetType: 'Voucher',
        targetId: voucherBase.id,
        targetName: `${voucherBase.title} → ${memberName}`,
        detail: `Assigned ${voucherBase.title} (${code}) to ${memberName}`,
      });
      const validated = voucherAssignmentSchema.safeParse(
        mapVoucherAssignmentRow({ ...voucherBase, code } as Record<string, unknown>),
      );
      if (!validated.success) {
        const { error, status } = toErrorEnvelope(
          'INTERNAL',
          'Issued voucher failed validation',
          500,
        );
        res.status(status).json({ error });
        return;
      }
      res.status(201).json(validated.data);
      return;
    }
    const errCode = (insertError as { code?: string } | null)?.code;
    if (
      errCode === '23505' &&
      String(insertError.message).includes('Voucher_member_template_uidx')
    ) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'This member already has this voucher.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    if (errCode !== '23505') {
      const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
      res.status(status).json({ error });
      return;
    }
    lastError = insertError.message;
  }
  const { error, status } = toErrorEnvelope(
    'INTERNAL',
    `Could not allocate a unique voucher code: ${lastError ?? 'unknown'}`,
    500,
  );
  res.status(status).json({ error });
}
