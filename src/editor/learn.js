// Aprendizaje automático de Rango: clasificador Naive Bayes multinomial para reconocer el tipo de
// problema a partir del enunciado. Se entrena con ejemplos propios y se adapta con las respuestas
// del estudiante. Corre completo en el navegador, sin dependencias y sin enviar el texto a ningún lado.
//
// Solo reconoce el tipo de problema. Los errores de cableado los siguen decidiendo las reglas.

const STOPWORDS = new Set(`a al algo ante como con contra cual cuando de del desde donde dos e el ella ellos en entre
era es esa ese eso esta este esto estos fue ha hace haga haz hay la las le les lo los mas me mi mismo muy
ni no nos o otra otro para pero por que quien se segun ser si sin sobre su sus tal tambien te tiene todo
tu un una uno unos unas usa usando usar y ya debe deben puede pueden cada cierto cierta hacer manera
forma tipo mediante cual cuales siguiente siguientes realiza realizar disena diseña elabora circuito
sistema practica`.split(/\s+/));

const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Raíz corta: los primeros 5 caracteres. Junta "cilindro" y "cilindros", "pulsar" y "pulsador". */
export const stem = (word) => (word.length > 5 ? word.slice(0, 5) : word);

/**
 * Convierte un texto en rasgos: raíces de palabras y pares de raíces seguidas ("simpl_efect").
 * Devuelve también qué palabra original produjo cada raíz, para explicar la decisión.
 */
export function features(text) {
  const words = fold(text ?? '').split(/[^a-z0-9/]+/).filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w) || w === '24' || w === '5/2' || w === '3/2');
  const origin = new Map();
  const stems = words.map((w) => {
    const s = stem(w);
    if (!origin.has(s)) origin.set(s, w);
    return s;
  });
  const tokens = [...stems];
  for (let i = 0; i + 1 < stems.length; i += 1) {
    const pair = `${stems[i]}_${stems[i + 1]}`;
    tokens.push(pair);
    if (!origin.has(pair)) origin.set(pair, `${words[i]} ${words[i + 1]}`);
  }
  return { tokens, origin };
}

export function createModel() {
  return { classes: new Map(), vocab: new Set(), docs: 0 };
}

/** Agrega un ejemplo al modelo. El peso permite que las respuestas del estudiante cuenten más. */
export function train(model, text, label, weight = 1) {
  const { tokens } = features(text);
  if (!tokens.length) return model;
  if (!model.classes.has(label)) model.classes.set(label, { docs: 0, total: 0, counts: new Map() });
  const entry = model.classes.get(label);
  entry.docs += weight;
  model.docs += weight;
  for (const token of tokens) {
    entry.counts.set(token, (entry.counts.get(token) ?? 0) + weight);
    entry.total += weight;
    model.vocab.add(token);
  }
  return model;
}

const logLikelihood = (model, entry, token) => Math.log(((entry.counts.get(token) ?? 0) + 1) / (entry.total + model.vocab.size));

/**
 * Clasifica un texto. Devuelve las clases ordenadas por probabilidad, las palabras que más pesaron
 * para la mejor y cuántos rasgos del texto conoce el modelo. Con pocos rasgos conocidos no hay
 * evidencia suficiente y quien llama debe decir que no reconoce el problema.
 */
export function predict(model, text) {
  const { tokens, origin } = features(text);
  const known = [...new Set(tokens)].filter((t) => model.vocab.has(t));
  const scored = [...model.classes].map(([label, entry]) => {
    let logp = Math.log(entry.docs / model.docs);
    for (const token of known) logp += logLikelihood(model, entry, token);
    return { label, logp };
  }).sort((a, b) => b.logp - a.logp);
  if (!scored.length) return { ranked: [], known: 0, reasons: [] };
  const top = scored[0].logp;
  const sum = scored.reduce((acc, s) => acc + Math.exp(s.logp - top), 0);
  const ranked = scored.map((s) => ({ label: s.label, prob: Math.exp(s.logp - top) / sum }));

  // Palabras que más separan la clase ganadora de las demás.
  const best = model.classes.get(ranked[0].label);
  const others = [...model.classes].filter(([label]) => label !== ranked[0].label).map(([, entry]) => entry);
  const reasons = known.map((token) => {
    const mine = logLikelihood(model, best, token);
    const rival = Math.max(...others.map((entry) => logLikelihood(model, entry, token)), -Infinity);
    return { token, word: origin.get(token), gain: mine - rival };
  }).filter((r) => r.gain > 0.3).sort((a, b) => b.gain - a.gain);
  const words = [...new Set(reasons.map((r) => r.word))].slice(0, 6);

  // Solo cuentan como evidencia los rasgos que distinguen alguna clase, no los que aparecen en todas.
  const informative = known.filter((token) => {
    const values = [...model.classes.values()].map((entry) => logLikelihood(model, entry, token));
    return Math.max(...values) - Math.min(...values) > 0.5;
  });
  return { ranked, known: informative.length, reasons: words };
}
