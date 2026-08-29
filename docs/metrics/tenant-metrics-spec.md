# Métricas para tenants (sobre sus propios datos) — catálogo técnico

- Última actualización: 2026-08-29
- **Estado**: todo lo marcado ✅ Hoy en este documento está construido —
  `src/modules/metrics/{hr,timeOff,payroll,sales,tasks,adoption}MetricsService.ts`, expuesto en un
  solo endpoint combinado `GET /api/tenant-metrics/overview` (`validateSession`, escopeado al
  tenant del usuario autenticado; `sales.dealsByOwner` se devuelve vacío salvo para
  owner/admin — ver `canViewSalesLeaderboard`, `permissionService.ts`). Verificado con datos reales
  de `staging` (no solo `npm run build`/`npm test`, aunque ambos están en verde). Lo marcado 🔧/🚫
  quedó en `docs/tareas/backlog.md` bajo "Métricas", sin construir todavía. **No decidido
  todavía**: dónde vive esto en el frontend (`/overview` vs. una sección "Dashboards" nueva, sin
  spec) — este endpoint es el insumo, no la UI.
- Complementa a `basic-metrics-spec.md`/`saas-metrics-spec.md`, que son al revés: métricas
  **cross-tenant**, del propio negocio de Northstack sobre sus tenants (cuántos tenants hay, MRR,
  churn de Northstack, etc.) — confidenciales, nunca visibles dentro de la cuenta de un tenant.
  **Este documento es lo opuesto**: métricas sobre **los datos de un tenant específico**, para que
  ese mismo tenant las vea sobre sí mismo (ej. en `/overview` o en una futura sección de
  Dashboards) — cada tenant ve solo las suyas, nunca las de otro.

## 0. Propósito y alcance

Recorre cada módulo del producto (HR, Time Off, Payroll, Sales/CRM, Payments v1, Tasks/Notes,
Public Forms, adopción interna) y cataloga qué métrica tiene sentido mostrarle a un tenant sobre
su propia cuenta, y su estado real hoy:

- ✅ **Hoy** — calculable ya mismo contra el schema actual, sin ninguna migración.
- 🔧 **Necesita algo chico** — un campo nuevo (nullable, aditivo) o esperar a que un módulo que ya
  está construido (solo en `staging`) llegue a producción. No es una decisión de negocio, es
  trabajo mecánico.
- 🚫 **Bloqueado** — depende de una decisión de producto/negocio sin tomar, o de una entidad que no
  existe todavía y no está clara cómo modelarla.

Este documento **no decide todavía** dónde vive cada métrica (`/overview` vs. una sección
"Dashboards" nueva, todavía sin spec) ni qué librería de gráficos usar — es el insumo para esa
decisión, no la decisión en sí. Ver la sección 4.

## 1. Reglas transversales (aplican a todo el catálogo)

1. **Nunca blendear monedas sin agrupar** — `Opportunity.currency` y `PayrollEntry.currency` son
   por-registro, no por-tenant (`Tenant.currency` es solo un default de UI). Toda suma de montos
   agrupa por `currency` primero.
2. **Mediana, no promedio, para métricas de tiempo** (duración de ciclo de venta, tiempo de
   aprobación de Time Off, tenure) — mismo criterio que `basic-metrics-spec.md`, datos B2B tienen
   cola larga y un outlier distorsiona el promedio.
3. **El `Employee` auto-creado del owner** (todo tenant nuevo tiene 1 registro automático) es un
   caso especial recurrente en cualquier métrica de headcount/adopción — hay que decidir
   explícitamente si cuenta o no, mismo gotcha que ya resolvieron `scripts/metrics-report.ts` y el
   onboarding checklist (`count > 1`, no `> 0`).
4. **Gating por rol dentro del tenant**: algunas métricas exponen datos sensibles de personas
   específicas (compensación, deals por owner/leaderboard) — no deberían quedar abiertas a
   cualquier `member` como sí lo están Tasks/Notes. A definir caso por caso, no todo el catálogo es
   "abierto a cualquier rol".

## 2. Catálogo por módulo

### 2.1 HR / Employees

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Headcount total / activo | ✅ Hoy | `COUNT(Employee) WHERE tenantId=T`, por `statusId` (join a `StatusDefinition`, configurable por tenant) |
| Altas por mes (crecimiento de equipo) | ✅ Hoy | `Employee.startDate` o `createdAt`, agrupado por mes |
| Headcount por departamento / puesto | ✅ Hoy | `groupBy departmentId` / `jobTitleId` (`FieldCatalogDefinition`) |
| Mix de contract type (part/full time) | ✅ Hoy | `Employee.contractType` |
| Mix de person type (profile/contractor/employee) | ✅ Hoy | `Employee.personType` |
| Tenure promedio/mediana | ✅ Hoy | `startDate` → `endDate` o hoy, mediana en días |
| Span of control (reportes directos por manager) | ✅ Hoy | `groupBy managerId` |
| Completitud de custom fields (calidad de dato) | ✅ Hoy | mismo cálculo que `metrics-report.ts`, escopeado a 1 tenant |
| **Attrition / turnover rate** | 🔧 Necesita algo chico | `EmployeeTermination` ya existe con todo lo necesario (`terminationDate`, `executedAt`) — pero el módulo está **solo en `staging`**, no en producción. Fórmula lista: `terminaciones ejecutadas en el período / headcount promedio del período`. Se desbloquea solo con la promoción a `main`, cero trabajo nuevo |

### 2.2 Time Off

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Utilización de balance (días tomados / disponibles) | ✅ Hoy | reusa `timeOffBalanceService.ts` (ya calcula esto al vuelo) |
| Tasa de aprobación | ✅ Hoy | `approved / (approved + rejected)` |
| Tiempo mediano de aprobación | ✅ Hoy | `decidedAt - createdAt`, mediana |
| Solicitudes pendientes (backlog operativo) | ✅ Hoy | `COUNT WHERE status=pending` |
| Adopción de políticas | ✅ Hoy | empleados con ≥1 `EmployeeTimeOffPolicy` / total |
| Días tomados por período, team-wide | ✅ Hoy | `SUM(daysRequested) WHERE status=approved` en rango |
| Distribución por política | ✅ Hoy | `groupBy timeOffPolicyId` |

### 2.3 Payroll

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Costo total de nómina por período | ✅ Hoy | `SUM(PayrollEntry.amountCents)` por `runId`, **agrupado por `currency`** |
| Tendencia de costo mes a mes | ✅ Hoy | igual que arriba, por mes de `paymentDate` |
| Costo por tipo (base/bonus/commission/reimbursement/deduction) | ✅ Hoy | `groupBy PayrollEntry.type` |
| Compensación promedio/mediana por depto o contract type | ✅ Hoy | join `EmployeeCompensation` → `Employee` |
| Pagos off-cycle (cantidad y monto) | ✅ Hoy | `WHERE runId IS NULL` |
| Tasa de confirmación de contrato (fricción de onboarding) | ✅ Hoy | `confirmedAt != null / total EmployeeCompensation` |
| Costo de nómina como % de ingresos | 🚫 Bloqueado | no hay "ingresos del tenant" en el sistema — cruzarlo con Payments v1 (pagos de *sus* clientes) es una idea razonable pero mezcla dos módulos distintos; no construir sin decidirlo explícitamente primero |

### 2.4 Sales / CRM (Company, Contact, Opportunity, Pipeline)

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Valor de pipeline abierto | ✅ Hoy | `Opportunity` activas con `stage.outcome='open'`, `SUM(amountCents)` por `currency`, por pipeline/stage |
| Win rate | ✅ Hoy | `won / (won + lost)` en un período, vía `stage.outcome` |
| Tamaño promedio/mediana de deal ganado | ✅ Hoy | `Opportunity.amountCents WHERE stage.outcome='won'` |
| Duración del ciclo de venta | ✅ Hoy | `OpportunityStageHistory` (primera entrada → entrada a stage `won`), mediana en días |
| Tiempo en stage / alertas de deal estancado | ✅ Hoy | ya hay indicador individual en el panel de detalle; agregarlo (promedio histórico por stage) es exactamente el ítem ya anotado en `docs/tareas/backlog.md` — sin schema nuevo |
| Conversión Lead → Opportunity | ✅ Hoy | `Contact.leadStatus` → vínculo en `OpportunityContact` |
| Efectividad por lead source | ✅ Hoy | `groupBy leadSourceId`, cruzado con `stage.outcome='won'` |
| Distribución de motivo de pérdida | ✅ Hoy | `groupBy lossReasonId` |
| Multi-threading (deals con 1 solo contacto) | ✅ Hoy | ya construido en `metrics-report.ts` — mismo query, escopeado a 1 tenant |
| Nuevas Companies por mes / conversión a Customer | ✅ Hoy | `Company.createdAt` + `statusId` (Won→Customer ya es automático) |
| Deals por owner (leaderboard) | ✅ Hoy, con reserva | dato sensible de performance individual dentro del tenant — considerar gate por rol antes de mostrarlo a cualquier `member` |
| Forecast ponderado por probabilidad de stage | 🔧 Necesita algo chico | Sales v2 ya lo construyó — **solo en `staging`**. Se hereda gratis cuando se promueva |
| **Company churn** | 🚫 Bloqueado | `Company.status: Churned` no tiene disparador automático — depende de una entidad `Contract` que no existe. El campo existe pero hoy solo se puede setear a mano, no es una métrica confiable todavía |
| Public Form → conversión real | 🚫 Bloqueado | ver 2.7 |

### 2.5 Payments v1 (conexión Stripe propia del tenant — hoy en `staging`)

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Total cobrado / cantidad de pagos | 🔧 Necesita algo chico | `summarizeCharges` ya lo calcula por Company (`paymentsCount`/`paymentsAmountCents`) — falta agregarlo tenant-wide, sin schema nuevo. Bloqueado por producción hasta que Payments v1 salga de `staging` |
| Tasa de disputes/refunds | 🔧 Necesita algo chico | mismo caso — ya calculado por Company, falta agregación tenant-wide |
| Revenue por Company (top customers) | 🔧 Necesita algo chico | mismo caso |
| Tiempo a primer pago | 🔧 Necesita algo chico | `firstPaymentAt` ya existe por Company |

Además depende de que el tenant conecte su propia cuenta de Stripe (opt-in, no todos lo van a
tener cargado).

### 2.6 Tasks / Notes

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Tasa de completado de tasks | ✅ Hoy | `completedAt != null / total` |
| Tasks vencidas (overdue) | ✅ Hoy | `dueDate < hoy AND completedAt IS NULL` |
| Tiempo mediano a completar | ✅ Hoy | `completedAt - createdAt` |
| Volumen de notas (señal de uso, no de negocio) | ✅ Hoy | `COUNT(Note)` por período |

### 2.7 Public Forms

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Volumen de submissions, tendencia | 🚫 Bloqueado | un submit exitoso crea el `Contact`/`Employee` directamente — **no queda ningún registro de que hubo un submit**, ni un campo que marque "este Contact vino de un Form" vs. alta manual. No se puede reconstruir de forma confiable con el schema actual |
| Conversión submission → Opportunity | 🚫 Bloqueado | mismo problema de origen — sin un campo tipo `Contact.source`, no hay forma de aislar el subconjunto que vino de un Form |

### 2.8 Adopción interna (cómo el propio tenant usa la plataforma)

| Métrica | Estado | Fuente / fórmula |
|---|---|---|
| Seat utilization (invitaciones aceptadas / enviadas) | ✅ Hoy | `Invitation.status`, escopeado a 1 tenant |
| Módulos realmente usados (HR/Sales/Payroll/Time Off) | ✅ Hoy | mismo patrón que la adopción cross-tenant de `metrics-report.ts`, pero para uso interno del propio tenant (útil para un owner que quiere ver cómo su equipo adopta la herramienta) |
| Frecuencia de login de los propios usuarios | ✅ Hoy (proxy débil) | `Session.createdAt` — mejora real si se agrega `Session.lastSeenAt` (mismo gap ya identificado en `basic-metrics-spec.md` §2.3, aplica igual acá) |

## 3. Resumen — qué desbloquea qué

| Bloqueante | Métricas que desbloquea | Qué hace falta |
|---|---|---|
| Employee Termination → producción | Attrition/turnover rate | Nada nuevo, ya está construido y verificado en `staging` — es una promoción, no una feature nueva |
| Sales v2 → producción | Forecast ponderado por stage | Ídem — ya construido en `staging` |
| Payments v1 → producción | Total cobrado, disputes/refunds, revenue por Company, tiempo a primer pago (agregados tenant-wide) | Agregación nueva (chica) sobre lo que ya existe por Company, + esperar la promoción |
| `Session.lastSeenAt` (campo nuevo) | Frecuencia de login real (no solo proxy de `createdAt`) | 1 campo nullable + 1 write en `authenticateToken()` |
| `Contact.source`/similar (campo nuevo, decisión de diseño) | Volumen y conversión real de Public Forms | Requiere definir el campo — no es solo "agregar una columna", hay que decidir qué valores tiene y desde dónde se setea |
| Entidad `Contract` (no existe, sin diseñar) | Company churn confiable | Bloqueado de fondo, no es una tarea chica — es la misma decisión ya pospuesta en el rediseño de Sales |
| Cruce Payroll × Payments v1 (decisión de producto) | Costo de nómina como % de ingresos | No construir sin que el usuario lo pida explícitamente — mezcla dos módulos pensados por separado |

## 4. Lo que este documento no decide (a propósito)

- Dónde vive cada métrica: `/overview` (widget chico, ya tiene un slot de sidebar usado hoy solo
  por `MyTasksWidget`) vs. una sección "Dashboards" nueva (sin spec, sin librería de gráficos
  decidida, sin lugar en el nav) son ideas distintas confirmadas con el usuario, pero la
  asignación métrica-por-métrica todavía no está hecha.
- Prioridad de construcción: la mayoría del catálogo ya es ✅ Hoy — construir todo junto no tiene
  sentido, hace falta que el usuario elija qué le importa ver primero.
- Nada de esto incluye métricas cross-tenant del negocio de Northstack (MRR, ARR, churn propio,
  etc.) — eso es `saas-metrics-spec.md`, deliberadamente fuera de alcance acá.
