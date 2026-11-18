import { DetailMeta } from "./DetailSheet";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Icon,
  Button,
  Badge,
  PageHero,
  SectionTitle,
  Tabs,
  download,
  Modal,
  SectionError,
  LoadingNote,
  date,
} from "./shared";
import { ProgressRing } from "./Charts";
import {
  useApi,
  useEmployeeIndicators,
  sessionEmployeeId,
  periodsFromIndicators,
  periodLabel,
  monthLabel,
  formatMeasure,
  toApiError,
  type MonthPeriod,
} from "../lib/api";
import type {
  EmployeeMonthlyAnalyticsResponse,
  IndicatorWire,
} from "../lib/api-types";
import {
  createMyIndicatorComment,
  downloadMyIndicatorEvidence,
  submitMyIndicatorEvidence,
  useMyIndicatorComments,
  useMyIndicatorEvidences,
  type EvidenceStatus,
  type SelfIndicatorEvidenceCapacity,
} from "../lib/self-indicators";

const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;
const EVIDENCE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar";

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function formatMoment(value: string | null): string {
  if (!value) return "Sin dato";
  const [day, time] = value.split(/[ T]/);
  const datePart = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? date(day) : "Sin dato";
  const hhmm = time ? time.slice(0, 5) : "";
  return hhmm ? `${datePart} · ${hhmm}` : datePart;
}

function evidenceStatusLabel(status: EvidenceStatus | string | null): string {
  if (status === "APPROVED") return "Aprobada";
  if (status === "REJECTED") return "Rechazada";
  return "Pendiente";
}

function isEvaluatorRole(role: string | null): boolean {
  const normalized = (role ?? "").toLowerCase();
  return (
    normalized === "admin" ||
    normalized === "super_admin" ||
    normalized === "supervisor"
  );
}

function capacitySummary(capacity: SelfIndicatorEvidenceCapacity): string {
  if (capacity.unlimited) {
    return `${capacity.count} registrada(s) · Sin límite`;
  }
  return `${capacity.count} de ${capacity.limit} usada(s) · ${capacity.available ?? 0} disponible(s)`;
}

/**
 * M3 — KPIs / Metas con datos reales de kpis-ms.
 * - Períodos derivados de los indicadores reales del colaborador
 *   (GET /api/indicators/employee/{employeeId}); nunca un selector fijo.
 * - Lista del período: GET /api/indicators/employee/{id}/year/{y}/month/{m}
 *   (finalResultValue null = pendiente de calificar).
 * - Resumen del mes: GET .../analytics — completionRate (% calificados) y
 *   averageResult (promedio de resultados) son métricas distintas.
 * - Se respeta measurementUnit (no se asume "%" para otra unidad) y
 *   measurementDirection (descendente ≠ "más es mejor").
 * - Sin sparklines ni variaciones inventadas: solo valores con contrato.
 * - Exportar: CSV con los indicadores reales del período seleccionado.
 * - Lecturas obsoletas al cambiar mes: canceladas por useApi (AbortController).
 */

/** Celdas CSV con escape de separador, comillas y saltos de línea. */
function csvCell(value: string | number | null): string {
  const raw = value == null ? "" : String(value);
  return /[;"\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

const FILTERS = ["Todos", "Evaluado", "Pendiente"] as const;
type Filter = (typeof FILTERS)[number];

export function Kpis({ notify }: { notify: (v: string) => void }) {
  const [filter, setFilter] = useState<Filter>("Todos");
  const [selectedPeriod, setSelectedPeriod] = useState<MonthPeriod | null>(
    null,
  );
  const [detailId, setDetailId] = useState<number | null>(null);

  const employeeId = sessionEmployeeId();

  // Períodos reales (meses con datos) a partir de los indicadores del empleado.
  const indicatorsAll = useEmployeeIndicators(employeeId);
  const periods = periodsFromIndicators(indicatorsAll.state.data);
  // Por defecto el período más reciente con datos; el usuario puede cambiarlo.
  const period: MonthPeriod | null = selectedPeriod ?? periods[0] ?? null;

  // Lista del período (lista directa, sin paginación).
  const monthIndicators = useApi<IndicatorWire[]>(
    employeeId != null && period
      ? `/indicators/employee/${employeeId}/year/${period.year}/month/${period.month}`
      : null,
  );

  // Resumen del período con analytics (completionRate ≠ averageResult).
  const analytics = useApi<EmployeeMonthlyAnalyticsResponse>(
    employeeId != null && period
      ? `/indicators/employee/${employeeId}/year/${period.year}/month/${period.month}/analytics`
      : null,
  );
  const analyticsData = analytics.state.data;

  const rows = monthIndicators.state.data ?? [];
  const items = rows.filter(
    (r) =>
      filter === "Todos" ||
      (filter === "Evaluado"
        ? r.finalResultValue != null
        : r.finalResultValue == null),
  );
  const selected = rows.find((r) => r.id != null && r.id === detailId) ?? null;

  const noEmployee = employeeId == null;
  const listLoading = monthIndicators.state.status === "loading";
  const listError = monthIndicators.state.status === "error";

  const exportReport = () => {
    if (!rows.length) return;
    const header =
      "Indicador;Objetivo;Area;Mes;Anio;Unidad;Direccion;Meta (%);Peso (%);Resultado;Estado";
    const body = rows
      .map((r) =>
        [
          r.indicatorTitle ?? r.objective ?? `Indicador ${r.id ?? ""}`,
          r.objective ?? "",
          r.areaName ?? r.dependencyName ?? "",
          monthLabel(r.month),
          r.year ?? "",
          r.measurementUnit ?? "%",
          r.measurementDirection ?? "",
          r.targetPercentage ?? "",
          r.weightPercentage ?? "",
          r.finalResultValue ?? "",
          r.finalResultValue != null ? "Evaluado" : "Pendiente",
        ]
          .map(csvCell)
          .join(";"),
      )
      .join("\n");
    download(
      `indicadores-${period?.month ?? "sin-periodo"}-${period?.year ?? ""}.csv`,
      `${header}\n${body}\n`,
    );
    notify("Reporte descargado.");
  };

  const canExport =
    monthIndicators.state.status === "success" && rows.length > 0;

  return (
    <>
      <PageHero
        eyebrow="TU ESFUERZO, EN NÚMEROS"
        title="Vas por más."
        description="Cada paso cuenta. Mira todo lo que estás logrando."
        action={
          <Button secondary onClick={exportReport} disabled={!canExport}>
            <Icon name="download" /> Exportar
          </Button>
        }
      />
      <div className="vivid-period">
        <span>
          <Icon name="calendar_month" size={18} /> Tu desempeño
        </span>
        {noEmployee ? (
          <p className="pn-info" role="status">
            Usuario sin colaborador asociado.
          </p>
        ) : indicatorsAll.state.status === "loading" ? (
          <LoadingNote label="Cargando períodos…" />
        ) : indicatorsAll.state.status === "error" ? (
          <SectionError
            error={indicatorsAll.state.error ?? "Sin dato"}
            restricted={indicatorsAll.state.errorStatus === 403}
            onRetry={indicatorsAll.reload}
          />
        ) : !periods.length ? (
          <p className="pn-info" role="status">
            Sin períodos con indicadores todavía.
          </p>
        ) : (
          <select
            aria-label="Periodo"
            value={period ? periodLabel(period) : ""}
            onChange={(e) => {
              const chosen = periods.find(
                (p) => periodLabel(p) === e.target.value,
              );
              if (chosen) setSelectedPeriod(chosen);
            }}
          >
            {periods.map((p) => (
              <option key={`${p.year}-${p.month}`} value={periodLabel(p)}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        )}
      </div>
      <Link className="editorial-strategy" to="/dashboard/documents">
        <img
          src="/images/people/estrategia.jpg"
          alt=""
          width="1536"
          height="1024"
        />
        <div>
          <span className="human-eyebrow">CADA META TIENE UN PROPÓSITO</span>
          <h2>Tu aporte nos lleva más lejos.</h2>
          <p>
            Descubre cómo tus objetivos conectan con los documentos de la
            organización.
          </p>
          <span className="editorial-strategy-link">
            Ver la biblioteca <Icon name="arrow_forward" size={17} />
          </span>
        </div>
      </Link>
      {period && (
        <div className="pn-kpi-overview">
          <section className="vivid-score-card">
            <div className="score-top">
              <span>
                <i /> VISTA GENERAL · {periodLabel(period)}
              </span>
              <Icon name="auto_awesome" />
            </div>
            <div className="score-center">
              {analytics.state.status === "success" &&
              analyticsData?.completionRate != null ? (
                <ProgressRing
                  value={analyticsData.completionRate}
                  label="indicadores evaluados"
                />
              ) : (
                <div className="score-center-text">
                  {analytics.state.status === "loading"
                    ? "Cargando resumen…"
                    : analytics.state.status === "error"
                      ? analytics.state.error
                      : "Sin resumen para este período."}
                </div>
              )}
              <div>
                {analytics.state.status === "success" &&
                analyticsData?.totalIndicators != null ? (
                  <span className="score-pill">
                    <Icon name="check_circle" size={15} />
                    {analyticsData.completedIndicators ?? 0} de{" "}
                    {analyticsData.totalIndicators} indicadores evaluados
                  </span>
                ) : null}
                <h2>
                  Tu avance
                  <br />
                  <em>de este mes.</em>
                </h2>
                <p>
                  {analyticsData?.averageResult != null
                    ? `Resultado promedio: ${formatMeasure(analyticsData.averageResult, "%")}`
                    : "Sin resultados calificados todavía."}
                </p>
              </div>
            </div>
            <div className="score-legend">
              <span>
                <i /> Indicadores evaluados
              </span>
              <span>
                <i /> Resultado promedio
              </span>
              <strong>
                Meta promedio:{" "}
                {analyticsData?.averageTargetPercentage != null
                  ? formatMeasure(analyticsData.averageTargetPercentage, "%")
                  : "Sin dato"}
              </strong>
            </div>
          </section>
        </div>
      )}
      <SectionTitle
        title="El detalle de tus metas"
        description="Enfócate, avanza y celebra."
        action={
          <span className="vivid-count">
            {String(items.length).padStart(2, "0")}
          </span>
        }
      />
      {period && (
        <div className="pn-toolbar">
          <Tabs
            items={[...FILTERS]}
            value={filter}
            set={(v) => setFilter(v as Filter)}
          />
        </div>
      )}
      {listLoading ? (
        <LoadingNote label="Cargando indicadores…" />
      ) : listError ? (
        <SectionError
          error={monthIndicators.state.error ?? "Sin dato"}
          restricted={monthIndicators.state.errorStatus === 403}
          onRetry={monthIndicators.reload}
        />
      ) : !rows.length ? (
        <div className="pn-empty">
          <Icon name="flag" size={32} />
          <h3>
            {period
              ? `Sin indicadores en ${periodLabel(period)}.`
              : "Sin indicadores todavía."}
          </h3>
          <p>
            Cuando tu líder asigne indicadores para un mes, aparecerán aquí.
          </p>
        </div>
      ) : (
        <>
          <div className="pn-metric-grid">
            {items.map((r) => {
              const completed = r.finalResultValue != null;
              const ascending =
                (r.measurementDirection ?? "").toLowerCase() === "ascendente";
              const unitIsPercent = (r.measurementUnit ?? "%") === "%";
              // Barra solo para indicadores ascendentes en % con resultado:
              // otra unidad o dirección descendente no admiten esa fórmula.
              const progress =
                completed && ascending && unitIsPercent
                  ? Math.max(0, Math.min(100, r.finalResultValue as number))
                  : null;
              return (
                <button
                  className={`pn-panel metric-card metric-tone-${(r.id ?? 0) % 4}`}
                  key={r.id ?? r.indicatorTitle}
                  onClick={() => r.id != null && setDetailId(r.id)}
                  aria-label={`Ver detalle de ${r.indicatorTitle ?? r.objective ?? "indicador"}`}
                  disabled={r.id == null}
                >
                  <div className="panel-heading">
                    <span className="quick-icon">
                      <Icon name="monitoring" />
                    </span>
                    <Badge>{completed ? "Evaluado" : "Pendiente"}</Badge>
                  </div>
                  <span className="pn-eyebrow">
                    {r.areaName ?? r.dependencyName ?? "Sin área"}
                  </span>
                  <h3>{r.indicatorTitle ?? r.objective ?? "Indicador"}</h3>
                  <div className="metric-value-chart">
                    <div className="metric-number">
                      {completed
                        ? formatMeasure(r.finalResultValue, r.measurementUnit)
                        : "Pendiente"}
                    </div>
                  </div>
                  <div className="metric-target">
                    <span>
                      Meta:{" "}
                      {r.targetPercentage != null
                        ? formatMeasure(r.targetPercentage, "%")
                        : "Sin dato"}
                    </span>
                    <strong>
                      Peso:{" "}
                      {r.weightPercentage != null
                        ? formatMeasure(r.weightPercentage, "%")
                        : "Sin dato"}
                    </strong>
                  </div>
                  {progress != null && (
                    <div className="pn-progress">
                      <i style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  <div className="metric-bottom">
                    <span className={completed ? "positive" : ""}>
                      <Icon
                        name={completed ? "check_circle" : "hourglass_empty"}
                        size={14}
                      />
                      {r.measurementDirection
                        ? r.measurementDirection.toLowerCase() === "descendente"
                          ? "Dirección descendente"
                          : "Dirección ascendente"
                        : "Sin dirección"}
                    </span>
                    <Icon name="arrow_forward" size={18} />
                  </div>
                </button>
              );
            })}
          </div>
          {!items.length && (
            <div className="pn-empty">
              <Icon name="filter_alt" size={30} />
              <h3>Aún no hay indicadores en este estado.</h3>
              <p>Selecciona otro filtro para seguir explorando.</p>
            </div>
          )}
        </>
      )}
      {selected && (
        <Modal
          title={
            selected.indicatorTitle ??
            selected.objective ??
            "Detalle del indicador"
          }
          status={
            <Badge>
              {selected.finalResultValue != null ? "Evaluado" : "Pendiente"}
            </Badge>
          }
          close={() => setDetailId(null)}
        >
          <div className="metric-detail">
            <h3>Resultado y meta</h3>
            <dl>
              <DetailMeta icon="calendar_month" label="Período">
                {period ? periodLabel(period) : "Sin dato"}
              </DetailMeta>
              <DetailMeta icon="account_tree" label="Área">
                {selected.areaName ?? selected.dependencyName ?? "Sin dato"}
              </DetailMeta>
            </dl>
            {selected.finalResultValue != null &&
            (selected.measurementDirection ?? "").toLowerCase() ===
              "ascendente" &&
            (selected.measurementUnit ?? "%") === "%" ? (
              <ProgressRing
                value={selected.finalResultValue}
                label="Resultado actual"
              />
            ) : null}
            <div className="metric-detail-comparison">
              <div>
                <span>Tu resultado</span>
                <strong>
                  {formatMeasure(
                    selected.finalResultValue,
                    selected.measurementUnit,
                  )}
                </strong>
              </div>
              <div>
                <span>Tu meta</span>
                <strong>
                  {selected.targetPercentage != null
                    ? formatMeasure(selected.targetPercentage, "%")
                    : "Sin dato"}
                </strong>
              </div>
              <div>
                <span>Peso</span>
                <strong>
                  {selected.weightPercentage != null
                    ? formatMeasure(selected.weightPercentage, "%")
                    : "Sin dato"}
                </strong>
              </div>
            </div>
            {selected.objective && (
              <p>
                <strong>Objetivo: </strong>
                {selected.objective}
              </p>
            )}
            {selected.indicatorDescription && (
              <p>{selected.indicatorDescription}</p>
            )}
            <p>
              {selected.finalResultValue == null
                ? "Sin calificación registrada todavía. Aparecerá cuando este indicador sea evaluado."
                : (selected.measurementDirection ?? "").toLowerCase() ===
                    "descendente"
                  ? "Indicador de dirección descendente: aquí un valor menor respecto a la referencia es mejor."
                  : selected.targetPercentage != null &&
                      selected.finalResultValue >= selected.targetPercentage
                    ? "¡Meta alcanzada! Sigue compartiendo lo que te funciona con tu equipo."
                    : "En avance hacia la meta. Revisa los pendientes con tu líder y define una acción concreta."}
            </p>
            <span className="small-muted">
              {period ? `Período: ${periodLabel(period)} · ` : ""}Datos del
              servidor
            </span>
            {selected.id != null && (
              <IndicatorDetailWorkspace
                key={selected.id}
                indicatorId={selected.id}
                notify={notify}
              />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function IndicatorDetailWorkspace({
  indicatorId,
  notify,
}: {
  indicatorId: number;
  notify: (v: string) => void;
}) {
  const evidences = useMyIndicatorEvidences(indicatorId);
  const comments = useMyIndicatorComments(indicatorId);

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceFileKey, setEvidenceFileKey] = useState(0);
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    if (!chosen) {
      setEvidenceFile(null);
      return;
    }
    if (chosen.size === 0) {
      event.target.value = "";
      setEvidenceFile(null);
      setEvidenceError("El archivo seleccionado está vacío.");
      return;
    }
    if (chosen.size > MAX_EVIDENCE_BYTES) {
      event.target.value = "";
      setEvidenceFile(null);
      setEvidenceError("El archivo supera el límite máximo permitido de 50 MB.");
      return;
    }
    setEvidenceError("");
    setEvidenceFile(chosen);
  };

  const handleEvidenceSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingEvidence) return;
    if (!evidenceFile) {
      setEvidenceError("Debes adjuntar un archivo para registrar la evidencia.");
      return;
    }
    if (description.trim().length > 255) {
      setEvidenceError("La descripción admite máximo 255 caracteres.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setEvidenceError(
        "La fecha de inicio no puede ser posterior a la fecha de finalización.",
      );
      return;
    }
    setEvidenceError("");
    setSubmittingEvidence(true);
    try {
      await submitMyIndicatorEvidence(indicatorId, {
        file: evidenceFile,
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setEvidenceFile(null);
      setEvidenceFileKey((k) => k + 1);
      setDescription("");
      setStartDate("");
      setEndDate("");
      evidences.reload();
      notify("Evidencia registrada correctamente.");
    } catch (error) {
      setEvidenceError(toApiError(error).message);
    } finally {
      setSubmittingEvidence(false);
    }
  };

  const handleDownload = async (evidenceId: number, fileName: string | null) => {
    if (downloadingId != null) return;
    setDownloadError("");
    setDownloadingId(evidenceId);
    try {
      const blob = await downloadMyIndicatorEvidence(indicatorId, evidenceId);
      saveBlob(blob, fileName || `evidencia-${evidenceId}`);
      notify("Evidencia descargada.");
    } catch (error) {
      setDownloadError(toApiError(error).message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCommentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingComment) return;
    const trimmed = commentText.trim();
    if (!trimmed) {
      setCommentError("Escribe un comentario antes de enviar.");
      return;
    }
    if (trimmed.length > 1000) {
      setCommentError("El comentario admite máximo 1000 caracteres.");
      return;
    }
    setCommentError("");
    setSubmittingComment(true);
    try {
      await createMyIndicatorComment(indicatorId, trimmed);
      setCommentText("");
      comments.reload();
      notify("Comentario publicado.");
    } catch (error) {
      setCommentError(toApiError(error).message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const evidencesData = evidences.state.data;
  const capacity = evidencesData?.capacity ?? null;
  const evidenceItems = evidencesData?.evidences ?? [];
  const commentItems = comments.state.data ?? [];

  return (
    <>
      <section aria-label="Evidencias del indicador" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="!m-0">Evidencias</h3>
          {capacity && (
            <Badge>{capacitySummary(capacity)}</Badge>
          )}
        </div>

        {capacity?.registrationType?.toLowerCase() === "automatico" &&
          capacity.startCalificationDate &&
          capacity.endCalificationDate && (
            <p className="pn-info" role="status">
              <Icon name="schedule" size={16} />
              <span>
                Ventana de registro: {date(capacity.startCalificationDate)} —{" "}
                {date(capacity.endCalificationDate)}
              </span>
            </p>
          )}

        {evidences.state.status === "loading" && !evidencesData ? (
          <LoadingNote label="Cargando evidencias…" />
        ) : evidences.state.status === "error" && !evidencesData ? (
          <SectionError
            error={evidences.state.error ?? "No se pudieron cargar las evidencias."}
            restricted={evidences.state.errorStatus === 403}
            onRetry={evidences.reload}
          />
        ) : (
          <>
            {downloadError && (
              <p className="pn-info" role="alert">
                <Icon name="error_outline" size={16} />
                <span>{downloadError}</span>
              </p>
            )}

            {evidenceItems.length === 0 ? (
              <p className="pn-info" role="status">
                <Icon name="folder_open" size={16} />
                <span>Aún no has registrado evidencias para este indicador.</span>
              </p>
            ) : (
              <div className="flex flex-col gap-3 mb-4">
                {evidenceItems.map((item) => (
                  <div
                    key={item.id}
                    className="pn-panel p-4 flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <strong className="block text-sm break-all">
                          {item.fileName ?? `Evidencia #${item.id}`}
                        </strong>
                        {item.submittedAt && (
                          <span className="small-muted block mt-0.5">
                            Enviada: {formatMoment(item.submittedAt)}
                          </span>
                        )}
                      </div>
                      <Badge>{evidenceStatusLabel(item.status)}</Badge>
                    </div>

                    {item.description && (
                      <p className="!my-1 text-xs">{item.description}</p>
                    )}

                    {(item.startDate || item.endDate) && (
                      <span className="small-muted block">
                        Rango:{" "}
                        {item.startDate ? date(item.startDate) : "Sin inicio"} —{" "}
                        {item.endDate ? date(item.endDate) : "Sin fin"}
                      </span>
                    )}

                    {item.hasFile && (
                      <div className="flex justify-end pt-1">
                        <Button
                          secondary
                          disabled={downloadingId === item.id}
                          onClick={() =>
                            void handleDownload(item.id, item.fileName)
                          }
                        >
                          <Icon name="download" size={16} />
                          {downloadingId === item.id
                            ? "Descargando…"
                            : "Descargar"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {capacity && !capacity.canSubmit ? (
              <p className="pn-info" role="status">
                <Icon name="block" size={16} />
                <span>
                  {capacity.blockedReason ??
                    "No es posible registrar más evidencias para este indicador."}
                </span>
              </p>
            ) : (
              <form
                className="pn-form flex flex-col gap-3"
                onSubmit={(e) => void handleEvidenceSubmit(e)}
                noValidate
              >
                <label className="pn-upload">
                  <Icon name="upload_file" size={22} />
                  <strong>
                    {evidenceFile
                      ? evidenceFile.name
                      : "Archivo de evidencia"}
                  </strong>
                  <span>
                    {evidenceFile
                      ? `${(evidenceFile.size / 1024).toFixed(1)} KB`
                      : "PDF, Word, Excel, imagen o ZIP (máx. 50 MB)"}
                  </span>
                  <input
                    key={evidenceFileKey}
                    type="file"
                    aria-label="Archivo de evidencia"
                    accept={EVIDENCE_ACCEPT}
                    onChange={handleFileChange}
                    disabled={submittingEvidence}
                  />
                </label>

                <label>
                  Descripción de la evidencia (opcional)
                  <textarea
                    rows={2}
                    maxLength={255}
                    placeholder="Describe brevemente el soporte adjunto..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submittingEvidence}
                  />
                </label>

                <div className="form-two">
                  <label>
                    Fecha inicio
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={submittingEvidence}
                    />
                  </label>
                  <label>
                    Fecha fin
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={submittingEvidence}
                    />
                  </label>
                </div>

                {evidenceError && (
                  <p className="pn-info" role="alert">
                    <Icon name="error_outline" size={16} />
                    <span>{evidenceError}</span>
                  </p>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={!evidenceFile || submittingEvidence}
                  >
                    <Icon name="cloud_upload" size={17} />
                    {submittingEvidence
                      ? "Subiendo evidencia…"
                      : "Subir evidencia"}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      <section aria-label="Comentarios del indicador" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="!m-0">Comentarios</h3>
          <Badge>{`${commentItems.length} comentario${commentItems.length === 1 ? "" : "s"}`}</Badge>
        </div>

        <form
          className="pn-form flex flex-col gap-3 mb-4"
          onSubmit={(e) => void handleCommentSubmit(e)}
          noValidate
        >
          <label>
            Nuevo comentario
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="Escribe un comentario..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              disabled={submittingComment}
            />
          </label>

          {commentError && (
            <p className="pn-info" role="alert">
              <Icon name="error_outline" size={16} />
              <span>{commentError}</span>
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!commentText.trim() || submittingComment}
            >
              <Icon name="send" size={16} />
              {submittingComment ? "Enviando…" : "Enviar comentario"}
            </Button>
          </div>
        </form>

        {comments.state.status === "loading" && !comments.state.data ? (
          <LoadingNote label="Cargando comentarios…" />
        ) : comments.state.status === "error" && !comments.state.data ? (
          <SectionError
            error={comments.state.error ?? "No se pudieron cargar los comentarios."}
            restricted={comments.state.errorStatus === 403}
            onRetry={comments.reload}
          />
        ) : commentItems.length === 0 ? (
          <p className="pn-info" role="status">
            <Icon name="chat_bubble_outline" size={16} />
            <span>Sin comentarios aún. Sé el primero en comentar.</span>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {commentItems.map((comment) => (
              <article
                key={comment.id}
                className="pn-panel p-4 flex flex-col gap-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">
                    {comment.authorName ?? "Usuario"}
                  </strong>
                  <Badge>
                    {isEvaluatorRole(comment.authorRole)
                      ? "Evaluador"
                      : "Colaborador"}
                  </Badge>
                </div>
                <p className="!my-1 whitespace-pre-wrap break-words">
                  {comment.commentText}
                </p>
                <span className="small-muted">
                  {formatMoment(comment.createdAt)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
