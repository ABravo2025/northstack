# 07 — Stack tecnológico

Versiones exactas tomadas de `package.json` (raíz) y `frontend/package.json` reales — no de memoria.

## Backend (raíz `package.json` — `northstack@0.1.0`)

| Paquete | Versión | Uso |
|---|---|---|
| `express` | `^4.21.2` | Framework HTTP |
| `@prisma/client` / `prisma` | `^5.10.0` | ORM + cliente generado, contra Neon (Postgres serverless) |
| `helmet` | `^8.3.0` | Headers de seguridad HTTP |
| `cors` | `^2.8.2` | CORS (hoy abierto a cualquier origen — ver `04-analisis-estado-y-avances.md`) |
| `nodemailer` | `^9.0.3` | Envío de mail vía SMTP (Zoho) |
| `zod` | `^3.21.0` | Instalado, **sin usar en ningún endpoint todavía** (hallazgo de la auditoría de seguridad, sigue abierto) |
| `dotenv` | `^16.4.1` | Carga de `.env` en desarrollo |
| `tsx` | `^4.19.0` (dev) | Ejecuta TypeScript directo sin paso de compilación previo — usado en `npm run dev` y para scripts one-off (`npx tsx scripts/...`) |
| `typescript` | `^5.7.3` (dev) | — |
| `vitest` | `^2.1.8` (dev) | Test runner |

Scripts reales (`package.json`): `dev` (`tsx watch src/server.ts`), `build` (`tsc -p tsconfig.json`), `start` (`node dist/server.js`), `test` (`vitest run`), `postinstall`/`prisma:generate` (`prisma generate`), `db:push` (`prisma db push`), `db:studio` (`prisma studio`).

`tsconfig.json` (raíz): target `ES2022`, módulos `NodeNext`, `strict: true`, `rootDir: src` → `outDir: dist`.

## Frontend (`frontend/package.json` — `northstack-frontend@0.1.0`)

| Paquete | Versión | Uso |
|---|---|---|
| `react` / `react-dom` | `^18.3.1` | — |
| `react-router-dom` | `^7.18.1` | Ruteo — agregado deliberadamente tarde, no desde el día 1 (ver `03-resumen-de-avances.md`) |
| `vite` | `^5.4.2` (dev) | Build tool / dev server |
| `@vitejs/plugin-react` | `^4.3.1` (dev) | — |
| `tailwindcss` / `@tailwindcss/vite` | `^4.3.2` (dev) | Sistema de estilos, integrado vía plugin de Vite (no PostCSS config aparte) |
| `typescript` | `^5.7.3` (dev) | — |

Scripts reales: `dev` (`vite`), `build` (`tsc -b && vite build`), `preview` (`vite preview`). **Sin script `test`** — no hay framework de test de frontend instalado (ver `04-analisis-estado-y-avances.md`).

`frontend/tsconfig.json`: target `ES2020`, `lib` incluye `ES2022.Intl` (agregado explícitamente para los tipos de `Intl.supportedValuesOf`/`Intl.DisplayNames` usados en `frontend/src/lib/currencies.ts` — el runtime ya lo soporta en todos los navegadores modernos, era solo un gap de tipos de TS), `jsx: react-jsx`, `strict: true` + `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`.

## Base de datos

**Neon** (Postgres serverless) — puede "dormirse" entre requests; el cliente de Prisma tiene retry con backoff configurado vía `$extends` para las conexiones transitorias que eso genera (`src/lib/prisma.ts`). El proyecto usa `prisma db push` exclusivamente, **no** `prisma migrate` — no hay carpeta `prisma/migrations/`.

## Deploy

**Vercel** — un proyecto sirviendo frontend estático (build de Vite) + una función serverless (Express vía `api/index.ts`). Sin el framework-detection automático de Vercel (`vercel.json` → `"framework": null`, para que no intente autodetectar "Express" y rompa el build híbrido). Ver `06-infraestructura-y-estructura.md` para el pipeline completo.

## Por qué se eligió cada pieza clave (documentado en `docs/tareas/`)

- **`scrypt` nativo de Node en vez de bcrypt/argon2**: evitar una dependencia nueva para algo que el stdlib ya resuelve bien.
- **CSV parser propio (`src/lib/csv.ts`) en vez de una librería** (`csv-parse`, `papaparse`, etc.): el parser RFC-4180 necesario es chico (comas/comillas/saltos de línea dentro de campos citados), no se justificó la dependencia.
- **Rate limiting propio (`src/lib/rateLimit.ts`, in-memory) en vez de `express-rate-limit`**: mismo criterio — la necesidad real (ventana deslizante por IP+scope) es simple de implementar sola.
- **`react-router-dom` recién cuando hizo falta**: mientras alcanzaba con un query param para un solo link de invitación, no se agregó — se sumó cuando el crecimiento de sidebar/Settings lo justificó.
- **Tailwind CSS v4 vía plugin de Vite**: integración nativa sin config de PostCSS aparte.
- **Cloudflare Turnstile sobre reCAPTCHA**: el dominio ya estaba en Cloudflare (Registrar + DNS), gratis/ilimitado, sin atar el flujo a una cuenta de Google.
- **Paddle sobre Stripe directo** (para la futura suscripción propia de Northstack, todavía sin implementar): Stripe no ofrece cuentas directas en Argentina; Paddle actúa como merchant of record sin necesitar una entidad en EEUU, a cambio de mayor comisión.

**Regla general del proyecto, no negociable**: nunca agregar una dependencia nueva sin justificarla explícitamente antes — ver [`08-directivas-agente-ia.md`](08-directivas-agente-ia.md).
