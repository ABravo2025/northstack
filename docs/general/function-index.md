# Function Index

- Fecha de creación: 2026-08-05
- Propósito: mapa de las funciones/componentes **reusables** del proyecto (servicios de backend,
  utilidades compartidas, hooks, componentes de UI comunes, cliente de API) — para chequear antes de
  escribir código nuevo si ya existe algo que resuelva lo mismo. Ver `docs/Skills/Skills-Development.md`,
  que exige leer este archivo antes de implementar cualquier tarea.
- **Alcance**: solo lo que se importa desde más de un lugar o está pensado para eso — `src/lib/**`,
  `src/modules/**` (capa de servicios), `frontend/src/lib/**`, `frontend/src/hooks/**`,
  `frontend/src/components/**`, `frontend/src/api/**`. **No incluye** handlers sueltos de página
  (`frontend/src/pages/*.tsx`) ni handlers de ruta (`src/routes/*.ts`) — esos son específicos de una
  sola pantalla/endpoint, no se reusan, indexarlos sería ruido.
- **Sin número de línea a propósito**: se desactualizan con el primer edit que toque el archivo. Para
  ubicar una función exacta, `grep -n "nombreDeLaFuncion" ruta/al/archivo.ts` — nunca desactualizado.
- **Mantenimiento**: este archivo se actualiza como parte de cualquier tarea que agregue, borre o
  renombre una función dentro del alcance de arriba — no es un snapshot de una sola vez. Si notás que
  quedó desactualizado (por ejemplo, después de mergear una rama grande como `staging` a `main`),
  regeneralo antes de seguir confiando en él para chequear reusabilidad.
- Reflejaba el estado de `main` al momento de escribirse — **no incluye** módulos que solo viven en
  `staging` todavía sin mergear, hasta que se promuevan.

---

## Backend — `src/`

### `src/lib/asyncRouter.ts`
- **createAsyncRouter()** — wrapper de `express.Router` que atrapa rechazos de handlers `async` y devuelve 500 limpio en vez de tirar abajo el proceso. Todo router nuevo lo usa en vez de `express.Router()` a secas.

### `src/lib/csv.ts`
- **parseCsv(text)** — parser/serializador CSV mínimo (RFC-4180-ish, sin dependencia externa). Maneja campos con comillas, comas embebidas, comillas escapadas (`""`) y ambos finales de línea.
- **toCsv(rows)** — inverso de `parseCsv`, arma texto CSV a partir de filas.
- **rowsToRecords(rows)** — header + filas → array de objetos planos, keyed por nombre de columna (match case-insensitive). Forma que consume todo importador de CSV de la app.
- **getField(record, ...names)** — busca un campo en un record por cualquiera de varios nombres alternativos (alias de columna).

### `src/lib/email.ts`
Leaf module (sin imports) — extraído 2026-08-18 de `tenantService.ts` para que `authService.ts` y `contractConfirmationService.ts` pudieran usarlo sin crear un import circular.
- **isEmailFormatValid(email)** — regex de formato, no de existencia real.
- **getEmailDomain(email)** — dominio en minúsculas de un email. Setea `User.emailDomain` en cada `user.create` (registerTenantWithOwner, registerUser, contractConfirmationService) y lo usa `publicFormService.ts` para matchear Contact↔Company por dominio.

### `src/lib/encryption.ts`
- **encryptPaymentAccountData(plaintext)** / **decryptPaymentAccountData(payload)** — AES-256-GCM vía el módulo `crypto` nativo de Node (sin librería externa), keyed por `PAYMENT_DATA_ENCRYPTION_KEY`. Único uso hoy: `EmployeeCompensation.paymentAccountDataEncrypted` (Payroll, ver `docs/spec-payroll.md`).

### `src/lib/googleTokenEncryption.ts` (2026-08-22)
- **encryptGoogleToken(plaintext)** / **decryptGoogleToken(payload)** — mismo AES-256-GCM que `encryption.ts`, pero con su propia key (`GOOGLE_TOKEN_ENCRYPTION_KEY`) — no reusar la de Payroll, un key por propósito. Único uso: `GoogleCalendarConnection.accessTokenEncrypted`/`refreshTokenEncrypted`.
- **isGoogleTokenEncryptionConfigured()** — usado por `googleCalendarConfigured()` en `googleCalendarAuthService.ts`.

### `src/lib/stripeEncryption.ts` (Payments v1, `docs/tareas/specpaymentsv1.md`, 2026-08-26)
- **encryptStripeSecret(plaintext)** / **decryptStripeSecret(payload)** — mismo AES-256-GCM que los dos de arriba, key propia (`STRIPE_TOKEN_ENCRYPTION_KEY`). Un solo par de funciones cubre tanto `StripeConnection.apiKeyEncrypted` como `.webhookSigningSecretEncrypted` — ambos son secretos de Stripe pegados por el tenant, no ameritan una función por campo.
- **isStripeEncryptionConfigured()** — mismo patrón que `isGoogleTokenEncryptionConfigured()`.

### `src/lib/httpAuth.ts`
- **getBearerToken(req)** — extrae el token `Authorization: Bearer`.
- **getClientIp(req)** — IP del cliente, para rate limiting.
- **authenticateUser(req, res)** — valida credenciales de login, no de sesión existente.
- **validateSession(req, res)** — valida el token de sesión de un request ya autenticado; el que usa casi todo endpoint protegido. Desde 2026-08-18 también bloquea con 403 cualquier request no-`GET` si `tenant.status === 'suspended'` (view-only: sin billing real todavía no hay forma self-serve de reactivar, así que se lee pero no se escribe).

### `src/lib/platformAuth.ts`
- **requirePlatformRole(...allowed)** — devuelve un helper `(req, res) => Promise<User | null>` en el mismo estilo call-and-return de `validateSession` (no middleware `next()`). Usa `authenticateUser` (no `validateSession`, porque el staff de plataforma no tiene `tenantId`), y rechaza si `user.platformRole` es null o no está en `allowed`. `platform_admin` pasa siempre (bypass implícito, no hace falta listarlo). Usado por las rutas `/api/platform/*` (Admin Center).

### `src/lib/mailer.ts`
Todas siguen el mismo patrón: `if (!mailerConfigured()) return;` (no rompen el request si Zoho no está configurado), best-effort.
- **sendInvitationEmail(input)** — invitación a un tenant; `input.attachments` opcional (Payroll usa esto para adjuntar el contrato borrador).
- **sendPublicFormSubmissionEmail(input)** — aviso al owner de una submission nueva en un Public Form.
- **sendPublicFormConfirmationEmail(input)** — confirmación al que llenó el form.
- **sendTimeOffRequestPendingEmail(input)** — aviso al approver de una solicitud de Time Off pendiente.
- **sendTimeOffRequestDecidedEmail(input)** — aviso de aprobación/rechazo (o auto-aprobación).
- **sendFeedbackEmail(input)** — feedback de un tenant a `FEEDBACK_EMAIL`.
- **sendContractSignedEmail(input)** — (Payroll) contrato firmado adjunto, al firmante con copia al owner + a quien lo cargó.
- **sendPasswordResetEmail(input)** — link de "¿olvidaste tu contraseña?" (2026-08-09), expira en 1 hora.
- **sendTicketNoteCreatedEmail(input)** — Admin Center: aviso al reporter de un Ticket cuando staff de plataforma responde.
- **sendSignupVerificationEmail(input)** — Tenant Signup (`docs/spec-tenant-signup.md`), link de verificación de email antes de crear el Tenant/User, expira en 24hs.

### `src/lib/mercadopago.ts` (Billing Integration, `docs/general/spec-billing-integration.md`)
Wrapper propio (`fetch` + `crypto` nativos, sin SDK) contra la API de Mercado Pago — mismo criterio que `src/lib/encryption.ts`.
- **createPreapproval(input)** — Preapproval sin plan asociado (`status: 'pending'`, así la respuesta trae `init_point` para el checkout hosteado); `input.subscriptionId` va como `external_reference`, la clave de join del webhook. `input.trialDays?` (2026-08-20, "genuinely free for 15 days") → `auto_recurring.free_trial: { frequency, frequency_type: 'days' }`, verificado contra sandbox real (`next_payment_date` sale 15 días después de la creación). Se omite (no se manda `free_trial`) en el fallback de "actualizar método de pago" de MP en `checkoutService.ts` — esa suscripción ya gastó o nunca tuvo ese trial, no le corresponde uno nuevo.
- **getPreapproval(id)** / **getAuthorizedPayment(id)** — round-trip de seguridad del webhook (nunca confiar en el body directo); `getAuthorizedPayment` no estaba en el breakdown original, agregado porque el contrato de webhooks necesita reaccionar a eventos `authorized_payment` (pago recurrente confirmado/fallido), distintos de los eventos `preapproval`.
- **updatePreapproval(id, { status?, transactionAmount? })** — cambio de plan / cancelación (llamada desde `planTransitionService.ts` para el barrido de cancelación de MP, y desde los endpoints self-serve de Etapa D).
- **verifyMercadoPagoSignature(input)** — header `x-signature` (`ts=...,v1=...`), manifest `id:{dataId};request-id:{xRequestId};ts:{ts};`, HMAC-SHA256 hex, `timingSafeEqual`. Devuelve `false` (fail closed) si `MP_WEBHOOK_SECRET` no está configurado.
- `mpRequest()` NO manda ningún header especial de "modo sandbox" — a diferencia de Paddle (hostname separado), MP infiere test-vs-real puramente por a qué identidad pertenece `MP_ACCESS_TOKEN`. Se probó agregar `X-scope: stage` (documentado para *otro* patrón de testing) y empeoró las cosas (500 → 503) una vez emparejado con un token de vendedor de test genuino — sacarlo fue lo que hizo funcionar `POST /preapproval` de verdad. Confirmado 2026-08-19 de punta a punta contra sandbox real (`createPreapproval` + `getPreapproval`, con `external_reference` viajando correcto).
- **Gotcha real de Mercado Pago, no de este código**: un usuario de test recién creado (`/users/test_user`) no está disponible de inmediato como `payer_email` en `/preapproval` — delay de propagación del lado de MP, devuelve 500 los primeros segundos. Reusar un comprador de test ya existente (o esperar unos segundos) lo resuelve. Relevante para cualquier test futuro contra este sandbox.
- **Cómo conseguir un `MP_ACCESS_TOKEN` de test utilizable**: el access token de tu propia cuenta real (aunque tenga prefijo `TEST-`) NO sirve como "collector" de un Preapproval de test — MP exige que comprador y vendedor sean ambos de test o ambos reales. Hace falta loguearse (incógnito) como la cuenta de prueba tipo Vendedor creada en Developer Panel → Tus integraciones → Cuentas de prueba, y ahí sacar SU propio Access Token desde "Credenciales de producción" (no "de prueba" — logueado como cuenta de test no se ve esa sección). Ese token puede tener prefijo `APP_USR-` sin ser peligroso, ya que la identidad detrás sigue siendo sintética — verificar siempre con `GET /users/me` antes de confiar en un token nuevo.

### `src/lib/paddle.ts` (Billing Integration, `docs/general/spec-billing-integration.md`)
Wrapper propio, mismo criterio que `mercadopago.ts` de arriba.
- **createNonCatalogTransaction(input)** — el mecanismo real para precio dinámico (Paddle.js `Checkout.open()` solo acepta `priceId` de catálogo o `transactionId`, nunca un precio inline — a diferencia de lo que la spec asumía): crea una Transaction con un precio no-catálogo, el frontend abre el Overlay con `Checkout.open({ transactionId })`. `input.subscriptionId` va en `custom_data.subscriptionId`, la clave de join del webhook (mismo rol que `external_reference` de MP). `input.trialDays?` (2026-08-20, "genuinely free for 15 days" — corrección de Alejandro, elegir un plan pago ya no cobra al toque) → `price.trial_period: { interval: 'day', frequency }`, verificado contra sandbox real (`requires_payment_method: true`, `details.totals.total: "0"`). Mismo criterio de omisión que `createPreapproval` de abajo.
- **updateSubscriptionItems(subscriptionId, input)** — cambio de plan self-serve (Etapa D), `proration_billing_mode: 'do_not_bill'`.
- **getUpdatePaymentMethodTransaction(subscriptionId)** (2026-08-19) — `GET /subscriptions/{id}/update-payment-method-transaction`. Mecanismo dedicado de Paddle para reemplazar la tarjeta de una suscripción YA activa sin crear una segunda suscripción compitiendo (a diferencia de `createNonCatalogTransaction`, que sí crearía una nueva) — corrección de Alejandro: "elegir plan" y "actualizar método de pago" son dos acciones distintas, no se pueden resolver con el mismo llamado.
- **getTransaction(id)** (2026-08-19) — `GET /transactions/{id}`, detalle completo. Usado por el webhook como round-trip de seguridad (mismo principio que Mercado Pago, "nunca confiar en el body") — necesario en la práctica porque el `payments` array del body del webhook estaba vacío/incompleto en el momento exacto de `transaction.completed`, mientras este endpoint ya tenía la tarjeta completa.
- **getInvoicePdfUrl(transactionId, disposition?)** (2026-08-19) — `GET /transactions/{id}/invoice?disposition=`, URL temporal (~1h) al PDF real de Paddle. `disposition: 'inline'` (default acá, no el de Paddle) abre en el navegador, `'attachment'` fuerza la descarga — mismo parámetro que expone la API de Paddle, solo se pasa. Sin equivalente en Mercado Pago (factura AFIP Argentina fuera de alcance).
- **cancelSubscription(subscriptionId, effectiveFrom?)** — cancelación programada nativa (`next_billing_period` default).
- **removeScheduledChange(subscriptionId)** — limpia una cancelación/pausa programada (`PATCH .../{id}` con `scheduled_change: null`). No estaba en el breakdown original — necesario porque `resume` sí necesita avisarle a Paddle (a diferencia de Mercado Pago, que nunca recibió el llamado de cancelación a pedir en primer lugar).
- **verifyPaddleSignature(input)** — header `Paddle-Signature` (`ts=...;h1=...`), signed payload `{ts}:{rawBody}`, HMAC-SHA256 hex, `timingSafeEqual`. Fail closed si `PADDLE_WEBHOOK_SECRET` no está configurado.
- Verificado 2026-08-19 contra Paddle sandbox real: un precio no-catálogo necesita un `product` inline anidado (`name`+`tax_category`), no alcanza con `price` solo — `createNonCatalogTransaction`/`updateSubscriptionItems` ya lo incluyen. Segundo bug real encontrado el mismo día: toda respuesta de la API de Paddle envuelve la entidad real en `{ data, meta }` — `paddleRequest()` (helper interno) ahora desenvuelve `.data` siempre; sin esto, `transaction.id` volvía `undefined` en silencio. `POST /transactions` end-to-end confirmado funcionando contra sandbox real (`checkout.url` + `items[0].price` con totales correctos), incluido el webhook completo (`transaction.completed` → `Subscription` activa + `Invoice` real).

### `src/lib/stripe.ts` (Payments v1, `docs/tareas/specpaymentsv1.md`, 2026-08-26)
Wrapper propio (`fetch` + `crypto` nativos, sin SDK) contra la API de Stripe — mismo criterio que `mercadopago.ts`/`paddle.ts` de arriba (ver esos dos para el razonamiento explícito de por qué no una librería). A diferencia de esos dos, no hay una sola API key fija leída de una env var — cada tenant tiene la suya propia (`StripeConnection`), así que toda función acá la recibe como parámetro.
- **retrieveAccount(apiKey)** — `GET /account`, validación de una key recién pegada (Unit 1). Una Restricted Key sin el permiso de lectura "Account" la rechaza (401/403) aunque sea válida — `connectStripe()` (`stripeService.ts`) cae a `listCustomers` en ese caso en vez de rechazar la key.
- **listCustomers(apiKey, { email?, limit?, starting_after? })** — `GET /customers`; fallback de validación de Unit 1, y base del matching Company↔Customer de Unit 2.
- **listCharges(apiKey, { customer, limit?, starting_after? })** (Unit 3, 2026-08-26) — `GET /charges`. Es la única fuente de refunds/failed/eventos (ver `StripeCharge` abajo) — confirmado contra la documentación real de Stripe que `GET /refunds` **no acepta un filtro `customer`** (solo `charge`/`payment_intent`), así que "listar refunds de este customer" no es una llamada que la API soporte directo; un Charge ya trae `refunded`/`amount_refunded`/`status` propios, que es lo que lo hace la fuente correcta en vez de un rodeo.
- **listSubscriptions(apiKey, { customer, status?, limit?, starting_after? })** (Unit 3) — `GET /subscriptions`. Se llama con `status: 'all'` (confirmado en la doc real) porque el default silenciosamente excluye canceladas.
- **listEvents(apiKey, { createdGte, limit?, starting_after? })** (Unit 4, rediseñada 2026-08-28) — `GET /events`, filtrado por `created[gte]`. Reemplazó el webhook manual entero: devuelve los mismos objetos Event que un webhook hubiera entregado, así que `processStripeWebhookEvent` (`stripePaymentsService.ts`) se reusa sin cambios sea cual sea el origen. Sin filtro de `type` en la request — se filtra client-side en esa misma función.
- Stripe acepta bodies `application/x-www-form-urlencoded` (nunca JSON) con notación de corchetes para objetos anidados (`toFormPairs()`, helper interno) — a diferencia de Paddle/Mercado Pago, que sí toman JSON.

### `src/lib/rateLimit.ts`
- **AUTH_RATE_LIMIT** (const) — 5 intentos / 15 min, más estricto que el default por ser blanco de fuerza bruta.
- **isRateLimited(key, options?)** — chequeo genérico de rate limit por key (IP, endpoint, etc.).

### `src/lib/turnstile.ts`
- **verifyTurnstileToken(token, remoteIp?)** — valida un captcha de Cloudflare Turnstile server-side.

### `src/modules/auth/authService.ts`
- **newSessionExpiry()** — fecha de expiración deslizante de una sesión.
- **hashPassword(password)** / **verifyPassword(password, storedHash)** — hashing/verificación.
- **isPasswordValid(password)** — reglas de complejidad de contraseña.
- **isPhoneValid(phone)** — validación de teléfono.
- **registerUser(input)** — alta de usuario suelto (no tenant nuevo — ver `tenantService.registerTenantWithOwner` para eso).
- **loginUser(input)** — login, crea sesión.
- **authenticateToken(token)** — resuelve un token de sesión a su `User`, con `tenant: {id, status} | null` incluido (2026-08-18) para que `validateSession` pueda gatear por status de tenant sin un round-trip extra, y desde 2026-09 con `roleContext: RoleContext` (ver `roleService.ts` abajo) resuelto en el mismo call — todavía sin consumidores reales (Fase A del sistema de Custom Roles), así que se descarta explícitamente antes de `sanitizeUser` en `GET /api/auth/me` (`routes/auth.ts`) para no serializar un `Set`/`Map` como `{}` en la respuesta.
- **logoutUser(token)** — revoca una sesión.
- **updateOwnProfile(userId, input)** / **changeOwnPassword(...)** — auto-gestión del propio usuario.
- **requestPasswordReset(email)** (2026-08-09) — nunca revela si el email existe (misma respuesta genérica siempre); si existe, invalida cualquier `PasswordResetToken` sin usar de esa persona y crea uno nuevo (1h de expiración), dispara `sendPasswordResetEmail` best-effort.
- **validatePasswordResetToken(token)** — chequeo de solo lectura (existe/no usado/no vencido) para que el frontend pueda avisar "este link venció" antes de que la persona escriba la contraseña nueva.
- **resetPassword(token, newPassword)** — valida el token (mismo chequeo de 3 pasos que `validatePasswordResetToken`) + `isPasswordValid`, y en una transacción: actualiza `passwordHash`, marca el token usado, **borra todas** las sesiones del usuario (a diferencia de `changeOwnPassword`, que preserva la sesión actual) y crea una sesión nueva.

### `src/modules/auth/permissionService.ts`
Todas son `(role: RoleContext) => boolean` (Fase B, Custom Roles — antes tomaban el enum `UserRole`
directo; `role.isOwner` cortocircuita cualquier función a `true`, un owner nunca tiene filas de
permiso propias). La fuente de verdad de qué puede hacer cada rol:
**canViewHr**/**canCreateHr** (legacy — solo `Client`/onboarding, ver más abajo),
**canViewEmployee**/**canManageEmployee**, **canViewCompany**/**canManageCompany**,
**canViewContact**/**canManageContact** (Fase B: reemplazan el `canViewHr`/`canCreateHr` que antes
gateaba Employee/Company/Contact/Opportunity todos juntos — separados para que field-level/scope
por entidad tengan sentido), **canViewOpportunity** (derivado, `canViewCompany && canViewContact`
— nunca un permiso propio: quien no puede ver Contacts o Companies no ve nada de Sales),
**canManageOpportunity** (permiso propio + exige `canViewOpportunity` como prerrequisito),
**canManageCustomFields**, **canInviteUsers**, **canManageUsers**, **canManagePayroll** (owner-only,
a diferencia del resto — ver Payroll en `docs/spec-payroll.md`), **canManageBilling** (owner-only,
mismo criterio que Payroll — Subscription Plans, `docs/spec-subscription-plans.md`),
**canManagePayments** (owner-only, 2026-08-26 — Payments v1, `docs/tareas/specpaymentsv1.md`:
conectar el Stripe del tenant y ver pagos de sus Companies), **canViewSalesLeaderboard** (owner-only),
**canViewActivityLog** (owner/admin, 2026-08-30 — Activity Log, `docs/general/spec-activity-log.md`:
ver el feed tenant-wide de Settings; el tab del modal por registro no tiene gate propio),
**canManageTenantSettings** (Fase B, reemplaza el inline check de `PATCH /api/tenants/current` —
moneda del tenant), **canManageSharedViews** (Fase B, reemplaza el inline `canManageShared` de
`savedViewService.ts` — crear una Saved View compartida), **canDecideTimeOff** (Fase B, el
componente por-rol de aprobar/rechazar Time Off — `timeOffRequestService.ts` sigue OR-eándolo con
"es el manager asignado", una regla por relación que no se reemplaza por un permiso).

### `src/modules/auth/roleService.ts` (Custom Roles, `docs/tareas/backlog.md` "Sistema de roles custom", Fase A-B, 2026-09)
- **seedDefaultRolesForTenant(tx, tenantId)** — crea los 3 roles semilla (Owner/Admin/Member) de un
  tenant usando `ADMIN_SEED_PERMISSIONS`/`MEMBER_SEED_PERMISSIONS` (listas exportadas, fuente única
  compartida con el backfill de Fase B — reproducen el comportamiento actual exacto). Idempotente.
  Llamada desde `registerTenantWithOwner` (tenant nuevo) y `scripts/backfill-custom-roles.ts`
  (tenants existentes).
- **loadRoleContext(roleId)** / **resolveRoleContextForUser({roleId, role, tenantId})** — resuelven
  un `RoleContext` real desde `Role`+`RoleModulePermission`+`RoleFieldRestriction`; el segundo
  agrega 2 fallbacks (Role semilla por nombre, y por último `legacyRoleContext` sin DB) para que
  nada se rompa antes de que el backfill corra en un ambiente dado.
- **findSeedRoleId(tenantId, userRole)** (Fase B) — resuelve el id del Role semilla de un tenant
  que corresponde a un valor del enum legacy `UserRole`. Usado por `tenantUserService.ts` e
  `invitationService.ts` para mantener `User.roleId`/`Invitation.roleId` sincronizados cada vez que
  todavía escriben `role` (el enum) directamente — hasta que Fase I los rediseñe para aceptar un
  `roleId` de cualquier rol custom, no solo los 3 semilla.
- **getEmployeeScope(role)** — lee cuál de los 3 permisos `view_employee_scope:*` tiene el rol
  (`self`/`department`/`all`/`none`) — todavía sin ningún consumidor real (Fase E la aplica a
  `listEmployees`).
- **PERMISSION_KEYS** — allowlist completo de strings de permiso válidos, fuente de verdad para
  cuando exista un endpoint de edición de roles (Fase H). **ADMIN_SEED_PERMISSIONS**/
  **MEMBER_SEED_PERMISSIONS** — qué permisos concretos arma cada uno, importadas también por
  `scripts/backfill-fase-b-permissions.ts` para no duplicar la lista.

### `src/modules/activity/activityLogService.ts` (Activity Log, `docs/general/spec-activity-log.md`, 2026-08-30)
Mecanismo genérico reusado por cada módulo que registra actividad — un solo punto de escritura en vez de que cada service arme su propio formato de diff/summary.
- **diffEntity(before, after, fieldConfig)** — compara dos snapshots campo por campo según un `ActivityFieldConfigMap` (label + `resolve?` opcional para FKs/ids), devuelve `{field, label, oldValue, newValue}[]` ya con valores resueltos a texto legible. Mismo mecanismo para las 3 acciones: create diffea contra `before: null` (todo se ve como "set"), delete contra `after: null` ("cleared"), update entre dos snapshots reales.
- **summarizeChanges(changes, action, entityType, entityLabel)** — arma el `summary` de una línea (create/delete no listan campos; 1 cambio → "Changed X: A → B"; 2 → "Changed X and Y"; 3+ → "Changed X, Y and N more").
- **recordActivity(input)** — diff + summary + `prisma.activityLogEntry.create`, envuelto en `bestEffort()` (`src/lib/bestEffort.ts`) — nunca rompe ni bloquea la operación real que lo llama. Un `update` sin cambios reales no escribe nada.
- **listActivityForEntity(tenantId, entityType, entityId)** — feed del tab de Activity de un registro (Employee/Company/Contact/Opportunity); ownership de `entityId` se valida en la ruta, esta función confía en el caller (mismo criterio que `listNotesForEntity`). Matchea por `(entityType, entityId)` **o** `(parentEntityType, parentEntityId)` (fix 2026-08-30) — así una Task/Note/Tag adjunta a este registro aparece también.
- **listActivityFeed(input)** — feed tenant-wide de Settings, paginado por cursor `(changedAt, id)` — filtros por `entityType`/`userId`/`action`/`from`/`to`.

### `src/modules/activity/customFieldActivity.ts` (2026-08-30)
- **recordCustomFieldValueActivity(input)** — un valor de custom field creado/editado/borrado en Employee/Company/Contact se registra como una entrada `update` de Activity Log contra la entidad **dueña** (no como su propio tipo de entidad) — arma un record sintético de un solo campo y lo pasa por `diffEntity` como cualquier otro. Llamado desde `routes/employees.ts`/`companies.ts`/`contacts.ts`, no desde `customFieldService.ts` (ese archivo también sirve `client`/`ticket`/`idea`, fuera del alcance de Activity Log Tier 1).

### `src/modules/activity/fieldConfigs/` (2026-08-30, Activity Log Unidad 2)
- **resolvers.ts** — `resolveUserName`/`resolveEmployeeName`/`resolveStatusName`/`resolveCatalogName`/`resolveCompanyName`/`resolvePipelineName`/`resolveStageName` (todas `(id) => Promise<string | null>`, consultan Prisma directo, no el service layer — evita ciclos de import con managerId/parentCompanyId self-referenciales) + `resolveMoney(cents, record)` (usa `record.currency`, mismo formato que `frontend/src/lib/currencies.ts`'s `formatMoney`).
- **employeeFieldConfig.ts** / **companyFieldConfig.ts** / **contactFieldConfig.ts** / **opportunityFieldConfig.ts** — un `ActivityFieldConfigMap` por entidad Tier 1, consumido por su service homónimo. `employeeDisplayName`/`contactDisplayName` (helpers de `${firstName} ${lastName}`) también exportados desde acá, reusados por las rutas para el `entityLabel` de los custom field values.

### `src/modules/clients/clientService.ts` (módulo legado, ver `features-overview.md`)
CRUD estándar: **createClient**, **listClients(tenantId)**, **findClientById(id)**, **updateClient(id, input, changedByUserId)**, **deleteClient(id)**.

### `src/modules/crm/companyService.ts`
CRUD estándar: **createCompany(input, changedByUserId)**, **listCompanies(tenantId)**, **findCompanyById(id)**, **updateCompany(id, input, changedByUserId)**, **deleteCompany(id, changedByUserId, options?)**. Los 3 de escritura registran una entrada en Activity Log (`docs/general/spec-activity-log.md`, 2026-08-30) vía `companyActivityFieldConfig`.

### `src/modules/crm/contactService.ts`
CRUD estándar: **createContact(input, changedByUserId?)**, **listContacts(tenantId)**, **findContactById(id)**, **updateContact(id, input, changedByUserId)**, **deactivateContact(id, changedByUserId)** (soft-delete, Sales v2 — reemplazó el `deleteContact` legado). Los 3 de escritura registran Activity Log vía `contactActivityFieldConfig` — `createContact` no loguea si `changedByUserId` viene vacío (caso de `publicFormService.ts`, sin usuario autenticado).

### `src/modules/crm/opportunityService.ts`
- CRUD estándar: **createOpportunity(input, changedByUserId?)**, **listOpportunities(tenantId)**, **findOpportunityById(id)**, **updateOpportunity(id, tenantId, input)** (`input.changedByUserId` opcional), **deleteOpportunity(id, changedByUserId)**. Los 3 de escritura registran Activity Log vía `opportunityActivityFieldConfig` — mismo criterio de `changedByUserId` opcional en `create` que `contactService.ts`.
- **addOpportunityContact(tenantId, opportunityId, contactId, role?)** / **removeOpportunityContact(opportunityId, contactId)** — relación N:N Opportunity↔Contact.
- **listOpportunityStageHistory(tenantId, opportunityId)** — historial de cambios de stage.

### `src/modules/crm/pipelineService.ts`
- **seedDefaultPipelines(tx, tenantId)** — pipelines + stages default al crear un tenant (IDs generados client-side para no depender de que `createMany` devuelva filas).
- CRUD de pipeline: **createPipeline**, **listPipelines(tenantId)**, **findPipelineById(id)**, **updatePipeline(id, tenantId, input)**.
- CRUD de stage: **createPipelineStage**, **findPipelineStageById(id)**, **updatePipelineStage(...)**.

### `src/modules/crossModule/entityLookup.ts`
- **isSupportedCrossModuleEntityType(entityType)** — type guard de `EntityType`.
- **findEntityTenantId(entityType, entityId)** — resuelve el tenant dueño de una entidad polimórfica (Task/Note/Tag apuntan a Employee/Company/Contact/Opportunity sin FK real) — chequeo anti-IDOR obligatorio antes de adjuntar un Task/Note/Tag a algo.

### `src/modules/crossModule/tagService.ts` (backlog QA, 2026-08-27)
- Reexporta **findEntityTenantId**/`isSupportedCrossModuleEntityType` (como `isSupportedTagEntityType`) de `entityLookup.ts` — mismo chequeo anti-IDOR que Task/Note.
- **listTagDefinitions(tenantId)** — todos los nombres de tag usados alguna vez en el tenant, para el autocomplete del input (tags libres, no hay catálogo predefinido).
- **listTagsForEntity(tenantId, entityType, entityId)** / **listTagsForEntities(tenantId, entityType, entityIds)** (batch, misma forma que `listCustomFieldValuesForEntities`).
- **assignTag(tenantId, entityType, entityId, tagName)** — find-or-create por nombre exacto (`@@unique([tenantId, name])`) + asignación, en un solo paso; idempotente si la entidad ya tiene ese tag.
- **findTagAssignmentById(id)** / **removeTagAssignment(id)**.

### `src/modules/csv/csvService.ts`
Export/template always include every active custom field of the tenant for that entity type, appended after the fixed base columns — the template is meant to be a complete "fill this out" example, not just the base fields.
- **exportEmployeesToCsv(tenantId)** / **getEmployeesCsvTemplate(tenantId)** / **importEmployeesFromCsv(tenantId, csvText, changedByUserId)** — includes Person Type/Nationality/Birthdate (2026-08-31); Country of Residence deliberately excluded (self-service only, set via `contractConfirmationService.ts`, never by the owner/admin). Import wires `changedByUserId` through to `createEmployee`/`recordCustomFieldValueActivity` so imported rows show up correctly attributed in the Activity Log.
- **exportCompaniesToCsv(tenantId)** / **getCompaniesCsvTemplate(tenantId)** / **importCompaniesFromCsv(tenantId, csvText, changedByUserId)** (2026-08-31) — `createCompany` requires a linked Contact, so each row resolves "Primary Contact Email" against an existing Contact or, given First/Last Name too, creates one inline (and flags it `isPrimary` so the column round-trips on export); Parent Company/Account Owner match by name/email, lenient (left unlinked if not found); Company Size auto-creates a `FieldCatalogDefinition` like Department/Job Title. Status is export-only, never accepted on import (derived from Opportunity/Contract events).
- **exportContactsToCsv(tenantId)** / **getContactsCsvTemplate(tenantId)** / **importContactsFromCsv(tenantId, csvText, changedByUserId)** (2026-08-31) — Company matches by name, lenient (contact created unlinked if not found, since `companyId` is genuinely optional); Lead Source auto-creates a catalog entry. Export excludes deactivated (`isActive: false`) contacts, same default as `listContacts()`.
- **exportClientsToCsv(tenantId)** / **getClientsCsvTemplate(tenantId)** / **importClientsFromCsv(tenantId, csvText)** — legacy `Client` model, deliberately not extended (out of scope, on track for full decommission per `docs/tareas/backlog.md`).

### `src/modules/hr/customFieldService.ts`
- **isValueValidForFieldType(...)** — valida un valor contra el `fieldType` de su definición.
- **createCustomFieldDefinition**, **setCustomFieldDefinitionActive**, **updateCustomFieldDefinition** (nota: `fieldType` no es editable a propósito — cambiarlo podría dejar valores guardados que ya no matchean), **findCustomFieldDefinitionById**, **listCustomFieldDefinitions**.
- **createCustomFieldValue**, **findCustomFieldValueById**, **updateCustomFieldValue**, **deleteCustomFieldValue**, **listCustomFieldValuesForEntity**, **listCustomFieldValuesForEntities**.

### `src/modules/hr/contractConfirmationService.ts` (Payroll, Unidad 7)
- **getContractConfirmationDetails(token)** — read model público para `/confirm-contract/:token`: datos read-only del contrato (owner) + catálogo de métodos de pago para el select editable.
- **confirmContract(input)** — valida, cifra los datos de cuenta (`encryptPaymentAccountData`), genera el PDF firmado (`contractPdfService.renderContractPdf`), y en una transacción: crea el `User` (nombre copiado del `Employee`, nunca re-pedido), vincula `Employee.userId`, guarda `countryOfResidence`, completa la `EmployeeCompensation` (método de pago + `confirmedAt`/`confirmedIp`/`contractPdf`), marca la `Invitation` `accepted`, crea la `Session` — la persona queda logueada de una. Después del commit, dispara (best-effort) `sendContractSignedEmail` al firmante con copia al owner y a `createdByUserId`.

### `src/modules/hr/contractPdfService.ts` (Payroll, 2026-08-08 — feedback del usuario)
- **renderContractPdf(input)** — arma el PDF (`pdf-lib`, mismo estilo que `payslipService.ts`) con los términos del contrato; `signed: false` lo marca "DRAFT — PENDING SIGNATURE", `signed: true` agrega el bloque de confirmación (fecha/hora/IP) y lo marca "SIGNED". Se llama dos veces por contrato: al crearlo (borrador) y al confirmarlo (firmado, sobrescribe la misma columna).
- **getEmployeeContractPdf(tenantId, employeeId)** — el PDF *guardado* (no lo regenera) de la compensación más relevante de la persona (la vigente, o la más reciente si no hay ninguna abierta).
- **resendEmployeeContract(tenantId, employeeId, actingUserId)** — reenvía lo que esté guardado ahora mismo: si no está firmado, reusa la invitación pendiente (o crea una nueva si venció) + el borrador adjunto; si ya está firmado, reenvía el firmado al usuario vinculado con copia al owner y a quien lo cargó.
- **getEmployeeCompensationSummary(tenantId, employeeId)** — read model de la compensación *vigente* (`effectiveTo: null`) de la persona, sin datos sensibles (nunca `paymentAccountDataEncrypted` ni los bytes del PDF) — feedback del usuario 2026-08-08: el contrato cargado en el alta no se veía en ningún lado del panel de detalle, solo dentro del PDF generado. Alimenta la sección "Compensation" de `EmployeeOverviewPanel.tsx`.

### `src/modules/hr/employeeCompensationService.ts` (Payroll, Unidad 5/10)
- **createCompensation(input)** — única función que crea una fila de `EmployeeCompensation`: cierra la vigente anterior (`effectiveTo`), calcula `blocksParticipation` (true solo si es la primera de la persona), genera y guarda el PDF borrador (`contractPdfService.renderContractPdf`), y dispara la invitación de confirmación de contrato (Unidad 6, con el borrador adjunto) si corresponde.
- **createCompensationBulk(input)** — asignación/reasignación masiva (Unidad 10): un `createCompensation` por entrada, nunca deriva el monto del anterior.
- **getCompensationStatus(tenantId)** — cada Contractor/Employee con su compensación vigente (o `null`) + `isConfirmed` (si alguna vez confirmó su primer contrato, vía `userId` — no `confirmedAt` de la fila actual, que nunca se vuelve a setear en una reasignación), para las sub-pestañas Draft/Confirmed de Asignaciones.
- **listTerminatedCompensations(tenantId)** — toda fila de `EmployeeCompensation` ya cerrada (`effectiveTo` seteado, superada por una reasignación) — sub-pestaña "Terminated" de Asignaciones (2026-08-08, feedback del usuario). Una persona puede aparecer más de una vez si tuvo varios contratos.
- **findCompensationById(id)**.

### `src/modules/hr/employeeService.ts`
- **createEmployee(input, changedByUserId?)**, **listEmployees(tenantId)** (suma `contractStatus` por fila — Unidad 11), **findEmployeeById(id)**, **findEmployeeByUserId(userId)**, **updateEmployee(id, input, changedByUserId)**, **deleteEmployee(id, changedByUserId)**. Los 3 de escritura registran Activity Log (`docs/general/spec-activity-log.md`, 2026-08-30) vía `employeeActivityFieldConfig` — `changedByUserId` opcional solo en `createEmployee`: solo la ruta directa (`POST /api/hr/employees`) lo pasa hoy, así que solo esa genera entrada; CSV import, onboarding seed data y `publicFormService.ts` la llaman sin ese argumento a propósito (scope cut de Unidad 2, ver el spec) y no generan ninguna.
- **wouldCreateManagerCycle(...)** — camina la cadena de `managerId` hacia arriba para detectar un ciclo antes de asignar un manager nuevo.
- **listEmployeeBirthdaysForCalendar(tenantId)** (2026-08-22) — todo empleado con `birthdate` no nulo, para el calendario del Overview. Mismo criterio "devolver todo, filtrar en el frontend" que `listTasksForCalendar`/`listTimeOffRequestsForCalendar`.

### `src/modules/hr/payrollRunService.ts` (Payroll, Unidad 12/13/16/17)
- **createRun(input)** — preload automático: toda persona Contractor/Employee con `EmployeeCompensation` vigente en la frecuencia elegida, excluyendo a quien tenga el primer contrato sin confirmar (`blocksParticipation`+`confirmedAt: null`, Unidad 9).
- **getRunDetail(tenantId, runId)** — entries agrupadas por persona (base + ajustes), badge de compensación, `isInactive` contra el status default del tenant, conteo de excluidos, y si falta cargar alguna hora.
- **addEmployeeToRun(...)** — excepción manual, solo mientras el run esté `draft`.
- **confirmRun(tenantId, runId)** — bloquea si falta cargar horas de algún `base` hourly (Unidad 15); `draft` → `confirmed`.
- **findRunById(id)**, **listRuns(tenantId)**.

### `src/modules/hr/payrollEntryService.ts` (Payroll, Unidad 14/15)
- **createAdjustment(input)** — bono/comisión/reembolso/deducción, solo mientras el run esté `draft`.
- **deleteEntry(tenantId, entryId)** — solo si el run sigue `draft`.
- **updateEntryHours(tenantId, entryId, hoursQty)** — recalcula `amountCents` contra la tarifa horaria vigente de la persona.

### `src/modules/hr/payrollOffPaymentService.ts` (Payroll, Unidad 18/19)
- **createOffPayments(input)** — un `PayrollEntry` independiente (`runId: null`) por persona seleccionada.
- **listOffPayments(tenantId)** — para la línea de tiempo unificada.

### `src/modules/hr/payslipService.ts` (Payroll, Unidad 20)
- **buildPayslipForRunEmployee(tenantId, runId, employeeId)** / **buildPayslipForEntry(tenantId, entryId)** — arman el PDF de preview (`pdf-lib`) a partir de las entries de una persona en un run, o de una entry suelta. Marcado "PREVIEW — NOT ISSUED" en el PDF mismo, no solo en la UI.

### `src/modules/hr/employeeTimeOffPolicyService.ts`
- **listEmployeeTimeOffPolicies(tenantId, employeeId)**, **assignTimeOffPolicyToEmployee(...)**, **unassignTimeOffPolicyFromEmployee(...)**.

### `src/modules/hr/fieldCatalogService.ts` (catálogos configurables: Department, Job Title, etc.)
- **listFieldCatalogDefinitions(...)**, **findFieldCatalogDefinitionById(id)**, **createFieldCatalogDefinition(...)**, **updateFieldCatalogDefinition(...)**.
- **findOrCreateFieldCatalogDefinition(...)** — find-or-create por nombre, usado por el backfill de Department y por submissions de Public Form que referencian un catálogo que puede no existir todavía.

### `src/modules/hr/payFrequencyService.ts` (catálogo configurable: Payroll)
- **seedDefaultPayFrequencies(tx, tenantId)** — 5 políticas estándar al crear un tenant (Semanal, Semi-mensual ×2, Mensual ×2).
- **createPayFrequency(...)**, **listPayFrequencies(tenantId)**, **listPayFrequenciesWithAssignedCount(tenantId)** (suma cuántas `EmployeeCompensation` vigentes usan cada una), **findPayFrequencyById(id)**, **updatePayFrequency(...)**.

### `src/modules/hr/paymentMethodService.ts` (catálogo chico: Payroll)
- **seedDefaultPaymentMethods(tx, tenantId)** — Wire transfer/Payoneer/Wise/PayPal al crear un tenant.
- **createPaymentMethod(...)**, **listPaymentMethods(tenantId)**, **findPaymentMethodById(id)**, **updatePaymentMethod(...)**.

### `src/modules/hr/publicFormService.ts`
- **createPublicForm(input)**, **listPublicForms(tenantId)**, **getTenantSlug(tenantId)**, **updatePublicForm(...)**.
- **findActivePublicForm(tenantSlug, formSlug)** — lookup público, sin contexto de tenant/auth (solo los 2 slugs de la URL).
- **submitPublicForm(...)** — procesa una submission (matching de Company por dominio de email, etc.).

### `src/modules/hr/savedViewService.ts`
CRUD estándar: **createSavedView**, **listSavedViews(...)**, **findSavedViewById(id)**, **updateSavedView(...)**, **deleteSavedView(...)**.

### `src/modules/hr/statusService.ts`
- **seedDefaultStatusDefinitions(tx, tenantId)** — statuses default al crear un tenant.
- **getDefaultStatusId(tenantId, entityType)**.
- **createStatusDefinition**, **listStatusDefinitions(...)**, **findStatusDefinitionById(id)**, **updateStatusDefinition(...)**.
- **recordStatusChange(input)** — escribe una fila en `StatusHistoryEntry`.

### `src/modules/hr/terminationService.ts` (baja de empleados — status change, no delete)
- **createTermination(input)** — valida no-duplicado, arma la lista completa de reasignaciones de reportes directos, crea el pago final off-cycle si se incluyó (reusa `payrollOffPaymentService.createOffPayments`), y ejecuta de inmediato si `terminationDate <= hoy`.
- **cancelTermination(terminationId, tenantId)** — solo antes de `executedAt`; idempotente si ya cancelada.
- **runScheduledTerminations()** — cron diario (10am), ejecuta las bajas vencidas; una falla no frena a las demás.
- **listDirectReports(employeeId)**, **getLatestTermination(employeeId)** — el registro no-cancelado más reciente (ejecutado o programado).

### `src/modules/hr/timeOffBalanceService.ts`
- **calculateEmployeeTimeOffBalances(tenantId, employeeId)** / **calculateAllTimeOffBalances(tenantId)** — allocated/used/pending/remaining por política, con prorrateo mensual o fijo anual según `accrualMethod`.

### `src/modules/hr/timeOffPolicyService.ts`
CRUD estándar: **createTimeOffPolicy**, **listTimeOffPolicies(tenantId)**, **findTimeOffPolicyById(id)**, **updateTimeOffPolicy(...)**.

### `src/modules/hr/timeOffRequestService.ts`
- **createTimeOffRequest(input)** — valida fechas + asignación de política, auto-aprueba si la política no requiere aprobación. Desde 2026-08-22, dispara `syncTimeOffCalendarEvent` (best-effort) si el resultado ya nace `approved`.
- **listMyTimeOffRequests**, **listPendingApprovals**, **listTimeOffRequestsForCalendar**, **listAllTimeOffRequests**.
- **findActiveTimeOffRequestsForEmployees(tenantId, employeeIds)** — solo solicitudes activas *hoy*, no el historial completo.
- **decideTimeOffRequest(...)** / **cancelTimeOffRequest(...)** — ambas disparan `syncTimeOffCalendarEvent` (best-effort) tras la escritura.

### `src/modules/integrations/googleCalendarAuthService.ts` (2026-08-22)
- **googleCalendarConfigured()** — chequea que `GOOGLE_CALENDAR_CLIENT_ID`/`CLIENT_SECRET`/`REDIRECT_URI`/`GOOGLE_TOKEN_ENCRYPTION_KEY` estén seteados; mismo patrón best-effort que `mailerConfigured()` en `lib/mailer.ts`.
- **buildGoogleAuthUrl(userId, tenantId)** — crea el `GoogleOAuthState` de un solo uso y arma la URL de consentimiento (`scope: calendar.events` únicamente).
- **handleGoogleOAuthCallback(code, state)** — valida el `state` (≤10 min, un solo uso), intercambia el code por tokens, upsert de `GoogleCalendarConnection` (tokens encriptados vía `lib/googleTokenEncryption.ts`). Registra Activity Log (`recordActivity`, `stateRow.userId` como actor — real y disponible ahí mismo, sin necesitar `validateSession`) — Activity Log Unidad 6, 2026-08-31.
- **getGoogleCalendarConnectionStatus(userId)**, **disconnectGoogleCalendar(userId)** (revoca best-effort + borra la fila, y registra Activity Log como `action: 'delete'` con `userId` como actor).
- **getAuthorizedClientForUser(userId)** — cliente `calendar_v3.Calendar` ya autorizado, o `null` si el usuario nunca conectó/necesita reconectar (no-op silencioso para quien llama). Persiste el access token refrescado automáticamente vía el evento `tokens` de `google-auth-library`.
- **markNeedsReconnectIfRevoked(userId, err)** — si el error es `invalid_grant`, marca `needsReconnect: true` en la conexión.

### `src/modules/integrations/googleCalendarSyncService.ts` (2026-08-22, rediseño de Time Off 2026-08-23)
- **syncTaskCalendarEvent(previous, current)** — sync unidireccional (Northstack → Google) del Task al calendario de su `assigneeId` únicamente (personal, 1 registro → 1 evento). Best-effort, nunca tira. Llamada desde `taskService.ts` tras create/update/delete. Usa `taskEventBody` (no exportada) para decidir evento de todo el día (`dueDate` en medianoche UTC exacta, sin hora elegida) vs. evento con hora (`dueDate` con hora real, bloque de 1h fijo en el calendario) — 2026-08-23, pedido de Alejandro tras ver que Google Calendar da mejor perspectiva con hora que solo con el día.
- **syncTimeOffCalendarEvent(previous, current)** — a diferencia de Tasks, es de todo el equipo: sincroniza a **todos** los `GoogleCalendarConnection` del tenant, no solo al de la persona que se toma la licencia (decisión explícita de Alejandro, 2026-08-23, mismo criterio que la vista compartida del Overview). Internamente delega en `syncTimeOffEventForViewer` (no exportada) por cada usuario conectado. Llamada desde `timeOffRequestService.ts` tras create/decide/cancel.
- **backfillCalendarSyncForUser(userId, tenantId)** — corre una sola vez, justo al conectar, para sincronizar lo que ya estaba pendiente (Tasks propios + **todo** el Time Off aprobado del tenant, no solo el propio) — sin esto, sync reactivo nunca mira para atrás. Llamada desde `googleCalendarIntegration.ts`'s callback route tras un connect exitoso.

### `src/modules/integrations/googleCalendarWatchService.ts` (2026-08-23)
Leg inversa (Google → Northstack) de Task sync, solo Tasks — ver el comentario largo al principio del archivo para el por qué (Time Off queda afuera, notificaciones de Google no traen datos, prevención de loop de sync).
- **openWatchChannelForUser(userId)** — abre/renueva un canal de notificaciones (`events.watch`), best-effort. Llamada desde el callback de OAuth (`googleCalendarAuthService.ts` vía la ruta) al conectar, y desde `renewExpiringWatchChannels` para renovar.
- **stopWatchChannelForUser(userId)** — cierra el canal en Google (best-effort) y borra la fila local. Llamada desde la ruta de disconnect.
- **processInboundCalendarChanges(userId)** — ante una notificación real (no el handshake `sync`), pide el diff vía `events.list(syncToken)`, persiste el `syncToken` nuevo, y aplica cada cambio con `prisma.task.update` directo (nunca `taskService.updateTask` — evita re-disparar el sync de salida sobre el mismo cambio). Un evento borrado en Google **marca la Task completada** (2026-08-23, corregido tras probar — antes solo le limpiaba la fecha) y agrega una nota a la descripción registrando que fue por borrado en Google, no un check manual; la Task nunca se borra, solo se completa.
- **renewExpiringWatchChannels()** — corrida diaria vía el cron `/api/internal/google-calendar-channels/renew` (`src/routes/internal.ts`); los canales de Google no se renuevan in-place, así que cierra y vuelve a abrir cada uno que vence dentro de 48hs.
- No llamar ninguna de las tres desde otro lugar sin releer la tabla de decisión de cada una en el archivo (reasignación de assignee, completar/borrar, cambio de status de Time Off).

### `src/modules/integrations/stripeService.ts` (Payments v1, `docs/tareas/specpaymentsv1.md`, Unit 1 — 2026-08-26)
Conexión de un tenant a su propia cuenta de Stripe. Unidades 2-4 (lookup, resúmenes en vivo, webhook) agregan sus propias funciones acá cuando se construyan, no descritas todavía.
- **detectApiKeyMode(apiKey)** — `test`/`live` por el prefijo (`sk_`/`rk_` + `_test_`/`_live_`); tira un error legible si la key no matchea ninguno de los dos, antes de intentar cualquier llamada de red.
- **connectStripe({ tenantId, userId, apiKey })** — valida contra Stripe real (`retrieveAccount`, con fallback a `listCustomers` si la Restricted Key no tiene permiso de leer Account — ver `stripe.ts`), cifra, `upsert` de `StripeConnection` por `tenantId`. Reconectar (tenant ya tenía una fila, disconnected o no) reusa el mismo `upsert`, nunca crea una segunda fila. Registra Activity Log (`userId` como actor, ya era parámetro) — Activity Log Unidad 6, 2026-08-31.
- **getStripeConnectionStatus(tenantId)** — versión saneada para el frontend (nunca el key cifrado). Una conexión con `disconnectedAt` seteado se reporta como `connected: false`, sin borrar la fila.
- **disconnectStripe(tenantId, userId)** — soft (`disconnectedAt`, mismo criterio que `Contact.isActive`/`Opportunity.isActive` del rediseño de Sales v2) — nunca borra la fila. Idempotente: llamarlo sin conexión activa (nunca conectado, o ya desconectado) es un no-op, no un crash de Prisma. **2026-08-31**: sumó `userId` (antes solo `tenantId`) — el route handler ya lo tenía en scope, solo faltaba pasarlo. Registra Activity Log como `action: 'delete'` (no `'update'` diffeando `disconnectedAt`, que no está en el field config y produciría un diff vacío descartado en silencio).
- **getActiveConnectionForTenant(tenantId)** (2026-08-26) — desencripta la key y devuelve también `apiKeyMode` (Units 2-4 lo necesitan para armar el link correcto a `dashboard.stripe.com/{test/}...`). Tira si no hay conexión activa. **getApiKeyForTenant(tenantId)** es un wrapper delgado que solo devuelve la key, sin romper el contrato que ya usaban los tests de Unit 1.
- **markNeedsAttention(tenantId)** — para cuando Units 2-4 detecten un 401/403 real de Stripe contra una key ya guardada (key revocada/editada del lado de Stripe) — nunca falla silenciosamente, deja la conexión visible como "necesita atención" en vez de que las lecturas fallen sin explicación.

### `src/modules/integrations/stripePaymentsService.ts` (Payments v1, `docs/tareas/specpaymentsv1.md`, Units 2-4 — 2026-08-26, Unit 4 rediseñada 2026-08-28)
Lookup/matching Company↔Stripe Customer, visibilidad de pagos en vivo (sin store local), y las notificaciones proactivas (Unit 4 — ver `runStripeEventPolling` abajo). El ownership de la Company (tenantId) se valida en la ruta (`routes/payments.ts`) para Units 2-3 — estas funciones reciben una Company ya validada. `processStripeWebhookEvent` resuelve la Company él mismo por `stripeCustomerId`, porque no parte de una sesión/ownership check — ni el cron ni (antes) el webhook tienen uno.
- **searchStripeCustomersForCompany(tenantId, companyId)** — itera el email de cada Contact activo de la Company contra `listCustomers` (nunca por dominio), consolida duplicados por `customer.id` quedándose con el primer Contact que lo encontró.
- **linkCompanyToStripeCustomer({ companyId, stripeCustomerId, matchedViaEmail })** — solo persiste; el chequeo de "ya vinculado a otro customer, pedir confirmación" (409) vive en la ruta, que ya tiene la Company cargada.
- **getCompanyPaymentSummary(tenantId, company)** — "sin vincular" sin tocar Stripe si `company.stripeCustomerId` es null. Si no, `listCharges`/`listSubscriptions` en paralelo; payments/refunds/disputes/failed salen todos de la misma lista de Charges (`status === 'succeeded'` / `amount_refunded > 0` / `charge.disputed` / `status === 'failed'`), nunca de endpoints separados (ver `lib/stripe.ts`). `subscriptionStatus` prioriza active/trialing/past_due sobre lo primero que devuelva Stripe. `firstPaymentAt` es el `created` más antiguo entre los cargos exitosos ya traídos.
- **getCompanyPaymentEvents(tenantId, company, cursor?)** — paginado nativo de Stripe (`starting_after`), cada Charge se clasifica en `charge_failed`/`charge_refunded`/`charge_succeeded` y trae su propio `dashboardUrl` (con o sin `/test/` según `apiKeyMode`) y `receiptUrl` (el `receipt_url` nativo del Charge, `null` si no aplica).
- **getPaymentsOverview(tenantId)** — chequea la conexión una sola vez antes del fan-out (si no hay conexión activa, devuelve `connected: false` sin intentar ninguna Company, en vez de N fallas idénticas); trae las Companies con `stripeCustomerId` no nulo, `summary` de cada una en paralelo con un límite de concurrencia (`mapWithConcurrency`, helper interno hand-rolled — sin dependencia `p-limit`, mismo criterio de "no SDK/paquete nuevo para algo chico" que el resto de esta spec), agrega totales.
- Toda llamada real a Stripe en este archivo pasa por `withNeedsAttentionTracking` (helper interno) — un 401/403 marca la conexión antes de relanzar el error, igual que Unit 1.
- **notifyCompanyStripeEvent(tenantId, company, type, message)** / **processStripeWebhookEvent(tenantId, event)** (Unit 4) — la segunda decide qué notificar para cada tipo de Event de Stripe (`charge.refunded`/`charge.failed`/`payment_intent.payment_failed`/`customer.subscription.updated`(→`past_due`)/`customer.subscription.deleted`), la primera resuelve el destinatario (`Company.accountOwnerId`, si no el primer owner activo — nunca un admin, Payments es owner-only). Agnóstica de cómo llegó el Event — la usa tanto el cron (`runStripeEventPolling`) como, hasta 2026-08-28, el webhook ya eliminado.
- **runStripeEventPolling()** (Unit 4, rediseñada 2026-08-28 — reemplaza el webhook manual entero, ver QA-50 en `Tareas-QA.md`) — cron diario (`src/routes/internal.ts`; el plan original era 2x/día, bajado a 1x/día porque Vercel Hobby no permite más de una corrida diaria por cron): por cada `StripeConnection` activa, primero corre `autoLinkUnmatchedCompanies` (ver abajo), después trae eventos nuevos vía `listEvents` desde `lastEventPollAt` (o `connectedAt` en el primer poll — nunca barre el historial completo de la cuenta) y se los pasa uno por uno a `processStripeWebhookEvent` — el orden importa: una Company recién vinculada en ese mismo pase ya puede recibir notificación si hay un evento suyo más abajo. Un tenant que falla (401/403 → `markNeedsAttention`, o cualquier otro error) no frena a los demás.
- **autoLinkUnmatchedCompanies(tenantId)** (Unit 2, automatizada 2026-08-28 — ver QA-51) — contraparte automática de "Search on Stripe" (`CompanyDetailModal.tsx`), llamada desde `runStripeEventPolling` en cada corrida del cron. Busca Companies con `stripeCustomerId: null`, reusa `searchStripeCustomersForCompany` para cada una (fan-out con `mapWithConcurrency`, límite 10) y solo vincula automático cuando hay **exactamente 1** match — 0 matches se reintenta en el próximo cron (sin cursor de "ya probado"), 2+ matches queda para que un humano lo resuelva a mano vía el flujo manual existente. Un error en una Company no frena a las demás.
- `StripePaymentSummary.currency`/`PaymentsOverviewTotals.currency` — moneda del Charge, no necesariamente la del tenant; simplificación conocida y documentada si un mismo customer tuviera charges en más de una moneda (no se banca en v1, no justifica el desglose).
- **notifyCompanyStripeEvent(tenantId, company, type, message)** (Unit 4) — resuelve destinatario: `Company.accountOwnerId` si está seteado, si no el primer `owner` activo del tenant — **nunca un admin**, aunque exista uno, porque Payments es owner-only (`canManagePayments`) y notificar a alguien que no puede ni abrir la página no serviría. Sin destinatario posible (rarísimo, ningún owner activo), no hace nada — no revienta.
- **processStripeWebhookEvent(tenantId, event)** (Unit 4) — recibe el evento ya parseado y con la firma ya verificada (eso queda en `routes/webhooks.ts`, junto a Paddle/Mercado Pago); resuelve la Company por `stripeCustomerId` dentro de ese tenant (sin match → descarta sin guardar nada) y despacha `charge.refunded`/`charge.failed`/`payment_intent.payment_failed`/`customer.subscription.deleted` directo. `customer.subscription.updated` es el único caso con guarda: solo notifica si `data.previous_attributes.status` existe y el status nuevo es `past_due` — sin esto, cualquier otro cambio a una subscription ya `past_due` (ej. cambiar la cantidad) generaría una notificación repetida cada vez. Devuelve un string corto (`'notified'`/`'no matching Company'`/etc.) que la ruta pasa tal cual en la respuesta — útil para leer el log de deliveries del lado de Stripe sin acceso a los logs del servidor.

### `src/modules/notes/noteService.ts`
CRUD estándar, cross-entidad vía `entityType`/`entityId`: **createNote**, **findNoteById(id)**, **listNotesForEntity(tenantId, entityType, entityId)**, **updateNote(id, input)**, **deleteNote(id)**.

### `src/modules/onboarding/onboardingService.ts`
- **seedSampleData(tenantId)** — carga datos de ejemplo (empleados/clientes), no idempotente a propósito, safe de llamar más de una vez.
- **getOnboardingStatus(tenantId)** — estado del checklist de onboarding (`/overview`).

### `src/modules/tasks/taskService.ts`
- CRUD cross-entidad: **createTask**, **findTaskById(id)**, **listTasksForEntity(tenantId, entityType, entityId)**, **updateTask(id, input)**, **deleteTask(id)** — las tres primeras (create/update/delete) disparan `syncTaskCalendarEvent` (best-effort, 2026-08-22) tras la escritura.
- **listMyTasks(tenantId, assigneeId)** — pendientes primero (2026-08-22: además excluye completadas del todo, no solo las ordena al final), por fecha de vencimiento más próxima.
- **listTasksForCalendar(tenantId)** — Task con `dueDate` y sin completar (2026-08-22: antes incluía completadas), el frontend filtra al mes visible.

### `src/modules/tenant/emailVerificationService.ts` (Tenant Signup, `docs/spec-tenant-signup.md`)
- **startSignupVerification(email)** — valida formato + dominio duplicado (`checkEmailDomainNotAlreadyRegistered`), invalida cualquier verificación previa sin usar de ese email, crea una nueva y dispara el mail. Backea tanto `/signup/start` como `/signup/resend` (son la misma operación).
- **verifySignupToken(token)** — lookup público (GET), marca `verifiedAt` la primera vez, idempotente en llamadas siguientes. No consume el token — eso lo hace `registerTenantWithOwner` recién al final.

### `src/modules/tenant/planService.ts` (Subscription Plans, `docs/spec-subscription-plans.md`)
- **CURRENT_PLAN_PRICES_CENTS** (const) — tabla de precios server-side (nunca confiar en un precio del cliente); editar acá cuando cambie el precio de lanzamiento, no afecta a tenants que ya congelaron el suyo.
- **updateTenantPlan(tenantId, plan)** — solo `starter`/`growth` (Scale no tiene checkout self-service todavía); setea `plan` + `lockedPriceCents`/`lockedPriceSetAt` en `Tenant`, nunca toca `trialEndsAt`. Desde Billing Integration (2026-08-18) también actualiza `Subscription.plan`/`lockedPriceCents`/`currency` en la misma transacción, así el placeholder `'starter'` que arranca en `Subscription` no queda desactualizado frente a la elección real del tenant.

### `src/modules/tenant/planTransitionService.ts` (Subscription Plans + Billing Integration)
- **GRACE_PERIOD_DAYS** (const, exportada desde Billing Integration) — 14 días; reusada por `routes/webhooks.ts` cuando un pago recurrente falla.
- **runPlanTransitions(now?)** — `trialing → past_due → suspended` según `trialEndsAt`/`gracePeriodEndsAt`; idempotente, pensada para correr diaria vía Vercel Cron (`src/routes/internal.ts`). El paso `trialing → past_due` es un solo `$executeRaw` (2026-08-18, antes era un `findMany` + loop de `update` uno por uno) — `gracePeriodEndsAt` depende del `trialEndsAt` de cada fila, por eso no es un `updateMany` directo. Desde Billing Integration también barre `Subscription`s de Mercado Pago con `cancellationEffectiveAt` vencido y llama `updatePreapproval(id, { status: 'cancelled' })` — MP no tiene "cancelar a fin de período" nativo como Paddle, así que el cancel self-serve (Etapa D) solo marca la fecha localmente y este paso es el que efectivamente llama a MP cuando llega. **`trialing → past_due` ahora tiene un `NOT EXISTS` sobre `Subscription.provider IS NOT NULL`** (2026-08-20, "genuinely free for 15 days") — un tenant que ya adjuntó tarjeta en un trial nativo de Paddle/MP no debe caer en `past_due` por nuestro propio reloj interno mientras el proveedor todavía no le cobró nada (eso lo maneja el webhook, no este cron).

### `src/modules/tenant/subscriptionService.ts` (Billing Integration, `docs/general/spec-billing-integration.md`)
- **resolveProvider(tenant)** — `tenant.country === 'Argentina'` → `mercadopago`; cualquier otro valor, incluido `null` (tenants legacy sin país), → `paddle`.
- **syncSubscriptionAndTenant(input)** — único punto de escritura de `Subscription` + su espejo en `Tenant.status`/`plan`/`trialEndsAt`/`gracePeriodEndsAt`/`lockedPriceCents`, en una sola transacción. Pensado para el cron y los dos webhook handlers (Paddle/Mercado Pago) — `updateTenantPlan` de arriba es la única excepción deliberada (escribe ambas filas inline, no es una transición de status). Solo escribe en `Tenant` los campos del subset con espejo real, y solo si vinieron seteados en el `input` — un webhook que solo toca `paymentMethodBrand`/`Last4` nunca toca `Tenant`. **2026-08-31**: sumó `changedByUserId?` opcional al input y registra Activity Log al final — si viene `changedByUserId` (los 3 self-serve de abajo, síncronos) lo usa directo; si no (todo call site de webhook/cron, que nunca tiene actor propio), cae al puntero `Subscription.lastActionByUserId`/`lastActionAt` (helper privado `resolveRecentActorId`, ventana de 60 min — `SUBSCRIPTION_ACTOR_TRUST_WINDOW_MS`) solo si sigue fresco; si ninguno aplica, no loguea nada. Único lugar donde vive esta lógica — `webhooks.ts`/`planTransitionService.ts` no cambiaron. Ver también **recordSubscriptionActionAttempt(tenantId, userId)** (mismo archivo) — escribe solo `lastActionByUserId`/`lastActionAt`, sin tocar estado de facturación; usada por `startCheckout`.
- **getBillingSummary(tenantId)** (Etapa E) — backea `GET /api/subscriptions/me`, lectura del `Subscription` + sus `invoices` para `BillingPage.tsx`. No estaba en el breakdown original (todas las unidades 1-15 son escrituras) — sin esto la página no tiene de dónde leer. Cualquier miembro autenticado del tenant, mismo criterio que `GET /api/tenants/current` (los endpoints que escriben siguen owner-only vía `canManageBilling`).
- **getInvoiceDocumentUrl(tenantId, invoiceId, disposition?)** (2026-08-19) — backea `GET /api/subscriptions/me/invoices/:invoiceId/document?disposition=`. Verifica que la Invoice pertenezca de verdad al tenant antes de pedirle la URL a `getInvoicePdfUrl` (paddle.ts) — Paddle-only, Mercado Pago no tiene documento equivalente todavía. `disposition` viaja tal cual al query param de Paddle (`inline` ver / `attachment` descargar).

### `src/modules/tenant/checkoutService.ts` (Billing Integration, `docs/general/spec-billing-integration.md`)
- **startCheckout(tenant, user)** — backea `POST /api/subscriptions/me/checkout`. Desde 2026-08-19 (corrección de Alejandro) cubre dos intents distintos según si `Subscription.provider` ya está seteado: **suscribirse por primera vez** (sin provider — crea una Transaction/Preapproval nueva, no toca `Subscription` hasta que el webhook confirme el pago) vs. **actualizar el método de pago** de una suscripción YA activa (con provider — Paddle usa `getUpdatePaymentMethodTransaction` sobre la MISMA suscripción; Mercado Pago no tiene ese mecanismo así que cancela la preapproval vieja y crea una nueva, mismo resultado neto de "una sola tarjeta activa"). Nunca crea una segunda suscripción compitiendo para un tenant ya activo. Rechaza si el `PlanPrice` del mercado del tenant no existe o es el placeholder AR (0 cents). **2026-08-20**: la rama de suscripción nueva pasa `trialDays: SIGNUP_TRIAL_DAYS` (de `tenantService.ts`) a `createPreapproval`/`createNonCatalogTransaction` — tarjeta ahora, primer cobro real recién a los 15 días. La rama de "actualizar método de pago" (incluido el fallback de cancelar+recrear de MP) nunca pasa `trialDays` — no le corresponde un trial nuevo a alguien que ya está pagando. **2026-08-20 (misma tarde)**: ese `trialDays` real solo aplica cuando `process.env.PADDLE_ENV === 'production'` (`isRealProductionBilling`) — fuera de eso (staging, local dev, cualquier lugar corriendo contra sandbox) una suscripción nueva cobra de inmediato en vez de dar los 15 días, para poder confirmar el flujo completo tarjeta→webhook→suscripción activa contra sandbox sin esperar 15 días reales. Reusa `PADDLE_ENV` (ya existente en `paddle.ts` para elegir el host sandbox/live) en vez de sumar una variable nueva, porque en la práctica los dos proveedores siempre pasan a modo real juntos. **2026-08-21 (catch de Alejandro)**: `trialDays` ya no es siempre `SIGNUP_TRIAL_DAYS` fijo — se calcula como los días que de verdad quedan hasta el `Tenant.trialEndsAt` ORIGINAL (fijado una sola vez al signup), tope `SIGNUP_TRIAL_DAYS`, y si ya venció (`daysRemaining <= 0`) cobra de inmediato en vez de dar más tiempo gratis. Sin esto, como nada acá escribe `Subscription.provider` hasta que un webhook confirma el pago, alguien podía arrancar-y-abandonar el checkout indefinidamente y, cuando finalmente completara uno, siempre conseguía 15 días frescos desde ESE momento — empujando el primer cobro real para siempre, el trial "interminable" que señaló. `startCheckout` ahora recibe `tenant.trialEndsAt` (antes solo `id`/`country`) — `routes/subscriptions.ts` lo agregó al `select`. **2026-08-31**: el segundo parámetro pasó de `{ email }` a `{ id, email }` — llama `recordSubscriptionActionAttempt(tenant.id, user.id)` justo después de confirmar que existe `subscription`, para que el webhook que confirme el pago después pueda atribuirle el cambio a este usuario (ver `syncSubscriptionAndTenant`). Es la única escritura de metadata (no de estado de facturación) que hace en el camino "subscribe" — sigue sin tocar `provider`/`externalSubscriptionId`/etc ahí.

### `src/modules/tenant/subscriptionSelfServeService.ts` (Billing Integration, Etapa D)
- **changePlan(tenantId, plan, userId)** — solo si la `Subscription` ya tiene `provider`/`externalSubscriptionId` (si no, usar `PATCH /api/tenants/me/plan` en su lugar). Llama al proveedor correspondiente y, confirmada esa respuesta, actualiza `plan`/`lockedPriceCents` YA MISMO vía `syncSubscriptionAndTenant` (decisión confirmada con Alejandro: la respuesta del proveedor ya es la confirmación, no hace falta esperar el próximo webhook de cobro — no se agregó ninguna columna nueva de "plan pendiente"). **2026-08-31**: sumó `userId` (ya estaba en scope en la ruta, solo faltaba pasarlo) — se lo pasa a `syncSubscriptionAndTenant` como `changedByUserId`, así queda logueado con el actor real, no con el fallback de correlación.
- **requestCancellation(tenantId, reason?, userId)** — Paddle: llama `cancelSubscription` en el momento (cancelación nativa programada). Mercado Pago: no llama a nada — el barrido del cron (`planTransitionService.ts`) lo hace cuando vence `cancellationEffectiveAt`. Ninguno de los dos toca `Tenant.status` acá. **2026-08-31**: mismo agregado de `userId`/`changedByUserId` que `changePlan`.
- **resumeSubscription(tenantId, userId)** — Paddle: llama `removeScheduledChange` (gap real encontrado: la spec decía "no hace falta llamar a ningún proveedor", cierto solo para MP). Mercado Pago: no llama a nada. **2026-08-31**: mismo agregado de `userId`/`changedByUserId` que `changePlan`.

### `src/modules/tenant/invitationService.ts`
- **findInvitationByToken(token)** — incluye `employeeId`/`tenantId` en el select.
- **createInvitation(input)** — acepta `acceptPath` opcional (default `/accept-invite`; Payroll usa `/confirm-contract` para el primer contrato de un Contractor/Employee, Unidad 6) para que el link del email apunte a una pantalla distinta de la genérica; también acepta `attachments` opcional, pasado tal cual a `sendInvitationEmail`.
- **acceptInvitation(input)**, **listTenantInvitations(tenantId)**, **cancelInvitation(tenantId, invitationId)**.

### `src/modules/tenant/tenantService.ts`
- **normalizeSlug(value)** — helper de string. (`getEmailDomain`/`isEmailFormatValid` viven en `src/lib/email.ts` desde 2026-08-18.)
- **checkEmailDomainNotAlreadyRegistered(email)** — validador de dominio duplicado, compartido por `emailVerificationService.ts` (el gate real, en `signup/start`) y `registerTenantWithOwner` (defensa en profundidad); excluye tenants `cancelled` y `suspended` del match, no solo `active` (un trial abandonado no debe bloquear el dominio para siempre, ya que todavía no hay billing real que permita reactivarse self-serve). Desde 2026-08-18 filtra por `User.emailDomain` (igualdad, indexado) en vez de `email: {endsWith}` (scan completo de la tabla).
- **registerTenantWithOwner(input)** — flujo completo de "Sign Up" (tenant + owner + seeds); requiere `verificationToken` (Tenant Signup, `docs/spec-tenant-signup.md`) validado y consumido al final, justo antes de la transacción — nunca antes, para no quemar el token si otra validación falla. Setea `Tenant.status: 'trialing'` + `trialEndsAt` (Subscription Plans). Desde Billing Integration (2026-08-18) también crea el `Subscription` del tenant en la misma transacción (placeholder `plan: 'starter'` hasta que elija uno real vía `updateTenantPlan`).
- **findTenantNameById(tenantId)**, **getTenantById(tenantId)** (incluye `status`/`plan`/`companySize`/`trialEndsAt`/`gracePeriodEndsAt`), **updateTenantCurrency(tenantId, currency)**.
- **findUserById(id)** — sin scope de tenant a propósito (mismo patrón que `findClientById`/`findEmployeeById`) — el caller valida `tenantId` antes de confiar en el resultado.

### `src/modules/platform/platformTenantService.ts`
Admin Center (`/api/platform/tenants*`, `requirePlatformRole('platform_support')`), no confundir con `tenantService.ts` (self-service tenant-scoped).
- **listTenants(input)** — por `status` (requerido), sort/search en memoria (dataset chico, no vale la pena mezclar Prisma `orderBy` con un sort manual solo para `userCount`).
- **getTenantDetail(tenantId)** — incluye `userCount` + los campos de perfil (currency/companySize/industry/acquisitionChannel).
- **listTenantUsers(input)** — usuarios de un tenant, sort vía Prisma `orderBy`.

### `src/modules/platform/platformTicketService.ts`
- **listTickets(input)** / **getTicketWithNotes(id)** / **createTicket(input)** / **updateTicket(id, input)** — CRUD de Ticket, `requirePlatformRole('platform_support')` en las rutas.
- **createTicketNote(ticketId, createdById, description)** — crea la `Note` (reusa `noteService.createNote`, no una tabla nueva) y dispara `sendTicketNoteCreatedEmail` best-effort si el autor tiene `platformRole` (staff) y el ticket tiene `userId`. El distingo "Admin/Support/Tenant" del hilo se deriva de `platformRole` del autor, no es un campo propio.
- **createIdea(input)** — usado por el form de feedback (Block 7).
- **listIdeas(input)** / **getIdeaWithNotes(id)** / **updateIdea(id, input)** — CRUD de Idea, sin `assignee` (no tiene `assignedToUserId`, es backlog de producto, no cola de soporte). `requirePlatformRole()` sin roles extra (solo `platform_admin`), a diferencia de Ticket.
- **createIdeaNote(ideaId, createdById, description)** — Notes 100% internas, nunca dispara email (a diferencia de `createTicketNote`).

### `src/modules/platform/platformStatusService.ts`
Catálogo de `PlatformStatusDefinition` (plataforma, no por tenant) — `requirePlatformRole()` sin roles extra en las rutas, o sea solo `platform_admin` vía bypass.
- **listPlatformStatuses(entityType)** / **createPlatformStatus(input)** / **updatePlatformStatus(id, input)** — mismo guard que `statusService.updateStatusDefinition` (no se puede desactivar el status default); desactivar un status en uso pero no-default SÍ está permitido en el backend a propósito (el frontend confirma).

### `src/modules/tenant/tenantUserService.ts`
- **listTenantUsers(tenantId)**, **updateTenantUser(...)**.

---

## Frontend — `frontend/src/`

### `frontend/src/lib/currencies.ts`
- **currencyLabel(code)** — nombre legible de un código ISO-4217.
- **formatMoney(cents, currency)** — `Intl.NumberFormat` currency, la función de formato de plata que usa toda la app (no reinventar con `toFixed(2)`).

### `frontend/src/lib/lightMarkdown.tsx`
- **renderNoteDescription(description)** — subset mínimo de Markdown (bold/italic/links/saltos de línea) para el texto de Notes, sin librería externa.

### `frontend/src/lib/viewFields.ts` (motor de Views/Filters/Sort genérico)
- **buildEmployeeFields(...)**, **buildCompanyFields(...)**, **buildContactFields(...)** — arman la lista de `ViewField` (columnas filtrables/ordenables) por entidad, incluyendo custom fields. `buildEmployeeFields` incluye `birthdate` (2026-08-22, `valueType: 'date'`, mismo patrón que `startDate`/`endDate`) — agregar un campo nuevo a Employee generalmente alcanza con sumarlo acá, sin tocar la tabla/detalle/form a mano.
- **findField(fields, key)**, **groupableFields(fields)**, **parseFilters(raw)**, **parseSort(raw)**.

### `frontend/src/lib/countries.ts`, `frontend/src/lib/changelog.ts`
Solo datos (`COUNTRIES`, `CHANGELOG_ENTRIES`), sin funciones — no indexado más allá de esta mención.

### `frontend/src/lib/validation.ts`
- **isLikelyValidEmail(value)** — chequeo de forma client-side-only (no reemplaza validación de backend), usado para gatear cuándo un campo cuenta como "completo" en un trigger de auto-save/auto-create.

### `frontend/src/lib/trial.ts` (2026-08-21, Billing Integration)
- **daysRemainingUntil(target)** — días que faltan hasta una fecha tipo `Tenant.trialEndsAt`/`Subscription.trialEndsAt` (`Math.ceil`, nunca negativo — mismo redondeo que el `daysRemaining` de `checkoutService.ts` del lado del backend). Antes vivía duplicado inline en `AppLayout.tsx` (para el banner de `past_due`) — extraído para que `PlansModal`/`AddPaymentMethodModal` lo usen también y el copy de trial nunca prometa más días de los que el backend realmente va a dar.

### `frontend/src/hooks/useAutoCreateGuard.ts`
- **useAutoCreateGuard()** — guard reusable para forms de "Add [Entity]" que auto-crean apenas sus campos requeridos están completos (2026-08, ver `EmployeeOverviewPanel`/`EmployeesPage.tsx`). Devuelve `{ attempt(isReady, run), reset() }`: `attempt` no hace nada si ya se creó, si hay una request en vuelo, o si `isReady` es false — así se puede llamar desde el commit de cada campo requerido (blur en texto, change en select) sin duplicar la entidad; `run` debe relanzar su error después de reportarlo (toast) para que el guard no marque la creación como exitosa y permita reintentar. `reset()` se llama al cerrar/reabrir el form.

### `frontend/src/hooks/useColumnOrder.ts`
- **useColumnOrder(storageKey, allKeys)** — orden de columnas persistido en `localStorage`; una key nueva (columna/custom field nuevo) se agrega al final, una que ya no existe se descarta sola.

### `frontend/src/hooks/useColumnVisibility.ts`
- **useColumnVisibility(storageKey)** — mostrar/ocultar columnas, persistido por vista (`storageKey` incluye el `activeViewId`) para no mezclar entre vistas.

### `frontend/src/hooks/useResizableColumns.ts`
- **useResizableColumns(storageKey)** — mismo criterio que `useColumnVisibility` pero para anchos de columna.

### `frontend/src/api/*` — cliente HTTP, un archivo por dominio, todos re-exportados juntos en `api` (`frontend/src/api/index.ts`)
Métodos por archivo (todas devuelven una Promise, firma `(token, ...) => ...`, ver `frontend/src/api/http.ts` para `apiFetch`/`throwApiError` compartidos):

| Archivo | Métodos |
|---|---|
| `auth.ts` | startSignup, resendSignup (ambas vía el helper interno `postSignupEmail`, no exportado), verifySignup, registerTenant, login, register, forgotPassword, validateResetToken, resetPassword, getInvitation, acceptInvitation, logout, getCurrentUser, updateProfile, changePassword, getCurrentTenant, updateTenantCurrency, getPlanPrices (2026-08-18, público, sin token), updateTenantPlan |
| `employees.ts` | listEmployees, createEmployee, updateEmployee, deleteEmployee, inviteEmployee, getEmployeeCompensation, getEmployeeContractPdf, resendContract, listEmployeeBirthdays (2026-08-22) |
| `companies.ts` | listCompanies, createCompany, updateCompany, deleteCompany, +custom field values |
| `contacts.ts` | listContacts, createContact, updateContact, deleteContact, +custom field values |
| `opportunities.ts` | listOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, addOpportunityContact, removeOpportunityContact |
| `pipelines.ts` | listPipelines, createPipeline, updatePipeline, createPipelineStage, updatePipelineStage |
| `customFields.ts` | listCustomFieldDefinitions, createCustomFieldDefinition, updateCustomFieldDefinition |
| `fieldCatalog.ts` | listFieldCatalogDefinitions, createFieldCatalogDefinition, updateFieldCatalogDefinition |
| `statuses.ts` | listStatusDefinitions, createStatusDefinition, updateStatusDefinition |
| `savedViews.ts` | listViews, createView, updateView, deleteView |
| `timeOffPolicies.ts` | listTimeOffPolicies, createTimeOffPolicy, updateTimeOffPolicy |
| `timeOffPolicyAssignments.ts` | listEmployeeTimeOffPolicies, assignTimeOffPolicyToEmployee, unassignTimeOffPolicyFromEmployee |
| `timeOffRequests.ts` | listTimeOffRequests, createTimeOffRequest, decideTimeOffRequest, cancelTimeOffRequest |
| `timeOffBalances.ts` | listTimeOffBalances, getEmployeeTimeOffBalance, +custom field values (nota: nombre de archivo engañoso, ver código) |
| `tasks.ts` | listTasks, listMyTasks (2026-08-22: excluye completadas), listTasksForCalendar (ídem), createTask, updateTask, deleteTask |
| `notes.ts` | listNotes, createNote, updateNote, deleteNote |
| `payroll.ts` | listPayFrequencies, createPayFrequency, updatePayFrequency, listPaymentMethods, createPaymentMethod, updatePaymentMethod, createCompensation, getCompensationStatus, listTerminatedCompensations, createCompensationBulk, listPayrollRuns, createPayrollRun, getPayrollRunDetail, addEmployeeToPayrollRun, confirmPayrollRun, createPayrollAdjustment, deletePayrollEntry, updatePayrollEntryHours, listOffCyclePayments, createOffCyclePayments, getRunEmployeePayslip, getEntryPayslip |
| `contractConfirmationPublic.ts` | getContractConfirmation, confirmContract — público, sin auth (standalone `/confirm-contract/:token`) |
| `csv.ts` | exportEmployeesCsv, importEmployeesCsv, employeesCsvTemplate, exportCompaniesCsv, importCompaniesCsv, companiesCsvTemplate, exportContactsCsv, importContactsCsv, contactsCsvTemplate (2026-08-31: `buildCsvEndpoints(basePath)` factors the shared export/import/template fetch pattern, all 3 entities built on it) |
| `tenantUsers.ts` | listTenantUsers, updateTenantUser, listTenantInvitations, createTenantInvitation, cancelInvitation |
| `publicFormsAdmin.ts` | listPublicForms, createPublicForm, updatePublicForm |
| `publicFormsPublic.ts` | getPublicFormConfig, submitPublicForm |
| `onboarding.ts` | getOnboardingStatus, seedSampleData |
| `feedback.ts` | sendFeedback |
| `http.ts` | apiFetch(url, init?), throwApiError(res) — base compartida, no un dominio |
| `integrations.ts` (2026-08-22, +Stripe 2026-08-26, +listGoogleCalendarEvents 2026-08-27, webhook→cron 2026-08-28) | getGoogleCalendarStatus, getGoogleCalendarConnectUrl (devuelve `{url}` para que el frontend haga `window.location.href` — no redirige el propio backend, porque este endpoint se llama con fetch autenticado, no con navegación directa), disconnectGoogleCalendar, listGoogleCalendarEvents(token, start, end) (overlay de solo lectura del Overview, eventos propios no linkeados a un Task), getStripeStatus, connectStripe(token, apiKey), disconnectStripe |
| `payments.ts` (Payments v1, Units 2-3, 2026-08-26) | searchStripeCustomersForCompany, linkCompanyToStripe (lanza `ApiError` con `.status === 409` si la Company ya está vinculada a otro customer — reintentar con `confirmOverwrite: true`), getCompanyPaymentSummary, getCompanyPaymentEvents(token, companyId, cursor?), getPaymentsOverview |
| `billing.ts` (Billing Integration, Etapa E) | getSubscription, startCheckout, changeSubscriptionPlan (post-billing, distinto de `updateTenantPlan` de arriba que es la elección pre-billing durante trial), cancelSubscription, resumeSubscription, getInvoiceDocumentUrl(token, invoiceId, disposition?) (2026-08-19, Paddle-only, URL temporal ~1h, se pide fresca en cada click — `BillingPage.tsx` la usa dos veces por fila de Invoice: "View invoice" con `inline`, "Download" con `attachment`) |
| `activity.ts` (2026-08-30, Activity Log) | listActivityForEntity(token, entityType, entityId) (tab del modal), listActivityFeed(token, params) (feed tenant-wide de Settings, cursor-paginado — `params.entityType` sigue el `TaskEntityType` de 4 valores, no el enum completo de 27 del backend, hasta que una unidad futura amplíe qué se puede filtrar) |

### `frontend/src/components/common/` — componentes reusables genéricos, no ligados a una entidad
- **AddPaymentMethodModal** (2026-08-19, Billing Integration) — dispara `POST /api/subscriptions/me/checkout`; ambos proveedores abren en pestaña nueva vía `window.open` (Mercado Pago: `initPoint` directo; Paddle: `PaddleCheckoutPage`, ver abajo, en `/billing/checkout?transactionId=...`). Nunca arma un form de tarjeta propio. Prop `mode: 'subscribe' | 'update'` cambia el copy (elegir plan por primera vez vs. reemplazar la tarjeta de una suscripción ya activa — dos intents distintos, corrección de Alejandro). **2026-08-20 (corrección)**: ya no carga `paddle.js` ni llama `Paddle.Checkout.open()` en la pestaña actual — Alejandro pidió que el checkout se sienta como su propia ventana, no un overlay apilado sobre la actual; el componente ya no tiene prop `onCompleted` (no hay señal de vuelta a la pestaña original — `BillingPage.tsx` refetchea al recuperar foco en su lugar, ver abajo). **2026-08-21 (corrección)**: la regla "si no hay modal, pestaña nueva" valía para los dos proveedores, no solo Paddle — Mercado Pago todavía hacía `window.location.href = initPoint` (navegaba la pestaña actual fuera de Northstack por completo); ahora también `window.open(initPoint, '_blank', 'noopener,noreferrer')`, mismo patrón que Paddle. **2026-08-21 (misma tarde)**: nueva prop `trialDaysRemaining?: number` (solo relevante en `mode="subscribe"`) — el copy y el título ("Start your free trial" vs. "Subscribe") ahora reflejan si de verdad queda trial o no, en vez de prometer siempre "15 días" sin importar cuánto tiempo ya pasó; espejo exacto de lo que `checkoutService.ts` va a cobrar de verdad (ver su entry abajo). Montado tanto en `AppLayout.tsx` (banner de `past_due`/`suspended`, siempre `mode="subscribe"`, `trialDaysRemaining` calculado sobre `tenant.trialEndsAt` — normalmente 0 ahí, porque para llegar a ese banner el trial ya venció) como en `BillingPage.tsx` (modo según si ya hay `provider`, `trialDaysRemaining` sobre `subscription.trialEndsAt`).
- **PaddleCheckoutPage** (`frontend/src/pages/PaddleCheckoutPage.tsx`, 2026-08-20, Billing Integration) — ruta standalone `/billing/checkout?transactionId=X` (fuera de `AppLayout`, mismo patrón que `/confirm-contract/:token` y `/apply/:tenantSlug/:formSlug`), abierta en pestaña nueva por `AddPaymentMethodModal`. Carga `paddle.js` dinámicamente, `Paddle.Initialize()` + `Checkout.open({ transactionId })`, y muestra estados loading/open/completed/error según los eventos `checkout.error`/`checkout.completed` del `eventCallback`. Único lugar que sigue tocando la API de Paddle.js del lado del cliente.
- **AcceptTermsCheckbox** (2026-08-18) — checkbox "acepto ToS/Privacy" + los dos botones que abren `LegalDocumentModal`; dueño de su propio estado de qué doc mostrar. Extraído de tres copias casi idénticas (CompleteSignupPage, AcceptInvitePage, ContractConfirmationPage) — usar esto en vez de reimplementar el bloque en cualquier form nuevo que pida aceptar términos.
- **AuthLayout** — shell de las pantallas de login/registro.
- **AutoSaveField** / **AutoSaveSelect** — input/select que guarda solo (blur / change), revierte y avisa por toast si el PATCH falla. Usar siempre que un campo se edite "en línea" sin botón Save.
- **Avatar** (+ **getInitials**) — círculo con iniciales.
- **CategoryChip** — chip de color determinístico por `seed` (para custom fields tipo categoría).
- **ColorPicker** — selector de color con paleta + custom, persistido en `localStorage`.
- **ConfirmDialog** — modal de confirmación para acciones destructivas; nunca usar `confirm()` nativo.
- **EmptyState** — estado vacío con ícono/título/cuerpo/CTA; usar en vez de un `<p>` de texto plano (ver `docs/Skills/Skills-Development.md`).
- **EntityCardList** — lista de tarjetas para la vista mobile de una tabla (`<md`, patrón responsive).
- **Field** — wrapper de label+valor para paneles de detalle y forms de alta. Prop `required` (2026-08) renderiza `RequiredMark` junto al label.
- **RequiredMark** (2026-08) — el asterisco rojo, como componente en vez de texto suelto (`.required-mark` en CSS). Es el único lugar que define "así se ve un campo obligatorio" — `Field` lo usa internamente vía su prop `required`; cualquier form que **no** use `Field` (la mayoría de los `.form-group` + `<label>` sueltos de SlideOvers/popovers/páginas de auth) lo importa y lo cae directo dentro del `<label>`: `<label>Nombre<RequiredMark /></label>`. Aplicado en 2026-08 a los 4 forms de alta del CRM, Login/Register/Accept Invite, los popovers de Invite user/PTO Policy/Time Off request/Custom Field/Status/Field Catalog/Saved View/Pipeline/CSV import, el builder de Public Forms + el form público en sí, TaskForm/NoteForm, y los sub-forms de alta rápida dentro de los paneles de detalle del CRM (ej. "add a new contact" en `CompanyDetailModal`).
- **Icons.tsx** — toda la iconografía de la app, un componente por ícono (`SearchIcon`, `PlusIcon`, `PencilIcon`, `TrashIcon`, `MailIcon`, `EyeIcon`/`EyeOffIcon`, `CheckIcon`, `XIcon`, `GripIcon`, `GridIcon`, `KanbanIcon`, `ListIcon`, `LockIcon`, `TeamIcon`, `FilterIcon`, `DotsVerticalIcon`, `CopyIcon`, `HomeIcon`, `DashboardIcon`, `CalendarIcon`, `TrendingIcon`, `PeopleIcon`, `BriefcaseIcon`, `GearIcon`, `UserCircleIcon`, `ChevronDownIcon`/`ChevronLeftIcon`/`ChevronRightIcon`, `MenuIcon`, `DownloadIcon`, `UploadIcon`, `BellIcon`, `BuildingIcon`, `TargetIcon`) — **revisar esta lista antes de agregar un ícono nuevo**, es fácil duplicar uno que ya existe con otro nombre.
- **LegalDocumentModal** — visor de ToS/Privacy Policy.
- **Modal** — modal centrado con backdrop, mismas props que `SlideOver` (open/title/onClose/footer). Patrón esperado (no excepción) para el form de alta de Employee/Company/Contact/Opportunity desde 2026-08; para otros forms chicos, evaluar caso a caso si el diseño pide centrado en vez de panel lateral. Prop `wide` (768px) ya existía; `xwide` (1024px, nuevo 2026-08-13) para contenido que necesita más ancho todavía, como `PlansModal`.
- **OverviewActionsMenu** — trigger "Actions" del header de un panel de detalle (Delete, Invite to app, etc.).
- **Pagination** (+ **paginate**) — paginación client-side, 20 filas/página.
- **PlansModal** (2026-08-13, Subscription Plans, **2026-08-21**: `ctaLabel`/copy de Starter/Growth ahora reflejan `daysRemainingUntil(tenant.trialEndsAt)` en vez de "15 días" fijo — "Start N-day free trial" mientras quede trial real, "Subscribe now" y copy sin mención de trial una vez que venció, espejo de lo que `checkoutService.ts` va a cobrar de verdad) — modal (`Modal` `xwide`) que se abre solo una vez, automáticamente, cuando un tenant recién creado (`status: 'trialing'`, `plan: null`) llega a cualquier pantalla — no es una ruta, no bloquea navegación (corregido de una versión anterior que sí lo era). 3 tarjetas: Free Trial (mismas features que Starter, cierra el modal sin llamar al backend), Starter, Growth — copy fiel al mockup aprobado. Precio de Starter/Growth traído en vivo de `GET /api/plans/prices` (2026-08-18, `api.getPlanPrices`) en vez de hardcodeado, para no divergir silenciosamente de `planService.ts`'s `CURRENT_PLAN_PRICES_CENTS`; fetch lazy en el primer `open`, cacheado en el componente (que queda montado, `AppLayout` solo togglea `open`). Dismiss persistido en `localStorage` por tenant (`northstack:dismissedPlansModal:<tenantId>`), owner-only (gateado también server-side por `canManageBilling`). Desde 2026-08-18 el dismiss ya no es un callejón sin salida: `AppLayout` muestra un banner "Choose a plan" mientras `plan === null` que puede reabrir el modal (`plansModalForceOpen`). Montado en `AppLayout.tsx`. Prop opcional `onSelectPlan` (2026-08-19) — reusado por `BillingPage.tsx`'s "Change plan" (mismo modal completo, no una versión reducida) para que la elección pase por `changeSubscriptionPlan` (post-billing) en vez de `updateTenantPlan` (pre-billing) cuando el tenant ya tiene un `provider` real; sin esto, cambiar de plan ya pagando nunca le avisaría a Paddle/Mercado Pago. Prop opcional `currentPlan` (2026-08-19) — marca esa tarjeta como "Current plan" (badge, botón deshabilitado) en vez de ofrecerla como si fuera una opción nueva; solo relevante para `BillingPage.tsx` (`AppLayout` solo abre el modal cuando `plan === null`, así que ahí nunca hay un plan "actual" que marcar). **Modelo de negocio final (2026-08-20, dos correcciones el mismo día)**: elegir Starter/Growth (nunca Free Trial) ahora abre el checkout real de una — pero sigue siendo "genuinely free for 15 days" (segunda corrección: la primera versión cobraba al toque, Alejandro pidió volver a un trial real pero con tarjeta ya cargada). `AppLayout.tsx`'s `handleSelectPlanAndCheckout` y `BillingPage.tsx`'s `handleSelectPlan` (rama `!hasProvider`) hacen `updateTenantPlan` y después abren `AddPaymentMethodModal` (`mode="subscribe"`) — se reusa ese componente en vez de duplicar la lógica de Paddle.js/redirect. El checkout mismo usa `trialDays` (`createNonCatalogTransaction`/`createPreapproval`, ver `src/lib/`) — la tarjeta se adjunta ahora, el primer cobro real recién a los 15 días. `ctaLabel` de Starter/Growth quedó en "Start 15-day free trial" y el copy de arriba aclara que Free Trial no pide tarjeta pero Starter/Growth sí (aunque no cobran hasta el día 15).
- **PasswordChecklist** / **PasswordInput** — checklist en vivo de reglas de contraseña + toggle mostrar/ocultar.
- **Popover** — portal a `document.body` + posicionamiento por coordenadas reales; mecanismo estándar para cualquier dropdown flotante, nunca un `<div absolute>` a mano.
- **RoleChip** — chip de rol (owner/admin/member).
- **SearchableSelect** — input + dropdown filtrado para elegir una opción de una lista larga (construido sobre `Popover`).
- **SlideOver** — panel lateral para forms de "entidad completa"; default para forms nuevos salvo que el diseño pida `Modal` centrado.
- **StatusChip** — chip de status con punto de color.
- **TableSkeleton** — loading state de tabla; usar en vez de `<p>Loading...</p>`.
- **TagInput** (backlog QA, 2026-08-27) — chips + input con autocomplete (`Popover`) para el sistema de tags libres; "Enter" agrega el tag tipeado (crea uno nuevo o reusa uno existente vía `api.addTag`), click en el chip lo quita (`api.removeTag`). Montado en `ContactDetailModal`/`CompanyDetailModal`/`EmployeeOverviewPanel` (mismos 3 tipos de entidad que soporta el backend hoy). Reusa `.time-off-policy-chip`/`.time-off-policy-chip-remove` para el look del chip en vez de una clase nueva.
- **ToastProvider** (+ **useToast**) — `success`/`error`, nunca `alert()`.

### `frontend/src/components/entity-views/` — piezas del motor genérico de Views/Filters/Kanban/tabla
- **AddCustomFieldColumn** — columna "+" al final del header para agregar un custom field.
- **ColumnResizeHandle** — handle de resize dentro de un `<th>`.
- **ColumnVisibilityMenu** — menú de mostrar/ocultar columnas (usa el hook `useColumnVisibility`).
- **CsvImportExportMenu** (`forwardRef`, expone `CsvImportExportMenuHandle`) — patrón genérico de import/export CSV con template descargable. Genérico desde 2026-08-31 (`entityLabelPlural`/`entityLabelSingular` + `exportCsv`/`importCsv`/`csvTemplate` como props) — usado por Employees/Companies/Contacts, no reinventar por módulo.
- **CustomFieldColumnMenu** — dropdown de header de columna de custom field (Edit/Delete field).
- **FieldCatalogMenu** — dropdown de header para columnas de catálogo (Department, Job Title).
- **FilterBar** — barra de filtros sobre una lista de `ViewField`.
- **HorizontalScrollbar** — scrollbar horizontal propia para `.full-table-wrap` (consistente entre navegadores/SO).
- **KanbanBoard** (genérico, `<T>`) — tablero drag-and-drop reusado por Employees/Companies/Contacts/Opportunities, recibe `renderCard` como prop.
- **StatusColumnMenu** — dropdown de header de columna Status ("Manage options": color, orden, default, activar/desactivar).
- **ViewsBar** — tabs de vistas guardadas (Grid/Kanban/List, personales o compartidas).

### `frontend/src/components/crm/`
- **CompanyDetailModal**, **ContactDetailModal**, **OpportunityDetailModal** — paneles de detalle 70vw×70vh con tabs Notes/Tasks/Activity (mismo shell que `EmployeeOverviewPanel`, ver `DetailSidebar` abajo).
- **CompanyStripeSection** (Payments v1, Units 2-3, `docs/tareas/specpaymentsv1.md`, 2026-08-26) — sección "Payments" del `CompanyDetailModal`, owner-only. Sin `stripeCustomerId`: botón "Search on Stripe" + lista de matches con "Link" (0/1/2+ resultados). Con uno: link al customer en el dashboard de Stripe + resumen (refunds/failed/subscription) + lista de eventos recientes con "Load more" (paginación cursor de Stripe) + "Change link" para re-buscar. Un 409 de `linkCompanyToStripe` (ya vinculado a otro customer) abre un `ConfirmDialog` antes de reintentar con `confirmOverwrite: true`.

### `frontend/src/components/hr/`
- **EmployeeOverviewPanel** — panel de detalle de Employee; edición 100% inline vía `AutoSaveField`/`AutoSaveSelect`, sin botón "Edit" ni modo edición separado.

### `frontend/src/components/layout/`
- **ChangelogMenu** — popover de "What's new" (contenido estático en `lib/changelog.ts`).
- **DetailSidebar** — columna derecha compartida (tabs Notes/Tasks/Activity) por los 4 paneles de detalle (Employee/Company/Contact/Opportunity) — **el componente a extender si se agrega una 5ta entidad con detalle**, no copiar los 4 paneles.
- **MobileTabbar** — tabbar inferior fijo, solo `<768px` (Overview/Employees/Time Off/Sales).
- **OnboardingChecklist** — card de `/overview` con los 4 pasos de onboarding.
- **Sidebar** / **TopBar** — navegación principal.

### `frontend/src/components/payroll/`
- **PayslipPreviewModal** — dado un `fetchPdf: () => Promise<Blob>`, resuelve el blob a un object URL y lo muestra en un `<iframe>` + botón de descarga (Payroll Unidad 20). Props `title`/`downloadFilename`/`helperText` opcionales (default = payslip) la generalizaron (2026-08-08) para reusarla tal cual en "View contract" del panel de People — el nombre quedó desactualizado (no es solo payslips), pero no se renombró el archivo para no ensuciar el diff.

### `frontend/src/components/notes/`
- **EntityNotesList** — tab "Notes" compartido por los 4 paneles de detalle (mismo mecanismo que `EntityTasksList`).
- **NoteForm** — form de compose/edit de una Note, siempre expandido (no popover-al-click).

### `frontend/src/components/activity/` (2026-08-30, Activity Log Unidad 3)
- **EntityActivityList** — tab "Activity" compartido por los 4 paneles de detalle, mismo mecanismo que `EntityNotesList`/`EntityTasksList` pero de solo lectura (sin compose, sin click-to-edit). Cada fila es expandible ("Show detail") para ver el diff campo por campo.

### Activity Log — Unidad 4 (2026-08-30, HR/Payroll)
10 field configs más en `src/modules/activity/fieldConfigs/`, mismo mecanismo que Tier 1:
**timeOffPolicyFieldConfig**, **timeOffRequestFieldConfig**, **statusDefinitionFieldConfig**,
**customFieldDefinitionFieldConfig**, **fieldCatalogDefinitionFieldConfig**,
**payFrequencyFieldConfig**, **paymentMethodFieldConfig**, **employeeCompensationFieldConfig**
(excluye a propósito `paymentAccountDataEncrypted`/`contractPdf`/`confirmedIp` — nunca deben
aparecer en un log, ni cifrados; create-only, `EmployeeCompensation` nunca se edita in-place),
**employeeTerminationFieldConfig**, **payrollRunFieldConfig**. `resolvers.ts` ganó
**resolveTimeOffPolicyName**/**resolvePayFrequencyName**/**resolvePaymentMethodName**. Servicios que
ahora llaman `recordActivity`: `timeOffPolicyService`/`timeOffRequestService`/`statusService`/
`customFieldService`/`fieldCatalogService`/`payFrequencyService`/`paymentMethodService`/
`employeeCompensationService`/`terminationService`/`payrollRunService` — cada `create`/`update`
tocado ganó un `changedByUserId` (requerido salvo `createFieldCatalogDefinition`, opcional por el
mismo motivo que `createEmployee`: el seed de datos de ejemplo del onboarding lo llama sin actor).

### Activity Log — Unidad 5 (2026-08-30, resto de CRM + cross-module + vistas/forms)
7 field configs más: **pipelineFieldConfig.ts** (exporta `pipelineActivityFieldConfig` +
`pipelineStageActivityFieldConfig`), **taskFieldConfig.ts**, **noteFieldConfig.ts**,
**tagFieldConfig.ts** (una entrada `create`/`delete` por asignación/remoción de tag — no hay
`update`, un tag solo se asigna o se saca), **savedViewFieldConfig.ts**, **publicFormFieldConfig.ts**.
Servicios: `pipelineService`/`taskService`/`noteService`/`tagService`/`savedViewService`/
`publicFormService` — mismo criterio de `changedByUserId` requerido salvo donde ya existía un actor
inline (`createPipeline`/`updatePipeline`/`createTask`/`createNote`/`createSavedView`/
`updateSavedView`/`deleteSavedView` ya traían `createdById`/`updatedById`/`userId`, no hicieron
falta cambios de firma ahí).

### Activity Log — Unidad 6, completa (2026-08-30/31, cuenta/plataforma)
3 field configs (2026-08-30): **tenantFieldConfig.ts** (solo `currency`/`plan`, los únicos campos
que `updateTenantCurrency`/`updateTenantPlan` tocan), **userFieldConfig.ts** (solo `role`/`status`
— nunca `passwordHash`; exporta también `userDisplayName`), **invitationFieldConfig.ts**.
Servicios: `tenantService.updateTenantCurrency`, `planService.updateTenantPlan`,
`tenantUserService.updateTenantUser` (ya tenía `actingUser`, sin cambio de firma),
`invitationService.createInvitation`/`cancelInvitation`/`acceptInvitation`.

**2026-08-31**: Alejandro cuestionó el scope cut original de Subscription/GoogleCalendarConnection/
StripeConnection ("si los dispara un webhook pero salen desde un usuario específico, habría que
registrar eso") y pidió cubrirlas. 3 field configs más: **googleCalendarConnectionFieldConfig.ts**
(solo `googleAccountEmail`), **stripeConnectionFieldConfig.ts** (`apiKeyMode`/`stripeAccountId`,
nunca `apiKeyEncrypted`), **subscriptionFieldConfig.ts** (`plan`/`status`/`cancellationReason`/
`cancellationEffectiveAt`, no `cancelledAt` — redundante con el `changedAt` de la entrada). Google
Calendar y Stripe connect/disconnect ya tenían un actor real disponible de forma síncrona en el
mismo call site — solo faltaba cablear `recordActivity` (ver `googleCalendarAuthService.ts`/
`stripeService.ts` arriba). Subscription necesitó un mecanismo nuevo, `lastActionByUserId`/
`lastActionAt` en el propio modelo — ver `syncSubscriptionAndTenant` arriba y
`docs/general/spec-activity-log.md` §6 para el detalle completo.

### `frontend/src/components/tasks/`
- **EntityTasksList** — tab "Tasks" compartido por los 4 paneles de detalle.
- **MyTasksWidget** — widget "My tasks" de `/overview`, reusa el mismo popover de edición que `EntityTasksList` vía `TaskFormPopover`. Desde 2026-08-22, el propio endpoint (`listMyTasks`) ya no devuelve tareas completadas — el widget no filtra nada del lado del cliente, solo desaparecen del `state` en el próximo `load()`.
- **TaskForm** — form de compose/edit de un Task, siempre expandido dentro del tab.
- **TaskFormPopover** — wrapper de `TaskForm` en un `Popover`, para los 2 lugares que sí necesitan popover-al-click (el widget de Overview y las entradas del calendario) — nunca reimplementar el form ahí adentro, envolver el mismo `TaskForm`.
