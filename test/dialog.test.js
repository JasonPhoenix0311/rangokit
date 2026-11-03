import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSlots, proposal, startConversation, respond, normalizeConversation, userText } from '../src/editor/dialog.js';
import { TEMPLATES } from '../src/editor/rango.js';

const last = (state) => state.messages[state.messages.length - 1];
const chip = (state, value) => last(state).chips.find((c) => c.value === value);

test('extrae del texto lo que el estudiante ya dijo', () => {
  assert.deepEqual(extractSlots('Al presionar un botón, un cilindro de simple efecto debe salir y regresar por resorte al soltarlo.'),
    { actuator: 'cilindro', cylType: 'se', trigger: 'boton', release: 'soltar' });
  assert.deepEqual(extractSlots('Con Arduino, al pulsar S1 el cilindro sale y regresa solo al llegar al final de carrera'),
    { actuator: 'cilindro', trigger: 'boton', release: 'final', tech: 'arduino' });
  assert.equal(extractSlots('botón de marcha y botón de paro: se queda afuera aunque se suelte el botón').release, 'paro');
  assert.equal(extractSlots('regresa al soltar, con paro de emergencia').release, 'soltar');
  assert.deepEqual(extractSlots('quiero que vaya más lento y con paro de emergencia').extras, ['velocidad', 'emergencia']);
});

test('cada ejemplo de Rango se puede alcanzar con la conversación', () => {
  const reach = {
    'cilindro-se-boton': { actuator: 'cilindro', cylType: 'se', trigger: 'boton', release: 'soltar', tech: 'neumatica' },
    'cilindro-de-palanca': { actuator: 'cilindro', cylType: 'de', trigger: 'palanca' },
    'electro-directo': { actuator: 'cilindro', cylType: 'de', trigger: 'boton', release: 'soltar', tech: 'electro24' },
    'enclavamiento-rele': { actuator: 'cilindro', cylType: 'de', trigger: 'boton', release: 'paro', tech: 'electro24' },
    'arduino-led-boton': { actuator: 'luz', trigger: 'boton', release: 'soltar' },
    'arduino-cilindro': { actuator: 'cilindro', cylType: 'de', trigger: 'boton', release: 'final', tech: 'arduino' },
    'arduino-potenciometro': { actuator: 'luz', trigger: 'potenciometro' },
  };
  for (const template of TEMPLATES) {
    const p = proposal(reach[template.id]);
    assert.equal(p.templateId, template.id, template.id);
    assert.equal(p.exact, true, template.id);
  }
});

test('con relés y regreso automático propone la práctica guiada', () => {
  const p = proposal({ actuator: 'cilindro', cylType: 'de', trigger: 'boton', release: 'final', tech: 'electro24' });
  assert.equal(p.practice, true);
  assert.equal(p.templateId, null);
});

test('si no tiene ejemplo lo dice en lugar de inventar', () => {
  const p = proposal({ actuator: 'cilindro', cylType: 'de', trigger: 'boton', release: 'final', tech: 'neumatica' });
  assert.equal(p.templateId, null);
  assert.match(p.noTemplate, /no puedo armártelo/);
});

test('los cambios respecto al ejemplo se explican', () => {
  const p = proposal({ actuator: 'cilindro', cylType: 'de', trigger: 'boton', release: 'soltar', tech: 'arduino' });
  assert.equal(p.templateId, 'arduino-cilindro');
  assert.equal(p.exact, false);
  assert.match(p.differences[0], /una sola regla/);
});

test('conversación completa en un solo mensaje: propone de inmediato', () => {
  let state = startConversation();
  state = respond(state, { text: 'Con Arduino, al pulsar S1 un cilindro de doble efecto debe salir y regresar solo al llegar al final de carrera.' });
  const reply = last(state);
  assert.equal(state.done, true);
  assert.equal(reply.proposal.templateId, 'arduino-cilindro');
  assert.match(reply.text, /Ya entendí tu proyecto/);
  assert.ok(reply.actions.some((a) => a.action === 'chat-build'));
});

test('conversación paso a paso con respuestas rápidas', () => {
  let state = startConversation();
  state = respond(state, { text: 'Tengo que mover algo en una máquina' });
  assert.equal(state.asked, 'actuator');
  assert.match(last(state).text, /No te entendí|qué tiene que moverse/i);
  state = respond(state, chip(state, 'cilindro'));
  assert.equal(state.asked, 'cylType');
  state = respond(state, chip(state, 'de'));
  assert.equal(state.asked, 'trigger');
  state = respond(state, chip(state, 'boton'));
  assert.equal(state.asked, 'release');
  state = respond(state, chip(state, 'paro'));
  assert.equal(state.asked, 'tech');
  state = respond(state, chip(state, 'electro24'));
  assert.equal(state.done, true);
  assert.equal(last(state).proposal.templateId, 'enclavamiento-rele');
});

test('si el estudiante no sabe, Rango explica las opciones', () => {
  let state = startConversation();
  state = respond(state, { text: 'Un cilindro sale cuando aprieto un botón' });
  assert.equal(state.asked, 'cylType');
  state = respond(state, { text: 'no sé' });
  assert.equal(state.asked, 'cylType');
  assert.match(last(state).text, /resorte/);
  assert.ok(!last(state).chips.some((c) => c.value === 'nose'));
});

test('si no entiende dos veces seguidas, pide elegir una opción', () => {
  let state = startConversation();
  state = respond(state, { text: 'hola' });
  state = respond(state, { text: 'pues eso' });
  assert.match(last(state).text, /Elige una de estas opciones/);
  assert.ok(last(state).chips.length >= 2);
});

test('después de proponer, se puede cambiar algo escribiéndolo', () => {
  let state = startConversation();
  state = respond(state, { text: 'Un LED se enciende mientras presiono un botón' });
  assert.equal(last(state).proposal.templateId, 'arduino-led-boton');
  state = respond(state, { text: 'mejor que se mantenga encendido hasta presionar otro botón de paro' });
  assert.equal(last(state).proposal.templateId, 'arduino-led-boton');
  assert.equal(last(state).proposal.exact, false);
  assert.match(last(state).text, /segundo botón/);
});

test('los extras se sugieren con su componente', () => {
  let state = startConversation();
  state = respond(state, { text: 'Con relés de 24 V, un cilindro de doble efecto sale mientras presiono un botón; que vaya lento y tenga paro de emergencia' });
  const reply = last(state);
  assert.equal(reply.proposal.templateId, 'electro-directo');
  assert.deepEqual(reply.actions.filter((a) => a.action === 'chat-extra').map((a) => a.type), ['reguladora', 'paro-emergencia']);
});

test('una conversación guardada dañada vuelve a empezar', () => {
  assert.equal(normalizeConversation(null).messages.length, 1);
  assert.equal(normalizeConversation({ messages: [{ from: 'hacker', text: 1 }] }).messages.length, 1);
  const state = respond(startConversation(), { text: 'un LED con un botón' });
  const copy = normalizeConversation(JSON.parse(JSON.stringify(state)));
  assert.equal(copy.messages.length, state.messages.length);
  assert.match(userText(copy), /LED/);
});
