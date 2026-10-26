// Cookie consent for the landing (v3, 2026-10-26). Google Tag Manager loads on every page; the Google
// Consent Mode defaults set inline in each page's <head> (before GTM) keep everything denied until the
// visitor chooses. Two optional categories:
//   analytics → analytics_storage                    (Google Analytics)
//   ads       → ad_storage + ad_user_data            (Google Ads conversion measurement)
// ad_personalization is never granted: no remarketing or ad personalization (Privacy 2.5, Cookie Policy).
// The choice lives in localStorage "ns-consent" as {"a":0|1,"d":0|1}; the legacy v1/v2 values
// "granted"/"denied" are read as analytics-only, and "granted" re-asks once so ads can be chosen.
// "Cookie settings" in the footer (or any [data-ns-cookie-settings]) reopens the banner.
(function () {
  var KEY = 'ns-consent';
  var es = (document.documentElement.lang || '').indexOf('es') === 0;
  var T = es
    ? { text: 'Usamos cookies de analítica para entender cómo se usa el sitio y, si las aceptás, de publicidad para medir qué anuncios de Google traen registros. Nada se activa sin tu permiso.', more: 'Política de cookies', accept: 'Aceptar todo', decline: 'Rechazar', configure: 'Configurar', save: 'Guardar', settings: 'Preferencias de cookies', label: 'Aviso de cookies',
        analytics: 'Analítica', analyticsHint: 'Google Analytics: páginas visitadas y de dónde llegaste.',
        ads: 'Publicidad', adsHint: 'Google Ads: medir qué anuncios traen registros. Sin remarketing ni anuncios personalizados.',
        policy: '/es/cookies.html' }
    : { text: 'We use analytics cookies to understand how the site is used and, if you accept them, advertising cookies to measure which Google ads bring sign-ups. Nothing turns on without your permission.', more: 'Cookie Policy', accept: 'Accept all', decline: 'Decline', configure: 'Customize', save: 'Save', settings: 'Cookie settings', label: 'Cookie notice',
        analytics: 'Analytics', analyticsHint: 'Google Analytics: pages visited and where you came from.',
        ads: 'Advertising', adsHint: 'Google Ads: measure which ads bring sign-ups. No remarketing or personalized ads.',
        policy: '/cookies.html' };
  var CSS =
    '.ns-cc{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:90;margin:0 auto;max-width:760px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding:14px 16px 14px 20px;border-radius:16px;background:var(--surface,#fff);color:var(--ink,#14102b);border:1px solid var(--line,#e6e1f5);box-shadow:0 2px 4px rgba(30,14,80,.06),0 24px 48px -16px rgba(40,18,110,.35);font:14.5px/1.5 var(--font,system-ui,sans-serif);animation:ns-cc-in .25s ease both}' +
    '.ns-cc p{margin:0;flex:1 1 320px;min-width:0;color:var(--ink-2,#4a4566)}' +
    '.ns-cc p a{color:var(--violet,#5b21e6);font-weight:600}' +
    '.ns-cc .ns-cc-btns{display:flex;flex-wrap:wrap;gap:8px;flex-shrink:0}' +
    '.ns-cc button{font:600 14px/1 var(--font,system-ui,sans-serif);padding:11px 16px;border-radius:10px;cursor:pointer;border:1px solid var(--line,#e6e1f5);background:var(--surface,#fff);color:var(--ink,#14102b)}' +
    '.ns-cc button.ok{background:var(--violet,#5b21e6);border-color:transparent;color:#fff}' +
    '.ns-cc button:focus-visible,.ns-cc input:focus-visible{outline:3px solid var(--lilac,#a98bff);outline-offset:2px}' +
    '.ns-cc .ns-cc-opts{flex-basis:100%;display:grid;gap:10px;padding-top:4px;border-top:1px solid var(--line,#e6e1f5)}' +
    '.ns-cc label{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;align-items:start;cursor:pointer}' +
    '.ns-cc label input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--violet,#5b21e6)}' +
    '.ns-cc label b{display:block;color:var(--ink,#14102b)} .ns-cc label small{color:var(--ink-3,#6f6a8a);font-size:13px}' +
    '.ns-cc[hidden],.ns-cc [hidden]{display:none}' +
    '@keyframes ns-cc-in{from{opacity:0;transform:translateY(10px)}}' +
    '@media (prefers-reduced-motion:reduce){.ns-cc{animation:none}}';

  function read() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw === 'granted') return { a: 1, d: 0, legacy: true };
    if (raw === 'denied') return { a: 0, d: 0 };
    try { var v = JSON.parse(raw); if (v && typeof v === 'object') return { a: v.a ? 1 : 0, d: v.d ? 1 : 0 }; } catch (e) {}
    return null;
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify({ a: c.a, d: c.d })); } catch (e) {} }
  function gtag() { window.dataLayer = window.dataLayer || []; window.dataLayer.push(arguments); }

  function clearCookies(prefix) {
    var host = location.hostname, domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name.indexOf(prefix) !== 0) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  var bar, optA, optD, opts, btnSave, btnCfg;
  function apply(c) {
    save(c);
    gtag('consent', 'update', {
      analytics_storage: c.a ? 'granted' : 'denied',
      ad_storage: c.d ? 'granted' : 'denied',
      ad_user_data: c.d ? 'granted' : 'denied',
      ad_personalization: 'denied',
    });
    // Withdrawing a category removes the cookies it had set (Cookie Policy §4).
    if (!c.a) clearCookies('_ga');
    if (!c.d) clearCookies('_gcl');
    if (bar) bar.hidden = true;
  }
  function show() {
    if (!bar) {
      var style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      bar = document.createElement('div');
      bar.className = 'ns-cc';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', T.label);
      bar.innerHTML = '<p>' + T.text + ' <a href="' + T.policy + '">' + T.more + '</a></p>' +
        '<div class="ns-cc-btns"><button type="button" class="no">' + T.decline + '</button><button type="button" class="cfg">' + T.configure + '</button><button type="button" class="sv" hidden>' + T.save + '</button><button type="button" class="ok">' + T.accept + '</button></div>' +
        '<div class="ns-cc-opts" hidden>' +
        '<label><input type="checkbox" id="ns-cc-a"><span><b>' + T.analytics + '</b><small>' + T.analyticsHint + '</small></span></label>' +
        '<label><input type="checkbox" id="ns-cc-d"><span><b>' + T.ads + '</b><small>' + T.adsHint + '</small></span></label>' +
        '</div>';
      optA = bar.querySelector('#ns-cc-a');
      optD = bar.querySelector('#ns-cc-d');
      opts = bar.querySelector('.ns-cc-opts');
      btnSave = bar.querySelector('.sv');
      btnCfg = bar.querySelector('.cfg');
      bar.querySelector('.ok').addEventListener('click', function () { apply({ a: 1, d: 1 }); });
      bar.querySelector('.no').addEventListener('click', function () { apply({ a: 0, d: 0 }); });
      btnCfg.addEventListener('click', function () { opts.hidden = false; btnCfg.hidden = true; btnSave.hidden = false; optA.focus(); });
      btnSave.addEventListener('click', function () { apply({ a: optA.checked ? 1 : 0, d: optD.checked ? 1 : 0 }); });
      document.body.appendChild(bar);
    }
    var cur = read() || { a: 0, d: 0 };
    optA.checked = !!cur.a;
    optD.checked = !!cur.d;
    opts.hidden = true; btnCfg.hidden = false; btnSave.hidden = true;
    bar.hidden = false;
  }

  function init() {
    // Landing pages put the copyright in footer .copy; the legal pages in a plain footer <p>.
    var copy = document.querySelector('footer .copy') || document.querySelector('footer p');
    if (copy) {
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = T.settings;
      a.style.cssText = 'display:inline;margin-left:14px;text-decoration:underline;';
      a.addEventListener('click', function (e) { e.preventDefault(); show(); });
      copy.appendChild(a);
    }
    // Any element marked data-ns-cookie-settings (e.g. on the Cookie Policy) reopens the banner.
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-ns-cookie-settings]');
      if (!el) return;
      e.preventDefault();
      show();
    });
    var c = read();
    if (!c || c.legacy) show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
