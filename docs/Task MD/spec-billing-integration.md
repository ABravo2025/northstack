# Spec: Billing Integration — Paddle + Mercado Pago

Mockups de referencia (aprobados): `billing-payment-mockup.html` (modal de "agregar método de
pago", disparado desde el banner de `past_due`/`suspended`) y `settings-billing-flow-mockup.html`
(grid de Settings con la tile de Billing + panel de autogestión completo).

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
- Método de pago se pide recién al vencer trial/gracia — no upfront al elegir plan.
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
  id                       String              @id @default(cuid())
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
}

model Invoice {
  id                 String           @id @default(cuid())
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
}

model PlanPrice {
  id                 String    @id @default(cuid())
  plan               PlanTier
  market             String     // "international" | "ar"
  currency           String     // "USD" | "ARS"
  launchPriceCents   Int
  regularPriceCents  Int
  effectiveFrom      DateTime   @default(now())
  createdAt          DateTime   @default(now())
}

// Idempotencia de webhooks — ver sección Seguridad
model ProcessedWebhookEvent {
  id               String          @id @default(cuid())
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

## Máquina de estados (actualizada con cancelación)

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

## Endpoints self-serve

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
  Limpia `cancelledAt`/`cancellationEffectiveAt` a `null`. No hace falta llamar a ningún proveedor
  — como la cancelación real recién se efectiviza en `cancellationEffectiveAt` (ver arriba), hasta
  ese momento el `Subscription`/`preapproval` sigue activo del lado del proveedor sin cambios.

## Mapeo de fechas mostradas en UI

El mockup de `/settings/billing` (`settings-billing-flow-mockup.html`) muestra una fecha distinta
según el estado — todas salen de campos que ya existen en el modelo, ninguna es nueva:

| Estado | Label en UI | Campo |
|---|---|---|
| `trialing` | "Trial ends" | `trialEndsAt` |
| `active` | "Renews" | `currentPeriodEnd` |
| `past_due` | "Payment overdue since" | `currentPeriodEnd` (la fecha en que debía renovar y falló) |
| `suspended` | "Suspended since" | `gracePeriodEndsAt` |
| `cancel_scheduled` | "Ends" | `cancellationEffectiveAt` |

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
webhook — no confiar solo en `externalSubscriptionId`.

## Paddle — Checkout (Overlay)

Análogo del lado Paddle: Paddle.js abre el checkout como overlay embebido (no redirect a otro
dominio). Al iniciar, pasar `customData: { subscriptionId }` — mismo rol que `external_reference`
en MP, para el join inverso en el webhook. El precio se pasa dinámico en la llamada (no un Price
ID fijo de catálogo Paddle), porque `lockedPriceCents` varía por tenant según cuándo se registró.

## Contrato de webhooks

| Evento | Paddle | Mercado Pago | Transición |
|---|---|---|---|
| Pago inicial confirmado | `transaction.completed` | `preapproval` status `authorized` | `past_due`/`suspended` → `active` |
| Pago recurrente confirmado | `transaction.completed` | `authorized_payment` status `approved` | `active` (renueva `currentPeriodEnd`), crea `Invoice` |
| Pago recurrente falla | `transaction.payment_failed` | `authorized_payment` status `rejected` | `active` → `past_due`, arranca gracia de 14 días |
| Cancelación confirmada | `subscription.canceled` | `preapproval` status `cancelled` | → `cancelled` |
| Suscripción pausada | — | `preapproval` status `paused` | → `past_due` |

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

## Fuera de alcance en esta ronda (diferido a propósito)

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
