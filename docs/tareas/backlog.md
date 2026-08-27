# Backlog activo

Único archivo de backlog de `docs/tareas/`: solo ítems **pendientes/abiertos/en curso**, clasificados
por módulo. Lo ya completado no vive acá — queda en los archivos `historial-*.md` de esta misma
carpeta y en las entradas fechadas de `docs/general/tareas-desarrollo.md`/`docs/tareas/semana-*.md`. Compilado
2026-08-18 a partir de `semana-2026-07-29.md`, `handoff-2026-07-24/05-tareas-pendientes.md` y
`docs/general/tareas-desarrollo.md` (contrastados contra el código real donde fue posible), sin fecha de cierre en
los ítems.

## HR / Payroll

- [ ] **Edición inline en la tabla de Employees**: cada celda editable directo en la fila (sin abrir
  el panel/SlideOver), salvo `email`/`firstName`/`lastName` que quedarían de solo lectura ahí.
  Aplicaría a `department`, `statusId`, `managerId`, custom fields embebidos. Sin definir: patrón de
  edición (click-to-edit por celda vs. fila entera en modo edición), autosave vs. confirmar, y si
  Companies/Contacts reciben el mismo tratamiento por consistencia.
- [ ] **Falta proceso de termination de empleados**: pensar un flujo en Payroll para dar de baja
  empleados y marcarlos como inactivos.

## CRM

- [ ] **Vincular un Contact a una Opportunity al crearla**: no se puede asociar un Contact en el
  mismo paso de alta de una Opportunity (incluida el alta rápida desde la card fantasma "+" del
  Kanban) — hay que guardar primero y reabrir en edición. Un fix parcial (vincular desde
  `ContactDetailModal` hacia una Opportunity nueva o existente) ya se construyó, pero el gap de UX
  original — crear la Opportunity misma con el Contact ya asociado — sigue señalado como sin resolver
  en el resumen más reciente de `docs/general/tareas-desarrollo.md`, pausado a pedido del usuario hasta hablar con
  el PM sobre el enfoque.
- [ ] **Calificación de leads sin Company confirmada**: si un Form público no puede matchear Company
  (ej. email personal) hoy solo crea un Contact (`leadStatus: New`, `companyId: null`). Falta el
  bloqueo explícito de conversión a Opportunity mientras el Contact no tenga `companyId` — pospuesto a
  propósito hasta que haya volumen real de leads entrando.
- [ ] **Automatizaciones del pipeline de ventas**: email al owner por cambio de stage, auto-asignación
  de owner en alta por Form, recordatorio de Opportunity estancada. Pospuesto hasta tener evidencia de
  qué reglas repiten los tenants — cuando se retome, reglas puntuales sobre eventos existentes, no un
  motor configurable.
- [ ] **Corte final del módulo `Client` legado**: el push destructivo (borrar tabla/columnas `Client`)
  quedó deliberadamente fuera de la migración a Company/Contact — sigue siendo una unidad futura
  separada. Bloqueado en migrar primero los Custom Fields y Public Forms con `entityType: 'client'` a
  `'company'`/`'contact'`. El backend (`clientService.ts`, tabla `Client`) sigue en uso real por
  `onboardingService.ts`/`publicFormService.ts`, no se puede cortar sin resolver eso antes.
- [ ] **Nota automática en Contact huérfano al borrar su Company**: al borrar una Company, sus
  Contacts quedan sin vincular (comportamiento ya construido) pero el usuario pidió además que quede
  registrado en Activity/Notes que perdieron esa company — no se armó ningún mecanismo provisorio,
  queda para resolverse como parte del modelo de Notes (mismo patrón `entityType`/`entityId`).
- [ ] **Contador de tasks en la tarjeta de Kanban de Opportunity (`.kc-tasks`)**: quedó sin cablear —
  el listado que alimenta el Kanban no trae tasks embebidas y no existe un endpoint de conteo
  agregado; confirmado con el usuario dejarlo para más adelante en vez de hacer N+1 requests.
- [ ] **Alerta "supera el promedio de tiempo en stage" en Opportunity**: el stage-track visual +
  "N días en el stage" ya está construido, pero la alerta cuando una Opportunity supera el promedio
  histórico de su stage no — requeriría calcular tiempo promedio por stage entre todas las
  Opportunities, no construido todavía.
- [ ] **CSV import/export sin extender a Companies/Contacts/Opportunities**: `csvService.ts` tiene
  `importClientsFromCsv`/`exportClientsToCsv`, pero quedaron huérfanas de UI desde que se borró la
  página de Clients del frontend — hoy la única entidad con botón real de import/export es Employees.
  El alcance ampliado que pedía el backlog original ("casi todo" importable) no está resuelto.
- [ ] **Página de agradecimiento de Public Forms poco personalizable**: hoy solo el texto del párrafo
  (`Form.thankYouMessage`) es configurable — heading, layout y estilo del estado `submitted` quedan
  fijos. Candidatos sin alcance definido: heading personalizable, redirect a URL propia del tenant,
  imagen/logo del tenant en esa pantalla (branding del tenant en páginas públicas está descartado a
  propósito, a reconciliar si se retoma esto).
- [ ] **Endpoints dedicados de listado relacional** (`GET /api/companies/:id/contacts`,
  `/opportunities`, `GET /api/contacts/:id/opportunities`): no se construyeron — el frontend filtra
  client-side sobre las listas completas del tenant que ya trae para otras pantallas. A la escala
  actual no se justifica el trabajo extra; reconsiderar si algún tenant crece mucho. Baja prioridad.
- [ ] **Ideas de reporting/UX sin desarrollar, no bloquean nada**: cruzar probabilidad por stage con
  tiempo-en-stage para marcar deals "en riesgo" (depende de que exista reporting); jerarquía de
  Company (matriz/sucursal, solo relevante si aparece un tenant B2B enterprise); resaltar visualmente
  si una Opportunity tiene un solo Contact asociado (multi-threading).
- [ ] **Sistema de tags — falta el filtrado en las listas**: la primera entrega (crear/ver/sacar
  tags libres en el perfil de Contact/Company/Employee, con autocomplete compartido entre los 3)
  ya está construida y en `staging` (ver QA-45 en `Tareas-QA.md`). Falta la segunda mitad del pedido
  original: mostrar los tags como columna/chip en las vistas de lista de Contacts/Companies/
  Employees y poder filtrar por ellos — no arrancado todavía.

## UX/UI

- [ ] **FAB de acción primaria en mobile (Tarea 9c del rediseño ClickUp)**: no se construyó — necesita
  un mecanismo de "acción primaria por página" que `AppLayout.tsx` no tiene hoy (cada página maneja su
  propio `handleOpenAdd` suelto). Confirmado que sigue sin construir en la revisión del 2026-08-06.
- [ ] **Overview panel de detalle para Company Users**: hoy toda la edición es inline en la fila (rol
  vía `<select>`, activar/desactivar vía ícono), sin panel de detalle propio como tienen
  Employees/Companies/Contacts/Opportunities. Es una decisión de producto, no una réplica mecánica de
  patrón — ¿qué mostraría que la tabla no muestre ya? A confirmar con el usuario antes de construirlo.
- [ ] **Campos desplegables aparecen en blanco**: reportado en algunos selects, no en todos — a
  confirmar si es un bug real de la plataforma o algo puntual del entorno del usuario.

## Notes/Tasks

- [ ] **Activity Log — módulo entero sin construir**: al unificar los paneles de detalle se retiró el
  tab "Activity" (placeholder sin funcionalidad real) de Employee; ningún módulo tiene hoy Activity ni
  como tab ni de otra forma. Layout ya confirmado para cuando se construya (panel lateral, no tab),
  pero sin backend ni spec de contenido todavía.
- [ ] **Recordatorios de Task vencida** (email/notificación): explícitamente pospuesto a backlog, no
  formó parte de la tanda que construyó el módulo de Tasks.
- [ ] **Revisar permisos de Task cuando se construya el sistema de roles custom**: hoy cualquier rol
  autenticado del tenant puede crear/editar/borrar/completar cualquier Task — decisión deliberada por
  simplicidad mientras no exista permisología granular; anotado para reabrir esa decisión cuando el
  sistema de roles custom (Infra/Otros) exista.
- [ ] **`MyTasksWidget` puede mostrar el `dueDate` de una task un día antes del real**: encontrado al
  verificar la creación de tasks desde el calendario (2026-08-27) — una task con `dueDate` guardado
  como `2026-08-01T00:00:00.000Z` (correcto en la base) apareció fechada "31" en el widget "My
  tasks" del Overview. Parece un desajuste de zona horaria al formatear un `dueDate` date-only para
  mostrarlo (mismo tipo de bug que `TaskForm.tsx` ya documenta y evita en su propio código, ver
  `hasTimeComponent`) — no investigado a fondo, `MyTasksWidget.tsx` no se tocó en esa tanda.

## Payments

- [ ] **Conexión con Stripe no funciona en modo test (Payments v1)**: probado con una restricted key
  recién generada — la conexión falla. Nota aparte: esa key quedó pegada en el chat del usuario;
  conviene rotarla una vez resuelto el bug, aunque sea de test.

## Infra/Otros

- [ ] **Prorrateo al cambiar de plan**: `changePlan` (self-serve, Billing Integration) llama al
  proveedor y agenda el cambio para el próximo ciclo de facturación — no calcula ni cobra/acredita la
  diferencia del ciclo en curso. Sin definir si hace falta prorratear de verdad o si "aplica desde el
  próximo ciclo" es la política final.
- [ ] **Webhook de Paddle todavía apunta al túnel de cloudflared (muerto), no a la URL estable de
  staging**: a diferencia de Mercado Pago (ya migrado a
  `https://staging.joinnorthstack.com/api/webhooks/paddle`, con el protection-bypass de Vercel), el
  webhook de Paddle en su dashboard sandbox sigue registrado contra una URL de túnel efímera de una
  sesión de testing anterior. Hay que repetir en Paddle el mismo cambio que ya se hizo en Mercado
  Pago: URL estable + `?x-vercel-protection-bypass=<secret>` (Vercel Deployment Protection bloquea
  cualquier POST externo a `staging.joinnorthstack.com` sin ese query param, confirmado en vivo).
- [ ] **Precios reales de Argentina (Mercado Pago) sin definir**: los `PlanPrice` de mercado `ar`
  siguen en placeholder (no en cero, pero no son precios reales todavía) — bloquea solo el pricing
  real, no la integración en sí (ya probada de punta a punta contra sandbox).
- [ ] **Credenciales reales (producción) de Paddle/Mercado Pago sin cargar**: hoy Vercel Preview
  (staging) tiene las credenciales *sandbox* de ambos proveedores (`PADDLE_API_KEY`,
  `PADDLE_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `VITE_PADDLE_CLIENT_TOKEN`) — nada
  cargado todavía en el scope de Production. Bloquea salir a cobrar de verdad, no bloquea seguir
  probando en staging.
- [ ] **Billing Integration (Paddle + Mercado Pago) construido y probado en `staging`, pendiente de
  code review antes de promover a `main`**: mismo gate que ya se usó para Tenant Signup + Subscription
  Plans (`docs/tareas/historial-2026-08.md` documenta el detalle) — no pushear a `main` sin esa
  revisión primero.
- [ ] **Sistema de roles custom / permisología**: hoy los roles son fijos (owner/admin/member,
  hardcodeados en `permissionService.ts`). Deliberadamente al final de la cola — va a seguir mudando
  con cada módulo nuevo, conviene resolverlo una sola vez cuando el set de features esté más estable.
- [ ] **Panel de Integraciones**: hub único en Settings para todas las conexiones externas del tenant.
  Agrupa: Stripe (Connect) + QuickBooks + evaluar Mercado Pago para tenants argentinos (módulo
  Payments — cada tenant facturándole a sus propios Clients, distinto de la suscripción del propio
  Northstack); webhooks salientes (URL + eventos elegibles); Slack como app instalable vía OAuth real
  (no un webhook simple). Incluye también la contraparte entrante: API pública protegida por token
  para integraciones externas. Sin spec técnico todavía, explícitamente no bloqueante para el beta.
- [x] **OAuth de Google — sync de Task/Time Off al Google Calendar personal** (2026-08-22, solo
  local todavía, ver `docs/general/database-schema.md` grupo 9 y QA-19 en `Tareas-QA.md`):
  construido — cada usuario conecta su cuenta desde Settings → Profile, y sus Tasks con fecha
  límite + Time Off aprobados se sincronizan (best-effort, unidireccional) para que Google dé las
  notificaciones. Bloqueado para probar de punta a punta y pushear a `staging`: falta que
  Alejandro cargue `GOOGLE_CALENDAR_CLIENT_SECRET`/`GOOGLE_CALENDAR_REDIRECT_URI` reales (Google
  Cloud Console) — el `GOOGLE_CALENDAR_CLIENT_ID` que ya estaba en `.env` no tenía código atrás
  hasta ahora.
- [ ] **Sync de Google Calendar no trae los eventos ya existentes**: al vincular Google Calendar, no
  se sincronizan los elementos que el usuario ya tenía registrados en su calendario — el sync
  construido arriba es unidireccional (Northstack → Google); falta evaluar si además hace falta
  traer eventos existentes desde Google hacia la plataforma.
- [ ] **"Sign in with Google" en registro/login**: comparte el mismo Google Cloud OAuth client que
  el punto de arriba, pero es un flujo de autenticación distinto (reemplaza/complementa
  email+password), no construido todavía. Evaluar junto con el ítem de abajo si conviene un solo
  hub de credenciales OAuth reusadas entre ambos usos.
- [ ] **Verificación de email por OTP + 2FA por email en login**: el flujo de signup de tenants nuevos
  ya incorpora verificación de email (por link/token, `EmailVerification`, en producción desde
  2026-08-18), pero un código OTP de un solo uso para el registro directo (`POST /api/auth/register`) y
  2FA por email en cada login siguen sin diseñar ni construir.
- [ ] **i18n**: alcance sin definir (¿selector de usuario o fijo por tenant/región?, qué idiomas además
  del actual). Relacionado con un hallazgo de UX ya anotado: la landing está en español y la app en
  inglés.
- [ ] **Sistema de logs de auditoría por usuario**: cuándo loguea y qué movimientos/modificaciones
  realiza dentro del sistema. Sin empezar, sin detalle.
- [ ] **Notificaciones in-app** (ícono de campana con contador, dropdown de recientes): distinto del
  canal de email ya existente. Se solapa conceptualmente con Slack/webhooks salientes — conviene
  diseñar un solo modelo de "evento" compartido entre los canales (in-app, email, Slack, webhook)
  antes de construir cualquiera. **2026-08-22**: para el caso puntual de recordatorios de Tasks/Time
  Off, se optó por sync a Google Calendar en vez de esto (ver el ítem de OAuth de Google arriba) —
  sigue sin existir nada in-app para el resto de los eventos de la plataforma.
- [ ] **Historial de valores previos de custom fields** (con retención por tiempo): evaluado y
  pospuesto a propósito.
- [ ] **Hallazgos de seguridad sin resolver de la auditoría 2026-07-16** (`docs/informe-tecnico/
  auditoria-seguridad-2026-07-16.md`): §2.5 token de sesión guardado en `localStorage` (vulnerable a
  robo vía un XSS futuro — no hay XSS conocido hoy, pero sin defensa en profundidad; requiere migrar a
  cookie `httpOnly`/`Secure`/`SameSite`, cambio de arquitectura no trivial); §2.7 enumeración de
  usuarios en registro (el error "Email already registered" revela si un email ya tiene cuenta;
  mitigación real requiere el flujo de verificación de email arriba). El resto de los 11 hallazgos de
  esa auditoría ya están resueltos.
- [ ] **`role` arbitrario aceptado en `POST /api/auth/register`**; `zod` instalado sin usarse en ningún
  endpoint (hallazgos §2.8/§2.10 de la misma auditoría). Bajo riesgo real hoy (registro por invitación
  cerrada), pero superficie de ataque innecesaria si el registro se abre a futuro.
- [ ] **Cero tests de aislamiento entre tenants (automatizados)**: confirmado — no existe ningún test
  de este tipo en `tests/`. Es exactamente el gap que dejó pasar el IDOR original (hallazgo §2.1, ya
  resuelto en código) sin detectar antes de producción.
- [ ] **Cero tests de frontend**: confirmado — no hay ningún framework de testing de frontend instalado
  ni archivos `*.test.tsx`. Cualquier regresión de UI depende de verificación manual/Playwright ad-hoc
  no reproducible.
- [ ] **Duplicación de lógica entre páginas de listado**: Companies/Contacts/Employees/Clients
  (900-1300 líneas cada una) repiten ~400-500 líneas casi idénticas (CRUD de saved views, columnas de
  custom fields, sort, kanban). Identificado en la revisión DevOps del 2026-07-30 y dejado pospuesto a
  propósito, confirmado con el usuario — sigue siendo el ítem de mayor impacto pendiente en
  reusabilidad del frontend.
