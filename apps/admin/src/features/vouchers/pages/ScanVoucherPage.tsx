import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, PageHeader, QrCode, StatusChip } from '@jad/ui';
import { formatMoney, isExpired } from '@jad/shared';
import type { VoucherAssignment } from '@jad/contracts';

import { formatDate } from '../../../lib/format';
import { useScanVoucher } from '../hooks/useScanVoucher';
import { useRedeemVoucher } from '../hooks/useRedeemVoucher';
import { useQrScanner, type ScannerStatus } from '../hooks/useQrScanner';
import { useQrImageUpload } from '../hooks/useQrImageUpload';
import { VOUCHER_STATUS_LABEL, VOUCHER_STATUS_TONE } from '../status';
import styles from './ScanVoucherPage.module.css';

type ScanStage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; voucher: VoucherAssignment }
  | { kind: 'error'; message: string };

export function ScanVoucherPage() {
  const navigate = useNavigate();
  const scanMutation = useScanVoucher();
  const redeemMutation = useRedeemVoucher();
  const [manualCode, setManualCode] = useState('');
  const [stage, setStage] = useState<ScanStage>({ kind: 'idle' });
  const [redeeming, setRedeeming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resolve = async (code: string) => {
    if (!code.trim()) return;
    setStage({ kind: 'loading' });
    setManualCode('');
    try {
      const voucher = await scanMutation.mutateAsync(code.trim());
      setStage({ kind: 'result', voucher });
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message });
    }
  };

  const handleDecode = (code: string) => {
    void resolve(code);
  };

  const { videoRef, status } = useQrScanner(handleDecode);
  const {
    inputRef: qrUploadRef,
    previewUrl,
    status: uploadStatus,
    error: uploadError,
    handleFile: handleQrUpload,
    reset: resetQrUpload,
  } = useQrImageUpload(handleDecode);

  useEffect(() => {
    setStage({ kind: 'idle' });
  }, []);

  const confirmRedeem = async () => {
    if (stage.kind !== 'result') return;
    setRedeeming(true);
    try {
      const updated = await redeemMutation.mutateAsync(stage.voucher.id);
      setStage({ kind: 'result', voucher: updated });
      setConfirmOpen(false);
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message });
    } finally {
      setRedeeming(false);
    }
  };

  const isActive =
    stage.kind === 'result' &&
    stage.voucher.status === 'ACTIVE' &&
    !isExpired(stage.voucher.expiresAt);

  return (
    <section>
      <PageHeader
        title="Scan Voucher QR"
        description="Point the camera at a member's voucher QR code to verify and redeem it"
        actions={
          <Button variant="secondary" onClick={() => navigate('/admin/vouchers')}>
            All Vouchers
          </Button>
        }
      />

      <div className={styles.layout}>
        <div className={styles.scannerCard}>
          <video
            ref={videoRef}
            className={styles.video}
            aria-label="Voucher QR camera view"
            muted
            playsInline
          />
          <p role="status" className={styles.scannerHint}>
            {scannerHint(status)}
          </p>

          <div className={styles.manualWrap}>
            <label htmlFor="scan-manual" className={styles.manualLabel}>
              Or enter the code manually:
            </label>
            <div className={styles.manualRow}>
              <input
                id="scan-manual"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="JAD-VCH-2026-101"
                aria-label="Voucher code"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void resolve(manualCode);
                }}
                className={styles.manualInput}
              />
              <Button
                variant="primary"
                onClick={() => void resolve(manualCode)}
                disabled={!manualCode.trim()}
              >
                Look up
              </Button>
            </div>
          </div>

          <div className={styles.manualWrap}>
            <span className={styles.manualLabel}>Or upload a QR image:</span>
            <div className={styles.manualRow}>
              <input
                ref={qrUploadRef}
                type="file"
                accept="image/*"
                aria-label="Upload QR image"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleQrUpload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {previewUrl ? (
                <img src={previewUrl} alt="Uploaded QR preview" className={styles.uploadPreview} />
              ) : null}
              <Button
                variant="secondary"
                onClick={() => qrUploadRef.current?.click()}
                disabled={uploadStatus === 'decoding'}
              >
                {uploadStatus === 'decoding'
                  ? 'Reading image…'
                  : previewUrl
                    ? 'Upload another'
                    : 'Upload QR'}
              </Button>
              {previewUrl ? (
                <Button variant="ghost" onClick={resetQrUpload}>
                  Clear
                </Button>
              ) : null}
            </div>
            {uploadStatus === 'decoding' ? (
              <p role="status" className={styles.uploadHint}>
                Looking for a QR code in the image…
              </p>
            ) : null}
            {uploadError ? (
              <p role="alert" className={styles.error}>
                {uploadError}
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.resultCard}>
          {stage.kind === 'idle' ? <p className={styles.placeholder}>Waiting for a scan…</p> : null}
          {stage.kind === 'loading' ? <p role="status">Looking up voucher…</p> : null}
          {stage.kind === 'error' ? (
            <p role="alert" className={styles.error}>
              {stage.message}
            </p>
          ) : null}
          {stage.kind === 'result' ? (
            <VoucherResult
              voucher={stage.voucher}
              isActive={isActive}
              onRedeem={() => setConfirmOpen(true)}
            />
          ) : null}
        </div>
      </div>

      {confirmOpen && stage.kind === 'result' ? (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="redeem-title"
        >
          <div className={styles.confirmBox}>
            <h2 id="redeem-title" className={styles.confirmTitle}>
              Confirm redemption
            </h2>
            <p className={styles.confirmBody}>
              Redeem <strong>{stage.voucher.code}</strong> ({stage.voucher.memberName}) for{' '}
              <strong>{formatMoney(stage.voucher.remainingValue)}</strong>? Remaining value will be
              set to 0.00.
            </p>
            <div className={styles.confirmActions}>
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={redeeming}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmRedeem} loading={redeeming}>
                Confirm redeem
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function scannerHint(status: ScannerStatus): string {
  switch (status.kind) {
    case 'requesting':
      return 'Requesting camera access…';
    case 'running':
      return 'Scanning — keep the QR code inside the view.';
    case 'error':
      return status.message;
    default:
      return 'Enable camera to scan, or enter the code below.';
  }
}

function VoucherResult({
  voucher,
  isActive,
  onRedeem,
}: {
  voucher: VoucherAssignment;
  isActive: boolean;
  onRedeem: () => void;
}) {
  return (
    <div className={styles.result} data-testid="scan-result">
      <QrCode value={voucher.code} size={96} alt={`QR code for ${voucher.code}`} />
      <div className={styles.resultMeta}>
        <span className={styles.memberName}>{voucher.memberName}</span>
        <span className={styles.code}>{voucher.code}</span>
        <span className={styles.title}>{voucher.title}</span>
        <span className={styles.value}>{formatMoney(voucher.remainingValue)}</span>
        <div className={styles.chips}>
          <StatusChip
            label={VOUCHER_STATUS_LABEL[voucher.status]}
            tone={VOUCHER_STATUS_TONE[voucher.status]}
          />
          {voucher.status === 'ACTIVE' && isExpired(voucher.expiresAt) ? (
            <StatusChip label="Expired" tone="warning" />
          ) : null}
        </div>
        <span className={styles.issued}>Issued {formatDate(voucher.createdAt)}</span>
        {voucher.expiresAt ? (
          <span className={styles.issued}>Expires {formatDate(voucher.expiresAt)}</span>
        ) : null}
        {voucher.redeemedAt ? (
          <span className={styles.issued}>Redeemed {formatDate(voucher.redeemedAt)}</span>
        ) : null}
        {isActive ? (
          <Button variant="primary" onClick={onRedeem} className={styles.redeemButton}>
            Redeem voucher
          </Button>
        ) : null}
      </div>
    </div>
  );
}
