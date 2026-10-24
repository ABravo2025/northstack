// Cookie consent for the landing (2026-10-24). Google Tag Manager loads on every page, but Google
// Consent Mode defaults (set inline in each page's <head>, before GTM) keep analytics_storage denied
// and ads always denied. This banner asks once; "Accept" grants analytics_storage, "Decline" keeps it
// denied. The choice lives in localStorage ("ns-consent") and can be changed from the
// "Cookie settings" link this script adds to the footer. Privacy Policy section 2.4 describes it.
(function () {
  var KEY = 'ns-consent';
  var es = (document.documentElement.lang || '').indexOf('es') === 0;
  var T = es
    ? { text: 'Usamos cookies de analítica para entender cómo se usa este sitio. Solo se activan si las aceptás.', more: 'Política de privacidad', accept: 'Aceptar', decline: 'Rechazar', settings: 'Preferencias de cookies', label: 'Aviso de cookies', privacy: '/es/privacy.html' }
    : { text: 'We use analytics cookies to understand how this site is used. They only turn on if you accept them.', more: 'Privacy Policy', accept: 'Accept', decline: 'Decline', settings: 'Cookie settings', label: 'Cookie notice', privacy: '/privacy.html' };
  var CSS =
    '.ns-cc{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:90;margin:0 auto;max-width:720px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding:14px 16px 14px 20px;border-radius:16px;background:var(--surface,#fff);color:var(--ink,#14102b);border:1px solid var(--line,#e6e1f5);box-shadow:0 2px 4px rgba(30,14,80,.06),0 24px 48px -16px rgba(40,18,110,.35);font:14.5px/1.5 var(--font,system-ui,sans-serif);animation:ns-cc-in .25s ease both}' +
    '.ns-cc p{margin:0;flex:1 1 300px;min-width:0;color:var(--ink-2,#4a4566)}' +
    '.ns-cc p a{color:var(--violet,#5b21e6);font-weight:600}' +
    '.ns-cc div{display:flex;gap:8px;flex-shrink:0}' +
    '.ns-cc button{font:600 14px/1 var(--font,system-ui,sans-serif);padding:11px 16px;border-radius:10px;cursor:pointer;border:1px solid var(--line,#e6e1f5);background:var(--surface,#fff);color:var(--ink,#14102b)}' +
    '.ns-cc button.ok{background:var(--violet,#5b21e6);border-color:transparent;color:#fff}' +
    '.ns-cc button:focus-visible{outline:3px solid var(--lilac,#a98bff);outline-offset:2px}' +
    '.ns-cc[hidden]{display:none}' +
    '@keyframes ns-cc-in{from{opacity:0;transform:translateY(10px)}}' +
    '@media (prefers-reduced-motion:reduce){.ns-cc{animation:none}}';

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function gtag() { window.dataLayer = window.dataLayer || []; window.dataLayer.push(arguments); }

  var bar;
  function decide(granted) {
    save(granted ? 'granted' : 'denied');
    gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
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
      bar.innerHTML = '<p>' + T.text + ' <a href="' + T.privacy + '">' + T.more + '</a></p>' +
        '<div><button type="button" class="no">' + T.decline + '</button><button type="button" class="ok">' + T.accept + '</button></div>';
      bar.querySelector('.ok').addEventListener('click', function () { decide(true); });
      bar.querySelector('.no').addEventListener('click', function () { decide(false); });
      document.body.appendChild(bar);
    }
    bar.hidden = false;
  }

  function init() {
    var copy = document.querySelector('footer .copy');
    if (copy) {
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = T.settings;
      a.style.cssText = 'display:inline;margin-left:14px;text-decoration:underline;';
      a.addEventListener('click', function (e) { e.preventDefault(); show(); });
      copy.appendChild(a);
    }
    if (!read()) show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
