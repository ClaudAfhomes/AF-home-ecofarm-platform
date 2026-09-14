import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { MemberStatus, Role, StaffModule } from '@jad/contracts';
import { MockSessionProvider, setMockSessionUser, useMockSession } from '@jad/mock';

import { staffSessionSchema } from '@jad/contracts';

import { env } from './env';
import { getSupabaseClient, isSupabaseConfigured, tryRefreshSession } from './supabase';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /**
   * Admin-shell role id (exactly one role per staff user; system id or
   * custom role id). Present for mock staff principals; the real backend
   * resolves it server-side later, so it stays optional here. `RequireRole`
   * enforces module checks only when set.
   */
  roleId?: string | null;
  /**
   * Server-resolved role display name and effective permission modules
   * (from `GET /admin/session`). Preferred over re-deriving from the
   * role catalog, which non-super-admin staff cannot read. Absent for
   * mock/dev-test sessions — renderers fall back to role records, then
   * system labels / the raw role id.
   */
  roleName?: string;
  roleModules?: StaffModule[];
  isQualified?: boolean;
  status?: MemberStatus;
  /** True while the account runs on a temporary password (forced change). */
  mustChangePassword?: boolean;
}

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  role: Role | null;
  roleId: string | null | undefined;
  isQualified: boolean;
  /**
   * True when the last role resolution failed transiently (expired token,
   * network, unparsable response) as opposed to a verified non-staff
   * identity. Guards render a Retry affordance instead of a dead-end
   * Forbidden while this is set.
   */
  sessionError: boolean;
  /** True while the account runs on a temporary password (forced change). */
  mustChangePassword: boolean;
  /** Re-run session resolution (used by the Retry affordance). */
  revalidate: () => Promise<void>;
  loginAs: (user: SessionUser) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

function UnauthenticatedSessionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SessionContextValue>(
    () => ({
      status: 'unauthenticated',
      user: null,
      role: null,
      roleId: undefined,
      isQualified: false,
      sessionError: false,
      mustChangePassword: false,
      revalidate: async () => {},
      loginAs: () => {},
      logout: () => {},
    }),
    [],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function MockSessionBridge({ children }: { children: ReactNode }) {
  const mock = useMockSession();
  const value = useMemo<SessionContextValue>(
    () => ({
      status: mock.status,
      user: mock.user,
      role: mock.role,
      roleId: mock.roleId ?? null,
      isQualified: mock.isQualified,
      sessionError: false,
      mustChangePassword: mock.user?.mustChangePassword ?? false,
      revalidate: async () => {},
      loginAs: (user) => mock.loginAs(user),
      logout: mock.logout,
    }),
    [mock],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionError, setSessionError] = useState(false);
  // Last verified session — restored on transient resolution failures so a
  // stale-token race (idle tab return) never demotes staff to non-staff.
  const lastGoodUser = useRef<SessionUser | null>(null);
  const revalidateRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const client = getSupabaseClient() as unknown as {
      auth: {
        getSession: () => Promise<{
          data: {
            session: {
              access_token?: string;
              user: { id: string; email: string; user_metadata: Record<string, unknown> };
            } | null;
          };
        }>;
        onAuthStateChange: (
          cb: (
            e: string,
            s: {
              user: { id: string; email: string; user_metadata: Record<string, unknown> } | null;
            },
          ) => void,
        ) => { data: { subscription: { unsubscribe: () => void } } };
        signOut: () => Promise<void>;
      };
      from: (t: string) => { select: (...args: unknown[]) => unknown };
    } | null;
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unauthenticated');
      setMockSessionUser(null);
      return;
    }

    /**
     * Own staff session via the service-role endpoint (Phase 6 — the admin
     * client never reads Role tables with the anon key). Discriminates a
     * verified answer (200, or 403/404 = verified non-staff) from transient
     * failures (401 expired token, 5xx, network, unparsable body) so callers
     * never confuse "could not verify" with "not staff" — that confusion is
     * what stranded idle-returning admins on Access denied. Explicit Bearer
     * (not cookies) so it works in every storage mode.
     */
    const fetchSlugs = async (
      accessToken: string | undefined,
    ): Promise<{
      status: number;
      slugs: string[];
      mustChangePassword: boolean;
      roleId?: string;
      roleName?: string;
      modules?: StaffModule[];
    } | null> => {
      if (!accessToken) return null;
      try {
        const res = await fetch(`${env.VITE_API_BASE_URL}/admin/session`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
          credentials: 'same-origin',
        });
        if (!res.ok) {
          // Verified non-staff identity — safe to demote.
          if (res.status === 403 || res.status === 404)
            return { status: res.status, slugs: [], mustChangePassword: false };
          // 401/5xx → transient (stale token, backend hiccup).
          return null;
        }
        const parsed = staffSessionSchema.safeParse(await res.json().catch(() => null));
        if (!parsed.success) return null;
        // Verbose-level only: lets an operator confirm the server resolved
        // the staff role (roleId/roleName/modules) vs a slugs-only answer.
        console.debug('[SupabaseSessionProvider] staff session resolved', {
          roleId: parsed.data.roleId ?? null,
          roleName: parsed.data.roleName ?? null,
          modules: parsed.data.modules ?? null,
        });
        return {
          status: 200,
          slugs: [...parsed.data.slugs],
          mustChangePassword: parsed.data.mustChangePassword === true,
          roleId: parsed.data.roleId,
          roleName: parsed.data.roleName,
          modules: parsed.data.modules ? [...parsed.data.modules] : undefined,
        };
      } catch {
        return null;
      }
    };

    const resolveRoleSlugs = async (
      accessToken?: string,
    ): Promise<{
      slugs: string[];
      verified: boolean;
      mustChangePassword: boolean;
      roleId?: string;
      roleName?: string;
      modules?: StaffModule[];
    }> => {
      // Prefer the caller-supplied token (the auth event's own session);
      // fall back to a fresh getSession read when absent.
      let token = accessToken;
      if (token === undefined) {
        const { data } = await client.auth.getSession();
        token = data.session?.access_token;
      }
      const first = await fetchSlugs(token);
      if (first)
        return {
          slugs: first.slugs,
          verified: true,
          mustChangePassword: first.mustChangePassword,
          roleId: first.roleId,
          roleName: first.roleName,
          modules: first.modules,
        };
      // Transient failure: one token rotation, then a single retry with the
      // fresh token before giving up.
      try {
        const healed = await tryRefreshSession();
        if (healed) {
          const { data: fresh } = await client.auth.getSession();
          const second = await fetchSlugs(fresh.session?.access_token);
          if (second)
            return {
              slugs: second.slugs,
              verified: true,
              mustChangePassword: second.mustChangePassword,
              roleId: second.roleId,
              roleName: second.roleName,
              modules: second.modules,
            };
        }
      } catch {
        // fall through to unverified
      }
      return { slugs: [], verified: false, mustChangePassword: false };
    };

    /**
     * Direct slug → shell role id. Priority: super_admin, admin, finance,
     * merchant, then the first custom (non-member) slug. A stale `admin` row
     * left beside `super_admin` stays harmless. Member/user slugs resolve to
     * null (no staff access).
     */
    const slugToRoleId = (slugs: string[]): string | null => {
      const normalized = slugs.map((s) =>
        String(s ?? '')
          .trim()
          .toLowerCase()
          .replace(/[-_\s]/g, '_'),
      );
      const compact = normalized.map((s) => s.replace(/_/g, ''));
      if (normalized.includes('super_admin') || compact.includes('superadmin'))
        return 'super_admin';
      if (normalized.includes('admin')) return 'admin';
      if (normalized.includes('finance')) return 'finance';
      if (normalized.includes('merchant')) return 'merchant';
      const custom = slugs.find((s) => {
        const c = String(s ?? '')
          .trim()
          .toLowerCase();
        return (
          c !== '' &&
          !['member_basic', 'member_qualified', 'member', 'user'].includes(
            c.replace(/[-_\s]/g, '_'),
          )
        );
      });
      return custom ?? null;
    };

    const buildSessionUser = async (
      supaUser: { id: string; email: string; user_metadata: Record<string, unknown> },
      accessToken?: string,
    ): Promise<{ user: SessionUser; verified: boolean }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supaAny = client as any;
      let member: {
        firstName: string;
        lastName: string;
        isQualified: boolean;
        status: string;
      } | null = null;
      try {
        // maybeSingle on the real quoted "Member" table: 0 rows
        // (staff-only identity, no Member row by design) resolves null
        // instead of throwing PGRST116 like .single() did. No legacy
        // "members" fallback: that table does not exist in the schema, so
        // probing it can only ever produce PGRST205 noise.
        const r = (await supaAny
          .from('Member')
          .select('*')
          .eq('id', supaUser.id)
          .maybeSingle()) as {
          data: Record<string, unknown> | null;
          error: unknown;
        };
        if (!r.error && r.data) {
          const d = r.data as Record<string, unknown>;
          // Handle both new "name" and legacy "firstName"/"lastName"
          const name = (d['name'] as string) ?? '';
          const firstName = (d['firstName'] as string) ?? name.split(' ')[0] ?? '';
          const lastName = (d['lastName'] as string) ?? name.split(' ').slice(1).join(' ') ?? '';
          const isQualified =
            (d['isQualified'] as boolean) ?? (d['is_qualified'] as boolean) ?? false;
          const status = (d['status'] as string) ?? 'PENDING';
          member = { firstName, lastName, isQualified, status };
        }
      } catch {
        member = null;
      }
      const {
        slugs,
        verified,
        mustChangePassword,
        roleId: serverRoleId,
        roleName: serverRoleName,
        modules: serverModules,
      } = await resolveRoleSlugs(accessToken);
      // A holder of any staff role id (system or custom) is staff at the
      // top-level gate (`admin`); per-module checks via roleId refine from
      // there, and the server enforces every request. Without this, staff
      // whose slugs don't normalize to admin (finance, merchant, custom
      // roles) would resolve `user` and hit an empty nav + Forbidden
      // everywhere, since every admin destination requires `admin`.
      // Member-only slugs or a missing assignment stay member-tier.
      const staffRoleId = serverRoleId ?? slugToRoleId(slugs);
      let role: Role | null =
        staffRoleId !== null ? 'admin' : slugs.length === 0 ? null : 'user';
      if (role === null) {
        // No staff assignment: member-tier session. user_metadata is
        // client-writable and must never confer privilege.
        role = 'user';
      }
      return {
        user: {
          id: supaUser.id,
          name:
            member?.firstName && member?.lastName
              ? `${member.firstName} ${member.lastName}`
              : ((supaUser.user_metadata['full_name'] as string) ?? supaUser.email ?? ''),
          email: supaUser.email ?? '',
          role,
          // Server-resolved role identity wins (the caller may not read
          // the role catalog); the slug derivation stays as the mock/
          // legacy fallback when the endpoint lacks the new fields.
          roleId: serverRoleId ?? slugToRoleId(slugs),
          roleName: serverRoleName,
          roleModules: serverModules,
          isQualified: (member?.isQualified as boolean) ?? false,
          status: (member?.status as MemberStatus) ?? 'PENDING',
          mustChangePassword,
        },
        verified,
      };
    };

    /**
     * Apply a resolved session. A null user is always a real sign-out.
     * An unverified resolution never demotes: the last verified session is
     * kept (idle-return race) so RequireRole keeps rendering instead of
     * flipping to Access denied; the error flag surfaces a Retry affordance.
     */
    const applySessionUser = (next: SessionUser | null, verified: boolean) => {
      if (!next) {
        lastGoodUser.current = null;
        setUser(null);
        setStatus('unauthenticated');
        setSessionError(false);
        setMockSessionUser(null);
        return;
      }
      if (verified) {
        lastGoodUser.current = next;
        setUser(next);
        setStatus('authenticated');
        setSessionError(false);
        setMockSessionUser(next as unknown as import('@jad/mock').MockUser);
        return;
      }
      const preserved = lastGoodUser.current ?? next;
      setUser(preserved);
      setStatus('authenticated');
      setSessionError(true);
      setMockSessionUser(preserved as unknown as import('@jad/mock').MockUser);
    };

    const revalidate = async () => {
      const { data } = await client.auth.getSession();
      const supaUser = data.session?.user ?? null;
      if (!supaUser) {
        applySessionUser(null, true);
        return;
      }
      const { user: next, verified } = await buildSessionUser(supaUser, data.session?.access_token);
      applySessionUser(next, verified);
    };
    revalidateRef.current = revalidate;

    revalidate().catch(() => {
      // getSession itself failed — stay loading rather than guessing.
    });
    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      const typed = session as {
        access_token?: string;
        user: { id: string; email: string; user_metadata: Record<string, unknown> } | null;
      } | null;
      const supaUser = typed?.user ?? null;
      if (!supaUser) {
        applySessionUser(null, true);
        return;
      }
      const { user: next, verified } = await buildSessionUser(supaUser, typed?.access_token);
      applySessionUser(next, verified);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loginAs = (next: SessionUser) => {
    setUser(next);
    setStatus('authenticated');
    setMockSessionUser(next as unknown as import('@jad/mock').MockUser);
  };
  const logout = async () => {
    const client = getSupabaseClient() as { auth: { signOut: () => Promise<void> } } | null;
    if (client) await client.auth.signOut();
    lastGoodUser.current = null;
    setUser(null);
    setStatus('unauthenticated');
    setSessionError(false);
    setMockSessionUser(null);
  };
  const revalidate = useCallback(() => revalidateRef.current(), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      // roleId comes from the server-resolved staff slugs (null = verified
      // non-staff, in which case module checks fall back to the legacy
      // session-role gate).
      roleId: user?.roleId ?? null,
      isQualified: user?.isQualified ?? false,
      sessionError,
      mustChangePassword: user?.mustChangePassword ?? false,
      revalidate,
      loginAs,
      logout,
    }),
    [status, user, sessionError, revalidate],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export interface SessionProviderProps {
  initialUser?: SessionUser | null;
  restoreDelayMs?: number;
  /** Test-only: simulate a role-resolution error (Retry affordance). */
  sessionError?: boolean;
  /** Test-only: observe Retry invocations. */
  onRevalidate?: () => void | Promise<void>;
  children: ReactNode;
}

function TestSessionProvider({
  initialUser,
  sessionError = false,
  onRevalidate,
  children,
}: {
  initialUser?: SessionUser | null;
  sessionError?: boolean;
  onRevalidate?: () => void | Promise<void>;
  children: ReactNode;
}) {
  const value = useMemo<SessionContextValue>(() => {
    if (initialUser) {
      return {
        status: 'authenticated' as const,
        user: initialUser,
        role: initialUser.role,
        // Preserve null (resolved: no staff access) distinctly from undefined
        // (unresolved) — navItemsForRole treats them differently.
        roleId: initialUser.roleId,
        isQualified: initialUser.isQualified ?? false,
        sessionError,
        mustChangePassword: initialUser.mustChangePassword ?? false,
        revalidate: async () => {
          await onRevalidate?.();
        },
        loginAs: () => {},
        logout: () => {},
      };
    }
    return {
      status: 'unauthenticated' as const,
      user: null,
      role: null,
      roleId: undefined,
      isQualified: false,
      sessionError: false,
      mustChangePassword: false,
      revalidate: async () => {},
      loginAs: () => {},
      logout: () => {},
    };
  }, [initialUser, sessionError, onRevalidate]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({
  initialUser,
  restoreDelayMs,
  sessionError,
  onRevalidate,
  children,
}: SessionProviderProps) {
  if (initialUser !== undefined) {
    return (
      <TestSessionProvider
        initialUser={initialUser}
        sessionError={sessionError}
        onRevalidate={onRevalidate}
      >
        {children}
      </TestSessionProvider>
    );
  }
  // Vitest: keep mock path to avoid real Supabase network in tests.
  if ((import.meta.env as Record<string, string | undefined>).MODE === 'test') {
    return (
      <MockSessionProvider initialUser={initialUser} restoreDelayMs={restoreDelayMs}>
        <MockSessionBridge>{children}</MockSessionBridge>
      </MockSessionProvider>
    );
  }
  // Supabase SSOT when configured — fixes cross-origin 5173 vs 5174 via cookie storage
  if (isSupabaseConfigured()) {
    return <SupabaseSessionProvider>{children}</SupabaseSessionProvider>;
  }
  if (import.meta.env.DEV) {
    return (
      <MockSessionProvider initialUser={initialUser} restoreDelayMs={restoreDelayMs}>
        <MockSessionBridge>{children}</MockSessionBridge>
      </MockSessionProvider>
    );
  }
  return <UnauthenticatedSessionProvider>{children}</UnauthenticatedSessionProvider>;
}
