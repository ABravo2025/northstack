// LinkedIn GIF recorder: drives the real app (local frontend :5173 + local backend on the STAGING DB,
// demo tenant "Acme Latam"), captures frames over CDP, and writes frames + timeline for make-gif.mjs.
//   node record-gif.mjs <turnos|proyectos|vacaciones> <es|en> [preview|record]
// Needs playwright (PW_DIR/node_modules) and the caption/cursor overlay from ../video/overlay.part.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.PW_DIR, 'x.js'));
const { chromium } = require('playwright');

const [mod, lang = 'es', mode = 'record'] = process.argv.slice(2);
const OUT = path.resolve(`frames-${mod}-${lang}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const token = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
const VIEW = { width: 1000, height: 1000 };
const es = lang === 'es';

const TXT = {
  turnos: es
    ? ['Arma la semana de todas tus sedes', 'Publícala con un clic', 'Ve quién confirmó y quién no', 'Turnos']
    : ['Plan the week across every location', 'Publish it in one click', 'See who confirmed and who didn’t', 'Shifts'],
  proyectos: es
    ? ['Todos tus clientes y su avance', 'Empieza desde la plantilla de tu rubro', 'Las tareas ya vienen repartidas por rol', 'Proyectos']
    : ['Every client and how far along it is', 'Start from your industry’s template', 'Tasks come already split by role', 'Projects'],
  vacaciones: es
    ? ['Cada persona ve su saldo', 'Cuenta días hábiles y feriados de tu país', 'Apruebas con un clic', 'Vacaciones']
    : ['Everyone sees their own balance', 'Counts business days and your holidays', 'Approve in one click', 'Time off'],
}[mod];

eval(fs.readFileSync('../video/overlay.part.mjs', 'utf8').replace('const OVERLAY =', 'globalThis.OVERLAY ='));

// The backend copies template names in the user's language, and some screens read it from the profile.
await fetch('http://localhost:3000/api/users/me/locale', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: lang }) });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
await ctx.addInitScript(([tk, lng]) => { localStorage.setItem('token', tk); localStorage.setItem('northstack-theme', 'light'); localStorage.setItem('i18nextLng', lng); }, [token, lang]);
await ctx.addInitScript(OVERLAY);
const p = await ctx.newPage();

const frames = [];
let cdp = null, n = 0;
async function startCapture() {
  cdp = await ctx.newCDPSession(p);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `${String(++n).padStart(5, '0')}.jpg`;
    fs.writeFileSync(`${OUT}/${file}`, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
}
const now = () => Date.now() / 1000;
const segs = []; let segStart = null, shot = 0;
const begin = async (name) => { segStart = now(); if (mode === 'preview') await p.screenshot({ path: `${OUT}/pv-${String(++shot).padStart(2, '0')}-${name}.png` }); };
const end = async () => { if (segStart !== null) segs.push([segStart, now()]); segStart = null; if (mode === 'preview') await p.screenshot({ path: `${OUT}/pv-${String(shot).padStart(2, '0')}-end.png` }); };
const wait = (ms) => p.waitForTimeout(mode === 'record' ? ms : Math.min(ms, 400));
const noSkeleton = () => p.waitForFunction(() => !document.querySelector('[class*="skeleton"], .animate-pulse'), null, { timeout: 60000 }).catch(() => {});
const ready = async (sel) => { if (sel) await p.waitForSelector(sel, { timeout: 60000 }).catch(() => console.log('not ready', sel)); await noSkeleton(); await p.waitForTimeout(700); };
const caption = (t) => p.evaluate((x) => window.__nsv.caption(x), t);
let mouse = { x: VIEW.width * 0.6, y: VIEW.height * 0.55 };
const moveTo = async (loc, steps = 28) => {
  const b = await loc.boundingBox().catch(() => null);
  if (!b) { console.log('no box for', String(loc)); return; }
  const x = b.x + Math.min(b.width / 2, 70), y = b.y + Math.min(b.height / 2, 40);
  await p.mouse.move(x, y, { steps });
  mouse = { x, y };
};
const press = async () => { await wait(200); await p.mouse.down(); await wait(100); await p.mouse.up(); };
const clickOn = async (loc) => { await moveTo(loc); await press(); };
const btn = (re) => p.getByRole('button', { name: re }).first();
const outro = async () => {
  await caption('');
  await p.evaluate((h) => window.__nsv.card('violet', h), `<div class="brand">{mark}Northstack</div><h1 style="color:#fff">${TXT[3]}</h1><div class="url">joinnorthstack.com</div>`);
  await wait(2600);
};

// ---- per-module flows ------------------------------------------------------------------------
const flows = {
  async turnos() {
    await p.goto('http://localhost:5173/shifts');
    await ready('.sh-toolbar');
    for (let i = 0; i < (es ? 1 : 2); i++) { await p.getByRole('button', { name: /semana siguiente|next week/i }).first().click(); await p.waitForTimeout(800); } // EN take uses the week after (seeded with WEEK=2026-10-26)
    await ready('.sh-block');
    await p.mouse.move(mouse.x, mouse.y);
    await startCapture();
    await begin('week');
    await caption(TXT[0]);
    await wait(900);
    await moveTo(p.locator('.sh-block:visible').nth(2), 30); await wait(700);
    await moveTo(p.locator('.sh-block:visible').nth(9), 30); await wait(900);
    await end();
    await begin('publish');
    await caption(TXT[1]);
    await clickOn(btn(/^(Publicar|Publish) \d/));
    await wait(900);
    if (mode === 'record') await clickOn(p.locator('[role="dialog"], .modal, .confirm-dialog').last().getByRole('button', { name: /^(Publicar|Publish) \d/ }));
    else await p.getByRole('button', { name: /^(Cancelar|Cancel)$/ }).last().click();
    await wait(1600);
    await end();
    await begin('detail');
    await caption(TXT[2]);
    await clickOn(p.locator('.sh-block:visible', { hasText: /Casey|Martina/ }).first());
    await wait(2600);
    await end();
    await begin('outro');
    await outro();
    await end();
  },

  async proyectos() {
    await p.goto('http://localhost:5173/projects');
    await ready('table tbody tr');
    await p.mouse.move(mouse.x, mouse.y);
    await startCapture();
    await begin('list');
    await caption(TXT[0]);
    await wait(700);
    await moveTo(p.locator('table tbody tr').nth(0), 30); await wait(600);
    await moveTo(p.locator('table tbody tr').nth(2), 30); await wait(800);
    await end();
    await begin('new');
    await caption(TXT[1]);
    await clickOn(p.getByText(/Agregar proyecto|Add project/).last());
    await wait(500);
    await end(); // template grid loads off camera
    await p.getByRole('dialog').getByRole('button', { name: /^(Cierre mensual|Monthly close)$/ }).first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(400);
    await begin('pick');
    await clickOn(p.getByRole('dialog').getByRole('button', { name: /^(Estudios contables|Accounting)/ }).first());
    await wait(700);
    await clickOn(p.getByRole('dialog').getByRole('button', { name: /^(Cierre mensual|Monthly close)$/ }).first());
    await wait(700);
    await clickOn(p.getByRole('dialog').getByRole('button', { name: /^(Continuar|Continue)$/ }));
    await wait(300);
    await end(); // template details load off camera
    await p.waitForSelector('#tpl-role-0', { timeout: 60000 });
    // Dev mode (StrictMode) fetches the template twice; the second answer resets the role pickers.
    await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await begin('preview');
    await wait(400);
    // Fill the roles (Assistant, Accountant, Partner) so the preview shows real names, not warnings.
    for (const [i, who] of [[0, 'Camila Ortiz'], [1, 'Mateo Silva'], [2, 'Laura Méndez']]) {
      const sel = p.locator(`#tpl-role-${i}`);
      await moveTo(sel, 16); await wait(300);
      const value = await sel.evaluate((el, w) => [...el.options].find((o) => o.textContent.includes(w))?.value, who);
      if (value) await sel.selectOption(value);
      await p.waitForTimeout(800);
    }
    await caption(TXT[2]);
    await p.mouse.move(mouse.x + 300, mouse.y + 200, { steps: 20 });
    await p.mouse.wheel(0, 420); await wait(1800);
    await end();
    await begin('outro');
    await outro();
    await end();
  },

  async vacaciones() {
    await p.goto('http://localhost:5173/hr/time-off');
    await ready('.ghost-row-inner');
    await p.waitForSelector('text=/disponibles|available/', { timeout: 60000 }).catch(() => console.log('balances not visible'));
    await noSkeleton(); await p.waitForTimeout(600);
    await p.mouse.move(mouse.x, mouse.y);
    await startCapture();
    await begin('balances');
    await caption(TXT[0]);
    await wait(700);
    await moveTo(p.locator('text=/disponibles|available/').first(), 30); await wait(1300);
    await end();
    await begin('request');
    await caption(TXT[1]);
    await clickOn(p.locator('.ghost-row-inner').first());
    await wait(900);
    const start = p.locator('#time-off-request-start'), endD = p.locator('#time-off-request-end');
    await moveTo(start, 20); await press(); await start.fill('2026-12-21'); await wait(400);
    await moveTo(endD, 20); await press(); await endD.fill('2026-12-29');
    await wait(300);
    await end(); // the day count is computed by the server, off camera
    await p.waitForFunction(() => { const s = document.querySelector('.to-facts strong'); return s && !s.textContent.includes('…') && s.textContent.trim() !== '—'; }, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(300);
    await begin('facts');
    await moveTo(p.locator('.to-facts').first(), 24); await wait(1500);
    await p.mouse.move(mouse.x, mouse.y + 110, { steps: 20 }); await wait(1200);
    await end();
    await clickOn(btn(/^(Cancel|Cancelar)$/));
    await p.locator('.sidebar-link', { hasText: /Equipo|Team/ }).first().click();
    await ready('button:has-text("Aprobar"), button:has-text("Approve")');
    await begin('approve');
    await caption(TXT[2]);
    await moveTo(btn(/^(Approve|Aprobar)/), 30); await wait(600);
    if (mode === 'record') await press();
    await wait(1700);
    await end();
    await begin('outro');
    await outro();
    await end();
  },
};

await flows[mod]();
await cdp?.send('Page.stopScreencast').catch(() => {});
fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ frames, segs, size: [VIEW.width, VIEW.height] }));
await browser.close();
console.log('done', mod, lang, mode, 'frames', frames.length, 'segments', segs.map(([a, b]) => (b - a).toFixed(1)).join(' + '));
