import { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { useSession } from '../../../lib/session';
import { AppShell, Breadcrumbs, ConfirmDialog, UserMenu } from '@jad/ui';

import { NotificationBell } from '../components/NotificationBell';
import { MemberBottomNav } from '../components/MemberBottomNav';
import { useNotificationsRealtime } from '../hooks/useNotificationsRealtime';
import { findMemberNavItem, memberSidebarItems } from '../navigation';
import styles from './MemberLayout.module.css';

/**
 * Member app shell: persistent sidebar on desktop, drawer on tablet/mobile
 * (UI-UX §4), mobile bottom nav with a "More" drawer affordance, topbar with
 * the signed-in member identity, breadcrumbs, and the routed page content.
 */
export function MemberLayout() {
  const { user, logout } = useSession();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const location = useLocation();
  const current = findMemberNavItem(location.pathname);
  // Single live subscription for the notification feed (bell + page).
  useNotificationsRealtime(user?.id);

  const crumbs = useMemo(() => {
    if (!current || current.to === '/member') return [];
    return [{ label: 'Dashboard', to: '/member' }, { label: current.label }];
  }, [current]);

  const topbarBrand = (
    <div className={styles.topbarBrand} aria-hidden="true">
      <img src="/ja-d-logo.png" alt="" width={120} height={75} />
    </div>
  );

  return (
    <>
      <AppShell
        brand={
          <div className={styles.brandBlock}>
            <img src="/ja-d-logo.png" alt="JA&D" width={120} height={75} />
            <div className={styles.brandTextBlock}>
              <span className={styles.brandName}>JA&D Realty</span>
              <span className={styles.brandText}>Member Portal</span>
            </div>
          </div>
        }
        navItems={memberSidebarItems()}
        navLabel="Member navigation"
        topbarActions={
          <div className={styles.topbarActions}>
            <NotificationBell />
            <UserMenu
              name={user?.name}
              role={user?.email}
              items={[
                { label: 'My Account', icon: 'user', to: '/member/profile' },
                { label: '-', icon: '' },
                {
                  label: 'Logout',
                  icon: 'logout',
                  danger: true,
                  onClick: () => setShowLogoutConfirm(true),
                },
              ]}
            />
          </div>
        }
        bottomNav={(openDrawer) => <MemberBottomNav onMore={openDrawer} />}
        menuLabel="Open navigation"
        hideMenuOnMobile
        topbarLeading={topbarBrand}
      >
        <div className={styles.content}>
          {crumbs.length > 0 ? <Breadcrumbs items={crumbs} /> : null}
          <Outlet />
        </div>
      </AppShell>
      <ConfirmDialog
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        title="Sign out?"
        message="Are you sure you want to sign out? You will need to sign in again to access your account."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
      />
    </>
  );
}
