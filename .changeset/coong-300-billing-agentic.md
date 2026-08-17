---
'@coongro/billing': minor
---

Billing pasa a tener plano agentic: nueve capabilities publicadas y certificadas
contra un tenant real.

Se puede preguntar quién debe plata, buscar cuentas con su saldo (por cliente,
por período o por origen), ver el detalle de una cuenta y lo cobrado entre dos
fechas; y se puede abrir una cuenta a nombre de un cliente, sumarle un concepto
y registrar un cobro.

`accounts.openForContact` es nueva y llena un hueco que nadie había nombrado:
las otras dos formas de abrir una cuenta pertenecen al kit veterinario y a la
emisión mensual, así que hasta que no corriera la generación no había ninguna
cuenta a la que cargarle nada. Genera su propia referencia de origen —no la
acepta— para no poder chocar con el cargo de un mes.

`accounts.listWithTotals` acepta ahora un cliente, que es lo que convierte
«quién me debe» en «cobrale», y el detalle de una cuenta dice de quién es y
para qué lado va la plata.

Corrige que el listado de deudores publicara el identificador del contacto como
si fuera el de una cuenta: quien encadenara esa referencia terminaba pasándole
un cliente a «registrar un cobro».
