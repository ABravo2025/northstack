// v2 recorder: captures frames straight from Chrome (CDP screencast) at the final resolution — no gray
// padding, sharper than Playwright's recordVideo — and navigates with real clicks on the menu.
//   node video-record2.mjs preview|record es|en square|wide
// Writes ../video/frames-<lang>-<format>/ + timeline.json (frame timestamps + segments) for assemble2.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [mode = 'preview', lang = 'es', format = 'square'] = process.argv.slice(2);
const OUT = `../video/frames-${lang}-${format}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const token = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
const VIEW = format === 'square' ? { width: 900, height: 900 } : { width: 1440, height: 810 };
const DPR = format === 'square' ? 1.2 : 4 / 3; // → 1080×1080 or 1920×1080 device pixels

eval(fs.readFileSync('txt.part.mjs', 'utf8').replace('const TXT =', 'globalThis.TXT ='));
eval(fs.readFileSync('overlay.part.mjs', 'utf8').replace('const OVERLAY =', 'globalThis.OVERLAY ='));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
await ctx.addInitScript(([tk, lng]) => { localStorage.setItem('token', tk); localStorage.setItem('northstack-theme', 'light'); localStorage.setItem('i18nextLng', lng); }, [token, lang]);
await ctx.addInitScript(OVERLAY);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

// ---- frame capture
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(VIEW.width * DPR), maxHeight: Math.round(VIEW.height * DPR), everyNthFrame: 1 });
}

const now = () => Date.now() / 1000;
const segs = []; let segStart = null;
let shot = 0;
const begin = async (name) => {
  segStart = now();
  if (mode === 'preview') await p.screenshot({ path: `../video/pv-${lang}-${format}-${String(++shot).padStart(2, '0')}-${name}.png` });
};
const end = () => { if (segStart !== null) segs.push([segStart, now()]); segStart = null; };
const wait = (ms) => p.waitForTimeout(mode === 'record' ? ms : Math.min(ms, 400));
const noSkeleton = () => p.waitForFunction(() => !document.querySelector('[class*="skeleton"]'), null, { timeout: 40000 }).catch(() => {});
const ready = async (sel) => { if (sel) await p.waitForSelector(sel, { timeout: 40000 }).catch(() => console.log('not ready', sel)); await noSkeleton(); await p.waitForTimeout(600); };
const caption = (t) => p.evaluate((x) => window.__nsv.caption(x), t);
let mouse = { x: VIEW.width * 0.6, y: VIEW.height * 0.5 };
const moveTo = async (loc, steps = 32) => {
  const b = await loc.boundingBox();
  if (!b) { console.log('no box for', String(loc)); return mouse; }
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
  await p.mouse.move(x, y, { steps });
  mouse = { x, y };
  return mouse;
};
const press = async () => { await wait(220); await p.mouse.down(); await wait(110); await p.mouse.up(); };
const clickOn = async (loc) => { await moveTo(loc); await press(); };
const side = (re) => p.locator('.sidebar .sidebar-link', { hasText: re }).first();

// ---- warm up (not captured)
await p.goto('http://localhost:5173/overview');
await ready('.sidebar');
await p.mouse.move(mouse.x, mouse.y);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1500);
await startCapture();
await p.waitForTimeout(400);

// 0 · Intro card
await begin('intro');
await p.evaluate((h) => window.__nsv.card('light', h), `<div class="brand">{mark}Northstack</div><h1>${TXT.introTitle}</h1><p>${TXT.introSub}</p>`);
await wait(3000);
await p.evaluate(() => window.__nsv.hideCard());
await wait(800);

// 1 · Overview, then click "People"
await caption(TXT.overview);
await wait(1200);
await moveTo(p.locator('.kpi-card, .card, [class*="stat"]').first(), 40);
await wait(1600);
await clickOn(side(/People|Personas/));
end();

// 2 · People
await ready('table tbody tr:has-text("Lucía Fernández")');
await caption(TXT.people);
await p.waitForTimeout(550);
await begin('people');
await wait(800);
await moveTo(p.locator('table tbody tr').nth(1).locator('td').first(), 40);
await wait(700);
await p.mouse.wheel(0, 240); await wait(1100);
await moveTo(p.locator('table tbody tr', { hasText: 'Tomás Herrera' }).first().locator('td').first(), 30);
await wait(1500);
await clickOn(side(/Time Off|Ausencias/));
end();

// 3 · Time Off: request preview
await ready('.ghost-row-inner');
await p.waitForSelector('text=/disponibles|available/', { timeout: 40000 }).catch(() => console.log('balances not visible'));
await noSkeleton(); await p.waitForTimeout(500);
await caption(TXT.timeoff);
await p.waitForTimeout(550);
await begin('timeoff');
await wait(1200);
await clickOn(p.locator('.ghost-row-inner').first());
await wait(900);
const start = p.locator('#time-off-request-start'), endD = p.locator('#time-off-request-end');
await moveTo(start, 24); await press(); await start.fill('2026-10-09'); await wait(500);
await moveTo(endD, 24); await press(); await endD.fill('2026-10-16');
end();
await p.waitForFunction(() => { const s = document.querySelector('.to-facts strong'); return s && !s.textContent.includes('…') && s.textContent.trim() !== '—'; }, null, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(300);
await begin('timeoff-preview');
await moveTo(p.locator('.to-facts').first(), 30);
await wait(2200);
await p.mouse.move(mouse.x, mouse.y + 120, { steps: 25 }); // glide down to the "not deducted" list
await wait(2200);
await clickOn(p.getByRole('button', { name: /^(Cancel|Cancelar)$/ }).last());
await wait(700);
await clickOn(side(/Team|Equipo/));
end();

// 4 · Approve
await ready('button:has-text("Aprobar"), button:has-text("Approve")');
await caption(TXT.approve);
await p.waitForTimeout(550);
await begin('approve');
const approveBtn = p.getByRole('button', { name: /^(Approve|Aprobar)/ }).first();
await moveTo(approveBtn, 34);
await wait(900);
if (mode === 'record') await press();
await wait(2200);
await clickOn(side(/Back|Volver/));
end();

// 5 · Back on the main menu → Opportunities
await ready('.sidebar .sidebar-link:has-text("Oportunidades"), .sidebar .sidebar-link:has-text("Opportunities")');
await caption('');
await p.waitForTimeout(400);
await begin('to-pipeline');
await wait(500);
await clickOn(side(/Opportunities|Oportunidades/));
end();
await ready('.kcard');
await caption(TXT.pipeline);
await p.waitForTimeout(550);
await begin('pipeline');
await wait(1300);
const card = p.locator('.kcard', { hasText: 'Andes Logistics' }).first();
const target = p.locator('.kanban-body').nth(1);
await moveTo(card, 30);
await wait(600);
if (mode === 'record') {
  const cb = await card.boundingBox(), tb = await target.boundingBox();
  const dx = tb.x + 10 - cb.x, dy = tb.y + tb.height - 90 - cb.y;
  await p.mouse.down();
  await card.evaluate((el, [dx, dy]) => {
    const r = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', zIndex: 99999, margin: 0, transition: 'transform 1.2s cubic-bezier(.3,.7,.2,1)', transform: 'rotate(-2deg) scale(1.03)', boxShadow: '0 24px 40px -14px rgba(60,20,160,.45)', pointerEvents: 'none' });
    g.id = 'nsv-ghost'; document.body.appendChild(g); el.style.opacity = '0.25';
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `translate(${dx}px, ${dy}px) rotate(1deg) scale(1.03)`; }));
  }, [dx, dy]);
  await p.mouse.move(mouse.x + dx, mouse.y + dy, { steps: 50 });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const src = [...document.querySelectorAll('.kcard')].find((c) => c.textContent.includes('Andes Logistics'));
    const dst = document.querySelectorAll('.kanban-body')[1];
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });
  await p.mouse.up();
  end(); // board refreshes once the server answers — off camera
  await p.waitForFunction(() => document.querySelectorAll('.kanban-body')[1]?.textContent.includes('Andes Logistics'), null, { timeout: 30000 }).catch(() => console.log('deal not visible'));
  await p.evaluate(() => document.getElementById('nsv-ghost')?.remove());
  await p.waitForTimeout(400);
  await begin('pipeline-moved');
}
await wait(2000);
await clickOn(side(/Payroll|Nómina/));
end();

// 6 · Payroll → October run
await ready('text=October 2026');
await caption(TXT.payroll);
await p.waitForTimeout(550);
await begin('payroll');
await wait(1400);
await clickOn(p.locator('tr', { hasText: 'October 2026' }).getByRole('button', { name: /Abrir|Open/ }).first());
end();
await ready('table tbody tr:has-text("Tomás")');
await begin('payroll-run');
await moveTo(p.locator('table tbody tr').nth(3), 40);
await wait(1200);
await p.mouse.wheel(0, 140); await wait(2200);

// 7 · Outro
await caption('');
await p.evaluate((h) => window.__nsv.card('violet', h), `<div class="brand">{mark}Northstack</div><h1 style="color:#fff">${TXT.outroTitle}</h1><p>${TXT.outroSub}</p><div class="url">${TXT.url}</div>`);
await wait(4500);
end();

await cdp.send('Page.stopScreencast').catch(() => {});
await p.waitForTimeout(300);
fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ frames, segs, size: [Math.round(VIEW.width * DPR), Math.round(VIEW.height * DPR)] }));
await ctx.close(); await browser.close();
console.log('done', mode, lang, format, 'frames', frames.length, 'segments', segs.map(([a, b]) => (b - a).toFixed(1)).join(' + '), 'errors', errors);
