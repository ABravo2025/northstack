// Puts a big, readable hook card in front of each product GIF, so the first frame LinkedIn shows in the
// feed is the post's hook instead of a small, dimmed screenshot.
//   PW_DIR=... CHROME=... node hook-gif.mjs   → 2026-10/semana-03/gif/<mod>-<lang>.gif (overwritten)
// Keeps the original recording as <mod>-<lang>-app.gif the first time it runs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.PW_DIR, 'x.js'));
const { chromium } = require('playwright');
const FF = path.join(process.env.PW_DIR, 'node_modules/ffmpeg-static/ffmpeg.exe');
const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, '2026-10/semana-03/gif');
const LOGO = fs.readFileSync(path.join(ROOT, '2026-10/semana-01/directorios/logo/northstack-icon-color.svg'), 'utf8');

const HOOKS = {
  turnos: { es: ['“¿Viste el turno del sábado?”', 'Visto, sin respuesta.'], en: ['“Did you see Saturday’s shift?”', 'Seen, no reply.'] },
  proyectos: { es: ['El mismo cierre, todos los meses.', 'Y siempre empezando de cero.'], en: ['Same month-end close, every month.', 'And always from scratch.'] },
  vacaciones: { es: ['¿Cuántos días de vacaciones le quedan a cada uno?', 'Respuesta en 10 segundos.'], en: ['How many vacation days does everyone have left?', 'Answered in 10 seconds.'] },
};
const CSS = `@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;700&family=Instrument+Serif:ital@1&display=swap');
*{margin:0;box-sizing:border-box}body{width:800px;height:800px;font-family:'Instrument Sans',system-ui,sans-serif}
.c{width:800px;height:800px;padding:64px;display:flex;flex-direction:column;background:linear-gradient(140deg,#4a16c9 0%,#5b21e6 45%,#8a5bff 100%);color:#fff}
.b{display:flex;align-items:center;gap:14px;font-weight:700;font-size:28px}.m{width:52px;height:52px;border-radius:14px;background:#fff;display:grid;place-items:center}.m svg{width:34px;height:34px}
h1{margin-top:auto;font-size:76px;line-height:1.02;letter-spacing:-.035em;font-weight:700;text-wrap:balance}
p{margin-top:26px;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:52px;color:#e3d8ff}
.s{margin-top:auto;font-size:24px;font-weight:500;color:#e3d8ff}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
const tmp = path.join(import.meta.dirname, 'tmp-hook');
fs.mkdirSync(tmp, { recursive: true });
for (const mod of Object.keys(HOOKS)) for (const lang of ['es', 'en']) {
  const [h, sub] = HOOKS[mod][lang];
  const app = path.join(DIR, `${mod}-${lang}-app.gif`), out = path.join(DIR, `${mod}-${lang}.gif`);
  if (!fs.existsSync(app)) fs.copyFileSync(out, app);
  await page.setContent(`<style>${CSS}</style><div class="c"><div class="b"><span class="m">${LOGO}</span>Northstack</div><h1>${h}</h1><p>${sub}</p><div class="s">${lang === 'es' ? 'Mira cómo se resuelve ↓' : 'See how it’s solved ↓'}</div></div>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const card = path.join(tmp, `${mod}-${lang}.png`);
  await page.screenshot({ path: card });
  // 3 s hook card → cross-fade → the app recording; one palette for both.
  const mp4 = path.join(tmp, `${mod}-${lang}.mp4`);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-loop', '1', '-t', '3', '-framerate', '12', '-i', card, '-i', app,
    '-filter_complex', '[0:v]scale=800:800,fps=12,format=yuv420p,setsar=1[a];[1:v]scale=800:800,fps=12,format=yuv420p,setsar=1[b];[a][b]xfade=transition=fade:duration=0.5:offset=2.5,format=yuv420p[v]',
    '-map', '[v]', '-c:v', 'libx264', '-crf', '14', mp4]);
  const pal = path.join(tmp, 'pal.png');
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=12,palettegen=max_colors=128:stats_mode=diff', pal]);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-i', pal, '-lavfi', 'fps=12[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', out]);
  console.log(path.basename(out), (fs.statSync(out).size / 1048576).toFixed(2), 'MB');
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
