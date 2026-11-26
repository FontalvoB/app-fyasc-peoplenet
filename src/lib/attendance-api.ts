import { Capacitor } from "@capacitor/core";
import {
  ApiError,
  BASE_URL,
  clearAllUserStorage,
  readSession,
  requestJson,
} from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// Enums compartidos (Contrato REST Control de Asistencia v1.0)
// ─────────────────────────────────────────────────────────────────────────────

export type AttendanceProfileType = "FIXED_SITE" | "FIELD_ADVISOR" | "HYBRID";
export type AttendanceEventType =
  | "CLOCK_IN"
  | "BREAK_START"
  | "BREAK_END"
  | "CLOCK_OUT";
export type AttendanceStatus = "APPROVED" | "SUSPICIOUS" | "REJECTED";
export type OutOfGeofenceAction = "REJECT" | "REVIEW";
export type FieldVisitMode = "FREE" | "ROUTE_STOP";
export type FieldRouteStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type FieldRouteStopStatus =
  | "PENDING"
  | "CHECKED_IN"
  | "COMPLETED"
  | "SKIPPED";
export type AttendanceChannel = "PWA" | "ANDROID" | "IOS";
export type CheckKey =
  | "GEOFENCE"
  | "GPS_ACCURACY"
  | "LOCATION_COHERENCE"
  | "LIVE_PHOTO"
  | "DYNAMIC_QR"
  | "REQUEST_INTEGRITY";
export type CheckOutcome = "OK" | "REVIEW" | "REJECT" | "NA";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs /attendance/me
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceConsentDto {
  accepted: boolean;
  policyVersion: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  photoRetentionDays: number;
}

export interface AttendancePolicyDto {
  id: number;
  code: string;
  name: string;
  profileType: AttendanceProfileType;
  requireBreaks: boolean;
  requireGeofence: boolean;
  requireLivePhotoShift: boolean;
  requireLivePhotoVisit: boolean;
  allowFreeVisits: boolean;
  allowRouteVisits: boolean;
  expectedStartTime: string | null;
  expectedEndTime: string | null;
  lateToleranceMinutes: number;
  maxGpsAccuracyMeters: number;
  photoRetentionDays: number;
}

export interface AuthorizedSiteDto {
  id: number;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxGpsAccuracyMeters: number;
  requireDynamicQr: boolean;
  qrRotationSeconds: number;
  isPrimary: boolean;
}

export interface AttendanceCheckDto {
  key: CheckKey;
  outcome: CheckOutcome;
  detail: string;
}

export interface AttendanceCorrectionDto {
  id?: number;
  fieldName: "EVENT_TYPE" | "SERVER_TIMESTAMP";
  oldValue?: string | null;
  newValue: string;
  justification: string;
  correctedByName?: string | null;
  correctedAt?: string | null;
}

export interface AttendanceRecordDto {
  id: number;
  receiptCode: string;
  employeeId: number;
  employeeName: string;
  documentNumber: string | null;
  siteId: number | null;
  siteName: string | null;
  eventType: AttendanceEventType;
  serverTimestamp: string;
  deviceTimestamp: string;
  latitude: number;
  longitude: number;
  gpsAccuracyMeters: number;
  distanceToSiteMeters: number | null;
  channel: AttendanceChannel;
  status: AttendanceStatus;
  effectiveStatus: AttendanceStatus;
  lateMinutes: number | null;
  checks: AttendanceCheckDto[];
  evidenceHash: string;
  photoPresignedUrl: string | null;
  photoPurgedAt: string | null;
  reviewedStatus: AttendanceStatus | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewJustification: string | null;
  corrections: AttendanceCorrectionDto[];
}

export interface AttendanceContextDto {
  employeeId: number;
  employeeName: string;
  documentNumber: string | null;
  positionName: string | null;
  areaName: string | null;
  serverTimeIso: string;
  consent: AttendanceConsentDto;
  policy: AttendancePolicyDto;
  authorizedSites: AuthorizedSiteDto[];
  allowedNextEvents: AttendanceEventType[];
  todayRecords: AttendanceRecordDto[];
  lastValidRecord: AttendanceRecordDto | null;
}

export interface ShiftPunchPayload {
  eventType: AttendanceEventType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  deviceTimestampIso: string;
  channel: AttendanceChannel;
  requestNonce: string;
  qrToken: string | null;
  photoCapturedAtIso: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs /attendance/field
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldClientDto {
  id: number;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

export interface FieldRouteStopDto {
  id: number;
  stopOrder: number;
  plannedTime: string | null;
  objective: string | null;
  status: FieldRouteStopStatus;
  client: FieldClientDto;
  visitId: number | null;
}

export interface FieldRouteDto {
  id: number;
  advisorEmployeeId: number;
  advisorName: string;
  routeDate: string;
  name: string;
  status: FieldRouteStatus;
  notes: string | null;
  stops: FieldRouteStopDto[];
}

export interface FieldVisitCheckInPayload {
  visitMode: FieldVisitMode;
  routeStopId: number | null;
  clientId: number | null;
  freeClientName: string | null;
  freeAddress: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  deviceTimestampIso: string;
  photoCapturedAtIso: string;
  channel: AttendanceChannel;
  requestNonce: string;
  notes: string | null;
}

export interface FieldVisitCheckOutBody {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  notes?: string | null;
}

export interface FieldVisitDto {
  id: number;
  receiptCode: string;
  employeeId: number;
  employeeName: string;
  visitMode: FieldVisitMode;
  routeStopId: number | null;
  clientId: number | null;
  clientName: string;
  address: string | null;
  checkinTimestamp: string;
  checkinLatitude: number;
  checkinLongitude: number;
  checkinAccuracyMeters: number;
  distanceToClientMeters: number | null;
  checkinPhotoPresignedUrl: string | null;
  photoPurgedAt: string | null;
  checkoutTimestamp: string | null;
  checkoutLatitude: number | null;
  checkoutLongitude: number | null;
  durationMinutes: number | null;
  notes: string | null;
  status: AttendanceStatus;
  effectiveStatus: AttendanceStatus;
  checks: AttendanceCheckDto[];
  evidenceHash: string;
  reviewedStatus: AttendanceStatus | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewJustification: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de transporte y canal
// ─────────────────────────────────────────────────────────────────────────────

const MULTIPART_FALLBACK_MESSAGES: Record<number, string> = {
  400: "Datos inválidos. Revisa la información e inténtalo de nuevo.",
  401: "Tu sesión expiró. Inicia sesión nuevamente.",
  403: "No tienes permisos para realizar esta acción.",
  404: "El recurso solicitado no existe.",
  413: "La fotografía excede el tamaño máximo permitido.",
  500: "Error interno del servidor. Inténtalo de nuevo en unos minutos.",
  503: "El servicio no está disponible en este momento. Inténtalo más tarde.",
};

let redirectingToLogin = false;

function handleMultipartSessionExpired(): void {
  clearAllUserStorage();
  if (redirectingToLogin) return;
  if (window.location.pathname.startsWith("/login")) return;
  redirectingToLogin = true;
  window.location.assign("/login");
}

function buildMultipartUrl(path: string): string {
  const clean = path.startsWith("/api/")
    ? path.slice("/api".length)
    : path.startsWith("/")
      ? path
      : `/${path}`;
  return `${BASE_URL}${clean}`;
}

function buildMultipartAuthHeaders(): Record<string, string> {
  const session = readSession();
  if (!session) return {};
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
  };
  if (session.user.username) {
    headers["X-User-Name"] = encodeURIComponent(session.user.username);
  }
  if (session.user.userId != null) {
    headers["X-User-Id"] = String(session.user.userId);
  }
  return headers;
}

async function parseMultipartErrorBody(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as Record<string, unknown> | null;
    if (body && typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
    return null;
  } catch {
    return null;
  }
}

export async function requestMultipart<T>(
  path: string,
  formData: FormData,
  timeoutMs = 25_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildMultipartUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...buildMultipartAuthHeaders(),
      },
      body: formData,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new ApiError(
        "El envío tardó demasiado y se canceló. Revisa tu historial antes de reintentar.",
        0,
        true,
      );
    }
    throw new ApiError(
      "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
      0,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const serverMessage = await parseMultipartErrorBody(response);
    if (response.status === 401) {
      handleMultipartSessionExpired();
    }
    throw new ApiError(
      serverMessage ??
        MULTIPART_FALLBACK_MESSAGES[response.status] ??
        `Error inesperado del servidor (HTTP ${response.status}).`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("El servidor devolvió una respuesta inesperada.", response.status);
  }
}

export function resolveAttendanceChannel(): AttendanceChannel {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    if (platform === "android") return "ANDROID";
    if (platform === "ios") return "IOS";
  }
  return "PWA";
}

export function generateRequestNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints /attendance/me
// ─────────────────────────────────────────────────────────────────────────────

export function getAttendanceContext(signal?: AbortSignal): Promise<AttendanceContextDto> {
  return requestJson<AttendanceContextDto>("/attendance/me/context", { signal });
}

export function submitAttendanceConsent(
  accepted: boolean,
  policyVersion: string,
): Promise<AttendanceConsentDto> {
  return requestJson<AttendanceConsentDto>("/attendance/me/consent", {
    method: "POST",
    body: { policyVersion, accepted },
  });
}

export function revokeAttendanceConsent(): Promise<AttendanceConsentDto> {
  return requestJson<AttendanceConsentDto>("/attendance/me/consent", {
    method: "DELETE",
  });
}

export function submitShiftPunch(
  payload: ShiftPunchPayload,
  photoBlob?: Blob,
): Promise<AttendanceRecordDto> {
  const formData = new FormData();
  formData.append(
    "payload",
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );
  if (photoBlob) {
    formData.append("photo", photoBlob, "shift-capture.jpg");
  }
  return requestMultipart<AttendanceRecordDto>("/attendance/me/punches", formData);
}

export function getMyPunches(days = 14, signal?: AbortSignal): Promise<AttendanceRecordDto[]> {
  return requestJson<AttendanceRecordDto[]>(`/attendance/me/punches?days=${days}`, { signal });
}

export function getPunchReceipt(id: number, signal?: AbortSignal): Promise<AttendanceRecordDto> {
  return requestJson<AttendanceRecordDto>(`/attendance/me/punches/${id}/receipt`, { signal });
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints /attendance/field
// ─────────────────────────────────────────────────────────────────────────────

export function getMyRoutes(dateIso?: string, signal?: AbortSignal): Promise<FieldRouteDto[]> {
  const query = dateIso ? `?date=${encodeURIComponent(dateIso)}` : "";
  return requestJson<FieldRouteDto[]>(`/attendance/field/my-routes${query}`, { signal });
}

export function checkInFieldVisit(
  payload: FieldVisitCheckInPayload,
  photoBlob: Blob,
): Promise<FieldVisitDto> {
  const formData = new FormData();
  formData.append(
    "payload",
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
  );
  formData.append("photo", photoBlob, "visit-checkin.jpg");
  return requestMultipart<FieldVisitDto>("/attendance/field/visits/check-in", formData);
}

export function checkOutFieldVisit(
  visitId: number,
  body: FieldVisitCheckOutBody,
): Promise<FieldVisitDto> {
  return requestJson<FieldVisitDto>(`/attendance/field/visits/${visitId}/check-out`, {
    method: "POST",
    body,
  });
}

export function getMyVisits(days = 14, signal?: AbortSignal): Promise<FieldVisitDto[]> {
  return requestJson<FieldVisitDto[]>(`/attendance/field/my-visits?days=${days}`, { signal });
}

export function getVisitReceipt(id: number, signal?: AbortSignal): Promise<FieldVisitDto> {
  return requestJson<FieldVisitDto>(`/attendance/field/visits/${id}/receipt`, { signal });
}
