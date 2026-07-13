# SaaS Business Metrics — Especificación Técnica

- Última actualización: 2026-07-13

## 0. Propósito y alcance

Este documento especifica, con precisión suficiente para que un desarrollador (o una IA)
lo implemente sin tener que tomar decisiones de negocio por su cuenta, qué datos hacen
falta y cómo se calcula cada métrica estándar de negocio B2B SaaS (LTV, CAC, MRR, churn,
etc.) **para el propio negocio de Northstack** — es decir, tratando a cada `Tenant` como
un cliente de Northstack, no como una empresa que a su vez tiene empleados/clientes
propios dentro del producto.

Todo lo que sigue **depende de que exista el módulo de Payments/Billing**, hoy no
implementado (ver `docs/current-process-flow.md`, sección "Payments/subscriptions
billing"). Este documento asume que ese módulo se construye junto con lo de acá, y define
el modelo de datos necesario para ambos a la vez, para evitar dos rondas de migraciones.

Si se implementa parcialmente, **no improvisar valores por defecto para lo que falta**
(ver sección 6, decisiones abiertas) — quedan marcadas explícitamente porque cambian el
resultado de las métricas y son decisiones de negocio, no de ingeniería.

## 1. Modelo de datos requerido (prerrequisito)

Convenciones a mantener, iguales a las del schema actual: `id String @default(uuid())`,
todo lo que sea multi-tenant lleva `tenantId` + relación a `Tenant`, montos de dinero
**siempre en centavos (Int), nunca Float**, moneda como `String` ISO-4217 (`"USD"`) para
no arrastrar errores de redondeo en los cálculos de abajo.

```prisma
enum SubscriptionStatus {
  trialing
  active
  past_due
  cancelled
}

enum BillingInterval {
  monthly
  annual
}

enum AcquisitionChannel {
  organic
  paid_ads
  referral
  content
  outbound_sales
  partnership
  other
}

enum DepartmentCategory {
  sales
  marketing
  rnd        // research & development / ingeniería de producto
  cs         // customer success / soporte
  ga         // general & administrative
}

model Plan {
  id              String            @id @default(uuid())
  name            String
  interval        BillingInterval
  priceCents      Int               // precio de este plan/intervalo, en centavos
  currency        String            // ISO 4217, ej. "USD"
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  subscriptions   Subscription[]
}

model Subscription {
  id                  String              @id @default(uuid())
  tenantId            String
  tenant              Tenant              @relation(fields: [tenantId], references: [id])
  planId              String
  plan                Plan                @relation(fields: [planId], references: [id])
  status              SubscriptionStatus  @default(trialing)
  startedAt           DateTime            @default(now())
  trialEndsAt         DateTime?
  currentPeriodStart  DateTime
  currentPeriodEnd    DateTime
  cancelledAt         DateTime?
  cancellationReason  String?
  createdAt           DateTime            @default(now())
  invoices            Invoice[]

  @@index([tenantId])
}

model Invoice {
  id              String         @id @default(uuid())
  subscriptionId  String
  subscription    Subscription   @relation(fields: [subscriptionId], references: [id])
  amountCents     Int
  currency        String
  status          String         // "paid" | "failed" | "refunded" — cobrado realmente
  periodStart     DateTime
  periodEnd       DateTime
  paidAt          DateTime?
  createdAt       DateTime       @default(now())

  @@index([subscriptionId])
}

// Gasto por departamento, cargado a mano (no lo genera el producto).
// Un registro por mes calendario y departamento.
model DepartmentSpend {
  id            String              @id @default(uuid())
  department    DepartmentCategory
  month         DateTime            // siempre día 1 del mes, UTC, ej. 2026-07-01T00:00:00Z
  amountCents   Int
  currency      String
  notes         String?
  createdAt     DateTime            @default(now())

  @@unique([department, month])
}
```

Cambios adicionales a modelos existentes:

```prisma
model Tenant {
  // ...campos existentes...
  acquisitionChannel  AcquisitionChannel?   // null = desconocido/no cargado
  subscriptions       Subscription[]
}
```

**Por qué `cancelledAt`/`cancellationReason` viven en `Subscription` y no en `Tenant`**:
un tenant puede re-suscribirse después de cancelar; `Tenant.status` sigue siendo el
estado operativo de la cuenta (¿puede loguearse?), `Subscription.status` es el estado
comercial (¿está pagando?). No duplicar la fecha de cancelación en dos lugares — siempre
es la del último `Subscription` de ese tenant.

## 2. Estrategia de agregación: snapshot mensual, no cálculo en vivo

Casi todas las métricas de abajo son "en un punto del tiempo" (MRR de junio, churn de
mayo) y requieren reconstruir el estado histórico. **No calcular esto en vivo contra el
estado actual de las tablas** — el estado actual solo tiene el presente, y las métricas
de negocio necesitan series de tiempo.

Se requiere un job (cron mensual, día 1 del mes, procesando el mes recién cerrado) que
escriba una tabla de snapshot:

```prisma
model TenantMetricSnapshot {
  id                String    @id @default(uuid())
  tenantId          String
  tenant            Tenant    @relation(fields: [tenantId], references: [id])
  month             DateTime  // día 1 del mes, UTC
  mrrCents          Int       // MRR de este tenant a cierre de ese mes (0 si no activo)
  status            SubscriptionStatus
  isNew             Boolean   // ¿es el primer mes de este tenant como pagador?
  isChurned         Boolean   // ¿canceló durante este mes?
  isExpansion       Boolean   // ¿su MRR subió vs. mes anterior?
  isContraction     Boolean   // ¿su MRR bajó vs. mes anterior (sin llegar a 0)?
  createdAt         DateTime  @default(now())

  @@unique([tenantId, month])
}
```

Todas las fórmulas de la sección 3 se leen de `TenantMetricSnapshot` +
`DepartmentSpend`, nunca directamente de `Subscription`/`Invoice` en vivo, salvo el
snapshot job en sí mismo.

## 3. Métricas — definición, fórmula y datos exactos

Convención de todo lo que sigue: mes calendario en UTC, montos en centavos hasta el
paso final de presentación (dividir por 100 solo al mostrar). "Activo" = `Subscription.
status IN (active, past_due)`; `trialing` **no** cuenta para ningún ingreso.

### 3.1 MRR (Monthly Recurring Revenue)
- **Pregunta que responde**: cuánto ingreso recurrente tiene Northstack en un mes dado.
- **Fórmula**: `SUM(TenantMetricSnapshot.mrrCents) WHERE month = X`
- **Cómo se calcula `mrrCents` por tenant en el snapshot job**: si `Subscription.
  status IN (active, past_due)` en ese mes → `Plan.priceCents` normalizado a mensual
  (`priceCents` si `interval = monthly`, `priceCents / 12` si `interval = annual`,
  redondeo bancario). Si no hay subscription activa ese mes → 0.
- **Edge case**: un tenant que cancela a mitad de mes sigue contando MRR completo ese
  mes (no se prorratea dentro del mes; el corte es a fin de mes).

### 3.2 ARR (Annual Recurring Revenue)
- **Fórmula**: `MRR(mes actual) × 12`. No es una suma de 12 meses históricos.

### 3.3 ARPU (Average Revenue Per Account)
- **Fórmula**: `MRR(mes X) / COUNT(tenants con mrrCents > 0 en mes X)`

### 3.4 New MRR / Expansion MRR / Contraction MRR / Churned MRR
- **New MRR**: `SUM(mrrCents) WHERE isNew = true AND month = X`
- **Expansion MRR**: `SUM(mrrCents_actual - mrrCents_mes_anterior) WHERE isExpansion = true AND month = X`
- **Contraction MRR**: `SUM(mrrCents_mes_anterior - mrrCents_actual) WHERE isContraction = true AND month = X` (valor positivo, representa pérdida)
- **Churned MRR**: `SUM(mrrCents_mes_anterior) WHERE isChurned = true AND month = X`
- **Net New MRR** = `New + Expansion − Contraction − Churned`

### 3.5 Logo Churn Rate
- **Fórmula**: `COUNT(isChurned = true, mes X) / COUNT(tenants activos a inicio de mes X)`
- No confundir con revenue churn (abajo) — un tenant chico que cancela pesa igual que
  uno grande en esta métrica.

### 3.6 Revenue Churn Rate (GRR inverso)
- **Fórmula**: `Churned MRR(mes X) / MRR(inicio de mes X)`

### 3.7 GRR (Gross Revenue Retention)
- **Fórmula**: `1 − Revenue Churn Rate`. Nunca puede superar el 100%.

### 3.8 NRR (Net Revenue Retention)
- **Fórmula**: `(MRR_inicio_mes − Churned MRR − Contraction MRR + Expansion MRR) / MRR_inicio_mes`
- Puede superar 100% (expansion compensando churn). Requiere `isExpansion`/
  `isContraction`/`isChurned` correctos en el snapshot — de ahí que se calculen ahí y
  no se re-deriven en cada query.

### 3.9 LTV (Customer Lifetime Value)
- **Fórmula recomendada** (más realista que la "ARPU / churn" simplificada, porque
  incorpora costo de servir):
  `LTV = ARPU × Margen_bruto_% × (1 / Logo_Churn_Rate_mensual)`
- **Margen bruto**: `(MRR − costo_de_servir) / MRR`. `costo_de_servir` = hosting
  (Vercel/Neon), soporte, email transaccional — hoy esto tampoco se trackea en la app;
  es otro insumo cargado a mano (ver sección 4, extender `DepartmentSpend` o una tabla
  de infra cost aparte con la misma forma).
- **Ventana**: usar churn mensual promedio de **los últimos 3 meses cerrados**, no un
  solo mes (un mes con 0 o 1 cancelaciones distorsiona 1/churn hacia infinito).

### 3.10 CAC (Customer Acquisition Cost)
- **Fórmula**: `(DepartmentSpend[sales] + DepartmentSpend[marketing] del mes X) / New_customers(mes X)`
- **New_customers(mes X)** = `COUNT(TenantMetricSnapshot WHERE isNew = true AND month = X)`
- **Nota de coherencia**: sumar *solo* `sales` + `marketing` de `DepartmentSpend`, no
  `rnd`/`cs`/`ga` — esos van a Rule of 40 / Gross Margin, no a CAC. No mezclar.

### 3.11 CAC por canal
- Requiere que `Tenant.acquisitionChannel` esté poblado en el alta (hoy no existe el
  campo ni se pide en el registro — hay que agregarlo al flujo de
  `registerTenantWithOwner`, aunque sea opcional al principio).
- **Fórmula**: igual que 3.10 pero el gasto de `DepartmentSpend` tendría que poder
  discriminarse por canal, lo cual el modelo de arriba **no soporta** (es un total por
  departamento/mes, no por canal). Si se quiere este desglose, `DepartmentSpend`
  necesita un campo opcional `channel: AcquisitionChannel?` — **decisión abierta**, no
  agregarlo especulativamente sin confirmar que se va a cargar el gasto ya
  segmentado por canal (si el gasto real no viene segmentado, el campo queda siempre
  null y no sirve).

### 3.12 CAC Payback Period (en meses)
- **Fórmula**: `CAC / (ARPU × Margen_bruto_%)`

### 3.13 LTV:CAC ratio
- **Fórmula**: `LTV / CAC`. Referencia de industria: saludable ≥ 3.

### 3.14 Magic Number
- **Fórmula**: `(ARR(mes X) − ARR(mes X−3)) / DepartmentSpend[sales]+[marketing](mes X−3)`
- Usa el gasto de S&M del trimestre **anterior** contra el ARR ganado en el trimestre
  **actual** (hay lag entre gasto e ingreso) — no usar el gasto del mismo período, es un
  error común que infla la métrica.

### 3.15 Rule of 40
- **Fórmula**: `% crecimiento YoY de ARR + Margen_operativo_%`
- `Margen_operativo_% = (ARR − SUM(DepartmentSpend, todas las categorías, anualizado)) / ARR`

### 3.16 Costo por departamento (S&M / R&D / CS / G&A)
- No es una métrica derivada del producto — es el dato de entrada (`DepartmentSpend`)
  que alimenta CAC, Magic Number y Rule of 40. Reportarlo también como:
  - **% de ARR por departamento**: `SUM(DepartmentSpend[dept], anualizado) / ARR` — esta
    sí es una métrica (eficiencia de gasto por función, benchmarkeable contra otras
    empresas SaaS).

## 4. Qué falta cargar y de dónde sale

| Dato | Fuente | Automatizable hoy |
|---|---|---|
| `Plan`, `Subscription`, `Invoice` | Se llenan solos una vez que exista el checkout de Payments | Sí, una vez implementado Payments |
| `Tenant.acquisitionChannel` | Se pregunta (opcional) en el registro, o se completa a mano en un admin panel | Parcialmente — requiere un campo nuevo en el form de registro |
| `DepartmentSpend` (sales/marketing/rnd/cs/ga) | Nómina + facturas de herramientas — no lo genera el producto | No — carga manual mensual, por diseño |
| Costo de infraestructura (para margen bruto) | Facturas de Vercel/Neon/Zoho | No — carga manual, o integración futura con las APIs de billing de esos proveedores |

## 5. Reglas de coherencia (para que la IA que lo implemente no improvise)

1. **Toda plata es `Int` en centavos.** Nunca `Float`/`Decimal` para moneda — evita
   errores de redondeo acumulados en sumas mensuales.
2. **Contabilidad por devengado (accrual), no por caja.** MRR se calcula desde
   `Subscription.status`, no desde si el `Invoice` se cobró o no. Un `past_due` sigue
   contando como MRR (todavía no se lo dio de baja); solo `cancelled` saca el MRR.
3. **`trialing` nunca aporta ingreso** a ninguna métrica de arriba.
4. **Todos los cortes de mes son UTC, día 1 00:00**, sin excepción, para que
   `DepartmentSpend.month` y `TenantMetricSnapshot.month` sean directamente
   comparables (mismo valor de fecha, no solo "mismo mes" en distintas zonas horarias).
5. **`DepartmentSpend` es mensual y por categoría fija** (`DepartmentCategory`), no por
   equipo/persona — si en el futuro se necesita más detalle, se agrega granularidad
   dentro de esa tabla, no se crean tablas paralelas.
6. **CAC solo usa `sales` + `marketing`**; Rule of 40 y Gross Margin usan las 5
   categorías. No cambiar qué categorías entran en cada fórmula sin actualizar este
   documento — es la fuente de verdad para ambos cálculos.
7. **El snapshot mensual (`TenantMetricSnapshot`) es la única fuente para reportes
   históricos.** Ninguna métrica de la sección 3 se recalcula "en vivo" contra el estado
   actual de `Subscription`, excepto el propio job que genera el snapshot.

## 6. Decisiones abiertas (requieren al usuario, no se infieren)

- **Multi-moneda**: ¿Northstack va a facturar en más de una moneda? Si sí, todas las
  sumas de arriba (`SUM(mrrCents)`) necesitan conversión a una moneda base con tipo de
  cambio histórico (no el actual) antes de sumar entre tenants. No implementado en este
  documento porque depende de la decisión de Payments (Paddle vs. Stripe, ver
  `docs/current-process-flow.md`).
- **Duración y manejo del trial**: cuántos días, y si un trial vencido pasa a
  `cancelled` automáticamente o a un estado intermedio. Afecta directamente el cálculo
  de `isNew` en el snapshot (¿el mes que cuenta es el del trial o el de la primera
  facturación real?).
- **Prorrateo en upgrade/downgrade a mitad de período**: si se permite, `Expansion
  MRR`/`Contraction MRR` deberían reflejar el monto prorrateado real cobrado, no la
  diferencia de precio de lista entre planes. No definido acá.
- **Segmentar `DepartmentSpend` por canal** (sección 3.11) — solo vale la pena si el
  gasto real de marketing ya viene separado por canal en el origen (ej. Google Ads vs.
  contenido). Confirmar antes de agregar el campo.
