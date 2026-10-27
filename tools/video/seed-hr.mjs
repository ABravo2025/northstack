// Prepares the disposable "Acme Latam" demo tenant (STAGING, through the local backend) for the HR
// video: catalog names in the take's language, who is out this week, a pending time-off request,
// today's clock-ins, last week's timesheets waiting for approval and a new hire's onboarding project.
//   API=http://localhost:3317 LANG_VIDEO=es|en TODAY=2026-10-26 node seed-hr.mjs
// Run it right before each take: it re-creates whatever the previous take approved.
import fs from 'node:fs';
const API = process.env.API || 'http://localhost:3000';
const LANG = process.env.LANG_VIDEO || 'es';
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const T = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
const USERS = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-timeoff-users.json', 'utf8'));
const PASSWORD = 'Demo-Acme-2026!';
async function call(path, method = 'GET', body, tk = T) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${tk}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j)}`);
  return j;
}
const soft = (p) => p.catch((e) => console.log('  ·', e.message.slice(0, 160)));
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const monday = (d) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const WEEK = monday(TODAY), LAST = addDays(WEEK, -7);
// Buenos Aires local time → ISO
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00-03:00`).toISOString();

await call('/api/users/me/locale', 'PATCH', { locale: LANG });
let emps = await call('/api/hr/employees');
const emp = (first) => emps.find((e) => e.firstName === first);
const tokens = {};
const tokenOf = async (first) => {
  if (first === 'Casey') return USERS.employeeToken;
  if (first === 'Martina') return USERS.managerToken;
  if (!tokens[first]) tokens[first] = (await call('/api/auth/login', 'POST', { email: emp(first).email, password: PASSWORD }, null)).session?.token;
  return tokens[first];
};

// ---- 1. Catalog names in the take's language (they are the company's data, shown as typed)
const NAMES = {
  department: [['Engineering', 'Ingeniería'], ['Sales', 'Ventas'], ['Operations', 'Operaciones'], ['Marketing', 'Marketing'], ['Finance', 'Finanzas'], ['People', 'Personas']],
  jobTitle: [['Software Engineer', 'Desarrollador/a'], ['Account Executive', 'Ejecutivo/a de cuentas'], ['Operations Manager', 'Jefe/a de operaciones'], ['Product Designer', 'Diseñador/a de producto'], ['Marketing Lead', 'Líder de marketing'], ['Finance Analyst', 'Analista de finanzas'], ['Head of Sales', 'Gerente de ventas'], ['Customer Success', 'Atención al cliente'], ['HR Manager', 'Responsable de RR.HH.'], ['Store Associate', 'Vendedor/a de tienda']],
};
const cat = {};
for (const [kind, pairs] of Object.entries(NAMES)) {
  const existing = await call(`/api/field-catalog?kind=${kind}`);
  cat[kind] = {};
  for (const [en, es] of pairs) {
    let item = existing.find((x) => x.name === en || x.name === es);
    const want = LANG === 'es' ? es : en;
    if (!item) item = await call('/api/field-catalog', 'POST', { kind, name: want });
    else if (item.name !== want) await soft(call(`/api/field-catalog/${item.id}`, 'PATCH', { name: want }));
    cat[kind][en] = item.id;
  }
}
// Everyone gets a department, title and start date, so the People table has no gaps.
const PROFILE = {
  Laura: ['People', 'HR Manager', '2022-02-01'], Martina: ['Operations', 'Operations Manager', '2023-04-10'],
  Jordan: ['Sales', 'Account Executive', '2024-07-01'], Mika: ['Operations', 'Store Associate', '2025-03-17'],
  Casey: ['Operations', 'Store Associate', '2024-09-02'], Priya: ['Sales', 'Account Executive', '2025-02-03'],
  Devon: ['Operations', 'Store Associate', '2025-05-12'], Valentina: ['Operations', 'Store Associate', '2025-01-13'],
  Diego: ['Operations', 'Store Associate', '2024-05-20'],
};
for (const [first, [d, t, start]] of Object.entries(PROFILE)) {
  const e = emp(first);
  if (!e) continue;
  const patch = {};
  if (e.departmentId !== cat.department[d]) patch.departmentId = cat.department[d];
  if (e.jobTitleId !== cat.jobTitle[t]) patch.jobTitleId = cat.jobTitle[t];
  if (!e.startDate) patch.startDate = start;
  if (Object.keys(patch).length) await soft(call(`/api/hr/employees/${e.id}`, 'PATCH', patch));
}
const statuses = await call('/api/status-definitions?entityType=employee').catch(() => []);
for (const st of (Array.isArray(statuses) ? statuses : statuses.statuses || []).filter((x) => x.entityType === 'employee')) {
  const pair = [['Active', 'Activo'], ['Inactive', 'Inactivo']].find((p) => p.includes(st.name));
  const want = pair && pair[LANG === 'es' ? 1 : 0];
  if (want && st.name !== want) await soft(call(`/api/status-definitions/${st.id}`, 'PATCH', { name: want }));
}
console.log('catalog + profiles ok');

// ---- 2. Time off: Lucía and Tomás out this week, one pending request (Casey) to approve on camera
const vac = (await call('/api/time-off-policies')).find((p) => p.name === 'Vacaciones');
let reqs = await call('/api/hr/time-off-requests?scope=team');
// Martina has shifts this week, so her old demo vacation there would contradict the Today board.
for (const r of reqs.filter((r) => r.employee?.firstName === 'Martina' && ['approved', 'pending'].includes(r.status) && r.startDate.slice(0, 10) <= addDays(WEEK, 6) && r.endDate.slice(0, 10) >= WEEK)) {
  await soft(call(`/api/hr/time-off-requests/${r.id}`, 'PATCH', { status: 'rejected', decisionNote: 'Demo' }));
  await soft(call(`/api/hr/time-off-requests/${r.id}`, 'DELETE', undefined, USERS.managerToken));
}
for (const [first, from, to, note] of [['Lucía', WEEK, addDays(WEEK, 4), LANG === 'es' ? 'Viaje familiar' : 'Family trip'], ['Tomás', addDays(WEEK, 3), addDays(WEEK, 4), LANG === 'es' ? 'Mudanza' : 'Moving day']]) {
  // The team list doesn't include every decided request, so check the person's own list.
  const own = await call('/api/hr/time-off-requests', 'GET', undefined, await tokenOf(first)).catch(() => []);
  if (own.some((r) => ['approved', 'pending'].includes(r.status) && r.startDate.slice(0, 10) === from)) continue;
  const e = emp(first);
  const assigned = await call(`/api/hr/employees/${e.id}/time-off-policies`).catch(() => []);
  if (!JSON.stringify(assigned).includes(vac.id)) await soft(call(`/api/hr/employees/${e.id}/time-off-policies`, 'POST', { timeOffPolicyId: vac.id }));
  await soft(call(`/api/hr/employees/${e.id}/time-off-adjustments`, 'POST', { timeOffPolicyId: vac.id, days: 5, reason: 'Demo video' }));
  const r = await call('/api/hr/time-off-requests', 'POST', { timeOffPolicyId: vac.id, startDate: from, endDate: to, note }, await tokenOf(first)).catch((e) => console.log('  · request', first, e.message));
  if (r?.id) await soft(call(`/api/hr/time-off-requests/${r.id}`, 'PATCH', { status: 'approved' }));
}
reqs = await call('/api/hr/time-off-requests?scope=team');
if (!reqs.some((r) => r.status === 'pending' && r.employee?.firstName === 'Casey')) {
  await soft(call(`/api/hr/employees/${emp('Casey').id}/time-off-adjustments`, 'POST', { timeOffPolicyId: vac.id, days: 3, reason: 'Demo video' }));
  await soft(call('/api/hr/time-off-requests', 'POST', { timeOffPolicyId: vac.id, startDate: '2026-12-14', endDate: '2026-12-16', note: LANG === 'es' ? 'Trámites personales' : 'Personal errands' }, USERS.employeeToken));
}
console.log('time off ok; pending:', (await call('/api/hr/time-off-requests?scope=team')).filter((r) => r.status === 'pending').map((r) => r.employee?.firstName).join(', '));

// ---- 3. Clock-in on, and today's shifts clocked in/out at realistic times
const { locations } = await call('/api/clock/locations');
for (const l of locations.filter((l) => l.isActive && l.clockMethod !== 'qr_or_app')) await soft(call(`/api/clock/locations/${l.id}`, 'PATCH', { clockMethod: 'qr_or_app' }));
const shifts = await call(`/api/shifts?from=${TODAY}&to=${TODAY}`);
const TIMES = { // first name → [in, out|null] (Buenos Aires time)
  Martina: ['06:56', '15:03'], Diego: ['07:02', '15:00'], Valentina: ['07:54', '16:05'], Mika: ['14:58', null], Devon: ['15:57', null],
};
const board = await call('/api/clock/board');
const already = new Set(board.locations.flatMap((l) => (l.rows || l.people || []).filter((r) => r.entry || r.clockInAt || r.in).map((r) => r.employeeName || r.name || r.employee?.firstName)));
for (const s of shifts) {
  for (const a of s.assignments || []) {
    const first = a.employee?.firstName || emps.find((e) => e.id === a.employeeId)?.firstName;
    if (!TIMES[first] || [...already].some((n) => String(n).startsWith(first))) continue;
    const tk = await tokenOf(first);
    const entry = await call('/api/clock/in', 'POST', { locationId: s.locationId }, tk).catch((e) => console.log('  · in', first, e.message));
    if (!entry?.id) continue;
    const [i, o] = TIMES[first];
    if (o) await soft(call('/api/clock/out', 'POST', { breakMinutes: 30 }, tk));
    await soft(call(`/api/clock/entries/${entry.id}`, 'PATCH', { clockInAt: at(TODAY, i), ...(o ? { clockOutAt: at(TODAY, o), breakMinutes: 30 } : {}), reason: 'Demo', markReviewed: true }));
    console.log('  clock', first, i, o ?? '(in)');
  }
}

// ---- 4. Last week's timesheets, submitted and waiting for approval
const WHO = { Valentina: 480, Diego: 480, Mika: 450, Devon: 465, Casey: 420 };
const DESC = LANG === 'es' ? ['Atención en tienda', 'Reposición', 'Cierre de caja', 'Inventario'] : ['Store floor', 'Restocking', 'Till close', 'Inventory'];
for (const [first, mins] of Object.entries(WHO)) {
  const tk = await tokenOf(first);
  const ts = await call(`/api/shifts/timesheet?weekStart=${LAST}`, 'GET', undefined, tk).catch(() => null);
  let status = ts?.timesheet?.status || ts?.status;
  if (status === 'approved') { // approved on camera in an earlier take: reopen so it's waiting again
    await soft(call(`/api/shifts/timesheet/${ts.timesheetId}/reopen`, 'POST', { reason: 'Demo video' }));
    status = 'open';
  }
  if (status && status !== 'draft' && status !== 'open' && status !== 'returned') { console.log('  timesheet', first, status); continue; }
  const have = (ts?.rows || ts?.entries || []).length;
  if (!have) for (let d = 0; d < 5; d++) await soft(call('/api/shifts/timesheet/entries', 'POST', { date: addDays(LAST, d), minutes: mins + (d % 2 ? 15 : -15) * (first.length % 2), description: DESC[(d + first.length) % DESC.length] }, tk));
  await soft(call('/api/shifts/timesheet/submit', 'POST', { weekStart: LAST }, tk));
  console.log('  timesheet', first, 'submitted');
}

// Fictitious CUIL (DNI 99.999.999 does not exist) with a valid check digit; AR companies require one.
const fakeCuil = (pre, dni) => {
  const d = (pre + dni).split('').map(Number), w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const r = 11 - (d.reduce((a, x, i) => a + x * w[i], 0) % 11);
  return `${pre}-${dni}-${r === 11 ? 0 : r === 10 ? 9 : r}`;
};
// ---- 5. New hire + onboarding project from the "Employee onboarding" template
const hire = ['Sofía', 'Paz']; // same person in both takes
if (!emp(hire[0])) {
  await call('/api/hr/employees', 'POST', { firstName: hire[0], lastName: hire[1], email: `${hire[0].toLowerCase()}.${hire[1].toLowerCase()}@acmelatam.example`.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), departmentId: cat.department.Operations, jobTitleId: cat.jobTitle['Store Associate'], personType: 'employee', startDate: addDays(WEEK, 7), taxId: fakeCuil('27', '99999999') });
  emps = await call('/api/hr/employees');
}
const { projects } = await call('/api/projects');
const projName = LANG === 'es' ? `Ingreso · ${hire.join(' ')}` : `Onboarding · ${hire.join(' ')}`;
const START = addDays(WEEK, 7); // the new hire's first day
const keep = projects.find((p) => p.name === projName && p.isActive !== false && String(p.startDate).slice(0, 10) === START);
for (const p of projects.filter((p) => p.isActive !== false && p !== keep && (p.name.endsWith('· 10/2026') || /^(Ingreso|Onboarding) · /.test(p.name)))) await soft(call(`/api/projects/${p.id}`, 'PATCH', { isActive: false }));
// Old demo tasks (monthly closes, earlier onboarding takes) would crowd the Overview calendar.
for (const t of await call('/api/tasks/calendar')) {
  if (keep && t.entityId === keep.id) continue;
  if (t.entityType === 'project' || /Partner review|Revisión del socio|Prepare|Load documents|Reconcile|Review receivabl|File the returns|Send payment|Liquidar|Cargar|Conciliar|Enviar VEP|Presentar|Revisar cuentas|Receive sales|Request bank/.test(t.title)) await soft(call(`/api/tasks/${t.id}`, 'DELETE'));
}
if (!keep) {
  const { templates } = await call(`/api/project-templates?locale=${LANG}`);
  const tpl = templates.find((t) => /Onboarding de empleado|Employee onboarding/.test(t.name));
  const role = (re) => tpl.roles.find((r) => re.test(r));
  const me = emp('Laura');
  const p = await call('/api/projects/from-template', 'POST', {
    templateId: tpl.id, name: projName, startDate: START, dueDate: addDays(START, 30), ownerEmployeeId: me.id,
    members: [{ employeeId: me.id, projectRole: role(/RRHH|HR/) }, { employeeId: emp('Jordan').id, projectRole: role(/^IT$/) }, { employeeId: emp('Martina').id, projectRole: role(/Líder|Manager/) }],
  });
  const tasks = await call(`/api/tasks?entityType=project&entityId=${p.id}`);
  const list = (Array.isArray(tasks) ? tasks : tasks.tasks || []).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const n = list.filter((t) => String(t.dueDate).slice(0, 10) < START).length; // pre-boarding done
  for (const t of list.slice(0, n)) await soft(call(`/api/tasks/${t.id}`, 'PATCH', { completedAt: new Date().toISOString() }));
  console.log('project', projName, `${n}/${list.length} done`);
} else console.log('project already there', projName);
console.log('done', LANG, 'week', WEEK, 'last', LAST);
