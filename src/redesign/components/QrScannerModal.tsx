import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Button, Icon, Modal } from "../shared";

export interface QrScannerModalProps {
  open: boolean;
  siteName?: string;
  onScanned: (token: string) => void;
  onClose: () => void;
}

/**
 * Dynamic site QR scanner modal powered by `@zxing/browser` using the rear camera.
 */
export function QrScannerModal({
  open,
  siteName,
  onScanned,
  onClose,
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError(null);
    setStarting(true);
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    const stopScanner = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      const video = videoRef.current;
      if (video && video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };

    const start = async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setStarting(false);
        setError("Este navegador no permite acceder a la cámara para escanear códigos QR.");
        return;
      }
      const video = videoRef.current;
      if (!video) return;

      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (result, decodeErr) => {
            if (cancelled || handledRef.current) return;
            if (result) {
              const token = result.getText().trim();
              if (token) {
                handledRef.current = true;
                stopScanner();
                onScanned(token);
              }
              return;
            }
            if (decodeErr && decodeErr.name !== "NotFoundException") {
              // Ignore transient per-frame decoding misses.
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError("Permiso de cámara denegado. Autoriza el acceso para escanear el código QR de la sede.");
        } else {
          setError("No pudimos iniciar el escáner QR con la cámara trasera.");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, attempt, onScanned]);

  if (!open) return null;

  return (
    <Modal
      title="Escanear código QR de sede"
      close={onClose}
      footer={
        <Button secondary onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <p className="small-muted">
        {siteName
          ? `Apunta la cámara trasera al código QR dinámico en ${siteName}.`
          : "Apunta la cámara trasera al código QR dinámico de la sede."}
      </p>
      <div className="pn-qr-stage">
        <video ref={videoRef} autoPlay playsInline muted />
        {starting && !error && <div className="pn-live-camera-overlay">Iniciando escáner QR…</div>}
        <div className="pn-qr-reticle" aria-hidden="true" />
      </div>
      {error && (
        <div className="pn-info" role="alert">
          <Icon name="qr_code_scanner" size={18} />
          <span>{error}</span>
          <Button secondary onClick={() => setAttempt((a) => a + 1)}>
            Reintentar
          </Button>
        </div>
      )}
    </Modal>
  );
}
