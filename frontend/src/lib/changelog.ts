export interface ChangelogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
}

// Newest first. Hand-maintained — no CMS for this yet, entries are added
// here as part of the change they describe. Keep entries short and written
// for the person using the app, not as engineering commit messages.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: '2026-09-09-timeoff-notifications',
    date: '2026-09-09',
    title: 'Time Off shows up in your notifications',
    description:
      'Requesting time off now notifies your manager (and the account owner) right away, and approving or denying a request notifies the employee — both in the bell icon, not just email.',
  },
  {
    id: '2026-09-08-mobile-android',
    date: '2026-09-08',
    title: 'Northstack on mobile, and a downloadable Android app',
    description:
      'The whole app is now redesigned for phones and tablets — tables, panels, and navigation all adapt to a smaller screen. An early Android app build is also available for testing.',
  },
  {
    id: '2026-09-08-private-api',
    date: '2026-09-08',
    title: 'Private API and API keys',
    description: 'Generate API keys from Settings to read and write your data programmatically. Full reference docs live at /developers.',
  },
  {
    id: '2026-09-07-custom-roles',
    date: '2026-09-07',
    title: 'Custom roles and permissions',
    description:
      'Replace the fixed Owner/Admin/Member roles with your own — control exactly what each role can view, edit, and approve, down to individual fields.',
  },
  {
    id: '2026-08-31-csv',
    date: '2026-08-31',
    title: 'CSV import/export for Companies and Contacts',
    description:
      'Companies and Contacts now support the same CSV export, template download, and import that Employees already had, plus a few Employee CSV fixes.',
  },
  {
    id: '2026-08-30-activity-log',
    date: '2026-08-30',
    title: 'Activity Log',
    description: "See a full history of who changed what and when, on any record's own Activity tab or the tenant-wide feed in Settings.",
  },
  {
    id: '2026-08-24-notifications',
    date: '2026-08-24',
    title: 'In-app notifications',
    description: 'The bell icon in the header now surfaces real-time updates, starting with Opportunity stage changes and Stripe billing alerts.',
  },
  {
    id: '2026-08-23-google-calendar',
    date: '2026-08-23',
    title: 'Google Calendar sync and birthdays',
    description:
      "Connect Google Calendar to sync Tasks and Time Off both ways, give Tasks a specific time of day, and see the whole team's birthdays and time off on one calendar.",
  },
  {
    id: '2026-08-21-billing',
    date: '2026-08-21',
    title: 'Real subscription billing',
    description:
      'Subscriptions now run through real payment providers — Paddle internationally, Mercado Pago in Argentina — with plan upgrades, downgrades, and billing history in Settings.',
  },
  {
    id: '2026-08-13-signup-plans',
    date: '2026-08-13',
    title: 'Plans and self-service signup',
    description:
      'New workspaces sign up with email verification and choose a plan (Starter or Growth) up front. Existing workspaces can see and change their plan from Settings.',
  },
  {
    id: '2026-08-09-payroll',
    date: '2026-08-09',
    title: 'Payroll',
    description:
      'Track compensation, run payroll per pay period, handle one-off payments and adjustments, and generate payslip PDFs — all from a new Payroll section.',
  },
  {
    id: '2026-07-30-crm-redesign',
    date: '2026-07-30',
    title: 'Companies, Contacts, Opportunities, and Pipelines replace Clients',
    description:
      'Clients has been replaced by a full CRM: Companies and Contacts with a hierarchy, Opportunities tracked through custom Pipelines with a Kanban board, plus Tasks and Notes you can attach to any record.',
  },
  {
    id: '2026-07-23-column-controls',
    date: '2026-07-23',
    title: 'Full control over table columns',
    description:
      'Drag a column header to reorder it, resize by dragging its edge, and show/hide columns from the eye icon next to Filter. Name and Status stay pinned on the left as you scroll.',
  },
  {
    id: '2026-07-23-onboarding',
    date: '2026-07-23',
    title: 'Getting-started checklist and sample data',
    description:
      'New workspaces now see a short checklist on Overview to get set up, plus a one-click "Load sample data" option to explore the app with example employees and clients.',
  },
  {
    id: '2026-07-22-employee-fields',
    date: '2026-07-22',
    title: 'More Employee fields: compensation, dates, contract link',
    description:
      'Employees now support job title, hourly/monthly rate (visible to owners only), start/end date, a personal email, and a contract link — plus a configurable Department list.',
  },
  {
    id: '2026-07-22-table-redesign',
    date: '2026-07-22',
    title: 'Refreshed Employees, Clients, and Company Users tables',
    description: 'Avatars, colored status indicators, and role badges make it easier to scan a table at a glance.',
  },
  {
    id: '2026-07-21-views-kanban',
    date: '2026-07-21',
    title: 'Saved Views and Kanban boards',
    description:
      'Save a filtered, sorted view of Employees or Clients for later, and switch to a Kanban board grouped by Status or any custom field.',
  },
  {
    id: '2026-07-21-public-forms',
    date: '2026-07-21',
    title: 'Public Forms',
    description:
      'Share a link that lets someone submit a new Employee or Client without logging in — handy for self-service intake forms.',
  },
  {
    id: '2026-07-16-settings-hub',
    date: '2026-07-16',
    title: 'Unified Settings',
    description: 'Profile, Appearance, Users, and Public Forms now live together under one Settings area.',
  },
  {
    id: '2026-07-14-time-off',
    date: '2026-07-14',
    title: 'Time Off and PTO policies',
    description: 'Configure your own leave policies and let employees request time off, with manager approval built in.',
  },
];
