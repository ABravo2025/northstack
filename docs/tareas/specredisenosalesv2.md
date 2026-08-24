# Rediseño Sales v2 — Company / Contact / Opportunity

**Estado:** spec conversacional cerrada, sin construir todavía.
**Fecha de cierre de spec:** 2026-08-24.
**Revisión técnica:** 2026-08-24 (mismo día) — 1 gap real encontrado (Public Forms × `Pipeline.scope`, deferido a propósito, ver sección 0) y las 4 decisiones abiertas originales cerradas + 3 nuevas que salieron de la revisión (idempotencia de conversión, soft-delete de Contact/Opportunity, participantes de round-robin) — ver sección 7. Orden de construcción reordenado, ver sección 6.
**Contexto:** ronda de ajustes sobre el rediseño de Clients ya construido y verificado en `staging` (Company/Contact/Pipeline/Opportunity, 11 unidades, 2026-07-27 — ver `docs/tareas-desarrollo.md` y `docs/database-schema.md` grupo 5). Esto no reemplaza esa base, la extiende y corrige cuatro áreas puntuales.

Mismo criterio de ejecución que las rondas anteriores: build → `npm run build`/`npm test` → verificación real (curl y/o Playwright contra un tenant de prueba) → commit → push exclusivamente a `staging`, nunca a `main`, hasta revisión del usuario.

---

## 0. Resumen de qué cambia y por qué

Cuatro focos, en orden de dependencia (1 y 2 son independientes entre sí; 3 depende conceptualmente de 2; 4 es independiente pero de menor prioridad):

1. **Jerarquía de Company** — hoy es un registro plano, sin relación entre matriz y sucursales.
2. **Contact ↔ Company** — reglas sueltas de multi-threading, `isPrimary`, y sobre todo el modelo de leads sin Company confirmada.
3. **Opportunity / Pipeline** — el cambio más grande: se introduce el concepto de Pipeline con `scope` (`lead` vs `company`), lo que redefine cuándo una Opportunity necesita `companyId` y cómo se convierte un lead en cliente. Además: forecast ponderado, cambio de pipeline, cierre simétrico Won/Lost, automatizaciones y notificaciones in-app.
4. **Corte del `Client` legado** — gate de staging antes de producción, migración de Custom Fields campo por campo, corte real pospuesto a su propia sesión.

**Corrección importante sobre la marcha:** la primera versión de esta spec asumía que una Company tenía que existir antes de poder crear una Opportunity para un lead sin empresa confirmada (bloqueando el botón "Crear Opportunity" en el Contact). Se corrigió: el flujo real es que un lead avanza como Opportunity de puro Contact (sin Company) en un pipeline de scope `lead`, y la Company recién se crea cuando el lead efectivamente compra. Ver sección 3.2.

**Fuera de alcance de esta ronda, a propósito (2026-08-24):** la interacción entre `Pipeline.scope` y Public Forms (`matchOrCreateCompanyForContact`/`submitPublicForm`) no se toca todavía. Hoy un Form solo crea una Opportunity cuando ya resolvió una Company (dominio genérico o sin match → se crea el Contact, pero **no** se crea ninguna Opportunity) — así que tal cual está, un Form nunca va a poder alimentar un pipeline `scope: lead`. Confirmado con Alejandro: se deja así por ahora, se revisa recién cuando el resto de esta lógica de negocio esté terminada y probada.

---

## 1. Jerarquía de Company — completo (2026-08-24, en `staging`)

### 1.1 Schema

- [x] **Construido**: `Company.parentCompanyId` — FK nullable, autoreferencial a `Company` (relación `CompanyHierarchy`). Push aditivo, sin backfill.

### 1.2 Backend

- [x] **Construido**: `wouldCreateCompanyHierarchyCycle` en `companyService.ts` — mismo patrón de `wouldCreateManagerCycle` (`employeeService.ts`), llamado desde `routes/companies.ts`'s PATCH antes de aceptar un `parentCompanyId` nuevo (self-reference y ciclos de N pasos, ambos 400).
- [x] **Construido**: borrar una Company **no afecta a sus hijas por default** — `deleteCompany` las desvincula (`parentCompanyId: null`), mismo criterio que ya usa con Contacts. Nuevo flag opcional `cascadeToChildCompanies` (recursivo — borra todo el subárbol, no solo un nivel) para cuando sí se quiere aplicar la misma acción a las hijas.
- [x] **Construido**: `COMPANY_INCLUDE` suma `parentCompany: {id, name}` — el frontend ya trae la lista completa de Companies del tenant (mismo patrón que Contacts/Opportunities de una Company), así que las hijas directas se calculan client-side filtrando por `parentCompanyId`, sin un endpoint nuevo.

### 1.3 Frontend

- [x] **Construido**: `CompanyDetailModal.tsx` gana una sección "Hierarchy" — selector de `parentCompanyId` (`SearchableSelect`, excluye a la propia Company y a sus descendientes calculados client-side) + link "Open →" al padre si tiene uno, y una lista de Companies hijas directas, cada una clickeable (`onNavigate`, nueva prop — cambia qué Company muestra el modal sin pasar por la tabla).
- [x] **Construido**: `ConfirmDialog` extendido con una prop `checkboxes` (array) para más de un opt-in en el mismo diálogo — usado acá cuando una Company a borrar tiene tanto Opportunities vinculadas como Companies hijas; los demás call sites (un solo checkbox) no se tocaron, quedan con la prop singular de siempre.
- [ ] Sin límite de profundidad en el modelo — sin tope visual de indentación todavía (no hay una vista de árbol completo, solo un nivel a la vez vía navegación); no bloqueante, nota para si se retoma.

**Verificado** con un script de punta a punta contra `staging` real (2 tenants de prueba, creados y borrados vía Prisma): parent seteado con include correcto, ciclo de 2 pasos rechazado, self-reference rechazado, `parentCompanyId` de otro tenant rechazado, borrado sin cascada desvincula, borrado con cascada se lleva a la hija. `npm run build`/`npm test` (91/91) backend y build frontend en verde.

**Corrección 2026-08-24 (verificado contra el código real de `CompanyDetailModal.tsx`, no solo contra la spec)**: el ítem "tab de Contacts en el detalle de Company", que esta sección y el §3.4 original marcaban como pendiente, **ya existe** — la sección "Contacts (N)" con listar/vincular existente/crear nuevo/desvincular ya estaba construida (parte del rediseño de Clients original, 2026-07-27/30). No hubo nada que construir ahí; la Unidad 2 quedó más chica de lo planeado.

### 1.4 Explícitamente fuera de alcance de esta unidad

- Rollup de montos/Opportunities de las hijas hacia la matriz.
- Que el status derivado (Won → Customer) de una hija afecte a la matriz.
- Cualquier vista de reporting consolidado por jerarquía.

---

## 2. Contact ↔ Company

### 2.1 Multi-threading (indicador + reporting)

- [ ] Kanban de Opportunity: badge visual (ej. ámbar) cuando `OpportunityContact.count({ opportunityId }) === 1` — "1 solo contacto". Cálculo derivado, sin campo nuevo en base.
- [ ] `scripts/metrics-report.ts`: sumar una métrica más — % de Opportunities abiertas (`outcome: open`) con un solo Contact vinculado vs. más de uno. Mismo patrón que las métricas ya existentes ahí (corrido a mano, sin UI/endpoint nuevo).

### 2.2 Contact que cambia de Company

- [ ] **No se modela transferencia.** Confirmado con el usuario: cuando un Contact cambia de empresa, se borra el Contact viejo y se crea uno nuevo en la Company nueva (de todos modos cambia el email y el acceso). Sin cambios de schema para este caso.
- [x] **Resuelto 2026-08-24 — "Delete" de Contact pasa a "Deactivate" (soft), no borrado real**: `Contact.isActive Boolean @default(true)` (nuevo, aditivo — mismo idioma ya usado en `Pipeline.isActive`/`CustomFieldDefinition.isActive`/`StatusDefinition.isActive`, no un mecanismo nuevo). El botón "Delete" de Contact se reemplaza por "Deactivate" (mismo ícono/posición, mismo `ConfirmDialog`) — el registro nunca se borra, solo deja de listarse por default (mismo criterio que cualquier catálogo `isActive`), y sigue siendo la referencia válida de cualquier Note/Task/Opportunity histórica.
- [x] **`Opportunity.isActive Boolean @default(true)` (nuevo, mismo idioma)**: si el Contact que se desactiva es el **único** vinculado a una Opportunity (vía `OpportunityContact`), el `ConfirmDialog` avisa explícitamente ("Deactivating this contact will also deactivate N linked opportunity(ies)") y, al confirmar, desactiva ambos en la misma transacción — mismo patrón que ya usa `deleteContact` con su flag `deleteLinkedOpportunities`, solo que soft en vez de destructivo. Si la Opportunity tiene otros Contacts activos vinculados, solo se borra la fila `OpportunityContact` (se desvincula), la Opportunity queda intacta.
- [ ] **Alcance explícito de este punto — solo Contact/Opportunity, no toda la plataforma todavía**: Alejandro pidió este criterio ("avisar en vez de sorprender, flaggear en vez de borrar") como dirección general para el resto de la app, pero **no** se retrofitea acá ningún `delete*` existente de Employee/Company/Client/etc. — son borrados reales hoy (`deleteCompany`, `deleteEmployee`, etc.), y convertirlos a este mismo patrón toca uniqueness constraints (`Employee.email` único por tenant), exports CSV, listados, y más — es su propia sesión de spec, no algo para colar acá sin avisar.

### 2.3 `isPrimary` único por Company

- [ ] Al marcar `Contact.isPrimary = true`, envolver en `$transaction`: `updateMany({ where: { companyId, isPrimary: true, id: { not: contactId } }, data: { isPrimary: false } })` seguido del update del Contact en cuestión. Mismo patrón transaccional que ya usa `deleteOpportunity`.
- [ ] Validar en el PATCH de Contact: si `companyId` es `null`, `isPrimary` no debería tener efecto de unicidad (no hay Company contra la cual ser único) — permitir el valor pero sin disparar el `updateMany`.

### 2.4 Leads sin Company confirmada

**Ver sección 3.2 — el diseño de este punto se resolvió como parte del rediseño de Pipeline con scope, no de forma aislada en Contact.** No queda ninguna tarea de "bloquear botón Crear Opportunity en Contact" — ese botón directamente no aparece fuera de contexto de pipelines `lead` (ver 3.4).

---

## 3. Opportunity / Pipeline

**Corrección arquitectural, 2026-08-24 (post-revisión, antes de tocar código):** al arrancar la Unidad 1 encontramos que buena parte de esta sección ya estaba resuelta — con un diseño distinto — en una ronda anterior no documentada (2026-07-29, "Clients Tier 3: cierre del rediseño", ver `docs/tareas/historial-2026-07-22_2026-07-31.md`, no reflejado en `database-schema.md`/`current-process-flow.md`). Ya existe `Pipeline.type` (`'lead' | 'account'`, aditivo, sembrado igual que este spec pedía) y, en vez de dejar `Opportunity.companyId` nullable, se decidió explícitamente **no relajarlo**: un pipeline `lead` sin Company confirmada crea una **Company placeholder al vuelo** (`ContactDetailModal.tsx`, `handleCreateOpportunity`) en vez de tolerar `companyId: null`; un pipeline `account` exige una Company ya identificada. Confirmado con Alejandro: **se mantiene ese mecanismo** en vez de migrar a `companyId` nullable — reusa código ya probado contra `staging`/producción y evita limpiar datos placeholder existentes. Toda esta sección se reescribe abajo sobre esa base. Nomenclatura: de acá en adelante `type`/`'lead'`/`'account'` (los nombres reales del código), no `scope`/`'company'` — no se renombra nada en código para esto, sería churn sin beneficio.

### 3.1 `Pipeline.type` — ya existe, falta cerrar 2 huecos

- [x] **Ya construido (2026-07-29)**: enum `PipelineType` (`lead`/`account`), campo `Pipeline.type` con `@default(lead)`, CRUD en `pipelineService.ts`, seed correcto ("Leads" → `lead`, "Clientes" → `account`). Nada de esto se reconstruye.
- [ ] **Hueco 1 — inmutable después de creado**: hoy `updatePipeline`/`UpdatePipelineInput` acepta `type` en cualquier momento, y `PipelinesSettingsPage.tsx` (`handleTypeChange`) lo deja cambiar libremente desde un `<select>` en la lista — reclasificar un pipeline con Opportunities ya creadas bajo el supuesto contrario queda posible hoy. Sacar `type` de `UpdatePipelineInput` (backend) y del `<select>` editable (mostrar de solo lectura, ej. un chip, una vez creado).
- [ ] **Hueco 2 — el default implícito**: `@default(lead)` en el schema queda (no vale la pena una migración solo para sacarlo), pero `POST /api/pipelines` debe exigir `type` en el body igual (400 si falta) — que un tenant nuevo lo elija a propósito al crear un pipeline, no que caiga en `lead` por omisión silenciosa del formulario.

### 3.2 El gate de Company por `type` — hoy solo en el frontend, hay que blindarlo en el backend

- [x] **Ya construido (frontend únicamente)**: `ContactDetailModal.tsx` bloquea crear una Opportunity en un pipeline `account` sin Company ya vinculada, y en un pipeline `lead` sin Company pide un nombre para crear una placeholder (`api.createCompany` con solo `name` + el Contact como fundador).
- [ ] **Resuelto 2026-08-24 — falta el mismo gate en `opportunityService.createOpportunity`**: hoy `POST /api/opportunities` no valida nada de esto — pegarle directo a la API con cualquier `companyId` (o sin él) en cualquier pipeline pasa sin chequeo. Mismo principio no-negociable del proyecto (nunca confiar solo en validación de cliente): replicar el gate en el backend — `type: 'account'` sin `companyId` → 400; `type: 'lead'` sin `companyId` sigue requiriendo uno (la creación de la placeholder pasa por `companyService.createCompany` antes, no por un `companyId` nulo).
- [ ] `amountCents` + `currency` se mantienen obligatorios en ambos tipos (sin cambios respecto al comportamiento actual).
- [ ] **Schema nuevo — `Company.isPlaceholder Boolean @default(false)`**, aditivo. Se setea `true` únicamente cuando `companyService.createCompany` se llama desde el flujo de alta de Opportunity `lead` sin Company (nuevo parámetro opcional `isPlaceholder?: boolean` en `CreateCompanyInput`, default `false` para el resto de los call sites — Companies creadas desde `/companies` directo o por Form nunca son placeholder). Sin esto no hay forma de saber, más adelante, qué Companies todavía necesitan que alguien complete sus datos reales — es la pieza que faltaba para que 3.3 tenga algo que hacer al cerrar un lead.

### 3.3 Cierre de una Opportunity `lead` — dispara el cambio de pipeline de 3.6 (reemplaza la "conversión" original)

Disparador: una Opportunity de un pipeline `type: 'lead'` entra a un stage con `outcome: 'won'`.

**Ya no se crea una Opportunity nueva** — la Company siempre estuvo vinculada desde la creación (aunque sea placeholder), así que no hace falta resolver/crear nada en el momento de ganar. Esto deja afuera `Opportunity.convertedToOpportunityId` (no hace falta) y el paso de "propagar companyId a los Contacts" (ya resuelto desde la creación, ver 3.2).

- [ ] `maybeOfferAccountPipelineOnWin` (nueva función, mismo espíritu que `maybeAdvanceCompanyToCustomer`): se dispara al mover el stage, solo si `opportunity.pipeline.type === 'lead'` y el nuevo stage tiene `outcome: 'won'`.
- [ ] Guardia: si la Opportunity ya está en un pipeline `type: 'account'`, no hace nada (evita loops si algo re-dispara el evento).
- [ ] La Opportunity queda `outcome: won` en su pipeline `lead` de origen igual (comportamiento normal, sin bloquear el guardado), y el frontend abre el modal de "Move to account pipeline" (el mecanismo de 3.6) inmediatamente después, con el gate de placeholder de esa sección aplicando igual.
- [ ] `winReasonId`/`closeNote` (3.7) se piden en el mismo momento en que se confirma el stage `won` — sin esperar a que se complete el cambio de pipeline, que es un paso aparte y opcional (el vendedor puede cerrarlo y mover la Opportunity de pipeline más tarde).

### 3.4 UI de creación de Opportunity contextual — la mayor parte ya existe

- [x] **Ya construido**: el flujo completo desde `ContactDetailModal.tsx` (elegir Pipeline, gate de Company, placeholder inline) — no es una unidad nueva, es lo que ya está en 3.1-3.2.
- [x] **Corregido 2026-08-24 (verificado contra el código)**: el "requisito de UI" de la sección Contacts en el detalle de Company que este punto marcaba como pendiente ya existe — ver §1.3.
- [ ] **Pendiente real, único ítem que queda de esta unidad**: `CompanyDetailModal.tsx`'s "Agregar Opportunity" (`handleCreateOpportunity`/`openAddOpportunity`) hoy lista **todos** los pipelines activos (`activePipelines`, sin filtrar), no solo los `type: 'account'` — falta acotar el selector y agregar el selector opcional de Contacts ya vinculados a esa Company (autocomplete acotado a `Contact.companyId === company.id`).
- [ ] **Modal genérico** (desde el módulo Opportunities, sin partir de un perfil): elegir Pipeline primero (cualquier `type`); según el `type` elegido, mostrar dinámicamente el buscador de Company (`account`, ya existente) o el flujo de Contact + nombre-de-Company-placeholder (`lead`, mismo patrón que `ContactDetailModal.tsx`).

### 3.5 Forecast ponderado

- [ ] Schema: `PipelineStageDefinition.probability` — int 0-100, editable por tenant al configurar stages en `/settings` → Pipelines.
- [x] **Resuelto 2026-08-24 — fórmula de seed**: para los stages `outcome: open` de un Pipeline nuevo (N de ellos, en orden), el primero arranca en 10% y el último en 80%, con el resto interpolado en pasos iguales (`10 + i × 70/(N-1)`, redondeado al 5% más cercano; con un solo stage intermedio, 50% liso). `outcome: won` siempre 100%, `outcome: lost` siempre 0% — forzado en backend, no depende de que el tenant lo configure bien. Como es 100% editable después desde `/settings` → Pipelines, la precisión del default no es crítica.
- [ ] Cálculo de pipeline value: `Σ (amountCents × probability / 100)` sobre Opportunities `outcome: open` — reemplaza la suma simple actual. Dónde se muestra: header del Kanban de Opportunity (total del pipeline) y, si se puede, subtotal por stage.

### 3.6 Cambio de Pipeline — incluye el gate de Company real para pipelines `account`

- [ ] `updateOpportunity`: permitir reasignar `pipelineId`. Al hacerlo, resetear `stageId` al primer stage activo (`order: 1`, `isActive: true`) del pipeline nuevo.
- [ ] Si el pipeline destino no tiene ningún stage activo, rechazar el cambio con 400 (no dejar la Opportunity en un stage que no pertenece a su pipeline).
- [x] **Resuelto 2026-08-24 — reemplaza la nota original sobre `scope`**: si el pipeline destino es `type: 'account'` y `company.isPlaceholder === true`, el cambio se bloquea hasta completar los datos reales — modal que pide los campos de `Company` (industry/website/phone/etc.) en el mismo paso; al confirmar, `Company.isPlaceholder → false` + el cambio de pipeline, en una transacción. Si ya es `isPlaceholder: false`, el cambio de pipeline no pide nada extra. Mover a un pipeline `type: 'lead'` nunca pide nada (siempre hay una Company, placeholder o no). Este es el mecanismo que usa 3.3 al cerrar un lead — no hay dos caminos separados.

### 3.7 Cierre simétrico Won/Lost

- [ ] Schema: extender enum `CatalogKind` con `winReason` (junto a `department`/`jobTitle`/`leadSource`/`lossReason`), reusando `FieldCatalogDefinition` — mismo mecanismo que ya se usó para no crear tablas nuevas por catálogo.
- [ ] **Recordar el bug ya conocido:** `VALID_CATALOG_KINDS` en `src/routes/catalogs.ts` hay que actualizarlo con el nuevo valor — ya pasó una vez que se olvidó al agregar `leadSource`/`lossReason` y rompió `GET /api/field-catalog?kind=...` con 400.
- [ ] `Opportunity.winReasonId` — FK nullable, obligatoria a nivel de aplicación cuando el stage destino tiene `outcome: won` (mismo patrón que `lossReasonId` con `outcome: lost`).
- [ ] Schema: `Opportunity.closeNote` — texto libre, opcional, aplica a ambos outcomes (Won y Lost).
- [ ] UI: el modal de cierre de Opportunity (al mover a un stage won/lost) pide el reason correspondiente (`winReasonId`/`lossReasonId`) más `closeNote` opcional, para ambos casos.

### 3.8 Automatizaciones (diseño ahora, build después)

- [ ] Schema: `Pipeline.assignmentMode` — enum `'round_robin' | 'account_owner'`, nullable (null = sin auto-asignación). Configurable por Pipeline, con la posibilidad de moverse a otro nivel (tenant/Form) más adelante si hace falta — no cerrado como definitivo.
- [x] **Resuelto 2026-08-24 — quiénes rotan en el round-robin**: en vez de inferir el universo desde el rol (`owner`/`admin`/`member`), el owner/admin lo define a mano por Pipeline. Schema nuevo: `PipelineAssignmentUser` (`id`, `tenantId`, `pipelineId` FK, `userId` FK, `@@unique([pipelineId, userId])`) — join table simple, mismo patrón que `EmployeeTimeOffPolicy`. `Pipeline.lastAssignedUserId` sigue siendo el cursor, rotando solo entre los `User` listados en `PipelineAssignmentUser` para ese Pipeline (no todos los del tenant). Frontend: en `/settings` → Pipelines, un picker chico (checklist de Users del tenant) visible solo cuando `assignmentMode: 'round_robin'`. Vacío por default — si `assignmentMode` es `round_robin` y no hay ningún participante configurado, la Opportunity queda sin owner asignado (degradación prolija, mismo criterio que `mailerConfigured()` para SMTP no configurado) en vez de romper. Alejandro confirmó explícitamente: esto se mejora a futuro, la versión de esta ronda alcanza con un picker simple en Settings.
- [ ] **Ajustado 2026-08-24 (ya no se crea una Opportunity nueva, ver 3.3)** — Regla `account_owner`: al mover una Opportunity a un pipeline `type: 'account'` (3.6, ya sea por el cierre de un lead o un cambio manual de pipeline), si `company.accountOwnerId` está seteado, reasigna `Opportunity.ownerId` a ese valor. Si la Company no tiene `accountOwnerId` (es opcional), fallback a round-robin para no dejar la Opportunity sin owner.
- [ ] Schema: `Pipeline.stalledThresholdDays` — int nullable (null = recordatorio desactivado para ese pipeline).
- [ ] **Pieza de infraestructura nueva:** hoy no existe ningún job programado en el backend (todo es sincrónico dentro del request). Se necesita el primer cron real: job periódico que recorra Opportunities `outcome: open`, calcule hace cuánto no cambia de stage (última fila de `OpportunityStageHistory`), y dispare el recordatorio si supera `pipeline.stalledThresholdDays`. Marcar explícitamente como el primer trabajo de este tipo en el proyecto — no asumir que hay infraestructura reusable.
- [ ] Notificación de cambio de stage: dispara `Notification` (ver 3.9) + email al owner, de forma sincrónica en el mismo flujo que actualiza `stageId`.

### 3.9 Notificaciones in-app (versión mínima)

- [ ] Schema — nueva entidad `Notification`: `id`, `tenantId`, `userId` (destinatario), `type` (enum extensible: arranca con `opportunity_stage_changed`, `opportunity_stalled`), `entityType` + `entityId` (genérico, mismo patrón que `CustomFieldValue`), `message` (texto ya armado al crear la fila, no calculado al leer — mismo criterio que `StatusHistoryEntry` guardando el nombre del status en vez de una FK viva, para que un rename posterior no rompa notificaciones viejas), `read` (boolean, default false), `createdAt`.
- [ ] Backend: endpoint para listar notificaciones del User autenticado (paginado, no leídas primero) y marcar como leída (individual y "marcar todas").
- [ ] Frontend: bell icon en la barra superior con contador de no leídas, dropdown con la lista. Polling liviano (no websockets en esta primera versión).

### 3.10 Métrica de ciclo lead → cliente (nueva, 2026-08-24; fórmula simplificada tras la corrección arquitectural de esta sección)

Idea surgida de esta ronda de revisión, aprobada por Alejandro. Como ya no se crea una Opportunity nueva al cerrar un lead (3.3) — es la misma Opportunity la que cambia de pipeline — la métrica sale de una sola fila de `OpportunityStageHistory` (ya existente desde el rediseño original) por Opportunity, no de un par: no hace falta ningún dato nuevo.

- [ ] Base del reporte: para cada Opportunity cuyo pipeline actual es `type: 'account'` pero que tuvo al menos una fila de `OpportunityStageHistory` en un pipeline `type: 'lead'` antes, calcular `tiempo = fecha de la primera fila de OpportunityStageHistory de esa Opportunity (su creación, en el pipeline lead) − fecha de la fila de OpportunityStageHistory donde entró al pipeline account (el cambio de 3.6)`. Mismo criterio de mediana (no promedio) que ya usan las specs de métricas del proyecto (`docs/metrics/basic-metrics-spec.md`) — un solo outlier no debería distorsionar el número.
- [ ] Entregable mínimo: agregar al script ad hoc existente (`scripts/metrics-report.ts`) en vez de crear un mecanismo nuevo — mismo patrón que ya usa 2.1 (multi-threading) de esta misma spec.
- [x] **Corregido 2026-08-24 (verificado contra el código real, no solo contra la doc)**: `ClientsDashboardPage.tsx`, que esta misma sección recomendaba reusar, **no existe** — se borró en el rediseño de Clients de julio junto con la página legada, y `docs/general/current-process-flow.md` (de donde salió la referencia) ya advertía explícitamente que ese listado de páginas estaba desactualizado. El único placeholder real de este tipo que existe hoy es `HrDashboardPage.tsx` (`/hr/dashboard` — "Metrics... coming in a future project", sin lógica), pero es de HR, no de Sales.
- [ ] Se construye una página nueva, `SalesDashboardPage.tsx`, siguiendo el mismo espíritu simple que `HrDashboardPage.tsx` (nada de infraestructura nueva de layout) más el widget de esta sección. Ruta/entrada de nav a definir junto con Alejandro cuando se llegue a esta unidad — mockup visual primero (ver Artifact compartido 2026-08-24) antes de decidir la ruta final.

---

## 4. Corte del `Client` legado

- [ ] **Gate de producción:** antes de aprobar el push del backfill (`scripts/backfill-clients-to-companies-contacts.ts`) a producción, se vuelve a correr y verificar en `staging` una vez más (no alcanza con la corrida de hace unas semanas) — mismo criterio de "staging primero sin excepciones" que ya se venía siguiendo.
- [ ] **Custom Fields de `entityType: 'client'`:** migración manual campo por campo, no automática. Alguien revisa la lista completa de custom fields de Client hoy y decide, uno por uno, si describe a la persona (→ Contact) o a la empresa (→ Company). Documentar la decisión de cada campo en una tabla antes de tocar código.
- [ ] **Public Forms de `entityType: 'client'`:** misma lógica, revisar caso por caso si el form pasa a `entityType: 'contact'` (con la lógica de matching ya construida) o si algún campo específico amerita tratamiento distinto.
- [ ] **Corte real (ocultar/borrar rutas, UI, sidebar de `Client`):** queda explícitamente fuera de esta ronda — es su propia sesión de spec dedicada, del mismo tamaño que la sesión que originó todo este rediseño. No definir su gate todavía.

---

## 5. Resumen de cambios de schema (Prisma) — consolidado

Para referencia rápida al armar la migración. Todo aditivo salvo donde se marca explícitamente.

```
Company.parentCompanyId          String?  (FK → Company, mismo tenant)
Company.isPlaceholder            Boolean  @default(false)  (2026-08-24, reemplaza el companyId nullable original — ver §3)

Contact.isActive                 Boolean  @default(true)

Opportunity.winReasonId          String?  (FK → FieldCatalogDefinition, kind: winReason)
Opportunity.closeNote            String?
Opportunity.isActive             Boolean  @default(true)
                                  (Opportunity.companyId NO cambia — sigue obligatoria, ver corrección 2026-08-24 al inicio de §3;
                                   Opportunity.convertedToOpportunityId ya NO se agrega — no hace falta, ver §3.3)

(Pipeline.type ya existe — PipelineType: lead | account, @default(lead) — no se agrega Pipeline.scope, ver §3.1)
Pipeline.assignmentMode          String?  (enum: round_robin | account_owner)
Pipeline.lastAssignedUserId      String?  (FK → User)
Pipeline.stalledThresholdDays    Int?

PipelineAssignmentUser           (tabla nueva — join Pipeline↔User, participantes del round-robin)

PipelineStageDefinition.probability   Int  (0-100)

CatalogKind                      + valor nuevo: winReason

Notification                     (tabla nueva — ver 3.9 para todos los campos)
```

---

## 6. Orden sugerido de construcción

Pensado para minimizar dependencias cruzadas — cada unidad build → test → verificación real → commit → push a `staging`, igual que el rediseño original. **Reordenado 2026-08-24**, dos veces el mismo día: primero para sacar valor antes y separar automatizaciones en dos entregables; después, tras encontrar que `Pipeline.type` ya existía con un diseño distinto (placeholder Company en vez de `companyId` nullable — ver corrección al inicio de §3), el punto 1 se achicó bastante — ya no es un cambio de schema greenfield, es blindar/cerrar huecos de algo que ya está construido:

1. **Cerrar los huecos de `Pipeline.type`/gate de Company** (3.1, 3.2) — inmutabilidad de `type` post-creación, `type` obligatorio en el body de creación, el gate de Company replicado en el backend (`opportunityService.createOpportunity`), `Company.isPlaceholder`. Es la base de la que depende todo lo demás de la sección 3, pero mucho más chica que la Unidad 1 original.
2. **Company hierarchy** (sección 1) — ✅ completo. El tab de Contacts que este punto también contemplaba resultó ya estar construido (corrección 2026-08-24, ver §1.3) — no hizo falta nada ahí.
3. **isPrimary único + multi-threading indicador + soft-delete de Contact/Opportunity** (2.1, 2.2, 2.3) — independiente, rápido.
4. **Cambio de Pipeline con el gate de Company real, más el disparador de cierre de lead** (3.6 primero — es el mecanismo genérico —, después 3.3, que solo lo invoca al ganar) — depende del punto 1.
5. **UI contextual de creación de Opportunity desde Company** (3.4, sin el tab de Contacts que ya se movió al punto 2) — depende de los puntos 1 y 4.
6. **Forecast ponderado + cierre simétrico Won/Lost** (3.5, 3.7) — independientes entre sí, dependen solo del punto 1.
7. **Notificaciones in-app** (3.9, modelo `Notification` + bell icon + marcar leído) — separado de las automatizaciones (punto 8): no necesita el cron, tiene valor por sí solo apenas exista un evento que dispare `type: opportunity_stage_changed`, y baja el tamaño/riesgo del entregable más grande.
8. **Automatizaciones** (3.8 — round-robin/account-owner, `stalledThresholdDays`, el cron de deal estancado) — el primer cron real del proyecto, se deja para el final una vez que 3.9 (Notification) ya existe para que lo consuma.
9. **Corte de Client** (sección 4) — sin dependencia técnica con lo anterior, se puede hacer en cualquier momento, pero conviene dejarlo último por ser el de menor urgencia real.
10. **(Nuevo, baja prioridad) Métrica de ciclo lead → cliente** — ver sección 3.10. No bloquea nada de lo anterior; se puede intercalar donde convenga o dejar para el final.

---

## 7. Decisiones — cerradas en la ronda de revisión 2026-08-24

Todas las que quedaban abiertas en el cierre original de esta spec ya están resueltas, más 3 nuevas que salieron de esta revisión. El detalle de cada una vive en su sección correspondiente:

- Borrado/cambio de status de Company con hijas → independiente, con prompt opcional de aplicar en cascada (1.2).
- Borrado de Contact → pasa a "Deactivate" (soft, `isActive`), con la misma degradación para la Opportunity que quede sin ningún Contact activo (2.2, nuevo).
- Propagación de `companyId` en la conversión → a todos los Contacts vinculados, la UI destaca solo el primary (3.3).
- Guardia de idempotencia en `maybeConvertLeadOpportunity` (3.3, nuevo — no estaba en el cierre original).
- Valores default de `probability` al sembrar un Pipeline → fórmula 10%→80% interpolada (3.5).
- Universo de usuarios del round-robin → configurable por Pipeline en Settings, no inferido del rol (3.8, nuevo).
- Interacción `Pipeline.scope` × Public Forms → deferida a propósito, se retoma cuando el resto de esta lógica esté terminada y probada (sección 0).
