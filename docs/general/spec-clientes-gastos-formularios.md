# Spec — Clientes (ciclo de vida + postventa), Gastos y Formularios y encuestas

**Estado:** spec aprobada por diseño (prototipo interactivo, 3 tableros) — build en curso en la rama `feat/crm-gastos-forms` (worktree `C:/tmp/ns-crm`, basada en `origin/staging`).
**Fecha:** 2026-10-30.
**Prototipo:** https://claude.ai/artifact/G8EuTsomC58qKWJEyV9ucM (Clientes · Gastos · Formularios y encuestas). Es la referencia visual y funcional: colores, estructura y comportamiento se respetan tal cual, adaptados a los componentes reales de la app (TableBody, sidebar hub, modales, design-system.md).
**Ejecución:** cada unidad = build → `npm run build` + `npm test` → verificación real contra staging con un tenant `Test-<nombre>` → commit → push **solo** a `staging` (`git push origin feat/crm-gastos-forms:staging`). Nada pasa a `main` sin la revisión de Alejandro en staging.

---

## 0. Reglas que aplican a todo (standing rules)

- **Growth-only:** cada módulo nuevo entra como flag nuevo en `PLAN_LIMITS` con `starter: false` / `growth: true`, en `OVERRIDABLE_MODULES`, en `planFeatures()` y en el AgreementTab del Admin. La fila en PlansComparison / landing / guía se agrega recién cuando esté en producción.
- **Bilingüe EN/ES desde el primer commit.** Nunca se traduce lo que escribe el usuario.
- **Toda lista usa `TableBody`** (encabezado siempre visible, fila vacía, "+ Add" abajo; FAB en mobile).
- **Toda métrica/dashboard** tiene selector de período (7/15/30/60/90 días/Total) y filtro por departamento, en la query y en la UI.
- **Números y montos** con el formato del país de la empresa (AR `125.000,00` / US `125,000.00`).
- **Dark mode:** cada acento violeta lleva su `dark:` (`#a98bff`).
- **Emails** siempre por `dispatchMail` + `emailLayout.ts`.
- **Schema en staging:** `prisma migrate diff` primero; si muestra DROPs ajenos, se aplica solo el SQL propio con `prisma db execute` dentro de BEGIN/COMMIT. Nunca `db push` a ciegas. Backend local siempre con `DATABASE_URL` de staging inline.
- **Help Center** (`/guide` + `/help`) se actualiza al final de cada módulo.

---

## 1. Orden de construcción

| Fase | Módulo | Por qué en este orden |
|---|---|---|
| A | **Gastos** | Módulo nuevo, sin dependencias, prototipo más detallado. Sirve también de base para la proyección de caja y la rentabilidad (fase D). |
| B | **Formularios y encuestas** | Evoluciona el `Form` existente (hoy detrás de `PUBLIC_FORMS_ENABLED`). La acción "crea un ticket" se habilita cuando exista el ticket de la fase C. |
| C | **Clientes** | El más grande y el que más toca código existente (Pipelines, Opportunities, Companies). |
| D | **Cruces** | Rentabilidad por cliente, proyección de caja, presupuestos desde catálogo, extras de Gastos. Necesitan A + C. |

---

## 2. Fase A — Gastos

**Decisiones de diseño (confirmadas por Alejandro, 2026-10-27/28):**
- Nombre del módulo: **Gastos** (EN: *Expenses*). Va en el sidebar como grupo propio **Finanzas → Gastos**, con hub tipo Settings (Resumen, Movimientos, Gastos fijos, Cuentas, Importar CSV). El dashboard va en **Dashboards → Gastos**.
- **Todo cifrado, montos incluidos** (AES-256-GCM, clave propia del módulo: `EXPENSES_DATA_ENCRYPTION_KEY`, separada de la de Payroll). Consecuencia técnica: las sumas no se hacen en SQL, se descifra y se agrega en la app (volúmenes de pyme, es viable). Lo único en claro: ids, fechas, cuenta, categoría, departamento, dirección (débito/crédito), tipo (gasto/acreditación/interna) y flags — necesarios para filtrar por período/departamento sin descifrar todo.
- **El CSV nunca se guarda.** Se parsea en el navegador; al confirmar solo viajan las filas ya normalizadas.
- **Signo del CSV por cuenta:** 4 convenciones (`neg_debit` "el − es gasto", `neg_credit` "el − es pago/acreditación", `cols` columnas Débito/Crédito, `type_col` columna D/C). Autodetección con motivo explicado + corrección por fila. Se guarda **monto positivo + dirección**.
- **Pago de tarjeta = transferencia interna** (no se cuenta dos veces). **Duplicados:** misma cuenta, mismo monto, ±3 días. **Cuotas** (`03/12`) se leen y se muestran. **Reglas de categoría** aprendidas de las correcciones.
- **Gastos fijos con forma de pago** (corrección de Alejandro 2026-10-28):
  - **Débito automático / Tarjeta:** tienen fecha de cobro; ese día se registra **solo** un movimiento *estimado*. Al importar el CSV, el movimiento real lo **confirma** (±15% de monto, ±5 días) y reemplaza el monto estimado — no se duplica. Nunca piden "marcar pagado".
  - **Pago manual:** botón "Marcar pagado" + aviso de vencido; también se concilia con el CSV (±2% de monto).
- **Permiso:** nuevo permiso de rol `expenses` (ver/gestionar). Por defecto solo el dueño. El soporte de Northstack y el Activity Log nunca muestran montos ni descripciones.

### Unidades

| # | Unidad | Contenido | Est. |
|---|---|---|---|
| A1 | Schema + cifrado + plan + permiso | Modelos `ExpenseAccount`, `ExpenseMovement`, `FixedExpense`, `ExpenseCategory`, `ExpenseCategoryRule`; `src/lib/expenseEncryption.ts` (clave propia, mismo formato iv+tag+ciphertext); flag `expensesEnabled` Growth-only + overrides; permiso `expenses` en Custom Roles; Activity Log sin montos. | 2-3 h |
| A2 | Backend CRUD | Rutas `/api/expenses/*`: cuentas (con perfil de importación), movimientos (alta manual, editar categoría → crea regla), fijos (alta/edición/baja, marcar pagado), categorías. Tests de aislamiento de tenant y de permiso. | 3 h |
| A3 | Cobros automáticos | Job diario (mismo mecanismo que los demás crons) que crea el movimiento *estimado* de los fijos auto/tarjeta en su día de cobro, idempotente por (fijo, mes). | 1-2 h |
| A4 | Importación CSV | Lógica de parseo compartida (formato AR/US, paréntesis, menos al final, fechas dmy/mdy/ymd, cuotas) con tests; endpoint `POST /api/expenses/import` que recibe filas normalizadas y aplica: duplicados, internas, confirmación de estimados, conciliación de manuales, reglas de categoría; guarda el perfil de la cuenta. | 4 h |
| A5 | Frontend: hub + Resumen + Movimientos + Fijos + Cuentas | Sidebar Finanzas → Gastos, hub con sub-navegación, las 4 pantallas como en el prototipo (TableBody, pills de estado, "Se cobra solo", formato por país), EN/ES. | 5-6 h |
| A6 | Frontend: asistente de importación | 4 pasos (Archivo · Columnas · Signo y revisión · Confirmar), vista previa con invertir signo / omitir / importar igual, aviso de cobros confirmados. | 4 h |
| A7 | Dashboards → Gastos | Servicio de métricas (descifra y agrega) con período + departamento; tarjetas, por categoría, dónde más se gasta, últimos 6 meses. | 2-3 h |
| A8 | Cierre | Política de privacidad (sección Gastos, fecha visible EN/ES), Help Center, docs, borrador del anuncio "Novedades". | 2 h |

---

## 3. Fase B — Formularios y encuestas

**Decisiones (Alejandro, 2026-10-30):**
- **Área propia** en el sidebar (no dentro de Clientes): *Formularios y encuestas* → Todos / Respuestas. Dashboard en **Dashboards → Encuestas**.
- Se **evoluciona el modelo `Form` existente** (tabla `PublicForm`), no se crea uno paralelo. El feature flag `PUBLIC_FORMS_ENABLED` se reemplaza por el flag de plan `formsEnabled` (Growth-only) al terminar la fase.
- **Cada formulario/encuesta se conecta a un módulo** y cada pregunta se mapea a un campo de ese módulo (incluidos campos personalizados):
  - Formularios: **Leads** (crea lead) · **Clientes** (actualiza el contacto que responde / agrega contacto a la empresa) · **Empleados** (actualiza el legajo / lo guarda en el legajo) · **Soporte** (crea ticket — se habilita con C7) · **Proyectos** (crea tarea) · **Ninguno** (solo guarda).
  - Encuestas: **Clientes** (onboarding terminado, ticket cerrado, cada 90 días, manual; suma al health score) · **Empleados** (trimestral, 30 días del ingreso, baja; anónima con mínimo 3 respuestas por departamento) · **Leads** (oportunidad perdida → motivos de pérdida).
- **Link público** (Leads, Soporte, Ninguno): URL fija `forms.joinnorthstack.com/<empresa>/<formulario>` (o la ruta equivalente del dominio de la app), botón Copiar, **3 formas de embeber** con un solo `embed.js` (dentro de la página con alto automático / botón flotante / ventana al hacer clic), **dominios permitidos**, mensaje de gracias o redirección, logo y color de la empresa, UTM → origen del lead, anti-spam (honeypot + límite por IP + tiempo mínimo de llenado). En borrador el link no responde.
- **Link personal** (Clientes, Empleados, encuestas): token firmado por destinatario; Northstack ya sabe quién responde. Máximo una vez cada 60 días por persona y encuesta.
- **Respuestas:** guardadas cifradas, vinculadas al registro (lead, ficha 360, legajo, ticket, tarea). Clic en una respuesta → **modal con todas las preguntas y respuestas**, a qué campo se copió cada una y botón al registro vinculado.

### Unidades

| # | Unidad | Est. |
|---|---|---|
| B1 | Schema: `Form` + `kind` (form/survey), `module`, `action`, `fields` v2 (tipo, opciones, obligatorio, mapeo), `status` (draft/published), `embedSettings`, `allowedDomains`, `afterSubmit`, trigger/audience/anon/health para encuestas; `FormResponse` (respuestas cifradas, entidad vinculada); `FormInvite` (token personal). Migración de los forms existentes. | 3 h |
| B2 | Backend builder + acciones por módulo (lead, contacto, legajo, tarea, guardar) con mapeo validado contra el tenant (sigue la defensa de custom fields del audit 2026-09-10). | 4 h |
| B3 | Página pública + `embed.js` (3 estilos) + dominios permitidos (CSP `frame-ancestors` por formulario) + anti-spam + UTM. **Revisión de seguridad propia.** | 4 h |
| B4 | Links personales + disparadores de encuestas + envío por email + límite de 60 días. | 3 h |
| B5 | Frontend: lista con filtros (tipo, módulo), editor (módulo, acción, preguntas y mapeo, vista previa), sección URL/código, Respuestas + modal. | 6 h |
| B6 | Dashboards → Encuestas (NPS, CSAT, eNPS con umbral de anonimato, leads por formularios, respuestas por módulo). | 2 h |
| B7 | Cierre: flag de plan, privacidad (datos de terceros vía formularios), Help Center, docs. | 2 h |

---

## 4. Fase C — Clientes

**Decisiones:**
- **Las pipelines siguen 100% customizables** (crear, renombrar, etapas, probabilidades, como hoy). Las tres del diseño (Nuevo negocio, Expansión, Renovaciones) son **plantillas** que se ofrecen, editables y borrables. Se suma a cada pipeline un **propósito** (`new_business` / `expansion` / `renewal` / `other`) que le dice a los dashboards dónde contar; y a cada etapa, **checklist de salida** y **automatizaciones al entrar**, ambos opcionales y editables.
- Recorrido de 7 etapas (Cold lead → Contactado → Calificado → Oportunidad → Onboarding → Cliente activo → Expansión) como vista de referencia.
- **Bandeja de Leads** separada de las pipelines: cadencia de 5 toques, score, calificación de 4 preguntas (necesidad, presupuesto, decisor, momento); con 3/4 se habilita **Convertir** → crea Company + Contact + Opportunity juntos (elimina el hack `Company.isPlaceholder`).
- **Ganada → handoff:** responsable de cuenta (CSM), plantilla de onboarding → proyecto, kickoff en Calendar, mail de bienvenida.
- **Ficha 360** de la empresa: línea de tiempo, productos (y white-space de upsell), onboarding, salud, tickets, facturación.
- **Postventa:** health score (desglose), check-ins, **tickets de clientes con SLA** (modelo nuevo — el `Ticket` actual es el de soporte de Northstack, no se toca), señales de upsell.
- **Catálogo de productos** por tenant.
- Dashboards **Ventas** y **Clientes** dentro de Dashboards (período + departamento).

### Unidades

| # | Unidad | Est. |
|---|---|---|
| C1 | Pipeline: propósito + plantillas + checklist de salida y automatizaciones por etapa (editor en Settings → Pipelines), alerta de estancada. | 4 h |
| C2 | Bandeja de Leads: cadencia, score, calificación, Convertir; los formularios de Leads caen acá. | 5 h |
| C3 | Handoff de Ganada: CSM, plantilla de onboarding → proyecto, kickoff, bienvenida. | 3 h |
| C4 | Catálogo de productos + productos por cuenta. | 3 h |
| C5 | Ficha 360 (Company): pestañas línea de tiempo / productos / onboarding / salud / tickets / facturación. | 5 h |
| C6 | Health score + check-ins. | 3 h |
| C7 | Tickets de clientes con SLA (+ habilita la acción "Soporte" de formularios). | 4 h |
| C8 | Señales de upsell + Expansión/Renovaciones. | 3 h |
| C9 | Dashboards → Ventas (rediseño) + Dashboards → Clientes. | 4 h |
| C10 | Cierre: Help Center, docs, privacidad si aplica. | 2 h |

---

## 5. Fase D — Cruces (aprobadas 2026-10-30)

| # | Unidad |
|---|---|
| D1 | **Rentabilidad por cliente:** ingresos (Payments / Mercado Pago) − horas de Timesheet × costo hora de Payroll − gastos asignados al cliente. En la ficha 360 y en Dashboards. |
| D2 | **Proyección de caja a 90 días:** fijos con fecha de cobro + cobros esperados (renovaciones, facturas abiertas, cuotas), alerta de semana negativa. |
| D3 | **Presupuestos desde el catálogo:** PDF + link de aceptación online → la oportunidad pasa a Ganada y dispara el handoff. |
| D4 | **Extras de Gastos:** presupuesto por categoría (alertas 80/100%), detección de suscripciones → sugerir fijo, alerta de aumento de un fijo, ARS/USD con tipo de cambio del resumen, comprobante adjunto cifrado. |

---

## 6. Checklist de ejecución

Inicio y fin reales se registran al cerrar cada unidad.

- [x] A1 Schema + cifrado + plan + permiso — 2026-10-30 17:15 → 17:39 (bc28588)
- [x] A2 Backend CRUD — 2026-11-01 ≈17:50 → 18:10
- [x] A3 Cobros automáticos — 2026-11-01, junto con A2 (cron diario 13:00 UTC + corrida perezosa al abrir Gastos, idempotente)
- [x] A4 Importación CSV — 2026-11-02 ≈09:25 → 09:35 (parser en el navegador `frontend/src/lib/expenseCsv.ts`; `POST /api/expenses/import/preview` + `/import` con el mismo plan: duplicados, internas, confirma estimados, concilia manuales, reglas, perfil de la cuenta)
- [x] A5 Frontend hub y pantallas — 2026-11-01 ≈18:10 → 18:20 (se adelantó a A4 para verlo en vivo; "Importar CSV" se habilitó con A4/A6)
- [x] A6 Asistente de importación — 2026-11-02 ≈09:35 → 09:42 (`/expenses/import`, 4 pasos; también desde Movimientos y desde cada cuenta)
- [x] A7 Dashboards → Gastos — 2026-11-02 ≈09:40 → 09:44 (`GET /api/expenses/dashboard`; período del filtro de Dashboards + filtro de departamento; por mes fijos/variables, categoría, departamento, dónde más se gasta)
- [ ] A8 Cierre Gastos
- [x] B1 Schema — 2026-11-02 ≈09:45 → 09:55 (Form + kind/module/action/fields v2/status/allowedDomains/afterSubmit/embedSettings/surveySettings, entityType opcional; FormResponse cifrada con `FORMS_DATA_ENCRYPTION_KEY`; FormInvite con hash del token; flag `formsEnabled` Growth + override Admin; los forms existentes migran a module/action según su entityType. Aplicado a la DB de staging con migrate diff + db execute; **en producción hay que correr el mismo SQL al promover**. Gestión con el permiso existente `manage_custom_fields`, el mismo que usan hoy los formularios públicos)
- [x] B2 Backend builder + acciones — 2026-11-02 ≈09:58 → 10:15 (`/api/forms` CRUD + meta + respuestas; acciones crear lead (+oportunidad, UTM → origen), actualizar contacto, agregar contacto a su empresa, actualizar legajo, guardar en legajo, crear tarea de proyecto, solo guardar; ticket espera C7; mapeo validado contra el tenant; columna nueva `actionConfig` → `docs/general/sql-forms-b2-2026-11-02.sql`)
- [x] B5 Frontend — 2026-11-02 ≈10:20 → 10:45 (se adelantó a B3/B4 para verlo en vivo; área propia `/forms` con sidebar Todos / Respuestas; lista con filtros tipo + módulo; editor con módulo, acción, pipeline / proyecto+responsable, encuesta (métrica, disparador, health, anónima), preguntas con "va a" y vista previa; Respuestas con KPI NPS/CSAT y modal con preguntas, a qué campo se copió y botón al registro; EN/ES. La tarjeta de link/embed y el envío personal se completan con B3/B4)
- [x] B3 Página pública + embed.js — 2026-11-02 ≈10:50 → 11:20 (`/f/<empresa>/<formulario>` renderizada en el servidor con CSP propia; `/f/embed.js` con 3 estilos; `POST /api/public/forms/...`; dominios permitidos; mensaje o redirección; UTM → origen del lead; aviso por mail a dueño/admins por cada lead nuevo; tarjeta "Link y código" en el editor)
- [x] B4 Links personales — 2026-11-02 ≈11:25 → 11:50 (`/f/p/<token>`: se guarda solo el hash, vence a los 30 días, una respuesta, nunca embebible; mail con la plantilla y categoría de preferencias "surveys"; tarjeta "Cómo llega" con buscador, regla de 60 días por persona y formulario, historial; cron diario 14:00 UTC `/api/internal/forms/survey-triggers/run` para trimestral, 30 días del ingreso, baja, cada 90 días (contacto principal) y oportunidad perdida. "Al terminar onboarding" y "al cerrar ticket" esperan C3/C7)
- [x] B6 Dashboards → Encuestas — 2026-11-02 ≈11:55 → 12:10 (`GET /api/forms/dashboard`, solo puntajes en claro, nada se descifra; NPS clientes con distribución y por mes, CSAT, eNPS con umbral de anonimato por encuesta (mín. 3) **y regla de la diferencia**: si los departamentos ocultos suman menos que el umbral, ningún departamento muestra su eNPS; leads por formularios por origen (UTM / web / link directo); respuestas por módulo; período compartido de Dashboards + filtro de departamento para eNPS)
- [~] B7 Cierre — 2026-11-02: **se retiró la pantalla vieja** (decisión de Alejandro: "eliminala, no van a ser necesarios"): Configuración → Formularios públicos, la página `/apply`, `/api/public-forms`, `/api/public/:empresa/:formulario(/submit)`, `publicFormService.ts`, el flag `PUBLIC_FORMS_ENABLED` / `VITE_PUBLIC_FORMS_ENABLED` y el mail de confirmación viejo. `/settings/public-forms` redirige a `/forms`; Formularios y encuestas queda solo detrás del flag de plan `formsEnabled`. Se corrigió además el CORS: `/api/public/forms/*` y `/api/public/invites/*` quedan fuera de la excepción abierta. **Textos legales, ayuda y anuncio: al final de todo el proyecto** (decisión 2026-11-02).

### Revisión de seguridad B3 (2026-11-02)

| Riesgo | Mitigación | Verificado |
|---|---|---|
| XSS con textos de la empresa (nombre, preguntas, opciones, UTM) | Todo pasa por `escapeHtml`; la config del script va como JSON con `<`, U+2028/2029 escapados; CSP `script-src`/`style-src` solo con nonce, sin `unsafe-inline` | tests/publicFormPage.test.ts |
| Clickjacking / formulario copiado en otro sitio | `frame-ancestors` por formulario con los dominios permitidos (solo hostnames, saneados → no hay inyección en la CSP); vacío = cualquier sitio https (decisión del prototipo) | tests/formsPublicRoute.test.ts |
| Spam / bots | Honeypot (responde "ok" sin guardar), sello firmado HMAC de render (mínimo 3 s, máximo 24 h, atado al formulario), límite 10 envíos / 10 min por IP (Upstash) | tests/formsPublicRoute.test.ts |
| Escritura de datos desde internet | Solo formularios publicados, del editor nuevo y con acción pública (crear lead / tarea / solo guardar); se escriben solo los campos mapeados; un contacto existente se vincula sin pisarlo; respuestas cifradas | tests/formResponseService.test.ts |
| Redirección abierta | La URL de destino la configura la empresa y debe ser `https://`; embed.js solo sigue `https://` | código + test de embed.js |
| Mensajes del iframe falsificados | embed.js solo acepta mensajes del origen de Northstack, del iframe propio y del formulario propio | test de embed.js |
| Lectura cruzada de respuestas | `/api/public/forms/*` e `/api/public/invites/*` quedan fuera de la excepción CORS abierta de `/api/public/*` (corregido en B7: al principio estaban dentro); los datos devueltos son solo el mensaje de gracias o la URL | src/app.ts |
| Pendiente conocido | Un bot que carga la página una vez puede reusar el sello 24 h; lo frena el límite por IP. Si aparece spam real, sumar Turnstile (ya existe `src/lib/turnstile.ts`) | — |
- [x] C1 Pipelines: propósito + plantillas + checklist + automatizaciones — 2026-11-02 (`Pipeline.purpose`, `PipelineStageDefinition.exitChecklist/enterAutomations`, `Opportunity.checklistState` → `docs/general/sql-clientes-c1-2026-11-02.sql`; las pipelines "account" existentes quedan como "otro". Checklist: solo bloquea avanzar (etapa posterior o Ganada), nunca volver ni Perdida; 409 `checklist_incomplete` con los ítems faltantes, también en la API privada. Automatizaciones al entrar: crear tarea al responsable, enviar encuesta a los contactos (regla de 60 días). Plantillas Nuevo negocio / Expansión / Renovaciones en el idioma de la persona. El aviso de estancada ya existía (`stalledThresholdDays` + cron) y las plantillas lo traen configurado)
- [x] C2 Bandeja de Leads — 2026-11-02 (modelo propio `Lead` + `LeadTouch` → `docs/general/sql-clientes-c2-2026-11-02.sql`; flag de plan `clientsEnabled` (Growth) para toda la fase C; `/leads` en Ventas: abiertos / convertidos / descalificados, ordenados por próximo toque; cadencia 5 toques (días 0, 2, 5, 9, 14); calificación de 4 preguntas; score 0-100 (20 por "sí", +10 si respondió, +10 si llegó solo); **Convertir** con 3/4 crea empresa + contacto (reusa el del mismo mail) + oportunidad; descalificar con motivo / reabrir. Los formularios de Leads caen en la bandeja cuando la empresa tiene Clientes; si no, siguen creando contacto + oportunidad. El hack `Company.isPlaceholder` del alta manual de oportunidades **sigue existiendo**: la bandeja ya no lo usa, quitarlo del alta manual queda para cuando se rediseñe esa pantalla (C9))
- [x] C3 Traspaso de Ganada — 2026-11-02 (`Opportunity.handoffAt/handoffProjectId` → `docs/general/sql-clientes-c3-2026-11-02.sql`; panel "Traspaso" en la oportunidad ganada: responsable de cuenta (`Company.accountOwnerId`), proyecto de onboarding desde plantilla (dueño = empleado del responsable, respeta el límite de proyectos), kickoff como tarea con videollamada (se agenda en Google Calendar si está conectado e invita al contacto), mail de bienvenida al contacto con reply-to al responsable. Una vez por oportunidad. Habilita la encuesta automática "al terminar el onboarding": proyecto de traspaso completado → contactos de la oportunidad)
- [x] C4 Catálogo de productos — 2026-11-02 (`Product` + `CompanyProduct` → `docs/general/sql-clientes-c4-2026-11-02.sql`; Configuración → Productos (permiso de pipelines, Growth); pestaña Productos en la ficha de la empresa: lo que tiene, ingreso mensual recurrente por moneda (anual ÷ 12, pago único no suma), dar de baja / reactivar, y "lo que todavía no tiene" (white space) para sumar con un clic. Las pestañas de la ficha quedaron genéricas para C5)
- [x] C5 Ficha 360 — 2026-11-02 (pestañas en la ficha de la empresa: **Línea de tiempo** — oportunidades y sus movimientos (solo para quien ve oportunidades), traspaso, lead convertido, productos, notas, tareas terminadas, encuestas respondidas con su puntaje (nunca las respuestas); **Productos** (C4); **Onboarding** — proyectos de la empresa con avance por tareas, el del traspaso primero; **Pagos** — la de Stripe que ya existía. Salud y Tickets se suman con C6/C7)
- [x] C6 Health score + check-ins — 2026-11-02 (`CompanyCheckIn` → `docs/general/sql-clientes-c6-2026-11-02.sql`; score 0-100 calculado al vuelo (no se guarda) con 5 partes explicadas: satisfacción 30 % (NPS/CSAT 180 días de encuestas que suman a la salud), contacto 25 % (último check-in / nota / reunión + cómo salió el check-in), onboarding 15 %, productos 15 % (bajas de 90 días restan), soporte 15 % (tickets, se conecta en C7); sin datos = 70 para no marcar en rojo a un cliente nuevo; Saludable ≥70 / En riesgo ≥40 / Crítico. Pestaña Salud con desglose, registrar check-in (bien/regular/mal) y próximo check-in sugerido a 30/21/7 días)
- [x] C7 Tickets de clientes con SLA — 2026-11-02 (`ClientTicket` + `ClientTicketComment` → `docs/general/sql-clientes-c7-2026-11-02.sql`; modelo nuevo, el `Ticket` de soporte de Northstack no se tocó; `/tickets` en Ventas y pestaña Tickets en la ficha; numerados por empresa; SLA por prioridad en horas corridas (urgente 1/8, alta 4/24, normal 8/72, baja 24/120); la primera respuesta no interna cumple el SLA de respuesta; resolver/cerrar marca la hora y reabrir la limpia; cambiar la prioridad recalcula el SLA. Habilita: la acción "crea un ticket" de los formularios de Soporte (si el mail es de un contacto, cae en su empresa), el disparador de encuesta "al cerrar un ticket" y la parte de soporte del health score. **Pendiente:** responder al cliente por mail desde el ticket)
- [x] C8 Señales de upsell + Expansión/Renovaciones — 2026-11-02 (sin tablas nuevas: se calculan al vuelo; `/signals` "Expansión y renovaciones" en Ventas: **expansión** = cliente sano o promotor con productos que no tiene; **renovación** = producto que renueva en ≤90 días; **en riesgo** = salud crítica o detractor reciente (si además renueva, la renovación sale como riesgo). Un clic crea la oportunidad en la primera pipeline activa con propósito Expansión / Renovaciones (con los productos y su monto, responsable = el de la cuenta); si no hay, pide crearla desde plantilla. No se repite mientras haya una oportunidad abierta del mismo tipo)
- [ ] C9 … C10 Clientes
- [ ] D1 … D4 Cruces

**Necesita de Alejandro antes de probar Gastos en staging:** la variable `EXPENSES_DATA_ENCRYPTION_KEY` (64 caracteres hex) cargada en Vercel → Preview (staging). Para producción, otra clave distinta, al promover.
