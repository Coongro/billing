---
'@coongro/billing': minor
---

Las cuentas pueden tener vencimiento y decir de dónde salieron

Tres cosas que necesita cualquier kit que emita cargos por período, no solo el de alquileres:

- **`due_date`**: cuándo vence lo que se cobra, para poder decir qué está vencido sin que cada kit lo calcule por su cuenta.
- **`source_ref`** con índice único parcial: quién generó la cuenta. El que emite un mes busca por origen y referencia, y si ya existe no vuelve a emitirlo — así generar dos veces el mismo período no duplica nada.
- **`direction`**: si la plata entra o sale. Convierte el ledger en un motor por cobrar / por pagar reutilizable, sin cambiar el comportamiento de lo que ya existía.

Ninguna columna es específica de un kit: nada de `lease_id`.
