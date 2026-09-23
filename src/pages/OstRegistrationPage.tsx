import { FormEvent, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { supabase } from '../lib/supabase';

type CodeInfo = { valid: boolean; salesManager?: string; expiresAt?: string };

export function OstRegistrationPage() {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') ?? '');
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const validate = async () => {
    setBusy(true); setError(''); setCodeInfo(null);
    const { data, error: invokeError } = await supabase.functions.invoke<CodeInfo>('ost-registration', { body: { action: 'validate-code', code: code.trim() } });
    if (invokeError || !data?.valid) setError('This referral code is invalid, expired, inactive, or fully used.');
    else setCodeInfo(data);
    setBusy(false);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget); form.set('referralCode', code);
    const { data, error: invokeError } = await supabase.functions.invoke<{ id: string }>('ost-registration', { body: form });
    if (invokeError || !data?.id) setError('The application could not be submitted. Check for a duplicate application and try again.');
    else setReference(data.id);
    setBusy(false);
  };
  if (reference) return <main className="public-registration"><section className="auth-card registration-success"><CheckCircle2 /><h1>Application received</h1><p>Your application is pending verification. You cannot log in yet. Your Sales Manager or an administrator will review it and contact you if corrections are required.</p><small>Reference: {reference}</small></section></main>;
  return <main className="public-registration"><section className="registration-shell">
    <header className="registration-brand"><BrandLogo /><div><p className="eyebrow">SECURE OST APPLICATION</p><h1>Join the AF Homes sales network</h1><p>Apply through your Sales Manager's referral. An account is created only after identity and placement review.</p></div><span><ShieldCheck /> Private document handling</span></header>
    <section className="panel">
      <div className="step-strip"><b>1 Referral</b><b>2 Applicant details</b><b>3 ID & consent</b><b>4 Verification</b></div>
      {!codeInfo ? <div className="code-gate"><h2>Validate your referral</h2><label>Sales Manager referral code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoComplete="off" /></label><button className="primary" disabled={busy || !code.trim()} onClick={() => void validate()}>{busy ? 'Checking…' : 'Continue'}</button>{error && <p className="inline-error" role="alert">{error}</p>}</div> : <form className="form" onSubmit={(event) => void submit(event)}>
        <div className="referral-confirmed"><CheckCircle2 /><div><strong>Referral confirmed</strong><p>Sales Manager: {codeInfo.salesManager}</p></div></div>
        <div className="form-section"><h2>Applicant details</h2><div className="form-grid">
          <label>First name<input name="firstName" required /></label><label>Middle name<input name="middleName" /></label><label>Last name<input name="lastName" required /></label><label>Date of birth<input name="dateOfBirth" type="date" required /></label><label>Sex<select name="sex" defaultValue=""><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Email<input name="email" type="email" required /></label><label>Mobile<input name="mobile" type="tel" required /></label>
        </div></div>
        <div className="form-section"><h2>Residential address</h2><div className="form-grid"><label className="span-2">Street / unit<input name="addressLine" required /></label><label>Barangay<input name="barangay" required /></label><label>City / municipality<input name="city" required /></label><label>Province<input name="province" required /></label><label>Postal code<input name="postalCode" required /></label></div></div>
        <div className="form-section"><h2>Government ID</h2><p className="muted">JPG, PNG, or PDF; maximum 5 MB per file. Files are private and integrity-hashed.</p><div className="form-grid"><label>ID type<input name="idType" required /></label><label>ID number<input name="idNumber" required minLength={4} /></label><label>Issue date<input name="idIssueDate" type="date" /></label><label>Expiration date<input name="idExpirationDate" type="date" /></label><label>ID front<input name="idFront" type="file" accept="image/jpeg,image/png,application/pdf" required /></label><label>ID back (if applicable)<input name="idBack" type="file" accept="image/jpeg,image/png,application/pdf" /></label></div></div>
        <div className="consent-box"><label className="check"><input name="consent" value="true" type="checkbox" required /> I consent to AF Homes processing these details and ID documents for application verification.</label><label className="check"><input name="certification" value="true" type="checkbox" required /> I certify that the information and documents are complete and accurate.</label></div>
        {error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={() => setCodeInfo(null)}>Change code</button><button className="primary" disabled={busy}>{busy ? 'Submitting securely…' : 'Submit for verification'}</button></div>
      </form>}
    </section>
  </section></main>;
}
