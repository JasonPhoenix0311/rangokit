import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, numberIn, clean, matchComponent, advise, pickTip, speakable, chooseVoice, reviewSpeech, onRun, statusSpeech, stepSpeech, greet } from '../src/editor/atlas.js';
import { createProject, addComponent } from '../src/editor/project.js';
import { createSim, advance } from '../src/editor/sim.js';
import { setEnv } from '../src/editor/energia.js';

const lab = () => {
  const p = createProject({ name: 'Prueba', system: 'renovables' });
  addComponent(p, 'aerogenerador', 0, 0);    // WG1
  addComponent(p, 'pulsador-na', 300, 0);    // S1
  return p;
};

test('Atlas quita su nombre y los signos antes de entender', () => {
  assert.equal(clean('¡Oye Atlas, EJECUTA!'), 'ejecuta');
  assert.equal(clean('Atlas: ¿qué sigue?'), 'que sigue');
});

test('los números se entienden con cifras o con palabras', () => {
  assert.equal(numberIn('viento a 8,5'), 8.5);
  assert.equal(numberIn('torre a treinta'), 30);
  assert.equal(numberIn('sol a mil'), 1000);
  assert.equal(numberIn('agrega un panel'), null);
});

test('agregar busca el componente por su nombre o por como se dice', () => {
  const p = lab();
  const cases = {
    'agrega un panel solar': 'panel-solar',
    'Atlas, agrega una batería': 'bateria',
    'pon un molino de viento': 'aerogenerador',
    'necesito una bomba de agua': 'bomba',
    'agrega una válvula con botón': 'valvula-32-boton',
    'agrega un cilindro de doble efecto': 'cilindro-de',
    'agrega un arduino': 'arduino-uno',
  };
  for (const [said, type] of Object.entries(cases)) assert.deepEqual(parseCommand(said, p), { action: 'add', type }, said);
  assert.equal(parseCommand('agrega un flux capacitor', p).action, 'add-unknown');
  assert.equal(matchComponent('xyz'), null);
});

test('simulación, vistas y tutorial', () => {
  const p = lab();
  const action = (said) => parseCommand(said, p).action;
  assert.equal(action('Ejecuta'), 'run');
  assert.equal(action('arranca'), 'run');
  assert.equal(action('detén la simulación'), 'stop');
  assert.equal(action('reinicia'), 'restart');
  assert.deepEqual(parseCommand('vista 3D', p), { action: 'view', mode: '3d' });
  assert.deepEqual(parseCommand('muéstrame el esquema', p), { action: 'view', mode: '2d' });
  assert.equal(action('¿Qué sigue?'), 'repeat');
  assert.equal(action('hazlo por mí'), 'tutorial-do');
  assert.equal(action('revisa'), 'review');
  assert.equal(action('¿cómo va?'), 'status');
  assert.equal(action('silencio'), 'mute');
  assert.equal(action('habla'), 'unmute');
  assert.equal(action('ayuda'), 'help');
  assert.equal(action('blablá'), 'unknown');
});

test('ambiente con valor o con «más» y «menos»', () => {
  const p = lab();
  assert.deepEqual(parseCommand('sube el viento a 8', p), { action: 'env', key: 'viento', value: 8 });
  assert.deepEqual(parseCommand('pon el sol a 1000', p), { action: 'env', key: 'sol', value: 1000 });
  assert.deepEqual(parseCommand('más viento', p), { action: 'env', key: 'viento', delta: 2 });
  assert.deepEqual(parseCommand('menos río', p), { action: 'env', key: 'rio', delta: -5 });
});

test('altura de la torre: el número de la etiqueta no se confunde con el valor', () => {
  const p = lab();
  assert.deepEqual(parseCommand('torre a 30 metros', p), { action: 'param', key: 'altura', value: 30, target: null, tower: true });
  assert.deepEqual(parseCommand('sube la torre de WG1 a cuarenta', p), { action: 'param', key: 'altura', value: 40, target: 'c1', tower: true });
  assert.deepEqual(parseCommand('sube la torre de w g 1 a 35', p), { action: 'param', key: 'altura', value: 35, target: 'c1', tower: true });
  assert.deepEqual(parseCommand('sube la torre', p), { action: 'param', key: 'altura', delta: 10, target: null, tower: true });
  assert.deepEqual(parseCommand('altitud 2000', p), { action: 'param', key: 'altitud', value: 2000, target: null });
});

test('accionar por etiqueta y pasar ideas a Rango', () => {
  const p = lab();
  assert.deepEqual(parseCommand('presiona S1', p), { action: 'press', id: 'c2' });
  assert.deepEqual(parseCommand('presiona s 1', p), { action: 'press', id: 'c2' });
  assert.equal(parseCommand('presiona el botón rojo', p).action, 'press-unknown');
  assert.equal(parseCommand('quiero regar mi jardín con energía solar', p).action, 'rango');
});

test('la voz lee bien las unidades', () => {
  assert.equal(speakable('WG1 · 400 W a 7.2 m/s, 30 m'), 'WG1 · 400 watts a 7.2 metros por segundo, 30 metros');
  assert.equal(speakable('batería 80 %, ≈ 2.4 kWh, 1000 W/m², 24 V'), 'batería 80 por ciento, aproximadamente 2.4 kilowatts hora, 1000 watts por metro cuadrado, 24 volts');
  assert.equal(speakable('Conecta A → B y pulsa ▶ Ejecutar'), 'Conecta A a B y pulsa Ejecutar');
});

test('elige una voz en español, de preferencia de México', () => {
  const voices = [{ lang: 'en-US', name: 'A' }, { lang: 'es-ES', name: 'B' }, { lang: 'es-MX', name: 'C' }];
  assert.equal(chooseVoice(voices).name, 'C');
  assert.equal(chooseVoice([{ lang: 'en-US', name: 'A' }]), null);
});

test('consejo de subir la torre con el viento calculado a 30 m', () => {
  const p = lab();
  const sim = createSim(p);
  setEnv(sim, 'viento', 6);
  advance(sim, 1);
  const tip = advise({ project: p, sim }).find((t) => t.id === 'torre:c1');
  assert.ok(tip, 'debe sugerir subir la torre');
  assert.match(tip.text, /WG1 está a 10 m/);
  assert.match(tip.text, /de 6\.0 a 7\.0 m\/s/);
});

test('aviso de batería baja que se descarga', () => {
  const p = createProject({ name: 'B', system: 'renovables' });
  const bat = addComponent(p, 'bateria', 0, 0);
  const sim = createSim(p);
  Object.assign(sim.parts.get(bat.id), { soc: 18, watts: -120 });
  const tips = advise({ project: p, sim });
  assert.ok(tips.some((t) => t.id === `bat-baja:${bat.id}` && /18 %/.test(t.text)));
});

test('un error de la revisión se comenta con su sugerencia, solo sin simulación', () => {
  const p = lab();
  const findings = [{ level: 'error', code: 'corto', where: ['c1'], text: 'Cortocircuito.', suggest: [{ text: 'Agrega una carga.' }] }];
  assert.equal(advise({ project: p, sim: null, findings })[0].text, 'Ojo, encontré algo: Cortocircuito. Agrega una carga.');
  assert.match(reviewSpeech(findings, p), /Encontré un error\. Cortocircuito\. Te sugiero: Agrega una carga\./);
  assert.match(reviewSpeech([], p), /No encuentro ningún error/);
  assert.match(onRun(findings), /hay un error/);
  assert.match(onRun([]), /Todo está bien conectado/);
});

test('no repite el mismo consejo antes de que pase el tiempo de espera', () => {
  const memory = new Map();
  const tips = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  assert.equal(pickTip(tips, memory, 0).id, 'a');
  assert.equal(pickTip(tips, memory, 1).id, 'b');
  assert.equal(pickTip(tips, memory, 2), null);
  assert.equal(pickTip(tips, memory, 60).id, 'a');
});

test('saludo, estado y pasos de tutorial', () => {
  const empty = createProject({ name: 'V', system: 'todos' });
  assert.match(greet(empty), /agrega un panel solar/);
  assert.match(statusSpeech({ project: empty, sim: null }), /detenido/);
  assert.equal(stepSpeech({ title: 'Ejecuta', body: 'Pulsa el botón.' }, 6, 20, 0, true), '¡Muy bien! Paso 7 de 20: Ejecuta. Pulsa el botón.');
});

test('cada pista de voz de los tutoriales se entiende como el paso que pide', async () => {
  const { TUTORIALS } = await import('../src/editor/tutorial.js');
  const { voiceHint } = await import('../src/editor/atlas.js');
  const expected = { add: 'add', run: 'run', review: 'review', '3d': 'view', env: 'env', config: 'param' };
  let checked = 0;
  for (const tutorial of TUTORIALS) {
    const p = createProject({ name: 't', system: tutorial.system });
    for (const step of tutorial.steps) {
      const hint = voiceHint(step);
      if (!hint) continue;
      const cmd = parseCommand(hint, p);
      assert.equal(cmd.action, expected[step.kind], `${tutorial.id}: «${hint}»`);
      if (step.kind === 'add') assert.equal(cmd.type, step.type, `${tutorial.id}: «${hint}»`);
      if (step.kind === 'env') assert.deepEqual([cmd.key, cmd.value], [step.key, step.value], `${tutorial.id}: «${hint}»`);
      if (step.kind === 'config') assert.deepEqual([cmd.key, cmd.value], [step.key, step.value], `${tutorial.id}: «${hint}»`);
      checked += 1;
    }
  }
  assert.ok(checked > 40);
});
