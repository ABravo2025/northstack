# Spec — Módulo de Proyectos

- Fecha: 2026-10-05 (planificado y construido 2026-10-04/05)
- Estado: **en staging** (unidades 1-7), esperando revisión de Alejandro antes de producción.
- Prototipo aprobado: https://claude.ai/artifact/3k8cdefdG6M2D9Wow8GFyU

## Qué es

Un módulo para organizar el trabajo de un equipo en **fases**, con **tareas**, un **responsable** y un
**equipo**, opcionalmente para un cliente (Company). Sirve igual a quien empieza en blanco y a quien
quiere arrancar desde un **template** de su nicho.

**Principio de diseño:** un solo motor genérico. Un template es solo datos (fases + tareas con un
desfase de días y un rol sugerido) que se **copian** al proyecto nuevo; después el proyecto nunca
vuelve a leer el template. Sumar un nicho = cargar contenido, no escribir código.

## Decisiones (Alejandro, 2026-10-04)

- Templates de lanzamiento: Agencias, Estudios contables, Consultoras/implementación, Interno.
- Alcance v1: fases + tareas + equipo + progreso. **Sin** horas ni presupuesto.
- Templates propios: "Guardar como template" (Growth). Sin editor de templates en Settings.
- Plan: Starter hasta **5 proyectos abiertos** (planificación/activo/en pausa) y sin templates
  propios; Growth ilimitado; el trial es Growth. No se puede sobreescribir desde el Admin todavía.

## Modelo de datos (`prisma/schema.prisma`)

- `Project`: tenant, nombre, descripción, `companyId?`, `ownerEmployeeId`, `status`
  (`planning|active|on_hold|completed|cancelled`), `startDate?`/`dueDate?` (`@db.Date`),
  `completedAt` (se setea al pasar a completed), `templateId?` (informativo, SetNull),
  `isActive` (archivado). **No hay borrado físico**: se archiva, para que sus tareas/notas nunca
  apunten a un registro inexistente.
- `ProjectPhase`: nombre, color, orden. Al borrarla, sus tareas quedan sin fase.
- `ProjectMember`: `employeeId` + `projectRole` (texto libre). Único por (proyecto, empleado).
  Cascade al borrar el empleado. El responsable siempre es miembro.
- `ProjectTemplate` (+ `ProjectTemplatePhase`, `ProjectTemplateTask`): `tenantId` null = template
  del sistema (una fila por idioma, clave `systemKey`+`locale`); con tenant = propio.
  `tenantId` es **Cascade** (no SetNull): el borrado de cuentas (`tenantPurgeService`) deja vivas las
  filas SetNull y un tenantId en null convertiría el template privado en uno del sistema.
- Las tareas son `Task` comunes con `entityType = project` y `projectPhaseId?`. Notas, tags,
  custom fields y actividad se adjuntan igual que a una Company (`entityLookup.ts`).

## Reglas

- **Asignación al crear desde template** (`resolveTemplateAssignee`): `Task.assigneeId` es un User y
  no todo empleado tiene login. Rol con persona con login → esa persona; si no, el responsable si
  tiene login; si no, quien crea el proyecto. La vista previa del frontend aplica la misma regla.
- **Fechas**: `dueDate` de cada tarea = fecha de inicio + `dueOffsetDays` (puede ser negativo). La
  fecha de fin del proyecto = inicio + el mayor desfase, si no se indica.
- **Guardar como template**: fechas → días desde el inicio; responsable → su rol en el equipo; las
  tareas sin fase van a una fase final ("Otras tareas"). Limitación conocida: una tarea que cayó en
  el responsable por falta de login vuelve con el rol del responsable.
- **Progreso**: se calcula al leer (hechas / total, fase actual = primera con tareas abiertas,
  próximo vencimiento), nunca se guarda.

## Permisos

- `view_projects` (ver todos) y `manage_projects` (crear y editar cualquiera; requiere el anterior).
  Admin los recibe por seed; `scripts/backfill-projects-permissions.ts` los suma a los Admin existentes.
- Regla de relación (`projectAccess.ts`, misma idea que `canDecideTimeOff`): responsable y miembros
  siempre ven su proyecto; el responsable siempre puede editarlo. Las tareas del proyecto las puede
  trabajar cualquiera que lo vea (las rutas de tareas solo validan tenant, como en el resto).
- Borrar un empleado que es responsable de proyectos → 409 con mensaje claro (app y API pública).

## API

- `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`, `GET /api/projects/options` (nombres para
  los selectores, sin requerir permisos de RRHH/Ventas).
- Fases: `POST /phases`, `PATCH|DELETE /phases/:id`, `PUT /phases/order`. Equipo:
  `POST /members`, `PATCH|DELETE /members/:id`.
- Templates: `GET /api/project-templates?locale=`, `GET|DELETE /api/project-templates/:id`,
  `POST /api/projects/from-template`, `POST /api/projects/:id/save-as-template`.
- Tareas aceptan `projectPhaseId` (tiene que ser una fase del mismo proyecto).

## Templates del sistema

Contenido en `src/modules/projects/systemTemplates.ts` (EN y ES lado a lado). Se cargan/actualizan
con `scripts/seed-project-templates.ts` (idempotente). 9 templates: Sitio web, Campaña mensual,
Cierre mensual, Declaración anual, Alta de cliente nuevo, Implementación, Onboarding de cliente,
Onboarding de empleado, Auditoría interna.

## Frontend

- Menú lateral: "Proyectos" debajo de Mis tareas. `/projects` (lista, tarjetas en móvil) y
  `/projects/:id` (fases/tareas, tablero, equipo, notas y actividad).
- Alta en dos pasos (`NewProjectModal`): galería por nicho → datos, roles y vista previa.
- Sección "Proyectos" dentro del detalle de cada Company y de cada persona.
- Namespace i18n `projects` (EN/ES). Guía (`/guide#g-projects`) y FAQ (categoría Proyectos).

## Checklist para producción

1. `prisma migrate diff` contra prod y aplicar **solo** lo de Proyectos (nunca `db push` a ciegas).
2. `scripts/backfill-projects-permissions.ts` contra prod.
3. `scripts/seed-project-templates.ts` contra prod.
4. Push a `main` + disparar el workflow del APK de Android.

## Fuera de la v1

Horas trabajadas, presupuesto, editor de templates, crear un proyecto automáticamente al ganar una
Opportunity, más nichos (legal, construcción, eventos), límites de proyectos editables desde el Admin.
