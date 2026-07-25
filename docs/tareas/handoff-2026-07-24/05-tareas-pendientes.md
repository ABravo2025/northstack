# 05 — Tareas pendientes

Backlog completo vive en `docs/tareas-desarrollo.md` (más granular, con historial de decisiones). Esto es una destilación priorizada para retomar el proyecto rápido.

## Bugs conocidos

| Ítem | Prioridad | Por qué |
|---|---|---|
| 3 hallazgos de la auditoría de seguridad nunca trackeados a cierre (token de sesión en `localStorage`/XSS, enumeración de usuarios vía "Email already registered", sin invalidación de sesión al cambiar rol/status) | **Alta** | Son hallazgos de seguridad reales de una auditoría formal que se perdieron entre el checklist de seguimiento. Confirmar estado real contra el código antes de asumir que están resueltos o de re-auditar desde cero. Ver `04-analisis-estado-y-avances.md`. |
| CORS abierto a cualquier origen (`app.use(cors())` sin configurar) | Media | Hallazgo de seguridad ya trackeado y explícitamente pospuesto — no es un descubrimiento nuevo, pero sigue sin resolver. |
| `role` arbitrario aceptado en `POST /api/auth/register`; `zod` instalado sin usar en ningún endpoint | Baja | Bajo riesgo real hoy (registro es por invitación cerrada), pero es una superficie de ataque innecesaria si el registro se abre a futuro. |

## Deuda técnica

| Ítem | Prioridad | Por qué |
|---|---|---|
| `src/app.ts` monolítico (1901 líneas) sin dividir en routers por dominio | **Alta** | Ya señalado en la auditoría de seguridad de 07-16 como el tipo de archivo donde se cuelan bugs de aislamiento entre tenants sin que se note al lado del resto del código. Sigue creciendo con cada feature nueva. |
| Cero tests de aislamiento entre tenants (automatizados) | **Alta** | Es exactamente el gap que dejó pasar el IDOR original sin detectar antes de producción. `docs/Tareas-QA.md` (QA-01) tiene el procedimiento manual listo para automatizar. |
| Cero tests de frontend | Media | No hay ni el framework instalado. Cualquier regresión de UI depende hoy de verificación manual/Playwright ad-hoc no reproducible. |
| CI no corre `npm test`/`npm run build` antes de deployar | Media | El deploy solo falla si Vercel no puede compilar — un test roto no bloquea nada hoy. |
| List view / ghost row / push panel / scrollbar propia solo en Employees | Media | Implementado y validado, pero el propio ítem de backlog pide replicarlo en Clients y Company Users una vez confirmado — ya está confirmado, falta la réplica. |
| `Employee.department` legado — confirmar que no quede ningún rastro del string libre viejo | Baja | Ya migrado a `FieldCatalogDefinition`, mencionado acá solo para descartar cabos sueltos si se audita el schema. |
| Historial de valores previos de custom fields | Baja | Evaluado y pospuesto a propósito, no es un olvido. |

## Features sin terminar / no empezadas

| Ítem | Prioridad | Por qué |
|---|---|---|
| Tipo de contratación/compensación: falta el campo de **moneda por monto individual** si se necesita mezcla de monedas dentro de un mismo tenant | Baja | Se resolvió con moneda *por tenant* (un solo valor), decisión explícita — solo relevante si un tenant multinacional lo pide. |
| Rediseño de Clients (Company/Contact/Opportunity) | Alta si el negocio lo prioriza | Dirección confirmada, tamaño comparable al sistema de Time Off en su momento — necesita una sesión de spec dedicada antes de tocar código. Migración de datos reales de producción incluida. |
| Payroll V1 | Media | Depende de que se resuelva primero el campo de moneda/tipo de compensación (ya resuelto en Tier 2) — desbloqueado, sin spec técnico todavía. |
| Suscripciones propias de Northstack (Paddle) + Panel de Integraciones (Stripe/QuickBooks/Mercado Pago, webhooks, Slack, API pública) | Media, no bloqueante para el beta | Cada pieza tiene su propia decisión de proveedor ya evaluada — falta spec técnico de cada una. |
| Admin panel de plataforma (cross-tenant) | Media | Necesita un sistema de roles totalmente separado del actual (confirmado por el usuario) — bloquea exponer los reportes/métricas cross-tenant en UI. |
| Verificación de email por OTP + 2FA por email en login | Baja | Infraestructura de email ya existe, solo falta diseñar el mecanismo de código de un solo uso. |
| i18n | Baja | Alcance sin definir todavía (¿selector de usuario o fijo por tenant/región?). |
| Sistema de roles custom | Baja, a propósito al final | Va a seguir mutando con cada módulo nuevo — conviene resolverlo una sola vez cuando el set de features esté más estable. |
| Logs de auditoría por usuario | Baja | Sin empezar, sin detalle. |
| Edición inline en la tabla de Employees | Baja | Idea anotada, sin detalle de patrón de edición. |
| Ícono de notificaciones in-app (distinto del canal de email) | Baja | Se solapa conceptualmente con Slack/webhooks — conviene diseñar un solo modelo de "evento" compartido entre los 4 canales antes de construir cualquiera. |

## Decisiones de producto/negocio sin cerrar

| Decisión | Por qué importa |
|---|---|
| `Tenant.cancelledAt`/`cancellationReason` — ¿se agrega ahora (para churn básico) o se espera al módulo de Payments/Subscription? | Si se agrega dos veces en dos lugares con semántica distinta, hay que reconciliar después. Ver `01-objetivo.md`. |
| Planes/precios de la suscripción propia de Northstack, y si hay trial gratis vs. pago de entrada | Afecta el flujo de registro (`registerTenantWithOwner`) y probablemente necesite un estado intermedio de tenant (`trialing`). |
| Qué pasa con un tenant si falla el pago o cancela: ¿bloqueo total, solo-lectura, o período de gracia? | Sin definir — condiciona el modelo de `TenantStatus`. |
| Nombre real del producto de payroll externo mencionado por el usuario ("Get thera", transcripción sin confirmar) | Necesario antes de evaluar una integración futura. |
| Migración de datos reales de `Client` → `Company`/`Contact` (rediseño de Clients) | Mismo tipo de migración de datos reales que el rename PTO→Time Off — no es un push aditivo simple, necesita el mismo cuidado documentado en `08-directivas-agente-ia.md`. |

## Del contexto inmediato de esta sesión de trabajo (2026-07-24)

- **Sincronizar el schema de la base de `staging`** con producción — se agregaron `Tenant.currency`, `Employee.contractType`/`compensationType`, y `SavedViewType.list` directamente contra producción (recordar que el `.env` local apunta ahí) sin correr el mismo `prisma db push` contra `STAGING_DATABASE_URL`. Staging va a quedar desincronizado hasta que se haga.
- **Replicar en Clients** el bloque de UI validado en Employees (List view, ghost row, panel push, scrollbar propia) — ver deuda técnica arriba.
