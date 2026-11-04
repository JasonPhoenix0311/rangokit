// Página pública /planes. Se genera en el build como HTML estático, sin scripts ni formularios.
import { ALWAYS_FREE, FEATURES, PLANS, PRICING_NOTICE, formatPrice, getPlan } from './plans.js';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function featureItem(id) {
  const feature = FEATURES[id];
  const soon = feature.available ? '' : ' <span class="soon">Próximamente</span>';
  return `<li class="${feature.available ? 'ready' : 'later'}">${escape(feature.name)}${soon}</li>`;
}

function planCard(plan) {
  const free = plan.price === 0;
  const account = plan.requiresAccount ? 'Requiere cuenta' : 'No requiere cuenta';
  const base = plan.base ? getPlan(plan.base) : null;
  const own = base ? plan.features.filter((id) => !base.features.includes(id)) : plan.features;
  const items = [
    ...(base ? [`<li class="ready">Todo lo de ${escape(base.name)}, más:</li>`] : []),
    ...own.map(featureItem),
  ];
  return `<article class="plan${free ? ' free' : ''}" id="plan-${plan.id}">
  <h2>${escape(plan.name)}</h2>
  <p class="price">${escape(formatPrice(plan))}</p>
  <p class="summary">${escape(plan.summary)}</p>
  <ul class="features">
    ${items.join('\n    ')}
  </ul>
  <p class="account">${account}</p>
</article>`;
}

// `source` es el enlace al código fuente que pide la AGPL, igual que en la página principal.
export function renderPlansPage({ styles = '', source = '' } = {}) {
  const alwaysFree = ALWAYS_FREE.map((id) => escape(FEATURES[id].name.toLowerCase())).join(', ');
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Planes · Rangokit</title>
<meta name="description" content="Planes de Rangokit para estudiantes, docentes y escuelas. ${escape(PRICING_NOTICE)}">
<style>${styles}</style>
</head>
<body>
<div class="app plans-page">
  <header class="top">
    <div class="brand">
      <p class="wordmark">Rangokit</p>
      <p class="sheet-id">Planes</p>
    </div>
    <div class="goal">
      <h1>Planes para estudiantes, docentes y escuelas</h1>
      <p>El simulador y las pistas por reglas siguen gratis y sin cuenta.</p>
    </div>
    <div class="top-links">
      <a class="home-link" href="../index.html">← Volver al simulador</a>
    </div>
  </header>

  <p class="notice" role="note"><b>Aviso:</b> ${escape(PRICING_NOTICE)}</p>

  <section class="plans" aria-label="Planes">
    ${PLANS.map(planCard).join('\n    ')}
  </section>

  <section class="promise" aria-label="Lo que siempre es gratis">
    <h2>Siempre gratis</h2>
    <p>Con o sin cuenta, y con cualquier plan: ${alwaysFree}.</p>
    <p>Si tu docente te deja una práctica, hacerla y entregarla no cuesta nada.</p>
  </section>

  <footer>
    <p>Las funciones marcadas como "Próximamente" todavía no existen. Ningún plan está a la venta: Rangokit no pide tarjeta ni datos de facturación.</p>
    <p>Rangokit es código abierto bajo licencia AGPL-3.0.${source}</p>
  </footer>
</div>
</body>
</html>
`;
}
