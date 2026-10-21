# Spec: Horas extra y recargos configurables por empresa

**Estado:** aprobada por Alejandro el 2026-10-21 (§0.1). **Construida en `staging`** el 2026-10-21 (QA-123). Pendiente en Reportes: horas extra y su costo (métricas de `tenant-metrics-spec.md` §2.9). Pedido de Alejandro: "que lo decida la empresa, porque cada
país tiene su política de pago y cada empresa también".

## 0. Idea

Cada empresa define **sus reglas** de horas extra y recargos, y Northstack las aplica a las horas que ya
registra (timesheet aprobado, fichajes, turnos). El resultado aparece en tres lugares:

- **Nómina:** al **traer horas aprobadas**, además de las horas normales se agregan líneas separadas
  ("Horas extra 50 %: 6 h", "Horas nocturnas: 4 h"…) con su monto, que se ven en el recibo.
- **Reportes:** horas extra y su costo por persona / sede / mes (la métrica pendiente de
  `tenant-metrics-spec.md` §2.9).
- **Timesheet de cada persona:** cuántas de sus horas fueron extra (transparencia, igual que las horas
  enviadas a nómina; solo horas).

Apagado por defecto. Una empresa sin reglas sigue como hoy.

## 0.1 Decisiones de Alejandro (2026-10-21)

1. La configuración va en **Nómina**, como parte de la configuración de nómina (no en Turnos).
4. **Solo Growth.**
5. **Sin aprobación aparte:** alcanza con que la semana del timesheet esté aprobada.
2. El horario no lo define Northstack: las franjas (nocturnas, sábado desde X hora) las configura cada
   empresa en sus reglas, y la hora de cada hora trabajada sale de lo que ya está configurado (fichaje →
   turno de la locación, en la zona horaria de esa locación → si no hay ninguno, solo umbrales).
3. Plantillas: **"Empezar en base a: Argentina / EE. UU. / Personalizada"**.

## 1. Qué se configura (Nómina → Configuración → Horas extra)

1. **Cuándo una hora es extra** (uno o los dos):
   - más de **N horas por día** (ej. 8);
   - más de **N horas por semana** (ej. 48).
2. **Recargos** (cada uno: nombre + % sobre la tarifa por hora):
   - **Extra en día hábil** (ej. 50 %);
   - **Extra en descanso / feriado** (ej. 100 %): domingos, feriados de la empresa y, opcional, sábados
     desde una hora (ej. 13:00);
   - **Nocturnas** (ej. franja 21:00–06:00, recargo X %), opcional.
3. **Quién no cobra horas extra:** una marca por persona (ej. personal jerárquico / fuera de convenio).
4. **Empezar en base a** (después se edita todo):
   - **Argentina (LCT):** más de 8 h/día o 48 h/semana; 50 % en día hábil; 100 % sábados desde las 13:00,
     domingos y feriados; nocturnas 21:00–06:00 (recargo a definir por la empresa, viene en 0 %).
   - **EE. UU. (FLSA federal):** más de 40 h/semana al 50 % (tiempo y medio); sin umbral diario, sin
     recargo por descanso ni nocturno (algunos estados, como California, tienen reglas diarias: se cargan
     a mano).
   - **Personalizada:** vacía.

## 2. De dónde sale el horario

Los umbrales por día y por semana funcionan con cualquier hora registrada. Para las reglas que dependen
**de la hora del día** (nocturnas, sábado desde las 13 h) hace falta saber cuándo se trabajó:

1. el **fichaje** (entrada y salida reales), si la empresa ficha;
2. si no, el **horario del turno** aceptado;
3. si no hay ninguno de los dos (horas cargadas a mano sin turno), solo se aplican los umbrales.

## 3. Cálculo

Por persona y período: se ordenan las horas por día; lo que pasa del umbral diario es extra; después, lo
que pasa del semanal (sin contarlo dos veces). Cada hora extra toma el recargo de su día (hábil o
descanso/feriado). Las nocturnas suman su recargo aparte. Puro y testeado, con ejemplos de la plantilla
argentina.

## 4. Preguntas

Respondidas el 2026-10-21 (§0.1).

## 5. Cómo se paga

La línea **Base** queda con las horas normales a la tarifa por hora. Se agregan líneas aparte, generadas al
traer horas (se regeneran cada vez): **Horas extra (hábil)** = horas × tarifa × (1 + %), **Horas extra
(descanso/feriado)** = horas × tarifa × (1 + %), **Recargo nocturno** = horas nocturnas × tarifa × %. Una
persona marcada "no cobra horas extra" cobra todas sus horas en la Base.
