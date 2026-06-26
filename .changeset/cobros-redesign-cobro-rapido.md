---
'@coongro/billing': minor
---

feat(cobros): rediseño de Cobros + Cobro rápido con venta por lotes (FEFO)

- **Cobros**: drawer de detalle de cuenta rediseñado (avatar + contexto, líneas con
  chip por origen, tarjeta de totales, pagos, cobro inline con montos rápidos y medios
  con iconos); badges de pago con iconos en la tabla.
- **Cobro rápido**: venta de mostrador reescrita como drawer (CSS portado del diseño,
  scopeado bajo `.cr` con tokens del repo). Cliente opcional con buscador ("Sin cliente ·
  solo mostrador"), productos por tipo (medicamentos/vacunas/insumos) con buscador, y el
  editor "¿De qué lote sale?" (FEFO por defecto, reparto entre lotes, señales de
  vencimiento). El cobro descuenta del lote elegido vía `products.batches.consume`.
- Hooks nuevos: `useContacts`, `useSaleCatalog`, helpers `loteUtils`.
