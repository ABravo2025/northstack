# SEO — joinnorthstack.com

Registro vivo de todo lo que hacemos para aparecer en Google: qué se hizo, dónde estamos y qué sigue.
**Actualizar este archivo cada vez que se toque algo de SEO** (y sumar una línea al changelog de
`handoff.md`). El SEO es parte del marketing, por eso vive en esta rama.

_Última actualización: 2026-10-03_

---

## Dónde estamos (resumen)

| Tema | Estado |
|---|---|
| Search Console | ✅ Propiedad de **Dominio** `joinnorthstack.com` verificada (TXT en Cloudflare) |
| Sitemap | ✅ Enviado 2026-10-02, **leído correctamente el 2026-10-03** (`https://joinnorthstack.com/sitemap.xml`, 9 URLs desde el pase 1). El primer "No se ha podido leer" fue el aviso típico de recién enviado |
| Indexación | 1 página indexada (`/`). `http://` sin indexar = redirección a https, es correcto. Pedida indexación manual de `/` y `/es/` |
| Rendimiento (3 meses al 2026-10-02) | 9 impresiones, 0 clics, posición media 17,9 (filtro EE. UU.; revisar sin filtro) |
| Pase técnico | ✅ Hecho 2026-10-02 (títulos, descripciones, canonical, hreflang, OG por idioma, JSON-LD, robots, sitemap) |
| Páginas por módulo | ✅ Pase 1 (Vacaciones ES/EN) **en producción desde 2026-10-03** · ⬜ CRM, RR.HH., Nómina |
| Backlinks / directorios | 🟡 En curso: **G2 aprobado 2026-10-03**. Resto pendiente (tabla en `2026-10/semana-01/directorios/perfil-producto.md`) |
| Analítica del sitio | ✅ En producción desde 2026-10-25 (`landing` e721e74): GTM `GTM-TJHVX9R4` + Consent Mode v2 + banner + Política de Cookies. ⚠️ GA4 `G-DQJ1K0FVJ5` todavía **no publicado dentro del contenedor GTM** (lo hace Alejandro) |

## Problemas conocidos

- ✅ **`www` arreglado 2026-10-03**: Vercel → proyecto `northstack-landing` → Settings → Domains → `www` →
  "Redirect to Another Domain" → `joinnorthstack.com` (308). Verificado: `www` (con cualquier ruta) → 308 al
  dominio sin www. (La redirección de `landing/vercel.json` nunca se aplicaba; queda como respaldo.)
- El diagnóstico de fondo: el sitio tiene solo 2 páginas que pueden posicionar (portada EN/ES), un
  dominio nuevo sin enlaces entrantes y H1 sin palabras clave. La parte técnica no es el cuello de botella.

## Auditoría 2026-10-20

- Velocidad OK: páginas de ~15 KB comprimidas (brotli), respuesta ~0,5 s, sin imágenes pesadas. PageSpeed no se pudo correr (cupo de la API pública agotado) → correr a mano en pagespeed.web.dev.
- About EN/ES **sin meta description**; legales con descripciones de 3 palabras.
- Sitemap **no incluye** `/es/terms.html`, `/es/privacy.html`, `/es/refund.html` (creadas después) y sus `lastmod` están viejos (legales cambiaron 2026-10-16).
- Organization JSON-LD sin `sameAs` (LinkedIn, G2).
- **Gran hueco de contenido:** la portada no menciona Turnos / control horario / timesheet, Proyectos ni 2FA (todos en producción). "Control horario / registro de jornada / software de turnos" es el tema con más búsquedas del producto.
- Solo 4 páginas que pueden posicionar (portada EN/ES + Vacaciones EN/ES). Sin guías/blog.
- Sin analítica (se evalúa GA4).
- Ojo: otra sesión tiene cambios del landing sin pushear (revisión de planes, `ae79fd0`): coordinar antes de tocar la portada.

## Plan

1. **Search Console** — ✅ hecho. Revisar sitemap y "Páginas" cada semana.
2. **Directorios / backlinks** (Alejandro): Capterra/GetApp/Software Advice, G2, SaaSworthy,
   Product Hunt, AlternativeTo, Google Business Profile, LinkedIn de empresa con link al sitio.
3. **Páginas por módulo** (EN + ES, mismo diseño que el landing):

   | Módulo | ES | EN | Búsquedas objetivo | Estado |
   |---|---|---|---|---|
   | Ausencias | `/es/software-vacaciones` | `/time-off-software` | software de vacaciones para empleados, control de vacaciones y licencias, calendario de feriados / PTO tracker, leave management | ✅ En producción 2026-10-03 |
   | Turnos y control horario | `/es/control-horario` | `/employee-scheduling-software` | software de turnos, control horario, registro de jornada, fichaje / employee scheduling, timesheet software | 🟡 Pase 2, sin publicar |
   | CRM | `/es/crm-para-pymes` | `/crm-for-small-business` | CRM para pymes, CRM simple, pipeline de ventas / simple CRM, sales pipeline software | 🟡 Pase 2, sin publicar |
   | Proyectos | `/es/gestion-de-proyectos` | `/project-management-software` | gestión de proyectos para pymes / project management software for small teams | 🟡 Pase 2, sin publicar |
   | RR.HH. | `/es/legajo-digital` | `/hr-software` | legajo digital de empleados, software de RR.HH. para pymes / HR software for small business | ⬜ |
   | Nómina | `/es/recibos-de-sueldo` | `/payroll-tracking` | recibos de sueldo digitales, historial de liquidaciones / payroll records, payslip software | ⬜ |

   Regla: **nunca** apuntar a "software de liquidación de sueldos" — Northstack solo registra, no
   calcula ni paga (trae tráfico equivocado).
4. **Retoques en la portada** — ✅ publicados con el pase 1 (ver abajo).
5. **Después**: páginas de comparación ("Alternativa a Factorial / BambooHR / Humand") y guías/blog
   (ej. "Cómo calcular días de vacaciones según la LCT"), 1–2 por mes.
6. **Medición**: sumar analítica liviana y, a las 4–6 semanas de publicar, usar "Consultas" de Search
   Console para ajustar palabras clave reales. Expectativa: 3–6 meses para ver resultados.

## Pase 1 — Vacaciones + retoques de portada (2026-10-03)

**Estado:** ✅ **en producción desde 2026-10-03** (`landing` ca1f1ef, aprobado por Alejandro desde la vista
previa). Verificado en vivo: las 4 páginas responden 200 con su título nuevo, sitemap con 9 URLs,
`operatingSystem` "Web". `/time-off-software.html` también responde (el canonical apunta a la URL limpia).
Vista previa: https://claude.ai/artifact/GjPUvw5mBbLHNGtSYfQfPL

Qué incluye:
- `landing/es/software-vacaciones.html` y `landing/time-off-software.html` (nuevas): hero con mock de
  saldos, "Cómo funciona" (3 pasos), banda de feriados/días hábiles con el calendario de octubre,
  6 funciones, bloque "Parte de Northstack", 6 FAQ por idioma. JSON-LD: BreadcrumbList,
  SoftwareApplication, FAQPage. Canonical + hreflang cruzados EN↔ES.
- Portada EN/ES: título de Google con palabras clave ("Software de RR.HH., vacaciones y CRM para
  pymes — Northstack" / "HR, Time Off & CRM Software for Small Teams — Northstack"), línea
  `kicker` con palabras clave dentro del H1, texto de "Qué incluye" con palabras clave, link a
  Vacaciones en la banda oscura y en el pie, `operatingSystem` "Web" (se sacó Android).
- `sitemap.xml`: 2 URLs nuevas con hreflang. `vercel.json`: `rewrites` para URLs sin `.html`
  (solo las páginas nuevas; las existentes no cambian para no chocar con otras sesiones que editan
  las páginas legales).

Indexación de las 2 páginas nuevas pedida en Search Console el 2026-10-03.

## Pase 2 — Turnos, CRM y Proyectos + arreglos (2026-10-20)

**Estado:** commit local en la rama `seo-pass-2` (worktree `C:/tmp/ns-landing-seo`), basado en `origin/landing` d2ad0d8. **Sin push: esperando aprobación.** Vista previa: https://claude.ai/artifact/KMdMhxBJs1H5NV1Dgke6Br

- 6 páginas nuevas (Turnos y control horario, CRM, Proyectos × EN/ES), mismo diseño y precios dinámicos que Vacaciones. Funciones Growth marcadas con etiqueta "Growth". Todo verificado contra la guía de la app y `planLimits.ts`.
- Pie de página "Producto" con links a las 4 páginas de módulo en portada y en todas las páginas de módulo (enlazado interno).
- Páginas en español enlazan a los legales en español (`/es/terms.html` …) y el modal de legales los abre.
- About EN/ES con meta description.
- Sitemap completo: 18 URLs con pares EN/ES y `lastmod` real de los legales.
- **No toca** la sección "Qué incluye" de la portada: la rama `landing-plans` (ae79fd0, otra sesión) ya agrega Turnos y Proyectos ahí. Cuando se publique, sumar links de las tarjetas a las páginas de módulo.
- Pendiente para un pase 3: Legajo digital y Recibos de sueldo; `sameAs` (LinkedIn + G2) en el JSON-LD cuando estén los links.

## Analítica (en producción desde 2026-10-25)

- **GA4:** ID de medición `G-DQJ1K0FVJ5`. Retención en GA: 2 meses (lo que dice la política; si se cambia, actualizar Privacidad 2.4).
- **Política de Cookies** nueva EN/ES (`/cookies.html`, `/es/cookies.html`): `ns-consent` (necesaria), `_ga` y `_ga_DQJ1K0FVJ5` (2 años, solo con Aceptar); app sin cookies (sesión y preferencias en localStorage) y sin analítica todavía. En todos los pies, modal de legales y sitemap.
- **Privacidad 2.4** reescrita: sitio = en uso con consentimiento; app = "todavía no en uso" (otra sesión había anunciado GA también para la app, fa8c59a). Si se activa GA en la app, actualizar 2.4, la Política de Cookies y la tabla 4.1.
- Rechazar después de aceptar borra las cookies `_ga` (consent.js).

- Contenedor **Google Tag Manager `GTM-TJHVX9R4`** (lo creó Alejandro) en todas las páginas del landing, arriba del `<head>` + `<noscript>` al abrir `<body>`.
- **Consent Mode v2** antes de GTM: `analytics_storage` denegado hasta que la persona acepta; `ad_storage`, `ad_user_data`, `ad_personalization` siempre denegados.
- **Banner de cookies** `landing/consent.js` (EN/ES según el idioma de la página): Aceptar / Rechazar, guarda la elección en `localStorage` (`ns-consent`), link "Preferencias de cookies" / "Cookie settings" en el pie para cambiarla.
- **Política de privacidad EN/ES**: nueva sección 2.4 (analítica solo con consentimiento, sin publicidad, solo en el sitio, nunca dentro de la app), Google en la tabla de proveedores, fecha de vigencia 24/10/2026. La app muestra esta misma página en su modal de legales.
- **Dentro de GTM** (lo configura Alejandro): etiqueta "Etiqueta de Google" con el ID de medición de GA4 (`G-…`), activador *Initialization - All Pages*, y en *Configuración avanzada → Configuración de consentimiento* → "Requerir consentimiento adicional": `analytics_storage`. Publicar el contenedor. Sin ese paso la política (GA no corre si rechazás) no sería cierta.
- Herramientas: `tools/seo/analytics.cjs` (idempotente, etiqueta cualquier página nueva) + `tools/seo/consent.js`. **Toda página nueva del landing tiene que llevar GTM**: correr `analytics.cjs` después de generarla.

## Herramientas

`tools/seo/` — pase 2: `pages.cjs` (contenido de cada página), `build2.cjs` (genera páginas + pie + sitemap + rewrites, `LANDING=<carpeta> node build2.cjs --write`), `preview2.cjs` (vista previa para Artifact). Pase 1: `build-seo.cjs` + plantillas `vacaciones.es.html` / `vacaciones.en.html`. El script
copia el CSS compartido de `landing/es/index.html`, arma las páginas de módulo (FAQ en HTML + JSON-LD,
pie), aplica los retoques de portada, sitemap y `vercel.json`, y genera la vista previa para el
Artifact. Fue escrito para el pase 1 (los retoques de portada fallan a propósito si ya están
aplicados); para los próximos módulos, copiar una plantilla y reutilizar `buildModule()`.

## Changelog SEO (más nuevo arriba)
- **2026-10-25** — Analítica + banner de cookies + Política de Cookies **en producción** (`landing` e721e74), verificado en vivo. Falta publicar la etiqueta GA4 dentro de GTM. Pase 2 reconstruido encima (`seo-pass-2` aa4e8ac, 20 URLs), sigue esperando aprobación.
- **2026-10-24** — GTM + Consent Mode + banner + política de privacidad armados en la rama `analytics` (local). `seo-pass-2` rebaseada encima, con GTM en sus 6 páginas.
- **2026-10-20** — Pase 2 armado (Turnos/CRM/Proyectos EN/ES + arreglos de sitemap, About, legales ES). Vista previa publicada, sin push.
- **2026-10-20** — Auditoría del landing (ver sección "Auditoría 2026-10-20"). G2: perfil visible; reseñas descartadas por ahora (deben venir de clientes con su propia cuenta).
- **2026-10-03** — Perfil de Northstack en **G2 aprobado** (primer directorio / primer backlink externo).
- **2026-10-03** — Indexación pedida para `/es/software-vacaciones` y `/time-off-software`. Kit para directorios armado (`2026-10/semana-01/directorios/`).
- **2026-10-03** — `www.joinnorthstack.com` ahora redirige 308 a `joinnorthstack.com` (configurado en el dominio en Vercel).
- **2026-10-03** — Pase 1 **publicado en producción** (`landing` ca1f1ef): páginas de Vacaciones ES/EN + retoques de portada. Verificado en vivo.
- **2026-10-03** — Search Console ya reconoce el sitemap (antes mostraba "No se ha podido leer").
- **2026-10-03** — Pase 1 armado (Vacaciones ES/EN + retoques de portada), commit local `ca1f1ef`,
  vista previa publicada. Pendiente de push por límite de Vercel.
- **2026-10-02** — Search Console: propiedad de Dominio verificada, sitemap enviado, indexación pedida
  para `/` y `/es/`. Diagnóstico: 9 impresiones / 0 clics / posición 17,9; 1 página indexada.
  Detectado `www` sin redirección.
- **2026-10-02** — Pase técnico con el landing v2 (títulos ≤60, descripciones ≤145, OG por idioma,
  JSON-LD WebSite/Organization/SoftwareApplication/FAQPage, robots `max-image-preview`, sitemap con lastmod).
