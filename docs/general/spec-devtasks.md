# Spec — Northstack Dev Tasks Dashboard

Herramienta interna, solo para vos. **No es parte del monorepo/multi-tenant de Northstack** — proyecto aparte, deploy aparte, auth aparte. Objetivo: visualizar el estado real de las tareas de desarrollo leyendo directamente tus `.md` (fuente de verdad = el repo, no una DB paralela que se desincroniza).

Mockup aprobado como referencia visual: `devtasks-mockup.html` (sistema ClickUp-style ya confirmado — fondo negro puro, chips por módulo, tipografía compacta, sin SlideOver).

---

## 0. Decisiones de arquitectura (lockeadas)

| Decisión | Elección | Por qué |
|---|---|---|
| Fuente de datos | Leer los `.md` directo del repo de Northstack vía GitHub API, no una copia/DB propia | Evita desincronización — el dashboard siempre refleja el `main`/`staging` real |
| Persistencia | Ninguna. Todo se parsea al vuelo en cada request | Los archivos son chicos (unos pocos MB total), no justifica cache/DB para v1 |
| Auth | Usuario/contraseña únicos (vos), en variables de entorno, sesión por cookie firmada | No hay multi-usuario ni roles — sería sobre-ingeniería para una herramienta de un solo usuario |
| Stack | Vite + React (frontend) + Vercel Serverless Functions (backend) | Mismo stack que ya conocés de Northstack, deploy en Vercel como proyecto separado |
| Repo/proyecto | Nuevo repo (`northstack-devtasks` o similar), nuevo proyecto en Vercel, subdominio propio | Aislado del multi-tenant real — un bug acá no puede tocar producción de Northstack |

**Flag explícito**: en el mockup mostré 3 estados (En curso / Completadas / Backlog). Tus `.md` **no tienen un estado "en curso" explícito**, solo `[x]`/`[ ]`. La regla de abajo (sección 2) es una simplificación deliberada para evitar heurísticas frágiles — la marco como decisión a validar antes de codear, no como un hecho de tus archivos.

---

## 1. Fuente de datos

Archivos a leer (vía GitHub API, `GET /repos/{owner}/{repo}/contents/{path}`, o `raw.githubusercontent.com` con token si el repo es privado):

- `docs/tareas-desarrollo.md`
- `docs/Task-UxUI.md`
- `docs/tareas/semana-*.md` (listar contenido de `docs/tareas/` vía API y filtrar por patrón de nombre)
- `docs/tareas/handoff-*/*.md` (opcional para v1 — marcar como backlog si complica el parser inicial)

Config necesaria: `GITHUB_TOKEN` (PAT con `repo` scope si el repo es privado), `GITHUB_OWNER`, `GITHUB_REPO`.

Sin cache en v1: cada carga de la página dispara el fetch + parseo fresco. Si en la práctica se siente lento, la siguiente iteración sería cache de 60s en memoria (no antes).

---

## 2. Reglas de parseo

### 2.1 Tareas (checkboxes)

Regex base por línea: `^(\s*)-\s\[([ x])\]\s(.+)$`

- Indentación (`\s*`) determina anidamiento → subtareas.
- `[x]` = **Completada**. `[ ]` = pendiente.

**Título vs. nota**: el patrón real en tus archivos es `- [x] **Título en negrita**: descripción larga...`
- Si la línea tiene `**...**:` → el texto en negrita es el `title`, todo lo que sigue después de los dos puntos es el `note`.
- Si no hay negrita → toda la línea es el `title`, `note = null`.
- Si el ítem tiene texto en líneas siguientes sin nuevo `- [ ]` (continuación indentada, párrafo suelto) → se concatena al `note`.

**Estado (simplificado, ver flag de la sección 0)**:
- `[x]` → `done`
- `[ ]` dentro de una sección cuyo heading (el `##`/`###` más cercano hacia arriba) matchea `/backlog/i` → `backlog`
- `[ ]` en cualquier otro caso → `in_progress` (bucket único, sin intentar distinguir "empezado" de "no empezado")

Esto es a propósito simple: no hay heurística de "hijos marcados = en progreso". Si en el uso real este bucket único resulta poco útil, la mejora sería agregar un tag manual tipo `<!-- status: in-progress -->` en el `.md` — no vale la pena adivinar en v1.

### 2.2 Módulo (chip de color)

Se deriva del heading `##`/`###` más cercano hacia arriba del ítem, contra esta tabla (extensible):

| Match en el heading (case-insensitive) | Módulo/chip |
|---|---|
| `HR`, `Employee`, `Payroll`, `Time Off`, `People` | HR / Payroll |
| `CRM`, `Client`, `Company`, `Contact`, `Opportunity`, `Pipeline` | CRM |
| `UX`, `UI`, `Interfaz`, `Visual` | UX/UI |
| `Notes`, `Tasks`, `Activity` | Notes/Tasks |
| (default, sin match) | Infra/Otros |

### 2.3 Notas sueltas (`semana-*.md`)

Estos archivos son log narrativo por fecha, no checkboxes. Regla: cada entrada empieza con una línea `- YYYY-MM-DD (...)` o un heading de fecha — capturar como `DailyNote { date, file, content }`, mostrada en una vista/tab separada ("Notas sueltas"), no mezclada con la lista de tareas. Buscable junto con el resto vía el search box.

### 2.4 Fecha de la tarea

Buscar patrón `YYYY-MM-DD` en el `note` o en las 2 líneas previas al ítem. Si no aparece, `date = null` y se muestra `—` en la UI (como ya está en el mockup).

---

## 3. Modelo de datos (en memoria, no persistido)

```ts
type TaskStatus = 'done' | 'in_progress' | 'backlog';

interface Task {
  id: string;            // hash(file + lineNumber + title)
  title: string;
  note: string | null;
  status: TaskStatus;
  module: string;
  date: string | null;
  sourceFile: string;
  sourceSection: string; // heading bajo el que vive
  subtasks: Task[];
}

interface DailyNote {
  date: string;
  file: string;
  content: string;
}

interface DevTasksResponse {
  tasks: Task[];
  dailyNotes: DailyNote[];
  fetchedAt: string;     // para mostrar "última actualización" en la UI
}
```

---

## 4. Backend (Vercel Serverless Functions)

- `GET /api/auth/login` — recibe `{ user, password }`, valida contra `DEVTASKS_USER`/`DEVTASKS_PASS_HASH` (env vars, password hasheado con bcrypt), setea cookie de sesión firmada (`SESSION_SECRET`, HttpOnly, Secure, SameSite=Strict).
- `GET /api/auth/logout` — borra la cookie.
- Middleware — todas las rutas bajo `/api/tasks*` y las páginas del frontend (excepto `/login`) requieren cookie válida.
- `GET /api/tasks` — dispara el fetch a GitHub, corre el parser, devuelve `DevTasksResponse`. Si falla el fetch a GitHub (token vencido, rate limit, etc.) → **error explícito en el body**, no un array vacío silencioso.

---

## 5. Frontend

Reusar la estructura del mockup tal cual:

- **Login** (`/login`): form usuario/contraseña, redirect a `/` si OK.
- **Shell** (`/`): sidebar (filtros de estado + módulo) + topbar (search, "última actualización: hace X min", botón refrescar manual) + lista de tareas.
- **Task row**: expandible, muestra `note`, `subtasks`, `sourceFile · sourceSection`.
- **Tab "Notas sueltas"**: lista cronológica de `DailyNote`, filtrable por fecha.
- **Search**: client-side, sobre `title + note` de tareas y `content` de notas sueltas ya cargados (no re-fetch por cada tecla).
- **Estado de error**: si `/api/tasks` falla, banner claro ("No se pudo leer el repo — token vencido o rate limit de GitHub") en vez de pantalla vacía.

---

## 6. Deploy

1. Nuevo proyecto en Vercel, apuntando al nuevo repo.
2. Variables de entorno en Vercel: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `DEVTASKS_USER`, `DEVTASKS_PASS_HASH`, `SESSION_SECRET`.
3. Subdominio: agregar dominio (ej. `tasks.tu-dominio.com`) en Vercel → Settings → Domains, y crear el CNAME correspondiente en tu proveedor de DNS.

---

## 7. Unidades de build (orden sugerido)

1. Scaffold del proyecto (Vite + React + Vercel functions), sin lógica todavía.
2. Auth: login page + cookie de sesión + middleware de protección.
3. Cliente GitHub API: función que trae el contenido raw de una lista de paths.
4. Parser de checkboxes (título/nota/estado/módulo/subtareas) sobre un único archivo, testeado contra `docs/tareas-desarrollo.md` real.
5. Extender el parser a múltiples archivos + listado dinámico de `semana-*.md` vía la API de contents.
6. Parser de `semana-*.md` → `DailyNote[]`.
7. Endpoint `GET /api/tasks` uniendo todo, con manejo de error explícito.
8. Frontend: shell + sidebar + task list, consumiendo el endpoint real (reemplazar los datos mock del `devtasks-mockup.html`).
9. Search client-side + tab de Notas sueltas.
10. Deploy a Vercel + configuración de subdominio + variables de entorno.

## 8. Backlog explícito (fuera de v1)

- Cache de resultados (solo si el fetch en vivo resulta lento en el uso real).
- Incluir `docs/tareas/handoff-*/*.md`.
- Marcar tareas como completadas desde la UI escribiendo de vuelta al repo (v1 es solo lectura).
- Multi-usuario / roles.
- Notificaciones o digest.
