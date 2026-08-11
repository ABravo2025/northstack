# Tareas — Admin Center: Roles, Tenants, Tickets/Ideas

Handoff para desarrollador. Specs completas en `spec-admin-center-platform-roles.md`,
`spec-admin-center-tenants.md`, `spec-admin-center-tickets-ideas.md`. Mockups de
referencia: `admin-center-tenants-mockup.html`, `admin-center-tickets-mockup.html`.

Orden de ejecución — cada bloque se confirma y pushea por separado, no todo junto.

## Bloque 1 — Platform Roles (repo principal)

1. Schema: agregar `enum PlatformRole` + `User.platformRole PlatformRole?`. Push
   aditivo a producción **y** staging. → **Confirmar antes de correr.**
2. Backfill dirigido: usuarios con `isPlatformAdmin: true` → `platformRole:
   'platform_admin'`. Verificar con query directa. → **Confirmar antes de correr.**
3. Dejar `isPlatformAdmin` intacto (deprecado, no se toca en este bloque).

## Bloque 2 — Platform Roles (admin-center)

4. `api/lib/northstackAuth.ts`: cambiar el chequeo de `user.isPlatformAdmin` a
   `user.platformRole` (rechaza si es `null`).
5. Sesión de admin-center: guardar `platformRole` en el payload de la cookie firmada.
6. Nuevo `api/lib/platformAuth.ts` con `requirePlatformRole(...roles)` (bypass
   implícito para `platform_admin`).
7. Frontend: nav footer muestra rol actual; ítems de nav sin acceso quedan ocultos
   (no solo deshabilitados) según el rol de la sesión.

## Bloque 3 — Tenants (repo principal)

8. Nuevas rutas bajo `/api/platform/tenants*` (ver spec para contratos exactos),
   `requirePlatformRole('platform_support')` en las tres.
9. Verificar que `User.createdAt` existe en el schema real antes de escribir la query
   de Users — si no existe, agregarlo (aditivo) antes de seguir.

## Bloque 4 — Tenants (admin-center)

10. Sección "Tenants" reemplaza el placeholder: tabs por estado, tabla sorteable,
    modal de detalle con tab Users. Seguir `admin-center-tenants-mockup.html` como
    referencia visual.

## Bloque 5 — Catálogo de estados de plataforma (repo principal)

11. Schema: `enum PlatformEntityType`, `model PlatformStatusDefinition`. Push aditivo.
12. Script de seed/backfill con los estados iniciales de Ticket e Idea (ver spec,
    sección 1) — correr contra producción y staging.
13. Sumar `ticket` e `idea` al enum `EntityType` existente (el que ya usan
    Notes/Activity Log/Custom Fields). Push aditivo.

## Bloque 6 — Modelos Ticket / Idea (repo principal)

14. Schema: `model Ticket`, `model Idea` (ver spec para campos exactos). Push aditivo.
15. Rutas `/api/platform/tickets*` y `/api/platform/statuses*` (ver contratos en la
    spec). Whitelist explícita de campos en los `PATCH` — no `req.body` crudo.
16. Side-effect de email al crear una Note sobre un Ticket con `authorType:
    'platform_staff'` — reusar `mailer.ts`, patrón best-effort (`.catch()` que solo
    loggea).

## Bloque 7 — Formulario in-app (repo principal, frontend del producto)

17. Extender el formulario de feedback existente (`FEEDBACK_EMAIL`) con selector
    "Reportar un problema" / "Proponer una idea" → crea `Ticket` o `Idea` según
    elección, mantiene el mail a `FEEDBACK_EMAIL` como aviso adicional.

## Bloque 8 — Tickets (admin-center)

18. Sección "Tickets": lista + detalle + Settings de catálogo, siguiendo
    `admin-center-tickets-mockup.html`. Ideas queda como placeholder "Próximamente"
    (backend ya existe, UI en una unidad futura).

## Verificación (repetir en cada bloque relevante, no solo al final)

- `npm run build` / `npm test` (backend), `cd frontend && npm run build` — en verde
  antes de pushear.
- Cambios de schema: pasar primero por `staging` (`git push origin main:staging`),
  verificar, recién ahí a `main` — regla vigente desde el 2026-07-27.
- Verificación real en navegador (Playwright si está disponible) contra los flujos de
  cada bloque, no asumir por el build en verde.
- Confirmar con `curl` contra producción que el bundle nuevo salió después de cada push
  relevante.
