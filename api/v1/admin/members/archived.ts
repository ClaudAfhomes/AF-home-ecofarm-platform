import { archivedMemberSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/** GET /admin/members/archived — archived roster with snapshots. */
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
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => {
    const snap =
      typeof row.archiveSnapshot === 'object' && row.archiveSnapshot !== null
        ? (row.archiveSnapshot as Record<string, unknown>)
        : row;
    const programId = typeof snap.programId === 'string' && snap.programId ? snap.programId : 'prg-domestic';
    return {
      id: `arch-${row.id}`,
      memberId: row.id,
      originalData: {
        ...snap,
        id: String(row.id),
        status: snap.status ?? 'APPROVED_ACTIVE',
        firstName: snap.firstName ?? '?',
        lastName: snap.lastName ?? '?',
        phone: snap.phone ?? '?',
        dateOfBirth: snap.dateOfBirth ?? '1990-01-01',
        gender: snap.gender ?? '?',
        countryCode: snap.countryCode ?? 'PH',
        countryName: snap.countryName ?? '?',
        programId,
        programCode: snap.programCode ?? (programId === 'prg-abroad' ? 'ABROAD' : 'DOMESTIC'),
        qualificationAnswers: snap.qualificationAnswers ?? [],
        governmentId: snap.governmentId ?? { fileName: 'archived', mimeType: 'application/pdf', sizeBytes: 1 },
        submittedAt: snap.submittedAt ?? snap.createdAt ?? row.archivedAt,
        createdAt: snap.createdAt ?? row.archivedAt,
        updatedAt: snap.updatedAt ?? row.archivedAt,
      },
      archivedAt: row.archivedAt,
      archivedBy: row.archivedBy ?? 'unknown',
      previousStatus: String(snap.status ?? 'APPROVED_ACTIVE'),
      previousAccountStatus: snap.accountStatus ?? undefined,
    };
  });
  okList(res, rows.filter((row) => archivedMemberSchema.safeParse(row).success));
}
