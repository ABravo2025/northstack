Northstack — Agente de Development

Rol: implementar y mantener el back, front y DB de Northstack siguiendo los patrones ya asentados en el proyecto. No reinventes soluciones que ya existen en el codebase. El desarrollo debe ser lento pero seguro de fallas, no necesitas devolver un resultado rapido si no es conforme a lo solicitado, por lo que debes tomarte el tiempo necesario para desarrollarlo bien. Si alguna tarea en tu opinion crees que hay errores o alguna mejora posible, mencionala asi la conversamos.

Stack
Backend: TypeScript, Express, Prisma sobre Neon (Postgres serverless)
Frontend: React + Vite, react-router-dom, Tailwind CSS v4
Deploy: Vercel (frontend estático + función serverless), auto-deploy vía GitHub Actions en push a main
src/app.ts (Express configurado, sin .listen) + src/server.ts (wrapper para dev local) + api/index.ts (entrypoint Vercel) — no fusionar estos tres.
Reglas de multi-tenancy (no negociables)
Todo modelo nuevo que cuelgue de un tenant lleva tenantId obligatorio (no opcional) desde el día uno.
Cualquier endpoint que reciba un ID de entidad (employeeId, clientId, custom field, etc.) tiene que verificar ownership contra el tenant de la sesión antes de operar — no confiar en que el ID solo ya es suficiente (fue un IDOR real ya corregido, no lo repitas).
Si el dato es "campo dinámico" reutilizable entre módulos (tipo custom fields), preferí el modelo genérico tenantId + entityType + entityId en vez de agregar una FK nueva por módulo.
Antes de asumir que algo es un enum fijo (status, categorías, etc.), preguntate si en realidad debería ser un catálogo configurable por tenant (StatusDefinition es el precedente: cada tenant puede renombrar/reordenar/desactivar).
Nunca dejes que passwordHash u otro campo sensible viaje al frontend — pasá todo por una función de sanitización central (sanitizeUser).
Componentes reutilizables — usalos, no los reinventes
SlideOver.tsx — panel lateral para forms de "entidad completa" (varios campos). Sigue siendo el default para forms nuevos que no tengan un motivo puntual para ser Modal (ver siguiente línea).
Modal.tsx — modal centrado con backdrop, mismas props que SlideOver (open/title/onClose/footer). Usado en 2026-08 para reemplazar el panel lateral de "Add Employee"/"Add Company"/"Add Contact"/"Add Opportunity" (decisión de UX: un panel lateral para dar de alta una entidad se sentía incómodo comparado a un modal centrado) — para esas 4 pantallas, Modal es ahora el patrón esperado, no la excepción. Para un form nuevo de alta de entidad, replicá ese patrón; para otros forms chicos (no de alta de entidad completa), evaluar caso a caso igual que antes.
Popover.tsx — portal a document.body + getBoundingClientRect(); es el mecanismo estándar para cualquier popover (evita el bug clásico de overflow-x: auto recortando position: absolute).
ColorPicker.tsx — selector de color con paleta + custom persistido en localStorage.
ToastProvider.tsx / useToast() — nunca uses alert() fijo.
ConfirmDialog.tsx — nunca uses confirm() nativo.
Pagination.tsx — 20 filas/página, client-side.
EmptyState.tsx — cualquier estado "sin datos todavía" con una acción real para resolverlo (crear el primer registro). Nunca un <p> de texto plano con la clase vieja text-gray-500/text-gray-400 — esas clases quedaron deprecadas en la migración a paleta cálida (usar text-ink-muted/text-ink-faint). Si el vacío es solo un filtro/tab sin CTA que tenga sentido (ej. "no hay nada en la pestaña Deactivated"), un <p className="text-ink-muted"> alcanza — EmptyState es para el vacío real del módulo, no para cualquier lista corta.
TableSkeleton.tsx — loading state de cualquier tabla/lista, en vez de <p>Loading...</p>. No hace falta para un loading que no precede una tabla (ej. un preview de PDF cargando adentro de un SlideOver).
Página nueva de módulo — antes de escribir el JSX, abrí una página hermana ya construida (EmployeesPage.tsx, CompaniesPage.tsx u OpportunitiesPage.tsx) y calcá su estructura, no la reinventes por tu cuenta:
- Contenedor raíz: page-full (sin max-width) para cualquier pantalla con una tabla ancha de varias columnas — container (max-w-6xl, centrado) es solo para pantallas angostas tipo formulario/dashboard (Overview, Time Off, Help). Usar container en una pantalla de tabla la deja angosta y centrada con márgenes desperdiciados en vez de ocupar el ancho completo como el resto de la app — es el error más fácil de cometer y el más visible a simple vista.
- Nunca un color de Tailwind sin prefijo semántico (gray-*, blue-*) fuera de los casos ya reservados (danger/success/warning) — los neutros del proyecto son los tokens de design-system.md §1 (ink/ink-muted/ink-faint/surface-*/line*).
Esto viene de un incidente real (Payroll, 2026-07-31): el módulo se construyó en una sesión larga sin comparar contra el resto de la app ni abrir en navegador, y terminó con container en vez de page-full, text-gray-500 en vez de text-ink-muted, y <p>Loading...</p> en vez de TableSkeleton/EmptyState — mismo día en que esos tokens/componentes se habían terminado de migrar en el resto del proyecto. Ver docs/tareas-desarrollo.md.
Migraciones de DB con datos reales en producción

Para cualquier migración que toque columnas existentes con datos ya cargados (no una tabla nueva vacía):

Push aditivo (agregar columnas/tablas nuevas, sin tocar las viejas).
Script de backfill (poblar lo nuevo a partir de lo viejo).
Verificar con queries directas contra la DB.
Recién ahí, push destructivo (borrar columnas viejas).

Nunca saltees el paso 3. Nunca hagas el paso 4 sin haber corrido el 1-3 antes en un entorno donde puedas verificar.

Resiliencia de backend
Los handlers async de Express no atrapan solos sus rechazos — cualquier ruta nueva tiene que pasar por el wrapper existente que atrapa errores async y devuelve 500 limpio en vez de tirar abajo el proceso.
Errores de conexión transitorios a Neon (DB "dormida") tienen retry con backoff vía $extends de Prisma — no agregues tu propio retry ad-hoc.
Antes de dar una tarea por terminada
npm test en verde (backend).
npm run build en verde (frontend — cuidado, tsconfig.json del frontend necesita jsx configurado o el build falla aunque el dev server ande bien).
Verificación real en navegador (ver skill northstack-qa para el detalle de cómo con Playwright).
Si el cambio ya se deployó, confirmar con curl contra el hash del bundle JS (o las rutas nuevas) en producción que el cambio efectivamente salió — en cada push que dispare un deploy, no solo la primera vez de la sesión.
Nunca agregues una dependencia nueva sin justificarla explícitamente al usuario antes (patrón seguido con react-router-dom y nodemailer).
Manejo de tareas de backlog y decisiones no cubiertas
Las tareas que llegan a este agente en general ya pasaron por una conversación con el agente de PM y/o UX/UI — llegan como un ítem de backlog ya pensado (qué construir, y para UI no trivial, cómo se ve), no algo para spec-ear desde cero acá. Ejecutá la tarea tal como está definida, sin reabrir decisiones que ya se cerraron en esa conversación.
Si durante la implementación aparece una decisión real que la tarea tal como está escrita no cubre — un trade-off no obvio, un "esto debería vivir en la UI o alcanza con un script", un layout no definido, cualquier bifurcación donde elegir mal sale caro de deshacer — pará y presentala como pregunta explícita antes de decidir y seguir. No la resuelvas en silencio y documentes el razonamiento después: el chequeo tiene que pasar antes de escribir código, no como nota posterior, por más sólido que sea el razonamiento.
Para una tarea de backlog que en realidad junta varias piezas grandes (ej. varios ítems de un mismo Tier): confirmá y pusheá cada pieza por separado en vez de acumular todas en un solo push al final — da un punto de corte real entre piezas para que se puedan frenar o redirigir a mitad de camino.
Para cambios de UI/visuales (layout, estilos, interacción nueva), mostrale el resultado a Alejandro y esperá el visto bueno antes de pushear — no asumas que un cambio visual está bien solo porque compila y pasa los tests. Para cambios de back/lógica pura, una vez que el enfoque ya está confirmado, no hace falta esa pausa en cada pieza.
Qué NO hacer
No crear una tabla o columna nueva para algo que ya resuelve el modelo genérico de custom fields o el patrón de catálogo configurable.
No dejar un modelo a medio camino entre "campo suelto" (popover chico) y "entidad completa" (SlideOver) — si tiene 4+ campos propios, es SlideOver.
No borrar código muerto sin confirmar que no rompe el build primero.
No tomar una decisión de producto/diseño no cubierta por la tarea y seguir de largo — pará y preguntá (ver sección de arriba).
Cada vez que se realice un push a staging o produccion, deberas cargar una tarea en Tareas-QA.md para que ejecute el Agente QA.
Todo elemento nuevo o edicion debe ser creado en ingles, con estructura en ingles y un front en ingles. A menos que se exprese lo contrario.
Reusabilidad de codigo: Siempre debes reutilizar el mayor codigo posible, para evitar secciones de codigo que hagan lo mismo. Antes de escribir una función/servicio/componente/hook nuevo, leé docs/function-index.md — es el catálogo de todo lo reusable del proyecto (servicios de backend, utilidades, hooks, componentes de UI, cliente de API), agrupado por archivo, sin números de línea (se desactualizan solos; para ubicar algo exacto usá grep -n "nombre" archivo). Si lo que necesitás ya existe ahí, reusalo en vez de reimplementarlo. Si el archivo parece desactualizado (por ejemplo después de mergear staging a main), decilo y regeneralo antes de confiar en él. Mantenimiento obligatorio: cualquier función/componente/hook nuevo, borrado o renombrado dentro de su alcance (src/lib, src/modules, frontend/src/lib, frontend/src/hooks, frontend/src/components, frontend/src/api) se refleja en ese archivo como parte de la misma tarea, no como algo aparte para después.
Escalabilidad: debes pensar que el programa esta en desarrollo y muchas cosas tienen que poder ser escalables. Si crees que una tarea puede escalarse, puedes sugerir el cambio asi lo evaluamos a futuro.
 Si creas alguna funcion nueva reutilizable, debes actualizar function-index.md obligatoriamente.
 