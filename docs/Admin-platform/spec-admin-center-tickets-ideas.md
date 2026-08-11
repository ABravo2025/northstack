# Spec — Tickets, Ideas y catálogo de estados de plataforma

## Alcance de esta ronda

Se construye **Tickets completo** (backend + UI en admin-center). **Ideas** se construye
a nivel de modelo/backend en esta misma unidad (porque comparte el catálogo de estados
y conviene migrar el schema una sola vez), pero su UI en admin-center queda para la
siguiente ronda — hoy es un ítem de nav "Próximamente".

Son dos entidades separadas (no una con un campo `type`), para poder trabajarlas sin que
se mezclen, como pidió Alejandro explícitamente.

## 1. Catálogo de estados — plataforma, no por tenant

Diferencia clave respecto al Pipeline de Opportunity (que es un catálogo *por tenant*):
acá el catálogo es único, de plataforma, porque Tickets/Ideas son de Alejandro/soporte,
no de cada cliente.

```prisma
enum PlatformEntityType {
  ticket
  idea
}

model PlatformStatusDefinition {
  id         String              @id @default(uuid())
  entityType PlatformEntityType
  key        String              // slug interno, ej. "under_review"
  label      String              // texto mostrado en la UI, editable
  order      Int
  isDefault  Boolean             @default(false) // el que toma un registro nuevo al crearse
  isTerminal Boolean             @default(false) // cuenta como "cerrado" en filtros rápidos
  active     Boolean             @default(true)  // desactivar en vez de borrar si ya está en uso

  @@unique([entityType, key])
}
```

### Semilla inicial (backfill)

**Ticket**: `open` (default), `in_progress`, `resolved` (terminal), `closed` (terminal).
**Idea**: `new` (default), `under_review`, `planned`, `declined` (terminal), `shipped`
(terminal).

## 2. Modelos

```prisma
model Ticket {
  id             String   @id @default(uuid())
  tenantId       String
  userId         String?  // nullable si soporte lo carga sin identificar a nadie puntual
  createdByType  String   // 'user' | 'platform_staff'
  assignedToUserId String?
  subject        String
  description    String
  statusId       String   // FK a PlatformStatusDefinition (entityType: ticket)
  createdAt      DateTime @default(now())
}

model Idea {
  id             String   @id @default(uuid())
  tenantId       String
  userId         String?
  createdByType  String   // 'user' | 'platform_staff'
  subject        String
  description    String
  statusId       String   // FK a PlatformStatusDefinition (entityType: idea)
  createdAt      DateTime @default(now())
}
```

Sin `assignedToUserId` en `Idea` — no es un flujo de asignación de soporte, es trabajo
de producto de Alejandro.

## 3. Hilo de respuesta — reusar `Note`, no crear `TicketComment`

Se suma `ticket` e `idea` al enum `EntityType` ya existente (el mismo que usan
Notes/Activity Log/Custom Fields sobre Employee/Client/Company/Contact/Opportunity). El
hilo de un Ticket es una `Note` con `entityType: 'ticket'` y `entityId: ticket.id` —
reusa el componente y la tabla existentes, no un mecanismo nuevo.

- `Idea` también puede tener Notes (uso interno de Alejandro, ej. anotar por qué se
  marcó `declined`) — nunca dispara email.
- **Side-effect de email**: al crear una `Note` sobre un `Ticket` cuyo `authorType` es
  `platform_staff`, se dispara un mail best-effort (mismo patrón que
  `createInvitation` — `.catch()` que solo loggea, nunca rompe la operación) al
  `Ticket.userId → User.email` (o, si `userId` es null, no se envía nada — no hay a
  quién notificar). **No aplica a `Idea`** — ahí las Notes son 100% internas.

## 4. Puntos de carga

### Usuario del tenant (dentro de Northstack)

El formulario de feedback in-app existente (`FEEDBACK_EMAIL`, hoy solo manda un mail sin
persistir nada) se extiende: selector "Reportar un problema" / "Proponer una idea" →
crea un `Ticket` o una `Idea` según elección (`createdByType: 'user'`), y sigue
mandando el mail a `FEEDBACK_EMAIL` como aviso interno además de persistir el registro
— no se reemplaza el aviso por mail, se suma la persistencia.

### Soporte/admin (desde admin-center)

Botón "+ Nuevo ticket" en la sección Tickets → crea un `Ticket` vacío
(`createdByType: 'platform_staff'`, `status` = default del catálogo) y abre el detalle
para completarlo ahí mismo (subject, description, tenant/usuario si corresponde).

## 5. Backend — admin-center, `/api/platform/*`

- `GET /api/platform/tickets` — filtros: `status` (key o `__open__` para "no terminal"),
  `assignee` (userId o `unassigned`), `search` (subject/tenant/reporter), `sortBy`,
  `sortOrder`. `requirePlatformRole('platform_support')`.
- `GET /api/platform/tickets/:id` — incluye Notes asociadas (`entityType: 'ticket'`).
- `PATCH /api/platform/tickets/:id` — `statusId`, `assignedToUserId` (whitelist
  explícita de campos, no `req.body` crudo).
- `POST /api/platform/tickets/:id/notes` — crea la Note + dispara el email best-effort.
- `POST /api/platform/tickets` — creación manual por soporte.
- `GET/POST /api/platform/statuses?entityType=ticket|idea` — CRUD del catálogo
  (`requirePlatformRole` sin incluir `platform_support`, o sea solo `platform_admin` vía
  bypass — Settings de catálogo es solo-admin).
- `PATCH /api/platform/statuses/:id` — rename, reorder (`order`), toggle
  `isDefault`/`isTerminal`/`active`. Si se intenta desactivar un estado en uso, el
  backend no lo bloquea (el catálogo permite mantenerlo en registros existentes), pero
  el frontend muestra confirmación antes de mandar el PATCH.

## 6. Frontend — admin-center

Sección "Tickets" en el nav (con contador de abiertos, criterio `isTerminal`), dos vistas
internas via tabs: **Tickets** (lista) y **Settings** (catálogo de estados).

- **Lista**: subject, tenant, reportado por, asignado a, estado (chip con color propio
  del catálogo), fecha — sorteable, con búsqueda y filtros de estado/asignado.
- **Detalle** (modal): estado y asignado editables inline, descripción, hilo de
  comentarios (diferenciando autor: Admin/Support/Tenant), textarea de respuesta con
  aviso de que dispara email al reporter.
- **Settings**: tabla de estados con reorder (arriba/abajo), rename inline, toggles
  Default/Terminal, activar/desactivar con confirmación si está en uso, "+ Agregar
  estado" nuevo.
- Mockup de referencia: `admin-center-tickets-mockup.html`.

Sección "Ideas": queda como placeholder "Próximamente" en esta ronda (el backend ya
soporta el modelo, solo falta la UI — próxima unidad).

## 7. Matriz de acceso (ver también `spec-admin-center-platform-roles.md`)

| Acción | platform_admin | platform_support |
|---|---|---|
| Ver/gestionar Tickets (estado, asignación, responder) | ✅ | ✅ |
| Settings del catálogo (Tickets o Ideas) | ✅ | ❌ |
| Ver/gestionar Ideas (cuando exista la UI) | ✅ | ❌ |

## Criterio de aceptación

- Crear un `Ticket` desde el form in-app de un tenant real aparece en la lista del
  admin-center sin refrescar manualmente ningún caché.
- Responder un ticket desde admin-center crea una `Note`, la ve el hilo, y dispara un
  mail real (verificar con un tenant de prueba, no contra datos reales).
- Cambiar `status` vía el dropdown del detalle persiste y se refleja en la lista.
- Desactivar un estado en uso pide confirmación; los tickets existentes con ese estado
  no se rompen ni pierden el dato.
- Un `platform_support` puede operar tickets pero recibe 403 en las rutas de Settings
  del catálogo.
