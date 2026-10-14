// Brand image cards (1080×1350 PNG) for LinkedIn posts + the "5 signs" PDF carousel, in ES and EN.
//   PW_DIR=<dir with node_modules/playwright> CHROME=<chrome.exe> node cards.mjs
// Writes into the week folders next to each post (imagenes/). Text lives here, design in CSS below.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.PW_DIR, 'x.js'));
const { chromium } = require('playwright');
const ROOT = path.resolve(import.meta.dirname, '../..');
const LOGO = fs.readFileSync(path.join(ROOT, '2026-10/semana-01/directorios/logo/northstack-icon-color.svg'), 'utf8');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@1&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Instrument Sans',system-ui,sans-serif;color:#14102b}
.slide{width:1080px;height:1350px;position:relative;overflow:hidden;padding:96px 88px;display:flex;flex-direction:column;
  background:radial-gradient(circle at 85% 8%,#e6dcff 0,#f7f4ff 42%,#fbfaff 70%);page-break-after:always}
.slide.violet{background:linear-gradient(140deg,#4a16c9 0%,#5b21e6 45%,#8a5bff 100%);color:#fff}
.brand{display:flex;align-items:center;gap:16px;font-weight:700;font-size:32px;letter-spacing:-.01em}
.brand .mark{width:60px;height:60px;border-radius:16px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 24px -10px rgba(91,33,230,.45)}
.brand .mark svg{width:40px;height:40px}
.kicker{margin-top:auto;font-size:26px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#5b21e6}
.violet .kicker{color:#d9ccff}
h1{margin-top:22px;font-size:84px;line-height:1.02;letter-spacing:-.035em;font-weight:700}
h1 em{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-style:italic;color:#5b21e6;letter-spacing:-.01em}
.violet h1 em{color:#e3d8ff}
.sub{margin-top:28px;font-size:34px;line-height:1.3;color:#4a4566;max-width:30ch}
.violet .sub{color:#efeaff}
.list{margin-top:52px;display:flex;flex-direction:column;gap:20px}
.item{display:flex;align-items:center;gap:24px;background:#fff;border:1px solid #e7e1fb;border-radius:24px;padding:28px 32px;font-size:36px;font-weight:500;
  box-shadow:0 12px 30px -20px rgba(60,20,160,.35)}
.item .ic{width:56px;height:56px;border-radius:14px;background:#efe9ff;display:grid;place-items:center;font-size:30px;flex:none}
.item.off{color:#8b86a3}.item.off .t{text-decoration:line-through;text-decoration-color:#e0475b;text-decoration-thickness:3px}
.item.on{border:2px solid #5b21e6}
.item.sm{font-size:28px;padding:20px 22px;gap:16px}.item.sm .ic{width:46px;height:46px;font-size:24px}
.item .tag{margin-left:auto;font-size:22px;font-weight:600;padding:8px 16px;border-radius:999px;background:#e4f7ec;color:#1b7a46;text-decoration:none}
.item .tag.no{background:#f1eff8;color:#8b86a3}
.grid{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.stage{background:#fff;border:1px solid #e7e1fb;border-radius:22px;padding:26px 28px;box-shadow:0 12px 30px -20px rgba(60,20,160,.35)}
.stage b{display:block;font-size:34px;margin-bottom:14px}
.stage div{font-size:28px;line-height:1.45;color:#4a4566}
.cal{margin-top:48px;background:#fff;border:1px solid #e7e1fb;border-radius:24px;padding:26px;box-shadow:0 12px 30px -20px rgba(60,20,160,.35)}
.cal .row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.cal .d{font-size:22px;font-weight:600;color:#8b86a3;text-align:center;padding-bottom:10px}
.cal .c{min-height:220px;border-radius:14px;background:#f7f4ff;padding:10px;display:flex;flex-direction:column;gap:8px}
.chip{font-size:22px;font-weight:600;padding:8px 10px;border-radius:10px;line-height:1.2}
.chip.v{background:#e9e0ff;color:#3d12a8}.chip.b{background:#fff1d6;color:#8a5a00}.chip.h{background:#e4f7ec;color:#1b7a46}
.foot{margin-top:auto;padding-top:48px;display:flex;align-items:center;justify-content:space-between;font-size:28px;font-weight:600}
.foot .url{background:#5b21e6;color:#fff;padding:16px 26px;border-radius:16px}
.violet .foot .url{background:#fff;color:#3d12a8}
.foot .swipe{color:#8b86a3}.violet .foot .swipe{color:#e3d8ff}
.num{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:220px;line-height:.8;color:#5b21e6;margin-top:70px}
.big{margin-top:30px;font-size:66px;line-height:1.08;letter-spacing:-.03em;font-weight:700}
.page{position:absolute;right:88px;top:104px;font-size:26px;font-weight:600;color:#8b86a3}
`;
const brand = `<div class="brand"><span class="mark">${LOGO}</span>Northstack</div>`;
const foot = (url, right = '') => `<div class="foot"><span class="swipe">${right}</span><span class="url">${url}</span></div>`;
const item = (ic, text, cls = '', tag = '') => `<div class="item ${cls}"><span class="ic">${ic}</span><span class="t">${text}</span>${tag}</div>`;

const URL = { es: 'joinnorthstack.com/es', en: 'joinnorthstack.com' };
const T = (es, en) => ({ es, en });

// ---- single cards -------------------------------------------------------------------------------
const CARDS = [
  { dir: '2026-10/semana-05', name: 'crm', html: (l) => `${brand}
    <div class="kicker">${T('CRM de ventas', 'Sales CRM')[l]}</div>
    <h1>${T('¿Dónde viven tus <em>oportunidades</em>?', 'Where do your <em>deals</em> live?')[l]}</h1>
    <div class="list">
      ${item('📧', T('El correo de cada vendedor', 'Each rep’s inbox')[l], 'off')}
      ${item('📊', T('Una planilla “cuando hay tiempo”', 'A spreadsheet “when there’s time”')[l], 'off')}
      ${item('🧠', T('La memoria de alguien', 'Someone’s memory')[l], 'off')}
      ${item('📈', T('Un embudo con tus etapas, tareas y próximos pasos', 'A pipeline with your stages, tasks and next steps')[l], 'on')}
    </div>${foot(URL[l])}` },
  { dir: '2026-10/semana-05', name: 'onboarding', html: (l) => `${brand}
    <div class="kicker">${T('Checklist', 'Checklist')[l]}</div>
    <h1>${T('Onboarding en <em>4 etapas</em>', 'Onboarding in <em>4 stages</em>')[l]}</h1>
    <div class="grid">
      <div class="stage"><b>📝 ${T('Antes de que llegue', 'Before day one')[l]}</b><div>${T('Datos y contrato<br>Accesos y correo<br>Equipo de trabajo<br>Avisar al equipo', 'Details and contract<br>Accounts and email<br>Equipment<br>Tell the team')[l]}</div></div>
      <div class="stage"><b>👋 ${T('Día 1', 'Day 1')[l]}</b><div>${T('Bienvenida y recorrido<br>Conocer a su líder<br>Cómo pedir vacaciones<br>A quién preguntar qué', 'Welcome and walk-around<br>Meet their manager<br>How to request time off<br>Who to ask about what')[l]}</div></div>
      <div class="stage"><b>📅 ${T('Semana 1', 'Week 1')[l]}</b><div>${T('Primeras tareas reales<br>Chicas y alcanzables<br>Charla corta: ¿qué te falta?', 'First real tasks<br>Small and achievable<br>Short check-in: what’s missing?')[l]}</div></div>
      <div class="stage"><b>🎯 ${T('Mes 1', 'Month 1')[l]}</b><div>${T('Objetivos claros<br>Charla honesta<br>de cómo le fue', 'Clear goals<br>An honest talk<br>about how it’s going')[l]}</div></div>
    </div>
    <div class="sub" style="margin-top:44px">${T('El truco: cada tarea con un responsable y una fecha.', 'The trick: every task has an owner and a date.')[l]}</div>
    ${foot(URL[l])}` },
  { dir: '2026-10/semana-05', name: 'roles', html: (l) => `${brand}
    <div class="kicker">${T('Roles y permisos', 'Roles and permissions')[l]}</div>
    <h1>${T('No todos tienen que ver <em>los sueldos</em>', 'Not everyone needs to see <em>salaries</em>')[l]}</h1>
    <div class="list">
      ${item('🧾', T('Gestionar nómina', 'Manage payroll')[l], '', `<span class="tag">${T('RR.HH.', 'HR')[l]}</span>`)}
      ${item('🌴', T('Decidir vacaciones', 'Decide time off')[l], '', `<span class="tag">${T('Líderes', 'Managers')[l]}</span>`)}
      ${item('📊', T('Ver paneles', 'View dashboards')[l], '', `<span class="tag">${T('Dirección', 'Leadership')[l]}</span>`)}
      ${item('👤', T('Ver sus propios datos', 'See their own data')[l], '', `<span class="tag">${T('Todos', 'Everyone')[l]}</span>`)}
    </div>${foot(URL[l])}` },
  { dir: '2026-11/semana-01', name: 'calendario', html: (l) => `${brand}
    <div class="kicker">${T('Calendario del equipo', 'Team calendar')[l]}</div>
    <h1>${T('¿Quién está <em>esta semana</em>?', 'Who’s in <em>this week</em>?')[l]}</h1>
    <div class="cal"><div class="row">
      ${T(['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])[l].map((d) => `<div class="d">${d}</div>`).join('')}
    </div><div class="row">
      <div class="c"><span class="chip v">🌴 Martina</span><span class="chip v">🌴 Diego</span></div>
      <div class="c"><span class="chip v">🌴 Martina</span><span class="chip b">🎂 Camila</span></div>
      <div class="c"><span class="chip v">🌴 Martina</span></div>
      <div class="c"><span class="chip h">🗓️ ${T('Feriado', 'Holiday')[l]}</span></div>
      <div class="c"><span class="chip v">🌴 Tomás</span></div>
    </div></div>
    <div class="sub" style="margin-top:40px">${T('Vacaciones, cumpleaños y feriados en un solo lugar, sincronizado con Google Calendar.', 'Time off, birthdays and holidays in one place, synced with Google Calendar.')[l]}</div>
    ${foot(URL[l])}` },
  { dir: '2026-11/semana-01', name: 'reemplaza', html: (l) => `${brand}
    <div class="kicker">${T('6 herramientas → 1', '6 tools → 1')[l]}</div>
    <h1 style="font-size:72px">${T('Todo tu equipo en <em>un solo lugar</em>', 'Your whole team in <em>one place</em>')[l]}</h1>
    <div class="grid" style="gap:14px;margin-top:40px">
      ${item('📊', T('Planilla de vacaciones', 'Time-off sheet')[l], 'off sm')}
      ${item('💬', T('WhatsApp de turnos', 'Shifts group chat')[l], 'off sm')}
      ${item('📁', T('Carpetas de legajos', 'Record folders')[l], 'off sm')}
      ${item('📈', T('Planilla de ventas', 'Sales sheet')[l], 'off sm')}
      ${item('✅', T('App de tareas', 'Task app')[l], 'off sm')}
      ${item('🧾', T('Excel de sueldos', 'Salary sheet')[l], 'off sm')}
    </div>
    <div class="list" style="margin-top:22px">${item('✨', T('Northstack: personas, vacaciones, turnos, proyectos, ventas y nómina', 'Northstack: people, time off, shifts, projects, sales and payroll')[l], 'on')}</div>${foot(URL[l])}` },
];

// ---- carousel: 5 signs your team outgrew spreadsheets ------------------------------------------
const SIGNS = {
  es: ['Hay tres versiones del mismo archivo y nadie sabe cuál es la correcta.', 'Para saber cuántos días de vacaciones le quedan a alguien, hay que preguntarle a una sola persona.', 'Las oportunidades de venta viven en el correo de cada vendedor.', 'Sumar a una persona nueva es copiar sus datos en cuatro lugares.', 'Todos pueden ver todo. También los sueldos.'],
  en: ['There are three versions of the same file and nobody knows which one is right.', 'To find out how many vacation days someone has left, you have to ask one specific person.', 'Sales deals live in each rep’s inbox.', 'Adding a new hire means typing their details into four places.', 'Everyone can see everything. Salaries included.'],
};
const carousel = (l) => [
  `<div class="slide">${brand}<div class="kicker">${T('Checklist rápido', 'Quick checklist')[l]}</div>
    <h1 style="font-size:104px">${T('5 señales de que tu equipo ya <em>superó las planillas</em>', '5 signs your team has <em>outgrown spreadsheets</em>')[l]}</h1>
    ${foot(URL[l], T('Desliza →', 'Swipe →')[l])}</div>`,
  ...SIGNS[l].map((s, i) => `<div class="slide">${brand}<span class="page">${i + 1}/5</span><div class="num">${i + 1}</div><div class="big">${s}</div>${foot(URL[l], i < 4 ? T('Desliza →', 'Swipe →')[l] : '')}</div>`),
  `<div class="slide violet">${brand}<div class="kicker">${T('¿Marcaste dos o más?', 'Checked two or more?')[l]}</div>
    <h1 style="font-size:92px">${T('No es un problema de orden. <em>Tu equipo creció.</em>', 'It’s not a tidiness problem. <em>Your team grew.</em>')[l]}</h1>
    <div class="sub">${T('Personas, vacaciones, turnos, proyectos y ventas en un solo lugar. Prueba gratis 15 días, sin tarjeta.', 'People, time off, shifts, projects and sales in one place. Free 15-day trial, no credit card.')[l]}</div>
    ${foot(URL[l])}</div>`,
];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const render = async (body) => { await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready); };
for (const l of ['es', 'en']) {
  for (const c of CARDS) {
    const out = path.join(ROOT, c.dir, 'imagenes', `${c.name}-${l}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await render(`<div class="slide">${c.html(l)}</div>`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    console.log('card', path.relative(ROOT, out));
  }
  const pdf = path.join(ROOT, '2026-10/semana-04/imagenes', `carrusel-5-senales-${l}.pdf`);
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  await render(carousel(l).join(''));
  await page.pdf({ path: pdf, width: '1080px', height: '1350px', printBackground: true, pageRanges: '' });
  // PNG of the cover, for previews
  await render(carousel(l)[0]);
  await page.screenshot({ path: pdf.replace('.pdf', '-portada.png'), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  console.log('carousel', path.relative(ROOT, pdf));
}
await browser.close();
