---
"@coongro/billing": minor
---

Rediseño de "Caja diaria" (COONG-211) según el diseño aprobado: encabezado con selector de fecha, tiles de resumen (cobrado / egresos / neto), cobrado agrupado por disponibilidad, tabla de cobros con el componente Table del core, alta de egreso en panel lateral (drawer) y arqueo de cierre plegable. Usa tokens semánticos `success-*` (dark mode) y resuelve el layout en grilla con estilos inline para evitar el choque de CSS entre plugins. "Caja diaria" pasa a ser un ítem de menú de primer nivel.
