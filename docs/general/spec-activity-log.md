# Spec Activity Log

**Estado:** ✅ Unidades 1-5 completas + Unidad 6 parcial, en `staging` (2026-08-30) — el spec se da
por cerrado en esta ronda. Unidad 6 (nueva, parcial): Tenant (currency/plan), User (rol/status),
Invitation (alta/cancelación/aceptación) — Subscription/GoogleCalendarConnection/StripeConnection
deliberadamente afuera, ver §6 para el razonamiento completo. Unidad 5: extendió el
wiring al resto de CRM + cross-module + vistas/forms — Pipeline, PipelineStage, Task, Note, Tag,
SavedView, PublicForm — mismo mecanismo, verificado contra `staging` real. Unidad 4: extendió el
wiring de create/update a HR/Payroll — TimeOffPolicy, TimeOffRequest, StatusDefinition,
CustomFieldDefinition, FieldCatalogDefinition, PayFrequency, PaymentMethod, EmployeeCompensation
(create-only, versionado), EmployeeTermination, PayrollRun — mismo mecanismo genérico de Unidad 1,
verificado contra `staging` real. Unidad 1: schema
(`ActivityLogEntry` + `ActivityEntityType`/`ActivityAction`), `activityLogService.ts` genérico,
`canViewActivityLog`, rutas `src/routes/activity.ts`. Unidad 2: wiring real de Employee/Company/
Contact/Opportunity (create/update/delete) + sus custom field values — ver §6 para el scope cut
explícito (solo la ruta directa de cada entidad genera entradas; CSV import, onboarding seed data y
Public Forms quedan deliberadamente afuera de esta ronda). **Unidad 3: frontend** — tab "Activity"
real en los 4 modales de detalle (`EntityActivityList`) y la página `Settings → Activity Log`
(`ActivityLogSettingsPage`, owner/admin, filtros por tipo/acción/usuario/rango de fecha, "Load more"
paginado). Verificado de punta a punta con Playwright contra `staging` real (login, editar un campo
de una Company real y ver la entrada aparecer en ambas superficies con el diff correcto).
`npm run build`/`npm test` (207/207) backend y `npm run build` frontend en verde en cada unidad.
Nada de esto llegó a `main` todavía.
**Fecha:** 2026-08-30.
**Contexto:** ítem de backlog ya anotado hace tiempo (`docs/tareas/backlog.md` → Notes/Tasks →
"Activity Log — módulo entero sin construir"; `docs/general/database-schema.md` grupo 6 y "Qué
falta" → Tier 5/"cola larga"). El tab "Activity" existe hoy como placeholder de texto en los 4
paneles de detalle (Employee/Company/Contact/Opportunity, `DetailSidebar.tsx`) desde que se
unificaron esos paneles (2026-07-30) — layout ya confirmado en ese momento (tab, no panel lateral),
pero sin backend real detrás. Pedido explícito de Alejandro (2026-08-30): construir el módulo
completo, con dos superficies — un tab de actividad *por registro* dentro de cada modal, y un feed
*de toda la plataforma* en Settings.

Mismo criterio de ejecución que el resto de las specs del proyecto: cada unidad build →
`npm run build`/`npm test` → verificación real → commit → push exclusivamente a `staging`, nunca a
`main`, hasta revisión del usuario — confirmando cada unidad por separado antes de seguir con la
siguiente (este spec es big enough — comparable a Payroll — como para no acumular todo en un solo
push).

---

## 0. Decisiones cerradas (confirmadas con Alejandro, 2026-08-30)

1. **Alcance del feed de Settings:** auditoría completa de la plataforma, no solo las 4 entidades
   del CRM/HR con modal — cualquier movimiento (creación/modificación/eliminación) sobre cualquier
   entidad mutable del tenant. Ver §5 para el inventario completo por unidad.
2. **`Client` (legado) queda afuera.** No tiene modal de detalle ni entrada en el menú — no hay
   dónde mostrar un tab de Activity, y su corte final ya está en el backlog por separado. Si se
   decide llevarlo a cabo antes del corte, agregar como unidad extra.
3. **Nivel de detalle: campo por campo.** Cada entrada de "update" guarda una lista de campos
   cambiados (`{field, label, oldValue, newValue}`) con valores ya resueltos a texto legible (no
   IDs de FK crudos) — no solo "Fulano actualizó este registro".
4. **Acceso al feed de Settings: owner/admin hoy, vía un permiso nombrado.** No existe ningún
   sistema de custom roles todavía (`docs/general/tareas-desarrollo.md`/`database-schema.md` lo
   marcan como Tier 5 sin construir) — se gatea con `canViewActivityLog(role)` en
   `permissionService.ts`, mismo patrón que `canManagePayroll`/`canManageBilling`/
   `canManagePayments` (una función nombrada, no un `role === 'owner'` inline), para que el día que
   exista un custom role con este permiso, sea un cambio de una sola función, no de cada call site.
5. **El tab del modal no tiene gate propio** — mismo criterio que Notes/Tasks: si podés abrir el
   modal de un Employee/Company/Contact/Opportunity, ves su Activity. El gate por rol es solo para
   el feed *tenant-wide* de Settings (que expone movimientos de gente/registros a los que quizás no
   tendrías acceso directo).
6. **Login/logout (`Session`) queda fuera de alcance** — esto es un log de cambios sobre
   *registros* (creación/modificación/eliminación), no un log de seguridad/acceso. Si más adelante
   se quiere eso, es una feature distinta (session/security log), no una unidad de este spec.
7. **El tab del modal excluye Task/Note propios** — Task/Note ya tienen su tab dedicado dentro del
   mismo modal; duplicarlos en el tab de Activity sería ruido en la misma pantalla. El feed
   tenant-wide de Settings sí los incluye (ahí no hay duplicación posible, es la única vista de
   "todo junto").
8. **Enum nuevo y separado (`ActivityEntityType`), no extender `EntityType`.** `EntityType` está
   acoplado a qué módulos soportan custom fields/status/tags (`CustomFieldDefinition.entityType`,
   etc.) — sumarle 20+ valores que nunca van a tener custom fields (`payrollRun`, `invitation`,
   `subscription`...) sería confuso. Los primeros 4 valores de `ActivityEntityType` son las mismas
   strings que `EntityType` (`employee`/`company`/`contact`/`opportunity`) a propósito, para poder
   reusar `findEntityTenantId` (`entityLookup.ts`) sin traducir.
9. **Escritura best-effort, nunca bloquea ni rompe la operación real** — mismo criterio que
   `syncTaskCalendarEvent`/`sendInvitationEmail`: si registrar la actividad falla, la creación/edición/
   borrado real ya se hizo y no se revierte. Usa `bestEffort()` (`src/lib/bestEffort.ts`) — **no**
   fire-and-forget sin awaitear (la nota del propio archivo: en Vercel serverless una promise no
   awaiteada puede morir a mitad de camino cuando la función corta la respuesta; es el bug real que
   ya rompió los emails de verificación de signup).

---

## 1. Schema

```prisma
enum ActivityEntityType {
  // Tier 1 (Unidad 2) — mismas strings que EntityType, a propósito (ver decisión 8)
  employee
  company
  contact
  opportunity
  // Tier 2 (Unidad 4) — HR/Payroll
  timeOffPolicy
  timeOffRequest
  employeeCompensation
  employeeTermination
  payrollRun
  payFrequency
  paymentMethod
  statusDefinition
  customFieldDefinition
  fieldCatalogDefinition
  // Tier 3 (Unidad 5) — resto de CRM + cross-module + vistas/forms
  pipeline
  pipelineStage
  task
  note
  tag
  savedView
  publicForm
  // Tier 4 (Unidad 6) — cuenta/plataforma
  tenant
  user
  invitation
  subscription
  googleCalendarConnection
  stripeConnection
}

enum ActivityAction {
  create
  update
  delete
}

model ActivityLogEntry {
  id              String             @id @default(uuid())
  tenantId        String
  tenant          Tenant             @relation(fields: [tenantId], references: [id])
  entityType      ActivityEntityType
  entityId        String             // no FK real, mismo patrón que Task/Note/StatusHistoryEntry
  entityLabel     String             // snapshot del nombre visible al momento (ej. "Acme Renewal") — sobrevive un rename/borrado posterior, mismo criterio que StatusHistoryEntry
  action          ActivityAction
  summary         String             // una línea, auto-generada desde `changes` (ver §2)
  changes         String?            // JSON de {field, label, oldValue, newValue}[] — null solo si de verdad no hubo ningún campo con valor (raro)
  changedByUserId String
  changedBy       User               @relation(fields: [changedByUserId], references: [id])
  changedAt       DateTime           @default(now())

  @@index([tenantId, entityType, entityId, changedAt])
  @@index([tenantId, changedAt])
}
```

Push aditivo puro — tabla nueva, sin tocar columnas existentes. Sin backfill posible (no hay
historial previo real de "quién cambió qué" en ningún lado del código hoy — `StatusHistoryEntry`
es el único precedente y cubre solo status, no todos los campos); el log arranca vacío desde que se
despliega cada unidad.

---

## 2. `activityLogService.ts` — mecanismo central

Un solo punto de escritura, reusado por cada service de cada unidad — evita que 25+ archivos
reinventen su propio formato de diff/summary.

- **`diffEntity(before, after, fieldConfig)`** — helper puro, sin I/O. `fieldConfig` es un
  `Record<campo, { label: string; resolve?: (valor, tenantId) => Promise<string> }>` declarado una
  vez por entidad (ver ejemplo Opportunity abajo). Compara `before[campo]` vs `after[campo]` para
  cada campo del config; si difieren, resuelve ambos valores a texto legible (vía `resolve` si el
  campo es una FK — status/catálogo/manager/owner por nombre, no ID) y devuelve
  `{field, label, oldValue, newValue}[]`. `before: null` (create) trata todo como "antes vacío";
  `after: null` (delete) trata todo como "después vacío" — un mismo mecanismo para las 3 acciones,
  en vez de tres formatos de mensaje distintos escritos a mano por call site.
- **`summarizeChanges(changes, action, entityLabel)`** — arma el `summary` de una línea a partir de
  la lista de cambios (ej. `Changed Stage: Discovery → Proposal` para 1 cambio,
  `Changed Stage, Amount and 1 more` para 3+ — el detalle completo vive en `changes`, expandible en
  la UI).
- **`recordActivity(input)`** — `diffEntity` + `summarizeChanges` + `prisma.activityLogEntry.create`,
  envuelto en `bestEffort()` (ver decisión 9) — la función que cada service llama tal cual, sin que
  el caller arme el summary a mano.
- **`listActivityForEntity(tenantId, entityType, entityId)`** — feed acotado a un registro, para el
  tab del modal. Valida ownership con `findEntityTenantId` (reusado, ver decisión 8) para los 4
  tipos de Tier 1 — un tipo de Tier 2+ no tiene modal propio, así que no necesita este endpoint.
- **`listActivityFeed(tenantId, { entityType?, userId?, action?, from?, to?, cursor? })`** — feed
  tenant-wide para Settings, paginado por cursor (`changedAt`+`id`, mismo criterio que
  `getCompanyPaymentEvents` de Payments v1 — un feed que puede crecer sin techo, a diferencia de las
  listas chicas que hoy paginan client-side).

Ejemplo de `fieldConfig` (Opportunity, Unidad 2):

```ts
const opportunityFieldConfig: FieldConfig<Opportunity> = {
  name: { label: 'Name' },
  amountCents: { label: 'Amount', resolve: (v, _t, ctx) => formatMoney(v, ctx.currency) },
  stageId: { label: 'Stage', resolve: (v) => findPipelineStageById(v).then(s => s?.name ?? '—') },
  ownerId: { label: 'Owner', resolve: (v) => findUserDisplayName(v) },
  lossReasonId: { label: 'Loss reason', resolve: (v) => findFieldCatalogDefinitionById(v).then(c => c?.name ?? '—') },
  nextStepDate: { label: 'Next step date' },
  nextStepNote: { label: 'Next step note' },
};
```

---

## 3. Backend — dónde se llama `recordActivity`

Al final de cada `create*`/`update*`/`delete*` de service, después del write real (nunca antes —
mismo criterio que cualquier best-effort del proyecto: la operación real ya tiene que estar
confirmada). Para "update", el caller necesita el snapshot `before` — la mayoría de los
`update*Service` ya hacen un `findUnique` antes del `update` (para el 404/ownership check), así que
en general es reusar ese resultado, no una query extra.

Ownership/anti-IDOR: el chequeo de que `entityId` pertenece al tenant ya lo hace cada service en su
flujo normal (es el mismo patrón "no negociable" del SOP) — `recordActivity` no vuelve a validarlo,
confía en el caller como el resto de los helpers internos (`entityLookup.ts` incluido).

Custom field values (Unidad 2): `customFieldService.ts`'s `createCustomFieldValue`/
`updateCustomFieldValue`/`deleteCustomFieldValue` registran un `update` contra la **entidad dueña**
(`entityType`/`entityId` del value en sí — un Opportunity con un custom field editado genera una
entrada de Activity sobre ese Opportunity, campo = nombre del custom field), no una entrada propia
de tipo "customFieldValue".

---

## 4. Frontend

- **`frontend/src/api/activity.ts`** — `listActivityForEntity(token, entityType, entityId)`,
  `listActivityFeed(token, params)`.
- **`frontend/src/components/activity/EntityActivityList.tsx`** — reemplaza el placeholder del tab
  "Activity" en `DetailSidebar.tsx` (los 4 modales lo comparten, mismo mecanismo que
  `EntityNotesList`/`EntityTasksList`). Solo lectura, sin compose — cada fila:
  avatar+nombre+timestamp+summary, expandible para ver el detalle campo por campo.
- **`frontend/src/pages/ActivityLogSettingsPage.tsx`** — página nueva bajo `/settings`
  (`SettingsSidebar.tsx`/`settingsSections.tsx`), gateada client-side (oculta si `!canViewActivityLog`,
  mismo patrón ya usado para ocultar secciones owner-only de Settings). Filtros reusando
  `FilterBar`/`DateRangeFilter.tsx` (ya existe, de Dashboards) por tipo de entidad, usuario y rango
  de fecha; lista paginada con "Load more" (cursor, mismo patrón que
  `CompanyStripeSection`/`CompanyPaymentHistoryModal`).

---

## 5. Unidades (roadmap de construcción)

Alcance completo, dividido para poder confirmar y pushear cada pieza por separado — mismo criterio
que Payroll (21 unidades) o Sales v2 (8 unidades). Unidad 2 es literalmente lo que pediste primero
("cliente [Company], empleado, company u opportunity"); el resto extiende a "todos los movimientos
de la plataforma" tal como se confirmó en la Decisión 1.

| # | Contenido | Entidades |
|---|---|---|
| **1** ✅ | Schema (`ActivityLogEntry` + 2 enums), `activityLogService.ts` (diff/summary/record/list), `canViewActivityLog`, rutas `src/routes/activity.ts` | — (plomería, sin UI todavía) |
| **2** ✅ | Wire-up de las 4 entidades con modal + sus custom field values | Employee, Company, Contact, Opportunity |
| **3** ✅ | Frontend: tab de Activity en los 4 modales + página de Settings con filtros | (consume Unidad 1+2) |
| **4** ✅ | Extensión HR/Payroll | TimeOffPolicy, TimeOffRequest, EmployeeCompensation, EmployeeTermination, PayrollRun, PayFrequency, PaymentMethod, StatusDefinition, CustomFieldDefinition, FieldCatalogDefinition |
| **5** ✅ | Extensión CRM + cross-module + vistas/forms | Pipeline, PipelineStage, Task, Note, Tag, SavedView, PublicForm |
| **6** ⚠️ parcial | Extensión cuenta/plataforma | Tenant (currency/plan) ✅, User (rol/status) ✅, Invitation (alta/cancelación/aceptación) ✅ — Subscription/GoogleCalendarConnection/StripeConnection deliberadamente afuera, ver §6 |

Después de la Unidad 3 ya hay una feature end-to-end usable (que es el pedido original); las
Unidades 4-6 son las que llevan el feed de Settings de "las 4 entidades del CRM/HR" a "auditoría
completa de la plataforma" tal como se confirmó. Cada unidad de extensión (4-6) es, en la práctica,
un `fieldConfig` + una llamada a `recordActivity` por cada `create`/`update`/`delete` de su lista de
entidades — mecánico dado que Unidad 1 ya puso el mecanismo genérico, pero son ~20 archivos de
service distintos a tocar en total, por eso separado en 3 rondas en vez de una sola.

## 6. Qué queda deliberadamente afuera (por ahora)

- **Unidad 2 — scope cut real, decidido al implementar**: `changedByUserId` es requerido en
  `updateEmployee`/`updateCompany`/`updateContact`/`deactivateContact`/`deleteEmployee`/
  `deleteCompany`/`deleteOpportunity` (siempre hay un actor real en esos call sites), pero
  **opcional** en los 4 `create*` — solo la ruta directa de cada entidad (`POST /api/hr/employees`,
  `/api/companies`, `/api/contacts`, `/api/opportunities`) lo pasa hoy. Tres orígenes que también
  crean estas entidades **no generan ninguna entrada de Activity Log todavía**: CSV import de
  Employees (`csvService.ts`), el seed de datos de ejemplo del onboarding
  (`onboardingService.ts`), y las submissions de Public Forms (`publicFormService.ts` — este último
  además no tiene ningún `User` autenticado detrás, así que ni siquiera hay un actor real que
  atribuirle). Decisión deliberada para mantener la Unidad 2 acotada a "una persona autenticada
  crea/edita/borra un registro puntual desde su propia pantalla" — extenderlo a los otros tres
  orígenes (bulk import, seed, formulario anónimo) queda como una unidad futura separada si hace
  falta, no una que se coló sin documentar.
- **Unidad 6 — scope cut real, decidido al implementar**: de los 6 tipos que el roadmap original
  listaba, se construyeron 3 (Tenant currency/plan, User rol/status, Invitation alta/cancelación/
  aceptación) y se dejaron deliberadamente afuera **Subscription**, **GoogleCalendarConnection** y
  **StripeConnection**. Motivo: los cambios de estado más interesantes de estas tres son
  disparados por webhooks (Paddle/Mercado Pago/Stripe) o por el cron de `planTransitionService.ts`
  — ninguno de esos caminos tiene un `User` actor real detrás, así que ni siquiera calificarían
  para loguearse bajo el mismo criterio ya aplicado en toda la Unidad 2 ("sin actor real, sin
  entrada"). Lo poco que sí tiene un actor humano (conectar/desconectar Google Calendar o Stripe,
  cambiar de plan/cancelar desde `subscriptionSelfServeService.ts`) es en la práctica un toggle
  booleano sin mucho campo que diffear, y su estado ya es visible directamente en la UI de
  Settings (`connected`/`needsReconnect`/`needsAttention`). Se puede retomar como una unidad
  separada si en algún momento se justifica.
- **Sesiones/login** (decisión 6).
- **Revertir un cambio desde el log** (solo lectura, ninguna unidad de esta ronda escribe).
- **Retención/purga** — el log crece sin límite por ahora, igual que `StatusHistoryEntry` hoy (sin
  borrado físico programado); revisar si el volumen real lo justifica más adelante.
- **Admin Center** (`northstack-devtasks`, repo separado) — este spec cubre el repo principal
  (`northstack`) únicamente; Tickets/Ideas ya tienen su propio hilo de Notes, no Activity Log.
