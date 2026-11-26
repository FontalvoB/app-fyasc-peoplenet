import { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { toApiError } from "../../lib/api";
import {
  getMyPunches,
  getMyVisits,
  type AttendanceRecordDto,
  type FieldVisitDto,
} from "../../lib/attendance-api";
import { Icon, LoadingNote, SectionError, Tabs } from "../shared";
import {
  EVENT_ICONS,
  EVENT_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  formatDistance,
  formatIsoDateTime,
} from "./attendance-helpers";

export interface AttendanceHistoryProps {
  showFieldVisits: boolean;
  refreshKey?: number;
}

/**
 * Unified 14-day history of shift punches and field visits.
 */
export function AttendanceHistory({ showFieldVisits, refreshKey = 0 }: AttendanceHistoryProps) {
  const history = useHistory();
  const [subTab, setSubTab] = useState<"Jornada" | "Visitas">("Jornada");

  const [punches, setPunches] = useState<AttendanceRecordDto[]>([]);
  const [punchesLoading, setPunchesLoading] = useState(true);
  const [punchesError, setPunchesError] = useState<{ message: string; restricted: boolean } | null>(
    null,
  );

  const [visits, setVisits] = useState<FieldVisitDto[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState<{ message: string; restricted: boolean } | null>(
    null,
  );

  const loadPunches = useCallback((signal?: AbortSignal) => {
    setPunchesLoading(true);
    setPunchesError(null);
    getMyPunches(14, signal)
      .then((rows) => setPunches(rows))
      .catch((err) => {
        if (signal?.aborted) return;
        const apiError = toApiError(err);
        setPunchesError({
          message: apiError.message,
          restricted: apiError.status === 403,
        });
      })
      .finally(() => {
        if (!signal?.aborted) setPunchesLoading(false);
      });
  }, []);

  const loadVisits = useCallback(
    (signal?: AbortSignal) => {
      if (!showFieldVisits) return;
      setVisitsLoading(true);
      setVisitsError(null);
      getMyVisits(14, signal)
        .then((rows) => setVisits(rows))
        .catch((err) => {
          if (signal?.aborted) return;
          const apiError = toApiError(err);
          setVisitsError({
            message: apiError.message,
            restricted: apiError.status === 403,
          });
        })
        .finally(() => {
          if (!signal?.aborted) setVisitsLoading(false);
        });
    },
    [showFieldVisits],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadPunches(controller.signal);
    if (showFieldVisits) {
      loadVisits(controller.signal);
    }
    return () => controller.abort();
  }, [loadPunches, loadVisits, showFieldVisits, refreshKey]);

  return (
    <section className="pn-panel pn-attendance-history">
      <div className="pn-toolbar">
        <div>
          <h2>Historial (últimos 14 días)</h2>
          <p className="small-muted">Consulta tus comprobantes y su estado de validación.</p>
        </div>
        {showFieldVisits && (
          <Tabs
            items={["Jornada", "Visitas"]}
            value={subTab}
            set={(v) => setSubTab(v as "Jornada" | "Visitas")}
          />
        )}
      </div>

      {subTab === "Jornada" ? (
        punchesLoading ? (
          <LoadingNote label="Cargando marcaciones…" />
        ) : punchesError ? (
          <SectionError
            error={punchesError.message}
            restricted={punchesError.restricted}
            onRetry={() => loadPunches()}
          />
        ) : punches.length === 0 ? (
          <div className="pn-empty">
            <Icon name="fingerprint" size={34} />
            <h3>Sin marcaciones en los últimos 14 días</h3>
            <p>Tus entradas, descansos y salidas aparecerán aquí con su comprobante.</p>
          </div>
        ) : (
          <div className="pn-attendance-list">
            {punches.map((item) => (
              <button
                type="button"
                key={item.id}
                className="pn-attendance-row"
                onClick={() => history.push(`/dashboard/attendance/receipt/punch/${item.id}`)}
              >
                <span className="pn-attendance-row-icon">
                  <Icon name={EVENT_ICONS[item.eventType]} size={20} />
                </span>
                <div className="pn-attendance-row-body">
                  <strong>{EVENT_LABELS[item.eventType]}</strong>
                  <small>
                    {formatIsoDateTime(item.serverTimestamp)} ·{" "}
                    {item.siteName ?? "Ubicación registrada"}
                  </small>
                  <span className="pn-attendance-row-meta">
                    {item.receiptCode} · ±{item.gpsAccuracyMeters} m
                    {item.distanceToSiteMeters != null
                      ? ` · ${formatDistance(item.distanceToSiteMeters)}`
                      : ""}
                  </span>
                </div>
                <span className={`pn-badge ${STATUS_BADGE_CLASS[item.effectiveStatus]}`}>
                  <i />
                  {STATUS_LABELS[item.effectiveStatus]}
                </span>
                <Icon name="chevron_right" size={18} />
              </button>
            ))}
          </div>
        )
      ) : visitsLoading ? (
        <LoadingNote label="Cargando visitas de campo…" />
      ) : visitsError ? (
        <SectionError
          error={visitsError.message}
          restricted={visitsError.restricted}
          onRetry={() => loadVisits()}
        />
      ) : visits.length === 0 ? (
        <div className="pn-empty">
          <Icon name="route" size={34} />
          <h3>Sin visitas en los últimos 14 días</h3>
          <p>Tus check-in y check-out de ruta o visitas libres aparecerán aquí.</p>
        </div>
      ) : (
        <div className="pn-attendance-list">
          {visits.map((visit) => (
            <button
              type="button"
              key={visit.id}
              className="pn-attendance-row"
              onClick={() => history.push(`/dashboard/attendance/receipt/visit/${visit.id}`)}
            >
              <span className="pn-attendance-row-icon">
                <Icon name={visit.visitMode === "ROUTE_STOP" ? "pin_drop" : "explore"} size={20} />
              </span>
              <div className="pn-attendance-row-body">
                <strong>{visit.clientName}</strong>
                <small>
                  {formatIsoDateTime(visit.checkinTimestamp)} ·{" "}
                  {visit.visitMode === "ROUTE_STOP" ? "Parada de ruta" : "Visita libre"}
                </small>
                <span className="pn-attendance-row-meta">
                  {visit.receiptCode}
                  {visit.checkoutTimestamp
                    ? ` · Cerrada (${visit.durationMinutes ?? 0} min)`
                    : " · En curso (sin check-out)"}
                </span>
              </div>
              <span className={`pn-badge ${STATUS_BADGE_CLASS[visit.effectiveStatus]}`}>
                <i />
                {STATUS_LABELS[visit.effectiveStatus]}
              </span>
              <Icon name="chevron_right" size={18} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
