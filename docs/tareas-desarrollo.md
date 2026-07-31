# Tareas de desarrollo

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-30 — módulo CRM (Company/Contact/Opportunity/Pipeline) completo,
  Tasks/Notes con la unificación y rediseño de los 4 paneles de detalle, y una revisión DevOps de
  arquitectura/calidad de código, **todo ya en producción** (primer deploy del CRM completo,
  `origin/main` estaba congelado desde el 2026-07-28). Detalle día a día de esta última tanda en
  [`docs/tareas/semana-2026-07-29.md`](tareas/semana-2026-07-29.md); resumen en la sección "Estado
  actual" más abajo. Este archivo se podó (2026-07-30) — los ítems ya completados se movieron a los
  archivos semanales de `docs/tareas/`, acá queda solo lo pendiente + un resumen de alto nivel.

## Prioridades (tiers)

Definido en sesión de planning del 2026-07-21. Cada ítem tiene su descripción completa en el
checklist de abajo — esto es solo el orden de ataque, no duplica el detalle. Reordenar acá cuando
cambie la prioridad, en vez de dejarlo solo dicho en una conversación.

**Completado — brief de la semana del 2026-07-21** (`docs/tareas/brief-semana-2026-07-21.md`, Bloques 1-4,
ver detalle de implementación/verificación en `docs/tareas/semana-2026-07-21.md`): seguridad
(fix IDOR/mass assignment, rate limiting, Helmet, expiración de sesiones, chequeo de `user.status`),
checkbox de ToS/Privacy al registrarse, notificaciones por email (Public Forms + Time Off), canal de
feedback/reporte de bugs, mensaje de agradecimiento personalizable y honeypot en Public Forms.
Siguiente en la cola: Tier 1.

**Tier 1 — Cerrar beta-readiness (ítems de desarrollo completos, 2026-07-23 — falta la revisión manual del usuario)** (con esto, el producto está listo para invitar al primer tester)
- *No es tarea de desarrollo, depende del usuario:* revisar el frontend end-to-end en navegador

**Tier 2 — Data models confirmados / catálogos chicos (completo, 5 de 5)** (autocontenidos, no dependen de nada de Tier 3/4)

**Tier 3 — Rediseño de Clients (completo, en producción)** — Company/Contact/Opportunity/Pipeline,
ver "Estado actual" más abajo y `docs/tareas/semana-2026-07-29.md` para el detalle.

**Tier 3.5 — Módulo Payroll, V1 (nuevo, confirmado por el usuario 2026-07-23)**
- Sección propia en el sidebar (mismo nivel que Time Off), no un tab dentro de la ficha de Employee.
- **Distinto del "Módulo Payments" ya anotado en Tier 4** — Payments es facturarle a los *Clients*
  del tenant (cuentas por cobrar); Payroll es pagarle a los *Employees* del tenant (cuentas por
  pagar). Flujos de dinero opuestos, no confundir al spec-earlos aunque ambos puedan terminar
  integrando con QuickBooks.
- **Alcance V1, explícito**: solo carga manual de datos de pago (quién, período, monto, fecha) +
  métricas derivadas (costo de nómina por mes/departamento, etc.) — **sin** procesamiento de pagos
  real todavía.
- **A futuro (no en V1)**: integración con una plataforma de payroll externa para gestionar pagos
  directo desde Northstack — el usuario mencionó un nombre transcripto como "Get thera", sin
  confirmar a qué producto se refiere exactamente; confirmar el nombre real antes de evaluarlo.
- **Sin confirmar todavía**: visibilidad — dado que esto es compensación real (mismo tipo de dato
  sensible que `hourlyRateCents`/`monthlyRateCents`), la recomendación por default es restringirlo
  a `owner` únicamente, mismo criterio ya aplicado ahí, hasta que exista permisología custom.
- Sin spec técnico todavía — depende de que Tier 2 (tipo de contratación/compensación + moneda)
  esté resuelto primero, ya que Payroll va a necesitar esos mismos datos como base.

**Tier 4 — Resto de iniciativas grandes**
- Suscripciones propias del SaaS (Paddle, planes/precios, pantalla de administración autónoma)
- Panel de Integraciones — Stripe + QuickBooks + evaluar Mercado Pago (módulo Payments de
  facturación a Clients), webhooks salientes, Slack (app instalable vía OAuth), API pública
  entrante con token
- Admin panel de plataforma (usuario main, cross-tenant)

**Tier 5 — Cola larga**
- i18n
- Verificación de email por OTP + 2FA por email en login
- Sistema de logs de auditoría por usuario
- Historial de valores previos de custom fields
- Edición inline en la tabla de Employees
- Ícono de notificaciones in-app (comparte el modelo de "evento" con el Panel de Integraciones —
  spec-earlos juntos cuando llegue el turno)
- **Permisología / sistema de roles custom** — deliberadamente al final: va a seguir mudando con
  cada módulo nuevo que se sume (Clients, Payments, Integraciones), así que conviene resolverlo una
  sola vez cuando el set de features esté más estable, no reconstruirlo varias veces en el camino.

## Checklist general

Organizado por tipo. Los ítems que tocan más de una capa quedan bajo la capa donde está el trabajo principal, con una nota de qué más tocaron.

### Producto / Planificación / Setup

- [ ] Preparar el proyecto para una beta interna
- [ ] **Admin panel para usuario main (el dueño de la plataforma, no un owner de tenant)**: sin empezar. Distinto de "Company Settings" (que es por tenant, para sus propios admins) — esto es una vista a nivel plataforma para visualizar todos los tenants/clientes activos de Northstack. Confirmado por el usuario: necesita un sistema de roles **totalmente separado** del actual (owner/admin/member son todos por-tenant, ninguno da visibilidad cross-tenant) — un rol de plataforma general, no una extensión de los roles existentes. Las métricas por cliente (cantidad de usuarios, actividad, etc.) quedan para más adelante, no son necesarias en una primera versión — anotado para tenerlo en cuenta cuando se diseñe
- [ ] **Hacer aceptar Términos de Servicio y Política de Privacidad al registrarse**: sin empezar, a pedido del usuario. Hoy `POST /api/tenants/register`/`POST /api/auth/register` no piden ni registran ninguna aceptación. Necesita: checkbox obligatorio en los forms de registro (`RegisterPage.tsx`, `AcceptInvitePage.tsx`), y guardar en el backend que se aceptó (con qué versión/fecha de los documentos, para poder probarlo después si hace falta) — probablemente un campo en `User` o una tabla aparte si se quiere trackear versiones a futuro
- [ ] **Gap encontrado post-implementación — falta relacionar `hourlyRateCents`/`monthlyRateCents` (backlog, confirmado por el usuario 2026-07-23, sin implementar):** hoy `Employee` tiene los 2 campos de rate como columnas sueltas sin relación entre sí — nada indica cuál de los dos aplica a cada empleado. Confirmado agregar 2 campos nuevos, como enum fijo (no catálogo tipo `FieldCatalogDefinition` como Department/Job Title — son 2 estados universales, no una taxonomía que varíe por tenant):
  - **Tipo de contratación**: Part Time / Full Time.
  - **Tipo de compensación**: Hourly / Monthly — determina cuál de `hourlyRateCents`/`monthlyRateCents` es el que aplica (el otro queda sin usar/oculto en la UI).
  - **Sin confirmar todavía:** si estos 2 campos van con la misma visibilidad restringida (solo owner) que ya tienen `hourlyRateCents`/`monthlyRateCents`, o si son públicos dentro de `view_hr` (el tipo de contratación en sí no es tan sensible como el monto).
  - **Pendiente de la ronda anterior, sin resolver todavía:** también falta un campo de **moneda** para los montos — el proyecto tiene la convención escrita de "centavos + ISO-4217, nunca asumir" (`docs/metrics/saas-metrics-spec.md`) y hoy se guardó en centavos pero sin moneda, rompiendo esa misma convención. A confirmar si se agrega en esta misma ronda o se pospone.
- [ ] **Idea (backlog, anotada por el usuario 2026-07-14, sin detalle ni empezar):** verificación de email por OTP al crear una cuenta. Hoy `POST /api/auth/register` y `POST /api/tenants/register` crean el usuario y lo dejan activo/logueado sin confirmar que el email sea real o le pertenezca — cualquiera puede registrarse con un email ajeno. La infraestructura de email ya existe (`src/lib/mailer.ts`, Zoho SMTP, ya usada para invitaciones), así que el envío en sí no sería trabajo nuevo — falta diseñar: dónde se genera/guarda el código (¿tabla nueva, o reusar el patrón de `Invitation` con un token de un solo uso?), tiempo de expiración, qué pasa con la cuenta mientras no está verificada (¿puede usar la app en modo limitado, o queda bloqueada hasta verificar?), y si aplica también al aceptar una invitación (`AcceptInvitePage.tsx`) o solo al registro directo.
  - **Relacionado, mismo ítem porque comparte la base técnica**: 2FA por email en el login. A diferencia del OTP de registro (que verifica el email una sola vez, al crear la cuenta), esto se dispararía en **cada login** (o al menos en dispositivos nuevos) — después de validar usuario/contraseña, el backend no entrega la sesión todavía, manda un código por email, y recién la crea cuando el usuario lo confirma (`POST /api/auth/verify-2fa` o similar). Mismo mecanismo de generar/mandar/validar un código de un solo uso que el OTP de registro, así que conviene diseñarlos juntos aunque resuelvan problemas distintos (confirmar que el email es real vs. proteger el login aunque roben la contraseña).
- [ ] **Idea (backlog, anotada por el usuario 2026-07-14, sin detalle ni empezar):** soporte de idiomas (i18n) en la app. Todavía no se definió el alcance (¿selector de idioma para el usuario, o fijar un idioma por tenant/región? ¿cuáles idiomas además del actual?) — el usuario dijo explícitamente que todavía hay que pensar cómo proceder. Relacionado con un hallazgo ya anotado en `docs/ux-ui-audit.md` (UX-02): hoy la landing está en español y la app entera en inglés, inconsistencia que un visitante nota justo en el momento de conversión — probablemente informe la primera decisión de alcance (¿arrancar agregando español a la app, o un sistema de i18n más genérico desde el principio?).
- [ ] **Tema a seguir discutiendo (sin decidir todavía):** sistema de cobro de suscripciones del propio SaaS (módulo Payments — Northstack cobrándose a sí mismo, distinto del módulo Payments de facturación a Clients ya anotado más abajo). Alcance internacional. Evaluado hasta ahora: Stripe directo requeriría una LLC/entidad en EEUU porque Stripe no da cuentas directas en Argentina (a confirmar con un contador/abogado, no es consejo legal); como alternativa sin necesidad de entidad en EEUU, Paddle actúa como "merchant of record" (factura y cobra en tu nombre, maneja IVA/impuestos internacionales) a cambio de mayor comisión (~5% + USD 0.50 por transacción, a confirmar en su web) — evaluado como la opción de referencia por ahora. Se mencionó Whop como alternativa pero con menos certeza sobre si maneja impuestos internacionales igual de bien, y menos track record para SaaS B2B. Falta definir: planes/precios, si hay trial gratis, y qué pasa con el tenant si falla el pago o cancela (bloqueo total vs solo-lectura vs período de gracia)
  - **Ampliado 2026-07-21, a pedido del usuario:** además del proveedor de cobro, hacen falta 2 piezas más — (1) una **pantalla de suscripción** para que cada tenant gestione la suya de forma autónoma (ver plan actual, cambiar de plan, actualizar método de pago, cancelar) — probablemente viviría en el hub de `/settings`, junto a Appearance/Users; (2) **diseñar el plan/los planes de precios en sí** (todavía no existe ninguno — cuántos tiers, qué diferencia a cada uno, mensual vs anual). Al crear un tenant nuevo, la idea es ofrecer la elección explícita entre **pagar de entrada** o **arrancar con 15 días de prueba gratuita** — afecta el flujo de `registerTenantWithOwner` (`tenantService.ts`) y probablemente necesite un estado intermedio de tenant (algo como `trialing`, distinto de `active`/`suspended`/`cancelled` que ya existen) para saber cuándo se vence la prueba y qué pasa después si no cargó un método de pago.
  - **Flujo confirmado 2026-07-21:** después de completar el form de Sign Up (con los campos nuevos de abajo), el usuario **no** cae directo a `/overview` como hoy — se lo redirige a una pantalla de suscripción nueva donde elige pagar de entrada o arrancar el trial de 15 días, antes de entrar a la app. Afecta el routing post-registro en `App.tsx`/`RegisterPage.tsx`, además del backend ya anotado arriba.
- [ ] **Módulo Payments — facturación de cada tenant a sus propios Clients (backlog, anotado 2026-07-21, sin spec técnico todavía):** distinto del ítem de suscripciones propias (ese es Northstack cobrándose a sí mismo, vía Paddle/Stripe; este es la feature de producto en sí, la que la landing ya anuncia como "Payments próximamente" en `landing/index.html`). El *qué* es esto: cada tenant conecta su propia cuenta de cobro para facturarle directamente a sus propios Clients (el módulo Clients ya existente). El *cómo* (qué proveedores, OAuth, tokens) vive ahora dentro del Panel de Integraciones (ítem de abajo, punto 1) — no como mecanismo separado. Explícitamente **no bloqueante para el beta**.
- [ ] **Idea (backlog, anotada por el usuario 2026-07-21, sin empezar):** OAuth de Google — dos usos distintos, evaluar juntos porque comparten el mismo flujo de conexión: (1) "Sign in with Google" en registro/login, para reducir fricción (menos urgente mientras el beta sea por invitación cerrada; más valioso si el registro se abre a futuro); (2) sincronizar las solicitudes de Time Off aprobadas al Google Calendar personal de cada empleado (hoy solo visibles dentro de la app, en `/overview`). Vive dentro del Panel de Integraciones (ítem de abajo).
- [ ] **Panel de Integraciones (backlog, anotado por el usuario 2026-07-21, sin spec técnico todavía):** un hub único, propio dentro de Settings, donde viven **todas** las conexiones a apps externas del tenant — en vez de que cada OAuth tenga su propio rincón desconectado. Agrupa:
  1. [ ] **Stripe + QuickBooks (módulo Payments) + evaluar Mercado Pago**: confirmado por el usuario que estos proveedores de cobro entran acá, no como módulo aparte — **Stripe** (Stripe Connect) para cobrarle directo a los Clients del tenant, **QuickBooks** para reflejar esos Clients como customers/facturas del lado contable. Se suma **Mercado Pago** como proveedor a evaluar específicamente para tenants argentinos — mismo problema de fondo que ya se había identificado para la suscripción propia de Northstack (Stripe no da cuentas directas en Argentina), así que probablemente aplica igual acá para que un tenant argentino pueda cobrarle a sus propios Clients sin depender de una entidad en EEUU.
  2. [ ] **Webhooks salientes**: el tenant configura una URL + elige qué eventos le interesan (ej. "empleado creado", "Time Off aprobado", "submission de Public Form nueva"), y Northstack hace `POST` con el payload del evento cuando ocurre. Dirección opuesta a la "API pública protegida por token" ya prevista en `contexto-proyecto.md` (esa es *entrante* — un sistema externo consulta a Northstack; esto es *saliente* — Northstack avisa). Podría vivir junto a la API pública en el mismo panel, pero son mecanismos distintos, no confundir uno con otro al spec-earlo.
  3. [ ] **Slack, como app instalable ("Add to Slack")**: confirmado por el usuario — no un simple Incoming Webhook (URL pegada a mano), sino OAuth real con una app propia de Northstack instalada en el workspace del tenant, con potencial de comandos/mensajes interactivos (ej. aprobar una solicitud de Time Off sin salir de Slack). Esfuerzo considerablemente mayor que un webhook simple — implica publicar/verificar una app ante Slack. Se conecta directo con el gap de notificaciones ya anotado (Public Forms, Time Off) — podría terminar siendo el canal de aviso preferido en vez de (o adicional a) email.
  - Explícitamente **no bloqueante para el beta** — queda para un spec dedicado más adelante.
- [ ] **Idea (backlog, anotada por el usuario, sin detalle ni empezar):** sistema de logs por usuario — cuándo loguea, y qué movimientos/modificaciones realiza dentro del sistema (auditoría)
- [ ] **Idea (backlog, anotada por el usuario, sin detalle ni empezar):** sistema de roles custom (hoy los roles son fijos: owner/admin/member, con permisos hardcodeados en `permissionService.ts` — relacionado con la discusión de owners que quedó pendiente de evaluar)
- [ ] **Ideas para preparar el MVP para beta y conseguir testers (backlog, anotadas por el usuario 2026-07-21, sin empezar, sin priorizar entre sí):** surgieron en una sesión de planning enfocada específicamente en "qué le falta al producto para que testers externos lo prueben en serio", separado de la lista de deuda técnica/seguridad ya existente. Reclutamiento confirmado por el usuario: invitación cerrada/manual, no registro abierto — ninguna de estas depende de resolver primero anti-abuso de registro público.
  1. [x] Notificaciones por email de eventos que requieren acción — implementado 2026-07-21 (Bloque 3 del brief semanal). Solicitud pendiente → email al manager asignado; decisión manual (aprobar/rechazar) → email solo al empleado (quien decide ya sabe). Caso especial confirmado con el usuario: una política **auto-aprobada** (`requiresApproval: false`) no tiene a nadie decidiendo activamente, así que ese email de "decidida" va a **empleado + manager + owner**, no solo al empleado. Todo vía `src/lib/mailer.ts`, best-effort (un fallo de envío no rompe la creación/decisión de la solicitud).
  2. [x] Seed de datos de ejemplo opcional al crear un tenant nuevo (botón tipo "Load sample data", borrable después) — implementado 2026-07-23, junto con el ítem 3 (mismo componente). Botón "Load sample data" en la card nueva de Overview → `POST /api/onboarding/seed-sample-data` (`onboardingService.ts`, nuevo) crea 3 departamentos + 3 job titles (catálogo real, no texto plano) + 5 empleados + 4 clientes de ejemplo. No es idempotente a propósito (llamarlo de nuevo agrega más filas) — la UI ya lo previene ocultando el botón de "empezar" una vez que hay datos reales, y es una acción de conveniencia, no una migración.
  3. [x] Onboarding checklist en `OverviewPage.tsx` — implementado 2026-07-23. Card nueva (`OnboardingChecklist.tsx`) con 4 pasos con check real contra el backend (`GET /api/onboarding/status`): agregar tu primer empleado, agregar tu primer cliente, invitar a un compañero, crear una política de Time Off — cada uno linkea a la página correspondiente. Solo visible para owner/admin (los 4 pasos requieren permisos que un `member` no tiene). Se descarta sola cuando los 4 están completos, o el usuario la cierra a mano (✕, persistido en `localStorage`). **Gotcha real encontrado**: el registro de un tenant nuevo ya auto-crea un `Employee` para el owner (`tenantService.ts`, de antes) — sin ajustar esto, "Add your first employee" hubiera aparecido tildado desde el segundo 1 para cualquier tenant nuevo. Corregido: `hasEmployees` requiere `count > 1`, no `count > 0`. Verificado con Playwright: tenant nuevo → los 4 pasos sin marcar; "Load sample data" → 2 se tildan al toque (empleados/clientes), confirmado contra la API real (6 empleados = 1 owner + 5 de muestra, 4 clientes); cerrar la card persiste entre reloads.
  4. [ ] Import por CSV — hoy la única carga es una por una o vía el formulario público (pensado para autoregistro, no para bulk); un tester con un equipo real de 20-30 personas no las va a tipear a mano solo para probar. **Alcance ampliado 2026-07-21, a pedido del usuario:** pensarlo como una capacidad genérica/reusable ("casi todo" debería poder importarse por CSV), no una feature aislada de Employees/Clients — incluye contemplar, cuando se construya, la carga de datos del módulo Payments (facturas/cobros de cada tenant a sus Clients, ya anotado más arriba), no solo las 2 entidades de hoy.
  5. [ ] Export de empleados/clientes a CSV — contraparte del import; también transmite confianza ("mis datos no quedan atrapados acá") a alguien evaluando el producto.
  6. [x] "What's new" / changelog visible en la app — implementado 2026-07-23, popover como pedía el backlog original (no página, a diferencia de Help/FAQ — acá sí tiene sentido un popover chico y rápido de escanear). Ícono nuevo (`BellIcon`, agregado a `Icons.tsx`) en `TopBar.tsx`, con un punto azul de "no leído" cuando hay entradas más nuevas que la última vista (`localStorage`, guarda el id de la entrada más reciente vista). Contenido **estático**, igual criterio que Help/FAQ — array hardcodeado en `frontend/src/lib/changelog.ts` (`CHANGELOG_ENTRIES`, más nueva primero), sin CMS. 8 entradas reales escritas en lenguaje de usuario (no mensajes de commit) resumiendo los cambios visibles más recientes de la semana — columnas de tabla, checklist de onboarding, campos nuevos de Employee, rediseño de tablas, Views/Kanban, Public Forms, Settings unificado, Time Off. Verificado con Playwright: punto de "no leído" visible en la primera carga, desaparece al abrir el popover, se mantiene ausente después de recargar (persistencia real, no solo de sesión).
  7. [x] Canal de feedback/reporte de bugs para testers — implementado 2026-07-21 (Bloque 3). `POST /api/feedback` (autenticado, cualquier rol) manda a `FEEDBACK_EMAIL` (confirmado por el usuario: `info@joinnorthstack.com`, ⚠️ **falta cargarlo como env var en Vercel producción** — solo está en el `.env` local por ahora). Frontend: item "Send feedback" en el dropdown de `TopBar.tsx`, abre un `SlideOver` con textarea, confirma con toast. A diferencia del resto de los envíos de email de este bloque, **no** es best-effort — si el envío falla, la request devuelve error real (el feedback en sí es el punto del request, no un efecto secundario).
- [ ] **Idea (backlog, anotada por el usuario 2026-07-21, sin detalle ni empezar):** ícono de notificaciones in-app (campana con contador, dropdown de notificaciones recientes) — distinto del canal de *email* ya anotado arriba: esto es un canal adicional, dentro de la propia app, para eventos como "CSV importado", "export finalizado", además de los eventos accionables de Time Off/Public Forms ya cubiertos por email. Conceptualmente se solapa con las otras 3 ideas de "avisar que pasó algo" ya anotadas (email, Slack, webhooks salientes) — al spec-earlo, conviene diseñar un solo modelo de "evento" del lado del backend y que cada canal (in-app, email, Slack, webhook) sea solo una forma distinta de entregarlo, en vez de 4 implementaciones sueltas que hacen lo mismo cada una a su manera.
- [ ] **Idea (backlog, anotada 2026-07-21, sin empezar):** más control sobre la página de agradecimiento de Public Forms — hoy solo el texto del párrafo es personalizable (`Form.thankYouMessage`), el resto de `PublicFormPage.tsx` en el estado `submitted` (heading "Thank you!", layout, estilo) queda fijo. Candidatos a agregar, sin definir alcance todavía: heading personalizable, redirect a una URL propia del tenant en vez de mostrar el mensaje adentro de Northstack, imagen/logo del tenant en esa pantalla (branding del tenant en la página pública en general está descartado a propósito — a reconciliar si se retoma esto).

### Base de datos

- [ ] Historial de valores previos de custom fields (con retención por tiempo) — evaluado, pospuesto a propósito por ahora

### Backend

- [ ] **Implementar API pública con token para integraciones externas** — agrupado con el Panel de Integraciones para priorización (misma sección "Producto/Planificación" más arriba): es el mecanismo *entrante* (un sistema externo consulta a Northstack), contraparte de los webhooks salientes ya anotados ahí. Sin spec técnico todavía.
- [ ] **Fix de patrón N+1 en `scripts/metrics-report.ts`** — encontrado 2026-07-23 al revisar el script. Líneas 68-70: `Promise.all` con una query `count()` por tenant activo (`user.count`, `employee.count`, `client.count`), una llamada de red a la base por cada tenant en vez de una sola query agregada. No urgente a la escala actual del beta, pero barato de corregir ahora: reemplazar por `prisma.user.groupBy({ by: ['tenantId'], where: { tenantId: { in: [...activeTenantIds] } }, _count: true })` (mismo para `employee`/`client`), una sola query por entidad sin importar cuántos tenants haya.

### Frontend

- [ ] Revisar el frontend end-to-end en navegador (pendiente que el usuario lo haga — no tengo forma de ver la UI)
- [ ] **Idea (backlog, anotada por el usuario 2026-07-20, sin detalle ni empezar):** edición inline en la tabla de Employees — cada celda de cada fila editable directamente sin abrir el SlideOver de edición, excepto `email` y nombre (`firstName`/`lastName`), que quedan de solo lectura en la tabla. Aplicaría a `department`, `statusId`, `managerId`, y los custom fields ya embebidos en la tabla. A definir: patrón de edición (click-to-edit por celda vs. una fila entera en modo edición a la vez), qué pasa con el guardado (autosave por campo vs. confirmar), y si Clients recibe el mismo tratamiento por consistencia.
- [ ] **Idea (backlog, anotada por el usuario 2026-07-20, sin detalle ni empezar):** filtro de columnas visibles en las tablas (útil con muchos custom fields). A definir: dónde vive el control (cerca de Filter en `.page-toolbar`), y si la preferencia se guarda (por usuario, localStorage) o es solo de la sesión.

### UX / Interfaz

Hallazgos de `docs/ux-ui-audit.md` + decisiones tomadas en las sesiones de mockup interactivo (Artifacts "Northstack — Propuesta de mejora UX/UI" y "Northstack — Rediseño de interfaz"). Landing excluida a propósito — se retoma aparte, todavía no pasó de mockup inicial. Ver [`ux-ui-brief.md`](ux-ui-brief.md) para el estado consolidado actual.

- [ ] **Replicar a Company Users el bloque visual de tablas ClickUp** (ghost row, scrollbar propia, hover completo, tipografía compacta, Overview panel de usuario) — pendiente desde 2026-07-25, nunca implementado. **Nota 2026-07-30**: el ítem original también mencionaba "Clients", que ya no aplica (página eliminada, ver "Legado" en `features-overview.md`) — Companies/Contacts en cambio ya tienen su propio panel de detalle (más reciente y distinto de este patrón, ver Checkpoint F en `docs/tareas/semana-2026-07-29.md`), así que lo único que queda genuinamente pendiente de este ítem es Company Users.

- **Rebrand de Settings — 4 tareas separadas, spec cerrado y mockeado en el Artifact "Northstack — Settings reconciliado" (2026-07-16)**. Orden sugerido: hacer las primeras 3 antes que la última — dejan `ModuleSettingsLayout` sin contenido, recién ahí "Workspace Settings" puede reusar la ruta `/settings` sin chocar con la vieja. Ninguna de las 4 necesita cambios de backend — los endpoints ya existen, es reorganización de dónde vive cada UI.
  - [x] **Custom Fields — deja de ser una página de Settings, pasa al header de columna en Employees/Clients**: reemplaza `CustomFieldsSettingsPage.tsx` (hoy en `/settings` → Custom Fields). Cada columna de custom field en `EmployeesPage.tsx`/`ClientsPage.tsx` gana un dropdown en su header (Edit field / Delete field); una columna "+" fija al final agrega un campo nuevo (nombre, tipo, requerido, opciones si es select). Reusa los endpoints existentes de `customFieldService.ts` (se sumó `updateCustomFieldDefinition`, que no existía — el backlog decía que no hacía falta backend nuevo, pero el PATCH solo soportaba togglear `isActive`).
  - [x] **Statuses — se fusiona con Custom Fields, mismo mecanismo (Status es, conceptualmente, un campo select)**: reemplaza `StatusesSettingsPage.tsx`. El header de la columna Status abre "Manage options" — lista con color, reordenar, marcar default, activar/desactivar, y agregar uno nuevo, todo en el mismo popover. Reusa los endpoints existentes de `statusService.ts`/`/api/status-definitions`.
  - [x] **PTO Policies — se muda al header de página de `/hr/pto`, separado de los tabs de workflow**: reemplaza `PtoPoliciesSettingsPage.tsx` (hoy en `/settings` → PTO Policies, ruta eliminada). `PtoOverviewPage.tsx` gana un header de página propio (título "PTO" + botón "Policies ▾" con la lista y ✏️ por política + botón "Add Policy") **arriba** de la fila de tabs existente (My Requests/Approvals/Balances, sin cambios). A diferencia de Custom Fields/Status, "Add Policy" y editar una política existente abren el `SlideOver` ya construido para Employees/Clients, no un popover chico. `ModuleSettingsLayout` quedó sin contenido y se borró junto con `PtoPoliciesSettingsPage.tsx`; `/settings` redirige temporalmente a `/profile` hasta que la tarea de Workspace Settings tome esa ruta. Implementado 2026-07-16, ver nota de avance.
  - [x] **Workspace Settings — hub único con 2 grupos (Mi cuenta / Empresa), reemplaza los 3 puntos de entrada actuales**: `WorkspaceSettingsLayout.tsx` (nuevo, reemplaza a `CompanySettingsLayout.tsx`, borrado) fusiona `ProfileSettingsPage` (antes standalone en `/profile`) y `CompanyAppearancePage`/`CompanyUsersPage` (antes bajo `/company`) en un solo layout con 2 grupos — "Mi cuenta" (Profile, visible para todos) y "Empresa" (Appearance, Users — solo owner/admin, oculto para el resto) — sirviendo en `/settings/profile`, `/settings/appearance`, `/settings/users`. `Sidebar.tsx`: el engranaje ahora es visible para **todos** los roles (antes era admin-only vía `showSettings`, lo que hubiera dejado a los `member` sin forma de llegar a su propio Profile) y apunta al hub unificado; el gating de "Empresa" se mueve adentro del hub mismo. `TopBar.tsx`: el dropdown de usuario perdió "Profile" y "Company Settings" — queda solo con el nombre y "Logout". `/profile` y `/company` quedaron como redirects a `/settings/profile`/`/settings/appearance` para no romper bookmarks viejos. Verificado con Playwright con 2 roles reales (owner invitando a un member vía el flujo de invitación real, no simulado): el owner ve ambos grupos completos; el member invitado solo ve "Mi cuenta → Profile", sin "Empresa" en la nav; el dropdown de ambos roles muestra únicamente "Logout"; los redirects de `/profile`/`/company` funcionan. `npm run build` (frontend) y `npm test` (backend, 6/6) verdes.
  - Regla general para cualquier config contextual futura, no solo esta ronda: ediciones de 2-4 campos simples van en popover chico anclado al trigger; entidades más completas (como PTO Policy) abren el `SlideOver` reutilizable — mismo criterio de peso que ya separa "un campo" de "una entidad" en el resto de la app.
- **Recorrido completo de interfaz (2026-07-21) — 5 tareas separadas**. Revisión del código real de las 20 páginas/20 componentes del frontend a esta fecha: la mayor parte del sistema de diseño ya está consolidada (fondo unificado, botones, íconos, tablas full-screen, Views/Kanban, Settings unificado, responsive) — estas 5 son las piezas puntuales que quedaron sueltas, más la propuesta de formalizar todo como un estándar escrito. **Referencia visual aprobada por el usuario: Artifact "Northstack — Diseño de pantallas"** (no el "Recorrido completo de interfaz" original, que mezclaba reporte+auditoría+diagramas y el usuario pidió rehacer — el segundo artifact es homogéneo, pantallas a escala real, y confirma el logo corregido + Company Users rediseñada + modo oscuro completo sobre Login/Overview/Employees(grid y kanban)/Settings(las 4 sub-páginas)/Time Off).
  - [x] **Logo ilegible en dark mode** — implementado 2026-07-22 (Tier 1). Verificado primero contra el código real cuál de los 3 archivos señalados tenía el problema de verdad: `TopBar.tsx` y `AcceptInvitePage.tsx` sí renderizan sobre `.header`, que va a `dark:bg-gray-950` — ahí el logo navy sí quedaba casi invisible, corregido con 2 `<img>` (uno `dark:hidden`, otro `hidden dark:block`) apuntando a `logo-horizontal-light.svg`/`logo-horizontal-dark.svg` respectivamente. **`AuthLayout.tsx` NO tenía el bug** — su logo vive en `.auth-right`, que tiene un gradiente celeste fijo (`background: linear-gradient(...)`) sin ninguna variante `dark:`, así que el logo navy ahí siempre fue correcto; se dejó sin tocar. El asset de `logo-horizontal-dark.svg` en sí (3 tonos claros en vez de blanco plano, ver Artifact "Northstack — Logo en fondo oscuro") lo resolvió el usuario por su cuenta el mismo día.
  - [x] **Company Users al patrón nuevo** — implementado 2026-07-22 (Tier 1). Reescrito completo: `.full-table` + `.full-table-wrap`, `.toolbar-search` (busca por nombre/email), sort por columna (client-side, sin la maquinaria de `SavedView`/Views que usan Employees/Clients — Users no tiene custom fields ni necesita vistas guardadas, así que se implementó un sort local simple en vez de traer esa infraestructura), `Pagination.tsx`, formulario "Invite someone" movido a un `SlideOver`. **Decisión sobre íconos vs. menú de 3 puntos**: se evaluó y se descartó el menú — el rol ya se edita bien con el `<select>` inline existente (sin tocar), y activar/desactivar quedó como un único `.icon-btn` (`LockIcon`/`CheckIcon` según estado) — no había realmente 3 acciones por fila compitiendo por espacio, así que agregar un menú nuevo (patrón que no existe en ningún otro lado de la app) hubiera sido complejidad sin beneficio real. La tabla de invitaciones pendientes también se migró al mismo patrón (`.full-table` + `.icon-btn` con `CopyIcon`/`TrashIcon`).
  - [x] **2 clases de tipografía** — implementado 2026-07-22 (Tier 1). `.page-title` agregada standalone (mismos valores que `.page-toolbar h2`, sin tocar esa regla existente para no arriesgar una regresión de cascada). `.card-title` reemplaza la regla `.card h3` anterior (que no fijaba tamaño/peso explícito, solo heredaba el default del navegador) — ahora es una clase con `text-base font-bold` explícito, aplicada en los 6 `<h3>` sueltos de `ProfileSettingsPage.tsx`/`CompanyAppearancePage.tsx`/`CompanyUsersPage.tsx`.
  - [x] **`ChevronRightIcon` faltante** — implementado 2026-07-22 (Tier 1). Ícono agregado a `Icons.tsx` (mismo `viewBox`/`stroke-width` que el resto), reemplaza los caracteres `‹`/`›` en `OverviewPage.tsx` (además se agregó `aria-label` a esos 2 botones, que quedaron solo-ícono).
  - [x] **`docs/design-system.md`** — escrito 2026-07-22 (Tier 1), ver el archivo. Cubre las 5 secciones propuestas (Color, Tipografía, Botones, Espaciado, Íconos) más una 6ta sección sobre el logo de marca (distinta de los íconos de UI) documentando la conversión a 3 tonos que resolvió el usuario.

### Seguridad

- [ ] **Auditoría de seguridad (2026-07-16, `docs/informe-tecnico/auditoria-seguridad-2026-07-16.md`) — 5 de 7 hallazgos resueltos.** Spec detallado de los primeros 5 (los de esta semana) en `docs/tareas/brief-semana-2026-07-21.md`, Bloque 1, ejecución verificada en `docs/tareas/semana-2026-07-21.md`:
  - [x] **[ALTO]** Mass assignment/IDOR en `PATCH` employees/clients — `req.body` sin whitelist llegaba directo a `prisma.update` (`employeeService.ts`/`clientService.ts`), permitía reasignar `tenantId`/`userId`/`statusId` de otro tenant. Resuelto 2026-07-21 (Bloque 1.1).
  - [x] **[MEDIO]** Sesiones sin expiración ni revocación al cambiar password (`model Session` sin `expiresAt`). Resuelto 2026-07-21 (Bloque 1.4) — expiración deslizante + revocación de otras sesiones al cambiar password.
  - [x] **[MEDIO]** Sin rate limiting en `/api/auth/*` (login/registro sin fricción ante fuerza bruta). Resuelto 2026-07-21 (Bloque 1.2).
  - [x] **[MEDIO]** Sin cabeceras de seguridad HTTP (Helmet). Resuelto 2026-07-21 (Bloque 1.3).
  - [x] **[MEDIO]** `authenticateToken` no verificaba `user.status === 'active'` — un usuario desactivado seguía con acceso mientras su sesión no expirara. Resuelto 2026-07-21 (Bloque 1.5).
  - [ ] **[MEDIO]** CORS abierto a cualquier origen (`app.use(cors())` sin configurar) — no incluido en el brief de esta semana, queda para una ronda siguiente.
  - [ ] **[BAJO]** `role` arbitrario aceptado en `POST /api/auth/register`, `zod` instalado sin usar — no incluidos en el brief de esta semana. (La parte de `statusId` no validado contra tenant al actualizar sí se resolvió, de paso, dentro del fix de 1.1 de arriba.)

## Notas de avance

- **Proceso de deploy — obligatorio desde el 2026-07-27 (confirmado por el usuario 2026-07-24):** ambiente de staging armado y verificado (`staging.joinnorthstack.com`, branch de Neon separada, Turnstile con claves de test de Cloudflare, Zoho compartido con producción). Regla acordada: **todo cambio de código** (backend/frontend/schema) pasa primero por `staging` (`git push origin main:staging`, verificar, recién ahí `git push origin main`) — sin excepciones una vez que arranque. **Los cambios que solo tocan `docs/*.md` van directo a `main`**, sin pasar por staging, porque no hay nada que deployar/testear ahí (no se renderizan en ningún lado de la app). Recordatorio operativo: la branch de Neon `staging` es una foto tomada en el momento de crearla — cualquier `prisma db push` contra producción tiene que correrse también contra el `DATABASE_URL` de `staging` (mismo secret ya cargado en GitHub) para que no se desincronicen; ya pasó una vez (ver incidente de "Can't reach database server" del 2026-07-23, resuelto sin relación al schema, pero el riesgo de desincronización sigue latente).
  - **Corrección aplicada el mismo día que el gate arrancó (2026-07-27):** "verificar" significa que **el usuario** revisa `staging` con sus propios ojos, no que Claude se autoverifique con build/tests/queries directas y decida por su cuenta que está listo para promover. La primera pieza del rediseño de Clients (schema, Unidad 1) se pusheó por error tanto a `staging` como a producción en el mismo turno — corregido de inmediato tras el señalamiento del usuario, y respetado sin excepciones en las 10 unidades siguientes (todas exclusivamente en `staging`, ninguna promovida a `main` todavía).
- La prioridad actual es validar la base del sistema con HR antes de avanzar a clientes y pagos.
- El archivo `.env` local está configurado con Neon y listo para pruebas.
- Se creó `docs/run-tests.md` con los comandos exactos para instalar, generar Prisma, compilar y ejecutar tests.
- La implementación debe realizarse de forma incremental y testeable.
- Cualquier cambio importante en el alcance deberá documentarse aquí.

Las tareas de QA (separadas de desarrollo, para quien haga testing/verificación) viven en
[`docs/Tareas-QA.md`](Tareas-QA.md), creado 2026-07-23.

Las entradas fechadas (el detalle día a día de qué se hizo y por qué) viven en `docs/tareas/`, un archivo por semana — este archivo se estaba volviendo enorme y poco manejable. Más reciente primero:

- [`docs/tareas/semana-2026-07-29.md`](tareas/semana-2026-07-29.md) — semana actual, en curso
- [`docs/tareas/semana-2026-07-21.md`](tareas/semana-2026-07-21.md)
- [`docs/tareas/semana-2026-07-13.md`](tareas/semana-2026-07-13.md)
- [`docs/tareas/semana-2026-07-06.md`](tareas/semana-2026-07-06.md)
- [`docs/tareas/semana-2026-06-29.md`](tareas/semana-2026-06-29.md)

## Estado actual — resumen (detalle día a día en `docs/tareas/semana-2026-07-29.md`)

- **Rediseño de Clients — Tier 3, completo y en producción**: Company/Contact/Opportunity/
  Pipeline con Kanban por stage, Views/Filters/Kanban genérico también para Companies/Contacts,
  Form (ex-`PublicForm`) con matching de Company por dominio de email, migración de datos
  `Client → Company/Contact` corrida contra producción (verificada). El módulo `Client` legado
  sigue vivo puertas adentro (onboarding, Public Forms) — el corte final es una unidad futura
  separada, sin fecha.
- **Dirección visual ClickUp**: dark mode a negro puro, tipografía/chips/modal/Settings grid
  rediseñados, 10/11 ítems.
- **Módulo de Tasks/Notes + unificación y rediseño de los 4 paneles de detalle** (Employee/
  Company/Contact/Opportunity): panel de detalle pasó de un popup de 460px a 70vw×70vh en 2
  columnas, con tabs Notes/Tasks/Activity (Activity es placeholder). Checkpoints D (bugs), E
  (features confirmadas) y F (unificación estructural) completos.
- **Revisión DevOps de arquitectura y calidad de código**: gate de CI (build+test del backend
  antes de deploy), ESLint en backend/frontend, `tenantService.ts` dividido en 3 servicios,
  `components/` reorganizado por dominio, `api.ts` partido en `api/` por dominio, página huérfana
  de Clients eliminada del frontend, convención de tenant-scoping documentada (investigado, sin
  bug real encontrado, sin enforcement automático agregado).
- **Primer deploy a producción del módulo CRM completo** — `origin/main` estaba congelado desde
  el 2026-07-28 sin nada de Company/Contact/Opportunity/Pipeline/Tasks/Notes; mergeado y pusheado a
  producción (124 tenants reales), confirmado explícitamente con el usuario dado el alcance real.
- **2 documentos nuevos**: [`ux-ui-brief.md`](ux-ui-brief.md) y
  [`features-overview.md`](features-overview.md).
- [ ] **Pendiente, sin resolver todavía** (detalle completo en la semana archivada): vincular un
  Contact a una Opportunity al crearla (gap de UX, pausado a pedido del usuario hasta hablar con el
  PM); calificación de leads sin Company confirmada (pospuesto hasta tener volumen real);
  automatizaciones del pipeline de ventas (pospuesto); corte final del módulo `Client` legado
  (bloqueado en migrar Custom Fields/Public Forms de `entityType: 'client'` primero).

