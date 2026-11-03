// Búsqueda de proyectos en la red (GitHub). Solo se usa cuando el estudiante lo pide.
//
// Privacidad: el enunciado del estudiante nunca sale del navegador. A GitHub solo se envían las
// palabras de búsqueda que el estudiante ve en pantalla y puede editar antes de buscar.
// Los resultados son contenido externo sin verificar: se muestran como enlaces, nunca se ejecutan.
import { features } from './learn.js';

/** Palabras de búsqueda por problema. Van en inglés porque así está la mayoría de los proyectos. */
export const SEARCH = {
  'cilindro-se-boton': ['pneumatic single acting cylinder', 'pneumatic circuit 3/2 valve'],
  'cilindro-de-palanca': ['pneumatic double acting cylinder', 'pneumatic circuit 5/2 valve'],
  'electro-directo': ['electropneumatic solenoid valve', 'electro pneumatic circuit'],
  'enclavamiento-rele': ['relay latching start stop', 'electropneumatic relay circuit'],
  'arduino-led-boton': ['arduino button led', 'arduino pushbutton'],
  'arduino-cilindro': ['arduino pneumatic cylinder', 'arduino solenoid valve relay'],
  'arduino-potenciometro': ['arduino potentiometer led', 'arduino analogread potentiometer'],
};

export const GITHUB_SEARCH = 'https://api.github.com/search/repositories';

/** Dirección de búsqueda. Limpia el texto para que no viaje nada más que palabras. */
export function searchUrl(terms, perPage = 12) {
  const clean = String(terms).replace(/[^\p{L}\p{N}\s/+.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const params = new URLSearchParams({ q: `${clean} in:name,description,readme`, sort: 'stars', order: 'desc', per_page: String(perPage) });
  return `${GITHUB_SEARCH}?${params}`;
}

/** Convierte la respuesta de GitHub en una lista simple con solo lo que se muestra. */
export function parseRepos(json) {
  return (json?.items ?? []).filter((item) => item && typeof item.html_url === 'string' && item.html_url.startsWith('https://github.com/')).map((item) => ({
    name: String(item.full_name ?? item.name ?? ''),
    url: item.html_url,
    description: String(item.description ?? '').slice(0, 280),
    stars: Number(item.stargazers_count) || 0,
    language: item.language ? String(item.language) : '',
    updated: String(item.pushed_at ?? item.updated_at ?? ''),
    topics: Array.isArray(item.topics) ? item.topics.map(String).slice(0, 8) : [],
  }));
}

/**
 * Ordena los proyectos por parecido con la búsqueda, popularidad y lo que al estudiante ya le sirvió.
 * Así la búsqueda también se adapta: lo marcado como útil sube en las siguientes búsquedas.
 */
export function rankRepos(repos, terms, useful = []) {
  // Solo raíces sueltas: los pares de palabras exigen el mismo orden y castigan títulos cortos.
  const words = (text) => new Set(features(text).tokens.filter((t) => !t.includes('_')));
  const wanted = words(terms);
  return repos.map((repo) => {
    const tokens = words(`${repo.name.replace(/[-_/]/g, ' ')} ${repo.description} ${repo.topics.join(' ')}`);
    const overlap = [...wanted].filter((t) => tokens.has(t)).length / Math.max(1, wanted.size);
    // Las estrellas solo cuentan si el proyecto se parece a la búsqueda: un proyecto famoso pero ajeno no sube.
    const score = overlap * 4 + (overlap > 0 ? Math.log10(repo.stars + 1) * 0.5 : 0) + (useful.includes(repo.url) ? 4 : 0);
    return { ...repo, score, useful: useful.includes(repo.url), match: Math.round(overlap * 100) };
  }).sort((a, b) => b.score - a.score);
}

/** Busca en GitHub. Si la primera búsqueda no da resultados, intenta con la segunda opción del problema. */
export async function searchProjects(terms, { fallback, useful = [], fetcher = fetch } = {}) {
  const attempt = async (query) => {
    const response = await fetcher(searchUrl(query), { headers: { Accept: 'application/vnd.github+json' } });
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers?.get?.('x-ratelimit-remaining');
      const reset = Number(response.headers?.get?.('x-ratelimit-reset'));
      if (remaining === '0' || response.status === 429 || remaining == null) {
        const when = reset ? ` Podrás buscar de nuevo a las ${new Date(reset * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.` : ' Espera un momento y vuelve a intentar.';
        throw new Error(`GitHub limita las búsquedas sin cuenta a unas 10 por minuto.${when}`);
      }
      throw new Error('GitHub rechazó la búsqueda (403).');
    }
    if (!response.ok) throw new Error(`GitHub respondió con un error (${response.status}).`);
    return parseRepos(await response.json());
  };
  let repos = await attempt(terms);
  let used = terms;
  if (!repos.length && fallback && fallback !== terms) {
    repos = await attempt(fallback);
    used = fallback;
  }
  return { query: used, repos: rankRepos(repos, used, useful) };
}
