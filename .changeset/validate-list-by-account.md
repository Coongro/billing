---
'@coongro/billing': patch
---

`billing.lines.listByAccount` y `billing.payments.listByAccount` sin `accountId` responden un error de entrada (`VALIDATION`) en vez de un error interno.
