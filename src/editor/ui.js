// Interfaz del editor de proyectos: lista de proyectos, catálogo, plano, propiedades y panel de Arduino.
import { SYSTEMS, CATEGORIES, LED_COLORS, definition, filterCatalog, placePort, rotatedSize, glyphTransform, ledColor } from './catalog.js';
import { createProject, addComponent, removeComponent, connect, removeLink, reviewWiring, parseProject, keyOf } from './project.js';
import { boards, pinRows, reviewArduino, generateSketch, PIN_MODES, CONDITIONS, ACTIONS } from './arduino.js';
import { COMMON_OHMS, formatOhms } from './calc.js';
import { TEMPLATES, buildTemplate, matchProblem, analyzeProject, templateSteps, missingFor, learningSummary } from './rango.js';
import { SEARCH, searchProjects, rankRepos } from './web.js';
import { createSim, advance, press, toggle, setValue, view, interaction, SIM } from './sim.js';
import { cylinderGlyph } from './catalog.js';
import { startConversation, respond, say, normalizeConversation, userText } from './dialog.js';

const LEARN_KEY = 'rangokit.aprendizaje';
const USEFUL_KEY = 'rangokit.utiles';
const MAX_LEARNED = 300;

function loadList(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* sin almacenamiento: lo aprendido dura hasta cerrar la página */ }
}

// Acciones que cambian el proyecto: si la simulación está corriendo, se detiene antes.
const EDIT_ACTIONS = new Set(['add', 'add-suggested', 'add-missing', 'template-here', 'delete-selection', 'rotate', 'duplicate',
  'led-color', 'set-ohms', 'add-rule', 'remove-rule', 'chat-build', 'chat-extra']);

function chatAction(action, target) {
  const dialog = $('rango-chat');
  const id = target.dataset.id;
  const template = TEMPLATES.find((t) => t.id === id);
  const state = () => chatState();
  // Si la propuesta era exacta y el estudiante la usa, Rango aprende de su enunciado.
  const teach = () => {
    const last = [...state().messages].reverse().find((m) => m.proposal);
    if (last?.proposal.exact && last.proposal.templateId === id) learn(userText(state()), id);
  };
  if (action === 'chat-open') openChat();
  else if (action === 'chat-close') dialog?.close();
  else if (action === 'chat-reset') {
    setChat(startConversation());
    $('chat-input').focus();
  } else if (action === 'chat-chip' || action === 'chat-change') {
    chatSend({ slot: target.dataset.slot, value: target.dataset.value, label: target.dataset.label });
  } else if (action === 'chat-hint') {
    setChat(say(state(), `Pista: ${template.concept}`, {
      actions: [{ action: 'chat-build', label: 'Agregar los componentes', id }, { action: 'chat-example', label: 'Abrir el ejemplo armado', id }],
    }));
  } else if (action === 'chat-build') {
    teach();
    const added = addMissingFor(id);
    ed.rango = { analyzed: true, templateId: id, level: 3, feedback: null };
    setChat(say(state(), added
      ? `Listo: agregué ${added} componentes al plano, acomodados como en el ejemplo. Ahora conéctalos; en la pestaña Rango tienes la lista de conexiones paso a paso. Cuando termines, prueba con ▶ Ejecutar.`
      : 'Ya tienes todos los componentes de este proyecto en el plano. Revisa las conexiones en la pestaña Rango y prueba con ▶ Ejecutar.', {
      actions: [{ action: 'chat-done', label: 'Ver las conexiones' }],
    }));
  } else if (action === 'chat-done') {
    dialog?.close();
    ed.tab = 'rango';
    renderInspector();
  } else if (action === 'chat-example') {
    teach();
    dialog?.close();
    const example = buildTemplate(template.id, `Ejemplo: ${template.title}`);
    example.problem = ed.project.problem;
    ed.projects.push(example);
    saveAll();
    openProject(example.id);
    setStatus('Este es el ejemplo de Rango. Tu proyecto sigue guardado en Mis proyectos. Prueba ▶ Ejecutar para verlo funcionar.');
  } else if (action === 'chat-web') {
    dialog?.close();
    ed.tab = 'rango';
    ed.rango = { analyzed: true, templateId: id, level: 1, feedback: null };
    renderInspector();
    $('ed-web-terms')?.focus();
    setStatus('Revisa las palabras de búsqueda y presiona "Buscar en GitHub". Solo se envían esas palabras.');
  } else if (action === 'chat-practice') {
    dialog?.close();
    showSection('practice');
  } else if (action === 'chat-extra') {
    const component = addAt(target.dataset.type, ...viewCenter(target.dataset.type));
    setChat(say(state(), `Agregué ${component.label} (${definition(component.type).name.toLowerCase()}) al plano. Conéctalo como te dije y revísalo en Revisión.`));
  }
}

/** Guarda una respuesta del estudiante para que el clasificador aprenda de ella. */
function learn(text, label) {
  const clean = String(text ?? '').trim().slice(0, 1000);
  if (!clean) return;
  ed.learned = [...ed.learned.filter((item) => !(item.text === clean && item.label === label)), { text: clean, label, date: new Date().toISOString() }].slice(-MAX_LEARNED);
  saveList(LEARN_KEY, ed.learned);
}

function currentTemplateId() {
  return ed.rango.templateId ?? matchProblem(ed.project.problem, ed.learned)?.best?.template.id ?? null;
}

function webSearch() {
  const id = currentTemplateId();
  if (!id) return;
  const terms = ($('ed-web-terms')?.value ?? '').trim() || SEARCH[id][0];
  ed.web = { status: 'loading', templateId: id, query: terms, repos: [], error: '' };
  renderInspector();
  searchProjects(terms, { fallback: terms === SEARCH[id][0] ? SEARCH[id][1] : undefined, useful: ed.useful })
    .then((result) => {
      ed.web = { status: 'done', templateId: id, query: result.query, repos: result.repos, error: '' };
    })
    .catch((error) => {
      const offline = error instanceof TypeError;
      ed.web = { status: 'error', templateId: id, query: terms, repos: [], error: offline ? 'No hay conexión con GitHub. Revisa tu internet e intenta de nuevo.' : error.message };
    })
    .finally(() => {
      if (ed.view === 'edit' && ed.tab === 'rango') renderInspector();
    });
}

const STORAGE_KEY = 'rangokit.proyectos';
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const GRID = 10;

const $ = (id) => document.getElementById(id);
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snap = (value) => Math.round(value / GRID) * GRID;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const systemLabel = (id) => (id === 'todos' ? 'Mixto' : SYSTEMS.find((s) => s.id === id)?.label ?? 'Mixto');
const isInputMode = (mode) => mode === 'input' || mode === 'input_pullup' || mode === 'analog';

const ed = {
  view: 'list',
  projects: [],
  project: null,
  storageOk: true,
  filter: { system: 'todos', category: 'todas', query: '' },
  selected: null,
  pending: null,
  tab: 'componente',
  board: null,
  drag: null,
  suppressClick: false,
  zoom: 1,
  rango: { analyzed: false, templateId: null, level: 0, feedback: null },
  learned: [],
  useful: [],
  web: { status: 'idle', templateId: null, query: '', repos: [], error: '' },
  sim: null,
  simView: null,
  simFrame: 0,
  simLast: 0,
  simSignature: '',
  holding: null,
};

// Almacenamiento local. Si el navegador lo bloquea, el editor sigue funcionando y se avisa.
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((item) => {
      try { return parseProject(item); } catch { return null; }
    }).filter(Boolean);
  } catch {
    ed.storageOk = false;
    return [];
  }
}

function saveAll() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ed.projects));
    ed.storageOk = true;
  } catch {
    ed.storageOk = false;
  }
}

function touch() {
  ed.project.updated = new Date().toISOString();
  saveAll();
}

function setStatus(text, kind = '') {
  const status = $('ed-status');
  if (!status) return;
  status.textContent = text;
  status.className = `ed-status ${kind}`;
}

// Navegación entre la práctica guiada y los proyectos.
function showSection(name) {
  const projects = name === 'projects';
  if (!projects) stopSim('');
  $('view-practice').hidden = projects;
  $('view-editor').hidden = !projects;
  $('goal').hidden = projects;
  $('sheet-id').textContent = projects ? 'Proyectos libres · Beta' : 'Práctica 01 · Rev. A';
  $('nav-practice').setAttribute('aria-pressed', String(!projects));
  $('nav-projects').setAttribute('aria-pressed', String(projects));
  if (projects) {
    if (ed.view === 'edit' && ed.project) renderEditor();
    else renderList();
  }
}

// Lista de proyectos.
function renderList() {
  stopSim('');
  ed.view = 'list';
  ed.project = null;
  const items = [...ed.projects].sort((a, b) => b.updated.localeCompare(a.updated));
  const systemOptions = SYSTEMS.map((s) => `<option value="${s.id}">${s.id === 'todos' ? 'Mixto (todos los componentes)' : esc(s.label)}</option>`).join('');
  $('view-editor').innerHTML = `
    <section class="projects">
      <div class="projects-head">
        <h2>Mis proyectos</h2>
        <div class="runs">
          <button type="button" class="primary" data-action="new">Nuevo proyecto</button>
          <button type="button" data-action="import">Importar archivo</button>
          <input type="file" id="ed-file" accept=".json,application/json" hidden>
        </div>
      </div>
      <form class="new-project" id="ed-form" hidden>
        <label>Nombre<input id="ed-new-name" required maxlength="80" placeholder="Ej. Estampadora con enclavamiento"></label>
        <label>Tipo de sistema<select id="ed-new-system">${systemOptions}</select></label>
        <label class="wide">Problema o tarea (opcional)<textarea id="ed-new-problem" rows="3" placeholder="Pega el enunciado y Rango te ayuda a resolverlo."></textarea></label>
        <div class="runs">
          <button type="submit" class="primary">Crear</button>
          <button type="button" data-action="cancel-new">Cancelar</button>
        </div>
      </form>
      ${items.length ? `<ul class="project-list">${items.map((p) => `
        <li>
          <div>
            <b>${esc(p.name)}</b>
            <span class="tip">${esc(systemLabel(p.system))} · ${p.components.length} componentes · ${new Date(p.updated).toLocaleDateString('es-MX')}</span>
          </div>
          <div class="runs">
            <button type="button" data-action="open" data-id="${esc(p.id)}">Abrir</button>
            <button type="button" data-action="remove-project" data-id="${esc(p.id)}">Borrar</button>
          </div>
        </li>`).join('')}</ul>`
        : '<p class="empty-state">Todavía no tienes proyectos. Crea uno para armar tu propio circuito neumático, electroneumático o con Arduino.</p>'}
      <p class="tip">${ed.storageOk
        ? 'Los proyectos se guardan solo en este navegador. Exporta el archivo para respaldarlos o compartirlos.'
        : 'Este navegador no permite guardar. Exporta el archivo antes de cerrar la página o perderás el proyecto.'}</p>
      <p class="tip">Beta: el editor revisa el cableado con reglas fijas, pero todavía no simula los proyectos libres.</p>
    </section>`;
}

function openProject(id) {
  stopSim('');
  ed.web = { status: 'idle', templateId: null, query: '', repos: [], error: '' };
  ed.project = ed.projects.find((p) => p.id === id);
  if (!ed.project) return;
  ed.view = 'edit';
  ed.selected = null;
  ed.pending = null;
  ed.tab = 'componente';
  ed.board = null;
  ed.filter = { system: ed.project.system, category: 'todas', query: '' };
  ed.zoom = 1;
  ed.rango = { analyzed: Boolean(ed.project.problem.trim()), templateId: null, level: 1 };
  if (ed.rango.analyzed && !ed.project.components.length) ed.tab = 'rango';
  renderEditor();
  zoomToFit();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto';

// Editor.
function renderEditor() {
  const p = ed.project;
  $('view-editor').innerHTML = `
    <div class="editor">
      <div class="ed-toolbar">
        <button type="button" data-action="back">← Proyectos</button>
        <label class="ed-name"><span class="label">Proyecto</span><input id="ed-name" value="${esc(p.name)}" maxlength="80"></label>
        <span class="tip">${esc(systemLabel(p.system))}</span>
        <button type="button" class="chat-button" data-action="chat-open">Platicar con Rango</button>
        <div class="runs" role="group" aria-label="Simulación">
          <button type="button" class="primary run-button" id="ed-run" data-action="run">▶ Ejecutar</button>
          <button type="button" id="ed-restart" data-action="restart" hidden>↺ Reiniciar</button>
        </div>
        <div class="runs" role="group" aria-label="Zoom">
          <button type="button" data-action="zoom" data-step="-1" aria-label="Alejar">−</button>
          <button type="button" data-action="zoom-fit">Ajustar</button>
          <button type="button" data-action="zoom" data-step="1" aria-label="Acercar">+</button>
        </div>
        <div class="runs">
          <button type="button" data-action="export">Exportar archivo</button>
          <button type="button" id="ed-del" data-action="delete-selection" disabled>Borrar selección</button>
        </div>
        <p class="ed-status" id="ed-status" role="status"></p>
      </div>
      <aside class="palette" aria-label="Catálogo de componentes">
        <label class="label" for="ed-search">Buscar componente</label>
        <input id="ed-search" type="search" placeholder="Válvula, sensor, relé…" value="${esc(ed.filter.query)}">
        <div class="chips" id="ed-systems" role="group" aria-label="Tipo de sistema"></div>
        <label class="label" for="ed-category">Categoría</label>
        <select id="ed-category">
          <option value="todas">Todas</option>
          ${CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}
        </select>
        <div class="palette-items" id="ed-items"></div>
        <p class="tip">Toca un componente para agregarlo o arrástralo al plano.</p>
      </aside>
      <div class="canvas-wrap" id="ed-wrap">
        <svg class="ed-canvas" id="ed-canvas" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}" role="group" aria-label="Plano del proyecto">
          <g id="ed-layer"></g>
        </svg>
      </div>
      <aside class="inspector" aria-label="Propiedades">
        <div class="chips" role="tablist">
          <button type="button" role="tab" data-action="tab" data-tab="componente" id="tab-componente">Selección</button>
          <button type="button" role="tab" data-action="tab" data-tab="revision" id="tab-revision">Revisión</button>
          <button type="button" role="tab" data-action="tab" data-tab="rango" id="tab-rango">Rango</button>
          <button type="button" role="tab" data-action="tab" data-tab="ejecucion" id="tab-ejecucion">Ejecución</button>
        </div>
        <div id="ed-panel"></div>
      </aside>
      <section class="arduino-panel" id="ed-arduino" aria-label="Arduino" hidden></section>
      <div class="ed-menu" id="ed-menu" role="menu" aria-label="Opciones" hidden></div>
      <dialog class="chat" id="rango-chat" aria-labelledby="chat-title">
        <header class="chat-head">
          <div>
            <h2 id="chat-title">Platicar con Rango</h2>
            <p class="tip">Rango corre en tu navegador: no usa IA generativa ni envía lo que escribes.</p>
          </div>
          <div class="runs">
            <button type="button" data-action="chat-reset">Empezar de nuevo</button>
            <button type="button" data-action="chat-close" aria-label="Cerrar">✕</button>
          </div>
        </header>
        <ol class="chat-log" id="chat-log" aria-live="polite"></ol>
        <form class="chat-form" id="chat-form">
          <label class="visually-hidden" for="chat-input">Tu mensaje</label>
          <textarea id="chat-input" rows="2" maxlength="1000" placeholder="Escribe aquí. Enter envía, Mayús+Enter hace otra línea."></textarea>
          <button type="submit" class="primary">Enviar</button>
        </form>
      </dialog>
    </div>`;
  $('ed-category').value = ed.filter.category;
  applyZoom();
  renderPalette();
  renderCanvas();
  renderInspector();
  renderArduino();
  if (!ed.storageOk) setStatus('Este navegador no permite guardar. Exporta el archivo para no perder el proyecto.', 'warn');
}

function renderPalette() {
  $('ed-systems').innerHTML = SYSTEMS.map((s) =>
    `<button type="button" data-action="system" data-system="${s.id}" aria-pressed="${ed.filter.system === s.id}">${esc(s.label)}</button>`).join('');
  const items = filterCatalog(ed.filter);
  const groups = CATEGORIES.map((category) => ({ category, items: items.filter((d) => d.category === category.id) })).filter((g) => g.items.length);
  $('ed-items').innerHTML = groups.length ? groups.map(({ category, items: list }) => `
    <h3 class="label">${esc(category.label)}</h3>
    <ul>${list.map((def) => `
      <li><button type="button" class="pal-item" data-action="add" data-type="${def.type}" draggable="true" title="${esc(def.note)}">
        <svg class="pal-icon" viewBox="-6 -6 ${def.w + 12} ${def.h + 12}" aria-hidden="true"><g class="sym">${def.glyph}</g></svg>
        <span>${esc(def.name)}</span>
      </button></li>`).join('')}</ul>`).join('')
    : '<p class="tip">Ningún componente coincide con el filtro.</p>';
}

function review() {
  return [...reviewWiring(ed.project), ...reviewArduino(ed.project)];
}

/** Ancho y alto de un componente en el plano, ya girado. */
const sizeOf = (component) => rotatedSize(definition(component.type), component.rot);

function endPosition(end) {
  const component = ed.project.components.find((c) => c.id === end.c);
  const def = definition(component.type);
  const port = def.ports.find((item) => item.id === end.p);
  const { x, y, side } = placePort(def, port, component.rot);
  return { x: component.x + x, y: component.y + y, side, component, port };
}

const OUT = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

function linkPath(link) {
  const a = endPosition(link.a);
  const b = endPosition(link.b);
  const ea = [a.x + OUT[a.side][0] * 16, a.y + OUT[a.side][1] * 16];
  const eb = [b.x + OUT[b.side][0] * 16, b.y + OUT[b.side][1] * 16];
  const corner = a.side === 't' || a.side === 'b' ? [ea[0], eb[1]] : [eb[0], ea[1]];
  return `M${a.x} ${a.y} L${ea[0]} ${ea[1]} L${corner[0]} ${corner[1]} L${eb[0]} ${eb[1]} L${b.x} ${b.y}`;
}

// Las etiquetas de los puertos se escriben siempre derechas, aunque el componente esté girado.
function portLabel(def, port, rot) {
  const { x, y, side } = placePort(def, port, rot);
  if (side === 'l') return `<text class="sm" x="${x + 8}" y="${y + 4}">${esc(port.label)}</text>`;
  if (side === 'r') return `<text class="sm" x="${x - 8}" y="${y + 4}" text-anchor="end">${esc(port.label)}</text>`;
  if (side === 't') return `<text class="sm" x="${x + 6}" y="${y + 12}">${esc(port.label)}</text>`;
  return `<text class="sm" x="${x + 6}" y="${y - 4}">${esc(port.label)}</text>`;
}

function renderCanvas() {
  const p = ed.project;
  const sv = ed.sim ? ed.simView : null;
  const flagged = new Set(review().filter((f) => f.level === 'error').flatMap((f) => f.where));
  const connected = new Set(p.links.flatMap((l) => [keyOf(l.a), keyOf(l.b)]));
  const selected = (type, id) => ed.selected?.type === type && ed.selected.id === id;

  const links = p.links.map((link) => {
    const d = linkPath(link);
    const a = endPosition(link.a);
    const b = endPosition(link.b);
    const name = `${link.kind === 'air' ? 'Manguera' : 'Cable'} de ${a.component.label}:${a.port.label} a ${b.component.label}:${b.port.label}`;
    const live = sv ? sv.links.get(link.id) : '';
    return `<g class="ed-link ${link.kind}${selected('link', link.id) ? ' selected' : ''}${live ? ` live ${live}` : ''}" data-link="${link.id}" tabindex="0" role="button" aria-label="${esc(name)}">
      <path class="hit" d="${d}"/><path class="line" d="${d}"/></g>`;
  }).join('');

  const components = p.components.map((component) => {
    const def = definition(component.type);
    const [w, h] = sizeOf(component);
    const color = def.colorable ? ledColor(component.config.color) : null;
    const ports = def.ports.map((port) => {
      const { x, y } = placePort(def, port, component.rot);
      const key = keyOf({ c: component.id, p: port.id });
      const pending = ed.pending && keyOf(ed.pending) === key;
      return `<g class="ed-port ${port.kind}${port.pin ? ' pin' : ''}${connected.has(key) ? ' used' : ''}${pending ? ' pending' : ''}"
        data-port="${esc(port.id)}" data-comp="${component.id}" tabindex="0" role="button" aria-label="Puerto ${esc(port.label)} de ${esc(component.label)}">
        <circle class="hit" cx="${x}" cy="${y}" r="10"/><circle class="dot" cx="${x}" cy="${y}" r="5"/></g>`;
    }).join('');
    let extra = def.value ? formatOhms(component.config[def.value.key]) : color ? color.label.toLowerCase() : '';
    const live = sv?.parts.get(component.id);
    let glyph = def.glyph;
    let state = '';
    let hint = 'Clic derecho para más opciones.';
    if (live) {
      const mode = interaction(component);
      state = `${live.active ? ' active' : ''}${live.burned ? ' burned' : ''}${mode ? ` interactive ${mode}` : ''}`;
      if (component.type.startsWith('cilindro')) {
        const rear = sv.air.has(keyOf({ c: component.id, p: component.type === 'cilindro-se' ? 'A' : 'trasera' }));
        const front = component.type === 'cilindro-de' && sv.air.has(keyOf({ c: component.id, p: 'delantera' }));
        glyph = cylinderGlyph(def, live.pos, { rear, front });
        extra = `${Math.round(live.pos)} %`;
      }
      if (live.burned) extra = 'quemado';
      if (component.type === 'potenciometro') extra = String(live.value);
      hint = mode === 'hold' ? 'Mantén presionado para accionarlo.' : mode === 'toggle' ? 'Haz clic para accionarlo o liberarlo.' : mode === 'slider' ? 'Muévelo en la pestaña Ejecución.' : '';
    }
    return `<g class="ed-comp${selected('component', component.id) ? ' selected' : ''}${flagged.has(component.id) ? ' flagged' : ''}${color ? ' led' : ''}${state}"
      data-comp="${component.id}" transform="translate(${component.x} ${component.y})" tabindex="0" role="button"
      aria-label="${esc(`${component.label}, ${def.name}${extra ? `, ${extra}` : ''}${live?.active ? ', activo' : ''}. ${hint}`)}"${color ? ` style="--led: ${color.hex}"` : ''}>
      <rect class="ed-body" x="-4" y="-4" width="${w + 8}" height="${h + 8}"/>
      <g class="sym" transform="${glyphTransform(def, component.rot)}">${glyph}</g>
      ${def.ports.map((port) => portLabel(def, port, component.rot)).join('')}
      <text class="tag" x="0" y="-10">${esc(component.label)}${extra ? `<tspan class="sm" dx="6">${esc(extra)}</tspan>` : ''}</text>
      ${ports}
    </g>`;
  }).join('');

  const empty = p.components.length ? '' : `<text class="ed-hint" x="${CANVAS_W / 2}" y="160" text-anchor="middle">Agrega componentes desde el catálogo.</text>`;
  $('ed-layer').innerHTML = links + components + empty;
  $('ed-del').disabled = !ed.selected;
}

function resistorFields(component) {
  const ohms = Number(component.config.ohms);
  const options = COMMON_OHMS.includes(ohms) ? COMMON_OHMS : [...COMMON_OHMS, ohms].sort((a, b) => a - b);
  return `
    <label class="field">Valor
      <select id="ed-ohms">${options.map((o) => `<option value="${o}"${o === ohms ? ' selected' : ''}>${esc(formatOhms(o))}</option>`).join('')}</select>
    </label>
    <label class="field">Otro valor, en Ω<input id="ed-ohms-custom" type="number" min="1" max="10000000" step="1" value="${ohms}"></label>
    <p class="tip">Guía rápida: 220 Ω a 330 Ω para un LED en 5 V, 1.5 kΩ para un LED en 24 V, 10 kΩ para pull-up o pull-down.</p>`;
}

function learnedSection() {
  const summary = learningSummary(ed.learned);
  if (!summary.total) return '';
  return `<details class="known">
    <summary>Lo que Rango aprendió en este navegador (${summary.total})</summary>
    <ul class="plain">${summary.byTemplate.map(({ template, n }) => `<li>${esc(template.title)}: ${n}</li>`).join('')}</ul>
    <button type="button" data-action="forget-learned">Olvidar lo aprendido</button>
  </details>`;
}

// Conversación con Rango.
function chatState() {
  if (!ed.project.chat || !Array.isArray(ed.project.chat.messages)) ed.project.chat = startConversation();
  else ed.project.chat = normalizeConversation(ed.project.chat);
  return ed.project.chat;
}

function setChat(state) {
  ed.project.chat = state;
  const text = userText(state).trim();
  if (text) ed.project.problem = text;
  touch();
  renderChat();
  if (ed.tab === 'rango') renderInspector();
}

const paragraphs = (text) => esc(text).split('\n').map((line) => (line ? `<p>${line}</p>` : '')).join('');

function renderChat() {
  const log = $('chat-log');
  if (!log) return;
  const state = chatState();
  const lastRango = state.messages.map((m) => m.from).lastIndexOf('rango');
  log.innerHTML = state.messages.map((m, index) => {
    const live = index === lastRango;
    const chips = live && m.chips?.length ? `<div class="chat-chips">${m.chips.map((c) => `
      <button type="button" data-action="chat-chip" data-slot="${esc(c.slot)}" data-value="${esc(c.value)}" data-label="${esc(c.label)}">${esc(c.label)}</button>`).join('')}</div>` : '';
    const actions = live && m.actions?.length ? `<div class="chat-actions">${m.actions.map((a) => `
      <button type="button" class="${a.action === 'chat-build' ? 'primary' : ''}" data-action="${esc(a.action)}"${a.id ? ` data-id="${esc(a.id)}"` : ''}${a.type ? ` data-type="${esc(a.type)}"` : ''}${a.slot ? ` data-slot="${esc(a.slot)}" data-value="${esc(a.value)}" data-label="${esc(a.label)}"` : ''}>${esc(a.label)}</button>`).join('')}</div>` : '';
    return `<li class="msg ${m.from}"><span class="who">${m.from === 'rango' ? 'Rango' : 'Tú'}</span><div class="bubble">${paragraphs(m.text)}</div>${chips}${actions}</li>`;
  }).join('');
  log.scrollTop = log.scrollHeight;
}

function openChat() {
  const dialog = $('rango-chat');
  if (!dialog) return;
  closeMenu();
  renderChat();
  if (!dialog.open) dialog.showModal();
  $('chat-input').focus();
}

function chatSend(input) {
  const state = respond(chatState(), input, { learned: ed.learned });
  if (state === ed.project.chat) return;
  setChat(state);
}

/** Agrega al plano los componentes que faltan para un ejemplo, acomodados como en el ejemplo. */
function addMissingFor(templateId) {
  const example = buildTemplate(templateId);
  const missing = missingFor(ed.project, example);
  if (!missing.length) return 0;
  const right = Math.max(0, ...ed.project.components.map((c) => c.x + sizeOf(c)[0]));
  const left = Math.min(...missing.map((m) => m.x));
  const shift = ed.project.components.length ? right + 80 - left : 0;
  for (const item of missing) addAt(item.type, item.x + shift, item.y, item.config, true);
  zoomToFit();
  return missing.length;
}

/** Búsqueda de proyectos en GitHub para el problema elegido. Solo se ejecuta si el estudiante lo pide. */
function webSection(template) {
  const web = ed.web.templateId === template.id ? ed.web : { status: 'idle', query: '', repos: [], error: '' };
  const terms = web.query || SEARCH[template.id][0];
  let results = '';
  if (web.status === 'loading') results = '<p class="tip" role="status">Buscando en GitHub…</p>';
  if (web.status === 'error') results = `<p class="verdict fail" role="status">${esc(web.error)}</p>`;
  if (web.status === 'done') {
    results = web.repos.length ? `
      <p class="tip" role="status">${web.repos.length} proyectos para “${esc(web.query)}”, ordenados por parecido, estrellas y lo que te ha servido.</p>
      <ul class="repos">${web.repos.map((repo) => `
        <li>
          <a href="${esc(repo.url)}" target="_blank" rel="noopener noreferrer">${esc(repo.name)}</a>
          ${repo.description ? `<span>${esc(repo.description)}</span>` : ''}
          <span class="tip">★ ${repo.stars}${repo.language ? ` · ${esc(repo.language)}` : ''} · parecido ${repo.match} %</span>
          <button type="button" class="chip-button" data-action="web-useful" data-url="${esc(repo.url)}" aria-pressed="${repo.useful}">${repo.useful ? 'Te sirvió' : 'Me sirvió'}</button>
        </li>`).join('')}</ul>`
      : '<p class="tip" role="status">GitHub no encontró proyectos con esas palabras. Prueba con otras.</p>';
  }
  return `<h4 class="label">Proyectos en la red</h4>
    <p class="tip">Busca proyectos parecidos en GitHub. Solo se envían las palabras de abajo, no tu enunciado. Los proyectos no están revisados por Rangokit: compáralos con tu revisión antes de copiar algo.</p>
    <label class="field">Palabras de búsqueda (puedes cambiarlas)<input id="ed-web-terms" value="${esc(terms)}" maxlength="120"></label>
    <button type="button" data-action="web-search"${web.status === 'loading' ? ' disabled' : ''}>Buscar en GitHub</button>
    ${results}`;
}

/** Pestaña de Rango: problema del estudiante, ayuda gradual y lectura del proyecto. */
function renderRango(panel) {
  const p = ed.project;
  const result = ed.rango.analyzed ? matchProblem(p.problem, ed.learned) : null;
  const chosen = ed.rango.templateId ?? result?.best?.template.id ?? null;
  const template = TEMPLATES.find((t) => t.id === chosen);
  const analysis = analyzeProject(p);
  const pick = (t) => `<button type="button" class="chip-button" data-action="pick-template" data-id="${t.id}">${esc(t.title)}</button>`;

  let help = '';
  if (template) {
    const example = buildTemplate(template.id);
    const missing = missingFor(p, example);
    const level = ed.rango.level;
    const why = result?.best?.template.id === template.id && result.best.reasons.length
      ? `<p class="tip">Lo reconocí por: ${result.best.reasons.map((r) => `“${esc(r)}”`).join(', ')}.</p>` : '';
    const steps = [
      ['Pista', `<p>${esc(template.concept)}</p>`],
      ['Componentes', `<ul class="plain">${example.components.map((c) => `<li>${esc(c.label)} · ${esc(definition(c.type).name)}${c.config.ohms ? ` de ${esc(formatOhms(c.config.ohms))}` : ''}</li>`).join('')}</ul>
        ${missing.length ? `<p class="tip">En tu proyecto faltan ${missing.length}.</p><button type="button" data-action="add-missing">Agregar lo que falta</button>` : '<p class="tip">Ya tienes todos los componentes.</p>'}`],
      ['Conexiones', `<ol class="plain steps-list">${templateSteps(example).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`],
      ['Ejemplo completo', `<p>Ábrelo como proyecto aparte y compáralo con el tuyo.</p>
        <div class="runs"><button type="button" data-action="template-new" data-id="${template.id}">Abrir ejemplo</button>
        ${p.components.length ? '' : `<button type="button" data-action="template-here" data-id="${template.id}">Armarlo aquí</button>`}</div>`],
    ];
    const recognizedThis = result?.best?.template.id === template.id;
    const feedback = ed.rango.feedback === template.id
      ? '<p class="tip learned">Gracias: Rango aprendió de tu respuesta y la usará con los siguientes enunciados.</p>'
      : recognizedThis && p.problem.trim()
        ? `<div class="feedback"><span>¿Acerté?</span>
            <button type="button" data-action="feedback-yes">Sí</button>
            <button type="button" data-action="feedback-no">No, es otro</button></div>`
        : '';
    help = `
      <p class="verdict">${recognizedThis ? 'Parece un problema de:' : 'Ejemplo elegido:'} ${esc(template.title)}</p>
      ${recognizedThis ? `<p class="tip">Seguridad del modelo: ${Math.round(result.best.confidence * 100)} %.</p>` : ''}
      ${why}
      ${feedback}
      <ol class="hints">${steps.map(([kind, body], index) => `
        <li class="${index < level ? '' : 'locked'}"><span class="kind">${kind}</span>${index < level ? body : '<span>Oculta</span>'}</li>`).join('')}</ol>
      ${level < steps.length ? '<button type="button" class="primary" data-action="rango-more">Ver siguiente ayuda</button>' : ''}
      <p class="tip">${level} de ${steps.length} ayudas. Intenta resolverlo antes de abrir la siguiente.</p>
      <div class="chips" id="ed-alternatives"${ed.rango.showAll ? '' : ' hidden'}>${TEMPLATES.filter((t) => t.id !== template.id).map(pick).join('')}</div>
      ${result?.alternatives.length && !ed.rango.showAll ? `<p class="tip">¿No es eso? También podría ser:</p><div class="chips">${result.alternatives.map(({ template: t }) => pick(t)).join('')}</div>` : ''}
      ${webSection(template)}`;
  } else if (result) {
    help = `
      <p class="verdict fail">No reconocí este problema entre los que conozco.</p>
      <p>No voy a adivinar. Responde estas preguntas en tu texto y vuelve a analizar:</p>
      <ul class="steps">${result.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
      ${result.alternatives.length ? `<p class="tip">Se parece un poco a:</p><div class="chips">${result.alternatives.map(({ template: t }) => pick(t)).join('')}</div>` : ''}`;
  }

  panel.innerHTML = `
    <h3>Rango</h3>
    <button type="button" class="primary" data-action="chat-open">Platicar con Rango</button>
    <p class="tip">Explícale tu problema con tus palabras y te pregunta lo que le falte para armarlo contigo.</p>
    <p class="tip">Analista con aprendizaje automático: un clasificador que corre en tu navegador reconoce el tipo de problema y aprende de tus respuestas. Tu texto no sale de este equipo. Los errores de cableado los siguen decidiendo reglas fijas.</p>
    <label class="field">Tu problema o tarea
      <textarea id="ed-problem" rows="5" placeholder="Pega aquí el enunciado. Ej.: Al pulsar S1 el cilindro debe salir y regresar solo al llegar al final de carrera.">${esc(p.problem)}</textarea>
    </label>
    <button type="button" class="primary" data-action="analyze">Analizar problema</button>
    ${help}
    <details class="known"${template || result ? '' : ' open'}>
      <summary>Problemas que conozco (${TEMPLATES.length})</summary>
      <div class="chips">${TEMPLATES.map(pick).join('')}</div>
    </details>
    ${learnedSection()}
    <h4 class="label">Lo que veo en tu proyecto</h4>
    ${analysis.goals.length ? `<p class="tip">Parece que quieres:</p><ul class="steps">${analysis.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    ${analysis.next.length ? `<p class="tip">Lo que falta:</p><ul class="steps">${analysis.next.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="tip">No veo nada pendiente en las conexiones.</p>'}`;
}

const SIMPLIFICATIONS = `
  <details class="known">
    <summary>Qué simplifica la simulación</summary>
    <ul class="steps">
      <li>Cada borne tiene 24 V, 5 V, tierra o nada. No calcula corrientes ni caídas de tensión.</li>
      <li>Una carga funciona si un extremo recibe su tensión y el otro llega a la tierra de esa misma fuente.</li>
      <li>Relés y válvulas tardan 30 ms en responder. Los cilindros recorren su carrera en 2 s, más lento con reguladora.</li>
      <li>No hay caída de presión, fugas ni contrapresión en los escapes.</li>
      <li>Los sensores detectan al cilindro más cercano al final de su carrera, salvo que elijas otro en Selección.</li>
      <li>El Arduino ejecuta las reglas de Lógica, igual que el código generado.</li>
    </ul>
    <p class="tip">Que funcione aquí no garantiza que funcione el circuito real. Revisa siempre antes de energizar.</p>
  </details>`;

/** Pestaña de Ejecución: controles en vivo, estado de cilindros y del Arduino, y eventos. */
function renderRunPanel(panel) {
  if (!ed.sim) {
    panel.innerHTML = `
      <h3>Ejecutar el proyecto</h3>
      <p>Ve tu sistema funcionando en tiempo real: los cables con tensión se colorean, el aire recorre las mangueras y los cilindros se mueven.</p>
      <p class="tip">Durante la ejecución mantienes presionados los pulsadores con el mouse, accionas palancas y mueves potenciómetros.</p>
      <button type="button" class="primary" data-action="run">▶ Ejecutar</button>
      ${SIMPLIFICATIONS}`;
    return;
  }
  const p = ed.project;
  const controls = p.components.map((c) => {
    const mode = interaction(c);
    if (mode === 'hold') return `<button type="button" class="hold" data-hold="${c.id}" aria-pressed="false">Mantén ${esc(c.label)}</button>`;
    if (mode === 'toggle') return `<button type="button" data-action="sim-toggle" data-id="${c.id}" aria-pressed="false">${esc(c.label)}: ${c.type === 'paro-emergencia' ? 'oprimir' : 'accionar'}</button>`;
    if (mode === 'slider') return `<label class="field">${esc(c.label)} · <span id="run-pot-${c.id}">${ed.sim.parts.get(c.id).value}</span>
      <input type="range" min="0" max="${SIM.ADC_MAX}" value="${ed.sim.parts.get(c.id).value}" data-pot="${c.id}"></label>`;
    return '';
  }).filter(Boolean);
  const cylinders = p.components.filter((c) => c.type.startsWith('cilindro'));
  const pins = ed.sim.boards.map((b) => {
    const used = b.rows.filter((r) => r.mode !== 'none');
    if (!used.length) return '';
    return `<h4 class="label">${esc(b.board.label)} en vivo</h4>
      <table class="pins live"><tbody>${used.map((r) => `
        <tr><th scope="row">${r.id}</th><td>${esc(r.name)}</td><td id="run-pin-${b.board.id}-${r.id}">—</td></tr>`).join('')}</tbody></table>`;
  }).join('');
  panel.innerHTML = `
    <p class="verdict pass" id="run-time" role="status">En ejecución</p>
    ${controls.length ? `<h4 class="label">Controles</h4><div class="run-controls">${controls.join('')}</div>
      <p class="tip">También puedes presionar los componentes directo en el plano.</p>`
      : '<p class="tip">Este proyecto no tiene pulsadores, palancas ni potenciómetros que accionar.</p>'}
    ${cylinders.length ? `<h4 class="label">Cilindros</h4><ul class="plain">${cylinders.map((c) => `
      <li><span>${esc(c.label)}</span> <progress id="run-pos-${c.id}" max="100" value="0"></progress> <span id="run-posv-${c.id}">0 %</span></li>`).join('')}</ul>` : ''}
    ${pins}
    <h4 class="label">Eventos</h4>
    <ol class="log" id="run-log"></ol>
    ${SIMPLIFICATIONS}`;
  updateRunPanel();
}

function updateRunPanel() {
  const sim = ed.sim;
  if (!sim || ed.tab !== 'ejecucion' || !$('run-time')) return;
  $('run-time').textContent = `En ejecución · ${sim.t.toFixed(1)} s`;
  for (const c of ed.project.components) {
    const part = sim.parts.get(c.id);
    const bar = $(`run-pos-${c.id}`);
    if (bar) {
      bar.value = part.pos;
      $(`run-posv-${c.id}`).textContent = `${Math.round(part.pos)} %`;
    }
    const pot = $(`run-pot-${c.id}`);
    if (pot) pot.textContent = String(part.value);
    const toggleButton = document.querySelector(`[data-action="sim-toggle"][data-id="${c.id}"]`);
    if (toggleButton) toggleButton.setAttribute('aria-pressed', String(part.toggled));
    const hold = document.querySelector(`[data-hold="${c.id}"]`);
    if (hold) hold.setAttribute('aria-pressed', String(part.pressed));
  }
  for (const b of sim.boards) {
    for (const r of b.rows) {
      const cell = $(`run-pin-${b.board.id}-${r.id}`);
      if (!cell) continue;
      const level = b.levels.get(r.id);
      const value = b.values?.get?.(r.id);
      cell.textContent = r.mode === 'analog' ? String(value ?? 0) : `${level ?? '—'}${value === true || (r.mode === 'output' && b.state.get(r.id)) ? ' · activa' : ''}`;
      cell.className = (r.mode === 'analog' ? false : level === r.active) ? 'on' : '';
    }
  }
  const items = sim.events.slice(-8).reverse();
  const html = items.map((e) => `<li><time>${e.t.toFixed(2)} s</time><span>${esc(e.kind === 'Aviso' || e.kind === 'Inicio' ? e.text : `${e.kind} ${e.text}`)}</span></li>`).join('');
  const log = $('run-log');
  if (log.dataset.html !== html) {
    log.innerHTML = html;
    log.dataset.html = html;
  }
}

function simSignature(sv) {
  let text = [...sv.links.values()].join(',');
  for (const [id, part] of sv.parts) text += `|${id}:${part.active ? 1 : 0}${part.burned ? 'b' : ''}${Math.round(part.pos)}:${part.value}`;
  return text;
}

function setRunUi(running) {
  const run = $('ed-run');
  if (!run) return;
  run.textContent = running ? '■ Detener' : '▶ Ejecutar';
  run.classList.toggle('stop', running);
  $('ed-restart').hidden = !running;
  document.querySelector('.editor')?.classList.toggle('running', running);
}

function simLoop(now) {
  if (!ed.sim) return;
  // Sigue el tiempo real aunque el navegador dibuje pocos cuadros; el tope evita un salto al volver a la pestaña.
  ed.simAcc = (ed.simAcc ?? 0) + Math.min(0.25, Math.max(0, (now - ed.simLast) / 1000));
  ed.simLast = now;
  const steps = Math.floor(ed.simAcc / SIM.DT + 1e-9);
  if (steps > 0) {
    advance(ed.sim, steps * SIM.DT);
    ed.simAcc -= steps * SIM.DT;
  }
  ed.simView = view(ed.sim);
  const signature = simSignature(ed.simView);
  if (signature !== ed.simSignature) {
    ed.simSignature = signature;
    const focused = document.activeElement;
    renderCanvas();
    if (focused?.closest?.('#ed-canvas')) refocus(focused);
  }
  updateRunPanel();
  ed.simFrame = requestAnimationFrame(simLoop);
}

function startSim() {
  closeMenu();
  ed.pending = null;
  ed.sim = createSim(ed.project);
  ed.simView = view(ed.sim);
  ed.simSignature = '';
  ed.simAcc = 0;
  ed.tab = 'ejecucion';
  setRunUi(true);
  renderCanvas();
  renderInspector();
  const errors = review().filter((f) => f.level === 'error').length;
  setStatus(errors
    ? `En ejecución, pero hay ${errors === 1 ? 'un error' : `${errors} errores`} en Revisión: la simulación puede no reflejar lo que pasaría en el circuito real.`
    : 'En ejecución. Mantén presionados los pulsadores con el mouse o usa los controles de la pestaña Ejecución.', errors ? 'warn' : '');
  ed.simLast = performance.now();
  cancelAnimationFrame(ed.simFrame);
  ed.simFrame = requestAnimationFrame(simLoop);
}

function stopSim(message = 'Simulación detenida. Puedes seguir editando.') {
  if (!ed.sim) return;
  cancelAnimationFrame(ed.simFrame);
  ed.sim = null;
  ed.simView = null;
  ed.holding = null;
  setRunUi(false);
  if ($('ed-layer')) {
    renderCanvas();
    renderInspector();
  }
  if (message) setStatus(message);
}

function releaseHold() {
  if (ed.sim && ed.holding) press(ed.sim, ed.holding, false);
  ed.holding = null;
}

function renderInspector() {
  const findings = review();
  const errors = findings.filter((f) => f.level === 'error').length;
  $('tab-componente').setAttribute('aria-selected', String(ed.tab === 'componente'));
  $('tab-componente').setAttribute('aria-pressed', String(ed.tab === 'componente'));
  $('tab-revision').setAttribute('aria-selected', String(ed.tab === 'revision'));
  $('tab-revision').setAttribute('aria-pressed', String(ed.tab === 'revision'));
  $('tab-revision').textContent = findings.length ? `Revisión (${findings.length})` : 'Revisión';
  $('tab-revision').classList.toggle('has-errors', errors > 0);
  $('tab-rango').setAttribute('aria-selected', String(ed.tab === 'rango'));
  $('tab-rango').setAttribute('aria-pressed', String(ed.tab === 'rango'));

  $('tab-ejecucion').setAttribute('aria-selected', String(ed.tab === 'ejecucion'));
  $('tab-ejecucion').setAttribute('aria-pressed', String(ed.tab === 'ejecucion'));

  const panel = $('ed-panel');
  if (ed.tab === 'rango') {
    renderRango(panel);
    return;
  }
  if (ed.tab === 'ejecucion') {
    renderRunPanel(panel);
    return;
  }
  if (ed.tab === 'revision') {
    panel.innerHTML = `
      ${findings.length ? `<ul class="findings">${findings.map((f) => `
        <li class="${f.level}">
          <span class="mark ${f.level === 'error' ? 'fail' : ''}">${f.level === 'error' ? 'Error' : 'Aviso'}</span>
          <button type="button" class="link-button" data-action="focus" data-id="${esc(f.where[0] ?? '')}">${esc(f.text)}</button>
          ${(f.suggest ?? []).map((s) => `
            <div class="suggest">
              <span class="kind">Rango sugiere</span>
              <span>${esc(s.text)}</span>
              <button type="button" data-action="add-suggested" data-type="${s.type}"${s.ohms ? ` data-ohms="${s.ohms}"` : ''}>
                Agregar ${esc(s.ohms ? `resistencia de ${formatOhms(s.ohms)}` : definition(s.type).name.toLowerCase())}
              </button>
            </div>`).join('')}
        </li>`).join('')}</ul>`
        : '<p class="verdict pass">No se detectaron errores de cableado.</p>'}
      <p class="tip">La revisión aplica reglas fijas sobre las conexiones. Todavía no simula el proyecto, así que no garantiza que el circuito real funcione.</p>`;
    return;
  }

  const p = ed.project;
  if (ed.selected?.type === 'component') {
    const component = p.components.find((c) => c.id === ed.selected.id);
    const def = definition(component.type);
    const own = p.links.filter((l) => l.a.c === component.id || l.b.c === component.id).map((l) => {
      const [mine, other] = l.a.c === component.id ? [l.a, l.b] : [l.b, l.a];
      const a = endPosition(mine);
      const b = endPosition(other);
      return `<li>${esc(a.port.label)} → ${esc(b.component.label)}:${esc(b.port.label)}</li>`;
    });
    panel.innerHTML = `
      <h3>${esc(component.label)}</h3>
      <p class="tip">${esc(def.name)}</p>
      <p>${esc(def.note)}</p>
      <label class="field">Etiqueta<input id="ed-label" value="${esc(component.label)}" maxlength="16"></label>
      <div class="runs" role="group" aria-label="Orientación">
        <button type="button" data-action="rotate" data-dir="-1" aria-label="Girar a la izquierda">↺ Girar</button>
        <button type="button" data-action="rotate" data-dir="1" aria-label="Girar a la derecha">↻ Girar</button>
        <span class="tip">${component.rot ?? 0}°</span>
      </div>
      ${def.colorable ? `<label class="field">Color
        <select id="ed-color">${LED_COLORS.map((c) => `<option value="${c.id}"${c.id === component.config.color ? ' selected' : ''}>${c.label} (${c.vf} V)</option>`).join('')}</select>
      </label>` : ''}
      ${def.value ? resistorFields(component) : ''}
      <h4 class="label">Conexiones</h4>
      ${own.length ? `<ul class="plain">${own.join('')}</ul>` : '<p class="tip">Sin conexiones. Toca uno de sus puertos y luego otro puerto.</p>'}
      <button type="button" data-action="delete-selection">Borrar componente</button>`;
    return;
  }
  if (ed.selected?.type === 'link') {
    const link = p.links.find((l) => l.id === ed.selected.id);
    const a = endPosition(link.a);
    const b = endPosition(link.b);
    panel.innerHTML = `
      <h3>${link.kind === 'air' ? 'Manguera' : 'Cable'}</h3>
      <p>De ${esc(a.component.label)}:${esc(a.port.label)} a ${esc(b.component.label)}:${esc(b.port.label)}.</p>
      <button type="button" data-action="delete-selection">Borrar conexión</button>`;
    return;
  }
  panel.innerHTML = `
    <h3>Cómo armar tu sistema</h3>
    <ol class="steps">
      <li>Elige componentes en el catálogo. Filtra por tipo de sistema o busca por nombre.</li>
      <li>Para conectar, toca un puerto y luego otro. Los puertos azules son de aire y los demás eléctricos.</li>
      <li>Arrastra los componentes para acomodarlos. Con flechas los mueves, con R los giras y con Supr los borras.</li>
      <li>Clic derecho sobre un componente para girarlo, cambiar el color de un LED, el valor de una resistencia o duplicarlo.</li>
      <li>Revisa la pestaña Revisión antes de armar el circuito real.</li>
    </ol>
    <p class="tip">${p.components.length} componentes · ${p.links.length} conexiones</p>`;
}

function renderArduino() {
  const section = $('ed-arduino');
  const list = boards(ed.project);
  section.hidden = !list.length;
  if (!list.length) return;
  const board = list.find((b) => b.id === ed.board) ?? list[0];
  ed.board = board.id;
  const rows = pinRows(ed.project, board);
  const inputs = rows.filter((r) => isInputMode(r.mode));
  const outputs = rows.filter((r) => r.mode === 'output');
  const pinOption = (row, current) => `<option value="${row.id}"${row.id === current ? ' selected' : ''}>${esc(row.id)} · ${esc(row.name)}</option>`;
  const missing = (current, pool) => (current && !pool.some((r) => r.id === current) ? `<option value="${esc(current)}" selected>${esc(current)} (no válido)</option>` : '');

  const table = rows.map((row) => {
    const auto = row.inferred.mode ? PIN_MODES.find((m) => m.id === row.inferred.mode).label : 'Sin usar';
    const manualMode = row.manual.mode ?? 'auto';
    const fixedActive = row.mode === 'none' || row.mode === 'analog';
    return `<tr class="${row.mode === 'none' ? 'unused' : ''}">
      <th scope="row">${row.id}${row.notes.length ? `<small>${esc(row.notes.join(' · '))}</small>` : ''}</th>
      <td><select data-pin="${row.id}" data-field="mode" aria-label="Modo de ${row.id}">
        ${PIN_MODES.map((m) => `<option value="${m.id}"${m.id === manualMode ? ' selected' : ''}>${m.id === 'auto' ? `Automático: ${esc(auto)}` : esc(m.label)}</option>`).join('')}
      </select></td>
      <td><input data-pin="${row.id}" data-field="name" aria-label="Nombre de ${row.id}" value="${esc(row.manual.name ?? '')}" placeholder="${esc(row.name)}" maxlength="24"></td>
      <td><select data-pin="${row.id}" data-field="active" aria-label="Nivel activo de ${row.id}"${fixedActive ? ' disabled' : ''}>
        <option value="HIGH"${row.active === 'HIGH' ? ' selected' : ''}>HIGH</option>
        <option value="LOW"${row.active === 'LOW' ? ' selected' : ''}>LOW</option>
      </select></td>
      <td class="tip">${esc(row.inferred.reason ?? '—')}</td>
    </tr>`;
  }).join('');

  const rules = (board.config.rules ?? []).map((rule, index) => {
    const input = rows.find((r) => r.id === rule.input);
    const analog = input?.mode === 'analog';
    const conditions = CONDITIONS.filter((c) => c.analog === analog);
    return `<li>
      <span>Si</span>
      <select data-rule="${index}" data-field="input" aria-label="Entrada de la regla ${index + 1}">${missing(rule.input, inputs)}${inputs.map((r) => pinOption(r, rule.input)).join('')}</select>
      <select data-rule="${index}" data-field="cond" aria-label="Condición de la regla ${index + 1}">${conditions.map((c) => `<option value="${c.id}"${c.id === rule.cond ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      ${analog ? `<input type="number" min="0" max="1023" data-rule="${index}" data-field="value" value="${Number(rule.value) || 0}" aria-label="Valor de la regla ${index + 1}">` : ''}
      <span>→</span>
      <select data-rule="${index}" data-field="action" aria-label="Acción de la regla ${index + 1}">${ACTIONS.map((a) => `<option value="${a.id}"${a.id === rule.action ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
      <select data-rule="${index}" data-field="output" aria-label="Salida de la regla ${index + 1}">${missing(rule.output, outputs)}${outputs.map((r) => pinOption(r, rule.output)).join('')}</select>
      <button type="button" data-action="remove-rule" data-rule="${index}" aria-label="Quitar la regla ${index + 1}">Quitar</button>
    </li>`;
  }).join('');

  const code = generateSketch(ed.project, board.id);
  section.innerHTML = `
    <div class="arduino-head">
      <h2>Arduino Uno · ${esc(board.label)}</h2>
      ${list.length > 1 ? `<select id="ed-board" aria-label="Placa">${list.map((b) => `<option value="${b.id}"${b.id === board.id ? ' selected' : ''}>${esc(b.label)}</option>`).join('')}</select>` : ''}
      <p class="tip">El modo automático sale de lo que conectaste a cada pin. Cámbialo solo si sabes por qué.</p>
    </div>
    <div class="arduino-body">
      <div class="pins-wrap">
        <table class="pins">
          <thead><tr><th scope="col">Pin</th><th scope="col">Modo</th><th scope="col">Nombre</th><th scope="col">Activo en</th><th scope="col">Conexión</th></tr></thead>
          <tbody>${table}</tbody>
        </table>
      </div>
      <div class="logic">
        <h3>Lógica</h3>
        <p class="tip">Cada regla se convierte en código. Se evalúan en orden y, si dos mandan la misma salida, gana la última.</p>
        ${rules ? `<ol class="rules">${rules}</ol>` : ''}
        <button type="button" data-action="add-rule"${inputs.length && outputs.length ? '' : ' disabled'}>Agregar regla</button>
        ${inputs.length && outputs.length ? '' : '<p class="tip">Para agregar reglas necesitas al menos una entrada y una salida en la tabla de pines.</p>'}
        <div class="code-head">
          <h3>Código para Arduino IDE</h3>
          <div class="runs">
            <button type="button" data-action="copy-code">Copiar</button>
            <button type="button" data-action="download-code">Descargar .ino</button>
          </div>
        </div>
        <pre class="code" id="ed-code"><code>${esc(code)}</code></pre>
        <p class="tip">El Arduino IDE pide que el archivo .ino esté dentro de una carpeta con el mismo nombre.</p>
      </div>
    </div>`;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;

function applyZoom() {
  const svg = $('ed-canvas');
  svg.style.width = `${CANVAS_W * ed.zoom}px`;
  svg.style.height = `${CANVAS_H * ed.zoom}px`;
  $('ed-wrap').style.backgroundSize = `${20 * ed.zoom}px ${20 * ed.zoom}px`;
}

/** Acerca o aleja para que todos los componentes quepan en la vista. */
function zoomToFit() {
  const wrap = $('ed-wrap');
  const items = ed.project.components;
  if (!items.length) {
    ed.zoom = 1;
    applyZoom();
    return;
  }
  const box = items.reduce((acc, c) => {
    const [w, h] = sizeOf(c);
    return { x0: Math.min(acc.x0, c.x), y0: Math.min(acc.y0, c.y - 24), x1: Math.max(acc.x1, c.x + w), y1: Math.max(acc.y1, c.y + h) };
  }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const margin = 30;
  const fit = Math.min((wrap.clientWidth - 8) / (box.x1 - box.x0 + margin * 2), (wrap.clientHeight - 8) / (box.y1 - box.y0 + margin * 2));
  ed.zoom = clamp(Math.floor(fit * 10) / 10, ZOOM_MIN, ZOOM_MAX);
  applyZoom();
  wrap.scrollLeft = (box.x0 - margin) * ed.zoom;
  wrap.scrollTop = (box.y0 - margin) * ed.zoom;
}

function refresh() {
  renderCanvas();
  renderInspector();
  renderArduino();
}

function select(selection) {
  ed.selected = selection;
  if (selection) ed.tab = 'componente';
  renderCanvas();
  renderInspector();
}

function addAt(type, x, y, config = {}, exact = false) {
  const def = definition(type);
  const [px, py] = exact
    ? [clamp(snap(x), 0, CANVAS_W - def.w), clamp(snap(y), 20, CANVAS_H - def.h)]
    : freeSpot(def.w, def.h, x, y);
  const component = addComponent(ed.project, type, px, py);
  Object.assign(component.config, config);
  touch();
  setStatus(`${component.label} agregado: ${def.name}${config.ohms ? ` de ${formatOhms(config.ohms)}` : ''}.`);
  select({ type: 'component', id: component.id });
  renderArduino();
  return component;
}

/**
 * Lugar libre más cercano al punto pedido, para que los componentes nuevos no queden encimados.
 * Busca en anillos cada vez más grandes alrededor del punto.
 */
function freeSpot(w, h, x, y) {
  const margin = 30;
  const fits = (px, py) => ed.project.components.every((c) => {
    const [cw, ch] = sizeOf(c);
    return px + w + margin <= c.x || c.x + cw + margin <= px || py + h + margin <= c.y - 20 || c.y + ch + margin <= py - 20;
  });
  const place = (px, py) => [clamp(snap(px), 0, CANVAS_W - w), clamp(snap(py), 20, CANVAS_H - h)];
  for (let ring = 0; ring < 30; ring += 1) {
    const step = 40 * ring;
    const candidates = ring === 0 ? [[x, y]] : [];
    for (let k = -ring; k <= ring; k += 1) {
      candidates.push([x + 40 * k, y - step], [x + 40 * k, y + step], [x - step, y + 40 * k], [x + step, y + 40 * k]);
    }
    for (const [cx, cy] of candidates) {
      const [px, py] = place(cx, cy);
      if (fits(px, py)) return [px, py];
    }
  }
  return place(x, y);
}

/** Punto del plano en el centro de lo que se ve, para colocar componentes nuevos. */
function viewCenter(type) {
  const wrap = $('ed-wrap').getBoundingClientRect();
  const center = toCanvas({ clientX: wrap.left + wrap.width / 2, clientY: wrap.top + wrap.height / 3 });
  const def = definition(type);
  return [center.x - def.w / 2, center.y - def.h / 2];
}

function toCanvas(event) {
  const svg = $('ed-canvas');
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function deleteSelection() {
  if (!ed.selected) return;
  if (ed.selected.type === 'component') {
    const component = ed.project.components.find((c) => c.id === ed.selected.id);
    removeComponent(ed.project, ed.selected.id);
    setStatus(`${component.label} borrado.`);
  } else {
    removeLink(ed.project, ed.selected.id);
    setStatus('Conexión borrada.');
  }
  ed.selected = null;
  touch();
  refresh();
}

function handlePort(componentId, portId) {
  const end = { c: componentId, p: portId };
  if (!ed.pending) {
    ed.pending = end;
    const { component, port } = endPosition(end);
    setStatus(`Elegiste ${component.label}:${port.label}. Ahora toca el otro puerto. Esc cancela.`);
    renderCanvas();
    return;
  }
  if (keyOf(ed.pending) === keyOf(end)) {
    ed.pending = null;
    setStatus('Conexión cancelada.');
    renderCanvas();
    return;
  }
  const result = connect(ed.project, ed.pending, end);
  ed.pending = null;
  if (!result.ok) {
    setStatus(result.error, 'warn');
    renderCanvas();
    return;
  }
  touch();
  setStatus(`${result.link.kind === 'air' ? 'Manguera' : 'Cable'} conectado.`);
  refresh();
}

function updateRule(index, field, value) {
  const board = ed.project.components.find((c) => c.id === ed.board);
  const rule = board.config.rules[index];
  rule[field] = field === 'value' ? clamp(Math.round(Number(value) || 0), 0, 1023) : value;
  if (field === 'input') {
    const row = pinRows(ed.project, board).find((r) => r.id === value);
    const analog = row?.mode === 'analog';
    if (CONDITIONS.find((c) => c.id === rule.cond)?.analog !== analog) rule.cond = analog ? 'mayor' : 'activa';
    if (analog && rule.value === undefined) rule.value = 512;
  }
}

function bindEditor() {
  const root = $('view-editor');

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (target.closest('#ed-menu')) closeMenu();
    if (ed.sim && EDIT_ACTIONS.has(action)) stopSim('Detuve la simulación para que puedas editar.');
    if (action === 'run') {
      if (ed.sim) stopSim();
      else startSim();
      return;
    }
    if (action.startsWith('chat-')) {
      chatAction(action, target);
      return;
    }
    if (action === 'restart') {
      stopSim('');
      startSim();
      return;
    }
    if (action === 'sim-toggle') {
      if (ed.sim) toggle(ed.sim, target.dataset.id);
      return;
    }
    if (action === 'feedback-yes') {
      const result = matchProblem(ed.project.problem, ed.learned);
      if (result?.best) learn(ed.project.problem, result.best.template.id);
      ed.rango.feedback = result?.best?.template.id ?? null;
      renderInspector();
      return;
    }
    if (action === 'feedback-no') {
      ed.rango.correcting = true;
      ed.rango.showAll = true;
      renderInspector();
      setStatus('Elige abajo el problema correcto y Rango aprenderá de tu respuesta.');
      return;
    }
    if (action === 'forget-learned') {
      if (window.confirm('¿Borrar todo lo que Rango aprendió en este navegador?')) {
        ed.learned = [];
        ed.useful = [];
        saveList(LEARN_KEY, ed.learned);
        saveList(USEFUL_KEY, ed.useful);
        renderInspector();
        setStatus('Rango olvidó lo aprendido. Vuelve a usar solo sus ejemplos de fábrica.');
      }
      return;
    }
    if (action === 'web-search') {
      webSearch();
      return;
    }
    if (action === 'web-useful') {
      const url = target.dataset.url;
      ed.useful = ed.useful.includes(url) ? ed.useful.filter((u) => u !== url) : [...ed.useful, url].slice(-MAX_LEARNED);
      saveList(USEFUL_KEY, ed.useful);
      ed.web.repos = rankRepos(ed.web.repos, ed.web.query, ed.useful);
      renderInspector();
      return;
    }
    if (action === 'new') {
      $('ed-form').hidden = false;
      $('ed-new-system').value = 'todos';
      $('ed-new-name').focus();
    } else if (action === 'cancel-new') {
      $('ed-form').hidden = true;
    } else if (action === 'import') {
      $('ed-file').click();
    } else if (action === 'open') {
      openProject(target.dataset.id);
    } else if (action === 'remove-project') {
      const project = ed.projects.find((p) => p.id === target.dataset.id);
      if (project && window.confirm(`¿Borrar "${project.name}"? No se puede deshacer.`)) {
        ed.projects = ed.projects.filter((p) => p.id !== project.id);
        saveAll();
        renderList();
      }
    } else if (action === 'back') {
      renderList();
    } else if (action === 'export') {
      download(`${slug(ed.project.name)}.rangokit.json`, JSON.stringify(ed.project, null, 2), 'application/json');
      setStatus('Archivo exportado.');
    } else if (action === 'delete-selection') {
      closeMenu();
      deleteSelection();
    } else if (action === 'rotate') {
      rotateSelected(Number(target.dataset.dir));
    } else if (action === 'led-color' || action === 'set-ohms') {
      const component = ed.project.components.find((c) => c.id === ed.selected?.id);
      if (action === 'led-color') component.config.color = target.dataset.color;
      else component.config.ohms = Number(target.dataset.ohms);
      touch();
      refresh();
      setStatus(action === 'led-color'
        ? `${component.label} ahora es ${ledColor(component.config.color).label.toLowerCase()}.`
        : `${component.label} ahora es de ${formatOhms(component.config.ohms)}.`);
    } else if (action === 'duplicate') {
      const source = ed.project.components.find((c) => c.id === ed.selected?.id);
      const copy = addAt(source.type, source.x + 30, source.y + 30, structuredClone(source.config));
      copy.rot = source.rot ?? 0;
      touch();
      refresh();
    } else if (action === 'properties') {
      ed.tab = 'componente';
      renderInspector();
      $('ed-ohms-custom')?.focus();
    } else if (action === 'zoom') {
      ed.zoom = clamp(Math.round((ed.zoom + Number(target.dataset.step) * 0.2) * 10) / 10, ZOOM_MIN, ZOOM_MAX);
      applyZoom();
      setStatus(`Zoom ${Math.round(ed.zoom * 100)} %.`);
    } else if (action === 'zoom-fit') {
      zoomToFit();
      setStatus(`Zoom ${Math.round(ed.zoom * 100)} %.`);
    } else if (action === 'system') {
      ed.filter.system = target.dataset.system;
      renderPalette();
    } else if (action === 'add') {
      addAt(target.dataset.type, ...viewCenter(target.dataset.type));
    } else if (action === 'add-suggested') {
      const config = target.dataset.ohms ? { ohms: Number(target.dataset.ohms) } : {};
      const component = addAt(target.dataset.type, ...viewCenter(target.dataset.type), config);
      setStatus(`${component.label} agregado. Ahora conéctalo como indica la sugerencia.`);
    } else if (action === 'analyze') {
      ed.project.problem = $('ed-problem').value.trim();
      touch();
      ed.rango = { analyzed: true, templateId: null, level: 1, feedback: null };
      renderInspector();
    } else if (action === 'rango-more') {
      ed.rango.level = Math.min(4, ed.rango.level + 1);
      renderInspector();
    } else if (action === 'pick-template') {
      // Si el estudiante corrige a Rango, o Rango no había reconocido el problema, aprende de la elección.
      const text = ed.project.problem.trim();
      const before = ed.rango.analyzed && text ? matchProblem(text, ed.learned) : null;
      const teaches = before && (ed.rango.correcting || !before.recognized);
      if (teaches) learn(text, target.dataset.id);
      ed.rango = { analyzed: ed.rango.analyzed, templateId: target.dataset.id, level: 1, feedback: teaches ? target.dataset.id : null };
      renderInspector();
    } else if (action === 'add-missing') {
      const example = buildTemplate(currentTemplateId());
      const missing = missingFor(ed.project, example);
      // Se acomodan como en el ejemplo, a la derecha de lo que ya hay en el plano.
      const right = Math.max(0, ...ed.project.components.map((c) => c.x + sizeOf(c)[0]));
      const left = Math.min(...missing.map((m) => m.x));
      const shift = ed.project.components.length ? right + 80 - left : 0;
      for (const item of missing) addAt(item.type, item.x + shift, item.y, item.config, true);
      zoomToFit();
      ed.tab = 'rango';
      refresh();
      setStatus(`Agregué ${missing.length} componentes. Acomódalos y conéctalos siguiendo la ayuda de Conexiones.`);
    } else if (action === 'template-new' || action === 'template-here') {
      const template = TEMPLATES.find((t) => t.id === target.dataset.id);
      if (action === 'template-new') {
        const example = buildTemplate(template.id, `Ejemplo: ${template.title}`);
        example.problem = ed.project.problem;
        ed.projects.push(example);
        saveAll();
        openProject(example.id);
        setStatus('Este es el ejemplo de Rango. Tu proyecto sigue guardado en Mis proyectos.');
      } else {
        const example = buildTemplate(template.id);
        ed.project.components = example.components;
        ed.project.links = example.links;
        touch();
        refresh();
        zoomToFit();
        setStatus('Ejemplo armado. Revisa cada conexión y compárala con tu enunciado.');
      }
    } else if (action === 'tab') {
      ed.tab = target.dataset.tab;
      renderInspector();
    } else if (action === 'focus') {
      if (target.dataset.id) select({ type: 'component', id: target.dataset.id });
    } else if (action === 'add-rule') {
      const board = ed.project.components.find((c) => c.id === ed.board);
      const rows = pinRows(ed.project, board);
      const input = rows.find((r) => isInputMode(r.mode));
      const output = rows.find((r) => r.mode === 'output');
      if (!input || !output) return;
      const analog = input.mode === 'analog';
      board.config.rules.push({ input: input.id, cond: analog ? 'mayor' : 'activa', value: analog ? 512 : undefined, output: output.id, action: 'seguir' });
      touch();
      refresh();
    } else if (action === 'remove-rule') {
      const board = ed.project.components.find((c) => c.id === ed.board);
      board.config.rules.splice(Number(target.dataset.rule), 1);
      touch();
      refresh();
    } else if (action === 'copy-code') {
      const text = $('ed-code').textContent;
      navigator.clipboard?.writeText(text).then(() => setStatus('Código copiado.'), () => setStatus('No se pudo copiar. Selecciona el código y cópialo a mano.', 'warn'))
        ?? setStatus('No se pudo copiar. Selecciona el código y cópialo a mano.', 'warn');
    } else if (action === 'download-code') {
      const name = slug(ed.project.name).replace(/-/g, '_');
      download(`${name}.ino`, $('ed-code').textContent, 'text/plain');
      setStatus(`Descargado ${name}.ino.`);
    }
  });

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.target.id === 'chat-form') {
      const input = $('chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      chatSend({ text });
      input.focus();
      return;
    }
    const name = $('ed-new-name').value.trim() || 'Proyecto sin nombre';
    const project = createProject({ name, system: $('ed-new-system').value });
    project.problem = $('ed-new-problem').value.trim();
    ed.projects.push(project);
    saveAll();
    openProject(project.id);
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (ed.sim && !['ed-problem', 'ed-web-terms', 'ed-file', 'ed-search', 'ed-category'].includes(target.id) && !target.dataset.pot) {
      stopSim('Detuve la simulación para que puedas editar.');
    }
    if (target.dataset.pot) return;
    if (target.id === 'ed-file') {
      const file = target.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        const project = parseProject(JSON.parse(text));
        if (ed.projects.some((p) => p.id === project.id)) project.id = createProject().id;
        ed.projects.push(project);
        saveAll();
        openProject(project.id);
        setStatus(`Importado "${project.name}".`);
      }).catch((error) => {
        window.alert(`No se pudo importar: ${error instanceof SyntaxError ? 'el archivo no es JSON válido.' : error.message}`);
      });
      return;
    }
    if (target.id === 'ed-name') {
      ed.project.name = target.value.trim() || 'Proyecto sin nombre';
      touch();
      renderArduino();
    } else if (target.id === 'ed-category') {
      ed.filter.category = target.value;
      renderPalette();
    } else if (target.id === 'ed-label') {
      const component = ed.project.components.find((c) => c.id === ed.selected?.id);
      const label = target.value.trim();
      if (!label) {
        target.value = component.label;
      } else if (ed.project.components.some((c) => c !== component && c.label === label)) {
        setStatus(`Ya existe un componente llamado ${label}.`, 'warn');
        target.value = component.label;
      } else {
        component.label = label;
        touch();
        refresh();
      }
    } else if (target.id === 'ed-ohms' || target.id === 'ed-ohms-custom') {
      const component = ed.project.components.find((c) => c.id === ed.selected?.id);
      const ohms = Math.round(Number(target.value));
      if (ohms >= 1 && ohms <= 1e7) {
        component.config.ohms = ohms;
        touch();
        refresh();
      } else {
        setStatus('El valor debe estar entre 1 Ω y 10 MΩ.', 'warn');
        target.value = component.config.ohms;
      }
    } else if (target.id === 'ed-color') {
      const component = ed.project.components.find((c) => c.id === ed.selected?.id);
      component.config.color = target.value;
      touch();
      refresh();
    } else if (target.id === 'ed-problem') {
      ed.project.problem = target.value.trim();
      touch();
    } else if (target.id === 'ed-board') {
      ed.board = target.value;
      renderArduino();
    } else if (target.dataset.pin) {
      const board = ed.project.components.find((c) => c.id === ed.board);
      const pins = board.config.pins;
      const entry = { ...(pins[target.dataset.pin] ?? {}) };
      const value = target.value.trim();
      if (value && !(target.dataset.field === 'mode' && value === 'auto')) entry[target.dataset.field] = value;
      else delete entry[target.dataset.field];
      if (target.dataset.field === 'mode') delete entry.active;
      if (Object.keys(entry).length) pins[target.dataset.pin] = entry;
      else delete pins[target.dataset.pin];
      touch();
      refresh();
    } else if (target.dataset.rule !== undefined && target.dataset.field) {
      updateRule(Number(target.dataset.rule), target.dataset.field, target.value);
      touch();
      refresh();
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.dataset.pot && ed.sim) {
      setValue(ed.sim, event.target.dataset.pot, event.target.value);
      return;
    }
    if (event.target.id === 'ed-search') {
      ed.filter.query = event.target.value;
      renderPalette();
    }
  });

  root.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.pal-item');
    if (item) event.dataTransfer.setData('text/plain', item.dataset.type);
  });
  root.addEventListener('dragover', (event) => {
    if (event.target.closest('#ed-wrap')) event.preventDefault();
  });
  root.addEventListener('drop', (event) => {
    if (!event.target.closest('#ed-wrap')) return;
    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain');
    try { definition(type); } catch { return; }
    const point = toCanvas(event);
    const def = definition(type);
    addAt(type, point.x - def.w / 2, point.y - def.h / 2);
  });

  // Durante la simulación, el mouse acciona pulsadores y palancas en lugar de editar.
  root.addEventListener('pointerdown', (event) => {
    if (!ed.sim || event.button > 0) return;
    const hold = event.target.closest('[data-hold]');
    const node = event.target.closest('#ed-canvas .ed-comp');
    const id = hold?.dataset.hold ?? node?.dataset.comp;
    if (!id) return;
    const component = ed.project.components.find((c) => c.id === id);
    const mode = interaction(component);
    if (mode === 'hold') {
      releaseHold();
      ed.holding = id;
      press(ed.sim, id, true);
      event.preventDefault();
    } else if (mode === 'toggle' && node) {
      toggle(ed.sim, id);
      event.preventDefault();
    }
  });
  document.addEventListener('pointerup', releaseHold);
  document.addEventListener('pointercancel', releaseHold);
  document.addEventListener('keyup', (event) => {
    if (ed.holding && (event.key === ' ' || event.key === 'Enter')) releaseHold();
  });
  window.addEventListener('blur', releaseHold);

  // Plano: arrastrar, seleccionar y conectar.
  root.addEventListener('pointerdown', (event) => {
    if (ed.sim) return;
    const svg = event.target.closest('#ed-canvas');
    if (!svg || event.button > 0 || event.target.closest('[data-port]')) return;
    const node = event.target.closest('.ed-comp');
    if (!node) return;
    const component = ed.project.components.find((c) => c.id === node.dataset.comp);
    const point = toCanvas(event);
    ed.drag = { id: component.id, dx: point.x - component.x, dy: point.y - component.y, x0: point.x, y0: point.y, moved: false };
    try { svg.setPointerCapture(event.pointerId); } catch { /* sin captura, el arrastre sigue funcionando dentro del plano */ }
    ed.suppressClick = true;
    event.preventDefault();
    select({ type: 'component', id: component.id });
  });
  root.addEventListener('pointermove', (event) => {
    if (!ed.drag) return;
    const component = ed.project.components.find((c) => c.id === ed.drag.id);
    const [w, h] = sizeOf(component);
    const point = toCanvas(event);
    if (Math.hypot(point.x - ed.drag.x0, point.y - ed.drag.y0) > 3) ed.drag.moved = true;
    if (!ed.drag.moved) return;
    component.x = clamp(snap(point.x - ed.drag.dx), 0, CANVAS_W - w);
    component.y = clamp(snap(point.y - ed.drag.dy), 20, CANVAS_H - h);
    renderCanvas();
  });
  const endDrag = () => {
    if (!ed.drag) return;
    if (ed.drag.moved) touch();
    ed.drag = null;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  root.addEventListener('click', (event) => {
    if (!event.target.closest('#ed-canvas') || ed.sim) return;
    if (ed.suppressClick) {
      ed.suppressClick = false;
      return;
    }
    const port = event.target.closest('[data-port]');
    if (port) {
      handlePort(port.dataset.comp, port.dataset.port);
      return;
    }
    const link = event.target.closest('[data-link]');
    if (link) {
      select({ type: 'link', id: link.dataset.link });
      return;
    }
    if (ed.pending) {
      ed.pending = null;
      setStatus('Conexión cancelada.');
    }
    select(null);
  });

  // Menú contextual: clic derecho sobre un componente o una conexión.
  root.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('#ed-canvas')) return;
    if (ed.sim) {
      event.preventDefault();
      return;
    }
    const node = event.target.closest('.ed-comp');
    const link = event.target.closest('[data-link]');
    event.preventDefault();
    if (!node && !link) {
      closeMenu();
      return;
    }
    ed.drag = null;
    select(node ? { type: 'component', id: node.dataset.comp } : { type: 'link', id: link.dataset.link });
    openMenu(event.clientX, event.clientY);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#ed-menu')) closeMenu();
  });
  root.addEventListener('scroll', (event) => {
    if (event.target.id === 'ed-wrap') closeMenu();
  }, true);

  // El teclado se escucha en toda la página: después de un clic con el mouse, el foco no queda en el plano.
  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'chat-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $('chat-form').requestSubmit();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (ed.view !== 'edit' || $('view-editor').hidden) return;
    if (event.target.closest?.('dialog')) return;
    const menu = $('ed-menu');
    if (menu && !menu.hidden) {
      menuKeys(event);
      return;
    }
    if (event.target.closest('input, select, textarea, [contenteditable]')) return;
    if (ed.sim) {
      const hold = event.target.closest('[data-hold]');
      const node = event.target.closest('.ed-comp');
      const id = hold?.dataset.hold ?? node?.dataset.comp;
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && id) {
        const mode = interaction(ed.project.components.find((c) => c.id === id));
        if (mode === 'hold') {
          releaseHold();
          ed.holding = id;
          press(ed.sim, id, true);
          event.preventDefault();
        } else if (mode === 'toggle' && node) {
          toggle(ed.sim, id);
          event.preventDefault();
        }
      }
      return;
    }
    const port = event.target.closest('[data-port]');
    const link = event.target.closest('[data-link]');
    const node = event.target.closest('.ed-comp');
    const component = ed.selected?.type === 'component' ? ed.project.components.find((c) => c.id === ed.selected.id) : null;
    if (event.key === 'Enter' || event.key === ' ') {
      if (port) handlePort(port.dataset.comp, port.dataset.port);
      else if (link) select({ type: 'link', id: link.dataset.link });
      else if (node) select({ type: 'component', id: node.dataset.comp });
      else return;
      event.preventDefault();
      refocus(event.target);
    } else if (event.key === 'Escape') {
      ed.pending = null;
      setStatus('Listo.');
      select(null);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && ed.selected) {
      event.preventDefault();
      deleteSelection();
    } else if ((event.key === 'r' || event.key === 'R') && component && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      rotateSelected(event.shiftKey ? -1 : 1);
      refocus(event.target);
    } else if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && ed.selected) {
      event.preventDefault();
      const target = document.querySelector(ed.selected.type === 'component'
        ? `#ed-canvas .ed-comp[data-comp="${ed.selected.id}"]` : `#ed-canvas [data-link="${ed.selected.id}"]`);
      const box = target?.getBoundingClientRect();
      if (box) openMenu(box.left + Math.min(box.width, 40), box.top + Math.min(box.height, 30));
    } else if (event.key.startsWith('Arrow') && component) {
      const [w, h] = sizeOf(component);
      const [dx, dy] = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] }[event.key];
      component.x = clamp(component.x + dx, 0, CANVAS_W - w);
      component.y = clamp(component.y + dy, 20, CANVAS_H - h);
      event.preventDefault();
      touch();
      renderCanvas();
      refocus(event.target);
    }
  });
}

/** Gira el componente seleccionado 90° sobre su centro. dir = 1 horario, −1 antihorario. */
function rotateSelected(dir) {
  const component = ed.project.components.find((c) => c.id === ed.selected?.id);
  if (!component) return;
  const [w0, h0] = sizeOf(component);
  const cx = component.x + w0 / 2;
  const cy = component.y + h0 / 2;
  component.rot = ((component.rot ?? 0) + (dir > 0 ? 90 : 270)) % 360;
  const [w, h] = sizeOf(component);
  component.x = clamp(snap(cx - w / 2), 0, CANVAS_W - w);
  component.y = clamp(snap(cy - h / 2), 20, CANVAS_H - h);
  touch();
  refresh();
  setStatus(`${component.label} girado a ${component.rot}°.`);
}

const QUICK_OHMS = [220, 330, 1000, 4700, 10000];

function openMenu(x, y) {
  const menu = $('ed-menu');
  if (!menu || !ed.selected) return;
  const item = (action, text, extra = '', key = '') =>
    `<button type="button" role="menuitem" data-action="${action}"${extra}>${text}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  if (ed.selected.type === 'link') {
    const link = ed.project.links.find((l) => l.id === ed.selected.id);
    menu.innerHTML = `
      <p class="menu-title">${link.kind === 'air' ? 'Manguera' : 'Cable'}</p>
      ${item('delete-selection', 'Borrar conexión', ' class="danger"', 'Supr')}`;
  } else {
    const component = ed.project.components.find((c) => c.id === ed.selected.id);
    const def = definition(component.type);
    const colors = def.colorable ? `
      <p class="menu-label">Color</p>
      <div class="swatches" role="group" aria-label="Color del LED">${LED_COLORS.map((c) => `
        <button type="button" role="menuitemradio" data-action="led-color" data-color="${c.id}" aria-checked="${component.config.color === c.id}"
          title="${c.label} (${c.vf} V)" aria-label="${c.label}, ${c.vf} V" style="--swatch: ${c.hex}"><span></span></button>`).join('')}
      </div>` : '';
    const values = def.value ? `
      <p class="menu-label">Valor</p>
      <div class="menu-values" role="group" aria-label="Valor de la resistencia">${QUICK_OHMS.map((o) => `
        <button type="button" role="menuitemradio" data-action="set-ohms" data-ohms="${o}" aria-checked="${Number(component.config.ohms) === o}">${esc(formatOhms(o))}</button>`).join('')}
      </div>
      ${item('properties', 'Otro valor…')}` : '';
    menu.innerHTML = `
      <p class="menu-title">${esc(component.label)} · ${esc(def.name)}</p>
      ${item('rotate', 'Girar a la derecha', ' data-dir="1"', 'R')}
      ${item('rotate', 'Girar a la izquierda', ' data-dir="-1"', 'Mayús+R')}
      ${colors}${values}
      <hr>
      ${item('duplicate', 'Duplicar')}
      ${item('properties', 'Propiedades')}
      ${item('delete-selection', 'Borrar componente', ' class="danger"', 'Supr')}`;
  }
  menu.hidden = false;
  const { offsetWidth: w, offsetHeight: h } = menu;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
  menu.querySelector('button')?.focus();
}

function closeMenu() {
  const menu = $('ed-menu');
  if (menu && !menu.hidden) menu.hidden = true;
}

function menuKeys(event) {
  const menu = $('ed-menu');
  const buttons = [...menu.querySelectorAll('button')];
  const at = buttons.indexOf(document.activeElement);
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
    if (ed.selected?.type === 'component') document.querySelector(`#ed-canvas .ed-comp[data-comp="${ed.selected.id}"]`)?.focus();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    buttons[(at + 1) % buttons.length]?.focus();
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    buttons[(at - 1 + buttons.length) % buttons.length]?.focus();
  } else if (event.key === 'Tab') {
    closeMenu();
  }
}

// Después de volver a dibujar el plano, devuelve el foco al mismo elemento para no perderlo con el teclado.
function refocus(element) {
  const selector = element.dataset.port
    ? `[data-comp="${element.dataset.comp}"][data-port="${CSS.escape(element.dataset.port)}"]`
    : element.dataset.link ? `[data-link="${element.dataset.link}"]`
      : element.dataset.comp ? `.ed-comp[data-comp="${element.dataset.comp}"]` : null;
  if (selector) document.querySelector(`#ed-canvas ${selector}`)?.focus();
}

function start() {
  ed.projects = loadAll();
  ed.learned = loadList(LEARN_KEY);
  ed.useful = loadList(USEFUL_KEY).filter((url) => typeof url === 'string' && url.startsWith('https://github.com/'));
  $('nav-practice').addEventListener('click', () => showSection('practice'));
  $('nav-projects').addEventListener('click', () => showSection('projects'));
  bindEditor();
}

start();
