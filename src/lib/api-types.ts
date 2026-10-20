/**
 * Tipos de transporte contra kpis-ms (Spring Boot 3).
 * Espejan los DTOs del backend; cada campo tiene correspondencia verificada
 * en el código Java. NO inventar campos: al agregar un tipo, leer primero el
 * DTO/entidad en kpis-ms/src/main/java/com/kpis/**.
 *
 * Convención (docs/decisions/PLAN-FYA-REVISADO.md §2):
 * - DTOs de transporte separados de modelos de presentación.
 * - Los ids y relaciones del backend son anulables (Long/String de Java):
 *   la UI debe tratar null como "Sin dato", nunca como cero.
 * - Fechas: LocalDateTime llega como ISO string; LocalDate como YYYY-MM-DD.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Auth — com.kpis.dto.LoginRequest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login. El DTO no tiene campo `email`: si el usuario usa su
 * correo para entrar, se envía en `username` y el backend lo resuelve
 * (AuthServiceImpl busca por username y por email).
 */
export interface LoginRequest {
  username: string;
  password: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth — com.kpis.dto.LoginResponse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rol serializado desde com.kpis.entity.Role (entity, no DTO). El campo
 * `permissions` del rol es @JsonIgnore y NO llega por el wire; `name` es el
 * enum RoleName serializado como string.
 */
export interface RoleWire {
  id: number | null;
  name: string | null;
  code: string | null;
  description: string | null;
  active: boolean | null;
  isSystem: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Subconjunto de com.kpis.entity.Employee serializado en
 * LoginResponse.employee. La entidad tiene muchos más campos; aquí solo se
 * tipan los que la app consume (verificados en la entidad, no inventados).
 */
export interface EmployeeWire {
  id: number | null;
  fullName: string | null;
  positionName: string | null;
  corporateEmail: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  hireDate: string | null;
  status: string | null;
}

/**
 * POST /api/auth/login (200) y GET /api/auth/me. Campos verificados contra
 * com.kpis.dto.LoginResponse; relaciones e ids pueden ser null. Tras el login
 * el backend NO llena `permissions` (solo /auth/me lo hace): tratarla como
 * opcional en la UI.
 */
export interface LoginResponse {
  userId: number | null;
  username: string | null;
  email: string | null;
  roles: RoleWire[] | null;
  permissions: string[] | null;
  employeeId: number | null;
  dependencyId: number | null;
  areaId: number | null;
  subareaId: number | null;
  token: string | null;
  requirePasswordChange: boolean | null;
  message: string | null;
  employee: EmployeeWire | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Envoltorios genéricos del backend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envoltorio com.kpis.dto.response.ApiResponse. `success: false` es fallo de
 * negocio aunque el HTTP sea 200.
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T;
}

/**
 * Cuerpo de error com.kpis.exception.ErrorResponse (GlobalExceptionHandler):
 * errores de negocio/validación llegan con message amigable en español.
 */
export interface ApiErrorBody {
  timestamp: string | null;
  status: number | null;
  error: string | null;
  message: string | null;
  path: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — com.kpis.dto.EmployeeDashboardResponse
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/dashboard/employee/{employeeId}. Requiere kpis.dashboard. */
export interface EmployeeDashboardResponse {
  employeeId: number | null;
  fullName: string | null;
  area: string | null;
  totalIndicators: number | null;
  completedIndicators: number | null;
  pendingIndicators: number | null;
  averageFinalResult: number | null;
}

/** GET /api/dashboard/activities (DashboardActivityDto). Feed compartido SIN id:
 * no permite marcar lectura ni enlazar a un recurso específico. */
export interface DashboardActivityDto {
  type: string | null;
  title: string | null;
  description: string | null;
  /** LocalDateTime → ISO string. */
  timestamp: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores — com.kpis.entity.Indicator (lista directa, sin paginación)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subconjunto de com.kpis.entity.Indicator serializado en
 * GET /api/indicators/employee/**. Las relaciones (employee, kpi, evidences,
 * indicatorComments) no se consumen aquí. `month` llega en español minúscula
 * ("julio") tal como se almacena; `finalResultValue` null = pendiente de
 * calificar (es un % de cumplimiento validado por el backend).
 */
export interface IndicatorWire {
  id: number | null;
  kpiId: number | null;
  kpiType: string | null;
  dependencyId: number | null;
  dependencyName: string | null;
  areaId: number | null;
  areaName: string | null;
  measurementUnit: string | null;
  /** "ascendente" | "descendente" (com.kpis.service.KpiServiceImpl). */
  measurementDirection: string | null;
  hasBase: boolean | null;
  baseValue: number | null;
  frequency: string | null;
  weight: number | null;
  active: boolean;
  registrationType: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  startCalificationDate: string | null;
  endCalificationDate: string | null;
  indicatorTitle: string | null;
  objective: string | null;
  indicatorDescription: string | null;
  month: string | null;
  year: number | null;
  targetPercentage: number | null;
  weightPercentage: number | null;
  finalResultValue: number | null;
  actualResultValue: number | null;
  comments: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics mensual — com.kpis.dto.EmployeeMonthlyAnalyticsResponse
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/indicators/employee/{id}/year/{year}/month/{month}/analytics.
 * completionRate (% de indicadores calificados) ≠ averageResult (promedio de
 * resultados): son métricas distintas y no deben mezclarse. `month` repite
 * el valor enviado en la ruta. */
export interface EmployeeMonthlyAnalyticsResponse {
  employeeId: number | null;
  employeeName: string | null;
  idNumber: string | null;
  areaName: string | null;
  subareaName: string | null;
  year: number | null;
  month: string | null;
  totalIndicators: number | null;
  completedIndicators: number | null;
  pendingIndicators: number | null;
  completionRate: number | null;
  averageResult: number | null;
  averageTargetPercentage: number | null;
  bestResult: number | null;
  lowestResult: number | null;
  indicatorBreakdown: IndicatorBreakdownItem[] | null;
  statusBreakdown: StatusBreakdownItem[] | null;
}

export interface IndicatorBreakdownItem {
  indicatorId: number | null;
  label: string | null;
  measurementUnit: string | null;
  measurementDirection: string | null;
  result: number | null;
  targetPercentage: number | null;
  weightPercentage: number | null;
  completed: boolean;
}

export interface StatusBreakdownItem {
  label: string | null;
  value: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluaciones — com.kpis.entity.EvalPeriod (GET /api/evaluations/periods)
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve solo períodos activos; el controller atrapa errores y puede
 * responder 200 con [] — ese vacío no demuestra salud de DB por sí solo. */
export interface EvalPeriod {
  id: number | null;
  name: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  startDate: string | null;
  endDate: string | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Solicitudes — com.kpis.solicitud.dto.SolicitudNovedadStatsResponse
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/solicitudes/stats?scope=propias. porEstado usa los nombres del
 * enum EstadoSolicitudNovedad como claves. */
export interface SolicitudNovedadStatsResponse {
  total: number;
  porEstado: Record<string, number> | null;
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  finalizadas: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documentos corporativos — com.kpis.dto.corporate.CorporateDocumentDTO
// (consultas M5 reutilizadas por Home para pendientes de lectura)
// ─────────────────────────────────────────────────────────────────────────────

export interface CorporateDocumentDTO {
  id: number | null;
  title: string | null;
  description: string | null;
  category: string | null;
  version: string | null;
  versionNumber: number | null;
  fileName: string | null;
  fileSize: number | null;
  fileSizeFormatted: string | null;
  mimeType: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  updatedAt: string | null;
  isActive: boolean | null;
  /** String único, no array. */
  tags: string | null;
  isRequired: boolean | null;
  lastReviewDate: string | null;
  s3Url: string | null;
  availableVersions: string[] | null;
}

/** data de GET /api/document-confirmations/user/{userId}/document-ids
 * (ApiResponse<{documentIds:number[]}>). */
export interface ConfirmedDocumentIds {
  documentIds: number[] | null;
}

// === M4: Solicitudes (ownership: oc-wave0)
// Espejan los DTOs de com.kpis.solicitud.dto/** verificados en kpis-ms.
// Estados y tipos son enums del backend: NUNCA inventar valores.

/** com.kpis.solicitud.enums.TipoSolicitudNovedad. */
export type TipoSolicitudNovedad =
  | "PERMISO"
  | "LICENCIA"
  | "VACACIONES"
  | "CITACION_MEDICA"
  | "INCAPACIDAD"
  | "OTRO";

/** com.kpis.solicitud.enums.EstadoSolicitudNovedad (Etiquetas exactas del
 * plan §4 M4; se resuelven con estadoSolicitudLabel). */
export type EstadoSolicitudNovedad =
  | "BORRADOR"
  | "PENDIENTE_JEFE"
  | "APROBADA_JEFE"
  | "RECHAZADA_JEFE"
  | "PENDIENTE_GH"
  | "APROBADA"
  | "RECHAZADA"
  | "COMPLETADA"
  | "CANCELADA";

/** com.kpis.solicitud.enums.DecisionSolicitudNovedad (historial). */
export type DecisionSolicitudNovedad = "APROBAR" | "RECHAZAR" | "PENDIENTE";

/** Etiquetas de estado en español exactas del plan (sin perder precisión). */
export const ESTADO_SOLICITUD_LABELS: Record<EstadoSolicitudNovedad, string> = {
  BORRADOR: "Borrador",
  PENDIENTE_JEFE: "Pendiente del jefe",
  APROBADA_JEFE: "Aprobada por jefe",
  RECHAZADA_JEFE: "Rechazada por jefe",
  PENDIENTE_GH: "Pendiente de Gestión Humana",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

/** POST /api/solicitudes — com.kpis.solicitud.dto.SolicitudNovedadCreateRequest.
 * Sin `estado` ni `colaboradorId` (el servidor no los acepta): el estado
 * inicial lo fija el backend (PENDIENTE_JEFE al radicar, exige aprobadorId). */
export interface SolicitudNovedadCreateRequest {
  tipo: TipoSolicitudNovedad;
  /** Máximo 120 caracteres. */
  subtipo?: string | null;
  /** Solo para tipo OTRO; máximo 500 caracteres. */
  otraNovedad?: string | null;
  /** No vacía (NotBlank en el DTO). */
  descripcion: string;
  /** "YYYY-MM-DD". */
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  /** "HH:mm". */
  horaSalida?: string | null;
  horaRegreso?: string | null;
  duracionDias?: number | null;
  empresaId?: number | null;
  empresaNombre?: string | null;
  /** Null solo para BORRADOR; obligatorio para radicar (backend valida). */
  aprobadorId: number;
  aprobadorNombre?: string | null;
  aprobadorCargo?: string | null;
  /** Adjuntos en base64 (máx. ~5MB por archivo, validado por el backend). */
  documentos: SolicitudDocumentoUploadRequest[];
}

/** com.kpis.solicitud.dto.DocumentoUploadRequest: adjunto en base64. */
export interface SolicitudDocumentoUploadRequest {
  nombreArchivo: string;
  mimeType: string;
  tamanoBytes: number;
  base64: string;
}

/** GET /api/solicitudes/mias y /{id} — SolicitudNovedadResponse. Fechas como
 * "YYYY-MM-DD" e instancias como "YYYY-MM-DD'T'HH:mm:ss" (JsonFormat del DTO). */
export interface SolicitudNovedadResponse {
  id: number | null;
  radicado: string | null;
  tipo: TipoSolicitudNovedad | null;
  subtipo: string | null;
  otraNovedad: string | null;
  descripcion: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  horaSalida: string | null;
  horaRegreso: string | null;
  duracionDias: number | null;
  estado: EstadoSolicitudNovedad | null;
  motivoRechazo: string | null;
  colaboradorId: number | null;
  colaboradorNombre: string | null;
  colaboradorDocumento: string | null;
  colaboradorCargo: string | null;
  colaboradorCorreo: string | null;
  colaboradorTelefono: string | null;
  empresaId: number | null;
  empresaNombre: string | null;
  aprobadorId: number | null;
  aprobadorNombre: string | null;
  aprobadorCargo: string | null;
  jefeDecisionPorId: number | null;
  jefeDecisionPorNombre: string | null;
  jefeFechaDecision: string | null;
  jefeObservaciones: string | null;
  jefeCausalRechazo: string | null;
  jefeCausalPendiente: string | null;
  ghDecisionPorId: number | null;
  ghDecisionPorNombre: string | null;
  ghFechaDecision: string | null;
  ghObservaciones: string | null;
  ghCausalRechazo: string | null;
  ghCausalPendiente: string | null;
  creadoPorUsername: string | null;
  fechaCreacion: string | null;
  modificadoPorUsername: string | null;
  fechaModificacion: string | null;
  documentos: SolicitudNovedadDocumentoResponse[] | null;
  /** El listado /mias no trae historial (verificado): solo el detalle /{id}. */
  historial: SolicitudNovedadHistorialResponse[] | null;
}

/** Adjunto de una solicitud ya radicada (respuesta del backend). */
export interface SolicitudNovedadDocumentoResponse {
  id: number | null;
  nombreArchivo: string | null;
  mimeType: string | null;
  tamanoBytes: number | null;
  s3Key: string | null;
  s3Url: string | null;
  downloadUrl: string | null;
  fechaSubida: string | null;
}

/** Movimiento del historial de la solicitud (solo en el detalle). */
export interface SolicitudNovedadHistorialResponse {
  id: number | null;
  fecha: string | null;
  autorId: number | null;
  autorNombre: string | null;
  rol: string | null;
  decision: DecisionSolicitudNovedad | null;
  causal: string | null;
  observaciones: string | null;
}

/** GET /api/solicitudes/me — snapshot del colaborador para prefill del form. */
export interface EmpleadoAutenticadoResponse {
  id: number | null;
  nombre: string | null;
  documento: string | null;
  cargo: string | null;
  correo: string | null;
  telefono: string | null;
  empresaId: number | null;
  empresaNombre: string | null;
  jefeInmediatoId: number | null;
  jefeInmediatoNombre: string | null;
  jefeInmediatoCargo: string | null;
  jefeInmediatoCorreo: string | null;
  /** "YYYY-MM-DD". */
  fechaIngreso: string | null;
  modalidad: string | null;
  tipoContrato: string | null;
  horaSalida: string | null;
  horaRegreso: string | null;
}

/** com.kpis.entity.Company serializado en GET /api/solicitudes/empresas
 * (subconjunto verificado; las relaciones van con verbose/ignoradas). */
export interface CompanyWire {
  id: number | null;
  uuid: string | null;
  name: string | null;
  code: string | null;
  active: boolean | null;
}

/** Item ligero del selector de aprobadores. */
export interface AprobadorResumen {
  id: number | null;
  nombre: string | null;
  cargo: string | null;
  correo: string | null;
  /** El field Java es primitivo boolean: siempre presente. */
  liderInmediatoDelEmpleado: boolean;
}
// === fin M4

// === M5: Documentos (ownership: oc-m5)
// Contratos verificados contra CorporateDocumentController /
// DocumentConfirmationController (kpis-ms) y probados contra el backend local
// (2026-10-06). Diferencias reales frente a PLAN-FYA-REVISADO.md §4 M5:
// - GET /categories devuelve data=[{value,label}] (catálogo), NO string[].
// - GET /{id}/download-url devuelve data={downloadUrl, expiresInMinutes}
//   (Map.of en el controller), NO data.url.
// El DTO de listado (CorporateDocumentDTO) y el envoltorio de ids confirmados
// (ConfirmedDocumentIds) ya están definidos arriba en este archivo (los añadió
// M2); aquí solo se agregan los que faltaban.

/** Opción del catálogo GET /api/corporate-documents/categories. */
export interface CorporateCategoryOption {
  label: string | null;
  value: string | null;
}

/** Página Spring serializada dentro de ApiResponse en
 * GET /corporate-documents/category/{category}?page=&size= (§4 M5: es una
 * página envuelta, no un PagedResponse propio). Solo se tipan los campos que
 * la app consume. */
export interface SpringPage<T> {
  content: T[] | null;
  totalElements: number | null;
  totalPages: number | null;
  number: number | null;
  size: number | null;
  first: boolean | null;
  last: boolean | null;
  empty: boolean | null;
}

/** data de GET /api/corporate-documents/{id}/download-url. La URL es
 * pre-firmada y caduca (expiresInMinutes): no guardarla como acceso
 * permanente; pedir una nueva cuando expire. */
export interface DocumentDownloadUrl {
  downloadUrl: string | null;
  expiresInMinutes: number | null;
}

/** Versión del historial (com.kpis.dto.corporate.CorporateDocumentHistoryDTO). */
export interface CorporateDocumentHistoryDTO {
  id: number | null;
  version: string | null;
  versionNumber: number | null;
  /** "yyyy-MM-dd HH:mm:ss" (JsonFormat del backend, no ISO con T). */
  uploadedAt: string | null;
  uploadedBy: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileSizeFormatted: string | null;
  isCurrent: boolean | null;
  s3Url: string | null;
}

/** data de GET /api/corporate-documents/{id}
 * (com.kpis.dto.corporate.CorporateDocumentDetailResponse; incluye
 * versionHistory, a diferencia del DTO de listado). */
export interface CorporateDocumentDetailResponse {
  id: number | null;
  title: string | null;
  description: string | null;
  category: string | null;
  version: string | null;
  versionNumber: number | null;
  fileName: string | null;
  fileSize: number | null;
  fileSizeFormatted: string | null;
  mimeType: string | null;
  uploadedBy: string | null;
  /** "yyyy-MM-dd HH:mm:ss". */
  uploadedAt: string | null;
  updatedAt: string | null;
  /** String único, no array. */
  tags: string | null;
  isRequired: boolean | null;
  lastReviewDate: string | null;
  s3Url: string | null;
  versionHistory: CorporateDocumentHistoryDTO[] | null;
}

/** com.kpis.dto.corporate.DocumentConfirmationDTO. */
export interface DocumentConfirmationDTO {
  id: number | null;
  documentId: number | null;
  documentTitle: string | null;
  userId: number | null;
  userName: string | null;
  /** "yyyy-MM-dd HH:mm:ss". */
  confirmedAt: string | null;
}

/** Rama "ya confirmado": POST devuelve success:true con
 * data=Map.of("alreadyConfirmed", true) cuando la confirmación existía. */
export interface AlreadyConfirmedData {
  alreadyConfirmed: boolean | null;
}

/** data de POST /api/document-confirmations: el DTO nuevo o, si ya existía,
 * {alreadyConfirmed:true}. Ambos llegan con success:true; los errores
 * (400/404/500) llegan con success:false y NO son esta unión. */
export type DocumentConfirmationResult =
  | AlreadyConfirmedData
  | DocumentConfirmationDTO;
// === fin M5

// === M8-M10 (ownership: oc-m5)
// Certificados, feed de actividad y perfil. Contratos verificados contra el
// backend local (2026-10-06, fixture userId 2873 / employeeId 3619):
// - GET /api/certificates/employee/{id} → List<CertificateResponse> DIRECTO
//   (sin envoltorio ApiResponse). Requiere permiso documentos.certificados.
// - GET /api/certificates/{id}/download → PDF real (fixture: 9.515 bytes,
//   "%PDF"); errores → 500 JSON {error,timestamp} SIN campo `message`.
// - GET /api/dashboard/activities → DashboardActivityDto[] DIRECTO (ya tipado
//   arriba, sección M2). Sin id/readAt: no permite estado de lectura.
// - GET /api/employees/{id}/profile-summary → EmployeeProfileSummary DIRECTO.
// - GET/PUT /api/employees/{id}/about-me → {aboutMe:string} (Map, directo).

/** com.kpis.dto.CertificateResponse. Estados documentados: DRAFT, ISSUED,
 * REPRINTED. `description` puede llegar como string JSON (fixture: blob
 * {"showSalary":…}) — la UI no debe asumir texto plano. pdfS3Url es solo
 * trazabilidad: la descarga SIEMPRE vía /{id}/download (permisos backend). */
export interface CertificateResponse {
  id: number | null;
  certificateNumber: string | null;
  certificateType: string | null;
  status: string | null;
  employeeId: number | null;
  employeeIdNumber: string | null;
  employeeFullName: string | null;
  employeePosition: string | null;
  companyId: number | null;
  companyName: string | null;
  companyNit: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  issueDate: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  hireDate: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  terminationDate: string | null;
  certifyingOfficer: string | null;
  certifyingOfficerTitle: string | null;
  description: string | null;
  pdfS3Url: string | null;
  createdBy: string | null;
  /** LocalDateTime → ISO string. */
  createdAt: string | null;
}

/** Unidad organizacional dentro de EmployeeProfileSummary (id+name). */
export interface EmployeeOrgUnit {
  id: number | null;
  name: string | null;
}

/** Referencia de persona (jefe/subordinado) en EmployeeProfileSummary. */
export interface EmployeePersonRef {
  id: number | null;
  fullName: string | null;
  positionName: string | null;
}

/** GET /api/employees/{employeeId}/profile-summary (directo). Relaciones null
 * → "Sin dato"; status REAL del empleado (el fixture está "inactive"). */
export interface EmployeeProfileSummary {
  employeeId: number | null;
  fullName: string | null;
  positionName: string | null;
  status: string | null;
  /** LocalDate → "YYYY-MM-DD". */
  hireDate: string | null;
  isDirectManager: boolean | null;
  isAreaManager: boolean | null;
  area: EmployeeOrgUnit | null;
  subarea: EmployeeOrgUnit | null;
  dependency: EmployeeOrgUnit | null;
  management: EmployeeOrgUnit | null;
  company: EmployeeOrgUnit | null;
  boss: EmployeePersonRef | null;
  subordinates: EmployeePersonRef[] | null;
  /** int primitivo en Java: siempre presente. */
  subordinateCount: number;
}

/** GET/PUT /api/employees/{employeeId}/about-me (Map directo). */
export interface AboutMeResponse {
  aboutMe: string | null;
}
// === fin M8-M10

// === M6+M7 (ownership: oc-wave0)
// Organigrama (com.kpis.dto.OrganigramaResponse + OrganigramaSearchResult +
// com.kpis.dto.PagedResponse) y Evaluaciones/Chat (com.kpis.dto.evaluation.**
// y com.kpis.dto.chat.**). Campos verificados en el código Java; sin inventar.

// ── M6: Organigrama ──────────────────────────────────────────────────────────

/** Nivel de vista: FULL/GERENCIA/AREA/SUBAREA/EMPLOYEE (doc del DTO Java). */
export type OrgViewScope =
  | "FULL"
  | "GERENCIA"
  | "AREA"
  | "SUBAREA"
  | "EMPLOYEE";

export interface OrgPersonNode {
  id: number | null;
  fullName: string | null;
  position: string | null;
  email: string | null;
  levelId: number | null;
  levelName: string | null;
}

export interface OrgSubareaNode {
  id: number | null;
  name: string | null;
  heads: OrgPersonNode[] | null;
  /** Presente solo si la rama vino cargada (no lazy). */
  employees: OrgPersonNode[] | null;
  /** Total para paginación lazy. */
  employeesCount: number | null;
}

export interface OrgAreaNode {
  id: number | null;
  name: string | null;
  heads: OrgPersonNode[] | null;
  subareas: OrgSubareaNode[] | null;
  /** Empleados directos del área (sin subárea asignada). */
  employees: OrgPersonNode[] | null;
  employeesCount: number | null;
  subareasCount: number | null;
  /** Directos + todas las subáreas (viene desde la carga inicial en lazy). */
  totalPeopleCount: number | null;
}

export interface OrgGerenciaNode {
  id: number | null;
  name: string | null;
  description: string | null;
  heads: OrgPersonNode[] | null;
  /** Vacío en modo lazy. */
  areas: OrgAreaNode[] | null;
  /** Presente en lazy para saber si hay hijos. */
  areasCount: number | null;
}

/** GET /api/organigrama/employee/{employeeId}?isAdmin=false&lazy=true. */
export interface OrganigramaResponse {
  viewScope: OrgViewScope | null;
  gerencias: OrgGerenciaNode[] | null;
}

/** nodeType del resultado de búsqueda: GERENCIA_HEAD | AREA_HEAD |
 * SUBAREA_HEAD | AREA_DIRECT | SUBAREA_EMPLOYEE. */
export type OrgSearchNodeType =
  | "GERENCIA_HEAD"
  | "AREA_HEAD"
  | "SUBAREA_HEAD"
  | "AREA_DIRECT"
  | "SUBAREA_EMPLOYEE";

/** GET /api/organigrama/employee/{employeeId}/search — ubicación de una
 * persona dentro de la vista actual (ids + tipo de nodo). */
export interface OrganigramaSearchResult {
  gerenciaId: number | null;
  areaId: number | null;
  subareaId: number | null;
  nodeType: OrgSearchNodeType | null;
  person: OrgPersonNode | null;
}

/** PagedResponse genérico del backend (com.kpis.dto.PagedResponse) — no es
 * una página Spring: no tiene content de Page ni campos first/last. */
export interface OrgPagedResponse {
  content: OrgPersonNode[] | null;
  totalElements: number | null;
  totalPages: number | null;
  currentPage: number | null;
  pageSize: number | null;
  hasNextPage: boolean | null;
  hasPreviousPage: boolean | null;
}

// ── M7: Evaluaciones ─────────────────────────────────────────────────────────

/** Bloque narrativo de la evaluación (4 claves del contrato). */
export interface EvaluationNarrative {
  fortalezas: string | null;
  oportunidades: string | null;
  compromisos: string | null;
  retroalimentacion: string | null;
}

/** GET /api/evaluations, GET /{uuid}, autoeval-ref y response del POST. */
export interface EvaluationResponse {
  id: number | null;
  uuid: string | null;
  /** "AUTO" | "LIDER" (string en el DTO Java). */
  evaluationType: string | null;
  evaluatorEmployeeId: number | null;
  evaluatorName: string | null;
  evaluatedEmployeeId: number | null;
  evaluatedName: string | null;
  periodName: string | null;
  globalScore: number | null;
  /** Calibración opcional. */
  finalScore: number | null;
  calibratedByName: string | null;
  calibratedAt: string | null;
  calibrationNotes: string | null;
  /** "COMPLETED" al crear. */
  status: string | null;
  refAutoevalUuid: string | null;
  createdAt: string | null;
  scores: Record<string, number> | null;
  comments: Record<string, string> | null;
  finalScores: Record<string, number> | null;
  narrative: EvaluationNarrative | null;
}

/** PagedResponse<EvaluationResponse> del listado paginado. */
export interface EvaluationsPagedResponse {
  content: EvaluationResponse[] | null;
  totalElements: number | null;
  totalPages: number | null;
  currentPage: number | null;
  pageSize: number | null;
  hasNextPage: boolean | null;
  hasPreviousPage: boolean | null;
}

/** POST /api/evaluations — EvaluationSubmitRequest (verificado en Java). */
export interface EvaluationSubmitRequest {
  /** Estable por intento ("auto-" + timestamp, igual que el web). */
  uuid: string;
  evaluationType: string;
  evaluatorEmployeeId: number;
  evaluatedEmployeeId: number;
  /** Real no null: el servicio valida período activo y duplicados. */
  periodId: number;
  periodName: string;
  globalScore: number;
  refAutoevalUuid: string | null;
  scores: Record<string, number>;
  comments: Record<string, string>;
  narrative: EvaluationNarrative;
}

// ── M7: Nanabot (solo ADMIN/SUPER_ADMIN; el backend resuelve rol desde BD) ──

export interface ChatHistoryItem {
  /** "user" | "assistant". */
  role: string;
  text: string;
}

/** POST /api/chat — ChatRequestDTO. */
export interface ChatRequest {
  message: string;
  language: string;
  history: ChatHistoryItem[];
  /** Contexto opcional de la pantalla (map libre en el DTO). */
  context?: Record<string, unknown>;
}

/** Chip de enlace a módulos de la plataforma. */
export interface ChatLink {
  label: string | null;
  path: string | null;
  description: string | null;
}

/** Traza de tools del chatbot. */
export interface ChatToolCall {
  name: string | null;
  success: boolean;
  executionTimeMs: number | null;
  summary: string | null;
  error: string | null;
}

/** ChatResponseDTO. */
export interface ChatResponse {
  intent: string | null;
  reply: string | null;
  language: string | null;
  topic: string | null;
  links: ChatLink[] | null;
  suggestions: string[] | null;
  /** claude | local | local-fallback | smalltalk. */
  source: string | null;
  failureReason: string | null;
  toolCalls: ChatToolCall[] | null;
}
// === fin M6+M7
