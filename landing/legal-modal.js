// Terms / Privacy / Refund open in a modal everywhere on the landing (2026-10-02), in the same
// reading format as the standalone pages — which stay as they are for search engines, direct links
// and anyone without JavaScript. Any <a href="/terms.html|/privacy.html|/refund.html"> on any page is
// picked up, including links inside an open document (they switch the document in place).
// Ctrl/Cmd/middle-click still opens the real page in a new tab.
(function () {
  var DOCS = { '/terms.html': 1, '/privacy.html': 1, '/refund.html': 1 };
  var CSS =
    '.lm-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(14,10,30,.55);backdrop-filter:blur(3px);animation:lm-fade .18s ease both}' +
    '.lm-dialog{display:flex;flex-direction:column;width:100%;max-width:820px;max-height:88vh;background:var(--surface,#fff);color:var(--ink,#14102b);border:1px solid var(--line,#e6e1f5);border-radius:20px;overflow:hidden;box-shadow:0 2px 4px rgba(30,14,80,.06),0 40px 80px -24px rgba(50,20,140,.4);animation:lm-rise .22s ease both}' +
    '.lm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px 14px 24px;border-bottom:1px solid var(--line,#e6e1f5)}' +
    '.lm-head b{font-size:16px}.lm-head div{display:flex;align-items:center;gap:6px}' +
    '.lm-head a{font-size:13.5px;color:var(--ink-3,#6f6a8a);text-decoration:none;padding:6px 10px;border-radius:8px}.lm-head a:hover{background:var(--surface-2,#f4f1fd);color:var(--ink,#14102b)}' +
    '.lm-close{border:0;background:transparent;color:var(--ink-3,#6f6a8a);font-size:20px;line-height:1;width:34px;height:34px;border-radius:9px;cursor:pointer}.lm-close:hover{background:var(--surface-2,#f4f1fd);color:var(--ink,#14102b)}' +
    '.lm-close:focus-visible,.lm-head a:focus-visible{outline:3px solid var(--lilac,#a98bff);outline-offset:1px}' +
    '.lm-body{overflow-y:auto;padding:36px 20px 48px;overscroll-behavior:contain}' +
    '.lm-doc{max-width:680px;margin:0 auto;font-size:15.5px;line-height:1.7;color:var(--ink-2,#4a4566)}' +
    '.lm-doc h1{font-size:clamp(26px,4vw,34px);line-height:1.15;letter-spacing:-.02em;margin:0 0 6px;color:var(--ink,#14102b);text-wrap:balance}' +
    '.lm-doc .effective-date{display:inline-block;margin:0 0 26px;padding:4px 12px;border-radius:99px;background:var(--lilac-soft,#efe9ff);color:var(--violet,#5b21e6);font-size:14px;font-weight:600}' +
    '.lm-doc h2{font-size:21px;letter-spacing:-.015em;margin:36px 0 10px;color:var(--ink,#14102b)}.lm-doc h3{font-size:17px;margin:24px 0 8px;color:var(--ink,#14102b)}' +
    '.lm-doc strong{color:var(--ink,#14102b)}.lm-doc a{color:var(--violet,#5b21e6)}.lm-doc ul,.lm-doc ol{padding-left:22px}.lm-doc li{margin:4px 0}' +
    '.lm-doc hr{border:0;border-top:1px solid var(--line,#e6e1f5);margin:32px 0}' +
    '.lm-doc table{display:block;overflow-x:auto;width:100%;border-collapse:collapse;margin:16px 0;font-size:14.5px}' +
    '.lm-doc th,.lm-doc td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line,#e6e1f5);vertical-align:top}.lm-doc th{background:var(--surface-2,#f4f1fd);color:var(--ink,#14102b)}' +
    '.lm-status{text-align:center;color:var(--ink-3,#6f6a8a);padding:40px 0}' +
    '.lm-overlay[hidden]{display:none}body.lm-open{overflow:hidden}' +
    '@keyframes lm-fade{from{opacity:0}}@keyframes lm-rise{from{opacity:0;transform:translateY(10px) scale(.99)}}' +
    '@media (prefers-reduced-motion:reduce){.lm-overlay,.lm-dialog{animation:none}}';

  var es = (document.documentElement.lang || '').indexOf('es') === 0;
  var L = es
    ? { close: 'Cerrar', open: 'Abrir en otra pestaña', loading: 'Cargando…', failed: 'No se pudo cargar el documento. Abrilo en otra pestaña.' }
    : { close: 'Close', open: 'Open in new tab', loading: 'Loading…', failed: "Couldn't load this document. Open it in a new tab." };

  var overlay, body, title, openLink, lastFocus, cache = {};

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.className = 'lm-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="lm-dialog" role="dialog" aria-modal="true" aria-labelledby="lm-title">' +
      '<div class="lm-head"><b id="lm-title"></b><div><a class="lm-open" target="_blank" rel="noopener">' + L.open + ' ↗</a>' +
      '<button type="button" class="lm-close" aria-label="' + L.close + '">✕</button></div></div>' +
      '<div class="lm-body" tabindex="-1"><div class="lm-doc"></div></div></div>';
    document.body.appendChild(overlay);
    body = overlay.querySelector('.lm-doc');
    title = overlay.querySelector('#lm-title');
    openLink = overlay.querySelector('.lm-open');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.lm-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { // keep focus inside the dialog
        var f = overlay.querySelectorAll('a[href],button');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function show(path) {
    if (!overlay) build();
    if (overlay.hidden) lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('lm-open');
    openLink.href = path;
    title.textContent = '';
    body.innerHTML = '<p class="lm-status">' + L.loading + '</p>';
    overlay.querySelector('.lm-body').scrollTop = 0;
    overlay.querySelector('.lm-close').focus();
    (cache[path] ? Promise.resolve(cache[path]) : fetch(path).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) { cache[path] = t; return t; }))
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        var main = doc.querySelector('main');
        if (!main) throw new Error('no main');
        var h1 = main.querySelector('h1');
        title.textContent = h1 ? h1.textContent.replace(/^Northstack\s+/, '') : '';
        body.innerHTML = main.innerHTML;
      })
      .catch(function () { body.innerHTML = '<p class="lm-status">' + L.failed + '</p>'; });
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('lm-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin || !DOCS[url.pathname] || a.target === '_blank') return;
    e.preventDefault();
    show(url.pathname);
  });
})();
