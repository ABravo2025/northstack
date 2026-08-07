# Function Index

- Fecha de creación: 2026-08-05
- Propósito: mapa de las funciones/componentes **reusables** del proyecto (servicios de backend,
  utilidades compartidas, hooks, componentes de UI comunes, cliente de API) — para chequear antes de
  escribir código nuevo si ya existe algo que resuelva lo mismo. Ver `docs/Skills/Skills-Development.md`,
  que exige leer este archivo antes de implementar cualquier tarea.
- **Alcance**: solo lo que se importa desde más de un lugar o está pensado para eso — `src/lib/**`,
  `src/modules/**` (capa de servicios), `frontend/src/lib/**`, `frontend/src/hooks/**`,
  `frontend/src/components/**`, `frontend/src/api/**`. **No incluye** handlers sueltos de página
  (`frontend/src/pages/*.tsx`) ni handlers de ruta (`src/routes/*.ts`) — esos son específicos de una
  sola pantalla/endpoint, no se reusan, indexarlos sería ruido.
- **Sin número de línea a propósito**: se desactualizan con el primer edit que toque el archivo. Para
  ubicar una función exacta, `grep -n "nombreDeLaFuncion" ruta/al/archivo.ts` — nunca desactualizado.
- **Mantenimiento**: este archivo se actualiza como parte de cualquier tarea que agregue, borre o
  renombre una función dentro del alcance de arriba — no es un snapshot de una sola vez. Si notás que
  quedó desactualizado (por ejemplo, después de mergear una rama grande como `staging` a `main`),
  regeneralo antes de seguir confiando en él para chequear reusabilidad.
- Reflejaba el estado de `main` al momento de escribirse — **no incluye** módulos que solo viven en
  `staging` todavía sin mergear, hasta que se promuevan.

---

## Backend — `src/`

### `src/lib/asyncRouter.ts`
- **createAsyncRouter()** — wrapper de `express.Router` que atrapa rechazos de handlers `async` y devuelve 500 limpio en vez de tirar abajo el proceso. Todo router nuevo lo usa en vez de `express.Router()` a secas.

### `src/lib/csv.ts`
- **parseCsv(text)** — parser/serializador CSV mínimo (RFC-4180-ish, sin dependencia externa). Maneja campos con comillas, comas embebidas, comillas escapadas (`""`) y ambos finales de línea.
- **toCsv(rows)** — inverso de `parseCsv`, arma texto CSV a partir de filas.
- **rowsToRecords(rows)** — header + filas → array de objetos planos, keyed por nombre de columna (match case-insensitive). Forma que consume todo importador de CSV de la app.
- **getField(record, ...names)** — busca un campo en un record por cualquiera de varios nombres alternativos (alias de columna).

### `src/lib/encryption.ts`
- **encryptPaymentAccountData(plaintext)** / **decryptPaymentAccountData(payload)** — AES-256-GCM vía el módulo `crypto` nativo de Node (sin librería externa), keyed por `PAYMENT_DATA_ENCRYPTION_KEY`. Único uso hoy: `EmployeeCompensation.paymentAccountDataEncrypted` (Payroll, ver `docs/spec-payroll.md`).

### `src/lib/httpAuth.ts`
- **getBearerToken(req)** — extrae el token `Authorization: Bearer`.
- **getClientIp(req)** — IP del cliente, para rate limiting.
- **authenticateUser(req, res)** — valida credenciales de login, no de sesión existente.
- **validateSession(req, res)** — valida el token de sesión de un request ya autenticado; el que usa casi todo endpoint protegido.

### `src/lib/mailer.ts`
Todas siguen el mismo patrón: `if (!mailerConfigured()) return;` (no rompen el request si Zoho no está configurado), best-effort.
- **sendInvitationEmail(input)** — invitación a un tenant.
- **sendPublicFormSubmissionEmail(input)** — aviso al owner de una submission nueva en un Public Form.
- **sendPublicFormConfirmationEmail(input)** — confirmación al que llenó el form.
- **sendTimeOffRequestPendingEmail(input)** — aviso al approver de una solicitud de Time Off pendiente.
- **sendTimeOffRequestDecidedEmail(input)** — aviso de aprobación/rechazo (o auto-aprobación).
- **sendFeedbackEmail(input)** — feedback de un tenant a `FEEDBACK_EMAIL`.

### `src/lib/rateLimit.ts`
- **AUTH_RATE_LIMIT** (const) — 5 intentos / 15 min, más estricto que el default por ser blanco de fuerza bruta.
- **isRateLimited(key, options?)** — chequeo genérico de rate limit por key (IP, endpoint, etc.).

### `src/lib/turnstile.ts`
- **verifyTurnstileToken(token, remoteIp?)** — valida un captcha de Cloudflare Turnstile server-side.

### `src/modules/auth/authService.ts`
- **newSessionExpiry()** — fecha de expiración deslizante de una sesión.
- **hashPassword(password)** / **verifyPassword(password, storedHash)** — hashing/verificación.
- **isPasswordValid(password)** — reglas de complejidad de contraseña.
- **isPhoneValid(phone)** — validación de teléfono.
- **registerUser(input)** — alta de usuario suelto (no tenant nuevo — ver `tenantService.registerTenantWithOwner` para eso).
- **loginUser(input)** — login, crea sesión.
- **authenticateToken(token)** — resuelve un token de sesión a su `User`.
- **logoutUser(token)** — revoca una sesión.
- **updateOwnProfile(userId, input)** / **changeOwnPassword(...)** — auto-gestión del propio usuario.

### `src/modules/auth/permissionService.ts`
Todas son `(role: UserRole) => boolean`, la fuente de verdad de qué puede hacer cada rol:
**canViewHr**, **canCreateHr**, **canManageCustomFields**, **canInviteUsers**, **canManageUsers**, **canManagePayroll** (owner-only, a diferencia del resto — ver Payroll en `docs/spec-payroll.md`).

### `src/modules/clients/clientService.ts` (módulo legado, ver `features-overview.md`)
CRUD estándar: **createClient**, **listClients(tenantId)**, **findClientById(id)**, **updateClient(id, input, changedByUserId)**, **deleteClient(id)**.

### `src/modules/crm/companyService.ts`
CRUD estándar: **createCompany**, **listCompanies(tenantId)**, **findCompanyById(id)**, **updateCompany(id, input)**, **deleteCompany(id, options?)**.

### `src/modules/crm/contactService.ts`
CRUD estándar: **createContact**, **listContacts(tenantId)**, **findContactById(id)**, **updateContact(id, input)**, **deleteContact(id, options?)**.

### `src/modules/crm/opportunityService.ts`
- CRUD estándar: **createOpportunity**, **listOpportunities(tenantId)**, **findOpportunityById(id)**, **updateOpportunity(...)**, **deleteOpportunity(id)**.
- **addOpportunityContact(tenantId, opportunityId, contactId, role?)** / **removeOpportunityContact(opportunityId, contactId)** — relación N:N Opportunity↔Contact.
- **listOpportunityStageHistory(tenantId, opportunityId)** — historial de cambios de stage.

### `src/modules/crm/pipelineService.ts`
- **seedDefaultPipelines(tx, tenantId)** — pipelines + stages default al crear un tenant (IDs generados client-side para no depender de que `createMany` devuelva filas).
- CRUD de pipeline: **createPipeline**, **listPipelines(tenantId)**, **findPipelineById(id)**, **updatePipeline(id, tenantId, input)**.
- CRUD de stage: **createPipelineStage**, **findPipelineStageById(id)**, **updatePipelineStage(...)**.

### `src/modules/crossModule/entityLookup.ts`
- **isSupportedCrossModuleEntityType(entityType)** — type guard de `EntityType`.
- **findEntityTenantId(entityType, entityId)** — resuelve el tenant dueño de una entidad polimórfica (Task/Note apuntan a Employee/Company/Contact/Opportunity sin FK real) — chequeo anti-IDOR obligatorio antes de adjuntar un Task/Note a algo.

### `src/modules/csv/csvService.ts`
- **exportEmployeesToCsv(tenantId, viewerRole)** / **getEmployeesCsvTemplate(tenantId, viewerRole)** / **importEmployeesFromCsv(tenantId, csvText, viewerRole)**.
- **exportClientsToCsv(tenantId)** / **getClientsCsvTemplate(tenantId)** / **importClientsFromCsv(tenantId, csvText)**.

### `src/modules/hr/customFieldService.ts`
- **isValueValidForFieldType(...)** — valida un valor contra el `fieldType` de su definición.
- **createCustomFieldDefinition**, **setCustomFieldDefinitionActive**, **updateCustomFieldDefinition** (nota: `fieldType` no es editable a propósito — cambiarlo podría dejar valores guardados que ya no matchean), **findCustomFieldDefinitionById**, **listCustomFieldDefinitions**.
- **createCustomFieldValue**, **findCustomFieldValueById**, **updateCustomFieldValue**, **deleteCustomFieldValue**, **listCustomFieldValuesForEntity**, **listCustomFieldValuesForEntities**.

### `src/modules/hr/employeeService.ts`
- **createEmployee(input)**, **listEmployees(tenantId, viewerRole?)**, **findEmployeeById(id)**, **findEmployeeByUserId(userId)**, **updateEmployee(...)**, **deleteEmployee(id)**.
- **wouldCreateManagerCycle(...)** — camina la cadena de `managerId` hacia arriba para detectar un ciclo antes de asignar un manager nuevo.

### `src/modules/hr/employeeTimeOffPolicyService.ts`
- **listEmployeeTimeOffPolicies(tenantId, employeeId)**, **assignTimeOffPolicyToEmployee(...)**, **unassignTimeOffPolicyFromEmployee(...)**.

### `src/modules/hr/fieldCatalogService.ts` (catálogos configurables: Department, Job Title, etc.)
- **listFieldCatalogDefinitions(...)**, **findFieldCatalogDefinitionById(id)**, **createFieldCatalogDefinition(...)**, **updateFieldCatalogDefinition(...)**.
- **findOrCreateFieldCatalogDefinition(...)** — find-or-create por nombre, usado por el backfill de Department y por submissions de Public Form que referencian un catálogo que puede no existir todavía.

### `src/modules/hr/payFrequencyService.ts` (catálogo configurable: Payroll)
- **seedDefaultPayFrequencies(tx, tenantId)** — 5 políticas estándar al crear un tenant (Semanal, Semi-mensual ×2, Mensual ×2).
- **createPayFrequency(...)**, **listPayFrequencies(tenantId)**, **listPayFrequenciesWithAssignedCount(tenantId)** (suma cuántas `EmployeeCompensation` vigentes usan cada una), **findPayFrequencyById(id)**, **updatePayFrequency(...)**.

### `src/modules/hr/paymentMethodService.ts` (catálogo chico: Payroll)
- **seedDefaultPaymentMethods(tx, tenantId)** — Wire transfer/Payoneer/Wise/PayPal al crear un tenant.
- **createPaymentMethod(...)**, **listPaymentMethods(tenantId)**, **findPaymentMethodById(id)**, **updatePaymentMethod(...)**.

### `src/modules/hr/publicFormService.ts`
- **createPublicForm(input)**, **listPublicForms(tenantId)**, **getTenantSlug(tenantId)**, **updatePublicForm(...)**.
- **findActivePublicForm(tenantSlug, formSlug)** — lookup público, sin contexto de tenant/auth (solo los 2 slugs de la URL).
- **submitPublicForm(...)** — procesa una submission (matching de Company por dominio de email, etc.).

### `src/modules/hr/savedViewService.ts`
CRUD estándar: **createSavedView**, **listSavedViews(...)**, **findSavedViewById(id)**, **updateSavedView(...)**, **deleteSavedView(...)**.

### `src/modules/hr/statusService.ts`
- **seedDefaultStatusDefinitions(tx, tenantId)** — statuses default al crear un tenant.
- **getDefaultStatusId(tenantId, entityType)**.
- **createStatusDefinition**, **listStatusDefinitions(...)**, **findStatusDefinitionById(id)**, **updateStatusDefinition(...)**.
- **recordStatusChange(input)** — escribe una fila en `StatusHistoryEntry`.

### `src/modules/hr/timeOffBalanceService.ts`
- **calculateEmployeeTimeOffBalances(tenantId, employeeId)** / **calculateAllTimeOffBalances(tenantId)** — allocated/used/pending/remaining por política, con prorrateo mensual o fijo anual según `accrualMethod`.

### `src/modules/hr/timeOffPolicyService.ts`
CRUD estándar: **createTimeOffPolicy**, **listTimeOffPolicies(tenantId)**, **findTimeOffPolicyById(id)**, **updateTimeOffPolicy(...)**.

### `src/modules/hr/timeOffRequestService.ts`
- **createTimeOffRequest(input)** — valida fechas + asignación de política, auto-aprueba si la política no requiere aprobación.
- **listMyTimeOffRequests**, **listPendingApprovals**, **listTimeOffRequestsForCalendar**, **listAllTimeOffRequests**.
- **findActiveTimeOffRequestsForEmployees(tenantId, employeeIds)** — solo solicitudes activas *hoy*, no el historial completo.
- **decideTimeOffRequest(...)** / **cancelTimeOffRequest(...)**.

### `src/modules/notes/noteService.ts`
CRUD estándar, cross-entidad vía `entityType`/`entityId`: **createNote**, **findNoteById(id)**, **listNotesForEntity(tenantId, entityType, entityId)**, **updateNote(id, input)**, **deleteNote(id)**.

### `src/modules/onboarding/onboardingService.ts`
- **seedSampleData(tenantId)** — carga datos de ejemplo (empleados/clientes), no idempotente a propósito, safe de llamar más de una vez.
- **getOnboardingStatus(tenantId)** — estado del checklist de onboarding (`/overview`).

### `src/modules/tasks/taskService.ts`
- CRUD cross-entidad: **createTask**, **findTaskById(id)**, **listTasksForEntity(tenantId, entityType, entityId)**, **updateTask(id, input)**, **deleteTask(id)**.
- **listMyTasks(tenantId, assigneeId)** — pendientes primero, por fecha de vencimiento más próxima.
- **listTasksForCalendar(tenantId)** — todos los Task con `dueDate`, el frontend filtra al mes visible.

### `src/modules/tenant/invitationService.ts`
- **findInvitationByToken(token)**, **createInvitation(input)**, **acceptInvitation(input)**, **listTenantInvitations(tenantId)**, **cancelInvitation(tenantId, invitationId)**.

### `src/modules/tenant/tenantService.ts`
- **getEmailDomain(email)** / **normalizeSlug(value)** — helpers de string.
- **createTenantForUser(input)** — tenant nuevo para un usuario ya existente.
- **registerTenantWithOwner(input)** — flujo completo de "Sign Up" (tenant + owner + seeds).
- **findTenantNameById(tenantId)**, **getTenantById(tenantId)**, **updateTenantCurrency(tenantId, currency)**.
- **findUserById(id)** — sin scope de tenant a propósito (mismo patrón que `findClientById`/`findEmployeeById`) — el caller valida `tenantId` antes de confiar en el resultado.

### `src/modules/tenant/tenantUserService.ts`
- **listTenantUsers(tenantId)**, **updateTenantUser(...)**.

---

## Frontend — `frontend/src/`

### `frontend/src/lib/currencies.ts`
- **currencyLabel(code)** — nombre legible de un código ISO-4217.
- **formatMoney(cents, currency)** — `Intl.NumberFormat` currency, la función de formato de plata que usa toda la app (no reinventar con `toFixed(2)`).

### `frontend/src/lib/lightMarkdown.tsx`
- **renderNoteDescription(description)** — subset mínimo de Markdown (bold/italic/links/saltos de línea) para el texto de Notes, sin librería externa.

### `frontend/src/lib/viewFields.ts` (motor de Views/Filters/Sort genérico)
- **buildEmployeeFields(...)**, **buildCompanyFields(...)**, **buildContactFields(...)** — arman la lista de `ViewField` (columnas filtrables/ordenables) por entidad, incluyendo custom fields.
- **findField(fields, key)**, **groupableFields(fields)**, **parseFilters(raw)**, **parseSort(raw)**.

### `frontend/src/lib/countries.ts`, `frontend/src/lib/changelog.ts`
Solo datos (`COUNTRIES`, `CHANGELOG_ENTRIES`), sin funciones — no indexado más allá de esta mención.

### `frontend/src/lib/validation.ts`
- **isLikelyValidEmail(value)** — chequeo de forma client-side-only (no reemplaza validación de backend), usado para gatear cuándo un campo cuenta como "completo" en un trigger de auto-save/auto-create.

### `frontend/src/hooks/useAutoCreateGuard.ts`
- **useAutoCreateGuard()** — guard reusable para forms de "Add [Entity]" que auto-crean apenas sus campos requeridos están completos (2026-08, ver `EmployeeOverviewPanel`/`EmployeesPage.tsx`). Devuelve `{ attempt(isReady, run), reset() }`: `attempt` no hace nada si ya se creó, si hay una request en vuelo, o si `isReady` es false — así se puede llamar desde el commit de cada campo requerido (blur en texto, change en select) sin duplicar la entidad; `run` debe relanzar su error después de reportarlo (toast) para que el guard no marque la creación como exitosa y permita reintentar. `reset()` se llama al cerrar/reabrir el form.

### `frontend/src/hooks/useColumnOrder.ts`
- **useColumnOrder(storageKey, allKeys)** — orden de columnas persistido en `localStorage`; una key nueva (columna/custom field nuevo) se agrega al final, una que ya no existe se descarta sola.

### `frontend/src/hooks/useColumnVisibility.ts`
- **useColumnVisibility(storageKey)** — mostrar/ocultar columnas, persistido por vista (`storageKey` incluye el `activeViewId`) para no mezclar entre vistas.

### `frontend/src/hooks/useResizableColumns.ts`
- **useResizableColumns(storageKey)** — mismo criterio que `useColumnVisibility` pero para anchos de columna.

### `frontend/src/api/*` — cliente HTTP, un archivo por dominio, todos re-exportados juntos en `api` (`frontend/src/api/index.ts`)
Métodos por archivo (todas devuelven una Promise, firma `(token, ...) => ...`, ver `frontend/src/api/http.ts` para `apiFetch`/`throwApiError` compartidos):

| Archivo | Métodos |
|---|---|
| `auth.ts` | registerTenant, login, register, getInvitation, acceptInvitation, logout, getCurrentUser, updateProfile, changePassword, getCurrentTenant, updateTenantCurrency |
| `employees.ts` | listEmployees, createEmployee, updateEmployee, deleteEmployee, inviteEmployee |
| `companies.ts` | listCompanies, createCompany, updateCompany, deleteCompany, +custom field values |
| `contacts.ts` | listContacts, createContact, updateContact, deleteContact, +custom field values |
| `opportunities.ts` | listOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, addOpportunityContact, removeOpportunityContact |
| `pipelines.ts` | listPipelines, createPipeline, updatePipeline, createPipelineStage, updatePipelineStage |
| `customFields.ts` | listCustomFieldDefinitions, createCustomFieldDefinition, updateCustomFieldDefinition |
| `fieldCatalog.ts` | listFieldCatalogDefinitions, createFieldCatalogDefinition, updateFieldCatalogDefinition |
| `statuses.ts` | listStatusDefinitions, createStatusDefinition, updateStatusDefinition |
| `savedViews.ts` | listViews, createView, updateView, deleteView |
| `timeOffPolicies.ts` | listTimeOffPolicies, createTimeOffPolicy, updateTimeOffPolicy |
| `timeOffPolicyAssignments.ts` | listEmployeeTimeOffPolicies, assignTimeOffPolicyToEmployee, unassignTimeOffPolicyFromEmployee |
| `timeOffRequests.ts` | listTimeOffRequests, createTimeOffRequest, decideTimeOffRequest, cancelTimeOffRequest |
| `timeOffBalances.ts` | listTimeOffBalances, getEmployeeTimeOffBalance, +custom field values (nota: nombre de archivo engañoso, ver código) |
| `tasks.ts` | listTasks, listMyTasks, listTasksForCalendar, createTask, updateTask, deleteTask |
| `notes.ts` | listNotes, createNote, updateNote, deleteNote |
| `payroll.ts` | listPayFrequencies, createPayFrequency, updatePayFrequency, listPaymentMethods, createPaymentMethod, updatePaymentMethod |
| `csv.ts` | exportEmployeesCsv, importEmployeesCsv, employeesCsvTemplate |
| `tenantUsers.ts` | listTenantUsers, updateTenantUser, listTenantInvitations, createTenantInvitation, cancelInvitation |
| `publicFormsAdmin.ts` | listPublicForms, createPublicForm, updatePublicForm |
| `publicFormsPublic.ts` | getPublicFormConfig, submitPublicForm |
| `onboarding.ts` | getOnboardingStatus, seedSampleData |
| `feedback.ts` | sendFeedback |
| `http.ts` | apiFetch(url, init?), throwApiError(res) — base compartida, no un dominio |

### `frontend/src/components/common/` — componentes reusables genéricos, no ligados a una entidad
- **AuthLayout** — shell de las pantallas de login/registro.
- **AutoSaveField** / **AutoSaveSelect** — input/select que guarda solo (blur / change), revierte y avisa por toast si el PATCH falla. Usar siempre que un campo se edite "en línea" sin botón Save.
- **Avatar** (+ **getInitials**) — círculo con iniciales.
- **CategoryChip** — chip de color determinístico por `seed` (para custom fields tipo categoría).
- **ColorPicker** — selector de color con paleta + custom, persistido en `localStorage`.
- **ConfirmDialog** — modal de confirmación para acciones destructivas; nunca usar `confirm()` nativo.
- **EmptyState** — estado vacío con ícono/título/cuerpo/CTA; usar en vez de un `<p>` de texto plano (ver `docs/Skills/Skills-Development.md`).
- **EntityCardList** — lista de tarjetas para la vista mobile de una tabla (`<md`, patrón responsive).
- **Field** — wrapper de label+valor para paneles de detalle y forms de alta. Prop `required` (2026-08) renderiza `RequiredMark` junto al label.
- **RequiredMark** (2026-08) — el asterisco rojo, como componente en vez de texto suelto (`.required-mark` en CSS). Es el único lugar que define "así se ve un campo obligatorio" — `Field` lo usa internamente vía su prop `required`; cualquier form que **no** use `Field` (la mayoría de los `.form-group` + `<label>` sueltos de SlideOvers/popovers/páginas de auth) lo importa y lo cae directo dentro del `<label>`: `<label>Nombre<RequiredMark /></label>`. Aplicado en 2026-08 a los 4 forms de alta del CRM, Login/Register/Accept Invite, los popovers de Invite user/PTO Policy/Time Off request/Custom Field/Status/Field Catalog/Saved View/Pipeline/CSV import, el builder de Public Forms + el form público en sí, TaskForm/NoteForm, y los sub-forms de alta rápida dentro de los paneles de detalle del CRM (ej. "add a new contact" en `CompanyDetailModal`).
- **Icons.tsx** — toda la iconografía de la app, un componente por ícono (`SearchIcon`, `PlusIcon`, `PencilIcon`, `TrashIcon`, `MailIcon`, `EyeIcon`/`EyeOffIcon`, `CheckIcon`, `XIcon`, `GripIcon`, `GridIcon`, `KanbanIcon`, `ListIcon`, `LockIcon`, `TeamIcon`, `FilterIcon`, `DotsVerticalIcon`, `CopyIcon`, `HomeIcon`, `DashboardIcon`, `CalendarIcon`, `TrendingIcon`, `PeopleIcon`, `BriefcaseIcon`, `GearIcon`, `UserCircleIcon`, `ChevronDownIcon`/`ChevronLeftIcon`/`ChevronRightIcon`, `MenuIcon`, `DownloadIcon`, `UploadIcon`, `BellIcon`, `BuildingIcon`, `TargetIcon`) — **revisar esta lista antes de agregar un ícono nuevo**, es fácil duplicar uno que ya existe con otro nombre.
- **LegalDocumentModal** — visor de ToS/Privacy Policy.
- **Modal** — modal centrado con backdrop, mismas props que `SlideOver` (open/title/onClose/footer). Patrón esperado (no excepción) para el form de alta de Employee/Company/Contact/Opportunity desde 2026-08; para otros forms chicos, evaluar caso a caso si el diseño pide centrado en vez de panel lateral.
- **OverviewActionsMenu** — trigger "Actions" del header de un panel de detalle (Delete, Invite to app, etc.).
- **Pagination** (+ **paginate**) — paginación client-side, 20 filas/página.
- **PasswordChecklist** / **PasswordInput** — checklist en vivo de reglas de contraseña + toggle mostrar/ocultar.
- **Popover** — portal a `document.body` + posicionamiento por coordenadas reales; mecanismo estándar para cualquier dropdown flotante, nunca un `<div absolute>` a mano.
- **RoleChip** — chip de rol (owner/admin/member).
- **SearchableSelect** — input + dropdown filtrado para elegir una opción de una lista larga (construido sobre `Popover`).
- **SlideOver** — panel lateral para forms de "entidad completa"; default para forms nuevos salvo que el diseño pida `Modal` centrado.
- **StatusChip** — chip de status con punto de color.
- **TableSkeleton** — loading state de tabla; usar en vez de `<p>Loading...</p>`.
- **ToastProvider** (+ **useToast**) — `success`/`error`, nunca `alert()`.

### `frontend/src/components/entity-views/` — piezas del motor genérico de Views/Filters/Kanban/tabla
- **AddCustomFieldColumn** — columna "+" al final del header para agregar un custom field.
- **ColumnResizeHandle** — handle de resize dentro de un `<th>`.
- **ColumnVisibilityMenu** — menú de mostrar/ocultar columnas (usa el hook `useColumnVisibility`).
- **CsvImportExportMenu** (`forwardRef`, expone `CsvImportExportMenuHandle`) — patrón genérico de import/export CSV con template descargable.
- **CustomFieldColumnMenu** — dropdown de header de columna de custom field (Edit/Delete field).
- **FieldCatalogMenu** — dropdown de header para columnas de catálogo (Department, Job Title).
- **FilterBar** — barra de filtros sobre una lista de `ViewField`.
- **HorizontalScrollbar** — scrollbar horizontal propia para `.full-table-wrap` (consistente entre navegadores/SO).
- **KanbanBoard** (genérico, `<T>`) — tablero drag-and-drop reusado por Employees/Companies/Contacts/Opportunities, recibe `renderCard` como prop.
- **StatusColumnMenu** — dropdown de header de columna Status ("Manage options": color, orden, default, activar/desactivar).
- **ViewsBar** — tabs de vistas guardadas (Grid/Kanban/List, personales o compartidas).

### `frontend/src/components/crm/`
- **CompanyDetailModal**, **ContactDetailModal**, **OpportunityDetailModal** — paneles de detalle 70vw×70vh con tabs Notes/Tasks/Activity (mismo shell que `EmployeeOverviewPanel`, ver `DetailSidebar` abajo).

### `frontend/src/components/hr/`
- **EmployeeOverviewPanel** — panel de detalle de Employee; edición 100% inline vía `AutoSaveField`/`AutoSaveSelect`, sin botón "Edit" ni modo edición separado.

### `frontend/src/components/layout/`
- **ChangelogMenu** — popover de "What's new" (contenido estático en `lib/changelog.ts`).
- **DetailSidebar** — columna derecha compartida (tabs Notes/Tasks/Activity) por los 4 paneles de detalle (Employee/Company/Contact/Opportunity) — **el componente a extender si se agrega una 5ta entidad con detalle**, no copiar los 4 paneles.
- **MobileTabbar** — tabbar inferior fijo, solo `<768px` (Overview/Employees/Time Off/Sales).
- **OnboardingChecklist** — card de `/overview` con los 4 pasos de onboarding.
- **Sidebar** / **TopBar** — navegación principal.

### `frontend/src/components/notes/`
- **EntityNotesList** — tab "Notes" compartido por los 4 paneles de detalle (mismo mecanismo que `EntityTasksList`).
- **NoteForm** — form de compose/edit de una Note, siempre expandido (no popover-al-click).

### `frontend/src/components/tasks/`
- **EntityTasksList** — tab "Tasks" compartido por los 4 paneles de detalle.
- **MyTasksWidget** — widget "My tasks" de `/overview`, reusa el mismo popover de edición que `EntityTasksList` vía `TaskFormPopover`.
- **TaskForm** — form de compose/edit de un Task, siempre expandido dentro del tab.
- **TaskFormPopover** — wrapper de `TaskForm` en un `Popover`, para los 2 lugares que sí necesitan popover-al-click (el widget de Overview y las entradas del calendario) — nunca reimplementar el form ahí adentro, envolver el mismo `TaskForm`.
