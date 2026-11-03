import test from 'node:test';
import assert from 'node:assert/strict';
import { BREAKABLE, CHECKS, diagnose } from '../src/practices/p01.js';

test('el circuito sano completa el ciclo', () => {
  const result = diagnose();
  assert.equal(result.ok, true);
  assert.equal(result.stroke, 100);
  assert.ok(result.cycle > 3 && result.cycle < 4);
});

for (const id of BREAKABLE) {
  test(`localiza ${id} cuando se suelta`, () => {
    const result = diagnose({ broken: [id] });
    assert.equal(result.target, id);
    assert.ok(result.symptom && result.hint && result.component && result.correction);
    assert.deepEqual(result.fix, { kind: 'reconnect', id });
    assert.ok(result.failedCheck < CHECKS.length);
  });
}

test('la falta de aire apunta a 0Z1', () => {
  const result = diagnose({ supply: false });
  assert.equal(result.stage, 'air-ext');
  assert.equal(result.target, 'V0');
});

test('un sensor fuera de alcance deja el cilindro afuera', () => {
  const result = diagnose({ s2pos: 112 });
  assert.equal(result.stage, 's2-late');
  assert.equal(result.target, 'S2');
});

test('un sensor adelantado acorta la carrera', () => {
  const result = diagnose({ s2pos: 60 });
  assert.equal(result.stage, 's2-early');
  assert.equal(result.target, 'S2');
});

test('el sensor funciona en toda su tolerancia', () => {
  for (const s2pos of [98, 100, 102, 103]) {
    assert.equal(diagnose({ s2pos }).ok, true, `S2 en ${s2pos} mm`);
  }
});

test('la frontera de la tolerancia se reporta como falla', () => {
  assert.equal(diagnose({ s2pos: 104 }).stage, 's2-late');
  assert.equal(diagnose({ s2pos: 96 }).stage, 's2-early');
});

test('con dos fallas reporta primero la que corta antes el ciclo', () => {
  assert.equal(diagnose({ broken: ['W1', 'W6'] }).target, 'W1');
});

test('corregir la falla reportada deja el ciclo sano', () => {
  assert.equal(diagnose({ broken: [] }).ok, true);
  const found = diagnose({ s2pos: 112 });
  assert.equal(diagnose({ s2pos: found.fix.pos }).ok, true);
});

test('un sensor que detecta en reposo apunta a S2, no a la llave de aire', () => {
  const result = diagnose({ s2pos: 2 });
  assert.equal(result.stage, 's2-rest');
  assert.equal(result.target, 'S2');
  assert.equal(result.failedCheck, 0);
  assert.equal(diagnose({ s2pos: result.fix.pos }).ok, true);
});

for (const [coil, stage, point] of [['K1c', 'k1', 'K1:A1: 24 V'], ['Y1c', 'y1', 'Y1:+: 24 V']]) {
  test(`sin regla para la bobina ${coil} lo dice y sugiere qué medir`, () => {
    const result = diagnose({ damaged: [coil] });
    assert.equal(result.ok, undefined);
    assert.equal(result.stage, stage);
    assert.equal(result.undetermined, true);
    assert.equal(result.target, undefined);
    assert.equal(result.fix, undefined);
    assert.ok(result.symptom && result.hint && result.measure);
    assert.ok(result.evidence.includes(point), result.evidence.join(' | '));
  });
}
