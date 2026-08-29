# Spec: Subscription Plans — Selección de plan post-signup + trial/gracia

Mockup de referencia: `subscription-plans-mockup.html` (aprobado).

## Objetivo

Pantalla que se muestra una única vez, recién creada la cuenta, donde el owner elige un plan y
arranca el trial gratuito de 15 días. **No se cobra nada en esta ronda** — eso depende de integrar
Paddle, que queda para una sesión aparte (ver alcance más abajo). **(Nota 2026-08-29)** "Pantalla"
en el sentido literal terminó siendo un modal sobre `/overview`, no una ruta antes de `/overview`
— ver "Pantalla — `PlansModal.tsx`" más abajo. Y Paddle sí se integró después, en Billing
Integration (`spec-billing-integration.md`) — ver nota en "Alcance explícito".

## Pantalla — `PlansModal.tsx` (no es una ruta `/plans`)

**(Nota 2026-08-29 — esta sección describe el diseño original; corregida por Alejandro el mismo
día de construcción, 2026-08-13, antes de llegar a producción.)** No existe una ruta `/plans` ni
una `PlansPage.tsx` de página completa. El primer intento sí la construyó así, pero no coincidía
con el mockup aprobado (`subscription-plans-mockup.html`) — corregido a un **modal descartable**
(`frontend/src/components/common/PlansModal.tsx`, componente `Modal` con prop `xwide`) que se abre
una única vez, automáticamente, apenas se crea el workspace, **sobre** `/overview` — no bloquea
navegación a ningún lado, porque el trial de 15 días ya arrancó en el registro sin importar si se
elige un plan (es un upsell, no un gate).

- Muestra 3 tarjetas: **Free Trial**, **Starter** y **Growth**. **Scale queda escondido** (ver
  sección propia). "Free Trial" **no estaba en el mockup ni en este spec original** — se agregó a
  pedido explícito de Alejandro: mismas features que Starter, y su botón solo cierra el modal (no
  pega al backend, no hay endpoint involucrado).
- Contenido de cada tarjeta (features, copy) según lo aprobado en el mockup.
- Badge "Recommended for you" en la tarjeta que corresponda según `Tenant.companySize` cargado
  en el signup (1-10 → Starter, 11-50 → Growth) — sin badge si el tamaño cargado no cae en
  ninguna de esas dos bandas.
- El botón de Starter/Growth llama `PATCH /api/tenants/me/plan` con `{ plan: 'starter' | 'growth' }`
  — **no** arranca un trial nuevo (el trial ya arrancó en el registro, ver spec de signup), solo
  registra la elección y congela el precio.
- **Dismiss persistido por tenant** en `localStorage` (`northstack:dismissedPlansModal:{tenantId}`).
  Cerrarlo sin elegir no es un callejón sin salida (fix 2026-08-18): mientras
  `status === 'trialing' && plan === null`, `AppLayout.tsx` muestra un banner fijo ("You haven't
  picked a plan yet…") con un botón para reabrir el modal. Solo se le muestra al **owner** — un
  member que loguea antes de que el owner elija plan no ve ni el modal ni el banner (la decisión
  no es suya).
- No hay redirect a `/overview` "después de elegir" porque nunca se salió de ahí — el modal
  simplemente se cierra.
- **(Nota 2026-08-29, fuera del alcance original de este módulo)** Desde Billing Integration
  (`spec-billing-integration.md`, shippeado después), elegir Starter/Growth acá ya no termina en
  "solo registra la elección": `AppLayout.tsx` encadena la apertura de `AddPaymentMethodModal`
  para pedir un método de pago real. El `PATCH /api/tenants/me/plan` de abajo sigue existiendo tal
  cual y sigue sin cobrar nada por sí mismo — el cobro real es responsabilidad de ese módulo
  aparte, no de este endpoint.

## Precios (confirmados, oferta de lanzamiento)

| Plan | Precio de lanzamiento | Precio regular (post-lanzamiento) | Tope |
|---|---|---|---|
| Starter | $29/mes | $39/mes | hasta 10 personas |
| Growth | $79/mes | $99/mes | hasta 50 personas |
| Scale | A medida | A medida | 50+ personas — **escondido**, solo alcanzable por el link "Get in touch" |

**Regla del precio de lanzamiento:** el precio que un tenant congela al elegir su plan se
mantiene mientras siga suscripto, incluso después de que el precio regular entre en vigencia
para altas nuevas. Guardar el precio real en la fila del Tenant (no solo una referencia al plan),
para que un cambio futuro de precio de lista nunca afecte silenciosamente a un cliente existente.

## Scale/Custom — escondido, no borrado

- Sin tarjeta de precio. Un link de texto chico al pie ("Team bigger than 50 people? Get in
  touch for a custom plan.") — apunta a un `mailto:` o a un form simple (decisión del
  desarrollador, no es el foco de esta ronda).
- El enum `Tenant.plan` igual incluye `scale` (para setear manualmente a alguien que se sume por
  conversación de venta directa), aunque no sea seleccionable desde esta pantalla todavía.
- Cuando se decida lanzar Scale de verdad: reactivar la 3ra tarjeta en el frontend (ya construida,
  comentada en el mockup) — no hace falta ningún cambio de backend en ese momento.

## Máquina de estados: trial → gracia → suspendido

```
registro ──────────────────► trialing (trialEndsAt = now + 15d)
                                   │
                  se vence trialEndsAt, sin método de pago
                                   ▼
                              past_due (gracePeriodEndsAt = trialEndsAt + 14d)
                                   │
                se vence gracePeriodEndsAt, sigue sin método de pago
                                   ▼
                              suspended
```

- `Tenant.status` gana dos valores nuevos: `trialing`, `past_due` (los existentes `active`/
  `suspended`/`cancelled` quedan igual — `suspended` se reusa como estado final, no hace falta
  uno nuevo).
- Un tenant en `past_due` **mantiene acceso completo de lectura/escritura** (confirmado: es
  período de gracia, no modo solo-lectura) — solo cambia un banner avisando cuántos días quedan.
- `suspended` sí restringe algo — no estaba definido en la primera versión de este spec y quedó
  como hallazgo propio, resuelto después (`validateSession`, `src/lib/httpAuth.ts`): modo
  **view-only**, no lockout total. Cualquier request que no sea `GET` de un usuario cuyo tenant
  está `suspended` devuelve 403; los `GET` siguen funcionando para que el workspace se siga viendo.
- Cron: **no** es "el mismo patrón que el cron de Payroll" — Payroll no tiene ningún cron, no
  existía mecanismo de job programado en el proyecto antes de este módulo (hallazgo real, resuelto
  antes de escribir código). Corrió: Vercel Cron (`vercel.json` → `crons`) pegándole una vez por
  día a un endpoint interno (`GET /api/internal/plan-transitions/run`,
  `src/routes/internal.ts`), protegido por `CRON_SECRET` si está seteada (no rompe en local si
  falta, igual que `mailerConfigured()`). La lógica en sí (`planTransitionService.ts`,
  `runPlanTransitions`) sí es idempotente por construcción: cada tenant solo matchea el
  where-clause del "antes" de su propia transición, así que correrlo dos veces el mismo día no
  duplica nada.

## Alcance explícito — leer antes de construir

**(Nota 2026-08-29)** Esta sección describe el alcance **al momento de construir este módulo**
(shippeado a producción 2026-08-18). Ya no es el estado actual del proyecto — después se construyó
un módulo aparte de Billing Integration (Paddle + Mercado Pago, `spec-billing-integration.md`) que
sí cobra de verdad. Se deja el texto original abajo sin reescribir porque documenta bien lo que
esta ronda específicamente no incluía; para el estado de cobro real hoy, ver el spec de Billing
Integration, no este.

**Hoy no existe cobro real. Paddle no está integrado.** Esto significa:

- La máquina de estados de arriba (trialing → past_due → suspended) se puede construir y probar
  completa con datos falsos/manuales (por ejemplo, adelantando `trialEndsAt` a mano en la base
  para forzar la transición).
- **Hoy no hay ninguna forma real de que un tenant cargue un método de pago y salga de
  `past_due`/`suspended`** — esa pieza es la próxima, en una sesión aparte cuando se integre
  Paddle. No bloquear esta ronda por eso — el objetivo acá es la pantalla de elección de plan +
  el reloj del trial + las transiciones de estado, nada más.
- El asterisco de Payroll (calcula/registra, no mueve plata) sigue siendo verdad — sin cambios
  ahí en esta ronda.

## Modelo de datos

```prisma
Tenant.plan               PlanTier?  // enum nuevo: starter | growth | scale
Tenant.status                        // agrega trialing, past_due al enum existente
Tenant.trialEndsAt        DateTime?
Tenant.gracePeriodEndsAt  DateTime?
Tenant.lockedPriceCents   Int?       // precio real que paga este tenant, independiente de cambios futuros al precio de lista
Tenant.lockedPriceSetAt   DateTime?  // auditoría — cuándo se congeló el precio
```

Todo aditivo/nullable — sin migración destructiva. Si en algún momento se quiere un `NOT NULL`,
seguir el protocolo ya establecido (aditivo → backfill → verify → destructivo).

**(Nota 2026-08-29)** Estos campos de `Tenant` siguen existiendo tal cual — Billing Integration no
los reemplazó, agregó un modelo `Subscription` (1:1 con `Tenant`) con su propia copia de
`plan`/`status`/`lockedPriceCents`/etc., más `provider`/`externalSubscriptionId`/datos de tarjeta.
`syncSubscriptionAndTenant()` (`subscriptionService.ts`) es el único punto que escribe ambos lados
a la vez, para que no diverjan — los campos de `Tenant` de acá arriba siguen siendo lo que
`PlansModal` y la lógica `needsPlanSelection` de `AppLayout.tsx` leen. Detalle completo:
`spec-billing-integration.md`.

## Fuera de alcance en esta ronda (diferido a propósito)

Al momento de este módulo (shippeado 2026-08-18). **(Nota 2026-08-29)** Los primeros tres ítems ya
no están diferidos — se construyeron en la ronda aparte de Billing Integration
(`spec-billing-integration.md` / `task-breakdown-billing-integration.md`); se dejan listados acá
tal cual para que quede registro de qué estaba explícitamente fuera de esta ronda en particular.

- ~~Integración con Paddle / checkout real.~~ Construido en Billing Integration (Paddle +
  Mercado Pago).
- ~~UI de "agregar método de pago".~~ `AddPaymentMethodModal.tsx`, Billing Integration.
- ~~Pantalla de autogestión de suscripción en `/settings`.~~ `BillingPage.tsx` en
  Settings → My account, Billing Integration.
- Precio y flujo de venta real de Scale/Custom — **sigue sin construir**.
- Prorrateo de cambios de plan a mitad de período — **sigue sin construir** (anotado en backlog).
