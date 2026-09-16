import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation, useSearchParams } from 'react-router';

import { RegisterPage } from './RegisterPage';
import { mockFetchRoutes, renderWithProviders } from '../../../test/utils';

vi.mock('../hooks/useLocationVerification', () => {
  // Stable reference across renders - mirrors the real hook (React Query keeps
  // `data` referentially stable), so sync effects in the form settle instead
  // of re-firing on every render.
  const stable = {
    status: 'success' as const,
    data: {
      verifiedCountryCode: 'PH',
      programId: 'prg-domestic',
      method: 'GPS' as const,
      blocked: false,
      requiresException: false,
      verificationId: '550e8400-e29b-41d4-a716-446655440001',
    },
    error: null,
    retry: vi.fn(),
  };
  return { useLocationVerification: () => stable };
});

const CONFIG = {
  minimumAge: 18,
  genders: ['Male', 'Female', 'LGBT'],
  countries: [{ code: 'PH', name: 'Philippines' }],
};

const PROGRAMS = {
  data: [
    {
      id: 'prg-domestic',
      code: 'DOMESTIC',
      name: 'Domestic',
      description: 'JA&D membership for applicants within the Philippines.',
    },
  ],
  meta: {},
};

const QUESTIONS = {
  data: [
    {
      id: 'qual-001',
      questionText: 'Are you at least 18 years old and able to enter into a contract?',
    },
  ],
  meta: {},
};

const APPLICATION = {
  application: {
    id: 'mem-005',
    email: 'ana.nueva@example.com',
    status: 'PENDING',
    emailVerified: false,
    createdAt: '2026-08-20T10:00:00.000Z',
  },
};

function VerifyEmailProbe() {
  const location = useLocation();
  const [params] = useSearchParams();
  const stateEmail = (location.state as { email?: string } | null)?.email;
  const queryEmail = params.get('email');
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem('jad:register:email');
  } catch {
    stored = null;
  }
  const email = stateEmail ?? queryEmail ?? stored;
  return <div>Check your email: {email}</div>;
}

function renderRegister() {
  mockFetchRoutes({
    '/config/public': CONFIG,
    '/programs': PROGRAMS,
    '/programs/prg-domestic/qualification-questions': QUESTIONS,
    '/registration/location-verify': {
      verifiedCountryCode: 'PH',
      programId: 'prg-domestic',
      method: 'IP',
      blocked: false,
    },
    '/auth/register': { body: APPLICATION, status: 201 },
  });
  return renderWithProviders(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/verify-email" element={<VerifyEmailProbe />} />
    </Routes>,
    { route: '/register' },
  );
}

describe('RegisterPage', () => {
  it('renders the multi-step registration experience with all required controls', async () => {
    renderRegister();

    expect(await screen.findByRole('heading', { name: 'Join JA&D' })).toBeInTheDocument();
    expect(await screen.findByText('Program & profile')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Referral code')).toBeInTheDocument();
    expect(screen.getByText('Government ID')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();

    // Program and Country are read-only, populated from mocked location verification
    expect(screen.getByRole('textbox', { name: 'Program' })).toBeInTheDocument();
    expect(screen.getByText('Domestic')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Country' })).toBeInTheDocument();
    expect(screen.getByText('Philippines')).toBeInTheDocument();
    // Cannot be manually changed - no selectOptions for Program/Country
    expect(screen.queryByRole('combobox', { name: 'Program' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Country' })).not.toBeInTheDocument();
    expect(screen.queryByText('Based on your detected location')).not.toBeInTheDocument();

    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Date of birth')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('validates required fields on the first step', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your phone number.')).toBeInTheDocument();
    expect(screen.getByText('Enter your date of birth.')).toBeInTheDocument();
    expect(screen.getByText('Select your gender.')).toBeInTheDocument();
  });

  it('never leaks a raw program id when the program catalog is empty', async () => {
    const user = userEvent.setup();
    mockFetchRoutes({
      '/config/public': CONFIG,
      '/programs': { data: [], meta: {} },
      '/programs/prg-domestic/qualification-questions': QUESTIONS,
    });
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/verify-email" element={<VerifyEmailProbe />} />
      </Routes>,
      { route: '/register' },
    );

    expect(await screen.findByRole('heading', { name: 'Join JA&D' })).toBeInTheDocument();
    // Read-only field shows the unavailable state, never the internal id -
    // even though location verification resolved programId prg-domestic.
    expect(
      await screen.findByText('Program list unavailable - please try again shortly.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('prg-domestic')).not.toBeInTheDocument();

    // Progression is blocked with a field-level message until programs load.
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(
      screen.getByText('Programs are unavailable right now. Please try again shortly.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('prg-domestic')).not.toBeInTheDocument();
  });

  it('submits the full application through every step and routes to email verification', async () => {
    const fetchFn = mockFetchRoutes({
      '/config/public': CONFIG,
      '/programs': PROGRAMS,
      '/programs/prg-domestic/qualification-questions': QUESTIONS,
      '/auth/register': { body: APPLICATION, status: 201 },
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/verify-email" element={<VerifyEmailProbe />} />
      </Routes>,
      { route: '/register' },
    );

    const continueButton = await screen.findByRole('button', { name: 'Continue' });

    // Step 0 - program & profile - Program/Country are read-only from mocked location verification
    expect(await screen.findByText('Domestic')).toBeInTheDocument();
    expect(await screen.findByText('Philippines')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Program' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Country' })).not.toBeInTheDocument();
    // Can continue once location verification is successful (mocked as immediate success)
    await waitFor(() => expect(continueButton).toBeEnabled());

    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.type(screen.getByLabelText('Last name'), 'Nueva');
    await user.type(screen.getByLabelText('Phone number'), '+63 917 555 0999');
    fireEvent.change(screen.getByLabelText('Date of birth'), {
      target: { value: '1990-01-15' },
    });
    await user.selectOptions(screen.getByLabelText('Gender'), 'Male');
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    // Step 1 - qualification questions (loaded once a program is chosen).
    expect(await screen.findByText(/Are you at least 18 years old/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Are you at least 18 years old/), 'Yes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2 - optional referral code (left blank).
    expect(await screen.findByRole('heading', { name: 'Referral code' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3 - government ID (metadata only).
    expect(await screen.findByRole('heading', { name: 'Government ID' })).toBeInTheDocument();
    const idFile = new File(['id-copy'], 'id-copy.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Government ID copy'), {
      target: { files: [idFile] },
    });
    // File bytes load async via FileReader - wait before continuing.
    expect(await screen.findByText('id-copy.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4 - account.
    expect(await screen.findByText('Create your account')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email address'), 'ana.nueva@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByLabelText(/I agree to the JA/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 5 - review.
    expect(
      await screen.findByRole('heading', { name: 'Review your application' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create My Account' }));

    // Routes to email verification carrying the applicant's email (SCR-AUTH-003).
    expect(await screen.findByText('Check your email: ana.nueva@example.com')).toBeInTheDocument();

    const registerCall = fetchFn.mock.calls.find(([input]) =>
      String(input).endsWith('/auth/register'),
    );
    expect(registerCall).toBeDefined();
    const body = JSON.parse(String((registerCall as [RequestInfo, RequestInit])[1].body)) as Record<
      string,
      unknown
    >;
    expect(body.programId).toBe('prg-domestic');
    expect(body.firstName).toBe('Ana');
    expect(body.lastName).toBe('Nueva');
    expect(body.email).toBe('ana.nueva@example.com');
    expect(body.password).toBe('password123');
    expect(body.qualificationAnswers).toEqual([{ questionId: 'qual-001', answer: 'Yes' }]);
    expect(body.idDocument).toEqual({
      fileName: 'id-copy.pdf',
      mimeType: 'application/pdf',
      sizeBytes: idFile.size,
      data: expect.stringMatching(/^data:application\/pdf;base64,/),
    });
    expect(body.referralCode).toBeUndefined();
    // verificationId is BE-authoritative and passed through registration (backward compat if absent, but present when location succeeded)
    expect(body.verificationId).toBe('550e8400-e29b-41d4-a716-446655440001');
  }, 30000);
});
