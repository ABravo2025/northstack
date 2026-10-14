// frames-<mod>-<lang>/ (from record-gif.mjs) → ../../2026-10/semana-03/gif/<mod>-<lang>.gif
// LinkedIn only animates GIFs under 5 MB and 400 frames, so it steps down size/fps until it fits.
//   node make-gif.mjs <mod> <lang> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const [mod, lang, outDir] = process.argv.slice(2);
const FF = path.join(process.env.PW_DIR, 'node_modules/ffmpeg-static/ffmpeg.exe');
const dir = path.resolve(`frames-${mod}-${lang}`);
const { frames, segs } = JSON.parse(fs.readFileSync(`${dir}/timeline.json`, 'utf8'));
const tmp = path.resolve(`tmp-${mod}-${lang}`);
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);

// One concat list over all segments (cuts between them are hard cuts; each segment starts on a new scene).
let txt = 'ffconcat version 1.0\n', last = null, total = 0;
for (const [a, b] of segs) {
  const inSeg = frames.filter((f) => f.t > a && f.t < b);
  const before = [...frames].reverse().find((f) => f.t <= a) || frames[0];
  const list = [{ ...before, t: a }, ...inSeg];
  list.forEach((f, k) => {
    const next = k + 1 < list.length ? list[k + 1].t : b;
    txt += `file '${path.join(dir, f.file).replace(/\\/g, '/')}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
    last = f;
  });
  total += b - a;
}
txt += `file '${path.join(dir, last.file).replace(/\\/g, '/')}'\n`;
fs.writeFileSync(`${tmp}/list.txt`, txt);
const mp4 = `${tmp}/clip.mp4`;
execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${tmp}/list.txt`, '-vf', 'fps=24,format=yuv420p', '-c:v', 'libx264', '-crf', '14', mp4]);

fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${mod}-${lang}.gif`);
for (const [w, fps, colors] of [[800, 12, 128], [760, 10, 96], [700, 10, 64], [640, 8, 64]]) {
  const pal = `${tmp}/pal.png`;
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,palettegen=max_colors=${colors}:stats_mode=diff`, pal]);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-i', pal, '-lavfi', `fps=${fps},scale=${w}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', out]);
  const mb = fs.statSync(out).size / 1048576, nFrames = Math.ceil(total * fps);
  console.log(`${path.basename(out)}: ${w}px ${fps}fps ${colors} colors → ${mb.toFixed(2)} MB, ~${nFrames} frames, ${total.toFixed(1)} s`);
  if (mb < 4.8 && nFrames < 400) break;
}
