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

- [ ] A1 Schema + cifrado + plan + permiso — inicio 2026-10-30
- [ ] A2 Backend CRUD
- [ ] A3 Cobros automáticos
- [ ] A4 Importación CSV
- [ ] A5 Frontend hub y pantallas
- [ ] A6 Asistente de importación
- [ ] A7 Dashboards → Gastos
- [ ] A8 Cierre Gastos
- [ ] B1 … B7 Formularios y encuestas
- [ ] C1 … C10 Clientes
- [ ] D1 … D4 Cruces

**Necesita de Alejandro antes de probar Gastos en staging:** la variable `EXPENSES_DATA_ENCRYPTION_KEY` (64 caracteres hex) cargada en Vercel → Preview (staging). Para producción, otra clave distinta, al promover.
