// SEO pass 2026-10-03: builds the Time Off module pages (EN/ES), applies the home-page keyword
// tweaks, sitemap + vercel rewrites, and a self-contained preview set for the Artifact.
const fs = require('fs');
const path = require('path');
const LANDING = 'C:/tmp/ns-landing-seo/landing';
const HERE = __dirname; // templates sit next to this script (marketing branch tools/seo/)
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
function rep(s, from, to, label) {
  if (!s.includes(from)) throw new Error('not found [' + label + ']: ' + from.slice(0, 80));
  return s.split(from).join(to);
}

const esIndexSrc = rd(LANDING + '/es/index.html');
const SHARED = esIndexSrc.match(/<style>\n([\s\S]*?)\n<\/style>/)[1];

const MODULE_CSS = `
/* Module page */
.crumbs { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13.5px; color: var(--ink-3); }
.crumbs a { text-decoration: none; } .crumbs a:hover { color: var(--ink); }
.crumbs [aria-current] { color: var(--violet); font-weight: 600; }
.navlinks a[aria-current] { color: var(--ink); font-weight: 600; }
.steps .step p { font-size: 15px; }
.feats { display: grid; gap: 0; grid-template-columns: 1fr; border-top: 1px solid var(--line); }
@media (min-width: 700px) { .feats { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 40px; } }
@media (min-width: 1000px) { .feats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.feat { padding-block: 22px; border-bottom: 1px solid var(--line); }
.feat h3 { font-size: 18px; display: flex; gap: 10px; align-items: baseline; }
.feat h3::before { content: ""; flex-shrink: 0; width: 8px; height: 8px; border-radius: 2px; background: var(--violet); transform: translateY(-2px) rotate(45deg); }
.feat p { margin: 8px 0 0; color: var(--ink-2); font-size: 15.5px; }
.related { display: flex; flex-wrap: wrap; gap: 20px 32px; align-items: center; justify-content: space-between; padding: 28px; border-radius: 20px; background: var(--surface-2); }
.related > div { display: grid; gap: 8px; max-width: 60ch; min-width: 0; }
.related h3 { font-size: 22px; } .related p { margin: 0; color: var(--ink-2); }`;

const FAQ = {
  es: [
    ['¿Puedo usar el calendario de feriados de otro país?', 'Sí. El calendario se elige según dónde trabaja tu equipo, que puede no ser el país de la empresa, y se importa en un clic. Después podés marcar cada día no laborable como libre o trabajado.'],
    ['¿Cuenta días hábiles o días corridos?', 'Los dos. Cada política define cómo cuenta los días. Con días hábiles, los fines de semana, los feriados y los días libres de la empresa no se descuentan del saldo.'],
    ['¿Quién aprueba los pedidos de vacaciones?', 'El jefe directo de la persona. Además, el owner, los administradores o quien tenga el permiso de decidir ausencias pueden aprobar o rechazar cualquier pedido. Si una política no requiere aprobación, el pedido se aprueba al instante.'],
    ['¿Qué pasa con los días de vacaciones que no se usan?', 'Cada política lo decide: al 31 de diciembre los días se trasladan al año siguiente, con un tope opcional, o vencen. En los dos casos queda registrado.'],
    ['¿Cuántas políticas de ausencia puedo crear?', 'En el plan Starter, hasta 3. En Growth, ilimitadas. Durante la prueba gratis de 15 días tenés acceso a todo.'],
    ['¿Se sincroniza con Google Calendar?', 'Sí. Cuando conectás tu cuenta de Google, tus ausencias aprobadas se agregan solas a tu calendario personal.'],
  ],
  en: [
    ["Can I use another country's holiday calendar?", "Yes. You pick the calendar by where your team works, which can differ from the company's country, and import it in one click. Then you can mark each non-working day as given off or worked."],
    ['Does it count business days or calendar days?', 'Both. Each policy sets how it counts days. With business days, weekends, public holidays and company days off are never deducted from the balance.'],
    ['Who approves time off requests?', "The person's direct manager. The owner, admins, or anyone with the time-off decision permission can also approve or reject any request. If a policy doesn't need approval, the request is approved instantly."],
    ['What happens to unused PTO?', 'Each policy decides: on December 31, unused days carry over to next year, with an optional cap, or expire. Either way it is recorded.'],
    ['How many time off policies can I create?', 'Up to 3 on the Starter plan and unlimited on Growth. The 15-day free trial includes everything.'],
    ['Does it sync with Google Calendar?', 'Yes. Once you connect your Google account, your approved time off is added to your personal calendar automatically.'],
  ],
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const faqHtml = (l) => FAQ[l].map(([q, a], i) => `      <details${i ? '' : ' open'}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
const faqLd = (l) => JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ[l].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

const FOOTER = {
  es: `<footer>
  <div class="wrap">
    <div><a class="brand" href="/es/"><img class="mark" src="/icon-color.svg" alt="" width="28" height="28">Northstack</a><p style="margin:10px 0 0;max-width:34ch">Personas, ausencias, ventas y seguimiento de nómina — una plataforma para equipos que crecen.</p></div>
    <div><b>Producto</b><a href="/es/#product">Funciones</a><a href="/es/software-vacaciones">Software de vacaciones</a><a href="/es/#pricing">Precios</a><a href="/es/#faq">Preguntas</a></div>
    <div><b>Empresa</b><a href="/es/about.html">Nosotros</a><a href="mailto:info@joinnorthstack.com">info@joinnorthstack.com</a></div>
    <div><b>Legal</b><a href="/terms.html">Términos de Servicio</a><a href="/privacy.html">Política de Privacidad</a><a href="/refund.html">Política de Reembolsos</a></div>
    <div class="copy">© 2026 Northstack. Todos los derechos reservados.</div>
  </div>
</footer>`,
  en: `<footer>
  <div class="wrap">
    <div><a class="brand" href="/"><img class="mark" src="/icon-color.svg" alt="" width="28" height="28">Northstack</a><p style="margin:10px 0 0;max-width:34ch">People, time off, sales and payroll tracking — one platform for growing teams.</p></div>
    <div><b>Product</b><a href="/#product">Features</a><a href="/time-off-software">Time off software</a><a href="/#pricing">Pricing</a><a href="/#faq">FAQ</a></div>
    <div><b>Company</b><a href="/about.html">About</a><a href="mailto:info@joinnorthstack.com">info@joinnorthstack.com</a></div>
    <div><b>Legal</b><a href="/terms.html">Terms of Service</a><a href="/privacy.html">Privacy Policy</a><a href="/refund.html">Refund Policy</a></div>
    <div class="copy">© 2026 Northstack. All rights reserved.</div>
  </div>
</footer>`,
};

function buildModule(l, tpl) {
  let s = rd(HERE + '/' + tpl);
  s = rep(s, '/*@SHARED_CSS@*/', SHARED, 'css');
  s = rep(s, '/*@MODULE_CSS@*/', MODULE_CSS.trim(), 'mcss');
  s = rep(s, '/*@FAQ_LD@*/', faqLd(l), 'ld');
  s = rep(s, '<!--@FAQ_HTML@-->', faqHtml(l), 'faq');
  s = rep(s, '<!--@FOOTER@-->', FOOTER[l], 'footer');
  return s;
}
const pages = {
  'es/software-vacaciones.html': buildModule('es', 'vacaciones.es.html'),
  'time-off-software.html': buildModule('en', 'vacaciones.en.html'),
};

// --- Part A: home pages ---------------------------------------------------------------
let es = esIndexSrc;
es = es.split('<title>Northstack — RR.HH., ventas y nómina en una sola plataforma</title>').join('<title>Software de RR.HH., vacaciones y CRM para pymes — Northstack</title>');
es = rep(es, 'content="Northstack — RR.HH., ventas y nómina en una sola plataforma"', 'content="Software de RR.HH., vacaciones y CRM para pymes — Northstack"', 'es og/tw title');
es = rep(es, 'content="RR.HH., ausencias, ventas y seguimiento de nómina en una sola plataforma para equipos de 5 a 50 personas. Probala gratis 15 días, sin tarjeta."', 'content="Software de RR.HH., vacaciones, CRM y seguimiento de nómina para pymes de 5 a 50 personas. Probalo gratis 15 días, sin tarjeta."', 'es desc');
es = rep(es, '"description":"RR.HH., ausencias, ventas y seguimiento de nómina en una sola plataforma para equipos de 5 a 50 personas. Probala gratis 15 días, sin tarjeta."', '"description":"Software de RR.HH., vacaciones, CRM y seguimiento de nómina para pymes de 5 a 50 personas. Probalo gratis 15 días, sin tarjeta."', 'es ld desc');
es = rep(es, '<h1>Todo tu equipo, en <em class="s">un solo</em> lugar.</h1>', '<h1><span class="kicker">Software de RR.HH. y CRM para pymes</span>Todo tu equipo, en <em class="s">un solo</em> lugar.</h1>', 'es h1');
es = rep(es, '<p class="lede">Empezá con lo que necesitás hoy. Todos los módulos comparten las mismas personas, así que nada se carga dos veces.</p>', '<p class="lede">Legajo digital, control de vacaciones, CRM de ventas y registro de sueldos. Empezá con lo que necesitás hoy: todos los módulos comparten las mismas personas, así que nada se carga dos veces.</p>', 'es product lede');
es = rep(es, '<div class="calc-line"><span>9 oct → 16 oct · se cuentan</span><b>5 días</b></div>\n    </div>', '<div class="calc-line"><span>9 oct → 16 oct · se cuentan</span><b>5 días</b></div>\n    </div>\n    <a class="bandlink" href="/es/software-vacaciones">Todo sobre el software de vacaciones <span class="arrow">→</span></a>', 'es bandlink');
es = rep(es, '<div><b>Producto</b><a href="#product">Funciones</a><a href="#pricing">Precios</a><a href="#faq">Preguntas</a></div>', '<div><b>Producto</b><a href="#product">Funciones</a><a href="/es/software-vacaciones">Software de vacaciones</a><a href="#pricing">Precios</a><a href="#faq">Preguntas</a></div>', 'es footer');

let en = rd(LANDING + '/index.html');
en = en.split('Northstack — HR, sales, and payroll tracking in one platform').join('HR, Time Off & CRM Software for Small Teams — Northstack'.replace('&', '&amp;'));
en = rep(en, 'content="HR, time off, sales, and payroll tracking in one platform for teams of 5 to 50. Try Northstack free for 15 days — no credit card required."', 'content="HR, time off, CRM and payroll tracking software for small teams of 5 to 50. Try Northstack free for 15 days, no credit card required."', 'en desc');
en = rep(en, '"description":"HR, time off, sales, and payroll tracking in one platform for teams of 5 to 50. Try Northstack free for 15 days — no credit card required."', '"description":"HR, time off, CRM and payroll tracking software for small teams of 5 to 50. Try Northstack free for 15 days, no credit card required."', 'en ld desc');
en = rep(en, '<h1>Run your whole team from <em class="s">one</em> place.</h1>', '<h1><span class="kicker">HR &amp; CRM software for small teams</span>Run your whole team from <em class="s">one</em> place.</h1>', 'en h1');
en = rep(en, '<p class="lede">Start with what you need today. Every module shares the same people, so nothing is typed twice.</p>', '<p class="lede">Employee records, PTO tracking, a sales CRM and payroll records. Start with what you need today: every module shares the same people, so nothing is typed twice.</p>', 'en product lede');
en = rep(en, '<div class="calc-line"><span>Oct 9 → Oct 16 · counted</span><b>5 days</b></div>\n    </div>', '<div class="calc-line"><span>Oct 9 → Oct 16 · counted</span><b>5 days</b></div>\n    </div>\n    <a class="bandlink" href="/time-off-software">Everything about time off software <span class="arrow">→</span></a>', 'en bandlink');
en = rep(en, '<div><b>Product</b><a href="#product">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>', '<div><b>Product</b><a href="#product">Features</a><a href="/time-off-software">Time off software</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></div>', 'en footer');

const HOME_CSS = `.hero h1 .kicker { display: block; font: 600 14px/1.4 var(--font); letter-spacing: .08em; text-transform: uppercase; color: var(--violet); margin-bottom: 14px; }
.bandlink { grid-column: 1 / -1; justify-self: start; color: var(--lilac); font-weight: 600; text-decoration: none; }
.bandlink:hover { color: #fff; }
@media (prefers-reduced-motion: reduce) {`;
for (const k of ['es', 'en']) {
  let s = k === 'es' ? es : en;
  s = rep(s, '"operatingSystem":"Web, Android"', '"operatingSystem":"Web"', k + ' os');
  s = rep(s, '@media (prefers-reduced-motion: reduce) {', HOME_CSS, k + ' css');
  // the hero pill already sits above the h1; give the kicker room
  if (k === 'es') es = s; else en = s;
}
pages['es/index.html'] = es;
pages['index.html'] = en;

// --- sitemap + vercel -----------------------------------------------------------------
let sm = rd(LANDING + '/sitemap.xml');
sm = sm.replace(/<lastmod>2026-10-02<\/lastmod>(\s*<changefreq>weekly)/g, '<lastmod>2026-10-03</lastmod>$1');
const alt = `    <xhtml:link rel="alternate" hreflang="en" href="https://joinnorthstack.com/time-off-software" />
    <xhtml:link rel="alternate" hreflang="es" href="https://joinnorthstack.com/es/software-vacaciones" />`;
const modUrls = ['https://joinnorthstack.com/time-off-software', 'https://joinnorthstack.com/es/software-vacaciones']
  .map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>2026-10-03</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n${alt}\n  </url>`).join('\n');
sm = rep(sm, '  <url>\n    <loc>https://joinnorthstack.com/about.html</loc>', modUrls + '\n  <url>\n    <loc>https://joinnorthstack.com/about.html</loc>', 'sitemap');
pages['sitemap.xml'] = sm;

const vj = JSON.parse(rd(LANDING + '/vercel.json'));
vj.rewrites = [
  { source: '/time-off-software', destination: '/time-off-software.html' },
  { source: '/es/software-vacaciones', destination: '/es/software-vacaciones.html' },
];
pages['vercel.json'] = JSON.stringify(vj, null, 2) + '\n';

if (process.argv.includes('--write')) for (const [p, s] of Object.entries(pages)) wr(LANDING + '/' + p, s);

// --- Artifact preview set -------------------------------------------------------------
const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(LANDING + '/icon-color.svg').toString('base64');
const MAP = {
  '/es/software-vacaciones': 'vacaciones-es.html', '/time-off-software': 'vacaciones-en.html',
  '/es/': 'inicio-es.html', '/': 'inicio-en.html',
};
function previewize(s) {
  s = s.replace(/<script src="\/(pricing|legal-modal)\.js" defer><\/script>\n?/g, '');
  s = s.split('src="/icon-color.svg"').join('src="' + icon + '"');
  s = s.replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\n?/g, '');
  s = s.replace(/href="(\/[^"]*)"/g, (m, href) => {
    const [p, hash] = href.split('#');
    if (MAP[p] !== undefined) return `href="${MAP[p]}${hash ? '#' + hash : ''}"`;
    return `href="https://joinnorthstack.com${href}" target="_blank" rel="noopener"`;
  });
  return s;
}
const PV = HERE + '/preview';
wr(PV + '/vacaciones-es.html', previewize(pages['es/software-vacaciones.html']));
wr(PV + '/vacaciones-en.html', previewize(pages['time-off-software.html']));
wr(PV + '/inicio-es.html', previewize(pages['es/index.html']));
wr(PV + '/inicio-en.html', previewize(pages['index.html']));
console.log('ok', Object.keys(pages).join(', '), process.argv.includes('--write') ? '(written)' : '(dry run)');
