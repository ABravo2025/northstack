// CI gate (Security Report 2026-11-06, SEC-H01/SEC-H09): fails when `npm audit` finds a high or
// critical advisory in production dependencies, except the ones accepted below on purpose.
// Usage: node scripts/audit-gate.mjs [dir]   (dir defaults to the repo root; pass `frontend` for the app)
import { execSync } from 'node:child_process';

// Each entry needs a reason and a date to revisit — an accepted risk is not a forgotten one.
const ACCEPTED = {
  // zod 3 → 4 is a breaking migration across the MCP tool schemas. Exposure is bounded by the
  // 2 MB express.json() body limit (src/app.ts). Revisit by 2027-02-01.
  'GHSA-mrhx-c7xc-m3w5': 'zod memory exhaustion — pending zod 4 migration',
};

const dir = process.argv[2] ?? '.';
let raw;
try {
  raw = execSync('npm audit --omit=dev --json', { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (err) {
  raw = err.stdout; // npm audit exits non-zero whenever it finds anything
}
const report = JSON.parse(raw);

const blocking = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string') continue; // transitive pointer, reported on its own entry
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = via.url?.split('/').pop();
    if (ACCEPTED[id]) {
      console.log(`accepted  ${via.severity} ${name} ${id} (${ACCEPTED[id]})`);
      continue;
    }
    blocking.push(`${via.severity} ${name} ${id} ${via.title}`);
  }
}

if (blocking.length) {
  console.error(`npm audit (${dir}): ${blocking.length} blocking advisories\n  ${blocking.join('\n  ')}`);
  process.exit(1);
}
console.log(`npm audit (${dir}): no blocking advisories`);
