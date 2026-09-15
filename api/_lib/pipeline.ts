import {
  adjustmentSchema,
  adminMemberSchema,
  catalogPropertySchema,
  customerSchema,
  memberProfileSchema,
  payoutAccountSchema,
  registrationSchema,
  saleSchema,
  voucherSchema,
  voucherAssignmentSchema,
  voucherTemplateSchema,
} from '@jad/contracts';
import { maskIdentifier } from './money.js';

/**
 * Shared member-pipeline logic for api/ handlers (Phase B3).
 * Pure functions — unit-tested. Handlers own Supabase I/O; all state-machine
 * rules live here so admin and member surfaces cannot drift apart.
 */

/** Allowed admin-driven status transitions (member resubmit/reopen handled separately). */
export const SALE_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['ADMIN_APPROVED', 'REJECTED'],
  ADMIN_APPROVED: ['PAYMENT_VERIFIED', 'REJECTED'],
  PAYMENT_VERIFIED: ['QUALIFYING_SALE', 'REJECTED'],
  REJECTED: [],
  LOCKED: [],
  QUALIFYING_SALE: [],
};

/** Validate an admin PATCH transition. Returns an error message or null. */
export function validateSaleTransition(
  currentStatus: string,
  patch: { status?: string; rejectionReason?: string },
): string | null {
  if (patch.status === undefined) return null;
  const allowed = SALE_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(patch.status)) {
    return `Cannot transition sale from ${currentStatus} to ${patch.status}.`;
  }
  if (patch.status === 'REJECTED' && !(patch.rejectionReason ?? '').trim()) {
    return 'A rejection reason is required.';
  }
  return null;
}

/** Member resubmit outcome: increments, locks at max, or rejects illegal states. */
export function applyResubmit(
  currentStatus: string,
  resubmissionCount: number,
  maxAttempts: number,
): { status: string; resubmissionCount: number } | { error: string } {
  if (currentStatus !== 'REJECTED') {
    return { error: 'Only a rejected sale can be resubmitted.' };
  }
  if (resubmissionCount >= maxAttempts) {
    return { error: 'This sale has reached the maximum resubmission attempts and is locked.' };
  }
  const next = resubmissionCount + 1;
  if (next >= maxAttempts) {
    return { status: 'LOCKED', resubmissionCount: next };
  }
  return { status: 'SUBMITTED', resubmissionCount: next };
}

export function calculateAge(dateOfBirth: string, now = new Date()): number {
  const birth = new Date(dateOfBirth);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export function prefixedId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

/**
 * Resolve a catalog listing from CMS `properties` content. Returns null when
 * the listing is missing or has no usable price (mirrors the mock catalog
 * guard; INACTIVE enforcement arrives with the B5 Property table).
 */
export function findCatalogPrice(
  content: unknown,
  propertyId: string,
): { name: string; price: string } | null {
  const root = content as {
    properties?: { id?: unknown; name?: unknown; price?: unknown }[];
  } | null;
  const props = root?.properties;
  if (!Array.isArray(props)) return null;
  const found = props.find((p) => p?.id === propertyId);
  if (!found || typeof found.name !== 'string' || !found.name) return null;
  const price = typeof found.price === 'string' ? found.price : '';
  if (!price || price === '0.00') return null;
  return { name: found.name, price };
}

function splitName(
  firstName: unknown,
  lastName: unknown,
  fallback: unknown,
): { firstName: string; lastName: string } {
  if (typeof firstName === 'string' && firstName && typeof lastName === 'string' && lastName) {
    return { firstName, lastName };
  }
  const parts = String(fallback ?? '').split(' ');
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

const PROGRAM_NAMES: Record<string, { code: string; name: string }> = {
  'prg-domestic': { code: 'DOMESTIC', name: 'Domestic Program' },
  'prg-abroad': { code: 'ABROAD', name: 'Abroad Program' },
};

export function mapMemberRow(
  row: Record<string, unknown>,
  programs?: Map<string, { code: string; name: string }>,
) {
  const names = splitName(row.firstName, row.lastName, row.name);
  const programId = typeof row.programId === 'string' ? row.programId : 'prg-domestic';
  const program =
    programs?.get(programId) ??
    PROGRAM_NAMES[programId] ??
    ({ id: programId, code: 'DOMESTIC', name: 'Domestic Program' } as const);
  return {
    id: row.id,
    ...names,
    dateOfBirth: row.dateOfBirth ?? '1990-01-01',
    age: calculateAge(typeof row.dateOfBirth === 'string' ? row.dateOfBirth : '1990-01-01'),
    gender: row.gender ?? 'Male',
    // Nullable text columns normalize to undefined so optional schema
    // fields validate (a null address must not hide the whole row).
    address: (row.address as string | null | undefined) ?? undefined,
    countryCode: row.countryCode ?? 'PH',
    countryName: row.countryName ?? 'Philippines',
    phone: row.phone ?? '',
    email: row.email ?? '',
    referralCode: row.referralCode ?? '',
    status: row.status,
    isQualified: row.isQualified ?? false,
    program: { id: programId, ...program },
    accountStatus: row.accountStatus ?? 'ACTIVE',
    registeredAt: row.createdAt ?? new Date().toISOString(),
    registrationId: row.registrationId ?? '',
  };
}

export function isValidMemberRow(row: Record<string, unknown>): boolean {
  return memberProfileSchema.safeParse(mapMemberRow(row)).success;
}

export function mapAdminMemberRow(
  row: Record<string, unknown>,
  programs?: Map<string, { code: string; name: string }>,
) {
  return {
    ...mapMemberRow(row, programs),
    accountStatus: row.accountStatus ?? 'ACTIVE',
    registeredAt:
      typeof row.registeredAt === 'string'
        ? row.registeredAt
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : new Date().toISOString(),
    registrationId: typeof row.registrationId === 'string' ? row.registrationId : undefined,
  };
}

export function isValidAdminMemberRow(row: Record<string, unknown>): boolean {
  return adminMemberSchema.safeParse(mapAdminMemberRow(row)).success;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value ? value : undefined;
}

function asCountryCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asOptionalEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** DATE columns arrive as "YYYY-MM-DD"; tolerate Date instances defensively. */
function asDateString(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

/** Timestamptz columns arrive as ISO strings; tolerate Date instances. */
function asIsoString(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

/**
 * Government-ID payloads are best-effort: a missing or malformed file object
 * degrades to undefined (the detail page shows its "no file" state) instead
 * of hiding the whole application from the review queue.
 */
function asGovernmentId(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.fileName !== 'string' || !record.fileName) return undefined;
  if (typeof record.mimeType !== 'string' || !record.mimeType) return undefined;
  if (
    typeof record.sizeBytes !== 'number' ||
    !Number.isInteger(record.sizeBytes) ||
    record.sizeBytes <= 0
  ) {
    return undefined;
  }
  const cleaned: Record<string, unknown> = {
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
  };
  if (typeof record.storagePath === 'string' && record.storagePath) {
    cleaned.storagePath = record.storagePath;
  }
  if (typeof record.data === 'string' && record.data) {
    cleaned.data = record.data;
  }
  return cleaned;
}

/**
 * Qualification answers are best-effort: invalid items are filtered so one
 * bad answer never hides the application. Non-arrays degrade to [].
 */
function asQualificationAnswers(value: unknown): { questionId: string; answer: string }[] {
  if (!Array.isArray(value)) return [];
  const items: { questionId: string; answer: string }[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.questionId !== 'string' || !record.questionId) continue;
    if (typeof record.answer !== 'string' || !record.answer) continue;
    items.push({ questionId: record.questionId, answer: record.answer });
  }
  return items;
}

/** Rejection notes pass through when shaped, otherwise degrade to undefined. */
function asRejectionNote(value: unknown): { reason: string; requiredChanges: string } | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.reason !== 'string' || !record.reason) return undefined;
  if (typeof record.requiredChanges !== 'string' || !record.requiredChanges) return undefined;
  return { reason: record.reason, requiredChanges: record.requiredChanges };
}

export function mapRegistrationRow(row: Record<string, unknown>) {
  // PostgREST serializes nullable columns as JSON null and DATE/timestamptz
  // columns as strings (a DATE arrives as "YYYY-MM-DD"). `z.string()` rejects
  // `null`, so every nullable/optional field must coalesce to `undefined` or
  // the row fails validation and is silently dropped from the queue while the
  // dashboard count (`head` count, no validation) still includes it.
  // Required-but-nullable-in-DB fields (phone, dateOfBirth, gender,
  // countryCode/Name, programId/Code) map null/"" to undefined so the failure
  // surfaces as an explicit missing-field path in the server warn log instead
  // of a null-type error. governmentId/qualificationAnswers are lenient by
  // design: a malformed file payload or answer item degrades to "no file" /
  // filtered answers so a PENDING application is never hidden from review.
  const submittedAt = asIsoString(row.submittedAt) ?? asIsoString(row.createdAt);
  const createdAt = asIsoString(row.createdAt) ?? submittedAt;
  const updatedAt = asIsoString(row.updatedAt) ?? submittedAt;
  return {
    id: row.id,
    status: row.status,
    firstName: asNonEmptyString(row.firstName),
    middleInitial: asOptionalString(row.middleInitial),
    lastName: asNonEmptyString(row.lastName),
    nameSuffix: asOptionalString(row.nameSuffix),
    email: asOptionalEmail(row.email),
    phone: asNonEmptyString(row.phone),
    dateOfBirth: asDateString(row.dateOfBirth),
    gender: asNonEmptyString(row.gender),
    countryCode: asCountryCode(row.countryCode),
    countryName: asNonEmptyString(row.countryName),
    address: asOptionalString(row.address),
    programId: asNonEmptyString(row.programId),
    programCode: asNonEmptyString(row.programCode),
    referralCode: asOptionalString(row.referralCode),
    qualificationAnswers: asQualificationAnswers(row.qualificationAnswers),
    governmentId: asGovernmentId(row.governmentId),
    submittedAt,
    createdAt,
    updatedAt,
    reviewedAt: asIsoString(row.reviewedAt),
    reviewedBy: asOptionalString(row.reviewedBy),
    rejectionNote: asRejectionNote(row.rejectionNote),
  };
}

export function isValidRegistrationRow(row: Record<string, unknown>): boolean {
  return registrationSchema.safeParse(mapRegistrationRow(row)).success;
}

export function mapCustomerRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    // Idempotent: accept already-mapped keys so validate-after-map in list
    // handlers never drops valid rows on the second pass.
    sellerId: row.memberId ?? row.sellerId,
    fullName: row.name ?? row.fullName,
    // Phone is contract-required: fall back to an explicit placeholder so a
    // missing number never drops the row from admin lists.
    phone: row.phone ?? '—',
    email: row.email ?? undefined,
  };
}

export function isValidCustomerRow(row: Record<string, unknown>): boolean {
  return customerSchema.safeParse(mapCustomerRow(row)).success;
}

export function mapSaleRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    propertyValue: row.propertyValue,
    customerId: row.customerId,
    customerName: row.customerName,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    submittedAt: row.submittedAt,
    resubmissionCount: row.resubmissionCount ?? 0,
    approvedAt: row.approvedAt ?? undefined,
    paymentVerifiedAt: row.paymentVerifiedAt ?? undefined,
    lockedAt: row.lockedAt ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    ...(row.referrerName !== undefined && row.referrerName !== null
      ? { referrerName: row.referrerName }
      : {}),
  };
}

export function isValidSaleRow(row: Record<string, unknown>): boolean {
  return saleSchema.safeParse(mapSaleRow(row)).success;
}

/**
 * B5 money-list mappers. DB columns are camelCase (quoted) to match the
 * contract shapes; `categorySlug` is the only rename (`categoryId` on the
 * wire). Timestamptz columns arrive as ISO strings; numeric-as-text amounts
 * pass through untouched (no float math — exact-decimal strings end to end).
 */

export function mapPropertyRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    // Idempotent: accept the already-mapped key (see mapCustomerRow).
    categoryId: row.categorySlug ?? row.categoryId,
    price: row.price ?? undefined,
    status: row.status,
  };
}

export function isValidPropertyRow(row: Record<string, unknown>): boolean {
  return catalogPropertySchema.safeParse(mapPropertyRow(row)).success;
}

export function mapPayoutAccountRow(row: Record<string, unknown>) {
  const raw =
    typeof row.accountIdentifier === 'string' && row.accountIdentifier
      ? row.accountIdentifier
      : undefined;
  return {
    id: row.id,
    method: row.method,
    accountName: row.accountName,
    // Tables render the masked value; detail modals render the raw value
    // when present (owner/staff reads). Rows that only carry a pre-masked
    // value (legacy admin seeds) pass through, defaulting to full mask.
    accountIdentifierMasked: raw
      ? maskIdentifier(raw)
      : ((row.accountIdentifierMasked as string | undefined) ?? '••••'),
    ...(raw ? { accountIdentifier: raw } : {}),
    status: row.status,
    isPrimary: row.isPrimary ?? false,
    createdAt: row.createdAt,
    rejectionReason: row.rejectionReason ?? undefined,
  };
}

export function isValidPayoutAccountRow(row: Record<string, unknown>): boolean {
  return payoutAccountSchema.safeParse(mapPayoutAccountRow(row)).success;
}

export function mapVoucherTemplateRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    originalValue: row.originalValue,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
    validityDays: typeof row.validityDays === 'number' ? row.validityDays : undefined,
  };
}

export function isValidVoucherTemplateRow(row: Record<string, unknown>): boolean {
  return voucherTemplateSchema.safeParse(mapVoucherTemplateRow(row)).success;
}

export function mapVoucherRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    originalValue: row.originalValue,
    remainingValue: row.remainingValue,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
    // Nullable redemption columns (set by the redeem handler) coalesce like
    // every other optional field so a row is never dropped over a null.
    redeemedAt: asIsoString(row.redeemedAt),
    redeemedBy: asOptionalString(row.redeemedBy),
  };
}

export function isValidVoucherRow(row: Record<string, unknown>): boolean {
  return voucherSchema.safeParse(mapVoucherRow(row)).success;
}

/** Admin assignment view — voucher plus template/member linkage. */
export function mapVoucherAssignmentRow(row: Record<string, unknown>) {
  return {
    ...mapVoucherRow(row),
    templateId: row.templateId,
    memberId: row.memberId,
    memberName: row.memberName,
  };
}

export function isValidVoucherAssignmentRow(row: Record<string, unknown>): boolean {
  return voucherAssignmentSchema.safeParse(mapVoucherAssignmentRow(row)).success;
}

export function mapAdjustmentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.memberName,
    entryType: row.entryType,
    direction: row.direction,
    amount: row.amount,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function isValidAdjustmentRow(row: Record<string, unknown>): boolean {
  return adjustmentSchema.safeParse(mapAdjustmentRow(row)).success;
}
