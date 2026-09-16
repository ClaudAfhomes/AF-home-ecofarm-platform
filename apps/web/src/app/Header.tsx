import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { useQuery } from '@tanstack/react-query';

import { getGlobalCmsPublic } from '@/lib/cms';
import { LOGO, SITE } from '../features/public/content';
import { isAuthPath } from '../features/auth/content';
import { MobileNavigation } from './MobileNavigation';
import { PublicNavLink } from '../components/PublicNavLink';
import styles from './Header.module.css';

/**
 * Site header: brand logo and responsive primary navigation. Sticky;
 * transparent over the hero (white JA&D logo + white links), then solid
 * deep-navy once scrolled or when the mobile menu is open, so content stays
 * readable on light surfaces (UI-UX §4.6). Property detail pages have no
 * hero backdrop, so the header is always solid brand blue there — as are the
 * auth pages (Login/Register preview, no hero imagery).
 */
export function Header() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: globalCms } = useQuery({
    queryKey: ['cms', 'global'],
    queryFn: getGlobalCmsPublic,
    staleTime: 0,
  });
  const nav = globalCms?.nav ?? SITE.nav;
  const authNav = globalCms?.authNav ?? SITE.auth;
  const rawLogo = globalCms?.logo ?? LOGO;
  // Handle both CmsPhoto (id) and LOGO (src) shapes
  const logo = rawLogo as {
    src?: string;
    id?: string;
    alt: string;
    width?: number;
    height?: number;
  } as typeof LOGO;
  const logoSrc = (logo as { src?: string }).src ?? (logo as { id?: string }).id ?? LOGO.src;
  const siteName = globalCms?.brand?.name ?? SITE.name;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const onPropertyDetail = /^\/properties\/[^/]+\/[^/]+$/.test(pathname);
  const onAuthRoute = isAuthPath(pathname);
  const solid = scrolled || menuOpen || onPropertyDetail || onAuthRoute;

  return (
    <header className={`${styles.header} ${solid ? styles.solid : ''}`}>
      <div className={`container ${styles.inner}`}>
        <PublicNavLink
          to="/"
          className={styles.brand}
          onClick={closeMenu}
          aria-label={`${siteName} — home`}
        >
          <img
            src={logoSrc}
            alt={logo.alt}
            width={(logo as { width?: number }).width ?? LOGO.width}
            height={(logo as { height?: number }).height ?? LOGO.height}
            className={styles.logo}
          />
        </PublicNavLink>
        <MobileNavigation
          items={nav}
          authItems={authNav}
          open={menuOpen}
          onToggle={() => setMenuOpen((open) => !open)}
          onNavigate={closeMenu}
        />
      </div>
    </header>
  );
}
