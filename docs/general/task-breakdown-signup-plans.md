# Task breakdown — Tenant Signup + Subscription Plans

Ordenado para que cada unidad sea construible y verificable por separado, mismo criterio
pieza-por-pieza ya usado en Payroll/Clients. Specs de referencia: `spec-tenant-signup.md`,
`spec-subscription-plans.md`. Mockups: `tenant-signup-mockup.html`,
`subscription-plans-mockup.html`.

## Backend — Signup

1. **Schema**: agregar modelo `EmailVerification` (aditivo), agregar `User.jobFunction`
   (aditivo, nullable).
2. **`src/lib/mailer.ts`**: agregar `sendSignupVerificationEmail` (mismo patrón texto+HTML que
   `sendInvitationEmail`).
3. **`POST /api/tenants/signup/start`**: valida formato de email, corre el validador de dominio
   duplicado (extraer la lógica existente de `registerTenantWithOwner` a un helper compartido —
   no duplicarla), crea `EmailVerification`, manda el mail. Rate limited (bucket propio, misma
   ventana que el rate limiting de auth existente).
4. **`POST /api/tenants/signup/resend`**: misma validación de dominio/rate-limit, invalida el
   token anterior, emite y manda uno nuevo.
5. **`GET /api/tenants/signup/verify/:token`**: público, valida y marca `verifiedAt`, idempotente
   en llamadas repetidas, devuelve `{ email }` o 404/410 si es inválido/venció.
6. **`registerTenantWithOwner` (`tenantService.ts`)**:
   - Acepta `verificationToken` en el input, lo valida (verificado, no vencido, email coincide)
     antes de crear nada.
   - El validador de dominio duplicado puede quedar acá también como defensa en profundidad, pero
     no reemplaza el chequeo del paso 3 — ese corre primero, antes de mandar el mail.
   - Setea `status: 'trialing'`, `trialEndsAt: now + 15 días`, `plan: null` en el Tenant creado.
   - `industry`/`companySize`/`country` pasan a requeridos en el input type (400 si faltan) — el
     schema en sí sigue nullable.
7. **Tests**: actualizar el test de registro existente para incluir un `verificationToken`
   válido; agregar tests de token vencido/inexistente/ya usado, y del validador de dominio
   corriendo en `signup/start` en vez de en `register`.

## Frontend — Signup

8. **`RegisterPage.tsx`** dividido en el flujo nuevo: Screen 1 (email) → Screen 2 (check inbox,
   resend con cooldown) — reemplaza el form único actual.
9. **`CompleteSignupPage.tsx`** nueva, alcanzada vía `/register/complete?token=`: llama al
   endpoint de verificación al montar, muestra el survey de 3 pasos solo si la verificación fue
   exitosa, muestra un estado de error para token inválido/vencido.
10. Conectar el submit final del survey al `POST /api/tenants/register` actualizado (ahora
    incluye `verificationToken`).
11. Actualizar el routing (`App.tsx`) para que un registro exitoso redirija a `/plans` en vez de
    `/overview`.

## Backend — Subscription plans

12. **Schema**: agregar `Tenant.plan` (enum `starter`/`growth`/`scale`, nullable), extender el
    enum `Tenant.status` con `trialing`/`past_due`, agregar `Tenant.gracePeriodEndsAt`,
    `Tenant.lockedPriceCents`, `Tenant.lockedPriceSetAt` (todo aditivo).
13. **`PATCH /api/tenants/me/plan`**: setea `plan` + `lockedPriceCents` (desde una tabla de
    precios del lado del servidor, nunca confiar en un precio que mande el cliente) +
    `lockedPriceSetAt`. Solo lo puede llamar el owner del tenant. Si se llama más de una vez, no
    resetear `trialEndsAt` (ya está seteado desde el registro).
14. **Cron** (mismo patrón de ventana de recuperación + idempotencia que el cron de Payroll):
    job diario que pasa `trialing` → `past_due` cuando vence `trialEndsAt`, y `past_due` →
    `suspended` cuando vence `gracePeriodEndsAt`. Setea `gracePeriodEndsAt = trialEndsAt + 14
    días` en la primera transición.
15. **Tests**: transiciones del cron (con un "now" fijo/mockeado para simular que se cruzan
    ambos umbrales), chequeo de permiso en `PATCH /api/tenants/me/plan` (solo owner), el precio
    congelado no se mueve si cambia el precio de lista más adelante.

## Frontend — Subscription plans

16. **`PlansPage.tsx`** nueva en `/plans`: 2 tarjetas visibles (Starter/Growth) según el mockup
    aprobado, badge "Recommended for you" según `Tenant.companySize`, banner de precio de
    lanzamiento + precio tachado, link discreto "Get in touch" para Scale (alcanza con un
    `mailto:` simple en esta ronda).
17. **Route guard**: un tenant con `status: 'trialing'` y `plan: null` se redirige a `/plans` si
    intenta entrar a cualquier otra ruta primero (cubre el caso de cerrar la pestaña a mitad de
    la elección).
18. **Banner** en `AppLayout.tsx` (o un lugar compartido similar) para tenants en `past_due` —
    muestra los días restantes del período de gracia. No hace falta banner para `trialing` en
    esta ronda salvo que se prefiera agregarlo (no está en el mockup, decisión del desarrollador).

## Explícitamente fuera de este breakdown

- Integración con Paddle, checkout real, UI de "agregar método de pago".
- Pantalla de autogestión de suscripción en `/settings`.
- Flujo de venta real de Scale/Custom.
- `AcceptInvitePage.tsx` — sin cambios.
