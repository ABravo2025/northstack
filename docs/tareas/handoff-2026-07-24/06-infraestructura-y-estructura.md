# 06 — Infraestructura y estructura del repo

## Estructura de carpetas

```
northstack/
├── src/                        Backend (Express + TypeScript)
│   ├── app.ts                  App Express configurada (sin .listen) — ver 08-directivas para el patrón de middlewares
│   ├── server.ts                Wrapper delgado solo para dev local (import + .listen)
│   ├── lib/                     csv.ts, mailer.ts, prisma.ts, rateLimit.ts, turnstile.ts
│   └── modules/                 Un servicio por dominio: auth/, clients/, csv/, hr/ (8 archivos), onboarding/, tenant/
├── api/
│   └── index.ts                 Entrypoint serverless de Vercel — exporta la app de Express directamente
├── prisma/
│   └── schema.prisma             Fuente de verdad del modelo de datos (no hay carpeta migrations/ — el proyecto usa `db push`, no `prisma migrate`)
├── frontend/                    App Vite + React, proyecto npm propio (package.json separado)
│   └── src/
│       ├── pages/                Una página por ruta
│       ├── components/           33 componentes reusables — ver 08-directivas antes de crear uno nuevo
│       ├── layouts/               AppLayout.tsx, WorkspaceSettingsLayout.tsx
│       ├── hooks/                 useColumnOrder/Visibility/ResizableColumns (persistencia en localStorage)
│       ├── lib/                   changelog.ts, countries.ts, currencies.ts, viewFields.ts (datos/lógica sin JSX)
│       ├── api.ts                 Único cliente HTTP del frontend — todas las llamadas al backend pasan por acá
│       └── App.tsx                Rutas (react-router-dom)
├── landing/                      Sitio estático de marketing — vive en su propio branch de git `landing`, no en `main`
├── scripts/                      Scripts one-off (backfills de producción, metrics-report.ts) — correr con `npx tsx scripts/<archivo>.ts`
├── tests/                        3 archivos Vitest, backend únicamente (ver 04-analisis-estado-y-avances.md)
├── docs/                         Toda la documentación del proyecto — ver docs/tareas-desarrollo.md como backlog maestro
└── .github/workflows/deploy.yml  Único workflow de CI/CD
```

**Por qué `app.ts`/`server.ts`/`api/index.ts` están separados**: Vercel corre la función serverless a partir de `api/index.ts`, que importa la app de Express ya configurada desde `src/app.ts` sin invocar `.listen()` (serverless no mantiene un proceso corriendo). `src/server.ts` es el único archivo que llama `.listen()`, y solo se usa para desarrollo local (`npm run dev`). **No fusionar estos tres archivos.**

## Infraestructura real

| Pieza | Proveedor / detalle |
|---|---|
| Hosting (app) | Vercel, proyecto `northstack` (`VERCEL_PROJECT_ID: prj_toTfkIDiZvYieHem9QvyVscZt40F`, `VERCEL_ORG_ID: team_7cBA70ABi7r0BNsljeJfvQ3y`) — un solo proyecto sirviendo frontend estático + función serverless |
| Hosting (landing) | Vercel, proyecto separado `northstack-landing`, branch `landing`, `working-directory: landing` en su propio job de CI |
| Base de datos | Neon (Postgres serverless). Branch principal = producción (usada también localmente vía `.env`, ver nota crítica abajo). Branch `staging` creada 2026-07-24, es una foto tomada al momento de crearla — no se sincroniza sola con cambios de schema posteriores |
| Dominio | `joinnorthstack.com`, comprado en Cloudflare Registrar. `app.joinnorthstack.com` → Vercel (SSL automático, Let's Encrypt). `staging.joinnorthstack.com` → deploy de staging (alias seteado por CI) |
| Email transaccional | Zoho Mail (plan gratis), casilla `no.reply@joinnorthstack.com`, DNS (MX/SPF/DKIM) en Cloudflare. Enviado vía `nodemailer` (`src/lib/mailer.ts`) |
| CAPTCHA | Cloudflare Turnstile — producción usa un sitekey real atado al dominio; staging usa las claves de test públicas de Cloudflare (siempre pasan), hardcodeadas en el workflow (no son secrets) |
| CI/CD | GitHub Actions, un solo workflow (`deploy.yml`), sin integración nativa Git de Vercel (se intentó, no se pudo autorizar sin acceso a navegador en su momento — no reintentar sin confirmar que ahora sí se puede) |

### ⚠️ Nota crítica: el `.env` local apunta a producción

Confirmado por el usuario el 2026-07-24: el `DATABASE_URL` en el `.env` local de desarrollo **es la base de datos de producción real**, no una copia de desarrollo. Cualquier `prisma db push` corrido localmente sin cuidado impacta producción directamente. Esto fue así durante todo el proyecto hasta la creación de la branch `staging` de Neon esta misma semana.

**Regla operativa nueva, todavía no obligatoria** (confirmada por el usuario, entra en vigor recién el lunes 2026-07-27): todo cambio de código (backend/frontend/schema) pasa primero por `staging` (`git push origin main:staging`, verificar, recién ahí `git push origin main`), sin excepciones una vez que arranque. Los cambios que solo tocan `docs/*.md` van directo a `main` (no hay nada que deployar/testear ahí). Recordatorio operativo explícito: cualquier `prisma db push` contra producción tiene que correrse *también* contra `STAGING_DATABASE_URL` para que las dos bases no se desincronicen — ya pasó una vez que quedaron desalineadas.

## Pipeline de deploy (`.github/workflows/deploy.yml`)

Trigger: push a `main` o `staging`. Dos jobs, cada uno gateado por `if: github.ref == 'refs/heads/<branch>'`:

- **`deploy-app`** (rama `main`): `npx vercel deploy --prod --token="$VERCEL_TOKEN" --yes`.
- **`deploy-staging`** (rama `staging`): registra el dominio `staging.joinnorthstack.com` si hace falta, deploya como Preview (sin `--prod`) inyectando `DATABASE_URL` desde el secret `STAGING_DATABASE_URL` y las claves de test de Turnstile, y alía el deploy resultante a `staging.joinnorthstack.com`.

**Secrets de GitHub Actions requeridos**: `VERCEL_TOKEN`, `STAGING_DATABASE_URL`. `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` están hardcodeados en el workflow (no son secretos, son identificadores públicos del proyecto).

**El workflow no corre `npm test` ni `npm run build` como paso propio** — Vercel corre el build como parte del deploy (`vercel.json` → `buildCommand`), pero eso solo detecta errores de compilación, no tests rotos.

## Variables de entorno

No existe un `.env.example` en el repo — hay que armar el `.env` local a mano con esta tabla:

| Variable | Dónde se usa | Para qué |
|---|---|---|
| `DATABASE_URL` | `prisma/schema.prisma` | Connection string de Postgres/Neon. **Hoy apunta a producción en el `.env` local — ver nota crítica arriba.** |
| `PORT` | `src/server.ts` | Puerto del servidor local (default 3000) |
| `APP_BASE_URL` | `src/modules/tenant/tenantService.ts` | Base para construir links (ej. invitaciones); default `http://localhost:5173` |
| `FEEDBACK_EMAIL` | `src/app.ts` | Destino del formulario de feedback in-app; el feature se salta si no está seteada |
| `ZOHO_SMTP_USER` / `ZOHO_SMTP_PASSWORD` | `src/lib/mailer.ts` | Credenciales SMTP de Zoho. Si falta cualquiera de las dos, el envío de mail no-opea (best-effort) en vez de romper la app |
| `TURNSTILE_SECRET_KEY` | `src/lib/turnstile.ts` | Secret server-side de Cloudflare Turnstile |
| `VITE_API_BASE_URL` | `frontend/src/api.ts` (build-time) | Base URL del backend; vacío en producción (mismo origen), `http://localhost:3000` en dev |
| `VITE_TURNSTILE_SITE_KEY` | `frontend/src/pages/PublicFormPage.tsx` (build-time) | Sitekey público de Turnstile |
| `NODE_ENV` | `src/lib/prisma.ts` | Gatea logging/comportamiento de Prisma en dev |

Secrets solo de CI (no van en `.env` local): `VERCEL_TOKEN`, `STAGING_DATABASE_URL` (ver arriba).

## Cómo correr el proyecto en local (comandos reales)

```bash
# 1. Instalar dependencias (raíz = backend, frontend tiene su propio package.json)
npm install
cd frontend && npm install && cd ..

# 2. Generar el cliente de Prisma a partir del schema
npx prisma generate

# 3. Levantar el backend (puerto 3000 por default)
npm run dev

# 4. En otra terminal, levantar el frontend (puerto 5173 por default, Vite)
cd frontend && npm run dev
```

Requiere un `.env` en la raíz con al menos `DATABASE_URL` apuntando a una base Postgres/Neon accesible — **confirmar con el equipo si corresponde usar la de producción, la de `staging`, o levantar una propia**, dado lo señalado arriba.

Para aplicar un cambio de schema (`prisma/schema.prisma`) a la base de datos: `npm run db:push` (alias de `prisma db push`) — no hay carpeta `migrations/`, el proyecto no usa `prisma migrate`. Ver el protocolo completo de migraciones seguras en [`08-directivas-agente-ia.md`](08-directivas-agente-ia.md) antes de correr esto sobre una columna que ya tiene datos.

Comandos de verificación antes de dar algo por terminado (backend):
```bash
npm run build   # tsc -p tsconfig.json
npm test        # vitest run
```

Y frontend:
```bash
cd frontend && npm run build   # tsc -b && vite build
```
