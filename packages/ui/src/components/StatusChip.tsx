import { Icon } from './Icon';
import type { IconName } from './Icon';

import styles from './StatusChip.module.css';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusChipProps {
  label: string;
  tone?: StatusTone;
  icon?: IconName;
}

const TONE_ICON: Record<StatusTone, IconName> = {
  neutral: 'info',
  success: 'check',
  warning: 'clock',
  danger: 'alert',
  info: 'info',
};

/**
 * Compact status indicator. Always conveys state with text + icon + color,
 * never color alone (DESIGN-SYSTEM §1.1). Presentational - the status
 * vocabulary comes from the API/contracts, never invented in the UI.
 */
export function StatusChip({ label, tone = 'neutral', icon }: StatusChipProps) {
  return (
    <span className={`${styles.chip} ${styles[tone]}`}>
      <Icon name={icon ?? TONE_ICON[tone]} size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
