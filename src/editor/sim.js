// Simulación en tiempo real de los proyectos libres del editor.
//
// Simplificaciones declaradas (también se muestran en la interfaz):
// - Lógica de conexión, no circuito: un borne tiene 24 V, 5 V, tierra o nada. No calcula corrientes.
// - Una carga se energiza si un extremo recibe su tensión y el otro llega a la tierra de esa fuente.
// - Las tierras de 24 V y del Arduino solo son la misma si están unidas con un cable.
// - Relés y válvulas responden con 30 ms de retardo. Cilindros a velocidad constante (2 s por carrera),
//   más lentos si su manguera pasa por una reguladora. No hay caída de presión ni contrapresión.
// - El Arduino ejecuta las reglas de la tabla de Lógica, igual que el código generado.
import { reach } from '../engine.js';
import { definition } from './catalog.js';
import { keyOf, nets, netOf } from './project.js';
import { boards, pinRows, ruleProblem, CONDITIONS } from './arduino.js';

export const SIM = { DT: 0.01, DELAY: 0.03, SPEED: 50, SLOW: 0.35, WINDOW: 3, ADC_MAX: 1023 };

// Contactos de cada tipo: [borne, borne, NA o NC].
const CONTACTS = {
  'pulsador-na': [['13', '14', 'NA']],
  'pulsador-nc': [['11', '12', 'NC']],
  'paro-emergencia': [['11', '12', 'NC']],
  'final-carrera': [['13', '14', 'NA']],
  'sensor-magnetico': [['1', '2', 'NA']],
  'rele-24': [['13', '14', 'NA'], ['23', '24', 'NA'], ['11', '12', 'NC']],
  'modulo-rele': [['COM', 'NO', 'NA'], ['COM', 'NC', 'NC']],
};

// Cargas: [positivo, negativo, tensión nominal, nombre, polarizada].
const LOADS = {
  'valvula-32-sol': [['Y+', 'Y-', 24, 'Y']],
  'valvula-52-mono': [['Y+', 'Y-', 24, 'Y']],
  'valvula-52-bi': [['Y1+', 'Y1-', 24, 'Y1'], ['Y2+', 'Y2-', 24, 'Y2']],
  'rele-24': [['A1', 'A2', 24, 'bobina']],
  lampara: [['X1', 'X2', 24, 'lámpara']],
  led: [['A', 'K', 5, 'LED', true]],
  'led-solo': [['A', 'K', 5, 'LED', true]],
  optoacoplador: [['IN+', 'IN-', 24, 'entrada', true]],
};

const SENSORS = new Set(['final-carrera', 'sensor-magnetico', 'sensor-inductivo', 'valvula-32-rodillo']);
const HOLD = new Set(['pulsador-na', 'pulsador-nc', 'valvula-32-boton']);
const TOGGLE = new Set(['paro-emergencia', 'valvula-52-palanca']);
const SOLENOID_VALVES = new Set(['valvula-32-sol', 'valvula-52-mono']);

/** Cómo se usa un componente durante la simulación: mantener, alternar, deslizar o nada. */
export function interaction(component) {
  if (HOLD.has(component.type)) return 'hold';
  if (TOGGLE.has(component.type)) return 'toggle';
  if (component.type === 'potenciometro') return 'slider';
  if (SENSORS.has(component.type) && component.config.target === 'manual') return 'hold';
  return null;
}

/** Cilindro que vigila un sensor: el elegido en su configuración o el más cercano en el plano. */
export function sensorTarget(project, sensor) {
  if (sensor.config.target === 'manual') return null;
  const cylinders = project.components.filter((c) => c.type.startsWith('cilindro'));
  const chosen = cylinders.find((c) => c.id === sensor.config.target);
  if (chosen) return chosen;
  const center = (c) => [c.x + definition(c.type).w / 2, c.y + definition(c.type).h / 2];
  const [sx, sy] = center(sensor);
  return cylinders.sort((a, b) => {
    const [ax, ay] = center(a);
    const [bx, by] = center(b);
    return Math.hypot(ax - sx, ay - sy) - Math.hypot(bx - sx, by - sy);
  })[0] ?? null;
}

const k = (c, p) => keyOf({ c, p });

export function createSim(project) {
  const sim = { t: 0, project, parts: new Map(), boards: [], events: [], warned: new Set(), view: null };
  const elecNets = nets(project, 'elec');
  const airNets = nets(project, 'air');
  for (const c of project.components) {
    const part = { pressed: false, toggled: false, on: false, timer: 0, pos: 0, detect: false, burned: false, energized: [], value: 512 };
    if (SENSORS.has(c.type)) {
      const target = sensorTarget(project, c);
      part.target = target?.id ?? null;
      part.at = c.config.at === 'inicio' ? 'inicio' : 'fin';
    }
    if (c.type.startsWith('cilindro')) {
      // Más lento si la manguera de alguna cámara pasa por una reguladora de caudal.
      part.slow = definition(c.type).ports.some((port) => [...netOf(airNets, { c: c.id, p: port.id })]
        .some((key) => project.components.find((x) => x.id === key.split(':')[0])?.type === 'reguladora'));
    }
    if (c.type === 'potenciometro') part.value = Number(c.config.value ?? 512);
    sim.parts.set(c.id, part);
  }
  for (const board of boards(project)) {
    const rows = pinRows(project, board);
    sim.boards.push({ board, rows, state: new Map(), levels: new Map(), values: new Map() });
  }
  // Pin del Arduino que mueve cada módulo de relé.
  for (const c of project.components.filter((x) => x.type === 'modulo-rele')) {
    const group = netOf(elecNets, { c: c.id, p: 'IN' });
    for (const b of sim.boards) {
      const row = b.rows.find((r) => group.has(k(b.board.id, r.id)));
      if (row) sim.parts.get(c.id).driver = { board: b, row };
    }
  }
  // Pin al que llega el cursor de cada potenciómetro.
  sim.potOf = new Map();
  for (const c of project.components.filter((x) => x.type === 'potenciometro')) {
    for (const key of netOf(elecNets, { c: c.id, p: 'W' })) sim.potOf.set(key, c.id);
  }
  log(sim, 'Inicio', 'Simulación iniciada.');
  solve(sim);
  return sim;
}

function log(sim, kind, text) {
  const last = sim.events[sim.events.length - 1];
  if (last && last.text === text) return;
  sim.events.push({ t: Math.round(sim.t * 100) / 100, kind, text });
  if (sim.events.length > 200) sim.events.shift();
}

function warnOnce(sim, id, text) {
  if (sim.warned.has(id)) return;
  sim.warned.add(id);
  log(sim, 'Aviso', text);
}

function actuated(sim, c) {
  const part = sim.parts.get(c.id);
  if (HOLD.has(c.type)) return part.pressed;
  if (TOGGLE.has(c.type)) return part.toggled;
  if (SENSORS.has(c.type)) return part.target ? part.detect : part.pressed;
  return part.on;
}

/** Calcula tensiones, cargas y aire con el estado actual, sin avanzar el tiempo. */
function solve(sim) {
  const { project } = sim;
  const edges = [];
  const resistorEdges = [];
  for (const link of project.links.filter((l) => l.kind === 'elec')) edges.push({ id: link.id, a: keyOf(link.a), b: keyOf(link.b) });
  for (const c of project.components) {
    for (const [a, b, kind] of CONTACTS[c.type] ?? []) {
      const on = actuated(sim, c);
      if (kind === 'NA' ? on : !on) edges.push({ id: `${c.id}:${a}-${b}`, a: k(c.id, a), b: k(c.id, b) });
    }
    if (c.type === 'resistencia') resistorEdges.push({ id: `${c.id}:R`, a: k(c.id, '1'), b: k(c.id, '2') });
    if (c.type === 'sensor-inductivo' && actuated(sim, c)) edges.push({ id: `${c.id}:out`, a: k(c.id, '+'), b: k(c.id, 'out') });
  }

  const pos24 = [];
  const pos5 = [];
  const gnd24 = [];
  const gnd5 = [];
  for (const c of project.components) {
    if (c.type === 'fuente-24') { pos24.push(k(c.id, '+24')); gnd24.push(k(c.id, '0V')); }
    if (c.type === 'arduino-uno') { pos5.push(k(c.id, '5V')); gnd5.push(k(c.id, 'GND')); }
    if (c.type === 'optoacoplador') (sim.parts.get(c.id).on ? pos5 : gnd5).push(k(c.id, 'OUT'));
  }
  for (const b of sim.boards) {
    for (const row of b.rows.filter((r) => r.mode === 'output')) {
      const level = b.levels.get(row.id) ?? (row.active === 'HIGH' ? 'LOW' : 'HIGH');
      (level === 'HIGH' ? pos5 : gnd5).push(k(b.board.id, row.id));
    }
  }
  const all = [...edges, ...resistorEdges];
  const from = (starts, list = all) => {
    const virtual = starts.map((s, i) => ({ id: `@${i}`, a: '@', b: s }));
    const set = reach([...list, ...virtual], () => true, '@');
    set.delete('@');
    return set;
  };
  const v = {
    hot24: from(pos24), hot5: from(pos5), gnd24: from(gnd24), gnd5: from(gnd5),
    bare: from([...pos24, ...pos5], edges),
  };
  v.gnd = new Set([...v.gnd24, ...v.gnd5]);

  for (const [set, other, name] of [[v.hot24, v.gnd24, '24 V'], [v.hot5, v.gnd5, '5 V'], [v.hot24, v.gnd5, '24 V'], [v.hot5, v.gnd24, '5 V']]) {
    if ([...set].some((key) => other.has(key))) {
      warnOnce(sim, `corto-${name}`, `Cortocircuito: el positivo de ${name} llega directo a una tierra. En la vida real se dispara la protección de la fuente o se daña el Arduino.`);
    }
  }

  // Cargas.
  for (const c of project.components) {
    const part = sim.parts.get(c.id);
    part.energized = (LOADS[c.type] ?? []).map(([plus, minus, volts, name, polar]) => {
      const p = k(c.id, plus);
      const m = k(c.id, minus);
      const fed = (hot, gnd) => (hot.has(p) && gnd.has(m)) || (!polar && hot.has(m) && gnd.has(p));
      let on = volts === 24 ? fed(v.hot24, v.gnd24) : fed(v.hot5, v.gnd5) || fed(v.hot24, v.gnd24);
      if (volts === 24 && !on && fed(v.hot5, v.gnd5)) {
        warnOnce(sim, `bajo-${c.id}`, `${c.label}: la ${name} es de 24 V y solo recibe 5 V. No se mueve; usa un módulo de relé.`);
      }
      if (on && c.type === 'led-solo' && v.bare.has(p)) {
        part.burned = true;
        warnOnce(sim, `quemado-${c.id}`, `${c.label} se quemó: recibió tensión sin resistencia. Reinicia la simulación después de agregarla.`);
      }
      if (part.burned) on = false;
      return on;
    });
  }

  // Aire.
  const airEdges = project.links.filter((l) => l.kind === 'air').map((l) => ({ id: l.id, a: keyOf(l.a), b: keyOf(l.b) }));
  const sources = [];
  for (const c of project.components) {
    if (c.type === 'fuente-aire') sources.push(k(c.id, 'out'));
    if (c.type === 'reguladora') airEdges.push({ id: `${c.id}:r`, a: k(c.id, 'in'), b: k(c.id, 'out') });
    const def = definition(c.type);
    if (def.category !== 'valvulas' || c.type === 'reguladora') continue;
    const on = valveOn(sim, c);
    const pairs = def.ports.some((p) => p.id === '4')
      ? (on ? [['1', '4'], ['2', '3']] : [['1', '2'], ['4', '5']])
      : (on ? [['1', '2']] : [['2', '3']]);
    for (const [a, b] of pairs) airEdges.push({ id: `${c.id}:${a}-${b}`, a: k(c.id, a), b: k(c.id, b) });
  }
  const virtual = sources.map((s, i) => ({ id: `@a${i}`, a: '@', b: s }));
  v.air = reach([...airEdges, ...virtual], () => true, '@');
  v.air.delete('@');
  sim.v = v;
  return v;
}

function valveOn(sim, c) {
  const part = sim.parts.get(c.id);
  if (HOLD.has(c.type) || TOGGLE.has(c.type) || SENSORS.has(c.type)) return actuated(sim, c);
  return part.on;
}

/** Ejecuta las reglas del Arduino con las entradas actuales y fija el nivel de cada salida. */
function runBoards(sim) {
  const v = sim.v;
  for (const b of sim.boards) {
    const values = new Map();
    for (const row of b.rows) {
      const key = k(b.board.id, row.id);
      if (row.mode === 'analog') {
        const pot = sim.potOf.get(key);
        values.set(row.id, pot ? sim.parts.get(pot).value : v.hot5.has(key) || v.hot24.has(key) ? SIM.ADC_MAX : 0);
      } else if (row.mode === 'input_pullup' || row.mode === 'input') {
        let level;
        if (v.gnd.has(key)) level = 'LOW';
        else if (v.hot5.has(key) || v.hot24.has(key) || row.mode === 'input_pullup') level = 'HIGH';
        else {
          level = 'LOW';
          warnOnce(sim, `flota-${key}`, `${row.id} (${row.name}) queda al aire con el contacto abierto: en la vida real leería valores al azar.`);
        }
        b.levels.set(row.id, level);
        values.set(row.id, level === row.active);
      }
    }
    for (const rule of b.board.config.rules ?? []) {
      if (ruleProblem(b.rows, rule)) continue;
      const input = values.get(rule.input);
      const test = { activa: input === true, inactiva: input === false, mayor: input > Number(rule.value), menor: input < Number(rule.value) }[rule.cond];
      if (rule.action === 'seguir') b.state.set(rule.output, Boolean(test));
      else if (test) b.state.set(rule.output, rule.action === 'encender');
    }
    for (const row of b.rows.filter((r) => r.mode === 'output')) {
      const active = b.state.get(row.id) ?? false;
      const level = active ? row.active : row.active === 'HIGH' ? 'LOW' : 'HIGH';
      if (b.levels.get(row.id) !== level && b.levels.has(row.id)) log(sim, b.board.label, `${row.id} (${row.name}) pasa a ${level}.`);
      b.levels.set(row.id, level);
    }
    b.values = values;
  }
}

function delayed(sim, c, part, want, onText, offText) {
  part.timer = want === part.on ? 0 : part.timer + SIM.DT;
  if (part.timer >= SIM.DELAY - 1e-9) {
    part.on = want;
    part.timer = 0;
    log(sim, c.label, want ? onText : offText);
  }
}

/** Avanza un paso de simulación. */
function tick(sim) {
  const { project } = sim;
  solve(sim);
  runBoards(sim);
  sim.t = Math.round((sim.t + SIM.DT) * 1000) / 1000;

  for (const c of project.components) {
    const part = sim.parts.get(c.id);
    if (c.type === 'rele-24') delayed(sim, c, part, part.energized[0], 'energiza: cierran 13-14 y 23-24, abre 11-12.', 'cae: sus contactos regresan a reposo.');
    if (SOLENOID_VALVES.has(c.type)) delayed(sim, c, part, part.energized[0], 'conmuta: la bobina está energizada.', 'regresa por resorte.');
    if (c.type === 'valvula-52-bi') {
      const [y1, y2] = part.energized;
      if (y1 && !y2 && !part.on) { part.on = true; log(sim, c.label, 'conmuta con Y1 y se queda así.'); }
      if (y2 && !y1 && part.on) { part.on = false; log(sim, c.label, 'regresa con Y2 y se queda así.'); }
    }
    if (c.type === 'optoacoplador' && part.on !== part.energized[0]) {
      part.on = part.energized[0];
      log(sim, c.label, part.on ? 'recibe 24 V y activa su salida.' : 'deja de recibir 24 V.');
    }
    if (c.type === 'modulo-rele') {
      const v = sim.v;
      const powered = v.hot5.has(k(c.id, 'VCC')) && v.gnd5.has(k(c.id, 'GND'));
      let want = false;
      if (part.driver) want = part.driver.board.levels.get(part.driver.row.id) === part.driver.row.active;
      else want = v.hot5.has(k(c.id, 'IN'));
      if (want && !powered) warnOnce(sim, `sinvcc-${c.id}`, `${c.label} recibe la orden pero no tiene VCC y GND conectados al Arduino: no conmuta.`);
      delayed(sim, c, part, want && powered, 'conmuta: cierra COM-NO.', 'regresa: abre COM-NO.');
    }
  }

  // Cilindros.
  const air = sim.v.air;
  for (const c of project.components.filter((x) => x.type.startsWith('cilindro'))) {
    const part = sim.parts.get(c.id);
    let dir = 0;
    if (c.type === 'cilindro-de') {
      const rear = air.has(k(c.id, 'trasera'));
      const front = air.has(k(c.id, 'delantera'));
      dir = rear && !front ? 1 : front && !rear ? -1 : 0;
    } else {
      dir = air.has(k(c.id, 'A')) ? 1 : -1;
    }
    const before = part.pos;
    part.dir = dir;
    part.pos = Math.min(100, Math.max(0, part.pos + dir * SIM.SPEED * (part.slow ? SIM.SLOW : 1) * SIM.DT));
    if (before < 100 && part.pos >= 100) log(sim, c.label, 'llega al final de su carrera.');
    if (before > 0 && part.pos <= 0) log(sim, c.label, 'regresa al inicio.');
  }

  // Sensores y finales de carrera.
  for (const c of project.components.filter((x) => SENSORS.has(x.type))) {
    const part = sim.parts.get(c.id);
    if (!part.target) continue;
    const pos = sim.parts.get(part.target)?.pos ?? 0;
    const detect = Math.abs(pos - (part.at === 'fin' ? 100 : 0)) <= SIM.WINDOW;
    if (detect !== part.detect) {
      part.detect = detect;
      const cyl = project.components.find((x) => x.id === part.target);
      log(sim, c.label, detect ? `detecta a ${cyl.label} ${part.at === 'fin' ? 'al final' : 'al inicio'}.` : `deja de detectar a ${cyl.label}.`);
    }
  }
}

/** Avanza la simulación el tiempo indicado, en pasos fijos. */
export function advance(sim, seconds) {
  const steps = Math.max(0, Math.round(seconds / SIM.DT));
  for (let i = 0; i < steps; i += 1) tick(sim);
  solve(sim);
  return sim;
}

/** Mantener presionado o soltar un componente: pulsadores, válvulas de botón y sensores manuales. */
export function press(sim, id, down) {
  const part = sim.parts.get(id);
  const c = sim.project.components.find((x) => x.id === id);
  if (!part || part.pressed === down) return;
  part.pressed = down;
  log(sim, c.label, down ? 'se presiona.' : 'se suelta.');
  solve(sim);
}

/** Alternar un componente con enclavamiento: paro de emergencia o válvula de palanca. */
export function toggle(sim, id) {
  const part = sim.parts.get(id);
  const c = sim.project.components.find((x) => x.id === id);
  part.toggled = !part.toggled;
  log(sim, c.label, c.type === 'paro-emergencia'
    ? (part.toggled ? 'se oprime y abre el circuito.' : 'se libera y cierra el circuito.')
    : (part.toggled ? 'se mueve a la posición accionada.' : 'regresa a la posición de reposo.'));
  solve(sim);
}

export function setValue(sim, id, value) {
  sim.parts.get(id).value = Math.max(0, Math.min(SIM.ADC_MAX, Math.round(Number(value) || 0)));
}

/** Resumen para dibujar: qué cables tienen tensión, qué mangueras tienen aire y qué está activo. */
export function view(sim) {
  const v = sim.v;
  const links = new Map();
  for (const link of sim.project.links) {
    const a = keyOf(link.a);
    const b = keyOf(link.b);
    if (link.kind === 'air') links.set(link.id, v.air.has(a) && v.air.has(b) ? 'air' : '');
    else if (v.hot24.has(a) && v.hot24.has(b)) links.set(link.id, 'v24');
    else if (v.hot5.has(a) && v.hot5.has(b)) links.set(link.id, 'v5');
    else links.set(link.id, '');
  }
  const parts = new Map();
  for (const c of sim.project.components) {
    const part = sim.parts.get(c.id);
    const active = part.energized.some(Boolean) || part.on || actuated(sim, c) || part.detect;
    parts.set(c.id, { ...part, active });
  }
  return { links, parts, air: v.air, hot24: v.hot24, hot5: v.hot5 };
}
