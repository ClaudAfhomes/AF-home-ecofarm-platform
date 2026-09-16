import { randomUUID } from 'node:crypto';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { findAuthUserId, isAuthConflict, verifyStaffModule } from '../../_lib/auth.js';
import { appendAudit } from '../../_lib/audit.js';
import { getSupabaseEnv } from '../../_lib/env.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidAdminMemberRow, mapAdminMemberRow } from '../../_lib/pipeline.js';
import { isReferralCodeConflict, pickUniqueReferralCode } from '../../_lib/referral-codes.js';
import { adminMemberSchema } from '@jad/contracts';
import { methodNotAllowed, okList, readJsonBody, serviceClient } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

const PROGRAM_IDS = ['prg-domestic', 'prg-abroad'] as const;

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** GET /admin/members - roster excluding archived. POST - create with auth account. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  const auth = await verifyStaffModule(req, 'members', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }
  const supabase = serviceClient();
  if (!supabase) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('Member')
      .select('*')
      .is('archivedAt', null)
      .order('createdAt', { ascending: false });
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const { data: programs } = await supabase.from('Program').select('id, code, name');
    const byId = new Map(
      ((programs as { id: string; code: string; name: string }[] | null) ?? []).map((p) => [
        p.id,
        p,
      ]),
    );
    const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) =>
      mapAdminMemberRow(row, byId),
    );
    okList(res, rows.filter(isValidAdminMemberRow));
    return;
  }

  if (req.method === 'POST') {
    const parsedBody = readJsonBody(req);
    if (!parsedBody.ok) {
      const { error, status } = parsedBody.error;
      res.status(status).json({ error });
      return;
    }
    const input = (parsedBody.body ?? {}) as Record<string, unknown>;
    const firstName = String(input.firstName ?? '').trim();
    const lastName = String(input.lastName ?? '').trim();
    const email = String(input.email ?? '')
      .trim()
      .toLowerCase();
    // The dialog sends programCode (e.g. ABROAD); accept it and map to the
    // program id, defaulting to prg-domestic.
    const rawProgram = String(input.programId ?? input.programCode ?? 'prg-domestic');
    const programId = (PROGRAM_IDS as readonly string[]).includes(rawProgram)
      ? rawProgram
      : `prg-${rawProgram.toLowerCase()}`;
    if (!firstName || !lastName) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'First and last name are required.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    if (!validEmail(email)) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'A valid email address is required.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    if (!(PROGRAM_IDS as readonly string[]).includes(programId)) {
      const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Unknown program.', 400);
      res.status(status).json({ error });
      return;
    }
    const { data: existing } = await supabase
      .from('Member')
      .select('id')
      .eq('email', email)
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'A member with this email already exists.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const created = await supabase.auth.admin.createUser({
      email,
      password:
        typeof input.temporaryPassword === 'string' && input.temporaryPassword
          ? input.temporaryPassword
          : randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}` },
    });
    if (created.error && !isAuthConflict(created.error)) {
      const { error, status } = toErrorEnvelope('INTERNAL', created.error.message, 500);
      res.status(status).json({ error });
      return;
    }
    let authId = (created.data as { user?: { id: string } } | null)?.user?.id ?? null;
    // Duplicate identity (e.g. orphaned auth row from a failed earlier
    // attempt): adopt the existing auth account instead of failing.
    if (!authId) {
      authId = await findAuthUserId(supabase, { email });
    }
    if (!authId) {
      const { error, status } = toErrorEnvelope(
        'AUTH_IDENTITY_UNRESOLVABLE',
        'An auth account already exists for this email but could not be matched. Reconcile the identity in Supabase Auth (or remove the stray account) and retry.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const now = new Date().toISOString();
    const { data: codeRows } = await supabase.from('Member').select('referralCode');
    let taken: (string | null | undefined)[] = (
      (codeRows as { referralCode?: string | null }[] | null) ?? []
    ).map((candidate) => candidate.referralCode);
    const buildMemberRow = (referralCode: string, sponsorId: string | null) => ({
      id: authId,
      email,
      name: `${firstName} ${lastName}`,
      status: 'APPROVED_ACTIVE',
      isQualified: false,
      firstName,
      lastName,
      phone: typeof input.phone === 'string' ? input.phone : null,
      address: typeof input.address === 'string' ? input.address : null,
      countryCode: typeof input.countryCode === 'string' ? input.countryCode : 'PH',
      countryName: typeof input.countryName === 'string' ? input.countryName : 'Philippines',
      programId,
      referralCode,
      sponsorId,
      accountStatus: 'ACTIVE',
      createdAt: now,
    });
    // Optional sponsor link (B7 Member.sponsorId). Accepts the sponsor's
    // referral CODE (not a uuid) and resolves it exactly like registration
    // approval: ACTIVE + qualified, never self. Unresolvable codes reject
    // (400) instead of silently creating a sponsorless member.
    let sponsorId: string | null = null;
    const sponsorCode = String(input.referralCode ?? '').trim();
    if (sponsorCode) {
      const { data: sponsorRows } = await supabase
        .from('Member')
        .select('id,referralCode,accountStatus,isQualified');
      const sponsor = (
        (sponsorRows as
          | {
              id: string;
              referralCode?: string | null;
              accountStatus?: string;
              isQualified?: boolean;
            }[]
          | null) ?? []
      ).find(
        (candidate) => (candidate.referralCode ?? '').toLowerCase() === sponsorCode.toLowerCase(),
      );
      if (
        !sponsor ||
        sponsor.id === authId ||
        sponsor.accountStatus !== 'ACTIVE' ||
        sponsor.isQualified !== true
      ) {
        const { error, status } = toErrorEnvelope(
          'VALIDATION_ERROR',
          'The referral code could not be matched to an active, qualified sponsor.',
          400,
        );
        res.status(status).json({ error });
        return;
      }
      sponsorId = sponsor.id;
    }
    let referralCode = pickUniqueReferralCode(taken, lastName);
    let memberResult = await supabase
      .from('Member')
      .upsert(buildMemberRow(referralCode, sponsorId), { onConflict: 'id' });
    if (memberResult.error && isReferralCodeConflict(memberResult.error)) {
      taken = [...taken, referralCode];
      referralCode = pickUniqueReferralCode(taken, lastName);
      memberResult = await supabase
        .from('Member')
        .upsert(buildMemberRow(referralCode, sponsorId), { onConflict: 'id' });
    }
    if (memberResult.error) {
      if (isReferralCodeConflict(memberResult.error)) {
        const { error, status } = toErrorEnvelope(
          'CONFLICT',
          'Referral code collision - retry member creation.',
          409,
        );
        res.status(status).json({ error });
        return;
      }
      const { error, status } = toErrorEnvelope('INTERNAL', memberResult.error.message, 500);
      res.status(status).json({ error });
      return;
    }
    const { data: roleRows } = await supabase
      .from('Role')
      .select('id')
      .eq('slug', 'member_basic')
      .limit(1);
    const basicId = ((roleRows as { id: string }[] | null) ?? [])[0]?.id;
    if (basicId) {
      await supabase
        .from('MemberRole')
        .upsert({ memberId: authId, roleId: basicId }, { onConflict: '"memberId","roleId"' });
    }
    await appendAudit(supabase, {
      action: 'MEMBER_CREATED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'admin',
      targetType: 'Member',
      targetId: authId,
      targetName: `${firstName} ${lastName}`,
      detail: `Created member ${firstName} ${lastName}`,
    });
    // Return the full created row - the client validates POST responses
    // against adminMemberSchema, so a partial shape would fail parsing
    // AFTER a successful create (phantom member + stuck form).
    const { data: createdRow, error: readBackError } = await supabase
      .from('Member')
      .select('*')
      .eq('id', authId)
      .maybeSingle();
    if (readBackError || !createdRow) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        readBackError?.message ?? 'Created member unreadable',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    const { data: programs } = await supabase.from('Program').select('id, code, name');
    const byId = new Map(
      ((programs as { id: string; code: string; name: string }[] | null) ?? []).map((p) => [
        p.id,
        p,
      ]),
    );
    const mapped = mapAdminMemberRow(createdRow as Record<string, unknown>, byId);
    const parsed = adminMemberSchema.safeParse(mapped);
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        'Created member failed validation',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    res.status(201).json(parsed.data);
    return;
  }

  methodNotAllowed(res, req.method);
}
