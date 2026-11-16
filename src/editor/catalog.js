// Catálogo de componentes del editor. Solo datos y símbolos: no sabe nada de proyectos ni de la interfaz.
//
// Cada puerto declara:
// - kind: 'air' (manguera) o 'elec' (cable). Solo se conectan puertos del mismo tipo.
// - domain: nivel de tensión del borne. '24v', '5v', 'pin' (pin del Arduino), 'comun' (retorno),
//   'libre' (contacto sin potencial propio, toma el de su circuito) o 'aire'.
// - role: solo en bornes de alimentación: 'supply+' o 'gnd'.
// - pair: en contactos y resistencias, el borne del otro lado.
// - passive: 'r' en resistencias, para no confundirlas con contactos.
// - io: en módulos que se conectan a un pin: 'drive' (el pin debe ser salida),
//   'signal' (el pin debe ser entrada) o 'analog' (el pin debe leer valores analógicos).
//   Módulos con librería o protocolo propio: 'servo' (señal de un servo), 'trig' y 'echo'
//   (sensor ultrasónico), 'sda' y 'scl' (bus I2C).
// - required: puerto neumático que debe estar conectado para que el componente funcione.
// - activeLow: en la señal de un módulo, indica que se activa en LOW.
// - bareLed: ánodo de un LED sin resistencia propia; vf y color si el componente tiene varios LED.
// - side 'c': orificio dentro del componente (protoboard), en la posición (at, y).
//
// Cada componente puede declarar `bus`: grupos de puertos unidos por dentro, como las columnas
// de una protoboard o las patas gemelas de un botón táctil.
// `needsPower`: el módulo solo funciona con VCC y GND conectados a una fuente de 5 V.
// `servo`: ángulos de reposo y activo por omisión. `lcd`: texto por omisión de cada renglón.

import { ENERGY_CATALOG, ENERGY_CATEGORIES, ENERGY_SYSTEM } from './catalog-energia.js';

export const SYSTEMS = [
  { id: 'todos', label: 'Todos' },
  { id: 'neumatica', label: 'Neumática' },
  { id: 'electroneumatica', label: 'Electroneumática 24 V' },
  { id: 'arduino', label: 'Arduino' },
  { id: 'electronica', label: 'Electrónica' },
  ENERGY_SYSTEM,
];

export const CATEGORIES = [
  { id: 'alimentacion', label: 'Alimentación' },
  { id: 'actuadores', label: 'Actuadores' },
  { id: 'valvulas', label: 'Válvulas' },
  { id: 'mando', label: 'Mando y contactos' },
  { id: 'sensores', label: 'Sensores' },
  { id: 'reles', label: 'Relés' },
  { id: 'senalizacion', label: 'Señalización' },
  { id: 'pasivos', label: 'Resistencias' },
  { id: 'control', label: 'Control y módulos' },
  { id: 'semiconductores', label: 'Transistores y motores' },
  { id: 'prototipado', label: 'Protoboard' },
  ...ENERGY_CATEGORIES,
];

const P = (id, label, side, at, kind, domain, extra = {}) => ({ id, label, side, at, kind, domain, ...extra });
const air = (id, label, side, at, extra) => P(id, label, side, at, 'air', 'aire', extra);
const contact = (a, b, x) => [
  P(a, a, 't', x, 'elec', 'libre', { pair: b }),
  P(b, b, 'b', x, 'elec', 'libre', { pair: a }),
];

// Símbolos simplificados, en coordenadas locales del componente.
const g = {
  cylinder: (w, spring) => {
    const piston = (w - 40) / 2;
    return `<rect x="14" y="14" width="${w - 40}" height="34"/>
    <line x1="${piston}" y1="14" x2="${piston}" y2="48"/>
    <line x1="${piston}" y1="31" x2="${w - 4}" y2="31" stroke-width="5"/>
    ${spring ? `<path d="M${piston + 6} 22 l8 18 l8 -18 l8 18 l8 -18 l8 18"/>` : ''}`;
  },
  squares: (n, x0, y, s) => Array.from({ length: n }, (_, i) => `<rect x="${x0 + i * s}" y="${y}" width="${s}" height="${s}"/>`).join(''),
  arrow: (x1, y1, x2, y2) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = (d) => `${(x2 - 7 * Math.cos(a + d)).toFixed(1)} ${(y2 - 7 * Math.sin(a + d)).toFixed(1)}`;
    return `<path d="M${x1} ${y1} L${x2} ${y2} M${h(0.45)} L${x2} ${y2} L${h(-0.45)}"/>`;
  },
  block: (x, y) => `<path d="M${x} ${y} v8 M${x - 5} ${y + 8} h10"/>`,
  spring: (x, y) => `<path d="M${x} ${y} l5 -8 l5 16 l5 -16 l5 16 l5 -8"/>`,
  solenoid: (x, y) => `<rect x="${x}" y="${y - 10}" width="14" height="20"/><path d="M${x + 3} ${y + 10} L${x + 11} ${y - 10}"/>`,
  button: (x, y) => `<path d="M${x + 14} ${y} H${x + 6} M${x + 6} ${y - 8} v16 M${x} ${y - 8} a8 8 0 0 0 0 16"/>`,
  lever: (x, y) => `<path d="M${x + 14} ${y} H${x + 4} L${x - 4} ${y - 10}"/>`,
  roller: (x, y) => `<path d="M${x + 14} ${y} H${x + 6}"/><circle cx="${x + 1}" cy="${y}" r="5"/>`,
  blade: (x, top, bottom, nc) => `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + 10}"/>
    <line x1="${x}" y1="${bottom - 10}" x2="${x}" y2="${bottom}"/>
    <line x1="${x}" y1="${bottom - 10}" x2="${x + (nc ? 10 : -12)}" y2="${top + 12}"/>
    ${nc ? `<line x1="${x}" y1="${top + 10}" x2="${x + 12}" y2="${top + 10}"/>` : ''}`,
};

function valve({ ways, left, right }) {
  const s = 40;
  const x0 = 34;
  const y = 18;
  const second = x0 + s;
  const inner = ways === '52'
    ? g.arrow(x0 + 12, y + s, x0 + 12, y) + g.arrow(x0 + 32, y, x0 + 32, y + s)
      + g.arrow(second + 12, y + s, second + 30, y) + g.arrow(second + 30, y + s, second + 10, y)
    : g.arrow(x0 + 20, y + s, x0 + 20, y) + g.block(x0 + 32, y + s - 8)
      + g.block(second + 8, y + s - 8) + g.arrow(second + 30, y, second + 30, y + s);
  const act = {
    solenoid: g.solenoid(x0 - 14, y + 20),
    button: g.button(x0 - 14, y + 20),
    lever: g.lever(x0 - 14, y + 20),
    roller: g.roller(x0 - 14, y + 20),
  }[left];
  const back = right === 'spring' ? g.spring(second + s, y + 20) : right === 'solenoid' ? g.solenoid(second + s, y + 20) : '';
  return g.squares(2, x0, y, s) + inner + act + back;
}

const valvePorts = (ways) => ways === '52'
  ? [air('4', '4', 't', 46, { required: true }), air('2', '2', 't', 66, { required: true }),
    air('5', '5', 'b', 40), air('1', '1', 'b', 56, { required: true }), air('3', '3', 'b', 72)]
  : [air('2', '2', 't', 94, { required: true }), air('1', '1', 'b', 94, { required: true }), air('3', '3', 'b', 114)];

const coilPorts = (prefix, side, at) => [
  P(`${prefix}+`, `${prefix}+`, side, at - 8, 'elec', '24v'),
  P(`${prefix}-`, `${prefix}−`, side, at + 8, 'elec', 'comun'),
];

// Protoboard: 12 columnas. Cada columna tiene dos tiras de 5 orificios (a–e y f–j) unidas por dentro,
// separadas por el canal central. Arriba y abajo hay rieles + y − que recorren toda la placa.
const PB = { cols: 12, pitch: 20, x0: 30 };
const pbX = (i) => PB.x0 + i * PB.pitch;
const PB_ROWS = [['a', 75], ['b', 95], ['c', 115], ['d', 135], ['e', 155], ['f', 195], ['g', 215], ['h', 235], ['i', 255], ['j', 275]];
const PB_RAILS = [['+s', '+ superior', 20], ['-s', '− superior', 40], ['+i', '+ inferior', 310], ['-i', '− inferior', 330]];
const cols = Array.from({ length: PB.cols }, (_, i) => i + 1);
const hole = (id, label, x, y) => P(id, label, 'c', x, 'elec', 'libre', { y, hole: true });

function protoboard() {
  const ports = [
    ...PB_RAILS.flatMap(([id, name, y]) => cols.map((n) => hole(`${id}${n}`, `${name} ${n}`, pbX(n - 1), y))),
    ...PB_ROWS.flatMap(([row, y]) => cols.map((n) => hole(`${row}${n}`, `${row}${n}`, pbX(n - 1), y))),
  ];
  const bus = [
    ...PB_RAILS.map(([id]) => cols.map((n) => `${id}${n}`)),
    ...cols.flatMap((n) => [['a', 'b', 'c', 'd', 'e'].map((r) => `${r}${n}`), ['f', 'g', 'h', 'i', 'j'].map((r) => `${r}${n}`)]),
  ];
  const w = pbX(PB.cols - 1) + 20;
  const rail = (y, cls) => `<line class="${cls}" x1="18" y1="${y}" x2="${w - 10}" y2="${y}"/>`;
  const glyph = `<rect class="pb-board" x="0" y="0" width="${w}" height="350" rx="6"/>
    ${rail(8, 'pb-plus')}${rail(52, 'pb-minus')}${rail(298, 'pb-plus')}${rail(342, 'pb-minus')}
    <text class="glyph-text" x="10" y="24" text-anchor="middle">+</text><text class="glyph-text" x="10" y="44" text-anchor="middle">−</text>
    <text class="glyph-text" x="10" y="314" text-anchor="middle">+</text><text class="glyph-text" x="10" y="334" text-anchor="middle">−</text>
    <rect class="pb-channel" x="18" y="171" width="${w - 28}" height="8"/>
    ${PB_ROWS.map(([row, y]) => `<text class="glyph-text pb-tag" x="12" y="${y + 3}" text-anchor="middle">${row}</text>`).join('')}
    ${cols.filter((n) => n === 1 || n % 5 === 0).map((n) => `<text class="glyph-text pb-tag" x="${pbX(n - 1)}" y="66" text-anchor="middle">${n}</text>`).join('')}
    ${cols.map((n) => `<line class="pb-strip" x1="${pbX(n - 1)}" y1="75" x2="${pbX(n - 1)}" y2="155"/><line class="pb-strip" x1="${pbX(n - 1)}" y1="195" x2="${pbX(n - 1)}" y2="275"/>`).join('')}`;
  return { ports, bus, w, h: 350, glyph };
}

// Módulos de sensor de 3 pines: VCC, señal y GND. Los digitales se simulan manteniendo presionado
// el módulo (como si detectara); los analógicos, con un control deslizante.
const modulePorts = (io, extra = {}) => [
  P('VCC', 'VCC', 't', 15, 'elec', '5v'), P('OUT', 'señal', 't', 45, 'elec', '5v', { io, ...extra }), P('GND', 'GND', 't', 75, 'elec', 'comun'),
];
const moduleGlyph = (icon) => `<rect x="12" y="18" width="66" height="34" rx="3"/>${icon}`;

function digitalModule(type, name, { activeLow = false, label, icon, note }) {
  return {
    type, name, prefix: 'B', category: 'sensores', systems: ['arduino'], w: 90, h: 60,
    ports: modulePorts('signal', activeLow ? { activeLow: true } : {}),
    glyph: moduleGlyph(icon), note, module: { activeLow, label },
  };
}

function analogModule(type, name, { label, icon, note, start }) {
  return {
    type, name, prefix: 'B', category: 'sensores', systems: ['arduino'], w: 90, h: 60,
    ports: modulePorts('analog'), glyph: moduleGlyph(icon), note, analog: [{ port: 'OUT', label, ...(start ? { start } : {}) }],
  };
}

// Display de 7 segmentos de cátodo común. Cada segmento es un LED que se dibuja encendido o apagado.
const SEGMENTS = {
  a: 'M30 20 h30 l-4 6 h-22 z', b: 'M62 22 v30 l-6 -4 v-22 z', c: 'M62 58 v30 l-6 -4 v-22 z',
  d: 'M30 90 h30 l-4 -6 h-22 z', e: 'M28 58 v30 l6 -4 v-22 z', f: 'M28 22 v30 l6 -4 v-22 z',
  g: 'M30 55 l4 -3 h22 l4 3 l-4 3 h-22 z',
};

/** Símbolo del display con los segmentos encendidos marcados (lista en el orden a–g, dp). */
export function segmentGlyph(lit = []) {
  const on = (i) => (lit[i] ? ' on' : '');
  const leads = [10, 30, 50, 70, 90].map((x) => `M${x} 0 V12`).concat([10, 30, 50, 85].map((x) => `M${x} 100 V130`)).join(' ');
  return `<path d="${leads}"/><rect x="16" y="12" width="64" height="88" rx="3"/>
    ${Object.values(SEGMENTS).map((d, i) => `<path class="seg${on(i)}" d="${d}"/>`).join('')}
    <circle class="seg${on(7)}" cx="70" cy="88" r="3"/>`;
}

/** Símbolo del servo con el brazo en un ángulo de 0 a 180°: 0 a la izquierda, 90 arriba y 180 a la derecha. */
export function servoGlyph(angle = 0) {
  const a = (Math.max(0, Math.min(180, Number(angle) || 0)) * Math.PI) / 180;
  const x = (50 - 20 * Math.cos(a)).toFixed(1);
  const y = (50 - 20 * Math.sin(a)).toFixed(1);
  return `<path d="M20 0 V22 M50 0 V22 M80 0 V22"/><rect x="8" y="22" width="84" height="40" rx="3"/>
    <path class="servo-dial" d="M26 50 a24 24 0 0 1 48 0"/>
    <line class="servo-arm" x1="50" y1="50" x2="${x}" y2="${y}" stroke-width="4"/><circle class="filled" cx="50" cy="50" r="4"/>`;
}

const xml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Símbolo de la pantalla LCD de 16×2 con el texto de cada renglón. */
export function lcdGlyph(lines = ['', '']) {
  const chars = (line, y) => [...String(line ?? '').padEnd(16).slice(0, 16)]
    .map((ch, i) => (ch === ' ' ? '' : `<text class="lcd-char" x="${(23 + i * 10.2).toFixed(1)}" y="${y}" text-anchor="middle">${xml(ch)}</text>`)).join('');
  return `<path d="M30 0 V14 M60 0 V14 M90 0 V14 M120 0 V14"/><rect x="6" y="14" width="188" height="70" rx="4"/>
    <rect class="lcd-screen" x="16" y="26" width="168" height="48" rx="2"/>${chars(lines[0], 46)}${chars(lines[1], 66)}`;
}

/** Ángulos de un servo: los de su configuración o los del catálogo. */
export function servoAngles(component) {
  const def = definition(component.type).servo;
  const clean = (value, fallback) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(180, Math.round(Number(value)))) : fallback);
  return { off: clean(component.config.angles?.off, def.off), on: clean(component.config.angles?.on, def.on) };
}

/** Los dos renglones de una pantalla LCD: los de su configuración o los del catálogo. */
export function lcdLines(component) {
  const lines = Array.isArray(component.config.lines) ? component.config.lines : definition(component.type).lcd.lines;
  return [0, 1].map((i) => String(lines[i] ?? ''));
}

export const UNO_DIGITAL = Array.from({ length: 14 }, (_, i) => `D${i}`);
export const UNO_ANALOG = Array.from({ length: 6 }, (_, i) => `A${i}`);

export const CATALOG = [
  {
    type: 'fuente-aire', name: 'Fuente de aire con unidad de mantenimiento', prefix: '0Z', category: 'alimentacion',
    systems: ['neumatica', 'electroneumatica', 'arduino'], w: 90, h: 60,
    ports: [air('out', 'salida', 'r', 30)],
    glyph: '<circle cx="20" cy="30" r="10"/><circle class="filled" cx="20" cy="30" r="3"/><rect x="40" y="14" width="30" height="32"/><path d="M40 30 H70 M55 22 v16"/><line x1="30" y1="30" x2="40" y2="30"/><line x1="70" y1="30" x2="90" y2="30"/>',
    note: 'Entrega 6 bar filtrados y regulados.',
  },
  {
    type: 'cilindro-se', name: 'Cilindro de simple efecto', prefix: 'A', numberFirst: true, category: 'actuadores',
    systems: ['neumatica', 'electroneumatica', 'arduino'], w: 160, h: 70,
    ports: [air('A', 'cámara', 'b', 24, { required: true })],
    glyph: g.cylinder(160, true),
    note: 'Sale con aire y regresa por resorte.',
  },
  {
    type: 'cilindro-de', name: 'Cilindro de doble efecto', prefix: 'A', numberFirst: true, category: 'actuadores',
    systems: ['neumatica', 'electroneumatica', 'arduino'], w: 160, h: 70,
    ports: [air('trasera', 'trasera', 'b', 24, { required: true }), air('delantera', 'delantera', 'b', 104, { required: true })],
    glyph: g.cylinder(160, false),
    note: 'Sale con aire en la cámara trasera y regresa con aire en la delantera.',
  },
  {
    type: 'valvula-32-boton', name: 'Válvula 3/2 NC con botón', prefix: 'S', numberFirst: true, category: 'valvulas',
    systems: ['neumatica'], w: 150, h: 76,
    ports: valvePorts('32'),
    glyph: valve({ ways: '32', left: 'button', right: 'spring' }),
    note: 'Deja pasar aire de 1 a 2 mientras se presiona.',
  },
  {
    type: 'valvula-32-rodillo', name: 'Válvula 3/2 NC con rodillo (fin de carrera)', prefix: 'S', numberFirst: true, category: 'valvulas',
    systems: ['neumatica'], w: 150, h: 76,
    ports: valvePorts('32'),
    glyph: valve({ ways: '32', left: 'roller', right: 'spring' }),
    note: 'Se acciona cuando el vástago llega al rodillo.',
  },
  {
    type: 'valvula-52-palanca', name: 'Válvula 5/2 con palanca', prefix: 'V', numberFirst: true, category: 'valvulas',
    systems: ['neumatica'], w: 150, h: 76,
    ports: valvePorts('52'),
    glyph: valve({ ways: '52', left: 'lever', right: 'none' }),
    note: 'Mando manual con enclavamiento mecánico.',
  },
  {
    type: 'valvula-32-sol', name: 'Válvula 3/2 NC con solenoide', prefix: 'V', numberFirst: true, category: 'valvulas',
    systems: ['electroneumatica', 'arduino'], w: 150, h: 76,
    ports: [...valvePorts('32'), ...coilPorts('Y', 'l', 38)],
    glyph: valve({ ways: '32', left: 'solenoid', right: 'spring' }),
    note: 'Bobina de 24 V. Desde Arduino necesita un módulo de relé.',
  },
  {
    type: 'valvula-52-mono', name: 'Válvula 5/2 monoestable con solenoide', prefix: 'V', numberFirst: true, category: 'valvulas',
    systems: ['electroneumatica', 'arduino'], w: 150, h: 76,
    ports: [...valvePorts('52'), ...coilPorts('Y', 'l', 38)],
    glyph: valve({ ways: '52', left: 'solenoid', right: 'spring' }),
    note: 'Bobina de 24 V. Regresa por resorte al quitar la corriente.',
  },
  {
    type: 'valvula-52-bi', name: 'Válvula 5/2 biestable, dos solenoides', prefix: 'V', numberFirst: true, category: 'valvulas',
    systems: ['electroneumatica', 'arduino'], w: 150, h: 76,
    ports: [...valvePorts('52'), ...coilPorts('Y1', 'l', 38), ...coilPorts('Y2', 'r', 38)],
    glyph: valve({ ways: '52', left: 'solenoid', right: 'solenoid' }),
    note: 'Memoriza la última posición. Cada bobina es de 24 V.',
  },
  {
    type: 'reguladora', name: 'Reguladora de caudal unidireccional', prefix: 'V', numberFirst: true, category: 'valvulas',
    systems: ['neumatica', 'electroneumatica', 'arduino'], w: 90, h: 60,
    ports: [air('in', 'entrada', 'l', 30), air('out', 'salida', 'r', 30)],
    glyph: '<line x1="0" y1="30" x2="90" y2="30"/><path d="M32 22 q13 8 26 0 M32 38 q13 -8 26 0"/><path d="M36 48 L56 12 M56 12 l-8 2 M56 12 l0 8"/>',
    note: 'Regula la velocidad del cilindro.',
  },
  {
    type: 'fuente-24', name: 'Fuente de 24 V DC', prefix: 'G', category: 'alimentacion',
    systems: ['electroneumatica', 'arduino'], w: 80, h: 60,
    ports: [P('+24', '+24 V', 't', 22, 'elec', '24v', { role: 'supply+' }), P('0V', '0 V', 't', 58, 'elec', 'comun', { role: 'gnd' })],
    glyph: '<circle cx="40" cy="34" r="15"/><text class="glyph-text" x="40" y="38" text-anchor="middle">24 V</text>',
    note: 'Alimenta el mando eléctrico.',
  },
  {
    type: 'pulsador-na', name: 'Pulsador NA', prefix: 'S', category: 'mando',
    systems: ['electroneumatica', 'arduino', 'electronica'], w: 60, h: 70,
    ports: contact('13', '14', 30),
    glyph: g.blade(30, 0, 70, false) + '<path d="M4 35 H16" stroke-dasharray="3 3"/><path d="M4 28 v14"/>',
    note: 'Cierra mientras se presiona. Sirve con 24 V o con un pin del Arduino.',
  },
  {
    type: 'pulsador-nc', name: 'Pulsador NC', prefix: 'S', category: 'mando',
    systems: ['electroneumatica', 'arduino', 'electronica'], w: 60, h: 70,
    ports: contact('11', '12', 30),
    glyph: g.blade(30, 0, 70, true) + '<path d="M4 35 H16" stroke-dasharray="3 3"/><path d="M4 28 v14"/>',
    note: 'Abre mientras se presiona.',
  },
  {
    type: 'paro-emergencia', name: 'Paro de emergencia (NC)', prefix: 'S', category: 'mando',
    systems: ['electroneumatica', 'arduino'], w: 60, h: 70,
    ports: contact('11', '12', 30),
    glyph: g.blade(30, 0, 70, true) + '<path d="M2 35 H16" stroke-dasharray="3 3"/><path d="M2 26 a9 9 0 0 1 0 18"/>',
    note: 'Abre el circuito y se queda enclavado hasta girarlo.',
  },
  {
    type: 'final-carrera', name: 'Final de carrera (NA)', prefix: 'S', category: 'sensores',
    systems: ['electroneumatica', 'arduino'], w: 60, h: 70,
    ports: contact('13', '14', 30),
    glyph: g.blade(30, 0, 70, false) + '<circle cx="9" cy="35" r="5"/><path d="M14 35 H18"/>',
    note: 'Contacto que cierra cuando el vástago lo empuja.',
  },
  {
    type: 'sensor-magnetico', name: 'Sensor magnético (reed)', prefix: 'B', category: 'sensores',
    systems: ['electroneumatica', 'arduino'], w: 60, h: 70,
    ports: contact('1', '2', 30),
    glyph: g.blade(30, 0, 70, false) + '<rect x="2" y="27" width="14" height="16"/><text class="glyph-text" x="9" y="39" text-anchor="middle">N</text>',
    note: 'Detecta el imán del émbolo. Se modela como un contacto.',
  },
  {
    type: 'sensor-inductivo', name: 'Sensor inductivo PNP, 3 hilos', prefix: 'B', category: 'sensores',
    systems: ['electroneumatica'], w: 90, h: 60,
    ports: [P('+', '+', 't', 20, 'elec', '24v'), P('-', '−', 't', 70, 'elec', 'comun'), P('out', 'señal', 'b', 45, 'elec', '24v', { emits: true })],
    glyph: '<rect x="25" y="16" width="40" height="28"/><path d="M45 20 l10 10 l-10 10 l-10 -10 z"/>',
    note: 'Entrega 24 V en la señal al detectar metal. Al Arduino solo a través de un optoacoplador.',
  },
  {
    type: 'rele-24', name: 'Relé de 24 V', prefix: 'K', category: 'reles',
    systems: ['electroneumatica'], w: 170, h: 90,
    ports: [
      P('A1', 'A1', 't', 20, 'elec', '24v'), P('A2', 'A2', 'b', 20, 'elec', 'comun'),
      ...contact('13', '14', 70), ...contact('23', '24', 110), ...contact('11', '12', 150),
    ],
    glyph: `<line x1="20" y1="0" x2="20" y2="30"/><line x1="20" y1="60" x2="20" y2="90"/><rect x="6" y="30" width="28" height="30"/>
      ${g.blade(70, 0, 90, false)}${g.blade(110, 0, 90, false)}${g.blade(150, 0, 90, true)}
      <path d="M34 45 H150" stroke-dasharray="3 4"/>`,
    note: 'Bobina A1-A2 y tres contactos: dos NA y uno NC.',
  },
  {
    type: 'lampara', name: 'Lámpara piloto de 24 V', prefix: 'H', category: 'senalizacion',
    systems: ['electroneumatica'], w: 60, h: 70,
    ports: [P('X1', 'X1', 't', 30, 'elec', '24v'), P('X2', 'X2', 'b', 30, 'elec', 'comun')],
    glyph: '<line x1="30" y1="0" x2="30" y2="21"/><line x1="30" y1="49" x2="30" y2="70"/><circle cx="30" cy="35" r="14"/><path d="M20 25 L40 45 M40 25 L20 45"/>',
    note: 'Indica un estado en el tablero.',
  },
  {
    type: 'arduino-uno', name: 'Arduino Uno', prefix: 'MCU', category: 'control',
    systems: ['arduino'], w: 200, h: 290,
    ports: [
      ...UNO_DIGITAL.map((id, i) => P(id, id, 'l', 24 + i * 18, 'elec', 'pin', { pin: true })),
      ...UNO_ANALOG.map((id, i) => P(id, id, 'r', 24 + i * 18, 'elec', 'pin', { pin: true })),
      P('5V', '5V', 'r', 160, 'elec', '5v', { role: 'supply+' }),
      P('GND', 'GND', 'r', 196, 'elec', 'comun', { role: 'gnd' }),
    ],
    glyph: '<rect x="50" y="230" width="100" height="40" rx="4"/><text class="glyph-text" x="100" y="248" text-anchor="middle">Arduino</text><text class="glyph-text" x="100" y="263" text-anchor="middle">Uno</text>',
    note: 'ATmega328P a 5 V. Cada pin da máximo 20 mA: no puede mover bobinas ni lámparas de 24 V.',
    board: 'uno',
  },
  {
    type: 'modulo-rele', name: 'Módulo de relé de 5 V, un canal', prefix: 'K', category: 'control',
    systems: ['arduino'], w: 150, h: 90,
    ports: [
      P('IN', 'IN', 'l', 20, 'elec', '5v', { io: 'drive' }), P('VCC', 'VCC', 'l', 45, 'elec', '5v'), P('GND', 'GND', 'l', 70, 'elec', 'comun'),
      P('COM', 'COM', 'r', 20, 'elec', 'libre', { pair: 'NO' }), P('NO', 'NO', 'r', 45, 'elec', 'libre', { pair: 'COM' }), P('NC', 'NC', 'r', 70, 'elec', 'libre'),
    ],
    glyph: `<rect x="40" y="25" width="34" height="40"/><path d="M74 45 H95" stroke-dasharray="3 3"/>${g.blade(108, 18, 72, false)}`,
    note: 'Aísla el Arduino del circuito de 24 V. Muchos módulos se activan con LOW: revisa el tuyo.',
  },
  {
    type: 'optoacoplador', name: 'Módulo optoacoplador 24 V a 5 V', prefix: 'U', category: 'control',
    systems: ['arduino'], w: 150, h: 90,
    ports: [
      P('IN+', 'IN+', 'l', 30, 'elec', '24v'), P('IN-', 'IN−', 'l', 60, 'elec', 'comun'),
      P('VCC', 'VCC', 'r', 20, 'elec', '5v'), P('OUT', 'OUT', 'r', 45, 'elec', '5v', { io: 'signal' }), P('GND', 'GND', 'r', 70, 'elec', 'comun'),
    ],
    glyph: '<rect x="45" y="20" width="60" height="50"/><path d="M58 35 l10 10 l10 -10 z M58 45 h20"/><path d="M84 32 l8 -6 M86 40 l8 -6"/>',
    note: 'Convierte una señal de 24 V en una entrada segura para el Arduino.',
  },
  {
    type: 'led', name: 'LED con resistencia', prefix: 'H', category: 'senalizacion',
    systems: ['arduino', 'electronica'], w: 60, h: 70,
    ports: [P('A', 'ánodo', 't', 30, 'elec', '5v', { io: 'drive' }), P('K', 'cátodo', 'b', 30, 'elec', 'comun')],
    glyph: '<line x1="30" y1="0" x2="30" y2="25"/><path d="M20 25 h20 l-10 14 z M20 39 h20"/><line x1="30" y1="39" x2="30" y2="70"/><path d="M42 26 l8 -6 M44 33 l8 -6"/>',
    note: 'Indicador de 5 V. La resistencia limita la corriente del pin.',
    colorable: true,
  },
  {
    type: 'led-solo', name: 'LED sin resistencia', prefix: 'H', category: 'senalizacion',
    systems: ['arduino', 'electronica'], w: 60, h: 70,
    ports: [P('A', 'ánodo', 't', 30, 'elec', '5v', { io: 'drive', bareLed: true }), P('K', 'cátodo', 'b', 30, 'elec', 'comun')],
    glyph: '<line x1="30" y1="0" x2="30" y2="25"/><path d="M20 25 h20 l-10 14 z M20 39 h20"/><line x1="30" y1="39" x2="30" y2="70"/><path d="M42 26 l8 -6 M44 33 l8 -6"/>',
    note: 'LED solo: necesita una resistencia en serie o se quema junto con el pin.',
    colorable: true,
  },
  {
    type: 'resistencia', name: 'Resistencia', prefix: 'R', category: 'pasivos',
    systems: ['arduino', 'electroneumatica', 'electronica'], w: 40, h: 80,
    ports: [P('1', '1', 't', 20, 'elec', 'libre', { pair: '2', passive: 'r' }), P('2', '2', 'b', 20, 'elec', 'libre', { pair: '1', passive: 'r' })],
    glyph: '<line x1="20" y1="0" x2="20" y2="20"/><rect x="12" y="20" width="16" height="40"/><line x1="20" y1="60" x2="20" y2="80"/>',
    note: 'Limita la corriente. Elige su valor en Selección: 220 Ω para un LED, 10 kΩ para pull-up o pull-down.',
    value: { key: 'ohms', default: 1000 },
  },
  {
    type: 'potenciometro', name: 'Potenciómetro de 10 kΩ', prefix: 'R', category: 'control',
    systems: ['arduino'], w: 90, h: 60,
    ports: [P('5V', '5V', 't', 15, 'elec', '5v'), P('W', 'cursor', 't', 45, 'elec', '5v', { io: 'analog' }), P('GND', 'GND', 't', 75, 'elec', 'comun')],
    glyph: '<rect x="15" y="26" width="60" height="16"/><path d="M45 8 V24 M41 18 l4 6 l4 -6"/>',
    note: 'Entrega de 0 a 5 V. Se lee con analogRead en A0 a A5.',
    analog: [{ port: 'W', label: 'posición' }],
  },
  {
    type: 'protoboard', name: 'Protoboard de 12 columnas', prefix: 'PB', category: 'prototipado',
    systems: ['arduino', 'electronica'],
    ...protoboard(),
    note: 'Conecta cada pata con un cable a un orificio. Los 5 orificios de cada columna (a–e o f–j) están unidos por dentro, y cada riel + o − recorre toda la placa. El canal central separa las dos mitades.',
  },
  {
    type: 'fuente-5', name: 'Fuente de 5 V para protoboard', prefix: 'G', category: 'alimentacion',
    systems: ['arduino', 'electronica'], w: 80, h: 60,
    ports: [P('+5V', '+5 V', 't', 22, 'elec', '5v', { role: 'supply+' }), P('GND', 'GND', 't', 58, 'elec', 'comun', { role: 'gnd' })],
    glyph: '<rect x="14" y="20" width="52" height="30" rx="3"/><text class="glyph-text" x="40" y="39" text-anchor="middle">5 V</text>',
    note: 'Módulo regulador que alimenta los rieles de la protoboard. Sirve para circuitos sin Arduino.',
  },
  {
    type: 'boton-tactil', name: 'Botón táctil de 4 patas', prefix: 'S', category: 'mando',
    systems: ['arduino', 'electronica'], w: 70, h: 70,
    ports: [
      P('1', '1', 't', 15, 'elec', 'libre', { pair: '3' }), P('2', '2', 't', 55, 'elec', 'libre', { pair: '4' }),
      P('3', '3', 'b', 15, 'elec', 'libre', { pair: '1' }), P('4', '4', 'b', 55, 'elec', 'libre', { pair: '2' }),
    ],
    bus: [['1', '2'], ['3', '4']],
    glyph: '<rect x="10" y="12" width="50" height="46" rx="4"/><circle cx="35" cy="35" r="11"/><path d="M15 0 V12 M55 0 V12 M15 58 V70 M55 58 V70"/>',
    note: 'El botón típico de protoboard. Las patas 1 y 2 están unidas por dentro, igual que la 3 y la 4; al presionarlo se unen los dos lados.',
  },
  {
    type: 'interruptor', name: 'Interruptor de palanca (enciende y apaga)', prefix: 'S', category: 'mando',
    systems: ['electroneumatica', 'arduino', 'electronica'], w: 60, h: 70,
    ports: contact('1', '2', 30),
    glyph: g.blade(30, 0, 70, false) + '<path d="M4 35 H17"/><path d="M4 27 v16"/>',
    note: 'Se queda encendido o apagado hasta que lo vuelvas a mover.',
  },
  {
    type: 'zumbador', name: 'Zumbador activo de 5 V', prefix: 'H', category: 'senalizacion',
    systems: ['arduino', 'electronica'], w: 60, h: 70,
    ports: [P('+', '+', 't', 30, 'elec', '5v', { io: 'drive' }), P('-', '−', 'b', 30, 'elec', 'comun')],
    glyph: '<line x1="30" y1="0" x2="30" y2="20"/><line x1="30" y1="50" x2="30" y2="70"/><circle cx="30" cy="35" r="15"/><circle cx="30" cy="35" r="4"/><path d="M48 26 q5 9 0 18 M53 22 q8 13 0 26"/>',
    note: 'Suena con 5 V. Uno pequeño consume de 20 a 30 mA: para uno más grande usa un transistor.',
  },
  {
    type: 'sensor-luz', name: 'Sensor de luz (fotorresistencia LDR)', prefix: 'B', category: 'sensores',
    systems: ['arduino'], w: 90, h: 60,
    ports: [P('VCC', 'VCC', 't', 15, 'elec', '5v'), P('OUT', 'señal', 't', 45, 'elec', '5v', { io: 'analog' }), P('GND', 'GND', 't', 75, 'elec', 'comun')],
    glyph: '<rect x="25" y="24" width="40" height="20" rx="10"/><path d="M33 34 h4 l3 -5 l4 10 l4 -10 l4 10 l3 -5 h4"/><path d="M30 8 l7 10 M42 6 l5 11"/>',
    note: 'Módulo con fotorresistencia y divisor de voltaje. Más luz, más voltaje en la señal. Se lee con analogRead en A0 a A5.',
    analog: [{ port: 'OUT', label: 'luz' }],
  },
  {
    type: 'sensor-temperatura', name: 'Sensor de temperatura LM35', prefix: 'B', category: 'sensores',
    systems: ['arduino'], w: 90, h: 60,
    ports: [P('+Vs', '+Vs', 't', 15, 'elec', '5v'), P('OUT', 'señal', 't', 45, 'elec', '5v', { io: 'analog' }), P('GND', 'GND', 't', 75, 'elec', 'comun')],
    glyph: '<path d="M30 46 h30 v-14 a15 15 0 0 0 -30 0 z"/><text class="glyph-text" x="45" y="42" text-anchor="middle">LM35</text>',
    note: 'Entrega 10 mV por cada °C. Con analogRead a 5 V, cada grado sube la lectura unos 2 puntos: 25 °C leen cerca de 51.',
    analog: [{ port: 'OUT', label: 'temperatura', start: 51 }],
  },
  {
    type: 'transistor-npn', name: 'Transistor NPN (2N2222)', prefix: 'Q', category: 'semiconductores',
    systems: ['arduino', 'electronica'], w: 70, h: 80,
    ports: [
      P('B', 'B', 'l', 40, 'elec', '5v', { io: 'drive', base: true }),
      P('C', 'C', 't', 45, 'elec', 'libre'),
      P('E', 'E', 'b', 45, 'elec', 'comun'),
    ],
    glyph: '<circle cx="40" cy="40" r="22"/><path d="M0 40 H30 M30 26 V54 M30 34 L45 22 V0 M30 46 L45 58 V80"/><path d="M45 58 l-9 -2 M45 58 l-3 -8"/>',
    note: 'Interruptor electrónico: una corriente pequeña en la base (B) deja pasar una grande del colector (C) al emisor (E). La base siempre lleva resistencia (1 kΩ desde un pin de 5 V).',
  },
  {
    type: 'motor-dc', name: 'Motor DC pequeño de 5 V', prefix: 'M', category: 'semiconductores',
    systems: ['arduino', 'electronica'], w: 70, h: 80,
    ports: [P('+', '+', 't', 35, 'elec', 'libre', { motor: true }), P('-', '−', 'b', 35, 'elec', 'libre', { motor: true })],
    glyph: '<line x1="35" y1="0" x2="35" y2="22"/><line x1="35" y1="58" x2="35" y2="80"/><circle cx="35" cy="40" r="18"/><text class="glyph-text" x="35" y="45" text-anchor="middle">M</text>',
    note: 'Pide cientos de mA: nunca va directo a un pin. Muévelo con un transistor o un módulo de relé, y en el circuito real pon un diodo de protección en paralelo.',
  },
  {
    type: 'led-rgb', name: 'LED RGB de cátodo común', prefix: 'H', category: 'senalizacion',
    systems: ['arduino', 'electronica'], w: 80, h: 70,
    ports: [
      P('R', 'R', 't', 15, 'elec', '5v', { io: 'drive', bareLed: true, vf: 2.0, color: 'rojo' }),
      P('G', 'G', 't', 40, 'elec', '5v', { io: 'drive', bareLed: true, vf: 3.0, color: 'verde' }),
      P('B', 'B', 't', 65, 'elec', '5v', { io: 'drive', bareLed: true, vf: 3.0, color: 'azul' }),
      P('K', 'cátodo', 'b', 40, 'elec', 'comun'),
    ],
    glyph: '<path d="M26 26 h28 l-14 18 z M26 44 h28"/><path d="M15 0 V14 L30 26 M40 0 V26 M65 0 V14 L50 26 M40 44 V70"/><path d="M58 30 l8 -6 M60 37 l8 -6"/>',
    note: 'Tres LED (rojo, verde y azul) con el cátodo compartido. Cada color lleva su propia resistencia: 220 Ω desde un pin de 5 V. Mezclando colores sale amarillo, cian, morado o blanco.',
  },
  {
    type: 'display-7seg', name: 'Display de 7 segmentos (cátodo común)', prefix: 'H', category: 'senalizacion',
    systems: ['arduino', 'electronica'], w: 100, h: 130,
    ports: [
      ...['a', 'b', 'c', 'd', 'e'].map((id, i) => P(id, id, 't', 10 + i * 20, 'elec', '5v', { io: 'drive', bareLed: true, vf: 2.0, color: 'rojo' })),
      ...['f', 'g', 'dp'].map((id, i) => P(id, id, 'b', 10 + i * 20, 'elec', '5v', { io: 'drive', bareLed: true, vf: 2.0, color: 'rojo' })),
      P('K', 'cátodo', 'b', 85, 'elec', 'comun'),
    ],
    glyph: segmentGlyph(),
    note: 'Ocho LED en un solo componente (segmentos a–g y punto). Cada segmento lleva su propia resistencia de 220 Ω y su propio pin.',
  },
  {
    type: 'joystick', name: 'Joystick analógico con botón', prefix: 'B', category: 'sensores',
    systems: ['arduino'], w: 110, h: 70,
    ports: [
      P('VCC', 'VCC', 't', 15, 'elec', '5v'), P('GND', 'GND', 't', 35, 'elec', 'comun'),
      P('VRx', 'VRx', 't', 55, 'elec', '5v', { io: 'analog' }), P('VRy', 'VRy', 't', 75, 'elec', '5v', { io: 'analog' }),
      P('SW', 'SW', 't', 95, 'elec', 'libre', { pair: 'GND' }),
    ],
    glyph: '<rect x="10" y="20" width="90" height="42" rx="4"/><circle cx="55" cy="41" r="14"/><circle class="filled" cx="55" cy="41" r="5"/>',
    note: 'Dos potenciómetros (ejes X y Y) que se leen con analogRead, y un botón SW que une la señal con GND al presionar la palanca.',
    analog: [{ port: 'VRx', label: 'eje X' }, { port: 'VRy', label: 'eje Y' }],
  },
  {
    type: 'sensor-inclinacion', name: 'Sensor de inclinación (bolita)', prefix: 'B', category: 'sensores',
    systems: ['arduino', 'electronica'], w: 60, h: 70,
    ports: contact('1', '2', 30),
    glyph: g.blade(30, 0, 70, false) + '<rect x="2" y="25" width="16" height="20" rx="8"/><circle class="filled" cx="10" cy="39" r="3"/>',
    note: 'Una bolita cierra el contacto cuando el sensor se inclina. Se conecta como un botón.',
  },
  digitalModule('sensor-pir', 'Sensor de movimiento PIR (HC-SR501)', {
    label: 'movimiento',
    icon: '<path d="M35 46 a10 10 0 0 1 20 0 z"/><path d="M30 30 q15 -12 30 0 M34 36 q11 -8 22 0"/>',
    note: 'Entrega HIGH unos segundos al detectar movimiento. Sus perillas ajustan el tiempo y la distancia; esta simulación no las modela.',
  }),
  digitalModule('sensor-obstaculo', 'Sensor infrarrojo de obstáculos', {
    activeLow: true, label: 'obstáculo',
    icon: '<circle cx="34" cy="35" r="7"/><circle cx="56" cy="35" r="7"/>',
    note: 'Su señal baja a LOW cuando tiene un objeto enfrente. La distancia se ajusta con su perilla.',
  }),
  digitalModule('sensor-sonido', 'Sensor de sonido (salida digital)', {
    label: 'sonido',
    icon: '<rect x="38" y="26" width="10" height="16" rx="5"/><path d="M33 36 a10 10 0 0 0 20 0 M43 46 v4"/>',
    note: 'Su salida digital cambia cuando el sonido pasa el nivel de su perilla. Muchos módulos dan HIGH; si el tuyo da LOW, cámbialo en la tabla de pines.',
  }),
  digitalModule('sensor-llama', 'Sensor de llama', {
    activeLow: true, label: 'llama',
    icon: '<path d="M45 46 c-10 0 -12 -10 -4 -18 c0 6 4 6 4 2 c0 -4 6 -8 6 -12 c6 8 8 28 -6 28 z"/>',
    note: 'Detecta la luz infrarroja de una flama. Su señal baja a LOW al detectarla. Es para prácticas, no sustituye un detector de incendios.',
  }),
  digitalModule('sensor-hall', 'Sensor de campo magnético (Hall)', {
    activeLow: true, label: 'imán',
    icon: '<path d="M34 44 v-12 a11 11 0 0 1 22 0 v12 h-6 v-12 a5 5 0 0 0 -10 0 v12 z"/>',
    note: 'Su señal baja a LOW cuando le acercas un imán.',
  }),
  analogModule('sensor-agua', 'Sensor de nivel de agua', {
    label: 'nivel',
    icon: '<path d="M30 24 v24 M38 24 v24 M46 24 v24 M54 24 v24 M62 24 v24"/>',
    note: 'Entre más sumergido está, mayor es la lectura. No lo dejes energizado bajo el agua todo el tiempo: se corroe.',
  }),
  analogModule('sensor-humedad-suelo', 'Sensor de humedad de suelo', {
    label: 'humedad',
    icon: '<path d="M38 22 v28 l-4 -6 M52 22 v28 l4 -6"/>',
    note: 'Se clava en la tierra. Con muchos módulos la lectura baja cuando la tierra está más húmeda: revisa el tuyo.',
  }),
  analogModule('sensor-termistor', 'Sensor de temperatura con termistor', {
    label: 'temperatura',
    icon: '<rect x="35" y="28" width="20" height="14"/><path d="M30 46 l30 -22"/>',
    note: 'Resistencia que cambia con la temperatura, en un divisor de voltaje. La lectura no es lineal: para grados exactos se usa una fórmula o el LM35.',
  }),
  {
    type: 'servo', name: 'Servomotor SG90', prefix: 'M', category: 'semiconductores',
    systems: ['arduino'], w: 100, h: 70,
    ports: [
      P('GND', 'GND', 't', 20, 'elec', 'comun'), P('VCC', 'VCC', 't', 50, 'elec', '5v'),
      P('SIG', 'señal', 't', 80, 'elec', '5v', { io: 'servo' }),
    ],
    glyph: servoGlyph(0),
    note: 'Gira de 0 a 180° según la señal y se queda en ese ángulo. Se maneja con la librería Servo, que ya trae el Arduino IDE. Cables: café a GND, rojo a 5 V y naranja a la señal. Elige sus dos ángulos en Selección.',
    servo: { off: 0, on: 90 },
    needsPower: true,
  },
  {
    type: 'ultrasonico', name: 'Sensor ultrasónico de distancia HC-SR04', prefix: 'B', category: 'sensores',
    systems: ['arduino'], w: 120, h: 70,
    ports: [
      P('VCC', 'VCC', 't', 15, 'elec', '5v'), P('Trig', 'Trig', 't', 45, 'elec', '5v', { io: 'trig' }),
      P('Echo', 'Echo', 't', 75, 'elec', '5v', { io: 'echo' }), P('GND', 'GND', 't', 105, 'elec', 'comun'),
    ],
    glyph: '<path d="M15 0 V18 M45 0 V18 M75 0 V18 M105 0 V18"/><rect x="5" y="18" width="110" height="44" rx="3"/><circle cx="32" cy="40" r="15"/><circle cx="32" cy="40" r="7"/><circle cx="88" cy="40" r="15"/><circle cx="88" cy="40" r="7"/>',
    note: 'Mide de 2 a 400 cm con un pulso de ultrasonido: Trig va a un pin que manda el pulso y Echo a otro que mide cuánto tarda el eco. No necesita librería. Las superficies suaves o inclinadas regresan mal el eco.',
    analog: [{ port: 'Echo', label: 'distancia', start: 100, min: 2, max: 400, unit: 'cm' }],
    needsPower: true,
  },
  {
    type: 'lcd-i2c', name: 'Pantalla LCD 16×2 con módulo I2C', prefix: 'LCD', category: 'senalizacion',
    systems: ['arduino'], w: 200, h: 90,
    ports: [
      P('GND', 'GND', 't', 30, 'elec', 'comun'), P('VCC', 'VCC', 't', 60, 'elec', '5v'),
      P('SDA', 'SDA', 't', 90, 'elec', '5v', { io: 'sda' }), P('SCL', 'SCL', 't', 120, 'elec', '5v', { io: 'scl' }),
    ],
    glyph: lcdGlyph(['Hola, Rangokit', '']),
    note: 'Dos renglones de 16 caracteres con solo 4 cables: en el Arduino Uno, SDA va a A4 y SCL a A5. Necesita la librería LiquidCrystal_I2C (instálala desde el Administrador de bibliotecas). Escribe su texto en Selección; {A0} o {D2} muestran la lectura de ese pin.',
    lcd: { lines: ['Hola, Rangokit', ''] },
    needsPower: true,
  },
];

CATALOG.push(...ENERGY_CATALOG);

const BY_TYPE = new Map(CATALOG.map((def) => [def.type, def]));

export function definition(type) {
  const def = BY_TYPE.get(type);
  if (!def) throw new Error(`Componente desconocido: ${type}`);
  return def;
}

export function portOf(type, portId) {
  return definition(type).ports.find((port) => port.id === portId);
}

/**
 * Colores de LED con su caída de tensión típica. La caída cambia la resistencia que hace falta:
 * un LED azul o blanco necesita menos resistencia que uno rojo con la misma fuente.
 */
export const LED_COLORS = [
  { id: 'rojo', label: 'Rojo', vf: 2.0, hex: '#e5484d' },
  { id: 'amarillo', label: 'Amarillo', vf: 2.1, hex: '#f5c518' },
  { id: 'verde', label: 'Verde', vf: 2.2, hex: '#30a46c' },
  { id: 'azul', label: 'Azul', vf: 3.0, hex: '#3e8ef7' },
  { id: 'blanco', label: 'Blanco', vf: 3.0, hex: '#f2f2f2' },
];

export const ledColor = (id) => LED_COLORS.find((c) => c.id === id) ?? LED_COLORS[0];

export const ROTATIONS = [0, 90, 180, 270];
const TURN = { t: 'r', r: 'b', b: 'l', l: 't', c: 'c' };
const normal = (rot) => ((Math.round((Number(rot) || 0) / 90) % 4) + 4) % 4;

/** Ancho y alto de un componente girado. */
export function rotatedSize(def, rot = 0) {
  return normal(rot) % 2 ? [def.h, def.w] : [def.w, def.h];
}

/**
 * Posición y lado de un puerto con el componente girado en sentido horario.
 * El componente conserva su esquina superior izquierda; la caja se gira sobre sí misma.
 */
export function placePort(def, port, rot = 0) {
  let [x, y] = portPosition(def, port);
  let [w, h] = [def.w, def.h];
  let { side } = port;
  for (let i = 0; i < normal(rot); i += 1) {
    [x, y] = [h - y, x];
    [w, h] = [h, w];
    side = TURN[side];
  }
  return { x, y, side };
}

/** Transformación SVG que gira el símbolo dentro de su caja. */
export function glyphTransform(def, rot = 0) {
  switch (normal(rot)) {
    case 1: return `translate(${def.h} 0) rotate(90)`;
    case 2: return `translate(${def.w} ${def.h}) rotate(180)`;
    case 3: return `translate(0 ${def.w}) rotate(270)`;
    default: return '';
  }
}

/**
 * Símbolo de un cilindro con el vástago en una posición (0 a 100 %) y las cámaras con aire marcadas.
 * Se usa durante la simulación; en edición se dibuja el símbolo fijo.
 */
export function cylinderGlyph(def, pos, { rear = false, front = false } = {}) {
  const left = 14;
  const right = def.w - 26;
  const px = left + 6 + (right - left - 12) * Math.max(0, Math.min(100, pos)) / 100;
  const spring = def.type === 'cilindro-se';
  const zig = spring
    ? `<path d="M${px + 4} 31 ${Array.from({ length: 6 }, (_, i) => `L${px + 4 + ((right - 2 - px - 4) * (i + 0.5)) / 6} ${i % 2 ? 22 : 40}`).join(' ')} L${right - 2} 31"/>`
    : '';
  return `<rect class="chamber-fill${rear ? ' on' : ''}" x="${left}" y="14" width="${Math.max(0, px - left)}" height="34"/>
    <rect class="chamber-fill${front ? ' on' : ''}" x="${px}" y="14" width="${Math.max(0, right - px)}" height="34"/>
    <rect x="${left}" y="14" width="${right - left}" height="34"/>
    <line x1="${px}" y1="14" x2="${px}" y2="48" stroke-width="4"/>
    <line x1="${px}" y1="31" x2="${px + right - left}" y2="31" stroke-width="5"/>${zig}`;
}

/** Posición de un puerto en coordenadas locales del componente, sin girar. */
export function portPosition(def, port) {
  switch (port.side) {
    case 'l': return [0, port.at];
    case 'r': return [def.w, port.at];
    case 't': return [port.at, 0];
    case 'c': return [port.at, port.y];
    default: return [port.at, def.h];
  }
}

export const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Valor de un parámetro de energía: el de su configuración o el del catálogo, dentro de sus límites. */
export function param(component, key) {
  const def = (definition(component.type).energy?.params ?? []).find((p) => p.key === key);
  if (!def) return undefined;
  const value = Number(component.config?.[key]);
  if (!Number.isFinite(value)) return def.default;
  if (def.options) return def.options.includes(value) ? value : def.default;
  return Math.max(def.min, Math.min(def.max, value));
}

/** Filtra el catálogo por sistema, categoría y texto. */
export function filterCatalog({ system = 'todos', category = 'todas', query = '' } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return CATALOG.filter((def) => {
    if (system !== 'todos' && !def.systems.includes(system)) return false;
    if (category !== 'todas' && def.category !== category) return false;
    const group = CATEGORIES.find((c) => c.id === def.category).label;
    const haystack = fold(`${def.name} ${def.prefix} ${def.note} ${group}`);
    return words.every((word) => haystack.includes(word));
  });
}
