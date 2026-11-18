import { useEffect, useState } from "react";
import { Icon } from "./shared";
import { toApiError } from "../lib/api";
import type {
  SolicitudDocumentoUploadRequest,
  SolicitudNovedadDocumentoResponse,
  SolicitudNovedadResponse,
} from "../lib/api-types";
import "./requests-attachments.css";

/** Límite de adjunto alineado al backend (5 MB por archivo). */
export const MAX_ATTACH_BYTES = 5 * 1024 * 1024;

/** Bytes → "245 KB"; null → "Sin dato". */
function fileLabel(n: number | null | undefined): string {
  if (n == null || n < 0) return "Sin dato";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Convierte un File a base64 puro (sin prefijo data:). */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Valida un archivo antes de añadirlo a la lista de soportes.
 * Permite solo PDF o imagen, menor a 5MB y sin duplicados en la lista actual.
 */
export function validateAttachmentFile(
  file: File,
  currentAttaches: SolicitudDocumentoUploadRequest[],
): { valid: boolean; error?: string; isPdf?: boolean } {
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);

  if (!isPdf && !isImage) {
    return {
      valid: false,
      error: `"${file.name}": Solo se admiten archivos PDF o imágenes.`,
    };
  }
  if (file.size >= MAX_ATTACH_BYTES) {
    return {
      valid: false,
      error: `"${file.name}": Supera el límite de 5 MB por archivo.`,
    };
  }
  const isDuplicate = currentAttaches.some(
    (a) => a.nombreArchivo === file.name && a.tamanoBytes === file.size,
  );
  if (isDuplicate) {
    return {
      valid: false,
      error: `"${file.name}": Ya fue agregado a los soportes.`,
    };
  }
  return { valid: true, isPdf };
}

/**
 * Determina si una URL pre-firmada de AWS S3 ha expirado examinando sus parámetros SigV4.
 * Si faltan los parámetros o no es formato SigV4, retorna false para permitir intento de descarga.
 */
function isPresignedUrlExpired(url: string | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    const amzDate =
      parsed.searchParams.get("X-Amz-Date") ||
      parsed.searchParams.get("x-amz-date");
    const amzExpires =
      parsed.searchParams.get("X-Amz-Expires") ||
      parsed.searchParams.get("x-amz-expires");

    if (!amzDate || !amzExpires) {
      return false;
    }

    const year = amzDate.substring(0, 4);
    const month = amzDate.substring(4, 6);
    const day = amzDate.substring(6, 8);
    const hour = amzDate.substring(9, 11);
    const min = amzDate.substring(11, 13);
    const sec = amzDate.substring(13, 15);
    const isoString = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
    const startDate = new Date(isoString).getTime();
    const expiresMs = Number(amzExpires) * 1000;

    if (Number.isNaN(startDate) || Number.isNaN(expiresMs)) return false;

    // Margen de seguridad de 10 segundos
    return Date.now() >= startDate + expiresMs - 10000;
  } catch {
    return false;
  }
}

/** Guarda un Blob como archivo descargado en el navegador usando atributo download. */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Determina el icono correspondiente al archivo según su tipo o nombre. */
function getFileIcon(name?: string | null, mime?: string | null): string {
  const isPdf =
    mime?.toLowerCase().includes("pdf") ||
    name?.toLowerCase().endsWith(".pdf");
  if (isPdf) return "picture_as_pdf";
  const isImage =
    mime?.toLowerCase().startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name ?? "");
  if (isImage) return "image";
  return "attach_file";
}

/** Componente: Lista de adjuntos en el formulario con opción de quitar. */
export function FormAttachmentList({
  attaches,
  onRemove,
}: {
  attaches: SolicitudDocumentoUploadRequest[];
  onRemove: (index: number) => void;
}) {
  if (attaches.length === 0) return null;

  return (
    <div className="pn-attach-list" aria-label="Soportes adjuntos">
      {attaches.map((item, index) => (
        <div className="pn-attach-item" key={`${item.nombreArchivo}-${index}`}>
          <div className="pn-attach-item-info">
            <span className="file-icon">
              <Icon name={getFileIcon(item.nombreArchivo, item.mimeType)} size={18} />
            </span>
            <div className="pn-attach-item-texts">
              <span className="pn-attach-item-name">{item.nombreArchivo}</span>
              <span className="pn-attach-item-size">
                {fileLabel(item.tamanoBytes)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="pn-attach-remove-btn"
            aria-label={`Quitar soporte ${item.nombreArchivo}`}
            title="Quitar soporte"
            onClick={() => onRemove(index)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Componente: Resumen de adjuntos en el aside del formulario. */
export function FormAsideAttachmentSummary({
  attaches,
}: {
  attaches: SolicitudDocumentoUploadRequest[];
}) {
  if (attaches.length === 0) return null;

  const totalBytes = attaches.reduce((acc, a) => acc + a.tamanoBytes, 0);

  return (
    <>
      <hr />
      <h3>Soportes preparados</h3>
      <p>
        {attaches.length} {attaches.length === 1 ? "archivo" : "archivos"} · {fileLabel(totalBytes)} en total
      </p>
    </>
  );
}

/**
 * Componente: Soportes adjuntos en el modal de detalle.
 * - Abrir: navega directamente a la URL prefirmada con noopener,noreferrer (sin Blob URLs).
 * - Descargar: descarga mediante Blob exclusivamente con el atributo download.
 * - Recuperación: renueva la URL una sola vez por GET de detalle ante 403 / expiración.
 */
export function DetailAttachments({
  documentos,
  onReloadDetail,
}: {
  documentos: SolicitudNovedadDocumentoResponse[];
  onReloadDetail: () => Promise<SolicitudNovedadResponse>;
}) {
  const [docs, setDocs] = useState<SolicitudNovedadDocumentoResponse[]>(documentos);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openFallback, setOpenFallback] = useState<string | null>(null);

  useEffect(() => {
    setDocs(documentos);
  }, [documentos]);

  if (docs.length === 0) return null;

  function safeUrl(value: string): string {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== "https:" &&
        !(url.protocol === "http:" && url.origin === window.location.origin)) {
      throw new Error("El enlace del soporte no es válido.");
    }
    return url.href;
  }

  async function renewDoc(
    targetDoc: SolicitudNovedadDocumentoResponse,
  ): Promise<{ doc: SolicitudNovedadDocumentoResponse; url: string }> {
    const fresh = await onReloadDetail();
    if (fresh.documentos) {
      setDocs(fresh.documentos);
      const found = fresh.documentos.find(
        (d) => targetDoc.id != null
          ? d.id === targetDoc.id
          : d.nombreArchivo === targetDoc.nombreArchivo,
      );
      if (found?.downloadUrl) {
        return { doc: found, url: found.downloadUrl };
      }
    }
    throw new Error("El servidor no generó la URL de descarga para este soporte.");
  }

  async function handleOpen(doc: SolicitudNovedadDocumentoResponse, key: string) {
    setBusyKey(`${key}-open`);
    setErrorMsg(null);
    setOpenFallback(null);

    try {
      let url = doc.downloadUrl;

      // Si no hay URL o está expirada por SigV4, renovamos una sola vez por GET de detalle
      if (!url || isPresignedUrlExpired(url)) {
        const renewed = await renewDoc(doc);
        url = renewed.url;
      }

      // Navegación directa a la URL prefirmada con noopener,noreferrer (sin Blob URLs y sin doble apertura)
      window.open(safeUrl(url), "_blank", "noopener,noreferrer");
    } catch (err) {
      const parsed = toApiError(err);
      setErrorMsg(parsed.message || "No se pudo abrir el archivo.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDownload(doc: SolicitudNovedadDocumentoResponse, key: string) {
    setBusyKey(`${key}-download`);
    setErrorMsg(null);
    setOpenFallback(null);

    try {
      let targetDoc = doc;
      let url = targetDoc.downloadUrl;
      let renewedOnce = false;

      // Comprobación previa de expiración
      if (!url || isPresignedUrlExpired(url)) {
        const renewed = await renewDoc(targetDoc);
        targetDoc = renewed.doc;
        url = renewed.url;
        renewedOnce = true;
      }

      let fileUrl = safeUrl(url);
      let response: Response;
      try {
        response = await fetch(fileUrl);
        if (!renewedOnce && (response.status === 401 || response.status === 403)) {
          const renewed = await renewDoc(targetDoc);
          targetDoc = renewed.doc;
          fileUrl = safeUrl(renewed.url);
          response = await fetch(fileUrl);
        }
      } catch (error) {
        // La navegación directa funciona cuando el almacenamiento limita fetch desde la app.
        if (error instanceof TypeError) setOpenFallback(fileUrl);
        throw error;
      }

      if (!response.ok) {
        throw new Error(`No se pudo descargar el soporte (HTTP ${response.status}).`);
      }

      const blob = await response.blob();
      saveBlob(blob, targetDoc.nombreArchivo || "soporte");
    } catch (err) {
      const parsed = toApiError(err);
      setErrorMsg(parsed.message || "No se pudo descargar el archivo.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="pn-detail-attachments" aria-label="Soportes adjuntos">
      <h3>Soportes adjuntos ({docs.length})</h3>
      <div className="pn-detail-attach-list">
        {docs.map((doc, idx) => {
          const key = doc.id != null ? String(doc.id) : (doc.nombreArchivo ?? String(idx));
          const isOpenBusy = busyKey === `${key}-open`;
          const isDownloadBusy = busyKey === `${key}-download`;

          return (
            <div className="pn-detail-attach-card" key={key}>
              <div className="pn-detail-attach-info">
                <span className="file-icon">
                  <Icon
                    name={getFileIcon(doc.nombreArchivo, doc.mimeType)}
                    size={20}
                  />
                </span>
                <div className="pn-detail-attach-text">
                  <strong>{doc.nombreArchivo ?? `Soporte ${idx + 1}`}</strong>
                  <small>{fileLabel(doc.tamanoBytes)}</small>
                </div>
              </div>
              <div className="pn-detail-attach-actions">
                <button
                  type="button"
                  className="pn-button secondary"
                  disabled={busyKey != null}
                  onClick={() => handleOpen(doc, key)}
                  aria-label={`Abrir soporte ${doc.nombreArchivo ?? ""}`}
                >
                  <Icon name="visibility" size={16} />
                  {isOpenBusy ? "Abriendo…" : "Abrir"}
                </button>
                <button
                  type="button"
                  className="pn-button secondary"
                  disabled={busyKey != null}
                  onClick={() => handleDownload(doc, key)}
                  aria-label={`Descargar soporte ${doc.nombreArchivo ?? ""}`}
                >
                  <Icon name="download" size={16} />
                  {isDownloadBusy ? "Descargando…" : "Descargar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {errorMsg && (
        <p role="alert" className="pn-info" style={{ marginTop: "10px" }}>
          {errorMsg}
        </p>
      )}
      {openFallback && (
        <a className="pn-button secondary" href={openFallback} target="_blank" rel="noopener noreferrer">
          Abrir soporte para guardarlo
        </a>
      )}
    </section>
  );
}
