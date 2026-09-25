import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import { fetchSuperAdminDashboard } from '../services/operations';
import { breadcrumbItems, navigation, visibleNavigation, type NavigationGroup, type NavigationItem } from './navigation';

function readGroups(storageKey: string) {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, boolean>; }
  catch { return {}; }
}

function Breadcrumbs({ pathname, groups }: { pathname: string; groups: NavigationGroup[] }) {
  const items = breadcrumbItems(pathname, groups);
  if (!items.length) return null;
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item,index) => <li key={`${item.label}-${index}`}>{item.to && index < items.length-1 ? <NavLink to={item.to}>{item.label}</NavLink> : <span aria-current={index===items.length-1?'page':undefined}>{item.label}</span>}</li>)}</ol></nav>;
}

export function AppShell() {
  const { profile, role, permissions, signOut } = useAuth();
  const location = useLocation();
  const storagePrefix = `afhomes.sidebar.${profile?.id ?? 'anonymous'}`;
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(()=>localStorage.getItem(`${storagePrefix}.collapsed`)==='true');
  const [openGroup,setOpenGroup]=useState<string|null>(()=>{const stored=readGroups(`${storagePrefix}.groups`);return Object.keys(stored).find((key)=>stored[key])??null;});
  const [userMenuOpen,setUserMenuOpen]=useState(false);
  const visibleGroups=useMemo(()=>visibleNavigation(navigation,permissions,role),[permissions,role]);
  const analyticsRange=useMemo(()=>{const to=new Date();const from=new Date(to);from.setDate(from.getDate()-30);return {from:from.toISOString(),to:to.toISOString(),grouping:'week' as const};},[]);
  const queueQuery=useQuery({queryKey:['shell-queue-badges'],queryFn:()=>fetchSuperAdminDashboard(analyticsRange),enabled:role==='super_admin',staleTime:60_000,refetchInterval:120_000});

  useEffect(()=>localStorage.setItem(`${storagePrefix}.collapsed`,String(collapsed)),[collapsed,storagePrefix]);
  useEffect(()=>localStorage.setItem(`${storagePrefix}.groups`,JSON.stringify(openGroup?{[openGroup]:true}:{})),[openGroup,storagePrefix]);
  const itemBadge=(item:NavigationItem)=>item.badgeKeys?.reduce((sum,key)=>sum+(queueQuery.data?.queues[key].count??0),0)??0;
  const closeNavigation=()=>{setDrawerOpen(false);setUserMenuOpen(false);};
  const roleLabel=role?.replaceAll('_',' ');
  const roleUnresolved=Boolean(profile&&visibleGroups.length===0);

  return <div className={collapsed?'app-shell sidebar-collapsed':'app-shell'}>
    <aside className={drawerOpen?'sidebar open':'sidebar'} aria-label="Primary navigation">
      <div className="sidebar-head"><NavLink className="brand-mark" to="/" onClick={closeNavigation}><BrandLogo compact={collapsed}/>{collapsed?null:<small className="sidebar-brand-subtitle">Admin Panel</small>}<span className="sr-only">AF Homes dashboard</span></NavLink><button className="icon-button close-menu" onClick={()=>setDrawerOpen(false)} aria-label="Close navigation"><X/></button></div>
      <nav><ul className="nav-list">{visibleGroups.map((group)=>{
        const active=group.items.some((item)=>location.pathname===item.to||(item.to!=='/'&&location.pathname.startsWith(`${item.to}/`)));
        if(group.standalone){const item=group.items[0];return item?<li key={group.id}><NavLink className="nav-direct" to={item.to} end onClick={closeNavigation}><item.icon/><span>{item.label}</span></NavLink></li>:null;}
        const expanded=!collapsed&&(openGroup===group.id||active);
        return <li className={active?'nav-section active':'nav-section'} key={group.id}><button className="nav-group-toggle" type="button" onClick={()=>setOpenGroup((current)=>current===group.id?null:group.id)} aria-expanded={expanded} title={collapsed?group.label:undefined}><group.icon/><span>{group.label}</span>{expanded?<ChevronDown className="group-chevron"/>:<ChevronRight className="group-chevron"/>}</button><ul className={expanded?'nav-items expanded':'nav-items'} aria-hidden={!expanded}>{group.items.map((item)=>{const badge=itemBadge(item);return <li key={item.to}><NavLink to={item.to} end={item.to==='/' } title={collapsed?item.label:undefined} onClick={closeNavigation}><item.icon/><span>{item.label}</span>{badge>0?<b className="nav-badge" aria-label={`${badge} pending`}>{badge}</b>:null}</NavLink></li>;})}</ul></li>;
      })}</ul></nav>
      <div className="sidebar-footer"><button className="signout" onClick={()=>void signOut()} title={collapsed?'Sign out':undefined}><LogOut/><span>Sign out</span></button></div>
    </aside>
    {drawerOpen?<button className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setDrawerOpen(false)}/>:null}
    <div className="app-main"><header className="topbar"><button className="icon-button menu-button" onClick={()=>setDrawerOpen(true)} aria-label="Open navigation"><Menu/></button><button className="icon-button desktop-sidebar-toggle" onClick={()=>setCollapsed((value)=>!value)} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</button><div className="topbar-brand"><p>AF Homes Ecofarm</p><span>Operations Control Center</span></div><div className="topbar-actions"><div className="user-menu-wrap"><button className="user-menu" onClick={()=>setUserMenuOpen((value)=>!value)} aria-expanded={userMenuOpen} aria-haspopup="menu"><span>{profile?.full_name.slice(0,2).toUpperCase()??'AF'}</span><div><strong>{profile?.full_name??'Staff user'}</strong><small>{roleLabel}{profile?.is_test_account?' · Test Account':''}</small></div><ChevronDown/></button>{userMenuOpen?<div className="user-dropdown" role="menu"><div><strong>{profile?.full_name}</strong><span>{profile?.email}</span><small>Role: {roleLabel}</small></div><button role="menuitem" onClick={()=>void signOut()}><LogOut/>Sign out</button></div>:null}</div></div></header><Breadcrumbs pathname={location.pathname} groups={visibleGroups}/>{roleUnresolved?<div className="access-notice" role="alert"><strong>Navigation unavailable</strong><span>Your account has no resolved modules. Reload or ask a Super Admin to review your permissions.</span><button onClick={()=>window.location.reload()}>Reload</button></div>:null}<main className="content"><Outlet/></main></div>
  </div>;
}
