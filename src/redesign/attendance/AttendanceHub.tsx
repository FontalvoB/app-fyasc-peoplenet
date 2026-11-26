import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toApiError } from "../../lib/api";
import {
  getAttendanceContext,
  type AttendanceConsentDto,
  type AttendanceContextDto,
  type AttendanceRecordDto,
} from "../../lib/attendance-api";
import type { MapCircle, MapMarker } from "../../lib/maps/map-adapter";
import { GeoMap } from "../components/GeoMap";
import { Button, Icon, LoadingNote, PageHero, SectionError, Tabs } from "../shared";
import { AttendanceConsentGate } from "./AttendanceConsentGate";
import { AttendanceHistory } from "./AttendanceHistory";
import { FieldVisitsPanel } from "./FieldVisitsPanel";
import { ShiftPunchFlow } from "./ShiftPunchFlow";
import {
  EVENT_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  formatIsoDateTime,
  readLiveGps,
  type GpsReading,
} from "./attendance-helpers";
import "./attendance.css";

type HubTab = "Mi Jornada" | "Visitas de Campo" | "Historial";

/**
 * Main Attendance Hub (`/dashboard/attendance`).
 */
export function AttendanceHub() {
  const [context, setContext] = useState<AttendanceContextDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; restricted: boolean } | null>(null);

  const [tab, setTab] = useState<HubTab>("Mi Jornada");
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [startSignal, setStartSignal] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const loadContext = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    getAttendanceContext(signal)
      .then((data) => {
        setContext(data);
        const serverMs = Date.parse(data.serverTimeIso);
        if (!Number.isNaN(serverMs)) {
          setClockOffsetMs(serverMs - Date.now());
        }
      })
      .catch((err) => {
        if (signal?.aborted) return;
        const apiError = toApiError(err);
        setError({
          message: apiError.message,
          restricted: apiError.status === 403,
        });
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, []);

  const refreshLocationPreview = useCallback(async () => {
    setGpsLoading(true);
    try {
      const reading = await readLiveGps();
      setGps(reading);
    } catch {
      // Location preview on the hub is best-effort; ShiftPunchFlow handles explicit GPS errors.
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadContext(controller.signal);
    void refreshLocationPreview();
    return () => controller.abort();
  }, [loadContext, refreshLocationPreview]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showFieldVisits =
    context?.policy.profileType === "FIELD_ADVISOR" ||
    context?.policy.profileType === "HYBRID";

  const availableTabs: HubTab[] = useMemo(
    () =>
      showFieldVisits
        ? ["Mi Jornada", "Visitas de Campo", "Historial"]
        : ["Mi Jornada", "Historial"],
    [showFieldVisits],
  );

  const syncedTimeLabel = useMemo(() => {
    const synced = new Date(nowMs + clockOffsetMs);
    return synced.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [nowMs, clockOffsetMs]);

  const syncedDateLabel = useMemo(() => {
    const synced = new Date(nowMs + clockOffsetMs);
    return synced.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [nowMs, clockOffsetMs]);

  const latestTodayPunch: AttendanceRecordDto | null = useMemo(() => {
    if (!context) return null;
    if (context.todayRecords.length > 0) {
      return context.todayRecords[context.todayRecords.length - 1];
    }
    return context.lastValidRecord;
  }, [context]);

  const hubMarkers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = (context?.authorizedSites ?? []).map((site) => ({
      id: `hub-site-${site.id}`,
      position: { lat: site.latitude, lng: site.longitude },
      label: site.name,
      popup: site.address ?? site.name,
      color: "brand",
    }));
    if (gps) {
      list.push({
        id: "hub-user-gps",
        position: gps.point,
        label: `Mi ubicación (±${gps.accuracyMeters} m)`,
        color: "ok",
      });
    }
    return list;
  }, [context?.authorizedSites, gps]);

  const hubCircles: MapCircle[] = useMemo(
    () =>
      (context?.authorizedSites ?? []).map((site) => ({
        id: `hub-circle-${site.id}`,
        center: { lat: site.latitude, lng: site.longitude },
        radiusMeters: site.radiusMeters,
        color: "brand",
        fillOpacity: 0.12,
      })),
    [context?.authorizedSites],
  );

  const hubCenter = useMemo(() => {
    if (gps) return gps.point;
    const primary =
      context?.authorizedSites.find((s) => s.isPrimary) ?? context?.authorizedSites[0];
    if (primary) return { lat: primary.latitude, lng: primary.longitude };
    return { lat: 4.648612, lng: -74.062841 };
  }, [gps, context?.authorizedSites]);

  const handleConsentAccepted = (updated: AttendanceConsentDto) => {
    setContext((prev) => (prev ? { ...prev, consent: updated } : prev));
  };

  const handlePunchCreated = (_record: AttendanceRecordDto) => {
    setHistoryRefreshKey((k) => k + 1);
    loadContext();
  };

  if (loading && !context) {
    return <LoadingNote label="Cargando módulo de asistencia…" />;
  }

  if (error && !context) {
    return (
      <SectionError
        error={error.message}
        restricted={error.restricted}
        onRetry={() => loadContext()}
      />
    );
  }

  if (!context) return null;

  return (
    <div className="pn-attendance-hub">
      <PageHero
        eyebrow="CONTROL DE ASISTENCIA"
        title="Tu jornada y visitas de campo"
        description={`${context.employeeName}${context.positionName ? ` · ${context.positionName}` : ""} · Política ${context.policy.name}`}
        action={
          context.consent?.accepted ? (
            <Button
              onClick={() => {
                setTab("Mi Jornada");
                setStartSignal((s) => s + 1);
              }}
            >
              <Icon name="fingerprint" size={19} /> MARCAR ASISTENCIA
            </Button>
          ) : undefined
        }
      />

      {!context.consent?.accepted ? (
        <AttendanceConsentGate
          consent={context.consent}
          photoRetentionDays={context.policy.photoRetentionDays}
          onAccepted={handleConsentAccepted}
        />
      ) : (
        <>
          <div className="pn-attendance-overview">
            <section className="pn-panel pn-clock-card">
              <div className="pn-clock-top">
                <span className="pn-eyebrow">HORA OFICIAL DEL SERVIDOR</span>
                <span className="pn-badge blue">
                  <i />
                  {context.policy.code}
                </span>
              </div>
              <div className="pn-clock-time" aria-live="off">
                {syncedTimeLabel}
              </div>
              <p className="small-muted pn-clock-date">{syncedDateLabel}</p>

              {latestTodayPunch ? (
                <div className="pn-last-punch">
                  <div>
                    <small>Última marcación registrada</small>
                    <strong>
                      {EVENT_LABELS[latestTodayPunch.eventType]} ·{" "}
                      {formatIsoDateTime(latestTodayPunch.serverTimestamp)}
                    </strong>
                  </div>
                  <div className="pn-last-punch-right">
                    <span
                      className={`pn-badge ${STATUS_BADGE_CLASS[latestTodayPunch.effectiveStatus]}`}
                    >
                      <i />
                      {STATUS_LABELS[latestTodayPunch.effectiveStatus]}
                    </span>
                    <Link
                      className="pn-link-inline"
                      to={`/dashboard/attendance/receipt/punch/${latestTodayPunch.id}`}
                    >
                      Ver comprobante
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="pn-info" role="status">
                  <Icon name="schedule" size={18} />
                  <span>Aún no registras marcaciones hoy.</span>
                </div>
              )}

              <Button
                onClick={() => {
                  setTab("Mi Jornada");
                  setStartSignal((s) => s + 1);
                }}
              >
                <Icon name="fingerprint" size={19} /> MARCAR ASISTENCIA
              </Button>
            </section>

            <section className="pn-panel pn-hub-map-card">
              <div className="pn-step-title-row">
                <div>
                  <span className="pn-eyebrow">UBICACIÓN Y SEDES</span>
                  <h2>Referencia geográfica</h2>
                </div>
                <Button
                  secondary
                  disabled={gpsLoading}
                  onClick={() => void refreshLocationPreview()}
                >
                  <Icon name="my_location" size={17} />
                  {gpsLoading ? "Ubicando…" : "Ubicarme"}
                </Button>
              </div>
              <GeoMap
                center={hubCenter}
                markers={hubMarkers}
                circles={hubCircles}
                height="205px"
                autoFit={hubMarkers.length > 0}
              />
              <p className="small-muted">
                {gps
                  ? `GPS actual ±${gps.accuracyMeters} m · ${context.authorizedSites.length} sede(s) autorizada(s).`
                  : `${context.authorizedSites.length} sede(s) autorizada(s) configurada(s).`}
              </p>
            </section>
          </div>

          <div className="pn-panel pn-toolbar padded">
            <Tabs items={availableTabs} value={tab} set={(v) => setTab(v as HubTab)} />
          </div>

          {tab === "Mi Jornada" && (
            <ShiftPunchFlow
              context={context}
              onPunchCreated={handlePunchCreated}
              startSignal={startSignal}
            />
          )}

          {tab === "Visitas de Campo" && showFieldVisits && (
            <FieldVisitsPanel
              context={context}
              onVisitActivity={() => setHistoryRefreshKey((k) => k + 1)}
            />
          )}

          {tab === "Historial" && (
            <AttendanceHistory
              showFieldVisits={Boolean(showFieldVisits)}
              refreshKey={historyRefreshKey}
            />
          )}
        </>
      )}
    </div>
  );
}
