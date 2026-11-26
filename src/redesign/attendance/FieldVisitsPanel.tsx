import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toApiError } from "../../lib/api";
import {
  checkInFieldVisit,
  checkOutFieldVisit,
  generateRequestNonce,
  getMyRoutes,
  getMyVisits,
  resolveAttendanceChannel,
  type AttendanceContextDto,
  type FieldRouteDto,
  type FieldRouteStopDto,
  type FieldVisitDto,
} from "../../lib/attendance-api";
import type { MapMarker, MapMarkerColor, MapPolyline } from "../../lib/maps/map-adapter";
import { GeoMap } from "../components/GeoMap";
import {
  LiveCameraCapture,
  type LiveCameraCaptureResult,
} from "../components/LiveCameraCapture";
import { Button, Icon, LoadingNote, SectionError, Tabs } from "../shared";
import { AttendanceReceipt } from "./AttendanceReceipt";
import {
  STOP_STATUS_LABELS,
  formatDistance,
  formatIsoDateTime,
  haversineMeters,
  readLiveGps,
  todayLocalIso,
  type GpsReading,
} from "./attendance-helpers";

export interface FieldVisitsPanelProps {
  context: AttendanceContextDto;
  onVisitActivity: () => void;
}

function stopMarkerColor(status: FieldRouteStopDto["status"]): MapMarkerColor {
  if (status === "COMPLETED") return "ok";
  if (status === "CHECKED_IN") return "brand";
  if (status === "SKIPPED") return "bad";
  return "warn";
}

/**
 * Field advisor routes and free visits panel (for FIELD_ADVISOR and HYBRID profiles).
 */
export function FieldVisitsPanel({ context, onVisitActivity }: FieldVisitsPanelProps) {
  const [subTab, setSubTab] = useState<"Mi Ruta del Día" | "Visita Libre">("Mi Ruta del Día");

  const [routes, setRoutes] = useState<FieldRouteDto[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState<{ message: string; restricted: boolean } | null>(
    null,
  );

  const [visits, setVisits] = useState<FieldVisitDto[]>([]);
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Active route-stop check-in state
  const [activeStop, setActiveStop] = useState<FieldRouteStopDto | null>(null);
  const [stopNotes, setStopNotes] = useState("");
  const [stopPhoto, setStopPhoto] = useState<LiveCameraCaptureResult | null>(null);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const stopNonceRef = useRef<string | null>(null);

  // Free visit form state
  const [freeClientName, setFreeClientName] = useState("");
  const [freeAddress, setFreeAddress] = useState("");
  const [freeNotes, setFreeNotes] = useState("");
  const [freePhoto, setFreePhoto] = useState<LiveCameraCaptureResult | null>(null);
  const [freeSubmitting, setFreeSubmitting] = useState(false);
  const [freeError, setFreeError] = useState<string | null>(null);
  const freeNonceRef = useRef<string | null>(null);

  // Shared checkout state (visitId being closed)
  const [checkoutVisitId, setCheckoutVisitId] = useState<number | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [latestReceipt, setLatestReceipt] = useState<FieldVisitDto | null>(null);

  const loadFieldData = useCallback((signal?: AbortSignal) => {
    const today = todayLocalIso();
    setRoutesLoading(true);
    setRoutesError(null);
    Promise.all([getMyRoutes(today, signal), getMyVisits(14, signal)])
      .then(([routeList, visitList]) => {
        setRoutes(routeList);
        setVisits(visitList);
      })
      .catch((err) => {
        if (signal?.aborted) return;
        const apiError = toApiError(err);
        setRoutesError({
          message: apiError.message,
          restricted: apiError.status === 403,
        });
      })
      .finally(() => {
        if (!signal?.aborted) setRoutesLoading(false);
      });
  }, []);

  const refreshGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const reading = await readLiveGps();
      setGps(reading);
      return reading;
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos obtener tu ubicación GPS.";
      setGpsError(message);
      return null;
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadFieldData(controller.signal);
    void refreshGps();
    return () => controller.abort();
  }, [loadFieldData, refreshGps]);

  const routeMarkers: MapMarker[] = useMemo(() => {
    const markers: MapMarker[] = [];
    for (const route of routes) {
      const ordered = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
      for (const stop of ordered) {
        markers.push({
          id: `stop-${stop.id}`,
          position: { lat: stop.client.latitude, lng: stop.client.longitude },
          label: `${stop.stopOrder}. ${stop.client.name}`,
          popup: stop.client.address ?? stop.client.name,
          color: stopMarkerColor(stop.status),
        });
      }
    }
    if (gps) {
      markers.push({
        id: "advisor-gps",
        position: gps.point,
        label: `Mi ubicación (±${gps.accuracyMeters} m)`,
        color: "ok",
      });
    }
    return markers;
  }, [routes, gps]);

  const routePolylines: MapPolyline[] = useMemo(() => {
    return routes
      .map((route) => {
        const ordered = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        if (ordered.length < 2) return null;
        return {
          id: `route-line-${route.id}`,
          points: ordered.map((s) => ({
            lat: s.client.latitude,
            lng: s.client.longitude,
          })),
          color: "brand" as const,
          weight: 4,
          dashed: true,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [routes]);

  const mapCenter = useMemo(() => {
    if (gps) return gps.point;
    const firstStop = routes[0]?.stops[0];
    if (firstStop) {
      return { lat: firstStop.client.latitude, lng: firstStop.client.longitude };
    }
    return { lat: 4.648612, lng: -74.062841 };
  }, [gps, routes]);

  const openFreeVisitsToday = useMemo(() => {
    const today = todayLocalIso();
    return visits.filter(
      (v) =>
        v.visitMode === "FREE" &&
        !v.checkoutTimestamp &&
        v.checkinTimestamp.startsWith(today),
    );
  }, [visits]);

  const handleOpenStopCheckIn = (stop: FieldRouteStopDto) => {
    setActiveStop(stop);
    setStopNotes("");
    setStopPhoto(null);
    setStopError(null);
    setLatestReceipt(null);
    stopNonceRef.current = generateRequestNonce();
    void refreshGps();
  };

  const handleSubmitStopCheckIn = async () => {
    if (!activeStop) return;
    const currentGps = gps ?? (await refreshGps());
    if (!currentGps) {
      setStopError("Se requiere una lectura GPS válida para registrar la llegada.");
      return;
    }
    if (!stopPhoto) {
      setStopError("Captura una fotografía en vivo antes de registrar la llegada.");
      return;
    }

    const nonce = stopNonceRef.current ?? generateRequestNonce();
    stopNonceRef.current = nonce;
    setStopSubmitting(true);
    setStopError(null);

    try {
      const created = await checkInFieldVisit(
        {
          visitMode: "ROUTE_STOP",
          routeStopId: activeStop.id,
          clientId: activeStop.client.id,
          freeClientName: null,
          freeAddress: null,
          latitude: currentGps.point.lat,
          longitude: currentGps.point.lng,
          accuracyMeters: currentGps.accuracyMeters,
          deviceTimestampIso: currentGps.capturedAtIso,
          photoCapturedAtIso: stopPhoto.capturedAtIso,
          channel: resolveAttendanceChannel(),
          requestNonce: nonce,
          notes: stopNotes.trim() || null,
        },
        stopPhoto.blob,
      );
      stopNonceRef.current = null;
      setActiveStop(null);
      setStopPhoto(null);
      setStopNotes("");
      setLatestReceipt(created);
      loadFieldData();
      onVisitActivity();
    } catch (err) {
      setStopError(toApiError(err).message);
    } finally {
      setStopSubmitting(false);
    }
  };

  const handleSubmitFreeVisit = async (event: FormEvent) => {
    event.preventDefault();
    if (!freeClientName.trim()) {
      setFreeError("Ingresa el nombre del cliente o punto visitado.");
      return;
    }
    const currentGps = gps ?? (await refreshGps());
    if (!currentGps) {
      setFreeError("Se requiere una lectura GPS válida para registrar la visita.");
      return;
    }
    if (!freePhoto) {
      setFreeError("La fotografía en vivo es obligatoria para visitas de campo.");
      return;
    }

    const nonce = freeNonceRef.current ?? generateRequestNonce();
    freeNonceRef.current = nonce;
    setFreeSubmitting(true);
    setFreeError(null);

    try {
      const created = await checkInFieldVisit(
        {
          visitMode: "FREE",
          routeStopId: null,
          clientId: null,
          freeClientName: freeClientName.trim(),
          freeAddress: freeAddress.trim() || null,
          latitude: currentGps.point.lat,
          longitude: currentGps.point.lng,
          accuracyMeters: currentGps.accuracyMeters,
          deviceTimestampIso: currentGps.capturedAtIso,
          photoCapturedAtIso: freePhoto.capturedAtIso,
          channel: resolveAttendanceChannel(),
          requestNonce: nonce,
          notes: freeNotes.trim() || null,
        },
        freePhoto.blob,
      );
      freeNonceRef.current = null;
      setFreeClientName("");
      setFreeAddress("");
      setFreeNotes("");
      setFreePhoto(null);
      setLatestReceipt(created);
      loadFieldData();
      onVisitActivity();
    } catch (err) {
      setFreeError(toApiError(err).message);
    } finally {
      setFreeSubmitting(false);
    }
  };

  const handleConfirmCheckOut = async () => {
    if (checkoutVisitId == null) return;
    const currentGps = (await refreshGps()) ?? gps;
    if (!currentGps) {
      setCheckoutError("Necesitamos tu lectura GPS actual para cerrar la visita.");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const closed = await checkOutFieldVisit(checkoutVisitId, {
        latitude: currentGps.point.lat,
        longitude: currentGps.point.lng,
        accuracyMeters: currentGps.accuracyMeters,
        notes: checkoutNotes.trim() || null,
      });
      setCheckoutVisitId(null);
      setCheckoutNotes("");
      setLatestReceipt(closed);
      loadFieldData();
      onVisitActivity();
    } catch (err) {
      setCheckoutError(toApiError(err).message);
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <div className="pn-field-visits">
      <div className="pn-panel pn-toolbar">
        <Tabs
          items={["Mi Ruta del Día", "Visita Libre"]}
          value={subTab}
          set={(v) => {
            setSubTab(v as "Mi Ruta del Día" | "Visita Libre");
            setLatestReceipt(null);
          }}
        />
        <Button secondary disabled={gpsLoading} onClick={() => void refreshGps()}>
          <Icon name="my_location" size={17} /> {gpsLoading ? "Actualizando GPS…" : "Actualizar GPS"}
        </Button>
      </div>

      {gpsError && (
        <div className="pn-info" role="alert" style={{ color: "var(--pn-danger)" }}>
          <Icon name="location_off" size={18} /> {gpsError}
        </div>
      )}

      {latestReceipt && (
        <AttendanceReceipt visit={latestReceipt} onBack={() => setLatestReceipt(null)} />
      )}

      {checkoutVisitId != null && (
        <section className="pn-panel pn-field-checkout-card" aria-label="Cerrar visita">
          <h3>Cerrar visita (Check-out)</h3>
          <p className="small-muted">
            Opcionalmente añade una nota de cierre; tomaremos tu ubicación GPS actual.
          </p>
          <label>
            Notas de cierre (opcional)
            <textarea
              rows={2}
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              placeholder="Ej: Cierre exitoso, radicación recibida…"
            />
          </label>
          {checkoutError && (
            <p className="pn-info" role="alert" style={{ color: "var(--pn-danger)" }}>
              {checkoutError}
            </p>
          )}
          <div className="pn-step-actions">
            <Button
              secondary
              disabled={checkoutBusy}
              onClick={() => {
                setCheckoutVisitId(null);
                setCheckoutError(null);
              }}
            >
              Cancelar
            </Button>
            <Button disabled={checkoutBusy} onClick={() => void handleConfirmCheckOut()}>
              <Icon name="task_alt" size={18} />
              {checkoutBusy ? "Cerrando visita…" : "Confirmar Check-out"}
            </Button>
          </div>
        </section>
      )}

      {subTab === "Mi Ruta del Día" ? (
        <section className="pn-panel pn-field-route-panel">
          {routesLoading ? (
            <LoadingNote label="Cargando tu ruta del día…" />
          ) : routesError ? (
            <SectionError
              error={routesError.message}
              restricted={routesError.restricted}
              onRetry={() => loadFieldData()}
            />
          ) : routes.length === 0 ? (
            <div className="pn-empty">
              <Icon name="route" size={34} />
              <h3>No tienes rutas programadas para hoy</h3>
              <p>
                Si necesitas registrar una atención en campo, usa la pestaña{" "}
                <strong>Visita Libre</strong>.
              </p>
            </div>
          ) : (
            <>
              <GeoMap
                center={mapCenter}
                markers={routeMarkers}
                polylines={routePolylines}
                height="240px"
                autoFit={routeMarkers.length > 0}
              />
              {routes.map((route) => {
                const orderedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
                return (
                  <div key={route.id} className="pn-route-block">
                    <div className="pn-route-header">
                      <div>
                        <span className="pn-eyebrow">RUTA {route.routeDate}</span>
                        <h3>{route.name}</h3>
                        {route.notes && <p className="small-muted">{route.notes}</p>}
                      </div>
                      <span className="pn-badge blue">
                        <i />
                        {orderedStops.length} paradas
                      </span>
                    </div>

                    <div className="pn-stops-list">
                      {orderedStops.map((stop) => {
                        const dist = gps
                          ? haversineMeters(gps.point, {
                              lat: stop.client.latitude,
                              lng: stop.client.longitude,
                            })
                          : null;
                        const isCheckingInHere = activeStop?.id === stop.id;

                        return (
                          <article key={stop.id} className="pn-stop-card">
                            <div className="pn-stop-top">
                              <span className="pn-stop-order">#{stop.stopOrder}</span>
                              <div className="pn-stop-info">
                                <strong>{stop.client.name}</strong>
                                <small>
                                  {stop.client.address ?? "Sin dirección"}
                                  {stop.client.city ? ` · ${stop.client.city}` : ""}
                                </small>
                                {stop.objective && (
                                  <small className="pn-stop-objective">
                                    Objetivo: {stop.objective}
                                  </small>
                                )}
                                <span className="pn-attendance-row-meta">
                                  {stop.plannedTime ? `Hora: ${stop.plannedTime.slice(0, 5)} · ` : ""}
                                  {dist != null
                                    ? `Distancia actual: ${formatDistance(dist)}`
                                    : "GPS pendiente"}
                                  {stop.client.contactName
                                    ? ` · Contacto: ${stop.client.contactName}`
                                    : ""}
                                </span>
                              </div>
                              <span
                                className={`pn-badge ${
                                  stop.status === "COMPLETED"
                                    ? "green"
                                    : stop.status === "CHECKED_IN"
                                      ? "blue"
                                      : stop.status === "SKIPPED"
                                        ? "red"
                                        : "amber"
                                }`}
                              >
                                <i />
                                {STOP_STATUS_LABELS[stop.status]}
                              </span>
                            </div>

                            <div className="pn-stop-actions">
                              {stop.status === "PENDING" && context.policy.allowRouteVisits !== false && (
                                <Button
                                  secondary={isCheckingInHere}
                                  onClick={() =>
                                    isCheckingInHere
                                      ? setActiveStop(null)
                                      : handleOpenStopCheckIn(stop)
                                  }
                                >
                                  <Icon name="pin_drop" size={17} />
                                  {isCheckingInHere
                                    ? "Ocultar formulario"
                                    : "Registrar llegada (Check-in)"}
                                </Button>
                              )}
                              {stop.status === "CHECKED_IN" && stop.visitId != null && (
                                <Button
                                  onClick={() => {
                                    setCheckoutVisitId(stop.visitId);
                                    setCheckoutNotes("");
                                    setCheckoutError(null);
                                  }}
                                >
                                  <Icon name="task_alt" size={17} /> Cerrar visita (Check-out)
                                </Button>
                              )}
                              {stop.visitId != null && (
                                <Link
                                  className="pn-button secondary"
                                  to={`/dashboard/attendance/receipt/visit/${stop.visitId}`}
                                >
                                  <Icon name="receipt_long" size={17} /> Ver comprobante
                                </Link>
                              )}
                            </div>

                            {isCheckingInHere && (
                              <div className="pn-stop-checkin-drawer">
                                <p className="small-muted">
                                  {gps
                                    ? `GPS actual: ±${gps.accuracyMeters} m · ${formatDistance(dist)} del cliente.`
                                    : "Leyendo ubicación GPS…"}
                                </p>

                                {stopPhoto ? (
                                  <div className="pn-info" role="status">
                                    <Icon name="check_circle" size={18} />
                                    <span>Fotografía en vivo capturada.</span>
                                    <Button secondary onClick={() => setStopPhoto(null)}>
                                      Tomar otra
                                    </Button>
                                  </div>
                                ) : (
                                  <LiveCameraCapture
                                    initialFacingMode="environment"
                                    title={`Foto en vivo · ${stop.client.name}`}
                                    onConfirm={(result) => setStopPhoto(result)}
                                  />
                                )}

                                <label>
                                  Notas de la visita (opcional)
                                  <textarea
                                    rows={2}
                                    value={stopNotes}
                                    onChange={(e) => setStopNotes(e.target.value)}
                                    placeholder="Ej: Reunión en recepción…"
                                  />
                                </label>

                                {stopError && (
                                  <p
                                    className="pn-info"
                                    role="alert"
                                    style={{ color: "var(--pn-danger)" }}
                                  >
                                    {stopError}
                                  </p>
                                )}

                                <div className="pn-step-actions">
                                  <Button
                                    secondary
                                    disabled={stopSubmitting}
                                    onClick={() => setActiveStop(null)}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    disabled={stopSubmitting || !stopPhoto}
                                    onClick={() => void handleSubmitStopCheckIn()}
                                  >
                                    <Icon name="check_circle" size={18} />
                                    {stopSubmitting ? "Registrando llegada…" : "Confirmar Check-in"}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </section>
      ) : (
        <div className="pn-free-visit-layout">
          <section className="pn-panel pn-form">
            <h2>Registrar visita libre</h2>
            {!context.policy.allowFreeVisits ? (
              <div className="pn-info" role="status">
                <Icon name="block" size={18} />
                <span>Tu política actual no habilita visitas libres fuera de ruta.</span>
              </div>
            ) : (
              <form className="pn-form" onSubmit={handleSubmitFreeVisit}>
                <label>
                  Nombre del cliente o punto visitado
                  <input
                    required
                    value={freeClientName}
                    onChange={(e) => setFreeClientName(e.target.value)}
                    placeholder="Ej: Colegio San Patricio"
                    disabled={freeSubmitting}
                  />
                </label>
                <label>
                  Dirección (opcional)
                  <input
                    value={freeAddress}
                    onChange={(e) => setFreeAddress(e.target.value)}
                    placeholder="Ej: Cra 15 # 120-10"
                    disabled={freeSubmitting}
                  />
                </label>
                <label>
                  Notas de la visita (opcional)
                  <textarea
                    rows={2}
                    value={freeNotes}
                    onChange={(e) => setFreeNotes(e.target.value)}
                    placeholder="Motivo o contacto de la visita…"
                    disabled={freeSubmitting}
                  />
                </label>

                <div className="pn-gps-inline">
                  <span>
                    <Icon name="my_location" size={17} />{" "}
                    {gps
                      ? `GPS: ${gps.point.lat.toFixed(5)}, ${gps.point.lng.toFixed(5)} (±${gps.accuracyMeters} m)`
                      : gpsLoading
                        ? "Obteniendo GPS…"
                        : "Sin lectura GPS"}
                  </span>
                </div>

                {gps && (
                  <GeoMap
                    center={gps.point}
                    zoom={16}
                    height="170px"
                    interactive={false}
                    markers={[
                      {
                        id: "free-visit-gps",
                        position: gps.point,
                        label: `Tu ubicación (±${gps.accuracyMeters} m)`,
                        color: "ok",
                      },
                    ]}
                  />
                )}

                {freePhoto ? (
                  <div className="pn-info" role="status">
                    <Icon name="check_circle" size={18} />
                    <span>Fotografía en vivo lista para envío.</span>
                    <Button secondary onClick={() => setFreePhoto(null)}>
                      Tomar otra
                    </Button>
                  </div>
                ) : (
                  <LiveCameraCapture
                    initialFacingMode="environment"
                    title="Fotografía en vivo (obligatoria)"
                    onConfirm={(result) => setFreePhoto(result)}
                  />
                )}

                {freeError && (
                  <div className="pn-info" role="alert" style={{ color: "var(--pn-danger)" }}>
                    <Icon name="error" size={18} /> {freeError}
                  </div>
                )}

                <div className="form-actions">
                  <span className="small-muted">Se generará comprobante SHA-256 al enviar.</span>
                  <Button type="submit" disabled={freeSubmitting || !freePhoto}>
                    <Icon name="pin_drop" size={18} />
                    {freeSubmitting ? "Registrando visita…" : "Registrar Check-in"}
                  </Button>
                </div>
              </form>
            )}
          </section>

          {openFreeVisitsToday.length > 0 && (
            <section className="pn-panel">
              <h2>Visitas libres abiertas hoy</h2>
              <div className="pn-attendance-list">
                {openFreeVisitsToday.map((visit) => (
                  <div key={visit.id} className="pn-attendance-row static">
                    <span className="pn-attendance-row-icon">
                      <Icon name="explore" size={20} />
                    </span>
                    <div className="pn-attendance-row-body">
                      <strong>{visit.clientName}</strong>
                      <small>Check-in: {formatIsoDateTime(visit.checkinTimestamp)}</small>
                      <span className="pn-attendance-row-meta">{visit.receiptCode}</span>
                    </div>
                    <Button
                      secondary
                      onClick={() => {
                        setCheckoutVisitId(visit.id);
                        setCheckoutNotes("");
                        setCheckoutError(null);
                      }}
                    >
                      Cerrar visita (Check-out)
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
