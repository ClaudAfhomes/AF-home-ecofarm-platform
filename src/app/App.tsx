import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LoadingState, DeniedState, ErrorState } from '../components/States';
import { AppShell } from './AppShell';
import { ResourcePage } from '../pages/ResourcePage';
import { StatusChip } from '../components/StatusChip';
import { formatMoney } from '../lib/format';
import { PERMISSIONS } from '../lib/permissions';
import type { Customer, Product, Sale } from '../services/operations';
import type { RoleSlug } from '../lib/database.types';

const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const RecoveryPage = lazy(() =>
  import('../pages/LoginPage').then((module) => ({ default: module.RecoveryPage })),
);
const PasswordUpdatePage = lazy(() =>
  import('../pages/LoginPage').then((module) => ({ default: module.PasswordUpdatePage })),
);
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const CustomerCreatePage = lazy(() =>
  import('../pages/CustomerCreatePage').then((module) => ({ default: module.CustomerCreatePage })),
);
const FinancePage = lazy(() =>
  import('../pages/FinancePage').then((module) => ({ default: module.FinancePage })),
);
const GenealogyPage = lazy(() =>
  import('../pages/GenealogyPage').then((module) => ({ default: module.GenealogyPage })),
);
const ReportsPage = lazy(() =>
  import('../pages/ReportsPage').then((module) => ({ default: module.ReportsPage })),
);
const AuditPage = lazy(() =>
  import('../pages/AuditPage').then((module) => ({ default: module.AuditPage })),
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const UsersPage = lazy(() =>
  import('../pages/UsersPage').then((module) => ({ default: module.UsersPage })),
);
const TestAccountsPage = lazy(() => import('../pages/TestAccountsPage').then((module) => ({ default: module.TestAccountsPage })));
const DepartmentsPage = lazy(() =>
  import('../pages/DepartmentsPage').then((module) => ({ default: module.DepartmentsPage })),
);
const PlaceholderPage = lazy(() =>
  import('../pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage })),
);
const QrCreditsPage = lazy(() =>
  import('../pages/QrCreditsPage').then((module) => ({ default: module.QrCreditsPage })),
);
const OstRegistrationPage = lazy(() => import('../pages/OstRegistrationPage').then((module) => ({ default: module.OstRegistrationPage })));
const OstReferralCodesPage = lazy(() => import('../pages/OstReferralCodesPage').then((module) => ({ default: module.OstReferralCodesPage })));
const OstApplicationsPage = lazy(() => import('../pages/OstApplicationsPage').then((module) => ({ default: module.OstApplicationsPage })));

function Protected({ permission, superAdminOnly, roles, children }: { permission?: string; superAdminOnly?: boolean; roles?: RoleSlug[]; children: React.ReactNode }) {
  const { session, profile, role, permissions, loading, error, retry } = useAuth();
  if (loading) return <LoadingState label="Verifying access…" />;
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || !profile.is_active || profile.employment_status !== 'active') return <DeniedState />;
  if (superAdminOnly && role !== 'super_admin') return <DeniedState />;
  if (roles && (!role || !roles.includes(role))) return <DeniedState />;
  if (permission && !permissions.has(permission)) return <DeniedState />;
  return children;
}
export function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recover" element={<RecoveryPage />} />
      <Route path="/accept-invite" element={<PasswordUpdatePage />} />
      <Route path="/reset-password" element={<PasswordUpdatePage />} />
      <Route path="/ost/register" element={<OstRegistrationPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="settings/users"
          element={
            <Protected permission={PERMISSIONS.users}>
              <UsersPage />
            </Protected>
          }
        />
        <Route
          path="settings/test-accounts"
          element={<Protected permission={PERMISSIONS.users} superAdminOnly><TestAccountsPage /></Protected>}
        />
        <Route
          path="settings/departments"
          element={
            <Protected permission={PERMISSIONS.departments} superAdminOnly>
              <DepartmentsPage />
            </Protected>
          }
        />
        <Route
          path="employees"
          element={
            <Protected permission={PERMISSIONS.hr}>
              <PlaceholderPage
                title="Employee management"
                description="Manage employment profiles, status, assignments, and private documents."
              />
            </Protected>
          }
        />
        <Route
          path="products"
          element={
            <Protected permission={PERMISSIONS.products}>
              <ResourcePage<Product>
                title="Products & cards"
                description="A scalable product catalog with configurable pricing and down-payment rules."
                table="products"
                columns={[
                  { key: 'name', label: 'Product' },
                  { key: 'price', label: 'Price', render: (row) => formatMoney(row.price) },
                  {
                    key: 'down_payment_value',
                    label: 'Down payment',
                    render: (row) => formatMoney(row.down_payment_value),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (row) => <StatusChip value={row.status} />,
                  },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="customers"
          element={
            <Protected permission={PERMISSIONS.customers}>
              <ResourcePage<Customer>
                title="Customers"
                description="Internal customer records. Customer documents remain private."
                table="customers"
                action={
                  <a className="button primary" href="/customers/new">
                    Register customer
                  </a>
                }
                columns={[
                  { key: 'customer_no', label: 'Customer no.' },
                  {
                    key: 'name',
                    label: 'Name',
                    render: (row) => `${row.first_name} ${row.last_name}`,
                  },
                  { key: 'phone', label: 'Phone' },
                  { key: 'created_at', label: 'Registered' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="customers/new"
          element={
            <Protected permission={PERMISSIONS.customers}>
              <CustomerCreatePage />
            </Protected>
          }
        />
        <Route
          path="sales"
          element={
            <Protected permission={PERMISSIONS.sales}>
              <ResourcePage<Sale>
                title="Sales records"
                description="Track draft through completed, cancelled, or reversed transactions."
                table="sales"
                columns={[
                  { key: 'sale_no', label: 'Sale no.' },
                  {
                    key: 'total_amount',
                    label: 'Amount',
                    render: (row) => formatMoney(row.total_amount),
                  },
                  { key: 'transaction_type', label: 'Type' },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (row) => <StatusChip value={row.status} />,
                  },
                  { key: 'payment_deadline', label: 'Deadline' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="finance"
          element={
            <Protected permission={PERMISSIONS.finance}>
              <FinancePage />
            </Protected>
          }
        />
        <Route
          path="reports"
          element={
            <Protected permission={PERMISSIONS.reports}>
              <ReportsPage />
            </Protected>
          }
        />
        <Route
          path="vice-director"
          element={
            <Protected permission={PERMISSIONS.genealogy}>
              <DashboardPage viceDirector />
            </Protected>
          }
        />
        <Route
          path="genealogy/members"
          element={
            <Protected permission={PERMISSIONS.genealogy}>
              <GenealogyPage />
            </Protected>
          }
        />
        <Route path="users" element={<Navigate to="/settings/users" replace />} />
        <Route path="departments" element={<Navigate to="/settings/departments" replace />} />
        <Route path="genealogy" element={<Navigate to="/genealogy/members" replace />} />
        <Route
          path="qr-credits"
          element={
            <Protected permission={PERMISSIONS.qrCredits}>
              <QrCreditsPage />
            </Protected>
          }
        />
        <Route path="ost/referrals" element={<Protected roles={['sales_manager']}><OstReferralCodesPage /></Protected>} />
        <Route path="ost/applications" element={<Protected roles={['super_admin','admin','sales_manager']}><OstApplicationsPage /></Protected>} />
        <Route
          path="notifications"
          element={<Protected permission={PERMISSIONS.dashboard}><PlaceholderPage title="Notifications" description="Role-relevant operational alerts and realtime updates." /></Protected>}
        />
        <Route
          path="activity"
          element={
            <Protected permission={PERMISSIONS.audit}>
              <AuditPage />
            </Protected>
          }
        />
        <Route
          path="audit"
          element={
            <Protected permission={PERMISSIONS.audit}>
              <AuditPage />
            </Protected>
          }
        />
        <Route
          path="settings"
          element={
            <Protected permission={PERMISSIONS.settings}>
              <SettingsPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </Suspense>
  );
}
