// Componentes del laboratorio de energías renovables: generación (solar, eólica, hidráulica),
// almacenamiento y conversión, transmisión mecánica, hidráulica de agua y cargas.
// Solo datos y símbolos; la física vive en energia.js.
//
// Tipos de conexión nuevos (kind):
// - 'pot': cable de potencia en diagrama unifilar (un trazo representa ida y retorno).
//   domain: 'gen' (salida variable de un panel, aerogenerador o generador), 'cd' (bus de batería),
//   'ca' (120 V de corriente alterna) o 'libre' (contacto de un interruptor, toma el de su red).
// - 'eje': acoplamiento mecánico entre máquinas que giran.
// - 'agua': tubería de agua.
//
// `energy.params`: valores que el usuario cambia en Selección ({ key, label, unit, min, max, step, default }).

const P = (id, label, side, at, kind, domain, extra = {}) => ({ id, label, side, at, kind, domain, ...extra });
const pot = (id, label, side, at, domain, extra) => P(id, label, side, at, 'pot', domain, extra);
const eje = (id, label, side, at, extra) => P(id, label, side, at, 'eje', 'eje', extra);
const agua = (id, label, side, at, extra) => P(id, label, side, at, 'agua', 'agua', extra);

const param = (key, label, unit, def, min, max, step = 1) => ({ key, label, unit, default: def, min, max, step });
const WATTS = (def, max = 20000, label = 'Potencia nominal') => param('watts', label, 'W', def, 1, max, 1);
const VOLTS = (def) => ({ ...param('volts', 'Tensión', 'V', def, 12, 48, 12), options: [12, 24, 48] });
// Exponente de Hellmann (perfil del viento con la altura) según el terreno.
export const TERRENOS = { 0.1: 'Mar o lago (α = 0.10)', 0.143: 'Campo abierto (α = 1/7)', 0.2: 'Rural con árboles (α = 0.20)', 0.3: 'Ciudad (α = 0.30)' };
// live: se puede cambiar durante la ejecución (pestaña Ejecución → Altura y sitio) sin detenerla.
const TERRENO = { ...param('terreno', 'Terreno alrededor', '', 0.143, 0.1, 0.3, 0.001), options: [0.1, 0.143, 0.2, 0.3], labels: TERRENOS, live: true };
const ALTURA_TORRE = (def) => ({ ...param('altura', 'Altura de la torre (buje)', 'm', def, 2, 150, 1), live: true });

const T = (x, y, text, cls = 'glyph-text') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${text}</text>`;
const machine = (letter) => `<circle cx="40" cy="30" r="20"/>${T(40, 35, letter)}`;

/** Tanque con el nivel de agua dibujado (0 a 100 %). */
export function tankGlyph(level = 50) {
  const h = 52 * Math.max(0, Math.min(100, level)) / 100;
  return `<rect class="water-fill" x="16" y="${(64 - h).toFixed(1)}" width="58" height="${h.toFixed(1)}"/>
    <rect x="16" y="12" width="58" height="52" rx="4"/><path d="M22 64 L16 84 M68 64 L74 84"/>`;
}

export const ENERGY_SYSTEM = { id: 'renovables', label: 'Energías renovables' };

export const ENERGY_CATEGORIES = [
  { id: 'generacion', label: 'Generación renovable' },
  { id: 'almacenamiento', label: 'Almacenamiento y conversión' },
  { id: 'mecanica', label: 'Transmisión mecánica' },
  { id: 'hidraulica', label: 'Hidráulica (agua)' },
  { id: 'cargas', label: 'Cargas y consumo' },
];

const S = ['renovables'];

export const ENERGY_CATALOG = [
  // ── Generación ──
  {
    type: 'panel-solar', name: 'Panel solar fotovoltaico', prefix: 'PV', category: 'generacion', systems: S, w: 110, h: 70,
    ports: [pot('out', 'salida', 'r', 35, 'gen')],
    glyph: '<rect x="6" y="10" width="80" height="52"/><path d="M6 27 H86 M6 45 H86 M33 10 V62 M60 10 V62"/><circle cx="99" cy="12" r="6"/>',
    note: 'Entrega potencia según la irradiancia (W/m²). En sitios más altos sobre el nivel del mar llega más radiación (menos atmósfera); la altura de montaje solo cambia el dibujo 3D, porque unos metros más no cambian la radiación (solo evitan sombras). Su tensión varía con el sol: a la batería se conecta con un controlador de carga.',
    energy: { params: [WATTS(400, 10000, 'Potencia pico'), { ...param('altitud', 'Altitud del sitio', 'msnm', 0, 0, 5000, 10), live: true }, { ...param('altura', 'Altura de montaje', 'm', 1, 0, 30, 0.5), live: true }] },
  },
  {
    type: 'aerogenerador', name: 'Aerogenerador pequeño', prefix: 'WG', category: 'generacion', systems: S, w: 80, h: 90,
    ports: [pot('out', 'salida', 'r', 70, 'gen')],
    glyph: '<line x1="40" y1="40" x2="40" y2="86"/><path d="M40 40 L40 6 M40 40 L69 57 M40 40 L11 57" stroke-width="4"/><circle class="filled" cx="40" cy="40" r="4"/><rect x="33" y="84" width="14" height="5"/>',
    note: 'Arranca con 3 m/s, da su potencia nominal desde 12 m/s y se frena arriba de 25 m/s, medidos a la altura de su buje: entre más alta la torre, más viento (perfil de Hellmann según el terreno). Se conecta a la batería con un controlador de carga.',
    energy: { params: [WATTS(1000, 20000), ALTURA_TORRE(10), TERRENO] },
  },
  {
    type: 'rotor-eolico', name: 'Rotor eólico (solo aspas y eje)', prefix: 'WR', category: 'generacion', systems: S, w: 80, h: 80,
    ports: [eje('eje', 'eje', 'r', 40, { required: true })],
    glyph: '<path d="M30 40 L30 6 M30 40 L59 57 M30 40 L1 57" stroke-width="4"/><circle class="filled" cx="30" cy="40" r="5"/><line class="shaft" x1="35" y1="40" x2="80" y2="40"/>',
    note: 'Convierte el viento en giro: P = ½·ρ·A·v³·Cp. Gira lento (cientos de rpm): para un generador o una bomba suele necesitar multiplicadora.',
    energy: { params: [param('radio', 'Radio de las aspas', 'm', 1.5, 0.3, 20, 0.1), ALTURA_TORRE(10), TERRENO] },
  },
  {
    type: 'turbina-hidraulica', name: 'Turbina hidráulica (Pelton)', prefix: 'HT', category: 'generacion', systems: S, w: 90, h: 80,
    ports: [agua('in', 'entrada', 'l', 30, { required: true }), agua('out', 'descarga', 'b', 45), eje('eje', 'eje', 'r', 40, { required: true })],
    glyph: '<circle cx="45" cy="40" r="22"/><path d="M45 18 v8 M67 40 h-8 M45 62 v-8 M23 40 h8 M30 25 l5 5 M60 25 l-5 5 M60 55 l-5 -5 M30 55 l5 -5"/><path d="M0 30 H20"/><line class="shaft" x1="67" y1="40" x2="90" y2="40"/>',
    note: 'Convierte la caída de agua en giro: P = ρ·g·Q·H·η. Necesita agua con altura (río o tanque elevado).',
    energy: { params: [param('caudal', 'Caudal de diseño', 'L/s', 10, 0.5, 500, 0.5)] },
  },
  {
    type: 'generador', name: 'Generador eléctrico (alternador)', prefix: 'G', category: 'generacion', systems: S, w: 80, h: 60,
    ports: [eje('eje', 'eje', 'l', 30, { required: true }), pot('out', 'salida', 'r', 30, 'gen')],
    glyph: `${machine('G')}<line class="shaft" x1="0" y1="30" x2="20" y2="30"/>`,
    note: 'Convierte giro en electricidad. Da su potencia a su velocidad nominal; más lento entrega menos. Se conecta a la batería con un controlador de carga.',
    energy: { params: [WATTS(1500), param('rpm', 'Velocidad nominal', 'rpm', 1500, 100, 6000, 50)] },
  },
  {
    type: 'rio', name: 'Río o caída de agua', prefix: 'R', category: 'hidraulica', systems: S, w: 90, h: 60,
    ports: [agua('out', 'salida', 'r', 30)],
    glyph: '<path d="M4 18 q10 -8 20 0 t20 0 t20 0 M4 32 q10 -8 20 0 t20 0 t20 0 M4 46 q10 -8 20 0 t20 0 t20 0"/><path d="M70 30 H90"/>',
    note: 'Entrega el caudal del control «Río» de la pestaña Ejecución con la altura de caída que pongas aquí.',
    energy: { params: [param('altura', 'Altura de caída', 'm', 25, 1, 500, 1)] },
  },

  // ── Almacenamiento y conversión ──
  {
    type: 'controlador-carga', name: 'Controlador de carga MPPT', prefix: 'CC', category: 'almacenamiento', systems: S, w: 100, h: 60,
    ports: [pot('in', 'entrada', 'l', 30, 'gen'), pot('bat', 'batería', 'r', 30, 'cd')],
    glyph: `<rect x="10" y="10" width="80" height="40" rx="3"/>${T(50, 28, 'MPPT')}<path d="M30 38 h40 M62 34 l8 4 l-8 4"/>`,
    note: 'Toma la energía del panel, el aerogenerador o el generador y carga la batería sin sobrecargarla (96 % de eficiencia). Recorta si se pasa de su potencia.',
    energy: { params: [WATTS(1500, 10000, 'Potencia máxima')] },
  },
  {
    type: 'bateria', name: 'Banco de baterías', prefix: 'BAT', category: 'almacenamiento', systems: S, w: 90, h: 60,
    ports: [pot('bus', 'bus CD', 't', 45, 'cd')],
    glyph: '<rect x="12" y="18" width="66" height="34" rx="3"/><path d="M28 12 v6 M62 12 v6"/><path d="M22 35 h10 M27 30 v10 M58 35 h10"/>',
    note: 'Guarda energía. Se protege sola: deja de entregar al 10 % y de cargar al 100 %. Carga y descarga como máximo a 0.5 C.',
    energy: { params: [param('capacidad', 'Capacidad', 'Wh', 2400, 100, 200000, 100), VOLTS(12), param('inicio', 'Carga inicial', '%', 50, 0, 100, 5)] },
  },
  {
    type: 'inversor', name: 'Inversor CD → CA', prefix: 'INV', category: 'almacenamiento', systems: S, w: 100, h: 60,
    ports: [pot('in', 'CD', 'l', 30, 'cd'), pot('out', 'CA', 'r', 30, 'ca')],
    glyph: `<rect x="10" y="10" width="80" height="40" rx="3"/><path d="M10 50 L90 10"/>${T(32, 28, '=')}<path d="M58 38 q5 -8 10 0 t10 0"/>`,
    note: 'Convierte la corriente directa de la batería en 120 V de alterna (92 % de eficiencia). Si las cargas piden más que su potencia, se protege y se apaga.',
    energy: { params: [WATTS(2000, 20000, 'Potencia máxima'), VOLTS(12)] },
  },
  {
    type: 'red-electrica', name: 'Red eléctrica (CFE)', prefix: 'RED', category: 'almacenamiento', systems: S, w: 80, h: 70,
    ports: [pot('out', 'CA', 'r', 35, 'ca')],
    glyph: `<path d="M40 6 L22 64 M40 6 L58 64 M28 44 H52 M31 30 H49 M18 18 H62"/>${T(40, 68, 'CFE', 'glyph-text pb-tag')}`,
    note: 'Toma de la red lo que falte y le entrega lo que sobre (medición neta). Cuenta los kWh importados y exportados.',
    energy: {},
  },
  {
    type: 'interruptor-potencia', name: 'Interruptor termomagnético', prefix: 'Q', category: 'almacenamiento', systems: S, w: 80, h: 50,
    ports: [pot('1', '1', 'l', 25, 'libre', { pair: '2' }), pot('2', '2', 'r', 25, 'libre', { pair: '1' })],
    glyph: '<path d="M0 25 H22 M58 25 H80 M22 25 L54 12"/><rect x="34" y="30" width="12" height="8"/>',
    note: 'Abre o cierra un circuito de potencia. Empieza cerrado; durante la ejecución haz clic para abrirlo.',
    energy: {},
  },
  {
    type: 'contactor', name: 'Contactor (bobina de 24 V)', prefix: 'KM', category: 'almacenamiento', systems: ['renovables', 'electroneumatica'], w: 90, h: 70,
    ports: [
      P('A1', 'A1', 't', 25, 'elec', '24v'), P('A2', 'A2', 't', 65, 'elec', 'comun'),
      pot('1', '1', 'b', 25, 'libre', { pair: '2' }), pot('2', '2', 'b', 65, 'libre', { pair: '1' }),
    ],
    glyph: '<rect x="15" y="8" width="60" height="18"/><path d="M25 70 V54 M65 70 V54 M25 54 L60 42" /><path d="M45 26 V46" stroke-dasharray="3 3"/>',
    note: 'Con 24 V en la bobina (A1-A2) cierra el contacto de potencia 1-2. Une el mando electroneumático con las cargas grandes.',
    energy: {},
  },
  {
    type: 'ssr', name: 'Relé de estado sólido (SSR)', prefix: 'K', category: 'almacenamiento', systems: ['renovables', 'arduino'], w: 90, h: 70,
    ports: [
      P('IN', 'IN', 't', 25, 'elec', '5v', { io: 'drive' }), P('GND', 'GND', 't', 65, 'elec', 'comun'),
      pot('1', '1', 'b', 25, 'libre', { pair: '2' }), pot('2', '2', 'b', 65, 'libre', { pair: '1' }),
    ],
    glyph: `<rect x="10" y="12" width="70" height="40" rx="3"/>${T(45, 37, 'SSR')}<path d="M25 52 V70 M65 52 V70"/>`,
    note: 'Un pin del Arduino (IN, con GND común) cierra el contacto de potencia 1-2. Sirve para que el Arduino prenda una bomba o una carga.',
    energy: {},
  },

  // ── Transmisión mecánica ──
  {
    type: 'multiplicadora', name: 'Multiplicadora (caja de engranes)', prefix: 'GB', category: 'mecanica', systems: S, w: 100, h: 60,
    ports: [eje('lento', 'lento', 'l', 30, { required: true }), eje('rapido', 'rápido', 'r', 30, { required: true })],
    glyph: '<circle cx="36" cy="32" r="18"/><circle cx="68" cy="28" r="10"/><path d="M0 30 H18 M78 30 H100"/>',
    note: 'El eje rápido gira «relación» veces más rápido que el lento (o al revés como reductora). Pierde 5 % de la potencia.',
    energy: { params: [param('relacion', 'Relación', ':1', 4, 0.1, 100, 0.1)] },
  },
  {
    type: 'motor-ca', name: 'Motor eléctrico de CA', prefix: 'M', category: 'mecanica', systems: S, w: 80, h: 60,
    ports: [pot('in', 'CA', 'l', 30, 'ca'), eje('eje', 'eje', 'r', 30, { required: true })],
    glyph: `${machine('M')}<path d="M0 30 H20"/><line class="shaft" x1="60" y1="30" x2="80" y2="30"/>`,
    note: 'Gira a 1750 rpm con 120 V de CA y entrega por su eje lo que pidan las máquinas acopladas, hasta su potencia (85 % de eficiencia).',
    energy: { params: [WATTS(750)] },
  },
  {
    type: 'motor-cd', name: 'Motor eléctrico de CD', prefix: 'M', category: 'mecanica', systems: S, w: 80, h: 60,
    ports: [pot('in', 'CD', 'l', 30, 'cd'), eje('eje', 'eje', 'r', 30, { required: true })],
    glyph: `${machine('M')}${T(40, 18, '=', 'glyph-text pb-tag')}<path d="M0 30 H20"/><line class="shaft" x1="60" y1="30" x2="80" y2="30"/>`,
    note: 'Motor de corriente directa conectado al bus de la batería (debe ser de la misma tensión). Gira a 1750 rpm.',
    energy: { params: [WATTS(300), VOLTS(12)] },
  },
  {
    type: 'bomba', name: 'Bomba de agua centrífuga', prefix: 'P', category: 'mecanica', systems: S, w: 90, h: 70,
    ports: [eje('eje', 'eje', 'l', 35, { required: true }), agua('in', 'succión', 'b', 45, { required: true }), agua('out', 'descarga', 't', 45, { required: true })],
    glyph: '<circle cx="45" cy="35" r="20"/><path d="M45 15 L62 45 L28 45 Z"/><line class="shaft" x1="0" y1="35" x2="25" y2="35"/>',
    note: 'Movida por un eje (motor, rotor eólico o turbina). Sube agua: Q = P·η / (ρ·g·H). Necesita girar al menos a 900 rpm y tener agua en la succión.',
    energy: { params: [WATTS(500, 20000, 'Potencia en el eje')] },
  },
  {
    type: 'compresor', name: 'Compresor de aire (de eje)', prefix: 'C', category: 'mecanica', systems: ['renovables', 'neumatica', 'electroneumatica'], w: 90, h: 60,
    ports: [eje('eje', 'eje', 'l', 30, { required: true }), P('out', 'aire', 'r', 30, 'air', 'aire')],
    glyph: `<circle cx="45" cy="30" r="20"/><path d="M45 10 L62 40 L28 40 Z"/>${T(45, 36, 'C', 'glyph-text pb-tag')}<line class="shaft" x1="0" y1="30" x2="25" y2="30"/><path d="M65 30 H90"/>`,
    note: 'Movido por un eje, entrega 6 bar a las mangueras como una fuente de aire. Si recibe menos del 80 % de su potencia no alcanza la presión.',
    energy: { params: [WATTS(400, 20000, 'Potencia en el eje')] },
  },

  // ── Hidráulica ──
  {
    type: 'tanque', name: 'Tanque elevado', prefix: 'TK', category: 'hidraulica', systems: S, w: 90, h: 90,
    ports: [agua('entrada', 'entrada', 't', 45), agua('salida', 'salida', 'r', 56)],
    glyph: tankGlyph(50),
    note: 'Guarda agua a una altura. Su salida alimenta por gravedad a una turbina o a un riego (almacenamiento por bombeo).',
    energy: { params: [param('altura', 'Altura', 'm', 15, 1, 300, 1), param('capacidad', 'Capacidad', 'L', 3000, 50, 1000000, 50), param('inicio', 'Nivel inicial', '%', 50, 0, 100, 5)] },
  },
  {
    type: 'cisterna', name: 'Cisterna o pozo', prefix: 'CI', category: 'hidraulica', systems: S, w: 90, h: 60,
    ports: [agua('agua', 'agua', 't', 45)],
    glyph: '<path d="M10 14 V52 H80 V14"/><path class="water-fill" d="M12 30 H78 V50 H12 Z"/><path d="M4 14 H86" stroke-dasharray="4 3"/>',
    note: 'Depósito a nivel del suelo que no se acaba. Una bomba succiona de aquí y la descarga de una turbina puede regresar aquí.',
    energy: {},
  },
  {
    type: 'valvula-agua', name: 'Válvula de paso', prefix: 'VA', category: 'hidraulica', systems: S, w: 80, h: 50,
    ports: [agua('in', 'entrada', 'l', 25), agua('out', 'salida', 'r', 25)],
    glyph: '<path d="M0 25 H20 M60 25 H80 M20 13 L60 37 V13 L20 37 Z"/><path d="M40 25 V8 M32 8 H48"/>',
    note: 'Empieza abierta; durante la ejecución haz clic para cerrarla.',
    energy: {},
  },
  {
    type: 'riego', name: 'Riego o consumo de agua', prefix: 'RG', category: 'hidraulica', systems: S, w: 80, h: 60,
    ports: [agua('in', 'entrada', 'l', 40, { required: true })],
    glyph: '<path d="M0 40 H40 V24"/><path d="M40 24 L26 8 M40 24 L40 4 M40 24 L54 8 M40 24 L62 20 M40 24 L18 20" stroke-dasharray="2 3"/>',
    note: 'Consume el caudal que pongas cuando le llega agua con presión (de un tanque elevado, un río o una bomba).',
    energy: { params: [param('caudal', 'Caudal', 'L/s', 1, 0.1, 200, 0.1)] },
  },
  {
    type: 'flotador', name: 'Interruptor de flotador (nivel)', prefix: 'LS', category: 'hidraulica', systems: ['renovables', 'arduino', 'electroneumatica'], w: 60, h: 70,
    ports: [P('1', '1', 't', 30, 'elec', 'libre', { pair: '2' }), P('2', '2', 'b', 30, 'elec', 'libre', { pair: '1' })],
    glyph: '<line x1="30" y1="0" x2="30" y2="10"/><line x1="30" y1="60" x2="30" y2="70"/><line x1="30" y1="60" x2="18" y2="12"/><circle cx="9" cy="35" r="7"/><path d="M14 35 H22" stroke-dasharray="2 2"/>',
    note: 'Contacto que se cierra cuando el tanque más cercano llega al nivel elegido. Sirve para que el Arduino o un relé prendan o apaguen la bomba.',
    energy: { params: [param('nivel', 'Cierra arriba de', '%', 80, 0, 100, 5)] },
  },

  // ── Cargas ──
  {
    type: 'foco-ca', name: 'Foco LED de 120 V', prefix: 'H', category: 'cargas', systems: S, w: 60, h: 60,
    ports: [pot('in', 'CA', 'l', 30, 'ca')],
    glyph: '<circle cx="34" cy="30" r="16"/><path d="M23 19 L45 41 M45 19 L23 41"/><path d="M0 30 H18"/>',
    note: 'Carga de corriente alterna. Se enciende si su red tiene energía suficiente.',
    energy: { params: [WATTS(60, 5000)] },
  },
  {
    type: 'carga-casa', name: 'Consumo de una casa', prefix: 'L', category: 'cargas', systems: S, w: 80, h: 70,
    ports: [pot('in', 'CA', 'l', 40, 'ca')],
    glyph: '<path d="M14 36 L40 12 L66 36 M20 32 V62 H60 V32"/><rect x="34" y="44" width="12" height="18"/><path d="M0 40 H20"/>',
    note: 'Representa refrigerador, televisión, focos y contactos juntos. Cambia los watts para simular más o menos consumo.',
    energy: { params: [WATTS(800, 50000, 'Consumo')] },
  },
  {
    type: 'lampara-cd', name: 'Lámpara de CD', prefix: 'H', category: 'cargas', systems: S, w: 60, h: 60,
    ports: [pot('in', 'CD', 'l', 30, 'cd')],
    glyph: '<circle cx="34" cy="30" r="14"/><path d="M24 20 L44 40 M44 20 L24 40"/><path d="M0 30 H20"/>' + T(34, 58, '=', 'glyph-text pb-tag'),
    note: 'Carga de corriente directa conectada al bus de la batería. Debe ser de la misma tensión que la batería.',
    energy: { params: [WATTS(20, 2000), VOLTS(12)] },
  },
];
