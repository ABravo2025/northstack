const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'How do I invite a teammate?',
    answer:
      'Go to Settings → Users and click "Invite". They\'ll get an invite link to create their account and join your team. Only owners and admins can invite people.',
  },
  {
    question: "What's the difference between Owner, Admin, and Member roles?",
    answer:
      'Owner and Admin can create/edit Employees and Clients, manage custom fields, and invite or manage other Users. Members can view HR and Clients data but can\'t make changes. Only the Owner can promote someone else to Owner.',
  },
  {
    question: 'Who can see an employee\'s hourly or monthly rate?',
    answer: 'Compensation fields are visible to the Owner only — Admins and Members never see or receive that data, even through the API.',
  },
  {
    question: 'How do I add a custom field to Employees or Clients?',
    answer:
      'Open the "+" column at the end of the table header on the Employees or Clients page. You can also edit or remove a field from the small menu on its column header.',
  },
  {
    question: 'Can I show or hide table columns, and change their order?',
    answer:
      'Yes — use the eye icon next to Filter to show/hide columns, and drag a column header left or right to reorder it. Name and Status always stay pinned to the left.',
  },
  {
    question: 'How do Views (grid and Kanban) work?',
    answer:
      'A View is a saved combination of filters, sort, and layout (table or Kanban board). Personal views are private to you; owners and admins can also create shared views for the whole team.',
  },
  {
    question: 'How do Time Off policies work?',
    answer:
      'Owners and admins define policies (how many days, how they accrue, whether approval is required) under Time Off → Policies. Employees request time off against a policy; if approval is required, their manager gets notified.',
  },
  {
    question: 'What are Public Forms?',
    answer:
      'A Public Form is a shareable link (no login required) that lets someone submit a new Employee or Client record directly into your workspace — useful for self-service intake, like a hiring form.',
  },
  {
    question: 'How do I change the color or order of Status options?',
    answer:
      'Click the small menu icon next to "Status" in the column header to open "Manage options" — you can recolor, reorder (drag the grip handle), rename, or deactivate any status from there.',
  },
  {
    question: 'Is my data visible to other companies using Northstack?',
    answer:
      'No. Every tenant\'s data is fully isolated — Employees, Clients, custom fields, and settings are scoped to your company and never shared across tenants.',
  },
];

export default function HelpPage() {
  return (
    <div>
      <div className="page-toolbar">
        <h2>Help &amp; FAQ</h2>
      </div>

      <div className="card mt-4">
        <h3 className="card-title">Contact us</h3>
        <p className="text-sm text-brand-navy dark:text-gray-200">
          Can't find what you're looking for? Reach us directly at{' '}
          <a className="table-link" href="mailto:info@joinnorthstack.com">
            info@joinnorthstack.com
          </a>
          , or use "Send feedback" from your account menu to report a bug or share an idea.
        </p>
      </div>

      <div className="card mt-4">
        <h3 className="card-title">Frequently asked questions</h3>
        <div className="faq-list">
          {FAQ_ITEMS.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary className="faq-question">{item.question}</summary>
              <p className="faq-answer">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
