# Handoff de Northstack — 2026-07-24

Documento de traspaso completo del proyecto, basado en inspección real del repositorio (código, `docs/`, `git log`, `prisma/schema.prisma`, `package.json`, workflows de CI) al 2026-07-24. Donde el código y la documentación existente no coincidían, se señaló la inconsistencia explícitamente en vez de ignorarla — ver especialmente [`04-analisis-estado-y-avances.md`](04-analisis-estado-y-avances.md).

## Índice

| Archivo | Contenido |
|---|---|
| [`01-objetivo.md`](01-objetivo.md) | Qué problema resuelve Northstack, para quién, las fases del roadmap (HR → Clientes → Pagos), y el diferenciador de producto (medir churn/salud de cliente) — **todavía no implementado**, solo especificado. |
| [`02-features-implementadas.md`](02-features-implementadas.md) | Módulos y features completos por área, con dónde vive cada uno en el código y su deuda conocida. |
| [`03-resumen-de-avances.md`](03-resumen-de-avances.md) | Cronología de las decisiones de diseño más relevantes (no un changelog commit-por-commit) — qué se decidió y por qué, semana a semana. |
| [`04-analisis-estado-y-avances.md`](04-analisis-estado-y-avances.md) | Qué tan production-ready está cada módulo, deuda técnica real, cobertura de tests real, y las inconsistencias entre documentación y código encontradas al armar este handoff. |
| [`05-tareas-pendientes.md`](05-tareas-pendientes.md) | Backlog explícito separado en bugs conocidos / deuda técnica / features sin terminar / decisiones de negocio sin cerrar, con prioridad y motivo de cada ítem. |
| [`06-infraestructura-y-estructura.md`](06-infraestructura-y-estructura.md) | Estructura de carpetas explicada, infraestructura real (hosting/DB/dominio/email/CI-CD) con archivos y comandos exactos, y cómo correr el proyecto en local paso a paso. |
| [`07-stack-tecnologico.md`](07-stack-tecnologico.md) | Lista completa de tecnologías y versiones exactas (de los `package.json` reales), y por qué se eligió cada pieza clave donde está documentado. |
| [`08-directivas-agente-ia.md`](08-directivas-agente-ia.md) | **El más importante para trabajar en este repo.** Reglas de multi-tenancy no negociables, componentes reutilizables, protocolo de migraciones seguras, checklist antes de terminar una tarea, y antipatrones ya corregidos que no hay que reintroducir. |

## Cómo usar este handoff

Si estás retomando el proyecto sin contexto previo: leé `01` → `02` → `04` en ese orden para entender qué es el producto, qué existe, y qué tan sólido es. Antes de escribir código, leé `08` completo. `05` es tu punto de partida para elegir qué atacar.

## Marcas usadas

`[PENDIENTE DE CONFIRMAR: ...]` señala información que el repo no permitió confirmar con certeza — no se inventó el dato, se dejó marcado para que alguien con más contexto lo cierre.
