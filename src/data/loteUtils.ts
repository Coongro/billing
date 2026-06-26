/**
 * Helpers de lotes para el cobro rápido (venta de mostrador): orden FEFO (vence primero, sale
 * primero), lote recomendado, stock vendible y reparto de una cantidad entre lotes. Espeja la
 * lógica del diseño "¿De qué lote sale?" sobre datos reales de products.batches. Puro (sin red).
 */

export interface SaleLote {
  /** id del batch en products.batches (para descontar el lote elegido). */
  batchId: string;
  /** Número de lote para mostrar (batch_number). */
  nro: string;
  /** Vencimiento ISO ('yyyy-mm-dd') o '' si el producto no vence. */
  venc: string;
  /** Stock disponible del lote. */
  stock: number;
  estado: VencEstado;
}

export interface VencEstado {
  kind: 'vencido' | 'pronto' | 'ok';
  label: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Meses desde hoy hasta el vencimiento (negativo = ya vencido). +Infinity si no vence. */
function monthsUntil(venc: string): number {
  if (!venc) return Number.POSITIVE_INFINITY;
  const [y, m] = venc.slice(0, 7).split('-').map(Number);
  if (!y || !m) return Number.POSITIVE_INFINITY;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
}

/** "mar 2027" para mostrar el vencimiento. */
function fmtVenc(venc: string): string {
  if (!venc) return 'sin vencimiento';
  const [y, m] = venc.slice(0, 7).split('-').map(Number);
  return y && m && MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : venc;
}

/** Estado de vencimiento de un lote (vencido / vence pronto ≤ 3 meses / ok). */
export function vencEstado(venc: string): VencEstado {
  if (!venc) return { kind: 'ok', label: 'Sin vencimiento' };
  const dm = monthsUntil(venc);
  if (dm < 0) return { kind: 'vencido', label: 'Vencido' };
  if (dm <= 3)
    return {
      kind: 'pronto',
      label: dm <= 0 ? 'Vence este mes' : `Vence en ${dm} ${dm === 1 ? 'mes' : 'meses'}`,
    };
  return { kind: 'ok', label: `Vence ${fmtVenc(venc)}` };
}

/** Fila cruda de products.batches.listByProduct. */
export interface RawBatch {
  id: string;
  batch_number: string;
  expiration_date: string | null;
  quantity: string | null;
  status: string;
}

/** Lotes de un producto normalizados + ordenados FEFO (vence primero). */
export function lotesFEFO(rows: RawBatch[]): SaleLote[] {
  return rows
    .filter((r) => r.status !== 'recalled')
    .map((r) => ({
      batchId: r.id,
      nro: r.batch_number,
      venc: r.expiration_date ?? '',
      stock: Number(r.quantity) || 0,
      estado: vencEstado(r.expiration_date ?? ''),
    }))
    .sort((a, b) => monthsUntil(a.venc) - monthsUntil(b.venc));
}

/** Lote recomendado = el que vence primero, no vencido y con stock. */
export function loteRecomendado(lotes: SaleLote[]): SaleLote | null {
  return lotes.find((l) => l.estado.kind !== 'vencido' && l.stock > 0) ?? null;
}

/** Stock total vendible (no vencido). */
export function stockVendible(lotes: SaleLote[]): number {
  return lotes.filter((l) => l.estado.kind !== 'vencido').reduce((a, l) => a + l.stock, 0);
}

/** Un tramo del reparto: cuánto sale de qué lote. */
export interface Tramo {
  batchId: string;
  nro: string;
  venc: string;
  take: number;
  estado: VencEstado;
  stock: number;
}

/**
 * Reparte `cant` unidades empezando por el lote `loteNro` (si se eligió) y siguiendo FEFO.
 * Devuelve los tramos (lote + cuánto sale) y cuántas unidades faltan por stock insuficiente.
 */
export function repartir(
  lotes: SaleLote[],
  cant: number,
  loteNro: string | null
): { tramos: Tramo[]; faltan: number } {
  const usable = lotes.filter((l) => l.estado.kind !== 'vencido' && l.stock > 0);
  const elegido = loteNro ? usable.find((l) => l.nro === loteNro) : undefined;
  const orden = elegido ? [elegido, ...usable.filter((l) => l.nro !== loteNro)] : usable;
  let resto = cant;
  const tramos: Tramo[] = [];
  for (const l of orden) {
    if (resto <= 0) break;
    const take = Math.min(resto, l.stock);
    if (take > 0) {
      tramos.push({
        batchId: l.batchId,
        nro: l.nro,
        venc: l.venc,
        take,
        estado: l.estado,
        stock: l.stock,
      });
      resto -= take;
    }
  }
  return { tramos, faltan: Math.max(0, resto) };
}
