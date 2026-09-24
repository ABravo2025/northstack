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

**Nota 2026-09-24**: completa, verificada end-to-end contra `staging` (Playwright). En `staging`,
pendiente de que se revise y promueva a `main`/producción junto con la Unidad 1.

- [x] Layout general: Sidebar, MobileTabbar, SettingsSidebar (+ `lib/settingsSections.tsx`, que
  también alimenta el tile grid de `SettingsHomePage`), TopBar (menú de usuario + formulario de
  feedback), NotificationBell, banners globales de `AppLayout` (nueva versión, suspendido,
  past_due, sin plan elegido).
- [x] Componentes genéricos: Pagination, ConfirmDialog, Modal/SlideOver (botón cerrar),
  ToastProvider (botón descartar), PasswordChecklist, PasswordInput.
- [x] De regalo: las cards de Profile/Change password en `ProfileSettingsPage` (la pantalla que
  el usuario tenía abierta cuando se verificó la Unidad 1) — formalmente es scope de la Unidad 7,
  pero se adelantó por ser la más visible en ese momento.
- [x] Mayor apalancamiento de todo el spec: todos los módulos heredan de acá.
- **Deliberadamente fuera de esta unidad** (confirmado al revisar cada componente): `EmptyState`
  y los cientos de `toast.success()`/`toast.error()` esparcidos por el código no tienen texto
  propio — reciben el suyo como prop desde cada página. Traducir esos mensajes es trabajo de cada
  unidad de módulo (3-8), no de esta.
- **Gap descubierto 2026-09-24 durante el QA de la Unidad 4** (no cubierto por ninguna unidad):
  `frontend/src/components/entity-views/*` — `FilterBar`, `ViewsBar`, `KanbanBoard`,
  `ColumnVisibilityMenu`, `StatusColumnMenu`, `CustomFieldColumnMenu`, `AddCustomFieldColumn`,
  `FieldCatalogMenu` (además de `CsvImportExportMenu`, que sí se arregló — ver nota de la Unidad 4).
  Son genuinamente compartidos entre Companies/Contacts/Opportunities/Employees, en el mismo
  espíritu que la Unidad 2 pero nunca asignados a ninguna unidad. `CsvImportExportMenu` mostraba
  una mezcla real de inglés/español en pantalla (el label de la entidad ya traducido interpolado
  dentro de una plantilla en inglés, ej. "Import Empresas from CSV") — corregido con un namespace
  `csvImport` nuevo en `common.json`. Los otros 7 archivos siguen sin tocar, mismo riesgo
  potencial de mezcla de idiomas si alguna unidad de módulo ya los interpola con texto traducido.

## Unidad 3 — Dashboards

**Nota 2026-09-24**: completa. Verificada por tsc/eslint (no Playwright — ver Unidad 12).

- [x] Los 5 sub-dashboards, `DashboardsLayout`, `DashboardsSidebar`, componentes de métricas
  (`StatTile`, `BarChartCard`, `DateRangeFilter`, `OverviewMetricsStrip`), y `dashboardsSections.tsx`/
  `dateRangePresets.ts` (mismo rol que `settingsSections.tsx`, ver Unidad 1/2). Namespace `dashboards`
  (123 keys, en/es).

## Unidad 4 — CRM

**Nota 2026-09-24**: **parcial**. Companies y Contacts completos (namespace `crm`, 388 keys,
en/es), verificado por tsc/eslint. **Sin empezar**: Opportunities, Payments,
`components/crm/*`. Se cortó por límite de uso de la sesión a mitad de trabajo — retomar desde
acá, no repetir Companies/Contacts.

## Unidad 5 — HR / Employees + Payroll

**Nota 2026-09-24**: **sin empezar, en la práctica**. Un intento paralelo llegó a editar 5
archivos (`EmployeeOverviewPanel`, `TerminateEmployeeModal`, `PayslipPreviewModal`,
`PayrollPage`, `PayrollRunDetailPage`) pero se cortó por límite de sesión antes de escribir el
JSON de traducciones — los componentes quedaron referenciando keys que no existen en ningún
archivo. Se descartó ese trabajo entero (no mergeable, habría mostrado keys crudas en pantalla)
en vez de reconstruirlo a ciegas. Sigue 100% en inglés, sin ningún archivo roto.

- [ ] People (alta, contrato, perfil), y todo el módulo Payroll (runs, pagos únicos, políticas,
  compensación).

## Unidad 6 — Tasks + Time Off

**Nota 2026-09-24**: completa. `MyTasksPage`, todo `components/tasks/*`, `TimeOffSidebar`.
Namespace `tasks` (242 keys, en/es, con un subárbol `timeOff.*`). Verificada por tsc/eslint.

## Unidad 7 — Settings (todas las subpáginas) + Billing/Plans

**Nota 2026-09-24**: **parcial**. `IntegrationsSettingsPage`, `CompanyAppearancePage`,
`CompanyUsersPage`, `PublicFormsSettingsPage` completos (namespace `settingsPages`, 186 keys,
en/es), verificado por tsc/eslint. **Sin empezar**: `PipelinesSettingsPage`,
`RolesPermissionsPage`, `BillingPage`, `PlansModal`, `AddPaymentMethodModal`.
`ActivityLogSettingsPage.tsx` quedó a medio editar (referenciaba keys nunca escritas en el JSON)
y se revirtió entero — sigue 100% en inglés. **Dato importante para quien retome**: esa página
resultó ser el visor real del feed de actividad completo (filtros, paginación, detalle
expandible), no una página chica de configuración de retención como decía el scope original —
presupuestar tiempo acorde, es tan grande como cualquier otra página de este spec.

## Unidad 8 — Notes + Activity Log

**Nota 2026-09-24**: completa. `components/notes/*` y `components/activity/EntityActivityList.tsx`
(el feed de actividad embebido en los paneles de detalle de Company/Contact/Opportunity/Employee —
**distinto** de `ActivityLogSettingsPage.tsx`, que es la página completa en Settings, ver nota de
la Unidad 7 arriba). Namespace `notesActivity` (22 keys, en/es). Verificada por tsc/eslint.

## Unidad 9 — Backend: emails transaccionales

**Nota 2026-09-24**: completa. i18next server-side propio (`src/lib/i18n.ts`,
`src/locales/{en,es}/emails.json`) — cada función de `mailer.ts` toma un `locale` explícito y
resuelve `t(key, {lng, ...})` por llamada, ya que un mismo request puede mandar a destinatarios
con idiomas distintos. `locale` agregado en cada call site con un `User` real disponible
(password reset, contract signed, opportunity stage-changed/stalled, respuestas de ticket, cambio
de política — resuelto por destinatario, no una vez por lote). Time Off usa un lookup chico
(`localeForEmployee`) porque sus destinatarios son `Employee`, no `User`.
**Deliberadamente en inglés**: invitaciones y el email de verificación de signup — ambos se
mandan antes de que exista una cuenta de la que sacar el idioma. `sendFeedbackEmail` (cliente →
equipo de Northstack) fuera de alcance, es 100% interno. Verificada por tsc, eslint, y toda la
suite de vitest (4353 tests); confirmado en runtime tanto con `tsx` como con el build compilado
(`tsc` + `node`, el path real de producción).

## Unidad 10 — Help Center (`/guide`, `/help`)

**Nota 2026-09-24**: **parcial**. `HelpPage.tsx` (FAQ) completo: `FAQ_CATEGORIES` duplicado como
`FAQ_CATEGORIES_ES`, elegido por `i18n.language`, más todo el chrome de la página (título,
búsqueda, nav, tarjetas de contacto/legal, contador final). Verificado por tsc/eslint.
**Sin empezar**: `GuidePage.tsx` (la Guía del usuario, 1000+ líneas de prosa) — se cortó por
límite de sesión antes de arrancarla. Sigue 100% en inglés, sin estado roto. El esquema de URL
por idioma (`/es/guide`, `/es/help`) tampoco se implementó todavía — hoy el idioma de esta unidad
sigue el mismo selector global que el resto de la app, no una URL separada.

## Unidad 11 — Landing

**Corrección 2026-09-24**: el dato original de este spec ("el landing ya está en español") era
**incorrecto** — se verificó directamente contra `origin/landing` (`<html lang="en">`, sin
ningún rastro de español en ningún archivo) y estaba desactualizado respecto al dato real en
`docs/tareas/backlog.md`. La dirección real es la **misma** que el resto de las unidades: agregar
español, no inglés. Sin empezar — deliberadamente no delegado a un agente en paralelo dado que
esta rama va directo a producción sin staging (ver `feedback_push_confirmation` en memoria); el
contenido son 6 páginas HTML estáticas (index, about, 404, privacy, refund, terms — no es una SPA
de React), lo que además cambia el mecanismo de implementación respecto a las demás unidades
(probablemente duplicar cada `.html` bajo un prefijo `/es/` con `hreflang` correcto, dado que es
un sitio de marketing con SEO ya cuidado — robots.txt/sitemap.xml/canonical tags existentes).

## Unidad 12 — QA de layout en ambos idiomas

- [ ] Pasada completa con la app en español revisando que ningún texto rompa layout: el español
  corre ~15-30% más largo que inglés en promedio, riesgo concreto sobre botones, badges y el
  sidebar dado el trabajo reciente de paleta/dark mode/mobile-responsive. Repetir en mobile.
- [ ] Confirmar que no quedó ninguna key cruda visible ni string hardcodeado remanente en los
  módulos de las unidades 2-8.
