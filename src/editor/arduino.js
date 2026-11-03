// Arduino Uno: tabla de pines, revisión de conexiones y generación del sketch.
// La configuración sale de lo que está conectado a cada pin; el usuario puede ajustarla a mano.
import { UNO_DIGITAL, UNO_ANALOG, definition, fold } from './catalog.js';
import { nets, netOf, members, keyOf } from './project.js';
import { formatOhms } from './calc.js';

export const PIN_MODES = [
  { id: 'auto', label: 'Automático' },
  { id: 'none', label: 'Sin usar' },
  { id: 'input', label: 'Entrada' },
  { id: 'input_pullup', label: 'Entrada con pull-up' },
  { id: 'output', label: 'Salida' },
  { id: 'analog', label: 'Entrada analógica' },
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
];

const PWM = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);

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

const isInput = (mode) => mode === 'input' || mode === 'input_pullup' || mode === 'analog';

/**
 * Deduce el modo de un pin a partir de lo que tiene conectado.
 * Devuelve { mode, active, component, reason, issue? } o { mode: null } si no hay nada.
 */
export function inferPin(project, board, pinId, groups = nets(project, 'elec')) {
  const self = keyOf({ c: board.id, p: pinId });
  const others = members(project, netOf(groups, { c: board.id, p: pinId }))
    .filter(({ component, port }) => keyOf({ c: component.id, p: port.id }) !== self);
  const find = (fn) => others.find(fn);

  const drive = find(({ port }) => port.io === 'drive');
  if (drive) return { mode: 'output', active: 'HIGH', component: drive.component, reason: `mueve ${drive.port.label} de ${drive.component.label}` };
  const signal = find(({ port }) => port.io === 'signal');
  if (signal) return { mode: 'input', active: 'HIGH', component: signal.component, reason: `recibe ${signal.port.label} de ${signal.component.label}` };
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
    const name = (manual.name || inferred.component?.label || pin.id).trim();
    return { ...pin, manual, inferred, mode, active, name };
  });
}

export function boards(project) {
  return project.components.filter((c) => definition(c.type).board === 'uno');
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

    (board.config.rules ?? []).forEach((rule, index) => {
      const problem = ruleProblem(rows, rule);
      if (problem) findings.push({ level: 'aviso', code: 'regla-invalida', where: [board.id], text: at(`regla ${index + 1}: ${problem}`) });
    });
  }
  return findings;
}

export function ruleProblem(rows, rule) {
  const input = rows.find((row) => row.id === rule.input);
  const output = rows.find((row) => row.id === rule.output);
  const condition = CONDITIONS.find((c) => c.id === rule.cond);
  if (!input || !isInput(input.mode)) return 'elige un pin configurado como entrada.';
  if (!output || output.mode !== 'output') return 'elige un pin configurado como salida.';
  if (!condition) return 'elige una condición.';
  if (condition.analog && input.mode !== 'analog') return `${input.name} es digital: usa "está activa" o "está inactiva".`;
  if (!condition.analog && input.mode === 'analog') return `${input.name} es analógica: compárala con un valor de 0 a 1023.`;
  if (condition.analog && !(Number.isFinite(Number(rule.value)) && rule.value >= 0 && rule.value <= 1023)) return 'el valor debe estar entre 0 y 1023.';
  if (!ACTIONS.some((a) => a.id === rule.action)) return 'elige una acción.';
  return null;
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

const MODE_CODE = { input: 'INPUT', input_pullup: 'INPUT_PULLUP', output: 'OUTPUT' };
const pad = (text, width) => text + ' '.repeat(Math.max(1, width - text.length));

/** Genera el sketch de Arduino a partir de la tabla de pines y las reglas. */
export function generateSketch(project, boardId, date = new Date()) {
  const board = project.components.find((c) => c.id === boardId);
  const rows = pinRows(project, board).filter((row) => row.mode !== 'none');
  const used = new Set();
  for (const row of rows) {
    row.variable = identifier(row.name, used);
    row.constant = `PIN_${row.variable.toUpperCase()}`;
  }
  const inputs = rows.filter((row) => isInput(row.mode));
  const outputs = rows.filter((row) => row.mode === 'output');
  const width = Math.max(0, ...rows.map((row) => `const uint8_t ${row.constant} = ${row.code};`.length)) + 2;
  const describe = (row) => {
    const what = row.inferred.component ? definition(row.inferred.component.type).name : 'sin componente conectado';
    if (row.mode === 'analog') return `${row.name}, ${what}. Lectura de 0 a 1023`;
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
  if (rows.some((row) => row.id === 'D0' || row.id === 'D1')) {
    lines.push('// Aviso: D0 y D1 son el puerto serie. Desconéctalos para cargar el programa.', '');
  }
  if (inputs.length) lines.push('// Entradas', ...inputs.map(declare), '');
  if (outputs.length) {
    lines.push('// Salidas', ...outputs.map(declare), '');
    lines.push('// Estado deseado de cada salida. true = activa.');
    lines.push(...outputs.map((row) => `bool ${row.variable} = false;`), '');
  }

  lines.push('void setup() {');
  for (const row of inputs) if (row.mode !== 'analog') lines.push(`  pinMode(${row.constant}, ${MODE_CODE[row.mode]});`);
  if (outputs.length) lines.push('  // Primero el nivel de reposo y luego el modo, para que ninguna salida se active al arrancar.');
  for (const row of outputs) {
    lines.push(`  digitalWrite(${row.constant}, ${row.active === 'HIGH' ? 'LOW' : 'HIGH'});`);
    lines.push(`  pinMode(${row.constant}, OUTPUT);`);
  }
  if (!rows.length) lines.push('  // Sin pines configurados. Conecta componentes al Arduino o configura la tabla de pines.');
  lines.push('}', '', 'void loop() {');

  if (inputs.length) {
    lines.push('  // Leer entradas');
    for (const row of inputs) {
      lines.push(row.mode === 'analog'
        ? `  const int ${row.variable} = analogRead(${row.constant});`
        : `  const bool ${row.variable} = digitalRead(${row.constant}) == ${row.active};`);
    }
    lines.push('');
  }

  const rules = board.config.rules ?? [];
  const allRows = pinRows(project, board);
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
      const condition = CONDITIONS.find((c) => c.id === rule.cond);
      const value = Math.round(Number(rule.value));
      const test = { activa: input.variable, inactiva: `!${input.variable}`, mayor: `${input.variable} > ${value}`, menor: `${input.variable} < ${value}` }[rule.cond];
      const action = ACTIONS.find((a) => a.id === rule.action);
      const said = condition.analog ? `${condition.label} ${value}` : condition.label;
      lines.push(`  // ${index + 1}. Si ${input.name} ${said}, ${action.id === 'seguir' ? `${output.name} sigue la condición` : `${action.label} ${output.name}`}.`);
      if (rule.action === 'seguir') lines.push(`  ${output.variable} = ${test};`);
      else lines.push(`  if (${test}) ${output.variable} = ${rule.action === 'encender' ? 'true' : 'false'};`);
    });
    lines.push('');
  } else if (outputs.length) {
    lines.push('  // Sin reglas todavía: agrega reglas en Rangokit o escribe aquí tu lógica.', '');
  }

  if (outputs.length) {
    lines.push('  // Escribir salidas');
    for (const row of outputs) {
      const [on, off] = row.active === 'HIGH' ? ['HIGH', 'LOW'] : ['LOW', 'HIGH'];
      lines.push(`  digitalWrite(${row.constant}, ${row.variable} ? ${on} : ${off});`);
    }
  }
  lines.push('}', '');
  return lines.join('\n');
}
