# Brief UX/UI — Northstack

- Fecha: 2026-07-30
- Propósito: foto rápida y consolidada de dónde está parada la interfaz hoy — sistema de diseño,
  patrones de interacción ya resueltos, y huecos conocidos todavía abiertos. Para el detalle
  histórico de cada decisión (por qué se hizo así, qué se descartó) ver `design-system.md` (spec de
  tokens/componentes) y `ux-ui-audit.md` (auditoría original, 2026-07-15, con hallazgos UX-01 a
  UX-19 — varios ya resueltos, otros siguen abiertos, marcados abajo).

## 1. Sistema de diseño (resumen — spec completa en `design-system.md`)

- **Paleta de marca**: `brand-navy` (#0d2a48, texto/headings), `brand-blue` (#3c6da1, acento
  primario), `brand-blue-light` (#8dbada), `brand-cream` (#fdfcf8, fondo claro). Colores semánticos
  (danger/success/warning/neutral) nunca se pisan con el acento de marca.
- **Tipografía**: `.page-title`/`.card-title` como únicas clases de heading reusables; cuerpo
  siempre `text-sm`, texto auxiliar `text-xs text-gray-500`.
- **Botones**: jerarquía estricta — `.btn-primary` (máx. 1 por pantalla), `.btn-secondary`,
  `.btn-outline`, `.btn-danger` (siempre rojo semántico), `.btn-success`, `.icon-btn` (acciones de
  fila), `.tb-btn` (toolbar).
- **Espaciado**: escala de 6 pasos (4/8/12/16/24/32px), sin valores sueltos.
- **Íconos**: fuente única `Icons.tsx`, spec compartida (`stroke`, `viewBox 0 0 24 24`,
  `stroke-width 1.8`), nunca emoji como ícono de UI.
- **Dark mode**: soportado en toda la app vía clases `dark:` de Tailwind — no es un modo parcial,
  se mantiene disciplinadamente módulo por módulo a medida que se agregan pantallas nuevas.
- **Logo**: variante de 3 tonos para fondo oscuro (no blanco plano) — pendiente de revisar el
  contraste entre dos de esos tonos (~1.05:1, casi indistinguibles), ver `design-system.md` §6.

## 2. Patrones de interacción ya resueltos (base común entre módulos)

Estos son los bloques que **todas** las pantallas de entidad (Companies/Contacts/Opportunities/
Employees) comparten — construidos una vez, reusados, no reinventados por módulo:

- **`SlideOver.tsx`**: panel lateral flotante para alta/edición — reemplazó los forms inline que
  empujaban la tabla.
- **Paneles de detalle (Company/Contact/Opportunity/Employee)**: **70vw × 70vh, 2 columnas** —
  izquierda grid de 2 columnas de campos con autosave (`AutoSaveField`/`AutoSaveSelect`, sin botón
  "Save" ni modo edición separado — guarda al perder foco), derecha tabs **Notes / Tasks /
  Activity** (`DetailSidebar.tsx`, componente compartido literal por los 4). Activity es placeholder
  (sin sistema de auditoría real detrás todavía, Tier 5). Rediseñado 2026-07-29/30 desde un popup
  angosto centrado de 460px — ver `tareas-desarrollo.md` para el detalle de esa sesión.
- **`Popover.tsx`**: único mecanismo para dropdowns flotantes — clamping de viewport +
  reposicionamiento continuo. Regla del proyecto: ningún dropdown nuevo se hace con un `<div
  absolute>` a mano.
- **Views (vistas guardadas)**: filtros + orden + Grid/Kanban por entidad, personales o compartidas
  (`ViewsBar.tsx`, `FilterBar.tsx`, `KanbanBoard.tsx`) — Companies, Contacts, Employees, Opportunities.
- **Personalización de tabla**: columnas mostrar/ocultar (`ColumnVisibilityMenu.tsx`), reordenar por
  drag-and-drop, resize (`ColumnResizeHandle.tsx`) — persistido por vista, no global.
- **Custom Fields**: columna "+" al final del header para agregar campos por módulo
  (`AddCustomFieldColumn.tsx`/`CustomFieldColumnMenu.tsx`), mismo mecanismo en los 4 módulos con
  entidad + Public Forms.
- **Tasks/Notes inline**: compose siempre expandido en el tab correspondiente del panel de detalle
  (no popover-al-click, salvo 2 excepciones que siguen siendo popover a propósito: el widget "Mis
  tareas" de `/overview` y las entradas de Task en el calendario — ninguna abre en modo "nuevo", sin
  riesgo de salto de tamaño).
- **CSV import/export**: patrón genérico (`CsvImportExportMenu.tsx`) con template descargable,
  usado hoy por Employees.
- **Confirmaciones destructivas**: `ConfirmDialog.tsx` (modal propio) para archivar/borrar/transferir
  ownership — reemplazó los `confirm()` nativos del navegador (hallazgo UX-05, resuelto).
- **Toasts**: `ToastProvider.tsx` para feedback de éxito/error no bloqueante (hallazgo UX-06,
  resuelto para las acciones migradas a este patrón).
- **Checklist de contraseña en vivo** (Register/Accept Invite/Change Password) y **mostrar/ocultar
  contraseña** — hallazgos UX-16/UX-17, resueltos.

## 3. Estado por módulo

| Módulo | UX implementada |
|---|---|
| **Companies / Contacts / Opportunities** | Grid + Kanban, Views, custom fields, panel de detalle 2 columnas, Tasks/Notes. Opportunities agrega indicador de tiempo-en-stage. |
| **Employees** | Mismo patrón que CRM (migrado 2026-07-30, ya no tiene tabs/botón Edit separado) + Time Off Policies asignadas desde el panel, + CSV import/export. |
| **Time Off** | Vista de calendario + solicitudes/aprobación, balances por política. |
| **Tasks / Notes** | Cross-entidad (Employee/Company/Contact/Opportunity), tab en el panel de detalle + widget "Mis tareas" en `/overview` + entradas en el calendario. |
| **Public Forms** | Builder drag-and-drop con preview en vivo, pestañas por módulo, captcha (Turnstile) + honeypot anti-spam, mensaje de agradecimiento personalizable, notificación por email al owner. |
| **Settings** | Custom Fields y Statuses centralizados por módulo, Company Users (roles/invitaciones), Appearance, Field Catalog. Grid de tiles con sección "Próximamente" (Integrations/Billing, deshabilitados). |
| **Onboarding** | Checklist en `/overview` con acciones pendientes + "cargar datos de ejemplo". |
| **Ayuda / Changelog** | FAQ estático + menú de novedades in-app (`ChangelogMenu.tsx`). |
| **Clients (legado)** | En baja — reemplazado por Company/Contact/Opportunity. La página propia ya se borró del frontend (2026-07-30); el modelo de datos sigue vivo internamente (onboarding, Public Forms) hasta que se resuelva la migración de Custom Fields/Public Forms pendiente. |

## 4. Accesibilidad — estado real (de `ux-ui-audit.md`, sin repasar visualmente desde entonces)

- **Sin resolver**: `htmlFor`/`id` en labels de formulario (0 ocurrencias en toda la app — los
  `<label>` son hermanos visuales del input, no están asociados programáticamente). Dropdown de
  usuario (`TopBar.tsx`) sin `aria-expanded`, sin cierre por Escape, sin focus trap.
  **Parcialmente resuelto**: `aria-label` sí existe en botones de swatch/remover de
  `ColorPicker.tsx`/Time Off — el patrón es bueno, falta extenderlo.
- **Sin patrón de navegación mobile** (UX-10): sidebar de ancho fijo, sin hamburger/drawer. Puede
  ser una decisión correcta para un producto desktop-first B2B, pero sigue sin ser una decisión
  *explícita* — solo un default no evaluado. Trackeado aparte en `tareas-desarrollo.md`
  ("Responsive para celular y tablet").
- **No evaluado nunca en navegador real**: contraste de color efectivo en dark mode, performance
  percibida, tamaño de bundle. La mayoría de las sesiones de este proyecto no tuvieron Playwright/
  herramienta de automatización de navegador disponible — lo implementado se verificó por
  build/tests/curl + revisión del usuario en vivo, no por captura propia. Recomendado: una pasada
  visual completa con Playwright antes de la próxima ronda grande de UX.

## 5. Hallazgos abiertos de la auditoría original (`ux-ui-audit.md`, 2026-07-15) que siguen sin tocar

- **UX-01 / UX-02**: la landing (`landing/`) sigue sin ningún link hacia `/register`/la app, y sigue
  en español mientras la app está en inglés — fricción de conversión justo en el momento de mayor
  intención. La condición que originalmente justificaba no linkear ("la app no está en producción
  todavía") ya no aplica.
- **UX-04**: "Copy Link" en `CompanyUsersPage.tsx` sigue sin dar feedback visual de éxito (no
  migrado al patrón de toast todavía).
- **UX-07**: dos hubs de configuración con entrada distinta (`/settings` vs. `/company`) — ya pasó
  por 3 iteraciones con el usuario sin asentarse; el audit sugiere probarlo con alguien nuevo al
  producto antes de una cuarta iteración a ciegas.
- **UX-08**: estados vacíos/de carga siguen siendo texto plano sin CTA contextual en la mayoría de
  las pantallas fuera de Employees/Companies/Contacts (que sí ganaron CTA, ver `tareas-desarrollo.md`).
- **UX-09**: paleta de marca duplicada a mano en `landing/index.html` en vez de compartir los tokens
  de `frontend/src/index.css`.
- **UX-11**: ya resuelto para Employees/Companies/Contacts/Opportunities (paginación client-side,
  20/página) — sigue pendiente para cualquier tabla nueva que no pase por ese patrón.

## 6. Referencias

- `design-system.md` — spec completa de tokens/componentes (fuente de verdad para implementar
  pantallas nuevas).
- `ux-ui-audit.md` — auditoría original con el detalle completo de cada hallazgo UX-01 a UX-19.
- `current-process-flow.md` / `current-process-flow-visual.html` — diagramas de flujo de usuario.
- `tareas-desarrollo.md` — historial completo de cada decisión de UX implementada, con contexto de
  por qué y verificación.
