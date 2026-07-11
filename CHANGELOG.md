# @coongro/billing

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
