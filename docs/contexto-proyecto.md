# Contexto de desarrollo del proyecto

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-08

## Resumen del proyecto

Se está comenzando a desarrollar un sistema modular, pensado como una plataforma SaaS multi-tenant, con enfoque inicial en la gestión de HR y con roadmap posterior para clientes y pagos.

## Problema que se busca resolver

A lo largo de la carrera, se identificaron problemas recurrentes en startups de EE. UU. relacionados con:

- Recursos humanos / HR
- Gestión de clientes
- Gestión de pagos

La idea es construir una solución que permita a cada empresa registrarse y administrarse de forma autónoma, con control de permisos y con una API pública protegida por token.

## Visión inicial

Crear un sistema que permita:

- registrar empresas como tenants independientes
- habilitar usuarios con distintos niveles de permisos
- dar de alta empleados y clientes de forma manual o mediante formularios públicos
- soportar custom fields desde las primeras versiones
- preparar la arquitectura para crecer hacia clientes y pagos sin reescribir la base

## Decisiones de diseño acordadas

- Arquitectura modular
- Enfoque multi-tenant
- Permisos por rol y por tenant
- Autenticación inicial por usuario y contraseña
- Preparación para futuras integraciones con Google y Microsoft
- API pública con seguridad por token
- Fase 1: HR
- Fase 2: clientes y pagos
- Priorización de testing y corrección progresiva antes de beta

## Estructura propuesta del sistema

### Core

- tenants (con `status`: active/suspended/cancelled)
- autenticación
- usuarios (con `status`: active/inactive)
- permisos y roles
- invitaciones (un admin/owner invita por email a un tenant; el usuario invitado queda adherido con el rol definido al aceptar el token — reemplaza el join libre por tenantId)

### HR

- empleados
- departamentos
- cargos
- estados laborales
- custom fields

### Formularios

- formularios públicos para alta de personas

### API

- endpoints públicos protegidos por token

### Frontend

- aplicación Vite + React (`frontend/`) con páginas de login, registro y dashboard
- el registro es un solo paso: datos de la empresa + datos del usuario owner → crea Tenant + User + Session juntos (`POST /api/tenants/register`)
- consume la API vía `frontend/src/api.ts`

## Estado actual del proyecto

- Se definió la visión general del producto.
- Se definió el enfoque modular y multi-tenant.
- Se priorizó HR como primer módulo.
- Se creó este archivo como referencia de contexto para el desarrollo futuro.
- Se inicializó la estructura base del proyecto con TypeScript, Express y Vitest.
- Se implementó un primer servicio de HR con creación de empleados y estados básicos.
- Se implementó support para custom fields en HR y endpoints de definición y valores.
- Se verificó el funcionamiento con compilación exitosa después de la integración con Prisma.
- Se implementó el módulo de clients (CRUD completo + custom fields) y se integró en `server.ts`.
- Se construyó el frontend inicial (Vite + React) con los flujos de login, registro, creación de tenant y dashboard.
- Se corrigió `Employee.email` para que sea único por tenant (antes era único global, un bug de diseño multi-tenant).
- Se eliminó código muerto (`createTenantWithOwner`) que rompía el build.
- El repositorio en GitHub está al día (`origin/main`, commit `b75b4d3`).
- Se hizo `tenantId` obligatorio en Employee/Client/CustomFieldDefinition (antes opcional, permitía registros huérfanos).
- Se agregó `status` a Tenant y User, e `isActive` a CustomFieldDefinition; se eliminó la tabla `TestRun`.
- Se reemplazó el join libre a tenants por un flujo de invitaciones (modelo `Invitation`, sin envío de email todavía — el link se comparte manualmente).
- Se probó la app corriendo (frontend en `localhost:5173`, backend en `localhost:3000`) y se encontró que el formulario de Register no coincidía con el backend (pedía datos que se ignoraban, no pedía `phone`). Se unificó en un solo endpoint `POST /api/tenants/register` (Tenant + owner User + Session juntos, evita usuarios huérfanos) y se reescribió el frontend acorde. Se eliminó `CreateTenantPage.tsx` (código muerto).
- Pendiente detectado: `frontend/tsconfig.json` no tiene `jsx` configurado, `npm run build` del frontend falla (no afecta al dev server de Vite).
- Se corrigieron las 2 vulnerabilidades de seguridad pendientes: IDOR en los 4 endpoints de custom fields (ahora verifican tenant ownership), y hash de contraseñas reemplazado por `scrypt` con salt (built-in de Node, sin dependencias nuevas). Se agregó política de contraseñas (mín. 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial). Los usuarios registrados antes de este cambio (hash viejo en base64) ya no pueden loguearse y necesitan registrarse de nuevo.
- Se corrigió un bug real en `App.tsx` que vaciaba el formulario de Register/Login en cada error (desmontaba la página por un guard de loading mal alcanzado); se agregaron errores de campo posicionados junto al input y validación de formato de teléfono.
- Employees llegó a paridad CRUD con Clients: editar y borrar, tanto en backend (`PATCH`/`DELETE /api/hr/employees/:employeeId`) como en el Dashboard. Queda pendiente que Clients tenga UI de edición en el frontend (el backend ya la soporta).
