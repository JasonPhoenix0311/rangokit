// Arduino Uno: tabla de pines, revisión de conexiones y generación del sketch.
// La configuración sale de lo que está conectado a cada pin; el usuario puede ajustarla a mano.
import { UNO_DIGITAL, UNO_ANALOG, definition, fold, servoAngles, lcdLines } from './catalog.js';
import { nets, netOf, members, keyOf } from './project.js';
import { formatOhms } from './calc.js';

// Los modos con `auto` solo los pone la deducción automática (servo, ultrasónico, pantalla I2C):
// necesitan saber qué componente tienen conectado, así que no se eligen a mano.
export const PIN_MODES = [
  { id: 'auto', label: 'Automático' },
  { id: 'none', label: 'Sin usar' },
  { id: 'input', label: 'Entrada' },
  { id: 'input_pullup', label: 'Entrada con pull-up' },
  { id: 'output', label: 'Salida' },
  { id: 'analog', label: 'Entrada analógica' },
  { id: 'distance', label: 'Distancia (Echo)', auto: true },
  { id: 'trig', label: 'Disparo (Trig)', auto: true },
  { id: 'servo', label: 'Servo', auto: true },
  { id: 'i2c', label: 'Bus I2C', auto: true },
];

export const CONDITIONS = [
  { id: 'activa', label: 'está activa', analog: false },
  { id: 'inactiva', label: 'está inactiva', analog: false },
  { id: 'mayor', label: 'es mayor que', analog: true },
  { id: 'menor', label: 'es menor que', analog: true },
];

export const ACTIONS = [
  { id: 'encender', label: 'encender' },
  { id: 'apagar', label: 'apagar' },
  { id: 'seguir', label: 'que siga a la condición' },
  { id: 'angulo', label: 'mover según la lectura', servo: true },
];

/** Entradas que dan un número en lugar de activa o inactiva, con su rango. */
export const RANGES = {
  analog: { min: 0, max: 1023, start: 512 },
  distance: { min: 2, max: 400, start: 20, unit: 'cm' },
};

export const isInput = (mode) => ['input', 'input_pullup', 'analog', 'distance'].includes(mode);
export const isOutput = (mode) => mode === 'output' || mode === 'servo';
export const isMeasured = (mode) => Boolean(RANGES[mode]);

const PWM = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
const I2C_PIN = { sda: 'A4', scl: 'A5' };

/** Datos fijos de cada pin del Arduino Uno. */
export const UNO_PINS = [
  ...UNO_DIGITAL.map((id, number) => ({
    id,
    code: String(number),
    analog: false,
    notes: [
      id === 'D0' ? 'RX del puerto serie' : '',
      id === 'D1' ? 'TX del puerto serie' : '',
      id === 'D2' || id === 'D3' ? 'interrupción' : '',
      PWM.has(id) ? 'PWM' : '',
      id === 'D13' ? 'LED integrado' : '',
    ].filter(Boolean),
  })),
  ...UNO_ANALOG.map((id) => ({
    id,
    code: id,
    analog: true,
    notes: ['analógico', id === 'A4' ? 'SDA' : '', id === 'A5' ? 'SCL' : ''].filter(Boolean),
  })),
];

// Puertos de módulos con librería o protocolo propio: modo del pin, nombre sugerido y motivo.
const SPECIAL = {
  servo: { mode: 'servo', name: (c) => c.label, reason: (c) => `mueve el servo ${c.label}` },
  trig: { mode: 'trig', name: (c) => `${c.label} Trig`, reason: (c) => `manda el pulso Trig de ${c.label}` },
  echo: { mode: 'distance', name: (c) => `${c.label} distancia`, reason: (c) => `mide el eco de ${c.label} (distancia en cm)` },
  sda: { mode: 'i2c', name: (c) => `${c.label} SDA`, reason: (c) => `SDA de ${c.label}, bus I2C` },
  scl: { mode: 'i2c', name: (c) => `${c.label} SCL`, reason: (c) => `SCL de ${c.label}, bus I2C` },
};

/**
 * Deduce el modo de un pin a partir de lo que tiene conectado.
 * Devuelve { mode, active, component, reason, issue? } o { mode: null } si no hay nada.
 */
export function inferPin(project, board, pinId, groups = nets(project, 'elec')) {
  const self = keyOf({ c: board.id, p: pinId });
  const others = members(project, netOf(groups, { c: board.id, p: pinId }))
    .filter(({ component, port }) => keyOf({ c: component.id, p: port.id }) !== self);
  const find = (fn) => others.find(fn);

  const special = find(({ port }) => SPECIAL[port.io]);
  if (special) {
    const { mode, name, reason } = SPECIAL[special.port.io];
    const wrong = I2C_PIN[special.port.io] && I2C_PIN[special.port.io] !== pinId;
    return { mode, active: 'HIGH', component: special.component, port: special.port, name: name(special.component),
      reason: reason(special.component), ...(wrong ? { issue: 'i2c-pin' } : {}) };
  }
  const drive = find(({ port }) => port.io === 'drive');
  if (drive) return { mode: 'output', active: 'HIGH', component: drive.component, reason: `mueve ${drive.port.label} de ${drive.component.label}` };
  const signal = find(({ port }) => port.io === 'signal');
  if (signal) return { mode: 'input', active: signal.port.activeLow ? 'LOW' : 'HIGH', component: signal.component, reason: `recibe ${signal.port.label} de ${signal.component.label}` };
  const analog = find(({ port }) => port.io === 'analog');
  if (analog) return { mode: 'analog', active: 'HIGH', component: analog.component, reason: `lee el ${analog.port.label} de ${analog.component.label}` };

  // Resistencias conectadas al pin: qué hay del otro lado de cada una.
  const resistors = others.filter(({ port }) => port.passive === 'r').map((item) => ({
    ...item,
    far: members(project, netOf(groups, { c: item.component.id, p: item.port.pair })),
    ohms: Number(item.component.config.ohms),
  }));
  const pullDown = resistors.find((r) => r.far.some(({ port }) => port.role === 'gnd'));
  const pullUp = resistors.find((r) => r.far.some(({ port }) => port.role === 'supply+' && port.domain === '5v'));
  const ledVia = resistors.find((r) => r.far.some(({ port }) => port.io === 'drive'));
  const pull = pullDown ?? pullUp;
  const pullInfo = pull ? { pull: { component: pull.component, ohms: pull.ohms, to: pullDown ? 'GND' : '5V' } } : {};

  const contact = find(({ port }) => port.domain === 'libre' && port.pair && !port.passive);
  if (contact) {
    const far = members(project, netOf(groups, { c: contact.component.id, p: contact.port.pair }));
    const base = { component: contact.component, ...pullInfo };
    const name = contact.component.label;
    if (far.some(({ port }) => port.domain === '24v')) {
      return { ...base, mode: 'input_pullup', active: 'LOW', reason: `contacto de ${name}`, issue: 'contacto-24v' };
    }
    if (far.some(({ port }) => port.role === 'gnd')) {
      if (pullUp) return { ...base, mode: 'input', active: 'LOW', reason: `contacto de ${name} a GND, pull-up ${pullUp.component.label} de ${formatOhms(pullUp.ohms)}` };
      return { ...base, mode: 'input_pullup', active: 'LOW', reason: `contacto de ${name} a GND` };
    }
    if (far.some(({ port }) => port.role === 'supply+')) {
      if (pullDown) return { ...base, mode: 'input', active: 'HIGH', reason: `contacto de ${name} a 5V, pull-down ${pullDown.component.label} de ${formatOhms(pullDown.ohms)}` };
      return { ...base, mode: 'input', active: 'HIGH', reason: `contacto de ${name} a 5V`, issue: 'pull-down' };
    }
    return { ...base, mode: 'input_pullup', active: 'LOW', reason: `contacto de ${name}`, issue: 'contacto-sin-retorno' };
  }
  if (ledVia) {
    const led = ledVia.far.find(({ port }) => port.io === 'drive');
    return { mode: 'output', active: 'HIGH', component: led.component, reason: `mueve ${led.component.label} a través de ${ledVia.component.label}` };
  }
  if (pull) {
    return { mode: 'input', active: pullDown ? 'HIGH' : 'LOW', component: pull.component, reason: `solo tiene ${pull.component.label} a ${pullInfo.pull.to}, sin señal`, issue: 'entrada-sin-senal', ...pullInfo };
  }
  return { mode: null };
}

/** Tabla completa de pines de una placa, con lo deducido y lo configurado a mano. */
export function pinRows(project, board) {
  const groups = nets(project, 'elec');
  return UNO_PINS.map((pin) => {
    const manual = board.config.pins?.[pin.id] ?? {};
    const inferred = inferPin(project, board, pin.id, groups);
    const mode = manual.mode && manual.mode !== 'auto' ? manual.mode : inferred.mode ?? 'none';
    const active = manual.active || (mode === 'input_pullup' ? 'LOW' : inferred.mode === mode ? inferred.active : 'HIGH');
    const name = (manual.name || inferred.name || inferred.component?.label || pin.id).trim();
    return { ...pin, manual, inferred, mode, active, name };
  });
}

export function boards(project) {
  return project.components.filter((c) => definition(c.type).board === 'uno');
}

/** Pantallas LCD conectadas al bus I2C de una placa. */
export function lcdsOf(rows) {
  const found = new Map();
  for (const row of rows) {
    const c = row.inferred.component;
    if (row.inferred.mode === 'i2c' && c?.type === 'lcd-i2c') found.set(c.id, c);
  }
  return [...found.values()];
}

/** Revisión específica del Arduino. Cada hallazgo es verificable con la tabla de pines. */
export function reviewArduino(project) {
  const findings = [];
  const groups = nets(project, 'elec');
  for (const board of boards(project)) {
    const rows = pinRows(project, board);
    const at = (text) => `${board.label}, ${text}`;
    for (const row of rows) {
      if (row.mode === 'none') continue;
      if (row.id === 'D0' || row.id === 'D1') {
        findings.push({ level: 'aviso', code: 'pin-serial', where: [board.id],
          text: at(`${row.id}: es el puerto serie. Mientras lo uses, cargar el programa por USB puede fallar y no tendrás Serial para depurar.`) });
      }
      if (row.mode === 'analog' && !row.analog) {
        findings.push({ level: 'error', code: 'analogica-sin-adc', where: [board.id],
          text: at(`${row.id}: solo A0 a A5 leen valores analógicos. Mueve ${row.name} a uno de esos pines.`) });
      }
      const inferred = row.inferred;
      if (inferred.mode && row.manual.mode && row.manual.mode !== 'auto' && isInput(row.manual.mode) !== isInput(inferred.mode)) {
        findings.push({ level: 'error', code: 'modo-contradice', where: [board.id, inferred.component.id],
          text: at(`${row.id}: lo configuraste como ${PIN_MODES.find((m) => m.id === row.manual.mode).label.toLowerCase()}, pero ${inferred.reason}. Deja el modo en Automático o cambia la conexión.`) });
      }
      if (inferred.issue === 'contacto-24v') {
        findings.push({ level: 'error', code: 'contacto-24v', where: [board.id, inferred.component.id],
          text: at(`${row.id}: el contacto de ${inferred.component.label} lleva 24 V al pin.`),
          suggest: [{ type: 'optoacoplador', text: 'Si el contacto debe quedarse en el circuito de 24 V, lee su señal con un optoacoplador. Si no, conecta su otro extremo a GND del Arduino.' }] });
      }
      if (inferred.issue === 'pull-down' && (row.manual.mode ?? 'auto') === 'auto') {
        findings.push({ level: 'aviso', code: 'pull-down', where: [board.id, inferred.component.id],
          text: at(`${row.id}: el contacto de ${inferred.component.label} va a 5V. Con el contacto abierto el pin queda al aire y lee valores al azar.`),
          suggest: [{ type: 'resistencia', ohms: 10000, text: `Agrega una resistencia de 10 kΩ entre ${row.id} y GND (pull-down). O más simple: lleva el contacto a GND y usa el pull-up interno.` }] });
      }
      if (inferred.issue === 'contacto-sin-retorno') {
        findings.push({ level: 'aviso', code: 'contacto-sin-retorno', where: [board.id, inferred.component.id],
          text: at(`${row.id}: el otro extremo del contacto de ${inferred.component.label} no está conectado. Llévalo a GND.`) });
      }
      if (inferred.issue === 'entrada-sin-senal') {
        findings.push({ level: 'aviso', code: 'entrada-sin-senal', where: [board.id, inferred.component.id],
          text: at(`${row.id}: ${inferred.reason}. El pin siempre va a leer lo mismo. Conecta también el contacto o sensor que quieres leer.`) });
      }
      if (inferred.issue === 'i2c-pin') {
        findings.push({ level: 'error', code: 'i2c-pin', where: [board.id, inferred.component.id],
          text: at(`${row.id}: ${inferred.port.label} de ${inferred.component.label} debe ir a ${I2C_PIN[inferred.port.io]}. En el Arduino Uno el bus I2C solo está en A4 (SDA) y A5 (SCL).`) });
      }
      if (inferred.pull && inferred.pull.ohms < 1000) {
        const kind = inferred.pull.to === 'GND' ? 'down' : 'up';
        findings.push({ level: 'aviso', code: 'pull-baja', where: [board.id, inferred.pull.component.id],
          text: at(`${row.id}: ${inferred.pull.component.label} de ${formatOhms(inferred.pull.ohms)} es muy baja para pull-${kind}: con el contacto cerrado gasta ${Math.round(5000 / inferred.pull.ohms)} mA sin necesidad.`),
          suggest: [{ type: 'resistencia', ohms: 10000, text: `Cambia ${inferred.pull.component.label} por una de 10 kΩ.` }] });
      }
    }

    const pinKeys = new Set(UNO_PINS.map((pin) => keyOf({ c: board.id, p: pin.id })));
    const reported = new Set();
    for (const pin of UNO_PINS) {
      const group = netOf(groups, { c: board.id, p: pin.id });
      const shared = [...group].filter((key) => pinKeys.has(key));
      if (shared.length > 1 && !reported.has(shared[0])) {
        reported.add(shared[0]);
        findings.push({ level: 'error', code: 'pines-unidos', where: [board.id],
          text: at(`${shared.map((key) => key.split(':')[1]).join(' y ')} están unidos. Si uno es salida, los dos pines se pueden dañar.`) });
      }
    }

    findings.push(...reviewModules(project, board, rows, groups, at));

    (board.config.rules ?? []).forEach((rule, index) => {
      const problem = ruleProblem(rows, rule);
      if (problem) findings.push({ level: 'aviso', code: 'regla-invalida', where: [board.id], text: at(`regla ${index + 1}: ${problem}`) });
    });
  }
  return findings;
}

/** Reglas de los módulos con protocolo propio: ultrasónico, servos y pantalla. */
function reviewModules(project, board, rows, groups, at) {
  const findings = [];
  // Ultrasónico: necesita Trig y Echo, cada uno en su pin.
  const sonars = new Map();
  for (const row of rows) {
    const c = row.inferred.component;
    if (row.inferred.mode !== 'trig' && row.inferred.mode !== 'distance') continue;
    const entry = sonars.get(c.id) ?? { component: c };
    entry[row.inferred.mode] = row;
    sonars.set(c.id, entry);
  }
  for (const { component, trig, distance } of sonars.values()) {
    if (!trig) {
      findings.push({ level: 'error', code: 'ultrasonico-sin-trig', where: [board.id, component.id],
        text: at(`${distance.id} mide el eco de ${component.label}, pero su Trig no está conectado a un pin. Sin el pulso de Trig el sensor no mide nada.`) });
    }
    if (!distance) {
      findings.push({ level: 'error', code: 'ultrasonico-sin-echo', where: [board.id, component.id],
        text: at(`${trig.id} manda el pulso de ${component.label}, pero su Echo no está conectado a un pin. Conéctalo a otro pin digital para leer la distancia.`) });
    }
  }

  // Módulos que reciben o mandan señal a la placa: su GND debe ser el mismo que el del Arduino.
  const boardGnd = keyOf({ c: board.id, p: 'GND' });
  const linked = new Map();
  for (const row of rows) {
    const c = row.inferred.component;
    if (c && definition(c.type).needsPower) linked.set(c.id, c);
  }
  for (const c of linked.values()) {
    const gnd = netOf(groups, { c: c.id, p: 'GND' });
    const grounded = members(project, gnd).some((item) => item.component.id !== c.id && item.port.role === 'gnd');
    if (grounded && !gnd.has(boardGnd)) {
      findings.push({ level: 'error', code: 'sin-tierra-comun', where: [board.id, c.id],
        text: at(`${c.label} se comunica con el Arduino, pero su GND no está unido al GND de ${board.label}. Sin tierra común la señal no tiene referencia y el módulo no responde.`),
        suggest: [{ type: 'fuente-5', text: `Une con un cable el GND de la fuente que alimenta a ${c.label} con el GND del Arduino.` }] });
    }
  }

  // Varios servos del 5V del Arduino piden más corriente de la que entrega.
  const board5v = keyOf({ c: board.id, p: '5V' });
  const fed = project.components.filter((c) => c.type === 'servo' && netOf(groups, { c: c.id, p: 'VCC' }).has(board5v));
  if (fed.length >= 2) {
    findings.push({ level: 'aviso', code: 'servos-en-5v', where: [board.id, ...fed.map((c) => c.id)],
      text: at(`${fed.map((c) => c.label).join(', ')} toman 5 V del Arduino. Cada servo puede pedir más de 500 mA al arrancar o con carga, y el Arduino se reinicia o el USB se apaga.`),
      suggest: [{ type: 'fuente-5', text: 'Alimenta los servos con una fuente de 5 V aparte (su VCC al + de la fuente) y une el GND de la fuente con el GND del Arduino. La señal sigue saliendo de los pines.' }] });
  }

  // Pantalla: texto que cabe y lecturas de pines que existen.
  const lcds = lcdsOf(rows);
  for (const lcd of lcds) {
    lcdLines(lcd).forEach((text, i) => {
      const { bad, length } = lcdParts(text, rows);
      if (bad.length) {
        findings.push({ level: 'aviso', code: 'lcd-dato-invalido', where: [lcd.id],
          text: at(`renglón ${i + 1} de ${lcd.label}: ${bad.join(', ')} no es un pin usado como entrada o salida. Usa, por ejemplo, {A0} para mostrar la lectura de A0.`) });
      }
      if (length > LCD_COLS) {
        findings.push({ level: 'aviso', code: 'lcd-texto-largo', where: [lcd.id],
          text: at(`renglón ${i + 1} de ${lcd.label}: ocupa ${length} caracteres y la pantalla muestra ${LCD_COLS}. Lo que sobra no se ve.`) });
      }
    });
  }
  if (lcds.length > 1) {
    findings.push({ level: 'aviso', code: 'lcd-varias', where: [board.id, ...lcds.map((c) => c.id)],
      text: at(`tiene ${lcds.length} pantallas en el bus I2C. El código generado solo maneja ${lcds[0].label}; las demás necesitan otra dirección I2C y su propio objeto.`) });
  }
  return findings;
}

export function ruleProblem(rows, rule) {
  const input = rows.find((row) => row.id === rule.input);
  const output = rows.find((row) => row.id === rule.output);
  const condition = CONDITIONS.find((c) => c.id === rule.cond);
  if (!input || !isInput(input.mode)) return 'elige un pin configurado como entrada.';
  if (!output || !isOutput(output.mode)) return 'elige un pin configurado como salida.';
  if (rule.action === 'angulo') {
    if (output.mode !== 'servo') return `${output.name} no es un servo: "mover según la lectura" solo sirve para servos.`;
    if (!isMeasured(input.mode)) return `${input.name} no da una lectura: usa una entrada analógica o un sensor de distancia.`;
    return null;
  }
  if (!condition) return 'elige una condición.';
  const range = RANGES[input.mode];
  if (condition.analog && !range) return `${input.name} es digital: usa "está activa" o "está inactiva".`;
  if (!condition.analog && input.mode === 'analog') return `${input.name} es analógica: compárala con un valor de 0 a 1023.`;
  if (!condition.analog && range) return `${input.name} es una distancia: compárala con un valor de ${range.min} a ${range.max} cm.`;
  if (condition.analog && !(Number.isFinite(Number(rule.value)) && rule.value >= range.min && rule.value <= range.max)) {
    return input.mode === 'analog' ? 'el valor debe estar entre 0 y 1023.' : `la distancia debe estar entre ${range.min} y ${range.max} cm.`;
  }
  if (!ACTIONS.some((a) => a.id === rule.action)) return 'elige una acción.';
  return null;
}

// Pantalla LCD de 16×2. El texto admite lecturas de pines: "Luz: {A0}".
export const LCD_COLS = 16;
const LCD_FIELDS = {
  analog: { width: 4, format: '%4d', arg: (row) => row.variable },
  distance: { width: 3, format: '%3ld', arg: (row) => row.variable },
  servo: { width: 3, format: '%3d', arg: (row) => row.variable },
  bool: { width: 2, format: '%s', arg: (row) => `${row.variable} ? "SI" : "NO"` },
};
const lcdField = (row) => LCD_FIELDS[row.mode] ?? LCD_FIELDS.bool;
const SHOWABLE = (mode) => isInput(mode) || isOutput(mode);

/** La pantalla no tiene acentos ni ñ: se cambian por la letra simple y los demás símbolos por "?". */
export function lcdClean(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
}

/** Separa un renglón en texto fijo y lecturas de pines. Devuelve { parts, bad, length }. */
export function lcdParts(text, rows) {
  const clean = lcdClean(text);
  const parts = [];
  const bad = [];
  let last = 0;
  for (const match of clean.matchAll(/\{(A[0-5]|D1[0-3]|D[0-9])\}/gi)) {
    if (match.index > last) parts.push({ text: clean.slice(last, match.index) });
    const row = rows.find((r) => r.id === match[1].toUpperCase() && SHOWABLE(r.mode));
    if (row) parts.push({ row, width: lcdField(row).width });
    else {
      parts.push({ text: match[0] });
      bad.push(match[0]);
    }
    last = match.index + match[0].length;
  }
  if (last < clean.length) parts.push({ text: clean.slice(last) });
  const length = parts.reduce((sum, part) => sum + (part.row ? part.width : part.text.length), 0);
  return { parts, bad, length };
}

/** Texto que muestra un renglón con las lecturas actuales. `valueOf(row)` da el número o el estado del pin. */
export function lcdLine(text, rows, valueOf) {
  const out = lcdParts(text, rows).parts.map((part) => {
    if (!part.row) return part.text;
    const value = valueOf(part.row);
    if (typeof value === 'number') return String(Math.round(value)).padStart(part.width);
    return value ? 'SI' : 'NO';
  }).join('');
  return out.padEnd(LCD_COLS).slice(0, LCD_COLS);
}

/** Convierte un nombre libre en un identificador válido de C++. */
function identifier(name, used) {
  let base = fold(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'senal';
  if (/^[0-9]/.test(base)) base = `x${base}`;
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}_${n}`;
  used.add(id);
  return id;
}

const MODE_CODE = { input: 'INPUT', input_pullup: 'INPUT_PULLUP', output: 'OUTPUT', distance: 'INPUT' };
const pad = (text, width) => text + ' '.repeat(Math.max(1, width - text.length));
const cString = (text) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Genera el sketch de Arduino a partir de la tabla de pines y las reglas. */
export function generateSketch(project, boardId, date = new Date()) {
  const board = project.components.find((c) => c.id === boardId);
  const allRows = pinRows(project, board);
  const rows = allRows.filter((row) => row.mode !== 'none');
  // Nombres que usa el propio sketch.
  const used = new Set(['lcd', 'linea', 'medircm']);
  for (const row of rows) {
    row.variable = identifier(row.name, used);
    row.constant = `PIN_${row.variable.toUpperCase()}`;
  }
  const inputs = rows.filter((row) => isInput(row.mode));
  const outputs = rows.filter((row) => row.mode === 'output');
  const servos = rows.filter((row) => row.mode === 'servo');
  const trigs = rows.filter((row) => row.mode === 'trig');
  const buses = rows.filter((row) => row.mode === 'i2c');
  const declared = rows.filter((row) => row.mode !== 'i2c');
  const lcd = lcdsOf(rows)[0];
  for (const row of servos) {
    const c = row.inferred.component;
    row.angles = c?.type === 'servo' ? servoAngles(c) : { off: 0, on: 90 };
    row.object = identifier(`servo_${row.variable}`, used);
  }
  for (const row of inputs.filter((r) => r.mode === 'distance')) {
    row.trig = trigs.find((t) => t.inferred.component && t.inferred.component.id === row.inferred.component?.id);
  }
  const width = Math.max(0, ...declared.map((row) => `const uint8_t ${row.constant} = ${row.code};`.length)) + 2;
  const describe = (row) => {
    const what = row.inferred.component ? definition(row.inferred.component.type).name : 'sin componente conectado';
    if (row.mode === 'analog') return `${row.name}, ${what}. Lectura de 0 a 1023`;
    if (row.mode === 'distance') return `${row.name}, ${what}. Distancia en cm, de 2 a 400`;
    if (row.mode === 'trig') return `${row.name}, ${what}. Manda el pulso de medición`;
    if (row.mode === 'servo') return `${row.name}, ${what}. Ángulos ${row.angles.off}° y ${row.angles.on}°`;
    if (row.mode === 'output') return `${row.name}, ${what}. Se activa con ${row.active}`;
    if (row.mode === 'input_pullup') return `${row.name}, ${what}. Pull-up interno: ${row.active} = activa`;
    return `${row.name}, ${what}. ${row.active} = activa`;
  };
  const declare = (row) => `${pad(`const uint8_t ${row.constant} = ${row.code};`, width)}// ${describe(row)}`;

  const lines = [
    '/*',
    `  Proyecto: ${project.name.replace(/\*\//g, '* /')}`,
    '  Placa: Arduino Uno',
    `  Generado con Rangokit el ${date.toISOString().slice(0, 10)}.`,
    '',
    '  El código sigue la tabla de pines y las reglas del proyecto. No comprueba',
    '  el circuito real: revisa cada conexión antes de energizar.',
    '*/',
    '',
  ];
  if (servos.length || lcd) {
    lines.push('// Librerías');
    if (servos.length) lines.push('#include <Servo.h>              // Ya viene con el Arduino IDE.');
    if (lcd) lines.push('#include <Wire.h>', '#include <LiquidCrystal_I2C.h>  // Instálala desde el Administrador de bibliotecas.');
    lines.push('');
  }
  if (rows.some((row) => row.id === 'D0' || row.id === 'D1')) {
    lines.push('// Aviso: D0 y D1 son el puerto serie. Desconéctalos para cargar el programa.', '');
  }
  if (inputs.length) lines.push('// Entradas', ...inputs.map(declare), '');
  if (trigs.length) lines.push('// Disparo de los sensores ultrasónicos', ...trigs.map(declare), '');
  if (outputs.length) {
    lines.push('// Salidas', ...outputs.map(declare), '');
    lines.push('// Estado deseado de cada salida. true = activa.');
    lines.push(...outputs.map((row) => `bool ${row.variable} = false;`), '');
  }
  if (servos.length) {
    lines.push('// Servos', ...servos.map(declare), '');
    lines.push(...servos.map((row) => `Servo ${row.object};`), '');
    lines.push('// Ángulo deseado de cada servo, en grados.');
    lines.push(...servos.map((row) => `int ${row.variable} = ${row.angles.off};`), '');
  }
  if (buses.length) lines.push(`// ${buses.map((row) => row.id).join(' y ')}: bus I2C de la pantalla. Los maneja la librería Wire.`);
  if (lcd) {
    lines.push(`// Pantalla ${lcd.label}. 0x27 es la dirección más común: si no aparece nada, prueba 0x3F`);
    lines.push('// y ajusta el contraste con el tornillo del módulo.');
    lines.push('LiquidCrystal_I2C lcd(0x27, 16, 2);', '');
  } else if (buses.length) lines.push('');
  if (inputs.some((row) => row.mode === 'distance')) {
    lines.push(
      '// Mide la distancia en cm con un HC-SR04. Si el eco no regresa en 30 ms, devuelve 400 (fuera de rango).',
      'long medirCm(uint8_t trig, uint8_t echo) {',
      '  digitalWrite(trig, LOW);',
      '  delayMicroseconds(2);',
      '  digitalWrite(trig, HIGH);',
      '  delayMicroseconds(10);',
      '  digitalWrite(trig, LOW);',
      '  const unsigned long us = pulseIn(echo, HIGH, 30000UL);',
      '  if (us == 0 || us / 58 > 400) return 400;',
      '  return us / 58;',
      '}',
      '',
    );
  }

  lines.push('void setup() {');
  for (const row of inputs) if (row.mode !== 'analog') lines.push(`  pinMode(${row.constant}, ${MODE_CODE[row.mode]});`);
  for (const row of trigs) lines.push(`  digitalWrite(${row.constant}, LOW);`, `  pinMode(${row.constant}, OUTPUT);`);
  if (outputs.length) lines.push('  // Primero el nivel de reposo y luego el modo, para que ninguna salida se active al arrancar.');
  for (const row of outputs) {
    lines.push(`  digitalWrite(${row.constant}, ${row.active === 'HIGH' ? 'LOW' : 'HIGH'});`);
    lines.push(`  pinMode(${row.constant}, OUTPUT);`);
  }
  for (const row of servos) lines.push(`  ${row.object}.attach(${row.constant});`, `  ${row.object}.write(${row.variable});`);
  if (lcd) lines.push('  lcd.init();', '  lcd.backlight();');
  if (!rows.length) lines.push('  // Sin pines configurados. Conecta componentes al Arduino o configura la tabla de pines.');
  lines.push('}', '', 'void loop() {');

  if (inputs.length) {
    lines.push('  // Leer entradas');
    for (const row of inputs) {
      if (row.mode === 'analog') lines.push(`  const int ${row.variable} = analogRead(${row.constant});`);
      else if (row.mode === 'distance') {
        lines.push(row.trig
          ? `  const long ${row.variable} = medirCm(${row.trig.constant}, ${row.constant});`
          : `  const long ${row.variable} = 400;  // Falta conectar Trig: sin pulso no hay medición.`);
      } else lines.push(`  const bool ${row.variable} = digitalRead(${row.constant}) == ${row.active};`);
    }
    lines.push('');
  }

  const rules = board.config.rules ?? [];
  if (rules.length) {
    lines.push('  // Reglas, en orden. Si dos reglas mandan la misma salida, gana la última.');
    rules.forEach((rule, index) => {
      const problem = ruleProblem(allRows, rule);
      if (problem) {
        lines.push(`  // Regla ${index + 1} omitida: ${problem}`);
        return;
      }
      const input = rows.find((row) => row.id === rule.input);
      const output = rows.find((row) => row.id === rule.output);
      if (rule.action === 'angulo') {
        const { min, max } = RANGES[input.mode];
        const { off, on } = output.angles;
        lines.push(`  // ${index + 1}. ${output.name} se mueve según ${input.name}: ${min} → ${off}°, ${max} → ${on}°.`);
        lines.push(`  ${output.variable} = map(constrain(${input.variable}, ${min}, ${max}), ${min}, ${max}, ${off}, ${on});`);
        return;
      }
      const condition = CONDITIONS.find((c) => c.id === rule.cond);
      const value = Math.round(Number(rule.value));
      const test = { activa: input.variable, inactiva: `!${input.variable}`, mayor: `${input.variable} > ${value}`, menor: `${input.variable} < ${value}` }[rule.cond];
      const action = ACTIONS.find((a) => a.id === rule.action);
      const said = condition.analog ? `${condition.label} ${value}` : condition.label;
      if (output.mode === 'servo') {
        const { off, on } = output.angles;
        if (rule.action === 'seguir') {
          lines.push(`  // ${index + 1}. Si ${input.name} ${said}, ${output.name} va a ${on}°; si no, a ${off}°.`);
          lines.push(`  ${output.variable} = (${test}) ? ${on} : ${off};`);
        } else {
          const angle = rule.action === 'encender' ? on : off;
          lines.push(`  // ${index + 1}. Si ${input.name} ${said}, mover ${output.name} a ${angle}°.`);
          lines.push(`  if (${test}) ${output.variable} = ${angle};`);
        }
        return;
      }
      lines.push(`  // ${index + 1}. Si ${input.name} ${said}, ${action.id === 'seguir' ? `${output.name} sigue la condición` : `${action.label} ${output.name}`}.`);
      if (rule.action === 'seguir') lines.push(`  ${output.variable} = ${test};`);
      else lines.push(`  if (${test}) ${output.variable} = ${rule.action === 'encender' ? 'true' : 'false'};`);
    });
    lines.push('');
  } else if (outputs.length || servos.length) {
    lines.push('  // Sin reglas todavía: agrega reglas en Rangokit o escribe aquí tu lógica.', '');
  }

  if (outputs.length) {
    lines.push('  // Escribir salidas');
    for (const row of outputs) {
      const [on, off] = row.active === 'HIGH' ? ['HIGH', 'LOW'] : ['LOW', 'HIGH'];
      lines.push(`  digitalWrite(${row.constant}, ${row.variable} ? ${on} : ${off});`);
    }
  }
  if (servos.length) {
    if (outputs.length) lines.push('');
    lines.push('  // Mover servos');
    for (const row of servos) lines.push(`  ${row.object}.write(${row.variable});`);
  }
  if (lcd) {
    if (outputs.length || servos.length) lines.push('');
    const layout = lcdLines(lcd).map((text) => lcdParts(text, rows));
    lines.push('  // Pantalla: cada renglón se escribe completo; los espacios del final borran lo anterior.');
    if (layout.some((line) => line.parts.some((part) => part.row))) lines.push('  char linea[17];');
    layout.forEach((line, i) => {
      const fields = line.parts.filter((part) => part.row);
      const fill = ' '.repeat(Math.max(0, LCD_COLS - line.length));
      lines.push(`  lcd.setCursor(0, ${i});`);
      if (!fields.length) {
        lines.push(`  lcd.print(F("${cString((line.parts.map((part) => part.text).join('') + fill).slice(0, LCD_COLS))}"));`);
        return;
      }
      const format = line.parts.map((part) => (part.row ? lcdField(part.row).format : cString(part.text).replace(/%/g, '%%'))).join('') + fill;
      lines.push(`  snprintf(linea, sizeof linea, "${format}", ${fields.map((part) => lcdField(part.row).arg(part.row)).join(', ')});`);
      lines.push('  lcd.print(linea);');
    });
  }
  lines.push('}', '');
  return lines.join('\n');
}
