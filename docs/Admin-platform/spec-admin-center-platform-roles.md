# Spec — Platform Roles (migración de `isPlatformAdmin` a `PlatformRole`)

## Contexto

`User.isPlatformAdmin` (boolean) ya existe en producción, resultado del reorg inicial de
admin-center. Admin Center va a ser multiusuario con distintos niveles de acceso
(Alejandro como admin total, gente de Soporte, y potencialmente un rol de solo métricas)
— un boolean no alcanza. Se reemplaza por un enum, de forma aditiva y sin romper lo que
ya está en producción.

## Repo principal — schema (aditivo)

```prisma
enum PlatformRole {
  platform_admin
  platform_support
  platform_viewer
}

model User {
  // ...campos existentes...
  isPlatformAdmin Boolean       @default(false) // deprecado, no borrar todavía
  platformRole    PlatformRole? // null = no es staff de plataforma (caso normal)
}
```

- `platformRole` nullable, sin default — la ausencia es el estado normal para prácticamente
  todos los `User` (son clientes, no staff de Northstack).
- `sanitizeUser()` ya es un passthrough genérico (solo saca `passwordHash`), así que
  `platformRole` va a viajar automáticamente en `/api/auth/login` y `/api/auth/me` sin
  tocar código de esas rutas.

## Migración de datos

1. `prisma db push` (aditivo) contra producción **y** contra `STAGING_DATABASE_URL` (no
   desincronizar las dos bases, ver protocolo del proyecto).
2. Backfill dirigido, no masivo: `UPDATE "User" SET "platformRole" = 'platform_admin'
   WHERE "isPlatformAdmin" = true` — hoy debería afectar una sola fila (la de Alejandro).
   Confirmar el email exacto antes de correrlo.
3. Verificar con una query directa que la fila de Alejandro tiene `platformRole =
   'platform_admin'` antes de seguir.
4. `isPlatformAdmin` queda deprecado pero **no se borra en esta ronda** — se saca en un
   push destructivo separado, en otra sesión, una vez confirmado que ningún código lo lee
   más (buscar todas las referencias antes: `authService.ts`, cualquier chequeo en
   admin-center).

## Middleware (repo principal, expuesto para que admin-center lo consuma vía login)

El login de admin-center sigue pegándole a `POST /api/auth/login` del repo principal
(sin cambios en esa ruta — ver `northstackAuth.ts` ya existente). Lo que cambia es qué
valida admin-center con la respuesta.

## admin-center — middleware de autorización

Reemplaza el chequeo binario `user.isPlatformAdmin === true` por uno basado en roles,
con `platform_admin` como bypass implícito (no hace falta listarlo en cada ruta):

```ts
// api/lib/platformAuth.ts
function requirePlatformRole(...allowed: PlatformRole[]) {
  return (req, res, next) => {
    const role = req.session?.platformRole;
    if (role === 'platform_admin' || (role && allowed.includes(role))) return next();
    return res.status(403).json({ error: 'Insufficient platform role' });
  };
}
```

- `northstackAuth.ts`: en vez de rechazar con 403 si `!user.isPlatformAdmin`, rechaza si
  `!user.platformRole` (cualquier rol no nulo puede loguearse en admin-center; qué puede
  *hacer* ahí adentro lo decide `requirePlatformRole` por ruta).
- La cookie de sesión de admin-center pasa a guardar `platformRole` (no solo email) —
  necesario para que `requirePlatformRole` lo lea sin pegarle de nuevo al repo principal
  en cada request.

## Matriz de acceso por sección (referencia para todas las specs de secciones)

| Sección | platform_admin | platform_support | platform_viewer |
|---|---|---|---|
| Tasks (dev-ops interno) | ✅ | ❌ | ❌ |
| Tenants (list + detail + Users) | ✅ | ✅ | ❌ |
| Tickets | ✅ | ✅ | ❌ |
| Ideas | ✅ | ❌ | ❌ |
| Metrics | ✅ | ❌ | ✅ |
| Settings de catálogos (estados de Ticket/Idea) | ✅ | ❌ | ❌ |

## Frontend admin-center

- Nav footer muestra `{firstName} · {roleLabel}` (ej. "Alejandro · Platform Admin",
  "Julieta Gómez · Platform Support").
- Ítems de nav para secciones sin acceso al rol actual: ocultos, no solo deshabilitados
  (no tiene sentido mostrarle "Tasks" a alguien con rol Support).

## Criterio de aceptación

- Login con un usuario `platformRole: null` → rechazado (mismo comportamiento que hoy con
  `isPlatformAdmin: false`).
- Login con `platform_support` → entra, ve Tenants/Tickets, no ve Tasks/Ideas/Metrics/Settings.
- Login con `platform_admin` → ve todo, sin necesidad de estar explícitamente en ninguna
  lista de roles permitidos por ruta.
