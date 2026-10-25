// SEO pass 2 (2026-10-20): Shifts, CRM and Projects module pages (EN/ES) built on the same chrome as
// the live Time Off pages, plus site-wide fixes: footer "Product" column linking every module page,
// Spanish pages pointing at the Spanish legal docs, About meta descriptions, a complete sitemap and
// clean-URL rewrites. Usage: LANDING=<landing folder> node build2.cjs [--write]
const fs = require('fs');
const path = require('path');
const LANDING = process.env.LANDING || 'C:/tmp/ns-landing-seo/landing';
const HERE = __dirname;
const SITE = 'https://joinnorthstack.com';
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const rep = (s, a, b, label) => { if (!s.includes(a)) throw new Error('not found [' + label + ']'); return s.split(a).join(b); };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const PAGES = require('./pages.cjs');

// ── Chrome copied from the live Time Off page ─────────────────────────────────────────────
const tplEs = rd(LANDING + '/es/software-vacaciones.html');
const styles = [...tplEs.matchAll(/<style>\n?([\s\S]*?)\n?<\/style>/g)].map((m) => m[1]);
const BASE_CSS = styles[0];   // shared tokens/components + module-page CSS
const PRICE_CSS = styles[1];  // .price-cta block
const PRICING_SRC = (tplEs.match(/<script src="(\/pricing\.js[^"]*)"/) || [])[1] || '/pricing.js';

const EXTRA_CSS = `
.gtag { display: inline-block; vertical-align: 2px; margin-left: 6px; font: 700 10.5px/1 var(--font); letter-spacing: .04em; text-transform: uppercase; padding: 4px 7px; border-radius: 99px; background: var(--lilac-soft); color: var(--violet); }
.band .gtag { background: rgba(169,139,255,.18); color: var(--lilac); }
.chip.no { background: color-mix(in srgb, #d2453b 14%, transparent); color: #c0392b; }
.att-row, .fc-row, .tpl-row { display: grid; align-items: center; gap: 10px; padding: 10px 2px; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 14px; }
.att-row { grid-template-columns: 32px minmax(0,1fr) auto; }
.att-row b, .tpl-row b { color: #fff; font-weight: 600; } .att-row small, .tpl-row small { display: block; color: var(--band-ink-2); font-size: 12.5px; }
.att .av { background: rgba(169,139,255,.18); color: var(--lilac); }
.pill-s { font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: 99px; white-space: nowrap; }
.pill-s.in { background: rgba(110,224,161,.16); color: #6ee0a1; } .pill-s.brk { background: rgba(169,139,255,.18); color: var(--lilac); }
.pill-s.late { background: rgba(255,196,107,.16); color: #ffc46b; } .pill-s.miss { background: rgba(255,120,110,.16); color: #ff8a80; }
.fc-row { grid-template-columns: 9.5em minmax(0,1fr) auto; color: var(--band-ink-2); }
.fc-row i { height: 8px; border-radius: 99px; background: linear-gradient(90deg, var(--lilac), #7c4dff); width: var(--w); }
.fc-row b { color: #fff; font-variant-numeric: tabular-nums; }
.tpl-row { grid-template-columns: 4.5em minmax(0,1fr) auto; color: var(--band-ink-2); font-variant-numeric: tabular-nums; }
.tpl-row small { font-size: 12.5px; } .tpl-row b { font-size: 14px; }
.att-row:last-of-type, .fc-row:last-of-type, .tpl-row:last-child { border-bottom: 0; }
.proj-top { display: flex; justify-content: space-between; font-size: 13.5px; color: var(--ink-3); margin-top: 4px; }
.phase { display: grid; grid-template-columns: 10px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 11px 4px; border-bottom: 1px solid var(--line); font-size: 14px; }
.phase:last-child { border-bottom: 0; }
.phase i { width: 10px; height: 10px; border-radius: 3px; background: var(--line); transform: rotate(45deg); }
.phase.ok i { background: var(--ok); } .phase.wait i { background: var(--violet); }
.phase small { color: var(--ink-3); font-size: 12.5px; }
.win .kanban .col { min-height: 0; }
.related-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.related-links a { text-decoration: none; font-size: 14px; font-weight: 600; padding: 7px 12px; border-radius: 99px; background: var(--surface); border: 1px solid var(--line); color: var(--ink-2); }
.related-links a:hover { border-color: var(--lilac); color: var(--ink); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .chip.no { color: #ff8a80; } }`;

// ── Shared bits ──────────────────────────────────────────────────────────────────────────
const MODULES = {
  es: [['/es/software-vacaciones', 'Software de vacaciones'], ['/es/control-horario', 'Turnos y control horario'], ['/es/crm-para-pymes', 'CRM para pymes'], ['/es/gestion-de-proyectos', 'Gestión de proyectos']],
  en: [['/time-off-software', 'Time off software'], ['/employee-scheduling-software', 'Employee scheduling'], ['/crm-for-small-business', 'CRM for small business'], ['/project-management-software', 'Project management']],
};
const L = {
  es: { home: '/es/', product: 'Producto', features: 'Funciones', pricing: 'Precios', faq: 'Preguntas', signin: 'Iniciar sesión', start: 'Empezar gratis',
    trial: 'Probalo gratis — 15 días', crumbs: 'Ruta', replaces: 'Lo que reemplaza', how: 'Cómo funciona', priceEyebrow: 'Precios',
    priceLede: 'Pagás por usuario activo. Empezá gratis por 15 días, sin tarjeta.',
    launch: 'Precio de lanzamiento hasta el {date} — hasta {pct}% off, y lo mantenés mientras sigas suscripto.',
    starterFor: 'Para equipos chicos que se están organizando', growthFor: 'Para equipos listos para escalar', popular: 'El más elegido', perUser: '/ usuario / mes',
    min: 'Mínimo <span data-pricing="min-users">3</span> usuarios por equipo.', allPrices: 'Ver todos los precios →',
    relEyebrow: 'Parte de Northstack', relH3: 'Todos los módulos comparten el mismo equipo.', relP: 'El legajo de cada persona alimenta ausencias, turnos, CRM, proyectos y seguimiento de nómina. Nada se carga dos veces.',
    finalP: '15 días gratis. Sin tarjeta. Listo en una tarde.', locale: 'es_AR', altLocale: 'en_US', og: 'og-image-es.jpg',
    company: 'Empresa', about: 'Nosotros', legal: 'Legal', terms: 'Términos de Servicio', privacy: 'Política de Privacidad', refund: 'Política de Reembolsos', cookies: 'Política de Cookies',
    tagline: 'Personas, ausencias, turnos, ventas, proyectos y seguimiento de nómina — una plataforma para equipos que crecen.',
    copy: '© 2026 Northstack. Todos los derechos reservados.', legalPrefix: '/es' },
  en: { home: '/', product: 'Product', features: 'Features', pricing: 'Pricing', faq: 'FAQ', signin: 'Sign in', start: 'Start free trial',
    trial: 'Start free — 15 days', crumbs: 'Breadcrumb', replaces: 'What it replaces', how: 'How it works', priceEyebrow: 'Pricing',
    priceLede: 'Pay per active user. Start free for 15 days, no credit card.',
    launch: 'Launch price until {date} — up to {pct}% off, locked for as long as you stay subscribed.',
    starterFor: 'For small teams getting organized', growthFor: 'For teams ready to scale', popular: 'Most popular', perUser: '/ user / month',
    min: 'Minimum <span data-pricing="min-users">3</span> users per team.', allPrices: 'See full pricing →',
    relEyebrow: 'Part of Northstack', relH3: 'Every module shares the same team.', relP: 'Each person’s record powers time off, shifts, the CRM, projects and payroll tracking. Nothing is typed twice.',
    finalP: '15 days free. No card. Set up in an afternoon.', locale: 'en_US', altLocale: 'es_AR', og: 'og-image-en.jpg',
    company: 'Company', about: 'About', legal: 'Legal', terms: 'Terms of Service', privacy: 'Privacy Policy', refund: 'Refund Policy', cookies: 'Cookie Policy',
    tagline: 'People, time off, shifts, sales, projects and payroll tracking — one platform for growing teams.',
    copy: '© 2026 Northstack. All rights reserved.', legalPrefix: '' },
};
const productCol = (l, onHome) => {
  const t = L[l], h = onHome ? '' : t.home;
  return `<div><b>${t.product}</b><a href="${h}#product">${t.features}</a>${MODULES[l].map(([u, n]) => `<a href="${u}">${n}</a>`).join('')}<a href="${h}#pricing">${t.pricing}</a></div>`;
};
const footer = (l) => { const t = L[l]; return `<footer>
  <div class="wrap">
    <div><a class="brand" href="${t.home}"><img class="mark" src="/icon-color.svg" alt="" width="28" height="28">Northstack</a><p style="margin:10px 0 0;max-width:34ch">${t.tagline}</p></div>
    ${productCol(l, false)}
    <div><b>${t.company}</b><a href="${l === 'es' ? '/es/about.html' : '/about.html'}">${t.about}</a><a href="mailto:info@joinnorthstack.com">info@joinnorthstack.com</a></div>
    <div><b>${t.legal}</b><a href="${t.legalPrefix}/terms.html">${t.terms}</a><a href="${t.legalPrefix}/privacy.html">${t.privacy}</a><a href="${t.legalPrefix}/refund.html">${t.refund}</a><a href="${t.legalPrefix}/cookies.html">${t.cookies}</a></div>
    <div class="copy">${t.copy}</div>
  </div>
</footer>`; };

function heroMock(p) {
  if (p.mock) return `<div class="win" aria-label="${esc(p.mock.tab)}">
      <div class="win-bar"><i></i><i></i><i></i><div class="win-tabs"><button type="button" aria-selected="true" tabindex="-1">${p.mock.tab}</button></div></div>
      <div class="win-body" style="min-height:0"><div class="scene on">
        <div class="scene-h">${p.mock.head}</div>
        ${p.mock.rows.map(([av, n, s, c, lbl]) => `<div class="prow"><span class="av">${av}</span><div>${n}<small>${s}</small></div><span class="chip ${c}">${lbl}</span></div>`).join('\n        ')}
      </div></div>
    </div>`;
  if (p.mockKanban) return `<div class="win" aria-label="${esc(p.mockKanban.tab)}">
      <div class="win-bar"><i></i><i></i><i></i><div class="win-tabs"><button type="button" aria-selected="true" tabindex="-1">${p.mockKanban.tab}</button></div></div>
      <div class="win-body" style="min-height:0"><div class="scene on">
        <div class="scene-h">${p.mockKanban.head}</div>
        <div class="kanban">${p.mockKanban.cols.map(([name, deals]) => `<div class="col"><b>${name} <span>${deals.length}</span></b>${deals.map(([d, v, mv]) => `<div class="deal${mv ? ' mover' : ''}">${d}<small>${v}</small></div>`).join('')}</div>`).join('')}</div>
      </div></div>
    </div>`;
  const m = p.mockProject;
  return `<div class="win" aria-label="${esc(m.tab)}">
      <div class="win-bar"><i></i><i></i><i></i><div class="win-tabs"><button type="button" aria-selected="true" tabindex="-1">${m.tab}</button></div></div>
      <div class="win-body" style="min-height:0"><div class="scene on">
        <div class="scene-h">${m.head}</div>
        <div class="track"><i style="--w:${m.pct}%"></i></div>
        <div class="proj-top"><span>${m.done}</span><b>${m.pct}%</b></div>
        <div style="margin-top:10px">${m.phases.map(([n, s, c]) => `<div class="phase ${c}"><i></i><div>${n}</div><small>${s}</small></div>`).join('')}</div>
      </div></div>
    </div>`;
}

function buildPage(l, p) {
  const t = L[l];
  const url = `${SITE}/${p.path}`, alt = `${SITE}/${p.alt}`;
  const en = l === 'en' ? url : alt, es = l === 'es' ? url : alt;
  const faqLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  const crumbLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Northstack', item: SITE + t.home }, { '@type': 'ListItem', position: 2, name: p.crumb, item: url }] });
  const appLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Northstack — ' + p.crumb, url, applicationCategory: 'BusinessApplication', applicationSubCategory: p.ldSub, operatingSystem: 'Web', inLanguage: l, description: p.desc });
  const howId = p.cta2[0].slice(1);
  const others = MODULES[l].filter(([u]) => u !== '/' + p.path);
  const tag = (s) => s.replace(/ <span class="gtag">/, ' <span class="gtag">');
  return `<!doctype html>
<html lang="${l}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${esc(p.title)}</title>
    <meta name="description" content="${esc(p.desc)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${en}" />
    <link rel="alternate" hreflang="es" href="${es}" />
    <link rel="alternate" hreflang="x-default" href="${en}" />
    <link rel="icon" type="image/x-icon" href="/favicon/favicon.ico" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
    <meta name="theme-color" content="#5b21e6" />
    <meta property="og:title" content="${esc(p.title)}" />
    <meta property="og:description" content="${esc(p.og)}" />
    <meta property="og:site_name" content="Northstack" />
    <meta property="og:image" content="${SITE}/${t.og}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${t.locale}" />
    <meta property="og:locale:alternate" content="${t.altLocale}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(p.title)}" />
    <meta name="twitter:description" content="${esc(p.og)}" />
    <meta name="twitter:image" content="${SITE}/${t.og}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet" />
    <!-- Module page (SEO pass 2, 2026-10-20). Generated by tools/seo/build2.cjs on the marketing branch;
         EN/ES twins share one spec in pages.cjs — edit both together. -->
    <style>
${BASE_CSS}
${PRICE_CSS}
${EXTRA_CSS.trim()}
</style>
    <script type="application/ld+json">
      ${crumbLd}
    </script>
    <script type="application/ld+json">
      ${appLd}
    </script>
    <script type="application/ld+json">
      ${faqLd}
    </script>
    <script src="${PRICING_SRC}" defer></script>
    <script src="/legal-modal.js" defer></script>
  </head>
  <body>
<nav class="top" aria-label="Main">
  <div class="wrap">
    <a class="brand" href="${t.home}"><img class="mark" src="/icon-color.svg" alt="" width="28" height="28">Northstack</a>
    <div class="navlinks"><a href="${t.home}#product">${t.product}</a><a href="/${p.path}" aria-current="page">${p.nav}</a><a href="#pricing">${t.pricing}</a><a href="#faq">${t.faq}</a></div>
    <div class="navr"><span class="lang"><a href="/${l === 'en' ? p.path : p.alt}"${l === 'en' ? ' aria-current="page"' : ''} hreflang="en">EN</a> · <a href="/${l === 'es' ? p.path : p.alt}"${l === 'es' ? ' aria-current="page"' : ''} hreflang="es">ES</a></span><a class="signin" href="https://app.joinnorthstack.com/login">${t.signin}</a><a class="btn btn-p" href="https://app.joinnorthstack.com/register">${t.start}</a></div>
  </div>
</nav>

<header class="hero" id="top">
  <div class="wrap">
    <div>
      <nav class="crumbs" aria-label="${t.crumbs}"><a href="${t.home}">Northstack</a><span aria-hidden="true">/</span><a href="${t.home}#product">${t.product}</a><span aria-hidden="true">/</span><span aria-current="page">${p.crumb}</span></nav>
      <h1>${p.h1}</h1>
      <p class="lede">${p.lede}</p>
      <div class="ctas">
        <a class="btn btn-p" href="https://app.joinnorthstack.com/register">${t.trial} <span class="arrow">→</span></a>
        <a class="btn btn-g" href="${p.cta2[0]}">${p.cta2[1]}</a>
      </div>
      <div class="trust">${p.trust.map((x) => `<span>${x}</span>`).join('')}</div>
    </div>

    ${heroMock(p)}
  </div>
</header>

<div class="swap" aria-label="${t.replaces}">
  <div class="wrap">
    ${p.swap.map((x) => `<span class="old">${x}</span>`).join('')}
    <span class="eq">→</span><span class="new">${p.swapNew}</span>
  </div>
</div>

<section class="block" id="${howId}" style="padding-top:20px">
  <div class="wrap">
    <div class="head"><span class="eyebrow">${t.how}</span><h2>${p.stepsH2}</h2></div>
    <div class="steps">
      ${p.steps.map(([h, x], i) => `<div class="step"><div class="n">${i + 1}</div><h3>${h}</h3><p>${x}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="band" id="${p.band.id}">
  <div class="wrap">
    <div>
      <span class="eyebrow">${p.band.eyebrow}</span>
      <h2>${p.band.h2}</h2>
      <p class="lede">${p.band.lede}</p>
      <div class="facts">
        ${p.band.facts.map(([i, b, s]) => `<div class="fact"><i>${i}</i><div><b>${b}</b><span>${s}</span></div></div>`).join('\n        ')}
      </div>
    </div>
    ${p.band.visual}
  </div>
</section>

<section class="block" id="features">
  <div class="wrap">
    <div class="head"><span class="eyebrow">${p.featsEyebrow}</span><h2>${p.featsH2}</h2></div>
    <div class="feats">
      ${p.feats.map(([h, x]) => `<article class="feat"><h3>${tag(h)}</h3><p>${x}</p></article>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="block" style="padding-top:0">
  <div class="wrap">
    <div class="related">
      <div><span class="eyebrow">${t.relEyebrow}</span><h3>${t.relH3}</h3><p>${t.relP}</p><div class="related-links">${others.map(([u, n]) => `<a href="${u}">${n}</a>`).join('')}</div></div>
      <a class="btn btn-g" href="${t.home}#product">${l === 'es' ? 'Ver todos los módulos' : 'See every module'} <span class="arrow">→</span></a>
    </div>
  </div>
</section>

<section class="block price-cta" id="pricing" style="padding-top:20px">
  <div class="wrap">
    <div class="head"><span class="eyebrow">${t.priceEyebrow}</span><h2>${p.price.h2}</h2><p class="lede">${t.priceLede}</p><p class="launchline" data-ns-launch="${t.launch}" hidden></p></div>
    <div class="plans"><div class="plan"><h3>Starter</h3><div class="for">${t.starterFor}</div><div class="price"><s data-ns-reg="starter"></s><b data-ns-now="starter">—</b><span>${t.perUser}</span></div><span class="off" data-ns-off="starter" hidden></span><ul>${p.price.starter.map((x) => `<li>${x}</li>`).join('')}</ul><a class="btn btn-g" href="https://app.joinnorthstack.com/register">${t.start}</a></div><div class="plan hot"><span class="badge">${t.popular}</span><h3>Growth</h3><div class="for">${t.growthFor}</div><div class="price"><s data-ns-reg="growth"></s><b data-ns-now="growth">—</b><span>${t.perUser}</span></div><span class="off" data-ns-off="growth" hidden></span><ul>${p.price.growth.map((x) => `<li>${x}</li>`).join('')}</ul><a class="btn btn-p" href="https://app.joinnorthstack.com/register">${t.start}</a></div></div>
    <div class="foot"><span>${t.min}</span><a href="${t.home}#pricing">${t.allPrices}</a></div>
  </div>
</section>

<section class="block" id="faq" style="padding-top:20px">
  <div class="wrap">
    <div class="head"><span class="eyebrow">${t.faq}</span><h2>${p.faqH2}</h2></div>
    <div class="faq">
${p.faq.map(([q, a], i) => `      <details${i ? '' : ' open'}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
    </div>
  </div>
</section>

<div class="final">
  <span class="orbit" aria-hidden="true"></span>
  <div class="wrap">
    <h2>${p.finalH2}</h2>
    <p>${t.finalP}</p>
    <a class="btn btn-w" href="https://app.joinnorthstack.com/register">${t.start} <span class="arrow">→</span></a>
  </div>
</div>

${footer(l)}
  </body>
</html>
`;
}

const out = {};
for (const p of PAGES) for (const l of ['es', 'en']) out[p[l].path + '.html'] = buildPage(l, p[l]);

// ── Existing pages: footer product column, Spanish legal links ──────────────────────────────
const footerColRe = (l) => new RegExp(`<div><b>${l === 'es' ? 'Producto' : 'Product'}</b>[^\\n]*?</div>`);
function patchExisting(file, l, onHome) {
  let s = rd(LANDING + '/' + file);
  if (!footerColRe(l).test(s)) throw new Error('footer col not found: ' + file);
  s = s.replace(footerColRe(l), productCol(l, onHome));
  if (l === 'es') {
    s = s.replace(/<div><b>Legal<\/b><a href="\/terms\.html">/, '<div><b>Legal</b><a href="/es/terms.html">')
      .replace(/<a href="\/privacy\.html">Política de Privacidad/, '<a href="/es/privacy.html">Política de Privacidad')
      .replace(/<a href="\/refund\.html">Política de Reembolsos/, '<a href="/es/refund.html">Política de Reembolsos');
  }
  out[file] = s;
}
patchExisting('index.html', 'en', true);
patchExisting('es/index.html', 'es', true);
patchExisting('time-off-software.html', 'en', false);
patchExisting('es/software-vacaciones.html', 'es', false);

// About: meta description + Spanish legal links
const ABOUT = {
  'about.html': 'Why we built Northstack: one simple platform for small teams to run HR, time off, shifts, sales and projects without enterprise complexity.',
  'es/about.html': 'Por qué creamos Northstack: una plataforma simple para que las pymes gestionen RR.HH., ausencias, turnos, ventas y proyectos sin complejidad.',
};
for (const [f, d] of Object.entries(ABOUT)) {
  let s = rd(LANDING + '/' + f);
  if (!/<meta name="description"/.test(s)) s = s.replace(/(<title>[^<]*<\/title>\n)/, `$1    <meta name="description" content="${esc(d)}" />\n`);
  if (!s.includes(d.slice(0, 40))) throw new Error('about desc not inserted: ' + f);
  if (f.startsWith('es/')) s = s.replace(/href="\/terms\.html"/g, 'href="/es/terms.html"').replace(/href="\/privacy\.html"/g, 'href="/es/privacy.html"').replace(/href="\/refund\.html"/g, 'href="/es/refund.html"');
  out[f] = s;
}

// Legal modal: Spanish documents open in the modal too.
let lm = rd(LANDING + '/legal-modal.js');
for (const d of ['/es/terms.html', '/es/privacy.html', '/es/refund.html']) {
  if (!lm.includes("'" + d + "'")) lm = lm.replace(/var DOCS = {([^}]*)};/, (m, inner) => `var DOCS = {${inner.trimEnd()}, '${d}': 1 };`);
}
if (!lm.includes("'/es/terms.html'")) throw new Error('modal docs');
out['legal-modal.js'] = lm;

// ── vercel.json rewrites ─────────────────────────────────────────────────────────────────
const vj = JSON.parse(rd(LANDING + '/vercel.json'));
const have = new Set((vj.rewrites || []).map((r) => r.source));
for (const p of PAGES) for (const l of ['es', 'en']) { const src = '/' + p[l].path; if (!have.has(src)) (vj.rewrites = vj.rewrites || []).push({ source: src, destination: src + '.html' }); }
out['vercel.json'] = JSON.stringify(vj, null, 2) + '\n';

// ── sitemap: every indexable page, EN/ES pairs, lastmod = today for what this pass touches ───
const TODAY = '2026-10-25';
const lastmod = (f) => (process.env.LASTMOD_JSON ? JSON.parse(process.env.LASTMOD_JSON)[f] : null) || TODAY;
const pairs = [
  ['', 'es/', 'index.html', 'es/index.html', 'weekly', '1.0'],
  ['time-off-software', 'es/software-vacaciones', null, null, 'monthly', '0.9'],
  ...PAGES.map((p) => [p.en.path, p.es.path, null, null, 'monthly', '0.9']),
  ['about.html', 'es/about.html', null, null, 'monthly', '0.6'],
  ['terms.html', 'es/terms.html', 'terms.html', 'es/terms.html', 'yearly', '0.3'],
  ['privacy.html', 'es/privacy.html', 'privacy.html', 'es/privacy.html', 'yearly', '0.3'],
  ['refund.html', 'es/refund.html', 'refund.html', 'es/refund.html', 'yearly', '0.3'],
  ['cookies.html', 'es/cookies.html', 'cookies.html', 'es/cookies.html', 'yearly', '0.3'],
];
let sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
for (const [en, es, fEn, fEs, freq, prio] of pairs) {
  for (const [u, f] of [[en, fEn], [es, fEs]]) {
    sm += `  <url>\n    <loc>${SITE}/${u}</loc>\n    <lastmod>${f ? lastmod(f) : TODAY}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n` +
      `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/${en}" />\n    <xhtml:link rel="alternate" hreflang="es" href="${SITE}/${es}" />\n  </url>\n`;
  }
}
out['sitemap.xml'] = sm + '</urlset>\n';

if (process.argv.includes('--write')) for (const [f, s] of Object.entries(out)) wr(LANDING + '/' + f, s);
fs.writeFileSync(HERE + '/out-index.json', JSON.stringify(Object.keys(out)));
module.exports = out;
if (require.main === module) console.log('ok', Object.keys(out).length, 'files', process.argv.includes('--write') ? '(written)' : '(dry run)');
