import { Link } from 'react-router';

import { compareMoney, formatMoney } from '@jad/shared';
import { ErrorState, Icon, PageHeader, Skeleton } from '@jad/ui';

import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ButtonLink } from '../../../components/ButtonLink';
import { usePayoutAccounts, useCommissions, useWallet } from '../hooks/useMember';
import { sumPendingCommissions } from '../lib/presentation';
import styles from './EWalletPage.module.css';

/**
 * eWallet summary (SCR-MEM-001, FR-WAL-003/004). Available Balance is the
 * only amount that can be withdrawn; Pending commissions are excluded until
 * they clear (BI-002, BR-WAL-003). Balances are server-computed - the client
 * never derives them.
 */
export function EWalletPage() {
  const walletQuery = useWallet();
  const payoutsQuery = usePayoutAccounts();
  const commissionsQuery = useCommissions();

  // Pending card = PENDING commissions in clearing (same source as the
  // dashboard card) - never wallet.pendingAmount (reserved withdrawals).
  const pendingCommissions = sumPendingCommissions(commissionsQuery.data);

  const available = walletQuery.data?.availableBalance ?? '0.00';
  const hasAvailable = (() => {
    try {
      return compareMoney(available, '0.00') > 0;
    } catch {
      return false;
    }
  })();
  const verifiedCount = (payoutsQuery.data ?? []).filter(
    (account) => account.status === 'CONFIRMED',
  ).length;
  const pendingPayoutCount = (payoutsQuery.data ?? []).filter(
    (account) => account.status === 'PENDING' || account.status === 'ADMIN_REVIEW',
  ).length;
  const hasVerified = payoutsQuery.isSuccess ? verifiedCount > 0 : false;
  const isCheckingEligibility = walletQuery.isLoading || payoutsQuery.isLoading;
  const canWithdraw =
    hasAvailable &&
    hasVerified &&
    !isCheckingEligibility &&
    !walletQuery.isError &&
    !walletQuery.isLoading &&
    !payoutsQuery.isError;

  return (
    <section>
      <PageHeader title="eWallet" description="Your commission balance and withdrawal access." />

      {walletQuery.isLoading ? (
        <div className={styles.loading} role="status">
          <Skeleton />
          <Skeleton />
        </div>
      ) : walletQuery.isError ? (
        <ErrorState
          error={walletQuery.error}
          title="Could not load your wallet"
          onRetry={() => void walletQuery.refetch()}
        />
      ) : (
        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>Available Balance</span>
              <span className={`${styles.cardIcon} ${styles.cardIconAvailable}`} aria-hidden="true">
                <Icon name="wallet" size={18} />
              </span>
            </div>
            <span className={styles.cardValue}>
              {formatMoney(walletQuery.data?.availableBalance ?? '0.00')}
            </span>
            <span className={styles.cardHint}>Ready to withdraw (BI-001).</span>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>Pending</span>
              <span className={`${styles.cardIcon} ${styles.cardIconPending}`} aria-hidden="true">
                <Icon name="info" size={18} />
              </span>
            </div>
            <span className={styles.cardValue}>
              {commissionsQuery.isLoading ? '-' : formatMoney(pendingCommissions)}
            </span>
            <span className={styles.cardHint}>
              Clears to Available after the clearing period (BI-002, BR-WAL-003).
            </span>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>Total Withdrawals</span>
              <span
                className={`${styles.cardIcon} ${styles.cardIconWithdrawals}`}
                aria-hidden="true"
              >
                <Icon name="list" size={18} />
              </span>
            </div>
            <span className={styles.cardValue}>
              {formatMoney(walletQuery.data?.totalWithdrawals ?? '0.00')}
            </span>
            <span className={styles.cardHint}>Completed & reserved • server-computed</span>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>Total Earned</span>
              <span className={`${styles.cardIcon} ${styles.cardIconEarned}`} aria-hidden="true">
                <Icon name="check" size={18} />
              </span>
            </div>
            <span className={styles.cardValue}>
              {formatMoney(walletQuery.data?.totalEarned ?? '0.00')}
            </span>
            <span className={styles.cardHint}>Ledger-defined total (BR-RPT-003)</span>
          </div>
        </div>
      )}

      <div className={styles.alertStack}>
        {!isCheckingEligibility && !walletQuery.isError && !hasAvailable ? (
          <Alert variant="info" title="No available balance">
            You have no available balance to withdraw. Pending commissions clear to Available after
            the 7-day clearing period. <Link to="/member/commissions">View commissions</Link>.
          </Alert>
        ) : null}

        {payoutsQuery.isSuccess && !isCheckingEligibility && hasAvailable && verifiedCount === 0 ? (
          <Alert variant="warning" title="No verified payout account">
            Add a payout account and wait for Admin verification (Pending → Admin Review →
            Confirmed) before you can withdraw.{' '}
            <Link to="/member/payouts/new">Add payout account</Link> •{' '}
            <Link to="/member/payouts">View payout accounts</Link>.
          </Alert>
        ) : null}

        {payoutsQuery.isSuccess && pendingPayoutCount > 0 ? (
          <Alert variant="info" title="Payout verification pending">
            You have {pendingPayoutCount} payout account{pendingPayoutCount === 1 ? '' : 's'}{' '}
            pending verification - typically 24-48h.{' '}
            <Link to="/member/payouts">View payout accounts</Link>.
          </Alert>
        ) : null}

        {payoutsQuery.isError ? (
          <Alert variant="warning" title="Could not check payout accounts">
            We couldn’t verify your payout accounts. You can still view the ledger or try again.
          </Alert>
        ) : null}
      </div>

      <div className={styles.actions}>
        {canWithdraw ? (
          <ButtonLink to="/member/withdrawals/new" className={styles.linkButton}>
            Withdraw
          </ButtonLink>
        ) : (
          <Button
            disabled
            aria-disabled="true"
            title={
              payoutsQuery.isError
                ? 'Could not check payout accounts'
                : !hasAvailable
                  ? 'No available balance'
                  : verifiedCount === 0
                    ? 'No verified payout account'
                    : 'Checking eligibility'
            }
          >
            Withdraw
          </Button>
        )}
        <ButtonLink to="/member/ewallet/ledger" variant="secondary" className={styles.linkButton}>
          View ledger
        </ButtonLink>
      </div>

      <p className={styles.note}>
        JA&amp;D records commission amounts but never moves money on your behalf (BR-BND-001..003).
      </p>
    </section>
  );
}
