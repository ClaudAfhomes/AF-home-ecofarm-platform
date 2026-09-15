import { appendAudit } from '../../_lib/audit.js';
import { verifyUser } from '../../_lib/auth.js';
import { stripDocumentData, uploadGovernmentId } from '../../_lib/documents.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { calculateAge } from '../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * POST /me/resubmit — corrected data for a REJECTED application. Applies the
 * editable fields to the Member row and its linked Registration, then returns
 * both to PENDING (unlimited resubmissions, BR-REG-005). Country is immutable.
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
    .select('*')
    .eq('id', auth.userId)
    .maybeSingle();
  if (memberError || !member) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const m = member as Record<string, unknown>;
  if (m.status !== 'REJECTED') {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'Only a rejected application can be resubmitted.',
      409,
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
  const body = (parsedBody.body ?? {}) as Record<string, unknown>;
  if (body.countryCode !== undefined && body.countryCode !== m.countryCode) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Country cannot be changed.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined);
  if (typeof body.dateOfBirth === 'string' && body.dateOfBirth) {
    const { data: minAgeRow } = await supabase
      .from('SystemConfig')
      .select('value')
      .eq('key', 'QUALIFICATION_MIN_AGE')
      .maybeSingle();
    const minAge = Number((minAgeRow as { value?: string } | null)?.value ?? 18) || 18;
    if (calculateAge(body.dateOfBirth) < minAge) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        `Applicants must be at least ${minAge} years old.`,
        400,
      );
      res.status(status).json({ error });
      return;
    }
  }
  const memberPatch: Record<string, unknown> = { status: 'PENDING', isQualified: false };
  for (const field of [
    'firstName',
    'lastName',
    'phone',
    'address',
    'dateOfBirth',
    'gender',
  ] as const) {
    const value = trimmed(body[field]);
    if (value) memberPatch[field] = value;
  }
  for (const field of ['middleInitial', 'nameSuffix'] as const) {
    if (typeof body[field] === 'string') memberPatch[field] = body[field];
  }
  const fullName = [memberPatch.firstName ?? m.firstName, memberPatch.lastName ?? m.lastName]
    .filter((part) => typeof part === 'string' && part)
    .join(' ');
  if (fullName) memberPatch.name = fullName;
  const { error: updateError } = await supabase
    .from('Member')
    .update(memberPatch)
    .eq('id', auth.userId);
  if (updateError) {
    const { error, status } = toErrorEnvelope('INTERNAL', updateError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const registrationId = typeof m.registrationId === 'string' ? m.registrationId : null;
  if (registrationId) {
    const regPatch: Record<string, unknown> = {
      status: 'PENDING',
      reviewedAt: null,
      reviewedBy: null,
      rejectionNote: null,
    };
    for (const field of [
      'firstName',
      'lastName',
      'middleInitial',
      'nameSuffix',
      'phone',
      'address',
      'dateOfBirth',
      'gender',
    ] as const) {
      if (memberPatch[field] !== undefined) regPatch[field] = memberPatch[field];
    }
    if (Array.isArray(body.qualificationAnswers))
      regPatch.qualificationAnswers = body.qualificationAnswers;
    const governmentId = (body.governmentId ?? body.idDocument) as
      Record<string, unknown> | undefined;
    if (governmentId !== undefined) {
      // Never persist upload bytes; upload a fresh file when provided.
      regPatch.governmentId = stripDocumentData(governmentId) ?? governmentId;
      if (typeof governmentId.data === 'string' && governmentId.data) {
        const uploaded = await uploadGovernmentId(supabase, registrationId, {
          fileName: governmentId.fileName,
          mimeType: governmentId.mimeType,
          data: governmentId.data,
        });
        if (!uploaded.ok) {
          const { error, status } = toErrorEnvelope('INTERNAL', uploaded.message, 500);
          res.status(status).json({ error });
          return;
        }
        regPatch.governmentId = {
          ...(regPatch.governmentId as Record<string, unknown>),
          storagePath: uploaded.storagePath,
        };
      }
    }
    const { error: regUpdateError } = await supabase
      .from('Registration')
      .update(regPatch)
      .eq('id', registrationId);
    if (regUpdateError) {
      const { error, status } = toErrorEnvelope('INTERNAL', regUpdateError.message, 500);
      res.status(status).json({ error });
      return;
    }
  }
  await appendAudit(supabase, {
    action: 'APPLICATION_RESUBMITTED',
    actorId: auth.userId,
    actorRole: 'member',
    targetType: 'Registration',
    targetId: registrationId ?? auth.userId,
    targetName: fullName || String(m.email ?? auth.userId),
    detail: `Resubmitted application ${registrationId ?? auth.userId}`,
  });
  const { data: authUser } = await supabase.auth.admin.getUserById(auth.userId);
  const emailVerified = Boolean(
    authUser?.user && (authUser.user as { email_confirmed_at?: string }).email_confirmed_at,
  );
  res.status(200).json({
    application: {
      id: auth.userId,
      email: m.email,
      status: 'PENDING',
      emailVerified,
      createdAt: new Date().toISOString(),
    },
  });
}
