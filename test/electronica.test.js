import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, definition, filterCatalog, placePort } from '../src/editor/catalog.js';
import { createProject, addComponent, connect, reviewWiring, nets, netOf, parseProject } from '../src/editor/project.js';
import { pinRows, reviewArduino } from '../src/editor/arduino.js';
import { createSim, advance, press, toggle, setValue, view, interaction } from '../src/editor/sim.js';

const codes = (findings) => findings.map((f) => f.code);
const wire = (project, a, ap, b, bp) => {
  const result = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
  assert.ok(result.ok, result.error);
};
const sameNet = (project, a, ap, b, bp) => netOf(nets(project), { c: a.id, p: ap }).has(`${b.id}:${bp}`);

test('la protoboard tiene 168 orificios dentro de la placa y uniones internas válidas', () => {
  const def = definition('protoboard');
  assert.equal(def.ports.length, 12 * 10 + 4 * 12);
  for (const port of def.ports) {
    assert.equal(port.side, 'c');
    assert.ok(port.at > 0 && port.at < def.w && port.y > 0 && port.y < def.h, port.id);
  }
  const ids = new Set(def.ports.map((p) => p.id));
  for (const group of def.bus) for (const id of group) assert.ok(ids.has(id), id);
  // Los orificios giran con la placa y siguen dentro de ella.
  const [w, h] = [def.h, def.w];
  for (const port of def.ports) {
    const { x, y, side } = placePort(def, port, 90);
    assert.equal(side, 'c');
    assert.ok(x > 0 && x < w && y > 0 && y < h, port.id);
  }
});

test('protoboard: cada columna de 5 orificios y cada riel están unidos; el canal separa las mitades', () => {
  const project = createProject();
  const pb = addComponent(project, 'protoboard');
  assert.ok(sameNet(project, pb, 'a3', pb, 'e3'));
  assert.ok(sameNet(project, pb, 'f3', pb, 'j3'));
  assert.ok(!sameNet(project, pb, 'e3', pb, 'f3'), 'el canal central separa');
  assert.ok(!sameNet(project, pb, 'a3', pb, 'a4'), 'columnas vecinas separadas');
  assert.ok(sameNet(project, pb, '+s1', pb, '+s12'));
  assert.ok(!sameNet(project, pb, '+s1', pb, '-s1'));
  assert.ok(!sameNet(project, pb, '+s1', pb, '+i1'), 'rieles de arriba y abajo separados');
});

test('protoboard: un corto entre rieles + y − se detecta aunque pase por la placa', () => {
  const project = createProject();
  const pb = addComponent(project, 'protoboard');
  const g = addComponent(project, 'fuente-5');
  wire(project, g, '+5V', pb, '+s1');
  wire(project, g, 'GND', pb, '-s1');
  assert.ok(!codes(reviewWiring(project)).includes('cortocircuito'));
  wire(project, pb, '+s5', pb, '-s9');
  assert.ok(codes(reviewWiring(project)).includes('cortocircuito'));
});

test('protoboard: LED sin resistencia en la placa se marca, y con 220 Ω no', () => {
  const project = createProject();
  const pb = addComponent(project, 'protoboard');
  const g = addComponent(project, 'fuente-5');
  const led = addComponent(project, 'led-solo');
  wire(project, g, '+5V', pb, '+s1');
  wire(project, g, 'GND', pb, '-s1');
  wire(project, pb, '+s4', pb, 'a4');
  wire(project, led, 'A', pb, 'c4');
  wire(project, led, 'K', pb, '-s6');
  assert.ok(codes(reviewWiring(project)).includes('led-sin-resistencia'));

  const ok = createProject();
  const pb2 = addComponent(ok, 'protoboard');
  const g2 = addComponent(ok, 'fuente-5');
  const r = addComponent(ok, 'resistencia');
  const led2 = addComponent(ok, 'led-solo');
  r.config.ohms = 220;
  wire(ok, g2, '+5V', pb2, '+s1');
  wire(ok, g2, 'GND', pb2, '-s1');
  wire(ok, r, '1', pb2, '+s4');
  wire(ok, r, '2', pb2, 'b5');
  wire(ok, led2, 'A', pb2, 'd5');
  wire(ok, led2, 'K', pb2, '-s7');
  assert.deepEqual(codes(reviewWiring(ok)), []);
});

test('simulación: fuente de 5 V, botón táctil y LED en la protoboard', () => {
  const project = createProject({ system: 'electronica' });
  const pb = addComponent(project, 'protoboard');
  const g = addComponent(project, 'fuente-5');
  const btn = addComponent(project, 'boton-tactil');
  const led = addComponent(project, 'led');
  wire(project, g, '+5V', pb, '+s1');
  wire(project, g, 'GND', pb, '-s1');
  wire(project, pb, '+s2', btn, '1');
  // La pata 2 está unida a la 1 por dentro; la 4 a la 3. El LED va del lado 3-4.
  wire(project, btn, '4', pb, 'a8');
  wire(project, led, 'A', pb, 'e8');
  wire(project, led, 'K', pb, '-s10');
  assert.deepEqual(codes(reviewWiring(project)), []);
  assert.equal(interaction(btn), 'hold');
  const sim = createSim(project);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false);
  press(sim, btn.id, true);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], true);
  assert.equal(view(sim).parts.get(led.id).active, true);
  press(sim, btn.id, false);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false);
});

test('simulación: el interruptor se queda encendido y enciende el zumbador', () => {
  const project = createProject();
  const g = addComponent(project, 'fuente-5');
  const sw = addComponent(project, 'interruptor');
  const buzzer = addComponent(project, 'zumbador');
  wire(project, g, '+5V', sw, '1');
  wire(project, sw, '2', buzzer, '+');
  wire(project, buzzer, '-', g, 'GND');
  assert.equal(interaction(sw), 'toggle');
  const sim = createSim(project);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(buzzer.id).energized[0], false);
  toggle(sim, sw.id);
  advance(sim, 0.5);
  assert.equal(sim.parts.get(buzzer.id).energized[0], true);
  assert.ok(sim.events.some((e) => e.text.includes('se enciende')));
  toggle(sim, sw.id);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(buzzer.id).energized[0], false);
});

// Arduino → R 1 kΩ → base; motor de +5 V al colector; emisor a GND.
function motorProject({ resistor = true } = {}) {
  const project = createProject({ system: 'arduino' });
  const uno = addComponent(project, 'arduino-uno');
  const q = addComponent(project, 'transistor-npn');
  const motor = addComponent(project, 'motor-dc');
  const btn = addComponent(project, 'pulsador-na');
  if (resistor) {
    const r = addComponent(project, 'resistencia');
    wire(project, uno, 'D9', r, '1');
    wire(project, r, '2', q, 'B');
  } else {
    wire(project, uno, 'D9', q, 'B');
  }
  wire(project, uno, '5V', motor, '+');
  wire(project, motor, '-', q, 'C');
  wire(project, q, 'E', uno, 'GND');
  wire(project, uno, 'D2', btn, '13');
  wire(project, btn, '14', uno, 'GND');
  uno.config.rules = [{ input: 'D2', cond: 'activa', output: 'D9', action: 'seguir' }];
  return { project, uno, q, motor, btn };
}

test('transistor: el pin mueve el motor a través del transistor y la resistencia de base', () => {
  const { project, uno, q, motor, btn } = motorProject();
  const rows = pinRows(project, uno);
  assert.equal(rows.find((r) => r.id === 'D9').mode, 'output');
  assert.equal(rows.find((r) => r.id === 'D2').mode, 'input_pullup');
  const errors = [...reviewWiring(project), ...reviewArduino(project)].filter((f) => f.level === 'error');
  assert.deepEqual(codes(errors), []);
  const sim = createSim(project);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(q.id).on, false);
  assert.equal(sim.parts.get(motor.id).energized[0], false);
  press(sim, btn.id, true);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(q.id).on, true);
  assert.equal(sim.parts.get(motor.id).energized[0], true);
  press(sim, btn.id, false);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(motor.id).energized[0], false);
});

test('regla: la base del transistor sin resistencia es un error y sugiere 1 kΩ', () => {
  const { project, btn } = motorProject({ resistor: false });
  const finding = reviewWiring(project).find((f) => f.code === 'base-sin-resistencia');
  assert.ok(finding);
  assert.equal(finding.suggest[0].ohms, 1000);
  const sim = createSim(project);
  press(sim, btn.id, true);
  advance(sim, 0.1);
  assert.ok(sim.events.some((e) => e.text.includes('sin resistencia')));
  assert.ok(!codes(reviewWiring(motorProject().project)).includes('base-sin-resistencia'));
});

test('regla: un motor conectado directo a un pin es un error y sugiere un transistor', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const motor = addComponent(project, 'motor-dc');
  wire(project, uno, 'D6', motor, '+');
  wire(project, motor, '-', uno, 'GND');
  const finding = reviewWiring(project).find((f) => f.code === 'motor-en-pin');
  assert.ok(finding);
  assert.equal(finding.suggest[0].type, 'transistor-npn');
  assert.ok(!codes(reviewWiring(motorProject().project)).includes('motor-en-pin'));
});

test('sensores de luz y temperatura se leen como entradas analógicas y deciden la salida', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const ldr = addComponent(project, 'sensor-luz');
  const lm35 = addComponent(project, 'sensor-temperatura');
  const led = addComponent(project, 'led');
  const buzzer = addComponent(project, 'zumbador');
  for (const [sensor, vcc, pin] of [[ldr, 'VCC', 'A0'], [lm35, '+Vs', 'A1']]) {
    wire(project, uno, '5V', sensor, vcc);
    wire(project, sensor, 'GND', uno, 'GND');
    wire(project, sensor, 'OUT', uno, pin);
  }
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  wire(project, uno, 'D8', buzzer, '+');
  wire(project, buzzer, '-', uno, 'GND');
  const rows = pinRows(project, uno);
  assert.equal(rows.find((r) => r.id === 'A0').mode, 'analog');
  assert.equal(rows.find((r) => r.id === 'A1').mode, 'analog');
  assert.equal(rows.find((r) => r.id === 'D8').mode, 'output');
  // Poca luz enciende el LED; más de 30 °C (lectura > 61) hace sonar el zumbador.
  uno.config.rules = [
    { input: 'A0', cond: 'menor', value: 300, output: 'D13', action: 'seguir' },
    { input: 'A1', cond: 'mayor', value: 61, output: 'D8', action: 'seguir' },
  ];
  assert.equal(interaction(ldr), 'slider');
  assert.equal(interaction(lm35), 'slider');
  const sim = createSim(project);
  assert.equal(sim.parts.get(lm35.id).value, 51, 'el LM35 empieza cerca de 25 °C');
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false);
  assert.equal(sim.parts.get(buzzer.id).energized[0], false);
  setValue(sim, ldr.id, 120);
  setValue(sim, lm35.id, 70);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], true);
  assert.equal(sim.parts.get(buzzer.id).energized[0], true);
});

test('un proyecto con protoboard se guarda y se vuelve a abrir igual', () => {
  const project = createProject();
  const pb = addComponent(project, 'protoboard');
  const g = addComponent(project, 'fuente-5');
  wire(project, g, '+5V', pb, '+s1');
  pb.rot = 90;
  const copy = parseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(copy.links.length, 1);
  assert.equal(copy.components[0].rot, 90);
  assert.ok(sameNet(copy, copy.components[1], '+5V', copy.components[0], '+s12'));
});

test('el sistema Electrónica muestra la protoboard y los componentes básicos, sin neumática', () => {
  const types = filterCatalog({ system: 'electronica' }).map((d) => d.type);
  for (const type of ['protoboard', 'fuente-5', 'boton-tactil', 'interruptor', 'zumbador', 'transistor-npn', 'motor-dc', 'led', 'resistencia', 'pulsador-na']) {
    assert.ok(types.includes(type), type);
  }
  assert.ok(!types.some((type) => definition(type).ports.some((p) => p.kind === 'air')));
  assert.equal(filterCatalog({ query: 'protoboard' })[0].type, 'protoboard');
  assert.deepEqual(filterCatalog({ category: 'prototipado' }).map((d) => d.type), ['protoboard']);
  assert.ok(CATALOG.every((def) => def.systems.length > 0));
});
