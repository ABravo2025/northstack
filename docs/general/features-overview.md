# Features de la plataforma — Northstack

- Fecha: 2026-08-29
- Propósito: catálogo de qué tiene la plataforma hoy con una descripción breve de cada feature —
  para orientarse rápido sin tener que leer el historial completo de `tareas-desarrollo.md`. Es un
  resumen de producto, no un inventario técnico; para el detalle de implementación de cualquier
  ítem, ese archivo (y el spec correspondiente en `docs/general/`/`docs/tareas/`) tiene la
  referencia completa.
- **Convención de esta actualización**: cada feature indica si está **en producción** (`main`) o
  **solo en `staging`**, esperando revisión del usuario antes de promover — verificado contra
  `git log origin/main` el 2026-08-29, no solo por memoria.

## Cuentas, suscripción y organización — en producción

- **Registro de tenant nuevo**: alta de una empresa (tenant) con su primer usuario Owner —
  verificación de email obligatoria antes de poder usar la cuenta, contraseña con checklist de
  requisitos en vivo, teléfono obligatorio, aceptación de Términos/Privacidad, validador de dominio
  de email duplicado.
- **Trial + selección de plan**: cada tenant nuevo arranca en trial; un modal (no una página
  bloqueante) sobre `/overview` guía la elección de plan (Starter/Growth/Scale, más una tercera
  opción de extender el trial gratis) — se puede posponer, reaparece hasta que se decide.
- **Suscripción y facturación**: Paddle para mercado internacional (USD), Mercado Pago para
  Argentina (ARS) — checkout, método de pago guardado (marca/últimos 4 dígitos, nunca el número
  completo), período de gracia ante un pago fallido, cancelación con motivo, página de
  autogestión en `/settings`. Un tenant `suspended` (venció el período de gracia sin pagar) pierde
  acceso de escritura — solo lectura, no bloqueado del todo.
- **Invitaciones**: Owner/Admin invitan usuarios por email con un rol asignado (Owner/Admin/
  Member); el invitado acepta vía link con token y crea su contraseña. También hay un link de
  "Olvidé mi contraseña" (magic link).
- **Roles**: Owner (control total, incluye transferir la propiedad del tenant), Admin, Member — la
  permisología hoy es por rol, no granular por acción (queda para un sistema de roles custom más
  adelante).
- **Sesiones**: expiran, se validan en cada request; rate limiting en login/registro.
- **Perfil y apariencia**: cada usuario edita su perfil (nombre, teléfono, contraseña); el tenant
  configura moneda (ISO-4217), tema claro/oscuro, y otras preferencias de apariencia.

## CRM / Ventas — Companies, Contacts, Opportunities, Pipelines — en producción

Reemplazo completo del `Client` original (ver sección "Legado" más abajo — la migración de datos ya
corrió contra producción):

- **Companies**: cuentas/empresas cliente — industria, sitio web, teléfono, dirección de
  facturación, tamaño (catálogo configurable), account owner, status de ciclo de vida, jerarquía
  (Company padre/hijas).
- **Contacts**: personas dentro de una Company — puesto, si es el contacto principal, fuente del
  lead, custom fields propios. Alta de Company exige un Contact fundador en el mismo paso.
- **Opportunities**: deals de venta — monto, moneda, fecha estimada de cierre, owner, próximo paso
  con fecha/nota, motivo de pérdida, historial de cambios de stage (con indicador de tiempo-en-stage
  en el panel de detalle). Puede vincular varios Contacts con un rol cada uno.
- **Pipelines**: uno o más embudos de venta configurables por tenant, cada uno con sus propios
  stages (nombre, color, orden, resultado open/won/lost). Se pueden archivar sin perder el
  histórico de Opportunities ya creadas ahí.
- **Vistas**: Grid y Kanban (agrupado por stage/status o cualquier custom field), filtros y orden
  guardables como vistas personales o compartidas.
- **Tags**: etiquetas libres por Company/Contact/Employee, con autocompletado — filtrables desde la
  columna de tags en cada lista.

**Sales v2 (round-robin de asignación, forecast ponderado por probabilidad de stage, automations al
crear un Pipeline, notificaciones in-app) — solo en `staging`**, todavía sin promover.

**Import/Export CSV de Companies y Contacts — solo en `staging`** (2026-08-31), todavía sin
promover: plantilla descargable con todos los fields + custom fields activos del tenant; alta de
Company vía CSV resuelve el Contact fundador obligatorio (matchea uno existente por email o crea
uno nuevo inline). Ver sección HR más abajo para el CSV de Employees (ya en producción).

## HR — Employees, Time Off, Payroll, Termination — en producción salvo Termination

- **Employees**: legajo completo — departamento y puesto (catálogos configurables), tipo de
  contrato (Part/Full time), tipo de persona (Profile/Contractor/Employee), fechas de
  ingreso/egreso, manager (con validación anti-ciclo), nacionalidad, país de residencia,
  cumpleaños (opcional), URL de contrato, email personal además del corporativo, status
  configurable, custom fields propios, tags. Invitar a un Employee a usar la app crea su cuenta de
  usuario vinculada.
- **Payroll**: catálogos configurables de frecuencia de pago y método de pago; compensación
  versionada por Employee (tarifa hourly/fixed, moneda, frecuencia — nunca se sobreescribe, cada
  cambio es un registro nuevo); alta con contrato inicial e invitación automática a firmar; runs de
  payroll (draft → confirmado) con ajustes (bonus/commission/reimbursement/deduction) por persona;
  pagos sueltos fuera de ciclo; preview de recibo de sueldo en PDF (marcado "preview", no un
  documento legal); asignación/reasignación masiva de políticas de pago.
- **Time Off**: políticas configurables (método de acumulación fijo-anual o mensual, días por año,
  paga o no, requiere aprobación o no), asignación de políticas por Employee, solicitudes con
  aprobación/rechazo, cálculo de balance disponible por política, vista de calendario del equipo.
  Una solicitud aprobada/cancelada se sincroniza (best-effort, bidireccional) al Google Calendar del
  empleado si tiene su cuenta conectada.
- **Import/Export CSV**: alta masiva y exportación de Employees por archivo, con plantilla
  descargable. **Person Type/Nationality/Birthdate agregados a la plantilla — solo en `staging`**
  (2026-08-31, todavía sin promover); el resto de las columnas ya está en producción.

**Employee Termination — solo en `staging`**: baja de un empleado como cambio de status coordinado,
no un delete — soporta fecha pasada, hoy, o futura (ejecución diferida vía cron para las
programadas). Al ejecutarse: status pasa a "Terminated", se cierra su compensación activa (sale de
futuros Payroll runs), corte de acceso a la app opcional, se cancela su Time Off pendiente/futuro
(con limpieza del evento en Google Calendar de otros usuarios), reasignación de sus reportes
directos a un nuevo manager. Pago final opcional con las mismas líneas que un Payroll run normal
(bonus/commission/reimbursement/deduction). El perfil del empleado tiene una tab "Payment History"
(fecha/motivo/descripción/monto, con vista previa del recibo) para cualquier pago que haya recibido.

## Payments — conexión de cada tenant con su propia cuenta de Stripe — solo en `staging`

Distinto de la suscripción de Northstack (sección de arriba) — esto es para que **cada tenant**
conecte **su propia** cuenta de Stripe y vea los pagos de **sus propios** clientes:

- Conexión por Restricted Key (solo lectura), vinculación de cada Company a su Stripe Customer
  (automática cuando hay un match inequívoco por email de Contact, manual si es ambiguo).
- Vista general por Company (total de payments/refunds/disputes con su monto, fecha del primer
  pago) y un historial completo paginado (fecha/monto/estado/link al recibo de Stripe) accesible
  desde el perfil de la Company o desde el dashboard de Payments.
- Notificaciones in-app cuando hay un refund, un pago fallido, o una subscription que pasa a
  `past_due`/se cancela — vía un cron diario de polling, sin que el tenant tenga que configurar
  nada en su propio dashboard de Stripe.

## Google Calendar y cumpleaños — en producción

- Cada usuario conecta su cuenta de Google personal desde Settings → Profile. Sus Tasks con fecha/
  hora y sus Time Off aprobados se sincronizan (bidireccional — un cambio hecho del lado de Google
  también se refleja en Northstack, vía push notifications) a su Google Calendar. Time Off del
  equipo se sincroniza de forma team-wide, no solo personal.
- El calendario de `/overview` también muestra (de solo lectura) cualquier evento de Google que no
  esté vinculado a una Task, y se auto-refresca cada 30s.
- **Cumpleaños**: campo opcional en el legajo del Employee, mostrado como evento anual recurrente en
  el calendario de `/overview` — visible para cualquier rol del tenant, nunca sincronizado a Google.

## Notificaciones in-app — en producción

Campana en la barra superior — pipeline owner (Sales v2), y cualquier otra fuente que use el mismo
modelo `Notification` (ver Payments arriba, todavía en staging).

## Tasks & Notes (cross-módulo) — en producción

- **Tasks**: checklist operativo genérico, asignable a cualquier Employee/Company/Contact/
  Opportunity — título, descripción, asignado, fecha límite (con hora opcional), completado.
  Visible en 3 lugares: tab del panel de detalle de la entidad, widget "Mis tareas" en `/overview`
  (auto-refresh cada 30s), y el calendario de `/overview`. Una tarea completada desaparece del
  widget y del calendario (sigue visible en el tab de la entidad); si tiene Google Calendar
  conectado, el evento sincronizado se completa también (no solo se desprograma). Permisos abiertos
  a cualquier rol del tenant por ahora (decisión deliberada, revisar cuando exista permisología
  custom).
- **Notes**: registro de texto libre (no es un to-do) por entidad, con formato básico
  `**bold**`/`*italic*`. Mismo tab que Tasks en el panel de detalle.

## Public Forms — captura externa sin login — en producción

- Builder drag-and-drop con preview en vivo, un form por módulo (Employee, Contact) — pensado para
  intake de self-service (ej. alta de un nuevo empleado, formulario de contacto de ventas).
- Anti-spam: Cloudflare Turnstile (captcha) + honeypot.
- Confirmación configurable: mensaje de agradecimiento personalizable + notificación por email al
  owner del tenant en cada submission nueva.
- El submit de un Contact puede además asociarlo a un Pipeline de "Leads" automáticamente.

## Personalización por tenant — en producción

- **Custom Fields**: campos propios por módulo (Employee/Company/Contact/Opportunity), tipos
  soportados incluyen texto, número, fecha, selección — gestionables desde `/settings` o inline en
  la columna "+" de cada tabla.
- **Statuses**: catálogo de estados por módulo (nombre, color, orden, default), reemplaza valores
  hardcodeados — usado en Companies/Contacts/Employees. "Terminated" (Employee) se agrega solo,
  automáticamente, la primera vez que se da de baja a alguien en ese tenant.
- **Field Catalog**: catálogos compartidos (Department, Job Title, Lead Source, Loss Reason,
  Company Size) — reordenables y activables/desactivables.
- **Vistas de tabla**: mostrar/ocultar columnas, reordenar por drag-and-drop, ajustar ancho —
  persistido por vista guardada, no global.

## Administración del workspace (`/settings`) — en producción

- **Company Users**: gestión de usuarios del tenant — rol, estado, transferencia de ownership,
  cancelar invitaciones pendientes.
- **Integrations**: una sola página para todas las integraciones — Google Calendar (por usuario) y
  la conexión de Stripe de Payments (por tenant, owner-only, todavía en `staging`).
- **Billing**: autogestión de la propia suscripción de Northstack (ver arriba).
- **Appearance**: tema claro/oscuro y otras preferencias de apariencia del tenant.

## Onboarding y soporte — en producción

- **Checklist de onboarding** en `/overview`: guía las primeras acciones (agregar el primer
  Employee, invitar un compañero, configurar una política de Time Off) con opción de cargar datos
  de ejemplo con un click.
- **Changelog in-app**: menú de novedades de producto sin salir de la app.
- **Ayuda / FAQ**: página estática con preguntas frecuentes sobre permisos, custom fields, Public
  Forms y aislamiento de datos entre tenants.
- **Canal de feedback**: reporte de bugs/sugerencias desde dentro de la app.

## Admin Center — herramienta interna, repo separado

`admin.joinnorthstack.com` (repo técnico `northstack-devtasks`, deploy propio en Vercel, **no** es
parte de este repo/monorepo) — solo para staff de Northstack (`User.platformRole`, gateado
independiente de la membresía a un tenant). Roles de plataforma, listado read-only de Tenants,
Tickets/Ideas (alimentados por el canal de feedback de arriba). Detalle completo en
`docs/Admin-platform/`.

## Seguridad y multi-tenancy — en producción

- Aislamiento estricto por tenant en cada query (`tenantId`) — ver `src/lib/prisma.ts` para la
  convención documentada. Rate limiting, Helmet, expiración de sesiones, chequeo de `user.status` y
  de `tenant.status` (un tenant `suspended` no puede mutar nada, solo leer).
- Guardas de borrado: no se puede borrar una Company/Contact con Opportunities vinculadas sin
  confirmar explícitamente qué pasa con ellas (desvincular o borrar en cascada).

## Infraestructura

- Hosting en Vercel (frontend + backend serverless en un solo proyecto), base de datos Neon
  (Postgres serverless, con retry automático ante conexiones dormidas, branch propia para
  `staging`). Deploy vía GitHub Actions (`vercel deploy` + `vercel alias set`, no la integración
  nativa de Git de Vercel) con ambiente `staging` propio (rama y base de datos separadas) antes de
  producción. CI corre build + tests del backend antes de cualquier deploy. Varios crons diarios
  (`vercel.json`) para trabajo en segundo plano — transiciones de plan, renovación de canales de
  Google Calendar, recordatorios de Opportunities estancadas, polling de eventos de Stripe.

## Legado: módulo `Client` (en baja, no visible en el menú)

Antecesor de Company/Contact/Opportunity — un modelo plano (nombre, email, empresa como texto
libre, status). Los datos reales ya se migraron a Company/Contact y esa migración corrió también
contra producción (no solo `staging`); "Clients" salió del menú lateral. El modelo y su servicio
siguen existiendo puertas adentro (no se borraron) — confirmar contra el código actual si todavía
hay algún punto de alta (Public Forms, alta de tenant) que siga creando registros `Client` antes de
dar el módulo por completamente cerrado.
