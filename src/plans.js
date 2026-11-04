// Planes de Rangokit: configuración central y consulta del plan de una cuenta.
// Los precios están sujetos a validación con estudiantes, docentes y escuelas.
// Este módulo no cobra, no pide datos de pago y no se conecta a ningún servicio.

export const PRICING_NOTICE = 'Precios sujetos a validación. Aún no se realizan cobros.';

// Valor del campo `plan` de una cuenta nueva o migrada. Equivale al plan gratuito de su rol.
export const DEFAULT_PLAN = 'gratis';

// Versión del registro de cuenta que deja `migrateAccount`.
export const ACCOUNT_VERSION = 1;

// Funciones. `available: false` se muestra como "Próximamente" y nunca se habilita.
export const FEATURES = Object.freeze({
  simulador: { name: 'Simulador de electroneumática', available: true },
  practicas: { name: 'Prácticas guiadas', available: true },
  'pistas-reglas': { name: 'Pistas graduales por reglas', available: true },
  'proyectos-libres': { name: 'Editor de proyectos libres (beta)', available: true },
  'practica-asignada': { name: 'Hacer y entregar las prácticas que deja tu docente', available: false },
  'tutor-ia': { name: 'Tutor con IA que explica los hallazgos del simulador', available: false },
  reportes: { name: 'Reportes de tu avance', available: false },
  'un-grupo': { name: '1 grupo', available: false },
  'asignar-practicas': { name: 'Asignar prácticas', available: false },
  'resultados-basicos': { name: 'Resultados básicos del grupo', available: false },
  'grupos-ilimitados': { name: 'Grupos ilimitados', available: false },
  'fallas-por-alumno': { name: 'Fallas distintas por alumno', available: false },
  'exportar-calificaciones': { name: 'Exportar calificaciones', available: false },
  'banco-practicas': { name: 'Banco de prácticas', available: false },
  administracion: { name: 'Administración del plantel', available: false },
  'moodle-classroom': { name: 'Integración con Moodle o Classroom', available: false },
  capacitacion: { name: 'Capacitación docente', available: false },
  soporte: { name: 'Soporte', available: false },
  factura: { name: 'Factura', available: false },
  talleres: { name: 'Talleres presenciales o en línea', available: false },
});

// Siempre gratis, con o sin cuenta y con cualquier plan. Incluye hacer y entregar
// lo que deja un docente: ningún estudiante paga por una práctica asignada.
export const ALWAYS_FREE = Object.freeze(['simulador', 'practicas', 'pistas-reglas', 'proyectos-libres', 'practica-asignada']);

const STUDENT_FREE = ['simulador', 'practicas', 'pistas-reglas', 'proyectos-libres', 'practica-asignada'];
const TEACHER_FREE = [...STUDENT_FREE, 'un-grupo', 'asignar-practicas', 'resultados-basicos'];

// price: monto en pesos mexicanos; priceMax para un rango; null cuando se cotiza.
// period: 'semestre', 'año' o null. unit: a qué se aplica el precio, si no es por persona.
// base: plan cuyas funciones incluye; la página muestra "Todo lo de …" y solo lo nuevo.
export const PLANS = Object.freeze([
  {
    id: 'estudiante', role: 'estudiante', name: 'Estudiante', price: 0, period: null,
    summary: 'Simulador, prácticas y pistas por reglas. No requiere cuenta.',
    requiresAccount: false, features: STUDENT_FREE,
  },
  {
    id: 'estudiante-plus', role: 'estudiante', name: 'Estudiante Plus', price: 99, period: 'semestre', base: 'estudiante',
    summary: 'Todo lo de Estudiante, más tutor con IA y reportes.',
    requiresAccount: true, features: [...STUDENT_FREE, 'tutor-ia', 'reportes'],
  },
  {
    id: 'docente', role: 'docente', name: 'Docente', price: 0, period: null, base: 'estudiante',
    summary: 'Un grupo, asignar prácticas y resultados básicos.',
    requiresAccount: true, features: TEACHER_FREE,
  },
  {
    id: 'docente-pro', role: 'docente', name: 'Docente Pro', price: 690, period: 'año', base: 'docente',
    summary: 'Grupos ilimitados, fallas por alumno, exportar calificaciones y banco de prácticas.',
    requiresAccount: true,
    features: [...TEACHER_FREE, 'grupos-ilimitados', 'fallas-por-alumno', 'exportar-calificaciones', 'banco-practicas'],
  },
  {
    id: 'escuela', role: 'escuela', name: 'Escuela', price: 15000, priceMax: 30000, period: 'año', unit: 'plantel',
    base: 'docente-pro',
    summary: 'Administración, Moodle o Classroom, capacitación, soporte y factura.',
    requiresAccount: true,
    features: [...TEACHER_FREE, 'grupos-ilimitados', 'fallas-por-alumno', 'exportar-calificaciones', 'banco-practicas',
      'administracion', 'moodle-classroom', 'capacitacion', 'soporte', 'factura'],
  },
  {
    id: 'capacitacion', role: 'servicio', name: 'Capacitación', price: null, period: null, unit: 'taller',
    summary: 'Talleres para docentes y estudiantes. Precio por taller.',
    requiresAccount: false, features: ['talleres'],
  },
].map((plan) => Object.freeze({ ...plan, features: Object.freeze(plan.features) })));

const BY_ID = new Map(PLANS.map((plan) => [plan.id, plan]));

export function getPlan(id) {
  return BY_ID.get(id) ?? null;
}

const money = (value) => `MX$${value.toLocaleString('es-MX')}`;

export function formatPrice(plan) {
  if (plan.price === null) return plan.unit ? `Precio por ${plan.unit}` : 'Precio a cotizar';
  if (plan.price === 0) return 'Gratis';
  const amount = plan.priceMax ? `${money(plan.price)} a ${money(plan.priceMax)}` : money(plan.price);
  const period = plan.period === 'año' ? ' al año' : plan.period ? ` por ${plan.period}` : '';
  return `${amount}${period}${plan.unit ? ` por ${plan.unit}` : ''}`;
}

// Plan gratuito que corresponde a una cuenta según su rol.
function freePlanFor(account) {
  return account?.role === 'docente' ? BY_ID.get('docente') : BY_ID.get('estudiante');
}

// Plan efectivo de una cuenta. Sin cuenta, con plan "gratis", vacío o desconocido,
// devuelve el plan gratuito de su rol. Nunca falla ni devuelve null.
export function planOf(account) {
  const plan = getPlan(account?.plan);
  return plan && plan.role !== 'servicio' ? plan : freePlanFor(account);
}

// ¿El plan de la cuenta incluye la función? Las funciones de ALWAYS_FREE siempre se incluyen.
export function includes(account, feature) {
  if (!(feature in FEATURES)) return false;
  return ALWAYS_FREE.includes(feature) || planOf(account).features.includes(feature);
}

// ¿Se puede usar hoy? Además de estar incluida, la función debe existir ya en Rangokit.
export function canUse(account, feature) {
  return includes(account, feature) && FEATURES[feature].available;
}

// Migración: agrega el campo `plan` sin tocar nada más. No borra cuentas ni cambia
// un plan ya asignado. Es idempotente y no modifica el objeto original.
export function migrateAccount(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return account;
  const plan = typeof account.plan === 'string' && account.plan.trim() ? account.plan : DEFAULT_PLAN;
  return { ...account, plan, accountVersion: Math.max(ACCOUNT_VERSION, Number(account.accountVersion) || 0) };
}

// Acepta una lista de cuentas o un objeto { id: cuenta }. Cualquier otro valor se
// devuelve igual, para no perder datos de un formato que no conoce.
export function migrateAccounts(accounts) {
  if (Array.isArray(accounts)) return accounts.map(migrateAccount);
  if (accounts && typeof accounts === 'object') {
    return Object.fromEntries(Object.entries(accounts).map(([id, account]) => [id, migrateAccount(account)]));
  }
  return accounts;
}
