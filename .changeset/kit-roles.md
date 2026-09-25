---
'@coongro/billing': minor
---

Cuentas y cobros declaran quién puede verlos y registrarlos

El plugin declara sus permisos (`contributes.permissions`, generados con el Coongro Builder) y trae `src/permissions/permissions.gen.ts` con las constantes para chequearlos en código. En Coongro Standalone, cada usuario ve y hace solo lo que le permiten sus roles; el dueño, todo.

Se declara la dependencia `@coongro/contacts`, que las vistas ya usaban.
