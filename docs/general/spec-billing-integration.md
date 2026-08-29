# Spec: Billing Integration — Paddle + Mercado Pago

Mockups de referencia (aprobados): `billing-payment-mockup.html` (modal de "agregar método de
pago", disparado desde el banner de `past_due`/`suspended`) y `settings-billing-flow-mockup.html`
(grid de Settings con la tile de Billing + panel de autogestión completo). **Ninguno de los dos
archivos existe realmente en el repo** — mismo gap ya visto con `subscription-plans-mockup.html`
durante Signup+Plans. `AddPaymentMethodModal.tsx`/`BillingPage.tsx` se construyeron a partir de la
prosa de esta spec + las convenciones ya existentes de `Modal.tsx`, por indicación explícita de
Alejandro (2026-08-19), en vez de bloquear en un mockup que no está.

## Objetivo

Reemplazar el hueco que `spec-subscription-plans.md` dejó a propósito ("hoy no hay ninguna forma
real de que un tenant cargue un método de pago y salga de `past_due`/`suspended`") con cobro real
vía dos proveedores, según país del tenant:

- **Paddle** — todos los tenants excepto Argentina. Merchant of record, cobra en USD.
- **Mercado Pago** — únicamente tenants de Argentina. Cobra en ARS, precio propio (no indexado a
  USD). No se ofrece como alternativa fuera de Argentina, ni Paddle se ofrece dentro.

## Decisiones de esta ronda (resumen)

- Se introduce `Subscription` / `Invoice` / `PlanPrice` (aditivo). **`Tenant.status` no se toca**
  — sigue siendo el campo que leen los guards y el banner ya shippeados; pasa a ser un espejo
  sincronizado por un único escritor (cron + webhook handlers).
- ~~Método de pago se pide recién al vencer trial/gracia — no upfront al elegir plan.~~
  **Corregido 2026-08-20 (Alejandro), ya en producción:** al elegir un plan pago (Starter/Growth)
  desde `PlansModal` — tanto el modal de bienvenida en `AppLayout.tsx` como "Change plan" en
  `BillingPage.tsx` — se pasa directo a checkout real (`AddPaymentMethodModal`, modo `subscribe`).
  La tarjeta se carga al elegir el plan, no al vencer el trial; lo que sigue siendo gratis son los
  primeros `SIGNUP_TRIAL_DAYS` (15 días), vía el mecanismo de trial nativo de cada proveedor
  (Paddle `trial_period`, Mercado Pago `free_trial`) — nunca se cobra al momento del checkout. El
  banner de `past_due`/`suspended` en `AppLayout.tsx` sigue existiendo tal cual esta spec lo
  definía originalmente, como red de contención para el tenant que llega al fin del trial sin
  haber cargado tarjeta nunca (ver "Máquina de estados" más abajo).
  `checkoutService.ts` cappea `trialDays` a lo que quede realmente de `tenant.trialEndsAt`
  (nunca un `SIGNUP_TRIAL_DAYS` fresco en cada intento — Alejandro, 2026-08-21, para que abandonar
  y reintentar checkout no extienda el trial indefinidamente); fuera de producción real
  (`PADDLE_ENV !== 'production'`) el trial se salta y cobra de inmediato, para poder probar el
  flujo completo contra sandbox sin esperar 15 días reales.
- Cambio de plan y cancelación self-serve entran en esta ronda, sin prorrateo: cambio de plan
  efectivo el próximo ciclo, cancelación efectiva al fin del período ya pagado.
- Mercado Pago: producto **"Suscripciones con integración"**, flujo **sin plan asociado**
  (`Preapproval` directo — el precio sale de `PlanPrice`, no se duplica en un "Plan" del lado MP).

## Modelo de datos

```prisma
enum SubscriptionStatus {
  trialing
  active
  past_due
  suspended
  cancelled
}

enum PaymentProvider {
  paddle
  mercadopago
}

model Subscription {
  id                       String              @id @default(uuid())
  tenantId                 String              @unique   // 1:1 — un tenant, una suscripción viva
  tenant                   Tenant              @relation(fields: [tenantId], references: [id])
  plan                     PlanTier                        // reusa el enum starter|growth|scale existente
  status                   SubscriptionStatus  @default(trialing)
  provider                 PaymentProvider?               // null mientras no se cargó método de pago
  externalSubscriptionId   String?                        // id de Paddle o preapproval_id de MP
  lockedPriceCents         Int
  currency                 String                          // "USD" (Paddle) | "ARS" (Mercado Pago)
  trialEndsAt               DateTime?
  gracePeriodEndsAt         DateTime?
  currentPeriodStart        DateTime?
  currentPeriodEnd          DateTime?
  cancelledAt                DateTime?                     // cuándo se pidió la cancelación
  cancellationEffectiveAt    DateTime?                     // = currentPeriodEnd al momento del pedido
  cancellationReason          String?
  paymentMethodBrand         String?                       // "visa" | "mastercard" | etc — solo display, no sensible
  paymentMethodLast4         String?                       // últimos 4 dígitos — solo display, no sensible
  createdAt                 DateTime            @default(now())
  updatedAt                 DateTime            @updatedAt
  invoices                  Invoice[]

  @@index([provider, status])
}

model Invoice {
  id                 String           @id @default(uuid())
  subscriptionId     String
  subscription       Subscription     @relation(fields: [subscriptionId], references: [id])
  provider           PaymentProvider
  externalInvoiceId  String?
  amountCents        Int
  currency           String
  status             String            // paid | failed | refunded
  periodStart        DateTime
  periodEnd          DateTime
  paidAt             DateTime?
  createdAt          DateTime          @default(now())

  @@index([subscriptionId])
}

model PlanPrice {
  id                 String    @id @default(uuid())
  plan               PlanTier
  market             String     // "international" | "ar"
  currency           String     // "USD" | "ARS"
  launchPriceCents   Int
  regularPriceCents  Int
  effectiveFrom      DateTime   @default(now())
  createdAt          DateTime   @default(now())

  @@index([plan, market])
}

// Idempotencia de webhooks — ver sección Seguridad
model ProcessedWebhookEvent {
  id               String          @id @default(uuid())
  provider         PaymentProvider
  externalEventId  String
  processedAt      DateTime        @default(now())

  @@unique([provider, externalEventId])
}
```

Todo aditivo — mismo protocolo de siempre (aditivo → backfill → verify → destructivo) si en algún
momento se quiere apretar algún campo a `NOT NULL`.

`paymentMethodBrand`/`paymentMethodLast4` se completan con lo que devuelve el webhook de pago
confirmado de cada proveedor (ambos lo incluyen en el payload de la transacción/pago) — nunca se
piden ni se reciben directo del formulario, siguen la misma regla de "nunca tocamos datos de
tarjeta" que el resto de la spec.

`Subscription.plan`/`lockedPriceCents` **no son nullable** (a diferencia de los campos equivalentes
en `Tenant`, que sí lo son): un tenant que todavía no eligió plan (`Tenant.plan` null) recibe una
`Subscription` placeholder en `starter`/USD — la crea `registerTenantWithOwner` al dar de alta el
tenant, y si por lo que sea no existe (tenant pre-Billing Integration sin backfill corrido),
`getBillingSummary` se auto-repara creándola on-demand con el mismo shape. `updateTenantPlan`
(`planService.ts`) pisa ese placeholder con la elección real vía `upsert` (no `update` — bug #5 de
la ronda de code review, ver "Riesgos técnicos conocidos" al final) apenas el tenant elige.

**Invoice PDF real (agregado 2026-08-19, no estaba en el draft original):** `GET
/api/subscriptions/me/invoices/:invoiceId/document` devuelve una URL temporal (~1h) al PDF que
genera Paddle (`GET /transactions/{id}/invoice`) — Paddle-only, Mercado Pago no tiene equivalente
(consistente con "Facturación fiscal Argentina" fuera de alcance). Se pide fresco en cada click, no
se cachea en `Invoice`.

### Relación con `Tenant.status` — no se migra, se sincroniza

`Tenant.status`/`plan`/`trialEndsAt`/`gracePeriodEndsAt`/`lockedPriceCents` quedan **deprecated**
pero no se borran esta ronda: se siguen escribiendo por compatibilidad con el código que ya los
lee (route guards, banner de `AppLayout.tsx`). Un único punto de escritura (cron diario +
webhook handlers) actualiza `Subscription` y, en la misma transacción, su espejo en `Tenant`.
Ningún otro código escribe `Tenant.status` a partir de ahora. Sacar los campos de `Tenant` queda
para una ronda destructiva futura, cuando el resto del código ya lea de `Subscription` en vez de
`Tenant`.

## Catálogo de precios — `PlanPrice`

| Plan | Market | Moneda | Lanzamiento | Regular |
|---|---|---|---|---|
| Starter | international | USD | $29/mes | $39/mes |
| Growth | international | USD | $79/mes | $99/mes |
| Starter | ar | ARS | *(pendiente — definir monto)* | *(pendiente)* |
| Growth | ar | ARS | *(pendiente)* | *(pendiente)* |

Las filas `ar` quedan con placeholder — no bloquean construir la estructura, sí bloquean probar
el flujo completo en Argentina de punta a punta. Ajustar el precio ARS más adelante (inflación)
significa **insertar una fila nueva** con `effectiveFrom` actualizado, nunca editar la existente
— mismo criterio que ya se usa con `lockedPriceCents` congelado por tenant: lo que ya pagan
tenants existentes no se toca retroactivamente.

## Selección de proveedor

```
function resolveProvider(tenant):
  if tenant.country === 'Argentina': return 'mercadopago'
  return 'paddle'
```

`Tenant.country` es requerido a nivel de validación para altas nuevas desde `spec-tenant-signup.md`,
así que para cualquier tenant creado de acá en adelante el ruteo es confiable. Asunción para
tenants legacy con `country` en null (anteriores a esa spec): caen en `paddle` por default —
avisame si preferís forzar una resolución manual en vez de asumir Paddle para esos casos.

## Máquina de estados (actualizada con cancelación y trial-con-tarjeta)

```
trialing ──(cron: vence trialEndsAt sin provider)──► past_due
   │                                                      │
   │ (webhook: pago inicial confirmado)                   │ (webhook: pago confirmado)
   ▼                                                       ▼
active ◄─────────────────────────────────────────────────┘
   │
   ├──(webhook: falla renovación)──► past_due ──(cron: vence gracePeriodEndsAt)──► suspended
   │                                     ▲                                             │
   │                                     └─────────(webhook: pago confirmado)──────────┘
   │
   └──(self-serve cancelar; cron aplica en cancellationEffectiveAt)──► cancelled
```

**Nota 2026-08-20 — trial con tarjeta ya cargada (ver "Decisiones de esta ronda"):** el cron
(`planTransitionService.ts`) salta cualquier tenant cuya `Subscription.provider` ya esté seteado
(`NOT EXISTS ... provider IS NOT NULL`) — una vez que el tenant cargó tarjeta, es el proveedor
quien maneja la transición real (webhook de pago confirmado/fallido), no el reloj interno de
`trialEndsAt`. Los dos proveedores manejan el "trial ya con tarjeta" de forma **distinta y hoy
inconsistente** — ver "Riesgos técnicos conocidos" al final: Paddle deja `status` en `trialing`
hasta el cobro real (evento `subscription.created`, no toca status); Mercado Pago pasa a `active`
apenas el preapproval queda `authorized` (o sea, al cargar la tarjeta, no al primer cobro real 15
días después).

## Endpoints self-serve

- `GET /api/subscriptions/me` — read-only, cualquier miembro autenticado del tenant (mismo nivel
  que `GET /api/tenants/current`), no solo el owner. Devuelve el resumen (`Subscription` +
  `Invoice[]`) que consume `BillingPage.tsx`. Sin fila creada todavía → auto-repara con el
  placeholder `starter`/USD (ver "Relación con `Tenant.status`" arriba).

- `GET /api/subscriptions/me/invoices/:invoiceId/document?disposition=inline|attachment` —
  read-only, mismo nivel que el anterior. PDF real de Paddle, agregado 2026-08-19 (no estaba en el
  draft original de esta spec) — ver nota en el modelo de datos.

- `POST /api/subscriptions/me/checkout` (solo owner, `canManageBilling`) — dos intenciones
  distintas bajo el mismo endpoint, corrección de Alejandro 2026-08-19 (nunca deben confundirse: la
  segunda sobre el mismo `subscription.provider` crearía una suscripción competidora del lado del
  proveedor, cobro doble):
  - **`subscription.provider` null → "Subscribe".** Resuelve el proveedor (`resolveProvider`),
    busca `PlanPrice` para el plan+market, crea la transacción/preapproval con trial cappeado (ver
    "Decisiones de esta ronda") y devuelve `initPoint` (Mercado Pago, redirect) o
    `paddleTransactionId` (Paddle, `Checkout.open({ transactionId })` en `PaddleCheckoutPage.tsx`,
    pestaña nueva). No escribe nada en `Subscription` — eso lo hace recién el webhook al confirmar.
  - **`subscription.provider` seteado → "Update payment method".** Paddle: `GET
    /subscriptions/{id}/update-payment-method-transaction`, mecanismo dedicado que reemplaza la
    tarjeta de la MISMA suscripción. Mercado Pago no tiene un mecanismo hosted equivalente —
    cancela el preapproval viejo (`PUT status: cancelled`) y cae al mismo flujo de creación que
    "Subscribe" (ver "Riesgos técnicos conocidos": si el tenant abandona el checkout nuevo, queda
    sin preapproval activo).

- `POST /api/subscriptions/me/change-plan` `{ plan: 'starter' | 'growth' }`
  Llama al proveedor correspondiente para actualizar el monto/ítem de la suscripción activa. **No
  actualiza `Subscription.plan` localmente hasta confirmar la respuesta del proveedor** — el UI
  muestra "cambio programado para tu próximo ciclo (fecha)", no un cambio inmediato. Sin
  prorrateo: Paddle vía `effective_from: next_billing_period` / `do_not_bill`; Mercado Pago no
  tiene concepto de prorrateo en su API, así que el nuevo monto aplica directo en el próximo cobro.

- `POST /api/subscriptions/me/cancel` `{ reason?: string }`
  Setea `cancelledAt = now`, `cancellationEffectiveAt = currentPeriodEnd`. Diferencia real entre
  proveedores a manejar:
  - **Paddle** soporta cancelación programada nativamente (`effective_from: next_billing_period`)
    — un solo llamado alcanza.
  - **Mercado Pago no tiene ese concepto** en su API — el preapproval sigue `authorized` hasta que
    el mismo cron diario que ya corre detecta que se cruzó `cancellationEffectiveAt` y recién ahí
    llama `PUT /preapproval/{id}` con `status: cancelled`.
  En ambos casos, `Tenant.status → cancelled` (valor ya existente en el enum) recién cuando se
  cruza `cancellationEffectiveAt`, no al momento del pedido.

- `POST /api/subscriptions/me/resume`
  Solo válido si `cancelledAt` está seteado y `cancellationEffectiveAt` todavía no se cruzó.
  Limpia `cancelledAt`/`cancellationEffectiveAt` a `null`.
  **Corregido — no es cierto para ambos proveedores por igual:** Mercado Pago no necesita llamar
  al proveedor (nunca hizo un llamado real al cancelar, solo local); **Paddle sí** — como
  `cancel` llama `POST /subscriptions/{id}/cancel` de verdad al momento del pedido, `resume` tiene
  que deshacer eso con `PATCH /subscriptions/{id} { scheduled_change: null }`
  (`removeScheduledChange` en `paddle.ts`), o Paddle cancela la suscripción en la fecha programada
  igual, sin importar lo que diga nuestra base.

## Mapeo de fechas mostradas en UI

El mockup de `/settings/billing` (`settings-billing-flow-mockup.html`) muestra una fecha distinta
según el estado — todas salen de campos que ya existen en el modelo, ninguna es nueva:

| Estado | Label en UI | Campo |
|---|---|---|
| `trialing` | "Trial ends" | `trialEndsAt` |
| `active` | "Active" *(no "Renews")* | rango `currentPeriodStart` – `currentPeriodEnd` (a pedido de Alejandro, 2026-08-19: se ve desde cuándo corre el período actual, no solo cuándo renueva) |
| `past_due` | "Payment overdue since" | `currentPeriodEnd` (la fecha en que debía renovar y falló) |
| `suspended` | "Suspended since" | `gracePeriodEndsAt` |
| `cancel_scheduled` | "Ends" | `cancellationEffectiveAt` |

Implementado en `BillingPage.tsx`'s `planDateInfo()`.

## Mercado Pago — Suscripciones, sin plan asociado

```json
POST /preapproval
{
  "reason": "Northstack — {plan} (AR)",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 0,        // sale de PlanPrice (market=ar), no hardcodeado
    "currency_id": "ARS"
  },
  "payer_email": "...",
  "back_url": "https://app.joinnorthstack.com/billing/callback",
  "external_reference": "{subscriptionId}",
  "status": "pending"
}
```

La respuesta trae `init_point` — redirect ahí, MP muestra su propio checkout hosteado (no armamos
formulario de tarjeta nosotros). `external_reference` es la clave para el join inverso en el
webhook — no confiar solo en `externalSubscriptionId`. Con trial (ver "Decisiones de esta ronda"),
`auto_recurring` suma `free_trial: { frequency: N, frequency_type: 'days' }`.

Frontend: `AddPaymentMethodModal` abre `init_point` con `window.open(..., '_blank')` — pestaña
nueva, nunca navega la actual (corrección 2026-08-21: antes usaba `window.location.href` y sacaba
al tenant de Northstack por completo).

## Paddle — Checkout (Transaction no-catálogo, no Overlay embebido)

**Corregido — el mecanismo real no es "Overlay con customData al abrir" como decía el draft
original.** Paddle.js's `Checkout.open()` solo acepta `priceId` (de catálogo) o `transactionId`,
nunca un precio inline directo. Lo que realmente pasa:

1. Backend (`createNonCatalogTransaction`, `paddle.ts`) crea un `Transaction` no-catálogo vía
   `POST /transactions` — precio y producto van inline en la request (Paddle crea Price/Product
   efímeros), no un Price ID fijo, porque `lockedPriceCents` varía por tenant. `custom_data: {
   subscriptionId }` — mismo rol que `external_reference` en MP. Con trial: `price.trial_period: {
   interval: 'day', frequency: N }`.
2. Frontend abre `PaddleCheckoutPage.tsx` en **pestaña nueva** (`window.open`, no un modal
   apilado — a pedido de Alejandro, 2026-08-20, "debe sentirse como su propia ventana") con
   `?transactionId=...`; esa página carga Paddle.js y recién ahí llama
   `Checkout.open({ transactionId })` — el Overlay embebido corre en esa pestaña, no en la
   original.
3. `BillingPage.tsx` no depende de que la pestaña original reciba ningún callback — refetchea al
   volver el foco a la ventana (`window.addEventListener('focus', ...)`).

## Contrato de webhooks

| Evento | Paddle | Mercado Pago | Transición |
|---|---|---|---|
| Tarjeta cargada al iniciar trial (sin cobro real todavía) | `subscription.created` | *(no distinguido — ver nota abajo)* | Paddle: solo setea `provider`/`externalSubscriptionId`, **no toca `status`** (sigue `trialing`). MP: **discrepancia conocida**, ver "Riesgos técnicos conocidos". |
| Pago inicial confirmado (trial recién vencido, o suscripción sin trial) | `transaction.completed` (monto > 0) | `preapproval` status `authorized` | → `active`. Para Paddle, si el monto es 0 (transacción de "update payment method") no crea `Invoice` ni toca el período — solo actualiza tarjeta. |
| Pago recurrente confirmado | `transaction.completed` | `authorized_payment` status `approved` | `active` (renueva `currentPeriodEnd`), crea `Invoice` |
| Pago recurrente falla | `transaction.payment_failed` | `authorized_payment` status `rejected` | `active` → `past_due`, arranca gracia de 14 días |
| Cancelación confirmada | `subscription.canceled` | `preapproval` status `cancelled` | → `cancelled` |
| Suscripción pausada | — | `preapproval` status `paused` | → `past_due` |

**Nota Mercado Pago:** a diferencia de Paddle, el webhook `preapproval` status `authorized` pasa
`status` a `active` **de una**, sin distinguir "recién cargó tarjeta, trial corriendo" de "ya
cobramos de verdad" — porque MP no tiene un evento separado para lo primero (ver "Riesgos técnicos
conocidos"). El `type`/`topic` exacto de cada evento (`subscription_preapproval` vs.
`subscription_authorized_payment`, o similar) está **sin verificar contra una entrega real** — el
propio código (`routes/webhooks.ts`) trae un comentario marcándolo "UNVERIFIED... no
MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET configured yet" desde que se construyó; confirmar el estado real
de esas credenciales y, si ya están, confirmar el shape del payload contra una entrega real antes
de confiar en este mapeo para producción con Mercado Pago.

Todos los handlers, mismo orden siempre: verificar firma → chequear `ProcessedWebhookEvent`
(insertar antes de procesar; el `@@unique` corta duplicados incluso bajo concurrencia) → lectura
fresca de `Subscription.status` (no un valor cacheado del arranque del cron) → escribir
`Subscription` + `Tenant` en la misma transacción.

**Nota para implementación:** verificar el shape exacto de cada payload/respuesta contra la
documentación viva de Paddle y Mercado Pago al momento de codear — ambas APIs evolucionan y esta
spec fija el contrato de negocio, no un snapshot literal de cada campo de la API.

## Seguridad — no negociable

- **Nunca tocamos datos de tarjeta.** Checkout hosteado de ambos proveedores (Overlay de Paddle,
  `init_point` de MP) — el dato sensible no pasa por nuestro backend en ningún punto.
- **Verificación de firma obligatoria en todo webhook.** Paddle: header `Paddle-Signature`
  (`ts=...;h1=...`, HMAC-SHA256 sobre `ts:rawBody`). Mercado Pago: header `x-signature`
  (`ts=...,v1=...`, HMAC-SHA256 sobre el template `id:{data.id};request-id:{x-request-id};ts:{ts};`).
  Ningún webhook se procesa sin esto.
- **Mercado Pago en particular**: el webhook solo trae un id — hay que hacer `GET` de vuelta a la
  API de MP para traer el recurso real antes de confiar en cualquier dato del body.
- **Race cron vs. webhook**: el webhook manda siempre. El cron revalida `status` con lectura
  fresca inmediatamente antes de escribir.

## Riesgos técnicos conocidos (diferidos, code review previo a producción — 2026-08-23)

A diferencia de "Fuera de alcance" (abajo, decisiones de producto tomadas antes de construir),
esto es lo que un code review de 16 hallazgos encontró **después** de construir — 7 se arreglaron
antes de salir a producción (ver `project_billing_integration_2026-08.md`), estos quedaron
deliberadamente sin arreglar por baja confianza / necesitan prueba contra sandbox real, no por
decisión de producto. Si aparece un bug de billing/currency/invoice, revisar esta lista primero:

- **Mercado Pago "update payment method" cancela el preapproval viejo antes de confirmar el
  nuevo.** `checkoutService.ts`: `updatePreapproval(..., { status: 'cancelled' })` corre
  inmediatamente, después crea uno nuevo. Si el tenant abandona el checkout nuevo (cierra la
  pestaña, back del navegador), queda **sin preapproval activo** — un downgrade silencioso de
  "pagando" a "sin método de pago", sin que nadie lo haya pedido.
- **La transacción de "update payment method" de Paddle puede no traer
  `custom_data.subscriptionId`.** Es una transacción que Paddle genera del lado suyo (`GET
  /subscriptions/{id}/update-payment-method-transaction`), no una que construimos con
  `custom_data` explícito como el resto. Si no lo trae, el webhook cae en la rama "no
  subscriptionId in custom_data" y hace *no-op* silencioso — la tarjeta se actualiza del lado de
  Paddle pero `paymentMethodBrand`/`Last4` nunca se actualizan acá. Es el único endpoint de
  `paddle.ts` sin comentario "verificado contra sandbox real".
- **Una cancelación de Mercado Pago que falla en el cron aborta el resto del batch del día.**
  `planTransitionService.ts`'s loop sobre `dueMercadoPagoCancellations` no tiene try/catch
  por-item — si `updatePreapproval` tira para un tenant, el resto de las cancelaciones vencidas ese
  día no se procesan hasta el próximo run.
- **Nuevo, encontrado en este refresh de docs (2026-08-29), no estaba en la lista del code
  review original — confirmar con Alejandro si es un bug real o comportamiento aceptado:**
  Mercado Pago y Paddle manejan el "trial con tarjeta ya cargada" de forma inconsistente.
  Paddle (`subscription.created`) deja `Subscription.status` en `trialing` hasta el cobro real.
  Mercado Pago (`preapproval` status `authorized`) pasa `status` a `active` **apenas se carga la
  tarjeta** — que con `free_trial` configurado es el arranque del trial, no el primer cobro real
  (`next_payment_date`, ~15 días después). Efecto visible: un tenant AR a mitad de trial se ve
  "Active" en `BillingPage.tsx` en vez de la cuenta regresiva de trial que ve un tenant Paddle
  equivalente — y como esa primera escritura solo setea `currentPeriodStart` (no
  `currentPeriodEnd`, que recién llega con el cobro real), el rango se ve como
  "Active: [fecha] – —" hasta que el primer cobro real corre.

## Fuera de alcance en esta ronda (diferido a propósito, decisión de producto)

- Emails de dunning (aviso antes de vencer gracia, aviso de pago fallido) — hoy solo hay banner
  in-app, no notificación por mail.
- Facturación fiscal Argentina (factura electrónica AFIP) — Mercado Pago no la resuelve
  automáticamente, queda como ítem a evaluar aparte.
- Reintentos de cobro más allá de los nativos de cada proveedor (ambos reintentan automáticamente
  antes de marcar el pago como fallido) — no se construye lógica de reintento propia.
- Dashboards de MRR/churn — el modelo (`Subscription`/`Invoice`) ya deja la base lista, pero las
  queries/vistas de métricas no se construyen esta ronda.
- Precios ARS reales — la estructura de `PlanPrice` está lista, los valores quedan pendientes de
  que los definas.
