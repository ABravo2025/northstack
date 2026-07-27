# 09 — Contexto visual / UX-UI para Claude

Este doc es la base para que cualquier sesión de Claude (o el agente UX/UI) pueda ayudar a mejorar
lo visual de Northstack sin tener que releer todo el código desde cero. Verificado contra el
código real al 2026-07-24 (no contra la documentación vieja, que en varios puntos había quedado
desactualizada respecto a lo que ya se implementó — donde encontré esa brecha la señalo explícitamente
abajo). Complementa, no reemplaza, a `docs/design-system.md` (tokens/reglas ya formalizadas) y a
`docs/Skills/Skills UXUI.md` (el charter de proceso/rol) — este archivo agrega el mapa de "qué
pantalla usa qué patrón, y qué falta" que ninguno de los otros dos cubre.

## 1. Identidad visual (resumen — el detalle completo vive en `docs/design-system.md`)

- **Paleta de marca** (`frontend/src/index.css`, bloque `@theme`): `--color-brand-navy: #0d2a48`,
  `--color-brand-blue: #3c6da1`, `--color-brand-blue-light: #8dbada`, `--color-brand-cream: #fdfcf8`.
- **Tipografía**: Inter, cuerpo siempre `text-sm` (0.875rem), sin excepciones fuera de los casos
  puntuales documentados en `design-system.md` (título de página, título de card, tabla).
- **Dark mode**: Tailwind v4, `@custom-variant dark (&:where(.dark, .dark *))` — clase `.dark` en
  el root, no `prefers-color-scheme` puro. Toggle de 3 estados (System/Light/Dark) en
  `CompanyAppearancePage.tsx` (`/settings/appearance`), lógica en `frontend/src/theme.ts`
  (`getStoredThemePreference`/`setThemePreference`), persistido en `localStorage` **por dispositivo**
  (no es una preferencia de cuenta en el backend).
- **Fondo de superficie unificado**: página, `.card` y `thead` comparten el mismo tono
  (`bg-brand-cream` claro / `dark:bg-gray-950` oscuro) — la separación visual la da el borde, no un
  tono distinto. Los overlays reales (dropdown, modal, toast, slide-over) sí usan un tono "raised"
  (blanco / `dark:bg-gray-900`) a propósito, para diferenciarse de la superficie base.
- **Íconos de UI**: un solo set en `frontend/src/components/Icons.tsx`, todos `stroke`-based,
  `viewBox="0 0 24 24"`, `stroke-width: 1.8`. Nunca emoji como ícono de interfaz.
- **Logo de marca** (distinto de los íconos de UI): `assets/svg/` — variante horizontal a 3 tonos
  para fondo oscuro (no blanco plano). Ver `design-system.md` sección 6 para la tabla de remapeo de
  color y un hallazgo de contraste todavía sin resolver (2 de los 3 tonos casi idénticos entre sí
  en la variante oscura).

## 2. Stack de frontend relevante a UI

- **React 18 + Vite + TypeScript**, `react-router-dom` v7 para ruteo.
- **Tailwind CSS v4** vía plugin de Vite (no PostCSS aparte) — tokens de marca en `@theme`, resto
  de la app usa clases utilitarias estándar de Tailwind más un set propio de clases semánticas en
  `frontend/src/App.css` (`.btn-primary`, `.full-table`, `.page-toolbar`, `.popover-panel`, etc. —
  ver `design-system.md` para el catálogo razonado, o `App.css` directo para el CSS real).
- **Sin librería de componentes UI** (no MUI/Chakra/Radix/shadcn) — todo (popover, modal, slide-over,
  toasts, date picker de color, tablas) está construido a mano sobre Tailwind. Antes de proponer
  sumar una, ver la regla del charter: necesita justificación explícita, no se agrega por default.
- **Sin test de frontend** (no hay Vitest/RTL/Playwright instalado como dependencia del repo) — la
  verificación de UI se hace con Playwright ad-hoc por sesión (ver `Skills QA.md`), no hay suite
  persistida en el repo todavía.

## 3. Arquitectura de layout real

```
App.tsx (rutas)
 └─ AppLayout.tsx           (autenticado; NO envuelve en .container — ver más abajo)
     ├─ TopBar.tsx          (header fijo arriba, logo + dropdown de usuario)
     ├─ Sidebar.tsx         (colapsable, redimensiona .app-main real, no es overlay)
     └─ <Outlet /> → .app-main
         ├─ OverviewPage, HelpPage, HrDashboardPage, ClientsDashboardPage  → .container (centrado, angosto)
         ├─ EmployeesPage, ClientsPage                                     → .page-full (ancho completo)
         └─ WorkspaceSettingsLayout (/settings/*)                          → .container (centrado)
             ├─ ProfileSettingsPage, CompanyAppearancePage
             ├─ CompanyUsersPage        → .page-full internamente (tabla), aunque el layout padre es .container
             └─ PublicFormsSettingsPage
```

- **`AppLayout.tsx` ya NO tiene el bug de `.container` global** que estuvo documentado como pendiente
  hasta 2026-07-23 — se sacó el wrapper de ahí; cada página decide `.container` (centrado, `max-w-6xl`)
  vs. `.page-full` (mismo padding, sin tope de ancho) según si es un form/dashboard o una tabla.
- **Sidebar** realmente resiza el contenido (flex, no `position:fixed` con margin compensado) —
  colapsarlo libera ancho real para `.full-table-wrap`.
- **Rutas públicas** (`/login`, `/register`, `/accept-invite/:token`, `/apply/:tenantSlug/:formSlug`)
  no pasan por `AppLayout` — `LoginPage`/`RegisterPage` usan `AuthLayout.tsx` (split-screen navy +
  celeste), `AcceptInvitePage`/`PublicFormPage` tienen su propio layout de card centrada.

## 4. Inventario de componentes reutilizables (`frontend/src/components/`)

**Genéricos, usar antes de reinventar:**

| Componente | Uso |
|---|---|
| `SlideOver.tsx` | Panel lateral overlay+scrim para forms de entidad completa (4+ campos) |
| `Popover.tsx` | Portal a `document.body`, clampea contra el viewport, recalcula posición en cada frame mientras está abierto — mecanismo estándar de cualquier dropdown/menú flotante nuevo |
| `ColorPicker.tsx` | Selector de color (paleta + custom persistido en `localStorage`), usa `Popover` internamente |
| `ToastProvider.tsx` / `useToast()` | Nunca `alert()` |
| `ConfirmDialog.tsx` | Nunca `confirm()` nativo |
| `Pagination.tsx` | 20 filas/página, client-side |
| `AuthLayout.tsx` | Split-screen Login/Register |
| `PasswordChecklist.tsx` / `PasswordInput.tsx` | Requisitos en vivo + toggle mostrar/ocultar |
| `FilterBar.tsx` | Filtros de vista grid (campos base + custom fields, operador según tipo) |
| `ViewsBar.tsx` | Tabs de vistas guardadas (Grid/List/Kanban) + crear/editar/borrar vista |
| `KanbanBoard.tsx` | Tablero genérico agrupado por Status o custom field `select`, con `renderColumnFooter` (usado para la card fantasma de "Add") |
| `LegalDocumentModal.tsx` | Modal in-app que hace `fetch` del HTML real de la landing (Terms/Privacy) |

**De tabla (`.full-table`), construidos en las rondas de rediseño de Employees/Clients/Company Users:**

| Componente / hook | Uso |
|---|---|
| `Avatar.tsx` | Círculo de iniciales, mismo color en los 2 temas (sin `dark:`) |
| `StatusChip.tsx` | Punto de color + texto — usa el color real de `StatusDefinition` |
| `RoleChip.tsx` | Pill de color por rol, solo Company Users, solo filas no editables |
| `StatusColumnMenu.tsx`, `FieldCatalogMenu.tsx`, `CustomFieldColumnMenu.tsx`, `AddCustomFieldColumn.tsx` | Menús de header de columna (manage options / editar campo) |
| `ColumnResizeHandle.tsx` + `useResizableColumns.ts` | Resize de ancho por drag, persistido en `localStorage` por tabla |
| `ColumnVisibilityMenu.tsx` + `useColumnVisibility.ts` | Ocultar/mostrar columnas |
| `useColumnOrder.ts` | Reordenar columnas por drag (Name/Status quedan fijas — ver sección 5) |
| `HorizontalScrollbar.tsx` | Scrollbar horizontal propia (colores de marca, proporcional, Shift+rueda) — **solo horizontal, solo en Employees hoy** |
| `EmployeeOverviewPanel.tsx` | Panel "push" (no overlay) al clickear el nombre de una fila — **solo Employees, no genérico todavía** |
| `CsvImportExportMenu.tsx` | Export/import CSV, Employees + Clients |
| `OnboardingChecklist.tsx`, `ChangelogMenu.tsx` | Overview: checklist de onboarding, popover de novedades con punto de "no leído" |

## 5. Patrón de referencia: Employees (el más avanzado — replicar desde acá, no reinventar)

`EmployeesPage.tsx` es hoy la implementación más completa del lenguaje visual de tablas y sirve de
plantilla para llevar Clients/Company Users al mismo nivel:

- Tabla `.full-table` a ancho completo (`.page-full`, sin `.container`), columnas con resize/hide-show/
  reorder por drag, **Name y Status congeladas** (`position: sticky`) durante el scroll horizontal.
- 3 tipos de vista (`SavedView.type`: `grid` | `kanban` | `list`), tabs en `ViewsBar.tsx`. Grid con
  sort por columna; Kanban agrupado por Status/custom field `select`, drag de card actualiza el campo
  real; List agrupado igual que Kanban pero como secciones de tabla colapsables (pill de color +
  contador).
- Fila/card **fantasma** siempre visible como único mecanismo de "Add" (sin botón primario en el
  toolbar) en las 3 vistas — con un botón de fallback en el toolbar que aparece **solo** si la vista
  queda sin filas donde mostrar la fantasma (0 resultados filtrados, o `groupByField` roto).
- Click en el nombre de una fila abre `EmployeeOverviewPanel.tsx` — panel que empuja el contenido
  (flex sibling, no overlay/scrim), tabs Overview/Notes/Activity (Notes/Activity son placeholder
  "Nothing here yet" a propósito, sin funcionalidad).
- Avatar + `StatusChip` en la celda de nombre/status; headers de tabla en minúscula/capitalizado
  normal (no `uppercase`), jerarquía tipográfica real entre la columna Name y el resto.
- `HorizontalScrollbar.tsx` propia + Shift+rueda para scroll horizontal.

**Gap conocido, explícito, no es un bug oculto — está anotado en `docs/tareas-desarrollo.md` línea 350:**
nada de esto (ghost row, scrollbar propia, Overview panel, tipografía, hover de fila) está replicado
todavía en `ClientsPage.tsx` ni `CompanyUsersPage.tsx`. Antes de copiar/pegar el bloque: `HorizontalScrollbar`
ya es genérico (recibe un `ref`, se puede reusar tal cual); `EmployeeOverviewPanel.tsx` y la lógica de
`listSections` (duplica agrupamiento que `KanbanBoard.tsx` ya hace internamente) no lo son, conviene
generalizarlos antes de la tercera copia. Company Users nunca tuvo Views/Kanban (decisión explícita —
no tiene custom fields), así que ahí no aplica List/Kanban, pero sí ghost row + scrollbar + hover +
tipografía + un Overview panel propio de usuario.

**Bug real ya encontrado, sin corregir**: `ClientsPage.tsx` sí tiene el valor `'list'` en su tipo de
`SavedView`, pero no tiene ninguna rama de render para ese caso — si un usuario crea una vista `list`
en Clients hoy, cae silenciosamente a la tabla plana de grid sin agrupar y sin `FilterBar`/
`ColumnVisibilityMenu`.

## 6. Otros gaps visuales conocidos, sin resolver

- **Logo en fondo oscuro**: 2 de los 3 tonos de la variante `logo-horizontal-dark.svg` tienen
  contraste ~1.05:1 entre sí (`#fdfcf8` vs `#ffffff`) — en la práctica se lee casi como blanco plano
  en vez de las 3 capas de profundidad que sí se ven en la variante clara. Ver `design-system.md`
  sección 6.
- **Sin clase dedicada para warning** (`amber-*` se usa con criterio caso a caso, no hay un
  `.btn-warning`/`.chip-warning` formalizado como sí existen para danger/success).
- **Responsive**: cubierto para las pantallas de auth y el shell general (sidebar colapsa a overlay
  en mobile), pero no verificado explícitamente pantalla por pantalla contra el patrón de tabla nuevo
  (ghost row / panel push / columnas congeladas) en viewports angostos reales — punto a confirmar con
  Playwright antes de dar por cerrado cualquier trabajo de mobile sobre estas 3 tablas.

## 7. Artifacts de referencia ya aprobados (mockups — URLs efímeras, usar como contexto histórico de qué se decidió y por qué, no como fuente de verdad de qué existe hoy en código)

- "Northstack — Diseño de pantallas" — pantallas homogéneas a escala real, incluye dark mode
  completo; referencia usada para el rediseño de Employees/Clients/Company Users (avatares, chips,
  headers).
- "Northstack — Views, filtros y Kanban" — spec de Grid/Kanban, filtros, vistas personales/compartidas.
- "Northstack — Settings reconciliado" — spec del hub único de Settings (Mi cuenta / Empresa).
- "Northstack — Logo en fondo oscuro" — 3 opciones de recoloreo comparadas contra los assets reales.
- "Northstack — Scrollbars de planilla" — spec de la scrollbar propia + Shift+rueda.
- "Northstack — Tablas full-screen + panel Overview" — el más reciente y el más grande: ghost row,
  Overview panel push-left, vista List, tipografía compacta, hover de fila completo. Es el spec que
  generó el bloque de 6 tareas ya implementado en Employees (sección 5 de este doc).

## 8. Proceso — cómo se decide y se documenta un cambio visual acá

Ver `docs/Skills/Skills UXUI.md` (charter completo) — resumen operativo:

1. Cambios chicos (un color, un ícono, un padding) se pueden proponer/discutir directo.
2. Cualquier cosa más grande: mockup/Artifact primero, dejar elegir entre variantes si hay ambigüedad,
   **no implementar código directamente** — la implementación final es del agente de Development.
3. La spec aprobada se carga en `docs/tareas/Task-UxUI.md` (fechada) para que Development la tome.
4. Todo cambio de UI se verifica en navegador contra un tenant de prueba real antes de darlo por
   hecho — no alcanza con leer el código o confirmar que compila.
