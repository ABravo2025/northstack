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

## Unidad 2 — Lookup / matching Company ↔ Stripe Customer

- [ ] 11. Schema: `Company.stripeCustomerId` (String?) + `Company.stripeCustomerMatchedVia` (String?) — migración aditiva.
- [ ] 12. Backend: `POST /api/payments/companies/:companyId/stripeLookup` — valida que exista `StripeConnection` activo (error claro si no). Trae todos los `Contact` de la Company, busca `stripe.customers.list({ email: contact.email, limit: 3 })` por cada uno, consolida únicos por `customer.id`, devuelve cada resultado junto con el email que lo originó.
- [ ] 13. Backend: endpoint para confirmar el vínculo (`PATCH /api/companies/:companyId` o `POST .../stripeLink`) — guarda `stripeCustomerId` + `stripeCustomerMatchedVia`. Si ya había un `stripeCustomerId` distinto, pedir confirmación explícita antes de sobreescribir.
- [ ] 14. Frontend: botón "Buscar en Stripe" en el detalle de Company. Estados: 0 resultados (mensaje), 1 resultado (card de confirmación con Contact de origen), 2+ resultados (lista seleccionable con el Contact de origen de cada uno).
- [ ] 15. Frontend: estado "Conectado a Stripe" en el detalle de Company una vez vinculada, con link directo al customer en el dashboard de Stripe (`.../customers/{id}`, usando `test/` en la URL si `apiKeyMode` es test).
- [ ] 16. Build → test → verificación real (contra customers reales de una cuenta de test) → commit → push a `staging`.

---

## Unidad 3 — Visibilidad de pagos (resúmenes en vivo, sin store)

- [ ] 17. Backend: `GET /api/payments/companies/:companyId/summary` — "sin vincular" si no hay `stripeCustomerId` (no error). Si lo hay, en paralelo: `stripe.refunds.list({ customer })`, charges/payment intents fallidos, `stripe.subscriptions.list({ customer })` → arma conteos/montos/estado de subscripción.
- [ ] 18. Backend: `GET /api/payments/companies/:companyId/events` — listado paginado usando la paginación cursor-based nativa de Stripe (`starting_after`), sin reimplementar offset/limit.
- [ ] 19. Backend: `GET /api/payments/overview` — todas las Companies del tenant con `stripeCustomerId`, fan-out del `summary` de cada una en paralelo con límite de concurrencia (ej. `p-limit`, tope 10), agrega totales y devuelve también el resumen por Company (para no disparar una segunda ronda de requests desde el frontend).
- [ ] 20. Frontend: home de la sección Payments — tarjetas de agregados (refunds conteo+monto, failed conteo, companies con subscripción activa) + tabla de Companies con su resumen y link al detalle. Loading claro durante el fan-out.
- [ ] 21. Frontend: panel dentro del detalle de Company — resumen individual + tabla de eventos paginada (fecha, tipo, monto, link al objeto en Stripe).
- [ ] 22. Gate de toda la sección (home + panel) a `owner`/`admin`.
- [ ] 23. Build → test → verificación real (medir tiempo de `overview` con varias decenas de Companies vinculadas, confirmar que el límite de concurrencia no dispara rate limits de Stripe) → commit → push a `staging`.

---

## Unidad 4 — Webhook de notificaciones proactivas

- [ ] 24. **Corregido 2026-08-26 (ya no es una decisión abierta):** `model Notification` ya existe y está completo en `staging` (Sales v2 Unidad 7/8 — schema, `src/routes/notifications.ts`, bell icon en `TopBar.tsx`). Esta unidad no construye nada de eso, solo suma valores nuevos a `enum NotificationType` (hoy: `opportunity_stage_changed`/`opportunity_stalled`) — propuesta a confirmar al implementar: `stripe_charge_refunded`, `stripe_charge_failed`, `stripe_payment_failed`, `stripe_subscription_past_due`, `stripe_subscription_canceled`.
- [ ] 25. Schema: sumar esos 5 valores a `enum NotificationType` — aditivo, sin tocar `model Notification`.
- [ ] 26. Backend: `POST /api/webhooks/stripe/:tenantId` — **corregido 2026-08-26, ubicación**: en `src/routes/webhooks.ts`, junto a Paddle/Mercado Pago, no en `/api/integrations/stripe/*` (ese prefijo es solo para setup/connect; el webhook en sí, aunque sea por-tenant, es "webhook de proveedor" igual que los otros dos). Endpoint sin auth de sesión (la autenticación es la firma). Busca `StripeConnection` por el `tenantId` de la URL primero (400 si no existe), luego verifica firma con `stripe.webhooks.constructEvent(body, signature, connection.webhookSigningSecret)`. 400 si no valida, sin procesar.
- [ ] 27. Backend: manejo por tipo de evento (`charge.refunded`, `charge.failed`, `payment_intent.payment_failed`, `customer.subscription.updated` con `status: past_due`, `customer.subscription.deleted`) — extraer `customer` del payload, buscar `Company` por `stripeCustomerId` dentro de ese `tenantId`. Sin match → descartar sin guardar nada.
- [ ] 28. Backend: con match, crear `Notification` con el tipo correspondiente. Destinatario: `Company.accountOwnerId`, fallback a un `owner`/`admin` del tenant si no tiene account owner asignado (definir el criterio exacto de cuál, ej. el primer owner activo).
- [ ] 29. Frontend: completar el checklist de eventos del Paso 2 (Unidad 1, tarea 8) con los cinco eventos exactos de la tarea 27.
- [ ] 30. Build → test → verificación real (disparar un refund/failed real desde el dashboard de test de Stripe, confirmar que llega la notificación al bell icon existente) → commit → push a `staging`.
