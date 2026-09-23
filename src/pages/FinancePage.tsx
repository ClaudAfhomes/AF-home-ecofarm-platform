import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StatusChip } from '../components/StatusChip';
import { ResourcePage } from './ResourcePage';
import { formatDate, formatMoney } from '../lib/format';
import { verifyPayment, type Payment } from '../services/operations';

export function FinancePage() {
  const [selected, setSelected] = useState<Payment | null>(null); const client = useQueryClient();
  const decide = async (approved: boolean) => { if (!selected) return; const notes = window.prompt(approved ? 'Verification notes (optional)' : 'Rejection reason (required)') ?? ''; if (!approved && !notes.trim()) return; await verifyPayment(selected.id, approved, notes); setSelected(null); await client.invalidateQueries({ queryKey: ['payments'] }); };
  return <><ResourcePage<Payment> title="Payment verification" description="Review payment evidence. Payments are never verified automatically." table="payments" columns={[{ key: 'created_at', label: 'Received', render: (row) => formatDate(row.created_at) }, { key: 'amount', label: 'Amount', render: (row) => formatMoney(row.amount) }, { key: 'method', label: 'Method' }, { key: 'reference_number', label: 'Reference' }, { key: 'status', label: 'Status', render: (row) => <StatusChip value={row.status} /> }, { key: 'actions', label: 'Actions', render: (row) => row.status === 'pending' ? <button className="text-button" onClick={() => setSelected(row)}>Review</button> : '—' }]} />{selected && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title"><h2 id="review-title">Verify payment</h2><p>Confirm that the submitted amount and reference match the private receipt.</p><dl><dt>Amount</dt><dd>{formatMoney(selected.amount)}</dd><dt>Reference</dt><dd>{selected.reference_number ?? 'None'}</dd></dl><div className="form-actions"><button className="danger" onClick={() => void decide(false)}>Reject</button><button className="secondary" onClick={() => setSelected(null)}>Cancel</button><button className="primary" onClick={() => void decide(true)}>Verify payment</button></div></section></div>}</>;
}
