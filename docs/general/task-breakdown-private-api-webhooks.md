# Tareas — API Privada + Webhooks Salientes

Checklist ejecutable, en orden estricto. Spec completa con el razonamiento de cada decisión en
`spec-private-api-webhooks.md` — este documento es solo la lista de tareas para ir tildando. Nada de
esto está construido todavía (2026-09-02).

Criterio en cada unidad, mismo que el resto de las specs del proyecto: build → `npm run build`/
`npm test`/`npm run lint` → verificación real (curl y/o Playwright contra un tenant descartable) →
commit → push a la rama de trabajo, nunca directo a `main` sin revisión.

**Antes de arrancar la Unidad 1:**
- [ ] 0a. Confirmar con el usuario el riesgo #1 de la spec (sección 10): si `hr.payroll:write` sale
  con un paso extra (ej. confirmación por email al crear una key con ese scope) o directamente no se
  ofrece hasta v2. No bloquea la Unidad 1 ni 2, sí bloquea el tramo de escritura de Payroll en la
  Unidad 3.
- [ ] 0b. Generar `WEBHOOK_SECRET_ENCRYPTION_KEY` (32 bytes, hex — mismo comando que ya se usó para
  `STRIPE_TOKEN_ENCRYPTION_KEY`/`GOOGLE_TOKEN_ENCRYPTION_KEY`) y cargarla en `.env` local. Cargarla
  en Vercel (Preview + Production) queda pendiente hasta el deploy real, no bloquea desarrollo local.

---

## Unidad 1 — Fundamento: schema, autenticación por API Key, gestión de keys

- [ ] 1. **Schema** (`prisma/schema.prisma`, aditivo): `model ApiKey` y `model ApiRequestLog` tal
  cual la sección 1 de la spec (`keyPrefix`/`keyHash` únicos, `scopes String[]`, FK real
  `createdByUserId` → `User`, mismo patrón que `connectedByUserId` de `StripeConnection`). `db push`
  contra `STAGING_DATABASE_URL` únicamente.
- [ ] 2. **`src/lib/prismaExternal.ts`** (decisión #11): construye un `PrismaClient` propio a partir
  de `process.env.DATABASE_URL` con un `connection_limit` bajo agregado al connection string (ej.
  5) — no reusar ni extender el `prisma` de `src/lib/prisma.ts`. Exportar una única instancia
  (mismo patrón singleton que `lib/prisma.ts` ya usa, para no abrir un pool nuevo por request).
- [ ] 3. **`src/lib/externalApiAuth.ts`** (nuevo):
  - `generateApiKey()`: `nk_live_` + 32 bytes de `crypto.randomBytes` en base62 → devuelve
    `{ fullKey, keyPrefix }` (`keyPrefix` = primeros ~14 caracteres, lo único que se vuelve a
    mostrar después).
  - `hashApiKey(fullKey)`: `sha256` simple (no `scrypt` — ver justificación en la spec, sección 1)
    con `crypto.createHash`, hex digest.
  - `authenticateApiKey(req, res)`: lee `Authorization: Bearer <key>` (reusar
    `getBearerToken` de `httpAuth.ts`), hashea, busca en `ApiKey` vía `prismaExternal`, 401 si no
    existe o `revokedAt` no es null, actualiza `lastUsedAt` best-effort, devuelve la key con su
    `tenantId`/`scopes`.
  - `requireScope(scope)`: middleware factory — 403 `{error, code: 'missing_scope', required: scope}`
    si `scope` no está en `apiKey.scopes`.
- [ ] 4. **`permissionService.ts`**: agregar `'manage_api_access'` a `rolePermissions.owner` y la
  función `canManageApiAccess(role)` — mismo patrón/comentario que `canManagePayments`.
- [ ] 5. **`src/modules/integrations/apiKeyService.ts`** (nuevo): `createApiKey(tenantId, userId,
  {name, scopes})` (genera + hashea + persiste, devuelve la key completa **una sola vez**),
  `listApiKeys(tenantId)` (nunca `keyHash`/key completa), `revokeApiKey(tenantId, id)` (soft,
  `updateMany` idempotente — mismo bug a evitar que ya se encontró y corrigió en
  `StripeConnection.disconnectedAt`, Payments v1 Unidad 1, tarea 6).
- [ ] 6. **`src/routes/apiAccessIntegration.ts`** (nuevo router, mismo patrón que
  `stripeIntegration.ts`): `POST/GET/DELETE /api/integrations/api-keys`, gate `canManageApiAccess`
  vía `validateSession` + chequeo de rol (nunca `role === 'owner'` inline).
- [ ] 7. Montar el router nuevo en `src/app.ts` (`app.use(apiAccessIntegrationRouter)`).
- [ ] 8. **Tests** (`tests/`): `hashApiKey`/`generateApiKey` (formato, unicidad), `apiKeyService`
  (creación/listado/revocación, revocar dos veces es un no-op), rutas (403 no-owner, 401 sin
  sesión, la key completa solo aparece en la respuesta de creación).
- [ ] 9. **Verificación real** contra `staging`: tenant + owner + member descartables, crear key
  como owner (confirmar que la respuesta trae la key completa una sola vez), 403 como member,
  `GET` posterior confirma que solo devuelve `keyPrefix`, revocar y confirmar 401 al usarla después.

---

## Unidad 2 — Endpoints de lectura (`/api/external/v1/*`)

- [ ] 10. **Decisión de implementación a resolver antes de escribir rutas**: los `*Service.ts`
  existentes (`taskService.ts`, `opportunityService.ts`, etc.) importan `prisma` fijo desde
  `lib/prisma.ts`. Para que el router externo use `prismaExternal` (Unidad 1, tarea 2) sin duplicar
  lógica de negocio, cada función de servicio que el router externo llame necesita aceptar el
  cliente Prisma como parámetro opcional (default al `prisma` compartido, para no tocar ningún call
  site interno existente) — ej. `getTasks(tenantId, filters, client: PrismaClient = prisma)`. Confirmar
  este patrón antes de tocar el primer servicio, para no repetirlo distinto en cada uno.
- [ ] 11. **`src/routes/externalApi.ts`** (nuevo router, `externalApiRouter`): middleware de entrada
  para todo el router — `authenticateApiKey` (401), `isRateLimited('apikey:' + apiKey.id, {...})`
  (429 + `Retry-After`), y un middleware de logging que escribe `ApiRequestLog` en `res.on('finish')`
  (best-effort, no bloquea la respuesta — mismo criterio que `sendPasswordResetEmail`).
- [ ] 12. Shape de error fijo en todo el router: `{ error: string, code: string }` — helper
  `sendExternalApiError(res, status, code, message)` para no repetirlo en cada handler.
- [ ] 13. Paginación cursor-based reusable (helper compartido, mismo criterio que ya usa
  `GET /api/payments/companies/:id/events`).
- [ ] 14. Endpoints `GET` por recurso (uno a la vez, cada uno con su propio `requireScope`), todos
  vía `prismaExternal` (tarea 10):
  - `GET /api/external/v1/tasks`, `/:id` — scope `tasks:read`
  - `GET /api/external/v1/notes`, `/:id` — scope `notes:read`
  - `GET /api/external/v1/crm/companies`, `/:id` — scope `crm.companies:read`
  - `GET /api/external/v1/crm/contacts`, `/:id` — scope `crm.contacts:read`
  - `GET /api/external/v1/crm/opportunities`, `/:id` — scope `crm.opportunities:read`
  - `GET /api/external/v1/crm/pipelines` — scope `crm.pipelines:read`
  - `GET /api/external/v1/hr/employees`, `/:id` — scope `hr.employees:read`
  - `GET /api/external/v1/hr/timeoff` — scope `hr.timeoff:read`
  - `GET /api/external/v1/hr/payroll` (runs/entries, sin datos de cuenta de cobro) — scope
    `hr.payroll:read`
- [ ] 15. Montar `externalApiRouter` en `src/app.ts`.
- [ ] 16. **Tests**: por cada endpoint — 401 sin key, 403 sin el scope, 200 con el scope correcto,
  aislamiento entre tenants (una key de un tenant nunca ve datos de otro — mismo tipo de test que
  falta a nivel general según el backlog, acá sí se cubre para esta API específica).
- [ ] 17. **Verificación real**: key con un solo scope (`tasks:read`), confirmar 200 en `/tasks` y
  403 en `/crm/companies`; confirmar en `ApiRequestLog` que ambas llamadas quedaron registradas.

---

## Unidad 3 — Endpoints de escritura

- [ ] 18. Endpoints `POST`/`PATCH`/`DELETE` por recurso, mismo router, scope `:write` — mismo orden
  de la Unidad 2, **Payroll al final**, después de resolver la tarea 0a de arriba.
- [ ] 19. Validación de input con `zod` (ya está instalado, sin uso real en ningún endpoint hoy —
  primera vez que se usa en el proyecto; buena oportunidad de fijar acá el patrón para el resto de
  la API en vez de validación manual campo por campo).
- [ ] 20. `crm.opportunities:write` incluye el endpoint dedicado de cambio de stage
  (`PATCH /api/external/v1/crm/opportunities/:id/stage`), no un `PATCH` genérico — mismo criterio
  que ya separa esto en la API interna (`opportunityService.ts`).
- [ ] 21. **Tests**: creación/actualización/borrado por recurso, 403 sin scope `:write` (aunque la
  key tenga `:read`), validación de zod rechaza payloads inválidos con 400 + detalle de campo.
- [ ] 22. **Verificación real**: crear una Task real vía `POST /api/external/v1/tasks` con una key
  de test, confirmar que aparece en la UI del tenant (Playwright o revisión manual en `staging`).

---

## Unidad 4 — Webhooks salientes

- [ ] 23. **Schema**: `model WebhookSubscription`, `model WebhookDelivery`,
  `enum WebhookDeliveryStatus` — sección 1 de la spec, aditivo.
- [ ] 24. **`src/lib/webhookEncryption.ts`**: calca `stripeEncryption.ts` (AES-256-GCM,
  `encryptWebhookSecret`/`decryptWebhookSecret`), key propia `WEBHOOK_SECRET_ENCRYPTION_KEY`
  (generada en la tarea 0b).
- [ ] 25. **`src/modules/integrations/webhookService.ts`**: `createSubscription`,
  `listSubscriptions`, `updateSubscription` (url/events/isActive), `deleteSubscription` (soft, no
  hard-delete — conserva `WebhookDelivery` legible), `regenerateSecret`.
- [ ] 26. **`src/modules/integrations/webhookDispatchService.ts`**: `emitWebhookEvent(tenantId,
  type, entity, data)` — busca `WebhookSubscription` activas del tenant suscriptas a `type`, crea un
  `WebhookDelivery` por cada una (`status: pending`), no entrega sincrónicamente (eso es la tarea
  28).
- [ ] 27. Insertar la llamada a `emitWebhookEvent` al final de cada `*Service.ts` relevante, una por
  evento del catálogo (spec sección 7.1), fire-and-forget (`.catch(console.error)`, nunca `await`
  bloqueante de la respuesta al usuario):
  - `employee.created`/`.updated`/`.terminated` — `employeeService.ts`/`terminationService.ts`
  - `timeoff.requested`/`.approved`/`.rejected` — `timeOffRequestService.ts`
  - `opportunity.created`/`.stage_changed`/`.won`/`.lost` — `opportunityService.ts`
  - `company.created` — `companyService.ts`
  - `contact.created` — `contactService.ts`
  - `task.created`/`.completed` — `taskService.ts`
- [ ] 28. **Entrega**: `deliverWebhookDelivery(delivery)` (`webhookDispatchService.ts`) — arma el
  body (shape de la sección 7.2), firma `HMAC-SHA256(secret, `${timestamp}.${rawBody}`)`, headers
  `X-Northstack-Signature`/`X-Northstack-Timestamp`, `fetch` con timeout 10s, actualiza
  `attempts`/`lastAttemptAt`/`responseStatusCode`/`status`/`nextAttemptAt` según el resultado.
- [ ] 29. **Cron de reintentos**: nuevo endpoint interno (`src/routes/internal.ts`, mismo patrón
  `checkCronSecret` que los otros 5), escanea `WebhookDelivery` con `status: pending` y
  `nextAttemptAt <= now`, backoff 1min/5min/30min (3 reintentos), `failed` al 4to fallo. Antes de
  agregar la entrada a `vercel.json`, **confirmar el límite de cantidad de cron jobs del plan de
  Vercel actual** (ya hay 5 configurados) — si no entra, evaluar fusionar este reintento dentro de
  uno de los crons existentes en vez de sumar uno nuevo.
- [ ] 30. `needsAttention: true` en `WebhookSubscription` tras 5 fallos **consecutivos** de esa
  suscripción (no del delivery individual) — deja de generar tráfico contra una URL muerta.
- [ ] 31. **`POST/GET/PATCH/DELETE /api/integrations/webhooks`** (mismo router de la tarea 6),
  owner-only. El secreto se devuelve completo solo al crear/regenerar.
- [ ] 32. **Tests**: firma HMAC (válida/inválida), backoff y conteo de intentos, `needsAttention`
  tras 5 fallos consecutivos, que un evento no suscripto no genere `WebhookDelivery`.
- [ ] 33. **Verificación real**: `WebhookSubscription` apuntando a un endpoint de prueba (ej.
  `webhook.site` o un servidor local con `ngrok`/similar), crear una Task real (UI o API), confirmar
  que llega el `POST` con firma válida y que `WebhookDelivery.status` pasa a `success`.

---

## Unidad 5 — UI + cron de purga de logs

- [ ] 34. **Frontend — `api/apiKeys.ts`, `api/webhooks.ts`** (nuevos, mismo patrón que
  `api/payments.ts`): wrappers de los endpoints de las Unidades 1 y 4.
- [ ] 35. **Frontend — sección "API & Webhooks"** en `IntegrationsSettingsPage.tsx`, debajo de las
  cards existentes, owner-only:
  - Tabla de API Keys: nombre, prefijo, scopes (chips), último uso, botón "Revoke". "Create key"
    abre un form (nombre + checklist de scopes) y muestra la key completa una sola vez con aviso de
    "copiala ahora".
  - Tabla de Webhooks: URL, checklist de eventos, chip de estado (`chip-good`/`chip-error` si
    `needsAttention`), botón "Delete". Cada fila expande el log de últimas entregas (fecha, evento,
    status, código de respuesta, botón "Retry" que dispara `deliverWebhookDelivery` para ese
    delivery puntual).
- [ ] 36. **Cron de purga**: endpoint interno nuevo, `DELETE FROM "ApiRequestLog" WHERE
  "createdAt" < now() - interval '90 days'` — mismo comentario de la tarea 29 sobre el límite de
  crons del plan antes de sumar uno más.
- [ ] 37. **Tests frontend** (si el proyecto los tiene para el resto de Settings — confirmar
  convención actual antes de esta tarea) y **build/lint** de `frontend/`.
- [ ] 38. **Verificación real de punta a punta** contra `staging`: desde la UI, crear una key con
  scope `tasks:write`, usarla con `curl` para crear una Task, crear un webhook suscripto a
  `task.created`, confirmar la entrega en el log de la UI. `npm run build`/`npm test`/`npm run lint`
  (raíz) y build/lint de `frontend/` en verde antes de dar la feature por cerrada.
