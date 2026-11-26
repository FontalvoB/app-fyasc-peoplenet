import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon } from "../shared";

export interface LiveCameraCaptureResult {
  blob: Blob;
  capturedAtIso: string;
}

export interface LiveCameraCaptureProps {
  onConfirm: (result: LiveCameraCaptureResult) => void;
  onCancel?: () => void;
  initialFacingMode?: "user" | "environment";
  title?: string;
}

const MAX_DIMENSION_PX = 1280;
const JPEG_QUALITY = 0.82;

function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "El navegador denegó el acceso a la cámara. Habilita el permiso en la configuración del sitio e inténtalo de nuevo.";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "No detectamos una cámara disponible en este dispositivo.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.";
    }
  }
  return "No pudimos iniciar la cámara en vivo. Verifica los permisos e inténtalo de nuevo.";
}

/**
 * Live-only camera capture using `navigator.mediaDevices.getUserMedia` + `<video>` + `<canvas>`.
 * Gallery pickers (`<input type="file">`) are strictly forbidden by policy.
 */
export function LiveCameraCapture({
  onConfirm,
  onCancel,
  initialFacingMode = "user",
  title = "Fotografía en vivo",
}: LiveCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">(initialFacingMode);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<{
    blob: Blob;
    capturedAtIso: string;
    previewUrl: string;
  } | null>(null);

  const stopTracks = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      stopTracks();
      setError(null);
      setStarting(true);

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setStarting(false);
        setError("Este navegador no soporta captura de cámara en vivo (requiere HTTPS o contexto seguro).");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: MAX_DIMENSION_PX },
            height: { ideal: 960 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
      } catch (err) {
        setError(describeCameraError(err));
      } finally {
        setStarting(false);
      }
    },
    [stopTracks],
  );

  useEffect(() => {
    if (!captured) {
      void startCamera(facingMode);
    }
    return () => {
      stopTracks();
    };
  }, [facingMode, captured, startCamera, stopTracks]);

  useEffect(() => {
    return () => {
      if (captured?.previewUrl) {
        URL.revokeObjectURL(captured.previewUrl);
      }
    };
  }, [captured]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("La cámara aún está inicializando el video. Espera un segundo e inténtalo de nuevo.");
      return;
    }

    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("No se pudo procesar el cuadro de la cámara.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const capturedAtIso = new Date().toISOString();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("No se pudo generar la fotografía en formato JPEG.");
          return;
        }
        stopTracks();
        const previewUrl = URL.createObjectURL(blob);
        setCaptured({ blob, capturedAtIso, previewUrl });
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  };

  const handleRetake = () => {
    if (captured?.previewUrl) {
      URL.revokeObjectURL(captured.previewUrl);
    }
    setCaptured(null);
  };

  const handleConfirm = () => {
    if (!captured) return;
    stopTracks();
    onConfirm({
      blob: captured.blob,
      capturedAtIso: captured.capturedAtIso,
    });
  };

  return (
    <div className="pn-live-camera">
      <div className="pn-live-camera-header">
        <strong>
          <Icon name="photo_camera" size={18} /> {title}
        </strong>
        {!captured && (
          <button
            type="button"
            className="pn-button secondary"
            onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
          >
            <Icon name="cameraswitch" size={17} />
            {facingMode === "user" ? "Usar trasera" : "Usar frontal"}
          </button>
        )}
      </div>

      <div className="pn-live-camera-stage">
        {captured ? (
          <img src={captured.previewUrl} alt="Vista previa de fotografía capturada" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}
        {!captured && starting && !error && (
          <div className="pn-live-camera-overlay">Activando cámara…</div>
        )}
      </div>

      {error && (
        <div className="pn-info" role="alert">
          <Icon name="videocam_off" size={18} />
          <span>{error}</span>
          <Button secondary onClick={() => void startCamera(facingMode)}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="pn-live-camera-actions">
        {captured ? (
          <>
            <Button secondary onClick={handleRetake}>
              <Icon name="refresh" size={17} /> Tomar otra
            </Button>
            <Button onClick={handleConfirm}>
              <Icon name="check" size={17} /> Usar foto
            </Button>
          </>
        ) : (
          <>
            {onCancel && (
              <Button
                secondary
                onClick={() => {
                  stopTracks();
                  onCancel();
                }}
              >
                Cancelar
              </Button>
            )}
            <Button disabled={starting || Boolean(error)} onClick={handleCapture}>
              <Icon name="camera" size={18} /> Capturar foto
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
