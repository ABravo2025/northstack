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

*(QA-04 y QA-05 — Payroll — eliminadas 2026-08-06: el módulo se revirtió de `main` el 2026-08-03 tras
un incidente de deploy y no existe en el código en ningún entorno; no tenía sentido dejar tareas de
QA para verificar algo que no está. Detalle completo en `docs/tareas-desarrollo.md`, entrada
2026-08-06.)*

## QA-06 — Add Employee: paridad visual con el panel de detalle + auto-create + fix de paginación (2026-08-06, a `staging`)

**Por qué existe esta tarea:** el modal "Add Employee" se reconstruyó para verse igual que el panel
de detalle de un empleado ya creado (mismo estilo de campo — label a la izquierda, input sin borde
hasta foco/hover — en vez de label arriba + caja con borde) y ganó comportamiento nuevo: apenas
First Name, Last Name y Business Email están completos (chequeado al perder foco), el empleado se
crea solo en el backend y el modal pasa a mostrar el panel de detalle real de esa persona — sin
clickear "Create". Los campos requeridos ahora muestran un asterisco rojo (`Field.tsx`, prop
`required`, reusable en cualquier form nuevo). De paso se encontró y corrigió un bug real reportado
por el usuario probando la app: el empleado recién creado podía no aparecer en la tabla al cerrar el
panel si el orden/filtro activo lo mandaba a otra página — ahora la tabla salta automáticamente a la
página donde cayó. Verificado con Playwright contra un tenant descartable en `staging` (incluyendo
el caso determinístico: ordenar por Name ascendente y crear a alguien cuyo nombre cae en la última
página) — sin supervisión visual del usuario todavía, esta tarea es esa pasada.

### A. Paridad visual

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/hr/employees` → "+ Add" (fila fantasma al final de la tabla, o el botón del estado vacío si el tenant no tiene empleados todavía) | Los campos se ven como el panel de detalle: label a la izquierda, input sin borde visible hasta hacer foco/hover — no la caja con borde de antes. |
| 2 | Mirar los labels de First Name, Last Name, Business Email | Los 3 tienen un asterisco rojo después del label. Ningún otro campo (Department, Job Title, Contract Type, etc.) lo tiene. |
| 3 | Cualquier custom field de Employee marcado como `required` | También muestra el asterisco rojo (antes era un `*` de texto plano al final del label, ahora es el mismo `.required-mark` reusable). |

### B. Auto-create

| # | Caso | Resultado esperado |
|---|---|---|
| 4 | Completar First Name + Last Name + un email con forma válida (ej. `a@b.com`), sin tocar el botón "Create" | Al perder foco el campo de email, aparece el toast de "agregado" y el modal se reemplaza por el panel de detalle real de la persona (avatar, nombre, email, chip de status, columna de Notes/Tasks/Activity) — mismo componente que abrir un empleado ya existente. |
| 5 | Completar los 3 campos requeridos y clickear "Create" a mano en vez de esperar el auto-create | Mismo resultado que el caso 4 — el botón manual sigue funcionando como fallback, sin crear el empleado dos veces. |
| 6 | Dejar un campo requerido vacío o con un email con forma inválida (ej. `sin-arroba`) y clickear en otro lado del form | No pasa nada — no se crea el empleado, el form sigue editable. |
| 7 | Completar los 3 requeridos + un custom field marcado `required`, dejando el custom field vacío | No se auto-crea hasta que el custom field también esté completo. |
| 8 | Provocar un error del backend al auto-crear (ej. reusar el email de un empleado que ya existe en el tenant) | Toast de error legible, el form no se cierra ni se vacía — completar un email distinto y volver a perder el foco reintenta la creación. |

### C. Fix de paginación (bug real corregido esta ronda)

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Con ≥ 21 empleados en el tenant (para forzar 2+ páginas) y sin ningún sort activo, crear uno nuevo desde la fila fantasma de la página 1 | Al cerrar el panel de detalle, el empleado nuevo es visible en la tabla sin tener que navegar de página a mano. |
| 10 | Mismo escenario, pero ordenando la tabla por "Name" ascendente antes de crear, con un nombre que alfabéticamente caiga en la última página (ej. empieza con "Z") | La tabla salta sola a la página donde cayó el nuevo registro (el indicador "Page X of Y" cambia) y la fila es visible sin navegar a mano. |

### Al encontrar una falla

Los ítems A son visuales — prioridad de pulido salvo que algo quede genuinamente roto. Los ítems B
son funcionales — si el auto-create no dispara nunca, o dispara con datos incompletos, es severidad
alta (mismo criterio que cualquier bug de alta de datos). El ítem C es el bug que motivó esta ronda:
si vuelve a reproducirse, severidad alta — es exactamente el reporte original del usuario.

---

## QA-07 — Add Company/Contact/Opportunity: mismo tratamiento que QA-06 (2026-08-06, a `staging`)

**Por qué existe esta tarea:** continuación directa de QA-06 (Add Employee) — el mismo tratamiento
(paridad visual de campos con el panel de detalle, asterisco rojo en requeridos, auto-create al
completar los campos obligatorios, sin clickear "Create") se replicó a los otros 3 forms de alta del
CRM. Verificado con Playwright contra un tenant descartable en `staging` (creación real de Company →
Contact → Opportunity encadenada, la Opportunity usando la Company recién creada), datos de prueba
borrados después. Sin verificación visual del usuario todavía — esta tarea es esa pasada.

### A. Paridad visual + asterisco rojo

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/companies` → "+ Add" | Campos con el mismo estilo que `CompanyDetailModal` (label izquierda, sin borde hasta foco). Asteriscos rojos en Name, First Name/Last Name/Email de "Founding contact" (4 en total) — ningún otro campo. |
| 2 | `/contacts` → "+ Add" | Mismo estilo. Asteriscos en First Name/Last Name/Email (3 en total) — el radio "¿Asignar a una company existente?" y el checkbox "Primary contact" quedan con su estilo original (no son campos simples, no se tocaron). |
| 3 | `/opportunities` → "Add Opportunity" | Mismo estilo. Asteriscos en Deal Name/Company/Owner/Amount/Currency (5 en total) — y en Loss Reason **solo** cuando el stage seleccionado por default sea de tipo "lost" (caso raro, normalmente no aplica al abrir el form). |

### B. Auto-create

| # | Caso | Resultado esperado |
|---|---|---|
| 4 | Company: completar Name + First/Last Name + Email del contacto fundador, perder el foco del último campo | Se crea la Company (con su Contact fundador) y el modal pasa a ser el `CompanyDetailModal` real — sin clickear "Create". El contacto fundador aparece en la sección "Contacts" del panel (confirma que se refrescó `contacts`, no solo `companies`). |
| 5 | Contact: completar First/Last Name + Email, perder el foco del email | Se crea el Contact y el modal pasa a `ContactDetailModal` real. |
| 6 | Opportunity: completar Deal Name, elegir Company y Owner (selects — el auto-create dispara en el `onChange`, no hace falta perder el foco), completar Amount y perder el foco | Se crea la Opportunity (moneda ya viene precargada con la del tenant) y el modal pasa a `OpportunityDetailModal` real, con la Company/Owner elegidos correctos y stage en el primer stage activo del pipeline. |
| 7 | En cualquiera de los 3, dejar un campo requerido vacío o inválido y hacer click afuera | No se crea nada, el form sigue editable — mismo criterio que QA-06. |
| 8 | Botón "Create" manual en cualquiera de los 3, con los requeridos ya completos | Mismo resultado que el auto-create — sigue funcionando como fallback, sin duplicar la entidad. |

### C. Nota — sin fix de paginación esta vez (a diferencia de QA-06)

Companies/Contacts sí tienen paginación (mismo componente que Employees) — si en la práctica un
registro nuevo queda fuera de la página visible por un sort/filtro activo, aplica el mismo fix que
Employees (`jumpToCompanyPage`/`jumpToContactPage`, ya incluidos en este push, no hace falta
verificarlo aparte salvo que algo falle). Opportunities **no tiene paginación** — el Kanban muestra
todas las cards de la columna sin límite, así que no aplica ningún fix de este tipo ahí.

### D. Bug preexistente encontrado, no corregido en este push (fuera de alcance)

Al revisar `OpportunitiesPage.tsx` para este trabajo se encontró que el campo "Loss Reason" (visible
y marcado requerido cuando el stage es "lost") se captura en el form pero **nunca se manda en el
payload de `createOpportunity`** — bug preexistente, no introducido ni corregido acá. Anotado para
una unidad aparte; no bloquea esta tarea de QA.

### Al encontrar una falla

Mismo criterio que QA-06: los ítems A son visuales — prioridad de pulido salvo que algo quede
genuinamente roto. Los ítems B son funcionales — si el auto-create no dispara, o crea con datos
incompletos/incorrectos (ej. Opportunity con la Company equivocada), es severidad alta.

---

## QA-08 — Asterisco rojo requerido, platform-wide (2026-08-06, a `staging`)

**Por qué existe esta tarea:** a pedido explícito del usuario, se agregó el marcador visual de
"campo obligatorio" (asterisco rojo) a todo formulario de la plataforma que tuviera al menos un
campo genuinamente requerido y no lo mostrara ya. Pieza reusable nueva: `RequiredMark.tsx`
(componente, no una clase suelta) — `Field.tsx` lo usa internamente vía su prop `required`; el resto
de los forms (que no usan `Field`) lo importan directo. Sin verificación visual completa del usuario
todavía — un spot-check con Playwright (Login, Register, Invite user) salió bien, pero esta tarea
cubre el resto de las pantallas tocadas, que no se vieron en navegador.

### A. Páginas y forms tocados — confirmar que el asterisco aparece solo en los campos que ya eran obligatorios antes (no se agregó ningún requerimiento nuevo, solo el indicador visual)

| # | Pantalla | Campos que deberían tener asterisco |
|---|---|---|
| 1 | `/login` | Email, Password |
| 2 | `/register` | Company Name, First Name, Last Name, Email, Phone, Password, Confirm Password — **no** en los 4 campos "(optional)" (Company size, Industry, Country, How did you hear about us) |
| 3 | `/accept-invite/:token` (modo registro) | First Name, Last Name, Phone, Password — no en Email (deshabilitado, viene de la invitación) |
| 4 | `/settings/users` → "Invite someone" | Email |
| 5 | `/settings/pipelines` → "New Pipeline" | Pipeline name |
| 6 | `/hr/time-off` → nueva PTO Policy | Name, Days per year |
| 7 | `/hr/time-off` → nueva solicitud (tab My Requests) | Policy, Start date, End date — no en Note (optional) |
| 8 | `/settings/public-forms` → nuevo/editar Form | Name, Link slug; en el preview de campos, "First Name"/"Last Name"/"Email" siempre, y cualquier campo dinámico que el toggle "Required" tenga tildado |
| 9 | `/apply/:tenantSlug/:formSlug` (form público real, sin login) | First Name, Last Name, Email siempre; los campos dinámicos según config del tenant |
| 10 | Header de columna de un custom field → "+" (agregar) o "Edit field" | Field name |
| 11 | Header de columna Status → "Manage options" → agregar | Add status |
| 12 | Header de columna Department/Job Title/Size → agregar | Add [department/job title/size] |
| 13 | `ViewsBar` → "+" nueva vista guardada | View name |
| 14 | Menú de import CSV (Employees) | CSV file |
| 15 | Tab "Tasks" de cualquier panel de detalle (Employee/Company/Contact/Opportunity) | Title (del compose de Task) |
| 16 | Tab "Notes" de cualquier panel de detalle | Title y Description (ambos requeridos para Notes, a diferencia de Tasks) |
| 17 | Panel de detalle de Company → sección Contacts → "+" (agregar) → "or create a new one" | First name, Last name, Email — **antes no tenían ningún label visible, solo placeholder**; ahora tienen label chico + asterisco |
| 18 | Panel de detalle de Company → sección Opportunities → "+" | Pipeline, Deal name |
| 19 | Panel de detalle de Contact → sección Opportunities → "+" | Pipeline, Deal name, y "Company name" (solo cuando el pipeline elegido es tipo "lead" y el contacto no tiene company todavía) |

### B. Regresión — nada dejó de poder enviarse

| # | Caso | Resultado esperado |
|---|---|---|
| 20 | Completar cualquiera de los forms de arriba con todos los campos requeridos y enviarlo | Se comporta exactamente igual que antes de este cambio — el asterisco es puramente visual, ningún campo que antes se pudiera enviar vacío ahora lo bloquea, y viceversa |

### Al encontrar una falla

Todo lo de esta tarea es visual/informativo — un asterisco de más o de menos es severidad baja. La
única forma de que esto sea severidad alta es si el ítem B falla (un form que antes funcionaba ahora
no se puede enviar, o al revés) — eso sí sería una regresión funcional real, no solo cosmética.

---

## QA-09 — Payroll Unidad 1: schema aditivo, sin superficie funcional todavía (2026-08-07, a `staging`)

**Por qué existe esta tarea:** primer push del rearranque de Payroll (`docs/spec-payroll.md`, v2,
21 unidades — tercer intento, los dos anteriores se revirtieron por completo, ver `git log`). Esta
unidad es **solo schema + una utilidad de cifrado** — no hay ningún endpoint, pantalla ni
comportamiento nuevo que probar todavía. El objetivo de esta tarea es una verificación de
regresión (nada existente se rompió), no una prueba de feature nueva.

### A. Regresión — nada de HR/Employees se movió

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `GET /api/hr/employees` contra un tenant de `staging` con empleados reales | Responde igual que antes — mismos campos, mismo conteo, sin errores 500 |
| 2 | Crear/editar un Employee normal (sin tocar nada de Payroll) desde `/hr/people` (o `/hr/employees` si el rename de Unidad 4 todavía no llegó) | Funciona idéntico a antes — `personType`/`nationality`/`countryOfResidence` son columnas nuevas nullable, no deberían aparecer en ningún form todavía |
| 3 | `npm run build` (backend) y `npm run build` (frontend), `npm test` | Los tres en verde |

### B. Confirmar el estado del schema en la base de `staging`

| # | Caso | Resultado esperado |
|---|---|---|
| 4 | Listar tablas de `staging` (`information_schema.tables`) | Existen `PayFrequencyDefinition`, `PaymentMethodDefinition`, `EmployeeCompensation`, `PayrollRun`, `PayrollEntry` — todas vacías (0 filas), con las columnas del spec nuevo (`EmployeeCompensation` debe tener `jobTitle`/`description`/`paymentMethodId`, que la versión vieja borrada no tenía) |
| 5 | `Employee` en `staging` | Tiene `personType`/`nationality`/`countryOfResidence`, las 3 en null para todos los empleados existentes; `hourlyRateCents`/`monthlyRateCents`/`compensationType` siguen intactas (se retiran en una unidad posterior, no en esta) |

### Nota sobre restos de un intento anterior

Al hacer `prisma db push` para esta unidad, aparecieron 4 tablas huérfanas en `staging`
(`PayFrequencyDefinition`/`PayrollRun`/`PayrollEntry`/`EmployeeCompensation`, con pocas filas y una
forma de columnas vieja e incompatible) — restos de un intento de Payroll revertido por completo en
el código, pero cuyo `db push` nunca se deshizo. Se borraron antes de aplicar el schema nuevo. Si
`staging` tiene otras tablas/columnas sueltas sin relación clara con el código actual, vale la pena
reportarlo — puede ser la misma clase de resto.

### Al encontrar una falla

Cualquier falla en la sección A es alta severidad (regresión sobre algo que ya funcionaba en
producción). La sección B es informativa — confirma que el push llegó como se esperaba, no hay
comportamiento de usuario que pueda fallar todavía.

---

## QA-10 — Payroll Unidad 2: catálogo de políticas de pago, backend (2026-08-07, a `staging`)

**Por qué existe esta tarea:** primer endpoint real de Payroll — catálogo de `PayFrequencyDefinition`
(políticas de pago) y `PaymentMethodDefinition` (métodos de pago), owner-only para crear/editar,
abierto a cualquier rol para listar. Verificado en vivo contra `staging` durante el desarrollo (no
solo build/tests) — ver el detalle abajo para lo que ya se probó y lo que falta confirmar con un
segundo rol real.

### A. Ya verificado durante el desarrollo (no hace falta repetir, pero documentado para que QA sepa qué asumir)

- `POST /api/tenants/register` de un tenant nuevo siembra automáticamente 5 `PayFrequencyDefinition`
  (Semanal, Semi-mensual · 1 y 15, Semi-mensual · 15 y último día, Mensual · primer día hábil,
  Mensual · último día hábil) y 4 `PaymentMethodDefinition` (Wire transfer, Payoneer, Wise, PayPal).
- `GET /api/hr/pay-frequencies` devuelve las 5 con `assignedCount: 0` (todavía no hay ninguna
  `EmployeeCompensation`). `GET /api/hr/payment-methods` devuelve las 4.
- `POST /api/hr/pay-frequencies` con un owner crea una política custom (probado con `weekly` +
  `anchorConfig: {dayOfWeek: "wednesday"}` + `dueDateOffset: "plus_2"`).
- `PATCH /api/hr/pay-frequencies/:id` con `isActive: false` saca la política del `GET` (probado
  desactivando "Semanal" — desapareció de la lista, sigue en la base con `isActive: false`).
- Backfill (`scripts/backfill-payroll-catalogs.ts`) corrido contra `staging`: sembró los catálogos
  en los 175 tenants existentes que no los tenían (0 saltados por ya tenerlos) — verificado con
  conteo directo (`875` filas de `PayFrequencyDefinition` = `175 × 5`, `700` de
  `PaymentMethodDefinition` = `175 × 4`). **No corrido contra producción todavía.**

### B. Falta confirmar — no probado en esta ronda

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `POST /api/hr/pay-frequencies` con un usuario `admin` (no owner) | 403 — a diferencia del resto de HR, Payroll es **owner-only**, admin no alcanza (`canManagePayroll`, ver `permission.test.ts` para la cobertura unitaria de la función; esto es la verificación end-to-end que falta) |
| 2 | `PATCH /api/hr/pay-frequencies/:id` / `POST`/`PATCH /api/hr/payment-methods` con `admin` o `member` | 403 en los 3 |
| 3 | `PATCH /api/hr/pay-frequencies/:id-de-otro-tenant` con un owner de un tenant distinto | 404 (aislamiento entre tenants — mismo criterio que QA-01, todavía no hay un caso explícito para Payroll en esa tabla) |
| 4 | Sin ningún endpoint ni pantalla que use `PayFrequencyDefinition.anchorConfig`/`PaymentMethodDefinition` todavía (Unidad 3+), no hay nada más que romper de cara al usuario en esta unidad |

### Al encontrar una falla

El caso B.1/B.2 (owner-only no respetado) es alta severidad — es la única barrera de permisos que
compensación tiene hoy. El caso B.3 (aislamiento entre tenants) es crítico si falla, mismo criterio
que QA-01.

---

> **Actualización 2026-08-09**: todo el módulo Payroll cubierto por QA-11 a QA-14 (y sus rondas de
> fixes en `docs/tareas-desarrollo.md`) está **en producción** — las fechas "en local únicamente" de
> cada entrada de abajo reflejan cuándo se escribió esa tarea, no el estado actual del deploy.

## QA-11 — Payroll Unidad 3+4: pantalla de políticas de pago, rename a People, `personType` (2026-08-07, en local únicamente — no pusheado a `staging` todavía)

**Por qué existe esta tarea:** primera pantalla real de Payroll (`/hr/payroll`, todavía sin entrada
en el sidebar — eso es la Unidad 21) + el primer cambio cross-módulo (People). Verificado en
navegador con Playwright durante el desarrollo (screenshots + `console --errors`), pero esta unidad
**no está pusheada a ningún entorno compartido** — el usuario pidió explícitamente seguir sin
pushear. Cuando se decida pushear, correr esto contra `staging` antes de pedir el visto bueno final.

### A. `/hr/payroll` — catálogo de políticas de pago

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Tenant nuevo → `/hr/payroll` → tab "Payment Policies" | 5 pay frequencies seedeadas (Semanal, Semi-mensual ×2, Mensual ×2) + 4 payment methods (Wire transfer/Payoneer/Wise/PayPal), todas "Active" |
| 2 | "New policy" → cadencia Weekly / Semi-monthly / Monthly | El formulario cambia dinámicamente (día de semana / radios 1y15-15yúltimo-Custom con 2 inputs / radios primer-último-Custom con 1 input) — verificado, ver capturas de la sesión |
| 3 | Toggle "Active (N)" / "Deactivated (N)" después de desactivar una política desde el modal de edición | La política desactivada desaparece de "Active" y aparece en "Deactivated", reactivable desde ahí (bug propio de la Unidad 2 corregido antes de esta tarea: el `GET` filtraba `isActive` a nivel de servicio y dejaba todo lo desactivado invisible para siempre) |
| 4 | Cualquier acción de mutación (New policy, Add method, Edit, Deactivate) con un usuario `admin` o `member` | 403 — Payroll es owner-only (`canManagePayroll`), a diferencia del resto de HR |

### B. Rename a People (cross-módulo) — regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 5 | Sidebar y tabbar mobile | Dicen "People", no "Employees"; el ícono no cambió |
| 6 | Navegar a `/hr/employees` (bookmark viejo) | Redirige a `/hr/people` sin romper nada (mismo patrón que `/profile`→`/settings/profile`) |
| 7 | `/hr/people` — tabla, búsqueda, CSV import/export, custom fields, Time Off, Kanban, vistas guardadas | Todo funciona idéntico a como funcionaba en `/hr/employees` antes del rename — es solo texto/ruta, ninguna funcionalidad debería haber cambiado |
| 8 | Modal "Add Person" | Primer campo es "Type" (Profile/Contractor/Employee, requerido) antes de "Identity"; sección que antes decía "Contract & compensation" ahora dice solo "Contract" (sin Compensation Type/Hourly Rate/Monthly Rate) |
| 9 | Columna de tabla que antes era "Compensation Type" | Ahora es "Type", muestra Profile/Contractor/Employee o "—" si no está seteado (todos los `Employee` preexistentes lo tienen `null`) |
| 10 | Crear una persona nueva con `personType: profile` | Se crea igual que antes (sin bloqueo — Profile nunca participa de Payroll, y todavía no hay nada que lo bloquee en esta unidad) |

### C. Retiro de compensación legada — regresión de datos

| # | Caso | Resultado esperado |
|---|---|---|
| 11 | Los 4 `Employee` de `staging` que tenían `hourlyRateCents`/`monthlyRateCents`/`compensationType` cargados | Tienen ahora un `EmployeeCompensation` con los mismos montos, `confirmedAt` seteado (no bloqueados), y una `payFrequencyId` asignada (Mensual si eran `monthly`/tenían `monthlyRateCents`, Semanal si eran `hourly`) — verificar con una query directa, no hay UI todavía para verlo (esa es la Unidad 5+) |
| 12 | Las columnas `hourlyRateCents`/`monthlyRateCents`/`compensationType` en la base | Siguen existiendo físicamente (no se corrió el `db push` destructivo), pero ningún endpoint ni pantalla las lee o escribe más |

### Al encontrar una falla

A.4 y B.6 son alta severidad (permisos y ruteo rotos). B.7 es crítica si algo de la funcionalidad
existente de Employees se rompió — el objetivo del rename era cero regresión funcional. El resto es
severidad media/baja (visual o de datos, sin impacto de seguridad).

---

## QA-12 — Payroll Unidad 5+6+7: alta con contrato, invitación, confirmación pública (2026-08-07, en local únicamente — no pusheado a `staging`)

**Por qué existe esta tarea:** el flujo central de Payroll — dar de alta un Contractor/Employee con
su contrato, que dispare una invitación, y que la persona la confirme en una pantalla pública sin
sesión. Verificado end-to-end con un script propio (API real + Playwright) durante el desarrollo:
alta → invitación auto-creada → confirmación con IBAN → `User` creado y logueado → desencriptado
verificado byte a byte contra lo ingresado. Cero errores de consola. Igual que QA-11, correr esto
de nuevo contra `staging` antes de pedir el visto bueno final, no asumir que alcanza con lo ya hecho.

### A. Alta con contrato inicial (Unidad 5)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | "Add Person" con Type = Profile | No aparece ninguna sección de contrato; se guarda con solo Identity/Role/Contract (los campos generales, no los de compensación) |
| 2 | "Add Person" con Type = Contractor o Employee, sin completar la sección "Initial Compensation" | El botón de auto-create/submit no dispara — a diferencia de Profile, acá el contrato es obligatorio para guardar |
| 3 | Elegir un Job Title del catálogo en la sección Role | El campo "Job Title (contract)" de Initial Compensation se pre-completa con ese nombre, pero sigue editable a mano sin que se vuelva a pisar solo (a menos que se cambie el Job Title del catálogo de nuevo) |
| 4 | Completar Initial Compensation (Hourly o Fixed, monto, moneda, Pay Frequency, Job Title, Effective From, Description) y guardar | Se crea el `Employee` y, aparte, un `EmployeeCompensation` con `blocksParticipation: true` (primer contrato de esa persona) |
| 5 | Nacionalidad en la sección Identity | Se guarda en `Employee.nationality`, aplica a cualquier Type |

### B. Invitación específica (Unidad 6)

| # | Caso | Resultado esperado |
|---|---|---|
| 6 | Después del paso A.4, revisar la tabla `Invitation` | Se creó una fila nueva con `employeeId` seteado, `role: member`, apuntando (vía el email que mandaría `sendInvitationEmail`) a `/confirm-contract/:token`, no a `/accept-invite/:token` |
| 7 | Repetir el alta con Type = Profile | No se crea ninguna `Invitation` — Profile nunca dispara este flujo |
| 8 | Reasignar/crear un segundo contrato para alguien que ya confirmó el primero (una vez exista la Unidad 10) | No debería volver a mandar invitación — la condición es "primer contrato + sin `User` vinculado", no "cualquier contrato nuevo" (verificar cuando la Unidad 10 exista) |

### C. Confirmación pública de contrato (Unidad 7)

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Abrir `/confirm-contract/:token` sin sesión iniciada | Carga sin pedir login — es una pantalla pública. Muestra el bloque read-only completo (Persona, Job Title, Descripción, Tipo de compensación, Monto, Frecuencia, Vigente desde, Nacionalidad, Time Off Policies con `-` si no tiene ninguna) |
| 10 | Elegir método de pago "Wire transfer" | Aparece el radio IBAN/ACH; IBAN muestra 1 campo, ACH muestra 2 (routing + account) |
| 11 | Elegir cualquier otro método de pago | Aparece un solo campo de usuario/correo, sin radio IBAN/ACH |
| 12 | Completar todo sin tildar los 2 checkboxes (contrato + Términos) | El botón "Confirm Contract" sigue deshabilitado |
| 13 | Confirmar con datos válidos | Se crea el `User` (nombre copiado del `Employee`, no re-pedido), se vincula `Employee.userId`, se guarda `countryOfResidence`, la `EmployeeCompensation` queda con `paymentMethodId`/`paymentAccountSubType`/`confirmedAt`/`confirmedIp` seteados y `paymentAccountDataEncrypted` con el dato cifrado (nunca texto plano — confirmar con una query directa que no se pueda leer el IBAN/routing/username a simple vista), la `Invitation` pasa a `accepted`, y la persona queda logueada automáticamente en `/overview` |
| 14 | Intentar reabrir el mismo link después de confirmado | Debería fallar con un error claro ("ya confirmado") — verificar, no se probó explícitamente en la ronda de desarrollo |
| 15 | Link vencido o revocado | Mismo criterio que el `accept-invite` genérico — error claro, sin crear nada |

### Al encontrar una falla

C.13 es crítica si el dato de cuenta queda en texto plano en la base (ver Unidad 8, es el corazón de
por qué existe el cifrado). B.6 es alta si la invitación apunta al lugar equivocado — dejaría a la
persona en un flujo roto (login genérico sin contrato que confirmar). El resto es alta/media según
si bloquea el flujo completo o es un detalle de UI.

---

## QA-13 — Payroll Unidad 10-21: asignación masiva, Payroll Run completo, payslip, sidebar (2026-08-07, en local únicamente — no pusheado a `staging`)

**Por qué existe esta tarea:** cierra las 21 unidades del spec. Verificado con un script de smoke
test contra la API real durante el desarrollo (lógica de negocio: exclusión, bloqueos, recálculos) y
después con una pasada de Playwright de punta a punta sobre el flujo completo (registro → contrato →
confirmación → Assignments → run → ajuste → confirmar → payslip → pago fuera de ciclo → timeline),
sin errores de consola al cierre — corrigió un warning de `key` en `PayrollRunDetailPage.tsx` en el
camino. Lo que falta es una revisión visual humana (esta tabla), no funcional: la pasada automatizada
no juzga espaciado, contraste, textos, ni casos borde de UI que un script no piensa en probar.

### A. Asignación masiva (Unidad 10) + indicadores (Unidad 11)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Tab "Assignments" de `/hr/payroll` | Lista todo Contractor/Employee con Nombre/Email/Policy actual/Status, en 3 sub-pestañas (Draft/Confirmed/Terminated) con contador |
| 2 | Seleccionar 2+ personas → "Assign/Reassign Policy" | Modal con frecuencia/fecha/tipo/moneda/job title/descripción comunes + tabla de revisión con el monto de cada persona pre-cargado (el anterior tal cual, vacío si no tenía) y editable; "Apply to all selected" sobreescribe todos los montos visibles |
| 3 | Columna "Contract" en `/hr/people` | Chip verde/neutro/rojo (Confirmed/Pending/Expired) solo para Contractor/Employee con al menos un contrato — vacío (`—`) para Profile o sin contrato nunca |
| 4 | Sub-pestaña "Terminated" de Assignments | Solo lectura — sin checkboxes ni botón "Assign/Reassign Policy"; muestra la política vieja + fecha de terminación de cada persona reasignada |
| 5 | Reasignar a alguien ya confirmado (Confirmed → nueva policy) | Sigue apareciendo en "Confirmed" (no vuelve a "Draft") — su policy anterior pasa a "Terminated" |

### B. Payroll Run (Unidades 12-17)

| # | Caso | Resultado esperado |
|---|---|---|
| 4 | Tab "Timeline" → "New Run" | Modal con select de Pay Frequency + período libre; al crear, navega directo a `/hr/payroll/runs/:id` |
| 5 | Detalle del run recién creado | Una fila por persona con contrato vigente en esa frecuencia (confirmado); nadie con contrato sin confirmar aparece, y arriba dice "N personas excluidas" si corresponde |
| 6 | Persona Fixed vs Hourly | Fixed muestra el monto directo, sin input; Hourly muestra un input de horas + "hs × tarifa = total" al lado, editable mientras el run esté en borrador |
| 7 | Botón de ajustes en una fila | Muestra solo el total (+/− monto); al hacer click expande la lista editable (tipo/monto/nota/eliminar) + form para agregar uno nuevo |
| 8 | Confirmar el run con alguna hora sin cargar | Botón deshabilitado (o falla con mensaje claro si se fuerza por API) |
| 9 | Cargar todas las horas y confirmar | Run pasa a "Confirmed"; los ajustes ya no se pueden agregar/borrar, ni las horas editar |
| 10 | Persona con status distinto al default del tenant | Banner de advertencia debajo de su fila — no bloquea nada, solo visual |
| 11 | "+ Add person to this run" con el run en borrador | Lista gente con compensación activa que todavía no está en el run; agregarla crea su fila base |

### C. Pagos únicos, timeline y payslip (Unidades 18-20)

| # | Caso | Resultado esperado |
|---|---|---|
| 12 | "One-off Payment" desde el tab Timeline | Modal con tipo/monto/moneda/fecha + checklist de personas; cada una marcada genera su propia entry independiente (sin agruparlas) |
| 13 | Tab Timeline después de crear un run y un pago único | Ambos aparecen mezclados, ordenados por fecha, con chip "Run"/"One-off" distinto |
| 14 | Ícono de payslip en una fila del run | Abre modal con el PDF embebido, etiqueta "Preview only — not sent", botón de descarga real (`.pdf`) |

### D. Sidebar (Unidad 21)

| # | Caso | Resultado esperado |
|---|---|---|
| 15 | Sidebar con un usuario `owner` | Aparece "Payroll" en el grupo Human Resources |
| 16 | Sidebar con `admin` o `member` | No aparece la entrada; si navegan a `/hr/payroll` o `/hr/payroll/runs/:id` a mano, ven "Payroll is only visible to the tenant owner." en vez de pestañas rotas |

### Al encontrar una falla

B.8/B.9 (el bloqueo de confirmación por horas sin cargar) es el corazón de la Unidad 15/17 — si
falla, es alta severidad. D.16 es alta si un no-owner logra ver datos de compensación reales. El
resto es medio/bajo salvo que rompa el flujo completo de principio a fin.

---

## QA-14 — Contrato: almacenamiento, email y reenvío (2026-08-08, en local únicamente — no pusheado a `staging`)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Crear el contrato inicial de un Contractor/Employee | El invitado recibe el email de invitación con un PDF adjunto (`contract-draft.pdf`) marcado "DRAFT — PENDING SIGNATURE" |
| 2 | "Actions" → "View contract" en el panel de detalle de esa persona, antes de confirmar | Modal con el PDF embebido + botón de descarga real; solo visible para `owner` |
| 3 | "Actions" → "Resend contract" antes de confirmar | Reenvía el mismo link de invitación (o uno nuevo si venció hace más de 7 días) con el borrador adjunto |
| 4 | Confirmar el contrato vía `/confirm-contract/:token` | El firmante recibe un email nuevo con el PDF firmado adjunto (marcado "SIGNED", con fecha/hora/IP incluidos en el documento), con copia al owner y a quien cargó el contrato |
| 5 | "View contract" después de confirmado | Muestra la versión firmada, no la borrador |
| 6 | "Resend contract" después de confirmado | Reenvía la versión firmada al firmante, con las mismas copias que el envío original |
| 7 | Rol `admin` o `member` en el panel de detalle | No ve "View contract" ni "Resend contract" (son owner-only, como el resto de Payroll) |

Severidad: si el email firmado no le llega a nadie (ni signer ni copias), o si "View contract" antes
de confirmar muestra la versión firmada (o viceversa), es alto — significa que la columna no se está
sobrescribiendo en el momento correcto.

---

## QA-15 — Ronda final pre-producción: Currency dropdown, ancho de Department, deploy (2026-08-09 — en producción)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Campo "Currency" en alta de persona / bulk assign / pago único | Dropdown con códigos ISO reales (ej. "EUR — Euro"), no texto libre |
| 2 | Campo "Department" en el modal "Add Person" | Mismo ancho que el resto de los campos del formulario (Nationality, Contract Type, etc.) |
| 3 | `app.joinnorthstack.com` — homepage, `/login`, y un endpoint de Payroll sin sesión | 200, 200, y 401 limpio (no 500) |
| 4 | Rol `admin` en un tenant real de producción | No ve "Payroll" en el sidebar (solo "People") — es owner-only a propósito, no un bug |

Sin severidad alta pendiente en esta ronda — son ajustes visuales + verificación de deploy, no lógica
de negocio nueva.

---

## QA-16 — "¿Olvidaste tu contraseña?" (2026-08-09, en producción desde 2026-08-11)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Link "Forgot your password?" en `/login` | Visible debajo del campo Password, lleva a `/forgot-password` |
| 2 | Pedir reset con un email que SÍ existe | Mensaje genérico "if an account exists…"; llega un email real con el link (expira en 1h) |
| 3 | Pedir reset con un email que NO existe | Mismo mensaje genérico, mismo status 200 — no debe distinguirse de #2 (enumeration) |
| 4 | Abrir el link recibido, poner una contraseña nueva válida | Login automático, aterriza en `/overview` |
| 5 | Cualquier sesión vieja de ese usuario (otro dispositivo/pestaña) | Deja de funcionar inmediatamente después del reset (401) |
| 6 | Login con la contraseña VIEJA después del reset | Rechazado (401) |
| 7 | Reusar el mismo link de reset una segunda vez | Rechazado (400, "ya fue usado") |
| 8 | Abrir un link de reset vencido (o esperar 1h) | Pantalla muestra el error antes de dejar escribir la contraseña, con link para pedir uno nuevo |

Severidad: si #3 alguna vez responde distinto a #2 (status, mensaje, o timing notoriamente distinto),
es un problema de seguridad (enumeration de emails) — alta. Si #5 no revoca las sesiones viejas, alta
también (una cuenta comprometida no se puede "cerrar" reseteando la contraseña).

---

## QA-17 — Admin Center: Platform Roles, Tenants, Tickets/Ideas (2026-08-11, en producción)

**Contexto:** rollout completo del roadmap en `docs/Admin-platform/` — 8 bloques, repo principal
(`northstack`, rutas `/api/platform/*`) + `northstack-devtasks` (admin.joinnorthstack.com). Verificado
programáticamente durante la implementación (sesiones de prueba creadas/borradas contra producción vía
Prisma directo, sin necesidad de contraseña real).

**Actualización 2026-08-11 (mismo día, ronda 2):** se hizo la pasada de verificación real en navegador
que había quedado pendiente (Playwright, contra `localhost` corriendo `vercel dev` con las rutas
proxeando a producción real — nunca contra datos falsos). Encontró y corrigió bugs reales que la
verificación por `curl` no detectaba: un bug de encoding donde cualquier búsqueda de 2+ palabras
devolvía cero resultados (el `+` de espacio nunca se decodificaba de vuelta al reenviar la query),
una condición de carrera en `TicketDetailModal`/`StatusSettingsTab` donde una respuesta vieja podía
pisar el estado nuevo justo después de guardar un cambio (ej. "Assign to me" parecía no hacer nada), y
`.form-group` (Subject/Description/Reply) renderizando sin ningún estilo porque esa clase nunca se
había definido en el CSS de este repo. Los checks de abajo ya reflejan ese estado corregido — quedan
como checklist para una pasada humana con tu cuenta real, no como algo todavía no probado en absoluto.

### Login y roles (`admin.joinnorthstack.com`)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Login con email/password reales de una cuenta con `platformRole: null` | Rechazado, 403 "Esta cuenta no tiene acceso a Admin Center" |
| 2 | Login con la cuenta `platform_admin` (Alejandro) | Entra, footer del nav muestra "Alejandro · Platform Admin" |
| 3 | Nav con rol `platform_admin` | Ve Tareas, Notas sueltas, Tenants, Tickets, Ideas — todo |
| 4 | Nav con un usuario `platform_support` (setear `platformRole` manualmente en un usuario de prueba) | Ve solo Tenants y Tickets; Tareas/Notas/Ideas ocultos del nav, no solo deshabilitados |
| 5 | `platform_support` intentando `GET /api/platform/statuses` directo (curl/devtools) | 403 — el Settings del catálogo es solo-admin aunque no aparezca en el nav |

### Tenants

| # | Caso | Resultado esperado |
|---|---|---|
| 6 | Tab "Activos" | Lista real de tenants activos, contador del tab coincide con la cantidad de filas |
| 7 | Cambiar de tab (Suspendidos/Cancelados) | Filtra correctamente, contador de cada tab es independiente |
| 8 | Click en un header de columna (Nombre/País/Fecha de alta/Usuarios) | Ordena, click de nuevo invierte el orden |
| 9 | Buscar por nombre o país | Filtra en vivo |
| 10 | Click en una fila | Modal con stats (estado, moneda, industria, tamaño, usuarios) + tabla de Users real de ese tenant |

### Tickets

| # | Caso | Resultado esperado |
|---|---|---|
| 11 | "+ Nuevo ticket" → buscar un tenant real, completar subject/description | Crea el ticket, abre su detalle automáticamente |
| 12 | Filtro de estado "Open (not terminal)" (default) | No muestra tickets con status `resolved`/`closed` |
| 13 | Filtro "Assigned to me" / "Unassigned" | Filtra correctamente |
| 14 | En el detalle: cambiar el estado por el dropdown | Persiste, se refleja en la lista al cerrar el modal |
| 15 | En el detalle: "Assign to me" en un ticket sin asignar | Se asigna, aparece botón "Unassign" |
| 16 | Responder un ticket que tiene reporter (`userId` no nulo) real | Se ve la respuesta en el hilo, **llega un email real** al reporter — probar con un tenant de prueba, no uno real |
| 17 | Responder un ticket sin reporter (creado por staff, `userId` null) | Se ve en el hilo, no intenta mandar ningún email (no hay a quién) |
| 18 | Settings → cambiar el label de un estado | Persiste, aparece actualizado en el dropdown del detalle |
| 19 | Settings → reordenar con las flechas ↑/↓ | El orden persiste al recargar |
| 20 | Settings → desactivar un estado que es el default | Rechazado con el mensaje "Cannot deactivate the default status" |
| 21 | Settings → desactivar un estado no-default | Pide confirmación (`confirm()` nativo), tickets existentes con ese estado no se rompen |

### Feedback → Ticket/Idea (`app.joinnorthstack.com`, producto principal)

| # | Caso | Resultado esperado |
|---|---|---|
| 22 | Menú de usuario → "Send feedback" → "Report a problem", completar subject+message | Llega el mail a `FEEDBACK_EMAIL` (como siempre) Y aparece un Ticket nuevo en Admin Center con `createdByType: 'user'` |
| 23 | Mismo flujo pero "Suggest an idea" | Se crea una `Idea`, visible en la sección Ideas de Admin Center (UI agregada 2026-08-12, ya no es placeholder) |

### Ideas (`admin.joinnorthstack.com`, agregado 2026-08-12)

| # | Caso | Resultado esperado |
|---|---|---|
| 24 | Nav "Ideas" con rol `platform_admin` | Visible; con `platform_support` no aparece (a diferencia de Tickets, Ideas es admin-only) |
| 25 | Lista de Ideas | Muestra subject/tenant/reportado por/estado/fecha, filtro de estado, búsqueda |
| 26 | Click en una idea → detalle | Subject/Description editables inline, Status editable, **sin** sección de asignado (Idea no tiene assignee) |
| 27 | Agregar una nota en el detalle de una idea | Se agrega al hilo, **nunca** dispara ningún email (a diferencia de responder un Ticket) |
| 28 | Settings de Ideas (tab dentro de la sección Ideas) | Catálogo de 5 estados (new/under_review/planned/declined/shipped) con color, reorder, rename |

**Severidad:** #1, #4, #5 y #24 son control de acceso — si fallan, cualquiera con cuenta Northstack (o
el rol equivocado) podría ver datos de otros tenants vía Admin Center, alta. #16 enviando el email al
reporter equivocado (o no enviándolo cuando debería) es media — no expone datos pero rompe la promesa
del flujo de soporte. #27 mandando un email por error en una Idea sería el mismo tipo de problema.

---

## QA-18 — Tenant Signup (verificación de email) + Subscription Plans (2026-08-13, en `staging` — no en producción todavía)

**Contexto:** reemplaza el registro de un solo paso por email → verificación por link → survey
de 3 pasos (Company/You/Security) → cuenta creada → `/overview`, con `PlansModal` (modal
descartable, no una ruta que bloquea) ofreciendo Starter/Growth/Free Trial. Trial de 15 días +
14 de gracia corridos por un cron nuevo (`/api/internal/plan-transitions/run`, Vercel Cron
diario). Verificado por Claude con `curl` de punta a punta contra la base de `staging`
(signup → verify → register → tenant en `trialing` → elegir plan → precio congelado → cron
→ `past_due`), datos de prueba borrados después — falta la pasada humana en navegador.

### Signup

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/register`, cargar un email y enviar | Pasa a "Check your inbox"; llega un email real con el link de verificación (expira en 24hs) |
| 2 | "Resend email" antes de los 30s | Botón deshabilitado con cuenta regresiva |
| 3 | "Resend email" después de los 30s | Manda un link nuevo; el anterior deja de funcionar |
| 4 | "Wrong email? Start over" | Vuelve a la pantalla de email |
| 5 | Abrir el link recibido | Va a `/register/complete?token=...`, muestra el survey (Company primero) con el email ya verificado |
| 6 | Abrir un link ya usado o vencido | Pantalla de error clara, con link para volver a `/register` |
| 7 | Completar Company → You → Security y enviar | Cuenta creada, login automático, aterriza en `/overview` |
| 8 | Dejar un campo obligatorio vacío en cualquier paso (ej. Industry) | No deja avanzar (validación nativa del form) |
| 9 | Un error del backend en el submit final (ej. nombre de empresa repetido) | Vuelve al paso correcto (Company) con el error marcado en el campo — no se pierde lo demás cargado |
| 10 | Registrar dos cuentas con el mismo dominio corporativo (no genérico) | La segunda es rechazada ("ya hay una empresa con este dominio...") |
| 11 | Registrar con un dominio genérico (gmail.com, etc.) dos veces | Ambas pasan — dominios genéricos no bloquean |

### Subscription Plans

| # | Caso | Resultado esperado |
|---|---|---|
| 12 | Owner recién registrado, primera vez en `/overview` | `PlansModal` se abre solo, automáticamente |
| 13 | Cerrar el modal (X, click afuera, o "Continue with free trial") | Se cierra, y no vuelve a aparecer al navegar a otra pantalla ni al recargar |
| 14 | Elegir "Starter" o "Growth" | Modal se cierra, precio de lanzamiento visible en algún lado (a confirmar dónde se muestra hoy — no hay pantalla de "mi plan" todavía) |
| 15 | Tenant con `companySize: 1-10` cargado en el signup | Badge "Recommended for you" en Starter |
| 16 | Tenant con `companySize: 11-50` | Badge "Recommended for you" en Growth |
| 17 | Usuario con rol `member` (no owner) en un tenant sin plan elegido | **No** ve el modal |
| 18 | Link "Get in touch" (Scale) | Abre un mailto a `info@joinnorthstack.com` |
| 19 | Contenido del modal contra el mockup aprobado | Copy, precios, features y fine print coinciden |

**Severidad:** #10 fallando (dominio duplicado no bloqueado) es alta — es el control anti-abuso
central del nuevo flujo. #17 (un member viendo/pudiendo tocar algo de billing) sería medio-alto,
aunque el backend igual lo bloquea con 403 si se fuerza la llamada. El resto son bugs de
UX/visuales, no de seguridad.

**Pendiente, no armado en esta ronda:** ningún job de recuperación de pago real (Paddle no está
integrado), ninguna pantalla de "mi plan actual" en Settings, y ningún bloqueo de acceso real
para tenants `suspended` — el estado cambia pero nada en el código restringe requests todavía.

---

## QA-19 — Google Calendar sync + cumpleaños de empleados + tareas completadas fuera del Overview (2026-08-22, en local únicamente — no pusheado a `staging` todavía)

**Contexto:** tres piezas pedidas juntas por Alejandro. (1) Sync unidireccional (Northstack →
Google) de las fechas límite de Tasks y de los Time Off aprobados hacia el Google Calendar
personal de cada usuario conectado, vía OAuth per-usuario nuevo (no existía ningún OAuth en la
app antes de esto) — las notificaciones las da el propio Google Calendar, no se construyó ningún
sistema de notificaciones in-app. (2) Campo `birthdate` nuevo en `Employee`, mostrado como evento
anual recurrente en el calendario del Overview (solo interno, no se sincroniza a Google). (3) Las
tareas completadas se excluyen server-side (no solo visualmente) de `GET /api/tasks/calendar` y
`GET /api/tasks/mine` — el registro de la tarea se conserva, solo desaparece de estas dos vistas.

Verificado por Claude contra la base de producción (ver nota abajo) con `curl` + Playwright
headless: (2) y (3) confirmados de punta a punta, incluyendo captura de pantalla del calendario
mostrando el chip 🎂 y la desaparición de la tarea completada tanto del grid como del widget "My
tasks". (1) **no pudo verificarse de punta a punta** — faltan credenciales reales de Google Cloud
(`GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI` registrado en la consola); solo
se confirmó que sin esas credenciales el endpoint `/connect` devuelve 503 de forma prolija (sin
crashear) y que el frontend lo muestra como un toast de error legible.

**Nota sobre el entorno de prueba:** `DATABASE_URL` local apunta a producción (confirmado con
Alejandro que así es como se trabaja normalmente en este proyecto, no hay base de dev separada).
Se usó un empleado de prueba ya existente ("test test") y una tarea de prueba ya existente ("3212")
para verificar, y ambos se revirtieron a su estado original (`birthdate: null`,
`completedAt: null`) después de capturar las screenshots.

### Tareas completadas fuera del Overview

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Marcar una tarea propia como completada desde "My tasks" | Desaparece de la lista inmediatamente (no solo tachada) |
| 2 | Marcar como completada una tarea con `dueDate` visible en el grid del Overview | El chip desaparece del día correspondiente en el próximo refresh |
| 3 | Ver esa misma tarea en la lista de tareas de la entidad a la que pertenece (`EntityTasksList`, ej. página de un Employee/Opportunity) | Sigue apareciendo, con su estado completado intacto — este endpoint (`GET /api/tasks?entityType&entityId`) no se tocó |
| 4 | `GET /api/tasks/calendar` y `GET /api/tasks/mine` directamente con una tarea completada de por medio | Ninguno de los dos la incluye en la respuesta |

### Cumpleaños

| # | Caso | Resultado esperado |
|---|---|---|
| 5 | Cargar un `birthdate` en un Employee desde People (tabla/detalle, campo nuevo junto a Start Date/End Date) | Se guarda y se puede editar como cualquier otro campo de fecha existente |
| 6 | Ver el Overview en el mes correspondiente | Chip rosa "🎂 Nombre A." en el día correcto |
| 7 | Cambiar de mes y volver | El chip solo aparece en el mes/día correcto, todos los años (year se ignora a propósito) |
| 8 | Loguearse como rol `member` (no HR admin) | Igual ve los cumpleaños — `GET /api/hr/employees/birthdays` está gateado por `canViewHr`, que ya incluye a `member` |

### Google Calendar (pendiente de credenciales reales para terminar de verificar)

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Ir a Settings → Profile sin Google configurado | Tarjeta "Google Calendar" visible, botón "Connect Google Calendar" |
| 10 | Click en "Connect Google Calendar" sin credenciales configuradas | Toast de error legible ("Google Calendar sync is not configured yet"), sin crash — confirmado |
| 11 | **Pendiente:** con credenciales reales, click en Connect | Redirige a la pantalla de consentimiento de Google, y tras aceptar vuelve a `/settings/profile?googleCalendarConnected=1` con un toast de éxito y el email de la cuenta conectada visible |
| 12 | **Pendiente:** crear una Task con `dueDate` asignada a un usuario conectado | Aparece un evento de un día completo en su Google Calendar real |
| 13 | **Pendiente:** completar o borrar esa Task | El evento se borra de Google Calendar |
| 14 | **Pendiente:** reasignar la Task a otra persona (conectada o no) | El evento desaparece del calendario del asignado anterior; aparece uno nuevo en el del nuevo asignado si también está conectado |
| 15 | **Pendiente:** aprobar un Time Off request | Evento de todo el rango de fechas en el Google Calendar del empleado (si tiene cuenta conectada) |
| 16 | **Pendiente:** revocar el acceso desde la propia cuenta de Google (myaccount.google.com/permissions) y volver a intentar un sync | La conexión pasa a `needsReconnect: true`, la tarjeta de Profile muestra "Access was revoked — reconnect to resume syncing" en vez de fallar silenciosamente para siempre |
| 17 | Botón "Disconnect" seguido de "Connect" de nuevo | Dispara el backfill (ver #18) — probado en staging el 23, funciona |

**Severidad:** ninguna crítica encontrada en lo verificable hoy. Los casos 11-17 son el verdadero
riesgo — el código nunca ejecutó una llamada real contra la API de Google Calendar (ni éxito ni
error real más allá de `invalid_grant` simulado en la lectura del código), así que hay que
correrlos apenas Alejandro tenga las credenciales de Google Cloud, antes de considerar esta pieza
lista para `staging`.

**Pendiente, no armado en esta ronda:** ningún reintento/backoff si Google Calendar está caído
momentáneamente (una sola llamada, se loguea el error y no se reintenta); ningún job de
reconciliación periódica (el sync es puramente reactivo a cada create/update/delete, así que un
evento borrado a mano del lado de Google no se recrea solo).

### Actualización 2026-08-23 — probado en vivo contra Google real en `staging`, 3 bugs encontrados y corregidos

Con las credenciales reales ya cargadas por Alejandro, se probó el flujo de punta a punta contra
`staging.joinnorthstack.com` y Google real (no simulado). Se encontraron y corrigieron 3 problemas
reales, todos ya en `staging`:

1. **Pantalla de consentimiento en modo "Internal"** (config de Google Cloud, no de código) — un
   Gmail personal no calificaba, tiraba `Error 403: org_internal`. Alejandro lo cambió a "External"
   + agregó su cuenta como test user.
2. **`oauth2.userinfo.get()` sin el scope de `email`** — el callback pedía el email de la cuenta
   conectada sin haber pedido permiso para leerlo, tiraba un 500 crudo (`{"error":"Something went
   wrong..."}`) en vez de redirigir con un toast de error. Encontrado leyendo el log de Vercel del
   request real. Corregido: se agregó `userinfo.email` al scope pedido, y el callback entero quedó
   envuelto en try/catch (antes un fallo ahí crasheaba sin control).
3. **Nada de lo que ya exist��a antes de conectar se sincronizaba** — el sync es reactivo (solo
   dispara en el próximo create/update/delete), así que las Tasks/Time Off ya creadas antes de la
   primera conexión nunca aparecían. Corregido con `backfillCalendarSyncForUser`, corrido una sola
   vez justo al conectar.

Además, un cambio de diseño real (no un bug) pedido por Alejandro tras probarlo: **Time Off pasó a
ser de todo el equipo, no personal** — originalmente cada Time Off aprobado solo sincronizaba al
calendario de la persona que se lo tomaba; Alejandro esperaba ver ahí el Time Off de **todo** el
equipo, igual que la vista compartida del Overview. Rediseñado: `TimeOffRequest.googleCalendarEventId`
(un campo) se reemplazó por el modelo `TimeOffCalendarSync` (una fila por cada par
request+usuario-conectado — ver `database-schema.md` grupo 9). `backfillCalendarSyncForUser`
también se actualizó para empujar **todo** el Time Off aprobado del tenant a un usuario recién
conectado, no solo el suyo propio. Tasks se mantiene personal (solo el calendario del assignee) —
Alejandro no pidió cambiar eso.

**Pendiente de re-probar** tras el rediseño de Time Off (no verificado todavía end-to-end con el
nuevo modelo): que un Time Off aprobado aparezca en el calendario de **cada** usuario conectado del
tenant (no solo uno), y que el backfill al conectar un usuario nuevo traiga el Time Off aprobado de
**otros** empleados, no solo el propio.

---

## QA-20 — Sync inverso Google → Northstack para Tasks (2026-08-23, en `staging`, pendiente de verificación real)

**Contexto:** pedido explícito de Alejandro tras probar el sync unidireccional — si edita el evento
de una Task directamente en Google Calendar, el cambio tiene que reflejarse en la Task. Alcance
acotado a propósito a Tasks (Time Off queda unidireccional, ver QA-19: al ser de todo el equipo no
hay una respuesta limpia a "quién puede editarlo de vuelta"). Mecanismo elegido por Alejandro:
notificaciones push de Google (no un cron de polling), pese a ser la opción más compleja de las
dos — más detalle de por qué en `docs/general/database-schema.md` grupo 9 y en el comentario largo
al principio de `src/modules/integrations/googleCalendarWatchService.ts`.

**No pudo verificarse de punta a punta en esta ronda**: las notificaciones push de Google no pueden
llegar a `localhost` bajo ningún concepto, así que esta pieza solo se puede probar contra
`staging`/producción, con un ida y vuelta más lento (editar en Google real, esperar, revisar en la
plataforma) que las piezas anteriores. Se verificó únicamente que las rutas nuevas no rompen nada:
`POST /api/integrations/google-calendar/webhook` responde 200 tanto sin headers como con headers
falsos que no matchean ningún canal existente (rechazo silencioso, sin crashear), y
`GET /api/internal/google-calendar-channels/renew` corre limpio localmente (0 canales para renovar,
esperado ya que la base local es producción y la conexión real de prueba vive en `staging`).

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Conectar (o reconectar) una cuenta real de Google | Se crea una fila en `GoogleCalendarWatchChannel` para ese usuario (verificar vía logs de Vercel o una query directa, no hay UI para esto todavía) |
| 2 | Crear una Task con fecha límite asignada a un usuario conectado | Aparece el evento en su Google Calendar real (comportamiento ya verificado en QA-19, no es nuevo acá) |
| 3 | Cambiarle la fecha o el título al evento directamente en Google Calendar | Al cabo de unos segundos a un par de minutos (latencia de entrega de Google, no controlable), la Task se actualiza en Northstack con el nuevo `dueDate`/`title` |
| 4 | Borrar el evento en Google Calendar | **2026-08-23 (corrección tras probar):** la Task se marca **completada** (no solo pierde la fecha) y se le agrega una nota al final de la descripción (`[Auto-completed — event deleted in Google Calendar on YYYY-MM-DD]`) para distinguir esto de un check manual. La Task sigue existiendo, nunca se borra — sigue visible en el tab de su entidad |
| 5 | Verificar que no se genera un loop: tras el caso 3, revisar que Northstack no le vuelva a mandar un PATCH innecesario a Google por el mismo cambio | El código usa `prisma.task.update` directo (no `taskService.updateTask`) específicamente para evitar este loop — confirmar en los logs que no hay un ida-y-vuelta infinito |
| 6 | Editar en Google un evento de Calendar que **no** fue creado por Northstack (no tiene `googleCalendarEventId` trackeado en ninguna Task) | No pasa nada del lado de Northstack — solo se tocan eventos que la plataforma reconoce como propios |
| 7 | Esperar (o forzar) que un canal esté por vencer y que corra el cron de renovación | El canal viejo se cierra, se abre uno nuevo, y el `syncToken` se conserva (no se pierde el cursor de sincronización) |
| 8 | Botón "Disconnect" | El canal se cierra en Google y se borra la fila local — no debería seguir recibiendo notificaciones después |

**Severidad:** no evaluable todavía — nada de esto corrió contra un webhook real de Google. Antes
de dar esta pieza por lista, correr los 8 casos de arriba contra `staging` con una cuenta real.

**Pendiente, no armado en esta ronda:** ningún límite de tamaño de payload si `events.list` trae
muchos cambios de una vez (paginación implementada pero no probada con volumen real); ningún alerta
si `renewExpiringWatchChannels` falla repetidamente para un mismo usuario (se loguea, no se
notifica a nadie).

### Actualización 2026-08-23 (misma noche) — probado en vivo con Alejandro, causa real encontrada + 2 mejoras

**El caso 1-8 de arriba SÍ se probó de punta a punta con Alejandro en `staging`**, con hallazgos
importantes que valen la pena documentar en detalle porque la causa real no tenía nada que ver con
el código de esta pieza:

1. **`events.watch()` funcionaba perfecto** (Google aceptaba el canal, devolvía `resourceId`/
   `expiration` reales — confirmado con una fila real en `GoogleCalendarWatchChannel` vía el SQL
   editor de Neon), pero **cero notificaciones llegaban nunca**, ni siquiera el handshake
   `resourceState: sync` inmediato que Google manda apenas se abre un canal.
2. Se descartaron en orden, cada uno confirmado con evidencia real antes de pasar al siguiente:
   verificación de dominio en Search Console (ya estaba verificado, se hizo de todos modos por las
   dudas — Google incluso ofreció agregar el registro DNS solo, con acceso a Cloudflare), dominios
   autorizados en la pantalla de consentimiento OAuth (`joinnorthstack.com` ya figuraba ahí).
3. **Causa real**: `staging.joinnorthstack.com` tiene activada la protección de deployment de
   Vercel, que redirige (302, a una pantalla de login de Vercel) cualquier request sin sesión de
   Vercel — incluidos los POST que Google manda al webhook. El navegador de Alejandro pasaba sin
   problema (ya tenía sesión de Vercel), por eso el resto del flujo (connect/callback/status/
   disconnect) siempre funcionó y nunca hizo sospechar de esto. Se encontró recién al confirmar que
   la tabla de requests de Vercel no tenía **ninguna** fila para `/api/integrations/google-calendar/
   webhook` — ni un intento fallido, nada — lo cual solo tiene sentido si Vercel corta el request
   antes de que llegue a nuestro código (nada que loguear del lado de la app).
4. **Fix**: `VERCEL_AUTOMATION_BYPASS_SECRET` (la función "Protection Bypass for Automation" de
   Vercel, ya existía como System Environment Variable en el proyecto) embebido como query param en
   la URL que le registramos a Google. Confirmado funcionando: caso 3 (editar el evento en Google)
   probado en vivo, la Task se actualizó en Northstack.

**Dos mejoras agregadas la misma noche, a pedido de Alejandro tras probar:**
- **Auto-refresh cada 30s en el Overview** (`OverviewPage.tsx`) — sin esto, un cambio que llega por
  webhook (o cualquier cambio de otro origen) no se veía hasta recargar la página a mano. Silencioso
  (sin skeleton de loading, sin toast de error) para no interrumpir a quien esté mirando la pantalla.
- **Tasks con hora, no solo fecha** — `TaskForm.tsx` ahora tiene un campo "Time (optional)" junto a
  la fecha. Sin hora: se mantiene el comportamiento de siempre (evento de todo el día en Google).
  Con hora: se sincroniza como evento con horario real (bloque fijo de 1h en el calendario, sin que
  eso implique que la tarea "dura" una hora — es solo el tamaño visual del bloque). El sync inverso
  (Google → Northstack) también se actualizó para preservar la hora al leer de vuelta, no solo la
  fecha. No hizo falta tocar el schema — `Task.dueDate` ya guardaba hora completa, solo faltaba
  exponerlo en el form y en la conversión hacia/desde Google.

---

## QA-21 — Sales v2, Unidad 1: gate de Company blindado en backend + `Pipeline.type` inmutable (2026-08-24, en `staging`)

**Por qué existe esta tarea:** primera unidad de `docs/tareas/specredisenosalesv2.md`. No agrega
ningún campo nuevo de negocio visible — cierra dos huecos sobre un mecanismo que ya estaba
construido desde el 2026-07-29 (`Pipeline.type`, `'lead'`/`'account'`, con una Company placeholder
creada al vuelo para leads sin empresa confirmada, ver `ContactDetailModal.tsx`): (1) el gate de
"un pipeline `account` exige una Company ya identificada" solo vivía en el frontend, así que pegarle
directo a la API lo saltaba entero; (2) `Pipeline.type` se podía cambiar después de creado desde un
`<select>` en Settings → Pipelines, pudiendo reclasificar un pipeline con Opportunities ya creadas.
Verificado de punta a punta con un script contra `staging` real (tenant de prueba creado y borrado
vía Prisma, sin necesitar contraseña de nadie): placeholder creada con `isPlaceholder: true`, 400 al
crear una Opportunity `account` con esa Company, 201 al crear una Opportunity `lead` con la misma
Company, y `type` de un pipeline sin cambiar tras un PATCH que lo intentaba. `npm run build`/`npm
test` (91/91) backend y `npm run build` frontend en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/settings/pipelines`, cualquier pipeline existente | Ya no hay un `<select>` de tipo editable junto al nombre — aparece como texto de solo lectura ("Leads"/"Account") |
| 2 | Crear un Contact sin Company, abrir su detalle → "+ Add" en Opportunities, elegir un pipeline `account`, sin asignarle Company antes | Bloqueado con el mismo toast de siempre ("This pipeline is account-only...") — comportamiento sin cambios, ya existía |
| 3 | Mismo Contact sin Company, elegir un pipeline `lead`, cargar un nombre de Company y crear la Opportunity | Se crea una Company nueva con `isPlaceholder: true` (confirmar con una query directa, no hay indicador visual todavía — eso es una unidad futura) y la Opportunity queda creada en ese pipeline |
| 4 | Con `curl`/Postman: `POST /api/opportunities` directo, `companyId` de una Company `isPlaceholder: true`, `pipelineId` de un pipeline `account` | 400, `"This pipeline requires an already-identified company — this one is still a placeholder."` — antes de esta unidad, esto pasaba sin chequeo |
| 5 | Mismo caso pero con `pipelineId` de un pipeline `lead` | 201 — sigue permitido |
| 6 | `PATCH /api/opportunities/:id` cambiando `companyId` a una Company placeholder, en una Opportunity que ya vive en un pipeline `account` | 400, mismo mensaje que el caso 4 — el gate también corre en update, no solo en create |
| 7 | `PATCH /api/pipelines/:id` con `{ "type": "account" }` sobre un pipeline `lead` existente (curl directo, sin pasar por la UI) | 200, pero el `type` de la respuesta sigue siendo `"lead"` — el campo se ignora en vez de rechazar con error, para no romper un PATCH que además cambia `name`/`order`/`isActive` en el mismo request |
| 8 | Regresión: flujo normal de alta de Company desde `/companies` (no desde un Contact) | La Company creada tiene `isPlaceholder: false` — el flag nunca se filtra a ningún otro punto de creación |

**Severidad:** el caso 4 es el corazón de esta unidad — si un pipeline `account` termina con una
Company placeholder colgada (por saltear el frontend), es alta severidad, mismo criterio que
cualquier gap de validación server-side. El resto es media/baja salvo regresión funcional real.

---

## QA-22 — Sales v2, Unidad 2: jerarquía de Company (2026-08-24, en `staging`)

**Por qué existe esta tarea:** `Company.parentCompanyId` nuevo (matriz/sucursal, un nivel,
autoreferencial), con anti-ciclo, borrado que desvincula por default (o cascadea si se pide), y una
sección "Hierarchy" nueva en el detalle de Company. De paso se confirmó que el tab de Contacts en el
detalle de Company (que la spec original marcaba como pendiente) ya existía — nada que verificar ahí,
sigue funcionando igual que siempre. Verificado con un script contra `staging` real (2 tenants de
prueba): parent seteado con nombre correcto, ciclo de 2 pasos rechazado, self-reference rechazado,
Company de otro tenant rechazada como parent, delete sin cascada desvincula, delete con cascada borra
la hija. `npm run build`/`npm test` (91/91) backend y build frontend en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/companies`, abrir el detalle de cualquier Company | Nueva sección "Hierarchy" — selector "Parent company" (buscador tipo autocomplete) |
| 2 | Elegir otra Company del tenant como parent | Se guarda al elegir (autosave, sin botón Save); si la Company elegida tiene un padre a su vez, no aparece en la lista de opciones para ninguna de sus propias descendientes |
| 3 | Con un parent ya asignado | Aparece un link "Open →" al lado del selector — click navega al detalle de esa Company (cierra este modal, abre el otro) |
| 4 | Una Company con hijas asignadas | Sección "Associated companies (N)" debajo del selector, cada nombre es clickeable y navega al detalle de esa hija |
| 5 | Intentar armar un ciclo (A es padre de B, después intentar que B sea padre de A) desde la UI | La Company que crearía el ciclo no debería ni aparecer como opción en el selector (excluida client-side); si se fuerza por API, 400 |
| 6 | Borrar una Company que tiene hijas asignadas, **sin** tildar el checkbox nuevo | Las hijas quedan intactas, solo pierden el parent (visible en su propia sección Hierarchy después) |
| 7 | Borrar una Company con hijas **y** Opportunities vinculadas | El `ConfirmDialog` muestra **dos** checkboxes independientes (uno por cada cascada) — tildar uno no afecta al otro |
| 8 | Borrar con el checkbox de hijas tildado | Las hijas (y las hijas de las hijas, si las tuvieran) se borran también, no solo se desvinculan |
| 9 | Regresión: cualquier otro `ConfirmDialog` de un solo checkbox en la app (ej. borrar un Employee con Opportunities, archivar un Pipeline) | Sigue viéndose y funcionando igual que siempre — la extensión de `ConfirmDialog` es aditiva, no debería haber cambiado nada visual en los casos de un solo checkbox |
| 10 | Detalle de cualquier Company (regresión) | La sección "Contacts (N)" sigue funcionando exactamente igual que antes — no se tocó |

**Severidad:** el caso 5 (ciclo) es alta si se logra crear de verdad — dejaría el árbol de
jerarquía en un estado irrecuperable por la UI normal (loop infinito si algo intentara caminar la
cadena). El caso 9 (regresión de ConfirmDialog) es alta si algo rompió — es un componente compartido
por casi toda la app.

---

## Próximas tareas de QA (a definir)

Cuando se construyan los módulos grandes en curso (rediseño de Clients, Payroll), esta tabla de
casos va a necesitar extenderse con sus endpoints nuevos — no asumir que quedan cubiertos por los
casos de Employee/Client de arriba.

---

## QA-23 — Sales v2, Unidad 3: isPrimary único, soft-delete de Contact/Opportunity, multi-threading (2026-08-24, en `staging`)

**Por qué existe esta tarea:** tres piezas chicas del mismo grupo. (1) `isPrimary` de Contact ahora
es único por Company (crear/editar un 2do primary demueve al anterior). (2) "Delete" de Contact pasa
a "Deactivate" — nunca borra de verdad; si el Contact era el único vínculo activo de una Opportunity,
la Opportunity se desactiva también, si no, solo se desvincula. (3) Badge ámbar en el Kanban de
Opportunity para deals con un solo Contact vinculado + métrica nueva en `scripts/metrics-report.ts`.
Verificado con un script contra `staging` real (9 casos, un tenant de prueba). `npm run build`/`npm
test` (91/91) backend y build frontend en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Marcar un Contact como "Primary" cuando otro Contact de la misma Company ya lo era | El anterior deja de ser primary automáticamente — solo uno a la vez por Company |
| 2 | Marcar como Primary un Contact **sin** Company asignada | Se guarda igual, sin afectar el primary de ninguna Company real |
| 3 | `/contacts`, ícono de la fila (antes "Delete", ahora "Deactivate") | El tooltip dice "Deactivate"; el `ConfirmDialog` ya no tiene checkbox — el texto explica qué va a pasar (nada se borra) |
| 4 | Desactivar un Contact que es el **único** vinculado a una Opportunity | La Opportunity también queda desactivada — confirmar que desaparece de `/opportunities` (Kanban) pero sigue existiendo (query directa) |
| 5 | Desactivar un Contact que comparte una Opportunity con otro Contact activo | La Opportunity sigue activa/visible; el Contact desactivado desaparece de su lista de "Contacts involucrados", el otro sigue ahí |
| 6 | `/contacts` después de desactivar alguno | El Contact desactivado ya no aparece en la tabla — no hay (todavía) forma de verlo/reactivarlo desde la UI, es un gap conocido y aceptado por ahora |
| 7 | `/opportunities`, Kanban, cualquier deal con un solo Contact vinculado | Badge ámbar chico "1 contact" en la esquina inferior de la card; con 2+ Contacts no aparece |
| 8 | `npx tsx scripts/metrics-report.ts` (o revisar el output de una corrida) | Sección nueva "Sales: multi-threading" con % de Opportunities abiertas de 1 solo Contact vs. 2+ |
| 9 | Regresión: Employee/Company/Client — cualquier botón de "Delete" existente en esos módulos | Sigue siendo borrado real, sin cambios — este patrón no se tocó fuera de Contact/Opportunity |

**Severidad:** el caso 4 (desactivar el contacto único de una Opportunity) es el corazón de esta
unidad — si la Opportunity no se desactiva junto con su único Contact, o si se desactiva quedando
huérfana de forma incorrecta cuando hay otros Contacts, es alta. El caso 9 (regresión fuera de
Contact/Opportunity) es alta si algo cambió ahí — el alcance de esta unidad es explícitamente
acotado.

## QA-24 — Sales v2, Unidad 4: cambio de Pipeline + gate de Company real + oferta de mover un lead ganado (2026-08-24, en `staging`)

**Por qué existe esta tarea:** dos piezas relacionadas (spec §3.3 + §3.6). (1) `updateOpportunity`
ahora acepta reasignar `pipelineId` — resetea `stageId` al primer stage activo del pipeline destino
(el `stageId` que venga en el mismo body se ignora si el pipeline cambió), y rechaza el cambio si el
pipeline destino no tiene ningún stage activo. (2) El gate de "no se puede mover una Opportunity a un
pipeline `account` si su Company sigue siendo un placeholder" (ya existía para cambios de `companyId`
desde la Unidad 1) ahora también corre en una reasignación de `pipelineId` pura — antes de esta unidad
ese camino no se chequeaba. En el frontend, `OpportunityDetailModal.tsx` gana un selector de Pipeline
+ un formulario inline para completar los datos reales de la Company cuando el gate bloquea el cambio,
y un banner "Move to account pipeline?" que aparece solo cuando la Opportunity está en un stage `won`
de un pipeline `lead` — tanto al cambiar de stage dentro del modal como al abrirlo ya en ese estado
(incluye el caso de un drag-and-drop ganador en el Kanban de `OpportunitiesPage.tsx`, que ahora abre el
detail modal automáticamente en ese caso). Verificado con un script contra `staging` real (tenant +
pipelines + companies + opportunity de punta a punta vía HTTP, todo descartado al final). `npm run
build`/`npm test` (91/91) backend y build frontend en verde — sin cambios de schema en esta unidad.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Opportunity en pipeline `lead`, Company todavía placeholder → cambiar el selector "Pipeline" del detail modal a un pipeline `account` | Aparece el formulario inline "Confirm company details to move pipeline" en vez de guardar directo; la Opportunity no se mueve hasta completarlo |
| 2 | Completar el formulario inline (industry/website/phone) y confirmar "Confirm & Move" | La Company pasa a `isPlaceholder: false` con esos datos, y la Opportunity se mueve al pipeline elegido en la misma operación — verificar que el `stageId` resultante es el primer stage activo del pipeline destino |
| 3 | Repetir el caso 1 pero pegándole directo a la API (`PATCH /api/opportunities/:id` con solo `pipelineId`, sin tocar `companyId`) | 400 con mensaje sobre placeholder — antes de esta unidad este camino no estaba cubierto y el cambio pasaba igual |
| 4 | Company ya real (`isPlaceholder: false`) → cambiar de pipeline a uno `account` | Se mueve directo, sin pedir nada extra |
| 5 | Cambiar a un pipeline `type: 'lead'` con Company placeholder | Nunca bloquea — el gate solo aplica para pipelines `account` |
| 6 | Mover una Opportunity a un pipeline sin ningún stage activo | La operación falla (error genérico del servidor, no un 400 dedicado — ver nota en la spec §3.6) y la Opportunity no cambia de pipeline |
| 7 | Dentro del detail modal, cambiar el Stage de una Opportunity en un pipeline `lead` a un stage `won` | Aparece el banner "Move to account pipeline?" con un selector de pipelines `account` activos; "Not now" lo descarta sin guardar nada, "Move" dispara el mismo mecanismo del caso 1/2 |
| 8 | Kanban de `/opportunities`: arrastrar una card de un pipeline `lead` a una columna `won` | El detail modal de esa Opportunity se abre automáticamente mostrando el banner del caso 7 — no hace falta abrirlo a mano |
| 9 | Arrastrar una card a un stage `won` dentro de un pipeline `account` (no `lead`) | No pasa nada especial — ni se abre el modal automáticamente ni aparece el banner, es terminal |
| 10 | Regresión: cambiar solo el Stage (sin tocar Pipeline) de una Opportunity que no aterriza en `won`, o que está en un pipeline `account` | Comportamiento sin cambios respecto a antes de esta unidad |

**Severidad:** el caso 3 es el corazón real de esta unidad — es el gap concreto que existía antes (el
gate solo cubría `companyId`, no `pipelineId`) y si se rompe, vuelve a ser posible mover una
Opportunity a un pipeline `account` con una Company sin identificar todavía, salteando la razón de ser
de todo el mecanismo de placeholder. Los casos 2 y 6 (reseteo de `stageId` server-computed y rechazo
sin stages activos) son altos porque dejan a la Opportunity en un estado inconsistente (stage que no
pertenece a su pipeline) si fallan silenciosamente.

## QA-25 — Sales v2, Unidad 5: UI de creación de Opportunity contextual — pipelines filtrados por tipo (2026-08-24, en `staging`)

**Por qué existe esta tarea:** dos piezas del mismo punto (spec §3.4), 100% frontend — no se agregó
ningún endpoint nuevo, solo se reordenó cómo el frontend usa los que ya existían. (1)
`CompanyDetailModal.tsx`'s "Agregar Opportunity" ahora filtra el selector de Pipeline a solo `type:
'account'` (antes mostraba todos, incluyendo `lead`, algo que no tenía sentido para una Company ya
identificada) y suma un selector opcional de Contact acotado a los ya vinculados a esa Company. (2) El
"Add Opportunity" genérico de `/opportunities` (sin partir de un perfil) ahora pide Pipeline primero y
según su `type` muestra el buscador de Company existente (`account`) o el flujo de Contact +
Company-placeholder (`lead`, mismo patrón que `ContactDetailModal.tsx` pero generalizado). **Importante:
esta unidad no se pudo probar visualmente en navegador** — no hay herramienta de automatización de
navegador en este entorno. Se verificó contra `staging` real replicando por HTTP la secuencia exacta de
llamadas de cada rama del frontend, más una revisión manual del JSX (renderizado condicional, atributos
`required` nativos). `npm run build` (backend y frontend) en verde — sin cambios de schema ni de tests
backend en esta unidad (91/91 sigue en verde, sin tests nuevos porque no hay lógica de servidor nueva).

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `CompanyDetailModal.tsx`, "Agregar Opportunity", selector de Pipeline | Solo aparecen pipelines `type: 'account'` activos — ningún `lead` en la lista |
| 2 | Mismo formulario, sin pipelines `account` activos en el tenant | El selector muestra "No active account pipelines" y el botón "Create opportunity" queda deshabilitado (sigue atado a `!newOppPipelineId`) |
| 3 | Mismo formulario, elegir un Contact del selector opcional antes de crear | La Opportunity creada queda con ese Contact vinculado (`GET .../contacts` o el detail modal lo muestra) |
| 4 | `/opportunities`, "Add Opportunity", elegir un pipeline `lead` | Desaparece el selector de Company; aparecen "Contact" (existente) + campos de contacto nuevo + "Company name" |
| 5 | Mismo caso, elegir un Contact existente que **ya tiene** Company | El campo "Company name" desaparece — no hace falta, se va a reusar la Company de ese Contact directamente |
| 6 | Mismo caso, dejar "Contact" vacío y completar los 3 campos de contacto nuevo + "Company name" | Al crear: nuevo Contact + nueva Company placeholder (`isPlaceholder: true`) + Opportunity vinculando ambos, todo en la secuencia correcta |
| 7 | Mismo formulario, cambiar de un pipeline `account` (con Company ya elegida) a uno `lead` | Los campos del tipo anterior (Company elegida) se limpian — no queda un `companyId` viejo colgado que no aplica al nuevo tipo |
| 8 | Mismo formulario, pipeline `account`, selector de Company | Solo aparecen Companies con `isPlaceholder: false` — evita elegir una que el backend rechazaría igual |
| 9 | Regresión: pegarle directo a la API creando una Opportunity con una Company placeholder en un pipeline `account` | Sigue bloqueado con 400 — el filtro del paso 8 es solo cosmético, la garantía real sigue siendo el gate del backend (Unidad 1/4) |

**Severidad:** media — es una mejora de UX/consistencia (evitar ofrecer combinaciones que el backend ya
rechazaba), no un gate de seguridad nuevo; el caso 9 es el que confirma que no se debilitó nada real. La
falta de prueba visual en navegador es la mayor incertidumbre de esta unidad — si algo se rompe en el
renderizado condicional (por ejemplo, un campo que no aparece cuando debería), no quedaría capturado por
esta verificación y solo se vería al usarlo en la UI real.

## QA-26 — Sales v2, Unidad 6: forecast ponderado + cierre simétrico Won/Lost (2026-08-24, en `staging`)

**Por qué existe esta tarea:** dos piezas independientes del mismo build-order step (spec §3.5 + §3.7).
(1) `PipelineStageDefinition.probability` (0-100, forzado a 100/won y 0/lost en backend, editable por
tenant solo para stages `open`) alimenta un cálculo de pipeline value ponderado (`Σ amount ×
probability/100` sobre deals abiertos) que reemplaza la suma simple en el header de `/opportunities` y en
el subtotal por stage del Kanban. (2) `winReasonId`/`closeNote` en Opportunity, simétricos a
`lossReasonId` ya existente — obligatorio a nivel de aplicación al mover a un stage `won`. **Descubrimiento
importante durante la implementación**: ni `lossReason` ni `leadSource` tenían ninguna UI para que el
tenant creara nuevas opciones de catálogo — solo se podían leer. Replicar `winReasonId` tal cual iba a
dejar a todo tenant sin forma de cerrar ningún deal como Won (ver la decisión documentada en
`specredisenosalesv2.md` §3.7). Se agregó un menú "add option" (reusando `FieldCatalogMenu.tsx`) junto a
ambos selects en `OpportunityDetailModal.tsx`, arreglando el gap para los dos catálogos. Verificado contra
`staging` real de punta a punta vía HTTP (seed formula del tenant-registration, ad-hoc stage add, edición
de probability, gate de winReasonId, gate de lossReason sigue intacto, catálogo de la kind equivocada
rechazado). `npm run build`/`npm test` (91/91) backend y build frontend en verde. Schema aditivo pusheado
a staging (`probability` con default, `winReasonId`/`closeNote` nullable, enum `winReason` agregado — sin
paso destructivo).

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Tenant nuevo, pipelines "Leads"/"Clientes" recién sembrados | Stages `New`=10%, `In Progress`=80%, `Won`=100%, `Lost`=0% |
| 2 | `/settings` → Pipelines, agregar un stage nuevo `open` a mano ("Add Stage") | Nace con 50% (no hay N conocido de antemano para interpolar) |
| 3 | Mismo lugar, cambiar el outcome de un stage a `won` o `lost` | El campo de probabilidad deja de ser editable y muestra 100%/0% fijo |
| 4 | Intentar mandar `probability` fuera de 0-100 directo a la API | 400 |
| 5 | `/opportunities`, header del pipeline activo | Muestra "Weighted value: ..." — suma ponderada de los deals abiertos, no la suma simple |
| 6 | Kanban, subtotal de una columna `open` vs. una columna `won`/`lost` | La columna `open` muestra el monto ponderado por la probabilidad del stage; `won`/`lost` muestran el monto real sin ponderar (evita mostrar $0 en Lost) |
| 7 | Mover una Opportunity a un stage `won` sin elegir Win Reason | Bloqueado — mismo mensaje de error que ya existía para Lost sin Loss Reason |
| 8 | Confirmar el cierre con Win Reason + Close Note | Se guardan ambos; el Close Note también funciona en un cierre Lost |
| 9 | `OpportunityDetailModal.tsx`, selects de Loss/Win Reason | Cada uno tiene un menú "..." al lado para agregar una opción nueva sin salir del modal — antes no existía ningún camino para esto |
| 10 | Regresión: `GET /api/field-catalog?kind=winReason` | 200, no 400 — el bug ya conocido de olvidar actualizar `VALID_CATALOG_KINDS` (documentado en la spec) no se repitió |
| 11 | Regresión: mover a Lost sin Loss Reason | Sigue bloqueado igual que antes de esta unidad |

**Severidad:** alta en el caso 9 — sin eso, la Unidad 6 completa habría sido inutilizable en producción
(ningún tenant puede cerrar un deal como Won sin al menos una opción de Win Reason, y no había forma de
crear una). El caso 6 es media — mostrar $0 en una columna Lost habría sido confuso pero no habría roto
ningún flujo. El resto son verificaciones de correctitud estándar del gate simétrico.

## QA-27 — Sales v2, Unidad 7: notificaciones in-app, versión mínima (2026-08-24, en `staging`)

**Por qué existe esta tarea:** la base de plomería para notificaciones (spec §3.9) — modelo
`Notification` (destinatario, tipo, entidad genérica, mensaje pre-renderizado, leído/no leído),
endpoints de listado/contador/marcar-leída, y el bell icon en la barra superior con polling cada 30s.
**Importante:** esta unidad no incluye ningún productor real — nada dispara todavía una notificación de
verdad (eso es la Unidad 8, `opportunity_stage_changed` al cambiar de stage). El bell icon queda
funcional pero en cero hasta entonces, tal como lo anticipa el orden de build de la spec. Se verificó
sembrando filas de `Notification` directamente vía Prisma (simulando al futuro productor) contra
`staging` real, ejercitando los 4 endpoints de punta a punta con dos Users del mismo tenant para
confirmar el aislamiento por destinatario. De paso, se liberó el ícono de campana (antes usado por
"What's new") para las notificaciones reales, dándole a "What's new" un ícono nuevo (`SparklesIcon`).
`npm run build`/`npm test` (91/91) backend y build frontend en verde. Schema aditivo pusheado a staging
(tabla nueva + enum nuevo, sin tocar nada existente).

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Tenant nuevo, sin notificaciones | `GET /api/notifications` devuelve `[]`, `unread-count` devuelve `0` |
| 2 | Sembrar 3 notificaciones para un User y 1 para otro User del mismo tenant | Cada User solo ve las suyas al listar — nunca las del otro, aunque compartan tenant |
| 3 | Marcar una notificación individual como leída | El contador de no leídas baja en 1; la fila queda `read: true` |
| 4 | Intentar marcar como leída una notificación de **otro** User (id real, pero no tuyo) | Rechazado — el ownership check es por `userId`, no solo `tenantId` |
| 5 | Intentar marcar como leída un id que no existe | 404 |
| 6 | "Mark all read" | Todas las no leídas del User pasan a `read: true`, contador queda en 0 |
| 7 | Barra superior: ícono de campana | Es el `BellIcon`; el contador de no leídas aparece como badge numérico cuando hay alguna |
| 8 | Barra superior: ícono junto al de notificaciones ("What's new") | Ahora es un ícono distinto (chispas), ya no comparte la campana con notificaciones |
| 9 | Abrir el dropdown de notificaciones sin ninguna sembrada | Muestra "No notifications yet." — no queda vacío/roto |

**Severidad:** baja — esta unidad es infraestructura sin productor real todavía, así que ningún flujo de
negocio depende de ella hasta que la Unidad 8 la conecte. El caso 4 (ownership por destinatario, no solo
tenant) es el más importante de esta ronda — una fuga ahí dejaría a un User leer/marcar notificaciones
de un compañero de tenant.

## QA-28 — Fix: pantalla de Pipelines en Settings, hallazgo del usuario al revisar staging (2026-08-25)

**Por qué existe esta tarea:** Alejandro revisó visualmente `/settings` → Pipelines (no es parte de
ninguna Unidad de la spec, preexistente) y encontró tres problemas en el alta de un Pipeline nuevo: (1)
usaba `SlideOver` (panel lateral) en vez de `Modal` (centrado) — inconsistente con el resto de los "Add
X" del sistema (Opportunities/Companies/Contacts/Employees, todos usan `Modal`); (2) el alta de stages no
permitía asignar `probability` (el "value" del stage, spec §3.5) — solo estaba disponible al editar un
Pipeline ya creado; (3) el selector Won/Open/Lost no explicaba qué implica cada opción. Se corrigieron los
tres: `PipelinesSettingsPage.tsx` ahora usa `Modal wide`, el alta de stages tiene el mismo input de
probability que la vista expandida (default 50%, forzado a 100/0 para won/lost), y se agregó una línea de
ayuda explicando Open/Won/Lost tanto en el alta como en la vista expandida. Ningún cambio de schema — solo
frontend. `npm run build`/`npm test` (91/91) backend y build frontend en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/settings` → Pipelines → "New Pipeline" | Se abre un modal centrado con overlay, no un panel lateral |
| 2 | Mismo modal, agregar un stage con outcome `Open` | Aparece un input numérico de probability (0-100), default 50 |
| 3 | Mismo modal, cambiar el outcome de un stage a `Won` o `Lost` | El input de probability desaparece, se muestra 100%/0% fijo como texto |
| 4 | Crear el pipeline con esos stages | Los stages nacen con la probability indicada (o forzada a 100/0) — verificar en la vista expandida del pipeline ya creado |
| 5 | Alta y vista expandida de un pipeline existente | Ambas muestran la misma línea de ayuda explicando qué hace cada outcome |

**Severidad:** baja — es un fix de UX/consistencia sobre una pantalla de Settings, no afecta ningún gate
de negocio ni dato existente.

## QA-29 — Fix: Pipelines settings como tabla columnar + auditoría (creado/editado por) (2026-08-25)

**Por qué existe esta tarea:** siguiendo la revisión de QA-28, Alejandro pidió tres cosas más sobre la
misma pantalla: (1) que se distinga Lead vs Account de un vistazo — antes era texto plano fácil de pasar
por alto; (2) formato columnar con headers, sorteable; (3) fecha de creación/última edición y usuario
que creó/editó cada Pipeline. Los puntos (1) y (2) eran solo de frontend. El punto (3) necesitó schema
nuevo — `Pipeline` no rastreaba quién la creó/editó, solo `createdAt` (sin `updatedAt` siquiera). Se
agregó `Pipeline.updatedAt` (`@updatedAt`, con `@default(now())` porque había 155 filas existentes sin
valor — sin ese default `db push` lo hubiera rechazado por requerir un paso destructivo),
`Pipeline.createdById`/`updatedById` (ambos FK a `User`, nullable — no hay forma de reconstruir quién
creó un Pipeline que ya existía, incluidos los dos que se siembran en cada registro de tenant nuevo).
`createPipeline`/`updatePipeline` ahora reciben el id del User autenticado y lo persisten; `updatePipeline`
lo requiere siempre (no es opcional como el resto de sus campos). El listado de Pipelines pasó de tarjetas
apiladas a una tabla real (`<table className="table full-table">`, mismo patrón que usan
Companies/Contacts/Employees) con columnas Type/Name/Stages/Created/Updated ordenables por click, Type
como chip de color fijo (violeta=Lead, verde azulado=Account, no hasheado — para que el color sea siempre
el mismo), y la fila se sigue pudiendo expandir para editar sus stages (ahora dentro de una fila de tabla
con colSpan, mismo contenido que antes). Verificado contra staging real (crear pipeline → createdBy/
updatedBy = el usuario que lo creó; el pipeline default sembrado en el registro del tenant tiene ambos en
null, sin romper; renombrar → updatedAt avanza y updatedBy se actualiza, createdBy no cambia). `npm run
build`/`npm test` (91/91) backend y build frontend en verde. Schema aditivo pusheado a staging.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/settings` → Pipelines | Ahora es una tabla con headers: Type, Name, Stages, Created, Updated |
| 2 | Columna Type | Chip de color relleno (no solo texto) — Lead y Account siempre con el mismo color cada uno |
| 3 | Click en cualquier header ordenable | Ordena la tabla por esa columna; un segundo click invierte el orden |
| 4 | Columnas Created/Updated | Muestran fecha + nombre del usuario, o "—" si no hay dato (pipelines viejos, sembrados antes de este fix) |
| 5 | Crear un Pipeline nuevo | Created y Updated muestran la fecha de hoy y tu propio nombre en ambas |
| 6 | Renombrar o archivar/reactivar un Pipeline existente | La columna Updated cambia (fecha + tu nombre); Created no se toca |
| 7 | Click en la fila (fuera de los botones de acción) | Sigue expandiendo/colapsando la edición de stages, igual que antes |
| 8 | Click en "Rename" o "Archive/Reactivate" | No dispara el expand/collapse de la fila (el click no se propaga) |

**Severidad:** baja — mejora de UX/auditoría sobre una pantalla de Settings, sin gate de negocio
involucrado. El caso 8 es el más fácil de romper sin querer (un evento de click mal delegado) — vale la
pena confirmarlo primero al probar.

## QA-30 — Fix: menú "..." en vez de click-to-expand + edición de Pipeline en el modal (2026-08-25)

**Por qué existe esta tarea:** siguiente ronda de feedback sobre la misma pantalla (reemplaza el
comportamiento de "click en la fila expande stages" de QA-29, casos 7-8, que ya no existe). Alejandro
pidió reemplazar el lápiz (rename) + botón Archive al final de la fila por un menú "..." con las opciones
Edit/Archive, y que "Edit" abra el mismo modal que "New Pipeline" mostrando los datos de esa Pipeline —
tanto el nombre como sus stages se editan ahí, no inline en la tabla. Sin cambios de schema ni backend,
solo `PipelinesSettingsPage.tsx`. La fila ahora es plana (sin fila-hija expandible): Type/Name/Stages/
Created/Updated + una columna final con el trigger "...". El menú "..." reusa el mismo patrón de Popover
que ya existía en `TimeOffOverviewPage.tsx` (un solo Popover compartido, anclado dinámicamente a la fila
que se clickeó). El modal ahora tiene dos modos: Create (sin cambios respecto a QA-28/29 — nombre + type
+ stages en borrador, todo se crea junto al hacer Save) y Edit (nombre editable con auto-save al perder
foco, mismo patrón que el rename anterior; Type se muestra de solo lectura, con el mismo tooltip de
"no se puede cambiar"; y el editor de stages — que antes vivía en la fila expandida — se movió tal cual
adentro del modal, sin cambiar su comportamiento: cada campo de cada stage sigue guardando al instante
igual que antes, no hay un botón "Save" separado para los stages). El botón del footer en modo Edit es
solo "Done" (cierra el modal) porque no hay nada pendiente de guardar — todo ya se guardó solo.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `/settings` → Pipelines, fila de un Pipeline | Ya no hay lápiz ni botón Archive visibles — solo un ícono de "..." al final de la fila |
| 2 | Click en "..." | Abre un menú con "Edit" y "Archive" (o "Reactivate" si está archivado) |
| 3 | Click en la fila fuera del botón "..." | Ya no pasa nada — no hay más expand/collapse inline |
| 4 | Menú "...", elegir "Edit" | Abre el modal titulado "Edit Pipeline", con el nombre actual precargado y el editor de stages debajo |
| 5 | Mismo modal, cambiar el nombre y hacer click afuera del campo (blur) | Se guarda solo — no hace falta tocar "Done" para que el nombre se guarde |
| 6 | Mismo modal, campo Type | Solo texto, de solo lectura, con tooltip explicando que no se puede cambiar |
| 7 | Mismo modal, editar/agregar/archivar un stage | Mismo comportamiento de siempre (auto-save por campo) — ahora ocurre adentro del modal en vez de en la fila expandida |
| 8 | Botón "Done" del modal en modo Edit | Solo cierra el modal — no hay ninguna acción de guardado pendiente atada a ese botón |
| 9 | Menú "...", elegir "Archive"/"Reactivate" | Mismo diálogo de confirmación que ya existía, sin cambios |
| 10 | Crear un Pipeline nuevo ("New Pipeline") | Sigue funcionando exactamente igual que en QA-28/29 — este flujo no se tocó |

**Severidad:** baja — reorganización de UX sobre una pantalla de Settings. El caso 5 es el más fácil de
pasar por alto (¿el auto-save del nombre sigue andando después de mover el input al modal?) — confirmarlo
primero.

## QA-31 — Fix: reordenar stages por drag-and-drop en vez de flechas ▲▼ (2026-08-25)

**Por qué existe esta tarea:** siguiente ronda de feedback sobre el editor de stages (dentro del modal
Edit desde QA-30). Alejandro pidió reemplazar los botones ▲/▼ por el grip de 6 puntitos + drag-and-drop,
mismo patrón que ya usa `FieldCatalogMenu.tsx` para reordenar opciones de catálogo (Loss/Win Reason,
Department, etc. — ver Unidad 6). Se reusó ese patrón tal cual: arrastrar el grip de un stage sobre otro
reordena la lista completa localmente y persiste el nuevo `order` de cada stage que cambió (mismo
mecanismo que ya tenían las flechas, solo cambia cómo se dispara). Sin cambios de backend/schema — el
endpoint `PATCH /api/pipelines/:id/stages/:stageId` con `{ order }` ya existía y no se tocó. Solo
frontend: `PipelinesSettingsPage.tsx`. `npm run build` (backend y frontend) y `npm test` (91/91) en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Modal Edit de un Pipeline con 2+ stages | Cada stage tiene un ícono de 6 puntitos a la izquierda (donde antes estaban las flechas ▲/▼) |
| 2 | Arrastrar el grip de un stage y soltarlo sobre otro | La lista se reordena; el stage soltado queda en la posición del que recibió el drop |
| 3 | Mientras se arrastra | El stage arrastrado se ve semi-transparente; el stage sobre el que está encima muestra un borde superior de color |
| 4 | Soltar un stage sobre sí mismo, o arrastrar y soltar fuera de cualquier fila | No hace nada — no llama a la API sin necesidad |
| 5 | Reordenar y volver a abrir el modal (cerrar y re-abrir Edit) | El nuevo orden persiste — quedó guardado en el backend, no es solo un reorder visual |

**Severidad:** baja — mejora de interacción sobre un editor de Settings, sin gate de negocio ni cambio de
datos involucrado más allá del campo `order` que ya se movía con las flechas.

## QA-32 — Fix: "refresh" al arrastrar stages + desalineación de columnas + ícono de Archive (2026-08-25)

**Por qué existe esta tarea:** tres problemas reportados al probar el drag-and-drop de QA-31. (1) Al
arrastrar un stage, la pantalla hacía algo parecido a un refresh — molesto. Causa real: el estado del
drag (`draggedStageId`/`dragOverStageId`) vivía en `PipelinesSettingsPage` (el componente de la página
completa), así que cada evento `dragover` — que dispara docenas de veces por segundo mientras se mueve
el mouse — re-renderizaba la página entera, incluyendo la tabla completa de Pipelines que sigue montada
debajo del modal aunque no se vea. Fix real, no cosmético: se extrajo el editor de stages a un componente
de React separado (`StageEditor`), con su propio estado local — ahora un evento de drag solo re-renderiza
ese subárbol chico, no la tabla entera. (2) "Stage Name"/"Outcome"/"Win %" quedaron desalineados respecto
a los datos de la fila — causa: el ancho del espaciador del header (adivinado en 20px) no coincidía con
el ancho real que ocupa el ícono de grip. Fix: mismo valor exacto (`STAGE_GRIP_COLUMN_WIDTH = 24`) fijado
tanto en el header como en el propio grip, para que no puedan desalinearse de nuevo por casualidad. (3) El
botón "Archive"/"Reactivate" de cada stage pasó de texto a un ícono (ojo abierto = activo, click archiva;
ojo tachado = archivado, click reactiva), con tooltip. Sin cambios de backend — todo en
`PipelinesSettingsPage.tsx`. `npm run build` (backend y frontend) y `npm test` (91/91) en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Modal Edit, arrastrar un stage | Ya no hay parpadeo/refresh visible de la pantalla — el drag se siente fluido |
| 2 | Header "Stage name / Outcome / Win %" vs. los datos de cada fila | Alineados exactamente, sin importar cuántos stages haya |
| 3 | Columna final de cada stage | Un solo ícono (ojo o ojo tachado) en vez del botón de texto "Archive"/"Reactivate" |
| 4 | Hover sobre ese ícono | Tooltip dice "Archive" o "Reactivate" según corresponda |
| 5 | Click en el ícono | Mismo comportamiento de siempre (toggle `isActive` del stage, auto-save) |
| 6 | Reordenar por drag-and-drop | Sigue funcionando igual que en QA-31 — el fix de performance no cambió el comportamiento, solo dónde vive el estado |

**Severidad:** media en el caso 1 — un "refresh" visible cada vez que se intenta reordenar un stage es el
tipo de fricción que hace que una función se sienta rota aunque funcione. El resto son ajustes visuales
menores.

## QA-33 — Fix real del "refresh" (loadPipelines bloqueaba toda la página) + color del ícono Archive (2026-08-25)

**Por qué existe esta tarea:** el fix de QA-32 (mover el estado del drag a su propio componente) era una
mejora real pero no la causa principal — el usuario confirmó que seguía sin ser fluido, "se renderiza por
cualquier cosa ahora". Causa raíz encontrada: `loadPipelines()` — la función que se llama después de
**cualquier** guardado (rename, color/outcome/probability/archive/reorder de un stage, agregar stage,
crear/archivar/reactivar un pipeline) — hacía `setLoading(true)` al arrancar. Como el componente entero
tiene `if (loading) return <p>Loading...</p>`, cada uno de esos guardados desmontaba la página completa
(tabla + modal + editor) y la volvía a montar de cero al terminar. Eso es el "refresh": no era un problema
de qué tan grande era el árbol que se re-renderizaba (lo de QA-32), sino que la página entera se
desmontaba literalmente en cada guardado, sin excepción. Fix: `loadPipelines()` ya no toca `loading` —
ese estado ahora lo maneja solo el `useEffect` de montaje inicial (donde sí tiene sentido, porque todavía
no hay nada en pantalla). Cualquier refresh posterior es silencioso, mismo patrón "instant update + fetch
en segundo plano sin pantalla de carga" que ya usan otras páginas del proyecto (ej. `OpportunitiesPage.tsx`).
De paso, el ícono de Archive/Reactivate de cada stage ahora es verde (ojo abierto, activo) o rojo (ojo
tachado, archivado) en vez de un solo color neutro. Ambos cambios solo en `PipelinesSettingsPage.tsx`, sin
tocar backend. `npm run build` (backend y frontend) y `npm test` (91/91) en verde.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Modal Edit, cambiar el color de un stage, el outcome, la probability, o archivar/reactivar | Ya no hay ningún parpadeo de "Loading..." — el cambio se guarda y la pantalla no se mueve |
| 2 | Modal Edit, arrastrar un stage para reordenar | Igual de fluido que los casos anteriores, sin flash |
| 3 | Renombrar un pipeline (nombre en el modal), crear uno nuevo, o archivar/reactivar desde el menú "..." | Tampoco muestran el flash de "Loading..." — antes también lo tenían, aunque el usuario no lo haya mencionado explícitamente |
| 4 | Recargar la página completa (F5) manualmente | Sigue mostrando "Loading..." normalmente — ese caso no cambió, es el único momento en que corresponde |
| 5 | Ícono de Archive/Reactivate de un stage activo | Ojo abierto, color verde |
| 6 | Ícono de Archive/Reactivate de un stage archivado | Ojo tachado, color rojo |

**Severidad:** alta en el caso 1 — era la causa real del problema reportado dos veces seguidas; el fix de
QA-32 solo atacaba un síntoma secundario. Vale la pena confirmar explícitamente que ya no hay ningún
parpadeo antes de dar el tema por cerrado.

## QA-34 — Sales v2, Unidad 8: automatizaciones — round-robin, account owner, recordatorio de deal estancado (2026-08-25, en `staging`)

**Por qué existe esta tarea:** cierra la spec §3.8 — el último bloque grande del rediseño de Sales v2.
Agrega auto-asignación de owner por Pipeline (`round_robin` o `account_owner`, configurable en el modal de
Edit de Pipelines), el primer cron real del proyecto (recordatorio de deal estancado), y el primer productor
real de `Notification` (cambio de stage), conectando el bell icon que Unidad 7 dejó construido pero en cero.
Varias decisiones no estaban en el spec original y se resolvieron con el usuario esta misma ronda: el
disparador del round-robin (en la creación, nunca sobreescribe un `ownerId` explícito), el alta masiva de
participantes por Departamento (una sola vez, no un vínculo vivo), la elegibilidad del round-robin (Employee
activo + User activo, nunca por nombre de status), y que `account_owner` aplica tanto en la creación directa
como en el movimiento de pipeline (no solo en el movimiento, como decía el spec original). `Opportunity.ownerId`
pasó a nullable — consecuencia necesaria de la degradación prolija ("sin owner" en vez de romper), no una
decisión aparte. El email de cambio de stage sale en cada cambio por ahora (decisión explícita del usuario),
con un pendiente de backlog anotado para una futura pantalla de preferencias de notificación por usuario.

Verificado contra `staging` real con dos tenants descartables (uno para probar aislamiento) y 40 chequeos de
punta a punta: rotación en orden con persistencia del cursor sin tocar `Pipeline.updatedAt`, participantes
inelegibles salteados, degradación a `ownerId: null`, `ownerId` explícito siempre respetado, `account_owner`
con override/fallback en ambos puntos de entrada, notificación de cambio de stage (no-actor sí, self-change
no), el cron completo (crea → dedupe en re-corrida → re-notifica tras nuevo estancamiento → auth 401/200),
alta masiva por departamento, y aislamiento entre tenants. `npm run build`/`npm test` (91/91) backend y
`npm run build` frontend en verde. Schema aditivo salvo `Opportunity.ownerId` (`NOT NULL` → nullable, no
destructivo) pusheado a staging.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Pipeline con `assignmentMode: round_robin` y 2+ participantes activos, crear Opportunity sin Owner | Se asigna al siguiente participante elegible en orden; el cursor (`lastAssignedUserId`) avanza sin tocar `updatedAt` del Pipeline |
| 2 | Mismo caso, pero con un `ownerId` explícito en el request | Se usa tal cual — el round-robin nunca se consulta ni avanza el cursor |
| 3 | Pipeline `round_robin` sin participantes, o con todos los participantes inelegibles (Employee inactivo o User inactivo) | La Opportunity se crea igual, con `ownerId: null` — nunca un error 500 |
| 4 | Pipeline `type: 'account'` + `assignmentMode: account_owner`, Company con `accountOwnerId` seteado, crear u mover una Opportunity hacia ese pipeline | El owner queda en el Account Owner de la Company — sobreescribe un owner existente en el caso de movimiento |
| 5 | Mismo caso pero la Company no tiene `accountOwnerId` | Cae a round-robin sobre los participantes de ese mismo Pipeline; en un movimiento, solo rellena si la Opportunity no tenía owner (no sobreescribe uno existente) |
| 6 | Crear un Pipeline `type: 'lead'` con `assignmentMode: 'account_owner'`, o editarlo para setearlo así | Rechazado con 400 — esa combinación no tiene sentido |
| 7 | Pipeline con `assignmentMode: null`, crear una Opportunity sin `ownerId` | Rechazado con 400 — sigue siendo obligatorio como antes de esta unidad |
| 8 | Cambiar el stage de una Opportunity ajena (el que cambia no es el owner) | El owner recibe una `Notification` (`opportunity_stage_changed`) y un email |
| 9 | El owner cambia el stage de su propia Opportunity | No se genera notificación ni email para sí mismo |
| 10 | Pipeline con `stalledThresholdDays` seteado, una Opportunity abierta estancada más de ese umbral | El cron crea una `Notification` (`opportunity_stalled`) + email al owner; una Opportunity sin owner se cuenta como salteada, nunca se le manda a otro |
| 11 | Correr el cron de nuevo inmediatamente sobre el mismo estancamiento | No duplica la notificación (dedup vía último `Notification.createdAt` vs. `stageHistory[0].enteredAt`) |
| 12 | La Opportunity cambia de stage y vuelve a estancarse en la nueva | El cron genera una segunda notificación — el cambio de stage invalida la deduplicación anterior |
| 13 | Pegarle al endpoint del cron sin `Authorization` o con un Bearer incorrecto | 401 en ambos casos |
| 14 | Pegarle al endpoint del cron con el `CRON_SECRET` correcto | 200, devuelve el resumen de la corrida |
| 15 | En el modal de Edit de un Pipeline, agregar participantes por Departamento (multi-select) | Agrega a todos los Users que hoy tienen un Employee en esos departamentos; repetir la operación no duplica ni rompe |
| 16 | Formulario de alta de Opportunity, Pipeline con automatización activa | El campo Owner deja de ser obligatorio y muestra "-- auto-assign --"; el alta automática (`attemptAutoCreateOpportunity`) no dispara antes de que el usuario llegue a ese campo |
| 17 | Dos tenants distintos, cada uno con su propio round-robin | Nunca se cruzan — ni en la rotación, ni en el listado de participantes, ni al intentar asignar manualmente |

**Severidad:** media-alta — toca la creación/movimiento de Opportunities (camino muy transitado) y agrega el
primer cron real del proyecto. Los casos 3 y 7 (degradación prolija vs. seguir exigiendo `ownerId` sin
automatización) son los más importantes: una regresión ahí rompería altas de Opportunity para tenants sin
esta feature configurada. El caso 11 (dedup del cron) es el segundo más importante — sin él, cada corrida
diaria le mandaría un email repetido a cada owner con un deal estancado.

## QA-35 — Sales v2, Unidad 8 follow-up: Automations en la creación + multi-select + notificación por stage (2026-08-25, en `staging`)

**Por qué existe esta tarea:** feedback directo del usuario al revisar QA-34 en staging. Tres pedidos: (1) la
sección "Automations" vivía solo en el modal de Edit — un usuario nunca se enteraría de que la feature existe
salvo que se le ocurriera editar un pipeline ya creado, así que se movió también al modal de creación, antes
de Stages en ambos modales; (2) los checklists de participantes/departamentos (siempre visibles, un checkbox
por fila) se reemplazan por un dropdown multi-select nuevo (`MultiSelectDropdown.tsx` — no existía nada así en
el proyecto, se construyó sobre `Popover.tsx` siguiendo el mismo patrón que `ColumnVisibilityMenu.tsx`); (3)
la tabla de Stages gana una columna "Notify" (`PipelineStageDefinition.notifyOwnerOnEnter`, boolean, default
`true`) para poder apagar la notificación/email de cambio de stage en un stage puntual sin afectar al resto
del Pipeline.

En el modal de creación, Automations queda como estado en borrador (assignmentMode, participantes,
departamentos, `stalledThresholdDays`) que recién se aplica después de `createPipeline`, mismo patrón que ya
usan las stages en borrador — nada se persiste hasta el submit. `notifyOwnerOnEnter` se valida en las rutas de
stage (POST/PATCH) y `updateOpportunity` chequea el flag del stage de **destino** (no el de origen) antes de
notificar/emailear, sumado al chequeo ya existente de "nunca al propio actor". `npm run build`/`npm test`
(91/91) backend y `npm run build` frontend en verde. Schema aditivo (`notifyOwnerOnEnter` con default `true`,
sin migración destructiva) pusheado a staging.

**Verificado visualmente 2026-08-26** con un dev server local (frontend + backend) apuntado a
`STAGING_DATABASE_URL` y un tenant descartable, manejado con Playwright de punta a punta: modal de creación
con Automations antes de Stages, dropdown multi-select de participantes (abrir/cerrar, resolución real de
Users del tenant), columna Notify en la tabla de Stages (Create y Edit), y el reset de `assignmentMode` al
cambiar Type. **Encontrado y corregido en el proceso**: el dropdown de participantes mostraba "No users in
this tenant yet." por un instante al abrirlo justo después de elegir `round_robin`, porque `options` (todavía
`[]` mientras el fetch de Users/Departments seguía en curso) era indistinguible de "confirmado vacío".
`MultiSelectDropdown.tsx` gana un prop `loading` explícito para separar ambos estados; sin él, cualquier
usuario en una conexión más lenta que localhost habría visto ese mensaje incorrecto de forma mucho más
notoria. Vuelto a verificar tras el fix: el popover ahora muestra "Loading…" y luego resuelve al usuario real.
Tenant descartable limpiado, servidores de dev y screenshots temporales borrados al terminar.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Abrir "New Pipeline" | La sección Automations aparece antes de Stages, sin necesidad de crear el pipeline primero |
| 2 | Crear un pipeline con `round_robin` + 2 participantes + 1 departamento seleccionados | Al guardar, el pipeline queda creado con esos participantes ya asignados (individuales + los resueltos por departamento) |
| 3 | Abrir el dropdown de participantes (Create o Edit) | Aparece cerrado por default mostrando "N selected" o los nombres; al abrirlo, checklist con scroll; un User inactivo se ve con nota "(inactive)" |
| 4 | Elegir Type "Leads" después de haber seleccionado `assignmentMode: account_owner` | Se resetea a "Off" automáticamente — esa combinación es inválida y el backend la rechaza |
| 5 | En Stages (Create o Edit), destildar "Notify" en un stage puntual | Un cambio de stage hacia ese stage ya no genera `Notification` ni email para el owner; otros stages del mismo pipeline siguen notificando normalmente |
| 6 | Stage nuevo creado sin tocar "Notify" | Queda con notificación activada por default (compatibilidad con el comportamiento previo a este fix) |

**Severidad:** media — es una mejora de descubribilidad/UX sobre una feature que ya estaba correcta a nivel de
backend (QA-34), no un fix de un bug de negocio. El caso 4 (reset de `assignmentMode` al cambiar Type) es el
más importante: sin él, un submit podría mandar una combinación inválida y el usuario vería un 400 sin
entender por qué.

## QA-36 — Fix: picker de participantes de round-robin, elección obligatoria en vez de dos opcionales + fix de `MultiSelectDropdown` durante su propio loading (2026-08-26, en `staging`)

**Por qué existe esta tarea:** dos hallazgos del usuario al revisar QA-35 en staging. (1) Mostrar el picker
individual de Users y el de alta-por-Departamento **a la vez**, ambos con aspecto de "opcionales", leía como
un error de diseño — daba la sensación de dos mecanismos sueltos en vez de una sola forma clara de armar la
lista de round-robin. Se reemplazó por un `<select>` obligatorio (sin opción en blanco, default "Add
participants by user") que decide cuál de los dos pickers se muestra — nunca ambos a la vez — y cambiar de
opción limpia el borrador de la otra. (2) Al verificar esto visualmente (Playwright contra un tenant
descartable con departamentos reales), se encontró que `MultiSelectDropdown` podía mostrar "No users in this
tenant yet." / el `emptyMessage` que corresponda por un instante al abrirse, mientras el fetch de opciones del
componente padre todavía estaba en curso — `options` arranca en `[]`, indistinguible de "confirmado vacío".
Se agregó un prop `loading` explícito (ya existía desde QA-35 para el picker de Users; ahora también se pasa
al picker de Departamentos) para que el popover muestre "Loading…" mientras corresponda. La mecánica de fondo
de round-robin no cambió — esto es puramente de presentación, el modelo de datos (`PipelineAssignmentUser`,
`assignUsersByDepartments`) es el mismo de QA-34.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Pipeline con `assignmentMode: round_robin` (Create o Edit) | Un único `<select>` "Add participants by user / by department" — nunca ambos pickers visibles al mismo tiempo |
| 2 | Cambiar de "by user" a "by department" con participantes ya elegidos individualmente | El picker de usuarios se oculta; la selección de departamentos arranca vacía |
| 3 | En modo Edit, agregar por Departamento y confirmar "Add selected" | Vuelve automáticamente a "by user", mostrando la lista de participantes ya combinada (individuales + resueltos por departamento) |
| 4 | Abrir cualquiera de los dos dropdowns apenas se revela la sección (antes de que el fetch de Users/Departments del tenant termine) | Muestra "Loading…" — nunca "No users/departments..." de forma prematura |

**Severidad:** media — mismo nivel que QA-35, mejora de claridad de UX sobre una feature ya correcta a nivel de
negocio (QA-34). El caso 4 es el más importante de esta ronda: sin el fix, un tenant con usuarios/departamentos
reales podía ver un mensaje de "vacío" incorrecto justo al momento de configurar la automatización, la primera
vez que interactúa con la feature.

## QA-37 — Round-robin: select unificado (3-4 opciones directas) + campo obligatorio + 3 stages default (2026-08-26, en `staging`)

**Por qué existe esta tarea:** el fix de QA-36 (select anidado "Add participants by user/department" debajo del
select de modo) seguía leyendo como dos pasos separados — feedback directo del usuario. Se colapsó en **un solo
select** de "Owner auto-assignment": `Off`, `Round robin — by user`, `Round robin — by department`, y (solo para
`type: 'account'`) `Account owner`. `Pipeline.assignmentMode` no cambió en la base (sigue siendo `round_robin |
account_owner | null`) — la distinción "by user" vs. "by department" nunca se persiste, es pura UI: el resultado
final es la misma lista plana de `PipelineAssignmentUser` sin importar qué picker se usó. Al reabrir Edit de un
pipeline `round_robin` ya configurado, el select cae en "by user" por default, mostrando la lista actual completa
sin importar cómo se armó originalmente.

**Campo obligatorio (pedido explícito del usuario, comparado con Name/Type)**: en el modal de creación, elegir
cualquiera de los dos `round_robin` sin seleccionar ningún participante (ni por usuario ni por departamento)
bloquea el Save con un toast de error — `account_owner` queda exento, se degrada solo. En Edit no hay bloqueo
equivalente (no hay un "Save" único que interceptar); se mantiene la degradación prolija ya decidida para
pipelines existentes (QA-34).

**Además**: el modal de "New Pipeline" ahora arranca con 3 stages precargados (`Lead`/open/50%, `Won`/won/100%,
`Lost`/lost/0%) en vez de una fila en blanco — totalmente editables/borrables como cualquier draft row. No toca
el seed de tenant-registration (`seedDefaultPipelines`), que es código separado.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Abrir "New Pipeline" con Type "Leads" | El select de Owner auto-assignment tiene exactamente 3 opciones: Off, Round robin — by user, Round robin — by department (sin Account owner) |
| 2 | Cambiar Type a "Account" | Aparece una 4ª opción, Account owner |
| 3 | Elegir "Round robin — by user" | Se muestra únicamente el picker de usuarios, con asterisco de obligatorio en el label |
| 4 | Elegir "Round robin — by department" | Se muestra únicamente el picker de departamentos, mismo asterisco |
| 5 | Completar Name pero dejar el picker de participantes vacío con `round_robin` seleccionado, click Save | Toast de error, el modal no se cierra |
| 6 | Elegir un departamento y click Save | El pipeline se crea correctamente, toast de éxito |
| 7 | Elegir "Account owner" (pipeline `account`) | Se muestra la sección de participantes como fallback, sin asterisco de obligatorio, con copy distinta ("Used only as a fallback...") |
| 8 | Abrir "New Pipeline" | Ya vienen 3 stages precargados: Lead (Open, 50%), Won (Won, 100%), Lost (Lost, 0%), todos con Notify tildado |

**Severidad:** media-alta — el caso 5 es el más importante: sin el bloqueo, era fácil crear un pipeline
`round_robin` completamente vacío (ningún participante) y que cada Opportunity quedara sin owner de forma
silenciosa, sin que el usuario se diera cuenta de que faltaba un paso. Verificado de punta a punta con Playwright
contra un tenant descartable (2 departamentos, un pipeline `account`) cubriendo los 8 casos de la tabla.
`npm run build` frontend y `npm test` (91/91) backend en verde (backend no tuvo cambios esta ronda).

## QA-38 — Payments v1, Unidad 1: conexión con Stripe (2026-08-26, en `staging`)

**Por qué existe esta tarea:** cierra la Unidad 1 de `docs/tareas/specpaymentsv1.md` — el cimiento del
módulo Payments (`docs/tareas/tareaspaymentsv1.md` para el checklist). Cada tenant conecta su propia
cuenta de Stripe pegando una API key (Restricted Key recomendada, sin OAuth/Connect — Northstack no
tiene entidad de negocio para eso todavía), desde una card nueva en Settings → Integrations (gateada a
owner). Solo lectura: nada de esta unidad crea charges/invoices/subscriptions. Dos correcciones reales
encontradas antes de escribir código, no bugs de esta ronda sino gaps de la spec original: (1) no se
instaló el SDK `stripe` — `src/lib/stripe.ts` es un cliente REST a mano, mismo criterio ya usado por
`paddle.ts`/`mercadopago.ts`; (2) el gate de permisos quedó owner-only (confirmado con Alejandro), no
"owner/admin" como decía la spec citando mal el precedente de Payroll.

**Verificado por Claude** contra `staging` real con un tenant + owner + member descartables (creados y
borrados vía Prisma directo): gating de permisos (403 para member en los 3 endpoints mutables), rechazo
inmediato de una key mal formada sin tocar la red, 400 al guardar webhook secret sin conexión previa,
disconnect sin conexión da 204 limpio (bug real encontrado y corregido: antes crasheaba con un error
crudo de Prisma), y una llamada real a `api.stripe.com` con una key inventada de prefijo válido —
confirma que el cliente a mano arma bien la request y parsea el error real de Stripe. `npm run
build`/`npm test` (116/116, 22 nuevos)/`npm run lint` backend y build/lint frontend en verde.

**Lo que Claude NO pudo probar — necesita a Alejandro con una cuenta de test de Stripe real:** todo el
camino feliz de conectar de verdad. Sin una cuenta de Stripe (ni siquiera de test/sandbox) disponible en
este entorno, no se probó: crear una Restricted Key real con los permisos de lectura sugeridos y pegarla
en el formulario, que `apiKeyMode` detecte `test` correctamente, que `stripeAccountId` se guarde (o que
el fallback a `listCustomers` entre en juego si la key no tiene permiso de leer Account), guardar un
webhook signing secret real, y forzar un 401 revocando la key desde el dashboard de Stripe para confirmar
que `needsAttention` se prende y el banner de reconectar aparece.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Como owner, ir a Settings → Integrations | Card nueva "Stripe" debajo de Google Calendar, con el copy de Restricted Key + checklist de permisos + campo para la key |
| 2 | Como member o admin, ir a Settings → Integrations | La card de Stripe no aparece en absoluto (a diferencia de la de Google Calendar, que sí es visible para todos) |
| 3 | Crear una Restricted Key real en Stripe (modo test) con los permisos sugeridos (Customers, Charges, Refunds, Invoices, Subscriptions, PaymentMethods) y pegarla | "Test connection" tiene éxito, la card pasa a estado conectado con el chip "test" |
| 4 | Repetir con una Secret Key completa (`sk_test_...`) en vez de Restricted | También conecta (el gate solo exige el prefijo `sk_`/`rk_` + `test`/`live`, no distingue el tipo) |
| 5 | Pegar una key con un typo o de otro formato (ej. una Publishable Key `pk_test_...`) | Rechazada al instante con el mensaje "doesn't look like a Stripe secret or restricted key", sin loading ni delay de red |
| 6 | Una vez conectado, ver el Paso 2 (Webhook) | Muestra la URL `.../api/webhooks/stripe/<tenantId>`, botón de copiar funcional, checklist de los 5 eventos, campo para el signing secret |
| 7 | Crear el webhook en Stripe con esa URL + esos eventos, pegar el signing secret real y guardar | Se guarda sin error, la card indica que ya hay un secret guardado |
| 8 | Ir al dashboard de Stripe y revocar/borrar la Restricted Key ya conectada, después recargar Settings → Integrations | El estado pasa a mostrar el banner de "needsAttention" (rechazada, reconectar) — puede tardar hasta la próxima acción que dispare una llamada real a Stripe con esa key, confirmar si hace falta una lectura activa para que se detecte |
| 9 | Con la key revocada, click "Disconnect" y volver a conectar con una key nueva | Reconecta sin problema — no queda una segunda fila ni un estado inconsistente |
| 10 | Revisar `staging.joinnorthstack.com` específicamente (no `app.joinnorthstack.com`) en el Paso 2 | Aparece la nota extra sobre `?x-vercel-protection-bypass=<secret>` — confirmar que de verdad hace falta ahí antes de que Alejandro configure el webhook real en Stripe contra staging |

**Severidad:** media — es la base de todo el módulo Payments, pero v1 es de solo lectura y no hay
ningún endpoint mutable expuesto más allá de la conexión misma (nada de esto puede cobrar ni mover
dinero). El caso 8 es el más importante de validar con una cuenta real: si `needsAttention` no se
prende de verdad ante una key revocada, un tenant puede quedar pensando que su conexión sigue viva
cuando ya no lo está.

## QA-39 — Payments v1, Unidades 2-3: matching Company↔Stripe + visibilidad de pagos en vivo (2026-08-26, en `staging`)

**Por qué existe esta tarea:** cierra las Unidades 2 y 3 de `docs/tareas/specpaymentsv1.md` — matchear
una Company con su customer de Stripe (por email de Contact, nunca dominio) y ver refunds/pagos
fallidos/estado de subscripción en vivo, sin store local. Depende de que QA-38 (Unidad 1, conexión)
esté resuelta con una cuenta de Stripe real antes de poder probar esto de punta a punta — sin
conexión activa, todo lo de acá se degrada a estados limpios ("sin vincular"/"sin conexión") en vez
de fallar, que es exactamente lo único que Claude pudo verificar sin credenciales.

**Corrección real de la spec, resuelta contra la documentación oficial de Stripe (no una suposición):**
`GET /refunds` no acepta un filtro `customer` — solo Charges lo soporta, y un Charge ya trae
`refunded`/`amount_refunded`/`status` propios, así que es la única fuente tanto del resumen como del
historial de eventos (no Payment Intents, no un `/refunds` separado). Esto también resuelve qué
permisos de lectura necesita la Restricted Key de la Unidad 1: Customers, Charges, Subscriptions —
Refunds no hace falta como permiso separado.

**Verificado por Claude** contra `staging` real con 2 tenants descartables (uno para probar
aislamiento): 400 limpio al buscar/vincular sin conexión activa, 403 para member en los 5 endpoints,
404 (no leak) al pedir una Company de otro tenant, summary/events de una Company sin vincular
devuelven "sin vincular"/vacío sin llamar a Stripe, overview sin conexión da `connected: false` sin
intentar ningún Company. 17 tests nuevos con mocks cubren lo que no se pudo probar en vivo:
consolidación de duplicados en el matching, Contacts inactivos ignorados, conteo de refunds/failed
desde la misma lista de Charges, preferencia de subscription activa sobre cancelada, paginación y
clasificación de eventos, agregación de totales en el overview, aislamiento entre tenants, y
`needsAttention` marcándose ante un 401 real de Stripe. `npm run build`/`npm test` (133/133)/`npm run
lint` backend y build/lint frontend en verde.

**Lo que Claude NO pudo probar — necesita a Alejandro con la cuenta de Stripe real de QA-38:** todo
el camino feliz con datos reales.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Con Stripe conectado, abrir una Company cuyo Contact tiene el mismo email que un customer real de Stripe, click "Search on Stripe" | Aparece 1 resultado con el nombre/email del customer y "(via <email del Contact>)" |
| 2 | Click "Link" sobre ese resultado | La Company pasa a mostrar "Connected to Stripe →", el link abre el customer correcto en el dashboard (con `/test/` si la conexión es de test) |
| 3 | Una Company con 2+ Contacts, cada uno matcheando un customer de Stripe distinto | Aparecen los 2 resultados, cada uno con su propio Contact de origen — ninguno se pierde ni se duplica |
| 4 | Una Company sin ningún Contact con email que matchee nada en Stripe | "No matching Stripe customers found..." sin errores |
| 5 | Con una Company ya vinculada, click "Change link" y elegir un customer distinto | Aparece el diálogo de confirmación ("Replace the existing Stripe link?"); confirmar reemplaza el link, cancelar lo deja igual |
| 6 | Una Company vinculada a un customer real con al menos un refund, un pago fallido, y una subscripción activa | La sección Payments muestra los 3 conteos correctos + el monto de refunds en la moneda real del charge |
| 7 | La lista de eventos recientes de esa Company | Cada fila muestra el tipo correcto (Payment/Failed payment/Refund), el monto, la fecha, y el link abre el charge correcto en el dashboard de Stripe |
| 8 | "Load more" en la lista de eventos, con más de 20 charges reales | Trae la página siguiente sin duplicar ni saltear ninguno |
| 9 | Ir a la sección "Payments" del sidebar (solo visible para owner) | Tarjetas de refunds/failed/subscripciones activas/companies vinculadas con los totales correctos, tabla de Companies abajo |
| 10 | Click en el nombre de una Company desde esa tabla | Navega a `/companies` y abre el detalle de esa Company puntual (no solo la lista) |
| 11 | Como member o admin, intentar ver `/payments` por URL directa | Mensaje "Payments is only visible to the tenant owner" — mismo criterio que Payroll |
| 12 | Un tenant con varias decenas de Companies vinculadas, abrir `/payments` | Carga en un tiempo razonable (fan-out con límite de concurrencia 10) sin disparar rate limits de Stripe |

**Severidad:** media — solo lectura, no hay riesgo de mover dinero por error. El caso 10 es el más
importante de los que Claude no pudo probar en vivo: si el deep-link no abre la Company correcta, la
tabla de la Unidad 3 pierde buena parte de su utilidad práctica.

## QA-40 — Payments v1, Unidad 4: webhook de notificaciones proactivas (2026-08-26, en `staging`)

**Por qué existe esta tarea:** cierra `docs/tareas/specpaymentsv1.md` completa (Unidades 1-4). Un
tenant conecta el webhook de su propia cuenta de Stripe (URL + eventos, ver Paso 2 en Settings →
Integrations de QA-38) y a partir de ahí, un refund/pago fallido/cambio de subscripción en una
Company vinculada genera una `Notification` real (bell icon) para el Account Owner de esa Company,
o el owner del tenant si no tiene uno asignado — nunca un admin, porque Payments es owner-only.

**A diferencia de QA-38/QA-39, esto SÍ se pudo verificar de punta a punta sin una cuenta de Stripe
real** — a Claude: se sembró un `StripeConnection` descartable con un webhook secret conocido
directo en la base, y se firmaron a mano payloads de evento con el mismo algoritmo HMAC que usa
Stripe de verdad, simulando deliveries reales. Confirmado con una query directa a la base: una
firma válida contra un customer vinculado crea la `Notification` correcta (tipo, mensaje, y
destinatario — cayó en el owner del tenant porque la Company de prueba no tenía Account Owner);
firma inválida, header faltante, o tenant sin conexión → 400 sin crear nada; customer sin ninguna
Company vinculada → 200 sin crear nada. 14 tests nuevos con mocks cubren además el caso más
delicado: que un `customer.subscription.updated` **no** relacionado al status (ej. cambiar la
cantidad) sobre una subscription que ya está `past_due` no dispare una notificación repetida —
solo notifica cuando el status recién transicionó a `past_due` (usando `previous_attributes`, que
Stripe solo llena con lo que cambió en ese evento puntual). `npm run build`/`npm test`
(147/147)/`npm run lint` backend en verde.

**Lo único que falta probar con Stripe real:** que un evento real disparado desde el dashboard de
test de Stripe (no simulado a mano) efectivamente le llegue al endpoint — la firma HMAC en sí ya
está confirmada bit a bit contra el algoritmo real, así que el riesgo residual es más de
configuración (URL mal copiada, evento no tildado al crear el webhook en Stripe) que de código.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Con el webhook creado en Stripe (URL + los 5 eventos, ver QA-38 Paso 2), disparar un refund real desde el dashboard de test sobre un customer vinculado a una Company | Aparece una `Notification` nueva en el bell icon del Account Owner (o el owner del tenant si la Company no tiene uno) con el monto correcto |
| 2 | Repetir con un pago fallido (`charge.failed`) | Notificación con el tipo/mensaje de pago fallido |
| 3 | Cancelar una subscription real de test sobre un customer vinculado | Notificación de subscription cancelada |
| 4 | Forzar que una subscription real pase a `past_due` (ej. una tarjeta de test que declina) | Notificación de subscription past due — una sola vez, no una por cada evento relacionado que dispare Stripe en el camino |
| 5 | Cualquier evento sobre un customer que no está vinculado a ninguna Company del tenant | Ninguna notificación — nada roto, Stripe ve un 200 igual |
| 6 | Revisar en el dashboard de Stripe → Developers → Webhooks → el endpoint, la pestaña de intentos | Todos los deliveries devuelven 200 (o 400 solo si de verdad hubo un problema de firma/configuración, nunca un 500) |

**Severidad:** media — solo lectura/aviso, no hay riesgo de mover dinero ni de romper el resto de la
app si algo falla acá (un 400/200 limpio en todos los casos, nunca un crash). El caso 4 es el más
importante: es el único de los 5 eventos con lógica de deduplicación real, y es exactamente donde un
bug se sentiría como spam de notificaciones para el usuario.

## QA-41 — Fix: auto-create en Add Opportunity/Company/Contact/Employee ya no salta a la vista de detalle (2026-08-27, en `staging`)

**Por qué existe esta tarea:** hallazgo de QA manual del usuario — al completar los campos
obligatorios del formulario de alta, el registro se auto-creaba en background (patrón
`useAutoCreateGuard`, 2026-08) pero además cerraba el formulario y saltaba a la vista de detalle de
inmediato, sin dejar completar los campos opcionales restantes. Reproducible en las 4 pantallas que
usan el hook: Opportunities, Companies, Contacts, Employees.

**Fix:** se separó "crear/persistir en background" de "cerrar el formulario y navegar". El
auto-create sigue disparando igual que antes (sigue siendo la red de seguridad contra perder el
formulario), pero ya no cierra nada — el usuario sigue completando campos opcionales con el
formulario abierto. El botón "Create" ahora: si el registro ya se auto-creó, hace un PATCH con los
campos actuales (incluyendo lo agregado después del auto-create) antes de recién ahí cerrar y
navegar a la vista de detalle; si por alguna carrera el auto-create todavía no disparó, crea de
una. El botón queda deshabilitado mientras el auto-create está en vuelo (`autoCreateGuard.isBusy`,
nuevo) para evitar una carrera doble-submit.

**Verificado de punta a punta con Playwright contra un tenant de prueba real en `staging`**
(creado con seed directo vía Prisma, no por signup — reutiliza `createCompany`/`createContact`
reales) para **Opportunity, Company y Contact**: en los 3 casos, se confirmó que el formulario
queda abierto después de completar los campos obligatorios, que un campo opcional completado
después del auto-create (Next Step Note / Industry / Title) efectivamente queda guardado tras
tocar "Create", y que recién ahí se cierra el formulario y abre el detalle — sin errores de
consola. **Employee** recibió el mismo cambio de código (compila y tipa limpio) pero no se llegó a
verificar en navegador — su formulario de alta requiere más datos de prueba (departamento, manager,
pay frequency, etc.) que no se armaron en esta ronda.

**Gaps aceptados a propósito** (mismo patrón en las 4 pantallas): si el usuario **cambia** un campo
que ya se había enviado en el auto-create (ej. reelige el Contact de una Opportunity de tipo lead,
o edita los datos de compensación de un Employee) en vez de solo completar campos nuevos, ese
cambio puntual no se resincroniza al tocar Create — solo lo agregado de cero después del
auto-create queda garantizado. No se detectó evidencia de que esto ocurra en el uso normal (llenar
el form de arriba hacia abajo), pero queda como gap conocido.

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Abrir "Add Employee", completar todos los campos obligatorios (incluida la compensación si el person type lo requiere) y esperar unos segundos sin tocar "Create" | El formulario sigue abierto, no salta a ningún lado |
| 2 | Completar además un campo opcional (ej. Personal Email o Nationality) y recién ahí tocar "Create" | Se cierra el formulario, abre el panel del empleado, y el campo opcional queda guardado |
| 3 | Repetir 1-2 en Opportunity/Company/Contact como confirmación manual adicional (ya verificado por Claude vía Playwright, pero vale un check visual humano) | Mismo comportamiento |

**Actualización 2026-08-27 (misma ronda que QA-42):** Employee quedó verificado en navegador —
confirmado el mismo comportamiento (formulario abierto tras auto-create, cierra recién al tocar
Create) al crear un empleado real de prueba.

**Severidad:** baja — es una mejora de UX sobre un flujo que ya persistía los datos correctamente
(el auto-create en sí no cambió), no hay riesgo de pérdida de datos ni de escritura incorrecta.

## QA-42 — 6 bugs chicos de CRM/HR/Payroll del backlog QA 2026-08-27 (en `staging`)

**Por qué existe esta tarea:** siguiente tanda de la pasada de QA manual del usuario, priorizando
los bugs chicos ya diagnosticados antes de las piezas grandes (tags, Settings, Google Calendar).
Los 6 items, verificados de punta a punta con Playwright contra un tenant de prueba real en
`staging` (mismo tenant que QA-41):

1. **Opportunity creada desde un Contact no se podía reabrir** (`ContactDetailModal.tsx`): la fila
   de cada Opportunity vinculada no tenía `onClick`. Ahora abre `OpportunityDetailModal` (nuevo prop
   `onOpenOpportunity`, cableado en `ContactsPage.tsx` con su propio `viewingOpportunityId` +
   `lossReasons`/`winReasons` fetch + delete). Verificado: crear una Opportunity desde un Contact,
   click en la fila resultante, se abre el detalle completo con los Contacts vinculados.
2. **Sección "Opportunities" desalineada en la card de Contact**: usaba `.overview-field` (pensada
   para una fila label/valor) alrededor de una lista de varias filas. Ahora es un `.field-group`
   propio, igual que Identity/Role/Source. Verificado visualmente (screenshot).
3. **Opportunity card sin link a Contact/Company**: el nombre de la Company en la card del Kanban
   ahora es un link a `/companies?open=<id>` (reusa el deep-link `open` que ya usaba Payments
   Overview); si hay un único Contact vinculado, su nombre es un link a `/contacts?open=<id>`
   (antes decía literal "1 contact", sin link). Se agregó el mismo patrón `open` a `ContactsPage.tsx`
   (ya existía en `CompaniesPage.tsx`). Verificado: click en el nombre de la Company abre su
   `CompanyDetailModal` correctamente.
4. **Time Off: asignar/quitar una política a un empleado disparaba un refresh completo** (6
   endpoints, con `<p>Loading...</p>` reemplazando toda la pantalla). Ahora
   `refreshAfterAssignmentChange` solo refetchea empleados + balances (lo único que la acción puede
   afectar), sin `setLoading(true)`. El `<p>Loading...</p>` del loading real (carga inicial de la
   pestaña) se reemplazó por `TableSkeleton`. Verificado: 0 elementos de skeleton aparecen
   inmediatamente después de asignar, la tabla nunca se desmonta, y la asignación persiste
   correctamente tras reload.
5. **Payroll "Base" poco entendible**: en vez de `123 hs × $65.00 = $7,995.00` corrido, ahora
   muestra "Hours" con label + input más visible (`.select-compact`, borde visible) en una línea, y
   "Rate $X/hr · Base $Y" en la siguiente. Verificado con un run real: "Hours" + "Rate $50.00/hr ·
   Base $0.00" se ven como dos líneas separadas y legibles.
6. **Contract "Pending" no se veía en el perfil del empleado**: ya existía como columna en la lista
   de Employees (visible por default, no estaba oculta — se descartó esa hipótesis), pero
   `EmployeeOverviewPanel.tsx` no lo mostraba en ningún lado. Se agregó el mismo chip
   (Confirmed/Pending/Expired) al lado del status general en el header del panel. Verificado: un
   empleado recién creado muestra "Active · Contract pending" en el header.

**Efecto secundario descubierto (no un bug, documentado para contexto):** un Payroll run nuevo
auto-incluye a los empleados elegibles (contrato confirmado + misma pay frequency) al crearse —
"Add person" solo hace falta para agregar a alguien después. Un empleado con contrato sin confirmar
queda explícitamente excluido ("1 person excluded — contract not confirmed yet."), no se puede
agregar ni manualmente vía "Add person" hasta confirmar el contrato.

`npm run build` (frontend) y `npm test` (backend, 147/147) en verde. Sin errores de consola en
ninguna de las verificaciones.

**Severidad:** baja en los 6 — todos son fixes de UX/legibilidad o de un `onClick` faltante, ninguno
toca lógica de negocio ni datos.

## QA-43 — 3 bugs chicos más del backlog QA 2026-08-27: Payroll filter, Company↔Contact buscador, Pay Frequency en Employees (en `staging`)

**Por qué existe esta tarea:** siguiente pieza de la misma pasada de QA manual (después de QA-41 y
QA-42). Los 3 items, verificados contra el mismo tenant de prueba en `staging`:

1. **Payroll "Add person" no filtraba por pay frequency**: `openAddPersonModal`
   (`PayrollRunDetailPage.tsx`) ahora excluye del listado a cualquier candidato cuyo
   `currentCompensation.payFrequencyName` no coincida con el `payFrequency` del run — antes ofrecía
   a cualquiera con una compensación activa, sin importar la frecuencia. Mensaje de estado vacío
   actualizado para reflejar el nuevo motivo de exclusión. **Descubrimiento aparte durante esta
   verificación**: un payroll run nuevo ya auto-incluye a los empleados elegibles (contrato
   confirmado + misma pay frequency) al crearse — "Add person" solo hace falta para sumar a alguien
   después. Verificado con un empleado real: al confirmarle el contrato, apareció solo en el "Add
   person" de un run de su misma frecuencia (Weekly), no en uno de otra frecuencia (no se pudo
   probar cross-frequency de punta a punta por un error de Prisma al sembrar el segundo empleado de
   prueba a mano — la lógica del filtro es una comparación de string trivial, revisada por código).
2. **Company↔Contact: dropdown reemplazado por buscador**: `CompanyDetailModal.tsx`'s "link
   existing contact" ahora usa `SearchableSelect` (mismo componente ya usado en este archivo para
   "Parent company", y en `ContactsPage.tsx` para elegir Company) en vez de un `<select>` plano —
   sigue restringido a contacts sin compañía. Verificado: escribir "unlinked" o el dominio del email
   ("acmetest.local") filtra correctamente al contact esperado.
3. **Employees list sin columna Pay Frequency**: `listEmployees` (`employeeService.ts`) ahora trae
   también la compensación *actual* (`effectiveTo: null`) de cada empleado, separada de la
   primera-siempre que ya se usaba para `contractStatus` — antes esa segunda relación no se pedía
   para nada, así que el dato no existía en el objeto que llega al frontend. Nueva columna "Pay
   Frequency" (toggleable, misma infraestructura de columnas existente) + entrada en
   `buildEmployeeFields` para que sea ordenable. Verificado: la columna aparece y muestra "Weekly"
   para el empleado de prueba con esa frecuencia.

`npm run build`/`npm test` (147/147) en verde. Sin errores de consola.

**Severidad:** baja en los 3 — ninguno toca lógica de negocio existente, solo agregan un filtro,
cambian un input de UI, o exponen un dato ya calculado en otro lado.

## QA-44 — 3 features de esfuerzo medio: Time Off tabs, Settings nav lateral, Task desde el calendario (en `staging`)

**Por qué existe esta tarea:** siguiente tanda del mismo backlog QA, esta vez las 3 piezas de
"esfuerzo medio" (features nuevas con alcance ya definido, no solo bugs). Verificadas contra el
mismo tenant de prueba en `staging`:

1. **Time Off: tabs reordenados + "My Timeoff" nuevo**: orden final — My Timeoff, My Requests,
   Approvals (todos los roles); Balances, All Requests, Policies, Assignments (solo admin/owner,
   `canManagePolicies` — antes Assignments era visible para cualquiera). "My Timeoff" es una vista
   nueva: reusa exactamente el mismo bloque expandible (allocated/used/pending/remaining +
   histórico de requests) que ya existía en el SlideOver de "Balances" para admins, pero
   auto-scopeada al empleado del usuario logueado (`myBalances`/`myRequests`, ya cargados en
   `loadData`). Verificado: orden de tabs correcto; para un usuario sin Employee vinculado, muestra
   el mensaje esperado en vez de romper.
2. **Settings: nav lateral persistente + botón Volver**: `AppLayout.tsx` ahora renderiza
   `SettingsSidebar.tsx` en vez del `Sidebar.tsx` global cuando la ruta empieza con `/settings`
   (antes cada subpágina solo tenía un link de "volver" a la grilla de tiles). El nuevo sidebar
   reusa las clases `.sidebar`/`.sidebar-link` del nav principal y una única fuente de datos
   (`lib/settingsSections.tsx`) compartida con la grilla de `/settings` (`SettingsHomePage.tsx`),
   para que el gating por rol no viva en dos lugares. "Volver" hace `navigate(-1)` (vuelve a lo que
   sea que el usuario estaba viendo antes, no a un destino fijo). Verificado: los links navegan
   correctamente entre secciones, "Volver" está presente, y las páginas fuera de `/settings` siguen
   mostrando el nav global normal (no quedó pisado).
3. **Crear Task desde el calendario**: click en cualquier celda del calendario de `/overview` ahora
   abre `NewTaskFromCalendarPopover.tsx` — primero pide el tipo de entidad (Contact/Company/
   Employee; "Cliente" del pedido original mapea a Contact, ya que el modelo `Client` legado está
   en proceso de discontinuarse, ver sección CRM del backlog), busca por nombre/email
   (`SearchableSelect`, mismo componente que QA-43), y recién ahí muestra el `TaskForm` existente
   (reusado tal cual, con un nuevo prop `defaultDueDate` para pre-cargar el día clickeado). Verificado
   de punta a punta **contra la base de datos directamente** (no solo el navegador): dos tasks de
   prueba se crearon correctamente con el `entityType`/`entityId`/`dueDate` esperados — el primer
   intento de verificación por navegador dio un falso negativo por el mismo cold-start de Neon que
   viene apareciendo toda la sesión en escrituras (la tarea sí existía en la base, solo tardó más que
   el timeout del script en aparecer reflejada).

**Hallazgo aparte, no bloqueante:** al crear una task desde el calendario para el día 1 de un mes,
el widget "My tasks" del Overview la mostró fechada el día anterior (31 en vez de 1) — posible
desajuste de zona horaria en cómo `MyTasksWidget.tsx` formatea un `dueDate` date-only para
mostrarlo, no en cómo se guarda (la fila en la base tenía la fecha UTC correcta,
`2026-08-01T00:00:00.000Z`). No se investigó más a fondo — parece preexistente (no es código tocado
en esta tanda) y no afecta la creación en sí, pero vale la pena que alguien lo mire.

`npm run build`/`npm test` (147/147) en verde. Sin errores de consola en ninguna verificación.

**Severidad:** baja en las 3 — mejoras de navegación/UX y una feature nueva aditiva, ninguna toca
datos existentes ni lógica de negocio ya construida.

## QA-45 — Sistema de tags, Entrega 1: CRUD + autocomplete en Contact/Company/Employee (en `staging`)

**Por qué existe esta tarea:** pieza más grande del backlog QA — el usuario eligió tags libres y
compartidos (no un catálogo predefinido). Dado el tamaño, se parte en 2 entregas: esta (modelo +
backend + UI de agregar/ver/sacar tags en los 3 perfiles) y una segunda (mostrar tags en las vistas
de lista + filtrar por ellos), todavía sin arrancar.

**Modelo nuevo** (`prisma/schema.prisma`, push aditivo a `staging` — tablas nuevas, sin tocar datos
existentes): `TagDefinition` (`tenantId` + `name`, `@@unique([tenantId, name])` — un tag es el mismo
objeto sin importar en qué entidad se use) y `TagAssignment` (`tenantId` + `tagDefinitionId` +
`entityType` + `entityId`, mismo patrón polimórfico que `CustomFieldValue`/`Task`/`Note`,
`@@unique([tagDefinitionId, entityType, entityId])` para que asignar el mismo tag dos veces sea un
no-op en vez de un error). `entityType` reusa el `EntityType` existente, acotado a
contact/company/employee (los mismos 3 que Task/Note ya soportan vía
`crossModule/entityLookup.ts`, reusado tal cual para el chequeo anti-IDOR).

**Backend**: `src/modules/crossModule/tagService.ts` + `src/routes/tags.ts`
(`GET /api/tags` para el catálogo completo del tenant — alimenta el autocomplete —,
`GET/POST /api/tags/:entityType/:entityId`, `DELETE /api/tags/assignments/:id`). `assignTag` hace
find-or-create por nombre exacto + asignación en un solo paso.

**Frontend**: `TagInput.tsx` (nuevo, en `components/common/`) — chips + input con autocomplete
(`Popover`, mismo mecanismo que `SearchableSelect`), Enter para agregar (crea el tag si no existía),
click en el chip para sacarlo. Montado en el header de `ContactDetailModal`/`CompanyDetailModal`/
`EmployeeOverviewPanel`.

**Verificado end-to-end** contra el tenant de prueba en `staging`: se agregó "VIP" a una Company, y
al abrir un Contact distinto el autocomplete lo sugirió como tag ya existente (confirma que el
catálogo es realmente compartido entre los 3 módulos, no por separado) — se agregó también ahí, se
sacó, y una consulta directa a la base confirmó el estado final correcto (VIP sigue en la Company,
ausente en el Contact). Varios chequeos automáticos del script de Playwright dieron falsos negativos
por el mismo cold-start de Neon que viene apareciendo toda la sesión en escrituras — no es un bug
real, confirmado contra la base directamente.

`npm run build`/`npm test` (147/147) en verde. Sin errores de consola.

**Severidad:** baja — tabla nueva, aditiva, no toca ningún modelo ni endpoint existente.

## QA-46 — Sistema de tags, Entrega 2: columna/chip + filtro en las listas de Contacts/Companies/Employees (en `staging`)

**Por qué existe esta tarea:** segunda mitad del pedido original de tags, dejada pendiente en
QA-45 ("Falta la segunda mitad del pedido original: mostrar los tags como columna/chip en las
vistas de lista... y poder filtrar por ellos").

**Por qué no se integró al motor de Views genérico**: `viewFields.ts`/`applyFilters`/`applySort`
no soportan campos multi-valor (un registro puede tener N tags). Mismo caso ya resuelto para
"Time Off Policies" en `EmployeesPage.tsx` — se sigue el mismo patrón: columna toggleable de solo
lectura fuera del motor genérico, más un paso de filtrado bespoke aplicado *antes* de
`applyFilters` (ver `tagFilteredEmployees`/`tagFilteredContacts`/`tagFilteredCompanies` en cada
página), con match OR (cualquier tag seleccionado matchea).

**Backend**: `listContacts`/`listCompanies`/`listEmployees` (`contactService.ts`,
`companyService.ts`, `employeeService.ts`) ahora traen `tags` embebido en cada fila vía
`listTagsForEntities` (ya existía desde QA-45, una sola query batch en vez de N).

**Frontend**, mismo patrón replicado en `ContactsPage.tsx`, `CompaniesPage.tsx` y
`EmployeesPage.tsx`:
- Columna "Tags" (en `ContactsPage`/`CompaniesPage` es una entrada más de su array `columns`
  genérico; en `EmployeesPage` sigue el patrón bespoke ya usado por "Time Off Policies", con su
  propio `showTagsColumn`) — chips de solo lectura reusando `.time-off-policy-chip`.
- Filtro `MultiSelectDropdown` ("Filter by tag") en el toolbar, al lado del buscador — solo se
  renderiza si el tenant ya tiene al menos un tag asignado en esa lista.
- `jumpToEmployeePage`/`jumpToContactPage`/`jumpToCompanyPage` (recalculan a qué página saltar
  tras crear un registro) actualizados con el mismo paso de filtrado por tag, para no quedar
  desincronizados del pipeline que usa el render.

**Bug encontrado y corregido antes de pushear**: el chip de cada tag usaba `key={tag.id}` — pero
el shape que devuelve `listTagsForEntities` no tiene `id`, solo `tagAssignmentId` (visto en
`tagService.ts`). Daba un warning de React "unique key" en las 3 páginas (key `undefined`
repetida). Corregido a `key={tag.tagAssignmentId}`, mismo campo que ya usaba `TagInput.tsx`.

**Verificado end-to-end** contra el tenant de prueba en `staging` (Playwright): login, se agregó
el tag "VIP" a un Employee/Contact/Company desde su detalle, se confirmó el chip en la columna
"Tags" de las 3 listas, se abrió el dropdown "Filter by tag", se marcó "VIP" y se confirmó que la
lista filtró correctamente. Sin errores de consola tras el fix del `key`. Tag de prueba "VIP"
borrado de la base al terminar (no queda como catálogo real del tenant de QA).

`npm run build` (frontend, `tsc -b` limpio) y `npm test` (147/147) en verde.

**Severidad:** baja — solo lectura/filtrado sobre datos ya expuestos por QA-45, sin cambios de
modelo ni de endpoints.

## QA-47 — Overview: overlay de solo lectura para eventos de Google Calendar no vinculados a un Task (en `staging`)

**Por qué existe esta tarea:** el usuario reportó que al vincular Google Calendar, los eventos que
ya tenía cargados ahí no aparecían en Northstack. Investigando el código existente se confirmó que
el sync de Tasks YA es bidireccional (`googleCalendarWatchService.ts`, canal de push notifications
+ `events.list(syncToken)`, probado en vivo con Alejandro el 2026-08-23, ver nota en QA-19) — pero
solo para eventos que se originaron como Task en Northstack; cualquier otro evento del calendario
del usuario se ignora explícitamente (`applyInboundEventChange`: "not a Task-tracked event —
ignore anything else").

**Decisión de producto** (preguntada directo al usuario, dado que `Task.entityType`/`entityId` son
obligatorios — un evento personal no tiene a qué Company/Contact/Employee/Opportunity atribuirse):
de las 3 opciones planteadas (convertir en Task forzando una entidad, crear un tipo nuevo
"recordatorio personal" sin entidad, o solo mostrar sin importar), el usuario eligió **"Solo
mostrar, no importar"** — evita el problema del modelo de datos por completo, sin crear ninguna
fila nueva en la base.

**Backend**: `listGoogleEventsForCalendarView(userId, timeMinISO, timeMaxISO)` (nueva, en
`googleCalendarSyncService.ts`) — reusa `getAuthorizedClientForUser` (misma auth que el resto del
módulo, mismo scope OAuth ya otorgado, `calendar.events`, no hace falta reconexión); trae
`calendar.events.list` paginado (`singleEvents: true` para expandir recurrencias) acotado a
`[timeMin, timeMax]`, excluye eventos ya linkeados a un Task del usuario (`Task.googleCalendarEventId`)
para no duplicar lo que ya se muestra como Task, y eventos cancelados. Nunca tira — mismo contrato
best-effort que el resto del archivo (sin conexión o con error, devuelve `[]`). Nueva ruta
`GET /api/integrations/google-calendar/events?start&end`.

**Frontend**: `OverviewPage.tsx` — nuevo estado `googleEvents`, con su propio `useEffect` acotado a
`[cursor]` (a diferencia de Time Off/Tasks/birthdays, que traen todo una sola vez y filtran por día
en el cliente, acá hace falta re-pedir a Google en cada navegación de mes porque no se le puede
pedir "todo" sin rango). Nueva entrada `calendar-entry-google` (celeste, sin click — a diferencia
de `calendar-entry-task`, no dispara ningún popover) en cada celda del día.

**Verificado**: `npm run build`/`npm test` (147/147) en verde en back y front. Contra el tenant de
prueba en `staging` (sin cuenta de Google conectada): `GET .../events` responde 200 con `[]`, el
Overview renderiza el calendario sin errores de consola. **No verificado con una cuenta de Google
real** — a diferencia del sync de Tasks (QA-19), que se probó en vivo con Alejandro porque requiere
completar un consentimiento OAuth real, esto quedó pendiente de que él lo pruebe con su propia
cuenta ya conectada (los servidores locales quedaron corriendo para eso).

**Severidad:** baja — solo lectura, no crea ni modifica ninguna fila; el único caso a confirmar en
vivo es que el rango de fechas y el filtro de "ya es un Task" devuelvan lo esperado contra datos
reales.

## QA-48 — Fix: opciones de `<select>` ilegibles en dark mode (en `staging`)

**Por qué existe esta tarea:** el usuario mandó una captura del selector "Stage" de Opportunity en
dark mode — las opciones no seleccionadas ("In Progress", "Won", "Lost") se veían como texto gris
pálido casi invisible sobre fondo blanco, no el estilo oscuro del resto de la app.

**Causa real**: es un `<select>` nativo del navegador (`dropdown-trigger.dt-status`, usado en Stage
de Opportunity, Pipeline, y cualquier otro `<select>` con esa clase). Dos problemas compuestos:
1. La página nunca declaraba `color-scheme`, así que Chrome/Firefox renderizan el popup nativo de
   opciones siempre con el chrome claro por defecto, sin importar la clase `.dark` propia de la
   app — la única forma de que el navegador tiña sus propios controles nativos (popup de `<select>`,
   selectores de fecha, scrollbars) es ese CSS.
2. Aun agregando `color-scheme`, `.dropdown-trigger` tiene `background-color: transparent` — con un
   fondo no opaco, Chrome igual cae al blanco por defecto para el popup. El texto sí seguía la regla
   de dark mode (`dark:text-brand-blue-light`, un celeste pensado para fondo oscuro) — celeste claro
   sobre blanco es exactamente el "casi en blanco" que se ve en la captura.

**Fix** (`frontend/src/index.css`): `html { color-scheme: light } html.dark { color-scheme: dark }`
más, como refuerzo directo (no depende de que el navegador respete `color-scheme` para el popup),
`color`/`background-color` explícitos y opacos en `select option` — `surface-1`/`ink` para claro,
`dark-surface`/`dark-ink` para oscuro. Alcance: todos los `<select>` de la app (nativo, no solo
`dt-status`), no una clase puntual.

**Verificado con Playwright** (`colorScheme: 'dark'` + `localStorage` con el tema de la app en
`'dark'`, tenant de prueba en `staging`): abrir el Stage select de una Opportunity — antes del fix,
"In Progress"/"Won"/"Lost" ilegibles (texto pálido sobre blanco); después, texto blanco sobre fondo
oscuro, igual de legible que "New" (la opción seleccionada). Repetido también en modo claro para
confirmar que no rompió nada ahí — sin cambios visuales. `npm run build`/`npm test` (147/147) en
verde en back y front. Sin errores de consola.

**Severidad:** baja — puramente visual/CSS, no toca lógica ni datos.

## QA-49 — Fix real: `staging.joinnorthstack.com` nunca estuvo conectado a nada (Vercel, no código)

**Por qué existe esta tarea:** el usuario reportó que la conexión con Stripe fallaba incluso con una
key con permisos de lectura completos. La investigación arrancó ahí, pero terminó destapando que
`staging.joinnorthstack.com` — el dominio contra el que se venía "probando en staging" en sesiones
anteriores (Google Calendar, Tags, etc.) — **nunca estuvo realmente enchufado**: ni como dominio del
proyecto de Vercel, ni con una rama de Preview asignada, ni con `DATABASE_URL` configurada para
Preview. Nada de código roto — todo config/infra de Vercel, encontrado y corregido en vivo con
Alejandro, capa por capa:

1. **`STRIPE_TOKEN_ENCRYPTION_KEY` no estaba en Vercel** (`src/lib/stripeEncryption.ts`) — generada
   en 2026-08 y cargada solo en `.env` local, nunca subida a Vercel (pendiente ya documentado en
   `docs/tareas/specpaymentsv1.md` desde que se construyó Payments v1 Unit 1). Sin ella, `connectStripe()`
   tira antes de llegar a validar la key del tenant contra la API de Stripe — el mensaje real no
   tenía nada que ver con permisos/scopes de la key que el usuario probaba.
2. **`staging.joinnorthstack.com` no figuraba en Settings → Domains del proyecto** — solo estaban
   `app.joinnorthstack.com` y `northstack-two.vercel.app`, ambos Production. El dominio nunca se
   había agregado a este proyecto de Vercel.
3. Al agregarlo, hacía falta asignarlo a un ambiente Preview **atado a la rama `staging`** — no
   Custom Environments (función paga que el proyecto no tiene), sino el selector de rama estándar
   dentro del mismo diálogo "Add Domain" (gratis). Más un registro DNS (CNAME) nuevo, que tampoco
   existía.
4. Con el dominio ya bien enchufado a la rama, apareció el problema real y más grave:
   **`DATABASE_URL` solo estaba seteada para Production, nunca para Preview** — ningún deployment de
   Preview de este proyecto pudo tocar la base de datos, nunca, hasta hoy. Esto es anterior y
   más importante que el tema de Stripe: significa que todo lo "probado en staging" en sesiones
   previas (Google Calendar QA-19/23, Tags QA-45/46, etc.) se verificó por otra vía — en esta sesión
   puntual, contra un backend local apuntado a `STAGING_DATABASE_URL` vía override de env var, nunca
   contra este dominio real.
5. Agregada la variable (mismo mecanismo que con Stripe: nueva entrada, mismo nombre, scope Preview
   sin tocar la de Production), el primer intento pareció fallar — resultó ser que el campo "Value"
   se había quedado con el placeholder de ejemplo de Vercel (`postgres://user:pass@db.example.com...`)
   en vez del valor real pegado.
6. Confusión adicional en el camino: varios redeploys se dispararon sobre deployments equivocados
   (una fila no relacionada, arriba de todo en una lista sin filtrar) — se resolvió empujando un
   commit vacío a `staging` para forzar un deployment inequívocamente nuevo en vez de seguir
   adivinando cuál redeployar desde el dashboard.

**Incidente de seguridad en el camino, descartado por el usuario**: durante el paso 1, el usuario
pegó por error una Stripe secret key con prefijo `sk_live_...` en el campo de valor de
`STRIPE_TOKEN_ENCRYPTION_KEY` en Vercel — corregido. Se sugirió rotarla dado el prefijo `live`, pero
el usuario confirmó que la cuenta de Stripe en cuestión es de test, sin riesgo real — no se rotó,
sacado del backlog.

**Resultado final**: `staging.joinnorthstack.com` conecta, loguea, y la conexión de Stripe con una
key de test terminó funcionando — confirmado en vivo por el usuario. Ningún cambio de código en
este ítem, todo config de Vercel (env vars + dominio + rama).

**Severidad:** alta mientras estuvo — bloqueaba cualquier prueba real contra el dominio de staging,
no solo Stripe. Resuelta.

## QA-50 — Reemplazo del webhook manual de Stripe por un cron de polling 2x/día (Payments v1, Unidad 4 rediseñada)

**Por qué existe esta tarea:** al confirmar la conexión de Stripe en QA-49, el flujo de Unidad 4
(notificaciones proactivas) pedía un paso manual poco razonable para un tenant real: crear un
endpoint a mano en Developers → Webhooks de su propio dashboard de Stripe, tildar 5 eventos, y
copiar/pegar un signing secret de vuelta — y en `staging` encima sumarle el query param de bypass de
Vercel a la URL. El usuario pidió una alternativa más simple.

**Se evaluaron 2 alternativas antes de esta**, ambas descartadas:
1. **Auto-crear el webhook vía API** (con la misma Restricted Key + permiso "Webhook Endpoints:
   Write") — funcional, pero seguía dependiendo de un mecanismo push (webhook) más su complejidad
   asociada.
2. **Stripe Connect (OAuth)** — el usuario confirmó directo con el soporte de Stripe que requiere
   que Northstack tenga una entidad legal (LLC o equivalente) dada de alta, algo que no tiene
   todavía — mismo bloqueo ya documentado en `specpaymentsv1.md` decisión #2 desde que se diseñó
   Unidad 1. Sin entidad, no es viable, punto.

**Elegido: polling de la Events API de Stripe, cron fijo diario** (no configurable por tenant, para
no sumar UI/complejidad — decisión explícita del usuario; originalmente 2x/día, bajado a 1x/día tras
el primer intento de deploy — ver nota de Vercel Hobby más abajo). `GET /v1/events` devuelve exactamente los
mismos objetos Event que un webhook hubiera entregado, así que `processStripeWebhookEvent`
(`stripePaymentsService.ts`) se **reusa sin ningún cambio** — ni a la función ni a sus 14 tests
existentes. El cron solo pide eventos nuevos desde el último poll y se los pasa uno por uno.

**Backend**:
- `src/lib/stripe.ts`: nueva `listEvents(apiKey, { createdGte, limit?, starting_after? })` (`GET
  /events`, sin filtro de `type` — se filtra client-side en `processStripeWebhookEvent`, que ya
  ignora tipos no manejados). Se sacó `verifyStripeSignature` (sin uso posible una vez eliminado el
  webhook).
- `src/modules/integrations/stripePaymentsService.ts`: nueva `runStripeEventPolling()` — por cada
  `StripeConnection` activa, pagina `listEvents` desde `lastEventPollAt` (o `connectedAt` en el
  primer poll — nunca barre el historial completo, evitaría un aluvión de notificaciones de eventos
  ya viejos/resueltos), procesa cada evento, actualiza el cursor. Un tenant que falla (401/403 →
  `markNeedsAttention`, cualquier otro error) no frena a los demás.
- `src/routes/internal.ts`: nueva `GET /api/internal/stripe-events/poll` (mismo patrón
  `checkCronSecret` que las otras 3 rutas de cron). `vercel.json`: nueva entrada de cron, `0 9 * * *`
  (9am UTC) — **corregido después del primer deploy real**: el plan original era `0 6,18 * * *`
  (2x/día), pero el pipeline de deploy (`.github/workflows/deploy.yml`, `npx vercel deploy`) lo
  rechazó en seco: "Hobby accounts are limited to daily cron jobs." Cada cron individual de Vercel
  Hobby no puede correr más de una vez por día — no importa que ya hubiera 3 crons distintos en
  `vercel.json`, cada uno corriendo 1x/día es lo permitido; este era el primero con más de un
  horario en la misma entrada. Bajado a 1x/día para poder deployar.
- Se sacaron por completo: `POST /api/webhooks/stripe/:tenantId` (`routes/webhooks.ts`, y el mount
  `express.raw()` de `app.ts` que solo era para esa ruta), `POST
  /api/integrations/stripe/webhook-secret`, `saveStripeWebhookSecret` (`stripeService.ts`).
- Schema (`StripeConnection`, push aditivo contra `STAGING_DATABASE_URL`): se sacó
  `webhookSigningSecretEncrypted`, se agregó `lastEventPollAt DateTime?`.
- `StripeConnectionStatus` perdió el campo `hasWebhookSecret` (backend y frontend).

**Frontend** (`IntegrationsSettingsPage.tsx`): se eliminó toda la sección "Webhook" del estado
conectado (URL, botón de copiar, form de signing secret, aviso de bypass de Vercel) — el estado
conectado ahora es solo el status row (chip test/live, fecha, Disconnect) más una línea explicando
que los eventos se revisan una vez por día. El checklist de permisos recomendados de la Restricted Key sumó
**Events** (de solo lectura, igual que el resto).

**Tests**: se sacaron los ~6 tests de `saveStripeWebhookSecret`/`verifyStripeSignature` (ya no
existen), se agregaron 6 nuevos para `runStripeEventPolling` (cursor desde `connectedAt` vs.
`lastEventPollAt`, paginación, aislamiento entre tenants, `needsAttention` en 401/403, un tenant
fallando no frena a los demás). `npm run build`/`npm test` (147/147) en verde en back y front —
mismo total que antes, 6 sacados + 6 agregados.

**Verificado en vivo 2026-08-28** contra `staging` real: `CRON_SECRET` rotado (el original del 18 de
agosto se había perdido, nunca quedó anotado en ningún lado — el nuevo sí quedó en `.env` local esta
vez). Cron disparado a mano contra `staging.joinnorthstack.com/api/internal/stripe-events/poll` —
`{tenantsPolled: 1, eventsProcessed: 7, failed: 0}`, sin errores, contra eventos reales de una
cuenta de Stripe de test con pagos ya hechos. El disparo tuvo que hacerse desde la consola del
navegador del usuario (`fetch()` con el `CRON_SECRET` como header), no vía `curl` externo — la
Deployment Protection de Vercel bloquea requests externas incluso con el bypass secret de
"Protection Bypass for Automation" (no se logró hacerlo funcionar por query param esta vez, a
diferencia de cómo sí funcionó para el webhook de Google Calendar en QA-19); la sesión ya autenticada
del navegador esquiva la protección sin necesitarlo.

**Hallazgo real sobre cómo deploya este proyecto, encontrado tratando de entender por qué nada
llegaba a `staging`**: el deploy **no** pasa por la integración nativa de Git de Vercel (aunque el
proyecto la tiene conectada en el dashboard) — pasa por `.github/workflows/deploy.yml`, que corre
`npx vercel deploy` a mano con un `VERCEL_TOKEN`, y alía el resultado a `staging.joinnorthstack.com`
con `vercel alias set` al final de cada corrida. Toda la investigación de QA-49 sobre el dominio sin
conectar en el dashboard nativo era sobre un camino que este proyecto no usa para deployar en
absoluto — lo que de verdad frenó todos los pushes después de `1f790df` fue el error de Vercel
Hobby de arriba, visible recién en el Actions run del repo (`github.com/.../actions`), no en el
dashboard de Vercel.

**Severidad:** baja — elimina superficie (menos rutas, menos campos), no agrega riesgo nuevo; el
único caso a confirmar en vivo es que el cron real dispare la notificación esperada.

## QA-51 — Auto-vincular Companies a su Stripe Customer desde el cron diario

**Por qué existe esta tarea:** probando el cron de QA-50 en vivo, el dashboard de Payments mostraba
todo en cero — ninguna Company estaba vinculada a un Stripe Customer todavía, porque el único camino
para vincular era manual ("Search on Stripe" en `CompanyDetailModal`, Unit 2). El usuario pidió que
el cron mismo se encargue: revisar las Companies sin vincular, buscar coincidencias por email de sus
Contacts contra los Customers de Stripe (mismo mecanismo que ya usa "Search on Stripe"), y vincular
automático cuando el match es inequívoco.

**Backend** (`src/modules/integrations/stripePaymentsService.ts`): nueva
`autoLinkUnmatchedCompanies(tenantId)` — reusa `searchStripeCustomersForCompany`/
`linkCompanyToStripeCustomer` tal cual, sin tocarlas. Busca `Company` con `stripeCustomerId: null`,
fan-out con `mapWithConcurrency` (límite 10, mismo helper que ya usaba `getPaymentsOverview`).
Decisión de cuándo vincular: **exactamente 1 match** → vincula solo; **0 matches** → no hace nada,
se reintenta en el próximo cron (sin cursor de "ya probado" — se agrega si el volumen lo justifica
más adelante); **2+ matches** → ambiguo, se deja para el flujo manual (que ya sabe mostrar 2+
resultados para que un humano elija). Llamada desde `runStripeEventPolling`, una vez por conexión
activa, **antes** de pedir eventos — una Company recién vinculada en la misma corrida ya puede
recibir su notificación si hay un evento suyo más abajo en el mismo pase. El JSON que devuelve la
ruta del cron (`/api/internal/stripe-events/poll`) suma el campo `companiesLinked`.

**Sin UI nueva**: `CompanyDetailModal.tsx` ya renderiza "Connected to Stripe →" apenas
`Company.stripeCustomerId` está seteado (Unit 2) — vincular automático alimenta esa misma UI
existente, sin importar qué camino hizo el vínculo.

**Tests**: `tests/stripePaymentsService.test.ts` — nuevo `describe('autoLinkUnmatchedCompanies', ...)`
(1 match vincula, 0 no hace nada, 2+ no hace nada, ya-vinculada se ignora sin llamar a Stripe, una
Company fallando no frena a las demás) + un test de integración en `runStripeEventPolling`
confirmando que vincula y notifica en la misma corrida. Se corrigió de paso un bug en el mock de
`prisma.company.findMany` de este archivo de tests (no distinguía `stripeCustomerId: null` de
`{ not: null }`, encubría el escenario que este QA necesitaba probar). `npm run build`/`npm test`
(153/153, 147 + 6 nuevos) en verde.

**Severidad:** baja — solo automatiza un flujo manual ya existente y probado (Unit 2), mismas
funciones, mismas reglas de ambigüedad.

**Bug real encontrado al probar en vivo** (primera vez que este código corrió contra una Company
realmente vinculada, con charges reales — nada lo había ejercitado hasta ahora): "Blue Harbor
Logistics" se auto-vinculó bien, pero el panel de pagos tiraba "Failed to load payment history:
Failed to construct 'URL': Invalid URL". Causa: `getCompanyPaymentEvents`
(`frontend/src/api/payments.ts`) armaba la URL con `new URL(...)`, que tira si el string es
relativo sin un `base` — y `API_BASE_URL` es `''` en producción/staging (frontend y backend
comparten origen ahí), a diferencia de local donde apunta a `http://localhost:3000`. El resto de
las funciones de ese archivo ya concatenaban el string directo; se corrigió `getCompanyPaymentEvents`
para hacer lo mismo.

## QA-52 — Fix: botón "Volver" de Settings dejaba al usuario varado

**Bug:** `SettingsSidebar.tsx` usaba `navigate(-1)` (volver al historial del navegador). Si alguien
llegaba a `/settings` directo (link compartido, refresh, nueva pestaña) sin historial previo dentro
de la app, el botón no llevaba a ningún lado útil.

**Fix:** `navigate('/overview')` — destino fijo, mismo criterio que el resto de la navegación de
Settings (no depende del historial del navegador).

**Severidad:** baja — un solo caso de borde de navegación, sin impacto en datos.

## QA-53 — Proceso de Termination de empleados (baja definitiva)

**Por qué existe esta tarea:** ítem pendiente del backlog original de la sesión ("falta proceso de
termination para dar de baja empleados y marcarlos inactivos"), que el usuario había dejado
explícitamente parado hasta poder definirlo. Se planificó con el usuario (`AskUserQuestion` +
`ExitPlanMode`, plan completo revisado y aprobado — incluida una vuelta extra pidiendo el detalle de
qué ve el usuario desde el front antes de aprobar).

**Decisiones clave confirmadas con el usuario:** (1) status nuevo "Terminated" propio, no reusar
"Inactive"; (2) cortar acceso a la plataforma es un checkbox opcional, no automático; (3) los
reportes directos se avisan y se pueden reasignar en el mismo flujo, no bloquean la baja; (4)
**la fecha de baja soporta pasado, hoy, y futuro** — esta última decisión es la que obligó a un
modelo de ejecución diferida (ver abajo) en vez de una simple mutación síncrona.

**Modelo nuevo** (`prisma/schema.prisma`): `EmployeeTermination` (registro de auditoría — nunca se
pisa ni se borra, se marca `executedAt`/`cancelledAt`) y `EmployeeTerminationReassignment` (un row
por cada reporte directo del empleado dado de baja, con su `newManagerId` elegido o `null`).

**Backend** (`src/modules/hr/terminationService.ts`, nuevo):
- `createTermination` — valida que el empleado no esté ya Terminated y que no tenga una baja
  programada pendiente; arma la lista completa de reasignaciones (los reportes no tocados por el
  admin también quedan con `newManagerId: null`, no solo los que aparecieron en el modal); si se
  incluyó un pago final, lo crea de inmediato vía `createOffPayments` (Payroll Unidad 18/19, sin
  código nuevo ahí) sin importar si la baja es inmediata o futura; si `terminationDate <= hoy`,
  ejecuta todo en el mismo request.
- `executeTermination` (interna, reusada por el camino inmediato y por el cron) — status →
  "Terminated" (find-or-create por tenant, nunca `isDefault`), `endDate`, cierra la
  `EmployeeCompensation` abierta (`effectiveTo = terminationDate`, lo que realmente saca al empleado
  de futuros Payroll runs), corta acceso (`User.status = 'inactive'`) si `revokeAccess` y hay
  usuario vinculado, cancela Time Off pendiente/aprobado-a-futuro disparando
  `syncTimeOffCalendarEvent` (no un update crudo, para que la limpieza en Google Calendar de otros
  usuarios se dispare sola), y aplica cada reasignación de manager.
- `runScheduledTerminations` — cron diario nuevo (`GET /api/internal/employee-terminations/run`,
  10am, mismo patrón que los otros 4 crons de `src/routes/internal.ts`), ejecuta lo vencido, una
  falla no frena a las demás.
- `cancelTermination` — solo antes de `executedAt`; idempotente si ya estaba cancelada.
- Rutas nuevas en `src/routes/employees.ts`: `GET/POST .../termination`, `POST
  employee-terminations/:id/cancel`. Incluir un pago final requiere `canManagePayroll` además del
  `canCreateHr` que ya gatea toda la ruta.

**Frontend**: `EmployeeOverviewPanel.tsx` suma una entrada "Terminate" al menú de acciones (oculta
si el empleado ya está Terminated o tiene una baja programada pendiente) y un aviso "Scheduled
termination: [fecha]" con botón Cancel cuando corresponde. Nuevo
`TerminateEmployeeModal.tsx`: date picker de último día, sección de reportes directos con un
`SearchableSelect` de reasignación por cada uno (solo si tiene), checkbox "Also revoke their access
to Northstack" (solo si tiene usuario vinculado), checkbox "Include a final payment" con su
sub-formulario (monto/moneda/fecha/label — solo visible si el usuario tiene `canManagePayroll`), y
botón de confirmar con texto dinámico: "Terminate now" vs "Schedule termination" según la fecha
elegida.

**Tests**: `tests/terminationService.test.ts`, nuevo, 18 tests (creación inmediata, creación
programada, cancelación, el cron, `listDirectReports`/`getLatestTermination`). `npm run
build`/`npm test` en verde (171/171). Además, verificado con un script ad-hoc corriendo
`runScheduledTerminations()` directo contra `STAGING_DATABASE_URL` real (no solo el mock de los
tests) para confirmar que el schema nuevo (`EmployeeTermination`/
`EmployeeTerminationReassignment`) llegó bien a la base de staging — corrió sin errores.

**Pendiente de verificación en vivo por el usuario en `staging.joinnorthstack.com`** (esta vez no lo
hice yo — no había una sesión de browser automation disponible en este entorno para hacerlo):
terminar un empleado de prueba con fecha de hoy y confirmar status/endDate/que desaparece de
Payroll/que se cancela su Time Off/que el pago final aparece en el timeline; programar una baja a
futuro y confirmar que no se aplica hasta que corra el cron.

**3 problemas reales encontrados por el usuario probando en vivo, corregidos en el mismo día:**

1. **El campo Status quedaba editable después de la baja, y encima mostraba "-- select --"** en vez
   de "Terminated": `activeEmployeeStatuses` (`EmployeesPage.tsx`) se había cargado antes de que
   `getOrCreateTerminatedStatusId` creara el status "Terminated" por primera vez en ese tenant — el
   `<select>` no encontraba esa opción en su lista y caía al placeholder. Peor aún, aunque hubiera
   mostrado bien el valor, seguía siendo un `AutoSaveSelect` editable — cualquiera podía revertir la
   baja a mano eligiendo "Active" de nuevo, sin pasar por ningún flujo real de "rehire" (que
   deliberadamente no se construyó en esta ronda) y sin deshacer ninguno de los otros efectos
   (compensación, acceso, Time Off). **Fix**: `EmployeeOverviewPanel.tsx` ahora renderiza un
   `StatusChip` de solo lectura en vez del `AutoSaveSelect` cuando `employee.statusDefn?.name ===
   'Terminated'` — no depende de que la lista de statuses esté actualizada, y cierra el backdoor.
2. **El pago final (y cualquier "One-off Payment" de Payroll, no solo los de termination) aparecía
   como "undefined undefined" en el Timeline** — bug preexistente, no introducido por esta tarea,
   pero recién visible ahora que el usuario probó con datos reales. Causa:
   `listOffPayments` (`payrollOffPaymentService.ts`) devolvía el include anidado crudo de Prisma
   (`{ employee: { firstName, lastName } }`) en vez de aplanarlo a `employeeFirstName`/
   `employeeLastName` — que es el contrato que espera el frontend y el patrón que sigue *todo* el
   resto de las funciones de listado de este módulo (`payrollRunService`,
   `employeeCompensationService`, etc.). Sin tests que lo hubieran agarrado antes (el módulo de
   Payroll no tenía tests unitarios para esta función). **Fix**: se aplanó la respuesta; se sumó
   `tests/payrollPaymentHistory.test.ts` como regresión.
3. **Feature nueva pedida por el usuario**: tab "Payment History" en el perfil de cada empleado
   (gateado por `canManagePayroll`, mismo criterio que la sección Compensation), con fecha/motivo/
   descripción de cada pago — corridas confirmadas de Payroll y pagos sueltos, no solo los de
   termination. Nueva `listPaymentHistoryForEmployee(tenantId, employeeId)` en
   `payrollEntryService.ts` (excluye entries de runs en `draft`, todavía no son un pago real) + ruta
   `GET /api/hr/employees/:employeeId/payment-history`.

`npm run build`/`npm test` en verde (174/174, 171 + 3 nuevos).

**Ronda 3 (mismo día)**: el usuario todavía no podía "abrir" el pago desde ninguno de los dos
lugares, y pidió también poder ver el "recibo de sueldo" del que se había hablado en una
conversación anterior. Investigando, ese recibo **ya existía** — Payroll Unidad 20
(`payslipService.ts`, `buildPayslipForEntry`/`buildPayslipForRunEmployee`, PDF "PREVIEW — NOT
ISSUED" vía `pdf-lib`) — con sus dos rutas (`GET .../entries/:id/payslip` y `GET
.../runs/:runId/employees/:employeeId/payslip`) y su cliente frontend (`api.getEntryPayslip`/
`api.getRunEmployeePayslip`) completos de punta a punta, pero **nunca se había conectado a ninguna
UI salvo el botón de vista previa por persona dentro del detalle de un Run**. Se sumó el mismo
ícono de ojo ("Payslip preview", `PayslipPreviewModal` reusado tal cual) a las filas de pagos
sueltos en el Timeline de Payroll y a cada fila de la nueva tab Payment History del perfil — sin
tocar nada del backend, la funcionalidad ya estaba completa, solo faltaba el link.

**Ronda 4 (mismo día)**: pedido explícito de que el pago final de Terminate soporte "exactamente las
mismas opciones que cuando se desarrolla un payroll normal" — es decir, no solo un monto suelto sino
también bonus/commission/reimbursement/deduction, igual que las líneas de "+ Adjustments" de un Run
o el modal "One-off Payment" de Payroll. El modal de Terminate ahora deja agregar N líneas
adicionales (mismo Type/Amount/Note que esos dos lugares, mismos 4 tipos, mismo signo negativo
automático para `deduction`) debajo del pago principal. Cada línea se crea como su propio
`PayrollEntry` (un `createOffPayments` por línea, porque esa función solo acepta un `type` por
llamada). `EmployeeTermination.finalPaymentEntryId` (uno solo) pasó a `finalPaymentEntryIds`
(array) — el campo nunca se leía en ninguna UI, así que es un rename limpio, no un cambio de
comportamiento visible. Se pusheó el schema (`prisma db push`) contra `STAGING_DATABASE_URL`,
aceptando la pérdida de 1 valor no-nulo del campo viejo (el `PayrollEntry` real al que apuntaba
sigue intacto, solo se perdió el puntero interno no usado). `npm run build`/`npm test` en verde
(175/175, 174 + 1 nuevo).

**Ronda 5 (mismo día)**: feedback puramente de UI — el modal quedó comprimido una vez que se sumaron
las líneas de ajuste. Se pasó de tamaño default (448px) a `wide` (768px, mismo prop que ya usa
`Modal.tsx`), y se agregó una leyenda (`alert-info`) arriba de "Last day" explicando qué hace el
botón antes de que el usuario elija una fecha: termina el contrato y el status pasa a Terminated.
Cambio solo de frontend, sin tests nuevos.

**Fuera de alcance, anotado para más adelante:** reactivar/rehire a alguien terminado; arreglar el
hard-delete roto preexistente de `deleteEmployee` (bug real pero no de esta tarea — termination es
la alternativa correcta a usar en su lugar); campo de "razón de baja" (no se pidió, `EmployeeTermination`
es el lugar natural si se suma después).

**Severidad:** — (feature nueva, no bug). Plan completo:
`C:\Users\aleja\.claude\plans\bueno-yo-te-voy-valiant-whisper.md`.

## QA-54 — Payments: página completa de historial de pagos por Company

**Por qué existe esta tarea:** en `PaymentsOverviewPage.tsx` (Payments v1, Unidad 3), el link de
cada fila de Company llevaba directo al perfil de la Company — sin forma de ver el historial de
pagos real (fecha, monto, estado, recibo) desde ahí. El usuario pidió invertir esa navegación: el
link de Payments debía abrir el historial de pagos, con un link aparte para llegar al perfil si
hacía falta; y agregó que el mismo historial completo debía poder abrirse también desde el lado de
la Company.

**Frontend**: tabla Date/Amount/Status/Receipt con paginación ("Load more", reusa
`getCompanyPaymentEvents` tal cual), más un link "View company profile →" arriba. El link de
Company en `PaymentsOverviewPage.tsx` abre esto en vez de navegar directo al perfil. Desde el lado
de Company, `CompanyStripeSection.tsx` (la sección "Payments" de `CompanyDetailModal`) suma un link
"View full payment history →" junto a "Connected to Stripe →".

**Corrección (mismo día)**: la primera versión era una página con ruta propia
(`/payments/companies/:companyId`). El usuario notó que rompía el patrón del resto de la app — toda
vista de detalle (`CompanyDetailModal`, `EmployeeOverviewPanel`, etc.) es un overlay, no una
navegación de página — así que se convirtió a `CompanyPaymentHistoryModal.tsx` (mismo `Modal`
`wide`, mismo contenido) y se eliminó la ruta. Abrirlo desde dentro de `CompanyStripeSection`
implica un Modal anidado dentro de otro (`CompanyDetailModal`) — patrón ya resuelto en este proyecto
(mismo caso que `PayslipPreviewModal` desde `EmployeeOverviewPanel`, `Modal.tsx` ya hace
`stopPropagation()` en Escape para no cerrar las dos capas a la vez).

**Backend**: `StripeCharge` (`src/lib/stripe.ts`) no tenía tipado el campo `receipt_url` de
Stripe — el objeto Charge ya lo trae por default (sin necesidad de `expand`), simplemente nunca se
había declarado en la interfaz ni pasaba a través de `chargeToEvent`
(`stripePaymentsService.ts`). Se agregó `receiptUrl` a `StripePaymentEvent` y se expone también en
la lista abreviada que ya vivía inline en `CompanyStripeSection` (antes solo mostraba el link al
dashboard admin de Stripe, no un recibo apto para el cliente). Sin ruta nueva — reusa
`GET /api/payments/companies/:id/events` tal cual, ya paginado.

`npm run build`/`npm test` en verde (175/175).

**Severidad:** — (feature nueva, no bug).

## QA-55 — Company profile: la sección Payments pasa a ser una vista general (cierra Payments v1)

**Por qué existe esta tarea:** último pedido del usuario sobre Payments — la sección "Payments" de
`CompanyDetailModal` (`CompanyStripeSection.tsx`) todavía mostraba una mini-lista de eventos con
link al dashboard de Stripe, recibo y fecha por evento, duplicando lo que QA-54 ya resuelve del todo
en el modal de historial completo. Pedido explícito: dejar ahí **solo** un resumen general —
Payments/Refunds/Disputes con su conteo y monto — sin recibos ni fechas por evento, salvo la fecha
del primer pago.

**Frontend**: se eliminó la lista de eventos + "Load more" de `CompanyStripeSection.tsx` (ese detalle
ya vive en el modal de QA-54, a un click via "View full payment history →", que se mantiene). El
resumen ahora muestra: **Payments** (cantidad + monto), **Refunds** (cantidad + monto), **Disputes**
(cantidad + monto), y **First payment** (fecha del más antiguo). Se sacaron del render "Failed
payments" y "Subscription" — siguen existiendo en el tipo/backend (los sigue usando
`PaymentsOverviewPage.tsx` para sus propias tarjetas/columnas), solo dejaron de mostrarse acá.

**Backend**: `summarizeCharges` (`stripePaymentsService.ts`) suma 3 campos nuevos a
`StripePaymentSummary` — `paymentsCount`/`paymentsAmountCents` (cargos `succeeded`, nunca se había
expuesto un total, antes solo había refunds/failed) y `disputesCount`/`disputesAmountCents`
(cargos con `charge.disputed === true` — campo nativo del objeto Charge de Stripe, mismo patrón que
`refunded`/`amount_refunded`, sin llamada nueva a `/v1/disputes`). `firstPaymentAt` toma el `created`
más antiguo entre los cargos `succeeded` ya traídos (mismo límite de 100 cargos ya documentado para
el resto de este resumen — no pagina hasta el final solo para encontrar el primero). Extensión
aditiva, no rompe `PaymentsOverviewPage.tsx` ni `getPaymentsOverview` (siguen usando los campos
viejos tal cual).

`npm run build`/`npm test` en verde (175/175). Con esto el usuario dio por cerrado Payments v1.

**Severidad:** — (feature nueva, no bug).

---

## QA-56 — Activity Log, Unidad 1: schema + mecanismo genérico, sin superficie funcional todavía (2026-08-30, en `staging`)

**Por qué existe esta tarea:** primera unidad del módulo de Activity Log
(`docs/general/spec-activity-log.md`, 6 unidades) — pedido explícito del usuario: un tab de
actividad por registro en los modales de Employee/Company/Contact/Opportunity, más un feed
tenant-wide en Settings. Esta unidad es **solo schema + el servicio genérico + rutas** — ningún
service del resto de la app llama a `recordActivity` todavía, así que no hay ningún dato real que
se pueda generar de uso normal de la app. El objetivo de esta tarea es una verificación de
regresión + de plomería (rutas responden como se espera), no una prueba de feature nueva — eso
llega con la Unidad 2 (wiring) y la Unidad 3 (frontend).

### A. Regresión — nada existente se movió

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Uso normal de la app (crear/editar/borrar un Employee/Company/Contact/Opportunity) | Se comporta exactamente igual que antes — esta unidad no toca ningún service existente |
| 2 | `npm run build`/`npm test` (backend, 194/194) y `npm run build` (frontend) | Los tres en verde |

### B. Confirmar el estado en `staging`

| # | Caso | Resultado esperado |
|---|---|---|
| 3 | Listar tablas de `staging` (`information_schema.tables`) | Existe `ActivityLogEntry`, vacía (0 filas) — nada la escribe todavía |
| 4 | `GET /api/activity?entityType=opportunity&entityId=<id-real>` con un token válido | `200`, array vacío `[]` (no hay filas), no 500 |
| 5 | Mismo caso que 4, pero con un `entityId` que pertenece a otro tenant | `404` — mismo criterio de ownership que Tasks/Notes (`findEntityTenantId`) |
| 6 | `GET /api/activity/feed` con un usuario `member` | `403` — `canViewActivityLog` es owner/admin únicamente |
| 7 | `GET /api/activity/feed` con un usuario `owner` o `admin` | `200`, `{items: [], nextCursor: null}` |
| 8 | `GET /api/activity/feed?entityType=algo-invalido` | `400` ("Unsupported entityType"), no 500 |

### Al encontrar una falla

Todo lo de esta unidad es plomería sin superficie de usuario — cualquier falla es baja prioridad
salvo que rompa algo de A (regresión sobre lo que ya funcionaba) o que el gate de permisos de B.6
no se respete (eso sería alta severidad, mismo criterio que cualquier otro endpoint owner/admin-only
de la app).

---

## QA-57 — Activity Log, Unidad 2: wiring real de Employee/Company/Contact/Opportunity (2026-08-30, en `staging`)

**Por qué existe esta tarea:** primera unidad que genera filas reales de `ActivityLogEntry` —
create/update/delete de las 4 entidades del CRM/HR (más sus custom field values) ahora registran
actividad, pero **todavía no hay ninguna pantalla que la muestre** (eso es la Unidad 3). Esta tarea
verifica por `curl`/query directa que el dato que se está grabando es correcto, antes de construir
la UI encima. Ver `docs/general/spec-activity-log.md` §6 para el scope cut explícito: solo la ruta
directa de cada entidad genera entradas — CSV import, onboarding seed data y Public Forms **no**
todavía (documentado, no un bug).

### A. Create/update/delete de cada entidad

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | `POST /api/hr/employees` con datos completos | Se crea una fila en `ActivityLogEntry` (`entityType: employee`, `action: create`, `changedByUserId` = el usuario del token), `summary` dice `Created Employee "Nombre Apellido"` |
| 2 | `PATCH /api/hr/employees/:id` cambiando `departmentId`/`statusId`/`managerId` | Fila `action: update`; `changes` (JSON) trae el campo con `oldValue`/`newValue` ya como **nombre legible** (nombre del departamento/status/manager), no el id crudo |
| 3 | `DELETE /api/hr/employees/:id` | Fila `action: delete`, `summary` dice `Deleted Employee "..."` |
| 4-6 | Repetir 1-3 con `POST/PATCH/DELETE /api/companies` | Mismo patrón — `sizeId`/`accountOwnerId`/`parentCompanyId` resueltos a nombre, no id |
| 7-9 | Repetir 1-3 con `POST/PATCH/DELETE /api/contacts` (el 3° es `DELETE`, que en realidad desactiva — ver `deactivateContact`) | El `DELETE` (desactivación) genera `action: delete` igual que un borrado real, no un `update` de `isActive` |
| 10-12 | Repetir 1-3 con `POST/PATCH/DELETE /api/opportunities` | `amountCents` resuelto a monto formateado con símbolo de moneda (ej. `$10,000.00`), no el número de centavos crudo; `stageId`/`pipelineId`/`ownerId`/`lossReasonId`/`winReasonId` resueltos a nombre |
| 13 | Un `PATCH` que no cambia ningún campo trackeado (ej. mandar el mismo valor que ya tenía) | **No** se crea ninguna fila — `recordActivity` salta un update sin cambios reales |

### B. Custom field values

| # | Caso | Resultado esperado |
|---|---|---|
| 14 | Crear un valor de custom field en un Employee/Company/Contact | Fila `action: update` contra la entidad **dueña** (no un tipo de entidad propio) — `changes` trae `{field: <id de la definición>, label: <nombre del custom field>, oldValue: null, newValue: <valor>}` |
| 15 | Editar ese valor | Fila `update`, `oldValue`/`newValue` correctos |
| 16 | Borrarlo | Fila `update`, `newValue: null` |

### C. Scope cut — confirmar que NO se genera nada en los 3 orígenes deferidos

| # | Caso | Resultado esperado |
|---|---|---|
| 17 | Importar Employees vía CSV (`POST /api/hr/employees/import/csv`) | Los empleados se crean normalmente (sin regresión), pero **no** aparece ninguna fila nueva en `ActivityLogEntry` para ellos — comportamiento esperado por ahora, documentado en el spec |
| 18 | "Load sample data" del checklist de onboarding | Mismo caso — los empleados/clientes de ejemplo se crean, sin filas de Activity Log |
| 19 | Enviar un Form público que crea un Contact/Opportunity | Mismo caso — sin filas de Activity Log (tampoco hay usuario autenticado a quien atribuirlas) |

### D. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 20 | `npm run build`/`npm test` (backend, 207/207) y `npm run build` (frontend) | Los tres en verde |
| 21 | Uso normal de la app (crear/editar/borrar cualquiera de las 4 entidades desde la UI) | Se comporta exactamente igual que antes — nada visible cambió todavía, la escritura de Activity Log es invisible (best-effort, nunca puede romper ni frenar la operación real) |

### Al encontrar una falla

A/B son las que importan: si una entrada no se genera cuando debería, o los valores de FK quedan
como id crudo en vez de nombre legible, es severidad media (no rompe nada visible hoy, pero
contamina el dato que la Unidad 3 va a mostrarle al usuario). D es alta severidad si algo de la
operación real (no solo el log) se rompió — la escritura de Activity Log nunca debería poder causar
esto (`bestEffort`), así que si pasa, revisar primero si el bug está en el código nuevo alrededor de
la llamada a `recordActivity`, no en `bestEffort` en sí.

---

## QA-58 — Activity Log, Unidad 3: frontend — tab del modal + Settings (2026-08-30, en `staging`)

**Por qué existe esta tarea:** primera superficie visible del módulo — el tab "Activity" de los 4
modales de detalle (Employee/Company/Contact/Opportunity) deja de ser un placeholder, y se agrega
`Settings → Activity Log` (owner/admin) con filtros. Verificado con Playwright real contra `staging`
durante el desarrollo (login, editar el campo Industry de una Company real, confirmar que la entrada
aparece tanto en el tab del modal como en el feed de Settings, con el diff correcto) — screenshots
tomados en esa sesión, no solo curl. Esta tarea es la pasada de confirmación humana que falta.

### A. Tab "Activity" en los 4 modales de detalle

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Abrir el modal de detalle de un Employee/Company/Contact/Opportunity con actividad real | Tab "Activity (N)" con el conteo correcto, cada fila con avatar, ícono de acción (+/lápiz/tacho), summary, "Nombre · fecha y hora" |
| 2 | Click en "Show detail" de una fila con cambios de campo | Expande una lista `Campo: valor viejo → valor nuevo` (o "empty" si vacío) — "Hide detail" para volver a colapsar |
| 3 | Una fila de `create` o `delete` | Summary dice "Created/Deleted [Tipo] "Nombre"" — sin necesariamente listar cada campo en el summary (el detalle completo sigue disponible al expandir) |
| 4 | Un registro sin actividad todavía (creado antes de esta unidad, o vía un origen que no genera log — CSV import, seed, Public Form) | Tab dice "Activity" sin número, cuerpo "No activity yet." — no un error |
| 5 | Editar un campo en vivo (ej. cambiar el Status de un Employee) y volver a abrir el tab Activity sin cerrar el modal | La entrada nueva aparece sin necesidad de refrescar la página (el tab recarga al montarse — confirmar si hace falta cerrar/reabrir el tab para verla, y si eso se siente lento) |

### B. `Settings → Activity Log`

| # | Caso | Resultado esperado |
|---|---|---|
| 6 | Usuario `owner` o `admin` → Settings → tile/nav "Activity Log" | Feed tenant-wide, más reciente primero, con badge de tipo de entidad (Employee/Company/Contact/Opportunity) en cada fila |
| 7 | Usuario `member` → navegar a `/settings/activity` a mano | "Activity Log is only visible to workspace owners and admins." — sin tile/nav item visible tampoco en su Settings |
| 8 | Filtro "All types" → elegir una entidad específica | El feed se reduce a solo esa entidad |
| 9 | Filtro "All actions" → Created/Updated/Deleted | El feed se reduce a esa acción |
| 10 | Filtro "Anyone" → elegir un usuario del tenant | El feed se reduce a lo que cambió esa persona |
| 11 | Selector de rango de fecha (mismo componente que Dashboards) → cambiar el preset o un rango custom | El feed se recarga con esa ventana; default "Last 6 months" al entrar |
| 12 | Con más de 50 entradas en el rango | Aparece "Load more" al pie; click trae la página siguiente sin perder lo ya cargado |
| 13 | Sin ninguna entrada en el rango/filtro elegido | "No activity in this range." — no un error ni una tabla vacía sin mensaje |

### Al encontrar una falla

A.1-A.3 son el corazón de esta unidad — si el tab no carga, cuenta mal, o el diff sale con valores
crudos en vez de nombres legibles, es severidad media-alta (dato visible pero incorrecto). B.7 es
alta severidad si un `member` logra ver el feed (gate roto) — confirmar que también el `GET /api/activity/feed`
da 403, no solo que la UI lo esconde. El resto es medio/bajo — filtros y paginación que no andan
son molestos pero no exponen ni corrompen datos.

---

## QA-59 — Activity Log, Unidad 4: extensión a HR/Payroll (2026-08-30, en `staging`)

**Por qué existe esta tarea:** extiende el wiring de Unidad 2 a 10 entidades más de HR/Payroll —
TimeOffPolicy, TimeOffRequest, StatusDefinition, CustomFieldDefinition, FieldCatalogDefinition,
PayFrequency, PaymentMethod, EmployeeCompensation (create-only, versionado), EmployeeTermination,
PayrollRun. Ninguna de estas tiene modal de detalle propio, así que solo se ven en
`Settings → Activity Log` (ya construido en QA-58), no en un tab — no hay superficie nueva de UI en
esta unidad. Verificado con una corrida directa contra `staging` (crear/editar una Time Off Policy,
un Status y una Pay Frequency reales, confirmar las 5 filas resultantes con el diff correcto,
incluyendo `daysPerYear: 10 → 15` y el nombre resuelto en vez del id crudo).

### A. Confirmar en `Settings → Activity Log` (filtro "All types")

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Crear/editar una Time Off Policy (`/hr/time-off` → Policies) | Filas `Created Time Off Policy "..."` / `Changed Days per year: X → Y`, etc. |
| 2 | Un empleado pide Time Off, y su manager lo aprueba/rechaza | Fila `create` al pedirlo, fila `update` al decidirlo — `changes` trae el nombre de la Policy, no su id |
| 3 | Crear/editar un Status, un Custom Field, o un valor de catálogo (Department/Job Title/etc.) desde el header de columna de cualquier tabla | Filas correspondientes, `entityLabel` incluye a qué módulo pertenece (ej. "Active (employee)") |
| 4 | Crear/editar una Pay Frequency o un Payment Method (`/hr/payroll` → Payment Policies) | Filas correspondientes |
| 5 | Dar de alta el contrato inicial de un Contractor/Employee | Fila `create` de tipo Compensation — confirmar que **no** aparece ningún dato de cuenta bancaria/IBAN ni el PDF, ni siquiera cifrado |
| 6 | Reasignar/dar un aumento a alguien ya confirmado | Nueva fila `create` de Compensation (nunca `update` — cada cambio es un registro nuevo) |
| 7 | Dar de baja a un empleado (Terminate), y luego cancelar una baja programada a futuro | Fila `create` al dar de baja, fila `update` al cancelar |
| 8 | Crear un Payroll Run y confirmarlo | Fila `create` al crearlo, fila `update` (`Status: draft → confirmed`) al confirmarlo |
| 9 | Importar Employees vía CSV, o usar "Load sample data" del onboarding | Sin regresión (se crean igual que siempre) — pero **tampoco** deberían generar filas de EmployeeCompensation/etc. si esos flujos no pasan por las funciones tocadas acá (la mayoría de este caso ya está cubierto por QA-57 C, esto es solo para notar si algo cambió) |

### B. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 10 | `npm run build`/`npm test` (backend, 207/207) y `npm run build` (frontend) | Los tres en verde |
| 11 | Uso normal de cualquiera de las 10 entidades desde la UI (crear/editar Time Off, Payroll, catálogos) | Se comporta exactamente igual que antes — la escritura de Activity Log es invisible y best-effort |

### Al encontrar una falla

El caso A.5 es el más sensible — si aparece cualquier dato de cuenta bancaria/IBAN/PDF en una
entrada de Activity Log, es severidad **alta** (fuga de dato sensible), aunque esté "solo" en la
base y no expuesto todavía en ninguna UI de Settings visible a todos. El resto sigue el mismo
criterio que QA-57: dato incorrecto es media, regresión en la operación real es alta.

---

## QA-60 — Activity Log, Unidad 5: resto de CRM + cross-module + vistas/forms (2026-08-30, en `staging`)

**Por qué existe esta tarea:** extiende el wiring a Pipeline, PipelineStage, Task, Note, Tag,
SavedView, PublicForm. Ninguna tiene modal de detalle propio (Task/Note tienen su propio tab dentro
del modal de otra entidad, pero **no** aparecen ahí como actividad — ver decisión #7 del spec: cada
Task/Note genera su propia fila de Activity con `entityType: task/note` y `entityId` = el id de la
Task/Note misma, no de la entidad a la que está adjunta, así que naturalmente no se mezcla con el
tab de esa entidad). Solo visible en `Settings → Activity Log`. Verificado con una corrida directa
contra `staging` (crear/editar/borrar una Task, crear una Note, asignar un Tag — 5 filas confirmadas
con el summary correcto, incluyendo el borrado de la Task mostrando su último título).

### A. Confirmar en `Settings → Activity Log`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Crear/editar/archivar un Pipeline (`/settings/pipelines`) | Filas `Created/Updated Pipeline "..."` |
| 2 | Agregar/editar/reordenar un Stage dentro de un Pipeline | Filas de tipo Pipeline Stage |
| 3 | Crear/editar/completar/borrar una Task desde cualquier panel de detalle | 4 filas de tipo Task — la de completar es un `update` (`Completed: empty → <fecha>`) |
| 4 | Crear/editar/borrar una Note | Filas de tipo Note |
| 5 | Agregar/quitar un Tag en un Employee/Company/Contact | Filas `Created Tag "nombre (tipo)"` / `Deleted Tag "..."` |
| 6 | Crear/editar/borrar una Saved View (personal o compartida) | Filas de tipo Saved View |
| 7 | Crear/editar un Public Form (`/settings/public-forms`) | Filas de tipo Public Form — confirmar que un submit anónimo del form público (`/apply/...`) **no** genera ninguna fila (sin usuario autenticado, mismo criterio que Public Forms en QA-57 C.19) |

### B. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | `npm run build`/`npm test` (backend, 207/207) y `npm run build` (frontend) | Los tres en verde |
| 9 | Uso normal de cualquiera de las 7 entidades desde la UI | Sin cambios visibles — la escritura de Activity Log es invisible y best-effort |

### Al encontrar una falla

Mismo criterio que QA-57/QA-59: dato incorrecto o entrada faltante es severidad media; una
regresión en la operación real (crear/editar/borrar deja de funcionar) es alta.

---

## QA-61 — Activity Log, Unidad 6 (parcial): cuenta/plataforma (2026-08-30, en `staging`) — cierra el spec

**Por qué existe esta tarea:** última unidad del spec — Tenant (currency/plan), User (rol/status),
Invitation (alta/cancelación/aceptación). Deliberadamente **no** incluye Subscription/Google
Calendar/Stripe (ver `docs/general/spec-activity-log.md` §6 para el motivo). Verificado con una
corrida directa contra `staging` (cambiar la moneda del tenant, crear y cancelar una invitación —
3 filas confirmadas, incluyendo el diff `Status: pending → revoked`).

### A. Confirmar en `Settings → Activity Log`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Cambiar la moneda del tenant (`/settings/appearance`) | Fila `Changed Currency: USD → ARS` (o el par que corresponda) |
| 2 | Elegir/cambiar de plan desde `PlansModal` (antes de tener billing activo) | Fila de tipo Workspace con el cambio de `Plan` |
| 3 | Promover a alguien a owner, o cambiar el rol/status de un usuario (`/settings/users`) | Fila de tipo User — confirmar que **nunca** aparece `passwordHash` en el detalle, solo `role`/`status` |
| 4 | Invitar a alguien nuevo, y cancelar una invitación pendiente | Fila `create` al invitar, fila `update` (`Status: pending → revoked`) al cancelar |
| 5 | Aceptar una invitación (crear cuenta desde el link) | Fila `update` (`Status: pending → accepted`) — el actor es la propia persona que acepta, no quien invitó |
| 6 | Conectar/desconectar Google Calendar o Stripe, o cambiar de plan/cancelar la propia suscripción de Northstack desde Billing | Al momento de escribir esto (2026-08-30) **no** generaba ninguna fila — scope cut deliberado de esta unidad. **Actualizado 2026-08-31 en QA-63**: esto ya no es así, estos casos ahora sí quedan registrados — ver QA-63 |

### B. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 7 | `npm run build`/`npm test` (backend, 207/207) y `npm run build` (frontend) | Los tres en verde |
| 8 | Uso normal de cuenta/usuarios/invitaciones desde la UI | Sin cambios visibles |

### Al encontrar una falla

El caso A.3 es el más sensible — si aparece `passwordHash` o cualquier dato de contraseña en una
entrada de Activity Log, es severidad **alta** (fuga de credencial). El resto sigue el criterio ya
establecido: dato incorrecto es media, regresión funcional es alta.

**Nota (2026-08-31): esta afirmación quedó desactualizada un día después** — ver QA-63, Alejandro
pidió explícitamente cubrir Subscription/GoogleCalendarConnection/StripeConnection y se completó
la unidad.

---

## QA-62 — Fix same-day: Notes/Tasks/Tags no aparecían en el Activity del modal de su propia entidad (2026-08-30, en `staging`)

**Por qué existe esta tarea:** Alejandro probó el módulo recién shippeado en un Employee real
("Alejandro Bravo"), creó una Note, y el tab Activity de ese mismo modal seguía diciendo "No
activity yet." — la decisión original (QA-58, decisión #7 del spec) excluía Task/Note del tab de
Activity a propósito, asumiendo que sería redundante con sus propios tabs. En la práctica no era lo
esperado. Fix: `ActivityLogEntry` ganó `parentEntityType`/`parentEntityId` (push aditivo) — Task/
Note/Tag siguen logueándose contra sí mismas (el summary sigue diciendo "Created Note ...", no
miente), pero ahora también cargan a qué entidad están adjuntas, y `listActivityForEntity` las
incluye. Verificado con una corrida directa contra `staging` (crear una Note en una Company real,
confirmar que aparece en el feed de esa Company vía la misma función que usa el tab del modal).

### A. Confirmar en el tab Activity de cualquier modal de detalle

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Crear una Note en un Employee/Company/Contact/Opportunity, abrir el tab Activity de ese mismo registro | Aparece `Created Note "..."` — ya no dice "No activity yet." si es la única actividad |
| 2 | Editar/borrar esa Note | Aparecen las filas correspondientes en el mismo tab |
| 3 | Crear/editar/completar/borrar una Task en el mismo registro | Mismo comportamiento — aparece en el tab Activity, no solo en el tab Tasks |
| 4 | Agregar/quitar un Tag | Aparece en el tab Activity |
| 5 | Repetir 1-4 pero mirando el tab **Activity de un registro distinto** (ej. otra Company) | La Note/Task/Tag de otro registro **no** debe aparecer — el filtro por `parentEntityId` tiene que aislar correctamente |
| 6 | `Settings → Activity Log` (feed tenant-wide) | Sigue mostrando cada Note/Task/Tag bajo su propio tipo ("Note"/"Task"/"Tag"), **sin duplicarse** — no debería aparecer dos veces la misma entrada |

### B. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 7 | `npm run build`/`npm test` (backend, 208/208) y `npm run build` (frontend) | Los tres en verde |
| 8 | Todo lo ya cubierto en QA-56 a QA-61 | Sigue funcionando igual — este fix es aditivo, no debería romper nada de lo anterior |

### Al encontrar una falla

A.5 es la más importante — si una Note/Task/Tag de un registro aparece en el Activity de **otro**
registro, es severidad alta (fuga de datos entre entidades, aunque sea dentro del mismo tenant). El
resto es media (funcionalidad visible pero incompleta) salvo regresión real en B, que sería alta.

---

## QA-63 — Activity Log, Unidad 6 (cierre real): Subscription, Google Calendar, Stripe (2026-08-31, en `staging`)

**Por qué existe esta tarea:** un día después de QA-61, Alejandro cuestionó el scope cut original
("si los dispara un webhook pero salen desde un usuario específico, habría que registrar eso, ¿lo
ves posible?") y después precisó: quiere loguear quién conecta/desconecta Google Calendar, quién
toca las claves de Stripe (con permiso), y quién cambia de plan (con permiso). Investigación de
código confirmó que Google Calendar y Stripe connect/desconnect ya tenían un actor real disponible
de forma síncrona — solo faltaba cablearlo. Subscription era el caso genuinamente difícil: los
webhooks de Paddle/Mercado Pago nunca traen un user id en su payload (limitación real de esas
plataformas), así que se agregó `Subscription.lastActionByUserId`/`lastActionAt` — un puntero
"quién tocó esto último", escrito por el checkout inicial y los 3 self-serve, leído por
`syncSubscriptionAndTenant` al confirmar un cambio (solo si tiene menos de 60 minutos de
antigüedad; si no, no loguea nada, mismo criterio de siempre). Verificado con una corrida directa
contra `staging` (sin llamar a ningún proveedor externo): simular un checkout, confirmar por el
camino del webhook, y ver la entrada atribuida correctamente al usuario que inició el checkout.

### A. Confirmar en `Settings → Activity Log`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Conectar Google Calendar (`Settings → Integraciones`) con un usuario | Fila `create` de tipo "Google Calendar Connection", actor = ese usuario, detalle muestra el email conectado |
| 2 | Reconectar (después de un `needsReconnect`, o simplemente conectar de nuevo) | Fila `update` si el email cambió, o ninguna fila si es el mismo email (diff vacío, comportamiento esperado) |
| 3 | Desconectar Google Calendar | Fila `delete` de tipo "Google Calendar Connection", actor = quien desconectó |
| 4 | Conectar la clave de Stripe (owner) | Fila `create` de tipo "Stripe Connection", actor = el owner, detalle muestra `apiKeyMode`/cuenta — **nunca** la clave en sí |
| 5 | Desconectar Stripe | Fila `delete` de tipo "Stripe Connection", actor correcto |
| 6 | Cambiar de plan desde Billing (self-serve, con `Subscription.provider` ya seteado) | Fila `update` de tipo "Subscription", `Changed Plan: starter → growth` (o el par que corresponda), actor = quien lo hizo |
| 7 | Cancelar/reanudar la propia suscripción desde Billing | Fila `update` con el cambio de `cancellationReason`/`cancellationEffectiveAt`, actor correcto |
| 8 | Suscribirse por primera vez (checkout inicial, se confirma por webhook) — si hay forma de probarlo en `staging` con sandbox de Paddle/Mercado Pago | Una vez que el webhook confirma el pago, la fila `Changed Status: trialing → active` debería aparecer atribuida a quien inició el checkout, no sin actor — si el checkout tardó más de ~1 hora en confirmarse, **no** debería tener actor (ventana de confianza vencida, comportamiento esperado, no un bug) |
| 9 | Un cambio de plan/renovación puramente automática (cron, o un webhook de renovación semanas después de la última acción humana) | **No** debería generar ninguna fila con actor — si aparece atribuida a alguien, es un bug (ventana de 60 min mal aplicada) |

### B. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 10 | `npm run build`/`npm test` (backend, 218/218) y `npm run build` (frontend) | Los tres en verde |
| 11 | Todo lo ya cubierto en QA-56 a QA-62 | Sigue funcionando igual — esta unidad es aditiva |
| 12 | Uso normal de Billing/Integraciones desde la UI (conectar, desconectar, cambiar de plan) | Sin cambios visibles de comportamiento — el Activity Log es una capa de auditoría, no debería alterar ningún flujo existente |

### Al encontrar una falla

El caso A.4 es el más sensible — si aparece la clave de Stripe (aunque sea parcial) en el detalle
de una entrada de Activity Log, es severidad **alta** (fuga de credencial), igual criterio que
QA-61/A.3 con `passwordHash`. El caso A.9 (atribución incorrecta de un evento automático a una
persona) es severidad media-alta — no es una fuga de datos, pero es información engañosa en un
log de auditoría. El resto sigue el criterio ya establecido: dato incorrecto es media, regresión
funcional es alta.

**Con esta unidad el spec de Activity Log queda completo de punta a punta** (6 unidades, sin
scope cuts pendientes salvo los ya documentados y deliberados en el spec §6: sesiones/login,
revertir un cambio, retención/purga, y Admin Center).

## QA-64 — Rediseño de CSV: Employee actualizado + Company/Contact nuevos (2026-08-31, en `staging`)

**Por qué existe esta tarea:** Alejandro pidió revisar los módulos de CSV de punta a punta —
Companies y Contacts nunca tuvieron import/export (solo Employee y el modelo legacy `Client` lo
tenían), y el propio Employee estaba desactualizado (le faltaban 3 campos agregados después). El
pedido explícito: al descargar la plantilla de ejemplo, tiene que incluir todos los fields y custom
fields del workspace, no solo un subconjunto. `Client` queda fuera de alcance a propósito —
confirmado por Alejandro como legacy, en camino a decommission completo (ver
`docs/tareas/backlog.md`).

### A. Employee — campos nuevos

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Descargar la plantilla de Employees | Incluye columnas "Person Type", "Nationality", "Birthdate" (nuevas) — **no** incluye "Country of Residence" (self-service only, nunca la completa el owner) |
| 2 | Importar un CSV con esas 3 columnas completas | El empleado se crea con esos valores; verificar en el panel de detalle o exportando de nuevo |
| 3 | Importar un empleado y revisar `Settings → Activity Log` (o el tab Activity del propio empleado) | Aparece la entrada de creación atribuida al usuario que hizo el import — **antes de este fix no aparecía atribuida a nadie**, es la regresión más importante a confirmar |
| 4 | Importar un empleado con un custom field completado | La entrada de Activity Log del custom field también aparece atribuida al usuario que importó |

### B. Company — nuevo

| # | Caso | Resultado esperado |
|---|---|---|
| 5 | Descargar la plantilla de Companies | Columnas: Name, Industry, Website, Phone, Billing Address, Parent Company, Company Size, Account Owner Email, Primary Contact Email, Primary Contact First Name, Primary Contact Last Name + custom fields activos — **sin** columna Status (es derivado, no importable) |
| 6 | Importar una Company con "Primary Contact Email" de un Contact que ya existe en el tenant | Se crea la Company, vinculada a ese Contact existente (no se crea uno nuevo) |
| 7 | Importar una Company con un email que no matchea ningún Contact, pero con First/Last Name completos | Se crea la Company + un Contact nuevo con esos datos, vinculado |
| 8 | Importar una Company sin "Primary Contact Email" (o sin email y sin First/Last Name para crear uno) | La fila da error explícito ("every Company needs a linked Contact" / "provide Primary Contact First Name/Last Name"), no crea nada a medias |
| 9 | Exportar Companies después de importar una con Primary Contact | La columna "Primary Contact Email"/First/Last Name del export muestra los datos correctos (round-trip) |
| 10 | Importar con "Parent Company" apuntando a una Company ya existente por nombre | Queda vinculada como hija (verificar en el panel de detalle o `parentCompanyId`) |
| 11 | Importar con "Company Size" nuevo (no existe todavía como catálogo) | Se crea automáticamente en `Settings` como una opción nueva del catálogo Company Size |
| 12 | Importar con "Account Owner Email" que no matchea ningún usuario del tenant | La Company se crea igual, sin Account Owner (no es un error) |

### C. Contact — nuevo

| # | Caso | Resultado esperado |
|---|---|---|
| 13 | Descargar la plantilla de Contacts | Columnas: First Name, Last Name, Email, Phone, Company, Title, Primary Contact, Lead Status, Lead Source + custom fields activos |
| 14 | Importar un Contact con "Company" que matchea una Company existente por nombre | Queda vinculado a esa Company |
| 15 | Importar un Contact con "Company" que **no** matchea ninguna Company | Se crea igual, sin Company vinculada — **no** es un error de fila (a diferencia de Company, acá `companyId` es opcional) |
| 16 | Importar un Contact con "Primary Contact" = Yes | Queda marcado como contacto primario de su Company (si tiene una) |
| 17 | Importar con "Lead Source" nuevo | Se crea automáticamente en el catálogo Lead Source |
| 18 | Exportar Contacts con un Contact desactivado (soft-delete) entre los datos | El export **no** incluye al contacto desactivado, mismo criterio que la tabla principal de Contacts |

### D. Frontend — botones nuevos

| # | Caso | Resultado esperado |
|---|---|---|
| 19 | Ir a `/companies` y `/contacts` como owner/admin | Aparecen los íconos de export (↓) e import (↑) en el toolbar, misma posición que ya tenía Employees |
| 20 | Ir a `/companies`/`/contacts` como un rol `member` | Los íconos de CSV **no** aparecen (mismo gating que el botón "Add") |
| 21 | Ir a `/hr/people` (Employees) | Sin cambios visuales ni de comportamiento respecto a antes de esta ronda |

### E. Regresión

| # | Caso | Resultado esperado |
|---|---|---|
| 22 | `npm run build`/`npm test` (backend, 218/218) y `npm run build` (frontend) | Los tres en verde |
| 23 | Import/export de Employees (flujo ya existente) | Sigue funcionando igual que antes, sin romper nada |

### Al encontrar una falla

El caso A.3 (atribución faltante en Activity Log) y los casos B.8/B.9 (Company sin Contact
vinculado, o el round-trip roto) son los más importantes — reflejan el pedido explícito del
usuario, no un detalle menor. Un import que crea una Company sin ningún Contact vinculado sería
severidad **alta** (viola una regla de negocio explícita del modelo). El resto sigue el criterio ya
establecido: dato incorrecto es media, regresión funcional es alta.

Verificado por Claude contra `staging` real antes de este push: script directo para cada unidad de
backend (casos 1-2, 4, 6-8, 10-12, 14-18) + Playwright real contra un dev server local apuntado a
`staging` para el import completo desde el navegador — subir el archivo, ver el toast de éxito, y
confirmar la fila nueva en la tabla (caso 19 en adelante). Falta la revisión humana de Alejandro.

## QA-65 — Custom Roles, Fase A: fundacional, sin superficie funcional todavía (2026-09-01, en `staging`)

**Por qué existe esta tarea:** primera pieza de `docs/tareas/backlog.md` "Sistema de roles custom /
permisología" (plan completo en el archivo de plan de la sesión) — reemplaza el enum fijo
`owner`/`admin`/`member` por roles editables por tenant, con permisos de módulo, un scope por
registro para Employees (self/departamento/todos) y restricciones campo por campo. Esta Fase A es
puramente fundacional: 3 modelos nuevos (`Role`/`RoleModulePermission`/`RoleFieldRestriction`,
push aditivo), `seedDefaultRolesForTenant` enganchado al alta de tenant nuevo, un backfill corrido
contra `staging` para los tenants existentes, y un `RoleContext` resuelto en cada login/request —
**pero nada todavía lo consulta para tomar una decisión de autorización real** (`permissionService.ts`
sigue leyendo el enum `role` de siempre hasta la Fase B). El objetivo de esta ronda de QA es
confirmar que agregar toda esta plomería no cambió ningún comportamiento visible.

### A. Regresión — nada debería verse distinto

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Login con un usuario existente de cualquier rol (owner/admin/member) | Funciona igual que siempre, sin cambios de comportamiento ni de permisos visibles |
| 2 | `GET /api/auth/me` (o simplemente cargar la app y ver el usuario logueado) | La respuesta trae `user` normal — sin ningún campo `roleContext`/`{}` raro colado ahí |
| 3 | Cualquier pantalla gateada por rol (Payroll, Billing, Activity Log, Settings de Users, etc.) | Se ve exactamente igual que antes para cada rol — nada se abrió ni se cerró de más |
| 4 | Registrar un tenant nuevo de punta a punta (signup con verificación de email) | El flujo completo funciona igual que siempre; la cuenta queda creada y usable |

### B. Nueva plomería — verificable solo con acceso directo a la base (no hay UI todavía)

| # | Caso | Resultado esperado |
|---|---|---|
| 5 | Un tenant recién registrado (caso A.4) | Tiene exactamente 3 filas `Role` (Owner/Admin/Member) — la de Owner con `isOwner: true`, `isEditable: false` |
| 6 | El `User` owner de ese tenant nuevo | Tiene `roleId` seteado, apuntando a la fila `Role` con `isOwner: true` |
| 7 | Cualquier tenant que ya existía antes de este push | También tiene sus 3 roles semilla (backfill corrido: 184 tenants, 189 Users, 17 Invitations en `staging`) — verificado por Claude con queries directas antes de este push, ver el resumen en el plan de la sesión |

### C. Build/tests

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | `npm run build`/`npm test` (backend, 218/218) y `npm run build` (frontend) | Los tres en verde |

### Al encontrar una falla

Cualquier cambio de comportamiento visible (caso A) es severidad **alta** — esta unidad está
diseñada para ser 100% invisible, así que cualquier regresión es una señal de que algo en el nuevo
código (`resolveRoleContextForUser`, el hook en `authenticateToken`) está interfiriendo donde no
debería. Un problema en el caso B (roles mal sembrados, `roleId` sin asignar) es severidad media —
no rompe nada hoy porque nada lo consume todavía, pero bloquearía la Fase B si no se corrige antes.

Verificado por Claude contra `staging` real antes de este push: `npm run build`/`npm test`
(218/218) en un worktree aislado, backfill corrido contra `staging` con verificación directa por
query (0 Users sin `roleId` salvo 1 usuario huérfano sin tenant, preexistente y fuera de alcance;
184 tenants = 184 roles `isOwner`; 0 mismatches entre `User.role` y `Role.name`; 0 Invitations sin
`roleId`). Sin pasada de Playwright — no hay ninguna superficie de UI nueva que probar en esta fase.
Falta la revisión humana de Alejandro antes de continuar con la Fase B.

## QA-66 — Custom Roles, Fase B: generalización de permisos + 2 cambios reales de comportamiento (2026-09-01, en `staging`)

**Por qué existe esta tarea:** segunda pieza de `docs/tareas/backlog.md` "Sistema de roles custom" —
`permissionService.ts` pasó de leer el enum legacy `role` a leer el `RoleContext` real sembrado en
la Fase A. La mayoría de esto es generalización interna sin cambio de comportamiento (los 10
permisos de siempre, ahora resueltos desde la base en vez de un mapa estático) — pero **2 cosas sí
cambian el comportamiento real de la app hoy**, marcadas explícitamente abajo. Se separó también el
viejo `canViewHr`/`canCreateHr` (que gateaba Employee/Company/Contact/Opportunity todos juntos) en
un par view/manage por entidad, más `canViewOpportunity` derivado de Company+Contact — esto es la
base necesaria para que el trabajo de campo-por-campo y scope de las próximas fases tenga sentido,
pero HOY no cambia nada visible (los 3 roles semilla siguen viendo exactamente lo mismo que antes,
confirmado con el backfill de top-up — ver abajo).

### A. Regresión — todo lo que NO debería cambiar

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Login con un usuario existente de cualquier rol | Funciona igual que siempre |
| 2 | Ver la lista de Employees/Companies/Contacts/Opportunities con cualquier rol (owner/admin/member) | Los 3 roles siguen viendo la lista completa, igual que antes (verificado con un smoke test real contra `staging`: los 3 roles obtienen 200 en los 4 endpoints) |
| 3 | Crear/editar/borrar un Employee/Company/Contact/Opportunity siendo owner o admin | Sigue funcionando igual — member sigue sin poder (mismo criterio que hoy, `create_hr` ya era admin+) |
| 4 | Aprobar/rechazar una solicitud de Time Off siendo owner/admin, o siendo el manager asignado con cualquier rol | Sigue funcionando exactamente igual — la regla de "es mi manager asignado" no se tocó |
| 5 | Crear una Saved View compartida siendo owner/admin | Sigue funcionando igual |
| 6 | Cambiar la moneda del tenant (`Settings → Company`) siendo owner/admin | Sigue funcionando igual |
| 7 | Transferir el ownership del tenant a otro usuario | Sigue funcionando igual — el usuario promovido queda con `roleId` apuntando a Owner, el que transfiere queda en Admin (antes esto podía quedar desincronizado, ver ítem B.10) |

### B. Cambios de comportamiento reales — confirmar que son los esperados, no bugs

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | Exportar/importar/descargar la plantilla de CSV de Employees siendo **admin** (no owner) | **Antes: funcionaba. Ahora: 403 "Insufficient permissions"** — el CSV completo de empleados quedó atado al mismo permiso que Payroll (decisión explícita: el archivo trae datos tan sensibles como Payroll). Solo el owner puede exportar/importar/descargar la plantilla ahora |
| 9 | Un admin intenta invitar a alguien con rol `owner` (llamando directo a la API, no desde la UI — la UI ya lo bloqueaba) | Rechazado con "Ownership can only be transferred to an existing user, not granted by invitation" — antes esto pasaba sin error y, al aceptarse, el tenant quedaba con 2 owners |

### C. Verificación técnica (sin superficie de UI nueva)

| # | Caso | Resultado esperado |
|---|---|---|
| 10 | Los 184 tenants de `staging` que ya tenían roles sembrados por la Fase A | Sus roles Admin/Member recibieron un "top-up" idempotente con los permisos nuevos (`scripts/backfill-fase-b-permissions.ts`) — verificado con query directa: 0 de 184 Admin y 0 de 184 Member roles con algún permiso faltante |
| 11 | `npm run build`/`npm test` (backend, 218/218) y `npm run build` (frontend) | Los tres en verde |
| 12 | Smoke test real contra un dev server local apuntado a `staging` (tenant descartable, 3 usuarios owner/admin/member reales, borrados al final) | Employee/Company/Contact/Opportunity view: 200 para los 3 roles. CSV export: 200 owner, 403 admin, 403 member. Gestión de usuarios del tenant: 200 owner/admin, 403 member. Feed de Activity Log: 200 owner/admin, 403 member. Todo coincidió con lo esperado |

### Al encontrar una falla

Los casos B.8 y B.9 son cambios de comportamiento **a propósito** — si NO se ve el cambio (ej. un
admin todavía puede exportar CSV), es un bug real, severidad alta (la decisión explícita no se
aplicó). Cualquier cosa en la sección A que sí cambió es severidad alta — esta fase está diseñada
para ser invisible salvo B.8/B.9. Un problema en C (roles con permisos faltantes) es severidad
media — no rompe nada hoy porque las 4 entidades siguen abiertas a todos los roles semilla, pero
bloquearía las próximas fases si no se corrige.

Verificado por Claude contra `staging` real antes de este push, en el mismo worktree aislado de la
Fase A: `npm test`/`npm run build` en verde, backfill de top-up corrido y verificado con query
directa, y un smoke test real de extremo a extremo (servidor local + base de `staging`, tenant y 3
usuarios descartables, borrados al terminar). Falta la revisión humana de Alejandro antes de
continuar con la Fase C.

## QA-67 — Custom Roles, Fase B2: primera UI real — Settings → Roles & Permissions (2026-09-01, en `staging`)

**Por qué existe esta tarea:** Alejandro pidió una propuesta visual para "prender/apagar permisos
de Admin/Member" (parte pendiente de la Fase B) antes de construir código — se le mostró un mockup
(paleta/tipografía real de Northstack, matriz de 3 columnas Owner/Admin/Member, toggles
interactivos con la cascada Sales ya simulada) y dio el visto bueno ("dale nomas, empeza"). Esta
tarea es la implementación real: página nueva en Settings, 2 endpoints nuevos, verificados con
Playwright real contra `staging` (no solo mockup).

### A. Acceso y ubicación

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Entrar a `Settings` como owner | Nuevo ítem "Roles & Permissions" (ícono de candado) en el grupo "Company" del nav lateral, después de "Activity Log" |
| 2 | Entrar a `Settings` como admin o member | El ítem "Roles & Permissions" **no aparece** en el nav — solo owner lo ve |
| 3 | Un admin llama directo a `GET /api/roles` o `PATCH /api/roles/:id/permissions` (curl, no UI) | 403 — el gate es server-side, no solo ocultar el link |

### B. La matriz de permisos

| # | Caso | Resultado esperado |
|---|---|---|
| 4 | Abrir la página | 8 secciones (People, Sales, Configuration, Team, Money, Reporting, Workspace, Time off), cada una con Owner (candado fijo, no clickeable) + Admin + Member |
| 5 | Estado inicial de un tenant que nunca tocó esto | Coincide exactamente con el comportamiento de hoy: Admin tiene casi todo salvo Payroll/Billing/Payments/Sales leaderboard (owner-only); Member solo ve (no gestiona) Employees/Companies/Contacts |
| 6 | Tildar/destildar cualquier permiso de Admin o Member | Toast de confirmación ("Granted"/"Revoked" + el nombre del permiso + el rol), el cambio se refleja al instante sin recargar la página |
| 7 | Recargar la página después de un cambio | El cambio persiste — no es solo estado local del navegador |
| 8 | Un usuario de ese rol vuelve a cargar la app después del cambio | Su acceso real cambió (ej. si le sacaste "Manage employees" a Admin, un admin ya no puede editar un Employee) |

### C. La cascada Sales (Manage opportunities depende de View companies + View contacts)

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Intentar conceder "Manage opportunities" a un rol que no tiene "View companies" y/o "View contacts" | Bloqueado, toast de error explicando qué falta conceder primero — el toggle vuelve a su estado anterior |
| 10 | Conceder primero "View companies" y "View contacts", después "Manage opportunities" | Funciona sin problema |
| 11 | Revocar "View companies" o "View contacts" de un rol que ya tenía "Manage opportunities" concedido | "Manage opportunities" se revoca también automáticamente (cascada) — confirmar recargando que no quedó "vivo" en el estado del rol |

### D. Verificación técnica

| # | Caso | Resultado esperado |
|---|---|---|
| 12 | `npm run build`/`npm test` (backend, 224/224) y `npm run build` (frontend) | Los tres en verde |
| 13 | Playwright real contra `staging` (servidor local + tenant/usuario descartables, borrados al terminar) | Login → navegar a la página vía clicks reales (no URL directa, ver nota abajo) → toggle real con persistencia → cascada bloqueada → capturas en claro y oscuro, todo legible |

### Al encontrar una falla

El caso C (cascada) es el más importante — si se puede conceder `manage_opportunity` sin los
prerrequisitos, o si queda "vivo" tras revocar uno de ellos, es severidad **alta** (es exactamente
el bug que el diseño busca prevenir). El caso A.3 (gate solo client-side) sería severidad alta
también — un gate de solo UI en algo que cambia permisos de otros roles es una escalada de
privilegios real. El resto sigue el criterio ya establecido: dato incorrecto es media, regresión
funcional es alta.

**Nota técnica para quien reproduzca manualmente**: navegar por URL directa a `/settings/roles`
(pegar el link, F5) redirige a `/login` incluso estando logueado — esto es un comportamiento
preexistente de la app entera (confirmado también en `/settings/activity`, no es un bug de esta
unidad), la sesión se revalida en cada carga completa de página y esa revalidación no está lista
todavía cuando el router decide la ruta. Navegar siempre por click dentro de la app.

Verificado por Claude contra `staging` real antes de este push: `npm test`/`npm run build` en
verde, y Playwright real de punta a punta (login, dismiss del modal de selección de plan, click
por la navegación real hasta la página, toggle con toast y persistencia confirmada tras reload,
cascada bloqueada y luego confirmada con los prerrequisitos, captura en dark mode). Encontré y
corregí en el camino: un `.toggle-switch` custom que había diseñado para el mockup nunca se
aplicaba de verdad (una regla global `input[type='checkbox']` ya existente en toda la app le ganaba
por especificidad CSS) — en vez de forzar mi diseño, usé el checkbox estándar ya establecido en
toda la plataforma (más consistente, menos código); y varias clases de texto sin su variante
`dark:` correspondiente, que dejaban las etiquetas de los permisos casi ilegibles en dark mode.
Falta la revisión humana de Alejandro.

## QA-68 — Custom Roles: crear/renombrar/borrar roles reales (extensión same-day de la Fase B2, 2026-09-01, en `staging`)

**Por qué existe esta tarea:** Alejandro marcó explícitamente que la UI de permisos no puede
quedarse en "solo reconfigurar Admin/Member" — un tenant tiene que poder crear un rol propio, con
su nombre, y que quede guardado de verdad. Esta tarea agrega esa pieza a la misma página de la
Fase B2.

### A. Crear un rol

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Click en "New role", completar un nombre, dejar "Start from" en "Blank" | Se crea un rol nuevo con 0 permisos — aparece como columna nueva en la matriz al instante |
| 2 | Crear un rol eligiendo "Same as Admin" en "Start from" | El rol nuevo nace con exactamente los mismos permisos que Admin tiene en ese momento (no una referencia viva — cambiar Admin después no afecta al rol ya creado) |
| 3 | Intentar crear un rol llamado "Owner" (mayúsculas o minúsculas) | Rechazado — mensaje claro de que el nombre está reservado |
| 4 | Intentar crear un rol con un nombre que ya existe en el tenant | Rechazado — mensaje claro de nombre duplicado |
| 5 | Recargar la página después de crear un rol | El rol nuevo sigue ahí — quedó guardado de verdad, no es solo estado del navegador |

### B. Renombrar

| # | Caso | Resultado esperado |
|---|---|---|
| 6 | Menú "⋮" en el header de cualquier rol editable (Admin, Member, o uno custom) → "Rename role" | Input inline, guarda con Enter o el botón Save, el header se actualiza al instante |
| 7 | Intentar renombrar a "Owner" | Rechazado |
| 8 | Intentar renombrar a un nombre ya usado por otro rol del mismo tenant | Rechazado |

### C. Borrar

| # | Caso | Resultado esperado |
|---|---|---|
| 9 | Menú "⋮" → "Delete role" en un rol sin nadie asignado | Confirmación (`ConfirmDialog`, no un `confirm()` nativo) → al confirmar, la columna desaparece de la matriz |
| 10 | Intentar borrar un rol que todavía tiene al menos un usuario asignado | Rechazado — mensaje indicando cuántos usuarios (y/o invitaciones pendientes) hay que reasignar primero, la columna sigue ahí |
| 11 | Intentar borrar o renombrar el rol Owner | La opción ni siquiera debería ofrecerse en su columna (Owner no tiene menú "⋮") |

### D. Verificación técnica

| # | Caso | Resultado esperado |
|---|---|---|
| 12 | `npm run build`/`npm test` (backend, 234/234) y `npm run build` (frontend) | Los tres en verde |
| 13 | Playwright real contra `staging`: crear un rol duplicando Admin → confirmar permisos copiados → renombrarlo → intentar "Owner" (rechazado) → borrarlo → confirmar que la columna desaparece | Todo pasa sin intervención manual |

### Al encontrar una falla

El caso B.10 es el más importante — si se puede borrar un rol con gente todavía asignada, esos
usuarios quedarían con un `roleId` apuntando a un rol que ya no existe, severidad **alta** (rompe
la resolución de permisos para esas personas en su próximo login). El caso A.3 (nombre "Owner"
rechazado) también es alta si falla — permitiría un rol con nombre confuso que se lea como si fuera
el verdadero owner. El resto sigue el criterio ya establecido.

Verificado por Claude contra `staging` real antes de este push: `npm test`/`npm run build` en
verde, y Playwright real de punta a punta (crear duplicando Admin, confirmar que copió los
permisos, renombrar, intentar "Owner" y ver el rechazo, borrar, confirmar que la columna
desaparece de la matriz). Falta la revisión humana de Alejandro.

## QA-69 — Custom Roles: restricción de campos fijos (Fase C, 2026-09-01, en `staging`)

**Por qué existe esta tarea:** hasta la Fase B un rol solo podía prender/apagar módulos enteros
(ver Employee sí/no, ver Company sí/no). Esta fase agrega control campo por campo dentro de un
módulo ya visible — por ejemplo, un rol puede ver el legajo de un Employee pero no su
`personalEmail` o su `birthdate`. Solo aplica a campos FIJOS del schema (no a custom fields, que
van por un permiso de paquete aparte, todavía sin construir — Fase D).

### A. Matriz de campos en la UI (`Settings → Roles & Permissions → Field visibility`)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Abrir la sección "Field visibility", expandir "Employee" | Lista todos los campos fijos restringibles de Employee (personalEmail, birthdate, nationality, etc.) — NO incluye `firstName`/`lastName` |
| 2 | Expandir "Company" | NO incluye `name` en la lista de campos restringibles |
| 3 | Expandir "Contact" | NO incluye `firstName`/`lastName` |
| 4 | Expandir "Opportunity" | NO incluye `name` |
| 5 | Destildar "Personal email" en la columna de un rol editable (ej. Member) | Guarda al instante (autosave), sin necesidad de un botón "Guardar" aparte |
| 6 | Recargar la página | El campo sigue destildado para ese rol — quedó persistido, no es solo estado local |
| 7 | Columna Owner en la sección de campos | Sin checkboxes / siempre "visible" — Owner nunca es restringible, igual que en la matriz de permisos de módulo |

### B. Efecto real en la respuesta de la API (no solo en la UI)

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | Con "Personal email" oculto para Member: loguearse como un usuario Member y pedir `GET /api/hr/employees` | El campo `personalEmail` viene en el JSON pero con valor `null` para cada empleado (la clave no desaparece del objeto) |
| 9 | Mismo caso, pedir el detalle `GET /api/hr/employees/:id` | Mismo resultado — `personalEmail: null` |
| 10 | Revertir el toggle (volver a tildar "Personal email" para Member) y repetir el request | El valor real vuelve a aparecer — la restricción es reversible sin dejar residuo |
| 11 | Ocultar un campo que tiene un FK + su relación resuelta a la vez (ej. `accountOwnerId` en Company) | Tanto `accountOwnerId` como el objeto `accountOwner` completo vienen `null` — el valor no debe quedar visible "por la puerta de atrás" a través del objeto de relación |
| 12 | Con un rol que directamente NO tiene `view_employee` (el módulo entero apagado), sin ninguna restricción de campo configurada | Ningún campo de Employee es visible para ese rol — el gate de módulo corta antes de mirar la denylist de campos |
| 13 | Con un rol que tiene `view_company` pero no `view_contact` (o viceversa), pedir el detalle de una Opportunity | Ningún campo de Opportunity es visible — recordar que `canViewOpportunity` está derivado de ambos (Fase B), así que el gate de campos de Opportunity hereda esa misma regla |
| 14 | El mismo toggle aplicado a un create/update (ej. `POST`/`PATCH /api/hr/employees`) | La respuesta de creación/edición también viene redactada igual que el GET — comportamiento consistente en toda la app, no solo en listas |

### C. Verificación técnica

| # | Caso | Resultado esperado |
|---|---|---|
| 15 | `npm test` (backend, 248/248, incluye `tests/fieldVisibilityService.test.ts` nuevo) y `npm run build` (frontend + backend) | Los tres en verde |
| 16 | Playwright real contra `staging`: destildar "Personal email" para Member en la UI → confirmar por API que `personalEmail` viene `null` → revertir en la UI → confirmar que vuelve | Pasa sin intervención manual |

### Al encontrar una falla

El caso 11 (relación resuelta filtrando el valor a pesar de que el FK esté redactado) es el más
sutil y el de mayor severidad si reaparece — es exactamente el tipo de fuga que no se nota mirando
la UI (que solo pinta el campo "de nombre"), solo inspeccionando el JSON crudo de la respuesta. El
caso 12/13 (el gate de módulo debe cortar todo antes que la denylist de campos) es alto también: si
falla, un rol sin acceso a un módulo entero podría igual ver campos sueltos de esa entidad. El resto
sigue el criterio ya establecido en tareas anteriores de este mismo módulo (QA-65 a QA-68).

Verificado por Claude contra `staging` real antes de este push: `npm test`/`npm run build` en
verde, y Playwright real de punta a punta (toggle de "Personal email" para Member en la UI,
confirmado por una llamada directa a `GET /api/hr/employees` que el campo vuelve `null`, revertido
y confirmado que vuelve a aparecer). Falta la revisión humana de Alejandro.

## QA-70 — Custom Roles: bundle de custom fields de Employee (Fase D, 2026-09-01, en `staging`)

**Por qué existe esta tarea:** los 4 endpoints de valores de custom field de un Employee puntual
(crear, editar, borrar, listar) usaban `manage_custom_fields` — el permiso que en realidad controla
quién define el SCHEMA de custom fields (catálogo tenant-wide), no quién puede ver/editar los
VALORES de un empleado concreto. El endpoint de listar (`GET`) ni siquiera tenía ese chequeo: hasta
esta fase, cualquier persona autenticada del tenant podía ver los custom fields de cualquier
empleado sin importar su rol. Esta tarea verifica que el bundle real
(`view_employee_custom_fields`/`edit_employee_custom_fields`, ya expuesto en
`Settings → Roles & Permissions → People`) ahora controla esto de verdad.

### A. Comportamiento por rol

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Un rol con "View employees" pero sin "View employee custom fields" pide `GET /api/hr/employees/:id/custom-fields` | 403 |
| 2 | Un rol con ambos "View employees" y "View employee custom fields" pide el mismo `GET` | 200, devuelve los valores |
| 3 | Un rol con "View employee custom fields" pero al que se le quita "View employees" (módulo entero apagado) | 403 en el `GET` de custom fields — perder acceso al empleado en sí también saca el acceso a sus custom fields, aunque el bundle siga prendido |
| 4 | Un rol con el bundle de vista pero sin "Edit employee custom fields" intenta `POST`/`PATCH`/`DELETE` sobre un valor | 403 en los 3 |
| 5 | Un rol con "Manage employees" + "View employee custom fields" + "Edit employee custom fields" intenta `POST`/`PATCH`/`DELETE` | 200/201/204 según corresponda |
| 6 | Owner, sin ningún permiso explícito (bypass estructural) | Los 4 endpoints funcionan siempre |

### B. La UI (`Settings → Roles & Permissions → People`)

| # | Caso | Resultado esperado |
|---|---|---|
| 7 | Intentar tildar "View employee custom fields" en un rol que no tiene "View employees" | Rechazado con un mensaje que indica el prerrequisito, sin llamar a la API |
| 8 | Intentar tildar "Edit employee custom fields" sin tener ya "Manage employees" Y "View employee custom fields" | Rechazado igual, listando ambos prerrequisitos |
| 9 | Con un rol que tiene los 4 permisos (View/Manage employees + el bundle completo), destildar "View employees" | Tanto "View employee custom fields" como "Edit employee custom fields" se destildan solos en la misma respuesta — sin recargar la página. Este es el caso más importante de esta tarea: es una cascada de 2 niveles (no 1, como el único otro caso que existía antes en el sistema, Sales), así que merece atención extra |
| 10 | Recargar la página después del caso 9 | El estado persiste — los 3 permisos siguen destildados, no volvieron solos |

### Al encontrar una falla

El caso 9 es el de mayor severidad: si la cascada de revocación se queda en un solo nivel (revoca
`view_employee` y `view_employee_custom_fields` pero deja `edit_employee_custom_fields` dormido en
la base), un rol terminaría pudiendo crear/editar/borrar valores de custom fields de un empleado
que ya no puede ni ver — exactamente el tipo de permiso "zombie" que este sistema fue diseñado para
que nunca pase. El caso 3 (perder acceso a Employee en sí debe tapar también sus custom fields,
aunque el bundle siga prendido) es alto también por la misma razón. El caso 1 (el `GET` de listar
ahora exige permiso, cuando antes no exigía ninguno) es el cierre de un gap real de acceso, así que
alta severidad si reaparece abierto.

Verificado por Claude contra `staging` real antes de este push: `npm test` 253/253 (incluye 5 tests
nuevos: 2 en `permission.test.ts` para las funciones compuestas, 3 en `roleManagementService.test.ts`
para el bloqueo de prerrequisitos y la cascada transitiva de 2 niveles) y ambos builds verdes.
Contra un tenant descartable en `staging`: login real de un usuario Owner y uno Member, y la
secuencia completa `GET`/`POST` como Member (200/403 según el permiso), revocación en vivo vía
`PATCH /api/roles/:roleId/permissions`, y reconfirmación de que el `GET` pasa a 403 — más la
secuencia grant→grant→grant→revoke que dispara la cascada de 2 niveles, confirmada tanto por la
respuesta de la API como visualmente en Playwright (captura en claro y oscuro). Falta la revisión
humana de Alejandro.

## QA-71 — Custom Roles: alcance por registro de Employee (Fase E, 2026-09-01, en `staging`)

**Por qué existe esta tarea:** hasta esta fase, un rol veía TODOS los Employees del tenant o
ninguno, según tuviera o no `view_employee` — no existía forma de que "un manager vea solo su
equipo" o "un empleado común solo se vea a sí mismo". Esta tarea agrega y verifica ese tercer eje
(scope: `self`/`department`/`all`), y el endpoint de "directorio" que existe para que los pickers
(elegir un manager, asignar una Task a un compañero) sigan viendo a toda la empresa sin importar el
scope de quien pregunta.

### A. Setup — un organigrama de prueba real

Para probar esto de verdad hace falta más de un empleado suelto: armar (o pedir a Claude que arme)
un tenant con esta estructura mínima —
- **CEO** (departamento Executive, sin manager).
- **Manager** (departamento Sales, reporta a CEO).
- **RepA** (departamento Sales, reporta a Manager) — mismo departamento que Manager Y su reporte.
- **RepB** (departamento **Engineering**, reporta a Manager) — reporte de Manager pero en OTRO
  departamento — el caso que prueba que la cadena de reportes cuenta aunque el departamento no
  coincida.
- **SalesPeer** (departamento Sales, reporta a CEO, NO a Manager) — mismo departamento que Manager
  pero no es su reporte — el caso que prueba que el departamento cuenta aunque no haya relación de
  reporte.
- **Stranger** (departamento Engineering, reporta a CEO) — ni mismo departamento que Manager ni su
  reporte — debe quedar completamente fuera del scope de Manager.
- Dos roles custom: uno con scope `department` asignado a un usuario vinculado al Employee
  "Manager", otro con scope `self` asignado a un usuario vinculado al Employee "Stranger".

### B. Scope `department`

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Loguearse como el usuario con scope `department` (vinculado a "Manager"), ir a People | La tabla muestra exactamente 4 filas: Manager, RepA, RepB, SalesPeer |
| 2 | La misma tabla NO debe mostrar | CEO (es superior de Manager, no su reporte) ni Stranger |
| 3 | `GET /api/hr/employees/:id` sobre el id de CEO o de Stranger | 404 (no 403) |
| 4 | `GET /api/hr/employees/:id` sobre el id de RepA, RepB o SalesPeer | 200 |
| 5 | Si el rol también tiene "Manage employees": `PATCH /api/hr/employees/:id` sobre el id de Stranger | 404 — no se puede editar a alguien fuera del scope aunque se tenga el permiso de módulo |

### C. Scope `self`

| # | Caso | Resultado esperado |
|---|---|---|
| 6 | Loguearse como el usuario con scope `self` (vinculado a "Stranger"), ir a People | La tabla muestra una sola fila: la propia (Stranger) |
| 7 | `GET /api/hr/employees/:id` sobre cualquier otro id (Manager, CEO, etc.) | 404 |

### D. El directorio (`GET /api/hr/employees/directory`)

| # | Caso | Resultado esperado |
|---|---|---|
| 8 | Con el usuario de scope `self` (o cualquiera), pedir el directorio | Devuelve los 6 empleados completos — nombre, departamento, puesto, manager — sin importar el scope de quien pregunta |
| 9 | Quitarle a un rol el permiso `view_employee` por completo y repetir `GET /api/hr/employees` vs. `GET /api/hr/employees/directory` | La lista real da 403; el directorio sigue dando 200 con los 6 — el directorio no depende de `view_employee` en absoluto, es el diseño |
| 10 | En el formulario "Add Person" (`People`), abrir el selector "Reports To" | Lista los 6 empleados completos, incluidos los que están fuera del scope del usuario logueado |
| 11 | En el panel de detalle de un empleado (editar), el selector "Reports To" | Mismo comportamiento que el punto 10 — la misma lista completa, no la lista scopeada de la tabla |
| 12 | Al terminar a un empleado con reportes directos, el picker de reasignación de esos reportes | Debe poder apuntar a cualquier empleado de la empresa, no solo a los que están en el scope de quien ejecuta la terminación |
| 13 | Al crear una Task desde el calendario eligiendo "Employee" como tipo de entidad | El picker de "¿de quién es esta Task?" lista a toda la empresa, no solo el scope del usuario actual |

### Al encontrar una falla

El caso 3/5 (404, no 403, y que cubra tanto lectura como escritura) es el más importante — si un
`PATCH` a un empleado fuera de scope tuviera éxito, sería una fuga real de control de acceso, no
solo un problema de UI. El caso 9 (el directorio funciona incluso sin `view_employee`) es
intencional, no un bug — si alguna vez empieza a fallar (403 en el directorio), rompe el picker de
Tasks para cualquier persona sin permisos de HR, que es exactamente el caso de uso que existe para
resolver. El caso 2 (CEO fuera del scope de Manager pese a ser su superior) confirma que la
cadena de reportes es unidireccional (hacia abajo, no hacia arriba) — si CEO apareciera, sería
señal de que el BFS está caminando el árbol al revés.

**Nota aparte, no es un bug de esta fase**: hoy el botón "Add Person" de la página People sigue
oculto para cualquier rol que no sea el owner/admin legacy, incluso si el rol tiene
"Manage employees" concedido de verdad — es un chequeo de UI viejo (`user.role === 'owner' ||
'admin'`) que todavía no lee el sistema de permisos nuevo. Está en el backlog de una fase
posterior (frontend `PermissionsContext`), no es algo que esta tarea deba reportar como falla.

Verificado por Claude contra `staging` real antes de este push: `npm test` 265/265 (incluye 12
tests nuevos en `tests/employeeService.test.ts` cubriendo el BFS de `getManagedEmployeeIds` en
varios organigramas y `resolveVisibleEmployeeIds` en los 4 scopes) y ambos builds verdes. Contra un
tenant descartable en `staging` con el organigrama de arriba: los 13 casos de esta tarea
confirmados uno por uno vía curl real (login, `GET`/`PATCH` con los ids reales de cada empleado) y
Playwright real (tabla scopeada, selector "Reports To" con el directorio completo). Falta la
revisión humana de Alejandro.
