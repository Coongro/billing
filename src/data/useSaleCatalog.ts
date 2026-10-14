import { getHostReact, actions } from '@coongro/plugin-sdk';

import { rowsOf } from './contacts.js';
import type { RawBatch } from './loteUtils.js';
import {
  buildCatalog,
  type RawCategory,
  type RawProduct,
  type SaleProduct,
} from './saleCatalog.js';

export { tieneLotes, type SaleProduct } from './saleCatalog.js';

const React = getHostReact();
const { useState, useEffect } = React;

/**
 * Catálogo de la venta de mostrador: los productos de products con su categoría, lotes y stock.
 * Blando: si products no está instalado, devuelve [] y se vende con conceptos libres.
 */
export function useSaleCatalog(): SaleProduct[] {
  const [products, setProducts] = useState<SaleProduct[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [list, cats, batches] = await Promise.all([
          actions.execute<RawProduct[] | { items?: RawProduct[] }>('products.items.list'),
          actions
            .execute<RawCategory[] | { items?: RawCategory[] }>('products.categories.list')
            .catch(() => [] as RawCategory[]),
          actions
            .execute<
              | Array<RawBatch & { product_id: string }>
              | { items?: Array<RawBatch & { product_id: string }> }
            >('products.batches.list')
            .catch(() => [] as Array<RawBatch & { product_id: string }>),
        ]);
        const byProduct = new Map<string, RawBatch[]>();
        for (const b of rowsOf(batches)) {
          const arr = byProduct.get(b.product_id) ?? [];
          arr.push(b);
          byProduct.set(b.product_id, arr);
        }
        if (active) setProducts(buildCatalog(rowsOf(list), rowsOf(cats), byProduct));
      } catch {
        if (active) setProducts([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return products;
}
