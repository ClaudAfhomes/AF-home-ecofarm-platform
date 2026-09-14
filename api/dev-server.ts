/**
 * Local CMS API dev server — Q1 Vercel Functions fallback for `vercel dev`.
 * Runs on :3000 so Vite proxy `/api → http://localhost:3000` works without
 * `@vercel/static-build` / `turbo run build`.
 *
 * Reuses the existing Vercel handlers (`api/v1/cms/[key].ts`, `upload.ts`)
 * — no CMS logic is duplicated. Security/auth/validation/RLS behavior is
 * preserved because the same handler code is invoked.
 *
 * Usage: pnpm exec tsx api/dev-server.ts        (port 3000)
 *        pnpm exec tsx api/dev-server.ts 3001   (custom port)
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { findRouteCoverageGaps } from './_lib/route-coverage.js';
import { getSupabaseEnv } from './_lib/env.js';
import { findMissingSchemaRelations } from './_lib/schema-check.js';

// ---------------------------------------------------------------------------
// Load root .env (Node-compatible, no Vite). Mirrors supabase/seed.ts.
// ---------------------------------------------------------------------------
function loadEnvFile(path: string) {
  try {
    const content = fs.readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env) && value) process.env[key] = value;
    }
  } catch {}
}
loadEnvFile('.env');
loadEnvFile('apps/web/.env.local');
loadEnvFile('apps/admin/.env.local');

// Import handlers after env is loaded so getSupabaseEnv sees it.
// tsx will handle .ts imports.
import handlerCms from './v1/cms/[key].js';
import handlerUpload from './v1/cms/upload.js';
import handlerUploadSign from './v1/cms/upload/sign.js';
import handlerLocationVerify from './v1/registration/location-verify.js';
import handlerAuthRegister from './v1/auth/register.js';
import handlerPrograms from './v1/programs.js';
import handlerProgramQuestions from './v1/programs/[id]/questions.js';
import handlerConfigPublic from './v1/config/public.js';
import handlerPolicies from './v1/policies.js';
import handlerPolicyById from './v1/policies/[id].js';
import handlerAdminConfig from './v1/admin/config.js';
import handlerAdminConfigKey from './v1/admin/config/[key].js';
import handlerBroadcasts from './v1/me/broadcasts.js';
import handlerBroadcastCreate from './v1/broadcasts.js';
import handlerAdminBroadcasts from './v1/admin/broadcasts.js';
import handlerMeBroadcastRead from './v1/me/broadcasts/[id]/read.js';
import handlerMeBroadcastsReadAll from './v1/me/broadcasts/read-all.js';
import handlerForwardable from './v1/content/forwardable.js';
import handlerAdminContent from './v1/admin/content.js';
import handlerAdminContentById from './v1/admin/content/[id].js';
import handlerAdminSession from './v1/admin/session.js';
import handlerAdminSessionPassword from './v1/admin/session/password.js';
import handlerAdminRegistrations from './v1/admin/registrations.js';
import handlerAdminRegistrationById from './v1/admin/registrations/[id].js';
import handlerAdminRegistrationApprove from './v1/admin/registrations/[id]/approve.js';
import handlerAdminRegistrationReject from './v1/admin/registrations/[id]/reject.js';
import handlerAdminRegistrationGovId from './v1/admin/registrations/[id]/government-id.js';
import handlerAdminMembers from './v1/admin/members.js';
import handlerAdminMemberById from './v1/admin/members/[id].js';
import handlerAdminMembersArchived from './v1/admin/members/archived.js';
import handlerAdminMemberArchive from './v1/admin/members/[id]/archive.js';
import handlerAdminMemberRestore from './v1/admin/members/[id]/restore.js';
import handlerAdminSales from './v1/admin/sales.js';
import handlerAdminSaleById from './v1/admin/sales/[id].js';
import handlerAdminCustomers from './v1/admin/customers.js';
import handlerAdminRoles from './v1/admin/roles.js';
import handlerAdminRoleById from './v1/admin/roles/[id].js';
import handlerAdminStaff from './v1/admin/staff.js';
import handlerAdminStaffById from './v1/admin/staff/[id].js';
import handlerAdminAuditLog from './v1/admin/audit-log.js';
import handlerAdminProperties from './v1/admin/properties.js';
import handlerAdminPropertyById from './v1/admin/properties/[id].js';
import handlerAdminPayouts from './v1/admin/payouts.js';
import handlerAdminVouchers from './v1/admin/vouchers.js';
import handlerAdminVoucherTemplates from './v1/admin/voucher-templates.js';
import handlerAdminAdjustments from './v1/admin/adjustments.js';
import handlerAdminQueues from './v1/admin/queues.js';
import handlerAdminWithdrawals from './v1/admin/withdrawals.js';
import handlerAdminWithdrawalById from './v1/admin/withdrawals/[id].js';
import handlerAdminWithdrawalComplete from './v1/admin/withdrawals/[id]/complete.js';
import handlerAdminWithdrawalReject from './v1/admin/withdrawals/[id]/reject.js';
import handlerAdminPayoutById from './v1/admin/payouts/[id].js';
import handlerAdminVoucherTemplateById from './v1/admin/voucher-templates/[id].js';
import handlerAdminVoucherAssign from './v1/admin/vouchers/assign.js';
import handlerAdminVoucherById from './v1/admin/vouchers/[id].js';
import handlerAdminPropertyCategories from './v1/admin/property-categories.js';
import handlerAdminPropertyCategoryBySlug from './v1/admin/property-categories/[slug].js';
import handlerMeWallet from './v1/me/wallet.js';
import handlerMeLedger from './v1/me/ledger.js';
import handlerMeCommissions from './v1/me/commissions.js';
import handlerMePayoutAccounts from './v1/me/payout-accounts.js';
import handlerMePayoutAccountById from './v1/me/payout-accounts/[id].js';
import handlerMeWithdrawals from './v1/me/withdrawals.js';
import handlerMeWithdrawalById from './v1/me/withdrawals/[id].js';
import handlerMeVouchers from './v1/me/vouchers.js';
import handlerVoucherById from './v1/vouchers/[id].js';
import handlerMeQualification from './v1/me/qualification.js';
import handlerMeDirectReferrals from './v1/me/direct-referrals.js';
import handlerMeGroupNetwork from './v1/me/reports/group-network.js';
import handlerMeGenealogy from './v1/me/genealogy.js';
import handlerMeResubmit from './v1/me/resubmit.js';
import handlerMe from './v1/me.js';
import handlerMeReferralCode from './v1/me/referral-code.js';
import handlerCustomers from './v1/customers.js';
import handlerSales from './v1/sales.js';
import handlerSaleById from './v1/sales/[id].js';
import handlerSaleResubmit from './v1/sales/[id]/resubmit.js';
import handlerSaleReopenRequest from './v1/me/sales/[id]/reopen-request.js';
import handlerMemberById from './v1/members/[id].js';
import handlerMeMessages from './v1/me/messages.js';
import handlerMeMessagesRead from './v1/me/messages/read.js';
import handlerMeMessagesSummary from './v1/me/messages/summary.js';
import handlerAdminConversations from './v1/admin/conversations.js';
import handlerAdminConversationThread from './v1/admin/conversations/[memberId].js';
import handlerAdminConversationMessages from './v1/admin/conversations/[memberId]/messages.js';
import handlerAdminConversationRead from './v1/admin/conversations/[memberId]/read.js';
import handlerAdminMessagesSummary from './v1/admin/messages/summary.js';

const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);

type VercelReq = {
  method?: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  body?: unknown;
  url?: string;
};

function toVercelHeaders(
  nodeHeaders: http.IncomingHttpHeaders,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(nodeHeaders)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : (v as string | undefined);
  }
  return out;
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      // Try JSON, else leave as string (handler will handle)
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const method = req.method ?? 'GET';
  const host = req.headers.host ?? `localhost:${port}`;
  const fullUrl = `http://${host}${req.url ?? '/'}`;
  let url: URL;
  try {
    url = new URL(fullUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid URL' } }));
    return;
  }

  const pathname = url.pathname;
  const query: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  // Route: /api/v1/cms/:key  and /api/v1/cms/upload
  // Also support without /api/v1 prefix for direct calls
  type HandlerFn = (req: VercelReq, res: never) => Promise<void>;
  let handler: HandlerFn | null = null;
  let routeKey: string | null = null;

  if (
    pathname === '/api/v1/registration/location-verify' ||
    pathname === '/api/registration/location-verify'
  ) {
    handler = handlerLocationVerify as unknown as HandlerFn;
    routeKey = 'registration/location-verify';
  } else if (pathname === '/api/v1/auth/register' || pathname === '/api/auth/register') {
    handler = handlerAuthRegister as unknown as HandlerFn;
    routeKey = 'auth/register';
  } else if (pathname === '/api/v1/cms/upload/sign' || pathname === '/api/cms/upload/sign') {
    handler = handlerUploadSign as unknown as HandlerFn;
    routeKey = 'upload/sign';
  } else if (pathname === '/api/v1/cms/upload' || pathname === '/api/cms/upload') {
    handler = handlerUpload as unknown as HandlerFn;
    routeKey = 'upload';
  } else if (pathname === '/api/v1/programs' || pathname === '/api/programs') {
    handler = handlerPrograms as unknown as HandlerFn;
    routeKey = 'programs';
  } else if (pathname === '/api/v1/config/public' || pathname === '/api/config/public') {
    handler = handlerConfigPublic as unknown as HandlerFn;
    routeKey = 'config/public';
  } else if (pathname === '/api/v1/policies' || pathname === '/api/policies') {
    handler = handlerPolicies as unknown as HandlerFn;
    routeKey = 'policies';
  } else if (pathname === '/api/v1/admin/config' || pathname === '/api/admin/config') {
    handler = handlerAdminConfig as unknown as HandlerFn;
    routeKey = 'admin/config';
  } else if (pathname === '/api/v1/admin/content' || pathname === '/api/admin/content') {
    handler = handlerAdminContent as unknown as HandlerFn;
    routeKey = 'admin/content';
  } else if (
    pathname.startsWith('/api/v1/admin/content/') ||
    pathname.startsWith('/api/admin/content/')
  ) {
    const m = pathname.match(/\/content\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminContentById as unknown as HandlerFn;
      routeKey = 'admin/content/[id]';
    }
  } else if (pathname === '/api/v1/admin/session' || pathname === '/api/admin/session') {
    handler = handlerAdminSession as unknown as HandlerFn;
    routeKey = 'admin/session';
  } else if (
    pathname === '/api/v1/admin/session/password' ||
    pathname === '/api/admin/session/password'
  ) {
    handler = handlerAdminSessionPassword as unknown as HandlerFn;
    routeKey = 'admin/session/password';
  } else if (
    pathname === '/api/v1/content/forwardable' ||
    pathname === '/api/content/forwardable'
  ) {
    handler = handlerForwardable as unknown as HandlerFn;
    routeKey = 'content/forwardable';
  } else if (pathname === '/api/v1/me/broadcasts' || pathname === '/api/me/broadcasts') {
    handler = handlerBroadcasts as unknown as HandlerFn;
    routeKey = 'me/broadcasts';
  } else if (pathname === '/api/v1/broadcasts' || pathname === '/api/broadcasts') {
    handler = handlerBroadcastCreate as unknown as HandlerFn;
    routeKey = 'broadcasts';
  } else if (pathname === '/api/v1/admin/broadcasts' || pathname === '/api/admin/broadcasts') {
    handler = handlerAdminBroadcasts as unknown as HandlerFn;
    routeKey = 'admin/broadcasts';
  } else if (
    pathname === '/api/v1/me/broadcasts/read-all' ||
    pathname === '/api/me/broadcasts/read-all'
  ) {
    handler = handlerMeBroadcastsReadAll as unknown as HandlerFn;
    routeKey = 'me/broadcasts/read-all';
  } else if (
    pathname.startsWith('/api/v1/me/broadcasts/') ||
    pathname.startsWith('/api/me/broadcasts/')
  ) {
    const m = pathname.match(/\/me\/broadcasts\/([^/]+)\/read$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerMeBroadcastRead as unknown as HandlerFn;
      routeKey = 'me/broadcasts/[id]/read';
    }
  } else if (pathname === '/api/v1/me/messages' || pathname === '/api/me/messages') {
    handler = handlerMeMessages as unknown as HandlerFn;
    routeKey = 'me/messages';
  } else if (pathname === '/api/v1/me/messages/read' || pathname === '/api/me/messages/read') {
    handler = handlerMeMessagesRead as unknown as HandlerFn;
    routeKey = 'me/messages/read';
  } else if (
    pathname === '/api/v1/me/messages/summary' ||
    pathname === '/api/me/messages/summary'
  ) {
    handler = handlerMeMessagesSummary as unknown as HandlerFn;
    routeKey = 'me/messages/summary';
  } else if (
    pathname === '/api/v1/admin/conversations' ||
    pathname === '/api/admin/conversations'
  ) {
    handler = handlerAdminConversations as unknown as HandlerFn;
    routeKey = 'admin/conversations';
  } else if (
    pathname === '/api/v1/admin/messages/summary' ||
    pathname === '/api/admin/messages/summary'
  ) {
    handler = handlerAdminMessagesSummary as unknown as HandlerFn;
    routeKey = 'admin/messages/summary';
  } else if (
    pathname.startsWith('/api/v1/admin/conversations/') ||
    pathname.startsWith('/api/admin/conversations/')
  ) {
    const m = pathname.match(/\/admin\/conversations\/([^/]+)(\/messages|\/read)?$/);
    if (m) {
      query.memberId = decodeURIComponent(m[1] ?? '');
      if (m[2] === '/messages') {
        handler = handlerAdminConversationMessages as unknown as HandlerFn;
        routeKey = 'admin/conversations/[memberId]/messages';
      } else if (m[2] === '/read') {
        handler = handlerAdminConversationRead as unknown as HandlerFn;
        routeKey = 'admin/conversations/[memberId]/read';
      } else {
        handler = handlerAdminConversationThread as unknown as HandlerFn;
        routeKey = 'admin/conversations/[memberId]';
      }
    }
  } else if (pathname === '/api/v1/me' || pathname === '/api/me') {
    handler = handlerMe as unknown as HandlerFn;
    routeKey = 'me';
  } else if (pathname === '/api/v1/me/referral-code' || pathname === '/api/me/referral-code') {
    handler = handlerMeReferralCode as unknown as HandlerFn;
    routeKey = 'me/referral-code';
  } else if (pathname === '/api/v1/customers' || pathname === '/api/customers') {
    handler = handlerCustomers as unknown as HandlerFn;
    routeKey = 'customers';
  } else if (pathname === '/api/v1/sales' || pathname === '/api/sales') {
    handler = handlerSales as unknown as HandlerFn;
    routeKey = 'sales';
  } else if (pathname.startsWith('/api/v1/members/') || pathname.startsWith('/api/members/')) {
    const m = pathname.match(/\/members\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerMemberById as unknown as HandlerFn;
      routeKey = 'members/[id]';
    }
  } else if (
    pathname === '/api/v1/admin/registrations' ||
    pathname === '/api/admin/registrations'
  ) {
    handler = handlerAdminRegistrations as unknown as HandlerFn;
    routeKey = 'admin/registrations';
  } else if (pathname === '/api/v1/admin/members' || pathname === '/api/admin/members') {
    handler = handlerAdminMembers as unknown as HandlerFn;
    routeKey = 'admin/members';
  } else if (
    pathname === '/api/v1/admin/members/archived' ||
    pathname === '/api/admin/members/archived'
  ) {
    handler = handlerAdminMembersArchived as unknown as HandlerFn;
    routeKey = 'admin/members/archived';
  } else if (pathname === '/api/v1/admin/sales' || pathname === '/api/admin/sales') {
    handler = handlerAdminSales as unknown as HandlerFn;
    routeKey = 'admin/sales';
  } else if (pathname === '/api/v1/admin/customers' || pathname === '/api/admin/customers') {
    handler = handlerAdminCustomers as unknown as HandlerFn;
    routeKey = 'admin/customers';
  } else if (pathname === '/api/v1/admin/roles' || pathname === '/api/admin/roles') {
    handler = handlerAdminRoles as unknown as HandlerFn;
    routeKey = 'admin/roles';
  } else if (pathname === '/api/v1/admin/staff' || pathname === '/api/admin/staff') {
    handler = handlerAdminStaff as unknown as HandlerFn;
    routeKey = 'admin/staff';
  } else if (pathname === '/api/v1/admin/audit-log' || pathname === '/api/admin/audit-log') {
    handler = handlerAdminAuditLog as unknown as HandlerFn;
    routeKey = 'admin/audit-log';
  } else if (pathname === '/api/v1/admin/properties' || pathname === '/api/admin/properties') {
    handler = handlerAdminProperties as unknown as HandlerFn;
    routeKey = 'admin/properties';
  } else if (pathname === '/api/v1/admin/payouts' || pathname === '/api/admin/payouts') {
    handler = handlerAdminPayouts as unknown as HandlerFn;
    routeKey = 'admin/payouts';
  } else if (pathname === '/api/v1/admin/vouchers' || pathname === '/api/admin/vouchers') {
    handler = handlerAdminVouchers as unknown as HandlerFn;
    routeKey = 'admin/vouchers';
  } else if (
    pathname === '/api/v1/admin/voucher-templates' ||
    pathname === '/api/admin/voucher-templates'
  ) {
    handler = handlerAdminVoucherTemplates as unknown as HandlerFn;
    routeKey = 'admin/voucher-templates';
  } else if (pathname === '/api/v1/admin/adjustments' || pathname === '/api/admin/adjustments') {
    handler = handlerAdminAdjustments as unknown as HandlerFn;
    routeKey = 'admin/adjustments';
  } else if (pathname === '/api/v1/admin/queues' || pathname === '/api/admin/queues') {
    handler = handlerAdminQueues as unknown as HandlerFn;
    routeKey = 'admin/queues';
  } else if (pathname === '/api/v1/admin/withdrawals' || pathname === '/api/admin/withdrawals') {
    handler = handlerAdminWithdrawals as unknown as HandlerFn;
    routeKey = 'admin/withdrawals';
  } else if (pathname === '/api/v1/me/wallet' || pathname === '/api/me/wallet') {
    handler = handlerMeWallet as unknown as HandlerFn;
    routeKey = 'me/wallet';
  } else if (pathname === '/api/v1/me/ledger' || pathname === '/api/me/ledger') {
    handler = handlerMeLedger as unknown as HandlerFn;
    routeKey = 'me/ledger';
  } else if (pathname === '/api/v1/me/commissions' || pathname === '/api/me/commissions') {
    handler = handlerMeCommissions as unknown as HandlerFn;
    routeKey = 'me/commissions';
  } else if (pathname === '/api/v1/me/payout-accounts' || pathname === '/api/me/payout-accounts') {
    handler = handlerMePayoutAccounts as unknown as HandlerFn;
    routeKey = 'me/payout-accounts';
  } else if (pathname === '/api/v1/me/withdrawals' || pathname === '/api/me/withdrawals') {
    handler = handlerMeWithdrawals as unknown as HandlerFn;
    routeKey = 'me/withdrawals';
  } else if (pathname === '/api/v1/me/vouchers' || pathname === '/api/me/vouchers') {
    handler = handlerMeVouchers as unknown as HandlerFn;
    routeKey = 'me/vouchers';
  } else if (pathname === '/api/v1/me/qualification' || pathname === '/api/me/qualification') {
    handler = handlerMeQualification as unknown as HandlerFn;
    routeKey = 'me/qualification';
  } else if (
    pathname === '/api/v1/me/direct-referrals' ||
    pathname === '/api/me/direct-referrals'
  ) {
    handler = handlerMeDirectReferrals as unknown as HandlerFn;
    routeKey = 'me/direct-referrals';
  } else if (
    pathname === '/api/v1/me/reports/group-network' ||
    pathname === '/api/me/reports/group-network'
  ) {
    handler = handlerMeGroupNetwork as unknown as HandlerFn;
    routeKey = 'me/reports/group-network';
  } else if (pathname === '/api/v1/me/genealogy' || pathname === '/api/me/genealogy') {
    handler = handlerMeGenealogy as unknown as HandlerFn;
    routeKey = 'me/genealogy';
  } else if (pathname === '/api/v1/me/resubmit' || pathname === '/api/me/resubmit') {
    handler = handlerMeResubmit as unknown as HandlerFn;
    routeKey = 'me/resubmit';
  } else if (
    pathname === '/api/v1/admin/vouchers/assign' ||
    pathname === '/api/admin/vouchers/assign'
  ) {
    handler = handlerAdminVoucherAssign as unknown as HandlerFn;
    routeKey = 'admin/vouchers/assign';
  } else if (
    pathname === '/api/v1/admin/property-categories' ||
    pathname === '/api/admin/property-categories'
  ) {
    handler = handlerAdminPropertyCategories as unknown as HandlerFn;
    routeKey = 'admin/property-categories';
  } else if (pathname.startsWith('/api/v1/me/sales/') || pathname.startsWith('/api/me/sales/')) {
    const m = pathname.match(/\/me\/sales\/([^/]+)\/reopen-request$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerSaleReopenRequest as unknown as HandlerFn;
      routeKey = 'me/sales/reopen-request';
    }
  } else if (pathname.startsWith('/api/v1/sales/') || pathname.startsWith('/api/sales/')) {
    const resubmit = pathname.match(/\/sales\/([^/]+)\/resubmit$/);
    if (resubmit) {
      query.id = decodeURIComponent(resubmit[1] ?? '');
      handler = handlerSaleResubmit as unknown as HandlerFn;
      routeKey = 'sales/resubmit';
    } else {
      const m = pathname.match(/\/sales\/([^/]+)$/);
      if (m) {
        query.id = decodeURIComponent(m[1] ?? '');
        handler = handlerSaleById as unknown as HandlerFn;
        routeKey = 'sales/[id]';
      }
    }
  } else if (
    pathname.startsWith('/api/v1/admin/registrations/') ||
    pathname.startsWith('/api/admin/registrations/')
  ) {
    const govId = pathname.match(/\/registrations\/([^/]+)\/government-id$/);
    const approve = pathname.match(/\/registrations\/([^/]+)\/approve$/);
    const reject = pathname.match(/\/registrations\/([^/]+)\/reject$/);
    const one = pathname.match(/\/registrations\/([^/]+)$/);
    if (govId) {
      query.id = decodeURIComponent(govId[1] ?? '');
      handler = handlerAdminRegistrationGovId as unknown as HandlerFn;
      routeKey = 'admin/registrations/government-id';
    } else if (approve) {
      query.id = decodeURIComponent(approve[1] ?? '');
      handler = handlerAdminRegistrationApprove as unknown as HandlerFn;
      routeKey = 'admin/registrations/approve';
    } else if (reject) {
      query.id = decodeURIComponent(reject[1] ?? '');
      handler = handlerAdminRegistrationReject as unknown as HandlerFn;
      routeKey = 'admin/registrations/reject';
    } else if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      handler = handlerAdminRegistrationById as unknown as HandlerFn;
      routeKey = 'admin/registrations/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/members/') ||
    pathname.startsWith('/api/admin/members/')
  ) {
    const archive = pathname.match(/\/members\/([^/]+)\/archive$/);
    const restore = pathname.match(/\/members\/([^/]+)\/restore$/);
    const one = pathname.match(/\/members\/([^/]+)$/);
    if (archive) {
      query.id = decodeURIComponent(archive[1] ?? '');
      handler = handlerAdminMemberArchive as unknown as HandlerFn;
      routeKey = 'admin/members/archive';
    } else if (restore) {
      query.id = decodeURIComponent(restore[1] ?? '');
      handler = handlerAdminMemberRestore as unknown as HandlerFn;
      routeKey = 'admin/members/restore';
    } else if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      handler = handlerAdminMemberById as unknown as HandlerFn;
      routeKey = 'admin/members/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/sales/') ||
    pathname.startsWith('/api/admin/sales/')
  ) {
    const m = pathname.match(/\/sales\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminSaleById as unknown as HandlerFn;
      routeKey = 'admin/sales/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/properties/') ||
    pathname.startsWith('/api/admin/properties/')
  ) {
    const m = pathname.match(/\/properties\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminPropertyById as unknown as HandlerFn;
      routeKey = 'admin/properties/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/voucher-templates/') ||
    pathname.startsWith('/api/admin/voucher-templates/')
  ) {
    const m = pathname.match(/\/voucher-templates\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminVoucherTemplateById as unknown as HandlerFn;
      routeKey = 'admin/voucher-templates/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/vouchers/') ||
    pathname.startsWith('/api/admin/vouchers/')
  ) {
    const m = pathname.match(/\/vouchers\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminVoucherById as unknown as HandlerFn;
      routeKey = 'admin/vouchers/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/property-categories/') ||
    pathname.startsWith('/api/admin/property-categories/')
  ) {
    const m = pathname.match(/\/property-categories\/([^/]+)$/);
    if (m) {
      query.slug = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminPropertyCategoryBySlug as unknown as HandlerFn;
      routeKey = 'admin/property-categories/[slug]';
    }
  } else if (pathname.startsWith('/api/v1/vouchers/') || pathname.startsWith('/api/vouchers/')) {
    const m = pathname.match(/\/vouchers\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerVoucherById as unknown as HandlerFn;
      routeKey = 'vouchers/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/payouts/') ||
    pathname.startsWith('/api/admin/payouts/')
  ) {
    const m = pathname.match(/\/payouts\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminPayoutById as unknown as HandlerFn;
      routeKey = 'admin/payouts/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/withdrawals/') ||
    pathname.startsWith('/api/admin/withdrawals/')
  ) {
    const complete = pathname.match(/\/withdrawals\/([^/]+)\/complete$/);
    const reject = pathname.match(/\/withdrawals\/([^/]+)\/reject$/);
    const one = pathname.match(/\/withdrawals\/([^/]+)$/);
    if (complete) {
      query.id = decodeURIComponent(complete[1] ?? '');
      handler = handlerAdminWithdrawalComplete as unknown as HandlerFn;
      routeKey = 'admin/withdrawals/complete';
    } else if (reject) {
      query.id = decodeURIComponent(reject[1] ?? '');
      handler = handlerAdminWithdrawalReject as unknown as HandlerFn;
      routeKey = 'admin/withdrawals/reject';
    } else if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      handler = handlerAdminWithdrawalById as unknown as HandlerFn;
      routeKey = 'admin/withdrawals/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/me/payout-accounts/') ||
    pathname.startsWith('/api/me/payout-accounts/')
  ) {
    const m = pathname.match(/\/payout-accounts\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerMePayoutAccountById as unknown as HandlerFn;
      routeKey = 'me/payout-accounts/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/me/withdrawals/') ||
    pathname.startsWith('/api/me/withdrawals/')
  ) {
    const m = pathname.match(/\/withdrawals\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerMeWithdrawalById as unknown as HandlerFn;
      routeKey = 'me/withdrawals/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/roles/') ||
    pathname.startsWith('/api/admin/roles/')
  ) {
    const m = pathname.match(/\/roles\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminRoleById as unknown as HandlerFn;
      routeKey = 'admin/roles/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/staff/') ||
    pathname.startsWith('/api/admin/staff/')
  ) {
    const m = pathname.match(/\/staff\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminStaffById as unknown as HandlerFn;
      routeKey = 'admin/staff/[id]';
    }
  } else if (pathname.startsWith('/api/v1/programs/') || pathname.startsWith('/api/programs/')) {
    const m = pathname.match(/\/programs\/([^/]+)\/qualification-questions$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerProgramQuestions as unknown as HandlerFn;
      routeKey = 'programs/questions';
    }
  } else if (pathname.startsWith('/api/v1/policies/') || pathname.startsWith('/api/policies/')) {
    const m = pathname.match(/\/policies\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      handler = handlerPolicyById as unknown as HandlerFn;
      routeKey = 'policies/[id]';
    }
  } else if (
    pathname.startsWith('/api/v1/admin/config/') ||
    pathname.startsWith('/api/admin/config/')
  ) {
    const m = pathname.match(/\/admin\/config\/([^/]+)$/);
    if (m) {
      query.key = decodeURIComponent(m[1] ?? '');
      handler = handlerAdminConfigKey as unknown as HandlerFn;
      routeKey = 'admin/config/[key]';
    }
  } else {
    const m =
      pathname.match(/^(?:\/api\/v1)?\/api\/v1\/cms\/([^/]+)$/) ??
      pathname.match(/^\/api\/v1\/cms\/([^/]+)$/) ??
      pathname.match(/^\/api\/cms\/([^/]+)$/);
    // Simpler: match /api/v1/cms/<key> and /api/cms/<key>
    const match = pathname.match(/\/cms\/([^/]+)$/);
    if (match) {
      const key = decodeURIComponent(match[1] ?? '');
      // Validate key is one of the 8 to avoid invoking handler for unknown
      query.key = key;
      handler = handlerCms as unknown as HandlerFn;
      routeKey = key;
    }
  }

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: `No handler for ${pathname}` } }),
    );
    console.log(`[dev-server] ${method} ${pathname} -> 404 (no handler)`);
    return;
  }

  const body = await parseBody(req);
  const vercelReq: VercelReq = {
    method,
    query,
    headers: toVercelHeaders(req.headers),
    body,
    url: pathname + url.search,
  };

  // Adapt Node ServerResponse to VercelResponse shape expected by handlers
  const headersOut: Record<string, string> = {};
  let statusCode = 200;
  const vercelRes: Record<string, unknown> & {
    setHeader: (n: string, v: string) => void;
    status: (c: number) => typeof vercelRes;
    json: (b: unknown) => void;
    end: () => void;
  } = {
    setHeader: (n: string, v: string) => {
      headersOut[n.toLowerCase()] = v;
    },
    status: (code: number) => {
      statusCode = code;
      return vercelRes;
    },
    json: (body: unknown) => {
      const payload = JSON.stringify(body);
      headersOut['content-type'] = headersOut['content-type'] ?? 'application/json';
      res.writeHead(statusCode, headersOut);
      res.end(payload);
      const ms = Date.now() - started;
      // On 401, note whether credentials were even sent (no values logged):
      // `no-credentials` = frontend/session issue (logged out, expired, cookie
      // not forwarded); `credentials-rejected` = backend rejected a token.
      let authHint = '';
      if (statusCode === 401) {
        const h = vercelReq.headers as Record<string, string | undefined>;
        const hasBearer = typeof h.authorization === 'string' && h.authorization.length > 0;
        const cookie = typeof h.cookie === 'string' ? h.cookie : '';
        const hasCookie = /(?:^|;\s*)sb-[^;=]+-auth-token(?:\s*=)/.test(cookie);
        authHint = hasBearer || hasCookie ? ' (credentials-rejected)' : ' (no-credentials)';
      }
      console.log(
        `[dev-server] ${method} ${pathname}${routeKey ? ` [key=${routeKey}]` : ''} -> ${statusCode} (${ms}ms)${authHint}`,
      );
    },
    end: () => {
      res.writeHead(statusCode, headersOut);
      res.end();
      const ms = Date.now() - started;
      console.log(`[dev-server] ${method} ${pathname} -> ${statusCode} (${ms}ms)`);
    },
  };

  try {
    await handler(vercelReq, vercelRes as unknown as Parameters<typeof handler>[1]);
  } catch (e) {
    const err = e as Error;
    // eslint-disable-next-line no-console
    console.error(`[dev-server] handler error for ${method} ${pathname}:`, err?.message ?? err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } }));
    }
  }
});

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[dev-server] listen error:', err);
  process.exit(1);
});

// Route-coverage self-check: every api/v1 handler file must be imported AND
// referenced in a routing branch, otherwise its requests 404 with
// "No handler for ...". Warn loudly instead of failing — an intentionally
// unrouted file should be deleted or underscore-prefixed, not silent.
const thisFile = fileURLToPath(import.meta.url);
for (const gap of findRouteCoverageGaps(
  path.join(path.dirname(thisFile), 'v1'),
  fs.readFileSync(thisFile, 'utf8'),
)) {
  // eslint-disable-next-line no-console
  console.warn(
    `[dev-server] WARNING: ${gap.file} is ${gap.reason === 'not-imported' ? 'not imported' : 'imported but never routed'} — requests to it will 404. Add it to the route table.`,
  );
}

// Schema self-check: probe the messaging tables via PostgREST so a missing
// migration is caught at startup (loud) instead of every endpoint returning
// "Could not find the table 'public.Conversation' in the schema cache".
// Skipped when Supabase is not configured (mock/dev-server-only mode).
void (async () => {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) return;
  const { createClient } = await import('@supabase/supabase-js');
  const svc = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
  try {
    const missing = await findMissingSchemaRelations(svc as never);
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[dev-server] FATAL: messaging schema missing (${missing.join(', ')}) — run \`pnpm db:migrate\` or apply supabase/migrations/20261008000001_messaging.sql.`,
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[dev-server] schema self-check failed:', (e as Error).message);
  }
})();

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[dev-server] CMS API listening on http://localhost:${port} (api/v1/cms/*)`);
  // eslint-disable-next-line no-console
  console.log(
    `[dev-server] Vite proxy /api -> http://localhost:${port} (see apps/web|admin/vite.config.ts)`,
  );
});
