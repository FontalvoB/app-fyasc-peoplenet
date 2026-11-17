import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useHistory, useLocation } from "react-router-dom";
import {
  Icon,
  Badge,
  Button,
  PageHero,
  Empty,
  Search,
  Tabs,
  Modal,
  SectionError,
  LoadingNote,
} from "./shared";
import {
  useApi,
  stripDiacritics,
  toApiError,
  createSolicitud,
  calendarDate,
  timeLabel,
  readSession,
} from "../lib/api";
import type { ApiState, SpringPage } from "../lib/api";
import type {
  AprobadorResumen,
  CompanyWire,
  EmpleadoAutenticadoResponse,
  EstadoSolicitudNovedad,
  SolicitudNovedadCreateRequest,
  SolicitudDocumentoUploadRequest,
  SolicitudNovedadResponse,
  TipoSolicitudNovedad,
} from "../lib/api-types";
import { ESTADO_SOLICITUD_LABELS } from "../lib/api-types";
import { ManagerDecision } from "./ManagerDecision";

/**
 * M4 — Solicitudes de novedades reales contra kpis-ms.
 * - Bandeja propia: GET /api/solicitudes/mias?page=0&size=20 (página Spring:
 *   totalElements/totalPages/number — no mezclar con el conteo filtrado).
 * - Detalle: GET /api/solicitudes/{id} (la lista /mias NO trae historial;
 *   verificado contra el backend: el detalle sí lo trae).
 * - Alta: POST /api/solicitudes → 201 SolicitudNovedadResponse; el backend
 *   fija el estado (PENDIENTE_JEFE) y el radicado se muestra como retorna.
 *   Catálogos reales: /solicitudes/me (prefill), /solicitudes/empresas,
 *   /solicitudes/aprobadores y /aprobadores/sugerido (sin jefatura → se
 *   muestra sin sugerencia, nunca una persona demo).
 * - Adjuntos: base64 en el propio POST (DocumentoUploadRequest; backend
 *   acepta < 5 MB por archivo y lo re-verifica). Rechazo explícito en la
 *   UI con el límite real; sin uploads simulados.
 * - Estados con etiquetas exactas del plan §4 M4 (ESTADO_SOLICITUD_LABELS).
 * - Sin initialRequests de data.ts: todo el contenido viene de la API.
 */

/** Opciones del enum TipoSolicitudNovedad con etiqueta/icono de presentación. */
const TIPO_OPTIONS: ReadonlyArray<{
  value: TipoSolicitudNovedad;
  label: string;
  icon: string;
}> = [
  { value: "PERMISO", label: "Permiso", icon: "event_available" },
  { value: "LICENCIA", label: "Licencia", icon: "family_restroom" },
  { value: "VACACIONES", label: "Vacaciones", icon: "beach_access" },
  {
    value: "CITACION_MEDICA",
    label: "Citación médica",
    icon: "medical_services",
  },
  { value: "INCAPACIDAD", label: "Incapacidad", icon: "health_and_safety" },
  { value: "OTRO", label: "Otro", icon: "more_horiz" },
];

function tipoLabel(tipo: string | null): string {
  return (
    TIPO_OPTIONS.find((t) => t.value === tipo)?.label ?? tipo ?? "Sin dato"
  );
}

function tipoIcon(tipo: string | null): string {
  return TIPO_OPTIONS.find((t) => t.value === tipo)?.icon ?? "event_note";
}

/** Rango corto: "9 de oct — 10 de oct 2026" (o "9 de oct 2026" si un día). */
function rango(start: string | null, end: string | null): string {
  const a = calendarDate(start);
  const b = calendarDate(end);
  if (!a) return "Sin fecha";
  if (!b || start === end) {
    return `${a.day} de ${a.month}${a.year ? ` ${a.year}` : ""}`;
  }
  return `${a.day} de ${a.month} — ${b.day} de ${b.month} ${b.year}`;
}

/** Fecha larga es-CO para el detalle (mediodía fijo → sin corrimiento). */
function fechaLarga(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Sin dato";
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Sin dato";
  return parsed.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "2026-10-06T09:24:47" → texto es-CO legible. */
function detalleMomento(ts: string | null): string {
  if (!ts) return "Sin dato";
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return "Sin dato";
  return parsed.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Decisión del historial → icono (solo presentación). */
function historialIcon(decision: string | null): string {
  if (decision === "RECHAZAR") return "cancel";
  if (decision === "PENDIENTE") return "schedule";
  return "check_circle";
}

/** Bytes → "245 KB"; null → "Sin dato". */
function fileLabel(n: number | null): string {
  if (n == null || n < 0) return "Sin dato";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Límite de adjunto alineado al backend (DocumentoUploadRequest: base64
 * aceptado solo si el archivo es < 5 MB; el server lo re-verifica). */
const MAX_ATTACH_BYTES = 5 * 1024 * 1024;

/** Pestañas de familia: el backend solo acepta UN estado en el parámetro
 * (EstadoSolicitudNovedad.valueOf de un valor), así que las familias se
 * filtran en cliente sobre la página cargada; el pie informa el alcance. */
const TAB_ITEMS = ["Todas", "Pendientes", "Aprobadas", "Rechazadas"] as const;
type Tab = (typeof TAB_ITEMS)[number];

function isInFamily(estado: EstadoSolicitudNovedad | null, tab: Tab): boolean {
  if (estado == null) return false;
  if (tab === "Todas") return true;
  if (tab === "Pendientes") {
    return (
      estado === "PENDIENTE_JEFE" ||
      estado === "PENDIENTE_GH" ||
      estado === "BORRADOR"
    );
  }
  if (tab === "Aprobadas") {
    return (
      estado === "APROBADA_JEFE" ||
      estado === "APROBADA" ||
      estado === "COMPLETADA"
    );
  }
  return estado === "RECHAZADA_JEFE" || estado === "RECHAZADA";
}

// ─────────────────────────────────────────────────────────────────────────────
// Bandeja propia — GET /solicitudes/mias + detalle /solicitudes/{id}
// ─────────────────────────────────────────────────────────────────────────────

export function Requests({ jefatura, hasPending, refreshPending }: {
  jefatura: { state: ApiState<{ esJefe: boolean }>; reload: () => void };
  hasPending: boolean;
  refreshPending: () => void;
}) {
  useEffect(() => { refreshPending(); }, [refreshPending]);
  const location = useLocation();
  const history = useHistory();
  const scope = new URLSearchParams(location.search).get("bandeja") === "jefe"
    ? "Bandeja del jefe" : "Mis solicitudes";
  const setScope = (value: string) => history.replace(value === "Bandeja del jefe"
    ? "/dashboard/requests?bandeja=jefe" : "/dashboard/requests");
  const asManager = scope === "Bandeja del jefe" && jefatura.state.data?.esJefe === true;
  return (
    <>
      {jefatura.state.status === "error" && (
        <SectionError error="No pudimos verificar tu acceso a la bandeja del jefe."
          restricted={jefatura.state.errorStatus === 403}
          onRetry={jefatura.reload} />
      )}
      {jefatura.state.data?.esJefe === true && (
        <section className="pn-panel" aria-label="Bandejas de solicitudes">
          <div className="pn-toolbar padded">
            <Tabs items={["Mis solicitudes", "Bandeja del jefe"]} value={scope} set={setScope}
              pendingItem={hasPending ? "Bandeja del jefe" : undefined} />
          </div>
        </section>
      )}
      {/* Remount on scope changes so rows, filters and open detail never cross inboxes. */}
      <RequestInbox key={asManager ? "jefe" : "mias"} asManager={asManager} onDecision={refreshPending} />
    </>
  );
}

function RequestInbox({ asManager, onDecision }: { asManager: boolean; onDecision: () => void }) {
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState("");
  const [tab, setTab] = useState<Tab>("Todas");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const term = query.trim();
  // El servidor resuelve al aprobador desde el JWT, igual que en el ERP.
  const mias = useApi<SpringPage<SolicitudNovedadResponse>>(
    `/solicitudes/${asManager ? "bandeja-jefe" : "mias"}?page=${page}&size=20${
      term ? `&searchTerm=${encodeURIComponent(stripDiacritics(term))}` : ""
    }`,
  );
  // Nueva búsqueda → volver a la primera página (no mezclar filtro y página).
  useEffect(() => {
    setPage(0);
  }, [query]);

  // Detalle con documentos e historial reales (solo al abrir la fila).
  const detail = useApi<SolicitudNovedadResponse>(
    selectedId != null ? `/solicitudes/${selectedId}` : null,
  );

  const allRows = mias.state.data?.content ?? [];
  const rows = useMemo(
    () =>
      Array.isArray(allRows)
        ? allRows.filter((r) => isInFamily(r.estado, tab))
        : [],
    [allRows, tab],
  );
  const totalElements = mias.state.data?.totalElements ?? null;
  const totalPages = mias.state.data?.totalPages ?? null;
  const pageNumber = mias.state.data?.number ?? page;
  const isInitialLoading =
    mias.state.status === "loading" && mias.state.data == null;

  return (
    <>
      <PageHero
        eyebrow="TU TIEMPO TAMBIÉN IMPORTA"
        title={asManager ? "Bandeja del jefe" : "Permisos y solicitudes"}
        description={asManager ? "Consulta las solicitudes asignadas a tu revisión." : "Organiza tus ausencias y sigue cada solicitud, sin complicaciones."}
        action={
          <Link className="pn-button" to="/dashboard/requests/new">
            <Icon name="add" /> Nueva solicitud
          </Link>
        }
      />
      <div className="human-wellbeing-banner">
        <img
          src="/images/people/wellbeing.jpg"
          alt="Una mujer disfruta de una pausa al aire libre"
          width="1536"
          height="1024"
        />
        <div>
          <span className="human-eyebrow">TIEMPO PARA TI</span>
          <h3>Un descanso también es avanzar.</h3>
          <p>
            Organiza permisos y vacaciones desde una solicitud y sigue el estado
            real de cada trámite.
          </p>
          <Link className="human-rest-link" to="/dashboard/requests/new">
            Planea tu descanso <Icon name="arrow_forward" size={17} />
          </Link>
        </div>
      </div>
      <section className="pn-panel">
        <div className="pn-toolbar padded">
          <Tabs
            items={[...TAB_ITEMS]}
            value={tab}
            set={(v) => setTab(v as Tab)}
          />
          <Search
            value={query}
            onChange={setQuery}
            placeholder={asManager ? "Buscar en la bandeja del jefe…" : "Buscar en tus solicitudes…"}
          />
        </div>

        {mias.state.status === "error" ? (
          <SectionError
            error={mias.state.error ?? "Sin dato"}
            restricted={mias.state.errorStatus === 403}
            onRetry={mias.reload}
          />
        ) : isInitialLoading ? (
          <LoadingNote label={asManager ? "Cargando solicitudes asignadas…" : "Cargando tus solicitudes…"} />
        ) : (
          <>
            <div className="pn-table-wrap">
              <table className="pn-table">
                <thead>
                  <tr>
                    <th>Solicitud</th>
                    <th>Periodo</th>
                    <th>{asManager ? "Colaborador" : "Aprobador"}</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id ?? r.radicado ?? ""}>
                      <td>
                        <button
                          className="table-title"
                          onClick={() => setSelectedId(r.id)}
                        >
                          <span className="file-icon">
                            <Icon name={tipoIcon(r.tipo)} />
                          </span>
                          <span>
                            <strong>{tipoLabel(r.tipo)}</strong>
                            <small>{r.radicado ?? `Solicitud ${r.id}`}</small>
                          </span>
                        </button>
                      </td>
                      <td>{rango(r.fechaDesde, r.fechaHasta)}</td>
                      <td>{(asManager ? r.colaboradorNombre : r.aprobadorNombre) ?? "Sin dato"}</td>
                      <td>
                        <Badge>
                          {r.estado != null
                            ? ESTADO_SOLICITUD_LABELS[r.estado]
                            : "Sin dato"}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="pn-icon-button"
                          aria-label={`Ver solicitud ${r.radicado ?? r.id}`}
                          onClick={() => setSelectedId(r.id)}
                        >
                          <Icon name="chevron_right" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && totalElements === 0 && <Empty />}
            </div>
            <div className="vivid-request-list">
              {rows.map((r) => (
                <button
                  key={r.id ?? r.radicado ?? ""}
                  className="vivid-request-card"
                  onClick={() => setSelectedId(r.id)}
                  aria-label={`Ver solicitud ${r.radicado ?? ""}`}
                >
                  <div className="request-card-top">
                    <span className="request-card-icon">
                      <Icon name={tipoIcon(r.tipo)} size={25} />
                    </span>
                    <div>
                      <strong>{tipoLabel(r.tipo)}</strong>
                      <small>{r.radicado ?? `Solicitud ${r.id}`}</small>
                    </div>
                    <Badge>
                      {r.estado != null
                        ? ESTADO_SOLICITUD_LABELS[r.estado]
                        : "Sin dato"}
                    </Badge>
                  </div>
                  <div className="request-card-dates">
                    <Icon name="calendar_today" size={17} />
                    <span>{rango(r.fechaDesde, r.fechaHasta)}</span>
                    <Icon name="arrow_forward" size={18} />
                  </div>
                  <div className="request-card-person">
                    <Icon name="person" size={17} />
                    <span>
                      {asManager ? "Solicita: " : "Revisa: "}{(asManager ? r.colaboradorNombre : r.aprobadorNombre) ?? "Sin dato"}
                      {r.estado != null
                        ? ` · ${ESTADO_SOLICITUD_LABELS[r.estado]}`
                        : ""}
                    </span>
                    <span>Ver detalle</span>
                  </div>
                </button>
              ))}
            </div>
            {rows.length === 0 &&
              totalElements != null &&
              totalElements > 0 && <Empty />}
            {(totalPages ?? 0) > 1 && (
              <div className="table-footer">
                <button
                  className="pn-icon-button"
                  aria-label="Página anterior"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <Icon name="chevron_left" />
                </button>
                <span>
                  Página {pageNumber + 1} de {totalPages} · {totalElements}{" "}
                  solicitudes en total
                </span>
                <button
                  className="pn-icon-button"
                  aria-label="Página siguiente"
                  disabled={totalPages != null && page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
            )}
            {totalElements === 0 && (
              <div className="table-footer">
                {term
                  ? "Ninguna solicitud coincide con la búsqueda."
                  : asManager ? "No tienes solicitudes asignadas en esta bandeja." : "Aún no has radicado solicitudes."}
              </div>
            )}
          </>
        )}
      </section>

      {decisionNotice && <p role="status" className="pn-info">{decisionNotice}</p>}
      {selectedId != null && (
        <Modal
          title="Detalle de la solicitud"
          status={
            detail.state.data?.estado ? (
              <Badge>{ESTADO_SOLICITUD_LABELS[detail.state.data.estado]}</Badge>
            ) : undefined
          }
          close={() => setSelectedId(null)}
          dismissible={!decisionBusy}
          footer={asManager && detail.state.status === "success" && detail.state.data?.estado === "PENDIENTE_JEFE"
            && detail.state.data.aprobadorId != null && detail.state.data.aprobadorId === readSession()?.user.employeeId
            ? <ManagerDecision key={selectedId} solicitud={detail.state.data} onBusy={setDecisionBusy}
              onDone={updated => {
                setSelectedId(null);
                setDecisionNotice(updated.estado === "APROBADA_JEFE"
                  ? `${updated.radicado}: aprobada por el jefe. Continúa a Gestión Humana.`
                  : `${updated.radicado}: decisión registrada (${updated.estado ? ESTADO_SOLICITUD_LABELS[updated.estado] : "sin estado"}).`);
                mias.reload();
                onDecision();
              }} /> : undefined}
        >
          {detail.state.status === "loading" ? (
            <LoadingNote label="Cargando detalle…" />
          ) : detail.state.status === "error" ? (
            <SectionError
              error={detail.state.error ?? "Sin dato"}
              restricted={detail.state.errorStatus === 403}
              onRetry={detail.reload}
            />
          ) : detail.state.data ? (
            <SolicitudDetail solicitud={detail.state.data} />
          ) : (
            <p className="pn-info" role="status">
              Sin detalle disponible.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

/** Cuerpo del modal de detalle: datos, adjuntos e historial reales. */
function SolicitudDetail({
  solicitud,
}: {
  solicitud: SolicitudNovedadResponse;
}) {
  return (
    <>
      <h3>Información de la solicitud</h3>
      <dl className="pn-details">
        <dt>
          <Icon name="tag" size={18} /> Radicado
        </dt>
        <dd>{solicitud.radicado ?? "Sin dato"}</dd>
        <dt>Tipo</dt>
        <dd>
          {tipoLabel(solicitud.tipo)}
          {solicitud.subtipo ? ` · ${solicitud.subtipo}` : ""}
        </dd>
        {solicitud.tipo === "OTRO" && solicitud.otraNovedad && (
          <dt>Otra novedad</dt>
        )}
        {solicitud.tipo === "OTRO" && (
          <dd>{solicitud.otraNovedad ?? "Sin dato"}</dd>
        )}
        <dt>
          <Icon name="calendar_month" size={18} /> Periodo
        </dt>
        <dd>
          {fechaLarga(solicitud.fechaDesde)}
          {solicitud.fechaHasta && solicitud.fechaHasta !== solicitud.fechaDesde
            ? ` — ${fechaLarga(solicitud.fechaHasta)}`
            : ""}
        </dd>
        {(solicitud.horaSalida || solicitud.horaRegreso) && (
          <>
            <dt>Horas</dt>
            <dd>
              {timeLabel(solicitud.horaSalida)} —{" "}
              {timeLabel(solicitud.horaRegreso)}
            </dd>
          </>
        )}
        {solicitud.duracionDias != null && (
          <>
            <dt>Duración</dt>
            <dd>{solicitud.duracionDias} día(s)</dd>
          </>
        )}
        <dt>Descripción</dt>
        <dd>{solicitud.descripcion ?? "Sin dato"}</dd>
        <dt>
          <Icon name="person" size={18} /> Colaborador
        </dt>
        <dd>
          {solicitud.colaboradorNombre ?? "Sin dato"}
          {solicitud.colaboradorCargo ? ` · ${solicitud.colaboradorCargo}` : ""}
        </dd>
        <dt>Empresa</dt>
        <dd>{solicitud.empresaNombre ?? "Sin dato"}</dd>
        <dt>
          <Icon name="verified_user" size={18} /> Aprobador
        </dt>
        <dd>
          {solicitud.aprobadorNombre ?? "Sin dato"}
          {solicitud.aprobadorCargo ? ` · ${solicitud.aprobadorCargo}` : ""}
        </dd>
        {solicitud.motivoRechazo && (
          <>
            <dt>Motivo del rechazo</dt>
            <dd>{solicitud.motivoRechazo}</dd>
          </>
        )}
        <dt>Radicada</dt>
        <dd>
          {detalleMomento(solicitud.fechaCreacion)}
          {solicitud.creadoPorUsername
            ? ` · ${solicitud.creadoPorUsername}`
            : ""}
        </dd>
      </dl>
      {(solicitud.documentos?.length ?? 0) > 0 && (
        <>
          <h3>Soportes adjuntos</h3>
          {solicitud.documentos?.map((doc) => (
            <p className="pn-info" key={doc.id ?? doc.nombreArchivo ?? ""}>
              <Icon name="attach_file" size={15} />
              {doc.nombreArchivo ?? "Archivo"} · {fileLabel(doc.tamanoBytes)}
              {doc.downloadUrl ? " · descarga disponible" : ""}
            </p>
          ))}
        </>
      )}
      {(solicitud.historial?.length ?? 0) > 0 && (
        <div className="request-timeline">
          {solicitud.historial?.map((h) => (
            <div key={h.id ?? h.fecha ?? ""}>
              <span>
                <Icon name={historialIcon(h.decision)} size={17} />
              </span>
              <small>
                {detalleMomento(h.fecha)} · {h.rol ?? "Sin rol"} ·{" "}
                {h.autorNombre ?? "Sin autor"}
                {h.observaciones ? ` — ${h.observaciones}` : ""}
                {h.causal ? ` (causal: ${h.causal})` : ""}
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="pn-info">
        {solicitud.estado === "PENDIENTE_JEFE"
          ? "La solicitud está pendiente de la decisión del jefe."
          : solicitud.estado === "PENDIENTE_GH"
            ? "Aprobada por tu jefe; ahora está pendiente de Gestión Humana."
            : solicitud.estado === "BORRADOR"
              ? "La solicitud está en borrador y no ha sido enviada."
              : solicitud.estado != null &&
                  (solicitud.estado === "RECHAZADA" ||
                    solicitud.estado === "RECHAZADA_JEFE")
                ? "La solicitud fue rechazada. Revisa el motivo y puedes radicar una nueva."
                : solicitud.estado === "CANCELADA"
                  ? "Esta solicitud fue cancelada."
                  : solicitud.estado != null
                    ? "El flujo de aprobación continúa; esta pantalla refleja el estado real del servidor."
                    : "Sin estado reportado por el servidor."}
      </div>
    </>
  );
}

/**
 * Formulario de nueva solicitud con identidad y catálogos del servidor:
 * - Prefill del colaborador: GET /api/solicitudes/me.
 * - Empresas: GET /api/solicitudes/empresas.
 * - Aprobadores: GET /api/solicitudes/aprobadores + /aprobadores/sugerido
 *   (jefe inmediato; puede no existir → "Sin sugerencia", nunca persona demo).
 * - Envío: POST /api/solicitudes → 201; modal con radicado/estado reales.
 * - Submit deshabilitado durante la petición; timeout sugiere conciliar con
 *   /mias antes de reenviar (sin reintentos automáticos del POST).
 */
export function RequestForm() {
  const history = useHistory();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touchedEmpresa, setTouchedEmpresa] = useState(false);
  const [touchedAprobador, setTouchedAprobador] = useState(false);
  const [fileError, setFileError] = useState("");
  const [attach, setAttach] = useState<SolicitudDocumentoUploadRequest | null>(
    null,
  );
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<SolicitudNovedadResponse | null>(null);

  // Prefill real del colaborador (snapshot del backend).
  const me = useApi<EmpleadoAutenticadoResponse>("/solicitudes/me");
  const employeeId = me.state.data?.id ?? null;
  // Empresas activas para el selector.
  const empresas = useApi<CompanyWire[]>("/solicitudes/empresas");
  // Aprobadores del buscador (límite 50).
  const aprobadores = useApi<AprobadorResumen[]>(
    employeeId != null
      ? `/solicitudes/aprobadores?empleadoId=${employeeId}&limit=50`
      : null,
  );
  // Jefe inmediato sugerido; puede no existir (null/404) → sin persona demo.
  const sugerido = useApi<AprobadorResumen | null>(
    employeeId != null
      ? `/solicitudes/aprobadores/sugerido?empleadoId=${employeeId}`
      : null,
  );

  const aprobadorOptions = useMemo(() => {
    const options = aprobadores.state.data ?? [];
    const suggestion = sugerido.state.data;
    return suggestion?.id != null &&
      !options.some((a) => a.id === suggestion.id)
      ? [suggestion, ...options]
      : options;
  }, [aprobadores.state.data, sugerido.state.data]);

  // Prefill de empresa del /me solo si el usuario no eligió una.
  useEffect(() => {
    if (touchedEmpresa) return;
    const empresaId = me.state.data?.empresaId;
    if (
      empresaId != null &&
      empresas.state.data?.some((c) => c.id === empresaId)
    ) {
      setForm((prev) =>
        prev.empresaId ? prev : { ...prev, empresaId: String(empresaId) },
      );
    }
  }, [me.state.data, empresas.state.data, touchedEmpresa]);

  // Sugerencia de aprobador solo si el usuario no eligió uno.
  useEffect(() => {
    if (touchedAprobador) return;
    const suggestionId = sugerido.state.data?.id;
    if (suggestionId != null) {
      setForm((prev) =>
        prev.aprobadorId
          ? prev
          : { ...prev, aprobadorId: String(suggestionId) },
      );
    }
  }, [sugerido.state.data, touchedAprobador]);

  function update<K extends keyof FormState>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function todayIso(): string {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size >= MAX_ATTACH_BYTES) {
      event.target.value = "";
      setAttach(null);
      setFileError(
        "El archivo supera el límite de 5 MB que acepta el servidor. Adjunta uno menor o continúa sin soporte.",
      );
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setAttach({
        nombreArchivo: file.name,
        mimeType: file.type || "application/octet-stream",
        tamanoBytes: file.size,
        base64,
      });
      setFileError("");
    } catch {
      setAttach(null);
      setFileError("No se pudo leer el archivo. Intenta con otro.");
    }
  }

  /** Validación espejo de las reglas del SolicitudNovedadService. */
  function validate(): string {
    if (!form.descripcion.trim()) return "La descripción es obligatoria.";
    if (form.subtipo.trim().length > 120) {
      return "El subtipo admite máximo 120 caracteres.";
    }
    if (form.tipo === "OTRO" && form.otraNovedad.trim().length > 500) {
      return "La otra novedad admite máximo 500 caracteres.";
    }
    if (!form.fechaDesde) return "La fecha de inicio es obligatoria.";
    if (form.fechaHasta && form.fechaHasta < form.fechaDesde) {
      return "La fecha de finalización no puede ser anterior a la de inicio.";
    }
    if (!form.empresaId) return "Selecciona la empresa de tu contrato.";
    if (!form.aprobadorId) {
      return "Selecciona el aprobador que revisará tu solicitud.";
    }
    if (TIPOS_CON_DIAS.includes(form.tipo) && form.duracionDias) {
      const dias = Number(form.duracionDias);
      if (!Number.isInteger(dias) || dias <= 0) {
        return "La duración en días debe ser un número entero positivo.";
      }
    }
    if (attach && attach.tamanoBytes >= MAX_ATTACH_BYTES) {
      return "El archivo supera el límite de 5 MB que acepta el servidor.";
    }
    return "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const validation = validate();
    if (validation) {
      setFieldError(validation);
      return;
    }
    setFieldError("");
    setFormError("");
    setSubmitting(true);
    try {
      const aprobador = aprobadorOptions.find(
        (a) => a.id != null && String(a.id) === form.aprobadorId,
      );
      const empresa = empresas.state.data?.find(
        (c) => c.id != null && String(c.id) === form.empresaId,
      );
      const payload: SolicitudNovedadCreateRequest = {
        tipo: form.tipo,
        subtipo: form.subtipo.trim() || null,
        otraNovedad: form.tipo === "OTRO" ? form.otraNovedad.trim() : null,
        descripcion: form.descripcion.trim(),
        fechaDesde: form.fechaDesde || null,
        fechaHasta: form.fechaHasta || null,
        horaSalida:
          TIPOS_CON_HORAS.includes(form.tipo) && form.horaSalida
            ? form.horaSalida
            : null,
        horaRegreso:
          TIPOS_CON_HORAS.includes(form.tipo) && form.horaRegreso
            ? form.horaRegreso
            : null,
        duracionDias:
          TIPOS_CON_DIAS.includes(form.tipo) && form.duracionDias
            ? Number(form.duracionDias)
            : null,
        empresaId: empresa?.id ?? null,
        empresaNombre: empresa?.name ?? null,
        aprobadorId: Number(form.aprobadorId),
        aprobadorNombre: aprobador?.nombre ?? null,
        aprobadorCargo: aprobador?.cargo ?? null,
        documentos: attach ? [attach] : [],
      };
      const response = await createSolicitud(payload);
      setCreated(response); // modal con radicado/estado reales del backend
    } catch (error) {
      const apiError = toApiError(error);
      setFormError(
        apiError.isTimeout
          ? `${apiError.message} Antes de reintentar, revisa en "Permisos y solicitudes" si la solicitud quedó radicada (evita duplicados).`
          : apiError.message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const today = todayIso();

  return (
    <>
      <Link className="pn-back" to="/dashboard/requests">
        <Icon name="arrow_back" size={17} /> Volver a mis solicitudes
      </Link>
      <PageHero
        eyebrow="UN ESPACIO PARA LO QUE NECESITAS"
        title="Crea una nueva solicitud"
        description="Cuéntanos qué necesitas. Nosotros te ayudamos con el siguiente paso."
      />
      <div className="pn-form-layout">
        <form className="pn-panel pn-form" onSubmit={handleSubmit}>
          <div className="form-section-title">
            <span>01</span>
            <div>
              <h2>¿Qué tipo de solicitud necesitas?</h2>
              <p>Selecciona la opción que mejor se ajuste.</p>
            </div>
          </div>
          <div className="request-types">
            {TIPO_OPTIONS.map((option) => (
              <button
                type="button"
                aria-pressed={form.tipo === option.value}
                className={form.tipo === option.value ? "selected" : ""}
                key={option.value}
                onClick={() =>
                  setForm((prev) => ({ ...prev, tipo: option.value }))
                }
              >
                <Icon name={option.icon} />
                {option.label}
                {form.tipo === option.value && (
                  <Icon name="check_circle" size={17} />
                )}
              </button>
            ))}
          </div>
          <div className="form-two">
            <label>
              Subtipo (opcional)
              <input
                type="text"
                maxLength={120}
                placeholder="Ej: Día de la familia"
                value={form.subtipo}
                onChange={(e) => update("subtipo", e.target.value)}
              />
            </label>
            <label>
              Duración en días
              <input
                type="number"
                min={1}
                placeholder={
                  TIPOS_CON_DIAS.includes(form.tipo) ? "Ej: 3" : "No aplica"
                }
                disabled={!TIPOS_CON_DIAS.includes(form.tipo)}
                value={form.duracionDias}
                onChange={(e) => update("duracionDias", e.target.value)}
              />
            </label>
          </div>
          {form.tipo === "OTRO" && (
            <label>
              Otra novedad (máx. 500)
              <textarea
                maxLength={500}
                rows={3}
                placeholder="Describe la novedad…"
                value={form.otraNovedad}
                onChange={(e) => update("otraNovedad", e.target.value)}
              />
            </label>
          )}
          <div className="form-section-title">
            <span>02</span>
            <div>
              <h2>Define los detalles</h2>
              <p>Las fechas y el contexto ayudan a tu líder a revisar.</p>
            </div>
          </div>
          <div className="form-two">
            <label>
              Fecha de inicio
              <input
                type="date"
                min={today}
                required
                value={form.fechaDesde}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    fechaDesde: v,
                    fechaHasta:
                      prev.fechaHasta && prev.fechaHasta < v
                        ? v
                        : prev.fechaHasta,
                  }));
                }}
              />
            </label>
            <label>
              Fecha de finalización
              <input
                type="date"
                min={form.fechaDesde || today}
                value={form.fechaHasta}
                onChange={(e) => update("fechaHasta", e.target.value)}
              />
            </label>
          </div>
          {TIPOS_CON_HORAS.includes(form.tipo) && (
            <div className="form-two">
              <label>
                Hora de salida
                <input
                  type="time"
                  value={form.horaSalida}
                  onChange={(e) => update("horaSalida", e.target.value)}
                />
              </label>
              <label>
                Hora de regreso
                <input
                  type="time"
                  value={form.horaRegreso}
                  onChange={(e) => update("horaRegreso", e.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            Descripción
            <textarea
              required
              rows={4}
              placeholder="Cuéntanos un poco más sobre tu solicitud…"
              value={form.descripcion}
              onChange={(e) => update("descripcion", e.target.value)}
            />
          </label>
          <div className="form-two">
            <label>
              Empresa
              <select
                aria-label="Empresa"
                disabled={empresas.state.status !== "success"}
                value={form.empresaId}
                onChange={(e) => {
                  setTouchedEmpresa(true);
                  update("empresaId", e.target.value);
                }}
              >
                <option value="">Selecciona la empresa…</option>
                {empresas.state.data?.map((c) => (
                  <option key={c.id ?? c.uuid ?? ""} value={String(c.id)}>
                    {c.name ?? "Sin nombre"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Aprobador
              <select
                aria-label="Aprobador"
                disabled={aprobadorOptions.length === 0}
                value={form.aprobadorId}
                onChange={(e) => {
                  setTouchedAprobador(true);
                  update("aprobadorId", e.target.value);
                }}
              >
                <option value="">
                  {sugerido.state.data?.id != null
                    ? `Sugerido: ${sugerido.state.data.nombre ?? "Sin nombre"}`
                    : "Sin sugerencia — elige manual"}
                </option>
                {aprobadorOptions.map((a) => (
                  <option key={a.id ?? ""} value={String(a.id)}>
                    {a.nombre ?? "Sin nombre"}
                    {a.liderInmediatoDelEmpleado ? " (jefe inmediato)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {me.state.status === "loading" && (
            <LoadingNote label="Consultando tu perfil de empleado..." />
          )}
          {me.state.status === "error" && (
            <SectionError
              error={`No pudimos consultar tu perfil de empleado. ${me.state.error}`}
              restricted={me.state.errorStatus === 403}
              onRetry={me.reload}
            />
          )}
          {empresas.state.status === "error" && (
            <SectionError
              error={`No pudimos cargar tus empresas. ${empresas.state.error}`}
              restricted={empresas.state.errorStatus === 403}
              onRetry={empresas.reload}
            />
          )}
          {empresas.state.status === "loading" && (
            <LoadingNote label="Cargando tus empresas..." />
          )}
          {empresas.state.status === "success" &&
            empresas.state.data?.length === 0 && (
              <p role="status" className="pn-info">
                No tienes empresas activas asignadas para solicitar permisos.
                Solicita a Gestión Humana revisar tu vinculación.
              </p>
            )}
          {aprobadores.state.status === "error" && (
            <SectionError
              error={`No pudimos cargar los aprobadores. ${aprobadores.state.error}`}
              restricted={aprobadores.state.errorStatus === 403}
              onRetry={aprobadores.reload}
            />
          )}
          {aprobadores.state.status === "loading" && (
            <LoadingNote label="Cargando aprobadores..." />
          )}
          {aprobadores.state.status === "success" &&
            sugerido.state.status === "success" &&
            aprobadorOptions.length === 0 && (
              <p role="status" className="pn-info">
                No hay aprobadores disponibles. Solicita a Gestión Humana
                revisar tu jefe inmediato.
              </p>
            )}
          {me.state.data?.nombre && (
            <p className="pn-info">
              <Icon name="person" size={15} /> {me.state.data.nombre} ·{" "}
              {me.state.data.cargo ?? "Sin cargo"}
              {me.state.data.empresaNombre
                ? ` · ${me.state.data.empresaNombre}`
                : ""}
            </p>
          )}
          <label className="pn-upload">
            <Icon name="cloud_upload" size={28} />
            <strong>
              {attach?.nombreArchivo || "Adjunta un soporte si lo necesitas"}
            </strong>
            <span>PDF o imagen · Máximo 5 MB</span>
            <input
              aria-label="Adjuntar soporte"
              type="file"
              accept=".pdf,image/*"
              onChange={handleFile}
            />
          </label>
          {fileError && (
            <p role="alert" className="pn-info">
              {fileError}
            </p>
          )}
          {fieldError && (
            <p role="alert" className="pn-info">
              {fieldError}
            </p>
          )}
          {formError && (
            <p role="alert" className="pn-info">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <Link to="/dashboard/requests">Cancelar</Link>
            <Button
              type="submit"
              disabled={
                submitting ||
                me.state.status !== "success" ||
                empresas.state.status !== "success" ||
                !form.empresaId ||
                !form.aprobadorId
              }
            >
              {submitting ? "Radicando…" : "Enviar solicitud"}
              <Icon name="send" size={18} />
            </Button>
          </div>
        </form>
        <aside className="pn-form-aside">
          <Icon name="info" size={25} />
          <h2>Ten en cuenta</h2>
          <p>
            Solicita tus ausencias programadas con anticipación para que tu
            equipo pueda organizarse.
          </p>
          <hr />
          <h3>Tu responsable de aprobación</h3>
          {sugerido.state.status === "loading" ? (
            <p>Consultando tu jefe inmediato…</p>
          ) : sugerido.state.data?.id != null ? (
            <div className="inline-person">
              <Icon name="person" size={22} />
              <div>
                <strong>{sugerido.state.data.nombre ?? "Sin dato"}</strong>
                <small>{sugerido.state.data.cargo ?? "Sin cargo"}</small>
              </div>
            </div>
          ) : (
            <p className="pn-info">
              {sugerido.state.status === "error"
                ? "No se pudo consultar tu jefe inmediato; elige el aprobador manualmente."
                : "No registramos un jefe inmediato para tu perfil; elige el aprobador manualmente."}
            </p>
          )}
          <p>Recibirás una notificación cuando tu solicitud sea revisada.</p>
        </aside>
      </div>
      {created && (
        <Modal
          title="Solicitud radicada"
          close={() => history.push("/dashboard/requests")}
        >
          <Badge>
            {created.estado != null
              ? ESTADO_SOLICITUD_LABELS[created.estado]
              : "Sin dato"}
          </Badge>
          <dl className="pn-details">
            <dt>
              <Icon name="tag" size={18} /> Radicado
            </dt>
            <dd>{created.radicado ?? created.id ?? "Sin dato"}</dd>
            <dt>Tipo</dt>
            <dd>{tipoLabel(created.tipo)}</dd>
            <dt>
              <Icon name="verified_user" size={18} /> Aprobador
            </dt>
            <dd>{created.aprobadorNombre ?? "Sin dato"}</dd>
          </dl>
          <div className="pn-info">
            Solicitud <strong>{created.radicado}</strong> radicada con estado{" "}
            <strong>
              {created.estado != null
                ? ESTADO_SOLICITUD_LABELS[created.estado]
                : "sin dato"}
            </strong>
            . Podrás seguirla en "Permisos y solicitudes".
          </div>
          <Button onClick={() => history.push("/dashboard/requests")}>
            Ver mis solicitudes <Icon name="arrow_forward" size={18} />
          </Button>
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestForm — alta real: catálogos del servidor + POST /api/solicitudes
// ─────────────────────────────────────────────────────────────────────────────

/** Estado local del formulario. Los ids van como string; "" = sin elegir. */
interface FormState {
  tipo: TipoSolicitudNovedad;
  subtipo: string;
  otraNovedad: string;
  descripcion: string;
  fechaDesde: string;
  fechaHasta: string;
  horaSalida: string;
  horaRegreso: string;
  duracionDias: string;
  empresaId: string;
  aprobadorId: string;
}

const EMPTY_FORM: FormState = {
  tipo: "PERMISO",
  subtipo: "",
  otraNovedad: "",
  descripcion: "",
  fechaDesde: "",
  fechaHasta: "",
  horaSalida: "",
  horaRegreso: "",
  duracionDias: "",
  empresaId: "",
  aprobadorId: "",
};

/** Campos de horas solo para estos tipos (dependencia por tipo del web). */
const TIPOS_CON_HORAS: ReadonlyArray<TipoSolicitudNovedad> = [
  "PERMISO",
  "LICENCIA",
  "CITACION_MEDICA",
];
/** Duración en días solo para estos tipos. */
const TIPOS_CON_DIAS: ReadonlyArray<TipoSolicitudNovedad> = [
  "VACACIONES",
  "LICENCIA",
  "INCAPACIDAD",
];

/** Convierte un File a base64 puro (sin prefijo data:) en chunks de 8k. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
