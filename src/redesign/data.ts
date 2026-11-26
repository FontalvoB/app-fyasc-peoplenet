import { performanceEvaluationEnabled } from "../lib/feature-flags";

export const nav = [
  ["", "space_dashboard", "Resumen"],
  ["attendance", "fingerprint", "Asistencia"],
  ["kpis", "monitoring", "Mis indicadores"],
  ["requests", "event_available", "Permisos y solicitudes"],
  ["documents", "folder_open", "Documentos"],
  ["team", "account_tree", "Nuestro equipo"],
  ["evaluations", "target", "Evaluaciones"],
  ["certificates", "workspace_premium", "Certificados"],
].filter(([path]) => performanceEvaluationEnabled || path !== "evaluations");

export const people = [
  ["Álvaro Méndez", "Gerente de Operaciones", "Operaciones", "AM"],
  ["María Gómez", "Directora de Talento", "Talento humano", "MG"],
  ["Carlos Ruiz", "Director financiero", "Finanzas", "CR"],
  ["Ana Silva", "Líder comercial", "Comercial", "AS"],
  ["Laura Torres", "Analista de operaciones", "Operaciones", "LT"],
  ["Daniel Rojas", "Especialista de talento", "Talento humano", "DR"],
];

export const initialRequests = [
  {
    id: "SOL-026",
    type: "Vacaciones",
    start: "2026-10-19",
    end: "2026-10-23",
    note: "Viaje familiar programado.",
    status: "Aprobada",
  },
  {
    id: "SOL-025",
    type: "Citación médica",
    start: "2026-10-08",
    end: "2026-10-08",
    note: "Consulta de control con especialista.",
    status: "Pendiente",
  },
  {
    id: "SOL-024",
    type: "Permiso",
    start: "2026-09-24",
    end: "2026-09-24",
    note: "Diligencia personal.",
    status: "Aprobada",
  },
  {
    id: "SOL-023",
    type: "Licencia",
    start: "2026-09-10",
    end: "2026-09-11",
    note: "Actividad personal.",
    status: "Rechazada",
  },
];

export type RequestItem = (typeof initialRequests)[number];

export const docs = [
  {
    id: "manual",
    image: "convivencia",
    title: "Manual de convivencia",
    category: "Talento humano",
    date: "02 oct 2026",
    pages: 3,
    icon: "menu_book",
  },
  {
    id: "bienestar",
    image: "bienestar-activo",
    title: "Programa de bienestar 2026",
    category: "Bienestar",
    date: "30 sep 2026",
    pages: 2,
    icon: "spa",
  },
  {
    id: "permisos",
    image: "vacaciones",
    title: "Política de permisos y vacaciones",
    category: "Talento humano",
    date: "28 sep 2026",
    pages: 3,
    icon: "event_note",
  },
  {
    id: "seguridad",
    image: "seguridad-digital",
    title: "Seguridad de la información",
    category: "Tecnología",
    date: "25 sep 2026",
    pages: 2,
    icon: "shield",
  },
  {
    id: "estrategia",
    image: "estrategia",
    title: "Nuestro plan estratégico",
    category: "Corporativo",
    date: "20 sep 2026",
    pages: 2,
    icon: "flag",
  },
  {
    id: "etica",
    image: "integridad",
    title: "Código de ética y conducta",
    category: "Corporativo",
    date: "15 sep 2026",
    pages: 3,
    icon: "verified_user",
  },
];

export const metrics = [
  {
    name: "Satisfacción del cliente",
    area: "Comercial",
    value: 88,
    target: 95,
    change: "+3,2",
    status: "En curso",
  },
  {
    name: "Cumplimiento de entregas",
    area: "Operaciones",
    value: 74,
    target: 90,
    change: "−1,8",
    status: "En riesgo",
  },
  {
    name: "Retención de talento",
    area: "Talento humano",
    value: 96,
    target: 95,
    change: "+2,4",
    status: "Cumplido",
  },
  {
    name: "Eficiencia operativa",
    area: "Operaciones",
    value: 91,
    target: 98,
    change: "+5,1",
    status: "En curso",
  },
];

export const documentCopy: Record<string, string[]> = {
  manual: [
    "Nuestro compromiso compartido|En PeopleNet creemos que el respeto, la colaboración y la confianza son la base de un entorno donde todas las personas pueden crecer. Este manual de ejemplo reúne los principios que orientan nuestra convivencia.",
    "Así trabajamos juntos|Escuchamos con atención, compartimos información de forma clara y reconocemos las contribuciones del equipo. Resolvemos diferencias mediante conversaciones respetuosas y pedimos apoyo a Talento Humano cuando lo necesitamos.",
    "Tu voz cuenta|Si tienes una sugerencia o necesitas acompañamiento, acércate a tu líder o al equipo de Talento Humano. Construir un buen lugar para trabajar es una responsabilidad compartida.",
  ],
  bienestar: [
    "Bienestar en cada etapa|Nuestro programa de ejemplo promueve el equilibrio entre trabajo, descanso y desarrollo personal. Participa en las actividades que más conecten contigo.",
    "Actividades para ti|Pausas activas, encuentros de equipo y espacios de aprendizaje forman parte del calendario de bienestar. Consulta a Talento Humano para conocer los próximos encuentros.",
  ],
  permisos: [
    "Planea con anticipación|Comunica tus ausencias programadas a tu líder con al menos ocho días de anticipación. En esta demo puedes explorar el formulario sin realizar una solicitud real.",
    "Completa tu solicitud|Selecciona el tipo de permiso, indica las fechas y añade el contexto necesario. Cuando corresponda, adjunta un soporte. Verifica la información antes de enviar.",
    "Seguimiento y aprobación|Tu líder revisa la cobertura operativa y comunica su decisión. Puedes consultar el estado de tus solicitudes en Permisos y solicitudes.",
  ],
  seguridad: [
    "Cuida la información|Utiliza contraseñas únicas y comparte documentos únicamente con las personas que los necesitan. Bloquea tu equipo cuando te ausentes.",
    "Reporta a tiempo|Ante un correo sospechoso o un incidente, contacta al equipo de Tecnología por los canales internos. No compartas tus credenciales.",
  ],
  estrategia: [
    "Un propósito que nos une|Queremos que cada persona encuentre oportunidades para aportar y crecer. Nuestra estrategia conecta la experiencia del colaborador con un servicio de calidad.",
    "De las ideas a los resultados|Trabajamos con objetivos claros, seguimiento periódico y aprendizaje continuo. Cada equipo contribuye desde su experiencia a las metas compartidas.",
  ],
  etica: [
    "Actuamos con integridad|Tomamos decisiones con honestidad, respeto y responsabilidad. Estos principios guían nuestras relaciones con compañeros, clientes y aliados.",
    "Respeto y oportunidades|Promovemos un trato justo y un ambiente libre de discriminación. Valoramos perspectivas diversas y escuchamos cada voz.",
    "Conversaciones que construyen|Comunica cualquier inquietud a tu líder o al equipo de Talento Humano para recibir orientación.",
  ],
};

export const evalQuestions = [
  "Del 1 al 5, ¿cómo valoras tu colaboración con el equipo este trimestre?",
  "Del 1 al 5, ¿cómo valoras el cumplimiento de tus objetivos?",
  "Del 1 al 5, ¿cómo valoras tu aprendizaje y desarrollo?",
];

export const notices = [
  {
    id: "1",
    icon: "check_circle",
    title: "Tus vacaciones están aprobadas",
    text: "María Gómez aprobó tu solicitud del 19 al 23 de octubre. Todo listo para tu descanso.",
    time: "Hace 30 minutos",
    path: "requests",
  },
  {
    id: "2",
    icon: "description",
    title: "Un nuevo documento para ti",
    text: "El Manual de convivencia está disponible en tu biblioteca. Conoce lo que nos hace equipo.",
    time: "Hace 2 horas",
    path: "documents/manual",
  },
  {
    id: "3",
    icon: "target",
    title: "Tu evaluación ya está disponible",
    text: "Tómate un momento para reconocer tus logros con la ayuda de Eva.",
    time: "Hoy, 8:00 a. m.",
    path: "evaluations",
  },
];
