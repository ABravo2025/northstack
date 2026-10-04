# Spec Shifts (Turnos y horas)

**Estado:** Unidad 1 en construcción (2026-10-04). Nada en `staging` ni en `main` todavía.
**Fecha:** 2026-10-04.
**Contexto:** un laboratorio químico preguntó si Northstack puede manejar personal en distintos horarios
y sedes, con turnos que no son bloques fijos, y que avisar y hacer el seguimiento es complicado.
Alejandro decidió construirlo como **función general para todos los rubros**, no como desarrollo a
medida. Prototipo aprobado: https://claude.ai/artifact/3DGWHCMcZvqDQ2U6jjL9N6 (privado).

Mismo criterio de ejecución que el resto de las specs: cada unidad build → `npm test` / `npm run build`
→ verificación real → commit → push **solo a `staging`** y se frena para la revisión de Alejandro antes
de `main`. Se trabaja en el worktree `C:\tmp\ns-shifts` (rama `feat/shifts`) porque otra sesión está
construyendo **Projects** sobre los mismos archivos de permisos/planes/schema: rebasear seguido.

---

## 0. Decisiones cerradas (Alejandro, 2026-10-04)

1. **Módulo general**, ítem propio **"Shifts"** en la barra lateral bajo People, con menú interno como
   Time Off: Schedule, My shifts, Timesheet, Approvals, Reports, Settings. Cada persona ve lo que sus
   permisos le permiten.
2. **Todo el que recibe turnos es usuario de Northstack** y cuenta como asiento. Solo se puede asignar
   un turno a un empleado con usuario activo. El email igual trae botones de un clic (link firmado)
   para aceptar/rechazar sin tener que iniciar sesión.
3. **Planes:** Starter = 1 locación activa, turnos, confirmaciones, disponibilidad y timesheet básico.
   Growth = locaciones ilimitadas, habilidades/habilitaciones, horas facturables y facturar desde
   horas, costo del cronograma, reportes y, más adelante, fichaje e IA.
4. **Recordatorios solo diarios.** Vercel está en Hobby (crons 1×día). Un único cron diario manda:
   recordatorio a quien no respondió un turno, aviso de los turnos de mañana, recordatorio de horas sin
   confirmar del día anterior y vencimiento de habilitaciones. No hay aviso "2 h antes" ni hora de
   recordatorio configurable por empresa (necesitarían cron horario).
5. **Costo del cronograma: opcional**, interruptor en Settings → Shifts, apagado por defecto. Solo lo
   ven roles con permiso de Payroll.
6. **Cierre de semana con imprevistos:** una semana aprobada queda cerrada y no se edita. Se corrige
   con una **entrada de ajuste** (motivo obligatorio, aprobada, imputada al período abierto y vinculada
   a la semana original) o, para errores grandes, alguien con permiso la **reabre** con motivo. Todo
   queda en el Activity Log.
7. **Timesheet que se llena solo:** sugiere entradas desde turnos confirmados, tareas completadas,
   reuniones y Google Calendar. Sugerir, nunca dar por cargado: siempre confirma la persona.
8. **Fichaje (fase 2, fuera de esta spec):** sin tablet. QR impreso por sede escaneado con el celular
   propio, o fichaje directo desde la app.
9. **IA/MCP:** fuera de esta spec, asentado en `spec-mcp-server.md` §10.
10. **Horas por proyecto** usan el modelo `Project` del módulo Projects (en construcción), no uno propio.
11. **Preferencias de notificación** (cada usuario elige qué emails recibe) entran en esta spec, porque
    el módulo suma muchos emails nuevos.

---

## 1. Modelo de datos

Todo modelo lleva `tenantId` obligatorio. Horas guardadas como hora local de la locación (minutos desde
medianoche) **y** como instantes UTC calculados, para ordenar y detectar superposiciones sin depender
de zonas horarias.

- `ShiftsSettings` (1 por tenant, se crea con defaults al primer uso): `requireConfirmation`,
  `remindUnanswered`, `remindDayBefore`, `minRestHours Int?` (default 12, null = sin regla),
  `weekStartsOn` (0-6, default 1), `timesheetEnabled`, `timesheetReminder`, `showScheduleCost`
  (default false), `allowSwaps` (reservado, fase 2).
- `Location`: `name`, `address?`, `timezone` (IANA, ej. `America/Argentina/Buenos_Aires`), `isActive`,
  `managerEmployeeId?` (el responsable puede gestionar los turnos de su sede sin `manage_shifts`).
- `ShiftTemplate`: `name`, `startMinute`, `endMinute`, `locationId?`, `position?`.
- `Shift`: `locationId`, `date @db.Date` (día local de inicio), `startMinute`, `endMinute`
  (`endMinute <= startMinute` = termina al día siguiente), `startsAt`/`endsAt` (UTC calculados),
  `position?`, `notes?`, `headcount` (personas necesarias, default 1), `status` (`draft | published |
  cancelled`), `publishedAt?`, `createdById`, `requiredSkillIds String[]` (Growth).
- `ShiftAssignment`: `shiftId`, `employeeId`, `status` (`pending | accepted | declined`),
  `respondedAt?`, `declineReason?`, `notifiedAt?`, `lastRemindedAt?`, `responseTokenHash?`
  (link firmado del email; se guarda el hash, nunca el token). Único por `(shiftId, employeeId)`.
- `ShiftCalendarSync`: `assignmentId`, `userId`, `googleCalendarEventId` (mismo patrón que
  `TimeOffCalendarSync`, pero solo al calendario del asignado).
- `EmployeeAvailability`: `employeeId`, `weekday Int?` (recurrente) **o** `date @db.Date?` (puntual),
  `startMinute`, `endMinute`, `kind` (`available | unavailable`), `note?`.
- `Skill` (catálogo por tenant) + `EmployeeSkill` (`employeeId`, `skillId`, `expiresAt?`) — Growth.
- Timesheet: `Timesheet` (`employeeId`, `weekStart @db.Date`, `status open | submitted | approved |
  returned`, `submittedAt?`, `decidedById?`, `decidedAt?`, `decisionNote?`, `reopenedAt?`,
  `reopenReason?`) y `TimeEntry` (`timesheetId`, `employeeId`, `date`, `minutes`, `source shift | task |
  meeting | calendar | manual | adjustment`, `sourceId?`, `shiftAssignmentId?`, `taskId?`,
  `projectId?`, `companyId?`, `billable`, `description?`, `adjustsTimesheetId?`, `reason?`).
  Las sugerencias **no se guardan**: se calculan al abrir la semana. Las descartadas se recuerdan en
  `TimeSuggestionDismissal` (`employeeId`, `sourceType`, `sourceId`) para que no vuelvan a aparecer.
- `Task.timeSpentMinutes Int?` + timer (Unidad 10).
- `NotificationType`: `shift_assigned`, `shift_changed`, `shift_cancelled`, `shift_declined`,
  `shift_reminder`, `timesheet_submitted`, `timesheet_decided`, `skill_expiring`.
- `ActivityEntityType`: `location`, `shift`, `shiftsSettings`, `timesheet`, `timeEntry`, `skill`.

Feriados: se reutiliza `TimeOffHoliday` (ya importa feriados nacionales por país). Ausencias:
`TimeOffRequest` aprobado.

## 2. Permisos

| Permiso | Qué habilita | Default |
|---|---|---|
| `view_shifts` | Ver el cronograma completo de todas las sedes | Admin |
| `manage_shifts` | Crear, editar, publicar y cancelar turnos; locaciones y plantillas | Admin |
| `approve_timesheets` | Aprobar, devolver y reabrir timesheets de cualquiera; ver reportes | Admin |

Sin permisos, cada persona ve y responde **sus** turnos y carga **su** timesheet. El responsable de una
locación gestiona los turnos de esa sede, y el manager directo (`Employee.managerId`) aprueba los
timesheets de sus reportes (mismo patrón que `canDecideTimeOff`). Settings del módulo: `manage_shifts`.

## 3. Reglas al asignar

Bloquean: persona sin usuario activo, superposición con otro turno publicado o en borrador de la misma
persona, locación inactiva. Avisan (se puede confirmar igual): Time Off aprobado ese día, feriado,
fuera de su disponibilidad, descanso menor a `minRestHours`, falta habilidad requerida o vencida.

## 4. Unidades

| # | Unidad | Incluye | Estimado |
|---|---|---|---|
| 1 | **Base** | Schema completo de turnos (sin timesheet), permisos, límites de plan, settings con defaults, utilidades de hora local ↔ UTC con tests | 1 sesión |
| 2 | **Locaciones y Settings** | API de locaciones y settings, Settings → Shifts (locaciones con TableBody, reglas), límite Starter | 1 sesión |
| 3 | **Turnos (backend)** | CRUD de borradores, plantillas, copiar semana, asignar con reglas de §3, publicar, editar/cancelar con re-confirmación, responder (app + link firmado), tests | 1½ sesiones |
| 4 | **Avisos** | Notificaciones in-app, emails EN/ES con `.ics` adjunto (con `await`), evento en Google Calendar del asignado | 1 sesión |
| 5 | **Schedule (UI manager)** | Grilla semanal por locación y por persona, detalle del turno, alta/edición, plantillas, copiar semana, publicar | 1½ sesiones |
| 6 | **Lado del empleado** | My shifts, aceptar/rechazar, disponibilidad, página pública del link del email | 1 sesión |
| 7 | **Habilidades** (Growth) | Catálogo, habilidades por empleado con vencimiento, requisito por turno | 1 sesión |
| 8 | **Cron diario** | Recordatorios de §0.4, en un solo endpoint interno + entrada en `vercel.json` | ½ sesión |
| 9 | **Timesheet (backend)** | Modelos, motor de sugerencias, confirmar/descartar, enviar, aprobar/devolver, cierre, ajustes, reabrir | 1½ sesiones |
| 10 | **Tiempo en tareas** | "¿Cuánto te llevó?" al completar, timer, `timeSpentMinutes` | 1 sesión |
| 11 | **Timesheet (UI)** | Timesheet del empleado y Approvals del manager | 1½ sesiones |
| 12 | **Reportes y costo** | Horas por persona/cliente/proyecto, facturable, costo opcional, CSV, borrador de factura en Payments (Growth) | 1½ sesiones |
| 13 | **Preferencias de notificación** | Settings → Profile: qué emails recibir, respetado por todos los envíos del módulo | 1 sesión |
| 14 | **Cierre** | Help Center, `function-index.md`, docs, handoff, anuncio, QA | ½ sesión |

**Total estimado:** ~15½ sesiones. Las unidades 1-8 entregan turnos completos y se pueden promover a
producción sin esperar al timesheet.
