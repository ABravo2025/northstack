// Analytics (2026-10-24): Google Tag Manager GTM-TJHVX9R4 on every landing page, behind Google
// Consent Mode v2 defaults + the consent.js banner; Privacy Policy EN/ES updated (section 2.4, Google
// in the providers table, new effective date). Idempotent: re-running skips pages already tagged.
// Usage: LANDING=<landing folder> node analytics.cjs [--write]
const fs = require('fs');
const path = require('path');
const LANDING = process.env.LANDING || 'C:/tmp/ns-landing-seo/landing';
const HERE = __dirname;
const GTM_ID = 'GTM-TJHVX9R4';
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const rep = (s, a, b, label) => { if (!s.includes(a)) throw new Error('not found [' + label + ']'); return s.split(a).join(b); };

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

const out = {};
const htmlFiles = (dir) => fs.readdirSync(path.join(LANDING, dir)).filter((f) => f.endsWith('.html')).map((f) => (dir ? dir + '/' : '') + f);
for (const f of [...htmlFiles(''), ...htmlFiles('es')]) {
  let s = rd(path.join(LANDING, f));
  if (s.includes(GTM_ID)) continue;
  // As high in <head> as possible (Google's guidance): right after the viewport meta.
  const vp = s.match(/ *<meta name="viewport"[^>]*>\n/);
  if (!vp) throw new Error('no viewport meta: ' + f);
  s = s.replace(vp[0], vp[0] + HEAD);
  const body = s.match(/<body[^>]*>\n?/);
  if (!body) throw new Error('no body: ' + f);
  s = s.replace(body[0], body[0].replace(/\n?$/, '\n') + BODY);
  out[f] = s;
}

// ── Privacy Policy ─────────────────────────────────────────────────────────────────────────
const P = {
  'privacy.html': {
    date: ['Effective Date: October 19, 2026', 'Effective Date: October 24, 2026'],
    old: `      <p>
        We do not currently use third-party advertising or analytics trackers, and we do
        not use cookies for cross-site tracking or advertising purposes.
      </p>
`,
    neu: `      <p>
        We do not use third-party advertising trackers, and we do not use cookies for
        cross-site tracking or advertising purposes. Analytics on our public website is
        described in Section 2.4.
      </p>

      <h3>2.4 Analytics on our public website</h3>
      <p>
        On our public website (joinnorthstack.com) we use Google Analytics, loaded through
        Google Tag Manager, to understand how visitors find and use the site: for example,
        which pages are visited, which site you came from, your approximate location
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
          the bottom of every page of the website.
        </li>
        <li>
          <strong>No advertising</strong>: we do not use these tools for advertising or ad
          personalization, and advertising storage is always disabled.
        </li>
        <li>
          <strong>Website only</strong>: Google Analytics is not used inside the Northstack
          application, and it never receives Account Data or Processed Data.
        </li>
      </ul>
`,
    rowAfter: `            <td>Neon</td>`,
    row: `          <tr>
            <td>Google (Google Analytics, Google Tag Manager)</td>
            <td>Analytics on our public website, only after the visitor accepts analytics cookies (Section 2.4)</td>
            <td>Pages visited, referring site, approximate location derived from IP address, device and browser type, and analytics cookie identifiers</td>
          </tr>
`,
  },
  'es/privacy.html': {
    date: ['Fecha de vigencia: 19 de octubre de 2026', 'Fecha de vigencia: 24 de octubre de 2026'],
    old: `      <p>
        Actualmente no usamos rastreadores de publicidad o analítica de terceros, y no
        usamos cookies para seguimiento entre sitios ni con fines publicitarios.
      </p>
`,
    neu: `      <p>
        No usamos rastreadores de publicidad de terceros, y no usamos cookies para
        seguimiento entre sitios ni con fines publicitarios. La analítica de nuestro sitio
        web público se describe en la Sección 2.4.
      </p>

      <h3>2.4 Analítica en nuestro sitio web público</h3>
      <p>
        En nuestro sitio web público (joinnorthstack.com) usamos Google Analytics, cargado a
        través de Google Tag Manager, para entender cómo los visitantes encuentran y usan el
        sitio: por ejemplo, qué páginas se visitan, desde qué sitio llegaste, tu ubicación
        aproximada (derivada de tu dirección IP) y el tipo de dispositivo y navegador.
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
          <em>Preferencias de cookies</em> al pie de todas las páginas del sitio.
        </li>
        <li>
          <strong>Sin publicidad</strong>: no usamos estas herramientas para publicidad ni para
          personalizar anuncios, y el almacenamiento publicitario está siempre desactivado.
        </li>
        <li>
          <strong>Solo en el sitio web</strong>: Google Analytics no se usa dentro de la
          aplicación de Northstack y nunca recibe Datos de Cuenta ni Datos Procesados.
        </li>
      </ul>
`,
    rowAfter: `            <td>Neon</td>`,
    row: `          <tr>
            <td>Google (Google Analytics, Google Tag Manager)</td>
            <td>Analítica en nuestro sitio web público, solo después de que el visitante acepta las cookies de analítica (Sección 2.4)</td>
            <td>Páginas visitadas, sitio de origen, ubicación aproximada derivada de la dirección IP, tipo de dispositivo y navegador, e identificadores de cookies de analítica</td>
          </tr>
`,
  },
};
for (const [f, c] of Object.entries(P)) {
  let s = out[f] || rd(path.join(LANDING, f));
  if (s.includes('2.4 Analytics on our public website') || s.includes('2.4 Analítica en nuestro sitio')) continue;
  s = rep(s, c.date[0], c.date[1], f + ' date');
  s = rep(s, c.old, c.neu, f + ' paragraph');
  // New row goes right before the Neon row (after Vercel).
  const idx = s.indexOf(c.rowAfter);
  const rowStart = s.lastIndexOf('          <tr>', idx);
  if (idx < 0 || rowStart < 0) throw new Error('table row anchor: ' + f);
  s = s.slice(0, rowStart) + c.row + s.slice(rowStart);
  out[f] = s;
}

out['consent.js'] = rd(HERE + '/consent.js');
if (process.argv.includes('--write')) for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(LANDING, f), s);
console.log('ok', Object.keys(out).length, 'files', process.argv.includes('--write') ? '(written)' : '(dry run)');
