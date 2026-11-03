// Modelo de un proyecto libre: componentes colocados y conexiones entre sus puertos.
// Son funciones puras sobre objetos simples, para poder guardarlos como JSON y probarlos sin navegador.
import { reach } from '../engine.js';
import { definition, portOf, ledColor, ROTATIONS } from './catalog.js';
import { ledResistor, ledCurrent, formatOhms, PIN_MAX_MA } from './calc.js';

export const PROJECT_VERSION = 1;

const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function createProject({ name = 'Proyecto sin nombre', system = 'todos', id = newId('p') } = {}) {
  const now = new Date().toISOString();
  return { version: PROJECT_VERSION, id, name, system, problem: '', chat: null, created: now, updated: now, components: [], links: [] };
}

/** Siguiente etiqueta libre para un tipo: S1, S2… o 1A, 2A… según la norma de cada componente. */
export function nextLabel(project, type) {
  const def = definition(type);
  const used = new Set(project.components.map((c) => c.label));
  for (let n = 1; ; n += 1) {
    const label = def.numberFirst ? `${n}${def.prefix}` : `${def.prefix}${n}`;
    if (!used.has(label)) return label;
  }
}

export function addComponent(project, type, x = 40, y = 40) {
  const def = definition(type);
  let n = project.components.length + 1;
  while (project.components.some((c) => c.id === `c${n}`)) n += 1;
  const component = { id: `c${n}`, type, label: nextLabel(project, type), x: Math.round(x), y: Math.round(y), rot: 0, config: {} };
  if (def.board) component.config = { pins: {}, rules: [] };
  if (def.value) component.config[def.value.key] = def.value.default;
  if (def.colorable) component.config.color = 'rojo';
  project.components.push(component);
  return component;
}

export function removeComponent(project, id) {
  project.components = project.components.filter((c) => c.id !== id);
  project.links = project.links.filter((l) => l.a.c !== id && l.b.c !== id);
}

export const keyOf = (end) => `${end.c}:${end.p}`;

function portAt(project, end) {
  const component = project.components.find((c) => c.id === end.c);
  if (!component) return null;
  const port = portOf(component.type, end.p);
  return port ? { component, port } : null;
}

/** Conecta dos puertos. Devuelve { ok, link } o { ok: false, error } con el motivo en español. */
export function connect(project, a, b) {
  const pa = portAt(project, a);
  const pb = portAt(project, b);
  if (!pa || !pb) return { ok: false, error: 'Uno de los puertos ya no existe.' };
  if (keyOf(a) === keyOf(b)) return { ok: false, error: 'No puedes conectar un puerto consigo mismo.' };
  if (pa.port.kind !== pb.port.kind) {
    return { ok: false, error: 'Un cable no se conecta a una manguera. Une puertos eléctricos entre sí o neumáticos entre sí.' };
  }
  const exists = project.links.some((l) =>
    (keyOf(l.a) === keyOf(a) && keyOf(l.b) === keyOf(b)) || (keyOf(l.a) === keyOf(b) && keyOf(l.b) === keyOf(a)));
  if (exists) return { ok: false, error: 'Esos puertos ya están conectados.' };
  let n = project.links.length + 1;
  while (project.links.some((l) => l.id === `w${n}`)) n += 1;
  const link = { id: `w${n}`, kind: pa.port.kind, a: { ...a }, b: { ...b } };
  project.links.push(link);
  return { ok: true, link };
}

export function removeLink(project, id) {
  project.links = project.links.filter((l) => l.id !== id);
}

/**
 * Redes eléctricas o neumáticas: grupos de puertos unidos por cables o mangueras.
 * Usa el mismo recorrido del motor que la práctica guiada.
 */
export function nets(project, kind = 'elec') {
  const edges = project.links.filter((l) => l.kind === kind).map((l) => ({ id: l.id, a: keyOf(l.a), b: keyOf(l.b) }));
  const nodes = [];
  for (const component of project.components) {
    for (const port of definition(component.type).ports) {
      if (port.kind === kind) nodes.push(keyOf({ c: component.id, p: port.id }));
    }
  }
  const seen = new Set();
  const groups = [];
  for (const node of nodes) {
    if (seen.has(node)) continue;
    const group = reach(edges, () => true, node);
    group.forEach((member) => seen.add(member));
    groups.push(group);
  }
  return groups;
}

/** Red a la que pertenece un puerto. */
export function netOf(groups, end) {
  const key = keyOf(end);
  return groups.find((group) => group.has(key)) ?? new Set([key]);
}

/** Puertos de una red con su componente y su definición. */
export function members(project, group) {
  return [...group].map((key) => {
    const [c, p] = key.split(':');
    const component = project.components.find((item) => item.id === c);
    return { component, port: portOf(component.type, p) };
  });
}

const names = (list) => [...new Set(list.map(({ component, port }) => `${component.label}:${port.label}`))].join(', ');

/**
 * Revisión general del proyecto. Cada hallazgo sale de una regla verificable sobre las conexiones.
 * No simula el circuito: solo detecta errores de cableado que se pueden comprobar sin simular.
 */
export function reviewWiring(project) {
  const findings = [];
  for (const group of nets(project, 'elec')) {
    const list = members(project, group);
    const has = (fn) => list.filter(fn);
    const high = has(({ port }) => port.domain === '24v');
    const low = has(({ port }) => port.domain === '5v' || port.domain === 'pin');
    if (high.length && low.length) {
      // Si el lado de 24 V entrega una señal, hace falta un optoacoplador; si es una carga, un relé.
      const reading = high.some(({ port }) => port.emits);
      findings.push({
        level: 'error',
        code: 'mezcla-24v-5v',
        text: `Una misma red une bornes de 24 V con bornes de 5 V: ${names([...high, ...low])}. Eso daña el Arduino o el módulo.`,
        where: [...new Set([...high, ...low].map(({ component }) => component.id))],
        suggest: [reading
          ? { type: 'optoacoplador', text: 'Para leer una señal de 24 V con el Arduino, pásala por un optoacoplador: IN+ a la señal, IN− a 0 V y OUT al pin.' }
          : { type: 'modulo-rele', text: 'Para mover una carga de 24 V desde el Arduino, usa un módulo de relé: el pin va a IN y el contacto COM-NO conmuta los 24 V.' }],
      });
    }
    const plus = has(({ port }) => port.role === 'supply+');
    const ground = has(({ port }) => port.role === 'gnd');
    if (plus.length && ground.length) {
      findings.push({
        level: 'error',
        code: 'cortocircuito',
        text: `Cortocircuito: el positivo y el negativo de una fuente quedan unidos sin carga entre ellos (${names([...plus, ...ground])}).`,
        where: [...new Set([...plus, ...ground].map(({ component }) => component.id))],
      });
    }
  }

  findings.push(...reviewLeds(project));

  const airNets = nets(project, 'air');
  for (const component of project.components) {
    const def = definition(component.type);
    const open = def.ports.filter((port) => port.kind === 'air' && port.required
      && netOf(airNets, { c: component.id, p: port.id }).size === 1);
    if (open.length) {
      findings.push({
        level: 'aviso',
        code: 'puerto-neumatico-libre',
        text: `${component.label} tiene puertos neumáticos sin conectar: ${open.map((port) => port.label).join(', ')}.`,
        where: [component.id],
      });
    }
  }
  return findings;
}

/** Tensión que alimenta una red, si se puede saber sin simular: 24 V, 5 V o null. */
export function netVolts(list) {
  if (list.some(({ port }) => port.role === 'supply+' && port.domain === '24v')) return 24;
  if (list.some(({ port }) => (port.role === 'supply+' && port.domain === '5v') || port.pin)) return 5;
  return null;
}

/** Reglas de LED: sin resistencia se quema; con resistencia mal elegida brilla poco o pide demasiada corriente. */
function reviewLeds(project) {
  const findings = [];
  const groups = nets(project, 'elec');
  for (const led of project.components) {
    const anode = definition(led.type).ports.find((port) => port.bareLed);
    if (!anode) continue;
    const color = ledColor(led.config.color);
    const vf = color.vf;
    const tag = `${led.label} (${color.label.toLowerCase()}, ${vf} V)`;
    const list = members(project, netOf(groups, { c: led.id, p: anode.id })).filter(({ component }) => component.id !== led.id);
    const direct = netVolts(list);
    if (direct) {
      const calc = ledResistor(direct, { vf });
      findings.push({
        level: 'error',
        code: 'led-sin-resistencia',
        text: `${tag} recibe ${direct} V sin resistencia. La corriente solo la limita el ${direct === 5 ? 'pin' : 'circuito'} y el LED se quema.`,
        where: [led.id],
        suggest: [{ type: 'resistencia', ohms: calc.value,
          text: `Pon una resistencia de ${formatOhms(calc.value)} (${calc.rating}) entre la fuente y el ánodo: (${direct} V − ${vf} V) ÷ 15 mA = ${Math.round(calc.exact)} Ω, y el valor comercial siguiente es ${formatOhms(calc.value)}.` }],
      });
      continue;
    }
    for (const { component, port } of list.filter((item) => item.port.passive === 'r')) {
      const far = members(project, netOf(groups, { c: component.id, p: port.pair }));
      const volts = netVolts(far);
      if (!volts) continue;
      const ohms = Number(component.config.ohms);
      const current = ledCurrent(volts, ohms, vf);
      const limit = far.some((item) => item.port.pin) ? PIN_MAX_MA : 20;
      const calc = ledResistor(volts, { vf });
      if (current > limit) {
        findings.push({
          level: 'error',
          code: 'resistencia-baja',
          text: `Con ${component.label} de ${formatOhms(ohms)}, por ${led.label} pasan ${Math.round(current)} mA. El máximo seguro es ${limit} mA.`,
          where: [led.id, component.id],
          suggest: [{ type: 'resistencia', ohms: calc.value, text: `Cambia ${component.label} por ${formatOhms(calc.value)} (${calc.rating}): deja unos ${Math.round(calc.current)} mA.` }],
        });
      } else if (current < 2) {
        findings.push({
          level: 'aviso',
          code: 'led-tenue',
          text: `Con ${component.label} de ${formatOhms(ohms)}, por ${led.label} pasan ${current.toFixed(1)} mA. Apenas se va a notar encendido.`,
          where: [led.id, component.id],
          suggest: [{ type: 'resistencia', ohms: calc.value, text: `Para un brillo normal usa ${formatOhms(calc.value)}.` }],
        });
      }
    }
  }
  return findings;
}

/** Limpia y valida un proyecto leído de un archivo o del almacenamiento del navegador. */
export function parseProject(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.components) || !Array.isArray(data.links)) {
    throw new Error('El archivo no es un proyecto de Rangokit.');
  }
  const project = createProject({ name: String(data.name ?? 'Proyecto importado'), system: String(data.system ?? 'todos'), id: String(data.id ?? newId('p')) });
  project.problem = String(data.problem ?? '');
  // La conversación con Rango se revisa al abrirla; aquí solo se copia si tiene forma de objeto.
  project.chat = data.chat && typeof data.chat === 'object' ? JSON.parse(JSON.stringify(data.chat)) : null;
  project.created = String(data.created ?? project.created);
  project.updated = String(data.updated ?? project.updated);
  for (const item of data.components) {
    definition(item.type);
    project.components.push({
      id: String(item.id),
      type: item.type,
      label: String(item.label ?? ''),
      x: Number(item.x) || 0,
      rot: ROTATIONS.includes(Number(item.rot)) ? Number(item.rot) : 0,
      y: Number(item.y) || 0,
      config: item.config && typeof item.config === 'object' ? structuredClone(item.config) : {},
    });
  }
  for (const link of data.links) {
    const result = connect(project, link.a, link.b);
    if (result.ok && link.id && !project.links.some((l) => l.id === String(link.id))) result.link.id = String(link.id);
  }
  return project;
}
