# Design system — Northstack

Referencia escrita de las convenciones que ya existen en la práctica (clases consistentes en
`frontend/src/App.css`, un solo estilo de ícono en `frontend/src/components/Icons.tsx`) pero nunca
se habían documentado — cada pantalla nueva tenía que inferirlas leyendo otras pantallas. Este doc
no cambia código, es la referencia para que las próximas pantallas no reinventen el patrón.

Origen: ítem de `### UX / Interfaz` en `docs/tareas-desarrollo.md` (recorrido completo de interfaz,
2026-07-21), implementado 2026-07-22.

## 1. Color

**Tokens de marca** (`frontend/src/index.css`, bloque `@theme`):

| Token | Hex | Uso |
|---|---|---|
| `brand-navy` | `#0d2a48` | Texto principal (headings, body), fondo del panel izquierdo de auth |
| `brand-blue` | `#3c6da1` | Acento primario — `.btn-primary`, links, focus rings, elementos activos |
| `brand-blue-light` | `#8dbada` | Variantes claras sobre fondo oscuro (texto/bordes en `.auth-left`) |
| `brand-cream` | `#fdfcf8` | Fondo de página en modo claro |

**Colores semánticos** — nunca son el acento de marca, cada uno tiene un significado fijo:

| Color | Tailwind | Uso |
|---|---|---|
| Danger | `red-600` / `red-700` (hover) | `.btn-danger`, `.icon-btn.danger`, borrar/rechazar/cancelar |
| Success | `emerald-600` / `emerald-700` (hover) | `.btn-success`, confirmaciones positivas |
| Warning | `amber-*` | Estados de alerta no destructivos (usar con criterio, no hay clase dedicada todavía) |
| Neutral | `gray-*` | `.btn-secondary`, bordes, texto secundario, fondos de tarjeta |

Regla: el acento de marca (`brand-blue`) se reserva para la acción primaria de la pantalla. No
usarlo para danger/success — esos siempre son semánticos, independiente de la marca.

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
Texto auxiliar/secundario (hints, metadata) usa `text-xs` + `text-gray-500`.

## 3. Botones

| Clase | Uso | Regla |
|---|---|---|
| `.btn-primary` | La acción principal de la pantalla (Add/Create/Save) | Máximo **1 por pantalla** — si hay dos acciones que compiten, una es `.btn-secondary` u `.btn-outline` |
| `.btn-secondary` | Acciones secundarias (Cancel, acciones de fila que no son la primaria) | Gris neutro, nunca compite visualmente con `.btn-primary` |
| `.btn-outline` | Alternativa de bajo énfasis sobre fondo claro | Borde + texto en `brand-blue`, fondo transparente |
| `.btn-danger` | Acciones destructivas irreversibles (delete, cancel invitation) | Siempre rojo semántico, nunca el acento de marca |
| `.btn-success` | Confirmaciones positivas explícitas (ej. "Add your first employee" en un empty state) | Verde semántico |
| `.icon-btn` (+ `.icon-actions` para agrupar, `.tip` para el tooltip) | Acciones de **fila** en una tabla (Edit/Delete/Activate) | Ícono solo + tooltip en hover, nunca texto visible en la fila — ver `EmployeesPage.tsx`/`ClientsPage.tsx`/`CompanyUsersPage.tsx` |
| `.tb-btn` | Botones de **toolbar** que no son la acción primaria (Filter, Columns) | Solo ícono, 40x40px, sin texto — corregido 2026-07-22, antes tenía label + altura menor que el resto de la fila |
| `.btn-toolbar-size` (modificador, va junto a `.btn-primary`) | El botón "Add X"/"Invite" cuando vive en un `.page-toolbar` junto a `.toolbar-search`/`.tb-btn` | Fuerza 40px de alto para calzar con los otros dos — el `.btn-primary` de base (usado en forms/dialogs) no se tocó, mismo criterio que `.btn-tab-size` |

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

- **Encabezados de `.full-table th`**: `text-xs font-bold uppercase tracking-wide text-gray-500`
  (antes: `text-sm font-semibold text-brand-navy`, igual que cualquier tabla `.table` genérica).
  Este cambio de tipografía está **escopeado a `.full-table` únicamente** — no toca `.table th` de
  base, para no afectar otras tablas más simples de la app (ej. PTO Policies) que no estaban en el
  alcance del mockup.
- **`Avatar.tsx`** (nuevo, `components/`) — círculo de 26px con las iniciales (primera letra de
  nombre + apellido), fondo `brand-blue-light`, texto `brand-navy` — **sin variante `dark:`**, mismo
  color en los dos temas (así lo define el mockup, no es una omisión). Envuelto junto al nombre en un
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
- El Kanban de Employees (`renderCard`) **no** lleva avatar — el mockup tampoco lo muestra ahí
  (`.kcard-real` es solo nombre + metadata), a propósito distinto del grid.

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
