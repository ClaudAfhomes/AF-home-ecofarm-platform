import { adminMemberSchema, purgeMemberRequestSchema } from '@jad/contracts';

import { ADMIN_STAFF, SUPER_ADMIN_ONLY } from '../../../_lib/access.js';
import { slugsAllowed, verifyStaffModule } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapAdminMemberRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

const EDITABLE_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'middleInitial',
  'nameSuffix',
  'gender',
  'address',
  'phone',
] as const;

const DB_COLUMNS: Record<string, string> = {
  firstName: 'firstName',
  lastName: 'lastName',
  middleInitial: 'middleInitial',
  nameSuffix: 'nameSuffix',
  gender: 'gender',
  address: 'address',
  phone: 'phone',
};

/** GET / PATCH / DELETE /admin/members/:id. Country immutable (BR-REG-010). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'members', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Member id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Member')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;
  const displayName =
    `${current.firstName ?? ''} ${current.lastName ?? ''}`.trim() || String(current.name ?? id);

  if (req.method === 'GET') {
    // Resolve the sponsor's display fields (code + name) for the admin
    // detail view; absent when the member is unlinked.
    let enriched: Record<string, unknown> = current;
    if (typeof current.sponsorId === 'string' && current.sponsorId) {
      const { data: sponsorRow } = await supabase
        .from('Member')
        .select('referralCode,firstName,lastName,name')
        .eq('id', current.sponsorId)
        .maybeSingle();
      const sponsor = (sponsorRow ?? null) as {
        referralCode?: unknown;
        firstName?: unknown;
        lastName?: unknown;
        name?: unknown;
      } | null;
      if (sponsor) {
        const sponsorName =
          [sponsor.firstName, sponsor.lastName]
            .filter((part) => typeof part === 'string' && part)
            .join(' ') || (typeof sponsor.name === 'string' ? sponsor.name : '');
        enriched = {
          ...current,
          sponsorReferralCode:
            typeof sponsor.referralCode === 'string' ? sponsor.referralCode : undefined,
          sponsorName: sponsorName || undefined,
        };
      }
    }
    const parsed = adminMemberSchema.safeParse(mapAdminMemberRow(enriched));
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope('INTERNAL', 'Stored member failed validation', 500);
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsed.data);
    return;
  }

  if (req.method === 'DELETE') {
    // Phase D — permanent deletion (super_admin only, owner-approved
    // exception to the archive-only default). The DB function deletes the
    // member's entire graph (ledger, commissions, withdrawals, sales,
    // customers, wallet, payout accounts, roles, notifications) in ONE
    // transaction — the RESTRICT FKs are satisfied by the leaf-first order.
    // The auth.users row is removed afterwards; the purge itself is audited
    // with a snapshot of the destroyed identity.
    if (!slugsAllowed(auth.slugs, [...SUPER_ADMIN_ONLY])) {
      const { error, status } = toErrorEnvelope(
        'FORBIDDEN',
        'Only super admins can permanently delete members.',
        403,
      );
      res.status(status).json({ error });
      return;
    }
    const parsedDeleteBody = readJsonBody(req);
    if (!parsedDeleteBody.ok) {
      const { error, status } = parsedDeleteBody.error;
      res.status(status).json({ error });
      return;
    }
    const parsedDelete = purgeMemberRequestSchema.safeParse(parsedDeleteBody.body ?? {});
    if (!parsedDelete.success) {
      const { error, status } = toErrorEnvelope(
        'REJECTION_REASON_REQUIRED',
        'A reason is required to permanently delete a member.',
        422,
      );
      res.status(status).json({ error });
      return;
    }
    const { data: rpcData, error: rpcError } = await supabase.rpc('member_purge_cascade', {
      p_member: id,
      p_actor: auth.userId,
      p_reason: parsedDelete.data.reason,
    });
    if (rpcError) {
      const { error, status } = toErrorEnvelope('INTERNAL', rpcError.message, 500);
      res.status(status).json({ error });
      return;
    }
    const result = (rpcData ?? {}) as {
      error?: { code: string; message: string; status?: number };
      purged?: { id: string; email: string; name: string | null };
    };
    if (result.error) {
      const { error, status } = toErrorEnvelope(
        result.error.code as never,
        result.error.message,
        result.error.status ?? 500,
      );
      res.status(status).json({ error });
      return;
    }
    // Remove the Supabase Auth identity. Best-effort: an already-missing
    // auth account must not fail the purge (the Member row is already gone).
    // One retry on transient failure — a surviving auth user stays
    // login-capable, so the outcome is reported (authRemoved) rather than
    // swallowed.
    let authRemoved = true;
    const { error: firstDeleteError } = await supabase.auth.admin.deleteUser(id);
    if (firstDeleteError) {
      const { error: retryDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (retryDeleteError) authRemoved = false;
    }
    await appendAudit(supabase, {
      action: 'MEMBER_PURGED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'super_admin',
      targetType: 'Member',
      targetId: id,
      targetName: result.purged?.name ?? displayName,
      detail: `Permanently deleted member ${result.purged?.email ?? ''} — reason: ${parsedDelete.data.reason}${
        authRemoved ? '' : ' (auth user removal failed or already absent)'
      }`,
    });
    res.status(200).json({ purgedId: id, authRemoved });
    return;
  }

  // PATCH — profile fields plus accountStatus; country immutable.
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  if (input.countryCode !== undefined || input.countryName !== undefined) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Country is immutable per BR-REG-010.',
      422,
    );
    res.status(status).json({ error });
    return;
  }
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    if (input[field] !== undefined) patch[DB_COLUMNS[field]!] = input[field];
  }
  let statusChanged: string | null = null;
  if (input.accountStatus !== undefined) {
    if (input.accountStatus !== 'ACTIVE' && input.accountStatus !== 'INACTIVE') {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'accountStatus must be ACTIVE or INACTIVE.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    if (input.accountStatus !== current.accountStatus) {
      patch.accountStatus = input.accountStatus;
      statusChanged = input.accountStatus as string;
    }
  }
  // Qualification grant/revoke (super_admin + admin). Only an approved
  // member can be qualified (BR-QUAL-001); deactivation does not clear the
  // flag, so an ACTIVE re-activation simply works again.
  let qualificationChanged: boolean | null = null;
  let qualifiedRoleUuid: string | null = null;
  if (input.isQualified !== undefined) {
    if (typeof input.isQualified !== 'boolean') {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'isQualified must be a boolean.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    if (current.status !== 'APPROVED_ACTIVE') {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'Only approved members can be granted or revoked qualification.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    if (input.isQualified !== current.isQualified) {
      patch.isQualified = input.isQualified;
      qualificationChanged = input.isQualified;
    }
    const { data: qualRole } = await supabase
      .from('Role')
      .select('id')
      .eq('slug', 'member_qualified')
      .maybeSingle();
    qualifiedRoleUuid = ((qualRole as { id: string } | null)?.id as string | undefined) ?? null;
  }
  // Sponsor link/unlink (super_admin only — rewrites the genealogy graph).
  // Accepts the sponsor's referral CODE (resolved like registration approval);
  // `null` clears the link. Unresolvable codes reject instead of silently
  // unlinking (400), so a typo can never orphan a member's upline.
  // Linking also repairs past qualifying sales missing their DIRECT_REFERRAL
  // (the per-sale idempotency era), so one admin action fixes the referrer.
  let sponsorChanged = false;
  let resolvedSponsorId: string | null = null;
  if (input.referralCode !== undefined) {
    if (!slugsAllowed(auth.slugs, [...SUPER_ADMIN_ONLY])) {
      const { error, status } = toErrorEnvelope(
        'FORBIDDEN',
        'Only super admins can link or unlink a sponsor.',
        403,
      );
      res.status(status).json({ error });
      return;
    }
    if (input.referralCode === null) {
      if (current.sponsorId !== null && current.sponsorId !== undefined) {
        patch.sponsorId = null;
        sponsorChanged = true;
      }
    } else {
      const sponsorCode = String(input.referralCode).trim();
      if (!sponsorCode) {
        const { error, status } = toErrorEnvelope(
          'VALIDATION_ERROR',
          'Provide a sponsor referral code or null to unlink.',
          400,
        );
        res.status(status).json({ error });
        return;
      }
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
        sponsor.id === id ||
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
      resolvedSponsorId = sponsor.id;
      if (current.sponsorId !== sponsor.id) {
        patch.sponsorId = sponsor.id;
        sponsorChanged = true;
      }
    }
  }
  if (Object.keys(patch).length === 0 && !resolvedSponsorId) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  let updated: Record<string, unknown> = current;
  if (Object.keys(patch).length > 0) {
    const { data: updatedRow, error: writeError } = await supabase
      .from('Member')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (writeError || !updatedRow) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        writeError?.message ?? 'Update failed',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    updated = updatedRow as Record<string, unknown>;
  }
  // Repair: linking (or re-confirming) a sponsor issues the DIRECT_REFERRAL
  // rows that past qualifies skipped for this member's qualifying sales.
  // Idempotent per sale+type; a repair failure surfaces loudly because the
  // referrer's money is at stake (the link itself is already saved above).
  // Amounts stay exact-decimal strings — integer math only, no floats.
  const exactPercentOf = (value: string, rateValue: string): string => {
    const [vInt, vFrac = ''] = value.split('.');
    const cents = BigInt(vInt + vFrac.padEnd(2, '0').slice(0, 2));
    const [rInt, rFrac = ''] = rateValue.split('.');
    const bp = BigInt(rInt + rFrac.padEnd(4, '0').slice(0, 4));
    const rounded = (cents * bp + 5000n) / 10000n;
    const digits = rounded.toString().padStart(3, '0');
    return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  };
  if (resolvedSponsorId) {
    const { data: rateRow } = await supabase
      .from('SystemConfig')
      .select('value')
      .eq('key', 'COMMISSION_REFERRAL_RATE')
      .maybeSingle();
    const rate = (rateRow as { value?: unknown } | null)?.value;
    if (typeof rate !== 'string' || !/^[0-9]+(\.[0-9]{1,4})?$/.test(rate)) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        'Commission referral rate is not configured.',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    const { data: qualifyingSales } = await supabase
      .from('Sale')
      .select('id,propertyValue')
      .eq('sellerId', id)
      .eq('status', 'QUALIFYING_SALE');
    const { data: existingReferrals } = await supabase
      .from('Commission')
      .select('saleId')
      .eq('memberId', resolvedSponsorId)
      .eq('commissionType', 'DIRECT_REFERRAL');
    const covered = new Set(
      ((existingReferrals as { saleId?: unknown }[] | null) ?? []).map((r) =>
        typeof r.saleId === 'string' ? r.saleId : '',
      ),
    );
    for (const sale of (qualifyingSales as { id: string; propertyValue?: unknown }[] | null) ??
      []) {
      if (covered.has(sale.id)) continue;
      if (
        typeof sale.propertyValue !== 'string' ||
        !/^[0-9]+(\.[0-9]{1,2})?$/.test(sale.propertyValue)
      ) {
        continue;
      }
      const amount = exactPercentOf(sale.propertyValue, rate);
      const { error: repairError } = await supabase.from('Commission').insert({
        id: `com-repair-${sale.id}`.slice(0, 32),
        memberId: resolvedSponsorId,
        commissionType: 'DIRECT_REFERRAL',
        saleId: sale.id,
        baseValue: sale.propertyValue,
        rate,
        amount,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      if (repairError) {
        const { error, status } = toErrorEnvelope('INTERNAL', repairError.message, 500);
        res.status(status).json({ error });
        return;
      }
      covered.add(sale.id);
    }
  }
  if (qualificationChanged !== null && qualifiedRoleUuid) {
    if (qualificationChanged) {
      const { error: linkError } = await supabase
        .from('MemberRole')
        .upsert({ memberId: id, roleId: qualifiedRoleUuid }, { onConflict: '"memberId","roleId"' });
      if (linkError) {
        const { error, status } = toErrorEnvelope('INTERNAL', linkError.message, 500);
        res.status(status).json({ error });
        return;
      }
    } else {
      const { error: unlinkError } = await supabase
        .from('MemberRole')
        .delete()
        .eq('memberId', id)
        .eq('roleId', qualifiedRoleUuid);
      if (unlinkError) {
        const { error, status } = toErrorEnvelope('INTERNAL', unlinkError.message, 500);
        res.status(status).json({ error });
        return;
      }
    }
  }
  const parsed = adminMemberSchema.safeParse(mapAdminMemberRow(updated as Record<string, unknown>));
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored member failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  const qualAction =
    qualificationChanged === null
      ? null
      : qualificationChanged
        ? 'MEMBER_QUALIFIED'
        : 'MEMBER_UNQUALIFIED';
  await appendAudit(supabase, {
    action:
      qualAction ??
      (statusChanged
        ? statusChanged === 'ACTIVE'
          ? 'MEMBER_ACTIVATED'
          : 'MEMBER_DEACTIVATED'
        : 'MEMBER_UPDATED'),
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Member',
    targetId: id,
    targetName: displayName,
    detail: qualAction
      ? `${qualificationChanged ? 'Granted' : 'Revoked'} qualification`
      : statusChanged
        ? `Set account status to ${statusChanged}`
        : sponsorChanged
          ? 'Updated sponsor link'
          : 'Updated member profile',
  });
  res.status(200).json(parsed.data);
}
