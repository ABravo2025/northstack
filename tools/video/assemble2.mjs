// node assemble2.mjs es square → northstack-demo-<lang>-<1x1|16x9>.mp4
// Frames (CDP screencast, variable rate) → one clip per segment at 30 fps → cross-faded together →
// uplifting music (music2.py) cut to the exact length.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const [lang, format] = process.argv.slice(2);
const FF = path.resolve('../pw/node_modules/ffmpeg-static/ffmpeg.exe');
const dir = path.resolve(`frames-${lang}-${format}`);
const { frames, segs, size } = JSON.parse(fs.readFileSync(`${dir}/timeline.json`, 'utf8'));
const FADE = 0.5;
const W = size[0] - (size[0] % 2), H = size[1] - (size[1] % 2);
const tmp = path.resolve(`tmp-${lang}-${format}`);
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);

const clips = [];
segs.forEach(([a, b], i) => {
  if (b - a < FADE * 2 + 0.2) return;
  const inSeg = frames.filter((f) => f.t > a && f.t < b);
  const before = [...frames].reverse().find((f) => f.t <= a) || frames[0];
  const list = [{ ...before, t: a }, ...inSeg];
  let txt = 'ffconcat version 1.0\n';
  list.forEach((f, k) => {
    const next = k + 1 < list.length ? list[k + 1].t : b;
    txt += `file '${path.join(dir, f.file).replace(/\\/g, '/')}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
  });
  txt += `file '${path.join(dir, list[list.length - 1].file).replace(/\\/g, '/')}'\n`;
  fs.writeFileSync(`${tmp}/seg${i}.txt`, txt);
  const out = `${tmp}/seg${i}.mp4`;
  execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${tmp}/seg${i}.txt`, '-vf', `scale=${W}:${H}:flags=lanczos,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out]);
  clips.push({ file: out, dur: b - a });
});

// Cross-fade chain
let filter = '', last = '[0:v]', offset = 0;
clips.slice(1).forEach((c, k) => {
  offset += clips[k].dur - FADE;
  const label = `[x${k + 1}]`;
  filter += `${last}[${k + 1}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label};`;
  last = label;
});
const total = clips.reduce((t, c) => t + c.dur, 0) - FADE * (clips.length - 1);
execFileSync('python', ['music2.py', `${tmp}/music.wav`, total.toFixed(2)], { stdio: 'inherit' });
const out = `northstack-demo-${lang}-${format === 'square' ? '1x1' : '16x9'}.mp4`;
const args = ['-y', '-loglevel', 'error', ...clips.flatMap((c) => ['-i', c.file]), '-i', `${tmp}/music.wav`,
  '-filter_complex', `${filter}${last}format=yuv420p[v]`, '-map', '[v]', '-map', `${clips.length}:a`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out];
execFileSync(FF, args, { stdio: 'inherit' });
execFileSync(FF, ['-y', '-loglevel', 'error', '-i', out, '-vf', `fps=1/2.5,scale=${format === 'square' ? 300 : 400}:-1,tile=5x5`, '-frames:v', '1', `sheet2-${lang}-${format}.png`]);
console.log('wrote', out, total.toFixed(1) + 's', clips.length, 'clips');
