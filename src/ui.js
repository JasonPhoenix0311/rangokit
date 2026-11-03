import {
  AIR, CHECKS, DT, ELEC, PRESS_AT, RELEASE_AT, SENSOR_HOME,
  createState, diagnose, solve, tick,
} from './practices/p01.js';

const $ = (id) => document.getElementById(id);

const SCENARIOS = [
  { id: 'ok', label: 'Sin falla', cfg: {} },
  { id: 'cable', label: 'Cable suelto', cfg: { broken: ['W8'] } },
  { id: 'sensor', label: 'Sensor mal colocado', cfg: { s2pos: 112 } },
  { id: 'coil', label: 'Bobina sin 24 V', cfg: { broken: ['W6'] } },
  { id: 'air', label: 'Sin aire', cfg: { supply: false } },
];

const HINT_KINDS = ['Pista', 'Componente', 'Corrección'];

// Geometría del plano. Cada trazo va del lado positivo al negativo para animar la corriente.
const WIRES = {
  W1: 'M150 30 V80',
  W8: 'M150 80 H270 V110',
  W9: 'M270 150 V180 H150',
  W2: 'M150 180 V210',
  W3: 'M150 250 V300',
  W4: 'M150 340 V410',
  W5: 'M430 30 V110',
  W6: 'M430 150 V300',
  W7: 'M430 340 V410',
};
const HOSES = {
  H1: 'M320 345 V270',
  H2: 'M300 220 V170 H175 V100',
  H3: 'M340 220 V150 H385 V100',
};

const px = (mm) => 170 + mm * 1.8;

let app = {};

function netGroup(id, d, label) {
  return `<g class="net" id="e-${id}" data-id="${id}" tabindex="0" role="button" aria-label="${label}">
    <path class="hit" d="${d}"/><path class="base" d="${d}"/><path class="pulse" d="${d}"/></g>`;
}

function contact(id, x, y1, y2, { nc = false, tag = '', t1 = '', t2 = '', push = false } = {}) {
  const top = y1 + 9;
  const bottom = y2 - 9;
  return `<g class="sym">
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${top}"/>
    <line x1="${x}" y1="${bottom}" x2="${x}" y2="${y2}"/>
    ${nc ? `<line x1="${x - 2}" y1="${top}" x2="${x + 10}" y2="${top}"/>` : ''}
    ${push ? `<path d="M${x - 30} ${(y1 + y2) / 2 - 7} v14 M${x - 30} ${(y1 + y2) / 2} H${x - 8}" stroke-dasharray="4 3"/>` : ''}
  </g>
  <line class="blade" id="b-${id}" x1="${x}" y1="${bottom}" x2="${x - 13}" y2="${top + 3}"/>
  <text class="tag" x="${x + 15}" y="${(y1 + y2) / 2 + 5}">${tag}</text>
  <text class="sm" x="${x + 15}" y="${y1 + 9}">${t1}</text>
  <text class="sm" x="${x + 15}" y="${y2 - 1}">${t2}</text>`;
}

function setBlade(id, x, closed, top) {
  const blade = $(`b-${id}`);
  blade.setAttribute('x2', closed ? x : x - 13);
  blade.setAttribute('y2', closed ? top : top + 3);
}

function coil(id, x, tag, a1, a2) {
  return `<rect class="coil" id="c-${id}" x="${x - 24}" y="300" width="48" height="40"/>
    <text class="tag" x="${x + 32}" y="325">${tag}</text>
    <text class="sm" x="${x + 8}" y="295">${a1}</text>
    <text class="sm" x="${x + 8}" y="354">${a2}</text>`;
}

function drawLadder() {
  const wires = Object.entries(WIRES).map(([id, d]) => {
    const edge = ELEC.find((e) => e.id === id);
    return netGroup(id, d, `Cable ${id}, de ${edge.from} a ${edge.to}. Activa para soltarlo o reconectarlo.`);
  }).join('');
  $('ladder').innerHTML = `
    <line class="rail plus" x1="40" y1="30" x2="560" y2="30"/>
    <line class="rail" x1="40" y1="410" x2="560" y2="410"/>
    <text class="tag" x="12" y="22">+24 V</text>
    <text class="tag" x="12" y="402">0 V</text>
    ${wires}
    ${contact('S1', 150, 110, 150, { tag: 'S1', t1: '13', t2: '14', push: true })}
    ${contact('K1a', 270, 110, 150, { tag: 'K1', t1: '13', t2: '14' })}
    ${contact('S2', 150, 210, 250, { nc: true, tag: 'S2', t1: '1', t2: '2' })}
    ${contact('K1b', 430, 110, 150, { tag: 'K1', t1: '23', t2: '24' })}
    ${coil('K1', 150, 'K1', 'A1', 'A2')}
    ${coil('Y1', 430, 'Y1', '+', '−')}
    <g class="sm-wires">
      ${Object.keys(WIRES).map((id) => {
        const pos = { W1: [156, 62], W8: [205, 74], W9: [205, 174], W2: [156, 200], W3: [156, 280], W4: [156, 385], W5: [436, 75], W6: [436, 230], W7: [436, 385] }[id];
        return `<text class="sm" x="${pos[0]}" y="${pos[1]}">${id}</text>`;
      }).join('')}
    </g>
    <circle class="filled" cx="150" cy="80" r="4" fill="currentColor"/>
    <circle class="filled" cx="150" cy="180" r="4" fill="currentColor"/>
    <text class="sm" x="146" y="436">1</text>
    <text class="sm" x="426" y="436">2</text>
    <text class="sm" x="190" y="436">K1: 13-14 en 1 · 23-24 en 2</text>`;
}

function drawPneumatic() {
  const hoses = Object.entries(HOSES).map(([id, d]) => {
    const edge = AIR.find((e) => e.id === id);
    return netGroup(id, d, `Manguera ${id}, de ${edge.from} a ${edge.to}. Activa para soltarla o reconectarla.`);
  }).join('');
  const ticks = [0, 50, 100].map((mm) => `
    <line class="sym" x1="${px(mm)}" y1="108" x2="${px(mm)}" y2="116" stroke="currentColor"/>
    <text class="sm" x="${px(mm)}" y="128" text-anchor="middle">${mm}</text>`).join('');
  $('pneu').innerHTML = `
    <rect class="chamber" id="rear" x="151" y="41" width="10" height="58"/>
    <rect class="chamber" id="front" x="200" y="41" width="10" height="58"/>
    <rect class="rod" id="rod" x="180" y="64" width="240" height="12"/>
    <rect class="piston" id="piston" x="164" y="41" width="12" height="58"/>
    <g class="sym">
      <rect x="150" y="40" width="250" height="60"/>
      <line x1="${px(100) + 8}" y1="40" x2="${px(100) + 8}" y2="50"/>
      <line x1="${px(100) + 8}" y1="90" x2="${px(100) + 8}" y2="100"/>
    </g>
    <text class="tag" x="100" y="76">1A</text>
    <text class="sm" x="402" y="118">mm</text>
    ${ticks}
    <g class="sensor" id="sensor"><rect x="-18" y="14" width="36" height="22"/><text class="sm" x="0" y="30" text-anchor="middle">S2</text><line x1="0" y1="36" x2="0" y2="40" stroke="currentColor" stroke-width="2"/></g>
    ${hoses}
    <g class="valve" id="valve">
      <g class="sym">
        <rect x="215" y="220" width="70" height="50"/>
        <rect x="285" y="220" width="70" height="50"/>
        <path d="M250 270 L230 220 M230 220 l-1 11 M230 220 l9 7"/>
        <path d="M270 220 L272 270 M272 270 l-5 -9 M272 270 l6 -9"/>
        <path d="M320 270 L340 220 M340 220 l-9 7 M340 220 l1 11"/>
        <path d="M300 220 L298 270 M298 270 l-6 -9 M298 270 l5 -9"/>
        <rect x="183" y="233" width="32" height="24"/>
        <path d="M190 257 L207 233"/>
        <path d="M355 245 l8 -10 l8 20 l8 -20 l8 20 l8 -10"/>
      </g>
      <text class="tag" x="158" y="232" id="y1-tag">Y1</text>
    </g>
    <g class="sym">
      <polygon points="292,278 304,278 298,289"/>
      <polygon points="336,278 348,278 342,289"/>
      <line x1="298" y1="270" x2="298" y2="278"/>
      <line x1="342" y1="270" x2="342" y2="278"/>
      <circle cx="320" cy="412" r="9"/>
      <circle class="filled" cx="320" cy="412" r="3"/>
    </g>
    <text class="sm" x="286" y="214">4</text><text class="sm" x="345" y="214">2</text>
    <text class="sm" x="280" y="288">5</text><text class="sm" x="325" y="284">1</text><text class="sm" x="352" y="288">3</text>
    <text class="tag" x="365" y="232">1V1</text>
    <path class="feed" d="M320 403 V375"/>
    <g class="tap" id="tap" tabindex="0" role="button" aria-label="Llave de paso 0Z1. Activa para abrirla o cerrarla.">
      <rect class="hit" x="288" y="340" width="64" height="40"/>
      <path class="bow" d="M308 345 L332 375 L332 345 L308 375 Z"/>
    </g>
    <text class="tag" x="345" y="365">0Z1</text>
    <text class="sm" x="338" y="416">6 bar</text>
    <text class="sm" x="162" y="166">H2</text><text class="sm" x="392" y="136">H3</text><text class="sm" x="326" y="315">H1</text>`;
}

function renderChips() {
  $('chips').innerHTML = SCENARIOS.map((scenario) =>
    `<button type="button" id="sc-${scenario.id}" data-id="${scenario.id}" aria-pressed="${app.scenario === scenario.id}">${scenario.label}</button>`).join('');
}

function configOf(scenario) {
  return { broken: [...(scenario.cfg.broken ?? [])], s2pos: scenario.cfg.s2pos ?? SENSOR_HOME, supply: scenario.cfg.supply ?? true };
}

function cfgFromApp() {
  return { broken: [...app.cfg.broken], s2pos: app.cfg.s2pos, supply: app.cfg.supply };
}

function resetSim() {
  app.sim = createState(cfgFromApp());
  app.run = null;
  app.paused = false;
  app.seen = 0;
  app.logItems = [];
}

function clearResult() {
  app.result = null;
  app.hint = 0;
}

function loadScenario(id) {
  app.scenario = id;
  app.cfg = configOf(SCENARIOS.find((scenario) => scenario.id === id));
  app.userCut = new Set();
  clearResult();
  resetSim();
  renderChips();
  syncControls();
  renderDiagnosis();
}

function startTest() {
  resetSim();
  clearResult();
  app.run = { expected: diagnose(cfgFromApp()) };
  renderDiagnosis();
}

function finishTest() {
  app.result = app.run.expected;
  app.hint = app.result.ok ? 0 : 1;
  app.run = null;
  app.sim.s1 = false;
  renderDiagnosis();
}

function toggleBreak(id) {
  const at = app.cfg.broken.indexOf(id);
  if (at >= 0) {
    app.cfg.broken.splice(at, 1);
    app.userCut.delete(id);
  } else {
    app.cfg.broken.push(id);
    app.userCut.add(id);
  }
  app.sim.broken = new Set(app.cfg.broken);
  markCustom();
}

function markCustom() {
  app.scenario = null;
  app.run = null;
  app.paused = false;
  clearResult();
  renderChips();
  renderDiagnosis();
}

function applyFix() {
  const fix = app.result.fix;
  if (fix.kind === 'reconnect') {
    app.cfg.broken = app.cfg.broken.filter((id) => id !== fix.id);
    app.userCut.delete(fix.id);
  }
  if (fix.kind === 'open-air') app.cfg.supply = true;
  if (fix.kind === 'sensor') app.cfg.s2pos = fix.pos;
  app.scenario = null;
  renderChips();
  syncControls();
  startTest();
}

function syncControls() {
  $('s2pos').value = app.cfg.s2pos;
  $('s2val').textContent = `${app.cfg.s2pos} mm`;
}

function setChecks(result) {
  const failed = result && !result.ok ? result.failedCheck : result ? CHECKS.length : -1;
  $('checks').innerHTML = CHECKS.map((label, index) => {
    let state = ['pend', 'Pendiente'];
    if (result && index < failed) state = ['pass', 'Cumple'];
    if (result && index === failed) state = ['fail', 'Falla'];
    return `<li><span class="mark ${state[0]}">${state[1]}</span><span>${label}</span></li>`;
  }).join('');
}

function renderDiagnosis() {
  const result = app.result;
  const verdict = $('verdict');
  verdict.className = `verdict ${result ? (result.ok ? 'pass' : 'fail') : ''}`;
  if (app.run) verdict.textContent = 'Probando la práctica…';
  else if (!result) verdict.textContent = 'Sin probar. Pulsa S1 o usa Probar práctica.';
  else if (result.ok) verdict.textContent = `Funciona: recorre ${result.stroke} mm y regresa en ${result.cycle.toFixed(1)} s.`;
  else verdict.textContent = 'La práctica no cumple.';
  setChecks(result);

  const box = $('finding');
  box.hidden = !result || result.ok;
  if (!box.hidden) {
    $('symptom').textContent = result.symptom;
    const steps = [result.hint, result.component, result.correction];
    $('hints').innerHTML = steps.map((text, index) => {
      const open = index < app.hint;
      const extra = open && index === 1
        ? `<span class="evidence">${result.evidence.join(' · ')}</span>` : '';
      return `<li class="${open ? '' : 'locked'}"><span class="kind">${HINT_KINDS[index]}</span>
        <span>${open ? text : 'Oculta'}</span>${extra}</li>`;
    }).join('');
    $('more').hidden = app.hint >= 3;
    $('fix').hidden = app.hint < 3;
    $('used').textContent = `${app.hint} de 3 pistas usadas`;
  }
}

function renderLog() {
  const events = app.sim.events;
  if (app.seen !== events.length) {
    for (const event of events.slice(app.seen)) app.logItems.unshift(event);
    app.logItems = app.logItems.slice(0, 7);
    app.seen = events.length;
    $('log').innerHTML = app.logItems.map((event) =>
      `<li><time>${event.t.toFixed(2)} s</time><span>${event.text}</span></li>`).join('');
  }
  if (!app.logItems.length) $('log').innerHTML = '<li class="empty">Aquí aparece cada cambio del circuito.</li>';
}

function render() {
  const s = app.sim;
  const sol = solve(s);
  const fault = app.result && !app.result.ok && app.hint >= 2 ? app.result.target : null;

  for (const edge of ELEC.filter((e) => e.type === 'wire')) {
    const node = $(`e-${edge.id}`);
    const cut = s.broken.has(edge.id);
    const on = sol.hot.has(edge.a) && sol.hot.has(edge.b);
    node.setAttribute('class', `net${on ? ' on' : ''}${sol.current.has(edge.id) ? ' flow' : ''}${cut && (app.userCut.has(edge.id) || fault === edge.id) ? ' cut' : ''}${fault === edge.id ? ' fault' : ''}`);
  }
  for (const edge of AIR.filter((e) => e.type === 'hose')) {
    const node = $(`e-${edge.id}`);
    const cut = s.broken.has(edge.id);
    const pressed = sol.air.has(edge.a) && sol.air.has(edge.b);
    const toRear = edge.id === 'H2';
    const toFront = edge.id === 'H3';
    const moving = sol.moving !== 0 && s.x > 0 && s.x < 100 || (sol.moving === 1 && s.x === 0) || (sol.moving === -1 && s.x === 100);
    const feeding = moving && pressed;
    const venting = moving && ((toRear && sol.moving === -1) || (toFront && sol.moving === 1));
    node.setAttribute('class', `net${pressed ? ' pressed' : ''}${feeding ? ' flow' : ''}${venting && !pressed ? ' vent' : ''}${cut && (app.userCut.has(edge.id) || fault === edge.id) ? ' cut' : ''}${fault === edge.id ? ' fault' : ''}`);
  }

  setBlade('S1', 150, s.s1, 119);
  setBlade('K1a', 270, s.k1, 119);
  setBlade('K1b', 430, s.k1, 119);
  setBlade('S2', 150, !s.sensed, 219);
  $('c-K1').setAttribute('class', `coil${sol.k1Coil ? ' on' : ''}`);
  $('c-Y1').setAttribute('class', `coil${sol.y1Coil ? ' on' : ''}`);

  const piston = px(s.x);
  $('piston').setAttribute('x', piston - 6);
  $('rod').setAttribute('x', piston + 6);
  $('rear').setAttribute('width', Math.max(0, piston - 157));
  $('front').setAttribute('x', piston + 6);
  $('front').setAttribute('width', Math.max(0, 399 - piston - 6));
  $('rear').setAttribute('class', `chamber${sol.air.has('rear') ? ' on' : ''}`);
  $('front').setAttribute('class', `chamber${sol.air.has('front') ? ' on' : ''}`);
  $('valve').setAttribute('class', `valve${s.spool ? ' shift' : ''}`);
  const sensor = $('sensor');
  sensor.setAttribute('transform', `translate(${px(s.s2pos)} 0)`);
  sensor.setAttribute('class', `sensor${s.sensed ? ' on' : ''}${fault === 'S2' ? ' fault' : ''}`);
  $('tap').setAttribute('class', `tap${s.supply ? '' : ' closed'}${fault === 'V0' ? ' fault' : ''}`);

  $('r-x').textContent = `${Math.round(s.x)} mm`;
  $('r-p').textContent = sol.air.has('P') ? '6 bar' : '0 bar';
  $('l-k1').classList.toggle('on', s.k1);
  $('l-y1').classList.toggle('on', sol.y1Coil);
  $('l-s2').classList.toggle('on', s.sensed);

  const stepping = $('stepmode').checked;
  $('next').hidden = !stepping;
  $('next').disabled = !app.paused;
  $('s1').disabled = !!app.run;
  renderLog();
}

function advance(seconds) {
  let left = seconds;
  while (left > 1e-9 && !app.paused) {
    const s = app.sim;
    if (app.run) {
      if (s.t >= PRESS_AT && s.t < RELEASE_AT) s.s1 = true;
      if (s.t >= RELEASE_AT) s.s1 = false;
    }
    const before = s.events.length;
    tick(s);
    left -= DT;
    if ($('stepmode').checked && s.events.length !== before) app.paused = true;
    if (app.run && s.t >= app.run.expected.endT) finishTest();
  }
}

function loop(now) {
  const elapsed = Math.min(0.05, (now - app.last) / 1000);
  app.last = now;
  advance(elapsed);
  render();
  requestAnimationFrame(loop);
}

function bindPress() {
  const button = $('s1');
  const press = (down) => {
    if (app.run) return;
    app.sim.s1 = down;
    button.classList.toggle('down', down);
  };
  button.addEventListener('pointerdown', (event) => {
    button.setPointerCapture(event.pointerId);
    press(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, () => press(false));
  }
  button.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      press(true);
    }
  });
  button.addEventListener('keyup', () => press(false));
  button.addEventListener('blur', () => press(false));
}

function activate(element, handler) {
  element.addEventListener('click', handler);
  element.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      handler();
    }
  });
}

function bind() {
  $('chips').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) loadScenario(button.dataset.id);
  });
  $('test').addEventListener('click', startTest);
  $('reset').addEventListener('click', () => {
    resetSim();
    clearResult();
    renderDiagnosis();
  });
  $('next').addEventListener('click', () => { app.paused = false; });
  $('stepmode').addEventListener('change', (event) => {
    if (!event.target.checked) app.paused = false;
  });
  $('more').addEventListener('click', () => {
    app.hint = Math.min(3, app.hint + 1);
    renderDiagnosis();
  });
  $('fix').addEventListener('click', applyFix);
  $('s2pos').addEventListener('input', (event) => {
    app.cfg.s2pos = Number(event.target.value);
    app.sim.s2pos = app.cfg.s2pos;
    $('s2val').textContent = `${app.cfg.s2pos} mm`;
    markCustom();
  });
  for (const id of [...Object.keys(WIRES), ...Object.keys(HOSES)]) {
    activate($(`e-${id}`), () => toggleBreak(id));
  }
  activate($('tap'), () => {
    app.cfg.supply = !app.cfg.supply;
    app.sim.supply = app.cfg.supply;
    markCustom();
  });
  bindPress();
}

function start() {
  drawLadder();
  drawPneumatic();
  loadScenario('cable');
  app.result = diagnose(cfgFromApp());
  app.hint = 1;
  renderDiagnosis();
  bind();
  app.last = performance.now();
  requestAnimationFrame(loop);
}

start();
