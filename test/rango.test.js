import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStandard, ledResistor, formatOhms, ledCurrent } from '../src/editor/calc.js';
import { createProject, addComponent, connect, reviewWiring } from '../src/editor/project.js';
import { pinRows, reviewArduino, generateSketch } from '../src/editor/arduino.js';
import { TEMPLATES, buildTemplate, matchProblem, analyzeProject, templateSteps, missingFor } from '../src/editor/rango.js';

const codes = (findings) => findings.map((f) => f.code);
const review = (project) => [...reviewWiring(project), ...reviewArduino(project)];
const wire = (project, a, ap, b, bp) => {
  const result = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
  assert.ok(result.ok, result.error);
};

test('los valores comerciales suben al E12 siguiente', () => {
  assert.equal(nextStandard(200), 220);
  assert.equal(nextStandard(220), 220);
  assert.equal(nextStandard(1467), 1500);
  assert.equal(nextStandard(9000), 10000);
  assert.equal(formatOhms(220), '220 Ω');
  assert.equal(formatOhms(4700), '4.7 kΩ');
  assert.equal(formatOhms(10000), '10 kΩ');
});

test('la resistencia de un LED sale de la ley de Ohm', () => {
  const five = ledResistor(5);
  assert.equal(five.value, 220);
  assert.equal(Math.round(five.exact), 200);
  assert.equal(five.rating, '1/4 W');
  const twentyFour = ledResistor(24);
  assert.equal(twentyFour.value, 1500);
  assert.equal(twentyFour.rating, '1 W');
  assert.equal(Math.round(ledCurrent(5, 220)), 14);
});

test('regla: un LED sin resistencia en un pin es un error y sugiere 220 Ω', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const led = addComponent(project, 'led-solo');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  const finding = reviewWiring(project).find((f) => f.code === 'led-sin-resistencia');
  assert.ok(finding);
  assert.deepEqual(finding.suggest.map((s) => [s.type, s.ohms]), [['resistencia', 220]]);
});

test('regla: un LED sin resistencia en 24 V sugiere 1.5 kΩ de 1 W', () => {
  const project = createProject();
  const g1 = addComponent(project, 'fuente-24');
  const led = addComponent(project, 'led-solo');
  wire(project, g1, '+24', led, 'A');
  const finding = reviewWiring(project).find((f) => f.code === 'led-sin-resistencia');
  assert.equal(finding.suggest[0].ohms, 1500);
  assert.match(finding.suggest[0].text, /1 W/);
});

test('con la resistencia correcta el LED no marca error y el pin queda como salida', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const r = addComponent(project, 'resistencia');
  r.config.ohms = 220;
  const led = addComponent(project, 'led-solo');
  wire(project, uno, 'D13', r, '1');
  wire(project, r, '2', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  assert.deepEqual(codes(review(project)), []);
  assert.equal(pinRows(project, uno).find((row) => row.id === 'D13').mode, 'output');
});

test('regla: una resistencia muy baja deja pasar demasiada corriente', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const r = addComponent(project, 'resistencia');
  r.config.ohms = 47;
  const led = addComponent(project, 'led-solo');
  wire(project, uno, 'D13', r, '1');
  wire(project, r, '2', led, 'A');
  const finding = reviewWiring(project).find((f) => f.code === 'resistencia-baja');
  assert.ok(finding);
  assert.equal(finding.suggest[0].ohms, 220);
});

test('regla: una resistencia muy alta deja el LED casi apagado', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const r = addComponent(project, 'resistencia');
  r.config.ohms = 100000;
  const led = addComponent(project, 'led-solo');
  wire(project, uno, 'D13', r, '1');
  wire(project, r, '2', led, 'A');
  assert.ok(codes(reviewWiring(project)).includes('led-tenue'));
});

test('una resistencia pull-down resuelve el aviso del contacto a 5V', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const s1 = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', s1, '13');
  wire(project, s1, '14', uno, '5V');
  const before = reviewArduino(project).find((f) => f.code === 'pull-down');
  assert.deepEqual(before.suggest.map((s) => [s.type, s.ohms]), [['resistencia', 10000]]);
  const r = addComponent(project, 'resistencia');
  r.config.ohms = 10000;
  wire(project, uno, 'D2', r, '1');
  wire(project, r, '2', uno, 'GND');
  assert.deepEqual(codes(reviewArduino(project)), []);
  const row = pinRows(project, uno).find((item) => item.id === 'D2');
  assert.equal(row.mode, 'input');
  assert.equal(row.active, 'HIGH');
  assert.match(generateSketch(project, uno.id), /pinMode\(PIN_S1, INPUT\);/);
});

test('regla: una pull-down demasiado baja se avisa', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const s1 = addComponent(project, 'pulsador-na');
  const r = addComponent(project, 'resistencia');
  r.config.ohms = 100;
  wire(project, uno, 'D2', s1, '13');
  wire(project, s1, '14', uno, '5V');
  wire(project, uno, 'D2', r, '1');
  wire(project, r, '2', uno, 'GND');
  assert.ok(codes(reviewArduino(project)).includes('pull-baja'));
});

test('regla: una resistencia sola en un pin avisa que falta la señal', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const r = addComponent(project, 'resistencia');
  wire(project, uno, 'D4', r, '1');
  wire(project, r, '2', uno, 'GND');
  assert.ok(codes(reviewArduino(project)).includes('entrada-sin-senal'));
});

test('los errores de 24 V en el Arduino sugieren el componente según la dirección', () => {
  const load = createProject();
  const uno = addComponent(load, 'arduino-uno');
  const valve = addComponent(load, 'valvula-52-mono');
  wire(load, uno, 'D8', valve, 'Y+');
  assert.equal(reviewWiring(load).find((f) => f.code === 'mezcla-24v-5v').suggest[0].type, 'modulo-rele');

  const sensor = createProject();
  const uno2 = addComponent(sensor, 'arduino-uno');
  const b1 = addComponent(sensor, 'sensor-inductivo');
  wire(sensor, uno2, 'D4', b1, 'out');
  assert.equal(reviewWiring(sensor).find((f) => f.code === 'mezcla-24v-5v').suggest[0].type, 'optoacoplador');
});

for (const template of TEMPLATES) {
  test(`el ejemplo "${template.title}" se arma sin errores`, () => {
    const project = buildTemplate(template.id);
    const errors = review(project).filter((f) => f.level === 'error');
    assert.deepEqual(errors.map((f) => f.text), []);
    assert.ok(analyzeProject(project).goals.length > 0, 'Rango debe entender qué hace el ejemplo');
    assert.ok(templateSteps(project).length >= project.links.length);
  });
}

test('Rango reconoce problemas típicos de tarea', () => {
  const cases = [
    ['Al presionar un botón, un cilindro de simple efecto debe salir y regresar por resorte al soltarlo.', 'cilindro-se-boton'],
    ['Diseña un circuito con un botón de marcha y uno de paro: el cilindro debe salir y mantenerse aunque se suelte el botón. Usa un relé.', 'enclavamiento-rele'],
    ['Con Arduino, al pulsar S1 el cilindro debe salir y regresar solo cuando llegue al final de carrera.', 'arduino-cilindro'],
    ['Haz que un LED se encienda al presionar un botón usando Arduino.', 'arduino-led-boton'],
    ['Lee un potenciómetro y enciende un LED cuando pase de la mitad.', 'arduino-potenciometro'],
    ['Mando un cilindro de doble efecto con una válvula de palanca manual.', 'cilindro-de-palanca'],
  ];
  for (const [text, expected] of cases) {
    const result = matchProblem(text);
    assert.equal(result.best?.template.id, expected, text);
    assert.ok(result.best.reasons.length > 0);
  }
});

test('si no reconoce el problema, lo dice y hace preguntas', () => {
  const result = matchProblem('Necesito controlar la temperatura de un horno industrial.');
  assert.equal(result.recognized, false);
  assert.equal(result.best, null);
  assert.ok(result.questions.length >= 3);
  assert.equal(matchProblem('   '), null);
});

test('Rango detecta lo que falta en un proyecto a medias', () => {
  const project = createProject();
  const cylinder = addComponent(project, 'cilindro-de');
  const valve = addComponent(project, 'valvula-52-mono');
  wire(project, valve, '4', cylinder, 'trasera');
  wire(project, valve, '2', cylinder, 'delantera');
  const { goals, next } = analyzeProject(project);
  assert.ok(goals.some((g) => g.includes('Mover 1A')));
  assert.ok(next.some((n) => n.includes('puerto 1 de 1V')));
  assert.ok(next.some((n) => n.includes('bobina Y de 1V')));
});

test('Rango entiende la memoria y el retorno automático del Arduino', () => {
  const { goals } = analyzeProject(buildTemplate('arduino-cilindro'));
  assert.ok(goals.some((g) => g.startsWith('Memoria: S1 enciende K1 y S2 la apaga')));
  assert.ok(goals.some((g) => g.startsWith('Retorno automático')));
  assert.ok(goals.some((g) => g.includes('pin D8')));
});

test('Rango reconoce el enclavamiento con relé', () => {
  const { goals } = analyzeProject(buildTemplate('enclavamiento-rele'));
  assert.ok(goals.some((g) => g.startsWith('Enclavamiento con K1')));
});

test('compara el proyecto con el ejemplo y lista lo que falta', () => {
  const example = buildTemplate('arduino-led-boton');
  const project = createProject();
  addComponent(project, 'arduino-uno');
  const missing = missingFor(project, example);
  assert.deepEqual(missing.map((m) => m.type).sort(), ['led-solo', 'pulsador-na', 'resistencia']);
  assert.equal(missing.find((m) => m.type === 'resistencia').config.ohms, 220);
});
