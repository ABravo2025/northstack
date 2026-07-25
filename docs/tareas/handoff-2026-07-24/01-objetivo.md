# 01 — Objetivo del producto

## Qué es Northstack

Northstack es una plataforma SaaS multi-tenant pensada para que una startup en etapa temprana centralice la gestión de su gente (HR), sus clientes, y —a futuro— sus cobros, en un solo lugar, en vez de repartir esa información entre spreadsheets sueltas y herramientas desconectadas. Cada tenant (empresa cliente de Northstack) tiene sus propios usuarios, empleados, clientes, catálogos configurables y datos, completamente aislados del resto.

Fuente: `docs/current-process-flow.md`, `docs/contexto-proyecto.md`.

## Para quién

Startups pequeñas/en etapa temprana que hoy resuelven HR y gestión de clientes de forma manual o con herramientas genéricas no pensadas para su tamaño ni su flujo. El registro hoy es **por invitación cerrada** (no hay alta pública abierta) — el producto está en fase de beta con testers reales, no de adquisición masiva.

## Visión y fases del roadmap

El proyecto se planificó explícitamente en fases, confirmadas tanto en `docs/contexto-proyecto.md` como en el historial de commits:

1. **Fase 1 — HR** (implementada, ver [`02-features-implementadas.md`](02-features-implementadas.md)): empleados, catálogos de status/departamento/puesto, campos personalizados, jerarquía organizacional, Time Off (ex-PTO), formularios públicos de alta.
2. **Fase 2 — Clientes** (implementada en su forma actual; rediseño grande confirmado pero sin empezar): gestión de clientes con el mismo patrón de campos personalizados y catálogos que HR. Ya hay una dirección de rediseño confirmada por el usuario (separar en Company/Contact/Opportunity para soportar un pipeline de ventas) — ver [`05-tareas-pendientes.md`](05-tareas-pendientes.md).
3. **Fase 3 — Pagos** (no empezada): dos iniciativas distintas y no confundir entre sí —
   - **Suscripciones propias de Northstack** (Northstack cobrándose a sí mismo a sus tenants) — evaluado Paddle sobre Stripe directo, porque Stripe no ofrece cuentas directas en Argentina.
   - **Módulo Payments de producto** (cada tenant cobrándole a sus propios Clients) — vive conceptualmente dentro del futuro "Panel de Integraciones" (Stripe/QuickBooks/Mercado Pago).

Dentro de Tier 3.5 del backlog también se confirmó un **módulo de Payroll V1** (carga manual de pagos a Employees + métricas derivadas, sin procesamiento real de pagos todavía) — distinto de Payments (que es cuentas por cobrar; Payroll es cuentas por pagar).

## El diferenciador central: medir churn/salud de cliente

**Estado real: esto todavía no está construido — es una especificación, no una feature implementada.** Vale la pena entenderlo igual porque condiciona decisiones técnicas ya tomadas hoy.

Dos documentos definen esto, con alcances distintos:

- **`docs/metrics/basic-metrics-spec.md`** — métricas calculables *hoy*, sin depender de Payments. Define un "Logo Churn básico" y es explícito sobre la limitación actual: `Tenant.status = 'cancelled'` dice *que* un tenant canceló, pero no *cuándo* ni *por qué* — sin fecha no se puede calcular una tasa de churn mensual real. Recomienda agregar `Tenant.cancelledAt` (y `cancellationReason`) como el cambio de schema mínimo necesario, con una advertencia explícita: **si el futuro módulo de Payments/Subscription también necesita este campo, no duplicarlo — que quede en un solo lugar.**
- **`docs/metrics/saas-metrics-spec.md`** — métricas de negocio más completas (Logo Churn Rate, Revenue Churn Rate/GRR, NRR, LTV), pero **todas dependen del módulo de Payments/Billing, que hoy no existe**. Propone una tabla `TenantMetricSnapshot` (foto mensual, no cálculo en vivo) como fuente histórica.

### Por qué esto importa para el diseño técnico, aunque no esté construido

1. **Ya condicionó una decisión de arquitectura real**: el motivo documentado para *no* fusionar `Status` dentro del mecanismo genérico de catálogo (`FieldCatalogDefinition`, compartido hoy por Department/Job Title) fue justamente que Status es una feature viva con historial (`StatusHistoryEntry`) — el mismo patrón de "guardar snapshots de nombre, no FKs vivas" que se usaría para trackear cuándo/por qué cambia el estado de un tenant.
2. **Cualquier trabajo futuro sobre suscripciones o cancelación de tenant tiene que revisar primero ambos specs de métricas** antes de agregar campos — para no terminar con `cancelledAt` en dos lugares con semántica distinta.
3. El patrón de **catálogo configurable por tenant en vez de enum fijo** (ya establecido para Status, Department, Job Title) es el mismo criterio que aplicaría si se necesitara un motivo de cancelación configurable en vez de un enum cerrado.

Ver [`05-tareas-pendientes.md`](05-tareas-pendientes.md) para el estado exacto de qué falta para poder calcular esto.
