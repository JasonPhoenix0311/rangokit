import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, definition, placePort, rotatedSize, portPosition } from '../src/editor/catalog.js';
import { createProject, addComponent, connect, reviewWiring, parseProject } from '../src/editor/project.js';

test('girar 90° cambia el ancho por el alto', () => {
  const def = definition('cilindro-de');
  assert.deepEqual(rotatedSize(def, 0), [160, 70]);
  assert.deepEqual(rotatedSize(def, 90), [70, 160]);
  assert.deepEqual(rotatedSize(def, 180), [160, 70]);
  assert.deepEqual(rotatedSize(def, 270), [70, 160]);
});

test('los puertos giran con el componente y cambian de lado', () => {
  const def = definition('pulsador-na');
  const top = def.ports.find((p) => p.id === '13');
  assert.deepEqual(placePort(def, top, 0), { x: 30, y: 0, side: 't' });
  assert.deepEqual(placePort(def, top, 90), { x: 70, y: 30, side: 'r' });
  assert.deepEqual(placePort(def, top, 180), { x: 30, y: 70, side: 'b' });
  assert.deepEqual(placePort(def, top, 270), { x: 0, y: 30, side: 'l' });
});

test('cuatro giros regresan cada puerto a su lugar y siempre quedan dentro de la caja', () => {
  for (const def of CATALOG) {
    for (const port of def.ports) {
      const [x, y] = portPosition(def, port);
      assert.deepEqual(placePort(def, port, 360), { x, y, side: port.side }, `${def.type}:${port.id}`);
      for (const rot of [90, 180, 270]) {
        const [w, h] = rotatedSize(def, rot);
        const placed = placePort(def, port, rot);
        assert.ok(placed.x >= 0 && placed.x <= w && placed.y >= 0 && placed.y <= h, `${def.type}:${port.id} a ${rot}°`);
      }
    }
  }
});

test('el giro y el color se guardan en el archivo del proyecto', () => {
  const project = createProject();
  const led = addComponent(project, 'led-solo');
  led.rot = 90;
  led.config.color = 'azul';
  const copy = parseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(copy.components[0].rot, 90);
  assert.equal(copy.components[0].config.color, 'azul');
  assert.equal(parseProject({ components: [{ id: 'c1', type: 'led', rot: 45 }], links: [] }).components[0].rot, 0);
});

test('un LED nuevo es rojo por omisión', () => {
  const project = createProject();
  assert.equal(addComponent(project, 'led').config.color, 'rojo');
  assert.equal(addComponent(project, 'resistencia').config.color, undefined);
});

test('el color del LED cambia la resistencia sugerida', () => {
  const suggestFor = (color) => {
    const project = createProject();
    const uno = addComponent(project, 'arduino-uno');
    const led = addComponent(project, 'led-solo');
    led.config.color = color;
    connect(project, { c: uno.id, p: 'D13' }, { c: led.id, p: 'A' });
    return reviewWiring(project).find((f) => f.code === 'led-sin-resistencia').suggest[0].ohms;
  };
  assert.equal(suggestFor('rojo'), 220);
  assert.equal(suggestFor('azul'), 150);
});
