import type { QuoteLine } from './quoteService.js';
import { escapeHtml } from '../forms/publicFormPage.js';

// Cruces D3: the client's page for a quote (/f/q/<token>) — server-rendered like the public forms,
// with its own CSP (nonce-only script and style, never framed). Accept with a typed name, or decline.

const COPY = {
  es: {
    title: 'Presupuesto',
    for: 'Para',
    valid: 'Válido hasta',
    qty: 'Cant.',
    price: 'Precio',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    monthly: '/mes',
    yearly: '/año',
    notes: 'Notas',
    pdf: 'Descargar PDF',
    name: 'Tu nombre y apellido',
    accept: 'Aceptar presupuesto',
    decline: 'Rechazar',
    reason: 'Motivo (opcional)',
    confirmDecline: 'Confirmar rechazo',
    accepted: '¡Gracias! Aceptaste el presupuesto. {{company}} se va a poner en contacto.',
    declined: 'Listo, registramos que no lo aceptás. Gracias por avisar.',
    closedAccepted: 'Este presupuesto ya fue aceptado.',
    closedDeclined: 'Este presupuesto fue rechazado.',
    expired: 'Este presupuesto venció. Pedí uno nuevo.',
    failed: 'No se pudo enviar. Probá de nuevo.',
    notFound: 'Este presupuesto no está disponible.',
  },
  en: {
    title: 'Quote',
    for: 'For',
    valid: 'Valid until',
    qty: 'Qty',
    price: 'Price',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    monthly: '/month',
    yearly: '/year',
    notes: 'Notes',
    pdf: 'Download PDF',
    name: 'Your full name',
    accept: 'Accept quote',
    decline: 'Decline',
    reason: 'Reason (optional)',
    confirmDecline: 'Confirm decline',
    accepted: 'Thank you! You accepted the quote. {{company}} will be in touch.',
    declined: "Done, we've recorded that you're declining. Thanks for letting us know.",
    closedAccepted: 'This quote was already accepted.',
    closedDeclined: 'This quote was declined.',
    expired: 'This quote expired. Ask for a new one.',
    failed: "Couldn't send. Please try again.",
    notFound: 'This quote is not available.',
  },
};
export type QuoteLang = keyof typeof COPY;

const STYLE = `*{box-sizing:border-box}body{margin:0;background:#f3f2f8;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1733}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px}.sheet{background:#fff;border:1px solid #e3e0ee;border-radius:14px;padding:26px;display:flex;flex-direction:column;gap:16px}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px}.head img{max-height:40px;max-width:140px;object-fit:contain}
h1{font-size:20px;margin:0}.muted{color:#58536f;font-size:14px}table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:#58536f;font-weight:600;border-bottom:1px solid #e3e0ee;padding:8px 6px}td{padding:8px 6px;border-bottom:1px solid #f0eef6}
.r{text-align:right;white-space:nowrap}.tot td{border:0;font-weight:700;font-size:16px}.notes{white-space:pre-line;font-size:14px;color:#58536f}
.actions{display:flex;flex-direction:column;gap:10px;border-top:1px solid #e3e0ee;padding-top:16px}input,textarea{font:inherit;font-size:15px;padding:10px 12px;border:1px solid #d6d2e4;border-radius:8px;width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;font-weight:600;font-size:15px;border-radius:8px;padding:11px 20px;cursor:pointer;border:1px solid #d6d2e4;background:#fff;color:#1b1733}
button.primary{background:#5b21e6;border-color:#5b21e6;color:#fff}button[disabled]{opacity:.6}a{color:#5b21e6}.done{font-size:16px;line-height:1.5}.bad{color:#b42318;font-size:14px}`;

export function quoteCsp(nonce: string) {
  return ["default-src 'none'", `script-src 'nonce-${nonce}'`, `style-src 'nonce-${nonce}'`, "img-src 'self' data:", "connect-src 'self'", "form-action 'none'", "base-uri 'none'", "frame-ancestors 'none'"].join('; ');
}

export function renderQuotePage(p: {
  nonce: string;
  lang: QuoteLang;
  token: string;
  number: number;
  companyName: string;
  tenantName: string;
  dealName: string;
  logoUrl: string | null;
  lines: QuoteLine[];
  subtotalCents: number;
  discountPct: number;
  totalCents: number;
  notes: string | null;
  validUntil: string;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
  money: (cents: number) => string;
}) {
  const c = COPY[p.lang];
  const suffix = (b: string) => (b === 'monthly' ? c.monthly : b === 'yearly' ? c.yearly : '');
  const rows = p.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}${l.description ? `<div class="muted">${escapeHtml(l.description)}</div>` : ''}</td><td class="r">${l.quantity}</td><td class="r">${escapeHtml(p.money(l.unitPriceCents))}${suffix(l.billing)}</td><td class="r">${escapeHtml(p.money(l.unitPriceCents * l.quantity))}${suffix(l.billing)}</td></tr>`,
    )
    .join('');
  const discount = p.discountPct
    ? `<tr><td colspan="3" class="r">${c.subtotal}</td><td class="r">${escapeHtml(p.money(p.subtotalCents))}</td></tr><tr><td colspan="3" class="r">${c.discount} (${p.discountPct}%)</td><td class="r">- ${escapeHtml(p.money(p.subtotalCents - p.totalCents))}</td></tr>`
    : '';
  const closed =
    p.status === 'accepted' ? c.closedAccepted : p.status === 'declined' ? c.closedDeclined : p.status === 'expired' ? c.expired : null;
  const actions = closed
    ? `<p class="done">${closed}</p>`
    : `<div class="actions" id="actions">
<label class="muted" for="name">${c.name}</label><input id="name" maxlength="200" autocomplete="name">
<div class="row"><button type="button" class="primary" id="accept">${c.accept}</button><button type="button" id="decline">${c.decline}</button></div>
<div id="declineBox" hidden><label class="muted" for="reason">${c.reason}</label><textarea id="reason" rows="2" maxlength="1000"></textarea><div class="row"><button type="button" id="confirmDecline">${c.confirmDecline}</button></div></div>
<p class="bad" id="err" role="alert"></p></div>`;
  const cfg = JSON.stringify({ action: `/api/public/quotes/${p.token}`, accepted: c.accepted.replace('{{company}}', p.tenantName), declined: c.declined, failed: c.failed }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${c.title} #${p.number}</title><style nonce="${p.nonce}">${STYLE}</style></head><body><main class="wrap"><div class="sheet">
<div class="head"><div><h1>${c.title} #${p.number}</h1><div class="muted">${c.for}: ${escapeHtml(p.companyName)} · ${escapeHtml(p.dealName)}</div><div class="muted">${c.valid}: ${escapeHtml(p.validUntil)}</div></div>${p.logoUrl ? `<img src="${escapeHtml(p.logoUrl)}" alt="">` : `<strong>${escapeHtml(p.tenantName)}</strong>`}</div>
<table><thead><tr><th></th><th class="r">${c.qty}</th><th class="r">${c.price}</th><th class="r">${c.total}</th></tr></thead><tbody>${rows}${discount}<tr class="tot"><td colspan="3" class="r">${c.total}</td><td class="r">${escapeHtml(p.money(p.totalCents))}</td></tr></tbody></table>
${p.notes ? `<div><strong>${c.notes}</strong><div class="notes">${escapeHtml(p.notes)}</div></div>` : ''}
<a href="/api/public/quotes/${p.token}/pdf">${c.pdf}</a>
${actions}
</div></main>
<script id="cfg" type="application/json" nonce="${p.nonce}">${cfg}</script>
<script nonce="${p.nonce}">(function(){var cfg=JSON.parse(document.getElementById('cfg').textContent);var box=document.getElementById('actions');if(!box)return;var err=document.getElementById('err');
function send(body){Array.prototype.forEach.call(box.querySelectorAll('button'),function(b){b.disabled=true;});err.textContent='';
fetch(cfg.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return{};}).then(function(b){return{ok:r.ok,b:b};});}).then(function(res){
if(res.ok){box.innerHTML='<p class="done"></p>';box.firstChild.textContent=body.accept?cfg.accepted:cfg.declined;return;}err.textContent=res.b.error||cfg.failed;Array.prototype.forEach.call(box.querySelectorAll('button'),function(b){b.disabled=false;});}).catch(function(){err.textContent=cfg.failed;Array.prototype.forEach.call(box.querySelectorAll('button'),function(b){b.disabled=false;});});}
document.getElementById('accept').addEventListener('click',function(){var n=document.getElementById('name').value.trim();if(!n){document.getElementById('name').focus();return;}send({accept:true,name:n});});
document.getElementById('decline').addEventListener('click',function(){document.getElementById('declineBox').hidden=false;});
document.getElementById('confirmDecline').addEventListener('click',function(){send({accept:false,name:document.getElementById('name').value.trim(),reason:document.getElementById('reason').value.trim()});});})();</script>
</body></html>`;
}

export function renderQuoteNotFound(nonce: string, lang: QuoteLang) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404</title><style nonce="${nonce}">${STYLE}</style></head><body><main class="wrap"><div class="sheet"><p class="done">${COPY[lang].notFound}</p></div></main></body></html>`;
}
