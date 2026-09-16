import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Spinner } from './Spinner.js';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Render an inline loading indicator and disable the control. */
  loading?: boolean;
  children: ReactNode;
}

/**
 * Dense dashboard button primitive (DESIGN-SYSTEM §6.1). Adds `danger` for
 * destructive/irreversible actions (dashboard-only; the marketing app has none).
 * Minimum target size 44px (DESIGN-SYSTEM §7.4).
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      className={`${styles.button} ${styles[variant]}`}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={styles.loadingLabel} role="status">
          <Spinner size="sm" />
          <span>Loading…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
