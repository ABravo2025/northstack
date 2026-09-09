import { useNavigate } from 'react-router-dom';
import { useScrollSpy } from '../hooks/useScrollSpy';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BriefcaseIcon,
  BuildingIcon,
  CreditCardIcon,
  DeviceIcon,
  DownloadIcon,
  FormIcon,
  GearIcon,
  GridIcon,
  InfoIcon,
  KanbanIcon,
  ListIcon,
  PeopleIcon,
  PlugIcon,
  RocketIcon,
  TeamIcon,
} from '../components/common/Icons';

const SECTION_IDS = [
  'g-start',
  'g-roles',
  'g-crm',
  'g-pipeline',
  'g-organize',
  'g-hr',
  'g-payroll',
  'g-tasks',
  'g-forms',
  'g-integrations',
  'g-settings',
  'g-billing',
  'g-data',
  'g-mobile',
];

const NAV_GROUPS: { label: string; items: { id: string; label: string; icon: JSX.Element }[] }[] = [
  {
    label: 'Start here',
    items: [
      { id: 'g-start', label: 'Getting started', icon: <RocketIcon /> },
      { id: 'g-roles', label: 'Roles & team', icon: <TeamIcon /> },
    ],
  },
  {
    label: 'Sales',
    items: [
      { id: 'g-crm', label: 'Companies & contacts', icon: <BuildingIcon /> },
      { id: 'g-pipeline', label: 'Pipelines & deals', icon: <KanbanIcon /> },
      { id: 'g-organize', label: 'Views, tags & fields', icon: <GridIcon /> },
    ],
  },
  {
    label: 'People',
    items: [
      { id: 'g-hr', label: 'Employees & time off', icon: <PeopleIcon /> },
      { id: 'g-payroll', label: 'Payroll', icon: <BriefcaseIcon /> },
      { id: 'g-tasks', label: 'Tasks & notes', icon: <ListIcon /> },
    ],
  },
  {
    label: 'Connect',
    items: [
      { id: 'g-forms', label: 'Public forms', icon: <FormIcon /> },
      { id: 'g-integrations', label: 'Integrations & API', icon: <PlugIcon /> },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { id: 'g-settings', label: 'Settings & appearance', icon: <GearIcon /> },
      { id: 'g-billing', label: 'Billing & plans', icon: <CreditCardIcon /> },
      { id: 'g-data', label: 'Import & export', icon: <DownloadIcon /> },
      { id: 'g-mobile', label: 'On the go', icon: <DeviceIcon /> },
    ],
  },
];

const MODULE_MAP: { id: string; label: string; blurb: string; icon: JSX.Element }[] = [
  { id: 'g-start', label: 'Getting started', blurb: 'Sign-up, your 15-day trial, and onboarding.', icon: <RocketIcon /> },
  { id: 'g-roles', label: 'Roles & team', blurb: 'Invite people and build custom roles.', icon: <TeamIcon /> },
  { id: 'g-crm', label: 'Companies & contacts', blurb: 'Your CRM records and how they relate.', icon: <BuildingIcon /> },
  { id: 'g-pipeline', label: 'Pipelines & deals', blurb: 'Stages, forecasting, and auto-assignment.', icon: <KanbanIcon /> },
  { id: 'g-hr', label: 'Employees & time off', blurb: 'Directory, reporting lines, PTO policies.', icon: <PeopleIcon /> },
  { id: 'g-payroll', label: 'Payroll', blurb: 'Compensation, pay runs, payslips.', icon: <BriefcaseIcon /> },
  { id: 'g-tasks', label: 'Tasks & notes', blurb: 'Follow-ups on any record.', icon: <ListIcon /> },
  { id: 'g-forms', label: 'Public forms', blurb: 'No-login intake for hiring and leads.', icon: <FormIcon /> },
  { id: 'g-integrations', label: 'Integrations & API', blurb: 'Google Calendar, Stripe, API keys.', icon: <PlugIcon /> },
  { id: 'g-settings', label: 'Settings', blurb: 'Appearance, currency, preferences.', icon: <GearIcon /> },
  { id: 'g-billing', label: 'Billing & plans', blurb: 'Starter vs. Growth, checkout, failures.', icon: <CreditCardIcon /> },
  { id: 'g-data', label: 'Import & export', blurb: 'Bulk CSV for People, Companies, Contacts.', icon: <DownloadIcon /> },
];

export default function GuidePage() {
  const navigate = useNavigate();
  const activeId = useScrollSpy(SECTION_IDS);

  return (
    <div className="page-full">
      <div className="page-toolbar">
        <h2>User Guide</h2>
      </div>
      <p className="help-lede">
        Northstack is organized around your <strong>People</strong> (HR, time off, payroll) and your{' '}
        <strong>Sales</strong> data (companies, contacts, deals) — plus shared tools like tasks, tags, and custom
        fields that work the same way everywhere. This guide walks through each area in the order most teams set
        them up.
      </p>
      <p className="help-crosslink">
        Looking for a quick answer instead?{' '}
        <a href="/help" onClick={(e) => { e.preventDefault(); navigate('/help'); }}>
          Go to Help &amp; FAQ →
        </a>
      </p>

      <div className="help-shell">
        <nav className="help-nav">
          {NAV_GROUPS.map((group) => (
            <div className="help-nav-group" key={group.label}>
              <p className="help-nav-label">{group.label}</p>
              {group.items.map((item) => (
                <a
                  key={item.id}
                  className={`help-nav-link${activeId === item.id ? ' active' : ''}`}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {item.icon}
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="help-content">
          <div className="help-module-map">
            {MODULE_MAP.map((m) => (
              <a
                key={m.id}
                className="help-module-card"
                href={`#${m.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(m.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <div className="help-module-card-top">
                  {m.icon}
                  <span>{m.label}</span>
                </div>
                <p>{m.blurb}</p>
              </a>
            ))}
          </div>

          {/* ===== Getting started ===== */}
          <section className="help-section" id="g-start">
            <div className="help-eyebrow">
              <RocketIcon />
              Start here
            </div>
            <h2>Getting started</h2>
            <p className="help-intro">How a new workspace comes to life, and what the first 15 days look like.</p>

            <div className="help-sub">
              <h3>Creating your workspace</h3>
              <p>Sign-up is a short, verified flow — nobody can create a workspace with an email they don't control:</p>
              <ol className="help-steps">
                <li>
                  <strong>Enter your work email</strong> at the sign-up page. If your company's email domain already
                  has an active Northstack workspace, you'll be asked to get an invite from that team instead of
                  starting a new one.
                </li>
                <li>
                  <strong>Check your inbox</strong> for a verification link — it's valid for 24 hours. No email? Use
                  "Resend" (available every 30 seconds) or start over with a different address.
                </li>
                <li>
                  <strong>Tell us about your company</strong> — name, industry, size, and country. Country matters:
                  it's what decides whether you'll pay in USD or Argentine pesos later on.
                </li>
                <li>
                  <strong>Tell us about you</strong> — name and phone number, plus an optional "how did you hear
                  about us."
                </li>
                <li>
                  <strong>Set a password</strong> and accept the Terms of Service and Privacy Policy. Nothing is
                  saved until this final step.
                </li>
              </ol>
              <p>
                From there you land straight on your <strong>Overview</strong> page — no separate "getting started"
                page to click through first.
              </p>
            </div>

            <div className="help-sub">
              <h3>Your 15-day free trial</h3>
              <p>
                Every new workspace starts on a 15-day trial with full access — no plan or card required to explore
                the product. A dismissible plan-picker appears once over Overview so you can subscribe early if
                you're ready, but it never blocks you from working.
              </p>
              <div className="help-table-wrap">
                <table className="help-ref">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Status</th>
                      <th>What it means</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1 – 15</td>
                      <td>Trialing</td>
                      <td>Full Growth-level access, whether or not you've picked a plan.</td>
                    </tr>
                    <tr>
                      <td>16 – 29</td>
                      <td>Payment due</td>
                      <td>A banner asks you to add a payment method. Nothing is restricted yet.</td>
                    </tr>
                    <tr>
                      <td>30+</td>
                      <td>Read-only</td>
                      <td>Viewing still works everywhere; creating, editing, and deleting is blocked until a plan is active.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>Adding a payment method at any point — even mid-trial — starts your subscription immediately and cancels the countdown.</p>
            </div>

            <div className="help-sub">
              <h3>The onboarding checklist</h3>
              <p>
                New workspaces see a short checklist at the top of Overview: add your first employee, invite a
                teammate, and set up a time off policy — each one links straight to the right page. Don't want to
                type real data yet? <strong>Load sample data</strong> fills your workspace with example employees
                and companies so you can click around safely first.
              </p>
            </div>
          </section>

          {/* ===== Roles & team ===== */}
          <section className="help-section" id="g-roles">
            <div className="help-eyebrow">
              <TeamIcon />
              People
            </div>
            <h2>Roles &amp; team</h2>
            <p className="help-intro">Every workspace has exactly one Owner and any number of other roles you design yourself.</p>

            <div className="help-sub">
              <h3>Inviting a teammate</h3>
              <ol className="help-steps">
                <li>
                  Go to <strong>Settings → Users</strong> and click <strong>Invite</strong>.
                </li>
                <li>Enter their email and pick a role from your workspace's list of assignable roles.</li>
                <li>
                  They receive an email invite; opening it lets them set a password and jump straight in — no
                  separate email verification step, since a teammate you invited is already trusted.
                </li>
              </ol>
              <p>
                You can also invite someone directly from an existing <strong>Employee</strong> record — open their
                profile, use the "…" menu, and choose <strong>Invite to app</strong>. This links their new login to
                their existing HR record instead of creating a duplicate person.
              </p>
            </div>

            <div className="help-sub">
              <h3>Understanding roles</h3>
              <p>Every workspace starts with three roles, but only one of them is fixed:</p>
              <dl className="help-fieldgrid">
                <div className="help-fielddef">
                  <dt>Owner</dt>
                  <dd>
                    One per workspace. Always has full access to everything; can't be limited, renamed, or deleted.
                    Only the Owner can transfer ownership or reach billing and Roles &amp; Permissions.
                  </dd>
                </div>
                <div className="help-fielddef">
                  <dt>Admin</dt>
                  <dd>A starting-point role with broad access. Fully editable — rename it, change what it can do, or delete it like any other role.</dd>
                </div>
                <div className="help-fielddef">
                  <dt>Member</dt>
                  <dd>A starting-point role with light access. Same as Admin — it's a suggestion, not a fixed tier.</dd>
                </div>
              </dl>
              <p>
                Beyond those two starting points, the Owner can create as many <strong>custom roles</strong> as the
                plan allows (see the plan limits table in Billing &amp; plans) — a "Field Sales Rep" that only sees
                its own pipeline, a "Payroll Clerk" that can run payroll but not touch Roles &amp; Permissions, and
                so on.
              </p>
            </div>

            <div className="help-sub">
              <h3>Building a custom role</h3>
              <ol className="help-steps">
                <li>
                  Open <strong>Settings → Roles &amp; Permissions</strong> (Owner only) and click{' '}
                  <strong>New role</strong>.
                </li>
                <li>Optionally start from a copy of an existing role instead of a blank one.</li>
                <li>
                  Toggle permissions in the grid — grouped into People, Sales, Configuration, Team, Money,
                  Reporting, Workspace, and Time off. Some toggles depend on others (for example, managing
                  opportunities requires viewing companies and contacts first) — the screen tells you what's
                  missing if you try to skip a step.
                </li>
                <li>Save. Anyone on that role sees the change next time they load the app.</li>
              </ol>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  <strong>Field-level restrictions</strong> go further than module access: on Employee, Company,
                  Contact, and Opportunity records, specific fields can be hidden per role — the usual example is
                  hiding pay rate from a role that shouldn't see compensation. A record's name always stays visible.
                </p>
              </div>
              <div className="help-callout help-callout-warn">
                <AlertTriangleIcon />
                <p>
                  Roles today control <em>which modules and actions</em> someone can use — not yet{' '}
                  <em>which records</em>. There's no built-in way to limit a role to "only their own deals" or "only
                  their department's employees." Everyone with view access on a module sees every record in it.
                </p>
              </div>
            </div>

            <div className="help-sub">
              <h3>Deleting a role &amp; transferring ownership</h3>
              <p>
                A role can't be deleted while anyone is still assigned to it — move them to a different role first,
                from <strong>Settings → Users</strong>. To hand over the workspace itself, the current Owner picks{' '}
                <strong>Owner (transfer ownership)</strong> next to a teammate's name; this is a deliberate,
                confirmed action that also demotes the outgoing Owner to Admin.
              </p>
            </div>
          </section>

          {/* ===== CRM ===== */}
          <section className="help-section" id="g-crm">
            <div className="help-eyebrow">
              <BuildingIcon />
              Sales
            </div>
            <h2>Companies &amp; contacts</h2>
            <p className="help-intro">Your CRM's two core records — the organizations you sell to, and the people inside them.</p>

            <div className="help-sub">
              <h3>Companies</h3>
              <p>
                A Company tracks name, industry, website, phone, billing address, size (from a list your team
                manages), an account owner, and a lifecycle status.
              </p>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  You can't create a Company on its own — the "Add Company" form always asks for a founding contact
                  (name and email) at the same time, so no company ever exists without at least one person to reach.
                </p>
              </div>
              <p>
                A Company's <strong>status is automatic</strong>, driven by how its deals close (won or lost) —
                nobody sets it by dragging or picking from a dropdown. Admins can still rename, recolor, and reorder
                the list of possible statuses.
              </p>
              <p>
                <strong>Company hierarchy:</strong> link one company as another's parent from its detail panel; the
                child's profile lists its siblings, and the picker won't let you create a loop. Deleting a company
                with children just detaches them, unless you choose to delete the whole branch.
              </p>
            </div>

            <div className="help-sub">
              <h3>Contacts</h3>
              <p>
                A Contact is a person — name, email, phone, title, an optional link to a Company (a contact can
                exist as an unattached lead), a Lead Status (New, Contacted, Qualified, Disqualified), and a Lead
                Source from your team's own list.
              </p>
              <p>
                Once linked to a Company, a contact can be marked as that company's <strong>primary</strong>{' '}
                contact, and its profile lists everyone else at the same company for quick navigation.
              </p>
            </div>

            <div className="help-sub">
              <h3>Deleting a Company or Contact</h3>
              <p>
                Because deals can't exist without a company, deleting one asks you to confirm what happens to any
                linked Opportunities. Deleting a Contact just unlinks it from anywhere it's referenced.
              </p>
            </div>
          </section>

          {/* ===== Pipelines ===== */}
          <section className="help-section" id="g-pipeline">
            <div className="help-eyebrow">
              <KanbanIcon />
              Sales
            </div>
            <h2>Pipelines &amp; deals</h2>
            <p className="help-intro">Opportunities move through pipelines you design — with forecasting and auto-assignment built in.</p>

            <div className="help-sub">
              <h3>Setting up a pipeline</h3>
              <p>
                Create pipelines from <strong>Settings → Pipelines</strong>. Each one is either:
              </p>
              <ul>
                <li><strong>Leads pipeline</strong> — company optional, for unqualified prospects.</li>
                <li><strong>Account pipeline</strong> — for deals against a company you've already identified.</li>
              </ul>
              <p>
                This type can't be changed after creation. Each pipeline has its own ordered <strong>stages</strong>
                , and each stage has a name, a color, an outcome (Open / Won / Lost), and — for Open stages — a win
                probability used for forecasting. Drag stages to reorder, or archive a pipeline you no longer use
                (its history stays intact and read-only).
              </p>
            </div>

            <div className="help-sub">
              <h3>Working a deal</h3>
              <p>
                Drag a card between stage columns on the Kanban board, or change <strong>Stage</strong> from the
                dropdown on the deal's own panel. Every Opportunity tracks amount, currency, estimated close date,
                a "next step" note with its own date, and can link several Contacts, each with a free-text role
                like "Decision maker."
              </p>
              <p>
                The toolbar above each pipeline shows a <strong>weighted value</strong> — the sum of every open
                deal's amount × its stage's win probability — a fast read on how much of your pipeline is
                realistically likely to close.
              </p>
            </div>

            <div className="help-sub">
              <h3>Closing a deal</h3>
              <p>
                Moving a card into a <strong>Won</strong> stage asks for a win reason; moving into{' '}
                <strong>Lost</strong> asks for a loss reason from your team's list — both take an optional note.
                Winning a deal in a Leads pipeline offers to carry it into an Account pipeline so you can keep
                tracking the relationship.
              </p>
            </div>

            <div className="help-sub">
              <h3>Auto-assigning owners</h3>
              <p>Each pipeline can automatically assign a new deal's owner, configured from the pipeline's settings:</p>
              <div className="help-table-wrap">
                <table className="help-ref">
                  <thead>
                    <tr>
                      <th>Mode</th>
                      <th>What happens</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Off</td><td>You pick an owner by hand every time.</td></tr>
                    <tr><td>Round robin — by user</td><td>Rotates evenly across a list of people you choose.</td></tr>
                    <tr><td>Round robin — by department</td><td>Same rotation, seeded from everyone currently in a department — a one-time pull, not a live sync, so add new hires again later.</td></tr>
                    <tr><td>Account owner</td><td>Account pipelines only — uses the company's Account Owner, falling back to round robin if none is set.</td></tr>
                  </tbody>
                </table>
              </div>
              <p>
                Only active team members are ever selected. A deal you're assigned this way doesn't send its own
                notification — you'll hear about it the next time it changes stage or goes stale.
              </p>
            </div>

            <div className="help-sub">
              <h3>Notifications &amp; stalled deals</h3>
              <p>
                Each stage has its own toggle for notifying the owner when a deal enters it (handy to silence a
                noisy first stage), and each pipeline can flag a deal as "stalled" after a number of days without a
                stage change. Both surface in the bell icon at the top of the app — never for a move you made
                yourself.
              </p>
              <p>
                The bell also has a "What's new" section for platform-wide updates — new features and changes to
                our Terms of Service, Privacy Policy, or Refund Policy (which also arrive by email). You can review
                the current Terms, Privacy, and Refund Policy anytime from Help &amp; FAQ.
              </p>
            </div>
          </section>

          {/* ===== Organize ===== */}
          <section className="help-section" id="g-organize">
            <div className="help-eyebrow">
              <GridIcon />
              Shared tools
            </div>
            <h2>Views, tags &amp; custom fields</h2>
            <p className="help-intro">The same organizing tools work the same way across Companies, Contacts, and Employees.</p>

            <div className="help-sub">
              <h3>Views</h3>
              <p>
                A View bundles a layout (Grid, List, or Kanban), a filter, a sort order, and — for Kanban/List — a
                "group by" field into one saved tab above the table. Keep a view <strong>personal</strong>, or make
                it <strong>shared</strong> for the whole team (creating a shared view needs an admin-level
                permission). Opportunities are the one module that skips this system — they're always browsed by
                pipeline tabs and their Kanban board instead.
              </p>
            </div>

            <div className="help-sub">
              <h3>Filters &amp; columns</h3>
              <p>
                The Filter button stacks any number of field + condition + value rules. Columns can be shown or
                hidden, resized, reordered by drag, and sorted by clicking their header — each table remembers its
                own layout per saved view.
              </p>
            </div>

            <div className="help-sub">
              <h3>Tags</h3>
              <p>
                Free-form labels shared across Companies, Contacts, and Employees — start typing to reuse an
                existing tag or create a new one on the spot. Every list has a "filter by tag" option in its
                toolbar.
              </p>
            </div>

            <div className="help-sub">
              <h3>Custom fields</h3>
              <ol className="help-steps">
                <li>On any table (Employees, Companies, Contacts, or Opportunities), click the <strong>+</strong> at the far right of the column headers.</li>
                <li>Name the field and choose a type: Text, Number, Date, Email, or a Select dropdown with your own options.</li>
                <li>Decide whether it's required, and save — it's now a real column, and shows up automatically in that module's CSV template.</li>
              </ol>
              <p>
                Use the "…" menu on any custom field's column header to rename it, edit its options, deactivate it
                (hides it without losing past answers), or just hide it for yourself.
              </p>
            </div>

            <div className="help-sub">
              <h3>Statuses &amp; catalogs</h3>
              <p>
                The "…" menu on a Status column opens a manager for that module's status options — add, recolor,
                reorder, and set a default. The same pattern manages your shared catalogs: <strong>Department</strong>
                , <strong>Job Title</strong>, <strong>Lead Source</strong>, <strong>Loss Reason</strong>,{' '}
                <strong>Win Reason</strong>, and <strong>Company Size</strong> — wherever that field shows up in the
                app.
              </p>
            </div>
          </section>

          {/* ===== HR ===== */}
          <section className="help-section" id="g-hr">
            <div className="help-eyebrow">
              <PeopleIcon />
              People
            </div>
            <h2>Employees &amp; time off</h2>
            <p className="help-intro">Your team roster, reporting lines, and how time off gets requested and approved.</p>

            <div className="help-sub">
              <h3>The People directory</h3>
              <p>Every person tracked in HR has a <strong>Person Type</strong> that decides what else applies:</p>
              <dl className="help-fieldgrid">
                <div className="help-fielddef">
                  <dt>Profile</dt>
                  <dd>Someone you're tracking with no pay contract — never appears in Payroll.</dd>
                </div>
                <div className="help-fielddef">
                  <dt>Contractor / Employee</dt>
                  <dd>Requires an initial pay contract (rate, currency, frequency) filled in the same "Add Person" form before saving.</dd>
                </div>
              </dl>
              <p>
                Other fields include department and job title (from your catalogs), reporting manager, start/end
                dates, contract type, nationality, country of residence, an optional birthday, a contract link, a
                personal email alongside the work one, plus any custom fields and tags your team has added.
              </p>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  Assigning "Reports To" is checked for loops — you can't set someone as their own manager's
                  manager. And a brand-new Contractor or Employee is left out of payroll runs and time-off balances
                  until their first pay contract is confirmed (shown as a "Contract: Pending" chip, turning
                  "Expired" after 3 days).
                </p>
              </div>
            </div>

            <div className="help-sub">
              <h3>Giving someone a login</h3>
              <p>
                From a person's profile, open the "…" menu and choose <strong>Invite to app</strong> (only shown if
                they don't already have one). Pick a role, and an email invite goes out — the link is also copied
                to your clipboard in case you'd rather send it yourself.
              </p>
            </div>

            <div className="help-sub">
              <h3>Time off policies</h3>
              <p>
                Built under <strong>HR → Time Off → Policies</strong>: a name, days per year, whether it's paid,
                whether requests need approval, and how days accrue —
              </p>
              <ul>
                <li><strong>Fixed annual</strong> — the full amount is available right away.</li>
                <li><strong>Monthly</strong> — days accrue gradually as each month begins, capped at 12 months.</li>
              </ul>
              <p>
                Assign a policy to people one at a time or in bulk from the <strong>Assignments</strong> tab, or
                right after creating a new policy.
              </p>
            </div>

            <div className="help-sub">
              <h3>Requesting &amp; approving time off</h3>
              <ol className="help-steps">
                <li>From <strong>My Requests</strong>, pick one of your assigned policies, a date range, and an optional note.</li>
                <li>If the policy requires approval, it routes to your direct manager automatically. If not, it's approved instantly.</li>
                <li>Owner, Admin, or anyone with the time-off decision permission can approve or reject any request as an override, regardless of the reporting line.</li>
              </ol>
              <p>
                A pending request notifies your manager and the account owner in the bell icon (even if you don't
                have a manager assigned); a decision — approved or rejected — notifies you back the same way.
              </p>
              <p>
                Balances (Allocated / Used / Pending / Remaining) are calculated live and reset every January 1st —
                changing someone's policy never rewrites their past requests, and a deleted policy just deactivates
                rather than erasing history.
              </p>
              <p>
                The Overview calendar shows the whole team's approved time off alongside tasks and birthdays, and
                connecting Google Calendar (see Integrations &amp; API) pushes your own approved time off onto your
                personal calendar automatically.
              </p>
            </div>
          </section>

          {/* ===== Payroll ===== */}
          <section className="help-section" id="g-payroll">
            <div className="help-eyebrow">
              <BriefcaseIcon />
              People
            </div>
            <h2>Payroll</h2>
            <div className="help-tagrow">
              <span className="help-pill help-pill-plan">Growth plan</span>
              <span className="help-pill help-pill-role">Owner, or a role with Manage Payroll</span>
            </div>
            <p className="help-intro">A record of what people are paid, and a way to run pay cycles — not a bank transfer service, and not tax paperwork.</p>

            <div className="help-callout help-callout-note">
              <InfoIcon />
              <p>
                Payroll doesn't move any money — it's a shared source of truth for what everyone is owed and what's
                already been paid, so it stays consistent across the team.
              </p>
            </div>

            <div className="help-sub">
              <h3>Compensation</h3>
              <p>
                Each person's pay terms — hourly or fixed rate, currency, frequency, and effective date — live in a{' '}
                <strong>versioned history</strong>. Giving someone a raise creates a new record and closes the old
                one out the day before, so past pay is never overwritten.
              </p>
            </div>

            <div className="help-sub">
              <h3>Running a pay cycle</h3>
              <ol className="help-steps">
                <li>Set up your <strong>Pay frequencies</strong> (weekly, semi-monthly, monthly — with pay day and due-date offset) and <strong>Payment methods</strong> once, under Payroll's Payment Policies tab.</li>
                <li>Click <strong>New Run</strong>, pick a frequency and a period label — everyone on that frequency loads in automatically as a Draft.</li>
                <li>Enter hours for anyone paid hourly (the run can't be confirmed until you do), and add any <strong>Bonus, Commission, Reimbursement,</strong> or <strong>Deduction</strong> lines per person.</li>
                <li>Click <strong>Confirm Run</strong> to lock it in.</li>
              </ol>
              <div className="help-callout help-callout-danger">
                <AlertCircleIcon />
                <p>A confirmed run can't be edited or reopened from the UI — double-check hours and adjustments before confirming.</p>
              </div>
              <p>
                Need to pay someone outside a normal cycle? Use <strong>One-off Payment</strong> — same adjustment
                types, shown alongside regular runs in one combined timeline.
              </p>
            </div>

            <div className="help-sub">
              <h3>Payslips</h3>
              <p>
                Every payment has a preview icon that opens a downloadable PDF, clearly labeled{' '}
                <strong>"Preview only — not sent"</strong> — a reference for your records, not an official or legal
                payslip.
              </p>
            </div>

            <div className="help-sub">
              <h3>Who can see it</h3>
              <p>
                Payroll — including any single person's own compensation and payment history — is invisible to
                everyone except the Owner, unless a custom role is explicitly given the Manage Payroll permission.
                There's currently no self-service view for someone to see their own pay.
              </p>
            </div>

            <div className="help-sub">
              <h3>Ending a contract</h3>
              <p>
                From a person's profile, "…" → <strong>Terminate</strong>. Pick a last day — today or earlier takes
                effect immediately, a future date schedules it to run automatically that day.
              </p>
              <p>
                Once it takes effect: status becomes Terminated, their compensation closes out (so they drop from
                future runs automatically), app access is optionally revoked, any pending or future time off is
                cancelled, and their direct reports are reassigned to a manager you choose. An optional final
                payment can be recorded with the same adjustment lines as a normal run. Every past payment —
                including the final one — stays visible on their profile's <strong>Payment History</strong> tab.
              </p>
            </div>
          </section>

          {/* ===== Tasks & Notes ===== */}
          <section className="help-section" id="g-tasks">
            <div className="help-eyebrow">
              <ListIcon />
              Shared tools
            </div>
            <h2>Tasks &amp; notes</h2>
            <p className="help-intro">Two lightweight tools that live on every Company, Contact, Opportunity, and Employee record.</p>

            <div className="help-sub">
              <h3>Tasks</h3>
              <p>
                A simple follow-up: title, description, an assignee (you, by default), and a due date with an
                optional time. Check it off directly from the list, or click it to edit or delete. Every task also
                shows up in two other places — the <strong>My tasks</strong> widget and the calendar, both on your
                Overview page — so nothing gets buried inside a record you don't visit often.
              </p>
            </div>

            <div className="help-sub">
              <h3>Notes</h3>
              <p>
                A title plus a longer description with light formatting — for context you want on the record
                permanently, not something to check off. Every note and task shows who wrote it and when.
              </p>
            </div>
          </section>

          {/* ===== Public forms ===== */}
          <section className="help-section" id="g-forms">
            <div className="help-eyebrow">
              <FormIcon />
              Connect
            </div>
            <h2>Public forms</h2>
            <p className="help-intro">A shareable web link — no login required — for hiring intake or inbound sales leads.</p>

            <div className="help-sub">
              <h3>Building one</h3>
              <ol className="help-steps">
                <li>Go to <strong>Settings → Public Forms</strong> and pick a type: Employee, Client, or Contact.</li>
                <li>Give it a name — this generates a link you can edit before creating the form (locked afterward).</li>
                <li>Drag in the fields you want to collect, from your built-in fields and any custom fields; mark any of them required. Name, last name, and email are always collected.</li>
                <li>Write a "thank you" message shown after someone submits.</li>
              </ol>
              <p>
                A <strong>Contact</strong> form can optionally be tied to a Pipeline — a submission that matches an
                existing Company then also creates an Opportunity in that pipeline's first stage automatically.
              </p>
            </div>

            <div className="help-sub">
              <h3>Sharing &amp; protecting it</h3>
              <p>
                Copy the link from the form's row and share it anywhere. Toggle a form <strong>Active/Inactive</strong>{' '}
                any time — an inactive form shows visitors a plain "no longer accepting submissions" message. Every
                form has a hidden honeypot field and a CAPTCHA check built in against spam.
              </p>
            </div>

            <div className="help-callout help-callout-warn">
              <AlertTriangleIcon />
              <p>
                A submission is created directly into your workspace, with no review queue in between — an Employee
                form submission becomes a real Employee record the moment it's sent, the same as Client or Contact
                forms. If you want to vet applicants first, treat the resulting record's status as your "under
                review" step.
              </p>
            </div>
          </section>

          {/* ===== Integrations ===== */}
          <section className="help-section" id="g-integrations">
            <div className="help-eyebrow">
              <PlugIcon />
              Connect
            </div>
            <h2>Integrations &amp; API</h2>
            <p className="help-intro">
              All connections live in one place: <strong>Settings → Integrations.</strong>
            </p>

            <div className="help-sub">
              <h3>Google Calendar</h3>
              <p>
                A personal connection — each person connects their own Google account, not one shared for the whole
                company. Once connected:
              </p>
              <ul>
                <li>Your own tasks with a due time and your own approved time off sync onto your Google Calendar automatically.</li>
                <li>The sync is <strong>two-way</strong> — editing or deleting the synced event on the Google side reflects back in Northstack.</li>
                <li>Approved time off syncs <strong>team-wide</strong>, so a teammate's approved leave can appear on your calendar too, not only your own.</li>
                <li>Birthdays never sync to Google — they're opt-in and stay inside Northstack's own Overview calendar only.</li>
              </ul>
              <p>Disconnecting stops future syncing but doesn't remove events already created on Google.</p>
            </div>

            <div className="help-sub">
              <h3>Payments — your own Stripe account</h3>
              <div className="help-tagrow">
                <span className="help-pill help-pill-plan">Growth plan</span>
              </div>
              <p>
                This is separate from Northstack's own subscription billing — it lets you connect{' '}
                <strong>your</strong> Stripe account to see <strong>your customers'</strong> payment activity inside
                Northstack.
              </p>
              <ol className="help-steps">
                <li>In Stripe, create a <strong>Restricted API key</strong> with read-only access.</li>
                <li>Paste it into <strong>Settings → Integrations → Stripe</strong> (Owner, or a role with the Payments permission).</li>
                <li>Companies are matched to Stripe customers automatically by email when there's exactly one match; if several could match, you'll be asked to pick manually from a Company's profile.</li>
              </ol>
              <p>
                Each matched Company's profile then shows a full, paginated payment history with links back to the
                Stripe receipt, and you'll get an in-app notification for a refund, a failed charge, or a
                subscription going past-due or being cancelled. These checks run twice a day, not instantly.
              </p>
            </div>

            <div className="help-sub">
              <h3>API keys &amp; developer docs</h3>
              <div className="help-tagrow">
                <span className="help-pill help-pill-role">Owner, or a role with Manage API access</span>
              </div>
              <p>
                For your own scripts, or tools like Zapier or Make: create a key from{' '}
                <strong>Settings → Integrations → API Keys</strong>, choosing exactly which resources it can read
                or write (Tasks, Notes, Companies, Contacts, Opportunities, Employees, Time Off — Pipelines and
                Payroll are read-only through the API). The full key is shown once, at creation — copy it
                immediately, since Northstack never displays it again. Revoking a key is immediate and can't be
                undone.
              </p>
              <p>
                Full request and response documentation lives at <strong>/developers</strong> (linked from the API
                Keys page) — it requires being signed in, so it isn't reachable by the public.
              </p>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  Outbound webhooks (Northstack pushing updates to your own URL) aren't available yet — there's no
                  setup screen for them today. If you need to react to changes elsewhere, poll the API for now.
                </p>
              </div>
            </div>
          </section>

          {/* ===== Settings ===== */}
          <section className="help-section" id="g-settings">
            <div className="help-eyebrow">
              <GearIcon />
              Workspace
            </div>
            <h2>Settings &amp; appearance</h2>
            <p className="help-intro">Settings is grouped into what's personal to you, and what belongs to the whole company.</p>

            <dl className="help-fieldgrid">
              <div className="help-fielddef">
                <dt>My account</dt>
                <dd>Profile (name, phone, password), Integrations, and Billing (if you manage it) — visible to everyone.</dd>
              </div>
              <div className="help-fielddef">
                <dt>Company</dt>
                <dd>Appearance, Users, Public Forms, Pipelines, Activity Log, and Roles &amp; Permissions — each tile only appears if you have the matching permission.</dd>
              </div>
            </dl>

            <div className="help-sub">
              <h3>Appearance</h3>
              <p>
                Theme — Light, Dark, or System — is a personal choice saved per device, not shared with your team.
                Currency is workspace-wide (one ISO currency, e.g. USD or EUR) and controls how compensation
                figures are labeled across the company; changing it relabels amounts going forward, it doesn't
                convert past figures.
              </p>
            </div>

            <div className="help-sub">
              <h3>Activity Log</h3>
              <p>
                Every create, edit, and delete across the workspace is recorded with the old and new value for each
                field that changed. Find it two ways: an <strong>Activity</strong> tab on any individual record, or
                the full, filterable <strong>Settings → Activity Log</strong> page (Owner/Admin). How far back it
                goes depends on your plan — 7 days on Starter, 30 on Growth.
              </p>
            </div>
          </section>

          {/* ===== Billing ===== */}
          <section className="help-section" id="g-billing">
            <div className="help-eyebrow">
              <CreditCardIcon />
              Workspace
            </div>
            <h2>Billing &amp; plans</h2>
            <p className="help-intro">Two self-serve plans, plus a talk-to-us tier for larger teams.</p>

            <div className="help-table-wrap">
              <table className="help-ref">
                <thead>
                  <tr>
                    <th>&nbsp;</th>
                    <th>Starter</th>
                    <th>Growth</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Price</td><td className="num">$29/mo</td><td className="num">$79/mo</td></tr>
                  <tr><td>Pipelines</td><td className="num">2</td><td className="num">Unlimited</td></tr>
                  <tr><td>Time off policies</td><td className="num">3</td><td className="num">Unlimited</td></tr>
                  <tr><td>Admin seats</td><td className="num">2</td><td className="num">5</td></tr>
                  <tr><td>Custom roles</td><td className="num">2</td><td className="num">Unlimited</td></tr>
                  <tr><td>Activity log history</td><td className="num">7 days</td><td className="num">30 days</td></tr>
                  <tr><td>Payroll</td><td className="no">—</td><td className="yes">Included</td></tr>
                  <tr><td>Payments (your Stripe)</td><td className="no">—</td><td className="yes">Included</td></tr>
                </tbody>
              </table>
            </div>
            <p className="help-intro" style={{ marginTop: '-8px' }}>
              Prices shown in USD. A third tier, <strong>Scale</strong>, is available by talking to us directly
              rather than self-serve checkout. "Admin seats" only counts people on the base Admin role — custom
              roles, however privileged, don't count against it.
            </p>

            <div className="help-sub">
              <h3>Choosing how you pay</h3>
              <p>
                This is automatic, based on your workspace's country — not something you pick yourself. Argentina
                bills in ARS through Mercado Pago; every other country bills in USD through Paddle. Northstack
                never sees or stores your card details either way.
              </p>
            </div>

            <div className="help-sub">
              <h3>Subscribing, changing, and cancelling</h3>
              <ul>
                <li><strong>Subscribe</strong> from the Billing page (or the trial banner) — you'll be sent to your payment provider's own secure checkout in a new tab.</li>
                <li><strong>Change plan</strong> reopens the plan picker. If you're already paying, the change takes effect at your next billing date; if you're still on the trial, it goes straight to checkout.</li>
                <li><strong>Update payment method</strong> uses the same flow as subscribing.</li>
                <li><strong>Cancel subscription</strong> keeps your access through the end of the period you already paid for — a <strong>Resume subscription</strong> button appears until then if you change your mind.</li>
              </ul>
              <p>Invoices are listed on the Billing page with date, amount, and status.</p>
            </div>

            <div className="help-sub">
              <h3>If a payment fails</h3>
              <p>
                You get a 14-day grace period with full access and a warning banner. If it lapses without a
                successful payment, your workspace becomes <strong>read-only</strong> — viewing keeps working
                everywhere, but no one can create, edit, or delete anything until billing is resolved.
              </p>
            </div>
          </section>

          {/* ===== Data ===== */}
          <section className="help-section" id="g-data">
            <div className="help-eyebrow">
              <DownloadIcon />
              Workspace
            </div>
            <h2>Import &amp; export</h2>
            <p className="help-intro">Bring data in or take it out with CSV — supported today on People, Companies, and Contacts.</p>

            <ol className="help-steps">
              <li>From the module's toolbar, download the <strong>template</strong> — it includes the right column headers plus one filled-in example row.</li>
              <li>Fill it in and upload it back through the same menu.</li>
              <li>Review the results panel: how many records were created, and a row-by-row list of anything that failed and why.</li>
            </ol>
            <div className="help-callout help-callout-note">
              <InfoIcon />
              <p>
                A Company import needs a Primary Contact Email on every row — it links to a matching existing
                contact automatically, or creates a new one alongside the company if you also include a first and
                last name.
              </p>
            </div>
            <p>Access to import/export is permission-gated per module and can differ from general edit access — check with your Owner or Admin if a button seems to be missing.</p>
          </section>

          {/* ===== Mobile ===== */}
          <section className="help-section" id="g-mobile">
            <div className="help-eyebrow">
              <DeviceIcon />
              Workspace
            </div>
            <h2>On the go</h2>
            <p className="help-intro">Northstack works from your phone's browser today.</p>
            <p>
              Open the same web address on your phone and the layout adapts — menus, tabs, and forms are all
              reworked for a small screen. There's no Northstack app in the App Store or Play Store yet; for now,
              the browser is the way to use Northstack on mobile.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
