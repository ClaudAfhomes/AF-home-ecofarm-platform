import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import { navigation, visibleNavigation, type NavigationGroup } from './navigation';

function readGroups(storageKey: string) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function AppShell() {
  const { profile, role, permissions, signOut } = useAuth();
  const location = useLocation();
  const storagePrefix = `afhomes.sidebar.${profile?.id ?? 'anonymous'}`;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(`${storagePrefix}.collapsed`) === 'true');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => readGroups(`${storagePrefix}.groups`));
  const visibleGroups = useMemo(() => visibleNavigation(navigation, permissions, role), [permissions, role]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}.collapsed`, String(collapsed));
  }, [collapsed, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}.groups`, JSON.stringify(openGroups));
  }, [openGroups, storagePrefix]);

  const toggleGroup = (group: NavigationGroup) => {
    setOpenGroups((current) => ({ ...current, [group.id]: !current[group.id] }));
  };
  const closeDrawer = () => setDrawerOpen(false);
  const roleLabel = role?.replaceAll('_', ' ');

  return (
    <div className={collapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      <aside className={drawerOpen ? 'sidebar open' : 'sidebar'} aria-label="Primary navigation">
        <div className="sidebar-head">
          <NavLink className="brand-mark" to="/" onClick={closeDrawer}>
            <BrandLogo compact={collapsed} />
            <span className="sr-only">AF Homes dashboard</span>
          </NavLink>
          <button className="icon-button close-menu" onClick={closeDrawer} aria-label="Close navigation"><X /></button>
        </div>
        <nav>
          {visibleGroups.map((group) => {
            const active = group.items.some((item) => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(`${item.to}/`)));
            const expanded = Boolean(openGroups[group.id]) || active;
            return (
              <section className={active ? 'nav-section active' : 'nav-section'} key={group.id}>
                <button
                  className="nav-group-toggle"
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expanded}
                  title={collapsed ? group.label : undefined}
                >
                  <group.icon />
                  <span>{group.label}</span>
                  {expanded ? <ChevronDown className="group-chevron" /> : <ChevronRight className="group-chevron" />}
                </button>
                <div className={expanded ? 'nav-items expanded' : 'nav-items'} aria-hidden={!expanded}>
                  {group.items.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={closeDrawer} title={collapsed ? item.label : undefined}><item.icon /><span>{item.label}</span></NavLink>)}
                </div>
              </section>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="signout" onClick={() => void signOut()} title={collapsed ? 'Sign out' : undefined}><LogOut /><span>Sign out</span></button>
        </div>
      </aside>
      {drawerOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={closeDrawer} />}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu /></button>
          <button className="icon-button desktop-sidebar-toggle" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          <div><p>AFhomes Ecofarm</p><span>Internal Operations</span></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications"><Bell /></button>
            <button className="user-menu">
              <span>{profile?.full_name.slice(0, 2).toUpperCase() ?? 'AF'}</span>
              <div><strong>{profile?.full_name ?? 'Staff user'}</strong><small>Role: {roleLabel}{profile?.is_test_account ? ' · Test Account' : ''}</small></div>
              <ChevronDown />
            </button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
