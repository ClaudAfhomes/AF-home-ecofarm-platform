export type ExtractionSource = 'barcode' | 'ocr' | 'manual';

export type IdentityDraft = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;
  sex?: string;
  address?: string;
  email?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
  expirationDate?: string;
};

export type IdentityExtraction = {
  source: ExtractionSource;
  rawText: string;
  confidence: number;
  barcodeFormat?: string;
  fields: IdentityDraft;
};

export type ExtractionProgress = {
  phase: 'barcode' | 'ocr-loading' | 'ocr';
  progress: number;
  message: string;
};

const valueAfterLabel = (text: string, labels: string[]) => {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:#-]?\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim();
};

const normalizedDate = (value?: string) => {
  if (!value) return undefined;
  const match = value.match(/(19|20)\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])(?=$|\D)/);
  if (!match) return undefined;
  const [year, month, day] = match[0].split(/[-/.]/);
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const parseName = (value?: string) => {
  if (!value) return {};
  const parts = value.replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return { firstName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts.at(-1) };
};

export function parseIdentityText(rawText: string): IdentityDraft {
  const text = rawText.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  const name = parseName(valueAfterLabel(text, ['LEGAL NAME', 'FULL NAME', 'NAME']));
  const sexValue = valueAfterLabel(text, ['SEX', 'GENDER'])?.toLowerCase();
  const sex = sexValue?.startsWith('f') ? 'female'
    : sexValue?.startsWith('m') ? 'male'
      : sexValue === 'x' ? 'x' : undefined;
  return {
    ...name,
    birthDate: normalizedDate(valueAfterLabel(text, ['DATE OF BIRTH', 'BIRTH DATE', 'DOB'])),
    sex,
    address: valueAfterLabel(text, ['ADDRESS']),
    email: valueAfterLabel(text, ['EMAIL', 'E-MAIL']),
    phone: valueAfterLabel(text, ['CONTACT NUMBER', 'PHONE', 'MOBILE']),
    idType: valueAfterLabel(text, ['ID TYPE', 'DOCUMENT TYPE']),
    idNumber: valueAfterLabel(text, ['ID NUMBER', 'DOCUMENT NUMBER', 'ID NO']),
    expirationDate: normalizedDate(valueAfterLabel(text, ['EXPIRATION DATE', 'EXPIRY', 'EXPIRES'])),
  };
}

export async function scanMachineReadable(file: File): Promise<IdentityExtraction | null> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const objectUrl = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(objectUrl);
    const rawText = result.getText().trim();
    if (!rawText) return null;
    return {
      source: 'barcode',
      rawText,
      confidence: 100,
      barcodeFormat: String(result.getBarcodeFormat()),
      fields: parseIdentityText(rawText),
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function recognizeIdentityImage(
  file: File,
  onProgress: (progress: ExtractionProgress) => void,
  signal: AbortSignal,
  timeoutMs = 45_000,
): Promise<IdentityExtraction> {
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let timedOut = false;
  const abort = async () => {
    if (worker) await worker.terminate();
  };
  const handleAbort = () => void abort();
  signal.addEventListener('abort', handleAbort, { once: true });
  const timeout = window.setTimeout(() => { timedOut = true; void abort(); }, timeoutMs);
  try {
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    onProgress({ phase: 'ocr-loading', progress: 0, message: 'Loading on-device OCR…' });
    worker = await createWorker('eng', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          onProgress({ phase: 'ocr', progress: message.progress, message: 'Reading ID text on this device…' });
        }
      },
    });
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    const result = await worker.recognize(file);
    return {
      source: 'ocr',
      rawText: result.data.text.trim(),
      confidence: result.data.confidence,
      fields: parseIdentityText(result.data.text),
    };
  } catch (error) {
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError');
    if (timedOut) throw new Error('On-device OCR timed out', { cause: error });
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', handleAbort);
    if (worker) await worker.terminate().catch(() => undefined);
  }
}

export async function extractIdentity(
  file: File,
  onProgress: (progress: ExtractionProgress) => void,
  signal: AbortSignal,
): Promise<IdentityExtraction> {
  onProgress({ phase: 'barcode', progress: 0, message: 'Checking QR, barcode, and PDF417 data…' });
  const machineReadable = await scanMachineReadable(file);
  if (machineReadable) return machineReadable;
  return recognizeIdentityImage(file, onProgress, signal);
}

export const MIN_REVIEW_CONFIDENCE = 60;
