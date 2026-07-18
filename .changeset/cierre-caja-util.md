---
'@coongro/billing': minor
---

feat(caja): el cierre deja la caja lista para mañana (COONG-250)

- **Ciclo del efectivo**: al cerrar se decide cuánto se retira y cuánto queda de fondo (campos complementarios). El retiro se registra automáticamente como Salida (cuenta payable "Retiro de caja" + pago efectivo, idempotente por día). El fondo que queda (`next_float`) pre-carga el fondo inicial del día siguiente; la setting `billing.cash.openingFloat` pasa a ser solo el default cuando no hay cierre previo.
- **Historial de cierres**: tira de últimos 7 días en la Caja (exacta / faltó / sobró / sin cerrar), clickeable para navegar al día.
- **Cierre sin efectivo**: un día sin movimientos de efectivo cierra de un click, sin conteo.
- **Estado del día**: badge "Abierta / Cerrada · hh:mm" en el header de la vista.
- Schema: columnas `withdrawn` y `next_float` en `module_billing_cash_closes` (migración 0005). Nuevas acciones `billing.cashCloses.getPrevious` y `listRecent`.
- El aviso de drift post-cierre descuenta el retiro automático para no acusarse a sí mismo.
