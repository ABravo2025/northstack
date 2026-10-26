// SEO pass 3 (2026-10-26): People/HR records and Payroll tracking module pages, EN + ES.
// Facts from the production User Guide (main b2b78b2) and planLimits.ts. Payroll is Growth-only and
// tracking-only: payslips are internal records marked "not valid as a legal document" — never market
// them as legal payslips, and never "liquidación de sueldos" (calculation) or payments.
const G = '<span class="gtag">Growth</span>';

module.exports = [
  // ───────────────────────────── People & HR records ─────────────────────────────
  {
    key: 'hr',
    es: {
      path: 'es/legajo-digital', alt: 'hr-software',
      title: 'Legajo digital y software de RR.HH. — Northstack',
      desc: 'Legajo digital de cada persona con áreas, jefe directo, contratos, campos propios y permisos a medida. Software de RR.HH. para pymes. Gratis 15 días.',
      og: 'El legajo de cada persona con áreas, jefe directo, contratos, campos propios y roles a medida.',
      ldSub: 'Software de RR.HH. y legajo digital', crumb: 'Legajo digital', nav: 'Personas',
      h1: 'El legajo de todo tu equipo, <em class="s">en un solo lugar</em>.',
      lede: 'Cada persona con su ficha completa: área, puesto, jefe directo, fechas, contrato y los campos que tu empresa realmente usa. La misma ficha alimenta ausencias, turnos, proyectos y nómina.',
      cta2: ['#como-funciona', 'Cómo funciona'],
      trust: ['Sin tarjeta de crédito', 'Importación por CSV', 'Para equipos de 5 a 50'],
      mock: { tab: 'Personas', head: 'Personas <small>12 activas · 3 áreas</small>', rows: [
        ['MG', 'Martina Gómez', 'Jefa de Operaciones · Legajo 01001', 'ok', 'Empleada'],
        ['DC', 'Devon Carter', 'Software Engineer · reporta a Martina', 'ok', 'Contratista'],
        ['CM', 'Casey Moreno', 'Empieza el 14 nov · onboarding', 'wait', 'Contrato pendiente'],
        ['JV', 'Jordan Vega', 'Account Executive · Ventas', '', 'Perfil'],
      ] },
      swap: ['Planilla de empleados', 'Carpetas con papeles', 'Datos repetidos en cada sistema'], swapNew: 'Personas en Northstack',
      stepsH2: 'De la planilla al legajo digital, en una tarde.',
      steps: [
        ['Cargás a tu equipo', 'Una por una o importando un CSV. Cada persona con su área, puesto, jefe directo, fechas y los campos personalizados que necesites.'],
        ['Cada uno confirma su contrato', 'Al sumar a un empleado o contratista con sus condiciones de pago, recibe su contrato para confirmarlo, y al confirmarlo se crea su acceso.'],
        ['Definís quién ve qué', 'Roles a medida con permisos por área: quién ve legajos, quién aprueba ausencias, quién ve nómina.'],
      ],
      band: { id: 'roles', eyebrow: 'Roles y permisos', h2: 'Cada uno ve <em class="s" style="color:var(--lilac)">solo lo que le corresponde</em>.',
        lede: 'Además del dueño de la cuenta, armás los roles que tu empresa necesita, desde cero o copiando uno existente, y elegís cada permiso.',
        facts: [
          ['8', 'Permisos agrupados por área', 'Personas, Ventas, Configuración, Equipo, Dinero, Reportes, Espacio de trabajo y Ausencias.'],
          ['↳', 'Jefe directo sin vueltas', 'Northstack no te deja crear ciclos en la línea de reporte, y los pedidos de cada persona le llegan a su jefe.'],
          ['✓', 'Autogestión', 'Cada persona ve y actualiza su propio perfil, sus ausencias, sus turnos y sus recibos.'],
        ],
        visual: `<div class="cal tpl" aria-label="Ejemplo: un rol personalizado">
        <div class="cal-head"><b>Rol: Responsable de sucursal</b><span>Permisos</span></div>
        <div class="tpl-row"><span>Personas</span><b>Ver legajos de su área</b><small>✓</small></div>
        <div class="tpl-row"><span>Ausencias</span><b>Aprobar pedidos</b><small>✓</small></div>
        <div class="tpl-row"><span>Turnos</span><b>Armar el cronograma</b><small>✓</small></div>
        <div class="tpl-row"><span>Dinero</span><b>Ver nómina</b><small>—</small></div>
      </div>` },
      featsEyebrow: 'Software de RR.HH.', featsH2: 'Todo lo que necesitás para gestionar a tu equipo.',
      feats: [
        ['Campos personalizados y etiquetas', 'Sumá los datos que tu empresa usa (talle, obra social, sucursal) y organizá con etiquetas y vistas guardadas.'],
        ['Tipos de persona', 'Perfil, contratista o empleado: cada tipo define qué aplica, por ejemplo si entra en la nómina.'],
        ['Contratos que confirma la persona', 'Las condiciones de pago se envían a cada persona para que las confirme. Mientras tanto, queda marcada como pendiente.'],
        ['Altas y bajas ordenadas', 'Al dar de baja a alguien elegís el último día, se cancelan sus ausencias futuras y sus reportes pasan al jefe que elijas.'],
        ['Cumpleaños y calendario', 'Los cumpleaños y las ausencias del equipo aparecen en el calendario del resumen.'],
        ['Seguridad', 'Verificación en dos pasos con app autenticadora y datos de cada empresa aislados de las demás.'],
      ],
      price: { h2: 'El legajo digital viene en todos los planes.',
        starter: ['Personas, áreas y campos propios', 'Hasta 2 roles personalizados', 'Importación y exportación por CSV'],
        growth: ['Roles personalizados ilimitados', 'Seguimiento de nómina', 'API y webhooks'] },
      faqH2: 'Preguntas sobre el legajo digital.',
      faq: [
        ['¿Puedo importar a mi equipo desde una planilla?', 'Sí. Importás personas desde un CSV y las exportás cuando quieras.'],
        ['¿Qué datos puedo guardar de cada persona?', 'Área, puesto, jefe directo, fechas de ingreso y egreso, tipo de contrato, nacionalidad, país de residencia, cumpleaños, mail personal y laboral, y todos los campos personalizados y etiquetas que agregues.'],
        ['¿Cada empleado necesita un usuario?', 'No. Podés tener personas solo como ficha. Cuando querés que alguien entre a la app, lo invitás desde su perfil y elegís su rol.'],
        ['¿Puedo limitar lo que ve cada persona?', 'Sí. Armás roles con permisos por área. En el plan Starter tenés hasta 2 roles personalizados y en Growth, ilimitados.'],
        ['¿Mis datos están separados de otras empresas?', 'Sí. Los datos de cada empresa están aislados a nivel de base de datos y nunca se comparten con otro espacio.'],
      ],
      finalH2: 'Pasá el legajo de tu equipo a Northstack esta semana.',
    },
    en: {
      path: 'hr-software', alt: 'es/legajo-digital',
      title: 'HR Software & Employee Records — Northstack',
      desc: 'Employee records with departments, managers, contracts, custom fields and custom roles. Simple HR software for small businesses. Free 15-day trial.',
      og: 'Every person’s record with departments, managers, contracts, custom fields and custom roles.',
      ldSub: 'HR software and employee records', crumb: 'HR & employee records', nav: 'People',
      h1: 'Your whole team’s records, <em class="s">in one place</em>.',
      lede: 'Each person with a complete profile: department, job title, manager, dates, contract and the fields your company actually uses. The same record powers time off, shifts, projects and payroll.',
      cta2: ['#how-it-works', 'How it works'],
      trust: ['No credit card', 'CSV import', 'For teams of 5 to 50'],
      mock: { tab: 'People', head: 'People <small>12 active · 3 departments</small>', rows: [
        ['MG', 'Martina Gómez', 'Head of Operations · File 01001', 'ok', 'Employee'],
        ['DC', 'Devon Carter', 'Software Engineer · reports to Martina', 'ok', 'Contractor'],
        ['CM', 'Casey Moreno', 'Starts Nov 14 · onboarding', 'wait', 'Contract pending'],
        ['JV', 'Jordan Vega', 'Account Executive · Sales', '', 'Profile'],
      ] },
      swap: ['Employee spreadsheet', 'Paper files', 'The same data in every tool'], swapNew: 'People in Northstack',
      stepsH2: 'From spreadsheet to employee records, in an afternoon.',
      steps: [
        ['Add your team', 'One by one or from a CSV. Each person with their department, job title, manager, dates and the custom fields you need.'],
        ['Everyone confirms their contract', 'Add an employee or contractor with their pay terms and they get their contract to confirm; confirming it creates their login.'],
        ['Decide who sees what', 'Custom roles with permissions by area: who sees records, who approves time off, who sees payroll.'],
      ],
      band: { id: 'roles', eyebrow: 'Roles & permissions', h2: 'Everyone sees <em class="s" style="color:var(--lilac)">only what they should</em>.',
        lede: 'Besides the account owner, build the roles your company needs, from scratch or by copying one, and pick every permission.',
        facts: [
          ['8', 'Permissions grouped by area', 'People, Sales, Configuration, Team, Money, Reporting, Workspace and Time off.'],
          ['↳', 'Clear reporting lines', 'Northstack won’t let you create loops in the reporting line, and each person’s requests go to their manager.'],
          ['✓', 'Self-service', 'Everyone sees and updates their own profile, time off, shifts and payslips.'],
        ],
        visual: `<div class="cal tpl" aria-label="Example: a custom role">
        <div class="cal-head"><b>Role: Store manager</b><span>Permissions</span></div>
        <div class="tpl-row"><span>People</span><b>View their team’s records</b><small>✓</small></div>
        <div class="tpl-row"><span>Time off</span><b>Approve requests</b><small>✓</small></div>
        <div class="tpl-row"><span>Shifts</span><b>Build the schedule</b><small>✓</small></div>
        <div class="tpl-row"><span>Money</span><b>View payroll</b><small>—</small></div>
      </div>` },
      featsEyebrow: 'HR software', featsH2: 'Everything you need to manage your team.',
      feats: [
        ['Custom fields and tags', 'Add the data your company uses (T-shirt size, health plan, branch) and organize with tags and saved views.'],
        ['Person types', 'Profile, contractor or employee: each type decides what applies, such as whether they appear in payroll.'],
        ['Contracts people confirm', 'Pay terms are sent to each person to confirm. Until then, they’re marked as pending.'],
        ['Tidy on- and offboarding', 'When someone leaves, pick the last day: future time off is cancelled and their reports move to the manager you choose.'],
        ['Birthdays and calendar', 'Team birthdays and time off show up on the overview calendar.'],
        ['Security', 'Two-step verification with an authenticator app, and each company’s data isolated from the others.'],
      ],
      price: { h2: 'Employee records come with every plan.',
        starter: ['People, departments and custom fields', 'Up to 2 custom roles', 'CSV import and export'],
        growth: ['Unlimited custom roles', 'Payroll tracking', 'API and webhooks'] },
      faqH2: 'Questions about employee records.',
      faq: [
        ['Can I import my team from a spreadsheet?', 'Yes. Import people from a CSV and export them whenever you want.'],
        ['What can I store for each person?', 'Department, job title, manager, start and end dates, contract type, nationality, country of residence, birthday, personal and work email, plus any custom fields and tags you add.'],
        ['Does every employee need a login?', 'No. People can be records only. When you want someone in the app, invite them from their profile and pick their role.'],
        ['Can I limit what each person sees?', 'Yes. Build roles with permissions by area. Up to 2 custom roles on Starter and unlimited on Growth.'],
        ['Is my data separate from other companies?', 'Yes. Each company’s data is isolated at the database level and never shared with another workspace.'],
      ],
      finalH2: 'Move your team’s records to Northstack this week.',
    },
  },

  // ───────────────────────────── Payroll tracking ─────────────────────────────
  {
    key: 'payroll',
    es: {
      path: 'es/seguimiento-de-nomina', alt: 'payroll-tracking-software',
      title: 'Seguimiento de nómina para pymes — Northstack',
      desc: 'Registrá compensaciones y liquidaciones por período, con horas del timesheet y recibos numerados. Northstack no mueve dinero. Gratis 15 días.',
      og: 'Compensaciones, liquidaciones por período y recibos numerados en un solo registro. Northstack nunca mueve dinero.',
      ldSub: 'Software de seguimiento de nómina', crumb: 'Seguimiento de nómina', nav: 'Nómina',
      h1: 'Seguimiento de nómina, <em class="s">sin planillas</em>.',
      lede: 'Un registro claro de qué le corresponde a cada persona y qué ya se le pagó. Liquidaciones paso a paso, con las horas aprobadas del timesheet y un recibo numerado para cada uno. Vos seguís pagando como hoy.',
      cta2: ['#como-funciona', 'Cómo funciona'],
      trust: ['Sin tarjeta de crédito', 'Northstack nunca mueve dinero', 'Para equipos de 5 a 50'],
      mock: { tab: 'Recibos', head: 'Liquidación de octubre <small>12 personas · confirmada</small>', rows: [
        ['MG', 'Martina Gómez', 'Recibo 0001-000248 · Mensual', 'ok', 'Emitido'],
        ['DC', 'Devon Carter', 'Recibo 0001-000249 · 162 h aprobadas', 'ok', 'Emitido'],
        ['PS', 'Priya Shah', 'Recibo 0001-000250 · + comisión', 'ok', 'Emitido'],
        ['JV', 'Jordan Vega', 'Pago extraordinario · reintegro', 'wait', 'Borrador'],
      ] },
      swap: ['Planilla de sueldos', 'Recibos armados a mano', 'Horas sumadas a ojo'], swapNew: 'Nómina en Northstack',
      stepsH2: 'Una liquidación en cuatro pasos.',
      steps: [
        ['Personas y horas', 'Creás la liquidación del período y se cargan solas las personas de esa frecuencia. Las horas de quien cobra por hora salen de sus semanas aprobadas en el timesheet.'],
        ['Ajustes', 'Sumás bonos, comisiones, reintegros o deducciones por persona, y ves la diferencia con la liquidación anterior.'],
        ['Confirmás y se emiten los recibos', 'Al confirmar, la liquidación queda cerrada y cada persona recibe su recibo numerado por mail.'],
      ],
      band: { id: 'recibos', eyebrow: 'Recibos numerados', h2: 'Cada recibo con su número y un <em class="s" style="color:var(--lilac)">QR para verificarlo</em>.',
        lede: 'El recibo sigue el modelo del país de tu empresa (Argentina o Estados Unidos), con tu logo y los datos de tu empresa. Son registros internos: no reemplazan los recibos que exige la ley laboral.',
        facts: [
          ['#', 'Numeración correlativa', 'Cada recibo lleva un número (por ejemplo 0001-000248) y cada persona, su número de legajo.'],
          ['QR', 'Verificación sin montos', 'Quien escanea el QR comprueba que el recibo es auténtico, pero nunca ve los importes.'],
          ['🔒', 'Cada uno ve lo suyo', 'Solo el dueño y quien tenga el permiso ven toda la nómina. El resto ve únicamente sus propios recibos.'],
        ],
        visual: `<div class="cal tpl" aria-label="Ejemplo: pasos de una liquidación">
        <div class="cal-head"><b>Liquidación de octubre</b><span>Paso a paso</span></div>
        <div class="tpl-row"><span>Paso 1</span><b>Personas</b><small>12</small></div>
        <div class="tpl-row"><span>Paso 2</span><b>Horas del timesheet</b><small>✓</small></div>
        <div class="tpl-row"><span>Paso 3</span><b>Ajustes</b><small>4</small></div>
        <div class="tpl-row"><span>Paso 4</span><b>Confirmar y emitir recibos</b><small>→</small></div>
      </div>` },
      featsEyebrow: 'Seguimiento de nómina', featsH2: 'Todo lo que pagás, registrado y en orden.',
      feats: [
        ['Historial de compensaciones', 'Sueldo fijo o por hora, moneda y frecuencia, con historial: un aumento crea un registro nuevo y nunca pisa lo anterior.'],
        ['Horas extra y recargos', 'Las horas extra, de descanso o feriado y nocturnas se suman como líneas separadas, con reglas de Argentina, Estados Unidos o propias.'],
        ['Pagos extraordinarios', 'Registrás pagos fuera del ciclo con los mismos tipos de ajuste, y cada uno emite su recibo.'],
        ['Medios de pago de cada persona', 'Transferencia, Mercado Pago, Wise, Payoneer, PayPal o efectivo: cada persona confirma sus datos. Northstack registra, no transfiere.'],
        ['Resumen antes del cierre', 'Ves quién está en nómina, la liquidación en curso y lo que falta: semanas sin aprobar, contratos sin confirmar.'],
        ['Mis recibos', 'Cada persona encuentra sus recibos con los montos y las horas que entraron en cada liquidación.'],
      ],
      price: { h2: 'El seguimiento de nómina está en el plan Growth.',
        starter: ['Legajo digital, ausencias y turnos', 'CRM de ventas y proyectos', 'Sin seguimiento de nómina'],
        growth: ['Seguimiento de nómina completo', 'Recibos numerados con QR', 'Horas extra y recargos'] },
      faqH2: 'Preguntas sobre el seguimiento de nómina.',
      faq: [
        ['¿Northstack les paga a mis empleados?', 'No. Northstack es un registro de compensaciones, liquidaciones y recibos. Nunca procesa ni envía pagos: seguís pagándole a tu equipo con tu banco o tu proveedor de pagos.'],
        ['¿Los recibos tienen validez legal?', 'No. Son documentos internos de seguimiento y lo dicen en el propio recibo. No reemplazan los recibos que exige la ley laboral de cada país.'],
        ['¿Calcula impuestos o aportes?', 'No. Registra lo que vos cargás: sueldos, horas, horas extra según tus reglas, bonos, comisiones, reintegros y deducciones.'],
        ['¿Puedo usar las horas del timesheet?', 'Sí. Para quien cobra por hora, la liquidación trae las horas de sus semanas aprobadas en el timesheet y te avisa si alguien tiene semanas sin aprobar.'],
        ['¿En qué plan está?', 'En el plan Growth. Durante la prueba gratis de 15 días tenés acceso a todo.'],
      ],
      finalH2: 'Dejá la planilla de sueldos este mes.',
    },
    en: {
      path: 'payroll-tracking-software', alt: 'es/seguimiento-de-nomina',
      title: 'Payroll Tracking Software for Small Teams — Northstack',
      desc: 'Track compensation and pay runs by period, with timesheet hours and numbered pay stubs for your team. Northstack never moves money. Free 15-day trial.',
      og: 'Compensation, pay runs and numbered pay stubs in one record. Northstack never moves money.',
      ldSub: 'Payroll tracking software', crumb: 'Payroll tracking', nav: 'Payroll',
      h1: 'Payroll tracking, <em class="s">without spreadsheets</em>.',
      lede: 'A clear record of what each person is owed and what has already been paid. Step-by-step pay runs with approved timesheet hours and a numbered pay stub for everyone. You keep paying the way you do today.',
      cta2: ['#how-it-works', 'How it works'],
      trust: ['No credit card', 'Northstack never moves money', 'For teams of 5 to 50'],
      mock: { tab: 'Pay stubs', head: 'October pay run <small>12 people · confirmed</small>', rows: [
        ['MG', 'Martina Gómez', 'Stub 0001-000248 · Monthly', 'ok', 'Issued'],
        ['DC', 'Devon Carter', 'Stub 0001-000249 · 162 approved hrs', 'ok', 'Issued'],
        ['PS', 'Priya Shah', 'Stub 0001-000250 · + commission', 'ok', 'Issued'],
        ['JV', 'Jordan Vega', 'One-off payment · reimbursement', 'wait', 'Draft'],
      ] },
      swap: ['Payroll spreadsheet', 'Hand-made pay stubs', 'Hours added up by eye'], swapNew: 'Payroll in Northstack',
      stepsH2: 'A pay run in four steps.',
      steps: [
        ['People and hours', 'Create the run for the period and everyone on that frequency loads automatically. Hourly people’s hours come from their approved timesheet weeks.'],
        ['Adjustments', 'Add bonuses, commissions, reimbursements or deductions per person, and see the change against the previous run.'],
        ['Confirm and issue pay stubs', 'Once you confirm, the run is locked and everyone gets their numbered pay stub by email.'],
      ],
      band: { id: 'pay-stubs', eyebrow: 'Numbered pay stubs', h2: 'Every pay stub with its number and a <em class="s" style="color:var(--lilac)">QR code to verify it</em>.',
        lede: 'Pay stubs follow your company’s country (Argentina or the US), with your logo and company details. They’re internal records and don’t replace any payslip required by employment law.',
        facts: [
          ['#', 'Sequential numbering', 'Every stub has a number (for example 0001-000248) and every person a file number.'],
          ['QR', 'Verification without amounts', 'Anyone who scans the QR can check the stub is genuine, but never sees the amounts.'],
          ['🔒', 'Everyone sees their own', 'Only the owner and people with the permission see all of payroll. Everyone else sees only their own pay stubs.'],
        ],
        visual: `<div class="cal tpl" aria-label="Example: pay run steps">
        <div class="cal-head"><b>October pay run</b><span>Step by step</span></div>
        <div class="tpl-row"><span>Step 1</span><b>People</b><small>12</small></div>
        <div class="tpl-row"><span>Step 2</span><b>Timesheet hours</b><small>✓</small></div>
        <div class="tpl-row"><span>Step 3</span><b>Adjustments</b><small>4</small></div>
        <div class="tpl-row"><span>Step 4</span><b>Confirm and issue stubs</b><small>→</small></div>
      </div>` },
      featsEyebrow: 'Payroll tracking', featsH2: 'Everything you pay, recorded and in order.',
      feats: [
        ['Compensation history', 'Fixed or hourly pay, currency and frequency, versioned: a raise creates a new record and never overwrites the old one.'],
        ['Overtime and surcharges', 'Overtime, rest-day or holiday, and night hours become separate lines, using Argentina, US or custom rules.'],
        ['One-off payments', 'Record off-cycle payments with the same adjustment types; each one issues its pay stub.'],
        ['Each person’s payment method', 'Bank transfer, Mercado Pago, Wise, Payoneer, PayPal or cash: each person confirms their details. Northstack records, it doesn’t transfer.'],
        ['Overview before closing', 'See who’s on payroll, the run in progress and what’s left: unapproved weeks and unconfirmed contracts.'],
        ['My pay stubs', 'Everyone finds their own pay stubs, with amounts and the hours that went into each run.'],
      ],
      price: { h2: 'Payroll tracking is on the Growth plan.',
        starter: ['Employee records, time off and shifts', 'Sales CRM and projects', 'No payroll tracking'],
        growth: ['Full payroll tracking', 'Numbered pay stubs with QR', 'Overtime and surcharges'] },
      faqH2: 'Questions about payroll tracking.',
      faq: [
        ['Does Northstack pay my employees?', 'No. Northstack is a record of compensation, pay runs and pay stubs. It never processes or sends payments: you keep paying your team through your bank or payment provider.'],
        ['Are the pay stubs legal documents?', 'No. They’re internal tracking documents and say so on the stub itself. They don’t replace any payslip required by employment law in your country.'],
        ['Does it calculate taxes or withholdings?', 'No. It records what you enter: salaries, hours, overtime under your rules, bonuses, commissions, reimbursements and deductions.'],
        ['Can I use timesheet hours?', 'Yes. For hourly people, the pay run brings in hours from their approved timesheet weeks and tells you who still has weeks waiting for approval.'],
        ['Which plan is it on?', 'The Growth plan. The 15-day free trial includes everything.'],
      ],
      finalH2: 'Retire the payroll spreadsheet this month.',
    },
  },
];
