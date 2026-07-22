# Auditoría técnica de seguridad y calidad de código — Northstack

**Fecha:** 2026-07-16
**Alcance:** Revisión estática del repositorio completo (backend Express/Prisma, frontend React/Vite, infraestructura de despliegue en Vercel). No incluye pentesting activo contra `app.joinnorthstack.com` ni escaneo dinámico (DAST); es una revisión de código y configuración.
**Ambiente revisado:** rama `main`, commit `2695a15`.

---

## 1. Resumen ejecutivo

El backend tiene una base de seguridad razonable para la etapa del proyecto: contraseñas con `scrypt` + comparación en tiempo constante, separación de tenants verificada en la mayoría de endpoints, manejo de errores async que no filtra stack traces, y sin vulnerabilidades conocidas en dependencias (`npm audit` limpio en ambos `package.json`).

Sin embargo, se encontró **una vulnerabilidad de severidad alta explotable hoy** (mass assignment / IDOR en los endpoints `PATCH` de empleados y clientes) y varias brechas de severidad media que son típicas de un producto en etapa temprana (sin rate limiting, sesiones que no expiran, CORS abierto, sin cabeceras de seguridad). Ninguna depende de una librería vulnerable; todas son decisiones de diseño pendientes.

| Severidad | Cantidad |
|---|---|
| Alta | 1 |
| Media | 6 |
| Baja | 5 |

---

## 2. Hallazgos de seguridad

### 2.1 [ALTO] Mass assignment / IDOR en `PATCH /api/hr/employees/:id` y `PATCH /api/clients/:id`

**Dónde:** [src/app.ts:484](src/app.ts#L484) y [src/app.ts:1193](src/app.ts#L1193), que llaman a `updateEmployee`/`updateClient` con `req.body` sin filtrar; y [src/modules/hr/employeeService.ts:126-130](src/modules/hr/employeeService.ts#L126-L130) / [src/modules/clients/clientService.ts:67-71](src/modules/clients/clientService.ts#L67-L71), donde `prisma.employee.update({ data: input })` usa ese objeto tal cual.

**Problema:** El endpoint valida que el empleado/cliente pertenezca al tenant del usuario *antes* de la actualización, pero luego pasa el `req.body` completo — sin filtrar campos — directamente al `data` de Prisma. Los tipos de TypeScript (`UpdateEmployeeInput`, `UpdateClientInput`) sólo restringen en tiempo de compilación; en runtime, `req.body` es `any`, así que cualquier propiedad adicional en el JSON viaja intacta hasta el motor de Prisma. Como `tenantId`, `userId` y `statusId` son columnas escalares expuestas directamente por Prisma (no sólo a través de relaciones anidadas), un atacante autenticado con cualquier rol puede:

- Enviar `{ "tenantId": "<id-de-otro-tenant>" }` en el PATCH de un empleado/cliente que sí le pertenece, y **reasignarlo a un tenant ajeno** (corrupción de datos entre tenants, ruptura del aislamiento multi-tenant que es la garantía central del producto).
- Enviar `{ "userId": "<id-de-otro-usuario>" }` para **secuestrar el vínculo empleado↔usuario** de otro empleado (afecta PTO, custom fields, permisos de "self-service").
- Enviar `{ "statusId": "<id-de-status-de-otro-tenant>" }`: no hay validación de que el `statusId` nuevo pertenezca al mismo tenant (a diferencia de `managerId`, que sí se valida en el endpoint).

**Cómo reproducir (conceptual):**
```
PATCH /api/hr/employees/{id-de-mi-empleado}
Authorization: Bearer <mi-token>
{ "tenantId": "id-de-otro-tenant-cualquiera" }
```

**Impacto:** Ruptura del aislamiento multi-tenant — el pilar de seguridad más importante de un SaaS multi-tenant.

**Recomendación:** En ambos servicios, construir explícitamente el objeto `data` sólo con los campos permitidos (igual patrón que ya usan `createEmployee`/`createClient`, o `updateStatusDefinition`, que sí reconstruyen el objeto campo por campo). Alternativamente, usar `zod` (ya está instalado pero sin uso) para parsear y whitelistear el body antes de pasarlo a cualquier service.

---

### 2.2 [MEDIO] Las sesiones no expiran nunca

**Dónde:** [prisma/schema.prisma:279-285](prisma/schema.prisma#L279) (`model Session`, sin campo `expiresAt`) y [src/modules/auth/authService.ts:140-147](src/modules/auth/authService.ts#L140).

**Problema:** Un token de sesión (`Session.token`, un UUID) es válido indefinidamente hasta que el usuario cierra sesión explícitamente (`DELETE`). No hay expiración por tiempo ni renovación. Si un token se filtra (log, historial de navegador, XSS, dispositivo compartido), sigue siendo válido para siempre.

**Agravante relacionado:** cambiar la contraseña (`changeOwnPassword`, [authService.ts:202](src/modules/auth/authService.ts#L202)) no revoca las sesiones existentes. Si una cuenta fue comprometida vía un token robado, la víctima puede cambiar su contraseña y el atacante **sigue teniendo acceso** con el token viejo.

**Recomendación:** Agregar `expiresAt` a `Session` (p. ej. 7–30 días con renovación en cada uso), y borrar/invalidar todas las sesiones del usuario al cambiar la contraseña.

---

### 2.3 [MEDIO] Sin rate limiting ni bloqueo por intentos fallidos en login/registro

**Dónde:** `/api/auth/login`, `/api/auth/register`, `/api/tenants/register` en [src/app.ts](src/app.ts).

**Problema:** No hay ningún middleware de rate limiting (no está `express-rate-limit` ni nada equivalente en `package.json`). Un atacante puede intentar fuerza bruta de contraseñas sin fricción, o hacer scraping de registro de emails (enumeración: "Email already registered" en el 400 revela si un email ya existe, ver 2.7).

**Recomendación:** Agregar `express-rate-limit` (o el rate limiting nativo de Vercel/Edge) sobre `/api/auth/*`, con límites más estrictos en login que en el resto de la API.

---

### 2.4 [MEDIO] CORS abierto a cualquier origen

**Dónde:** [src/app.ts:96](src/app.ts#L96) — `app.use(cors())` sin configuración.

**Problema:** La configuración por defecto de la librería `cors` refleja el header `Origin` de la petición, permitiendo que **cualquier sitio web** haga peticiones a la API (sujeto a que el atacante tenga el token, que no viaja automáticamente al no usar cookies — por eso el riesgo es medio y no alto). Aun así, es una superficie innecesaria: facilita ataques si en el futuro se agrega autenticación por cookie, y no sigue el principio de mínimo privilegio.

**Recomendación:** Restringir `origin` a `https://app.joinnorthstack.com` (y `http://localhost:5173` en desarrollo) vía variable de entorno.

---

### 2.5 [MEDIO] Token de sesión guardado en `localStorage`

**Dónde:** [frontend/src/App.tsx:32-133](frontend/src/App.tsx#L32).

**Problema:** `localStorage` es accesible por cualquier script que corra en el origen, así que un XSS (incluso uno menor, en cualquier componente futuro) permite robar el token de sesión directamente. No se detectó ningún `dangerouslySetInnerHTML` ni `innerHTML` en el frontend actual (buena señal — no hay un XSS conocido hoy), pero el diseño no tiene defensa en profundidad: si aparece un XSS mañana, el impacto es total y silencioso, y combinado con el hallazgo 2.2 (sesiones sin expiración), el atacante conserva el acceso indefinidamente.

**Recomendación (a mediano plazo, requiere cambio de arquitectura):** mover el token a una cookie `httpOnly`, `Secure`, `SameSite=Strict/Lax`. Es un cambio no trivial (implica CSRF tokens y ajustar CORS), por lo que se puede priorizar después de 2.1–2.3.

---

### 2.6 [MEDIO] Sin cabeceras de seguridad HTTP (Helmet)

**Dónde:** [src/app.ts:94-97](src/app.ts#L94).

**Problema:** No se configuran cabeceras como `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-Security`, etc. Express y Vercel no las agregan por defecto.

**Recomendación:** Agregar el middleware `helmet` (una línea de código, sin justificación de servicio externo — corre in-process).

---

### 2.7 [MEDIO] Enumeración de usuarios en registro

**Dónde:** [src/modules/auth/authService.ts:84-86](src/modules/auth/authService.ts#L84) y [tenantService.ts:153-155](src/modules/tenant/tenantService.ts#L153).

**Problema:** El error `"Email already registered"` (con `field: 'email'`) permite a cualquiera verificar si un correo específico ya tiene cuenta en Northstack, probando emails uno por uno. Es un patrón común y de bajo impacto real, pero vale la pena mitigarlo dado que agrava el punto 2.3 (sin rate limiting, la enumeración es barata).

**Recomendación:** Aceptable por ahora dado el rate limiting pendiente (2.3); si se quiere cerrar del todo, requeriría flujo de verificación por email antes de confirmar duplicado — ya está listado como pendiente en `docs/tareas-desarrollo.md` (OTP), así que no es una recomendación nueva, sino una razón más para priorizarlo.

---

### 2.8 [BAJO] `role` arbitrario aceptado en `POST /api/auth/register`

**Dónde:** [src/app.ts:160-168](src/app.ts#L160), que pasa `req.body` completo (incluido un posible campo `role`) a `registerUser`.

**Problema:** `RegisterUserInput.role` es opcional y, si el cliente lo manda, se guarda tal cual en el `User` recién creado. En la práctica **no es explotable hoy**: todo camino para que un usuario obtenga un tenant (`createTenantForUser`, `registerTenantWithOwner`, `acceptInvitation`) sobreescribe `role` explícitamente. Aun así, es el mismo patrón de fondo que el hallazgo 2.1 (pasar el body sin whitelist a un `create`/`update`), y una futura funcionalidad podría reintroducir el riesgo sin que nadie lo note.

**Recomendación:** Eliminar `role` de lo que acepta el endpoint de registro público (no debería ser configurable por el cliente en ningún caso).

---

### 2.9 [BAJO] `statusId` no se valida contra el tenant al actualizar empleados/clientes

**Dónde:** [src/modules/hr/employeeService.ts:116-130](src/modules/hr/employeeService.ts#L116), [src/modules/clients/clientService.ts:61-71](src/modules/clients/clientService.ts#L61).

**Problema:** A diferencia de `managerId` (validado explícitamente en `app.ts` contra `tenantId`), no hay verificación de que el `statusId` enviado en un update pertenezca al tenant del usuario. Es de severidad baja aislada, pero se vuelve parte del mismo vector que 2.1 una vez que se filtre `data`.

**Recomendación:** Se resuelve solo al corregir 2.1 con una whitelist explícita de campos + validación de pertenencia de `statusId` al tenant (patrón ya usado para `managerId`).

---

### 2.10 [BAJO] `zod` está instalado pero no se usa

**Dónde:** [package.json:22](package.json#L22) — dependencia declarada, cero imports en `src/`.

**Problema:** No es una vulnerabilidad en sí, pero indica que la intención de validar esquemas de entrada existía y no se completó — lo cual explica varios de los hallazgos anteriores (falta de whitelisting consistente en los bodies de request).

**Recomendación:** Adoptarlo de forma incremental empezando por los endpoints de escritura (`POST`/`PATCH`) de empleados, clientes y perfil.

---

### 2.11 [BAJO] Falta de invalidación de sesión ante cambios sensibles de cuenta

Relacionado con 2.2: ni el cambio de contraseña ni el cambio de rol de un usuario (`updateTenantUser`) invalidan sus sesiones activas. Si a un usuario se le revoca acceso (`status: 'inactive'`) o se le degrada el rol, sus sesiones existentes siguen funcionando hasta que expiren (nunca) o cierre sesión manualmente.

**Recomendación:** Revisar `authenticateToken` para que también verifique `user.status === 'active'` en cada request (actualmente no se comprueba el status del usuario al autenticar el token — sólo se usa para filtrar listados).

---

## 3. Otros problemas de código y mantenibilidad (no-seguridad)

### 3.1 `src/app.ts` es un archivo monolítico de ~1340 líneas
Todas las rutas (auth, tenants, HR, clientes, PTO, custom fields, saved views) están en un solo archivo. Esto ya está dificultando la navegación y aumenta el riesgo de que aparezcan más inconsistencias como la de 2.1. Se recomienda dividir en routers por dominio (`routes/auth.ts`, `routes/hr.ts`, `routes/clients.ts`, etc.), montados con `express.Router()`.

### 3.2 Duplicación del helper de autenticación
`GET /api/hr/custom-fields` ([src/app.ts:587-603](src/app.ts#L587)) reimplementa manualmente la lógica de `authenticateUser`/`validateSession` en vez de reutilizar las funciones existentes. Funciona igual, pero es código duplicado que puede divergir con el tiempo (p. ej., si mañana se agrega la validación de `user.status` del punto 2.11, hay que recordar tocar este bloque también).

### 3.3 Cobertura de tests limitada
Sólo 139 líneas de tests en total (`auth.test.ts`: 73, `hr.test.ts`: 46, `permission.test.ts`: 20). No hay tests que cubran:
- Aislamiento entre tenants (IDOR) — habría detectado el hallazgo 2.1.
- Expiración/invalidación de sesiones.
- Flujo de invitaciones (aceptación, expiración, revocación).
- Endpoints de PTO y saved views.

**Recomendación:** Priorizar un test que cree dos tenants y verifique que ningún endpoint de escritura permite que el tenant A modifique/reasigne datos del tenant B — eso habría capturado 2.1 automáticamente y previene regresiones futuras.

### 3.4 Manejo de errores de enum inválido devuelve 500 en vez de 400
Por ejemplo, `updateTenantUser` con un `role` que no sea un valor válido del enum `UserRole` provoca una excepción de Prisma no capturada específicamente, que cae en el handler global de errores (línea 1332) y responde `500` genérico en vez de un `400` con mensaje claro. No es un problema de seguridad (no filtra información sensible), pero degrada la experiencia de debugging y de la API.

---

## 4. Cosas bien implementadas (para contexto/balance)

- **Contraseñas:** `scrypt` con salt aleatorio de 16 bytes por usuario y comparación con `timingSafeEqual` — correcto, evita timing attacks.
- **Resiliencia de conexión a base de datos:** reintentos automáticos ante fallos transitorios de Neon/Prisma ([src/lib/prisma.ts](src/lib/prisma.ts)), con backoff.
- **Errores async manejados globalmente:** ningún handler de ruta puede tumbar el proceso por una promesa rechazada sin capturar ([src/app.ts:99-120](src/app.ts#L99)).
- **Verificación de tenant consistente:** la gran mayoría de endpoints de lectura/escritura comparan `entity.tenantId !== user.tenantId` antes de operar — el patrón correcto está presente casi en todos lados, lo cual hace más notable la excepción del hallazgo 2.1.
- **Transacciones atómicas** para invariantes críticas (un solo owner por tenant, creación de tenant + owner + empleado inicial) usando `prisma.$transaction`.
- **Sin vulnerabilidades conocidas en dependencias** (`npm audit` limpio en backend y frontend al momento de esta auditoría).
- **Secretos fuera del repositorio:** `.env` está en `.gitignore`; las credenciales de Vercel/SMTP no están hardcodeadas en el código.
- **Errores 500 no filtran stack traces** al cliente — el handler global responde con un mensaje genérico y loggea el detalle solo en servidor.

---

## 5. Priorización recomendada

| # | Hallazgo | Esfuerzo estimado | Prioridad |
|---|---|---|---|
| 2.1 | Mass assignment en PATCH employees/clients | Bajo (whitelist de campos en 2 servicios) | **Inmediata** |
| 2.2 | Sesiones sin expiración / sin revocación | Medio (migración de schema + lógica) | Alta |
| 2.3 | Rate limiting en auth | Bajo (1 dependencia + config) | Alta |
| 2.6 | Helmet | Muy bajo | Alta |
| 2.4 | CORS restringido | Bajo | Media |
| 2.11 | Verificar `user.status` en `authenticateToken` | Bajo | Media |
| 2.8 / 2.9 / 2.10 | Whitelisting sistemático con zod | Medio | Media |
| 2.5 | Migrar token a cookie httpOnly | Alto (rediseño) | Baja/Planificada |
| 3.1 / 3.2 / 3.3 | Mantenibilidad (routers, tests) | Medio-Alto | Continua |

---

## 6. Notas metodológicas

- Esta revisión fue **estática** (lectura de código, schema, configuración de despliegue y `npm audit`). No se realizaron pruebas dinámicas contra el entorno productivo (`app.joinnorthstack.com`), fuzzing, ni intentos reales de explotación.
- El hallazgo 2.1 se razonó a partir del comportamiento documentado de Prisma Client (los campos escalares de clave foránea, como `tenantId`, son directamente asignables en `update()` sin necesidad de sintaxis de relación anidada) contrastado con el código real de `app.ts` y los servicios — se recomienda una prueba de confirmación en un entorno de staging antes de considerarlo 100% verificado en producción.
- No se evaluó la configuración de Vercel/Cloudflare a nivel de red (WAF, DDoS, TLS) por estar fuera del repositorio.
