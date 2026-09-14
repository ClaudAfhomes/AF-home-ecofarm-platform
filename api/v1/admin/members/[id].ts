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
    const parsed = adminMemberSchema.safeParse(mapAdminMemberRow(current));
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
  if (Object.keys(patch).length === 0) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  const { data: updated, error: writeError } = await supabase
    .from('Member')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (writeError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      writeError?.message ?? 'Update failed',
      500,
    );
    res.status(status).json({ error });
    return;
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
        : 'Updated member profile',
  });
  res.status(200).json(parsed.data);
}
