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

## 2. Contact ↔ Company — completo (2026-08-24, en `staging`)

### 2.1 Multi-threading (indicador + reporting)

- [x] **Construido**: badge ámbar (`.kc-single-thread`, nuevo) en la card de Kanban de Opportunity cuando `contactLinks.length === 1`.
- [x] **Construido**: `scripts/metrics-report.ts` suma "Sales: multi-threading" — % de Opportunities abiertas (`stage.outcome === 'open'`, activas) con 1 solo Contact vinculado vs. más de uno.

### 2.2 Contact que cambia de Company

- [ ] **No se modela transferencia.** Confirmado con el usuario: cuando un Contact cambia de empresa, se borra el Contact viejo y se crea uno nuevo en la Company nueva (de todos modos cambia el email y el acceso). Sin cambios de schema para este caso.
- [x] **Construido — `Contact.isActive Boolean @default(true)`**: `contactService.ts`'s `deactivateContact` reemplaza al viejo `deleteContact` (mismo verbo/ruta `DELETE /api/contacts/:id`, semántica distinta) — nunca borra, nunca bloquea. El botón "Delete" pasa a decir "Deactivate" (mismo ícono/posición, `ConfirmDialog` sin checkbox — ya no hay una elección destructiva que ofrecer). `listContacts` excluye `isActive: false` por default (sin UI de "ver desactivados" todavía — nota de alcance abajo).
- [x] **Construido — `Opportunity.isActive Boolean @default(true)`**: si el Contact que se desactiva es el único vínculo activo de una Opportunity, la Opportunity se desactiva también (mismo criterio, misma transacción); si tiene otros Contacts activos, solo se borra la fila `OpportunityContact` (desvincula). `listOpportunities` también excluye `isActive: false` por default.
- [ ] **Gap conocido, no bloqueante**: no hay UI para ver/reactivar Contacts u Opportunities desactivados todavía — `isActive` quedó whitelisteado en ambos `update*Input` (se puede revertir por API), pero sin botón ni vista. Anotado para una pasada de pulido futura, no en esta unidad (sizing "rápido").
- [x] **Alcance explícito de este punto — solo Contact/Opportunity, no toda la plataforma**: confirmado, no se tocó ningún `delete*` de Employee/Company/Client/etc.

### 2.3 `isPrimary` único por Company — completo

- [x] **Construido**: `createContact`/`updateContact` (`contactService.ts`) envuelven en `$transaction` — `updateMany({ where: { companyId, isPrimary: true, id: { not: contactId } }, data: { isPrimary: false } })` antes de guardar el nuevo primary, tanto al crear como al editar.
- [x] **Construido**: un Contact sin `companyId` guarda `isPrimary` tal cual, sin disparar ningún `updateMany` (no hay Company contra la cual ser único).

**Verificado** con un script de punta a punta contra `staging` real: crear un 2do primary demueve al 1ro, lo mismo vía PATCH, un Contact sin Company no dispara nada; desactivar el único Contact de una Opportunity la desactiva a ella también, desactivar uno de dos solo desvincula; ambas listas por default excluyen lo desactivado. `npm run build`/`npm test` (91/91) backend y build frontend en verde.

### 2.4 Leads sin Company confirmada

**Ver sección 3.2 — el diseño de este punto se resolvió como parte del rediseño de Pipeline con scope, no de forma aislada en Contact.** No queda ninguna tarea de "bloquear botón Crear Opportunity en Contact" — ese botón directamente no aparece fuera de contexto de pipelines `lead` (ver 3.4).

---

## 3. Opportunity / Pipeline

**Corrección arquitectural, 2026-08-24 (post-revisión, antes de tocar código):** al arrancar la Unidad 1 encontramos que buena parte de esta sección ya estaba resuelta — con un diseño distinto — en una ronda anterior no documentada (2026-07-29, "Clients Tier 3: cierre del rediseño", ver `docs/tareas/historial-2026-07-22_2026-07-31.md`, no reflejado en `database-schema.md`/`current-process-flow.md`). Ya existe `Pipeline.type` (`'lead' | 'account'`, aditivo, sembrado igual que este spec pedía) y, en vez de dejar `Opportunity.companyId` nullable, se decidió explícitamente **no relajarlo**: un pipeline `lead` sin Company confirmada crea una **Company placeholder al vuelo** (`ContactDetailModal.tsx`, `handleCreateOpportunity`) en vez de tolerar `companyId: null`; un pipeline `account` exige una Company ya identificada. Confirmado con Alejandro: **se mantiene ese mecanismo** en vez de migrar a `companyId` nullable — reusa código ya probado contra `staging`/producción y evita limpiar datos placeholder existentes. Toda esta sección se reescribe abajo sobre esa base. Nomenclatura: de acá en adelante `type`/`'lead'`/`'account'` (los nombres reales del código), no `scope`/`'company'` — no se renombra nada en código para esto, sería churn sin beneficio.

### 3.1 `Pipeline.type` — ya existe, falta cerrar 2 huecos

- [x] **Ya construido (2026-07-29)**: enum `PipelineType` (`lead`/`account`), campo `Pipeline.type` con `@default(lead)`, CRUD en `pipelineService.ts`, seed correcto ("Leads" → `lead`, "Clientes" → `account`). Nada de esto se reconstruye.
- [x] **Construido — Unidad 1 (2026-08-24, en `staging`)**: sacado `type` de `UpdatePipelineInput` (backend) y del `<select>` editable de `PipelinesSettingsPage.tsx` (ahora texto de solo lectura) — inmutable después de creado.
- [x] **Confirmado — Unidad 1**: `POST /api/pipelines` ya exigía `type` en el body (400 si falta) desde el 2026-07-29 — el "hueco 2" resultó no ser tal, no hizo falta ningún cambio.

### 3.2 El gate de Company por `type` — hoy solo en el frontend, hay que blindarlo en el backend

- [x] **Ya construido (frontend únicamente)**: `ContactDetailModal.tsx` bloquea crear una Opportunity en un pipeline `account` sin Company ya vinculada, y en un pipeline `lead` sin Company pide un nombre para crear una placeholder (`api.createCompany` con solo `name` + el Contact como fundador).
- [x] **Construido — Unidad 1**: el mismo gate ahora corre en `validateOpportunityRefs` (`routes/opportunities.ts`), tanto en create como en update — pegarle directo a la API ya no lo saltea. `type: 'account'` sin `companyId` real (o con uno `isPlaceholder: true`) → 400; `type: 'lead'` sigue requiriendo un `companyId` (la placeholder se crea antes, vía `companyService.createCompany`).
- [x] `amountCents` + `currency` se mantienen obligatorios en ambos tipos — confirmado, sin cambios de código.
- [x] **Construido — Unidad 1**: `Company.isPlaceholder Boolean @default(false)`, aditivo. Se setea `true` desde `ContactDetailModal.tsx`'s `handleCreateOpportunity` (único call site), `false` en cualquier otro (alta manual, Public Form).

### 3.3 Cierre de una Opportunity `lead` — dispara el cambio de pipeline de 3.6 (reemplaza la "conversión" original)

Disparador: una Opportunity de un pipeline `type: 'lead'` entra a un stage con `outcome: 'won'`.

**Ya no se crea una Opportunity nueva** — la Company siempre estuvo vinculada desde la creación (aunque sea placeholder), así que no hace falta resolver/crear nada en el momento de ganar. Esto deja afuera `Opportunity.convertedToOpportunityId` (no hace falta) y el paso de "propagar companyId a los Contacts" (ya resuelto desde la creación, ver 3.2).

- [x] **Construido — Unidad 4 (2026-08-24)**: implementado como un `useEffect` en `OpportunityDetailModal.tsx` (no una función de backend — se decidió así porque "abrir el modal" es inherentemente una acción de frontend, y reaccionar a `opportunity.stageId`/`pipeline.type` cubre tanto un cambio de stage hecho dentro del propio modal como abrir el modal ya parado en ese estado, ver el bullet de abajo) que se dispara solo si `pipeline.type === 'lead'` y `currentStage.outcome === 'won'`.
- [x] **Construido — Unidad 4**: Guardia equivalente — si `pipeline.type !== 'lead'` el efecto no hace nada, así que una Opportunity ya en `account` nunca vuelve a ofrecer el paso.
- [x] **Construido — Unidad 4**: la Opportunity queda `won` en su pipeline `lead` de origen sin bloquear el guardado; aparece un banner inline ("Move to account pipeline?") en el mismo field-group de Stage con un selector de pipelines `account` activos + botón "Move" que reusa el mecanismo de 3.6 (incluyendo su gate de placeholder). Desde el Kanban (`OpportunitiesPage.tsx`'s `handleMove`), un drag-and-drop que aterriza en `won` dentro de un pipeline `lead` abre automáticamente el detail modal para que el banner aparezca de inmediato, sin esperar a que el usuario lo abra manualmente.
- [ ] **Pendiente (no es parte de Unidad 4, ver 3.7)**: `winReasonId`/`closeNote` se piden en el mismo momento en que se confirma el stage `won` — sin esperar a que se complete el cambio de pipeline, que es un paso aparte y opcional (el vendedor puede cerrarlo y mover la Opportunity de pipeline más tarde).

### 3.4 UI de creación de Opportunity contextual — la mayor parte ya existe

- [x] **Ya construido**: el flujo completo desde `ContactDetailModal.tsx` (elegir Pipeline, gate de Company, placeholder inline) — no es una unidad nueva, es lo que ya está en 3.1-3.2.
- [x] **Corregido 2026-08-24 (verificado contra el código)**: el "requisito de UI" de la sección Contacts en el detalle de Company que este punto marcaba como pendiente ya existe — ver §1.3.
- [x] **Construido — Unidad 5 (2026-08-24)**: `CompanyDetailModal.tsx`'s "Agregar Opportunity" ahora lista solo pipelines `type: 'account'` activos (antes listaba todos, sin filtrar) y agrega un selector opcional de Contact acotado a `companyContacts` (ya calculado en el componente, `Contact.companyId === company.id`) — si se elige uno, se linkea a la Opportunity recién creada vía `addOpportunityContact`.
- [x] **Construido — Unidad 5**: **Modal genérico** (`OpportunitiesPage.tsx`'s "Add Opportunity", sin partir de un perfil de Contact/Company) — ahora pide Pipeline primero (cualquier `type`, por defecto el de la pestaña activa del Kanban); según el `type` elegido muestra dinámicamente el buscador de Company existente (`account`, filtrado a no-placeholder — evita ofrecer una opción que el gate del backend rechazaría igual) o el flujo de Contact + Company-placeholder (`lead`): elegir un Contact existente o crear uno nuevo inline (firstName/lastName/email), y si ese Contact no tiene Company todavía, pedir un nombre para crear una placeholder — mismo patrón que `ContactDetailModal.tsx`, generalizado porque acá no hay un Contact/Company de partida. Cambiar de Pipeline resetea los campos específicos del tipo anterior (Company vs. Contact/placeholder) para que no quede un valor cruzado sin sentido.
- **Verificado 2026-08-24** contra staging real, replicando por HTTP la secuencia exacta de llamadas que hace cada rama del frontend (Contact nuevo + Company placeholder; Contact existente que ya tiene Company, sin crear placeholder; Company real en un pipeline `account`; y el caso de regresión — una Company placeholder sigue bloqueada por el gate del backend en un pipeline `account`, aunque la UI ya no la ofrezca). **No se pudo probar visualmente en navegador** — este entorno no tiene una herramienta de automatización de navegador disponible; la verificación cubre los contratos de API que el nuevo código de frontend asume, más una revisión manual cuidadosa del JSX (renderizado condicional, atributos `required` nativos para que el submit manual quede bloqueado igual que el resto del formulario), pero no un click-through real.

### 3.5 Forecast ponderado

- [x] **Construido — Unidad 6 (2026-08-24)**: Schema `PipelineStageDefinition.probability` — int 0-100, `@default(50)`. Editable por tenant en `/settings` → Pipelines (input numérico junto al selector de outcome, solo para stages `open` — para `won`/`lost` se muestra el valor forzado como texto, no editable).
- [x] **Resuelto 2026-08-24 — fórmula de seed**: para los stages `outcome: open` de un Pipeline nuevo (N de ellos, en orden), el primero arranca en 10% y el último en 80%, con el resto interpolado en pasos iguales (`10 + i × 70/(N-1)`, redondeado al 5% más cercano; con un solo stage intermedio, 50% liso). `outcome: won` siempre 100%, `outcome: lost` siempre 0% — forzado en backend, no depende de que el tenant lo configure bien. Como es 100% editable después desde `/settings` → Pipelines, la precisión del default no es crítica.
- [x] **Construido — Unidad 6, con una aclaración**: la fórmula de interpolación por N solo aplica literalmente al seed de tenant-registration (`seedDefaultPipelines`, N=2 conocido de antemano → 10%/80% exactos para "Leads"/"Clientes"). El agregado de un stage ad-hoc uno-a-uno (`createPipelineStage`, tanto el botón "Add Stage" como el loop del formulario "Create Pipeline") no conoce el N final de antemano, así que usa un default plano de 50% para `open` — sigue siendo 100% editable después, así que la falta de precisión ahí no es un problema real.
- [x] **Construido — Unidad 6**: Cálculo de pipeline value: `Σ (amountCents × probability / 100)` sobre Opportunities `outcome: open` — reemplaza la suma simple actual. Se muestra en el header de `/opportunities` (total ponderado del pipeline activo) y como subtotal por stage en el Kanban (`KanbanBoard.tsx`'s `renderColumnTotal`, ya existía el mecanismo genérico, solo se conectó con el cálculo ponderado). Los stages `won`/`lost` muestran el total real (no ponderado) en su subtotal — mostrar $0 en la columna Lost habría sido confuso, la probabilidad forzada ahí es un artefacto del cálculo global, no algo que deba ocultar el monto real perdido/ganado.

### 3.6 Cambio de Pipeline — incluye el gate de Company real para pipelines `account`

- [x] **Construido — Unidad 4 (2026-08-24)**: `updateOpportunity` permite reasignar `pipelineId`. Al hacerlo, resetea `stageId` al primer stage activo (`order` ascendente, `isActive: true`) del pipeline nuevo — cualquier `stageId` que venga en el mismo body se ignora en ese caso (mismo patrón "el server lo calcula" que `createOpportunity`).
- [x] **Construido — Unidad 4**: si el pipeline destino no tiene ningún stage activo, se rechaza el cambio (backend lanza error, capturado como 500 por el router genérico — no se agregó un 400 dedicado porque es un estado de configuración inválido del tenant, no un input de usuario; el caso ya está cubierto por la migración de pipelines nuevos que siempre nacen con al menos un stage).
- [x] **Resuelto 2026-08-24 — reemplaza la nota original sobre `scope`**: si el pipeline destino es `type: 'account'` y `company.isPlaceholder === true`, el cambio se bloquea hasta completar los datos reales — modal que pide los campos de `Company` (industry/website/phone/etc.) en el mismo paso; al confirmar, `Company.isPlaceholder → false` + el cambio de pipeline, en una transacción. Si ya es `isPlaceholder: false`, el cambio de pipeline no pide nada extra. Mover a un pipeline `type: 'lead'` nunca pide nada (siempre hay una Company, placeholder o no). Este es el mecanismo que usa 3.3 al cerrar un lead — no hay dos caminos separados.
- [x] **Construido — Unidad 4**: el gate también corre sobre una reasignación de `pipelineId` pura (sin `companyId` en el mismo body) — `validateOpportunityRefs` (`routes/opportunities.ts`) ahora recibe el `pipelineId` *efectivo* (`body.pipelineId || opportunity.pipelineId`) y el `companyId` existente de la Opportunity, y re-chequea el gate cuando cualquiera de los dos cambia. Antes de esta unidad solo se chequeaba en un cambio de `companyId`, dejando pasar un cambio de pipeline puro hacia `account` con una Company todavía placeholder.
- **Verificado 2026-08-24** contra staging real (tenant + pipelines + companies + opportunity de punta a punta vía HTTP, tenant descartado al final): reasignar `pipelineId` a un pipeline `account` con Company placeholder → bloqueado con 400 y la Opportunity permanece en el pipeline `lead`; reasignar `companyId` a una Company real y luego mover de pipeline → 200, `stageId` resetea al primer stage activo del pipeline destino, y queda una entrada en el historial de stage; mover a un pipeline sin stages activos → rechazado.

### 3.7 Cierre simétrico Won/Lost

- [x] **Construido — Unidad 6 (2026-08-24)**: Schema extendido, enum `CatalogKind` con `winReason` (junto a `department`/`jobTitle`/`leadSource`/`lossReason`), reusando `FieldCatalogDefinition` — mismo mecanismo que ya se usó para no crear tablas nuevas por catálogo.
- [x] **Construido — Unidad 6, bug conocido evitado**: `VALID_CATALOG_KINDS` en `src/routes/catalogs.ts` actualizado con `winReason` en el mismo commit que agregó el enum — la razón de ser de este bullet explícito en la spec.
- [x] **Construido — Unidad 6**: `Opportunity.winReasonId` — FK nullable (necesitó nombre de relación explícito en Prisma, `"OpportunityWinReason"`, porque ahora hay dos FKs de Opportunity a FieldCatalogDefinition — sin impacto de migración, es solo un rename a nivel de Prisma client), obligatoria a nivel de aplicación cuando el stage destino tiene `outcome: won` (`routes/opportunities.ts`'s `validateOpportunityRefs`, mismo patrón que `lossReasonId` con `outcome: lost`).
- [x] **Construido — Unidad 6**: Schema `Opportunity.closeNote` — texto libre, opcional, aplica a ambos outcomes (Won y Lost).
- [x] **Construido — Unidad 6**: UI — `OpportunityDetailModal.tsx` muestra "Win Reason" (cuando el stage actual es `won`) o "Loss Reason" (cuando es `lost`), más "Close Note" para ambos casos; el formulario "Add Opportunity" genérico de `OpportunitiesPage.tsx` tiene el mismo par de campos cuando el stage por defecto ya cae en won/lost.
- [x] **Decisión adicional 2026-08-24 (no estaba en la spec original, surgió durante la implementación — ver historial de la conversación)**: ni `lossReason` ni `leadSource` (los catálogos ya existentes del mismo mecanismo) tenían ninguna UI para que el tenant creara nuevas opciones — solo se leían. Replicar `winReasonId` exactamente iba a dejar a **todos** los tenants sin forma de cerrar **ningún** deal como Won (select requerido, siempre vacío). Se agregó un menú "add option" (reusando `FieldCatalogMenu.tsx`, ya usado por Company/Employee) junto a los selects de Loss Reason y Win Reason en `OpportunityDetailModal.tsx` — arregla el gap para ambos catálogos, no solo el nuevo.

### 3.8 Automatizaciones (diseño ahora, build después)

- [ ] Schema: `Pipeline.assignmentMode` — enum `'round_robin' | 'account_owner'`, nullable (null = sin auto-asignación). Configurable por Pipeline, con la posibilidad de moverse a otro nivel (tenant/Form) más adelante si hace falta — no cerrado como definitivo.
- [x] **Resuelto 2026-08-24 — quiénes rotan en el round-robin**: en vez de inferir el universo desde el rol (`owner`/`admin`/`member`), el owner/admin lo define a mano por Pipeline. Schema nuevo: `PipelineAssignmentUser` (`id`, `tenantId`, `pipelineId` FK, `userId` FK, `@@unique([pipelineId, userId])`) — join table simple, mismo patrón que `EmployeeTimeOffPolicy`. `Pipeline.lastAssignedUserId` sigue siendo el cursor, rotando solo entre los `User` listados en `PipelineAssignmentUser` para ese Pipeline (no todos los del tenant). Frontend: en `/settings` → Pipelines, un picker chico (checklist de Users del tenant) visible solo cuando `assignmentMode: 'round_robin'`. Vacío por default — si `assignmentMode` es `round_robin` y no hay ningún participante configurado, la Opportunity queda sin owner asignado (degradación prolija, mismo criterio que `mailerConfigured()` para SMTP no configurado) en vez de romper. Alejandro confirmó explícitamente: esto se mejora a futuro, la versión de esta ronda alcanza con un picker simple en Settings.
- [ ] **Ajustado 2026-08-24 (ya no se crea una Opportunity nueva, ver 3.3)** — Regla `account_owner`: al mover una Opportunity a un pipeline `type: 'account'` (3.6, ya sea por el cierre de un lead o un cambio manual de pipeline), si `company.accountOwnerId` está seteado, reasigna `Opportunity.ownerId` a ese valor. Si la Company no tiene `accountOwnerId` (es opcional), fallback a round-robin para no dejar la Opportunity sin owner.
- [ ] Schema: `Pipeline.stalledThresholdDays` — int nullable (null = recordatorio desactivado para ese pipeline).
- [ ] **Pieza de infraestructura nueva:** hoy no existe ningún job programado en el backend (todo es sincrónico dentro del request). Se necesita el primer cron real: job periódico que recorra Opportunities `outcome: open`, calcule hace cuánto no cambia de stage (última fila de `OpportunityStageHistory`), y dispare el recordatorio si supera `pipeline.stalledThresholdDays`. Marcar explícitamente como el primer trabajo de este tipo en el proyecto — no asumir que hay infraestructura reusable.
- [ ] Notificación de cambio de stage: dispara `Notification` (ver 3.9) + email al owner, de forma sincrónica en el mismo flujo que actualiza `stageId`.

### 3.9 Notificaciones in-app (versión mínima)

- [x] **Construido — Unidad 7 (2026-08-24)**: Schema — nueva entidad `Notification`: `id`, `tenantId`, `userId` (destinatario), `type` (enum `NotificationType`, arranca con `opportunity_stage_changed`, `opportunity_stalled`), `entityType` + `entityId` (genérico, mismo patrón que `CustomFieldValue`), `message` (texto ya armado al crear la fila, no calculado al leer — mismo criterio que `StatusHistoryEntry` guardando el nombre del status en vez de una FK viva, para que un rename posterior no rompa notificaciones viejas), `read` (boolean, default false), `createdAt`.
- [x] **Construido — Unidad 7**: Backend — `GET /api/notifications` (paginado, no leídas primero), `GET /api/notifications/unread-count` (separado del listado completo para que el polling del bell icon sea liviano), `PATCH /api/notifications/:id/read` (individual, con chequeo de ownership por `userId` además de `tenantId` — una notificación es de un destinatario puntual, no de todo el tenant) y `POST /api/notifications/mark-all-read`. No hay endpoint de creación expuesto — una Notification siempre nace de un evento del sistema (ver 3.8), nunca de un submit de usuario.
- [x] **Construido — Unidad 7**: Frontend — `NotificationBell.tsx` en la barra superior (`TopBar.tsx`) con contador de no leídas y dropdown con la lista, marcar individual al hacer click + botón "Mark all read". Polling liviano cada 30s (no websockets). **Nota de UX**: el ícono de campana (`BellIcon`) ya estaba usado por `ChangelogMenu.tsx` ("What's new") — se le cambió el ícono a `ChangelogMenu` (nuevo `SparklesIcon`) para liberar la campana, que es el ícono más convencional para notificaciones reales.
- **Sin productor todavía (esperado)**: nada crea filas de `Notification` en esta unidad — el disparador real (`opportunity_stage_changed` al cambiar de stage) es parte de 3.8, que se construye después. El bell icon queda funcional pero en cero hasta entonces, tal como lo anticipa el orden de build en la sección 6 ("tiene valor por sí solo apenas exista un evento que dispare..."). Verificado contra staging real sembrando filas directamente vía Prisma (simulando al futuro productor) y probando los 4 endpoints de punta a punta, incluyendo el aislamiento por destinatario (dos Users del mismo tenant, cada uno solo ve las suyas).

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
3. **isPrimary único + multi-threading indicador + soft-delete de Contact/Opportunity** (2.1, 2.2, 2.3) — ✅ completo, ver §2.
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
