/**
 * Normaliza un timestamp de Postgres ("YYYY-MM-DD HH:MM:SS[.ffffff]") a ISO-UTC
 * ("YYYY-MM-DDTHH:MM:SS[.ffffff]Z").
 *
 * La columna `opened_at` es `timestamp` (sin TZ) y guarda instantes UTC (el server
 * corre en UTC). Al leerla, Postgres devuelve el formato con espacio y sin sufijo de
 * zona, que luxon/`Intl`/`toDateKey` NO parsean como ISO → los reportes por fecha
 * fallarían. Esta función deja el string en ISO-UTC sin reinterpretar el instante
 * (manipulación de string pura, sin `new Date()`, para no introducir corrimientos por
 * la zona del proceso).
 */
export function toIsoUtc(ts: string | null | undefined): string {
  if (!ts) return ts ?? '';
  // Ya viene en ISO (tiene 'T'): respetamos; agregamos 'Z' solo si no trae zona.
  if (ts.includes('T')) {
    return /[Zz]$/.test(ts) || /[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`;
  }
  return `${ts.replace(' ', 'T')}Z`;
}
