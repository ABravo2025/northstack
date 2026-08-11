# Admin Center — Contexto para el developer

Este documento junta todo lo decidido hasta ahora sobre Admin Center: qué ya existe,
qué está confirmado como hecho, y el roadmap punto por punto de lo que falta. Specs
detalladas y mockups están linkeados en cada bloque — este archivo es el mapa, no
reemplaza a las specs.

---

## 1. Qué ya existe (confirmado)

- **`northstack-devtasks`**: repo/proyecto Vercel separado del producto principal.
  Dashboard de Tasks funcional — lee `docs/tareas-*.md` vía GitHub API (sin
  persistencia propia), `api/tasks.ts` + `api/lib/parser.ts` + `api/lib/github.ts`.
- **Reorg a "Admin Center"**: el dominio **`admin.joinnorthstack.com` ya está activo**
  (confirmado por Alejandro). El repo/proyecto de Vercel se mantiene con el nombre
  interno `northstack-devtasks` — solo cambió branding/dominio, no el nombre técnico
  (decisión explícita para no generar churn en remotes/deploy history).
- **Nav shell**: estructura con Tasks / Tenants / Metrics ya armada según el plan
  original de reorg (Tenants y Metrics como placeholder "Próximamente" en ese momento).

## 2. ⚠️ A verificar antes de arrancar — no confirmado en esta sesión

El plan original de reorg incluía reemplazar el auth de un usuario/password fijo por
cuentas reales de Northstack gateadas por un flag `isPlatformAdmin`. **No tengo
confirmación de que ese bloque se haya ejecutado contra producción** (schema push,
backfill del flag, cambios en `northstackAuth.ts`/`session.ts`/`auth.ts` del lado de
admin-center). Antes de tocar cualquier cosa de roles (bloque siguiente), confirmar
contra el código real:
- ¿Existe `User.isPlatformAdmin` en el `.prisma` de producción?
- ¿`api/lib/auth.ts` de admin-center ya delega en `POST /api/auth/login` del repo
  principal, o todavía usa el `DEVTASKS_USER`/`DEVTASKS_PASS_HASH` original?

Si ya está hecho, el Bloque 1 de abajo arranca directo desde el paso de migrar el
boolean a enum. Si no está hecho, hay que completarlo primero (no está re-especificado
acá porque ya estaba spec-ado en la sesión de reorg original).

---

## 3. Roadmap — punto por punto

Cada bloque se confirma y pushea por separado. Specs completas de cada uno, linkeadas.

### Bloque 1 — Platform Roles
📄 `spec-admin-center-platform-roles.md`

- [ ] Schema repo principal: `enum PlatformRole` + `User.platformRole PlatformRole?`
  (aditivo). Push a producción y staging.
- [ ] Backfill dirigido: usuarios `isPlatformAdmin: true` → `platformRole:
  'platform_admin'`. Confirmar el email exacto de Alejandro antes de correr.
- [ ] `northstackAuth.ts`: chequear `platformRole` en vez de `isPlatformAdmin`.
- [ ] Sesión de admin-center guarda `platformRole` en la cookie firmada.
- [ ] Nuevo `api/lib/platformAuth.ts` con `requirePlatformRole(...roles)` (bypass
  implícito para `platform_admin`).
- [ ] Frontend: nav footer muestra rol actual; ítems sin acceso quedan **ocultos**
  según el rol de la sesión.
- [ ] `isPlatformAdmin` queda deprecado, no se borra todavía (push destructivo en
  sesión futura separada, una vez confirmado que nada lo lee).

### Bloque 2 — Tenants (solo lectura)
📄 `spec-admin-center-tenants.md` · 🖼️ `admin-center-tenants-mockup.html`

- [ ] Verificar que `User.createdAt` existe en el schema real (no confirmado, no
  aparece explícito en `database-schema.md`).
- [ ] Rutas repo principal: `GET /api/platform/tenants`, `GET
  /api/platform/tenants/:id`, `GET /api/platform/tenants/:id/users` —
  `requirePlatformRole('platform_support')`.
- [ ] Frontend admin-center: sección Tenants real (tabs Activos/Suspendidos/
  Cancelados, tabla sorteable, modal de detalle con tab Users). Sin "último login"
  (depende del sistema de logs de plataforma, todavía no construido).

### Bloque 3 — Catálogo de estados de plataforma
📄 `spec-admin-center-tickets-ideas.md` (sección 1)

- [ ] Schema: `enum PlatformEntityType`, `model PlatformStatusDefinition`. Push
  aditivo.
- [ ] Seed: estados iniciales de Ticket (`open`/`in_progress`/`resolved`/`closed`) e
  Idea (`new`/`under_review`/`planned`/`declined`/`shipped`).
- [ ] Sumar `ticket` e `idea` al enum `EntityType` existente (reuso de
  Notes/Activity Log). Push aditivo.

### Bloque 4 — Modelos Ticket / Idea
📄 `spec-admin-center-tickets-ideas.md` (secciones 2-3)

- [ ] Schema: `model Ticket`, `model Idea`. Push aditivo.
- [ ] Rutas `/api/platform/tickets*` y `/api/platform/statuses*` (contratos en la
  spec). Whitelist explícita de campos en `PATCH` — nunca `req.body` crudo.
- [ ] Hilo de respuesta = `Note` con `entityType: 'ticket'`/`'idea'` — no crear tabla
  nueva de comentarios.
- [ ] Side-effect de email best-effort (`mailer.ts`, patrón `.catch()` que solo
  loggea) al crear una Note de staff sobre un Ticket, notificando a
  `Ticket.userId → email`. No aplica a Idea.

### Bloque 5 — Formulario in-app
📄 `spec-admin-center-tickets-ideas.md` (sección 4)

- [ ] Extender el form de feedback existente (`FEEDBACK_EMAIL`) con selector
  "Reportar un problema" / "Proponer una idea" → crea `Ticket` o `Idea` según
  elección. Mantiene el mail a `FEEDBACK_EMAIL` como aviso interno además de
  persistir el registro.

### Bloque 6 — Tickets (admin-center, UI completa)
📄 `spec-admin-center-tickets-ideas.md` (secciones 6-7) · 🖼️ `admin-center-tickets-mockup.html`

- [ ] Sección Tickets: lista (sort, búsqueda, filtro por estado/asignado, botón
  "+ Nuevo ticket").
- [ ] Detalle (modal): estado y asignado editables inline, descripción, hilo,
  textarea de respuesta.
- [ ] Settings del catálogo: reorder, rename, toggle Default/Terminal, activar/
  desactivar con confirmación si está en uso, agregar estado nuevo. Solo
  `platform_admin`.
- [ ] Sección Ideas queda como placeholder "Próximamente" (backend ya existe desde
  el Bloque 4, falta solo la UI — próxima unidad, sin spec de UI todavía).

---

## 4. Fuera de alcance por ahora (explícitamente pospuesto, no olvidado)

- **UI de Ideas** en admin-center — backend listo desde el Bloque 4, spec de UI
  pendiente.
- **Metrics** (adopción/volumen por módulo) — sin spec, depende de definir qué
  significa "cómo viene funcionando" un módulo (ver conversación de scope original).
- **Impersonation / asistencia activa a usuarios** — descartado explícitamente para
  esta ronda de Tenants, solo lectura por ahora.
- **"Último login" en Users** — depende de un sistema de logs de actividad para toda
  la plataforma, todavía no diseñado ni empezado.
- **Vista tenant-facing de tickets** ("mis tickets" dentro del producto) —
  descartada: la respuesta de soporte llega por email, no por una vista in-app.

---

## 5. Checklist de verificación (repetir en cada bloque)

- `npm run build` / `npm test` backend, `cd frontend && npm run build` — verde antes
  de pushear.
- Cambios de schema: `staging` primero (`git push origin main:staging`), verificar,
  recién ahí `main` (regla vigente desde 2026-07-27).
- Verificación real en navegador (Playwright si está disponible) — no asumir por el
  build en verde.
- `curl` contra producción confirmando que el bundle nuevo salió, en cada push
  relevante.
