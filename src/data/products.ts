import { actions } from '@coongro/plugin-sdk';

export interface ProductOption {
  id: string;
  name: string;
  salePrice: string;
}

interface RawProduct {
  id: string;
  name: string;
  sale_price: string | null;
  category_id: string | null;
}

/**
 * Carga el catálogo (products.items.search) para armar líneas de presupuesto: nombre +
 * precio de venta. Blando: si products no está, devuelve [] (billing es kit-agnóstico).
 */
export async function loadProducts(): Promise<ProductOption[]> {
  const rows = await actions
    .execute<RawProduct[]>('products.items.search', { limit: 500, isActive: true })
    .catch((): RawProduct[] => []);
  return (rows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    salePrice: p.sale_price ?? '0',
  }));
}
