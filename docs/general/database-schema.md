# Database Schema

- Última actualización: 2026-09-01 (Custom Roles — Fase B2 extendida: crear/renombrar/borrar roles custom reales desde la UI, no solo reconfigurar Admin/Member — `POST/PATCH/DELETE /api/roles*` — ver grupo 14; en `staging`, sin pushear a `main`)
- Actualización anterior: 2026-09-01 (Custom Roles — Fase B2: primera UI real, `Settings → Roles & Permissions` — owner reconfigura los permisos de Admin/Member con toggles, endpoints `GET/PATCH /api/roles*` — ver grupo 14; en `staging`, sin pushear a `main`)
- Actualización anterior: 2026-09-01 (Custom Roles — Fase B completa: `permissionService.ts` migrado a `RoleContext`, entity-split de Employee/Company/Contact/Opportunity, 3 permisos nuevos reemplazan los últimos chequeos inline, gap de invitación con rol owner cerrado, CSV atado a Payroll — ver grupo 14; en `staging`, sin pushear a `main`)
- Actualización anterior: 2026-09-01 (Custom Roles — Fase A completa: schema aditivo + seed/backfill + `RoleContext` sin consumidores todavía, ver grupo 14; en `staging`, sin pushear a `main`)
- Actualización anterior: 2026-08-31 (Activity Log — Unidades 1-6 completas, spec cerrado; incluye el fix same-day de `parentEntityType`/`parentEntityId` (2026-08-30) y la Unidad 6 completa con Subscription/GoogleCalendarConnection/StripeConnection (2026-08-31, mecanismo de correlación `Subscription.lastActionByUserId`/`lastActionAt`), ver grupo 13; en `staging`, sin pushear a `main`)
- Actualización anterior: 2026-08-29 (Employee Termination — ver grupo 11 — y Payments v1 Units 5-7, ver grupo 10; todo en `staging`, sin pushear a `main`)
- Fuente de verdad real: `prisma/schema.prisma`. Este documento es una vista legible de ese archivo — si difieren, el `.prisma` manda. Regenerar este archivo cuando el schema cambie de forma significativa (modelo nuevo, relación nueva), no hace falta para cambios chicos (un campo opcional más, un índice).
- Todos los modelos son multi-tenant: casi todos tienen `tenantId` directo (no derivado por join), y el aislamiento entre tenants se verifica en el código de cada endpoint (ownership check), no solo por FK — ver `docs/current-process-flow.md` para el patrón de verificación.

## Cómo leer los diagramas

Se dividen en grupos por área funcional, no uno solo gigante, para que sean legibles:

1. **Identidad y acceso** — Tenant, User, Session, Invitation.
2. **HR core** — Employee, Client (legado, ver nota abajo), catálogos configurables (Status, Custom Fields, Field Catalog).
3. **Time Off** — políticas, asignación por empleado, solicitudes.
4. **Vistas y formularios** — SavedView, PublicForm.
5. **Sales / Clients redesign** — Company, Contact, Pipeline, Opportunity y su historial.
6. **Tasks & Notes (cross-entity)** — Task, Note, adjuntables a Employee/Company/Contact/Opportunity.
7. **Payroll** — PayFrequencyDefinition, PaymentMethodDefinition, EmployeeCompensation, PayrollRun, PayrollEntry.
8. **Tenant Signup + Subscription Plans** — EmailVerification, y los campos nuevos de Tenant (plan/trial/gracia/precio congelado).
9. **Google Calendar sync + cumpleaños** — GoogleCalendarConnection, GoogleOAuthState, y los campos nuevos de Employee/Task/TimeOffRequest.
10. **Payments v1** — StripeConnection, y los campos nuevos de Company (`stripeCustomerId`/`stripeCustomerMatchedVia`).
11. **Employee Termination** — EmployeeTermination, EmployeeTerminationReassignment.
12. **Billing Integration** — Subscription, Invoice, PlanPrice, ProcessedWebhookEvent (Northstack's own subscription — Paddle intl/USD, Mercado Pago AR/ARS — distinto de Payments v1, que es la suscripción de Stripe de *cada tenant*, no la de Northstack).

## 1. Identidad y acceso

```mermaid
erDiagram
    TENANT ||--o{ USER : "employs"
    TENANT ||--o{ INVITATION : "issues"
    USER ||--o{ SESSION : "has"
    USER ||--o{ INVITATION : "sends (invitedBy)"
    USER ||--o| EMPLOYEE : "linked to (optional)"
    USER ||--o{ PASSWORD_RESET_TOKEN : "requests"

    TENANT {
        string id PK
        string name
        string slug UK
        enum status "active/suspended/cancelled"
        string companySize "nullable"
        string industry "nullable"
        string country "nullable"
        enum acquisitionChannel "nullable"
        string currency "ISO-4217, default USD"
        datetime createdAt
    }
    USER {
        string id PK
        string firstName
        string lastName
        string phone
        string email UK
        string emailDomain "nullable, lowercased domain of email — indexed"
        string passwordHash
        enum role "owner/admin/member"
        enum status "active/inactive"
        string tenantId FK "nullable until onboarded"
        datetime acceptedTermsAt "nullable"
    }
    SESSION {
        string id PK
        string token UK
        string userId FK
        datetime expiresAt "sliding expiration, extended on use"
        datetime createdAt
    }
    INVITATION {
        string id PK
        string tenantId FK
        string email
        enum role "owner/admin/member"
        string token UK
        enum status "pending/accepted/expired/revoked"
        string invitedByUserId FK
        string employeeId FK "nullable"
        datetime expiresAt
    }
    PASSWORD_RESET_TOKEN {
        string id PK
        string userId FK
        string token UK
        datetime expiresAt "1 hour — shorter than Invitation's 7 days"
        datetime usedAt "nullable, doubles as the consumed flag"
        datetime createdAt
    }
```

Notas:
- `User.tenantId` es nullable — un `User` sin tenant existe momentáneamente solo en el flujo de aceptar invitación (`POST /api/auth/register` crea el usuario "suelto", y `POST /api/invitations/:token/accept` lo adjunta al tenant en la misma operación).
- `Invitation` no fuerza un solo uso por email — el guardrail real (no invitar a alguien que ya pertenece a un tenant) vive en `createInvitation`, no en el schema.
- `Session.expiresAt` es **expiración deslizante**: cada uso válido la extiende (solo si falta menos de 1 día, para no pagar el costo de un `UPDATE` en cada request autenticado). Cambiar la propia contraseña revoca todas las demás sesiones del usuario. Se agregó vía migración segura (nullable → backfill de las sesiones existentes → `NOT NULL`), documentada en `docs/tareas/semana-2026-07-21.md`.
- `Tenant.companySize`/`industry`/`country`/`acquisitionChannel` y `User.acceptedTermsAt` son campos del formulario de Sign Up ampliado (2026-07-22) — todos nullable, no retroactivos.
- **`User.emailDomain` (2026-08-18)**: agregado para que `checkEmailDomainNotAlreadyRegistered` (`tenantService.ts`) haga un lookup indexado en vez de un scan de toda la tabla con `email: {endsWith: '@dominio'}` (Postgres no puede usar un índice btree para eso). Mismo patrón seguro que `Session.expiresAt` arriba: columna nullable, seteada en cada `user.create` desde el 2026-08-18 en adelante (`registerTenantWithOwner`, `registerUser`, `contractConfirmationService`), y un backfill (`scripts/backfill-user-email-domain.ts`) para las filas anteriores — correrlo una vez después del `prisma db push` que agrega la columna, contra **las dos** bases (ver la regla de proceso en `docs/general/tareas-desarrollo.md`).
- **`PasswordResetToken` ("¿olvidaste tu contraseña?", 2026-08-09)**: mismo patrón que `Invitation` (token random, ventana de expiración, resuelto en un solo request), pero con un flag `usedAt` en vez de un enum `status` — un reset token solo tiene dos estados posibles (sin usar/usado), no necesita `pending/expired/revoked`. `POST /api/auth/forgot-password` nunca revela si el email existe (misma respuesta genérica siempre, sin importar el resultado — evita enumeration); pedir un reset nuevo invalida (`usedAt`) cualquier token anterior sin usar de esa persona. Al confirmar el reset (`POST /api/auth/reset-password`) se borran **todas** las sesiones existentes del usuario (a diferencia de `changeOwnPassword`, que preserva la sesión que hizo el cambio) y se crea una sesión nueva — la persona queda logueada, pero cualquier sesión vieja (robada o no) muere.

## 2. HR core

```mermaid
erDiagram
    TENANT ||--o{ EMPLOYEE : "has"
    TENANT ||--o{ CLIENT : "has (legacy, being migrated)"
    TENANT ||--o{ STATUS_DEFINITION : "defines"
    TENANT ||--o{ STATUS_HISTORY_ENTRY : "records"
    TENANT ||--o{ CUSTOM_FIELD_DEFINITION : "defines"
    TENANT ||--o{ CUSTOM_FIELD_VALUE : "stores"
    TENANT ||--o{ FIELD_CATALOG_DEFINITION : "defines"

    EMPLOYEE ||--o{ EMPLOYEE : "manages (self-relation)"
    EMPLOYEE }o--|| STATUS_DEFINITION : "current status"
    EMPLOYEE }o--o| FIELD_CATALOG_DEFINITION : "department (optional)"
    EMPLOYEE }o--o| FIELD_CATALOG_DEFINITION : "jobTitle (optional)"
    CLIENT }o--|| STATUS_DEFINITION : "current status"
    USER ||--o{ STATUS_HISTORY_ENTRY : "changed by"
    CUSTOM_FIELD_DEFINITION ||--o{ CUSTOM_FIELD_VALUE : "has values"

    EMPLOYEE {
        string id PK
        string firstName
        string lastName
        string email
        string departmentId FK "nullable, FieldCatalogDefinition"
        string jobTitleId FK "nullable, FieldCatalogDefinition"
        enum contractType "nullable, part_time/full_time"
        datetime startDate "nullable"
        datetime endDate "nullable"
        string contractUrl "nullable, link only"
        string personalEmail "nullable"
        enum personType "nullable, profile/contractor/employee — Payroll Unidad 4, first field on the People alta form"
        string nationality "nullable — Payroll Unidad 1"
        string countryOfResidence "nullable, filled by the person at contract confirmation — Payroll Unidad 7"
        date birthdate "nullable — recurring annual entry on the Overview calendar, grupo 9"
        string statusId FK
        string managerId FK "nullable, self-relation"
        string tenantId FK
        string userId FK "nullable, unique - optional login link"
    }
    CLIENT {
        string id PK
        string firstName
        string lastName
        string email
        string company "free text - superseded by Company/Contact, see note"
        string statusId FK
        string tenantId FK
    }
    STATUS_DEFINITION {
        string id PK
        string tenantId FK
        enum entityType "employee/client/company (contact and opportunity don't use this)"
        string name
        string color "nullable hex"
        int order
        bool isDefault
        bool isActive
    }
    STATUS_HISTORY_ENTRY {
        string id PK
        string tenantId FK
        enum entityType
        string entityId "no live FK"
        string fromStatusName "snapshot, not FK"
        string toStatusName "snapshot, not FK"
        string changedByUserId FK
        datetime changedAt
    }
    CUSTOM_FIELD_DEFINITION {
        string id PK
        string tenantId FK
        string name
        enum entityType "employee/client/company/contact/opportunity"
        enum fieldType "text/number/date/select/email"
        string options "JSON, only for select"
        bool required
        bool isActive
    }
    CUSTOM_FIELD_VALUE {
        string id PK
        string tenantId FK
        string customFieldDefinitionId FK
        enum entityType
        string entityId "no live FK"
        string value
    }
    FIELD_CATALOG_DEFINITION {
        string id PK
        string tenantId FK
        enum kind "department/jobTitle/leadSource/lossReason"
        string name
        int order
        bool isActive
    }
```

Notas — patrones deliberados que se repiten en todo el schema:
- **`entityType` genérico en vez de una FK por módulo**: tanto `CustomFieldValue` como `StatusDefinition`/`StatusHistoryEntry` usan `tenantId` + `entityType` + `entityId` (sin FK real de Prisma — se verifica en código) en vez de columnas `employeeId`/`clientId`/`companyId` separadas. Un módulo nuevo nunca requiere una migración de schema para heredar custom fields o catálogo de status — solo agregar el valor de enum correspondiente. `entityType` (`EntityType` enum) hoy tiene 5 valores: `employee`, `client`, `company`, `contact`, `opportunity` — los últimos 3 se agregaron para el rediseño de Clients (ver grupo 5).
- **Historial por snapshot, no por FK viva**: `StatusHistoryEntry.fromStatusName`/`toStatusName` guardan el *nombre* del status al momento del cambio, no una referencia a `StatusDefinition`. Si alguien renombra un status después, el historial viejo no se reescribe retroactivamente. Contraste deliberado: `OpportunityStageHistory` (grupo 5) sí usa una FK viva — ver esa sección.
- **`FieldCatalogDefinition` — catálogo genérico compartido**, distinto de `StatusDefinition` a propósito: nace para `Employee.department`/`jobTitleId` (ambos eran texto libre, migrados a FK vía el patrón de migración segura — push aditivo → backfill → endurecer a requerido/borrar columna vieja), y se reutilizó para `Contact.leadSourceId` y `Opportunity.lossReasonId` (`kind: 'leadSource'`/`'lossReason'`) en vez de crear 2 tablas nuevas. `Status` deliberadamente **no** se unificó en este mecanismo — es una feature más pesada (agrupamiento de Kanban, historial, guardrail de `isDefault`, sembrado automático por tenant) y migrarla hubiera sido riesgo real de regresión por poco beneficio.
- `Employee.managerId` es una relación auto-referencial — ver `wouldCreateManagerCycle` en `employeeService.ts` para la validación anti-ciclo que la acompaña.
- **`Client` — modelo legado, en proceso de reemplazo**: ver grupo 5 (Sales / Clients redesign) para el reemplazo (`Company` + `Contact`). `Client` sigue totalmente funcional (rutas, UI, custom fields) en paralelo mientras dura la migración — no se tocó ni se va a tocar hasta un corte deliberado y aprobado por separado. Todo tenant nuevo sigue sembrando su catálogo de `StatusDefinition` por defecto (Employee: Active/Inactive/Pending — Client: Prospect/Active/Inactive/Archived — Company: Prospect/Customer/Churned).

## 3. Time Off

Renombrado de "PTO" a "Time Off" en el schema (`PtoPolicyDefinition`→`TimeOffPolicyDefinition`, etc.) — el nombre visible en la UI y en la documentación de producto ya era "Time Off" desde el principio, el schema tenía el nombre viejo.

```mermaid
erDiagram
    TENANT ||--o{ TIME_OFF_POLICY_DEFINITION : "defines"
    TENANT ||--o{ EMPLOYEE_TIME_OFF_POLICY : "has"
    TENANT ||--o{ TIME_OFF_REQUEST : "has"

    EMPLOYEE ||--o{ EMPLOYEE_TIME_OFF_POLICY : "assigned"
    TIME_OFF_POLICY_DEFINITION ||--o{ EMPLOYEE_TIME_OFF_POLICY : "assigned to"
    EMPLOYEE ||--o{ TIME_OFF_REQUEST : "requests (employeeId)"
    EMPLOYEE ||--o{ TIME_OFF_REQUEST : "approves (approverId)"
    TIME_OFF_POLICY_DEFINITION ||--o{ TIME_OFF_REQUEST : "requested under"

    TIME_OFF_POLICY_DEFINITION {
        string id PK
        string tenantId FK
        string name
        string color "nullable hex"
        enum accrualMethod "fixed_annual/monthly"
        float daysPerYear
        bool isPaid
        bool requiresApproval
        bool isActive
    }
    EMPLOYEE_TIME_OFF_POLICY {
        string id PK
        string tenantId FK
        string employeeId FK
        string timeOffPolicyId FK
        datetime assignedAt "accrual start for monthly policies"
    }
    TIME_OFF_REQUEST {
        string id PK
        string tenantId FK
        string employeeId FK
        string timeOffPolicyId FK
        date startDate
        date endDate
        float daysRequested "computed server-side, inclusive calendar days"
        string note "nullable"
        enum status "pending/approved/rejected/cancelled"
        string approverId FK "nullable - snapshot of employee.managerId at request time"
        datetime decidedAt "nullable"
        string decisionNote "nullable"
    }
```

Notas:
- `EmployeeTimeOffPolicy` es la tabla de unión muchos-a-muchos — `@@unique([employeeId, timeOffPolicyId])` evita duplicados.
- `TimeOffRequest.approverId` se fija **al momento de crear la solicitud**, copiando el `managerId` del empleado en ese instante — snapshot, no se recalcula si el manager cambia después. Sin manager asignado, cualquier owner/admin puede decidir como fallback.
- El balance de días (asignado/usado/pendiente/restante) **no se guarda en ninguna tabla** — se calcula al vuelo (`timeOffBalanceService.ts`).
- Si `requiresApproval` es `false`, la solicitud nace directo en `status: approved`.
- El tag visual de "de licencia" en la fila del empleado se deriva en cada `GET /api/hr/employees`, no es una columna.
- Sistema completo (7/7 piezas: jerarquía, políticas, asignación, solicitud/aprobación, balance, calendario, tag visual) desde 2026-07-14.
- **2026-08-23**: un `TimeOffRequest` aprobado se sincroniza a Google Calendar — no como campo propio, sino vía `TimeOffCalendarSync` (grupo 9), porque un mismo Time Off aparece en el calendario de **todos** los usuarios conectados del tenant, no solo el de la persona que se lo toma (mismo criterio que la vista compartida del Overview).

## 4. Vistas y formularios

```mermaid
erDiagram
    TENANT ||--o{ SAVED_VIEW : "has"
    TENANT ||--o{ PUBLIC_FORM : "has"
    USER ||--o{ SAVED_VIEW : "created by"
    PIPELINE ||--o{ PUBLIC_FORM : "routes new Opportunities into (contact forms only)"

    SAVED_VIEW {
        string id PK
        string tenantId FK
        enum entityType
        string createdByUserId FK
        string name
        enum type "grid/kanban/list"
        enum visibility "personal/shared"
        string filters "nullable, JSON"
        string sortBy "nullable, JSON"
        string groupByField "nullable - status or a select CustomFieldDefinition id"
    }
    PUBLIC_FORM {
        string id PK
        string tenantId FK
        enum entityType "employee/client/contact"
        string name
        string slug
        string fieldsConfig "JSON array of optional {key, required}"
        string thankYouMessage "nullable"
        enum accessMode "public/internal, default public"
        string pipelineId FK "nullable, contact forms only"
        bool isActive
    }
```

Notas:
- `SavedView`: solo owner/admin crean vistas `shared`; borrar una vista `personal` es exclusivo de quien la creó. Mover una card en Kanban reutiliza los `PATCH` ya existentes de cada entidad (por `statusId` o custom field), sin endpoints nuevos.
- `PublicForm`: conceptualmente "Form" en el rediseño de Clients (ya no exclusivamente público desde que existe `accessMode`), pero **se mantuvo el nombre de tabla** `PublicForm` — un rename real por `db push` es riesgoso sin herramienta de migraciones formal, sin beneficio funcional. `accessMode: 'internal'` está en el schema pero sin flujo de acceso autenticado construido todavía — `findActivePublicForm` falla cerrado (nunca sirve un form `internal` en la ruta pública anónima).
- `PublicForm.pipelineId` (nuevo, rediseño de Clients): solo aplica a `entityType: 'contact'`. Si está seteado, un submit que matchea o crea una Company también crea una Opportunity en el primer stage activo de ese Pipeline — ver grupo 5.
- `fieldsConfig` nunca incluye firstName/lastName/email (siempre presentes y requeridos) — solo campos opcionales (`department`/`company` para Employee/Client, o `cf:<id>` para custom fields; los forms de Contact no tienen un campo "hardcodeado" equivalente, porque el matching de Company es automático por dominio de email, no cargado a mano).

## 5. Sales / Clients redesign (Company, Contact, Pipeline, Opportunity)

Reemplaza gradualmente al `Client` legado del grupo 2 (ver ahí la nota de convivencia). Spec completo en `docs/tareas-desarrollo.md` líneas ~389-411; construido pieza por pieza (11 unidades) 2026-07-27, cada una commiteada y pusheada a `staging` por separado.

```mermaid
erDiagram
    TENANT ||--o{ COMPANY : "has"
    TENANT ||--o{ CONTACT : "has"
    TENANT ||--o{ PIPELINE : "has"
    TENANT ||--o{ OPPORTUNITY : "has"

    COMPANY ||--o{ CONTACT : "employs (optional)"
    COMPANY ||--o{ OPPORTUNITY : "has deals"
    COMPANY }o--|| STATUS_DEFINITION : "Prospect/Customer/Churned"
    USER ||--o{ COMPANY : "accountOwner (optional)"

    PIPELINE ||--o{ PIPELINE_STAGE_DEFINITION : "defines stages"
    PIPELINE ||--o{ OPPORTUNITY : "contains"
    PIPELINE_STAGE_DEFINITION ||--o{ OPPORTUNITY : "current stage"
    PIPELINE_STAGE_DEFINITION ||--o{ OPPORTUNITY_STAGE_HISTORY : "was entered"

    OPPORTUNITY ||--o{ OPPORTUNITY_CONTACT : "involves"
    CONTACT ||--o{ OPPORTUNITY_CONTACT : "involved in"
    OPPORTUNITY ||--o{ OPPORTUNITY_STAGE_HISTORY : "moved through"
    USER ||--o{ OPPORTUNITY : "owns"
    FIELD_CATALOG_DEFINITION ||--o{ CONTACT : "leadSource"
    FIELD_CATALOG_DEFINITION ||--o{ OPPORTUNITY : "lossReason"
    FIELD_CATALOG_DEFINITION ||--o{ COMPANY : "size"

    COMPANY {
        string id PK
        string tenantId FK
        string name
        string industry "nullable"
        string website "nullable"
        string phone "nullable"
        string billingAddress "nullable, shared with future Payments"
        string sizeId FK "nullable, FieldCatalogDefinition (kind companySize)"
        string accountOwnerId FK "nullable, User"
        string statusId FK "derived only, never manually edited"
    }
    CONTACT {
        string id PK
        string tenantId FK
        string firstName
        string lastName
        string email
        string phone "nullable"
        string companyId FK "nullable - leads without a confirmed Company"
        string title "nullable"
        bool isPrimary
        enum leadStatus "nullable - new/contacted/qualified/disqualified, only meaningful for Form leads"
        string leadSourceId FK "nullable, FieldCatalogDefinition"
    }
    PIPELINE {
        string id PK
        string tenantId FK
        string name
        int order
        bool isActive "archived when false"
    }
    PIPELINE_STAGE_DEFINITION {
        string id PK
        string tenantId FK
        string pipelineId FK
        string name
        string color "nullable"
        int order
        enum outcome "open/won/lost, default open"
        bool isActive
    }
    OPPORTUNITY {
        string id PK
        string tenantId FK
        string companyId FK
        string pipelineId FK
        string stageId FK
        string name
        int amountCents
        string currency "ISO-4217, explicit per Opportunity"
        datetime estimatedCloseDate "nullable"
        string ownerId FK "User"
        string lossReasonId FK "nullable - required at app layer when stage.outcome is lost"
        datetime nextStepDate "nullable"
        string nextStepNote "nullable"
    }
    OPPORTUNITY_CONTACT {
        string id PK
        string tenantId FK
        string opportunityId FK
        string contactId FK
        string role "nullable, free text e.g. decisor"
    }
    OPPORTUNITY_STAGE_HISTORY {
        string id PK
        string tenantId FK
        string opportunityId FK
        string stageId FK "live FK, not a name snapshot"
        datetime enteredAt
    }
```

Notas — decisiones deliberadas de este rediseño:
- **`PipelineStageDefinition.outcome` (`open`/`won`/`lost`)** es la pieza que no estaba en el spec original — necesaria porque los nombres de stage son renombrables por tenant, así que el sistema no puede detectar "ganado"/"perdido" comparando strings. Aprobado explícitamente con el usuario antes de construir.
- **Won → Customer, automático**: cuando un `Opportunity.stageId` cambia a un stage con `outcome: 'won'`, `maybeAdvanceCompanyToCustomer` busca el `StatusDefinition` `name: 'Customer'` activo de `entityType: 'company'` del tenant y actualiza `Company.statusId` — best-effort, no rompe si el tenant renombró/desactivó ese status. **Churned no tiene trigger automático todavía** — el spec lo liga a vencimiento de un `Contract` sin renovación, y `Contract` no existe como entidad en este alcance; `Churned` queda como valor de status seleccionable sin disparador propio, gap conocido y aceptado.
- **`OpportunityStageHistory.stageId` es una FK viva**, a diferencia de `StatusHistoryEntry` (que snapshotea el *nombre*) — decisión explícita del spec, para poder calcular tiempo-en-stage más adelante uniendo contra el `PipelineStageDefinition` real (color/order/outcome), no solo un texto histórico.
- **Pipeline archivado**: sus Opportunities quedan visibles en modo solo lectura (no editables hasta desarchivar, validado también en el backend como capa de seguridad ante llamadas directas a la API) pero siguen contando en reporting histórico. Desaparece de cualquier selector de creación.
- **`Contact.companyId` es opcional a propósito** — un lead capturado por un Form público puede no matchear ninguna Company todavía (dominio de email genérico o desconocido). Bloquear la conversión a Opportunity sin `companyId` es la regla actual; la calificación de leads de mayor volumen (ver `docs/tareas-desarrollo.md`) está explícitamente pospuesta hasta que haya evidencia real de volumen.
- **Matching de Company al hacer submit de un Form de tipo `contact`** (`matchOrCreateCompanyForContact`, `publicFormService.ts`): busca un `Contact` existente del tenant con el mismo dominio de email que ya tenga `companyId` y reutiliza esa Company; dominios genéricos (`GENERIC_EMAIL_DOMAINS`, la misma lista usada por el validador de dominio duplicado del Sign Up) o sin match → `Contact` se crea sin Company (`companyId: null`); dominio específico sin match → crea una `Company` nueva en estado `Prospect`, nombre derivado del dominio. Nunca sobreescribe una Company existente con datos del form.
- **`Opportunity.amountCents` + `currency` es explícito por Opportunity**, no el `Tenant.currency` que usa la compensación de Employee — deliberado, cada deal puede cerrar en una moneda distinta.
- `deleteOpportunity` borra `OpportunityStageHistory` + `OpportunityContact` + la `Opportunity` dentro de una `$transaction` — ninguna de esas FKs tiene `onDelete: Cascade`, así que un `delete` simple fallaría en cuanto existiera historial.
- **Migración de datos (`Client` → `Company`/`Contact`)**: script idempotente `scripts/backfill-clients-to-companies-contacts.ts` — agrupa `Client.company` (texto libre) por nombre normalizado (trim + espacios colapsados + case-insensitive) dentro de cada tenant, crea/reutiliza una `Company` por grupo, y un `Contact` por `Client` (createdAt original preservado, salteando por email si ya existe). El status de `Client` (Prospect/Active/Inactive/Archived) mapea a Company (`Prospect→Prospect`, `Active→Customer`, `Inactive`/`Archived→Churned`; "el más avanzado gana" cuando varios `Client` comparten nombre de company). De paso descubrió y corrigió un bug real: ningún tenant creado antes de este rediseño tenía filas `StatusDefinition` de `entityType: 'company'` (el sembrado solo corre al crear un tenant nuevo) — sin eso, `Company` no se podía crear para *ningún* tenant preexistente, no solo los que tenían `Client`. El script las siembra retroactivamente para cualquier tenant que no las tenga. **Corrido y verificado en staging (21 Companies/21 Contacts, re-corrida confirmó idempotencia). Todavía no corrido contra producción** — bloqueado hasta que el usuario revise staging y dé el visto bueno (ver `docs/tareas-desarrollo.md`).
- El `Client` legado (rutas, UI, custom fields) sigue intacto en paralelo — este es un backfill aditivo, no un corte. El corte (ocultar/borrar `Client`) es una unidad futura separada, deliberadamente no construida todavía.
- **`Company.size` → `sizeId` (2026-07-30, Checkpoint E)**: pasó de texto libre a FK a `FieldCatalogDefinition` (`kind: 'companySize'`), mismo mecanismo que `department`/`jobTitle`/`leadSource`/`lossReason` — gestionable desde el header de la columna "Size" en `CompaniesPage.tsx`. Migrado con el patrón seguro (nullable → backfill → requerido/borrar columna vieja); `staging` no tenía ninguna Company con `size` cargado al migrar, así que el backfill no tuvo nada que mover.
- **Company creación — Contact obligatorio (2026-07-30, Checkpoint E)**: `createCompany` ahora exige un Contact en la misma transacción — uno nuevo (`firstName`/`lastName`/`email`) o uno existente (`contactId`, usado por el flujo de "crear Company al vuelo" desde `ContactDetailModal`). No es una restricción a nivel de base de datos, se aplica en `companyService.ts`.
- **Delete de Contact/Company — antes crasheaba con Opportunities vinculadas** (bug real encontrado por el usuario, 2026-07-30): `OpportunityContact` no tiene `onDelete: Cascade`, así que un `delete` simple de Contact o Company con Opportunities vinculadas fallaba con un error crudo de constraint. `deleteContact`/`deleteCompany` ahora aceptan un flag opcional (`deleteLinkedOpportunities`) que, si viene en `true`, borra las Opportunities vinculadas primero (reusando `deleteOpportunity`); sin el flag, siguen bloqueando con un mensaje legible. Borrar una Company **desvincula** sus Contacts (`companyId: null`), nunca los borra.

## 6. Tasks & Notes (cross-entity)

Genéricos, adjuntables a Employee/Company/Contact/Opportunity (no a `Client`, en vías de discontinuarse) vía el mismo patrón `tenantId`+`entityType`+`entityId` que `CustomFieldValue`/`StatusHistoryEntry` — sin FK real de Prisma, verificado en código (`src/modules/crossModule/entityLookup.ts`, compartido por los dos módulos para que la lista de entity types soportados y el chequeo de tenant no diverjan entre uno y otro). Construidos 2026-07-29/30, todavía solo en `staging`.

```mermaid
erDiagram
    TENANT ||--o{ TASK : "has"
    TENANT ||--o{ NOTE : "has"
    USER ||--o{ TASK : "assigned (assigneeId)"
    USER ||--o{ TASK : "created (createdById)"
    USER ||--o{ NOTE : "created (createdById)"

    TASK {
        string id PK
        string tenantId FK
        enum entityType "employee/company/contact/opportunity"
        string entityId "no live FK"
        string title
        string description "nullable"
        string assigneeId FK "User"
        datetime dueDate "nullable"
        datetime completedAt "nullable - presence/absence is the done state"
        string createdById FK "User"
        string googleCalendarEventId "nullable — set only while dueDate present and not completed, grupo 9"
    }
    NOTE {
        string id PK
        string tenantId FK
        enum entityType "employee/company/contact/opportunity"
        string entityId "no live FK"
        string title
        string description "long text, lightweight **bold**/*italic* rendering"
        string createdById FK "User"
    }
```

Notas:
- **Permisos abiertos a cualquier rol del tenant** (no gateado por `canCreateHr`/`canManageCustomFields` como Employee/Opportunity) — confirmado con el usuario 2026-07-29: Tasks es una checklist operativa compartida, Notes un registro compartido, ninguno dato sensible. Anotado para revisar cuando exista el sistema de roles custom (Tier 5).
- `Task` tiene asignado + fecha límite + estado completado (es un to-do); `Note` no tiene ninguno de los tres — es un registro, no una acción pendiente.
- **2026-08-22**: `listTasksForCalendar`/`listMyTasks` (los dos endpoints que alimentan el Overview) excluyen `completedAt != null` server-side — una tarea completada sigue existiendo (se ve en `EntityTasksList`, el tab de la propia entidad) pero desaparece del calendario y del widget "My tasks". `Task.googleCalendarEventId` — ver grupo 9.
- **`Note.title`/`description`** se llamaban `header`/`body` hasta el 2026-07-30 — renombrados para que coincidan con `Task.title`/`description` (consistencia entre los dos módulos gemelos). Migrado con el patrón seguro (nullable → backfill → requerido/borrar columnas viejas); preservó la única Note real que ya existía en `staging` (creada por el usuario probando la app).
- `description` admite un subconjunto chico de markdown (**bold**, *italic*) renderizado a elementos React reales (`frontend/src/lib/lightMarkdown.tsx`, sin `dangerouslySetInnerHTML`) — no una librería de markdown completa, no se justificaba para "resaltar partes" nada más.
- `Opportunity.nextStepDate`/`nextStepNote` (grupo 5) tienen un script de backfill a `Task` (`scripts/backfill-opportunity-nextstep-to-tasks.ts`, idempotente) — corrido en `staging`, 0 Opportunities con next step cargado todavía ahí, así que no creó nada. Las columnas viejas de `Opportunity` no se tocaron.
- En el frontend, ambos se consumen a través de `EntityTasksList`/`EntityNotesList` — un componente compartido literal por los 4 paneles de detalle (Employee/Company/Contact/Opportunity), no 4 implementaciones separadas. El compose (crear/editar) está siempre expandido en la columna derecha del panel de detalle (`DetailSidebar.tsx`), no detrás de un popover — cambiado 2026-07-30, antes abría un `Popover` al hacer click en una fila fantasma.

## 7. Payroll

Spec completo en `docs/spec-payroll.md` (v2, 21 unidades) — tercer intento, los dos anteriores se
revirtieron por completo (git log tiene el detalle; `docs/tareas-desarrollo.md` y
`docs/features-overview.md` resumen el incidente). Completas hasta Unidad 7 (schema, cifrado,
catálogo de políticas de pago, rename a People + `personType`, alta con contrato inicial,
invitación específica, y la pantalla pública de confirmación de contrato) — verificado de punta a
punta con Playwright: alta de un Contractor → invitación automática → confirmación real (contraseña,
país, IBAN) → `User` creado y logueado → datos de cuenta desencriptados coinciden con lo ingresado.

```mermaid
erDiagram
    TENANT ||--o{ PAY_FREQUENCY_DEFINITION : "defines"
    TENANT ||--o{ PAYMENT_METHOD_DEFINITION : "defines"
    TENANT ||--o{ EMPLOYEE_COMPENSATION : "has"
    TENANT ||--o{ PAYROLL_RUN : "has"
    TENANT ||--o{ PAYROLL_ENTRY : "has"

    EMPLOYEE ||--o{ EMPLOYEE_COMPENSATION : "contracts (versioned)"
    PAY_FREQUENCY_DEFINITION ||--o{ EMPLOYEE_COMPENSATION : "assigned to"
    PAYMENT_METHOD_DEFINITION ||--o{ EMPLOYEE_COMPENSATION : "chosen by the person"
    PAY_FREQUENCY_DEFINITION ||--o{ PAYROLL_RUN : "runs under"
    PAYROLL_RUN ||--o{ PAYROLL_ENTRY : "contains"
    EMPLOYEE ||--o{ PAYROLL_ENTRY : "paid"
    USER ||--o{ EMPLOYEE_COMPENSATION : "created by"
    USER ||--o{ PAYROLL_RUN : "created by"

    PAY_FREQUENCY_DEFINITION {
        string id PK
        string tenantId FK
        string name
        enum cadence "weekly/semimonthly/monthly"
        string anchorConfig "JSON, shape depends on cadence"
        enum dueDateOffset "same_day/plus_2/plus_5/custom"
        int dueDateCustomDays "nullable"
        bool isActive
        int order
    }
    PAYMENT_METHOD_DEFINITION {
        string id PK
        string tenantId FK
        string name
        bool isActive
        int order
    }
    EMPLOYEE_COMPENSATION {
        string id PK
        string tenantId FK
        string employeeId FK
        enum compensationType "hourly/fixed — PayrollCompensationType, distinct from the legacy CompensationType enum"
        int rateCents
        string currency
        string payFrequencyId FK
        string jobTitle "snapshot, not linked to the People Job Title catalog"
        string description
        datetime effectiveFrom
        datetime effectiveTo "nullable, null = active"
        string note "nullable"
        string paymentMethodId FK "nullable, filled by the person"
        enum paymentAccountSubType "nullable, iban/ach/username"
        string paymentAccountDataEncrypted "nullable, AES-256-GCM ciphertext"
        datetime confirmedAt "nullable"
        string confirmedIp "nullable, evidence captured alongside confirmedAt — Unidad 7"
        bool blocksParticipation "true only if this is the employee's first-ever compensation"
        string createdByUserId FK
        bytes contractPdf "nullable, draft at creation -> overwritten with the signed version at confirmation"
    }
    PAYROLL_RUN {
        string id PK
        string tenantId FK
        string payFrequencyId FK "nullable"
        string periodLabel
        enum status "draft/confirmed"
        string createdByUserId FK
        datetime confirmedAt "nullable"
    }
    PAYROLL_ENTRY {
        string id PK
        string tenantId FK
        string employeeId FK
        string runId FK "nullable — null = a loose off-cycle entry"
        enum type "base/bonus/commission/reimbursement/deduction"
        int amountCents "can be negative"
        string currency
        float hoursQty "nullable, only for hourly"
        string label "nullable"
        datetime paymentDate
    }
```

Notas:
- **`EmployeeCompensation` es versionado, nunca un campo plano en `Employee`** — una suba de sueldo
  o un cambio de frecuencia crea un registro nuevo en vez de sobreescribir. La regla "un solo
  registro `effectiveTo: null` por empleado" se aplica en `employeeCompensationService` (a
  construirse en Unidad 2+), no a nivel de base de datos — mismo patrón que `StatusDefinition.isDefault`.
- **`PayFrequencyDefinition`/`PaymentMethodDefinition` son catálogos configurables por tenant**, no
  enums fijos — mismo precedente que `StatusDefinition`/`TimeOffPolicyDefinition`.
- **`PayrollCompensationType` (`hourly`/`fixed`) reemplaza al `CompensationType` legado**
  (`hourly`/`monthly`) — nombre distinto porque el value set cambia (`fixed` en vez de `monthly`).
- **`Employee.hourlyRateCents`/`monthlyRateCents`/`compensationType` retirados por completo (Unidad
  4, 2026-08-07)**: `scripts/backfill-legacy-employee-compensation.ts` copió cualquier dato ya
  cargado (4 registros en `staging`, todos de prueba) a un `EmployeeCompensation` inicial —
  `confirmedAt`/`blocksParticipation: false` forzados en la migración para no bloquear a gente que
  ya tenía compensación real, a diferencia de un contrato nuevo genuino (Unidad 9). Aplicado el
  patrón completo de migración segura (aditivo → backfill → verificar con query directa →
  destructivo, este último con confirmación explícita del usuario dado que Prisma no permite un
  `db push` parcial): las 3 columnas y el enum `CompensationType` **ya no existen en la base**, no
  solo en el código.
- **Restos de un intento anterior**: al aplicar esta unidad se encontraron 4 tablas huérfanas en
  `staging` (mismos nombres, forma de columnas vieja e incompatible) dejadas por un intento de
  Payroll revertido por completo del lado del código — un `git revert` no deshace un `prisma db push`
  ya aplicado. Se borraron antes de aplicar el schema nuevo.
- **Gotcha de ruteo (Unidad 7)**: `GET /api/public/contract-confirmation/:token` colisionaba con el
  catch-all genérico `GET /api/public/:tenantSlug/:formSlug` de Public Forms — misma forma de 2
  segmentos, y Express matchea por orden de registro, así que el que estaba registrado primero
  (Forms) se comía el request y devolvía siempre "Form not found". Fix: las rutas de Payroll se
  registraron *antes* que el catch-all en `src/routes/public.ts`, con un comentario explicando por
  qué el orden importa acá. Si se agrega un endpoint público nuevo bajo `/api/public/*` con 2
  segmentos de path, chequear este archivo primero.
- **En producción desde 2026-08-09.** El módulo se desarrolló completo en local (Unidades 1-21 +
  rondas de fixes) a pedido explícito del usuario 2026-08-07, y se promovió directo a `main` sin
  pasar por `staging` (también a pedido explícito). Producción no tenía ninguna tabla de este grupo
  ni el retiro de las columnas legacy de `Employee` — la migración completa (aditivo con un schema
  transicional → `scripts/backfill-payroll-catalogs.ts` → backfill de compensación legacy vía SQL
  crudo, 9 empleados de tenants de testing → verificar → destructivo con `--accept-data-loss`) se
  corrió a mano contra la base real, con conteos de tenants/empleados verificados iguales antes y
  después (126/234). Detalle completo en `docs/tareas-desarrollo.md`, entrada "Migración y deploy a
  producción (2026-08-09)".
- **`EmployeeCompensation.contractPdf` (2026-08-08, feedback del usuario)**: una sola columna que
  guarda el PDF del contrato tal cual existe en cada momento — generado como borrador al crear el
  contrato (`employeeCompensationService.createCompensation`, vía `contractPdfService.renderContractPdf`)
  y **sobrescrito** con la versión firmada (con `confirmedAt`/`confirmedIp` ya incluidos en el propio
  documento) al confirmar (`contractConfirmationService.confirmContract`) — nunca dos columnas
  separadas, la que corresponde según el estado. El borrador va adjunto al email de invitación
  (`mailer.sendInvitationEmail` ahora acepta `attachments`); al firmar se dispara un email nuevo
  (`mailer.sendContractSignedEmail`) al firmante con copia al owner del tenant y a quien cargó el
  contrato (`createdByUserId`). `POST /api/hr/employees/:employeeId/resend-contract` (owner-only)
  reenvía lo que sea que esté guardado ahora mismo, sin regenerar nada — si el borrador ya venció su
  invitación (7 días), emite una nueva antes de reenviar. `GET /api/hr/employees/:employeeId/contract-pdf`
  sirve el PDF guardado para "View contract" en el panel de People (reusa `PayslipPreviewModal` con
  props generalizados, no es un componente nuevo).

## 8. Tenant Signup + Subscription Plans

Specs completos en `docs/spec-tenant-signup.md` y `docs/spec-subscription-plans.md` (v1,
2026-08-13, breakdown en `docs/task-breakdown-signup-plans.md`). **Solo en local — sin
pushear a `staging` ni `main` todavía**, a la espera de que el usuario lo pruebe. Reemplaza el
registro de un solo paso (`RegisterPage.tsx` → `POST /api/tenants/register` directo, sin
verificar el email) por: email → verificación por link → survey de 3 pasos (Company/You/
Security) → cuenta creada → `/overview`, con `PlansModal` (Starter/Growth/Free Trial)
abriéndose una sola vez, automáticamente, encima de esa pantalla — **corregido 2026-08-13**:
la primera implementación lo hizo una ruta (`/plans`) que bloqueaba la navegación hasta elegir
un plan; Alejandro corrigió con el mockup real aprobado (`subscription-plans-mockup.html`,
pegado en el chat, nunca existió como archivo en el repo) — es un modal descartable, no un
gate, porque el trial ya arranca en el registro sin importar si se elige plan.

```mermaid
erDiagram
    TENANT ||--o{ EMAIL_VERIFICATION : "ninguna FK real - solo email"

    EMAIL_VERIFICATION {
        string id PK
        string email
        string token UK
        datetime expiresAt "24hs"
        datetime verifiedAt "nullable"
        datetime createdAt
    }
```

Notas:
- **`EmailVerification` no tiene FK a `Tenant`/`User`** — existe *antes* de que cualquiera de
  los dos se cree (Screen 1, antes de empezar el survey). `registerTenantWithOwner` la valida
  (verificada, no vencida, email coincide) y la borra recién al final, justo antes de la
  transacción de creación — a propósito, no antes: si se consumiera apenas se valida y después
  fallara otro chequeo (nombre de tenant repetido, dominio bloqueado), la persona se quedaría
  sin token válido por una falla que no tenía nada que ver con su email.
- **`Tenant` gana 5 columnas** (todas nullable/aditivas, sin migración destructiva):
  `plan` (`PlanTier?`), `trialEndsAt`/`gracePeriodEndsAt` (`DateTime?`), `lockedPriceCents`/
  `lockedPriceSetAt`. `trialEndsAt` se setea una sola vez, en `registerTenantWithOwner`
  (`now + 15 días`) — elegir/cambiar de plan en `/plans` nunca lo vuelve a tocar.
  `lockedPriceCents` es el precio que un tenant paga aunque el precio de lista cambie después
  (tabla de precios server-side en `planService.ts`, nunca confiar en un precio del cliente).
- **`TenantStatus` gana `trialing`/`past_due`** (además de `active`/`suspended`/`cancelled` ya
  existentes). Máquina de estados: `trialing` → (vence `trialEndsAt`) → `past_due`
  (`gracePeriodEndsAt = trialEndsAt + 14 días`, acceso completo, solo banner) → (vence
  `gracePeriodEndsAt`) → `suspended`. Corrida por `planTransitionService.runPlanTransitions()`,
  disparada por un Vercel Cron nuevo (`vercel.json` → `/api/internal/plan-transitions/run`,
  1 vez/día) — no existía ningún mecanismo de cron en el proyecto antes de esto.
- **`checkEmailDomainNotAlreadyRegistered`** (extraído de `registerTenantWithOwner` a
  `tenantService.ts`, reusado por `emailVerificationService.ts`) ahora excluye tenants
  `cancelled` del match en vez de solo permitir `active` — antes de este cambio, un tenant
  `trialing`/`past_due` (que no existían como estados) no aplicaba; ahora sí bloquean un
  dominio duplicado igual que `active`, y solo `cancelled` (compañía que se fue) no bloquea.
- **`User.jobFunction`** (`JobFunction?`, nuevo enum) — "tu rol en la empresa" del survey
  (Screen 3b), deliberadamente no reusa `UserRole` (que es el enum de permisos owner/admin/
  member).
- **Sin enforcement de acceso para `suspended` todavía** — un tenant suspendido sigue
  técnicamente accesible hoy (nada en el código bloquea requests por `tenant.status`), fuera de
  alcance de este spec (ver "Qué falta" abajo).

## 9. Google Calendar sync + cumpleaños

Pedido por Alejandro 2026-08-22: notificaciones de eventos de la plataforma vía Google Calendar
(sync unidireccional Northstack → Google, las notificaciones las da el propio Google, no se
construyó ningún sistema de notificaciones in-app), cumpleaños de empleados visibles en el
Overview, y tareas completadas ocultas del Overview (esto último no toca el schema — ver grupo 6).
Primer OAuth de toda la app — no existía ninguno antes. **Solo en local — sin pushear a `staging`
ni `main` todavía**, a la espera de credenciales reales de Google Cloud
(`GOOGLE_CALENDAR_CLIENT_SECRET`/`REDIRECT_URI`) que Alejandro todavía no cargó.

```mermaid
erDiagram
    TENANT ||--o{ GOOGLE_CALENDAR_CONNECTION : "has"
    USER ||--o| GOOGLE_CALENDAR_CONNECTION : "connects, 1:1"

    GOOGLE_CALENDAR_CONNECTION {
        string id PK
        string tenantId FK
        string userId FK "unique - one Google account per platform user"
        string googleAccountEmail
        string accessTokenEncrypted "AES-256-GCM, lib/googleTokenEncryption.ts"
        string refreshTokenEncrypted "AES-256-GCM, lib/googleTokenEncryption.ts"
        datetime accessTokenExpiresAt
        string scope
        bool needsReconnect "default false - set when Google reports invalid_grant"
        datetime createdAt
        datetime updatedAt
    }
    GOOGLE_OAUTH_STATE {
        string id PK
        string state UK "single-use, deleted on successful callback"
        string userId "no FK - just carries identity across the redirect"
        string tenantId "no FK - ídem"
        datetime createdAt "rows older than 10 min are rejected"
    }

    TENANT ||--o{ TIME_OFF_CALENDAR_SYNC : "has"
    TIME_OFF_REQUEST ||--o{ TIME_OFF_CALENDAR_SYNC : "fans out to"
    USER ||--o{ TIME_OFF_CALENDAR_SYNC : "sees on their calendar"

    TIME_OFF_CALENDAR_SYNC {
        string id PK
        string tenantId FK
        string timeOffRequestId FK
        string userId FK "the viewer whose calendar this event lives on"
        string googleCalendarEventId
        datetime createdAt
    }

    USER ||--o| GOOGLE_CALENDAR_WATCH_CHANNEL : "watches, 1:1"

    GOOGLE_CALENDAR_WATCH_CHANNEL {
        string id PK
        string userId FK "unique - one active channel per connected user"
        string channelId UK "our own id, sent to Google as watch()'s id"
        string resourceId "Google's opaque id for the watched resource"
        string channelToken "shared secret set at watch() time, verified against X-Goog-Channel-Token"
        string syncToken "nullable - incremental cursor for events.list(), null until first notification"
        datetime expiration "channel stops delivering after this - renewed daily by cron"
    }
```

Notas:
- **`GoogleCalendarConnection` es 1:1 con `User`** (`userId @unique`) — cada persona conecta su
  propia cuenta de Google, no hay conexión a nivel tenant/admin. Vive en Settings → Profile ("My
  account", visible a cualquier rol), no en la tile "Integrations" (Company, admin-only, todavía
  deshabilitada) de `SettingsHomePage.tsx` — esa es para integraciones a nivel tenant, algo distinto.
- **`GoogleOAuthState` existe solo por el round-trip stateless de Vercel**: `/connect` y
  `/callback` son dos invocaciones de función separadas sin memoria compartida, así que la
  identidad del usuario que inició el flujo tiene que sobrevivir en la base, no en memoria — mismo
  patrón lookup-por-token que `Session`. Fila de un solo uso, se borra en el callback exitoso.
- **Tokens encriptados con su propia key** (`GOOGLE_TOKEN_ENCRYPTION_KEY`), no la de Payroll
  (`PAYMENT_DATA_ENCRYPTION_KEY`) — mismo mecanismo AES-256-GCM (`lib/encryption.ts`), pero un key
  distinto por propósito, a propósito (ver comentario en `lib/encryption.ts`).
- **`needsReconnect`** se prende cuando Google devuelve `invalid_grant` (refresh token revocado) —
  la fila no se borra sola, así la UI puede mostrar "reconnect" con el email de la cuenta en vez de
  "not connected". Solo se borra de verdad al hacer click en "Disconnect".
- **Sync es reactivo, no hay reconciliación periódica**: `syncTaskCalendarEvent`/
  `syncTimeOffCalendarEvent` (`src/modules/integrations/googleCalendarSyncService.ts`) corren
  best-effort inmediatamente después de cada create/update/delete de Task o cada cambio de status
  de TimeOffRequest. Si alguien borra el evento a mano del lado de Google, no se recrea solo.
  `backfillCalendarSyncForUser` corre una sola vez, justo al conectar, para no dejar afuera lo que
  ya estaba pendiente antes de esa conexión (sync reactivo no mira para atrás).
- **Task es personal, Time Off es de todo el equipo — asimetría deliberada** (2026-08-23,
  corrección de Alejandro sobre el diseño original): un Task solo aparece en el calendario de su
  `assigneeId` (`Task.googleCalendarEventId`, 1 registro → 1 evento, grupo 6). Un Time Off
  aprobado, en cambio, aparece en el calendario de **todos** los usuarios conectados del tenant —
  mismo criterio que la vista compartida de Time Off en el Overview — por eso 1 `TimeOffRequest`
  puede generar N filas en `TimeOffCalendarSync` (una por cada `GoogleCalendarConnection` del
  tenant), no un solo `googleCalendarEventId` en el propio `TimeOffRequest`.
- **`Employee.birthdate`** (`DateTime? @db.Date`, grupo 2) — sin encriptar, mismo criterio que
  `startDate`/`endDate`/`nationality` (no es dato tan sensible como para justificar el mecanismo de
  `EmployeeCompensation`). Se muestra como evento anual recurrente (match por mes+día, año
  ignorado) en el calendario del Overview — **nunca se sincroniza a Google**, decisión explícita de
  Alejandro (2026-08-22) para mantener esto interno.
- **`GoogleCalendarWatchChannel` — sync inverso (Google → Northstack), solo Tasks** (2026-08-23,
  pedido explícito de Alejandro tras probar el sync unidireccional). Time Off queda afuera a
  propósito: al ser de todo el equipo, "quién puede editarlo de vuelta" no tiene una respuesta
  limpia. Un canal por usuario conectado (`userId @unique`), abierto al conectar
  (`src/modules/integrations/googleCalendarWatchService.ts`'s `openWatchChannelForUser`, llamado
  desde el callback de OAuth junto al backfill) y renovado a diario por el cron
  `/api/internal/google-calendar-channels/renew` (`vercel.json`) — los canales de Google no se
  renuevan in-place, solo se cierran y se abren de nuevo, por eso hace falta el cron en vez de
  fijar una fecha de vencimiento larga y listo. Las notificaciones de Google no traen datos, solo
  avisan "algo cambió" — `channelToken` es la única verificación de que la notificación es legítima
  (Google no firma el body como sí hacen Paddle/Mercado Pago), y `syncToken` es el cursor que
  permite pedirle a Google el diff real vía `events.list`. Solo se tocan Tasks cuyo
  `googleCalendarEventId` ya estaba trackeado — nunca se lee el calendario completo del usuario.
  **No se puede probar contra `localhost`** — Google no puede llegarle a una máquina local, así que
  esta pieza solo se verifica de punta a punta contra `staging`/producción.

## 10. Payments v1 — conexión con Stripe

Pedido por Alejandro 2026-08-26 (`docs/tareas/specpaymentsv1.md`), Units 1-7 completas, todo en
`staging` esperando revisión del usuario — nada de esto está en `main`/producción todavía. Cada
tenant conecta su **propia** cuenta de Stripe (Restricted Key pegada a mano — Northstack
confirmó con el soporte de Stripe que OAuth/Connect requiere una entidad legal tipo LLC que
Northstack no tiene todavía, mismo bloqueo ya anotado para su propia suscripción vía Paddle/Mercado
Pago). Solo lectura: nada acá crea charges/invoices/subscriptions.

Unit 4 (notificaciones proactivas) se **rediseñó 2026-08-28** (ver QA-49/QA-50 en `Tareas-QA.md`):
originalmente un webhook que cada tenant tenía que registrar a mano en su dashboard de Stripe
(URL + signing secret) — reemplazado por un cron diario (`src/routes/internal.ts`,
`runStripeEventPolling`) que hace polling de `GET /v1/events` con la misma Restricted Key. Cero
pasos manuales extra para el tenant; `StripeConnection.webhookSigningSecretEncrypted` se sacó del
schema, se agregó `lastEventPollAt` (cursor del cron, arranca en `connectedAt` en el primer poll).

```mermaid
erDiagram
    TENANT ||--o| STRIPE_CONNECTION : "has, 1:1"
    USER ||--o{ STRIPE_CONNECTION : "connected by"

    STRIPE_CONNECTION {
        string id PK
        string tenantId FK UK "one connection per tenant"
        string apiKeyEncrypted "AES-256-GCM, lib/stripeEncryption.ts"
        string apiKeyMode "'test' | 'live', detected from the key's own prefix"
        string stripeAccountId "nullable - GET /account can 401 for a scoped Restricted Key"
        string connectedByUserId FK
        datetime connectedAt
        datetime disconnectedAt "nullable - soft, row survives a disconnect"
        bool needsAttention "default false - flips true when Stripe rejects the stored key"
        datetime lastEventPollAt "nullable - cursor for the daily events-polling cron"
    }
```

Notas:
- **1:1 con `Tenant`** (`tenantId @unique`) — a diferencia de `GoogleCalendarConnection` (1:1 con
  `User`), esta es una conexión a nivel tenant: cualquier owner ve/gestiona la misma, no una por
  persona.
- **Sin SDK de Stripe** — `src/lib/stripe.ts` es un wrapper propio (`fetch` + `crypto` nativos),
  mismo criterio ya establecido por `lib/paddle.ts`/`lib/mercadopago.ts` (evitar una dependencia
  nueva para un puñado de llamadas REST). A diferencia de esos dos, no hay una sola API key fija en
  una env var — cada tenant tiene la suya, así que toda función de `stripe.ts` la recibe como
  parámetro en vez de leerla de `process.env`.
- **Cifrado con key propia** (`STRIPE_TOKEN_ENCRYPTION_KEY`), ni la de Payroll
  (`PAYMENT_DATA_ENCRYPTION_KEY`) ni la de Google (`GOOGLE_TOKEN_ENCRYPTION_KEY`) — mismo mecanismo
  AES-256-GCM, un key por propósito (ver comentario en `lib/encryption.ts`).
- **`needsAttention`** — mismo espíritu que `GoogleCalendarConnection.needsReconnect`: se prende
  cuando Stripe rechaza la key guardada (401/403) en vez de que las lecturas fallen en silencio; la
  fila no se borra sola.
- **Soft disconnect** (`disconnectedAt`, no se borra la fila) — mismo criterio que
  `Contact.isActive`/`Opportunity.isActive` del rediseño de Sales v2: conserva el historial (quién
  conectó, cuándo) y deja que un reconnect futuro pase por el mismo `upsert()` que un connect nuevo,
  en vez de una segunda fila.
- **Permisos: owner-only** (`canManagePayments`, `permissionService.ts`) — la spec original decía
  "owner/admin, mismo criterio que Payroll", pero el gate real de Payroll es owner-only; Alejandro
  confirmó owner-only acá también, deliberadamente enrutado a través de este permiso nombrado (no un
  `role === 'owner'` inline en cada endpoint) para no tener que tocar cada call site cuando exista
  el sistema de roles custom (Tier 5).

**Unit 2 (2026-08-26, en `staging`) — lookup/matching Company↔Stripe Customer**: aditivo sobre
`Company` (grupo 5), sin modelo nuevo:

```
Company.stripeCustomerId          String?
Company.stripeCustomerMatchedVia  String?  // snapshot del email de Contact que produjo el match
```

Matching por email exacto de cada `Contact` activo de la Company contra Stripe (nunca por dominio),
confirmado manualmente (0/1/2+ resultados) — nunca automático. `stripeCustomerMatchedVia` guarda el
*email*, no una FK al Contact, mismo criterio que `StatusHistoryEntry` guardando un nombre en vez de
una FK viva (sobrevive a que ese Contact cambie de email o se desactive después).

**Unit 3 (2026-08-26, en `staging`) — visibilidad de pagos en vivo**: sin schema nuevo — todo se
resuelve en vivo contra la API de Stripe (decisión #7 de la spec, sin store histórico). El único
dato persistido es el vínculo de Unit 2 de arriba; refunds/failed/subscripciones se recalculan en
cada request.

**Unit 4 (2026-08-26, rediseñada 2026-08-28, en `staging`) — notificaciones proactivas**: aditivo
sobre `enum NotificationType` (grupo de Sales v2/Notification), sin modelo nuevo — reusa
`Notification` tal cual ya existía:

```
NotificationType += stripe_charge_refunded | stripe_charge_failed | stripe_payment_failed
                  | stripe_subscription_past_due | stripe_subscription_canceled
```

Diseño original: `POST /api/webhooks/stripe/:tenantId` (`src/routes/webhooks.ts`, junto a
Paddle/Mercado Pago), cada tenant registrando la URL + signing secret a mano en su dashboard de
Stripe. **Reemplazado el 2026-08-28** por un cron diario (`runStripeEventPolling`,
`src/routes/internal.ts`, `GET /api/internal/stripe-events/poll`, `0 9 * * *`) que hace polling de
`GET /v1/events` con la misma Restricted Key — cero setup manual para el tenant. El handler que
resuelve la Company por `stripeCustomerId` y crea la `Notification` (`processStripeWebhookEvent`,
`stripePaymentsService.ts`) no cambió: Stripe devuelve el mismo shape de Event por polling o por
push, solo cambió quién lo llama. Deliberadamente sin `ProcessedWebhookEvent` (esa tabla es de
Paddle/MP, `enum PaymentProvider` no ganó un valor `stripe`) — el propio spec acepta el riesgo de
una notificación duplicada, a cambio de no construir idempotencia pesada para una feature de
solo-avisar; `lastEventPollAt` (arriba) es el único cursor. `customer.subscription.updated` es el
único evento con una guarda real: solo notifica si `data.previous_attributes.status` está presente
y el status nuevo es `past_due` — sin eso, cualquier otro cambio a una subscription ya `past_due`
re-notificaría en cada corrida.

**Unit 5 (2026-08-28, en `staging`) — auto-vincular Companies**: sin schema nuevo —
`autoLinkUnmatchedCompanies(tenantId)` corre antes del polling de eventos de arriba, en la misma
corrida del cron, y reusa el matching de la Unit 2 (mismo `stripeCustomerId`/
`stripeCustomerMatchedVia`) sin tocarlo. Solo vincula automático cuando hay exactamente 1 match; 0 o
2+ quedan para el flujo manual.

**Unit 6 (2026-08-29, en `staging`) — historial de pagos por Company**: sin schema nuevo — el único
campo que faltaba exponer era `receipt_url` del propio objeto Charge de Stripe (ya lo trae por
default, no requería `expand`), ahora tipado en `StripeCharge` (`lib/stripe.ts`) y expuesto como
`receiptUrl` en cada evento de `GET /api/payments/companies/:id/events` (Unit 3). Consumido por un
Modal nuevo (`CompanyPaymentHistoryModal.tsx`), no por una ruta — mismo patrón de overlay que el
resto del detalle de la app.

**Unit 7 (2026-08-29, en `staging`) — Company profile: vista general de Payments**: sin schema
nuevo — `summarizeCharges` (`stripePaymentsService.ts`) ahora también calcula, sobre la misma lista
de Charges de la Unit 3, `paymentsCount`/`paymentsAmountCents` (cargos `succeeded`, no existía un
total antes), `disputesCount`/`disputesAmountCents` (`charge.disputed`, campo nativo del Charge,
mismo patrón que `refunded`/`amount_refunded`) y `firstPaymentAt` (el más antiguo entre los cargos
exitosos ya traídos, mismo límite de 100 cargos que el resto de este resumen). Extensión aditiva de
`StripePaymentSummary` — `PaymentsOverviewPage.tsx` sigue leyendo los campos viejos tal cual.

## 11. Employee Termination

Pedido pendiente desde el backlog original ("falta proceso de termination para dar de baja
empleados"), planificado y construido 2026-08-29 — plan completo en
`C:\Users\aleja\.claude\plans\bueno-yo-te-voy-valiant-whisper.md`. En `staging`, no en `main`.
Status change coordinado, no un delete — mismo espíritu "hide, don't destroy" que
`Contact.isActive`/`Opportunity.isActive` (grupo 5).

```mermaid
erDiagram
    TENANT ||--o{ EMPLOYEE_TERMINATION : "has"
    EMPLOYEE ||--o{ EMPLOYEE_TERMINATION : "terminated"
    USER ||--o{ EMPLOYEE_TERMINATION : "created by"
    EMPLOYEE_TERMINATION ||--o{ EMPLOYEE_TERMINATION_REASSIGNMENT : "has"

    EMPLOYEE_TERMINATION {
        string id PK
        string tenantId FK
        string employeeId FK
        datetime terminationDate "last day — can be past, today, or future"
        bool revokeAccess "default false"
        string[] finalPaymentEntryIds "PayrollEntry.id per line — primary payment + any bonus/commission/reimbursement/deduction lines"
        string createdByUserId FK
        datetime createdAt
        datetime executedAt "nullable - null = still scheduled (future date)"
        datetime cancelledAt "nullable - admin cancelled before it executed"
    }
    EMPLOYEE_TERMINATION_REASSIGNMENT {
        string id PK
        string terminationId FK
        string reportEmployeeId "the direct report being reassigned"
        string newManagerId "nullable - null = explicitly left with no manager"
    }
```

Notas:
- **Registro de auditoría, nunca se pisa ni se borra** — cada baja (ejecutada o programada) queda
  como una fila propia, mismo instinto que `StatusHistoryEntry`, pero para este evento de negocio
  específico en vez de cambios de status genéricos.
- **Ejecución diferida** — `terminationDate` soporta pasado/hoy/futuro (decisión confirmada con el
  usuario, la que más cambió el diseño respecto a una simple mutación síncrona). Si
  `terminationDate <= hoy` al crearla, `executeTermination` corre en el mismo request
  (`executedAt` queda seteado). Si es futura, solo se crea el registro — un cron diario
  (`runScheduledTerminations`, `src/routes/internal.ts`, `0 10 * * *`) busca
  `terminationDate <= hoy AND executedAt: null AND cancelledAt: null` y ejecuta lo vencido.
- **`executeTermination` (interna a `terminationService.ts`), reusada por ambos caminos**: status
  del Employee → "Terminated" (find-or-create por tenant vía nombre — no está en
  `DEFAULT_STATUSES`/`statusService.ts`, se crea la primera vez que se termina a alguien en ese
  tenant, `isDefault: false`); `Employee.endDate = terminationDate`; cierra la
  `EmployeeCompensation` abierta (`effectiveTo = terminationDate`, grupo 7 — esto es lo que
  realmente saca al empleado de futuros Payroll runs, que filtran por `effectiveTo: null`); si
  `revokeAccess` y hay `userId`, `User.status = 'inactive'`; cancela `TimeOffRequest` pendiente o
  aprobada-a-futuro **a través del flujo real de cambio de status** (no un update crudo), para que
  `syncTimeOffCalendarEvent` (grupo 9) limpie el evento en Google Calendar de otros usuarios; aplica
  cada `EmployeeTerminationReassignment`.
- **`finalPaymentEntryIds` es un array**, no una FK única — el pago final admite múltiples líneas
  (la principal más cualquier bonus/commission/reimbursement/deduction agregado en el mismo modal,
  mismas opciones que un `PayrollEntry` normal de Payroll, grupo 7), cada una su propio
  `PayrollEntry` (`runId: null`, reusa `createOffPayments`/Payroll Unidad 18-19 tal cual). Se crea
  siempre en el momento de dar de alta la baja, sea inmediata o programada — el pago suelto ya tiene
  su propia fecha, independiente de cuándo se ejecute la baja en sí.
- **Reasignación de reportes directos completa, no solo lo tocado en el modal** — al crear la baja
  se arma la lista completa de reportes directos del empleado; los que el admin no reasignó
  explícitamente también quedan con una fila (`newManagerId: null`), para que
  `executeTermination` los limpie a todos, no solo a los tocados.
- **Fuera de alcance deliberado**: reactivar/rehire (editar el status a mano ya es posible, pero sin
  flujo dedicado ni vínculo con el `EmployeeTermination` anterior); el hard-delete roto preexistente
  de `deleteEmployee` (bug real, no de esta feature — termination es la alternativa correcta a usar
  en su lugar, no un fix de ese bug puntual); campo de "razón de baja" (no se pidió, este modelo es
  el lugar natural si se agrega después).

## 12. Billing Integration

Suscripción propia de Northstack (no confundir con Payments v1, grupo 10, que es la conexión de
Stripe de *cada tenant* con *sus propios* clientes) — Paddle para mercado internacional/USD,
Mercado Pago para Argentina/ARS. Spec en `docs/general/spec-billing-integration.md`. **En
producción (`main`)** desde 2026-08-23, después de una code review que encontró y corrigió 7 bugs
antes de salir.

```mermaid
erDiagram
    TENANT ||--o| SUBSCRIPTION : "has, 1:1"
    SUBSCRIPTION ||--o{ INVOICE : "has"
    USER ||--o{ SUBSCRIPTION : "last acted on (nullable, rolling pointer)"

    SUBSCRIPTION {
        string id PK
        string tenantId FK UK "one live subscription per tenant"
        enum plan "PlanTier — starter/growth/scale"
        enum status "trialing/active/past_due/suspended/cancelled"
        enum provider "nullable - paddle/mercadopago, null until a payment method is attached"
        string externalSubscriptionId "nullable - Paddle subscription id, or MP preapproval_id"
        int lockedPriceCents
        string currency "USD (Paddle) | ARS (Mercado Pago)"
        datetime trialEndsAt "nullable"
        datetime gracePeriodEndsAt "nullable"
        datetime currentPeriodStart "nullable"
        datetime currentPeriodEnd "nullable"
        datetime cancelledAt "nullable - when cancellation was requested"
        datetime cancellationEffectiveAt "nullable - = currentPeriodEnd at request time"
        string cancellationReason "nullable"
        string paymentMethodBrand "nullable - display only, e.g. 'visa'"
        string paymentMethodLast4 "nullable"
        string lastActionByUserId FK "nullable - rolling 'who touched this last' pointer (Activity Log Unidad 6, grupo 13)"
        datetime lastActionAt "nullable, paired with lastActionByUserId"
    }
    INVOICE {
        string id PK
        string subscriptionId FK
        enum provider "paddle/mercadopago"
        string externalInvoiceId "nullable"
        int amountCents
        string currency
        string status "paid | failed | refunded"
        datetime periodStart
        datetime periodEnd
        datetime paidAt "nullable"
    }
    PLAN_PRICE {
        string id PK
        enum plan "PlanTier"
        string market "'international' | 'ar'"
        string currency "USD | ARS"
        int launchPriceCents
        int regularPriceCents
        datetime effectiveFrom
    }
    PROCESSED_WEBHOOK_EVENT {
        string id PK
        enum provider "paddle/mercadopago"
        string externalEventId
        datetime processedAt
    }
```

Notas:
- **`PlanPrice` — catálogo de precios versionado, nunca se edita una fila existente**: un cambio de
  precio inserta una fila nueva con un `effectiveFrom` posterior en vez de sobreescribir —
  `Subscription.lockedPriceCents` ya congela lo que cada tenant paga de verdad, así que este
  catálogo solo importa para nuevas suscripciones.
- **`ProcessedWebhookEvent` — idempotencia de webhooks vía `@@unique([provider, externalEventId])`**:
  contrato "insert-then-process" — una entrega duplicada del mismo evento falla el insert (constraint
  de unicidad) en vez de procesarse dos veces, incluso ante una carrera concurrente. Deliberadamente
  **no compartida con Payments v1** (grupo 10) — ese usa polling con `lastEventPollAt` como cursor
  en vez de un webhook, así que no necesita esta tabla; `PaymentProvider` nunca ganó un valor
  `stripe`.
- **Sin SDK de ningún proveedor** — `src/lib/paddle.ts`/`src/lib/mercadopago.ts` son wrappers
  propios (`fetch` + `crypto` nativos), mismo criterio que después se repitió para `lib/stripe.ts`
  (grupo 10).
- **`Subscription.provider` nullable** — durante el trial, antes de que el tenant cargue un método
  de pago, no hay proveedor asignado todavía.
- **Enforcement real de `status: suspended`**: `httpAuth.ts` bloquea toda mutación (no-GET) de un
  tenant suspendido — verificado en el código, no solo declarado en el schema.

## 13. Activity Log

Spec en `docs/general/spec-activity-log.md` (2026-08-30) — auditoría de "quién hizo qué" en la
plataforma. Pedido explícito de Alejandro: un tab de actividad *por registro* dentro de los modales
de detalle de Employee/Company/Contact/Opportunity, más un feed *tenant-wide* en Settings.
**Unidades 1-6 completas, en `staging`**: schema + mecanismo genérico + permiso + rutas (Unidad 1),
wiring real de create/update/delete de Employee/Company/Contact/Opportunity + sus custom field
values (Unidad 2, con un scope cut documentado — ver el spec §6: CSV import/onboarding seed/Public
Forms no generan entradas todavía), el frontend (Unidad 3) — tab "Activity" real en los 4 modales +
`Settings → Activity Log` con filtros, verificado con Playwright contra `staging` real — la
extensión a HR/Payroll (Unidad 4: TimeOffPolicy/TimeOffRequest/StatusDefinition/
CustomFieldDefinition/FieldCatalogDefinition/PayFrequency/PaymentMethod/EmployeeCompensation/
EmployeeTermination/PayrollRun), la extensión al resto de CRM + cross-module + vistas/forms
(Unidad 5: Pipeline/PipelineStage/Task/Note/Tag/SavedView/PublicForm), y la extensión a
cuenta/plataforma (Unidad 6: Tenant/User/Invitation, más — en una segunda pasada el 2026-08-31,
tras una pregunta de Alejandro sobre atribución en cambios disparados por webhook — Subscription/
GoogleCalendarConnection/StripeConnection). Todas verificadas contra `staging` real (Playwright o
corrida directa contra la base según el caso).

```mermaid
erDiagram
    TENANT ||--o{ ACTIVITY_LOG_ENTRY : "has"
    USER ||--o{ ACTIVITY_LOG_ENTRY : "changed by"

    ACTIVITY_LOG_ENTRY {
        string id PK
        string tenantId FK
        enum entityType "ActivityEntityType — 27 valores, ver más abajo"
        string entityId "no live FK, mismo patrón que Task/Note/StatusHistoryEntry"
        string entityLabel "snapshot del nombre visible al momento"
        enum parentEntityType "nullable — solo Task/Note/Tag, la entidad a la que están adjuntas (fix 2026-08-30)"
        string parentEntityId "nullable, idem"
        enum action "create/update/delete"
        string summary "una línea, auto-generada"
        string changes "nullable, JSON de {field,label,oldValue,newValue}[]"
        string changedByUserId FK
        datetime changedAt
    }
```

Notas:
- **`ActivityEntityType` es un enum propio, no una extensión de `EntityType`** (grupo 2) — `EntityType`
  está acoplado a qué módulos soportan custom fields/status/tags; la mayoría de los 27 valores de
  `ActivityEntityType` (`payrollRun`, `invitation`, `subscription`...) nunca tendrían sentido ahí. Los
  primeros 4 valores (`employee`/`company`/`contact`/`opportunity`) son las mismas strings que
  `EntityType` a propósito, para reusar `findEntityTenantId` (`entityLookup.ts`) sin traducir.
- **`entityLabel` es un snapshot, no una FK viva** — mismo criterio que
  `StatusHistoryEntry.fromStatusName`/`toStatusName`: un rename o borrado posterior no reescribe lo
  que significaba una entrada vieja.
- **`changes` se arma con un solo mecanismo para las 3 acciones** (`activityLogService.ts`'s
  `diffEntity`) — create diffea contra `before: null` (todo aparece como "set"), delete contra
  `after: null` ("cleared"), update entre dos snapshots reales. Nunca tres formatos de mensaje
  distintos escritos a mano por cada service.
- **Escritura best-effort** (`src/lib/bestEffort.ts`) — si registrar la actividad falla, la
  operación real (ya confirmada) no se revierte. No es fire-and-forget sin awaitear: ese patrón ya
  rompió los emails de verificación de signup en Vercel serverless (ver la nota del propio archivo).
- **Acceso**: el tab por registro no tiene gate propio (si podés abrir el modal, ves su Activity,
  mismo criterio que Notes/Tasks). El feed tenant-wide de Settings sí — `canViewActivityLog`
  (owner/admin hoy, `permissionService.ts`), a diferencia de Payroll/Billing/Payments que son
  owner-only — decisión explícita de Alejandro, con la intención de que un custom role futuro pueda
  heredar este permiso sin tocar cada call site.
- **Sin backfill posible** — no existe ningún historial previo real de "quién cambió qué campo" en
  el código (`StatusHistoryEntry` es el único precedente y solo cubre status). El log arranca vacío
  desde que cada unidad se despliega.
- **`parentEntityType`/`parentEntityId` (2026-08-30, push aditivo, mismo día que las Unidades 1-6)**
  — fix encontrado al probar en vivo: el tab de Activity de un Employee/Company/Contact/Opportunity
  no mostraba las Notes/Tasks/Tags creadas ahí (decisión original: ya tienen su propio tab, sería
  ruido). En la práctica "Activity" se espera que muestre *todo* lo que le pasó al registro, no solo
  cambios de sus propios campos. Una Task/Note/Tag sigue logueándose contra sí misma (`entityType:
  task/note/tag`, el summary dice "Created Note ..." correctamente) pero ahora también carga
  `parentEntityType`/`parentEntityId` con la entidad a la que está adjunta;
  `listActivityForEntity` matchea por `(entityType, entityId)` **o**
  `(parentEntityType, parentEntityId)`. El feed tenant-wide de Settings no cambió — sigue sin usar
  `parentEntityType`, así que no hay filas duplicadas ahí.
- **`Subscription.lastActionByUserId`/`lastActionAt` (2026-08-31, push aditivo)** — puntero
  rolling "quién tocó esto último", sin historial. Los webhooks de Paddle/Mercado Pago nunca
  traen un user id en su payload (limitación real de esas plataformas), así que
  `syncSubscriptionAndTenant` (el único writer real de `Subscription`) lo lee al confirmar un
  cambio: usa el `changedByUserId` directo si viene de un self-serve síncrono
  (`changePlan`/`requestCancellation`/`resumeSubscription`), y si no, cae a este puntero — solo
  si tiene menos de 60 minutos de antigüedad (`SUBSCRIPTION_ACTOR_TRUST_WINDOW_MS`,
  `subscriptionService.ts`). Escrito por esos 3 self-serve y por `startCheckout` (vía
  `recordSubscriptionActionAttempt`, que solo graba esta metadata, nunca estado de facturación).
  Sin actor directo ni puntero fresco, no se loguea nada — mismo criterio de siempre. Verificado
  contra `staging` real (sin llamar a ningún proveedor externo).
- **GoogleCalendarConnection/StripeConnection (2026-08-31)** — conectar/desconectar sí tienen un
  actor real disponible de forma síncrona en el mismo call site (`stateRow.userId` del callback
  OAuth de Google; `userId` ya era parámetro de `connectStripe`, se agregó a `disconnectStripe`)
  — sin necesidad de ningún mecanismo de correlación. Los flips en background (`needsReconnect`,
  `needsAttention`) siguen sin loguear — no hay actor real ahí. `disconnectStripe` se loguea
  como `action: 'delete'` (no `'update'` diffeando `disconnectedAt`, que no está en el field
  config y produciría un diff vacío silenciosamente descartado).

## 14. Custom Roles

Spec en `docs/tareas/backlog.md` ("Sistema de roles custom / permisología", Tier 5) — reemplaza el
enum fijo `owner`/`admin`/`member` por roles editables por tenant, con permisos de módulo, un scope
por registro para Employees (self/departamento/todos), y restricciones campo por campo. **Fase A
completa** (schema aditivo + seed/backfill + `RoleContext` resuelto sin consumidores). **Fase B
completa**: `permissionService.ts` migró sus 10 funciones a leer `RoleContext` en vez del enum
legacy; el viejo `canViewHr`/`canCreateHr` (que gateaba Employee/Company/Contact/Opportunity todos
juntos) se separó en un par view/manage por entidad (`canViewEmployee`/`canManageEmployee`,
`canViewCompany`/`canManageCompany`, `canViewContact`/`canManageContact`) más `canViewOpportunity`
**derivado** (`canViewCompany && canViewContact` — nunca un permiso propio, ver más abajo) y
`canManageOpportunity`; `canViewHr`/`canCreateHr` se mantienen sin cambios semánticos, ahora solo
para `Client` (legacy) y el seeder de datos de ejemplo del onboarding. 3 permisos nombrados nuevos
(`manage_tenant_settings`, `manage_shared_views`, `decide_time_off`) reemplazan los últimos 3
chequeos inline de rol del código (moneda del tenant, crear Saved View compartida, aprobar Time
Off — este último sigue OR-eado con la regla de "es el manager asignado"). Gap real cerrado:
`createInvitation` ya no permite `role: 'owner'` bajo ninguna circunstancia (antes solo el frontend
lo bloqueaba). CSV de Employees pasó de `view_hr`/`create_hr` a requerir `canManagePayroll`.
`User.roleId`/`Invitation.roleId` se mantienen sincronizados con el enum `role` cada vez que
`tenantUserService.ts`/`invitationService.ts` todavía lo escriben directo (`findSeedRoleId`), hasta
que Fase I los rediseñe para trabajar con `roleId` de cualquier rol custom. Backfill de Fase A
corrido contra `staging` (184 tenants, 189 Users, 17 Invitations) + top-up de Fase B
(`scripts/backfill-fase-b-permissions.ts`, agrega los permisos nuevos a los roles Admin/Member ya
sembrados).

**Fase B2 (primera UI real)**: `Settings → Roles & Permissions` (owner-only, ícono de candado,
grupo "Company" del nav) — matriz de permisos × Owner/Admin/Member, toggles con autosave.
`GET /api/roles` / `PATCH /api/roles/:roleId/permissions` (`src/routes/roles.ts`,
`roleManagementService.ts`) gateados por `roleContext.isOwner` directo, no por un permiso nombrado
— reconfigurar lo que puede hacer Admin/Member es en sí una decisión de ownership. Expone
`TOGGLEABLE_PERMISSION_KEYS` (subconjunto de `PERMISSION_KEYS` con enforcement real hoy — 18
permisos, excluye el legacy `view_hr`/`create_hr` y las convenciones de Employee sin Fase D/E
todavía) y aplica `PERMISSION_PREREQUISITES`/`DEPENDENT_PERMISSIONS` (conceder `manage_opportunity`
exige `view_company`+`view_contact` ya concedidos; revocar cualquiera de los dos cascada a revocar
`manage_opportunity` también, para que nunca quede un permiso "dormido" que resucite solo al
volver a conceder el prerrequisito). Verificado con Playwright real contra `staging` (toggle real,
persistencia tras reload, bloqueo de la cascada, claro y oscuro).

**Extensión same-day**: Alejandro pidió explícitamente no perder de vista que un tenant tiene que
poder crear un rol custom de verdad, con nombre propio, persistido — no solo reconfigurar Admin/
Member. Agregado a la misma página: `POST /api/roles` (`name`, `duplicateFromRoleId?` — copia los
permisos de un rol existente como punto de partida; duplicar desde Owner copia explícitamente todo
`TOGGLEABLE_PERMISSION_KEYS`, porque Owner en sí no tiene filas de permiso), `PATCH /api/roles/:id`
(rename) y `DELETE /api/roles/:id` — los 3 rechazan tocar el rol Owner o un nombre "owner"
(case-insensitive), y `deleteRole` bloquea por completo (no reasigna en silencio) si todavía hay
algún User/Invitation pendiente apuntando a ese rol. La matriz de la UI pasó de 4 columnas fijas
(label+Owner+Admin+Member) a `N` columnas dinámicas (`grid-template-columns` calculado en JS según
`editableRoles.length`) — cada rol nuevo aparece como una columna más, con su propio menú de
Rename/Delete (`RoleColumnMenu.tsx`, mismo patrón Popover que `CustomFieldColumnMenu`). Verificado
con Playwright real: crear un rol duplicando Admin, confirmar que copió los permisos, renombrarlo,
intentar crear uno llamado "Owner" (rechazado), borrarlo, confirmar que la columna desaparece.
Nada de esto llegó a `main` todavía.

**Fase C (field-level, campos fijos): completa.** `RoleFieldRestriction` pasa de tabla sembrada-
pero-sin-consumidor a enforcement real. `src/modules/auth/fieldVisibilityService.ts` (nuevo) es el
único punto de decisión: `isFieldVisible(role, entityType, fieldKey)` primero corta camino si
`role.isOwner`, después exige el permiso base del módulo (`MODULE_GATE_BY_ENTITY_TYPE` —
`canViewEmployee`/`canViewCompany`/`canViewContact`/`canViewOpportunity`, este último ya derivado
desde la Fase B) antes de mirar la denylist — un rol sin acceso al módulo no ve ningún campo, sin
necesidad de sembrar una fila de restricción por campo. El catálogo de "qué campos son
restringibles" no se mantiene a mano: `src/modules/activity/fieldConfigs/index.ts` (nuevo) agrega
los 4 `fieldConfig` que el Activity Log ya define para Employee/Company/Contact/Opportunity (grupo
13), y `RESTRICTABLE_FIELDS_BY_ENTITY_TYPE` los expone menos un puñado de campos de identidad
(`firstName`/`lastName`/`name`) que nunca tiene sentido ocultar porque son lo mínimo para
identificar el registro en cualquier lista o picker. `redactEntityFields`/`redactEntityListFields`
anulan (nunca borran la clave) los campos restringidos en el JSON de respuesta, siguiendo el
precedente ya existente de `tenantMetrics.ts` (que ya vaciaba el bloque `payroll`); se aplican en
el borde HTTP (`src/routes/employees.ts`/`companies.ts`/`contacts.ts`/`opportunities.ts`), no
dentro de los services, y cubren tanto las respuestas de lectura como las de creación/edición para
que el comportamiento sea consistente en toda la app. Detalle no obvio encontrado durante la
implementación: varias queries de lista/detalle (`Company`, `Contact`, `Opportunity`) incluyen a la
vez el FK crudo (`sizeId`, `accountOwnerId`, `managerId`, etc.) y el objeto de relación ya resuelto
(`sizeDefn`, `accountOwner`, `manager`) — anular solo el FK dejaría el valor legible igual a través
del objeto de relación, así que `RELATION_KEYS_BY_FIELD` anula ambos juntos cuando corresponde.
Nuevos endpoints owner-only: `GET /api/roles/field-catalog` (devuelve el catálogo restringible por
entidad, para pintar la UI) y `PATCH /api/roles/:roleId/field-restrictions` (`entityType`,
`fieldKey`, `hidden` — polaridad invertida respecto a `setRolePermission`: `hidden:true` crea la
fila de restricción, `hidden:false` la borra). UI: nueva sección "Field visibility" en la misma
página `Settings → Roles & Permissions`, un `<details>` colapsable por entidad, mismo patrón de
grid-toggle que la matriz de permisos de módulo. Verificado con Playwright real contra `staging` +
una llamada directa a `GET /api/hr/employees` confirmando que ocultar "Personal email" para Member
de verdad anula el campo en el JSON (y que revertirlo lo devuelve) — no solo que la UI lo tape.
`npm test` 248/248, ambos builds verdes. Nada de esto llegó a `main` todavía.

**Fase D (bundle de custom fields de Employee): completa.** Hasta acá `VIEW_EMPLOYEE_CUSTOM_FIELDS`/
`EDIT_EMPLOYEE_CUSTOM_FIELDS` existían como constantes sembradas (Admin/Member ya las tenían desde
el backfill de la Fase B) pero sin ningún consumidor real — los 4 endpoints de valores de custom
field de Employee (`POST`/`PATCH`/`DELETE`/`GET .../custom-fields`) seguían gateados por
`canManageCustomFields` (que en realidad gatea el SCHEMA de custom fields — crear/editar
`CustomFieldDefinition` — no los valores de un Employee puntual), y el `GET` de lista no tenía
ningún chequeo de permiso en absoluto. Agregado a `permissionService.ts`:
`canViewEmployeeCustomFields`/`canEditEmployeeCustomFields`, cada una compuesta (no un reemplazo)
sobre la base de Employee — `canViewEmployeeCustomFields = canViewEmployee && tiene el permiso`,
`canEditEmployeeCustomFields = canManageEmployee && tiene el permiso` — para que perder acceso a
Employee por completo también saque el acceso a sus custom fields, aunque el bundle siga prendido.
Encontrado en el camino: esta relación (view_employee_custom_fields depende de view_employee;
edit_employee_custom_fields depende de view_employee_custom_fields Y de manage_employee) es una
cadena de **2 niveles**, distinta de la de `manage_opportunity` (1 nivel) que ya existía —
`DEPENDENT_PERMISSIONS` solo calculaba dependientes directos, así que revocar `view_employee`
hubiera dejado a `edit_employee_custom_fields` como un permiso "dormido" en la base de datos
(revocado a un nivel, pero no dos). Corregido generalizando el cascade de revocación en
`roleManagementService.ts` a un BFS que camina el grafo de dependencias a punto fijo, en vez de un
solo salto — verificado con una prueba nueva y, en vivo contra `staging`, con la secuencia real
grant→grant→grant→revoke vía `PATCH /api/roles/:roleId/permissions`. `VIEW_EMPLOYEE_CUSTOM_FIELDS`/
`EDIT_EMPLOYEE_CUSTOM_FIELDS` se movieron de `PERMISSION_KEYS` (solo validación) a
`TOGGLEABLE_PERMISSION_KEYS` (expuestas de verdad en la UI) ahora que tienen enforcement real — 2
filas nuevas en la sección "People" de `Settings → Roles & Permissions`, mismo patrón de
grid-toggle. Verificado con Playwright real contra `staging` + llamadas directas a la API
(`GET`/`POST /api/hr/employees/:id/custom-fields` como Member antes/después de revocar el permiso,
confirmando 200→403 real, no solo en el mock). `npm test` 253/253 (+5 tests nuevos), ambos builds
verdes. Nada de esto llegó a `main` todavía.

```mermaid
erDiagram
    TENANT ||--o{ ROLE : "has"
    ROLE ||--o{ ROLE_MODULE_PERMISSION : "grants"
    ROLE ||--o{ ROLE_FIELD_RESTRICTION : "hides"
    ROLE ||--o{ USER : "assigned to"
    ROLE ||--o{ INVITATION : "assigned to"

    ROLE {
        string id PK
        string tenantId FK
        string name
        boolean isOwner "exactamente 1 por tenant, nunca editable/borrable"
        boolean isEditable "false solo para la fila isOwner=true"
    }
    ROLE_MODULE_PERMISSION {
        string id PK
        string roleId FK
        string permission "string libre, ver PERMISSION_KEYS en roleService.ts"
    }
    ROLE_FIELD_RESTRICTION {
        string id PK
        string roleId FK
        enum entityType "ActivityEntityType — reusado, ver grupo 13"
        string fieldKey "solo campos FIJOS del schema, nunca un CustomFieldDefinition.id"
    }
```

Notas:
- **`User.roleId`/`Invitation.roleId` son aditivos y nullable** — el enum `UserRole`
  (`User.role`/`Invitation.role`) sigue siendo la fuente de verdad legacy hasta que todo el código
  lea `RoleContext` en vez de compararlo directo; el corte del enum viejo queda deliberadamente
  fuera de esta ronda (push destructivo diferido, solo tras confirmación prolongada en producción).
- **`Role.isOwner` hace al owner estructuralmente no-restringible** — nunca tiene filas en
  `RoleModulePermission`/`RoleFieldRestriction`; todo el enforcement corta camino en `isOwner` antes
  de consultarlas. Garantiza que la transferencia de ownership y la facturación siempre tengan un
  usuario con acceso total, sin importar cómo un tenant configure el resto de sus roles.
- **`RoleModulePermission.permission` es un string libre, no un enum de Postgres** — la lista de
  permisos crece cada vez que un módulo nuevo se gatea; un enum forzaría un push de schema por cada
  uno. Además de los ~10 permisos de módulo de hoy, codifica 2 convenciones especiales de Employee
  (ver `roleService.ts`): el scope (`view_employee_scope:self|department|all`, mutuamente
  excluyentes — todavía sin consumidor real, Fase E) y el bundle de custom fields
  (`view_employee_custom_fields`/`edit_employee_custom_fields` — con enforcement real desde la
  Fase D, ver arriba).
- **`RoleFieldRestriction` es una denylist dispersa** — una fila significa "oculto", la ausencia
  significa "visible" (el default). Con ~15 entidades de 10-30 campos, una fila por combinación
  sería ~1500 filas por tenant solo para el estado por defecto; con denylist, un campo nuevo
  (incluido un `CustomFieldDefinition` recién creado) es visible sin sembrar nada. Solo cubre
  campos FIJOS del schema — los custom fields van por el bundle de arriba, no por esta tabla.
  Enforcement real desde la Fase C (`fieldVisibilityService.ts`), gateado siempre por el permiso de
  módulo de la entidad primero (ver Fase C arriba).

## Enums

| Enum | Valores | Usado en |
|---|---|---|
| `UserRole` | `owner`, `admin`, `member` | `User.role`, `Invitation.role` — legacy, ver grupo 14 (Custom Roles) |
| `UserStatus` | `active`, `inactive` | `User.status` |
| `TenantStatus` | `active`, `trialing`, `past_due`, `suspended`, `cancelled` | `Tenant.status` (`trialing`/`past_due` nuevos, Subscription Plans — grupo 8) |
| `AcquisitionChannel` | `organic`, `paid_ads`, `referral`, `content`, `outbound_sales`, `partnership`, `other` | `Tenant.acquisitionChannel` |
| `FieldType` | `text`, `number`, `date`, `select`, `email` | `CustomFieldDefinition.fieldType` |
| `ContractType` | `part_time`, `full_time` | `Employee.contractType` |
| `EntityType` | `employee`, `client`, `company`, `contact`, `opportunity` | `StatusDefinition`/`StatusHistoryEntry`/`CustomFieldDefinition`/`CustomFieldValue`/`SavedView`/`PublicForm`/`Task`/`Note`.entityType (Task/Note never use `client`) |
| `InvitationStatus` | `pending`, `accepted`, `expired`, `revoked` | `Invitation.status` |
| `TimeOffAccrualMethod` | `fixed_annual`, `monthly` | `TimeOffPolicyDefinition.accrualMethod` |
| `TimeOffRequestStatus` | `pending`, `approved`, `rejected`, `cancelled` | `TimeOffRequest.status` |
| `SavedViewType` | `grid`, `kanban`, `list` | `SavedView.type` |
| `SavedViewVisibility` | `personal`, `shared` | `SavedView.visibility` |
| `LeadStatus` | `new`, `contacted`, `qualified`, `disqualified` | `Contact.leadStatus` |
| `FormAccessMode` | `public`, `internal` | `PublicForm.accessMode` |
| `PipelineStageOutcome` | `open`, `won`, `lost` | `PipelineStageDefinition.outcome` |
| `CatalogKind` | `department`, `jobTitle`, `leadSource`, `lossReason`, `companySize` | `FieldCatalogDefinition.kind` |
| `PersonType` | `profile`, `contractor`, `employee` | `Employee.personType` |
| `PayFrequencyCadence` | `weekly`, `semimonthly`, `monthly` | `PayFrequencyDefinition.cadence` |
| `DueDateOffset` | `same_day`, `plus_2`, `plus_5`, `custom` | `PayFrequencyDefinition.dueDateOffset` |
| `PayrollCompensationType` | `hourly`, `fixed` | `EmployeeCompensation.compensationType` |
| `PaymentAccountSubType` | `iban`, `ach`, `username` | `EmployeeCompensation.paymentAccountSubType` |
| `PayrollRunStatus` | `draft`, `confirmed` | `PayrollRun.status` |
| `PayrollEntryType` | `base`, `bonus`, `commission`, `reimbursement`, `deduction` | `PayrollEntry.type` |
| `JobFunction` | `founder_ceo`, `hr`, `ops_finance`, `sales`, `other` | `User.jobFunction` (grupo 8) |
| `PlanTier` | `starter`, `growth`, `scale` | `Tenant.plan` (grupo 8), `Subscription.plan`/`PlanPrice.plan` (grupo 12) |
| `SubscriptionStatus` | `trialing`, `active`, `past_due`, `suspended`, `cancelled` | `Subscription.status` (grupo 12) |
| `PaymentProvider` | `paddle`, `mercadopago` | `Subscription.provider`, `Invoice.provider`, `ProcessedWebhookEvent.provider` (grupo 12) |
| `PlatformRole` | `platform_admin`, `platform_support`, `platform_viewer` | `User.platformRole` (nullable — null = no es staff de Northstack; usado por Admin Center, repo separado `northstack-devtasks`) |
| `ActivityEntityType` | 27 valores (employee/company/contact/opportunity + HR/Payroll + CRM/cross-module + cuenta/plataforma, ver grupo 13) | `ActivityLogEntry.entityType` (grupo 13) |
| `ActivityAction` | `create`, `update`, `delete` | `ActivityLogEntry.action` (grupo 13) |

## Qué falta / deuda conocida

- **`Client` → `Company`/`Contact`**: backfill construido y verificado en staging, pendiente de correr contra producción (ver grupo 5 arriba) y luego un corte separado (ocultar/borrar el módulo `Client`) todavía sin construir ni programar.
- **`Contact.leadStatus`/calificación de leads sin volumen todavía**: no se construye hasta que haya evidencia real de volumen de Forms públicos (decisión explícita, no un olvido).
- **Automatizaciones de Opportunity** (email por cambio de stage, auto-asignación de owner, recordatorio de deal estancado): explícitamente pospuestas, dependen de que Opportunity/su historial maduren primero con uso real.
- **`Company.status: Churned`** no tiene disparador automático (depende de una entidad `Contract` que no existe en el alcance actual) — solo `Won → Customer` está automatizado hoy.
- No hay historial de valores previos de `CustomFieldValue` (pospuesto a propósito).
- `Session` sí expira (expiración deslizante) — no hace falta job de limpieza porque una sesión vencida simplemente deja de autenticar; no hay borrado físico de filas viejas todavía.
- El sistema de Time Off está completo (7/7 piezas).
- **Task/Note — permisos abiertos a cualquier rol** (ver grupo 6): revisar cuando exista el sistema de roles custom (Tier 5).
- **Activity — layout confirmado, sin construir**: el usuario confirmó 2026-07-30 que Activity entra como tab en el panel de detalle (junto a Notes/Tasks), pero sin ningún modelo/backend real todavía — el tab hoy es un placeholder de texto. El sistema de auditoría real (quién hizo qué y cuándo) sigue en Tier 5 ("cola larga").
- **Ya en producción (`main`), verificado contra `git log origin/main`, 2026-08-29**: Tasks/Notes, Company/Contact/Pipeline/Opportunity (Clients redesign original, grupo 5) y la migración de datos `Client → Company/Contact`; Payroll completo (grupo 7); Tenant Signup + Subscription Plans (grupo 8), incluido el enforcement de tenants `suspended` (bloquea mutaciones, `httpAuth.ts` — el gap que esta sección marcaba como pendiente ya no existe); Admin Center (Platform Roles, Tenants, Tickets/Ideas — repo separado `northstack-devtasks`, ver `docs/Admin-platform/`); Billing Integration (Paddle + Mercado Pago, grupo 12); Google Calendar sync + cumpleaños (grupo 9).
- **Sales v2 (redesign de Pipeline/Opportunity — round-robin de asignación, forecast ponderado, automations al crear, notificaciones in-app) — Units 1-8 completas, solo en `staging`**: distinto de la "Clients redesign" original de arriba (esa sí está en producción) — esta es una segunda ronda de mejoras sobre lo mismo, todavía sin promover.
- **Payments v1 — Units 1-7 completas, solo en `staging`** (última ronda 2026-08-29, ver grupo 10): conexión con Stripe, lookup/matching, visibilidad de pagos en vivo, notificaciones proactivas (cron de polling, no webhook), auto-vinculación de Companies, modal de historial de pagos con recibos, y vista general con disputes en el perfil de Company. No probado de punta a punta con una cuenta de Stripe real (sin credenciales en este entorno) más allá de tests unitarios y verificación directa contra `STAGING_DATABASE_URL`.
- **Employee Termination — completo, solo en `staging`** (2026-08-29, ver grupo 11): status change coordinado (status/endDate/compensación/acceso/Time Off/reasignación de reportes), soporta baja pasada/hoy/futura con ejecución diferida vía cron, pago final con líneas de bonus/commission/reimbursement/deduction.
- **Activity Log — spec cerrado, solo en `staging`** (2026-08-31, ver grupo 13 y `docs/general/spec-activity-log.md`): schema + `activityLogService.ts` genérico + `canViewActivityLog` + rutas (Unidad 1); wiring real de create/update/delete de Employee/Company/Contact/Opportunity + custom field values (Unidad 2); frontend — tab "Activity" en los 4 modales + `Settings → Activity Log` con filtros (Unidad 3); extensión a HR/Payroll — 10 entidades más (Unidad 4); extensión al resto de CRM + cross-module + vistas/forms — Pipeline/PipelineStage/Task/Note/Tag/SavedView/PublicForm (Unidad 5); extensión completa a cuenta/plataforma — Tenant currency/plan, User rol/status, Invitation, Subscription (plan/status/cancelación, con atribución correlacionada para webhooks), GoogleCalendarConnection y StripeConnection (Unidad 6).
- **Lo único todavía sin promover a `main`, a la fecha de esta actualización (2026-08-31)**: Sales v2 (redesign), Payments v1, Employee Termination, y Activity Log — todo el resto de lo listado arriba ya está en producción.
