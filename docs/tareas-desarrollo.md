# Tareas de desarrollo

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-16 (rebrand de Settings cargado como 4 tareas separadas en `### UX / Interfaz`, sin empezar; Vistas guardadas — Views/Filtros/Kanban — implementadas completas; las "Notas de avance" fechadas se movieron a `docs/tareas/`, un archivo por semana, para que este archivo no siga creciendo sin límite)

## Checklist general

Organizado por tipo. Los ítems que tocan más de una capa quedan bajo la capa donde está el trabajo principal, con una nota de qué más tocaron.

### Producto / Planificación / Setup

- [x] Definir la visión general del proyecto
- [x] Definir el enfoque modular y multi-tenant
- [x] Definir el alcance inicial centrado en HR
- [x] Definir la estrategia de autenticación inicial y futura integración con Google/Microsoft
- [x] Crear el archivo de contexto de desarrollo
- [x] Definir el MVP del módulo HR
- [x] Crear guía de ejecución de pruebas en `docs/run-tests.md`
- [x] Crear repositorio en GitHub y hacer push de la rama main
- [x] Deploy online en Vercel (frontend + backend serverless en un solo proyecto): https://northstack-two.vercel.app
- [x] Auto-deploy en cada push a `main` — el connect nativo de Vercel (GitHub App) siguió fallando vía CLI (necesita autorización OAuth por dashboard); se resolvió con un workflow de GitHub Actions (`.github/workflows/deploy.yml`) que corre `vercel deploy --prod` en cada push, usando el secret `VERCEL_TOKEN` del repo
- [x] Dominio propio: comprado `joinnorthstack.com` (Cloudflare Registrar), conectado como `app.joinnorthstack.com` al proyecto de Vercel, con SSL automático (Let's Encrypt vía Vercel, sin configuración manual). La raíz `joinnorthstack.com` quedó agregada al proyecto pero sin registro DNS cargado todavía — libre para usarse como landing page a futuro si se quiere
- [ ] Preparar el proyecto para una beta interna
- [x] **Overview / pantalla de inicio**: idea que había quedado anotada sin detalle ("detallaremos más adelante") se resolvió el 2026-07-14 al construir la pieza 6 de PTO (calendario) — el usuario pidió que el calendario apareciera "dentro del overview como main page". `OverviewPage.tsx` (`/overview`) es ahora la pantalla a la que cae el usuario al loguearse/registrarse/aceptar una invitación, con el calendario de PTO como primer contenido — ítem propio en el sidebar, arriba del grupo Human Resources. Queda abierta la posibilidad de sumarle más contenido a futuro (no solo PTO), pero el hueco de "no hay landing post-login unificado" ya está resuelto
- [ ] **Admin panel para usuario main (el dueño de la plataforma, no un owner de tenant)**: sin empezar. Distinto de "Company Settings" (que es por tenant, para sus propios admins) — esto es una vista a nivel plataforma para visualizar todos los tenants/clientes activos de Northstack. Confirmado por el usuario: necesita un sistema de roles **totalmente separado** del actual (owner/admin/member son todos por-tenant, ninguno da visibilidad cross-tenant) — un rol de plataforma general, no una extensión de los roles existentes. Las métricas por cliente (cantidad de usuarios, actividad, etc.) quedan para más adelante, no son necesarias en una primera versión — anotado para tenerlo en cuenta cuando se diseñe
- [x] **Landing page de engagement**: página estática (`landing/index.html`) publicada en la raíz `joinnorthstack.com`, con secciones "Qué es Northstack", "Soluciones" (HR y Clients disponibles, Payments próximamente) y "Sobre mí". A pedido explícito del usuario, **sin** botones de Sign up/Log in por ahora — eso queda para cuando la beta esté en producción. Deployada como proyecto de Vercel separado (`northstack-landing`, distinto de `northstack`) para no mezclar la landing (estática, sin backend) con la app real — el dominio raíz se movió del proyecto de la app a este nuevo proyecto. Auto-deploy agregado al mismo workflow de GitHub Actions (`deploy-landing`, job nuevo en `.github/workflows/deploy.yml`, corre `vercel deploy` con `working-directory: landing`)
- [x] **Legal: Términos de Servicio y Política de Privacidad**: el usuario agregó `docs/legal/terms-of-service.md` y `docs/legal/privacy-policy.md` (redactados en una sesión anterior, con nota interna explícita marcando que no fueron revisados por un abogado — se le preguntó al usuario cómo proceder y confirmó publicar igual, asumiendo el riesgo). Se completó el placeholder `[Effective Date]` en ambos (13 de julio de 2026) y se armaron `landing/terms.html` y `landing/privacy.html` (conversión manual a HTML, sin el bloque de nota interna que el propio documento pedía no publicar), enlazados desde el footer de la landing. **Ojo:** el contenido referencia `info@joinnorthstack.com` como email de contacto — esa casilla no está confirmada como una de las 3 creadas en Zoho (solo se verificó `no.reply@`), falta confirmar que exista de verdad
- [ ] **Hacer aceptar Términos de Servicio y Política de Privacidad al registrarse**: sin empezar, a pedido del usuario. Hoy `POST /api/tenants/register`/`POST /api/auth/register` no piden ni registran ninguna aceptación. Necesita: checkbox obligatorio en los forms de registro (`RegisterPage.tsx`, `AcceptInvitePage.tsx`), y guardar en el backend que se aceptó (con qué versión/fecha de los documentos, para poder probarlo después si hace falta) — probablemente un campo en `User` o una tabla aparte si se quiere trackear versiones a futuro
- [ ] **Idea (backlog, anotada por el usuario 2026-07-14, sin detalle ni empezar):** verificación de email por OTP al crear una cuenta. Hoy `POST /api/auth/register` y `POST /api/tenants/register` crean el usuario y lo dejan activo/logueado sin confirmar que el email sea real o le pertenezca — cualquiera puede registrarse con un email ajeno. La infraestructura de email ya existe (`src/lib/mailer.ts`, Zoho SMTP, ya usada para invitaciones), así que el envío en sí no sería trabajo nuevo — falta diseñar: dónde se genera/guarda el código (¿tabla nueva, o reusar el patrón de `Invitation` con un token de un solo uso?), tiempo de expiración, qué pasa con la cuenta mientras no está verificada (¿puede usar la app en modo limitado, o queda bloqueada hasta verificar?), y si aplica también al aceptar una invitación (`AcceptInvitePage.tsx`) o solo al registro directo.
  - **Relacionado, mismo ítem porque comparte la base técnica**: 2FA por email en el login. A diferencia del OTP de registro (que verifica el email una sola vez, al crear la cuenta), esto se dispararía en **cada login** (o al menos en dispositivos nuevos) — después de validar usuario/contraseña, el backend no entrega la sesión todavía, manda un código por email, y recién la crea cuando el usuario lo confirma (`POST /api/auth/verify-2fa` o similar). Mismo mecanismo de generar/mandar/validar un código de un solo uso que el OTP de registro, así que conviene diseñarlos juntos aunque resuelvan problemas distintos (confirmar que el email es real vs. proteger el login aunque roben la contraseña).
- [ ] **Idea (backlog, anotada por el usuario 2026-07-14, sin detalle ni empezar):** soporte de idiomas (i18n) en la app. Todavía no se definió el alcance (¿selector de idioma para el usuario, o fijar un idioma por tenant/región? ¿cuáles idiomas además del actual?) — el usuario dijo explícitamente que todavía hay que pensar cómo proceder. Relacionado con un hallazgo ya anotado en `docs/ux-ui-audit.md` (UX-02): hoy la landing está en español y la app entera en inglés, inconsistencia que un visitante nota justo en el momento de conversión — probablemente informe la primera decisión de alcance (¿arrancar agregando español a la app, o un sistema de i18n más genérico desde el principio?).
- [ ] **Tema a seguir discutiendo (sin decidir todavía):** sistema de cobro de suscripciones del propio SaaS (módulo Payments). Alcance internacional. Evaluado hasta ahora: Stripe directo requeriría una LLC/entidad en EEUU porque Stripe no da cuentas directas en Argentina (a confirmar con un contador/abogado, no es consejo legal); como alternativa sin necesidad de entidad en EEUU, Paddle actúa como "merchant of record" (factura y cobra en tu nombre, maneja IVA/impuestos internacionales) a cambio de mayor comisión (~5% + USD 0.50 por transacción, a confirmar en su web) — evaluado como la opción de referencia por ahora. Se mencionó Whop como alternativa pero con menos certeza sobre si maneja impuestos internacionales igual de bien, y menos track record para SaaS B2B. Falta definir: planes/precios, si hay trial gratis, y qué pasa con el tenant si falla el pago o cancela (bloqueo total vs solo-lectura vs período de gracia)
- [ ] **Idea (backlog, anotada por el usuario, sin detalle ni empezar):** sistema de logs por usuario — cuándo loguea, y qué movimientos/modificaciones realiza dentro del sistema (auditoría)
- [ ] **Idea (backlog, anotada por el usuario, sin detalle ni empezar):** sistema de roles custom (hoy los roles son fijos: owner/admin/member, con permisos hardcodeados en `permissionService.ts` — relacionado con la discusión de owners que quedó pendiente de evaluar)
- [x] **Sistema de PTO y vacaciones en HR** — discutido en detalle con el usuario (2026-07-14); construido pieza por pieza a pedido explícito ("arranca con eso nomás"), las 7 piezas completadas el mismo día:
  1. [x] **Jerarquía organizacional**: campo nuevo en `Employee` tipo "reporta a" — relación auto-referencial (un empleado apunta a otro empleado como su manager). Implementado 2026-07-14, ver nota de avance.
  2. [x] **Motor de políticas de PTO configurables por tenant**: el admin/owner diseña sus propias políticas — cuántos días, cómo se acumulan, qué tipos de ausencia existen (ej. "PTO", "Leave Emergency", lo que definan). Mismo espíritu que el catálogo de `StatusDefinition` que ya se construyó — no hardcodear tipos fijos. Implementado 2026-07-14, ver nota de avance.
  3. [x] **Asignación de políticas por usuario específico**: una política no es necesariamente tenant-wide/default para todos — tiene que poderse asignar a empleados puntuales (ej. distinta cantidad de días según antigüedad o tipo de empleado). Implementado 2026-07-14, ver nota de avance.
  4. [x] **Solicitud + aprobación con enrutamiento por jerarquía**: el empleado pide días, y aprueba quien corresponda según el campo "reporta a" (no necesariamente el owner/admin del tenant directamente). Implementado 2026-07-14, ver nota de avance.
  5. [x] **Balance de días** disponibles/usados por empleado, calculado según la política que le corresponda. Implementado 2026-07-14, ver nota de avance.
  6. [x] **Calendario tenant-wide**: vista de todos los usuarios con solicitudes aprobadas (y pending, agregado a pedido del usuario) y las fechas en las que no van a estar disponibles. Implementado 2026-07-14, ver nota de avance.
  7. [x] **Tag visual en la fila del empleado** (no toca el `status` del catálogo de Statuses — el usuario fue explícito: sigue siendo un trabajador activo, solo que de vacaciones) — una etiqueta que muestra el tipo de ausencia activa según la política. Implementado 2026-07-14, ver nota de avance.
- [ ] Implementar formularios públicos para alta de personas (backend + frontend, sin empezar)

### Base de datos

- [x] Definir el modelo de datos base para tenants, usuarios y empleados
- [x] Configurar Prisma con esquema PostgreSQL compatible con Neon
- [x] Verificar `.env` con Neon `DATABASE_URL`
- [x] Crear una tabla de prueba en Neon para validar la conexión (luego eliminada, ver abajo)
- [x] Corregir `Employee.email` para que sea único por tenant (antes único global, bug de diseño multi-tenant)
- [x] Hacer `tenantId` obligatorio en Employee/Client/CustomFieldDefinition
- [x] Agregar `Tenant.status` (active/suspended/cancelled) y `User.status` (active/inactive)
- [x] Agregar `CustomFieldDefinition.isActive`
- [x] Eliminar tabla `TestRun` (leftover de la validación de conexión a Neon)
- [x] Rediseñar `CustomFieldValue` de FKs por módulo (`employeeId`/`clientId`) a modelo genérico (`tenantId` + `entityType` + `entityId`) — evita agregar una columna nueva cada vez que se sume un módulo (ej. Payments)
- [x] Agregar `FieldType.email`
- [x] Agregar `Employee.userId` (opcional, único) y `Invitation.employeeId` (opcional) — vínculo Employee ↔ User
- [x] Agregar `CustomFieldDefinition.required`
- [x] Catálogo de status configurable por tenant, distinto por módulo (Employee/Client, y extensible a futuros módulos) + historial de cambios de status. Nuevos modelos `StatusDefinition` (tenant, entityType, name, color, order, isDefault, isActive) y `StatusHistoryEntry` (snapshot de nombre — no FK viva — para que un status renombrado no reescriba el historial). `Employee.status`/`Client.status` (enums fijos) reemplazados por `statusId` (FK obligatoria a `StatusDefinition`). Historial se graba automático en cada cambio; **la pantalla para verlo queda pendiente** (a pedido del usuario, solo se grabó en esta ronda). Nueva categoría "Statuses" en `/settings` (el hub de abajo a la izquierda, junto a Custom Fields), con reordenar/marcar default/activar-desactivar
- [ ] **Idea (backlog, anotada por el usuario, sin empezar):** aplicarle a `Employee.department` el mismo tratamiento que a los status — hoy `department` es texto libre sin catálogo. Sería un modelo `DepartmentDefinition` por tenant (mismo patrón que `StatusDefinition`: name, order, isActive, quizás sin `isDefault` si no aplica), con su propia categoría en `/settings`, reemplazando el campo de texto libre por un `departmentId` (FK). A definir si también necesita historial de cambios como los status, o si con el catálogo alcanza
- [ ] Historial de valores previos de custom fields (con retención por tiempo) — evaluado, pospuesto a propósito por ahora

### Backend

- [x] Crear la estructura base del proyecto (TypeScript + Express + Vitest)
- [x] Implementar un primer servicio de HR inicial
- [x] Implementar pruebas iniciales del módulo HR
- [x] Definir la estructura modular del backend
- [x] Definir los endpoints de API iniciales para HR
- [x] Implementar autenticación básica por usuario y contraseña
- [x] Implementar tenant registration y owner onboarding
- [x] Implementar custom fields básicos (definiciones + valores)
- [x] Implementar módulo de clients (CRUD + custom fields)
- [x] Eliminar código muerto (`createTenantWithOwner`) que rompía el build
- [x] Implementar modelo `Invitation` + flujo de invitación (crear invitación / aceptar por token, sin envío de email)
- [x] Eliminar `POST /api/tenants/join` (dejaba unirse a cualquier tenant sabiendo el `tenantId`, sin invitación)
- [x] Unificar registro en un solo paso: `POST /api/tenants/register` crea Tenant + owner User + Session juntos (evita usuarios huérfanos sin tenant)
- [x] Paridad CRUD para Employees: `PATCH`/`GET`/`DELETE /api/hr/employees/:employeeId` (+ frontend: editar/borrar en el Dashboard)
- [x] `listEmployees` devuelve los valores de custom fields embebidos, sin N+1 (+ frontend: columnas en la tabla)
- [x] Endpoint `PATCH` para actualizar valores de custom fields sin duplicar (+ frontend: precarga en "Edit")
- [x] Verificar que el custom field pertenezca al módulo correcto (employee/client) antes de crear/actualizar un valor
- [x] Endpoint `DELETE` para borrar de verdad un valor de custom field cuando se vacía (+ frontend: lógica en "Edit")
- [x] Validar el valor de un custom field según su `fieldType` (number/date/email/select)
- [x] Endpoint `PATCH /api/hr/custom-fields/:definitionId` para activar/desactivar custom fields (+ frontend: Settings)
- [x] Endpoint `POST /api/hr/employees/:employeeId/invite`
- [x] `acceptInvitation` linkea `Employee.userId` al usuario aceptado, si la invitación estaba ligada a un empleado
- [x] `GET /api/invitations/:token` (público, sin auth) — devuelve email/rol/status/expiración de una invitación por token, para precargar y bloquear el campo email en `AcceptInvitePage.tsx`
- [x] `PATCH /api/users/me` (nombre/teléfono propios) y `PATCH /api/users/me/password` (cambio de contraseña, valida la actual)
- [x] `GET /api/tenants/users`, `PATCH /api/tenants/users/:userId` (rol/status, con guardrails: no podés tocar tu propia fila acá, y solo un owner puede tocar el rol `owner`), `GET /api/tenants/invitations`, `DELETE /api/tenants/invitations/:invitationId`
- [x] Transferencia de ownership atómica: asignar el rol `owner` a alguien degrada al owner actual a `admin` en la misma transacción de Prisma — nunca hay 0 ni 2+ owners. Confirmado que admin puede editar libremente el rol de members y de otros admins (ya funcionaba, solo faltaba verificar)
- [x] `listClients` devuelve los valores de custom fields embebidos, igual que `listEmployees` (+ frontend: columnas en la tabla). Endpoints `PATCH`/`DELETE /api/clients/:clientId/custom-fields/:valueId` (no existían — Clients solo tenía `POST`/`GET`), mismo patrón de verificación de tenant + módulo que Employees
- [x] `GET/POST /api/status-definitions`, `PATCH /api/status-definitions/:id` — CRUD del catálogo de status por tenant+módulo, con guardrail (no se puede desactivar el status marcado como default sin asignar otro default antes)
- [ ] Implementar API pública con token para integraciones externas
- [x] Envío de invitaciones por email — resuelto sin ESP dedicado (Resend/SendGrid), vía dominio propio + Zoho Mail + `nodemailer`. Dominio `joinnorthstack.com` (Cloudflare Registrar) con `app.joinnorthstack.com` conectado a Vercel (SSL automático). Zoho Mail (plan Free) con la casilla `no.reply@joinnorthstack.com`, DNS configurado (MX x3, SPF, DKIM). `src/lib/mailer.ts` nuevo: transport SMTP de Zoho (`smtp.zoho.com:465`), función `sendInvitationEmail` con texto plano + HTML. Conectado dentro de `createInvitation` (cubre tanto la invitación genérica de tenant como la de `POST /api/hr/employees/:employeeId/invite`, que ya la usaba por debajo) — envío "best effort": si falla, no rompe la creación de la invitación (el link para copiar a mano sigue funcionando como respaldo). Nuevo env var `APP_BASE_URL` (para armar el link del email; distinto en local vs producción) además de `ZOHO_SMTP_USER`/`ZOHO_SMTP_PASSWORD`. Probado en real: invitación mandada a una inbox de Gmail real, llegó a la bandeja principal (no spam) al primer intento — buena señal de que SPF/DKIM quedaron bien configurados
- [ ] **A conversar (backlog, sin detalle todavía):** el validador de "empresa ya existe" en la creación de perfil (`registerTenantWithOwner`, compara por `slug` en `tenantService.ts`) está mal, según el usuario — pendiente de discutir el enfoque correcto antes de tocarlo.
- [x] El backend crasheaba por completo si un handler async tiraba una excepción no atrapada (ej. Neon/Prisma cortando la conexión) — resuelto con catch-all + retry, ver nota de avance

### Frontend

- [x] Implementar frontend inicial (Vite + React: login, registro, creación de tenant, dashboard)
- [x] Eliminar `CreateTenantPage.tsx` y `api.createTenant` (código muerto, apuntaban a una ruta que nunca existió)
- [x] Arreglar formulario de Register (pedía datos que el backend ignoraba, y no pedía `phone`, que es obligatorio)
- [x] Reemplazar `alert()` del navegador por mensajes de error inline (en rojo, junto al campo correspondiente cuando aplica)
- [x] Barra de búsqueda en Employees (filtra por nombre, email o departamento)
- [x] UI de custom fields para Employees: sección "Manage Custom Fields" (crear campo: texto/número/fecha/email/select, marcar como requerido) + inputs dinámicos en alta/edición
- [x] Nueva pestaña "Settings" (solo owner/admin) con selector de módulo (Employees/Clients) para gestionar custom fields centralizadamente
- [x] Botón "Invite" por empleado (solo owner/admin): copia el link de invitación al portapapeles
- [x] Pantalla "Accept Invite" (`AcceptInvitePage.tsx`) — registro o login + aceptar
- [x] Sistema de estilos con Tailwind CSS v4 (`@tailwindcss/vite`), theme basado en la paleta de marca real (navy `#0d2a48`, azul medio `#3c6da1`, azul claro `#8dbada`, crema `#fdfcf8`), tipografía Inter
- [x] Logo y favicon reales del paquete de marca (`assets/`) aplicados en headers y `<head>`
- [x] Agregar `react-router-dom` — URLs reales en vez de `state` a mano, habilita botón atrás, links compartibles/refrescables, y trazabilidad de navegación a futuro
- [x] Migrar el link de invitación de query param (`?invite=token`) a ruta real (`/accept-invite/:token`)
- [x] Bug: refrescar la página (F5) en cualquier ruta autenticada mandaba a `/overview` en vez de quedarse en la página actual — carrera de estado en `App.tsx`/`AppLayout.tsx`. Implementado 2026-07-16, ver nota de avance.
- [x] Rediseño de navegación: sidebar izquierda con grupos **Human Resources** (Dashboard, Employees) y **Clients** (Dashboard, Clients) + ícono de Settings pineado abajo (solo owner/admin)
- [x] Barra superior: logo + menú de usuario (ícono de perfil + nombre, click no hover) con **Profile** (todos), **Settings** (solo admin) y **Logout**
- [x] Settings pasa a ser su propia sección; Profile quedó fuera, como ruta propia (`/profile`), por ser personal y no administrativa. (Superado más adelante: ver ítem de separación total de Company/Custom Fields más abajo — ya no es una sub-navegación compartida)
- [x] `DashboardPage.tsx` (monolítico) dividido en `EmployeesPage`, `ClientsPage`, `CustomFieldsSettingsPage`, más placeholders `HrDashboardPage`/`ClientsDashboardPage`/`ProfileSettingsPage`/`CompanySettingsPage`
- [x] Sidebar colapsable: ancho angosto (192px) ajustado al contenido cuando expandido, solo íconos (56px) cuando colapsado, con botón de toggle y transición suave
- [x] Sistema de dark mode (Tailwind `dark:` con `@custom-variant`, toggle System/Light/Dark en Company Settings, preferencia guardada en `localStorage` del navegador)
- [x] Separar del todo Company de Custom Fields (3 rondas hasta asentarse): tabs compartidas → separación total sin sub-nav (sobre-corregido) → diseño final: **2 hubs independientes, cada uno con su propia sub-navegación interna, sin ningún link cruzado entre ellos.** `/company` (TopBar → "Company Settings"): nav lateral con Appearance / Users / Invitations, cada categoría en su propia página. `/settings` (gear del sidebar → "Settings"): nav lateral con Custom Fields (única categoría hoy, armado para sumar más — ej. configuración de formularios — sin tener que rehacer la estructura)
- [ ] Revisar el frontend end-to-end en navegador (pendiente que el usuario lo haga — no tengo forma de ver la UI)
- [ ] **Responsive para celular y tablet**: detectado por el usuario, sin empezar. La app (`frontend/`) no tiene ningún tratamiento responsive hoy — sidebar fijo (192px/56px colapsado) + topbar + contenido no se adaptan a pantallas chicas, las tablas no scrollean horizontal, y los forms/cards no se reacomodan. La landing (`landing/`) sí tiene un mínimo (`@media (max-width: 640px)` solo para tamaños de fuente del hero) pero tampoco está pensada para mobile en serio. Alcance a definir: ¿sidebar colapsa a menú hamburguesa en mobile?, ¿tablas se vuelven cards apiladas o mantienen scroll horizontal?
- [x] Fase 2: funcionalidad real de "Profile" (editar nombre/teléfono propios + cambiar contraseña) y "Company/Users" (ver usuarios del tenant, cambiar rol/status, ver y cancelar invitaciones pendientes, invitar gente nueva sin depender de un Employee)
- [x] `ProfileSettingsPage.tsx` real: editar nombre/teléfono, cambiar contraseña (pide la actual)
- [x] `CompanySettingsPage.tsx` real: tabla de usuarios del tenant (rol/status editables, con guardas visuales — no podés editarte a vos mismo desde ahí), tabla de invitaciones pendientes con cancelar, formulario para invitar gente nueva directo (sin depender de un Employee existente)
- [x] UI de custom fields para Clients: inputs dinámicos en alta/edición y columnas en la tabla, mismo patrón que Employees
- [x] Barra de búsqueda en Clients (por nombre, email o empresa, client-side, igual que Employees)
- [x] UI de editar Client en el Dashboard (formulario inline con status, igual patrón que Employees)
- [x] `StatusesSettingsPage.tsx` (categoría "Statuses" en `/settings`, junto a Custom Fields): selector de módulo, lista con reordenar (↑/↓), marcar default, activar/desactivar, y form para agregar status nuevo (nombre + color). Los `<select>` de status en `EmployeesPage.tsx`/`ClientsPage.tsx` dejaron de tener opciones hardcodeadas — ahora cargan la lista real del tenant vía `/api/status-definitions`
- [x] `api.ts`: nuevo `apiFetch` interno que atrapa el error de red que tira `fetch()` cuando el backend está inalcanzable (antes ese error se colaba crudo como "Failed to fetch"), y lo convierte en un `ApiError` con mensaje legible. Los 32 call sites de `fetch(` pasaron a usar este wrapper
- [x] `frontend/tsconfig.json` no tenía `"jsx"` configurado — `npm run build` del frontend fallaba (era preexistente); corregido al preparar el deploy a Vercel
- [x] Deploy a Vercel (frontend + backend en un solo proyecto): `src/server.ts` se dividió en `src/app.ts` (Express app configurada, sin `.listen`) + `src/server.ts` (wrapper delgado solo para dev/local) + `api/index.ts` (entrypoint serverless que exporta la app de Express directamente). `vercel.json` con `framework: null` (para que Vercel no autodetecte "Express" y rompa el build híbrido), build command que compila el frontend, y rewrites para mandar `/api/*` y `/health` a la función y todo lo demás al `index.html` (SPA fallback). `frontend/src/api.ts` ya no hardcodea `localhost:3000`: usa ruta relativa en producción (mismo dominio) y `localhost:3000` solo en dev. `DATABASE_URL` cargado como env var de producción en Vercel (leído del `.env` local, sin pegarlo en el chat).

### UX / Interfaz

Hallazgos de `docs/ux-ui-audit.md` + decisiones tomadas en las sesiones de mockup interactivo (Artifacts "Northstack — Propuesta de mejora UX/UI" y "Northstack — Rediseño de interfaz"). Landing excluida a propósito — se retoma aparte, todavía no pasó de mockup inicial. HR/Clients Dashboard (vacíos) quedan afuera por ahora, a pedido explícito del usuario.

- [x] **UX-03**: accesibilidad de formularios y menús — `htmlFor`/`id` agregado a todos los pares `<label>`+`<input>` de la app, `aria-expanded`/`aria-haspopup`/cierre con Escape/focus trap con Tab en el dropdown de usuario (`TopBar.tsx`). Implementado 2026-07-15, ver nota de avance.
- [x] **UX-04**: "Copy Link" (`CompanyUsersPage.tsx`) ahora confirma con un toast, igual que "Send invitation" en el mismo archivo. Implementado 2026-07-15, ver nota de avance.
- [x] **UX-05**: `confirm()` nativos del navegador (borrar Employee/Client, transferir ownership, cancelar solicitud de PTO) reemplazados por `ConfirmDialog.tsx`, modal propio estilizado. Implementado 2026-07-15, ver nota de avance.
- [x] **UX-06**: sistema de toasts (`ToastProvider.tsx`) reemplazando los banners `.alert` fijos en las 12 páginas que los usaban; el link de invitación ya no se expone completo en texto plano. Implementado 2026-07-15, ver nota de avance.
- [ ] **UX-07** (a seguir explorando, no cerrado): los dos hubs de configuración (`/settings` vía engranaje del sidebar, `/company` vía avatar) llevan 3 iteraciones sin asentarse. El mockup propone unificarlos en una sola entrada con 2 grupos (Empresa / Módulos) — es una opción a validar, no un diseño final. Antes de implementar, probarlo con alguien nuevo al producto.
- [x] **UX-08**: estados vacíos de Employees/Clients (las 2 páginas de mayor uso) ahora tienen CTA contextual ("Add your first employee/client"). Skeletons de carga y el resto de las páginas (Custom Fields/Statuses/PTO) quedan para una ronda futura si hace falta más que esto. Implementado parcialmente 2026-07-15, ver nota de avance.
- [x] **UX-11**: paginación client-side (`Pagination.tsx`, 20 filas/página) agregada a las tablas de Employees y Clients. Implementado 2026-07-15, ver nota de avance.
- [x] **UX-12**: descartado — verificado que no es un bug real (ver `docs/ux-ui-audit.md`, entrada UX-12 corregida el mismo día): el código ya usa `bg-brand-blue/5` (barra correcta) y el CSS compilado confirma que el resaltado de "hoy" sí se pinta, en claro y oscuro.
- [x] **UX-09**: paleta de marca duplicada a mano entre `landing/index.html` y `frontend/src/index.css` — había quedado afuera de esta ronda ("a definir después"), pero el usuario la confirmó por separado el mismo día. Implementado 2026-07-15, ver nota de avance.
- [x] **UX-13**: Employees/Clients pasaron a tabla a pantalla completa — se sacó el wrapper `.card`, `.page-toolbar` (título + buscador + "Add") pineada arriba, botones de texto de fila reemplazados por íconos con tooltip (`.icon-actions`/`.icon-btn`, componente `Icons.tsx` ampliado). Implementado 2026-07-15, ver nota de avance.
- [x] **UX-14**: alta/edición en panel lateral — `SlideOver.tsx` (nuevo, reutilizable), reemplaza los forms inline que empujaban la tabla en Employees y Clients; un solo `slideOverMode: 'add' | 'edit' | null` maneja ambos casos. Implementado 2026-07-15, ver nota de avance.
- [x] **UX-15**: fondo unificado — `.card`, `thead`, header y sidebar pasaron todos a `bg-brand-cream`/`dark:bg-gray-950` (mismo tono que la página); la separación la da el borde. Overlays reales (dropdown, modal, toast, slide-over) mantienen a propósito el tono "raised" (blanco/`dark:bg-gray-900`). Implementado 2026-07-15, ver nota de avance.
- [x] **UX-16**: checklist en vivo de requisitos de contraseña (`PasswordChecklist.tsx`, nuevo) — 8+ caracteres/mayúscula/número/especial, contra la política real del backend (`isPasswordValid` en `authService.ts`). Aplicado en Register, Accept Invite (modo registro) y Change Password (Profile). Implementado 2026-07-15, ver nota de avance.
- [x] **UX-17**: botón de mostrar/ocultar contraseña (`PasswordInput.tsx`, nuevo, ícono de ojo) aplicado a los 5 campos de contraseña de la app: Login, Register, Accept Invite, y ambos campos de Change Password. Implementado 2026-07-15, ver nota de avance.
- [x] **UX-18a** (escala de espaciado): token de 6 pasos (4/8/12/16/24/32px) documentado como comentario en `App.css`, aplicado directamente en los componentes nuevos de esta ronda (toolbar, slide-over, tarjetas de auth). No se hizo un barrido mecánico del resto de la app — queda para cuando se toque cada pantalla. La parte responsive/mobile de UX-18 sigue coordinada con el ítem ya existente más abajo ("Responsive para celular y tablet"), no se duplicó.
- [x] **UX-19**: Login/Register con pantalla partida — `AuthLayout.tsx` (nuevo): panel izquierdo navy oscuro con el form, panel derecho celeste con blobs suaves (variante "Minimal", la elegida por el usuario) + logo real (`logo-horizontal-light.svg`) + tagline. Panel derecho se oculta en mobile (`hidden md:flex`), el form ocupa todo el ancho. Accept Invite y Change Password quedan con su layout de card actual (no estaban en el alcance de UX-19). "Remember me"/"Forgot password" siguen sin implementar (no hay backend), quedan como idea abierta en `docs/ux-ui-audit.md`. Implementado 2026-07-15, ver nota de avance.
- [x] **Vistas guardadas (Views) para Employees/Clients — grid + Kanban, filtros, personales y compartidas**: spec cerrado con el usuario y mockeado en el Artifact "Northstack — Views, filtros y Kanban" (2026-07-16), implementado el mismo día. Ver nota de avance para el detalle técnico.
  - **Tipos de vista**: `grid` (tabla, con sort por columna) y `kanban` (tablero por columnas).
  - **Kanban**: agrupa por Status o cualquier Custom Field tipo `select` (nunca texto/número/fecha, a propósito). Arrastrar una card entre columnas actualiza ese campo en el empleado/cliente real — si el agrupamiento es por Status, dispara el mismo `StatusHistoryEntry` que ya graba el resto de la app, sin trabajo extra, reutilizando `PATCH /api/hr/employees/:id`/`PATCH /api/clients/:id`.
  - **Sort por columna** en la vista grid, cualquier columna incluidos Custom Fields — cierra el hallazgo de la revisión de interfaz (ninguna tabla tenía sort).
  - **Filtros**: campos base (Name/Email/Department o Company/Status) + Custom Fields activos, operador según el tipo (select → is/is not, fecha → before/after, texto/email → contains, número → =/>/<).
  - **Personales vs. compartidas**: cualquier usuario crea vistas propias (privadas); solo owner/admin pueden crear compartidas.
  - **Borrado de vista compartida**: solo quien la creó, o el owner — no cualquier admin (misma regla para vistas personales: ni el owner puede borrar la vista privada de otro usuario, se trató como una extensión razonable de "privada" no explicitada en el spec original).
  - **Vista por default**: la última usada por ese usuario, guardada en `localStorage` (`northstack:activeView:employee`/`client`) — decisión de alcance: no se armó una tabla de "última vista" en el backend para esto, mismo criterio ya usado para los colores custom del `ColorPicker`.
  - Modelo `SavedView` (tenantId, entityType, createdByUserId, name, type, visibility, filters, sortBy, groupByField — JSON-encoded como el resto de campos JSON del proyecto) + endpoints CRUD (`/api/views`) con los guardrails de permiso descriptos arriba.
- **Rebrand de Settings — 4 tareas separadas, spec cerrado y mockeado en el Artifact "Northstack — Settings reconciliado" (2026-07-16)**. Orden sugerido: hacer las primeras 3 antes que la última — dejan `ModuleSettingsLayout` sin contenido, recién ahí "Workspace Settings" puede reusar la ruta `/settings` sin chocar con la vieja. Ninguna de las 4 necesita cambios de backend — los endpoints ya existen, es reorganización de dónde vive cada UI.
  - [ ] **Custom Fields — deja de ser una página de Settings, pasa al header de columna en Employees/Clients**: reemplaza `CustomFieldsSettingsPage.tsx` (hoy en `/settings` → Custom Fields). Cada columna de custom field en `EmployeesPage.tsx`/`ClientsPage.tsx` gana un dropdown en su header (Edit field / Delete field); una columna "+" fija al final agrega un campo nuevo (nombre, tipo, requerido, opciones si es select). Reusa los endpoints existentes de `customFieldService.ts`.
  - [ ] **Statuses — se fusiona con Custom Fields, mismo mecanismo (Status es, conceptualmente, un campo select)**: reemplaza `StatusesSettingsPage.tsx`. El header de la columna Status abre "Manage options" — lista con color, reordenar, marcar default, activar/desactivar, y agregar uno nuevo, todo en el mismo popover. Reusa los endpoints existentes de `statusService.ts`/`/api/status-definitions`.
  - [ ] **PTO Policies — se muda al header de página de `/hr/pto`, separado de los tabs de workflow**: reemplaza `PtoPoliciesSettingsPage.tsx` (hoy en `/settings` → PTO Policies). `PtoOverviewPage.tsx` gana un header de página propio (título "PTO" + botón "Policies ▾" con la lista y ✏️ por política + botón "Add Policy") **arriba** de la fila de tabs existente (My Requests/Approvals/Balances, sin cambios). A diferencia de Custom Fields/Status, "Add Policy" y editar una política existente abren el `SlideOver` ya construido para Employees/Clients, no un popover chico — el form tiene 5 campos (nombre, accrual method, días/año, color, paga, requiere aprobación), comparable en tamaño a editar un Employee, no a un campo suelto. Reusa los endpoints existentes de `ptoPolicyService.ts`.
  - [ ] **Workspace Settings — hub único con 2 grupos (Mi cuenta / Empresa), reemplaza los 3 puntos de entrada actuales**: fusiona `ProfileSettingsPage` (hoy standalone en `/profile`) y `CompanySettingsLayout` (`/company`: Appearance, Users) en un layout nuevo con 2 grupos — "Mi cuenta" (Profile) y "Empresa" (Appearance, Users) — sirviendo en `/settings` una vez que las 3 tareas de arriba dejaron `ModuleSettingsLayout` vacío. `Sidebar.tsx`: el ítem del engranaje pasa a apuntar a este hub unificado. `TopBar.tsx`: el dropdown de usuario pierde "Profile" y "Company Settings" — queda solo con el nombre y "Logout".
  - Regla general para cualquier config contextual futura, no solo esta ronda: ediciones de 2-4 campos simples van en popover chico anclado al trigger; entidades más completas (como PTO Policy) abren el `SlideOver` reutilizable — mismo criterio de peso que ya separa "un campo" de "una entidad" en el resto de la app.

### Seguridad

- [x] Definir roles y permisos iniciales
- [x] Corregir IDOR en 4 endpoints de custom fields — ahora verifican que employee/client/custom field definition pertenezcan al tenant del usuario (404 si no)
- [x] Reemplazar el hash de contraseñas (era base64, reversible) por `scrypt` con salt aleatorio (built-in de Node, sin dependencias nuevas)
- [x] Política de contraseñas: mínimo 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial (aplicada en registro individual y en registro de tenant+owner)
- [x] Validación de formato de teléfono (rechaza texto que no tenga forma de número)
- [x] `passwordHash` viajaba al frontend en toda respuesta que incluyera un `user` (register, login, auth/me, tenants/register, accept-invite) — encontrado de paso al armar Fase 2. Se agregó `sanitizeUser` en `authService.ts` y se aplicó a los 6 endpoints que devolvían el objeto completo; el frontend nunca leía ese campo, así que no hubo cambios de contrato.

## Notas de avance

- La prioridad actual es validar la base del sistema con HR antes de avanzar a clientes y pagos.
- El archivo `.env` local está configurado con Neon y listo para pruebas.
- Se creó `docs/run-tests.md` con los comandos exactos para instalar, generar Prisma, compilar y ejecutar tests.
- La implementación debe realizarse de forma incremental y testeable.
- Cualquier cambio importante en el alcance deberá documentarse aquí.

Las entradas fechadas (el detalle día a día de qué se hizo y por qué) viven en `docs/tareas/`, un archivo por semana — este archivo se estaba volviendo enorme y poco manejable. Más reciente primero:

- [`docs/tareas/semana-2026-07-13.md`](tareas/semana-2026-07-13.md) — semana actual, en curso
- [`docs/tareas/semana-2026-07-06.md`](tareas/semana-2026-07-06.md)
- [`docs/tareas/semana-2026-06-29.md`](tareas/semana-2026-06-29.md)
