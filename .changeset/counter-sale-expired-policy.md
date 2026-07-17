---
'@coongro/billing': patch
---

fix(mostrador): la venta de mostrador respeta la política de lotes vencidos

El descuento de stock de la venta de mostrador ahora respeta `products.stock.expiredLots`: el FIFO automático **no toca lotes vencidos** con política `block` (default), y con `warn` los usa. Los lotes elegidos manualmente en "¿De qué lote sale?" se permiten (el usuario los eligió explícitamente). Si la venta terminó descontando de un lote vencido, se **avisa** (COONG-248, usa el flag `expired` del motor de products).
