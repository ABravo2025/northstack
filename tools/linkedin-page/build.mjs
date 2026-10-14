// Builds the copy-and-paste page for every LinkedIn post (ES/EN) from the .md files in the week
// folders, so the page always matches the branch.  node build.mjs <out.html>
// Prints the asset list (published path → source) as JSON for the Artifact publish.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const out = process.argv[2];

// [week label, date ES, date EN, md base (no -es/-en), visual per lang (path pattern with {l}), pdf?]
const POSTS = [
  ['Semana del 12 oct', '2026-10-14', '2026-10/semana-03/linkedin/01-turnos', '2026-10/semana-03/gif/turnos-{l}.gif'],
  ['Semana del 12 oct', '2026-10-16', '2026-10/semana-03/linkedin/02-pedido-cliente', '2026-10/semana-03/gif/turnos-{l}.gif'],
  ['Semana del 19 oct', '2026-10-20', '2026-10/semana-04/linkedin/01-senales', '2026-10/semana-04/imagenes/carrusel-5-senales-{l}-portada.png', '2026-10/semana-04/imagenes/carrusel-5-senales-{l}.pdf'],
  ['Semana del 19 oct', '2026-10-21', '2026-10/semana-04/linkedin/02-proyectos', '2026-10/semana-03/gif/proyectos-{l}.gif'],
  ['Semana del 19 oct', '2026-10-22', '2026-10/semana-04/linkedin/03-vacaciones', '2026-10/semana-03/gif/vacaciones-{l}.gif'],
  ['Semana del 26 oct', '2026-10-27', '2026-10/semana-05/linkedin/01-crm', '2026-10/semana-05/imagenes/crm-{l}.png'],
  ['Semana del 26 oct', '2026-10-28', '2026-10/semana-05/linkedin/02-onboarding', '2026-10/semana-05/imagenes/onboarding-{l}.png'],
  ['Semana del 26 oct', '2026-10-29', '2026-10/semana-05/linkedin/03-roles', '2026-10/semana-05/imagenes/roles-{l}.png'],
  ['Semana del 2 nov', '2026-11-03', '2026-11/semana-01/linkedin/01-calendario', '2026-11/semana-01/imagenes/calendario-{l}.png'],
  ['Semana del 2 nov', '2026-11-04', '2026-11/semana-01/linkedin/02-reemplaza', '2026-11/semana-01/imagenes/reemplaza-{l}.png'],
];

const assets = {};
const parse = (file) => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  const title = s.match(/^# Post \d+ · (.+?) \((?:ES|EN)\)/m)?.[1] ?? '';
  const parts = s.split(/\n---\n/);
  const head = parts[0];
  const where = head.match(/\*\*(?:Dónde|Where):\*\* ([^·]+?)(?: ·|\n\*\*)/s)?.[1].replace(/\s+/g, ' ').trim() ?? '';
  const pillar = head.match(/\*\*(?:Pilar|Pillar):\*\* ([^·]+?) ·/s)?.[1].replace(/\s+/g, ' ').trim() ?? '';
  const note = head.match(/^> (.+)$/m)?.[1] ?? '';
  const body = (parts[1] ?? '').trim();
  const tail = parts.slice(2).join('\n---\n');
  const comment = tail.match(/## (?:Primer comentario|First comment)[^\n]*\n([\s\S]*?)(?:\n## |$)/)?.[1].trim() ?? '';
  return { title, where, pillar, note, body, comment };
};
const data = POSTS.map(([week, date, base, visual, pdf]) => {
  const p = { week, date, pdf: !!pdf };
  for (const l of ['es', 'en']) {
    p[l] = parse(`${base}-${l}.md`);
    const v = visual.replace('{l}', l);
    assets[v] = v;
    p[l].visual = v;
    p[l].isGif = v.endsWith('.gif');
    if (pdf) { const d = pdf.replace('{l}', l); assets[d] = d; p[l].pdf = d; }
    p[l].source = `${base}-${l}.md`;
  }
  return p;
});

const tpl = fs.readFileSync(path.join(import.meta.dirname, 'page.html'), 'utf8');
fs.writeFileSync(out, tpl.replace('/*__DATA__*/[]', JSON.stringify(data).replace(/</g, '\\u003c')));
console.log(JSON.stringify(assets));
