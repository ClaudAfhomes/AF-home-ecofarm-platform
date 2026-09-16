import { randomUUID } from 'node:crypto';

import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { findAuthUserId, isAuthConflict, verifyStaffModule } from '../../../../_lib/auth.js';
import { appendAudit } from '../../../../_lib/audit.js';
import { getSupabaseEnv } from '../../../../_lib/env.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { isReferralCodeConflict, pickUniqueReferralCode } from '../../../../_lib/referral-codes.js';
import { methodNotAllowed, readJsonBody, serviceClient } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/**
 * POST /admin/registrations/:id/approve — approve an application: provisions
 * the auth account + Member row + basic role, deletes the Registration row
 * (registrations are PENDING | REJECTED only — the member owns the identity
 * from here), and audits. Only PENDING applications convert (409 otherwise).
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
  const auth = await verifyStaffModule(req, 'registrations', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Registration id is required',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const body = readJsonBody(req);
  if (!body.ok) {
    const { error, status } = body.error;
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
  const { data: reg, error: readError } = await supabase
    .from('Registration')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!reg) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Registration not found', 404);
    res.status(status).json({ error });
    return;
  }
  const row = reg as Record<string, unknown>;
  if (row.status !== 'PENDING') {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'Only PENDING registrations can be approved.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  // Resolve the referral code to a sponsor (B7 Member.sponsorId) BEFORE any
  // auth provisioning so a bad code fails cleanly (no partial writes).
  // NOTE: Registration.referralCode is the *sponsor's* code from intake; the
  // new Member always gets a freshly generated *own* code (BR-REF-004).
  let sponsorId: string | null = null;
  const sponsorCode = String((row.referralCode as string | undefined) ?? '').trim();
  type SponsorLookup = {
    id: string;
    referralCode?: string | null;
    accountStatus?: string;
    isQualified?: boolean;
  };
  const { data: sponsors } = await supabase
    .from('Member')
    .select('id,referralCode,accountStatus,isQualified');
  const members = ((sponsors as SponsorLookup[] | null) ?? []) as SponsorLookup[];
  let existingCodes: (string | null | undefined)[] = members.map(
    (candidate) => candidate.referralCode,
  );
  if (sponsorCode) {
    const sponsor = members.find(
      (candidate) => (candidate.referralCode ?? '').toLowerCase() === sponsorCode.toLowerCase(),
    );
    // Sponsors must be ACTIVE + Qualified (BR-REF-003, mirrors
    // POST /auth/register). An intake-valid code that no longer resolves
    // (sponsor deactivated/disqualified in the meantime) rejects approval
    // instead of silently creating a sponsorless member — a new applicant is
    // never an existing Member, so self-referral is impossible here.
    if (sponsor && sponsor.accountStatus === 'ACTIVE' && sponsor.isQualified === true) {
      sponsorId = sponsor.id;
    }
    if (!sponsorId) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'The referral code could not be matched to an active, qualified sponsor. Verify the sponsor account and retry approval.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
  }
  // Provision the auth account (random unusable password — member sets their own via recovery).
  // Registration identity is phone-based (the Registration table has no
  // email column); email is used when present (forward-compat). Normalized
  // to lowercase to match how Supabase Auth stores emails (GoTrue lowercases)
  // — otherwise adoption after a createUser conflict misses on exact match.
  const email = String((row.email as string | undefined) ?? '')
    .trim()
    .toLowerCase();
  const phone = String((row.phone as string | undefined) ?? '').trim();
  if (!email && !phone) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Registration has neither email nor phone — cannot provision an auth account.',
      422,
    );
    res.status(status).json({ error });
    return;
  }
  let memberAuthId: string | null = null;
  const created = await supabase.auth.admin.createUser({
    ...(email ? { email } : { phone }),
    password: randomUUID(),
    ...(email ? { email_confirm: true } : { phone_confirm: true }),
    user_metadata: { full_name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() },
  });
  if (created.error && !isAuthConflict(created.error)) {
    const { error, status } = toErrorEnvelope('INTERNAL', created.error.message, 500);
    res.status(status).json({ error });
    return;
  }
  memberAuthId = (created.data as { user?: { id: string } } | null)?.user?.id ?? null;
  // Duplicate identity (orphaned auth row from a failed earlier attempt):
  // adopt the existing account instead of failing.
  if (!memberAuthId) {
    memberAuthId = await findAuthUserId(supabase, email ? { email } : { phone });
  }
  if (!memberAuthId) {
    // The identity exists in Auth (createUser conflicted) but could not be
    // resolved — surface an actionable conflict instead of a raw INTERNAL.
    const { error, status } = toErrorEnvelope(
      'AUTH_IDENTITY_UNRESOLVABLE',
      'An auth account already exists for this email but could not be matched. Reconcile the identity in Supabase Auth (or remove the stray account) and retry.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  // Public intake (/auth/register) creates accounts UNCONFIRMED — email
  // verification lands with the email.js integration. Approval is therefore
  // the authoritative activation gate: confirm the identity here on BOTH
  // paths — fresh creates (harmless no-op) and the adoption path (existing
  // user from /register, which previously stayed unconfirmed forever and
  // blocked sign-in with "Email not confirmed"). Runs before any Member
  // write so a failure cannot strand an approved-but-unconfirmed account.
  const confirmResult = await supabase.auth.admin.updateUserById(memberAuthId, {
    ...(email ? { email_confirm: true } : { phone_confirm: true }),
  });
  if (confirmResult.error) {
    const { error, status } = toErrorEnvelope('INTERNAL', confirmResult.error.message, 500);
    res.status(status).json({ error });
    return;
  }
  // Member.email is NOT NULL + format-validated client-side. Phone-only
  // members get a deterministic unique stand-in (contact stays the phone).
  const memberEmail = email || `${phone.replace(/\D/g, '')}@phone.invalid`;
  const buildMemberRow = (referralCode: string) => ({
    id: memberAuthId,
    email: memberEmail,
    name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
    status: 'APPROVED_ACTIVE',
    // Active + Qualified on approval (BR-REG-007 / BR-QUAL-001): the
    // application carried the required qualification answers + government
    // ID (BR-REG-003), identity is confirmed above, and this admin action
    // is the approval gate — all documented qualification gates are met.
    isQualified: true,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: phone || null,
    address: row.address ?? null,
    countryCode: row.countryCode ?? null,
    countryName: row.countryName ?? null,
    programId: row.programId ?? null,
    dateOfBirth: (row.dateOfBirth as string | undefined) ?? null,
    gender: (row.gender as string | undefined) ?? null,
    referralCode,
    sponsorId,
    accountStatus: 'ACTIVE',
    registrationId: id,
  });
  let memberReferralCode = pickUniqueReferralCode(
    existingCodes,
    row.lastName as string | undefined,
  );
  let memberResult = await supabase
    .from('Member')
    .upsert(buildMemberRow(memberReferralCode), { onConflict: 'id' });
  // Concurrent-approval race (or a code outside the pre-check window):
  // the partial UNIQUE index remains the source of truth — regenerate once
  // and retry before surfacing a safe conflict.
  if (memberResult.error && isReferralCodeConflict(memberResult.error)) {
    existingCodes = [...existingCodes, memberReferralCode];
    memberReferralCode = pickUniqueReferralCode(existingCodes, row.lastName as string | undefined);
    memberResult = await supabase
      .from('Member')
      .upsert(buildMemberRow(memberReferralCode), { onConflict: 'id' });
  }
  if (memberResult.error) {
    if (isReferralCodeConflict(memberResult.error)) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'Referral code collision — retry approval.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    const { error, status } = toErrorEnvelope('INTERNAL', memberResult.error.message, 500);
    res.status(status).json({ error });
    return;
  }
  // Grant the qualified member roles (mirrors the seeded qualified members,
  // which hold member_basic + member_qualified). Do not downgrade a member
  // who already carries roles from an earlier approval (idempotent upserts).
  const { data: roleRows } = await supabase
    .from('Role')
    .select('id,slug')
    .in('slug', ['member_basic', 'member_qualified']);
  const roleIdBySlug = new Map(
    ((roleRows as { id: string; slug: string }[] | null) ?? []).map((row) => [row.slug, row.id]),
  );
  for (const slug of ['member_basic', 'member_qualified'] as const) {
    const roleId = roleIdBySlug.get(slug);
    if (!roleId) continue;
    const { error: linkError } = await supabase
      .from('MemberRole')
      .upsert({ memberId: memberAuthId, roleId }, { onConflict: '"memberId","roleId"' });
    if (linkError) {
      const { error, status } = toErrorEnvelope('INTERNAL', linkError.message, 500);
      res.status(status).json({ error });
      return;
    }
  }
  // Approval consumes the application: the member owns the identity from
  // here, so the Registration row leaves the queue (registrations are
  // PENDING | REJECTED only). Runs after member + roles succeed.
  const { error: deleteError } = await supabase.from('Registration').delete().eq('id', id);
  if (deleteError) {
    const { error, status } = toErrorEnvelope('INTERNAL', deleteError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'REGISTRATION_APPROVED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Registration',
    targetId: id,
    targetName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
    detail: 'Approved registration and activated member account',
  });
  res.status(200).json({ id, status: 'APPROVED_ACTIVE', memberId: memberAuthId });
}
