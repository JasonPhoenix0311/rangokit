import test from 'node:test';
import assert from 'node:assert/strict';
import { features, createModel, train, predict, stem } from '../src/editor/learn.js';
import { TEMPLATES, TRAINING, matchProblem, adaptedModel, learningSummary } from '../src/editor/rango.js';
import { SEARCH, searchUrl, parseRepos, rankRepos, searchProjects } from '../src/editor/web.js';

test('los rasgos juntan palabras de la misma raíz y pares de palabras', () => {
  const { tokens } = features('Los cilindros de simple efecto');
  assert.ok(tokens.includes(stem('cilindros')));
  assert.equal(stem('cilindros'), stem('cilindro'));
  assert.ok(tokens.includes('simpl_efect'));
  assert.ok(!tokens.includes('los') && !tokens.includes('de'));
});

test('Naive Bayes aprende a separar dos clases', () => {
  const model = createModel();
  train(model, 'el LED se enciende con el botón', 'led');
  train(model, 'el cilindro sale con aire', 'cilindro');
  assert.equal(predict(model, 'quiero encender un LED').ranked[0].label, 'led');
  assert.equal(predict(model, 'mover un cilindro').ranked[0].label, 'cilindro');
});

test('cada problema conocido tiene enunciados de entrenamiento y búsqueda en la red', () => {
  for (const template of TEMPLATES) {
    assert.ok((TRAINING[template.id] ?? []).length >= 4, template.id);
    assert.ok((SEARCH[template.id] ?? []).length >= 2, template.id);
  }
});

test('reconoce bien sus propios enunciados de entrenamiento', () => {
  for (const [id, sentences] of Object.entries(TRAINING)) {
    for (const sentence of sentences) assert.equal(matchProblem(sentence).best?.template.id, id, sentence);
  }
});

test('se adapta: lo que el estudiante confirma cambia lo que reconoce después', () => {
  const text = 'Quiero que la compuerta del silo se abra y se cierre con una manija';
  const label = 'cilindro-de-palanca';
  const before = matchProblem(text);
  assert.ok(!before.recognized || before.best.template.id !== label || before.best.confidence < 0.9);
  const learned = [{ text, label }];
  const after = matchProblem('La compuerta del silo debe abrirse con la manija', learned);
  assert.equal(after.recognized, true);
  assert.equal(after.best.template.id, label);
  assert.ok(after.best.confidence > (before.best?.template.id === label ? before.best.confidence : 0));
});

test('lo aprendido con etiquetas inválidas se ignora', () => {
  assert.doesNotThrow(() => adaptedModel([{ text: 'algo', label: 'no-existe' }, null, { text: 5, label: 'led' }]));
  const summary = learningSummary([{ text: 'a', label: 'arduino-led-boton' }, { text: 'b', label: 'arduino-led-boton' }]);
  assert.equal(summary.total, 2);
  assert.equal(summary.byTemplate[0].n, 2);
});

test('la búsqueda solo envía las palabras de búsqueda, nunca el enunciado', () => {
  const url = new URL(searchUrl('arduino button led'));
  assert.equal(url.origin, 'https://api.github.com');
  assert.equal(url.searchParams.get('q'), 'arduino button led in:name,description,readme');
  const dirty = new URL(searchUrl('arduino <script>"hola"</script> & led'));
  assert.doesNotMatch(dirty.searchParams.get('q'), /[<>"&]/);
});

test('los resultados de GitHub se limpian y se descartan enlaces ajenos', () => {
  const repos = parseRepos({ items: [
    { full_name: 'a/b', html_url: 'https://github.com/a/b', description: 'Arduino button LED', stargazers_count: 10, topics: ['arduino'] },
    { full_name: 'x/y', html_url: 'javascript:alert(1)', description: 'malo' },
    { full_name: 'c/d', html_url: 'https://evil.example/c', description: 'otro' },
  ] });
  assert.deepEqual(repos.map((r) => r.name), ['a/b']);
});

test('el orden prefiere lo parecido y lo que al estudiante ya le sirvió', () => {
  const repos = [
    { name: 'muy/popular', url: 'https://github.com/muy/popular', description: 'weather station', stars: 5000, topics: [] },
    { name: 'arduino/button-led', url: 'https://github.com/arduino/button-led', description: 'arduino button led', stars: 3, topics: [] },
    { name: 'otro/arduino-led', url: 'https://github.com/otro/arduino-led', description: 'arduino led blink', stars: 2, topics: [] },
  ];
  const ranked = rankRepos(repos, 'arduino button led');
  assert.equal(ranked[0].name, 'arduino/button-led');
  assert.equal(ranked[ranked.length - 1].name, 'muy/popular', 'un proyecto famoso pero ajeno queda al final');
  const adapted = rankRepos(repos, 'arduino button led', ['https://github.com/otro/arduino-led']);
  assert.equal(adapted[0].name, 'otro/arduino-led');
  assert.equal(adapted[0].useful, true);
});

test('si la primera búsqueda no da nada, intenta la segunda; si GitHub limita, lo explica', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(new URL(url).searchParams.get('q'));
    const items = calls.length === 1 ? [] : [{ full_name: 'a/b', html_url: 'https://github.com/a/b', description: 'arduino led', stargazers_count: 1 }];
    return { ok: true, status: 200, json: async () => ({ items }) };
  };
  const result = await searchProjects('primera', { fallback: 'segunda', fetcher });
  assert.equal(calls.length, 2);
  assert.equal(result.query, 'segunda');
  assert.equal(result.repos.length, 1);
  const limited = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(searchProjects('x', { fetcher: limited }), /10 por minuto/);
});
