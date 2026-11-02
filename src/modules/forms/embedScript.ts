// Formularios y encuestas → embed.js (spec-clientes-gastos-formularios.md, B3). One script for the
// three ways to put a form on a website:
//
//   <script src="https://app.joinnorthstack.com/f/embed.js" data-form="acme/pedi-una-demo" async></script>
//     inline (default): the form appears where the script tag is, with automatic height.
//   data-style="button": a floating button in the bottom corner opens the form in a window.
//   data-style="popup":  a regular button where the tag is opens the form in a window.
//   data-label="Pedí una demo" sets the button text.
//
// The UTM parameters of the page the visitor is on travel into the form, so a campaign becomes the
// lead's source. Messages from the iframe are only trusted from Northstack's own origin.
export const EMBED_SCRIPT = String.raw`(function(){
  var me = document.currentScript;
  if (!me) return;
  var origin = new URL(me.src).origin;
  var key = me.getAttribute('data-form') || '';
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) { console.warn('Northstack: data-form must be "company/form"'); return; }
  var style = me.getAttribute('data-style') || 'inline';
  var label = me.getAttribute('data-label') || 'Contact us';
  var params = new URLSearchParams(window.location.search), utm = new URLSearchParams();
  ['utm_source','utm_medium','utm_campaign'].forEach(function(k){ var v = params.get(k); if (v) utm.set(k, v.slice(0, 100)); });
  utm.set('embed', '1');
  var src = origin + '/f/' + key + '?' + utm.toString();

  function frame(){
    var f = document.createElement('iframe');
    f.src = src; f.title = label; f.loading = 'lazy';
    f.setAttribute('allow', '');
    f.style.cssText = 'width:100%;border:0;display:block;min-height:420px;background:transparent';
    return f;
  }
  var frames = [];
  window.addEventListener('message', function(e){
    if (e.origin !== origin || !e.data || e.data.source !== 'northstack-form' || e.data.form !== key) return;
    var target = null;
    for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === e.source) target = frames[i];
    if (!target) return;
    if (e.data.event === 'height' && typeof e.data.height === 'number') target.style.height = Math.min(Math.max(e.data.height, 200), 6000) + 'px';
    if (e.data.event === 'redirect' && typeof e.data.url === 'string' && /^https:\/\//.test(e.data.url)) window.location.href = e.data.url;
  });

  if (style === 'inline') {
    var f = frame(); frames.push(f);
    me.parentNode.insertBefore(f, me.nextSibling);
    return;
  }

  var overlay = null;
  function open(){
    if (overlay) { overlay.style.display = 'flex'; return; }
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', label);
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(17,14,26,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:680px;max-height:90vh;overflow:auto;border-radius:14px;background:#fff';
    var close = document.createElement('button');
    close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
    close.style.cssText = 'position:absolute;top:6px;right:10px;z-index:1;border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#5c5872';
    var f = frame(); frames.push(f);
    box.appendChild(close); box.appendChild(f); overlay.appendChild(box); document.body.appendChild(overlay);
    function hide(){ overlay.style.display = 'none'; }
    close.addEventListener('click', hide);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) hide(); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && overlay.style.display !== 'none') hide(); });
  }
  var btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = label;
  btn.style.cssText = 'font:600 15px system-ui,-apple-system,sans-serif;background:#5b21e6;color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer;box-shadow:0 6px 20px rgba(91,33,230,.35)';
  btn.addEventListener('click', open);
  if (style === 'button') {
    btn.style.position = 'fixed'; btn.style.right = '20px'; btn.style.bottom = '20px'; btn.style.zIndex = '2147483645';
    (document.body || document.documentElement).appendChild(btn);
  } else {
    btn.style.borderRadius = '8px'; btn.style.boxShadow = 'none';
    me.parentNode.insertBefore(btn, me.nextSibling);
  }
})();`;
