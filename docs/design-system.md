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
| `.tb-btn` | Botones de **toolbar** que no son la acción primaria (ej. Filter) | Borde gris, texto navy, ícono + label corto |

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
`TopBar.tsx`, `AcceptInvitePage.tsx`, `AuthLayout.tsx`) **no es blanco plano** — es una variante a 3
tonos claros que conserva la profundidad del isotipo original en vez de aplanarlo a una silueta:

| Tono original | Tono en fondo oscuro |
|---|---|
| `#0d2a48` (navy — wordmark + acento del ícono) | `#ffffff` |
| `#3c6da1` (azul medio del ícono) | `#8dbada` |
| `#8dbada` (azul claro del ícono) | `#fdfcf8` |

Decisión confirmada por el usuario 2026-07-22 (Artifact "Northstack — Logo en fondo oscuro",
3 opciones comparadas con los assets reales) — descartada la opción de blanco plano (`icon-white.svg`)
porque perdía la identidad del isotipo, aunque tuviera mejor contraste bruto.
