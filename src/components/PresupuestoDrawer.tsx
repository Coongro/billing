import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { LINE_SOURCE_LABEL } from '../constants.js';
import { loadProducts } from '../data/products.js';
import type { ProductOption } from '../data/products.js';
import { formatMoney } from '../utils/money.js';

const React = getHostReact();
const { useState, useEffect, useCallback, useMemo } = React;
const h = React.createElement;

const MODULE_ID = '@coongro/billing';

function toast(title: string, message: string, type: 'success' | 'info'): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const host = (globalThis as any).coongro?.toast as
    | {
        show?: (opts: { title: string; message: string; type?: string; moduleId?: string }) => void;
      }
    | undefined;
  host?.show?.({ title, message, type, moduleId: MODULE_ID });
}

interface DraftLine {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  subtotal: string;
  source_type: string;
}
interface DraftDetail {
  lines: DraftLine[];
  total: string;
}

interface PresupuestoDrawerProps {
  /** Cuenta-borrador a editar; null = cerrado. */
  accountId: string | null;
  /** Encabezado de contexto (cliente · mascota), resuelto por el caller. */
  subtitle?: string;
  onClose: () => void;
  /** Tras agregar/quitar línea, convertir o eliminar — refresca la lista. */
  onChanged: () => void;
}

const mono = { fontFamily: 'var(--cg-font-mono, SF Mono, Menlo, monospace)' };

export function PresupuestoDrawer({
  accountId,
  subtitle,
  onClose,
  onChanged,
}: PresupuestoDrawerProps) {
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const d = await actions.execute<DraftDetail | undefined>('billing.accounts.getWithLines', {
        id: accountId,
      });
      setDetail(d ? { lines: d.lines, total: d.total } : null);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setQuery('');
    if (accountId) void load();
    else setDetail(null);
  }, [accountId, load]);

  // Catálogo de productos para el armador — se carga una vez al abrir.
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    void loadProducts().then((p) => {
      if (alive) setProducts(p);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const addLine = useCallback(
    async (p: ProductOption) => {
      if (!accountId) return;
      setBusy(true);
      try {
        await actions.execute('billing.lines.add', {
          accountId,
          productId: p.id,
          description: p.name,
          quantity: '1',
          unitPrice: p.salePrice,
          sourceType: 'product',
        });
        await load();
        onChanged();
      } catch {
        toast('No se pudo agregar', 'Intentá de nuevo.', 'info');
      } finally {
        setBusy(false);
      }
    },
    [accountId, load, onChanged]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      setBusy(true);
      try {
        await actions.execute('billing.lines.delete', { id: lineId });
        await load();
        onChanged();
      } catch {
        toast('No se pudo quitar', 'Intentá de nuevo.', 'info');
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged]
  );

  const convert = useCallback(async () => {
    if (!accountId) return;
    setBusy(true);
    try {
      await actions.execute('billing.accounts.convertToCharge', { id: accountId });
      toast('Convertido a cobro', 'El presupuesto pasó a la cuenta de cobro.', 'success');
      onChanged();
      onClose();
    } catch {
      toast('No se pudo convertir', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  }, [accountId, onChanged, onClose]);

  const removeDraft = useCallback(async () => {
    if (!accountId) return;
    setBusy(true);
    try {
      await actions.execute('billing.accounts.deleteWithLines', { id: accountId });
      toast('Presupuesto eliminado', 'Se descartó el presupuesto.', 'info');
      onChanged();
      onClose();
    } catch {
      toast('No se pudo eliminar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  }, [accountId, onChanged, onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
    return list.slice(0, 8);
  }, [products, query]);

  const hasLines = (detail?.lines.length ?? 0) > 0;

  return h(
    UI.Sheet,
    {
      open: accountId !== null,
      onOpenChange: (v: boolean) => !v && onClose(),
      side: 'right',
    } as any,
    h(
      UI.SheetContent,
      {
        style: { width: '460px', maxWidth: '92vw', display: 'flex', flexDirection: 'column' },
      } as any,

      h(
        UI.SheetHeader,
        null,
        h(
          'div',
          null,
          h(
            'div',
            {
              style: {
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--cg-text-muted)',
                marginBottom: '4px',
              },
            },
            'PRESUPUESTO'
          ),
          h(UI.SheetTitle, null, 'Armar presupuesto'),
          subtitle &&
            h(
              'p',
              { style: { fontSize: '12.5px', color: 'var(--cg-text-muted)', margin: '4px 0 0' } },
              subtitle
            )
        )
      ),

      // Cuerpo: líneas agregadas + armador
      h(
        'div',
        { style: { flex: 1, overflow: 'auto', padding: '16px 24px' } },

        // Líneas agregadas
        loading
          ? h('p', { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } }, 'Cargando…')
          : !hasLines
            ? h(
                'p',
                { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } },
                'Todavía no agregaste ítems. Buscá productos o servicios abajo.'
              )
            : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                ...(detail?.lines ?? []).map((l) =>
                  h(
                    'div',
                    {
                      key: l.id,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 12px',
                        border: '1px solid var(--cg-border)',
                        borderRadius: '8px',
                      },
                    },
                    h(
                      'div',
                      { style: { minWidth: 0 } },
                      h('div', { style: { fontSize: '13px', fontWeight: 500 } }, l.description),
                      h(
                        'div',
                        {
                          style: {
                            fontSize: '11.5px',
                            color: 'var(--cg-text-muted)',
                            marginTop: '2px',
                          },
                        },
                        `${LINE_SOURCE_LABEL[l.source_type] ?? l.source_type} · ${l.quantity} × ${formatMoney(l.unit_price)}`
                      )
                    ),
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      h(
                        'span',
                        { style: { ...mono, fontWeight: 600, fontSize: '13px' } },
                        formatMoney(l.subtotal)
                      ),
                      h(
                        UI.IconButton,
                        {
                          variant: 'ghost',
                          size: 'sm',
                          disabled: busy,
                          'aria-label': `Quitar ${l.description}`,
                          onClick: () => void removeLine(l.id),
                        } as any,
                        h(UI.DynamicIcon, { icon: 'Trash2', size: 13 } as any)
                      )
                    )
                  )
                )
              ),

        // Armador: buscar y agregar
        h(
          'div',
          { style: { marginTop: '18px' } },
          h(
            'div',
            {
              style: {
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--cg-text-muted)',
                marginBottom: '8px',
              },
            },
            'Agregar ítem'
          ),
          h(UI.Input, {
            size: 'sm',
            placeholder: 'Buscar producto o servicio…',
            value: query,
            onChange: (e: any) => setQuery(e.target.value),
          } as any),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' } },
            matches.length === 0
              ? h(
                  'p',
                  { style: { fontSize: '12px', color: 'var(--cg-text-muted)', padding: '4px 0' } },
                  products.length === 0
                    ? 'No hay catálogo de productos disponible.'
                    : 'Sin resultados.'
                )
              : matches.map((p) =>
                  h(
                    'button',
                    {
                      key: p.id,
                      type: 'button',
                      disabled: busy,
                      onClick: () => void addLine(p),
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: '1px solid var(--cg-border)',
                        borderRadius: '8px',
                        background: 'transparent',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        font: 'inherit',
                      },
                    },
                    h(
                      'span',
                      {
                        style: {
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        },
                      },
                      h(UI.DynamicIcon, { icon: 'Plus', size: 13 } as any),
                      p.name
                    ),
                    h(
                      'span',
                      { style: { ...mono, fontSize: '12.5px', color: 'var(--cg-text-muted)' } },
                      formatMoney(p.salePrice)
                    )
                  )
                )
          )
        )
      ),

      // Footer: total + acciones
      h(
        'div',
        { style: { flexShrink: 0, borderTop: '1px solid var(--cg-border)', padding: '16px 24px' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '14px',
            },
          },
          h(
            'span',
            { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } },
            'Total estimado'
          ),
          h(
            'span',
            { style: { ...mono, fontSize: '20px', fontWeight: 700 } },
            formatMoney(detail?.total)
          )
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              gap: '8px',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            },
          },
          h(
            UI.Button,
            {
              variant: 'ghost',
              size: 'sm',
              disabled: busy,
              onClick: () => void removeDraft(),
            } as any,
            'Eliminar'
          ),
          h(
            'div',
            { style: { display: 'flex', gap: '8px' } },
            h(UI.Button, { variant: 'outline', onClick: onClose } as any, 'Cerrar'),
            hasLines &&
              h(
                UI.Button,
                { variant: 'brand', disabled: busy, onClick: () => void convert() } as any,
                h(UI.DynamicIcon, { icon: 'ArrowRightLeft', size: 13 } as any),
                ' Convertir a cobro'
              )
          )
        )
      )
    )
  );
}
