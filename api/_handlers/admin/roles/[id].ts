import {
  CUSTOM_ROLE_FORBIDDEN_MODULES,
  roleRecordSchema,
  staffModuleSchema,
  STAFF_MODULE_LABEL,
} from '@jad/contracts';

import { SUPER_ADMIN_ONLY } from '../../../_lib/access.js';
import { verifyStaff } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import { guardRoleDeleteServer, guardRolePermissions } from '../../../_lib/governance.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { pickStaffRoleId } from '../../../_lib/rbac.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

type DbRole = {
  id: string;
  key: string | null;
  slug: string;
  name: string;
  permissions: unknown;
  is_system: boolean;
};

async function findRole(
  supabase: NonNullable<ReturnType<typeof requireService>>,
  key: string,
): Promise<DbRole | null> {
  const { data } = await supabase
    .from('Role')
    .select('id,key,slug,name,permissions,is_system')
    .eq('key', key)
    .maybeSingle();
  const row = (data ?? null) as DbRole | null;
  if (row?.id) return row;
  const fallback = await supabase
    .from('Role')
    .select('id,key,slug,name,permissions,is_system')
    .eq('slug', key)
    .maybeSingle();
  const f = (fallback.data ?? null) as DbRole | null;
  return f?.id ? f : null;
}

function toRecord(row: DbRole) {
  return {
    id: typeof row.key === 'string' && row.key ? row.key : row.slug,
    name: row.name,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    isSystem: row.is_system === true,
  };
}

/** GET / PATCH / DELETE /admin/roles/:id (super_admin only, guards enforced). */
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
  const auth = await verifyStaff(req, [...SUPER_ADMIN_ONLY]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Role not found', 404);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const role = await findRole(supabase, id);
  if (!role) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Role not found', 404);
    res.status(status).json({ error });
    return;
  }
  const sessionRoleId = pickStaffRoleId(auth.slugs);

  if (req.method === 'GET') {
    const parsed = roleRecordSchema.safeParse(toRecord(role));
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope('INTERNAL', 'Stored role failed validation', 500);
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsed.data);
    return;
  }

  if (req.method === 'DELETE') {
    const { data: allRoles } = await supabase.from('Role').select('id,key,slug,permissions');
    const records = (
      ((allRoles as unknown[]) ?? []) as {
        id: string;
        key?: string | null;
        slug: string;
        permissions?: unknown;
      }[]
    ).map((r) => ({
      id: typeof r.key === 'string' && r.key ? r.key : r.slug,
      permissions: Array.isArray(r.permissions)
        ? r.permissions.filter((p): p is string => typeof p === 'string')
        : [],
    }));
    const { data: holders } = await supabase
      .from('MemberRole')
      .select('memberId')
      .eq('roleId', role.id);
    const guard = guardRoleDeleteServer(
      records,
      Array.isArray(holders) ? holders.length : 0,
      {
        id: toRecord(role).id,
        permissions: toRecord(role).permissions as string[],
        isSystem: role.is_system,
      },
      sessionRoleId,
    );
    if (!guard.ok) {
      const { error, status } = toErrorEnvelope('CONFLICT', guard.reason, 409);
      res.status(status).json({ error });
      return;
    }
    const { error } = await supabase.from('Role').delete().eq('id', role.id);
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    await appendAudit(supabase, {
      action: 'ROLE_DELETED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'super_admin',
      targetType: 'Role',
      targetId: toRecord(role).id,
      targetName: role.name,
      detail: `Deleted role ${role.name}`,
    });
    res.status(200).json({ id: toRecord(role).id, deleted: true });
    return;
  }

  // PATCH — rename and/or replace permissions.
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  const patch: { name?: string; permissions?: string[] } = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name || name.length > 60) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Role name must be 1–60 characters.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    const { data: siblings } = await supabase.from('Role').select('id,name');
    const clash =
      Array.isArray(siblings) &&
      (siblings as { id: string; name?: string }[]).some(
        (r) =>
          r.id !== role.id &&
          typeof r.name === 'string' &&
          r.name.trim().toLowerCase() === name.toLowerCase(),
      );
    if (clash) {
      const { error, status } = toErrorEnvelope(
        'CONFLICT',
        'A role with this name already exists.',
        409,
      );
      res.status(status).json({ error });
      return;
    }
    patch.name = name;
  }
  if (input.permissions !== undefined) {
    if (
      !Array.isArray(input.permissions) ||
      input.permissions.length === 0 ||
      !input.permissions.every(
        (p) =>
          typeof p === 'string' && (staffModuleSchema.options as readonly string[]).includes(p),
      )
    ) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'At least one valid module permission is required.',
        400,
      );
      res.status(status).json({ error });
      return;
    }
    if (!role.is_system) {
      const forbidden = (input.permissions as string[]).filter((p) =>
        (CUSTOM_ROLE_FORBIDDEN_MODULES as readonly string[]).includes(p),
      );
      if (forbidden.length > 0) {
        const { error, status } = toErrorEnvelope(
          'VALIDATION_ERROR',
          `Custom roles cannot hold: ${forbidden.join(', ')}.`,
          400,
        );
        res.status(status).json({ error });
        return;
      }
    }
    const { data: allRoles } = await supabase.from('Role').select('id,key,slug,permissions');
    const records = (
      ((allRoles as unknown[]) ?? []) as {
        id: string;
        key?: string | null;
        slug: string;
        permissions?: unknown;
      }[]
    ).map((r) => ({
      id: typeof r.key === 'string' && r.key ? r.key : r.slug,
      permissions: Array.isArray(r.permissions)
        ? r.permissions.filter((p): p is string => typeof p === 'string')
        : [],
    }));
    const guard = guardRolePermissions(
      records,
      toRecord(role).id,
      input.permissions as string[],
      sessionRoleId,
    );
    if (!guard.ok) {
      const { error, status } = toErrorEnvelope('CONFLICT', guard.reason, 409);
      res.status(status).json({ error });
      return;
    }
    patch.permissions = input.permissions as string[];
  }
  if (Object.keys(patch).length === 0) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  const { error: writeError } = await supabase.from('Role').update(patch).eq('id', role.id);
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const next = { ...toRecord(role), ...patch };
  const modules = STAFF_MODULE_LABEL as Record<string, string>;
  await appendAudit(supabase, {
    action: 'ROLE_PERMISSIONS_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'super_admin',
    targetType: 'Role',
    targetId: next.id,
    targetName: next.name,
    detail:
      patch.permissions !== undefined
        ? `Updated permissions for role ${next.name}: ${patch.permissions.map((m) => modules[m] ?? m).join(', ')}`
        : `Renamed role to ${next.name}`,
  });
  const parsed = roleRecordSchema.safeParse(next);
  res.status(200).json(parsed.success ? parsed.data : next);
}
