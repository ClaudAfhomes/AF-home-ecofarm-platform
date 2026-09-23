import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bell, ChevronDown, Leaf, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { navigation } from './navigation';

export function AppShell() {
  const { profile, role, permissions, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const roleLabel = role?.replaceAll('_', ' ');
  return <div className="app-shell"><aside className={open ? 'sidebar open' : 'sidebar'}><div className="sidebar-head"><div className="brand-mark"><Leaf /> AFhomes</div><button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div><nav aria-label="Primary navigation">{navigation.map((item, index) => 'group' in item ? <p className="nav-group" key={`${item.group}-${index}`}>{item.group}</p> : permissions.has(item.permission) && (!('superAdminOnly' in item) || !item.superAdminOnly || role === 'super_admin') ? <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} end={item.to === '/'}><item.icon /><span>{item.label}</span></NavLink> : null)}</nav><button className="signout" onClick={() => void signOut()}><LogOut /> Sign out</button></aside>{open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}<div className="app-main"><header className="topbar"><button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><div><p>AFhomes Ecofarm</p><span>Internal Operations</span></div><div className="topbar-actions"><button className="icon-button" aria-label="Notifications"><Bell /></button><button className="user-menu"><span>{profile?.full_name.slice(0, 2).toUpperCase() ?? 'AF'}</span><div><strong>{profile?.full_name ?? 'Staff user'}</strong><small>Role: {roleLabel}{profile?.is_test_account ? ' · Test Account' : ''}</small></div><ChevronDown /></button></div></header><main className="content"><Outlet /></main></div></div>;
}
