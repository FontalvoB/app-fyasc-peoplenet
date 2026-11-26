import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toApiError } from "../../lib/api";
import {
  generateRequestNonce,
  resolveAttendanceChannel,
  submitShiftPunch,
  type AttendanceContextDto,
  type AttendanceEventType,
  type AttendanceRecordDto,
} from "../../lib/attendance-api";
import type { MapCircle, MapMarker } from "../../lib/maps/map-adapter";
import { GeoMap } from "../components/GeoMap";
import {
  LiveCameraCapture,
  type LiveCameraCaptureResult,
} from "../components/LiveCameraCapture";
import { QrScannerModal } from "../components/QrScannerModal";
import { Button, Icon, LoadingNote } from "../shared";
import { AttendanceReceipt } from "./AttendanceReceipt";
import {
  EVENT_ICONS,
  EVENT_LABELS,
  findNearestSite,
  formatDistance,
  readLiveGps,
  type GpsReading,
} from "./attendance-helpers";

export interface ShiftPunchFlowProps {
  context: AttendanceContextDto;
  onPunchCreated: (record: AttendanceRecordDto) => void;
  startSignal?: number;
}

type PunchStep = "event" | "gps" | "qr" | "photo" | "confirm" | "receipt";

export function ShiftPunchFlow({
  context,
  onPunchCreated,
  startSignal = 0,
}: ShiftPunchFlowProps) {
  const [step, setStep] = useState<PunchStep>("event");
  const [selectedEvent, setSelectedEvent] = useState<AttendanceEventType | null>(null);

  const [gps, setGps] = useState<GpsReading | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const [photo, setPhoto] = useState<LiveCameraCaptureResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<AttendanceRecordDto | null>(null);

  const nonceRef = useRef<string | null>(null);

  const eventOptions: AttendanceEventType[] = useMemo(() => {
    const showBreaks =
      context.policy.requireBreaks ||
      context.allowedNextEvents.includes("BREAK_START") ||
      context.allowedNextEvents.includes("BREAK_END");
    return showBreaks
      ? ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"]
      : ["CLOCK_IN", "CLOCK_OUT"];
  }, [context.policy.requireBreaks, context.allowedNextEvents]);

  const nearest = useMemo(() => {
    if (!gps) return null;
    return findNearestSite(gps.point, context.authorizedSites);
  }, [gps, context.authorizedSites]);

  const requiresQr = Boolean(nearest?.site.requireDynamicQr);
  const requiresPhoto = context.policy.requireLivePhotoShift;

  const fetchGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const reading = await readLiveGps();
      setGps(reading);
    } catch (err) {
      setGpsError(err instanceof Error ? err.message : "No pudimos leer tu ubicación GPS.");
    } finally {
      setGpsLoading(false);
    }
  }, []);

  const resetFlow = useCallback(() => {
    setStep("event");
    setSelectedEvent(null);
    setGps(null);
    setGpsError(null);
    setQrToken(null);
    setQrModalOpen(false);
    setPhoto(null);
    setSubmitError(null);
    setReceipt(null);
    nonceRef.current = null;
  }, []);

  useEffect(() => {
    if (startSignal > 0) {
      resetFlow();
    }
  }, [startSignal, resetFlow]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (nearest) {
      list.push({
        id: `site-${nearest.site.id}`,
        position: { lat: nearest.site.latitude, lng: nearest.site.longitude },
        label: nearest.site.name,
        popup: nearest.site.address ?? nearest.site.name,
        color: "brand",
      });
    }
    if (gps) {
      const withinGeofence =
        !nearest || !context.policy.requireGeofence || nearest.distanceMeters <= nearest.site.radiusMeters;
      const accurateEnough = gps.accuracyMeters <= context.policy.maxGpsAccuracyMeters;
      list.push({
        id: "user-gps",
        position: gps.point,
        label: `Tu ubicación (±${gps.accuracyMeters} m)`,
        color: withinGeofence && accurateEnough ? "ok" : "warn",
      });
    }
    return list;
  }, [nearest, gps, context.policy.requireGeofence, context.policy.maxGpsAccuracyMeters]);

  const mapCircles: MapCircle[] = useMemo(() => {
    if (!nearest) return [];
    return [
      {
        id: `geofence-${nearest.site.id}`,
        center: { lat: nearest.site.latitude, lng: nearest.site.longitude },
        radiusMeters: nearest.site.radiusMeters,
        color: "brand",
        fillOpacity: 0.14,
      },
    ];
  }, [nearest]);

  const fallbackCenter = useMemo(() => {
    if (gps) return gps.point;
    const primary =
      context.authorizedSites.find((s) => s.isPrimary) ?? context.authorizedSites[0];
    if (primary) return { lat: primary.latitude, lng: primary.longitude };
    return { lat: 4.648612, lng: -74.062841 };
  }, [gps, context.authorizedSites]);

  const handleSelectEvent = (eventType: AttendanceEventType) => {
    if (!context.allowedNextEvents.includes(eventType)) return;
    setSelectedEvent(eventType);
    setQrToken(null);
    setPhoto(null);
    setSubmitError(null);
    nonceRef.current = null;
    setStep("gps");
    void fetchGps();
  };

  const advanceAfterGps = () => {
    if (requiresQr) {
      setStep("qr");
      setQrModalOpen(true);
      return;
    }
    if (requiresPhoto) {
      setStep("photo");
      return;
    }
    nonceRef.current ??= generateRequestNonce();
    setStep("confirm");
  };

  const advanceAfterQr = () => {
    if (requiresPhoto) {
      setStep("photo");
      return;
    }
    nonceRef.current ??= generateRequestNonce();
    setStep("confirm");
  };

  const handleConfirmSubmit = async () => {
    if (!selectedEvent || !gps) return;
    if (requiresQr && !qrToken) return;
    if (requiresPhoto && !photo) return;

    const requestNonce = nonceRef.current ?? generateRequestNonce();
    nonceRef.current = requestNonce;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await submitShiftPunch(
        {
          eventType: selectedEvent,
          latitude: gps.point.lat,
          longitude: gps.point.lng,
          accuracyMeters: gps.accuracyMeters,
          deviceTimestampIso: gps.capturedAtIso,
          channel: resolveAttendanceChannel(),
          requestNonce,
          qrToken: requiresQr ? qrToken : null,
          photoCapturedAtIso: photo?.capturedAtIso ?? null,
        },
        photo?.blob,
      );
      nonceRef.current = null;
      setReceipt(created);
      setStep("receipt");
      onPunchCreated(created);
    } catch (err) {
      setSubmitError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "receipt" && receipt) {
    return (
      <div className="pn-punch-receipt-wrap">
        <div className="pn-info" role="status">
          <Icon name="check_circle" size={18} />
          <span>Marcación registrada con comprobante {receipt.receiptCode}.</span>
        </div>
        <AttendanceReceipt record={receipt} onBack={resetFlow} />
      </div>
    );
  }

  const stepsOrder: Array<{ key: PunchStep; label: string }> = [
    { key: "event", label: "1. Evento" },
    { key: "gps", label: "2. Ubicación" },
    ...(requiresQr ? [{ key: "qr" as const, label: "3. QR Sede" }] : []),
    ...(requiresPhoto
      ? [{ key: "photo" as const, label: `${requiresQr ? "4" : "3"}. Foto en vivo` }]
      : []),
    {
      key: "confirm",
      label: `${3 + (requiresQr ? 1 : 0) + (requiresPhoto ? 1 : 0)}. Confirmar`,
    },
  ];

  return (
    <section className="pn-panel pn-punch-stepper" aria-label="Registro de jornada laboral">
      <div className="pn-stepper-bar" role="list">
        {stepsOrder.map((item) => (
          <span
            key={item.key}
            role="listitem"
            className={`pn-stepper-pill ${step === item.key ? "active" : ""}`}
          >
            {item.label}
          </span>
        ))}
      </div>

      {step === "event" && (
        <div className="pn-step-body">
          <h2>Selecciona el tipo de marcación</h2>
          <p className="small-muted">
            Solo están habilitados los eventos permitidos según tu estado actual de jornada.
          </p>
          {context.allowedNextEvents.length === 0 ? (
            <div className="pn-info" role="status">
              <Icon name="event_available" size={18} />
              <span>Ya completaste los eventos permitidos para tu turno actual.</span>
            </div>
          ) : (
            <div className="pn-event-grid">
              {eventOptions.map((eventType) => {
                const enabled = context.allowedNextEvents.includes(eventType);
                return (
                  <button
                    type="button"
                    key={eventType}
                    disabled={!enabled}
                    className={`pn-event-option ${enabled ? "enabled" : "disabled"}`}
                    onClick={() => handleSelectEvent(eventType)}
                  >
                    <span className="pn-event-icon">
                      <Icon name={EVENT_ICONS[eventType]} size={24} />
                    </span>
                    <div>
                      <strong>{EVENT_LABELS[eventType]}</strong>
                      <small>{enabled ? "Disponible ahora" : "No disponible en este paso"}</small>
                    </div>
                    {enabled && <Icon name="chevron_right" size={18} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === "gps" && (
        <div className="pn-step-body">
          <div className="pn-step-title-row">
            <div>
              <h2>Verificación GPS · {selectedEvent ? EVENT_LABELS[selectedEvent] : ""}</h2>
              <p className="small-muted">
                Validamos tu coordenada puntual y la sede autorizada más cercana.
              </p>
            </div>
            <Button secondary disabled={gpsLoading} onClick={() => void fetchGps()}>
              <Icon name="my_location" size={17} /> {gpsLoading ? "Ubicando…" : "Reintentar GPS"}
            </Button>
          </div>

          {gpsLoading && !gps && <LoadingNote label="Obteniendo señal GPS de alta precisión…" />}

          {gpsError && (
            <div className="pn-info" role="alert" style={{ color: "var(--pn-danger)" }}>
              <Icon name="location_off" size={18} />
              <span>{gpsError}</span>
            </div>
          )}

          {gps && (
            <>
              <GeoMap
                center={fallbackCenter}
                markers={mapMarkers}
                circles={mapCircles}
                height="220px"
                autoFit={mapMarkers.length > 0}
              />
              <div className="pn-gps-metrics">
                <div>
                  <span>Precisión GPS</span>
                  <strong>±{gps.accuracyMeters} m</strong>
                </div>
                <div>
                  <span>Sede más cercana</span>
                  <strong>{nearest ? nearest.site.name : "Sin sede asignada"}</strong>
                </div>
                <div>
                  <span>Distancia</span>
                  <strong>
                    {nearest
                      ? `${formatDistance(nearest.distanceMeters)} (radio ${nearest.site.radiusMeters} m)`
                      : "N/A"}
                  </strong>
                </div>
              </div>
              {gps.accuracyMeters > context.policy.maxGpsAccuracyMeters && (
                <div className="pn-info" role="status">
                  <Icon name="warning" size={18} />
                  <span>
                    La precisión actual (±{gps.accuracyMeters} m) supera el umbral ideal de{" "}
                    {context.policy.maxGpsAccuracyMeters} m. Puedes reintentar o continuar bajo
                    revisión.
                  </span>
                </div>
              )}
              {nearest &&
                context.policy.requireGeofence &&
                nearest.distanceMeters > nearest.site.radiusMeters && (
                  <div className="pn-info" role="status">
                    <Icon name="wrong_location" size={18} />
                    <span>
                      Te encuentras fuera del radio de {nearest.site.radiusMeters} m de{" "}
                      {nearest.site.name}. El servidor aplicará la regla de geocerca vigente.
                    </span>
                  </div>
                )}
            </>
          )}

          <div className="pn-step-actions">
            <Button secondary onClick={resetFlow}>
              <Icon name="arrow_back" size={17} /> Cambiar evento
            </Button>
            <Button disabled={!gps || gpsLoading} onClick={advanceAfterGps}>
              Continuar <Icon name="arrow_forward" size={17} />
            </Button>
          </div>
        </div>
      )}

      {step === "qr" && (
        <div className="pn-step-body">
          <h2>Escaneo de QR dinámico de sede</h2>
          <p className="small-muted">
            {nearest?.site.name
              ? `La sede ${nearest.site.name} exige validar el código QR dinámico en pantalla.`
              : "La sede exige validar el código QR dinámico."}
          </p>

          {qrToken ? (
            <div className="pn-info" role="status">
              <Icon name="qr_code_2" size={20} />
              <span>Código QR leído correctamente.</span>
              <Button secondary onClick={() => setQrModalOpen(true)}>
                Escanear otro
              </Button>
            </div>
          ) : (
            <div className="pn-qr-prompt">
              <Button onClick={() => setQrModalOpen(true)}>
                <Icon name="qr_code_scanner" size={18} /> Abrir escáner QR
              </Button>
            </div>
          )}

          <QrScannerModal
            open={qrModalOpen}
            siteName={nearest?.site.name}
            onScanned={(token) => {
              setQrToken(token);
              setQrModalOpen(false);
            }}
            onClose={() => setQrModalOpen(false)}
          />

          <div className="pn-step-actions">
            <Button secondary onClick={() => setStep("gps")}>
              <Icon name="arrow_back" size={17} /> Atrás
            </Button>
            <Button disabled={!qrToken} onClick={advanceAfterQr}>
              Continuar <Icon name="arrow_forward" size={17} />
            </Button>
          </div>
        </div>
      )}

      {step === "photo" && (
        <div className="pn-step-body">
          <h2>Selfie en vivo requerida</h2>
          <p className="small-muted">
            Tu política de jornada requiere capturar una fotografía en vivo al marcar.
          </p>

          {photo ? (
            <div className="pn-info" role="status">
              <Icon name="check_circle" size={18} />
              <span>Fotografía en vivo lista para enviar.</span>
              <Button secondary onClick={() => setPhoto(null)}>
                Tomar otra
              </Button>
            </div>
          ) : (
            <LiveCameraCapture
              initialFacingMode="user"
              title="Fotografía de jornada"
              onConfirm={(result) => {
                setPhoto(result);
                nonceRef.current ??= generateRequestNonce();
                setStep("confirm");
              }}
              onCancel={() => setStep(requiresQr ? "qr" : "gps")}
            />
          )}

          {photo && (
            <div className="pn-step-actions">
              <Button secondary onClick={() => setStep(requiresQr ? "qr" : "gps")}>
                <Icon name="arrow_back" size={17} /> Atrás
              </Button>
              <Button
                onClick={() => {
                  nonceRef.current ??= generateRequestNonce();
                  setStep("confirm");
                }}
              >
                Continuar <Icon name="arrow_forward" size={17} />
              </Button>
            </div>
          )}
        </div>
      )}

      {step === "confirm" && selectedEvent && gps && (
        <div className="pn-step-body">
          <h2>Confirmar marcación</h2>
          <dl className="pn-details">
            <dt>Evento</dt>
            <dd>{EVENT_LABELS[selectedEvent]}</dd>
            <dt>Ubicación GPS</dt>
            <dd>
              {gps.point.lat.toFixed(6)}, {gps.point.lng.toFixed(6)} (±{gps.accuracyMeters} m)
            </dd>
            <dt>Sede más cercana</dt>
            <dd>
              {nearest
                ? `${nearest.site.name} · ${formatDistance(nearest.distanceMeters)}`
                : "Sin sede asignada"}
            </dd>
            {requiresQr && (
              <>
                <dt>QR dinámico</dt>
                <dd>{qrToken ? "Validado" : "Pendiente"}</dd>
              </>
            )}
            {requiresPhoto && (
              <>
                <dt>Fotografía</dt>
                <dd>{photo ? "Capturada en vivo" : "Pendiente"}</dd>
              </>
            )}
          </dl>

          {submitError && (
            <div className="pn-info" role="alert" style={{ color: "var(--pn-danger)" }}>
              <Icon name="cloud_off" size={18} />
              <span>{submitError}</span>
            </div>
          )}

          <div className="pn-step-actions">
            <Button
              secondary
              disabled={submitting}
              onClick={() =>
                setStep(requiresPhoto ? "photo" : requiresQr ? "qr" : "gps")
              }
            >
              <Icon name="arrow_back" size={17} /> Atrás
            </Button>
            <Button disabled={submitting} onClick={() => void handleConfirmSubmit()}>
              <Icon name="fingerprint" size={18} />
              {submitting ? "Registrando marcación…" : "Confirmar marcación"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
