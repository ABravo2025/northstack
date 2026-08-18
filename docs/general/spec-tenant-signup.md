# Spec: Tenant Signup — Email Verification + Survey

Mockup de referencia: `tenant-signup-mockup.html` (aprobado).

## Objetivo

Reemplazar el registro de un solo paso actual (`RegisterPage.tsx` → `POST /api/tenants/register`,
que crea Tenant + owner User + Session sin confirmar que el email sea real) por un flujo verificado
de varios pasos: email → verificación por link → survey de 3 pasos → creación de cuenta.

## Por qué

Hoy cualquiera puede registrarse con un email que no le pertenece — no hay ninguna verificación.
Esto además agrupa un formulario largo (10 campos) en pasos más digeribles por tipo de dato.

## Flujo

```
Screen 1 (email) → Screen 2 (check inbox) → [click link en el mail] →
Screen 3a (Company) → Screen 3b (You) → Screen 3c (Security) → cuenta creada → /plans
```

## Screen 1 — Email

- Reemplaza el form actual. Un solo campo: email de trabajo.
- Al submit → `POST /api/tenants/signup/start`:
  1. Valida formato de email.
  2. Corre el validador de dominio duplicado que hoy vive en `registerTenantWithOwner`
     (extraer a un helper compartido, no duplicar la lógica — mismo criterio de excluir
     `GENERIC_EMAIL_DOMAINS`, mismo mensaje de error).
  3. Si el dominio está bloqueado → error inline en el campo, no se manda nada. Si pasa →
     crea un `EmailVerification` (ver modelo abajo) y manda el mail (`mailer.ts`,
     `sendSignupVerificationEmail` nueva, mismo patrón texto+HTML que `sendInvitationEmail`).
  4. El envío del mail es best-effort (igual que invitaciones) — un fallo de SMTP no bloquea
     el avance a Screen 2, salvo que el paso 3 ya haya rechazado por dominio duplicado.
- Rate limiting: mismo criterio que login/register existente (ventana por IP), bucket propio
  para no pisar el rate limit de login/register actual.

## Screen 2 — Check your inbox

- Muestra el email cargado (estático).
- "Resend email" con cooldown de 30s en el frontend → `POST /api/tenants/signup/resend`
  (mismo body `{ email }`, misma validación de dominio, invalida el token anterior y emite uno
  nuevo — solo el último link mandado es válido).
- "Wrong email? Start over" → vuelve a Screen 1.

## Link de verificación

- Formato: `{APP_BASE_URL}/register/complete?token={token}`.
- Al cargar esa página, el frontend llama `GET /api/tenants/signup/verify/:token`:
  - Válido + no vencido + no verificado aún → marca `verifiedAt = now`, devuelve `{ email }`.
  - Ya verificado (alguien reabre el link o refresca) → idempotente, devuelve `{ email }` igual,
    no error.
  - Inexistente o vencido → 404/410, el frontend muestra "This link has expired" con un link
    de vuelta a Screen 1.
- `expiresAt`: 24hs desde la creación.

## Screen 3 — Survey (solo después de verificar)

El token se mantiene en la URL/estado del frontend durante los 3 pasos. **Nada se persiste en
el backend hasta el submit final** del paso 3c — mismo criterio que ya usa el resto de la app de
nunca dejar un Tenant/User huérfano a mitad de camino.

### 3a — Company

| Campo | Requerido | Nota |
|---|---|---|
| Company name | Sí | `Tenant.name` |
| Industry | Sí | `Tenant.industry` — pasa a requerido para altas nuevas (ver nota de schema abajo) |
| Company size | Sí | select, `Tenant.companySize` — mismo criterio |
| Country | Sí | select, `Tenant.country` — mismo criterio |
| How did you hear about us? | No | `Tenant.acquisitionChannel`, sin cambios, sigue opcional |

(El campo "what do you want to use Northstack for first?" que se había armado en el mockup
inicial se descartó — no queda en el survey final.)

### 3b — You

| Campo | Requerido | Nota |
|---|---|---|
| First name | Sí | `User.firstName` |
| Last name | Sí | `User.lastName` |
| Phone | Sí | `User.phone` |
| Your role | No | **campo nuevo** — ver aviso de naming abajo |

**Ojo con el naming:** `User.role` ya existe como el enum de permisos (`owner`/`admin`/`member`).
El campo nuevo de "rol dentro de la empresa" necesita otro nombre — propuesta: `User.jobFunction`
(string nullable o enum nuevo `founder_ceo`/`hr`/`ops_finance`/`sales`/`other`). No reusar `role`.

### 3c — Security

| Campo | Requerido | Nota |
|---|---|---|
| Password | Sí | mismas reglas actuales (8+ caracteres, 1 mayúscula, 1 número, 1 especial), checklist en vivo igual que `PasswordChecklist.tsx` |
| Confirm password | Sí | misma validación de match actual |
| Aceptar ToS/Privacy | Sí | `acceptedTerms` → `User.acceptedTermsAt`, sin cambios |

### Submit final

- `POST /api/tenants/register` — **cambia el body**: agrega `verificationToken` (ahora requerido).
  El backend revalida el token (verificado, no vencido, email coincide) antes de crear nada.
- Crea Tenant + owner User + Session en la misma operación atómica de siempre.
- Nuevo: `Tenant.status = 'trialing'`, `Tenant.trialEndsAt = now + 15 días`, `Tenant.plan = null`
  (se elige en la pantalla siguiente, ver `spec-subscription-plans.md`).
- Consume el `EmailVerification` (marcarlo usado o borrarlo, no importa cuál mientras no se
  pueda reusar).
- Redirect: **ya no** `/overview` → `/plans`.

## Modelo de datos

```prisma
model EmailVerification {
  id         String    @id @default(cuid())
  email      String
  token      String    @unique
  expiresAt  DateTime
  verifiedAt DateTime?
  createdAt  DateTime  @default(now())
}
```

- `User.jobFunction String?` — nuevo, aditivo, nullable.
- `Tenant.industry` / `Tenant.companySize` / `Tenant.country` — **sin cambio de schema** (siguen
  nullable). Se vuelven requeridos solo a nivel de validación de la aplicación para altas nuevas;
  los tenants existentes con esos campos en null no se tocan.

## Fuera de alcance en esta ronda

- `AcceptInvitePage.tsx` no se toca — un usuario invitado ya es confiable (lo invitó un admin
  existente), no necesita verificación de email nueva.
- `POST /api/auth/register` (usuario suelto, flujo de aceptar invitación) sin cambios.
