import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../_lib/http.js';

import approveRegistration from './admin/registrations/[id]/approve.js';
import rejectRegistration from './admin/registrations/[id]/reject.js';
import getRegistration from './admin/registrations/[id].js';
import listRegistrations from './admin/registrations.js';
import archiveMember from './admin/members/[id]/archive.js';
import restoreMember from './admin/members/[id]/restore.js';
import getMember from './admin/members/[id].js';
import listMembers from './admin/members.js';
import getSaleAdmin from './admin/sales/[id].js';
import listSalesAdmin from './admin/sales.js';
import listAdminCustomers from './admin/customers.js';
import patchMe from './me.js';
import getReferralCode from './me/referral-code.js';
import listCustomers from './customers.js';
import getSale from './sales/[id].js';
import resubmitSale from './sales/[id]/resubmit.js';
import reopenSale from './me/sales/[id]/reopen-request.js';
import listSales from './sales.js';
import getAdminConfig from './admin/config.js';
import patchAdminConfig from './admin/config/[key].js';
import putPolicy from './policies/[id].js';
import getAdminContent from './admin/content.js';
import getAdminSession from './admin/session.js';
import listRoles from './admin/roles.js';
import roleById from './admin/roles/[id].js';
import listStaff from './admin/staff.js';
import staffById from './admin/staff/[id].js';
import listAuditLog from './admin/audit-log.js';
import listProperties from './admin/properties.js';
import getProperty from './admin/properties/[id].js';
import listPayouts from './admin/payouts.js';
import listVouchers from './admin/vouchers.js';
import listVoucherTemplates from './admin/voucher-templates.js';
import listAdjustments from './admin/adjustments.js';
import getQueues from './admin/queues.js';
import listAdminWithdrawals from './admin/withdrawals.js';
import getAdminWithdrawal from './admin/withdrawals/[id].js';
import completeAdminWithdrawal from './admin/withdrawals/[id]/complete.js';
import rejectAdminWithdrawal from './admin/withdrawals/[id]/reject.js';
import reviewAdminPayout from './admin/payouts/[id].js';
import getWallet from './me/wallet.js';
import getLedger from './me/ledger.js';
import getCommissions from './me/commissions.js';
import listMePayoutAccounts from './me/payout-accounts.js';
import mePayoutAccountById from './me/payout-accounts/[id].js';
import listMeWithdrawals from './me/withdrawals.js';
import getMeWithdrawal from './me/withdrawals/[id].js';
import getMeVouchers from './me/vouchers.js';
import getVoucherById from './vouchers/[id].js';
import getMeQualification from './me/qualification.js';
import listDirectReferrals from './me/direct-referrals.js';
import getGroupNetwork from './me/reports/group-network.js';
import getGenealogy from './me/genealogy.js';
import resubmitApplication from './me/resubmit.js';
import voucherTemplatesHandler from './admin/voucher-templates.js';
import voucherTemplateById from './admin/voucher-templates/[id].js';
import registrationGovId from './admin/registrations/[id]/government-id.js';
import assignVoucher from './admin/vouchers/assign.js';
import scanVoucher from './admin/vouchers/scan.js';
import redeemVoucher from './admin/vouchers/[id]/redeem.js';
import voucherById from './admin/vouchers/[id].js';
import createProperty from './admin/properties.js';
import listCategories from './admin/property-categories.js';
import categoryBySlug from './admin/property-categories/[slug].js';
import listInquiries from './admin/inquiries.js';
import inquiryById from './admin/inquiries/[id].js';
import listAdminPrograms from './admin/programs.js';
import programById from './admin/programs/[id].js';

/**
 * Auth-presence matrix (Phase B3): every governed endpoint must reject
 * credential-less requests with 401 before touching any backend.
 * Role differentiation (403s) is covered by verifyStaff unit tests and
 * live role×endpoint checks; these hermetic tests pin the gate's presence.
 */
type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

function capture() {
  const seen: { status?: number; body?: unknown } = {};
  const res: VercelResponse = {
    setHeader: () => {},
    status: (code: number) => {
      seen.status = code;
      return res;
    },
    json: (body: unknown) => {
      seen.body = body;
    },
    end: () => {},
  };
  return { res, seen };
}

const CASES: { name: string; handler: Handler; req: VercelRequest }[] = [
  {
    name: 'GET /admin/registrations',
    handler: listRegistrations,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/registrations/:id',
    handler: getRegistration,
    req: { method: 'GET', query: { id: 'reg-001' }, headers: {} },
  },
  {
    name: 'POST /admin/registrations/:id/approve',
    handler: approveRegistration,
    req: { method: 'POST', query: { id: 'reg-001' }, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/registrations/:id/reject',
    handler: rejectRegistration,
    req: { method: 'POST', query: { id: 'reg-001' }, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/members',
    handler: listMembers,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/members/:id',
    handler: getMember,
    req: { method: 'GET', query: { id: 'mem-001' }, headers: {} },
  },
  {
    name: 'POST /admin/members/:id/archive',
    handler: archiveMember,
    req: { method: 'POST', query: { id: 'mem-001' }, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/members/:id/restore',
    handler: restoreMember,
    req: { method: 'POST', query: { id: 'mem-001' }, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/sales',
    handler: listSalesAdmin,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/sales/:id',
    handler: getSaleAdmin,
    req: { method: 'GET', query: { id: 'sal-001' }, headers: {} },
  },
  {
    name: 'GET /admin/customers',
    handler: listAdminCustomers,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'PATCH /me',
    handler: patchMe,
    req: { method: 'PATCH', query: {}, headers: {}, body: {} },
  },
  {
    name: 'GET /me/referral-code',
    handler: getReferralCode,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /customers',
    handler: listCustomers,
    req: { method: 'GET', query: {}, headers: {} },
  },
  { name: 'GET /sales', handler: listSales, req: { method: 'GET', query: {}, headers: {} } },
  {
    name: 'GET /sales/:id',
    handler: getSale,
    req: { method: 'GET', query: { id: 'sal-001' }, headers: {} },
  },
  {
    name: 'POST /sales/:id/resubmit',
    handler: resubmitSale,
    req: { method: 'POST', query: { id: 'sal-001' }, headers: {}, body: {} },
  },
  {
    name: 'POST /me/sales/:id/reopen-request',
    handler: reopenSale,
    req: { method: 'POST', query: { id: 'sal-001' }, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/config',
    handler: getAdminConfig,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'PATCH /admin/config/:key',
    handler: patchAdminConfig,
    req: { method: 'PATCH', query: { key: 'QUALIFICATION_MIN_AGE' }, headers: {}, body: {} },
  },
  {
    name: 'PUT /policies/:id',
    handler: putPolicy,
    req: { method: 'PUT', query: { id: 'pol-001' }, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/content',
    handler: getAdminContent,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'POST /admin/content',
    handler: getAdminContent,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/session',
    handler: getAdminSession,
    req: { method: 'GET', query: {}, headers: {} },
  },
  { name: 'GET /admin/roles', handler: listRoles, req: { method: 'GET', query: {}, headers: {} } },
  {
    name: 'POST /admin/roles',
    handler: listRoles,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/roles/:id',
    handler: roleById,
    req: { method: 'GET', query: { id: 'admin' }, headers: {} },
  },
  {
    name: 'PATCH /admin/roles/:id',
    handler: roleById,
    req: { method: 'PATCH', query: { id: 'admin' }, headers: {}, body: {} },
  },
  {
    name: 'DELETE /admin/roles/:id',
    handler: roleById,
    req: { method: 'DELETE', query: { id: 'admin' }, headers: {} },
  },
  { name: 'GET /admin/staff', handler: listStaff, req: { method: 'GET', query: {}, headers: {} } },
  {
    name: 'POST /admin/staff',
    handler: listStaff,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/staff/:id',
    handler: staffById,
    req: { method: 'GET', query: { id: 'stf-001' }, headers: {} },
  },
  {
    name: 'PATCH /admin/staff/:id',
    handler: staffById,
    req: { method: 'PATCH', query: { id: 'stf-001' }, headers: {}, body: {} },
  },
  {
    name: 'DELETE /admin/staff/:id',
    handler: staffById,
    req: { method: 'DELETE', query: { id: 'stf-001' }, headers: {} },
  },
  {
    name: 'GET /admin/audit-log',
    handler: listAuditLog,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/properties',
    handler: listProperties,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/registrations/:id/government-id',
    handler: registrationGovId,
    req: { method: 'GET', query: { id: 'reg-001' }, headers: {} },
  },
  {
    name: 'GET /admin/properties/:id',
    handler: getProperty,
    req: { method: 'GET', query: { id: 'p1' }, headers: {} },
  },
  {
    name: 'GET /admin/payouts',
    handler: listPayouts,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/vouchers',
    handler: listVouchers,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/voucher-templates',
    handler: listVoucherTemplates,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/adjustments',
    handler: listAdjustments,
    req: { method: 'GET', query: {}, headers: {} },
  },
  { name: 'GET /admin/queues', handler: getQueues, req: { method: 'GET', query: {}, headers: {} } },
  {
    name: 'GET /admin/withdrawals',
    handler: listAdminWithdrawals,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /admin/withdrawals/:id',
    handler: getAdminWithdrawal,
    req: { method: 'GET', query: { id: 'wdr-001' }, headers: {} },
  },
  {
    name: 'POST /admin/withdrawals/:id/complete',
    handler: completeAdminWithdrawal,
    req: { method: 'POST', query: { id: 'wdr-001' }, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/withdrawals/:id/reject',
    handler: rejectAdminWithdrawal,
    req: { method: 'POST', query: { id: 'wdr-001' }, headers: {}, body: {} },
  },
  {
    name: 'PATCH /admin/payouts/:id',
    handler: reviewAdminPayout,
    req: { method: 'PATCH', query: { id: 'pac-001' }, headers: {}, body: {} },
  },
  { name: 'GET /me/wallet', handler: getWallet, req: { method: 'GET', query: {}, headers: {} } },
  { name: 'GET /me/ledger', handler: getLedger, req: { method: 'GET', query: {}, headers: {} } },
  {
    name: 'GET /me/commissions',
    handler: getCommissions,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /me/payout-accounts',
    handler: listMePayoutAccounts,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'PATCH /me/payout-accounts/:id',
    handler: mePayoutAccountById,
    req: { method: 'PATCH', query: { id: 'pa-001' }, headers: {}, body: {} },
  },
  {
    name: 'GET /me/withdrawals',
    handler: listMeWithdrawals,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'POST /me/withdrawals',
    handler: listMeWithdrawals,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'GET /me/withdrawals/:id',
    handler: getMeWithdrawal,
    req: { method: 'GET', query: { id: 'wdr-001' }, headers: {} },
  },
  {
    name: 'GET /me/vouchers',
    handler: getMeVouchers,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /vouchers/:id',
    handler: getVoucherById,
    req: { method: 'GET', query: { id: 'vch-001' }, headers: {} },
  },
  {
    name: 'GET /me/qualification',
    handler: getMeQualification,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /me/direct-referrals',
    handler: listDirectReferrals,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /me/reports/group-network',
    handler: getGroupNetwork,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'GET /me/genealogy',
    handler: getGenealogy,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'POST /me/resubmit',
    handler: resubmitApplication,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/voucher-templates',
    handler: voucherTemplatesHandler,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'PATCH /admin/voucher-templates/:id',
    handler: voucherTemplateById,
    req: { method: 'PATCH', query: { id: 'vtpl-001' }, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/vouchers/assign',
    handler: assignVoucher,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/vouchers/scan',
    handler: scanVoucher,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'POST /admin/vouchers/:id/redeem',
    handler: redeemVoucher,
    req: { method: 'POST', query: { id: 'vch-001' }, headers: {}, body: {} },
  },
  {
    name: 'DELETE /admin/vouchers/:id',
    handler: voucherById,
    req: { method: 'DELETE', query: { id: 'vch-001' }, headers: {} },
  },
  {
    name: 'POST /admin/properties',
    handler: createProperty,
    req: { method: 'POST', query: {}, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/property-categories',
    handler: listCategories,
    req: { method: 'GET', query: {}, headers: {} },
  },
  {
    name: 'DELETE /admin/property-categories/:slug',
    handler: categoryBySlug,
    req: { method: 'DELETE', query: { slug: 'x' }, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/inquiries',
    handler: listInquiries,
    req: { method: 'GET', query: {}, headers: {}, body: {} },
  },
  {
    name: 'PATCH /admin/inquiries/:id',
    handler: inquiryById,
    req: { method: 'PATCH', query: { id: 'inq-1' }, headers: {}, body: {} },
  },
  {
    name: 'GET /admin/programs',
    handler: listAdminPrograms,
    req: { method: 'GET', query: {}, headers: {}, body: {} },
  },
  {
    name: 'PATCH /admin/programs/:id',
    handler: programById,
    req: { method: 'PATCH', query: { id: 'prg-domestic' }, headers: {}, body: {} },
  },
];

describe('endpoint auth gates', () => {
  beforeEach(() => {
    // Configured env (fake host) so gates reach the credential check;
    // no network is touched because no token is supplied.
    vi.stubEnv('SUPABASE_URL', 'https://matrix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  });

  for (const { name, handler, req } of CASES) {
    it(`${name} rejects credential-less requests with 401`, async () => {
      const { res, seen } = capture();
      await handler(req, res);
      expect(seen.status).toBe(401);
    });
  }
});
