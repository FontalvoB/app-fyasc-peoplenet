import type {
  AttendanceEventType,
  AttendanceStatus,
  AuthorizedSiteDto,
  CheckKey,
  CheckOutcome,
  FieldRouteStopStatus,
} from "../../lib/attendance-api";
import type { GeoPoint } from "../../lib/maps/map-adapter";

export interface GpsReading {
  point: GeoPoint;
  accuracyMeters: number;
  capturedAtIso: string;
}

export const EVENT_LABELS: Record<AttendanceEventType, string> = {
  CLOCK_IN: "Entrada",
  BREAK_START: "Inicio descanso",
  BREAK_END: "Fin descanso",
  CLOCK_OUT: "Salida",
};

export const EVENT_ICONS: Record<AttendanceEventType, string> = {
  CLOCK_IN: "login",
  BREAK_START: "coffee",
  BREAK_END: "play_arrow",
  CLOCK_OUT: "logout",
};

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  APPROVED: "Aprobada",
  SUSPICIOUS: "En revisión",
  REJECTED: "Rechazada",
};

export const STATUS_BADGE_CLASS: Record<AttendanceStatus, "green" | "amber" | "red"> = {
  APPROVED: "green",
  SUSPICIOUS: "amber",
  REJECTED: "red",
};

export const STOP_STATUS_LABELS: Record<FieldRouteStopStatus, string> = {
  PENDING: "Pendiente",
  CHECKED_IN: "En visita",
  COMPLETED: "Completada",
  SKIPPED: "Omitida",
};

export const CHECK_LABELS: Record<CheckKey, string> = {
  GEOFENCE: "Geocerca",
  GPS_ACCURACY: "Precisión GPS",
  LOCATION_COHERENCE: "Coherencia de ubicación",
  LIVE_PHOTO: "Fotografía en vivo",
  DYNAMIC_QR: "QR dinámico",
  REQUEST_INTEGRITY: "Integridad de solicitud",
};

export const CHECK_OUTCOME_LABELS: Record<CheckOutcome, string> = {
  OK: "OK",
  REVIEW: "Revisión",
  REJECT: "Rechazado",
  NA: "N/A",
};

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const earthRadius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return Math.round(2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function findNearestSite(
  point: GeoPoint,
  sites: AuthorizedSiteDto[],
): { site: AuthorizedSiteDto; distanceMeters: number } | null {
  if (sites.length === 0) return null;
  let best = {
    site: sites[0],
    distanceMeters: haversineMeters(point, {
      lat: sites[0].latitude,
      lng: sites[0].longitude,
    }),
  };
  for (let i = 1; i < sites.length; i += 1) {
    const candidate = sites[i];
    const dist = haversineMeters(point, {
      lat: candidate.latitude,
      lng: candidate.longitude,
    });
    if (dist < best.distanceMeters) {
      best = { site: candidate, distanceMeters: dist };
    }
  }
  return best;
}

export function readLiveGps(): Promise<GpsReading> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Este dispositivo o navegador no soporta geolocalización."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          point: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracyMeters: Math.round(position.coords.accuracy),
          capturedAtIso: new Date(position.timestamp || Date.now()).toISOString(),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              "Permiso de ubicación denegado. Habilita el GPS del navegador para marcar asistencia.",
            ),
          );
          return;
        }
        if (err.code === err.TIMEOUT) {
          reject(
            new Error(
              "No obtuvimos lectura GPS a tiempo (12 s). Muévete a un lugar con mejor señal e inténtalo de nuevo.",
            ),
          );
          return;
        }
        reject(
          new Error("No pudimos obtener tu ubicación actual. Verifica que el GPS esté encendido."),
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      },
    );
  });
}

export function formatIsoDateTime(iso: string | null | undefined): string {
  if (!iso) return "Sin dato";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Sin dato";
  return parsed.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "Sin dato";
  if (meters >= 1000) {
    return `${(meters / 1000).toLocaleString("es-CO", { maximumFractionDigits: 2 })} km`;
  }
  return `${Math.round(meters)} m`;
}

export function todayLocalIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}
