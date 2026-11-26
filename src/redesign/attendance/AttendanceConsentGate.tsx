import { useState } from "react";
import { toApiError } from "../../lib/api";
import {
  submitAttendanceConsent,
  type AttendanceConsentDto,
} from "../../lib/attendance-api";
import { Button, Icon } from "../shared";

export interface AttendanceConsentGateProps {
  consent: AttendanceConsentDto | null;
  photoRetentionDays: number;
  onAccepted: (updated: AttendanceConsentDto) => void;
}

/**
 * Informed consent gate complying with Colombian Law 1581 / Decree 1377.
 */
export function AttendanceConsentGate({
  consent,
  photoRetentionDays,
  onAccepted,
}: AttendanceConsentGateProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retentionDays = consent?.photoRetentionDays ?? photoRetentionDays;
  const policyVersion = consent?.policyVersion ?? "v2026.1";

  const handleAccept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await submitAttendanceConsent(true, policyVersion);
      onAccepted(updated);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pn-panel pn-attendance-consent" aria-labelledby="consent-title">
      <div className="pn-attendance-consent-badge">
        <Icon name="verified_user" size={24} />
        <span>Privacidad y protección de datos · Política {policyVersion}</span>
      </div>
      <h2 id="consent-title">Autorización para registro de asistencia</h2>
      <p>
        En cumplimiento de la <strong>Ley 1581 de 2012</strong> y el{" "}
        <strong>Decreto 1377 de 2013</strong>, para habilitar el módulo de asistencia y
        visitas de campo requerimos tu autorización expresa sobre los siguientes datos:
      </p>
      <ul className="pn-consent-points">
        <li>
          <Icon name="my_location" size={19} />
          <div>
            <strong>Ubicación GPS puntual</strong>
            <span>
              Se consulta únicamente en el instante exacto en que realizas una marcación o
              visita. No realizamos rastreo continuo en segundo plano.
            </span>
          </div>
        </li>
        <li>
          <Icon name="photo_camera" size={19} />
          <div>
            <strong>Fotografía en vivo</strong>
            <span>
              Cuando tu política o visita lo requiera, se captura directamente desde la cámara
              para validar presencia en el punto autorizado (sin acceso a tu galería).
            </span>
          </div>
        </li>
        <li>
          <Icon name="cloud_done" size={19} />
          <div>
            <strong>Retención en almacenamiento cifrado</strong>
            <span>
              Las fotografías se almacenan de forma segura en S3 y se depuran automáticamente
              al cumplirse <strong>{retentionDays} días</strong> calendario.
            </span>
          </div>
        </li>
      </ul>
      <p className="small-muted">
        Podrás consultar o revocar esta autorización en cualquier momento desde{" "}
        <strong>Mi perfil y preferencias</strong>.
      </p>
      {error && (
        <div className="pn-info" role="alert" style={{ color: "var(--pn-danger)" }}>
          <Icon name="error" size={18} /> {error}
        </div>
      )}
      <div className="form-actions">
        <span className="small-muted">Al autorizar habilitas tus marcaciones de jornada y ruta.</span>
        <Button disabled={submitting} onClick={() => void handleAccept()}>
          <Icon name="check_circle" size={18} />
          {submitting ? "Registrando autorización…" : "Autorizo el tratamiento"}
        </Button>
      </div>
    </section>
  );
}
