# LinkedIn — Estrategia

Plan vivo para LinkedIn. Los posts de cada semana van en `YYYY-MM/semana-NN/linkedin/`; este archivo
define el enfoque y el calendario. Actualizarlo cuando cambie algo (pilares, frecuencia, resultados).

_Creado: 2026-10-13_

## Objetivo
1. **Dar a conocer la marca** entre fundadores, socios y responsables de operaciones/RR.HH. de
   **startups y pymes de 5 a 50 personas**.
2. Convertir en una de dos acciones:
   - **Registrarse** → prueba gratis de 15 días, sin tarjeta: `joinnorthstack.com`
   - **Contactarnos directamente** → mensaje privado a Alejandro en LinkedIn o `info@joinnorthstack.com`
     (demo de 20 minutos).

## Frecuencia y canales
- **2 a 3 posts por semana**, martes a jueves (los días de más alcance en LinkedIn), entre 8 y 10 h
  (hora de Argentina).
- **Cada post existe en español y en inglés.** Se publican como dos posts separados (no uno bilingüe:
  el texto mezclado rinde peor y se corta en el "ver más").
- **Dónde:** el perfil personal de Alejandro llega mucho más lejos que la página de empresa (unas 8
  veces más interacción). Regla: casi todo sale del perfil de Alejandro y la página lo comparte; la
  página publica en primera persona solo algunos posts de producto. Cada post indica dónde va.
- Research completo (algoritmo, formatos, hashtags por industria, cómo llegar a la gente):
  `research-2026-10.md`.

## Pilares de contenido (rotar)
| Pilar | Para qué | Peso |
|---|---|---|
| **Dolor del día a día** (planillas, WhatsApp, mails perdidos) | Que el lector se reconozca | 30 % |
| **Producto en acción** (Turnos, Proyectos, Vacaciones, CRM) | Mostrar que existe una solución concreta | 30 % |
| **Consejos útiles** (checklists, señales, cómo armar una política) | Alcance y guardados; posiciona a la marca como experta | 25 % |
| **Detrás de escena / fundador** (qué construimos y por qué, pedidos de clientes) | Confianza; la gente le compra a personas | 15 % |

## Llamados a la acción (alternar)
- **Registro:** "El link para probarlo gratis 15 días está en el primer comentario." El texto del
  post **no lleva link** (los links reducen el alcance); va en el primer comentario.
- **Contacto:** "Comenta TURNOS y te escribo por privado" (palabra clave según el post) o "escríbeme
  a info@joinnorthstack.com y te lo muestro en 20 minutos". Responder cada comentario en menos de 2 h.
- **Conversación:** cerrar con una pregunta concreta para generar comentarios (el algoritmo premia
  los comentarios en la primera hora).

## Reglas de escritura
- Primera línea = gancho de menos de ~140 caracteres (es lo único que se ve antes del "ver más").
- Párrafos de 1 a 3 líneas, **3 hashtags** al final (1 amplio + 1 de público + 1 de nicho; tabla por
  industria en `research-2026-10.md`), emojis solo como viñetas.
- **Español neutro (tú)**, no rioplatense: el público es toda LATAM y España. Inglés neutro.
- Respetar las reglas de contenido de `README.md`: nómina = solo seguimiento · no promocionar Payments
  ni el programa de referidos · no decir "disponible en inglés y español" · no mencionar la app de
  Android · **no poner precios en los posts**.
- Siempre con algo visual: carrusel PDF (el formato con más interacción), GIF del producto o foto de
  Alejandro. Capturas y GIFs solo de la empresa demo "Acme Latam" (staging), nunca datos reales.
- **GIFs de producto** (ES/EN, < 5 MB): `2026-10/semana-03/gif/`. Subirlos con el botón de **foto**,
  no el de video, para que se animen. Se regeneran con `tools/gif/`.

## Rutina al publicar
1. Publicar en el horario, dejar el primer comentario con el link y responder todos los comentarios
   en los primeros 30–60 minutos.
2. Todos los días: 15 minutos comentando posts de nuestro público (fundadores, RR.HH., contadores,
   dueños de pymes) y de 20 a 30 invitaciones por semana a esas personas.
3. Alejandro comparte/comenta el post de la página desde su perfil.
4. Marcar el post como publicado en el `README.md` de la semana (fecha + link).

## Medición
- Semanal: impresiones, reacciones, comentarios, mensajes privados recibidos y registros nuevos (los
  avisos de alta por email ya llegan al staff).
- **Pendiente:** el sitio no tiene analytics todavía. Vercel Web Analytics es pago; las opciones
  gratuitas (LinkedIn Insight Tag, Cloudflare Web Analytics, GA4) están en `research-2026-10.md`,
  punto 5. Requieren aprobación de Alejandro y actualizar la Política de privacidad.

## Calendario
Página para ver y copiar todos los posts (ES/EN, con imagen y primer comentario):
https://claude.ai/artifact/VBRYwMv89TezGmnZqHkzGH (se regenera con `tools/linkedin-page/build.mjs`).

| Semana | Fecha | Pilar | Tema | Visual |
|---|---|---|---|---|
| 2026-10 s03 | mié 14/10 | Dolor + producto | Turnos: dejar de confirmar por WhatsApp | GIF Turnos |
| 2026-10 s03 | vie 16/10 | Fundador | Un laboratorio consultó por turnos y lo construimos | Foto de Alejandro o GIF Turnos |
| 2026-10 s04 | mar 20/10 | Consejos | 5 señales de que tu equipo superó las planillas | Carrusel PDF |
| 2026-10 s04 | mié 21/10 | Producto | Proyectos: el cierre de mes de un estudio contable | GIF Proyectos |
| 2026-10 s04 | jue 22/10 | Dolor + producto | Vacaciones: "¿cuántos días le quedan?" | GIF Vacaciones |
| 2026-10 s05 | mar 27/10 | Dolor + producto | CRM: las ventas que se pierden en el correo | Imagen |
| 2026-10 s05 | mié 28/10 | Consejos | Checklist de onboarding en 4 etapas | Imagen |
| 2026-10 s05 | jue 29/10 | Producto | Roles y permisos: no todos ven los sueldos | Imagen |
| 2026-11 s01 | mar 3/11 | Dolor + producto | Calendario del equipo: ¿quién está esta semana? | Imagen |
| 2026-11 s01 | mié 4/11 | Producto | Lo que reemplaza Northstack (6 → 1) | Imagen |

Ideas para las próximas semanas: casos de clientes cuando haya permiso para nombrarlos, Turnos para
salud y comercio (mismo producto, otro gancho), errores comunes al armar una política de vacaciones. **Historia del fundador:** Alejandro va a pasar un archivo con su historia;
con eso se arma una serie de 2–3 posts para su perfil.
