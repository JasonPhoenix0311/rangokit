// Tutoriales guiados: un proyecto de prueba por cada tipo de sistema, armado paso a paso.
//
// Cada paso dice qué seleccionar y se revisa solo con una regla sobre el proyecto o sobre la simulación.
// El avance es en orden: un paso se marca cuando se cumple y ya no se desmarca. Los pasos de armado
// tienen «Hazlo por mí» (apply); los de simulación (ejecutar, presionar, observar, 3D) los hace el usuario
// porque son la validación de que el proyecto funciona.
//
// Sin DOM: el contexto (ctx) lo arma la interfaz: { project, sim, view, mode3d, errors }.
import { definition } from './catalog.js';
import { addComponent, connect, nets, netOf } from './project.js';

// ── Pasos ──
const add = (as, type, at, extra = '') => ({ kind: 'add', as, type, at, extra });
const wire = (a, b, extra = '') => ({ kind: 'wire', a, b, extra });
const setValue = (as, key, value, text, ok) => ({ kind: 'config', as, key, value, text, ok });
const rule = (as, r, text) => ({ kind: 'rule', as, rule: r, text });
const review = () => ({ kind: 'review' });
const run = () => ({ kind: 'run' });
const act = (as, text, test, focus) => ({ kind: 'act', as, text, test, focus });
const env = (key, value, text, test) => ({ kind: 'env', key, value, text, test });
const view3d = () => ({ kind: '3d' });

export const TUTORIALS = [
  {
    id: 'tut-neumatica',
    system: 'neumatica',
    title: 'Neumática: cilindro de simple efecto con botón',
    goal: 'Al mantener presionado el botón, el cilindro sale; al soltarlo, regresa por su resorte.',
    steps: [
      add('fuente', 'fuente-aire', [60, 300], 'Es la que entrega el aire a 6 bar.'),
      add('valvula', 'valvula-32-boton', [100, 170], 'Deja pasar el aire mientras la presionas.'),
      add('cilindro', 'cilindro-se', [160, 40], 'Sale con aire y regresa por resorte.'),
      wire(['fuente', 'out'], ['valvula', '1'], 'El puerto 1 de una válvula siempre es la alimentación.'),
      wire(['valvula', '2'], ['cilindro', 'A'], 'El puerto 2 es la salida de trabajo.'),
      review(),
      run(),
      act('cilindro', 'Mantén presionada la válvula 1S (en el plano o en la pestaña Ejecución) hasta que el cilindro llegue al final.', (s) => (s.pos ?? 0) >= 95, 'valvula'),
      act('cilindro', 'Suelta la válvula: el cilindro debe regresar solo hasta el inicio.', (s) => (s.pos ?? 100) <= 5, 'valvula'),
      view3d(),
    ],
  },
  {
    id: 'tut-electroneumatica',
    system: 'electroneumatica',
    title: 'Electroneumática: electroválvula con pulsador de 24 V',
    goal: 'Mientras presionas el pulsador S1, la bobina recibe 24 V, la válvula conmuta y el cilindro sale.',
    steps: [
      add('fuente', 'fuente-aire', [320, 320]),
      add('valvula', 'valvula-52-mono', [350, 180], 'Tiene una bobina Y de 24 V y regresa por resorte.'),
      add('cilindro', 'cilindro-de', [360, 40]),
      add('g', 'fuente-24', [60, 240], 'Alimenta el circuito eléctrico de mando.'),
      add('s', 'pulsador-na', [180, 100]),
      wire(['fuente', 'out'], ['valvula', '1']),
      wire(['valvula', '4'], ['cilindro', 'trasera'], 'La salida 4 empuja el vástago hacia afuera.'),
      wire(['valvula', '2'], ['cilindro', 'delantera'], 'La salida 2 lo regresa.'),
      wire(['g', '+24'], ['s', '13'], 'Los puertos amarillos son eléctricos: cable de +24 V al pulsador.'),
      wire(['s', '14'], ['valvula', 'Y+'], 'Del pulsador a la bobina.'),
      wire(['valvula', 'Y-'], ['g', '0V'], 'La bobina regresa a 0 V y cierra el circuito.'),
      review(),
      run(),
      act('cilindro', 'Mantén presionado S1: el cable se colorea con 24 V, la válvula conmuta y el cilindro sale.', (s) => (s.pos ?? 0) >= 95, 's'),
      act('cilindro', 'Suelta S1: la válvula regresa por resorte y el cilindro entra.', (s) => (s.pos ?? 100) <= 5, 's'),
      view3d(),
    ],
  },
  {
    id: 'tut-arduino',
    system: 'arduino',
    title: 'Arduino: encender un LED con un botón',
    goal: 'El Arduino lee el botón en D2 y enciende el LED de D13 mientras lo presionas.',
    steps: [
      add('uno', 'arduino-uno', [260, 40]),
      add('s', 'pulsador-na', [80, 40]),
      add('r', 'resistencia', [560, 60], 'Protege al LED y al pin limitando la corriente.'),
      add('led', 'led-solo', [550, 200]),
      wire(['uno', 'D2'], ['s', '13'], 'Los puertos verdes son pines del Arduino.'),
      wire(['s', '14'], ['uno', 'GND'], 'Presionado, el botón une D2 con GND (el pin usa su pull-up interno).'),
      wire(['uno', 'D13'], ['r', '1']),
      wire(['r', '2'], ['led', 'A'], 'El ánodo (la pata larga) va hacia el positivo.'),
      wire(['led', 'K'], ['uno', 'GND']),
      setValue('r', 'ohms', 220, 'Selecciona la resistencia R1 y, en la pestaña Selección, cambia su valor a 220 Ω: (5 V − 2 V) ÷ 15 mA ≈ 200 Ω.', (v) => v >= 150 && v <= 470),
      rule('uno', { input: 'D2', cond: 'activa', output: 'D13', action: 'seguir' }, 'Abajo del plano, en el panel del Arduino, sección Lógica, pulsa «Agregar regla». Debe quedar: si D2 está activa, D13 que siga a la condición.'),
      review(),
      run(),
      act('led', 'Mantén presionado el botón S1: el LED debe encenderse.', (s) => Boolean(s.active), 's'),
      view3d(),
    ],
  },
  {
    id: 'tut-electronica',
    system: 'electronica',
    title: 'Electrónica: LED con interruptor y fuente de 5 V',
    goal: 'Un circuito sin Arduino: al cerrar el interruptor, la corriente pasa por la resistencia y enciende el LED.',
    steps: [
      add('g', 'fuente-5', [60, 60]),
      add('s', 'interruptor', [220, 40]),
      add('r', 'resistencia', [360, 60]),
      add('led', 'led-solo', [480, 160]),
      wire(['g', '+5V'], ['s', '1']),
      wire(['s', '2'], ['r', '1']),
      wire(['r', '2'], ['led', 'A']),
      wire(['led', 'K'], ['g', 'GND'], 'El cátodo cierra el circuito hacia GND.'),
      setValue('r', 'ohms', 220, 'Selecciona la resistencia y cambia su valor a 220 Ω en la pestaña Selección.', (v) => v >= 150 && v <= 470),
      review(),
      run(),
      act('led', 'Haz clic en el interruptor S1 para encenderlo: el LED debe prender.', (s) => Boolean(s.active), 's'),
      view3d(),
    ],
  },
  {
    id: 'tut-renovables',
    system: 'renovables',
    title: 'Energías renovables: casa con energía solar',
    goal: 'El panel carga la batería de día; de noche la batería alimenta la casa a través del inversor.',
    steps: [
      add('pv', 'panel-solar', [40, 60]),
      add('cc', 'controlador-carga', [220, 70], 'Cuida que la batería no se sobrecargue.'),
      add('bat', 'bateria', [420, 50]),
      add('inv', 'inversor', [400, 180], 'Convierte la corriente directa de la batería en 120 V de alterna.'),
      add('casa', 'carga-casa', [620, 170]),
      wire(['pv', 'out'], ['cc', 'in'], 'Los puertos rojos son de potencia.'),
      wire(['cc', 'bat'], ['bat', 'bus']),
      wire(['bat', 'bus'], ['inv', 'in']),
      wire(['inv', 'out'], ['casa', 'in']),
      setValue('pv', 'watts', 1500, 'La casa consume 800 W y un solo panel de 400 W no alcanza. Selecciona el panel PV1 y, en Selección, cambia su potencia pico a 1500 W (como si fueran 4 paneles).', (v) => v >= 1200),
      review(),
      run(),
      act('bat', 'Con sol, mira la batería: debe decir «carga». En la pestaña Ejecución ves la energía en este momento.', (s) => (s.watts ?? 0) > 1),
      env('sol', 0, 'En la pestaña Ejecución, mueve «Sol (irradiancia)» hasta 0 W/m², como si fuera de noche.', (e) => e.sol <= 50),
      act('bat', 'Ahora la batería debe decir «entrega»: ella alimenta la casa.', (s) => (s.watts ?? 0) < -1),
      view3d(),
    ],
  },
];

export const tutorialOf = (id) => TUTORIALS.find((t) => t.id === id) ?? null;

// ── Alias: el n-ésimo componente de su tipo, en el orden en que se agregaron ──
function aliases(tutorial) {
  const map = new Map();
  const count = new Map();
  for (const step of tutorial.steps.filter((s) => s.kind === 'add')) {
    const n = count.get(step.type) ?? 0;
    count.set(step.type, n + 1);
    map.set(step.as, { type: step.type, nth: n });
  }
  return map;
}

export function find(tutorial, project, as) {
  const a = aliases(tutorial).get(as);
  if (!a) return null;
  return project.components.filter((c) => c.type === a.type)[a.nth] ?? null;
}

const portLabel = (type, id) => definition(type).ports.find((p) => p.id === id)?.label ?? id;

// ── Textos de cada paso ──
export function stepText(tutorial, step, project) {
  const name = (as) => {
    const c = project ? find(tutorial, project, as) : null;
    const a = aliases(tutorial).get(as);
    return c ? c.label : definition(a.type).name;
  };
  const end = ([as, p]) => {
    const a = aliases(tutorial).get(as);
    return `${name(as)} · ${portLabel(a.type, p)}`;
  };
  switch (step.kind) {
    case 'add': {
      const def = definition(step.type);
      return { title: `Agrega: ${def.name}`, body: `En el catálogo de la izquierda busca «${def.name}» y haz clic en él (o arrástralo al plano).${step.extra ? ` ${step.extra}` : ''}` };
    }
    case 'wire': {
      const kind = definition(aliases(tutorial).get(step.a[0]).type).ports.find((p) => p.id === step.a[1]).kind;
      const what = { air: 'una manguera', elec: 'un cable', pot: 'un cable de potencia', eje: 'un eje', agua: 'una tubería' }[kind];
      return { title: `Conecta ${end(step.a)} → ${end(step.b)}`, body: `Toca el puerto ${portLabel(aliases(tutorial).get(step.a[0]).type, step.a[1])} de ${name(step.a[0])} y luego el puerto ${portLabel(aliases(tutorial).get(step.b[0]).type, step.b[1])} de ${name(step.b[0])} para unirlos con ${what}.${step.extra ? ` ${step.extra}` : ''}` };
    }
    case 'config': return { title: 'Ajusta el valor', body: step.text };
    case 'rule': return { title: 'Programa el Arduino', body: step.text };
    case 'review': return { title: 'Revisa el proyecto', body: 'Abre la pestaña Revisión (a la derecha). No debe haber ningún error; si hay, corrígelo con la sugerencia que te da.' };
    case 'run': return { title: 'Ejecuta la simulación', body: 'Pulsa ▶ Ejecutar en la barra de arriba. Los cables con tensión, el aire y la energía se van a colorear.' };
    case 'act': return { title: 'Prueba que funcione', body: step.text };
    case 'env': return { title: 'Cambia el ambiente', body: step.text };
    case '3d': return { title: 'Míralo en 3D', body: 'Pulsa el botón 3D de la barra de arriba para ver el mismo proyecto funcionando en una mesa de trabajo. Arrastra para girar la cámara y usa la rueda para acercarte.' };
    default: return { title: '', body: '' };
  }
}

// ── Revisión de cada paso ──
function linked(project, a, b) {
  const pa = definition(a.c.type).ports.find((p) => p.id === a.p);
  if (!pa) return false;
  return netOf(nets(project, pa.kind), { c: a.c.id, p: a.p }).has(`${b.c.id}:${b.p}`);
}

/** ¿Se cumple el paso? ctx: { project, sim, view, mode3d, errors }. */
export function stepDone(tutorial, step, ctx) {
  const { project } = ctx;
  const c = (as) => find(tutorial, project, as);
  switch (step.kind) {
    case 'add': return Boolean(c(step.as));
    case 'wire': {
      const a = c(step.a[0]);
      const b = c(step.b[0]);
      return Boolean(a && b && linked(project, { c: a, p: step.a[1] }, { c: b, p: step.b[1] }));
    }
    case 'config': {
      const comp = c(step.as);
      return Boolean(comp && step.ok(Number(comp.config[step.key])));
    }
    case 'rule': {
      const board = c(step.as);
      return Boolean(board?.config.rules?.some((r) => Object.entries(step.rule).every(([k, v]) => r[k] === v)));
    }
    case 'review': return ctx.errors === 0;
    case 'run': return Boolean(ctx.sim);
    case 'act': {
      const comp = c(step.as);
      const part = comp && ctx.view?.parts.get(comp.id);
      return Boolean(ctx.sim && part && step.test(part));
    }
    case 'env': return Boolean(ctx.sim?.env && step.test(ctx.sim.env));
    case '3d': return Boolean(ctx.mode3d);
    default: return false;
  }
}

/** Avanza desde el paso actual mientras se cumplan. Devuelve el índice del primer paso pendiente. */
export function advanceTutorial(tutorial, current, ctx) {
  let i = Math.max(0, current);
  while (i < tutorial.steps.length && stepDone(tutorial, tutorial.steps[i], ctx)) i += 1;
  return i;
}

/** ¿El paso se puede hacer automático? Los de simulación son la prueba y los hace el usuario. */
export const canApply = (step) => ['add', 'wire', 'config', 'rule'].includes(step.kind);

/** Hace el paso por el usuario. Devuelve un mensaje o lanza un error con el motivo. */
export function applyStep(tutorial, step, project) {
  switch (step.kind) {
    case 'add': {
      const comp = addComponent(project, step.type, step.at[0], step.at[1]);
      return `${comp.label} agregado.`;
    }
    case 'wire': {
      const a = find(tutorial, project, step.a[0]);
      const b = find(tutorial, project, step.b[0]);
      if (!a || !b) throw new Error('Primero agrega los dos componentes.');
      const result = connect(project, { c: a.id, p: step.a[1] }, { c: b.id, p: step.b[1] });
      if (!result.ok) throw new Error(result.error);
      return 'Conexión hecha.';
    }
    case 'config': {
      const comp = find(tutorial, project, step.as);
      comp.config[step.key] = step.value;
      return 'Valor ajustado.';
    }
    case 'rule': {
      const board = find(tutorial, project, step.as);
      board.config.rules = [...(board.config.rules ?? []), { ...step.rule }];
      return 'Regla agregada.';
    }
    default: throw new Error('Este paso lo haces tú: es la prueba de que funciona.');
  }
}

/** Qué resaltar en pantalla para el paso: un elemento del catálogo, puertos o un botón. */
export function stepTarget(tutorial, step, project) {
  switch (step.kind) {
    case 'add': return { palette: step.type };
    case 'wire': {
      const ports = [step.a, step.b].map(([as, p]) => ({ c: find(tutorial, project, as)?.id, p })).filter((x) => x.c);
      return { ports };
    }
    case 'config': return { component: find(tutorial, project, step.as)?.id, selector: step.key === 'ohms' ? '#ed-ohms' : `[data-param="${step.key}"]` };
    case 'rule': return { selector: '[data-action="add-rule"]' };
    case 'review': return { selector: '#tab-revision' };
    case 'run': return { selector: '#ed-run' };
    case 'act': return { component: find(tutorial, project, step.focus ?? step.as)?.id };
    case 'env': return { selector: `input[data-env="${step.key}"]` };
    case '3d': return { selector: '#ed-v3d' };
    default: return {};
  }
}
