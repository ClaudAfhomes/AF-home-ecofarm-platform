import { registerRequestSchema } from '@jad/contracts';

import { getSupabaseEnv } from '../../_lib/env.js';
import { isAuthConflict } from '../../_lib/auth.js';
import { stripDocumentData, uploadGovernmentId } from '../../_lib/documents.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { calculateAge, prefixedId } from '../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

type Service = NonNullable<ReturnType<typeof requireService>>;
type RegistrationRow = Record<string, unknown> & { id: string; status: string };

function duplicateAccount() {
  return toErrorEnvelope('CONFLICT', 'An account with this email address already exists.', 409);
}

/** Existing application for an email, if any (stored lowercased). */
async function findRegistrationByEmail(
  supabase: Service,
  email: string,
): Promise<RegistrationRow | null> {
  const { data } = await supabase.from('Registration').select('*').eq('email', email).maybeSingle();
  if (!data) return null;
  return data as RegistrationRow;
}

function toApplicationPayload(
  row: { id: string; status: string; createdAt: string },
  email: string,
) {
  return {
    application: {
      id: row.id,
      email,
      status: row.status,
      emailVerified: false,
      createdAt: row.createdAt,
    },
  };
}

type IdDocumentInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data?: string;
};

/**
 * Store an uploaded ID document on a registration row. No-op when the
 * payload carries no file bytes or the row already has a stored file.
 * Returns an error message or null (responding is the caller's job).
 */
async function attachDocument(
  supabase: Service,
  row: RegistrationRow & { governmentId?: unknown },
  idDocument: IdDocumentInput | undefined,
): Promise<string | null> {
  if (!idDocument?.data) return null;
  const current = (row.governmentId ?? {}) as Record<string, unknown>;
  if (typeof current.storagePath === 'string' && current.storagePath) return null;
  const uploaded = await uploadGovernmentId(supabase, row.id, {
    fileName: idDocument.fileName,
    mimeType: idDocument.mimeType,
    data: idDocument.data,
  });
  if (!uploaded.ok) return uploaded.message;
  const stored = stripDocumentData(idDocument as Record<string, unknown>) as Record<
    string,
    unknown
  >;
  const { error } = await supabase
    .from('Registration')
    .update({ governmentId: { ...stored, storagePath: uploaded.storagePath } })
    .eq('id', row.id);
  return error ? error.message : null;
}

/**
 * POST /api/v1/auth/register — submit a membership application (public).
 * Idempotent per email: a retry while PENDING replays the same application
 * (200, no duplicate); a conflict with no application row completes the
 * interrupted registration (orphaned auth account) instead of stranding a
 * 409. Decided outcomes (member exists, application decided) stay 409.
 * Remaining intake semantics mirror the member mock: qualified-sponsor
 * referral check, minimum age (SystemConfig), country/program validity.
 * The auth account is created unconfirmed — email verification lands with
 * the future email.js integration. No authentication required.
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
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = registerRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Some registration details are missing or invalid.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const input = parsed.data;
  const email = input.email.trim().toLowerCase();
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  const { data: memberHit } = await supabase
    .from('Member')
    .select('id')
    .eq('email', email)
    .limit(1);
  if (Array.isArray(memberHit) && memberHit.length > 0) {
    const { error, status } = duplicateAccount();
    res.status(status).json({ error });
    return;
  }
  // Idempotent replay: an in-flight (PENDING) application for this email
  // returns as-is instead of duplicating (attaching a fresh document when
  // the stored row still lacks one, e.g. after a failed first upload).
  const existing = await findRegistrationByEmail(supabase, email);
  if (existing) {
    if (existing.status === 'PENDING') {
      const attachError = await attachDocument(supabase, existing, input.idDocument);
      if (attachError) {
        const { error, status } = toErrorEnvelope('INTERNAL', attachError, 500);
        res.status(status).json({ error });
        return;
      }
      res.status(200).json(
        toApplicationPayload(
          {
            id: existing.id,
            status: existing.status,
            createdAt: String(existing.createdAt ?? new Date().toISOString()),
          },
          email,
        ),
      );
      return;
    }
    if (existing.status === 'APPROVED_ACTIVE') {
      // Orphaned application: approval always creates the member row, so an
      // APPROVED registration with no Member for this email means the member
      // was purged (a live member returned 409 above). Release the email
      // (purge-everything semantics) and continue as a fresh application
      // instead of stranding a permanent 409.
      const { error: releaseError } = await supabase
        .from('Registration')
        .delete()
        .eq('id', existing.id);
      if (releaseError) {
        const { error, status } = toErrorEnvelope('INTERNAL', releaseError.message, 500);
        res.status(status).json({ error });
        return;
      }
    } else {
      const { error, status } = duplicateAccount();
      res.status(status).json({ error });
      return;
    }
  }
  if (input.referralCode) {
    const code = input.referralCode.trim();
    const { data: sponsors } = await supabase
      .from('Member')
      .select('id,referralCode,isQualified,accountStatus');
    type SponsorRow = {
      id: string;
      referralCode?: string | null;
      isQualified?: boolean;
      accountStatus?: string;
    };
    const sponsorList = ((sponsors as SponsorRow[] | null) ?? []) as SponsorRow[];
    const sponsor = sponsorList.find(
      (candidate) => (candidate.referralCode ?? '').toLowerCase() === code.toLowerCase(),
    );
    // Sponsors must be ACTIVE + Qualified (BR-REF-003 / BR-QUAL-001).
    if (!sponsor || sponsor.isQualified !== true || sponsor.accountStatus !== 'ACTIVE') {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'The referral code is not valid.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
  }
  const { data: minAgeRow } = await supabase
    .from('SystemConfig')
    .select('value')
    .eq('key', 'QUALIFICATION_MIN_AGE')
    .maybeSingle();
  const minAge = Number((minAgeRow as { value?: string } | null)?.value ?? 18) || 18;
  if (calculateAge(input.dateOfBirth) < minAge) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      `Applicants must be at least ${minAge} years old.`,
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const { data: country } = await supabase
    .from('countries')
    .select('code,name')
    .eq('code', input.countryCode)
    .maybeSingle();
  if (!country) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Select a valid country.', 400);
    res.status(status).json({ error });
    return;
  }
  const { data: program } = await supabase
    .from('Program')
    .select('id,code')
    .eq('id', input.programId)
    .maybeSingle();
  if (!program) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Select a valid program.', 400);
    res.status(status).json({ error });
    return;
  }
  const created = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: false,
    user_metadata: { full_name: `${input.firstName} ${input.lastName}`.trim() },
  });
  const buildRegistrationRow = (now: string) => ({
    id: prefixedId('reg'),
    status: 'PENDING',
    firstName: input.firstName,
    middleInitial: input.middleInitial ?? null,
    lastName: input.lastName,
    nameSuffix: input.nameSuffix ?? null,
    email,
    phone: input.phone,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    countryCode: (country as { code: string }).code,
    countryName: (country as { name: string }).name,
    address: input.address ?? null,
    programId: (program as { id: string }).id,
    programCode: (program as { code: string }).code,
    referralCode: input.referralCode?.trim() || null,
    qualificationAnswers: input.qualificationAnswers,
    // Never persist upload bytes — only metadata (+ storagePath later).
    governmentId: stripDocumentData(input.idDocument as Record<string, unknown>),
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  /** Insert the application row; returns true when the response was sent. */
  const insertRegistration = async (): Promise<boolean> => {
    const now = new Date().toISOString();
    const registration = buildRegistrationRow(now);
    const { error: insertError } = await supabase.from('Registration').insert(registration);
    if (insertError) {
      // Lost race with a concurrent submit for the same email: replay it.
      const replay = await findRegistrationByEmail(supabase, email);
      if (replay && replay.status === 'PENDING') {
        res.status(200).json(
          toApplicationPayload(
            {
              id: replay.id,
              status: replay.status,
              createdAt: String(replay.createdAt ?? now),
            },
            email,
          ),
        );
        return true;
      }
      const { error, status } = toErrorEnvelope('INTERNAL', insertError.message, 500);
      res.status(status).json({ error });
      return true;
    }
    // Row first, file second (fail-closed: never an orphaned file). A failed
    // upload 500s so the retry replays the row and re-attempts the file.
    const attachError = await attachDocument(
      supabase,
      { id: registration.id, status: registration.status },
      input.idDocument,
    );
    if (attachError) {
      const { error, status } = toErrorEnvelope('INTERNAL', attachError, 500);
      res.status(status).json({ error });
      return true;
    }
    res.status(201).json({
      application: {
        id: registration.id,
        email,
        status: 'PENDING',
        emailVerified: false,
        createdAt: now,
      },
    });
    return true;
  };
  if (created.error) {
    if (isAuthConflict(created.error)) {
      // Orphaned auth account (an earlier attempt died after createUser):
      // complete the interrupted registration (insertRegistration always
      // responds: 201 created, 200 replay, or 500 with the insert error).
      const interrupted = await findRegistrationByEmail(supabase, email);
      if (interrupted) {
        if (interrupted.status === 'PENDING') {
          res.status(200).json(
            toApplicationPayload(
              {
                id: interrupted.id,
                status: interrupted.status,
                createdAt: String(interrupted.createdAt ?? new Date().toISOString()),
              },
              email,
            ),
          );
          return;
        }
        const { error, status } = duplicateAccount();
        res.status(status).json({ error });
        return;
      }
      await insertRegistration();
      return;
    }
    const { error, status } = toErrorEnvelope('INTERNAL', created.error.message, 500);
    res.status(status).json({ error });
    return;
  }
  await insertRegistration();
}
