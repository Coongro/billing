import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

import { METHOD_LABEL } from '../constants.js';
import { createCounterSale } from '../data/createCounterSale.js';
import { lotesFEFO, loteRecomendado, repartir } from '../data/loteUtils.js';
import { useContacts } from '../data/useContacts.js';
import type { ContactOption } from '../data/useContacts.js';
import { useSaleCatalog } from '../data/useSaleCatalog.js';
import type { SaleGroup, SaleProduct, ProductBucket } from '../data/useSaleCatalog.js';
import {
  useBillingSettings,
  enabledMethods,
  roundCash,
  creditSurcharge,
} from '../settings/derive.js';
import { formatMoney } from '../utils/money.js';
import { toast } from '../utils/toast.js';

import { LoteEditor } from './LoteEditor.js';

const UI = getHostUI();
const React = getHostReact();
const { useState, useEffect, useRef } = React;
const h = React.createElement;
const ic = (name: string, size = 16) => h(UI.DynamicIcon, { icon: name, size } as any);

const MEDIO_ICON: Record<string, string> = {
  efectivo: 'Banknote',
  transferencia: 'ArrowLeftRight',
  debito: 'CreditCard',
  credito: 'CreditCard',
};
const MEDIO_CAJA: Record<string, { caja: boolean; nota: string }> = {
  efectivo: { caja: true, nota: 'Entra a la caja del día' },
  transferencia: { caja: false, nota: 'No toca la caja' },
  debito: { caja: false, nota: 'Se acredita después' },
  credito: { caja: false, nota: 'Se acredita después' },
};
const TYPE_TAG: Record<ProductBucket, string> = { med: 'Med.', vacc: 'Vacuna', insumo: 'Insumo' };
const BUCKET_ICON: Record<ProductBucket, string> = { med: 'Pill', vacc: 'Syringe', insumo: 'Box' };
const UNIDAD = 'u.';

interface LineState {
  key: string;
  product: SaleProduct;
  quantity: number;
  unitPrice: number;
  loteNro: string | null;
}
const esLoteado = (p: SaleProduct) => p.bucket === 'med' || p.bucket === 'vacc';

/** Hook: cerrar un menú con click afuera / Escape + autofocus al input. */
function useMenuDismiss(open: boolean, close: () => void, wrap: any, input: any) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: any) => {
      if (wrap.current && !wrap.current.contains(e.target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => input.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);
}

// ── Cliente (opcional) con buscador ──
function ClienteField(props: {
  contacts: ContactOption[];
  value: ContactOption | null;
  onChange: (c: ContactOption | null) => void;
}) {
  const { contacts, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef<any>(null);
  const input = useRef<any>(null);
  const close = () => {
    setOpen(false);
    setQ('');
  };
  useMenuDismiss(open, close, wrap, input);
  const norm = (s: string) => (s || '').toLowerCase();
  const results = contacts.filter((c) => !q || norm(c.name).includes(norm(q)));

  return h(
    'div',
    { className: 'cr-cli-wrap', ref: wrap },
    value
      ? h(
          'div',
          { className: 'cr-cli on' },
          h('div', { className: 'cr-cli-ic' }, ic('User', 17)),
          h(
            'div',
            { className: 'cr-cli-txt' },
            h('div', { className: 'cr-cli-name' }, value.name),
            h('div', { className: 'cr-cli-meta' }, 'Venta asociada a este cliente')
          ),
          h(
            'button',
            { className: 'cr-cli-x', onClick: () => onChange(null), title: 'Quitar cliente' },
            ic('X', 14)
          )
        )
      : h(
          'div',
          { className: 'cr-cli' },
          h('div', { className: 'cr-cli-ic dash' }, ic('UserMinus', 17)),
          h(
            'div',
            { className: 'cr-cli-txt' },
            h('div', { className: 'cr-cli-name' }, 'Sin cliente · solo mostrador'),
            h('div', { className: 'cr-cli-meta' }, 'Venta anónima — está perfecto así.')
          ),
          contacts.length > 0
            ? h(
                'button',
                { className: 'cr-cli-add', onClick: () => setOpen((o: boolean) => !o) },
                ic('Plus', 13),
                ' Asociar'
              )
            : null
        ),
    open && !value
      ? h(
          'div',
          { className: 'cr-menu' },
          h(
            'div',
            { className: 'cr-menu-search' },
            ic('Search', 15),
            h('input', {
              ref: input,
              value: q,
              placeholder: 'Buscar cliente…',
              onChange: (e: any) => setQ(e.target.value),
            } as any)
          ),
          h(
            'div',
            { className: 'cr-menu-list' },
            ...results.map((c) =>
              h(
                'button',
                {
                  key: c.id,
                  type: 'button',
                  className: 'cr-result',
                  onClick: () => {
                    onChange(c);
                    close();
                  },
                } as any,
                h('span', { className: 'cr-result-ic' }, ic('User', 15)),
                h('div', { className: 'cr-rtxt' }, h('div', { className: 'nm' }, c.name))
              )
            ),
            results.length === 0
              ? h('div', { className: 'cr-menu-empty' }, 'Ningún cliente coincide.')
              : null
          )
        )
      : null
  );
}

// ── Selectores de producto por tipo (tabs + menú compartido) ──
function CategoryAdder(props: {
  groups: SaleGroup[];
  chosen: Set<string>;
  onAdd: (p: SaleProduct) => void;
}) {
  const { groups, chosen, onAdd } = props;
  const [open, setOpen] = useState<ProductBucket | null>(null);
  const [q, setQ] = useState('');
  const wrap = useRef<any>(null);
  const input = useRef<any>(null);
  const close = () => {
    setOpen(null);
    setQ('');
  };
  useMenuDismiss(!!open, close, wrap, input);
  const g = open ? groups.find((x) => x.key === open) : null;
  const norm = (s: string) => (s || '').toLowerCase();
  const results = g ? g.products.filter((p) => !q || norm(p.name).includes(norm(q))) : [];
  const activate = (id: ProductBucket) => (open === id ? close() : (setOpen(id), setQ('')));

  return h(
    'div',
    { className: 'cr-add-wrap', ref: wrap },
    h(
      'div',
      {
        className: 'cr-add-tabs',
        style: { gridTemplateColumns: `repeat(${groups.length || 1}, 1fr)` },
      },
      ...groups.map((grp) =>
        h(
          'button',
          {
            key: grp.key,
            type: 'button',
            className: `cr-add-tab ${grp.key} ${open === grp.key ? 'on' : ''}`,
            onClick: () => activate(grp.key),
          },
          ic(grp.icon, 15),
          ` ${grp.label}`,
          h('span', { className: 'pl' }, ic(open === grp.key ? 'X' : 'Plus', 14))
        )
      )
    ),
    open && g
      ? h(
          'div',
          { className: 'cr-menu cr-add-menu' },
          h(
            'div',
            { className: 'cr-menu-search' },
            h(
              'span',
              { className: `cr-type ${g.key}` },
              ic(BUCKET_ICON[g.key], 12),
              ` ${TYPE_TAG[g.key]}`
            ),
            ic('Search', 15),
            h('input', {
              ref: input,
              value: q,
              placeholder: `Buscar ${g.label.toLowerCase()}…`,
              onChange: (e: any) => setQ(e.target.value),
            } as any)
          ),
          h(
            'div',
            { className: 'cr-menu-list' },
            ...results.map((p) =>
              h(
                'button',
                {
                  key: p.id,
                  type: 'button',
                  className: 'cr-result',
                  onClick: () => {
                    onAdd(p);
                    close();
                  },
                } as any,
                h('span', { className: 'cr-result-ic' }, ic(g.icon, 15)),
                h(
                  'div',
                  { className: 'cr-rtxt' },
                  h('div', { className: 'nm' }, p.name),
                  chosen.has(p.id) ? h('div', { className: 'meta' }, 'ya en la venta') : null
                ),
                h('span', { className: 'price' }, formatMoney(p.salePrice ?? 0))
              )
            ),
            results.length === 0
              ? h('div', { className: 'cr-menu-empty' }, 'Nada del catálogo coincide.')
              : null
          )
        )
      : null
  );
}

interface CounterSaleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

/**
 * Cobro rápido — venta de mostrador (diseño Claude Design "Cobro Rapido"). Drawer propio
 * (`.cr-drawer`, igual que "Registrar salida"), markup espejo de cobro-drawer.jsx con clases
 * `cr-*` de `styles/cobro-rapido.css` (colores, hover y animaciones del diseño). Cliente
 * opcional con buscador, productos por tipo, descuento del lote elegido (FEFO por defecto).
 */
export function CounterSaleDialog({ open, onOpenChange, onSaved }: CounterSaleDialogProps) {
  const groups = useSaleCatalog();
  const contacts = useContacts();
  const { settings: cfg } = useBillingSettings();
  const [cliente, setCliente] = useState<ContactOption | null>(null);
  const [method, setMethod] = useState('efectivo');
  const [items, setItems] = useState<LineState[]>([]);
  const [busy, setBusy] = useState(false);
  const [loteFor, setLoteFor] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCliente(null);
      setMethod('efectivo');
      setItems([]);
      setLoteFor(null);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loteFor) onOpenChange(false);
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loteFor, onOpenChange]);

  if (!open) return null;

  const seq = () => `l${Date.now()}${Math.round(items.length)}`;
  const addProduct = (p: SaleProduct) => {
    const reco = esLoteado(p) ? loteRecomendado(lotesFEFO(p.lotes)) : null;
    setItems((prev) => [
      ...prev,
      {
        key: seq() + prev.length,
        product: p,
        quantity: 1,
        unitPrice: Number(p.salePrice) || 0,
        loteNro: reco?.nro ?? null,
      },
    ]);
  };
  const patchLine = (key: string, patch: Partial<LineState>) =>
    setItems((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setItems((prev) => prev.filter((l) => l.key !== key));

  const faltaStock = (it: LineState): boolean =>
    esLoteado(it.product)
      ? repartir(lotesFEFO(it.product.lotes), it.quantity, it.loteNro).faltan > 0
      : it.quantity > it.product.stock;
  const haySinStock = items.some(faltaStock);
  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const valid = items.length > 0 && !haySinStock && total > 0;
  const caja = MEDIO_CAJA[method] ?? { caja: false, nota: '' };

  // Medios ofrecidos + ajuste del total según el medio (recargo por crédito / redondeo efectivo).
  const methods = enabledMethods(cfg);
  const methodEnabled =
    method === 'efectivo' ||
    (method === 'transferencia' && cfg.paymentsTransferencia) ||
    (method === 'debito' && cfg.paymentsDebito) ||
    (method === 'credito' && cfg.paymentsCredito);
  useEffect(() => {
    // Si el medio elegido se deshabilitó en settings, volver a efectivo (siempre disponible).
    if (!methodEnabled) setMethod('efectivo');
  }, [methodEnabled]);
  const surcharge = method === 'credito' ? creditSurcharge(total, cfg.paymentsCreditSurcharge) : 0;
  const roundingDelta =
    method === 'efectivo' && surcharge === 0 ? roundCash(total, cfg.cashRounding) - total : 0;
  const finalTotal = total + surcharge + roundingDelta;
  const adjustNote =
    surcharge > 0
      ? `Incluye recargo por crédito (${cfg.paymentsCreditSurcharge}%): +${formatMoney(surcharge)}`
      : roundingDelta !== 0
        ? `Redondeo de efectivo: ${roundingDelta > 0 ? '+' : '−'}${formatMoney(Math.abs(roundingDelta))}`
        : null;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await createCounterSale({
        contactId: cliente?.id ?? null,
        method,
        lines: items.map((it) => {
          const batches = esLoteado(it.product)
            ? repartir(lotesFEFO(it.product.lotes), it.quantity, it.loteNro).tramos.map((t) => ({
                batchId: t.batchId,
                quantity: t.take,
              }))
            : undefined;
          return {
            productId: it.product.id,
            description: it.product.name,
            quantity: String(it.quantity),
            unitPrice: String(it.unitPrice),
            batches,
          };
        }),
      });
      toast(
        'Venta cobrada',
        `${formatMoney(finalTotal)} · ${METHOD_LABEL[method] ?? method}`,
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

  // ── Item ──
  const lotePick = (it: LineState) => {
    const { tramos, faltan } = repartir(lotesFEFO(it.product.lotes), it.quantity, it.loteNro);
    const insuf = faltan > 0;
    let main: any,
      sub: any = null;
    if (insuf) main = h('span', { className: 'cr-lote-pick-main warn' }, 'Sin stock suficiente');
    else if (tramos.length > 1) {
      main = h('span', { className: 'cr-lote-pick-main' }, `Reparto entre ${tramos.length} lotes`);
      sub = tramos.map((t) => `${t.take} de ${t.nro}`).join(' + ');
    } else if (tramos.length === 1) {
      main = h('span', { className: 'cr-lote-pick-main' }, `Sale del lote ${tramos[0].nro}`);
      sub = tramos[0].estado.label;
    } else main = h('span', { className: 'cr-lote-pick-main' }, 'Elegir lote');
    return h(
      'button',
      {
        type: 'button',
        className: `cr-lote-pick ${insuf ? 'bad' : ''}`,
        onClick: () => setLoteFor(it.key),
      },
      h('span', { className: 'cr-lote-pick-ic' }, ic('Layers', 14)),
      h(
        'span',
        { className: 'cr-lote-pick-txt' },
        main,
        sub ? h('span', { className: 'cr-lote-pick-sub' }, sub) : null
      ),
      h('span', { className: 'cr-lote-pick-cta' }, ic('ArrowLeftRight', 13), ' Cambiar')
    );
  };

  const stockLine = (it: LineState) => {
    const insuf = it.quantity > it.product.stock;
    return h(
      'div',
      { className: `cr-stock-line ${insuf ? 'bad' : ''}` },
      ic(insuf ? 'TriangleAlert' : 'Box', 13),
      insuf
        ? `Sin stock: hay ${it.product.stock} ${UNIDAD}`
        : `Stock: ${it.product.stock.toLocaleString('es-AR')} ${UNIDAD} disponibles`
    );
  };

  const itemCard = (it: LineState) => {
    const insuf = faltaStock(it);
    return h(
      'div',
      { key: it.key, className: `cr-item ${insuf ? 'bad' : ''}` },
      h(
        'div',
        { className: 'cr-item-head' },
        h(
          'span',
          { className: `cr-type ${it.product.bucket}` },
          ic(BUCKET_ICON[it.product.bucket], 12),
          ` ${TYPE_TAG[it.product.bucket]}`
        ),
        h('span', { className: 'cr-item-name' }, it.product.name),
        h(
          'button',
          {
            className: 'cr-item-del',
            onClick: () => removeLine(it.key),
            title: 'Quitar de la venta',
          },
          ic('Trash2', 14)
        )
      ),
      h(
        'div',
        { className: 'cr-item-grid' },
        h(
          'label',
          { className: 'cr-mini' },
          h('span', null, 'Cantidad'),
          h(
            'div',
            { className: 'cr-step' },
            h(
              'button',
              {
                type: 'button',
                onClick: () => patchLine(it.key, { quantity: Math.max(1, it.quantity - 1) }),
                disabled: it.quantity <= 1,
                'aria-label': 'Menos',
              } as any,
              ic('Minus', 15)
            ),
            h('input', {
              inputMode: 'numeric',
              value: it.quantity.toLocaleString('es-AR'),
              onChange: (e: any) => {
                const n = parseInt(String(e.target.value).replace(/\D/g, ''), 10);
                patchLine(it.key, { quantity: Number.isFinite(n) && n > 0 ? n : 1 });
              },
            } as any),
            h(
              'button',
              {
                type: 'button',
                onClick: () => patchLine(it.key, { quantity: it.quantity + 1 }),
                'aria-label': 'Más',
              } as any,
              ic('Plus', 15)
            )
          )
        ),
        h(
          'label',
          { className: 'cr-mini' },
          h('span', null, 'Precio unit.'),
          h(
            'div',
            { className: 'cr-num-pre' },
            h('span', null, '$'),
            h('input', {
              className: 'cr-num',
              inputMode: 'numeric',
              placeholder: '0',
              value: it.unitPrice ? it.unitPrice.toLocaleString('es-AR') : '',
              onChange: (e: any) => {
                const n = parseInt(String(e.target.value).replace(/\D/g, ''), 10);
                patchLine(it.key, { unitPrice: Number.isFinite(n) ? n : 0 });
              },
            } as any)
          )
        )
      ),
      esLoteado(it.product) ? lotePick(it) : stockLine(it),
      h(
        'div',
        { className: 'cr-item-calc' },
        h(
          'span',
          { className: 'cr-calc-formula' },
          h('strong', null, it.quantity.toLocaleString('es-AR')),
          ' × ',
          h('strong', null, formatMoney(it.unitPrice))
        ),
        h('span', { className: 'cr-calc-sub' }, formatMoney(it.quantity * it.unitPrice))
      )
    );
  };

  const editing = items.find((it) => it.key === loteFor);

  return h(
    'div',
    { className: 'cr' },
    h('div', { className: 'cr-scrim', onClick: () => onOpenChange(false) }),
    h(
      'aside',
      { className: 'cr-drawer', role: 'dialog', 'aria-label': 'Cobro rápido' } as any,
      // Header
      h(
        'div',
        { className: 'cr-drawer-head' },
        h(
          'div',
          { className: 'cr-head-top' },
          h('div', { className: 'cr-head-ic' }, ic('Zap', 18)),
          h(
            'button',
            {
              className: 'cr-iconbtn',
              onClick: () => onOpenChange(false),
              'aria-label': 'Cerrar',
            } as any,
            ic('X', 16)
          )
        ),
        h('h2', { className: 'cr-drawer-title' }, 'Cobro rápido'),
        h(
          'p',
          { className: 'cr-drawer-sub' },
          'Venta de mostrador, sin consulta. Se cobra en el momento y entra a la caja del día.'
        )
      ),
      // Body
      h(
        'div',
        { className: 'cr-drawer-body' },
        h(
          'div',
          { className: 'cr-fld' },
          h(
            'span',
            { className: 'cr-label' },
            'Cliente ',
            h('span', { className: 'cr-opt' }, '· opcional')
          ),
          h(ClienteField, { contacts, value: cliente, onChange: setCliente })
        ),
        h(
          'div',
          { className: 'cr-fld' },
          h(
            'span',
            { className: 'cr-label' },
            'Productos ',
            h('span', { className: 'cr-opt' }, '· elegí por tipo')
          ),
          groups.length > 0
            ? h(CategoryAdder, {
                groups,
                chosen: new Set(items.map((it) => it.product.id)),
                onAdd: addProduct,
              })
            : h('p', { className: 'cr-fld-hint' }, 'No hay catálogo disponible.'),
          items.length > 0
            ? h('div', { className: 'cr-items' }, ...items.map(itemCard))
            : h(
                'div',
                { className: 'cr-empty' },
                h('div', { className: 'cr-empty-ic' }, ic('Zap', 20)),
                h('div', { className: 'cr-empty-t' }, 'Empezá la venta'),
                h(
                  'div',
                  { className: 'cr-empty-s' },
                  'Elegí medicamentos, vacunas o insumos del catálogo. Se van sumando acá.'
                )
              )
        ),
        items.length > 0
          ? h(
              'div',
              { className: 'cr-fld' },
              h('span', { className: 'cr-label' }, 'Medio de cobro'),
              h(
                'span',
                { className: 'cr-fld-hint' },
                'Solo el efectivo entra a la caja física del día.'
              ),
              h(
                'div',
                { className: 'cr-medios' },
                ...methods.map((m) =>
                  h(
                    'button',
                    {
                      key: m.value,
                      type: 'button',
                      className: `cr-medio ${method === m.value ? 'sel' : ''}`,
                      onClick: () => setMethod(m.value),
                    },
                    ic(MEDIO_ICON[m.value] ?? 'Wallet', 16),
                    h('span', null, m.label)
                  )
                )
              )
            )
          : null
      ),
      // Footer
      h(
        'div',
        { className: 'cr-drawer-foot' },
        h(
          'div',
          { className: 'cr-foot-total' },
          h(
            'span',
            { className: 'cr-foot-label' },
            'Total a cobrar',
            items.length > 0
              ? h(
                  'span',
                  { className: 'cr-foot-cnt' },
                  ` · ${items.length} ${items.length === 1 ? 'producto' : 'productos'}`
                )
              : null
          ),
          h(
            'span',
            { className: `cr-foot-amt ${haySinStock ? 'danger' : ''}` },
            formatMoney(finalTotal)
          )
        ),
        adjustNote && !haySinStock
          ? h(
              'div',
              { className: 'cr-foot-destino' },
              ic('Percent', 13),
              h('span', null, adjustNote)
            )
          : null,
        items.length > 0
          ? haySinStock
            ? h(
                'div',
                { className: 'cr-foot-destino bad' },
                ic('TriangleAlert', 14),
                ' Revisá el stock de los productos marcados antes de cobrar.'
              )
            : caja.caja
              ? h(
                  'div',
                  { className: 'cr-foot-destino caja' },
                  ic('Wallet', 14),
                  h('span', null, 'Entra a la caja del día')
                )
              : h(
                  'div',
                  { className: 'cr-foot-destino' },
                  ic(MEDIO_ICON[method] ?? 'Wallet', 14),
                  h('span', null, `${METHOD_LABEL[method] ?? method} · no toca la caja`),
                  h('span', { className: 'cr-foot-flow muted' }, caja.nota)
                )
          : null,
        h(
          'div',
          { className: 'cr-foot-actions' },
          h(
            UI.Button,
            { variant: 'outline', disabled: busy, onClick: () => onOpenChange(false) } as any,
            'Cancelar'
          ),
          h(
            UI.Button,
            {
              variant: 'brand',
              disabled: busy || !valid,
              onClick: () => void save(),
              style: { flex: 1 },
            } as any,
            ic('Check', 15),
            valid ? ` Confirmar cobro · ${formatMoney(finalTotal)}` : ' Confirmar cobro'
          )
        )
      )
    ),
    editing
      ? h(LoteEditor, {
          productName: editing.product.name,
          unidad: UNIDAD,
          bucketIcon: editing.product.bucket === 'vacc' ? 'Syringe' : 'Pill',
          lotes: editing.product.lotes,
          cant: editing.quantity,
          loteNro: editing.loteNro,
          onChange: (nro: string) => patchLine(editing.key, { loteNro: nro }),
          onClose: () => setLoteFor(null),
        })
      : null
  );
}
