import { archivedMemberSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapMemberRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, okList, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/** GET /admin/members/archived - archived roster with snapshots. */
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
  const auth = await verifyStaffModule(req, 'members', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Member')
    .select('*')
    .not('archivedAt', 'is', null)
    .order('archivedAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  // Build originalData with the same mapMemberRow mapper the active members
  // list uses, so an archived record always satisfies memberProfileSchema.
  // Member name/phone/referralCode columns are nullable while the schema
  // requires them - fall back to explicit placeholders instead of silently
  // dropping the archived row (a dropped row is what made archived members
  // "disappear" from the Archives tab).
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => {
    const snap =
      typeof row.archiveSnapshot === 'object' && row.archiveSnapshot !== null
        ? (row.archiveSnapshot as Record<string, unknown>)
        : {};
    const source: Record<string, unknown> = { ...row, ...snap, id: String(row.id) };
    const nameParts = String((source.name as string | undefined) ?? '').split(' ');
    if (typeof source.firstName !== 'string' || !source.firstName.trim()) {
      source.firstName = nameParts[0] || '?';
    }
    if (typeof source.lastName !== 'string' || !source.lastName.trim()) {
      source.lastName = nameParts.slice(1).join(' ') || '?';
    }
    if (typeof source.phone !== 'string' || !source.phone.trim()) {
      source.phone = '?';
    }
    if (typeof source.referralCode !== 'string' || !source.referralCode) {
      source.referralCode = '?';
    }
    const profile = mapMemberRow(source);
    const prevAccount = (snap.accountStatus ?? row.accountStatus) as unknown;
    return {
      id: `arch-${row.id}`,
      memberId: String(row.id),
      originalData: profile,
      archivedAt: row.archivedAt,
      archivedBy: (row.archivedBy as string | undefined) ?? 'unknown',
      previousStatus: String(snap.status ?? row.status ?? 'APPROVED_ACTIVE'),
      ...(prevAccount === 'ACTIVE' || prevAccount === 'INACTIVE'
        ? { previousAccountStatus: prevAccount }
        : {}),
    };
  });
  const valid: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (archivedMemberSchema.safeParse(row).success) {
      valid.push(row);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[archived] dropping invalid archived row:', row.memberId);
    }
  }
  okList(res, valid);
}
