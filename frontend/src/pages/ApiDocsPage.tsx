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

interface FieldRow {
  name: string;
  type: string;
  required?: boolean;
  notes?: string;
}

function FieldsTable({ rows }: { rows: FieldRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line-strong">
            <th className="py-1 pr-4 font-medium">Field</th>
            <th className="w-28 py-1 pr-4 font-medium">Type</th>
            <th className="w-20 py-1 pr-4 font-medium">Required</th>
            <th className="py-1 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-line">
              <td className="py-1.5 pr-4 align-top">
                <code>{row.name}</code>
              </td>
              <td className="py-1.5 pr-4 align-top">{row.type}</td>
              <td className="py-1.5 pr-4 align-top">{row.required ? 'Required' : 'Optional'}</td>
              <td className="py-1.5 align-top">{row.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One block per writable resource: exact request body (mirrors the zod schema in
// routes/externalApi.ts field-for-field — keep these in sync if that file changes), a real
// example request/response pair (trimmed from an actual verified call, ids replaced with
// placeholders), and any resource-specific rules (defaults, enums, business logic).
function ResourceDoc({
  id,
  title,
  scopeNote,
  intro,
  createFields,
  createExample,
  createResponseExample,
  updateNote,
  deleteNote,
}: {
  id: string;
  title: string;
  scopeNote?: string;
  intro?: ReactNode;
  createFields?: FieldRow[];
  createExample?: string;
  createResponseExample?: string;
  updateNote?: ReactNode;
  deleteNote?: ReactNode;
}) {
  return (
    <div id={id} className="mb-8 scroll-mt-20 border-t border-line pt-6">
      <h4 className="mb-1 text-sm font-semibold text-ink dark:text-dark-ink">{title}</h4>
      {scopeNote && <p className="mb-2 text-xs">{scopeNote}</p>}
      {intro && <div className="mb-2">{intro}</div>}
      {createFields && (
        <>
          <p className="mb-1 mt-3 text-xs font-medium text-ink dark:text-dark-ink">Body fields (create)</p>
          <FieldsTable rows={createFields} />
        </>
      )}
      {createExample && (
        <>
          <p className="mb-1 mt-3 text-xs font-medium text-ink dark:text-dark-ink">Example request</p>
          <CodeBlock>{createExample}</CodeBlock>
        </>
      )}
      {createResponseExample && (
        <>
          <p className="mb-1 mt-3 text-xs font-medium text-ink dark:text-dark-ink">Example response</p>
          <CodeBlock>{createResponseExample}</CodeBlock>
        </>
      )}
      {updateNote && <p className="mt-3 text-xs">{updateNote}</p>}
      {deleteNote && <p className="mt-3 text-xs">{deleteNote}</p>}
    </div>
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
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-ink-faint dark:text-dark-ink-faint">Jump to full request/response detail:</span>
            {[
              ['ref-tasks', 'Tasks'],
              ['ref-notes', 'Notes'],
              ['ref-companies', 'Companies'],
              ['ref-contacts', 'Contacts'],
              ['ref-opportunities', 'Opportunities'],
              ['ref-pipelines', 'Pipelines'],
              ['ref-employees', 'Employees'],
              ['ref-timeoff', 'Time off'],
              ['ref-payroll', 'Payroll'],
            ].map(([anchor, label]) => (
              <a key={anchor} href={`#${anchor}`} className="hover:underline">
                {label}
              </a>
            ))}
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
            Sending data: every <code>POST</code>/<code>PATCH</code> body is JSON — set{' '}
            <code>Content-Type: application/json</code> and send a raw JSON object, not form
            fields. A field <code>PATCH</code> doesn't mention is left unchanged; a field sent as{' '}
            <code>null</code> (where the table below allows it) clears it. Invalid input gets a{' '}
            <code>400</code> with <code>code: "validation_error"</code> and a{' '}
            <code>details</code> array naming exactly which field(s) and why.
          </p>

          <h3 className="mb-1 mt-6 text-base font-semibold text-ink dark:text-dark-ink">
            Request &amp; response reference
          </h3>
          <p>Full body/response detail for every writable resource, in the same order as the table above.</p>

          <ResourceDoc
            id="ref-tasks"
            title="Tasks — POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id"
            scopeNote="Scope: tasks:write. Task is cross-entity — every Task hangs off exactly one Employee, Company, Contact, or Opportunity."
            createFields={[
              { name: 'entityType', type: 'string', required: true, notes: 'One of: employee, company, contact, opportunity.' },
              { name: 'entityId', type: 'string', required: true, notes: 'Id of that record — must belong to your workspace, or you get a 404.' },
              { name: 'title', type: 'string', required: true },
              { name: 'description', type: 'string | null', notes: 'Defaults to null.' },
              { name: 'assigneeId', type: 'string', required: true, notes: "A User id in your workspace — whoever the task is for." },
              { name: 'dueDate', type: 'ISO 8601 datetime | null', notes: 'e.g. "2026-10-01T00:00:00.000Z". Defaults to null (no due date).' },
            ]}
            createExample={`{
  "entityType": "employee",
  "entityId": "3f9a1c2e-4b7d-4a1e-9c3a-employee0001",
  "title": "Follow up on onboarding paperwork",
  "assigneeId": "7b2d4e1a-8f3c-4d2b-a1e9-user00000001"
}`}
            createResponseExample={`{
  "id": "010ee18b-c853-498f-bec6-c708e962b09b",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "entityType": "employee",
  "entityId": "3f9a1c2e-4b7d-4a1e-9c3a-employee0001",
  "title": "Follow up on onboarding paperwork",
  "description": null,
  "assigneeId": "7b2d4e1a-8f3c-4d2b-a1e9-user00000001",
  "dueDate": null,
  "completedAt": null,
  "createdById": "7b2d4e1a-8f3c-4d2b-a1e9-user00000001",
  "createdAt": "2026-09-07T21:56:57.071Z",
  "updatedAt": "2026-09-07T21:56:57.071Z",
  "googleCalendarEventId": null,
  "assignee": { "id": "7b2d4e1a-...", "firstName": "Owner", "lastName": "Test" },
  "createdBy": { "id": "7b2d4e1a-...", "firstName": "Owner", "lastName": "Test" }
}`}
            updateNote={
              <>
                <code>PATCH</code> takes <code>title</code>, <code>description</code>,{' '}
                <code>assigneeId</code>, <code>dueDate</code> — all optional, send only what
                changes. <code>entityType</code>/<code>entityId</code> can't be changed (a Task
                can't move to a different record). Set <code>completedAt</code> to an ISO datetime
                to mark it done, or <code>null</code> to reopen it.
              </>
            }
            deleteNote="DELETE takes no body. Hard delete — the row is gone, GET afterward is a 404."
          />

          <ResourceDoc
            id="ref-notes"
            title="Notes — POST /notes, PATCH /notes/:id, DELETE /notes/:id"
            scopeNote="Scope: notes:write. Same cross-entity shape as Tasks, minus assignee/due date/completion — a Note is a record, not a to-do."
            createFields={[
              { name: 'entityType', type: 'string', required: true, notes: 'One of: employee, company, contact, opportunity.' },
              { name: 'entityId', type: 'string', required: true, notes: 'Must belong to your workspace, or you get a 404.' },
              { name: 'title', type: 'string', required: true },
              { name: 'description', type: 'string', required: true, notes: "The note's body — not optional here, unlike Task's description." },
            ]}
            createExample={`{
  "entityType": "employee",
  "entityId": "3f9a1c2e-4b7d-4a1e-9c3a-employee0001",
  "title": "Reference check",
  "description": "Called the listed reference — confirmed dates and role."
}`}
            createResponseExample={`{
  "id": "bf8a56cd-dfbc-47dd-a13c-ae6efab13156",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "entityType": "employee",
  "entityId": "3f9a1c2e-4b7d-4a1e-9c3a-employee0001",
  "title": "Reference check",
  "description": "Called the listed reference — confirmed dates and role.",
  "createdById": "7b2d4e1a-8f3c-4d2b-a1e9-user00000001",
  "createdAt": "2026-09-07T21:57:17.273Z",
  "updatedAt": "2026-09-07T21:57:17.273Z",
  "createdBy": { "id": "7b2d4e1a-...", "firstName": "Owner", "lastName": "Test", "platformRole": null }
}`}
            updateNote={
              <>
                <code>PATCH</code> takes <code>title</code>/<code>description</code>, both optional.
              </>
            }
            deleteNote="DELETE takes no body. Hard delete."
          />

          <ResourceDoc
            id="ref-companies"
            title="Companies — POST /crm/companies, PATCH /crm/companies/:id, DELETE /crm/companies/:id"
            scopeNote="Scope: crm.companies:write."
            intro={
              <p>
                A Company can't exist without a Contact — <code>contact</code> is required on create,
                either a brand-new person or a link to one that already exists.
              </p>
            }
            createFields={[
              { name: 'name', type: 'string', required: true },
              {
                name: 'contact',
                type: 'object',
                required: true,
                notes: 'Either { "contactId": "..." } (link an existing Contact) or { "firstName", "lastName", "email" } (create a new one).',
              },
              { name: 'industry, website, phone, billingAddress', type: 'string | null', notes: 'Default to null.' },
              { name: 'sizeId', type: 'string | null', notes: "A company-size catalog value's id. Default null." },
              { name: 'accountOwnerId', type: 'string | null', notes: 'A User id in your workspace. Default null.' },
              { name: 'isPlaceholder', type: 'boolean', notes: 'Default false. Leave this alone unless you know why you need it.' },
            ]}
            createExample={`{
  "name": "Acme Corp",
  "contact": {
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@acmecorp.example"
  },
  "industry": "Software"
}`}
            createResponseExample={`{
  "id": "bbd4f74c-74cb-40e8-996d-company00001",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "name": "Acme Corp",
  "industry": "Software",
  "website": null,
  "phone": null,
  "billingAddress": null,
  "parentCompanyId": null,
  "sizeId": null,
  "accountOwnerId": null,
  "statusId": "310da8d8-f42a-4e0d-ac8d-status000001",
  "isPlaceholder": false,
  "createdAt": "2026-09-07T21:57:24.962Z",
  "statusDefn": { "id": "310da8d8-...", "name": "Prospect", "isDefault": true, "...": "..." }
}`}
            updateNote={
              <>
                <code>PATCH</code> takes the same fields as create except <code>contact</code>{' '}
                (can't be changed after creation this way), plus <code>parentCompanyId</code>{' '}
                (string | null). <code>statusId</code> is never settable directly — it's derived
                from business events (an Opportunity being won, for example).
              </>
            }
            deleteNote={
              <>
                <code>DELETE</code> takes an optional JSON body:{' '}
                <code>{'{ "deleteLinkedOpportunities": boolean, "cascadeToChildCompanies": boolean }'}</code>
                , both default <code>false</code>. Without them, deleting a Company that still has
                Opportunities fails with a <code>400</code> instead of silently taking them down too.
              </>
            }
          />

          <ResourceDoc
            id="ref-contacts"
            title="Contacts — POST /crm/contacts, PATCH /crm/contacts/:id, DELETE /crm/contacts/:id"
            scopeNote="Scope: crm.contacts:write."
            createFields={[
              { name: 'firstName', type: 'string', required: true },
              { name: 'lastName', type: 'string', required: true },
              { name: 'email', type: 'string', required: true, notes: 'Must be a valid email; unique per workspace.' },
              { name: 'phone, title', type: 'string | null', notes: 'Default null.' },
              { name: 'companyId', type: 'string | null', notes: 'Default null (unlinked).' },
              { name: 'isPrimary', type: 'boolean', notes: "Default false. Only one primary Contact per Company — setting this demotes any other." },
              { name: 'leadStatus', type: 'string | null', notes: 'One of: new, contacted, qualified, disqualified. Default null.' },
              { name: 'leadSourceId', type: 'string | null', notes: 'A lead-source catalog value id. Default null.' },
            ]}
            createExample={`{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john.smith@acmecorp.example",
  "companyId": "bbd4f74c-74cb-40e8-996d-company00001"
}`}
            createResponseExample={`{
  "id": "d483c8bb-d80e-4992-aade-contact00001",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "firstName": "John",
  "lastName": "Smith",
  "email": "john.smith@acmecorp.example",
  "phone": null,
  "companyId": "bbd4f74c-74cb-40e8-996d-company00001",
  "title": null,
  "isPrimary": false,
  "leadStatus": null,
  "leadSourceId": null,
  "isActive": true,
  "createdAt": "2026-09-07T21:57:47.703Z"
}`}
            updateNote={<>All create fields are optional on <code>PATCH</code>, plus <code>isActive</code> (boolean).</>}
            deleteNote={
              <>
                <code>DELETE</code> takes no body — soft delete (deactivates, sets{' '}
                <code>isActive: false</code>). Never destroyed: a linked Opportunity where this was
                the only active Contact gets deactivated too; otherwise it's just unlinked.
              </>
            }
          />

          <ResourceDoc
            id="ref-opportunities"
            title="Opportunities — POST /crm/opportunities, PATCH /crm/opportunities/:id, DELETE /crm/opportunities/:id"
            scopeNote="Scope: crm.opportunities:write. Stage changes (moving a deal through the pipeline) go through the same PATCH via stageId — there's no separate endpoint for it."
            createFields={[
              { name: 'companyId', type: 'string', required: true },
              { name: 'pipelineId', type: 'string', required: true },
              { name: 'name', type: 'string', required: true },
              { name: 'amountCents', type: 'integer ≥ 0', required: true, notes: 'Whole cents, e.g. 500000 = $5,000.00.' },
              { name: 'currency', type: 'string', required: true, notes: 'e.g. "USD".' },
              { name: 'stageId', type: 'string', notes: "Defaults to the pipeline's first active stage if omitted." },
              {
                name: 'ownerId',
                type: 'string | null',
                notes: 'Required only if the target pipeline has no automatic assignment configured — otherwise omit it and let assignment decide.',
              },
              { name: 'lossReasonId, winReasonId', type: 'string | null', notes: 'Required when stageId resolves to a lost/won stage respectively.' },
              { name: 'estimatedCloseDate, nextStepDate', type: 'ISO 8601 datetime | null' },
              { name: 'closeNote, nextStepNote', type: 'string | null' },
            ]}
            createExample={`{
  "companyId": "bbd4f74c-74cb-40e8-996d-company00001",
  "pipelineId": "8fa4e39d-c2a8-498e-8d54-pipeline0001",
  "name": "Acme Corp — annual plan",
  "amountCents": 500000,
  "currency": "USD",
  "ownerId": "7b2d4e1a-8f3c-4d2b-a1e9-user00000001"
}`}
            createResponseExample={`{
  "id": "8f860568-c656-411b-97b4-opportunity1",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "companyId": "bbd4f74c-74cb-40e8-996d-company00001",
  "pipelineId": "8fa4e39d-c2a8-498e-8d54-pipeline0001",
  "stageId": "79ae1f27-261c-4408-bedb-stage000001",
  "name": "Acme Corp — annual plan",
  "amountCents": 500000,
  "currency": "USD",
  "estimatedCloseDate": null,
  "ownerId": "7b2d4e1a-8f3c-4d2b-a1e9-user00000001",
  "lossReasonId": null,
  "winReasonId": null,
  "closeNote": null,
  "nextStepDate": null,
  "nextStepNote": null,
  "isActive": true,
  "createdAt": "2026-09-07T21:58:11.075Z"
}`}
            updateNote={
              <>
                All create fields are optional on <code>PATCH</code>, plus <code>isActive</code>. To
                move a deal, send just <code>{'{ "stageId": "..." }'}</code> — if the target stage's
                outcome is <code>won</code> or <code>lost</code>, the matching reason field is
                required in the same request or you get a <code>400</code>.
              </>
            }
            deleteNote="DELETE takes no body. Hard delete."
          />

          <ResourceDoc
            id="ref-pipelines"
            title="Pipelines — GET /crm/pipelines (read-only)"
            scopeNote="Scope: crm.pipelines:read. No write scope exists — pipelines are configuration, not a record you create through automation."
            createResponseExample={`{
  "id": "8fa4e39d-c2a8-498e-8d54-pipeline0001",
  "name": "Sales",
  "type": "lead",
  "order": 0,
  "isActive": true,
  "stages": [
    { "id": "79ae1f27-...", "name": "New", "order": 0, "outcome": "open" },
    { "id": "1a45ca5b-...", "name": "In Progress", "order": 1, "outcome": "open" },
    { "id": "8f1cb650-...", "name": "Won", "order": 2, "outcome": "won" },
    { "id": "8b0848fa-...", "name": "Lost", "order": 3, "outcome": "lost" }
  ]
}`}
          />

          <ResourceDoc
            id="ref-employees"
            title="Employees — POST /hr/employees, PATCH /hr/employees/:id, DELETE /hr/employees/:id"
            scopeNote="Scope: hr.employees:write."
            createFields={[
              { name: 'firstName', type: 'string', required: true },
              { name: 'lastName', type: 'string', required: true },
              { name: 'email', type: 'string', required: true },
              { name: 'contractType', type: 'string | null', notes: 'One of: part_time, full_time. Default null.' },
              { name: 'personType', type: 'string | null', notes: 'One of: profile, contractor, employee. Default null.' },
              { name: 'departmentId, jobTitleId', type: 'string | null', notes: 'Catalog value ids. Default null.' },
              { name: 'managerId', type: 'string | null', notes: 'Another Employee id — must not create a reporting cycle.' },
              { name: 'statusId', type: 'string', notes: "Defaults to the workspace's default Employee status if omitted." },
              { name: 'nationality, contractUrl, personalEmail', type: 'string | null' },
              { name: 'startDate, endDate, birthdate', type: 'ISO 8601 datetime | null' },
            ]}
            createExample={`{
  "firstName": "Alice",
  "lastName": "Wong",
  "email": "alice.wong@example.com"
}`}
            createResponseExample={`{
  "id": "efb8fb37-4ee9-4e3c-9396-employee0002",
  "firstName": "Alice",
  "lastName": "Wong",
  "email": "alice.wong@example.com",
  "departmentId": null,
  "jobTitleId": null,
  "contractType": null,
  "personType": null,
  "nationality": null,
  "startDate": null,
  "endDate": null,
  "birthdate": null,
  "contractUrl": null,
  "personalEmail": null,
  "statusId": "74268ff9-88f6-44d7-b937-status000002",
  "managerId": null,
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "createdAt": "2026-09-07T21:58:46.084Z",
  "userId": null
}`}
            updateNote={
              <>
                All create fields are optional on <code>PATCH</code> — send only what changes. A
                terminated Employee's <code>statusId</code> can't be changed back this way.
              </>
            }
            deleteNote="DELETE takes no body. Hard delete."
          />

          <ResourceDoc
            id="ref-timeoff"
            title="Time off — GET /hr/timeoff, POST /hr/timeoff (create only)"
            scopeNote="Scope: hr.timeoff:read / hr.timeoff:write. No PATCH/DELETE, and no way to approve or reject a request through this API — deciding one is gated by 'is this person's assigned manager', a relationship an API key doesn't have."
            createFields={[
              { name: 'employeeId', type: 'string', required: true, notes: 'Must have timeOffPolicyId already assigned to them.' },
              { name: 'timeOffPolicyId', type: 'string', required: true },
              { name: 'startDate, endDate', type: 'date ("YYYY-MM-DD") or ISO datetime', required: true },
              { name: 'note', type: 'string', notes: 'Default none.' },
            ]}
            createExample={`{
  "employeeId": "3f9a1c2e-4b7d-4a1e-9c3a-employee0001",
  "timeOffPolicyId": "f7562e91-d4eb-48da-a130-policy000001",
  "startDate": "2026-10-01",
  "endDate": "2026-10-03"
}`}
            createResponseExample={`{
  "id": "015fcc2c-ad0e-49fc-a280-timeoff00001",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "employeeId": "3f9a1c2e-4b7d-4a1e-9c3a-employee0001",
  "timeOffPolicyId": "f7562e91-d4eb-48da-a130-policy000001",
  "startDate": "2026-10-01T00:00:00.000Z",
  "endDate": "2026-10-03T00:00:00.000Z",
  "daysRequested": 3,
  "note": null,
  "status": "approved",
  "approverId": null,
  "decidedAt": "2026-09-07T21:59:04.128Z",
  "decisionNote": "Auto-approved — this policy does not require approval",
  "createdAt": "2026-09-07T21:59:04.129Z"
}`}
          />

          <ResourceDoc
            id="ref-payroll"
            title="Payroll — GET /hr/payroll (read-only)"
            scopeNote="Scope: hr.payroll:read. No write scope exists for Payroll in this API — none can be requested on a key, ever."
            createResponseExample={`{
  "id": "a1b2c3d4-...",
  "tenantId": "88da8bee-a050-42c2-8b94-tenant00001",
  "payFrequencyId": "e5f6a7b8-...",
  "periodLabel": "September 2026",
  "status": "confirmed",
  "createdByUserId": "7b2d4e1a-...",
  "confirmedAt": "2026-09-01T12:00:00.000Z",
  "createdAt": "2026-08-25T09:00:00.000Z"
}`}
          />
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
