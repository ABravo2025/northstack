// Ads consent (2026-10-26): Google Ads conversion measurement becomes a second, separate consent
// category. Swaps the inline Consent Mode defaults on every page for the v3 reader, ships consent.js
// v3 (Decline / Customize / Accept all), and updates Privacy 2.3/2.4 + new 2.5 + providers row and
// the Cookie Policy (2.2, new 2.3 table, §4), EN/ES, effective October 26, 2026. Idempotent.
// Usage: LANDING=<landing folder> node analytics3.cjs [--write]
const fs = require('fs');
const path = require('path');
const LANDING = process.env.LANDING || 'C:/tmp/ns-landing-seo/landing';
const HERE = __dirname;
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const out = {};
const get = (f) => (f in out ? out[f] : rd(path.join(LANDING, f)));
function rep(s, a, b, label) { if (!s.includes(a)) throw new Error('not found [' + label + ']: ' + a.slice(0, 70)); return s.split(a).join(b); }

// ── 1. Inline consent defaults on every page ───────────────────────────────────────────────
const NEW_DEFAULTS = `    <!-- Consent defaults (Google Consent Mode v2), before GTM: analytics and Google Ads measurement only after the
         visitor accepts them in the cookie banner (consent.js); ad personalization is never granted. -->
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});try{var c=localStorage.getItem('ns-consent'),a=c==='granted',d=false;if(c&&c.charAt(0)==='{'){c=JSON.parse(c);a=!!c.a;d=!!c.d;}if(a||d)gtag('consent','update',{analytics_storage:a?'granted':'denied',ad_storage:d?'granted':'denied',ad_user_data:d?'granted':'denied'});}catch(e){}</script>
`;
const OLD_RE = / *<!-- Consent defaults \(Google Consent Mode v2\), before GTM: analytics only[\s\S]*?<\/script>\n/;
const htmlFiles = (dir) => fs.readdirSync(path.join(LANDING, dir)).filter((f) => f.endsWith('.html')).map((f) => (dir ? dir + '/' : '') + f);
for (const f of [...htmlFiles(''), ...htmlFiles('es')]) {
  const s = get(f);
  if (s.includes("ad_user_data:d?'granted'")) continue;
  if (!OLD_RE.test(s)) throw new Error('consent defaults not found: ' + f);
  out[f] = s.replace(OLD_RE, NEW_DEFAULTS);
}

// ── 2. Privacy Policy ──────────────────────────────────────────────────────────────────────
const P = {
  'privacy.html': [
    ['Effective Date: October 25, 2026', 'Effective Date: October 26, 2026'],
    [`        We do not use third-party advertising trackers, and we do not use cookies for
        cross-site tracking or advertising purposes. Google Analytics is described in
        Section 2.4.`,
     `        We do not use cookies for cross-site tracking, remarketing or ad personalization.
        Google Analytics and Google Ads conversion measurement on our website are described
        in Sections 2.4 and 2.5.`],
    [`Analytics runs only if you choose <em>Accept</em> in the cookie banner. If you choose
          <em>Decline</em>, Google Analytics does not run.`,
     `Analytics runs only if you accept analytics cookies in the cookie banner (<em>Accept all</em>,
          or <em>Analytics</em> under <em>Customize</em>). If you decline them, Google Analytics does not run.`],
    [`          <strong>No advertising</strong>: we do not enable Google Signals, cross-device
          tracking, or any advertising or remarketing feature, and advertising storage is
          always disabled.`,
     `          <strong>No advertising features in Analytics</strong>: we do not enable Google
          Signals, cross-device tracking, or remarketing in Google Analytics.`],
    [`      <p>
        <strong>Inside the Northstack application: not yet in use.</strong>`,
     `      <h3>2.5 Google Ads conversion measurement</h3>
      <p>
        We advertise Northstack on Google Search. <strong>Only if you accept advertising
        cookies</strong> in the cookie banner (<em>Accept all</em>, or <em>Advertising</em> under
        <em>Customize</em>), Google Ads sets cookies on our public website that tell us when a visit
        that came from one of our ads leads to a sign-up, so we can see which ads work. This
        involves the ad click identifier and the fact that a sign-up click happened. We do not send
        Google your name, email address, Account Data or Processed Data, and we do not use
        remarketing, audience lists or ad personalization (ad personalization is always
        disabled). If you decline, these cookies are not set. You can change your choice anytime
        from <em>Cookie settings</em>; the cookies are listed in our
        <a href="/cookies.html">Cookie Policy</a>.
      </p>

      <h3>Google Analytics inside the application</h3>
      <p>
        <strong>Inside the Northstack application: not yet in use.</strong>`],
    [`            <td>Analytics on our public website, only after the visitor accepts analytics cookies (Section 2.4)</td>
            <td>Pages visited, referring site, approximate location derived from IP address, device and browser type, and analytics cookie identifiers</td>`,
     `            <td>Analytics and Google Ads conversion measurement on our public website, each only after the visitor accepts that category of cookies (Sections 2.4 and 2.5)</td>
            <td>Pages visited, referring site, approximate location derived from IP address, device and browser type, analytics cookie identifiers, and ad click identifiers</td>`],
  ],
  'es/privacy.html': [
    ['Fecha de vigencia: 25 de octubre de 2026', 'Fecha de vigencia: 26 de octubre de 2026'],
    [`        No usamos rastreadores de publicidad de terceros, y no usamos cookies para
        seguimiento entre sitios ni con fines publicitarios. Google Analytics se describe en
        la Sección 2.4.`,
     `        No usamos cookies para seguimiento entre sitios, remarketing ni personalización de
        anuncios. Google Analytics y la medición de conversiones de Google Ads en nuestro sitio
        se describen en las Secciones 2.4 y 2.5.`],
    [`Google Analytics funciona solo si elegís <em>Aceptar</em> en el aviso de cookies. Si
          elegís <em>Rechazar</em>, Google Analytics no funciona.`,
     `Google Analytics funciona solo si aceptás las cookies de analítica en el aviso de cookies
          (<em>Aceptar todo</em>, o <em>Analítica</em> en <em>Configurar</em>). Si las rechazás,
          Google Analytics no funciona.`],
    [`          <strong>Sin publicidad</strong>: no activamos Google Signals, el seguimiento entre
          dispositivos ni ninguna función de publicidad o remarketing, y el almacenamiento
          publicitario está siempre desactivado.`,
     `          <strong>Sin funciones publicitarias en Analytics</strong>: no activamos Google
          Signals, el seguimiento entre dispositivos ni el remarketing en Google Analytics.`],
    [`      <p>
        <strong>Dentro de la aplicación de Northstack: todavía no está en uso.</strong>`,
     `      <h3>2.5 Medición de conversiones de Google Ads</h3>
      <p>
        Publicitamos Northstack en la Búsqueda de Google. <strong>Solo si aceptás las cookies de
        publicidad</strong> en el aviso de cookies (<em>Aceptar todo</em>, o <em>Publicidad</em> en
        <em>Configurar</em>), Google Ads guarda cookies en nuestro sitio web público que nos indican
        cuándo una visita que llegó desde uno de nuestros anuncios termina en un registro, para
        saber qué anuncios funcionan. Esto involucra el identificador del clic en el anuncio y el
        hecho de que hubo un clic de registro. No le enviamos a Google tu nombre, tu email, Datos
        de Cuenta ni Datos Procesados, y no usamos remarketing, listas de audiencia ni
        personalización de anuncios (la personalización de anuncios está siempre desactivada). Si
        las rechazás, estas cookies no se guardan. Podés cambiar tu elección cuando quieras desde
        <em>Preferencias de cookies</em>; las cookies figuran en nuestra
        <a href="/es/cookies.html">Política de Cookies</a>.
      </p>

      <h3>Google Analytics dentro de la aplicación</h3>
      <p>
        <strong>Dentro de la aplicación de Northstack: todavía no está en uso.</strong>`],
    [`            <td>Analítica en nuestro sitio web público, solo después de que el visitante acepta las cookies de analítica (Sección 2.4)</td>
            <td>Páginas visitadas, sitio de origen, ubicación aproximada derivada de la dirección IP, tipo de dispositivo y navegador, e identificadores de cookies de analítica</td>`,
     `            <td>Analítica y medición de conversiones de Google Ads en nuestro sitio web público, cada una solo después de que el visitante acepta esa categoría de cookies (Secciones 2.4 y 2.5)</td>
            <td>Páginas visitadas, sitio de origen, ubicación aproximada derivada de la dirección IP, tipo de dispositivo y navegador, identificadores de cookies de analítica e identificadores de clics en anuncios</td>`],
  ],
};
for (const [f, reps] of Object.entries(P)) {
  let s = get(f);
  if (s.includes('2.5 Google Ads conversion measurement') || s.includes('2.5 Medición de conversiones de Google Ads')) continue;
  reps.forEach(([a, b], i) => { s = rep(s, a, b, f + ' #' + i); });
  out[f] = s;
}

// ── 3. Cookie Policy ───────────────────────────────────────────────────────────────────────
const C = {
  'cookies.html': [
    ['Effective Date: October 25, 2026', 'Effective Date: October 26, 2026'],
    [`<strong>only if you choose <em>Accept</em></strong> in the cookie banner.`,
     `<strong>only if you accept analytics cookies</strong> in the cookie banner.`],
    [`        cookies. We do not enable Google Signals, cross-device tracking, or any advertising or
        remarketing feature, and advertising storage is always disabled.`,
     `        cookies. We do not enable Google Signals, cross-device tracking, or remarketing in
        Google Analytics.`],
    [`      <h3>2.3 Advertising cookies</h3>
      <p>We do not use advertising or cross-site tracking cookies.</p>`,
     `      <h3>2.3 Advertising measurement (only if you accept)</h3>
      <p>
        We advertise Northstack on Google Search. If you accept advertising cookies, Google Ads
        sets these cookies to tell us when a visit from one of our ads leads to a sign-up. We do
        not use remarketing, audience lists or personalized ads, and ad personalization is always
        disabled.
      </p>
      <table>
        <thead><tr><th>Name</th><th>Provider</th><th>Purpose</th><th>Duration</th></tr></thead>
        <tbody>
          <tr><td><code>_gcl_au</code></td><td>Google Ads</td><td>Links ad clicks with sign-ups on our site (conversion linker).</td><td>90 days</td></tr>
          <tr><td><code>_gcl_aw</code></td><td>Google Ads</td><td>Keeps the ad click identifier when you arrive from one of our Google ads.</td><td>90 days</td></tr>
        </tbody>
      </table>`],
    [`to accept or decline
          analytics cookies at any time. If you decline after having accepted, we delete the
          Google Analytics cookies from your browser.`,
     `to accept or decline
          analytics and advertising cookies at any time, together or separately
          (<em>Customize</em>). If you decline a category after having accepted it, we delete its
          cookies from your browser.`],
  ],
  'es/cookies.html': [
    ['Fecha de vigencia: 25 de octubre de 2026', 'Fecha de vigencia: 26 de octubre de 2026'],
    [`Estas cookies se guardan <strong>solo si elegís <em>Aceptar</em></strong> en el aviso
        de cookies.`,
     `Estas cookies se guardan <strong>solo si aceptás las cookies de analítica</strong> en el
        aviso de cookies.`],
    [`        cookies. No activamos Google Signals, el seguimiento entre dispositivos ni ninguna
        función de publicidad o remarketing, y el almacenamiento publicitario está siempre
        desactivado.`,
     `        cookies. No activamos Google Signals, el seguimiento entre dispositivos ni el
        remarketing en Google Analytics.`],
    [`      <h3>2.3 Cookies de publicidad</h3>
      <p>No usamos cookies de publicidad ni de seguimiento entre sitios.</p>`,
     `      <h3>2.3 Medición de publicidad (solo si la aceptás)</h3>
      <p>
        Publicitamos Northstack en la Búsqueda de Google. Si aceptás las cookies de publicidad,
        Google Ads guarda estas cookies para indicarnos cuándo una visita desde uno de nuestros
        anuncios termina en un registro. No usamos remarketing, listas de audiencia ni anuncios
        personalizados, y la personalización de anuncios está siempre desactivada.
      </p>
      <table>
        <thead><tr><th>Nombre</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th></tr></thead>
        <tbody>
          <tr><td><code>_gcl_au</code></td><td>Google Ads</td><td>Vincula los clics en anuncios con los registros en nuestro sitio (vinculador de conversiones).</td><td>90 días</td></tr>
          <tr><td><code>_gcl_aw</code></td><td>Google Ads</td><td>Guarda el identificador del clic cuando llegás desde uno de nuestros anuncios de Google.</td><td>90 días</td></tr>
        </tbody>
      </table>`],
    [`para aceptar o rechazar
          las cookies de analítica cuando quieras. Si rechazás después de haber aceptado,
          borramos las cookies de Google Analytics de tu navegador.`,
     `para aceptar o rechazar
          las cookies de analítica y de publicidad cuando quieras, juntas o por separado
          (<em>Configurar</em>). Si rechazás una categoría después de haberla aceptado, borramos
          sus cookies de tu navegador.`],
  ],
};
for (const [f, reps] of Object.entries(C)) {
  let s = get(f);
  if (s.includes('_gcl_au')) continue;
  reps.forEach(([a, b], i) => { s = rep(s, a, b, f + ' #' + i); });
  out[f] = s;
}

out['consent.js'] = rd(HERE + '/consent.js');
// Sitemap: the two policies changed today.
let sm = get('sitemap.xml');
sm = sm.replace(/(<loc>https:\/\/joinnorthstack\.com\/(?:es\/)?(?:privacy|cookies)\.html<\/loc>\n\s*<lastmod>)[^<]*/g, '$12026-10-26');
out['sitemap.xml'] = sm;

if (process.argv.includes('--write')) for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(LANDING, f), s);
console.log('ok', Object.keys(out).length, 'files', process.argv.includes('--write') ? '(written)' : '(dry run)');
