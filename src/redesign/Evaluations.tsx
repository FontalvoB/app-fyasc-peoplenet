import { useChatViewport } from "./DetailSheet";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { performanceEvaluationEnabled } from "../lib/feature-flags";
import {
  Icon,
  Badge,
  PageHero,
  SectionTitle,
  Button,
  Modal,
  SectionError,
  LoadingNote,
} from "./shared";
import {
  useApi,
  sessionEmployeeId,
  sessionCanUseNanabot,
  getEvaluation,
  getAutoevalRef,
  submitEvaluation,
  postChat,
  toApiError,
} from "../lib/api";
import type {
  ChatResponse,
  EvaluationResponse,
  EvaluationsPagedResponse,
  EvalPeriod,
} from "../lib/api-types";
import {
  M7_BLOQUES,
  M7_ESCALA,
  computeM7GlobalScore,
  m7NewUuid,
} from "../lib/evaluacion-bot";

/**
 * M7 — Evaluaciones + Eva con contratos reales de kpis-ms.
 *
 * - Listado: GET /api/evaluations?evaluatedId={employeeId}&periodName={name}
 *   (para usuarios planos el backend fuerza evaluatedId propio; nosotros
 *   además lo enviamos explícito). Distinción AUTO pendiente/completada REAL.
 * - Completada: resultado real guardado (globalScore/100, fecha, calibración
 *   opcional finalScore/calibratedByName) — nunca una simulación.
 * - Eva de evaluación (chat guiado determinista, SIN LLM): cuestionario REAL
 *   del web (3 bloques × 5 criterios, escala 1-4, pesos 0.5/0.3/0.2),
 *   comentario por bloque y narrativa de 4 claves; POST /api/evaluations con
 *   uuid estable por intento y periodId real; globalScore con la fórmula
 *   exacta del web (verificada a mano contra el fixture: 51/100).
 * - Nanabot (asistente de consulta): SOLO ADMIN/SUPER_ADMIN (el backend
 *   resuelve el rol desde BD); para usuarios planos ni siquiera se envía la
 *   petición. Capacidad "Eva para todos" = pendiente, no se simula.
 */

/** Períodos activos (contrato M2 reutilizado). */
function useActivePeriod() {
  const periods = useApi<EvalPeriod[]>("/evaluations/periods");
  const activePeriod =
    periods.state.data?.find((p) => p.isActive === true) ?? null;
  return { periods, activePeriod };
}

export function Evaluations() {
  const employeeId = sessionEmployeeId();
  const { periods, activePeriod } = useActivePeriod();

  // Listado real paginado del período activo (fuerza evaluatedId propio).
  const list = useApi<EvaluationsPagedResponse>(
    employeeId != null && activePeriod?.name
      ? `/evaluations?evaluatedId=${employeeId}&periodName=${encodeURIComponent(
          activePeriod.name,
        )}&page=0&size=20`
      : null,
  );

  const rows = list.state.data?.content ?? [];
  const auto = rows.find((e) => e.evaluationType === "AUTO") ?? null;
  const autoCompleted = auto?.uuid != null && auto.status === "COMPLETED";

  return (
    <>
      <PageHero
        eyebrow="CRECER EMPIEZA POR CONOCERTE"
        title="Tu desarrollo, en primer plano."
        description="Haz una pausa, reconoce tus logros y descubre nuevas oportunidades."
      />
      <section className="pn-evaluation-hero human-evaluation-hero">
        <div>
          <span className="pn-eyebrow">
            {activePeriod ? `CICLO ${activePeriod.name}` : "SIN CICLO ACTIVO"}
          </span>
          <h2>
            Una conversación contigo.
            <br />
            Un paso hacia tu mejor versión.
          </h2>
          {employeeId != null && list.state.status !== "loading" && (
            <span className="human-inline-status">
              <Icon
                name={autoCompleted ? "check_circle" : "assignment"}
                size={17}
              />
              {autoCompleted
                ? "Autoevaluación completada"
                : "Autoevaluación pendiente"}
            </span>
          )}
          <p>
            Eva te acompaña en una autoevaluación sencilla.
            <br />
            Reflexiona sobre tu colaboración, tus resultados y tu crecimiento.
          </p>
          {/* FIX A (FIX-1): admin sin employeeId → mensaje real, sin ofrecer comenzar */}
          {employeeId == null ? (
            <span className="pn-info">
              La autoevaluación requiere un colaborador asociado a tu usuario.
            </span>
          ) : autoCompleted ? (
            <Link className="pn-button" to="/dashboard/evaluations/chat">
              Ver mi autoevaluación guardada
              <Icon name="arrow_forward" size={18} />
            </Link>
          ) : activePeriod?.id != null ? (
            <Link className="pn-button" to="/dashboard/evaluations/chat">
              Comenzar mi autoevaluación
              <Icon name="arrow_forward" size={18} />
            </Link>
          ) : (
            <span className="pn-info">
              {periods.state.status === "loading"
                ? "Consultando el período de evaluación…"
                : periods.state.status === "error"
                  ? periods.state.error
                  : "Por ahora no hay un período de evaluación activo."}
            </span>
          )}
          <span className="evaluation-duration">
            <Icon name="schedule" size={16} /> Aproximadamente 5 minutos
          </span>
        </div>
        <img
          className="human-reflection-photo"
          src="/images/people/reflection.jpg"
          alt="Una profesional dedicando un momento a reflexionar y escribir"
          width="1536"
          height="1024"
        />
      </section>

      {list.state.status === "error" ? (
        <SectionError
          error={list.state.error ?? "Sin dato"}
          restricted={list.state.errorStatus === 403}
          onRetry={list.reload}
        />
      ) : list.state.status === "loading" && list.state.data == null ? (
        <LoadingNote label="Consultando tu autoevaluación…" />
      ) : auto != null && autoCompleted ? (
        <AutoResultPanel auto={auto} />
      ) : list.state.status === "success" ? (
        <div className="pn-empty">
          <Icon name="flag" size={30} />
          <h3>Autoevaluación pendiente</h3>
          <p>
            Todavía no registras una autoevaluación para{" "}
            {activePeriod?.name ?? "este período"}.
          </p>
        </div>
      ) : null}

      <SectionTitle title="Tu ruta de desarrollo" />
      <div className="pn-three-grid">
        <section className="pn-panel development-card">
          <span className="development-number">01</span>
          <h3>Reconoce tus logros</h3>
          <p>Reflexiona sobre lo que has construido este período.</p>
          <span>Autoevaluación</span>
          <Badge>{autoCompleted ? "Completada" : "Pendiente"}</Badge>
        </section>
        <section className="pn-panel development-card">
          <span className="development-number">02</span>
          <h3>Escucha otras perspectivas</h3>
          <p>Tu líder te acompañará con retroalimentación útil.</p>
          <span>Conversación con tu líder</span>
          <Badge>Pendiente</Badge>
        </section>
        <section className="pn-panel development-card">
          <span className="development-number">03</span>
          <h3>Traza tu siguiente paso</h3>
          <p>Define acciones concretas para seguir creciendo.</p>
          <span>Plan de desarrollo</span>
          <Badge>Pendiente</Badge>
        </section>
      </div>
    </>
  );
}

/** Panel del resultado REAL de la autoevaluación guardada en el servidor. */
function AutoResultPanel({ auto }: { auto: EvaluationResponse }) {
  const [detail, setDetail] = useState<EvaluationResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function openDetail() {
    if (!auto.uuid) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      setDetail(await getEvaluation(auto.uuid));
    } catch (error) {
      setDetailError(toApiError(error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <section className="pn-panel evaluation-result">
      <div>
        <span className="pn-eyebrow">TU AUTOEVALUACIÓN DEL PERÍODO</span>
        <h3>
          {auto.globalScore != null
            ? `${auto.globalScore.toLocaleString("es-CO")} / 100`
            : "Sin puntaje registrado"}{" "}
          · Cada reflexión es un avance.
        </h3>
        <p className="small-muted">
          Registrada el{" "}
          {auto.createdAt ? auto.createdAt.split("T")[0] : "sin fecha"} ·
          Estado: {auto.status ?? "sin dato"}
        </p>
        {auto.finalScore != null && (
          <p className="pn-info">
            <Icon name="balance" size={15} /> Calibrada por{" "}
            {auto.calibratedByName ?? "sin dato"}:{" "}
            {auto.finalScore.toLocaleString("es-CO")} / 100
          </p>
        )}
        <Button secondary onClick={openDetail} disabled={detailLoading}>
          {detailLoading ? "Cargando detalle…" : "Ver detalle guardado"}
          <Icon name="arrow_forward" size={16} />
        </Button>
        {detailError && (
          <p role="alert" className="pn-info">
            {detailError}
          </p>
        )}
      </div>
      {detail && (
        <Modal
          title="Tu autoevaluación"
          status={<Badge>{detail.status ?? "Sin dato"}</Badge>}
          close={() => setDetail(null)}
        >
          <dl className="pn-details">
            <dt>Puntaje global</dt>
            <dd>
              {detail.globalScore != null
                ? `${detail.globalScore}/100`
                : "Sin dato"}
            </dd>
            {detail.finalScore != null && (
              <>
                <dt>Calibración</dt>
                <dd>
                  {detail.finalScore}/100 ·{" "}
                  {detail.calibratedByName ?? "Sin dato"}
                </dd>
              </>
            )}
          </dl>
          {M7_BLOQUES.map((bloque) => {
            const values = bloque.criterios
              .map((c) => detail.scores?.[c.id])
              .filter((v): v is number => typeof v === "number");
            if (!values.length) return null;
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return (
              <div className="pn-info" key={bloque.id}>
                <strong>{bloque.nombre}</strong> · {values.length} criterios ·
                promedio{" "}
                {avg.toLocaleString("es-CO", { maximumFractionDigits: 1 })} / 4
                <div className="evaluation-scores">
                  {values.map((v, i) => (
                    <span key={`${bloque.id}-${i}`}>
                      {bloque.criterios[i]?.id ?? i} <strong>{v}/4</strong>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {detail.comments &&
            Object.entries(detail.comments)
              .filter(([, text]) => Boolean(text))
              .map(([key, text]) => (
                <p className="pn-info" key={key}>
                  <strong>Comentario ({key}):</strong> {text}
                </p>
              ))}
          {detail.narrative && (
            <dl className="pn-details">
              {(
                [
                  ["Fortalezas", detail.narrative.fortalezas],
                  ["Oportunidades", detail.narrative.oportunidades],
                  ["Compromisos", detail.narrative.compromisos],
                  ["Retroalimentación", detail.narrative.retroalimentacion],
                ] as Array<[string, string | null]>
              ).map(([label, value]) =>
                value ? (
                  <>
                    <dt key={label}>{label}</dt>
                    <dd>{value}</dd>
                  </>
                ) : null,
              )}
            </dl>
          )}
        </Modal>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat — Eva de evaluación (guiada, sin LLM) y asistente Nanabot (admin)
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "eva" | "user";
  text: string;
}

type EvaStep =
  | { kind: "criterio"; bloqueIdx: number; criterioIdx: number }
  | { kind: "comentario"; bloqueIdx: number }
  | { kind: "narrativa"; nIdx: number }
  | { kind: "resumen" };

/** Construye la secuencia plana de pasos del cuestionario real. */
function buildEvaSteps(): EvaStep[] {
  const steps: EvaStep[] = [];
  M7_BLOQUES.forEach((_, bloqueIdx) => {
    for (let criterioIdx = 0; criterioIdx < 5; criterioIdx += 1) {
      steps.push({ kind: "criterio", bloqueIdx, criterioIdx });
    }
    steps.push({ kind: "comentario", bloqueIdx });
  });
  for (let nIdx = 0; nIdx < 4; nIdx += 1) {
    steps.push({ kind: "narrativa", nIdx });
  }
  steps.push({ kind: "resumen" });
  return steps;
}

const NARRATIVE_FIELDS = [
  { key: "fortalezas", label: "¿Cuáles son tus principales fortalezas?" },
  { key: "oportunidades", label: "¿Qué oportunidades de mejora identificas?" },
  { key: "compromisos", label: "¿Qué compromisos concretos asumes?" },
  {
    key: "retroalimentacion",
    label: "¿Algo más que quieras retroalimentar? (opcional)",
  },
] as const;

export function Chat({ evaluation = false }: { evaluation?: boolean }) {
  return evaluation ? <EvaChat /> : <NanabotChat />;
}

/** Eva de autoevaluación: flujo determinista → POST /api/evaluations. */
function EvaChat() {
  const chatRef = useChatViewport();
  const employeeId = sessionEmployeeId();
  const { periods, activePeriod } = useActivePeriod();

  const steps = useMemo(buildEvaSteps, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<EvaluationResponse | null>(null);
  const [saveError, setSaveError] = useState("");
  const [alreadyDone, setAlreadyDone] = useState<EvaluationResponse | null>(
    null,
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.parentElement?.scrollTo({
      top: endRef.current.offsetTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [messages, stepIndex]);

  // Verificación de duplicado REAL al montar (autoeval-ref del período activo).
  useEffect(() => {
    if (employeeId == null || !activePeriod?.name) return undefined;
    let active = true;
    getAutoevalRef(employeeId, activePeriod.name)
      .then((ref) => {
        if (active) setAlreadyDone(ref);
      })
      .catch(() => {
        // 404/403 u otros fallos: el POST del final valida duplicados en el
        // servidor; el flujo continúa (sin simulación).
        if (active) setAlreadyDone(null);
      });
    return () => {
      active = false;
    };
  }, [employeeId, activePeriod?.name]);

  // Mensaje de bienvenida cuando ya hay período.
  useEffect(() => {
    if (!activePeriod) return;
    setMessages((prev) => {
      if (prev.length) return prev;
      return [
        {
          role: "eva",
          text: `Hola. Soy Eva y te acompaño en tu autoevaluación del período ${
            activePeriod.name ?? "activo"
          }. Son 15 criterios en 3 bloques; después reflexionamos juntos. Vamos con el primero.`,
        },
      ];
    });
  }, [activePeriod]);

  const step = steps[stepIndex] ?? { kind: "resumen" };
  const totalSteps = steps.length;

  function nextStep(): void {
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }

  function pushMessage(text: ChatMessage): void {
    setMessages((prev) => [...prev, text]);
  }

  function rate(value: number): void {
    if (step.kind !== "criterio" || submitting) return;
    const bloque = M7_BLOQUES[step.bloqueIdx];
    const criterio = bloque.criterios[step.criterioIdx];
    if (!criterio) return;
    pushMessage({ role: "user", text: `${value} · ${criterio.id}` });
    setScores((prev) => ({ ...prev, [criterio.id]: value }));
    const level = M7_ESCALA.find((e) => e.value === value);
    pushMessage({
      role: "eva",
      text: level
        ? `${level.label} registrado en ${bloque.nombre}. ${
            step.criterioIdx < 4
              ? "Seguimos con el siguiente criterio."
              : "Cerramos este bloque: ¿quieres dejar un comentario?"
          }`
        : "Registrado.",
    });
    nextStep();
  }

  function sendText(event: FormEvent): void {
    event.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;
    if (step.kind === "criterio") return; // los criterios van por botones
    if (step.kind === "comentario") {
      const bloque = M7_BLOQUES[step.bloqueIdx];
      pushMessage({ role: "user", text });
      if (text !== "-" && text !== "no") {
        setComments((prev) => ({ ...prev, [bloque.id]: text }));
        pushMessage({
          role: "eva",
          text: "Comentario guardado para este bloque. Pasamos al siguiente bloque.",
        });
      } else {
        pushMessage({
          role: "eva",
          text: "Sin comentario para este bloque. Pasamos al siguiente.",
        });
      }
      setInput("");
      nextStep();
      return;
    }
    if (step.kind === "narrativa") {
      const field = NARRATIVE_FIELDS[step.nIdx];
      pushMessage({ role: "user", text });
      setNarrative((prev) => ({ ...prev, [field.key]: text }));
      pushMessage({
        role: "eva",
        text:
          step.nIdx < 3
            ? "Registrado. Reflexionemos lo siguiente:"
            : "Última reflexión lista. Revisa tu resumen y guarda.",
      });
      setInput("");
      nextStep();
      return;
    }
  }

  async function save(): Promise<void> {
    if (submitting || employeeId == null || activePeriod?.id == null) return;
    setSubmitting(true);
    setSaveError("");
    try {
      const payloadScores = { ...scores };
      const global = computeM7GlobalScore(payloadScores);
      const response = await submitEvaluation({
        uuid: m7NewUuid(),
        evaluationType: "AUTO",
        evaluatorEmployeeId: employeeId,
        evaluatedEmployeeId: employeeId,
        periodId: activePeriod.id,
        periodName: activePeriod.name ?? "",
        globalScore: global,
        refAutoevalUuid: null,
        scores: payloadScores,
        comments: { ...comments },
        narrative: {
          fortalezas: narrative.fortalezas ?? "",
          oportunidades: narrative.oportunidades ?? "",
          compromisos: narrative.compromisos ?? "",
          retroalimentacion: narrative.retroalimentacion ?? "",
        },
      });
      setSaved(response);
      pushMessage({
        role: "eva",
        text: `Guardada en el servidor: ${
          response.uuid ?? ""
        } · puntaje ${response.globalScore ?? global}/100 · estado ${
          response.status ?? "COMPLETED"
        }.`,
      });
    } catch (error) {
      const apiError = toApiError(error);
      setSaveError(
        apiError.isTimeout
          ? `${apiError.message} Antes de reintentar, verifica en Evaluaciones si tu autoevaluación ya quedó registrada.`
          : apiError.message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Duplicado detectado: mostrar el resultado real, no iniciar otro intento.
  if (alreadyDone) {
    return (
      <BlockedEva
        title="Ya completaste tu autoevaluación"
        message={`El período ${
          activePeriod?.name ?? "activo"
        } ya tiene tu autoevaluación registrada (global ${
          alreadyDone.globalScore ?? "sin dato"
        }/100, registrada el ${
          alreadyDone.createdAt?.split("T")[0] ?? "sin fecha"
        }). No se permite duplicar; puedes revisarla desde la página de evaluaciones.`}
      />
    );
  }

  if (employeeId == null) {
    return (
      <BlockedEva
        title="Usuario sin colaborador asociado"
        message="La autoevaluación requiere un colaborador asociado a tu usuario."
      />
    );
  }

  if (!activePeriod) {
    return (
      <BlockedEva
        title="Sin período de evaluación activo"
        message={
          periods.state.status === "loading"
            ? "Consultando los períodos del servidor…"
            : "No hay un período de evaluación activo en este momento. Vuelve cuando Gestión Humana abra el ciclo."
        }
      />
    );
  }

  const currentBloque =
    step.kind === "criterio" || step.kind === "comentario"
      ? M7_BLOQUES[step.bloqueIdx]
      : null;
  const currentCriterio =
    step.kind === "criterio"
      ? currentBloque?.criterios[step.criterioIdx]
      : null;

  return (
    <>
      <PageHero
        eyebrow="UN MOMENTO PARA REFLEXIONAR"
        title="Tu autoevaluación con Eva"
        description="Reflexiona a tu ritmo. Solo guardaremos tus respuestas cuando confirmes al final."
      />
      <div className="pn-chat-layout">
        <section ref={chatRef} className="pn-panel pn-chat">
          <header>
            <span className="spark">
              <Icon name="auto_awesome" />
            </span>
            <div>
              <strong>Eva · Autoevaluación</strong>
              <small>
                <i /> {activePeriod.name}
              </small>
            </div>
            <Badge>{saved ? "Guardada" : "En curso"}</Badge>
          </header>
          <div className="chat-messages" aria-live="polite">
            {messages.map((m, i) => (
              <div className={`chat-message ${m.role}`} key={i}>
                {m.role === "eva" && (
                  <span className="chat-eva">
                    <Icon name="auto_awesome" size={17} />
                  </span>
                )}
                <div>{m.text}</div>
              </div>
            ))}
            <div ref={endRef} />
            <section className="eva-question" aria-label="Pregunta actual">
              <span className="pn-badge blue">
                Paso {stepIndex + 1} de {totalSteps}
              </span>
              {currentCriterio ? (
                <div className="pn-info">
                  <strong>
                    {
                      M7_BLOQUES[step.kind === "criterio" ? step.bloqueIdx : 0]
                        .nombre
                    }
                  </strong>
                  <p>{currentCriterio.texto}</p>
                  {[1, 2, 3, 4].map((n) => (
                    <p key={n}>
                      <strong>{n}:</strong> {currentCriterio.ejemplos[n]}
                    </p>
                  ))}
                </div>
              ) : null}
              {step.kind === "comentario" && (
                <h3>
                  ¿Quieres añadir un comentario sobre {currentBloque?.nombre}?
                </h3>
              )}
              {step.kind === "narrativa" && (
                <h3>{NARRATIVE_FIELDS[step.nIdx].label}</h3>
              )}
              {step.kind === "resumen" && (
                <h3>
                  Tu reflexión está lista. Revisa tus respuestas antes de
                  guardar.
                </h3>
              )}
            </section>
          </div>
          {saved ? (
            <Link className="pn-button" to="/dashboard/evaluations">
              Volver a evaluaciones <Icon name="check" />
            </Link>
          ) : step.kind === "criterio" ? (
            <div className="chat-ratings">
              {M7_ESCALA.map((e) => (
                <button
                  key={e.value}
                  aria-label={`${e.value} · ${e.label}`}
                  title={currentCriterio?.ejemplos[e.value]}
                  onClick={() => rate(e.value)}
                >
                  <strong>{e.value}</strong>
                  <span>{e.label}</span>
                </button>
              ))}
              <span>
                Escala 1-4:{" "}
                {currentCriterio
                  ? `${M7_ESCALA[0].label} · … · ${M7_ESCALA[3].label}`
                  : ""}
              </span>
            </div>
          ) : step.kind === "resumen" ? (
            <Button onClick={save} disabled={submitting}>
              {submitting
                ? "Guardando…"
                : `Guardar mi autoevaluación (${computeM7GlobalScore(scores)}/100)`}
              <Icon name="send" size={18} />
            </Button>
          ) : (
            <form className="chat-input" onSubmit={sendText}>
              <input
                aria-label="Mensaje para Eva"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  step.kind === "comentario"
                    ? "Comentario del bloque (o escribe '-' para omitir)…"
                    : "Escribe tu reflexión…"
                }
              />
              <button disabled={!input.trim()} aria-label="Enviar mensaje">
                <Icon name="arrow_upward" />
              </button>
            </form>
          )}
          {saveError && (
            <p role="alert" className="pn-info">
              {saveError}
            </p>
          )}
          <p className="chat-disclaimer">
            Tus respuestas permanecen en esta sesión hasta que elijas guardar.
          </p>
        </section>
        <aside className="pn-chat-aside">
          <Icon name="target" size={30} />
          <h2>Tu perspectiva importa.</h2>
          <p>
            No hay respuestas perfectas. Piensa en ejemplos de tu día a día.
          </p>
          <div className="pn-progress">
            <i
              style={{
                width: `${Math.round((stepIndex / totalSteps) * 100)}%`,
              }}
            />
          </div>
          <p className="small-muted">
            Paso {Math.min(stepIndex + 1, totalSteps)} de {totalSteps} ·{" "}
            {Object.keys(scores).length}/15 criterios calificados
          </p>
        </aside>
      </div>
    </>
  );
}

/** Eva bloqueada: mensajes de estado sin inventar flujos. */
function BlockedEva({ title, message }: { title: string; message: string }) {
  return (
    <>
      <PageHero
        eyebrow="UN MOMENTO PARA REFLEXIONAR"
        title={title}
        description="Eva te acompaña cuando el ciclo esté disponible."
      />
      <div className="pn-empty">
        <Icon name="info" size={30} />
        <h3>{title}</h3>
        <p>{message}</p>
        <Link className="pn-button" to="/dashboard/evaluations">
          Volver a evaluaciones <Icon name="arrow_forward" size={17} />
        </Link>
      </div>
    </>
  );
}

function isEvaluationSuggestion(text: string): boolean {
  return /\b(?:evabot|autoevaluaci[oó]n(?:es)?|(?:evaluaci[oó]n|evaluaciones|calificaci[oó]n) del? desempe[nñ]o|per[ií]odos? de evaluaci[oó]n)\b/i.test(text);
}

/** Nanabot: asistente de consulta; SOLO ADMIN/SUPER_ADMIN (backend 403). */
function NanabotChat() {
  const chatRef = useChatViewport();
  const canUse = sessionCanUseNanabot();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "eva",
      text: canUse
        ? "Hola. Soy Nanabot, el asistente de consulta de la plataforma. ¿Qué necesitas revisar?"
        : "El asistente de consulta está disponible próximamente. Por ahora responde tus preguntas la página de cada módulo.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(text: string): Promise<void> {
    const message = text.trim();
    if (!message || busy) return;
    if (!canUse) return; // colaborador ordinario NO envía la petición
    const history = messages.slice(-6).map((m) => ({
      role: m.role === "eva" ? "assistant" : "user",
      text: m.text,
    }));
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const response = await postChat({
        message,
        language: "es",
        history,
        context: {
          currentRoute: "/dashboard/assistant",
          currentModule: "assistant",
        },
      });
      setMessages((prev) => [...prev, renderBotReply(response)]);
      setSuggestions((response.suggestions ?? []).filter(
        (suggestion) => performanceEvaluationEnabled || !isEvaluationSuggestion(suggestion),
      ));
    } catch (error) {
      const apiError = toApiError(error);
      setMessages((prev) => [
        ...prev,
        { role: "eva", text: `No pude responder: ${apiError.message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function renderBotReply(response: ChatResponse): ChatMessage {
    let text = response.reply ?? "(respuesta vacía del servidor)";
    if (response.source === "local-fallback" && response.failureReason) {
      text += "\n\n(Respuesta de la base local: Claude no estuvo disponible.)";
    } else if (response.source === "local") {
      text += "\n\n(Respuesta de la base de conocimiento local.)";
    }
    const linkLabels = (response.links ?? [])
      .filter((link) => performanceEvaluationEnabled || !(
        /^(?:\/dashboard)?\/evaluations(?:[\/?#]|$)/i.test(link.path ?? "") ||
        isEvaluationSuggestion(link.label ?? "")
      ))
      .map((link) => link.label)
      .filter(Boolean);
    if (linkLabels.length) {
      text += `\n\nMódulos relacionados: ${linkLabels.join(", ")}.`;
    }
    return { role: "eva", text };
  }

  if (!canUse) {
    return (
      <>
        <PageHero
          eyebrow="UN POCO DE AYUDA, MUCHAS POSIBILIDADES"
          title={performanceEvaluationEnabled ? "Hola, soy Eva." : "Asistente de consulta"}
          description="El asistente de consulta está reservado a perfiles de administración por ahora."
        />
        <div className="pn-empty">
          <Icon name="auto_awesome" size={30} />
          <h3>Asistente no disponible para tu rol</h3>
          <p>
            Nanabot solo consulta para perfiles ADMIN/SUPER_ADMIN. La
            disponibilidad del asistente de consulta para todos los colaboradores
            requiere un backend autorizado (capacidad pendiente del plan).
          </p>
          <Link className="pn-button" to="/dashboard">
            Volver al inicio <Icon name="arrow_forward" size={17} />
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="UN POCO DE AYUDA, MUCHAS POSIBILIDADES"
        title="Hola, soy Nanabot."
        description="Asistente de consulta con las herramientas de la plataforma."
      />
      <div className="pn-chat-layout">
        <section ref={chatRef} className="pn-panel pn-chat">
          <header>
            <span className="spark">
              <Icon name="auto_awesome" />
            </span>
            <div>
              <strong>Nanabot · Consulta</strong>
              <small>
                <i /> Disponible
              </small>
            </div>
            <Badge>Admin</Badge>
          </header>
          <div className="chat-messages" aria-live="polite">
            {messages.map((m, i) => (
              <div className={`chat-message ${m.role}`} key={i}>
                {m.role === "eva" && (
                  <span className="chat-eva">
                    <Icon name="auto_awesome" size={17} />
                  </span>
                )}
                <div>{m.text}</div>
              </div>
            ))}
            {busy && <LoadingNote label="Consultando al asistente…" />}
            <div ref={endRef} />
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              aria-label="Mensaje para Nanabot"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta de consulta…"
            />
            <button
              disabled={!input.trim() || busy}
              aria-label="Enviar mensaje"
            >
              <Icon name="arrow_upward" />
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="chat-ratings">
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  disabled={busy}
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <p className="chat-disclaimer">
            Consulta · Las escrituras de negocio no se hacen por el chat.
          </p>
        </section>
        <aside className="pn-chat-aside">
          <Icon name="tips_and_updates" size={30} />
          <h2>¿Por dónde empezamos?</h2>
          <p>Ejemplos de consulta real:</p>
          {[
            "¿Cómo van los indicadores del área de Gestión Humana?",
            "Busca al empleado ANGEL PRUEBA RODRIGUEZ",
            "¿Qué solicitudes hay pendientes?",
          ].map((q) => (
            <button key={q} onClick={() => void send(q)} disabled={busy}>
              {q}
              <Icon name="arrow_forward" size={17} />
            </button>
          ))}
        </aside>
      </div>
    </>
  );
}
