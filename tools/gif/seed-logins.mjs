// Gives every fictitious "Acme Latam" employee a login (STAGING only, through the local backend), so
// they can be assigned shifts: register → invite from the employee record → accept. No email goes out
// when the backend runs without SMTP credentials. Idempotent.
import fs from 'node:fs';
const API = 'http://localhost:3000';
const T = JSON.parse(fs.readFileSync('C:/Users/aleja/Documents/Projects/uiref-tenant.json', 'utf8')).token;
async function call(path, method = 'GET', body, tk = T) {
  const r = await fetch(API + path, { method, headers: { ...(tk ? { Authorization: `Bearer ${tk}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j)}`);
  return j;
}
const PASSWORD = 'Demo-Acme-2026!';
for (const e of await call('/api/hr/employees')) {
  if (e.userId || e.user) continue;
  try {
    let inv = (await call(`/api/hr/employees/${e.id}/invite`, 'POST', {}).catch(() => null))?.invitation;
    const reg = await call('/api/auth/register', 'POST', { email: e.email, password: PASSWORD, phone: '+5491100000000', firstName: e.firstName, lastName: e.lastName, acceptedTerms: true }, null)
      .catch(async () => call('/api/auth/login', 'POST', { email: e.email, password: PASSWORD }, null));
    const tk = reg.session?.token || reg.session;
    if (!inv) { console.log('no invitation for', e.firstName); continue; }
    await call(`/api/invitations/${inv.token}/accept`, 'POST', {}, tk);
    console.log('login ok', e.firstName);
  } catch (err) { console.log('skip', e.firstName, err.message); }
}
