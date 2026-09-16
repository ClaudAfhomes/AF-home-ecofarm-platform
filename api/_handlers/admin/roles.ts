import { CUSTOM_ROLE_FORBIDDEN_MODULES, roleRecordSchema, staffModuleSchema } from '@jad/contracts';

import { SUPER_ADMIN_ONLY } from '../../_lib/access.js';
import { verifyStaff } from '../../_lib/auth.js';
import { effectivePermissions } from '../../_lib/rbac.js';
import { appendAudit } from '../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `role-${slug}` : 'role-custom';
}

function mapRow(row: Record<string, unknown>) {
  const key = typeof row.key === 'string' && row.key ? row.key : undefined;
  const slug = typeof row.slug === 'string' ? row.slug : undefined;
  return {
    id: key ?? slug,
    name: row.name,
    permissions: effectivePermissions(slug ?? key ?? '', row.permissions),
    isSystem: row.is_system === true,
    domain: row.domain === 'member' ? 'member' : 'staff',
  };
}

/** GET /admin/roles — full record list. POST — create custom role + audit. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaff(req, [...SUPER_ADMIN_ONLY]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('Role')
      .select('key,slug,name,permissions,is_system,domain')
      .order('name');
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapRow);
    okList(
      res,
      rows.filter((row) => roleRecordSchema.safeParse(row).success),
    );
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 60) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Role name must be 1–60 characters.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const permissions = Array.isArray(input.permissions) ? input.permissions : [];
  const validModules = staffModuleSchema.options as readonly string[];
  if (
    permissions.length === 0 ||
    !permissions.every((p) => typeof p === 'string' && validModules.includes(p))
  ) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'At least one valid module permission is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  // New roles are always custom: governance modules stay super_admin-only
  // on the server, so granting them would only produce navigation that
  // 403s. Reject them here (the role editor disables them too).
  const forbidden = (permissions as string[]).filter((p) =>
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
  const { data: siblings } = await supabase.from('Role').select('name');
  const taken =
    Array.isArray(siblings) &&
    (siblings as { name?: string }[]).some(
      (r) => typeof r.name === 'string' && r.name.trim().toLowerCase() === name.toLowerCase(),
    );
  if (taken) {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'A role with this name already exists.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  let key = slugify(name);
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? key : `${key}-${attempt + 1}`;
    const { data: clash } = await supabase.from('Role').select('id').eq('key', candidate).limit(1);
    if (!Array.isArray(clash) || clash.length === 0) {
      key = candidate;
      break;
    }
  }
  const { data: created, error } = await supabase
    .from('Role')
    .insert({ key, slug: key, name, permissions, is_system: false, domain: 'staff' })
    .select('key,slug,name,permissions,is_system,domain')
    .single();
  if (error || !created) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      error?.message ?? 'Create failed',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'ROLE_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'super_admin',
    targetType: 'Role',
    targetId: key,
    targetName: name,
    detail: `Created role ${name}`,
  });
  res.status(201).json(mapRow(created as Record<string, unknown>));
}
