import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database, RoleSlug } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type AuthState = { session: Session | null; profile: Profile | null; role: RoleSlug | null; permissions: Set<string>; loading: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleSlug | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hydrate = async (next: Session | null) => {
      setSession(next);
      if (!next) { setProfile(null); setRole(null); setPermissions([]); setLoading(false); return; }
      const [{ data: profileData }, { data: permissionData }] = await Promise.all([
        supabase.from('profiles').select('*, roles!inner(slug)').eq('id', next.user.id).maybeSingle(),
        supabase.rpc('current_permissions'),
      ]);
      const row = profileData as (Profile & { roles: { slug: RoleSlug } }) | null;
      setProfile(row);
      setRole(row?.roles.slug ?? null);
      setPermissions(permissionData ?? []);
      setLoading(false);
    };
    void supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => void hydrate(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(() => ({ session, profile, role, permissions: new Set(permissions), loading, signOut: async () => {
    if (session) await supabase.rpc('record_auth_event', { p_event: 'logout' });
    await supabase.auth.signOut();
  } }), [session, profile, role, permissions, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Auth hooks intentionally share their provider module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
