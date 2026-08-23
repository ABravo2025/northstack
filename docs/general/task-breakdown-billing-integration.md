# Task breakdown — Billing Integration (Paddle + Mercado Pago)

Ordenado para que cada unidad sea construible y verificable por separado, mismo criterio
pieza-por-pieza ya usado en Payroll/Clients/Signup. Spec de referencia:
`spec-billing-integration.md`. Mockups: `billing-payment-mockup.html`,
`settings-billing-flow-mockup.html`.

## Backend — Schema y helpers compartidos

1. **Schema**: agregar `Subscription`, `Invoice`, `PlanPrice`, `ProcessedWebhookEvent` y los enums
   `SubscriptionStatus`/`PaymentProvider` (todo aditivo, tal cual `spec-billing-integration.md`).
2. **Backfill**: script que crea un `Subscription` para cada `Tenant` existente, copiando
   `plan`/`status`/`trialEndsAt`/`gracePeriodEndsAt`/`lockedPriceCents` tal cual están hoy. A
   partir de este paso, todo tenant nuevo o viejo tiene su `Subscription` — sin esto el resto de
   los pasos no tiene de dónde leer.
3. **`syncSubscriptionAndTenant()`** (`subscriptionService.ts`): único punto de escritura de
   `Subscription.status` + su espejo en `Tenant.status`/`plan`/`trialEndsAt`/`gracePeriodEndsAt`/
   `lockedPriceCents`, en una sola transacción. Cron y los dos webhook handlers (pasos 8 y 11) lo
   llaman — ningún otro código escribe `Tenant.status` directamente de acá en adelante.
4. **`resolveProvider(tenant)`**: `Argentina` → `mercadopago`, cualquier otro país (incluido
   `null`, tenants legacy) → `paddle`.
5. **Seed `PlanPrice`**: 4 filas — `starter`/`growth` × `international` (USD, valores ya
   confirmados: $29/$39, $79/$99) y `starter`/`growth` × `ar` (ARS, **valores placeholder** —
   bloquea probar el flujo de Mercado Pago end-to-end hasta que Alejandro los defina, no bloquea
   construir el resto).

## Backend — Mercado Pago

6. **`src/lib/mercadopago.ts`**: wrapper con `createPreapproval` (sin plan asociado — el monto
   sale de `PlanPrice`, nunca de un "Plan" del lado de MP), `getPreapproval(id)` (para el
   round-trip de seguridad del webhook), `updatePreapproval(id, { transaction_amount | status })`.
7. **`POST /api/subscriptions/me/checkout`**: llama `resolveProvider`; si `mercadopago`, crea el
   `Preapproval` con `external_reference: subscriptionId`, `transaction_amount` desde `PlanPrice`,
   `currency_id: "ARS"` — devuelve `init_point` para que el frontend redirija.
8. **`POST /api/webhooks/mercadopago`**: verifica `x-signature`, hace `GET` de vuelta a la API de
   MP con el id del payload (nunca confía en el body directo), valida contra
   `ProcessedWebhookEvent` (insert-then-process), aplica la tabla de transiciones de la spec vía
   `syncSubscriptionAndTenant()`. Sobre pago inicial confirmado: completa
   `paymentMethodBrand`/`paymentMethodLast4` si el payload los trae.
9. **Cron — extensión para cancelación en Mercado Pago**: el mismo job que ya corre
   `trialing→past_due→suspended` ahora también revisa `cancellationEffectiveAt` vencido con
   `provider: mercadopago` y llama `updatePreapproval(id, { status: 'cancelled' })` (Paddle no
   necesita este paso — ver punto 10).

## Backend — Paddle

10. **`src/lib/paddle.ts`**: wrapper con inicio de checkout (Overlay, `customData: {
    subscriptionId }`, precio dinámico — no un Price ID de catálogo fijo), verificación de
    `Paddle-Signature`, `updateSubscription` (para cambio de plan `effective_from:
    next_billing_period` / cancelación programada nativa).
11. **`POST /api/webhooks/paddle`**: verifica firma, resuelve el `Subscription` vía
    `customData.subscriptionId`, `ProcessedWebhookEvent`, aplica transiciones igual que el punto
    8. Sobre pago confirmado: completa `paymentMethodBrand`/`paymentMethodLast4`.
12. **`POST /api/subscriptions/me/checkout`** (mismo endpoint del punto 7): rama Paddle — arma lo
    que el frontend necesita para abrir el Overlay (no hay redirect a otro dominio).

## Backend — Self-serve

13. **`POST /api/subscriptions/me/change-plan`**: solo owner (mismo chequeo de permiso que
    `PATCH /api/tenants/me/plan` de la ronda anterior). Llama al proveedor correspondiente
    (`updateSubscription`/`updatePreapproval`) — **no** toca `Subscription.plan` local hasta que
    la respuesta/webhook lo confirme. Sin prorrateo en ningún caso.
14. **`POST /api/subscriptions/me/cancel`**: solo owner. Setea `cancelledAt`/
    `cancellationEffectiveAt = currentPeriodEnd`. Paddle: llama cancelación programada nativa en
    el momento. Mercado Pago: solo actualiza campos locales — el llamado real a MP lo hace el cron
    del punto 9 cuando se cruza la fecha.
15. **`POST /api/subscriptions/me/resume`**: solo owner. Válido solo si hay una cancelación
    pendiente sin efectivizar (`cancelledAt` seteado y `cancellationEffectiveAt` no vencido).
    Limpia ambos campos — no requiere llamar a ningún proveedor (ver spec).

## Frontend

16. **Settings grid**: mover la tile "Billing" de "Coming soon" a "My account", al lado de
    "Profile" — según `settings-billing-flow-mockup.html`. Sale del estado dimmed/disabled.
17. **`BillingPage.tsx`** (`/settings/billing`): resumen de plan colapsado (nombre + precio +
    fecha según el mapeo de la spec) con "Change plan" desplegando el selector Starter/Growth;
    card de método de pago (vacío en trial, badge de proveedor + últimos 4 dígitos si existe);
    tabla de historial de facturas (`Invoice`, empty state en trial); zona de cancelar/reanudar
    según el estado (`cancel_scheduled` muestra "Resume subscription" en vez de "Cancel").
18. **Banner en `AppLayout.tsx`**: extender el banner de `past_due` ya existente para cubrir
    también `suspended`, con el CTA que abre el modal del punto 19.
19. **Modal "Add payment method"** (`billing-payment-mockup.html`): dispara
    `POST /api/subscriptions/me/checkout`, redirige a `init_point` (Mercado Pago) o abre el
    Overlay de Paddle, según lo que devuelva el endpoint.

## Tests

20. Idempotencia: el mismo `event.id` entregado dos veces no duplica `Invoice` ni reprocesa la
    transición (cubre ambos proveedores).
21. Verificación de firma: payload sin firma válida o con firma alterada se rechaza sin tocar la
    base, en ambos webhooks.
22. Race cron vs. webhook: test que dispara ambos casi en simultáneo y confirma que gana el
    webhook (lectura fresca antes de escribir en el cron).
23. Self-serve: `change-plan`/`cancel`/`resume` rechazan si quien llama no es el owner;
    `change-plan` no muta `Subscription.plan` hasta la confirmación del proveedor.

## Explícitamente fuera de este breakdown

- Facturación fiscal Argentina (factura electrónica AFIP).
- Emails de dunning (aviso antes de vencer gracia, aviso de pago fallido).
- Dashboards de MRR/churn — el modelo ya lo soporta, las queries no se construyen acá.
- Valores reales de `PlanPrice` para `ar` — quedan placeholder hasta que Alejandro los defina.
- Activar credenciales de producción de Paddle/Mercado Pago — trámite administrativo, no código.
