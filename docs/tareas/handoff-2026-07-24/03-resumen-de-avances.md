# 03 — Resumen de avances

Cronología de decisiones relevantes, no un changelog commit-por-commit (para eso está `git log`, 83 commits desde `02a992b` hasta `dffffc0` al momento de escribir esto). El detalle día a día vive en `docs/tareas/semana-*.md`.

## Semana del 2026-06-29 — Scaffold inicial

Arranque del proyecto: auth básica, módulo HR inicial, Prisma + tests. Un solo fix real de esta semana: `Employee.email` pasó de único global a único *por tenant* (bug de diseño multi-tenant encontrado temprano).

## Semana del 2026-07-06 — Las decisiones de arquitectura más consecuentes

- **Registro unificado**: se detectó código muerto (`createTenantWithOwner`) y al borrarlo se rompió el frontend, que todavía dependía de él — lección real: revisar consumidores antes de borrar, no solo definiciones. Se resolvió con `POST /api/tenants/register` como paso único atómico, no resucitando el flujo viejo de 2 pasos.
- **Hashing de contraseñas**: `scrypt` nativo de Node en vez de sumar bcrypt/argon2 — decisión deliberada de no agregar dependencia para algo que el stdlib ya resuelve.
- **Custom fields, pivot de arquitectura**: de FKs por módulo (`employeeId`/`clientId`) a modelo genérico `tenantId` + `entityType` + `entityId`, para que un módulo futuro (Payments) nunca requiera un cambio de schema. Trade-off aceptado: sin integridad referencial real en `entityId`, validado en código en su lugar.
- **Routing**: se evitó agregar `react-router-dom` mientras alcanzaba con un query param para un link de invitación — se sumó recién cuando el crecimiento de sidebar/Settings lo justificó.
- **Deploy**: split de `app.ts` (Express config, sin `.listen`) / `server.ts` (dev local) / `api/index.ts` (entrypoint serverless) — posible porque las sesiones ya vivían en la DB, no en memoria, así que el modelo serverless no costaba nada extra. Dominio y email: Cloudflare Registrar + Zoho Mail, elegido explícitamente contra alternativas (SMTP propio no viable en serverless, relay de Gmail muy limitado, Hostinger pagando hosting sin usar).

## Semana del 2026-07-13 — Status catalog, PTO completo, Public Forms

- **Catálogo de Status configurable** reemplazó los enums fijos `EmployeeStatus`/`ClientStatus`, reusando el patrón `entityType` de custom fields. `StatusHistoryEntry` guarda **nombres como snapshot de texto**, no FKs vivas — para que renombrar un status no reescriba el historial.
- **Sistema de Time Off (PTO)** completo, 7 piezas construidas una por una a pedido explícito del usuario ("arranca con eso nomás"). Decisiones tomadas sobre la marcha: el owner auto-crea su propio `Employee` (elegida de 3 opciones presentadas, con backfill real en producción); las políticas soportan *tanto* acumulación fija anual como mensual, no un modo global único; `approverId` es un snapshot al crear la solicitud, no se recalcula si cambia el manager.
- **Rename PTO → "Time Off"** extendido a la base de producción real vía un script SQL de `RENAME` revisado antes de correr (sin drops/copies) — elegido en vez de una migración de Prisma porque el proyecto nunca usó `prisma migrate`, solo `db push`.
- **Public Forms**: 4 decisiones de producto resueltas como pregunta explícita antes de programar (alcance Employees+Clients solamente, sin cola de aprobación, múltiples formularios por tenant, CAPTCHA obligatorio desde el día uno). Turnstile elegido con razones explícitas (ya en Cloudflare, gratis/ilimitado, sin atar todo a una cuenta de Google).
- **Landing page** movida a su propio branch de git (no carpeta dentro de `main`) una vez que necesitó deploys independientes.
- Patrón repetido de migración segura sobre datos reales: push aditivo → script de backfill → verificar → recién ahí destructivo. Ver el protocolo completo en [`08-directivas-agente-ia.md`](08-directivas-agente-ia.md).

## Semana del 2026-07-21 — Brief de seguridad + Tier 1/Tier 2

Brief estructurado en 4 bloques, cada uno con decisiones resueltas *antes* de programar:

- Rate limiting propio (`src/lib/rateLimit.ts`) en vez de sumar `express-rate-limit`; Helmet con excepción explícita de CORS (`crossOriginResourcePolicy: cross-origin`) porque la API se consume cross-origin por diseño.
- Expiración de sesión deslizante (no fija), mismo patrón de migración segura reusado para `Session.expiresAt`.
- Emails del canal de feedback **no** son best-effort (a diferencia de invitaciones/notificaciones) — ahí el envío en sí es el punto del request.
- Honeypot verificado *antes* que Turnstile, para no gastar la llamada a Cloudflare en bots obvios.
- **Tier 2**: se evaluó explícitamente unificar Status+Department+JobTitle en un solo catálogo genérico, y se decidió dejar Status afuera — tiene demasiada funcionalidad viva (Kanban, historial, guardrail de default) para justificar el riesgo de migrarlo sobre datos reales sin un beneficio real. Compensación: se bloqueó la *escritura* además de la lectura para roles no-owner, no solo lo que pedía el backlog — para que un admin no pueda pisar a ciegas un valor que no puede ver.
- CSV import/export y el reporte de métricas cross-tenant se mantuvieron deliberadamente chicos en alcance (parser propio sin librería nueva; métricas como script CLI, no UI, dejando el admin panel "de verdad" para más adelante).

## Semana del 2026-07-23/24 — Cierre de Tier 1/Tier 2, seguridad de CSV, staging, y bloque de UI "ClickUp"

- Se cerró Tier 1 (onboarding, Help, changelog, reportes básicos) y Tier 2 (campos de Employee, catálogo de Department, CSV, y finalmente `contractType`/`compensationType`/`currency`).
- **CSV Injection encontrado y corregido**: `escapeCsvField` no neutralizaba valores que empiezan con `= + - @` — un campo cargado por un tenant podía ejecutarse como fórmula al abrir el CSV exportado en Excel/Sheets. Corregido con un prefijo `'` antes de escapar.
- **Ambiente de staging armado**: Neon branch `staging` separada de producción, `staging.joinnorthstack.com` como segundo target de deploy (`deploy-staging` job en el mismo workflow), Turnstile con claves de test públicas de Cloudflare (las reales están atadas al dominio de producción). **Regla operativa nueva, todavía no obligatoria**: a partir del lunes 2026-07-27, todo cambio de código pasa primero por staging antes de `main` — ver [`06-infraestructura-y-estructura.md`](06-infraestructura-y-estructura.md).
- **Descubrimiento importante sobre el flujo de trabajo real**: el `.env` local usado para desarrollo apunta a la base de datos de **producción**, no a una copia de desarrollo — así fue durante todo el proyecto hasta que se creó la branch de `staging` esta semana. Cualquier `prisma db push` corrido localmente ya impactó producción directamente.
- Bloque de UI de referencia ClickUp (spec cerrado y mockeado en un Artifact, confirmado por el usuario): ancho completo de tabla sin container fijo, tipografía compacta con jerarquía en la columna Name, hover de fila visible por celda, vista "List" agrupada, fila/card fantasma "Add" en las 3 vistas, panel push de Overview al click del nombre, scrollbar horizontal propia. Todo implementado y verificado en **Employees**; replicar en Clients/Company Users queda como fast-follow explícito, no hecho todavía.
