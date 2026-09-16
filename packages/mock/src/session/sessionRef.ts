import type { MockUser } from './types';

/**
 * Shared mutable reference to the current mock session principal.
 *
 * The mock HTTP server (F1 object-level endpoints such as `GET /sales`, which
 * are scoped to the authenticated member) cannot read React context, so the
 * `MockSessionProvider` mirrors the current principal into this module-level
 * ref. The member mock handlers read it to scope responses (NFR-AUTHZ-002).
 *
 * Mock-only plumbing: the real API reads the session cookie server-side. Never
 * used to store credentials or tokens - the session itself lives in context.
 */
export const mockSessionRef: { current: MockUser | null } = { current: null };

/** Sync helper used by the provider and dev switcher. */
export function setMockSessionUser(user: MockUser | null): void {
  mockSessionRef.current = user;
}
