import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { apiErrorMessage } from '../../../lib/api/errorMessage';
import { useQuery } from '@tanstack/react-query';
import { getGlobalCmsPublic, getRegisterCmsPublic } from '@/lib/cms';
import { AUTH } from '../content';
import { AuthLayout } from '../components/AuthLayout';
import { TextField } from '../components/TextField';
import { resendVerificationCode, verifyEmail } from '../services/auth';
import styles from './VerifyEmailPage.module.css';

const CODE_RE = /^\d{6}$/;

/**
 * Email verification (SCR-AUTH-003, FEAT-009). Verifies the one-time code from
 * `POST /auth/verify-email` (BR-AUTH-001 — verification precedes approval) and
 * routes to the application status screen. In dev the mock "email" is simulated
 * via `POST /auth/verify-email/resend`, which returns the code the email would
 * carry — shown in a clearly-labeled dev-only banner, never presented as real.
 */
export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: globalCms } = useQuery({
    queryKey: ['cms', 'global'],
    queryFn: getGlobalCmsPublic,
    staleTime: 0,
  });
  const { data: registerCms } = useQuery({
    queryKey: ['cms', 'register'],
    queryFn: getRegisterCmsPublic,
    staleTime: 0,
  });
  const verifyCopy =
    (registerCms as { verifyEmail?: typeof AUTH.verifyEmail } | undefined)?.verifyEmail ??
    AUTH.verifyEmail;
  const verifyImage =
    (registerCms as { image?: { id: string; alt: string } } | undefined)?.image ??
    AUTH.images.register;
  const brandMark = globalCms?.brandMark ?? null;

  const resolveInitialEmail = (): string => {
    const stateEmail = (location.state as { email?: string } | null)?.email;
    if (typeof stateEmail === 'string' && stateEmail) return stateEmail;
    const queryEmail = searchParams.get('email');
    if (queryEmail) return queryEmail;
    try {
      const stored = sessionStorage.getItem('jad:register:email');
      if (stored) return stored;
    } catch {
      // ignore storage errors
    }
    return '';
  };

  const [email, setEmail] = useState(resolveInitialEmail);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string }>({});
  const [serverError, setServerError] = useState<string | undefined>();
  const [devOnlyCode, setDevOnlyCode] = useState<string | undefined>();
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const setField = (field: 'email' | 'code', value: string) => {
    if (field === 'email') setEmail(value);
    else setCode(value);
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError(undefined);
  };

  const validate = (): boolean => {
    const nextErrors: { email?: string; code?: string } = {};
    if (!email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!code.trim()) nextErrors.code = 'Enter the verification code.';
    else if (!CODE_RE.test(code.trim())) nextErrors.code = 'Enter the 6-digit code from the email.';
    setErrors(nextErrors);
    if (nextErrors.email) document.getElementById('auth-verify-email')?.focus();
    else if (nextErrors.code) document.getElementById('auth-verify-code')?.focus();
    return Object.keys(nextErrors).length === 0;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      const trimmed = email.trim();
      await verifyEmail({ email: trimmed, code: code.trim() });
      try {
        sessionStorage.setItem('jad:register:email', trimmed);
      } catch {
        // ignore
      }
      navigate('/register/status', {
        replace: true,
        state: { email: trimmed },
      });
    } catch (error) {
      setServerError(apiErrorMessage(error, 'We could not verify your email. Please try again.'));
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (resending || !email.trim()) return;
    setResending(true);
    setServerError(undefined);
    setCodeSent(false);
    try {
      const response = await resendVerificationCode(email.trim());
      setDevOnlyCode(response.devOnlyCode);
      setCodeSent(true);
    } catch (error) {
      setServerError(apiErrorMessage(error, 'We could not resend the code. Please try again.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={verifyCopy.eyebrow}
      title={verifyCopy.title}
      lead={verifyCopy.lead}
      brandTitle={verifyCopy.brandTitle}
      brandLead={verifyCopy.brandLead}
      image={verifyImage}
      brandMark={brandMark}
    >
      <form className={styles.form} noValidate onSubmit={onSubmit}>
        {serverError ? (
          <Alert variant="danger" title="We could not verify your email">
            {serverError}
          </Alert>
        ) : null}

        {devOnlyCode ? (
          <Alert variant="info" title={AUTH.verifyEmail.simulatedEmail.title}>
            {AUTH.verifyEmail.simulatedEmail.message} <strong>{devOnlyCode}</strong>
          </Alert>
        ) : null}

        {codeSent ? (
          <Alert variant="success" title={AUTH.verifyEmail.codeSent}>
            {codeSent ? AUTH.verifyEmail.codeSent : ''}
          </Alert>
        ) : null}

        <TextField
          id="auth-verify-email"
          name="email"
          type="email"
          label={AUTH.verifyEmail.fields.email.label}
          value={email}
          onChange={(value) => setField('email', value)}
          error={errors.email}
          autoComplete="email"
          inputMode="email"
        />

        <TextField
          id="auth-verify-code"
          name="code"
          label={AUTH.verifyEmail.fields.code.label}
          hint={AUTH.verifyEmail.fields.code.hint}
          value={code}
          onChange={(value) => setField('code', value.replace(/\D/g, ''))}
          error={errors.code}
          autoComplete="one-time-code"
          inputMode="numeric"
        />

        <div className={styles.resendRow}>
          <button
            type="button"
            className={styles.resendButton}
            onClick={onResend}
            disabled={resending || !email.trim()}
          >
            {resending ? AUTH.verifyEmail.resendingLabel : AUTH.verifyEmail.resendLabel}
          </button>
        </div>

        <div className={styles.submitRow}>
          <Button type="submit" loading={submitting} disabled={submitting}>
            {AUTH.verifyEmail.submitLabel}
          </Button>
        </div>

        <p className={styles.prompt}>
          Prefer to start over?{' '}
          <Link className={styles.promptLink} to={AUTH.loginPath}>
            {AUTH.login.eyebrow}
          </Link>
        </p>

        <p className={styles.note}>
          The code is valid for a limited time. If it expires, request a new one.
        </p>
      </form>
    </AuthLayout>
  );
}
