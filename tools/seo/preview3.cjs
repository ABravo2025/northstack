// Preview set for the Artifact: the pass-2 module pages, self-contained (icon inlined, prices from a
// snapshot of /api/plans/prices, a floating page switcher). Never shipped.
const fs = require('fs');
const path = require('path');
const LANDING = process.env.LANDING || 'C:/tmp/ns-landing-seo/landing';
const HERE = __dirname;
const PV = HERE + '/preview3';
fs.mkdirSync(PV, { recursive: true });
const rd = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const SET = [  ['es/legajo-digital.html', 'index.html', 'Legajo ES'],  ['hr-software.html', 'hr-en.html', 'HR EN'],  ['es/seguimiento-de-nomina.html', 'nomina-es.html', 'Nómina ES'],  ['payroll-tracking-software.html', 'payroll-en.html', 'Payroll EN'],];
const MAP = Object.fromEntries(SET.map(([src, dst]) => ['/' + src.replace(/\.html$/, ''), dst]));

const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(LANDING + '/icon-color.svg').toString('base64');
const prices = fs.readFileSync(HERE + '/prices.json', 'utf8').trim();
const pricingJs = rd(LANDING + '/pricing.js')
  .replace(/var geo = fetch\([\s\S]*?\.catch\(fallbackMarket\);/, "var geo = Promise.resolve('ar');")
  .replace(/var prices = fetch\([\s\S]*?\n  \}\);/, 'var prices = Promise.resolve(' + prices + ');');
if (!pricingJs.includes("Promise.resolve('ar')") || !pricingJs.includes('Promise.resolve({')) throw new Error('pricing.js patch failed');

function switcher(cur) {
  const links = SET.map(([, f, l]) => `<a href="${f}"${f === cur ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  return `<div id="pv-switch" style="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:200;display:flex;flex-wrap:wrap;justify-content:center;gap:4px;max-width:calc(100% - 24px);padding:5px;border-radius:14px;background:rgba(20,16,43,.92);box-shadow:0 12px 30px -10px rgba(0,0,0,.5);font:600 12.5px/1 'Instrument Sans',system-ui,sans-serif"><span style="color:#b9b1d9;padding:8px 6px 8px 8px">Vista previa</span>${links}</div><style>#pv-switch a{color:#f1edff;text-decoration:none;padding:8px 10px;border-radius:9px}#pv-switch a:hover{background:rgba(255,255,255,.1)}#pv-switch a[aria-current]{background:#5b21e6;color:#fff}footer{padding-bottom:110px}</style>`;
}

function previewize(s, cur) {
  s = s.replace(/<script src="\/pricing\.js[^"]*" defer><\/script>\n?/, '<script>\n' + pricingJs + '\n</script>\n');
  s = s.replace(/<script src="\/legal-modal\.js" defer><\/script>\n?/, '');
  s = s.split('src="/icon-color.svg"').join('src="' + icon + '"');
  s = s.replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\n?/g, '');
  s = s.replace(/href="(\/[^"]*)"/g, (m, href) => {
    const [p, hash] = href.split('#');
    if (MAP[p]) return `href="${MAP[p]}${hash ? '#' + hash : ''}"`;
    return `href="https://joinnorthstack.com${href}" target="_blank" rel="noopener"`;
  });
  return s.replace('\n  </body>', '\n' + switcher(cur) + '\n  </body>');
}
// The artifact's main page is wrapped in its own document skeleton: head + body content only.
const bare = (doc) => doc.replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<\/head>\s*<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');

for (const [src, dst] of SET) {
  let s = previewize(rd(LANDING + '/' + src), dst);
  if (dst === 'index.html') s = bare(s);
  fs.writeFileSync(path.join(PV, dst), s);
}
console.log('preview ok', SET.map((x) => x[1]).join(', '));
