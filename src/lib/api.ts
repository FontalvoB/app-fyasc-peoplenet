/**
 * Cliente HTTP único de la app contra kpis-ms. Todo módulo que consuma el
 * backend pasa por aquí (convención Ola 0, PLAN-FYA-REVISADO.md §2):
 *
 * - BASE_URL se resuelve en src/lib/config.ts según el modo de build
 *   (web dev usa '/api' con proxy de Vite; builds nativos usan URL absoluta
 *   inyectada por env). Los servicios pasan rutas relativas ('/auth/login').
 * - Auth: Authorization Bearer + compatibilidad legacy X-User-Name / X-User-Id
 *   (igual que auth-header.interceptor.ts del web Angular).
 * - 401 en sesión activa: limpiar storage + redirect /login UNA sola vez.
 *   401 en el propio login: error visible, sin bucle de redirección.
 * - 403: conserva sesión, mensaje de acceso restringido.
 * - 5xx / red / timeout: error recuperable en español. Nunca tragar errores.
 * - Timeout con AbortController (15 s por defecto).
 */

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "./config";

import type {
  AprobadorResumen,
  ApiResponse,
  CompanyWire,
  EmpleadoAutenticadoResponse,
  IndicatorWire,
  LoginRequest,
  LoginResponse,
  SolicitudNovedadCreateRequest,
  SolicitudNovedadResponse,
} from "./api-types";

// === M4 api (ownership: oc-wave0) — tipos compartidos de página Spring ===

/** Página de Spring Data (GET /mias y demás listados paginados):
 * totalElements ≠ size, totalPages ≠ number — no mezclar en la UI. */
export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  number: number;
  size: number;
  numberOfElements: number | null;
}

export const BASE_URL = API_BASE_URL;

/** Clave de storage de sesión: { token, user } con user = LoginResponse. */
export const SESSION_STORAGE_KEY = "peoplenet-auth";

/** Timeout por defecto para lecturas/escrituras JSON (plan: 15 s). */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface Session {
  token: string;
  user: LoginResponse;
}

/** Error tipado de la capa API; la UI solo necesita message + status. */
export class ApiError extends Error {
  /** 0 = red/abort/timeout; si no, el status HTTP real. */
  readonly status: number;
  readonly isTimeout: boolean;

  constructor(message: string, status = 0, isTimeout = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isTimeout = isTimeout;
  }
}

/** Normaliza cualquier excepción a ApiError con mensaje en español. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.message) {
    return new ApiError(error.message);
  }
  return new ApiError("Ocurrió un error inesperado. Inténtalo de nuevo.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesión (storage peoplenet-auth)
// ─────────────────────────────────────────────────────────────────────────────

/** Lee la sesión sin lanzar: JSON corrupto u omissiones → null. */
export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Session).token !== "string" ||
      !(parsed as Session).token ||
      typeof (parsed as Session).user !== "object" ||
      (parsed as Session).user === null
    ) {
      return null;
    }
    return parsed as Session;
  } catch {
    return null;
  }
}

/** Persiste { token, user }; el token es obligatorio (login 200 siempre lo trae). */
function saveSession(token: string | null, user: LoginResponse): void {
  if (!token) {
    // El login 200 siempre trae token; si no, es contrato roto: fallar alto.
    throw new ApiError("El servidor no devolvió un token de sesión válido.", 500);
  }
  const session: Session = { token, user };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

/** ¿Hay sesión con token utilizable? Base del guard de Workspace. */
export function isAuthenticated(): boolean {
  return readSession() !== null;
}

/**
 * Limpia la sesión Y los datos demo heredados (claves pn-v2-* del web mock:
 * pn-v2-requests, pn-v2-reads, pn-v2-seen, pn-v2-profile, pn-v2-evaluated).
 * Un cambio de usuario nunca debe heredar datos del anterior.
 */
export function clearAllUserStorage(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    const demoKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("pn-v2-")) demoKeys.push(key);
    }
    demoKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage inaccesible (p. ej. modo privado agresivo): la sesión en memoria
    // se descarta al recargar; no hay nada más que limpiar de forma segura.
  }
}

/**
 * Cierra sesión: limpia storage. La navegación a /login la hace el llamador
 * (Workspace usa window.location.assign para remontar la app y no heredar
 * estado de usuario en memoria).
 */
export function logout(): void {
  clearAllUserStorage();
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 → /login una sola vez
// ─────────────────────────────────────────────────────────────────────────────

let redirectingToLogin = false;

function handleSessionExpired(): void {
  clearAllUserStorage();
  if (redirectingToLogin) return; // ya se redirigió en este ciclo de página
  if (window.location.pathname.startsWith("/login")) return;
  redirectingToLogin = true;
  window.location.assign("/login");
}

// ─────────────────────────────────────────────────────────────────────────────
// Headers de identidad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authorization Bearer + compatibilidad legacy del web: X-User-Name y
 * X-User-Id. El X-User-Name se envía URL-encodeado porque XUserNameDecodingFilter
 * hace URLDecoder.decode; con usernames ASCII normales encodeURIComponent no
 * altera nada (letras, dígitos, '.' y '-' quedan igual).
 */
function buildAuthHeaders(): Record<string, string> {
  const session = readSession();
  if (!session) return {};
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
  };
  const username = session.user.username;
  if (username) headers["X-User-Name"] = encodeURIComponent(username);
  if (session.user.userId != null) {
    headers["X-User-Id"] = String(session.user.userId);
  }
  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Núcleo de peticiones
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Objeto serializado a JSON; undefined = sin body. */
  body?: unknown;
  timeoutMs?: number;
  responseType?: "json" | "text" | "blob";
  /** true → 401 NO limpia sesión ni redirige (login, pruebas). */
  skipAuthRedirect?: boolean;
  /** Señal externa para cancelar (el hook de estado aborta al desmontar). */
  signal?: AbortSignal;
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Datos inválidos. Revisa la información e inténtalo de nuevo.",
  401: "Usuario o contraseña incorrectos.",
  403: "No tienes permisos para realizar esta acción.",
  404: "El recurso solicitado no existe.",
  500: "Error interno del servidor. Inténtalo de nuevo en unos minutos.",
  503: "El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.",
};

/** Extrae el message amigable del body de error si el backend lo envió. */
function extractServerMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  return null;
}

async function parseErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function requestUrl(path: string): string {
  // Los servicios pasan rutas relativas a BASE_URL ('/auth/login'); si alguien
  // pasa '/api/...' por error se normaliza para no producir /api/api.
  const clean = path.startsWith("/api/")
    ? path.slice(BASE_URL.length)
    : path.startsWith("/")
      ? path
      : `/${path}`;
  return `${BASE_URL}${clean}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseType = "json",
    skipAuthRedirect = false,
    signal,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = {
    Accept: responseType === "json" ? "application/json" : "*/*",
    ...buildAuthHeaders(),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(requestUrl(path), {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      const byTimeout = !signal?.aborted; // abortó el timer, no el llamador
      throw new ApiError(
        byTimeout
          ? "La petición tardó demasiado y se canceló. Inténtalo de nuevo."
          : "La petición fue cancelada.",
        0,
        byTimeout,
      );
    }
    throw new ApiError(
      "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
      0,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    // 401 en sesión activa: limpiar y redirigir UNA vez. En el login (o con
    // skipAuthRedirect) solo se muestra el mensaje, sin bucle.
    if (response.status === 401 && !skipAuthRedirect) handleSessionExpired();
    throw new ApiError(
      extractServerMessage(errorBody) ??
        FALLBACK_MESSAGES[response.status] ??
        `Error inesperado del servidor (HTTP ${response.status}).`,
      response.status,
    );
  }

  if (responseType === "text") return (await response.text()) as unknown as T;
  if (responseType === "blob") {
    return (await response.blob()) as unknown as T;
  }

  // JSON: 204 u otros bodies vacíos → undefined (la UI lo trata como "Sin dato").
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      "El servidor devolvió una respuesta inesperada.",
      response.status,
    );
  }
}

/** JSON directo (AuthController, DashboardController, …). */
export function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, { ...options, responseType: "json" });
}

/**
 * Envoltorio ApiResponse<T>: valida success; `success:false` es fallo de
 * negocio aunque el HTTP sea 200. Nunca convertirlo en array vacío.
 */
export async function requestApiResponse<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = await request<ApiResponse<T>>(path, { ...options, responseType: "json" });
  if (typeof envelope !== "object" || envelope === null || !("success" in envelope)) {
    throw new ApiError("El servidor devolvió una respuesta inesperada.", 200);
  }
  if (envelope.success !== true) {
    throw new ApiError(envelope.message || "La operación fue rechazada por el servidor.", 200);
  }
  return envelope.data;
}

/** Descarga binaria (documentos, certificados). */
export function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  return request<Blob>(path, { ...options, responseType: "blob" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Operaciones de sesión (Ola 0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login. Guarda la sesión SOLO si el login es plenamente
 * válido: con requirePasswordChange=true la sesión NO se persiste y la UI
 * debe bloquear el avance (decisión O0). Devuelve el LoginResponse completo
 * para que la UI lea message/requirePasswordChange.
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: credentials,
    skipAuthRedirect: true, // 401 de credenciales inválidas: mensaje, no redirect
  });
  if (response.requirePasswordChange !== true) {
    saveSession(response.token, response); // valida que exista token
  }
  return response;
}

/**
 * GET /api/auth/me para revalidar la sesión almacenada. /me no devuelve un
 * token nuevo: se conserva SIEMPRE el token del login (no reemplazarlo con
 * null/undefined). En 401 el cliente ya limpia y redirige; otros fallos
 * (5xx/red) no invalidan la sesión local.
 */
export async function validateSession(): Promise<LoginResponse | null> {
  const session = readSession();
  if (!session) return null;
  try {
    const me = await request<LoginResponse>("/auth/me");
    // Conservar SIEMPRE el token del login: /me no devuelve uno nuevo.
    saveSession(session.token, me);
    return me;
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status !== 401) {
      // Backend caído u otro fallo transitorio: la sesión sigue siendo válida
      // localmente; los módulos mostrarán su propio error al cargar datos.
      return session.user;
    }
    return null; // 401: handleSessionExpired ya limpió y redirigió
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper de estado para páginas (loading / success / error + retry)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiState<T> {
  status: "idle" | "loading" | "success" | "error";
  /** null = aún sin dato; la UI muestra "Sin dato", nunca cero por null. */
  data: T | null;
  error: string | null;
  /** Status HTTP del error (403 → sección restringida; null si no hay error). */
  errorStatus: number | null;
}

const idleState = <T,>(): ApiState<T> => ({
  status: "idle",
  data: null,
  error: null,
  errorStatus: null,
});

/**
 * Hook de lectura para páginas: GET a `path` con cancelación automática de
 * lecturas obsoletas (cambio de ruta/filtros/desmonte). `path` null = no
 * cargar (idle). Conserva el dato anterior mientras recarga o ante error
 * para que un fallo de una sección no borre lo ya mostrado.
 * `unwrapApiResponse: true` desempaqueta el envoltorio ApiResponse<T> del
 * backend (success:false = error de negocio aunque el HTTP sea 200).
 */
export function useApi<T>(
  path: string | null,
  options?: {
    timeoutMs?: number;
    enabled?: boolean;
    unwrapApiResponse?: boolean;
  },
): { state: ApiState<T>; reload: () => void } {
  const enabled = options?.enabled ?? true;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<ApiState<T>>(idleState<T>);

  useEffect(() => {
    if (!path || !enabled) {
      setState(idleState<T>());
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setState((prev) => ({
      status: "loading",
      data: prev.data,
      error: null,
      errorStatus: null,
    }));
    const load = options?.unwrapApiResponse
      ? requestApiResponse<T>(path, {
          signal: controller.signal,
          timeoutMs: options?.timeoutMs,
        })
      : request<T>(path, {
          signal: controller.signal,
          timeoutMs: options?.timeoutMs,
        });
    load
      .then((data) => {
        if (!active || controller.signal.aborted) return;
        setState({ status: "success", data, error: null, errorStatus: null });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const apiError = toApiError(error);
        setState((prev) => ({
          status: "error",
          data: prev.data,
          error: apiError.message,
          errorStatus: apiError.status,
        }));
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, tick]);

  return { state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Identidad de sesión (presentación)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nombre para mostrar a partir del LoginResponse: employee.fullName →
 * username → email. Para usernames tipo "angel.prueba.isaac.rodriguez" usa el
 * primer segmento capitalizado. Nunca nombres demo.
 */
export function displayName(user: LoginResponse | null): string {
  if (!user) return "";
  const fullName = user.employee?.fullName?.trim();
  if (fullName) return fullName;
  const candidate = user.username?.trim() || user.email?.split("@")[0] || "";
  const first = candidate.split(/[.\s_-]+/)[0] || candidate;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "usuario";
}

/** Iniciales para el avatar (máximo 2 letras). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] ?? "").repeat(name ? 2 : 0).toUpperCase() || "PN";
}

/** employeeId del colaborador de la sesión (null = sin colaborador asociado). */
export function sessionEmployeeId(): number | null {
  const session = readSession();
  const employeeId = session?.user.employeeId;
  return typeof employeeId === "number" ? employeeId : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Períodos (mes/año) derivados de indicadores reales
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthPeriod {
  /** Año del indicador. */
  year: number;
  /** Mes en español minúscula ("julio"), tal como lo almacena el backend. */
  month: string;
}

const MONTH_ORDER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "julio" → "Julio". Valores desconocidos se muestran capitalizados tal cual. */
export function monthLabel(month: string | null): string {
  if (!month) return "Sin dato";
  const normalized = month.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Formatea un valor de indicador con su unidad de medición real. El backend
 * valida finalResultValue como % de cumplimiento, por eso null→"%" es seguro;
 * si measurementUnit indica otra unidad, no se asume "%".
 */
export function formatMeasure(
  value: number | null,
  unit: string | null,
): string {
  if (value == null) return "Sin dato";
  const number = value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  if (!unit) return `${number}%`;
  return unit === "%" ? `${number}%` : `${number} ${unit}`;
}

/** "Julio 2026" para el selector/listados. */
export function periodLabel(period: MonthPeriod): string {
  return `${monthLabel(period.month)} ${period.year}`;
}

/**
 * Deriva los períodos (year/month) reales de los indicadores del empleado,
 * ordenados del más reciente al más antiguo. Sin datos → [].
 */
export function periodsFromIndicators(
  indicators: IndicatorWire[] | null,
): MonthPeriod[] {
  if (!Array.isArray(indicators)) return [];
  const seen = new Map<string, MonthPeriod>();
  for (const indicator of indicators) {
    if (indicator.year == null || !indicator.month) continue;
    seen.set(`${indicator.year}-${indicator.month}`, {
      year: indicator.year,
      month: indicator.month.toLowerCase(),
    });
  }
  return Array.from(seen.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const ia = MONTH_ORDER.indexOf(a.month);
    const ib = MONTH_ORDER.indexOf(b.month);
    return ib - ia;
  });
}

/**
 * GET /api/indicators/employee/{employeeId} — lista completa de indicadores
 * del colaborador. Compartido por Home (anillo/períodos) y Kpis (selector):
 * URL única para el endpoint reutilizado.
 */
export function useEmployeeIndicators(employeeId: number | null) {
  return useApi<IndicatorWire[]>(
    employeeId != null ? `/indicators/employee/${employeeId}` : null,
  );
}

// === M4 api (ownership: oc-wave0)
// Funciones NUEVAS para Solicitudes. Prohibido modificar lo existente.

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de presentación M4
// ─────────────────────────────────────────────────────────────────────────────

/** "2026-10-09" → partes es-CO sin corrimiento de zona horaria (mediodía fijo). */
export function calendarDate(
  iso: string | null,
): { day: string; month: string; year: string } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    day: parsed.toLocaleDateString("es-CO", { day: "numeric" }),
    month: parsed.toLocaleDateString("es-CO", { month: "short" }),
    year: parsed.toLocaleDateString("es-CO", { year: "numeric" }),
  };
}

/** "2026-10-09" → "9 de oct"; null → "Sin dato". Para listados compactos. */
export function shortCalendarDate(iso: string | null): string {
  const parts = calendarDate(iso);
  return parts ? `${parts.day} de ${parts.month}` : "Sin dato";
}

/** "09:30" ("HH:mm") → "9:30 a. m."; null → "Sin dato". */
export function timeLabel(iso: string | null): string {
  if (!iso || !/^\d{2}:\d{2}/.test(iso)) return "Sin dato";
  const [h, m] = iso.slice(0, 5).split(":").map(Number);
  const period = h < 12 ? "a. m." : "p. m.";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Elimina acentos de us-ascii (NFD) para búsquedas tipo contains del backend. */
export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Servicios M4 (rutas relativas a BASE_URL)
// ─────────────────────────────────────────────────────────────────────────────

export interface SolicitudesFilter {
  searchTerm?: string;
  tipo?: string;
  estado?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

/** GET /api/solicitudes/mias?page=&size= — página Spring de la bandeja propia. */
export async function getMySolicitudes(
  page = 0,
  size = 20,
  filter: SolicitudesFilter = {},
): Promise<SpringPage<SolicitudNovedadResponse>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  const term = filter.searchTerm?.trim();
  if (term) params.set("searchTerm", stripDiacritics(term));
  if (filter.tipo) params.set("tipo", filter.tipo);
  if (filter.estado) params.set("estado", filter.estado);
  if (filter.fechaDesde) params.set("fechaDesde", filter.fechaDesde);
  if (filter.fechaHasta) params.set("fechaHasta", filter.fechaHasta);
  return requestJson<SpringPage<SolicitudNovedadResponse>>(
    `/solicitudes/mias?${params.toString()}`,
  );
}

/** GET /api/solicitudes/{id} — detalle con documentos e historial. */
export function getSolicitud(id: number): Promise<SolicitudNovedadResponse> {
  return requestJson<SolicitudNovedadResponse>(`/solicitudes/${id}`);
}

/** GET /api/solicitudes/me — prefill real del formulario. */
export function getSolicitudMe(): Promise<EmpleadoAutenticadoResponse> {
  return requestJson<EmpleadoAutenticadoResponse>("/solicitudes/me");
}

/** GET /api/solicitudes/empresas — empresas activas para el selector. */
export function getSolicitudEmpresas(): Promise<CompanyWire[]> {
  return requestJson<CompanyWire[]>("/solicitudes/empresas");
}

/** GET /api/solicitudes/aprobadores?empleadoId=&limit= — buscador. */
export function getSolicitudAprobadores(
  empleadoId: number,
  limit = 50,
): Promise<AprobadorResumen[]> {
  return requestJson<AprobadorResumen[]>(
    `/solicitudes/aprobadores?empleadoId=${empleadoId}&limit=${limit}`,
  );
}

/** GET /api/solicitudes/aprobadores/sugerido?empleadoId= — jefe inmediato;
 * cuerpo vacío o 404 cuando no hay jefatura (la UI lo maneja explícito). */
export function getSolicitudAprobadorSugerido(
  empleadoId: number,
): Promise<AprobadorResumen | null> {
  return requestJson<AprobadorResumen | null>(
    `/solicitudes/aprobadores/sugerido?empleadoId=${empleadoId}`,
  );
}

/** POST /api/solicitudes — 201 SolicitudNovedadResponse (estado PENDIENTE_JEFE). */
export function createSolicitud(
  payload: SolicitudNovedadCreateRequest,
): Promise<SolicitudNovedadResponse> {
  return requestJson<SolicitudNovedadResponse>("/solicitudes", {
    method: "POST",
    body: payload,
  });
}

// === fin M4 api

// === M5 api (ownership: oc-m5)
// Documentos corporativos + confirmaciones de lectura (kpis-ms). SOLO se
// añaden funciones nuevas al final de este archivo; ninguna función existente
// se modifica (convención de edición concurrente, PLAN-FYA-BACKEND.md).
// Contratos probados contra el backend local el 2026-10-06: la raíz
// /corporate-documents es ApiResponse<List<DTO>> sin paginación; /categories
// devuelve {value,label}; /{id}/download-url devuelve data.downloadUrl;
// /{id}/download entrega el binario real (200 application/pdf).

import type {
  ConfirmedDocumentIds,
  CorporateCategoryOption,
  CorporateDocumentDTO,
  CorporateDocumentDetailResponse,
  DocumentConfirmationResult,
  DocumentDownloadUrl,
} from "./api-types";
// NOTA: SpringPage ya está declarado localmente en este archivo por M4
// (línea ~33); se reutiliza tal cual, sin reimportar ni redeclarar.

/** userId numérico de la sesión almacenada (null = sin usuario identificable:
 * la UI debe bloquear la confirmación, no inventar un id). */
export function sessionUserId(): number | null {
  const session = readSession();
  const userId = session?.user.userId;
  return typeof userId === "number" ? userId : null;
}

/**
 * GET /api/corporate-documents — raíz: ApiResponse<CorporateDocumentDTO[]>
 * SIN paginación real (§4 M5). Compartido por Home (pendientes de lectura).
 */
export function useCorporateDocuments(enabled = true) {
  return useApi<CorporateDocumentDTO[]>("/corporate-documents", {
    unwrapApiResponse: true,
    enabled,
  });
}

/** GET /api/corporate-documents/categories — catálogo real del servidor:
 * ApiResponse<{value,label}[]> (contrato real, difiere del plan §4). */
export function useDocumentCategories() {
  return useApi<CorporateCategoryOption[]>("/corporate-documents/categories", {
    unwrapApiResponse: true,
  });
}

/**
 * GET /api/document-confirmations/user/{userId}/document-ids —
 * ApiResponse<{documentIds:number[]}>. userId null (sin sesión identificable)
 * → no consulta: la UI trata el estado de lectura como desconocido.
 */
export function useConfirmedDocumentIds(userId: number | null) {
  return useApi<ConfirmedDocumentIds>(
    userId != null
      ? `/document-confirmations/user/${userId}/document-ids`
      : null,
    { unwrapApiResponse: true },
  );
}

/** GET /api/corporate-documents/{id} — detalle con versionHistory.
 * 404 → ApiError status 404 con el message del backend. */
export function useCorporateDocumentDetail(id: number | null) {
  return useApi<CorporateDocumentDetailResponse>(
    id != null ? `/corporate-documents/${id}` : null,
    { unwrapApiResponse: true },
  );
}

/**
 * GET /api/corporate-documents/category/{category}?page=0&size=20 — ruta
 * respaldada para filtrar por categoría: ApiResponse<Page<CorporateDocumentDTO>>
 * con metadatos Spring. Devuelve la página cruda; el consumidor lee `content`.
 */
export function useCorporateDocumentsByCategory(
  category: string | null,
  enabled = true,
) {
  return useApi<SpringPage<CorporateDocumentDTO>>(
    category != null && enabled
      ? `/corporate-documents/category/${encodeURIComponent(category)}?page=0&size=20`
      : null,
    { unwrapApiResponse: true },
  );
}

/**
 * GET /api/corporate-documents/search?query={texto}&category={category} —
 * ApiResponse<CorporateDocumentDTO[]> lista directa (NO página). query vacía
 * → no consulta (el backend no exige query, pero el estado de la UI decide
 * qué fuente usar). category opcional (null = todas).
 */
export function useCorporateDocumentSearch(
  query: string,
  category: string | null,
  enabled: boolean,
) {
  const trimmed = query.trim();
  const params = new URLSearchParams({ query: trimmed });
  if (category != null) params.set("category", category);
  return useApi<CorporateDocumentDTO[]>(
    enabled && trimmed ? `/corporate-documents/search?${params.toString()}` : null,
    { unwrapApiResponse: true },
  );
}

/**
 * Descarga el archivo REAL del documento: GET /corporate-documents/{id}/download
 * (binario Resource con Content-Type/Content-Disposition del backend; plan §2:
 * 60 s para archivos). Lanza ApiError si el binario falla — el llamador decide
 * el fallback (download-url) y el mensaje amigable. Nunca devuelve bytes mock.
 */
export function downloadCorporateDocument(id: number): Promise<Blob> {
  return requestBlob(`/corporate-documents/${id}/download`, {
    timeoutMs: 60_000,
  });
}

/**
 * GET /api/corporate-documents/{id}/download-url — fallback de descarga:
 * ApiResponse con data={downloadUrl, expiresInMinutes}. La URL es pre-firmada
 * (60 min) y puede caducar o apuntar a un key S3 inexistente; úsala SOLO como
 * segunda oportunidad tras un fallo del binario directo.
 */
export function getCorporateDocumentDownloadUrl(
  id: number,
): Promise<DocumentDownloadUrl> {
  return requestApiResponse<DocumentDownloadUrl>(`/corporate-documents/${id}/download-url`);
}

/**
 * POST /api/document-confirmations {documentId, userId} — confirmación de
 * lectura SOLO con acción explícita del usuario (nunca automática al abrir;
 * decisión M5). success:true → data es el DocumentConfirmationDTO nuevo o
 * {alreadyConfirmed:true}. success:false / 400 / 404 / 500 → ApiError con el
 * message del backend: la UI deja el documento como pendiente y muestra el
 * motivo. userId SIEMPRE el de la sesión real (el backend tiene un fallback
 * peligroso que atribuye la confirmación a "cualquier usuario activo" si el
 * id no existe — no ejercitarlo desde la app).
 */
export function confirmDocumentRead(
  documentId: number,
  userId: number,
): Promise<DocumentConfirmationResult> {
  return requestApiResponse<DocumentConfirmationResult>(
    "/document-confirmations",
    {
      method: "POST",
      body: { documentId, userId },
    },
  );
}
// === fin M5 api

// === M8-M10 api (ownership: oc-m5)
// SOLO funciones nuevas al final (convención de edición concurrente). Todos
// los contratos probados en vivo el 2026-10-06; listados DIRECTOS sin
// envoltorio ApiResponse (certificados, activities, profile-summary, about-me).

import type {
  AboutMeResponse,
  CertificateResponse,
  DashboardActivityDto,
  EmployeeProfileSummary,
} from "./api-types";
// NOTA: LoginResponse ya está importado arriba en este archivo (Ola 0).

/** GET /api/certificates/employee/{employeeId} — lista directa (sin envelope).
 * 403 = sin permiso documentos.certificados → la UI muestra sección
 * restringida; NUNCA convertir el error en array vacío. */
export function useEmployeeCertificates(employeeId: number | null) {
  return useApi<CertificateResponse[]>(
    employeeId != null ? `/certificates/employee/${employeeId}` : null,
  );
}

/**
 * GET /api/certificates/{id}/download — PDF real (60 s, plan §2). El backend
 * reporta errores como JSON {error,timestamp} (500) o 404 vacío: request()
 * los convierte en ApiError con mensaje amigable y el llamador NUNCA guarda
 * el body de un status de error como PDF.
 */
export function downloadCertificate(id: number): Promise<Blob> {
  return requestBlob(`/certificates/${id}/download`, { timeoutMs: 60_000 });
}

/** GET /api/dashboard/activities — feed directo sin ids (M9; lo comparte M2
 * para la campanita). Sin marcadores de lectura: no existen en el contrato. */
export function useDashboardActivities(enabled = true) {
  return useApi<DashboardActivityDto[]>("/dashboard/activities", { enabled });
}

/** GET /api/employees/{employeeId}/profile-summary — resumen organizacional
 * directo del colaborador de la sesión. */
export function useProfileSummary(employeeId: number | null) {
  return useApi<EmployeeProfileSummary>(
    employeeId != null ? `/employees/${employeeId}/profile-summary` : null,
  );
}

/** GET /api/employees/{employeeId}/about-me — {aboutMe} directo (puede ser ""). */
export function useAboutMe(employeeId: number | null) {
  return useApi<AboutMeResponse>(
    employeeId != null ? `/employees/${employeeId}/about-me` : null,
  );
}

/**
 * PUT /api/employees/{employeeId}/about-me {aboutMe} — única escritura de
 * perfil con contrato verificado; devuelve el eco {aboutMe}. 200 HTTP sin
 * envoltorio. El llamador decide reintento/estado: no reintentar
 * automáticamente tras timeout de escritura (plan §2).
 */
export function updateAboutMe(
  employeeId: number,
  aboutMe: string,
): Promise<AboutMeResponse> {
  return requestJson<AboutMeResponse>(`/employees/${employeeId}/about-me`, {
    method: "PUT",
    body: { aboutMe },
  });
}

/** GET /api/auth/me como lectura de identidad para el perfil (sin tocar la
 * sesión almacenada). 401 → el cliente limpia y redirige; otros fallos no
 * invalidan la sesión. */
export function useMyIdentity(enabled = true) {
  return useApi<LoginResponse>("/auth/me", { enabled });
}
// === fin M8-M10 api

// === M6/M7 api (ownership: oc-wave0)
// Funciones NUEVAS para Organigrama (M6), Evaluaciones (M7) y Nanabot.
// Prohibido modificar lo existente.

import type {
  ChatRequest,
  ChatResponse,
  EvaluationResponse,
  EvaluationSubmitRequest,
  EvaluationsPagedResponse,
  OrgAreaNode,
  OrgPagedResponse,
  OrgSubareaNode,
  OrganigramaResponse,
  OrganigramaSearchResult,
} from "./api-types";

// ── M6: Organigrama ──────────────────────────────────────────────────────────

/** GET /api/organigrama/employee/{employeeId}?isAdmin=false&lazy=true.
 * Nunca isAdmin=true para conseguir datos faltantes (plan §5 M6). */
export function useOrganigramaView(employeeId: number | null) {
  return useApi<OrganigramaResponse>(
    employeeId != null
      ? `/organigrama/employee/${employeeId}?isAdmin=false&lazy=true`
      : null,
  );
}

/** GET /api/organigrama/gerencia/{gerenciaId}/areas — expansión lazy. */
export function getOrgGerenciaAreas(gerenciaId: number): Promise<OrgAreaNode[]> {
  return requestJson<OrgAreaNode[]>(`/organigrama/gerencia/${gerenciaId}/areas`);
}

/** GET /api/organigrama/area/{areaId}/subareas — expansión lazy. */
export function getOrgAreaSubareas(areaId: number): Promise<OrgSubareaNode[]> {
  return requestJson<OrgSubareaNode[]>(`/organigrama/area/${areaId}/subareas`);
}

/** GET /api/organigrama/area/{areaId}/employees?page=&size=30 — directos paginados. */
export function getOrgAreaEmployees(
  areaId: number,
  page: number,
  size = 30,
): Promise<OrgPagedResponse> {
  return requestJson<OrgPagedResponse>(
    `/organigrama/area/${areaId}/employees?page=${page}&size=${size}`,
  );
}

/** GET /api/organigrama/subarea/{subareaId}/employees?page=&size=30 — paginados. */
export function getOrgSubareaEmployees(
  subareaId: number,
  page: number,
  size = 30,
): Promise<OrgPagedResponse> {
  return requestJson<OrgPagedResponse>(
    `/organigrama/subarea/${subareaId}/employees?page=${page}&size=${size}`,
  );
}

/** GET /api/organigrama/employee/{employeeId}/search?query=&limit=10. */
export function getOrgSearch(
  employeeId: number,
  query: string,
  limit = 10,
): Promise<OrganigramaSearchResult[]> {
  return requestJson<OrganigramaSearchResult[]>(
    `/organigrama/employee/${employeeId}/search?query=${encodeURIComponent(
      query,
    )}&isAdmin=false&limit=${limit}`,
  );
}

// ── M7: Evaluaciones ─────────────────────────────────────────────────────────

/** GET /api/evaluations?evaluatedId=&periodName=&page=&size= — listado
 * paginado (para usuarios planos el backend fuerza evaluatedId propio). */
export function getEvaluationsList(
  evaluatedId: number,
  periodName: string,
  page = 0,
  size = 20,
): Promise<EvaluationsPagedResponse> {
  return requestJson<EvaluationsPagedResponse>(
    `/evaluations?evaluatedId=${evaluatedId}&periodName=${encodeURIComponent(
      periodName,
    )}&page=${page}&size=${size}`,
  );
}

/** GET /api/evaluations/{uuid} — evaluación completa guardada. */
export function getEvaluation(uuid: string): Promise<EvaluationResponse> {
  return requestJson<EvaluationResponse>(
    `/evaluations/${encodeURIComponent(uuid)}`,
  );
}

/**
 * GET /api/evaluations/autoeval-ref?employeeId=&periodName= — 200 con la
 * autoeval existente o 204 sin body (→ null). Detecta duplicados antes
 * de iniciar un nuevo intento.
 */
export async function getAutoevalRef(
  employeeId: number,
  periodName: string,
): Promise<EvaluationResponse | null> {
  const ref = await requestJson<EvaluationResponse | null>(
    `/evaluations/autoeval-ref?employeeId=${employeeId}&periodName=${encodeURIComponent(
      periodName,
    )}`,
  );
  return ref && ref.uuid != null ? ref : null;
}

/** POST /api/evaluations — 200 (no 201) EvaluationResponse con status COMPLETED. */
export function submitEvaluation(
  payload: EvaluationSubmitRequest,
): Promise<EvaluationResponse> {
  return requestJson<EvaluationResponse>("/evaluations", {
    method: "POST",
    body: payload,
  });
}

// ── M7: Nanabot (solo ADMIN/SUPER_ADMIN; el backend resuelve el rol en BD) ──

/**
 * POST /api/chat {message, language:'es', history, context} → ChatResponseDTO.
 * Para el asistente de consulta (NO para guardar evaluaciones). El backend
 * exige rol ADMIN/SUPER_ADMIN y responde 403 para usuarios planos.
 */
export function postChat(request: ChatRequest): Promise<ChatResponse> {
  return requestJson<ChatResponse>("/chat", { method: "POST", body: request });
}

/** ¿La sesión tiene rol que habilita Nanabot (ADMIN/SUPER_ADMIN)? Los roles
 * llegan como RoleWire (name = enum RoleName). */
export function sessionCanUseNanabot(): boolean {
  const session = readSession();
  const roles = session?.user.roles ?? [];
  return roles.some((r) => r.name === "SUPER_ADMIN" || r.name === "ADMIN");
}
// === fin M6/M7 api
