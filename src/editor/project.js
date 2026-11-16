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
  if (def.servo) component.config.angles = { ...def.servo };
  if (def.lcd) component.config.lines = [...def.lcd.lines];
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
    const name = { elec: 'un cable de control', air: 'una manguera', pot: 'un cable de potencia', eje: 'un eje', agua: 'una tubería de agua' };
    return { ok: false, error: `No se puede unir ${name[pa.port.kind]} con ${name[pb.port.kind]}. Cada puerto solo se conecta con otro de su mismo tipo.` };
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
 * Uniones internas de los componentes (`bus` en el catálogo): columnas y rieles de la protoboard,
 * patas gemelas del botón táctil. Se comportan como cables que no se pueden quitar.
 */
export function internalEdges(project, kind = 'elec') {
  const edges = [];
  for (const component of project.components) {
    const def = definition(component.type);
    for (const [i, group] of (def.bus ?? []).entries()) {
      if (portOf(component.type, group[0])?.kind !== kind) continue;
      for (let j = 1; j < group.length; j += 1) {
        edges.push({ id: `${component.id}:bus${i}-${j}`, a: keyOf({ c: component.id, p: group[0] }), b: keyOf({ c: component.id, p: group[j] }) });
      }
    }
  }
  return edges;
}

/**
 * Redes eléctricas o neumáticas: grupos de puertos unidos por cables o mangueras.
 * Usa el mismo recorrido del motor que la práctica guiada.
 */
export function nets(project, kind = 'elec') {
  const edges = [...project.links.filter((l) => l.kind === kind).map((l) => ({ id: l.id, a: keyOf(l.a), b: keyOf(l.b) })),
    ...internalEdges(project, kind)];
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
  findings.push(...reviewTransistors(project));
  findings.push(...reviewPower(project));

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
    // Un LED común tiene un ánodo; un LED RGB tiene tres y un display de 7 segmentos, ocho.
    const anodes = definition(led.type).ports.filter((port) => port.bareLed);
    if (!anodes.length) continue;
    const color = ledColor(led.config.color);
    const bare = [];
    for (const anode of anodes) {
      const vf = anode.vf ?? color.vf;
      const name = anode.color ?? color.label.toLowerCase();
      const tag = anodes.length > 1 ? `${led.label}:${anode.label} (${name}, ${vf} V)` : `${led.label} (${name}, ${vf} V)`;
      const list = members(project, netOf(groups, { c: led.id, p: anode.id })).filter(({ component }) => component.id !== led.id);
      const direct = netVolts(list);
      if (direct) {
        bare.push({ anode, vf, tag, direct });
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
        const who = anodes.length > 1 ? `${led.label}:${anode.label}` : led.label;
        if (current > limit) {
          findings.push({
            level: 'error',
            code: 'resistencia-baja',
            text: `Con ${component.label} de ${formatOhms(ohms)}, por ${who} pasan ${Math.round(current)} mA. El máximo seguro es ${limit} mA.`,
            where: [led.id, component.id],
            suggest: [{ type: 'resistencia', ohms: calc.value, text: `Cambia ${component.label} por ${formatOhms(calc.value)} (${calc.rating}): deja unos ${Math.round(calc.current)} mA.` }],
          });
        } else if (current < 2) {
          findings.push({
            level: 'aviso',
            code: 'led-tenue',
            text: `Con ${component.label} de ${formatOhms(ohms)}, por ${who} pasan ${current.toFixed(1)} mA. Apenas se va a notar encendido.`,
            where: [led.id, component.id],
            suggest: [{ type: 'resistencia', ohms: calc.value, text: `Para un brillo normal usa ${formatOhms(calc.value)}.` }],
          });
        }
      }
    }
    if (!bare.length) continue;
    const [first] = bare;
    const calc = ledResistor(first.direct, { vf: first.vf });
    const how = `Pon una resistencia de ${formatOhms(calc.value)} (${calc.rating}) entre la fuente y el ánodo: (${first.direct} V − ${first.vf} V) ÷ 15 mA = ${Math.round(calc.exact)} Ω, y el valor comercial siguiente es ${formatOhms(calc.value)}.`;
    findings.push({
      level: 'error',
      code: 'led-sin-resistencia',
      text: bare.length === 1
        ? `${first.tag} recibe ${first.direct} V sin resistencia. La corriente solo la limita el ${first.direct === 5 ? 'pin' : 'circuito'} y el LED se quema.`
        : `${led.label}: ${bare.map((b) => b.anode.label).join(', ')} reciben tensión sin resistencia. Cada uno es un LED y necesita su propia resistencia, o se quema.`,
      where: [led.id],
      suggest: [{ type: 'resistencia', ohms: calc.value, text: bare.length === 1 ? how : `${how} Pon una en cada ${led.type === 'display-7seg' ? 'segmento' : 'color'}.` }],
    });
  }
  return findings;
}

/**
 * Reglas de transistores y motores:
 * - La base de un transistor no se conecta directo a un pin o a una fuente: sin resistencia
 *   pasa demasiada corriente y se dañan el pin y el transistor.
 * - Un motor no se conecta directo a un pin: pide mucho más que los 20 mA que da.
 */
function reviewTransistors(project) {
  const findings = [];
  const groups = nets(project, 'elec');
  const others = (component, portId) => members(project, netOf(groups, { c: component.id, p: portId }))
    .filter((item) => item.component.id !== component.id);
  for (const component of project.components) {
    const def = definition(component.type);
    const base = def.ports.find((port) => port.base);
    if (base) {
      const volts = netVolts(others(component, base.id));
      if (volts) {
        findings.push({
          level: 'error',
          code: 'base-sin-resistencia',
          text: `La base de ${component.label} recibe ${volts} V directo, sin resistencia. Pasa demasiada corriente: se dañan el transistor y el pin que la alimenta.`,
          where: [component.id],
          suggest: [{ type: 'resistencia', ohms: 1000, text: 'Pon una resistencia de 1 kΩ entre el pin y la base: deja unos 4 mA, suficientes para que el transistor conduzca.' }],
        });
      }
    }
    const motorPorts = def.ports.filter((port) => port.motor);
    const pins = motorPorts.flatMap((port) => others(component, port.id).filter((item) => item.port.pin));
    if (pins.length) {
      findings.push({
        level: 'error',
        code: 'motor-en-pin',
        text: `${component.label} está conectado directo a ${names(pins)}. Un motor pide cientos de mA y un pin da máximo 20 mA: se daña el Arduino.`,
        where: [component.id, ...new Set(pins.map((item) => item.component.id))],
        suggest: [{ type: 'transistor-npn', text: 'Mueve el motor con un transistor NPN: el pin va a la base con una resistencia de 1 kΩ, el motor va de +5 V al colector y el emisor a GND.' }],
      });
    }
  }
  return findings;
}

/**
 * Módulos que necesitan VCC y GND (servo, pantalla, ultrasónico): si ya tienen algún cable pero les
 * falta la alimentación, no funcionan aunque su señal esté bien conectada.
 */
function reviewPower(project) {
  const findings = [];
  const groups = nets(project, 'elec');
  const reaches = (component, portId, test) => members(project, netOf(groups, { c: component.id, p: portId }))
    .some((item) => item.component.id !== component.id && test(item.port));
  for (const component of project.components) {
    const def = definition(component.type);
    if (!def.needsPower) continue;
    if (!def.ports.some((port) => netOf(groups, { c: component.id, p: port.id }).size > 1)) continue;
    const missing = [
      !reaches(component, 'VCC', (port) => port.role === 'supply+' && port.domain === '5v') && 'VCC a 5 V',
      !reaches(component, 'GND', (port) => port.role === 'gnd') && 'GND',
    ].filter(Boolean);
    if (missing.length) {
      findings.push({
        level: 'aviso',
        code: 'sin-alimentacion',
        text: `${component.label} no tiene conectado ${missing.join(' ni ')}. Sin alimentación no funciona, aunque su señal esté bien conectada.`,
        where: [component.id],
      });
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
  if (data.tutorial && typeof data.tutorial.id === 'string') project.tutorial = { id: data.tutorial.id, step: Math.max(0, Math.round(Number(data.tutorial.step) || 0)) };
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
