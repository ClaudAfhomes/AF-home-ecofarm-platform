import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import styles from './Sidebar.module.css';

/** A decorative divider inside a dropdown (renders as a horizontal rule). */
export interface SidebarDivider {
  divider: true;
}

export type SidebarDropdownItem = { to: string; label: string; end?: boolean } | SidebarDivider;

export interface SidebarItem {
  to: string;
  label: string;
  /** Match the route exactly (NavLink `end`). */
  end?: boolean;
  icon?: IconName;
  /** Queue-style badge (e.g., pending count). */
  badge?: number;
  /** Optional dropdown sub-items rendered as indented links below the header. */
  dropdown?: SidebarDropdownItem[];
}

export interface SidebarProps {
  brand?: ReactNode;
  items: SidebarItem[];
  footer?: ReactNode;
  ariaLabel?: string;
  collapsed?: boolean;
}

/** Primary navigation rail (desktop persistent, reused inside the mobile drawer). */
export function Sidebar({ brand, items, footer, ariaLabel = 'Primary', collapsed }: SidebarProps) {
  const location = useLocation();
  const isItemActive = (item: SidebarItem) =>
    item.dropdown?.some(
      (sub) =>
        !('divider' in sub) &&
        (location.pathname === sub.to || location.pathname.startsWith(`${sub.to}/`)),
    ) ?? false;

  const [openCategory, setOpenCategory] = useState<string | null>(() => {
    const active = items.find((candidate) => isItemActive(candidate));
    return active ? active.to : null;
  });

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      aria-label={ariaLabel}
    >
      {brand ? <div className={styles.brand}>{brand}</div> : null}
      <nav className={styles.nav}>
        <ul className={styles.list}>
          {items.map((item) => {
            if (item.dropdown && item.dropdown.length > 0) {
              const isOpen = collapsed ? false : openCategory === item.to;
              return (
                <CategoryItem
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  open={isOpen}
                  onToggle={() => {
                    if (collapsed) return;
                    setOpenCategory((prev) => (prev === item.to ? null : item.to));
                  }}
                />
              );
            }
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon ? (
                    <span className={styles.icon} aria-hidden="true">
                      <Icon name={item.icon} size={18} />
                    </span>
                  ) : null}
                  <span className={styles.label}>{item.label}</span>
                  {item.badge != null && item.badge > 0 ? (
                    <span className={styles.badge}>{item.badge}</span>
                  ) : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </aside>
  );
}

/** A category header with expandable sub-items. Controlled by parent Sidebar
 *  to enforce accordion behavior (opening one closes the other). */
function CategoryItem({
  item,
  collapsed,
  open,
  onToggle,
}: {
  item: SidebarItem;
  collapsed?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={styles.category}>
      <button
        type="button"
        className={styles.categoryLink}
        onClick={onToggle}
        aria-expanded={collapsed ? undefined : open}
        title={collapsed ? item.label : undefined}
        aria-disabled={collapsed || undefined}
        tabIndex={collapsed ? -1 : undefined}
      >
        {item.icon ? (
          <span className={styles.icon} aria-hidden="true">
            <Icon name={item.icon} size={18} />
          </span>
        ) : null}
        <span className={styles.label}>{item.label}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={styles.chevron}
          style={open ? { transform: 'rotate(0deg)' } : { transform: 'rotate(-90deg)' }}
        />
      </button>
      {open ? (
        <ul className={styles.subList}>
          {item.dropdown?.map((sub) => {
            if ('divider' in sub) {
              return (
                <li key="divider" className={styles.subDivider} aria-hidden="true">
                  <hr className={styles.subDividerHr} />
                </li>
              );
            }
            return (
              <li key={sub.to}>
                <NavLink
                  to={sub.to}
                  end={sub.end}
                  className={({ isActive }) =>
                    `${styles.subLink} ${isActive ? styles.activeSubLink : ''}`
                  }
                >
                  <span className={styles.subLabel}>{sub.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
