/**
 * M8 + M9 + M10 — Certificados, Notificaciones y Perfil conectados al backend
 * real (kpis-ms). Todo lo que era mock de data.ts / storage pn-v2-* quedó
 * retirado: los datos vienen de la API y los estados nulos se muestran como
 * "Sin dato" (PLAN-FYA-REVISADO.md §5).
 *
 * Contratos verificados en vivo (2026-10-06, fixture userId 2873 /
 * employeeId 3619):
 * - M8: GET /api/certificates/employee/{employeeId} → lista DIRECTA de
 *   CertificateResponse (requiere documentos.certificados). Descarga SOLO vía
 *   GET /api/certificates/{id}/download (PDF real; errores → JSON de error,
 *   nunca se guarda como PDF). NO hay generación: el flujo /generate no está
 *   probado para colaborador (decisión M8) → botón retirado.
 * - M9: GET /api/dashboard/activities → DashboardActivityDto[] DIRECTO sin id
 *   ni readAt → feed real sin badges de no-leído ni enlaces inventados;
 *   "marcar todas como leídas" no existe en backend → acción deshabilitada
 *   con explicación (decisión pendiente del plan).
 * - M10: GET /api/auth/me (identidad), GET /api/employees/{id}/profile-summary
 *   (estado REAL del empleado — se muestra, no se edita), GET/PUT
 *   /api/employees/{id}/about-me (única escritura con contrato verificado).
 *   Nombre/correo/teléfono se muestran SOLO LECTURA: no existe contrato de
 *   edición personal. Sin claves demo (pn-v2-profile/email-notice retiradas).
 *
 * Los props son opcionales para mantener compatible Workspace.tsx mientras
 * otro agente lo actualiza; NO se consumen (evita herencia de estado demo).
 */

import { useEffect, useState } from "react";
import {
  Icon,
  Avatar,
  Button,
  Badge,
  PageHero,
  LoadingNote,
  SectionError,
  date,
} from "./shared";
import {
  displayName,
  downloadCertificate,
  initialsOf,
  sessionEmployeeId,
  toApiError,
  updateAboutMe,
  useAboutMe,
  useDashboardActivities,
  useEmployeeCertificates,
  useMyIdentity,
  useProfileSummary,
} from "../lib/api";
import type { CertificateResponse } from "../lib/api-types";

// ─────────────────────────────────────────────────────────────────────────────
// Ayudantes de presentación (locales; los datos siempre vienen de la API)
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda un Blob recibido de la API como archivo del navegador. */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** ISO "2026-07-14T20:03:11" → "14 jul 2026 · 20:03" (sin desplazar el día). */
function wireDateTime(value: string | null): string {
  if (!value) return "Sin dato";
  const [day, time] = value.split(/[ T]/);
  const datePart = day ? date(day) : "Sin dato";
  const hhmm = time ? time.slice(0, 5) : "";
  return hhmm ? `${datePart} · ${hhmm}` : datePart;
}

/** Estados documentados del certificado (plan §5 M8); otros → tal cual. */
const CERT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Expedido",
  REPRINTED: "Reimpreso",
};

function certStatusLabel(status: string | null): string {
  if (!status) return "Sin dato";
  return CERT_STATUS_LABELS[status.toUpperCase()] ?? status;
}

/** Tipos de icono del feed según `type` real del backend; desconocidos → info. */
function activityIcon(type: string | null): string {
  const key = type?.toLowerCase() ?? "";
  if (key.includes("success") || key.includes("aprob")) return "check_circle";
  if (key.includes("warning") || key.includes("pend")) return "warning";
  if (key.includes("error") || key.includes("rechaz")) return "error";
  return "info";
}

/** status REAL del empleado ("inactive", "active", …) → etiqueta legible. */
function employeeStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sin dato";
  const map: Record<string, string> = {
    active: "Activo",
    inactive: "Inactivo",
    suspended: "Suspendido",
    terminated: "Retirado",
  };
  return (
    map[status.toLowerCase()] ??
    status.charAt(0).toUpperCase() + status.slice(1)
  );
}

/** Icono del chip según el tipo real del certificado; desconocidos → genérico. */
function certTypeIcon(type: string | null): string {
  switch (type?.toLowerCase() ?? "") {
    case "labor":
      return "badge";
    case "vacaciones":
      return "flight_takeoff";
    case "nómina":
    case "nomina":
      return "payments";
    case "estudio":
      return "school";
    default:
      return "workspace_premium";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// M8 — Certificados (/dashboard/certificates)
// ─────────────────────────────────────────────────────────────────────────────

export function Certificates(_props: { name?: string }) {
  const employeeId = sessionEmployeeId();
  const certificates = useEmployeeCertificates(employeeId);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownload = async (cert: CertificateResponse) => {
    if (cert.id == null) return;
    setDownloadingId(cert.id);
    setDownloadStatus("loading");
    setDownloadError(null);
    try {
      const blob = await downloadCertificate(cert.id);
      if (!blob || blob.size === 0) {
        throw new Error("El servidor devolvió un archivo vacío.");
      }
      // Mismo patrón de nombre que Content-Disposition del backend.
      saveBlob(blob, `Certificado_${cert.certificateNumber ?? cert.id}.pdf`);
      setDownloadStatus("idle");
      setDownloadingId(null);
    } catch (error) {
      setDownloadError(
        toApiError(error).message ||
          "No se pudo descargar el certificado. Inténtalo de nuevo.",
      );
      setDownloadStatus("error");
    }
  };

  const retry = () => {
    certificates.reload();
    setDownloadStatus("idle");
    setDownloadError(null);
  };

  return (
    <>
      <PageHero
        eyebrow="LO QUE NECESITAS, A TU ALCANCE"
        title="Tus certificados, sin vueltas."
        description="Constancias reales expedidas por la empresa, listas para descargar."
      />
      <img
        className="editorial-certificate-photo"
        src="/images/people/trayectoria.jpg"
        alt="Una profesional de talento humano entrega una carpeta a un colaborador"
        width="1536"
        height="1024"
        loading="lazy"
      />
      {/* FIX-1 B (admin sin employeeId): estado explícito en vez de área vacía. */}
      {employeeId == null ? (
        <p className="pn-info" role="status">
          Los certificados requieren un colaborador asociado a tu usuario.
        </p>
      ) : (
        <>
          {certificates.state.status === "loading" &&
            !certificates.state.data && (
              <LoadingNote label="Cargando certificados…" />
            )}
          {certificates.state.status === "error" &&
            !certificates.state.data && (
              <SectionError
                error={certificates.state.error ?? "Error inesperado."}
                restricted={certificates.state.errorStatus === 403}
                onRetry={retry}
              />
            )}
          {certificates.state.status === "error" &&
            certificates.state.data != null && (
              <div
                className="pn-info"
                role="alert"
                style={{ color: "var(--pn-danger)" }}
              >
                <Icon name="cloud_off" size={16} /> No se pudo actualizar la
                lista: {certificates.state.error}{" "}
                <Button secondary onClick={retry}>
                  Reintentar
                </Button>
              </div>
            )}
        </>
      )}
      {certificates.state.status === "success" &&
        (certificates.state.data ?? []).length === 0 && (
          <div className="pn-empty">
            <Icon name="workspace_premium" size={36} />
            <h2>Aún no tienes certificados</h2>
            <p>Cuando la empresa expida constancias aparecerán aquí.</p>
          </div>
        )}
      {certificates.state.status === "success" &&
        (certificates.state.data ?? []).length > 0 && (
          <div className="pn-doc-grid cert-grid">
            {(certificates.state.data ?? []).map((cert, i) => (
              <article
                className="cert-card"
                key={cert.id ?? `cert-${i}`}
                aria-label={`Certificado ${cert.certificateNumber ?? "sin número"}`}
              >
                <div className="cert-top">
                  <span className="cert-chip" aria-hidden="true">
                    <Icon name={certTypeIcon(cert.certificateType)} size={22} />
                  </span>
                  <div className="cert-titles">
                    <span className="pn-eyebrow">
                      {cert.certificateType ?? "Sin tipo"}
                    </span>
                    <h2>{cert.certificateNumber ?? "Sin número"}</h2>
                  </div>
                  <Badge>{certStatusLabel(cert.status)}</Badge>
                </div>
                <ul className="cert-meta">
                  <li>
                    <Icon name="business" size={16} />
                    <span className="cert-meta-label">Empresa</span>
                    <strong>{cert.companyName ?? "Sin dato"}</strong>
                  </li>
                  <li>
                    <Icon name="calendar_month" size={16} />
                    <span className="cert-meta-label">Expedido</span>
                    <strong>
                      {cert.issueDate ? date(cert.issueDate) : "Sin dato"}
                    </strong>
                  </li>
                  {cert.certifyingOfficer ? (
                    <li>
                      <Icon name="history_edu" size={16} />
                      <span className="cert-meta-label">Autorizó</span>
                      <strong>{cert.certifyingOfficer}</strong>
                    </li>
                  ) : null}
                  <li>
                    <Icon name="schedule" size={16} />
                    <span className="cert-meta-label">Registrado</span>
                    <strong>{wireDateTime(cert.createdAt)}</strong>
                  </li>
                </ul>
                <div className="cert-actions">
                  <Button
                    secondary
                    disabled={
                      cert.id == null ||
                      (downloadStatus === "loading" &&
                        downloadingId === cert.id)
                    }
                    onClick={() => void handleDownload(cert)}
                  >
                    <Icon name="download" />{" "}
                    {downloadingId === cert.id && downloadStatus === "loading"
                      ? "Descargando…"
                      : "Descargar PDF"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      {downloadStatus === "error" && downloadError && (
        <div
          className="pn-info"
          role="alert"
          style={{ color: "var(--pn-danger)" }}
        >
          <Icon name="cloud_off" size={16} /> {downloadError}{" "}
          <Button secondary onClick={retry}>
            Reintentar
          </Button>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// M9 — Notificaciones (/dashboard/notifications)
// ─────────────────────────────────────────────────────────────────────────────

export function Notifications(_props: {
  seen?: string[];
  setSeen?: (v: string[]) => void;
}) {
  const activities = useDashboardActivities();
  const feed = activities.state.data ?? [];

  return (
    <>
      <PageHero
        eyebrow="NO TE PIERDAS LO IMPORTANTE"
        title="Lo nuevo en tu espacio"
        description="Actividad reciente del espacio de trabajo, en tiempo real."
        action={
          // "Marcar todas como leídas" no existe en el backend (activities no
          // tiene id ni readAt): acción deshabilitada hasta decisión del plan.
          <span title="Esta acción quedará disponible cuando el backend permita registrar lecturas; por ahora el feed es informativo.">
            <Button secondary disabled>
              <Icon name="done_all" /> Marcar todas como leídas
            </Button>
          </span>
        }
      />
      <div className="pn-info">
        <Icon name="info" size={18} /> Este feed es informativo: el servidor no
        registra lecturas por evento, así que no hay marcadores de "no leído".
      </div>
      {activities.state.status === "loading" && !activities.state.data && (
        <LoadingNote label="Cargando actividad…" />
      )}
      {activities.state.status === "error" && !activities.state.data && (
        <SectionError
          error={activities.state.error ?? "Error inesperado."}
          restricted={activities.state.errorStatus === 403}
          onRetry={activities.reload}
        />
      )}
      {activities.state.status === "error" && activities.state.data != null && (
        <div
          className="pn-info"
          role="alert"
          style={{ color: "var(--pn-danger)" }}
        >
          <Icon name="cloud_off" size={16} /> No se pudo actualizar el feed:{" "}
          {activities.state.error}{" "}
          <Button secondary onClick={activities.reload}>
            Reintentar
          </Button>
        </div>
      )}
      {activities.state.status === "success" && (
        <section className="pn-panel notification-list">
          {feed.map((n, i) => (
            <div key={`${n.timestamp ?? ""}-${i}`}>
              <span className={`activity-icon stat-${i % 4}`}>
                <Icon name={activityIcon(n.type)} />
              </span>
              <div>
                <span className="small-muted">{wireDateTime(n.timestamp)}</span>
                <h2>{n.title ?? "Sin título"}</h2>
                <p>{n.description ?? "Sin detalle."}</p>
              </div>
            </div>
          ))}
          {feed.length === 0 && (
            <div className="pn-empty">
              <Icon name="done_all" size={36} />
              <h2>Sin actividad por ahora.</h2>
              <p>Los movimientos del espacio aparecerán aquí.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// M10 — Perfil (/dashboard/profile)
// ─────────────────────────────────────────────────────────────────────────────

export function Profile(_props: {
  profile?: { name: string; email: string; phone: string };
  save?: (p: { name: string; email: string; phone: string }) => void;
}) {
  const employeeId = sessionEmployeeId();
  const identity = useMyIdentity();
  const summary = useProfileSummary(employeeId);
  const aboutMe = useAboutMe(employeeId);

  // Edición acotada: SOLO about-me tiene contrato verificado (PUT). Nombre,
  // correo y teléfono se muestran en lectura: sin contrato de edición personal
  // (decisión pendiente del plan). Nada se guarda en storage.
  const [aboutText, setAboutText] = useState("");
  const [aboutStatus, setAboutStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [aboutMessage, setAboutMessage] = useState<string | null>(null);

  useEffect(() => {
    // Sincroniza el textarea cuando llega el valor real del servidor (y tras
    // cada recarga): no heredar borradores de otro usuario.
    if (aboutMe.state.status === "success" && aboutMe.state.data != null) {
      setAboutText(aboutMe.state.data.aboutMe ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aboutMe.state.status, aboutMe.state.data]);

  const handleSaveAboutMe = async () => {
    if (employeeId == null) return;
    setAboutStatus("loading");
    setAboutMessage(null);
    try {
      const echo = await updateAboutMe(employeeId, aboutText);
      // El eco del PUT confirma lo persistido; releer el GET del servidor.
      aboutMe.reload();
      setAboutText(echo.aboutMe ?? aboutText);
      setAboutStatus("done");
      setAboutMessage("Tu descripción se guardó en el servidor.");
    } catch (error) {
      setAboutStatus("error");
      setAboutMessage(
        toApiError(error).message ||
          "No se pudo guardar la descripción. Inténtalo de nuevo.",
      );
    }
  };

  const person = summary.state.data;
  const user = identity.state.data;
  const fullName = person?.fullName ?? displayName(user) ?? "Sin dato";
  const email = user?.email ?? "Sin dato";
  const username = user?.username ?? "Sin dato";

  return (
    <>
      <PageHero
        eyebrow="ESTE ESPACIO ES TUYO"
        title="Tu perfil"
        description="Tu información organizacional y tu descripción personal."
      />
      {identity.state.status === "error" && !identity.state.data && (
        <SectionError
          error={identity.state.error ?? "No se pudo cargar tu identidad."}
          restricted={identity.state.errorStatus === 403}
          onRetry={identity.reload}
        />
      )}
      {summary.state.status === "loading" && !summary.state.data && (
        <LoadingNote label="Cargando tu información…" />
      )}
      {summary.state.status === "error" && !summary.state.data && (
        <SectionError
          error={
            employeeId == null
              ? "Tu usuario no tiene un colaborador asociado."
              : (summary.state.error ?? "Error inesperado.")
          }
          restricted={summary.state.errorStatus === 403}
          onRetry={summary.reload}
        />
      )}
      <div className="pn-profile-layout">
        <section className="pn-panel profile-summary">
          <div className="profile-cover" />
          <Avatar name={initialsOf(fullName)} />
          <h2>{fullName}</h2>
          <p>{person?.positionName ?? "Sin dato"}</p>
          <Badge>{employeeStatusLabel(person?.status)}</Badge>
          <hr />
          <span>
            <Icon name="business" size={18} />{" "}
            {person?.company?.name ?? "Sin dato"}
          </span>
          <span>
            <Icon name="calendar_today" size={18} />{" "}
            {person?.hireDate
              ? `En el equipo desde ${date(person.hireDate)}`
              : "Sin fecha de ingreso"}
          </span>
          <span>
            <Icon name="apartment" size={18} />{" "}
            {person?.management?.name ?? "Sin dato"}
            {person?.area?.name ? ` · ${person.area.name}` : ""}
            {person?.subarea?.name ? ` · ${person.subarea.name}` : ""}
          </span>
          <span>
            <Icon name="supervisor_account" size={18} />{" "}
            {person?.boss?.fullName
              ? `Jefe: ${person.boss.fullName}`
              : "Sin jefe registrado"}
          </span>
        </section>
        <div className="pn-panel pn-form">
          <h2>Información personal</h2>
          <p className="small-muted">
            Consulta tus datos personales. Para actualizarlos, contacta a
            Gestión Humana.
          </p>
          <label>
            Nombre completo
            <input value={fullName} disabled readOnly />
          </label>
          <div className="form-two">
            <label>
              Correo electrónico
              <input type="email" value={email} disabled readOnly />
            </label>
            <label>
              Usuario
              <input value={username} disabled readOnly />
            </label>
          </div>
          <hr />
          <h3>Acerca de mí</h3>
          <p className="small-muted">Cuéntale a tu equipo un poco sobre ti.</p>
          {employeeId == null ? (
            <div className="pn-info" role="note">
              Tu usuario no tiene un colaborador asociado: no se puede editar la
              descripción.
            </div>
          ) : (
            <>
              <label>
                Descripción
                <textarea
                  rows={5}
                  maxLength={1000}
                  value={aboutText}
                  onChange={(e) => {
                    setAboutText(e.target.value);
                    setAboutStatus("idle");
                    setAboutMessage(null);
                  }}
                  disabled={aboutStatus === "loading"}
                />
              </label>
              <div className="form-actions">
                <span className="small-muted">
                  {aboutStatus === "done"
                    ? "Tu descripción está guardada."
                    : aboutStatus === "error"
                      ? "Pendiente: revisa el mensaje e inténtalo de nuevo."
                      : "Esta descripción se mostrará en tu perfil."}
                </span>
                <Button
                  type="button"
                  disabled={aboutStatus === "loading"}
                  onClick={() => void handleSaveAboutMe()}
                >
                  {aboutStatus === "loading"
                    ? "Guardando…"
                    : "Guardar descripción"}{" "}
                  <Icon name="check" size={18} />
                </Button>
              </div>
              {aboutMessage && (
                <p
                  className="pn-info"
                  role={aboutStatus === "error" ? "alert" : "status"}
                  style={{ marginTop: 10 }}
                >
                  {aboutMessage}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
