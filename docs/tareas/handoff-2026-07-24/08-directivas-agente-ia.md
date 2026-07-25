# 08 — Directivas para un agente de IA trabajando en este proyecto

Este es el archivo que hay que leer antes de tocar código en Northstack. Todo acá está extraído del código real del repo, no inventado — donde se cita un patrón, es el patrón que ya existe.

## Reglas de multi-tenancy — no negociables

1. **Todo modelo nuevo que cuelgue de un tenant lleva `tenantId` obligatorio (no opcional) desde el día uno.** Ver `prisma/schema.prisma` — todos los modelos de negocio (`Employee`, `Client`, `CustomFieldDefinition`, `StatusDefinition`, `SavedView`, etc.) tienen `tenantId String` sin `?`. La única excepción real es `User.tenantId String?`, porque un usuario puede existir momentáneamente sin tenant durante ciertos flujos — no lo tomes como precedente para otro modelo.

2. **Cualquier endpoint que reciba un ID de entidad tiene que verificar ownership contra el tenant de la sesión antes de operar.** El patrón real, repetido en decenas de lugares de `src/app.ts` (ejemplo textual, `PATCH /api/hr/employees/:employeeId`):
   ```ts
   const employee = await findEmployeeById(req.params.employeeId);
   if (!employee || employee.tenantId !== user.tenantId) {
     return res.status(404).json({ error: 'Employee not found' });
   }
   ```
   Nota el `404`, no `403` — no reveles que el recurso existe en otro tenant. Esto no es una sugerencia: fue un IDOR real (mass assignment) corregido en producción (auditoría de seguridad 2026-07-16, hallazgo 2.1). Cualquier ID referenciado *dentro* del body también se valida — no solo el de la URL (ver el mismo archivo, los checks de `managerId`/`departmentId`/`statusId` antes de un `PATCH`/`POST`).

3. **Nunca pases `req.body` sin whitelist a un `prisma.update()`.** El patrón real (`src/modules/hr/employeeService.ts`, `updateEmployee`):
   ```ts
   const data: Prisma.EmployeeUncheckedUpdateInput = {};
   if (input.firstName !== undefined) data.firstName = input.firstName;
   if (input.departmentId !== undefined) data.departmentId = input.departmentId;
   // ... un campo a la vez, explícito
   ```
   Esto existe porque `req.body` sin filtrar permitía reasignar `tenantId`/`statusId` de un empleado a otro tenant — el mismo hallazgo 2.1 de arriba. Las rutas en `app.ts` sí hacen `createEmployee({ ...req.body, tenantId: user.tenantId! })` (spread + override), pero eso es seguro *solo* porque `createEmployee`/`updateEmployee` en el service ya arman el objeto `data` campo por campo — el spread nunca llega crudo a Prisma.

4. **Si el dato es "campo dinámico" reutilizable entre módulos, usá el modelo genérico `tenantId` + `entityType` + `entityId`** (ver `CustomFieldValue`, `StatusHistoryEntry`), no una FK nueva por módulo. Así se evitó tener que tocar el schema cada vez que se agrega un módulo nuevo.

5. **Antes de asumir que algo es un enum fijo, preguntate si en realidad debería ser un catálogo configurable por tenant.** `StatusDefinition` es el precedente (cada tenant puede renombrar/reordenar/desactivar/tener default). `FieldCatalogDefinition` es la versión más liviana del mismo patrón para Department/Job Title. **Excepción deliberada**: `Status` en sí *no* se fusionó dentro de `FieldCatalogDefinition` cuando se generalizó Department/Job Title — se evaluó explícitamente y se descartó porque Status ya tenía demasiada funcionalidad viva (Kanban, `StatusHistoryEntry`, guardrail de default) para justificar el riesgo de migrar datos reales sin un beneficio real. No repitas la fusión sin la misma evaluación.

6. **Nunca dejes que `passwordHash` u otro campo sensible viaje al frontend.** Pasá todo por `sanitizeUser` (`src/modules/auth/authService.ts`).

## Componentes y patrones reutilizables — usalos, no los reinventes

`frontend/src/components/` (33 archivos). Antes de escribir un componente nuevo, revisá si ya existe algo:

| Necesitás... | Usá |
|---|---|
| Panel lateral para un form de "entidad completa" (varios campos) | `SlideOver.tsx` |
| Panel lateral de solo lectura que empuja el contenido en vez de flotar encima | `EmployeeOverviewPanel.tsx` como referencia de patrón (no es genérico todavía — si Clients lo necesita, extraer el layout, no copiar/pegar) |
| Cualquier popover (dropdown, menú, color picker anidado) | `Popover.tsx` — portal a `document.body` + `getBoundingClientRect()`. Evita el bug clásico de `overflow-x: auto` recortando un `position: absolute` a mano. Si tu popover vive anidado dentro de otro, el popover exterior tiene que tolerar clicks dentro de *cualquier* `.popover-panel`, no solo el propio (ya corregido una vez, ver `Popover.tsx`) |
| Selector de color | `ColorPicker.tsx` (paleta + custom persistido en `localStorage`) |
| Notificación de éxito/error | `useToast()` (`ToastProvider.tsx`) — nunca `alert()` |
| Confirmación de una acción destructiva | `ConfirmDialog.tsx` — nunca `confirm()` nativo |
| Paginación de una tabla | `Pagination.tsx` (20 filas/página, client-side) |
| Tabla tipo planilla (Employees/Clients/Company Users) | `.full-table` + `.full-table-wrap`, con `useResizableColumns`/`useColumnOrder`/`useColumnVisibility` para resize/reorder/hide, y `HorizontalScrollbar.tsx` para el scroll horizontal propio. No reinventar ninguno de estos mecanismos por tabla — son genéricos por diseño (parametrizados por `storageKey`) |
| Board estilo Kanban con drag-and-drop | `KanbanBoard.tsx` (genérico, tipado, con `renderCard`/`renderColumnFooter` como render props) |
| Avatar de iniciales / chip de status / chip de rol | `Avatar.tsx` / `StatusChip.tsx` / `RoleChip.tsx` |

Backend, `src/lib/`: `csv.ts` (parser/serializer propio, no sumar una librería de CSV), `mailer.ts` (best-effort por default — ver el patrón exacto antes de agregar un envío nuevo), `rateLimit.ts` (in-memory, keyed por string — no sumar `express-rate-limit`), `prisma.ts` (retry con backoff ya configurado — no agregar retry ad-hoc en otro lado).

## Protocolo de migraciones de DB seguras sobre datos en producción

**Contexto crítico**: el `.env` local de desarrollo apunta a la base de datos de **producción** real (no una copia), y el proyecto usa `prisma db push` — no hay `prisma migrate`, no hay red de seguridad automática. Ver `06-infraestructura-y-estructura.md`.

Para cualquier cambio que toque columnas **existentes con datos ya cargados** (no una tabla/columna nueva vacía):

1. **Push aditivo** — agregar columnas/tablas nuevas, sin tocar las viejas. Si la columna nueva puede tener un default seguro (ej. `currency String @default("USD")`), usalo — Postgres lo aplica retroactivamente a las filas existentes en el mismo `ALTER TABLE`, sin necesitar un backfill separado.
2. **Script de backfill** — si la columna nueva necesita derivarse de datos existentes (no un default fijo), poblarla con un script en `scripts/` (ver `scripts/backfill-department-catalog.ts` como referencia real: creó entradas de catálogo y linkeó cada registro existente, verificado 1:1 antes de continuar).
3. **Verificar con queries directas contra la DB** antes de seguir.
4. Recién ahí, **push destructivo** (borrar columnas viejas) — con `--accept-data-loss` solo cuando el paso 3 confirmó que no queda dato sin migrar.

**Nunca saltees el paso 3. Nunca hagas el paso 4 sin haber corrido el 1-3 antes en un entorno donde puedas verificar.**

Si el ambiente de `staging` (Neon branch separada desde 2026-07-24) ya está en uso al momento de leer esto: correr el mismo `prisma db push` también contra `STAGING_DATABASE_URL`, no solo `DATABASE_URL` — son bases separadas que no se sincronizan solas, y ya se desalinearon una vez.

## Checklist obligatorio antes de dar una tarea por terminada

1. `npm run build` en verde (backend — `tsc -p tsconfig.json`).
2. `npm test` en verde (backend — `vitest run`).
3. `cd frontend && npm run build` en verde. Cuidado: `frontend/tsconfig.json` necesita las entradas correctas en `lib`/`jsx` o el build falla aunque el dev server ande bien (ya pasó dos veces en este proyecto — una con `jsx`, otra con `ES2022.Intl`).
4. **Verificación real en navegador** — no asumas que algo visual funciona porque compila. Si tenés Playwright disponible, usalo contra el dev server local; si no, decilo explícitamente en vez de reportar éxito sin haberlo visto.
5. Si el cambio ya se deployó (push a `main` o `staging`), confirmar con `curl` contra una ruta/hash de bundle en producción que el cambio efectivamente salió — no asumas que salió porque el push no dio error. Hacer esto en **cada** push relevante, no solo el primero de la sesión.
6. Nunca agregues una dependencia nueva sin justificarla explícitamente antes (patrón ya establecido: `scrypt` nativo en vez de bcrypt, parser CSV propio, rate limiter propio — ver `07-stack-tecnologico.md`).

## Manejo de tareas de backlog y decisiones no cubiertas

- Las tareas normalmente ya vienen pre-pensadas (spec + a veces mockup) de una conversación previa — ejecutalas tal como están definidas, sin reabrir decisiones ya cerradas ahí.
- Si durante la implementación aparece una decisión real que la tarea no cubre (un trade-off no obvio, algo que podría vivir en dos lugares distintos, un layout no definido), **parate y presentala como pregunta explícita antes de decidir y seguir** — no la resuelvas en silencio y la documentes después.
- Una tarea de backlog que junta varias piezas grandes se confirma y pushea pieza por pieza, no todo junto al final.

## Qué NO hacer — antipatrones ya corregidos en el historial, no los reintroduzcas

- **No pases `req.body` crudo a un `prisma.update()`/`prisma.create()` sin whitelist de campos.** Fue un IDOR real (ver arriba).
- **No devuelvas un objeto `User` completo del backend sin pasarlo por `sanitizeUser`.**
- **No agregues un endpoint nuevo sin el chequeo de `tenantId` del recurso.**
- **No crees una tabla o columna nueva para algo que el modelo genérico de custom fields o el patrón de catálogo configurable ya resuelve.**
- **No dejes un modelo a medio camino entre "campo suelto" (popover chico) y "entidad completa" (SlideOver)** — si tiene 4+ campos propios, es `SlideOver`.
- **No uses `alert()`/`confirm()` nativos del navegador** — `ToastProvider`/`ConfirmDialog` existen exactamente para esto.
- **No construyas un popover con `position: absolute` a mano** — usá `Popover.tsx`, ya resolvió el bug de recorte contra `overflow-x: auto`.
- **No corras un `prisma db push` destructivo sin backfill + verificación previos**, ni asumas que estás en una base de desarrollo — probablemente no lo estás (ver nota crítica arriba).
- **No borres código que parezca muerto sin confirmar quién lo consume primero** — ya pasó (`createTenantWithOwner`, borrado sin revisar que el frontend todavía lo llamaba).
- **No fusiones `Status` dentro de `FieldCatalogDefinition`** sin repetir la misma evaluación de riesgo que llevó a dejarlo afuera la primera vez.
- **No asumas que un ítem del backlog en `docs/tareas-desarrollo.md` marcado `[ ]` sigue sin implementar** — ya se encontraron al menos dos casos donde el checklist estaba desactualizado respecto al código real (ver `04-analisis-estado-y-avances.md`). Verificá contra el código antes de reimplementar algo que ya existe.

## Consistencia por sobre elegancia técnica

Cuando la forma técnicamente "más elegante" de resolver algo compite con el patrón ya establecido en el codebase, **gana el patrón ya establecido**, salvo que haya una razón concreta y documentada para desviarse (y en ese caso, documentarla en el mismo lugar donde se documentan las demás decisiones de arquitectura — `docs/tareas-desarrollo.md` o el archivo semanal correspondiente en `docs/tareas/`). Ejemplos de este criterio ya aplicado en el proyecto: no se introdujo `prisma migrate` aunque sea "más correcto" que `db push`, porque todo el flujo de migraciones seguras del proyecto ya está construido alrededor de `db push` + scripts de backfill; no se generalizó `Status` dentro del catálogo genérico aunque técnicamente sea más consistente, por el riesgo real sobre datos de producción sin beneficio proporcional.
