import type { IdDocument, QualificationAnswer } from '@jad/contracts';

/**
 * Multi-step registration draft validation (SCR-AUTH-002/005).
 * UX validation only - the client is never the security boundary. Rules stay
 * within documented requirements (BR-REG-001..013); the 8-character password
 * minimum remains ASSUMPTION 1 (TBD) as in the login/register previews.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const SPONSOR_CODE_MAX_LENGTH = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;
/** ID file cap - matches the API 3 MB limit (base64 must fit Function bodies). */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

export interface RegistrationDraft {
  programId: string;
  firstName: string;
  middleInitial: string;
  lastName: string;
  nameSuffix: string;
  dateOfBirth: string;
  gender: string;
  genderOther: string;
  countryCode: string;
  address: string;
  phone: string;
  answers: Record<string, string>;
  referralCode: string;
  idDocument?: IdDocument;
  email: string;
  password: string;
  confirmPassword: string;
  consent: boolean;
}

export function createEmptyDraft(): RegistrationDraft {
  return {
    programId: '',
    firstName: '',
    middleInitial: '',
    lastName: '',
    nameSuffix: '',
    dateOfBirth: '',
    gender: '',
    genderOther: '',
    countryCode: '',
    address: '',
    phone: '',
    answers: {},
    referralCode: '',
    idDocument: undefined,
    email: '',
    password: '',
    confirmPassword: '',
    consent: false,
  };
}

function ageFromDateOfBirth(dateOfBirth: string, now = new Date()): number {
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return -1;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function cutoffDateForMinAge(minAge: number, now = new Date()): string {
  const y = now.getFullYear() - minAge;
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Step 0 - program choice + personal profile (BR-REG-001/002/008/010/011). */
export function validateProgramProfile(
  draft: RegistrationDraft,
  minAge: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.programId) errors.programId = 'Select a program.';
  if (!draft.firstName.trim()) errors.firstName = 'Enter your first name.';
  if (draft.middleInitial && draft.middleInitial.length > 1)
    errors.middleInitial = 'One initial only.';
  if (!draft.lastName.trim()) errors.lastName = 'Enter your last name.';
  if (!draft.dateOfBirth) {
    errors.dateOfBirth = 'Enter your date of birth.';
  } else {
    const age = ageFromDateOfBirth(draft.dateOfBirth);
    if (age < 0) errors.dateOfBirth = 'Enter a valid date of birth.';
    else if (age < minAge) errors.dateOfBirth = `You must be at least ${minAge} years old to join.`;
  }
  if (!draft.gender) errors.gender = 'Select your gender.';
  else if (draft.gender === 'Others' && !draft.genderOther.trim()) {
    errors.genderOther = 'Please specify your gender identity.';
  } else if (draft.gender === 'Others' && draft.genderOther.trim().length > 60) {
    errors.genderOther = 'Gender identity must be 60 characters or less.';
  }
  if (!draft.countryCode) errors.countryCode = 'Select your country.';
  if (!draft.phone.trim()) errors.phone = 'Enter your phone number.';
  else if (!PHONE_RE.test(draft.phone.trim())) errors.phone = 'Enter a valid phone number.';
  return errors;
}

/** Step 1 - qualification questions answered (FR-REG-003; content TBD OD-002). */
export function validateQualification(
  answers: Record<string, string>,
  questions: { id: string; questionText: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of questions) {
    if (!answers[question.id]?.trim()) {
      errors[`answer_${question.id}`] = 'Answer this question to continue.';
    }
  }
  return errors;
}

/** Step 2 - optional referral code (BR-REG-006; validated server-side). */
export function validateReferralCode(referralCode: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (referralCode.trim().length > SPONSOR_CODE_MAX_LENGTH) {
    errors.referralCode = 'Referral code is too long.';
  }
  return errors;
}

/** Step 3 - government ID upload (FR-REG-002, FEAT-010). File bytes ride along
 * as base64 for the API upload; metadata alone is a legacy shape. */
export function validateIdDocument(idDocument: IdDocument | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!idDocument) {
    errors.idDocument = 'Attach a clear copy of a valid government-issued ID.';
  } else if (idDocument.sizeBytes > MAX_FILE_BYTES) {
    errors.idDocument = 'File is too large - attach an ID copy under 5 MB.';
  }
  return errors;
}

/** Step 4 - account credentials + terms consent. */
export function validateAccount(draft: RegistrationDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = draft.email.trim();
  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!draft.password) errors.password = 'Enter a password.';
  else if (draft.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!draft.confirmPassword) errors.confirmPassword = 'Confirm your password.';
  else if (draft.confirmPassword !== draft.password)
    errors.confirmPassword = 'Passwords do not match.';
  if (!draft.consent)
    errors.consent = 'Please accept the member terms and privacy policy to continue.';
  return errors;
}

/** First invalid field id, in display order - for focus management. */
export function firstInvalidField(
  errors: Record<string, string>,
  order: string[],
): string | undefined {
  return order.find((field) => errors[field] !== undefined);
}

export function answersToQualification(
  answers: Record<string, string>,
  questions: { id: string }[],
): QualificationAnswer[] {
  return questions
    .filter((question) => answers[question.id]?.trim())
    .map((question) => ({ questionId: question.id, answer: answers[question.id]!.trim() }));
}

/** Step field id order for focus management. */
export const STEP_FIELD_ORDER: Record<number, string[]> = {
  0: [
    'programId',
    'firstName',
    'middleInitial',
    'lastName',
    'nameSuffix',
    'dateOfBirth',
    'gender',
    'genderOther',
    'countryCode',
    'address',
    'phone',
  ],
  1: ['qualification'],
  2: ['referralCode'],
  3: ['idDocument'],
  4: ['email', 'password', 'confirmPassword', 'consent'],
};
