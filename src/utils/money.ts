/**
 * Formateo de montos. Reutilizable por cualquier vista del plugin (y kits que lo usen).
 * Formato ARS: "$ 1.234,56". Tolera string/number/null.
 */
export function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$ 0';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** date-key 'yyyy-mm-dd' a 'dd/mm/yyyy' (display). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const datePart = value.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  return y && m && d ? `${d}/${m}/${y}` : datePart;
}
