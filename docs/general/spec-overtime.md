# Spec: Horas extra y recargos configurables por empresa

**Estado:** en definición (2026-10-21). Decisiones de Alejandro en §0.1; faltan las preguntas 2 y 3 de §4. Pedido de Alejandro: "que lo decida la empresa, porque cada
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
4. **Plantillas para empezar** (se pueden editar): "Argentina (LCT)": 8 h/día, 48 h/semana, 50 % hábil,
   100 % sábados desde 13 h, domingos y feriados, nocturnas 21–06; y "Personalizada" vacía.

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

## 4. Preguntas para Alejandro

1. ¿La configuración va en **Configuración → Turnos → Horas extra** (o preferís en Nómina)?
2. ¿Está bien el orden fichaje → turno → solo umbrales para saber el horario?
3. ¿Incluimos plantillas de otros países además de Argentina (Uruguay, Chile, México, España)?
4. ¿Plan **Growth** (como Nómina y el costo del cronograma)?
5. ¿Las horas extra necesitan una aprobación aparte, o alcanza con que la semana del timesheet esté
   aprobada? (Recomiendo que alcance con la semana aprobada.)
