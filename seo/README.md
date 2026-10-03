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
| Sitemap | ✅ Enviado 2026-10-02, **leído correctamente el 2026-10-03** (`https://joinnorthstack.com/sitemap.xml`, 7 URLs; pasa a 9 cuando se publique el pase 1). El primer "No se ha podido leer" fue el aviso típico de recién enviado |
| Indexación | 1 página indexada (`/`). `http://` sin indexar = redirección a https, es correcto. Pedida indexación manual de `/` y `/es/` |
| Rendimiento (3 meses al 2026-10-02) | 9 impresiones, 0 clics, posición media 17,9 (filtro EE. UU.; revisar sin filtro) |
| Pase técnico | ✅ Hecho 2026-10-02 (títulos, descripciones, canonical, hreflang, OG por idioma, JSON-LD, robots, sitemap) |
| Páginas por módulo | 🟡 Pase 1 (Vacaciones ES/EN) **armado, sin publicar** — esperando cupo de deploys de Vercel |
| Backlinks / directorios | ⬜ Pendiente (lo hace Alejandro) |
| Analítica del sitio | ⬜ No hay (ni Analytics ni Plausible/Vercel Analytics) |

## Problemas conocidos

- **`www.joinnorthstack.com` responde 200 en vez de redirigir** al dominio sin www, aunque
  `landing/vercel.json` tiene la redirección (no se aplica). Contenido duplicado; el `canonical` lo
  mitiga. Arreglo: Vercel → proyecto `landing` → Settings → Domains → `www` → "Redirect to
  joinnorthstack.com" (308). **Pendiente, lo hace Alejandro.**
- El diagnóstico de fondo: el sitio tiene solo 2 páginas que pueden posicionar (portada EN/ES), un
  dominio nuevo sin enlaces entrantes y H1 sin palabras clave. La parte técnica no es el cuello de botella.

## Plan

1. **Search Console** — ✅ hecho. Revisar sitemap y "Páginas" cada semana.
2. **Directorios / backlinks** (Alejandro): Capterra/GetApp/Software Advice, G2, SaaSworthy,
   Product Hunt, AlternativeTo, Google Business Profile, LinkedIn de empresa con link al sitio.
3. **Páginas por módulo** (EN + ES, mismo diseño que el landing):

   | Módulo | ES | EN | Búsquedas objetivo | Estado |
   |---|---|---|---|---|
   | Ausencias | `/es/software-vacaciones` | `/time-off-software` | software de vacaciones para empleados, control de vacaciones y licencias, calendario de feriados / PTO tracker, leave management | 🟡 Armada, sin publicar |
   | CRM | `/es/crm-para-pymes` | `/crm-for-small-business` | CRM para pymes, CRM simple, pipeline de ventas / simple CRM, sales pipeline software | ⬜ |
   | RR.HH. | `/es/legajo-digital` | `/hr-software` | legajo digital de empleados, software de RR.HH. para pymes / HR software for small business | ⬜ |
   | Nómina | `/es/recibos-de-sueldo` | `/payroll-tracking` | recibos de sueldo digitales, historial de liquidaciones / payroll records, payslip software | ⬜ |

   Regla: **nunca** apuntar a "software de liquidación de sueldos" — Northstack solo registra, no
   calcula ni paga (trae tráfico equivocado).
4. **Retoques en la portada** — 🟡 armados junto con el pase 1 (ver abajo).
5. **Después**: páginas de comparación ("Alternativa a Factorial / BambooHR / Humand") y guías/blog
   (ej. "Cómo calcular días de vacaciones según la LCT"), 1–2 por mes.
6. **Medición**: sumar analítica liviana y, a las 4–6 semanas de publicar, usar "Consultas" de Search
   Console para ajustar palabras clave reales. Expectativa: 3–6 meses para ver resultados.

## Pase 1 — Vacaciones + retoques de portada (2026-10-03)

**Estado:** commit local `ca1f1ef` en la rama `seo-pass` (worktree `C:/tmp/ns-landing-seo`), basado en
`origin/landing` 5345e1a. **No pusheado**: el cupo de deploys de Vercel estaba agotado.
Vista previa aprobable: https://claude.ai/artifact/GjPUvw5mBbLHNGtSYfQfPL

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

**Para publicar (cuando haya cupo en Vercel):**
1. `git fetch` y verificar que `origin/landing` no avanzó; si avanzó, `git rebase origin/landing`
   en `seo-pass` (otra sesión suele tocar páginas legales y `pricing.js`).
2. Ojo: en `main` 5c8d86e cambió el modelo de precios (por usuario). Si el landing se actualiza
   por eso, revisar que no choque con la portada.
3. `git push origin seo-pass:landing` → verificar en vivo `/time-off-software`, `/es/software-vacaciones`,
   el sitemap y la portada.
4. Search Console → Inspección de URLs → "Solicitar indexación" de las 2 páginas nuevas.
5. Actualizar este archivo y `handoff.md`.

## Herramientas

`tools/seo/` — `build-seo.cjs` + plantillas `vacaciones.es.html` / `vacaciones.en.html`. El script
copia el CSS compartido de `landing/es/index.html`, arma las páginas de módulo (FAQ en HTML + JSON-LD,
pie), aplica los retoques de portada, sitemap y `vercel.json`, y genera la vista previa para el
Artifact. Fue escrito para el pase 1 (los retoques de portada fallan a propósito si ya están
aplicados); para los próximos módulos, copiar una plantilla y reutilizar `buildModule()`.

## Changelog SEO (más nuevo arriba)
- **2026-10-03** — Search Console ya reconoce el sitemap (antes mostraba "No se ha podido leer").
- **2026-10-03** — Pase 1 armado (Vacaciones ES/EN + retoques de portada), commit local `ca1f1ef`,
  vista previa publicada. Pendiente de push por límite de Vercel.
- **2026-10-02** — Search Console: propiedad de Dominio verificada, sitemap enviado, indexación pedida
  para `/` y `/es/`. Diagnóstico: 9 impresiones / 0 clics / posición 17,9; 1 página indexada.
  Detectado `www` sin redirección.
- **2026-10-02** — Pase técnico con el landing v2 (títulos ≤60, descripciones ≤145, OG por idioma,
  JSON-LD WebSite/Organization/SoftwareApplication/FAQPage, robots `max-image-preview`, sitemap con lastmod).
