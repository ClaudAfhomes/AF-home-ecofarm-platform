import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database, RoleSlug } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type AuthState = { session: Session | null; profile: Profile | null; role: RoleSlug | null; permissions: Set<string>; loading: boolean; error: string | null; retry: () => void; signOut: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleSlug | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let hydrationId = 0;
    const hydrate = async (next: Session | null) => {
      const currentHydration = ++hydrationId;
      setLoading(true);
      setError(null);
      setSession(next);
      if (!next) { setProfile(null); setRole(null); setPermissions([]); setLoading(false); return; }
      try {
        const [profileResult, permissionResult] = await Promise.all([
          supabase.from('profiles').select('*, roles!inner(slug)').eq('id', next.user.id).maybeSingle(),
          supabase.rpc('current_permissions'),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (permissionResult.error) throw permissionResult.error;
        if (!active || currentHydration !== hydrationId) return;
        const row = profileResult.data as (Profile & { roles: { slug: RoleSlug } }) | null;
        setProfile(row);
        setRole(row?.roles.slug ?? null);
        setPermissions(permissionResult.data ?? []);
      } catch (cause) {
        if (!active || currentHydration !== hydrationId) return;
        console.error('[auth] secure profile hydration failed', {
          userId: next.user.id,
          error: cause instanceof Error ? cause.message : String(cause),
        });
        setProfile(null);
        setRole(null);
        setPermissions([]);
        setError('We could not verify your access. Check your connection and try again.');
      } finally {
        if (active && currentHydration === hydrationId) setLoading(false);
      }
    };
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        console.error('[auth] session restore failed', { error: sessionError.message });
        if (active) {
          setError('We could not restore your session. Please try again.');
          setLoading(false);
        }
        return;
      }
      void hydrate(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Supabase holds its auth lock while this callback runs. Defer all client
      // calls so profile and permission requests cannot wait on that same lock.
      window.setTimeout(() => {
        if (active) void hydrate(next);
      }, 0);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [attempt]);

  const value = useMemo(() => ({ session, profile, role, permissions: new Set(permissions), loading, error, retry: () => setAttempt((value) => value + 1), signOut: async () => {
    if (session) await supabase.rpc('record_auth_event', { p_event: 'logout' });
    await supabase.auth.signOut();
  } }), [session, profile, role, permissions, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Auth hooks intentionally share their provider module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
