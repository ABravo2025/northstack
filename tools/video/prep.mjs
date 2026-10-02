// Resets the demo before a take: Andes deal back to "New", one pending request each for Casey and Martina.
import fs from 'node:fs';
const admin = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
const users = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-timeoff-users.json', 'utf8'));
const call = async (tk, path, method = 'GET', body) => { const r = await fetch('http://localhost:3000' + path, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const leads = (await call(admin, '/api/pipelines')).find((p) => p.name === 'Leads');
const newStage = leads.stages.find((s) => s.name === 'New');
const andes = (await call(admin, '/api/opportunities')).find((o) => o.name.startsWith('Andes'));
if (andes.stageId !== newStage.id) await call(admin, `/api/opportunities/${andes.id}`, 'PATCH', { stageId: newStage.id });
const pending = (await call(admin, '/api/hr/time-off-requests?scope=team')).filter((r) => r.status === 'pending');
const vac = (await call(admin, '/api/time-off-policies')).find((p) => p.name === 'Vacaciones');
const emps = await call(admin, '/api/hr/employees');
const pol = vac.id;
for (const [name, tk, start, end, note] of [['Casey', users.employeeToken, '2026-12-14', '2026-12-16', 'Trámites personales'], ['Martina', users.managerToken, '2026-11-16', '2026-11-20', 'Viaje a Bariloche']]) {
  if (pending.some((r) => r.employee?.firstName === name)) continue;
  const emp = emps.find((e) => e.firstName === name);
  await call(admin, `/api/hr/employees/${emp.id}/time-off-adjustments`, 'POST', { timeOffPolicyId: pol, days: 5, reason: 'Demo video' });
  const r = await call(tk, '/api/hr/time-off-requests', 'POST', { timeOffPolicyId: pol, startDate: start, endDate: end, note });
  console.log('recreated', name, r.id ? 'ok' : r);
}
console.log('pending now', (await call(admin, '/api/hr/time-off-requests?scope=team')).filter((r) => r.status === 'pending').map((r) => r.employee?.firstName).join(', '));
