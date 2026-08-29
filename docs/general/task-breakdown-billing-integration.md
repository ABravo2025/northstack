# Task breakdown — Billing Integration (Paddle + Mercado Pago)

Ordenado para que cada unidad sea construible y verificable por separado, mismo criterio
pieza-por-pieza ya usado en Payroll/Clients/Signup. Spec de referencia:
`spec-billing-integration.md`. Mockups: `billing-payment-mockup.html`,
`settings-billing-flow-mockup.html` — **ninguno de los dos existe en el repo**, se construyó a
partir de la prosa de la spec (ver esa spec para el detalle).

**Estado (2026-08-29): todas las unidades de abajo están hechas y en producción desde 2026-08-23**
(después de una revisión de código de 16 hallazgos que encontró y corrigió 7 bugs antes del push a
`main` — ver memoria `project_billing_integration_2026-08.md`). Varias unidades se construyeron con
más alcance del descripto acá, o distinto — ver notas inline `**(...)**` en cada una. La spec
(`spec-billing-integration.md`, sección "Riesgos técnicos conocidos") documenta 3 riesgos de esa
revisión que quedaron deliberadamente sin arreglar, más un cuarto encontrado recién en este refresh
de docs (2026-08-29, sin confirmar con Alejandro todavía) — no repetidos acá, ver esa sección.

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
   **(Con más alcance)** También suma `getAuthorizedPayment(id)` — no estaba en la lista original,
   hace falta un round-trip de seguridad separado para el evento `authorized_payment` (pago
   recurrente confirmado/falla), distinto del de `preapproval`.
7. **`POST /api/subscriptions/me/checkout`**: llama `resolveProvider`; si `mercadopago`, crea el
   `Preapproval` con `external_reference: subscriptionId`, `transaction_amount` desde `PlanPrice`,
   `currency_id: "ARS"` — devuelve `init_point` para que el frontend redirija.
   **(Extendido, correcciones de Alejandro 2026-08-19/20/21)** El mismo endpoint ahora también
   maneja "update payment method" sobre una suscripción ya activa (ver `spec-billing-integration.md`
   § "Endpoints self-serve"), y calcula `trialDays` cappeado a lo que queda del trial original del
   tenant — no es solo "crear el Preapproval", tiene una rama entera más de la que describe esta
   unidad.
8. **`POST /api/webhooks/mercadopago`**: verifica `x-signature`, hace `GET` de vuelta a la API de
   MP con el id del payload (nunca confía en el body directo), valida contra
   `ProcessedWebhookEvent` (insert-then-process), aplica la tabla de transiciones de la spec vía
   `syncSubscriptionAndTenant()`. Sobre pago inicial confirmado: completa
   `paymentMethodBrand`/`paymentMethodLast4` si el payload los trae.
   **(Extendido)** Suma `rollbackProcessedEvent` (encontrado en vivo 2026-08-21: la "Simular
   notificación" de MP mandó un `data.id` sin preapproval real, 404 dentro del handler, dejaba el
   evento marcado "ya procesado" para siempre) — deshace el insert de `ProcessedWebhookEvent`
   cuando el procesamiento tira. **Riesgo encontrado en el refresh de docs 2026-08-29 (no
   arreglado, no estaba en la lista de riesgos del code review original):** `preapproval` status
   `authorized` pasa `status` a `active` de una, sin distinguir "recién cargó tarjeta, trial
   corriendo" de "ya cobramos" — a diferencia de cómo Paddle maneja el mismo momento (ver spec).
9. **Cron — extensión para cancelación en Mercado Pago**: el mismo job que ya corre
   `trialing→past_due→suspended` ahora también revisa `cancellationEffectiveAt` vencido con
   `provider: mercadopago` y llama `updatePreapproval(id, { status: 'cancelled' })` (Paddle no
   necesita este paso — ver punto 10). **Riesgo conocido (code review, sin arreglar):** el loop no
   tiene try/catch por-tenant — una cancelación que falla aborta el resto del batch del día.

## Backend — Paddle

10. **`src/lib/paddle.ts`**: wrapper con inicio de checkout (Overlay, `customData: {
    subscriptionId }`, precio dinámico — no un Price ID de catálogo fijo), verificación de
    `Paddle-Signature`, `updateSubscription` (para cambio de plan `effective_from:
    next_billing_period` / cancelación programada nativa).
    **(Construido distinto, ver `spec-billing-integration.md` § "Paddle — Checkout"):**
    `Checkout.open()` de Paddle.js no acepta un precio inline — el mecanismo real es
    `createNonCatalogTransaction` (crea un `Transaction` no-catálogo server-side vía `POST
    /transactions`, `custom_data` incluido ahí) más `Checkout.open({ transactionId })` del lado del
    frontend. También suma, no descriptos acá: `getTransaction` (round-trip de seguridad del
    webhook), `getInvoicePdfUrl` (feature de PDF real, pedido de Alejandro 2026-08-19),
    `getUpdatePaymentMethodTransaction` (update payment method dedicado — **riesgo conocido:** la
    transacción que devuelve puede no traer `custom_data.subscriptionId`, ver spec), y
    `removeScheduledChange` (necesario para `resume`, ver punto 15).
11. **`POST /api/webhooks/paddle`**: verifica firma, resuelve el `Subscription` vía
    `customData.subscriptionId`, `ProcessedWebhookEvent`, aplica transiciones igual que el punto
    8. Sobre pago confirmado: completa `paymentMethodBrand`/`paymentMethodLast4`.
    **(Con más alcance)** También maneja `subscription.created` (tarjeta cargada al iniciar el
    trial-con-tarjeta, no toca `status`) y descarta como no-op las transacciones de "update payment
    method" ($0, `isPaymentMethodUpdateOnly`) para no crear un `Invoice` fantasma — ninguno de los
    dos casos estaba en la descripción original de esta unidad.
12. **`POST /api/subscriptions/me/checkout`** (mismo endpoint del punto 7): rama Paddle — arma lo
    que el frontend necesita para abrir el Overlay (no hay redirect a otro dominio). Ver nota del
    punto 7 sobre el alcance real del endpoint (subscribe vs. update payment method, trial
    cappeado).

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
    **(Corregido)** Solo es cierto para Mercado Pago. Paddle sí requiere un llamado real
    (`removeScheduledChange` — `PATCH .../subscriptions/{id} { scheduled_change: null }`), porque
    `cancel` sí llamó a Paddle en el momento (a diferencia de MP) — sin este llamado, Paddle
    cancelaría igual en la fecha programada sin importar lo que diga nuestra base.

## Frontend

16. **Settings grid**: mover la tile "Billing" de "Coming soon" a "My account", al lado de
    "Profile" — según `settings-billing-flow-mockup.html`. Sale del estado dimmed/disabled.
    **(Con más alcance)** La tile además quedó gateada a `isOwner` en `settingsSections.tsx` —
    detalle no descripto en esta unidad, pero consistente con que todos los endpoints mutating de
    billing son owner-only.
17. **`BillingPage.tsx`** (`/settings/billing`): resumen de plan colapsado (nombre + precio +
    fecha según el mapeo de la spec) con "Change plan" desplegando el selector Starter/Growth;
    card de método de pago (vacío en trial, badge de proveedor + últimos 4 dígitos si existe);
    tabla de historial de facturas (`Invoice`, empty state en trial); zona de cancelar/reanudar
    según el estado (`cancel_scheduled` muestra "Resume subscription" en vez de "Cancel").
    **(Con más alcance)** Suma, no descripto acá: botón "Subscribe" independiente del banner de
    `past_due`/`suspended` (checkout arranca al elegir plan, ver corrección 2026-08-20 en la spec);
    ver/descargar el PDF real de la factura (Paddle-only, `getInvoiceDocumentUrl`); refetch en
    `window focus` para levantar el resultado del checkout que corre en otra pestaña.
18. **Banner en `AppLayout.tsx`**: extender el banner de `past_due` ya existente para cubrir
    también `suspended`, con el CTA que abre el modal del punto 19.
19. **Modal "Add payment method"** (`billing-payment-mockup.html` — no existe en el repo, ver nota
    al inicio de este doc): dispara `POST /api/subscriptions/me/checkout`, redirige a `init_point`
    (Mercado Pago) o abre el Overlay de Paddle, según lo que devuelva el endpoint.
    **(Construido distinto)** El modal ya no carga Paddle.js ni abre el Overlay él mismo — abre
    `PaddleCheckoutPage.tsx` en una pestaña nueva (`window.open`, corrección de Alejandro
    2026-08-20: "debe sentirse como su propia ventana") y esa página es la que carga Paddle.js y
    llama `Checkout.open`. El redirect de Mercado Pago también corrigió a `window.open` en pestaña
    nueva (2026-08-21 — antes era `window.location.href`, sacaba al tenant de Northstack). El modal
    además cubre dos modos (`subscribe`/`update`), no solo el de agregar método de pago por primera
    vez.

## Tests

20. Idempotencia: el mismo `event.id` entregado dos veces no duplica `Invoice` ni reprocesa la
    transición (cubre ambos proveedores).
    **(No hecho)** No hay test que ejercite las rutas `/api/webhooks/*` de punta a punta con un
    evento duplicado — la protección real (`ProcessedWebhookEvent` `@@unique` + insert-then-process
    en `routes/webhooks.ts`) está en el código, pero sin un test automatizado que la confirme.
21. Verificación de firma: payload sin firma válida o con firma alterada se rechaza sin tocar la
    base, en ambos webhooks.
    **(Hecho)** `tests/webhookSignatures.test.ts` — firma válida, tampering, header malformado, y
    fail-closed cuando falta el secret, para ambos proveedores.
22. Race cron vs. webhook: test que dispara ambos casi en simultáneo y confirma que gana el
    webhook (lectura fresca antes de escribir en el cron).
    **(No hecho)** No hay test de esta race — la lectura fresca antes de escribir existe en el
    código (`syncSubscriptionAndTenant` corre dentro de una `$transaction`), pero no está probada
    con un escenario concurrente real.
23. Self-serve: `change-plan`/`cancel`/`resume` rechazan si quien llama no es el owner;
    `change-plan` no muta `Subscription.plan` hasta la confirmación del proveedor.
    **(Parcial)** El chequeo owner-only se prueba a nivel de la función compartida
    `canManageBilling` (`tests/subscriptionPlans.test.ts`), no con un test HTTP contra cada ruta de
    `routes/subscriptions.ts`. Lo de `change-plan` sí está cubierto de punta a punta en
    `tests/subscriptionSelfServe.test.ts`.

## Explícitamente fuera de este breakdown

- Facturación fiscal Argentina (factura electrónica AFIP).
- Emails de dunning (aviso antes de vencer gracia, aviso de pago fallido).
- Dashboards de MRR/churn — el modelo ya lo soporta, las queries no se construyen acá.
- Valores reales de `PlanPrice` para `ar` — quedan placeholder hasta que Alejandro los defina
  (confirmado sin cambios al 2026-08-29 — `scripts/seed-plan-prices.ts` sigue sembrando 0 cents
  para `market: 'ar'`).
- Activar credenciales de producción de Paddle/Mercado Pago — trámite administrativo, no código.
