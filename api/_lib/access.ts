/**
 * Per-endpoint staff role matrix (Phase B3). Single testable source for who
 * may call what - handlers reference these constants instead of inline
 * literals. Mirrors docs/architecture/API-SPECIFICATION.md §6 inventory.
 */

/** Full governance (config writes, role/staff management, adjustments). */
export const SUPER_ADMIN_ONLY = ['super_admin'] as const;

/** Standard admin shell access (queues, members, sales, content). */
export const ADMIN_STAFF = ['super_admin', 'admin'] as const;

/** Read access extended to finance (sales queue, payouts, withdrawals). */
export const FINANCE_VIEW = ['super_admin', 'admin', 'finance'] as const;
