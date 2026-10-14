# Spec Shifts — Fase 2 (fichaje, intercambio de turnos y horas por proyecto)

**Estado:** aprobada por Alejandro el 2026-10-14 con las decisiones de §0.1. En construcción en `staging`; se prueba todo junto al final (Alejandro: "hacelos en el orden que te parezca y después testeamos todo junto").
**Base:** la fase 1 (`spec-shifts.md`, Unidades 1-13) está completa y en producción desde el 2026-10-13.
**Origen:** decisiones de Alejandro del 2026-10-04 ("Segunda etapa: bolsa e intercambio de turnos —
prioridad alta—, presupuesto de horas por proyecto, informe de horas para el cliente, cronograma sugerido
automático") y del fichaje: "sin tablet; QR impreso por sede escaneado con el celular propio, o fichaje
directo desde la app".

---

## 0. Qué entra y en qué orden

| Bloque | Para qué sirve | Prioridad |
|---|---|---|
| **A. Bolsa e intercambio de turnos** | Que un hueco o un imprevisto se resuelva entre la gente, sin que el manager llame uno por uno | Alta (lo pidió Alejandro) |
| **B. Fichaje (entrada/salida)** | Saber quién llegó, a qué hora y cuánto trabajó de verdad; horas reales en el timesheet | Alta (lo pidió el laboratorio) |
| **C. Presupuesto de horas por proyecto** | Avisar antes de pasarse de las horas vendidas | Media |
| **D. Informe de horas para el cliente** | Mandarle al cliente el detalle de horas de su proyecto (PDF/link) | Media |
| **E. Cronograma sugerido** | Proponer una semana armada respetando reglas y disponibilidad | Baja (la más compleja; al final) |

Cada bloque se puede pasar a producción por separado.

### 0.1 Decisiones de Alejandro (2026-10-14)

1. **Un QR fijo por locación**, impreso una vez. La verificación de ubicación queda como opción por
   locación, apagada por defecto.
2. **Aprobaciones por defecto** (configurables en Settings → Turnos): un intercambio entre dos personas
   necesita **aprobación del manager**; un turno libre en la bolsa es **del primero que lo toma**.
3. **Fichar sin turno se permite**: se crea solo un turno en el calendario, marcado **tiempo extra**, para
   esa persona en esa locación (publicado y aceptado), y el manager lo ve para revisar.
4. **Pausas de las dos formas**, a elección de cada persona: botones Iniciar/Terminar pausa, o cargar los
   minutos de pausa al fichar la salida.
5. **Push al celular (Firebase): más adelante**, fuera de esta fase.
6. **Orden libre**; se prueba todo junto al final. Orden elegido: A → B → C → D → E.
7. **El QR es un componente genérico** (cualquier texto o link), porque se va a reusar para la
   **verificación en dos pasos con Google Authenticator** (bloque F, futuro).

## 1. Restricciones que condicionan el diseño

1. **Cron una vez por día** (Vercel Hobby; Alejandro descartó GitHub Actions y Vercel Pro). No hay
   avisos "en el momento" que dependan del reloj: no se puede mandar "no fichaste y tu turno empezó
   hace 10 minutos". Todo lo que es en vivo se **calcula al abrir la pantalla** (por ejemplo, el tablero
   "Quién está" marca a quien no fichó), y los resúmenes salen en el cron de la mañana.
2. **Sin push al celular.** Los avisos son campana + email. Push nativo en Android necesita Firebase
   Cloud Messaging (servicio nuevo, gratis): ver pregunta P5.
3. **Todo el que ficha o recibe turnos es usuario** (decisión de fase 1), así que el fichaje usa la sesión
   normal de Northstack en su celular: no hay fichaje anónimo.
4. Bilingüe desde el primer commit, `TableBody` en toda tabla, emails con la plantilla común y con su
   categoría en las preferencias de email.

---

## A. Bolsa e intercambio de turnos

### A.1 Qué ve cada uno
- **Turnos abiertos (bolsa):** un turno publicado con lugares sin cubrir puede marcarse **"Abierto a
  postulación"**. Le aparece en **Mis turnos → Disponibles** a quien puede tomarlo (ver A.3). La persona
  toca **Lo tomo**.
- **Ceder un turno:** desde Mis turnos, en un turno aceptado: **No voy a poder → Buscar quien me cubra**.
  El turno pasa a la bolsa con su lugar marcado "a cubrir"; la persona sigue asignada hasta que alguien
  lo toma (así nunca queda descubierto sin que el manager se entere).
- **Intercambiar:** **Cambiar con alguien** → elige a una compañera y uno de sus turnos. Ella recibe la
  propuesta y acepta o rechaza.
- **Manager:** una bandeja **Turnos → Pedidos** con lo que necesita su aprobación, y en el cronograma
  cada turno muestra si tiene un pedido en curso.

### A.2 Aprobación (configurable en Settings → Turnos)
- `allowSwaps` (ya existe en `ShiftsSettings`, reservado para esto): activa ceder e intercambiar.
- Nuevo `swapApproval`: **manager** (default) | **automática** (cuando la otra persona acepta y se
  cumplen las reglas, queda hecho).
- Nuevo `openShiftApproval`: **manager** | **primero que llega** (default).
- Quien aprueba: quien gestiona turnos de esa locación (permiso `manage_shifts` o responsable de la sede).

### A.3 Reglas (las mismas de la fase 1, evaluadas en el momento de tomar o aceptar)
- **Bloquean:** superposición con otro turno propio, persona sin usuario activo, turno ya empezado.
- **Avisan:** ausencia aprobada, feriado, fuera de disponibilidad, descanso mínimo, habilidad faltante
  o vencida. Con un aviso, la persona puede postularse igual pero **siempre requiere aprobación** del
  manager aunque la aprobación esté en "automática/primero que llega".
- Un pedido vence solo cuando empieza el turno (queda "Vencido" y se avisa a quien lo pidió).

### A.4 Avisos
Campana + email (nueva categoría de email `shiftSwaps`): a la persona propuesta, a quien aprueba, y el
resultado a todos los involucrados. Al concretarse, se actualiza el evento de Google Calendar / `.ics`
de los dos (mismo mecanismo de la fase 1: se quita del que sale, se agrega al que entra).

### A.5 Datos
- `Shift.openToClaim Boolean @default(false)`.
- `ShiftChangeRequest`: `type (claim | give | swap)`, `shiftId`, `fromAssignmentId?`,
  `requestedByEmployeeId`, `targetEmployeeId?`, `targetAssignmentId?` (el turno que se ofrece a cambio),
  `status (pending_peer | pending_manager | approved | declined | cancelled | expired)`, `reason?`,
  `decidedById?`, `decidedAt?`, `warnings Json?` (los avisos vistos al pedir). Todo al Activity Log.

---

## B. Fichaje

### B.1 Cómo ficha la persona (sin tablet)
- **QR por locación:** en Settings → Turnos → Locaciones, **Imprimir QR** genera una hoja con el QR de esa
  sede. Se pega en la entrada. La persona lo escanea con la cámara de **su** celular → se abre
  `app.joinnorthstack.com/clock/<código>` (en el navegador o en la app Android) → con su sesión iniciada
  ve **Fichar entrada** / **Fichar salida**, con el turno que corresponde.
- **Desde la app/web:** botón **Fichar** en Mis turnos, para las sedes que lo permitan.
- **Método por sede:** `clockMethod = off | qr | app | qr_or_app` (decisión de Alejandro: se elige por sede).

### B.2 Qué se registra
- `ClockEntry`: `employeeId`, `locationId`, `shiftAssignmentId?` (si había turno; también se puede fichar
  sin turno si la sede lo permite), `clockInAt`, `clockOutAt?`, `method (qr | app | manager)`,
  `breakMinutes`, `status (open | closed | auto_closed | corrected)`.
- **Nunca se pisa un fichaje:** una corrección guarda el valor original y el nuevo, con motivo y quién la
  hizo (`ClockCorrection`), visible en el Activity Log. Sirve como registro de jornada ante una
  inspección.
- **Olvidó fichar la salida:** el cron diario cierra los fichajes abiertos a la hora de fin del turno (o a
  las 12 h si no había turno), los marca **"Cerrado automáticamente — revisar"** y avisa a la persona y al
  manager.

### B.3 Lo que se calcula
- **Llegada tarde:** entrada después del inicio del turno + `lateToleranceMinutes` (setting, default 5).
- **Ausente:** turno aceptado, terminado y sin fichaje.
- **Horas reales:** salida − entrada − pausas. En el **timesheet**, la sugerencia del turno usa las horas
  fichadas en vez de las planificadas (y lo dice: "fichado 8h 12m · planificado 8h").
- **Reportes:** columnas **Fichado**, **Tardanzas** y **Ausencias** por persona; en el cronograma, cada
  turno pasado muestra si se cumplió.
- **Tablero "Quién está"** (Turnos → Hoy): por sede, quién fichó, quién falta (turno empezado sin entrada),
  quién ya salió. Se calcula al abrirlo.

### B.4 Resumen diario (cron de la mañana)
A cada manager de sede: ausencias y tardanzas de ayer, y fichajes cerrados automáticamente para revisar.
A cada persona: si tiene un fichaje para revisar. Categoría de email nueva `attendance`.

### B.5 QR y ubicación (decidido)
- **Un QR fijo por locación** (código aleatorio, regenerable si se filtra: el viejo deja de servir).
- **Ubicación opcional por locación** (`requireLocation`, apagado por defecto): si está activa, al fichar
  el celular comparte su ubicación y se compara con la de la sede (radio configurable, 150 m por defecto);
  lejos, se ficha igual pero queda marcado "fuera de la sede".
- El QR se dibuja con un **componente genérico** (`QrCode`, recibe cualquier texto) que después usa la
  verificación en dos pasos.

### B.6 Fichar sin turno (decidido)
Si la persona ficha en una locación sin turno ese día, al fichar la salida se crea un turno **publicado,
aceptado y marcado `isOvertime`** con esas horas, para esa persona y esa locación. Aparece en el
cronograma con la marca "Tiempo extra" y en la campana de quien gestiona esa locación.

### B.7 Pausas (decidido)
Las dos formas conviven y cada persona usa la que quiera: **Iniciar pausa / Terminar pausa** (cada pausa
queda registrada) o, al **Fichar salida**, cargar los minutos de pausa. Si usó los botones, el campo viene
completado con la suma.

---

## C. Presupuesto de horas por proyecto

- En el proyecto (módulo Projects): **Horas presupuestadas** (opcional) y, si se quiere, por fase.
- El proyecto muestra **usadas / presupuestadas** con una barra (verde, ámbar desde 80%, rojo al pasar),
  contando las horas del timesheet imputadas a ese proyecto (todas o solo aprobadas: setting).
- Aviso (campana + email, categoría `projectBudget`) al dueño del proyecto al cruzar 80% y 100%, una
  sola vez por umbral (lo detecta el cron diario o al cargar horas).
- Reportes: columna **Presupuesto** al agrupar por proyecto.
- Datos: `Project.budgetMinutes Int?`, `ProjectPhase.budgetMinutes Int?`, `Project.budgetNoticeLevel Int?`.

## D. Informe de horas para el cliente

- Desde el proyecto o desde Reportes (agrupado por empresa): **Informe para el cliente** de un período →
  PDF con logo de la empresa, horas por día / persona / tarea (con o sin nombres de personas, a elección),
  total y facturable. Reusa el PDF de contratos (`contractPdfService.ts`) como base.
- **Enviar por email** al contacto principal de la empresa, o **link privado** de solo lectura que vence
  (30 días), sin necesidad de usuario.
- Solo horas de semanas aprobadas.
- Datos: `ClientHoursReport` (`companyId`, `projectId?`, `from`, `to`, `tokenHash`, `expiresAt`,
  `options Json`, `createdById`).

## E. Cronograma sugerido (al final)

- En el cronograma: **Sugerir semana** → toma los turnos sin cubrir (o las plantillas/la semana anterior)
  y propone a quién asignar cada uno: respeta bloqueos, minimiza avisos (disponibilidad, descanso,
  habilidades) y reparte horas de forma pareja.
- Todo queda como **borrador**: el manager revisa, cambia y publica. Nunca publica solo.
- Primera versión: algoritmo voraz con puntaje (sin IA). Más adelante se puede ofrecer vía MCP/IA
  (`spec-mcp-server.md` §10).

---

## F. Verificación en dos pasos (futuro, fuera de esta fase)

Pedido de Alejandro (2026-10-14): en Perfil, **Activar verificación en dos pasos** muestra un QR (el mismo
componente `QrCode`) con un `otpauth://` para Google Authenticator; al iniciar sesión se pide el código de
6 dígitos (TOTP, RFC 6238), con códigos de respaldo. Spec propia cuando se encare.

## 2. Permisos y planes

| Qué | Permiso | Plan |
|---|---|---|
| Postularse, ceder, intercambiar | Ninguno (propios turnos) | Starter y Growth |
| Aprobar pedidos | `manage_shifts` o responsable de sede | Starter y Growth |
| Fichar | Ninguno (sede con fichaje activo) | **Growth** (fase 1 §0.3: "más adelante, fichaje") |
| Corregir fichajes, tablero "Quién está" | `manage_shifts` o responsable de sede | Growth |
| Presupuesto por proyecto | `manage_projects` | Growth |
| Informe para el cliente | `manage_projects` o `approve_timesheets` | Growth |
| Cronograma sugerido | `manage_shifts` | Growth |

## 3. Unidades

| # | Unidad | Incluye | Estimado |
|---|---|---|---|
| F2-1 | **Pedidos: backend** | `ShiftChangeRequest`, `openToClaim`, reglas al tomar/aceptar, aprobación según settings, vencimiento, calendario, avisos, tests | 1½ sesiones |
| F2-2 | **Pedidos: pantallas** | Mis turnos → Disponibles / Ceder / Cambiar; Turnos → Pedidos del manager; marcas en el cronograma; settings | 1½ sesiones |
| F2-3 | **Fichaje: backend** | `ClockEntry`, `ClockCorrection`, método por sede, QR por sede (código regenerable), tardanzas/ausencias, cierre automático en el cron | 1½ sesiones |
| F2-4 | **Fichaje: pantallas** | Página `/clock/<código>`, botón Fichar, hoja imprimible del QR, tablero "Quién está", correcciones, ubicación si se aprueba (b) | 1½ sesiones |
| F2-5 | **Fichaje en timesheet y reportes** | Horas fichadas en sugerencias, columnas Fichado/Tardanzas/Ausencias, resumen diario | 1 sesión |
| F2-6 | **Presupuesto por proyecto** | Campos, barra, avisos 80/100%, columna en reportes | 1 sesión |
| F2-7 | **Informe para el cliente** | PDF, envío por email, link privado | 1½ sesiones |
| F2-8 | **Cronograma sugerido** | Algoritmo, botón, borradores, tests | 2 sesiones |
| F2-9 | **Cierre** | Help Center, anuncio, handoff, QA | ½ sesión |

**Total estimado:** ~12 sesiones. A (F2-1/2) y B (F2-3/4/5) se pueden promover sin esperar al resto.

## 4. Preguntas (respondidas el 2026-10-14, ver §0.1)

- **P1. Seguridad del QR:** ¿(a) solo QR, o (b) QR + ubicación opcional por sede? (recomendado: b)
- **P2. Aprobación por defecto:** intercambios con aprobación del manager y turnos abiertos "primero que
  llega", ¿está bien como default?
- **P3. Fichar sin turno:** ¿se permite fichar en una sede sin tener turno ese día (por ejemplo, para
  horas extra), quedando para revisión del manager?
- **P4. Pausas:** ¿alcanza con cargar los minutos de pausa al fichar la salida, o necesitan fichar
  inicio y fin de cada pausa?
- **P5. Push al celular:** ¿sumamos Firebase Cloud Messaging (servicio nuevo, gratis) para avisos al
  instante en la app Android (pedido de cambio, turno publicado)? Sin eso siguen siendo campana + email.
- **P6. Orden:** ¿arrancamos por A (intercambios) como dijiste, o por B (fichaje) porque lo pide el
  laboratorio?

## 5. Verificación (cuando se construya)

Staging con dos sedes: ceder un turno y que otra persona lo tome (con y sin aprobación); intercambio
aceptado y rechazado; pedido que vence al empezar el turno; regla que bloquea (superposición) y que avisa
(habilidad vencida → requiere aprobación). Fichaje: escanear el QR impreso desde un celular Android (app y
navegador), llegar tarde, olvidar la salida (cierre automático del cron), corregir con motivo, ver el
tablero "Quién está" y las horas fichadas en el timesheet y en Reportes. Presupuesto que cruza 80% y
100%. Informe para el cliente por email y por link. Semana sugerida revisada y publicada. Todo en EN y ES,
claro y oscuro, celular sin scroll lateral.
