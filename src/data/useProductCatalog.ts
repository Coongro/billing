import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect } = React;

export interface SaleProduct {
  id: string;
  name: string;
  /** Precio de venta del catálogo — pre-rellena el precio de la línea de venta. */
  salePrice: string | null;
}

interface RawProduct {
  id: string;
  name: string;
  sale_price: string | null;
  category_id: string | null;
}

interface RawCategory {
  id: string;
  name: string;
  parent_id: string | null;
}

/** Nodo padre que agrupa las categorías de SERVICIOS (no se venden por mostrador). */
const SERVICE_PARENT = 'Servicios Veterinarios';

/** IDs de categorías de servicios: el nodo "Servicios Veterinarios" y sus hijos. */
function serviceCategoryIds(cats: RawCategory[]): Set<string> {
  const parents = new Set(cats.filter((c) => c.name === SERVICE_PARENT).map((c) => c.id));
  const ids = new Set<string>(parents);
  for (const c of cats) {
    if (c.parent_id && parents.has(c.parent_id)) ids.add(c.id);
  }
  return ids;
}

/**
 * Productos del catálogo (products.items.list) para la VENTA DE MOSTRADOR. Excluye los servicios
 * (no se venden sueltos — van por consulta) y deduplica por nombre (el seed quedó duplicado).
 * Blando: si products no está, devuelve [] y la línea se carga como ítem suelto.
 */
export function useProductCatalog(): SaleProduct[] {
  const [options, setOptions] = useState<SaleProduct[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [list, cats] = await Promise.all([
          actions.execute<RawProduct[]>('products.items.list'),
          actions
            .execute<RawCategory[]>('products.categories.list')
            .catch(() => [] as RawCategory[]),
        ]);
        const serviceIds = serviceCategoryIds(cats ?? []);
        const seen = new Set<string>();
        const filtered = (list ?? []).filter((p) => {
          if (p.category_id && serviceIds.has(p.category_id)) return false; // servicio
          const key = p.name.trim().toLowerCase();
          if (seen.has(key)) return false; // duplicado
          seen.add(key);
          return true;
        });
        if (active) {
          setOptions(filtered.map((p) => ({ id: p.id, name: p.name, salePrice: p.sale_price })));
        }
      } catch {
        if (active) setOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return options;
}
