import { ADMIN_STAFF, FINANCE_VIEW } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import {
  isValidVoucherTemplateRow,
  mapVoucherTemplateRow,
  prefixedId,
} from '../../_lib/pipeline.js';
import { validateCreateTemplate } from '../../_lib/cutover.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/voucher-templates - voucher types (super_admin, admin, finance). Read-only in B5. */
export async function listVoucherTemplates(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'vouchers', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('VoucherTemplate')
    .select('*')
    .order('id', { ascending: true });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(
    mapVoucherTemplateRow,
  );
  okList(res, rows.filter(isValidVoucherTemplateRow));
}

/** POST /admin/voucher-templates - create a template (super_admin, admin). */
export async function createVoucherTemplate(req: VercelRequest, res: VercelResponse) {
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
  const parsed = validateCreateTemplate(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter a title and a valid original value.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const template = {
    id: prefixedId('vtpl'),
    title: parsed.data.title,
    originalValue: parsed.data.originalValue,
    createdAt: new Date().toISOString(),
    expiresAt: parsed.data.expiresAt ?? null,
    validityDays: parsed.data.validityDays ?? null,
  };
  const { error } = await supabase.from('VoucherTemplate').insert(template);
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'VOUCHER_TEMPLATE_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'VoucherTemplate',
    targetId: template.id,
    targetName: template.title,
    detail: `Created voucher template ${template.title}`,
  });
  res.status(201).json(mapVoucherTemplateRow(template as Record<string, unknown>));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listVoucherTemplates(req, res);
  if (req.method === 'POST') return createVoucherTemplate(req, res);
  methodNotAllowed(res, req.method);
}
