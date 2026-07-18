---
'@coongro/billing': minor
---

feat(settings): configuración de cobros y caja (COONG-248)

Nuevas settings de billing, editables desde `/dev/builder`:

- **Medios de pago habilitados** (`billing.payments.transferencia/.debito/.credito`): cada clínica elige qué medios ofrece; el efectivo está siempre disponible. Reemplaza el set hardcodeado de `constants.ts` — los medios deshabilitados dejan de aparecer en el cobro y en la venta de mostrador.
- **Recargo por pago con crédito** (`billing.payments.creditSurcharge`, %): al cobrar con crédito se agrega automáticamente una línea "Recargo por crédito (X%)" a la cuenta, para que quede trazable y la cuenta cierre balanceada.
- **Permitir ventas a cuenta / fiado** (`billing.payments.onAccount`): con el fiado apagado, el cobro exige saldar el total (no se puede dejar saldo pendiente).
- **Redondeo de efectivo** (`billing.cash.rounding`, off/50/100): redondea el total de la venta de mostrador pagada en efectivo, con una línea de ajuste "Redondeo de efectivo".
- **Exigir arqueo diario** (`billing.cash.requireClose`): avisa en la Caja cuando quedó el día anterior sin cerrar.
