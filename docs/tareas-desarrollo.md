# Tareas de desarrollo

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-06

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
- [ ] Preparar el proyecto para una beta interna
- [ ] Revisar el frontend end-to-end en navegador
- [ ] Implementar formularios públicos para alta de personas
- [ ] Implementar API pública con token para integraciones externas
- [ ] **Seguridad (pendiente, prioridad alta):** corregir IDOR en 4 endpoints de custom fields (`/api/hr/employees/:employeeId/custom-fields`, `/api/clients/:clientId/custom-fields`) que no verifican que el recurso pertenezca al tenant del usuario
- [ ] **Seguridad (pendiente, prioridad alta):** reemplazar el "hash" de contraseñas (hoy es solo base64, reversible) por un hash real (bcrypt/argon2) — requiere agregar una librería nueva
- [ ] Envío de invitaciones por email (servicio externo tipo Resend/SendGrid) — evaluado y pospuesto a propósito, hoy el link se comparte manualmente
- [ ] Diseñar catálogo de status configurable por tenant + historial de cambios de status (iniciativa futura, separada de esta ronda)

## Notas de avance

- La prioridad actual es validar la base del sistema con HR antes de avanzar a clientes y pagos.
- El archivo `.env` local está configurado con Neon y listo para pruebas.
- Se creó `docs/run-tests.md` con los comandos exactos para instalar, generar Prisma, compilar y ejecutar tests.
- La implementación debe realizarse de forma incremental y testeable.
- Cualquier cambio importante en el alcance deberá documentarse aquí.
- 2026-07-03: se corrigió `Employee.email` a único por tenant; requirió `prisma db push --force-reset` en Neon (se perdió 1 fila de prueba, autorizado). Se detectó y limpió código muerto (`createTenantWithOwner`) y un test desactualizado (`auth.test.ts` sin `phone`). Se hizo commit y push a `origin/main` (`b75b4d3`) de todo el trabajo pendiente (clients module, frontend, fixes).
- 2026-07-06: modelo de datos v2 — `tenantId` obligatorio en Employee/Client/CustomFieldDefinition, `status` en Tenant/User, `isActive` en CustomFieldDefinition, se eliminó `TestRun`. Se implementó el flujo de invitaciones (modelo `Invitation`, endpoints `POST /api/tenants/invitations` y `POST /api/invitations/:token/accept`) y se eliminó el endpoint inseguro `POST /api/tenants/join`. `prisma db push` esta vez sincronizó sin necesitar `--force-reset`. Se hizo una revisión de seguridad: se encontraron 2 vulnerabilidades (IDOR en custom fields, hash de contraseñas débil) — quedaron documentadas arriba como pendientes, no se corrigieron en esta ronda.
