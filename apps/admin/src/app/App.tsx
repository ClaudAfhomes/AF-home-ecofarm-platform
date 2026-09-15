import { NotFound } from '@jad/ui';
import { Navigate, Route, Routes } from 'react-router';

import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { RegistrationsPage } from '../features/registrations/pages/RegistrationsPage';
import { RegistrationDetailPage } from '../features/registrations/pages/RegistrationDetailPage';
import { MembersPage } from '../features/members/pages/MembersPage';
import { MemberDetailPage } from '../features/members/pages/MemberDetailPage';
import { SalesPage } from '../features/sales/pages/SalesPage';
import { SaleDetailPage } from '../features/sales/pages/SaleDetailPage';
import { PayoutsPage } from '../features/payouts/pages/PayoutsPage';
import { WithdrawalsPage } from '../features/withdrawals/pages/WithdrawalsPage';
import { VouchersPage } from '../features/vouchers/pages/VouchersPage';
import { VoucherDetailPage } from '../features/vouchers/pages/VoucherDetailPage';
import { ScanVoucherPage } from '../features/vouchers/pages/ScanVoucherPage';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { CatalogDetailPage } from '../features/catalog/pages/CatalogDetailPage';
import { ContentPage } from '../features/content/pages/ContentPage';
import { MarketingToolDetailPage } from '../features/content/pages/MarketingToolDetailPage';
import { BroadcastsPage } from '../features/broadcasts/pages/BroadcastsPage';
import { InboxPage } from '../features/messages/pages/InboxPage';
import { ConversationPage } from '../features/messages/pages/ConversationPage';
import { PoliciesPage } from '../features/policies/pages/PoliciesPage';
import { PolicyDetailPage } from '../features/policies/pages/PolicyDetailPage';
import { MyAccountPage } from '../features/account/pages/MyAccountPage';
import { ConfigPage } from '../features/config/pages/ConfigPage';
import { AuditPage } from '../features/audit/pages/AuditPage';
import { StaffPage } from '../features/staff/pages/StaffPage';
import { StaffDetailPage } from '../features/staff/pages/StaffDetailPage';
import { RolesPage } from '../features/roles/pages/RolesPage';
import { RoleDetailPage } from '../features/roles/pages/RoleDetailPage';
import { AuditDetailPage } from '../features/audit/pages/AuditDetailPage';
import { CmsAboutPage } from '../features/cms/pages/CmsAboutPage';
import { CmsContactPage } from '../features/cms/pages/CmsContactPage';
import { CmsFaqsPage } from '../features/cms/pages/CmsFaqsPage';
import { CmsGlobalPage } from '../features/cms/pages/CmsGlobalPage';
import { CmsHomepagePage } from '../features/cms/pages/CmsHomepagePage';
import { CmsPropertiesPage } from '../features/cms/pages/CmsPropertiesPage';
import { CmsLoginPage } from '../features/cms/pages/CmsLoginPage';
import { CmsRegisterPage } from '../features/cms/pages/CmsRegisterPage';
import { AdminLayout } from './AdminLayout';
import { ErrorBoundary } from './ErrorBoundary';
import { RequireRole } from './RequireRole';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route
            path="/admin"
            element={
              <RequireRole>
                <DashboardPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/registrations"
            element={
              <RequireRole>
                <RegistrationsPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/registrations/:id"
            element={
              <RequireRole>
                <RegistrationDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/members"
            element={
              <RequireRole>
                <MembersPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/members/:id"
            element={
              <RequireRole>
                <MemberDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/sales"
            element={
              <RequireRole>
                <SalesPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/sales/:id"
            element={
              <RequireRole>
                <SaleDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/payouts"
            element={
              <RequireRole>
                <PayoutsPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/withdrawals"
            element={
              <RequireRole>
                <WithdrawalsPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/vouchers"
            element={
              <RequireRole>
                <VouchersPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/vouchers/scan"
            element={
              <RequireRole>
                <ScanVoucherPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/vouchers/:id"
            element={
              <RequireRole>
                <VoucherDetailPage />
              </RequireRole>
            }
          />

          <Route
            path="/admin/properties"
            element={
              <RequireRole>
                <CatalogPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/properties/:id"
            element={
              <RequireRole>
                <CatalogDetailPage />
              </RequireRole>
            }
          />
          <Route path="/admin/content" element={<Navigate to="/admin/marketing-tools" replace />} />
          <Route
            path="/admin/marketing-tools"
            element={
              <RequireRole>
                <ContentPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/marketing-tools/:id"
            element={
              <RequireRole>
                <MarketingToolDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/broadcasts"
            element={
              <RequireRole>
                <BroadcastsPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/messages"
            element={
              <RequireRole>
                <InboxPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/messages/:memberId"
            element={
              <RequireRole>
                <ConversationPage />
              </RequireRole>
            }
          />
          <Route path="/admin/adjustments" element={<Navigate to="/admin/audit" replace />} />
          <Route
            path="/admin/policies"
            element={
              <RequireRole>
                <PoliciesPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/policies/:id"
            element={
              <RequireRole>
                <PolicyDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <RequireRole>
                <MyAccountPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/config"
            element={
              <RequireRole>
                <ConfigPage />
              </RequireRole>
            }
          />
          <Route path="/admin/programs" element={<Navigate to="/admin/config" replace />} />
          <Route
            path="/admin/audit"
            element={
              <RequireRole>
                <AuditPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/audit/:id"
            element={
              <RequireRole>
                <AuditDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/staff"
            element={
              <RequireRole>
                <StaffPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/staff/:id"
            element={
              <RequireRole>
                <StaffDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <RequireRole>
                <RolesPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/roles/:id"
            element={
              <RequireRole>
                <RoleDetailPage />
              </RequireRole>
            }
          />
          <Route path="/admin/cms" element={<Navigate to="/admin/cms/homepage" replace />} />
          <Route
            path="/admin/cms/homepage"
            element={
              <RequireRole>
                <CmsHomepagePage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/cms/about"
            element={
              <RequireRole>
                <CmsAboutPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/cms/properties"
            element={
              <RequireRole>
                <CmsPropertiesPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/cms/faqs"
            element={
              <RequireRole>
                <CmsFaqsPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/cms/contact"
            element={
              <RequireRole>
                <CmsContactPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/cms/global"
            element={
              <RequireRole>
                <CmsGlobalPage />
              </RequireRole>
            }
          />
          <Route path="/admin/cms/auth" element={<Navigate to="/admin/cms/login" replace />} />
          <Route
            path="/admin/cms/login"
            element={
              <RequireRole>
                <CmsLoginPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/cms/register"
            element={
              <RequireRole>
                <CmsRegisterPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
