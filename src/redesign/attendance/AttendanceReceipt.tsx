import { useEffect, useState } from "react";
import { Link, useHistory, useParams } from "react-router-dom";
import { toApiError } from "../../lib/api";
import {
  getPunchReceipt,
  getVisitReceipt,
  type AttendanceCheckDto,
  type AttendanceRecordDto,
  type AttendanceStatus,
  type FieldVisitDto,
} from "../../lib/attendance-api";
import { GeoMap } from "../components/GeoMap";
import { Button, Icon, LoadingNote, PageHero, SectionError } from "../shared";
import {
  CHECK_LABELS,
  CHECK_OUTCOME_LABELS,
  EVENT_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  formatDistance,
  formatIsoDateTime,
} from "./attendance-helpers";
import "./attendance.css";

export interface AttendanceReceiptProps {
  record?: AttendanceRecordDto;
  visit?: FieldVisitDto;
  onBack?: () => void;
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  return (
    <span className={`pn-badge ${STATUS_BADGE_CLASS[status]}`}>
      <i />
      {STATUS_LABELS[status]}
    </span>
  );
}

function CheckOutcomeBadge({ outcome }: { outcome: AttendanceCheckDto["outcome"] }) {
  const tone =
    outcome === "OK"
      ? "green"
      : outcome === "REVIEW"
        ? "amber"
        : outcome === "REJECT"
          ? "red"
          : "blue";
  return (
    <span className={`pn-badge ${tone}`}>
      <i />
      {CHECK_OUTCOME_LABELS[outcome]}
    </span>
  );
}

/**
 * Displays a detailed attendance or field-visit receipt (standalone route or inline).
 */
export function AttendanceReceipt({ record: propRecord, visit: propVisit, onBack }: AttendanceReceiptProps) {
  const params = useParams<{ kind?: string; id?: string }>();
  const history = useHistory();

  const isInline = Boolean(propRecord || propVisit);
  const routeKind = params.kind === "visit" ? "visit" : "punch";
  const routeId = params.id ? Number(params.id) : NaN;

  const [fetchedRecord, setFetchedRecord] = useState<AttendanceRecordDto | null>(null);
  const [fetchedVisit, setFetchedVisit] = useState<FieldVisitDto | null>(null);
  const [loading, setLoading] = useState(!isInline);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (isInline) return;
    if (!Number.isInteger(routeId) || routeId <= 0) {
      setLoading(false);
      setError("Identificador de comprobante inválido.");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRestricted(false);

    const load =
      routeKind === "visit"
        ? getVisitReceipt(routeId, controller.signal).then((data) => setFetchedVisit(data))
        : getPunchReceipt(routeId, controller.signal).then((data) => setFetchedRecord(data));

    load
      .catch((err) => {
        if (controller.signal.aborted) return;
        const apiError = toApiError(err);
        setError(apiError.message);
        setRestricted(apiError.status === 403);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isInline, routeKind, routeId, reloadTick]);

  const record = propRecord ?? fetchedRecord;
  const visit = propVisit ?? fetchedVisit;

  if (loading) {
    return <LoadingNote label="Cargando comprobante oficial…" />;
  }

  if (error) {
    return (
      <>
        <Link className="pn-back" to="/dashboard/attendance">
          <Icon name="arrow_back" size={17} /> Volver a asistencia
        </Link>
        <SectionError
          error={error}
          restricted={restricted}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      </>
    );
  }

  if (!record && !visit) {
    return (
      <div className="pn-empty">
        <Icon name="receipt_long" size={34} />
        <h2>Comprobante no disponible</h2>
        <Link className="pn-button secondary" to="/dashboard/attendance">
          Volver a asistencia
        </Link>
      </div>
    );
  }

  const isPunch = Boolean(record);
  const receiptCode = record?.receiptCode ?? visit?.receiptCode ?? "";
  const effectiveStatus = record?.effectiveStatus ?? visit?.effectiveStatus ?? "APPROVED";
  const serverTime = record?.serverTimestamp ?? visit?.checkinTimestamp ?? "";
  const lat = record?.latitude ?? visit?.checkinLatitude ?? 0;
  const lng = record?.longitude ?? visit?.checkinLongitude ?? 0;
  const accuracy = record?.gpsAccuracyMeters ?? visit?.checkinAccuracyMeters ?? 0;
  const checks = record?.checks ?? visit?.checks ?? [];
  const evidenceHash = record?.evidenceHash ?? visit?.evidenceHash ?? "";
  const photoUrl = record?.photoPresignedUrl ?? visit?.checkinPhotoPresignedUrl ?? null;

  const markerColor =
    effectiveStatus === "APPROVED" ? "ok" : effectiveStatus === "SUSPICIOUS" ? "warn" : "bad";

  return (
    <div className="pn-attendance-receipt">
      {!isInline && (
        <>
          <Link className="pn-back" to="/dashboard/attendance">
            <Icon name="arrow_back" size={17} /> Volver a asistencia
          </Link>
          <PageHero
            eyebrow="COMPROBANTE OFICIAL DE ASISTENCIA"
            title={receiptCode}
            description={
              isPunch
                ? "Registro inmutable de jornada laboral con evidencia verificable."
                : "Registro de visita de campo con geolocalización y evidencia."
            }
          />
        </>
      )}

      <section className="pn-panel pn-receipt-card">
        <div className="pn-receipt-header">
          <div>
            <span className="pn-eyebrow">
              {isPunch ? "MARCACIÓN DE JORNADA" : "VISITA DE CAMPO"}
            </span>
            <h2>{receiptCode}</h2>
            <p className="small-muted">Fecha y hora oficial: {formatIsoDateTime(serverTime)}</p>
          </div>
          <StatusPill status={effectiveStatus} />
        </div>

        <dl className="pn-details">
          {record ? (
            <>
              <dt>Evento</dt>
              <dd>{EVENT_LABELS[record.eventType]}</dd>
              <dt>Sede</dt>
              <dd>{record.siteName ?? "Sin sede asociada"}</dd>
              <dt>Distancia a sede</dt>
              <dd>{formatDistance(record.distanceToSiteMeters)}</dd>
              <dt>Canal</dt>
              <dd>{record.channel}</dd>
              {record.lateMinutes != null && record.lateMinutes > 0 && (
                <>
                  <dt>Tardanza</dt>
                  <dd>{record.lateMinutes} min</dd>
                </>
              )}
            </>
          ) : visit ? (
            <>
              <dt>Modalidad</dt>
              <dd>{visit.visitMode === "ROUTE_STOP" ? "Parada de ruta" : "Visita libre"}</dd>
              <dt>Cliente / punto</dt>
              <dd>{visit.clientName}</dd>
              {visit.address && (
                <>
                  <dt>Dirección</dt>
                  <dd>{visit.address}</dd>
                </>
              )}
              <dt>Distancia al punto</dt>
              <dd>{formatDistance(visit.distanceToClientMeters)}</dd>
              {visit.checkoutTimestamp && (
                <>
                  <dt>Check-out</dt>
                  <dd>
                    {formatIsoDateTime(visit.checkoutTimestamp)}
                    {visit.durationMinutes != null ? ` (${visit.durationMinutes} min)` : ""}
                  </dd>
                </>
              )}
              {visit.notes && (
                <>
                  <dt>Notas</dt>
                  <dd>{visit.notes}</dd>
                </>
              )}
            </>
          ) : null}
          <dt>Precisión GPS</dt>
          <dd>
            ±{accuracy} m ({lat.toFixed(6)}, {lng.toFixed(6)})
          </dd>
        </dl>

        <GeoMap
          center={{ lat, lng }}
          zoom={16}
          height="190px"
          interactive={false}
          markers={[
            {
              id: receiptCode,
              position: { lat, lng },
              label: record ? EVENT_LABELS[record.eventType] : visit?.clientName,
              color: markerColor,
            },
          ]}
        />

        {photoUrl && (
          <div className="pn-receipt-photo">
            <h3>Evidencia fotográfica en vivo</h3>
            <img src={photoUrl} alt="Fotografía capturada en marcación" referrerPolicy="no-referrer" />
          </div>
        )}

        <div className="pn-receipt-checks">
          <h3>Controles evaluados</h3>
          {checks.length === 0 ? (
            <p className="small-muted">Sin controles adicionales registrados.</p>
          ) : (
            <ul>
              {checks.map((check, index) => (
                <li key={`${check.key}-${index}`}>
                  <div>
                    <strong>{CHECK_LABELS[check.key] ?? check.key}</strong>
                    <span>{check.detail}</span>
                  </div>
                  <CheckOutcomeBadge outcome={check.outcome} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pn-receipt-hash">
          <span>Huella criptográfica SHA-256</span>
          <code>{evidenceHash || "Sin huella"}</code>
        </div>

        <div className="pn-receipt-actions">
          {onBack && (
            <Button secondary onClick={onBack}>
              <Icon name="arrow_back" size={17} /> Volver
            </Button>
          )}
          {record && (
            <Button
              secondary
              onClick={() =>
                history.push(
                  `/dashboard/requests/new?tipo=NOVEDAD_ASISTENCIA&attendanceRecordId=${record.id}`,
                )
              }
            >
              <Icon name="report_problem" size={18} /> Reportar novedad sobre esta marcación
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
