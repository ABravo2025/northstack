# Features de la plataforma — Northstack

- Fecha: 2026-07-30
- Propósito: catálogo de qué tiene la plataforma hoy, en producción, con una descripción breve de
  cada feature — para orientarse rápido sin tener que leer el historial completo de
  `tareas-desarrollo.md`. Es un resumen de producto, no un inventario técnico; para el detalle de
  implementación de cualquier ítem, ese archivo tiene la referencia completa.

## Cuentas y organización

- **Registro de tenant nuevo**: alta de una empresa (tenant) con su primer usuario Owner —
  contraseña con checklist de requisitos en vivo, teléfono obligatorio, aceptación de Términos/
  Privacidad, validador de dominio de email duplicado (bloquea registrar una segunda empresa con el
  mismo dominio corporativo, excluyendo proveedores genéricos como Gmail).
- **Invitaciones**: Owner/Admin invitan usuarios por email con un rol asignado (Owner/Admin/
  Member); el invitado acepta vía link con token y crea su contraseña.
- **Roles**: Owner (control total, incluye transferir la propiedad del tenant), Admin, Member — la
  permisología hoy es por rol, no granular por acción (queda para un sistema de roles custom más
  adelante).
- **Sesiones**: expiran, se validan en cada request; rate limiting en login/registro.
- **Perfil y apariencia**: cada usuario edita su perfil (nombre, teléfono, contraseña); el tenant
  configura moneda (ISO-4217) y otras preferencias de apariencia.

## CRM / Ventas — Companies, Contacts, Opportunities, Pipelines

El módulo de ventas actual, reemplazo del `Client` original (ver sección "Legado" más abajo):

- **Companies**: cuentas/empresas cliente — industria, sitio web, teléfono, dirección de
  facturación, tamaño (catálogo configurable), account owner, status de ciclo de vida.
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

## HR — Employees y Time Off

- **Employees**: legajo completo — departamento y puesto (catálogos configurables), tipo de
  contrato (Part/Full time), tipo de compensación (Hourly/Monthly) con tarifa visible solo para
  Owner/Admin, fechas de ingreso/egreso, manager (con validación anti-ciclo), URL de contrato,
  email personal además del corporativo, status configurable, custom fields propios. Invitar a un
  Employee a usar la app crea su cuenta de usuario vinculada.
- **Time Off**: políticas configurables (método de acumulación fijo-anual o mensual, días por año,
  paga o no, requiere aprobación o no), asignación de políticas por Employee, solicitudes con
  aprobación/rechazo, cálculo de balance disponible por política, vista de calendario del equipo.
  Una solicitud aprobada se sincroniza (best-effort) al Google Calendar personal del empleado, si
  tiene su cuenta conectada — ver "Google Calendar" abajo (2026-08-22, solo local todavía).
- **Cumpleaños** (2026-08-22, solo local todavía): campo opcional en el legajo del Employee,
  mostrado como evento anual recurrente en el calendario de `/overview` — visible para cualquier
  rol del tenant, nunca sincronizado a Google (queda interno a propósito).
- **Import/Export CSV**: alta masiva y exportación de Employees por archivo, con plantilla
  descargable.
- **Google Calendar** (2026-08-22, solo local todavía, a la espera de credenciales reales de
  Google Cloud): cada usuario puede conectar su cuenta de Google personal desde Settings → Profile.
  Una vez conectada, sus Tasks con fecha límite y sus Time Off aprobados se empujan (sync
  unidireccional, best-effort) a su Google Calendar — las notificaciones/recordatorios los da el
  propio Google, la app no tiene (ni construyó) un sistema de notificaciones in-app propio.

## Tasks & Notes (cross-módulo)

- **Tasks**: checklist operativo genérico, asignable a cualquier Employee/Company/Contact/
  Opportunity — título, descripción, asignado, fecha límite, completado. Visible en 3 lugares: tab
  del panel de detalle de la entidad, widget "Mis tareas" en `/overview`, y el calendario de
  `/overview`. Permisos abiertos a cualquier rol del tenant por ahora (decisión deliberada, revisar
  cuando exista permisología custom). **2026-08-22**: una tarea completada desaparece del widget y
  del calendario de `/overview` (sigue visible en el tab de la entidad) para reducir ruido visual;
  si el usuario que la completó tiene Google Calendar conectado, el evento sincronizado también se
  borra.
- **Notes**: registro de texto libre (no es un to-do) por entidad, con formato básico
  `**bold**`/`*italic*`. Mismo tab que Tasks en el panel de detalle.

## Public Forms — captura externa sin login

- Builder drag-and-drop con preview en vivo, un form por módulo (Employee, Contact, y el `Client`
  legado) — pensado para intake de self-service (ej. alta de un nuevo empleado, formulario de
  contacto de ventas).
- Anti-spam: Cloudflare Turnstile (captcha) + honeypot.
- Confirmación configurable: mensaje de agradecimiento personalizable + notificación por email al
  owner del tenant en cada submission nueva.
- El submit de un Contact puede además asociarlo a un Pipeline de "Leads" automáticamente.

## Personalización por tenant

- **Custom Fields**: campos propios por módulo (Employee/Company/Contact/Opportunity/`Client`
  legado), tipos soportados incluyen texto, número, fecha, selección — gestionables desde
  `/settings` o inline en la columna "+" de cada tabla.
- **Statuses**: catálogo de estados por módulo (nombre, color, orden, default), reemplaza valores
  hardcodeados — usado en Companies/Contacts/Employees/`Client` legado.
- **Field Catalog**: catálogos compartidos (Department, Job Title, Lead Source, Loss Reason,
  Company Size) — reordenables y activables/desactivables.
- **Vistas de tabla**: mostrar/ocultar columnas, reordenar por drag-and-drop, ajustar ancho —
  persistido por vista guardada, no global.

## Administración del workspace (`/settings`)

- **Company Users**: gestión de usuarios del tenant — rol, estado, transferencia de ownership,
  cancelar invitaciones pendientes.
- **Appearance**: configuración de apariencia del tenant.
- Grid de settings con sección "Próximamente" (Integrations, Billing — visibles pero deshabilitados,
  todavía no construidos).

## Onboarding y soporte

- **Checklist de onboarding** en `/overview`: guía las primeras acciones (agregar el primer
  Employee, invitar un compañero, configurar una política de Time Off) con opción de cargar datos
  de ejemplo con un click.
- **Changelog in-app**: menú de novedades de producto sin salir de la app.
- **Ayuda / FAQ**: página estática con preguntas frecuentes sobre permisos, custom fields, Public
  Forms y aislamiento de datos entre tenants.
- **Canal de feedback**: reporte de bugs/sugerencias desde dentro de la app.

## Seguridad y multi-tenancy

- Aislamiento estricto por tenant en cada query (`tenantId`) — ver `src/lib/prisma.ts` para la
  convención documentada. Fix histórico de IDOR/mass assignment, rate limiting, Helmet, expiración
  de sesiones, chequeo de `user.status`.
- Guardas de borrado: no se puede borrar una Company/Contact con Opportunities vinculadas sin
  confirmar explícitamente qué pasa con ellas (desvincular o borrar en cascada).

## Infraestructura

- Hosting en Vercel (frontend + backend serverless en un solo proyecto), base de datos Neon
  (Postgres serverless, con retry automático ante conexiones dormidas). Deploy vía GitHub Actions,
  con ambiente `staging` propio (rama y base de datos separadas) antes de producción. CI corre
  build + tests del backend antes de cualquier deploy.

## Legado: módulo `Client` (en baja, no visible en el menú)

Antecesor de Company/Contact/Opportunity — un modelo plano (nombre, email, empresa como texto
libre, status). Los datos reales ya se migraron a Company/Contact (2026-07-29); la sección
"Clients" salió del menú lateral ese mismo día. La página propia del frontend se eliminó
(2026-07-30) por ser código muerto. El modelo y su servicio siguen activos puertas adentro: el alta
de un tenant nuevo y los Public Forms con `entityType: client` todavía crean registros `Client`
directamente — migrar esos dos puntos a Company/Contact es un paso pendiente antes de poder borrar
el módulo por completo.
