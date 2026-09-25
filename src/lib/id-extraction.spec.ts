import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureUrl from '../test/fixtures/synthetic-redacted-id.png';
import { extractIdentity, parseIdentityText } from './id-extraction';

const { decodeFromImageUrl, createWorker, recognize, terminate } = vi.hoisted(() => ({
  decodeFromImageUrl: vi.fn(),
  createWorker: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromImageUrl = decodeFromImageUrl;
  },
}));

vi.mock('tesseract.js', () => ({ createWorker }));

describe('identity extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:synthetic-id'),
      revokeObjectURL: vi.fn(),
    });
    terminate.mockResolvedValue(undefined);
    createWorker.mockResolvedValue({ recognize, terminate });
  });

  it('parses supported editable fields from a non-real redacted ID fixture', () => {
    expect(fixtureUrl).toContain('synthetic-redacted-id');
    expect(parseIdentityText([
      'SYNTHETIC TEST ID',
      'NOT A REAL ID',
      'NAME: REDACTED PERSON',
      'DATE OF BIRTH: 2000-01-01',
      'SEX: X',
      'ADDRESS: 123 TEST STREET',
      'ID NUMBER: TEST-0000',
      'EXPIRY: 2099-12-31',
    ].join('\n'))).toMatchObject({
      firstName: 'REDACTED',
      lastName: 'PERSON',
      birthDate: '2000-01-01',
      sex: 'x',
      address: '123 TEST STREET',
      idNumber: 'TEST-0000',
      expirationDate: '2099-12-31',
    });
  });

  it('uses machine-readable data before starting OCR', async () => {
    decodeFromImageUrl.mockResolvedValue({
      getText: () => 'NAME: BARCODE PERSON\nID NUMBER: ZX-100',
      getBarcodeFormat: () => 'PDF_417',
    });
    const result = await extractIdentity(
      new File(['synthetic'], 'synthetic-redacted-id.png', { type: 'image/png' }),
      vi.fn(),
      new AbortController().signal,
    );
    expect(result).toMatchObject({ source: 'barcode', confidence: 100, barcodeFormat: 'PDF_417' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('falls back to on-device OCR when no machine-readable code exists', async () => {
    decodeFromImageUrl.mockRejectedValue(new Error('Not found'));
    recognize.mockResolvedValue({
      data: {
        text: 'NAME: REDACTED PERSON\nID NUMBER: TEST-0000',
        confidence: 87,
      },
    });
    const result = await extractIdentity(
      new File(['synthetic'], 'synthetic-redacted-id.png', { type: 'image/png' }),
      vi.fn(),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      source: 'ocr',
      confidence: 87,
      fields: { firstName: 'REDACTED', lastName: 'PERSON', idNumber: 'TEST-0000' },
    });
    expect(terminate).toHaveBeenCalled();
  });
});
