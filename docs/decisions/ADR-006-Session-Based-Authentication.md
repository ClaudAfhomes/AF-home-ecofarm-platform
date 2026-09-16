# ADR-006: Session-Based Authentication with HttpOnly Cookies

## Status
**Accepted** for the authentication mechanism (ARCHITECTURE.md §16, ARCH-DEC-007: **CONFIRMED**; TECH-STACK §7; BACKEND-ARCHITECTURE §8). The session store is **DB-backed** (`PROPOSED` - DATABASE-DESIGN §7.7 / E-07; BACKEND-ARCHITECTURE §8).

## Context
Authentication must support three web clients plus the approved web-first mobile experience (ADR-005). The platform stores PII, financial records, and vouchers; tokens must not be stealable via XSS. Email verification is a hard gate before account approval (BR-AUTH-001). NFR-AUTH-001/002 govern authentication/authorization availability and correctness.

## Problem
Choose an authentication mechanism that allows server-side revocation, resists token theft, and fits the web-first client architecture.

## Options Considered
- **Session-based with HttpOnly, Secure, SameSite cookies** - server-side session state, revocable.
- **JWT / stateless tokens** - no server-side session store.
- **Hybrid** - cookies + short-lived tokens.

## Decision
Use **session-based authentication** with **HttpOnly, Secure, SameSite** cookies for web clients (ARCH-DEC-007). `POST /auth/login` establishes, `POST /auth/logout` invalidates, `POST /auth/refresh` rotates the session. **No JWT** - JWT is explicitly NOT approved (MOBILE-ARCHITECTURE §8). Email verification gates approval (BR-AUTH-001). The session store is **DB-backed** (PROPOSED; revocable, survives restarts - DATABASE-DESIGN E-07).

## Rationale
- Server-side sessions enable immediate revocation (logout) and per-session control.
- HttpOnly + Secure + SameSite cookies defend against token theft via XSS (ARCH-DEC-007 rationale).
- The session-storage cost is acceptable for this platform; JWT revocation risk was the deciding trade-off.
- `SYS` internal/service-to-service identity uses short-lived tokens from the secret manager - never user cookies (API-SPECIFICATION §2.2).

## Trade-offs
- Server-side session storage cost and TTL decisions are open (`DA-04` session store + TTLs - PROPOSED).
- Cookie-based auth requires CSRF protection; the **CSRF mechanism is REQUIRES APPROVAL** (BACKEND-ARCHITECTURE §21).
- RN (future native) has no browser cookie jar - the RN transport mechanism is an open decision (`MA-04`), not decided here.

## Consequences
- Auth endpoints `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me` (API-SPECIFICATION §2.1/§6.1).
- Sessions entity E-07 (DB-backed, `session_token_hash` - hash only, never raw; DATABASE-DESIGN §7.7/§8.3).
- On session expiry the client drops to login; in-flight data not trusted after expiry (FRONTEND-ARCHITECTURE §6.2).
- JWT must not be adopted without approval (MOBILE-ARCHITECTURE §8).

## Validation / Evidence
- ARCHITECTURE.md §16 (ARCH-DEC-007 = CONFIRMED); TECH-STACK.md §7.
- API-SPECIFICATION.md §2.1/§2.2/§6.1; BACKEND-ARCHITECTURE.md §8; DATABASE-DESIGN.md §7.7/E-07/DA-04.
- SECURITY.md §2/§10 (authentication/session security); MOBILE-ARCHITECTURE.md §8.

## References
- ARCH-DEC-007; TECH-STACK.md §7; API-SPECIFICATION.md §2/§6.1; BACKEND-ARCHITECTURE.md §8/§21; DATABASE-DESIGN.md E-07/DA-04; BR-AUTH-001; SECURITY.md §2/§10.