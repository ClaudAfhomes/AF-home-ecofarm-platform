/**
 * Government ID document storage (Phase B8+). Private bucket, base64-JSON
 * transport (same as the CMS upload endpoint), fail-closed ordering
 * (database row first, file second - never an orphaned file).
 */

export const GOVERNMENT_ID_BUCKET = 'government-ids';

/** 3 MB - fits a base64 payload inside Vercel Function body limits. */
export const GOVERNMENT_ID_MAX_BYTES = 3 * 1024 * 1024;

/** IDs are scans/photos: images plus PDF. */
export const GOVERNMENT_ID_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** Signed-URL lifetime for admin viewing (seconds). */
export const GOVERNMENT_ID_URL_TTL_SECONDS = 60;

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        options?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
};

export function safeDocumentName(fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return safe || 'document';
}

function decodeBase64(data: string): Buffer | null {
  try {
    const comma = data.indexOf(',');
    const raw = comma === -1 ? data : data.slice(comma + 1);
    if (!raw) return null;
    return Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
}

export function validateDocumentUpload(input: {
  fileName?: unknown;
  mimeType?: unknown;
  data?: unknown;
}):
  | { ok: true; fileName: string; mimeType: string; buffer: Buffer }
  | { ok: false; message: string } {
  const fileName = typeof input.fileName === 'string' ? input.fileName : '';
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType : '';
  if (!(GOVERNMENT_ID_MIME_ALLOWLIST as readonly string[]).includes(mimeType)) {
    return { ok: false, message: 'Government ID must be JPG, PNG, WebP, or PDF.' };
  }
  if (typeof input.data !== 'string' || !input.data) {
    return { ok: false, message: 'Government ID file data is missing.' };
  }
  const buffer = decodeBase64(input.data);
  if (!buffer || buffer.length === 0) {
    return { ok: false, message: 'Government ID file data is invalid.' };
  }
  if (buffer.length > GOVERNMENT_ID_MAX_BYTES) {
    return { ok: false, message: 'Government ID must be 3 MB or less.' };
  }
  return { ok: true, fileName, mimeType, buffer };
}

/**
 * Upload an ID document under `government-ids/<registrationId>/…`.
 * Returns the storage path (persisted on the row) or an error message.
 * Callers own row ordering: insert/update the row first, upload second.
 */
export async function uploadGovernmentId(
  supabase: StorageClient,
  registrationId: string,
  input: { fileName?: unknown; mimeType?: unknown; data?: unknown },
): Promise<{ ok: true; storagePath: string } | { ok: false; message: string }> {
  const validated = validateDocumentUpload(input);
  if (!validated.ok) return validated;
  const key = `${registrationId}/${Date.now()}-${safeDocumentName(validated.fileName)}`;
  const { error } = await supabase.storage
    .from(GOVERNMENT_ID_BUCKET)
    .upload(key, validated.buffer, {
      contentType: validated.mimeType,
      upsert: false,
    });
  if (error) return { ok: false, message: error.message };
  return { ok: true, storagePath: key };
}

/** Mint a short-lived viewer URL for an uploaded document. */
export async function signGovernmentIdUrl(
  supabase: StorageClient,
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.storage
    .from(GOVERNMENT_ID_BUCKET)
    .createSignedUrl(storagePath, GOVERNMENT_ID_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return { ok: false, message: error?.message ?? 'Sign failed' };
  return { ok: true, url: data.signedUrl };
}

/** Strip transient upload bytes before persisting a governmentId value. */
export function stripDocumentData(
  document: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!document || typeof document !== 'object') return document;
  const rest = { ...document };
  delete rest.data;
  return rest;
}
