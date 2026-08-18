# Spec: Subscription Plans — Selección de plan post-signup + trial/gracia

Mockup de referencia: `subscription-plans-mockup.html` (aprobado).

## Objetivo

Pantalla que se muestra una única vez, recién creada la cuenta, antes de `/overview`, donde el
owner elige un plan y arranca el trial gratuito de 15 días. **No se cobra nada en esta ronda** —
eso depende de integrar Paddle, que queda para una sesión aparte (ver alcance más abajo).

## Pantalla — `/plans`

- Layout full-page, card centrada (misma familia que `AcceptInvitePage`/`PublicFormPage` — no el
  split-screen de `AuthLayout`, porque acá el usuario ya tiene cuenta creada).
- Muestra 2 tarjetas: **Starter** y **Growth**. **Scale queda escondido** (ver sección propia).
- Contenido de cada tarjeta (features, copy) según lo aprobado en el mockup.
- Badge "Recommended for you" en la tarjeta que corresponda según `Tenant.companySize` cargado
  en el signup (1-10 → Starter, 11-50 → Growth).
- El botón de cada tarjeta ("Start free trial") llama `PATCH /api/tenants/me/plan` con
  `{ plan: 'starter' | 'growth' }` — **no** arranca un trial nuevo (el trial ya arrancó en el
  registro, ver spec de signup), solo registra la elección y congela el precio.
- Después de elegir, redirect a `/overview` normal.

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
- Cron (mismo patrón de ventana de recuperación + idempotencia que el cron de Payroll ya usa):
  corre diario, revisa tenants que cruzaron `trialEndsAt` o `gracePeriodEndsAt` sin método de
  pago activo, y cambia el `status` correspondiente.

## Alcance explícito — leer antes de construir

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

## Fuera de alcance en esta ronda (diferido a propósito)

- Integración con Paddle / checkout real.
- UI de "agregar método de pago".
- Pantalla de autogestión de suscripción en `/settings` (ver plan actual, cambiar de plan,
  cancelar) — ya anotada en el backlog como ítem separado.
- Precio y flujo de venta real de Scale/Custom.
- Prorrateo de cambios de plan a mitad de período.
