import type { ReactNode } from 'react';

// Private API reference (spec-private-api-webhooks.md §8) — public, no login required (see
// App.tsx's route comment for why). Static content only: no api calls, nothing tenant-specific,
// so there's nothing here that needs a loading/error state.

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-surface-2 p-3 text-xs">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-sm text-ink-muted dark:text-dark-ink-muted">{children}</div>
    </section>
  );
}

interface ScopeRow {
  scope: string;
  covers: string;
}

const SCOPE_ROWS: ScopeRow[] = [
  { scope: 'tasks:read / tasks:write', covers: 'Tasks' },
  { scope: 'notes:read / notes:write', covers: 'Notes' },
  { scope: 'crm.companies:read / crm.companies:write', covers: 'Companies' },
  { scope: 'crm.contacts:read / crm.contacts:write', covers: 'Contacts' },
  { scope: 'crm.opportunities:read / crm.opportunities:write', covers: 'Opportunities, including stage changes' },
  { scope: 'crm.pipelines:read', covers: 'Pipelines (read-only — configuration, not a record you create/edit)' },
  { scope: 'hr.employees:read / hr.employees:write', covers: 'Employees' },
  { scope: 'hr.timeoff:read / hr.timeoff:write', covers: 'Time off requests (write only creates a request — approve/reject is not exposed here, see below)' },
  { scope: 'hr.payroll:read', covers: 'Payroll runs (no payment-account data). No write scope exists for Payroll in this API — none can be requested.' },
];

interface EndpointRow {
  method: string;
  path: string;
  scope: string;
}

const ENDPOINTS: { resource: string; rows: EndpointRow[] }[] = [
  {
    resource: 'Tasks',
    rows: [
      { method: 'GET', path: '/tasks', scope: 'tasks:read' },
      { method: 'GET', path: '/tasks/:id', scope: 'tasks:read' },
      { method: 'POST', path: '/tasks', scope: 'tasks:write' },
      { method: 'PATCH', path: '/tasks/:id', scope: 'tasks:write' },
      { method: 'DELETE', path: '/tasks/:id', scope: 'tasks:write' },
    ],
  },
  {
    resource: 'Notes',
    rows: [
      { method: 'GET', path: '/notes', scope: 'notes:read' },
      { method: 'GET', path: '/notes/:id', scope: 'notes:read' },
      { method: 'POST', path: '/notes', scope: 'notes:write' },
      { method: 'PATCH', path: '/notes/:id', scope: 'notes:write' },
      { method: 'DELETE', path: '/notes/:id', scope: 'notes:write' },
    ],
  },
  {
    resource: 'CRM — Companies',
    rows: [
      { method: 'GET', path: '/crm/companies', scope: 'crm.companies:read' },
      { method: 'GET', path: '/crm/companies/:id', scope: 'crm.companies:read' },
      { method: 'POST', path: '/crm/companies', scope: 'crm.companies:write' },
      { method: 'PATCH', path: '/crm/companies/:id', scope: 'crm.companies:write' },
      { method: 'DELETE', path: '/crm/companies/:id', scope: 'crm.companies:write' },
    ],
  },
  {
    resource: 'CRM — Contacts',
    rows: [
      { method: 'GET', path: '/crm/contacts', scope: 'crm.contacts:read' },
      { method: 'GET', path: '/crm/contacts/:id', scope: 'crm.contacts:read' },
      { method: 'POST', path: '/crm/contacts', scope: 'crm.contacts:write' },
      { method: 'PATCH', path: '/crm/contacts/:id', scope: 'crm.contacts:write' },
      { method: 'DELETE', path: '/crm/contacts/:id', scope: 'crm.contacts:write (soft-delete: deactivates, never destroys)' },
    ],
  },
  {
    resource: 'CRM — Opportunities',
    rows: [
      { method: 'GET', path: '/crm/opportunities', scope: 'crm.opportunities:read' },
      { method: 'GET', path: '/crm/opportunities/:id', scope: 'crm.opportunities:read' },
      { method: 'POST', path: '/crm/opportunities', scope: 'crm.opportunities:write' },
      { method: 'PATCH', path: '/crm/opportunities/:id', scope: 'crm.opportunities:write (stage changes go through this, via `stageId` — there is no separate stage endpoint)' },
      { method: 'DELETE', path: '/crm/opportunities/:id', scope: 'crm.opportunities:write' },
    ],
  },
  {
    resource: 'CRM — Pipelines',
    rows: [{ method: 'GET', path: '/crm/pipelines', scope: 'crm.pipelines:read' }],
  },
  {
    resource: 'HR — Employees',
    rows: [
      { method: 'GET', path: '/hr/employees', scope: 'hr.employees:read' },
      { method: 'GET', path: '/hr/employees/:id', scope: 'hr.employees:read' },
      { method: 'POST', path: '/hr/employees', scope: 'hr.employees:write' },
      { method: 'PATCH', path: '/hr/employees/:id', scope: 'hr.employees:write' },
      { method: 'DELETE', path: '/hr/employees/:id', scope: 'hr.employees:write' },
    ],
  },
  {
    resource: 'HR — Time off',
    rows: [
      { method: 'GET', path: '/hr/timeoff', scope: 'hr.timeoff:read' },
      { method: 'POST', path: '/hr/timeoff', scope: 'hr.timeoff:write (creates a request only — approving/rejecting isn’t exposed, see note below)' },
    ],
  },
  {
    resource: 'HR — Payroll',
    rows: [{ method: 'GET', path: '/hr/payroll', scope: 'hr.payroll:read (runs only, no payment-account data)' }],
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">
            Northstack
          </p>
          <h1 className="mb-2 text-2xl font-semibold">Private API reference</h1>
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
            A REST API for your own scripts, Zapier, Make, or anything else you want to connect to
            your Northstack workspace. Manage keys from{' '}
            <span className="font-medium">Settings → Integrations → API Keys</span>.
          </p>
        </header>

        <nav className="mb-10 flex flex-wrap gap-x-4 gap-y-1 border-b border-line pb-4 text-xs">
          {[
            ['authentication', 'Authentication'],
            ['scopes', 'Scopes'],
            ['endpoints', 'Endpoints'],
            ['pagination', 'Pagination'],
            ['errors', 'Errors'],
            ['webhooks', 'Webhooks'],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-ink-muted hover:underline dark:text-dark-ink-muted">
              {label}
            </a>
          ))}
        </nav>

        <Section id="authentication" title="Authentication">
          <p>
            Every request needs an API key in the <code>Authorization</code> header. Keys are
            created from Settings → Integrations → API Keys and shown in full exactly once — if you
            lose one, revoke it and create a new one.
          </p>
          <CodeBlock>{`Authorization: Bearer nk_live_...`}</CodeBlock>
          <p>
            A request with no key, an unknown key, or a revoked key gets a plain <code>401</code>{' '}
            with no further detail — this API never confirms whether a key existed.
          </p>
          <p>
            An API key is not a person: it carries no role and no session. The <b>scopes</b> on the
            key are the only thing that determines what it can do — internal workspace roles/
            permissions don't apply to this traffic at all.
          </p>
        </Section>

        <Section id="scopes" title="Scopes">
          <p>
            A key starts with zero access. Every scope it should have is chosen explicitly when the
            key is created (or later, by creating a new one — scopes can't be edited after the
            fact). A request missing the scope it needs gets a <code>403</code>:
          </p>
          <CodeBlock>{`{ "error": "This API key is missing the required scope: hr.employees:write", "code": "missing_scope", "required": "hr.employees:write" }`}</CodeBlock>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="py-1 pr-4 font-medium">Scope</th>
                  <th className="py-1 font-medium">Covers</th>
                </tr>
              </thead>
              <tbody>
                {SCOPE_ROWS.map((row) => (
                  <tr key={row.scope} className="border-b border-line">
                    <td className="py-1.5 pr-4 align-top">
                      <code>{row.scope}</code>
                    </td>
                    <td className="py-1.5 align-top">{row.covers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="endpoints" title="Endpoints">
          <p>
            Base URL: <code>https://app.joinnorthstack.com/api/external/v1</code>. Every path below
            is relative to that.
          </p>
          {ENDPOINTS.map((group) => (
            <div key={group.resource}>
              <h3 className="mb-1 mt-2 text-sm font-medium text-ink dark:text-dark-ink">{group.resource}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={`${row.method} ${row.path}`} className="border-b border-line">
                        <td className="w-16 py-1.5 pr-3 align-top font-mono">{row.method}</td>
                        <td className="w-40 py-1.5 pr-3 align-top">
                          <code>{row.path}</code>
                        </td>
                        <td className="py-1.5 align-top">{row.scope}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="mt-2">
            Example — create a Task:
          </p>
          <CodeBlock>{`curl -X POST https://app.joinnorthstack.com/api/external/v1/tasks \\
  -H "Authorization: Bearer nk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "entityType": "company",
    "entityId": "...",
    "title": "Follow up",
    "assigneeId": "..."
  }'`}</CodeBlock>
        </Section>

        <Section id="pagination" title="Pagination">
          <p>
            Every list endpoint is cursor-based. Pass <code>?limit=</code> (default 50, max 200) and{' '}
            <code>?cursor=</code> (the id of the last row you already have) to page through results.
          </p>
          <CodeBlock>{`{ "data": [ ... ], "nextCursor": "clxyz..." }`}</CodeBlock>
          <p>
            <code>nextCursor</code> is <code>null</code> once you've reached the end. A cursor that
            doesn't match any row (stale or tampered) gets a <code>400</code> with{' '}
            <code>code: "invalid_cursor"</code> rather than silently restarting from the first page.
          </p>
        </Section>

        <Section id="errors" title="Errors">
          <p>Every error response is the same shape:</p>
          <CodeBlock>{`{ "error": "Human-readable message", "code": "stable_machine_code" }`}</CodeBlock>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="py-1 pr-4 font-medium">Status</th>
                  <th className="py-1 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['401', 'Missing, unknown, or revoked API key.'],
                  ['403', 'Valid key, but missing the scope this endpoint requires.'],
                  ['404', "Not found — either it doesn't exist, or it belongs to a different workspace (this API never confirms which)."],
                  ['400', 'Bad request — a validation_error (with a field-by-field breakdown), a bad_request from a business rule, or an invalid_cursor.'],
                  ['429', 'Rate limited (per key). Retry after the seconds given in the Retry-After header.'],
                ].map(([status, meaning]) => (
                  <tr key={status} className="border-b border-line">
                    <td className="py-1.5 pr-4 align-top font-mono">{status}</td>
                    <td className="py-1.5 align-top">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="webhooks" title="Webhooks">
          <p>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">Coming soon</span>
          </p>
          <p>
            Outbound webhooks (Northstack pushing a signed event to a URL you configure, instead of
            you polling this API) are built and tested, but not yet available — check back here once
            they ship.
          </p>
        </Section>
      </div>
    </div>
  );
}
