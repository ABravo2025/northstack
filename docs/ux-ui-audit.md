# Auditoría UX/UI — Northstack

- Fecha: 2026-07-15 (revisión de UX-03 el mismo día; UX-12 verificado y descartado por falso positivo, ver ambas notas en sus entradas; UX-13 a UX-19 implementadas el mismo día, ver nota al pie de esa sección)
- Alcance: `frontend/` (app en React/Vite) + `landing/` (HTML estático)
- Metodología: revisión de código fuente completa (todas las páginas, layouts, componentes y el sistema de estilos en `App.css`/`index.css`/`theme.ts`) + lectura de `docs/contexto-proyecto.md` y `docs/tareas-desarrollo.md` para entender qué decisiones fueron deliberadas vs. huecos no evaluados. **No incluye una pasada visual en navegador** (esta sesión no tiene herramienta de browser) — hallazgos de layout/contraste/interacción están inferidos del código, no observados en pantalla. Recomiendo una pasada visual rápida del usuario antes de cerrar prioridades, en particular para UX-07 y UX-10.
- Este documento es un insumo para decidir qué entra al backlog (`docs/tareas-desarrollo.md`) — todavía no se cargó nada ahí. Cada hallazgo tiene un ID (`UX-01`, ...) para referenciarlo fácil al priorizar.

## Resumen ejecutivo

El sistema de diseño (paleta de marca, Tailwind v4, dark mode, componentes utilitarios en `App.css`) es consistente y está bien resuelto para el estado del producto. Los huecos reales están en tres frentes: **conversión** (la landing no lleva a ningún lado), **accesibilidad** (cero atributos ARIA/label en toda la app) y **feedback de interacción** (confirmaciones nativas del navegador, un caso de acción sin feedback visible, sin sistema de toasts). Ninguno requiere rediseñar nada existente — son adiciones/ajustes puntuales sobre la base actual.

## Hallazgos — Alto impacto

**UX-01 — La landing no tiene ningún camino hacia la app**
`landing/index.html` no tiene un solo link a `/register` ni a `app.joinnorthstack.com` en todo el documento (solo Terms/Privacy en el footer). Fue una decisión explícita en su momento ("sin botones de Sign up/Log in por ahora, eso queda para cuando la beta esté en producción" — `docs/tareas-desarrollo.md`, entrada del 2026-07-13). La condición que la disparaba ya se cumplió: la app está en producción real desde hoy. Vale la pena revisitar la decisión ahora, no como error sino porque cambió el contexto que la motivó.

**UX-02 — Idioma inconsistente entre landing y app**
Landing en español (`lang="es"`, todo el copy), app en inglés (todas las páginas de `frontend/src/pages/`). Un visitante que lee el marketing en español entra a un producto en inglés justo en el momento de conversión — fricción de confianza evitable.

**UX-03 — Accesibilidad de formularios y menús, todavía incompleta**
`htmlFor` sigue en 0 ocurrencias en todo `frontend/src` — los `<label>` son hermanos del `<input>` dentro de `.form-group` (ver `EmployeesPage.tsx`, `RegisterPage.tsx`, etc.), no están asociados programáticamente, y un lector de pantalla no vincula la etiqueta al campo al hacer foco. El dropdown de usuario (`TopBar.tsx:31-69`) tampoco tiene `aria-expanded`, no cierra con Escape, y no hace focus trap (solo cierra por click afuera). *Corrección del 2026-07-15: la primera versión de este hallazgo decía "0 ocurrencias de `aria-*` en toda la app" — desactualizado, no contemplaba el módulo de PTO agregado después de esta auditoría. `ColorPicker.tsx` y `PtoOverviewPage.tsx` ya usan `aria-label` (6 casos) en los botones de swatch/remover. El patrón es bueno — falta extenderlo al resto de la app (labels de formulario, dropdown), no inventarlo de cero.*

**UX-04 — "Copy Link" no da ningún feedback**
`CompanyUsersPage.tsx:97-101` (`handleCopyLink`): copia el link de invitación al portapapeles pero solo hace `setActionError(null)` — no muestra ningún mensaje de éxito. El usuario no tiene forma de saber si el click funcionó. Contraste directo con `handleInvite` en la misma página (líneas 78-95), que sí confirma con un alert verde. Es una inconsistencia real dentro del mismo archivo, no solo una carencia general.

## Hallazgos — Impacto medio

**UX-05 — `confirm()` nativo para acciones destructivas/sensibles**
Borrar Employee (`EmployeesPage.tsx:168`), borrar Client (mismo patrón en `ClientsPage.tsx`), transferir ownership (`CompanyUsersPage.tsx:47-52`). El diálogo nativo del navegador no se puede estilizar, corta con la identidad visual del resto de la app y es una UX pobre en mobile/tablet.

**UX-06 — Sin sistema de toasts; el link de invitación se expone como texto plano**
Los mensajes de error/éxito son bloques `.alert` fijos arriba de la card (`EmployeesPage.tsx:222-223`, `CompanyUsersPage.tsx:117-118`, etc.) — si el usuario ya scrolleó una tabla larga, no los ve, y no se auto-descartan. Además, tanto `EmployeesPage.tsx:160` como `CompanyUsersPage.tsx:88` pegan el link completo de invitación (con el token) en texto plano dentro del alert verde, en vez de solo confirmar "Copiado" — expone el token en pantalla sin necesidad.

**UX-07 — Dos hubs de configuración con puntos de entrada distintos**
`/settings` (ícono de engranaje, abajo a la izquierda del sidebar → Custom Fields, Statuses) vs. `/company` (avatar de usuario, arriba a la derecha → Appearance, Users). Está documentado que pasó por 3 iteraciones explícitas con el usuario antes de asentarse en este diseño (`docs/tareas-desarrollo.md`, entradas del 2026-07-11). Lo anoto igual: 3 rondas de ajuste sobre el mismo problema es una señal de que el modelo mental de "dónde vive cada configuración" todavía no calzó con una intuición estable, más que evidencia de que ya está resuelto. Antes de invertir más en esto, valdría más una prueba con alguien nuevo al producto que una cuarta iteración a ciegas.

**UX-08 — Estados de carga y vacíos sin diseñar**
"Loading...", "No employees yet.", "No custom fields defined for this module yet." son texto plano sin estructura — sin skeleton, sin ilustración, sin CTA contextual (ej. "No employees yet" podría llevar directo al form de alta).

## Hallazgos — Impacto bajo / pulido

**UX-09 — Paleta de marca duplicada entre landing y app**
`landing/index.html:34-39` define las mismas 4 variables de color a mano (`--navy`, `--blue`, `--blue-light`, `--cream`) que ya existen en `frontend/src/index.css:5-9`. No es grave para un sitio de marketing chico, pero divergirán solas si la marca cambia y alguien actualiza un solo lado.

**UX-10 — Sin patrón de navegación mobile**
El sidebar es de ancho fijo (`w-48` expandido / `w-14` colapsado, `Sidebar.tsx`), sin hamburger ni drawer para viewports angostos. Puede ser una decisión correcta si el target es desktop-first B2B — pero conviene que sea explícita, no un default que nadie evaluó todavía. *Ya está trackeado como ítem propio en `docs/tareas-desarrollo.md` ("Responsive para celular y tablet") — no duplicar, solo referenciar este hallazgo desde ahí.*

**UX-11 — Sin paginación en las tablas**
`EmployeesPage.tsx` y `ClientsPage.tsx` cargan y renderizan la lista completa del tenant de una sola vez. No es un problema hoy con pocos registros por tenant, pero no hay ningún límite, scroll virtualizado ni paginación — anotado para cuando un tenant individual crezca a cientos de filas.

**UX-12 — Descartado (falso positivo), verificado 2026-07-15**: este hallazgo decía que `.calendar-cell-today` (`App.css:167-169`) usaba `bg-brand-blue\5` (contrabarra, inválido) en vez de `bg-brand-blue/5`. Se verificó el código real: la clase ya usa la barra correcta (`bg-brand-blue/5 dark:bg-brand-blue/10`), y el CSS compilado confirma que genera `background-color:#3c6da10d` — el resaltado de "hoy" en `/overview` sí se pinta. El hallazgo original era incorrecto, posiblemente una mala lectura del carácter al momento de escribirlo. Se deja la entrada en vez de borrarla para que quede registro de que se investigó y no era real.

## No evaluado en esta ronda

- Contraste de color real y comportamiento visual del dark mode (requiere ver la app renderizada, no solo el CSS).
- Performance percibida (tiempos de carga reales, tamaño de bundle).
- Copy/microcopy en detalle (tono, claridad de mensajes de error específicos más allá de los ya citados).

## Decisiones de rediseño confirmadas — mockup "Rediseño de interfaz" (2026-07-15)

UX-01 a UX-12 son hallazgos (problemas detectados); esto en cambio ya son **soluciones concretas, confirmadas por el usuario e implementadas** (2026-07-15) sobre un segundo Artifact interactivo ("Northstack — Rediseño de interfaz"), a partir de un pedido explícito de revisar la interfaz completa bajo estándares de UX actuales (landing y los Dashboards vacíos de HR/Clients quedaron fuera a propósito, se retoman aparte). El detalle de implementación (archivos, componentes nuevos, verificación en navegador) está en `docs/tareas-desarrollo.md`, sección `### UX / Interfaz` — este documento queda como referencia del diseño original confirmado.

**UX-13 — Employees/Clients: tabla a pantalla completa**
La tabla deja el wrapper `.card` actual y pasa a ocupar todo el espacio disponible, con una toolbar (búsqueda + botón "Add") pineada arriba. Los botones de texto "Edit"/"Delete"/"Invite" de cada fila se reemplazan por íconos con tooltip.

**UX-14 — Alta/edición en panel lateral (slide-over)**
El form de alta/edición deja de empujar la tabla hacia abajo — pasa a un panel que flota sobre la tabla desde la derecha, sin reordenar el layout. Mismo patrón para "Add" y "Edit" en Employees y Clients.

**UX-15 — Fondo unificado**
Hoy conviven 3 tonos de superficie por pantalla (`--cream` de página, blanco de `.card`, `gray-50` del `thead`). Pasan a un solo tono en toda la app — la separación entre elementos la da el borde, no el color.

**UX-16 — Checklist en vivo de requisitos de contraseña**
En Register, Accept Invite y Change Password (Profile): 8+ caracteres / 1 mayúscula / 1 número / 1 carácter especial, cada uno tildándose en verde a medida que se cumple mientras el usuario escribe, en vez de aparecer recién como error del servidor al enviar.

**UX-17 — Botón de mostrar/ocultar contraseña**
Ícono de ojo en todos los campos de tipo password de la app (Login, Register, Accept Invite, Change Password).

**UX-18 — Escala de espaciado consistente + responsive**
Token de 6 pasos (4/8/12/16/24/32px) en vez de la mezcla actual de `mb-4`/`mb-5`/`gap-2.5` sueltos, aplicado junto con hacer responsive el layout de tablas rediseñadas (UX-13) para mobile — toolbar apilada, tabla con scroll horizontal propio. Mismo alcance que el ítem ya existente en `docs/tareas-desarrollo.md` ("Responsive para celular y tablet") — coordinar con ese, no duplicar.

**UX-19 — Login/Register: pantalla partida**
Form a la izquierda sobre panel navy oscuro; panel de marca a la derecha (logo + "NORTHSTACK" + tagline "HR management platform") sobre fondo celeste, con la variante de ilustración **"Minimal"** (blobs suaves, sin ilustración figurativa) — elegida por el usuario entre 3 opciones probadas en vivo (red de personas conectadas / tarjetas flotantes / minimal). El panel derecho se reutiliza igual en Login y Register, solo cambia el form de la izquierda. Inspirado en una referencia visual externa que trajo el usuario, reconstruida a mano con la paleta real de Northstack — no se clonó la ilustración original.

**Idea abierta, sin decidir** — "Remember me" y "Forgot password?" aparecieron en la referencia visual que motivó UX-19, pero ninguna de las dos existe hoy: no hay flujo de recuperación de contraseña en el backend. Antes de construirlas hace falta definir alcance (¿recuperación por email con token de un solo uso, mismo mecanismo que las invitaciones? ¿qué hace "remember me" concretamente — sesión de duración distinta?) — solo anotado para no perderlo, no confirmado.
