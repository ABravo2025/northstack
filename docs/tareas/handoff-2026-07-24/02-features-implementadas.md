# 02 — Features implementadas

Solo features completas y en uso. Lo a medio hacer vive en [`05-tareas-pendientes.md`](05-tareas-pendientes.md).

## Core / Multi-tenancy

- **Registro atómico de tenant + owner**: `POST /api/tenants/register` crea `Tenant` + `User` (role `owner`) + `Session` en una sola transacción, evitando usuarios huérfanos sin tenant. `src/modules/tenant/tenantService.ts` (`registerTenantWithOwner`).
- **Validador de dominio de email duplicado**: si el dominio del email del owner no es genérico (gmail/outlook/etc., lista en `GENERIC_EMAIL_DOMAINS`), bloquea el registro si ya existe otro tenant activo con ese mismo dominio — dirige a pedir invitación en su lugar.
- **Invitaciones por email**: `Invitation` con token único, expiración, y envío real por Zoho SMTP (`src/lib/mailer.ts`, best-effort — un fallo de envío no rompe la invitación, el link para copiar sigue funcionando).
- **Roles y permisos**: `owner` / `admin` / `member`, hardcodeados en `src/modules/auth/permissionService.ts` (`rolePermissions`). Sistema de roles custom **no existe todavía** — ver pendientes.
- **Transferencia de ownership atómica**: asignar `owner` a otro usuario degrada al owner actual a `admin` en la misma transacción — nunca hay 0 ni 2+ owners (`tenantService.ts`, `updateTenantUser`).
- **Aislamiento entre tenants**: todo endpoint que recibe un ID de entidad valida `tenantId` contra la sesión antes de operar. Ver el protocolo completo en [`08-directivas-agente-ia.md`](08-directivas-agente-ia.md).
- **Moneda por tenant**: `Tenant.currency` (ISO-4217, default `USD`), editable desde Company Settings, aplicada a los montos de compensación vía `frontend/src/lib/currencies.ts` (`Intl.NumberFormat`, sin librería nueva).

## Autenticación y seguridad

- Contraseñas con `scrypt` + salt (Node built-in, sin dependencia nueva) y política mínima (8+ caracteres, mayúscula, número, especial).
- Sesiones con expiración deslizante (`Session.expiresAt`) y revocación de otras sesiones al cambiar contraseña.
- Rate limiting propio (`src/lib/rateLimit.ts`, in-memory) en `/api/auth/*` y registro de tenant.
- Headers de seguridad vía Helmet, con `crossOriginResourcePolicy: cross-origin` explícito (la API se consume cross-origin por diseño).
- `sanitizeUser` centralizado — ningún endpoint devuelve `passwordHash` al frontend.
- Aceptación de Términos de Servicio/Privacidad obligatoria en el registro (`User.acceptedTermsAt`), con modal legal in-app (`LegalDocumentModal.tsx`).

## HR — Empleados

- CRUD completo de `Employee` con custom fields, catálogo de Department/Job Title (`FieldCatalogDefinition`), catálogo de Status por tenant/módulo (`StatusDefinition` + `StatusHistoryEntry`, con snapshot de nombre para no romper historial al renombrar).
- Campos: business/personal email, fecha de ingreso/fin, contract URL, hourly/monthly rate (**solo visible y editable por `owner`**, ni lectura ni escritura para `admin`), contract type (part/full time), compensation type (hourly/monthly).
- Jerarquía organizacional: `Employee.managerId` auto-referencial, con detección de ciclos (`wouldCreateManagerCycle`).
- Import/export CSV genérico (`src/lib/csv.ts`, parser RFC-4180 a mano) + descarga de template con headers + fila de ejemplo. Protegido contra CSV/formula injection (`escapeCsvField` prefija valores que empiezan con `= + - @` con `'`).
- Vistas guardadas (`SavedView`): Grid (sort/filter), Kanban (agrupado por Status o custom field select, drag-and-drop actualiza el registro real), List (agrupado, secciones colapsables) — personales o compartidas (compartidas solo owner/admin).
- Columnas: resize, reorder (drag), hide/show, freeze (Name/Status fijas al hacer scroll horizontal) — todo persistido en `localStorage` por tabla (`useResizableColumns`/`useColumnOrder`/`useColumnVisibility`).
- Panel push "Overview" (`EmployeeOverviewPanel.tsx`): click en el nombre abre un panel de lectura que empuja la tabla (no overlay), tabs Overview/Notes/Activity (Notes/Activity son placeholder sin funcionalidad todavía).
- Scrollbar horizontal propia (`HorizontalScrollbar.tsx`) reemplazando la nativa, sincronizada en ambas direcciones + Shift+rueda.
- Fila/card fantasma "Add" siempre visible en las 3 vistas, reemplazando el botón de toolbar.

Código: `frontend/src/pages/EmployeesPage.tsx`, `src/modules/hr/employeeService.ts`, `src/modules/hr/fieldCatalogService.ts`, `src/modules/hr/statusService.ts`.

**Deuda conocida**: List/ghost-row/push-panel/scrollbar propia están implementados en Employees pero **no replicados todavía en Clients ni Company Users** (el propio ítem de backlog los pide "primero en Employees, después replicar una vez validado").

## HR — Time Off (ex-PTO)

Sistema completo, 7 piezas construidas una por una:

1. Jerarquía organizacional (compartida con el resto de HR).
2. Motor de políticas configurables por tenant (`TimeOffPolicyDefinition`: nombre, color, `accrualMethod` fixed_annual/monthly, días/año, paga o no, requiere aprobación o no).
3. Asignación de políticas por empleado específico (`EmployeeTimeOffPolicy`).
4. Solicitud + aprobación enrutada por jerarquía (`TimeOffRequest`, `approverId` es un snapshot al momento de crear la solicitud, no se recalcula si cambia el manager).
5. Cálculo de balance de días (on-the-fly, no hay tabla de balance almacenada).
6. Calendario tenant-wide — es la pantalla "Overview" por default post-login.
7. Tag visual en la fila del empleado cuando está de licencia activa (no toca el `status` del catálogo).

Código: `frontend/src/pages/TimeOffOverviewPage.tsx`, `src/modules/hr/timeOff*.ts`.

## Clients

Mismo patrón que Employees (custom fields, catálogo de Status, Views/Kanban), sin los campos específicos de compensación/jerarquía. **El rediseño grande (Company/Contact/Opportunity) está confirmado pero sin empezar** — ver pendientes.

Código: `frontend/src/pages/ClientsPage.tsx`, `src/modules/clients/clientService.ts`.

## Formularios públicos (Public Forms)

`PublicForm` — múltiples formularios configurables por tenant, builder drag-and-drop con preview en vivo (`PublicFormsSettingsPage.tsx`), CAPTCHA vía Cloudflare Turnstile, rate limiting, honeypot anti-spam (evaluado *antes* que Turnstile para no gastar la verificación en bots obvios), mensaje de agradecimiento personalizable por formulario. El submit crea el Employee/Client directo y activo, sin cola de aprobación.

Código: `src/modules/hr/publicFormService.ts`, `frontend/src/pages/PublicFormPage.tsx` (pública, sin auth) y `PublicFormsSettingsPage.tsx` (admin).

## Custom Fields

Modelo genérico compartido entre Employee y Client: `CustomFieldDefinition` + `CustomFieldValue` con `tenantId` + `entityType` + `entityId` (sin FK por módulo) — elegido explícitamente para no necesitar cambios de schema cuando se agreguen módulos futuros. Gestión integrada en el header de columna de la tabla (no una página de Settings separada).

## Settings (Workspace Settings)

Hub único en `/settings` con 2 grupos: "Mi cuenta" (Profile — todos los roles) y "Empresa" (Company/Appearance, Users, Public Forms — solo owner/admin). Reemplazó 3 puntos de entrada distintos que existieron en rondas anteriores.

Código: `frontend/src/layouts/WorkspaceSettingsLayout.tsx`, `frontend/src/pages/{ProfileSettingsPage,CompanyAppearancePage,CompanyUsersPage,PublicFormsSettingsPage}.tsx`.

## Onboarding y ayuda

- Checklist de onboarding en Overview (4 pasos con check real contra el backend), botón "Load sample data" (`POST /api/onboarding/seed-sample-data` — **no es idempotente a propósito**, la UI oculta el botón una vez que hay datos reales en vez de prevenirlo a nivel backend).
- Página Help/FAQ estática (`HelpPage.tsx`, 10 preguntas hardcodeadas).
- Changelog in-app (`ChangelogMenu.tsx`, array estático en `frontend/src/lib/changelog.ts`, punto de "no leído" persistido en `localStorage`).
- Canal de feedback/reporte de bugs (`POST /api/feedback`, envío no best-effort — si falla, la request devuelve error real).

## Reportes básicos (cross-tenant)

`scripts/metrics-report.ts` — script CLI (no UI, no endpoint), implementa las 12 métricas de `docs/metrics/basic-metrics-spec.md` sección 1. Decisión de scope explícita: exponer esto en la app requeriría el admin panel de plataforma (Tier 4, sin empezar), así que se quedó como script.

## Landing page

Sitio estático en `landing/` (branch propio `landing`, pipeline de deploy independiente) en `joinnorthstack.com`. Sin botones de login/registro a propósito (se agregan cuando el beta esté más maduro).
