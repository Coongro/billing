---
'@coongro/billing': patch
---

fix(caja): números coherentes y cierre de caja con autoridad (COONG-249)

- El **Neto de caja** ahora resta TODOS los egresos del día (efectivo + digital), no solo los de efectivo — un retiro por transferencia ya no queda invisible. El tile de Egresos desglosa efectivo/digital y referencia "Salidas" (el nombre real del menú).
- La tabla de cobros se ordena cronológicamente.
- Un día **cerrado** muestra el snapshot guardado del cierre (fondo/esperado/contado/diferencia) en modo lectura, en vez de recalcular en vivo y contradecir el chip "Cerrada". Si hubo movimientos de efectivo posteriores al cierre, se avisa explícitamente con el esperado actual.
- **Rehacer el cierre** pide confirmación (muestra qué snapshot se pisa) y `closed_at` se actualiza de verdad en el re-cierre (el ISO string se perdía en el `.set()` de drizzle; ahora va `sql\`now()\``).
- `billing.lines.listInRange` acepta filtro `direction` y expone `account_direction`, para que los reportes de ingresos excluyan cuentas por pagar.
