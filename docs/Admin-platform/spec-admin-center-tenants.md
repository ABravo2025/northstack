# Spec — Admin Center: Tenants

## Alcance

Solo lectura. Ver todos los tenants de la plataforma, agrupados por estado, con detalle
por tenant que incluye sus usuarios. Sin acciones (no editar/suspender/impersonar) —
eso queda fuera de esta unidad, a definir en una spec propia si se necesita en el futuro.

## Backend — repo principal, namespace nuevo `/api/platform/*`

No reutilizar rutas tenant-scoped existentes. Middleware
`requirePlatformRole('platform_support')` en las tres (recordar: `platform_admin` pasa
siempre vía bypass del middleware).

### `GET /api/platform/tenants`

Query params: `status` (`active` | `suspended` | `cancelled`, requerido — no hay vista
"todos" combinada, la UI siempre manda un tab), `sortBy` (`name` | `country` | `createdAt`
| `userCount`), `sortOrder` (`asc` | `desc`), `search` (opcional, matchea `name` o
`country`, case-insensitive).

Respuesta por tenant: `id`, `name`, `country`, `createdAt`, `userCount` (agregado —
`COUNT(User) WHERE tenantId = T`).

### `GET /api/platform/tenants/:id`

Detalle: los campos de arriba + `currency`, `companySize`, `industry`,
`acquisitionChannel`.

### `GET /api/platform/tenants/:id/users`

Query params: `sortBy`, `sortOrder`. Respuesta por usuario: `id`, `firstName`,
`lastName`, `email`, `role` (owner/admin/member), `status` (active/inactive),
`createdAt`.

**No incluir "último login" en esta versión** — depende del sistema de logs/actividad
de toda la plataforma, todavía no construido (ver `tareas-desarrollo.md`). Cuando ese
sistema exista, se suma como columna nueva sin cambiar el resto del contrato.

**Nota de verificación antes de implementar**: confirmar que `User.createdAt` existe en
el `.prisma` real — no aparece explícito en `database-schema.md`, probablemente por
omisión del documento, pero confirmar contra el schema antes de asumirlo.

## Frontend — admin-center

Sección "Tenants" en el nav, deja de ser el placeholder "Próximamente".

- 3 tabs: Activos / Suspendidos / Cancelados (mapean 1:1 a `TenantStatus`), cada uno con
  contador.
- Tabla con columnas Nombre, País, Fecha de alta, Usuarios — headers clickeables para
  sort (toggle asc/desc).
- Buscador por nombre/país (opcional para v1 si el volumen de tenants es bajo — se puede
  sumar después sin romper nada).
- Empty state distinto si el tab está vacío vs. si la búsqueda no encontró nada.
- Click en fila → modal (no slide-over) con: stats rápidos (estado, moneda, industria,
  cantidad de usuarios) + tabla de Users abajo (Nombre, Email, Rol, Estado, Fecha de
  alta).
- Mockup de referencia: `admin-center-tenants-mockup.html`.

## Criterio de aceptación

- Cambiar de tab filtra correctamente y actualiza el contador.
- Sort por cada columna funciona en ambas direcciones.
- Un `platform_support` puede ver esta sección; un `platform_viewer` recibe 403 al
  intentar acceder a las rutas (y no ve el ítem de nav).
- El modal de detalle carga los usuarios reales del tenant seleccionado, no datos
  mockeados.
