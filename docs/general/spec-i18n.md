# Internacionalización (i18n) — Inglés + Español — spec técnico completo

Reemplaza el ítem de backlog "i18n: alcance sin definir" (`docs/tareas/backlog.md`). Decisiones
tomadas en conversación del 2026-09-24.

## Qué es y qué no es

**Es**: hacer la app bilingüe (inglés, idioma actual, + español agregado) con selector por
usuario, más el landing (que hoy está solo en español — agregarle inglés) y los emails
transaccionales. Incluye también el Help Center (`/guide`, `/help`).

**No es, bajo ninguna circunstancia**: traducción de datos ingresados por el usuario. Nombres de
Company/Contact, notas, valores de custom fields, títulos y descripciones de Task, contenido
importado por CSV, comentarios, labels que el usuario haya escrito — **nada que viva como
contenido de negocio en la base de datos pasa por el motor de traducción, nunca**. Queda
exactamente en el idioma en que cada usuario lo escribió. Esta es una regla dura, no un default:
`t()`/i18next se usa exclusivamente para el copy estático de la UI (labels, botones, headers,
mensajes del sistema, texto de emails transaccionales, contenido del Help Center), jamás para
render de datos que vienen de la DB.

**Tampoco entra en este spec** (fuera de alcance, no pedido):
- **Admin Center**: herramienta interna para platform-staff, no cliente-facing. Queda solo en
  inglés.
- Headers de exports CSV, el manual PDF de la plataforma, datos seed/demo.
- Cualquier idioma más allá de inglés/español (la arquitectura no lo impide a futuro, pero el
  contenido de este spec cubre solo estos dos).

## Decisiones de arquitectura

- **Selector de idioma por usuario** (no por tenant): cada persona ve la app en su propio idioma
  sin importar el tenant al que pertenezca. Vive en Settings → Profile (`ProfileSettingsPage`).
- **Resolución de idioma activo**: `User.locale` (nuevo campo, nullable) si está seteado → si no,
  se detecta `navigator.language` del browser en la primera carga → si no matchea `'es'` ni
  `'en'`, default a inglés. Nunca se le pregunta al usuario en un modal bloqueante; el selector
  en Profile es la única forma explícita de cambiarlo.
- **Método técnico**: `react-i18next` en frontend (más `i18next-browser-languagedetector` para el
  fallback de navegador). Backend usa `i18next` en modo servidor (sin detector de browser, resuelve
  por `User.locale` del destinatario) para emails y cualquier texto generado server-side.
- **Convención de namespaces**: un JSON de traducciones por módulo, en
  `frontend/src/locales/{en,es}/<namespace>.json`, reflejando la organización ya existente de
  `frontend/src/components/<modulo>` y `frontend/src/pages` (ej. `crm.json`, `hr.json`,
  `payroll.json`, `settings.json`, `common.json` para lo compartido).
- **Mensajes de error/validación del backend**: se devuelven como código (`error.code`), no como
  string final — el frontend los traduce con su propio i18n. Evita duplicar traducción de
  validaciones en dos lugares. Excepción: contenido que se renderiza server-side sin que el
  frontend lo vea (emails, HTML de tickets de plataforma) — ahí el backend sí resuelve el string
  final usando el `locale` del destinatario.
- **Fallback de key faltante**: si una key no tiene traducción en el idioma activo, se muestra el
  valor en inglés (nunca la key cruda).

Orden sugerido de ejecución: **1 → 12**, cada unidad se confirma y pushea a `staging` antes de
pasar a la siguiente (mismo patrón que Payroll/Custom Roles). Las unidades 9, 10 y 11 (emails,
Help Center, landing) no dependen de que las unidades de módulos de producto (3-8) estén
completas y pueden reordenarse según prioridad.

---

## Unidad 1 — Infraestructura base

**Nota 2026-09-24**: completa, verificada end-to-end contra `staging` (Playwright: login, switch
en↔es en vivo, persistencia tras reload, tenant de prueba descartado después). En `staging`,
pendiente de que se revise y promueva a `main`/producción.

- [x] Prisma: `User.locale` (string, nullable — `'en' | 'es' | null`). Push directo a `staging`
  (este proyecto no usa `prisma migrate`, solo `db push` por entorno — ver
  `docs/general/reference-database-environments` en memoria); falta correrlo contra producción
  cuando se promueva.
- [x] Instalado `react-i18next` + `i18next-browser-languagedetector` en frontend; `i18next` (sin
  el plugin de browser) en backend — instalado, sin uso todavía (arranca en la Unidad 9).
- [x] Estructura de namespaces arrancada (`frontend/src/locales/{en,es}/common.json`); la
  convención jerárquica de keys (ej. `crm.company.createButton`) se confirma recién en la Unidad 2
  cuando haya más de un namespace poblado.
- [x] En vez de `<I18nextProvider>`: `frontend/src/lib/i18n.ts` corre `i18n.use(initReactI18next).init(...)`
  como side effect importado en `main.tsx` antes del render (mismo patrón que `initTheme()`) —
  react-i18next usa esa instancia global automáticamente, `useTranslation()` funciona igual sin
  envolver `<App />`.
- [x] Selector de idioma en Settings → Profile (`ProfileSettingsPage.tsx`), persistido vía
  `PATCH /api/users/me/locale`. Cambiar el selector actualiza la UI sin reload (un único effect en
  `App.tsx`, disparado por cualquier `setUser`, sincroniza `i18n.changeLanguage` — no cada call
  site por separado).
- [x] Resolución de idioma activo: `i18next-browser-languagedetector` cubre el fallback de
  navegador; el effect de arriba aplica `User.locale` por encima en cuanto el usuario autenticado
  se carga.
- [x] Ningún módulo de producto fue tocado — solo el copy del selector mismo (`language.label`,
  `language.en`, `language.es`) usa `t()` por ahora.

## Unidad 2 — Shared / common

- [ ] Layout general, sidebar, navbar, botones y modales genéricos, tablas compartidas (el patrón
  reusable ya documentado en el contexto visual de UX/UI), paginación, estados vacíos/error,
  toasts/notificaciones del sistema.
- [ ] Mayor apalancamiento de todo el spec: todos los módulos heredan de acá.

## Unidad 3 — Dashboards

- [ ] Los 5 sub-dashboards existentes (Overview, HR, etc.) y sus componentes de métricas
  (`StatTile`, `BarChartCard`, etc. — solo los labels/títulos, nunca los valores/datos).

## Unidad 4 — CRM

- [ ] Companies, Contacts, Pipelines, Opportunities. Incluye vistas de detalle, formularios,
  Kanban de pipeline.

## Unidad 5 — HR / Employees + Payroll

- [ ] People (alta, contrato, perfil), y todo el módulo Payroll (runs, pagos únicos, políticas,
  compensación).

## Unidad 6 — Tasks + Time Off

- [ ] Cuidado particular: Tasks tuvo un restyle reciente (List/Board con estilos de tabla/card
  compartidos) — no romper ese trabajo al extraer strings.

## Unidad 7 — Settings (todas las subpáginas) + Billing/Plans

- [ ] Profile, Pipelines, Integrations, Public Forms, Activity Log settings, Roles, y las páginas
  de selección/gestión de plan (Starter/Growth) y billing.

## Unidad 8 — Notes + Activity Log

- [ ] Feed de actividad y el módulo de notas. Recordatorio de la regla dura: el **contenido** de
  una nota nunca se traduce, solo el chrome de la UI alrededor (botones, headers, filtros).

## Unidad 9 — Backend: emails transaccionales

- [ ] Extraer los templates HTML hardcodeados de `mailer.ts` y `platformTicketService.ts` a
  templates parametrizados por idioma.
- [ ] Selección de idioma: `User.locale` del destinatario si existe; fallback a inglés para
  destinatarios sin `User` todavía (ej. invitaciones a gente que aún no tiene cuenta).

## Unidad 10 — Help Center (`/guide`, `/help`)

- [ ] Traducir el contenido existente a español, con esquema de URL por idioma (ej. `/es/guide`)
  y selector propio ahí.
- [ ] **Costo permanente a partir de acá**: el Help Center ya tiene la regla de actualizarse cada
  vez que cambia una feature — desde esta unidad en adelante, cada actualización futura implica
  editar el contenido en los dos idiomas, no solo uno. No es un gap, es un costo de mantenimiento
  que queda anotado.

## Unidad 11 — Landing

- [ ] El landing ya está en español — acá se agrega inglés (dirección inversa a las unidades de
  producto). Rama separada `landing`, deploy directo a prod sin staging — mismo cuidado que ya se
  aplica ahí.

## Unidad 12 — QA de layout en ambos idiomas

- [ ] Pasada completa con la app en español revisando que ningún texto rompa layout: el español
  corre ~15-30% más largo que inglés en promedio, riesgo concreto sobre botones, badges y el
  sidebar dado el trabajo reciente de paleta/dark mode/mobile-responsive. Repetir en mobile.
- [ ] Confirmar que no quedó ninguna key cruda visible ni string hardcodeado remanente en los
  módulos de las unidades 2-8.
