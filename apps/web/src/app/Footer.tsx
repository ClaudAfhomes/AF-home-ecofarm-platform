import { Link, NavLink } from 'react-router';

import { useQuery } from '@tanstack/react-query';

import { getGlobalCmsPublic } from '@/lib/cms';
import { CONTACT, LOGO, SITE } from '../features/public/content';
import {
  PRIVACY_POLICY_ID,
  TERMS_POLICY_ID,
  policyPath,
} from '../features/public/content/policies';
import styles from './Footer.module.css';

/**
 * Site footer: brand + statement, primary navigation, and contact details.
 * Contact details follow the legacy website supplied by the project owner.
 */
export function Footer() {
  const { data: globalCms } = useQuery({
    queryKey: ['cms', 'global'],
    queryFn: getGlobalCmsPublic,
    staleTime: 0,
  });
  const footerBrandLine = globalCms?.footer?.brandLine ?? SITE.footer.brandLine;
  const footerNav = globalCms?.nav ?? SITE.nav;
  const footerContacts = globalCms?.footer?.contacts ?? CONTACT.details;
  const siteName = globalCms?.brand?.name ?? SITE.name;
  const positioningLine = globalCms?.brand?.positioningLine ?? SITE.positioning.line;
  const rawLogo = globalCms?.logo ?? LOGO;
  const logo = rawLogo as typeof LOGO;
  const logoSrc =
    (rawLogo as { src?: string; id?: string }).src ?? (rawLogo as { id?: string }).id ?? LOGO.src;
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brandColumn}>
          <img
            src={logoSrc}
            alt={logo.alt}
            width={(logo as { width?: number }).width ?? LOGO.width}
            height={(logo as { height?: number }).height ?? LOGO.height}
            className={styles.logo}
          />
          <p className={styles.brandLine}>{footerBrandLine}</p>
        </div>

        <nav aria-label="Footer">
          <h2 className={styles.columnHeading}>Explore</h2>
          <ul className={styles.linkList}>
            {footerNav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={styles.link} end={item.to === '/'}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.contactColumn}>
          <h2 className={styles.columnHeading}>Contact</h2>
          <ul className={styles.contactList}>
            {footerContacts.map((detail) => (
              <li key={detail.label}>
                <span className={styles.contactLabel}>{detail.label}</span>
                <span className={styles.contactValue}>{detail.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={`container ${styles.bottomInner}`}>
          <p className={styles.legal}>
            © {new Date().getFullYear()} {siteName}. All rights reserved.
          </p>
          <ul className={styles.legalLinks} aria-label="Legal">
            <li>
              <Link className={styles.legalLink} to={policyPath(TERMS_POLICY_ID)}>
                Terms
              </Link>
            </li>
            <li>
              <Link className={styles.legalLink} to={policyPath(PRIVACY_POLICY_ID)}>
                Privacy Policy
              </Link>
            </li>
          </ul>
          <p className={styles.tagline}>{positioningLine}.</p>
        </div>
      </div>
    </footer>
  );
}
