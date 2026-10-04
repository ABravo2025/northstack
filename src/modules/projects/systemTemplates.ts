import type { ProjectTemplateNiche } from '@prisma/client';

// Projects module (2026-10-04) — the system templates every tenant can start a project from.
// Content only: scripts/seed-project-templates.ts writes one ProjectTemplate row per template per
// locale (keyed by systemKey + locale, so re-running the seed updates in place). Each text sits as
// an { en, es } pair so the two languages can't drift apart.
//
// Conventions:
//   - offset = days from the project's start date (negative = before day 1).
//   - role   = the suggested project role; when the project is created, each task goes to the team
//              member holding that role (if they have a login), else to the project owner.
//   - Accounting content is written for Argentina in Spanish (IVA, IIBB, DDJJ, VEP) and kept
//     jurisdiction-neutral in English (VAT/sales tax, returns), since the English audience is wider.

type L = { en: string; es: string };

export interface SystemTemplateTask {
  title: L;
  offset: number;
  role?: L;
}

export interface SystemTemplatePhase {
  name: L;
  tasks: SystemTemplateTask[];
}

export interface SystemTemplate {
  key: string;
  niche: Exclude<ProjectTemplateNiche, 'custom'>;
  name: L;
  description: L;
  phases: SystemTemplatePhase[];
}

const l = (en: string, es: string): L => ({ en, es });
const task = (en: string, es: string, offset: number, role?: L): SystemTemplateTask => ({ title: l(en, es), offset, role });

// Roles shared across templates.
const PM = l('Project manager', 'Project manager');
const DESIGNER = l('Designer', 'Diseñador');
const DEVELOPER = l('Developer', 'Desarrollador');
const COPYWRITER = l('Copywriter', 'Redactor');
const COMMUNITY = l('Community manager', 'Community manager');
const ASSISTANT = l('Assistant', 'Asistente');
const ACCOUNTANT = l('Accountant', 'Contador');
const PARTNER = l('Partner', 'Socio');
const LEAD = l('Project lead', 'Líder de proyecto');
const CONSULTANT = l('Consultant', 'Consultor');
const ACCOUNT_MANAGER = l('Account manager', 'Account manager');
const HR = l('HR', 'RRHH');
const IT = l('IT', 'IT');
const MANAGER = l('Manager', 'Líder');
const AUDIT_LEAD = l('Audit lead', 'Responsable de auditoría');
const AUDITOR = l('Auditor', 'Auditor');

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  // ---- Agencies --------------------------------------------------------------------------------
  {
    key: 'agency.website',
    niche: 'agency',
    name: l('Website', 'Sitio web'),
    description: l('A client website from discovery to launch.', 'Un sitio para un cliente, del discovery al lanzamiento.'),
    phases: [
      {
        name: l('Discovery', 'Discovery'),
        tasks: [
          task('Kickoff meeting with the client', 'Kickoff con el cliente', 0, PM),
          task('Gather goals, audience and references', 'Relevar objetivos, público y referencias', 2, PM),
          task('Sitemap and content plan', 'Mapa del sitio y plan de contenidos', 5, COPYWRITER),
        ],
      },
      {
        name: l('Design', 'Diseño'),
        tasks: [
          task('Wireframes', 'Wireframes', 9, DESIGNER),
          task('Home and inner page mockups', 'Mockups de home e internas', 14, DESIGNER),
          task('Client design approval', 'Aprobación de diseño del cliente', 17, PM),
        ],
      },
      {
        name: l('Development', 'Desarrollo'),
        tasks: [
          task('Build pages and CMS', 'Maquetado y CMS', 27, DEVELOPER),
          task('Load final content', 'Carga de contenidos finales', 31, COPYWRITER),
          task('Basic SEO: titles, descriptions, sitemap', 'SEO básico: títulos, descripciones, sitemap', 33, DEVELOPER),
        ],
      },
      {
        name: l('QA', 'QA'),
        tasks: [
          task('Test on phones and browsers', 'Pruebas en celulares y navegadores', 35, DEVELOPER),
          task('Final review with the client', 'Revisión final con el cliente', 37, PM),
        ],
      },
      {
        name: l('Launch', 'Lanzamiento'),
        tasks: [
          task('Publish and connect the domain', 'Publicar y configurar el dominio', 39, DEVELOPER),
          task('Hand over access and train the client', 'Entrega de accesos y capacitación', 41, PM),
          task('Follow-up 30 days after launch', 'Seguimiento a 30 días del lanzamiento', 70, PM),
        ],
      },
    ],
  },
  {
    key: 'agency.monthly-campaign',
    niche: 'agency',
    name: l('Monthly campaign', 'Campaña mensual'),
    description: l("A month of social content and ads for a client.", 'Un mes de contenido en redes y anuncios para un cliente.'),
    phases: [
      {
        name: l('Brief', 'Brief'),
        tasks: [
          task("Agree on the month's goals and key dates", 'Acordar objetivos y fechas clave del mes', 0, PM),
          task("Review last month's results", 'Revisar resultados del mes anterior', 1, PM),
        ],
      },
      {
        name: l('Production', 'Producción'),
        tasks: [
          task('Content calendar', 'Calendario de contenidos', 3, COPYWRITER),
          task('Copy for posts and ads', 'Textos de posteos y anuncios', 6, COPYWRITER),
          task('Visual pieces', 'Piezas gráficas', 8, DESIGNER),
          task('Client approval', 'Aprobación del cliente', 10, PM),
        ],
      },
      {
        name: l('Publishing', 'Publicación'),
        tasks: [
          task('Schedule posts', 'Programar publicaciones', 12, COMMUNITY),
          task('Launch ad campaigns', 'Lanzar campañas de anuncios', 12, COMMUNITY),
          task('Mid-month check and adjustments', 'Control y ajustes de mitad de mes', 20, COMMUNITY),
        ],
      },
      {
        name: l('Report', 'Reporte'),
        tasks: [
          task('Results report', 'Reporte de resultados', 30, PM),
          task('Results meeting with the client', 'Reunión de resultados con el cliente', 32, PM),
        ],
      },
    ],
  },

  // ---- Accounting firms --------------------------------------------------------------------------
  {
    key: 'accounting.monthly-close',
    niche: 'accounting',
    name: l('Monthly close', 'Cierre mensual'),
    description: l('Reconciliation, tax filings and the monthly summary for a client.', 'Conciliación, liquidación de impuestos y presentación de un cliente.'),
    phases: [
      {
        name: l('Collection', 'Recolección'),
        tasks: [
          task('Request bank statements and receipts', 'Pedir extractos bancarios y comprobantes', 0, ASSISTANT),
          task('Receive sales and purchase invoices', 'Recibir facturas de compras y ventas', 3, ASSISTANT),
          task('Load documents into the accounting system', 'Cargar comprobantes en el sistema contable', 5, ASSISTANT),
        ],
      },
      {
        name: l('Reconciliation', 'Conciliación'),
        tasks: [
          task('Reconcile bank accounts', 'Conciliar bancos', 6, ACCOUNTANT),
          task('Review receivables and payables', 'Revisar cuentas a cobrar y a pagar', 7, ACCOUNTANT),
        ],
      },
      {
        name: l('Tax filings', 'Liquidación'),
        tasks: [
          task('Prepare the VAT / sales tax return', 'Liquidar IVA', 9, ACCOUNTANT),
          task('Prepare other monthly taxes', 'Liquidar Ingresos Brutos', 10, ACCOUNTANT),
          task('Prepare payroll taxes if applicable', 'Liquidar cargas sociales (F.931) si corresponde', 10, ACCOUNTANT),
        ],
      },
      {
        name: l('Filing', 'Presentación'),
        tasks: [
          task('Partner review', 'Revisión del socio', 11, PARTNER),
          task('File the returns', 'Presentar las DDJJ', 12, ACCOUNTANT),
          task('Send payment slips and the summary to the client', 'Enviar VEP y resumen al cliente', 13, ASSISTANT),
        ],
      },
    ],
  },
  {
    key: 'accounting.annual-return',
    niche: 'accounting',
    name: l('Annual return', 'Declaración anual'),
    description: l('Financial statements and the yearly income and wealth returns.', 'Balance, Ganancias y Bienes Personales del año.'),
    phases: [
      {
        name: l('Documents', 'Documentación'),
        tasks: [
          task("Request the year's documents", 'Solicitar la documentación anual', 0, ASSISTANT),
          task('Year-end bank and investment statements', 'Saldos de bancos e inversiones al cierre', 7, ASSISTANT),
          task('Inventory and fixed assets', 'Inventario y bienes de uso', 10, ACCOUNTANT),
        ],
      },
      {
        name: l('Preparation', 'Armado'),
        tasks: [
          task('Year-end adjustments', 'Ajustes de cierre', 18, ACCOUNTANT),
          task('Financial statements', 'Armar el balance', 25, ACCOUNTANT),
          task('Income tax return', 'Ganancias', 32, ACCOUNTANT),
          task('Wealth tax return', 'Bienes Personales', 35, ACCOUNTANT),
        ],
      },
      {
        name: l('Review', 'Revisión'),
        tasks: [
          task('Partner review', 'Revisión del socio', 42, PARTNER),
          task('Walk the client through the results', 'Explicar los resultados al cliente', 45, PARTNER),
        ],
      },
      {
        name: l('Filing', 'Presentación'),
        tasks: [
          task('File the returns', 'Presentar las DDJJ', 50, ACCOUNTANT),
          task('Send payment slips and filed copies', 'Enviar VEP y acuses al cliente', 51, ASSISTANT),
        ],
      },
    ],
  },
  {
    key: 'accounting.client-onboarding',
    niche: 'accounting',
    name: l('New client setup', 'Alta de cliente nuevo'),
    description: l('Everything needed to start keeping a new client.', 'Todo lo necesario para empezar a llevar un cliente.'),
    phases: [
      {
        name: l('Details', 'Datos'),
        tasks: [
          task('Kickoff meeting', 'Reunión inicial', 0, PARTNER),
          task('Engagement letter and fees signed', 'Firma de propuesta y honorarios', 2, PARTNER),
          task('Receive tax portal access', 'Recibir clave fiscal y accesos', 3, ASSISTANT),
        ],
      },
      {
        name: l('Registrations', 'Altas fiscales'),
        tasks: [
          task('Review current tax registrations', 'Revisar inscripciones vigentes', 5, ACCOUNTANT),
          task('Complete any missing registrations', 'Tramitar altas faltantes', 8, ACCOUNTANT),
          task('Take over prior filings history', 'Recibir historial de presentaciones anteriores', 8, ASSISTANT),
        ],
      },
      {
        name: l('First period', 'Primer período'),
        tasks: [
          task('Deadline calendar for the client', 'Armar el calendario de vencimientos', 10, ACCOUNTANT),
          task('First monthly close', 'Primer cierre mensual', 30, ACCOUNTANT),
          task('Check-in with the client after the first month', 'Reunión de seguimiento al primer mes', 35, PARTNER),
        ],
      },
    ],
  },

  // ---- Consulting / implementation ---------------------------------------------------------------
  {
    key: 'consulting.implementation',
    niche: 'consulting',
    name: l('Implementation', 'Implementación'),
    description: l('Rolling out a system at a client, from kickoff to go-live.', 'Implementación de un sistema en un cliente, del kickoff al go-live.'),
    phases: [
      {
        name: l('Kickoff', 'Kickoff'),
        tasks: [
          task('Kickoff meeting', 'Reunión de kickoff', 0, LEAD),
          task('Work plan and milestones', 'Plan de trabajo e hitos', 3, LEAD),
        ],
      },
      {
        name: l('Discovery', 'Relevamiento'),
        tasks: [
          task('Interviews with each team', 'Entrevistas con cada área', 7, CONSULTANT),
          task('Current-process map', 'Mapa de procesos actuales', 10, CONSULTANT),
          task('Discovery document approved', 'Documento de relevamiento aprobado', 14, LEAD),
        ],
      },
      {
        name: l('Configuration', 'Configuración'),
        tasks: [
          task('Configure the system', 'Configurar el sistema', 21, CONSULTANT),
          task('Data migration', 'Migración de datos', 25, CONSULTANT),
          task('Acceptance testing with key users', 'Pruebas con usuarios clave', 28, CONSULTANT),
        ],
      },
      {
        name: l('Training', 'Capacitación'),
        tasks: [
          task('User training sessions', 'Capacitación a usuarios', 31, CONSULTANT),
          task('User guide', 'Manual de uso', 33, CONSULTANT),
        ],
      },
      {
        name: l('Go-live', 'Go-live'),
        tasks: [
          task('Go-live', 'Puesta en marcha', 35, LEAD),
          task('Post go-live support', 'Soporte post go-live', 45, CONSULTANT),
          task('Closing meeting and sign-off', 'Reunión de cierre y conformidad', 50, LEAD),
        ],
      },
    ],
  },
  {
    key: 'consulting.client-onboarding',
    niche: 'consulting',
    name: l('Client onboarding', 'Onboarding de cliente'),
    description: l("A new client's first 30 days.", 'Los primeros 30 días de un cliente nuevo.'),
    phases: [
      {
        name: l('Welcome', 'Bienvenida'),
        tasks: [
          task('Welcome email with next steps', 'Email de bienvenida con próximos pasos', 0, ACCOUNT_MANAGER),
          task('Kickoff call', 'Reunión de inicio', 2, ACCOUNT_MANAGER),
          task("Agree the client's success goals", 'Acordar los objetivos de éxito del cliente', 3, ACCOUNT_MANAGER),
        ],
      },
      {
        name: l('Setup', 'Setup'),
        tasks: [
          task('Access and configuration', 'Accesos y configuración', 5, CONSULTANT),
          task('Progress update to the client', 'Avance de estado al cliente', 10, ACCOUNT_MANAGER),
          task('First deliverable', 'Primer entregable', 14, CONSULTANT),
        ],
      },
      {
        name: l('30-day follow-up', 'Seguimiento 30 días'),
        tasks: [
          task('Check-in call', 'Llamada de seguimiento', 21, ACCOUNT_MANAGER),
          task('Satisfaction survey', 'Encuesta de satisfacción', 30, ACCOUNT_MANAGER),
        ],
      },
    ],
  },

  // ---- Internal ----------------------------------------------------------------------------------
  {
    key: 'internal.employee-onboarding',
    niche: 'internal',
    name: l('Employee onboarding', 'Onboarding de empleado'),
    description: l('From before day one to the 30-day check-in.', 'Del pre-ingreso a la reunión de los 30 días.'),
    phases: [
      {
        name: l('Before day 1', 'Pre-ingreso'),
        tasks: [
          task('Prepare equipment and accounts', 'Preparar equipo y accesos', -3, IT),
          task('Send documents to sign', 'Enviar documentación a firmar', -2, HR),
          task('Announce the new hire to the team', 'Anunciar el ingreso al equipo', -1, MANAGER),
        ],
      },
      {
        name: l('Day 1', 'Día 1'),
        tasks: [
          task('Welcome and office tour', 'Bienvenida y recorrida', 0, HR),
          task('Introductions with the team', 'Presentación con el equipo', 0, MANAGER),
        ],
      },
      {
        name: l('Week 1', 'Semana 1'),
        tasks: [
          task('Tools training', 'Capacitación en herramientas', 3, MANAGER),
          task('First-month goals', 'Objetivos del primer mes', 5, MANAGER),
        ],
      },
      {
        name: l('Month 1', 'Mes 1'),
        tasks: [
          task('30-day check-in', 'Reunión de los 30 días', 30, MANAGER),
          task('Onboarding survey', 'Encuesta de onboarding', 30, HR),
        ],
      },
    ],
  },
  {
    key: 'internal.internal-audit',
    niche: 'internal',
    name: l('Internal audit', 'Auditoría interna'),
    description: l('Review a process and agree an action plan.', 'Revisión de procesos y plan de acción.'),
    phases: [
      {
        name: l('Planning', 'Planificación'),
        tasks: [
          task('Define scope and criteria', 'Definir alcance y criterios', 0, AUDIT_LEAD),
          task('Notify the teams involved', 'Avisar a las áreas involucradas', 2, AUDIT_LEAD),
        ],
      },
      {
        name: l('Fieldwork', 'Relevamiento'),
        tasks: [
          task('Review the processes', 'Revisar los procesos', 7, AUDITOR),
          task('Sample supporting documents', 'Muestreo de comprobantes', 12, AUDITOR),
        ],
      },
      {
        name: l('Findings', 'Hallazgos'),
        tasks: [
          task('Findings report', 'Informe de hallazgos', 20, AUDITOR),
          task('Review findings with each team', 'Revisar hallazgos con cada área', 23, AUDIT_LEAD),
        ],
      },
      {
        name: l('Close', 'Cierre'),
        tasks: [
          task('Action plan with owners and dates', 'Plan de acción con responsables y fechas', 25, AUDIT_LEAD),
          task('Close and archive', 'Cierre y archivo', 30, AUDIT_LEAD),
        ],
      },
    ],
  },
];

export const SYSTEM_TEMPLATE_LOCALES = ['en', 'es'] as const;
