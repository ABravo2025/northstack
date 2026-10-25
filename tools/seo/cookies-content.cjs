// Cookie Policy text (2026-10-25), EN + ES. Facts: landing sets no cookies of its own; the cookie
// banner stores the choice in localStorage ("ns-consent"); Google Analytics 4 (G-DQJ1K0FVJ5, via GTM
// GTM-TJHVX9R4) sets _ga and _ga_DQJ1K0FVJ5 only after "Accept"; GTM sets none; the app keeps the
// sign-in token and preferences in localStorage and uses no cookies or analytics yet.
module.exports = {
  en: {
    title: 'Cookie Policy — Northstack',
    desc: 'Which cookies and similar technologies Northstack uses on its website and app, and how to control them.',
    h1: 'Northstack Cookie Policy',
    date: 'Effective Date: October 25, 2026',
    body: `
      <p>
        This Cookie Policy explains which cookies and similar technologies Northstack
        ("<strong>Northstack</strong>," "<strong>we</strong>," "<strong>us</strong>") uses on
        our public website (<strong>joinnorthstack.com</strong>) and in the Northstack application
        (<strong>app.joinnorthstack.com</strong>), what they are for, and how you can control them.
        It complements our <a href="/privacy.html">Privacy Policy</a>, in particular Section 2.4.
      </p>

      <hr />

      <h2>1. What cookies and local storage are</h2>
      <p>
        <strong>Cookies</strong> are small text files a website stores in your browser.
        <strong>Local storage</strong> is a similar browser feature that keeps small pieces of
        data on your device. We use both only as described below.
      </p>

      <hr />

      <h2>2. On our public website (joinnorthstack.com)</h2>

      <h3>2.1 Strictly necessary</h3>
      <p>These are always on, because the site needs them to respect your choices.</p>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Duration</th></tr></thead>
        <tbody>
          <tr><td><code>ns-consent</code></td><td>Local storage (first party)</td><td>Remembers whether you accepted or declined analytics cookies, so we don't ask again on every page.</td><td>Until you clear your browser data or change your choice</td></tr>
        </tbody>
      </table>

      <h3>2.2 Analytics (only if you accept)</h3>
      <p>
        We use Google Analytics, loaded through Google Tag Manager, to understand how visitors
        find and use the site (pages visited, the site you came from, approximate location
        derived from your IP address, device and browser type). These cookies are set
        <strong>only if you choose <em>Accept</em></strong> in the cookie banner.
      </p>
      <table>
        <thead><tr><th>Name</th><th>Provider</th><th>Purpose</th><th>Duration</th></tr></thead>
        <tbody>
          <tr><td><code>_ga</code></td><td>Google Analytics</td><td>Distinguishes one browser from another to count unique visitors.</td><td>2 years</td></tr>
          <tr><td><code>_ga_DQJ1K0FVJ5</code></td><td>Google Analytics</td><td>Keeps the state of your current visit (session) on our site.</td><td>2 years</td></tr>
        </tbody>
      </table>
      <p>
        Google Tag Manager itself is loaded on every page to read your choice; it does not set
        cookies. We do not enable Google Signals, cross-device tracking, or any advertising or
        remarketing feature, and advertising storage is always disabled.
      </p>

      <h3>2.3 Advertising cookies</h3>
      <p>We do not use advertising or cross-site tracking cookies.</p>

      <hr />

      <h2>3. In the Northstack application (app.joinnorthstack.com)</h2>
      <p>
        The application does not use cookies. It keeps a small amount of data in your
        browser's local storage that it needs to work: your sign-in session (so you stay
        signed in) and preferences such as dark or light mode. This data stays on your device.
      </p>
      <p>
        The application does not use Google Analytics yet. As described in Section 2.4 of our
        Privacy Policy, we plan to add usage analytics to the application; when we do, we will
        update this policy and post a new effective date.
      </p>

      <hr />

      <h2>4. How to control cookies</h2>
      <ul>
        <li>
          <strong>On our website</strong>: use the cookie banner, or the
          <em>Cookie settings</em> link at the bottom of every page, to accept or decline
          analytics cookies at any time. If you decline after having accepted, we delete the
          Google Analytics cookies from your browser.
          <br /><a href="#" data-ns-cookie-settings>Open cookie settings</a>
        </li>
        <li>
          <strong>In your browser</strong>: you can block or delete cookies and local storage
          from your browser settings. Blocking local storage in the application will sign you out.
        </li>
        <li>
          <strong>Google's tools</strong>: you can also install the
          <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">Google Analytics opt-out browser add-on</a>.
        </li>
      </ul>

      <hr />

      <h2>5. Changes to this policy</h2>
      <p>
        If we change which cookies or similar technologies we use, we will update this page and
        its effective date.
      </p>

      <hr />

      <h2>6. Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:info@joinnorthstack.com">info@joinnorthstack.com</a>.
      </p>
`,
  },
  es: {
    title: 'Política de Cookies — Northstack',
    desc: 'Qué cookies y tecnologías similares usa Northstack en su sitio web y en la app, y cómo controlarlas.',
    h1: 'Política de Cookies de Northstack',
    date: 'Fecha de vigencia: 25 de octubre de 2026',
    body: `
      <p>
        Esta Política de Cookies explica qué cookies y tecnologías similares usa Northstack
        ("<strong>Northstack</strong>", "<strong>nosotros</strong>") en nuestro sitio web
        público (<strong>joinnorthstack.com</strong>) y en la aplicación de Northstack
        (<strong>app.joinnorthstack.com</strong>), para qué sirven y cómo podés controlarlas.
        Complementa nuestra <a href="/es/privacy.html">Política de Privacidad</a>, en especial
        la Sección 2.4.
      </p>

      <hr />

      <h2>1. Qué son las cookies y el almacenamiento local</h2>
      <p>
        Las <strong>cookies</strong> son pequeños archivos de texto que un sitio web guarda en
        tu navegador. El <strong>almacenamiento local</strong> es una función similar del
        navegador que guarda pequeños datos en tu dispositivo. Usamos ambos solo como se
        describe a continuación.
      </p>

      <hr />

      <h2>2. En nuestro sitio web público (joinnorthstack.com)</h2>

      <h3>2.1 Estrictamente necesarias</h3>
      <p>Están siempre activas, porque el sitio las necesita para respetar tu elección.</p>
      <table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Finalidad</th><th>Duración</th></tr></thead>
        <tbody>
          <tr><td><code>ns-consent</code></td><td>Almacenamiento local (propio)</td><td>Recuerda si aceptaste o rechazaste las cookies de analítica, para no preguntarte en cada página.</td><td>Hasta que borres los datos del navegador o cambies tu elección</td></tr>
        </tbody>
      </table>

      <h3>2.2 Analítica (solo si las aceptás)</h3>
      <p>
        Usamos Google Analytics, cargado a través de Google Tag Manager, para entender cómo los
        visitantes encuentran y usan el sitio (páginas visitadas, sitio desde el que llegaste,
        ubicación aproximada derivada de tu dirección IP, tipo de dispositivo y navegador).
        Estas cookies se guardan <strong>solo si elegís <em>Aceptar</em></strong> en el aviso
        de cookies.
      </p>
      <table>
        <thead><tr><th>Nombre</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th></tr></thead>
        <tbody>
          <tr><td><code>_ga</code></td><td>Google Analytics</td><td>Distingue un navegador de otro para contar visitantes únicos.</td><td>2 años</td></tr>
          <tr><td><code>_ga_DQJ1K0FVJ5</code></td><td>Google Analytics</td><td>Guarda el estado de tu visita actual (sesión) en nuestro sitio.</td><td>2 años</td></tr>
        </tbody>
      </table>
      <p>
        Google Tag Manager se carga en todas las páginas para leer tu elección y no guarda
        cookies. No activamos Google Signals, el seguimiento entre dispositivos ni ninguna
        función de publicidad o remarketing, y el almacenamiento publicitario está siempre
        desactivado.
      </p>

      <h3>2.3 Cookies de publicidad</h3>
      <p>No usamos cookies de publicidad ni de seguimiento entre sitios.</p>

      <hr />

      <h2>3. En la aplicación de Northstack (app.joinnorthstack.com)</h2>
      <p>
        La aplicación no usa cookies. Guarda en el almacenamiento local de tu navegador una
        pequeña cantidad de datos que necesita para funcionar: tu sesión iniciada (para que no
        tengas que volver a entrar) y preferencias como el modo oscuro o claro. Estos datos se
        quedan en tu dispositivo.
      </p>
      <p>
        La aplicación todavía no usa Google Analytics. Como se describe en la Sección 2.4 de
        nuestra Política de Privacidad, planeamos incorporar analítica de uso en la
        aplicación; cuando lo hagamos, vamos a actualizar esta política y publicar una nueva
        fecha de vigencia.
      </p>

      <hr />

      <h2>4. Cómo controlar las cookies</h2>
      <ul>
        <li>
          <strong>En nuestro sitio</strong>: usá el aviso de cookies, o el link
          <em>Preferencias de cookies</em> al pie de todas las páginas, para aceptar o rechazar
          las cookies de analítica cuando quieras. Si rechazás después de haber aceptado,
          borramos las cookies de Google Analytics de tu navegador.
          <br /><a href="#" data-ns-cookie-settings>Abrir preferencias de cookies</a>
        </li>
        <li>
          <strong>En tu navegador</strong>: podés bloquear o borrar las cookies y el
          almacenamiento local desde la configuración del navegador. Si bloqueás el
          almacenamiento local en la aplicación, se va a cerrar tu sesión.
        </li>
        <li>
          <strong>Herramientas de Google</strong>: también podés instalar el
          <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">complemento de inhabilitación de Google Analytics</a>.
        </li>
      </ul>

      <hr />

      <h2>5. Cambios en esta política</h2>
      <p>
        Si cambiamos las cookies o tecnologías similares que usamos, vamos a actualizar esta
        página y su fecha de vigencia.
      </p>

      <hr />

      <h2>6. Contacto</h2>
      <p>
        Consultas sobre esta política: <a href="mailto:info@joinnorthstack.com">info@joinnorthstack.com</a>.
      </p>
`,
  },
};
