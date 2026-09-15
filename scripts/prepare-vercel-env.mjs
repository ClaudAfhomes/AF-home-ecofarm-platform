/**
 * Vercel build helper: derive VITE_WEB_URL / VITE_ADMIN_URL from the deploy
 * URL when they are not explicitly set in the project env. Both apps live on
 * the same origin (web at `/`, admin at `/admin`), so the redirect targets
 * are stable for any deployment. Real process-env values win over the written
 * `.env.production` files (Vite gives actual env vars precedence).
 */
import { writeFileSync } from 'node:fs';

const url = process.env.VERCEL_URL;
if (!url) process.exit(0);

const lines = [];
if (!process.env.VITE_WEB_URL) lines.push(`VITE_WEB_URL=https://${url}`);
if (!process.env.VITE_ADMIN_URL) lines.push(`VITE_ADMIN_URL=https://${url}/admin`);

if (lines.length > 0) {
  const body = `${lines.join('\n')}\n`;
  writeFileSync('apps/web/.env.production', body);
  writeFileSync('apps/admin/.env.production', body);
}