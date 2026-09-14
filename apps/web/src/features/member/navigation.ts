import type { BottomNavItem, SidebarItem } from '@jad/ui';

/**
 * Member navigation registry (UI-UX §4.1 destinations). Categories group related
 * navlinks under a labeled header with a dropdown arrow, matching the admin
 * panel sidebar pattern. `primary` flags the 5 most frequent destinations
 * shown in the mobile bottom nav (UI-UX §4.6); the full categorized list
 * renders in the sidebar and the drawer ("More").
 */
export interface MemberNavItem extends SidebarItem {
  primary?: boolean;
  dropdown?: { to: string; label: string; end?: boolean }[];
}

/**
 * Categorized member navigation items. Each top-level entry is either a
 * single-page link or a category with a dropdown of sub-items.
 */
export const MEMBER_NAV_ITEMS: MemberNavItem[] = [
  /* Single-page link */
  { to: '/member', label: 'Dashboard', icon: 'grid', end: true, primary: true },

  /* Category: Sales & Earnings (dropdown) — order follows Sale → Commission → eWallet → Withdrawal spine (UI-UX §5.5) */
  {
    to: '/member/sales',
    label: 'Sales & Earnings',
    icon: 'wallet',
    primary: true,
    dropdown: [
      { to: '/member/sales', label: 'Sales' },
      { to: '/member/qualification', label: 'Qualification' },
      { to: '/member/commissions', label: 'Commissions' },
      { to: '/member/ewallet', label: 'eWallet', end: true },
      { to: '/member/ewallet/ledger', label: 'Ledger' },
      { to: '/member/withdrawals', label: 'Withdrawals' },
      { to: '/member/payouts', label: 'Payouts' },
    ],
  },

  /* Category: Referrals (dropdown) */
  {
    to: '/member/referrals',
    label: 'Referrals',
    icon: 'list',
    primary: true,
    dropdown: [
      { to: '/member/referrals/direct', label: 'Direct Referrals' },
      { to: '/member/referrals/network', label: 'Group Network' },
      { to: '/member/referrals/genealogy', label: 'My Genealogy' },
      { to: '/member/referrals/earned', label: 'Total Earned' },
    ],
  },

  /* Category: Resources (dropdown) */
  {
    to: '/member/vouchers',
    label: 'Resources',
    icon: 'bell',
    dropdown: [
      { to: '/member/vouchers', label: 'Vouchers' },
      { to: '/member/marketing-tools', label: 'Marketing Tools' },
      { to: '/member/policies', label: 'Policies' },
      { to: '/member/notifications', label: 'Notifications' },
    ],
  },

  /* Single-page link */
  { to: '/member/profile', label: 'Profile', icon: 'user' },
];

export function memberSidebarItems(): SidebarItem[] {
  return MEMBER_NAV_ITEMS.map((item) => ({
    to: item.to,
    label: item.label,
    icon: item.icon,
    end: item.end,
    badge: item.badge,
    dropdown: item.dropdown,
  }));
}

export function memberBottomNavItems(): BottomNavItem[] {
  return MEMBER_NAV_ITEMS.filter((item) => item.primary).map((item) => ({
    to: item.to,
    label: item.label,
    icon: item.icon,
    end: item.end,
  }));
}

export function findMemberNavItem(pathname: string): MemberNavItem | undefined {
  const exact = MEMBER_NAV_ITEMS.find((item) => item.to === pathname);
  if (exact) return exact;
  return MEMBER_NAV_ITEMS.find(
    (item) =>
      item.to !== '/member' &&
      (pathname.startsWith(`${item.to}/`) ||
        item.dropdown?.some((sub) => pathname === sub.to || pathname.startsWith(`${sub.to}/`))),
  );
}
