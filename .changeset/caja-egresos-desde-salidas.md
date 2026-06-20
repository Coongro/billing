---
"@coongro/billing": minor
---

Caja diaria: los egresos ahora se **reflejan desde Salidas/Movimientos** (pagos en efectivo de cuentas payable del día) en vez de una tabla/sección propia — una sola puerta de egreso. Se quitó la sección "Registrar egreso" de Caja; el resumen y el arqueo leen los egresos en efectivo de las salidas.

Además, los **cobros del día ahora se filtran a cuentas receivable** (antes `listInRange` traía todos los pagos, así que las salidas pagadas se contaban como cobros). `billing.payments.listInRange` ahora expone `account_direction` para separar cobros/egresos en Caja.

La tabla `module_billing_expenses` y las actions `billing.expenses.*` quedan deprecadas (sin uso desde la UI); se limpian en una tarea aparte.
