# Contexto de desarrollo del proyecto

- Fecha de creación: 2026-07-02
- Última actualización: 2026-07-16 (rebrand de Settings completo — 4 tareas + fixes de fidelidad contra el mockup; Vistas guardadas/Filtros/Kanban; ronda grande de UX/UI; sistema de PTO 100% cerrado)
- Ver también: `docs/current-process-flow.md` (diagramas de flujo), `docs/database-schema.md` (esquema completo de la base de datos), `docs/tareas-desarrollo.md` (checklist general) y `docs/tareas/` (notas de avance fechadas, un archivo por semana ISO — este archivo resume, esa carpeta tiene el detalle día a día).

## Resumen del proyecto

Se está comenzando a desarrollar un sistema modular, pensado como una plataforma SaaS multi-tenant, con enfoque inicial en la gestión de HR y con roadmap posterior para clientes y pagos.

## Problema que se busca resolver

A lo largo de la carrera, se identificaron problemas recurrentes en startups de EE. UU. relacionados con:

- Recursos humanos / HR
- Gestión de clientes
- Gestión de pagos

La idea es construir una solución que permita a cada empresa registrarse y administrarse de forma autónoma, con control de permisos y con una API pública protegida por token.

## Visión inicial

Crear un sistema que permita:

- registrar empresas como tenants independientes
- habilitar usuarios con distintos niveles de permisos
- dar de alta empleados y clientes de forma manual o mediante formularios públicos
- soportar custom fields desde las primeras versiones
- preparar la arquitectura para crecer hacia clientes y pagos sin reescribir la base

## Decisiones de diseño acordadas

- Arquitectura modular
- Enfoque multi-tenant
- Permisos por rol y por tenant
- Autenticación inicial por usuario y contraseña
- Preparación para futuras integraciones con Google y Microsoft
- API pública con seguridad por token
- Fase 1: HR
- Fase 2: clientes y pagos
- Priorización de testing y corrección progresiva antes de beta

## Estructura propuesta del sistema

### Core

- tenants (con `status`: active/suspended/cancelled)
- autenticación
- usuarios (con `status`: active/inactive)
- permisos y roles
- invitaciones (un admin/owner invita por email a un tenant; el usuario invitado queda adherido con el rol definido al aceptar el token — reemplaza el join libre por tenantId)

### HR

- empleados
- departamentos
- cargos
- estados laborales
- custom fields

### Formularios

- formularios públicos para alta de personas

### API

- endpoints públicos protegidos por token

### Frontend

- aplicación Vite + React (`frontend/`) con páginas de login, registro y dashboard
- el registro es un solo paso: datos de la empresa + datos del usuario owner → crea Tenant + User + Session juntos (`POST /api/tenants/register`)
- consume la API vía `frontend/src/api.ts`

## Estado actual del proyecto

- Se definió la visión general del producto.
- Se definió el enfoque modular y multi-tenant.
- Se priorizó HR como primer módulo.
- Se creó este archivo como referencia de contexto para el desarrollo futuro.
- Se inicializó la estructura base del proyecto con TypeScript, Express y Vitest.
- Se implementó un primer servicio de HR con creación de empleados y estados básicos.
- Se implementó support para custom fields en HR y endpoints de definición y valores.
- Se verificó el funcionamiento con compilación exitosa después de la integración con Prisma.
- Se implementó el módulo de clients (CRUD completo + custom fields) y se integró en `server.ts`.
- Se construyó el frontend inicial (Vite + React) con los flujos de login, registro, creación de tenant y dashboard.
- Se corrigió `Employee.email` para que sea único por tenant (antes era único global, un bug de diseño multi-tenant).
- Se eliminó código muerto (`createTenantWithOwner`) que rompía el build.
- El repositorio en GitHub está al día (`origin/main`, commit `b75b4d3`).
- Se hizo `tenantId` obligatorio en Employee/Client/CustomFieldDefinition (antes opcional, permitía registros huérfanos).
- Se agregó `status` a Tenant y User, e `isActive` a CustomFieldDefinition; se eliminó la tabla `TestRun`.
- Se reemplazó el join libre a tenants por un flujo de invitaciones (modelo `Invitation`, sin envío de email todavía — el link se comparte manualmente).
- Se probó la app corriendo (frontend en `localhost:5173`, backend en `localhost:3000`) y se encontró que el formulario de Register no coincidía con el backend (pedía datos que se ignoraban, no pedía `phone`). Se unificó en un solo endpoint `POST /api/tenants/register` (Tenant + owner User + Session juntos, evita usuarios huérfanos) y se reescribió el frontend acorde. Se eliminó `CreateTenantPage.tsx` (código muerto).
- Pendiente detectado: `frontend/tsconfig.json` no tiene `jsx` configurado, `npm run build` del frontend falla (no afecta al dev server de Vite).
- Se corrigieron las 2 vulnerabilidades de seguridad pendientes: IDOR en los 4 endpoints de custom fields (ahora verifican tenant ownership), y hash de contraseñas reemplazado por `scrypt` con salt (built-in de Node, sin dependencias nuevas). Se agregó política de contraseñas (mín. 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial). Los usuarios registrados antes de este cambio (hash viejo en base64) ya no pueden loguearse y necesitan registrarse de nuevo.
- Se corrigió un bug real en `App.tsx` que vaciaba el formulario de Register/Login en cada error (desmontaba la página por un guard de loading mal alcanzado); se agregaron errores de campo posicionados junto al input y validación de formato de teléfono.
- Employees llegó a paridad CRUD con Clients: editar y borrar, tanto en backend (`PATCH`/`DELETE /api/hr/employees/:employeeId`) como en el Dashboard. Queda pendiente que Clients tenga UI de edición en el frontend (el backend ya la soporta).
- Se agregó búsqueda y custom fields completos (crear campo, completar valor al alta, mostrarlo en la tabla, editarlo) para Employees. `CustomFieldValue` se rediseñó de FKs por módulo (`employeeId`/`clientId`) a modelo genérico (`tenantId` + `entityType` + `entityId`), para no tener que agregar una columna nueva cada vez que se sume un módulo (ej. Payments en Fase 2). La validación de que `entityId` pertenece al tenant queda en el código, no en la base.
- Revisión de diseño de custom fields: se encontraron y corrigieron 2 bugs reales (uso cruzado de campos entre módulos vía API, y valores que no se borraban al vaciarse en Edit) más 4 mejoras (validación de valor por tipo, nuevo tipo `email`, activar/desactivar campos, pestaña "Settings" centralizada para gestionar custom fields por módulo). Se agregó también `CustomFieldDefinition.required`.
- `Employee` ahora puede vincularse a un `User` (FK opcional, no fusión de entidades): cada empleado puede tener su propio acceso al sistema. El owner/admin genera una invitación por empleado desde el Dashboard (botón "Invite", copia el link) reutilizando el sistema de invitaciones existente; al aceptarla, el empleado queda vinculado. Se construyó la pantalla de aceptar invitación (`AcceptInvitePage.tsx`) que faltaba desde hacía varias rondas, con routing manual por query param en vez de agregar una librería de router.

### Diseño visual, navegación y Fase 2 (2026-07-10 a 2026-07-11)

- Se instaló Tailwind CSS v4 con la paleta de marca real (navy `#0d2a48`, azul medio `#3c6da1`, azul claro `#8dbada`, crema `#fdfcf8`) y tipografía Inter. Se armó una identidad visual completa: logo real, favicons, sidebar colapsable con grupos (Human Resources / Clients), barra superior con menú de usuario.
- Se migró de manejo de estado a `react-router-dom` (URLs reales, botón atrás, links compartibles) — decisión justificada explícitamente al usuario antes de sumar la dependencia.
- Se agregó un sistema de dark mode (Tailwind `dark:` basado en clase, toggle System/Light/Dark, guardado en `localStorage` por dispositivo).
- La navegación de "Settings" pasó por 3 iteraciones hasta asentarse: primero una sola sección compartida con tabs, después una separación total sin sub-navegación (sobre-corregido), y finalmente el diseño actual: **2 hubs completamente independientes**, cada uno con su propia sub-navegación interna — `/company` (Appearance + Users, accedido desde el menú de usuario arriba a la derecha, llamado "Company Settings") y `/settings` (Custom Fields, accedido desde el engranaje del sidebar abajo a la izquierda, llamado "Settings") — sin ningún link cruzado entre ambos.
- **Fase 2** completa: `ProfileSettingsPage` real (editar nombre/teléfono, cambiar contraseña) y gestión de usuarios del tenant (`CompanyUsersPage`: tabla de roles/status editable, invitaciones pendientes, invitar gente nueva). Se corrigió de paso una fuga real: `passwordHash` viajaba al frontend en 6 endpoints distintos (`sanitizeUser` en `authService.ts`).
- **Ownership único garantizado**: asignar el rol `owner` a alguien es ahora una transferencia atómica (transacción de Prisma que también degrada al owner actual a `admin`) — un tenant nunca puede quedar con 0 o 2+ owners. Antes de este fix, un owner podía promover a otro sin perder su propio rol.
- **Clients llevado a paridad con Employees**: custom fields dinámicos en alta/edición, columnas en la tabla, barra de búsqueda, edición inline con status. El backend de Clients le faltaban los endpoints `PATCH`/`DELETE` de valores de custom fields, que nunca se habían completado — se agregaron con el mismo patrón de verificación que Employees.

### Resiliencia del backend (2026-07-11)

- Se encontró y corrigió la causa raíz de un incidente real: el backend local (`npm run dev`) se había caído sin que nadie se diera cuenta, y el usuario recibió "Failed to fetch" al intentar registrarse. Causa: Express 4 no atrapa promesas rechazadas de handlers `async` por su cuenta — una excepción no manejada tumbaba el proceso entero.
- Fix de 3 capas: (1) wrapper que envuelve `app.get/post/patch/delete/put` una sola vez para atrapar cualquier error async y devolver un 500 limpio en vez de crashear (con cuidado especial porque `app.get` también se usa para leer configuración interna de Express, no solo para rutas); (2) retry con backoff en Prisma (`$extends`, hasta 2 reintentos) para errores de conexión transitorios, pensado para cuando Neon tarda en "despertar"; (3) mensaje claro en el frontend (`apiFetch` en `api.ts`) cuando el backend es inalcanzable, en vez de "Failed to fetch" crudo.

### Deploy a producción, dominio propio y email real (2026-07-10 a 2026-07-13)

- La app está online: `https://app.joinnorthstack.com` (antes `northstack-two.vercel.app`). Un solo proyecto de Vercel sirve el frontend (build estático) y el backend (función serverless).
- El backend se dividió para poder correr serverless: `src/app.ts` (la app de Express configurada, sin `.listen`) + `src/server.ts` (wrapper delgado, solo para `npm run dev` local) + `api/index.ts` (entrypoint que exporta la app de Express directamente, patrón oficial de Vercel).
- Auto-deploy en cada push a `main` vía GitHub Actions (`.github/workflows/deploy.yml`) — la integración nativa de Vercel (GitHub App) no se pudo autorizar sin acceso a un navegador, así que se optó por un workflow que corre `vercel deploy --prod` con un token guardado como secret del repo.
- Se compró el dominio `joinnorthstack.com` (Cloudflare Registrar, ~USD 10/año) y se conectó como `app.joinnorthstack.com` al proyecto de Vercel, con SSL automático (Let's Encrypt, sin ningún paso manual). La raíz del dominio quedó reservada, sin usar todavía.
- Se dio de alta Zoho Mail (plan gratis) para el dominio, con la casilla `no.reply@joinnorthstack.com`, y se configuró el DNS (MX, SPF, DKIM) en Cloudflare. Se agregó `nodemailer` (única dependencia nueva, justificada) y `src/lib/mailer.ts`, conectado dentro de `createInvitation` para que las invitaciones (tanto de tenant como de empleado) manden un email real en vez de depender de que alguien copie el link a mano — probado con un envío real que llegó a la bandeja principal de Gmail al primer intento.
- Quedó como tema abierto sin decidir: sistema de cobro de suscripciones del propio SaaS (Payments). Evaluado Stripe (requeriría una LLC en EEUU, Argentina no tiene cuentas directas) vs Paddle (merchant of record, sin necesidad de entidad en EEUU, comisión más alta) — Paddle es la opción de referencia por ahora, sin implementar.

### Terms of Service y Privacy Policy (2026-07-13)

- Se redactaron `docs/legal/terms-of-service.md` y `docs/legal/privacy-policy.md` (en inglés — idioma de la app y del público objetivo, aunque la landing hoy está en español), para publicarse eventualmente en la landing y en la app. **No son documentos legales definitivos**: los redactó la IA, no un abogado matriculado, y ambos archivos tienen un bloque de nota interna al inicio (no publicable) que documenta huecos conocidos y decisiones pendientes de confirmar.
- Decisiones de fondo, tomadas explícitamente por el usuario tras varias rondas de preguntas:
  - **Entidad**: no hay sociedad constituida — los documentos vinculan a Alejandro Bravo como persona física (inferido de la config de git, a confirmar), no a una entidad con responsabilidad limitada. Esto significa que el contrato lo protege parcialmente (cap de responsabilidad, indemnización), pero no reemplaza el escudo legal que daría una SRL/SAS — señalado como prioridad a futuro si el producto empieza a cobrar o a manejar datos sensibles a mayor escala.
  - **Ley aplicable y jurisdicción**: Argentina, tribunales de la Ciudad de Buenos Aires. Reconfirmado por el usuario incluso después de ver que Stripe y HighLevel usan arbitraje obligatorio como su mecanismo real para evitar litigios costosos — es un trade-off deliberado, no un descuido, pero vale la pena revisarlo si Northstack empieza a firmar clientes de EE. UU. a mayor escala.
  - **Alcance de compliance de datos**: enfocado en EE. UU. por ahora (lenguaje tipo CCPA extendido voluntariamente, sin reclamar aplicabilidad estricta), sin cláusulas GDPR — deliberadamente pospuesto hasta que haya clientes en la UE.
  - **Contacto**: `info@joinnorthstack.com`; domicilio solo a nivel ciudad/país (Buenos Aires, Argentina), sin dirección exacta, por privacidad.
- Estructura clave de la Privacy Policy: distingue **Account Data** (los usuarios que usan Northstack directamente — Northstack es controller) de **Processed Data** (los empleados/clientes que un tenant carga — el tenant es controller, Northstack solo procesa por su cuenta). Esto refleja el patrón real de Stripe (End User vs. End Customer).
- El usuario pidió agregar una cláusula al estilo Disney ("la empresa renuncia a su derecho a demandar a Northstack al aceptar los términos"). Se investigó el caso real (Piccolo v. Disney, 2024): lo que Disney tenía en realidad era una cláusula de **arbitraje obligatorio** (cambia el foro, no elimina el derecho a reclamar) de una prueba gratuita de Disney+, aplicada a una demanda por muerte injusta no relacionada — generó un escándalo público tan grande que Disney se retractó en días. Se explicó por qué una renuncia total al derecho de demandar es legalmente frágil (probable nulidad por ser irrazonable, no aplicable a dolo/negligencia grave/derechos no renunciables) y reputacionalmente riesgosa para un founder solo, y se ofrecieron alternativas reales.
- A pedido del usuario, se leyeron a fondo los Términos y Políticas de Privacidad completos de **GoHighLevel, Stripe y comparables de HR SaaS (Gusto, BambooHR)** para calibrar qué usa realmente la industria (no solo la cláusula de responsabilidad). Hallazgos aplicados al documento:
  - **Plazo de prescripción contractual de reclamos**: nueva Sección 12 del ToS, 12 meses (HighLevel usa 3 meses, considerado demasiado agresivo dado que el usuario es persona física sin entidad — más fácil de cuestionar como abusivo).
  - **Terminación más flexible para Northstack** (§9.2): permite suspensión inmediata sin período de cura ante riesgo de seguridad/fraude/legal, manteniendo aviso + cura solo para infracciones ordinarias — antes exigía aviso y cura en todos los casos.
  - **Retención post-terminación con plazo fijo** (§9.3): 90 días (antes era "período razonable", sin piso concreto).
  - **Datos de uso agregados/anonimizados** (§3.6 nueva): Northstack puede retener y usar datos derivados/anonimizados (no el dato crudo del cliente) para mejorar el producto, incluso después de que el cliente se va.
  - Arbitraje: evaluado y descartado (ver arriba, el usuario mantuvo tribunales de Buenos Aires).
- Otras cláusulas de protección ya incluidas desde el primer borrador: prohibición de que los tenants carguen categorías de datos sensibles (SSN, salud, biométricos, cuentas financieras completas) vía custom fields (§3.4 ToS — importante porque los custom fields son texto libre y hoy no hay nada a nivel de producto que lo impida técnicamente); indemnización del tenant hacia Northstack por los datos que carga; disclaimers de beta (sin SLA); tope de responsabilidad (mayor entre fees de 12 meses o USD 100).
- El usuario completó `[Effective Date]` como **13 de julio de 2026** en ambos documentos directamente en el archivo.
- Pendiente: confirmar el nombre legal exacto a usar (hoy asume "Alejandro Bravo"), revisión por un abogado matriculado antes de publicar, y decidir cómo enlazarlos desde la landing y la app (páginas/rutas — todavía no implementado).

### Catálogo de status configurable (2026-07-13)

- `Employee.status`/`Client.status` dejaron de ser enums fijos de Prisma — ahora son `statusId`, FK a un nuevo modelo `StatusDefinition` por tenant y por módulo (name, color, order, isDefault, isActive), gestionable desde `/settings` → Statuses. Cada tenant nuevo siembra automáticamente los mismos valores que existían antes (Employee: Active/Inactive/Pending — Client: Prospect/Active/Inactive/Archived), pero puede agregar/renombrar/reordenar/desactivar libremente.
- Cada cambio de status queda en `StatusHistoryEntry`, guardando el *nombre* del status al momento del cambio (no una FK viva), para que un status renombrado después no reescriba cómo se ve el historial viejo. Se graba automático; la pantalla para verlo queda pendiente.
- Migración real sobre los ~28 tenants ya existentes en producción (Neon), en 3 pasos (push aditivo → script de backfill → push destructivo para borrar las columnas viejas), verificada con queries directas antes de cada paso destructivo.

### Landing separada a su propia branch (2026-07-14)

- A pedido del usuario, `landing/` se sacó por completo de `main` y se movió a una branch nueva, `landing`, con su propio pipeline de deploy (workflow de GitHub Actions distinto, disparado por push a `landing` en vez de a `main`). La landing siguió online sin downtime durante el cambio — como el deploy nunca usó la integración nativa de Vercel (Git), sino `vercel deploy --prod` corrido a mano vía CI, no hubo que tocar ninguna configuración del lado de Vercel, solo el trigger del workflow.
- Motivo: separar por completo el trabajo de la landing (estática, sin backend) del trabajo de la app real, que hasta ahora compartían la misma branch y el mismo historial de commits.

### Sistema de PTO/vacaciones completo (2026-07-14)

Construido pieza por pieza en la misma sesión, a pedido explícito del usuario ("arranca con eso nomás"), confirmando y pusheando cada pieza por separado antes de seguir con la siguiente. 6 de las 7 piezas planeadas están hechas — el detalle técnico completo (schema, endpoints, decisiones de diseño, verificación) vive en `docs/tareas-desarrollo.md` con notas fechadas por pieza, y el esquema de datos resultante está documentado en `docs/database-schema.md`.

1. **Jerarquía organizacional**: `Employee.managerId`, relación auto-referencial ("reporta a"), con detección de ciclos (directos e indirectos) antes de guardar. Todo owner de tenant (nuevos y los ~30 ya existentes, migrados con un script) tiene ahora su propio registro `Employee` automático, así siempre aparece como opción de manager aunque no haya cargado ningún empleado todavía.
2. **Motor de políticas de PTO configurables**: `PtoPolicyDefinition` por tenant — nombre, color, método de acumulación (`fixed_annual` o `monthly`, ambos soportados, no uno solo), días por año, paga/no paga, requiere aprobación. Gestionable desde `/settings` → PTO Policies.
3. **Asignación de políticas por empleado**: tabla de unión `EmployeePtoPolicy` — una política no aplica a todos por default, se asigna puntualmente. Gestionable desde HR → PTO → Assignments, o desde el form de edición de cada empleado.
4. **Solicitud + aprobación por jerarquía**: `PtoRequest` — el empleado pide días de una política que tiene asignada, y aprueba quien tenga configurado como su manager (no necesariamente el owner/admin, aunque owner/admin siempre pueden hacer override). Auto-aprobación instantánea si la política no requiere aprobación.
5. **Balance de días**: calculado al vuelo (no se guarda en ninguna tabla), combinando la fecha de asignación, el método de acumulación de la política, y las solicitudes aprobadas/pendientes del año calendario en curso.
6. **Calendario tenant-wide**: vista mensual de quién está de licencia (aprobada y pendiente, distinguidas visualmente), abierta a cualquier miembro del tenant, no solo admin.
7. **Tag visual en la fila del empleado** (2026-07-14, cierra el sistema): badge de color junto al nombre en `EmployeesPage.tsx` cuando el empleado tiene una solicitud aprobada cuya fecha cubre hoy — calculado al vuelo (`activePtoTag: {policyName, color} | null`, no es un campo de tabla), sin tocar el `status` real del empleado. Con esta pieza el sistema de PTO quedó **100% completo**: jerarquía, políticas, asignación, solicitud/aprobación, balance, calendario, tag visual.

De paso, esta ronda resolvió dos ítems de backlog que llevaban tiempo abiertos:
- **"Overview / pantalla de inicio"**: estaba anotado sin detalle desde hacía varias rondas. El usuario pidió que el calendario de PTO se mostrara "dentro del overview como main page, por encima del label Human Resources" — `OverviewPage.tsx` (`/overview`) es ahora la pantalla a la que cae cualquiera al loguearse, registrarse, o aceptar una invitación (antes caía en HR Dashboard).
- **Selector de color pobre**: el `<input type="color">` nativo (usado en Statuses) no daba feedback claro de qué color estaba elegido. Se construyó `ColorPicker.tsx`, un componente reutilizable con colores predeterminados + un popover para agregar personalizados (persistidos en `localStorage`, compartidos entre todos los pickers de la app) — pasó por varias iteraciones de feedback del usuario probando en el navegador antes de asentarse.

### Auditoría UX/UI + rediseño visual implementado (2026-07-15)

- **Auditoría** (`docs/ux-ui-audit.md`, 12 hallazgos UX-01 a UX-12, evidencia archivo:línea) sobre frontend + landing. El usuario confirmó pasar a backlog: accesibilidad, bug de "Copy Link" sin feedback, uso de `confirm()` nativo, falta de sistema de toasts, dos hubs de Settings desconectados (marcado explícitamente "se puede mejorar" — esto terminó resuelto el 2026-07-16, ver más abajo), estados de carga/vacíos, falta de paginación.
- **Implementación de los hallazgos técnicos** (mismo día, "dale nomás"): `ToastProvider.tsx` (contexto + hook `useToast()`, reemplaza banners `.alert` fijos en 12 páginas), `ConfirmDialog.tsx` (reemplaza los 4 `confirm()` nativos que quedaban), `Pagination.tsx` (20 filas/página, client-side), estados vacíos con CTA en Employees/Clients, `htmlFor`/`id` en ~60 pares label+input, focus trap + `aria-*` en el dropdown de `TopBar.tsx`.
- **Mockup de rediseño visual** (segundo Artifact, "Northstack — Rediseño de interfaz") e implementación completa el mismo día: `SlideOver.tsx` (panel lateral fijo desde la derecha, reemplaza los forms inline que empujaban la tabla — reutilizado después para PTO Policies en el rebrand de Settings del 07-16), tablas de Employees/Clients rediseñadas a pantalla completa con acciones de fila por ícono, fondo unificado a un solo tono de superficie (antes 3 tonos distintos: página/card/thead), `PasswordChecklist.tsx`/`PasswordInput.tsx` (checklist en vivo + toggle mostrar/ocultar contraseña, reutilizables), y `AuthLayout.tsx` — pantalla partida real para Login/Register (panel navy con el form + panel celeste con gradiente/blobs, variante "Minimal" elegida por el usuario entre 3 opciones mockeadas).
- Todo verificado en navegador con Playwright contra un tenant de prueba real (no solo build), tenant borrado después.

### Vistas guardadas — Views, Filtros y Kanban (2026-07-16)

- Spec cerrado en el Artifact "Northstack — Views, filtros y Kanban", implementado completo el mismo día ("implementalo por favor"). Modelo `SavedView` (tenantId, entityType, createdByUserId, name, type `grid`/`kanban`, visibility `personal`/`shared`, filters/sortBy/groupByField como JSON) + `savedViewService.ts` + `/api/views` (CRUD). Reglas de permiso: solo owner/admin crean vistas compartidas; borrar una vista personal es exclusivo de quien la creó (ni el owner puede tocar la privada de otro).
- Frontend: `frontend/src/lib/viewFields.ts` (campos filtrables/ordenables/agrupables por entidad, incluye Custom Fields activos) + `applyFilters`/`applySort` (client-side, mismo criterio que la paginación — los datos ya se cargan completos). Componentes nuevos: `ViewsBar.tsx` (tabs de vistas + popover de alta + menú por tab), `FilterBar.tsx` (popover de filtros), `KanbanBoard.tsx` (drag-and-drop nativo HTML5, genérico). La vista activa persiste en `localStorage` (`northstack:activeView:employee`/`client`), mismo patrón que la vista de PTO/colores custom.
- Mover una card en Kanban reutiliza los mismos endpoints de `PATCH` ya existentes de Employee/Client (por `statusId` o custom field value) — sin endpoints nuevos.
- **Bug de scrollbar fantasma, 2 rondas** (mismo día, reportado por el usuario con captura): el popover de "nueva vista" se veía como una flechita de scroll suelta en vez de un popover — causa: `overflow-x: auto` en `.views-bar` fuerza a `overflow-y` a pasar de `visible` a `auto` implícitamente (regla de CSS poco conocida), recortando cualquier `position: absolute` hijo. Fix: `Popover.tsx` (nuevo, genérico) — portal a `document.body` + posición calculada con `getBoundingClientRect()`, inmune a overflow de ancestros. Después de ese fix quedó un residuo (1px de overflow real en `.views-bar` seguía disparando la scrollbar) — se agregó `overflow-y: hidden` explícito. `Popover.tsx` es ahora el mecanismo estándar para cualquier popover nuevo del proyecto (usado también en Custom Fields/Statuses/PTO Policies del rebrand de Settings).
- **Split de `docs/tareas-desarrollo.md`** (el archivo había llegado a 131KB): las "Notas de avance" fechadas se movieron a `docs/tareas/semana-YYYY-MM-DD.md` (un archivo por semana ISO, fecha = lunes de esa semana), dejando en `tareas-desarrollo.md` solo el checklist general + un puntero corto. Este archivo (`contexto-proyecto.md`) se mantiene como estaba — single-file, sin split — por pedido explícito del usuario.

### Rebrand de Settings — 4 tareas + fidelidad con el mockup (2026-07-16)

Spec cerrado en el Artifact "Northstack — Settings reconciliado", implementado completo en el orden sugerido por el propio documento ("comenza con ese orden"). Objetivo: los 3 puntos de entrada viejos y desconectados a configuración (engranaje del sidebar → módulos sueltos en `/settings`, menú de usuario → `/profile`, menú de usuario → `/company`) quedan reemplazados por un modelo más simple: lo que es específico de un módulo vive **contextualmente** en ese módulo, y lo que es transversal (cuenta, empresa) vive en un solo hub.

1. **Custom Fields**: dejó de ser página de Settings (`CustomFieldsSettingsPage.tsx`, borrada) — cada columna de custom field en `EmployeesPage.tsx`/`ClientsPage.tsx` ahora tiene un menú "..." en el header (`CustomFieldColumnMenu.tsx`: Edit field/Delete field, este último desactiva vía `ConfirmDialog`, no borra en duro) más una columna "+" fija al final (`AddCustomFieldColumn.tsx`) para crear campos nuevos. El backlog decía que no hacía falta backend nuevo — **resultó inexacto**: el `PATCH` solo soportaba togglear `isActive`, se agregó `updateCustomFieldDefinition` en `customFieldService.ts` (deliberadamente sin permitir editar `fieldType`, para no dejar valores guardados que no matcheen un tipo nuevo).
2. **Statuses**: se fusionó con el mismo mecanismo — el header de la columna Status abre un único popover "Manage options" (`StatusColumnMenu.tsx`: reordenar, color, marcar default, activar/desactivar, agregar) en vez de tener su propia página. Acá el backend ya soportaba todo.
3. **PTO Policies**: se mudó de `/settings` al header de `/hr/pto` mismo (`PtoPoliciesSettingsPage.tsx`, borrada) — título "PTO" + botón "Policies" (con ícono de engranaje) que abre un popover con la lista de políticas, y un botón "Add Policy" en el header (ver ajuste de fidelidad más abajo). A diferencia de Custom Fields/Status, acá "Add Policy"/editar abren el `SlideOver` reutilizable (ya construido en la ronda de UX del 07-15), no un popover chico — el form tiene 6 campos, es más "entidad completa" que "campo suelto". Con esta tarea `ModuleSettingsLayout.tsx` quedó sin contenido y se borró.
4. **Workspace Settings**: `WorkspaceSettingsLayout.tsx` (nuevo) unifica `ProfileSettingsPage`/`CompanyAppearancePage`/`CompanyUsersPage` en un solo hub en `/settings`, con 2 grupos — "Mi cuenta" (Profile, todos los roles) y "Empresa" (Appearance/Users, solo owner/admin, oculto para el resto). Cambio no explícito en el spec pero necesario: el engranaje del sidebar (`Sidebar.tsx`) era antes admin-only (`showSettings` prop) porque solo llevaba a módulos admin-only — ahora que Profile vive detrás de la misma ruta y es de cualquier usuario, el engranaje se volvió visible para **todos los roles**, y el gating de "Empresa" se movió adentro del layout mismo. `TopBar.tsx` perdió "Profile"/"Company Settings" del dropdown de usuario, queda solo nombre + Logout. `/profile` y `/company` se dejaron como redirects a las rutas nuevas (no se rompen bookmarks viejos).

**Ajuste de fidelidad contra el mockup** (mismo día, a pedido del usuario tras comparar producción contra el Artifact original): 4 huecos reales corregidos — el ítem activo de `.settings-nav` pasó del estilo viejo (tinte azul 10%) a un pill sólido azul/texto blanco; "Add Policy" se sacó de adentro del popover "Policies" y pasó a ser su propio botón outline en el header de la página (junto a "Policies ▾"); cada fila de política ahora muestra el método de acumulación + días inline (ej. "Monthly · 15d" — obligó a ensanchar el popover de 260px a 320px para que nombres largos no truncaran agresivamente); el botón "Policies" ganó el ícono de engranaje que tenía en el mockup.

Cada una de las 4 tareas + los 4 fixes de fidelidad se verificaron con Playwright contra tenants de prueba reales (build local, no solo capturas — se leyeron estilos computados, conteo de íconos, texto exacto de badges), incluyendo un escenario de 2 roles reales para la tarea 4 (owner invitando a un member de verdad, no un token simulado, para confirmar que cada uno ve el grupo de nav correcto). Deploy verificado en producción con `curl` contra el hash del bundle JS después de cada push. `npm test` (6/6) y `npm run build` (frontend) verdes en cada paso.
