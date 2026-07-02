# Contexto de desarrollo del proyecto

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-02

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

- tenants
- autenticación
- usuarios
- permisos y roles

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

## Estado actual del proyecto

- Se definió la visión general del producto.
- Se definió el enfoque modular y multi-tenant.
- Se priorizó HR como primer módulo.
- Se creó este archivo como referencia de contexto para el desarrollo futuro.
- Se inicializó la estructura base del proyecto con TypeScript, Express y Vitest.
- Se implementó un primer servicio de HR con creación de empleados y estados básicos.
- Se implementó support para custom fields en HR y endpoints de definición y valores.
- Se verificó el funcionamiento con compilación exitosa después de la integración con Prisma.
