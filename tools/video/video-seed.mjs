// Fills the disposable "Acme Latam" demo tenant (STAGING, via the local backend that runs against
// the staging DB) with realistic fictitious data for the product video. Idempotent: skips anything
// that already exists by name.
import fs from 'node:fs';
const API = 'http://localhost:3000';
const T = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
async function call(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${T}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j)}`);
  return j;
}
const log = (...a) => console.log(...a);

const me = (await call('/api/auth/me')).user;

// 1. Catalogs
async function catalog(kind, names) {
  const existing = await call(`/api/field-catalog?kind=${kind}`);
  const out = {};
  for (const n of names) {
    let item = existing.find((x) => x.name === n);
    if (!item) item = await call('/api/field-catalog', 'POST', { kind, name: n });
    out[n] = item.id;
  }
  return out;
}
const dept = await catalog('department', ['Engineering', 'Sales', 'Operations', 'Marketing', 'Finance']);
const title = await catalog('jobTitle', ['Software Engineer', 'Account Executive', 'Operations Manager', 'Product Designer', 'Marketing Lead', 'Finance Analyst', 'Head of Sales', 'Customer Success']);
log('catalogs ok');

// 2. People
const people = [
  ['Lucía', 'Fernández', 'Marketing', 'Marketing Lead', '2024-03-04'],
  ['Tomás', 'Herrera', 'Sales', 'Head of Sales', '2023-08-21'],
  ['Valentina', 'Rossi', 'Engineering', 'Product Designer', '2025-01-13'],
  ['Mateo', 'Silva', 'Finance', 'Finance Analyst', '2024-11-04'],
  ['Camila', 'Ortiz', 'Operations', 'Customer Success', '2025-06-02'],
  ['Diego', 'Navarro', 'Engineering', 'Software Engineer', '2024-05-20'],
];
const emps = await call('/api/hr/employees');
for (const [fn, ln, d, t, start] of people) {
  if (emps.some((e) => e.firstName === fn && e.lastName === ln)) continue;
  const slug = `${fn}.${ln}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  await call('/api/hr/employees', 'POST', { firstName: fn, lastName: ln, email: `${slug}@acmelatam.example`, departmentId: dept[d], jobTitleId: title[t], personType: 'employee', startDate: start });
}
log('people ok', (await call('/api/hr/employees')).length);

// 3. Companies
const companyNames = [['Andes Logistics', 'Logistics', 'Sofía', 'Paredes'], ['Mercado Norte', 'Retail', 'Joaquín', 'Ríos'], ['Pampa Foods', 'Food & Beverage', 'Florencia', 'Molina'], ['Río Tech', 'Software', 'Nicolás', 'Vera'], ['Sur Capital', 'Financial services', 'Agustina', 'Luna'], ['Globant Studio', 'Design', 'Martín', 'Castro']];
let companies = await call('/api/companies');
for (const [n, ind, cf, cl] of companyNames) if (!companies.some((c) => c.name === n)) await call('/api/companies', 'POST', { name: n, industry: ind, contact: { firstName: cf, lastName: cl, email: (cf + '.' + cl + '@' + n.replace(/[^a-z]/gi, '') + '.example').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') } });
companies = await call('/api/companies');
const cid = (n) => companies.find((c) => c.name === n).id;
log('companies ok', companies.length);

// 4. Pipeline: tidy the Leads stages (New → In Progress → Negotiation → Won/Lost; drop test "Closing")
const pipelines = await call('/api/pipelines');
const leads = pipelines.find((p) => p.name === 'Leads');
const st = (n) => leads.stages.find((s) => s.name === n);
const order = ['New', 'In Progress', 'Negotiation', 'Won', 'Lost'];
for (const [i, n] of order.entries()) if (st(n) && st(n).order !== i) await call(`/api/pipelines/${leads.id}/stages/${st(n).id}`, 'PATCH', { order: i });
if (st('Closing')?.isActive) await call(`/api/pipelines/${leads.id}/stages/${st('Closing').id}`, 'PATCH', { isActive: false, order: 9 });
if (st('Negotiation')) await call(`/api/pipelines/${leads.id}/stages/${st('Negotiation').id}`, 'PATCH', { probability: 60 });
log('stages ok');

// 5. Opportunities across stages
const deals = [
  ['Andes Logistics — Plan anual', 'Andes Logistics', 'New', 1200000],
  ['Pampa Foods — Expansión', 'Pampa Foods', 'New', 820000],
  ['Mercado Norte — 40 licencias', 'Mercado Norte', 'In Progress', 2450000],
  ['Río Tech — Piloto', 'Río Tech', 'In Progress', 1070000],
  ['Globant Studio — Renovación', 'Globant Studio', 'Negotiation', 3100000],
  ['Brightline Studio — Upgrade', 'Brightline Studio', 'Negotiation', 960000],
  ['Sur Capital — Contrato marco', 'Sur Capital', 'Negotiation', 1890000],
];
const opps = await call('/api/opportunities');
for (const [n, c, s, amt] of deals) {
  if (opps.some((o) => o.name === n) || !companies.some((x) => x.name === c)) continue;
  await call('/api/opportunities', 'POST', { name: n, companyId: cid(c), pipelineId: leads.id, stageId: st(s).id, amountCents: amt, currency: 'USD', ownerId: me.id, estimatedCloseDate: '2026-11-28' });
}
log('opportunities ok', (await call('/api/opportunities')).length);

// 6. Compensation (fixed monthly, USD) for everyone except the admin
const freqs = await call('/api/hr/pay-frequencies');
const monthly = freqs.find((f) => f.cadence === 'monthly') || freqs[0];
const salaries = { 'Casey Ito': 520000, 'Devon Cole': 610000, 'Jordan Vega': 480000, 'Mika Ruiz': 590000, 'Priya Shah': 470000, 'Martina Gómez': 560000, 'Lucía Fernández': 450000, 'Tomás Herrera': 650000, 'Valentina Rossi': 500000, 'Mateo Silva': 430000, 'Camila Ortiz': 390000, 'Diego Navarro': 570000 };
const status = await call('/api/hr/payroll/compensation/status');
for (const e of await call('/api/hr/employees')) {
  const name = `${e.firstName} ${e.lastName}`;
  if (!salaries[name]) continue;
  if (e.personType !== 'employee') await call(`/api/hr/employees/${e.id}`, 'PATCH', { personType: 'employee' }).catch((err) => log('personType', name, err.message));
  const has = status.some((s) => s.employeeId === e.id && s.currentCompensation);
  if (has) continue;
  await call('/api/hr/payroll/compensation', 'POST', { employeeId: e.id, compensationType: 'fixed', rateCents: salaries[name], currency: 'USD', payFrequencyId: monthly.id, jobTitle: e.jobTitle?.name || 'Team member', description: 'Full-time role', effectiveFrom: '2026-01-01' }).catch((err) => log('comp', name, err.message));
}
log('compensation ok, frequency', monthly.name, monthly.id);
fs.writeFileSync('video-seed.out.json', JSON.stringify({ monthlyId: monthly.id, tenantId: me.tenantId }, null, 2));
