import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { extraSeatPriceLabel, planPriceLabel, usePlanPricing } from '../lib/planPrices';
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
  { id: 'g-settings', label: 'Settings', blurb: 'Company profile, logo, currency, theme.', icon: <GearIcon /> },
  { id: 'g-billing', label: 'Billing & plans', blurb: 'Starter vs. Growth, checkout, failures.', icon: <CreditCardIcon /> },
  { id: 'g-data', label: 'Import & export', blurb: 'Bulk CSV for People, Companies, Contacts.', icon: <DownloadIcon /> },
];

// Spanish counterparts for the two nav data arrays above — same ids/order/icons, only the
// display text differs (same pattern as HelpPage.tsx's FAQ_CATEGORIES/FAQ_CATEGORIES_ES).
const NAV_GROUPS_ES: { label: string; items: { id: string; label: string; icon: JSX.Element }[] }[] = [
  {
    label: 'Empezá acá',
    items: [
      { id: 'g-start', label: 'Primeros pasos', icon: <RocketIcon /> },
      { id: 'g-roles', label: 'Roles y equipo', icon: <TeamIcon /> },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { id: 'g-crm', label: 'Empresas y contactos', icon: <BuildingIcon /> },
      { id: 'g-pipeline', label: 'Pipelines y negocios', icon: <KanbanIcon /> },
      { id: 'g-organize', label: 'Vistas, tags y campos', icon: <GridIcon /> },
    ],
  },
  {
    label: 'Personas',
    items: [
      { id: 'g-hr', label: 'Empleados y ausencias', icon: <PeopleIcon /> },
      { id: 'g-payroll', label: 'Nómina', icon: <BriefcaseIcon /> },
      { id: 'g-tasks', label: 'Tareas y notas', icon: <ListIcon /> },
    ],
  },
  {
    label: 'Conectar',
    items: [
      { id: 'g-forms', label: 'Formularios públicos', icon: <FormIcon /> },
      { id: 'g-integrations', label: 'Integraciones y API', icon: <PlugIcon /> },
    ],
  },
  {
    label: 'Espacio de trabajo',
    items: [
      { id: 'g-settings', label: 'Configuración y apariencia', icon: <GearIcon /> },
      { id: 'g-billing', label: 'Facturación y planes', icon: <CreditCardIcon /> },
      { id: 'g-data', label: 'Importar y exportar', icon: <DownloadIcon /> },
      { id: 'g-mobile', label: 'Desde el celular', icon: <DeviceIcon /> },
    ],
  },
];

const MODULE_MAP_ES: { id: string; label: string; blurb: string; icon: JSX.Element }[] = [
  { id: 'g-start', label: 'Primeros pasos', blurb: 'El alta, tu prueba de 15 días, y el onboarding.', icon: <RocketIcon /> },
  { id: 'g-roles', label: 'Roles y equipo', blurb: 'Invitá personas y armá roles personalizados.', icon: <TeamIcon /> },
  { id: 'g-crm', label: 'Empresas y contactos', blurb: 'Los registros de tu CRM y cómo se relacionan.', icon: <BuildingIcon /> },
  { id: 'g-pipeline', label: 'Pipelines y negocios', blurb: 'Etapas, pronóstico, y asignación automática.', icon: <KanbanIcon /> },
  { id: 'g-hr', label: 'Empleados y ausencias', blurb: 'Directorio, líneas de reporte, políticas de ausencias.', icon: <PeopleIcon /> },
  { id: 'g-payroll', label: 'Nómina', blurb: 'Compensación, corridas de pago, recibos de sueldo.', icon: <BriefcaseIcon /> },
  { id: 'g-tasks', label: 'Tareas y notas', blurb: 'Seguimientos sobre cualquier registro.', icon: <ListIcon /> },
  { id: 'g-forms', label: 'Formularios públicos', blurb: 'Carga sin login para reclutamiento y leads.', icon: <FormIcon /> },
  { id: 'g-integrations', label: 'Integraciones y API', blurb: 'Google Calendar, Stripe, claves de API.', icon: <PlugIcon /> },
  { id: 'g-settings', label: 'Configuración', blurb: 'Datos de la empresa, logo, moneda, tema.', icon: <GearIcon /> },
  { id: 'g-billing', label: 'Facturación y planes', blurb: 'Starter vs. Growth, checkout, fallas de pago.', icon: <CreditCardIcon /> },
  { id: 'g-data', label: 'Importar y exportar', blurb: 'CSV masivo para Personas, Empresas, Contactos.', icon: <DownloadIcon /> },
];

export default function GuidePage() {
  const navigate = useNavigate();
  const activeId = useScrollSpy(SECTION_IDS);
  // Every price/seat number below comes from the backend's src/config/pricing.ts — never type one here.
  const pricing = usePlanPricing();
  const usd = (plan: 'starter' | 'growth') => planPriceLabel(pricing, 'international', plan);
  const seatPrice = extraSeatPriceLabel(pricing, 'international');
  const included = (plan: 'starter' | 'growth') => pricing?.includedSeats[plan] ?? '—';
  const trialCap = pricing?.freeTrialSeatCap ?? '—';
  const { i18n } = useTranslation();
  const isSpanish = i18n.language.startsWith('es');

  // Same ids/order as the English arrays (see NAV_GROUPS_ES/MODULE_MAP_ES above, which share
  // shape with NAV_GROUPS/MODULE_MAP) — only the display text differs.
  const navGroups = isSpanish ? NAV_GROUPS_ES : NAV_GROUPS;
  const moduleMap = isSpanish ? MODULE_MAP_ES : MODULE_MAP;

  return (
    <div className="page-full">
      <div className="page-toolbar">
        <h2>{isSpanish ? 'Guía del usuario' : 'User Guide'}</h2>
      </div>
      {isSpanish ? (
        <p className="help-lede">
          Northstack está organizado alrededor de tus <strong>Personas</strong> (RRHH, ausencias, nómina) y tus
          datos de <strong>Ventas</strong> (empresas, contactos, negocios) — más herramientas compartidas como
          tareas, tags y campos personalizados que funcionan igual en todos lados. Esta guía recorre cada área en
          el orden en que la mayoría de los equipos la va configurando.
        </p>
      ) : (
        <p className="help-lede">
          Northstack is organized around your <strong>People</strong> (HR, time off, payroll) and your{' '}
          <strong>Sales</strong> data (companies, contacts, deals) — plus shared tools like tasks, tags, and custom
          fields that work the same way everywhere. This guide walks through each area in the order most teams set
          them up.
        </p>
      )}
      <p className="help-crosslink">
        {isSpanish ? '¿Buscás una respuesta rápida en cambio?' : 'Looking for a quick answer instead?'}{' '}
        <a href="/help" onClick={(e) => { e.preventDefault(); navigate('/help'); }}>
          {isSpanish ? 'Ir a Ayuda y preguntas frecuentes →' : 'Go to Help & FAQ →'}
        </a>
      </p>

      <div className="help-shell">
        <nav className="help-nav">
          {navGroups.map((group) => (
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
            {moduleMap.map((m) => (
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
          {isSpanish ? (
          <section className="help-section" id="g-start">
            <div className="help-eyebrow">
              <RocketIcon />
              Empezá acá
            </div>
            <h2>Primeros pasos</h2>
            <p className="help-intro">Cómo nace un espacio de trabajo nuevo, y cómo son los primeros 15 días.</p>

            <div className="help-sub">
              <h3>Creando tu espacio de trabajo</h3>
              <p>El alta es un flujo corto y verificado — nadie puede crear un espacio de trabajo con un email que no controla:</p>
              <ol className="help-steps">
                <li>
                  <strong>Ingresá tu email laboral</strong> en la página de alta. Si el dominio de email de tu
                  empresa ya tiene un espacio de trabajo activo en Northstack, te vamos a pedir que consigas una
                  invitación de ese equipo en vez de dejarte crear uno nuevo.
                </li>
                <li>
                  <strong>Revisá tu bandeja de entrada</strong> para encontrar un link de verificación — es válido
                  por 24 horas. ¿No te llegó? Usá "Resend" (Reenviar) (disponible cada 30 segundos) o empezá de
                  nuevo con otra dirección.
                </li>
                <li>
                  <strong>Contanos sobre tu empresa</strong> — nombre, industria, tamaño y país. El país importa: es
                  lo que decide si vas a pagar en USD o en pesos argentinos más adelante.
                </li>
                <li>
                  <strong>Contanos sobre vos</strong> — nombre y teléfono, más un "¿cómo te enteraste de nosotros?"
                  opcional.
                </li>
                <li>
                  <strong>Elegí una contraseña</strong> y aceptá los Términos de Servicio y la Política de
                  Privacidad. No se guarda nada hasta este último paso.
                </li>
              </ol>
              <p>
                Desde ahí caés directo en tu página de <strong>Resumen</strong> — sin una página aparte de "primeros
                pasos" para recorrer antes.
              </p>
            </div>

            <div className="help-sub">
              <h3>Tu prueba gratuita de 15 días</h3>
              <p>
                Todo espacio de trabajo nuevo arranca con una prueba de 15 días con acceso completo — no hace falta
                elegir un plan ni cargar una tarjeta para explorar el producto. Un selector de planes que podés
                cerrar aparece una vez sobre Resumen por si querés suscribirte antes, pero nunca te bloquea el
                trabajo.
              </p>
              <div className="help-table-wrap">
                <table className="help-ref">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Estado</th>
                      <th>Qué significa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1 – 15</td>
                      <td>En prueba</td>
                      <td>Acceso completo, a nivel Growth, hayas elegido un plan o no.</td>
                    </tr>
                    <tr>
                      <td>16 – 29</td>
                      <td>Pago pendiente</td>
                      <td>Un banner te pide que agregues un método de pago. Todavía no hay ninguna restricción.</td>
                    </tr>
                    <tr>
                      <td>30+</td>
                      <td>Solo lectura</td>
                      <td>Ver sigue funcionando en todos lados; crear, editar y eliminar queda bloqueado hasta que haya un plan activo.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>Agregar un método de pago en cualquier momento — incluso en medio de la prueba — arranca tu suscripción de inmediato y cancela la cuenta regresiva.</p>
            </div>

            <div className="help-sub">
              <h3>La checklist de onboarding</h3>
              <p>
                Los espacios de trabajo nuevos ven una checklist corta arriba de Resumen: agregar tu primer
                empleado, invitar a alguien del equipo, y configurar una política de ausencias — cada ítem te lleva
                directo a la página correspondiente. ¿Todavía no querés cargar datos reales? <strong>Load sample
                data</strong> (Cargar datos de ejemplo) completa tu espacio de trabajo con empleados y empresas de
                ejemplo para que puedas explorar sin riesgo primero.
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== Roles & team ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-roles">
            <div className="help-eyebrow">
              <TeamIcon />
              Personas
            </div>
            <h2>Roles y equipo</h2>
            <p className="help-intro">Todo espacio de trabajo tiene exactamente un Owner, y la cantidad de otros roles que vos mismo diseñes.</p>

            <div className="help-sub">
              <h3>Invitando a alguien del equipo</h3>
              <ol className="help-steps">
                <li>
                  Andá a <strong>Configuración → Usuarios</strong> y hacé clic en <strong>Invite</strong> (Invitar).
                </li>
                <li>Ingresá su email y elegí un rol de la lista de roles asignables de tu espacio de trabajo.</li>
                <li>
                  Recibe una invitación por email; al abrirla puede elegir una contraseña y entrar directo — sin un
                  paso aparte de verificación de email, porque alguien que vos invitaste ya es de confianza.
                </li>
              </ol>
              <p>
                También podés invitar a alguien directamente desde un registro de <strong>Empleado</strong> ya
                existente — abrí su perfil, usá el menú "…" y elegí <strong>Invite to app</strong> (Invitar a la
                app). Esto vincula su login nuevo a su registro de RRHH existente en vez de crear una persona
                duplicada.
              </p>
            </div>

            <div className="help-sub">
              <h3>Entendiendo los roles</h3>
              <p>Todo espacio de trabajo arranca con tres roles, pero solo uno de ellos es fijo:</p>
              <dl className="help-fieldgrid">
                <div className="help-fielddef">
                  <dt>Owner</dt>
                  <dd>
                    Uno por espacio de trabajo. Siempre tiene acceso total a todo; no se puede limitar, renombrar ni
                    eliminar. Solo el Owner puede transferir la titularidad o acceder a facturación y a Roles y
                    permisos.
                  </dd>
                </div>
                <div className="help-fielddef">
                  <dt>Admin</dt>
                  <dd>Un rol de partida con acceso amplio. Totalmente editable — renombralo, cambiá lo que puede hacer, o eliminalo como a cualquier otro rol.</dd>
                </div>
                <div className="help-fielddef">
                  <dt>Member</dt>
                  <dd>Un rol de partida con acceso liviano. Igual que Admin — es una sugerencia, no un nivel fijo.</dd>
                </div>
              </dl>
              <p>
                Más allá de esos dos puntos de partida, el Owner puede crear tantos <strong>roles
                personalizados</strong> como permita el plan (ver la tabla de límites por plan en Facturación y
                planes) — un "Field Sales Rep" que solo ve su propio pipeline, un "Payroll Clerk" que puede correr
                la nómina pero no tocar Roles y permisos, y así.
              </p>
            </div>

            <div className="help-sub">
              <h3>Armando un rol personalizado</h3>
              <ol className="help-steps">
                <li>
                  Abrí <strong>Configuración → Roles y permisos</strong> (solo Owner) y hacé clic en{' '}
                  <strong>New role</strong> (Nuevo rol).
                </li>
                <li>Opcionalmente, partí de una copia de un rol existente en vez de uno en blanco.</li>
                <li>
                  Activá o desactivá permisos en la grilla — agrupados en People, Sales, Configuration, Team, Money,
                  Reporting, Workspace y Time off. Algunos permisos dependen de otros (por ejemplo, gestionar
                  oportunidades requiere primero poder ver empresas y contactos) — la pantalla te avisa qué te falta
                  si tratás de saltear un paso.
                </li>
                <li>Guardá. Cualquiera con ese rol ve el cambio la próxima vez que cargue la app.</li>
              </ol>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  Las <strong>restricciones a nivel de campo</strong> van más allá del acceso a módulos: en los
                  registros de Empleado, Empresa, Contacto y Oportunidad, se pueden ocultar campos específicos por
                  rol — el ejemplo típico es ocultar el sueldo a un rol que no debería ver la compensación. El
                  nombre de un registro siempre queda visible.
                </p>
              </div>
              <div className="help-callout help-callout-warn">
                <AlertTriangleIcon />
                <p>
                  Hoy los roles controlan <em>qué módulos y acciones</em> puede usar alguien — todavía no{' '}
                  <em>qué registros</em>. No hay una forma integrada de limitar un rol a "solo sus propios negocios"
                  o "solo los empleados de su departamento". Cualquiera con acceso de vista a un módulo ve todos los
                  registros que tiene.
                </p>
              </div>
            </div>

            <div className="help-sub">
              <h3>Eliminar un rol y transferir la titularidad</h3>
              <p>
                Un rol no se puede eliminar mientras alguien lo tenga asignado — primero pasalos a otro rol, desde{' '}
                <strong>Configuración → Usuarios</strong>. Para entregar el espacio de trabajo en sí, el Owner
                actual elige <strong>Owner (transfer ownership)</strong> junto al nombre de la persona; es una
                acción deliberada y confirmada que además degrada al Owner saliente a Admin.
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== CRM ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-crm">
            <div className="help-eyebrow">
              <BuildingIcon />
              Ventas
            </div>
            <h2>Empresas y contactos</h2>
            <p className="help-intro">Los dos registros centrales de tu CRM — las organizaciones a las que les vendés, y las personas que están dentro de ellas.</p>

            <div className="help-sub">
              <h3>Empresas</h3>
              <p>
                Una Empresa registra nombre, industria, sitio web, teléfono, dirección de facturación, tamaño (de
                una lista que gestiona tu equipo), un dueño de cuenta, y un estado de ciclo de vida.
              </p>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  No podés crear una Empresa sola — el formulario "Add Company" (Agregar empresa) siempre pide un
                  contacto fundador (nombre y email) al mismo tiempo, así que ninguna empresa existe nunca sin al
                  menos una persona a la que contactar.
                </p>
              </div>
              <p>
                El <strong>estado de una Empresa es automático</strong>, y depende de cómo cierran sus negocios
                (ganados o perdidos) — nadie lo fija arrastrando ni eligiéndolo de un menú desplegable. Los Admins
                igual pueden renombrar, recolorear y reordenar la lista de estados posibles.
              </p>
              <p>
                <strong>Jerarquía de empresas:</strong> vinculá una empresa como padre de otra desde su panel de
                detalle; el perfil de la empresa hija lista a sus hermanas, y el selector no te deja crear un loop.
                Eliminar una empresa con hijas solo las desvincula, a menos que elijas eliminar toda la rama.
              </p>
            </div>

            <div className="help-sub">
              <h3>Contactos</h3>
              <p>
                Un Contacto es una persona — nombre, email, teléfono, puesto, un vínculo opcional a una Empresa (un
                contacto puede existir como lead sin vincular), un Estado del lead (Nuevo, Contactado, Calificado,
                Descalificado), y un Origen del lead de la lista propia de tu equipo.
              </p>
              <p>
                Una vez vinculado a una Empresa, un contacto puede marcarse como el contacto{' '}
                <strong>principal</strong> de esa empresa, y su perfil lista a todas las demás personas de la misma
                empresa para navegar rápido entre ellas.
              </p>
            </div>

            <div className="help-sub">
              <h3>Eliminar una Empresa o un Contacto</h3>
              <p>
                Como los negocios no pueden existir sin una empresa, eliminar una te pide que confirmes qué pasa con
                las Oportunidades vinculadas. Eliminar un Contacto simplemente lo desvincula de todos los lugares
                donde estaba referenciado.
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== Pipelines ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-pipeline">
            <div className="help-eyebrow">
              <KanbanIcon />
              Ventas
            </div>
            <h2>Pipelines y negocios</h2>
            <p className="help-intro">Las Oportunidades avanzan a través de pipelines que vos diseñás — con pronóstico y asignación automática incluidos.</p>

            <div className="help-sub">
              <h3>Configurando un pipeline</h3>
              <p>
                Creá pipelines desde <strong>Configuración → Pipelines</strong>. Cada uno es de uno de estos dos tipos:
              </p>
              <ul>
                <li><strong>Pipeline de leads</strong> — empresa opcional, para prospectos sin calificar.</li>
                <li><strong>Pipeline de cuenta</strong> — para negocios contra una empresa que ya identificaste.</li>
              </ul>
              <p>
                Este tipo no se puede cambiar después de crearlo. Cada pipeline tiene sus propias{' '}
                <strong>etapas</strong> ordenadas, y cada etapa tiene un nombre, un color, un resultado (Abierta /
                Ganada / Perdida), y — para las etapas Abiertas — una probabilidad de cierre que se usa para el
                pronóstico. Arrastrá las etapas para reordenarlas, o archivá un pipeline que ya no uses (su
                historial queda intacto y en solo lectura).
              </p>
            </div>

            <div className="help-sub">
              <h3>Trabajando un negocio</h3>
              <p>
                Arrastrá una tarjeta entre las columnas de etapas en el tablero Kanban, o cambiá la{' '}
                <strong>Etapa</strong> desde el menú desplegable en el panel propio del negocio. Cada Oportunidad
                registra monto, moneda, fecha estimada de cierre, una nota de "próximo paso" con su propia fecha, y
                puede vincular varios Contactos, cada uno con un rol de texto libre como "Decision maker" (quien
                decide).
              </p>
              <p>
                La barra de herramientas arriba de cada pipeline muestra un <strong>valor ponderado</strong> — la
                suma del monto de cada negocio abierto × la probabilidad de cierre de su etapa — una lectura rápida
                de cuánto de tu pipeline es realista que cierre.
              </p>
            </div>

            <div className="help-sub">
              <h3>Cerrando un negocio</h3>
              <p>
                Mover una tarjeta a una etapa <strong>Ganada</strong> pide un motivo de ganancia; moverla a{' '}
                <strong>Perdida</strong> pide un motivo de pérdida de la lista de tu equipo — ambos aceptan una nota
                opcional. Ganar un negocio en un pipeline de leads ofrece llevarlo a un pipeline de cuenta para que
                puedas seguir siguiendo la relación.
              </p>
            </div>

            <div className="help-sub">
              <h3>Asignación automática de dueños</h3>
              <p>Cada pipeline puede asignar automáticamente el dueño de un negocio nuevo, configurado desde la configuración del pipeline:</p>
              <div className="help-table-wrap">
                <table className="help-ref">
                  <thead>
                    <tr>
                      <th>Modo</th>
                      <th>Qué pasa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Apagado</td><td>Elegís un dueño a mano cada vez.</td></tr>
                    <tr><td>Round robin — por usuario</td><td>Rota parejo entre una lista de personas que elegís.</td></tr>
                    <tr><td>Round robin — por departamento</td><td>La misma rotación, armada con todos los que están actualmente en un departamento — una carga única, no una sincronización en vivo, así que agregá a las nuevas contrataciones de nuevo más adelante.</td></tr>
                    <tr><td>Dueño de cuenta</td><td>Solo en pipelines de cuenta — usa el Dueño de cuenta de la empresa, y si no hay ninguno configurado, recurre al round robin.</td></tr>
                  </tbody>
                </table>
              </div>
              <p>
                Solo se eligen personas activas del equipo. Un negocio que te asignan así no manda su propia
                notificación — te vas a enterar la próxima vez que cambie de etapa o se quede estancado.
              </p>
            </div>

            <div className="help-sub">
              <h3>Notificaciones y negocios estancados</h3>
              <p>
                Cada etapa tiene su propio interruptor para notificar al dueño cuando un negocio entra en ella (útil
                para silenciar una primera etapa ruidosa), y cada pipeline puede marcar un negocio como "estancado"
                después de una cantidad de días sin cambiar de etapa. Ambas cosas aparecen en el ícono de la
                campana arriba de la app — nunca por un movimiento que hiciste vos mismo.
              </p>
              <p>
                La campana también tiene una sección de "Novedades" para actualizaciones de toda la plataforma —
                funciones nuevas y cambios a nuestros Términos de Servicio, Política de Privacidad, o Política de
                Reembolsos (que también llegan por email). Podés revisar los Términos, la Privacidad, y la Política
                de Reembolsos vigentes en cualquier momento desde Ayuda y preguntas frecuentes.
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== Organize ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-organize">
            <div className="help-eyebrow">
              <GridIcon />
              Herramientas compartidas
            </div>
            <h2>Vistas, tags y campos personalizados</h2>
            <p className="help-intro">Las mismas herramientas de organización funcionan igual en Empresas, Contactos y Empleados.</p>

            <div className="help-sub">
              <h3>Vistas</h3>
              <p>
                Una Vista agrupa un formato (Cuadrícula, Lista, o Kanban), un filtro, un orden, y — para
                Kanban/Lista — un campo de "agrupar por" en una pestaña guardada arriba de la tabla. Dejá una vista{' '}
                <strong>personal</strong>, o hacela <strong>compartida</strong> para todo el equipo (crear una vista
                compartida necesita un permiso de nivel admin). Oportunidades es el único módulo que se salta este
                sistema — siempre se recorre por las pestañas de pipeline y su tablero Kanban en cambio.
              </p>
            </div>

            <div className="help-sub">
              <h3>Filtros y columnas</h3>
              <p>
                El botón de Filtro apila cualquier cantidad de reglas de campo + condición + valor. Las columnas se
                pueden mostrar u ocultar, redimensionar, reordenar arrastrándolas, y ordenar haciendo clic en su
                encabezado — cada tabla recuerda su propio formato por vista guardada.
              </p>
            </div>

            <div className="help-sub">
              <h3>Tags</h3>
              <p>
                Etiquetas de texto libre compartidas entre Empresas, Contactos y Empleados — empezá a escribir para
                reusar un tag existente o crear uno nuevo al toque. Cada lista tiene una opción de "filtrar por tag"
                en su barra de herramientas.
              </p>
            </div>

            <div className="help-sub">
              <h3>Campos personalizados</h3>
              <ol className="help-steps">
                <li>En cualquier tabla (Empleados, Empresas, Contactos, u Oportunidades), hacé clic en el <strong>+</strong> al final de los encabezados de columna.</li>
                <li>Nombrá el campo y elegí un tipo: Texto, Número, Fecha, Email, o un desplegable de Selección con tus propias opciones.</li>
                <li>Decidí si es obligatorio, y guardá — ahora es una columna real, y aparece automáticamente en la plantilla CSV de ese módulo.</li>
              </ol>
              <p>
                Usá el menú "…" en el encabezado de columna de cualquier campo personalizado para renombrarlo,
                editar sus opciones, desactivarlo (lo oculta sin perder las respuestas anteriores), o simplemente
                ocultarlo solo para vos.
              </p>
            </div>

            <div className="help-sub">
              <h3>Estados y catálogos</h3>
              <p>
                El menú "…" en una columna de Estado abre un administrador para las opciones de estado de ese
                módulo — agregar, recolorear, reordenar, y definir un valor por defecto. El mismo patrón administra
                tus catálogos compartidos: <strong>Departamento</strong>, <strong>Puesto</strong>,{' '}
                <strong>Origen del lead</strong>, <strong>Motivo de pérdida</strong>,{' '}
                <strong>Motivo de ganancia</strong>, y <strong>Tamaño de empresa</strong> — donde sea que ese campo
                aparezca en la app.
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== HR ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-hr">
            <div className="help-eyebrow">
              <PeopleIcon />
              Personas
            </div>
            <h2>Empleados y ausencias</h2>
            <p className="help-intro">El roster de tu equipo, las líneas de reporte, y cómo se piden y aprueban las ausencias.</p>

            <div className="help-sub">
              <h3>El directorio de Personas</h3>
              <p>Toda persona registrada en RRHH tiene un <strong>Person Type</strong> (Tipo de persona) que decide qué más aplica:</p>
              <dl className="help-fieldgrid">
                <div className="help-fielddef">
                  <dt>Profile</dt>
                  <dd>Alguien que estás registrando sin contrato de pago — nunca aparece en Nómina.</dd>
                </div>
                <div className="help-fielddef">
                  <dt>Contractor / Employee</dt>
                  <dd>Necesita un contrato de pago inicial (tarifa, moneda, frecuencia) completado en el mismo formulario "Add Person" (Agregar persona) antes de guardar.</dd>
                </div>
              </dl>
              <p>
                Otros campos incluyen departamento y puesto (de tus catálogos), manager directo, fechas de
                inicio/fin, tipo de contrato, nacionalidad, país de residencia, un cumpleaños opcional, un link al
                contrato, un email personal además del laboral, más cualquier campo personalizado y tag que tu
                equipo haya agregado.
              </p>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  Asignar "Reports To" (Reporta a) se revisa para evitar loops — no podés poner a alguien como el
                  manager de su propio manager. Y un Contractor o Employee recién creado queda afuera de las
                  corridas de nómina y de los saldos de ausencias hasta que se confirme su primer contrato de pago
                  (se muestra como un chip "Contrato: pendiente", que pasa a "Vencido" después de 3 días).
                </p>
              </div>
            </div>

            <div className="help-sub">
              <h3>Darle un login a alguien</h3>
              <p>
                Desde el perfil de una persona, abrí el menú "…" y elegí <strong>Invite to app</strong> (Invitar a
                la app) (solo aparece si todavía no tiene uno). Elegí un rol, y sale una invitación por email — el
                link también se copia a tu portapapeles por si preferís mandarlo vos mismo.
              </p>
            </div>

            <div className="help-sub">
              <h3>Políticas de ausencias</h3>
              <p>
                Se arman en <strong>RRHH → Ausencias → Políticas</strong>: un nombre, días por año, si es paga, si
                las solicitudes necesitan aprobación, y cómo se acumulan los días —
              </p>
              <ul>
                <li><strong>Anual fija</strong> — todo el monto está disponible de entrada.</li>
                <li><strong>Mensual</strong> — los días se acumulan progresivamente al empezar cada mes, con un tope de 12 meses.</li>
              </ul>
              <p>
                Asigná una política a personas de a una o en bloque desde la pestaña <strong>Asignaciones</strong>,
                o justo después de crear una política nueva.
              </p>
            </div>

            <div className="help-sub">
              <h3>Solicitar y aprobar ausencias</h3>
              <ol className="help-steps">
                <li>Desde <strong>Mis solicitudes</strong>, elegí una de tus políticas asignadas, un rango de fechas, y una nota opcional.</li>
                <li>Si la política requiere aprobación, se dirige automáticamente a tu manager directo. Si no, se aprueba al instante.</li>
                <li>Owner, Admin, o cualquiera con el permiso de decisión sobre ausencias puede aprobar o rechazar cualquier solicitud como excepción, sin importar la línea de reporte.</li>
              </ol>
              <p>
                Una solicitud pendiente notifica a tu manager y al dueño de la cuenta en el ícono de la campana
                (incluso si no tenés un manager asignado); una decisión — aprobada o rechazada — te notifica de
                vuelta de la misma forma.
              </p>
              <p>
                Los saldos (Asignados / Usados / Pendientes / Restantes) se calculan en el momento y se reinician
                cada 1° de enero — cambiar la política de alguien nunca reescribe sus solicitudes pasadas, y una
                política eliminada simplemente se desactiva en vez de borrar el historial.
              </p>
              <p>
                El calendario de Resumen muestra las ausencias aprobadas de todo el equipo junto con tareas y
                cumpleaños, y conectar Google Calendar (ver Integraciones y API) envía automáticamente tus propias
                ausencias aprobadas a tu calendario personal.
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== Payroll ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-payroll">
            <div className="help-eyebrow">
              <BriefcaseIcon />
              Personas
            </div>
            <h2>Nómina</h2>
            <div className="help-tagrow">
              <span className="help-pill help-pill-plan">Plan Growth</span>
              <span className="help-pill help-pill-role">Owner, o un rol con Gestionar nómina</span>
            </div>
            <p className="help-intro">Un registro de lo que se le paga a cada persona, y una forma de correr ciclos de pago — no un servicio de transferencias bancarias, ni papeleo impositivo.</p>

            <div className="help-callout help-callout-note">
              <InfoIcon />
              <p>
                Nómina no mueve ningún dinero — es una fuente de verdad compartida sobre lo que se le debe a cada
                uno y lo que ya se pagó, para que quede consistente en todo el equipo.
              </p>
            </div>

            <div className="help-sub">
              <h3>Compensación</h3>
              <p>
                Las condiciones de pago de cada persona — tarifa por hora o fija, moneda, frecuencia, y fecha de
                vigencia — viven en un <strong>historial versionado</strong>. Darle un aumento a alguien crea un
                registro nuevo y cierra el anterior el día previo, así el pago pasado nunca se sobrescribe.
              </p>
            </div>

            <div className="help-sub">
              <h3>Corriendo un ciclo de pago</h3>
              <ol className="help-steps">
                <li>Configurá tus <strong>Pay frequencies</strong> (Frecuencias de pago) (semanal, quincenal, mensual — con día de pago y desfase de vencimiento) y <strong>Payment methods</strong> (Métodos de pago) una sola vez, en la pestaña Payment Policies (Políticas de pago) de Nómina.</li>
                <li>Hacé clic en <strong>New Run</strong> (Nueva corrida), elegí una frecuencia y una etiqueta de período — todos los que están en esa frecuencia se cargan automáticamente como Draft (Borrador).</li>
                <li>Cargá las horas de quienes cobran por hora (la corrida no se puede confirmar hasta que lo hagas), y agregá las líneas de <strong>Bonus, Commission, Reimbursement,</strong> o <strong>Deduction</strong> (Bono, Comisión, Reembolso, o Deducción) que correspondan por persona.</li>
                <li>Hacé clic en <strong>Confirm Run</strong> (Confirmar corrida) para bloquearla.</li>
              </ol>
              <div className="help-callout help-callout-danger">
                <AlertCircleIcon />
                <p>Una corrida confirmada no se puede editar ni reabrir desde la interfaz — revisá bien las horas y los ajustes antes de confirmar.</p>
              </div>
              <p>
                ¿Necesitás pagarle a alguien fuera de un ciclo normal? Usá <strong>One-off Payment</strong> (Pago
                puntual) — los mismos tipos de ajuste, mostrado junto a las corridas normales en una sola línea de
                tiempo combinada.
              </p>
            </div>

            <div className="help-sub">
              <h3>Recibos de sueldo</h3>
              <p>
                Cada pago tiene un ícono de vista previa que abre un PDF descargable, claramente etiquetado{' '}
                <strong>"Preview only — not sent"</strong> ("Solo vista previa — no enviado") — una referencia para
                tus registros, no un recibo de sueldo oficial ni con validez legal. El encabezado lleva el logo y los
                datos de tu empresa (razón social, dirección, teléfono, web) cargados en{' '}
                <strong>Configuración → Datos de la empresa</strong>.
              </p>
            </div>

            <div className="help-sub">
              <h3>Quién puede verlo</h3>
              <p>
                Nómina — incluyendo la compensación y el historial de pagos de cualquier persona — es invisible
                para todos excepto el Owner, a menos que a un rol personalizado se le dé explícitamente el permiso
                Gestionar nómina. Hoy no existe una vista de autoconsulta para que alguien vea su propio sueldo.
              </p>
            </div>

            <div className="help-sub">
              <h3>Terminar un contrato</h3>
              <p>
                Desde el perfil de una persona, "…" → <strong>Terminate</strong> (Dar de baja). Elegí un último
                día — hoy o una fecha anterior tiene efecto inmediato, una fecha futura lo programa para correr
                automáticamente ese día.
              </p>
              <p>
                Una vez que toma efecto: el estado pasa a Terminated (Dado de baja), su compensación se cierra (así
                que queda afuera de las corridas futuras automáticamente), el acceso a la app se revoca de forma
                opcional, cualquier ausencia pendiente o futura se cancela, y las personas que le reportan
                directamente se reasignan a un manager que elijas. Se puede registrar un pago final opcional con
                las mismas líneas de ajuste que una corrida normal. Todo pago pasado — incluyendo el final — sigue
                visible en la pestaña <strong>Payment History</strong> (Historial de pagos) del perfil.
              </p>
            </div>
          </section>
          ) : (
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
                payslip. Its header carries your company logo and details (legal name, address, phone, website) from{' '}
                <strong>Settings → Company profile</strong>.
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
          )}

          {/* ===== Tasks & Notes ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-tasks">
            <div className="help-eyebrow">
              <ListIcon />
              Herramientas compartidas
            </div>
            <h2>Tareas y notas</h2>
            <p className="help-intro">Dos herramientas livianas que viven en todo registro de Empresa, Contacto, Oportunidad y Empleado.</p>

            <div className="help-sub">
              <h3>Tareas</h3>
              <p>
                Un seguimiento simple: título, descripción, un asignado (vos, por defecto), y una fecha de
                vencimiento con una hora opcional. Marcala como hecha directamente desde la lista, o hacé clic para
                editarla o eliminarla. Toda tarea también aparece en otros dos lugares — el widget{' '}
                <strong>My tasks</strong> (Mis tareas) y el calendario, ambos en tu página de Resumen — así nada
                queda enterrado dentro de un registro que no visitás seguido.
              </p>
              <p>
                Marcá <strong>Add Google Meet video call</strong> (Agregar videollamada de Google Meet) para
                convertir una tarea en una llamada real — Northstack completa un horario si todavía no elegiste
                uno, genera un link real de Meet en tu Google Calendar conectado (ver Integraciones y API), y
                automáticamente invita al Contacto, al Contacto principal de la Empresa, al Contacto principal de la
                Oportunidad, o al Empleado sobre quien trata la tarea. El link para unirse aparece en la tarea misma
                una vez que está listo. Este checkbox solo aparece una vez que Google Calendar está conectado.
              </p>
              <p>
                <strong>Mis tareas</strong> (en la barra lateral, debajo de Resumen) es una página dedicada a toda
                tarea que tenés asignada o creaste, en todos los registros, en vez de tener que buscarlas una por
                una. Cambiá entre una vista <strong>Lista</strong> (ordenada por fecha de vencimiento, con columnas
                de Creada/Vencimiento/Completada) y una vista <strong>Tablero</strong> (arrastrá una tarjeta entre
                Vencidas/Hoy/Esta semana/Más adelante/Sin fecha de vencimiento/Completadas para reprogramarla o
                marcarla como hecha). Buscá, filtrá por estado de completada, y organizá las tareas en{' '}
                <strong>carpetas</strong> que creás vos mismo desde el panel izquierdo — una carpeta es solo una
                etiqueta para agrupar tareas relacionadas, compartida en todo el tenant. Hacé clic en una tarea
                donde sea para ver su detalle completo y editarla; la fila "+ Agregar tarea" al final de la lista te
                deja crear una desde cero, eligiendo a qué Empresa/Contacto/Empleado/Oportunidad corresponde.
              </p>
            </div>

            <div className="help-sub">
              <h3>Notas</h3>
              <p>
                Un título más una descripción más larga con formato liviano — para dejar contexto permanente en el
                registro, no algo para marcar como hecho. Toda nota y tarea muestra quién la escribió y cuándo.
              </p>
            </div>
          </section>
          ) : (
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
              <p>
                Check <strong>Add Google Meet video call</strong> to turn a task into an actual call — Northstack
                fills in a time if you haven't picked one yet, generates a real Meet link on your connected Google
                Calendar (see Integrations &amp; API), and automatically invites the Contact, Company's primary
                Contact, Opportunity's primary Contact, or Employee the task is about. The join link shows up on the
                task itself once it's ready. This checkbox only appears once Google Calendar is connected.
              </p>
              <p>
                <strong>My Tasks</strong> (in the sidebar, below Overview) is a dedicated page for every task you're
                assigned to or created, across every record, instead of hunting through each one individually.
                Switch between a <strong>List</strong> (sorted by due date, with Created/Due/Completed columns) and a
                <strong> Board</strong> view (drag a card between Overdue/Today/This week/Later/No due date/Completed
                to reschedule or mark it done). Search, filter by completed status, and organize tasks into
                <strong> folders</strong> you create yourself from the left rail — a folder is just a label to group
                related tasks under, shared across the tenant. Click a task anywhere to see its full detail and edit
                it; the "+ Add task" row at the bottom of the list lets you create one from scratch, picking which
                Company/Contact/Employee/Opportunity it's about.
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
          )}

          {/* ===== Public forms ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-forms">
            <div className="help-eyebrow">
              <FormIcon />
              Conectar
            </div>
            <h2>Formularios públicos</h2>
            <p className="help-intro">Un link web para compartir — sin necesidad de iniciar sesión — para reclutamiento o leads entrantes de ventas.</p>

            <div className="help-sub">
              <h3>Construyendo uno</h3>
              <ol className="help-steps">
                <li>Andá a <strong>Configuración → Formularios públicos</strong> y elegí un tipo: Empleado, Cliente, o Contacto.</li>
                <li>Ponele un nombre — esto genera un enlace que podés editar antes de crear el formulario (después queda fijo).</li>
                <li>Arrastrá los campos que querés recolectar, desde tus campos incorporados y cualquier campo personalizado; marcá los que sean obligatorios. Nombre, apellido y correo electrónico siempre se recolectan.</li>
                <li>Escribí un mensaje de "agradecimiento" que se muestra después de que alguien envía el formulario.</li>
              </ol>
              <p>
                Un formulario de <strong>Contacto</strong> se puede vincular opcionalmente a un Pipeline — un envío
                que coincida con una Empresa existente también crea automáticamente una Oportunidad en la primera
                etapa de ese pipeline.
              </p>
            </div>

            <div className="help-sub">
              <h3>Compartirlo y protegerlo</h3>
              <p>
                Copiá el enlace desde la fila del formulario y compartilo donde quieras. Activá o desactivá un
                formulario (<strong>Activo/Inactivo</strong>) en cualquier momento — un formulario inactivo les
                muestra a los visitantes un simple mensaje de "ya no se aceptan envíos". Todo formulario tiene un
                campo honeypot oculto y una verificación CAPTCHA incorporados contra spam.
              </p>
            </div>

            <div className="help-callout help-callout-warn">
              <AlertTriangleIcon />
              <p>
                Un envío se crea directamente en tu espacio de trabajo, sin ninguna cola de revisión en el medio —
                el envío de un formulario de Empleado se convierte en un registro real de Empleado en el momento en
                que se manda, igual que los formularios de Cliente o Contacto. Si querés evaluar a los postulantes
                primero, usá el estado del registro resultante como tu propio paso de "en revisión".
              </p>
            </div>
          </section>
          ) : (
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
          )}

          {/* ===== Integrations ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-integrations">
            <div className="help-eyebrow">
              <PlugIcon />
              Conectar
            </div>
            <h2>Integraciones y API</h2>
            <p className="help-intro">
              Todas las conexiones viven en un solo lugar: <strong>Configuración → Integraciones.</strong>
            </p>

            <div className="help-sub">
              <h3>Google Calendar</h3>
              <p>
                Una conexión personal — cada persona conecta su propia cuenta de Google, no una compartida para
                toda la empresa. Una vez conectada:
              </p>
              <ul>
                <li>Tus propias tareas con una hora de vencimiento y tus propias ausencias aprobadas se sincronizan automáticamente con tu Google Calendar.</li>
                <li>La sincronización es <strong>en los dos sentidos</strong> — editar o eliminar el evento sincronizado del lado de Google se refleja de vuelta en Northstack.</li>
                <li>Las ausencias aprobadas se sincronizan <strong>para todo el equipo</strong>, así que la ausencia aprobada de un compañero también puede aparecer en tu calendario, no solo la tuya.</li>
                <li>Los cumpleaños nunca se sincronizan con Google — son opcionales y quedan solo dentro del calendario de Resumen propio de Northstack.</li>
                <li>Una tarea con <strong>Add Google Meet video call</strong> (Agregar videollamada de Google Meet) marcado recibe un link real de Meet, con la persona sobre la que trata invitada automáticamente (ver Tareas y notas).</li>
                <li>Tus propios eventos personales de Google Calendar (nunca creados como una tarea de Northstack) también aparecen en el calendario de Resumen — hacé clic en uno para ver sus detalles en una vista previa chica.</li>
              </ul>
              <p>Desconectar detiene la sincronización futura pero no elimina los eventos ya creados en Google.</p>
            </div>

            <div className="help-sub">
              <h3>Pagos — tu propia cuenta de Stripe</h3>
              <div className="help-tagrow">
                <span className="help-pill help-pill-plan">Plan Growth</span>
              </div>
              <p>
                Esto es independiente de la facturación de tu propia suscripción a Northstack — te permite conectar{' '}
                <strong>tu</strong> cuenta de Stripe para ver la actividad de pagos de <strong>tus clientes</strong>{' '}
                dentro de Northstack.
              </p>
              <ol className="help-steps">
                <li>En Stripe, creá una <strong>Restricted API key</strong> (clave de API restringida) con acceso de solo lectura.</li>
                <li>Pegala en <strong>Configuración → Integraciones → Stripe</strong> (Owner, o un rol con el permiso de Pagos).</li>
                <li>Las Empresas se emparejan automáticamente con clientes de Stripe por email cuando hay exactamente una coincidencia; si podría haber varias, se te va a pedir que elijas manualmente desde el perfil de una Empresa.</li>
              </ol>
              <p>
                El perfil de cada Empresa emparejada muestra entonces un historial de pagos completo y paginado con
                links de vuelta al recibo de Stripe, y vas a recibir una notificación dentro de la app por un
                reembolso, un cobro fallido, o una suscripción que pasa a estar vencida o se cancela. Estas
                verificaciones corren dos veces al día, no al instante.
              </p>
            </div>

            <div className="help-sub">
              <h3>Claves de API y documentación para desarrolladores</h3>
              <div className="help-tagrow">
                <span className="help-pill help-pill-role">Owner, o un rol con acceso de Gestionar API</span>
              </div>
              <p>
                Para tus propios scripts, o herramientas como Zapier o Make: creá una clave desde{' '}
                <strong>Configuración → Integraciones → Claves de API</strong>, eligiendo exactamente qué recursos
                puede leer o escribir (Tareas, Notas, Empresas, Contactos, Oportunidades, Empleados, Ausencias —
                Pipelines y Nómina son de solo lectura a través de la API). La clave completa se muestra una sola
                vez, al crearla — copiala de inmediato, porque Northstack nunca la vuelve a mostrar. Revocar una
                clave es inmediato y no se puede deshacer.
              </p>
              <p>
                La documentación completa de requests y responses vive en <strong>/developers</strong> (enlazada
                desde la página de Claves de API) — requiere estar con la sesión iniciada, así que no es accesible
                para el público.
              </p>
              <div className="help-callout help-callout-note">
                <InfoIcon />
                <p>
                  Los webhooks salientes (Northstack empujando actualizaciones a tu propia URL) todavía no están
                  disponibles — hoy no hay una pantalla para configurarlos. Si necesitás reaccionar a cambios desde
                  otro lado, por ahora consultá la API periódicamente.
                </p>
              </div>
            </div>
          </section>
          ) : (
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
                <li>A task with <strong>Add Google Meet video call</strong> checked gets a real Meet link, with the person it's about invited automatically (see Tasks &amp; notes).</li>
                <li>Your own personal Google Calendar events (never created as a Northstack task) also show up on the Overview calendar — click one to see its details in a small preview.</li>
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
          )}

          {/* ===== Settings ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-settings">
            <div className="help-eyebrow">
              <GearIcon />
              Espacio de trabajo
            </div>
            <h2>Configuración y apariencia</h2>
            <p className="help-intro">Configuración está agrupada entre lo que es personal para vos, y lo que pertenece a toda la empresa.</p>

            <dl className="help-fieldgrid">
              <div className="help-fielddef">
                <dt>Mi cuenta</dt>
                <dd>Perfil (nombre, teléfono, contraseña, idioma y tema), Integraciones, y Facturación (si la gestionás vos) — visible para todos.</dd>
              </div>
              <div className="help-fielddef">
                <dt>Empresa</dt>
                <dd>Datos de la empresa, Usuarios, Formularios públicos, Pipelines, Registro de actividad, y Roles y permisos — cada tile solo aparece si tenés el permiso correspondiente.</dd>
              </div>
            </dl>

            <div className="help-sub">
              <h3>Datos de la empresa</h3>
              <p>
                Nombre, razón social, industria, tamaño, país, dirección, teléfono y sitio web de tu empresa, más su{' '}
                <strong>logo</strong> (PNG o JPG, hasta 2 MB — se achica automáticamente). Se usan en los recibos de
                sueldo, los contratos de los empleados, los emails de invitación y arriba del menú lateral. No pedimos
                ID fiscal. La moneda también vive acá: es para todo el espacio de trabajo (una moneda ISO, ej. USD o
                EUR) y controla cómo se etiquetan las cifras de compensación; cambiarla solo reetiqueta los montos de
                ahí en adelante, no convierte las cifras pasadas.
              </p>
            </div>

            <div className="help-sub">
              <h3>Tema</h3>
              <p>
                El tema — Claro, Oscuro, o Sistema — está en <strong>Configuración → Perfil</strong>, disponible para
                todos. Es una elección personal que se guarda por dispositivo, no se comparte con tu equipo.
              </p>
            </div>

            <div className="help-sub">
              <h3>Registro de actividad</h3>
              <p>
                Toda creación, edición y eliminación en el espacio de trabajo queda registrada con el valor
                anterior y el nuevo de cada campo que cambió. Lo encontrás de dos formas: una pestaña{' '}
                <strong>Actividad</strong> en cualquier registro individual, o la página completa y filtrable{' '}
                <strong>Configuración → Registro de actividad</strong> (Owner/Admin). Cuánto tiempo hacia atrás
                llega depende de tu plan — 7 días en Starter, 30 en Growth.
              </p>
            </div>
          </section>
          ) : (
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
                <dd>Profile (name, phone, password, language and theme), Integrations, and Billing (if you manage it) — visible to everyone.</dd>
              </div>
              <div className="help-fielddef">
                <dt>Company</dt>
                <dd>Company profile, Users, Public Forms, Pipelines, Activity Log, and Roles &amp; Permissions — each tile only appears if you have the matching permission.</dd>
              </div>
            </dl>

            <div className="help-sub">
              <h3>Company profile</h3>
              <p>
                Your company's name, legal name, industry, size, country, address, phone and website, plus its{' '}
                <strong>logo</strong> (PNG or JPG, up to 2 MB — resized automatically). They appear on payslips,
                employee contracts, invitation emails and at the top of the sidebar. We don't collect tax IDs.
                Currency lives here too: it's workspace-wide (one ISO currency, e.g. USD or EUR) and controls how
                compensation figures are labeled; changing it relabels amounts going forward, it doesn't convert past
                figures.
              </p>
            </div>

            <div className="help-sub">
              <h3>Theme</h3>
              <p>
                Theme — Light, Dark, or System — is under <strong>Settings → Profile</strong>, available to everyone.
                It's a personal choice saved per device, not shared with your team.
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
          )}

          {/* ===== Billing ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-billing">
            <div className="help-eyebrow">
              <CreditCardIcon />
              Espacio de trabajo
            </div>
            <h2>Facturación y planes</h2>
            <p className="help-intro">Dos planes de autoservicio, más un nivel para hablar con nosotros directamente para equipos más grandes.</p>

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
                  <tr>
                    <td>Precio</td>
                    <td className="num">{usd('starter')}/mes</td>
                    <td className="num">{usd('growth')}/mes</td>
                  </tr>
                  <tr><td>Pipelines</td><td className="num">2</td><td className="num">Ilimitados</td></tr>
                  <tr><td>Políticas de ausencias</td><td className="num">3</td><td className="num">Ilimitadas</td></tr>
                  <tr><td>Puestos incluidos</td><td className="num">{included('starter')}</td><td className="num">{included('growth')}</td></tr>
                  <tr><td>Roles personalizados</td><td className="num">2</td><td className="num">Ilimitados</td></tr>
                  <tr><td>Historial del registro de actividad</td><td className="num">7 días</td><td className="num">30 días</td></tr>
                  <tr><td>Nómina</td><td className="no">—</td><td className="yes">Incluido</td></tr>
                  <tr><td>Pagos (tu Stripe)</td><td className="no">—</td><td className="yes">Incluido</td></tr>
                </tbody>
              </table>
            </div>
            <p className="help-intro" style={{ marginTop: '-8px' }}>
              Precios mostrados en USD (en Argentina se cobra en pesos vía Mercado Pago). Un tercer nivel, <strong>Scale</strong>, está disponible hablando con
              nosotros directamente en vez de por checkout de autoservicio. "Puestos incluidos" cuenta a toda
              persona activa en tu espacio de trabajo sin importar el rol — owner, admin, o member cuentan todos
              igual. Si te pasás, cada puesto extra cuesta {seatPrice}/mes, facturado automáticamente; no hay un tope duro
              una vez que estás en un plan real. La prueba gratuita (sin plan elegido todavía) está limitada a {trialCap}{' '}
              personas porque todavía no hay facturación configurada para cubrir a nadie más allá de eso — elegí un
              plan para agregar más.
            </p>

            <div className="help-sub">
              <h3>Eligiendo cómo pagás</h3>
              <p>
                Esto es automático, según el país de tu espacio de trabajo — no es algo que elijas vos. Argentina
                factura en ARS a través de Mercado Pago; el resto de los países factura en USD a través de Dodo
                Payments. Northstack nunca ve ni guarda los datos de tu tarjeta en ningún caso.
              </p>
            </div>

            <div className="help-sub">
              <h3>Suscribirse, cambiar, y cancelar</h3>
              <ul>
                <li><strong>Change plan</strong> (Cambiar plan) es el único punto de entrada para todo: ¿todavía estás en la prueba gratuita? Te lleva directo al checkout seguro de tu proveedor de pago en una pestaña nueva, y tu plan recién se actualiza de verdad cuando se confirma ese pago. ¿Ya estás pagando? El cambio toma efecto en tu próxima fecha de facturación en cambio.</li>
                <li><strong>Update payment method</strong> (Actualizar método de pago) usa el mismo flujo de checkout, para reemplazar la tarjeta de tu suscripción existente.</li>
                <li><strong>Cancel subscription</strong> (Cancelar suscripción) mantiene tu acceso hasta el final del período que ya pagaste — hasta entonces aparece un botón <strong>Resume subscription</strong> (Reanudar suscripción) por si cambiás de idea.</li>
              </ul>
              <p>
                La página de Facturación muestra tu cantidad actual de puestos contra los puestos incluidos en tu
                plan, más cualquier costo de puestos extra. Debajo se listan las facturas con fecha, monto
                (desglosado en plan + puestos extra cuando corresponde), y estado.
              </p>
            </div>

            <div className="help-sub">
              <h3>Si un pago falla</h3>
              <p>
                Tenés un período de gracia de 14 días con acceso completo y un banner de advertencia. Si vence sin
                un pago exitoso, tu espacio de trabajo pasa a <strong>modo solo lectura</strong> — ver sigue
                funcionando en todos lados, pero nadie puede crear, editar, ni eliminar nada hasta que se resuelva
                la facturación.
              </p>
            </div>
          </section>
          ) : (
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
                  <tr>
                    <td>Price</td>
                    <td className="num">{usd('starter')}/mo</td>
                    <td className="num">{usd('growth')}/mo</td>
                  </tr>
                  <tr><td>Pipelines</td><td className="num">2</td><td className="num">Unlimited</td></tr>
                  <tr><td>Time off policies</td><td className="num">3</td><td className="num">Unlimited</td></tr>
                  <tr><td>Seats included</td><td className="num">{included('starter')}</td><td className="num">{included('growth')}</td></tr>
                  <tr><td>Custom roles</td><td className="num">2</td><td className="num">Unlimited</td></tr>
                  <tr><td>Activity log history</td><td className="num">7 days</td><td className="num">30 days</td></tr>
                  <tr><td>Payroll</td><td className="no">—</td><td className="yes">Included</td></tr>
                  <tr><td>Payments (your Stripe)</td><td className="no">—</td><td className="yes">Included</td></tr>
                </tbody>
              </table>
            </div>
            <p className="help-intro" style={{ marginTop: '-8px' }}>
              Prices shown in USD (Argentina is billed in pesos via Mercado Pago). A third tier, <strong>Scale</strong>, is available by talking to us directly
              rather than self-serve checkout. "Seats included" counts every active person in your workspace
              regardless of role — owner, admin, or member all count the same. Go over and each extra seat is
              {seatPrice}/mo, billed automatically; no hard cap once you're on a real plan. Free Trial (no plan chosen yet)
              is capped at {trialCap} people since there's no billing in place yet to cover anyone past that — pick a plan to
              add more.
            </p>

            <div className="help-sub">
              <h3>Choosing how you pay</h3>
              <p>
                This is automatic, based on your workspace's country — not something you pick yourself. Argentina
                bills in ARS through Mercado Pago; every other country bills in USD through Dodo Payments. Northstack
                never sees or stores your card details either way.
              </p>
            </div>

            <div className="help-sub">
              <h3>Subscribing, changing, and cancelling</h3>
              <ul>
                <li><strong>Change plan</strong> is the one entry point for everything: still on Free Trial? It goes straight to your payment provider's secure checkout in a new tab, and your plan only actually updates once that payment is confirmed. Already paying? The change takes effect at your next billing date instead.</li>
                <li><strong>Update payment method</strong> uses the same checkout flow, to replace the card on your existing subscription.</li>
                <li><strong>Cancel subscription</strong> keeps your access through the end of the period you already paid for — a <strong>Resume subscription</strong> button appears until then if you change your mind.</li>
              </ul>
              <p>
                The Billing page shows your current seat count against your plan's included seats, plus any extra
                seat cost. Invoices are listed below that with date, amount (broken down into plan + extra seats
                when applicable), and status.
              </p>
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
          )}

          {/* ===== Data ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-data">
            <div className="help-eyebrow">
              <DownloadIcon />
              Espacio de trabajo
            </div>
            <h2>Importar y exportar</h2>
            <p className="help-intro">Traé datos o sacalos con CSV — soportado hoy en Personas, Empresas, y Contactos.</p>

            <ol className="help-steps">
              <li>Desde la barra de herramientas del módulo, descargá la <strong>plantilla</strong> — incluye los encabezados de columna correctos más una fila de ejemplo completa.</li>
              <li>Completala y subila de vuelta por el mismo menú.</li>
              <li>Revisá el panel de resultados: cuántos registros se crearon, y una lista fila por fila de lo que falló y por qué.</li>
            </ol>
            <div className="help-callout help-callout-note">
              <InfoIcon />
              <p>
                Una importación de Empresas necesita un "Primary Contact Email" (email del contacto principal) en
                cada fila — se vincula automáticamente a un contacto existente que coincida, o crea uno nuevo junto
                con la empresa si también incluís nombre y apellido.
              </p>
            </div>
            <p>El acceso a importar/exportar está sujeto a permisos por módulo y puede diferir del acceso general de edición — consultá con tu Owner o Admin si parece faltar un botón.</p>
          </section>
          ) : (
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
          )}

          {/* ===== Mobile ===== */}
          {isSpanish ? (
          <section className="help-section" id="g-mobile">
            <div className="help-eyebrow">
              <DeviceIcon />
              Espacio de trabajo
            </div>
            <h2>Desde el celular</h2>
            <p className="help-intro">Hoy Northstack funciona desde el navegador de tu celular.</p>
            <p>
              Abrí la misma dirección web desde tu celular y el diseño se adapta — menús, pestañas, y formularios
              están todos rediseñados para una pantalla chica. Todavía no hay una app de Northstack en el App Store
              ni en Play Store; por ahora, el navegador es la forma de usar Northstack desde el celular.
            </p>
          </section>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
