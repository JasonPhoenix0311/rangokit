// Motor genérico: trata cables, contactos y mangueras como aristas de un grafo.
// No conoce ninguna práctica. Las prácticas definen sus aristas en src/practices.

/** Nodos alcanzables desde `start` usando solo aristas cerradas. */
export function reach(edges, isClosed, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const node = queue.pop();
    for (const edge of edges) {
      if (!isClosed(edge)) continue;
      const next = edge.a === node ? edge.b : edge.b === node ? edge.a : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Aristas que forman parte de algún camino simple entre `from` y `to`. */
export function pathEdges(edges, isClosed, from, to) {
  const used = new Set();
  const visit = (node, visited, trail) => {
    if (node === to) {
      trail.forEach((id) => used.add(id));
      return;
    }
    for (const edge of edges) {
      if (!isClosed(edge)) continue;
      const next = edge.a === node ? edge.b : edge.b === node ? edge.a : null;
      if (next === null || visited.has(next)) continue;
      visited.add(next);
      visit(next, visited, [...trail, edge.id]);
      visited.delete(next);
    }
  };
  visit(from, new Set([from]), []);
  return used;
}

/**
 * Recorre una cadena esperada y devuelve la primera arista interrumpida.
 * Las bobinas se cruzan porque son la carga, no un punto de corte.
 */
export function firstBreak(edges, chain, isClosed) {
  for (const id of chain) {
    const edge = edges.find((candidate) => candidate.id === id);
    if (!edge) throw new Error(`La cadena usa una arista inexistente: ${id}`);
    if (edge.type === 'coil') continue;
    if (!isClosed(edge)) return edge;
  }
  return null;
}
