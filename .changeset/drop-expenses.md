---
"@coongro/billing": patch
---

Limpieza: se elimina la infra de egresos propia de billing, ya deprecada (los egresos viven en Salidas/Movimientos desde billing#5). Borra la tabla `module_billing_expenses` (migración 0004), el `ExpenseRepository` + actions `billing.expenses.*`, el schema, las constantes `EXPENSE_CATEGORIES`/`EXPENSE_CATEGORY_LABEL` y los exports asociados. Caja ya no dependía de nada de esto.
