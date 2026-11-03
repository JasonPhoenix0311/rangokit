import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, filterCatalog, definition, portPosition } from '../src/editor/catalog.js';
import { createProject, addComponent, connect, removeComponent, reviewWiring, parseProject, nextLabel } from '../src/editor/project.js';
import { pinRows, reviewArduino, generateSketch } from '../src/editor/arduino.js';

const codes = (findings) => findings.map((f) => f.code);
const wire = (project, a, ap, b, bp) => {
  const result = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
  assert.ok(result.ok, result.error);
  return result.link;
};
const row = (project, board, pin) => pinRows(project, board).find((r) => r.id === pin);

test('el catálogo tiene puertos únicos dentro de cada componente y dentro de su caja', () => {
  for (const def of CATALOG) {
    const ids = def.ports.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, def.type);
    for (const port of def.ports) {
      const [x, y] = portPosition(def, port);
      assert.ok(x >= 0 && x <= def.w && y >= 0 && y <= def.h, `${def.type}:${port.id}`);
      if (port.pair) assert.ok(def.ports.some((p) => p.id === port.pair), `${def.type}:${port.pair}`);
    }
  }
});

test('los filtros combinan sistema, categoría y texto sin importar acentos', () => {
  const arduino = filterCatalog({ system: 'arduino' }).map((d) => d.type);
  assert.ok(arduino.includes('arduino-uno') && arduino.includes('modulo-rele'));
  assert.ok(!arduino.includes('valvula-32-boton'));
  assert.ok(filterCatalog({ system: 'neumatica' }).every((d) => d.systems.includes('neumatica')));
  assert.deepEqual(filterCatalog({ category: 'valvulas', query: 'valvula solenoide' }).map((d) => d.type),
    ['valvula-32-sol', 'valvula-52-mono', 'valvula-52-bi']);
  assert.equal(filterCatalog().length, CATALOG.length);
});

test('las etiquetas siguen la norma de cada componente y no se repiten', () => {
  const project = createProject();
  assert.equal(addComponent(project, 'pulsador-na').label, 'S1');
  assert.equal(addComponent(project, 'pulsador-na').label, 'S2');
  assert.equal(addComponent(project, 'cilindro-de').label, '1A');
  assert.equal(nextLabel(project, 'cilindro-de'), '2A');
});

test('no se puede unir un cable con una manguera', () => {
  const project = createProject();
  const valve = addComponent(project, 'valvula-52-mono');
  const supply = addComponent(project, 'fuente-24');
  const result = connect(project, { c: valve.id, p: '1' }, { c: supply.id, p: '+24' });
  assert.equal(result.ok, false);
  assert.match(result.error, /manguera/);
});

test('borrar un componente borra sus conexiones', () => {
  const project = createProject();
  const a = addComponent(project, 'fuente-24');
  const b = addComponent(project, 'lampara');
  wire(project, a, '+24', b, 'X1');
  removeComponent(project, b.id);
  assert.equal(project.links.length, 0);
});

test('regla: 24 V directo a un pin del Arduino es un error', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const valve = addComponent(project, 'valvula-52-mono');
  wire(project, uno, 'D8', valve, 'Y+');
  assert.ok(codes(reviewWiring(project)).includes('mezcla-24v-5v'));
});

test('regla: un módulo de relé separa los 24 V del Arduino', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const relay = addComponent(project, 'modulo-rele');
  const supply = addComponent(project, 'fuente-24');
  const valve = addComponent(project, 'valvula-52-mono');
  wire(project, uno, 'D8', relay, 'IN');
  wire(project, uno, '5V', relay, 'VCC');
  wire(project, uno, 'GND', relay, 'GND');
  wire(project, supply, '+24', relay, 'COM');
  wire(project, relay, 'NO', valve, 'Y+');
  wire(project, valve, 'Y-', supply, '0V');
  assert.deepEqual(codes(reviewWiring(project)).filter((c) => c !== 'puerto-neumatico-libre'), []);
  assert.deepEqual(codes(reviewArduino(project)), []);
  assert.equal(row(project, uno, 'D8').mode, 'output');
});

test('regla: unir positivo y negativo de una fuente es un cortocircuito', () => {
  const project = createProject();
  const supply = addComponent(project, 'fuente-24');
  wire(project, supply, '+24', supply, '0V');
  assert.ok(codes(reviewWiring(project)).includes('cortocircuito'));
});

test('regla: una tierra común entre 24 V y Arduino no es un error', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const supply = addComponent(project, 'fuente-24');
  wire(project, uno, 'GND', supply, '0V');
  assert.deepEqual(codes(reviewWiring(project)), []);
});

test('regla: avisa de puertos neumáticos obligatorios sin conectar', () => {
  const project = createProject();
  const cylinder = addComponent(project, 'cilindro-de');
  const valve = addComponent(project, 'valvula-52-palanca');
  const source = addComponent(project, 'fuente-aire');
  wire(project, source, 'out', valve, '1');
  wire(project, valve, '4', cylinder, 'trasera');
  wire(project, valve, '2', cylinder, 'delantera');
  assert.deepEqual(codes(reviewWiring(project)), []);
  project.links.pop();
  const findings = reviewWiring(project);
  assert.equal(findings.filter((f) => f.code === 'puerto-neumatico-libre').length, 2);
});

test('un pulsador a GND se configura como entrada con pull-up, activa en LOW', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const button = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', button, '13');
  wire(project, button, '14', uno, 'GND');
  const pin = row(project, uno, 'D2');
  assert.equal(pin.mode, 'input_pullup');
  assert.equal(pin.active, 'LOW');
  assert.equal(pin.name, 'S1');
  assert.deepEqual(codes(reviewArduino(project)), []);
});

test('regla: un pulsador a 5V pide resistencia pull-down', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const button = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', button, '13');
  wire(project, button, '14', uno, '5V');
  assert.equal(row(project, uno, 'D2').mode, 'input');
  assert.ok(codes(reviewArduino(project)).includes('pull-down'));
});

test('regla: un contacto con el otro extremo suelto lo avisa', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const button = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', button, '13');
  assert.ok(codes(reviewArduino(project)).includes('contacto-sin-retorno'));
});

test('regla: un contacto que lleva 24 V al pin es un error', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const button = addComponent(project, 'final-carrera');
  const supply = addComponent(project, 'fuente-24');
  wire(project, uno, 'D3', button, '13');
  wire(project, button, '14', supply, '+24');
  assert.ok(codes(reviewArduino(project)).includes('contacto-24v'));
});

test('regla: un potenciómetro en un pin digital no puede leerse', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const pot = addComponent(project, 'potenciometro');
  wire(project, uno, 'D4', pot, 'W');
  assert.ok(codes(reviewArduino(project)).includes('analogica-sin-adc'));
  const fixed = createProject();
  const uno2 = addComponent(fixed, 'arduino-uno');
  const pot2 = addComponent(fixed, 'potenciometro');
  wire(fixed, uno2, 'A0', pot2, 'W');
  assert.equal(row(fixed, uno2, 'A0').mode, 'analog');
  assert.ok(!codes(reviewArduino(fixed)).includes('analogica-sin-adc'));
});

test('regla: D0 y D1 avisan que son el puerto serie', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  uno.config.pins.D0 = { mode: 'output' };
  assert.ok(codes(reviewArduino(project)).includes('pin-serial'));
});

test('regla: un modo manual que contradice la conexión es un error', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const opto = addComponent(project, 'optoacoplador');
  wire(project, uno, 'D5', opto, 'OUT');
  assert.equal(row(project, uno, 'D5').mode, 'input');
  uno.config.pins.D5 = { mode: 'output' };
  assert.ok(codes(reviewArduino(project)).includes('modo-contradice'));
});

test('regla: dos pines unidos son un error', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  wire(project, uno, 'D6', uno, 'D7');
  assert.ok(codes(reviewArduino(project)).includes('pines-unidos'));
});

test('regla: una regla con pines mal configurados se avisa y se omite en el código', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  uno.config.rules.push({ input: 'D2', cond: 'activa', output: 'D8', action: 'encender' });
  assert.ok(codes(reviewArduino(project)).includes('regla-invalida'));
  assert.match(generateSketch(project, uno.id), /Regla 1 omitida/);
});

test('genera un sketch con enclavamiento: S1 enciende K1 y S2 la apaga', () => {
  const project = createProject({ name: 'Enclavamiento' });
  const uno = addComponent(project, 'arduino-uno');
  const s1 = addComponent(project, 'pulsador-na');
  const s2 = addComponent(project, 'pulsador-na');
  const relay = addComponent(project, 'modulo-rele');
  wire(project, uno, 'D2', s1, '13');
  wire(project, s1, '14', uno, 'GND');
  wire(project, uno, 'D3', s2, '13');
  wire(project, s2, '14', uno, 'GND');
  wire(project, uno, 'D8', relay, 'IN');
  uno.config.pins.D8 = { mode: 'auto', active: 'LOW' };
  uno.config.rules.push(
    { input: 'D2', cond: 'activa', output: 'D8', action: 'encender' },
    { input: 'D3', cond: 'activa', output: 'D8', action: 'apagar' },
  );
  const code = generateSketch(project, uno.id, new Date('2026-11-03T12:00:00Z'));
  assert.match(code, /Proyecto: Enclavamiento/);
  assert.match(code, /const uint8_t PIN_S1 = 2;/);
  assert.match(code, /const uint8_t PIN_K1 = 8;/);
  assert.match(code, /pinMode\(PIN_S1, INPUT_PULLUP\);/);
  assert.match(code, /digitalWrite\(PIN_K1, HIGH\);\n {2}pinMode\(PIN_K1, OUTPUT\);/);
  assert.match(code, /const bool s1 = digitalRead\(PIN_S1\) == LOW;/);
  assert.match(code, /if \(s1\) k1 = true;/);
  assert.match(code, /if \(s2\) k1 = false;/);
  assert.match(code, /digitalWrite\(PIN_K1, k1 \? LOW : HIGH\);/);
  assert.equal((code.match(/\{/g) ?? []).length, (code.match(/\}/g) ?? []).length);
});

test('genera lectura analógica con umbral', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const pot = addComponent(project, 'potenciometro');
  const led = addComponent(project, 'led');
  wire(project, uno, 'A0', pot, 'W');
  wire(project, uno, 'D9', led, 'A');
  uno.config.rules.push({ input: 'A0', cond: 'mayor', value: 600, output: 'D9', action: 'seguir' });
  const code = generateSketch(project, uno.id);
  assert.match(code, /const uint8_t PIN_R1 = A0;/);
  assert.match(code, /const int r1 = analogRead\(PIN_R1\);/);
  assert.match(code, /h1 = r1 > 600;/);
  assert.doesNotMatch(code, /pinMode\(PIN_R1/);
});

test('los nombres libres se vuelven identificadores válidos y únicos', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  uno.config.pins.D2 = { mode: 'input_pullup', name: 'Botón de arranque' };
  uno.config.pins.D3 = { mode: 'input_pullup', name: 'botón de arranque' };
  uno.config.pins.D4 = { mode: 'output', name: '1 lámpara' };
  const code = generateSketch(project, uno.id);
  assert.match(code, /PIN_BOTON_DE_ARRANQUE = 2;/);
  assert.match(code, /PIN_BOTON_DE_ARRANQUE_2 = 3;/);
  assert.match(code, /PIN_X1_LAMPARA = 4;/);
});

test('un proyecto se guarda como JSON y se vuelve a leer igual', () => {
  const project = createProject({ name: 'Ida y vuelta', system: 'arduino' });
  const uno = addComponent(project, 'arduino-uno', 100, 80);
  const led = addComponent(project, 'led', 400, 80);
  wire(project, uno, 'D13', led, 'A');
  uno.config.rules.push({ input: 'D2', cond: 'activa', output: 'D13', action: 'seguir' });
  const copy = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(copy, project);
  assert.throws(() => parseProject({ nada: true }), /no es un proyecto/);
  assert.throws(() => parseProject({ components: [{ type: 'inventado' }], links: [] }), /desconocido/);
});

test('cada componente del catálogo tiene nombre, categoría y nota', () => {
  for (const def of CATALOG) {
    assert.ok(def.name && def.note && def.category && def.systems.length, def.type);
    assert.equal(definition(def.type), def);
  }
});
