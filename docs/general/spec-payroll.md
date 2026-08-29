# Payroll (Tier 3.5) — spec técnico completo (v2, reescrito desde cero)

Esta versión reemplaza cualquier implementación anterior de Payroll — se pide arrancar de cero,
no reconciliar con nada existente.

**Nota 2026-08-29**: este spec quedó completo y en producción (ver `docs/general/database-schema.md`
grupo 7). La baja de un empleado ("Employee Termination" — cierra su compensación activa, corta
acceso opcional, cancela Time Off, pago final con las mismas líneas que un `PayrollEntry` normal) es
una feature **posterior y separada**, no parte de las 21 unidades de este spec — documentada en
`docs/general/database-schema.md` grupo 11 y `docs/general/Tareas-QA.md` (QA-53). Solo en `staging`
todavía.

## Qué es y qué no es

Carga manual de pagos a personas (contractors y empleados) + registro histórico de compensación,
con un contrato liviano que la persona revisa y confirma antes de que su cuenta quede creada.
**No** hay procesamiento real de pagos (sin integración bancaria), **no** se generan documentos
legales tipo W2/W4 (el público inicial son contractors internacionales que facturan por su
cuenta), y la "firma" del contrato es una aceptación liviana con evidencia (checkbox + timestamp
+ IP), no una firma electrónica con proveedor externo. Distinto de **Payments** (cobro a
Clients/Companies — dirección opuesta del dinero).

## Proceso completo, de punta a punta

**1. Alta de persona.** El owner da de alta a alguien en el módulo **People** (rename de
"Employee", ver Unidad 4) eligiendo su categoría: `Profile` (sin contrato, no participa de
Payroll en ningún punto), `Contractor` u `Employee` (ambos requieren contrato).

**2. Contrato inicial (solo Contractor/Employee).** En la misma alta, el owner completa un
contrato: tipo de compensación, monto, moneda, frecuencia de pago, Job Title (snapshot editable,
pre-cargado desde el Job Title general de la persona), descripción, vigente desde, nota. También
completa la nacionalidad de la persona (dato de perfil, no del contrato — ver Unidad 1) y le
asigna políticas de Time Off. **No** completa el método de pago ni el país de residencia — esos
quedan para que la persona misma los cargue.

**3. Invitación.** Se envía un link a la persona. Todavía no existe un `User` en la plataforma.

**4. Confirmación del contrato (la persona).** La persona abre el link, ve el contrato en modo
lectura (lo que cargó el owner), completa lo que le falta (país de residencia, método de pago +
datos de cuenta), acepta dos checkboxes por separado (el contrato en sí, y Términos/Privacidad de
la plataforma — este segundo es un gate más amplio, no exclusivo de Payroll), y confirma.

**5. Creación de cuenta.** Recién ahí se crea el `User` y queda vinculado a la persona. Si es su
**primer** contrato en la plataforma, hasta este punto la persona no podía entrar a ningún
`PayrollRun` ni a cálculos de Time Off — quedaba bloqueada. Si ya tenía un contrato confirmado
antes y esto es una reasignación, no se bloquea mientras tanto (evita que alguien activo
desaparezca de un run por no revisar el mail a tiempo).

**6. Ejecución de pagos.** El owner corre `PayrollRun` por frecuencia (el sistema pre-carga solo
a quienes tienen esa frecuencia asignada y están habilitados), carga horas si corresponde
(hourly), agrega ajustes (bonos/comisiones/reembolsos/deducciones, mostrados como total
colapsado), revisa alertas (personas inactivas con pagos cargados, horas faltantes), y confirma —
lo que deja las entradas en firme. Alternativamente, carga **pagos únicos** fuera de cualquier
ciclo, para una o varias personas a la vez. Ambos (runs y pagos únicos) conviven en una sola línea
de tiempo.

## Convenciones que aplican a todo el spec

- **Todo formulario nace como modal centrado con backdrop — nunca panel lateral tipo
  `SlideOver`.** Esto incluye políticas de pago, métodos de pago, compensación individual, alta
  con contrato, asignación masiva, pago único.
- **Todo campo requerido lleva asterisco rojo.**
- Visibilidad de datos de compensación: **owner-only** por default, hasta que exista permisología
  custom. Excepción: cada persona puede ver su propio historial de compensación.
- Orden sugerido de ejecución: **1 → 21**, cada unidad se confirma y pushea a `staging` antes de
  pasar a la siguiente.

---

## Unidad 1 — Schema (Prisma)

- [ ] `Employee` (People) suma: `personType` (`'profile' | 'contractor' | 'employee'`),
  `nationality` (string, nullable), `countryOfResidence` (string, nullable — lo completa la
  persona en la Unidad 7, no el owner), `contractUrl` (string, nullable).
- [ ] `PayFrequencyDefinition` (tenant-level, catálogo): `id`, `tenantId`, `name`, `cadence`
  (`'weekly' | 'semimonthly' | 'monthly'`), `anchorConfig` (JSON, forma según `cadence`),
  `dueDateOffset` (`'same_day' | 'plus_2' | 'plus_5' | 'custom'`), `dueDateCustomDays` (int,
  nullable), `isActive`, `order`.

  **Forma de `anchorConfig`**:
  - `weekly` → `{ dayOfWeek: 'monday'..'sunday' }`
  - `semimonthly` → `{ preset: 'first_15' }` / `{ preset: 'fifteen_last' }` / `{ preset: 'custom',
    days: [n, m] }`
  - `monthly` → `{ preset: 'first_business_day' }` / `{ preset: 'last_business_day' }` /
    `{ preset: 'custom', day: n }`

  **Gap de alcance deliberado**: `dueDateOffset` es un número de días de calendario plano, no
  ajusta a día hábil si cae fin de semana/feriado. `anchorConfig` guarda la opción elegida, pero
  no hay job que calcule fechas reales de calendario todavía — ambos quedan en el backlog al
  final.

- [ ] `PaymentMethodDefinition` (tenant-level, catálogo chico): `id`, `tenantId`, `name`,
  `isActive`, `order`. Seed: "Wire transfer", "Payoneer", "Wise", "PayPal".

- [ ] `EmployeeCompensation` (contrato individual, versionado — no vive como campo plano en
  `Employee`): `id`, `employeeId` (FK), `compensationType` (`'hourly' | 'fixed'`), `rateCents`,
  `currency`, `payFrequencyId` (FK), `jobTitle` (string — snapshot de este contrato puntual, no
  atado al catálogo general de Job Title de People), `description` (text), `effectiveFrom`
  (date), `effectiveTo` (date, nullable — `null` = vigente), `note` (nullable),
  `paymentMethodId` (FK, nullable — lo completa la persona, no el owner),
  `paymentAccountSubType` (`'iban' | 'ach' | 'username'`, nullable — solo aplica si el método
  elegido es bancario y requiere distinguir IBAN de ACH), `paymentAccountDataEncrypted` (text,
  nullable — blob cifrado, ver Unidad 8, nunca texto plano), `confirmedAt` (datetime, nullable),
  `blocksParticipation` (boolean — `true` solo si es el primer `EmployeeCompensation` de esa
  persona en toda su historia, calculado al crear el registro), `createdByUserId`, `createdAt`.

  Constraint a nivel de servicio (no de DB): un `employeeId` no puede tener dos registros con
  `effectiveTo: null` simultáneos — al crear uno nuevo vigente, el anterior se cierra
  (`effectiveTo = effectiveFrom del nuevo - 1 día`) en la misma transacción.

- [ ] `PayrollRun`: `id`, `tenantId`, `payFrequencyId` (FK, nullable — null identifica un pago
  único/off-cycle en vez de un run masivo), `periodLabel` (string libre), `status` (`'draft' |
  'confirmed'`), `createdByUserId`, `confirmedAt` (nullable).
- [ ] `PayrollEntry`: `id`, `tenantId`, `employeeId` (FK), `runId` (FK, nullable — null = entrada
  suelta), `type` (enum fijo: `'base' | 'bonus' | 'commission' | 'reimbursement' |
  'deduction'`), `amountCents` (puede ser negativo), `currency`, `hoursQty` (decimal, nullable —
  solo si `compensationType: 'hourly'`), `label` (nota libre), `paymentDate`.
- [ ] Utilidad de cifrado (`lib/encryption.ts` o similar): funciones `encrypt`/`decrypt` usando
  AES-256-GCM del módulo `crypto` nativo de Node — no una librería externa. La clave sale de la
  variable de entorno `PAYMENT_DATA_ENCRYPTION_KEY`, nunca hardcodeada, nunca en el repo. Ver
  Unidad 8 para el detalle de uso.

---

## Unidad 2 — Catálogo de políticas de pago (backend)

- [ ] `payFrequencyService.ts`: CRUD de `PayFrequencyDefinition` (create/list/update/deactivate —
  sin delete físico, `isActive: false` en su lugar).
- [ ] Endpoint `GET /api/hr/pay-frequencies` — activas + conteo de personas asignadas
  (`EmployeeCompensation` vigente por cada una).
- [ ] Endpoint `POST /api/hr/pay-frequencies` / `PATCH /api/hr/pay-frequencies/:id` —
  owner-only.
- [ ] Seed inicial al crear un tenant: **todas** las combinaciones estándar precargadas y listas
  para usar — "Semanal", "Semi-mensual · 1 y 15", "Semi-mensual · 15 y último día", "Mensual ·
  primer día hábil", "Mensual · último día hábil" (5 políticas). El tenant solo crea algo nuevo si
  necesita una combinación custom que no esté en la lista.
- [ ] `paymentMethodService.ts`: CRUD chico de `PaymentMethodDefinition` (mismo patrón).
  Endpoints `GET`/`POST`/`PATCH` `/api/hr/payment-methods`, owner-only. Seed: Wire transfer,
  Payoneer, Wise, PayPal.

## Unidad 3 — Catálogo de políticas de pago (frontend)

- [ ] Pestaña "Políticas de pago" dentro de `/hr/payroll`. Tabla: Nombre / Cadencia / Día(s) de
  pago (renderizado legible desde `anchorConfig`) / Due date / Personas asignadas / editar.
- [ ] Modal "Nueva política" / "Editar política" (centrado, con backdrop): nombre, cadencia
  (select: Semanal / Semi-mensual / Mensual — cambia las opciones de abajo dinámicamente), y
  según la cadencia:
  - Semanal → select de día de la semana
  - Semi-mensual → radio: "1 y 15" / "15 y último día" / "Custom" (2 selects de día de mes)
  - Mensual → radio: "Primer día hábil" / "Último día hábil" / "Custom" (1 select de día de mes)
  - Due date (siempre visible): select "Mismo día" / "+2 días" / "+5 días" / "Custom" (número a
    mano)
- [ ] Sub-sección "Métodos de pago" en la misma pestaña: lista simple (Wire transfer, Payoneer,
  Wise, PayPal + los que agregue el tenant), "+ Agregar método" — solo nombre + activo/inactivo.
- [ ] Nota visible: "la asignación de política + monto por persona se hace desde la ficha de la
  persona, no acá".
- [ ] Campos requeridos con asterisco rojo.

---

## Unidad 4 — Categorías de persona y rename a "People" (cross-módulo)

**Este rename toca todo lo que hoy dice "Employee" en la plataforma — rutas, nav, componentes —
no es exclusivo de Payroll. Esta unidad es la parte que le corresponde a Payroll (el campo
`personType` y su gating), no el rediseño visual/naming entero del módulo.**

- [ ] Rename del módulo "Employee" → **"People"** en sidebar, rutas y nav (`/hr/employees` →
  `/hr/people`, etc.).
- [ ] `Employee.personType` (Unidad 1) se expone en el form de alta como el primer campo a
  elegir — define todo lo que sigue en el mismo formulario.
- [ ] `Profile`: no requiere ningún contrato, la sección de compensación ni se muestra en su
  alta. No participa de Payroll en ningún punto del flujo (no es "bloqueado", directamente no
  aplica).
- [ ] `Contractor`/`Employee`: requieren **al menos un** `EmployeeCompensation` — no se puede
  guardar el alta sin completar el contrato (Unidad 5).

---

## Unidad 5 — Alta con contrato inicial (frontend + backend, cross-módulo)

**Toca el form de alta de `Employee`/People existente.**

- [ ] El form de alta suma, en la sección de identidad/perfil (dato único, no versionado):
  **nacionalidad**. Aplica a cualquier `personType`.
- [ ] Si `personType` es `Contractor`/`Employee`, se agrega una sección de Contrato **requerida**
  dentro del mismo modal de alta (no como paso B separado, no como panel lateral): tipo de
  compensación, monto, moneda, política de pago (select del catálogo de la Unidad 3), Job Title
  (pre-cargado desde el Job Title general de la persona, editable como snapshot de este
  contrato), descripción, vigente desde (default = fecha de alta), nota. **No** incluye método de
  pago ni país de residencia — esos los completa la persona en la Unidad 7.
- [ ] Asignación de políticas de Time Off en la misma alta (funcionalidad ya existente, sin
  cambios — solo se menciona porque pasa a formar parte de este mismo submit conceptualmente).
- [ ] Al guardar: se crea `Employee`, el `EmployeeCompensation` inicial (con
  `paymentMethodId`/`paymentAccountDataEncrypted` todavía nulos), las asignaciones de Time Off, y
  se dispara la invitación (Unidad 6) — **sin crear un `User` todavía**.
- [ ] Backend: `POST /api/hr/employees` extendido para aceptar el bloque de contrato en el mismo
  payload, o como segunda llamada inmediata a `employeeCompensationService.createCompensation`
  dentro del mismo flujo del formulario (no una transacción conjunta con la creación del
  `Employee`, para no acoplar los dos servicios).
- [ ] Campos requeridos con asterisco rojo.

## Unidad 6 — Invitación (backend, cross-módulo)

- [ ] Al crear el `EmployeeCompensation` inicial de una persona `Contractor`/`Employee` sin
  `User` vinculado, se dispara la invitación existente (`Invitation`) apuntando a la pantalla de
  confirmación de contrato (Unidad 7) en vez del accept-invite genérico — es una variante
  específica para este caso, el resto de invitaciones de la plataforma (ej. `Profile`, usuarios
  internos sin compensación) siguen el flujo genérico sin cambios.

## Unidad 7 — Pantalla de confirmación de contrato (frontend + backend)

Mockup de referencia (Artifact aprobado): "Northstack — Confirmación de contrato (mockup)".

- [ ] Pantalla standalone (no requiere sesión iniciada — se accede por el link de la invitación),
  dividida en dos bloques:
  - **Solo lectura** (lo cargó el owner): Persona, Job Title, Descripción, Tipo de compensación,
    Monto, Frecuencia de pago, Vigente desde, Nacionalidad, Políticas de Time Off asignadas (si
    no tiene ninguna, se muestra `-`, no se oculta el campo).
  - **Editable** (lo completa la persona): País de residencia (select, requerido). Método de
    pago (select del catálogo de la Unidad 3, requerido) — si es "Wire transfer", aparece un
    sub-select IBAN/ACH (IBAN = un campo; ACH = routing number + account number); si es
    cualquier otra plataforma, aparece un solo campo de usuario/correo.
- [ ] Nota de evidencia visible: "al confirmar, se registra tu aceptación con fecha, hora e IP —
  este contrato queda congelado tal como lo ves acá".
- [ ] Dos checkboxes **separados**: (1) aceptación del contrato en sí, (2) aceptación de
  Términos y Condiciones + Política de Privacidad de la plataforma — este segundo depende de un
  gate genérico de plataforma que no es exclusivo de Payroll (ver nota de dependencia cruzada
  abajo). Botón de confirmar deshabilitado hasta completar país + método de pago + ambos
  checkboxes.
- [ ] Nota de candado junto a los campos de cuenta de pago: "estos datos quedan con acceso
  restringido".
- [ ] Backend: `POST /api/public/contract-confirmation/:token` (o vía el mecanismo de token que
  ya use `Invitation`) — guarda `countryOfResidence` en `Employee`, cifra y guarda los datos de
  cuenta (Unidad 8) en `EmployeeCompensation`, guarda `paymentMethodId`, setea `confirmedAt` +
  IP + timestamp, **crea el `User`** y lo vincula a `Employee.userId`.

**Dependencia cruzada, fuera del alcance de este archivo**: el gate de aceptación de Términos y
Privacidad debería aplicar a cualquier persona invitada a la plataforma, no solo a este flujo. Si
ese mecanismo genérico no existe todavía, esta unidad puede ser su primera implementación real —
construirlo de forma reusable (un componente/checkbox + registro de aceptación por `User`), no
como algo hardcodeado solo para Payroll.

## Unidad 8 — Cifrado de datos de cuenta de pago (backend)

- [ ] Los campos de cuenta (IBAN, o el par routing/account, o usuario/correo de plataforma) se
  cifran con AES-256-GCM (Unidad 1) **antes** de guardarse en
  `EmployeeCompensation.paymentAccountDataEncrypted` — nunca se persiste texto plano.
- [ ] En cualquier pantalla donde se muestre (ficha de la persona, futuro), el valor aparece
  **enmascarado por default** (ej. `•••• 4821`). Ver el valor completo es una acción explícita
  ("Ver dato completo"), y esa acción queda registrada en el Activity Log — **depende de que ese
  módulo ya esté construido** (spec aparte); si Payroll se ejecuta antes, esta unidad queda
  parcialmente bloqueada hasta que exista esa tabla (el cifrado y el guardado sí se pueden
  construir igual, el registro de auditoría del "ver completo" es lo que depende).
- [ ] La clave de cifrado vive en `PAYMENT_DATA_ENCRYPTION_KEY` (variable de entorno), nunca en
  código ni en la base. Un manejo de claves más serio (KMS, rotación) queda en el backlog.

## Unidad 9 — Bloqueo de participación (backend)

- [ ] `blocksParticipation` (Unidad 1) se calcula solo al crear el `EmployeeCompensation` — `true`
  únicamente si es el primer contrato de esa persona en toda su historia.
- [ ] Mientras `blocksParticipation: true` y `confirmedAt: null`, la persona queda excluida de:
  la pre-carga de `PayrollRun` (Unidad 12), y — **dependencia cruzada, fuera de este archivo** —
  de los cálculos de elegibilidad de Time Off (anotado como requisito explícito para cuando se
  ejecute, no como backlog pospuesto).
- [ ] Reasignar la política de pago a alguien que **ya** tenía un contrato confirmado (Unidad 10)
  no vuelve a bloquear — el cambio queda pendiente de confirmar sin sacar a la persona de
  circulación mientras tanto.

## Unidad 10 — Asignación / reasignación masiva de política de pago (backend + frontend)

Herramienta de excepción (retrofit de gente vieja sin compensación, o migración de un grupo ya
existente a una política nueva) — el camino principal para gente nueva es la Unidad 5.

- [ ] Backend: `POST /api/hr/payroll/compensation/bulk` — recibe `{employeeId,
  compensationType, rateCents, currency, jobTitle, description}` por persona + `payFrequencyId`
  y `effectiveFrom` comunes al batch. Crea un `EmployeeCompensation` por entrada (cerrando el
  vigente anterior), dispara confirmación (Unidad 6/7) para cada una — bloqueante solo si es su
  primer contrato (Unidad 9). **Nunca calcula el monto a partir del anterior** — cada monto viene
  explícito en el payload.
- [ ] Endpoint `GET /api/hr/payroll/compensation/status` — lista personas con su
  `EmployeeCompensation` vigente (o `null`) y chip de política actual.
- [ ] Frontend: vista "Asignaciones" dentro de Payroll — tabla con checkbox, chip de política
  actual o "Sin política asignada". Modal centrado "Asignar/reasignar política" (no panel
  lateral): frecuencia destino + vigencia común, tabla de revisión con monto editable por
  persona (pre-llenado con el monto anterior tal cual, sin conversión, si tenía uno — vacío si
  no). Input opcional "aplicar este monto a todas las filas seleccionadas". Campos requeridos con
  asterisco rojo.

## Unidad 11 — Indicadores de contrato y acceso en la tabla de People (frontend, cross-módulo)

- [ ] Backend: `GET /api/hr/employees` (o endpoint de soporte aparte) suma `contractStatus`
  (`'sin_compensacion' | 'confirmado' | 'pendiente' | 'vencido'` — vencido a partir de 3 días sin
  confirmar) y `lastLoginAt` (derivado del evento de login más reciente en Activity Log — depende
  de que ese módulo exista, mismo gap que la Unidad 8).
- [ ] Frontend: chip de contrato por fila (`Confirmado` verde / `Pendiente` neutro / `Vencido`
  rojo / sin chip si `personType: 'profile'` o sin compensación — no aplica). Chip de acceso
  separado: `Ingresó · [fecha]` o `Nunca ingresó` (informativo, no es alerta).

---

## Unidad 12 — Payroll Run: creación y pre-carga automática (backend)

- [ ] `payrollRunService.ts`: `createRun(payFrequencyId, periodLabel)` — trae todos los
  `Employee` (`personType` Contractor/Employee) con `EmployeeCompensation` vigente cuyo
  `payFrequencyId` matchea, **excluyendo** a quien tenga `blocksParticipation: true` y
  `confirmedAt: null` (Unidad 9). Por cada persona incluida, crea un `PayrollEntry`
  (`type: 'base'`): si `compensationType: 'fixed'`, `amountCents = rateCents` directo (sin
  conversión ni división); si `'hourly'`, `amountCents: 0` y `hoursQty: null` hasta cargarse a
  mano.
- [ ] Endpoint `POST /api/hr/payroll/runs` — owner-only.
- [ ] Endpoint `GET /api/hr/payroll/runs/:id` — el run con sus `PayrollEntry` agrupadas por
  persona (una fila base + N ajustes), más el `status` actual de cada `Employee` (para la
  Unidad 16) y si fue excluida por contrato sin confirmar (para mostrar el aviso de la Unidad
  12 en el frontend).

## Unidad 13 — Payroll Run: pantalla de creación y detalle (frontend)

- [ ] Modal "Nuevo run" (centrado): select de frecuencia (catálogo de la Unidad 3), campo de
  período (texto libre, ej. "2da quincena · agosto 2026").
- [ ] Pantalla de detalle: una fila por persona (status dot, nombre, badge de compensación, base
  del período, ajustes colapsados como total, total, acciones). Aviso si hubo personas excluidas
  por contrato sin confirmar ("N personas excluidas por contrato sin confirmar").
- [ ] Base del período: read-only si `fixed` (viene directo de `rateCents`), input de horas si
  `hourly` (con la fórmula "hs × tarifa" visible al lado).
- [ ] Botón "+ Agregar persona a este run" (excepción manual), habilitado solo mientras el run
  esté en `draft`.

## Unidad 14 — Ajustes dentro de un run (backend + frontend)

- [ ] Backend: `POST /api/hr/payroll/entries` (bono/comisión/reembolso/deducción asociado a
  `runId` + `employeeId`), `DELETE /api/hr/payroll/entries/:id` (solo si el run sigue en
  `draft`).
- [ ] Frontend: el botón de ajustes en cada fila muestra solo el **total** (+/− monto), no la
  cantidad de líneas — al clickear expande el detalle editable (tipo, monto, nota, eliminar) +
  "agregar ajuste".

## Unidad 15 — Carga de horas para hourly (backend + frontend)

- [ ] Backend: al confirmar el run, si hay algún `PayrollEntry type: 'base'` con
  `compensationType: 'hourly'` y `hoursQty: null`, bloquea la confirmación con un error
  específico.
- [ ] Frontend: input de horas editable en la fila, recalcula el total de esa fila al cambiar.

## Unidad 16 — Alerta de empleado inactivo (backend + frontend)

- [ ] Backend: `GET /api/hr/payroll/runs/:id` (Unidad 12) incluye el `status` de cada `Employee`.
- [ ] Frontend: fila con status dot rojo + banner de advertencia debajo si el `Employee.status`
  no es el status "activo" del catálogo del tenant. **No bloquea la confirmación** en V1 — es
  advertencia visual (ver backlog para bloqueo duro).

## Unidad 17 — Confirmar run (backend + frontend)

- [ ] Backend: `POST /api/hr/payroll/runs/:id/confirm` — valida horas cargadas (Unidad 15),
  transición `draft → confirmed`, `confirmedAt` seteado, bloquea edición/borrado de
  `PayrollEntry` asociadas.
- [ ] Frontend: botón "Confirmar run" deshabilitado si hay horas sin cargar, con tooltip.

---

## Unidad 18 — Pagos únicos / off-cycle (backend + frontend)

- [ ] Backend: `POST /api/hr/payroll/off-payments` — lista de `employeeId` + tipo + monto (por
  persona) → crea un `PayrollEntry` independiente por cada uno, `runId: null`, `paymentDate`
  explícito.
- [ ] Frontend: modal "+ Pago único" (centrado) — selector de personas (checklist), tipo, monto.
  Cada persona marcada genera su propio `PayrollEntry`, sin agruparlas en una entidad
  contenedora. Campos requeridos con asterisco rojo.

## Unidad 19 — Línea de tiempo unificada (frontend)

- [ ] Pestaña principal de Payroll: una sola lista cronológica mezclando `PayrollRun`
  confirmados/en borrador y `PayrollEntry` sueltas, cada una con un chip "Run" / "Pago único".
  Ordenados por fecha (`confirmedAt` del run, o `paymentDate` del pago suelto).

## Unidad 20 — Payslip PDF (preview, backend + frontend)

- [ ] Backend: endpoint que arma un PDF simple a partir de un `PayrollEntry` (o el set de
  entries de una persona en un run) — nombre, período, breakdown, total. Sin numeración legal,
  sin firma, sin compliance de ningún país — vista previa descargable, marcada explícitamente
  como tal.
- [ ] Frontend: ícono de payslip en cada fila del run → modal de preview, marcado "Vista previa,
  no enviado", botón de descarga.

## Unidad 21 — Sidebar y ruta

- [ ] Entrada "Payroll" en el sidebar, grupo "HR" (junto a People y Time Off), ruta
  `/hr/payroll`. Owner-only a nivel de ítem de navegación, no solo a nivel de endpoint.

---

## Backlog — explícitamente fuera de esta ronda

- [ ] **Métricas de Payroll** (costo por mes/departamento/tipo, tendencia).
- [ ] **Cálculo automático de fecha de pago** a partir de `anchorConfig` + job/cron que dispare
  runs solo — hoy es 100% manual (el owner abre "Nuevo run" cuando corresponde).
- [ ] **Ajuste de `dueDateOffset` a día hábil** si cae fin de semana/feriado.
- [ ] **Bloqueo duro de confirmación de run si hay alguien inactivo con pagos cargados** — V1
  solo advierte visualmente (Unidad 16).
- [ ] **Permisología custom sobre Payroll** — depende del rediseño de roles/permisos general del
  producto.
- [ ] **Manejo de claves de cifrado más serio** (KMS, rotación automática) — V1 usa una clave
  simétrica en variable de entorno.
- [ ] **Vista dedicada de historial de `EmployeeCompensation`** con filtros/exportación — la
  ficha de la persona muestra el historial básico, algo más elaborado queda para un caso de uso
  real.
- [ ] **Gate genérico de Términos/Privacidad para toda la plataforma** — si la Unidad 7 termina
  siendo su primera implementación real, evaluar más adelante si necesita evolucionar (ej.
  re-aceptación cuando cambian los términos, versión de términos aceptada).
