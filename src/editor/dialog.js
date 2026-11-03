// Conversación guiada con Rango. El estudiante explica su problema con sus palabras y Rango pregunta
// solo lo que le falta para definir el proyecto. Todo corre en el navegador, sin IA generativa:
// Rango extrae datos del texto con patrones, usa el clasificador para orientarse y redacta sus
// respuestas con frases preparadas. Si no entiende algo o no tiene un ejemplo, lo dice.
import { definition, fold } from './catalog.js';
import { TEMPLATES, buildTemplate, matchProblem } from './rango.js';

// Datos que Rango necesita para proponer un proyecto.
export const SLOTS = ['actuator', 'cylType', 'trigger', 'release', 'tech'];

const SAY = {
  actuator: { cilindro: 'mover un cilindro neumático', luz: 'encender un LED o una luz' },
  cylType: { se: 'el cilindro es de simple efecto (regresa por resorte)', de: 'el cilindro es de doble efecto (usa aire para salir y para regresar)' },
  trigger: { boton: 'lo activa un botón', palanca: 'lo acciona una palanca manual', potenciometro: 'lo decide la lectura de un potenciómetro' },
  release: {
    soltar: 'se desactiva al soltar el botón',
    final: 'regresa solo al llegar al final de su carrera',
    paro: 'se mantiene activo hasta que presiones un botón de paro',
    umbral: 'se activa cuando la lectura pasa de un valor',
    palanca: 'regresa cuando regresas la palanca',
  },
  tech: { neumatica: 'lo haces solo con neumática', electro24: 'lo controlas con relés y 24 V', arduino: 'lo controlas con Arduino' },
};

const ASK = {
  actuator: {
    text: '¿Qué tiene que moverse o encenderse?',
    chips: [['cilindro', 'Un cilindro neumático'], ['luz', 'Un LED o una luz'], ['nose', 'No estoy seguro']],
    help: 'En estas prácticas casi siempre se mueve un cilindro (empuja, sujeta, abre o expulsa algo) o se enciende un indicador. Si tu enunciado habla de mover una pieza, es un cilindro.',
  },
  cylType: {
    text: '¿El cilindro regresa solo por su resorte o necesita aire también para regresar?',
    chips: [['se', 'Regresa por resorte (simple efecto)'], ['de', 'Aire para salir y regresar (doble efecto)'], ['nose', 'No sé']],
    help: 'Si el dibujo del cilindro tiene un resorte o el enunciado dice "retorno por muelle", es de simple efecto y tiene una sola entrada de aire. Si tiene dos entradas, es de doble efecto. En la mayoría de las prácticas se usa el de doble efecto.',
  },
  trigger: {
    text: '¿Qué lo activa?',
    chips: [['boton', 'Un botón o pulsador'], ['palanca', 'Una palanca manual'], ['potenciometro', 'Un potenciómetro (perilla)'], ['nose', 'No sé']],
    help: 'Un botón (pulsador) solo actúa mientras lo presionas. Una palanca se queda en la posición donde la dejas. Un potenciómetro es una perilla que da un valor, y se usa con Arduino.',
  },
  release: {
    text: '¿Cuándo debe regresar o apagarse?',
    chips: [['soltar', 'Al soltar el botón'], ['final', 'Solo, al llegar al final de su carrera'], ['paro', 'Cuando presione otro botón (paro)'], ['nose', 'No sé']],
    help: 'Si regresa al soltar, es un mando directo. Si regresa solo al llegar al final, necesitas un final de carrera o un sensor. Si debe quedarse afuera aunque sueltes, necesitas una memoria (enclavamiento) y un botón de paro.',
  },
  tech: {
    text: '¿Con qué lo vas a controlar?',
    chips: [['neumatica', 'Solo neumática'], ['electro24', 'Relés y 24 V'], ['arduino', 'Arduino'], ['nose', '¿Cuál me recomiendas?']],
    help: 'Solo neumática: válvulas manuales, sin electricidad; es lo más simple. Relés y 24 V: electroválvulas y relés, como en la industria. Arduino: un programa decide, y necesitas un módulo de relé para mover válvulas de 24 V. Si tu materia es de electroneumática, usa relés; si es de microcontroladores, Arduino.',
  },
};

const re = (pattern) => new RegExp(pattern);
const PATTERNS = {
  cylSe: re('simple efecto|retorno por (resorte|muelle)|por (su )?(resorte|muelle)|regresa por resorte'),
  cylDe: re('doble efecto'),
  cylinder: re('cilindro|piston|vastago|embolo|prensa|empuj|actuador neumatico|sujet|expuls|estampa'),
  light: re('\\bled\\b|\\bleds\\b|foco|\\bluz\\b|lampara|bombilla'),
  button: re('\\bboton|\\bbotones\\b|pulsador|\\bpulsar\\b|\\bpulse\\b|presion|oprim|aprie'),
  lever: re('palanca|manija|maneral'),
  pot: re('potenciometro|perilla|analogic'),
  // En orden: de lo más específico a lo más general. "Aunque se suelte" es memoria, no "al soltar".
  release: {
    paro: re('\\bparo\\b(?! de emergencia)|otro boton|segundo boton|se mantenga|se mantiene|se quede|enclav|memoria|autorreten|retencion|aunque (se )?suelt'),
    final: re('final de carrera|fin de carrera|al final|llegue al final|llega al final|regres\\w* solo|automatic|sensor|tope'),
    umbral: re('umbral|mitad|supere|pase de|mayor (que|a)|cierto valor|un valor'),
    soltar: re('mientras|al soltar|lo suelt|suelte|deje de presionar|deja de presionar'),
  },
  arduino: re('arduino|microcontrolador|programa|codigo|sketch'),
  electro: re('\\brele|\\b24 ?v|electrovalvula|solenoide|bobina|electroneumat|electric'),
  pneumaticOnly: re('neumatica pura|solo (con )?(aire|neumatica)|sin (electricidad|corriente|arduino)|valvula (manual|de boton|de palanca)'),
  dontKnow: re('no se\\b|no estoy segur|ni idea|recomiend|no entiendo|cual (es|uso)|que me sugieres'),
  extras: {
    velocidad: re('velocidad|lento|despacio|suave|regul'),
    emergencia: re('emergencia|seguridad'),
    indicador: re('indicador|piloto|avis|senaliz'),
  },
};

/** Extrae del texto los datos que se puedan reconocer. Lo que no aparece queda sin definir. */
export function extractSlots(text) {
  const t = ` ${fold(text ?? '')} `;
  const slots = {};
  if (PATTERNS.cylSe.test(t)) Object.assign(slots, { actuator: 'cilindro', cylType: 'se' });
  else if (PATTERNS.cylDe.test(t)) Object.assign(slots, { actuator: 'cilindro', cylType: 'de' });
  else if (PATTERNS.cylinder.test(t)) slots.actuator = 'cilindro';
  else if (PATTERNS.light.test(t)) slots.actuator = 'luz';
  if (PATTERNS.pot.test(t)) slots.trigger = 'potenciometro';
  else if (PATTERNS.lever.test(t)) slots.trigger = 'palanca';
  else if (PATTERNS.button.test(t)) slots.trigger = 'boton';
  for (const [value, pattern] of Object.entries(PATTERNS.release)) {
    if (pattern.test(t)) {
      slots.release = value;
      break;
    }
  }
  if (PATTERNS.arduino.test(t)) slots.tech = 'arduino';
  else if (PATTERNS.electro.test(t)) slots.tech = 'electro24';
  else if (PATTERNS.pneumaticOnly.test(t)) slots.tech = 'neumatica';
  const extras = Object.entries(PATTERNS.extras).filter(([, pattern]) => pattern.test(t)).map(([name]) => name);
  if (extras.length) slots.extras = extras;
  return slots;
}

/** Completa datos que se deducen de otros: una palanca implica neumática y su propio regreso, etc. */
function infer(slots) {
  const s = { ...slots };
  if (s.trigger === 'palanca') {
    s.release = 'palanca';
    s.tech ??= 'neumatica';
  }
  if (s.trigger === 'potenciometro') {
    s.release = 'umbral';
    s.tech = 'arduino';
  }
  if (s.actuator === 'luz') s.tech ??= 'arduino';
  return s;
}

function nextMissing(slots) {
  for (const slot of SLOTS) {
    if (slot === 'cylType' && slots.actuator !== 'cilindro') continue;
    if (!slots[slot]) return slot;
  }
  return null;
}

/** Elige el ejemplo que corresponde a lo que pidió el estudiante y explica en qué difiere. */
export function proposal(slots) {
  const s = infer(slots);
  const cyl = s.actuator === 'cilindro';
  const out = { templateId: null, exact: false, practice: false, differences: [], extras: [] };
  const use = (id, ...differences) => Object.assign(out, { templateId: id, exact: differences.length === 0, differences });
  if (cyl && s.tech === 'neumatica') {
    if (s.trigger === 'palanca') use('cilindro-de-palanca', ...(s.cylType === 'se' ? ['Con un cilindro de simple efecto basta una válvula 3/2: la 5/2 del ejemplo usa sus dos salidas.'] : []));
    else if (s.trigger === 'boton' && s.release === 'soltar') {
      if (s.cylType === 'se') use('cilindro-se-boton');
      else use('cilindro-de-palanca', 'Tú quieres un botón que regrese al soltar: usa una válvula 5/2 con botón y resorte. El catálogo aún no la tiene, así que el ejemplo usa la de palanca, que se mueve igual pero se queda donde la dejas.');
    }
  } else if (cyl && s.tech === 'electro24' && s.trigger === 'boton') {
    if (s.release === 'soltar') use('electro-directo', ...(s.cylType === 'se' ? ['Con simple efecto usa la válvula 3/2 con solenoide en lugar de la 5/2.'] : []));
    if (s.release === 'paro') use('enclavamiento-rele', ...(s.cylType === 'se' ? ['Con simple efecto usa la válvula 3/2 con solenoide en lugar de la 5/2.'] : []));
    if (s.release === 'final') out.practice = true;
  } else if (cyl && s.tech === 'arduino') {
    if (s.trigger === 'boton' && s.release === 'final') use('arduino-cilindro');
    if (s.trigger === 'boton' && s.release === 'paro') use('arduino-cilindro', 'Cambia el final de carrera S2 por un pulsador de paro. Las reglas son las mismas: S1 enciende K1 y S2 la apaga.');
    if (s.trigger === 'boton' && s.release === 'soltar') use('arduino-cilindro', 'No necesitas el final de carrera ni la memoria: usa una sola regla, "si S1 está activa → K1 sigue la condición".');
    if (s.trigger === 'potenciometro') use('arduino-potenciometro', 'Cambia el LED por un módulo de relé que mande la electroválvula del cilindro, como en el ejemplo del cilindro con Arduino.');
  } else if (s.actuator === 'luz') {
    if (s.trigger === 'boton' && s.release === 'soltar') use('arduino-led-boton');
    if (s.trigger === 'boton' && s.release === 'paro') use('arduino-led-boton', 'Agrega un segundo botón y usa dos reglas: "S1 activa → encender H1" y "S2 activa → apagar H1".');
    if (s.trigger === 'potenciometro') use('arduino-potenciometro');
    if (s.tech !== 'arduino' && out.templateId) out.differences.push('Con 24 V usa una lámpara piloto en lugar del LED, y un pulsador directo a la lámpara.');
  }
  if (cyl && s.tech === 'neumatica' && s.release === 'final') {
    out.noTemplate = 'En neumática pura el regreso automático se hace con una válvula 5/2 pilotada y una válvula 3/2 con rodillo al final de la carrera. El catálogo todavía no tiene válvulas pilotadas, así que no puedo armártelo así. Sí puedo hacerlo con relés de 24 V (es la Práctica guiada 01) o con Arduino.';
  }
  const extras = s.extras ?? [];
  if (extras.includes('velocidad') && cyl) out.extras.push({ type: 'reguladora', text: 'Para controlar la velocidad, pon una reguladora de caudal en la manguera que llega a la cámara.' });
  if (extras.includes('emergencia') && s.tech !== 'neumatica') out.extras.push({ type: 'paro-emergencia', text: 'Para el paro de emergencia, pon su contacto NC en serie al inicio del mando, antes de todo lo demás.' });
  if (extras.includes('indicador')) out.extras.push(s.tech === 'arduino'
    ? { type: 'led', text: 'Para el indicador, un LED con resistencia en un pin libre y una regla que lo encienda.' }
    : { type: 'lampara', text: 'Para el indicador, una lámpara piloto de 24 V en paralelo con la bobina que quieres señalar.' });
  return out;
}

function summary(slots) {
  const s = infer(slots);
  const lines = [];
  if (s.actuator === 'cilindro' && s.cylType) lines.push(`mover un cilindro de ${s.cylType === 'se' ? 'simple efecto, que regresa por resorte' : 'doble efecto, que usa aire para salir y para regresar'}`);
  else if (s.actuator) lines.push(SAY.actuator[s.actuator]);
  for (const slot of ['trigger', 'release', 'tech']) if (s[slot] && SAY[slot][s[slot]]) lines.push(SAY[slot][s[slot]]);
  return lines;
}

/** Nombre de un componente dentro de una frase: "válvula 5/2…", sin cambiar siglas como NC o LED. */
const inSentence = (name) => name.charAt(0).toLowerCase() + name.slice(1);

function askMessage(slot, intro = '') {
  const ask = ASK[slot];
  return { from: 'rango', text: `${intro}${ask.text}`, chips: ask.chips.map(([value, label]) => ({ slot, value, label })) };
}

const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

function proposalMessages(slots, userText, learned) {
  const s = infer(slots);
  const p = proposal(s);
  const lines = [`Ya entendí tu proyecto: ${list(summary(s))}.`];
  const actions = [];
  if (p.templateId) {
    const template = TEMPLATES.find((t) => t.id === p.templateId);
    const example = buildTemplate(p.templateId);
    const counts = new Map();
    for (const c of example.components) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    const parts = [...counts].map(([type, n]) => `${n > 1 ? `${n} × ` : ''}${inSentence(definition(type).name)}`);
    lines.push(p.exact ? `Es justo el caso «${template.title}».` : `Lo más cercano que conozco es «${template.title}», con un cambio.`);
    lines.push(`Vas a necesitar: ${list(parts)}.`);
    for (const d of p.differences) lines.push(`Cambio: ${d}`);
    actions.push(
      { action: 'chat-hint', label: 'Dame una pista', id: p.templateId },
      { action: 'chat-build', label: 'Agregar los componentes', id: p.templateId },
      { action: 'chat-example', label: 'Abrir el ejemplo armado', id: p.templateId },
      { action: 'chat-web', label: 'Buscar proyectos parecidos', id: p.templateId },
    );
  } else if (p.practice) {
    lines.push('Eso es justo lo que resuelve la Práctica guiada 01: el cilindro sale con S1, un relé lo mantiene y el sensor S2 lo regresa solo al final de la carrera.');
    actions.push({ action: 'chat-practice', label: 'Abrir la práctica guiada' }, { action: 'chat-change', label: 'Prefiero hacerlo con Arduino', slot: 'tech', value: 'arduino' });
  } else {
    lines.push(p.noTemplate ?? 'Todavía no tengo un ejemplo para esa combinación y no quiero inventarte uno.');
    const guess = matchProblem(userText, learned);
    const near = guess?.best?.template ?? guess?.alternatives?.[0]?.template;
    if (near) {
      lines.push(`Lo más parecido que conozco es «${near.title}». Puedes partir de ahí y adaptarlo.`);
      actions.push({ action: 'chat-example', label: `Ver «${near.title}»`, id: near.id });
    }
    if (p.noTemplate) actions.push({ action: 'chat-change', label: 'Hacerlo con relés de 24 V', slot: 'tech', value: 'electro24' }, { action: 'chat-change', label: 'Hacerlo con Arduino', slot: 'tech', value: 'arduino' });
  }
  for (const extra of p.extras) {
    lines.push(`Extra: ${extra.text}`);
    actions.push({ action: 'chat-extra', label: `Agregar ${inSentence(definition(extra.type).name)}`, type: extra.type });
  }
  if (p.templateId || p.practice) lines.push('¿Cómo quieres seguir? También puedes escribirme si quieres cambiar algo.');
  return [{ from: 'rango', text: lines.join('\n'), actions, proposal: p }];
}

export function startConversation() {
  return {
    slots: {},
    asked: null,
    retries: 0,
    done: false,
    messages: [{
      from: 'rango',
      text: 'Hola, soy Rango. Cuéntame con tus palabras qué tiene que hacer tu sistema, como lo dice tu tarea. Te voy a preguntar solo lo que me falte para armarlo contigo.',
    }],
  };
}

/** Texto de todo lo que escribió el estudiante, para el clasificador y para Rango. */
export const userText = (state) => state.messages.filter((m) => m.from === 'user').map((m) => m.text).join('\n');

/**
 * Responde a un mensaje del estudiante: texto libre o una respuesta rápida { slot, value }.
 * Devuelve un estado nuevo con el mensaje del estudiante y la respuesta de Rango.
 */
export function respond(state, input, { learned = [] } = {}) {
  const s = { ...state, slots: { ...state.slots }, messages: [...state.messages] };
  const text = String(input.text ?? input.label ?? '').trim();
  if (!text && !input.value) return state;
  s.messages.push({ from: 'user', text: text || String(input.value) });
  const before = summary(s.slots);

  // ¿No sabe? Explica las opciones de lo que se preguntó.
  if (input.value === 'nose' || (!input.value && s.asked && PATTERNS.dontKnow.test(fold(text)) && !Object.keys(extractSlots(text)).length)) {
    const slot = s.asked ?? nextMissing(s.slots) ?? 'actuator';
    const ask = askMessage(slot, `${ASK[slot].help}\n\n`);
    ask.chips = ask.chips.filter((chip) => chip.value !== 'nose');
    s.messages.push(ask);
    s.asked = slot;
    return s;
  }

  const found = input.value ? { [input.slot]: input.value } : extractSlots(text);
  if (input.value && input.slot === 'actuator' && input.value === 'luz') delete s.slots.cylType;
  const extras = [...new Set([...(s.slots.extras ?? []), ...(found.extras ?? [])])];
  Object.assign(s.slots, found);
  if (extras.length) s.slots.extras = extras;
  if (found.trigger && found.trigger !== 'palanca' && s.slots.release === 'palanca') delete s.slots.release;
  const after = summary(s.slots);
  const learnedNow = after.filter((line) => !before.includes(line));

  const intro = [];
  const firstUserMessage = s.messages.filter((m) => m.from === 'user').length === 1;
  if (firstUserMessage && !input.value) {
    const guess = matchProblem(text, learned);
    if (guess?.recognized) intro.push(`Por lo que escribes, se parece a «${guess.best.template.title}» (${Math.round(guess.best.confidence * 100)} % de seguridad). Déjame confirmarlo.`);
  }
  if (learnedNow.length) intro.push(`Entendido: ${list(learnedNow)}.`);

  const missing = nextMissing(infer(s.slots));
  if (!learnedNow.length && !input.value) {
    s.retries = (s.retries ?? 0) + 1;
    if (state.done) {
      s.messages.push({ from: 'rango', text: 'No encontré nada que cambiar en lo que escribiste. Puedo ayudarte a definir qué se mueve, qué lo activa, cuándo regresa y con qué lo controlas. Si quieres empezar otro proyecto, usa "Empezar de nuevo".' });
      return s;
    }
    intro.push(s.retries > 1
      ? 'Sigo sin entenderte del todo. Elige una de estas opciones y seguimos.'
      : 'No te entendí del todo. Te pregunto de otra forma.');
  } else {
    s.retries = 0;
  }

  if (missing) {
    s.asked = missing;
    s.done = false;
    s.messages.push(askMessage(missing, intro.length ? `${intro.join('\n')}\n\n` : ''));
    return s;
  }
  s.asked = null;
  s.done = true;
  const messages = proposalMessages(s.slots, userText(s), learned);
  if (intro.length) messages[0].text = `${intro.join('\n')}\n\n${messages[0].text}`;
  s.messages.push(...messages);
  return s;
}

/** Agrega un mensaje de Rango, por ejemplo la pista de un ejemplo. */
export function say(state, text, extra = {}) {
  return { ...state, messages: [...state.messages, { from: 'rango', text, ...extra }] };
}

/** Revisa un estado guardado; si está dañado, empieza de nuevo. */
export function normalizeConversation(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.messages) || !data.messages.length) return startConversation();
  const messages = data.messages.filter((m) => m && (m.from === 'rango' || m.from === 'user') && typeof m.text === 'string').slice(-80);
  if (!messages.length) return startConversation();
  const slots = typeof data.slots === 'object' && data.slots ? data.slots : {};
  return { slots, asked: SLOTS.includes(data.asked) ? data.asked : null, retries: Number(data.retries) || 0, done: Boolean(data.done), messages };
}
