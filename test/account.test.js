import test from 'node:test';
import assert from 'node:assert/strict';
import { API_BASE, SESSION_KEY, AccountError, createAccountClient, memoryStorage, toAccount } from '../src/account.js';
import { canUse, planOf } from '../src/plans.js';

// fetch falso: responde según la ruta y guarda cada llamada.
function fakeServer(routes) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    const route = routes[url.replace(API_BASE, '')];
    if (route instanceof Error) throw route;
    const { status = 200, json } = typeof route === 'function' ? route(options) : route ?? { status: 404, json: { detail: 'No existe' } };
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return { fetch, calls };
}

const SESSION = { token: 'tok-1', cuenta: { id: 'u1', email: 'maestra@escuela.mx', rol: 'docente', plan: 'gratis' } };
const CODE = { requiere_codigo: true, desafio: 'des-1', destino: 'm•••@escuela.mx', proposito: 'rangokit_verificar' };

test('registrarse envía solo correo, contraseña y la aceptación del aviso', async () => {
  const server = fakeServer({ '/registro': { json: CODE } });
  const client = createAccountClient({ fetch: server.fetch, storage: memoryStorage() });
  const result = await client.register('  maestra@escuela.mx ', 'contrasena-segura', true);
  assert.deepEqual(result, { step: 'code', challenge: 'des-1', destination: 'm•••@escuela.mx', purpose: 'rangokit_verificar', testCode: undefined });
  assert.equal(server.calls[0].url, `${API_BASE}/registro`);
  assert.equal(server.calls[0].options.method, 'POST');
  assert.equal(server.calls[0].options.credentials, 'omit');
  assert.deepEqual(server.calls[0].body, { email: 'maestra@escuela.mx', password: 'contrasena-segura', acepto_aviso: true });
});

test('el servidor es el de DDTEC con HTTPS', () => {
  assert.equal(API_BASE, 'https://ddtec.com.mx/phoenix/fenix/v1/rangokit');
});

test('confirmar el código guarda la sesión con plan gratis de docente', async () => {
  const storage = memoryStorage();
  const server = fakeServer({ '/verificar': { json: SESSION } });
  const client = createAccountClient({ fetch: server.fetch, storage });
  const result = await client.verify('des-1', ' 123456 ');
  assert.equal(result.step, 'done');
  assert.deepEqual(server.calls[0].body, { desafio: 'des-1', codigo: '123456' });
  assert.deepEqual(client.session(), { id: 'u1', email: 'maestra@escuela.mx', role: 'docente', plan: 'gratis', accountVersion: 1 });
  assert.equal(planOf(client.session()).id, 'docente');
  assert.ok(JSON.parse(storage.getItem(SESSION_KEY)).token === 'tok-1');
});

test('entrar sin confirmar pide el código', async () => {
  const client = createAccountClient({ fetch: fakeServer({ '/entrar': { json: CODE } }).fetch, storage: memoryStorage() });
  assert.equal((await client.login('maestra@escuela.mx', 'x')).step, 'code');
  assert.equal(client.session(), null);
});

test('los errores del servidor se muestran tal cual y no guardan sesión', async () => {
  const server = fakeServer({ '/entrar': { status: 401, json: { detail: 'Correo o contraseña incorrectos' } } });
  const client = createAccountClient({ fetch: server.fetch, storage: memoryStorage() });
  await assert.rejects(client.login('a@b.mx', 'mala'), (error) => {
    assert.ok(error instanceof AccountError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Correo o contraseña incorrectos');
    return true;
  });
  assert.equal(client.session(), null);
});

test('si el servicio de cuentas no está instalado lo dice en español', async () => {
  const client = createAccountClient({ fetch: fakeServer({}).fetch, storage: memoryStorage() });
  // fakeServer responde 404 con { detail: 'No existe' } a rutas desconocidas; simulamos el 404 de FastAPI
  const fastapi404 = async () => ({ ok: false, status: 404, json: async () => ({ detail: 'Not Found' }) });
  await assert.rejects(createAccountClient({ fetch: fastapi404, storage: memoryStorage() }).login('a@b.mx', 'x'),
    /todavía no están disponibles/);
  await assert.rejects(client.login('a@b.mx', 'x'), /No existe/);
});

test('sin conexión da un mensaje claro', async () => {
  const client = createAccountClient({ fetch: fakeServer({ '/entrar': new TypeError('Failed to fetch') }).fetch, storage: memoryStorage() });
  await assert.rejects(client.login('a@b.mx', 'x'), /No se pudo conectar con DDTEC/);
});

test('una respuesta rara del servidor no inicia sesión', async () => {
  const client = createAccountClient({ fetch: fakeServer({ '/entrar': { json: { token: 5 } } }).fetch, storage: memoryStorage() });
  await assert.rejects(client.login('a@b.mx', 'x'), AccountError);
  assert.equal(client.session(), null);
});

test('recuperar y restablecer la contraseña', async () => {
  const server = fakeServer({
    '/recuperar': { json: { ...CODE, proposito: 'rangokit_recuperar' } },
    '/restablecer': { json: SESSION },
  });
  const client = createAccountClient({ fetch: server.fetch, storage: memoryStorage() });
  const step = await client.recover('maestra@escuela.mx');
  assert.equal(step.purpose, 'rangokit_recuperar');
  await client.reset(step.challenge, '654321', 'nueva-contrasena');
  assert.deepEqual(server.calls[1].body, { desafio: 'des-1', codigo: '654321', password: 'nueva-contrasena' });
  assert.equal(client.session().email, 'maestra@escuela.mx');
});

test('salir borra la sesión', async () => {
  const storage = memoryStorage();
  const client = createAccountClient({ fetch: fakeServer({ '/verificar': { json: SESSION } }).fetch, storage });
  await client.verify('des-1', '123456');
  client.logout();
  assert.equal(client.session(), null);
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test('refrescar usa el token y cierra la sesión si el servidor la rechaza', async () => {
  const storage = memoryStorage();
  storage.setItem(SESSION_KEY, JSON.stringify({ token: 'tok-1', account: SESSION.cuenta }));
  const server = fakeServer({ '/cuenta': { status: 401, json: { detail: 'Tu sesión terminó' } } });
  const client = createAccountClient({ fetch: server.fetch, storage });
  assert.equal(await client.refresh(), null);
  assert.equal(server.calls[0].options.method, 'GET');
  assert.equal(server.calls[0].options.headers.Authorization, 'Bearer tok-1');
  assert.equal(client.session(), null);
});

test('refrescar sin conexión conserva la sesión guardada', async () => {
  const storage = memoryStorage();
  storage.setItem(SESSION_KEY, JSON.stringify({ token: 'tok-1', account: SESSION.cuenta }));
  const client = createAccountClient({ fetch: fakeServer({ '/cuenta': new TypeError('offline') }).fetch, storage });
  assert.equal((await client.refresh()).email, 'maestra@escuela.mx');
});

test('refrescar actualiza el plan que diga el servidor', async () => {
  const storage = memoryStorage();
  storage.setItem(SESSION_KEY, JSON.stringify({ token: 'tok-1', account: SESSION.cuenta }));
  const server = fakeServer({ '/cuenta': { json: { ...SESSION.cuenta, plan: 'docente-pro' } } });
  const client = createAccountClient({ fetch: server.fetch, storage });
  assert.equal((await client.refresh()).plan, 'docente-pro');
  assert.equal(client.session().plan, 'docente-pro');
});

test('sin sesión, refrescar no llama al servidor', async () => {
  const server = fakeServer({});
  const client = createAccountClient({ fetch: server.fetch, storage: memoryStorage() });
  assert.equal(await client.refresh(), null);
  assert.equal(server.calls.length, 0);
});

test('una sesión guardada dañada se ignora', () => {
  const storage = memoryStorage();
  storage.setItem(SESSION_KEY, '{no es json');
  assert.equal(createAccountClient({ fetch: async () => {}, storage }).session(), null);
  storage.setItem(SESSION_KEY, JSON.stringify({ token: 't', account: { id: 1 } }));
  assert.equal(createAccountClient({ fetch: async () => {}, storage }).session(), null);
});

test('una cuenta sin plan queda en gratis y conserva el acceso gratuito', () => {
  const account = toAccount({ id: 'u2', email: 'x@y.mx', rol: 'docente' });
  assert.equal(account.plan, 'gratis');
  assert.equal(canUse(account, 'simulador'), true);
  assert.equal(canUse(null, 'simulador'), true);
});

test('el cliente nunca envía proyectos ni enunciados', async () => {
  const server = fakeServer({ '/registro': { json: CODE }, '/entrar': { json: SESSION }, '/recuperar': { json: CODE } });
  const client = createAccountClient({ fetch: server.fetch, storage: memoryStorage() });
  await client.register('a@b.mx', 'contrasena', true);
  await client.login('a@b.mx', 'contrasena');
  await client.recover('a@b.mx');
  const allowed = new Set(['email', 'password', 'acepto_aviso']);
  for (const call of server.calls) for (const key of Object.keys(call.body)) assert.ok(allowed.has(key), key);
});
