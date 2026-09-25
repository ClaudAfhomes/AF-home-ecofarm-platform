import { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, LoaderCircle, RefreshCw, ScanLine, Square } from 'lucide-react';
import {
  extractIdentity,
  MIN_REVIEW_CONFIDENCE,
  type ExtractionProgress,
  type IdentityExtraction,
} from '../lib/id-extraction';

type Props = {
  file?: File;
  extraction?: IdentityExtraction;
  onFile: (file: File | undefined) => void;
  onExtraction: (result: IdentityExtraction | undefined) => void;
};

export function IdDocumentScanner({ file, extraction, onFile, onExtraction }: Props) {
  const controllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => () => controllerRef.current?.abort(), []);

  const cancel = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setProgress(null);
    setError('On-device OCR cancelled. You can retry or continue with manual entry.');
  };

  const run = async (selected: File) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    onExtraction(undefined);
    try {
      const result = await extractIdentity(selected, setProgress, controller.signal);
      if (controller.signal.aborted) return;
      onExtraction(result);
      if (!result.rawText || result.confidence < MIN_REVIEW_CONFIDENCE) {
        setError('OCR confidence is low. Review every field or complete the form manually.');
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error
        ? `${reason.message}. Continue with manual entry or retry with a clearer image.`
        : 'OCR failed. Continue with manual entry or retry with a clearer image.');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setProgress(null);
    }
  };

  const selectFile = (selected?: File) => {
    onFile(selected);
    onExtraction(undefined);
    setError('');
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('Automatic scanning supports images. The PDF will remain private; complete the fields manually.');
      return;
    }
    void run(selected);
  };

  const percent = Math.round((progress?.progress ?? 0) * 100);

  return (
    <section className="id-scanner" aria-labelledby="id-scanner-title">
      <div className="ocr-note">
        <ScanLine />
        <div>
          <strong id="id-scanner-title">Local-first identity extraction</strong>
          <p>QR, barcode, and PDF417 are checked first. If none is found, Tesseract.js reads the image on this device. Staff review is mandatory.</p>
        </div>
      </div>

      <div className="qr-actions">
        <label className="primary upload-button">
          <ImageUp /> Select ID image
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
        </label>
        <label className="secondary upload-button">
          <Camera /> Use camera
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
        </label>
        {file && !progress && file.type.startsWith('image/') ? (
          <button type="button" className="secondary" onClick={() => void run(file)}>
            <RefreshCw /> Retry scan
          </button>
        ) : null}
        {progress ? (
          <button type="button" className="secondary" onClick={cancel}>
            <Square /> Cancel
          </button>
        ) : null}
      </div>

      {file ? <p className="muted">Selected: {file.name}</p> : null}
      {progress ? (
        <div className="ocr-progress" role="status">
          <LoaderCircle className="spin" />
          <div>
            <strong>{progress.message}</strong>
            <progress max={100} value={percent} />
            <small>{progress.phase === 'barcode' ? 'Machine-readable scan has priority.' : `${percent}% complete`}</small>
          </div>
        </div>
      ) : null}
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      {extraction ? (
        <div className="extraction-review" role="status">
          <p>
            <strong>Source:</strong> {extraction.source === 'barcode' ? `Machine-readable ${extraction.barcodeFormat ?? 'code'}` : 'On-device OCR'}
            {' · '}
            <strong>Confidence:</strong> {Math.round(extraction.confidence)}%
          </p>
          <details>
            <summary>Review raw extracted text</summary>
            <pre>{extraction.rawText || 'No text extracted.'}</pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
