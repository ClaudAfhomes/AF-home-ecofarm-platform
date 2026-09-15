/**
 * Shared API router — single source of the URL→handler table.
 *
 * Both `api/dev-server.ts` (local) and the single Vercel catch-all function
 * `api/v1/[...slug].ts` dispatch through `routeRequest`, so every endpoint is
 * served identically in dev and production. The handler files live under
 * `api/_handlers/**` (underscore-prefixed → Vercel never turns them into
 * functions; they are bundled into the catch-all instead).
 *
 * A new handler must be added BOTH as an import and as a branch here —
 * `api/_lib/route-coverage.ts` fails CI if one is forgotten.
 */
import type { VercelRequest, VercelResponse } from './http.js';

import handlerCms from '../_handlers/cms/[key].js';
import handlerUpload from '../_handlers/cms/upload.js';
import handlerUploadSign from '../_handlers/cms/upload/sign.js';
import handlerLocationVerify from '../_handlers/registration/location-verify.js';
import handlerAuthRegister from '../_handlers/auth/register.js';
import handlerPrograms from '../_handlers/programs.js';
import handlerProgramQuestions from '../_handlers/programs/[id]/questions.js';
import handlerConfigPublic from '../_handlers/config/public.js';
import handlerPolicies from '../_handlers/policies.js';
import handlerPolicyById from '../_handlers/policies/[id].js';
import handlerAdminConfig from '../_handlers/admin/config.js';
import handlerAdminConfigKey from '../_handlers/admin/config/[key].js';
import handlerBroadcasts from '../_handlers/me/broadcasts.js';
import handlerBroadcastCreate from '../_handlers/broadcasts.js';
import handlerAdminBroadcasts from '../_handlers/admin/broadcasts.js';
import handlerMeBroadcastRead from '../_handlers/me/broadcasts/[id]/read.js';
import handlerMeBroadcastsReadAll from '../_handlers/me/broadcasts/read-all.js';
import handlerForwardable from '../_handlers/content/forwardable.js';
import handlerAdminContent from '../_handlers/admin/content.js';
import handlerAdminContentById from '../_handlers/admin/content/[id].js';
import handlerAdminSession from '../_handlers/admin/session.js';
import handlerAdminSessionPassword from '../_handlers/admin/session/password.js';
import handlerAdminRegistrations from '../_handlers/admin/registrations.js';
import handlerAdminRegistrationById from '../_handlers/admin/registrations/[id].js';
import handlerAdminRegistrationApprove from '../_handlers/admin/registrations/[id]/approve.js';
import handlerAdminRegistrationReject from '../_handlers/admin/registrations/[id]/reject.js';
import handlerAdminRegistrationGovId from '../_handlers/admin/registrations/[id]/government-id.js';
import handlerAdminMembers from '../_handlers/admin/members.js';
import handlerAdminMemberById from '../_handlers/admin/members/[id].js';
import handlerAdminMembersArchived from '../_handlers/admin/members/archived.js';
import handlerAdminMemberArchive from '../_handlers/admin/members/[id]/archive.js';
import handlerAdminMemberRestore from '../_handlers/admin/members/[id]/restore.js';
import handlerAdminSales from '../_handlers/admin/sales.js';
import handlerAdminSaleById from '../_handlers/admin/sales/[id].js';
import handlerAdminCustomers from '../_handlers/admin/customers.js';
import handlerAdminRoles from '../_handlers/admin/roles.js';
import handlerAdminRoleById from '../_handlers/admin/roles/[id].js';
import handlerAdminStaff from '../_handlers/admin/staff.js';
import handlerAdminStaffById from '../_handlers/admin/staff/[id].js';
import handlerAdminAuditLog from '../_handlers/admin/audit-log.js';
import handlerAdminProperties from '../_handlers/admin/properties.js';
import handlerAdminPropertyById from '../_handlers/admin/properties/[id].js';
import handlerAdminPayouts from '../_handlers/admin/payouts.js';
import handlerAdminVouchers from '../_handlers/admin/vouchers.js';
import handlerAdminVoucherTemplates from '../_handlers/admin/voucher-templates.js';
import handlerAdminAdjustments from '../_handlers/admin/adjustments.js';
import handlerAdminQueues from '../_handlers/admin/queues.js';
import handlerAdminWithdrawals from '../_handlers/admin/withdrawals.js';
import handlerAdminWithdrawalById from '../_handlers/admin/withdrawals/[id].js';
import handlerAdminWithdrawalComplete from '../_handlers/admin/withdrawals/[id]/complete.js';
import handlerAdminWithdrawalReject from '../_handlers/admin/withdrawals/[id]/reject.js';
import handlerAdminPayoutById from '../_handlers/admin/payouts/[id].js';
import handlerAdminVoucherTemplateById from '../_handlers/admin/voucher-templates/[id].js';
import handlerAdminVoucherAssign from '../_handlers/admin/vouchers/assign.js';
import handlerAdminVoucherScan from '../_handlers/admin/vouchers/scan.js';
import handlerAdminVoucherRedeem from '../_handlers/admin/vouchers/[id]/redeem.js';
import handlerAdminVoucherById from '../_handlers/admin/vouchers/[id].js';
import handlerAdminPropertyCategories from '../_handlers/admin/property-categories.js';
import handlerAdminPropertyCategoryBySlug from '../_handlers/admin/property-categories/[slug].js';
import handlerMeWallet from '../_handlers/me/wallet.js';
import handlerMeLedger from '../_handlers/me/ledger.js';
import handlerMeCommissions from '../_handlers/me/commissions.js';
import handlerMePayoutAccounts from '../_handlers/me/payout-accounts.js';
import handlerMePayoutAccountById from '../_handlers/me/payout-accounts/[id].js';
import handlerMeWithdrawals from '../_handlers/me/withdrawals.js';
import handlerMeWithdrawalById from '../_handlers/me/withdrawals/[id].js';
import handlerMeVouchers from '../_handlers/me/vouchers.js';
import handlerVoucherById from '../_handlers/vouchers/[id].js';
import handlerMeQualification from '../_handlers/me/qualification.js';
import handlerMeDirectReferrals from '../_handlers/me/direct-referrals.js';
import handlerMeGroupNetwork from '../_handlers/me/reports/group-network.js';
import handlerMeGenealogy from '../_handlers/me/genealogy.js';
import handlerMeResubmit from '../_handlers/me/resubmit.js';
import handlerMe from '../_handlers/me.js';
import handlerMeReferralCode from '../_handlers/me/referral-code.js';
import handlerCustomers from '../_handlers/customers.js';
import handlerSales from '../_handlers/sales.js';
import handlerSaleById from '../_handlers/sales/[id].js';
import handlerSaleResubmit from '../_handlers/sales/[id]/resubmit.js';
import handlerSaleReopenRequest from '../_handlers/me/sales/[id]/reopen-request.js';
import handlerMemberById from '../_handlers/members/[id].js';
import handlerMeMessages from '../_handlers/me/messages.js';
import handlerMeMessagesRead from '../_handlers/me/messages/read.js';
import handlerMeMessagesSummary from '../_handlers/me/messages/summary.js';
import handlerAdminConversations from '../_handlers/admin/conversations.js';
import handlerAdminConversationThread from '../_handlers/admin/conversations/[memberId].js';
import handlerAdminConversationMessages from '../_handlers/admin/conversations/[memberId]/messages.js';
import handlerAdminConversationRead from '../_handlers/admin/conversations/[memberId]/read.js';
import handlerAdminMessagesSummary from '../_handlers/admin/messages/summary.js';

type HandlerFn = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

export type RouteMatch = { handler: HandlerFn; routeKey: string | null };

/**
 * Route `pathname` (+ the mutable `query` object to populate path params) to a
 * handler. Supports both `/api/v1/...` and bare `/api/...` prefixes (the bare
 * prefix only matters for the local dev server; Vercel only serves `/api/v1`).
 */
export function selectHandler(
  pathname: string,
  query: Record<string, string | string[] | undefined>,
): RouteMatch | null {
  if (
    pathname === '/api/v1/registration/location-verify' ||
    pathname === '/api/registration/location-verify'
  ) {
    return {
      handler: handlerLocationVerify as HandlerFn,
      routeKey: 'registration/location-verify',
    };
  }
  if (pathname === '/api/v1/auth/register' || pathname === '/api/auth/register') {
    return { handler: handlerAuthRegister as HandlerFn, routeKey: 'auth/register' };
  }
  if (pathname === '/api/v1/cms/upload/sign' || pathname === '/api/cms/upload/sign') {
    return { handler: handlerUploadSign as HandlerFn, routeKey: 'upload/sign' };
  }
  if (pathname === '/api/v1/cms/upload' || pathname === '/api/cms/upload') {
    return { handler: handlerUpload as HandlerFn, routeKey: 'upload' };
  }
  if (pathname === '/api/v1/programs' || pathname === '/api/programs') {
    return { handler: handlerPrograms as HandlerFn, routeKey: 'programs' };
  }
  if (pathname === '/api/v1/config/public' || pathname === '/api/config/public') {
    return { handler: handlerConfigPublic as HandlerFn, routeKey: 'config/public' };
  }
  if (pathname === '/api/v1/policies' || pathname === '/api/policies') {
    return { handler: handlerPolicies as HandlerFn, routeKey: 'policies' };
  }
  if (pathname === '/api/v1/admin/config' || pathname === '/api/admin/config') {
    return { handler: handlerAdminConfig as HandlerFn, routeKey: 'admin/config' };
  }
  if (pathname === '/api/v1/admin/content' || pathname === '/api/admin/content') {
    return { handler: handlerAdminContent as HandlerFn, routeKey: 'admin/content' };
  }
  if (pathname.startsWith('/api/v1/admin/content/') || pathname.startsWith('/api/admin/content/')) {
    const m = pathname.match(/\/content\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminContentById as HandlerFn, routeKey: 'admin/content/[id]' };
    }
  }
  if (pathname === '/api/v1/admin/session' || pathname === '/api/admin/session') {
    return { handler: handlerAdminSession as HandlerFn, routeKey: 'admin/session' };
  }
  if (pathname === '/api/v1/admin/session/password' || pathname === '/api/admin/session/password') {
    return {
      handler: handlerAdminSessionPassword as HandlerFn,
      routeKey: 'admin/session/password',
    };
  }
  if (pathname === '/api/v1/content/forwardable' || pathname === '/api/content/forwardable') {
    return { handler: handlerForwardable as HandlerFn, routeKey: 'content/forwardable' };
  }
  if (pathname === '/api/v1/me/broadcasts' || pathname === '/api/me/broadcasts') {
    return { handler: handlerBroadcasts as HandlerFn, routeKey: 'me/broadcasts' };
  }
  if (pathname === '/api/v1/broadcasts' || pathname === '/api/broadcasts') {
    return { handler: handlerBroadcastCreate as HandlerFn, routeKey: 'broadcasts' };
  }
  if (pathname === '/api/v1/admin/broadcasts' || pathname === '/api/admin/broadcasts') {
    return { handler: handlerAdminBroadcasts as HandlerFn, routeKey: 'admin/broadcasts' };
  }
  if (pathname === '/api/v1/me/broadcasts/read-all' || pathname === '/api/me/broadcasts/read-all') {
    return { handler: handlerMeBroadcastsReadAll as HandlerFn, routeKey: 'me/broadcasts/read-all' };
  }
  if (pathname.startsWith('/api/v1/me/broadcasts/') || pathname.startsWith('/api/me/broadcasts/')) {
    const m = pathname.match(/\/me\/broadcasts\/([^/]+)\/read$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerMeBroadcastRead as HandlerFn, routeKey: 'me/broadcasts/[id]/read' };
    }
  }
  if (pathname === '/api/v1/me/messages' || pathname === '/api/me/messages') {
    return { handler: handlerMeMessages as HandlerFn, routeKey: 'me/messages' };
  }
  if (pathname === '/api/v1/me/messages/read' || pathname === '/api/me/messages/read') {
    return { handler: handlerMeMessagesRead as HandlerFn, routeKey: 'me/messages/read' };
  }
  if (pathname === '/api/v1/me/messages/summary' || pathname === '/api/me/messages/summary') {
    return { handler: handlerMeMessagesSummary as HandlerFn, routeKey: 'me/messages/summary' };
  }
  if (pathname === '/api/v1/admin/conversations' || pathname === '/api/admin/conversations') {
    return { handler: handlerAdminConversations as HandlerFn, routeKey: 'admin/conversations' };
  }
  if (pathname === '/api/v1/admin/messages/summary' || pathname === '/api/admin/messages/summary') {
    return {
      handler: handlerAdminMessagesSummary as HandlerFn,
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
          handler: handlerAdminConversationMessages as HandlerFn,
          routeKey: 'admin/conversations/[memberId]/messages',
        };
      }
      if (m[2] === '/read') {
        return {
          handler: handlerAdminConversationRead as HandlerFn,
          routeKey: 'admin/conversations/[memberId]/read',
        };
      }
      return {
        handler: handlerAdminConversationThread as HandlerFn,
        routeKey: 'admin/conversations/[memberId]',
      };
    }
  }
  if (pathname === '/api/v1/me' || pathname === '/api/me') {
    return { handler: handlerMe as HandlerFn, routeKey: 'me' };
  }
  if (pathname === '/api/v1/me/referral-code' || pathname === '/api/me/referral-code') {
    return { handler: handlerMeReferralCode as HandlerFn, routeKey: 'me/referral-code' };
  }
  if (pathname === '/api/v1/customers' || pathname === '/api/customers') {
    return { handler: handlerCustomers as HandlerFn, routeKey: 'customers' };
  }
  if (pathname === '/api/v1/sales' || pathname === '/api/sales') {
    return { handler: handlerSales as HandlerFn, routeKey: 'sales' };
  }
  if (pathname.startsWith('/api/v1/members/') || pathname.startsWith('/api/members/')) {
    const m = pathname.match(/\/members\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerMemberById as HandlerFn, routeKey: 'members/[id]' };
    }
  }
  if (pathname === '/api/v1/admin/registrations' || pathname === '/api/admin/registrations') {
    return { handler: handlerAdminRegistrations as HandlerFn, routeKey: 'admin/registrations' };
  }
  if (pathname === '/api/v1/admin/members' || pathname === '/api/admin/members') {
    return { handler: handlerAdminMembers as HandlerFn, routeKey: 'admin/members' };
  }
  if (pathname === '/api/v1/admin/members/archived' || pathname === '/api/admin/members/archived') {
    return {
      handler: handlerAdminMembersArchived as HandlerFn,
      routeKey: 'admin/members/archived',
    };
  }
  if (pathname === '/api/v1/admin/sales' || pathname === '/api/admin/sales') {
    return { handler: handlerAdminSales as HandlerFn, routeKey: 'admin/sales' };
  }
  if (pathname === '/api/v1/admin/customers' || pathname === '/api/admin/customers') {
    return { handler: handlerAdminCustomers as HandlerFn, routeKey: 'admin/customers' };
  }
  if (pathname === '/api/v1/admin/roles' || pathname === '/api/admin/roles') {
    return { handler: handlerAdminRoles as HandlerFn, routeKey: 'admin/roles' };
  }
  if (pathname === '/api/v1/admin/staff' || pathname === '/api/admin/staff') {
    return { handler: handlerAdminStaff as HandlerFn, routeKey: 'admin/staff' };
  }
  if (pathname === '/api/v1/admin/audit-log' || pathname === '/api/admin/audit-log') {
    return { handler: handlerAdminAuditLog as HandlerFn, routeKey: 'admin/audit-log' };
  }
  if (pathname === '/api/v1/admin/properties' || pathname === '/api/admin/properties') {
    return { handler: handlerAdminProperties as HandlerFn, routeKey: 'admin/properties' };
  }
  if (pathname === '/api/v1/admin/payouts' || pathname === '/api/admin/payouts') {
    return { handler: handlerAdminPayouts as HandlerFn, routeKey: 'admin/payouts' };
  }
  if (pathname === '/api/v1/admin/vouchers' || pathname === '/api/admin/vouchers') {
    return { handler: handlerAdminVouchers as HandlerFn, routeKey: 'admin/vouchers' };
  }
  if (pathname === '/api/v1/admin/vouchers/assign' || pathname === '/api/admin/vouchers/assign') {
    return { handler: handlerAdminVoucherAssign as HandlerFn, routeKey: 'admin/vouchers/assign' };
  }
  if (pathname === '/api/v1/admin/vouchers/scan' || pathname === '/api/admin/vouchers/scan') {
    return { handler: handlerAdminVoucherScan as HandlerFn, routeKey: 'admin/vouchers/scan' };
  }
  if (
    pathname === '/api/v1/admin/voucher-templates' ||
    pathname === '/api/admin/voucher-templates'
  ) {
    return {
      handler: handlerAdminVoucherTemplates as HandlerFn,
      routeKey: 'admin/voucher-templates',
    };
  }
  if (pathname === '/api/v1/admin/adjustments' || pathname === '/api/admin/adjustments') {
    return { handler: handlerAdminAdjustments as HandlerFn, routeKey: 'admin/adjustments' };
  }
  if (pathname === '/api/v1/admin/queues' || pathname === '/api/admin/queues') {
    return { handler: handlerAdminQueues as HandlerFn, routeKey: 'admin/queues' };
  }
  if (pathname === '/api/v1/admin/withdrawals' || pathname === '/api/admin/withdrawals') {
    return { handler: handlerAdminWithdrawals as HandlerFn, routeKey: 'admin/withdrawals' };
  }
  if (pathname === '/api/v1/me/wallet' || pathname === '/api/me/wallet') {
    return { handler: handlerMeWallet as HandlerFn, routeKey: 'me/wallet' };
  }
  if (pathname === '/api/v1/me/ledger' || pathname === '/api/me/ledger') {
    return { handler: handlerMeLedger as HandlerFn, routeKey: 'me/ledger' };
  }
  if (pathname === '/api/v1/me/commissions' || pathname === '/api/me/commissions') {
    return { handler: handlerMeCommissions as HandlerFn, routeKey: 'me/commissions' };
  }
  if (pathname === '/api/v1/me/payout-accounts' || pathname === '/api/me/payout-accounts') {
    return { handler: handlerMePayoutAccounts as HandlerFn, routeKey: 'me/payout-accounts' };
  }
  if (pathname === '/api/v1/me/withdrawals' || pathname === '/api/me/withdrawals') {
    return { handler: handlerMeWithdrawals as HandlerFn, routeKey: 'me/withdrawals' };
  }
  if (pathname === '/api/v1/me/vouchers' || pathname === '/api/me/vouchers') {
    return { handler: handlerMeVouchers as HandlerFn, routeKey: 'me/vouchers' };
  }
  if (pathname === '/api/v1/me/qualification' || pathname === '/api/me/qualification') {
    return { handler: handlerMeQualification as HandlerFn, routeKey: 'me/qualification' };
  }
  if (pathname === '/api/v1/me/direct-referrals' || pathname === '/api/me/direct-referrals') {
    return { handler: handlerMeDirectReferrals as HandlerFn, routeKey: 'me/direct-referrals' };
  }
  if (
    pathname === '/api/v1/me/reports/group-network' ||
    pathname === '/api/me/reports/group-network'
  ) {
    return { handler: handlerMeGroupNetwork as HandlerFn, routeKey: 'me/reports/group-network' };
  }
  if (pathname === '/api/v1/me/genealogy' || pathname === '/api/me/genealogy') {
    return { handler: handlerMeGenealogy as HandlerFn, routeKey: 'me/genealogy' };
  }
  if (pathname === '/api/v1/me/resubmit' || pathname === '/api/me/resubmit') {
    return { handler: handlerMeResubmit as HandlerFn, routeKey: 'me/resubmit' };
  }
  if (
    pathname === '/api/v1/admin/property-categories' ||
    pathname === '/api/admin/property-categories'
  ) {
    return {
      handler: handlerAdminPropertyCategories as HandlerFn,
      routeKey: 'admin/property-categories',
    };
  }
  if (pathname.startsWith('/api/v1/me/sales/') || pathname.startsWith('/api/me/sales/')) {
    const m = pathname.match(/\/me\/sales\/([^/]+)\/reopen-request$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return {
        handler: handlerSaleReopenRequest as HandlerFn,
        routeKey: 'me/sales/reopen-request',
      };
    }
  }
  if (pathname.startsWith('/api/v1/sales/') || pathname.startsWith('/api/sales/')) {
    const resubmit = pathname.match(/\/sales\/([^/]+)\/resubmit$/);
    if (resubmit) {
      query.id = decodeURIComponent(resubmit[1] ?? '');
      return { handler: handlerSaleResubmit as HandlerFn, routeKey: 'sales/resubmit' };
    }
    const m = pathname.match(/\/sales\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerSaleById as HandlerFn, routeKey: 'sales/[id]' };
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
        handler: handlerAdminRegistrationGovId as HandlerFn,
        routeKey: 'admin/registrations/government-id',
      };
    }
    if (approve) {
      query.id = decodeURIComponent(approve[1] ?? '');
      return {
        handler: handlerAdminRegistrationApprove as HandlerFn,
        routeKey: 'admin/registrations/approve',
      };
    }
    if (reject) {
      query.id = decodeURIComponent(reject[1] ?? '');
      return {
        handler: handlerAdminRegistrationReject as HandlerFn,
        routeKey: 'admin/registrations/reject',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return {
        handler: handlerAdminRegistrationById as HandlerFn,
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
      return { handler: handlerAdminMemberArchive as HandlerFn, routeKey: 'admin/members/archive' };
    }
    if (restore) {
      query.id = decodeURIComponent(restore[1] ?? '');
      return { handler: handlerAdminMemberRestore as HandlerFn, routeKey: 'admin/members/restore' };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return { handler: handlerAdminMemberById as HandlerFn, routeKey: 'admin/members/[id]' };
    }
  }
  if (pathname.startsWith('/api/v1/admin/sales/') || pathname.startsWith('/api/admin/sales/')) {
    const m = pathname.match(/\/sales\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminSaleById as HandlerFn, routeKey: 'admin/sales/[id]' };
    }
  }
  if (
    pathname.startsWith('/api/v1/admin/properties/') ||
    pathname.startsWith('/api/admin/properties/')
  ) {
    const m = pathname.match(/\/properties\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminPropertyById as HandlerFn, routeKey: 'admin/properties/[id]' };
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
        handler: handlerAdminVoucherTemplateById as HandlerFn,
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
        handler: handlerAdminVoucherRedeem as HandlerFn,
        routeKey: 'admin/vouchers/[id]/redeem',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return { handler: handlerAdminVoucherById as HandlerFn, routeKey: 'admin/vouchers/[id]' };
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
        handler: handlerAdminPropertyCategoryBySlug as HandlerFn,
        routeKey: 'admin/property-categories/[slug]',
      };
    }
  }
  if (pathname.startsWith('/api/v1/vouchers/') || pathname.startsWith('/api/vouchers/')) {
    const m = pathname.match(/\/vouchers\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerVoucherById as HandlerFn, routeKey: 'vouchers/[id]' };
    }
  }
  if (pathname.startsWith('/api/v1/admin/payouts/') || pathname.startsWith('/api/admin/payouts/')) {
    const m = pathname.match(/\/payouts\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminPayoutById as HandlerFn, routeKey: 'admin/payouts/[id]' };
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
        handler: handlerAdminWithdrawalComplete as HandlerFn,
        routeKey: 'admin/withdrawals/complete',
      };
    }
    if (reject) {
      query.id = decodeURIComponent(reject[1] ?? '');
      return {
        handler: handlerAdminWithdrawalReject as HandlerFn,
        routeKey: 'admin/withdrawals/reject',
      };
    }
    if (one) {
      query.id = decodeURIComponent(one[1] ?? '');
      return {
        handler: handlerAdminWithdrawalById as HandlerFn,
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
        handler: handlerMePayoutAccountById as HandlerFn,
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
      return { handler: handlerMeWithdrawalById as HandlerFn, routeKey: 'me/withdrawals/[id]' };
    }
  }
  if (pathname.startsWith('/api/v1/admin/roles/') || pathname.startsWith('/api/admin/roles/')) {
    const m = pathname.match(/\/roles\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminRoleById as HandlerFn, routeKey: 'admin/roles/[id]' };
    }
  }
  if (pathname.startsWith('/api/v1/admin/staff/') || pathname.startsWith('/api/admin/staff/')) {
    const m = pathname.match(/\/staff\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminStaffById as HandlerFn, routeKey: 'admin/staff/[id]' };
    }
  }
  if (pathname.startsWith('/api/v1/programs/') || pathname.startsWith('/api/programs/')) {
    const m = pathname.match(/\/programs\/([^/]+)\/qualification-questions$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerProgramQuestions as HandlerFn, routeKey: 'programs/questions' };
    }
  }
  if (pathname.startsWith('/api/v1/policies/') || pathname.startsWith('/api/policies/')) {
    const m = pathname.match(/\/policies\/([^/]+)$/);
    if (m) {
      query.id = decodeURIComponent(m[1] ?? '');
      return { handler: handlerPolicyById as HandlerFn, routeKey: 'policies/[id]' };
    }
  }
  if (pathname.startsWith('/api/v1/admin/config/') || pathname.startsWith('/api/admin/config/')) {
    const m = pathname.match(/\/admin\/config\/([^/]+)$/);
    if (m) {
      query.key = decodeURIComponent(m[1] ?? '');
      return { handler: handlerAdminConfigKey as HandlerFn, routeKey: 'admin/config/[key]' };
    }
  }
  const cmsMatch = pathname.match(/\/cms\/([^/]+)$/);
  if (cmsMatch) {
    query.key = decodeURIComponent(cmsMatch[1] ?? '');
    return { handler: handlerCms as HandlerFn, routeKey: query.key ?? null };
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
 * exists — the caller is responsible for the 404.
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
      // Response already sent — nothing more we can do.
    }
  }
  return true;
}
