import test from 'node:test';
import assert from 'node:assert/strict';
import { definition } from '../src/editor/catalog.js';
import { createProject, addComponent, connect, reviewWiring } from '../src/editor/project.js';
import { pinRows, reviewArduino, generateSketch } from '../src/editor/arduino.js';
import { createSim, advance, press, setValue, interaction } from '../src/editor/sim.js';

// Componentes típicos de un kit de inicio de Arduino que la simulación sí puede modelar.
const codes = (findings) => findings.map((f) => f.code);
const wire = (project, a, ap, b, bp) => {
  const result = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
  assert.ok(result.ok, result.error);
};
const row = (project, board, pin) => pinRows(project, board).find((r) => r.id === pin);
const errors = (project) => [...reviewWiring(project), ...reviewArduino(project)].filter((f) => f.level === 'error');

// Pin → resistencia de 220 Ω → ánodo.
function viaResistor(project, uno, pin, part, anode) {
  const r = addComponent(project, 'resistencia');
  r.config.ohms = 220;
  wire(project, uno, pin, r, '1');
  wire(project, r, '2', part, anode);
}

// LED en D13 que sigue a la entrada `pin`.
function withLed(project, uno, input) {
  const led = addComponent(project, 'led');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  uno.config.rules = [{ input, cond: 'activa', output: 'D13', action: 'seguir' }];
  return led;
}

function powered(project, uno, module) {
  wire(project, uno, '5V', module, 'VCC');
  wire(project, module, 'GND', uno, 'GND');
}

test('LED RGB: cada color en su pin con resistencia, y la mezcla enciende dos colores', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const rgb = addComponent(project, 'led-rgb');
  viaResistor(project, uno, 'D9', rgb, 'R');
  viaResistor(project, uno, 'D10', rgb, 'G');
  viaResistor(project, uno, 'D11', rgb, 'B');
  wire(project, rgb, 'K', uno, 'GND');
  const btn = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', btn, '13');
  wire(project, btn, '14', uno, 'GND');
  assert.deepEqual(codes(errors(project)), []);
  for (const pin of ['D9', 'D10', 'D11']) assert.equal(row(project, uno, pin).mode, 'output');
  uno.config.rules = [
    { input: 'D2', cond: 'activa', output: 'D9', action: 'seguir' },
    { input: 'D2', cond: 'activa', output: 'D10', action: 'seguir' },
  ];
  const sim = createSim(project);
  press(sim, btn.id, true);
  advance(sim, 0.1);
  assert.deepEqual(sim.parts.get(rgb.id).energized, [true, true, false], 'rojo + verde = amarillo');
});

test('regla: LED RGB sin resistencias da un solo error que nombra los tres colores', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const rgb = addComponent(project, 'led-rgb');
  wire(project, uno, 'D9', rgb, 'R');
  wire(project, uno, 'D10', rgb, 'G');
  wire(project, uno, 'D11', rgb, 'B');
  wire(project, rgb, 'K', uno, 'GND');
  const found = reviewWiring(project).filter((f) => f.code === 'led-sin-resistencia');
  assert.equal(found.length, 1);
  assert.match(found[0].text, /R, G, B/);
  assert.match(found[0].suggest[0].text, /cada color/);
});

test('display de 7 segmentos: cada segmento se enciende con su pin; sin resistencias es un error', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const seg = addComponent(project, 'display-7seg');
  const pins = { a: 'D2', b: 'D3', c: 'D4', d: 'D5', e: 'D6', f: 'D7', g: 'D8' };
  for (const [s, pin] of Object.entries(pins)) viaResistor(project, uno, pin, seg, s);
  wire(project, seg, 'K', uno, 'GND');
  assert.deepEqual(codes(errors(project).filter((f) => f.code !== 'pin-serial')), []);
  const pot = addComponent(project, 'potenciometro');
  wire(project, uno, '5V', pot, '5V');
  wire(project, pot, 'GND', uno, 'GND');
  wire(project, pot, 'W', uno, 'A0');
  // El número 1 usa los segmentos b y c.
  uno.config.rules = [
    { input: 'A0', cond: 'mayor', value: 500, output: 'D3', action: 'seguir' },
    { input: 'A0', cond: 'mayor', value: 500, output: 'D4', action: 'seguir' },
  ];
  const sim = createSim(project);
  setValue(sim, pot.id, 900);
  advance(sim, 0.1);
  assert.deepEqual(sim.parts.get(seg.id).energized, [false, true, true, false, false, false, false, false]);

  const bare = createProject();
  const uno2 = addComponent(bare, 'arduino-uno');
  const seg2 = addComponent(bare, 'display-7seg');
  wire(bare, uno2, 'D3', seg2, 'b');
  wire(bare, uno2, 'D4', seg2, 'c');
  wire(bare, seg2, 'K', uno2, 'GND');
  const found = reviewWiring(bare).filter((f) => f.code === 'led-sin-resistencia');
  assert.equal(found.length, 1);
  assert.match(found[0].suggest[0].text, /cada segmento/);
});

test('sensor PIR: la señal es una entrada activa en HIGH y enciende el LED al detectar', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const pir = addComponent(project, 'sensor-pir');
  powered(project, uno, pir);
  wire(project, pir, 'OUT', uno, 'D2');
  const led = withLed(project, uno, 'D2');
  assert.equal(row(project, uno, 'D2').mode, 'input');
  assert.equal(row(project, uno, 'D2').active, 'HIGH');
  assert.equal(interaction(pir), 'hold');
  const sim = createSim(project);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false);
  press(sim, pir.id, true);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], true);
  assert.ok(sim.events.some((e) => e.text === 'detecta movimiento.'));
});

test('sensores activos en LOW (obstáculo, llama, Hall): la tabla de pines y el código usan LOW', () => {
  for (const type of ['sensor-obstaculo', 'sensor-llama', 'sensor-hall']) {
    const project = createProject();
    const uno = addComponent(project, 'arduino-uno');
    const sensor = addComponent(project, type);
    powered(project, uno, sensor);
    wire(project, sensor, 'OUT', uno, 'D4');
    const led = withLed(project, uno, 'D4');
    assert.equal(row(project, uno, 'D4').active, 'LOW', type);
    assert.match(generateSketch(project, uno.id), /digitalRead\(\w+\) == LOW/, type);
    const sim = createSim(project);
    advance(sim, 0.1);
    assert.equal(sim.parts.get(led.id).energized[0], false, type);
    press(sim, sensor.id, true);
    advance(sim, 0.1);
    assert.equal(sim.parts.get(led.id).energized[0], true, type);
  }
});

test('un módulo sin VCC ni GND no entrega señal y lo avisa', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const sound = addComponent(project, 'sensor-sonido');
  wire(project, sound, 'OUT', uno, 'D2');
  const led = withLed(project, uno, 'D2');
  const sim = createSim(project);
  press(sim, sound.id, true);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false);
  assert.ok(sim.events.some((e) => e.text.includes('no entrega señal')));
});

test('sensor de inclinación: se conecta como un botón a GND con pull-up interno', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const tilt = addComponent(project, 'sensor-inclinacion');
  wire(project, uno, 'D7', tilt, '1');
  wire(project, tilt, '2', uno, 'GND');
  const led = withLed(project, uno, 'D7');
  assert.equal(row(project, uno, 'D7').mode, 'input_pullup');
  const sim = createSim(project);
  press(sim, tilt.id, true);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], true);
  assert.ok(sim.events.some((e) => e.text.includes('se inclina')));
});

test('joystick: dos ejes analógicos independientes y botón SW con pull-up', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const joy = addComponent(project, 'joystick');
  powered(project, uno, joy);
  wire(project, joy, 'VRx', uno, 'A0');
  wire(project, joy, 'VRy', uno, 'A1');
  wire(project, joy, 'SW', uno, 'D2');
  const led = addComponent(project, 'led');
  const buzzer = addComponent(project, 'zumbador');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  wire(project, uno, 'D8', buzzer, '+');
  wire(project, buzzer, '-', uno, 'GND');
  assert.equal(row(project, uno, 'A0').mode, 'analog');
  assert.equal(row(project, uno, 'A1').mode, 'analog');
  assert.equal(row(project, uno, 'D2').mode, 'input_pullup');
  assert.deepEqual(codes(errors(project)), []);
  uno.config.rules = [
    { input: 'A0', cond: 'mayor', value: 800, output: 'D13', action: 'seguir' },
    { input: 'D2', cond: 'activa', output: 'D8', action: 'seguir' },
  ];
  const sim = createSim(project);
  assert.deepEqual(sim.parts.get(joy.id).values, { VRx: 512, VRy: 512 });
  setValue(sim, joy.id, 1000, 'VRy');
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false, 'mover Y no cambia la lectura de X');
  setValue(sim, joy.id, 1000, 'VRx');
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], true);
  press(sim, joy.id, true);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(buzzer.id).energized[0], true);
});

test('sensores analógicos del kit (agua, humedad de suelo, termistor) se leen con analogRead', () => {
  for (const type of ['sensor-agua', 'sensor-humedad-suelo', 'sensor-termistor']) {
    const project = createProject();
    const uno = addComponent(project, 'arduino-uno');
    const sensor = addComponent(project, type);
    powered(project, uno, sensor);
    wire(project, sensor, 'OUT', uno, 'A2');
    const led = withLed(project, uno, 'A2');
    uno.config.rules = [{ input: 'A2', cond: 'mayor', value: 600, output: 'D13', action: 'seguir' }];
    assert.equal(row(project, uno, 'A2').mode, 'analog', type);
    assert.match(generateSketch(project, uno.id), /analogRead/, type);
    assert.equal(interaction(sensor), 'slider', type);
    const sim = createSim(project);
    setValue(sim, sensor.id, 700);
    advance(sim, 0.1);
    assert.equal(sim.parts.get(led.id).energized[0], true, type);
  }
});

test('todos los sensores de módulo tienen VCC, señal y GND, y una etiqueta para la simulación', () => {
  for (const type of ['sensor-pir', 'sensor-obstaculo', 'sensor-sonido', 'sensor-llama', 'sensor-hall']) {
    const def = definition(type);
    assert.deepEqual(def.ports.map((p) => p.id), ['VCC', 'OUT', 'GND']);
    assert.ok(def.module.label, type);
  }
});
