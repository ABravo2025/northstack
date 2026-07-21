# Brief de desarrollo — semana del 2026-07-21

Este documento es un brief técnico explícito para que un desarrollador (o un agente de IA) lo
ejecute sin necesitar contexto conversacional previo. Cada tarea incluye: estado actual (con
archivo:línea), el cambio requerido, y el criterio de aceptación. Orden de ejecución sugerido:
Bloque 1 → 2 → 3 → 4 (ver razón de orden en cada bloque).

Referencia de convenciones del proyecto (para que el estilo del código nuevo sea consistente):
- Multi-tenant: casi todo lleva `tenantId`, y cada lectura/escritura por id verifica
  `entity.tenantId === user.tenantId` antes de operar (404 si no matchea, no 403 — no revelar
  que el recurso existe en otro tenant).
- Sin migrations de Prisma: el proyecto usa `prisma db push` directo contra la base productiva
  de Neon (no hay ambiente de staging separado). Cualquier cambio de schema en este brief debe
  aplicarse así, con cuidado — pushes aditivos primero, nunca destructivos sin confirmar antes.
- Envío de email: `src/lib/mailer.ts`, usa Zoho SMTP vía `nodemailer`, ya configurado con
  `ZOHO_SMTP_USER`/`ZOHO_SMTP_PASSWORD`. Los envíos son siempre "best-effort": si el email falla,
  no debe romper la operación principal (mismo patrón que `createInvitation` en
  `src/modules/tenant/tenantService.ts:257-266` — `.catch()` que solo loggea).
- Nunca pasar `req.body` crudo a un `prisma.update`/`.create` sin whitelist explícita de campos.

---

## Bloque 1 — Seguridad (hacer primero, no depende de nada más)

### 1.1 — Fix de mass assignment / IDOR en `PATCH` employees y clients

**Estado actual:**
- `src/modules/hr/employeeService.ts:116-130` (`updateEmployee`) — `prisma.employee.update({ data: input })`, donde `input` llega directo desde `req.body` en `src/app.ts:494` (`updateEmployee(req.params.employeeId, req.body, user.id)`), sin ninguna whitelist.
- `src/modules/clients/clientService.ts:61-71` (`updateClient`) — mismo patrón, `req.body` crudo pasado en `src/app.ts:1203`.
- Los tipos TypeScript `UpdateEmployeeInput`/`UpdateClientInput` (mismos archivos, arriba de cada función) están bien acotados, pero **no protegen en runtime** — `req.body` es `any`, así que cualquier campo extra (`tenantId`, `userId`, `id`) viaja intacto hasta Prisma porque son columnas escalares de FK, asignables directo sin sintaxis de relación anidada.
- Impacto real: un usuario autenticado con cualquier rol puede mandar `{"tenantId": "<otro-tenant>"}` en el PATCH de su propio empleado/cliente y reasignarlo a un tenant ajeno.

**Cambio requerido:**
1. En `employeeService.ts`, reconstruir `data` en `updateEmployee` explícitamente campo por campo (mismo patrón que ya usa `createEmployee` un poco más arriba en el mismo archivo, o `updateStatusDefinition` en `statusService.ts`):
   ```ts
   const data: Prisma.EmployeeUpdateInput = {};
   if (input.firstName !== undefined) data.firstName = input.firstName;
   if (input.lastName !== undefined) data.lastName = input.lastName;
   if (input.email !== undefined) data.email = input.email.toLowerCase(); // mismo lowercasing que createEmployee
   if (input.department !== undefined) data.department = input.department;
   if (input.statusId !== undefined) data.statusDefn = { connect: { id: input.statusId } };
   if (input.managerId !== undefined) data.manager = input.managerId ? { connect: { id: input.managerId } } : { disconnect: true };
   ```
   (Ajustar sintaxis exacta de `connect`/`disconnect` según cómo esté nombrada la relación en `schema.prisma` — el objetivo es que **ningún campo fuera de esta lista** pueda llegar a `prisma.employee.update`.)
2. Mismo tratamiento en `clientService.ts` `updateClient`, con los campos de `UpdateClientInput` (`firstName`, `lastName`, `email`, `company`, `statusId`).
3. **Agregar validación de que `statusId` pertenece al tenant** en ambos servicios antes de aplicarlo — hoy `managerId` sí se valida en `src/app.ts:482-491` (busca el manager y compara `tenantId`) pero `statusId` no se valida en ningún lado del flujo de update. Buscar el `StatusDefinition` por id, rechazar con 400 si no existe o si `statusDefinition.tenantId !== existing.tenantId`.

**Criterio de aceptación:**
- Un `PATCH /api/hr/employees/:id` con `{"tenantId": "<otro-id>"}` en el body no cambia el `tenantId` del empleado (se ignora el campo, no rompe la request).
- Un `PATCH` con un `statusId` que pertenece a otro tenant devuelve 400, no lo aplica.
- Los flujos existentes (editar nombre, cambiar status válido, asignar manager válido, quitar manager) siguen funcionando igual que antes — correr `npm test` (backend) y probar los 4 casos con `curl` contra un tenant de prueba.

### 1.2 — Rate limiting en rutas de auth

**Estado actual:** no hay rate limiting en `/api/auth/login`, `/api/auth/register`, `/api/tenants/register` (`src/app.ts`). **Importante:** ya existe un rate limiter propio, `src/lib/rateLimit.ts` (`isRateLimited(key)`, in-memory, ventana de 60s, usado hoy solo en el submit de Public Forms) — **reusar este, no agregar `express-rate-limit` como dependencia nueva**, evita sumar un paquete para algo que ya existe en el proyecto.

**Cambio requerido:** en los 3 endpoints, antes de procesar, llamar `isRateLimited(clientIp)` (mismo patrón de extracción de IP que `src/app.ts` ya usa en el submit público — buscar `x-forwarded-for`) y devolver 429 si corresponde. Considerar un límite más estricto que el de Public Forms (ej. 5 intentos/60s puede ser demasiado permisivo para login — evaluar bajar a 5 intentos/15 min para login específicamente; si `rateLimit.ts` no soporta ventanas configurables por llamada, extenderlo con un segundo parámetro opcional de ventana/máximo en vez de hardcodear).

**Criterio de aceptación:** 6+ intentos de login fallidos seguidos desde la misma IP en la ventana configurada devuelven 429 en el intento que excede el límite.

### 1.3 — Helmet (cabeceras de seguridad HTTP)

**Estado actual:** `src/app.ts:94-97` no configura ninguna cabecera de seguridad (`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.).

**Nota:** esto sí requiere una dependencia nueva (`helmet`, no está en `package.json`) — es middleware in-process, sin llamada a servicio externo, pero de todos modos avisar antes de instalarla, siguiendo la convención del proyecto de justificar cualquier paquete nuevo.

**Cambio requerido:** `npm install helmet`, `app.use(helmet())` cerca del resto de middleware global en `src/app.ts` (junto a `app.use(cors())`). Probar que el frontend sigue funcionando después (Helmet por default es razonablemente permisivo, pero verificar que no rompa nada, en particular si hay algún iframe/recurso cross-origin que dependa de headers relajados).

### 1.4 — Expiración de sesiones + revocar al cambiar password

**Estado actual:**
- `model Session` (`prisma/schema.prisma:295-301`) no tiene `expiresAt` — un token es válido para siempre hasta logout explícito.
- `authenticateToken` (`src/modules/auth/authService.ts:140-147`) no chequea expiración (no hay campo que chequear).
- `changeOwnPassword` (`authService.ts:202-222`) actualiza el hash pero no toca ninguna sesión — un token robado sigue funcionando después de que la víctima cambia su contraseña.

**Cambio requerido:**
1. Schema (push aditivo, no destructivo): agregar `expiresAt DateTime` a `Session`, default calculado en el `create` (no en el schema) — ej. `now() + 30 días`. Al no haber sesiones viejas con este campo, sembrar `expiresAt` para las sesiones ya existentes en producción con un valor futuro razonable (mismo patrón de script de backfill ya usado en el proyecto — ver `scripts/backfill-owner-employees.ts` como referencia de estilo) para no desloguear a todo el mundo de golpe.
2. `authenticateToken`: rechazar (devolver `null`) si `session.expiresAt < new Date()`.
3. Opcional pero recomendado: renovar `expiresAt` en cada uso exitoso (sliding expiration) en vez de expiración fija desde la creación — evaluar con el usuario si prefiere fija o deslizante antes de implementar, no asumir.
4. `changeOwnPassword`: después de actualizar el hash, borrar todas las **otras** sesiones del usuario (`prisma.session.deleteMany({ where: { userId, token: { not: <token actual de la request> } } })` — mantener viva la sesión actual para no desloguear a quien acaba de cambiar su propia contraseña).

**Criterio de aceptación:** una sesión con `expiresAt` en el pasado no autentica (401). Cambiar la contraseña propia invalida cualquier otro token activo de ese usuario, verificable con `curl` (loguearse en 2 "dispositivos" simulados con 2 sesiones, cambiar password desde una, confirmar que la otra ya no funciona).

### 1.5 — Verificar `user.status` en cada request autenticado

**Estado actual:** `authenticateToken` devuelve el usuario sin chequear `user.status` — un usuario marcado `inactive` (desde `CompanyUsersPage` → `PATCH /api/tenants/users/:userId`) sigue pudiendo usar cualquier sesión activa que ya tenía.

**Cambio requerido:** en `authenticateToken` (o en `validateSession`/`authenticateUser` en `src/app.ts`, el que efectivamente se llama en cada ruta), rechazar si `user.status !== 'active'`.

**Criterio de aceptación:** desactivar un usuario desde Company Users mientras tiene una sesión abierta en otro navegador corta el acceso de esa sesión en la siguiente request (no hace falta esperar a que expire).

---

## Bloque 2 — Registro

### 2.1 — Checkbox de aceptar ToS/Privacy al registrarse

**Estado actual:** `POST /api/tenants/register` y `POST /api/auth/register` no piden ni registran ninguna aceptación. `docs/legal/terms-of-service.md`/`privacy-policy.md` existen y están publicados en `landing/terms.html`/`landing/privacy.html`, pero nada los conecta al flujo de alta.

**Cambio requerido:**
1. Schema: agregar a `User` (push aditivo) `acceptedTermsAt DateTime?` — alcanza con la fecha, no hace falta versión todavía (no hay versión de documento trackeada hoy).
2. Backend: `registerTenantWithOwner` (`tenantService.ts`) y `registerUser`/`acceptInvitation` (donde corresponda que un usuario nuevo acepte) deben requerir un campo `acceptedTerms: boolean` en el input y rechazar con 400 si no viene en `true`. Al crear el usuario, setear `acceptedTermsAt: new Date()`.
3. Frontend: checkbox obligatorio (no premarcado) en `RegisterPage.tsx` y `AcceptInvitePage.tsx` (modo registro), con link a `/terms` y `/privacy` (confirmar con el usuario si esas rutas ya sirven los docs dentro de la app, o si el link debe apuntar a `joinnorthstack.com/terms`/`/privacy` — hoy esos HTML viven en la landing, no en la app).

**Criterio de aceptación:** intentar registrarse sin tildar el checkbox no envía el form (validación de frontend) y el backend rechaza igual si se intenta saltear (curl directo sin el campo). Un registro exitoso deja `acceptedTermsAt` seteado en la fila del `User`.

---

## Bloque 3 — Notificaciones (depende de que Bloque 1.2/1.3 ya estén, para no exponer estos endpoints nuevos sin rate limiting/Helmet)

### 3.1 — Email al enviarse/recibirse una submission de Public Form

**Estado actual:** `submitPublicForm` (`src/modules/hr/publicFormService.ts:131-209`) crea el Employee/Client y termina — no manda ningún email.

**Cambio requerido:**
1. `src/lib/mailer.ts`: agregar `sendPublicFormSubmissionEmail` (a los admins del tenant) y `sendPublicFormConfirmationEmail` (al que envió el form), mismo patrón que `sendInvitationEmail` (texto + HTML, best-effort).
2. En el endpoint `POST /api/public/:tenantSlug/:formSlug/submit` (`src/app.ts`, después de que `submitPublicForm` devuelva éxito): buscar los `User` con `role IN (owner, admin)` de ese tenant (`prisma.user.findMany({ where: { tenantId: form.tenantId, role: { in: ['owner', 'admin'] } } })`) y mandarles el email de aviso; mandar la confirmación al email que completó el form.
3. Ambos envíos con `.catch()` que solo loggea — no deben poder hacer fallar el submit ya exitoso.

**Criterio de aceptación:** enviar un Public Form de prueba dispara 2 emails reales (verificar en una inbox de prueba) — uno a los admins del tenant, uno al remitente — y el submit sigue devolviendo 201 aunque el envío de email falle (simular apagando las credenciales de SMTP temporalmente).

### 3.2 — Email de eventos accionables de Time Off

**Estado actual:** `createTimeOffRequest` (`src/modules/hr/timeOffRequestService.ts:25-...`) y `decideTimeOffRequest` (línea 136-170) no mandan ningún email — todo se ve solo entrando a la pestaña correspondiente en `/hr/time-off`.

**Cambio requerido:**
1. En `createTimeOffRequest`, después de crear el `request`: si `request.approverId` existe (no null) y la política requiere aprobación (`!autoApprove`), buscar el `User` vinculado a ese `Employee` (`prisma.employee.findUnique({ where: { id: request.approverId } })` → su `userId`) y mandarle un email "Nueva solicitud de Time Off para aprobar".
2. En `decideTimeOffRequest`, después de actualizar el `request` a `approved`/`rejected`: buscar el `User` vinculado al `Employee` que hizo la solicitud (`request.employeeId`) y mandarle un email con la decisión.
3. Mismo criterio best-effort que el resto — el email no debe poder romper la creación/decisión de la solicitud.
4. Nuevas funciones en `mailer.ts`: `sendTimeOffRequestPendingEmail`, `sendTimeOffRequestDecidedEmail`.

**Criterio de aceptación:** crear una solicitud con un manager asignado dispara un email al manager; aprobarla/rechazarla dispara un email al empleado. Una solicitud auto-aprobada (política sin `requiresApproval`) no dispara el email de "pendiente" (no tiene sentido pedir aprobación de algo ya aprobado) pero sí podría disparar el de "decidida" — a confirmar con el usuario si aplica a ese caso o no antes de implementarlo.

### 3.3 — Canal de feedback/reporte de bugs

**Estado actual:** no existe ningún mecanismo para que un usuario reporte un problema desde adentro de la app.

**Decisión pendiente antes de implementar — no asumir:** ¿a qué dirección de email llegan estos reportes? Necesita confirmación explícita del usuario (regla del proyecto: credenciales/destinos sensibles siempre se preguntan, no se asumen) — probablemente un env var nuevo, ej. `FEEDBACK_EMAIL`.

**Cambio requerido (una vez confirmado el destino):**
1. Backend: `POST /api/feedback` (autenticado, cualquier rol), body `{ message: string }`. Handler junta `message` + `user.email` + `user.tenantId`/nombre de tenant + la URL de la página desde la que se mandó (pasarla también en el body, el frontend la conoce) y llama a una función nueva en `mailer.ts` (`sendFeedbackEmail`) hacia `FEEDBACK_EMAIL`.
2. Frontend: un botón/ícono accesible globalmente (candidato: `TopBar.tsx`, cerca del dropdown de usuario, o flotante) que abre un modal/`SlideOver` chico con un textarea y "Enviar" — reusar `ToastProvider` para la confirmación de envío, mismo patrón que el resto de la app.

**Criterio de aceptación:** mandar feedback desde cualquier página autenticada llega como email real a la dirección configurada, incluyendo de qué usuario/tenant/página vino.

---

## Bloque 4 — Rematar Public Forms

### 4.1 — Mensaje de agradecimiento personalizable por formulario

**Estado actual:** `PublicFormPage.tsx:131-138` muestra siempre el mismo texto fijo ("Thank you! Your submission has been received.") sin importar el tenant/form.

**Cambio requerido:**
1. Schema: agregar `thankYouMessage String?` a `model PublicForm` (`prisma/schema.prisma:262-274`) — push aditivo, nullable, sin default (si es null, el frontend cae al texto genérico actual).
2. Backend: `createPublicForm`/`updatePublicForm` (`publicFormService.ts`) aceptan el campo nuevo; el endpoint público `GET /api/public/:tenantSlug/:formSlug` (`src/app.ts`) lo incluye en la respuesta.
3. Frontend: `PublicFormsSettingsPage.tsx` — un textarea opcional en el form del `SlideOver` ("Thank you message", placeholder con el texto default actual). `PublicFormPage.tsx` — usar `config.thankYouMessage || 'Thank you! Your submission has been received.'` en el estado `submitted`.

**Criterio de aceptación:** un form sin mensaje personalizado sigue mostrando el texto genérico de siempre (no rompe los forms ya creados); uno con mensaje personalizado lo muestra tal cual.

### 4.2 — Honeypot anti-spam

**Estado actual:** las únicas defensas son Turnstile + `isRateLimited` (`src/lib/rateLimit.ts`), ambas ya en `PublicFormPage.tsx`/el endpoint de submit.

**Cambio requerido:**
1. Frontend (`PublicFormPage.tsx`): agregar un campo de input extra, fuera de la vista real (no `display: none` — algunos bots lo detectan y lo saltean; usar posicionamiento off-screen tipo `position: absolute; left: -9999px` + sin `tabIndex`, con un `name`/`label` que suene tentador para un bot, ej. "Website" o "Company URL") al estado del form, enviado igual que cualquier otro campo (ej. `honeypot: string`).
2. Backend (`submitPublicForm` en `publicFormService.ts`, o el endpoint mismo en `app.ts`): si `honeypot` viene con cualquier valor no vacío, devolver éxito falso (**responder 201 igual, sin crear el registro** — no devolver 400, para no darle señal al bot de que fue detectado) y no procesar el submit.

**Criterio de aceptación:** un submit con el campo honeypot vacío funciona normal. Un submit con el honeypot completado (simulado con `curl` directo al endpoint, no vía la UI) responde 201 pero no crea ningún Employee/Client nuevo — verificar contando filas antes/después.

---

## Notas para quien ejecute este brief

- Cada tarea del Bloque 1 toca autenticación/sesiones — probar exhaustivamente antes de dar por cerrado el bloque completo, es la parte más sensible a romper accesos existentes en producción.
- `npm test` (backend) y `npm run build` (frontend) deben quedar en verde después de cada tarea, no solo al final del bloque.
- Cualquier cambio de schema (`1.4`, `2.1`, `4.1`) se aplica con `prisma db push` contra la base productiva de Neon — no hay ambiente de staging. Revisar el push antes de correrlo (aditivo, sin `--accept-data-loss` salvo que se confirme explícitamente que hace falta).
- Los puntos marcados "a confirmar con el usuario" (3.2, 3.3) tienen una decisión de producto o un dato sensible pendiente — no improvisar la respuesta, preguntar antes de implementar esa parte específica.
