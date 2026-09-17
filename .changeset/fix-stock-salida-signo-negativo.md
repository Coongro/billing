---
'@coongro/billing': patch
---

La venta de mostrador aumentaba el stock en vez de descontarlo cuando el producto
no tenía lotes.

`products.stock.create` suma siempre la cantidad al stock (`stock_current + quantity`):
el campo `type` (`in`/`out`) es una etiqueta y no define el signo. La venta de mostrador
mandaba la cantidad en positivo, así que cada venta de un producto sin lote **sumaba**
unidades al inventario.

No se notaba en el kit veterinario porque sus productos van por lote y los descuenta
`products.batches.consume`; el camino roto era el remanente (`shortfall`), que es
justamente el caso normal de un negocio que no usa lotes.
