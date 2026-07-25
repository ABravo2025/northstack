# 04 — Análisis de estado y avances

## Qué tan production-ready está cada módulo

| Módulo | Estado | Notas |
|---|---|---|
| Auth / multi-tenancy core | Sólido | IDOR original corregido, aislamiento verificado en el código de cada endpoint (ver `08-directivas-agente-ia.md`). Sin test de regresión automatizado para esto — ver más abajo. |
| HR / Employees | Sólido, en uso activo | Feature-completo para el alcance actual. El bloque de UI "ClickUp" (List view, ghost row, push panel, scrollbar) está implementado y verificado solo acá, no en Clients/Company Users. |
| Time Off | Sólido | 7/7 piezas completas, sin deuda conocida más allá de que el balance se calcula on-the-fly (no hay tabla de balance, así que crece el costo de cálculo con el volumen de solicitudes — no medido a la escala actual). |
| Clients | Funcional, alcance limitado a propósito | Mismo patrón que Employees pero sin los campos/jerarquía de HR. El rediseño grande (Company/Contact/Opportunity) está confirmado como dirección pero **sin spec técnico ni empezar**. |
| Public Forms | Sólido | CAPTCHA + honeypot + rate limiting en capas. |
| Custom Fields / Status catalog | Sólido | Mecanismo genérico bien establecido y reusado consistentemente. |
| Onboarding / Help / Changelog | Funcional, contenido estático | Sin CMS — cualquier cambio de copy requiere un deploy. Decisión de scope explícita, no un descuido. |
| Reportes / métricas | Script CLI únicamente | No hay UI ni endpoint — cross-tenant, requiere el admin panel de plataforma (sin empezar) para exponerse de forma segura. |
| Payments / Suscripciones / Payroll | No empezado | Ver `01-objetivo.md` y `05-tareas-pendientes.md`. |
| Panel de administración de plataforma | No empezado | Necesita un sistema de roles completamente separado del actual (confirmado por el usuario). |

## Riesgos técnicos y deuda conocida

### `src/app.ts` es un monolito de rutas — **1901 líneas** al momento de escribir esto

Ya señalado en la auditoría de seguridad del 2026-07-16 (creció de ~1340 líneas en ese momento) y en `docs/tareas-desarrollo.md` como ítem de backlog explícito: dividir en `express.Router()` por dominio (`routes/auth.ts`, `routes/hr.ts`, `routes/clients.ts`, etc.), moviendo los helpers compartidos (`validateSession`, el wrapper de captura de errores async) a un módulo propio antes de partir las rutas. **Sin empezar.** El riesgo concreto que motivó esto: es el tipo de archivo donde es fácil que se cuele un bug de aislamiento entre tenants sin que nadie lo note al lado del resto del código.

### Cobertura de tests real (no asumida)

- **Backend**: 3 archivos en `tests/`, todos con Vitest, **todos mockeando Prisma directamente** (no hay ningún test que levante la app real contra una base de datos real):
  - `tests/auth.test.ts` — registro + login + rechazo de credenciales inválidas + bloqueo si no se acepta ToS.
  - `tests/hr.test.ts` — `createEmployee` respeta o infiere el `statusId` default.
  - `tests/permission.test.ts` — permisos por rol (owner/admin/member).
- **No existe ningún test de aislamiento entre tenants** — ni unitario ni de integración. Es el mismo gap que la auditoría de seguridad señaló explícitamente como algo que "habría detectado el hallazgo 2.1" (el IDOR original). `docs/Tareas-QA.md` (QA-01) documenta un procedimiento **manual** para cubrir este hueco, pero no es un test automatizado corriendo en CI.
- **Frontend: cero tests.** No hay `vitest`/`jest`/`@testing-library` instalado, ningún archivo `*.test.tsx`, ningún config de test en `frontend/package.json`. Toda la verificación de UI de este proyecto hasta ahora fue manual o vía scripts de Playwright ad-hoc que no quedaron en el repo como suite reproducible.
- **CI no corre tests antes de deployar**: `.github/workflows/deploy.yml` va directo a `vercel deploy` en push a `main`/`staging`, sin un paso previo de `npm test`/`npm run build`. El build sí lo corre Vercel como parte del deploy (`vercel.json` → `buildCommand`), pero eso solo detecta errores de compilación, no de tests.

### Hallazgos de la auditoría de seguridad (`docs/informe-tecnico/auditoria-seguridad-2026-07-16.md`) — estado real reconciliado

La auditoría original listó **1 alto, 6 medios, 5 bajos** (12 hallazgos totales). El checklist de seguimiento en `docs/tareas-desarrollo.md` solo trackeó formalmente **7 de esos 12** hasta resolución o descarte:

**Resueltos** (verificados en `docs/tareas-desarrollo.md`, sección Seguridad):
- [ALTO] Mass assignment/IDOR en `PATCH` employees/clients.
- [MEDIO] Sesiones sin expiración/revocación.
- [MEDIO] Sin rate limiting en `/api/auth/*`.
- [MEDIO] Sin headers de seguridad (Helmet).
- [MEDIO] `authenticateToken` no verificaba `user.status === 'active'`.
- (De paso, no era un hallazgo formal de la lista de 7) `statusId` no validado contra tenant al actualizar — resuelto junto con el fix del IDOR.

**Abiertos, trackeados**:
- [MEDIO] CORS abierto a cualquier origen (`app.use(cors())` sin configurar).
- [BAJO] `role` arbitrario aceptado en `POST /api/auth/register`; `zod` instalado pero sin usar en ningún lado.

**⚠️ Discrepancia a resolver — nunca trackeados a cierre en ningún lado**: la auditoría original menciona además (2.5) token de sesión en `localStorage` (exposición a XSS), (2.7) enumeración de usuarios vía el mensaje "Email already registered", y (2.11) sin invalidación de sesión al cambiar rol/status de un usuario. Ninguno de los tres aparece en el checklist de seguimiento de `docs/tareas-desarrollo.md` como resuelto ni como pendiente explícito — **hay que confirmar contra el código actual si siguen abiertos o si se resolvieron sin quedar documentados**. `[PENDIENTE DE CONFIRMAR: estado real de 2.5, 2.7 y 2.11]`.

### CSV Injection (encontrado y corregido fuera de la auditoría original)

No estaba en la auditoría del 07-16 porque el feature de CSV no existía todavía. Encontrado el 2026-07-23 al escribir la tarea de QA del import/export, corregido el mismo día. Ver `03-resumen-de-avances.md`.

### Otras inconsistencias encontradas entre documentación y código durante este handoff

- `docs/ux-ui-audit.md` marca **UX-07** (Settings con 2 hubs desconectados) y **UX-11** (sin paginación de tablas) como abiertos, pero ambos están resueltos según `docs/contexto-proyecto.md` y el código actual (`Pagination.tsx` existe y se usa; Settings es un hub único desde el "Rebrand de Settings"). El archivo de auditoría no se actualizó después de esos fixes.
- Dos ítems del checklist de `docs/tareas-desarrollo.md` estaban marcados `[ ]` (sin empezar) pese a estar implementados en el código real: el checkbox de aceptación de ToS/Privacy al registrarse, y el filtro de columnas visibles en las tablas (implementado como "Columnas ocultables"). Corregido durante esta misma sesión de trabajo (ver `git log`, commits recientes) — mencionado acá como ejemplo de que **el checklist de tareas puede quedar desactualizado respecto al código** y conviene cruzar ambos antes de asumir que algo falta.

## Confirmación operativa reciente importante

El `.env` local usado para desarrollo apunta a la base de datos de **producción** real (confirmado por el usuario el 2026-07-24), no a una copia de desarrollo — así fue durante todo el proyecto hasta la creación de la Neon branch `staging` esta semana. Cualquier `prisma db push` corrido localmente sin cuidado impacta producción directamente. Ver el protocolo de migraciones en [`08-directivas-agente-ia.md`](08-directivas-agente-ia.md).
