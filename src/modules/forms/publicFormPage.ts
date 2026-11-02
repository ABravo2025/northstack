import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FormQuestion } from './formDefinitions.js';

// Formularios y encuestas → public page (spec-clientes-gastos-formularios.md, B3). Rendered on the
// server as one small self-contained HTML document, not the SPA, so each form can send its own
// Content-Security-Policy (frame-ancestors = the form's allowed domains) and nothing else of the
// app loads on a page strangers open. Every piece of tenant text is HTML-escaped; the inline
// script and style run under a per-response nonce.

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// JSON inside a <script> block: "</script>" and U+2028/2029 can't break out of it.
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// --- Anti-spam: a signed "rendered at" stamp. A submission needs one at least MIN_FILL_MS old and
// at most MAX_AGE_MS old, so a bot that posts without loading the page (or instantly) is refused.
export const MIN_FILL_MS = 3_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function stampKey(): Buffer {
  const raw = process.env.FORMS_DATA_ENCRYPTION_KEY ?? '';
  return createHmac('sha256', Buffer.from(raw, 'hex')).update('form-render-stamp/v1').digest();
}

export function renderStamp(formId: string, now = Date.now()): string {
  const sig = createHmac('sha256', stampKey()).update(`${formId}:${now}`).digest('base64url');
  return `${now}.${sig}`;
}

export function checkStamp(formId: string, stamp: unknown, now = Date.now()): 'ok' | 'too_fast' | 'invalid' {
  if (typeof stamp !== 'string') return 'invalid';
  const [ts, sig] = stamp.split('.');
  const issued = Number(ts);
  if (!Number.isSafeInteger(issued) || !sig) return 'invalid';
  const expected = createHmac('sha256', stampKey()).update(`${formId}:${issued}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'invalid';
  if (now - issued > MAX_AGE_MS || issued > now + 60_000) return 'invalid';
  return now - issued < MIN_FILL_MS ? 'too_fast' : 'ok';
}

// --- CSP ------------------------------------------------------------------------------------------

// Empty list = embeddable anywhere (the prototype's "Vacío = cualquier web"); otherwise only on the
// listed hosts. sanitizeDomains (formService.ts) already guarantees plain hostnames.
// null = never framed (personal links, error pages).
export function frameAncestors(allowedDomains: string[] | null): string {
  if (allowedDomains === null) return "frame-ancestors 'none'";
  if (!allowedDomains.length) return "frame-ancestors 'self' https:";
  return `frame-ancestors 'self' ${allowedDomains.map((d) => `https://${d}`).join(' ')}`;
}

export function pageCsp(nonce: string, allowedDomains: string[] | null): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'none'",
    "base-uri 'none'",
    frameAncestors(allowedDomains),
  ].join('; ');
}

export function newNonce(): string {
  return randomBytes(16).toString('base64');
}

// --- Copy -------------------------------------------------------------------------------------------

const COPY = {
  es: {
    send: 'Enviar',
    sending: 'Enviando…',
    thanks: '¡Gracias! Recibimos tu respuesta.',
    required: 'Completá este campo.',
    invalid: 'Revisá este campo.',
    failed: 'No se pudo enviar. Probá de nuevo en un momento.',
    tooFast: 'Esperá unos segundos y volvé a enviar.',
    yes: 'Sí',
    no: 'No',
    npsLow: '0 = nada probable',
    npsHigh: '10 = muy probable',
    csatLow: '1 = muy insatisfecho',
    csatHigh: '5 = muy satisfecho',
    notFound: 'Este formulario no está disponible.',
    poweredBy: 'Hecho con Northstack',
    honeypot: 'No completes este campo',
    hello: 'Hola, {{name}}.',
    anonymous: 'Es anónima: tu nombre no se guarda con la respuesta.',
    answered: 'Ya respondiste esto. ¡Gracias!',
    expired: 'Este link venció. Pedile a la empresa que te lo vuelva a enviar.',
  },
  en: {
    send: 'Submit',
    sending: 'Sending…',
    thanks: 'Thanks! We got your response.',
    required: 'Please fill in this field.',
    invalid: 'Please check this field.',
    failed: "Couldn't send. Please try again in a moment.",
    tooFast: 'Please wait a few seconds and submit again.',
    yes: 'Yes',
    no: 'No',
    npsLow: '0 = not at all likely',
    npsHigh: '10 = extremely likely',
    csatLow: '1 = very dissatisfied',
    csatHigh: '5 = very satisfied',
    notFound: 'This form is not available.',
    poweredBy: 'Made with Northstack',
    honeypot: 'Leave this field empty',
    hello: 'Hi {{name}}.',
    anonymous: "It's anonymous: your name isn't stored with your answer.",
    answered: 'You already answered this. Thank you!',
    expired: 'This link expired. Ask the company to send it again.',
  },
};
export type PageLang = keyof typeof COPY;

export function pickLang(acceptLanguage: string | undefined, country: string | null): PageLang {
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('es')) return 'es';
  if (first.startsWith('en')) return 'en';
  return country && ['AR', 'UY', 'CL', 'MX', 'CO', 'PE', 'ES', 'PY', 'BO', 'EC', 'VE'].includes(country) ? 'es' : 'en';
}

const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;background:transparent;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1a2b}
.wrap{max-width:640px;margin:0 auto;padding:24px 20px}
.sheet{background:#fff;border:1px solid #e9e6f2;border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:18px}
.head{display:flex;align-items:center;gap:10px}
.head img{width:32px;height:32px;border-radius:6px;object-fit:contain}
h1{font-size:20px;margin:0}
.intro{margin:0;color:#5c5872;font-size:14px;white-space:pre-line}
.q{display:flex;flex-direction:column;gap:6px;border:0;margin:0;padding:0;min-width:0}
.q legend,.q label.l{font-size:14px;font-weight:600;padding:0}
.req{color:#b42318}
.help{font-size:12px;color:#5c5872}
input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border:1px solid #d6d2e4;border-radius:8px;background:#fff;color:inherit}
textarea{min-height:96px;resize:vertical}
input:focus,textarea:focus,.opt:focus-within{outline:2px solid #5b21e6;outline-offset:1px}
.opts{display:flex;flex-wrap:wrap;gap:6px}
.opt{position:relative;display:inline-flex;align-items:center;gap:6px;border:1px solid #d6d2e4;border-radius:8px;padding:8px 12px;font-size:14px;cursor:pointer}
.opt input{margin:0}
.opt.scale{min-width:40px;justify-content:center;padding:8px 6px}
.opt.scale input{position:absolute;opacity:0;width:1px;height:1px}
.opt:has(input:checked){border-color:#5b21e6;background:#5b21e6;color:#fff}
.opt:not(.scale):has(input:checked){background:#f1ebff;color:#3b0fa8}
.err{font-size:12px;color:#b42318;min-height:0}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
button.send{align-self:flex-start;font:inherit;font-weight:600;font-size:15px;background:#5b21e6;color:#fff;border:0;border-radius:8px;padding:11px 22px;cursor:pointer}
button.send[disabled]{opacity:.6;cursor:default}
.status{font-size:14px}
.status.bad{color:#b42318}
.done{font-size:16px;line-height:1.5;white-space:pre-line}
.foot{font-size:11px;color:#8f8aa8;text-align:center;margin-top:10px}
@media (prefers-color-scheme:dark){html:not(.embed),html:not(.embed) body,html:not(.embed) body{color:#edebf6}html:not(.embed) .sheet{background:#191624;border-color:#2b2740}html:not(.embed) .intro,html:not(.embed) .help{color:#aba6c2}html:not(.embed) input[type=text],html:not(.embed) input[type=email],html:not(.embed) input[type=tel],html:not(.embed) input[type=number],html:not(.embed) input[type=date],html:not(.embed) textarea{background:#110e1a;border-color:#2b2740}html:not(.embed) .opt{border-color:#2b2740}html:not(.embed) .opt:not(.scale):has(input:checked){background:#2a1f4d;color:#d9ccff}}
`;

function questionHtml(q: FormQuestion, lang: PageLang): string {
  const c = COPY[lang];
  const id = `q_${escapeHtml(q.id)}`;
  const star = q.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const help = q.help ? `<span class="help">${escapeHtml(q.help)}</span>` : '';
  const err = `<span class="err" id="${id}_err" role="alert"></span>`;
  const req = q.required ? ' required aria-required="true"' : '';
  const choice = (type: 'radio' | 'checkbox', values: { v: string; label: string }[], cls = '') =>
    `<fieldset class="q" data-q="${escapeHtml(q.id)}" data-type="${q.type}"><legend>${escapeHtml(q.label)}${star}</legend>${help}<div class="opts">${values
      .map((o) => `<label class="opt ${cls}"><input type="${type}" name="${id}" value="${escapeHtml(o.v)}">${escapeHtml(o.label)}</label>`)
      .join('')}</div>${err}</fieldset>`;
  switch (q.type) {
    case 'select':
      return choice('radio', (q.options ?? []).map((o) => ({ v: o, label: o })));
    case 'multi_select':
      return choice('checkbox', (q.options ?? []).map((o) => ({ v: o, label: o })));
    case 'yes_no':
      return choice('radio', [
        { v: 'true', label: c.yes },
        { v: 'false', label: c.no },
      ]);
    case 'rating_nps':
    case 'rating_csat': {
      const [min, max] = q.type === 'rating_nps' ? [0, 10] : [1, 5];
      const values = Array.from({ length: max - min + 1 }, (_, i) => String(min + i)).map((v) => ({ v, label: v }));
      const hint = q.type === 'rating_nps' ? `${c.npsLow} · ${c.npsHigh}` : `${c.csatLow} · ${c.csatHigh}`;
      return choice('radio', values, 'scale').replace('</div><span class="err"', `</div><span class="help">${escapeHtml(hint)}</span><span class="err"`);
    }
    case 'long_text':
      return `<div class="q" data-q="${escapeHtml(q.id)}" data-type="${q.type}"><label class="l" for="${id}">${escapeHtml(q.label)}${star}</label>${help}<textarea id="${id}" maxlength="5000"${req}></textarea>${err}</div>`;
    default: {
      const type = q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text';
      const extra = q.type === 'email' ? ' autocomplete="email"' : q.type === 'phone' ? ' autocomplete="tel"' : '';
      return `<div class="q" data-q="${escapeHtml(q.id)}" data-type="${q.type}"><label class="l" for="${id}">${escapeHtml(q.label)}${star}</label>${help}<input id="${id}" type="${type}" maxlength="500"${extra}${req}>${err}</div>`;
    }
  }
}

// The browser side: collects answers by question type, posts JSON, reports its height to the
// embedding page and, after submitting, either shows the thank-you text or asks the parent page
// (or itself, when not embedded) to go to the redirect URL.
const SCRIPT = `
(function(){
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var form = document.getElementById('f');
  var embedded = window.parent !== window;
  function post(msg){ if (embedded) window.parent.postMessage(Object.assign({ source: 'northstack-form', form: cfg.key }, msg), '*'); }
  function height(){ post({ event: 'height', height: document.documentElement.scrollHeight }); }
  if (window.ResizeObserver) new ResizeObserver(height).observe(document.body); else setInterval(height, 500);
  height();
  function val(el){
    var type = el.getAttribute('data-type'), id = el.getAttribute('data-q');
    if (type === 'multi_select') return Array.prototype.map.call(el.querySelectorAll('input:checked'), function(i){ return i.value; });
    if (type === 'select' || type === 'yes_no' || type === 'rating_nps' || type === 'rating_csat') {
      var c = el.querySelector('input:checked'); if (!c) return null;
      if (type === 'yes_no') return c.value === 'true';
      if (type === 'select') return c.value;
      return Number(c.value);
    }
    var input = el.querySelector('input,textarea'); return input && input.value.trim() !== '' ? input.value.trim() : null;
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var answers = {}, missing = null;
    Array.prototype.forEach.call(form.querySelectorAll('[data-q]'), function(el){
      var id = el.getAttribute('data-q'), v = val(el), err = document.getElementById('q_' + id + '_err');
      if (err) err.textContent = '';
      var empty = v === null || (Array.isArray(v) && !v.length);
      if (empty && cfg.required.indexOf(id) >= 0) { if (err) err.textContent = cfg.copy.required; if (!missing) missing = el; }
      if (!empty) answers[id] = v;
    });
    if (missing) { var f = missing.querySelector('input,textarea'); if (f) f.focus(); return; }
    var btn = form.querySelector('button.send'), status = document.getElementById('status');
    btn.disabled = true; btn.textContent = cfg.copy.sending; status.textContent = ''; status.className = 'status';
    fetch(cfg.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      answers: answers, stamp: cfg.stamp, website: document.getElementById('hp').value, embed: embedded, utm: cfg.utm
    }) }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(b){ return { ok: r.ok, body: b }; }); })
    .then(function(res){
      if (res.ok) {
        post({ event: 'submitted' });
        if (res.body.redirectUrl) { if (embedded) post({ event: 'redirect', url: res.body.redirectUrl }); else window.location.href = res.body.redirectUrl; return; }
        form.outerHTML = '<p class="done" role="status"></p>';
        document.querySelector('.done').textContent = res.body.message || cfg.copy.thanks;
        height(); return;
      }
      var code = res.body.code || '';
      if (code.indexOf('invalid_answer:') === 0) {
        var qid = code.slice(15), e2 = document.getElementById('q_' + qid + '_err'); if (e2) e2.textContent = cfg.copy.invalid;
      }
      status.textContent = code === 'too_fast' ? cfg.copy.tooFast : code.indexOf('invalid_answer:') === 0 ? '' : (res.body.error || cfg.copy.failed);
      status.className = 'status bad'; btn.disabled = false; btn.textContent = cfg.copy.send;
    }).catch(function(){ status.textContent = cfg.copy.failed; status.className = 'status bad'; btn.disabled = false; btn.textContent = cfg.copy.send; });
  });
})();
`;

export interface PageInput {
  nonce: string;
  lang: PageLang;
  key: string; // "<tenantSlug>/<formSlug>"
  name: string;
  description: string | null;
  questions: FormQuestion[];
  logoUrl: string | null;
  action: string;
  stamp: string;
  utm: Record<string, string>;
  // Opened inside a company's website: always light, whatever the visitor's OS theme, so the form
  // matches the page around it. The direct link follows the OS theme.
  embedded?: boolean;
  // Personal links: "Hola, Ana" and, on anonymous surveys, a note that the name isn't stored.
  greeting?: string | null;
  anonymous?: boolean;
}

export function renderFormPage(p: PageInput): string {
  const c = COPY[p.lang];
  const cfg = {
    key: p.key,
    action: p.action,
    stamp: p.stamp,
    utm: p.utm,
    required: p.questions.filter((q) => q.required).map((q) => q.id),
    copy: { required: c.required, invalid: c.invalid, failed: c.failed, tooFast: c.tooFast, thanks: c.thanks, send: c.send, sending: c.sending },
  };
  return `<!doctype html>
<html lang="${p.lang}"${p.embedded ? ' class="embed"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(p.name)}</title><style nonce="${p.nonce}">${STYLE}</style></head>
<body><main class="wrap"><div class="sheet">
<div class="head">${p.logoUrl ? `<img src="${escapeHtml(p.logoUrl)}" alt="">` : ''}<h1>${escapeHtml(p.name)}</h1></div>
${p.greeting ? `<p class="intro">${escapeHtml(COPY[p.lang].hello.replace('{{name}}', p.greeting))}</p>` : ''}
${p.description ? `<p class="intro">${escapeHtml(p.description)}</p>` : ''}
${p.anonymous ? `<p class="help">${COPY[p.lang].anonymous}</p>` : ''}
<form id="f" novalidate>
${p.questions.map((q) => questionHtml(q, p.lang)).join('\n')}
<div class="hp" aria-hidden="true"><label for="hp">${c.honeypot}</label><input id="hp" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<p id="status" class="status" role="status"></p>
<button class="send" type="submit">${c.send}</button>
</form></div><p class="foot">${c.poweredBy}</p></main>
<script id="cfg" type="application/json" nonce="${p.nonce}">${scriptJson(cfg)}</script>
<script nonce="${p.nonce}">${SCRIPT}</script>
</body></html>`;
}

export function renderNotFoundPage(nonce: string, lang: PageLang): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>404</title><style nonce="${nonce}">${STYLE}</style></head><body><main class="wrap"><div class="sheet"><p class="done">${COPY[lang].notFound}</p></div></main></body></html>`;
}

export function renderNoticePage(nonce: string, lang: PageLang, notice: 'answered' | 'expired'): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Northstack</title><style nonce="${nonce}">${STYLE}</style></head><body><main class="wrap"><div class="sheet"><p class="done">${COPY[lang][notice]}</p></div></main></body></html>`;
}
