# Octubre 2026 · Semana 05 (26 oct – 1 nov)

LinkedIn, 4 posts (ver `../../linkedin/README.md`). Página para copiar y pegar todos los posts:
https://claude.ai/artifact/VBRYwMv89TezGmnZqHkzGH

| Pieza | Archivo | Fecha | Dónde | Estado |
|---|---|---|---|---|
| CRM: las ventas que se pierden en el correo ES / EN | `linkedin/01-crm-es.md`, `-en.md` · `imagenes/crm-*.png` | mar 27/10 | Perfil de Alejandro | Borrador, para revisar |
| Consejos: checklist de onboarding en 4 etapas ES / EN | `linkedin/02-onboarding-es.md`, `-en.md` · `imagenes/onboarding-*.png` | mié 28/10 | Perfil de Alejandro | Borrador, para revisar |
| Roles y permisos: no todos tienen que ver los sueldos ES / EN | `linkedin/03-roles-es.md`, `-en.md` · `imagenes/roles-*.png` | jue 29/10 | Página Northstack | Borrador, para revisar |
| Video RR.HH. (37 s): legajo, onboarding, vacaciones, quién falta, turnos + QR, horas ES / EN | `linkedin/04-video-rrhh-es.md`, `-en.md` · `video/northstack-rrhh-*.mp4` | vie 30/10 | ES perfil de Alejandro · EN página Northstack | Video listo, para revisar |

Imágenes 1080×1350 generadas con `tools/cards/cards.mjs`.

## Video RR.HH.

`video/northstack-rrhh-{es,en}-{1x1,16x9}.mp4`: 37 s, sin voz, textos en pantalla. Música propia, generada
con `tools/video/music4.py` (funk-pop a 132 BPM, sin licencias). Para LinkedIn usar el 1:1; el 16:9 sirve
para la web, YouTube o presentaciones. Se grabó la app real (versión de producción) contra staging, con la
empresa de demostración "Acme Latam".

Para regrabar: levantar el backend del worktree de producción contra staging y el frontend con
`VITE_API_BASE_URL`, y después `tools/video/run-hr-takes.sh es-wide es-square en-wide en-square`
(con `PW_DIR`, `CHROME`, `API` y `TODAY`). El script `seed-hr.mjs` deja los datos listos antes de cada toma.
La escena "Hoy" depende del día: hay que cargar y grabar el mismo día, antes de la medianoche.

## Google Ads

| Pieza | Archivo | Estado |
|---|---|---|
| Plan Google Ads "Vacaciones" Argentina (ARS 100.000/mes): análisis de búsquedas, palabras clave, negativas, anuncios, medición | `google-ads/plan-vacaciones-ar.md` | Listo; falta crear la cuenta de Google Ads |
| Datos crudos del autocompletado de Google (AR) | `google-ads/autocompletado-google-ar.txt` | Referencia |
