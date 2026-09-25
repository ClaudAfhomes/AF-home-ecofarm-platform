import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IdDocumentScanner } from '../components/IdDocumentScanner';
import type { IdentityDraft, IdentityExtraction } from '../lib/id-extraction';
import { createCustomer } from '../services/operations';

const emptyDraft: Required<IdentityDraft> = {
  firstName: '',
  middleName: '',
  lastName: '',
  birthDate: '',
  sex: '',
  address: '',
  email: '',
  phone: '',
  idType: '',
  idNumber: '',
  expirationDate: '',
};

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File>();
  const [extraction, setExtraction] = useState<IdentityExtraction>();
  const [draft, setDraft] = useState(emptyDraft);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (field: keyof IdentityDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setReviewConfirmed(false);
  };

  const acceptExtraction = (result?: IdentityExtraction) => {
    setExtraction(result);
    setReviewConfirmed(false);
    if (!result) return;
    setDraft((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(result.fields) as [keyof IdentityDraft, string | undefined][]) {
        if (value) next[key] = value;
      }
      return next;
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Attach the customer ID image or PDF before saving.');
      return;
    }
    if (!reviewConfirmed) {
      setError('Confirm that a staff member reviewed every identity field before saving.');
      return;
    }
    setSaving(true);
    try {
      await createCustomer({
        first_name: draft.firstName,
        middle_name: draft.middleName || null,
        last_name: draft.lastName,
        email: draft.email || null,
        phone: draft.phone,
        address: draft.address,
        birth_date: draft.birthDate || null,
        sex: draft.sex || null,
        id_type: draft.idType,
        id_number_encrypted: draft.idNumber || null,
        id_expiration_date: draft.expirationDate || null,
      }, file, extraction);
      navigate('/customers');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Register customer</h1>
          <p>Scan locally, review every field, then securely store the private ID document.</p>
        </div>
      </header>
      <form className="panel form" onSubmit={submit}>
        <div className="form-section">
          <h2>Identity document</h2>
          <IdDocumentScanner
            file={file}
            extraction={extraction}
            onFile={(next) => { setFile(next); setReviewConfirmed(false); }}
            onExtraction={acceptExtraction}
          />
        </div>

        <div className="form-section">
          <h2>Editable customer details</h2>
          <p className="muted">Scanned values are drafts only. Correct any errors before confirmation.</p>
          <div className="form-grid">
            <label>First name<input required value={draft.firstName} onChange={(event) => update('firstName', event.target.value)} /></label>
            <label>Middle name<input value={draft.middleName} onChange={(event) => update('middleName', event.target.value)} /></label>
            <label>Last name<input required value={draft.lastName} onChange={(event) => update('lastName', event.target.value)} /></label>
            <label>Birth date<input type="date" value={draft.birthDate} onChange={(event) => update('birthDate', event.target.value)} /></label>
            <label>Sex<select value={draft.sex} onChange={(event) => update('sex', event.target.value)}><option value="">Not provided</option><option value="female">Female</option><option value="male">Male</option><option value="x">X</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
            <label>Phone<input required value={draft.phone} onChange={(event) => update('phone', event.target.value)} /></label>
            <label>Email<input type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label className="span-2">Address<textarea required value={draft.address} onChange={(event) => update('address', event.target.value)} /></label>
            <label>ID type<select required value={draft.idType} onChange={(event) => update('idType', event.target.value)}><option value="">Choose…</option><option>PhilSys ID</option><option>Driver's License</option><option>Passport</option><option>Other Government ID</option></select></label>
            <label>ID number<input required value={draft.idNumber} onChange={(event) => update('idNumber', event.target.value)} /></label>
            <label>ID expiration<input type="date" value={draft.expirationDate} onChange={(event) => update('expirationDate', event.target.value)} /></label>
          </div>
          <label className="check review-confirmation">
            <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
            I reviewed the original ID and confirmed every field. Scanning/OCR did not approve this identity.
          </label>
        </div>

        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save reviewed customer'}</button>
        </div>
      </form>
    </>
  );
}
