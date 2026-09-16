import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useSession } from '../lib/session';
import { Button, Forbidden, Skeleton, Spinner } from '@jad/ui';

import {
  canAccess,
  canAccessModule,
  canAccessSubModule,
  findNavItem,
  findNavSubItem,
} from './navigation';
import { useRoles } from '../features/roles/hooks/useRoles';
import styles from './RequireRole.module.css';

export function getValidatedWebLoginUrl(): string {
  const raw =
    (import.meta.env as Record<string, string | undefined>).VITE_WEB_URL ?? 'http://localhost:5173';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid protocol');
    const base = url.toString().replace(/\/$/, '');
    return base.endsWith('/login') ? base : `${base}/login`;
  } catch {
    return 'http://localhost:5173/login';
  }
}

function RedirectToWebLogin() {
  useEffect(() => {
    window.location.href = getValidatedWebLoginUrl();
  }, []);
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
      <Spinner className={styles.loadingSpinner} />
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}

/**
 * Route guard. Authenticated staff with an entry in the nav registry render the
 * page; authenticated staff without access see Forbidden; unauthenticated
 * visitors also see Forbidden (the real backend enforces authorization -
 * FRONTEND-ARCHITECTURE; visibility is never authorization). Unknown paths pass
 * through so the NotFound route handles them.
 *
 * When the session carries a role-resolution error (transient /admin/session
 * failure, e.g. an expired token after idle), the denial offers Retry instead
 * of stranding the user - a refresh is no longer required to recover.
 */
export function RequireRole({ children }: { children: ReactNode }) {
  const { status, user, role, roleId, sessionError, revalidate, mustChangePassword } = useSession();
  // Server-resolved modules are authoritative for the signed-in staff member
  // (the role catalog is super_admin-only); they win over fetched records.
  const sessionModules = user?.roleModules;
  // During a forced password change the roles endpoint is blocked by design
  // (verifyStaff rejects mustChangePassword) and module RBAC is irrelevant -
  // the redirect below pins the user to My Account. Never wait on role
  // records in that state, or the page sits in the loading skeleton.
  // Unauthenticated sessions never fetch either (the flag is unknown).
  const { data: roles, isPending: rolesPending } = useRoles({
    enabled: status === 'authenticated' && !mustChangePassword,
  });
  const location = useLocation();

  if (status === 'loading') return <LoadingState />;
  if (status !== 'authenticated') {
    return <RedirectToWebLogin />;
  }
  // Forced temporary-password change: hold every admin destination except
  // My Account until the holder sets their own password.
  if (mustChangePassword && location.pathname !== '/admin/profile') {
    return <Navigate to="/admin/profile" replace />;
  }
  const denied = sessionError ? (
    <Forbidden
      action={
        <Button variant="secondary" onClick={() => void revalidate()}>
          Retry
        </Button>
      }
    />
  ) : (
    <Forbidden />
  );
  if (mustChangePassword) return <>{children}</>;
  // Sessions carrying a role id enforce per-module access: session-resolved
  // modules win, then role records, then the matrix seed as fallback. A
  // matched sub-item (dropdown link) is authoritative for its destination;
  // the item module check additionally covers flat pages (dashboard,
  // properties) and category headers with no matching child. Sessions
  // without a role id keep the legacy top-level gate.
  // Only wait for role records when the session carries no resolved modules
  // (mock/legacy): non-super-admin staff cannot read the role catalog, so
  // waiting would strand them on the skeleton for a fetch that must 403.
  if (roleId !== undefined && roleId !== null && !sessionModules && rolesPending)
    return <LoadingState />;
  const enforcedId = roleId ?? null;
  const sub = roleId ? findNavSubItem(location.pathname) : undefined;
  if (sub !== undefined && !canAccessSubModule(enforcedId, roles, sub.sub, sessionModules)) {
    return denied;
  }
  const item = findNavItem(location.pathname);
  if (item !== undefined) {
    if (!canAccess(role, item)) {
      return denied;
    }
    if (roleId && sub === undefined && !canAccessModule(enforcedId, roles, item, sessionModules)) {
      return denied;
    }
  }
  return <>{children}</>;
}
