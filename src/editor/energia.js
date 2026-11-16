// Laboratorio de energías renovables: física simplificada de potencia, ejes y agua para el editor.
//
// Simplificaciones declaradas (también se muestran en la interfaz, ver ENERGY_SIMPLIFICATIONS):
// - Balance de potencia, no circuito: cada red de potencia (bus) reparte watts entre fuentes, batería,
//   red eléctrica y cargas. No calcula corrientes, caídas de tensión ni factor de potencia.
// - Diagrama unifilar: un cable de potencia representa la ida y el retorno.
// - Prioridad fija: las cargas primero (en el orden en que se agregaron), luego cargar la batería y al
//   final exportar a la red. Si no alcanza la energía, se apagan cargas completas.
// - Eficiencias constantes: controlador 96 %, inversor 92 %, motor 85 %, generador 90 %,
//   multiplicadora 95 %, bomba 60 %, turbina 80 %.
// - Ejes rígidos: las máquinas de un mismo eje giran a la misma velocidad; la multiplicadora la cambia
//   según su relación. Sin inercia: la velocidad cambia al instante.
// - Agua sin pérdidas en tubería: una turbina o un riego toman su caudal si hay altura (río o tanque);
//   los tanques solo se vacían hacia lo que consume, no se igualan entre sí.
// - El tiempo de la energía se puede acelerar (1 s = 1 min o 10 min) para ver cargar baterías y tanques;
//   relés, válvulas y cilindros siguen en tiempo real.
import { reach } from '../engine.js';
import { definition, param } from './catalog.js';
import { keyOf } from './project.js';

export const ENERGY = {
  RHO: 1000, G: 9.81, AIR: 1.225, CP: 0.4, TSR: 7, CO2: 0.44, BAT_MIN: 10, C_RATE: 0.5,
  MPPT: 0.96, INV: 0.92, MOTOR: 0.85, GEN: 0.9, GEAR: 0.95, PUMP: 0.6, TURB: 0.8,
  MOTOR_RPM: 1750, MIN_RPM: 900, TANK_OUT: 30, COMP_MIN: 0.8, IDLE: 0.05,
};

export const ESCALAS = [
  { value: 1, label: 'Tiempo real' },
  { value: 60, label: '1 s = 1 min' },
  { value: 600, label: '1 s = 10 min' },
];

export const ENV_CONTROLS = [
  { key: 'sol', label: 'Sol (irradiancia)', unit: 'W/m²', min: 0, max: 1200, step: 10 },
  { key: 'viento', label: 'Viento', unit: 'm/s', min: 0, max: 30, step: 0.5 },
  { key: 'rio', label: 'Caudal del río', unit: 'L/s', min: 0, max: 200, step: 1 },
];

export const ENERGY_SIMPLIFICATIONS = [
  'Energía: cada red de potencia reparte watts entre fuentes, batería, red y cargas. No calcula corrientes, caídas de tensión ni factor de potencia.',
  'Los cables de potencia son unifilares: un trazo representa la ida y el retorno.',
  'Primero se atienden las cargas, luego se carga la batería y al final se exporta a la red. Si la energía no alcanza, se apagan cargas completas.',
  'Eficiencias fijas: controlador 96 %, inversor 92 %, motor 85 %, generador 90 %, multiplicadora 95 %, bomba 60 % y turbina 80 %.',
  'Las máquinas de un mismo eje giran juntas y cambian de velocidad al instante (sin inercia).',
  'El agua no pierde presión en las tuberías y los tanques no se igualan entre sí.',
  'El tiempo de la energía se puede acelerar; relés, válvulas y cilindros siguen en tiempo real.',
  'El CO₂ evitado usa un factor aproximado de 0.44 kg por kWh de la red mexicana.',
];

const SOURCES = { 'panel-solar': 'solar', aerogenerador: 'eolica', generador: 'generador' };
const LOAD_TYPES = new Set(['foco-ca', 'carga-casa', 'lampara-cd', 'motor-ca', 'motor-cd']);
const MOTORS = new Set(['motor-ca', 'motor-cd']);
const SWITCHED = new Set(['interruptor-potencia', 'contactor', 'ssr']);
export const ENERGY_TOGGLES = new Set(['interruptor-potencia', 'valvula-agua']);

const k = (c, p) => `${c}:${p}`;
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
export const isEnergy = (type) => Boolean(definition(type).energy) || type === 'compresor';

/** Grupos de puertos de un tipo de conexión, con uniones extra (contactos cerrados, válvulas abiertas). */
export function groups(project, kind, extra = []) {
  const edges = [...project.links.filter((l) => l.kind === kind).map((l) => ({ id: l.id, a: keyOf(l.a), b: keyOf(l.b) })), ...extra];
  const nodes = [];
  for (const c of project.components) {
    for (const port of definition(c.type).ports) if (port.kind === kind) nodes.push(k(c.id, port.id));
  }
  const seen = new Set();
  const out = [];
  for (const node of nodes) {
    if (seen.has(node)) continue;
    const group = reach(edges, () => true, node);
    group.forEach((m) => seen.add(m));
    out.push(group);
  }
  return out;
}

const indexOf = (list) => {
  const map = new Map();
  list.forEach((group, i) => group.forEach((key) => map.set(key, i)));
  return map;
};

/** Irradiancia de un día despejado a cierta hora: 0 de noche, 1000 W/m² al mediodía. */
export function solarAt(hour) {
  return hour <= 6 || hour >= 18 ? 0 : Math.round(1000 * Math.sin((Math.PI * (hour - 6)) / 12));
}

/** Curva de potencia de un aerogenerador pequeño: arranque 3 m/s, nominal 12 m/s, freno 25 m/s. */
export function windPower(watts, v) {
  if (v < 3 || v > 25) return 0;
  if (v >= 12) return watts;
  return watts * ((v - 3) / 9) ** 3;
}

/** Rotor eólico: potencia (W) y velocidad (rpm) con un viento v (m/s). */
export function rotor(radius, v) {
  if (v < 3 || v > 25) return { watts: 0, rpm: 0 };
  const watts = 0.5 * ENERGY.AIR * Math.PI * radius ** 2 * v ** 3 * ENERGY.CP;
  return { watts, rpm: ((ENERGY.TSR * v) / radius) * (60 / (2 * Math.PI)) };
}

/** Potencia de una turbina hidráulica (W) con caudal Q (L/s) y altura H (m). */
export const turbinePower = (q, h) => ENERGY.RHO * ENERGY.G * (q / 1000) * h * ENERGY.TURB;

/** Caudal de una bomba (L/s) con potencia en el eje P (W) y altura a vencer H (m). */
export const pumpFlow = (watts, h) => (h > 0 ? ((watts * ENERGY.PUMP) / (ENERGY.RHO * ENERGY.G * h)) * 1000 : 0);

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

// ── Ejes: grupos rígidos unidos por multiplicadoras ──────────────────────────────

/** Conjuntos de ejes que giran juntos, con el factor de velocidad de cada eje respecto al primero. */
export function shaftClusters(project) {
  const nets = groups(project, 'eje');
  const at = indexOf(nets);
  const gears = project.components.filter((c) => c.type === 'multiplicadora');
  const adj = nets.map(() => []);
  for (const g of gears) {
    const a = at.get(k(g.id, 'lento'));
    const b = at.get(k(g.id, 'rapido'));
    const r = param(g, 'relacion');
    adj[a].push({ to: b, f: r });
    adj[b].push({ to: a, f: 1 / r });
  }
  const seen = new Map();
  const clusters = [];
  nets.forEach((_, start) => {
    if (seen.has(start)) return;
    const cluster = { nets: [], factor: new Map(), gears: 0 };
    const stack = [start];
    cluster.factor.set(start, 1);
    seen.set(start, clusters.length);
    while (stack.length) {
      const n = stack.pop();
      cluster.nets.push(n);
      for (const { to, f } of adj[n]) {
        if (seen.has(to)) continue;
        seen.set(to, clusters.length);
        cluster.factor.set(to, cluster.factor.get(n) * f);
        stack.push(to);
      }
    }
    clusters.push(cluster);
  });
  for (const g of gears) clusters[seen.get(at.get(k(g.id, 'lento')))].gears += 1;
  return { nets, at, clusters, clusterOf: seen };
}

// ── Inicio ───────────────────────────────────────────────────────────────────

export function createEnergy(sim) {
  const { project } = sim;
  sim.env = { sol: 800, viento: 8, rio: 15, escala: 60, dia: false, hora: 12 };
  sim.energy = {
    totals: { solar: 0, eolica: 0, hidraulica: 0, generador: 0, consumo: 0, importada: 0, exportada: 0, recortada: 0 },
    now: { gen: 0, consumo: 0, bateria: 0, red: 0 },
    keys: new Map(),
    shafts: shaftClusters(project),
    has: project.components.some((c) => isEnergy(c.type)),
  };
  for (const c of project.components) {
    const part = sim.parts.get(c.id);
    if (c.type === 'bateria') part.soc = param(c, 'inicio');
    if (c.type === 'tanque') part.litros = (param(c, 'capacidad') * param(c, 'inicio')) / 100;
    if (ENERGY_TOGGLES.has(c.type)) part.toggled = true;   // interruptor cerrado y válvula abierta
    if (MOTORS.has(c.type)) { part.request = param(c, 'watts') * ENERGY.IDLE; part.fed = 0; }
    if (c.type === 'bomba') Object.assign(part, { q: 0, qWant: 0, qIn: 0, hDest: 0 });
    part.watts = 0;
  }
  // Altura que vence cada bomba: la del tanque al que descarga (+2 m de pérdidas) o 10 m.
  const water = groups(project, 'agua', project.components.filter((c) => c.type === 'valvula-agua')
    .map((c) => ({ id: `${c.id}:v`, a: k(c.id, 'in'), b: k(c.id, 'out') })));
  const wAt = indexOf(water);
  for (const c of project.components.filter((x) => x.type === 'bomba')) {
    const net = water[wAt.get(k(c.id, 'out'))];
    const tanks = project.components.filter((t) => t.type === 'tanque' && net.has(k(t.id, 'entrada')));
    sim.parts.get(c.id).hDest = (tanks.length ? Math.max(...tanks.map((t) => param(t, 'altura'))) : 10) + 2;
  }
  // Flotadores: vigilan el tanque más cercano.
  const center = (c) => [c.x + definition(c.type).w / 2, c.y + definition(c.type).h / 2];
  const tanks = project.components.filter((c) => c.type === 'tanque');
  for (const f of project.components.filter((c) => c.type === 'flotador')) {
    const [fx, fy] = center(f);
    const near = [...tanks].sort((a, b) => Math.hypot(...center(a).map((v, i) => v - [fx, fy][i])) - Math.hypot(...center(b).map((v, i) => v - [fx, fy][i])))[0];
    sim.parts.get(f.id).target = near?.id ?? null;
  }
}

/** Cambia una condición del ambiente: sol, viento, río, escala de tiempo o ciclo de día. */
export function setEnv(sim, key, value) {
  if (!sim.env) return;
  if (key === 'dia') sim.env.dia = Boolean(value);
  else if (key === 'escala') sim.env.escala = ESCALAS.some((e) => e.value === Number(value)) ? Number(value) : 60;
  else {
    const ctl = ENV_CONTROLS.find((c) => c.key === key);
    if (ctl) sim.env[key] = Math.max(ctl.min, Math.min(ctl.max, Number(value) || 0));
  }
}

// ── Paso de simulación ───────────────────────────────────────────────────────

export function stepEnergy(sim, dt) {
  if (!sim.energy?.has) return;
  const env = sim.env;
  const dtE = dt * env.escala;
  if (env.dia) {
    env.hora = (env.hora + dtE / 3600) % 24;
    env.sol = solarAt(env.hora);
  }
  sim.energy.keys = new Map();
  relays(sim);
  water(sim, dtE);
  shafts(sim);
  buses(sim, dtE);
  floats(sim);
}

function relays(sim) {
  const v = sim.v;
  for (const c of sim.project.components.filter((x) => x.type === 'ssr')) {
    const part = sim.parts.get(c.id);
    const on = (v.hot5.has(k(c.id, 'IN')) || v.hot24.has(k(c.id, 'IN'))) && v.gnd.has(k(c.id, 'GND'));
    if (on !== part.on) {
      part.on = on;
      log(sim, c.label, on ? 'recibe la señal y cierra el contacto de potencia.' : 'abre el contacto de potencia.');
    }
  }
}

function floats(sim) {
  for (const c of sim.project.components.filter((x) => x.type === 'flotador')) {
    const part = sim.parts.get(c.id);
    const tank = sim.project.components.find((t) => t.id === part.target);
    if (!tank) continue;
    const level = (sim.parts.get(tank.id).litros / param(tank, 'capacidad')) * 100;
    const detect = level >= param(c, 'nivel');
    if (detect !== part.detect) {
      part.detect = detect;
      log(sim, c.label, detect ? `cierra: ${tank.label} llegó a ${param(c, 'nivel')} %.` : `abre: ${tank.label} bajó de ${param(c, 'nivel')} %.`);
    }
  }
}

// ── Agua ─────────────────────────────────────────────────────────────────────

function water(sim, dtE) {
  const { project, env } = sim;
  const extra = project.components.filter((c) => c.type === 'valvula-agua' && sim.parts.get(c.id).toggled)
    .map((c) => ({ id: `${c.id}:v`, a: k(c.id, 'in'), b: k(c.id, 'out') }));
  const nets = groups(project, 'agua', extra);
  const at = indexOf(nets);
  const N = nets.map(() => ({ forced: 0, gravity: [], cisterna: false, head: 0, demands: [], tanksIn: [], flow: 0 }));
  const net = (c, p) => N[at.get(k(c.id, p))];
  for (const c of project.components) {
    const part = sim.parts.get(c.id);
    if (c.type === 'rio') {
      const n = net(c, 'out');
      n.forced += env.rio;
      n.head = Math.max(n.head, param(c, 'altura'));
    } else if (c.type === 'bomba') {
      net(c, 'out').forced += part.q;
      net(c, 'out').pumped = true;
      net(c, 'in').demands.push({ c, part, q: part.qWant, kind: 'bomba' });
    } else if (c.type === 'turbina-hidraulica') {
      net(c, 'in').demands.push({ c, part, q: param(c, 'caudal'), kind: 'turbina' });
      if (definition(c.type).ports.some((p) => p.id === 'out')) net(c, 'out').forced += part.qGot ?? 0;
    } else if (c.type === 'riego') {
      net(c, 'in').demands.push({ c, part, q: param(c, 'caudal'), kind: 'riego' });
    } else if (c.type === 'tanque') {
      net(c, 'entrada').tanksIn.push({ c, part });
      if (part.litros > 0) {
        const n = net(c, 'salida');
        n.gravity.push({ c, part, cap: Math.min(ENERGY.TANK_OUT, part.litros / dtE) });
        n.head = Math.max(n.head, param(c, 'altura'));
      }
    } else if (c.type === 'cisterna') net(c, 'agua').cisterna = true;
  }
  const delta = new Map();
  const add = (part, liters) => delta.set(part, (delta.get(part) ?? 0) + liters);
  N.forEach((n, i) => {
    let forced = n.forced;
    let used = 0;
    const order = { turbina: 0, riego: 1, bomba: 2 };
    for (const d of n.demands.sort((a, b) => order[a.kind] - order[b.kind])) {
      let need = d.q;
      const gravityOk = d.kind === 'bomba' || n.head > 0 || n.pumped;
      if (!gravityOk) need = 0;
      const f = Math.min(forced, need);
      forced -= f;
      need -= f;
      for (const g of n.gravity) {
        if (need <= 0) break;
        const take = Math.min(g.cap, need);
        g.cap -= take;
        need -= take;
        add(g.part, -take * dtE);
      }
      if (need > 0 && d.kind === 'bomba' && n.cisterna) need = 0;
      d.got = gravityOk ? d.q - need : 0;
      d.head = n.head;
      used += d.got;
    }
    // Lo que sobra del caudal forzado (río, bombas, descargas) entra a los tanques o a la cisterna.
    if (forced > 0 && n.tanksIn.length) {
      for (const t of n.tanksIn) add(t.part, (forced / n.tanksIn.length) * dtE);
      used += forced;
    } else if (forced > 0 && n.cisterna) used += forced;
    n.flow = used;
    for (const key of nets[i]) if (n.flow > 1e-6) sim.energy.keys.set(key, 'flow');
    for (const d of n.demands) {
      if (d.kind === 'bomba') d.part.qIn = d.got;
      else {
        d.part.qGot = d.got;
        d.part.head = d.head;
      }
    }
    if (n.pumped && !n.tanksIn.length && !n.cisterna && !n.demands.some((d) => d.got > 0)) {
      for (const c of project.components.filter((x) => x.type === 'bomba' && at.get(k(x.id, 'out')) === i)) {
        sim.parts.get(c.id).blocked = true;
        warnOnce(sim, `ahogada-${c.id}`, `${c.label} descarga a una tubería cerrada: no circula agua. Conecta su descarga a un tanque o abre la válvula.`);
      }
    }
  });
  for (const c of project.components.filter((x) => x.type === 'tanque')) {
    const part = sim.parts.get(c.id);
    const cap = param(c, 'capacidad');
    const before = part.litros;
    part.litros = Math.max(0, Math.min(cap, part.litros + (delta.get(part) ?? 0)));
    if (before < cap && part.litros >= cap) log(sim, c.label, 'se llenó: lo que sigue llegando se derrama.');
    if (before > 0 && part.litros <= 0) log(sim, c.label, 'se vació.');
  }
}

// ── Ejes ─────────────────────────────────────────────────────────────────────

function shafts(sim) {
  const { project, env } = sim;
  const { at, clusters, clusterOf } = sim.energy.shafts;
  const members = clusters.map(() => []);
  for (const c of project.components) {
    for (const port of definition(c.type).ports.filter((p) => p.kind === 'eje')) {
      if (c.type === 'multiplicadora') continue;
      const n = at.get(k(c.id, port.id));
      members[clusterOf.get(n)].push({ c, part: sim.parts.get(c.id), net: n });
    }
  }
  clusters.forEach((cluster, ci) => {
    const list = members[ci];
    const drivers = [];
    for (const m of list) {
      const { c, part } = m;
      if (c.type === 'rotor-eolico') {
        const r = rotor(param(c, 'radio'), env.viento);
        if (env.viento > 25) warnOnce(sim, `freno-${c.id}`, `${c.label} se frena: el viento pasa de 25 m/s.`);
        drivers.push({ ...m, avail: r.watts, rpm: r.rpm, origin: 'eolica' });
      } else if (c.type === 'turbina-hidraulica') {
        const q = part.qGot ?? 0;
        const h = part.head ?? 0;
        drivers.push({ ...m, avail: turbinePower(q, h), rpm: q > 0 ? Math.min(3000, 1500 * Math.sqrt(h / 25)) : 0, origin: 'hidraulica' });
      } else if (MOTORS.has(c.type)) {
        const fed = part.fed ?? 0;
        drivers.push({ ...m, avail: param(c, 'watts') * fed, rpm: fed > 0.01 ? ENERGY.MOTOR_RPM : 0, origin: 'motor' });
      }
    }
    const ref = drivers.filter((d) => d.rpm > 0).sort((a, b) => b.avail - a.avail)[0];
    const base = ref ? ref.rpm / cluster.factor.get(ref.net) : 0;
    const rpmAt = (net) => base * cluster.factor.get(net);
    const lossy = ENERGY.GEAR ** cluster.gears;
    const total = drivers.reduce((s, d) => s + (d.rpm > 0 ? d.avail : 0), 0);
    let left = total * lossy;
    let consumed = 0;
    for (const m of list) {
      m.part.rpm = rpmAt(m.net);
      if (m.part.rpm > 0) for (const n of cluster.nets) for (const key of sim.energy.shafts.nets[n]) sim.energy.keys.set(key, 'spin');
    }
    for (const m of list.filter((x) => x.c.type === 'bomba' || x.c.type === 'compresor')) {
      const { c, part } = m;
      const want = param(c, 'watts');
      const fast = part.rpm >= ENERGY.MIN_RPM;
      if (part.rpm > 0 && !fast) warnOnce(sim, `lento-${c.id}`, `${c.label} gira a ${Math.round(part.rpm)} rpm y necesita al menos ${ENERGY.MIN_RPM}: agrega una multiplicadora.`);
      const got = fast ? Math.min(left, want) : 0;
      left -= got;
      consumed += got;
      part.watts = got;
      if (c.type === 'bomba') {
        part.qWant = part.blocked ? 0 : pumpFlow(got, part.hDest);
        part.q = Math.min(part.qWant, part.qIn ?? 0);
        if (part.qWant > 0 && (part.qIn ?? 0) <= 0) warnOnce(sim, `seca-${c.id}`, `${c.label} gira pero no tiene agua en la succión: conéctala a una cisterna, río o tanque.`);
      } else {
        const on = got >= want * ENERGY.COMP_MIN;
        if (on !== part.on) log(sim, c.label, on ? 'alcanza 6 bar y entrega aire.' : 'no alcanza la presión: deja de entregar aire.');
        part.on = on;
      }
    }
    const gens = list.filter((x) => x.c.type === 'generador');
    for (const m of gens) {
      const { c, part } = m;
      const share = gens.length ? left / gens.length : 0;
      const speed = Math.min(1, part.rpm / param(c, 'rpm'));
      const shaftIn = Math.min(share, param(c, 'watts') / ENERGY.GEN);
      part.gen = Math.min(param(c, 'watts'), shaftIn * ENERGY.GEN * speed);
      part.origin = ref?.origin ?? 'generador';
      consumed += shaftIn;
      if (part.rpm > 1.5 * param(c, 'rpm')) warnOnce(sim, `sobre-${c.id}`, `${c.label} gira a ${Math.round(part.rpm)} rpm, más de 1.5 veces su velocidad nominal: en la vida real se daña. Baja la relación de la multiplicadora.`);
    }
    // Lo que entrega cada máquina motriz, en proporción a lo que pudo dar.
    for (const d of drivers) {
      const share = total > 0 && d.rpm > 0 ? d.avail / total : 0;
      const out = (consumed / lossy) * share;
      d.part.watts = out;
      if (MOTORS.has(d.c.type)) d.part.request = Math.max(param(d.c, 'watts') * ENERGY.IDLE, Math.min(param(d.c, 'watts'), out) / ENERGY.MOTOR);
    }
    for (const m of list) if (MOTORS.has(m.c.type) && !drivers.some((d) => d.c.id === m.c.id)) m.part.request = 0;
  });
}

// ── Buses de potencia ────────────────────────────────────────────────────────

function closed(sim, c) {
  const part = sim.parts.get(c.id);
  return c.type === 'interruptor-potencia' ? part.toggled : part.on;
}

function buses(sim, dtE) {
  const { project, env } = sim;
  const extra = project.components.filter((c) => SWITCHED.has(c.type) && closed(sim, c))
    .map((c) => ({ id: `${c.id}:12`, a: k(c.id, '1'), b: k(c.id, '2') }));
  const nets = groups(project, 'pot', extra);
  const at = indexOf(nets);
  const B = nets.map((keys, i) => ({ i, keys, sources: [], loads: [], batteries: [], grid: null, inConv: [], outConv: [], inflow: 0, flow: 0 }));
  const bus = (c, p) => B[at.get(k(c.id, p))];
  const convs = [];
  for (const c of project.components) {
    const part = sim.parts.get(c.id);
    if (SOURCES[c.type]) {
      let avail = 0;
      if (c.type === 'panel-solar') avail = (param(c, 'watts') * env.sol) / 1000;
      if (c.type === 'aerogenerador') avail = windPower(param(c, 'watts'), env.viento);
      if (c.type === 'generador') avail = part.gen ?? 0;
      bus(c, 'out').sources.push({ c, part, avail, kind: c.type === 'generador' ? (part.origin === 'motor' ? 'generador' : part.origin ?? 'generador') : SOURCES[c.type] });
    } else if (c.type === 'controlador-carga' || c.type === 'inversor') {
      const conv = { c, part, from: bus(c, 'in'), to: bus(c, c.type === 'inversor' ? 'out' : 'bat'), eff: c.type === 'inversor' ? ENERGY.INV : ENERGY.MPPT, max: param(c, 'watts'), got: 0 };
      if (conv.from === conv.to) continue;
      convs.push(conv);
      conv.from.outConv.push(conv);
      conv.to.inConv.push(conv);
    } else if (c.type === 'bateria') {
      bus(c, 'bus').batteries.push({ c, part, cap: param(c, 'capacidad') });
    } else if (c.type === 'red-electrica') {
      bus(c, 'out').grid = { c, part };
    } else if (LOAD_TYPES.has(c.type)) {
      const want = MOTORS.has(c.type) ? part.request ?? 0 : param(c, 'watts');
      bus(c, 'in').loads.push({ c, part, want });
    }
  }
  // El controlador de carga necesita una batería del lado de salida para trabajar.
  for (const conv of convs.filter((x) => x.c.type === 'controlador-carga')) {
    if (!conv.to.batteries.length) {
      conv.max = 0;
      warnOnce(sim, `ccsinbat-${conv.c.id}`, `${conv.c.label} no tiene batería en su salida: un controlador de carga no entrega energía sin batería.`);
    }
  }
  // Orden de los buses: de las fuentes hacia las cargas, siguiendo los convertidores.
  const indeg = B.map((b) => b.inConv.length);
  const order = [];
  const queue = B.filter((b, i) => indeg[i] === 0);
  while (queue.length) {
    const b = queue.shift();
    order.push(b);
    for (const conv of b.outConv) if (--indeg[conv.to.i] === 0) queue.push(conv.to);
  }
  for (const b of B) if (!order.includes(b)) order.push(b);

  const room = (bat) => {
    const soc = bat.part.soc;
    return soc >= 100 ? 0 : Math.min(bat.cap * ENERGY.C_RATE, (((100 - soc) / 100) * bat.cap * 3600) / dtE);
  };
  const reserve = (bat) => {
    const soc = bat.part.soc;
    return soc <= ENERGY.BAT_MIN ? 0 : Math.min(bat.cap * ENERGY.C_RATE, (((soc - ENERGY.BAT_MIN) / 100) * bat.cap * 3600) / dtE);
  };
  // Pasada de demanda: de las cargas hacia las fuentes.
  for (const b of [...order].reverse()) {
    const local = b.sources.reduce((s, x) => s + x.avail, 0);
    const firmOut = b.outConv.reduce((s, conv) => {
      conv.firmReq = Math.min(conv.max, conv.to.need ?? 0) / conv.eff;
      return s + conv.firmReq;
    }, 0);
    b.need = Math.max(0, b.loads.reduce((s, l) => s + l.want, 0) + firmOut - local);
    const softOut = b.outConv.reduce((s, conv) => {
      conv.softReq = Math.max(0, Math.min(conv.max - conv.firmReq * conv.eff, conv.to.soft ?? 0)) / conv.eff;
      return s + conv.softReq;
    }, 0);
    b.soft = b.batteries.reduce((s, bat) => s + room(bat), 0) + (b.grid ? Infinity : 0) + softOut;
  }
  const now = { gen: 0, consumo: 0, bateria: 0, red: 0 };
  // Pasada de energía: de las fuentes hacia las cargas.
  for (const b of order) {
    // Inversor: si sus cargas piden más que su potencia, se protege.
    for (const conv of b.inConv.filter((x) => x.c.type === 'inversor')) {
      const over = (b.loads.reduce((s, l) => s + l.want, 0)) > conv.max && !b.grid;
      if (over && !conv.part.trip) log(sim, conv.c.label, `se sobrecarga (las cargas piden más de ${conv.max} W) y se apaga para protegerse.`);
      if (!over && conv.part.trip) log(sim, conv.c.label, 'se restablece.');
      conv.part.trip = over;
    }
    const renewable = b.sources.reduce((s, x) => s + x.avail, 0) + b.inflow;
    let supply = renewable;
    let battery = b.batteries.reduce((s, bat) => s + reserve(bat), 0);
    let discharged = 0;
    let imported = 0;
    const draw = (want) => {
      const f = Math.min(supply, want);
      supply -= f;
      let rest = want - f;
      const d = Math.min(battery, rest);
      battery -= d;
      discharged += d;
      rest -= d;
      if (rest > 0 && b.grid) { imported += rest; rest = 0; }
      return want - rest;
    };
    for (const l of b.loads) {
      const avail = supply + battery + (b.grid ? Infinity : 0);
      l.got = l.want > 0 && avail >= l.want - 1e-9 ? draw(l.want) : 0;
      const served = MOTORS.has(l.c.type) ? (l.want > 0 ? l.got / l.want : 0) : l.got > 0 ? 1 : 0;
      if (MOTORS.has(l.c.type)) l.part.fed = served;
      const on = l.got > 0;
      if (on !== l.part.on && !MOTORS.has(l.c.type)) log(sim, l.c.label, on ? 'enciende.' : 'se apaga: no le llega energía suficiente.');
      l.part.on = on;
      l.part.watts = l.got;
      now.consumo += l.got;
    }
    for (const conv of b.outConv) {
      const firm = conv.part.trip ? 0 : draw(conv.firmReq);
      const soft = conv.part.trip ? 0 : Math.min(supply, conv.softReq);
      supply -= soft;
      conv.got = firm + soft;
      conv.part.watts = conv.got * conv.eff;
      conv.to.inflow += conv.got * conv.eff;
    }
    let charged = 0;
    for (const bat of b.batteries) {
      const c = Math.min(supply, room(bat));
      supply -= c;
      charged += c;
      bat.charge = c;
    }
    let exported = 0;
    if (b.grid) { exported = supply; supply = 0; }
    const curtailed = supply;
    // Baterías: carga o descarga repartida por capacidad.
    const capTotal = b.batteries.reduce((s, bat) => s + bat.cap, 0);
    for (const bat of b.batteries) {
      const share = capTotal ? bat.cap / capTotal : 0;
      const net = (bat.charge ?? 0) - discharged * share;
      const before = bat.part.soc;
      bat.part.soc = Math.max(0, Math.min(100, bat.part.soc + ((net * dtE) / 3600 / bat.cap) * 100));
      bat.part.watts = net;
      if (before > ENERGY.BAT_MIN && bat.part.soc <= ENERGY.BAT_MIN + 1e-9) log(sim, bat.c.label, `llegó a ${ENERGY.BAT_MIN} %: se protege y deja de entregar energía.`);
      if (before < 100 && bat.part.soc >= 100 - 1e-9) log(sim, bat.c.label, 'se cargó al 100 %.');
      now.bateria += net;
    }
    if (b.grid) {
      b.grid.part.watts = imported - exported;
      now.red += imported - exported;
      sim.energy.totals.importada += (imported * dtE) / 3600;
      sim.energy.totals.exportada += (exported * dtE) / 3600;
    }
    // Generación aprovechada por tipo de fuente (la parte recortada no cuenta).
    const local = b.sources.reduce((s, x) => s + x.avail, 0);
    const usedLocal = Math.max(0, local - Math.max(0, curtailed - b.inflow));
    for (const s of b.sources) {
      const used = local > 0 ? (s.avail / local) * usedLocal : 0;
      s.part.watts = used;
      now.gen += used;
      sim.energy.totals[s.kind] = (sim.energy.totals[s.kind] ?? 0) + (used * dtE) / 3600;
    }
    sim.energy.totals.recortada += (Math.max(0, curtailed) * dtE) / 3600;
    b.flow = renewable - curtailed + discharged + imported;
    if (b.flow > 1e-6) for (const key of b.keys) sim.energy.keys.set(key, 'pw');
  }
  sim.energy.totals.consumo += (now.consumo * dtE) / 3600;
  sim.energy.now = now;
}

// ── Vista ────────────────────────────────────────────────────────────────────

export const fmtW = (w) => (Math.abs(w) >= 1000 ? `${round(w / 1000, 2)} kW` : `${Math.round(w)} W`);
export const fmtWh = (wh) => (Math.abs(wh) >= 1000 ? `${round(wh / 1000, 2)} kWh` : `${Math.round(wh)} Wh`);

/** Texto corto del estado de un componente de energía durante la simulación ('' si no aplica). */
export function energyText(sim, c) {
  const part = sim.parts.get(c.id);
  if (!sim.energy?.has || !part) return '';
  switch (c.type) {
    case 'panel-solar': case 'aerogenerador': case 'controlador-carga': return fmtW(part.watts);
    case 'generador': return `${Math.round(part.rpm ?? 0)} rpm · ${fmtW(part.watts)}`;
    case 'inversor': return part.trip ? 'sobrecarga' : fmtW(part.watts);
    case 'bateria': return `${Math.round(part.soc)} % · ${part.watts > 1 ? 'carga' : part.watts < -1 ? 'entrega' : 'reposo'} ${fmtW(Math.abs(part.watts))}`;
    case 'red-electrica': return part.watts > 1 ? `importa ${fmtW(part.watts)}` : part.watts < -1 ? `exporta ${fmtW(-part.watts)}` : 'sin flujo';
    case 'foco-ca': case 'carga-casa': case 'lampara-cd': return part.on ? fmtW(part.watts) : 'sin energía';
    case 'motor-ca': case 'motor-cd': return part.rpm > 0 ? `${Math.round(part.rpm)} rpm · ${fmtW(part.watts)}` : 'detenido';
    case 'rotor-eolico': case 'turbina-hidraulica': return part.rpm > 0 ? `${Math.round(part.rpm)} rpm · ${fmtW(part.watts)}` : 'detenido';
    case 'multiplicadora': return '';
    case 'bomba': return part.q > 0 ? `${round(part.q, 2)} L/s` : (part.rpm ?? 0) > 0 ? 'sin bombear' : 'detenida';
    case 'compresor': return part.on ? '6 bar' : 'sin presión';
    case 'tanque': return `${Math.round((part.litros / param(c, 'capacidad')) * 100)} % · ${Math.round(part.litros)} L`;
    case 'riego': return part.qGot > 0 ? `${round(part.qGot, 1)} L/s` : 'sin agua';
    case 'valvula-agua': return part.toggled ? 'abierta' : 'cerrada';
    case 'interruptor-potencia': return part.toggled ? 'cerrado' : 'abierto';
    case 'contactor': case 'ssr': return part.on ? 'cerrado' : 'abierto';
    default: return '';
  }
}

/** ¿El componente está produciendo, consumiendo o moviéndose? */
export function energyActive(sim, c) {
  const part = sim.parts.get(c.id);
  if (!part) return false;
  if (c.type === 'tanque') return part.litros > 0;
  if (c.type === 'bomba') return part.q > 0;
  if (c.type === 'riego') return part.qGot > 0;
  if (ENERGY_TOGGLES.has(c.type)) return part.toggled;
  return Math.abs(part.watts ?? 0) > 0.5 || (part.rpm ?? 0) > 0 || Boolean(part.on);
}

/** Estado de una conexión de energía: 'pw' (con potencia), 'spin' (eje girando), 'flow' (agua) o ''. */
export function energyLink(sim, link) {
  const keys = sim.energy?.keys;
  if (!keys) return '';
  const a = keys.get(keyOf(link.a));
  return a && a === keys.get(keyOf(link.b)) ? a : '';
}

// ── Revisión (reglas fijas sobre las conexiones) ─────────────────────────────

export function reviewEnergy(project) {
  const findings = [];
  const label = (c) => c.label;
  const allClosed = project.components.filter((c) => SWITCHED.has(c.type))
    .map((c) => ({ id: `${c.id}:12`, a: k(c.id, '1'), b: k(c.id, '2') }));
  for (const group of groups(project, 'pot', allClosed)) {
    const list = [...group].map((key) => {
      const [cid, p] = key.split(':');
      const c = project.components.find((x) => x.id === cid);
      return { c, port: definition(c.type).ports.find((x) => x.id === p) };
    });
    const by = (domain) => list.filter((m) => m.port.domain === domain);
    const where = (items) => [...new Set(items.map((m) => m.c.id))];
    const names = (items) => [...new Set(items.map((m) => `${m.c.label}:${m.port.label}`))].join(', ');
    const gen = by('gen');
    const cd = by('cd');
    const ca = by('ca');
    if (gen.length && cd.length) {
      findings.push({ level: 'error', code: 'generacion-a-bateria', where: where([...gen, ...cd]),
        text: `Una fuente renovable va directo al bus de la batería (${names([...gen, ...cd])}). Su tensión cambia con el sol o el viento: sobrecarga o daña la batería.`,
        suggest: [{ type: 'controlador-carga', text: 'Pon un controlador de carga: la fuente a su entrada y la batería a su salida.' }] });
    }
    if (gen.length && ca.length) {
      findings.push({ level: 'error', code: 'generacion-a-ca', where: where([...gen, ...ca]),
        text: `Una fuente renovable va directo a una red de 120 V de CA (${names([...gen, ...ca])}). Primero se guarda en batería y luego se convierte con un inversor.`,
        suggest: [{ type: 'controlador-carga', text: 'Agrega un controlador de carga y una batería; después, un inversor para la CA.' }] });
    }
    if (cd.length && ca.length) {
      findings.push({ level: 'error', code: 'cd-con-ca', where: where([...cd, ...ca]),
        text: `Se mezclan corriente directa y alterna en una misma red (${names([...cd, ...ca])}).`,
        suggest: [{ type: 'inversor', text: 'Para alimentar cargas de CA desde la batería, usa un inversor: CD a su entrada y CA a su salida.' }] });
    }
    const bats = list.filter((m) => m.c.type === 'bateria');
    const volts = [...new Set(bats.map((m) => param(m.c, 'volts')))];
    if (volts.length > 1) {
      findings.push({ level: 'error', code: 'baterias-distinta-tension', where: where(bats),
        text: `Hay baterías de ${volts.join(' V y ')} V en la misma red: se descargan una en otra.` });
    }
    if (volts.length === 1) {
      const wrong = cd.filter((m) => m.c.type !== 'bateria' && m.c.type !== 'controlador-carga' && param(m.c, 'volts') !== undefined && param(m.c, 'volts') !== volts[0]);
      if (wrong.length) {
        findings.push({ level: 'error', code: 'tension-cd', where: where(wrong),
          text: `${wrong.map((m) => `${label(m.c)} es de ${param(m.c, 'volts')} V`).join(', ')} y la batería es de ${volts[0]} V. Cambia su tensión en Selección.` });
      }
    }
    const consumers = cd.filter((m) => m.c.type !== 'bateria' && m.c.type !== 'controlador-carga');
    if (!bats.length && consumers.length) {
      findings.push({ level: 'aviso', code: 'cd-sin-bateria', where: where(consumers),
        text: `${names(consumers)} está en una red de CD sin batería: nada le entrega energía.`,
        suggest: [{ type: 'bateria', text: 'Agrega un banco de baterías a esa red.' }] });
    }
    const ccOut = cd.filter((m) => m.c.type === 'controlador-carga');
    if (!bats.length && ccOut.length) {
      findings.push({ level: 'aviso', code: 'controlador-sin-bateria', where: where(ccOut),
        text: `${names(ccOut)} no tiene batería en su salida: un controlador de carga no trabaja sin batería.`,
        suggest: [{ type: 'bateria', text: 'Conecta una batería a la salida del controlador.' }] });
    }
    const caLoads = ca.filter((m) => LOAD_TYPES.has(m.c.type));
    const caSources = ca.filter((m) => m.c.type === 'inversor' || m.c.type === 'red-electrica');
    if (caLoads.length && !caSources.length) {
      findings.push({ level: 'aviso', code: 'ca-sin-fuente', where: where(caLoads),
        text: `${names(caLoads)} está en una red de CA sin inversor ni red eléctrica.`,
        suggest: [{ type: 'inversor', text: 'Alimenta esa red con un inversor (desde la batería) o con la red eléctrica.' }] });
    }
    const loose = gen.filter((m) => SOURCES[m.c.type]);
    if (loose.length && !gen.some((m) => m.c.type === 'controlador-carga')) {
      findings.push({ level: 'aviso', code: 'generacion-sin-uso', where: where(loose),
        text: `La energía de ${names(loose)} no llega a ningún lado: conéctala a la entrada de un controlador de carga.`,
        suggest: [{ type: 'controlador-carga', text: 'Agrega un controlador de carga.' }] });
    }
  }

  // Ejes: velocidad con un viento de 10 m/s o con el motor a su velocidad nominal.
  const { clusters, clusterOf, at } = shaftClusters(project);
  const onShaft = clusters.map(() => []);
  for (const c of project.components) {
    if (c.type === 'multiplicadora') continue;
    for (const port of definition(c.type).ports.filter((p) => p.kind === 'eje')) {
      const n = at.get(k(c.id, port.id));
      onShaft[clusterOf.get(n)].push({ c, net: n });
    }
  }
  clusters.forEach((cluster, i) => {
    const list = onShaft[i];
    const drivers = list.filter((m) => ['rotor-eolico', 'turbina-hidraulica', 'motor-ca', 'motor-cd'].includes(m.c.type));
    const loads = list.filter((m) => ['generador', 'bomba', 'compresor'].includes(m.c.type));
    if (loads.length && !drivers.length) {
      findings.push({ level: 'aviso', code: 'eje-sin-motriz', where: loads.map((m) => m.c.id),
        text: `Nada mueve el eje de ${loads.map((m) => m.c.label).join(', ')}: acóplalo a un motor, un rotor eólico o una turbina.` });
      return;
    }
    const d = drivers[0];
    if (!d) return;
    const rpm = d.c.type === 'rotor-eolico' ? rotor(param(d.c, 'radio'), 10).rpm : d.c.type === 'turbina-hidraulica' ? 1500 : ENERGY.MOTOR_RPM;
    const base = rpm / cluster.factor.get(d.net);
    for (const m of loads) {
      const r = base * cluster.factor.get(m.net);
      const need = m.c.type === 'generador' ? param(m.c, 'rpm') : ENERGY.MIN_RPM;
      const cond = d.c.type === 'rotor-eolico' ? ' con viento de 10 m/s' : '';
      if (r < (m.c.type === 'generador' ? 0.5 * need : need)) {
        findings.push({ level: 'aviso', code: 'eje-lento', where: [m.c.id, d.c.id],
          text: `${m.c.label} giraría a ${Math.round(r)} rpm${cond} y necesita ${need}: ${m.c.type === 'generador' ? 'entregaría muy poca energía' : 'no funcionaría'}.`,
          suggest: [{ type: 'multiplicadora', text: `Pon una multiplicadora de relación ${round(need / r, 1)}:1 entre ${d.c.label} y ${m.c.label}.` }] });
      } else if (m.c.type === 'generador' && r > 1.5 * need) {
        findings.push({ level: 'aviso', code: 'eje-sobrevelocidad', where: [m.c.id],
          text: `${m.c.label} giraría a ${Math.round(r)} rpm${cond}, más de 1.5 veces sus ${need} rpm: baja la relación de la multiplicadora.` });
      }
    }
  });

  // Agua.
  const wnets = groups(project, 'agua', project.components.filter((c) => c.type === 'valvula-agua')
    .map((c) => ({ id: `${c.id}:v`, a: k(c.id, 'in'), b: k(c.id, 'out') })));
  const wAt = indexOf(wnets);
  const inNet = (c, p) => wnets[wAt.get(k(c.id, p))];
  const has = (net, test) => project.components.some((x) => definition(x.type).ports.some((p) => p.kind === 'agua' && net.has(k(x.id, p.id)) && test(x, p)));
  for (const c of project.components) {
    if (c.type === 'bomba') {
      if (!has(inNet(c, 'in'), (x, p) => x.type === 'cisterna' || x.type === 'rio' || (x.type === 'tanque' && p.id === 'salida'))) {
        findings.push({ level: 'aviso', code: 'bomba-sin-agua', where: [c.id], text: `${c.label} no tiene de dónde succionar agua.`,
          suggest: [{ type: 'cisterna', text: 'Conecta su succión a una cisterna, un río o la salida de un tanque.' }] });
      }
      if (!has(inNet(c, 'out'), (x, p) => (x.type === 'tanque' && p.id === 'entrada') || x.type === 'riego' || x.type === 'cisterna' || x.type === 'turbina-hidraulica')) {
        findings.push({ level: 'aviso', code: 'bomba-sin-destino', where: [c.id], text: `La descarga de ${c.label} no llega a ningún tanque ni consumo.`,
          suggest: [{ type: 'tanque', text: 'Conecta su descarga a la entrada de un tanque elevado.' }] });
      }
    }
    if (c.type === 'turbina-hidraulica' || c.type === 'riego') {
      if (!has(inNet(c, 'in'), (x, p) => x.type === 'rio' || (x.type === 'tanque' && p.id === 'salida') || (x.type === 'bomba' && p.id === 'out'))) {
        findings.push({ level: 'aviso', code: 'agua-sin-caida', where: [c.id], text: `A ${c.label} no le llega agua con altura o presión.`,
          suggest: [{ type: c.type === 'turbina-hidraulica' ? 'rio' : 'tanque', text: c.type === 'turbina-hidraulica' ? 'Conecta su entrada a un río o a la salida de un tanque elevado.' : 'Alimenta el riego desde un tanque elevado.' }] });
      }
    }
    if (c.type === 'flotador' && !project.components.some((x) => x.type === 'tanque')) {
      findings.push({ level: 'aviso', code: 'flotador-sin-tanque', where: [c.id], text: `${c.label} no tiene un tanque que vigilar.` });
    }
  }
  // Puertos de eje y de agua obligatorios sin conectar.
  const eNets = groups(project, 'eje');
  const eAt = indexOf(eNets);
  for (const c of project.components) {
    const open = definition(c.type).ports.filter((p) => p.required && (p.kind === 'eje' || p.kind === 'agua')
      && (p.kind === 'eje' ? eNets[eAt.get(k(c.id, p.id))] : wnets[wAt.get(k(c.id, p.id))]).size === 1);
    if (open.length) {
      findings.push({ level: 'aviso', code: 'puerto-energia-libre', where: [c.id],
        text: `${c.label} tiene sin conectar: ${open.map((p) => `${p.kind === 'eje' ? 'eje' : 'tubería'} ${p.label}`).join(', ')}.` });
    }
  }
  return findings;
}

