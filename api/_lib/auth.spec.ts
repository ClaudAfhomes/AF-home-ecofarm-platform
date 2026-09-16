import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalSlug,
  extractBearerToken,
  findAuthUserId,
  isAuthConflict,
  slugsAllowed,
  verifyStaff,
  verifyStaffModule,
  verifyUser,
} from './auth.js';
import type { VercelRequest } from './http.js';

function req(headers: Record<string, string> = {}): VercelRequest {
  return { method: 'GET', query: {}, headers };
}

const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else vi.stubEnv(key, values[key]);
  }
}

describe('canonicalSlug', () => {
  it('normalizes case and separators', () => {
    expect(canonicalSlug('Super-Admin')).toBe('super_admin');
    expect(canonicalSlug(' SUPER ADMIN ')).toBe('super_admin');
    expect(canonicalSlug('admin')).toBe('admin');
    expect(canonicalSlug(null)).toBe('');
  });
});

describe('slugsAllowed', () => {
  it('matches case- and separator-insensitively', () => {
    expect(slugsAllowed(['Super-Admin'], ['super_admin'])).toBe(true);
    expect(slugsAllowed(['ADMIN'], ['admin'])).toBe(true);
  });

  it('accepts compact superadmin against super_admin', () => {
    expect(slugsAllowed(['superadmin'], ['super_admin'])).toBe(true);
  });

  it('denies non-listed and empty slugs', () => {
    expect(slugsAllowed(['user'], ['super_admin', 'admin'])).toBe(false);
    expect(slugsAllowed([], ['super_admin', 'admin'])).toBe(false);
    expect(slugsAllowed(['finance'], ['super_admin', 'admin'])).toBe(false);
  });
});

describe('extractBearerToken', () => {
  it('prefers the Authorization bearer token', () => {
    expect(extractBearerToken(req({ authorization: 'Bearer abc123' }))).toBe('abc123');
  });

  it('parses the Supabase JSON auth cookie', () => {
    const cookie = `sb-ref-auth-token=${encodeURIComponent(JSON.stringify({ access_token: 'tok-1' }))}`;
    expect(extractBearerToken(req({ cookie }))).toBe('tok-1');
  });

  it('parses the array-form auth cookie', () => {
    const cookie = `sb-ref-auth-token=${encodeURIComponent(JSON.stringify([{ access_token: 'tok-2' }]))}`;
    expect(extractBearerToken(req({ cookie }))).toBe('tok-2');
  });

  it('falls back to a raw cookie string', () => {
    expect(extractBearerToken(req({ cookie: 'sb-ref-auth-token=raw-token' }))).toBe('raw-token');
  });

  it('returns undefined when no credential is present', () => {
    expect(extractBearerToken(req({}))).toBeUndefined();
    expect(extractBearerToken(req({ authorization: 'Basic xyz' }))).toBeUndefined();
  });
});

describe('verifyUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 when Supabase is not configured', async () => {
    setEnv({});
    const result = await verifyUser(req({ authorization: 'Bearer x' }));
    expect('error' in result && result.error.status).toBe(500);
  });

  it('returns 401 when the token is missing or invalid', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    expect('error' in (await verifyUser(req({}))) && true).toBe(true);
    const bad = await verifyUser(req({ authorization: 'Bearer bad' }), {
      auth: { getUser: async () => ({ data: { user: null }, error: new Error('bad') }) },
    });
    expect('error' in bad && bad.error.status).toBe(401);
  });

  it('returns the auth user id without any role check', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    const result = await verifyUser(req({ authorization: 'Bearer good' }), {
      auth: { getUser: async () => ({ data: { user: { id: 'mem-1' } }, error: null }) },
    });
    expect(result).toEqual({ userId: 'mem-1' });
  });
});

describe('verifyStaff', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 when Supabase is not configured', async () => {
    setEnv({});
    const result = await verifyStaff(req({ authorization: 'Bearer x' }), ['admin']);
    expect('error' in result && result.error.status).toBe(500);
  });

  it('returns 401 when the token is missing', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    const result = await verifyStaff(req({}), ['admin']);
    expect('error' in result && result.error.status).toBe(401);
  });

  it('returns 401 for an invalid session', async () => {
    setEnv({ SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    const result = await verifyStaff(req({ authorization: 'Bearer bad' }), ['admin'], {
      anonClient: {
        auth: { getUser: async () => ({ data: { user: null }, error: new Error('bad') }) },
      },
    });
    expect('error' in result && result.error.status).toBe(401);
  });

  it('allows a listed staff slug and returns user plus slugs', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaff(
      req({ authorization: 'Bearer good' }),
      ['super_admin', 'admin'],
      {
        anonClient: {
          auth: {
            getUser: async () => ({
              data: { user: { id: 'u-1', user_metadata: {} } },
              error: null,
            }),
          },
        },
        serviceClient: {
          from: () => ({
            select: () => ({
              eq: async () => ({ data: [{ roleId: 'r-1' }], error: null }),
              in: async () => ({ data: [{ slug: 'super_admin' }], error: null }),
            }),
          }),
        },
      },
    );
    expect(result).toEqual({ userId: 'u-1', slugs: ['super_admin'] });
  });

  it('returns 403 for an unlisted role', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaff(
      req({ authorization: 'Bearer good' }),
      ['super_admin', 'admin'],
      {
        anonClient: {
          auth: {
            getUser: async () => ({
              data: { user: { id: 'u-2', user_metadata: {} } },
              error: null,
            }),
          },
        },
        serviceClient: {
          from: () => ({
            select: () => ({
              eq: async () => ({ data: [{ roleId: 'r-9' }], error: null }),
              in: async () => ({ data: [{ slug: 'user' }], error: null }),
            }),
          }),
        },
      },
    );
    expect('error' in result && result.error.status).toBe(403);
  });

  it('resolves staff slugs from StaffAssignment links', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const seen: string[] = [];
    const result = await verifyStaff(
      req({ authorization: 'Bearer good' }),
      ['super_admin', 'admin', 'finance'],
      {
        anonClient: {
          auth: {
            getUser: async () => ({
              data: { user: { id: 'u-5', user_metadata: {} } },
              error: null,
            }),
          },
        },
        serviceClient: {
          from: (table: string) => ({
            select: () => ({
              eq: async () => {
                seen.push(`${table}:eq`);
                if (table === 'StaffAssignment')
                  return { data: [{ roleId: 'r-new' }], error: null };
                return { data: [], error: null };
              },
              in: async () => {
                seen.push(`${table}:in`);
                if (table === 'Role') return { data: [{ slug: 'finance' }], error: null };
                return { data: [], error: null };
              },
            }),
          }),
        },
      },
    );
    expect(seen).toContain('StaffAssignment:eq');
    expect(result).toEqual({ userId: 'u-5', slugs: ['finance'] });
  });

  it('ignores legacy MemberRole links (staff domain only)', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const seen: string[] = [];
    const result = await verifyStaff(
      req({ authorization: 'Bearer good' }),
      ['super_admin', 'admin'],
      {
        anonClient: {
          auth: {
            getUser: async () => ({
              data: { user: { id: 'u-6', user_metadata: {} } },
              error: null,
            }),
          },
        },
        serviceClient: {
          from: (table: string) => ({
            select: () => ({
              eq: async () => {
                seen.push(`${table}:eq`);
                if (table === 'StaffAssignment') return { data: [], error: null };
                if (table === 'MemberRole') return { data: [{ roleId: 'r-old' }], error: null };
                return { data: [], error: null };
              },
              in: async () => {
                if (table === 'Role') return { data: [{ slug: 'admin' }], error: null };
                return { data: [], error: null };
              },
            }),
          }),
        },
      },
    );
    expect(seen.some((s) => s.startsWith('MemberRole'))).toBe(false);
    expect('error' in result && result.error.status).toBe(403);
  });

  it('denies unlinked callers even when metadata claims admin (no metadata fallback)', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const empty = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
          in: async () => ({ data: [], error: null }),
        }),
      }),
    };
    const meta = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'u-3', user_metadata: { role: 'admin' } } },
          error: null,
        }),
      },
    };
    const spoofed = await verifyStaff(req({ authorization: 'Bearer good' }), ['admin'], {
      anonClient: meta,
      serviceClient: empty,
    });
    expect('error' in spoofed && spoofed.error.status).toBe(403);

    const denied = await verifyStaff(req({ authorization: 'Bearer good' }), ['admin'], {
      anonClient: {
        auth: {
          getUser: async () => ({ data: { user: { id: 'u-4', user_metadata: {} } }, error: null }),
        },
      },
      serviceClient: empty,
    });
    expect('error' in denied && denied.error.status).toBe(403);
  });

  it('returns 403 when the staff account must change its temporary password', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaff(req({ authorization: 'Bearer good' }), ['super_admin'], {
      anonClient: {
        auth: {
          getUser: async () => ({
            data: { user: { id: 'u-7', user_metadata: {} } },
            error: null,
          }),
        },
      },
      serviceClient: {
        from: (table: string) => ({
          select: () => ({
            eq: async () => {
              if (table === 'StaffUser')
                return {
                  data: [{ id: 'u-7', status: 'ACTIVE', mustChangePassword: true }],
                  error: null,
                };
              if (table === 'StaffAssignment') return { data: [{ roleId: 'r-1' }], error: null };
              return { data: [], error: null };
            },
            in: async () => {
              if (table === 'Role') return { data: [{ slug: 'super_admin' }], error: null };
              return { data: [], error: null };
            },
          }),
        }),
      },
    });
    expect('error' in result && result.error.status).toBe(403);
    expect('error' in result && (result.error.error as { message?: string }).message).toMatch(
      /password/i,
    );
  });

  it('returns 403 when the staff account is disabled', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaff(req({ authorization: 'Bearer good' }), ['super_admin'], {
      anonClient: {
        auth: {
          getUser: async () => ({
            data: { user: { id: 'u-8', user_metadata: {} } },
            error: null,
          }),
        },
      },
      serviceClient: {
        from: (table: string) => ({
          select: () => ({
            eq: async () => {
              if (table === 'StaffUser')
                return {
                  data: [{ id: 'u-8', status: 'DISABLED', mustChangePassword: false }],
                  error: null,
                };
              if (table === 'StaffAssignment') return { data: [{ roleId: 'r-1' }], error: null };
              return { data: [], error: null };
            },
            in: async () => {
              if (table === 'Role') return { data: [{ slug: 'super_admin' }], error: null };
              return { data: [], error: null };
            },
          }),
        }),
      },
    });
    expect('error' in result && result.error.status).toBe(403);
    expect('error' in result && (result.error.error as { message?: string }).message).toMatch(
      /disabled/i,
    );
  });
});

describe('isAuthConflict', () => {
  it('recognizes the real GoTrue duplicate wording', () => {
    expect(
      isAuthConflict(new Error('A user with this email address has already been registered')),
    ).toBe(true);
    expect(
      isAuthConflict(new Error('A user with this phone number has already been registered')),
    ).toBe(true);
  });

  it('recognizes legacy wording and error codes', () => {
    expect(isAuthConflict(new Error('already exists'))).toBe(true);
    expect(isAuthConflict({ message: 'duplicate key value', status: 409 })).toBe(true);
    expect(isAuthConflict({ message: 'x', code: 'email_exists' })).toBe(true);
    expect(isAuthConflict({ message: 'x', code: 'phone_exists' })).toBe(true);
  });

  it('rejects unrelated failures and non-errors', () => {
    expect(isAuthConflict(new Error('Database error saving new user'))).toBe(false);
    expect(isAuthConflict(new Error('Password should be stronger'))).toBe(false);
    expect(isAuthConflict(null)).toBe(false);
    expect(isAuthConflict('already exists')).toBe(false);
  });
});

describe('findAuthUserId', () => {
  const svcFor = (users: unknown[]) => ({
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
      },
    },
  });

  it('matches an existing auth user by exact email', async () => {
    const id = await findAuthUserId(
      svcFor([{ id: 'u-1', email: 'juan@example.com', phone: '+639171234567' }]),
      { email: 'juan@example.com' },
    );
    expect(id).toBe('u-1');
  });

  it('adopts case-variant emails (GoTrue stores lowercase, approval rows may not)', async () => {
    const id = await findAuthUserId(svcFor([{ id: 'u-1', email: 'juan.delacruz@example.com' }]), {
      email: 'Juan.DelaCruz@Example.COM',
    });
    expect(id).toBe('u-1');
  });

  it('falls back to identity emails when the user email differs', async () => {
    const id = await findAuthUserId(
      svcFor([
        {
          id: 'u-2',
          email: 'primary@example.com',
          identities: [{ identity_data: { email: 'juan@example.com' } }],
        },
      ]),
      { email: 'juan@example.com' },
    );
    expect(id).toBe('u-2');
  });

  it('matches phones despite formatting differences', async () => {
    const id = await findAuthUserId(svcFor([{ id: 'u-3', email: null, phone: '+639171234567' }]), {
      phone: '0917 123 4567',
    });
    expect(id).toBe('u-3');
  });

  it('returns null when nothing matches', async () => {
    const id = await findAuthUserId(svcFor([{ id: 'u-1', email: 'a@b.com' }]), {
      email: 'missing@example.com',
    });
    expect(id).toBeNull();
  });
});

describe('verifyStaffModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const authed = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u-9', user_metadata: {} } }, error: null }),
    },
  };

  /** Service fake for a custom-role staffer (role rows + assignment links). */
  const customService = (permissions: string[]) => {
    const roleRows = [
      {
        id: 'x-1',
        key: 'role-admin-support',
        slug: 'role-admin-support',
        name: 'Admin Support',
        permissions,
        is_system: false,
      },
    ];
    const roleBuilder = () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = async () => ({ data: roleRows, error: null });
      b.in = async () => ({ data: [{ slug: 'role-admin-support' }], error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: roleRows, error: null });
      return b;
    };
    return {
      from: (table: string) => {
        if (table === 'Role') return roleBuilder();
        return {
          select: () => ({
            eq: async () => {
              if (table === 'StaffAssignment') return { data: [{ roleId: 'x-1' }], error: null };
              if (table === 'StaffUser')
                return {
                  data: { status: 'ACTIVE', mustChangePassword: false },
                  error: null,
                };
              return { data: [], error: null };
            },
            in: async () => ({ data: [], error: null }),
          }),
        };
      },
    };
  };

  const systemService = (slug: string) => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => {
          if (table === 'StaffAssignment') return { data: [{ roleId: 'r-1' }], error: null };
          if (table === 'StaffUser')
            return { data: { status: 'ACTIVE', mustChangePassword: false }, error: null };
          return { data: [], error: null };
        },
        in: async () =>
          table === 'Role' ? { data: [{ slug }], error: null } : { data: [], error: null },
      }),
    }),
  });

  it('keeps system-slug access identical to verifyStaff (finance on vouchers)', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaffModule(
      req({ authorization: 'Bearer good' }),
      'vouchers',
      ['super_admin', 'admin', 'finance'],
      { anonClient: authed, serviceClient: systemService('finance') },
    );
    expect(result).toEqual({ userId: 'u-9', slugs: ['finance'] });
  });

  it('authorizes a custom role holding the required module', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaffModule(
      req({ authorization: 'Bearer good' }),
      'members',
      ['super_admin', 'admin'],
      { anonClient: authed, serviceClient: customService(['dashboard', 'members']) },
    );
    expect(result).toEqual({ userId: 'u-9', slugs: ['role-admin-support'] });
  });

  it('denies a custom role missing the required module', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaffModule(
      req({ authorization: 'Bearer good' }),
      'sales',
      ['super_admin', 'admin'],
      { anonClient: authed, serviceClient: customService(['dashboard', 'members']) },
    );
    expect('error' in result && result.error.status).toBe(403);
    expect('error' in result && result.error.error.message).toBe('Insufficient role');
  });

  it('denies member-tier slugs through the custom path as well', async () => {
    setEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    const result = await verifyStaffModule(
      req({ authorization: 'Bearer good' }),
      'members',
      ['super_admin', 'admin'],
      { anonClient: authed, serviceClient: systemService('user') },
    );
    expect('error' in result && result.error.status).toBe(403);
  });
});
