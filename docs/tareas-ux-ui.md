# Tareas UX/UI — Northstack (paleta Terracota)

> Ejecutor: Claude Code. Base: `ABravo2025/northstack@main`.
> Todo lo de acá abajo está anclado a valores que ya existen en `frontend/src/index.css` y `frontend/src/App.css`.
> **Regla de oro:** no se agrega ninguna clase nueva de color/tamaño fuera de los tokens definidos en la Tarea 1. Si algo no se puede expresar con un token, se agrega el token primero.

## Alcance

| # | Tarea | Archivos principales | Riesgo |
|---|---|---|---|
| 1 | Tokens de paleta cálida | `index.css` | Bajo (global, visual) |
| 2 | Una sola escala de alturas de control | `App.css` | Medio (toca toolbars de 6 pantallas) |
| 3 | Jerarquía de botones | `App.css` | Medio |
| 4 | `EmptyState` + `TableSkeleton` | 2 componentes nuevos + 4 páginas | Bajo |
| 5 | Panel de detalle: campos agrupados | `App.css`, 4 paneles | Medio |
| 6 | Tarjeta de Kanban con datos | `App.css`, `OpportunitiesPage.tsx` | Bajo |
| 7 | Tiles de Settings sin círculos de color | `SettingsHomePage.tsx`, `App.css` | Bajo |
| 8 | Dark mode: tres planos cálidos | `index.css`, `App.css` | Medio |
| 9 | Patrón mobile | `App.css`, `AppLayout.tsx` | Alto (responsive nuevo) |

Ejecutar en orden. 1 → 3 son la base; 4 → 9 dependen de los tokens de 1 y 2.

---

## Tarea 1 — Tokens de paleta cálida

**Problema:** el fondo es `#fdfcf8` (casi blanco, frío) y todos los neutros vienen de la escala `gray-*` de Tailwind, que es gris azulado. El resultado se lee frío y "soso" contra el navy de marca.

**Qué NO cambia:** `brand-navy`, `brand-blue`, `brand-blue-light`, el logo, los colores semánticos (`emerald` éxito, `red` peligro, `amber` warning) y los 4 `category-chip`.

**Qué cambia:** los neutros pasan a cálidos y el **acento de acción** pasa de `brand-blue` a terracota. `brand-blue` queda reservado únicamente para *selección/activo* (donde ya está esa regla escrita en `design-system.md` §1.4).

En `frontend/src/index.css`, dentro de `@theme`, agregar:

```css
@theme {
  /* --- marca, sin cambios --- */
  --color-brand-navy: #0d2a48;
  --color-brand-blue: #3c6da1;
  --color-brand-blue-light: #8dbada;

  /* --- ground / superficies cálidas (reemplazan brand-cream + gray-50/100) --- */
  --color-surface-0: #f8f5f0;   /* fondo de página, topbar, sidebar, thead */
  --color-surface-1: #fffefb;   /* tarjetas, popovers, inputs, filas de tabla */
  --color-surface-2: #f3efe8;   /* celdas vacías de calendario, hover de fila */

  /* --- bordes y líneas (reemplazan gray-200/300) --- */
  --color-line-strong: #d8d1c5; /* borde de input, botón secundario, dashed */
  --color-line: #e6e0d6;        /* borde de tarjeta, divisores de sección */
  --color-line-soft: #f0eae1;   /* separador de fila de tabla */

  /* --- texto (reemplazan gray-400/500/600) --- */
  --color-ink: #0d2a48;         /* = brand-navy */
  --color-ink-muted: #6f6a62;   /* celdas secundarias, descripciones */
  --color-ink-faint: #a09a90;   /* labels, placeholders, metadata */

  /* --- acento de acción --- */
  --color-accent: #b8502f;
  --color-accent-hover: #9c4227;
  --color-accent-tint: rgba(184, 80, 47, 0.14);  /* fondo de estado activo */
  --color-accent-soft: rgba(184, 80, 47, 0.06);  /* celda "hoy" del calendario */

  /* --- avatar --- */
  --color-avatar-bg: #e8c9a0;   /* reemplaza brand-blue-light como fondo de .avatar */
}
```

Mantener `--color-brand-cream` como alias de `--color-surface-0` durante la migración para no romper las ~40 referencias existentes, y borrarlo al final:

```css
--color-brand-cream: #f8f5f0;
```

**Reemplazos mecánicos en `App.css`** (buscar y reemplazar, verificando uno por uno):

| Buscar | Reemplazar por | Ocurrencias esperadas |
|---|---|---|
| `bg-white` (superficie de contenido) | `bg-surface-1` | `.tb-btn`, `.popover-panel`, `.kanban-col`, `.note-row`, `.inline-compose-form`, `.confirm-dialog`, `.legal-modal`, `.overview-panel`, `.slideover-panel`, `.form-group input/select/textarea`, `.filter-row`, `.nv-field` |
| `border-gray-200` | `border-line` | ~28 |
| `border-gray-300` | `border-line-strong` | ~14 |
| `text-gray-500` | `text-ink-muted` | ~22 |
| `text-gray-400` | `text-ink-faint` | ~18 |
| `text-gray-600` | `text-ink-muted` | 4 |
| `bg-gray-50` | `bg-surface-2` | ~8 |
| `bg-gray-100` (hover) | `bg-surface-2` | ~12 |
| `bg-brand-cream` | `bg-surface-0` | ~10 |

Y los reemplazos de acento (**solo acción**, no selección):

| Clase | Antes | Después |
|---|---|---|
| `.btn-primary` | `bg-brand-blue hover:bg-brand-navy` | `bg-accent hover:bg-accent-hover` |
| `.btn-outline` | `border-brand-blue text-brand-blue` | `border-accent text-accent` |
| `.onboarding-link` | `text-brand-blue` | `text-accent` |
| `.add-filter-btn` | `text-brand-blue` | `text-accent` |
| `.status-manage-link` | `text-brand-blue` | `text-accent` |
| `.table-link` | `text-brand-blue` | `text-accent` |
| `.tb-btn .filter-count` | `bg-brand-blue` | `bg-accent` |
| `.changelog-dot` | `bg-brand-blue` | `bg-accent` |
| `.avatar` | `bg-brand-blue-light` | `bg-avatar-bg` |
| `.ghost-row-cell:hover`, `.kanban-ghost-card:hover` | `border-brand-blue text-brand-blue` | `border-accent text-accent` |
| `.faq-question::before` | `text-brand-blue` | `text-accent` |

**Se queda en `brand-blue`** (selección/activo, no acción): `.sidebar-link.active`, `.view-tab.active`, `.toggle-opt.active`, `.mini-toggle-opt.active`, `.col-resize-handle:hover`, `.dropdown-trigger.dt-status`, `.role-chip.chip-blue`, `.task-checkbox` (accent), `.hscrollbar-thumb:hover`.

**Foco:** agregar en `index.css`, fuera de `@theme`:

```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

Hoy el anillo de foco solo existe en `.form-group input:focus` y `.overview-field-input:focus`. Botones de ícono, tabs y tiles no muestran foco de teclado.

**Verificación:** `npm run build` sin errores; abrir `/hr/employees`, `/overview`, `/settings` en claro y comparar que no quede ningún gris azulado (`#e5e7eb`, `#6b7280`, `#9ca3af`) visible en bordes o texto.

---

## Tarea 2 — Una sola escala de alturas de control

**Problema medido, en una sola pantalla (`/hr/employees`):**

| Elemento | Clase | Alto real hoy |
|---|---|---|
| Search de toolbar | `.toolbar-search` | 40px (`h-10`) |
| Botón Filter / Columns | `.tb-btn` | 40×40 |
| Botón primario en toolbar | `.btn-primary.btn-toolbar-size` | 40px (forzado) |
| Botón primario en form/dialog | `.btn-primary` | 41px (`py-2.5` + `text-sm` 13px) |
| Acción de fila | `.icon-btn` | 32×32 |
| Nav de calendario | `.btn-secondary px-2 py-1 text-xs` | ~26px |
| Trigger de dropdown en panel | `.dropdown-trigger` | 28px (`h-7`) |
| Tab de vista | `.view-tab` | ~35px (`py-2`) |

Ocho alturas. Eso es lo que se percibe como "no homogéneo".

**Escala objetivo — tres alturas, cada una con un rol fijo:**

```css
/* index.css, dentro de @theme */
--size-control-lg: 36px;  /* toolbar: search, Filter, Columns, export, botón primario */
--size-control-md: 32px;  /* dentro de tarjeta o panel: Add note, Review, Cancel, iconos de contenido */
--size-control-sm: 28px;  /* inline: acciones de fila, paginación, nav de calendario, dropdown de panel */
```

**Cambios concretos en `App.css`:**

```css
/* 1. base del botón: quitar el padding vertical, la altura la fija el modificador */
@utility btn {
  @apply inline-flex cursor-pointer items-center justify-center rounded-md px-3.5 text-sm
         font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60;
  height: var(--size-control-lg);   /* 36px por defecto */
}

/* 2. modificadores de tamaño (reemplazan .btn-toolbar-size y .btn-tab-size) */
.btn-md { height: var(--size-control-md); @apply px-3 text-xs; }
.btn-sm { height: var(--size-control-sm); @apply px-2.5 text-xs; }

/* 3. search y toolbar buttons bajan de 40 a 36 */
.toolbar-search { height: var(--size-control-lg); }          /* era h-10 */
.tb-btn { height: var(--size-control-lg); width: var(--size-control-lg); }  /* era 40x40 */

/* 4. acciones de fila suben de 32 a 32 (sin cambio) pero el icono queda en 15px */
.icon-btn { height: var(--size-control-md); width: var(--size-control-md); }
.icon-btn svg { @apply h-[15px] w-[15px]; }                  /* era h-4 w-4 (16px) */

/* 5. tab de vista alineado a 36 para calzar con la toolbar de arriba */
.view-tab { height: var(--size-control-lg); @apply py-0; }
```

**Borrar** `.btn-toolbar-size` y `.btn-tab-size` y sus usos:
- `EmployeesPage.tsx:1327` (aprox.), `ClientsPage`→`CompaniesPage`/`ContactsPage`, `CompanyUsersPage.tsx:299`.

**Reemplazar los overrides sueltos** en `OverviewPage.tsx` (nav del calendario) y `Pagination.tsx`: dejan de ser tres `btn-secondary px-2 py-1 text-xs` y pasan a un solo control segmentado de 28px, reusando el patrón que ya existe (`.mini-toggle-row` / `.mini-toggle-opt`):

```tsx
<div className="seg-nav">
  <button type="button" aria-label="Previous month" onClick={goToPrevMonth}>‹</button>
  <button type="button" onClick={goToToday}>Today</button>
  <button type="button" aria-label="Next month" onClick={goToNextMonth}>›</button>
</div>
```

```css
.seg-nav {
  @apply inline-flex items-center overflow-hidden rounded-md border border-line-strong bg-surface-1;
}
.seg-nav button {
  @apply cursor-pointer border-none bg-transparent px-3 text-xs font-medium text-ink
         transition-colors hover:bg-surface-2;
  height: var(--size-control-sm);   /* 28px */
}
.seg-nav button + button { @apply border-l border-line; }
```

Aplicar el mismo `.seg-nav` a `Pagination.tsx` (Previous / página / Next).

**Verificación:** en `/hr/employees`, medir en DevTools que `.toolbar-search`, `.tb-btn` y el botón primario devuelvan los tres `offsetHeight === 36`.

---

## Tarea 3 — Jerarquía de botones

**Problema:** `.btn-secondary` es `bg-gray-500` con texto blanco. Un relleno sólido gris pesa visualmente lo mismo que el primario y se lee como "deshabilitado". Aparece en la nav del calendario, en "Load sample data", en "Cancel" de todos los forms y en la paginación — es el botón más frecuente de la app y el peor diseñado.

```css
/* ANTES */
.btn-secondary { @apply btn bg-gray-500 text-white hover:bg-gray-600; }

/* DESPUÉS */
.btn-secondary {
  @apply btn border border-line-strong bg-surface-1 text-ink hover:bg-surface-2;
}

/* nuevo: la acción de menor peso (Dismiss, Load sample data, Cancel de un popover) */
.btn-ghost {
  @apply btn bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink;
}

/* danger: el relleno rojo se reserva para el botón de confirmar dentro de ConfirmDialog */
.btn-danger {
  @apply btn border border-red-200 bg-surface-1 text-red-700 hover:bg-red-50;
}
.btn-danger-solid {
  @apply btn bg-red-600 text-white hover:bg-red-700;
}
```

- `ConfirmDialog.tsx`: el botón de confirmar pasa a `.btn-danger-solid`; el de cancelar a `.btn-ghost`.
- Todo otro uso actual de `.btn-danger` (borrar fila, cancelar invitación) queda con el `.btn-danger` nuevo (outline).
- **Borrar `.btn-success`**: su único uso es un CTA de empty state, que en la Tarea 4 pasa a `.btn-primary`. Verde relleno para "Add your first employee" contradice la regla de un solo primario por pantalla.
- Regla de conteo, verificable a ojo: **máximo un `.btn-primary` visible por pantalla**.

---

## Tarea 4 — `EmptyState` y `TableSkeleton`

### 4a. `frontend/src/components/common/EmptyState.tsx` (nuevo)

Hoy los vacíos son `<p>No employees yet.</p>` / `<p>No clients yet.</p>` y `.empty-state` es un borde dashed con texto centrado, sin ícono ni jerarquía.

```tsx
interface EmptyStateProps {
  icon: React.ReactNode;          // un ícono de Icons.tsx, sin wrapper
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  hint?: string;
}
```

```css
/* reemplaza .empty-state */
.empty-state {
  @apply grid justify-items-center gap-0 border border-line bg-surface-1 text-center;
  grid-template-rows: 44px auto 1fr var(--size-control-md) 16px;
  padding: 36px 20px 28px;
}
.empty-state-icon {
  @apply flex h-11 w-11 items-center justify-center rounded-full text-accent;
  background: var(--color-accent-tint);
}
.empty-state-icon svg { @apply h-5 w-5; }
.empty-state-title  { @apply mt-3.5 mb-1 text-sm font-bold text-ink; }
.empty-state-body   { @apply mx-auto max-w-[240px] text-xs leading-relaxed text-ink-muted; }
.empty-state-actions{ @apply mt-5 flex items-center gap-2; }
.empty-state-hint   { @apply mt-2.5 text-[11px] text-ink-faint; }
```

**`grid-template-rows` con `1fr` en la fila del body es el punto clave**: los tres textos de ayuda tienen largos distintos, y sin eso el botón de cada tarjeta queda a distinta altura cuando hay varios vacíos lado a lado. Con la grilla, el botón cae siempre a la misma `y`, y todos los CTA miden `--size-control-md` (32px) exactos.

### 4b. Aplicar en las pantallas que todavía no lo tienen

| Pantalla | Archivo | Ícono (de `Icons.tsx`) | Title | Body | CTA |
|---|---|---|---|---|---|
| Time Off — Policies | `TimeOffOverviewPage.tsx` | `CalendarIcon` | No time off policies yet | A policy defines how days are earned and whether requests need approval. | Create a policy |
| Opportunities | `OpportunitiesPage.tsx` | `TargetIcon` | No opportunities here | Opportunities move deals through your pipeline stages. | Add opportunity |
| Public Forms | `PublicFormsSettingsPage.tsx` | `ListIcon` | No public forms yet | A public form captures people from outside the app, with no login. | Build a form |
| Employees (ya tiene CTA) | `EmployeesPage.tsx:1342` | `PeopleIcon` | No employees yet | Add your team one by one, import a CSV, or load sample data. | Add employee + `Import CSV` (secondary) + `Load sample data` (ghost) |

Estado "sin resultados de búsqueda" (distinto del vacío real) — reemplaza `<p className="mt-4">No employees match your search or filters.</p>`:

```
title: No matches for “{query}”
body:  Try a different term, or clear the filters.
CTA:   Clear filters   (.btn-secondary, 32px)
```

### 4c. `frontend/src/components/common/TableSkeleton.tsx` (nuevo)

Reemplaza los `<p>Loading...</p>` de `EmployeesPage`, `CompaniesPage`, `ContactsPage`, `OpportunitiesPage`, `OverviewPage` y `App.tsx` (checkingSession).

```tsx
export default function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number })
```

Geometría, para que no haya salto de layout al llegar los datos:

```css
.skeleton-head { height: 36px; @apply border-b border-line bg-surface-0; }
.skeleton-row  { height: 48px; @apply flex items-center gap-3.5 border-b border-line-soft px-3.5; }
.skeleton-avatar { @apply h-[26px] w-[26px] shrink-0 rounded-full bg-[#ece5da]; }
.skeleton-bar    { @apply h-[9px] rounded-none bg-[#ece5da]; }
/* anchos por columna: 170px, 110px, 64px, 64px */
```

Sin animación de shimmer si molesta; si se agrega, `animation: skeleton-pulse 1.4s ease-in-out infinite` con `opacity .55 → 1 → .55` y `animation-delay` de `index * 0.08s` por fila.

---

## Tarea 5 — Panel de detalle: campos agrupados

**Problema:** `.overview-panel-left` es `grid-cols-2` plano. En Employee eso son **18 campos** seguidos, todos con el mismo peso y su propio `border-b`, cada uno con el label arriba del valor (`.overview-field` es `flex-col`). Es un muro parejo de ~34 filas de alto donde nada guía la lectura.

**Cambio 1 — agrupar.** Envolver los campos en secciones con un label:

| Sección | Campos (Employee) |
|---|---|
| Identity | First Name, Last Name, Business Email, Personal Email |
| Role | Status, Department, Job Title, Reports To |
| Contract & compensation | Contract Type, Compensation Type, Hourly Rate, Monthly Rate, Start Date, End Date, Contract URL, Time Off Policies |
| Custom fields | los `customFields` del tenant (solo si hay ≥1) |

Equivalentes: Company → `Identity / Address / Ownership`; Contact → `Identity / Role / Source`; Opportunity → `Deal / Stage / Next step`.

```css
.field-group { @apply border-b border-line-soft; }
.field-group-title {
  @apply m-0 px-4 pt-3 pb-2 text-[10px] font-bold tracking-[0.09em] uppercase text-ink-faint;
}
.field-group-body {
  @apply grid grid-cols-2 gap-x-6 px-4 pb-3;
}
```

**Cambio 2 — label a la izquierda, no arriba.** `.overview-field` pasa de columna a fila:

```css
/* ANTES: flex-col gap-0.5 border-b pb-2  → 2 líneas por campo */
.overview-field {
  @apply flex items-center gap-3 border-b border-[#f7f2ea];
  min-height: 34px;
  min-width: 0;          /* CRÍTICO: sin esto, un valor largo con white-space:nowrap
                            fija un min-content y rompe el reparto 1fr 1fr,
                            desbordando la columna derecha fuera del panel */
}
.overview-field-label {
  @apply w-28 shrink-0 text-[11.5px] text-ink-faint;   /* 112px */
}
.overview-field-value,
.overview-field-input {
  @apply min-w-0 flex-1 truncate text-[12.5px] text-ink;
}
.overview-field-full { @apply col-span-2; }
```

Resultado: 18 campos × 34px en 2 columnas ≈ 306px de alto + 3 headers de sección, contra ~600px hoy. Cabe sin scroll en el `70vh` del modal.

**No cambia:** la edición inline con `AutoSaveField`/`AutoSaveSelect` (sin botón Save), el `DetailSidebar` de la derecha (360px, tabs Notes/Tasks/Activity), el tamaño del modal (`70vw × 70vh`, `min-w-[720px]`).

**Cambio 3 — header del modal.** Hoy `.overview-panel-head` tiene el close absoluto arriba a la derecha y ninguna otra acción. Agregar un botón `Actions` (`.btn-sm`, 28px) a la izquierda del close, con el menú de acciones destructivas (Delete, Deactivate, Invite to app) que hoy vive solo en la fila de la tabla.

---

## Tarea 6 — Tarjeta de Kanban con datos

**Problema:** `.kcard` es `.kc-name` (12px semibold) + `.kc-meta` (10.9px gris). En Opportunities eso significa una tarjeta que no dice monto, ni owner, ni tiempo en stage — justo lo que se mira en un board de ventas. El dato de tiempo-en-stage ya existe, pero solo se ve dentro del panel de detalle.

```css
.kcard {
  @apply cursor-grab border border-line bg-surface-0 p-2.5 active:cursor-grabbing;
}
.kcard-top   { @apply flex items-start justify-between gap-2; }
.kc-name     { @apply text-[12.5px] font-bold leading-tight text-ink; }
.kc-amount   { @apply shrink-0 text-[12.5px] font-bold text-ink [font-variant-numeric:tabular-nums]; }
.kc-meta     { @apply mt-[3px] mb-2 text-[11px] text-ink-muted; }
.kcard-foot  { @apply flex items-center gap-2; }
.kc-owner    { @apply inline-flex h-5 w-5 items-center justify-center rounded-full
                bg-avatar-bg text-[9px] font-bold text-ink; }
.kc-age      { @apply text-[10.5px] font-semibold text-ink-faint; }
.kc-age.late { @apply text-red-700; }        /* > 14 días en el stage */
.kc-tasks    { @apply ml-auto inline-flex items-center gap-1 text-[10.5px] text-ink-faint; }
```

Layout por tarjeta (Opportunity):

```
[ nombre del deal              ]  [ $32k ]
[ Northwind Traders                      ]
[ (AB) 4d in stage        ✓ 2/3          ]
```

- `late` cuando los días en stage superan 14 (umbral configurable en una constante del archivo, no hardcodeado inline).
- `kc-tasks` muestra `completadas/total` de las tasks de la entidad; se oculta si no hay tasks.
- Header de columna: agregar el **total del stage** a la derecha del contador (`USD 84k`), con `tabular-nums`.
- Employee Kanban: nombre + job title + `kc-owner` del manager. Sin monto.

**No cambia** `KanbanBoard.tsx` (drag & drop, `onMove`, `renderCard`): solo cambia el JSX que cada página pasa como `renderCard`.

---

## Tarea 7 — Tiles de Settings sin círculos de color

**Problema:** `SettingsHomePage.tsx` asigna un color por tile a mano — `bg-brand-blue`, `bg-purple-500`, `bg-teal-500`, `bg-orange-500`, `bg-pink-500`, `bg-gray-400`. Son cinco colores que no están en la paleta, el color no codifica nada, y compiten entre sí en la misma grilla.

**Cambio:**
1. Borrar la propiedad `color` de la interfaz `Tile` y de los seis tiles.
2. El ícono va sin círculo, en `text-ink` (o `text-ink-faint` si el tile está deshabilitado).
3. Cada tile gana una línea de descripción — la grilla deja de ser un ícono con una palabra.

```css
.settings-grid {
  @apply grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3;
}
.settings-tile {
  @apply block cursor-pointer bg-surface-1 p-4 no-underline transition-colors hover:bg-surface-2;
}
.settings-tile-icon { @apply inline-flex text-ink; }
.settings-tile-icon svg { @apply h-[17px] w-[17px]; }
.settings-tile-label { @apply mt-2.5 block text-[13px] font-semibold text-ink; }
.settings-tile-desc  { @apply mt-0.5 block text-[11.5px] leading-snug text-ink-muted; }
.settings-tile.disabled { @apply pointer-events-none opacity-45; }
.settings-tile.disabled .settings-tile-icon { @apply text-ink-faint; }
```

El `gap-px` sobre `bg-line` dibuja la grilla con una línea de 1px entre celdas, en vez del `gap-3` + hover con borde de hoy (que hace que los tiles "salten" al pasar el mouse).

Descripciones:

| Tile | Ícono | Descripción |
|---|---|---|
| Profile | `UserCircleIcon` | Name, phone and password. |
| Notifications *(nuevo, si se construye)* | `BellIcon` | What Northstack emails you about. |
| Appearance | `BuildingIcon` | Currency and theme for the workspace. |
| Users | `TeamIcon` | Invite people and manage roles. |
| Public Forms | `ListIcon` | External intake forms per module. |
| Pipelines | `TrendingIcon` | Sales stages and their outcomes. |
| Integrations *(disabled)* | `GridIcon` | Connect Northstack to other tools. |
| Billing *(disabled)* | `BriefcaseIcon` | Plan, invoices and payment method. |

---

## Tarea 8 — Dark mode: tres planos cálidos

**Problema:** el dark actual usa `dark:bg-black` puro para página, sidebar, topbar, `thead` y `.card` — todo el mismo plano, la separación depende solo del borde. Y los `.category-chip` al 15% de opacidad sobre negro puro quedan casi ilegibles.

```css
/* index.css, dentro de @theme */
--color-dark-0: #16130f;   /* fondo de página (negro cálido, no gris azulado) */
--color-dark-1: #1e1a16;   /* tarjetas, tabla, panel, popover */
--color-dark-2: #221d18;   /* thead, header de sección */
--color-dark-line: #2e2823;
--color-dark-line-soft: #262019;
--color-dark-ink: #efe8df;
--color-dark-ink-muted: #a89e92;
--color-dark-ink-faint: #8b8177;
```

Reemplazos:

| Antes | Después |
|---|---|
| `dark:bg-black` (página, sidebar, header) | `dark:bg-dark-0` |
| `dark:bg-gray-900` (card, modal, popover, kanban-col) | `dark:bg-dark-1` |
| `.full-table thead th` / `.list-section-row` | `dark:bg-dark-2` |
| `dark:border-gray-800` | `dark:border-dark-line` |
| `dark:border-gray-700` | `dark:border-dark-line` |
| `dark:text-gray-100` | `dark:text-dark-ink` |
| `dark:text-gray-300` / `dark:text-gray-400` | `dark:text-dark-ink-muted` |
| `dark:text-gray-500` | `dark:text-dark-ink-faint` |
| `dark:hover:bg-white/5` | `dark:hover:bg-white/[0.06]` (se queda, sube 1 punto) |

Chips de categoría: en dark, relleno sólido tenue en vez de 15% de opacidad.

```css
.dark .category-chip.chip-purple { background: #332a45; color: #d6bcfb; }
.dark .category-chip.chip-coral  { background: #3d2a1c; color: #f5c19b; }
.dark .category-chip.chip-pink   { background: #3b2331; color: #f6b6d3; }
.dark .category-chip.chip-teal   { background: #1c332f; color: #8fd8cd; }
```

Avatar en dark: `background: #3b2f26; color: #e8c9a0` (el `--color-avatar-bg` claro sobre fondo oscuro es demasiado brillante).

Estado activo del sidebar en dark: `background: rgba(184,80,47,0.28); color: #f2c8b4`.

**Verificación de contraste** (esto nunca se midió — `ux-ui-brief.md` §4 lo deja explícito). Objetivo AA:
- `--color-dark-ink` sobre `--color-dark-1` → debe dar ≥ 4.5:1.
- `--color-dark-ink-muted` sobre `--color-dark-1` → ≥ 4.5:1 (es texto de celda, no decoración).
- `--color-dark-ink-faint` sobre `--color-dark-2` → ≥ 3:1 (solo labels/uppercase).
- `--color-accent` sobre `--color-dark-0` → ≥ 3:1; si no llega, usar `#d2694a` como acento solo-dark.
- Cada par de `.category-chip` en dark → ≥ 4.5:1.

---

## Tarea 9 — Patrón mobile

**Problema:** `.sidebar` es `w-64` fijo con drawer ya implementado (`mobile-open` + `.sidebar-backdrop` + `.menu-toggle`), pero el resto de la app no tiene ningún breakpoint: la tabla hace scroll horizontal, el `.slideover-panel` mide `max-w-md` (448px) en una pantalla de 390, el `.overview-panel` es `70vw × 70vh` con `min-w-[720px]` (inusable), y `.icon-btn` mide 32px (bajo el mínimo táctil de 44).

Breakpoint: `md` de Tailwind (768px). Todo lo de abajo aplica **debajo** de 768px.

**9a. Tabla → lista de tarjetas.** No media query sobre la `<table>`: renderizar una lista distinta.

```css
.entity-card-list { @apply flex flex-col gap-2 md:hidden; }
.entity-card {
  @apply flex items-center gap-3 border border-line bg-surface-1 p-3;
  min-height: 64px;
}
.entity-card-avatar { @apply h-8 w-8 shrink-0 rounded-full bg-avatar-bg text-[11px] font-bold; }
.entity-card-name   { @apply block text-sm font-semibold text-ink; }
.entity-card-meta   { @apply block truncate text-xs text-ink-muted; }
/* la tabla completa: */
.full-table-wrap { @apply hidden md:block; }
```

Contenido de la tarjeta: avatar + nombre (14px semibold) + segunda línea `job title · department` (12px) + punto de status a la derecha. Tap abre el panel de detalle.

**9b. Zonas tocables ≥ 44px** debajo de `md`:

```css
@media (max-width: 767px) {
  .icon-btn { height: 44px; width: 44px; }
  .menu-toggle { height: 44px; width: 44px; }
  .seg-nav button { height: 40px; @apply px-4; }
  .task-checkbox { @apply h-5 w-5; }   /* era h-3.5 w-3.5 = 14px */
}
```

**9c. Barra inferior de navegación** (`AppLayout.tsx`, nueva, solo `< md`) con las 4 secciones de uso diario: Overview, Employees, Time Off, Sales. El resto (Dashboard, Contacts, Opportunities, Settings) queda en el drawer.

```css
.mobile-tabbar {
  @apply fixed inset-x-0 bottom-0 z-30 flex items-center justify-around
         border-t border-line bg-surface-0 md:hidden;
  height: 60px;
  padding-bottom: env(safe-area-inset-bottom);
}
.mobile-tabbar a {
  @apply flex min-w-[56px] flex-col items-center justify-center text-[11px]
         font-semibold text-ink-faint no-underline;
  height: 44px;
}
.mobile-tabbar a.active { @apply text-accent; }
.app-main { @apply pb-[60px] md:pb-0; }   /* que la tabbar no tape la última fila */
```

Botón de acción primaria como FAB, 52×52, `right: 16px; bottom: 76px`, círculo `bg-accent`, sombra `0 6px 18px rgba(184,80,47,0.4)`.

**9d. Paneles a pantalla completa:**

```css
@media (max-width: 767px) {
  .slideover-panel { @apply max-w-none; width: 100%; }
  .overview-panel  { @apply h-full max-h-none w-full max-w-none min-w-0 rounded-none; }
  .overview-panel-main  { @apply flex-col; }
  .overview-panel-left  { @apply grid-cols-1; }        /* de 2 columnas a 1 */
  .overview-panel-right { @apply h-auto w-full border-l-0 border-t border-line; }
  .detail-modal-overlay { @apply p-0; }
  .field-group-body     { @apply grid-cols-1; }
  .overview-field-label { @apply w-24; }               /* 96px, no 112 */
}
```

**9e. Toolbar apilada:**

```css
@media (max-width: 767px) {
  .page-toolbar   { @apply flex-col items-stretch gap-2; }
  .toolbar-search { @apply w-full flex-none; }
  .views-bar      { @apply -mx-5 px-5; }   /* scroll horizontal a sangre, sin cortar */
}
```

**Verificación:** 390×844 (iPhone 12/13/14) y 768×1024 (iPad portrait). Ninguna pantalla debe tener scroll horizontal a nivel `body`.

---

## Orden de ejecución y verificación

1. Tarea 1 (tokens) → `npm run build` → revisión visual de `/hr/employees`, `/overview`, `/settings`.
2. Tarea 2 + 3 (alturas y botones) → medir `offsetHeight` de la toolbar → deben ser tres 36.
3. Tarea 4 (vacíos + skeleton) → forzar tenant vacío y estado de carga lento (throttling 3G en DevTools).
4. Tarea 5 (detalle) → abrir Employee con los 18 campos + 3 custom fields: no debe haber scroll dentro del `70vh`, ni valores cortados sin ellipsis.
5. Tarea 6 (Kanban) → Opportunities con ≥ 4 stages.
6. Tarea 7 (Settings).
7. Tarea 8 (dark) → medir los 5 pares de contraste listados.
8. Tarea 9 (mobile) → los dos viewports.

Al cerrar todo: actualizar `docs/design-system.md` §1 (paleta), §3 (botones: agregar `.btn-ghost`, `.btn-danger-solid`, borrar `.btn-success` y `.btn-toolbar-size`) y §4 (agregar la escala de alturas de control), y marcar UX-08 como resuelto en `docs/ux-ui-audit.md`.
