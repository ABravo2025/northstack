# Tareas de desarrollo

- Fecha de creación: 2026-07-02
- Última actualización: 2026-08-06 — checklist cruzado contra el código real (CSV export/import de
  Employees confirmado implementado); spec de Payroll eliminado del checklist por quedar
  inconsistente con la realidad (se había construido, se revirtió por un incidente de deploy el
  2026-08-03, y no existe en el código en ningún entorno — ver la entrada fechada más abajo, el
  historial completo queda en `git log` si hace falta reconstruirlo); push de Employees a `staging`
  (paridad visual del modal "Add" con el panel de detalle, auto-create al completar campos
  obligatorios, asterisco rojo reusable, fix de paginación — ver QA-06 en `docs/Tareas-QA.md`).
- Última actualización anterior: 2026-07-30 — módulo CRM (Company/Contact/Opportunity/Pipeline) completo,
  Tasks/Notes con la unificación y rediseño de los 4 paneles de detalle, y una revisión DevOps de
  arquitectura/calidad de código, **todo ya en producción** (primer deploy del CRM completo,
  `origin/main` estaba congelado desde el 2026-07-28). Detalle día a día de esta última tanda en
  [`docs/tareas/semana-2026-07-29.md`](tareas/semana-2026-07-29.md); resumen en la sección "Estado
  actual" más abajo. Este archivo se podó (2026-07-30) — los ítems ya completados se movieron a los
  archivos semanales de `docs/tareas/`, acá queda solo lo pendiente + un resumen de alto nivel.
- **2026-07-31 (de noche, sin supervisión en tiempo real — autorizado explícitamente por el usuario)
  → mañana del mismo día, pusheado a staging y producción, con un incidente real encontrado y
  resuelto en el camino. Detalle completo, minuto a minuto, en
  [`docs/tareas/semana-2026-07-29.md`](tareas/semana-2026-07-29.md) — acá solo el resumen:**
  1. Pasada de UX/UI completa (Tareas 1-9 de `docs/tareas-ux-ui.md` — paleta cálida, alturas de
     control, jerarquía de botones, EmptyState/TableSkeleton, panel de detalle agrupado, Kanban con
     datos, tiles de Settings, dark mode de 3 planos, patrón mobile) + 4 ítems sueltos de este
     archivo (fix N+1 de `metrics-report.ts`, ghost row/scrollbar de Company Users, CORS restringido
     a allowlist, limpieza de este checklist). Todo verificado con Playwright contra un tenant de
     staging antes de pushear.
  2. Commit `7f97cf2` + `4d6c786`, pusheados a **staging y producción en el mismo turno** (confirmado
     explícitamente por el usuario, saltando el paso intermedio de revisión manual que exige la regla
     de deploy de abajo — excepción puntual, no un cambio de la regla general).
  3. **Incidente encontrado post-push, no causado por este push:** el usuario reportó toasts de error
     ("Failed to load your tasks" / "Failed to load the team calendar") al abrir `/overview` en
     producción. Diagnosticado con un tenant de prueba descartable creado directo en producción vía
     `curl`: las tablas `Task`/`Note` **no existían en la base de datos de producción** —
     `prisma db push` se había corrido contra `staging` al construir el módulo de Tasks/Notes
     (`docs/tareas/semana-2026-07-29.md`, entrada "módulo de Tasks/Notes") pero nunca contra
     producción. Rompía silenciosamente `GET /api/tasks/mine`, `GET /api/tasks/calendar` y
     `GET/POST /api/notes` con 500 desde el primer deploy del CRM completo — nadie lo había notado
     hasta ahora. Confirmado con una query de solo lectura contra ambas bases (`information_schema.tables`)
     antes de tocar nada. Fix: `prisma db push` contra producción (puramente aditivo — creó las 2
     tablas faltantes, cero riesgo de datos porque no podían tener ninguna fila hasta ahora).
     Verificado end-to-end después: los 3 endpoints vuelven 200. Este es exactamente el "riesgo de
     desincronización" que la regla de deploy de abajo ya advertía como latente desde el 2026-07-23 —
     ver esa entrada, corregida hoy para ser explícitamente bidireccional.
  4. Varios ítems grandes del backlog (Payroll, Payments, Integraciones, roles custom, etc.) se
     dejaron sin tocar a propósito por no tener spec técnico todavía — ver marca `[ ]` de cada uno.
- **Lección de proceso (2026-07-31, del primero de dos incidentes de Payroll — el segundo y más
  grande se resume en la entrada del 2026-08-06 más abajo; detalle completo de ambos en `git log`,
  no repetido acá):** un `git push origin main` nunca debe asumirse "solo docs" únicamente porque el
  commit que se está armando toca solo `.md` — si la rama local tiene commits de código sin pushear a
  `main` por delante, van a viajar igual. Verificar con `git log origin/main..HEAD` (o pushear
  inmediatamente después de cada commit, sin acumular) antes de cualquier push a `main`.
- **2026-08-06 — checklist auditado contra el código real, más un push de Employees a `staging`:**
  1. **Add Employee, paridad visual + auto-create**: el modal de alta de Employee pasó a usar el
     mismo estilo de campo que el panel de detalle (`Field.tsx`, label a la izquierda, input sin
     borde hasta foco/hover, en vez de `.form-group` con label arriba) y ganó asterisco rojo
     reusable (`Field` prop `required`, `.required-mark`) en los campos obligatorios. Comportamiento
     nuevo: apenas First Name/Last Name/Business Email (+ cualquier custom field `required`) están
     completos, el empleado se auto-crea y el modal pasa a ser el `EmployeeOverviewPanel` real de esa
     persona — sin clickear "Create" (el botón sigue de fallback manual). Pieza nueva reusable:
     `useAutoCreateGuard` (`frontend/src/hooks/`).
  2. **Bug real encontrado y corregido en el camino** (reportado por el usuario probando la app): un
     empleado recién creado podía no aparecer en la tabla al cerrar el panel si el sort/filtro activo
     lo mandaba a otra página — la tabla ahora salta a la página donde cayó, verificado con Playwright
     forzando el caso determinístico (orden por Name ascendente, nombre que cae en la última página).
  3. Pusheado a `staging` (`659da8a`), QA-06 cargada en `docs/Tareas-QA.md`. Compañías/Contacts/
     Opportunities quedan con el mismo tratamiento pendiente, unidad por separado.
  4. **Auditoría del checklist de este archivo contra `git log`/el código real** (a pedido del
     usuario): CSV export/import de Employees confirmado ya implementado (ítems tildados más abajo,
     con la salvedad de que Clients quedó huérfano de UI). Payroll, documentado acá como "sin
     empezar", en realidad se había construido completo entre el 2026-08-01 y el 2026-08-03 (Unidad
     0-15 + un re-spec), llegó a `staging` sin revisión real del usuario, y se revirtió de `main` el
     2026-08-03 tras un incidente de deploy (un push pensado como "solo docs" arrastró 27 commits de
     código sin revisar — commits `97af398`…`d1da7c4`, después `2c0d7b1`…`f9319a0`, revert en
     `6f4209d`). Hoy no existe en el código en ningún entorno — ni `main` ni `staging` (esto último,
     efecto colateral del propio push de Employees de hoy). **A pedido del usuario, se eliminó del
     checklist el spec técnico completo de Payroll** (vivía en este archivo, Tier 3.5 + la sección
     "Payroll — spec técnico completo") **por quedar inconsistente con la realidad**, junto con
     QA-04/QA-05 en `docs/Tareas-QA.md` (describían testear un módulo que ya no existe). El historial
     completo sigue en `git log` — retomar Payroll significa un spec nuevo desde cero, no reciclar el
     viejo.

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

**Tier 3.5 — Módulo Payroll — tercer intento, COMPLETO (21/21 unidades), spec en
`docs/spec-payroll.md` (2026-08-07).** Los dos intentos anteriores (Unidad 0-15 + re-spec,
2026-08-01 a 08-03) se revirtieron por completo — detalle en la entrada fechada 2026-08-06 de la
sección de arriba y en `git log`. Este spec se escribió desde cero, sin reciclar el viejo.

Resumen por bloque (detalle técnico completo en `docs/database-schema.md` grupo 7):
- **U1-U4 — Cimientos**: schema + cifrado AES-256-GCM (`src/lib/encryption.ts`), catálogo de
  políticas de pago y métodos de pago (backend+frontend), rename "Employee"→"People" a nivel de
  nav/ruta/heading + `personType` (Profile/Contractor/Employee) como gate de todo el módulo, retiro
  completo (schema + DB, con confirmación explícita del usuario para el paso destructivo) de
  `Employee.hourlyRateCents`/`monthlyRateCents`/`compensationType` en favor de `EmployeeCompensation`
  versionado.
- **U5-U9 — Onboarding a Payroll**: alta con contrato inicial dentro del mismo modal "Add Person",
  invitación específica (`acceptPath: '/confirm-contract'`) disparada al crear el primer contrato de
  alguien sin `User` vinculado, pantalla pública `/confirm-contract/:token` (contraseña, país,
  método de pago con IBAN/ACH o usuario según corresponda, evidencia IP+timestamp), cifrado de datos
  de cuenta ya integrado a esa confirmación, y `blocksParticipation` calculado en la creación de cada
  contrato.
- **U10-U11 — Gestión de personas**: asignación/reasignación masiva de política de pago (tabla +
  modal de revisión con monto editable por persona), chip de estado de contrato
  (Confirmado/Pendiente/Vencido) en la tabla de People.
- **U12-U17 — Payroll Run**: creación con pre-carga automática (excluye contratos sin confirmar),
  pantalla de detalle por persona (base/ajustes/total), ajustes editables mientras el run esté en
  borrador, carga de horas para compensación hourly con recálculo automático, alerta visual de
  persona inactiva, y confirmación que bloquea edición posterior.
- **U18-U19 — Pagos fuera de ciclo y timeline**: pagos únicos independientes de cualquier run, y una
  única línea de tiempo cronológica (pestaña principal de Payroll) mezclando runs y pagos sueltos.
- **U20 — Payslip PDF preview**: nueva dependencia `pdf-lib` (confirmada explícitamente con el
  usuario — sin binarios nativos, sin dependencias transitivas), PDF marcado "PREVIEW — NOT ISSUED"
  en el documento mismo, no solo en la UI.
- **U21 — Sidebar**: entrada "Payroll" owner-only a nivel de nav (con guard adicional en las 2
  páginas para que un no-owner que adivine la URL no vea pestañas rotas, más allá del 403 que ya
  daban los endpoints).

Verificado con un script de smoke test contra la API real (creación de run, exclusión de contrato
sin confirmar, bloqueo de confirmación con horas sin cargar, recálculo de horas, ajustes, confirmar,
bloqueo post-confirmación, pago fuera de ciclo) y con una pasada de Playwright de punta a punta
sobre las 21 unidades juntas (registro → alta con contrato → confirmación pública con IBAN → login
automático → Assignments → crear run → ajuste → confirmar → payslip → pago fuera de ciclo →
timeline), sin errores de consola al final. Esa pasada encontró y corrigió dos cosas antes de dar el
módulo por cerrado:
- Un warning real de React (fragments sin `key` agrupando las 2-3 filas por persona en
  `PayrollRunDetailPage.tsx`) — corregido usando `<Fragment key={row.employeeId}>` en vez del
  shorthand `<>`.
- Dos 403 de consola que resultaron **no ser de Payroll**: `OverviewPage.tsx` llama
  `listTenantUsers` sin chequear rol al montar, pero `GET /api/tenants/users` está gateado a
  owner/admin (`canManageUsers`) — cualquier `member` que entra a `/overview` los dispara (se
  silencian con `.catch(() => {})`, no rompen nada, pero ensucian la consola). No es parte del
  spec de Payroll así que no se tocó; queda anotado como backlog de UX/Overview.

**Todo commiteado en local únicamente, sin pushear a `staging` — a pedido explícito del usuario
2026-08-07** ("segui y completa todo, una vez que este todo en local lo quiero testear a full"),
distinto del criterio de "confirmar y pushear cada unidad por separado" que se venía usando. El
schema sí se aplicó directamente contra la base de datos de `staging` (necesario para poder probar
en local, incluyendo el paso destructivo de la Unidad 4 y el campo `confirmedIp` de la Unidad 7, no
contemplado en el schema original de la Unidad 1) — el código no. `scripts/backfill-legacy-employee-
compensation.ts` migró los registros de prueba con datos legados antes del borrado. Gotcha de ruteo
real encontrado y corregido en la Unidad 7: `/api/public/contract-confirmation/:token` colisionaba
con el catch-all de Public Forms por tener la misma forma de 2 segmentos.

**Pendiente, a cargo del usuario**: revisar todo el módulo en local antes de decidir qué pushear;
cargar `PAYMENT_DATA_ENCRYPTION_KEY` en Vercel (staging y producción) antes de promover, ya que hoy
solo existe en el `.env` local gitignorado.

**Primera ronda de fixes de la revisión del usuario (2026-08-08, local, sin pushear):**
- Nationality (alta de persona) pasó de texto libre a `<select>` reusando `COUNTRIES`
  (`frontend/src/lib/countries.ts`), la misma lista que ya usaba la confirmación de contrato.
- Los 5 `PayFrequencyDefinition` default pasaron de español a inglés (Weekly/Semi-monthly ·
  .../Monthly · ...) en `payFrequencyService.ts`, con un backfill (`scripts/rename-pay-frequencies-
  to-english.ts`) que renombró los ya seedeados en los 177 tenants de `staging` — rename de texto
  puro, no toca ids/relaciones.
- El campo "Description" del contrato inicial (alta de persona, bulk assign/reassign, y su reflejo
  en la confirmación pública) se relabeleó a "Role Description" en las 3 pantallas — solo el label
  visible, la propiedad de dominio sigue siendo `description` de punta a punta.
- Se confirmó que el envío de emails (Nodemailer/Zoho, `src/lib/mailer.ts`) funciona correctamente
  (test directo de SMTP con `transporter.verify()`+`sendMail()` exitoso) — el reporte de "no llega
  el email de invitación" no es un problema de infraestructura ni de código; a falta de acceso a la
  casilla de prueba del usuario, queda pendiente confirmar si fue spam/promociones o un email de
  prueba no revisable.
- Alta de persona ahora permite asignar Time Off Policies (checkboxes) en el mismo modal —antes solo
  se podía después de creado el empleado— reusando `assignTimeOffPolicyToEmployee` justo después de
  `createEmployee`/`createCompensation`.
- Department, Reports To, Start Date y Contract Type pasaron a obligatorios en el alta. Dos gotchas
  resueltos en el camino: (1) "Reports To" obligatorio hubiera bloqueado la creación de la primera
  persona de un tenant nuevo (nadie a quien reportar) — se agregó una opción explícita "No manager"
  para que sea una elección consciente, no un default vacío; (2) "Department" obligatorio hubiera
  bloqueado el alta en un tenant sin departamentos configurados (el caso por defecto) — se agregó el
  mismo `FieldCatalogMenu` que ya vive en el header de la tabla, ahora también inline en el modal.
- Checkboxes de toda la plataforma rediseñados vía una regla CSS global (`input[type='checkbox']`
  en `App.css`, sin componente nuevo) — caja redondeada con `appearance: none`, fill `brand-blue` +
  check blanco al marcar, más grande y notorio que el checkbox nativo del navegador.
- Bug real encontrado al construir el punto anterior: abrir el `Popover` de `FieldCatalogMenu` desde
  dentro de un `Modal` y presionar Escape cerraba los dos a la vez, no solo el popover.
  `Modal.tsx`/`Popover.tsx` escuchan `keydown` en el mismo target (`document`) y el `Modal` se
  registra primero (monta antes de que el popover exista) — `stopPropagation()` no alcanza para
  frenar un listener hermano en el mismo target ni corrige el orden de registro. Arreglado en
  `Popover.tsx` registrando su listener con `{ capture: true }` (corre antes de cualquier listener
  en fase de bubble sin importar el orden de registro) + `stopImmediatePropagation()`. Afecta a
  cualquier combinación Popover-dentro-de-Modal existente, no solo a Payroll.

Distinto del "Módulo Payments" de Tier 4 — Payments es facturarle a los *Clients* del tenant
(cuentas por cobrar), Payroll es pagarle a los *Employees* (cuentas por pagar).

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
- [x] **Hacer aceptar Términos de Servicio y Política de Privacidad al registrarse** — **encontrado ya implementado 2026-07-31** al cruzar este checklist contra el código real (el ítem había quedado sin tachar). Checkbox obligatorio en `RegisterPage.tsx` y `AcceptInvitePage.tsx`; `authService.ts`/`tenantService.ts` rechazan el registro si `acceptedTerms !== true` (`field: 'acceptedTerms'`); `User.acceptedTermsAt: DateTime?` en el schema guarda cuándo se aceptó.
- [x] **Gap `hourlyRateCents`/`monthlyRateCents` sin relacionar** — **encontrado ya implementado 2026-07-31** (idem arriba). `Employee.contractType`/`Employee.compensationType` (enums `ContractType`/`CompensationType`) ya existen en el schema y se editan desde el panel de detalle (`EmployeeOverviewPanel.tsx`, grupo "Contract & compensation"). Las 2 preguntas abiertas del ítem original también quedaron resueltas en el código: (1) visibilidad — `contractType`/`compensationType` **no** están en `COMPENSATION_FIELDS` (`employeeService.ts`), o sea son visibles para cualquier `view_hr`, solo los montos en sí quedan owner-only; (2) moneda — se resolvió a nivel tenant, no por-empleado (`Tenant.currency`, default `"USD"`, comentario explícito en el schema "applies to Employee.hourlyRateCents/monthlyRateCents"), no como campo nuevo en `Employee`.
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
  4. [x] Import por CSV — **parcialmente implementado, confirmado 2026-08-06 al cruzar contra el código real**: `csvService.ts` tiene `importEmployeesFromCsv`/`importClientsFromCsv`, pero solo Employees tiene un punto de entrada real en el frontend (`CsvImportExportMenu` en `EmployeesPage.tsx`, con template descargable) — la función de Clients quedó huérfana (sin UI) desde que se borró la página de Clients del frontend (rediseño de Clients, 2026-07-29/30). El alcance ampliado que pedía el usuario ("casi todo" debería poder importarse, incluyendo Payments a futuro) **no** está resuelto — sigue siendo Employees únicamente, no una capacidad genérica reusable por entidad. Dejar este ítem en la cola si se quiere extender a Companies/Contacts/Opportunities.
  5. [x] Export de empleados/clientes a CSV — **implementado, confirmado 2026-08-06**: `exportEmployeesToCsv`/`exportClientsToCsv` en `csvService.ts`, con el mismo `CsvImportExportMenu` de arriba como punto de entrada. Mismo matiz que el import: solo Employees tiene botón real en la UI hoy — `exportClientsToCsv` existe pero está huérfana por la misma razón (página de Clients borrada).
  6. [x] "What's new" / changelog visible en la app — implementado 2026-07-23, popover como pedía el backlog original (no página, a diferencia de Help/FAQ — acá sí tiene sentido un popover chico y rápido de escanear). Ícono nuevo (`BellIcon`, agregado a `Icons.tsx`) en `TopBar.tsx`, con un punto azul de "no leído" cuando hay entradas más nuevas que la última vista (`localStorage`, guarda el id de la entrada más reciente vista). Contenido **estático**, igual criterio que Help/FAQ — array hardcodeado en `frontend/src/lib/changelog.ts` (`CHANGELOG_ENTRIES`, más nueva primero), sin CMS. 8 entradas reales escritas en lenguaje de usuario (no mensajes de commit) resumiendo los cambios visibles más recientes de la semana — columnas de tabla, checklist de onboarding, campos nuevos de Employee, rediseño de tablas, Views/Kanban, Public Forms, Settings unificado, Time Off. Verificado con Playwright: punto de "no leído" visible en la primera carga, desaparece al abrir el popover, se mantiene ausente después de recargar (persistencia real, no solo de sesión).
  7. [x] Canal de feedback/reporte de bugs para testers — implementado 2026-07-21 (Bloque 3). `POST /api/feedback` (autenticado, cualquier rol) manda a `FEEDBACK_EMAIL` (confirmado por el usuario: `info@joinnorthstack.com`, ⚠️ **falta cargarlo como env var en Vercel producción** — solo está en el `.env` local por ahora). Frontend: item "Send feedback" en el dropdown de `TopBar.tsx`, abre un `SlideOver` con textarea, confirma con toast. A diferencia del resto de los envíos de email de este bloque, **no** es best-effort — si el envío falla, la request devuelve error real (el feedback en sí es el punto del request, no un efecto secundario).
- [ ] **Idea (backlog, anotada por el usuario 2026-07-21, sin detalle ni empezar):** ícono de notificaciones in-app (campana con contador, dropdown de notificaciones recientes) — distinto del canal de *email* ya anotado arriba: esto es un canal adicional, dentro de la propia app, para eventos como "CSV importado", "export finalizado", además de los eventos accionables de Time Off/Public Forms ya cubiertos por email. Conceptualmente se solapa con las otras 3 ideas de "avisar que pasó algo" ya anotadas (email, Slack, webhooks salientes) — al spec-earlo, conviene diseñar un solo modelo de "evento" del lado del backend y que cada canal (in-app, email, Slack, webhook) sea solo una forma distinta de entregarlo, en vez de 4 implementaciones sueltas que hacen lo mismo cada una a su manera.
- [ ] **Idea (backlog, anotada 2026-07-21, sin empezar):** más control sobre la página de agradecimiento de Public Forms — hoy solo el texto del párrafo es personalizable (`Form.thankYouMessage`), el resto de `PublicFormPage.tsx` en el estado `submitted` (heading "Thank you!", layout, estilo) queda fijo. Candidatos a agregar, sin definir alcance todavía: heading personalizable, redirect a una URL propia del tenant en vez de mostrar el mensaje adentro de Northstack, imagen/logo del tenant en esa pantalla (branding del tenant en la página pública en general está descartado a propósito — a reconciliar si se retoma esto).

### Base de datos

- [ ] Historial de valores previos de custom fields (con retención por tiempo) — evaluado, pospuesto a propósito por ahora

### Backend

- [ ] **Implementar API pública con token para integraciones externas** — agrupado con el Panel de Integraciones para priorización (misma sección "Producto/Planificación" más arriba): es el mecanismo *entrante* (un sistema externo consulta a Northstack), contraparte de los webhooks salientes ya anotados ahí. Sin spec técnico todavía.
- [x] **Fix de patrón N+1 en `scripts/metrics-report.ts`** — **resuelto 2026-07-31**, exactamente como estaba especificado (`groupBy` por tenant en vez de un `count()` por tenant, para `user`/`employee`/`client`). `groupBy` omite tenants con 0 filas, así que se agregó `countsByTenant()` para rellenar esos en 0 y no alterar avg/median/max. Corrido contra la DB real: mismo shape de output que antes, sin errores.

### Frontend

- [ ] Revisar el frontend end-to-end en navegador (pendiente que el usuario lo haga — no tengo forma de ver la UI)
- [ ] **Idea (backlog, anotada por el usuario 2026-07-20, sin detalle ni empezar):** edición inline en la tabla de Employees — cada celda de cada fila editable directamente sin abrir el SlideOver de edición, excepto `email` y nombre (`firstName`/`lastName`), que quedan de solo lectura en la tabla. Aplicaría a `department`, `statusId`, `managerId`, y los custom fields ya embebidos en la tabla. A definir: patrón de edición (click-to-edit por celda vs. una fila entera en modo edición a la vez), qué pasa con el guardado (autosave por campo vs. confirmar), y si Clients recibe el mismo tratamiento por consistencia.
- [x] **Filtro de columnas visibles en las tablas** — **encontrado ya implementado 2026-07-31** al cruzar este checklist contra el código real (el ítem había quedado sin tachar). `ColumnVisibilityMenu.tsx` + hook `useColumnVisibility` (persistido en `localStorage`, por dispositivo) ya están en uso en `EmployeesPage.tsx`, `ContactsPage.tsx` y `CompaniesPage.tsx`, junto al control de Filter en `.page-toolbar`.

### UX / Interfaz

Hallazgos de `docs/ux-ui-audit.md` + decisiones tomadas en las sesiones de mockup interactivo (Artifacts "Northstack — Propuesta de mejora UX/UI" y "Northstack — Rediseño de interfaz"). Landing excluida a propósito — se retoma aparte, todavía no pasó de mockup inicial. Ver [`ux-ui-brief.md`](ux-ui-brief.md) para el estado consolidado actual.

- [x] **Replicar a Company Users el bloque visual de tablas ClickUp** (ghost row, scrollbar propia, hover completo, tipografía compacta) — **resuelto 2026-07-31**: `.full-table`/hover/tipografía ya venían del rediseño 2026-07-22 (ver más abajo); lo que faltaba de verdad era la ghost row de "Invite" al final de la tabla y la `HorizontalScrollbar` propia, ambas agregadas replicando el patrón exacto de `EmployeesPage.tsx`. **Nota 2026-07-30**: el ítem original también mencionaba "Clients", que ya no aplica (página eliminada, ver "Legado" en `features-overview.md`) — Companies/Contacts en cambio ya tienen su propio panel de detalle (más reciente y distinto de este patrón, ver Checkpoint F en `docs/tareas/semana-2026-07-29.md`).
  - **"Overview panel de usuario" — separado de este ítem, queda en backlog sin resolver:** Company Users no tiene panel de detalle hoy (toda la edición es inline en la fila — rol vía `<select>`, activar/desactivar vía ícono). Agregar uno para una entidad tan chica (nombre, email, rol, status, todo ya editable en la tabla) es una decisión de producto, no una réplica mecánica de patrón — ¿qué mostraría que la tabla no muestre ya? A confirmar con el usuario antes de construirlo.

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
  - [x] **[MEDIO]** CORS abierto a cualquier origen — **resuelto 2026-07-31**. `app.use(cors())` reemplazado por un allowlist explícito (`app.joinnorthstack.com`, `staging.joinnorthstack.com`, `localhost:*` para dev) en `src/app.ts`, decidido por request en vez de un array estático para poder mantener la excepción deliberada: `/api/public/:tenantSlug/:formSlug*` (`routes/public.ts`, backend del Form público en `/apply/...`) queda abierto a cualquier origen a propósito — el comentario original de `cors()` ya documentaba esa necesidad, no se tocó. Verificado con `curl -X OPTIONS` contra los 2 casos (origen conocido → permitido, origen arbitrario → bloqueado en rutas autenticadas pero permitido en `/api/public/*`) más `npm test` (7/7) y `tsc` en verde.
  - [ ] **[BAJO]** `role` arbitrario aceptado en `POST /api/auth/register`, `zod` instalado sin usar — no incluidos en el brief de esta semana. (La parte de `statusId` no validado contra tenant al actualizar sí se resolvió, de paso, dentro del fix de 1.1 de arriba.)

## Notas de avance

- **Proceso de deploy — obligatorio desde el 2026-07-27 (confirmado por el usuario 2026-07-24):** ambiente de staging armado y verificado (`staging.joinnorthstack.com`, branch de Neon separada, Turnstile con claves de test de Cloudflare, Zoho compartido con producción). Regla acordada: **todo cambio de código** (backend/frontend/schema) pasa primero por `staging` (`git push origin main:staging`, verificar, recién ahí `git push origin main`) — sin excepciones una vez que arranque. **Los cambios que solo tocan `docs/*.md` van directo a `main`**, sin pasar por staging, porque no hay nada que deployar/testear ahí (no se renderizan en ningún lado de la app). Recordatorio operativo, **corregido 2026-07-31 para ser explícitamente bidireccional** (la versión
anterior de esta regla solo cubría un sentido y el riesgo se concretó en el sentido contrario — ver
incidente abajo): la branch de Neon `staging` es una foto tomada en el momento de crearla —
**cualquier `prisma db push`, corrido contra cualquiera de las dos bases, tiene que correrse también
contra la otra en la misma sesión de trabajo**, no asumir que "ya lo hice en la otra" sin confirmarlo
explícitamente. Dos incidentes reales hasta ahora, uno por cada sentido: (1) 2026-07-23, "Can't reach
database server" — resuelto sin relación al schema, pero ya dejó anotado el riesgo como latente; (2)
**2026-07-31 — riesgo concretado de verdad:** al construir el módulo de Tasks/Notes se corrió
`prisma db push` contra `staging` pero nunca contra producción; las tablas `Task`/`Note` no existían
ahí, rompiendo silenciosamente (500) `/api/tasks/*` y `/api/notes` desde el primer deploy del CRM
completo hasta que un usuario lo notó y se diagnosticó/corrigió el 2026-07-31 (detalle completo en
`docs/tareas/semana-2026-07-29.md`). Checklist mental para cualquier `db push` de acá en adelante:
¿corrí esto contra staging? ¿contra producción? ¿contra las dos, en la misma sesión, no "después"?
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
  rediseñados. Las Tareas 1-9 de `docs/tareas-ux-ui.md` están 100% completas (nota del 2026-07-31 más
  arriba) — el "10/11" que quedaba abierto acá era vago sin decir cuál; **confirmado 2026-08-06,
  sigue sin construir**: el FAB de acción primaria en mobile (`design-system.md` §13, Tarea 9c) —
  bloqueado en que `AppLayout.tsx` no tiene hoy un mecanismo de "acción primaria por página" que el
  FAB pueda invocar (cada página maneja su propio `handleOpenAdd` suelto).
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
