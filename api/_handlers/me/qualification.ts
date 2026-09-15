import { qualificationSummarySchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { calculateAge } from '../../_lib/pipeline.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /me/qualification — server-authoritative checklist (mirrors the member
 * mock requirement keys and copy). Sources: Member row (status, age,
 * qualification), linked Registration (ID evidence, rejection), SystemConfig
 * (minimum age), Auth (email confirmation).
 */
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
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: member, error: memberError } = await supabase
    .from('Member')
    .select('id,status,isQualified,dateOfBirth,registrationId')
    .eq('id', auth.userId)
    .maybeSingle();
  if (memberError || !member) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const m = member as {
    status?: string;
    isQualified?: boolean;
    dateOfBirth?: string | null;
    registrationId?: string | null;
  };
  const [{ data: minAgeRow }, { data: registration }, { data: authUser }] = await Promise.all([
    supabase.from('SystemConfig').select('value').eq('key', 'QUALIFICATION_MIN_AGE').maybeSingle(),
    m.registrationId
      ? supabase
          .from('Registration')
          .select('status,governmentId,rejectionNote')
          .eq('id', m.registrationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.auth.admin.getUserById(auth.userId),
  ]);
  const minAge = Number((minAgeRow as { value?: string } | null)?.value ?? 18) || 18;
  const reg = (registration ?? null) as {
    status?: string;
    governmentId?: unknown;
    rejectionNote?: unknown;
  } | null;
  const age = typeof m.dateOfBirth === 'string' && m.dateOfBirth ? calculateAge(m.dateOfBirth) : -1;
  // Identity verified when the email is confirmed OR the account is a
  // phone-identity member whose phone is confirmed (approval confirms the
  // matching identity type; an email-less phone account must not look
  // unverified forever). Label stays "Email verified" (BR-AUTH-001).
  const authUserRow = (authUser?.user ?? null) as {
    email?: string | null;
    email_confirmed_at?: string | null;
    phone?: string | null;
    phone_confirmed_at?: string | null;
  } | null;
  const emailConfirmed = Boolean(authUserRow?.email_confirmed_at);
  const hasEmail = Boolean(authUserRow?.email);
  const phoneConfirmed = Boolean(authUserRow?.phone_confirmed_at);
  const identityVerified = hasEmail ? emailConfirmed : phoneConfirmed;
  const idVerified = reg !== null && reg.governmentId !== null && reg.governmentId !== undefined;
  const adminApproved = m.status === 'APPROVED_ACTIVE';
  const qualificationMet = m.isQualified === true;
  const rejectionNote = reg?.rejectionNote as { reason?: unknown } | string | null | undefined;
  const rejectionReason =
    typeof rejectionNote === 'string'
      ? rejectionNote
      : typeof rejectionNote?.reason === 'string'
        ? rejectionNote.reason
        : undefined;
  const requirements = [
    {
      key: 'MIN_AGE',
      label: 'Minimum age',
      met: age >= minAge,
      detail: age >= minAge ? undefined : `Applicants must be at least ${minAge} years old.`,
    },
    {
      key: 'EMAIL_VERIFIED',
      label: 'Email verified',
      met: identityVerified,
      detail: identityVerified ? undefined : 'Verify your email address to continue.',
    },
    {
      key: 'ID_VERIFIED',
      label: 'Government ID verified',
      met: idVerified,
      detail: idVerified
        ? undefined
        : 'Your government-issued ID is verified manually by JA&D Admin.',
    },
    {
      key: 'ADMIN_APPROVAL',
      label: 'Admin approval',
      met: adminApproved,
      detail: adminApproved ? undefined : 'Your application is under review by JA&D Admin.',
    },
    {
      key: 'QUALIFICATION',
      label: 'Qualification requirements satisfied',
      met: qualificationMet,
      detail:
        qualificationMet || adminApproved
          ? qualificationMet
            ? undefined
            : 'Qualification is granted by JA&D Admin. Contact support if you believe this is an error.'
          : 'Complete the qualification questions to satisfy the qualification requirements.',
    },
  ];
  const parsed = qualificationSummarySchema.safeParse({
    status: m.status ?? 'PENDING',
    isQualified: m.isQualified ?? false,
    requirements,
    rejectionReason,
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Qualification summary failed validation',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
