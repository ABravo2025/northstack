# Octubre 2026 · Semana 01 (28 sep – 4 oct)

Lanzamiento del nuevo diseño (violeta "Eléctrico" + Instrument Sans) y de la landing v2.

| Pieza | Archivo | Estado |
|---|---|---|
| Post LinkedIn (página de empresa) ES | `linkedin/post-es.md` | Listo, sin publicar |
| Post LinkedIn EN | `linkedin/post-en.md` | Listo, sin publicar |
| Video demo 1:1 (LinkedIn) ES / EN | `video/northstack-demo-es-1x1.mp4`, `video/northstack-demo-en-1x1.mp4` | Listo, 45 s |
| Video demo 16:9 (YouTube, no listado) ES / EN | `video/northstack-demo-es-16x9.mp4`, `video/northstack-demo-en-16x9.mp4` | Listo, 45 s |
| Música de fondo (generada, sin derechos) | `video/musica-fondo-uplifting.mp3` | Usada en los 4 videos |
| Imágenes para compartir (OG) ES / EN | `imagenes/og-image-es.jpg`, `imagenes/og-image-en.jpg` | Publicadas en joinnorthstack.com |

## Cómo publicar el post
- Subir el **video 1:1 nativo** a LinkedIn (no el link de YouTube): más alcance.
- Publicar el **primer comentario** (está al final de cada post) apenas sale.
- Responder/reaccionar en los primeros 30 minutos.
- Página de empresa: configurar "Especialidades" (lista en `post-es.md`).

## Cómo se hicieron los videos
`tools/video/` — grabación real de la app (staging, empresa demo "Acme Latam", admin ficticia
"Laura Méndez"), captura por CDP a 1080×1080 / 1920×1080, fundidos entre escenas, música generada
con `music2.py`. Pasos: `prep.mjs` (resetea la demo) → `video-record2.mjs record <es|en> <square|wide>`
→ `assemble2.mjs <es|en> <square|wide>`.
