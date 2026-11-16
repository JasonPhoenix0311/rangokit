// Vista 3D: descripción de la escena sin depender de WebGL ni de Three.js, para poder probarla.
//
// La vista 3D no simula nada: dibuja el mismo estado que calcula sim.js (posición de cilindros,
// rpm, niveles, LED encendidos). Cada componente se arma con figuras básicas (cajas, cilindros y
// esferas) y se coloca en una mesa de trabajo según su lugar en el plano 2D.
//
// Coordenadas: 100 px del plano = 1 unidad. X a la derecha, Y hacia arriba, Z hacia el frente
// (lo que en el plano es hacia abajo). Las piezas de cada modelo están en coordenadas locales,
// con el origen en el centro del componente sin girar y sobre la mesa.
import { definition, placePort, rotatedSize, ledColor, param } from './catalog.js';

/** Altura dibujada de una torre o poste (unidades 3D) para una altura real en metros: escala reducida. */
export const towerHeight = (m) => Math.min(5, 0.8 + m * 0.05);
export const poleHeight = (m) => Math.min(3, 0.2 + m * 0.12);

export const SCALE = 0.01;

export const COLORS = {
  metal: '#b9c2c9', chrome: '#e4e9ec', dark: '#2b3236', black: '#15191b', alu: '#8fa3b3', blue: '#2f6db5',
  navy: '#1d3557', green: '#2e8b57', red: '#d63a3a', yellow: '#f2c230', orange: '#e8782a', white: '#eef1f2',
  teal: '#0f8a8a', water: '#2a9fd6', wood: '#9c6b3f', copper: '#b8733c', glass: '#bfe3f2', board: '#1f7a72',
  panel: '#1a2f6b', grass: '#4f8f3a',
};

// Altura de las conexiones sobre la mesa y grosor del tubo, por tipo.
export const LINKS = {
  air: { y: 0.14, r: 0.022, color: COLORS.blue },
  elec: { y: 0.08, r: 0.014, color: COLORS.yellow },
  pot: { y: 0.1, r: 0.028, color: '#c2185b' },
  eje: { y: 0.3, r: 0.045, color: COLORS.metal },
  agua: { y: 0.14, r: 0.045, color: COLORS.teal },
};

// ── Piezas ──
const box = (w, h, d, x, y, z, color, extra = {}) => ({ shape: 'box', size: [w, h, d], pos: [x, y, z], color, ...extra });
const cyl = (r, len, x, y, z, axis, color, extra = {}) => ({ shape: 'cyl', size: [r, len], axis, pos: [x, y, z], color, ...extra });
const cone = (r1, r2, len, x, y, z, axis, color, extra = {}) => ({ shape: 'cyl', size: [r2, len, r1], axis, pos: [x, y, z], color, ...extra });
const sph = (r, x, y, z, color, extra = {}) => ({ shape: 'sph', size: [r], pos: [x, y, z], color, ...extra });

const base = (w, d, color = COLORS.dark, h = 0.04) => box(w, h, d, 0, h / 2, 0, color);

function cylinder(w, single) {
  const len = w * 0.62;
  const x0 = -w / 2 + 0.12;
  return [
    box(0.08, 0.16, 0.3, x0, 0.08, 0, COLORS.dark), box(0.08, 0.16, 0.3, x0 + len, 0.08, 0, COLORS.dark),
    cyl(0.17, len, x0 + len / 2, 0.3, 0, 'x', COLORS.metal, { metal: 0.6 }),
    cyl(0.19, 0.06, x0, 0.3, 0, 'x', COLORS.alu), cyl(0.19, 0.06, x0 + len, 0.3, 0, 'x', COLORS.alu),
    cyl(0.045, len, x0 + len, 0.3, 0, 'x', COLORS.chrome, { role: 'rod', stroke: len * 0.75, metal: 0.9 }),
    sph(0.06, x0 + len * 1.5, 0.3, 0, COLORS.chrome, { role: 'rod', stroke: len * 0.75, metal: 0.9 }),
    ...(single ? [box(0.04, 0.04, 0.04, x0 + 0.1, 0.5, 0, COLORS.dark)] : []),
  ];
}

function valve(def) {
  const parts = [box(0.95, 0.3, 0.42, 0, 0.19, 0, COLORS.alu, { metal: 0.5 }), box(0.3, 0.06, 0.2, 0, 0.36, 0, COLORS.yellow, { role: 'spool' })];
  const t = def.type;
  const sol = (x) => [box(0.24, 0.26, 0.3, x, 0.2, 0, COLORS.black), cyl(0.05, 0.06, x, 0.36, 0, 'y', COLORS.orange, { role: 'lamp', lamp: COLORS.orange })];
  if (t.includes('sol') || t.includes('mono')) parts.push(...sol(-0.6));
  if (t.endsWith('-bi')) parts.push(...sol(-0.6), ...sol(0.6));
  if (t.includes('boton')) parts.push(cyl(0.09, 0.14, -0.55, 0.2, 0, 'x', COLORS.green, { role: 'button', axisPress: 'x' }));
  if (t.includes('palanca')) parts.push(box(0.05, 0.42, 0.05, -0.4, 0.55, 0, COLORS.red, { role: 'lever', pivot: [-0.4, 0.34, 0] }), sph(0.06, -0.4, 0.77, 0, COLORS.black, { role: 'lever', pivot: [-0.4, 0.34, 0] }));
  if (t.includes('rodillo')) parts.push(box(0.2, 0.05, 0.06, -0.55, 0.2, 0, COLORS.dark), cyl(0.07, 0.06, -0.68, 0.2, 0, 'z', COLORS.black));
  if (t.endsWith('-mono') || t.endsWith('-sol') || t.includes('boton') || t.includes('rodillo')) parts.push(cyl(0.07, 0.2, 0.6, 0.2, 0, 'x', COLORS.metal));
  return parts;
}

const machine = (color, len = 0.5) => [
  box(0.4, 0.06, 0.36, 0, 0.03, 0, COLORS.dark),
  cyl(0.2, len, -0.05, 0.3, 0, 'x', color, { metal: 0.4 }),
  cyl(0.21, 0.04, -0.05 - len / 2, 0.3, 0, 'x', COLORS.dark),
];

const blades = (x, y, z, r, color = COLORS.white) => [0, 1, 2].map((i) => box(0.02, r, 0.09, x, y, z, color,
  { role: 'blades', axisSpin: 'x', hub: [x, y, z], angle: (i * 2 * Math.PI) / 3, offset: r / 2 }));

const lamp = (color, y = 0.3, r = 0.12) => [cyl(0.08, 0.12, 0, 0.06, 0, 'y', COLORS.dark), sph(r, 0, y, 0, color, { role: 'lamp', lamp: color, glass: true })];

const pumpBody = (color) => [
  box(0.6, 0.06, 0.4, 0, 0.03, 0, COLORS.dark),
  cyl(0.2, 0.18, 0.05, 0.3, 0, 'z', color, { metal: 0.3 }),
  cyl(0.05, 0.4, -0.25, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' }),
];

/** Piezas de un componente en coordenadas locales. Desconocidos: una caja con su etiqueta. */
export function model(component) {
  const def = definition(component.type);
  const w = def.w * SCALE;
  const d = def.h * SCALE;
  const t = component.type;
  if (t === 'cilindro-se' || t === 'cilindro-de') return cylinder(w, t === 'cilindro-se');
  if (def.category === 'valvulas' && t !== 'reguladora') return valve(def);
  switch (t) {
    case 'reguladora': return [cyl(0.05, 0.7, 0, 0.14, 0, 'x', COLORS.alu), cyl(0.09, 0.2, 0, 0.14, 0, 'x', COLORS.alu), cyl(0.04, 0.16, 0, 0.3, 0, 'y', COLORS.black)];
    case 'fuente-aire': return [base(w, d), box(0.22, 0.42, 0.22, -0.15, 0.25, 0, COLORS.alu), cyl(0.08, 0.2, -0.15, 0.14, 0, 'y', COLORS.glass, { glass: true }),
      cyl(0.09, 0.03, 0.15, 0.36, 0.12, 'z', COLORS.white), cyl(0.06, 0.4, 0.15, 0.24, 0, 'x', COLORS.metal)];
    case 'fuente-24': case 'fuente-5': return [box(w * 0.8, 0.28, d * 0.8, 0, 0.14, 0, COLORS.metal, { metal: 0.4 }), cyl(0.03, 0.03, w * 0.25, 0.29, 0, 'y', COLORS.green, { role: 'lamp', lamp: COLORS.green, always: true })];
    case 'pulsador-na': case 'boton-tactil': return [box(0.36, 0.2, 0.36, 0, 0.1, 0, COLORS.dark), cyl(0.11, 0.1, 0, 0.24, 0, 'y', COLORS.green, { role: 'button' })];
    case 'pulsador-nc': return [box(0.36, 0.2, 0.36, 0, 0.1, 0, COLORS.dark), cyl(0.11, 0.1, 0, 0.24, 0, 'y', COLORS.red, { role: 'button' })];
    case 'paro-emergencia': return [box(0.36, 0.2, 0.36, 0, 0.1, 0, COLORS.yellow), cyl(0.16, 0.12, 0, 0.27, 0, 'y', COLORS.red, { role: 'button' })];
    case 'interruptor': case 'interruptor-potencia': return [box(0.4, 0.22, 0.3, 0, 0.11, 0, t === 'interruptor' ? COLORS.dark : COLORS.white), box(0.05, 0.2, 0.08, 0, 0.32, 0, COLORS.black, { role: 'lever', pivot: [0, 0.22, 0] })];
    case 'final-carrera': case 'sensor-magnetico': case 'sensor-inductivo': return [box(0.3, 0.2, 0.25, 0, 0.1, 0, COLORS.orange), box(0.04, 0.2, 0.04, -0.12, 0.25, 0, COLORS.metal), cyl(0.05, 0.05, -0.12, 0.36, 0, 'z', COLORS.black), cyl(0.025, 0.02, 0.08, 0.21, 0, 'y', COLORS.red, { role: 'lamp', lamp: COLORS.red })];
    case 'lampara': return lamp(COLORS.orange);
    case 'led': case 'led-solo': return lamp(ledColor(component.config.color).hex, 0.2, 0.07);
    case 'foco-ca': return lamp(COLORS.white, 0.32, 0.14);
    case 'lampara-cd': return lamp(COLORS.yellow, 0.3, 0.12);
    case 'zumbador': return [cyl(0.12, 0.12, 0, 0.06, 0, 'y', COLORS.black), cyl(0.03, 0.01, 0, 0.125, 0, 'y', COLORS.dark, { role: 'lamp', lamp: COLORS.orange })];
    case 'rele-24': case 'modulo-rele': case 'optoacoplador': case 'contactor': case 'ssr':
      return [box(w * 0.7, 0.26, d * 0.6, 0, 0.13, 0, t === 'contactor' ? COLORS.white : t === 'ssr' ? COLORS.dark : COLORS.blue), cyl(0.03, 0.02, w * 0.2, 0.27, 0, 'y', COLORS.red, { role: 'lamp', lamp: COLORS.red })];
    case 'arduino-uno': return [box(w * 0.95, 0.04, d * 0.95, 0, 0.04, 0, COLORS.board),
      box(w * 0.7, 0.08, 0.06, 0.05, 0.1, -d * 0.4, COLORS.black), box(w * 0.5, 0.08, 0.06, 0.1, 0.1, d * 0.4, COLORS.black),
      box(0.22, 0.12, 0.2, -w * 0.42, 0.12, -d * 0.2, COLORS.chrome), box(0.4, 0.04, 0.14, 0.05, 0.08, 0, COLORS.black),
      cyl(0.02, 0.02, w * 0.3, 0.07, -d * 0.2, 'y', COLORS.green, { role: 'lamp', lamp: COLORS.green, always: true })];
    case 'protoboard': return [box(w * 0.98, 0.06, d * 0.98, 0, 0.03, 0, COLORS.white)];
    case 'motor-dc': return [...machine(COLORS.metal, 0.35), cyl(0.03, 0.2, 0.22, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' })];
    case 'motor-ca': case 'motor-cd': return [...machine(t === 'motor-ca' ? COLORS.blue : COLORS.navy), cyl(0.04, 0.25, 0.32, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' })];
    case 'generador': return [...machine(COLORS.green), cyl(0.04, 0.25, -0.42, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' })];
    case 'servo': return [box(0.42, 0.22, 0.22, 0, 0.11, 0, COLORS.blue), box(0.04, 0.03, 0.26, 0.1, 0.24, 0, COLORS.white, { role: 'servo' })];
    case 'panel-solar': {
      const top = poleHeight(param(component, 'altura')) + 0.2;
      return [box(0.05, top, 0.05, -0.3, top / 2, 0.2, COLORS.metal), box(0.05, top, 0.05, 0.3, top / 2, 0.2, COLORS.metal),
        box(w * 0.92, 0.03, d * 0.9, 0, top + 0.07, 0, COLORS.panel, { tilt: -0.5, role: 'panel', metal: 0.3 })];
    }
    case 'aerogenerador': {
      const hub = towerHeight(param(component, 'altura'));
      return [cyl(0.05, hub, 0, hub / 2, 0, 'y', COLORS.white), box(0.3, 0.14, 0.14, 0, hub + 0.02, 0, COLORS.white), sph(0.07, 0.17, hub + 0.02, 0, COLORS.metal), ...blades(0.2, hub + 0.02, 0, 0.62)];
    }
    case 'rotor-eolico': {
      // Como un molino de bombeo: aspas en lo alto de la torre y un eje vertical que baja a una caja en el suelo.
      const hub = towerHeight(param(component, 'altura'));
      return [box(0.3, 0.06, 0.3, -0.1, 0.03, 0, COLORS.dark), cyl(0.035, hub, -0.18, hub / 2, 0.06, 'y', COLORS.metal), cyl(0.035, hub, -0.02, hub / 2, -0.06, 'y', COLORS.metal),
        cyl(0.025, hub - 0.3, -0.1, 0.3 + (hub - 0.3) / 2, 0, 'y', COLORS.chrome, { role: 'shaft', axisSpin: 'y' }),
        box(0.16, 0.16, 0.16, -0.1, 0.3, 0, COLORS.alu), cyl(0.04, 0.42, 0.19, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' }),
        box(0.16, 0.1, 0.1, -0.1, hub, 0, COLORS.metal), sph(0.06, -0.2, hub, 0, COLORS.metal), ...blades(-0.22, hub, 0, 0.55)];
    }
    case 'turbina-hidraulica': return [box(0.6, 0.06, 0.5, 0, 0.03, 0, COLORS.dark), cyl(0.28, 0.14, 0, 0.32, 0, 'z', COLORS.copper, { metal: 0.6 }),
      ...[0, 1, 2, 3].map((i) => box(0.04, 0.4, 0.06, 0, 0.32, 0.09, COLORS.chrome, { role: 'blades', axisSpin: 'z', hub: [0, 0.32, 0.09], angle: (i * Math.PI) / 4, offset: 0 })),
      cyl(0.04, 0.3, 0.3, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' })];
    case 'bomba': return pumpBody(COLORS.blue);
    case 'compresor': return [...pumpBody(COLORS.red), cyl(0.1, 0.3, 0.05, 0.6, 0, 'y', COLORS.red), cyl(0.05, 0.03, 0.05, 0.77, 0, 'y', COLORS.white)];
    case 'multiplicadora': return [box(0.5, 0.42, 0.4, 0, 0.21, 0, COLORS.alu, { metal: 0.4 }),
      cyl(0.04, 0.25, -0.37, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x' }), cyl(0.04, 0.25, 0.37, 0.3, 0, 'x', COLORS.chrome, { role: 'shaft', axisSpin: 'x', fast: true })];
    case 'tanque': return [...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => box(0.04, 0.5, 0.04, sx * 0.22, 0.25, sz * 0.22, COLORS.metal)),
      cyl(0.32, 0.6, 0, 0.82, 0, 'y', COLORS.glass, { glass: true }), cyl(0.3, 0.58, 0, 0.82, 0, 'y', COLORS.water, { role: 'water', bottom: 0.53, height: 0.58, glass: true })];
    case 'cisterna': return [box(w * 0.9, 0.2, d * 0.8, 0, 0.1, 0, COLORS.metal, { glass: true }), box(w * 0.86, 0.12, d * 0.76, 0, 0.08, 0, COLORS.water, { glass: true })];
    case 'rio': return [box(w, 0.04, d, 0, 0.02, 0, COLORS.grass), box(w * 0.9, 0.05, d * 0.5, 0, 0.04, 0, COLORS.water, { role: 'river', glass: true })];
    case 'valvula-agua': return [cyl(0.05, 0.7, 0, 0.14, 0, 'x', COLORS.copper), box(0.16, 0.16, 0.16, 0, 0.14, 0, COLORS.copper), cyl(0.02, 0.15, 0, 0.29, 0, 'y', COLORS.metal), cyl(0.1, 0.02, 0, 0.37, 0, 'y', COLORS.red, { role: 'wheel' })];
    case 'riego': return [cyl(0.03, 0.3, 0, 0.15, 0, 'y', COLORS.green), cyl(0.07, 0.04, 0, 0.32, 0, 'y', COLORS.dark, { role: 'shaft', axisSpin: 'y' })];
    case 'flotador': return [box(0.12, 0.3, 0.12, 0, 0.15, 0, COLORS.dark), sph(0.07, 0.12, 0.2, 0, COLORS.orange, { role: 'float' })];
    case 'bateria': return [box(w * 0.75, 0.3, d * 0.55, 0, 0.15, 0, COLORS.dark), cyl(0.03, 0.05, -0.15, 0.32, 0, 'y', COLORS.red), cyl(0.03, 0.05, 0.15, 0.32, 0, 'y', COLORS.black),
      box(w * 0.6, 0.06, 0.02, 0, 0.18, d * 0.28, COLORS.green, { role: 'charge', width: w * 0.6 })];
    case 'controlador-carga': case 'inversor': return [box(w * 0.7, 0.32, d * 0.4, 0, 0.16, 0, t === 'inversor' ? COLORS.white : COLORS.navy),
      box(w * 0.3, 0.1, 0.01, 0, 0.22, d * 0.2 + 0.005, COLORS.glass, { role: 'lamp', lamp: COLORS.glass }), cyl(0.02, 0.02, w * 0.25, 0.32, 0, 'y', COLORS.green, { role: 'lamp', lamp: COLORS.green })];
    case 'red-electrica': return [cone(0.25, 0.02, 1.3, 0, 0.65, 0, 'y', COLORS.metal, { segments: 4 }), box(0.6, 0.03, 0.03, 0, 1.05, 0, COLORS.metal), box(0.42, 0.03, 0.03, 0, 0.8, 0, COLORS.metal)];
    case 'carga-casa': return [box(0.5, 0.36, 0.42, 0, 0.18, 0, COLORS.white), cone(0.42, 0.01, 0.26, 0, 0.49, 0, 'y', COLORS.red, { segments: 4, turn: Math.PI / 4 }),
      box(0.12, 0.1, 0.01, -0.12, 0.22, 0.215, COLORS.yellow, { role: 'lamp', lamp: COLORS.yellow }), box(0.1, 0.2, 0.01, 0.12, 0.1, 0.215, COLORS.wood)];
    default: return [box(w * 0.85, 0.2, d * 0.7, 0, 0.1, 0, COLORS.metal)];
  }
}

/** Centro del componente en la mesa y giro (radianes alrededor de Y). */
export function placement(component) {
  const [w, h] = rotatedSize(definition(component.type), component.rot);
  return { x: (component.x + w / 2) * SCALE, z: (component.y + h / 2) * SCALE, rotY: -((component.rot ?? 0) * Math.PI) / 180 };
}

/** Posición de un puerto en la mesa. */
export function port3d(component, portId, y) {
  const def = definition(component.type);
  const port = def.ports.find((p) => p.id === portId);
  const { x, y: py, side } = placePort(def, port, component.rot);
  return { x: (component.x + x) * SCALE, y, z: (component.y + py) * SCALE, side };
}

const OUT = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1], c: [0, 0] };

/** Recorrido de una conexión: el mismo trazo en escuadra del plano, a la altura de su tipo. */
export function linkPoints(project, link) {
  const spec = LINKS[link.kind] ?? LINKS.elec;
  const end = (e) => port3d(project.components.find((c) => c.id === e.c), e.p, spec.y);
  const a = end(link.a);
  const b = end(link.b);
  const step = 0.16;
  const ea = { x: a.x + OUT[a.side][0] * step, y: spec.y, z: a.z + OUT[a.side][1] * step };
  const eb = { x: b.x + OUT[b.side][0] * step, y: spec.y, z: b.z + OUT[b.side][1] * step };
  const corner = a.side === 't' || a.side === 'b' ? { x: ea.x, y: spec.y, z: eb.z } : { x: eb.x, y: spec.y, z: ea.z };
  const pts = [a, ea, corner, eb, b].map(({ x, y, z }) => [x, y, z]);
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 1e-6);
}

/**
 * Estado visible de un componente a partir de lo que calculó el simulador (live = parte de view(sim)).
 * Sin simulación (live = null) devuelve el reposo.
 */
export function pose(component, live) {
  const t = component.type;
  const out = { rod: 0, pressed: false, toggled: false, lamp: false, rpm: 0, level: 0, soc: 0, spool: false, servo: 0 };
  if (t === 'tanque') out.level = param(component, 'inicio') / 100;
  if (t === 'bateria') out.soc = param(component, 'inicio') / 100;
  if (!live) return out;
  out.rod = Math.max(0, Math.min(1, (live.pos ?? 0) / 100));
  out.pressed = Boolean(live.pressed);
  out.toggled = Boolean(live.toggled);
  out.lamp = Boolean(live.active);
  out.spool = Boolean(live.on || live.active);
  out.rpm = live.rpm ?? (live.active && (t === 'motor-dc') ? 300 : 0);
  if (t === 'tanque') out.level = Math.max(0, Math.min(1, live.litros / param(component, 'capacidad')));
  if (t === 'bateria') out.soc = Math.max(0, Math.min(1, (live.soc ?? 0) / 100));
  if (t === 'riego') out.rpm = live.qGot > 0 ? 120 : 0;
  if (t === 'servo') out.servo = live.angle ?? 0;
  return out;
}

/** Velocidad de giro que se dibuja (rad/s): proporcional a las rpm, con tope para que se vea el giro. */
export function spinRate(rpm) {
  return rpm > 0 ? Math.min(14, 1.5 + rpm / 120) : 0;
}

/** Escena completa: componentes con sus piezas y conexiones con su recorrido. */
export function scene(project) {
  return {
    components: project.components.map((c) => ({ id: c.id, label: tag(c), type: c.type, ...placement(c), parts: model(c) })),
    links: project.links.map((l) => ({ id: l.id, kind: l.kind, points: linkPoints(project, l), ...(LINKS[l.kind] ?? LINKS.elec) })),
    bounds: bounds(project),
  };
}

/** Etiqueta 3D: el nombre y, en torres y paneles, su altura. */
export function tag(c) {
  if (c.type === 'aerogenerador' || c.type === 'rotor-eolico') return `${c.label} · ${param(c, 'altura')} m`;
  if (c.type === 'panel-solar') return `${c.label} · ${param(c, 'altitud')} msnm`;
  return c.label;
}

function bounds(project) {
  if (!project.components.length) return { x: 8, z: 5, size: 6 };
  const xs = [];
  const zs = [];
  for (const c of project.components) {
    const [w, h] = rotatedSize(definition(c.type), c.rot);
    xs.push(c.x * SCALE, (c.x + w) * SCALE);
    zs.push(c.y * SCALE, (c.y + h) * SCALE);
  }
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, size: Math.max(2, x1 - x0, z1 - z0) };
}
