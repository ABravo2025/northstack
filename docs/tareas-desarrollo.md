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
- [ ] Preparar el proyecto para una beta interna
- [ ] Hacer `tenantId` obligatorio en Employee/Client/CustomFieldDefinition (pendiente de decisión)
- [ ] Revisar el frontend end-to-end en navegador
- [ ] Implementar formularios públicos para alta de personas
- [ ] Implementar API pública con token para integraciones externas

## Notas de avance

- La prioridad actual es validar la base del sistema con HR antes de avanzar a clientes y pagos.
- El archivo `.env` local está configurado con Neon y listo para pruebas.
- Se creó `docs/run-tests.md` con los comandos exactos para instalar, generar Prisma, compilar y ejecutar tests.
- La implementación debe realizarse de forma incremental y testeable.
- Cualquier cambio importante en el alcance deberá documentarse aquí.
- 2026-07-03: se corrigió `Employee.email` a único por tenant; requirió `prisma db push --force-reset` en Neon (se perdió 1 fila de prueba, autorizado). Se detectó y limpió código muerto (`createTenantWithOwner`) y un test desactualizado (`auth.test.ts` sin `phone`). Se hizo commit y push a `origin/main` (`b75b4d3`) de todo el trabajo pendiente (clients module, frontend, fixes).
