import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, Plus, QrCode } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type CodeRow = Database['public']['Tables']['ost_referral_codes']['Row'];
export function OstReferralCodesPage() {
  const { profile } = useAuth(); const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<{ code: string; qr: string; url: string } | null>(null);
  const codes = useQuery({ queryKey: ['ost-referral-codes'], queryFn: async () => { const result = await supabase.from('ost_referral_codes').select('*').order('created_at', { ascending: false }); if (result.error) throw result.error; return result.data; } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ost-referral-codes'] });
  const create = async () => { const { data, error: invokeError } = await supabase.functions.invoke<CodeRow & { code: string }>('ost-registration', { body: { action: 'create-code', validDays: 30 } }); if (invokeError || !data) return setError('The referral code could not be created.'); const url = `${location.origin}/ost/register?code=${encodeURIComponent(data.code)}`; setIssued({ code: data.code, url, qr: await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#173c2b', light: '#ffffff' } }) }); await refresh(); };
  const deactivate = async (id: string) => { const { error: invokeError } = await supabase.functions.invoke('ost-registration', { body: { action: 'deactivate-code', codeId: id } }); if (invokeError) setError('Only an unused active code can be deactivated.'); else await refresh(); };
  return <><header className="page-header"><div><p className="eyebrow">SALES MANAGER</p><h1>OST referral codes</h1><p>Create a time-limited referral for your own Vice Director branch. The raw code is shown only once.</p></div><button className="primary" onClick={() => void create()}><Plus /> Create 30-day code</button></header>
    {error ? <ErrorState message={error} retry={() => { setError(''); void codes.refetch(); }} /> : null}
    {issued ? <section className="panel issued-code"><img src={issued.qr} alt="Scannable OST registration referral QR" /><div><h2>Save this referral now</h2><code>{issued.code}</code><p>{issued.url}</p><button className="secondary" onClick={() => void navigator.clipboard.writeText(issued.url)}><Copy /> Copy registration link</button><p className="muted">It cannot be displayed again after this page is closed.</p></div></section> : null}
    <section className="panel">{codes.isLoading ? <LoadingState /> : codes.error ? <ErrorState message={codes.error.message} retry={() => void codes.refetch()} /> : <div className="table-wrap"><table><caption className="sr-only">Referral codes for {profile?.full_name}</caption><thead><tr><th>Code hint</th><th>Status</th><th>Uses</th><th>Expires</th><th>Action</th></tr></thead><tbody>{codes.data?.map((row) => <tr key={row.id}><td><QrCode /> •••{row.code_hint}</td><td><StatusChip value={row.status} /></td><td>{row.use_count} / {row.max_uses}</td><td>{new Date(row.expires_at).toLocaleDateString()}</td><td>{row.status === 'active' && row.use_count === 0 ? <button className="text-button" onClick={() => void deactivate(row.id)}>Deactivate</button> : '—'}</td></tr>)}</tbody></table></div>}</section></>;
}
