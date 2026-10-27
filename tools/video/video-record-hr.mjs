// HR video recorder: drives the real app (local frontend :5173 + local backend on the STAGING DB, demo
// tenant "Acme Latam", data from seed-hr.mjs), captures frames over CDP at the final resolution and
// writes frames + timeline.json for assemble-hr.mjs. Loads happen between segments, off camera.
//   PW_DIR=... CHROME=... API=http://localhost:3317 node video-record-hr.mjs preview|record es|en square|wide
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.PW_DIR, 'x.js'));
const { chromium } = require('playwright');

const [mode = 'preview', lang = 'es', format = 'square'] = process.argv.slice(2);
const OUT = path.resolve(`frames-hr-${lang}-${format}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const API = process.env.API || 'http://localhost:3000';
const APP = 'http://localhost:5173';
const token = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
const VIEW = format === 'square' ? { width: 900, height: 900 } : { width: 1440, height: 810 };
const DPR = format === 'square' ? 1.2 : 4 / 3; // → 1080×1080 or 1920×1080 device pixels
const es = lang === 'es';
const hire = 'Sofía Paz';

const TXT = es ? {
  introTitle: 'RR.HH. <em>sin planillas.</em>', introSub: 'Personas · Ingresos · Ausencias · Turnos · Horas',
  people: 'Cada persona, con su legajo completo', onboarding: 'Ingresos ordenados, del día 1 al mes 1',
  request: 'Pedir vacaciones toma 10 segundos', approve: 'Y se aprueba con un clic', out: 'Quién falta esta semana, de un vistazo',
  shifts: 'Turnos publicados y fichaje con QR', hours: 'Horas aprobadas, listas para liquidar',
  outroTitle: 'Prueba Northstack gratis', outroSub: '15 días · sin tarjeta de crédito', url: 'joinnorthstack.com',
} : {
  introTitle: 'HR <em>without spreadsheets.</em>', introSub: 'People · Onboarding · Time off · Shifts · Hours',
  people: 'Every person, with a complete profile', onboarding: 'Onboarding in order, from day 1 to month 1',
  request: 'Requesting time off takes 10 seconds', approve: 'And it’s approved in one click', out: 'Who’s out this week, at a glance',
  shifts: 'Published shifts and QR clock-in', hours: 'Approved hours, ready for payroll',
  outroTitle: 'Try Northstack free', outroSub: '15 days · no credit card', url: 'joinnorthstack.com',
};

eval(fs.readFileSync(path.join(import.meta.dirname, 'overlay.part.mjs'), 'utf8').replace('const OVERLAY =', 'globalThis.OVERLAY ='));
await fetch(`${API}/api/users/me/locale`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: lang }) });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
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
const segs = []; let segStart = null, shot = 0;
const begin = async (name) => {
  segStart = now();
  if (mode === 'preview') await p.screenshot({ path: `${OUT}/pv-${String(++shot).padStart(2, '0')}-${name}.png` });
};
const end = async () => {
  if (segStart !== null) segs.push([segStart, now()]);
  segStart = null;
  if (mode === 'preview') await p.screenshot({ path: `${OUT}/pv-${String(shot).padStart(2, '0')}-end.png` });
};
const wait = (ms) => p.waitForTimeout(mode === 'record' ? ms : Math.min(ms, 400));
const noLoading = () => p.waitForFunction(() => !document.querySelector('[class*="skeleton"], .animate-pulse') && !/Cargando|Loading/.test(document.querySelector('main')?.innerText.slice(0, 200) || ''), null, { timeout: 90000 }).catch(() => console.log('still loading'));
const ready = async (sel) => {
  if (sel) await p.waitForSelector(sel, { timeout: 90000 }).catch(() => console.log('not ready', sel));
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await noLoading();
  await p.waitForTimeout(700);
};
const go = async (url, sel) => { await p.goto(APP + url); await ready(sel); await p.mouse.move(mouse.x, mouse.y); };
const caption = (t) => p.evaluate((x) => window.__nsv.caption(x), t);
let mouse = { x: VIEW.width * 0.62, y: VIEW.height * 0.55 };
const moveTo = async (loc, steps = 26) => {
  const b = await loc.boundingBox().catch(() => null);
  if (!b) { console.log('no box for', String(loc)); return mouse; }
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + Math.min(b.height / 2, 30);
  await p.mouse.move(x, y, { steps });
  mouse = { x, y };
  return mouse;
};
const press = async () => { await wait(180); await p.mouse.down(); await wait(90); await p.mouse.up(); };
const clickOn = async (loc) => { await moveTo(loc); await press(); };
const side = (re) => p.locator('.sidebar .sidebar-link', { hasText: re }).first();

// ---- warm up (not captured)
await go('/hr/people', 'table tbody tr');
await p.evaluate(() => document.fonts.ready);
await startCapture();
await p.waitForTimeout(400);

// 0 · Intro card
await begin('intro');
await p.evaluate((h) => window.__nsv.card('light', h), `<div class="brand">{mark}Northstack</div><h1>${TXT.introTitle}</h1><p>${TXT.introSub}</p>`);
await wait(2600);
await p.evaluate(() => window.__nsv.hideCard());
await wait(500);

// 1 · People → one profile
await caption(TXT.people);
await wait(700);
await moveTo(p.locator('table tbody tr').nth(2).locator('td').first(), 22);
await wait(400);
await moveTo(p.locator('table tbody tr').nth(5).locator('td').first(), 22);
await wait(300);
const val = p.locator('table tbody tr', { hasText: 'Valentina Rossi' }).first();
await val.scrollIntoViewIfNeeded();
await clickOn(val.locator('td').first());
await wait(400);
await end(); // the profile loads off camera
await ready('[role="dialog"], .modal');
await begin('profile');
await wait(600);
await p.mouse.move(mouse.x + 160, mouse.y - 40, { steps: 18 });
await wait(1600);
await end();

// 2 · Onboarding project
await go('/projects', 'table tbody tr');
await begin('projects');
await caption(TXT.onboarding);
await wait(500);
await clickOn(p.locator('table tbody tr', { hasText: hire }).first().locator('td').first());
await end();
await ready('text=/Pre-ingreso|Before day 1/');
await begin('project');
await wait(700);
await moveTo(p.getByText(/^(Pre-ingreso|Before day 1)/).first(), 22);
await wait(700);
await p.mouse.wheel(0, format === 'square' ? 520 : 420);
await wait(900);
await p.mouse.wheel(0, format === 'square' ? 520 : 420);
await wait(1100);
await end();

// 3 · Request time off (my time off → preview of the days it counts)
await go('/hr/time-off', '.ghost-row-inner');
await p.waitForSelector('text=/disponibles|available/', { timeout: 60000 }).catch(() => console.log('balances not visible'));
await begin('request');
await caption(TXT.request);
await wait(600);
await clickOn(p.locator('.ghost-row-inner').first());
await wait(700);
const start = p.locator('#time-off-request-start'), endD = p.locator('#time-off-request-end');
await moveTo(start, 18); await press(); await start.fill('2026-12-21'); await wait(350);
await moveTo(endD, 18); await press(); await endD.fill('2026-12-29');
await wait(200);
await end(); // the day count comes from the server, off camera
await p.waitForFunction(() => { const s = document.querySelector('.to-facts strong'); return s && !s.textContent.includes('…') && s.textContent.trim() !== '—'; }, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(300);
await begin('facts');
await moveTo(p.locator('.to-facts').first(), 20);
await wait(1500);
await p.mouse.move(mouse.x, mouse.y + 100, { steps: 16 });
await wait(800);
await end();
await p.getByRole('button', { name: /^(Cancel|Cancelar)$/ }).last().click();

// 4 · Approve (team)
await p.locator('.sidebar-link', { hasText: /Equipo|Team/ }).first().click();
await ready('button:has-text("Aprobar"), button:has-text("Approve")');
await begin('approve');
await caption(TXT.approve);
await moveTo(p.getByRole('button', { name: /^(Approve|Aprobar)/ }).first(), 24);
await wait(600);
if (mode === 'record') await press();
await wait(1600);
await end();

// 5 · Who is out this week (Overview calendar)
await go('/overview', '.sidebar');
// bring this week's row above the caption
await p.mouse.move(VIEW.width * 0.45, VIEW.height * 0.6);
await p.mouse.wheel(0, format === 'square' ? 700 : 420);
await p.waitForTimeout(600);
await begin('out');
await caption(TXT.out);
await wait(500);
const outChip = p.locator('main').getByText(/Lucía F\.|Lucia F\.|Tomás H\./).first();
await moveTo(outChip, 24);
await wait(1100);
await moveTo(p.locator('main').getByText(/Tomás H\./).first(), 20);
await wait(1200);
await end();

// 6 · Shifts: the published week, the location QR, today's clock-ins
await go('/shifts', '.sh-block');
await begin('week');
await caption(TXT.shifts);
await wait(500);
await moveTo(p.locator('.sh-block:visible').nth(4), 22); await wait(500);
await moveTo(p.locator('.sh-block:visible').nth(11), 22); await wait(700);
await end();
await go('/settings/shifts', 'text=/Ver QR|View QR|Show QR/');
await p.getByRole('button', { name: /^(Ver QR|View QR|Show QR)$/ }).last().scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await begin('qr');
await clickOn(p.getByRole('button', { name: /^(Ver QR|View QR|Show QR)$/ }).last());
await wait(1700);
await end();
await go('/shifts/today', 'table tbody tr');
await begin('today');
await moveTo(p.locator('table tbody tr', { hasText: /Adentro|In(?=\d)/ }).first(), 22);
await wait(800);
await moveTo(p.locator('table tbody tr', { hasText: /Se fue|Left/ }).first(), 22);
await wait(900);
await end();

// 7 · Approve a timesheet
await go('/shifts/approvals', 'table tbody tr');
await begin('hours-list');
await caption(TXT.hours);
await wait(500);
await clickOn(p.locator('table tbody tr', { hasText: 'Valentina' }).first());
await end();
await ready('button:has-text("Aprobar"), button:has-text("Approve")');
const approveTs = p.getByRole('button', { name: /^(Approve|Aprobar)$/ }).last();
await approveTs.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await begin('hours');
await wait(500);
await moveTo(approveTs, 24);
await wait(600);
if (mode === 'record') await press();
await wait(1500);

// 8 · Outro
await caption('');
await p.evaluate((h) => window.__nsv.card('violet', h), `<div class="brand">{mark}Northstack</div><h1 style="color:#fff">${TXT.outroTitle}</h1><p>${TXT.outroSub}</p><div class="url">${TXT.url}</div>`);
await wait(3800);
await end();

await cdp.send('Page.stopScreencast').catch(() => {});
await p.waitForTimeout(300);
fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ frames, segs, size: [Math.round(VIEW.width * DPR), Math.round(VIEW.height * DPR)] }));
await ctx.close(); await browser.close();
console.log('done', mode, lang, format, 'frames', frames.length, 'segments', segs.map(([a, b]) => (b - a).toFixed(1)).join(' + '), '=', segs.reduce((t, [a, b]) => t + b - a, 0).toFixed(1), 's', 'errors', errors);
