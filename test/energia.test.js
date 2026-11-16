import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addComponent, connect } from '../src/editor/project.js';
import { createSim, advance, toggle, view, interaction } from '../src/editor/sim.js';
import { reviewEnergy, setEnv, windPower, rotor, turbinePower, pumpFlow, solarAt, energyText } from '../src/editor/energia.js';
import { filterCatalog, param } from '../src/editor/catalog.js';

const wire = (project, a, ap, b, bp) => {
  const r = connect(project, { c: a.id, p: ap }, { c: b.id, p: bp });
  assert.ok(r.ok, r.error);
  return r.link;
};
const add = (project, type, config = {}) => Object.assign(addComponent(project, type), { config: { ...config } });
const part = (sim, c) => sim.parts.get(c.id);
const codes = (project) => reviewEnergy(project).map((f) => f.code);

/** Casa solar aislada: panel → controlador → batería → inversor → casa. */
function casaSolar({ casa = 300, panel = 1000 } = {}) {
  const p = createProject({ system: 'renovables' });
  const pv = add(p, 'panel-solar', { watts: panel });
  const cc = add(p, 'controlador-carga');
  const bat = add(p, 'bateria', { capacidad: 2400, inicio: 50 });
  const inv = add(p, 'inversor');
  const home = add(p, 'carga-casa', { watts: casa });
  wire(p, pv, 'out', cc, 'in');
  wire(p, cc, 'bat', bat, 'bus');
  wire(p, bat, 'bus', inv, 'in');
  wire(p, inv, 'out', home, 'in');
  return { p, pv, cc, bat, inv, home };
}

test('el catálogo tiene el sistema de energías renovables con sus categorías', () => {
  const items = filterCatalog({ system: 'renovables' });
  for (const type of ['panel-solar', 'aerogenerador', 'turbina-hidraulica', 'bateria', 'inversor', 'bomba', 'tanque', 'multiplicadora', 'compresor']) {
    assert.ok(items.some((d) => d.type === type), type);
  }
  assert.ok(filterCatalog({ system: 'neumatica' }).some((d) => d.type === 'compresor'), 'el compresor también aparece en neumática');
});

test('fórmulas físicas básicas', () => {
  assert.equal(windPower(1000, 2), 0);
  assert.equal(windPower(1000, 12), 1000);
  assert.equal(windPower(1000, 30), 0);
  const r = rotor(1.5, 10);
  assert.ok(Math.abs(r.watts - 0.5 * 1.225 * Math.PI * 2.25 * 1000 * 0.4) < 1e-6);
  assert.ok(r.rpm > 400 && r.rpm < 500);
  assert.ok(Math.abs(turbinePower(10, 25) - 1962) < 1);
  assert.ok(Math.abs(pumpFlow(500, 17) - 1.799) < 0.01);
  assert.equal(solarAt(0), 0);
  assert.equal(solarAt(12), 1000);
});

test('cables de distinto tipo no se unen', () => {
  const p = createProject();
  const pv = add(p, 'panel-solar');
  const bomba = add(p, 'bomba');
  const r = connect(p, { c: pv.id, p: 'out' }, { c: bomba.id, p: 'eje' });
  assert.equal(r.ok, false);
  assert.match(r.error, /cable de potencia.*eje/);
});

test('casa solar: con sol el panel alimenta la casa y carga la batería', () => {
  const { p, pv, bat, home, inv } = casaSolar();
  assert.deepEqual(codes(p), []);
  const sim = createSim(p);
  setEnv(sim, 'sol', 1000);
  advance(sim, 1);
  assert.equal(part(sim, home).on, true);
  assert.ok(Math.abs(part(sim, pv).watts - 1000) < 1, 'usa los 1000 W del panel');
  // 1000 W × 0.96 = 960 W al bus; la casa pide 300 / 0.92 = 326 W; el resto carga la batería.
  assert.ok(Math.abs(part(sim, bat).watts - (960 - 300 / 0.92)) < 1);
  assert.ok(part(sim, bat).soc > 50);
  assert.match(energyText(sim, inv), /300 W/);
  const v = view(sim);
  assert.ok([...v.links.values()].every((state) => state === 'pw'), 'todos los cables de potencia llevan energía');
});

test('casa solar de noche: la batería se descarga y se protege al 10 %', () => {
  const { p, bat, home } = casaSolar({ casa: 1000 });
  const sim = createSim(p);
  setEnv(sim, 'sol', 0);
  setEnv(sim, 'escala', 600);
  advance(sim, 0.5);
  assert.equal(part(sim, home).on, true);
  assert.ok(part(sim, bat).watts < 0);
  advance(sim, 12);
  assert.ok(part(sim, bat).soc <= 10.01 && part(sim, bat).soc >= 9.9);
  assert.equal(part(sim, home).on, false, 'sin batería la casa se apaga');
  assert.ok(sim.events.some((e) => /se protege/.test(e.text)));
});

test('el inversor se protege si las cargas piden más que su potencia', () => {
  const { p, inv, home } = casaSolar({ casa: 3000 });
  const sim = createSim(p);
  advance(sim, 0.2);
  assert.equal(part(sim, inv).trip, true);
  assert.equal(part(sim, home).on, false);
  assert.ok(sim.events.some((e) => /sobrecarga/.test(e.text)));
});

test('con red eléctrica: exporta lo que sobra con la batería llena e importa de noche', () => {
  const p = createProject();
  const pv = add(p, 'panel-solar', { watts: 2000 });
  const red = add(p, 'red-electrica');
  const cc = add(p, 'controlador-carga', { watts: 3000 });
  const bat = add(p, 'bateria', { inicio: 100 });
  const inv = add(p, 'inversor', { watts: 3000 });
  const home = add(p, 'carga-casa', { watts: 500 });
  wire(p, pv, 'out', cc, 'in');
  wire(p, cc, 'bat', bat, 'bus');
  wire(p, bat, 'bus', inv, 'in');
  wire(p, inv, 'out', home, 'in');
  wire(p, red, 'out', home, 'in');
  const sim = createSim(p);
  setEnv(sim, 'sol', 1000);
  advance(sim, 1);
  assert.ok(part(sim, red).watts < -1000, 'exporta');
  assert.equal(part(sim, home).on, true);
  setEnv(sim, 'sol', 0);
  part(sim, bat).soc = 10;
  advance(sim, 1);
  assert.ok(Math.abs(part(sim, red).watts - 500) < 1, 'importa lo de la casa');
  assert.ok(sim.energy.totals.exportada > 0 && sim.energy.totals.importada > 0);
});

test('revisión: panel directo a la batería, CD con CA y tensión distinta', () => {
  const p = createProject();
  const pv = add(p, 'panel-solar');
  const bat = add(p, 'bateria', { volts: 24 });
  const lamp = add(p, 'lampara-cd', { volts: 12 });
  const foco = add(p, 'foco-ca');
  wire(p, pv, 'out', bat, 'bus');
  wire(p, bat, 'bus', lamp, 'in');
  wire(p, lamp, 'in', foco, 'in');
  const found = reviewEnergy(p);
  const byCode = Object.fromEntries(found.map((f) => [f.code, f]));
  assert.equal(byCode['generacion-a-bateria'].level, 'error');
  assert.equal(byCode['generacion-a-bateria'].suggest[0].type, 'controlador-carga');
  assert.equal(byCode['cd-con-ca'].suggest[0].type, 'inversor');
  assert.match(byCode['tension-cd'].text, /12 V/);
});

test('eólica mecánica: el rotor necesita multiplicadora para mover el generador', () => {
  const p = createProject();
  const wr = add(p, 'rotor-eolico');
  const gen = add(p, 'generador');
  wire(p, wr, 'eje', gen, 'eje');
  const lento = reviewEnergy(p).find((f) => f.code === 'eje-lento');
  assert.ok(lento);
  assert.equal(lento.suggest[0].type, 'multiplicadora');

  const q = createProject();
  const wr2 = add(q, 'rotor-eolico');
  const gb = add(q, 'multiplicadora', { relacion: 4 });
  const gen2 = add(q, 'generador');
  const cc = add(q, 'controlador-carga');
  const bat = add(q, 'bateria', { inicio: 20 });
  wire(q, wr2, 'eje', gb, 'lento');
  wire(q, gb, 'rapido', gen2, 'eje');
  wire(q, gen2, 'out', cc, 'in');
  wire(q, cc, 'bat', bat, 'bus');
  assert.ok(!codes(q).includes('eje-lento'));
  const sim = createSim(q);
  setEnv(sim, 'viento', 10);
  advance(sim, 0.5);
  const rpmRotor = part(sim, wr2).rpm;
  assert.ok(Math.abs(part(sim, gen2).rpm - rpmRotor * 4) < 1e-6, 'la multiplicadora cuadruplica la velocidad');
  assert.ok(part(sim, gen2).watts > 1000);
  assert.ok(part(sim, bat).watts > 900, 'la batería se carga con el viento');
  assert.ok(sim.energy.totals.eolica > 0);
});

test('bombeo con motor: llena el tanque y el flotador cierra a su nivel', () => {
  const p = createProject();
  const red = add(p, 'red-electrica');
  const motor = add(p, 'motor-ca', { watts: 750 });
  const bomba = add(p, 'bomba', { watts: 500 });
  const cis = add(p, 'cisterna');
  const tk = add(p, 'tanque', { capacidad: 1000, inicio: 0, altura: 15 });
  const ls = add(p, 'flotador', { nivel: 50 });
  wire(p, red, 'out', motor, 'in');
  wire(p, motor, 'eje', bomba, 'eje');
  wire(p, cis, 'agua', bomba, 'in');
  wire(p, bomba, 'out', tk, 'entrada');
  assert.deepEqual(codes(p).filter((c) => c !== 'puerto-energia-libre'), []);
  const sim = createSim(p);
  setEnv(sim, 'escala', 600);
  advance(sim, 0.5);
  assert.equal(part(sim, motor).rpm, 1750);
  // 500 W × 0.6 / (1000 × 9.81 × 17 m) = 1.8 L/s
  assert.ok(Math.abs(part(sim, bomba).q - pumpFlow(500, 17)) < 0.01);
  assert.ok(Math.abs(part(sim, red).watts - 500 / 0.85) < 2, 'el motor toma de la red lo que pide la bomba');
  assert.ok(part(sim, tk).litros > 0);
  advance(sim, 5);
  assert.equal(part(sim, ls).detect, true);
  assert.ok(sim.events.some((e) => /llegó a 50 %/.test(e.text)));
});

test('almacenamiento por bombeo: el tanque mueve la turbina y genera', () => {
  const p = createProject();
  const tk = add(p, 'tanque', { altura: 30, capacidad: 100000, inicio: 100 });
  const ht = add(p, 'turbina-hidraulica', { caudal: 10 });
  const gen = add(p, 'generador');
  const cis = add(p, 'cisterna');
  const red = add(p, 'red-electrica');
  const cc = add(p, 'controlador-carga');
  const bat = add(p, 'bateria', { inicio: 20 });
  wire(p, tk, 'salida', ht, 'in');
  wire(p, ht, 'out', cis, 'agua');
  wire(p, ht, 'eje', gen, 'eje');
  wire(p, gen, 'out', cc, 'in');
  wire(p, cc, 'bat', bat, 'bus');
  const sim = createSim(p);
  advance(sim, 0.5);
  // La turbina podría dar ${turbinePower(10, 30)} W, pero el generador de 1500 W solo toma 1500 / 0.9 en su eje.
  assert.ok(turbinePower(10, 30) > 2000);
  assert.ok(Math.abs(part(sim, ht).watts - 1500 / 0.9) < 1);
  assert.ok(Math.abs(part(sim, gen).gen - 1500) < 1, 'el generador podría dar 1500 W');
  // …pero la batería solo acepta 0.5 C = 1200 W, así que se aprovechan 1200 / 0.96 W.
  assert.ok(Math.abs(part(sim, gen).watts - 1200 / 0.96) < 1);
  assert.ok(part(sim, tk).litros < 100000, 'el tanque baja');
  assert.ok(sim.energy.totals.hidraulica > 0);
  assert.ok(red);
});

test('el río mueve la turbina; cerrar la válvula la detiene', () => {
  const p = createProject();
  const rio = add(p, 'rio', { altura: 25 });
  const va = add(p, 'valvula-agua');
  const ht = add(p, 'turbina-hidraulica', { caudal: 10 });
  const gen = add(p, 'generador');
  wire(p, rio, 'out', va, 'in');
  wire(p, va, 'out', ht, 'in');
  wire(p, ht, 'eje', gen, 'eje');
  const sim = createSim(p);
  setEnv(sim, 'rio', 15);
  advance(sim, 0.3);
  assert.ok(part(sim, ht).rpm > 0);
  assert.equal(interaction(va), 'toggle');
  toggle(sim, va.id);
  advance(sim, 0.3);
  assert.equal(part(sim, ht).rpm, 0);
});

test('compresor movido por motor alimenta un cilindro neumático', () => {
  const p = createProject();
  const red = add(p, 'red-electrica');
  const motor = add(p, 'motor-ca');
  const comp = add(p, 'compresor');
  const cil = add(p, 'cilindro-se');
  wire(p, red, 'out', motor, 'in');
  wire(p, motor, 'eje', comp, 'eje');
  wire(p, comp, 'out', cil, 'A');
  const sim = createSim(p);
  advance(sim, 2.5);
  assert.equal(part(sim, comp).on, true);
  assert.equal(Math.round(part(sim, cil).pos), 100, 'el cilindro sale con el aire del compresor');
});

test('mando combinado: el Arduino prende la bomba con un SSR', () => {
  const p = createProject();
  const red = add(p, 'red-electrica');
  const ssr = add(p, 'ssr');
  const motor = add(p, 'motor-ca');
  const bomba = add(p, 'bomba');
  const cis = add(p, 'cisterna');
  const tk = add(p, 'tanque', { capacidad: 500, inicio: 0 });
  const uno = addComponent(p, 'arduino-uno');
  wire(p, red, 'out', ssr, '1');
  wire(p, ssr, '2', motor, 'in');
  wire(p, motor, 'eje', bomba, 'eje');
  wire(p, cis, 'agua', bomba, 'in');
  wire(p, bomba, 'out', tk, 'entrada');
  wire(p, uno, 'D8', ssr, 'IN');
  wire(p, uno, 'GND', ssr, 'GND');
  uno.config.pins.D8 = { mode: 'output' };
  const sim = createSim(p);
  advance(sim, 0.3);
  assert.equal(part(sim, ssr).on, false);
  assert.equal(part(sim, bomba).q, 0, 'sin señal la bomba no gira');
  const s1 = addComponent(p, 'interruptor');
  wire(p, uno, 'D2', s1, '1');
  wire(p, s1, '2', uno, 'GND');
  uno.config.pins.D2 = { mode: 'input_pullup' };
  uno.config.rules = [{ input: 'D2', cond: 'activa', action: 'seguir', output: 'D8' }];
  const sim2 = createSim(p);
  advance(sim2, 0.3);
  assert.equal(sim2.parts.get(ssr.id).on, false);
  toggle(sim2, s1.id);
  advance(sim2, 0.5);
  assert.equal(sim2.parts.get(ssr.id).on, true, 'el pin D8 cierra el SSR');
  assert.ok(sim2.parts.get(bomba.id).q > 0, 'la bomba sube agua');
});

test('la contactora de 24 V conecta una carga de potencia desde el mando electroneumático', () => {
  const p = createProject();
  const red = add(p, 'red-electrica');
  const km = add(p, 'contactor');
  const foco = add(p, 'foco-ca');
  const f24 = addComponent(p, 'fuente-24');
  const s1 = addComponent(p, 'interruptor');
  wire(p, red, 'out', km, '1');
  wire(p, km, '2', foco, 'in');
  wire(p, f24, '+24', s1, '1');
  wire(p, s1, '2', km, 'A1');
  wire(p, km, 'A2', f24, '0V');
  const sim = createSim(p);
  advance(sim, 0.2);
  assert.equal(part(sim, foco).on, false);
  toggle(sim, s1.id);
  advance(sim, 0.2);
  assert.equal(part(sim, km).on, true);
  assert.equal(part(sim, foco).on, true);
});

test('los parámetros respetan sus límites y opciones', () => {
  const p = createProject();
  const bat = add(p, 'bateria', { volts: 30, capacidad: -5 });
  assert.equal(param(bat, 'volts'), 12);
  assert.equal(param(bat, 'capacidad'), 100);
  assert.equal(param(bat, 'inicio'), 50);
});

test('perfil del viento: más altura, más viento, según el terreno (ley de Hellmann)', async () => {
  const { windAtHeight } = await import('../src/editor/energia.js');
  assert.equal(windAtHeight(8, 10, 0.143), 8, 'a 10 m es el viento medido');
  assert.ok(Math.abs(windAtHeight(8, 30, 0.143) - 8 * 3 ** 0.143) < 1e-9);
  assert.ok(Math.abs(windAtHeight(8, 30, 0.143) - 9.36) < 0.01, 'a 30 m en campo abierto: ≈ 9.4 m/s');
  assert.ok(windAtHeight(8, 30, 0.3) > windAtHeight(8, 30, 0.1), 'en la ciudad crece más con la altura que sobre el mar');
  assert.ok(windAtHeight(8, 5, 0.143) < 8, 'abajo de 10 m hay menos viento');
});

test('radiación con la altitud del sitio (Meinel con corrección de Laue)', async () => {
  const { altitudeFactor, laue } = await import('../src/editor/energia.js');
  assert.equal(altitudeFactor(0), 1);
  assert.ok(Math.abs(laue(0) - 0.846) < 0.002, 'nivel del mar, AM 1.5: ≈ 846 W/m² de radiación directa');
  assert.ok(Math.abs(altitudeFactor(2240) - 1.188) < 0.005, 'Ciudad de México: ≈ 19 % más');
  assert.ok(altitudeFactor(4000) > altitudeFactor(2240));
});

test('una torre más alta y un sitio más alto dan más energía en la simulación', () => {
  const potencia = (type, config, env) => {
    const p = createProject();
    const src = add(p, type, config);
    const cc = add(p, 'controlador-carga', { watts: 20000 });
    const bat = add(p, 'bateria', { capacidad: 100000, inicio: 10 });
    wire(p, src, 'out', cc, 'in');
    wire(p, cc, 'bat', bat, 'bus');
    const sim = createSim(p);
    for (const [k, v] of Object.entries(env)) setEnv(sim, k, v);
    advance(sim, 0.2);
    return part(sim, src);
  };
  const baja = potencia('aerogenerador', { watts: 5000, altura: 10 }, { viento: 7 });
  const alta = potencia('aerogenerador', { watts: 5000, altura: 40 }, { viento: 7 });
  assert.ok(alta.wind > baja.wind && alta.watts > baja.watts * 1.4, 'a 40 m sopla más y la potencia sube con el cubo');
  const mar = potencia('panel-solar', { watts: 1000, altitud: 0 }, { sol: 800 });
  const cdmx = potencia('panel-solar', { watts: 1000, altitud: 2240 }, { sol: 800 });
  assert.ok(Math.abs(cdmx.watts / mar.watts - 1.188) < 0.01);
  assert.ok(Math.abs(cdmx.irr - 800 * 1.188) < 5);
  // La altura de montaje del panel no cambia la energía, solo el dibujo.
  assert.equal(potencia('panel-solar', { watts: 1000, altura: 12 }, { sol: 800 }).watts, mar.watts);
});

test('revisión: el rotor eólico alto gira más rápido y puede no necesitar tanta multiplicación', () => {
  const p = createProject();
  const wr = add(p, 'rotor-eolico', { altura: 10 });
  const gen = add(p, 'generador');
  wire(p, wr, 'eje', gen, 'eje');
  const baja = reviewEnergy(p).find((f) => f.code === 'eje-lento');
  wr.config.altura = 80;
  const alta = reviewEnergy(p).find((f) => f.code === 'eje-lento');
  const rpm = (f) => Number(f.text.match(/giraría a (\d+) rpm/)[1]);
  assert.ok(rpm(alta) > rpm(baja));
});
