import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Icon,
  Badge,
  PageHero,
  Button,
  SectionError,
  LoadingNote,
} from "./shared";
import { ProgressRing } from "./Charts";
import {
  useApi,
  useEmployeeIndicators,
  readSession,
  displayName,
  initialsOf,
  sessionEmployeeId,
  periodsFromIndicators,
  periodLabel,
  formatMeasure,
  type MonthPeriod,
} from "../lib/api";
import type {
  CorporateDocumentDTO,
  ConfirmedDocumentIds,
  DashboardActivityDto,
  EmployeeDashboardResponse,
  EmployeeMonthlyAnalyticsResponse,
  EvalPeriod,
  SolicitudNovedadStatsResponse,
} from "../lib/api-types";

/**
 * M2 — Home / Resumen con datos reales de kpis-ms.
 * - Identidad desde la sesión (peoplenet-auth): nunca nombres demo.
 * - Resumen personal: GET /api/dashboard/employee/{employeeId} (requiere
 *   kpis.dashboard → para el fixture responde 403 → tarjeta restringida).
 * - Anillo de avance: analytics del mes más reciente CON datos reales
 *   (GET /api/indicators/employee/{id}/year/{y}/month/{m}/analytics).
 * - CTA de evaluación: GET /api/evaluations/periods (período activo real).
 * - Novedades: GET /api/dashboard/activities (feed compartido SIN ids:
 *   no se inventan links por actividad ni badges de no-leído persistentes).
 * - Contadores: /api/solicitudes/stats?scope=propias y consultas M5 de
 *   documentos + confirmaciones (ver PLAN-FYA-REVISADO.md §4 M2).
 */

function todayLabel(): string {
  return new Date()
    .toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

/** Primera palabra para el saludo; normaliza nombres en MAYÚSCULAS. */
function greetingWord(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName.trim();
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    const lower = first.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return first;
}

/** Fecha YYYY-MM-DD → partes cortas es-CO sin corrimiento de zona horaria. */
function shortDateParts(
  iso: string | null,
): { day: string; month: string } | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    day: parsed.toLocaleDateString("es-CO", { day: "2-digit" }),
    month: parsed
      .toLocaleDateString("es-CO", { month: "short" })
      .toUpperCase()
      .replace(".", ""),
  };
}

/** Timestamp ISO del feed → texto es-CO legible. */
function activityTimestamp(ts: string | null): string {
  if (!ts) return "Sin dato";
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return "Sin dato";
  return parsed.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Home() {
  const session = readSession();
  const user = session?.user ?? null;
  const employeeId = sessionEmployeeId();
  const userId = user?.userId ?? null;
  const name = displayName(user) || "usuario";
  const greeting = greetingWord(name) || "usuario";
  const initials = initialsOf(name) || "PN";

  // Resumen personal (requiere kpis.dashboard; el fixture E2E recibe 403).
  const summary = useApi<EmployeeDashboardResponse>(
    employeeId != null ? `/dashboard/employee/${employeeId}` : null,
  );

  // Indicadores reales del colaborador → períodos disponibles + breakdown.
  const indicators = useEmployeeIndicators(employeeId);
  const periods = periodsFromIndicators(indicators.state.data);
  const ringPeriod: MonthPeriod | null = periods[0] ?? null;

  // Analytics del período más reciente con datos (alimenta anillo y contadores).
  const analytics = useApi<EmployeeMonthlyAnalyticsResponse>(
    employeeId != null && ringPeriod
      ? `/indicators/employee/${employeeId}/year/${ringPeriod.year}/month/${ringPeriod.month}/analytics`
      : null,
  );

  // Períodos activos de evaluación (CTA real).
  const evalPeriods = useApi<EvalPeriod[]>("/evaluations/periods");
  const activePeriod =
    evalPeriods.state.data?.find((p) => p.isActive === true) ?? null;

  // Feed de actividad compartido; sin ids → filas sin enlaces inventados.
  const activities = useApi<DashboardActivityDto[]>("/dashboard/activities");

  // Contadores de la bandeja propia (fixture: vacío → 0 es valor real).
  const solStats = useApi<SolicitudNovedadStatsResponse>(
    "/solicitudes/stats?scope=propias",
  );

  // Documentos corporativos + confirmaciones del usuario (consultas M5).
  const documents = useApi<CorporateDocumentDTO[]>("/corporate-documents", {
    unwrapApiResponse: true,
  });
  const confirmedIds = useApi<ConfirmedDocumentIds>(
    userId != null
      ? `/document-confirmations/user/${userId}/document-ids`
      : null,
    { unwrapApiResponse: true },
  );
  const pendingDocs = useMemo(() => {
    const docs = documents.state.data;
    const ids = confirmedIds.state.data?.documentIds;
    if (!Array.isArray(docs) || !Array.isArray(ids)) return null;
    const confirmed = new Set(ids);
    return docs.filter((d) => d.id != null && !confirmed.has(d.id)).length;
  }, [documents.state.data, confirmedIds.state.data]);

  const analyticsData = analytics.state.data;
  const breakdown = analyticsData?.indicatorBreakdown ?? [];

  // Prioridad del anillo: resumen real del empleado (dashboard/employee,
  // agregado de TODOS sus indicadores) > analytics del último mes con datos.
  // El fallback mensual solo aplica cuando /dashboard/employee responde 403
  // (usuario sin permiso kpis.dashboard) o aún no responde.
  const summaryData = summary.state.data;
  const summaryRing = summaryData
    ? {
        value:
          Number(summaryData.totalIndicators) > 0
            ? Math.round(
                (Number(summaryData.completedIndicators) /
                  Number(summaryData.totalIndicators)) *
                  100,
              )
            : 0,
        label: "indicadores evaluados",
        counts: `${summaryData.completedIndicators} de ${summaryData.totalIndicators} indicadores evaluados`,
      }
    : null;

  return (
    <>
      <div className="vivid-mobile-greeting">
        <div>
          <span>{todayLabel()}</span>
          <h1>
            Hola, {greeting}{" "}
            <span className="greeting-sun" aria-hidden="true">
              ✦
            </span>
          </h1>
          <p>Hoy es un buen día para crecer.</p>
        </div>
        <Link
          to="/dashboard/profile"
          className="greeting-avatar"
          aria-label="Ver mi perfil"
        >
          {initials}
          <i />
        </Link>
      </div>
      <div className="vivid-desktop-heading">
        <PageHero
          eyebrow={todayLabel()}
          title={`Hola, ${greeting}. Qué bueno tenerte aquí.`}
          description="Un nuevo día para conectar, avanzar y hacer que las cosas pasen."
          action={
            <Link className="pn-button secondary" to="/dashboard/requests/new">
              <Icon name="add" size={18} /> Nueva solicitud
            </Link>
          }
        />
      </div>
      <div className="pn-home-top">
        <section className="pn-welcome vivid-home-hero">
          <div className="hero-topline">
            <span>
              <i /> TU MOMENTO ES AHORA
            </span>
            <Icon name="auto_awesome" size={20} />
          </div>
          <div className="hero-center">
            <div className="hero-message">
              <h2>
                Vas por
                <br />
                <em>cosas grandes.</em>
              </h2>
              <p>
                Tu talento nos mueve.
                <br />
                Tus logros nos inspiran.
              </p>
            </div>
            {summaryRing ? (
              <ProgressRing
                value={summaryRing.value}
                label={summaryRing.label}
                compact
              />
            ) : analytics.state.status === "success" &&
              analyticsData?.completionRate != null ? (
              <ProgressRing
                value={analyticsData.completionRate}
                label={`indicadores evaluados · ${periodLabel(ringPeriod as MonthPeriod)}`}
                compact
              />
            ) : indicators.state.status === "error" ? (
              <SectionError
                error={indicators.state.error ?? "Sin dato"}
                restricted={indicators.state.errorStatus === 403}
                onRetry={indicators.reload}
              />
            ) : employeeId == null ? (
              <p className="pn-info" role="status">
                Usuario sin colaborador asociado.
              </p>
            ) : indicators.state.status === "success" && !periods.length ? (
              <p className="pn-info" role="status">
                Aún no tienes indicadores asignados.
              </p>
            ) : (
              <LoadingNote label="Cargando tu avance…" />
            )}
          </div>
          <div className="hero-bottom">
            {summaryRing ? (
              <span className="hero-growth">
                <Icon name="check_circle" size={16} /> {summaryRing.counts}
              </span>
            ) : analytics.state.status === "success" &&
              analyticsData?.totalIndicators != null ? (
              <span className="hero-growth">
                <Icon name="check_circle" size={16} />{" "}
                {analyticsData.completedIndicators ?? 0} de{" "}
                {analyticsData.totalIndicators} indicadores evaluados
              </span>
            ) : (
              <span />
            )}
            <Link to="/dashboard/kpis">
              Ver mis metas <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
          <span className="hero-orbit orbit-one" aria-hidden="true" />
          <span className="hero-orbit orbit-two" aria-hidden="true" />
        </section>
        {evalPeriods.state.status === "error" ? (
          <section className="pn-focus">
            <div className="focus-top">
              <span>
                <i /> EN TU RADAR
              </span>
              <Icon name="arrow_outward" />
            </div>
            <span className="focus-icon">
              <Icon name="target" size={27} />
            </span>
            <h3>No pudimos consultar los períodos</h3>
            <p>{evalPeriods.state.error}</p>
            <Button secondary onClick={evalPeriods.reload}>
              Reintentar
            </Button>
          </section>
        ) : activePeriod ? (
          <section
            className="human-evaluation-card"
            aria-labelledby="evaluation-title"
          >
            <div className="human-evaluation-cover">
              <img
                src="/images/people/reflection.jpg"
                alt=""
                width="1536"
                height="1024"
              />
              <span className="human-status">
                <Icon name="assignment" size={16} />
                Período activo
              </span>
            </div>
            <div className="human-evaluation-content">
              <span className="human-eyebrow">
                TU DESARROLLO · {activePeriod.name ?? "SIN DATO"}
              </span>
              <h2 id="evaluation-title">Evaluación de desempeño</h2>
              <p>
                Ya puedes completar tu evaluación del período{" "}
                {activePeriod.name ?? "sin dato"}.
              </p>
              <div className="human-evaluation-meta">
                <span>
                  <Icon name="schedule" size={16} /> Aproximadamente 5 minutos
                </span>
              </div>
              <Link className="pn-button" to="/dashboard/evaluations">
                Comenzar evaluación
                <Icon name="arrow_forward" size={18} />
              </Link>
            </div>
          </section>
        ) : (
          <div
            className="pn-focus"
            aria-disabled="true"
            role="note"
            title="Sin período de evaluación activo"
          >
            <div className="focus-top">
              <span>
                <i /> EN TU RADAR
              </span>
              <Icon name="target" />
            </div>
            <span className="focus-icon">
              <Icon name="target" size={27} />
            </span>
            <h3>
              Tu crecimiento <br />
              merece un momento.
            </h3>
            <p>
              {evalPeriods.state.status === "loading"
                ? "Consultando períodos de evaluación…"
                : "Por ahora no hay un período de evaluación activo."}
            </p>
            <span className="focus-bottom">Evaluación no disponible</span>
          </div>
        )}
      </div>
      <div className="pn-stats">
        <Link to="/dashboard/kpis" className="pn-stat">
          <div>
            <span className="stat-icon stat-0">
              <Icon name="monitoring" />
            </span>
            <Icon name="north_east" size={16} />
          </div>
          <p>Metas del mes</p>
          <strong>
            {analyticsData?.totalIndicators != null
              ? String(analyticsData.totalIndicators).padStart(2, "0")
              : "--"}
            <small>metas</small>
          </strong>
          <span className="stat-detail">
            {analytics.state.status === "loading"
              ? "Cargando…"
              : analytics.state.status === "error"
                ? analytics.state.error
                : `${analyticsData?.completedIndicators ?? 0} evaluadas · ${analyticsData?.pendingIndicators ?? 0} pendientes`}
          </span>
        </Link>
        <Link to="/dashboard/requests" className="pn-stat">
          <div>
            <span className="stat-icon stat-1">
              <Icon name="event_available" />
            </span>
            <Icon name="north_east" size={16} />
          </div>
          <p>Solicitudes pendientes</p>
          <strong>
            {solStats.state.data
              ? String(solStats.state.data.pendientes).padStart(2, "0")
              : "--"}
            <small />
          </strong>
          <span className="stat-detail">
            {solStats.state.status === "loading"
              ? "Cargando…"
              : solStats.state.status === "error"
                ? solStats.state.error
                : solStats.state.data?.total
                  ? "En revisión"
                  : "No tienes solicitudes pendientes"}
          </span>
        </Link>
        <Link to="/dashboard/documents" className="pn-stat">
          <div>
            <span className="stat-icon stat-2">
              <Icon name="folder_open" />
            </span>
            <Icon name="north_east" size={16} />
          </div>
          <p>Documentos por leer</p>
          <strong>
            {pendingDocs != null ? String(pendingDocs).padStart(2, "0") : "--"}
            <small />
          </strong>
          <span className="stat-detail">
            {documents.state.status === "loading" ||
            (userId != null && confirmedIds.state.status === "loading")
              ? "Cargando…"
              : documents.state.status === "error"
                ? documents.state.error
                : confirmedIds.state.status === "error"
                  ? confirmedIds.state.error
                  : "Mantente al día con tu organización"}
          </span>
        </Link>
        <Link to="/dashboard/evaluations" className="pn-stat">
          <div>
            <span className="stat-icon stat-3">
              <Icon name="target" />
            </span>
            <Icon name="north_east" size={16} />
          </div>
          <p>Evaluación de desempeño</p>
          <strong>
            {activePeriod ? "Abierta" : "--"}
            <small />
          </strong>
          <span className="stat-detail">
            {evalPeriods.state.status === "loading"
              ? "Cargando…"
              : evalPeriods.state.status === "error"
                ? evalPeriods.state.error
                : activePeriod
                  ? `Período ${activePeriod.name ?? "sin dato"}`
                  : "Sin período activo"}
          </span>
        </Link>
      </div>
      <div className="pn-section-heading">
        <div>
          <h2>¿Qué necesitas hacer hoy?</h2>
          <p>Menos vueltas. Más tiempo para lo que importa.</p>
        </div>
        <span className="small-muted">TUS ACCESOS RÁPIDOS</span>
      </div>
      <div className="pn-quick-grid">
        {[
          [
            "event_available",
            "Solicitar un permiso",
            "Gestiona tu tiempo",
            "requests/new",
          ],
          [
            "workspace_premium",
            "Obtener un certificado",
            "A un clic de distancia",
            "certificates",
          ],
          [
            "account_tree",
            "Conocer al equipo",
            "Conecta con las personas",
            "org-chart",
          ],
          [
            "auto_awesome",
            "Preguntarle a Eva",
            "Estamos para ayudarte",
            "assistant",
          ],
        ].map(([icon, title, desc, path]) => (
          <Link to={"/dashboard/" + path} className="pn-quick" key={path}>
            <span className="quick-icon">
              <Icon name={icon} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>{desc}</p>
            </div>
            <Icon name="chevron_right" size={18} />
          </Link>
        ))}
      </div>
      <div className="vivid-home-chart">
        <section className="pn-panel vivid-chart">
          <div className="vivid-chart-heading">
            <div>
              <span className="pn-eyebrow">TU RESUMEN</span>
              <h2>Así va tu desempeño</h2>
            </div>
            <Icon name="space_dashboard" />
          </div>
          {summary.state.status === "error" ? (
            <SectionError
              error={summary.state.error ?? "Sin dato"}
              restricted={summary.state.errorStatus === 403}
              onRetry={summary.reload}
            />
          ) : summary.state.status === "loading" ? (
            <LoadingNote label="Cargando resumen…" />
          ) : summary.state.data ? (
            <>
              <p className="chart-hint">
                <Icon name="person" size={14} />{" "}
                {summary.state.data.fullName ?? name}
                {summary.state.data.area ? ` · ${summary.state.data.area}` : ""}
              </p>
              <div className="metric-detail-comparison">
                <div>
                  <span>Indicadores</span>
                  <strong>
                    {summary.state.data.totalIndicators ?? "Sin dato"}
                  </strong>
                </div>
                <div>
                  <span>Evaluados</span>
                  <strong>
                    {summary.state.data.completedIndicators ?? "Sin dato"}
                  </strong>
                </div>
                <div>
                  <span>Pendientes</span>
                  <strong>
                    {summary.state.data.pendingIndicators ?? "Sin dato"}
                  </strong>
                </div>
                <div>
                  <span>Promedio final</span>
                  <strong>
                    {summary.state.data.averageFinalResult != null
                      ? formatMeasure(
                          summary.state.data.averageFinalResult,
                          "%",
                        )
                      : "Sin dato"}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <p className="pn-info" role="status">
              Sin resumen disponible.
            </p>
          )}
        </section>
        <section className="vivid-agenda">
          <div className="panel-heading">
            <div>
              <span className="pn-eyebrow">UN PASO A LA VEZ</span>
              <h2>Lo que viene para ti</h2>
            </div>
            <Icon name="calendar_month" />
          </div>
          {activePeriod ? (
            (() => {
              const dateParts = shortDateParts(activePeriod.endDate);
              return (
                <Link to="/dashboard/evaluations">
                  <span className="agenda-date">
                    <strong>{dateParts?.day ?? "--"}</strong>
                    {dateParts?.month ?? "··"}
                  </span>
                  <div>
                    <span className="agenda-tag">TU DESARROLLO</span>
                    <h3>Tu evaluación está abierta</h3>
                    <p>Período {activePeriod.name ?? "sin dato"}.</p>
                  </div>
                  <Icon name="chevron_right" />
                </Link>
              );
            })()
          ) : evalPeriods.state.status === "loading" ? (
            <LoadingNote label="Consultando períodos…" />
          ) : (
            <p className="pn-info">
              Sin períodos de evaluación activos por ahora.
            </p>
          )}
          <Link className="agenda-cta" to="/dashboard/requests/new">
            <Icon name="add_circle" size={19} /> Planea algo para ti{" "}
            <Icon name="arrow_forward" size={17} />
          </Link>
        </section>
      </div>
      <div className="pn-bottom-grid">
        <section className="pn-panel">
          <div className="panel-heading">
            <div>
              <h2>Así van tus objetivos</h2>
              <p>
                {ringPeriod
                  ? `Indicadores de ${periodLabel(ringPeriod)}.`
                  : "Cada avance cuenta. Sigue así."}
              </p>
            </div>
            <Link to="/dashboard/kpis">
              Ver indicadores <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
          {analytics.state.status === "loading" ? (
            <LoadingNote label="Cargando indicadores…" />
          ) : analytics.state.status === "error" ? (
            <SectionError
              error={analytics.state.error ?? "Sin dato"}
              restricted={analytics.state.errorStatus === 403}
              onRetry={analytics.reload}
            />
          ) : breakdown.length ? (
            breakdown.map((item, i) => (
              <Link
                className="objective-row"
                to="/dashboard/kpis"
                key={item.indicatorId ?? `row-${i}`}
              >
                <span className={`objective-icon stat-${i % 3}`}>
                  <Icon name="assessment" />
                </span>
                <div>
                  <strong>{item.label ?? "Indicador sin dato"}</strong>
                  {item.measurementDirection === "ascendente" &&
                  item.result != null &&
                  (item.measurementUnit ?? "%") === "%" ? (
                    <div className="pn-progress">
                      <i
                        style={{
                          width: `${Math.max(0, Math.min(100, item.result))}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                <span>{formatMeasure(item.result, item.measurementUnit)}</span>
                <Badge>{item.completed ? "Evaluado" : "Pendiente"}</Badge>
              </Link>
            ))
          ) : (
            <div className="pn-empty">
              <Icon name="flag" size={30} />
              <h3>Sin indicadores en este período</h3>
              <p>Verás tus objetivos aquí cuando tengan datos.</p>
            </div>
          )}
        </section>
        <section className="pn-panel">
          <div className="panel-heading">
            <div>
              <h2>Lo último en tu espacio</h2>
              <p>Las novedades que te importan.</p>
            </div>
            <Link
              aria-label="Ver todas las novedades"
              to="/dashboard/notifications"
            >
              <Icon name="arrow_outward" size={19} />
            </Link>
          </div>
          {activities.state.status === "loading" ? (
            <LoadingNote label="Cargando novedades…" />
          ) : activities.state.status === "error" ? (
            <SectionError
              error={activities.state.error ?? "Sin dato"}
              restricted={activities.state.errorStatus === 403}
              onRetry={activities.reload}
            />
          ) : (activities.state.data?.length ?? 0) > 0 ? (
            activities.state.data?.map((activity, i) => (
              <div
                className="activity-row"
                key={`${activity.timestamp ?? ""}-${i}`}
              >
                <span className={`activity-icon stat-${i % 3}`}>
                  <Icon name="notifications" size={18} />
                </span>
                <div>
                  <strong>{activity.title ?? "Sin título"}</strong>
                  <p>
                    {activity.description ?? "Sin detalle"}
                    {activity.timestamp
                      ? ` · ${activityTimestamp(activity.timestamp)}`
                      : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="pn-empty">
              <Icon name="notifications" size={30} />
              <h3>Sin novedades por ahora</h3>
              <p>Te avisaremos cuando haya algo nuevo para ti.</p>
            </div>
          )}
        </section>
      </div>
      <div className="pn-quote">
        <Icon name="favorite" size={17} />
        <span>Detrás de cada gran resultado, hay personas como tú.</span>
        <span>Somos PeopleNet.</span>
      </div>
    </>
  );
}
