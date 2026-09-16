import type { HTMLAttributes } from 'react';

import styles from './Spinner.module.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /** Accessible label; omit for decorative spinners beside visible text. */
  label?: string;
}

/**
 * Indeterminate activity indicator (DESIGN-SYSTEM). Decorative by default
 * (`aria-hidden`); pass `label` to expose it as a `role="status"` live region.
 * Respects `prefers-reduced-motion` via the global base.css rule.
 */
export function Spinner({ size = 'md', label, className, ...rest }: SpinnerProps) {
  const classes = [styles.spinner, styles[size], className].filter(Boolean).join(' ');
  if (label) {
    return (
      <span className={classes} role="status" aria-label={label} {...rest}>
        <span className={styles.ring} />
      </span>
    );
  }
  return (
    <span className={classes} aria-hidden="true" {...rest}>
      <span className={styles.ring} />
    </span>
  );
}
