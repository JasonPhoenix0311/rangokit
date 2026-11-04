import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALWAYS_FREE, DEFAULT_PLAN, FEATURES, PLANS, PRICING_NOTICE,
  canUse, formatPrice, getPlan, includes, migrateAccount, migrateAccounts, planOf,
} from '../src/plans.js';
import { renderPlansPage } from '../src/plans-page.js';

const price = (id) => formatPrice(getPlan(id));

test('cada plan tiene nombre, precio, periodo y funciones conocidas', () => {
  assert.equal(new Set(PLANS.map((p) => p.id)).size, PLANS.length);
  for (const plan of PLANS) {
    assert.ok(plan.name && plan.summary, plan.id);
    assert.ok(plan.price === null || Number.isFinite(plan.price), plan.id);
    assert.ok([null, 'semestre', 'año'].includes(plan.period), plan.id);
    assert.ok(plan.features.length > 0, plan.id);
    for (const feature of plan.features) assert.ok(feature in FEATURES, `${plan.id}: ${feature}`);
  }
});

test('cada plan incluye todas las funciones de su plan base', () => {
  for (const plan of PLANS.filter((p) => p.base)) {
    const base = getPlan(plan.base);
    assert.ok(base, `${plan.id}: base ${plan.base}`);
    for (const feature of base.features) assert.ok(plan.features.includes(feature), `${plan.id}: ${feature}`);
  }
});

test('los precios coinciden con lo acordado', () => {
  assert.equal(price('estudiante'), 'Gratis');
  assert.equal(price('estudiante-plus'), 'MX$99 por semestre');
  assert.equal(price('docente'), 'Gratis');
  assert.equal(price('docente-pro'), 'MX$690 al año');
  assert.equal(price('escuela'), 'MX$15,000 a MX$30,000 al año por plantel');
  assert.equal(price('capacitacion'), 'Precio por taller');
});

test('el plan Estudiante no requiere cuenta', () => {
  assert.equal(getPlan('estudiante').requiresAccount, false);
});

test('la configuración no se puede modificar por accidente', () => {
  assert.throws(() => { PLANS[0].price = 10; }, TypeError);
  assert.throws(() => { PLANS[0].features.push('tutor-ia'); }, TypeError);
  assert.throws(() => { FEATURES.nueva = {}; }, TypeError);
});

test('sin cuenta, con plan gratis, vacío o desconocido, toca el plan gratuito del rol', () => {
  assert.equal(planOf(null).id, 'estudiante');
  assert.equal(planOf(undefined).id, 'estudiante');
  assert.equal(planOf({}).id, 'estudiante');
  assert.equal(planOf({ plan: DEFAULT_PLAN }).id, 'estudiante');
  assert.equal(planOf({ plan: DEFAULT_PLAN, role: 'docente' }).id, 'docente');
  assert.equal(planOf({ plan: 'inventado', role: 'docente' }).id, 'docente');
  assert.equal(planOf({ plan: 'capacitacion' }).id, 'estudiante');
  assert.equal(planOf({ plan: 'docente-pro', role: 'docente' }).id, 'docente-pro');
});

test('el simulador, las prácticas y las pistas por reglas siguen gratis y sin cuenta', () => {
  for (const feature of ['simulador', 'practicas', 'pistas-reglas']) {
    assert.ok(ALWAYS_FREE.includes(feature));
    assert.equal(FEATURES[feature].available, true);
    assert.equal(canUse(null, feature), true, feature);
    for (const plan of PLANS) assert.equal(canUse({ plan: plan.id }, feature), true, `${plan.id}: ${feature}`);
  }
});

test('ningún estudiante paga por hacer o entregar una práctica asignada', () => {
  assert.ok(ALWAYS_FREE.includes('practica-asignada'));
  assert.equal(includes(null, 'practica-asignada'), true);
  for (const plan of PLANS) {
    for (const role of ['estudiante', 'docente', undefined]) {
      assert.equal(includes({ plan: plan.id, role }, 'practica-asignada'), true, `${plan.id} ${role}`);
    }
  }
  assert.ok(getPlan('estudiante').features.includes('practica-asignada'));
});

test('las funciones de pago no se habilitan mientras no existan', () => {
  for (const [id, feature] of Object.entries(FEATURES)) {
    if (ALWAYS_FREE.includes(id)) continue;
    assert.equal(feature.available, false, id);
    for (const plan of PLANS) assert.equal(canUse({ plan: plan.id }, id), false, `${plan.id}: ${id}`);
  }
  assert.equal(includes({ plan: 'estudiante-plus' }, 'tutor-ia'), true);
  assert.equal(includes({ plan: DEFAULT_PLAN }, 'tutor-ia'), false);
  assert.equal(includes(null, 'no-existe'), false);
});

test('la migración agrega plan "gratis" y conserva todo lo demás', () => {
  const before = { id: 'a1', email: 'alumno@escuela.mx', name: 'Ana', created: '2026-01-01', extra: { tema: 'oscuro' } };
  const after = migrateAccount(before);
  assert.equal(after.plan, 'gratis');
  assert.equal(after.accountVersion, 1);
  for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], key);
  assert.equal(before.plan, undefined, 'no modifica el original');
});

test('la migración no cambia un plan ya asignado y es idempotente', () => {
  const pro = migrateAccount({ id: 'd1', plan: 'docente-pro', role: 'docente' });
  assert.equal(pro.plan, 'docente-pro');
  assert.deepEqual(migrateAccount(pro), pro);
  assert.equal(migrateAccount({ id: 'x', plan: '  ' }).plan, 'gratis');
  assert.equal(migrateAccount({ id: 'y', accountVersion: 3 }).accountVersion, 3);
});

test('la migración conserva todas las cuentas, en lista o por id', () => {
  const list = [{ id: 'a' }, { id: 'b', plan: 'docente' }, null, 'dato raro'];
  const migrated = migrateAccounts(list);
  assert.equal(migrated.length, list.length);
  assert.deepEqual(migrated.map((a) => a?.id ?? a), ['a', 'b', null, 'dato raro']);
  assert.deepEqual(migrated.map((a) => a?.plan), ['gratis', 'docente', undefined, undefined]);

  const byId = migrateAccounts({ a: { id: 'a' }, b: { id: 'b' } });
  assert.deepEqual(Object.keys(byId), ['a', 'b']);
  assert.equal(byId.b.plan, 'gratis');

  assert.equal(migrateAccounts(undefined), undefined);
  assert.equal(migrateAccounts('texto'), 'texto');
});

test('la página de planes muestra el aviso, todos los planes y lo que viene', () => {
  const html = renderPlansPage();
  assert.equal(PRICING_NOTICE, 'Precios sujetos a validación. Aún no se realizan cobros.');
  assert.ok(html.includes(PRICING_NOTICE));
  for (const plan of PLANS) {
    assert.ok(html.includes(`id="plan-${plan.id}"`), plan.id);
    assert.ok(html.includes(formatPrice(plan).replace(/&/g, '&#38;')), plan.id);
  }
  assert.ok(html.includes('Próximamente'));
  assert.ok(html.includes('No requiere cuenta'));
});

test('la página de planes no cobra ni pide datos', () => {
  const html = renderPlansPage().toLowerCase();
  for (const word of ['<form', '<input', '<script', 'stripe', 'checkout', 'comprar', 'suscríbete', 'http://', 'https://']) {
    assert.ok(!html.includes(word), word);
  }
});
