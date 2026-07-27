---
'@coongro/billing': patch
---

Saca `accountTotals` y `syncWithdraw` de la superficie RPC renombrándolos con
prefijo `_`.

El auto-wire del runtime registra como acción todo método del prototipo salvo el
constructor y los prefijados con `_`; el `private` de TypeScript se borra al
compilar y no alcanza. Importa sobre todo en `syncWithdraw`: borra cuenta, línea
y pago del retiro cuando el monto es 0, y era invocable con un día arbitrario.
