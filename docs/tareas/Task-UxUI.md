# Task UX/UI — 2026-09-15

## Product tour: recorrido guiado de la app real (reemplaza el enfoque de checklist)

Mockup interactivo (spotlight sobre sidebar/topbar reales, filtrado por rol):
[Product Tour Walkthrough](https://claude.ai/artifact/TZAhZkYANiz86avDaAkwZo)

**Estado: propuesto, pendiente de aprobación visual de Alejandro antes de implementar** (regla de
`docs/Skills/Skills UXUI.md` — "proponer el diseño primero como mockup/artifact, no implementar directo").

> Nota: la primera vuelta de esta tarea proponía extender `OnboardingChecklist.tsx` (ítems +
> permisos por ítem + reopen). Alejandro pidió en cambio un walkthrough interactivo de la
> plataforma real — este documento reemplaza esa propuesta. El hallazgo de bug (sample data
> creando registros invisibles) sigue vigente igual, ver pieza 4.

### Contexto (sin cambios respecto al relevamiento original)

- Signup ya tiene un survey de 3 pasos (`CompleteSignupPage.tsx`).
- `OnboardingChecklist.tsx` (montado en `OverviewPage.tsx:273`) es hoy el único empujón post-signup:
  3 ítems de HR, gateado todo-o-nada por `permissions.has('manage_users')`, dismiss permanente.
- Payments (Stripe por tenant) sigue solo en `staging` — no forma parte del tour todavía.
- No hay ninguna librería de product tours instalada (`driver.js`/`shepherd`/`react-joyride` — cero
  matches en `frontend/package.json` y en el código). Se construye a medida, sin sumar dependencia
  nueva (regla no negociable del proyecto).

### Decisión de producto (confirmada con Alejandro)

1. **Formato**: tour interactivo con spotlight sobre la UI real (no un carrusel/modal de capturas).
2. **Disparo**: automático en el primer login del usuario, **reemplaza** `OnboardingChecklist.tsx`
   por completo (no coexisten). Se puede volver a lanzar manualmente desde el menú de usuario
   ("Take the tour again").

### Cómo se dispara "primer login" (por usuario, no por tenant)

Nuevo campo `User.productTourCompletedAt DateTime?` (nullable, mismo patrón que
`User.lastAnnouncementSeenAt` ya usa para el cursor de anuncios leídos). Null = nunca completado ni
saltado. Se dispara para **cualquier usuario nuevo**, no solo el owner que firma el signup — un
teammate invitado (`AcceptInvitePage.tsx`) también entra por primera vez y necesita el mismo
recorrido. `sanitizeUser` ya deja pasar cualquier campo nuevo de `User` sin tocar nada (solo saca
`passwordHash`), así que `GET /api/auth/me` expone el campo automáticamente.

### Pasos del tour (ver tabla completa y copy exacto en el mockup)

Anclado a elementos reales vía atributos `data-tour="..."` (no wrappers nuevos, solo el atributo
sobre el JSX que ya existe):

| # | Target | Se salta si |
|---|---|---|
| 0 | — (modal de bienvenida, sin spotlight) | nunca |
| 1 | `Sidebar.tsx` → `data-tour="nav-overview"` | nunca |
| 2 | `Sidebar.tsx` → `data-tour="nav-hr"` (link People) | nunca |
| 3 | `Sidebar.tsx` → `data-tour="nav-sales"` (link Companies) | `!showSalesGroup` (mismo booleano que ya calcula `Sidebar.tsx:45`) |
| 4 | `TopBar.tsx` → `data-tour="topbar-bell"` (`NotificationBell`) | nunca |
| 5 | `TopBar.tsx` → `data-tour="topbar-usermenu"` (abre el dropdown, señala Guide/Help/replay) | nunca |
| 6 | `Sidebar.tsx` → `data-tour="nav-settings"` | nunca |
| 7 | — (modal de cierre, 2 CTA: "Add my first employee" / "Load sample data instead") | nunca |

Payroll (`manage_payroll`, owner-only por default) queda deliberadamente sin paso propio — es
demasiado específico para un tour general, sigue documentado en `/guide`.

### Piezas de implementación (confirmar/pushear cada una por separado)

**Pieza 1 — Backend + anclas, sin cambio de comportamiento visible**
- `prisma/schema.prisma`: `User.productTourCompletedAt DateTime?` (push aditivo, puede ir directo a
  `main` por la excepción de schema del handoff).
- `src/modules/onboarding/onboardingService.ts`: `completeTour(userId)`.
- `src/routes/onboarding.ts`: `POST /api/onboarding/tour-complete` (cualquier usuario autenticado,
  sin permiso especial — es acción sobre el propio usuario).
- `frontend/src/api/onboarding.ts`: `completeTour(token)`.
- Agregar `data-tour="..."` a los 6 elementos de la tabla de arriba en `Sidebar.tsx`/`TopBar.tsx` —
  solo el atributo, cero cambio visual.

**Pieza 2 — Motor del tour**
- `frontend/src/components/tour/TourProvider.tsx`, montado dentro de `AppLayout.tsx` (sobrevive
  navegación entre rutas vía `useLocation`/`useNavigate`).
- Arma los pasos filtrados por los mismos permisos que ya usa `Sidebar.tsx` (`view_company` +
  `view_contact` para el paso 3).
- `TourOverlay.tsx`: spotlight vía SVG mask (recorte + anillo de acento sobre el elemento real),
  recalculado en scroll/resize; tooltip posicionado cerca del recorte, con Back/Next/Skip.
- Auto-arranque si `!user.productTourCompletedAt`, con un delay corto para no tapar el loading
  skeleton de `OverviewPage`.
- `completeTour()` se llama al terminar o al hacer skip — ambos cuentan como "visto", no solo
  terminarlo completo.

**Pieza 3 — Cutover**
- Se retira `<OnboardingChecklist />` de `OverviewPage.tsx:273`.
- El modal de cierre (paso 7) asume la función real que tenía el checklist (empujar a cargar datos),
  con los 2 CTA.
- "Take the tour again" se agrega al dropdown de `TopBar.tsx` (mismo lugar que "User Guide"/"Help &
  FAQ") — un replay manual **no** toca `productTourCompletedAt` (no debe re-disparar el auto-inicio).

**Pieza 4 — Bug de sample data (mismo hallazgo del análisis anterior, sigue en pie)**
`seedSampleData` (`src/modules/onboarding/onboardingService.ts:51-59`) llama a `createClient`
(`src/modules/clients/clientService.ts`, modelo `Client` **legado**) — el frontend no tiene ninguna
página que renderee `Client` (CRM migró a Company/Contact hace rondas atrás, ver
`docs/tareas/backlog.md` ítem "Corte final del módulo Client legado"). El CTA "Load sample data
instead" del paso de cierre necesita datos que se vean de verdad: reemplazar el loop de
`createClient` por `createCompany` (`src/modules/crm/companyService.ts`, que ya exige un Contact
primario en la misma transacción vía `CreateCompanyInput.contact`). Requiere threadear
`changedByUserId` desde la sesión hasta `seedSampleData(tenantId, userId)` (`createClient` no lo
pedía, `createCompany` sí). `getOnboardingStatus`'s `hasClients` (via `prisma.client.count`) pasa a
`hasCompanies` (via `prisma.company.count`) — no rompe nada existente, el frontend no lee
`hasClients` en ningún lado hoy.

### Decisiones abiertas (Alejandro)

1. **Mobile**: el sidebar colapsa a un menú hamburguesa en pantallas chicas — apuntar el spotlight a
   un link fuera de pantalla es más trabajo. ¿Tour desktop-only en esta primera pasada (se salta en
   mobile), o construirlo responsive desde el arranque?
2. **Pantalla de cierre**: ¿los 2 CTA alcanzan, o sumamos un tercero explícito tipo "I'll explore on
   my own" en vez de que sea solo cerrar el modal?
3. **Sin red de contención después del tour**: confirmás que no quede ningún indicador de progreso
   persistente (a diferencia del checklist viejo, que se podía reabrir) — ¿de acuerdo, o preferís que
   elegir "explorar solo" en el cierre deje un banner mínimo dismisseable?

### QA / checklist de cierre (cuando se implemente)

- `docs/general/Tareas-QA.md`: nueva entrada.
- `docs/general/function-index.md`: `TourProvider`/`TourOverlay` nuevos, firma nueva de
  `seedSampleData`/`getOnboardingStatus`.
- Verificación en navegador con un tenant de prueba real y al menos dos usuarios (owner + un invitado
  o custom role sin Sales) para confirmar que el paso 3 se salta correctamente y el contador de pasos
  se recalcula. Confirmar que "Load sample data instead" deja Companies/Contacts visibles de verdad.
- Anuncio in-app (cambio visible para el usuario final).
