// WhatsApp status images (1080×1920 PNG, 9:16), one per feature, in ES and EN (<name>-es.png / -en.png).
//   PW_DIR=<dir with node_modules/playwright> CHROME=<chrome.exe> node estados.mjs
// Writes into 2026-10/semana-04/whatsapp/. Keeps ~200 px clear at the top (progress bar + name) and
// ~230 px at the bottom (reply bar). Text lives here, design in CSS below.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.PW_DIR, 'x.js'));
const { chromium } = require('playwright');
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, '2026-10/semana-04/whatsapp');
const LOGO = fs.readFileSync(path.join(ROOT, '2026-10/semana-01/directorios/logo/northstack-icon-color.svg'), 'utf8');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@1&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Instrument Sans',system-ui,sans-serif;color:#14102b}
.s{width:1080px;height:1920px;position:relative;overflow:hidden;padding:210px 80px 240px;display:flex;flex-direction:column;
  background:radial-gradient(circle at 88% 6%,#e6dcff 0,#f7f4ff 40%,#fbfaff 72%)}
.s.violet{background:linear-gradient(150deg,#4a16c9 0%,#5b21e6 50%,#8a5bff 100%);color:#fff}
.brand{display:flex;align-items:center;gap:18px;font-weight:700;font-size:38px;letter-spacing:-.01em}
.brand .mark{width:70px;height:70px;border-radius:18px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 24px -10px rgba(91,33,230,.45)}
.brand .mark svg{width:46px;height:46px}
.kicker{margin-top:70px;font-size:30px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#5b21e6}
.violet .kicker{color:#d9ccff}
h1{margin-top:20px;font-size:96px;line-height:1.02;letter-spacing:-.035em;font-weight:700}
h1 em{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-style:italic;color:#5b21e6;letter-spacing:-.01em}
.violet h1 em{color:#e3d8ff}
.mock{margin-top:56px}
.sub{margin-top:48px;font-size:40px;line-height:1.3;color:#4a4566}
.violet .sub{color:#efeaff}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:24px}
.foot .trial{font-size:30px;font-weight:600;line-height:1.25;color:#4a4566}
.violet .foot .trial{color:#efeaff}
.foot .url{background:#5b21e6;color:#fff;font-size:32px;font-weight:700;padding:22px 30px;border-radius:20px;white-space:nowrap}
.violet .foot .url{background:#fff;color:#3d12a8}

/* app-like UI pieces */
.panel{background:#fff;color:#14102b;border:1px solid #e7e1fb;border-radius:32px;padding:36px;box-shadow:0 24px 50px -28px rgba(60,20,160,.45)}
.panel + .panel{margin-top:22px}
.row{display:flex;align-items:center;gap:20px;font-size:32px}
.rows{display:flex;flex-direction:column}
.rows .row{padding:22px 0;border-top:1px solid #f0ecfb}
.rows .row:first-child{border-top:0;padding-top:0}
.rows .row:last-child{padding-bottom:0}
.ic{width:60px;height:60px;border-radius:16px;background:#efe9ff;display:grid;place-items:center;font-size:32px;flex:none}
.muted{color:#8b86a3}
.right{margin-left:auto;text-align:right}
.b{font-weight:700}
.av{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:28px;flex:none;color:#fff}
.av.sm{width:56px;height:56px;font-size:22px}
.a1{background:#5b21e6}.a2{background:#e0475b}.a3{background:#1b9a5c}.a4{background:#d98a00}.a5{background:#2b7de9}
.pill{font-size:24px;font-weight:600;padding:8px 18px;border-radius:999px;white-space:nowrap}
.p-ok{background:#e4f7ec;color:#1b7a46}.p-wait{background:#fff1d6;color:#8a5a00}.p-no{background:#fde8eb;color:#b32235}
.p-v{background:#e9e0ff;color:#3d12a8}.p-grey{background:#f1eff8;color:#6b6685}
.btns{display:flex;gap:18px;margin-top:30px}
.btn{flex:1;text-align:center;font-size:32px;font-weight:700;padding:24px;border-radius:20px;border:2px solid #e7e1fb;color:#4a4566}
.btn.pri{background:#5b21e6;border-color:#5b21e6;color:#fff}
.bar{height:18px;border-radius:999px;background:#efe9ff;overflow:hidden;margin-top:16px}
.bar i{display:block;height:100%;border-radius:999px;background:#5b21e6}
.title{font-size:36px;font-weight:700;letter-spacing:-.01em}
.small{font-size:26px}
.cal .days{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.cal .d{font-size:24px;font-weight:600;color:#8b86a3;text-align:center;padding-bottom:12px}
.cal .c{min-height:330px;border-radius:16px;background:#f7f4ff;padding:10px;display:flex;flex-direction:column;gap:10px}
.chip{font-size:23px;font-weight:600;padding:10px;border-radius:12px;line-height:1.2}
.chip.v{background:#e9e0ff;color:#3d12a8}.chip.y{background:#fff1d6;color:#8a5a00}.chip.g{background:#e4f7ec;color:#1b7a46}
.kan{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.col{background:#f7f4ff;border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:14px;min-height:400px}
.col h4{font-size:24px;font-weight:600;color:#6b6685;text-transform:uppercase;letter-spacing:.08em;padding:6px 6px 2px}
.deal{background:#fff;border:1px solid #e7e1fb;border-radius:16px;padding:18px;font-size:26px;font-weight:600;line-height:1.25}
.deal span{display:block;font-size:22px;font-weight:500;color:#8b86a3;margin-top:6px}
.deal.hot{border:2px solid #5b21e6}
.bubble{width:fit-content;max-width:82%;font-size:31px;line-height:1.35;padding:22px 26px;border-radius:26px;margin-top:18px}
.bubble.me{margin-left:auto;background:#5b21e6;color:#fff;border-bottom-right-radius:8px}
.bubble.them{background:#f1eff8;color:#14102b;border-bottom-left-radius:8px}
.bubble .who{display:block;font-size:22px;font-weight:700;opacity:.7;margin-bottom:6px}
.mention{color:#5b21e6;font-weight:700}
.code{display:flex;gap:14px;justify-content:center;margin-top:28px}
.code span{width:104px;height:128px;border-radius:20px;border:2px solid #e7e1fb;display:grid;place-items:center;font-size:62px;font-weight:700;background:#fbfaff}
.code span.on{border-color:#5b21e6;box-shadow:0 0 0 6px #efe9ff}
.qr{width:220px;height:220px;flex:none;padding:14px;background:#fff;border-radius:24px;border:2px solid #e7e1fb}
`;

const T = (es, en) => ({ es, en });
const brand = `<div class="brand"><span class="mark">${LOGO}</span>Northstack</div>`;
const foot = (l) => `<div class="foot"><span class="trial">${T('Prueba gratis 15 días<br>Sin tarjeta', 'Free 15-day trial<br>No credit card')[l]}</span><span class="url">${T('joinnorthstack.com/es', 'joinnorthstack.com')[l]}</span></div>`;
const head = (kicker, title) => `${brand}<div class="kicker">${kicker}</div><h1>${title}</h1>`;

// Illustrative QR (finder squares + seeded noise). Not scannable on purpose.
const qr = (() => {
  const n = 25, cells = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const finder = (x, y) => x < 7 && y < 7 && (x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inF = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    const on = inF ? finder(x < 8 ? x : x - (n - 7), y < 8 ? y : y - (n - 7)) : rnd() > 0.52;
    if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><g fill="#14102b">${cells.join('')}</g></svg>`;
})();

// One status per feature. `violet` alternates the background so consecutive posts look different.
const ESTADOS = [
  { name: '01-personas', html: (l) => `${head(T('Personas', 'People')[l], T('Tu equipo, <em>sin carpetas</em> ni planillas', 'Your team, <em>no folders</em>, no spreadsheets')[l])}
    <div class="mock"><div class="panel">
      <div class="row" style="margin-bottom:30px"><span class="av a1">LG</span><div><div class="title">Lucía Gómez</div><div class="muted small">${T('Analista contable · Administración', 'Accountant · Finance')[l]}</div></div></div>
      <div class="rows">
        <div class="row"><span class="ic">📄</span>${T('Contrato', 'Contract')[l]}<span class="right pill p-ok">${T('Confirmado', 'Confirmed')[l]}</span></div>
        <div class="row"><span class="ic">👤</span>${T('Líder', 'Manager')[l]}<span class="right b">Diego Ruiz</span></div>
        <div class="row"><span class="ic">🌴</span>${T('Vacaciones', 'Time off')[l]}<span class="right b">${T('9 días disponibles', '9 days left')[l]}</span></div>
        <div class="row"><span class="ic">🎂</span>${T('Cumpleaños', 'Birthday')[l]}<span class="right b">${T('14 de marzo', 'March 14')[l]}</span></div>
        <div class="row"><span class="ic">📎</span>${T('Documentos', 'Documents')[l]}<span class="right b">${T('4 archivos', '4 files')[l]}</span></div>
      </div>
    </div></div>
    <div class="sub">${T('Datos, contrato, documentos y quién es su líder. Todo en una ficha por persona.', 'Details, contract, documents and who their manager is. One profile per person.')[l]}</div>${foot(l)}` },

  { name: '02-vacaciones', violet: true, html: (l) => `${head(T('Vacaciones', 'Time off')[l], T('¿Cuántos días <em>le quedan?</em>', 'How many days <em>are left?</em>')[l])}
    <div class="mock"><div class="panel">
      <div class="row"><span class="av a2">MS</span><div><div class="title">Martina Sosa</div><div class="muted small">${T('pidió vacaciones', 'requested time off')[l]}</div></div><span class="right pill p-wait">${T('Pendiente', 'Pending')[l]}</span></div>
      <div class="rows" style="margin-top:30px">
        <div class="row"><span class="ic">📅</span>${T('9 – 13 de noviembre', 'November 9 – 13')[l]}<span class="right b">${T('5 días hábiles', '5 business days')[l]}</span></div>
        <div class="row" style="display:block"><div style="display:flex"><span>${T('Le quedan', 'Left after this')[l]}</span><span class="right b">${T('9 de 14 días', '9 of 14 days')[l]}</span></div><div class="bar"><i style="width:64%"></i></div></div>
      </div>
      <div class="btns"><span class="btn">${T('Rechazar', 'Decline')[l]}</span><span class="btn pri">${T('Aprobar', 'Approve')[l]}</span></div>
    </div></div>
    <div class="sub">${T('Feriados de tu país, días hábiles y saldos al día. Sin preguntarle a nadie.', 'Your country’s holidays, business days and up-to-date balances. No need to ask anyone.')[l]}</div>${foot(l)}` },

  { name: '03-calendario', html: (l) => `${head(T('Calendario del equipo', 'Team calendar')[l], T('¿Quién está <em>esta semana?</em>', 'Who’s in <em>this week?</em>')[l])}
    <div class="mock"><div class="panel cal">
      <div class="days">${T(['Lun', 'Mar', 'Mié', 'Jue', 'Vie'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])[l].map((d) => `<div class="d">${d}</div>`).join('')}</div>
      <div class="days">
        <div class="c"><span class="chip v">🌴 Martina</span><span class="chip v">🌴 Diego</span></div>
        <div class="c"><span class="chip v">🌴 Martina</span><span class="chip y">🎂 Camila</span></div>
        <div class="c"><span class="chip v">🌴 Martina</span></div>
        <div class="c"><span class="chip g">🗓️ ${T('Feriado', 'Holiday')[l]}</span></div>
        <div class="c"><span class="chip v">🌴 Tomás</span></div>
      </div>
    </div></div>
    <div class="sub">${T('Vacaciones, cumpleaños y feriados en un solo lugar, sincronizado con Google Calendar.', 'Time off, birthdays and holidays in one place, synced with Google Calendar.')[l]}</div>${foot(l)}` },

  { name: '04-turnos', violet: true, html: (l) => `${head(T('Turnos', 'Shifts')[l], T('Deja de confirmar turnos <em>por WhatsApp</em>', 'Stop confirming shifts <em>over WhatsApp</em>')[l])}
    <div class="mock"><div class="panel">
      <div class="row"><span class="ic">🗓️</span><div><div class="title">${T('Nuevo turno', 'New shift')[l]}</div><div class="muted small">${T('Sede Palermo', 'Palermo site')[l]}</div></div><span class="right pill p-v">${T('Publicado', 'Published')[l]}</span></div>
      <div class="rows" style="margin-top:28px">
        <div class="row">${T('Sábado 31 de octubre', 'Saturday, October 31')[l]}<span class="right b">${T('07:00 – 15:00', '7 AM – 3 PM')[l]}</span></div>
      </div>
      <div class="btns"><span class="btn">${T('No puedo', 'Can’t make it')[l]}</span><span class="btn pri">${T('Confirmo ✓', 'Confirm ✓')[l]}</span></div>
    </div>
    <div class="panel"><div class="rows">
      <div class="row">${T('Confirmaron', 'Confirmed')[l]}<span class="right pill p-ok">${T('8 personas', '8 people')[l]}</span></div>
      <div class="row">${T('Sin responder', 'No answer yet')[l]}<span class="right pill p-wait">${T('2 personas', '2 people')[l]}</span></div>
      <div class="row">${T('Sin cubrir', 'Uncovered')[l]}<span class="right pill p-no">${T('1 turno', '1 shift')[l]}</span></div>
    </div></div></div>
    <div class="sub">${T('Lo reciben en su calendario y responden con un clic.', 'It lands in their calendar and they answer with one click.')[l]}</div>${foot(l)}` },

  { name: '05-fichaje', html: (l) => `${head(T('Fichaje', 'Clock-in')[l], T('Fichan con <em>su propio celular</em>', 'They clock in with <em>their own phone</em>')[l])}
    <div class="mock"><div class="panel">
      <div class="row" style="gap:32px">${qr}
        <div><div class="title">${T('Sede Belgrano', 'Belgrano site')[l]}</div><div class="muted small" style="margin-top:8px">${T('Escanea para entrar, salir o tomar un descanso', 'Scan to clock in, clock out or take a break')[l]}</div></div></div>
    </div>
    <div class="panel"><div class="title" style="margin-bottom:24px">${T('Hoy', 'Today')[l]}</div><div class="rows">
      <div class="row"><span class="av sm a3">CL</span>Camila<span class="right pill p-ok">${T('Entró 08:58', 'In at 8:58')[l]}</span></div>
      <div class="row"><span class="av sm a5">TP</span>Tomás<span class="right pill p-ok">${T('Entró 09:03', 'In at 9:03')[l]}</span></div>
      <div class="row"><span class="av sm a4">JM</span>Joaquín<span class="right pill p-wait">${T('En descanso', 'On a break')[l]}</span></div>
    </div></div></div>
    <div class="sub">${T('Un QR impreso por sede. Sin reloj, sin tablet, sin instalar nada.', 'One printed QR per site. No time clock, no tablet, nothing to install.')[l]}</div>${foot(l)}` },

  { name: '06-horas', violet: true, html: (l) => `${head(T('Horas', 'Timesheets')[l], T('Las horas <em>se cargan solas</em>', 'Hours that <em>fill themselves in</em>')[l])}
    <div class="mock"><div class="panel">
      <div class="row" style="margin-bottom:26px"><div class="title">${T('Semana del 19/10', 'Week of Oct 19')[l]}</div><span class="right muted small">${T('Sugerencias', 'Suggestions')[l]}</span></div>
      <div class="rows">
        <div class="row"><span class="ic">🗓️</span><div>${T('Turno Sede Palermo', 'Shift at Palermo site')[l]}<div class="muted small">${T('lun 19', 'Mon 19')[l]}</div></div><span class="right b">8 h</span></div>
        <div class="row"><span class="ic">✅</span><div>${T('Tarea: cierre de mes', 'Task: month-end close')[l]}<div class="muted small">${T('mar 20', 'Tue 20')[l]}</div></div><span class="right b">${T('2,5 h', '2.5 h')[l]}</span></div>
        <div class="row"><span class="ic">📞</span><div>${T('Reunión con cliente', 'Client meeting')[l]}<div class="muted small">${T('Google Calendar · mié 21', 'Google Calendar · Wed 21')[l]}</div></div><span class="right b">1 h</span></div>
      </div>
      <div class="btns"><span class="btn pri">${T('Enviar semana para aprobar', 'Submit week for approval')[l]}</span></div>
    </div></div>
    <div class="sub">${T('Te sugiere horas de turnos, tareas y reuniones. Tú confirmas, tu líder aprueba.', 'Hours suggested from shifts, tasks and meetings. You confirm, your manager approves.')[l]}</div>${foot(l)}` },

  { name: '07-reporte-cliente', html: (l) => `${head(T('Reporte de horas', 'Hours report')[l], T('Las horas al cliente, <em>en un clic</em>', 'Client hours, <em>in one click</em>')[l])}
    <div class="mock"><div class="panel">
      <div class="muted small">${T('REPORTE DE HORAS · OCTUBRE 2026', 'HOURS REPORT · OCTOBER 2026')[l]}</div>
      <div class="title" style="margin-top:8px;font-size:42px">${T('Estudio Pérez & Asociados', 'Pérez & Partners')[l]}</div>
      <div class="rows" style="margin-top:30px">
        <div class="row">${T('Cierre de mes', 'Month-end close')[l]}<span class="right b">18 h</span></div>
        <div class="row">${T('Liquidación de impuestos', 'Tax filing')[l]}<span class="right b">${T('14,5 h', '14.5 h')[l]}</span></div>
        <div class="row">${T('Reuniones', 'Meetings')[l]}<span class="right b">10 h</span></div>
        <div class="row b">${T('Total aprobado', 'Total approved')[l]}<span class="right" style="color:#5b21e6;font-size:40px">${T('42,5 h', '42.5 h')[l]}</span></div>
      </div>
      <div class="btns"><span class="btn">📄 PDF</span><span class="btn">🔗 Link</span><span class="btn pri">✉️ ${T('Enviar', 'Send')[l]}</span></div>
    </div></div>
    <div class="sub">${T('Solo horas aprobadas. Por PDF, link privado o email directo al cliente.', 'Approved hours only. As a PDF, a private link or straight to your client’s inbox.')[l]}</div>${foot(l)}` },

  { name: '08-proyectos', violet: true, html: (l) => `${head(T('Proyectos', 'Projects')[l], T('Tu próximo proyecto <em>ya tiene plantilla</em>', 'Your next project <em>already has a template</em>')[l])}
    <div class="mock"><div class="panel"><div class="rows">
      <div class="row" style="display:block"><div style="display:flex"><span class="b">🧾 ${T('Cierre de mes · 10/2026', 'Month-end close · 10/2026')[l]}</span><span class="right muted">72%</span></div><div class="bar"><i style="width:72%"></i></div></div>
      <div class="row" style="display:block"><div style="display:flex"><span class="b">📣 ${T('Lanzamiento de campaña', 'Campaign launch')[l]}</span><span class="right muted">40%</span></div><div class="bar"><i style="width:40%"></i></div></div>
      <div class="row" style="display:block"><div style="display:flex"><span class="b">🤝 ${T('Alta de cliente nuevo', 'New client onboarding')[l]}</span><span class="right muted">15%</span></div><div class="bar"><i style="width:15%"></i></div></div>
    </div>
    <div class="btns"><span class="btn">${T('En blanco', 'Blank')[l]}</span><span class="btn pri">${T('Usar plantilla', 'Use template')[l]}</span></div>
    </div></div>
    <div class="sub">${T('Fases, tareas asignadas por rol y avance. Empieza de cero o con la plantilla de tu rubro.', 'Phases, tasks assigned by role and progress. Start from scratch or from your industry’s template.')[l]}</div>${foot(l)}` },

  { name: '09-tareas', html: (l) => `${head(T('Tareas', 'Tasks')[l], T('Cada tarea con <em>dueño, fecha</em> y su chat', 'Every task with <em>an owner, a date</em> and its own chat')[l])}
    <div class="mock"><div class="panel">
      <div class="row"><span class="ic">✅</span><div><div class="title">${T('Conciliar bancos', 'Bank reconciliation')[l]}</div><div class="muted small">${T('Vence vie 30/10 · Lucía Gómez', 'Due Fri Oct 30 · Lucía Gómez')[l]}</div></div><span class="right pill p-v">⏱ 1:24</span></div>
      <div style="margin-top:20px">
        <div class="bubble them"><span class="who">Lucía</span><span class="mention">@Diego</span> ${T('¿me pasas el extracto de octubre?', 'can you send me the October statement?')[l]}</div>
        <div class="bubble me"><span class="who">Diego</span>${T('Listo, ya está subido 👍', 'Done, it’s uploaded 👍')[l]}</div>
      </div>
    </div></div>
    <div class="sub">${T('Menciones con aviso, recordatorios y cuánto tiempo llevó cada tarea.', 'Mentions that notify, reminders and how long each task took.')[l]}</div>${foot(l)}` },

  { name: '10-ventas', violet: true, html: (l) => `${head(T('CRM de ventas', 'Sales CRM')[l], T('¿Dónde viven tus <em>oportunidades?</em>', 'Where do your <em>deals</em> live?')[l])}
    <div class="mock"><div class="panel kan">
      <div class="col"><h4>${T('Contacto', 'Lead')[l]}</h4><div class="deal">${T('Clínica Norte', 'North Clinic')[l]}<span>${T('Diego · hoy', 'Diego · today')[l]}</span></div><div class="deal">${T('Ferretería Sur', 'South Hardware')[l]}<span>${T('Camila · mañana', 'Camila · tomorrow')[l]}</span></div></div>
      <div class="col"><h4>${T('Propuesta', 'Proposal')[l]}</h4><div class="deal hot">${T('Estudio Vidal', 'Vidal Studio')[l]}<span>${T('Enviar propuesta', 'Send proposal')[l]}</span></div><div class="deal">${T('Lab Andino', 'Andes Lab')[l]}<span>${T('Llamar el jueves', 'Call on Thursday')[l]}</span></div></div>
      <div class="col"><h4>${T('Cierre', 'Closed')[l]}</h4><div class="deal">${T('Café Central', 'Central Café')[l]}<span>✓ ${T('Ganada', 'Won')[l]}</span></div></div>
    </div></div>
    <div class="sub">${T('Un embudo con tus etapas, tareas y próximos pasos. No en el correo de cada vendedor.', 'A pipeline with your stages, tasks and next steps. Not in each rep’s inbox.')[l]}</div>${foot(l)}` },

  { name: '11-nomina', html: (l) => `${head(T('Nómina', 'Payroll')[l], T('Sueldos y recibos, <em>ordenados</em>', 'Salaries and pay stubs, <em>organized</em>')[l])}
    <div class="mock"><div class="panel">
      <div class="row"><span class="ic">🧾</span><div><div class="title">${T('Liquidación octubre', 'October pay run')[l]}</div><div class="muted small">${T('12 personas', '12 people')[l]}</div></div><span class="right pill p-ok">${T('Cerrada', 'Closed')[l]}</span></div>
      <div class="rows" style="margin-top:28px">
        <div class="row"><span class="av sm a1">LG</span>Lucía Gómez<span class="right pill p-ok">${T('Recibo enviado', 'Stub sent')[l]}</span></div>
        <div class="row"><span class="av sm a3">CL</span>Camila López<span class="right pill p-ok">${T('Recibo enviado', 'Stub sent')[l]}</span></div>
        <div class="row"><span class="av sm a5">TP</span>Tomás Paz<span class="right pill p-v">${T('Contrato confirmado', 'Contract confirmed')[l]}</span></div>
      </div>
    </div></div>
    <div class="sub">${T('Liquidaciones, recibos y contratos confirmados por cada persona. Northstack lleva el registro: no paga ni mueve dinero.', 'Pay runs, pay stubs and contracts each person confirms. Northstack keeps the records: it never pays anyone or moves money.')[l]}</div>${foot(l)}` },

  { name: '12-roles', violet: true, html: (l) => `${head(T('Roles y permisos', 'Roles and permissions')[l], T('No todos tienen que ver <em>los sueldos</em>', 'Not everyone needs to see <em>salaries</em>')[l])}
    <div class="mock"><div class="panel"><div class="rows">
      <div class="row"><span class="ic">🧾</span>${T('Gestionar nómina', 'Manage payroll')[l]}<span class="right pill p-v">${T('RR. HH.', 'HR')[l]}</span></div>
      <div class="row"><span class="ic">🌴</span>${T('Aprobar vacaciones', 'Approve time off')[l]}<span class="right pill p-v">${T('Líderes', 'Managers')[l]}</span></div>
      <div class="row"><span class="ic">📊</span>${T('Ver paneles', 'View dashboards')[l]}<span class="right pill p-v">${T('Dirección', 'Leadership')[l]}</span></div>
      <div class="row"><span class="ic">👤</span>${T('Ver sus propios datos', 'See their own data')[l]}<span class="right pill p-ok">${T('Todos', 'Everyone')[l]}</span></div>
    </div></div></div>
    <div class="sub">${T('Crea los roles que tu empresa necesita y decide qué ve y qué hace cada uno.', 'Create the roles your company needs and decide what each one sees and does.')[l]}</div>${foot(l)}` },

  { name: '13-asistente-ia', html: (l) => `${head(T('Asistente de IA', 'AI assistant')[l], T('Pregúntale a <em>tu IA</em> por tu equipo', 'Ask <em>your AI</em> about your team')[l])}
    <div class="mock"><div class="panel">
      <div class="bubble me" style="margin-top:0">${T('¿Quién está de vacaciones la semana que viene?', 'Who’s off next week?')[l]}</div>
      <div class="bubble them">${T('Martina (9 al 13/11) y Tomás (viernes 13). Además, el sábado queda 1 turno sin cubrir en Sede Palermo. ¿Te sugiero quién puede tomarlo?', 'Martina (Nov 9–13) and Tomás (Friday 13th). Also, there’s 1 uncovered shift on Saturday at the Palermo site. Want me to suggest who could take it?')[l]}</div>
      <div class="bubble me">${T('Sí, dale', 'Yes, please')[l]}</div>
    </div></div>
    <div class="sub">${T('Conecta tu propio asistente (Claude, ChatGPT…). Solo puede hacer lo que tú puedes.', 'Connect your own assistant (Claude, ChatGPT…). It can only do what you can.')[l]}</div>${foot(l)}` },

  { name: '14-seguridad', violet: true, html: (l) => `${head(T('Seguridad', 'Security')[l], T('Verificación <em>en dos pasos</em>', 'Two-step <em>verification</em>')[l])}
    <div class="mock"><div class="panel" style="text-align:center">
      <div style="font-size:72px">🔐</div>
      <div class="title" style="margin-top:12px">${T('Ingresa el código de tu app', 'Enter the code from your app')[l]}</div>
      <div class="muted small" style="margin-top:8px">Google Authenticator, Microsoft Authenticator…</div>
      <div class="code"><span>4</span><span>8</span><span>2</span><span>9</span><span>1</span><span class="on">3</span></div>
      <div class="row" style="justify-content:center;margin-top:30px;font-size:28px"><span class="pill p-ok">✓ ${T('Recordar este dispositivo 30 días', 'Remember this device for 30 days')[l]}</span></div>
    </div></div>
    <div class="sub">${T('En todos los planes, sin costo extra. Porque ahí están los datos de tu equipo.', 'On every plan, at no extra cost. Because that’s where your team’s data lives.')[l]}</div>${foot(l)}` },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const l of ['es', 'en']) {
  for (const e of ESTADOS) {
    await page.setContent(`<!doctype html><html lang="${l}"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s${e.violet ? ' violet' : ''}">${e.html(l)}</div></body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Flag anything that spills past the bottom safe zone.
    const over = await page.evaluate(() => document.querySelector('.foot').getBoundingClientRect().top < document.querySelector('.sub').getBoundingClientRect().bottom + 20);
    const out = path.join(OUT, `${e.name}-${l}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    console.log(over ? 'OVERFLOW' : 'ok', path.relative(ROOT, out));
  }
}
await browser.close();
