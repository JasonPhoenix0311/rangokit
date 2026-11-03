import { reach, pathEdges, firstBreak } from '../engine.js';

// Práctica 01: retorno automático con enclavamiento.
// S1 energiza K1, K1 se enclava y activa Y1. Al llegar a S2, K1 cae y el cilindro regresa.

export const STROKE = 100; // mm
export const SPEED = 62.5; // mm/s, constante por simplicidad
export const SENSOR_WINDOW = 3; // mm de alcance a cada lado del sensor
export const DELAY = 0.03; // s de respuesta de relé y válvula
export const DT = 0.01; // s por paso de simulación
export const SENSOR_HOME = 100; // mm
export const PRESS_AT = 0.2; // s
export const RELEASE_AT = 0.45; // s

export const ELEC = [
  { id: 'W1', type: 'wire', a: '+24', b: 'n1', from: '+24 V', to: 'entrada de S1' },
  { id: 'S1', type: 'contact', a: 'n1', b: 'n2' },
  { id: 'W8', type: 'wire', a: 'n1', b: 'h1', from: 'entrada de S1', to: 'K1:13' },
  { id: 'K1a', type: 'contact', a: 'h1', b: 'h2' },
  { id: 'W9', type: 'wire', a: 'h2', b: 'n2', from: 'K1:14', to: 'salida de S1' },
  { id: 'W2', type: 'wire', a: 'n2', b: 'n3', from: 'salida de S1', to: 'entrada de S2' },
  { id: 'S2', type: 'contact', a: 'n3', b: 'n4' },
  { id: 'W3', type: 'wire', a: 'n4', b: 'n5', from: 'salida de S2', to: 'K1:A1' },
  { id: 'K1c', type: 'coil', a: 'n5', b: 'n6' },
  { id: 'W4', type: 'wire', a: 'n6', b: '0V', from: 'K1:A2', to: '0 V' },
  { id: 'W5', type: 'wire', a: '+24', b: 'n7', from: '+24 V', to: 'K1:23' },
  { id: 'K1b', type: 'contact', a: 'n7', b: 'n8' },
  { id: 'W6', type: 'wire', a: 'n8', b: 'n9', from: 'K1:24', to: 'Y1:+' },
  { id: 'Y1c', type: 'coil', a: 'n9', b: 'n10' },
  { id: 'W7', type: 'wire', a: 'n10', b: '0V', from: 'Y1:−', to: '0 V' },
];

export const AIR = [
  { id: 'V0', type: 'valve', a: 'src', b: 'p0', from: 'alimentación', to: 'salida de 0Z1' },
  { id: 'H1', type: 'hose', a: 'p0', b: 'P', from: 'salida de 0Z1', to: 'entrada 1 de la válvula' },
  { id: 'SP4', type: 'spool', a: 'P', b: 'A' },
  { id: 'SP2', type: 'spool', a: 'P', b: 'B' },
  { id: 'H2', type: 'hose', a: 'A', b: 'rear', from: 'salida 4', to: 'cámara trasera' },
  { id: 'H3', type: 'hose', a: 'B', b: 'front', from: 'salida 2', to: 'cámara delantera' },
];

export const BREAKABLE = [...ELEC, ...AIR].filter((e) => e.type === 'wire' || e.type === 'hose').map((e) => e.id);

const CHAIN_PRESS = ['W1', 'S1', 'W2', 'S2', 'W3', 'K1c', 'W4'];
const CHAIN_HOLD = ['W1', 'W8', 'K1a', 'W9', 'W2', 'S2', 'W3', 'K1c', 'W4'];
const CHAIN_Y1 = ['W5', 'K1b', 'W6', 'Y1c', 'W7'];
const CHAIN_EXTEND = ['V0', 'H1', 'SP4', 'H2'];
const CHAIN_RETRACT = ['V0', 'H1', 'SP2', 'H3'];

const STAGE_CHAIN = {
  k1: [ELEC, CHAIN_PRESS],
  y1: [ELEC, CHAIN_Y1],
  'air-ext': [AIR, CHAIN_EXTEND],
  hold: [ELEC, CHAIN_HOLD],
  'air-ret': [AIR, CHAIN_RETRACT],
};

export const CHECKS = [
  'Sale al pulsar S1',
  'Sigue saliendo al soltar S1',
  'S2 detecta el final de carrera',
  'Regresa solo a 0 mm',
];

const STAGE_CHECK = { k1: 0, 's2-rest': 0, y1: 0, 'air-ext': 0, hold: 1, 's2-late': 2, 's2-early': 2, 'air-ret': 3 };

const STAGE_TEXT = {
  k1: {
    symptom: 'Al pulsar S1, K1 no energiza y el cilindro no se mueve.',
    hint: 'Sigue los 24 V desde el positivo hasta K1:A1 y luego de K1:A2 hasta 0 V. Busca el primer punto donde cambia la lectura.',
  },
  's2-rest': {
    symptom: 'Al pulsar S1, K1 no energiza. S2 ya detecta el émbolo con el cilindro en reposo.',
    hint: 'S2 abre su contacto antes de que el cilindro se mueva. Revisa en qué punto de la carrera está montado.',
  },
  y1: {
    symptom: 'K1 energiza, pero Y1 no recibe corriente y el cilindro no sale.',
    hint: 'El relé funciona. Revisa la rama de Y1: el contacto K1 23-24 y los dos cables de la bobina.',
  },
  'air-ext': {
    symptom: 'Y1 energiza y la válvula conmuta, pero el cilindro no sale.',
    hint: 'La parte eléctrica responde. Revisa que lleguen 6 bar a la entrada 1 y que el aire pase por la salida 4 hasta la cámara trasera.',
  },
  hold: {
    symptom: 'El cilindro sale mientras mantienes S1 pulsado. Al soltarlo, K1 cae y el cilindro regresa.',
    hint: 'K1 no se está enclavando. Revisa la rama en paralelo con S1, la que pasa por el contacto K1 13-14.',
  },
  's2-late': {
    symptom: 'El cilindro llega al final y se queda afuera. K1 nunca se apaga.',
    hint: 'El vástago llegó a 100 mm, pero S2 no cambió de estado. Compara la posición del sensor con el final de carrera.',
  },
  's2-early': {
    symptom: 'El cilindro regresa antes de completar los 100 mm de carrera.',
    hint: 'K1 cayó a media carrera. Revisa qué elemento abrió el circuito en ese momento y dónde está montado.',
  },
  'air-ret': {
    symptom: 'Y1 se apagó y la válvula regresó, pero el cilindro se queda afuera.',
    hint: 'La parte eléctrica responde. Revisa que el aire llegue por la salida 2 hasta la cámara delantera.',
  },
};

export function createState(cfg = {}) {
  return {
    t: 0,
    s1: false,
    k1: false,
    spool: false,
    x: 0,
    k1Timer: 0,
    spoolTimer: 0,
    sensed: false,
    broken: new Set(cfg.broken ?? []),
    // Componentes dañados que ninguna regla diagnostica. Sirven para probar el caso sin causa conocida.
    damaged: new Set(cfg.damaged ?? []),
    s2pos: cfg.s2pos ?? SENSOR_HOME,
    supply: cfg.supply ?? true,
    events: [],
  };
}

const isSensed = (s) => Math.abs(s.x - s.s2pos) <= SENSOR_WINDOW;

function isClosed(edge, s, override = {}) {
  if (edge.id in override) return override[edge.id];
  switch (edge.id) {
    case 'S1': return s.s1;
    case 'S2': return !isSensed(s);
    case 'K1a':
    case 'K1b': return s.k1;
    case 'V0': return s.supply;
    case 'SP4': return s.spool;
    case 'SP2': return !s.spool;
    default: return edge.type !== 'coil' && !s.broken.has(edge.id);
  }
}

export function solve(s, override = {}) {
  const closed = (edge) => isClosed(edge, s, override);
  const hot = reach(ELEC, closed, '+24');
  const gnd = reach(ELEC, closed, '0V');
  const air = reach(AIR, closed, 'src');
  const k1Coil = hot.has('n5') && gnd.has('n6') && !s.damaged.has('K1c');
  const y1Coil = hot.has('n9') && gnd.has('n10') && !s.damaged.has('Y1c');
  const current = new Set();
  const addPath = (coil, a, b) => {
    current.add(coil);
    for (const id of pathEdges(ELEC, closed, '+24', a)) current.add(id);
    for (const id of pathEdges(ELEC, closed, b, '0V')) current.add(id);
  };
  if (k1Coil) addPath('K1c', 'n5', 'n6');
  if (y1Coil) addPath('Y1c', 'n9', 'n10');
  return { hot, gnd, air, k1Coil, y1Coil, current, moving: motion(air) };
}

function motion(air) {
  const rear = air.has('rear');
  const front = air.has('front');
  if (rear && !front) return 1;
  if (front && !rear) return -1;
  return 0;
}

const log = (s, kind, text) => s.events.push({ t: s.t, kind, text });

export function tick(s) {
  const sol = solve(s);
  s.t = Math.round((s.t + DT) * 1000) / 1000;

  s.k1Timer = sol.k1Coil === s.k1 ? 0 : s.k1Timer + DT;
  if (s.k1Timer >= DELAY - 1e-9) {
    s.k1 = sol.k1Coil;
    s.k1Timer = 0;
    log(s, 'K1', s.k1 ? 'K1 energiza: cierran 13-14 y 23-24.' : 'K1 cae: abren 13-14 y 23-24.');
  }
  s.spoolTimer = sol.y1Coil === s.spool ? 0 : s.spoolTimer + DT;
  if (s.spoolTimer >= DELAY - 1e-9) {
    s.spool = sol.y1Coil;
    s.spoolTimer = 0;
    log(s, 'Y1', s.spool ? 'Y1 energiza: el aire pasa de 1 a 4.' : 'Y1 se apaga: el resorte pasa el aire de 1 a 2.');
  }

  const before = s.x;
  const direction = sol.moving;
  s.x = Math.min(STROKE, Math.max(0, s.x + direction * SPEED * DT));
  if (before < STROKE && s.x >= STROKE) log(s, '1A', 'El vástago llega a 100 mm.');
  if (before > 0 && s.x <= 0) log(s, '1A', 'El vástago regresa a 0 mm.');

  const sensed = isSensed(s);
  if (sensed !== s.sensed) {
    s.sensed = sensed;
    log(s, 'S2', sensed ? `S2 detecta el émbolo en ${Math.round(s.x)} mm y abre su contacto.` : 'S2 deja de detectar y cierra su contacto.');
  }
}

function runTo(s, time, onTick) {
  while (s.t < time - 1e-9) {
    tick(s);
    onTick?.(s);
  }
}

function reading(sol, node, kind) {
  if (kind === 'air') return sol.air.has(node) ? '6 bar' : '0 bar';
  if (sol.hot.has(node)) return '24 V';
  if (sol.gnd.has(node)) return '0 V';
  return 'sin tensión';
}

function finding(stage, edge, s, override = {}) {
  const base = { stage, failedCheck: STAGE_CHECK[stage], ...STAGE_TEXT[stage], endT: s.t + 0.6 };
  const sol = solve(s, override);
  if (edge.type === 'wire') {
    return {
      ...base,
      target: edge.id,
      component: `Cable ${edge.id}, entre ${edge.from} y ${edge.to}.`,
      evidence: [`${edge.from}: ${reading(sol, edge.a)}`, `${edge.to}: ${reading(sol, edge.b)}`],
      correction: `Reconecta ${edge.id}, aprieta ambos bornes y repite la prueba.`,
      fix: { kind: 'reconnect', id: edge.id },
    };
  }
  if (edge.type === 'hose') {
    return {
      ...base,
      target: edge.id,
      component: `Manguera ${edge.id}, entre ${edge.from} y ${edge.to}.`,
      evidence: [`${edge.from}: ${reading(sol, edge.a, 'air')}`, `${edge.to}: ${reading(sol, edge.b, 'air')}`],
      correction: `Inserta ${edge.id} hasta el tope en ambos racores y repite la prueba.`,
      fix: { kind: 'reconnect', id: edge.id },
    };
  }
  if (edge.id === 'S2') return sensorFinding('s2-rest', s, s.x);
  if (edge.id !== 'V0') return undetermined(stage, s, override);
  return {
    ...base,
    target: 'V0',
    component: 'Llave de paso 0Z1, cerrada.',
    evidence: ['Alimentación: 6 bar', 'Salida de 0Z1: 0 bar'],
    correction: 'Abre 0Z1, confirma 6 bar en el manómetro y repite la prueba.',
    fix: { kind: 'open-air' },
  };
}

function sensorFinding(stage, s, xMax) {
  return {
    stage,
    failedCheck: STAGE_CHECK[stage],
    ...STAGE_TEXT[stage],
    target: 'S2',
    component: `Sensor S2, montado en ${Math.round(s.s2pos)} mm. Su alcance es de ±${SENSOR_WINDOW} mm.`,
    evidence: [`Posición de S2: ${Math.round(s.s2pos)} mm`, `Avance máximo: ${Math.round(xMax)} mm`],
    correction: `Mueve S2 a ${SENSOR_HOME} mm, fíjalo y repite la prueba.`,
    fix: { kind: 'sensor', pos: SENSOR_HOME },
    endT: s.t + 0.3,
  };
}

/**
 * La etapa falló, pero ninguna regla explica por qué. En lugar de adivinar,
 * se dice y se listan los puntos de la cadena donde conviene medir.
 */
function undetermined(stage, s, override = {}) {
  const [edges, chain] = STAGE_CHAIN[stage];
  const air = edges === AIR;
  const sol = solve(s, override);
  const points = [];
  for (const id of chain) {
    const edge = edges.find((candidate) => candidate.id === id);
    if (!edge.from) continue;
    for (const [label, node] of [[edge.from, edge.a], [edge.to, edge.b]]) {
      const line = `${label}: ${reading(sol, node, air ? 'air' : 'elec')}`;
      if (!points.includes(line)) points.push(line);
    }
  }
  return {
    stage,
    failedCheck: STAGE_CHECK[stage],
    symptom: STAGE_TEXT[stage].symptom,
    undetermined: true,
    hint: 'El simulador no pudo determinar la causa con las reglas de esta práctica. No hay un cable ni una manguera suelta en este tramo.',
    measure: air
      ? 'Mide la presión en cada punto del tramo y busca dónde deja de haber 6 bar. Si todo marca 6 bar, revisa el componente que recibe el aire.'
      : 'Mide la tensión en cada punto del tramo y busca dónde cambia la lectura. Si llegan 24 V y 0 V a la bobina, revisa la bobina.',
    evidence: points,
    endT: s.t + 0.6,
  };
}

const locate = (edges, chain, s, override = {}) =>
  firstBreak(edges, chain, (edge) => isClosed(edge, s, override));

const check = (stage, s, override = {}) => {
  const [edges, chain] = STAGE_CHAIN[stage];
  const edge = locate(edges, chain, s, override);
  return edge ? finding(stage, edge, s, override) : undetermined(stage, s, override);
};

/**
 * Ejecuta un ciclo completo y compara el resultado con lo que pide la práctica.
 * Devuelve la primera falla observada o { ok: true }.
 */
export function diagnose(cfg = {}) {
  const s = createState(cfg);
  runTo(s, PRESS_AT);
  s.s1 = true;
  runTo(s, PRESS_AT + 0.2);

  const sol = solve(s);
  if (!sol.k1Coil) return check('k1', s);
  if (!sol.y1Coil) return check('y1', s);
  if (s.x < 1) return check('air-ext', s);

  runTo(s, RELEASE_AT);
  s.s1 = false;
  runTo(s, RELEASE_AT + 0.15);
  if (!s.k1) return check('hold', s, { K1a: true });

  let xMax = s.x;
  let everSensed = s.sensed;
  const watch = (state) => {
    xMax = Math.max(xMax, state.x);
    everSensed = everSensed || state.sensed;
  };
  runTo(s, 4.5, watch);

  if (!everSensed) return sensorFinding('s2-late', s, xMax);
  if (xMax < STROKE - 2) return sensorFinding('s2-early', s, xMax);
  if (s.x > 1) return check('air-ret', s);
  const done = s.events.findLast((event) => event.text.includes('regresa a 0'));
  return { ok: true, stroke: Math.round(xMax), cycle: (done?.t ?? s.t) - PRESS_AT, endT: (done?.t ?? s.t) + 0.3 };
}
