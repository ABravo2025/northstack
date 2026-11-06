import { isRateLimited } from '../lib/rateLimit.js';
import { getClientIp } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const cspReportRouter = createAsyncRouter();

// Content-Security-Policy violation reports (vercel.json's `report-uri`), sent by browsers on their
// own, unauthenticated. Only logged — they show up in the Vercel function logs, which is how the
// Report-Only policy is checked before it gets enforced (Security Report 2026-11-06, SEC-H02).
// Old-style `report-uri` bodies are { "csp-report": {...} }; the Reporting API sends an array.
const CSP_REPORT_LIMIT = { windowMs: 60_000, maxRequests: 30 };

cspReportRouter.post('/api/csp-report', async (req, res) => {
  if (await isRateLimited(`csp-report:${getClientIp(req)}`, CSP_REPORT_LIMIT)) {
    return res.status(204).end();
  }
  const reports = Array.isArray(req.body) ? req.body.map((r) => r?.body) : [req.body?.['csp-report']];
  for (const r of reports.slice(0, 10)) {
    if (!r || typeof r !== 'object') continue;
    console.warn('csp-violation', JSON.stringify({
      directive: r['violated-directive'] ?? r.effectiveDirective,
      blocked: r['blocked-uri'] ?? r.blockedURL,
      page: r['document-uri'] ?? r.documentURL,
      source: r['source-file'] ?? r.sourceFile,
      line: r['line-number'] ?? r.lineNumber,
    }));
  }
  return res.status(204).end();
});
