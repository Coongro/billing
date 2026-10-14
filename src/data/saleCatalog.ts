import type { RawBatch } from './loteUtils.js';

export interface SaleProduct {
  id: string;
  name: string;
  /** Precio de venta del catálogo — pre-rellena el precio de la línea. */
  salePrice: string | null;
  /** Nombre de la categoría de products (para mostrarla y buscar por ella); null si no tiene. */
  category: string | null;
  /** Lotes del producto (de products.batches). Vacío si no es loteado o no tiene. */
  lotes: RawBatch[];
  /** Stock plano del producto (para los que no tienen lotes). */
  stock: number;
}

/** Un producto con lotes se vende eligiendo de qué lote sale (FEFO por defecto). */
export const tieneLotes = (p: SaleProduct): boolean => p.lotes.length > 0;

export interface RawProduct {
  id: string;
  name: string;
  sale_price: string | null;
  category_id: string | null;
  stock_current: string | null;
  is_active?: boolean | null;
}
export interface RawCategory {
  id: string;
  name: string;
}

/**
 * Productos vendibles, en orden alfabético y sin repetidos por nombre. Genérico: la categoría es
 * la que el negocio cargó en products, sin clasificar por rubro (antes se agrupaba en
 * Medicamentos / Vacunas / Insumos por el nombre de la categoría, que solo servía a veterinarias).
 */
export function buildCatalog(
  list: RawProduct[],
  cats: RawCategory[],
  batchesByProduct: Map<string, RawBatch[]>
): SaleProduct[] {
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const seen = new Set<string>();
  const out: SaleProduct[] = [];
  for (const p of list) {
    if (p.is_active === false) continue;
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: p.id,
      name: p.name,
      salePrice: p.sale_price,
      category: p.category_id ? (catName.get(p.category_id) ?? null) : null,
      lotes: batchesByProduct.get(p.id) ?? [],
      stock: Number(p.stock_current) || 0,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
