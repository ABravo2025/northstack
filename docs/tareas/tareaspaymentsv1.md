# Tareas — Payments v1 (Conexión Stripe + Visibilidad de Pagos)

Checklist ejecutable, en orden estricto. Spec completa con el razonamiento de cada decisión en `spec-payments-v1.md` — este documento es solo la lista de tareas para ir tildando.

Criterio en cada unidad: build → `npm run build`/`npm test` → verificación real (curl y/o Playwright contra un tenant de prueba) → commit → push exclusivamente a `staging`, nunca a `main`.

---

## Unidad 1 — Conexión con Stripe (fundamento — nada más funciona sin esto) — ✅ completa, en `staging`

- [x] 1. Schema: `model StripeConnection` — como estaba especificado, más FK real `connectedBy` (mismo patrón que `createdByUserId`/`invitedByUserId` del resto del schema). `db push` contra `STAGING_DATABASE_URL` únicamente.
- [x] 2. Infra: `src/lib/stripeEncryption.ts`, `encryptStripeSecret`/`decryptStripeSecret` (nombres genéricos — una función cubre tanto la key como el webhook secret) — calca `encryption.ts`/`googleTokenEncryption.ts`, key propia `STRIPE_TOKEN_ENCRYPTION_KEY` (generada, cargada en `.env` local; falta Vercel).
- [x] 2b. **Corrección real, encontrada antes de escribir código**: la spec asumía el SDK oficial de Stripe — `src/lib/paddle.ts`/`mercadopago.ts` documentan que el proyecto evita SDKs de pago a propósito. `src/lib/stripe.ts` (nuevo) es un cliente REST a mano (`fetch` + `crypto`, sin el paquete `stripe`), form-urlencoded (Stripe no acepta JSON).
- [x] 3. Backend: `src/modules/integrations/stripeService.ts` — `detectApiKeyMode`, `connectStripe`, `getStripeConnectionStatus`, `saveStripeWebhookSecret`, `disconnectStripe`, `getApiKeyForTenant`, `markNeedsAttention`.
- [x] 4. Backend: `POST /api/integrations/stripe/connect` (`src/routes/stripeIntegration.ts`) — valida el prefijo antes de tocar la red, `retrieveAccount` con fallback a `listCustomers`, detecta modo, cifra, upsert. Gate: **owner-only** (ver 4b).
- [x] 4b. **Decisión confirmada con Alejandro**: no "owner/admin" como decía la spec — owner-only, igual que el gate real de Payroll (la spec citaba mal ese precedente). Enrutado vía `canManagePayments` (`permissionService.ts`), no un chequeo inline, para no tener que tocar cada endpoint cuando exista el sistema de roles custom.
- [x] 5. Backend: `POST /api/integrations/stripe/webhook-secret` — igual que lo especificado.
- [x] 6. Backend: `DELETE /api/integrations/stripe` — soft (`disconnectedAt`). **Bug real encontrado en la verificación**: la versión original crasheaba con un error crudo de Prisma si se llamaba sin conexión previa — corregido a `updateMany` idempotente.
- [x] 6b. Backend: `GET /api/integrations/stripe/status` (no estaba en la lista original, hacía falta para que la UI lea el estado al montar) — mismo patrón que el de Google Calendar.
- [x] 7. Frontend: **corrección real de ubicación** — no un ítem nuevo de sidebar. `IntegrationsSettingsPage.tsx` (2026-08-24) ya consolidó todas las integraciones en una sola página con la regla explícita de no partirla — se construyó como card nueva ahí, gateada a owner. El resto (copy de Restricted Key, checklist de permisos, campo enmascarado, botón) tal como estaba especificado.
- [x] 8. Frontend: Paso 2 (Webhook) — URL con el prefijo correcto (`/api/webhooks/stripe/:tenantId`, ver corrección de la tarea 26), botón de copiar, checklist de eventos, campo de signing secret, y el aviso del bypass de Vercel (solo visible en hosts de staging).
- [x] 9. Frontend: estado conectado — chip test/live (clases `role-chip`/`chip-neutral`/`chip-good` ya existentes, no un componente nuevo), fecha, desconectar, banner si `needsAttention`.
- [x] 10. **Verificado 2026-08-26** contra `staging` real (dev server local + tenant/owner/member descartables vía Prisma, borrados al terminar): status sin conectar, 403 para member en los 3 endpoints mutables, 400 inmediato con key mal formada, 400 al guardar webhook secret sin conexión, disconnect sin conexión da 204 limpio, y una llamada real a `api.stripe.com` con una key inventada (prefijo válido) confirma que el cliente a mano arma bien la request y parsea el error real de Stripe. **No probado**: una conexión exitosa de punta a punta (hace falta una cuenta de test de Stripe real de Alejandro, no disponible en este entorno). `npm run build`/`npm test` (116/116)/`npm run lint` backend y build/lint frontend en verde.

---

## Unidad 2 — Lookup / matching Company ↔ Stripe Customer — ✅ completa, en `staging`

- [x] 11. Schema: `Company.stripeCustomerId`/`stripeCustomerMatchedVia` — como estaba especificado.
- [x] 12. Backend: `POST /api/payments/companies/:companyId/stripe-lookup` (**corregido**: kebab-case, no `stripeLookup` — rompía la convención de rutas del resto del proyecto) — valida conexión activa, itera Contacts **activos**, consolida por `customer.id`.
- [x] 13. Backend: `POST /api/payments/companies/:companyId/stripe-link` (endpoint dedicado) — 409 con `already_linked` si hay que confirmar sobreescritura, reintenta con `confirmOverwrite: true`.
- [x] 14. Frontend: sección "Payments" nueva en `CompanyDetailModal` (owner-only), botón "Search on Stripe", 0/1/2+ resultados con Contact de origen.
- [x] 15. Frontend: "Connected to Stripe →" con link al customer en el dashboard, más "Change link".
- [x] 15b. **Corrección real**: `ApiError` (frontend) no tenía `.status` — se le agregó para poder distinguir el 409 sin parsear el mensaje (cambio genérico, no rompe call sites existentes).
- [x] 16. **Verificado 2026-08-26** contra `staging` (2 tenants descartables): 400 sin conexión, 403 member, 404 cross-tenant, 400 con campos faltantes. Matching contra Stripe real cubierto por tests con mocks, no una cuenta de test real (no disponible en este entorno). `npm run build`/`npm test` (133/133)/`npm run lint` en verde.

---

## Unidad 3 — Visibilidad de pagos (resúmenes en vivo, sin store) — ✅ completa, en `staging`

- [x] 17. Backend: `GET /api/payments/companies/:companyId/summary` — **corregido, resuelve la decisión abierta original**: `GET /refunds` no acepta filtro `customer` (confirmado contra la doc real de Stripe) — Charges es la única fuente (trae `refunded`/`amount_refunded`/`status` propios), no un `/refunds` separado ni Payment Intents. `listSubscriptions` con `status: 'all'`. Devuelve `currency` también (del Charge, no del tenant).
- [x] 18. Backend: `GET /api/payments/companies/:companyId/events` — paginación cursor nativa sobre la misma lista de Charges, clasificados en failed/refunded/succeeded.
- [x] 19. Backend: `GET /api/payments/overview` — **sin `p-limit`**: `mapWithConcurrency` hand-rolled (~15 líneas), mismo criterio de "no paquete nuevo para algo chico" de toda esta spec. Chequea la conexión una sola vez antes del fan-out.
- [x] 20. Frontend: `PaymentsOverviewPage.tsx` nueva (sidebar "Payments", owner-only, item propio — distinto de la card de setup de la Unidad 1) — tarjetas de agregados + tabla con link al detalle.
- [x] 20b. **Corrección real**: el link "al detalle" no hubiera andado — `CompaniesPage.tsx` no soportaba abrir una Company por URL. Se agregó `?open=<companyId>` (mismo patrón que `googleCalendarConnected`).
- [x] 21. Frontend: panel dentro de `CompanyDetailModal` — mismo resumen + eventos recientes con "Load more", en la misma sección "Payments" de la Unidad 2.
- [x] 22. Gate: owner-only (`canManagePayments`), no "owner/admin" como decía originalmente — mismo criterio ya confirmado en la Unidad 1.
- [x] 23. **Verificado 2026-08-26** contra `staging`: summary/events "sin vincular"/vacío sin tocar Stripe, overview sin conexión da `connected: false` limpio, 403 member. Fan-out/agregación/aislamiento entre tenants cubiertos por tests con mocks — no medido contra decenas de Companies reales (sin cuenta de test de Stripe en este entorno). Mismo run de build/test/lint que la Unidad 2, en verde.

---

## Unidad 4 — Webhook de notificaciones proactivas — ✅ completa, en `staging`

- [x] 24. `model Notification` ya existía (Sales v2 Unidad 7/8) — nada que construir de eso.
- [x] 25. Schema: los 5 valores nuevos en `enum NotificationType` — aditivo.
- [x] 26. Backend: `POST /api/webhooks/stripe/:tenantId` (`src/routes/webhooks.ts`, junto a Paddle/MP) — **sin SDK**: `verifyStripeSignature` (`lib/stripe.ts`, de la Unidad 1) hace la verificación a mano, no `stripe.webhooks.constructEvent()`. Busca conexión primero (400 si no hay una con webhook secret), verifica firma después (400 si no valida).
- [x] 27. Backend: despacho por tipo de evento extraído a `processStripeWebhookEvent` (`stripePaymentsService.ts`, testeable sin HTTP) — resuelve Company por `stripeCustomerId`, descarta sin guardar si no hay match.
- [x] 28. Backend: `notifyCompanyStripeEvent` — **corregido**: nunca un admin como fallback, solo `accountOwnerId` o el primer `owner` activo (Payments es owner-only, ver Unidad 1).
- [x] 28b. **Corrección real encontrada antes de escribir el código**: notificar en cada `customer.subscription.updated` con `status: past_due` (como decía la spec) hubiera re-notificado en cada update no relacionado a una subscription ya `past_due`. Se agregó una guarda contra `data.previous_attributes.status` (confirmado contra la doc real de Stripe) — solo notifica si el status recién transicionó.
- [x] 29. Frontend: el checklist de eventos ya estaba en el Paso 2 desde la Unidad 1 (se construyó adelantado a propósito) — nada que agregar.
- [x] 30. **Verificado 2026-08-26 de punta a punta, sin necesitar Stripe real**: tenant descartable con un `StripeConnection` sembrado a mano (secret conocido), firmas HMAC calculadas igual que `verifyStripeSignature` para simular deliveries reales. Confirmado con una query directa: firma válida + customer vinculado → `Notification` real con mensaje/tipo/destinatario correctos; firma inválida/header faltante/tenant sin conexión → 400; customer sin match → 200 sin crear nada. 14 tests nuevos (guarda de `previous_attributes`, fallback de destinatario, todos los tipos de evento). `npm run build`/`npm test` (147/147)/`npm run lint` en verde.
- [x] 31. **Rediseño 2026-08-28** (ver QA-49/QA-50 en `Tareas-QA.md`, detalle en `specpaymentsv1.md` Unidad 4): el webhook (tareas 26-30 arriba) se reemplazó por un cron diario (`runStripeEventPolling`, `GET /v1/events` con la misma Restricted Key — el plan original era 2x/día, bajado a 1x/día porque el plan Hobby de Vercel no permite más de una corrida diaria por cron, descubierto recién en el primer deploy real) — cero setup manual para el tenant. Se sacaron `POST /api/webhooks/stripe/:tenantId`, `saveStripeWebhookSecret`, `verifyStripeSignature`, `StripeConnection.webhookSigningSecretEncrypted`; se agregó `lastEventPollAt` al schema y el permiso `Events` a la Restricted Key recomendada. `processStripeWebhookEvent` no cambió — el cron lo reusa tal cual.
