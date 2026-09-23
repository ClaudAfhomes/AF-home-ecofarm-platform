import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, ImageUp, LoaderCircle, ScanLine, Square } from 'lucide-react';

export type QrScannerStatus = 'idle' | 'requesting' | 'scanning' | 'unsupported' | 'permission-denied' | 'error';

export function QrScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [status, setStatus] = useState<QrScannerStatus>('idle');
  const [message, setMessage] = useState('');

  const stopCamera = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  };

  useEffect(() => () => stopCamera(), []);

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      frameRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setStatus('error');
      setMessage('This browser could not create a camera scanning surface.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (result?.data) {
      stopCamera();
      onDetected(result.data);
      return;
    }
    frameRef.current = requestAnimationFrame(scanFrame);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setMessage('Camera scanning is not supported in this browser. Use image upload or manual entry.');
      return;
    }
    setStatus('requesting');
    setMessage('Allow camera access to scan an AFhomes QR code.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus('scanning');
      setMessage('Align the QR code inside the frame.');
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'permission-denied' : 'error');
      setMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera permission is required. You can still upload an image or enter the code manually.' : 'The camera could not be started.');
    }
  };

  const scanImage = async (file: File) => {
    setStatus('requesting');
    setMessage('Reading the uploaded image…');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (!result?.data) {
        setStatus('error');
        setMessage('No QR code was found in that image. Try a sharper, well-lit image.');
        return;
      }
      setStatus('idle');
      onDetected(result.data);
    } catch {
      setStatus('error');
      setMessage('The uploaded image could not be read. Try another image or enter the code manually.');
    }
  };

  return (
    <div className="qr-scanner">
      <div className="qr-camera-frame">
        <video ref={videoRef} muted playsInline aria-label="QR camera preview" />
        {status === 'scanning' && <ScanLine className="scan-line" aria-hidden />}
        {status === 'idle' && <div className="qr-camera-placeholder"><ScanLine /><span>Camera scanner ready</span></div>}
        {status === 'requesting' && <div className="qr-camera-placeholder"><LoaderCircle className="spin" /><span>{message}</span></div>}
      </div>
      <canvas ref={canvasRef} className="sr-only" />
      <div className="qr-actions">
        {status === 'scanning' ? <button className="secondary" type="button" onClick={stopCamera}><Square /> Stop camera</button> : <button className="primary" type="button" onClick={() => void startCamera()}><Camera /> Scan with camera</button>}
        <label className="secondary upload-button"><ImageUp /> Upload QR image<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanImage(file); event.currentTarget.value = ''; }} /></label>
      </div>
      {message && status !== 'requesting' && <p className={status === 'error' || status === 'permission-denied' || status === 'unsupported' ? 'qr-message error' : 'qr-message'} role="status">{message}</p>}
    </div>
  );
}
