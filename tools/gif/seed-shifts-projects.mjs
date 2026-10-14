// Fills the disposable "Acme Latam" demo tenant (STAGING, through a local backend started against the
// staging DB) with shifts and projects for the LinkedIn GIFs. Idempotent: skips what already exists.
//   node seed-shifts-projects.mjs
import fs from 'node:fs';
const API = 'http://localhost:3000';
const T = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
const U = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-timeoff-users.json', 'utf8'));
async function call(path, method = 'GET', body, tk = T) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${tk}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j)}`);
  return j;
}
const WEEK = process.env.WEEK || '2026-10-19'; // Monday of the week shown in the GIF
const day = (i) => new Date(Date.parse(WEEK + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10);
const emps = await call('/api/hr/employees');
const emp = (fn) => emps.find((e) => e.firstName === fn).id;

// ---- Shifts: two locations, one week
let { locations } = await call('/api/shifts/locations');
for (const [name, address] of [['Palermo', 'Av. Santa Fe 3200'], ['Belgrano', 'Av. Cabildo 1800']]) {
  if (!locations.some((l) => l.name === name)) await call('/api/shifts/locations', 'POST', { name, address, timezone: 'America/Argentina/Buenos_Aires' });
}
({ locations } = await call('/api/shifts/locations'));
const loc = (n) => locations.find((l) => l.name === n).id;
const existing = await call(`/api/shifts?from=${day(0)}&to=${day(6)}`);
const list = existing;
if (list.length === 0) {
  const M = (h, m = 0) => h * 60 + m;
  // [location, dayIndex, start, end, people]
  const plan = [];
  for (let d = 0; d < 6; d++) {
    plan.push(['Palermo', d, M(7), M(15), d % 2 ? ['Casey', 'Camila'] : ['Martina', 'Diego']]);
    plan.push(['Palermo', d, M(15), M(23), d % 2 ? ['Diego'] : ['Mika']]);
    plan.push(['Belgrano', d, M(8), M(16), d % 3 ? ['Jordan', 'Priya'] : ['Valentina']]);
    if (d < 5) plan.push(['Belgrano', d, M(16), M(0), d % 2 ? ['Mateo'] : ['Devon']]);
  }
  plan.push(['Palermo', 4, M(23), M(7), ['Tomás']]); // overnight Friday → Saturday
  plan.push(['Belgrano', 5, M(16), M(22), []]); // uncovered
  const ids = [];
  for (const [l, d, s, e, people] of plan) {
    const sh = await call('/api/shifts', 'POST', { locationId: loc(l), date: day(d), startMinute: s, endMinute: e, headcount: Math.max(1, people.length) });
    if (people.length) await call(`/api/shifts/${sh.id}/assignments`, 'POST', { employeeIds: people.map(emp), force: true }).catch((err) => console.log('assign', l, d, err.message));
    ids.push(sh.id);
  }
  // Publish all but the last two days at Belgrano, so the GIF can show the drafts → publish step.
  const all = await call(`/api/shifts?from=${day(0)}&to=${day(6)}`);
  const shifts = all;
  const publishIds = shifts.filter((s) => !(s.locationId === loc('Belgrano') && s.date >= day(4))).map((s) => s.id);
  await call('/api/shifts/publish', 'POST', { shiftIds: publishIds });
  // Casey and Martina confirm theirs; everyone else stays "no answer".
  for (const tk of [U.employeeToken, U.managerToken]) {
    const mine = await call(`/api/shifts/mine?from=${day(0)}&to=${day(6)}`, 'GET', undefined, tk);
    for (const s of mine) {
      const a = s.assignments[0];
      if (a?.id && a.status === 'pending') await call(`/api/shifts/assignments/${a.id}/respond`, 'POST', { response: 'accepted' }, tk).catch((err) => console.log('respond', err.message));
    }
  }
  console.log('shifts created', ids.length, 'published', publishIds.length);
} else console.log('shifts already there', list.length);

// ---- Projects: a few from system templates, at different progress
const { templates } = await call('/api/project-templates');
const { projects } = await call('/api/projects');
const companies = await call('/api/companies');
const cid = (n) => companies.find((c) => c.name === n)?.id;
const tpl = (en) => templates.find((t) => t.name === en || t.name?.en === en);
console.log('templates', templates.map((t) => t.name).join(' | '));
fs.writeFileSync('seed.out.json', JSON.stringify({ week: WEEK, locations, templates: templates.map((t) => ({ id: t.id, name: t.name })), projects: projects.map((p) => p.name) }, null, 2));

// Three monthly closes at different progress, so the Projects list shows real-looking bars. Phase,
// task and role names are copied from the template in the admin's language, so the projects are
// rebuilt for each GIF language:  LANG=es|en node seed-shifts-projects.mjs
const LANG = process.env.LANG_GIF || 'es';
await call('/api/users/me/locale', 'PATCH', { locale: LANG });
for (const p of projects.filter((p) => p.name.endsWith('· 10/2026'))) await call(`/api/projects/${p.id}`, 'PATCH', { isActive: false }).catch(() => {});
const { templates: tl } = await call(`/api/project-templates?locale=${LANG}`);
const close = tl.find((t) => t.name === 'Monthly close' || t.name === 'Cierre mensual');
const role = (re) => close.roles.find((r) => re.test(r));
const me = (await call('/api/auth/me')).user;
const meEmp = emps.find((e) => e.firstName === me.firstName && e.lastName === me.lastName)?.id;
for (const [company, done] of [['Pampa Foods', 0.8], ['Mercado Norte', 0.45], ['Río Tech', 0.15]]) {
  const name = `${company} · 10/2026`;
  const p = await call('/api/projects/from-template', 'POST', {
    templateId: close.id, name, companyId: cid(company), startDate: '2026-10-01', dueDate: '2026-10-30',
    ownerEmployeeId: meEmp, members: [{ employeeId: emp('Camila'), projectRole: role(/assist|asist/i) }, { employeeId: emp('Mateo'), projectRole: role(/accountant|contador/i) }, { employeeId: meEmp, projectRole: role(/partner|socio/i) }],
  });
  const tasks = await call(`/api/tasks?entityType=project&entityId=${p.id}`);
  const list = (Array.isArray(tasks) ? tasks : tasks.tasks || []).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const n = Math.round(list.length * done);
  for (const t of list.slice(0, n)) await call(`/api/tasks/${t.id}`, 'PATCH', { completedAt: new Date().toISOString() }).catch((err) => console.log('task', err.message));
  console.log('project', name, `${n}/${list.length} done`);
}
