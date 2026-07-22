# Métricas Básicas de Producto y Crecimiento — Especificación Técnica

- Última actualización: 2026-07-13
- Complementa [`saas-metrics-spec.md`](./saas-metrics-spec.md), que cubre las métricas
  financieras (LTV, CAC, MRR, etc.) — todas esas dependen de que exista Payments/Billing,
  que hoy no existe. **Este documento es al revés: son métricas calculables *hoy*, con el
  schema actual o con cambios mínimos, sin depender de billing.** Sirve como el primer
  panel de control mientras Payments no está.

## 0. Propósito y alcance

Métricas de **crecimiento, activación y uso del producto** — no de ingreso. Responden
"¿está creciendo la base de tenants?", "¿la usan de verdad?", "¿qué tan profundo la
usan?" — todas cosas que Northstack puede medir sobre sí mismo sin haber cobrado un solo
peso todavía.

Igual que en el otro documento: montos/conteos exactos, de dónde sale cada dato, y qué
falta agregar al schema cuando corresponda. Modelos de referencia: `Tenant`, `User`,
`Employee`, `Client`, `Invitation`, `Session`, `CustomFieldDefinition`/`CustomFieldValue`
(ver `prisma/schema.prisma`).

## 1. Qué ya es calculable hoy, sin tocar el schema

| Métrica | Fórmula | Fuente |
|---|---|---|
| Tenants totales | `COUNT(Tenant)` | `Tenant` |
| Tenants activos | `COUNT(Tenant) WHERE status = active` | `Tenant.status` |
| Altas nuevas por mes | `COUNT(Tenant) WHERE createdAt IN [mes X]` | `Tenant.createdAt` |
| Tasa de crecimiento MoM | `(altas(mes X) − altas(mes X−1)) / altas(mes X−1)` | igual que arriba |
| Usuarios por tenant | `COUNT(User) WHERE tenantId = T` | `User.tenantId` |
| Empleados cargados por tenant | `COUNT(Employee) WHERE tenantId = T` | `Employee.tenantId` |
| Clientes cargados por tenant | `COUNT(Client) WHERE tenantId = T` | `Client.tenantId` |
| Invitaciones enviadas vs. aceptadas | `COUNT(status=accepted) / COUNT(total)` | `Invitation.status` |
| Adopción de módulo HR | `COUNT(tenants con ≥1 Employee) / COUNT(tenants activos)` | `Employee` + `Tenant` |
| Adopción de módulo Clients | `COUNT(tenants con ≥1 Client) / COUNT(tenants activos)` | `Client` + `Tenant` |
| Uso de custom fields (profundidad de configuración) | `COUNT(CustomFieldDefinition) WHERE tenantId = T AND isActive = true` | `CustomFieldDefinition` |
| Frecuencia de login (proxy) | `COUNT(DISTINCT DATE(Session.createdAt)) WHERE userId = U` | `Session.createdAt` |

Todo esto ya es una query directa contra las tablas existentes — no requiere ningún
cambio de schema, solo escribir los endpoints/reportes.

## 2. Métricas que necesitan un dato nuevo (barato, no depende de Payments)

### 2.1 Time to First Value (TTFV)
- **Pregunta**: cuánto tarda un tenant recién creado en cargar su primer dato real
  (primer empleado o primer cliente) — indicador de activación temprana.
- **Fórmula**: `MIN(Employee.createdAt, Client.createdAt WHERE tenantId = T) − Tenant.createdAt`
- **Dato faltante**: ninguno — ya calculable con `createdAt` de ambos lados. Se incluye
  acá (y no en la sección 1) porque es una métrica derivada, no una query simple de
  conteo.
- **Ventana sugerida**: reportar como mediana (no promedio) de TTFV en horas, agrupado
  por cohorte de mes de alta — un solo outlier de un tenant que tardó 60 días distorsiona
  el promedio.

### 2.2 Logo Churn básico (sin fecha de baja)
- **Limitación real**: `Tenant.status = cancelled` dice *que* canceló, no *cuándo* ni
  *por qué*. Sin fecha, no se puede calcular una tasa de churn mensual real (solo un
  conteo total acumulado de cancelados a la fecha).
- **Cambio mínimo recomendado**: agregar a `Tenant`:
  ```prisma
  model Tenant {
    // ...campos existentes...
    cancelledAt        DateTime?
    cancellationReason String?
  }
  ```
- **Con este campo, la fórmula es**:
  `COUNT(Tenant) WHERE cancelledAt IN [mes X] / COUNT(Tenant activos a inicio de mes X)`
- Este mismo campo ya estaba recomendado en `saas-metrics-spec.md` sección 1 a nivel
  `Subscription` — acá se pide a nivel `Tenant` porque hoy no existe `Subscription`
  todavía. **Si se implementa Payments antes que esto**, el campo correcto pasa a ser
  `Subscription.cancelledAt` y este de acá queda redundante — no crear los dos a la vez.

### 2.3 Usuarios/tenants activos por período (DAU/WAU/MAU real)
- **Limitación real**: `Session.createdAt` marca el momento del login, pero no hay
  ninguna señal de actividad posterior dentro de esa sesión (no hay `lastSeenAt` ni
  ningún log de acciones — esto último ya está anotado como idea en
  `docs/tareas-desarrollo.md`: "sistema de logs por usuario"). Hoy, "activo" solo puede
  aproximarse como "inició sesión al menos una vez en el período", no como uso real
  dentro del producto.
- **Cambio mínimo recomendado**: agregar `Session.lastSeenAt DateTime @default(now())`,
  actualizado en cada request autenticado (middleware de auth ya existente). Con eso:
  - **DAU** = `COUNT(DISTINCT userId) WHERE lastSeenAt::date = hoy`
  - **WAU/MAU** = mismo cálculo con ventana de 7/30 días
- Sin este campo, se puede reportar una versión más débil ("logins por día" en vez de
  "usuarios activos por día"), que sobreestima actividad si alguien queda logueado sin
  usar la app.

### 2.4 Seat utilization (activación de equipo)
- **Pregunta**: de los usuarios que un tenant invitó, ¿cuántos efectivamente se sumaron
  y usan la cuenta?
- **Fórmula**: `COUNT(Invitation status=accepted) / COUNT(Invitation total, status != revoked)` por tenant
- Ya calculable hoy sin cambios — incluido acá porque conceptualmente es "activación",
  no un conteo simple.

## 3. Reglas de coherencia (mismas convenciones que el otro documento)

1. **Cortes de mes en UTC, día 1 00:00** — igual que `saas-metrics-spec.md`, para que
   ambos documentos sean comparables si algún día se cruzan (ej. "altas nuevas" acá vs.
   "New MRR" allá deberían coincidir en qué tenants cuentan como nuevos ese mes).
2. **Mediana, no promedio, para métricas de tiempo** (TTFV, tiempo hasta primera
   invitación aceptada, etc.) — los datos de producto B2B suelen tener cola larga.
3. **"Activo" tiene una sola definición por contexto**: `Tenant.status = active` es
   estado de cuenta (¿puede operar?); DAU/WAU/MAU es uso real (¿alguien entró?). No
   mezclar ambos bajo la palabra "activo" en el mismo reporte sin aclarar cuál es cuál.
4. **No crear `Tenant.cancelledAt` y `Subscription.cancelledAt` a la vez** (ver 2.2) —
   es el mismo dato, dos veces, si ambos documentos se implementan en paralelo. Definir
   antes cuál módulo se construye primero.
5. **Estas métricas no reemplazan a las de `saas-metrics-spec.md`** — son la vista de
   "¿usan el producto?", no "¿genera ingreso el producto?". Ambas son necesarias, ninguna
   sustituye a la otra.

## 4. Qué falta cargar y de dónde sale

| Dato | Fuente | Automatizable hoy |
|---|---|---|
| `Tenant.cancelledAt` / `cancellationReason` | Se completa al momento de dar de baja (acción del owner o soporte) | Sí, una vez agregado el campo |
| `Session.lastSeenAt` | Se actualiza solo, en el middleware de auth existente | Sí, una vez agregado el campo |
| Todo lo demás (sección 1, 2.1, 2.4) | Ya existe en el schema actual | Sí, ya mismo |

## 5. Prioridad sugerida de implementación

1. Reportes de sección 1 (cero cambios de schema, valor inmediato).
2. `Session.lastSeenAt` → DAU/WAU/MAU reales (cambio de una línea + un `update` en el
   middleware).
3. `Tenant.cancelledAt`/`cancellationReason` → único que requiere decidir dónde vive si
   Payments se construye en paralelo (ver regla 4 de la sección 3).
