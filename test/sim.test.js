import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addComponent, connect } from '../src/editor/project.js';
import { buildTemplate } from '../src/editor/rango.js';
import { createSim, advance, press, toggle, setValue, view, interaction } from '../src/editor/sim.js';

const byLabel = (project, label) => project.components.find((c) => c.label === label);
const pos = (sim, project, label) => Math.round(sim.parts.get(byLabel(project, label).id).pos);
const part = (sim, project, label) => sim.parts.get(byLabel(project, label).id);
const wire = (project, a, ap, b, bp) => assert.ok(connect(project, { c: a.id, p: ap }, { c: b.id, p: bp }).ok);

test('simple efecto: sale mientras se presiona el botón y regresa por resorte', () => {
  const project = buildTemplate('cilindro-se-boton');
  const sim = createSim(project);
  advance(sim, 0.5);
  assert.equal(pos(sim, project, '1A'), 0);
  press(sim, byLabel(project, '1S').id, true);
  advance(sim, 2.5);
  assert.equal(pos(sim, project, '1A'), 100);
  press(sim, byLabel(project, '1S').id, false);
  advance(sim, 2.5);
  assert.equal(pos(sim, project, '1A'), 0);
});

test('doble efecto con palanca: alterna salir y regresar', () => {
  const project = buildTemplate('cilindro-de-palanca');
  const sim = createSim(project);
  const lever = byLabel(project, '1V').id;
  assert.equal(interaction(byLabel(project, '1V')), 'toggle');
  toggle(sim, lever);
  advance(sim, 2.5);
  assert.equal(pos(sim, project, '1A'), 100);
  toggle(sim, lever);
  advance(sim, 2.5);
  assert.equal(pos(sim, project, '1A'), 0);
});

test('mando directo: la bobina solo se energiza mientras se presiona S1', () => {
  const project = buildTemplate('electro-directo');
  const sim = createSim(project);
  press(sim, byLabel(project, 'S1').id, true);
  advance(sim, 0.1);
  assert.equal(part(sim, project, '1V').on, true);
  assert.equal(view(sim).links.get('w4'), 'v24');
  advance(sim, 2.5);
  assert.equal(pos(sim, project, '1A'), 100);
  press(sim, byLabel(project, 'S1').id, false);
  advance(sim, 2.5);
  assert.equal(part(sim, project, '1V').on, false);
  assert.equal(pos(sim, project, '1A'), 0);
});

test('enclavamiento: marcha se mantiene al soltar y paro lo desactiva', () => {
  const project = buildTemplate('enclavamiento-rele');
  const sim = createSim(project);
  const marcha = byLabel(project, 'S1').id;
  const paro = byLabel(project, 'S2').id;
  press(sim, marcha, true);
  advance(sim, 0.2);
  press(sim, marcha, false);
  advance(sim, 2.5);
  assert.equal(part(sim, project, 'K1').on, true, 'K1 se mantiene por su contacto 13-14');
  assert.equal(pos(sim, project, '1A'), 100);
  press(sim, paro, true);
  advance(sim, 0.2);
  press(sim, paro, false);
  advance(sim, 2.5);
  assert.equal(part(sim, project, 'K1').on, false);
  assert.equal(pos(sim, project, '1A'), 0);
});

test('Arduino y cilindro: S1 lo saca y el final de carrera lo regresa solo', () => {
  const project = buildTemplate('arduino-cilindro');
  const sim = createSim(project);
  press(sim, byLabel(project, 'S1').id, true);
  advance(sim, 0.2);
  press(sim, byLabel(project, 'S1').id, false);
  assert.equal(part(sim, project, 'K1').on, true);
  let peak = 0;
  for (let i = 0; i < 60; i += 1) {
    advance(sim, 0.1);
    peak = Math.max(peak, pos(sim, project, '1A'));
  }
  assert.ok(peak >= 97, `debió llegar al final, llegó a ${peak}`);
  assert.equal(part(sim, project, 'K1').on, false, 'S2 apagó la salida');
  assert.equal(pos(sim, project, '1A'), 0);
  assert.ok(sim.events.some((e) => e.text.includes('S2 detecta') || e.kind === 'S2'));
});

test('Arduino: el LED sigue al botón', () => {
  const project = buildTemplate('arduino-led-boton');
  const sim = createSim(project);
  advance(sim, 0.1);
  assert.equal(part(sim, project, 'H1').energized[0], false);
  press(sim, byLabel(project, 'S1').id, true);
  advance(sim, 0.1);
  assert.equal(part(sim, project, 'H1').energized[0], true);
  press(sim, byLabel(project, 'S1').id, false);
  advance(sim, 0.1);
  assert.equal(part(sim, project, 'H1').energized[0], false);
});

test('Arduino: el potenciómetro decide la salida con el umbral', () => {
  const project = buildTemplate('arduino-potenciometro');
  const sim = createSim(project);
  const pot = project.components.find((c) => c.type === 'potenciometro');
  setValue(sim, pot.id, 800);
  advance(sim, 0.1);
  assert.equal(part(sim, project, 'H1').energized[0], true);
  setValue(sim, pot.id, 200);
  advance(sim, 0.1);
  assert.equal(part(sim, project, 'H1').energized[0], false);
});

test('una bobina de 24 V conectada directo al Arduino no se mueve y lo avisa', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const valve = addComponent(project, 'valvula-52-mono');
  wire(project, uno, 'D8', valve, 'Y+');
  wire(project, valve, 'Y-', uno, 'GND');
  uno.config.pins.D8 = { mode: 'output' };
  uno.config.rules.push({ input: 'D8', cond: 'activa', output: 'D8', action: 'seguir' });
  uno.config.pins.D2 = { mode: 'input_pullup' };
  uno.config.rules = [{ input: 'D2', cond: 'inactiva', output: 'D8', action: 'seguir' }];
  const sim = createSim(project);
  advance(sim, 0.2);
  assert.equal(sim.parts.get(valve.id).on, false);
  assert.ok(sim.events.some((e) => e.text.includes('solo recibe 5 V')));
});

test('un LED sin resistencia se quema en la simulación', () => {
  const project = createProject();
  const g1 = addComponent(project, 'fuente-24');
  const led = addComponent(project, 'led-solo');
  wire(project, g1, '+24', led, 'A');
  wire(project, led, 'K', g1, '0V');
  const sim = createSim(project);
  advance(sim, 0.05);
  assert.equal(sim.parts.get(led.id).burned, true);
  assert.equal(sim.parts.get(led.id).energized[0], false);
});

test('sin tierra común, una carga de 24 V no se energiza con la tierra del Arduino', () => {
  const project = createProject();
  const g1 = addComponent(project, 'fuente-24');
  const uno = addComponent(project, 'arduino-uno');
  const lamp = addComponent(project, 'lampara');
  wire(project, g1, '+24', lamp, 'X1');
  wire(project, lamp, 'X2', uno, 'GND');
  const sim = createSim(project);
  advance(sim, 0.05);
  assert.equal(sim.parts.get(lamp.id).energized[0], false);
  wire(project, uno, 'GND', g1, '0V');
  const joined = createSim(project);
  advance(joined, 0.05);
  assert.equal(joined.parts.get(lamp.id).energized[0], true);
});

test('una reguladora de caudal hace más lento el cilindro', () => {
  const fast = buildTemplate('cilindro-de-palanca');
  const slow = buildTemplate('cilindro-de-palanca');
  const valve = slow.components.find((c) => c.type === 'valvula-52-palanca');
  const cyl = slow.components.find((c) => c.type === 'cilindro-de');
  const reg = addComponent(slow, 'reguladora');
  slow.links = slow.links.filter((l) => !(l.a.c === valve.id && l.a.p === '4'));
  wire(slow, valve, '4', reg, 'in');
  wire(slow, reg, 'out', cyl, 'trasera');
  const run = (project) => {
    const sim = createSim(project);
    toggle(sim, project.components.find((c) => c.type === 'valvula-52-palanca').id);
    advance(sim, 1);
    return sim.parts.get(project.components.find((c) => c.type === 'cilindro-de').id).pos;
  };
  assert.ok(run(slow) < run(fast) / 2);
});

test('el cortocircuito se avisa en los eventos', () => {
  const project = createProject();
  const g1 = addComponent(project, 'fuente-24');
  const s1 = addComponent(project, 'pulsador-na');
  wire(project, g1, '+24', s1, '13');
  wire(project, s1, '14', g1, '0V');
  const sim = createSim(project);
  press(sim, s1.id, true);
  advance(sim, 0.05);
  assert.ok(sim.events.some((e) => e.text.startsWith('Cortocircuito')));
});
