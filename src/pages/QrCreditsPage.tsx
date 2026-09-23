import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, History, QrCode, ShieldAlert } from 'lucide-react';
import { useTable } from '../hooks/useTable';
import { QrScanner } from '../components/QrScanner';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { scanQrCode } from '../services/operations';
import type { Database } from '../lib/database.types';

type ScanEvent = Database['public']['Tables']['qr_scan_events']['Row'];
type ScanResult = Awaited<ReturnType<typeof scanQrCode>>;

export function QrCreditsPage() {
  const client = useQueryClient();
  const events = useTable<ScanEvent>('qr_scan_events');
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verify = async (value: string) => {
    const token = value.trim();
    if (!token || verifying) return;
    setVerifying(true);
    setResult(null);
    try {
      setResult(await scanQrCode(token));
      await client.invalidateQueries({ queryKey: ['qr_scan_events'] });
    } catch (error) {
      setResult({ status: 'error', message: error instanceof Error ? `Network error: ${error.message}` : 'The QR verification request failed.' });
    } finally {
      setVerifying(false);
    }
  };

  const resultClass = result?.status === 'success' ? 'qr-result success' : result ? 'qr-result error' : 'qr-result';
  return (
    <>
      <header className="page-header"><div><p className="eyebrow">SECURE REFERRALS</p><h1>QR credits</h1><p>Scan an opaque AFhomes token. The database verifies expiry, role, genealogy policy, and one-time use before granting credit.</p></div><span className="secure-badge"><ShieldAlert /> Server verified</span></header>
      <section className="qr-layout">
        <article className="panel qr-panel">
          <div className="panel-heading"><div><p className="eyebrow">SCAN QR</p><h2>Verify a referral token</h2></div><QrCode /></div>
          <QrScanner onDetected={(value) => void verify(value)} />
          <div className="manual-entry">
            <label>Manual code entry
              <div className="manual-input"><input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Enter the opaque token" autoComplete="off" /><button className="primary" type="button" disabled={verifying || !manualCode.trim()} onClick={() => void verify(manualCode)}>{verifying ? 'Verifying…' : 'Verify code'}</button></div>
            </label>
            <p className="muted">No customer information is stored in the QR code. Only the token hash is recorded for audit.</p>
          </div>
          {result && <div className={resultClass} role="status">{result.status === 'success' ? <CheckCircle2 /> : <ShieldAlert />}<div><strong>{result.status === 'success' ? 'Credit granted' : result.status === 'error' ? 'Network error' : result.status.replaceAll('_', ' ')}</strong><p>{result.message}</p>{result.creditNumber ? <small>Credit #{result.creditNumber} recorded for the authorized member.</small> : null}</div></div>}
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent scans</h2></div><History /></div>
          {events.isLoading ? <LoadingState label="Loading scan history…" /> : events.error ? <ErrorState message={events.error.message} retry={() => void events.refetch()} /> : !events.data?.length ? <EmptyState title="No scans yet" body="Successful and rejected scans will appear here." /> : <div className="scan-history">{events.data.slice(0, 12).map((event) => <div className="scan-event" key={event.id}><div><strong>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.created_at))}</strong><p>{event.reason ?? 'QR verification'}</p></div><StatusChip value={event.result} /></div>)}</div>}
        </article>
      </section>
    </>
  );
}
