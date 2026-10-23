# Spec: Nómina v2 (rediseño)

**Estado:** aprobada por Alejandro el 2026-10-23 sobre la propuesta
(artifact "Rediseño de Nómina", https://claude.ai/artifact/6xsUcHsZXwUjqHF84szouL). Unidades 1–7
**construidas y probadas en `staging`** el 2026-10-23 (rama `feat/payroll-v2`, encima de "Traer horas
aprobadas" y "Horas extra", también en staging) — QA-124 en `Tareas-QA.md`. Falta la revisión de
Alejandro antes de producción; el anuncio se redacta al promover.

Nómina sigue siendo **de seguimiento**: no mueve dinero ni reemplaza al recibo de sueldo legal.

## 0. Decisiones de Alejandro (2026-10-23)

1. **Permisos.** Quien no tiene `manage_payroll` (sea cual sea su rol) ve **solo lo propio**. Solo el
   dueño y quien tiene `manage_payroll` ven todo. Se usa **"Liquidación"** (no "corrida"); en inglés,
   "Pay run".
2. **Cada persona ve sus propios recibos, con montos.** Nunca los de otros, salvo `manage_payroll`.
3. **Recibo:** primero el **modelo básico de Argentina**, después el de **EE. UU.**, y ningún otro.
   **Sin acumulado del año.** (Sin CUIT/CUIL: la política de privacidad no permite guardar datos
   fiscales.)
4. **Métodos de pago activados por defecto según el país de la empresa:** Argentina → transferencia
   (CBU/CVU) y Mercado Pago; el resto → transferencia internacional, Wise y Payoneer.
5. **Orden:** primero el rediseño completo; después lo que hoy no existe (exportar para pagar,
   conceptos recurrentes, fechas de pago reales, anular, costos, doble aprobación).
6. **Configuración en Settings** (decisión de Claude, delegada): **Configuración → Nómina**
   (`/settings/payroll`), igual que Turnos y Ausencias; la barra lateral de Nómina tiene la entrada
   "Configuración" que lleva ahí.

## 1. Navegación (`/payroll/*`, barra lateral propia)

| Entrada | Quién | Qué |
|---|---|---|
| Resumen | `manage_payroll` | Próximo pago, último período por moneda, horas pagadas, pendientes para cerrar |
| Liquidaciones | `manage_payroll` | Lista con filtros (estado, frecuencia, año); detalle paso a paso |
| Pagos únicos | `manage_payroll` | Bonos, reintegros, adelantos fuera de una liquidación |
| Personas | `manage_payroll` | Quién cobra qué: tarifa, frecuencia, método, estado del contrato (hoy "Asignaciones") |
| Recibos | `manage_payroll` | Todos los emitidos: buscar, descargar, reenviar |
| Mis recibos | todos | Los propios (con montos) e historial |
| Configuración | `manage_payroll` | Lleva a Configuración → Nómina |

En el menú principal, **Nómina** aparece para todos en empresas con Nómina (Growth). Quien no tiene
`manage_payroll` entra directo a **Mis recibos**. `/hr/payroll*` redirige a `/payroll*`.

**Configuración → Nómina:** Frecuencias de pago · Métodos de pago · Horas extra y recargos · Recibo de
pago (firma, numeración).

## 2. Unidades

1. **Navegación y permisos.** `PayrollSidebar`, rutas `/payroll/*`, redirecciones, entrada del menú
   para todos, página Configuración → Nómina con lo que hoy está en "Políticas de pago". Liquidaciones,
   Pagos únicos y Personas como páginas propias (hoy pestañas). "Liquidación" en todos los textos.
2. **Resumen.** Endpoint de resumen (próximo pago, último período por moneda, horas, variación) y
   pendientes (semanas sin aprobar de personas por hora, contratos sin confirmar, borradores viejos).
3. **Liquidación paso a paso.** Pasos (Personas → Horas → Ajustes → Confirmar y emitir recibos),
   totales por moneda, horas, ajustes, avisos, detalle por persona (haberes, horas extra, deducciones).
4. **Métodos de pago.** Catálogo con tipo y dato que se pide (CBU/CVU y alias, IBAN/ACH, email,
   nada), logo, interruptor, cuántas personas lo usan, "+ Otro método"; activos por defecto según país.
5. **Recibo v2.** Numeración por empresa (`0001-000001`) asignada al confirmar; código de
   verificación; legajo (campo nuevo `Employee.fileNumber`), puesto, sede/área, fecha de ingreso,
   período, fecha de pago, modalidad, método de cobro (enmascarado); haberes (cantidad × tarifa) y
   deducciones separados; neto destacado y en letras; firma de la empresa (imagen) y "Recibí
   conforme"; en el idioma de la persona. Modelo **Argentina** primero y **EE. UU.** ("Pay stub":
   earnings / deductions / net pay) después, según el país de la empresa. Página pública de
   verificación por código (solo dice si el recibo existe y es válido, sin montos).
6. **Mis recibos y Recibos.** La persona ve y descarga los suyos; recibe el recibo por email al
   confirmar (preferencia de email nueva "Recibos de pago"). Página Recibos para `manage_payroll`.
7. **Centro de ayuda y anuncio.**

## 3. Después (no en esta etapa)

Exportar para pagar (archivo por método), conceptos recurrentes por persona, fechas de pago reales
según la frecuencia, anular o corregir una liquidación confirmada, costo por mes/área/sede en el
Resumen, segunda aprobación opcional antes de confirmar.
