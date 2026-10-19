# Spec: Verificación en dos pasos (2FA)

**Estado:** aprobada por Alejandro el 2026-10-19 con las decisiones de §0.1. En construcción en `staging` (rama `feat/2fa`). Era el bloque F de `spec-shifts-fase2.md`: Alejandro pidió
que el QR de fichaje fuera genérico para reusarlo acá ("QR sync con Google Authenticator y después cuando
quieran loggear tengan que poner el número").

## 0. Recomendación

**Códigos de una app autenticadora (TOTP, RFC 6238) + códigos de recuperación.** Es lo que Alejandro pidió y
lo que conviene como primer paso:

| Opción | Seguridad | Costo / servicio nuevo | Comentario |
|---|---|---|---|
| **App autenticadora (TOTP)** | Alta | Ninguno | Funciona con Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden. Usa el `QrCode` genérico que ya existe. **Recomendada.** |
| Código por email | Media-baja | Ninguno (Zoho) | Si alguien entra al email, entra a todo (y ya puede resetear la contraseña). Sirve poco como segundo paso. |
| Código por SMS | Media | Twilio u otro (pago por mensaje) | Servicio nuevo, costo por login, SIM swapping. No. |
| **Passkeys (WebAuthn)** | Muy alta (no se puede phishear) | Ninguno | Huella/Face ID/Windows Hello. Más trabajo (y la app Android necesita un plugin). **Buena segunda etapa.** |


## 0.1 Decisiones de Alejandro (2026-10-19)

1. **Solo app autenticadora** (TOTP). Passkeys, SMS y email quedan afuera.
2. **Todos los planes.** **Obligatoria** para el **dueño de la cuenta** y para quien tenga permisos de
   movimientos sensibles: **`manage_billing`** (plan, facturación) y **`manage_payments`** (Stripe/cobros).
   Para todos los demás, **opcional**. No hay política por empresa: la regla es fija.
3. **Recordar este dispositivo: 30 días.**
4. **Staff del Admin Center: obligatoria** desde el primer día.

Consecuencias:
- Quien la tiene obligatoria y todavía no la configuró, en su próximo login pasa por la activación antes de
  entrar (sesiones ya abiertas siguen; ven un aviso fijo hasta activarla). Al registrarse una empresa nueva,
  el dueño ve el mismo aviso.
- Quien la tiene obligatoria no puede desactivarla (sí regenerar códigos o que se la restablezcan).
- **Restablecer la contraseña ya no inicia sesión** si la persona tiene 2FA: vuelve al login, que pide el código.

## 1. Cómo se ve

**Activarla (cada persona):** Configuración → Perfil → **Verificación en dos pasos** → Activar.
1. Se muestra un QR (el mismo componente del fichaje) y la clave en texto para quien no puede escanear.
2. La persona lo escanea con su app y escribe el código de 6 dígitos para confirmar.
3. Se muestran **10 códigos de recuperación** (de un solo uso) para descargar/copiar. No se vuelven a mostrar.

**Entrar:** email + contraseña → si tiene 2FA, una segunda pantalla pide el código de 6 dígitos (o un código
de recuperación). Opción **"Recordar este dispositivo 30 días"**.

**Desactivar / regenerar códigos:** desde el mismo lugar, pidiendo un código actual.

**Perdió el celular:** usa un código de recuperación. Si tampoco los tiene: quien tiene `manage_users` en su
empresa puede **restablecer** su 2FA (queda en el Activity Log y le llega un email a la persona). Para el
dueño de la cuenta, lo restablece el equipo de Northstack desde el Admin.

**Obligatoria (§0.1):** dueño, `manage_billing`, `manage_payments` y staff de Northstack. Quien no la tiene configurada, al entrar va directo a activarla.

## 2. Reglas

- La clave secreta se guarda **cifrada** (mismo cifrado que los tokens de Google, `googleTokenEncryption.ts`);
  los códigos de recuperación, solo como hash.
- Ventana de ±1 intervalo (30 s) por desfase de reloj; un mismo código no se acepta dos veces.
- Límite de intentos: 5 códigos fallidos → espera de 15 min (el rate limit que ya existe).
- El paso intermedio usa un token corto (5 min) que **no** es una sesión: sin el código no hay acceso a nada.
- Restablecer la contraseña **no** saca el 2FA.
- Cambios (activar, desactivar, restablecer, códigos usados) → Activity Log + email de aviso a la persona.
- App Android: misma pantalla; no necesita nada nativo.
- **Admin Center (staff de Northstack): 2FA obligatorio** — es la cuenta con más acceso.

## 3. Datos

- `User`: `totpSecretEnc String?`, `totpEnabledAt DateTime?`, `totpLastStep Int?` (anti-reuso).
- `RecoveryCode` (userId, codeHash, usedAt).
- `TrustedDevice` (userId, tokenHash, expiresAt, userAgent, createdAt) — "recordar 30 días".
- Librería: `otpauth` (chica, sin dependencias) o implementación propia de HMAC-SHA1 (~40 líneas).

## 4. Plan

Todos los planes (§0.1).

## 5. Unidades

1. Schema + servicio TOTP (generar, verificar, códigos de recuperación) + tests.
2. Login en dos pasos (API + pantalla), recordar dispositivo, rate limit.
3. Perfil → activar / desactivar / regenerar códigos (EN/ES).
4. Obligatoriedad (dueño, `manage_billing`, `manage_payments`, staff) + aviso fijo + restablecer por un admin / por Northstack + reset de contraseña sin sesión.
5. Centro de ayuda, anuncio.

## 6. Preguntas

Respondidas el 2026-10-19 (§0.1).
