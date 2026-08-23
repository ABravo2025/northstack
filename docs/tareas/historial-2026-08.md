# Historial de avance — Agosto 2026 (desde 2026-08-03)

Parte del historial de `docs/general/tareas-desarrollo.md` (el checklist general vive ahí, no acá). Ver
también `docs/contexto-proyecto.md` para el contexto completo del proyecto.

**Nota sobre cómo se armó este archivo:** el proceso de archivar el trabajo semanal en `docs/tareas/`
se cortó el 2026-08-03 — desde esa fecha, todo el detalle día a día de agosto quedó documentado
directo en `docs/general/tareas-desarrollo.md` (en la sección "Notas de avance"/"Estado actual" y en el
checklist de Tier 3.5) sin nunca archivarse a un archivo separado, a diferencia de julio (ver
[`historial-2026-06-29_2026-07-21.md`](historial-2026-06-29_2026-07-21.md) y
[`semana-2026-07-29.md`](semana-2026-07-29.md)). Este archivo reorganiza cronológicamente ese
contenido de agosto para que no quede enterrado en un archivo cada vez más largo — **es una copia
organizada, no un reemplazo**: el contenido original sigue viviendo tal cual en
`docs/general/tareas-desarrollo.md`, no se tocó ni se borró de ahí.

**Qué cubre este período, a alto nivel:**
- **Payroll** — módulo completo (21/21 unidades), construido en su tercer intento (los dos primeros
  se revirtieron), **en producción desde el 2026-08-09**.
- **Admin Center** — herramienta para staff de plataforma (Platform Roles, Tenants, Tickets, Ideas),
  **en producción desde el 2026-08-11**, en los dos repos (`northstack` + `northstack-devtasks`).
- **Tenant Signup + Subscription Plans** — signup con verificación de email + selección de plan de
  suscripción, **en producción desde el 2026-08-18** (después de una revisión de código que corrigió
  12 bugs).
- **Billing Integration** — Paddle + Mercado Pago para la suscripción propia de Northstack (trial
  real de 15 días, checkout, webhooks, autogestión), construido y probado de punta a punta contra
  sandbox en `staging` entre el 2026-08-19 y el 2026-08-22, **todavía sin pushear a `main`** —
  pendiente de code review.

---

## Línea de tiempo

- **2026-08-01 a 2026-08-03 (contexto — segundo intento de Payroll)**: Payroll se había construido
  completo en este rango (Unidad 0-15 + un re-spec), pero llegó a `staging` sin que el usuario lo
  revisara de verdad. El detalle completo de cómo se armó y qué contenía ese intento no está
  reconstruido en `docs/general/tareas-desarrollo.md` — la fuente lo dice explícitamente: "detalle completo
  de ambos [incidentes] en `git log`, no repetido acá". Lo que sí quedó documentado es el incidente
  de deploy que lo cerró, fechado el mismo 2026-08-03 (ver entrada siguiente).

- **2026-08-03 — Incidente de deploy: Payroll (segundo intento) revertido de `main`**: un
  `git push origin main` pensado como "solo docs" arrastró consigo 27 commits de código sin revisar
  (commits `97af398`…`d1da7c4`, después `2c0d7b1`…`f9319a0`), y el módulo tuvo que revertirse
  (`6f4209d`). Después de este revert, Payroll no existe en el código en ningún entorno — ni `main`
  ni `staging`. Este es el "segundo y más grande" de dos incidentes de la misma familia (el primero,
  del 2026-07-31, ya había dejado anotada la regla de proceso correspondiente: **un `git push origin
  main` nunca debe asumirse "solo docs" únicamente porque el commit que se arma toca solo `.md`** —
  si la rama local tiene commits de código sin pushear a `main` por delante, van a viajar igual.
  Verificar con `git log origin/main..HEAD` (o pushear inmediatamente después de cada commit, sin
  acumular) antes de cualquier push a `main`).

- **2026-08-06 — Auditoría del checklist contra el código real + push de Employees a `staging`**:
  1. **Add Employee, paridad visual + auto-create**: el modal de alta de Employee pasó a usar el
     mismo estilo de campo que el panel de detalle (`Field.tsx`, label a la izquierda, input sin
     borde hasta foco/hover, en vez de `.form-group` con label arriba) y ganó asterisco rojo
     reusable (`Field` prop `required`, `.required-mark`) en los campos obligatorios. Comportamiento
     nuevo: apenas First Name/Last Name/Business Email (+ cualquier custom field `required`) están
     completos, el empleado se auto-crea y el modal pasa a ser el `EmployeeOverviewPanel` real de esa
     persona, sin clickear "Create" (el botón sigue de fallback manual). Pieza nueva reusable:
     `useAutoCreateGuard` (`frontend/src/hooks/`).
  2. **Bug real encontrado y corregido** (reportado por el usuario probando la app): un empleado
     recién creado podía no aparecer en la tabla al cerrar el panel si el sort/filtro activo lo
     mandaba a otra página — la tabla ahora salta a la página donde cayó, verificado con Playwright
     forzando el caso determinístico (orden por Name ascendente, nombre que cae en la última página).
  3. Pusheado a `staging` (`659da8a`), QA-06 cargada en `docs/Tareas-QA.md`. Compañías/Contacts/
     Opportunities quedan con el mismo tratamiento pendiente, como unidad por separado.
  4. **Auditoría del checklist de `docs/general/tareas-desarrollo.md` contra `git log`/el código real** (a
     pedido del usuario): CSV export/import de Employees confirmado ya implementado (con la
     salvedad de que Clients quedó huérfano de UI). Payroll, documentado hasta ese momento como "sin
     empezar", en realidad se había construido completo entre el 2026-08-01 y el 2026-08-03 y se
     había revertido el mismo 2026-08-03 (ver entrada de arriba). **A pedido del usuario, se eliminó
     del checklist el spec técnico completo de Payroll** (vivía en `docs/general/tareas-desarrollo.md`, Tier
     3.5 + la sección "Payroll — spec técnico completo") **por quedar inconsistente con la
     realidad**, junto con QA-04/QA-05 en `docs/Tareas-QA.md` (describían testear un módulo que ya no
     existía). El historial completo del intento revertido sigue en `git log` si hace falta
     reconstruirlo — retomar Payroll significó un spec nuevo desde cero, no reciclar el viejo.
  5. **Confirmado el mismo día, mirando el resumen de "Estado actual"**: el FAB de acción primaria en
     mobile (`docs/design-system.md` §13, Tarea 9c de UX/UI) sigue sin construir — bloqueado en que
     `AppLayout.tsx` no tiene un mecanismo de "acción primaria por página" que el FAB pueda invocar
     (cada página maneja su propio `handleOpenAdd` suelto).

- **2026-08-07 — Payroll: tercer intento, spec técnico nuevo desde cero**: `docs/spec-payroll.md`
  escrito este día, sin reciclar nada del spec de los dos intentos anteriores. El usuario dio una
  instrucción explícita que cambió el criterio de trabajo respecto a rondas anteriores: "seguí y
  completá todo, una vez que esté todo en local lo quiero testear a full" — distinto del patrón de
  "confirmar y pushear cada unidad por separado" que se venía usando hasta ese momento. Esto significó
  que las 21 unidades completas se construyeran en local, sin pushear nada, hasta que todo el módulo
  estuviera terminado.

- **2026-08-08 — Payroll: las 21 unidades completas construidas y verificadas, primera y segunda
  ronda de fixes de la revisión del usuario**: con el spec del 07 ya cerrado, se construyó el módulo
  completo (resumen por bloque, detalle técnico completo en `docs/database-schema.md` grupo 7):
  - **U1-U4 — Cimientos**: schema + cifrado AES-256-GCM (`src/lib/encryption.ts`), catálogo de
    políticas de pago y métodos de pago (backend+frontend), rename "Employee"→"People" a nivel de
    nav/ruta/heading + `personType` (Profile/Contractor/Employee) como gate de todo el módulo, retiro
    completo (schema + DB, con confirmación explícita del usuario para el paso destructivo) de
    `Employee.hourlyRateCents`/`monthlyRateCents`/`compensationType` en favor de
    `EmployeeCompensation` versionado.
  - **U5-U9 — Onboarding a Payroll**: alta con contrato inicial dentro del mismo modal "Add Person",
    invitación específica (`acceptPath: '/confirm-contract'`) disparada al crear el primer contrato
    de alguien sin `User` vinculado, pantalla pública `/confirm-contract/:token` (contraseña, país,
    método de pago con IBAN/ACH o usuario según corresponda, evidencia IP+timestamp), cifrado de
    datos de cuenta ya integrado a esa confirmación, y `blocksParticipation` calculado en la creación
    de cada contrato.
  - **U10-U11 — Gestión de personas**: asignación/reasignación masiva de política de pago (tabla +
    modal de revisión con monto editable por persona), chip de estado de contrato
    (Confirmado/Pendiente/Vencido) en la tabla de People.
  - **U12-U17 — Payroll Run**: creación con pre-carga automática (excluye contratos sin confirmar),
    pantalla de detalle por persona (base/ajustes/total), ajustes editables mientras el run esté en
    borrador, carga de horas para compensación hourly con recálculo automático, alerta visual de
    persona inactiva, y confirmación que bloquea edición posterior.
  - **U18-U19 — Pagos fuera de ciclo y timeline**: pagos únicos independientes de cualquier run, y
    una única línea de tiempo cronológica (pestaña principal de Payroll) mezclando runs y pagos
    sueltos.
  - **U20 — Payslip PDF preview**: nueva dependencia `pdf-lib` (confirmada explícitamente con el
    usuario — sin binarios nativos, sin dependencias transitivas), PDF marcado "PREVIEW — NOT ISSUED"
    en el documento mismo, no solo en la UI.
  - **U21 — Sidebar**: entrada "Payroll" owner-only a nivel de nav (con guard adicional en las 2
    páginas para que un no-owner que adivine la URL no vea pestañas rotas, más allá del 403 que ya
    daban los endpoints).

  **Verificación**: script de smoke test contra la API real (creación de run, exclusión de contrato
  sin confirmar, bloqueo de confirmación con horas sin cargar, recálculo de horas, ajustes, confirmar,
  bloqueo post-confirmación, pago fuera de ciclo) más una pasada de Playwright de punta a punta sobre
  las 21 unidades juntas (registro → alta con contrato → confirmación pública con IBAN → login
  automático → Assignments → crear run → ajuste → confirmar → payslip → pago fuera de ciclo →
  timeline), sin errores de consola al final. Esa pasada encontró y corrigió dos cosas antes de dar el
  módulo por cerrado: un warning real de React (fragments sin `key` agrupando las filas por persona en
  `PayrollRunDetailPage.tsx`, corregido con `<Fragment key={row.employeeId}>` en vez del shorthand
  `<>`), y dos 403 de consola que resultaron **no ser de Payroll** (`OverviewPage.tsx` llama
  `listTenantUsers` sin chequear rol al montar, pero `GET /api/tenants/users` está gateado a
  owner/admin — cualquier `member` que entra a `/overview` los dispara; se silencian con
  `.catch(() => {})`, no rompen nada, quedaron anotados como backlog de UX/Overview sin tocar, por no
  ser parte del spec de Payroll).

  El schema se había aplicado antes contra `staging` (necesario para poder probar en local, incluyendo
  el paso destructivo de la Unidad 4 y el campo `confirmedIp` de la Unidad 7, no contemplado en el
  schema original de la Unidad 1) — `scripts/backfill-legacy-employee-compensation.ts` migró los
  registros de prueba con datos legados antes del borrado. Gotcha de ruteo real encontrado y
  corregido en la Unidad 7: `/api/public/contract-confirmation/:token` colisionaba con el catch-all
  de Public Forms por tener la misma forma de 2 segmentos.

  **Primera ronda de fixes de la revisión del usuario** (local, sin pushear):
  - Nationality (alta de persona) pasó de texto libre a `<select>` reusando `COUNTRIES`, la misma
    lista que ya usaba la confirmación de contrato.
  - Los 5 `PayFrequencyDefinition` default pasaron de español a inglés (Weekly/Semi-monthly/Monthly/
    etc.), con un backfill (`scripts/rename-pay-frequencies-to-english.ts`) que renombró los ya
    seedeados en los 177 tenants de `staging` — rename de texto puro, no toca ids/relaciones.
  - El campo "Description" del contrato inicial se relabeleó a "Role Description" en las 3 pantallas
    donde aparece (alta de persona, bulk assign/reassign, confirmación pública) — solo el label
    visible, la propiedad de dominio sigue siendo `description` de punta a punta.
  - Se confirmó que el envío de emails (Nodemailer/Zoho) funciona correctamente (test directo de SMTP
    exitoso) — el reporte de "no llega el email de invitación" no es un problema de infraestructura ni
    de código; a falta de acceso a la casilla de prueba del usuario, quedó pendiente confirmar si fue
    spam/promociones o un email de prueba no revisable.
  - Alta de persona ahora permite asignar Time Off Policies (checkboxes) en el mismo modal, antes solo
    se podía después de creado el empleado.
  - Department, Reports To, Start Date y Contract Type pasaron a obligatorios en el alta. Dos gotchas
    resueltos: (1) "Reports To" obligatorio hubiera bloqueado la creación de la primera persona de un
    tenant nuevo (nadie a quien reportar) — se agregó una opción explícita "No manager"; (2)
    "Department" obligatorio hubiera bloqueado el alta en un tenant sin departamentos configurados —
    se agregó el mismo `FieldCatalogMenu` que ya vive en el header de la tabla, ahora también inline
    en el modal.
  - Checkboxes de toda la plataforma rediseñados vía una regla CSS global (caja redondeada con
    `appearance: none`, fill `brand-blue` + check blanco al marcar).
  - **Bug real encontrado**: abrir el `Popover` de `FieldCatalogMenu` desde dentro de un `Modal` y
    presionar Escape cerraba los dos a la vez, no solo el popover. `Modal.tsx`/`Popover.tsx` escuchan
    `keydown` en el mismo target (`document`) y el `Modal` se registra primero — `stopPropagation()`
    no alcanza para frenar un listener hermano en el mismo target. Arreglado en `Popover.tsx`
    registrando su listener con `{ capture: true }` + `stopImmediatePropagation()`. Afecta a cualquier
    combinación Popover-dentro-de-Modal existente, no solo a Payroll.

  **Segunda ronda de fixes** (mismo día, local, sin pushear):
  - Inputs numéricos de toda la plataforma perdieron las flechitas nativas de subir/bajar (regla CSS
    global) — reportado en el form de ajustes del Payroll Run, pero el fix se hizo global porque nada
    en la app depende de "spinnear" un número con el mouse.
  - Las 6 tablas de `PayrollPage.tsx`/`PayrollRunDetailPage.tsx` nunca conectaron el
    `HorizontalScrollbar` establecido — conectado igual que en `EmployeesPage.tsx`.
  - **Almacenamiento y envío del contrato**: `EmployeeCompensation.contractPdf` (`Bytes?`) — una sola
    columna que guarda el PDF vigente, borrador al crear el contrato, sobrescrito por la versión
    firmada al confirmar. El borrador va adjunto al email de invitación; al firmar se dispara un email
    nuevo al firmante con copia al owner y a quien cargó el contrato. Nuevo `contractPdfService.ts`
    (mismo estilo que `payslipService.ts`); `mailer.ts` ganó `attachments` y la función
    `sendContractSignedEmail`. Acción "Resend contract" en el panel de detalle de People (owner-only)
    reenvía lo guardado sin regenerar nada. "View contract" reusa `PayslipPreviewModal`.
  - **Bug de la misma familia que el de Popover/Modal**: cerrar el modal de "View contract" con
    Escape también cerraba el panel completo del empleado. Acá `Modal.tsx` escucha en `document` y el
    panel escucha en `window` (relación real de ancestro) — alcanzó con `stopPropagation()` en
    `Modal.tsx`, sin necesitar `capture`.
  - Verificación del PDF: decodificar a mano los content streams (los `Tj` de `pdf-lib` son hex, no
    texto plano) confirmó que todos los campos están — el iframe de preview se ve en blanco en el
    screenshot de Playwright porque Chromium headless no renderiza PDFs embebidos ahí (mismo mecanismo
    que ya usaba el payslip, no es una regresión).
  - Gap encontrado por el usuario probando lo anterior: el contrato cargado en el alta no se veía en
    ningún lado del panel de detalle de la persona — solo existía dentro del PDF. Se agregó una
    sección "Compensation" a `EmployeeOverviewPanel.tsx` (nuevo endpoint
    `GET /api/hr/employees/:employeeId/compensation`, owner-only) con los botones "View
    contract"/"Resend contract" movidos ahí desde el menú "Actions".
  - **Causa real de "View contract dice que no hay contrato pero sí veo los datos"**: no era un bug de
    lógica (`getEmployeeCompensationSummary` y `getEmployeeContractPdf` usan el mismo `where`). La
    causa real: varios hot-reloads de `tsx watch` chocaron por el puerto (`EADDRINUSE`), dejando el
    servidor sirviendo código anterior a `contractPdfService.ts` en algunos momentos. Arreglado
    matando los procesos colgados y corriendo `scripts/backfill-contract-pdf.ts` contra los 6
    registros existentes.
  - **Loading de la sección "Compensation"**: reemplazado el `<p>Loading…</p>` original por barras
    reusando `.skeleton-row`/`.skeleton-bar` (mismas de `TableSkeleton.tsx`, sin CSS nuevo).
  - **Assignments con Email + sub-pestañas Draft/Confirmed/Terminated**: la tabla ahora muestra
    Nombre/Email/Policy actual/Status, dividida en 3 sub-pestañas (`.mini-toggle-row`). Draft/Confirmed
    usan `getCompensationStatus` con un campo nuevo `isConfirmed` — **no** `confirmedAt`, porque una
    reasignación nunca vuelve a pedir confirmación a alguien que ya firmó su primer contrato, así que
    esa fila siempre tiene `confirmedAt: null` (bug encontrado y corregido en la propia verificación:
    clasificar por `confirmedAt` hubiera mandado a "Draft" para siempre a cualquiera reasignado una
    vez). Terminated es un dataset separado (`listTerminatedCompensations`), de solo lectura.
  - **Estructura inconsistente entre tabs de Payroll**: el tab Timeline tenía sus botones a la altura
    del título de página en vez de debajo de las pestañas, como Assignments y Payment Policies.
    Movido para que las 3 pestañas compartan la misma estructura.

- **2026-08-09 — Currency/Department fix, aclaraciones, migración y deploy a producción, "¿Olvidaste
  tu contraseña?"**:
  - **Currency como texto libre + regresión de ancho en Department**: Currency (alta de persona, bulk
    assign/reassign, pago único) pasó a `<select>` reusando `CURRENCY_CODES`/`currencyLabel`, mismo
    patrón que Settings → Appearance. El botón de "gestionar" agregado al lado de Department el día
    anterior le había roto el ancho — el `<select>` quedó envuelto en un `div` sin `flex-1`/`min-w-0`.
  - **Aclaraciones, no bugs** (preguntas del usuario): "Job Title" aparece dos veces a propósito — el
    de "Role" es el cargo general de la persona (catálogo de la empresa); el de "Job Title (contract)"
    es una foto fija de cómo se llamaba el puesto en ESE contrato específico, deliberadamente no
    linkeado al catálogo. `cadence` (Weekly/Semimonthly/Monthly) y el detalle de días ya son campos
    separados (`PayFrequencyDefinition.cadence` + `.anchorConfig`) — el `name` del dropdown es solo
    una etiqueta de texto libre, no la fuente de verdad.
  - **Migración y deploy a producción**, a pedido explícito del usuario, saltando el flujo habitual de
    pasar por `staging` primero:
    - Producción no tenía nada del schema de Payroll (0 tablas nuevas, 3 columnas legacy de `Employee`
      seguían vivas con datos reales) — se armó un schema *transicional* (el actual + reinsertando
      `hourlyRateCents`/`monthlyRateCents`/`compensationType`/enum `CompensationType` solo para esta
      migración, nunca commiteado) para aplicar TODO lo aditivo (5 tablas nuevas) sin tocar las
      columnas legacy todavía, vía `prisma db push --schema=<transicional> --skip-generate`.
    - `scripts/backfill-payroll-catalogs.ts` sembró pay frequencies/payment methods en los 126
      tenants reales de producción.
    - De 234 empleados reales, 9 tenían datos en los campos legacy — los 9 de tenants de testing
      viejos (confirmado con el usuario: "ninguno de esos tenants son reales, son test de amigos").
      Migrados a `EmployeeCompensation` con una variante del backfill que lee las 3 columnas legacy por
      SQL crudo (el cliente Prisma tipado ya no acepta esos campos) — verificado 9/9. Un caso con datos
      inconsistentes se migró a mano.
    - `prisma db push` (sin `--accept-data-loss`) confirmó que el único cambio pendiente eran esas 3
      columnas + el enum viejo. Recién ahí, `--accept-data-loss` para el borrado real, con conteos de
      tenants/empleados verificados iguales antes y después (126/234).
    - Push de todo el código a `main` → deploy real (`vercel deploy --prod`) → verificado sirviendo
      bien (`/`, `/login` en 200, un endpoint de Payroll devolviendo 401 limpio en vez de 500).
    - `PAYMENT_DATA_ENCRYPTION_KEY` (clave nueva de 32 bytes) cargada por el usuario en Vercel →
      Production, confirmado el nombre exacto y el valor.
  - **Estado de deploy: Payroll EN PRODUCCIÓN desde este día (2026-08-09).**
  - **"¿Olvidaste tu contraseña?"** (pedido del usuario, mismo día): magic link por email para poner
    una contraseña nueva. Modelo nuevo `PasswordResetToken` (mismo patrón que `Invitation`, token
    random + expiración de 1 hora, pero con un flag `usedAt` en vez de un enum `status`).
    `POST /api/auth/forgot-password` nunca revela si el email existe (respuesta genérica siempre,
    evita enumeration); `GET /api/auth/reset-password/:token` valida sin consumir (para poder avisar
    "este link venció" antes de que la persona escriba la contraseña); `POST /api/auth/reset-password`
    consume el token, **borra todas** las sesiones existentes del usuario (a diferencia de
    `changeOwnPassword`, que preserva la sesión actual) y loguea automáticamente con una sesión nueva.
    Frontend: link "Forgot your password?" en `LoginPage.tsx`, `ForgotPasswordPage.tsx` (email) y
    `ResetPasswordPage.tsx` (clon del patrón de `AcceptInvitePage.tsx`). Verificado con Playwright de
    punta a punta: link visible, email sin enumeration, auto-login tras el reset, sesión vieja muerta
    (401), password vieja rechazada, token de un solo uso (reusarlo da 400). Esta pieza se quedó en
    local hasta el 2026-08-11, cuando se pusheó junto con el Block 1 de Admin Center (ver siguiente
    entrada).

- **2026-08-11 — Admin Center: roadmap completo (Blocks 1-8) + UI de Ideas, en producción en ambos
  repos**: implementación completa de `docs/Admin-platform/` (specs de Alejandro) — Platform Roles,
  Tenants (solo lectura), Tickets/Ideas. El punto de partida real fue distinto de lo que los docs
  asumían: `isPlatformAdmin` nunca existió en el schema, admin-center corría 100% sobre
  `DEVTASKS_USER`/`PASS_HASH` sin ninguna conexión al repo principal, y los mockups referenciados
  (`admin-center-*-mockup.html`) no existen en ningún repo — así que Block 1 fue una construcción
  desde cero, no una migración chica, y el UI de Tenants/Tickets se diseñó fresco en el estilo propio
  de admin-center (oscuro/índigo, sin Tailwind), no portando el sistema de diseño del producto
  principal.
  - **Repo principal**: `enum PlatformRole` + `User.platformRole`/`User.createdAt` (aditivo — los
    usuarios previos a esta migración van a mostrar la fecha de la migración como "fecha de alta", no
    la real, por falta de una fuente mejor); `src/lib/platformAuth.ts` (`requirePlatformRole`);
    `enum PlatformStatusDefinition` + modelos `Ticket`/`Idea` (`EntityType` ganó `ticket`/`idea` para
    que el hilo de respuestas reuse `Note`, no una tabla nueva); rutas `/api/platform/*`
    (`src/routes/platform.ts`) para Tenants/Tickets/Statuses; `POST /api/feedback` ahora persiste un
    `Ticket`/`Idea` además de mandar el mail a `FEEDBACK_EMAIL` de siempre.
  - **`northstack-devtasks` (admin.joinnorthstack.com)**: login reescrito para delegar en
    `POST /api/auth/login` del repo principal server-to-server (cuentas reales gateadas por
    `platformRole`, no más contraseña compartida) — el token del repo principal queda solo del lado
    del servidor, en la cookie firmada propia de admin-center, nunca expuesto al browser; secciones
    Tenants y Tickets completas (list/detail/settings), Ideas queda "Próximamente" (backend listo, UI
    es la próxima unidad, ver Ronda 3 más abajo). Se movió `api/lib/` a un `server-lib/` a nivel de
    raíz a mitad de camino — Vercel (plan Hobby) cuenta cada archivo bajo `api/` como una Serverless
    Function (tope 12) y un deploy real falló por esto; terminó el rollout con exactamente 12, sin
    margen.
  - Verificado en producción real con sesiones de prueba temporales (creadas y borradas vía Prisma
    directo, sin necesitar contraseñas de nadie) para cada bloque antes de dar por cerrado — checklist
    completo de verificación humana en `docs/Tareas-QA.md` QA-17.
  - **Ronda 2, mismo día**: el usuario marcó correctamente que la primera pasada se había desviado del
    spec en varios puntos y que faltaba la verificación real en navegador (el checklist de
    `docs/Admin-platform/tareas-admin-center-roles-tenants-tickets.md` la pedía explícitamente, se
    había saltado). Se cerraron 4 gaps reales contra `spec-admin-center-tickets-ideas.md` ("+ Nuevo
    ticket" ahora crea vacío y edita en el detalle en vez de un form de un paso, badge de autor
    Admin/Support/Tenant en el hilo, contador de tickets abiertos en el nav, `color` propio del
    catálogo en `PlatformStatusDefinition` — campo nuevo, aditivo). Y se hizo la pasada de Playwright
    real (contra `vercel dev` local, proxeando a producción real, nunca datos falsos), que encontró 3
    bugs genuinos que ningún `curl` había detectado: encoding de `+`/espacio roto en el proxy (rompía
    toda búsqueda de 2+ palabras), una condición de carrera en `TicketDetailModal`/`StatusSettingsTab`
    (una respuesta vieja podía pisar el estado nuevo justo después de guardar), y `.form-group`
    (Subject/Description/Reply) sin ningún CSS definido en este repo. Todo corregido y re-verificado
    con el mismo script hasta que los 12 checks automatizados pasaron.
  - **Ronda 3, mismo día — UI de Ideas**: el usuario probó el form de feedback él mismo ("ideas is not
    linked") y encontró que, aunque el backend de Idea funcionaba, no había ninguna pantalla en Admin
    Center para verla — el placeholder "Próximamente" seguía ahí. Se construyó `IdeasPage.tsx` +
    `IdeaDetailModal.tsx` (mismo patrón que Tickets, sin assignee porque Idea no tiene
    `assignedToUserId`, y las notas nunca mandan email). Backend nuevo:
    `GET/PATCH /api/platform/ideas[/:id]`, `POST /api/platform/ideas/:id/notes`, `platform_admin`-only
    per la matriz de acceso. **Hallazgo real durante esta ronda**: al agregar las rutas de Ideas se
    volvió a pegar contra el límite de 12 Serverless Functions de Vercel (Hobby plan) — se probó
    consolidar con catch-all routes (`[...path].ts` y `[[...path]].ts`) para ahorrar funciones, pero
    **ambas variantes resultaron poco confiables en `vercel dev` local** (confirmado con `curl`, no
    asumido): la catch-all opcional nunca matcheaba la ruta base sin segmentos, y la catch-all
    obligatoria dejaba de matchear a partir de 2 segmentos (rompía `:id/users` y `:id/notes`). Se
    resolvió con un mecanismo distinto: un solo `api/platform-proxy.ts` + un rewrite en `vercel.json`
    (`/api/platform/:path* -> /api/platform-proxy`), que lee la ruta real de `req.url` en vez de
    depender del router de archivos dinámicos de Vercel — verificado con `curl` contra los mismos casos
    que habían fallado antes (ruta base, 1 segmento, 2 segmentos, GET/POST/PATCH) y también contra
    producción real (no solo local) antes de confiar en el approach. Resultado: 5 funciones en vez de
    12, con margen real para lo que siga. Verificado de punta a punta con Playwright (19/19 checks) y
    todos los datos de prueba limpiados después, incluida una nota que quedó pegada en una Idea real de
    Alejandro durante el testing.
  - **"¿Olvidaste tu contraseña?" pusheado a staging y producción este mismo día**, junto con el
    Block 1 de este rollout (había quedado en local desde el 2026-08-09, ver entrada anterior).

- **2026-08-12 (nota)**: la entrada de "Última actualización" de `docs/general/tareas-desarrollo.md` que
  resume Admin Center como completo en ambos repos está fechada este día — un día después del trabajo
  descripto arriba (Block 1 + Rondas 2 y 3, todas fechadas "mismo día" == 2026-08-11 en la sección
  "Estado actual" del propio archivo). No hay contenido técnico adicional fechado específicamente
  2026-08-12 en la fuente; se deja esta nota solo para no perder la referencia de fecha tal cual
  aparece en el archivo original.

- **2026-08-13 — Tenant Signup + Subscription Plans: implementado completo, solo en local, sin
  pushear**: signup con verificación de email + selección de plan de suscripción. Los 3 documentos de
  spec (`docs/spec-tenant-signup.md`, `docs/spec-subscription-plans.md`,
  `docs/task-breakdown-signup-plans.md`) ya existían sin trackear en el repo desde antes de esta
  sesión.
  - **Backend**: modelo `EmailVerification`, `User.jobFunction`, 5 columnas nuevas en `Tenant`
    (`plan`/`trialEndsAt`/`gracePeriodEndsAt`/`lockedPriceCents`/`lockedPriceSetAt`), `TenantStatus`
    gana `trialing`/`past_due` — ver `docs/database-schema.md` grupo 8 para el detalle completo del
    schema y las decisiones (por qué el token se consume al final y no al validar, por qué
    `checkEmailDomainNotAlreadyRegistered` ahora excluye solo `cancelled` en vez de exigir `active`).
    Rutas nuevas: `POST /api/tenants/signup/start`, `/resend`, `GET /signup/verify/:token`,
    `PATCH /api/tenants/me/plan` (owner-only), y `GET /api/internal/plan-transitions/run` (cron
    interno).
  - **Frontend**: `RegisterPage.tsx` reescrita a 2 pantallas (email → check inbox),
    `CompleteSignupPage.tsx` nueva (survey de 3 pasos en `/register/complete`), `PlansPage.tsx` nueva
    (`/plans`), guard de ruta + banner de `past_due` en `AppLayout.tsx`.
  - 21 tests nuevos (`tests/tenantSignup.test.ts`, `tests/subscriptionPlans.test.ts`),
    `npm run build`/`npm test`/`npm run lint` verdes en back y front.
  - **Gap real encontrado en el spec, resuelto antes de escribir código**: el breakdown pedía "el
    mismo patrón de cron que ya usa Payroll" — Payroll no tiene ningún cron, no existía ningún
    mecanismo de job programado en el proyecto. Confirmado con el usuario: Vercel Cron Job, nuevo
    `vercel.json` → `crons`, endpoint interno protegido por `CRON_SECRET` si está configurado (igual
    que `mailerConfigured()`, no rompe en local si falta la env var). **`CRON_SECRET` queda pendiente
    de cargar en Vercel antes de un deploy real**, mismo caso que `PAYMENT_DATA_ENCRYPTION_KEY` en su
    momento para Payroll.
  - **Bug real encontrado y corregido durante la propia implementación**: el orden original hubiera
    consumido (borrado) el `EmailVerification` *antes* de chequear que el nombre de tenant/email/
    dominio estuvieran libres — si cualquiera de esos fallaba después, la persona se quedaba sin token
    válido por una causa que no tenía nada que ver con su email, forzándola a reiniciar todo el flujo
    de verificación. Reordenado para consumir el token al final, justo antes de la transacción.
  - **Pendiente, explícitamente fuera de esta ronda** (igual que dicen los specs): integración real de
    Paddle, UI de "agregar método de pago", pantalla de autogestión de suscripción, prorrateo, y —
    hallazgo propio, no estaba en el spec — **ningún enforcement de acceso para `suspended`** (el
    status cambia pero nada bloquea requests todavía).
  - **No pusheado a `staging` ni a `main`** — a pedido explícito del usuario, que lo va a probar en su
    propio entorno local primero.
  - **Corrección real del usuario, mismo día**: la primera pasada implementó "Choose your plan" como
    una página propia (`/plans`) que bloqueaba la navegación hasta elegir un plan — no coincidía con
    el mockup real ya aprobado (`subscription-plans-mockup.html`, pegado directamente en el chat;
    nunca había existido como archivo en el repo, así que la primera pasada se armó solo a partir de
    la prosa del spec). Corregido a `PlansModal.tsx` (`components/common/`, `Modal` con prop nueva
    `xwide`, 1024px): se abre una sola vez, automáticamente, apenas se crea el workspace, sobre la
    pantalla que sea — descartable, no bloquea nada, porque el trial de 15 días ya arranca en el
    registro sin importar si se elige un plan. Dismiss persistido en `localStorage` por tenant. A
    pedido explícito, se agregó una 3ra tarjeta "Free Trial" (mismas features que Starter, cierra el
    modal sin pegarle al backend) que no estaba en el mockup ni en el spec original.
  - **Actualización posterior**: este módulo sí terminó pusheándose — **en producción desde el
    2026-08-18**, después de una revisión de código que encontró y corrigió 12 bugs (ver commits
    "Fix critical/important bugs..." y "Resolve remaining efficiency/duplication findings..." del
    2026-08-18/19). El "no pusheado" de arriba describe el estado al momento de construirlo, no el
    estado final.

- **2026-08-19 a 2026-08-22 — Billing Integration: Paddle + Mercado Pago para la suscripción propia
  de Northstack**: integra pagos reales (no de los Clients del tenant — de Northstack cobrándole al
  tenant) vía Paddle (merchant of record, tenants fuera de Argentina, USD) y Mercado Pago (ARS,
  tenants de Argentina), elegido automáticamente por país. Spec + breakdown
  (`docs/general/spec-billing-integration.md` + `task-breakdown-billing-integration.md`, movidos acá
  desde `docs/Task MD/` al cerrar esta ronda) definían 23 unidades en 6 etapas.
  - **Backend**: modelos `Subscription`/`Invoice`/`PlanPrice`/`ProcessedWebhookEvent` (schema
    additivo). Wrappers hand-rolled de cada proveedor (`src/lib/paddle.ts`, `src/lib/mercadopago.ts`
    — `fetch` + `crypto` nativo, sin SDK oficial, misma línea minimalista que el resto del proyecto).
    `checkoutService.ts` (`startCheckout`) cubre suscribirse por primera vez y actualizar método de
    pago como dos intents distintos sobre el mismo endpoint. Webhooks firmados + idempotentes
    (`src/routes/webhooks.ts`) para ambos proveedores, con "nunca confiar en el body del webhook" —
    round-trip a la API del proveedor antes de aplicar cualquier cambio. Self-serve
    (`subscriptionSelfServeService.ts`): cambiar de plan, cancelar, reanudar. Cron de vencimiento de
    trial (`planTransitionService.ts`) actualizado para no tocar tenants que ya tienen un proveedor
    real enganchado.
  - **Frontend**: `BillingPage.tsx` nueva (plan, método de pago, invoices), `AddPaymentMethodModal.tsx`
    y `PaddleCheckoutPage.tsx` (ruta standalone `/billing/checkout`, pestaña propia). Tile de Billing
    movido a "My account" en Settings, visible solo para el owner.
  - **Dos reversiones de modelo de negocio en la misma sesión, ambas a pedido explícito de
    Alejandro**: primero "elegir un plan cobra directo, sin trial"; corregido a "trial real de 15
    días, tarjeta se pide ahora pero el primer cobro real recién a los 15 días" ("no encañar al
    cliente") — implementado con el mecanismo nativo de cada proveedor (`trial_period` de Paddle,
    `free_trial` de Mercado Pago), no un "cobramos después a mano".
  - **Bug real encontrado en producción de código, no en testing manual**: `paddleRequest()` no
    desenvolvía el `{data, meta}` de la API de Paddle — `transaction.id` quedaba `undefined` en
    silencio. Test de regresión agregado (`tests/paddleClient.test.ts`).
  - **Bug real encontrado en testing en vivo contra sandbox**: el webhook de `transaction.completed`
    de Paddle podía llegar con el array `payments` vacío/incompleto en el momento exacto en que
    dispara — se agregó un round-trip a `GET /transactions/{id}` (mismos datos, ya completos ahí) en
    vez de confiar en el body del webhook.
  - **Catch real de Alejandro probando el flujo, no un bug de código**: `startCheckout` le pedía
    siempre un trial fresco de 15 días al proveedor en cada intento de suscripción, sin importar
    cuánto tiempo ya había pasado del trial original del tenant — como nada marca la suscripción
    como real hasta que un webhook confirma el pago, alguien podía arrancar-y-abandonar el checkout
    indefinidamente y, cuando finalmente completara uno, siempre conseguir 15 días frescos desde ese
    momento (trial "interminable"). Corregido: el trial que se le pide al proveedor ahora tiene tope
    en los días que de verdad quedan del `trialEndsAt` original del tenant: si ya venció, cobra de
    inmediato en vez de dar más tiempo gratis. El frontend (`PlansModal`/`AddPaymentMethodModal`) se
    actualizó en paralelo para nunca prometer un trial que el backend no vaya a dar.
  - **Diseño explícito para poder confirmar el flujo sin esperar 15 días reales**: fuera de
    producción real (`PADDLE_ENV !== 'production'` — staging, local, cualquier lugar contra sandbox),
    una suscripción nueva cobra de inmediato en vez de dar trial. Reusa `PADDLE_ENV` existente en vez
    de sumar una env var nueva.
  - **Hallazgo real de infraestructura, no de código**: `staging.joinnorthstack.com` tiene activado
    el Deployment Protection de Vercel (SSO) — bloqueaba con 401 cualquier POST externo, incluidos
    los webhooks reales de Mercado Pago/Paddle, antes de que llegaran a la app. Resuelto con
    `vercel project protection enable --protection-bypass` + el secret como query param
    (`?x-vercel-protection-bypass=...`) en la URL configurada en el dashboard de cada proveedor — ya
    migrado para Mercado Pago, **Paddle sigue pendiente** (ver backlog).
  - **Bug de idempotencia real, encontrado por el propio simulador de webhooks de Mercado Pago**: el
    evento se marcaba "procesado" (insert en `ProcessedWebhookEvent`) *antes* de procesarlo — si el
    procesamiento fallaba después (como pasó con un `data.id` de prueba que no existía, 404 real),
    el evento quedaba marcado como procesado para siempre; un reintento real del proveedor no iba a
    reprocesar nada. Corregido: si el procesamiento tira error, se borra el insert antes de
    relanzar la excepción, para que un reintento real sí reprocese.
  - **90 tests** (`tests/checkoutService.test.ts`, `subscriptionService.test.ts`,
    `subscriptionSelfServe.test.ts`, `webhookSignatures.test.ts`, `paddleClient.test.ts`, + updates),
    `npm run build`/`npm test`/`npm run lint` verdes en back y front en cada push.
  - **Estado actual**: pusheado y probado de punta a punta contra sandbox en `staging`
    (`staging.joinnorthstack.com`), **no pusheado a `main` todavía** — pendiente de code review antes
    de promover, mismo gate que se usó para Signup+Plans. Pendientes concretos anotados en
    `docs/tareas/backlog.md` (webhook de Paddle sin migrar a la URL estable, precios reales de
    Argentina, credenciales de producción de ambos proveedores, prorrateo al cambiar de plan).

- **2026-08-22 — Auditoría de `docs/tareas/backlog.md` contra el código real**: se revisaron los ~34
  ítems pendientes del backlog uno por uno contra el código actual. Dos se confirmaron resueltos y se
  sacaron de `backlog.md` (el resto sigue abierto tal cual estaba):
  1. **Compensación con moneda por registro individual**: ya no es un valor único por tenant.
     `EmployeeCompensation.currency` (`prisma/schema.prisma`) permite que cada registro de
     compensación tenga su propia moneda, con selector ISO-4217 en el formulario de compensación de
     `EmployeesPage.tsx` (`frontend/src/lib/currencies.ts`). El comentario de `Tenant.currency` en el
     schema ya refleja que Opportunity/EmployeeCompensation pueden overridear por registro.
  2. **Enforcement de acceso para tenants `suspended`**: `validateSession` en `src/lib/httpAuth.ts:39-46`
     bloquea con 403 cualquier request que no sea GET cuando `user.tenant?.status === 'suspended'`
     (modo view-only, no lockout total). Confirmado que las 18 rutas tenant-scoped pasan por esta
     función (155 usos de `validateSession`/`authenticateUser` en `src/routes/`), no es un guard
     parcial.

  El resto de los ítems (CRM, UX/UI, Notes/Tasks, y el resto de Infra/Otros — roles custom, panel de
  integraciones, OAuth de Google, OTP/2FA, i18n, logs de auditoría, notificaciones in-app, historial de
  custom fields, hallazgos §2.5/§2.7 de la auditoría de seguridad, `role` arbitrario en registro, tests
  de aislamiento entre tenants, tests de frontend, duplicación de lógica en páginas de listado) se
  confirmaron **todavía pendientes** tal como estaban documentados, sin cambios de texto salvo donde
  `backlog.md` ya se había actualizado por separado (Signup+Plans/Billing Integration, `CRON_SECRET`).

- **2026-08-22/23 — Google Calendar sync + cumpleaños de empleados + tareas completadas fuera del
  Overview** (a `staging` el 23): tres piezas pedidas juntas por Alejandro. Detalle completo en
  `docs/general/database-schema.md` §9, `docs/general/function-index.md` y `Tareas-QA.md` QA-19 —
  acá solo el resumen.
  1. **Google Calendar** — primer OAuth de toda la app. Cada usuario conecta su cuenta personal
     desde Settings → Profile; una vez conectada, sus Tasks con `dueDate` y sus Time Off aprobados
     se sincronizan (unidireccional, best-effort) para que Google dé las notificaciones — se
     descartó construir un sistema de notificaciones in-app propio. Nuevo módulo
     `src/modules/integrations/` (`googleCalendarAuthService.ts`, `googleCalendarSyncService.ts`),
     nueva dependencia `googleapis` (aprobada explícitamente antes de instalar), tokens
     encriptados con una key propia (`GOOGLE_TOKEN_ENCRYPTION_KEY`, mismo patrón AES-256-GCM que
     Payroll pero sin reusar su key). **Bloqueado para probarse de punta a punta**: falta que
     Alejandro cargue `GOOGLE_CALENDAR_CLIENT_SECRET`/`GOOGLE_CALENDAR_REDIRECT_URI` reales de
     Google Cloud Console — sin eso, el botón "Connect" falla de forma prolija (503, toast
     legible, confirmado), pero el flujo real de consentimiento nunca se probó.
  2. **Cumpleaños**: `Employee.birthdate` nuevo (sin encriptar, mismo criterio que
     `startDate`/`nationality`), evento anual recurrente en el calendario del Overview, interno
     únicamente — nunca sincronizado a Google, decisión explícita.
  3. **Tareas completadas**: `listTasksForCalendar`/`listMyTasks` ahora excluyen
     `completedAt != null` del lado del servidor (no solo visual) — la tarea sigue existiendo y
     visible en el tab de su entidad, solo desaparece del calendario y del widget "My tasks".
  - Verificado con Playwright headless + curl contra datos de producción existentes (un empleado y
    una tarea de prueba ya presentes, revertidos después de la verificación) — cumpleaños y
    ocultamiento de completadas confirmados de punta a punta con capturas; Google Calendar no,
    por falta de credenciales reales.
  - Nota de entorno confirmada con Alejandro en esta ronda: `DATABASE_URL` local apunta a
    producción a propósito (no hay DB de dev separada) — cualquier prueba manual local es contra
    datos reales.

- **2026-08-23 — Google Calendar: credenciales reales cargadas, 3 bugs encontrados/corregidos en
  vivo contra `staging`, y Time Off rediseñado a alcance de equipo**: Alejandro consiguió el
  `GOOGLE_CALENDAR_CLIENT_SECRET` real y lo cargó; Claude registró los 3 redirect URIs en Google
  Cloud Console (con Alejandro siguiendo los pasos), cargó las 4 variables nuevas + `APP_BASE_URL`
  (que faltaba para el scope Preview de Vercel) y re-deployó `staging`. Al probar con una cuenta
  real de Google se encontraron y corrigieron, en orden: (1) la pantalla de consentimiento estaba
  en modo "Internal" (config de Google Cloud — Alejandro la pasó a "External" + se agregó como test
  user), (2) el callback pedía el email de la cuenta sin haber solicitado el scope `userinfo.email`,
  crasheaba con un 500 crudo (encontrado leyendo los logs de Vercel del request real — corregido:
  scope agregado + todo el callback envuelto en try/catch), (3) nada de lo ya existente antes de
  conectar se sincronizaba porque el sync es puramente reactivo (corregido con
  `backfillCalendarSyncForUser`, corrido una sola vez al conectar). Detalle completo en
  `Tareas-QA.md` QA-19, sección "Actualización 2026-08-23".
  - **Cambio de diseño, no bug**: Alejandro esperaba que el Time Off sincronizado fuera visible
    para todo el equipo conectado (igual que la vista compartida del Overview), no solo para quien
    se toma la licencia. Se reemplazó `TimeOffRequest.googleCalendarEventId` (un campo, un evento)
    por el modelo `TimeOffCalendarSync` (una fila por cada par solicitud+usuario-conectado — ver
    `database-schema.md` grupo 9), y se actualizó el backfill para traer el Time Off aprobado de
    **todo** el tenant a cualquier usuario que se conecta, no solo el propio. Tasks se mantiene
    personal (solo el calendario de quien tiene asignada la tarea) — no se pidió cambiar eso.
    Pendiente re-probar de punta a punta con el modelo nuevo.

---

## Pendientes explícitos de agosto

Para el agente que arma el backlog consolidado: estos son los ítems que la propia fuente
(`docs/general/tareas-desarrollo.md`) marca como explícitamente inconclusos/pendientes dentro del contenido de
agosto.

**Nota (2026-08-22): esta lista es una foto del momento en que se compiló este archivo, no el estado
actual** — varios de estos ítems ya se resolvieron después (ver las entradas de la línea de tiempo de
arriba y `docs/tareas/backlog.md` para lo que sigue abierto de verdad). En particular: Signup+Plans sí
se pusheó y está en producción desde el 2026-08-18; `CRON_SECRET` ya está cargado en Vercel (Preview y
Production); Paddle/Mercado Pago/UI de pago/autogestión de suscripción se construyeron completos en la
ronda de Billing Integration (misma entrada de arriba).

**Tenant Signup + Subscription Plans (estado al momento de compilar este archivo — ver nota arriba):**
1. **No pusheado a `staging` ni a `main`** — a pedido explícito del usuario, que lo prueba primero en
   su propio entorno local. Es el bloqueador principal: hasta que eso no pase, nada de lo demás abajo
   importa en producción.
2. `CRON_SECRET` — pendiente de cargar en Vercel antes de cualquier deploy real (mismo caso que
   `PAYMENT_DATA_ENCRYPTION_KEY` para Payroll).
3. Integración real de Paddle — pendiente, fuera de alcance de esta ronda.
4. UI de "agregar método de pago" — pendiente.
5. Pantalla de autogestión de suscripción — pendiente.
6. Prorrateo — pendiente.
7. **Enforcement de acceso para tenants `suspended`** — el status cambia en la base pero ningún
   middleware/guard bloquea requests todavía (hallazgo propio del equipo, no estaba en el spec
   original).

**Payroll (en producción, pero con cabos sueltos anotados):**
8. Reporte de "no llega el email de invitación" — confirmado que no es un problema de infraestructura
   ni de código (SMTP verificado funcionando); queda pendiente confirmar si fue spam/promociones o un
   email de prueba no revisable, bloqueado en falta de acceso a la casilla de prueba del usuario.
9. Dos 403 de consola en `/overview` para usuarios `member` (`OverviewPage.tsx` llama
   `listTenantUsers` sin chequear rol) — no forman parte del spec de Payroll, se dejaron sin tocar,
   anotados como backlog de UX/Overview.

**Backlog general reconfirmado durante las auditorías de agosto:**
10. CSV import/export sigue siendo Employees-únicamente — `importClientsFromCsv`/
    `exportClientsToCsv` existen en `csvService.ts` pero quedaron huérfanas de UI desde que se borró
    la página de Clients (rediseño de julio). Extender a Companies/Contacts/Opportunities queda en la
    cola si se quiere ampliar (confirmado que seguía sin resolver en la auditoría del 2026-08-06).
11. FAB de acción primaria en mobile (`docs/design-system.md` §13, Tarea 9c de UX/UI) — confirmado el
    2026-08-06 que sigue sin construir, bloqueado en que `AppLayout.tsx` no tiene todavía un mecanismo
    de "acción primaria por página" que el FAB pueda invocar.
