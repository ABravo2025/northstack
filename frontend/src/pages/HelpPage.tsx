import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollSpy } from '../hooks/useScrollSpy';
import {
  BriefcaseIcon,
  ChevronDownIcon,
  CreditCardIcon,
  LockIcon,
  MailIcon,
  PlugIcon,
  SearchIcon,
  TargetIcon,
  TeamIcon,
  UserCircleIcon,
} from '../components/common/Icons';

type FaqItem = { q: string; a: string };
type FaqCategory = { id: string; label: string; icon: JSX.Element; items: FaqItem[] };

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'f-account',
    label: 'Account & access',
    icon: <UserCircleIcon />,
    items: [
      {
        q: 'What happens when my 15-day trial ends?',
        a: "Nothing breaks right away. You get a 14-day grace period with a reminder banner to add a payment method — everything still works. Only after that lapses does the workspace switch to read-only, blocking new creates/edits/deletes until you subscribe.",
      },
      {
        q: 'My workspace says it\'s "read-only" — what does that mean?',
        a: "Your trial and grace period have both run out without an active subscription. You and your team can still see everything, but can't create, edit, or delete records until a plan is active. Adding a payment method lifts the restriction immediately.",
      },
      {
        q: 'Is there a Northstack app for my phone?',
        a: "Not yet — there's no app in the App Store or Play Store. The site itself works well from a phone's browser, with menus and forms reworked for a small screen.",
      },
      {
        q: 'Can I change my email address?',
        a: "Settings → Profile lets you update your name, phone, and password. Email isn't self-editable there today — reach out at info@joinnorthstack.com if you need it changed.",
      },
      {
        q: 'Someone left the company — how do I remove their login?',
        a: 'If they\'re tracked as an Employee, terminate their record (see the Payroll section of the User Guide) and check "Also revoke their access." Otherwise, change their status from Settings → Users.',
      },
    ],
  },
  {
    id: 'f-roles',
    label: 'Roles & permissions',
    icon: <TeamIcon />,
    items: [
      {
        q: 'What\'s the difference between Owner, Admin, and Member?',
        a: 'Owner is fixed and always has full access — there\'s exactly one per workspace. Admin and Member are just starting-point roles you can freely rename, reconfigure, or delete, the same as any role you create yourself from scratch.',
      },
      {
        q: 'Can I limit a role to only see their own records, or their department\'s?',
        a: 'Not yet. Roles today control which modules and actions someone can use, and which fields they can see — not which specific records. Anyone with view access on a module sees every record in it.',
      },
      {
        q: 'Who can see an employee\'s pay rate?',
        a: "Only the Owner, by default — and only a role you've explicitly given the Manage Payroll permission, or field-level access to compensation fields, beyond that. There's no self-service view for someone to see their own pay yet.",
      },
      {
        q: 'How do I transfer ownership of the workspace?',
        a: 'Only the current Owner can do this — from Settings → Users, choose "Owner (transfer ownership)" next to the teammate\'s name and confirm. This automatically demotes the outgoing Owner to Admin.',
      },
      {
        q: "I can't delete a role — why?",
        a: "A role can't be removed while someone is still assigned to it. Move everyone on that role to a different one first, from Settings → Users.",
      },
    ],
  },
  {
    id: 'f-billing',
    label: 'Billing & plans',
    icon: <CreditCardIcon />,
    items: [
      {
        q: "What's different between Starter and Growth?",
        a: "Growth removes the caps on pipelines, time off policies, and custom roles, raises admin seats from 2 to 5, keeps activity history for 30 days instead of 7, and is the only plan with Payroll and Payments (your own Stripe) included.",
      },
      {
        q: 'Do I choose between Paddle and Mercado Pago myself?',
        a: "No — it's automatic, based on your workspace's country. Argentina bills through Mercado Pago in ARS; every other country bills through Paddle in USD.",
      },
      {
        q: 'Does Northstack store my card number?',
        a: "No. Checkout happens on Paddle's or Mercado Pago's own secure page — Northstack never receives or stores full card details.",
      },
      {
        q: 'If I cancel, do I lose access immediately?',
        a: 'No — you keep full access through the end of the period you already paid for. A "Resume subscription" button stays available until then if you change your mind.',
      },
      {
        q: 'Can I switch plans mid-cycle?',
        a: "Yes. If you're already on a paid plan, the change is scheduled for your next billing date. If you're still in your trial with no card on file, choosing a new plan goes straight to checkout.",
      },
    ],
  },
  {
    id: 'f-sales',
    label: 'Sales & CRM',
    icon: <TargetIcon />,
    items: [
      {
        q: "Why can't I set a Company's status by hand?",
        a: "It's computed automatically from how that company's deals close (won or lost), so it always reflects reality. You can still rename, recolor, and reorder the status options themselves.",
      },
      {
        q: 'Why does creating a Company ask me for a contact?',
        a: 'Every company needs at least one person to reach, so the "Add Company" form always asks for a founding contact in the same step — you can add more contacts afterward.',
      },
      {
        q: 'What does "weighted value" mean on a pipeline?',
        a: "It's each open deal's amount multiplied by its stage's win probability, then summed — a realistic forecast rather than the full, unadjusted pipeline total.",
      },
      {
        q: 'How does round-robin assignment decide who gets a new deal?',
        a: "It rotates evenly across whichever list of people (or department) you configured on that pipeline, only ever picking someone currently active. It's configured per pipeline from Settings → Pipelines.",
      },
      {
        q: 'Can I use Saved Views on Opportunities?',
        a: 'No — Opportunities are always browsed through pipeline tabs and the Kanban board. Saved Views (Grid/List/Kanban) are a Companies and Contacts feature.',
      },
    ],
  },
  {
    id: 'f-hr',
    label: 'HR & payroll',
    icon: <BriefcaseIcon />,
    items: [
      {
        q: 'Can I undo a confirmed payroll run?',
        a: "No — confirming a run locks it permanently; entries can't be added, edited, or removed afterward. Review hours and adjustments carefully before confirming.",
      },
      {
        q: 'Is the payslip PDF a legal document?',
        a: 'No. It\'s explicitly labeled "Preview only — not sent," meant as a reference document, not an official or legally binding payslip.',
      },
      {
        q: 'Does Payroll actually pay people, or move any money?',
        a: "No — it's a record-keeping tool, not a payment processor. No transfers happen from inside Northstack; you still pay people through your own bank or payment provider and log it here.",
      },
      {
        q: "What happens to someone's time off balance if I change their policy?",
        a: "Their past requests are untouched — balances are calculated live from current assignments and approved requests, so a policy change only affects things going forward.",
      },
      {
        q: 'What happens automatically when I terminate an employee?',
        a: 'Their status changes to Terminated, their compensation is closed out so they drop from future payroll runs, pending time off is cancelled, and their direct reports are reassigned to a manager you pick. App access is only revoked if you check that option.',
      },
      {
        q: "A new hire isn't showing up in my payroll run — why?",
        a: 'Their first pay contract likely hasn\'t been confirmed yet — check for a "Contract: Pending" (or "Expired," after 3 days) chip on their profile.',
      },
    ],
  },
  {
    id: 'f-data',
    label: 'Data & security',
    icon: <LockIcon />,
    items: [
      {
        q: 'Is my data visible to other companies using Northstack?',
        a: 'No. Every workspace\'s data — records, custom fields, settings — is fully isolated and never shared across workspaces.',
      },
      {
        q: 'Do Public Form submissions need approval before they show up?',
        a: 'No — a submission creates a real record immediately, with no review queue in between. If you want to vet people before treating them as active, use a status field as your own "under review" step.',
      },
      {
        q: 'Which modules support CSV import and export?',
        a: "People (Employees), Companies, and Contacts today. Opportunities don't have CSV support yet.",
      },
      {
        q: "Everything on a record's Activity tab — how far back does it go?",
        a: '7 days on Starter, 30 days on Growth — older entries are purged automatically past that window.',
      },
    ],
  },
  {
    id: 'f-integrations',
    label: 'Integrations & API',
    icon: <PlugIcon />,
    items: [
      {
        q: 'Is the Payments module the same as my Northstack subscription?',
        a: 'No, they\'re unrelated. Your Northstack subscription is billed through Paddle or Mercado Pago (see Billing & plans). Payments is a Growth-plan add-on where you connect your own Stripe account to track your customers\' payments.',
      },
      {
        q: 'Does Google Calendar sync go both ways?',
        a: 'Yes — editing or deleting a synced task or time-off event on the Google side updates it back in Northstack too.',
      },
      {
        q: 'Can I set up webhooks to push data out of Northstack?',
        a: "Not yet — there's no setup screen for outbound webhooks today. Use the API to poll for changes in the meantime.",
      },
      {
        q: 'Is the API documentation public?',
        a: "No — /developers requires being signed in to Northstack. It isn't reachable without an account.",
      },
      {
        q: 'I lost my API key — can I see it again?',
        a: 'No — the full key is only ever shown once, at creation. If it\'s lost, revoke it and create a new one.',
      },
    ],
  },
];

const TOTAL_QUESTIONS = FAQ_CATEGORIES.reduce((sum, cat) => sum + cat.items.length, 0);
const NAV_IDS = [...FAQ_CATEGORIES.map((c) => c.id), 'f-contact'];

export default function HelpPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const activeId = useScrollSpy(NAV_IDS);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => `${item.q} ${item.a}`.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0);
  }, [query]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="page-full">
      <div className="page-toolbar">
        <h2>Help &amp; FAQ</h2>
      </div>
      <p className="help-lede">Quick answers to the questions that come up most, grouped by topic — search, or browse a category on the left.</p>
      <p className="help-crosslink">
        Looking for a full walkthrough instead?{' '}
        <a href="/guide" onClick={(e) => { e.preventDefault(); navigate('/guide'); }}>
          Go to the User Guide →
        </a>
      </p>

      <div className="help-shell">
        <nav className="help-nav">
          <div className="help-nav-group">
            {FAQ_CATEGORIES.map((cat) => (
              <a
                key={cat.id}
                className={`help-nav-link${activeId === cat.id ? ' active' : ''}`}
                href={`#${cat.id}`}
                onClick={(e) => { e.preventDefault(); scrollTo(cat.id); }}
              >
                {cat.icon}
                {cat.label}
              </a>
            ))}
          </div>
          <div className="help-nav-group divided">
            <a
              className={`help-nav-link${activeId === 'f-contact' ? ' active' : ''}`}
              href="#f-contact"
              onClick={(e) => { e.preventDefault(); scrollTo('f-contact'); }}
            >
              <MailIcon />
              Contact us
            </a>
          </div>
        </nav>

        <div className="help-content">
          <div className="help-search">
            <SearchIcon />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the FAQ… e.g. “trial”, “payslip”, “webhook”"
              autoComplete="off"
            />
          </div>

          {filteredCategories.length === 0 && <p className="help-empty">No questions match that search.</p>}

          {filteredCategories.map((cat) => (
            <div className="help-faq-cat" id={cat.id} key={cat.id}>
              <div className="help-faq-cat-title">
                {cat.icon}
                {cat.label}
              </div>
              <div className="faq-list">
                {cat.items.map((item) => (
                  <details className="faq-item" key={item.q} open={query.trim() !== ''}>
                    <summary className="faq-question">
                      {item.q}
                      <ChevronDownIcon className="faq-chevron" />
                    </summary>
                    <p className="faq-answer">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}

          <div className="card help-contact-card" id="f-contact">
            <h3 className="card-title">Still need help?</h3>
            <p className="text-sm text-brand-navy dark:text-dark-ink">
              Can't find what you're looking for? Reach us directly at{' '}
              <a className="table-link" href="mailto:info@joinnorthstack.com">
                info@joinnorthstack.com
              </a>
              , or use "Send feedback" from your account menu to report a bug or share an idea.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-faint dark:text-dark-ink-faint">{TOTAL_QUESTIONS} questions</p>
    </div>
  );
}
