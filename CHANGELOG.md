# @coongro/billing

## 0.3.0

### Minor Changes

- 1bf0fe9: feat(settings): configuración de cobros y caja (COONG-248)

  Nuevas settings de billing, editables desde `/dev/builder`:

  - **Medios de pago habilitados** (`billing.payments.transferencia/.debito/.credito`): cada clínica elige qué medios ofrece; el efectivo está siempre disponible. Reemplaza el set hardcodeado de `constants.ts` — los medios deshabilitados dejan de aparecer en el cobro y en la venta de mostrador.
  - **Recargo por pago con crédito** (`billing.payments.creditSurcharge`, %): al cobrar con crédito se agrega automáticamente una línea "Recargo por crédito (X%)" a la cuenta, para que quede trazable y la cuenta cierre balanceada.
  - **Permitir ventas a cuenta / fiado** (`billing.payments.onAccount`): con el fiado apagado, el cobro exige saldar el total (no se puede dejar saldo pendiente).
  - **Redondeo de efectivo** (`billing.cash.rounding`, off/50/100): redondea el total de la venta de mostrador pagada en efectivo, con una línea de ajuste "Redondeo de efectivo".
  - **Exigir arqueo diario** (`billing.cash.requireClose`): avisa en la Caja cuando quedó el día anterior sin cerrar.

- e6d0b8b: feat(caja): el cierre deja la caja lista para mañana (COONG-250)

  - **Ciclo del efectivo**: al cerrar se decide cuánto se retira y cuánto queda de fondo (campos complementarios). El retiro se registra automáticamente como Salida (cuenta payable "Retiro de caja" + pago efectivo, idempotente por día). El fondo que queda (`next_float`) pre-carga el fondo inicial del día siguiente; la setting `billing.cash.openingFloat` pasa a ser solo el default cuando no hay cierre previo.
  - **Historial de cierres**: tira de últimos 7 días en la Caja (exacta / faltó / sobró / sin cerrar), clickeable para navegar al día.
  - **Cierre sin efectivo**: un día sin movimientos de efectivo cierra de un click, sin conteo.
  - **Estado del día**: badge "Abierta / Cerrada · hh:mm" en el header de la vista.
  - Schema: columnas `withdrawn` y `next_float` en `module_billing_cash_closes` (migración 0005). Nuevas acciones `billing.cashCloses.getPrevious` y `listRecent`.
  - El aviso de drift post-cierre descuenta el retiro automático para no acusarse a sí mismo.

- 724b83b: Las cuentas pueden tener vencimiento y decir de dónde salieron

  Tres cosas que necesita cualquier kit que emita cargos por período, no solo el de alquileres:

  - **`due_date`**: cuándo vence lo que se cobra, para poder decir qué está vencido sin que cada kit lo calcule por su cuenta.
  - **`source_ref`** con índice único parcial: quién generó la cuenta. El que emite un mes busca por origen y referencia, y si ya existe no vuelve a emitirlo — así generar dos veces el mismo período no duplica nada.
  - **`direction`**: si la plata entra o sale. Convierte el ledger en un motor por cobrar / por pagar reutilizable, sin cambiar el comportamiento de lo que ya existía.

  Ninguna columna es específica de un kit: nada de `lease_id`.

### Patch Changes

- f73c68b: fix(caja): números coherentes y cierre de caja con autoridad (COONG-249)

  - El **Neto de caja** ahora resta TODOS los egresos del día (efectivo + digital), no solo los de efectivo — un retiro por transferencia ya no queda invisible. El tile de Egresos desglosa efectivo/digital y referencia "Salidas" (el nombre real del menú).
  - La tabla de cobros se ordena cronológicamente.
  - Un día **cerrado** muestra el snapshot guardado del cierre (fondo/esperado/contado/diferencia) en modo lectura, en vez de recalcular en vivo y contradecir el chip "Cerrada". Si hubo movimientos de efectivo posteriores al cierre, se avisa explícitamente con el esperado actual.
  - **Rehacer el cierre** pide confirmación (muestra qué snapshot se pisa) y `closed_at` se actualiza de verdad en el re-cierre (el ISO string se perdía en el `.set()` de drizzle; ahora va `sql\`now()\``).
  - `billing.lines.listInRange` acepta filtro `direction` y expone `account_direction`, para que los reportes de ingresos excluyan cuentas por pagar.

- f57db91: Saca `accountTotals` y `syncWithdraw` de la superficie RPC renombrándolos con
  prefijo `_`.

  El auto-wire del runtime registra como acción todo método del prototipo salvo el
  constructor y los prefijados con `_`; el `private` de TypeScript se borra al
  compilar y no alcanza. Importa sobre todo en `syncWithdraw`: borra cuenta, línea
  y pago del retiro cuando el monto es 0, y era invocable con un día arbitrario.

- e5dda38: fix(mostrador): la venta de mostrador respeta la política de lotes vencidos

  El descuento de stock de la venta de mostrador ahora respeta `products.stock.expiredLots`: el FIFO automático **no toca lotes vencidos** con política `block` (default), y con `warn` los usa. Los lotes elegidos manualmente en "¿De qué lote sale?" se permiten (el usuario los eligió explícitamente). Si la venta terminó descontando de un lote vencido, se **avisa** (COONG-248, usa el flag `expired` del motor de products).

## 0.2.0

### Minor Changes

- 725dfa0: billing pasa a ser un motor de cuentas genérico **por cobrar / por pagar** (AR/AP): la cuenta lleva una columna `direction` (`receivable` | `payable`). Cobros/Caja/Deudores filtran `receivable` por default → sin cambio de comportamiento. Habilita que Salidas (y cualquier kit) reuse el mismo ledger (cuenta + líneas + pagos → estado derivado) para cuentas por pagar, en vez de inventar una tabla nueva. Migración aditiva (`direction` NOT NULL DEFAULT 'receivable').
- ef1f636: Rediseño de "Caja diaria" (COONG-211) según el diseño aprobado: encabezado con selector de fecha, tiles de resumen (cobrado / egresos / neto), cobrado agrupado por disponibilidad, tabla de cobros con el componente Table del core, alta de egreso en panel lateral (drawer) y arqueo de cierre plegable. Usa tokens semánticos `success-*` (dark mode) y resuelve el layout en grilla con estilos inline para evitar el choque de CSS entre plugins. "Caja diaria" pasa a ser un ítem de menú de primer nivel.
- f402762: Caja diaria: los egresos ahora se **reflejan desde Salidas/Movimientos** (pagos en efectivo de cuentas payable del día) en vez de una tabla/sección propia — una sola puerta de egreso. Se quitó la sección "Registrar egreso" de Caja; el resumen y el arqueo leen los egresos en efectivo de las salidas.

  Además, los **cobros del día ahora se filtran a cuentas receivable** (antes `listInRange` traía todos los pagos, así que las salidas pagadas se contaban como cobros). `billing.payments.listInRange` ahora expone `account_direction` para separar cobros/egresos en Caja.

  La tabla `module_billing_expenses` y las actions `billing.expenses.*` quedan deprecadas (sin uso desde la UI); se limpian en una tarea aparte.

- 7d02f1b: Cobros/Cuentas: tarjetas-resumen (Por cobrar · Cobrado · Cuentas · Deudores) como atajos de filtro de pago y acceso a la vista de deudores. Se pliega el submenú "Deudores" (ahora se llega desde la card) y "Cobros" pasa a link directo a Cuentas. Helper de grilla responsive extraído a `utils/responsive` (compartido con Caja) para no depender del cascade de Tailwind entre plugins.
- 3aa92d7: feat(cobros): rediseño de Cobros + Cobro rápido con venta por lotes (FEFO)

  - **Cobros**: drawer de detalle de cuenta rediseñado (avatar + contexto, líneas con
    chip por origen, tarjeta de totales, pagos, cobro inline con montos rápidos y medios
    con iconos); badges de pago con iconos en la tabla.
  - **Cobro rápido**: venta de mostrador reescrita como drawer (CSS portado del diseño,
    scopeado bajo `.cr` con tokens del repo). Cliente opcional con buscador ("Sin cliente ·
    solo mostrador"), productos por tipo (medicamentos/vacunas/insumos) con buscador, y el
    editor "¿De qué lote sale?" (FEFO por defecto, reparto entre lotes, señales de
    vencimiento). El cobro descuenta del lote elegido vía `products.batches.consume`.
  - Hooks nuevos: `useContacts`, `useSaleCatalog`, helpers `loteUtils`.

- 25536c1: Cobros: checkout agrupado por origen (Servicios/Vacunas/Productos), atajo "Cobrar" desde la consulta (deep-link via openAccountId), "Cobro rápido" para venta sin consulta, y "Caja diaria" renombrada a "Caja".

### Patch Changes

- 0bb1b72: Limpieza: se elimina la infra de egresos propia de billing, ya deprecada (los egresos viven en Salidas/Movimientos desde billing#5). Borra la tabla `module_billing_expenses` (migración 0004), el `ExpenseRepository` + actions `billing.expenses.*`, el schema, las constantes `EXPENSE_CATEGORIES`/`EXPENSE_CATEGORY_LABEL` y los exports asociados. Caja ya no dependía de nada de esto.
