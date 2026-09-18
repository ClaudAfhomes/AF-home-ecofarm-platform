/**
 * Shared API router - single source of the URL→handler table.
 *
 * Both `api/dev-server.ts` (local) and the single Vercel catch-all function
 * `api/v1/[...slug].ts` dispatch through `routeRequest`, so every endpoint is
 * served identically in dev and production. The handler files live under
 * `api/_handlers/**` (underscore-prefixed → Vercel never turns them into
 * functions; they are bundled into the catch-all instead).
 *
 * A new handler must be added as a lazy branch here (`lazy(() => import(...))`)
 * - `api/_lib/route-coverage.ts` fails CI if one is forgotten. Handlers are
 * loaded on first use (cold-start win); shared libs stay imported eagerly.
 */
import type { VercelRequest, VercelResponse } from './http.js';

type HandlerFn = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

export type RouteMatch = { handler: HandlerFn; routeKey: string | null };

/**
 * Lazy handler loader - defers a handler module's evaluation until its first
 * request (per-route code splitting). Big cold-start win for the monolith:
 * only the matched handler (plus shared libs) is evaluated per boot instead
 * of all ~90 modules. Cached per instance; each route gets its own loader.
 */
function lazy(load: () => Promise<{ default: HandlerFn }>): HandlerFn {
  let cached: HandlerFn | null = null;
  return (req: VercelRequest, res: VercelResponse) => {
    if (cached) return cached(req, res);
    return load().then((mod) => {
      cached = mod.default;
      return cached(req, res);
    });
  };
}

/**
 * Route `pathname` (+ the mutable `query` object to populate path params) to a
 * handler. Supports both `/api/v1/...` and bare `/api/...` prefixes (the bare
 * prefix only matters for the local dev server; Vercel only serves `/api/v1`).
 */
export function selectHandler(
  pathname: string,
  query: Record<string, string | string[] | undefined>,
): RouteMatch | null {
  if (pathname === '/api/v1/health' || pathname === '/health') {
    return { handler: lazy(() => import('../_handlers/health.js')), routeKey: 'health' };
  }
  if (
    pathname === '/api/v1/registration/location-verify' ||
    pathname === '/api/registration/location-verify'
  ) {
    return {
      handler: lazy(() => import('../_handlers/registration/location-verify.js')),
      routeKey: 'registration/location-verify',
    };
  }
  if (pathname === '/api/v1/auth/register' || pathname === '/api/auth/register') {
    return {
      handler: lazy(() => import('../_handlers/auth/register.js')),
      routeKey: 'auth/register',
    };
  }
  if (pathname === '/api/v1/auth/verify-email' || pathname === '/api/auth/verify-email') {
    return {
      handler: lazy(() => import('../_handlers/auth/verify-email.js')),
      routeKey: 'auth/verify-email',
    };
  }
  if (
    pathname === '/api/v1/auth/verify-email/resend' ||
    pathname === '/api/auth/verify-email/resend'
  ) {
    return {
      handler: lazy(() => import('../_handlers/auth/verify-email/resend.js')),
      routeKey: 'auth/verify-email/resend',
    };
  }
  if (pathname === '/api/v1/contact' || pathname === '/api/contact') {
    return { handler: lazy(() => import('../_handlers/contact.js')), routeKey: 'contact' };
  }
  if (pathname === '/api/v1/cms/upload/sign' || pathname === '/api/cms/upload/sign') {
    return {
      handler: lazy(() => import('../_handlers/cms/upload/sign.js')),
      routeKey: 'upload/sign',
    };
  }
  if (pathname === '/api/v1/cms/upload' || pathname === '/api/cms/upload') {
    return { handler: lazy(() => import('../_handlers/cms/upload.js')), routeKey: 'upload' };
  }
  if (pathname === '/api/v1/programs' || pathname === '/api/programs') {
    return { handler: lazy(() => import('../_handlers/programs.js')), routeKey: 'programs' };
  }
  if (pathname === '/api/v1/admin/programs' || pathname === '/api/admin/programs') {
    return {
      handler: lazy(() => import('../_handlers/admin/programs.js')),
      routeKey: 'admin/programs',
    };
  }
  if (
    pathname.startsWith('/api/v1/admin/programs/') ||
    pathname.startsWith('/api/admin/programs/')
  ) {
    const m = pathname.match(/\/admin\/programs\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/programs/[id].js')),
        routeKey: 'admin/programs/[id]',
      };
    }
  }
  if (pathname === '/api/v1/config/public' || pathname === '/api/config/public') {
    return {
      handler: lazy(() => import('../_handlers/config/public.js')),
      routeKey: 'config/public',
    };
  }
  if (pathname === '/api/v1/policies' || pathname === '/api/policies') {
    return { handler: lazy(() => import('../_handlers/policies.js')), routeKey: 'policies' };
  }
  if (pathname === '/api/v1/admin/config' || pathname === '/api/admin/config') {
    return {
      handler: lazy(() => import('../_handlers/admin/config.js')),
      routeKey: 'admin/config',
    };
  }
  if (pathname === '/api/v1/admin/content' || pathname === '/api/admin/content') {
    return {
      handler: lazy(() => import('../_handlers/admin/content.js')),
      routeKey: 'admin/content',
    };
  }
  if (pathname.startsWith('/api/v1/admin/content/') || pathname.startsWith('/api/admin/content/')) {
    const m = pathname.match(/\/content\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/content/[id].js')),
        routeKey: 'admin/content/[id]',
      };
    }
  }
  if (pathname === '/api/v1/admin/session' || pathname === '/api/admin/session') {
    return {
      handler: lazy(() => import('../_handlers/admin/session.js')),
      routeKey: 'admin/session',
    };
  }
  if (pathname === '/api/v1/admin/session/password' || pathname === '/api/admin/session/password') {
    return {
      handler: lazy(() => import('../_handlers/admin/session/password.js')),
      routeKey: 'admin/session/password',
    };
  }
  if (pathname === '/api/v1/content/forwardable' || pathname === '/api/content/forwardable') {
    return {
      handler: lazy(() => import('../_handlers/content/forwardable.js')),
      routeKey: 'content/forwardable',
    };
  }
  if (pathname === '/api/v1/me/broadcasts' || pathname === '/api/me/broadcasts') {
    return {
      handler: lazy(() => import('../_handlers/me/broadcasts.js')),
      routeKey: 'me/broadcasts',
    };
  }
  if (pathname === '/api/v1/broadcasts' || pathname === '/api/broadcasts') {
    return { handler: lazy(() => import('../_handlers/broadcasts.js')), routeKey: 'broadcasts' };
  }
  if (pathname === '/api/v1/admin/broadcasts' || pathname === '/api/admin/broadcasts') {
    return {
      handler: lazy(() => import('../_handlers/admin/broadcasts.js')),
      routeKey: 'admin/broadcasts',
    };
  }
  if (pathname === '/api/v1/me/broadcasts/read-all' || pathname === '/api/me/broadcasts/read-all') {
    return {
      handler: lazy(() => import('../_handlers/me/broadcasts/read-all.js')),
      routeKey: 'me/broadcasts/read-all',
    };
  }
  if (pathname.startsWith('/api/v1/me/broadcasts/') || pathname.startsWith('/api/me/broadcasts/')) {
    const m = pathname.match(/\/me\/broadcasts\/([^/]+)\/read$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/me/broadcasts/[id]/read.js')),
        routeKey: 'me/broadcasts/[id]/read',
      };
    }
  }
  if (pathname === '/api/v1/me/messages' || pathname === '/api/me/messages') {
    return { handler: lazy(() => import('../_handlers/me/messages.js')), routeKey: 'me/messages' };
  }
  if (pathname === '/api/v1/me/messages/read' || pathname === '/api/me/messages/read') {
    return {
      handler: lazy(() => import('../_handlers/me/messages/read.js')),
      routeKey: 'me/messages/read',
    };
  }
  if (pathname === '/api/v1/me/messages/summary' || pathname === '/api/me/messages/summary') {
    return {
      handler: lazy(() => import('../_handlers/me/messages/summary.js')),
      routeKey: 'me/messages/summary',
    };
  }
  if (pathname === '/api/v1/admin/conversations' || pathname === '/api/admin/conversations') {
    return {
      handler: lazy(() => import('../_handlers/admin/conversations.js')),
      routeKey: 'admin/conversations',
    };
  }
  if (pathname === '/api/v1/admin/messages/summary' || pathname === '/api/admin/messages/summary') {
    return {
      handler: lazy(() => import('../_handlers/admin/messages/summary.js')),
      routeKey: 'admin/messages/summary',
    };
  }
  if (
    pathname.startsWith('/api/v1/admin/conversations/') ||
    pathname.startsWith('/api/admin/conversations/')
  ) {
    const m = pathname.match(/\/admin\/conversations\/([^/]+)(\/messages|\/read)?$/);
    if (m) {
      query.memberId = decodeURIComponent(m[1] ?? '');
      if (m[2] === '/messages') {
        return {
          handler: lazy(() => import('../_handlers/admin/conversations/[memberId]/messages.js')),
          routeKey: 'admin/conversations/[memberId]/messages',
        };
      }
      if (m[2] === '/read') {
        return {
          handler: lazy(() => import('../_handlers/admin/conversations/[memberId]/read.js')),
          routeKey: 'admin/conversations/[memberId]/read',
        };
      }
      return {
        handler: lazy(() => import('../_handlers/admin/conversations/[memberId].js')),
        routeKey: 'admin/conversations/[memberId]',
      };
    }
  }
  if (pathname === '/api/v1/me' || pathname === '/api/me') {
    return { handler: lazy(() => import('../_handlers/me.js')), routeKey: 'me' };
  }
  if (pathname === '/api/v1/me/referral-code' || pathname === '/api/me/referral-code') {
    return {
      handler: lazy(() => import('../_handlers/me/referral-code.js')),
      routeKey: 'me/referral-code',
    };
  }
  if (pathname === '/api/v1/customers' || pathname === '/api/customers') {
    return { handler: lazy(() => import('../_handlers/customers.js')), routeKey: 'customers' };
  }
  if (pathname === '/api/v1/sales' || pathname === '/api/sales') {
    return { handler: lazy(() => import('../_handlers/sales.js')), routeKey: 'sales' };
  }
  if (pathname.startsWith('/api/v1/members/') || pathname.startsWith('/api/members/')) {
    const m = pathname.match(/\/members\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/members/[id].js')),
        routeKey: 'members/[id]',
      };
    }
  }
  if (pathname === '/api/v1/admin/registrations' || pathname === '/api/admin/registrations') {
    return {
      handler: lazy(() => import('../_handlers/admin/registrations.js')),
      routeKey: 'admin/registrations',
    };
  }
  if (pathname === '/api/v1/admin/members' || pathname === '/api/admin/members') {
    return {
      handler: lazy(() => import('../_handlers/admin/members.js')),
      routeKey: 'admin/members',
    };
  }
  if (pathname === '/api/v1/admin/members/archived' || pathname === '/api/admin/members/archived') {
    return {
      handler: lazy(() => import('../_handlers/admin/members/archived.js')),
      routeKey: 'admin/members/archived',
    };
  }
  if (pathname === '/api/v1/admin/sales' || pathname === '/api/admin/sales') {
    return { handler: lazy(() => import('../_handlers/admin/sales.js')), routeKey: 'admin/sales' };
  }
  if (pathname === '/api/v1/admin/customers' || pathname === '/api/admin/customers') {
    return {
      handler: lazy(() => import('../_handlers/admin/customers.js')),
      routeKey: 'admin/customers',
    };
  }
  if (pathname === '/api/v1/admin/roles' || pathname === '/api/admin/roles') {
    return { handler: lazy(() => import('../_handlers/admin/roles.js')), routeKey: 'admin/roles' };
  }
  if (pathname === '/api/v1/admin/staff' || pathname === '/api/admin/staff') {
    return { handler: lazy(() => import('../_handlers/admin/staff.js')), routeKey: 'admin/staff' };
  }
  if (pathname === '/api/v1/admin/audit-log' || pathname === '/api/admin/audit-log') {
    return {
      handler: lazy(() => import('../_handlers/admin/audit-log.js')),
      routeKey: 'admin/audit-log',
    };
  }
  if (pathname === '/api/v1/admin/properties' || pathname === '/api/admin/properties') {
    return {
      handler: lazy(() => import('../_handlers/admin/properties.js')),
      routeKey: 'admin/properties',
    };
  }
  if (pathname === '/api/v1/admin/payouts' || pathname === '/api/admin/payouts') {
    return {
      handler: lazy(() => import('../_handlers/admin/payouts.js')),
      routeKey: 'admin/payouts',
    };
  }
  if (pathname === '/api/v1/admin/vouchers' || pathname === '/api/admin/vouchers') {
    return {
      handler: lazy(() => import('../_handlers/admin/vouchers.js')),
      routeKey: 'admin/vouchers',
    };
  }
  if (pathname === '/api/v1/admin/vouchers/assign' || pathname === '/api/admin/vouchers/assign') {
    return {
      handler: lazy(() => import('../_handlers/admin/vouchers/assign.js')),
      routeKey: 'admin/vouchers/assign',
    };
  }
  if (pathname === '/api/v1/admin/vouchers/scan' || pathname === '/api/admin/vouchers/scan') {
    return {
      handler: lazy(() => import('../_handlers/admin/vouchers/scan.js')),
      routeKey: 'admin/vouchers/scan',
    };
  }
  if (
    pathname === '/api/v1/admin/voucher-templates' ||
    pathname === '/api/admin/voucher-templates'
  ) {
    return {
      handler: lazy(() => import('../_handlers/admin/voucher-templates.js')),
      routeKey: 'admin/voucher-templates',
    };
  }
  if (pathname === '/api/v1/admin/adjustments' || pathname === '/api/admin/adjustments') {
    return {
      handler: lazy(() => import('../_handlers/admin/adjustments.js')),
      routeKey: 'admin/adjustments',
    };
  }
  if (pathname === '/api/v1/admin/queues' || pathname === '/api/admin/queues') {
    return {
      handler: lazy(() => import('../_handlers/admin/queues.js')),
      routeKey: 'admin/queues',
    };
  }
  if (pathname === '/api/v1/admin/inquiries' || pathname === '/api/admin/inquiries') {
    return {
      handler: lazy(() => import('../_handlers/admin/inquiries.js')),
      routeKey: 'admin/inquiries',
    };
  }
  if (
    pathname.startsWith('/api/v1/admin/inquiries/') ||
    pathname.startsWith('/api/admin/inquiries/')
  ) {
    const m = pathname.match(/\/inquiries\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/inquiries/[id].js')),
        routeKey: 'admin/inquiries/[id]',
      };
    }
  }
  if (pathname === '/api/v1/admin/withdrawals' || pathname === '/api/admin/withdrawals') {
    return {
      handler: lazy(() => import('../_handlers/admin/withdrawals.js')),
      routeKey: 'admin/withdrawals',
    };
  }
  if (
    pathname === '/api/v1/admin/commissions/clear-due' ||
    pathname === '/api/admin/commissions/clear-due'
  ) {
    return {
      handler: lazy(() => import('../_handlers/admin/commissions/clear-due.js')),
      routeKey: 'admin/commissions/clear-due',
    };
  }
  if (
    pathname === '/api/v1/admin/reports/sales-commissions' ||
    pathname === '/api/admin/reports/sales-commissions'
  ) {
    return {
      handler: lazy(() => import('../_handlers/admin/reports/sales-commissions.js')),
      routeKey: 'admin/reports/sales-commissions',
    };
  }
  if (
    pathname === '/api/v1/admin/reports/summary' ||
    pathname === '/api/admin/reports/summary'
  ) {
    return {
      handler: lazy(() => import('../_handlers/admin/reports/summary.js')),
      routeKey: 'admin/reports/summary',
    };
  }
  if (
    pathname === '/api/v1/admin/reports/sales-trend' ||
    pathname === '/api/admin/reports/sales-trend'
  ) {
    return {
      handler: lazy(() => import('../_handlers/admin/reports/sales-trend.js')),
      routeKey: 'admin/reports/sales-trend',
    };
  }
  if (
    pathname === '/api/v1/crons/commission-clearing' ||
    pathname === '/crons/commission-clearing'
  ) {
    return {
      handler: lazy(() => import('../_handlers/crons/commission-clearing.js')),
      routeKey: 'crons/commission-clearing',
    };
  }
  if (pathname === '/api/v1/me/wallet' || pathname === '/api/me/wallet') {
    return { handler: lazy(() => import('../_handlers/me/wallet.js')), routeKey: 'me/wallet' };
  }
  if (pathname === '/api/v1/me/ledger' || pathname === '/api/me/ledger') {
    return { handler: lazy(() => import('../_handlers/me/ledger.js')), routeKey: 'me/ledger' };
  }
  if (pathname === '/api/v1/me/commissions' || pathname === '/api/me/commissions') {
    return {
      handler: lazy(() => import('../_handlers/me/commissions.js')),
      routeKey: 'me/commissions',
    };
  }
  if (pathname === '/api/v1/me/payout-accounts' || pathname === '/api/me/payout-accounts') {
    return {
      handler: lazy(() => import('../_handlers/me/payout-accounts.js')),
      routeKey: 'me/payout-accounts',
    };
  }
  if (pathname === '/api/v1/me/withdrawals' || pathname === '/api/me/withdrawals') {
    return {
      handler: lazy(() => import('../_handlers/me/withdrawals.js')),
      routeKey: 'me/withdrawals',
    };
  }
  if (pathname === '/api/v1/me/vouchers' || pathname === '/api/me/vouchers') {
    return { handler: lazy(() => import('../_handlers/me/vouchers.js')), routeKey: 'me/vouchers' };
  }
  if (pathname === '/api/v1/me/qualification' || pathname === '/api/me/qualification') {
    return {
      handler: lazy(() => import('../_handlers/me/qualification.js')),
      routeKey: 'me/qualification',
    };
  }
  if (pathname === '/api/v1/me/direct-referrals' || pathname === '/api/me/direct-referrals') {
    return {
      handler: lazy(() => import('../_handlers/me/direct-referrals.js')),
      routeKey: 'me/direct-referrals',
    };
  }
  if (
    pathname === '/api/v1/me/reports/group-network' ||
    pathname === '/api/me/reports/group-network'
  ) {
    return {
      handler: lazy(() => import('../_handlers/me/reports/group-network.js')),
      routeKey: 'me/reports/group-network',
    };
  }
  if (pathname === '/api/v1/me/genealogy' || pathname === '/api/me/genealogy') {
    return {
      handler: lazy(() => import('../_handlers/me/genealogy.js')),
      routeKey: 'me/genealogy',
    };
  }
  if (pathname === '/api/v1/me/resubmit' || pathname === '/api/me/resubmit') {
    return { handler: lazy(() => import('../_handlers/me/resubmit.js')), routeKey: 'me/resubmit' };
  }
  if (
    pathname === '/api/v1/admin/property-categories' ||
    pathname === '/api/admin/property-categories'
  ) {
    return {
      handler: lazy(() => import('../_handlers/admin/property-categories.js')),
      routeKey: 'admin/property-categories',
    };
  }
  if (pathname.startsWith('/api/v1/me/sales/') || pathname.startsWith('/api/me/sales/')) {
    const m = pathname.match(/\/me\/sales\/([^/]+)\/reopen-request$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/me/sales/[id]/reopen-request.js')),
        routeKey: 'me/sales/reopen-request',
      };
    }
  }
  if (pathname.startsWith('/api/v1/sales/') || pathname.startsWith('/api/sales/')) {
    const resubmit = pathname.match(/\/sales\/([^/]+)\/resubmit$/);
    if (resubmit) {
      query.id = decodeURIComponent(resubmit[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/sales/[id]/resubmit.js')),
        routeKey: 'sales/resubmit',
      };
    }
    const m = pathname.match(/\/sales\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: lazy(() => import('../_handlers/sales/[id].js')), routeKey: 'sales/[id]' };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/registrations/') ||
    pathname.startsWith('/api/admin/registrations/')
  ) {
    const govId = pathname.match(/\/registrations\/([^/]+)\/government-id$/);
    const approve = pathname.match(/\/registrations\/([^/]+)\/approve$/);
    const reject = pathname.match(/\/registrations\/([^/]+)\/reject$/);
    const one = pathname.match(/\/registrations\/([^/]+)$/);
    if (govId) {
      query.id = decodeURIComponent(govId[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/registrations/[id]/government-id.js')),
        routeKey: 'admin/registrations/government-id',
      };
    }
    if (approve) {
      query.id = decodeURIComponent(approve[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/registrations/[id]/approve.js')),
        routeKey: 'admin/registrations/approve',
      };
    }
    if (reject) {
      query.id = decodeURIComponent(reject[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/registrations/[id]/reject.js')),
        routeKey: 'admin/registrations/reject',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/registrations/[id].js')),
        routeKey: 'admin/registrations/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/admin/members/') || pathname.startsWith('/api/admin/members/')) {
    const archive = pathname.match(/\/members\/([^/]+)\/archive$/);
    const restore = pathname.match(/\/members\/([^/]+)\/restore$/);
    const one = pathname.match(/\/members\/([^/]+)$/);
    if (archive) {
      query.id = decodeURIComponent(archive[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/members/[id]/archive.js')),
        routeKey: 'admin/members/archive',
      };
    }
    if (restore) {
      query.id = decodeURIComponent(restore[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/members/[id]/restore.js')),
        routeKey: 'admin/members/restore',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/members/[id].js')),
        routeKey: 'admin/members/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/admin/sales/') || pathname.startsWith('/api/admin/sales/')) {
    const m = pathname.match(/\/sales\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/sales/[id].js')),
        routeKey: 'admin/sales/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/properties/') ||
    pathname.startsWith('/api/admin/properties/')
  ) {
    const m = pathname.match(/\/properties\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/properties/[id].js')),
        routeKey: 'admin/properties/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/voucher-templates/') ||
    pathname.startsWith('/api/admin/voucher-templates/')
  ) {
    const m = pathname.match(/\/voucher-templates\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/voucher-templates/[id].js')),
        routeKey: 'admin/voucher-templates/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/vouchers/') ||
    pathname.startsWith('/api/admin/vouchers/')
  ) {
    const redeem = pathname.match(/\/vouchers\/([^/]+)\/redeem$/);
    const one = pathname.match(/\/vouchers\/([^/]+)$/);
    if (redeem) {
      query.id = decodeURIComponent(redeem[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/vouchers/[id]/redeem.js')),
        routeKey: 'admin/vouchers/[id]/redeem',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/vouchers/[id].js')),
        routeKey: 'admin/vouchers/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/property-categories/') ||
    pathname.startsWith('/api/admin/property-categories/')
  ) {
    const m = pathname.match(/\/property-categories\/([^/]+)$/);
    if (m) {
      query.slug = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/property-categories/[slug].js')),
        routeKey: 'admin/property-categories/[slug]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/vouchers/') || pathname.startsWith('/api/vouchers/')) {
    const m = pathname.match(/\/vouchers\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/vouchers/[id].js')),
        routeKey: 'vouchers/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/admin/payouts/') || pathname.startsWith('/api/admin/payouts/')) {
    const m = pathname.match(/\/payouts\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/payouts/[id].js')),
        routeKey: 'admin/payouts/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/withdrawals/') ||
    pathname.startsWith('/api/admin/withdrawals/')
  ) {
    const complete = pathname.match(/\/withdrawals\/([^/]+)\/complete$/);
    const reject = pathname.match(/\/withdrawals\/([^/]+)\/reject$/);
    const one = pathname.match(/\/withdrawals\/([^/]+)$/);
    if (complete) {
      query.id = decodeURIComponent(complete[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/withdrawals/[id]/complete.js')),
        routeKey: 'admin/withdrawals/complete',
      };
    }
    if (reject) {
      query.id = decodeURIComponent(reject[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/withdrawals/[id]/reject.js')),
        routeKey: 'admin/withdrawals/reject',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/withdrawals/[id].js')),
        routeKey: 'admin/withdrawals/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/me/payout-accounts/') ||
    pathname.startsWith('/api/me/payout-accounts/')
  ) {
    const m = pathname.match(/\/payout-accounts\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/me/payout-accounts/[id].js')),
        routeKey: 'me/payout-accounts/[id]',
      };
    }
  }
  if (
    pathname.startsWith('/api/v1/me/withdrawals/') ||
    pathname.startsWith('/api/me/withdrawals/')
  ) {
    const m = pathname.match(/\/withdrawals\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/me/withdrawals/[id].js')),
        routeKey: 'me/withdrawals/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/admin/roles/') || pathname.startsWith('/api/admin/roles/')) {
    const m = pathname.match(/\/roles\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/roles/[id].js')),
        routeKey: 'admin/roles/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/admin/staff/') || pathname.startsWith('/api/admin/staff/')) {
    const m = pathname.match(/\/staff\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/staff/[id].js')),
        routeKey: 'admin/staff/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/programs/') || pathname.startsWith('/api/programs/')) {
    const m = pathname.match(/\/programs\/([^/]+)\/qualification-questions$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/programs/[id]/questions.js')),
        routeKey: 'programs/questions',
      };
    }
  }
  if (pathname.startsWith('/api/v1/policies/') || pathname.startsWith('/api/policies/')) {
    const m = pathname.match(/\/policies\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/policies/[id].js')),
        routeKey: 'policies/[id]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/admin/config/') || pathname.startsWith('/api/admin/config/')) {
    const m = pathname.match(/\/admin\/config\/([^/]+)$/);
    if (m) {
      query.key = decodeURIComponent(m[1] ?? '');
      return {
        handler: lazy(() => import('../_handlers/admin/config/[key].js')),
        routeKey: 'admin/config/[key]',
      };
    }
  }
  const cmsMatch = pathname.match(/\/cms\/([^/]+)$/);
  if (cmsMatch) {
    query.key = decodeURIComponent(cmsMatch[1] ?? '');
    return {
      handler: lazy(() => import('../_handlers/cms/[key].js')),
      routeKey: query.key ?? null,
    };
  }
  return null;
}

type RoutableRequest = { url?: string; query: VercelRequest['query'] };

/**
 * Resolve the API path to route on. `vercel.json` rewrites `/api/v1/:path*`
 * to `/api/router?path=:path*`; some runtimes expose the original URL while
 * others expose the rewritten one. Prefer the original `/api/v1/...` URL
 * (keeps its query string) and otherwise rebuild it from the captured `path`.
 */
export function resolveRequestUrl(req: RoutableRequest): string {
  const originalUrl = req.url ?? '/';
  const captured = req.query.path;
  const capturedPath = Array.isArray(captured) ? captured.join('/') : captured;
  if (/^\/api\/v1(\/|\?|$)/.test(originalUrl)) return originalUrl;
  if (capturedPath) return `/api/v1/${capturedPath}`;
  return originalUrl;
}

/**
 * Dispatch a request to the matching handler. Returns `true` when a handler
 * matched (its response is already written via `res`), `false` when no route
 * exists - the caller is responsible for the 404.
 */
export async function routeRequest(
  req: VercelRequest & { url?: string },
  res: VercelResponse,
): Promise<boolean> {
  const pathname = resolveRequestUrl(req).split('?')[0] ?? '/';
  const match = selectHandler(pathname, req.query);
  if (!match) return false;
  try {
    await match.handler(req as VercelRequest, res);
  } catch (e) {
    const err = e as Error;
    console.error(
      `[api] handler error for ${req.method ?? 'GET'} ${pathname}:`,
      err?.message ?? err,
    );
    try {
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
    } catch {
      // Response already sent - nothing more we can do.
    }
  }
  return true;
}
