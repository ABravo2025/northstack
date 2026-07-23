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
