// SEO pass 2 (2026-10-20): content for the Shifts, CRM and Projects module pages, EN + ES.
// Every claim comes from the in-app User Guide (frontend/src/pages/GuidePage.tsx on main) and the
// plan limits in src/modules/tenant/planLimits.ts. Growth-only features are tagged as such.

const G = { es: '<span class="gtag">Growth</span>', en: '<span class="gtag">Growth</span>' };

module.exports = [
  // ───────────────────────────── Shifts & time tracking ─────────────────────────────
  {
    key: 'shifts',
    es: {
      path: 'es/control-horario', alt: 'employee-scheduling-software',
      title: 'Software de turnos y control horario para pymes — Northstack',
      desc: 'Armá turnos por sede, confirmalos por mail, registrá horas en un timesheet y aprobalas por semana. Fichaje con QR. Probalo gratis 15 días.',
      og: 'Turnos por sede, confirmaciones, timesheet semanal, aprobaciones y fichaje con QR en un solo lugar.',
      ldSub: 'Software de turnos y control horario', crumb: 'Turnos y control horario', nav: 'Turnos',
      h1: 'Turnos y control horario, <em class="s">sin planillas</em>.',
      lede: 'Armá el cronograma de cada sede, que cada persona confirme su turno con un clic y que las horas trabajadas lleguen solas al timesheet para aprobarlas cada semana.',
      cta2: ['#como-funciona', 'Cómo funciona'],
      trust: ['Sin tarjeta de crédito', 'Turnos nocturnos incluidos', 'Para equipos de 5 a 50'],
      mock: { tab: 'Cronograma', head: 'Semana del 19 oct <small>Sucursal Centro</small>', rows: [
        ['MG', 'Martina Gómez', 'Lun 08:00–16:00 · Caja', 'ok', 'Confirmado'],
        ['DC', 'Devon Carter', 'Lun 16:00–00:00 · Depósito', 'ok', 'Confirmado'],
        ['JV', 'Jordan Vega', 'Mar 22:00–06:00 · Seguridad', 'wait', 'Sin respuesta'],
        ['PS', 'Priya Shah', 'Mié 08:00–16:00 · Caja', 'no', 'No puede'],
      ] },
      swap: ['Planilla de turnos', 'Grupo de WhatsApp para cubrir', 'Horas sumadas a mano'], swapNew: 'Turnos en Northstack',
      stepsH2: 'Del cronograma a las horas aprobadas, en una semana.',
      steps: [
        ['Armás el cronograma', 'Elegís la sede, el horario (también de 22 a 6), el puesto y cuánta gente hace falta. Los turnos quedan en borrador hasta que publicás la semana.'],
        ['Tu equipo confirma', 'Cada persona recibe un mail con “Voy” y “No puedo”, sin iniciar sesión, y un archivo para sumarlo a Google, Outlook o Apple Calendar.'],
        ['Las horas se aprueban', 'Al terminar la semana cada uno envía su timesheet y su responsable lo aprueba o lo devuelve con una nota.'],
      ],
      band: { id: 'fichaje', eyebrow: 'Control horario', h2: 'Quién llegó, quién está en pausa y <em class="s" style="color:var(--lilac)">quién falta</em>.',
        lede: 'Con el fichaje, cada persona marca entrada, pausas y salida escaneando el QR de la sede con su propio celular o desde la app.',
        facts: [
          ['QR', 'QR en la entrada', 'Lo imprimís y lo pegás en la puerta. Opcionalmente pedís la ubicación dentro de un radio que vos definís.'],
          ['✓', 'Las horas fichadas van al timesheet', 'Lo que se fichó es lo que el timesheet sugiere para ese turno. Las correcciones piden un motivo y quedan registradas.'],
          ['!', 'Llegadas tarde y ausencias', 'El reporte por persona suma horas fichadas, llegadas tarde y ausencias. Los responsables reciben un resumen diario.'],
        ],
        visual: `<div class="cal att" aria-label="Ejemplo: asistencia de hoy">
        <div class="cal-head"><b>Hoy · Sucursal Centro</b><span>Fichaje ${G.es}</span></div>
        <div class="att-row"><span class="av">MG</span><div><b>Martina Gómez</b><small>Entró 07:56</small></div><span class="pill-s in">Trabajando</span></div>
        <div class="att-row"><span class="av">DC</span><div><b>Devon Carter</b><small>Pausa desde 12:10</small></div><span class="pill-s brk">En pausa</span></div>
        <div class="att-row"><span class="av">JV</span><div><b>Jordan Vega</b><small>Entró 08:17 · turno 08:00</small></div><span class="pill-s late">Tarde</span></div>
        <div class="att-row"><span class="av">PS</span><div><b>Priya Shah</b><small>Turno 08:00</small></div><span class="pill-s miss">Falta</span></div>
      </div>` },
      featsEyebrow: 'Turnos y timesheet', featsH2: 'Todo lo que necesitás para organizar los horarios del equipo.',
      feats: [
        ['Avisos antes de asignar', 'Si alguien ya tiene un turno, está de vacaciones, es feriado, marcó que no está disponible o le faltaría descanso, lo ves antes de asignarlo.'],
        ['Cambios y turnos abiertos', 'Cada persona puede ofrecer su turno o cambiarlo con un compañero. Por defecto, los cambios los aprueba quien arma los turnos.'],
        ['Timesheet que se completa solo', 'Sugiere horas a partir de turnos terminados, tareas completadas, videollamadas y eventos de Google Calendar. Nada se carga sin que lo confirmes.'],
        ['Reportes de horas', 'El mes completo por persona, empresa o proyecto: turnos planificados, horas registradas, aprobadas y facturables, con descarga en CSV.'],
        ['Cronograma sugerido ' + G.es, 'Propone quién puede cubrir los turnos de la semana sin cruzarse con vacaciones, feriados ni descansos, repartiendo las horas de forma pareja.'],
        ['Habilidades y certificaciones ' + G.es, 'Marcás qué requiere cada turno y quién lo tiene, con fecha de vencimiento. Te avisa antes de que venza.'],
      ],
      price: { h2: 'Turnos y timesheet vienen en todos los planes.',
        starter: ['Turnos y timesheet en 1 sede', 'Cambios de turno y turnos abiertos', 'Reportes de horas en CSV'],
        growth: ['Sedes ilimitadas', 'Fichaje con QR o desde la app', 'Horas facturables e informe para clientes'] },
      faqH2: 'Preguntas sobre turnos y control horario.',
      faq: [
        ['¿Puedo armar turnos nocturnos?', 'Sí. Un turno de 22:00 a 06:00 termina al día siguiente y se muestra así en el cronograma. Cada sede tiene su propia zona horaria.'],
        ['¿Cómo se entera cada persona de su turno?', 'Cuando publicás la semana, recibe una notificación y un mail con los botones “Voy” y “No puedo”, que funcionan sin iniciar sesión, y un archivo para agregarlo a su calendario. Si conectó Google Calendar, el turno aparece solo.'],
        ['¿Cómo funciona el fichaje?', 'Para cada sede elegís cómo se ficha: escaneando el QR de la sede con el celular, desde la app o de las dos formas, y si querés pedís la ubicación. Si alguien ficha sin turno, se agrega un turno extra al cronograma. El fichaje está en el plan Growth.'],
        ['¿Quién aprueba las horas?', 'El jefe directo de cada persona o quien tenga el permiso de aprobar timesheets. Una semana aprobada queda cerrada; para corregirla se pide un ajuste con motivo.'],
        ['¿Puedo tener varias sedes?', 'En el plan Starter, 1 sede activa. En Growth, ilimitadas, cada una con su responsable, que puede armar los turnos de su sede.'],
        ['¿Puedo facturar las horas a mis clientes?', 'Sí, en el plan Growth. Marcás las horas como facturables y, agrupando por empresa, generás un informe mensual en PDF o un link privado para el cliente.'],
      ],
      finalH2: 'Publicá los turnos de la semana que viene en una tarde.',
    },
    en: {
      path: 'employee-scheduling-software', alt: 'es/control-horario',
      title: 'Employee Scheduling & Timesheet Software — Northstack',
      desc: 'Schedule shifts by location, get them confirmed by email, log hours in a weekly timesheet and approve them. QR clock-in. Free 15-day trial.',
      og: 'Shifts by location, confirmations, weekly timesheets, approvals and QR clock-in in one place.',
      ldSub: 'Employee scheduling and timesheet software', crumb: 'Shifts & timesheets', nav: 'Shifts',
      h1: 'Employee scheduling and timesheets, <em class="s">without spreadsheets</em>.',
      lede: 'Build each location’s schedule, let people confirm their shift in one click, and have worked hours flow into a timesheet you approve every week.',
      cta2: ['#how-it-works', 'How it works'],
      trust: ['No credit card', 'Overnight shifts included', 'For teams of 5 to 50'],
      mock: { tab: 'Schedule', head: 'Week of Oct 19 <small>Downtown store</small>', rows: [
        ['MG', 'Martina Gómez', 'Mon 8:00–16:00 · Front desk', 'ok', 'Confirmed'],
        ['DC', 'Devon Carter', 'Mon 16:00–0:00 · Warehouse', 'ok', 'Confirmed'],
        ['JV', 'Jordan Vega', 'Tue 22:00–6:00 · Security', 'wait', 'No answer'],
        ['PS', 'Priya Shah', 'Wed 8:00–16:00 · Front desk', 'no', 'Can’t make it'],
      ] },
      swap: ['Shift spreadsheet', 'Group chats to find cover', 'Adding up hours by hand'], swapNew: 'Shifts in Northstack',
      stepsH2: 'From schedule to approved hours, every week.',
      steps: [
        ['Build the schedule', 'Pick the location, the hours (overnight too), the position and how many people you need. Shifts stay drafts until you publish the week.'],
        ['Your team confirms', 'Everyone gets an email with “I’ll be there” and “I can’t make it”, no sign-in needed, plus a file that adds it to Google, Outlook or Apple Calendar.'],
        ['Hours get approved', 'At the end of the week each person sends their timesheet, and their manager approves it or sends it back with a note.'],
      ],
      band: { id: 'clock-in', eyebrow: 'Time tracking', h2: 'Who’s in, who’s on a break and <em class="s" style="color:var(--lilac)">who’s missing</em>.',
        lede: 'With clock-in, people punch in, take breaks and clock out by scanning the location’s QR code with their own phone, or from the app.',
        facts: [
          ['QR', 'A QR code at the door', 'Print it and put it at the entrance. Optionally ask for their position within a radius you set.'],
          ['✓', 'Clocked time feeds the timesheet', 'What was clocked is what the timesheet suggests for that shift. Corrections need a reason and are recorded.'],
          ['!', 'Late arrivals and absences', 'Reports by person add clocked hours, late arrivals and absences. Schedulers get a daily attendance summary.'],
        ],
        visual: `<div class="cal att" aria-label="Example: today's attendance">
        <div class="cal-head"><b>Today · Downtown store</b><span>Clock-in ${G.en}</span></div>
        <div class="att-row"><span class="av">MG</span><div><b>Martina Gómez</b><small>In at 7:56</small></div><span class="pill-s in">Working</span></div>
        <div class="att-row"><span class="av">DC</span><div><b>Devon Carter</b><small>On break since 12:10</small></div><span class="pill-s brk">On break</span></div>
        <div class="att-row"><span class="av">JV</span><div><b>Jordan Vega</b><small>In at 8:17 · shift 8:00</small></div><span class="pill-s late">Late</span></div>
        <div class="att-row"><span class="av">PS</span><div><b>Priya Shah</b><small>Shift 8:00</small></div><span class="pill-s miss">Missing</span></div>
      </div>` },
      featsEyebrow: 'Shifts & timesheets', featsH2: 'Everything you need to run your team’s schedule.',
      feats: [
        ['Warnings before you assign', 'If someone already has a shift, is on time off, it’s a holiday, they said they’re unavailable or they’d get too little rest, you see it before assigning.'],
        ['Swaps and open shifts', 'People can offer a shift to colleagues or swap with someone. By default, a scheduler approves swaps.'],
        ['A timesheet that fills itself', 'It suggests hours from finished shifts, completed tasks, video calls and Google Calendar events. Nothing is logged until you confirm.'],
        ['Hours reports', 'The whole month by person, company or project: planned shifts and logged, approved and billable hours, with a CSV download.'],
        ['Suggested schedule ' + G.en, 'Proposes who can cover the week’s shifts without clashing with time off, holidays or rest rules, and spreads hours evenly.'],
        ['Skills and certifications ' + G.en, 'Mark what each shift requires and who holds it, with an expiry date. You’re reminded before it expires.'],
      ],
      price: { h2: 'Shifts and timesheets come with every plan.',
        starter: ['Shifts and timesheets at 1 location', 'Shift swaps and open shifts', 'Hours reports with CSV export'],
        growth: ['Unlimited locations', 'QR or in-app clock-in', 'Billable hours and client reports'] },
      faqH2: 'Questions about scheduling and timesheets.',
      faq: [
        ['Can I schedule overnight shifts?', 'Yes. A 22:00–06:00 shift ends the next day and shows that way on the schedule. Each location has its own time zone.'],
        ['How do people find out about their shift?', 'When you publish the week, they get a notification and an email with “I’ll be there” and “I can’t make it” buttons that work without signing in, plus a file to add it to their calendar. If they connected Google Calendar, the shift appears there on its own.'],
        ['How does clock-in work?', 'For each location you choose how people clock in: by scanning the location’s QR code with their phone, from the app, or both, optionally checking their position. Clocking in without a shift adds an overtime shift to the schedule. Clock-in is on the Growth plan.'],
        ['Who approves the hours?', 'Each person’s direct manager, or anyone allowed to approve timesheets. An approved week is closed; corrections go through an adjustment request with a reason.'],
        ['Can I have several locations?', 'One active location on the Starter plan and unlimited on Growth, each with its own manager who can schedule that location.'],
        ['Can I bill hours to my clients?', 'Yes, on the Growth plan. Mark hours as billable and, grouped by company, create a monthly client report as a PDF or a private link.'],
      ],
      finalH2: 'Publish next week’s schedule this afternoon.',
    },
  },

  // ───────────────────────────── CRM ─────────────────────────────
  {
    key: 'crm',
    es: {
      path: 'es/crm-para-pymes', alt: 'crm-for-small-business',
      title: 'CRM para pymes: pipeline de ventas simple — Northstack',
      desc: 'CRM simple para pymes: empresas, contactos y oportunidades en pipelines con tus propias etapas, vista Kanban y pronóstico. Probalo gratis 15 días.',
      og: 'Empresas, contactos y oportunidades en pipelines con tus propias etapas, vista Kanban y pronóstico de ventas.',
      ldSub: 'CRM de ventas para pymes', crumb: 'CRM de ventas', nav: 'CRM',
      h1: 'Un CRM para pymes que tu equipo <em class="s">sí va a usar</em>.',
      lede: 'Empresas, contactos y oportunidades avanzando por las etapas que vos definís. Sin configuraciones eternas: tu pipeline andando en una tarde.',
      cta2: ['#como-funciona', 'Cómo funciona'],
      trust: ['Sin tarjeta de crédito', 'Vista Kanban y en grilla', 'Para equipos de 5 a 50'],
      mockKanban: { tab: 'Pipeline', head: 'Pipeline de ventas <small>US$ 78.200 abiertos</small>', cols: [
        ['Lead', [['Andes Logistics', 'US$ 12.000 · 10%'], ['Mercado Norte', 'US$ 24.500 · 10%', true]]],
        ['Propuesta', [['Globant Studio', 'US$ 31.000 · 60%'], ['Río Tech', 'US$ 10.700 · 60%']]],
        ['Ganada', [['Sur Capital', 'US$ 18.900 · 100%']]],
      ] },
      swap: ['Planilla de clientes', 'Seguimientos en la memoria', 'Un CRM caro que nadie abre'], swapNew: 'CRM en Northstack',
      stepsH2: 'Del primer contacto a la venta cerrada.',
      steps: [
        ['Diseñás tu pipeline', 'Creás las etapas que usa tu equipo, cada una con su color y su probabilidad de cierre. Podés tener un pipeline de leads y otro de cuentas.'],
        ['Cargás y movés oportunidades', 'Cada oportunidad tiene monto, moneda, fecha estimada de cierre, el próximo paso y los contactos que participan. La arrastrás de etapa en el Kanban.'],
        ['Cerrás con motivo', 'Al marcarla como ganada o perdida se pide el motivo, así sabés por qué ganás y por qué perdés.'],
      ],
      band: { id: 'pronostico', eyebrow: 'Pronóstico de ventas', h2: 'Cuánto de tu pipeline <em class="s" style="color:var(--lilac)">se va a cerrar de verdad</em>.',
        lede: 'Cada etapa abierta tiene una probabilidad de cierre. Northstack suma cada oportunidad por su probabilidad y te muestra un valor ponderado arriba del pipeline.',
        facts: [
          ['%', 'Valor ponderado', 'Monto de cada oportunidad abierta por la probabilidad de su etapa: una lectura rápida de lo que realmente puede entrar.'],
          ['↻', 'Asignación automática', 'Las oportunidades nuevas se reparten por turnos entre las personas que elijas, por área o al dueño de la cuenta.'],
          ['⏱', 'Oportunidades estancadas', 'Si una oportunidad pasa X días sin cambiar de etapa, su responsable recibe un aviso.'],
        ],
        visual: `<div class="cal fc" aria-label="Ejemplo: pronóstico ponderado">
        <div class="cal-head"><b>Pronóstico ponderado</b><span>Oportunidades abiertas</span></div>
        <div class="fc-row"><span>Lead · 10%</span><i style="--w:12%"></i><b>US$ 3.650</b></div>
        <div class="fc-row"><span>Propuesta · 60%</span><i style="--w:56%"></i><b>US$ 25.020</b></div>
        <div class="fc-row"><span>Negociación · 80%</span><i style="--w:40%"></i><b>US$ 12.630</b></div>
        <div class="calc-line"><span>Total ponderado</span><b>US$ 41.300</b></div>
      </div>` },
      featsEyebrow: 'CRM simple', featsH2: 'Lo que necesita un equipo de ventas chico, sin lo que sobra.',
      feats: [
        ['Empresas y contactos', 'Cada empresa con su industria, tamaño, dueño de la cuenta y empresas relacionadas. Cada contacto con su estado de lead y su origen.'],
        ['Kanban y grilla', 'Arrastrá oportunidades entre etapas o trabajá en una grilla con vistas guardadas, etiquetas y campos personalizados.'],
        ['Tareas y notas en cada registro', 'Seguimientos con fecha en cualquier empresa, contacto u oportunidad, con link de Google Meet si hace falta.'],
        ['Formularios públicos', 'Un link para captar leads desde tu web, sin login. Cada envío puede crear una oportunidad en el pipeline que elijas.'],
        ['De lead a cuenta', 'Al ganar una oportunidad en el pipeline de leads, la pasás a un pipeline de cuentas para seguir la relación.'],
        ['Importación por CSV', 'Traé tus empresas y contactos desde una planilla en minutos, y exportalos cuando quieras.'],
      ],
      price: { h2: 'El CRM viene en todos los planes.',
        starter: ['Hasta 2 pipelines', 'Empresas, contactos y oportunidades', 'Tareas, notas y formularios públicos'],
        growth: ['Pipelines ilimitados', 'API y webhooks', 'Roles personalizados ilimitados'] },
      faqH2: 'Preguntas sobre el CRM.',
      faq: [
        ['¿Puedo tener más de un pipeline?', 'Sí. Hay pipelines de leads (la empresa es opcional) y de cuentas (para empresas que ya identificaste). En el plan Starter tenés hasta 2 y en Growth, ilimitados.'],
        ['¿Puedo definir mis propias etapas?', 'Sí. Cada pipeline tiene sus etapas, con nombre, color, resultado (abierta, ganada o perdida) y, para las abiertas, una probabilidad de cierre que se usa en el pronóstico.'],
        ['¿Cómo se reparten las oportunidades nuevas?', 'Cada pipeline puede asignar el responsable automáticamente: por turnos entre las personas que elijas, por área o al dueño de la cuenta. También podés asignarlo a mano.'],
        ['¿Puedo importar mis clientes desde una planilla?', 'Sí. Importás empresas y contactos por CSV y los exportás cuando quieras.'],
        ['¿El CRM está conectado con el resto de Northstack?', 'Sí. Las empresas del CRM son las mismas que usás en Proyectos y en los reportes de horas, así que nada se carga dos veces.'],
      ],
      finalH2: 'Armá tu pipeline de ventas esta semana.',
    },
    en: {
      path: 'crm-for-small-business', alt: 'es/crm-para-pymes',
      title: 'Simple CRM for Small Business — Northstack',
      desc: 'A simple CRM for small businesses: companies, contacts and deals in pipelines with your own stages, Kanban view and forecasting. Free 15-day trial.',
      og: 'Companies, contacts and deals in pipelines with your own stages, Kanban view and sales forecasting.',
      ldSub: 'Sales CRM for small business', crumb: 'Sales CRM', nav: 'CRM',
      h1: 'A small-business CRM your team <em class="s">will actually use</em>.',
      lede: 'Companies, contacts and deals moving through the stages you define. No endless setup: your pipeline up and running in an afternoon.',
      cta2: ['#how-it-works', 'How it works'],
      trust: ['No credit card', 'Kanban and grid views', 'For teams of 5 to 50'],
      mockKanban: { tab: 'Pipeline', head: 'Sales pipeline <small>$78,200 open</small>', cols: [
        ['Lead', [['Andes Logistics', '$12,000 · 10%'], ['Mercado Norte', '$24,500 · 10%', true]]],
        ['Proposal', [['Globant Studio', '$31,000 · 60%'], ['Río Tech', '$10,700 · 60%']]],
        ['Won', [['Sur Capital', '$18,900 · 100%']]],
      ] },
      swap: ['Customer spreadsheet', 'Follow-ups from memory', 'An expensive CRM nobody opens'], swapNew: 'CRM in Northstack',
      stepsH2: 'From first contact to closed deal.',
      steps: [
        ['Design your pipeline', 'Create the stages your team uses, each with its color and win probability. Keep a leads pipeline and an accounts pipeline.'],
        ['Add and move deals', 'Each deal has an amount, currency, expected close date, a next step and the contacts involved. Drag it across stages on the Kanban board.'],
        ['Close with a reason', 'Marking a deal won or lost asks for the reason, so you learn why you win and why you lose.'],
      ],
      band: { id: 'forecast', eyebrow: 'Sales forecasting', h2: 'How much of your pipeline <em class="s" style="color:var(--lilac)">will really close</em>.',
        lede: 'Every open stage has a win probability. Northstack multiplies each deal by it and shows a weighted value above the pipeline.',
        facts: [
          ['%', 'Weighted value', 'Each open deal’s amount × its stage’s probability: a quick read on what is realistically coming in.'],
          ['↻', 'Auto-assignment', 'New deals rotate among the people you choose, by department, or go to the account owner.'],
          ['⏱', 'Stalled deals', 'If a deal sits in a stage for too many days, its owner gets a heads-up.'],
        ],
        visual: `<div class="cal fc" aria-label="Example: weighted forecast">
        <div class="cal-head"><b>Weighted forecast</b><span>Open deals</span></div>
        <div class="fc-row"><span>Lead · 10%</span><i style="--w:12%"></i><b>$3,650</b></div>
        <div class="fc-row"><span>Proposal · 60%</span><i style="--w:56%"></i><b>$25,020</b></div>
        <div class="fc-row"><span>Negotiation · 80%</span><i style="--w:40%"></i><b>$12,630</b></div>
        <div class="calc-line"><span>Weighted total</span><b>$41,300</b></div>
      </div>` },
      featsEyebrow: 'Simple CRM', featsH2: 'What a small sales team needs, without the bloat.',
      feats: [
        ['Companies and contacts', 'Each company with its industry, size, account owner and related companies. Each contact with a lead status and source.'],
        ['Kanban and grid', 'Drag deals between stages or work in a grid with saved views, tags and custom fields.'],
        ['Tasks and notes on every record', 'Dated follow-ups on any company, contact or deal, with a Google Meet link when you need one.'],
        ['Public forms', 'A no-login link to capture leads from your website. Each submission can create a deal in the pipeline you choose.'],
        ['From lead to account', 'Win a deal in a leads pipeline and carry it into an accounts pipeline to keep tracking the relationship.'],
        ['CSV import', 'Bring your companies and contacts over from a spreadsheet in minutes, and export them anytime.'],
      ],
      price: { h2: 'The CRM comes with every plan.',
        starter: ['Up to 2 pipelines', 'Companies, contacts and deals', 'Tasks, notes and public forms'],
        growth: ['Unlimited pipelines', 'API and webhooks', 'Unlimited custom roles'] },
      faqH2: 'Questions about the CRM.',
      faq: [
        ['Can I have more than one pipeline?', 'Yes. There are leads pipelines (company optional) and accounts pipelines (for companies you’ve already identified). Up to 2 on Starter and unlimited on Growth.'],
        ['Can I define my own stages?', 'Yes. Each pipeline has its own stages, with a name, a color, an outcome (open, won or lost) and, for open stages, a win probability used in the forecast.'],
        ['How are new deals assigned?', 'Each pipeline can assign the owner automatically: round robin among people you choose, by department, or to the account owner. You can also pick by hand.'],
        ['Can I import my customers from a spreadsheet?', 'Yes. Import companies and contacts from CSV and export them whenever you want.'],
        ['Is the CRM connected to the rest of Northstack?', 'Yes. CRM companies are the same ones you use in Projects and in hours reports, so nothing is typed twice.'],
      ],
      finalH2: 'Set up your sales pipeline this week.',
    },
  },

  // ───────────────────────────── Projects ─────────────────────────────
  {
    key: 'projects',
    es: {
      path: 'es/gestion-de-proyectos', alt: 'project-management-software',
      title: 'Software de gestión de proyectos para pymes — Northstack',
      desc: 'Organizá proyectos por fases, con tareas, responsables y fechas, desde cero o con plantillas para agencias, estudios y consultoras. Gratis 15 días.',
      og: 'Proyectos por fases con tareas, responsables y fechas, desde cero o con plantillas listas para usar.',
      ldSub: 'Software de gestión de proyectos', crumb: 'Proyectos', nav: 'Proyectos',
      h1: 'Gestión de proyectos simple, <em class="s">fase por fase</em>.',
      lede: 'Organizá el trabajo de tu equipo en fases, con tareas, responsables y fechas, para un cliente o interno. Empezá de cero o con una plantilla y tenelo andando en minutos.',
      cta2: ['#como-funciona', 'Cómo funciona'],
      trust: ['Sin tarjeta de crédito', 'Plantillas listas para usar', 'Para equipos de 5 a 50'],
      mockProject: { tab: 'Proyecto', head: 'Cierre mensual · Pampa Foods <small>Estudio contable</small>', pct: 62, done: '8 de 13 tareas', phases: [
        ['Relevamiento', 'Completa', 'ok'], ['Liquidación de impuestos', 'En curso · vence el 24 oct', 'wait'], ['Presentación', 'Próxima', ''] ] },
      swap: ['Planilla de proyectos', 'Tareas perdidas en el chat', 'Fechas que nadie recuerda'], swapNew: 'Proyectos en Northstack',
      stepsH2: 'De la plantilla al proyecto andando, en minutos.',
      steps: [
        ['Elegís el punto de partida', 'Proyecto en blanco o una plantilla para agencias, estudios contables, consultoras o proyectos internos.'],
        ['Asignás el equipo', 'Indicás quién cumple cada rol de la plantilla (por ejemplo, quién es el contador) y ves todas las tareas con su fecha antes de crear nada.'],
        ['Avanzás fase por fase', 'Marcás tareas, las movés entre fases en el tablero y seguís el progreso del proyecto de un vistazo.'],
      ],
      band: { id: 'plantillas', eyebrow: 'Plantillas', h2: 'Proyectos que repetís, <em class="s" style="color:var(--lilac)">armados en un clic</em>.',
        lede: 'Las fechas salen de la fecha de inicio: una tarea “día +5” vence cinco días después. Las tareas van a la persona que cumple cada rol.',
        facts: [
          ['A', 'Agencias', 'Sitio web y campaña mensual.'],
          ['$', 'Estudios contables', 'Cierre mensual, declaración anual y alta de cliente nuevo.'],
          ['C', 'Consultoras', 'Implementación y onboarding de clientes, además de plantillas para proyectos internos.'],
        ],
        visual: `<div class="cal tpl" aria-label="Ejemplo: vista previa de una plantilla">
        <div class="cal-head"><b>Alta de cliente nuevo</b><span>Vista previa</span></div>
        <div class="tpl-row"><span>Día +0</span><b>Reunión de inicio</b><small>Socio</small></div>
        <div class="tpl-row"><span>Día +2</span><b>Pedido de documentación</b><small>Contador</small></div>
        <div class="tpl-row"><span>Día +5</span><b>Alta en organismos</b><small>Contador</small></div>
        <div class="tpl-row"><span>Día +10</span><b>Primer informe</b><small>Socio</small></div>
      </div>` },
      featsEyebrow: 'Gestión de proyectos', featsH2: 'Todo para que el trabajo salga a tiempo.',
      feats: [
        ['Fases, tareas y tablero', 'Cada fase con sus tareas. Las marcás como hechas, las editás y las movés entre fases arrastrándolas en el tablero.'],
        ['Chat en cada tarea', 'Cada tarea tiene su conversación. Con @ mencionás a cualquier persona de la empresa y le llega un aviso que abre la tarea.'],
        ['Todo en tu calendario', 'Las tareas del proyecto aparecen en Mis tareas, en el calendario y en Google Calendar si lo conectaste. Con link de Google Meet cuando hace falta.'],
        ['Equipo y permisos', 'Sumás personas con su rol en el proyecto. Cada uno ve los proyectos que tiene a cargo o en los que participa.'],
        ['Tus propias plantillas ' + G.es, 'Guardás cualquier proyecto como plantilla: las fechas pasan a “días desde el inicio” y cada responsable, a su rol.'],
        ['Presupuesto de horas ' + G.es, 'Comparás las horas registradas con el presupuesto del proyecto y te avisa al llegar al 80% y al 100%.'],
      ],
      price: { h2: 'Proyectos viene en todos los planes.',
        starter: ['Hasta 5 proyectos abiertos', 'Plantillas listas para usar', 'Tareas con chat y Google Meet'],
        growth: ['Proyectos ilimitados', 'Tus propias plantillas', 'Presupuesto de horas e informe para clientes'] },
      faqH2: 'Preguntas sobre proyectos.',
      faq: [
        ['¿Qué plantillas trae?', 'Plantillas para agencias (sitio web, campaña mensual), estudios contables (cierre mensual, declaración anual, alta de cliente nuevo), consultoras (implementación, onboarding de clientes) y proyectos internos. También podés empezar en blanco.'],
        ['¿Puedo crear mis propias plantillas?', 'Sí, en el plan Growth. Desde cualquier proyecto elegís “Guardar como plantilla” y se copian sus fases y tareas.'],
        ['¿Cuántos proyectos puedo tener?', 'En el plan Starter, hasta 5 proyectos abiertos a la vez; los completados, cancelados y archivados no cuentan. En Growth, ilimitados.'],
        ['¿Puedo vincular un proyecto a un cliente?', 'Sí. Cada proyecto puede ser para una empresa de tu CRM o interno, y cada empresa muestra sus proyectos.'],
        ['¿Se puede llevar el tiempo de cada proyecto?', 'Sí. Las horas del timesheet se registran por proyecto y los reportes las muestran por proyecto o por cliente. Con Growth sumás presupuesto de horas e informes para clientes.'],
      ],
      finalH2: 'Arrancá tu próximo proyecto desde una plantilla.',
    },
    en: {
      path: 'project-management-software', alt: 'es/gestion-de-proyectos',
      title: 'Project Management Software for Small Teams — Northstack',
      desc: 'Organize projects in phases with tasks, owners and dates, from scratch or from templates for agencies, accounting firms and consultancies. Free trial.',
      og: 'Projects in phases with tasks, owners and dates, from scratch or from ready-made templates.',
      ldSub: 'Project management software', crumb: 'Projects', nav: 'Projects',
      h1: 'Simple project management, <em class="s">phase by phase</em>.',
      lede: 'Organize your team’s work in phases, with tasks, owners and dates, for a client or internal. Start blank or from a template and be up and running in minutes.',
      cta2: ['#how-it-works', 'How it works'],
      trust: ['No credit card', 'Ready-made templates', 'For teams of 5 to 50'],
      mockProject: { tab: 'Project', head: 'Monthly close · Pampa Foods <small>Accounting firm</small>', pct: 62, done: '8 of 13 tasks', phases: [
        ['Discovery', 'Done', 'ok'], ['Tax filings', 'In progress · due Oct 24', 'wait'], ['Delivery', 'Up next', ''] ] },
      swap: ['Project spreadsheet', 'Tasks lost in chat', 'Dates nobody remembers'], swapNew: 'Projects in Northstack',
      stepsH2: 'From template to running project, in minutes.',
      steps: [
        ['Pick a starting point', 'A blank project or a template for agencies, accounting firms, consultancies or internal work.'],
        ['Assign the team', 'Say who fills each of the template’s roles (for example, who the accountant is) and preview every task with its date before anything is created.'],
        ['Move phase by phase', 'Check off tasks, drag them between phases on the board and see the project’s progress at a glance.'],
      ],
      band: { id: 'templates', eyebrow: 'Templates', h2: 'Projects you repeat, <em class="s" style="color:var(--lilac)">set up in one click</em>.',
        lede: 'Dates come from the start date: a “day +5” task is due five days later. Tasks go to whoever fills each role.',
        facts: [
          ['A', 'Agencies', 'Website and monthly campaign.'],
          ['$', 'Accounting firms', 'Monthly close, annual return and new client setup.'],
          ['C', 'Consultancies', 'Implementation and client onboarding, plus templates for internal projects.'],
        ],
        visual: `<div class="cal tpl" aria-label="Example: a template preview">
        <div class="cal-head"><b>New client setup</b><span>Preview</span></div>
        <div class="tpl-row"><span>Day +0</span><b>Kickoff meeting</b><small>Partner</small></div>
        <div class="tpl-row"><span>Day +2</span><b>Request documents</b><small>Accountant</small></div>
        <div class="tpl-row"><span>Day +5</span><b>Registrations</b><small>Accountant</small></div>
        <div class="tpl-row"><span>Day +10</span><b>First report</b><small>Partner</small></div>
      </div>` },
      featsEyebrow: 'Project management', featsH2: 'Everything you need to deliver on time.',
      feats: [
        ['Phases, tasks and board', 'Each phase with its tasks. Check them off, edit them, and drag them between phases on the board.'],
        ['Chat on every task', 'Every task has its own conversation. Type @ to mention anyone in the company and they get a notification that opens the task.'],
        ['Everything on your calendar', 'Project tasks show up in My Tasks, on the calendar and in Google Calendar if you connected it, with a Google Meet link when needed.'],
        ['Team and permissions', 'Add people with their project role. Everyone sees the projects they own or are a member of.'],
        ['Your own templates ' + G.en, 'Save any project as a template: due dates become “days from the start” and each assignee becomes their role.'],
        ['Hour budgets ' + G.en, 'Compare logged hours with the project’s budget and get notified at 80% and 100%.'],
      ],
      price: { h2: 'Projects come with every plan.',
        starter: ['Up to 5 open projects', 'Ready-made templates', 'Tasks with chat and Google Meet'],
        growth: ['Unlimited projects', 'Your own templates', 'Hour budgets and client reports'] },
      faqH2: 'Questions about projects.',
      faq: [
        ['Which templates are included?', 'Templates for agencies (website, monthly campaign), accounting firms (monthly close, annual return, new client setup), consultancies (implementation, client onboarding) and internal projects. You can also start blank.'],
        ['Can I create my own templates?', 'Yes, on the Growth plan. From any project choose “Save as template” and its phases and tasks are copied.'],
        ['How many projects can I have?', 'Up to 5 open projects at a time on Starter; completed, cancelled and archived ones don’t count. Unlimited on Growth.'],
        ['Can I link a project to a client?', 'Yes. Each project can belong to a company from your CRM or be internal, and each company lists its projects.'],
        ['Can I track time per project?', 'Yes. Timesheet hours are logged per project, and reports show them by project or by client. Growth adds hour budgets and client reports.'],
      ],
      finalH2: 'Start your next project from a template.',
    },
  },
];
