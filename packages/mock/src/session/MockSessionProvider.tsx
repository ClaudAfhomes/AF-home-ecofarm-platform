import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { MockSessionContext, type MockSessionContextValue } from './MockSessionContext';
import { MOCK_USERS } from './mock-users';
import { setMockSessionUser } from './sessionRef';
import type { MockUser } from './types';
import type { SessionStatus } from './types';

export interface MockSessionProviderProps {
  /** The mock user the session restores as (absent → unauthenticated). */
  initialUser?: MockUser;
  /** Simulated `/auth/me` session-restore delay (ms). Tests pass `0`. */
  restoreDelayMs?: number;
  children: ReactNode;
}

const STORAGE_KEY = 'jad:mock:session';

function readStoredUser(): MockUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pick<MockUser, 'id'>;
    if (!parsed || typeof parsed.id !== 'string') return null;
    const match = MOCK_USERS.find((candidate) => candidate.id === parsed.id);
    return match ?? null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: MockUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: user.id }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (SSR/test without jsdom)
  }
}

/**
 * Mock session provider. Simulates the HttpOnly-cookie session lifecycle
 * (ARCH-DEC-007): a short restore delay, an authenticated/unauthenticated
 * status, `loginAs`/`logout`. In development the mock session is persisted to
 * `localStorage` (`STORAGE_KEY`) so a refresh on `/member` does not bounce to
 * `/login` (best-practice for dev stand-in; production uses HttpOnly cookies
 * and is tree-shaken). No credentials or tokens are written - only the mock
 * user id.
 *
 * F0 development stand-in; replaced by the real `/auth/me` session provider
 * when the backend lands (swap this provider in `main.tsx` only).
 */
export function MockSessionProvider({
  initialUser,
  restoreDelayMs = 350,
  children,
}: MockSessionProviderProps) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<MockUser | null>(() => {
    if (initialUser) return initialUser;
    const stored = readStoredUser();
    return stored;
  });

  useEffect(() => {
    const restoreUser = initialUser ?? readStoredUser();
    const timer = setTimeout(() => {
      setMockSessionUser(restoreUser ?? null);
      setUser(restoreUser ?? null);
      setStatus(restoreUser ? 'authenticated' : 'unauthenticated');
    }, restoreDelayMs);
    return () => clearTimeout(timer);
  }, [initialUser, restoreDelayMs]);

  const loginAs = useCallback((next: MockUser) => {
    setMockSessionUser(next);
    setUser(next);
    setStatus('authenticated');
    writeStoredUser(next);
  }, []);

  const logout = useCallback(() => {
    setMockSessionUser(null);
    setUser(null);
    setStatus('unauthenticated');
    writeStoredUser(null);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readStoredUser();
      setMockSessionUser(next);
      setUser(next);
      setStatus(next ? 'authenticated' : 'unauthenticated');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<MockSessionContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      roleId: user?.roleId ?? null,
      isQualified: user?.isQualified ?? false,
      loginAs,
      logout,
    }),
    [status, user, loginAs, logout],
  );

  return <MockSessionContext.Provider value={value}>{children}</MockSessionContext.Provider>;
}
