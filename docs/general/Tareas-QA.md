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

## Próximas tareas de QA (a definir)

Cuando se construyan los módulos grandes en curso (rediseño de Clients, Payroll), esta tabla de
casos va a necesitar extenderse con sus endpoints nuevos — no asumir que quedan cubiertos por los
casos de Employee/Client de arriba.
