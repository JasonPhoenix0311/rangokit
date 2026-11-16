import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addComponent, connect, reviewWiring } from '../src/editor/project.js';
import { pinRows, reviewArduino, generateSketch, ruleProblem, lcdLine, lcdParts, lcdClean } from '../src/editor/arduino.js';
import { createSim, advance, press, setValue, interaction } from '../src/editor/sim.js';

// Módulos de kit que usan librería o protocolo propio: servo, ultrasónico y pantalla LCD I2C.
const codes = (findings) => findings.map((f) => f.code);
const wire = (project, a, ap, b, bp) => {
  const result = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
  assert.ok(result.ok, result.error);
};
const row = (project, board, pin) => pinRows(project, board).find((r) => r.id === pin);
const all = (project) => [...reviewWiring(project), ...reviewArduino(project)];
const errors = (project) => all(project).filter((f) => f.level === 'error');

function powered(project, uno, module) {
  wire(project, uno, '5V', module, 'VCC');
  wire(project, module, 'GND', uno, 'GND');
}

function servoProject() {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const servo = addComponent(project, 'servo');
  powered(project, uno, servo);
  wire(project, uno, 'D9', servo, 'SIG');
  return { project, uno, servo };
}

function sonarProject() {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const sonar = addComponent(project, 'ultrasonico');
  powered(project, uno, sonar);
  wire(project, uno, 'D7', sonar, 'Trig');
  wire(project, sonar, 'Echo', uno, 'D8');
  return { project, uno, sonar };
}

function lcdProject() {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const lcd = addComponent(project, 'lcd-i2c');
  powered(project, uno, lcd);
  wire(project, uno, 'A4', lcd, 'SDA');
  wire(project, uno, 'A5', lcd, 'SCL');
  return { project, uno, lcd };
}

test('servo: su pin queda en modo servo y el código usa la librería Servo', () => {
  const { project, uno, servo } = servoProject();
  assert.deepEqual(servo.config.angles, { off: 0, on: 90 });
  assert.equal(row(project, uno, 'D9').mode, 'servo');
  assert.deepEqual(codes(all(project)), []);
  const code = generateSketch(project, uno.id);
  assert.match(code, /#include <Servo\.h>/);
  assert.match(code, /Servo servo_m1;/);
  assert.match(code, /servo_m1\.attach\(PIN_M1\);/);
  assert.match(code, /servo_m1\.write\(m1\);/);
});

test('servo: un botón lo lleva al ángulo activo a la velocidad de un SG90 y lo regresa al soltarlo', () => {
  const { project, uno, servo } = servoProject();
  servo.config.angles = { off: 0, on: 180 };
  const btn = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', btn, '13');
  wire(project, btn, '14', uno, 'GND');
  uno.config.rules = [{ input: 'D2', cond: 'activa', output: 'D9', action: 'seguir' }];
  assert.equal(ruleProblem(pinRows(project, uno), uno.config.rules[0]), null);
  assert.match(generateSketch(project, uno.id), /m1 = \(s1\) \? 180 : 0;/);

  const sim = createSim(project);
  press(sim, btn.id, true);
  advance(sim, 0.1);
  const midway = sim.parts.get(servo.id).angle;
  assert.ok(midway > 0 && midway < 180, `a medio camino: ${midway}`);
  advance(sim, 0.3);
  assert.equal(sim.parts.get(servo.id).angle, 180);
  assert.ok(sim.events.some((e) => e.text === 'llega a 180°.'));
  press(sim, btn.id, false);
  advance(sim, 0.4);
  assert.equal(sim.parts.get(servo.id).angle, 0);
});

test('servo: "mover según la lectura" reparte el potenciómetro con map() entre los dos ángulos', () => {
  const { project, uno, servo } = servoProject();
  servo.config.angles = { off: 0, on: 180 };
  const pot = addComponent(project, 'potenciometro');
  wire(project, uno, '5V', pot, '5V');
  wire(project, pot, 'GND', uno, 'GND');
  wire(project, pot, 'W', uno, 'A0');
  uno.config.rules = [{ input: 'A0', cond: 'mayor', value: 512, output: 'D9', action: 'angulo' }];
  assert.deepEqual(codes(all(project)), []);
  assert.match(generateSketch(project, uno.id), /m1 = map\(constrain\(r1, 0, 1023\), 0, 1023, 0, 180\);/);
  const sim = createSim(project);
  setValue(sim, pot.id, 1023);
  advance(sim, 0.5);
  assert.equal(sim.parts.get(servo.id).angle, 180);
  setValue(sim, pot.id, 512);
  advance(sim, 0.5);
  assert.equal(sim.parts.get(servo.id).angle, 90, 'map(512, 0, 1023, 0, 180) = 90');
});

test('regla: "mover según la lectura" solo vale para un servo con una entrada que da un número', () => {
  const { project, uno } = servoProject();
  const btn = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', btn, '13');
  wire(project, btn, '14', uno, 'GND');
  const led = addComponent(project, 'led');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  const rows = pinRows(project, uno);
  assert.match(ruleProblem(rows, { input: 'D2', cond: 'activa', output: 'D9', action: 'angulo' }), /no da una lectura/);
  assert.match(ruleProblem(rows, { input: 'D2', cond: 'activa', output: 'D13', action: 'angulo' }), /no es un servo/);
});

test('servo sin VCC ni GND: la revisión avisa y en la simulación no se mueve', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const servo = addComponent(project, 'servo');
  wire(project, uno, 'D9', servo, 'SIG');
  const found = reviewWiring(project).filter((f) => f.code === 'sin-alimentacion');
  assert.equal(found.length, 1);
  assert.match(found[0].text, /VCC a 5 V ni GND/);
  const btn = addComponent(project, 'pulsador-na');
  wire(project, uno, 'D2', btn, '13');
  wire(project, btn, '14', uno, 'GND');
  uno.config.rules = [{ input: 'D2', cond: 'activa', output: 'D9', action: 'seguir' }];
  const sim = createSim(project);
  press(sim, btn.id, true);
  advance(sim, 0.5);
  assert.equal(sim.parts.get(servo.id).angle, 0);
  assert.ok(sim.events.some((e) => e.text.includes('no se mueve')));
});

test('regla: dos servos del 5V del Arduino dan un aviso que sugiere una fuente aparte', () => {
  const { project, uno } = servoProject();
  const second = addComponent(project, 'servo');
  powered(project, uno, second);
  wire(project, uno, 'D10', second, 'SIG');
  const found = all(project).filter((f) => f.code === 'servos-en-5v');
  assert.equal(found.length, 1);
  assert.equal(found[0].suggest[0].type, 'fuente-5');
});

test('regla: un servo con fuente aparte necesita tierra común con el Arduino', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const supply = addComponent(project, 'fuente-5');
  const servo = addComponent(project, 'servo');
  wire(project, supply, '+5V', servo, 'VCC');
  wire(project, servo, 'GND', supply, 'GND');
  wire(project, uno, 'D9', servo, 'SIG');
  assert.ok(codes(errors(project)).includes('sin-tierra-comun'));
  wire(project, supply, 'GND', uno, 'GND');
  assert.ok(!codes(errors(project)).includes('sin-tierra-comun'));
});

test('ultrasónico: Trig es salida de pulso, Echo da la distancia y el código usa pulseIn', () => {
  const { project, uno, sonar } = sonarProject();
  assert.equal(row(project, uno, 'D7').mode, 'trig');
  assert.equal(row(project, uno, 'D8').mode, 'distance');
  assert.equal(row(project, uno, 'D8').name, 'B1 distancia');
  assert.equal(interaction(sonar), 'slider');
  assert.deepEqual(codes(all(project)), []);
  const code = generateSketch(project, uno.id);
  assert.match(code, /long medirCm\(uint8_t trig, uint8_t echo\)/);
  assert.match(code, /pulseIn\(echo, HIGH, 30000UL\)/);
  assert.match(code, /const long b1_distancia = medirCm\(PIN_B1_TRIG, PIN_B1_DISTANCIA\);/);
  assert.match(code, /pinMode\(PIN_B1_TRIG, OUTPUT\);/);
  assert.match(code, /pinMode\(PIN_B1_DISTANCIA, INPUT\);/);
});

test('ultrasónico: un objeto a menos de 20 cm enciende el LED', () => {
  const { project, uno, sonar } = sonarProject();
  const led = addComponent(project, 'led');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  uno.config.rules = [{ input: 'D8', cond: 'menor', value: 20, output: 'D13', action: 'seguir' }];
  assert.equal(ruleProblem(pinRows(project, uno), uno.config.rules[0]), null);
  assert.match(generateSketch(project, uno.id), /h1 = b1_distancia < 20;/);
  const sim = createSim(project);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false, 'empieza a 100 cm');
  setValue(sim, sonar.id, 12);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], true);
  setValue(sim, sonar.id, 5000);
  assert.equal(sim.parts.get(sonar.id).values.Echo, 400, 'la distancia no pasa de 400 cm');
  setValue(sim, sonar.id, 0);
  assert.equal(sim.parts.get(sonar.id).values.Echo, 2, 'ni baja de 2 cm');
});

test('regla: la distancia se compara entre 2 y 400 cm', () => {
  const { project, uno } = sonarProject();
  const led = addComponent(project, 'led');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  const rows = pinRows(project, uno);
  assert.match(ruleProblem(rows, { input: 'D8', cond: 'menor', value: 900, output: 'D13', action: 'seguir' }), /entre 2 y 400 cm/);
  assert.match(ruleProblem(rows, { input: 'D8', cond: 'activa', output: 'D13', action: 'seguir' }), /es una distancia/);
});

test('regla: ultrasónico sin Trig es un error, y la simulación lee 400 cm y lo avisa', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const sonar = addComponent(project, 'ultrasonico');
  powered(project, uno, sonar);
  wire(project, sonar, 'Echo', uno, 'D8');
  const led = addComponent(project, 'led');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  assert.ok(codes(errors(project)).includes('ultrasonico-sin-trig'));
  uno.config.rules = [{ input: 'D8', cond: 'menor', value: 20, output: 'D13', action: 'seguir' }];
  assert.match(generateSketch(project, uno.id), /= 400; {2}\/\/ Falta conectar Trig/);
  const sim = createSim(project);
  setValue(sim, sonar.id, 5);
  advance(sim, 0.1);
  assert.equal(sim.parts.get(led.id).energized[0], false);
  assert.ok(sim.events.some((e) => e.text.includes('no mide')));

  const noEcho = createProject();
  const uno2 = addComponent(noEcho, 'arduino-uno');
  const sonar2 = addComponent(noEcho, 'ultrasonico');
  powered(noEcho, uno2, sonar2);
  wire(noEcho, uno2, 'D7', sonar2, 'Trig');
  assert.ok(codes(errors(noEcho)).includes('ultrasonico-sin-echo'));
});

test('pantalla LCD: SDA en A4 y SCL en A5, con librería LiquidCrystal_I2C', () => {
  const { project, uno, lcd } = lcdProject();
  assert.equal(row(project, uno, 'A4').mode, 'i2c');
  assert.equal(row(project, uno, 'A5').mode, 'i2c');
  assert.deepEqual(codes(all(project)), []);
  lcd.config.lines = ['Hola', 'Mundo'];
  const code = generateSketch(project, uno.id);
  assert.match(code, /#include <Wire\.h>/);
  assert.match(code, /#include <LiquidCrystal_I2C\.h>/);
  assert.match(code, /LiquidCrystal_I2C lcd\(0x27, 16, 2\);/);
  assert.match(code, /lcd\.init\(\);/);
  assert.match(code, /lcd\.print\(F\("Hola {12}"\)\);/);
  assert.doesNotMatch(code, /PIN_LCD1_SDA/, 'A4 y A5 los maneja Wire, no se declaran');
});

test('pantalla LCD: muestra la lectura de un pin con {A0} en el código y en la simulación', () => {
  const { project, uno, lcd } = lcdProject();
  const pot = addComponent(project, 'potenciometro');
  wire(project, uno, '5V', pot, '5V');
  wire(project, pot, 'GND', uno, 'GND');
  wire(project, pot, 'W', uno, 'A0');
  lcd.config.lines = ['Valor: {A0}', '100% listo'];
  assert.deepEqual(codes(all(project)), []);
  const code = generateSketch(project, uno.id);
  assert.match(code, /snprintf\(linea, sizeof linea, "Valor: %4d {5}", r1\);/);
  assert.match(code, /lcd\.print\(F\("100% listo {6}"\)\);/, 'sin lecturas no pasa por snprintf, así que % queda igual');
  const sim = createSim(project);
  setValue(sim, pot.id, 37);
  advance(sim, 0.05);
  assert.deepEqual(sim.parts.get(lcd.id).text, ['Valor:   37     ', '100% listo      ']);
});

test('pantalla LCD: muestra entradas digitales y salidas como SI o NO, y la distancia en cm', () => {
  const { project, uno, lcd } = lcdProject();
  const sonar = addComponent(project, 'ultrasonico');
  powered(project, uno, sonar);
  wire(project, uno, 'D7', sonar, 'Trig');
  wire(project, sonar, 'Echo', uno, 'D8');
  const led = addComponent(project, 'led');
  wire(project, uno, 'D13', led, 'A');
  wire(project, led, 'K', uno, 'GND');
  uno.config.rules = [{ input: 'D8', cond: 'menor', value: 30, output: 'D13', action: 'seguir' }];
  lcd.config.lines = ['Dist {D8} cm', 'Alarma {D13}'];
  const code = generateSketch(project, uno.id);
  assert.match(code, /"Dist %3ld cm {5}", b1_distancia\);/);
  assert.match(code, /"Alarma %s {7}", h1 \? "SI" : "NO"\);/);
  const sim = createSim(project);
  setValue(sim, sonar.id, 25);
  advance(sim, 0.05);
  assert.deepEqual(sim.parts.get(lcd.id).text, ['Dist  25 cm     ', 'Alarma SI       ']);
});

test('regla: la pantalla en pines distintos de A4 y A5 es un error y no muestra nada', () => {
  const project = createProject();
  const uno = addComponent(project, 'arduino-uno');
  const lcd = addComponent(project, 'lcd-i2c');
  powered(project, uno, lcd);
  wire(project, uno, 'A2', lcd, 'SDA');
  wire(project, uno, 'A3', lcd, 'SCL');
  const found = errors(project).filter((f) => f.code === 'i2c-pin');
  assert.equal(found.length, 2);
  assert.match(found[0].text, /debe ir a A4/);
  const sim = createSim(project);
  advance(sim, 0.05);
  assert.deepEqual(sim.parts.get(lcd.id).text, ['', '']);
  assert.ok(sim.events.some((e) => e.text.includes('SDA debe ir a A4')));
});

test('regla: texto de la pantalla demasiado largo o con un pin que no se usa', () => {
  const { project, uno, lcd } = lcdProject();
  lcd.config.lines = ['Este renglon es muy largo', 'Pin {D5}'];
  const found = all(project);
  assert.ok(codes(found).includes('lcd-texto-largo'));
  const bad = found.find((f) => f.code === 'lcd-dato-invalido');
  assert.match(bad.text, /\{D5\}/);
  const rows = pinRows(project, uno);
  assert.equal(lcdParts('Pin {D5}', rows).length, 8);
});

test('pantalla LCD: los acentos y la ñ se escriben con la letra simple', () => {
  assert.equal(lcdClean('Año: ¿Qué tal?'), 'Ano: ?Que tal?');
  assert.equal(lcdLine('Temperatura', [], () => 0), 'Temperatura     ');
  assert.equal(lcdLine('Un texto mucho más largo', [], () => 0).length, 16);
});
