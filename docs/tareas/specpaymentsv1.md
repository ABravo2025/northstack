# Spec Payments v1 — Conexión Stripe + Visibilidad de Pagos

**Estado:** ✅ Unidad 1 (conexión con Stripe) completa y verificada en `staging` (2026-08-26) — ver sección 8 para el detalle. Unidades 2-4 (lookup Company↔Customer, resúmenes de pagos en vivo, webhook) sin construir todavía. Nada de esta spec está en `main`/producción.
**Fecha de esta ronda:** 2026-08-26.
**Contexto:** primera unidad del "Módulo Payments" ya anotado en backlog (`docs/tareas-desarrollo.md`, Tier 4, dentro del futuro Panel de Integraciones — punto 1, Stripe). Esta unidad es el cimiento: conexión con Stripe por tenant + visibilidad de refunds/pagos fallidos/subscripciones por Company, dejando la base lista para que una unidad futura agregue creación de charges/invoices desde Northstack. `Company.billingAddress` ya existía reservado para esto (ver `docs/database-schema.md`, grupo 5).

Mismo criterio de ejecución que el resto de las specs del proyecto: cada unidad build → `npm run build`/`npm test` → verificación real (curl y/o Playwright contra un tenant de prueba) → commit → push exclusivamente a `staging`, nunca a `main`, hasta revisión del usuario.

---

## 0. Decisiones cerradas

1. **Alcance v1:** solo lectura (buscar y mostrar). La arquitectura debe quedar lista para que una unidad futura agregue cobros sin rehacer la conexión.
2. **Conexión:** API key pegada a mano por el tenant (no OAuth/Connect) — Northstack no tiene hoy una entidad de negocio habilitada para darse de alta como plataforma de Stripe Connect (mismo bloqueo que ya está anotado en el backlog para la suscripción propia de Northstack). Revisar esta decisión si en algún momento se resuelve lo de la entidad.
3. **Matching Company ↔ Customer:** no por dominio, se itera el email exacto de cada Contact de la Company contra Stripe.
4. **Persistencia del vínculo:** se guarda `stripeCustomerId` en la Company (esto sí conviene cachearlo — evita rehacer la búsqueda, y es un solo dato liviano, no un historial).
5. **Seguridad:** toda credencial/dato sensible se cifra en reposo.
6. **UI:** sección propia "Payments" en el sidebar (nombre en inglés, sin traducir).
7. **Registro histórico:** sin store, todo en vivo contra la API de Stripe. Con cientos de Companies por tenant, el volumen de filas en sí no era el problema (es poco para Postgres), pero sí lo era la infraestructura a construir y mantener (backfill paginado, idempotencia de webhooks, manejo de drift) para una feature que el propio backlog marca como no bloqueante para el beta. Como Stripe ya es la fuente de verdad del historial completo, consultarlo en vivo evita además cualquier necesidad de backfill.
8. **Webhook — alcance reducido:** se mantiene, pero solo para **notificaciones proactivas**, no para alimentar un store histórico. Dispara una `Notification` — **corregido 2026-08-26, verificado contra el código real**: el modelo `Notification` ya no es algo planeado, ya existe (`prisma/schema.prisma`, Sales v2 Unidad 7/8, en `staging` desde 2026-08-25/26, junto con el bell icon y los endpoints de listar/marcar leída). Esta unidad solo necesita sumar valores nuevos a `enum NotificationType` — ver Unidad 4.
9. **Permisos:** gate por rol — interinamente `owner`/`admin` (mismo criterio que Payroll/compensación), hasta que exista el sistema de roles custom (backlog Tier 5).
10. **Auditoría del match:** `Company.stripeCustomerMatchedVia` — se guarda el email de Contact que produjo el match.
11. **Permisos de la Restricted Key:** estrictamente de **lectura** en v1 — nada de escritura por adelantado. Se amplía recién cuando se construya la unidad de cobros.

---

## 1. Conexión con Stripe (API key manual)

### 1.1 Schema

```
model StripeConnection {
  id                            String    @id @default(uuid())
  tenantId                      String    @unique
  tenant                        Tenant    @relation(fields: [tenantId], references: [id])
  apiKeyEncrypted               String
  apiKeyMode                    String              // "test" | "live"
  stripeAccountId               String?
  webhookSigningSecretEncrypted String?
  connectedByUserId             String
  connectedAt                   DateTime  @default(now())
  disconnectedAt                DateTime?
  needsAttention                 Boolean  @default(false)
}
```

### 1.2 Backend

- `POST /api/integrations/stripe/connect`, `POST /api/integrations/stripe/webhook-secret`, `DELETE /api/integrations/stripe`, `stripeService.ts`.

### 1.3 Frontend

- Setup guiado en dos pasos (API key → webhook), estado conectado, gateado a `owner`/`admin`.

*(Detalle completo de estos tres puntos: ver Unidad 1 en la sección 8 de tareas.)*

---

## 2. Visibilidad de pagos: todo en vivo, sin store

- `GET /api/payments/companies/:companyId/summary` y `/events` — en vivo contra Stripe, sin tabla local.
- `GET /api/payments/overview` — fan-out con límite de concurrencia sobre las Companies vinculadas.
- Frontend: vista global (sidebar "Payments") + panel dentro del detalle de Company.

*(Detalle completo: ver Unidad 3 en la sección 8.)*

---

## 3. Webhook — solo para notificaciones proactivas

- Eventos: `charge.refunded`, `charge.failed`, `payment_intent.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- `POST /api/webhooks/stripe/:tenantId` (en `src/routes/webhooks.ts`, junto a Paddle/Mercado Pago — **corregido 2026-08-26**: no va en `/api/integrations/stripe/*`, ese prefijo queda para setup/connect. La diferencia con Paddle/MP es que esos son webhooks *de Northstack* — una sola cuenta propia — mientras que este es *por tenant*: cada tenant conecta su propia cuenta de Stripe y pega en su propio dashboard la URL con su `:tenantId`, pero el endpoint que la recibe sigue siendo código de Northstack, así que el archivo que ya agrupa "webhooks de proveedor" es el lugar correcto) verifica firma, resuelve `companyId`, crea `Notification`. Sin backfill, sin idempotencia pesada, sin reprocesamiento de eventos sin match.

*(Detalle completo: ver Unidad 4 en la sección 8.)*

---

## 4. Lookup / matching Company ↔ Stripe Customer

```
Company.stripeCustomerId          String?
Company.stripeCustomerMatchedVia  String?
```

- `POST /api/payments/companies/:companyId/stripe-lookup` — email exacto de cada Contact, 0/1/2+ resultados, confirmación manual.

*(Detalle completo: ver Unidad 2 en la sección 8.)*

---

## 5. Seguridad y manejo de datos sensibles

- Secretos cifrados en reposo (AES-256-GCM), nunca logueados ni devueltos al frontend.
- Ningún dato de tarjeta/pago persistido más allá de `stripeCustomerId`/`stripeCustomerMatchedVia`.
- `needsAttention` en vez de fallar silenciosamente ante key revocada.
- Todo gateado a `owner`/`admin`, placeholder hasta roles custom.

---

## 6. Explícitamente fuera de alcance de esta unidad

- Crear/cobrar charges, invoices o subscriptions desde Northstack.
- Store histórico local de eventos de pago.
- Migrar a Stripe Connect (OAuth).
- Sistema de roles custom.
- QuickBooks, Mercado Pago, Panel de Integraciones genérico.

---

## 7. Decisiones abiertas (no bloqueantes)

- Qué "resources" de lectura exactos permite acotar el creador de Restricted Keys de Stripe, y si "pagos fallidos" sale de Charges, Payment Intents, o ambos — confirmar contra la documentación real al implementar la Unidad 1/3.

---

## 8. Plan de construcción — tareas detalladas por unidad

Orden pensado por dependencias: la Unidad 1 es prerrequisito de todo lo demás (nada funciona sin una conexión válida). Unidades 2 y 3 pueden avanzar en paralelo una vez cerrada la 1, aunque 3 muestra "sin vincular" con gracia para Companies que la Unidad 2 todavía no procesó. La Unidad 4 depende de 1 y 2, y tiene además una dependencia cruzada con otra spec (ver más abajo).

### Unidad 1 — Conexión con Stripe (fundamento) — ✅ completo (2026-08-26, en `staging`)

- [x] **Schema:** `model StripeConnection` (ver 1.1) — 1:1 con `Tenant` (`tenantId @unique`), `connectedByUserId` con FK real a `User` (mismo patrón que `createdByUserId`/`invitedByUserId` ya usados en el resto del schema). Push aditivo contra `STAGING_DATABASE_URL` únicamente, sin tocar producción.
- [x] **Infra — cifrado:** `src/lib/stripeEncryption.ts`, `encryptStripeSecret`/`decryptStripeSecret` (AES-256-GCM) — calca `encryption.ts`/`googleTokenEncryption.ts`, key propia `STRIPE_TOKEN_ENCRYPTION_KEY` (generada y cargada en `.env` local; falta cargarla en Vercel — Preview y Production — antes de cualquier deploy real, mismo pendiente que ya existía para `PAYMENT_DATA_ENCRYPTION_KEY`/`GOOGLE_TOKEN_ENCRYPTION_KEY`). Una sola función cubre tanto `apiKeyEncrypted` como `webhookSigningSecretEncrypted`.
- [x] **Corrección real 2026-08-26, encontrada antes de escribir código**: la spec original asumía el SDK oficial `stripe` (`stripe.accounts.retrieve()`, `stripe.webhooks.constructEvent()`, etc.). `src/lib/paddle.ts`/`src/lib/mercadopago.ts` documentan explícitamente que el proyecto evita SDKs de proveedores de pago a favor de un wrapper propio (`fetch` + `crypto` nativos) — mismo criterio aplicado acá: **no se instaló el paquete `stripe`**, `src/lib/stripe.ts` (nuevo) es un cliente REST a mano (`stripeRequest`, form-urlencoded — Stripe no acepta JSON, a diferencia de Paddle/Mercado Pago) con `retrieveAccount`/`listCustomers`/`verifyStripeSignature` (esta última sin uso hasta la Unidad 4).
- [x] **Backend — `src/modules/integrations/stripeService.ts`** (no un archivo suelto — mismo módulo que `googleCalendarAuthService.ts`): `detectApiKeyMode`, `connectStripe`, `getStripeConnectionStatus`, `saveStripeWebhookSecret`, `disconnectStripe`, `getApiKeyForTenant` (para las Unidades 2-4), `markNeedsAttention`.
- [x] **Backend — `POST /api/integrations/stripe/connect`** (router nuevo `src/routes/stripeIntegration.ts`, mismo patrón que `googleCalendarIntegration.ts`): valida el prefijo de la key antes de tocar la red (400 inmediato si no matchea `sk_`/`rk_`), llama `retrieveAccount` con fallback a `listCustomers({limit:1})` si la Restricted Key no tiene permiso de leer Account, detecta `apiKeyMode` por prefijo, cifra, upsert de `StripeConnection` por `tenantId`.
- [x] **Backend — `POST /api/integrations/stripe/webhook-secret`** — igual que lo especificado, 400 si todavía no hay conexión.
- [x] **Backend — `DELETE /api/integrations/stripe`** — soft (`disconnectedAt`, no borra la fila — mismo criterio que `Contact.isActive`/`Opportunity.isActive` de Sales v2). **Bug real encontrado y corregido durante la propia verificación**: la primera versión usaba `update()` puro, que tira un error crudo de Prisma ("record to update not found") si se llama sin haber conectado nunca — cambiado a `updateMany()` con `where: { disconnectedAt: null }`, idempotente (desconectar sin conexión, o una ya desconectada, es un no-op, nunca un 500).
- [x] **Backend — `GET /api/integrations/stripe/status`** (no estaba en la spec original, agregado por necesidad real): la UI necesita poder leer el estado actual al montar la página, mismo patrón que `GET /api/integrations/google-calendar/status`.
- [x] **Corrección real 2026-08-26, decidida con Alejandro antes de construir**: la spec original pedía gate `owner`/`admin` "mismo criterio que Payroll" — pero el gate real de Payroll (`canManagePayroll`) es owner-only, no owner/admin. Confirmado con Alejandro: **owner-only** por ahora, pero enrutado a través de un permiso nombrado (`canManagePayments`, `permissionService.ts`, nunca `role === 'owner'` inline en cada endpoint) para que sumar roles custom más adelante (Tier 5) solo signifique cambiar esa función, no cada call site.
- [x] **Frontend — ubicación** — **corrección real 2026-08-26, encontrada antes de construir**: `IntegrationsSettingsPage.tsx` (2026-08-24, hace 2 días) ya consolidó **todas** las integraciones en una sola página ("The one home for every integration... gate an individual card by role if one ends up admin-only, don't split the page") — la spec pedía una sección nueva en el sidebar para la conexión en sí, lo que hubiera contradicho esa decisión reciente. Se construyó como una card nueva ahí (gateada a owner vía `isOwner`, oculta del todo para el resto), calcando la card de Google Calendar. La sección "Payments" en el sidebar sigue siendo correcta para la Unidad 3 (visibilidad de pagos, una pantalla de datos real) — no para el setup de la conexión.
- [x] **Frontend — Paso 1 (API key):** copy sobre Restricted Key vs Secret key + link a `https://docs.stripe.com/keys`, checklist de permisos de lectura (Customers, Charges, Refunds, Invoices, Subscriptions, PaymentMethods), campo enmascarado (`type="password"`) para la key, botón "Test connection".
- [x] **Frontend — Paso 2 (Webhook):** URL del webhook (`{API_BASE_URL}/api/webhooks/stripe/:tenantId` — ver corrección de ruta en la Unidad 4 de abajo), botón de copiar, checklist de los 5 eventos, campo para el signing secret. Incluye el aviso del bypass de Vercel, mostrado solo cuando `window.location.hostname` contiene `staging` (no aplica a producción, que no tiene Deployment Protection).
- [x] **Frontend — estado conectado:** chip `test`/`live` (`role-chip`/`chip-neutral` para test, `chip-good` para live — reusa las clases ya existentes de chips categóricos, no un componente nuevo), fecha de conexión, botón desconectar, banner (`field-error`) si `needsAttention`.
- [x] **Verificación real 2026-08-26** contra `staging` (dev server local apuntado a `STAGING_DATABASE_URL`, tenant + owner + member descartables creados/borrados vía Prisma directo): status sin conectar, 403 para `member` en los 3 endpoints mutables, 400 inmediato con una key mal formada (sin tocar la red), 400 "Connect Stripe first" al guardar webhook secret sin conexión, disconnect sin conexión previa devuelve 204 limpio (confirma el fix del bug de arriba), y **una llamada real a `api.stripe.com`** con una key con prefijo válido pero inventada — confirma que el cliente a mano arma bien la request (headers, form-encoding) y parsea la respuesta de error real de Stripe, más allá de lo que ya cubren los mocks de los tests unitarios. No se probó una conexión exitosa de punta a punta (hace falta una cuenta de test de Stripe real, no disponible en este entorno) — queda para que Alejandro la pruebe él mismo con su propia cuenta antes de dar la Unidad 1 por cerrada del todo. `npm run build`/`npm test` (116/116, 22 nuevos)/`npm run lint` backend y `npm run build`/`npm run lint` frontend en verde.

### Unidad 2 — Lookup / matching Company ↔ Stripe Customer

- [ ] **Schema:** `Company.stripeCustomerId` (String?) y `Company.stripeCustomerMatchedVia` (String?) — migración aditiva simple.
- [ ] **Backend — `POST /api/payments/companies/:companyId/stripeLookup`:** valida que el tenant tenga `StripeConnection` activo (si no, error claro pidiendo completar la Unidad 1 primero). Trae todos los `Contact` de esa Company. Por cada uno, `stripe.customers.list({ email: contact.email, limit: 3 })`. Consolida resultados únicos por `customer.id`, devuelve la lista con el email de Contact que originó cada match (para que el frontend pueda mostrarlo).
- [ ] **Backend — `PATCH /api/companies/:companyId` (o endpoint dedicado `POST .../stripeLink`):** recibe el `stripeCustomerId` elegido (y el email de origen), guarda ambos campos. Si la Company ya tenía un `stripeCustomerId` distinto, pedir confirmación explícita antes de sobreescribir (no pisar un vínculo existente sin avisar).
- [ ] **Frontend — dentro del detalle de Company:** botón "Buscar en Stripe". Estados: sin resultados (mensaje + sugerencia de crear el customer manualmente en Stripe si corresponde), 1 resultado (card de confirmación con nombre/email del customer y el Contact que lo originó), 2+ resultados (lista seleccionable, cada opción mostrando el Contact/email de origen).
- [ ] **Frontend:** una vez vinculada, mostrar el estado "Conectado a Stripe" en el detalle de Company con link directo al customer en el dashboard de Stripe (`https://dashboard.stripe.com/{test/}customers/{id}`, según `apiKeyMode`).
- [ ] **Build → test → verificación real (contra customers reales de una cuenta de test) → commit → push a `staging`.**

### Unidad 3 — Visibilidad de pagos (resúmenes en vivo)

- [ ] **Backend — `GET /api/payments/companies/:companyId/summary`:** si la Company no tiene `stripeCustomerId`, devolver estado "sin vincular" (no error). Si lo tiene, llamar en paralelo `stripe.refunds.list({ customer })`, el listado de charges/payment intents fallidos, y `stripe.subscriptions.list({ customer })`; armar el resumen (conteo + monto de refunds, conteo de failed, estado de subscripción si existe).
- [ ] **Backend — `GET /api/payments/companies/:companyId/events`:** listado paginado (usar la paginación cursor-based nativa de Stripe — pasar el `starting_after` que devuelve Stripe, no reimplementar offset/limit).
- [ ] **Backend — `GET /api/payments/overview`:** trae todas las Companies del tenant con `stripeCustomerId` no nulo, dispara el `summary` de cada una en paralelo con límite de concurrencia (ej. librería tipo `p-limit`, tope 10 simultáneas), agrega los totales. Devolver también, por Company, el resumen individual para poblar la tabla sin una segunda ronda de requests desde el frontend.
- [ ] **Frontend — home de la sección Payments:** tarjetas de agregados (refunds: conteo + monto, failed: conteo, companies con subscripción activa) + tabla de Companies con su resumen individual y link al detalle. Loading state claro mientras resuelve el fan-out.
- [ ] **Frontend — panel dentro del detalle de Company:** mismo resumen a nivel individual + tabla de eventos (`events`) con paginación, mostrando fecha, tipo, monto, y link al objeto en el dashboard de Stripe.
- [ ] Gate de todo lo anterior a `owner`/`admin`.
- [ ] **Build → test → verificación real (medir tiempo de respuesta de `overview` con un tenant de prueba con varias decenas de Companies vinculadas, confirmar que el límite de concurrencia no dispara rate limits de Stripe) → commit → push a `staging`.**

### Unidad 4 — Webhook de notificaciones proactivas

**Corregido 2026-08-26 (verificado contra el código real, ya no es una decisión abierta):** el modelo `Notification` ya no está "planeado" — ya existe y está completo en `staging` (Sales v2 Unidad 7/8, `prisma/schema.prisma`, `src/routes/notifications.ts`, bell icon en `TopBar.tsx`). Esta unidad no construye nada de eso de nuevo, solo lo reusa: sumar valores nuevos a `enum NotificationType` (hoy tiene `opportunity_stage_changed`/`opportunity_stalled`) — propuesta de nombres, a confirmar al implementar: `stripe_charge_refunded`, `stripe_charge_failed`, `stripe_payment_failed`, `stripe_subscription_past_due`, `stripe_subscription_canceled`.

- [ ] **Schema:** sumar los 5 valores nuevos a `enum NotificationType` — aditivo, sin tocar `model Notification` en sí.
- [ ] **Backend — `POST /api/webhooks/stripe/:tenantId`** (en `src/routes/webhooks.ts`, junto a Paddle/Mercado Pago — ver corrección de la sección 3 más arriba, no va en `/api/integrations/stripe/*`): endpoint público (sin auth de sesión — la autenticación es la firma del webhook), busca el `StripeConnection` del `tenantId` de la URL, verifica la firma con `stripe.webhooks.constructEvent(body, signature, connection.webhookSigningSecret)`. Si no hay `StripeConnection` para ese `tenantId`, o la firma no valida, 400 y no procesar (mismo orden: buscar la conexión primero, para tener el `webhookSigningSecret` con el que verificar).
- [ ] **Backend:** por tipo de evento (`charge.refunded`, `charge.failed`, `payment_intent.payment_failed`, `customer.subscription.updated` con `status: past_due`, `customer.subscription.deleted`), extraer el `customer` del payload, buscar `Company` por `stripeCustomerId` dentro de ese `tenantId`. Si no hay match, descartar el evento sin guardar nada (0.7).
- [ ] **Backend:** si hay match, crear `Notification` con el tipo correspondiente, destinatario = `Company.accountOwnerId` (fallback: algún `owner`/`admin` del tenant si no tiene account owner asignado — definir el criterio exacto de fallback, ej. el primer owner activo).
- [ ] **Frontend:** completar el paso 2 del setup de la Unidad 1 (ya tiene la UI, falta que el checklist de eventos a tildar en Stripe liste exactamente los cinco de esta unidad).
- [ ] **Build → test → verificación real (disparar un refund/failed real desde el dashboard de test de Stripe, confirmar que llega la notificación al bell icon existente) → commit → push a `staging`.**
