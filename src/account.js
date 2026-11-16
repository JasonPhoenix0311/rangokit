// Cuenta de docente con la cuenta DDTEC compartida. Sin DOM, para poder probarlo.
// Solo envía al servidor de DDTEC el correo, la contraseña y los códigos de verificación.
// Los proyectos, los enunciados y lo que aprende Rango nunca salen del navegador.
import { migrateAccount } from './plans.js';

export const API_BASE = 'https://ddtec.com.mx/phoenix/fenix/v1/rangokit';
export const PRIVACY_URL = 'https://ddtec.com.mx/phoenix/privacidad';
export const SESSION_KEY = 'rangokit.sesion';

export class AccountError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
  }
}

// localStorage puede no existir o fallar (modo privado). Sin él, la sesión dura hasta cerrar la página.
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    storage.getItem(SESSION_KEY);
    return storage;
  } catch {
    return memoryStorage();
  }
}

// Respuesta del servidor → cuenta de Rangokit, con el plan migrado ("gratis" si falta).
export function toAccount(cuenta) {
  if (!cuenta || typeof cuenta !== 'object' || typeof cuenta.email !== 'string') return null;
  return migrateAccount({ id: String(cuenta.id ?? ''), email: cuenta.email, role: cuenta.rol ?? cuenta.role ?? 'docente', plan: cuenta.plan });
}

export function createAccountClient({ fetch: request = globalThis.fetch?.bind(globalThis), storage = browserStorage(), base = API_BASE } = {}) {
  function read() {
    try {
      const saved = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null');
      const account = toAccount(saved?.account);
      return saved && typeof saved.token === 'string' && account ? { token: saved.token, account } : null;
    } catch {
      return null;
    }
  }

  function save(token, account) {
    try { storage.setItem(SESSION_KEY, JSON.stringify({ token, account })); } catch { /* sin almacenamiento */ }
  }

  function clear() {
    try { storage.removeItem(SESSION_KEY); } catch { /* sin almacenamiento */ }
  }

  async function call(path, body, token) {
    if (typeof request !== 'function') throw new AccountError('Este navegador no puede conectarse con DDTEC.');
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await request(`${base}${path}`, {
        method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit', cache: 'no-store',
      });
    } catch {
      throw new AccountError('No se pudo conectar con DDTEC. Revisa tu conexión e intenta de nuevo.');
    }
    let data = null;
    try { data = await response.json(); } catch { /* respuesta sin JSON */ }
    if (!response.ok) {
      // 404 genérico o error del proxy: el servicio de cuentas no está instalado o no responde.
      const missing = (response.status === 404 && data?.detail === 'Not Found') || response.status === 502;
      const detail = !missing && typeof data?.detail === 'string' ? data.detail
        : missing ? 'Las cuentas de docente todavía no están disponibles. Intenta más tarde.'
          : 'El servidor de DDTEC no respondió bien. Intenta más tarde.';
      throw new AccountError(detail, response.status);
    }
    return data ?? {};
  }

  // Cada paso termina en sesión iniciada o en pedir el código enviado al correo.
  function outcome(data) {
    if (data.requiere_codigo) {
      return { step: 'code', challenge: data.desafio, destination: data.destino ?? 'tu correo', purpose: data.proposito, testCode: data.codigo_prueba };
    }
    const account = toAccount(data.cuenta);
    if (typeof data.token !== 'string' || !account) throw new AccountError('El servidor de DDTEC no respondió bien. Intenta más tarde.');
    save(data.token, account);
    return { step: 'done', account };
  }

  const email = (value) => String(value ?? '').trim();

  return {
    session: () => read()?.account ?? null,
    register: async (address, password, accepted) =>
      outcome(await call('/registro', { email: email(address), password: String(password ?? ''), acepto_aviso: accepted === true })),
    login: async (address, password) => outcome(await call('/entrar', { email: email(address), password: String(password ?? '') })),
    verify: async (challenge, code) => outcome(await call('/verificar', { desafio: challenge, codigo: String(code ?? '').trim() })),
    recover: async (address) => outcome(await call('/recuperar', { email: email(address) })),
    reset: async (challenge, code, password) =>
      outcome(await call('/restablecer', { desafio: challenge, codigo: String(code ?? '').trim(), password: String(password ?? '') })),
    resend: async (challenge) => outcome(await call('/reenviar', { desafio: challenge })),
    // Confirma la sesión guardada. Si el servidor la rechaza, se cierra; sin conexión, se conserva.
    async refresh() {
      const saved = read();
      if (!saved) return null;
      try {
        const account = toAccount(await call('/cuenta', null, saved.token));
        if (!account) return saved.account;
        save(saved.token, account);
        return account;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          clear();
          return null;
        }
        return saved.account;
      }
    },
    logout: clear,
  };
}
