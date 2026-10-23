import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { perUserPriceLabel, usePlanPricing, type PlanPricing } from '../lib/planPrices';
import LegalDocumentModal from '../components/common/LegalDocumentModal';
import {
  BriefcaseIcon,
  ChevronDownIcon,
  CreditCardIcon,
  ClockIcon,
  FolderIcon,
  FormIcon,
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
        q: 'Why does Northstack ask me for a code when I sign in?',
        a: "You (or your role) have two-step verification on. Open your authenticator app and type the 6-digit code for Northstack. It's required for the account owner and for anyone who can manage billing or payments.",
      },
      {
        q: 'I lost my phone. How do I get in?',
        a: 'Use one of the recovery codes you saved when you turned it on ("Use a recovery code" on the code screen). If you don\'t have them, ask whoever manages users in your company to reset it from Settings → Users; if you are the account owner, write to info@joinnorthstack.com.',
      },
      {
        q: 'Which authenticator app should I use?',
        a: 'Any app that supports codes from a QR (TOTP): Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden… They all work the same.',
      },
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
        a: "Only the Owner, by default — and only a role you've explicitly given the Manage Payroll permission, or field-level access to compensation fields, beyond that. Everyone sees their own payslips, with amounts, in Payroll → My payslips — never anyone else's.",
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
        a: "Growth removes the caps on pipelines, time off policies, custom roles, open projects and Shifts locations, keeps activity history for 30 days instead of 7, and is the only plan with Payroll, Payments (your own Stripe), billable hours, skills and certifications, your own project templates, and the API included. Both plans are priced per active user: {starterPrice} on Starter and {growthPrice} on Growth per user per month.",
      },
      {
        q: 'How do seats work?',
        a: "Every active person in your workspace counts as one user, regardless of role, and you pay per user per month ({starterPrice} on Starter, {growthPrice} on Growth), with a minimum of {minUsers} users per team. Add or remove people and the bill adjusts on its own — no hard limit. Free Trial (before you've picked a plan) is capped at {trialCap} people, since there's no billing set up yet to cover anyone past that.",
      },
      {
        q: 'Do I choose between Dodo Payments and Mercado Pago myself?',
        a: "No — it's automatic, based on your workspace's country. Argentina bills through Mercado Pago in ARS; every other country bills through Dodo Payments in USD.",
      },
      {
        q: 'Does Northstack store my card number?',
        a: "No. Checkout happens on Dodo Payments' or Mercado Pago's own secure page — Northstack never receives or stores full card details.",
      },
      {
        q: 'If I cancel, do I lose access immediately?',
        a: 'No — you keep full access through the end of the period you already paid for. A "Resume subscription" button stays available until then if you change your mind.',
      },
      {
        q: 'Can I earn something for recommending Northstack?',
        a: "Yes. Any user can join the referral program from Referrals in the sidebar: you add how you want to get paid, accept the program terms, and get a personal link. You earn a commission on the first payments of every company that signs up with it, and they get a longer free trial. The User Guide and the program terms (linked when you join) show the current percentage and payout minimum.",
      },
      {
        q: 'When do I get paid for my referrals?',
        a: "Each commission is on hold for a few weeks after the company's payment, so a refund can still void it. Once your payable balance reaches the minimum, we send it by the method you chose and you'll see the transfer and its receipt in Referrals.",
      },
      {
        q: 'Can I switch plans mid-cycle?',
        a: "Yes. Upgrading charges the new plan's full price right away and restarts your monthly billing cycle from that day (the unused part of your old plan isn't refunded). Downgrading keeps your current plan until your next charge date and applies from then. During your trial, switching is immediate and free; with no card on file yet, choosing a plan goes straight to checkout.",
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
        a: 'No. Payslips are numbered tracking documents with a QR code anyone can use to check they\'re genuine, but they don\'t replace any payslip required by employment law. While a run is still a draft, its PDF is marked "Preview - not issued."',
      },
      {
        q: 'Who gets a payslip, and when?',
        a: 'Everyone in a pay run gets one numbered payslip when the run is confirmed (one per currency if they\'re paid in more than one), and everyone in a one-off payment gets one when it\'s recorded. It\'s emailed to them and stays in Payroll → My payslips. Whoever runs payroll can download or resend any of them from Payroll → Payslips.',
      },
      {
        q: 'What does someone see when they scan the QR code on a payslip?',
        a: 'A public page confirming the payslip is genuine: the company, the payslip number, the person\'s first name and last initial, the period and the pay date. Amounts are never shown there.',
      },
      {
        q: 'How do I put our logo and company details on payslips?',
        a: 'Go to Settings → Company profile, fill in your legal name, address, phone and website, and upload a PNG or JPG logo (up to 2 MB). New payslips, contracts and invitation emails pick them up automatically. Contracts generated earlier keep the header they were created with.',
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
    id: 'f-projects',
    label: 'Projects',
    icon: <FolderIcon />,
    items: [
      {
        q: "What's the difference between a blank project and one from a template?",
        a: 'A blank project starts with no phases or tasks. A template copies a ready-made set of phases and tasks (with dates counted from your start date and a suggested role for each task) into the new project. After that the project is yours to change — it never reads the template again.',
      },
      {
        q: 'Who gets each task when I create a project from a template?',
        a: "The team member you chose for that task's role. If the role is unassigned, or that person has no access to Northstack, the task goes to the project's owner. The preview in step 2 shows every task's assignee before you create the project.",
      },
      {
        q: 'Who can see a project?',
        a: 'Its owner and its team members always can. Anyone whose role has "View all projects" sees every project; "Manage projects" also lets them create projects and edit any of them.',
      },
      {
        q: 'How many projects can I have?',
        a: 'Starter allows 5 open projects at a time (planning, active or on hold). Completed, cancelled and archived projects don\'t count. Growth has no limit.',
      },
      {
        q: 'Can I create my own templates?',
        a: 'Yes, on Growth: open a project and use "Save as template". Phases and tasks are copied, dates become days from the start, and each assignee becomes their team role. You\'ll find it under "My templates" next time you create a project.',
      },
      {
        q: 'Can I delete a project?',
        a: 'Projects are archived instead of deleted, so their tasks, notes and history are kept. Archived projects stop counting toward your plan and can be restored from the Archived filter.',
      },
      {
        q: 'How do I talk with someone about a task?',
        a: 'Open the task and write in its conversation at the bottom. Type @ to mention anyone in the company with access to Northstack, on the project or not; they get a notification that opens the task.',
      },
      {
        q: 'Do project tasks show up in My Tasks and Google Calendar?',
        a: 'Yes. A project task is an ordinary task: it appears in My Tasks, on the Overview calendar, and in Google Calendar for whoever it\'s assigned to, if they connected it.',
      },
    ],
  },
  {
    id: 'f-shifts',
    label: 'Shifts',
    icon: <ClockIcon />,
    items: [
      {
        q: 'How do people find out about their shifts?',
        a: 'When you publish, each person gets a notification and an email with buttons to accept or say they can\'t make it (no sign-in needed), plus a file that adds the shift to their calendar. If they connected Google Calendar, the shift appears there on its own.',
      },
      {
        q: 'Do drafts reach anyone?',
        a: 'No. A new shift is a draft (dashed on the schedule) until you publish it. Only then are people told and asked to confirm.',
      },
      {
        q: 'What happens if I change a shift that was already published?',
        a: 'If you change its date, time or location, everyone on it is asked to confirm again, and their calendar event moves. Changing only the notes, position or people needed just lets them know.',
      },
      {
        q: 'Can someone without a Northstack login get shifts?',
        a: 'No. Shifts go to people with access to Northstack, so they can see them in My shifts and answer from the app or the email.',
      },
      {
        q: 'Why can\'t I assign someone?',
        a: 'Because they already have another shift at that time. Approved time off, holidays, availability and minimum rest only show a warning: you can assign them anyway.',
      },
      {
        q: 'How many locations can I have?',
        a: 'Starter allows 1 active location; Growth has no limit. A location with shifts can\'t be deleted, but it can be deactivated, which keeps its history.',
      },
      {
        q: 'Who approves my timesheet?',
        a: 'Your direct manager, or anyone whose role can approve timesheets. Once approved the week is closed: to fix it, request an adjustment from your timesheet, or ask for it to be reopened.',
      },
      {
        q: 'Are the suggested hours logged automatically?',
        a: 'No. Shifts, completed tasks, meetings and Google Calendar events only show up as suggestions. You check the time and add them; nothing is logged until you do.',
      },
      {
        q: 'Why doesn\'t a shift appear in my timesheet yet?',
        a: 'Shifts are suggested once they end, and only if you accepted them. Upcoming and unconfirmed shifts are counted in Shifts → Reports as planned hours.',
      },
      {
        q: 'Who can see the schedule cost?',
        a: 'Only people with Payroll access, and only if the company turned on "Show schedule cost" in Settings → Shifts (Growth). It uses each person\'s hourly rate from Payroll; fixed salaries are shown as hours without a rate.',
      },
      {
        q: 'If I give away a shift, is it still mine until someone takes it?',
        a: 'Yes. You keep it until a colleague takes it and, if your company asks for it, a scheduler approves. If nobody takes it before it starts, the request expires and the shift stays yours.',
      },
      {
        q: 'What if someone clocks in without a shift?',
        a: 'It\'s allowed: Northstack adds an overtime shift at that location to the schedule (amber border) and tells the scheduler, who can review it in Shifts → Today.',
      },
      {
        q: 'Does the clock-in QR change?',
        a: 'No, each location has one fixed QR. If it gets copied or shared, regenerate it in Settings → Shifts → Clock-in and print the new one; the old one stops working.',
      },
      {
        q: 'What does the client see in the hours report?',
        a: 'Only approved weeks for their company in that month: date, details, hours and whether each line is billable, plus totals. Names are optional. The link needs no login and expires after 30 days.',
      },
      {
        q: 'Does the suggested schedule publish shifts?',
        a: 'Never. It only fills draft shifts with free places, and only with what you keep ticked. Nobody hears about it until you publish the week.',
      },
      {
        q: 'Can I stop getting some emails?',
        a: 'Yes. In Settings → Profile → Email notifications, turn off the ones you don\'t want. The bell keeps showing everything, and account emails always arrive.',
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
        a: 'No, they\'re unrelated. Your Northstack subscription is billed through Dodo Payments or Mercado Pago (see Billing & plans). Payments is a Growth-plan add-on where you connect your own Stripe account to track your customers\' payments and send them invoices.',
      },
      {
        q: 'Does Google Calendar sync go both ways?',
        a: 'Yes — editing or deleting a synced task or time-off event on the Google side updates it back in Northstack too.',
      },
      {
        q: 'How do I add a Google Meet link to a Task?',
        a: 'Check "Add Google Meet video call" when creating or editing a Task — you need Google Calendar connected first. Northstack fills in a time if one isn\'t set yet, generates the Meet link on your calendar, and automatically invites the Contact, Company/Opportunity\'s primary Contact, or Employee the task is about.',
      },
      {
        q: 'Where can I see every task assigned to me, across all my records?',
        a: 'My Tasks (in the sidebar, below Overview) — every task you\'re assigned to or created, in one place, with List and Board views, search, a completed filter, and folders you can create to group related tasks together.',
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
        q: 'Can I use Claude, ChatGPT or another AI assistant with Northstack?',
        a: "Yes, on Growth. Go to Settings → Integrations → AI assistants, copy the server URL and add it as a connector in your assistant; it opens Northstack so you sign in and approve — no keys to copy. It acts as you — it can only see and do what your role allows — and asks you to confirm before deleting anything or notifying other people (publishing shifts, invitations, reports to clients). Payroll, terminations and settings stay in the app.",
      },
      {
        q: 'Can an AI assistant see more than I can?',
        a: "No. It uses your own role on every request: same employees, same hidden fields, same modules. If your role changes, the assistant changes with it. An owner can switch AI assistants off per role in Roles & Permissions.",
      },
      {
        q: 'Which plan includes the API?',
        a: "Growth (and the Free Trial). On Starter, API keys and webhooks are hidden; existing keys stop working until you upgrade, but they aren't deleted.",
      },
      {
        q: 'I lost my API key — can I see it again?',
        a: 'No — the full key is only ever shown once, at creation. If it\'s lost, revoke it and create a new one.',
      },
    ],
  },
];

const FAQ_CATEGORIES_ES: FaqCategory[] = [
  {
    id: 'f-account',
    label: 'Cuenta y acceso',
    icon: <UserCircleIcon />,
    items: [
      {
        q: '¿Por qué Northstack me pide un código al entrar?',
        a: 'Tenés activada la verificación en dos pasos (o tu rol la requiere). Abrí tu app autenticadora y escribí el código de 6 dígitos de Northstack. Es obligatoria para el dueño de la cuenta y para quien puede gestionar facturación o pagos.',
      },
      {
        q: 'Perdí el celular. ¿Cómo entro?',
        a: 'Usá uno de los códigos de recuperación que guardaste al activarla ("Usar un código de recuperación" en la pantalla del código). Si no los tenés, pedile a quien administra los usuarios de tu empresa que la restablezca desde Configuración → Usuarios; si sos el dueño de la cuenta, escribí a info@joinnorthstack.com.',
      },
      {
        q: '¿Qué app autenticadora uso?',
        a: 'Cualquiera que lea códigos desde un QR (TOTP): Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden… Todas funcionan igual.',
      },
      {
        q: '¿Qué pasa cuando termina mi prueba de 15 días?',
        a: 'No se rompe nada de entrada. Tenés un período de gracia de 14 días con un banner recordándote agregar un método de pago — todo sigue funcionando igual. Recién cuando ese plazo vence, el espacio de trabajo pasa a modo solo lectura, bloqueando creaciones, ediciones y eliminaciones nuevas hasta que te suscribas.',
      },
      {
        q: 'Mi espacio de trabajo dice que está en modo "solo lectura" — ¿qué significa?',
        a: 'Tu prueba y tu período de gracia vencieron sin que hubiera una suscripción activa. Vos y tu equipo pueden seguir viendo todo, pero no pueden crear, editar ni eliminar registros hasta que haya un plan activo. Agregar un método de pago levanta la restricción al instante.',
      },
      {
        q: '¿Hay una app de Northstack para mi celular?',
        a: 'Todavía no — no hay una app en el App Store ni en Play Store. El sitio funciona bien desde el navegador del celular, con menús y formularios adaptados a una pantalla chica.',
      },
      {
        q: '¿Puedo cambiar mi dirección de email?',
        a: 'En Configuración → Perfil podés actualizar tu nombre, teléfono y contraseña. El email todavía no se puede editar ahí mismo — escribinos a info@joinnorthstack.com si necesitás cambiarlo.',
      },
      {
        q: 'Alguien dejó la empresa — ¿cómo elimino su acceso?',
        a: 'Si la persona figura como Empleado, dá de baja su registro (ver la sección de Nómina de la Guía del usuario) y marcá la opción "También revocar su acceso". Si no, cambiá su estado desde Configuración → Usuarios.',
      },
    ],
  },
  {
    id: 'f-roles',
    label: 'Roles y permisos',
    icon: <TeamIcon />,
    items: [
      {
        q: '¿Cuál es la diferencia entre Owner, Admin y Member?',
        a: 'Owner es un rol fijo que siempre tiene acceso total — hay exactamente uno por espacio de trabajo. Admin y Member son apenas roles de partida que podés renombrar, reconfigurar o eliminar libremente, igual que cualquier rol que crees vos desde cero.',
      },
      {
        q: '¿Puedo limitar un rol para que solo vea sus propios registros, o los de su departamento?',
        a: 'Todavía no. Hoy los roles controlan qué módulos y acciones puede usar alguien, y qué campos puede ver — no qué registros específicos. Cualquiera con acceso de vista a un módulo ve todos los registros que tiene.',
      },
      {
        q: '¿Quién puede ver el sueldo de un empleado?',
        a: 'Por default, solo el Owner — y, más allá de eso, solo un rol al que le hayas dado explícitamente el permiso Gestionar nómina, o acceso a nivel de campo a los campos de compensación. Cada persona ve sus propios recibos, con montos, en Nómina → Mis recibos — nunca los de otra persona.',
      },
      {
        q: '¿Cómo transfiero la titularidad del espacio de trabajo?',
        a: 'Solo el Owner actual puede hacerlo — desde Configuración → Usuarios, elegí "Owner (transfer ownership)" junto al nombre de la persona y confirmá. Esto degrada automáticamente al Owner saliente a Admin.',
      },
      {
        q: 'No puedo eliminar un rol — ¿por qué?',
        a: 'Un rol no se puede eliminar mientras alguien lo tenga asignado. Primero pasá a todas las personas de ese rol a otro distinto, desde Configuración → Usuarios.',
      },
    ],
  },
  {
    id: 'f-billing',
    label: 'Facturación y planes',
    icon: <CreditCardIcon />,
    items: [
      {
        q: '¿Puedo ganar algo por recomendar Northstack?',
        a: "Sí. Cualquier usuario puede unirse al programa desde Referidos, en el menú lateral: cargás cómo querés cobrar, aceptás los términos del programa y recibís un link personal. Cobrás una comisión sobre los primeros pagos de cada empresa que se registre con ese link, y ellos tienen una prueba gratuita más larga. La Guía del usuario y los términos del programa (en el link al unirte) muestran el porcentaje y el mínimo vigentes.",
      },
      {
        q: '¿Cuándo cobro mis referidos?',
        a: "Cada comisión queda en espera unas semanas después del pago de la empresa, por si hay un reembolso. Cuando tu saldo a cobrar llega al mínimo, te lo transferimos por el medio que elegiste y ves la transferencia y su comprobante en Referidos.",
      },
      {
        q: '¿Qué diferencia hay entre Starter y Growth?',
        a: 'Growth saca los topes de pipelines, políticas de ausencias, roles personalizados, proyectos abiertos y sedes de Turnos, guarda el historial de actividad 30 días en vez de 7, y es el único plan que incluye Nómina, Pagos (tu propia cuenta de Stripe), horas facturables, habilidades y certificaciones, templates de proyecto propios y la API. Los dos planes se cobran por usuario activo: {starterPrice} en Starter y {growthPrice} en Growth por usuario por mes.',
      },
      {
        q: '¿Cómo funcionan los puestos (seats)?',
        a: 'Cada persona activa en tu espacio de trabajo cuenta como un usuario, sin importar el rol, y pagás por usuario por mes ({starterPrice} en Starter, {growthPrice} en Growth), con un mínimo de {minUsers} usuarios por equipo. Si sumás o sacás gente, el total se ajusta solo — sin límite duro. La prueba gratuita (antes de elegir un plan) está limitada a {trialCap} personas, porque todavía no hay facturación configurada para cubrir a nadie por encima de eso.',
      },
      {
        q: '¿Elijo yo mismo entre Dodo Payments y Mercado Pago?',
        a: 'No — es automático, según el país de tu espacio de trabajo. Argentina factura a través de Mercado Pago en ARS; el resto de los países factura a través de Dodo Payments en USD.',
      },
      {
        q: '¿Northstack guarda el número de mi tarjeta?',
        a: 'No. El checkout ocurre en la página segura propia de Dodo Payments o Mercado Pago — Northstack nunca recibe ni guarda los datos completos de la tarjeta.',
      },
      {
        q: 'Si cancelo, ¿pierdo el acceso de inmediato?',
        a: 'No — mantenés acceso total hasta el final del período que ya pagaste. Hasta entonces queda disponible un botón "Resume subscription" (Reanudar suscripción) por si cambiás de idea.',
      },
      {
        q: '¿Puedo cambiar de plan a mitad de ciclo?',
        a: 'Sí. Subir de plan cobra en el momento el precio completo del plan nuevo y tu ciclo mensual arranca de nuevo ese día (lo que quedaba de tu plan anterior no se reintegra). Bajar de plan mantiene tu plan actual hasta tu próxima fecha de cobro y se aplica desde ahí. Durante la prueba, cambiar es inmediato y sin costo; si todavía no cargaste una tarjeta, elegir un plan te lleva directo al checkout.',
      },
    ],
  },
  {
    id: 'f-sales',
    label: 'Ventas y CRM',
    icon: <TargetIcon />,
    items: [
      {
        q: '¿Por qué no puedo poner el estado de una empresa a mano?',
        a: 'Se calcula automáticamente según cómo cierran los negocios de esa empresa (ganados o perdidos), así que siempre refleja la realidad. Igual podés renombrar, recolorear y reordenar las opciones de estado.',
      },
      {
        q: '¿Por qué crear una empresa me pide un contacto?',
        a: 'Toda empresa necesita al menos una persona a la que contactar, así que el formulario "Add Company" siempre pide un contacto fundador en el mismo paso — después podés agregar más contactos.',
      },
      {
        q: '¿Qué significa "valor ponderado" en un pipeline?',
        a: 'Es el monto de cada negocio abierto multiplicado por la probabilidad de cierre de su etapa, y después sumado — un pronóstico realista en vez del total del pipeline sin ajustar.',
      },
      {
        q: '¿Cómo decide la asignación round-robin quién recibe un negocio nuevo?',
        a: 'Rota parejo entre la lista de personas (o el departamento) que configuraste en ese pipeline, eligiendo siempre a alguien que esté activo en ese momento. Se configura por pipeline desde Configuración → Pipelines.',
      },
      {
        q: '¿Puedo usar Vistas guardadas en Oportunidades?',
        a: 'No — las Oportunidades siempre se recorren a través de las pestañas de pipeline y el tablero Kanban. Las Vistas guardadas (Cuadrícula/Lista/Kanban) son una función de Empresas y Contactos.',
      },
    ],
  },
  {
    id: 'f-hr',
    label: 'RRHH y nómina',
    icon: <BriefcaseIcon />,
    items: [
      {
        q: '¿Puedo deshacer una liquidación confirmada?',
        a: 'No — confirmar una liquidación la bloquea para siempre; después no se pueden agregar, editar ni eliminar líneas. Revisá bien las horas y los ajustes antes de confirmar.',
      },
      {
        q: '¿El PDF del recibo de pago es un documento legal?',
        a: 'No. Los recibos son documentos de seguimiento numerados, con un código QR para que cualquiera verifique que son auténticos, pero no reemplazan al recibo de sueldo que exige la ley laboral. Mientras la liquidación está en borrador, el PDF dice "Vista previa - sin emitir".',
      },
      {
        q: '¿Quién recibe un recibo y cuándo?',
        a: 'Cada persona de una liquidación recibe un recibo numerado cuando se confirma la liquidación (uno por moneda si cobra en más de una), y cada persona de un pago único, cuando se registra. Le llega por email y queda en Nómina → Mis recibos. Quien gestiona la nómina puede descargar o reenviar cualquiera desde Nómina → Recibos.',
      },
      {
        q: '¿Qué ve alguien que escanea el código QR de un recibo?',
        a: 'Una página pública que confirma que el recibo es auténtico: la empresa, el número de recibo, el nombre y la inicial del apellido de la persona, el período y la fecha de pago. Nunca se muestran montos.',
      },
      {
        q: '¿Cómo pongo el logo y los datos de la empresa en los recibos?',
        a: 'Andá a Configuración → Datos de la empresa, completá razón social, dirección, teléfono y sitio web, y subí un logo PNG o JPG (hasta 2 MB). Los recibos, contratos y emails de invitación nuevos los toman solos. Los contratos generados antes mantienen el encabezado con el que se crearon.',
      },
      {
        q: '¿Nómina realmente le paga a la gente, o mueve dinero?',
        a: 'No — es una herramienta de registro, no un procesador de pagos. Desde Northstack no se hace ninguna transferencia; vos seguís pagándole a la gente a través de tu propio banco o proveedor de pagos, y acá solo lo registrás.',
      },
      {
        q: '¿Qué pasa con el saldo de ausencias de alguien si le cambio la política?',
        a: 'Sus solicitudes pasadas quedan intactas — los saldos se calculan en el momento a partir de las asignaciones actuales y las solicitudes aprobadas, así que un cambio de política solo afecta lo que pasa de ahí en adelante.',
      },
      {
        q: '¿Qué pasa automáticamente cuando doy de baja a un empleado?',
        a: 'Su estado pasa a Dado de baja, su compensación se cierra para que deje de aparecer en las próximas liquidaciones, sus ausencias pendientes se cancelan, y las personas que le reportan directamente se reasignan a un manager que elegís vos. El acceso a la app solo se revoca si marcás esa opción.',
      },
      {
        q: 'Una persona recién contratada no aparece en mi liquidación — ¿por qué?',
        a: 'Es probable que su primer contrato de pago todavía no esté confirmado — fijate si tiene un chip "Contrato: pendiente" en su perfil, que pasa a "Vencido" después de 3 días.',
      },
    ],
  },
  {
    id: 'f-projects',
    label: 'Proyectos',
    icon: <FolderIcon />,
    items: [
      {
        q: '¿Qué diferencia hay entre un proyecto en blanco y uno desde un template?',
        a: 'Un proyecto en blanco empieza sin fases ni tareas. Un template copia al proyecto nuevo un conjunto listo de fases y tareas (con fechas contadas desde tu fecha de inicio y un rol sugerido para cada tarea). Después el proyecto es tuyo para cambiarlo: nunca vuelve a leer el template.',
      },
      {
        q: '¿A quién se le asigna cada tarea cuando creo un proyecto desde un template?',
        a: 'A la persona del equipo que elegiste para el rol de esa tarea. Si el rol queda sin asignar, o esa persona no tiene acceso a Northstack, la tarea queda a cargo del responsable del proyecto. La vista previa del paso 2 muestra el responsable de cada tarea antes de crear el proyecto.',
      },
      {
        q: '¿Quién puede ver un proyecto?',
        a: 'Su responsable y los miembros del equipo, siempre. Quien tenga en su rol "Ver todos los proyectos" ve todos; "Gestionar proyectos" además le deja crear proyectos y editar cualquiera.',
      },
      {
        q: '¿Cuántos proyectos puedo tener?',
        a: 'Starter permite 5 proyectos abiertos a la vez (en planificación, activos o en pausa). Los completados, cancelados y archivados no cuentan. Growth no tiene límite.',
      },
      {
        q: '¿Puedo crear mis propios templates?',
        a: 'Sí, en Growth: abrí un proyecto y usá "Guardar como template". Se copian las fases y tareas, las fechas pasan a días desde el inicio y cada responsable pasa a su rol en el equipo. Lo vas a encontrar en "Mis templates" la próxima vez que crees un proyecto.',
      },
      {
        q: '¿Puedo borrar un proyecto?',
        a: 'Los proyectos se archivan en vez de borrarse, así se conservan sus tareas, notas e historial. Un proyecto archivado deja de contar para tu plan y se puede restaurar desde el filtro Archivados.',
      },
      {
        q: '¿Cómo hablo con alguien sobre una tarea?',
        a: 'Abrí la tarea y escribí en su conversación, abajo. Con @ mencionás a cualquier persona de la empresa con acceso a Northstack, esté o no en el proyecto; le llega una notificación que abre la tarea.',
      },
      {
        q: '¿Las tareas de un proyecto aparecen en Mis tareas y en Google Calendar?',
        a: 'Sí. Una tarea de proyecto es una tarea común: aparece en Mis tareas, en el calendario del Resumen y en el Google Calendar de la persona asignada, si lo conectó.',
      },
    ],
  },
  {
    id: 'f-shifts',
    label: 'Turnos',
    icon: <ClockIcon />,
    items: [
      {
        q: '¿Cómo se enteran las personas de sus turnos?',
        a: 'Al publicar, cada persona recibe una notificación y un email con botones para aceptar o avisar que no puede (sin iniciar sesión), más un archivo que agrega el turno a su calendario. Si conectó Google Calendar, el turno aparece ahí solo.',
      },
      {
        q: '¿Los borradores le llegan a alguien?',
        a: 'No. Un turno nuevo es un borrador (punteado en el cronograma) hasta que lo publicás. Recién ahí se les avisa y se les pide que confirmen.',
      },
      {
        q: '¿Qué pasa si cambio un turno ya publicado?',
        a: 'Si cambiás la fecha, la hora o la locación, se le pide a cada persona del turno que lo confirme de nuevo, y se mueve el evento de su calendario. Si solo cambiás las indicaciones, el puesto o la cantidad de personas, solo se les avisa.',
      },
      {
        q: '¿Alguien sin usuario de Northstack puede recibir turnos?',
        a: 'No. Los turnos van a personas con acceso a Northstack, así los ven en Mis turnos y pueden responder desde la app o desde el email.',
      },
      {
        q: '¿Por qué no puedo asignar a alguien?',
        a: 'Porque ya tiene otro turno en ese horario. Las ausencias aprobadas, los feriados, la disponibilidad y el descanso mínimo solo muestran un aviso: podés asignarlo igual.',
      },
      {
        q: '¿Cuántas locaciones puedo tener?',
        a: 'Starter permite 1 locación activa; Growth no tiene límite. Una locación con turnos no se puede eliminar, pero sí desactivar, y conserva su historial.',
      },
      {
        q: '¿Quién aprueba mi timesheet?',
        a: 'Tu manager directo, o quien tenga un rol que pueda aprobar timesheets. Una vez aprobada, la semana queda cerrada: para corregirla, pedí un ajuste desde tu timesheet o que te la reabran.',
      },
      {
        q: '¿Las horas sugeridas se cargan solas?',
        a: 'No. Los turnos, las tareas completadas, las reuniones y los eventos de Google Calendar aparecen como sugerencias. Revisás el tiempo y las agregás; no se carga nada hasta que lo hagas.',
      },
      {
        q: '¿Por qué un turno todavía no aparece en mi timesheet?',
        a: 'Los turnos se sugieren cuando terminan, y solo si los aceptaste. Los que vienen y los sin confirmar se cuentan en Turnos → Reportes como horas planificadas.',
      },
      {
        q: '¿Quién puede ver el costo del cronograma?',
        a: 'Solo quienes tienen acceso a Payroll, y solo si la empresa activó "Mostrar el costo del cronograma" en Configuración → Turnos (Growth). Usa la tarifa por hora de cada persona en Payroll; los sueldos fijos se muestran como horas sin tarifa.',
      },
      {
        q: 'Si cedo un turno, ¿sigue siendo mío hasta que alguien lo tome?',
        a: 'Sí. Lo tenés vos hasta que un compañero lo toma y, si tu empresa lo pide, lo aprueba quien arma turnos. Si nadie lo toma antes de que empiece, el pedido vence y el turno sigue siendo tuyo.',
      },
      {
        q: '¿Qué pasa si alguien ficha sin tener turno?',
        a: 'Se puede: Northstack agrega un turno de tiempo extra en esa locación al cronograma (borde ámbar) y le avisa a quien arma turnos, que lo revisa en Turnos → Hoy.',
      },
      {
        q: '¿El QR para fichar cambia?',
        a: 'No, cada locación tiene un QR fijo. Si se copió o se compartió, regeneralo en Configuración → Turnos → Fichaje e imprimí el nuevo; el anterior deja de funcionar.',
      },
      {
        q: '¿Qué ve el cliente en el informe de horas?',
        a: 'Solo las semanas aprobadas de su empresa en ese mes: fecha, detalle, horas y si cada línea es facturable, más los totales. Los nombres son opcionales. El link no pide login y vence a los 30 días.',
      },
      {
        q: '¿El cronograma sugerido publica turnos?',
        a: 'Nunca. Solo completa turnos en borrador con lugares libres, y solo con lo que dejes tildado. Nadie se entera hasta que publiques la semana.',
      },
      {
        q: '¿Puedo dejar de recibir algunos emails?',
        a: 'Sí. En Configuración → Perfil → Notificaciones por email, apagá los que no quieras. La campana sigue mostrando todo, y los emails de la cuenta siempre llegan.',
      },
    ],
  },
  {
    id: 'f-data',
    label: 'Datos y seguridad',
    icon: <LockIcon />,
    items: [
      {
        q: '¿Mis datos son visibles para otras empresas que usan Northstack?',
        a: 'No. Los datos de cada espacio de trabajo — registros, campos personalizados, configuración — están totalmente aislados y nunca se comparten entre espacios de trabajo.',
      },
      {
        q: '¿Los envíos de un formulario público necesitan aprobación antes de aparecer?',
        a: 'No — un envío crea un registro real de inmediato, sin ninguna cola de revisión en el medio. Si querés evaluar a las personas antes de tratarlas como activas, usá un campo de estado como tu propio paso de "en revisión".',
      },
      {
        q: '¿Qué módulos permiten importar y exportar CSV?',
        a: 'Por ahora, Personas (Empleados), Empresas y Contactos. Oportunidades todavía no tiene soporte de CSV.',
      },
      {
        q: 'Todo lo que aparece en la pestaña de Actividad de un registro — ¿hasta cuándo llega hacia atrás?',
        a: '7 días en Starter, 30 días en Growth — las entradas más viejas que esa ventana se eliminan automáticamente.',
      },
    ],
  },
  {
    id: 'f-integrations',
    label: 'Integraciones y API',
    icon: <PlugIcon />,
    items: [
      {
        q: '¿El módulo de Pagos es lo mismo que mi suscripción a Northstack?',
        a: 'No, no tienen relación. Tu suscripción a Northstack se factura a través de Dodo Payments o Mercado Pago (ver Facturación y planes). Pagos es un complemento del plan Growth donde conectás tu propia cuenta de Stripe para seguir los pagos de tus clientes y enviarles facturas.',
      },
      {
        q: '¿La sincronización con Google Calendar funciona en los dos sentidos?',
        a: 'Sí — editar o eliminar una tarea o un evento de ausencia sincronizado desde el lado de Google también lo actualiza en Northstack.',
      },
      {
        q: '¿Cómo agrego un link de Google Meet a una tarea?',
        a: 'Marcá "Add Google Meet video call" al crear o editar una tarea — antes necesitás tener Google Calendar conectado. Northstack completa un horario si todavía no pusiste uno, genera el link de Meet en tu calendario, y automáticamente invita al Contacto, al Contacto principal de la Empresa/Oportunidad, o al Empleado sobre quien trata la tarea.',
      },
      {
        q: '¿Dónde veo todas las tareas asignadas a mí, en todos mis registros?',
        a: 'En Mis tareas (en la barra lateral, debajo de Resumen) — todas las tareas que tenés asignadas o creaste, en un solo lugar, con vistas de Lista y Tablero, búsqueda, un filtro de completadas, y carpetas que podés crear para agrupar tareas relacionadas.',
      },
      {
        q: '¿Puedo configurar webhooks para sacar datos de Northstack?',
        a: 'Todavía no — hoy no hay una pantalla para configurar webhooks salientes. Mientras tanto, usá la API para consultar cambios periódicamente.',
      },
      {
        q: '¿La documentación de la API es pública?',
        a: 'No — /developers requiere estar con la sesión iniciada en Northstack. No se puede acceder sin una cuenta.',
      },
      {
        q: '¿Puedo usar Claude, ChatGPT u otro asistente de IA con Northstack?',
        a: 'Sí, en Growth. Entrá a Configuración → Integraciones → Asistentes de IA, copiá la URL del servidor y agregala como conector en tu asistente; te abre Northstack para que inicies sesión y apruebes — sin claves que copiar. Actúa como vos — solo puede ver y hacer lo que tu rol permite — y te pide confirmación antes de borrar algo o avisarle a otras personas (publicar turnos, invitaciones, reportes a clientes). La nómina, las bajas y la configuración se quedan en la app.',
      },
      {
        q: '¿Un asistente de IA puede ver más que yo?',
        a: 'No. Usa tu propio rol en cada pedido: los mismos empleados, los mismos campos ocultos, los mismos módulos. Si tu rol cambia, el asistente cambia con él. El owner puede apagar los asistentes de IA por rol en Roles y permisos.',
      },
      {
        q: '¿Qué plan incluye la API?',
        a: 'Growth (y la prueba gratuita). En Starter, las claves de API y los webhooks no aparecen; las claves que ya existían dejan de funcionar hasta que hagas upgrade, pero no se borran.',
      },
      {
        q: 'Perdí mi clave de API — ¿puedo volver a verla?',
        a: 'No — la clave completa se muestra una sola vez, al crearla. Si la perdiste, revocala y creá una nueva.',
      },
    ],
  },
];

const TOTAL_QUESTIONS = FAQ_CATEGORIES.reduce((sum, cat) => sum + cat.items.length, 0);
const NAV_IDS = [...FAQ_CATEGORIES.map((c) => c.id), 'f-contact', 'f-legal'];

function fillPricingTokens(categories: typeof FAQ_CATEGORIES, pricing: PlanPricing | null): typeof FAQ_CATEGORIES {
  const values: Record<string, string> = {
    starterPrice: perUserPriceLabel(pricing, 'international', 'starter'),
    growthPrice: perUserPriceLabel(pricing, 'international', 'growth'),
    minUsers: String(pricing?.minUsers ?? '—'),
    trialCap: String(pricing?.freeTrialSeatCap ?? '—'),
  };
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);
  return categories.map((cat) => ({ ...cat, items: cat.items.map((item) => ({ ...item, a: fill(item.a) })) }));
}

export default function HelpPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | 'refund' | null>(null);
  const activeId = useScrollSpy(NAV_IDS);

  // Same ids/order as the English array (see NAV_IDS/TOTAL_QUESTIONS above, which stay derived
  // from FAQ_CATEGORIES directly since both language arrays share that shape) — only the display
  // text differs.
  const isSpanish = i18n.language.startsWith('es');
  // Price/seat tokens in the answers ({seatPrice}, {starterSeats}, ...) are filled from the
  // backend's src/config/pricing.ts — no number is typed into the copy itself.
  const pricing = usePlanPricing();
  const categories = useMemo(
    () => fillPricingTokens(isSpanish ? FAQ_CATEGORIES_ES : FAQ_CATEGORIES, pricing),
    [isSpanish, pricing],
  );

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => `${item.q} ${item.a}`.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0);
  }, [query, categories]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="page-full">
      <div className="page-toolbar">
        <h2>{isSpanish ? 'Ayuda y preguntas frecuentes' : 'Help & FAQ'}</h2>
      </div>
      <p className="help-lede">
        {isSpanish
          ? 'Respuestas rápidas a las preguntas más frecuentes, agrupadas por tema — buscá, o navegá una categoría a la izquierda.'
          : 'Quick answers to the questions that come up most, grouped by topic — search, or browse a category on the left.'}
      </p>
      <p className="help-crosslink">
        {isSpanish ? '¿Buscás una guía completa en cambio?' : 'Looking for a full walkthrough instead?'}{' '}
        <a href="/guide" onClick={(e) => { e.preventDefault(); navigate('/guide'); }}>
          {isSpanish ? 'Ir a la Guía del usuario →' : 'Go to the User Guide →'}
        </a>
      </p>

      <div className="help-shell">
        <nav className="help-nav">
          <div className="help-nav-group">
            {categories.map((cat) => (
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
              {isSpanish ? 'Contactanos' : 'Contact us'}
            </a>
            <a
              className={`help-nav-link${activeId === 'f-legal' ? ' active' : ''}`}
              href="#f-legal"
              onClick={(e) => { e.preventDefault(); scrollTo('f-legal'); }}
            >
              <FormIcon />
              Legal
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
              placeholder={
                isSpanish
                  ? 'Buscar en las preguntas frecuentes… ej. "prueba", "recibo de sueldo", "webhook"'
                  : 'Search the FAQ… e.g. “trial”, “payslip”, “webhook”'
              }
              autoComplete="off"
            />
          </div>

          {filteredCategories.length === 0 && (
            <p className="help-empty">{isSpanish ? 'Ninguna pregunta coincide con esa búsqueda.' : 'No questions match that search.'}</p>
          )}

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
            <h3 className="card-title">{isSpanish ? '¿Todavía necesitás ayuda?' : 'Still need help?'}</h3>
            <p className="text-sm text-brand-navy dark:text-dark-ink">
              {isSpanish ? (
                <>
                  ¿No encontrás lo que buscás? Escribinos directamente a{' '}
                  <a className="table-link" href="mailto:info@joinnorthstack.com">
                    info@joinnorthstack.com
                  </a>
                  , o usá "Enviar comentarios" desde el menú de tu cuenta para reportar un problema o compartir una idea.
                </>
              ) : (
                <>
                  Can't find what you're looking for? Reach us directly at{' '}
                  <a className="table-link" href="mailto:info@joinnorthstack.com">
                    info@joinnorthstack.com
                  </a>
                  , or use "Send feedback" from your account menu to report a bug or share an idea.
                </>
              )}
            </p>
          </div>

          <div className="card help-contact-card" id="f-legal">
            <h3 className="card-title">{i18n.language.startsWith('es') ? 'Legales' : 'Legal'}</h3>
            <p className="text-sm text-brand-navy dark:text-dark-ink mb-2">
              {isSpanish
                ? 'Te vamos a avisar acá y por correo cada vez que alguno de estos documentos cambie.'
                : "You'll be notified here and by email whenever one of these changes."}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="table-link text-sm" onClick={() => setLegalDoc('terms')}>
                {isSpanish ? 'Términos de Servicio' : 'Terms of Service'}
              </button>
              <button type="button" className="table-link text-sm" onClick={() => setLegalDoc('privacy')}>
                {isSpanish ? 'Política de Privacidad' : 'Privacy Policy'}
              </button>
              <button type="button" className="table-link text-sm" onClick={() => setLegalDoc('refund')}>
                {isSpanish ? 'Política de Reembolsos' : 'Refund Policy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-faint dark:text-dark-ink-faint">
        {TOTAL_QUESTIONS} {isSpanish ? 'preguntas' : 'questions'}
      </p>
      {legalDoc && <LegalDocumentModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
