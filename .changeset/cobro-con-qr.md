---
'@coongro/billing': minor
---

La venta de mostrador suma el medio «QR» cuando hay un proveedor de cobros configurado (motor
`@coongro/payments`, por ejemplo Mercado Pago): abre la ventana de cobro con el QR y registra la
venta recién cuando el pago se acredita, con el proveedor y el comprobante en la nota del pago.
