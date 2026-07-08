# Tareas de desarrollo

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-08

## Checklist general

- [x] Definir la visión general del proyecto
- [x] Definir el enfoque modular y multi-tenant
- [x] Definir el alcance inicial centrado en HR
- [x] Definir la estrategia de autenticación inicial y futura integración con Google/Microsoft
- [x] Crear el archivo de contexto de desarrollo
- [x] Crear la estructura base del proyecto
- [x] Implementar un primer servicio de HR inicial
- [x] Implementar pruebas iniciales del módulo HR
- [x] Definir el MVP del módulo HR
- [x] Definir el modelo de datos base para tenants, usuarios y empleados
- [x] Definir roles y permisos iniciales
- [x] Definir la estructura modular del backend
- [x] Definir los endpoints de API iniciales para HR
- [x] Implementar autenticación básica por usuario y contraseña
- [x] Configurar Prisma con esquema PostgreSQL compatible con Neon
- [x] Implementar tenant registration y owner onboarding
- [x] Implementar custom fields básicos
- [x] Verificar `.env` con Neon `DATABASE_URL`
- [x] Crear guía de ejecución de pruebas en `docs/run-tests.md`
- [x] Crear una tabla de prueba en Neon para validar la conexión de la base de datos
- [x] Crear repositorio en GitHub y hacer push de la rama main
- [x] Implementar módulo de clients (CRUD + custom fields)
- [x] Implementar frontend inicial (Vite + React: login, registro, creación de tenant, dashboard)
- [x] Corregir `Employee.email` para que sea único por tenant (bug de diseño multi-tenant)
- [x] Eliminar código muerto (`createTenantWithOwner`) que rompía el build
- [x] Hacer `tenantId` obligatorio en Employee/Client/CustomFieldDefinition
- [x] Agregar `Tenant.status` (active/suspended/cancelled) y `User.status` (active/inactive)
- [x] Agregar `CustomFieldDefinition.isActive`
- [x] Eliminar tabla `TestRun` (leftover de la validación de conexión a Neon)
- [x] Implementar modelo `Invitation` + flujo de invitación (crear invitación / aceptar por token, sin envío de email)
- [x] Eliminar `POST /api/tenants/join` (dejaba unirse a cualquier tenant sabiendo el `tenantId`, sin invitación)
- [x] Unificar registro en un solo paso: `POST /api/tenants/register` crea Tenant + owner User + Session juntos (evita usuarios huérfanos sin tenant)
- [x] Arreglar formulario de Register en el frontend (pedía datos que el backend ignoraba, y no pedía `phone`, que es obligatorio)
- [x] Eliminar `CreateTenantPage.tsx` y `api.createTenant` (código muerto, apuntaban a una ruta que nunca existió)
- [ ] Preparar el proyecto para una beta interna
- [ ] Revisar el frontend end-to-end en navegador
- [ ] Implementar formularios públicos para alta de personas
- [ ] Implementar API pública con token para integraciones externas
- [ ] Construir en el frontend el flujo de aceptar invitaciones (hoy solo existe en el backend)
- [x] **Seguridad:** corregir IDOR en 4 endpoints de custom fields — ahora verifican que employee/client/custom field definition pertenezcan al tenant del usuario (404 si no)
- [x] **Seguridad:** reemplazar el hash de contraseñas (era base64, reversible) por `scrypt` con salt aleatorio (built-in de Node, sin dependencias nuevas)
- [x] Política de contraseñas: mínimo 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial (aplicada en registro individual y en registro de tenant+owner)
- [ ] Envío de invitaciones por email (servicio externo tipo Resend/SendGrid) — evaluado y pospuesto a propósito, hoy el link se comparte manualmente
- [ ] Diseñar catálogo de status configurable por tenant + historial de cambios de status (iniciativa futura, separada de esta ronda)
- [ ] **Config (pendiente):** `frontend/tsconfig.json` no tiene `"jsx"` configurado — `npm run build` del frontend falla (preexistente, Vite dev server no lo sufre porque usa esbuild)

## Notas de avance

- La prioridad actual es validar la base del sistema con HR antes de avanzar a clientes y pagos.
- El archivo `.env` local está configurado con Neon y listo para pruebas.
- Se creó `docs/run-tests.md` con los comandos exactos para instalar, generar Prisma, compilar y ejecutar tests.
- La implementación debe realizarse de forma incremental y testeable.
- Cualquier cambio importante en el alcance deberá documentarse aquí.
- 2026-07-03: se corrigió `Employee.email` a único por tenant; requirió `prisma db push --force-reset` en Neon (se perdió 1 fila de prueba, autorizado). Se detectó y limpió código muerto (`createTenantWithOwner`) y un test desactualizado (`auth.test.ts` sin `phone`). Se hizo commit y push a `origin/main` (`b75b4d3`) de todo el trabajo pendiente (clients module, frontend, fixes).
- 2026-07-06: modelo de datos v2 — `tenantId` obligatorio en Employee/Client/CustomFieldDefinition, `status` en Tenant/User, `isActive` en CustomFieldDefinition, se eliminó `TestRun`. Se implementó el flujo de invitaciones (modelo `Invitation`, endpoints `POST /api/tenants/invitations` y `POST /api/invitations/:token/accept`) y se eliminó el endpoint inseguro `POST /api/tenants/join`. `prisma db push` esta vez sincronizó sin necesitar `--force-reset`. Se hizo una revisión de seguridad: se encontraron 2 vulnerabilidades (IDOR en custom fields, hash de contraseñas débil) — quedaron documentadas arriba como pendientes, no se corrigieron en esta ronda.
- 2026-07-06 (más tarde): al probar la app en el navegador se detectó que el formulario de Register pedía datos que el backend nunca usó (`Tenant ID`/`New Tenant Name`/`Slug`) y le faltaba `phone` (obligatorio) — el registro siempre fallaba. Causa raíz: el frontend estaba armado contra el `createTenantWithOwner` que se había borrado por código muerto días atrás, sin darse cuenta de que representaba el flujo de producto correcto. Se creó `POST /api/tenants/register` (crea Tenant + owner User + Session en un solo paso, evita usuarios huérfanos sin tenant) y se reescribió `RegisterPage.tsx`/`api.ts`/`App.tsx` para usarlo; se eliminó `CreateTenantPage.tsx` (dead code). Probado end-to-end con `curl` contra Neon (dejó 1 tenant de prueba real, "Acme Test Co", a propósito). Se detectó que `frontend/tsconfig.json` no tiene `jsx` configurado y `npm run build` del frontend falla — preexistente, no bloquea porque el dev server de Vite no lo necesita; queda pendiente.
- 2026-07-08: se resolvieron las 2 vulnerabilidades de seguridad pendientes. (1) IDOR en custom fields: los 4 endpoints ahora verifican que `employeeId`/`clientId`/`customFieldDefinitionId` pertenezcan al tenant del usuario autenticado (404 si no); verificado con `curl` creando 2 tenants distintos y confirmando que uno no puede leer los custom fields del empleado del otro. (2) Hash de contraseñas: se reemplazó base64 por `scrypt` (salt aleatorio + `timingSafeEqual`, built-in de Node, sin dependencias nuevas) — decisión tomada para evitar agregar bcrypt/argon2 como dependencia externa. Se agregó política de contraseñas (mínimo 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial) en `registerUser` y `registerTenantWithOwner`, verificada con `curl` (contraseña débil rechazada, fuerte aceptada). **Efecto sobre datos existentes:** los usuarios creados antes de este cambio (ej. "Acme Test Co") quedaron con hash en formato viejo (base64) y no van a poder loguearse — van a necesitar registrarse de nuevo. No fue necesario ningún cambio de schema.
