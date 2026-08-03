# Tareas de QA

- Fecha de creación: 2026-07-23
- Separado de `docs/tareas-desarrollo.md` (que es el backlog de desarrollo) para que un QA tenga
  su propio archivo, enfocado en verificación en vez de implementación. Cada tarea acá está escrita
  para ejecutarse sin contexto conversacional previo — quien la tome no participó de la discusión
  donde se originó.

---

## QA-01 — Regresión de aislamiento entre tenants (multi-tenant isolation)

**Por qué existe esta tarea:** el 2026-07-21 se encontró y corrigió una vulnerabilidad real
(mass assignment/IDOR) en `PATCH /api/hr/employees/:id` y `PATCH /api/clients/:id` — un usuario
autenticado de un tenant podía reasignar su propio empleado/cliente a otro tenant mandando
`tenantId` en el body del request. El fix (whitelist explícita de campos) ya está en producción,
pero **no existe ningún test, manual ni automatizado, que verifique que esto sigue así** a medida
que se agregan endpoints nuevos. El objetivo de esta tarea es cerrar ese hueco: un procedimiento
repetible que confirme que ningún endpoint de escritura permite que el Tenant A toque datos del
Tenant B, corriendo antes de cada release y cada vez que se agregue un módulo nuevo (Payroll,
Clients rediseñado, etc.).

### Setup (una sola vez, reusable en cada corrida)

1. Registrar 2 tenants de prueba reales contra el entorno a testear (local o staging si existe):
   - **Tenant A** (`qa-tenant-a@example.com` o similar) — owner + al menos 1 Employee adicional +
     1 Client + 1 Status custom + 1 Custom Field definido.
   - **Tenant B** (`qa-tenant-b@example.com`) — mismo setup mínimo, completamente separado.
2. Guardar los tokens de sesión de ambos (`POST /api/auth/login` o el token que devuelve el
   registro) — se usan en cada request de abajo como `Authorization: Bearer <token>`.
3. Guardar los ids de los recursos del Tenant A que se van a usar como "objetivo" de los ataques
   simulados (el `employeeId`, `clientId`, `statusDefinitionId`, `customFieldDefinitionId` del
   Tenant A).

### Casos a probar — por cada fila, usar el token del Tenant B contra un id que pertenece al Tenant A

Formato esperado en **todos** los casos: **404** ("not found"), nunca 200 ni 403 (403 confirmaría
que el recurso existe pero está protegido — 404 es el patrón que ya usa el resto de la app para no
revelar que el recurso existe en otro tenant; si algún endpoint devuelve 403 en vez de 404, anotarlo
como inconsistencia, no como falla crítica).

| # | Request | Resultado esperado |
|---|---|---|
| 1 | `GET /api/hr/employees/:employeeId-de-A` con token de B | 404 |
| 2 | `PATCH /api/hr/employees/:employeeId-de-A` con token de B, body `{"firstName": "hackeado"}` | 404, no se modifica el registro de A |
| 3 | `PATCH /api/hr/employees/:employeeId-de-A` con token de B, body `{"tenantId": "<id-de-B>"}` | 404 (y si por algún motivo no fuera 404, verificar explícitamente que el `tenantId` del empleado de A no haya cambiado — este es el caso exacto del bug original) |
| 4 | `DELETE /api/hr/employees/:employeeId-de-A` con token de B | 404, el empleado de A sigue existiendo |
| 5 | `GET /api/clients/:clientId-de-A` con token de B | 404 |
| 6 | `PATCH /api/clients/:clientId-de-A` con token de B, body `{"tenantId": "<id-de-B>"}` | 404, sin cambios |
| 7 | `DELETE /api/clients/:clientId-de-A` con token de B | 404 |
| 8 | `PATCH /api/status-definitions/:statusId-de-A` con token de B | 404 |
| 9 | `PATCH /api/hr/custom-fields/:definitionId-de-A` con token de B | 404 |
| 10 | `POST /api/hr/employees/:employeeId-de-A/custom-fields` con token de B (intentar crear un valor de custom field sobre un empleado ajeno) | 404 |
| 11 | Repetir el caso 2 y 6 pero con `statusId` en el body, apuntando a un `StatusDefinition` que pertenece a B (no a A) — mientras se usa el token de A sobre un recurso de A | 400 ("status not found" o similar) — este caso confirma que no solo el *dueño* del recurso importa, sino también que los ids referenciados dentro del body (statusId, managerId) pertenezcan al mismo tenant |

### Cómo correrlo

- **Opción rápida (manual):** con `curl` o Postman/Insomnia, siguiendo la tabla de arriba — es el
  método que ya usó el proyecto para verificar cada feature nueva hasta ahora (ver notas de avance
  en `docs/tareas/`), así que no hace falta introducir herramienta nueva.
- **Opción automatizada (mejor a largo plazo, no bloqueante):** si el/la QA tiene soltura con
  Vitest + `supertest`, convertir esta tabla en un archivo `tests/tenant-isolation.test.ts` que
  levante la app real (`src/app.ts`) contra una base de test, corra los 11 casos, y falle el build
  si alguno deja de dar 404. Los tests existentes (`tests/*.test.ts`) mockean Prisma directo en vez
  de levantar la app — este test necesita un enfoque distinto (una instancia real de la app + 2 tenants
  reales en una base de test), evaluar si vale la pena el setup adicional o si el checklist manual
  alcanza por ahora.

### Al encontrar una falla

Si cualquier caso de la tabla no da el resultado esperado, es una vulnerabilidad de la misma
familia que el bug original — reportarlo con la misma severidad (alta), no como un bug de UX.
Incluir: el número de caso, el request exacto (método + URL + body), la respuesta real recibida, y
si el dato de A quedó modificado (verificar con un `GET` posterior usando el token de A).

---

## QA-02 — Import/export CSV + seed data de onboarding (push `a3e6ca8`, 2026-07-23)

**Por qué existe esta tarea:** este push agregó superficie nueva de escritura masiva (import CSV,
hasta 2MB por request) y dos endpoints nuevos (`/api/onboarding/*`) que nadie verificó en
producción más allá de un smoke test con curl (confirmar que las rutas devuelven 401 sin auth, no
404). No hay verificación de que el aislamiento entre tenants, la autorización por rol, ni el
manejo de filas inválidas funcionen como se espera bajo datos reales.

### A. Import/export CSV de Employees y Clients

Endpoints: `GET/POST /api/hr/employees/export|import/csv`, `GET/POST /api/clients/export|import/csv`.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Exportar Employees como un rol no-owner (ej. `admin`) | Columnas `Hourly Rate`/`Monthly Rate` **no** aparecen en el CSV — están gateadas a `viewerRole === 'owner'` en `csvService.ts:58-64`. Confirmar también llamando el endpoint directo (no solo desde la UI) por si el rol se puede forzar. |
| 2 | Importar un CSV con `Department`/`Job Title` que no existen todavía en ese tenant | Se crean como catálogo nuevo (`findOrCreateFieldCatalogDefinition`) — confirmar que quedan asociados al tenant correcto y no aparecen en otros tenants |
| 3 | Importar un CSV con `Status` que no existe en ese tenant | La fila da error legible ("status not found" o similar), **no** se crea un Status nuevo silenciosamente — a diferencia de Department/Job Title, Status usa `find`, no `findOrCreate` (`csvService.ts:121-124`) |
| 4 | Importar un CSV donde 3 de 10 filas tienen el email duplicado de un empleado ya existente | Las 7 filas válidas se crean, las 3 inválidas aparecen en `errors[]` con el mensaje de duplicado — el import no aborta entero por errores parciales (`csvService.ts:166-169`) |
| 5 | Importar un CSV de Clients usando el token del Tenant B pero apuntando (por email) a un `Manager Email` que pertenece a un empleado del Tenant A | El manager no debería resolverse cross-tenant — confirmar que `prisma.employee.findFirst` en `csvService.ts:128` está filtrando por el `tenantId` de la sesión (debería estarlo, pero no se verificó explícitamente después del push) |
| 6 | Importar un archivo > 2MB | Debe rechazarse con un error claro (límite subido a 2MB en `express.json`), no un 500 crudo ni un timeout |
| 7 | Importar un CSV vacío (solo headers, 0 filas) o un archivo que no es CSV (ej. subir un .xlsx por error) | No debe crashear el proceso — confirmar que devuelve `{created: 0, errors: []}` o un error legible, no un 500 |

### B. CSV Injection (ver también hallazgo en `docs/tareas-desarrollo.md`, sección Seguridad)

| # | Caso | Resultado esperado hoy (bug conocido, no corregido todavía) |
|---|---|---|
| C | Crear un empleado con `First Name` = `=1+1` (o un custom field de tipo texto con ese valor), exportarlo a CSV, abrir el archivo en Excel/Google Sheets | **Corregido 2026-07-23** — `escapeCsvField` en `src/lib/csv.ts` ahora prefija con `'` los valores que empiezan con `=`, `+`, `-`, `@`, tab o CR, así se abren como texto literal en vez de ejecutarse como fórmula. Repetir con `@SUM(1+1)` y con un nombre que empiece con `-` o `+` para confirmar el fix contra el build/deploy real, no solo en el código. |

### C. Onboarding checklist + seed data

Endpoints: `GET /api/onboarding/status`, `POST /api/onboarding/seed-sample-data`.

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | Llamar `seed-sample-data` dos veces seguidas en el mismo tenant | Confirmar qué pasa la segunda vez — ¿duplica los 5 empleados/4 clientes de muestra, o falla limpio? No se probó este caso durante el desarrollo. Si duplica, anotarlo como mejora de backlog (idempotencia), no como bug crítico — es un endpoint de conveniencia para onboarding, no de uso repetido. |
| 9 | Llamar `seed-sample-data` con un rol sin `canCreateHr` (ej. viewer) | 403, no debe crear nada |
| 10 | Verificar `GET /api/onboarding/status` en un tenant recién creado (sin usar seed data) | `hasEmployees: false` a pesar de que el owner ya tiene 1 Employee auto-creado en el registro — el check usa `count > 1` a propósito (ver `onboardingService.ts`); confirmar que el checklist no marca "empleados cargados" como completo solo por el owner |

### D. Regresión funcional rápida (bajo riesgo, smoke test)

- Columnas congeladas (Name, Status) + reordenables por drag-and-drop en Employees, Clients y Company Users — confirmar que Name/Status no se mueven al hacer drag y quedan fijas al scrollear horizontal, y que el resto sí se puede reordenar y el orden persiste después de refrescar la página (`localStorage`).
- Changelog (ícono de campana en el TopBar) — el punto de "no leído" desaparece después de abrir el panel una vez.
- Help/FAQ (`/help`) — el acordeón abre/cierra, el link de contacto tiene el email correcto.

### Al encontrar una falla

Mismo criterio que QA-01: si algo de la sección A o C rompe aislamiento entre tenants o
autorización por rol, es severidad alta. Si es un caso de datos mal formados (B/6/7) que devuelve
un error feo pero no expone ni corrompe datos de otro tenant, es severidad media/baja — anotar la
diferencia en el reporte.

---

## QA-03 — Pasada UX/UI completa + CORS lockdown + Company Users (push `7f97cf2`, 2026-07-31, a staging y producción en el mismo turno)

**Por qué existe esta tarea:** este push tocó 35 archivos — paleta de color completa (terracota
reemplaza azul como acento de acción), escala de alturas de control, jerarquía de botones, 3
componentes nuevos (`EmptyState`, `TableSkeleton`, `EntityCardList`) más `OverviewActionsMenu` y
`MobileTabbar`, los 4 paneles de detalle reagrupados en secciones, tarjetas de Kanban con datos
nuevos, tiles de Settings, dark mode reconstruido de cero (3 planos), patrón mobile nuevo, y —
separado de la parte visual — un fix de N+1 en un script CLI, `CORS` restringido de abierto a
allowlist, y ghost row/scrollbar nuevos en Company Users. Se verificó con Playwright contra un
tenant de prueba (staging) y con `curl` contra la API de producción ya deployada, pero fue una
sesión sin supervisión del usuario en tiempo real — esta tarea es la pasada de confirmación humana
que falta.

**Actualización 2026-07-31, mismo día:** después de este push el usuario reportó un error real en
`/overview` ("Failed to load your tasks"/"Failed to load the team calendar") — diagnosticado como
un incidente **preexistente, no causado por este push**: las tablas `Task`/`Note` nunca se habían
creado en la base de datos de producción (`prisma db push` corrido contra `staging` al construir ese
módulo, nunca contra producción — detalle completo en `docs/tareas/semana-2026-07-29.md`, entrada
del 2026-07-31, sección D). Ya se corrió el fix (`prisma db push` aditivo contra producción) y se
verificó con `curl` que los endpoints vuelven 200. **La sección D de abajo es para confirmar que el
fix se mantiene, no para redescubrir el bug.**

### A. Verificación visual (todas en `/`, autenticado, un tenant con datos reales)

| # | Pantalla | Qué mirar |
|---|---|---|
| 1 | `/overview`, `/hr/employees`, `/settings` (claro) | Ningún gris azulado visible (bordes, texto, fondos) — todo debería leerse cálido/piedra. Botón primario en terracota, no azul. |
| 2 | Las mismas 3, en oscuro (Settings → Appearance → Dark) | Fondo casi negro cálido, no gris ni negro puro. Los 5 pares de texto/fondo listados en `design-system.md` §1 deben leerse con buen contraste — ningún texto casi invisible. |
| 3 | `/hr/employees`, `/companies`, `/contacts` — forzar tenant vacío o buscar algo sin resultados | `EmptyState` con ícono, título, texto y botón — no el `<p>` de texto plano de antes. Estado de carga (throttlear a 3G en DevTools) debe mostrar el skeleton de tabla, no "Loading...". |
| 4 | Abrir el panel de detalle de un Employee con varios custom fields | Campos agrupados en secciones (Identity/Role/Contract & compensation/Custom fields), sin scroll dentro del panel, botón "Actions" junto al cierre (X) con Delete y, si corresponde, "Invite to app". |
| 5 | `/opportunities`, con ≥ 2 stages y ≥ 1 oportunidad | Tarjeta con monto arriba a la derecha, owner + antigüedad en el stage abajo; header de columna con el total sumado. |
| 6 | `/settings` (home) | Tiles sin círculos de color, con descripción debajo del label. |
| 7 | 390×844 (mobile) y 768×1024 (tablet), en `/hr/employees` | Debajo de 768px: lista de tarjetas en vez de tabla, tabbar inferior (Overview/Employees/Time Off/Sales) fijo, sin scroll horizontal a nivel `body`. En 768px exacto: vuelve a verse la tabla completa (no las tarjetas). |
| 8 | `/settings/users` (Company Users) | Fila fantasma "+ Invite" al final de la tabla (click abre el mismo SlideOver que el botón de arriba); si la tabla no entra en el ancho de la ventana, aparece una scrollbar horizontal propia (no la nativa del navegador) debajo de la tabla. |

### B. CORS — confirmar que el allowlist no rompió nada real

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Usar la app normalmente desde `https://app.joinnorthstack.com` (login, cargar datos, guardar un campo) | Todo funciona igual que siempre — mismo origen, no debería notarse ningún cambio |
| 10 | Levantar el frontend en local (`npm run dev` en `frontend/`, puerto 5173) contra el backend en local | Debe seguir funcionando — `localhost:*` está explícitamente permitido |
| 11 | Abrir `/apply/:tenantSlug/:formSlug` de un form público real y enviarlo | Debe funcionar igual que antes — esa ruta (`/api/public/*`) se dejó a propósito abierta a cualquier origen, sin restricción nueva |
| 12 | (Opcional, si hay forma de probarlo) confirmar con el equipo/documentación si existe algún integrador externo o widget que llame a la API desde un dominio de un tercero (no descubrí evidencia de esto en el código, pero no se puede descartar 100%) | Si existe y no es `/api/public/*`, va a estar bloqueado por el nuevo allowlist — reportarlo como regresión y agregarlo a la lista de orígenes permitidos en `src/app.ts` |

### C. Backend — bajo riesgo, smoke test

| # | Caso | Resultado esperado |
|---|---|---|
| 13 | Correr `npx tsx scripts/metrics-report.ts` (o revisar el output ya corrido en la sesión) | Mismo tipo de output que antes del fix (avg/median/max por tenant), sin errores — es un script de solo lectura, sin riesgo para datos reales |

### D. Incidente `Task`/`Note` en producción — confirmar que el fix sigue en pie

| # | Caso | Resultado esperado |
|---|---|---|
| 14 | `GET /api/tasks/mine` y `GET /api/tasks/calendar` (autenticado, cualquier tenant real) | 200, no 500. Si vuelve a dar 500, correr la misma query de diagnóstico contra producción (`information_schema.tables`, ver `docs/tareas/semana-2026-07-29.md` sección D del 2026-07-31 para el procedimiento exacto) antes de asumir que es el mismo bug — podría ser algo nuevo. |
| 15 | Abrir la pestaña "Notes" de cualquier panel de detalle (Employee/Company/Contact/Opportunity), crear una nota | Se guarda y aparece en la lista, sin error. |
| 16 | "My tasks" en `/overview` (widget de la derecha) | Cuando el usuario tiene tasks asignadas, aparecen; sin error toast. |

### Al encontrar una falla

Los ítems A son visuales/UX — cualquier hallazgo ahí es prioridad de pulido, no de seguridad, salvo
que algo quede genuinamente roto/inutilizable (ej. no se puede guardar un campo, un botón no
responde). Los ítems B (CORS) son los de mayor riesgo real: si algo que antes funcionaba ahora está
bloqueado por CORS, es severidad alta (afecta uso real de 167 tenants) — reportar con el origen
exacto que falló y la URL completa del request. Los ítems D, si vuelven a fallar, son severidad alta
también — es una feature completa (Tasks/Notes) inutilizable, no un detalle visual.

---

## QA-04 — Módulo Payroll completo, 15/15 unidades (push `d1da7c4`, 2026-07-31, a `staging` únicamente)

**Por qué existe esta tarea:** módulo nuevo desde cero (schema + backend + frontend), construido en
una sola sesión larga siguiendo un spec de 15 unidades (`docs/tareas-desarrollo.md`, sección
"Payroll (Tier 3.5)" — el detalle día a día completo vive en
`docs/tareas/semana-2026-07-29.md`). Hubo un falso arranque previo (una versión simplificada, sin
ver el spec real) que se pusheó por error a producción y se revirtió el mismo día — la versión que
llegó a `staging` es la reconstrucción completa contra el spec real, no esa primera versión.
Verificado con `npm run build`/`npm test` en cada una de las 15 unidades y varias rondas de smoke
test por `curl` contra `staging` (pre-carga fixed/hourly, ajustes, horas con recálculo, guards de
confirmación, pagos off-cycle, payslip PDF) — **sin verificación visual/Playwright**, esta tarea es
esa pasada.

### A. Acceso — Payroll es owner-only en toda la sección

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Loguearse como `admin` o `member` de un tenant con datos | "Payroll" **no aparece** en el sidebar (grupo Human Resources). Navegar a mano a `/hr/payroll` no debería mostrar datos reales (los endpoints devuelven 403). |
| 2 | Loguearse como `owner` | "Payroll" aparece en el sidebar, entre Employees/Time Off y Dashboard, con ícono de dólar. |
| 3 | Como empleado no-owner que sí tiene un `Employee` vinculado a su usuario, con compensación cargada | Puede ver su propia compensación (dónde se muestra: panel de detalle de su propio Employee, sección "Compensation") aunque no tenga acceso a `/hr/payroll` — confirmar que ve la suya pero no puede ver/editar la de otro compañero. |

### B. Flujo completo de un run (como owner)

| # | Caso | Resultado esperado |
|---|---|---|
| 4 | `/hr/payroll` → tab "Pay Frequencies" → "New Pay Frequency" | Crea una frecuencia (nombre, cadencia, día(s) de pago). Aparece en la tabla, toggle Active/Deactivated funciona. |
| 5 | Panel de detalle de un Employee → sección "Compensation" → "+ Add compensation" | Carga tipo (hourly/fixed), tarifa, moneda, frecuencia (la creada en el paso 4), vigente desde. Se guarda, aparece como "vigente" destacado arriba. |
| 6 | Cargar una segunda compensación para el mismo Employee, con fecha posterior | La anterior pasa a "historial" (colapsado detrás de "Show history"), la nueva queda como vigente — sin que ambas queden vigentes a la vez. |
| 7 | `/hr/payroll` tab "Timeline" → "New Run", eligiendo la frecuencia del paso 4 | Se crea el run y pre-carga automáticamente a todos los empleados con compensación vigente bajo esa frecuencia — entrar al detalle del run y confirmar que aparecen. |
| 8 | En el detalle del run, para un empleado con compensación **fixed** | La columna Base muestra el monto directo (no editable), coincide con la tarifa cargada. |
| 9 | En el detalle del run, para un empleado con compensación **hourly** | La columna Base es un input de horas editable — escribir un número muestra un preview en vivo ("= $X") antes de guardar, y al perder foco se guarda (recarga con el monto ya calculado). |
| 10 | Click en la columna "Adjustments" de una fila | Abre un popover — agregar un bono/comisión/reembolso/deducción con tipo, monto, nota. El total de la columna se actualiza (con signo +/− según corresponda). |
| 11 | Intentar "Confirm Run" con algún empleado hourly sin horas cargadas | El botón está deshabilitado (con tooltip explicando por qué) — no llega a mandar el request. |
| 12 | Cargar las horas faltantes y confirmar el run | El run pasa a "Confirmed". Los controles de edición (horas, ajustes, "+ Add Person") desaparecen o quedan bloqueados. |
| 13 | Click en el ícono de payslip de una fila (documento) | Abre un panel con un PDF embebido, banner "Preview only — not sent", y un botón de descarga que efectivamente baja un `.pdf` con el nombre del empleado, período, breakdown y total. |
| 14 | "+ One-off Payment" desde el tab Timeline | Modal con checklist de empleados — marcar 2-3, cada uno con su propio monto editable, un tipo y fecha compartidos. Al guardar, aparecen como entradas separadas (no agrupadas) en el Timeline con chip "One-off". |
| 15 | Tab "Timeline" con al menos 1 run y 1 pago único | Ambos aparecen mezclados en una sola lista, ordenados por fecha, cada uno con su chip ("Run" / "One-off") y estado. |

### C. Empleado inactivo (advertencia, no bloqueo)

| # | Caso | Resultado esperado |
|---|---|---|
| 16 | Desactivar (cambiar a un status no-default) a un Employee que ya tiene compensación vigente, luego crear/abrir un run que lo incluya | Fila con status en rojo + un banner amarillo debajo ("Figura [status] desde [fecha] — revisar antes de confirmar"). El run **se puede confirmar igual** — no es un bloqueo duro, es solo una advertencia visual. |

### D. Aislamiento entre tenants

| # | Caso | Resultado esperado |
|---|---|---|
| 17 | Con el token de un Tenant B, intentar `GET`/`PATCH` sobre un `runId`/`employeeId`/`entryId` que pertenece al Tenant A | 404 ("not found"), nunca los datos reales ni un 403 que confirme que el recurso existe. Mismo criterio que QA-01. |

### Al encontrar una falla

Los ítems A son de seguridad real (visibilidad de datos de compensación) — cualquier falla ahí es
severidad alta. Los ítems B/C son la funcionalidad central del módulo — si algo del flujo principal
(crear run, confirmar, payslip) no funciona, es severidad alta porque el módulo completo queda
inutilizable; problemas de detalle visual (alineación, texto) son severidad baja. El ítem D es
seguridad — tratarlo con el mismo criterio que QA-01.

---

## QA-05 — Payroll re-spec: anchorConfig, confirmación de contrato, Assignments (push `f9319a0`, 2026-08-03, a `staging`)

**Por qué existe esta tarea:** después de QA-04 (Payroll V1, 15 unidades), el usuario cargó un spec
técnico nuevo en `docs/tareas-desarrollo.md` (Unidad 0 a 15 renumeradas) que cambia partes reales del
modelo de datos y agrega funcionalidad nueva. No es un parche chico — hay que volver a pasar por el
módulo completo, no solo por lo agregado. Verificado con `npm run build`/`npm test` en cada unidad y
una sesión de smoke test por `curl` contra un tenant descartable (creado y en gran parte limpiado
después) — sin Playwright esta sesión tampoco.

### A. Cambio de schema — Pay Frequencies

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/hr/payroll` → tab "Pay Frequencies" en un tenant nuevo | Aparecen las 2 políticas seed, ahora en inglés: "Monthly" (Last business day) y "Semimonthly" (Day 15 and last day of month) — antes eran "Mensual"/"Quincenal". Si el tenant ya tenía políticas viejas con cadence `biweekly`, esas filas ya no existen (se limpiaron antes de aplicar el schema nuevo — confirmar que no rompe nada, no que sigan ahí). |
| 2 | "New Pay Frequency" con cadencia Weekly | Pide día de la semana (select). Al guardar y volver a abrir "Edit", el día queda seleccionado correctamente (round-trip del JSON). |
| 3 | "New Pay Frequency" con cadencia Semimonthly, opción "Custom" | Pide 2 selects de día de mes (1-31). Guardar, reabrir en Edit — ambos días persisten. |
| 4 | "New Pay Frequency" con cadencia Monthly, opción "Custom" | Pide 1 select de día de mes. Mismo round-trip que el caso anterior. |
| 5 | Cualquier política, campo "Due date" en Custom | Pide un número de días, se guarda y se muestra como "+N days" en la tabla. |
| 6 | Tabla del catálogo | Columna "Due date" nueva, además de "Pay day(s)" ya existente — ambas legibles (no JSON crudo). |

### B. Modal centrado (componente nuevo)

| # | Caso | Resultado esperado |
|---|---|---|
| 7 | Abrir "New Pay Frequency" / "New Employee" → sección Compensation / Assignments → "Assign/Reassign Policy" | Los 3 abren un modal centrado con backdrop oscuro, no un panel lateral deslizante (`SlideOver`) — comparar visualmente contra, por ejemplo, el SlideOver de "New Run" en la misma página, que sigue siendo panel lateral. |

### C. Panel de Employee — grupo "Employment" vs "Compensation"

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | Abrir el panel de detalle de cualquier Employee | El grupo "Contract & compensation" ya no existe. En su lugar: "Employment" (Start Date, End Date, Contract URL, Time Off Policies) y, más abajo, "Compensation" (historial de `EmployeeCompensation`, sin cambios visuales). Ningún campo "Contract Type"/"Compensation Type"/"Hourly Rate"/"Monthly Rate" suelto en el panel. |
| 9 | Exportar Employees a CSV | Las columnas "Contract Type"/"Compensation Type"/"Hourly Rate"/"Monthly Rate" siguen apareciendo (no se tocó el schema de `Employee` ni el CSV) — confirmar que el export no se rompió. |

### D. Alta de empleado con compensación (Unidad 5.1)

| # | Caso | Resultado esperado |
|---|---|---|
| 10 | Como owner, "Add Employee" → sección "Compensation (optional)" al final del form, dejar el monto vacío | El empleado se crea sin ninguna `EmployeeCompensation` — igual que el comportamiento de antes de este cambio. |
| 11 | Mismo form, cargar tipo + monto + frecuencia + fecha | El empleado se crea y, además, aparece con esa compensación como vigente en su panel de detalle (grupo "Compensation") y en el tab "Assignments" de Payroll. |
| 12 | Como `admin` (no owner) | La sección "Compensation (optional)" no aparece en el form — igual que el resto de los campos owner-only. |

### E. Confirmación de contrato (Unidad 5.3) — el caso más nuevo y más riesgoso

| # | Caso | Resultado esperado |
|---|---|---|
| 13 | Owner carga la primera compensación de un empleado que ya tiene cuenta (`userId` seteado) | El empleado recibe un email ("Confirm your compensation contract") y ve un banner amarillo en `/overview` ("You have a compensation contract pending confirmation") apenas loguea. |
| 14 | Ese mismo empleado abre "Review & Confirm" desde el banner | Modal centrado con tipo/monto/frecuencia/fecha efectiva + botón "Confirm". Al confirmar, el banner desaparece y no vuelve a aparecer en logins siguientes. |
| 15 | Crear un Payroll Run bajo la frecuencia de un empleado con contrato **sin confirmar** | El empleado queda excluido del pre-load del run (no aparece en la tabla del run). Toast de aviso ("N people excluded — unconfirmed contract") al crear el run. |
| 16 | Confirmar el contrato y crear un run nuevo | El empleado ya aparece incluido en el pre-load, sin aviso de excluidos. |
| 17 | Ese mismo empleado (con Time Off Policy asignada) intenta pedir Time Off mientras su contrato sigue sin confirmar | La request se rechaza con un mensaje pidiendo confirmar el contrato primero — no debería poder cargar una solicitud. |
| 18 | Owner reasigna la política de un empleado que **ya había confirmado** un contrato antes (vía "Assignments" o el panel del empleado) | El cambio se aplica de inmediato, sin banner de confirmación pendiente ni exclusión de runs — el bloqueo es solo para el primer contrato de cada persona. |

### F. Assignments (Unidad 5.2)

| # | Caso | Resultado esperado |
|---|---|---|
| 19 | `/hr/payroll` → tab "Assignments" | Tabla con checkbox por fila, nombre, y chip de política actual o "No policy assigned" por cada Employee del tenant. |
| 20 | Seleccionar 2-3 personas → "Assign/Reassign Policy" | Modal con frecuencia + fecha efectiva + tipo (compartidos) y, debajo, un input de monto por persona — pre-cargado con el monto anterior si tenía uno, vacío si no. |
| 21 | Cargar "Apply this amount to all selected rows" | Todos los inputs de monto de las filas seleccionadas se actualizan al mismo valor, pero siguen siendo editables individualmente después. |
| 22 | Confirmar con algunas filas sin monto cargado | Solo se crean las compensaciones de las filas con monto — no bloquea el batch entero (mismo criterio que el import de CSV). |

### G. Aislamiento entre tenants (mismo criterio que QA-01)

| # | Caso | Resultado esperado |
|---|---|---|
| 23 | Con el token de un Tenant B, `POST /api/hr/employees/:id/compensation/:compId/confirm` sobre un `compensationId` del Tenant A | 404, no se modifica el registro de A. |
| 24 | Con el token de un Tenant B, `GET /api/hr/payroll/compensation/status` o `POST .../compensation/bulk` | Solo devuelve/afecta datos del propio tenant del token — nunca del Tenant A. |

### Nota — Unidad 5.4 no está construida a propósito

El spec pide chips de "estado de contrato" y "último login" en la tabla de Employees, pero depende de
un módulo de Activity Log que todavía no existe en el proyecto (Tier 5 del backlog general). Se dejó
sin construir en vez de simular un stand-in — no es un bug, no hace falta reportarlo, solo confirmar
que no aparece nada roto en su lugar (no debería haber ninguna columna nueva a medio hacer en
`EmployeesPage.tsx`).

### Al encontrar una falla

Los ítems E (confirmación de contrato) son los de mayor riesgo real — si alguien queda excluido de un
run o de Time Off sin que corresponda, o al revés, si alguien sin confirmar termina incluido en un run
igual, es severidad alta (plata mal pagada o gente activa sin cobrar). Los ítems A/B/C/D son
funcionales — si el flujo principal no deja crear/editar, es alta; problemas de detalle visual son
baja. El ítem G es seguridad, mismo criterio que QA-01.

---

## Próximas tareas de QA (a definir)

Cuando se construya el rediseño de Clients pendiente (corte del módulo legado) o el módulo Payments
(distinto de Payroll — facturación a Clients, no pagos a Employees), esta tabla de casos va a
necesitar extenderse con sus endpoints nuevos.
