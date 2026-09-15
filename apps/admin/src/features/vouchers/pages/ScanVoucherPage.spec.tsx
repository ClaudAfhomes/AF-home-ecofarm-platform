import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { ScanVoucherPage } from './ScanVoucherPage';

const decodeMock = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock('../lib/qrDecode', () => ({ decodeQrImageData: decodeMock.decode }));

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;

function makeImageFile(): File {
  return new File(['qr'], 'voucher-qr.png', { type: 'image/png' });
}

/** Stub Image + canvas so the upload decode path completes synchronously in jsdom. */
function stubImageDecode() {
  class FakeImage {
    naturalWidth = 4;
    naturalHeight = 4;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => ({
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 4, height: 4 }) as ImageData,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

function uploadFile(upload: HTMLInputElement, file: File) {
  fireEvent.change(upload, { target: { files: [file] } });
}

describe('ScanVoucherPage', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
    // Camera unavailable in jsdom — the manual/upload paths are what we test.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });
    decodeMock.decode.mockReset();
  });

  afterEach(() => {
    server.restore();
    vi.unstubAllGlobals();
    if (originalGetContext) HTMLCanvasElement.prototype.getContext = originalGetContext;
    originalGetContext = undefined;
  });

  it('renders the scanner page with manual entry and upload fallbacks', async () => {
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    expect(await screen.findByText('Scan Voucher QR')).toBeInTheDocument();
    expect(screen.getByLabelText('Voucher code')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload QR image')).toBeInTheDocument();
  });

  it('resolves a scanned code and shows the voucher result', async () => {
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const input = await screen.findByLabelText('Voucher code');
    await userEvent.type(input, 'JAD-VCH-2026-101');
    await userEvent.click(screen.getByText('Look up'));

    expect(await screen.findByTestId('scan-result')).toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('JAD-VCH-2026-101')).toBeInTheDocument();
    expect(screen.getByText('Redeem voucher')).toBeInTheDocument();
  });

  it('shows an error for an unknown code', async () => {
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const input = await screen.findByLabelText('Voucher code');
    await userEvent.type(input, 'JAD-VCH-2026-999');
    await userEvent.click(screen.getByText('Look up'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no voucher matches/i);
  });

  it('redeems a verified voucher after confirmation', async () => {
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const input = await screen.findByLabelText('Voucher code');
    await userEvent.type(input, 'JAD-VCH-2026-101');
    await userEvent.click(screen.getByText('Look up'));
    await screen.findByTestId('scan-result');

    await userEvent.click(screen.getByText('Redeem voucher'));
    await userEvent.click(screen.getByText('Confirm redeem'));

    expect(await screen.findByText('Fully redeemed')).toBeInTheDocument();
    expect(screen.queryByText('Redeem voucher')).not.toBeInTheDocument();
  });

  it('rejects a scan of an already-redeemed voucher', async () => {
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const input = await screen.findByLabelText('Voucher code');
    await userEvent.type(input, 'JAD-VCH-2026-104');
    await userEvent.click(screen.getByText('Look up'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been redeemed/i);
  });

  it('decodes an uploaded QR image and shows the voucher result', async () => {
    stubImageDecode();
    decodeMock.decode.mockReturnValueOnce('JAD-VCH-2026-102');
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const upload = (await screen.findByLabelText('Upload QR image')) as HTMLInputElement;
    uploadFile(upload, makeImageFile());

    expect(await screen.findByTestId('scan-result')).toBeInTheDocument();
    expect(screen.getByText('Pedro Reyes')).toBeInTheDocument();
    expect(screen.getByText('JAD-VCH-2026-102')).toBeInTheDocument();
    expect(screen.getByText('Redeem voucher')).toBeInTheDocument();
  });

  it('shows an inline error when the uploaded image has no QR code', async () => {
    stubImageDecode();
    decodeMock.decode.mockReturnValueOnce(null);
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const upload = (await screen.findByLabelText('Upload QR image')) as HTMLInputElement;
    uploadFile(upload, makeImageFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(/no QR code was found/i);
    expect(screen.queryByTestId('scan-result')).not.toBeInTheDocument();
  });

  it('rejects a non-image upload', async () => {
    renderWithProviders(<ScanVoucherPage />, { user: MOCK_ADMIN });
    const upload = (await screen.findByLabelText('Upload QR image')) as HTMLInputElement;
    uploadFile(upload, new File(['x'], 'note.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/jpg, png or webp/i);
  });
});
