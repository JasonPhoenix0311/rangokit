// Atlas: el asistente de voz del laboratorio.
//
// Entiende comandos hablados o escritos, lee el estado del proyecto y de la simulación y da
// recomendaciones con un tono cercano. Todo sale de reglas sobre el proyecto y la simulación:
// no usa IA generativa, no inventa datos y dice cuándo no entendió.
//
// Sin DOM: la interfaz arma el contexto, ejecuta las acciones que devuelve parseCommand y se
// encarga del micrófono (SpeechRecognition) y de la voz (speechSynthesis).
import { CATALOG, definition, fold, param } from './catalog.js';
import { windAtHeight, fmtW } from './energia.js';

export const ATLAS = {
  name: 'Atlas',
  lang: 'es-MX',
  COOLDOWN: 45,      // s antes de repetir el mismo consejo
  BAT_LOW: 25,       // % de batería en que avisa
  LOW_TOWER: 12,     // m: una torre así de baja casi no aprovecha el viento
};

// ── Comandos ──
const STOP = new Set(['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'al', 'a', 'y', 'con', 'por', 'favor',
  'me', 'mi', 'te', 'que', 'en', 'para', 'otro', 'otra', 'nuevo', 'nueva', 'plano', 'proyecto', 'componente', 'porfa', 'atlas']);
const NUMBERS = {
  cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, mil: 1000,
};
// Otras formas de llamar a los componentes, para que se entiendan como se dicen en voz alta.
const SPOKEN = {
  aerogenerador: 'molino viento eolico eolica turbina',
  'rotor-eolico': 'aspas molino',
  'panel-solar': 'placa celda fotovoltaica',
  bateria: 'pila acumulador',
  'red-electrica': 'cfe luz',
  'foco-ca': 'foco bombilla',
  'carga-casa': 'casa hogar',
  'arduino-uno': 'arduino',
  'cilindro-se': 'piston',
  'cilindro-de': 'piston',
  'controlador-carga': 'controlador regulador mppt',
  'fuente-aire': 'aire compresor',
  'multiplicadora': 'engranes caja',
  'turbina-hidraulica': 'hidraulica pelton',
};
const ENV_WORDS = [
  { key: 'viento', re: /\b(viento|aire sopla)\b/, delta: 2, unit: 'm/s' },
  { key: 'sol', re: /\b(sol|radiacion|irradiancia|luz solar)\b/, delta: 200, unit: 'W/m²' },
  { key: 'rio', re: /\b(rio|caudal|corriente de agua)\b/, delta: 5, unit: 'L/s' },
];
const WIND_TYPES = new Set(['aerogenerador', 'rotor-eolico']);

const stem = (w) => w.replace(/(es|s)$/, '');
const words = (text) => text.split(/[^a-z0-9/]+/).filter(Boolean);

/** Texto hablado en minúsculas, sin acentos ni signos, y sin el nombre de Atlas al inicio. */
export function clean(text) {
  return fold(String(text ?? ''))
    .replace(/[¿?¡!.,;:«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(oye |hola )?atlas\b\s*/, '');
}

/** Primer número del texto, escrito con cifras o con palabras («treinta», «8,5»). */
export function numberIn(text) {
  const digits = text.match(/(\d+(?:[.,]\d+)?)/);
  if (digits) return Number(digits[1].replace(',', '.'));
  let total = null;
  for (const w of words(text)) {
    if (w in NUMBERS && !['un', 'una'].includes(w)) total = (total ?? 0) + NUMBERS[w];
    else if (total !== null && w !== 'y') break;
  }
  return total;
}

/** Componente del catálogo que mejor coincide con lo que se pidió, o null. */
export function matchComponent(text, system = 'todos') {
  const asked = words(text).filter((w) => !STOP.has(w) && w.length > 1).map(stem);
  if (!asked.length) return null;
  let best = null;
  for (const def of CATALOG) {
    const own = words(fold(`${def.name} ${SPOKEN[def.type] ?? ''}`)).map(stem);
    let score = 0;
    for (const w of asked) {
      if (own.includes(w)) score += 2;
      else if (w.length >= 4 && own.some((o) => o.startsWith(w) || (o.length >= 4 && w.startsWith(o)))) score += 1;
    }
    if (score < 2) continue;
    if (system !== 'todos' && def.systems.includes(system)) score += 0.5;
    if (!best || score > best.score || (score === best.score && def.name.length < best.def.name.length)) best = { def, score };
  }
  return best?.def ?? null;
}

/** Quita las etiquetas de componentes («WG1», «w g 1») para que su número no se confunda con un valor. */
function withoutLabels(text, project) {
  let out = text;
  for (const c of project?.components ?? []) {
    const chars = [...fold(c.label).replace(/\s+/g, '')].map((ch) => ch.replace(/[^a-z0-9]/g, '\\$&'));
    if (chars.length) out = out.replace(new RegExp(`\\b${chars.join('\\s*')}\\b`, 'g'), ' ');
  }
  return out;
}

/** Componente del proyecto que se nombra por su etiqueta («WG1», «w g 1», «s1»). */
export function componentIn(text, project) {
  const compact = text.replace(/\s+/g, '');
  const found = project.components
    .map((c) => ({ c, label: fold(c.label).replace(/\s+/g, '') }))
    .filter(({ label }) => label && compact.includes(label))
    .sort((a, b) => b.label.length - a.label.length);
  return found[0]?.c ?? null;
}

/**
 * Convierte lo que dijo el usuario en una acción para la interfaz.
 * Devuelve { action, ... } y, si no lo entiende, { action: 'unknown' }.
 */
export function parseCommand(input, project) {
  const t = clean(input);
  if (!t) return { action: 'unknown', text: t };
  const has = (re) => re.test(t);

  if (has(/^(silencio|callate|calla|deja de hablar|sin voz|apaga (la|tu) voz|mute)/)) return { action: 'mute' };
  if (has(/^(habla|activa (la|tu) voz|con voz|enciende (la|tu) voz)/)) return { action: 'unmute' };
  if (has(/^(ayuda|que puedes hacer|que (te )?puedo decir|comandos|que sabes hacer)/)) return { action: 'help' };

  // «Pon el viento a 8» o «pon la torre a 30» no son para agregar: los atiende la parte de ambiente.
  const value = numberIn(withoutLabels(t, project));
  const setting = (ENV_WORDS.some((e) => e.re.test(t)) || has(/\b(torre|altura|altitud)\b/))
    && (value !== null || has(/\b(sube|subir|baja|bajar|mas|menos|aumenta|disminuye)\b/));
  if (!setting && has(/^(agrega|agregame|anade|pon|ponme|coloca|inserta|mete|necesito un|necesito una|quiero un|quiero una)\b/)) {
    const rest = t.replace(/^(necesito|quiero)\s+/, '').replace(/^\S+\s*/, '');
    const def = matchComponent(rest, project?.system);
    if (def) return { action: 'add', type: def.type };
    if (words(t).length >= 5) return { action: 'rango', text: String(input).trim() };
    return { action: 'add-unknown', text: rest };
  }

  if (has(/^(hazlo (por mi|tu)|haz (el|este) paso|siguiente paso|paso siguiente|ayudame con (el|este) paso)/)) return { action: 'tutorial-do' };
  if (has(/^(repite|que sigue|que hago|que (debo|tengo que) hacer|en que paso|cual es el paso)/)) return { action: 'repeat' };

  if (has(/^(reinicia|reiniciar|empieza de nuevo la simulacion|vuelve a empezar)/)) return { action: 'restart' };
  if (has(/^(deten|detener|detente|para|parar|alto|stop|pausa|apaga la simulacion|termina la simulacion)\b/)) return { action: 'stop' };
  if (has(/^(ejecuta|ejecutar|corre|correr|arranca|arrancar|inicia|iniciar|empieza|simula|simular|prueba(lo)?|dale|play|enciende (la simulacion|el sistema))\b/)) return { action: 'run' };

  if (has(/\b(3d|3 d|tres d|tercera dimension|vista real|en 3d)\b/)) return { action: 'view', mode: '3d' };
  if (has(/\b(2d|2 d|dos d|esquema|diagrama|vista plana|el plano)\b/)) return { action: 'view', mode: '2d' };
  if (has(/^(ajusta|centra|encuadra|acomoda la vista)/)) return { action: 'fit' };

  // Altura de la torre o del panel, y altitud del sitio.
  if (has(/\baltitud\b/) && value !== null) return { action: 'param', key: 'altitud', value, target: componentIn(t, project)?.id ?? null };
  if (has(/\b(torre|altura|alto|eleva|levanta)\b/) && !has(/\baltitud\b/)) {
    const target = componentIn(t, project)?.id ?? null;
    if (value !== null) return { action: 'param', key: 'altura', value, target, tower: has(/\btorre\b/) };
    if (has(/\b(sube|subir|eleva|levanta|mas alt)/)) return { action: 'param', key: 'altura', delta: 10, target, tower: has(/\btorre\b/) };
    if (has(/\b(baja|bajar|mas baj)/)) return { action: 'param', key: 'altura', delta: -10, target, tower: has(/\btorre\b/) };
  }

  for (const e of ENV_WORDS) {
    if (!has(e.re)) continue;
    if (value !== null) return { action: 'env', key: e.key, value };
    if (has(/\b(sube|subir|aumenta|mas|fuerte)\b/)) return { action: 'env', key: e.key, delta: e.delta };
    if (has(/\b(baja|bajar|disminuye|menos|quita|debil)\b/)) return { action: 'env', key: e.key, delta: -e.delta };
  }

  if (has(/^(suelta|soltar|deja de presionar)/)) return { action: 'release' };
  if (has(/^(presiona|oprime|aprieta|acciona|pulsa|activa|enciende|apaga|cambia|mueve)\b/)) {
    const c = componentIn(t, project);
    return c ? { action: 'press', id: c.id } : { action: 'press-unknown' };
  }

  if (has(/^(revisa|revisalo|hay errores|que (esta mal|falla|falta)|por que no|porque no|que problema|encuentra (el|los) (error|errores|problema))/)) return { action: 'review' };
  if (has(/^(como va|como vamos|como esta|estado|resumen|cuanta energia|que pasa|dime el estado|reporte)/) || has(/\b(bateria|energia)\b.*\b(como|cuanta|cuanto)\b/)) return { action: 'status' };

  // Un problema descrito con palabras se lo pasa a Rango, que sabe proponer cómo armarlo.
  if (has(/^(quiero|necesito|como (hago|puedo|armo)|ayudame a|me gustaria|tengo que)\b/) || words(t).length >= 9) return { action: 'rango', text: String(input).trim() };
  return { action: 'unknown', text: t };
}

export const HELP = [
  '«Agrega un panel solar», «agrega una batería»',
  '«Ejecuta», «detén», «reinicia»',
  '«Sube el viento a 8», «sol a 1000», «más viento»',
  '«Torre a 30 metros», «altitud 2000»',
  '«Presiona S1», «suelta»',
  '«Vista 3D», «vista 2D», «ajusta»',
  '«¿Qué sigue?», «hazlo por mí» (tutoriales)',
  '«Revisa», «¿cómo va?»',
  '«Quiero regar mi jardín con energía solar» (se lo paso a Rango)',
  '«Silencio» o «habla»',
];

// ── Frases ──
const PRAISE = ['¡Muy bien!', '¡Eso es!', '¡Excelente!', '¡Bien hecho!', '¡Perfecto!'];
const CALM = ['Sin problema, tiene arreglo.', 'Es un detalle muy común.', 'Vamos a revisarlo juntos.'];
/** Frase que cambia según un contador, para que Atlas no repita siempre lo mismo. */
export const praise = (n = 0) => PRAISE[Math.abs(n) % PRAISE.length];
export const calm = (n = 0) => CALM[Math.abs(n) % CALM.length];

export function greet(project) {
  if (project.tutorial) return `Hola, soy ${ATLAS.name}. Te acompaño en este tutorial: te voy diciendo cada paso y te aviso cuando lo logres.`;
  if (!project.components.length) return `Hola, soy ${ATLAS.name}. Para empezar, dime por ejemplo «agrega un panel solar», o descríbeme lo que quieres construir.`;
  return `Hola, soy ${ATLAS.name}. Tu proyecto tiene ${project.components.length} componentes. Dime «revisa» y lo reviso contigo, o «ejecuta» para probarlo.`;
}

/** Lo que dice Atlas al iniciar la simulación. */
export function onRun(findings, n = 0) {
  const errors = findings.filter((f) => f.level === 'error');
  if (!errors.length) return `${praise(n)} Todo está bien conectado. Ya está en marcha; prueba los controles y mira cómo fluye la energía.`;
  return `Lo puse en marcha, pero ${errors.length === 1 ? 'hay un error' : `hay ${errors.length} errores`} en la revisión. ${calm(n)} El primero: ${errors[0].text}`;
}

/** Lo que dice Atlas al pedirle que revise el proyecto. */
export function reviewSpeech(findings, project, n = 0) {
  if (!project.components.length) return 'Todavía no hay nada en el plano. Dime qué componente agrego o abre un tutorial.';
  const errors = findings.filter((f) => f.level === 'error');
  const notes = findings.filter((f) => f.level !== 'error');
  if (!errors.length && !notes.length) return `${praise(n)} No encuentro ningún error. Dime «ejecuta» y lo probamos.`;
  if (!errors.length) return `No hay errores. Tengo ${notes.length === 1 ? 'una observación' : `${notes.length} observaciones`}; la más importante: ${notes[0].text}`;
  const fix = errors[0].suggest?.[0]?.text;
  return `${calm(n)} ${errors.length === 1 ? 'Encontré un error' : `Encontré ${errors.length} errores`}. ${errors[0].text}${fix ? ` Te sugiero: ${fix}` : ''}`;
}

/** Resumen del momento: energía, batería y lo que está pasando. */
export function statusSpeech(ctx) {
  const { project, sim } = ctx;
  if (!sim) return `El proyecto está detenido, con ${project.components.length} componentes. Dime «ejecuta» para ponerlo en marcha.`;
  const seconds = Math.round(sim.t);
  const parts = [`Lleva ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'} en marcha.`];
  if (sim.energy?.has) {
    const { now } = sim.energy;
    parts.push(`Se generan ${fmtW(now.gen)} y se consumen ${fmtW(now.consumo)}.`);
    for (const c of project.components.filter((x) => x.type === 'bateria')) {
      const part = sim.parts.get(c.id);
      parts.push(`${c.label} va en ${Math.round(part.soc)} % y está ${part.watts > 1 ? 'cargando' : part.watts < -1 ? 'entregando energía' : 'en reposo'}.`);
    }
    if (now.red > 1) parts.push(`Se toman ${fmtW(now.red)} de la red.`);
    if (now.red < -1) parts.push(`Se venden ${fmtW(-now.red)} a la red.`);
  }
  for (const c of project.components.filter((x) => x.type.startsWith('cilindro'))) {
    parts.push(`${c.label} está al ${Math.round(sim.parts.get(c.id).pos)} %.`);
  }
  return parts.join(' ');
}

/** Texto del paso de tutorial dicho en voz alta. */
export function stepSpeech(step, index, total, n = 0, advanced = false) {
  const lead = advanced ? `${praise(n)} ` : '';
  return `${lead}Paso ${index + 1} de ${total}: ${step.title}. ${step.body}`;
}

export const FINISHED = '¡Lo lograste! Terminaste el tutorial y comprobaste que el proyecto funciona. Ahora puedes cambiarlo a tu gusto.';

// ── Recomendaciones ──
/**
 * Consejos que aplican en este momento, de más a menos importantes.
 * ctx: { project, sim, findings }. Cada consejo: { id, text, level } (level: 'error' | 'aviso' | 'idea').
 */
export function advise(ctx) {
  const { project, sim, findings = [] } = ctx;
  const tips = [];
  const errors = findings.filter((f) => f.level === 'error');
  if (errors.length && !sim) {
    const f = errors[0];
    const fix = f.suggest?.[0]?.text;
    tips.push({ id: `err:${f.code}:${(f.where ?? []).join(',')}`, level: 'error', text: `Ojo, encontré algo: ${f.text}${fix ? ` ${fix}` : ''}` });
  }
  if (sim?.energy?.has) {
    const { now } = sim.energy;
    for (const c of project.components.filter((x) => x.type === 'bateria')) {
      const part = sim.parts.get(c.id);
      if (part.soc < ATLAS.BAT_LOW && part.watts < -1) {
        tips.push({ id: `bat-baja:${c.id}`, level: 'aviso', text: `${c.label} va en ${Math.round(part.soc)} % y se sigue descargando. Puedes agregar otro panel, subir la torre del aerogenerador o apagar alguna carga.` });
      }
      if (part.soc >= 99 && now.gen > now.consumo + 1 && !project.components.some((x) => x.type === 'red-electrica')) {
        tips.push({ id: `bat-llena:${c.id}`, level: 'idea', text: `${c.label} ya está llena y sobra energía que se está desperdiciando. Podrías conectar la red eléctrica para venderla o agregar otra carga útil, como una bomba de agua.` });
      }
    }
    if (now.consumo > 1 && now.red > now.consumo * 0.5) {
      tips.push({ id: 'red-alta', level: 'idea', text: `Más de la mitad de tu consumo viene de la red: ${fmtW(now.red)}. Con más paneles o una batería tu sistema sería más independiente.` });
    }
    for (const c of project.components.filter((x) => WIND_TYPES.has(x.type))) {
      const h = param(c, 'altura');
      if (h > ATLAS.LOW_TOWER || sim.env.viento <= 0) continue;
      const alpha = param(c, 'terreno');
      const v = windAtHeight(sim.env.viento, h, alpha);
      const v30 = windAtHeight(sim.env.viento, 30, alpha);
      tips.push({ id: `torre:${c.id}`, level: 'idea', text: `Un consejo: ${c.label} está a ${h} m. A 30 m el viento pasaría de ${v.toFixed(1)} a ${v30.toFixed(1)} m/s, y como la potencia crece con el cubo del viento, daría unas ${((v30 / v) ** 3).toFixed(1)} veces más energía. Di «torre a 30».` });
    }
  }
  return tips;
}

/**
 * Elige el consejo que conviene decir ahora: el primero que no se haya dicho hace poco.
 * memory es un Map id → segundo en que se dijo; se actualiza con el elegido.
 */
export function pickTip(tips, memory, now, cooldown = ATLAS.COOLDOWN) {
  const tip = tips.find((t) => !memory.has(t.id) || now - memory.get(t.id) >= cooldown);
  if (tip) memory.set(tip.id, now);
  return tip ?? null;
}

// ── Voz ──
/** Adapta un texto para que la voz lo lea bien: unidades, flechas y signos. */
export function speakable(text) {
  return String(text)
    .replace(/[«»"“”▶■↺]/g, '')
    .replace(/→/g, ' a ')
    .replace(/≈/g, 'aproximadamente ')
    .replace(/W\/m²/g, 'watts por metro cuadrado')
    .replace(/(\d)\s?m\/s\b/g, '$1 metros por segundo')
    .replace(/(\d)\s?kWh\b/g, '$1 kilowatts hora')
    .replace(/(\d)\s?Wh\b/g, '$1 watts hora')
    .replace(/(\d)\s?kW\b/g, '$1 kilowatts')
    .replace(/(\d)\s?W\b/g, '$1 watts')
    .replace(/(\d)\s?V\b/g, '$1 volts')
    .replace(/(\d)\s?L\/s\b/g, '$1 litros por segundo')
    .replace(/(\d)\s?msnm\b/g, '$1 metros sobre el nivel del mar')
    .replace(/(\d)\s?m\b/g, '$1 metros')
    .replace(/(\d)\s?s\b/g, '$1 segundos')
    .replace(/\s?%/g, ' por ciento')
    .replace(/(\d)\s?°/g, '$1 grados')
    .replace(/\bCD\b/g, 'C D')
    .replace(/\bCA\b/g, 'C A')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mejor voz en español disponible: primero de México, luego de Latinoamérica, luego cualquiera. */
export function chooseVoice(voices) {
  const es = voices.filter((v) => /^es/i.test(v.lang));
  const rank = (v) => (/es[-_]MX/i.test(v.lang) ? 0 : /es[-_](US|419|CO|AR|CL|PE)/i.test(v.lang) ? 1 : 2) - (/(natural|online|neural)/i.test(v.name) ? 0.5 : 0);
  return [...es].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** Nombre del componente en minúsculas, para frases como «Agregué WG1, aerogenerador pequeño». */
export const nameOf = (type) => definition(type).name.charAt(0).toLowerCase() + definition(type).name.slice(1);

/** Nombre corto para decirlo en voz alta, sin lo que va entre paréntesis. */
export const spokenName = (type) => nameOf(type).replace(/\s*\(.*?\)\s*/g, ' ').trim();

const ENV_SPOKEN = { viento: 'viento', sol: 'sol', rio: 'río' };
/** Frase que se le puede decir a Atlas para hacer un paso de tutorial, o '' si ese paso no se hace por voz. */
export function voiceHint(step) {
  switch (step.kind) {
    case 'add': return `agrega ${spokenName(step.type)}`;
    case 'run': return 'ejecuta';
    case 'review': return 'revisa';
    case '3d': return 'vista 3D';
    case 'env': return typeof step.value === 'number' && ENV_SPOKEN[step.key] ? `${ENV_SPOKEN[step.key]} a ${step.value}` : '';
    case 'config': return step.key === 'altura' ? `torre a ${step.value}` : step.key === 'altitud' ? `altitud ${step.value}` : '';
    default: return '';
  }
}
