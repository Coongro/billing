---
'@coongro/billing': patch
---

El retiro de un cierre se fecha en el día que se cierra, no en el del click

Cerrar la caja de ayer al día siguiente —cosa que la propia pantalla invita a hacer con el
aviso «tenés la caja de ayer sin cerrar»— metía el retiro como egreso de HOY. Y hoy ese
retiro ya venía descontado por otro lado: el fondo de apertura del día es el `next_float`
del cierre anterior, o sea el efectivo que quedó DESPUÉS de retirar.

Restado dos veces, el arqueo anunciaba un sobrante igual al monto retirado. Con $70.000
retirados ayer, la caja de hoy decía «sobran $70.000» estando cuadrada — y alguien podía
sacar esa plata creyendo que sobraba.

Ahora la cuenta y el pago del retiro se fechan en su `business_day`.
