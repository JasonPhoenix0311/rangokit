import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/editor/catalog.js';
import { createProject, addComponent, connect } from '../src/editor/project.js';
import { buildTemplate } from '../src/editor/rango.js';
import { createSim, advance, press, view } from '../src/editor/sim.js';
import { model, scene, linkPoints, port3d, pose, placement, spinRate, LINKS, SCALE } from '../src/editor/escena3d.js';

const finite = (list) => list.every((n) => Number.isFinite(n));

test('cada componente del catálogo tiene un modelo 3D válido', () => {
  const p = createProject();
  for (const def of CATALOG) {
    const c = addComponent(p, def.type);
    const parts = model(c);
    assert.ok(parts.length > 0, def.type);
    for (const part of parts) {
      assert.ok(['box', 'cyl', 'sph'].includes(part.shape), `${def.type}: ${part.shape}`);
      assert.ok(finite(part.size) && part.size.every((n) => n >= 0), `${def.type}: tamaño`);
      assert.ok(finite(part.pos) && part.pos.length === 3, `${def.type}: posición`);
      assert.match(part.color, /^#[0-9a-f]{6}$/i, `${def.type}: color`);
      if (part.role === 'blades') assert.ok(finite(part.hub) && Number.isFinite(part.offset), `${def.type}: aspas`);
      if (part.role === 'rod') assert.ok(part.stroke > 0, `${def.type}: carrera`);
      if (part.role === 'water') assert.ok(part.height > 0, `${def.type}: agua`);
    }
  }
});

test('la mesa respeta la posición y el giro del plano', () => {
  const p = createProject();
  const c = addComponent(p, 'cilindro-de', 200, 100);
  assert.deepEqual(placement(c), { x: (200 + 80) * SCALE, z: (100 + 35) * SCALE, rotY: -0 });
  c.rot = 90;
  const r = placement(c);
  assert.ok(Math.abs(r.rotY + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(r.x - (200 + 35) * SCALE) < 1e-9 && Math.abs(r.z - (100 + 80) * SCALE) < 1e-9);
});

test('las conexiones salen y llegan a sus puertos, a la altura de su tipo', () => {
  const p = buildTemplate('cilindro-de-palanca');
  for (const link of p.links) {
    const pts = linkPoints(p, link);
    const y = LINKS[link.kind].y;
    const a = port3d(p.components.find((c) => c.id === link.a.c), link.a.p, y);
    const b = port3d(p.components.find((c) => c.id === link.b.c), link.b.p, y);
    assert.deepEqual(pts[0], [a.x, y, a.z]);
    assert.deepEqual(pts[pts.length - 1], [b.x, y, b.z]);
    assert.ok(pts.every((pt) => pt[1] === y));
  }
  const s = scene(p);
  assert.equal(s.components.length, p.components.length);
  assert.equal(s.links.length, p.links.length);
  assert.ok(s.bounds.size >= 2);
});

test('la pose 3D sigue a la simulación: vástago, botón y giro', () => {
  const p = buildTemplate('cilindro-se-boton');
  const sim = createSim(p);
  const cyl = p.components.find((c) => c.type === 'cilindro-se');
  const btn = p.components.find((c) => c.label === '1S');
  assert.equal(pose(cyl, view(sim).parts.get(cyl.id)).rod, 0);
  press(sim, btn.id, true);
  advance(sim, 2.5);
  const v = view(sim);
  assert.equal(pose(cyl, v.parts.get(cyl.id)).rod, 1);
  assert.equal(pose(btn, v.parts.get(btn.id)).pressed, true);
  assert.equal(pose(cyl, null).rod, 0, 'sin simulación, en reposo');
  assert.equal(spinRate(0), 0);
  assert.ok(spinRate(1750) > spinRate(300));
});

test('la pose 3D muestra el nivel del tanque y la carga de la batería', () => {
  const p = createProject();
  const tk = addComponent(p, 'tanque');
  tk.config.inicio = 40;
  const bat = addComponent(p, 'bateria');
  bat.config.inicio = 70;
  assert.equal(pose(tk, null).level, 0.4);
  assert.equal(pose(bat, null).soc, 0.7);
  const red = addComponent(p, 'red-electrica');
  const m = addComponent(p, 'motor-ca');
  assert.ok(connect(p, { c: red.id, p: 'out' }, { c: m.id, p: 'in' }).ok);
  const bomba = addComponent(p, 'bomba');
  assert.ok(connect(p, { c: m.id, p: 'eje' }, { c: bomba.id, p: 'eje' }).ok);
  const sim = createSim(p);
  advance(sim, 0.3);
  assert.equal(pose(m, view(sim).parts.get(m.id)).rpm, 1750);
});
