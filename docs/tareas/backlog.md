# Backlog activo

Único archivo de backlog de `docs/tareas/`: solo ítems **pendientes/abiertos/en curso**, clasificados
por módulo. Lo ya completado no vive acá — queda en los archivos `historial-*.md` de esta misma
carpeta y en las entradas fechadas de `docs/tareas-desarrollo.md`/`docs/tareas/semana-*.md`. Compilado
2026-08-18 a partir de `semana-2026-07-29.md`, `handoff-2026-07-24/05-tareas-pendientes.md` y
`tareas-desarrollo.md` (contrastados contra el código real donde fue posible), sin fecha de cierre en
los ítems.

## HR / Payroll

- [ ] **Edición inline en la tabla de Employees**: cada celda editable directo en la fila (sin abrir
  el panel/SlideOver), salvo `email`/`firstName`/`lastName` que quedarían de solo lectura ahí.
  Aplicaría a `department`, `statusId`, `managerId`, custom fields embebidos. Sin definir: patrón de
  edición (click-to-edit por celda vs. fila entera en modo edición), autosave vs. confirmar, y si
  Companies/Contacts reciben el mismo tratamiento por consistencia.
- [ ] **Compensación: sin campo de moneda por monto individual**: hoy la moneda es un valor único por
  tenant (`Tenant.currency`, aplica a `hourlyRateCents`/`monthlyRateCents`), decisión explícita.
  Insuficiente si un tenant necesita mezclar monedas distintas entre personas — solo relevante si
  aparece un tenant multinacional real que lo pida.

## CRM

- [ ] **Vincular un Contact a una Opportunity al crearla**: no se puede asociar un Contact en el
  mismo paso de alta de una Opportunity (incluida el alta rápida desde la card fantasma "+" del
  Kanban) — hay que guardar primero y reabrir en edición. Un fix parcial (vincular desde
  `ContactDetailModal` hacia una Opportunity nueva o existente) ya se construyó, pero el gap de UX
  original — crear la Opportunity misma con el Contact ya asociado — sigue señalado como sin resolver
  en el resumen más reciente de `tareas-desarrollo.md`, pausado a pedido del usuario hasta hablar con
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

## UX/UI

- [ ] **FAB de acción primaria en mobile (Tarea 9c del rediseño ClickUp)**: no se construyó — necesita
  un mecanismo de "acción primaria por página" que `AppLayout.tsx` no tiene hoy (cada página maneja su
  propio `handleOpenAdd` suelto). Confirmado que sigue sin construir en la revisión del 2026-08-06.
- [ ] **Overview panel de detalle para Company Users**: hoy toda la edición es inline en la fila (rol
  vía `<select>`, activar/desactivar vía ícono), sin panel de detalle propio como tienen
  Employees/Companies/Contacts/Opportunities. Es una decisión de producto, no una réplica mecánica de
  patrón — ¿qué mostraría que la tabla no muestre ya? A confirmar con el usuario antes de construirlo.

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

## Infra/Otros

- [ ] **Tenant Signup + Subscription Plans — piezas de negocio sin construir**: integración real de
  Paddle, UI de "agregar método de pago", pantalla de autogestión de suscripción (ver plan, cambiar de
  plan, actualizar método de pago, cancelar), y prorrateo — explícitamente fuera de la ronda que
  construyó el flujo de signup con verificación de email + trial de 15 días + `PlansModal`. Todo el
  módulo (backend `EmailVerification`/campos de `Tenant`/rutas `signup/*`, frontend
  `RegisterPage`/`CompleteSignupPage`/`PlansModal`) sigue **sin pushear a `staging` ni a `main`** —
  a pedido explícito del usuario, que lo va a probar primero en su propio entorno local.
- [ ] **Sin enforcement de acceso para tenants con status `suspended`**: hallazgo propio de la
  implementación de Signup+Plans, no estaba en el spec original — el status del tenant cambia a
  `suspended` pero ningún middleware bloquea todavía las requests de ese tenant.
- [ ] **`CRON_SECRET` sin cargar en Vercel**: protege `GET /api/internal/plan-transitions/run` (el
  cron nuevo de Vercel Cron Job para transiciones de plan/trial). Falta cargarlo en Vercel antes de
  cualquier deploy real del módulo de Signup+Plans, mismo caso que fue `PAYMENT_DATA_ENCRYPTION_KEY`
  para Payroll en su momento.
- [ ] **Sistema de roles custom / permisología**: hoy los roles son fijos (owner/admin/member,
  hardcodeados en `permissionService.ts`). Deliberadamente al final de la cola — va a seguir mudando
  con cada módulo nuevo, conviene resolverlo una sola vez cuando el set de features esté más estable.
- [ ] **Panel de Integraciones**: hub único en Settings para todas las conexiones externas del tenant.
  Agrupa: Stripe (Connect) + QuickBooks + evaluar Mercado Pago para tenants argentinos (módulo
  Payments — cada tenant facturándole a sus propios Clients, distinto de la suscripción del propio
  Northstack); webhooks salientes (URL + eventos elegibles); Slack como app instalable vía OAuth real
  (no un webhook simple). Incluye también la contraparte entrante: API pública protegida por token
  para integraciones externas. Sin spec técnico todavía, explícitamente no bloqueante para el beta.
- [ ] **OAuth de Google**: dos usos a evaluar juntos por compartir el mismo flujo — "Sign in with
  Google" en registro/login, y sincronizar solicitudes de Time Off aprobadas al Google Calendar
  personal de cada empleado. Sin empezar.
- [ ] **Verificación de email por OTP + 2FA por email en login**: el flujo de signup de tenants nuevos
  ya incorpora verificación de email (por link/token, `EmailVerification`, aún sin pushear — ver
  arriba), pero un código OTP de un solo uso para el registro directo (`POST /api/auth/register`) y
  2FA por email en cada login siguen sin diseñar ni construir.
- [ ] **i18n**: alcance sin definir (¿selector de usuario o fijo por tenant/región?, qué idiomas además
  del actual). Relacionado con un hallazgo de UX ya anotado: la landing está en español y la app en
  inglés.
- [ ] **Sistema de logs de auditoría por usuario**: cuándo loguea y qué movimientos/modificaciones
  realiza dentro del sistema. Sin empezar, sin detalle.
- [ ] **Notificaciones in-app** (ícono de campana con contador, dropdown de recientes): distinto del
  canal de email ya existente. Se solapa conceptualmente con Slack/webhooks salientes — conviene
  diseñar un solo modelo de "evento" compartido entre los canales (in-app, email, Slack, webhook)
  antes de construir cualquiera.
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
