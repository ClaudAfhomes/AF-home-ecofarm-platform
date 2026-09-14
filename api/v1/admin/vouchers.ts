import { FINANCE_VIEW } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidVoucherAssignmentRow, mapVoucherAssignmentRow } from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /admin/vouchers — assigned vouchers with member linkage
 * (super_admin, admin, finance). Optional `?templateId=` narrows to one
 * template's assignments (used by the template detail page).
 */
export async function listVouchers(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'vouchers', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const query = req.query as Record<string, string | string[] | undefined>;
  const rawTemplate = query.templateId;
  const templateId = Array.isArray(rawTemplate) ? rawTemplate[0] : rawTemplate;
  let builder = supabase.from('Voucher').select('*');
  if (templateId) builder = builder.eq('templateId', templateId);
  const { data, error } = await builder.order('createdAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(
    mapVoucherAssignmentRow,
  );
  okList(res, rows.filter(isValidVoucherAssignmentRow));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  return listVouchers(req, res);
}
