---
"@coongro/billing": minor
---

billing pasa a ser un motor de cuentas genérico **por cobrar / por pagar** (AR/AP): la cuenta lleva una columna `direction` (`receivable` | `payable`). Cobros/Caja/Deudores filtran `receivable` por default → sin cambio de comportamiento. Habilita que Salidas (y cualquier kit) reuse el mismo ledger (cuenta + líneas + pagos → estado derivado) para cuentas por pagar, en vez de inventar una tabla nueva. Migración aditiva (`direction` NOT NULL DEFAULT 'receivable').
