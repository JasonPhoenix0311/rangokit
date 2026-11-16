import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/editor/project.js';
import { reviewWiring } from '../src/editor/project.js';
import { reviewArduino } from '../src/editor/arduino.js';
import { reviewEnergy, setEnv } from '../src/editor/energia.js';
import { createSim, advance, press, toggle, view } from '../src/editor/sim.js';
import { SYSTEMS } from '../src/editor/catalog.js';
import { TUTORIALS, tutorialOf, find, stepDone, advanceTutorial, applyStep, canApply, stepText, stepTarget } from '../src/editor/tutorial.js';

const errors = (p) => [...reviewWiring(p), ...reviewArduino(p), ...reviewEnergy(p)].filter((f) => f.level === 'error').length;

// Lo que haría el estudiante en cada paso de simulación.
const ACTIONS = {
  'tut-neumatica': [(sim, t, p) => press(sim, find(t, p, 'valvula').id, true), (sim, t, p) => press(sim, find(t, p, 'valvula').id, false)],
  'tut-electroneumatica': [(sim, t, p) => press(sim, find(t, p, 's').id, true), (sim, t, p) => press(sim, find(t, p, 's').id, false)],
  'tut-arduino': [(sim, t, p) => press(sim, find(t, p, 's').id, true)],
  'tut-electronica': [(sim, t, p) => toggle(sim, find(t, p, 's').id)],
  'tut-renovables': [() => {}, (sim) => setEnv(sim, 'sol', 0), () => {}],
  'tut-eolica': [(sim) => setEnv(sim, 'viento', 6), () => {}, (sim) => setEnv(sim, 'viento', 2)],
};

test('hay un tutorial por cada tipo de sistema', () => {
  const systems = SYSTEMS.filter((s) => s.id !== 'todos').map((s) => s.id);
  for (const system of systems) assert.ok(TUTORIALS.some((t) => t.system === system), `falta tutorial de ${system}`);
  assert.equal(new Set(TUTORIALS.map((t) => t.id)).size, TUTORIALS.length);
  for (const t of TUTORIALS) {
    assert.ok(t.steps.length >= 8, t.id);
    assert.equal(t.steps.at(-1).kind, '3d', `${t.id} termina en la vista 3D`);
    for (const step of t.steps) {
      const { title, body } = stepText(t, step, null);
      assert.ok(title && body, `${t.id}: texto de ${step.kind}`);
    }
  }
});

for (const tutorial of TUTORIALS) {
  test(`${tutorial.title}: se completa paso a paso y funciona`, () => {
    const project = createProject({ system: tutorial.system });
    let step = 0;
    let sim = null;
    let mode3d = false;
    const actions = [...ACTIONS[tutorial.id]];
    const ctx = () => ({ project, sim, view: sim ? view(sim) : null, mode3d, errors: errors(project) });
    while (step < tutorial.steps.length) {
      const s = tutorial.steps[step];
      assert.equal(stepDone(tutorial, s, ctx()), false, `${tutorial.id}: el paso ${step + 1} (${s.kind}) no debe estar hecho antes de hacerlo`);
      assert.ok(stepTarget(tutorial, s, project), 'tiene algo que resaltar');
      if (canApply(s)) applyStep(tutorial, s, project);
      else if (s.kind === 'review') { /* el armado ya debe estar libre de errores */ }
      else if (s.kind === 'run') sim = createSim(project);
      else if (s.kind === '3d') mode3d = true;
      else {
        actions.shift()(sim, tutorial, project);
        advance(sim, 2.5);
      }
      const next = advanceTutorial(tutorial, step, ctx());
      assert.ok(next > step, `${tutorial.id}: el paso ${step + 1} (${s.kind}) debe quedar hecho`);
      step = next;
    }
    assert.equal(errors(project), 0);
  });
}

test('un paso de conexión acepta la conexión a través de otro componente de la misma red', () => {
  const t = tutorialOf('tut-neumatica');
  const p = createProject();
  for (const s of t.steps.slice(0, 3)) applyStep(t, s, p);
  assert.equal(stepDone(t, t.steps[3], { project: p }), false);
  applyStep(t, t.steps[3], p);
  assert.equal(stepDone(t, t.steps[3], { project: p }), true);
  assert.throws(() => applyStep(t, t.steps[6], p), /lo haces tú/);
});
