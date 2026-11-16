// Botón y diálogo de cuenta de docente. Los estudiantes usan Rangokit sin cuenta.
import { createAccountClient, PRIVACY_URL } from './account.js';
import { formatPrice, planOf } from './plans.js';

const client = createAccountClient();
const $ = (id) => document.getElementById(id);
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const state = { view: 'login', email: '', challenge: null, destination: '', purpose: '', busy: false };

const NOTE = `<p class="acc-note">Los estudiantes no necesitan cuenta: el simulador, las prácticas y las pistas son gratis.
  Tu cuenta es una cuenta DDTEC y solo envía tu correo y tu contraseña a ddtec.com.mx. Tus proyectos siguen solo en este navegador.</p>`;

const field = (id, label, type, extra = '') =>
  `<label class="acc-field" for="${id}">${label}<input id="${id}" name="${id}" type="${type}" ${extra} required></label>`;

function views() {
  const account = client.session();
  return {
    login: `
      <h2 id="acc-title">Entrar como docente</h2>
      <form id="acc-form" data-action="login" novalidate>
        ${field('acc-email', 'Correo', 'email', `autocomplete="email" value="${esc(state.email)}"`)}
        ${field('acc-password', 'Contraseña', 'password', 'autocomplete="current-password"')}
        <div class="acc-actions"><button class="primary" type="submit">Entrar</button></div>
      </form>
      <p class="acc-links"><button type="button" class="acc-link" data-go="register">Crear cuenta de docente</button>
        <button type="button" class="acc-link" data-go="recover">Olvidé mi contraseña</button></p>
      ${NOTE}`,
    register: `
      <h2 id="acc-title">Crear cuenta de docente</h2>
      <form id="acc-form" data-action="register" novalidate>
        ${field('acc-email', 'Correo', 'email', `autocomplete="email" value="${esc(state.email)}"`)}
        ${field('acc-password', 'Contraseña (mínimo 8 caracteres)', 'password', 'autocomplete="new-password" minlength="8" maxlength="72"')}
        <label class="acc-check"><input id="acc-accept" type="checkbox" required>
          <span>Acepto el <a href="${PRIVACY_URL}" target="_blank" rel="noopener">aviso de privacidad de DDTEC</a>.</span></label>
        <div class="acc-actions"><button class="primary" type="submit">Crear cuenta</button></div>
      </form>
      <p class="acc-links"><button type="button" class="acc-link" data-go="login">Ya tengo cuenta</button></p>
      ${NOTE}`,
    recover: `
      <h2 id="acc-title">Recuperar contraseña</h2>
      <form id="acc-form" data-action="recover" novalidate>
        ${field('acc-email', 'Correo de tu cuenta', 'email', `autocomplete="email" value="${esc(state.email)}"`)}
        <div class="acc-actions"><button class="primary" type="submit">Enviarme un código</button></div>
      </form>
      <p class="acc-links"><button type="button" class="acc-link" data-go="login">Volver</button></p>`,
    code: `
      <h2 id="acc-title">Escribe el código</h2>
      <p>Te enviamos un código de 6 dígitos a <b>${esc(state.destination)}</b>. Vence en unos minutos.</p>
      <form id="acc-form" data-action="${state.purpose === 'rangokit_recuperar' ? 'reset' : 'verify'}" novalidate>
        ${field('acc-code', 'Código', 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}"')}
        ${state.purpose === 'rangokit_recuperar' ? field('acc-password', 'Contraseña nueva (mínimo 8 caracteres)', 'password', 'autocomplete="new-password" minlength="8" maxlength="72"') : ''}
        <div class="acc-actions"><button class="primary" type="submit">Confirmar</button></div>
      </form>
      <p class="acc-links"><button type="button" class="acc-link" data-resend>Reenviar código</button>
        <button type="button" class="acc-link" data-go="login">Cancelar</button></p>`,
    account: account ? `
      <h2 id="acc-title">Tu cuenta</h2>
      <p>Entraste como <b>${esc(account.email)}</b>.</p>
      <p>Plan: <b>${esc(planOf(account).name)}</b> · ${esc(formatPrice(planOf(account)))}.
        Grupos y asignar prácticas: <span class="soon">Próximamente</span></p>
      <p class="acc-links"><a href="planes/index.html">Ver planes</a></p>
      <div class="acc-actions"><button type="button" id="acc-logout">Salir</button></div>` : '',
  };
}

function render(message = '', kind = '') {
  const dialog = $('account-dialog');
  if (!dialog) return;
  const view = state.view === 'account' && !client.session() ? 'login' : state.view;
  dialog.innerHTML = `
    <div class="acc-body">
      <button type="button" class="acc-close" data-close aria-label="Cerrar">×</button>
      ${views()[view]}
      <p class="acc-status ${kind}" id="acc-status" role="status" aria-live="polite">${esc(message)}</p>
    </div>`;
  dialog.querySelector('input:not([type=checkbox])')?.focus();
  updateButton();
}

function updateButton() {
  const button = $('account-open');
  if (!button) return;
  const account = client.session();
  button.textContent = account ? 'Mi cuenta' : 'Docentes: entrar';
  button.title = account ? `Sesión de ${account.email}` : 'Cuenta para docentes. Los estudiantes no necesitan cuenta.';
}

function go(view, message = '', kind = '') {
  state.view = view;
  render(message, kind);
}

function value(id) {
  return $(id)?.value ?? '';
}

function check(form) {
  const email = form.querySelector('#acc-email');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return 'Escribe un correo válido.';
  const password = form.querySelector('#acc-password');
  if (password && password.value.length < (form.dataset.action === 'login' ? 1 : 8)) {
    return form.dataset.action === 'login' ? 'Escribe tu contraseña.' : 'La contraseña debe tener al menos 8 caracteres.';
  }
  const code = form.querySelector('#acc-code');
  if (code && !/^\d{6}$/.test(code.value.trim())) return 'El código tiene 6 dígitos.';
  if (form.dataset.action === 'register' && !$('acc-accept')?.checked) return 'Para crear tu cuenta acepta el aviso de privacidad.';
  return '';
}

async function handle(result, doneMessage) {
  if (result.step === 'code') {
    state.challenge = result.challenge;
    state.destination = result.destination;
    state.purpose = result.purpose;
    go('code', result.testCode ? `Modo de prueba del servidor: el código es ${result.testCode}.` : '');
    return;
  }
  go('account', doneMessage, 'ok');
}

async function submit(event) {
  event.preventDefault();
  const form = event.target;
  if (state.busy) return;
  const problem = check(form);
  if (problem) {
    $('acc-status').textContent = problem;
    $('acc-status').className = 'acc-status bad';
    return;
  }
  if (form.querySelector('#acc-email')) state.email = value('acc-email').trim();
  state.busy = true;
  form.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
  $('acc-status').textContent = 'Conectando con DDTEC…';
  $('acc-status').className = 'acc-status';
  try {
    const action = form.dataset.action;
    if (action === 'login') await handle(await client.login(state.email, value('acc-password')), 'Listo, ya entraste.');
    else if (action === 'register') await handle(await client.register(state.email, value('acc-password'), $('acc-accept').checked), '');
    else if (action === 'recover') await handle(await client.recover(state.email), '');
    else if (action === 'verify') await handle(await client.verify(state.challenge, value('acc-code')), 'Tu cuenta quedó confirmada.');
    else if (action === 'reset') await handle(await client.reset(state.challenge, value('acc-code'), value('acc-password')), 'Tu contraseña quedó cambiada.');
  } catch (error) {
    render(error.message, 'bad');
    if (form.querySelector('#acc-password')) $('acc-password')?.focus();
  } finally {
    state.busy = false;
  }
}

async function click(event) {
  const dialog = $('account-dialog');
  if (event.target === dialog || event.target.closest('[data-close]')) {
    dialog.close();
    return;
  }
  const goTo = event.target.closest('[data-go]');
  if (goTo) {
    if ($('acc-email')) state.email = value('acc-email').trim();
    go(goTo.dataset.go);
    return;
  }
  if (event.target.closest('#acc-logout')) {
    client.logout();
    go('login', 'Saliste de tu cuenta.', 'ok');
    return;
  }
  if (event.target.closest('[data-resend]') && !state.busy) {
    state.busy = true;
    try {
      await handle(await client.resend(state.challenge), '');
      $('acc-status').textContent = 'Te enviamos un código nuevo.';
    } catch (error) {
      $('acc-status').textContent = error.message;
      $('acc-status').className = 'acc-status bad';
    } finally {
      state.busy = false;
    }
  }
}

function open() {
  const dialog = $('account-dialog');
  state.view = client.session() ? 'account' : 'login';
  render();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function start() {
  const button = $('account-open');
  const dialog = $('account-dialog');
  if (!button || !dialog) return;
  button.addEventListener('click', open);
  dialog.addEventListener('submit', submit);
  dialog.addEventListener('click', click);
  updateButton();
  // Revisa en silencio si la sesión guardada sigue vigente. Solo si ya había una sesión.
  if (client.session()) client.refresh().then(updateButton);
}

start();
