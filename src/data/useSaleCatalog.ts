import { getHostReact, actions } from '@coongro/plugin-sdk';

import type { RawBatch } from './loteUtils.js';

const React = getHostReact();
const { useState, useEffect } = React;

export interface SaleProduct {
  id: string;
  name: string;
  /** Precio de venta del catálogo — pre-rellena el precio de la línea. */
  salePrice: string | null;
  /** Bucket del producto (med/vacc se manejan por lote; insumo no). */
  bucket: ProductBucket;
  /** Lotes del producto (de products.batches). Vacío si no es loteado o no tiene. */
  lotes: RawBatch[];
  /** Stock plano del producto (para insumos sin lote). */
  stock: number;
}

/** Un grupo de productos vendibles para su propio selector (Medicamentos / Vacunas / Insumos). */
export interface SaleGroup {
  key: ProductBucket;
  label: string;
  icon: string;
  products: SaleProduct[];
}

/**
 * Misma clasificación que el drawer de "Registrar salida" (purchases/useProductOptions): el
 * bucket sale del NOMBRE de la categoría de products, no del kit. Se duplica acá a propósito
 * para no acoplar billing→purchases (repos separados); la deuda real es consolidar esta
 * heurística en products (dueño del catálogo) y que ambos la consuman. Mantener en sync.
 */
export type ProductBucket = 'med' | 'vacc' | 'insumo';
function bucketOf(name: string | null): ProductBucket {
  const n = (name ?? '').toLowerCase();
  if (n.includes('vacun')) return 'vacc';
  if (
    !n ||
    n.includes('medic') ||
    n.includes('fármac') ||
    n.includes('farmac') ||
    n.includes('antibi')
  )
    return 'med';
  return 'insumo';
}

const BUCKET_META: Record<ProductBucket, { label: string; icon: string }> = {
  med: { label: 'Medicamentos', icon: 'Pill' },
  vacc: { label: 'Vacunas', icon: 'Syringe' },
  insumo: { label: 'Insumos', icon: 'Package' },
};
const BUCKET_ORDER: ProductBucket[] = ['med', 'vacc', 'insumo'];

interface RawProduct {
  id: string;
  name: string;
  sale_price: string | null;
  category_id: string | null;
  stock_current: string | null;
}
interface RawCategory {
  id: string;
  name: string;
  parent_id: string | null;
}

const SERVICE_PARENT = 'Servicios Veterinarios';
function serviceCategoryIds(cats: RawCategory[]): Set<string> {
  const parents = new Set(cats.filter((c) => c.name === SERVICE_PARENT).map((c) => c.id));
  const ids = new Set<string>(parents);
  for (const c of cats) if (c.parent_id && parents.has(c.parent_id)) ids.add(c.id);
  return ids;
}

/** Filtra servicios/duplicados, clasifica por bucket y arma los grupos con productos + lotes. */
function buildGroups(
  list: RawProduct[],
  cats: RawCategory[],
  batchesByProduct: Map<string, RawBatch[]>
): SaleGroup[] {
  const serviceIds = serviceCategoryIds(cats);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const seen = new Set<string>();
  const byBucket: Record<ProductBucket, SaleProduct[]> = { med: [], vacc: [], insumo: [] };
  for (const p of list) {
    if (p.category_id && serviceIds.has(p.category_id)) continue; // servicio
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) continue; // duplicado
    seen.add(key);
    const bucket = bucketOf(p.category_id ? (catName.get(p.category_id) ?? null) : null);
    byBucket[bucket].push({
      id: p.id,
      name: p.name,
      salePrice: p.sale_price,
      bucket,
      lotes: batchesByProduct.get(p.id) ?? [],
      stock: Number(p.stock_current) || 0,
    });
  }
  return BUCKET_ORDER.map((b) => ({
    key: b,
    label: BUCKET_META[b].label,
    icon: BUCKET_META[b].icon,
    products: byBucket[b],
  })).filter((g) => g.products.length > 0);
}

/**
 * Catálogo de venta de mostrador AGRUPADO por bucket, para un selector por grupo (diseño del
 * cobro rápido: "un selector de medicamentos, otro de vacunas"). Reutiliza la heurística de
 * clasificación de Salidas (por nombre de categoría) + el filtro de servicios/duplicados.
 * Solo devuelve los grupos con productos. Blando: si products no está, devuelve [].
 */
export function useSaleCatalog(): SaleGroup[] {
  const [groups, setGroups] = useState<SaleGroup[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [list, cats, batches] = await Promise.all([
          actions.execute<RawProduct[]>('products.items.list'),
          actions
            .execute<RawCategory[]>('products.categories.list')
            .catch(() => [] as RawCategory[]),
          actions
            .execute<Array<RawBatch & { product_id: string }>>('products.batches.list')
            .catch(() => [] as Array<RawBatch & { product_id: string }>),
        ]);
        const byProduct = new Map<string, RawBatch[]>();
        for (const b of batches ?? []) {
          const arr = byProduct.get(b.product_id) ?? [];
          arr.push(b);
          byProduct.set(b.product_id, arr);
        }
        if (active) setGroups(buildGroups(list ?? [], cats ?? [], byProduct));
      } catch {
        if (active) setGroups([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return groups;
}
