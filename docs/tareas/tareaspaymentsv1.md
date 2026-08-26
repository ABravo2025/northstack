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

## Unidad 4 — Webhook de notificaciones proactivas

- [ ] 24. **Corregido 2026-08-26 (ya no es una decisión abierta):** `model Notification` ya existe y está completo en `staging` (Sales v2 Unidad 7/8 — schema, `src/routes/notifications.ts`, bell icon en `TopBar.tsx`). Esta unidad no construye nada de eso, solo suma valores nuevos a `enum NotificationType` (hoy: `opportunity_stage_changed`/`opportunity_stalled`) — propuesta a confirmar al implementar: `stripe_charge_refunded`, `stripe_charge_failed`, `stripe_payment_failed`, `stripe_subscription_past_due`, `stripe_subscription_canceled`.
- [ ] 25. Schema: sumar esos 5 valores a `enum NotificationType` — aditivo, sin tocar `model Notification`.
- [ ] 26. Backend: `POST /api/webhooks/stripe/:tenantId` — **corregido 2026-08-26, ubicación**: en `src/routes/webhooks.ts`, junto a Paddle/Mercado Pago, no en `/api/integrations/stripe/*` (ese prefijo es solo para setup/connect; el webhook en sí, aunque sea por-tenant, es "webhook de proveedor" igual que los otros dos). Endpoint sin auth de sesión (la autenticación es la firma). Busca `StripeConnection` por el `tenantId` de la URL primero (400 si no existe), luego verifica firma con `stripe.webhooks.constructEvent(body, signature, connection.webhookSigningSecret)`. 400 si no valida, sin procesar.
- [ ] 27. Backend: manejo por tipo de evento (`charge.refunded`, `charge.failed`, `payment_intent.payment_failed`, `customer.subscription.updated` con `status: past_due`, `customer.subscription.deleted`) — extraer `customer` del payload, buscar `Company` por `stripeCustomerId` dentro de ese `tenantId`. Sin match → descartar sin guardar nada.
- [ ] 28. Backend: con match, crear `Notification` con el tipo correspondiente. Destinatario: `Company.accountOwnerId`, fallback a un `owner`/`admin` del tenant si no tiene account owner asignado (definir el criterio exacto de cuál, ej. el primer owner activo).
- [ ] 29. Frontend: completar el checklist de eventos del Paso 2 (Unidad 1, tarea 8) con los cinco eventos exactos de la tarea 27.
- [ ] 30. Build → test → verificación real (disparar un refund/failed real desde el dashboard de test de Stripe, confirmar que llega la notificación al bell icon existente) → commit → push a `staging`.
