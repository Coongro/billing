/**
 * Helpers de día para la Caja. La caja agrupa por la zona horaria LOCAL del navegador
 * (no UTC): "lo de hoy" es el día del operador, no el del server. Centralizados acá para
 * que la vista y sus secciones no dupliquen la lógica.
 */

/** Clave de día (YYYY-MM-DD) en la zona horaria local del navegador. */
export function localDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/**
 * Suma `delta` días a una clave 'YYYY-MM-DD' y devuelve la nueva clave (local).
 * Usa mediodía local para no cruzar el borde del día por DST al sumar.
 */
export function addDays(dayKey: string, delta: number): string {
  const d = new Date(`${dayKey}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDayKey(d);
}

/** Hora 'HH:MM' (es-AR) de un ISO. '' si no parsea. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
