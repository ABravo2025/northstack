# Northstack — Sistema de Logo para Web

Paquete completo de assets derivados del logo original, listos para implementar en un sitio web (favicon, PWA, navbar, redes sociales, etc).

## 📁 Estructura

```
svg/         → Vectores maestros (editable, escala infinita, mejor calidad)
icon/        → Solo el ícono (fleur-de-lis), en color / blanco / navy, varios tamaños PNG
favicon/     → Paquete completo de favicon (.ico, PWA, Apple touch icon)
logo/        → Isologo completo (ícono + "NORTHSTACK"), vertical y horizontal
social/      → Imagen para compartir en redes (Open Graph / Twitter Card)
```

## 🎨 Colores de marca

| Nombre        | Hex       | Uso                          |
|---------------|-----------|-------------------------------|
| Navy (texto)  | `#0d2a48` | Wordmark, líneas, fondo dark |
| Azul medio    | `#3c6da1` | Ícono (tono medio)            |
| Azul claro    | `#8dbada` | Ícono (tono claro)            |
| Crema (fondo) | `#fdfcf8` | Fondo claro                   |

## 🧩 Qué archivo usar en cada caso

**Navbar / header del sitio**
→ `svg/logo-horizontal-light.svg` (fondo claro) o `svg/logo-horizontal-dark.svg` (fondo navy/oscuro)

**Footer sobre fondo oscuro**
→ `svg/logo-vertical-dark.svg` o `logo/logo-vertical-dark-transparent.png`

**Portada / landing / splash**
→ `svg/logo-vertical-light.svg`

**Favicon del navegador**
→ Los archivos dentro de `favicon/` (ver snippet HTML abajo)

**App icon (PWA / Android / iOS)**
→ `favicon/apple-touch-icon.png`, `favicon/android-chrome-192x192.png`, `favicon/android-chrome-512x512.png`, `favicon/maskable-icon-512x512.png`

**Compartir en redes sociales (Open Graph)**
→ `social/og-image-1200x630.jpg`

**Usos donde solo cabe el símbolo (avatar, app icon simple, marca de agua)**
→ `icon/icon-color-512.png` (o el tamaño que corresponda)

**Impresión a un color / fotocopia / grabado / fax**
→ `svg/logo-vertical-grayscale.svg` o `svg/logo-horizontal-grayscale.svg` (el ícono conserva sus 3 tonos convertidos a gris según luminancia; el texto "NORTHSTACK" va en negro 100% para máxima legibilidad) — o `svg/logo-*-black.svg` si necesitás absolutamente todo en un solo tono plano (100% negro, ícono incluido)

## 💻 Snippet HTML para el `<head>`

```html
<!-- Favicon estándar -->
<link rel="icon" type="image/x-icon" href="/favicon/favicon.ico">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">

<!-- Apple / iOS -->
<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">

<!-- Android / PWA (referenciar también en manifest.json) -->
<link rel="icon" type="image/png" sizes="192x192" href="/favicon/android-chrome-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon/android-chrome-512x512.png">

<!-- Color de tema del navegador -->
<meta name="theme-color" content="#0d2a48">

<!-- Open Graph / redes sociales -->
<meta property="og:image" content="https://TU-DOMINIO.com/social/og-image-1200x630.jpg">
<meta name="twitter:card" content="summary_large_image">
```

## 📱 manifest.json (PWA) — ejemplo mínimo

```json
{
  "name": "Northstack",
  "short_name": "Northstack",
  "icons": [
    { "src": "/favicon/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/favicon/maskable-icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "theme_color": "#0d2a48",
  "background_color": "#fdfcf8"
}
```

## 📝 Notas técnicas

- Los archivos `.svg` en la carpeta `svg/` son **vectores reales** (trazados desde el logo original), por lo que se pueden usar directamente en HTML/CSS y escalar a cualquier tamaño sin perder nitidez ni aumentar el peso del archivo.
- Los PNG tienen fondo transparente salvo que digan `-opaque`.
- Si en algún momento necesitás editar el trazo (grosor de líneas, ajustar el kerning del texto, etc.), lo mejor es abrir los `.svg` en Illustrator o Figma — ya son paths editables, no imágenes.
- Reservá un margen de espacio libre alrededor del logo equivalente aprox. al ancho de una "hoja" del ícono; evitá apretarlo contra bordes o otros elementos.
