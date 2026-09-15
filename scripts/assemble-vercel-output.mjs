/**
 * Vercel build helper: merge the two built SPAs into one static output so a
 * single project can serve web at `/` and admin under `/admin` on the same
 * origin (required for the shared cookie/localStorage session + same-origin
 * API). The API functions in `api/` are deployed separately by Vercel.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('vercel-static', { recursive: true, force: true });
mkdirSync('vercel-static/admin', { recursive: true });
cpSync('apps/web/dist', 'vercel-static', { recursive: true });
cpSync('apps/admin/dist', 'vercel-static/admin', { recursive: true });