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

## Próximas tareas de QA (a definir)

Cuando se construyan los módulos grandes en curso (rediseño de Clients, Payroll), esta tabla de
casos va a necesitar extenderse con sus endpoints nuevos — no asumir que quedan cubiertos por los
casos de Employee/Client de arriba.
