import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { roleHome } from '../lib/permissions';

export function LoginPage() {
  const { session, role } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false);
  if (session && role) return <Navigate to={roleHome[role]} replace />;
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSubmitting(true); setError(''); const { error: authError } = await supabase.auth.signInWithPassword({ email, password }); if (authError) setError(authError.message); else { const { error: auditError } = await supabase.rpc('record_auth_event', { p_event: 'login' }); if (auditError) { await supabase.auth.signOut(); setError('Sign-in could not be audited. Please contact Super Admin.'); } } setSubmitting(false); };
  return <main className="auth-page"><section className="auth-brand"><div className="brand-mark"><img src="/afhomes-logo.png" alt="AF Homes" /><span>AFhomes</span></div><h1>Grow communities.<br />Build lasting value.</h1><p>Secure operations for Ecofarm sales, finance, people, and genealogy.</p></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="auth-icon"><LockKeyhole /></div><p className="eyebrow">INTERNAL OPERATIONS</p><h2>Welcome back</h2><p>Sign in with your authorized staff account.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in securely'}</button><Link to="/recover">Forgot password?</Link></form></section></main>;
}

export function RecoveryPage() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` }); setSent(true); };
  return <main className="center-page"><form className="auth-card" onSubmit={submit}><h1>Reset password</h1>{sent ? <p>Check your inbox for a secure recovery link.</p> : <><label>Work email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="primary">Send recovery link</button></>}<Link to="/login">Back to sign in</Link></form></main>;
}

export function PasswordUpdatePage() {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 10) { setError('Use at least 10 characters.'); return; }
    if (password !== confirmed) { setError('Passwords do not match.'); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message); else setSaved(true);
  };
  return <main className="center-page"><form className="auth-card" onSubmit={submit}><h1>{saved ? 'Password saved' : 'Set your password'}</h1>{saved ? <><p>Your account is ready.</p><Link className="button primary" to="/">Continue to AFhomes</Link></> : !session ? <><p className="inline-error">Open this page from the secure invitation or recovery link sent to your email.</p><Link to="/login">Back to sign in</Link></> : <><label>New password<input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm password<input type="password" autoComplete="new-password" required minLength={10} value={confirmed} onChange={(event) => setConfirmed(event.target.value)} /></label>{error ? <p className="inline-error" role="alert">{error}</p> : null}<button className="primary">Save password</button></>}</form></main>;
}
