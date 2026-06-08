import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { PAYMENT_METHODS, METHOD_LABEL } from '../constants.js';
import { createCounterSale } from '../data/createCounterSale.js';
import { useProductCatalog } from '../data/useProductCatalog.js';
import { formatMoney } from '../utils/money.js';
import { toast } from '../utils/toast.js';

const React = getHostReact();
const { useState, useEffect, useMemo } = React;
const h = React.createElement;

interface LineState {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const emptyLine = (): LineState => ({
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
});

interface CounterSaleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Se llama tras una venta exitosa para refrescar la lista de cobros. */
  onSaved: () => void;
}

/**
 * Venta de mostrador: diálogo de venta rápida sin consulta (antipulgas, alimento, etc.).
 * Producto(s) + cantidad + medio de pago → cobra en el acto y entra a la Caja. Reutiliza el
 * patrón de líneas del módulo de compras (purchases), adaptado a venta (precio + cobro).
 */
export function CounterSaleDialog({ open, onOpenChange, onSaved }: CounterSaleDialogProps) {
  const products = useProductCatalog();
  const [method, setMethod] = useState('efectivo');
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setMethod('efectivo');
      setLines([emptyLine()]);
    }
  }, [open]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0),
    [lines]
  );

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((prev: LineState[]) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onPickProduct = (i: number, productId: string) => {
    const p = products.find((o) => o.id === productId);
    setLine(i, { productId, description: p?.name ?? '', unitPrice: p?.salePrice ?? '' });
  };

  const addLine = () => setLines((prev: LineState[]) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev: LineState[]) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const save = async () => {
    const valid = lines.filter(
      (l) => (Number(l.quantity) || 0) > 0 && (l.productId || l.description.trim())
    );
    if (valid.length === 0) {
      toast('Falta el detalle', 'Agregá al menos un producto con cantidad.', 'info');
      return;
    }
    setBusy(true);
    try {
      await createCounterSale({
        method,
        lines: valid.map((l) => ({
          productId: l.productId || null,
          description: l.description.trim() || 'Producto',
          quantity: l.quantity,
          unitPrice: String(Number(l.unitPrice) || 0),
        })),
      });
      toast(
        'Venta cobrada',
        `${formatMoney(total)} · ${METHOD_LABEL[method] ?? method}`,
        'success'
      );
      onOpenChange(false);
      onSaved();
    } catch {
      toast('No se pudo registrar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  };

  return h(
    UI.FormDialog,
    {
      open,
      onOpenChange,
      title: 'Venta de mostrador',
      size: 'lg',
      footer: h(
        'div',
        { className: 'flex items-center justify-between gap-4 w-full' },
        h(
          'span',
          { className: 'font-mono font-bold text-base text-cg-text' },
          `Total ${formatMoney(total)}`
        ),
        h(
          'div',
          { className: 'flex gap-2' },
          h(
            UI.Button,
            {
              variant: 'ghost',
              size: 'sm',
              disabled: busy,
              onClick: () => onOpenChange(false),
            } as any,
            'Cancelar'
          ),
          h(
            UI.Button,
            { variant: 'brand', size: 'sm', disabled: busy, onClick: () => void save() } as any,
            'Cobrar'
          )
        )
      ),
    } as any,
    h(
      'div',
      { className: 'flex flex-col gap-4' },

      h(
        'p',
        { className: 'text-xs text-cg-text-muted' },
        'Venta rápida sin consulta. Se cobra en el acto y entra a la caja del día.'
      ),

      // Ítems
      h(
        'div',
        { className: 'flex flex-col gap-2' },
        h('label', { className: 'block text-xs font-semibold text-cg-text-muted' }, 'Productos'),
        ...lines.map((l, i) =>
          h(
            'div',
            { key: i, className: 'grid grid-cols-12 gap-2 items-center' },
            h(
              'div',
              { className: 'col-span-6' },
              products.length > 0
                ? h(
                    UI.Select,
                    {
                      value: l.productId,
                      onValueChange: (v: string) => onPickProduct(i, v),
                      placeholder: 'Producto',
                    } as any,
                    ...products.map((o) =>
                      h(UI.SelectItem, { key: o.id, value: o.id } as any, o.name)
                    )
                  )
                : h(UI.Input, {
                    size: 'sm',
                    value: l.description,
                    onChange: (e: any) => setLine(i, { description: e.target.value }),
                    placeholder: 'Descripción',
                  } as any)
            ),
            h(
              'div',
              { className: 'col-span-2' },
              h(UI.Input, {
                type: 'number',
                size: 'sm',
                min: 0,
                step: '1',
                value: l.quantity,
                onChange: (e: any) => setLine(i, { quantity: e.target.value }),
                placeholder: 'Cant.',
              } as any)
            ),
            h(
              'div',
              { className: 'col-span-3' },
              h(UI.Input, {
                type: 'number',
                size: 'sm',
                min: 0,
                step: '0.01',
                value: l.unitPrice,
                onChange: (e: any) => setLine(i, { unitPrice: e.target.value }),
                placeholder: 'Precio',
              } as any)
            ),
            h(
              'div',
              { className: 'col-span-1 flex justify-end' },
              h(
                UI.IconButton,
                {
                  variant: 'ghost',
                  size: 'sm',
                  'aria-label': 'Quitar ítem',
                  disabled: lines.length === 1,
                  onClick: () => removeLine(i),
                } as any,
                h(UI.DynamicIcon, { icon: 'Trash2', size: 13 } as any)
              )
            )
          )
        ),
        h(
          'div',
          null,
          h(
            UI.Button,
            { variant: 'outline', size: 'sm', onClick: addLine } as any,
            h(UI.DynamicIcon, { icon: 'Plus', size: 13 } as any),
            ' Agregar ítem'
          )
        )
      ),

      // Medio de pago
      h(
        'div',
        null,
        h(
          'label',
          { className: 'block text-xs font-semibold text-cg-text-muted mb-1' },
          'Cómo se pagó'
        ),
        h(UI.SegmentedControl, {
          value: method,
          options: PAYMENT_METHODS,
          onChange: (v: string) => setMethod(v),
          size: 'sm',
          'aria-label': 'Medio de pago',
        } as any)
      )
    )
  );
}
