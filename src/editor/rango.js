// Rango: el analista del editor. Lee el proyecto y el problema del estudiante y propone qué sigue.
// Funciona con reglas fijas y ejemplos verificados, sin IA: cada conclusión sale de las conexiones
// o de palabras del enunciado, y Rango dice cuándo no reconoce algo en lugar de inventar.
import { definition, fold } from './catalog.js';
import { createProject, addComponent, connect, nets, netOf, members, reviewWiring } from './project.js';
import { boards, pinRows, reviewArduino, CONDITIONS } from './arduino.js';
import { createModel, train, predict } from './learn.js';

const MANUAL = { 'valvula-32-boton': 'con botón', 'valvula-32-rodillo': 'con rodillo', 'valvula-52-palanca': 'con palanca' };
const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/** Componentes del mismo grupo neumático o eléctrico que un puerto, sin contar el propio componente. */
function around(project, groups, component, portId) {
  return members(project, netOf(groups, { c: component.id, p: portId })).filter((item) => item.component.id !== component.id);
}

/** Puertos alcanzados desde un puerto neumático, atravesando reguladoras de caudal. */
function airReach(project, groups, component, portId) {
  const found = around(project, groups, component, portId);
  for (const item of [...found]) {
    if (item.component.type === 'reguladora') {
      const other = item.port.id === 'in' ? 'out' : 'in';
      found.push(...around(project, groups, item.component, other));
    }
  }
  return found;
}

/**
 * Analiza el proyecto: qué parece que el estudiante quiere lograr (goals) y qué le falta (next).
 * Solo describe lo que se puede leer de las conexiones; no simula.
 */
export function analyzeProject(project) {
  const goals = [];
  const next = [];
  const air = nets(project, 'air');
  const elec = nets(project, 'elec');
  const errors = [...reviewWiring(project), ...reviewArduino(project)].filter((f) => f.level === 'error');
  if (errors.length) next.push(`Corrige primero ${errors.length === 1 ? 'el error' : `los ${errors.length} errores`} de la pestaña Revisión.`);
  if (!project.components.length) {
    next.push('Agrega componentes desde el catálogo o escribe tu problema arriba para que te proponga cómo armarlo.');
    return { goals, next };
  }

  const hasType = (type) => project.components.some((c) => c.type === type);

  for (const cylinder of project.components.filter((c) => c.type.startsWith('cilindro'))) {
    const def = definition(cylinder.type);
    const valves = new Set();
    for (const port of def.ports) {
      for (const item of airReach(project, air, cylinder, port.id)) {
        if (definition(item.component.type).category === 'valvulas' && item.component.type !== 'reguladora') valves.add(item.component.label);
      }
    }
    if (valves.size) goals.push(`Mover ${cylinder.label} (${lower(def.name)}) con ${[...valves].join(' y ')}.`);
    else next.push(`Conecta ${cylinder.label} a una válvula: ${cylinder.type === 'cilindro-de' ? 'una 5/2, con la salida 4 a la cámara trasera y la 2 a la delantera' : 'una 3/2, con la salida 2 a la cámara'}.`);
  }

  for (const valve of project.components.filter((c) => definition(c.type).category === 'valvulas' && c.type !== 'reguladora')) {
    const def = definition(valve.type);
    const fed = airReach(project, air, valve, '1').some(({ component }) => component.type === 'fuente-aire');
    if (!fed) next.push(`Lleva aire al puerto 1 de ${valve.label} desde una fuente 0Z${hasType('fuente-aire') ? '' : ' (agrégala del catálogo)'}.`);
    if (MANUAL[valve.type]) {
      goals.push(`${valve.label} se acciona a mano, ${MANUAL[valve.type]}.`);
      continue;
    }
    for (const plus of def.ports.filter((p) => p.kind === 'elec' && p.id.endsWith('+'))) {
      const coil = plus.id.slice(0, -1);
      const minus = def.ports.find((p) => p.id === `${coil}-`);
      const feeds = around(project, elec, valve, plus.id);
      const module = feeds.find(({ component, port }) => component.type === 'modulo-rele' && (port.id === 'NO' || port.id === 'COM'));
      const relay = feeds.find(({ component }) => component.type === 'rele-24');
      const contact = feeds.find(({ component, port }) => port.pair && !port.passive && component.type !== 'modulo-rele' && component.type !== 'rele-24');
      const direct = feeds.some(({ port }) => port.role === 'supply+');
      if (module) {
        const pin = around(project, elec, module.component, 'IN').find(({ port }) => port.pin);
        if (pin) goals.push(`${pin.component.label} manda la bobina ${coil} de ${valve.label} con el pin ${pin.port.id}, a través de ${module.component.label}.`);
        else next.push(`Conecta IN de ${module.component.label} a un pin digital del Arduino para mandar ${valve.label}.`);
        const other = module.port.id === 'NO' ? 'COM' : 'NO';
        if (!around(project, elec, module.component, other).some(({ port }) => port.role === 'supply+')) {
          next.push(`Conecta ${other} de ${module.component.label} a +24 V: el contacto del relé es el que deja pasar la corriente a la bobina.`);
        }
      } else if (relay) {
        goals.push(`El contacto ${relay.port.id} de ${relay.component.label} activa la bobina ${coil} de ${valve.label}.`);
      } else if (contact) {
        goals.push(`${contact.component.label} activa directo la bobina ${coil} de ${valve.label}.`);
      } else if (direct) {
        next.push(`La bobina ${coil} de ${valve.label} va directo a +24 V y nunca se apaga. Pon un pulsador o un contacto de relé en medio.`);
      } else {
        next.push(`Conecta la bobina ${coil} de ${valve.label}: ${coil}+ al contacto que la activa y ${coil}− a 0 V.`);
      }
      if (feeds.length && !around(project, elec, valve, minus.id).some(({ port }) => port.role === 'gnd')) {
        next.push(`Conecta ${coil}− de ${valve.label} a 0 V para cerrar el circuito de la bobina.`);
      }
    }
  }

  for (const relay of project.components.filter((c) => c.type === 'rele-24')) {
    const holds = members(project, netOf(elec, { c: relay.id, p: '14' })).some(({ component, port }) => component.id === relay.id && port.id === 'A1');
    if (holds) goals.push(`Enclavamiento con ${relay.label}: su contacto 13-14 mantiene la bobina después de soltar el pulsador de marcha.`);
    if (!members(project, netOf(elec, { c: relay.id, p: 'A2' })).some(({ port }) => port.role === 'gnd')) {
      next.push(`Conecta A2 de ${relay.label} a 0 V.`);
    }
  }

  for (const board of boards(project)) {
    const rows = pinRows(project, board);
    const byId = (id) => rows.find((row) => row.id === id);
    const rules = board.config.rules ?? [];
    const inputs = rows.filter((row) => ['input', 'input_pullup', 'analog'].includes(row.mode));
    const outputs = rows.filter((row) => row.mode === 'output');
    for (const output of outputs) {
      const mine = rules.filter((rule) => rule.output === output.id);
      const on = mine.find((rule) => rule.action === 'encender');
      const off = mine.find((rule) => rule.action === 'apagar');
      if (on && off) {
        goals.push(`Memoria: ${byId(on.input)?.name ?? on.input} enciende ${output.name} y ${byId(off.input)?.name ?? off.input} la apaga.`);
        const stopper = byId(off.input)?.inferred.component;
        if (stopper && ['final-carrera', 'sensor-magnetico'].includes(stopper.type)) {
          goals.push(`Retorno automático: cuando ${stopper.label} detecta el final de la carrera, ${output.name} se apaga.`);
        }
      }
      for (const rule of mine.filter((r) => r.action === 'seguir')) {
        const condition = CONDITIONS.find((c) => c.id === rule.cond);
        const input = byId(rule.input);
        if (condition?.analog) goals.push(`${output.name} se activa según la lectura de ${input?.name ?? rule.input} (${condition.label} ${rule.value}).`);
        else goals.push(`${output.name} sigue a ${input?.name ?? rule.input}${rule.cond === 'inactiva' ? ' invertida' : ''}.`);
      }
      if (!mine.length) next.push(`Ninguna regla manda ${output.name} (${output.id}). Agrégala en Lógica.`);
    }
    for (const input of inputs) {
      if (!rules.some((rule) => rule.input === input.id)) next.push(`Ninguna regla usa ${input.name} (${input.id}). Agrégala en Lógica.`);
    }
    if (!inputs.length && !outputs.length) next.push(`Conecta entradas y salidas a ${board.label}: pulsadores a pines digitales, módulos de relé o LED como salidas.`);
  }

  if (!goals.length && !next.length) next.push('Conecta los componentes para que pueda entender qué quieres hacer.');
  return { goals: [...new Set(goals)], next: [...new Set(next)] };
}

// Ejemplos verificados. Cada uno se construye con el mismo modelo del editor y sus pruebas
// comprueban que la revisión no encuentra errores.
const build = (fn) => (project) => {
  const add = (type, x, y, config) => {
    const c = addComponent(project, type, x, y);
    Object.assign(c.config, config ?? {});
    return c;
  };
  const wire = (a, ap, b, bp) => {
    const result = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
    if (!result.ok) throw new Error(`Ejemplo inválido: ${result.error}`);
  };
  fn(add, wire);
  return project;
};

export const TEMPLATES = [
  {
    id: 'cilindro-se-boton',
    title: 'Cilindro de simple efecto con botón',
    system: 'neumatica',
    keywords: [['simple efecto', 3], ['boton', 1], ['pulsador', 1], ['3/2', 2], ['resorte', 1], ['neumat', 1], ['presion', 1]],
    concept: 'Un cilindro de simple efecto solo necesita aire para salir; regresa por su resorte. Basta una válvula 3/2 normalmente cerrada: al presionar, el aire pasa de 1 a 2 y el vástago sale; al soltar, la cámara se descarga por 3.',
    build: build((add, wire) => {
      const cyl = add('cilindro-se', 160, 40);
      const valve = add('valvula-32-boton', 100, 170);
      const source = add('fuente-aire', 60, 300);
      wire(source, 'out', valve, '1');
      wire(valve, '2', cyl, 'A');
    }),
  },
  {
    id: 'cilindro-de-palanca',
    title: 'Cilindro de doble efecto con válvula 5/2 manual',
    system: 'neumatica',
    keywords: [['doble efecto', 2], ['palanca', 3], ['manual', 2], ['5/2', 1], ['neumat', 1], ['sale y entra', 1]],
    concept: 'Un cilindro de doble efecto necesita aire para salir y para regresar. La válvula 5/2 manda aire a una cámara mientras descarga la otra: la salida 4 alimenta la cámara trasera y la 2, la delantera.',
    build: build((add, wire) => {
      const cyl = add('cilindro-de', 120, 40);
      const valve = add('valvula-52-palanca', 110, 180);
      const source = add('fuente-aire', 80, 320);
      wire(source, 'out', valve, '1');
      wire(valve, '4', cyl, 'trasera');
      wire(valve, '2', cyl, 'delantera');
    }),
  },
  {
    id: 'electro-directo',
    title: 'Mando eléctrico directo de una electroválvula',
    system: 'electroneumatica',
    keywords: [['solenoide', 2], ['electrovalvula', 2], ['bobina', 1], ['directo', 2], ['mientras', 1], ['electroneumat', 1], ['24', 1], ['pulsador', 1]],
    concept: 'El pulsador cierra el circuito de 24 V de la bobina. Mientras lo mantienes presionado, la válvula 5/2 conmuta y el cilindro sale; al soltarlo, el resorte regresa la válvula y el cilindro entra.',
    build: build((add, wire) => {
      const cyl = add('cilindro-de', 360, 40);
      const valve = add('valvula-52-mono', 350, 180);
      const source = add('fuente-aire', 320, 320);
      const g1 = add('fuente-24', 60, 240);
      const s1 = add('pulsador-na', 180, 100);
      wire(source, 'out', valve, '1');
      wire(valve, '4', cyl, 'trasera');
      wire(valve, '2', cyl, 'delantera');
      wire(g1, '+24', s1, '13');
      wire(s1, '14', valve, 'Y+');
      wire(valve, 'Y-', g1, '0V');
    }),
  },
  {
    id: 'enclavamiento-rele',
    title: 'Marcha y paro con enclavamiento por relé',
    system: 'electroneumatica',
    keywords: [['enclav', 3], ['memoria', 2], ['marcha', 2], ['paro', 2], ['rele', 2], ['retencion', 3], ['soltar', 1], ['se mantenga', 2], ['24', 1]],
    concept: 'Un contacto NA del propio relé (13-14) va en paralelo con el pulsador de marcha. Al presionar marcha, el relé se energiza y su contacto mantiene la corriente aunque sueltes. El pulsador de paro, NC y en serie, corta todo.',
    build: build((add, wire) => {
      const g1 = add('fuente-24', 40, 380);
      const marcha = add('pulsador-na', 60, 200);
      const paro = add('pulsador-nc', 60, 60);
      const k1 = add('rele-24', 200, 200);
      const valve = add('valvula-52-mono', 560, 220);
      const cyl = add('cilindro-de', 570, 60);
      const source = add('fuente-aire', 530, 360);
      wire(g1, '+24', paro, '11');
      wire(paro, '12', marcha, '13');
      wire(paro, '12', k1, '13');
      wire(marcha, '14', k1, 'A1');
      wire(k1, '14', k1, 'A1');
      wire(k1, 'A2', g1, '0V');
      wire(g1, '+24', k1, '23');
      wire(k1, '24', valve, 'Y+');
      wire(valve, 'Y-', g1, '0V');
      wire(source, 'out', valve, '1');
      wire(valve, '4', cyl, 'trasera');
      wire(valve, '2', cyl, 'delantera');
    }),
  },
  {
    id: 'arduino-led-boton',
    title: 'Encender un LED con un botón (Arduino)',
    system: 'arduino',
    keywords: [['led', 2], ['boton', 2], ['pulsador', 2], ['arduino', 1], ['encender', 1], ['enciend', 1], ['foco', 1], ['luz', 1], ['resistencia', 1]],
    concept: 'El botón va del pin D2 a GND y el pin usa su pull-up interno: suelto lee HIGH, presionado lee LOW. El LED necesita una resistencia en serie: (5 V − 2 V) ÷ 15 mA ≈ 200 Ω, y el valor comercial siguiente es 220 Ω.',
    build: build((add, wire) => {
      const uno = add('arduino-uno', 260, 40);
      const s1 = add('pulsador-na', 80, 40);
      const r1 = add('resistencia', 560, 60, { ohms: 220 });
      const h1 = add('led-solo', 550, 200);
      wire(uno, 'D2', s1, '13');
      wire(s1, '14', uno, 'GND');
      wire(uno, 'D13', r1, '1');
      wire(r1, '2', h1, 'A');
      wire(h1, 'K', uno, 'GND');
      uno.config.rules.push({ input: 'D2', cond: 'activa', output: 'D13', action: 'seguir' });
    }),
  },
  {
    id: 'arduino-cilindro',
    title: 'Cilindro con Arduino: arranque y retorno automático',
    system: 'arduino',
    keywords: [['arduino', 2], ['cilindro', 1], ['final de carrera', 2], ['regres', 2], ['retorno', 2], ['sensor', 1], ['solo', 1], ['automatic', 1], ['valvula', 1], ['rele', 1]],
    concept: 'El Arduino no puede mover una bobina de 24 V: la manda con un módulo de relé. S1 enciende la salida y el final de carrera S2 la apaga, así el cilindro regresa solo. Esa memoria se arma con dos reglas: "encender" con S1 y "apagar" con S2.',
    build: build((add, wire) => {
      const uno = add('arduino-uno', 300, 60);
      const s1 = add('pulsador-na', 120, 60);
      const s2 = add('final-carrera', 120, 220);
      const k1 = add('modulo-rele', 600, 60);
      const g1 = add('fuente-24', 640, 300);
      const valve = add('valvula-52-mono', 900, 230);
      const cyl = add('cilindro-de', 900, 60);
      const source = add('fuente-aire', 920, 420);
      wire(uno, 'D2', s1, '13');
      wire(s1, '14', uno, 'GND');
      wire(uno, 'D3', s2, '13');
      wire(s2, '14', uno, 'GND');
      wire(uno, 'D8', k1, 'IN');
      wire(uno, '5V', k1, 'VCC');
      wire(uno, 'GND', k1, 'GND');
      wire(g1, '+24', k1, 'COM');
      wire(k1, 'NO', valve, 'Y+');
      wire(valve, 'Y-', g1, '0V');
      wire(source, 'out', valve, '1');
      wire(valve, '4', cyl, 'trasera');
      wire(valve, '2', cyl, 'delantera');
      uno.config.rules.push(
        { input: 'D2', cond: 'activa', output: 'D8', action: 'encender' },
        { input: 'D3', cond: 'activa', output: 'D8', action: 'apagar' },
      );
    }),
  },
  {
    id: 'arduino-potenciometro',
    title: 'Encender una salida según un potenciómetro (Arduino)',
    system: 'arduino',
    keywords: [['potenciometro', 4], ['mitad', 2], ['analog', 2], ['umbral', 2], ['nivel', 1], ['ajust', 1], ['lectura', 1], ['arduino', 1], ['perilla', 2]],
    concept: 'El potenciómetro entrega de 0 a 5 V en su cursor. Conectado a A0, analogRead da un número de 0 a 1023. Una regla compara ese número con un umbral, por ejemplo 512 (la mitad), y decide la salida.',
    build: build((add, wire) => {
      const uno = add('arduino-uno', 260, 40);
      const pot = add('potenciometro', 560, 360);
      const r = add('resistencia', 80, 160, { ohms: 220 });
      const h1 = add('led-solo', 70, 300);
      wire(pot, 'W', uno, 'A0');
      wire(pot, '5V', uno, '5V');
      wire(pot, 'GND', uno, 'GND');
      wire(uno, 'D9', r, '1');
      wire(r, '2', h1, 'A');
      wire(h1, 'K', uno, 'GND');
      uno.config.rules.push({ input: 'A0', cond: 'mayor', value: 512, output: 'D9', action: 'seguir' });
    }),
  },
];

/** Construye un ejemplo como proyecto nuevo. */
export function buildTemplate(id, name) {
  const template = TEMPLATES.find((t) => t.id === id);
  const project = createProject({ name: name ?? template.title, system: template.system });
  return template.build(project);
}

const QUESTIONS = [
  '¿Qué debe moverse o encenderse? (un cilindro, un motor, un LED…)',
  '¿Qué lo activa? (un botón, un sensor, el Arduino…)',
  '¿Cuándo debe regresar o apagarse? (al soltar, al llegar al final, con otro botón…)',
  '¿Con qué trabajas? (neumática pura, relés de 24 V o Arduino)',
];

// Enunciados de entrenamiento: así suelen redactarse estas tareas en clase.
// Para enseñarle a Rango un problema nuevo, agrega aquí sus enunciados junto con su ejemplo.
export const TRAINING = {
  'cilindro-se-boton': [
    'Mando directo de un cilindro de simple efecto con una válvula 3/2 accionada por pulsador.',
    'Un cilindro de simple efecto sujeta una pieza mientras el operador mantiene presionado el botón.',
    'Un pulsador neumático hace avanzar un cilindro con retorno por muelle.',
    'Usa una válvula 3/2 normalmente cerrada con botón para mover un cilindro de simple efecto.',
    'Expulsar piezas con un cilindro de simple efecto accionado manualmente y retorno por resorte.',
  ],
  'cilindro-de-palanca': [
    'Un cilindro de doble efecto debe salir y entrar usando una válvula 5/2 de palanca.',
    'Mando manual de un cilindro de doble efecto con válvula 5/2 con enclavamiento mecánico.',
    'El operador mueve una palanca para abrir y cerrar una puerta con un cilindro de doble efecto.',
    'Válvula 5/2 accionada manualmente que controla el avance y retroceso del cilindro.',
    'Controla la velocidad de un cilindro de doble efecto con reguladora de caudal y válvula manual.',
  ],
  'electro-directo': [
    'Al mantener presionado un pulsador eléctrico, la electroválvula 5/2 se energiza y el cilindro sale.',
    'Mando eléctrico directo de un cilindro de doble efecto con una válvula de solenoide de 24 V.',
    'El cilindro sale solo mientras se presiona el botón y regresa al soltarlo, con una bobina de 24 V.',
    'Electroneumática básica: un pulsador energiza la bobina de la válvula monoestable.',
    'Conecta un pulsador a la bobina Y1 de una electroválvula para mover un cilindro.',
  ],
  'enclavamiento-rele': [
    'Botón de marcha y botón de paro: el cilindro se mantiene afuera aunque se suelte el pulsador.',
    'Enclavamiento con relé: al presionar marcha el relé se autorretiene y el paro lo desactiva.',
    'Memoria eléctrica con relé K1 y contacto de autorretención para una electroválvula.',
    'El cilindro sale al pulsar S1, se queda afuera al soltar y regresa al pulsar el paro.',
    'Arranque y paro de una válvula solenoide con un relé de 24 V y contacto de retención.',
  ],
  'arduino-led-boton': [
    'Haz que un LED se encienda mientras presionas un botón conectado al Arduino.',
    'Programa el Arduino Uno para leer un pulsador y prender un foco LED.',
    'Al presionar el botón se enciende la luz y al soltarlo se apaga, con Arduino.',
    'Conecta un LED con su resistencia al pin 13 y un botón al pin 2 del Arduino.',
    'Entradas y salidas digitales: botón y LED en Arduino.',
  ],
  'arduino-cilindro': [
    'Con Arduino, al pulsar arranque el cilindro sale y regresa automáticamente al tocar el final de carrera.',
    'Controla una electroválvula de 24 V con Arduino usando un módulo de relé y un fin de carrera.',
    'El Arduino activa un cilindro neumático y lo desactiva cuando el sensor detecta que llegó al final.',
    'Automatiza una estampadora: botón de inicio, cilindro y retorno automático con microcontrolador.',
    'Retorno automático de un cilindro de doble efecto controlado por Arduino y relé.',
  ],
  'arduino-potenciometro': [
    'Lee un potenciómetro con el Arduino y enciende un LED cuando pase de cierto valor.',
    'Usa la entrada analógica A0 para medir la posición de una perilla y activar una salida.',
    'Enciende una alarma cuando la lectura analógica supere un umbral.',
    'Ajusta con un potenciómetro el nivel al que se activa una salida del Arduino.',
    'Lee un valor de 0 a 1023 con analogRead y compáralo con un límite.',
  ],
};

let seedModel = null;

/** Modelo base, entrenado con los títulos, las palabras clave y los enunciados de cada ejemplo. */
function seed() {
  if (seedModel) return seedModel;
  seedModel = createModel();
  for (const template of TEMPLATES) {
    train(seedModel, template.title, template.id);
    train(seedModel, template.keywords.map(([word]) => word).join(' '), template.id);
    for (const sentence of TRAINING[template.id] ?? []) train(seedModel, sentence, template.id);
  }
  return seedModel;
}

function cloneModel(model) {
  const copy = createModel();
  copy.docs = model.docs;
  copy.vocab = new Set(model.vocab);
  for (const [label, entry] of model.classes) copy.classes.set(label, { docs: entry.docs, total: entry.total, counts: new Map(entry.counts) });
  return copy;
}

/** Peso de cada respuesta del estudiante frente a un enunciado de entrenamiento. */
export const LEARNED_WEIGHT = 3;

/**
 * Modelo adaptado: el base más lo que el estudiante le enseñó en este navegador.
 * learned es una lista de { text, label } guardada localmente.
 */
export function adaptedModel(learned = []) {
  const valid = learned.filter((item) => item && typeof item.text === 'string' && TEMPLATES.some((t) => t.id === item.label));
  if (!valid.length) return seed();
  const model = cloneModel(seed());
  for (const item of valid) train(model, item.text, item.label, LEARNED_WEIGHT);
  return model;
}

/**
 * Reconoce el tipo de problema a partir del enunciado con el clasificador. Devuelve el más probable,
 * su seguridad y las palabras que más pesaron. Si hay poca evidencia o la seguridad es baja, lo dice
 * y devuelve preguntas para precisar.
 */
export function matchProblem(text, learned = []) {
  if (!fold(text ?? '').trim()) return null;
  const { ranked, known, reasons } = predict(adaptedModel(learned), text);
  const items = ranked.map((r) => ({ template: TEMPLATES.find((t) => t.id === r.label), confidence: r.prob, reasons: [] }));
  const recognized = known >= 2 && items.length > 0 && items[0].confidence >= 0.5;
  if (recognized) items[0].reasons = reasons;
  return {
    recognized,
    best: recognized ? items[0] : null,
    alternatives: recognized ? items.slice(1, 3).filter((i) => i.confidence >= 0.02) : known ? items.slice(0, 3) : [],
    evidence: known,
    questions: recognized ? [] : QUESTIONS,
  };
}

/** Cómo se comporta el modelo con lo aprendido: cuántos ejemplos y de qué problemas. */
export function learningSummary(learned = []) {
  const byLabel = new Map();
  for (const item of learned) byLabel.set(item.label, (byLabel.get(item.label) ?? 0) + 1);
  return { total: learned.length, byTemplate: [...byLabel].map(([id, n]) => ({ template: TEMPLATES.find((t) => t.id === id), n })).filter((x) => x.template) };
}

/** Pasos de conexión de un ejemplo, escritos para seguirlos a mano. */
export function templateSteps(project) {
  const name = ({ c, p }) => {
    const component = project.components.find((item) => item.id === c);
    const port = definition(component.type).ports.find((item) => item.id === p);
    return `${component.label} (${port.label})`;
  };
  const steps = project.links.map((link) => `${link.kind === 'air' ? 'Manguera' : 'Cable'}: ${name(link.a)} → ${name(link.b)}.`);
  for (const board of boards(project)) {
    const rows = pinRows(project, board);
    for (const rule of board.config.rules ?? []) {
      const input = rows.find((r) => r.id === rule.input);
      const output = rows.find((r) => r.id === rule.output);
      const condition = CONDITIONS.find((c) => c.id === rule.cond);
      const value = condition.analog ? ` ${rule.value}` : '';
      const action = rule.action === 'seguir' ? 'que siga a la condición' : rule.action;
      steps.push(`Regla: si ${input.name} ${condition.label}${value} → ${action} ${output.name}.`);
    }
  }
  return steps;
}

/**
 * Qué componentes del ejemplo faltan en el proyecto del estudiante, con la posición que tienen en el
 * ejemplo para acomodarlos igual. Si el estudiante ya tiene uno de un tipo, faltan los siguientes.
 */
export function missingFor(project, example) {
  const have = project.components.reduce((map, c) => map.set(c.type, (map.get(c.type) ?? 0) + 1), new Map());
  const seen = new Map();
  const missing = [];
  for (const sample of example.components) {
    const index = (seen.get(sample.type) ?? 0) + 1;
    seen.set(sample.type, index);
    if (index > (have.get(sample.type) ?? 0)) {
      missing.push({ type: sample.type, x: sample.x, y: sample.y, config: sample.config.ohms ? { ohms: sample.config.ohms } : {} });
    }
  }
  return missing;
}
