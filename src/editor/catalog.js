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
// - required: puerto neumático que debe estar conectado para que el componente funcione.

export const SYSTEMS = [
  { id: 'todos', label: 'Todos' },
  { id: 'neumatica', label: 'Neumática' },
  { id: 'electroneumatica', label: 'Electroneumática 24 V' },
  { id: 'arduino', label: 'Arduino' },
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
    systems: ['electroneumatica', 'arduino'], w: 60, h: 70,
    ports: contact('13', '14', 30),
    glyph: g.blade(30, 0, 70, false) + '<path d="M4 35 H16" stroke-dasharray="3 3"/><path d="M4 28 v14"/>',
    note: 'Cierra mientras se presiona. Sirve con 24 V o con un pin del Arduino.',
  },
  {
    type: 'pulsador-nc', name: 'Pulsador NC', prefix: 'S', category: 'mando',
    systems: ['electroneumatica', 'arduino'], w: 60, h: 70,
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
    systems: ['arduino'], w: 60, h: 70,
    ports: [P('A', 'ánodo', 't', 30, 'elec', '5v', { io: 'drive' }), P('K', 'cátodo', 'b', 30, 'elec', 'comun')],
    glyph: '<line x1="30" y1="0" x2="30" y2="25"/><path d="M20 25 h20 l-10 14 z M20 39 h20"/><line x1="30" y1="39" x2="30" y2="70"/><path d="M42 26 l8 -6 M44 33 l8 -6"/>',
    note: 'Indicador de 5 V. La resistencia limita la corriente del pin.',
    colorable: true,
  },
  {
    type: 'led-solo', name: 'LED sin resistencia', prefix: 'H', category: 'senalizacion',
    systems: ['arduino'], w: 60, h: 70,
    ports: [P('A', 'ánodo', 't', 30, 'elec', '5v', { io: 'drive', bareLed: true }), P('K', 'cátodo', 'b', 30, 'elec', 'comun')],
    glyph: '<line x1="30" y1="0" x2="30" y2="25"/><path d="M20 25 h20 l-10 14 z M20 39 h20"/><line x1="30" y1="39" x2="30" y2="70"/><path d="M42 26 l8 -6 M44 33 l8 -6"/>',
    note: 'LED solo: necesita una resistencia en serie o se quema junto con el pin.',
    colorable: true,
  },
  {
    type: 'resistencia', name: 'Resistencia', prefix: 'R', category: 'pasivos',
    systems: ['arduino', 'electroneumatica'], w: 40, h: 80,
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
  },
];

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
const TURN = { t: 'r', r: 'b', b: 'l', l: 't' };
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
    default: return [port.at, def.h];
  }
}

export const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
