# Design system — Northstack

Referencia escrita de las convenciones que ya existen en la práctica (clases consistentes en
`frontend/src/App.css`, un solo estilo de ícono en `frontend/src/components/Icons.tsx`) pero nunca
se habían documentado — cada pantalla nueva tenía que inferirlas leyendo otras pantallas. Este doc
no cambia código, es la referencia para que las próximas pantallas no reinventen el patrón.

Origen: ítem de `### UX / Interfaz` en `docs/tareas-desarrollo.md` (recorrido completo de interfaz,
2026-07-21), implementado 2026-07-22. Paleta cálida + acento terracota, escala de alturas, dark mode
de 3 planos y patrón mobile agregados 2026-07-31 (`docs/tareas-ux-ui.md`).

## 1. Color

**Tokens de marca** (`frontend/src/index.css`, bloque `@theme`) — sin cambios:

| Token | Hex | Uso |
|---|---|---|
| `brand-navy` | `#0d2a48` | Fondo del panel izquierdo de auth; base de `--color-ink` |
| `brand-blue` | `#3c6da1` | **Reservado para selección/activo** (ver regla abajo) — ya no es el acento de acción |
| `brand-blue-light` | `#8dbada` | Variantes claras sobre fondo oscuro (texto/bordes en `.auth-left`) |
| `brand-cream` | `#f8f5f0` | Alias legado de `--color-surface-0` (se mantiene para no romper referencias sueltas; no usar en código nuevo) |

**Superficies, bordes y texto** — reemplazan `gray-*`/`white` planos por una escala cálida (piedra/hueso, no gris azulado):

| Token | Hex | Uso |
|---|---|---|
| `surface-0` | `#f8f5f0` | Fondo de página, topbar, sidebar, `thead` |
| `surface-1` | `#fffefb` | Tarjetas, popovers, inputs, filas de tabla |
| `surface-2` | `#f3efe8` | Celdas vacías de calendario, hover de fila/celda |
| `line-strong` | `#d8d1c5` | Borde de input, botón secundario, bordes dashed |
| `line` | `#e6e0d6` | Borde de tarjeta, divisores de sección |
| `line-soft` | `#f0eae1` | Separador de fila de tabla, borde de `.field-group` |
| `ink` | `#0d2a48` (= `brand-navy`) | Texto principal |
| `ink-muted` | `#6f6a62` | Celdas secundarias, descripciones |
| `ink-faint` | `#a09a90` | Labels, placeholders, metadata, headers de sección |

**Acento de acción** (reemplaza `brand-blue` como color de "hacer algo"):

| Token | Hex | Uso |
|---|---|---|
| `accent` | `#b8502f` | `.btn-primary`, `.btn-outline`, links de acción, foco de teclado (`:focus-visible`) |
| `accent-hover` | `#9c4227` | Hover de `.btn-primary` |
| `accent-tint` | `rgba(184,80,47,.14)` | Fondos de estado activo (uso puntual, no `.sidebar-link.active` en claro — ver regla abajo) |
| `accent-soft` | `rgba(184,80,47,.06)` | Reservado para la celda "hoy" del calendario (token definido, no cableado todavía) |
| `avatar-bg` | `#e8c9a0` | Fondo de `.avatar`, `.kc-owner`, `.entity-card-avatar` en claro |

**Regla de selección vs. acción**: `brand-blue` se reserva para *selección/activo persistente* — `.sidebar-link.active`, `.view-tab.active`, `.toggle-opt.active`, `.mini-toggle-opt.active`, `.dropdown-trigger.dt-status`, `.role-chip.chip-blue`, `.task-checkbox`, `.col-resize-handle:hover`, `.hscrollbar-thumb:hover`. Todo lo demás que antes era `brand-blue` (botón primario, links de "add filter"/"manage options", el punto del changelog, `.tb-btn .filter-count`) pasa a `accent`. Antes de agregar un uso nuevo de color en un botón o link de acción: es `accent`, no `brand-blue`.

**Colores semánticos** — nunca son el acento de marca, cada uno tiene un significado fijo:

| Color | Tailwind | Uso |
|---|---|---|
| Danger | `red-600` / `red-700` (hover) | `.btn-danger-solid` (confirmar en `ConfirmDialog`), `.icon-btn.danger` |
| Success | `emerald-600` / `emerald-700` (hover) | `.btn-success` — confirmaciones positivas explícitas *que compiten con una acción negativa en la misma fila* (Approve/Reject en Time Off). No usarlo para un CTA solo en pantalla (empty state) — eso es `.btn-primary` |
| Warning | `amber-*` | Estados de alerta no destructivos (usar con criterio, no hay clase dedicada todavía) |
| Neutral | `line-strong` / `ink` | `.btn-secondary` (ahora outline, no relleno gris — ver §3) |

**Dark mode — tres planos cálidos** (`--color-dark-*`, reemplazan `dark:bg-black`/`dark:bg-gray-900` parejos):

| Token | Hex | Uso |
|---|---|---|
| `dark-page` | `#16130f` | Fondo de página, sidebar, topbar (par oscuro de `surface-0`) |
| `dark-surface` | `#1e1a16` | Tarjetas, tabla, panel, popover (par oscuro de `surface-1`) |
| `dark-raised` | `#221d18` | `thead`, header de sección — **excepción**: en claro estas viven en el plano de página (`surface-0`), en oscuro se elevan a un tercer plano propio para que se distingan del fondo |
| `dark-line` | `#2e2823` | Par oscuro de `line`/`line-strong` (no hay una versión "strong" separada en oscuro) |
| `dark-line-soft` | `#262019` | Par oscuro de `line-soft` |
| `dark-ink` | `#efe8df` | Par oscuro de `ink` |
| `dark-ink-muted` | `#a89e92` | Par oscuro de `ink-muted` |
| `dark-ink-faint` | `#8b8177` | Par oscuro de `ink-faint` |

Los 5 pares de contraste (`dark-ink`/`dark-ink-muted`/`dark-ink-faint` contra sus fondos, `accent` contra `dark-page`, cada `.category-chip` en oscuro) están verificados ≥ AA (4.5:1 texto normal, 3:1 texto grande/UI) — ver `docs/tareas-ux-ui.md` Tarea 8.

**Gotcha de Tailwind v4 encontrado 2026-07-31**: un token `--color-X-N` cuyo nombre termina en un dígito suelto (`--color-dark-0`, `--color-dark-1`, `--color-dark-2`) usado con el prefijo de variante `dark:` (`dark:bg-dark-1`) compila **sin** la declaración — Tailwind parece confundir el sufijo numérico con un shade y descarta la utilidad en silencio, sin error de build. Nombres de token sin dígito final (`dark-line`, `dark-ink-muted`) no tienen el problema. Por eso los 3 planos se llaman `dark-page`/`dark-surface`/`dark-raised` y no `dark-0`/`dark-1`/`dark-2`. Si aparece un color que "no cambia" en dark mode a pesar de tener la clase `dark:` correcta en el código fuente, comparar el CSS compilado (`curl` al dev server o `dist/assets/*.css`) contra el `@apply` — si falta la declaración adentro del bloque `&:where(.dark, .dark *)`, es este bug.

## 2. Tipografía

Dos clases reusables en `App.css`:

- **`.page-title`** — 1.125rem / 600 (`text-lg font-semibold`), color `text-brand-navy
  dark:text-gray-100`. Mismo resultado visual que `.page-toolbar h2` (que se deja igual, sin
  reescribir a `.page-title` para no arriesgar una regresión de cascada) — usar `.page-title`
  para headings de página que no viven dentro de un `.page-toolbar`.
- **`.card-title`** — 1rem / 700 (`text-base font-bold`), mismo color. Reemplaza cualquier `<h3>`
  suelto dentro de un `.card` (ver `ProfileSettingsPage.tsx`, `CompanyAppearancePage.tsx`,
  `CompanyUsersPage.tsx` para el patrón de uso).

El cuerpo de texto de toda la app es siempre `text-sm` de Tailwind (0.875rem) — sin excepciones.
Texto auxiliar/secundario (hints, metadata) usa `text-xs` + `text-ink-muted` (o `text-ink-faint` para
metadata todavía más discreta — labels uppercase, placeholders).

## 3. Botones

Jerarquía completa (de más a menos peso visual). **Regla de conteo**: máximo un `.btn-primary`
visible por pantalla — si hay dos acciones que compiten, la segunda es `.btn-secondary` o `.btn-ghost`.

| Clase | Relleno | Uso | Regla |
|---|---|---|---|
| `.btn-primary` | Sólido `accent` | La acción principal de la pantalla (Add/Create/Save) | Máximo 1 por pantalla |
| `.btn-outline` | Borde `accent`, fondo transparente | Alternativa de bajo énfasis sobre fondo claro | Borde + texto en `accent`, no `brand-blue` |
| `.btn-secondary` | Borde `line-strong` + fondo `surface-1` | Cancel, acciones de fila que no son la primaria | Ya **no** es relleno gris sólido (pesaba igual que `.btn-primary` y se leía "deshabilitado") — corregido 2026-07-31 |
| `.btn-ghost` | Transparente, fondo solo en hover | La acción de *menor* peso (Dismiss, "Load sample data", Cancel de un popover) | Nuevo 2026-07-31 |
| `.btn-danger-solid` | Sólido rojo | El botón de **confirmar** dentro de `ConfirmDialog` cuando la acción es destructiva | Único lugar con rojo relleno — es intencional, marca "sin vuelta atrás" |
| `.btn-danger` | Borde rojo, fondo `surface-1` | Acciones destructivas de fila (delete, cancel invitation) — antes tenía relleno sólido | Reservado para fila/inline, no para el confirm final |
| `.btn-success` | Sólido verde | Confirmación positiva que compite con una negativa en la misma fila/acción (Approve junto a Reject en Time Off) | **No** usarlo para el único CTA de una pantalla — ahí va `.btn-primary` (así quedó "Add your first employee" en Employees) |
| `.icon-btn` (+ `.icon-actions` para agrupar, `.tip` para el tooltip) | — | Acciones de **fila** en una tabla (Edit/Delete/Activate) | Ícono solo (15px) + tooltip en hover, nunca texto visible en la fila |
| `.tb-btn` | — | Botones de **toolbar** que no son la acción primaria (Filter, Columns) | Solo ícono, altura `--size-control-lg` (36px), sin texto |
| `.btn-md` / `.btn-sm` (modificadores, van junto a cualquier `.btn-*`) | — | Bajan la altura base (36px) a 32px/28px — dentro de panel/tarjeta o inline | Reemplazan `.btn-toolbar-size`/`.btn-tab-size` (borrados 2026-07-31): la base de `.btn` ahora *es* 36px, no hace falta forzarla |

## 4. Espaciado

Escala de 6 pasos, todos ya cubiertos por la escala default de Tailwind — no usar valores sueltos
(ej. `gap-2.5` = 10px) fuera de esta lista:

| Paso | px | Clase Tailwind |
|---|---|---|
| 1 | 4px | `1` (`gap-1`, `p-1`, ...) |
| 2 | 8px | `2` |
| 3 | 12px | `3` |
| 4 | 16px | `4` |
| 6 | 24px | `6` |
| 8 | 32px | `8` |

Aplicado sobre todo en los componentes de layout compartido: `.page-toolbar`, `.card`,
`SlideOver.tsx`, las tarjetas de auth (`AuthLayout.tsx`).

### 4a. Alturas de control

Antes había 8 alturas distintas conviviendo en una sola pantalla (`/hr/employees`: 40/40/41/32/26/28/35px).
Ahora son 3, cada una con un rol fijo (`--size-control-*` en `index.css`, `@theme`):

| Token | px | Rol | Dónde |
|---|---|---|---|
| `--size-control-lg` | 36 | Toolbar | `.toolbar-search`, `.tb-btn`, `.btn` de base (sin modificador), `.view-tab` |
| `--size-control-md` | 32 | Dentro de tarjeta/panel | `.icon-btn`, `.btn-md` |
| `--size-control-sm` | 28 | Inline | `.seg-nav button` (nav de calendario, paginación), `.dropdown-trigger`, `.btn-sm` |

`.btn` ya no lleva padding vertical — la altura la fija el modificador (`.btn-md`/`.btn-sm`) o queda
en 36px por defecto. Verificación: en cualquier `.page-toolbar`, `.toolbar-search`/`.tb-btn`/`.btn-primary`
tienen que devolver `offsetHeight === 36` (medido con Playwright 2026-07-31).

## 5. Íconos

Fuente única: `frontend/src/components/Icons.tsx`. Todo ícono nuevo sigue exactamente el mismo
spec que ya usan los existentes (objeto `base` compartido en ese archivo):

```ts
{
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}
```

Reglas:
- SVG basado en `stroke`, nunca `fill` sólido (excepto casos puntuales ya existentes como
  `color-dot`, que no son parte de este set de íconos de UI).
- `viewBox="0 0 24 24"` siempre, para que todos los íconos escalen igual entre sí.
- `stroke-width: 1.8` siempre — no mezclar grosores entre íconos de la misma pantalla.
- Nunca usar emoji como ícono de UI (dropdowns, botones, tabs). Antes de agregar un ícono nuevo,
  revisar si ya existe uno con el significado suficientemente cercano en `Icons.tsx` en vez de
  duplicar.

## 6. Logo de marca (no confundir con los íconos de UI de arriba)

Fuente única: `assets/svg/` (ver `assets/README.md` para la guía completa de qué archivo usar en
cada caso). Para fondos oscuros, el lockup horizontal (`logo-horizontal-dark.svg`, usado en
`TopBar.tsx`/`AcceptInvitePage.tsx`, que sí renderizan sobre fondo oscuro) **no es blanco plano** — es una variante a 3
tonos claros que conserva la profundidad del isotipo original en vez de aplanarlo a una silueta:

| Tono original | Tono en fondo oscuro |
|---|---|
| `#0d2a48` (navy — wordmark + acento del ícono) | `#ffffff` |
| `#3c6da1` (azul medio del ícono) | `#8dbada` |
| `#8dbada` (azul claro del ícono) | `#fdfcf8` |

Decisión confirmada por el usuario 2026-07-22 (Artifact "Northstack — Logo en fondo oscuro",
3 opciones comparadas con los assets reales) — descartada la opción de blanco plano (`icon-white.svg`)
porque perdía la identidad del isotipo, aunque tuviera mejor contraste bruto.

`AuthLayout.tsx` usa `logo-horizontal-light.svg` (la variante navy original), no la de fondo oscuro
— su logo vive en `.auth-right`, que tiene un gradiente celeste claro fijo, sin variante `dark:`.
Corrección de esta línea 2026-07-22: la versión anterior de esta tabla listaba `AuthLayout.tsx`
como consumidor de la variante oscura por error de copia, no reflejaba el código real.

**Pendiente de revisar (2026-07-22):** el ícono de 3 tonos en fondo oscuro usa `#fdfcf8` y `#ffffff`
para dos de sus tres tonos — contraste entre ambos de solo ~1.05:1 (prácticamente indistinguibles),
así que en la práctica el ícono se lee como blanco plano + borde celeste sobre fondo oscuro, no como
las 3 capas con profundidad que sí se ven en el ícono de fondo claro. No confirmado todavía si esto
es el mismo hallazgo que reportó el UX/UI manager del usuario; sin fix aplicado.

## 7. Tablas (`.full-table`) — Avatar, chips, tipografía de encabezado

Referencia visual: Artifact "Northstack — Diseño de pantallas", pantallas "Employees — vista Grid" y
"Settings — Users (rediseñada)" — este era el diseño ya aprobado para estas pantallas, pero la
implementación original de Employees/Clients/Company Users no lo había seguido (texto plano en vez
de avatar+chips). Corregido 2026-07-22 tras reporte del usuario ("el módulo se ve totalmente
distinto, deberíamos respetar la misma estructura en toda la app").

- **Encabezados de `.full-table th`**: `text-xs font-bold uppercase tracking-wide text-ink-muted`
  (antes: `text-sm font-semibold text-brand-navy`, igual que cualquier tabla `.table` genérica).
  Este cambio de tipografía está **escopeado a `.full-table` únicamente** — no toca `.table th` de
  base, para no afectar otras tablas más simples de la app (ej. PTO Policies) que no estaban en el
  alcance del mockup.
- **`Avatar.tsx`** (nuevo, `components/`, exporta también `getInitials()` reutilizado por
  `EntityCardList.tsx` y las tarjetas de Kanban) — círculo de 26px con las iniciales (primera letra de
  nombre + apellido), fondo `avatar-bg` (`#e8c9a0`), texto `brand-navy`. Actualizado 2026-07-31: sí
  tiene variante `dark:` ahora (`#3b2f26` / `#e8c9a0` texto) — el tono claro sobre fondo oscuro
  quedaba demasiado brillante, revirtiendo la decisión "mismo color en los dos temas" documentada acá
  el 2026-07-22 (ver Tarea 8 de `docs/tareas-ux-ui.md`). Envuelto junto al nombre en un
  `<div className="name-cell">` (`flex items-center gap-2`). Usado en Employees/Clients/Company Users.
- **`StatusChip.tsx`** (nuevo) — punto de color + texto, reemplaza el texto plano de la columna
  Status. Para Employees/Clients usa el `color` real ya guardado en `StatusDefinition` (el mismo que
  configura el usuario vía "Manage options" en el header de columna) — no un color inventado. Para
  Company Users (que no usa `StatusDefinition`, es un enum simple `active`/`inactive`) usa colores
  fijos: `#047857` (verde, activo) / `#6b7280` (gris, inactivo).
- **`RoleChip.tsx`** (nuevo, solo Company Users) — pill de color según rol: `owner` → verde
  (`chip-good`), `admin` → azul de marca (`chip-blue`), `member` → gris (`chip-neutral`). Solo se
  muestra en la fila cuando el rol **no** es editable por el viewer actual (`canEditRole === false`)
  — cuando sí es editable, se mantiene el `<select>` nativo existente (la interacción de edición no
  estaba resuelta en el mockup, que solo mostraba el estado estático; se priorizó no perder la
  funcionalidad de edición en línea ya existente antes de este cambio).
- El Kanban de Employees (`renderCard`) no lleva el `Avatar.tsx` de 26px del grid — desde 2026-07-31
  sí lleva `.kc-owner` (20px, iniciales del manager, ver §11) junto al job title, a propósito más
  chico y distinto del avatar del propio empleado en el grid.

## 8. Popovers / dropdowns flotantes

**Regla mecánica: cualquier dropdown flotante nuevo usa `components/Popover.tsx`, nunca un
`<div className="absolute ...">` hecho a mano.** No es solo por consistencia visual — `Popover.tsx`
resuelve dos problemas reales que un div absoluto no resuelve solo:

1. **Clamping de viewport**: `Popover` calcula su posición contra `window.innerWidth` y nunca deja
   que el panel se salga de pantalla. Un `absolute top-full left-0` a mano no tiene ese chequeo — si
   el trigger está cerca del borde derecho, el panel se corta o queda parcialmente invisible.
2. **Reposicionamiento continuo**: `Popover` recalcula su posición en cada frame (`requestAnimationFrame`)
   mientras está abierto, no solo una vez al abrir. Esto importa para cualquier layout que pueda
   moverse mientras el popover sigue abierto — el caso encontrado fue el sidebar colapsándose/expandiéndose
   (transición de CSS `width`, no dispara el evento `resize` de la ventana), pero cubre cualquier
   causa de reflow, no solo esa.

**Historial**: `ColorPicker.tsx` tenía su propio `<div className="color-picker-popover">` con
posición absoluta fija (`left-0`, sin clamping) — funcionaba bien como color picker independiente,
pero al reusarlo *anidado dentro de otro Popover* (ej. `StatusColumnMenu`, para hacer editable el
punto de color de cada status) el panel podía salirse del viewport cuando el trigger quedaba cerca
del borde derecho — más probable con el sidebar expandido, que le resta ancho disponible a la tabla
y empuja las columnas de la derecha (como Status) más hacia el borde. Corregido 2026-07-22
refactorizando `ColorPicker` para usar `Popover` en vez de su div a mano — la clase suelta
`.color-picker-popover` se borró de `App.css`, el contenido visual ahora lo da `.popover-panel`
(la misma clase que ya usan todos los otros popovers de la app).

## 9. Estados de carga y vacíos

`EmptyState.tsx` y `TableSkeleton.tsx` (`components/common/`), agregados 2026-07-31 — reemplazan
`<p>Loading...</p>` / `<p>No X yet.</p>` en Employees, Companies, Contacts, Opportunities, Public
Forms, Time Off Policies, Overview y el chequeo de sesión de `App.tsx`.

- **`EmptyState`** — `icon` (de `Icons.tsx`, sin wrapper) + `title` + `body` + `primaryLabel`/`onPrimary`
  (siempre requerido, `.btn-primary` salvo `primaryVariant="secondary"` — usar ese variant para una
  acción *correctiva*, no de creación, como "Clear filters" en un estado de "sin resultados") +
  `secondaryLabel`/`onSecondary` opcionales (`.btn-secondary`) + `children` para acciones extra que no
  entran en el par primary/secondary (ej. "Load sample data" en `.btn-ghost`, junto a "Import CSV" en
  Employees). `.empty-state` usa grid con `1fr` en la fila del body — así el CTA cae siempre a la
  misma altura aunque el texto de ayuda tenga largo distinto.
- **`TableSkeleton`** — `rows`/`columns` (default 5/4), anchos de columna fijos (170/110/64/64px,
  se repite 64px si hay más columnas) para que no haya salto de layout al llegar los datos reales.
  Pulso opcional vía `animation: skeleton-pulse`, con delay escalonado por fila.
- Regla de conteo (igual que botones): el "no resultados de búsqueda" (`primaryVariant="secondary"`)
  es un estado distinto del vacío real (sin filtros, sin datos) — no reusar el mismo copy.

## 10. Panel de detalle — campos agrupados

`Field.tsx` sigue siendo el único átomo compartido entre los 4 paneles (Employee/Company/Contact/
Opportunity) — ver nota original en el archivo. Lo que cambió 2026-07-31 es cómo se agrupan:

- **`.field-group`** (wrapper) + **`.field-group-title`** (label uppercase, 10px) + **`.field-group-body`**
  (el grid de 2 columnas — antes vivía directo en `.overview-panel-left`, que ahora es un simple
  `flex-col` de `.field-group`s, no un grid). Grupos por entidad: Employee → Identity / Role /
  Contract & compensation / Custom fields; Company → Identity / Address / Ownership / Custom fields;
  Contact → Identity / Role / Source / Custom fields; Opportunity → Deal / Stage / Next step. El grupo
  "Custom fields" solo se renderiza si el tenant tiene ≥ 1 custom field activo para esa entidad.
- **`.overview-field`** pasa de columna (label arriba) a fila (label a la izquierda, `w-28`) — con
  `min-width: 0` en el field y `truncate` en el valor, sin lo cual un valor largo revienta el `1fr 1fr`
  del grid. Un campo "ancho" real (ej. una lista de linked records, no un `<Field>` simple) que use
  `.overview-field.overview-field-full` directamente necesita envolver su contenido en un
  `<div className="min-w-0 flex-1">` — si no, el `flex items-center` de `.overview-field` intenta
  poner cada hijo suelto en fila en vez de apilarlos.
- **`OverviewActionsMenu.tsx`** (nuevo, `components/common/`) — botón "Actions" (`.btn-sm`, a la
  izquierda del close) + `Popover` con acciones destructivas/administrativas que antes solo vivían en
  la fila de la tabla (Delete siempre; Invite to app en Employee si `canManageEmployees` y el
  empleado no está linkeado a un user). El handler de Delete cierra el panel (`onClose`) antes de
  abrir el `ConfirmDialog` del padre — los dos overlays comparten `z-50`, así que si el panel se queda
  abierto se pinta encima del dialog en vez de debajo.

## 11. Tarjeta de Kanban con datos

`.kcard` dejó de ser solo `.kc-name` + `.kc-meta`. Estructura nueva (`.kcard-top` fila superior con
nombre + monto, `.kcard-foot` fila inferior con owner + edad-en-stage):

- **Opportunities**: nombre + `.kc-amount` (monto, `tabular-nums`) arriba; empresa como `.kc-meta`;
  `.kc-owner` (iniciales del owner, reusa `getInitials()` de `Avatar.tsx`) + `.kc-age` (días en el
  stage actual, calculado desde `stageHistory[0].enteredAt`) abajo. `.kc-age.late` cuando supera
  `LATE_STAGE_DAYS_THRESHOLD` (constante en `OpportunitiesPage.tsx`, hoy 14 — no hardcodear el número
  inline en otro lado). El header de cada columna del Kanban suma el monto de sus tarjetas
  (`renderColumnTotal`, prop nueva y opcional de `KanbanBoard.tsx` — no rompe otros usos que no la pasen).
- **Employees**: nombre + job title como `.kc-meta` + `.kc-owner` con las iniciales del manager. Sin
  monto (no aplica).
- **Pendiente** (requiere un endpoint nuevo, no solo frontend): `.kc-tasks` — completadas/total de
  tasks de la entidad. La clase CSS existe; no está cableada porque el listado que alimenta el Kanban
  no trae las tasks embebidas y no hay un endpoint de conteo agregado todavía.

## 12. Tiles de Settings

`SettingsHomePage.tsx` — los tiles ya no llevan un círculo de color a mano por tile (eran 5 colores
sueltos, fuera de paleta, que no codificaban nada). Ahora: ícono solo en `text-ink` (`text-ink-faint`
si `disabled`), sin wrapper de color, + una línea de descripción debajo del label. El grid usa
`gap-px` sobre `bg-line` para dibujar una línea de 1px entre celdas en vez de gap + hover con borde
(que hacía "saltar" el tile al pasar el mouse).

## 13. Patrón mobile (< 768px, breakpoint `md`)

- **`EntityCardList.tsx`** (nuevo, genérico) — reemplaza `.full-table-wrap` por una lista de tarjetas
  tocables (avatar + nombre + meta + punto de status) en Employees, Companies, Contacts y Company
  Users. El wrap de la tabla necesita la clase modificadora `.has-mobile-cards` además de
  `.full-table-wrap` — **la base de `.full-table-wrap` sigue siendo visible/con scroll horizontal en
  mobile por default**, para no romper las pantallas que todavía no tienen su lista de tarjetas (Time
  Off, Public Forms, Pipelines). Company Users no tiene panel de detalle (la edición es inline en la
  fila), así que su `EntityCardList` no pasa `onSelect` — la tarjeta no es clickeable ahí, a propósito.
- **Zonas tocables ≥ 44px** debajo de 768px: `.icon-btn`, `.menu-toggle` suben a 44×44; `.seg-nav
  button` a 40px; `.task-checkbox` a 20×20.
- **`MobileTabbar.tsx`** (nuevo, `components/layout/`, montado en `AppLayout.tsx`) — 4 tabs fijos
  abajo (Overview, Employees, Time Off, Sales). "Sales" agrupa Companies/Contacts/Opportunities bajo
  un solo tab que linkea a `/opportunities` y se marca activo si la ruta actual empieza con
  cualquiera de los tres. El resto de las secciones (Dashboard, Settings, Contacts/Companies
  directo) sigue solo en el drawer del sidebar.
- **Paneles a pantalla completa**: `.slideover-panel`, `.overview-panel` pierden max-width/rounded y
  ocupan `100%`; `.overview-panel-main` pasa a columna (fields arriba, sidebar de Notes/Tasks/Activity
  abajo); `.field-group-body` baja a 1 columna.
- **Pendiente**: el FAB de acción primaria (52×52, descrito en `docs/tareas-ux-ui.md` Tarea 9c) no se
  implementó — requiere un mecanismo de "acción primaria por página" que `AppLayout.tsx` no tiene hoy
  (cada página maneja su propio `handleOpenAdd`, no hay forma de que el layout global sepa cuál
  invocar). El toolbar "Add" de arriba de cada página sigue siendo el único camino en mobile.
- **Verificación**: sin scroll horizontal a nivel `body` en 390×844 y 768×1024, medido con Playwright.
