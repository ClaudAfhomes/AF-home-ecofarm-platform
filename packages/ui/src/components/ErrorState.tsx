import { Button } from './Button';
import { Icon } from './Icon';
import styles from './ErrorState.module.css';

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  message?: string;
  /** Correlation `requestId` (API-SPECIFICATION §3) - no PII (NFR-CONF-001). */
  requestId?: string;
  onRetry?: () => void;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Recoverable error state (UI-UX §10 "Error"). Never renders raw stack traces
 * or server internals; surfaces the correlation id and an optional retry.
 */
export function ErrorState({
  error,
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
}: ErrorStateProps) {
  const text = message ?? describeError(error);
  return (
    <div className={styles.error} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <Icon name="alert" size={20} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{text}</p>
        {requestId ? <p className={styles.requestId}>Reference: {requestId}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
