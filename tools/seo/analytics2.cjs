// Analytics go-live (2026-10-25): GTM GTM-TJHVX9R4 (GA4 G-DQJ1K0FVJ5) on every landing page behind
// Google Consent Mode v2 + the consent.js banner; Cookie Policy pages (EN/ES); Privacy Policy 2.4
// rewritten (website analytics live, app analytics still "coming", as another session disclosed);
// Cookie Policy linked from every footer, the legal modal and the sitemap. Idempotent.
// Usage: LANDING=<landing folder> node analytics2.cjs [--write]
const fs = require('fs');
const path = require('path');
const LANDING = process.env.LANDING || 'C:/tmp/ns-landing-seo/landing';
const HERE = __dirname;
const GTM_ID = 'GTM-TJHVX9R4';
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const exists = (f) => fs.existsSync(path.join(LANDING, f));
const out = {};
const get = (f) => (f in out ? out[f] : rd(path.join(LANDING, f)));

// ── 1. Cookie Policy pages, from the Refund Policy's chrome ───────────────────────────────
const C = require('./cookies-content.cjs');
for (const [l, file, tpl] of [['en', 'cookies.html', 'refund.html'], ['es', 'es/cookies.html', 'es/refund.html']]) {
  if (exists(file)) continue;
  const c = C[l];
  let s = rd(path.join(LANDING, tpl));
  s = s.replace(/<title>[^<]*<\/title>/, `<title>${c.title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${c.desc}" />`)
    .replace(/refund\.html/g, 'cookies.html');
  // the footer links back to the real refund policy
  s = s.replace(/(<a href="(?:\/es)?\/)cookies\.html">(Refund Policy|Política de Reembolsos)<\/a>/, '$1refund.html">$2</a>');
  s = s.replace(/<main>[\s\S]*<\/main>/, `<main>\n      <h1>${c.h1}</h1>\n      <p class="effective-date">${c.date}</p>\n${c.body}    </main>`);
  if (!s.includes(c.h1) || /Refund Policy<\/h1>|Reembolsos de Northstack<\/h1>/.test(s)) throw new Error('cookie page build: ' + file);
  out[file] = s;
}

// ── 2. Privacy Policy 2.4 ──────────────────────────────────────────────────────────────────
const PRIV = {
  'privacy.html': {
    re: /      <p>\n        We do not currently use third-party advertising or analytics trackers[\s\S]*?Coming: Google Analytics[\s\S]*?<\/p>\n/,
    neu: `      <p>
        We do not use third-party advertising trackers, and we do not use cookies for
        cross-site tracking or advertising purposes. Google Analytics is described in
        Section 2.4.
      </p>

      <h3>2.4 Google Analytics</h3>
      <p>
        <strong>On our public website (joinnorthstack.com): in use.</strong> We use Google
        Analytics, loaded through Google Tag Manager, to understand how visitors find and use
        the site: which pages are visited, which site you came from, your approximate location
        (derived from your IP address), and your device and browser type.
      </p>
      <ul>
        <li>
          <strong>Only with your consent</strong>: analytics cookies are set and Google
          Analytics runs only if you choose <em>Accept</em> in the cookie banner. If you choose
          <em>Decline</em>, Google Analytics does not run. Google Tag Manager itself is loaded on
          every page to read your choice, and it does not set cookies.
        </li>
        <li>
          <strong>Change your choice anytime</strong> from the <em>Cookie settings</em> link at
          the bottom of every page of the website. The cookies involved and their duration are
          listed in our <a href="/cookies.html">Cookie Policy</a>.
        </li>
        <li>
          <strong>No advertising</strong>: we do not enable Google Signals, cross-device
          tracking, or any advertising or remarketing feature, and advertising storage is
          always disabled.
        </li>
        <li>
          <strong>Retention</strong>: Google keeps this analytics data for the retention period
          set in our Google Analytics account (currently 2 months).
        </li>
      </ul>
      <p>
        <strong>Inside the Northstack application: not yet in use.</strong> We plan to add
        Google Analytics to the authenticated application too, to measure usage such as pages
        visited, sessions and in-product usage events, with the same commitments: no Google
        Signals, no cross-device tracking, and no advertising or remarketing features. Once it
        is in use, we will update this section, our Cookie Policy and Section 4.1, and post a
        new effective date.
      </p>
`,
    row: `          <tr>
            <td>Google (Google Analytics, Google Tag Manager)</td>
            <td>Analytics on our public website, only after the visitor accepts analytics cookies (Section 2.4)</td>
            <td>Pages visited, referring site, approximate location derived from IP address, device and browser type, and analytics cookie identifiers</td>
          </tr>
`,
    done: '<h3>2.4 Google Analytics</h3>',
  },
  'es/privacy.html': {
    re: /      <p>\n        Actualmente no usamos rastreadores de publicidad o analítica de terceros[\s\S]*?Próximamente: Google Analytics[\s\S]*?<\/p>\n/,
    neu: `      <p>
        No usamos rastreadores de publicidad de terceros, y no usamos cookies para
        seguimiento entre sitios ni con fines publicitarios. Google Analytics se describe en
        la Sección 2.4.
      </p>

      <h3>2.4 Google Analytics</h3>
      <p>
        <strong>En nuestro sitio web público (joinnorthstack.com): en uso.</strong> Usamos
        Google Analytics, cargado a través de Google Tag Manager, para entender cómo los
        visitantes encuentran y usan el sitio: qué páginas se visitan, desde qué sitio llegaste,
        tu ubicación aproximada (derivada de tu dirección IP) y el tipo de dispositivo y
        navegador.
      </p>
      <ul>
        <li>
          <strong>Solo con tu consentimiento</strong>: las cookies de analítica se guardan y
          Google Analytics funciona solo si elegís <em>Aceptar</em> en el aviso de cookies. Si
          elegís <em>Rechazar</em>, Google Analytics no funciona. Google Tag Manager se carga en
          todas las páginas para leer tu elección, y no guarda cookies.
        </li>
        <li>
          <strong>Podés cambiar tu elección cuando quieras</strong> desde el link
          <em>Preferencias de cookies</em> al pie de todas las páginas del sitio. Las cookies
          involucradas y su duración figuran en nuestra
          <a href="/es/cookies.html">Política de Cookies</a>.
        </li>
        <li>
          <strong>Sin publicidad</strong>: no activamos Google Signals, el seguimiento entre
          dispositivos ni ninguna función de publicidad o remarketing, y el almacenamiento
          publicitario está siempre desactivado.
        </li>
        <li>
          <strong>Conservación</strong>: Google conserva estos datos de analítica durante el
          plazo configurado en nuestra cuenta de Google Analytics (actualmente, 2 meses).
        </li>
      </ul>
      <p>
        <strong>Dentro de la aplicación de Northstack: todavía no está en uso.</strong>
        Planeamos incorporar Google Analytics también en la aplicación autenticada, para medir
        el uso, como páginas visitadas, sesiones y eventos de uso dentro del producto, con los
        mismos compromisos: sin Google Signals, sin seguimiento entre dispositivos y sin
        funciones de publicidad o remarketing. Una vez que esté en uso, vamos a actualizar esta
        sección, nuestra Política de Cookies y la Sección 4.1, y publicar una nueva fecha de
        vigencia.
      </p>
`,
    row: `          <tr>
            <td>Google (Google Analytics, Google Tag Manager)</td>
            <td>Analítica en nuestro sitio web público, solo después de que el visitante acepta las cookies de analítica (Sección 2.4)</td>
            <td>Páginas visitadas, sitio de origen, ubicación aproximada derivada de la dirección IP, tipo de dispositivo y navegador, e identificadores de cookies de analítica</td>
          </tr>
`,
    done: '<h3>2.4 Google Analytics</h3>',
  },
};
for (const [f, c] of Object.entries(PRIV)) {
  let s = get(f);
  if (s.includes(c.done)) continue;
  if (!c.re.test(s)) throw new Error('privacy anchor not found: ' + f);
  s = s.replace(c.re, c.neu);
  const idx = s.indexOf('            <td>Neon</td>');
  const rowStart = s.lastIndexOf('          <tr>', idx);
  if (idx < 0 || rowStart < 0) throw new Error('providers table anchor: ' + f);
  s = s.slice(0, rowStart) + c.row + s.slice(rowStart);
  out[f] = s;
}

// ── 3. Footers: link the Cookie Policy next to the Refund Policy ───────────────────────────
const htmlFiles = (dir) => fs.readdirSync(path.join(LANDING, dir)).filter((f) => f.endsWith('.html')).map((f) => (dir ? dir + '/' : '') + f);
const all = [...new Set([...htmlFiles(''), ...htmlFiles('es'), ...Object.keys(out).filter((f) => f.endsWith('.html'))])];
for (const f of all) {
  let s = get(f);
  const fm = s.match(/<footer>[\s\S]*?<\/footer>/);
  if (!fm || /cookies\.html/.test(fm[0])) continue;
  const es = f.startsWith('es/');
  const link = es ? '<a href="/es/cookies.html">Política de Cookies</a>' : '<a href="/cookies.html">Cookie Policy</a>';
  const refund = fm[0].match(/<a href="(?:\/es)?\/refund\.html">[^<]*<\/a>/);
  if (!refund) continue;
  const sep = fm[0].includes('<b>Legal</b>') ? '' : ' ·\n      ';
  out[f] = s.replace(fm[0], fm[0].replace(refund[0], refund[0] + sep + link));
}

// ── 4. GTM on every page (incl. the new cookie pages) ──────────────────────────────────────
const HEAD = `    <!-- Consent defaults (Google Consent Mode v2), before GTM: analytics only after the visitor accepts in the
         cookie banner (consent.js); advertising storage is never granted. -->
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});try{if(localStorage.getItem('ns-consent')==='granted')gtag('consent','update',{analytics_storage:'granted'});}catch(e){}</script>
    <!-- Google Tag Manager -->
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${GTM_ID}');</script>
    <!-- End Google Tag Manager -->
    <script src="/consent.js" defer></script>
`;
const BODY = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
`;
for (const f of all) {
  let s = get(f);
  if (s.includes(GTM_ID)) continue;
  const vp = s.match(/ *<meta name="viewport"[^>]*>\n/);
  const body = s.match(/<body[^>]*>\n?/);
  if (!vp || !body) throw new Error('no viewport/body: ' + f);
  s = s.replace(vp[0], vp[0] + HEAD);
  s = s.replace(body[0], body[0].replace(/\n?$/, '\n') + BODY);
  out[f] = s;
}

// ── 5. Legal modal + sitemap + banner script ───────────────────────────────────────────────
let lm = get('legal-modal.js');
if (!lm.includes("'/cookies.html'")) {
  lm = lm.replace(/var DOCS = \{([^}]*)\};/, (m, inner) => `var DOCS = {${inner.trimEnd()}, '/cookies.html': 1, '/es/cookies.html': 1 };`);
  if (!lm.includes("'/cookies.html': 1")) throw new Error('legal-modal DOCS');
  out['legal-modal.js'] = lm;
}
let sm = get('sitemap.xml');
if (!sm.includes('/cookies.html')) {
  const S = 'https://joinnorthstack.com';
  const u = (loc) => `  <url>\n    <loc>${S}/${loc}</loc>\n    <lastmod>2026-10-25</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.3</priority>\n    <xhtml:link rel="alternate" hreflang="en" href="${S}/cookies.html" />\n    <xhtml:link rel="alternate" hreflang="es" href="${S}/es/cookies.html" />\n  </url>\n`;
  sm = sm.replace('</urlset>', u('cookies.html') + u('es/cookies.html') + '</urlset>');
  sm = sm.replace(/(<loc>https:\/\/joinnorthstack\.com\/(?:es\/)?privacy\.html<\/loc>\n\s*<lastmod>)[^<]*/g, '$12026-10-25');
  out['sitemap.xml'] = sm;
}
out['consent.js'] = rd(HERE + '/consent.js');

if (process.argv.includes('--write')) for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(LANDING, f), s);
console.log('ok', Object.keys(out).length, 'files:', Object.keys(out).join(' '), process.argv.includes('--write') ? '(written)' : '(dry run)');
