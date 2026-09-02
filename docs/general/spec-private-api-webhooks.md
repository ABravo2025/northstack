# Spec: API Privada + Webhooks Salientes — Integraciones Externas

**Estado:** 📝 Spec técnico — no implementado todavía. Responde al ítem de `docs/tareas/backlog.md`
("Panel de Integraciones... Incluye también la contraparte entrante: API pública protegida por
token para integraciones externas. Sin spec técnico todavía, explícitamente no bloqueante para el
beta") y al pedido explícito del usuario de definir esta pieza. No bloqueante para el beta — queda
lista para construirse cuando se priorice.
**Fecha:** 2026-09-02.
**Contexto:** hoy Northstack no tiene ninguna vía para que un sistema externo (Zapier, Make, un
script del propio tenant, otro SaaS) lea o escriba datos de un tenant, ni para que Northstack avise
proactivamente a un sistema externo cuando algo cambia. Todo el acceso actual pasa por
`Session`/`authenticateToken` (`src/modules/auth/authService.ts`), pensado para un browser logueado,
no para una automatización de máquina a máquina. Esta spec define dos piezas que se construyen
juntas porque comparten el mismo modelo de permisos y de gestión (self-service, desde Settings,
owner-only):

1. **API privada** ("entrante"): endpoints REST autenticados por API Key, con permisos por scope,
   para que un tenant automatice altas/bajas/consultas ("movimientos") sin pasar por la UI.
2. **Webhooks salientes**: Northstack empuja un `POST` firmado a una URL que el tenant configura,
   cada vez que ocurre un evento elegible — para integrar hacia afuera sin que el tenant tenga que
   hacer polling contra la API de arriba.

Mismo criterio de ejecución que el resto de las specs del proyecto (`docs/tareas/specpaymentsv1.md`,
`docs/general/spec-billing-integration.md`): esta sesión entrega solo el spec, sin tocar código. La
sección 11 deja un plan de unidades listo para que una sesión futura lo ejecute.

---

## 0. Decisiones cerradas

1. **Alcance de recursos — CRUD completo, pero por scopes explícitos, no todo-o-nada por key.**
   Confirmado con el usuario: la API expone lectura y escritura sobre todos los módulos que ya
   existen (HR/Payroll, CRM, Tasks/Notes/Tags, Time Off) — no se recorta el catálogo de recursos
   como hizo Payments v1 con "solo lectura". La forma de mantener esto seguro sin backend nuevo por
   módulo es que **cada API Key nace sin ningún scope** y el owner elige explícitamente cuáles
   otorgarle al crearla (ver sección 3) — una key para "crear Tasks desde un formulario externo" no
   tiene por qué poder leer Payroll. Ninguna key obtiene acceso total salvo que el owner tilde todos
   los scopes a mano.
2. **Autenticación — API Keys por tenant** (no OAuth2/client-credentials — decisión ya tomada,
   evita construir un token endpoint, expiración/refresh y un client registry para una v1 con un
   solo tipo de consumidor: el propio tenant automatizando contra sí mismo, no un marketplace de
   apps de terceros). Mismo espíritu que la Restricted Key manual de Stripe en Payments v1: simple,
   entendible por un no-desarrollador, cero infraestructura nueva de OAuth.
3. **Namespace de rutas — `/api/external/v1/*`**, servidor Express existente, router nuevo
   (`externalApiRouter`, `src/routes/externalApi.ts`), nunca mezclado con `/api/*` (rutas internas
   de la SPA, autenticadas por `Session`). Versionado en el path desde el día uno (`v1`) porque,
   a diferencia de la API interna (que el propio frontend controla y puede migrar de punta a punta
   en un commit), esta la consumen sistemas de terceros que Northstack no controla — un cambio
   breaking necesita poder convivir con `v2` en vez de romper integraciones en producción sin aviso.
4. **Autorización — el scope de la key es la única fuente de permisos.** Los roles internos
   (owner/admin/member, `permissionService.ts`) no aplican a este tráfico: una key no "es" un
   usuario, no tiene sesión, no hereda `role`. Esto es deliberado y más simple de auditar que mapear
   cada key a un usuario y reusar sus permisos (que además cambiarían solos si ese usuario cambia de
   rol o se desactiva).
5. **Gestión — self-service, owner-only**, desde Settings → Integrations (la página que Payments v1
   ya consolidó como "el único hogar de cada integración", `IntegrationsSettingsPage.tsx`). Crear,
   ver (nunca el valor completo salvo al crearla), revocar keys y webhooks es un permiso nombrado
   nuevo (`canManageApiAccess`, `permissionService.ts`) — mismo patrón que `canManagePayments`, no
   un `role === 'owner'` inline, para no tener que tocar cada endpoint cuando exista el sistema de
   roles custom (backlog Tier 5).
6. **Rate limiting — por key**, en memoria, mismo mecanismo que `src/lib/rateLimit.ts` ya usa para
   login (`isRateLimited(key, options)`), con `key = `apikey:${apiKeyId}``. Igual limitación ya
   documentada en ese archivo (no es un límite global duro en serverless, cada cold start arranca en
   cero) — aceptable para v1, mismo criterio que el resto del proyecto de no traer Redis por esto
   todavía.
7. **Logging de acceso — obligatorio, por request autenticado.** Responde directo al pedido del
   usuario ("la url a la api debe ser con acceso de loging"): ninguna llamada a
   `/api/external/v1/*` sin una API Key válida (401 inmediato, sin excepciones — a diferencia de
   `/api/public/*` que es deliberadamente abierto para el Form público), y cada llamada autenticada
   (exitosa o no) queda registrada (`ApiRequestLog`, sección 1). Esto **no** es el sistema general de
   "logs de auditoría por usuario" que el backlog anota aparte (acciones hechas desde la UI por
   personas logueadas) — es más chico y específico: solo tráfico de esta API. Se nombra distinto a
   propósito para no crear la expectativa de que esta spec cierra ese ítem del backlog.
8. **Webhooks salientes — firmados, con reintentos, con log de entregas.** Mismo patrón HMAC que
   Northstack ya consume de Stripe/Paddle/Mercado Pago (`src/lib/stripe.ts`,
   `src/lib/paddle.ts`, `src/lib/mercadopago.ts`), aplicado ahora en la dirección inversa —
   Northstack es quien firma.
9. **Modelo de "evento" — nuevo, propio de esta feature, no el modelo compartido que el backlog
   sueña para in-app/email/Slack/webhook.** Ese ítem del backlog ("conviene diseñar un solo modelo
   de evento compartido entre los canales") sigue sin resolverse — se decidió no bloquear esta spec
   en ese rediseño más grande. El `type`/`payload` que se definen acá (sección 7.1) se eligieron con
   nombres genéricos (`employee.created`, no `stripe_charge_refunded` como el enum de
   `Notification`) justamente para que, el día que se construya el modelo compartido, este catálogo
   sea el punto de partida en vez de algo a tirar.
10. **Sin SDK/dependencia nueva.** Firma HMAC con `node:crypto` (igual que `mercadopago.ts`), keys
    con `crypto.randomBytes`, entrega de webhooks con `fetch` nativo — mismo criterio que el resto
    del proyecto.

---

## 1. Modelo de datos (Prisma) — propuesto, aditivo

```prisma
model ApiKey {
  id              String    @id @default(uuid())
  tenantId        String
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  name            String                     // "Zapier - altas de Tasks", elegido por el owner
  keyPrefix       String                     // "nk_live_ab12cd" — lo único visible tras la creación
  keyHash         String    @unique          // sha256(key completa), nunca la key en claro
  scopes          String[]                   // ["tasks:read","tasks:write","crm.opportunities:read", ...]
  createdByUserId String
  createdByUser   User      @relation(fields: [createdByUserId], references: [id])
  lastUsedAt      DateTime?
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())

  @@index([tenantId, revokedAt])
}

model ApiRequestLog {
  id           String    @id @default(uuid())
  tenantId     String
  tenant       Tenant    @relation(fields: [tenantId], references: [id])
  apiKeyId     String?              // null si el request ni siquiera trajo una key válida
  apiKey       ApiKey?   @relation(fields: [apiKeyId], references: [id])
  method       String
  path         String
  statusCode   Int
  ipAddress    String
  createdAt    DateTime  @default(now())

  @@index([tenantId, createdAt])
  @@index([apiKeyId, createdAt])
}

model WebhookSubscription {
  id                    String    @id @default(uuid())
  tenantId              String
  tenant                Tenant    @relation(fields: [tenantId], references: [id])
  url                   String
  secretEncrypted       String               // necesita quedar recuperable en claro para firmar cada entrega
  events                String[]             // ["employee.created", "opportunity.stage_changed", ...] — ver 7.1
  isActive              Boolean   @default(true)
  needsAttention        Boolean   @default(false)   // mismo patrón que StripeConnection — N fallos consecutivos
  createdByUserId       String
  createdByUser         User      @relation(fields: [createdByUserId], references: [id])
  createdAt             DateTime  @default(now())

  deliveries            WebhookDelivery[]

  @@index([tenantId])
}

model WebhookDelivery {
  id                     String                @id @default(uuid())
  webhookSubscriptionId  String
  webhookSubscription    WebhookSubscription   @relation(fields: [webhookSubscriptionId], references: [id])
  eventType              String
  payload                Json
  status                 WebhookDeliveryStatus @default(pending)
  attempts                Int                   @default(0)
  lastAttemptAt          DateTime?
  nextAttemptAt          DateTime?
  responseStatusCode     Int?
  createdAt              DateTime              @default(now())

  @@index([webhookSubscriptionId, createdAt])
  @@index([status, nextAttemptAt])           // cola: el cron de reintentos escanea por acá
}

enum WebhookDeliveryStatus {
  pending
  success
  failed
}
```

Notas de diseño:
- `ApiKey.keyHash` usa **SHA-256 simple, no `scrypt`** (a diferencia de `User.passwordHash`,
  `authService.ts`) — `scrypt` existe para defenderse de fuerza bruta contra secretos de **baja**
  entropía elegidos por humanos (contraseñas); una API Key es 256 bits generados por
  `crypto.randomBytes`, imposible de fuerza-brutear igual, así que un hash rápido con
  `timingSafeEqual` en la comparación es el mismo criterio que usan Stripe/GitHub para sus propias
  keys.
- `WebhookSubscription.secretEncrypted` sí necesita ser **reversible** (a diferencia de `keyHash`)
  porque Northstack tiene que volver a leer el secreto en claro para firmar cada entrega — mismo
  motivo por el que `StripeConnection.apiKeyEncrypted` usa cifrado y no hash. Nuevo módulo dedicado
  `src/lib/webhookEncryption.ts` (calca `stripeEncryption.ts`/`googleTokenEncryption.ts`), env var
  propia `WEBHOOK_SECRET_ENCRYPTION_KEY` (mismo patrón de "una key de cifrado por propósito" que ya
  usan `PAYMENT_DATA_ENCRYPTION_KEY`/`GOOGLE_TOKEN_ENCRYPTION_KEY`/`STRIPE_TOKEN_ENCRYPTION_KEY`).
- `ApiRequestLog` crece rápido (una fila por request). Igual que `Notification`, sin partición
  desde el día uno; se deja anotado un cron de purga (`DELETE ... WHERE createdAt < now() - 90 días`)
  como parte de la Unidad 5 (sección 11) en vez de resolverlo por adelantado.

---

## 2. Autenticación (API Keys)

- **Formato:** `nk_live_<43 caracteres base62, de 32 bytes random>` (prefijo `nk_test_` reservado
  para una futura key de test/sandbox si hiciera falta — no se construye en v1, no hay "modo test"
  real para estos datos como sí lo hay para Stripe).
- **Header:** `Authorization: Bearer <key>` — mismo header que usan las sesiones
  (`getBearerToken`, `src/lib/httpAuth.ts`), pero el middleware nuevo de `/api/external/v1/*` no
  reusa `authenticateToken` (que busca en `Session`): busca directo en `ApiKey` por el hash de lo
  recibido. Los dos espacios de autenticación (`Session` para `/api/*`, `ApiKey` para
  `/api/external/v1/*`) quedan completamente separados — una API Key nunca sirve para loguearse en
  la SPA, un token de sesión nunca sirve contra la API externa.
- **Verificación:** `sha256(key)` → lookup por `keyHash` (índice único) → 401 si no existe, 401 si
  `revokedAt` no es null. `lastUsedAt` se actualiza best-effort (mismo criterio de "solo escribir
  cuando aporta" que la sesión ya aplica en `authenticateToken`, acá simplificado a "una vez cada
  request" porque el volumen de una API por tenant es mucho menor que el de toda la SPA).
- **Creación:** `POST /api/integrations/api-keys` (`name`, `scopes[]`) — devuelve la key completa
  **una sola vez** en la respuesta; a partir de ahí solo se puede volver a ver `keyPrefix`. Si se
  pierde, no hay recuperación — se revoca y se crea una nueva (mismo patrón que cualquier proveedor
  serio de API Keys, y coherente con que Northstack solo guarda el hash).
- **Revocación:** `DELETE /api/integrations/api-keys/:id` — soft (`revokedAt`), nunca se borra la
  fila (mismo criterio que `Contact.isActive`/`StripeConnection.disconnectedAt`): conserva el
  historial de `ApiRequestLog` legible con nombre de key en vez de un id huérfano.
- **Listado:** `GET /api/integrations/api-keys` — nunca devuelve `keyHash` ni la key completa, solo
  `id/name/keyPrefix/scopes/lastUsedAt/createdAt/revokedAt`.

---

## 3. Autorización (scopes)

Granularidad `recurso:acción`, un scope por módulo/submódulo existente, dos acciones
(`read`/`write` — `write` cubre crear/actualizar/borrar, no se separan más fino en v1):

| Scope | Cubre |
|---|---|
| `hr.employees:read` / `:write` | `employeeService.ts` — altas, datos personales, status |
| `hr.timeoff:read` / `:write` | `timeOffRequestService.ts`, `timeOffBalanceService.ts` |
| `hr.payroll:read` / `:write` | `payrollRunService.ts`, `payrollEntryService.ts`, `employeeCompensationService.ts` — **el más sensible, el owner tiene que tildarlo a propósito** |
| `crm.companies:read` / `:write` | `companyService.ts` |
| `crm.contacts:read` / `:write` | `contactService.ts` |
| `crm.opportunities:read` / `:write` | `opportunityService.ts`, incluye cambios de stage |
| `crm.pipelines:read` | `pipelineService.ts` — solo lectura, son configuración, no "movimientos" |
| `tasks:read` / `:write` | `taskService.ts` |
| `notes:read` / `:write` | `noteService.ts` |

Middleware `requireScope(scope)` (`src/lib/externalApiAuth.ts`, nuevo), montado por ruta —
mismo lugar donde hoy `validateSession`/`authenticateUser` (`httpAuth.ts`) resuelven el usuario, acá
resuelve la `ApiKey` y corta con 403 (`{error: 'missing_scope', required: 'hr.payroll:write'}`) si
el scope pedido no está en `ApiKey.scopes`. Cada ruta del router externo declara su scope una sola
vez al registrarse, igual que hoy cada ruta interna llama a `validateSession`.

Explícitamente fuera de v1: scopes con alcance parcial dentro de un recurso (ej. "solo Companies de
un Pipeline"), o distintos scopes para test/producción.

---

## 4. Endpoints (`/api/external/v1/*`)

El router externo **envuelve los servicios ya existentes, no los reimplementa** — mismo principio
que ya sigue toda la app (rutas finas, lógica en `src/modules/*/*.ts`). La diferencia real entre
`/api/*` y `/api/external/v1/*` para un mismo recurso es la capa de auth (Session+scope de rol vs.
ApiKey+scope de key) y la forma del error (JSON estable y documentado, sin mensajes pensados para
mostrarse en un formulario de la SPA).

Ejemplo de shape (Tasks, ya con scope aplicado):

```
GET    /api/external/v1/tasks              scope: tasks:read
GET    /api/external/v1/tasks/:id          scope: tasks:read
POST   /api/external/v1/tasks              scope: tasks:write
PATCH  /api/external/v1/tasks/:id          scope: tasks:write
DELETE /api/external/v1/tasks/:id          scope: tasks:write

GET    /api/external/v1/crm/companies          scope: crm.companies:read
POST   /api/external/v1/crm/companies          scope: crm.companies:write
GET    /api/external/v1/crm/opportunities      scope: crm.opportunities:read
POST   /api/external/v1/crm/opportunities      scope: crm.opportunities:write
PATCH  /api/external/v1/crm/opportunities/:id/stage   scope: crm.opportunities:write

GET    /api/external/v1/hr/employees           scope: hr.employees:read
POST   /api/external/v1/hr/employees           scope: hr.employees:write
...
```

(Tabla completa 1:1 contra cada router interno existente se termina de mapear en la Unidad 2 de la
sección 11 — no vale la pena listar acá las ~40 rutas actuales a mano solo para que queden
desactualizadas apenas alguien agregue un endpoint nuevo.)

- **Paginación:** cursor-based en todo listado (mismo criterio que Payments v1 ya adoptó para
  `GET /api/payments/companies/:id/events` — consistente para quien integra contra ambas).
- **Errores:** shape fijo `{ error: string, code: string }` (`code` estable para que un integrador
  pueda ramificar sin parsear el string en inglés) — distinto del `{ error: string }` suelto que usa
  hoy la API interna, pensado para un humano leyendo la respuesta en devtools, no para un contrato.
- **Idempotencia:** fuera de alcance v1 (`Idempotency-Key` header) — anotado en sección 9, no
  bloqueante mientras el volumen de automatizaciones sea bajo.

---

## 5. Rate limiting

- `isRateLimited(`apikey:${apiKeyId}`, { windowMs: 60_000, maxRequests: N })` (`rateLimit.ts`,
  reusado tal cual) antes de cada handler del router externo — 429 con `Retry-After`.
- `N` por definir junto con Billing (backlog: "Panel de Integraciones" está en el mismo tier que
  Subscription Plans) — probablemente escalonado por plan, mismo lugar donde hoy vive
  `PlanPrice`/`Subscription`. Hasta que exista esa integración, un valor fijo conservador (ej. 120
  req/min por key) alcanza para v1.
- El límite es **por key**, no por tenant — un tenant puede tener varias keys (una por integración)
  sin que una acapare el presupuesto de las demás.

---

## 6. Logging / auditoría de acceso

Responde al requisito explícito de que el acceso a la API "sea con login" auditable:

- **Ningún endpoint de `/api/external/v1/*` es alcanzable sin una ApiKey válida** — a diferencia de
  `/api/public/*` (Forms), que es deliberadamente abierto. 401 inmediato, sin fallback anónimo.
- **Cada request autenticado (2xx, 4xx o 5xx) genera un `ApiRequestLog`**, escrito de forma
  best-effort después de resolver la respuesta (no bloquea ni puede tumbar el request si falla el
  insert — mismo criterio "best-effort" que `sendPasswordResetEmail`/`bestEffort.ts`).
- **Visible desde la UI** (sección 8): al lado de cada key, últimas N llamadas (fecha, método, path,
  status) — permite al owner confirmar que una integración está funcionando o encontrar qué key dejó
  de usarse.
- Explícitamente **no** es el sistema general de audit log de acciones-de-usuario-en-la-UI que el
  backlog anota aparte y sigue sin diseño — ver decisión #7.

---

## 7. Webhooks salientes

### 7.1 Catálogo de eventos (v1)

Un evento por escritura relevante de cada módulo ya cubierto por los scopes de la sección 3 —
nombrado `recurso.acción`, valor de string libre (no un enum de Prisma, a diferencia de
`NotificationType`) para poder sumar eventos nuevos sin migración de schema:

```
employee.created, employee.updated, employee.terminated
timeoff.requested, timeoff.approved, timeoff.rejected
opportunity.created, opportunity.stage_changed, opportunity.won, opportunity.lost
company.created, contact.created
task.created, task.completed
```

Un `WebhookSubscription` elige un subconjunto de estos `events` al crearse (checklist en la UI,
igual que el checklist de eventos de Stripe en Payments v1).

### 7.2 Shape del evento

```json
{
  "id": "evt_c9f...",
  "type": "opportunity.stage_changed",
  "tenantId": "...",
  "entity": { "type": "opportunity", "id": "..." },
  "data": { "...": "shape específico del recurso, mismo JSON que devuelve la API de lectura" },
  "createdAt": "2026-09-02T14:31:00.000Z"
}
```

### 7.3 Firma y entrega

- **Firma:** `HMAC-SHA256(secret, rawBody)`, header `X-Northstack-Signature: sha256=<hex>` — mismo
  algoritmo que Northstack ya verifica al revés contra Stripe/Paddle/MP
  (`verifyStripeSignature` en `lib/stripe.ts`, equivalentes en `paddle.ts`/`mercadopago.ts`), ahora
  aplicado como firmante en vez de verificador.
- **Anti-replay:** header `X-Northstack-Timestamp` (epoch ms) incluido en el string firmado
  (`${timestamp}.${rawBody}`, mismo patrón que Stripe usa en sus propios webhooks) — el receptor
  puede rechazar entregas con timestamp viejo; Northstack no impone tolerancia propia, es
  responsabilidad del receptor.
- **Transporte:** `fetch` nativo, `POST`, `Content-Type: application/json`, timeout 10s.
- **Reintentos:** cola simple sobre `WebhookDelivery` (no un cron nuevo — reusa el mismo router de
  crons internos ya existente, `src/routes/internal.ts`/`vercel.json`, un paso más agregado a la
  lista de 5 que ya corre). Backoff fijo de 3 intentos: inmediato → +1 min → +5 min → +30 min; al
  4to fallo, `status: failed` y, si son 5 fallos **consecutivos** de la misma `WebhookSubscription`
  (no del delivery individual), `needsAttention: true` (mismo patrón que `StripeConnection`) — deja
  de intentar esa suscripción hasta que el owner la revise, en vez de seguir generando tráfico contra
  una URL que dejó de existir.
- **Emisión:** cada `*Service.ts` que ya escribe la entidad dispara el evento al final, fire-and-
  forget (no bloquea la respuesta al usuario que hizo el cambio en la UI) — mismo punto de inserción
  que hoy usan las llamadas a `sendXEmail`/`createNotification` desde esos mismos services.

### 7.4 Gestión

- `POST/GET/PATCH/DELETE /api/integrations/webhooks` — mismo router de Integrations, owner-only
  (`canManageApiAccess`).
- El secreto se muestra una sola vez al crear la suscripción (igual criterio que la API Key), con
  botón "Regenerate" que invalida el anterior de inmediato.
- Reintentar manualmente un `WebhookDelivery` puntual desde la UI — botón por fila en el log de
  entregas (sección 8), no un endpoint que un tercero pueda llamar.

---

## 8. UI (alto nivel — no se construye en esta sesión)

Nueva sección dentro de Settings → Integrations (`IntegrationsSettingsPage.tsx`), debajo de las
cards de conexión existentes (Google Calendar, Stripe): **"API & Webhooks"**, owner-only, dos
tablas:

- **API Keys:** nombre, prefijo, scopes (chips), último uso, botón "Revoke". "Create key" abre un
  form (nombre + checklist de scopes) que, al confirmar, muestra la key completa una única vez con
  un aviso de "copiala ahora, no se puede volver a ver".
- **Webhooks:** URL, checklist de eventos, estado (`chip-good` activo / `chip-error` needsAttention),
  botón "Delete". Cada fila expande un log de últimas entregas (fecha, evento, status, código de
  respuesta, botón "Retry").

---

## 9. Explícitamente fuera de alcance de esta v1

- OAuth2 / client-credentials, un client registry, refresh tokens.
- IP allowlisting por key o por webhook.
- `Idempotency-Key` en escrituras.
- Rate limit configurable por plan (queda con un valor fijo hasta que exista la integración con
  Billing).
- Un catálogo público tipo "Zapier app" / "Make.com integration" — esta spec deja la API lista para
  que algo así se construya encima después, no lo construye.
- El sistema general de audit log de acciones-de-usuario-en-la-UI (backlog, ítem separado).
- El modelo de "evento" único compartido entre in-app/email/Slack/webhook (backlog, ítem separado)
  — esta spec define su propio catálogo de eventos, ver decisión #9.
- Modo test/sandbox real para keys o webhooks (`nk_test_` reservado en el formato, sin
  comportamiento distinto todavía).

---

## 10. Riesgos y decisiones abiertas

1. **`hr.payroll:write` vía API es el scope de mayor riesgo del catálogo** — una key mal guardada
   con ese scope podría disparar pagos. Mitigación de diseño ya incluida (scopes explícitos,
   ninguno por default) — pendiente de decidir con el usuario si además conviene, solo para ese
   scope, un paso extra (ej. requerir confirmación por email al crear una key que lo incluya, o
   directamente no ofrecerlo hasta una v2). No bloqueante para escribir el resto de la spec, sí
   antes de construir la Unidad de scopes de Payroll.
2. **Volumen de `ApiRequestLog`** sin partición — si algún tenant integra un sistema de alto tráfico
   contra esta API, la tabla puede crecer rápido antes de que corra el cron de purga (Unidad 5). Se
   acepta el riesgo para v1 (mismo criterio que el resto del proyecto: no over-engineer antes de
   tener uso real).
3. **Rate limit en memoria vs. serverless** (misma limitación ya documentada en `rateLimit.ts`) —
   un ataque distribuido contra varias instancias cold-started no queda cubierto. Aceptable para v1,
   revisar si se mueve a un store compartido cuando el volumen real lo justifique.

---

## 11. Plan de construcción sugerido (unidades)

Orden por dependencias, mismo criterio que el resto de las specs del proyecto (`build` → `npm test`
→ verificación real → commit por unidad):

1. **Fundamento:** schema (`ApiKey`, `ApiRequestLog`), `webhookEncryption.ts` no hace falta todavía
   acá (eso es de la Unidad 4), `externalApiAuth.ts` (autenticación + `requireScope`), gestión de
   keys (`POST/GET/DELETE /api/integrations/api-keys`, `canManageApiAccess` en
   `permissionService.ts`), logging de cada request (`ApiRequestLog`).
2. **Endpoints de lectura:** router externo `/api/external/v1/*` para todos los recursos de la
   sección 3, solo `GET`, envolviendo los servicios existentes — deja la API usable (integraciones
   de solo-consulta) antes de abrir escritura.
3. **Endpoints de escritura:** `POST/PATCH/DELETE` por recurso, mismos scopes `:write` — Payroll al
   final de la unidad, después de resolver el riesgo #1 de la sección 10 con el usuario.
4. **Webhooks salientes:** schema (`WebhookSubscription`, `WebhookDelivery`), `webhookEncryption.ts`,
   emisión desde cada `*Service.ts` (catálogo de la sección 7.1), cola de reintentos sobre el cron
   interno existente, gestión (`POST/GET/PATCH/DELETE /api/integrations/webhooks`).
5. **UI + cron de purga de logs:** sección "API & Webhooks" en `IntegrationsSettingsPage.tsx`
   (sección 8), cron de purga de `ApiRequestLog` (>90 días).

---

*Ver `docs/tareas/backlog.md` (Panel de Integraciones) para el ítem original que esta spec cierra.*
