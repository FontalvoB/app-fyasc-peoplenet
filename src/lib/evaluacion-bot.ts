import { kpis, teamMembers, type Kpi } from './mock-data'

export const EVALUATION_PERIOD = 'Julio - Diciembre 2026'

export type EvalFlow = 'menu' | 'self' | 'team' | 'periods' | 'questions' | 'summary'

export interface EvalMenuOption {
  id: string
  icon: string
  iconBg: string
  title: string
  subtitle: string
  flow: EvalFlow
}

export const evalMenuOptions: EvalMenuOption[] = [
  {
    id: 'self',
    icon: 'front_hand',
    iconBg: 'bg-brand-blue/10 text-brand-blue',
    title: 'Mi autoevaluación',
    subtitle: 'Evalúa tus propios KPIs del período',
    flow: 'self',
  },
  {
    id: 'team',
    icon: 'group',
    iconBg: 'bg-violet-100 text-violet-600',
    title: 'Evaluar a un colaborador',
    subtitle: 'Revisa el desempeño de tu equipo',
    flow: 'team',
  },
  {
    id: 'periods',
    icon: 'settings',
    iconBg: 'bg-slate-100 text-slate-600',
    title: 'Administrar períodos',
    subtitle: 'Configura ventanas de evaluación',
    flow: 'periods',
  },
]

export interface EvalQuestion {
  id: string
  kpiId: string
  kpiName: string
  category: string
  prompt: string
  hint: string
}

export function getSelfEvalQuestions(): EvalQuestion[] {
  return kpis.map(kpi => ({
    id: `q-${kpi.id}`,
    kpiId: kpi.id,
    kpiName: kpi.name,
    category: kpi.category,
    prompt: `¿Cómo calificarías tu desempeño en "${kpi.name}"?`,
    hint: `Meta: ${kpi.target}${kpi.unit} · Avance actual: ${kpi.progress.toFixed(0)}%`,
  }))
}

export function getTeamEvalQuestions(memberId: string): EvalQuestion[] {
  const member = teamMembers.find(m => m.id === memberId)
  if (!member) return []
  return member.kpis.map(kpi => ({
    id: `q-${memberId}-${kpi.id}`,
    kpiId: kpi.id,
    kpiName: kpi.name,
    category: kpi.category,
    prompt: `Evalúa a ${member.name.split(' ')[0]} en "${kpi.name}"`,
    hint: `Meta: ${kpi.target}${kpi.unit} · Avance: ${kpi.progress.toFixed(0)}%`,
  }))
}

export interface EvalAnswer {
  questionId: string
  score: number
  comment: string
}

export function computeSummary(answers: EvalAnswer[], questions: EvalQuestion[]) {
  const avg = answers.length
    ? Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length)
    : 0
  const level =
    avg >= 85 ? { label: 'Alto desempeño', color: 'text-emerald-600', bg: 'bg-emerald-50' } :
    avg >= 70 ? { label: 'En desarrollo', color: 'text-amber-600', bg: 'bg-amber-50' } :
    { label: 'Requiere mejora', color: 'text-red-500', bg: 'bg-red-50' }

  return { avg, level, total: questions.length, answered: answers.length }
}

export function scoreToTrafficLight(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 85) return 'green'
  if (score >= 70) return 'yellow'
  return 'red'
}

export function formatKpiRef(kpi: Kpi) {
  if (kpi.unit === '$') return `$${(kpi.current / 1_000_000).toFixed(2)}M / $${(kpi.target / 1_000_000).toFixed(2)}M`
  return `${kpi.current}${kpi.unit} / ${kpi.target}${kpi.unit}`
}

// === M7 negocio (ownership: oc-wave0) — añadido al final, exports existentes intactos

/**
 * Config de negocio REAL de la autoevaluación, espejo del cuestionario del
 * web (kpi-management-plataform/src/app/features/performance-evaluation/
 * performance-evaluation-chatbot.component.ts, BLOQUES_FALLBACK). Es la
 * fuente de verdad del cuestionario: 3 bloques con pesos 0.5/0.3/0.2,
 * 15 criterios y escala 1-4. NO es un fixture demo ni se inventan criterios.
 * Códigos verificados contra el fixture backend (eval 9): a1..a5, c1..c5,
 * f1..f5; comments por bloque: funciones/competencias/actitud.
 */

export interface M7Criterio {
  id: string;
  texto: string;
  ejemplos: Record<number, string>;
}

export interface M7Bloque {
  id: string;
  nombre: string;
  peso: number;
  criterios: M7Criterio[];
}

export const M7_BLOQUES: ReadonlyArray<M7Bloque> = [
  {
    id: "funciones",
    nombre: "Cumplimiento de Funciones",
    peso: 0.5,
    criterios: [
      {
        id: "f1",
        texto: "Cumplimiento de las funciones del cargo según el manual de funciones",
        ejemplos: {
          1: "Omite funciones clave del manual y requiere que el líder le recuerde constantemente sus responsabilidades básicas.",
          2: "Cumple solo las funciones más visibles o urgentes; deja de lado tareas del manual que considera \u00absecundarias\u00bb.",
          3: "Ejecuta todas las funciones descritas en su manual de cargo de manera consistente, sin necesidad de recordatorios.",
          4: "Cumple el 100% de sus funciones y además identifica funciones no escritas que agregan valor a su rol.",
        },
      },
      {
        id: "f2",
        texto: "Cumplimiento de metas e indicadores asignados",
        ejemplos: {
          1: "No alcanza las metas del período (ej. nómina procesada, vacantes cerradas) y no explica las causas.",
          2: "Alcanza parcialmente sus indicadores (ej. 60–70% de la meta) con justificaciones recurrentes.",
          3: "Cumple consistentemente sus indicadores mensuales (ej. 100% de nómina liquidada a tiempo, vacantes en el SLA).",
          4: "Supera sus metas de forma sostenida (ej. cierra vacantes antes del plazo, reduce errores de nómina a cero).",
        },
      },
      {
        id: "f3",
        texto: "Entrega oportuna de informes y tareas (tiempo)",
        ejemplos: {
          1: "Entrega informes y tareas fuera de fecha de manera recurrente, afectando a otras áreas.",
          2: "Cumple los plazos la mayoría de las veces, pero pide prórrogas con frecuencia.",
          3: "Entrega sus informes (nómina, afiliaciones, reportes SST) siempre dentro del plazo acordado.",
          4: "Entrega anticipadamente y avisa a tiempo cuando detecta que algo puede retrasarse.",
        },
      },
      {
        id: "f4",
        texto: "Calidad y exactitud en las entregas (forma)",
        ejemplos: {
          1: "Sus entregas tienen errores frecuentes (cifras de nómina mal calculadas, datos incompletos) que otros deben corregir.",
          2: "Comete errores ocasionales que exigen revisión adicional del líder antes de radicar.",
          3: "Sus entregas son precisas y bien presentadas, cumpliendo el formato y estándar esperado.",
          4: "Sus entregas son impecables y sirven como modelo de referencia para el equipo.",
        },
      },
      {
        id: "f5",
        texto: "Capacidad de respuesta ante solicitudes urgentes o imprevistos",
        ejemplos: {
          1: "Se bloquea o ignora las solicitudes urgentes (ej. una novedad de nómina de última hora).",
          2: "Responde a los imprevistos, pero con demoras que generan tensión en el equipo.",
          3: "Atiende oportunamente los imprevistos sin descuidar sus tareas habituales.",
          4: "Se anticipa a posibles imprevistos y propone soluciones antes de que escalen.",
        },
      },
    ],
  },
  {
    id: "competencias",
    nombre: "Competencias",
    peso: 0.3,
    criterios: [
      {
        id: "c1",
        texto: "Conocimiento técnico del cargo y manejo de herramientas (Zeus/Siigo, Excel, normativa)",
        ejemplos: {
          1: "Desconoce funciones básicas de Zeus/Siigo o Excel y comete errores por falta de dominio de la normativa aplicable.",
          2: "Maneja lo básico de las herramientas, pero requiere apoyo constante para tareas de complejidad media.",
          3: "Domina las herramientas del cargo y aplica correctamente la normativa laboral vigente.",
          4: "Es referente técnico del equipo; enseña a otros y optimiza el uso de las herramientas.",
        },
      },
      {
        id: "c2",
        texto: "Comunicación efectiva",
        ejemplos: {
          1: "Sus mensajes son confusos o incompletos, generando reprocesos o malentendidos con el equipo o los colaboradores atendidos.",
          2: "Se comunica de forma correcta, aunque a veces omite información relevante o tarda en responder.",
          3: "Comunica de forma clara, oportuna y con el tono adecuado, de forma escrita y verbal.",
          4: "Su comunicación facilita la solución de conflictos y mejora la coordinación entre áreas.",
        },
      },
      {
        id: "c3",
        texto: "Análisis y resolución de problemas",
        ejemplos: {
          1: "Ante un problema, escala inmediatamente sin intentar analizarlo o proponer alternativas.",
          2: "Identifica el problema, pero necesita guía del líder para definir la solución.",
          3: "Analiza la causa raíz y propone soluciones efectivas de forma autónoma.",
          4: "Anticipa problemas potenciales y diseña soluciones que previenen que se repitan.",
        },
      },
      {
        id: "c4",
        texto: "Trabajo en equipo y colaboración",
        ejemplos: {
          1: "Trabaja de forma aislada, no comparte información y evita apoyar a sus compañeros.",
          2: "Colabora cuando se le pide, pero no toma la iniciativa de apoyar a otros.",
          3: "Colabora activamente con su equipo y otras áreas, compartiendo información de forma proactiva.",
          4: "Es un integrador del equipo; motiva la colaboración y ayuda a resolver fricciones entre compañeros.",
        },
      },
      {
        id: "c5",
        texto: "Organización y gestión del tiempo",
        ejemplos: {
          1: "No prioriza sus tareas; se ve constantemente desbordado y pierde el control de sus pendientes.",
          2: "Organiza su trabajo pero se ve afectado por interrupciones o urgencias que desordenan su agenda.",
          3: "Planifica y prioriza su carga de trabajo de forma efectiva, cumpliendo tiempos sin agobio.",
          4: "Gestiona su tiempo de forma ejemplar, incluso bajo alta carga, y ayuda a otros a organizarse.",
        },
      },
    ],
  },
  {
    id: "actitud",
    nombre: "Actitud y Cultura",
    peso: 0.2,
    criterios: [
      {
        id: "a1",
        texto: "Compromiso con la misión y los valores de FYA",
        ejemplos: {
          1: "Su actitud refleja desconexión con la misión institucional; antepone intereses personales sin justificación.",
          2: "Cumple lo mínimo esperado en relación con los valores, sin mostrar mayor identificación con la misión.",
          3: "Actúa de forma consistente con los valores institucionales en su día a día.",
          4: "Es un embajador visible de la misión y los valores de FYA, incluso fuera de su rol formal.",
        },
      },
      {
        id: "a2",
        texto: "Proactividad e iniciativa",
        ejemplos: {
          1: "Espera instrucciones para todo, incluso para tareas rutinarias ya conocidas.",
          2: "Toma iniciativa ocasionalmente, pero solo en tareas de bajo riesgo.",
          3: "Propone mejoras y actúa sin necesidad de que se le indique constantemente.",
          4: "Lidera iniciativas de mejora que impactan positivamente a su área o a otras.",
        },
      },
      {
        id: "a3",
        texto: "Actitud frente al cambio y la retroalimentación",
        ejemplos: {
          1: "Se resiste a los cambios y reacciona de forma defensiva ante la retroalimentación.",
          2: "Acepta el cambio y la retroalimentación, pero le cuesta aplicarla de forma consistente.",
          3: "Recibe la retroalimentación de forma abierta y ajusta su comportamiento con rapidez.",
          4: "Busca activamente retroalimentación y se adapta a los cambios con una actitud ejemplar.",
        },
      },
      {
        id: "a4",
        texto: "Respeto y relacionamiento con el equipo",
        ejemplos: {
          1: "Sus interacciones generan tensión o incomodidad en el equipo (tono, trato, comentarios).",
          2: "Mantiene un trato correcto, aunque a veces es distante o poco empático.",
          3: "Se relaciona con respeto y empatía con todo el equipo, sin distinción de cargos o áreas.",
          4: "Es reconocido por el equipo como una persona que fortalece el ambiente laboral y la confianza.",
        },
      },
      {
        id: "a5",
        texto: "Vocación de servicio hacia los programas que atendemos (PAE, Armada, Centros Penitenciarios)",
        ejemplos: {
          1: "Muestra poca disposición o sensibilidad al atender los programas sociales que gestiona FYA.",
          2: "Atiende los programas de forma correcta, pero sin ir más allá de lo estrictamente solicitado.",
          3: "Atiende con calidez y compromiso a los beneficiarios de PAE, Armada y Centros Penitenciarios.",
          4: "Su vocación de servicio es un ejemplo que eleva la calidad de atención de todo el programa.",
        },
      },
    ],
  },
];

/** Escala real 1-4 del web (BLOQUES_FALLBACK/ESCALA_FALLBACK). */
export const M7_ESCALA: ReadonlyArray<{
  value: number;
  label: string;
  sub: string;
}> = [
  { value: 1, label: "Insatisfactorio", sub: "Requiere plan inmediato" },
  { value: 2, label: "En desarrollo", sub: "Hay margen de mejora" },
  { value: 3, label: "Cumple lo esperado", sub: "Desempeño consistente" },
  { value: 4, label: "Sobresaliente", sub: "Fortaleza clave" },
];

/**
 * globalScore EXACTO del web (líneas 1884-1896): promedio simple de cada
 * bloque, ponderado por peso, normalizado a base 4 → /100.
 * Verificado a mano contra el fixture: f≈2.2×0.5 + c=2.0×0.3 + a≈1.6×0.2
 * → pond=2.02 → round(2.02/4×100)=51 = globalScore de la evaluación 9. ✓
 */
export function computeM7GlobalScore(
  scores: Record<string, number>,
  bloques: ReadonlyArray<M7Bloque> = M7_BLOQUES,
): number {
  let pond = 0;
  for (const bloque of bloques) {
    const n = bloque.criterios.length;
    if (n === 0) continue; // sin criterios → sin NaN
    const total = bloque.criterios.reduce(
      (acc, c) => acc + (scores[c.id] ?? 0),
      0,
    );
    pond += (total / n) * bloque.peso;
  }
  return Math.round((pond / 4) * 100);
}

/** Valida que cada criterio de la config tenga un score entero 1..4. */
export function validateM7Scores(scores: Record<string, number>): string {
  for (const bloque of M7_BLOQUES) {
    for (const criterio of bloque.criterios) {
      const value = scores[criterio.id];
      if (!Number.isInteger(value) || value < 1 || value > 4) {
        return `Falta calificar el criterio ${criterio.id} del bloque ${bloque.nombre}.`;
      }
    }
  }
  return "";
}

/** Clave de comentario por bloque: el web usa el id del bloque como key. */
export const M7_COMMENT_KEYS = ["funciones", "competencias", "actitud"] as const;

/** uuid estable por intento (web: 'auto-' + Date.now()). */
export function m7NewUuid(): string {
  return `auto-${Date.now()}`;
}
// === fin M7 negocio

// === M7 negocio (ownership: oc-wave0) � a�adido al final, exports existentes intactos

