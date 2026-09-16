import { useCallback, useEffect, useState } from 'react';

import { createEmptyDraft } from '../registrationValidation';
import type { RegistrationDraft } from '../registrationValidation';

const STORAGE_KEY = 'jad:register:draft:v1';

function isDraftEmpty(draft: RegistrationDraft): boolean {
  const empty = createEmptyDraft();
  return (
    draft.programId === empty.programId &&
    draft.firstName === empty.firstName &&
    draft.middleInitial === empty.middleInitial &&
    draft.lastName === empty.lastName &&
    draft.nameSuffix === empty.nameSuffix &&
    draft.dateOfBirth === empty.dateOfBirth &&
    draft.gender === empty.gender &&
    draft.genderOther === empty.genderOther &&
    draft.countryCode === empty.countryCode &&
    draft.address === empty.address &&
    draft.phone === empty.phone &&
    draft.referralCode === empty.referralCode &&
    draft.email === empty.email &&
    draft.password === empty.password &&
    draft.confirmPassword === empty.confirmPassword &&
    draft.consent === empty.consent &&
    draft.idDocument === undefined &&
    Object.keys(draft.answers).length === 0
  );
}

function loadPersistedDraft(): Partial<RegistrationDraft> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrationDraft>;
    // basic shape validation — ensure at least one known field
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedDraft(draft: RegistrationDraft): void {
  try {
    if (isDraftEmpty(draft)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // storage may be unavailable (e.g., private mode) — ignore
  }
}

export function clearPersistedDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function usePersistedDraft(
  mode: 'create' | 'resubmit',
  initialDraft?: Partial<RegistrationDraft>,
): [
  RegistrationDraft,
  React.Dispatch<React.SetStateAction<RegistrationDraft>>,
  () => void,
  boolean,
] {
  const [draft, setDraft] = useState<RegistrationDraft>(() => {
    const empty = createEmptyDraft();
    const base = { ...empty, ...initialDraft };
    if (mode !== 'create') return base;
    const persisted = loadPersistedDraft();
    if (persisted) {
      // persisted draft takes precedence except for explicit initialDraft override (empty)
      // For create mode initialDraft is undefined, so persisted wins
      return { ...empty, ...persisted } as RegistrationDraft;
    }
    return base;
  });

  const isDirty = !isDraftEmpty(draft);

  // Persist on change (create mode only)
  useEffect(() => {
    if (mode !== 'create') return;
    savePersistedDraft(draft);
  }, [draft, mode]);

  // beforeunload guard
  useEffect(() => {
    if (mode !== 'create') return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      // Modern browsers ignore custom message but require returnValue set
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, mode]);

  const clear = useCallback(() => {
    clearPersistedDraft();
  }, []);

  return [draft, setDraft, clear, isDirty];
}
