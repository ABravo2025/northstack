// WhatsApp status images (1080×1920 PNG, 9:16), one per feature, in Spanish.
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

const brand = `<div class="brand"><span class="mark">${LOGO}</span>Northstack</div>`;
const foot = `<div class="foot"><span class="trial">Prueba gratis 15 días<br>Sin tarjeta</span><span class="url">joinnorthstack.com/es</span></div>`;
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
  { name: '01-personas', html: () => `${head('Personas', 'Tu equipo, <em>sin carpetas</em> ni planillas')}
    <div class="mock"><div class="panel">
      <div class="row" style="margin-bottom:30px"><span class="av a1">LG</span><div><div class="title">Lucía Gómez</div><div class="muted small">Analista contable · Administración</div></div></div>
      <div class="rows">
        <div class="row"><span class="ic">📄</span>Contrato<span class="right pill p-ok">Confirmado</span></div>
        <div class="row"><span class="ic">👤</span>Líder<span class="right b">Diego Ruiz</span></div>
        <div class="row"><span class="ic">🌴</span>Vacaciones<span class="right b">9 días disponibles</span></div>
        <div class="row"><span class="ic">🎂</span>Cumpleaños<span class="right b">14 de marzo</span></div>
        <div class="row"><span class="ic">📎</span>Documentos<span class="right b">4 archivos</span></div>
      </div>
    </div></div>
    <div class="sub">Datos, contrato, documentos y quién es su líder. Todo en una ficha por persona.</div>${foot}` },

  { name: '02-vacaciones', violet: true, html: () => `${head('Vacaciones', '¿Cuántos días <em>le quedan?</em>')}
    <div class="mock"><div class="panel">
      <div class="row"><span class="av a2">MS</span><div><div class="title">Martina Sosa</div><div class="muted small">pidió vacaciones</div></div><span class="right pill p-wait">Pendiente</span></div>
      <div class="rows" style="margin-top:30px">
        <div class="row"><span class="ic">📅</span>10 – 14 de noviembre<span class="right b">5 días hábiles</span></div>
        <div class="row" style="display:block"><div style="display:flex"><span>Le quedan</span><span class="right b">9 de 14 días</span></div><div class="bar"><i style="width:64%"></i></div></div>
      </div>
      <div class="btns"><span class="btn">Rechazar</span><span class="btn pri">Aprobar</span></div>
    </div></div>
    <div class="sub">Feriados de tu país, días hábiles y saldos al día. Sin preguntarle a nadie.</div>${foot}` },

  { name: '03-calendario', html: () => `${head('Calendario del equipo', '¿Quién está <em>esta semana?</em>')}
    <div class="mock"><div class="panel cal">
      <div class="days">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => `<div class="d">${d}</div>`).join('')}</div>
      <div class="days">
        <div class="c"><span class="chip v">🌴 Martina</span><span class="chip v">🌴 Diego</span></div>
        <div class="c"><span class="chip v">🌴 Martina</span><span class="chip y">🎂 Camila</span></div>
        <div class="c"><span class="chip v">🌴 Martina</span></div>
        <div class="c"><span class="chip g">🗓️ Feriado</span></div>
        <div class="c"><span class="chip v">🌴 Tomás</span></div>
      </div>
    </div></div>
    <div class="sub">Vacaciones, cumpleaños y feriados en un solo lugar, sincronizado con Google Calendar.</div>${foot}` },

  { name: '04-turnos', violet: true, html: () => `${head('Turnos', 'Deja de confirmar turnos <em>por WhatsApp</em>')}
    <div class="mock"><div class="panel">
      <div class="row"><span class="ic">🗓️</span><div><div class="title">Nuevo turno</div><div class="muted small">Sede Palermo</div></div><span class="right pill p-v">Publicado</span></div>
      <div class="rows" style="margin-top:28px">
        <div class="row">Sábado 25 de octubre<span class="right b">07:00 – 15:00</span></div>
      </div>
      <div class="btns"><span class="btn">No puedo</span><span class="btn pri">Confirmo ✓</span></div>
    </div>
    <div class="panel"><div class="rows">
      <div class="row">Confirmaron<span class="right pill p-ok">8 personas</span></div>
      <div class="row">Sin responder<span class="right pill p-wait">2 personas</span></div>
      <div class="row">Sin cubrir<span class="right pill p-no">1 turno</span></div>
    </div></div></div>
    <div class="sub">Lo reciben en su calendario y responden con un clic.</div>${foot}` },

  { name: '05-fichaje', html: () => `${head('Fichaje', 'Fichan con <em>su propio celular</em>')}
    <div class="mock"><div class="panel">
      <div class="row" style="gap:32px">${qr}
        <div><div class="title">Sede Belgrano</div><div class="muted small" style="margin-top:8px">Escanea para entrar, salir o tomar un descanso</div></div></div>
    </div>
    <div class="panel"><div class="title" style="margin-bottom:24px">Hoy</div><div class="rows">
      <div class="row"><span class="av sm a3">CL</span>Camila<span class="right pill p-ok">Entró 08:58</span></div>
      <div class="row"><span class="av sm a5">TP</span>Tomás<span class="right pill p-ok">Entró 09:03</span></div>
      <div class="row"><span class="av sm a4">JM</span>Joaquín<span class="right pill p-wait">En descanso</span></div>
    </div></div></div>
    <div class="sub">Un QR impreso por sede. Sin reloj, sin tablet, sin instalar nada.</div>${foot}` },

  { name: '06-horas', violet: true, html: () => `${head('Horas', 'Las horas <em>se cargan solas</em>')}
    <div class="mock"><div class="panel">
      <div class="row" style="margin-bottom:26px"><div class="title">Semana del 20/10</div><span class="right muted small">Sugerencias</span></div>
      <div class="rows">
        <div class="row"><span class="ic">🗓️</span><div>Turno Sede Palermo<div class="muted small">lun 20</div></div><span class="right b">8 h</span></div>
        <div class="row"><span class="ic">✅</span><div>Tarea: cierre de mes<div class="muted small">mar 21</div></div><span class="right b">2,5 h</span></div>
        <div class="row"><span class="ic">📞</span><div>Reunión con cliente<div class="muted small">Google Calendar · mié 22</div></div><span class="right b">1 h</span></div>
      </div>
      <div class="btns"><span class="btn pri">Enviar semana para aprobar</span></div>
    </div></div>
    <div class="sub">Te sugiere horas de turnos, tareas y reuniones. Tú confirmas, tu líder aprueba.</div>${foot}` },

  { name: '07-reporte-cliente', html: () => `${head('Reporte de horas', 'Las horas al cliente, <em>en un clic</em>')}
    <div class="mock"><div class="panel">
      <div class="muted small">REPORTE DE HORAS · OCTUBRE 2026</div>
      <div class="title" style="margin-top:8px;font-size:42px">Estudio Pérez & Asociados</div>
      <div class="rows" style="margin-top:30px">
        <div class="row">Cierre de mes<span class="right b">18 h</span></div>
        <div class="row">Liquidación de impuestos<span class="right b">14,5 h</span></div>
        <div class="row">Reuniones<span class="right b">10 h</span></div>
        <div class="row b">Total aprobado<span class="right" style="color:#5b21e6;font-size:40px">42,5 h</span></div>
      </div>
      <div class="btns"><span class="btn">📄 PDF</span><span class="btn">🔗 Link</span><span class="btn pri">✉️ Enviar</span></div>
    </div></div>
    <div class="sub">Solo horas aprobadas. Por PDF, link privado o email directo al cliente.</div>${foot}` },

  { name: '08-proyectos', violet: true, html: () => `${head('Proyectos', 'Tu próximo proyecto <em>ya tiene plantilla</em>')}
    <div class="mock"><div class="panel"><div class="rows">
      <div class="row" style="display:block"><div style="display:flex"><span class="b">🧾 Cierre de mes · 10/2026</span><span class="right muted">72%</span></div><div class="bar"><i style="width:72%"></i></div></div>
      <div class="row" style="display:block"><div style="display:flex"><span class="b">📣 Lanzamiento de campaña</span><span class="right muted">40%</span></div><div class="bar"><i style="width:40%"></i></div></div>
      <div class="row" style="display:block"><div style="display:flex"><span class="b">🤝 Alta de cliente nuevo</span><span class="right muted">15%</span></div><div class="bar"><i style="width:15%"></i></div></div>
    </div>
    <div class="btns"><span class="btn">En blanco</span><span class="btn pri">Usar plantilla</span></div>
    </div></div>
    <div class="sub">Fases, tareas asignadas por rol y avance. Empieza de cero o con la plantilla de tu rubro.</div>${foot}` },

  { name: '09-tareas', html: () => `${head('Tareas', 'Cada tarea con <em>dueño, fecha</em> y su chat')}
    <div class="mock"><div class="panel">
      <div class="row"><span class="ic">✅</span><div><div class="title">Conciliar bancos</div><div class="muted small">Vence vie 31/10 · Lucía Gómez</div></div><span class="right pill p-v">⏱ 1:24</span></div>
      <div style="margin-top:20px">
        <div class="bubble them"><span class="who">Lucía</span><span class="mention">@Diego</span> ¿me pasas el extracto de octubre?</div>
        <div class="bubble me"><span class="who">Diego</span>Listo, ya está subido 👍</div>
      </div>
    </div></div>
    <div class="sub">Menciones con aviso, recordatorios y cuánto tiempo llevó cada tarea.</div>${foot}` },

  { name: '10-ventas', violet: true, html: () => `${head('CRM de ventas', '¿Dónde viven tus <em>oportunidades?</em>')}
    <div class="mock"><div class="panel kan">
      <div class="col"><h4>Contacto</h4><div class="deal">Clínica Norte<span>Diego · hoy</span></div><div class="deal">Ferretería Sur<span>Camila · mañana</span></div></div>
      <div class="col"><h4>Propuesta</h4><div class="deal hot">Estudio Vidal<span>Enviar propuesta</span></div><div class="deal">Lab Andino<span>Llamar el jueves</span></div></div>
      <div class="col"><h4>Cierre</h4><div class="deal">Café Central<span>✓ Ganada</span></div></div>
    </div></div>
    <div class="sub">Un embudo con tus etapas, tareas y próximos pasos. No en el correo de cada vendedor.</div>${foot}` },

  { name: '11-nomina', html: () => `${head('Nómina', 'Sueldos y recibos, <em>ordenados</em>')}
    <div class="mock"><div class="panel">
      <div class="row"><span class="ic">🧾</span><div><div class="title">Liquidación octubre</div><div class="muted small">12 personas</div></div><span class="right pill p-ok">Cerrada</span></div>
      <div class="rows" style="margin-top:28px">
        <div class="row"><span class="av sm a1">LG</span>Lucía Gómez<span class="right pill p-ok">Recibo enviado</span></div>
        <div class="row"><span class="av sm a3">CL</span>Camila López<span class="right pill p-ok">Recibo enviado</span></div>
        <div class="row"><span class="av sm a5">TP</span>Tomás Paz<span class="right pill p-v">Contrato confirmado</span></div>
      </div>
    </div></div>
    <div class="sub">Liquidaciones, recibos y contratos confirmados por cada persona. Northstack lleva el registro: no paga ni mueve dinero.</div>${foot}` },

  { name: '12-roles', violet: true, html: () => `${head('Roles y permisos', 'No todos tienen que ver <em>los sueldos</em>')}
    <div class="mock"><div class="panel"><div class="rows">
      <div class="row"><span class="ic">🧾</span>Gestionar nómina<span class="right pill p-v">RR. HH.</span></div>
      <div class="row"><span class="ic">🌴</span>Aprobar vacaciones<span class="right pill p-v">Líderes</span></div>
      <div class="row"><span class="ic">📊</span>Ver paneles<span class="right pill p-v">Dirección</span></div>
      <div class="row"><span class="ic">👤</span>Ver sus propios datos<span class="right pill p-ok">Todos</span></div>
    </div></div></div>
    <div class="sub">Crea los roles que tu empresa necesita y decide qué ve y qué hace cada uno.</div>${foot}` },

  { name: '13-asistente-ia', html: () => `${head('Asistente de IA', 'Pregúntale a <em>tu IA</em> por tu equipo')}
    <div class="mock"><div class="panel">
      <div class="bubble me" style="margin-top:0">¿Quién está de vacaciones la semana que viene?</div>
      <div class="bubble them">Martina (10 al 14/11) y Tomás (viernes 14). Además, el sábado queda 1 turno sin cubrir en Sede Palermo. ¿Te sugiero quién puede tomarlo?</div>
      <div class="bubble me">Sí, dale</div>
    </div></div>
    <div class="sub">Conecta tu propio asistente (Claude, ChatGPT…). Solo puede hacer lo que tú puedes.</div>${foot}` },

  { name: '14-seguridad', violet: true, html: () => `${head('Seguridad', 'Verificación <em>en dos pasos</em>')}
    <div class="mock"><div class="panel" style="text-align:center">
      <div style="font-size:72px">🔐</div>
      <div class="title" style="margin-top:12px">Ingresa el código de tu app</div>
      <div class="muted small" style="margin-top:8px">Google Authenticator, Microsoft Authenticator…</div>
      <div class="code"><span>4</span><span>8</span><span>2</span><span>9</span><span>1</span><span class="on">3</span></div>
      <div class="row" style="justify-content:center;margin-top:30px;font-size:28px"><span class="pill p-ok">✓ Recordar este dispositivo 30 días</span></div>
    </div></div>
    <div class="sub">En todos los planes, sin costo extra. Porque ahí están los datos de tu equipo.</div>${foot}` },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const e of ESTADOS) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s${e.violet ? ' violet' : ''}">${e.html()}</div></body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Flag anything that spills past the bottom safe zone.
  const over = await page.evaluate(() => document.querySelector('.foot').getBoundingClientRect().top < document.querySelector('.sub').getBoundingClientRect().bottom + 20);
  const out = path.join(OUT, `${e.name}.png`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  console.log(over ? 'OVERFLOW' : 'ok', path.relative(ROOT, out));
}
await browser.close();
