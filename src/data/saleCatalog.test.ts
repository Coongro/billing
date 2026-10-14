import { describe, expect, it } from 'vitest';

import { buildCatalog, tieneLotes } from './saleCatalog.js';

// El cobro rápido es genérico: muestra la categoría que cargó el negocio, sin clasificar por rubro.
describe('buildCatalog', () => {
  const cats = [{ id: 'c1', name: 'Repuestos' }];

  it('usa la categoría real, ordena por nombre y saca repetidos e inactivos', () => {
    const out = buildCatalog(
      [
        { id: 'p2', name: 'Tornillo', sale_price: '50', category_id: 'c1', stock_current: '10' },
        { id: 'p1', name: 'Arandela', sale_price: '20', category_id: null, stock_current: '3' },
        { id: 'p3', name: 'tornillo ', sale_price: '50', category_id: 'c1', stock_current: '1' },
        {
          id: 'p4',
          name: 'Viejo',
          sale_price: '1',
          category_id: null,
          stock_current: '0',
          is_active: false,
        },
      ],
      cats,
      new Map()
    );
    expect(out.map((p) => [p.name, p.category])).toEqual([
      ['Arandela', null],
      ['Tornillo', 'Repuestos'],
    ]);
    expect(out[1].stock).toBe(10);
  });

  it('un producto con lotes se vende por lote, sin importar su categoría', () => {
    const [p] = buildCatalog(
      [{ id: 'p1', name: 'Yerba', sale_price: '900', category_id: 'c1', stock_current: '5' }],
      cats,
      new Map([['p1', [{ id: 'b1', lot_number: 'L1' } as never]]])
    );
    expect(tieneLotes(p)).toBe(true);
  });
});
