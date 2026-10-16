# Spec: Verificación en dos pasos (2FA)

**Estado:** borrador para aprobar (2026-10-16). Era el bloque F de `spec-shifts-fase2.md`: Alejandro pidió
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

**Política de la empresa (Configuración → Seguridad):** "Exigir verificación en dos pasos" para todos o solo
para roles con permisos de administración. Quien no la tiene configurada, al entrar va directo a activarla.

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
- `Tenant`: `require2fa` (`off` | `admins` | `everyone`).
- Librería: `otpauth` (chica, sin dependencias) o implementación propia de HMAC-SHA1 (~40 líneas).

## 4. Plan

¿Todos los planes? Recomendación: **sí, activarla por persona en Starter y Growth** (la seguridad no se cobra);
la **política para exigirla a toda la empresa**, también en ambos.

## 5. Unidades

1. Schema + servicio TOTP (generar, verificar, códigos de recuperación) + tests.
2. Login en dos pasos (API + pantalla), recordar dispositivo, rate limit.
3. Perfil → activar / desactivar / regenerar códigos (EN/ES).
4. Restablecer por un admin + política de empresa + Admin Center obligatorio.
5. Centro de ayuda, anuncio.

## 6. Preguntas para Alejandro

1. ¿Arrancamos con la app autenticadora y dejamos passkeys para una segunda etapa?
2. ¿Disponible en todos los planes, incluida la política de exigirla?
3. ¿"Recordar este dispositivo 30 días": sí, y cuántos días?
4. ¿Obligatoria para el staff del Admin Center desde el primer día?
