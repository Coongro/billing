import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from '../../constants.js';
import type { CajaExpense } from '../../data/useExpenses.js';
import { localDayKey, hhmm } from '../../utils/day.js';
import { formatMoney, formatDate } from '../../utils/money.js';
import { toast } from '../../utils/toast.js';

const React = getHostReact();
const { useState, useEffect } = React;
const h = React.createElement;

const SERIF = 'font-serif font-black tracking-tight';

/** Icono Lucide por categoría de egreso */
const CAT_ICON: Record<string, string> = {
  retiro: 'HandCoins',
  proveedor: 'Truck',
  insumos: 'Package',
  otro: 'Tag',
};

interface ExpensesSectionProps {
  /** Día seleccionado 'YYYY-MM-DD' — para fechar el egreso en ese día. */
  day: string;
  rows: CajaExpense[];
  /** Neto de caja actual (para el preview en vivo del drawer). */
  neto: number;
  reload: () => Promise<void>;
}

/** Parsea solo dígitos de un string a entero. */
function digits(v: string): number {
  return parseInt(v.replace(/\D/g, ''), 10) || 0;
}

/**
 * Egresos del día: encabezado de sección, lista (con anular) y un drawer lateral
 * "Registrar egreso" (panel a la derecha). Las mutaciones llaman a las actions de
 * billing y refrescan vía `reload` del caller.
 */
export function ExpensesSection({ day, rows, neto, reload }: ExpensesSectionProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Cerrar el drawer con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openDrawer = () => {
    setAmount('');
    setCategory(null);
    setNotes('');
    setOpen(true);
  };

  const amountNum = digits(amount);
  const valid = amountNum > 0 && !!category;

  const register = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      // Hoy → server usa now(); día pasado → mediodía UTC de ese día.
      const isToday = day === localDayKey(new Date());
      const spentAt = isToday ? undefined : `${day}T12:00:00.000Z`;
      await actions.execute('billing.expenses.record', {
        amount: String(amountNum),
        category,
        spentAt,
        notes: notes.trim() || undefined,
      });
      toast('Egreso registrado', `Se registró ${formatMoney(amountNum)}.`, 'success');
      setOpen(false);
      await reload();
    } catch {
      toast('No se pudo registrar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await actions.execute('billing.expenses.delete', { id });
      await reload();
    } catch {
      toast('No se pudo anular', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const isToday = day === localDayKey(new Date());
  const dayWord = isToday ? 'hoy' : `del ${formatDate(day)}`;
  const dateLabel = isToday ? `Hoy · ${formatDate(day)}` : formatDate(day);
  const netoNuevo = neto - amountNum;

  // ── Encabezado de sección + acción ──
  const secLabel = h(
    'div',
    { className: 'flex items-center gap-2 mb-3' },
    h(
      'span',
      { className: 'flex-shrink-0 inline-flex items-center text-cg-text-muted' },
      h(UI.DynamicIcon, { icon: 'ArrowUpFromLine', size: 14 })
    ),
    h(
      'span',
      { className: 'text-[11px] font-bold uppercase tracking-[0.08em] text-cg-text-secondary' },
      `Egresos ${dayWord}`
    ),
    rows.length > 0 &&
      h(
        'span',
        {
          className:
            'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-cg-bg-hover text-cg-text-muted text-[11px] font-semibold',
        },
        String(rows.length)
      ),
    h(
      'button',
      {
        onClick: openDrawer,
        className:
          'ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cg-border bg-cg-surface text-[13px] font-medium text-cg-text transition-colors hover:bg-cg-bg-hover',
      },
      h(UI.DynamicIcon, { icon: 'Plus', size: 14, className: 'text-cg-text-muted' }),
      'Registrar egreso'
    )
  );

  // ── Lista de egresos ──
  const list =
    rows.length === 0
      ? h(
          'div',
          { className: 'rounded-xl border border-cg-border bg-cg-surface' },
          h(
            'div',
            { className: 'px-4 py-8 text-center text-sm text-cg-text-muted' },
            `Sin egresos ${dayWord}.`
          )
        )
      : h(
          'div',
          { className: 'rounded-xl border border-cg-border bg-cg-surface px-5' },
          ...rows.map((e, i) =>
            h(
              'div',
              {
                key: e.id,
                className: `group flex items-center gap-3.5 py-3.5 ${
                  i > 0 ? 'border-t border-cg-border' : ''
                }`,
              },
              h(
                'span',
                {
                  className:
                    'w-9 h-9 rounded-lg flex-shrink-0 inline-flex items-center justify-center bg-cg-bg-hover border border-cg-border text-cg-text-secondary',
                },
                h(UI.DynamicIcon, { icon: CAT_ICON[e.category] ?? 'Tag', size: 17 })
              ),
              h(
                'div',
                { className: 'flex flex-col gap-0.5 flex-1 min-w-0' },
                h(
                  'span',
                  { className: 'text-sm font-medium text-cg-text' },
                  EXPENSE_CATEGORY_LABEL[e.category] ?? e.category,
                  e.notes
                    ? h('span', { className: 'font-normal text-cg-text-muted' }, ` · ${e.notes}`)
                    : null
                ),
                h(
                  'span',
                  {
                    className: 'text-xs text-cg-text-muted',
                    style: { fontVariantNumeric: 'tabular-nums' },
                  },
                  hhmm(e.spentAt)
                )
              ),
              h(
                'span',
                {
                  className: 'text-[15px] font-medium text-cg-text',
                  style: { fontVariantNumeric: 'tabular-nums' },
                },
                `− ${formatMoney(e.amount)}`
              ),
              h(
                'button',
                {
                  disabled: busy,
                  'aria-label': 'Anular egreso',
                  onClick: () => void remove(e.id),
                  className:
                    'w-7 h-7 rounded-md inline-flex items-center justify-center text-cg-text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:bg-cg-red-soft hover:text-cg-red',
                },
                h(UI.DynamicIcon, { icon: 'Trash2', size: 14 })
              )
            )
          )
        );

  // ── Drawer "Registrar egreso" (panel a la derecha) ──
  const drawer = open
    ? h(
        React.Fragment,
        null,
        h('div', {
          onClick: () => setOpen(false),
          style: { position: 'fixed', inset: 0, background: 'rgba(31,31,31,0.30)', zIndex: 60 },
        }),
        h(
          'aside',
          {
            role: 'dialog',
            'aria-label': 'Registrar egreso',
            className: 'bg-cg-surface flex flex-col',
            style: {
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 444,
              maxWidth: '92vw',
              zIndex: 61,
              borderLeft: '1px solid var(--cg-border)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
            },
          },
          // Header
          h(
            'div',
            { className: 'px-6 pt-5 pb-4 border-b border-cg-border flex-shrink-0' },
            h(
              'div',
              { className: 'flex items-center justify-between mb-3.5' },
              h(
                'span',
                {
                  className:
                    'w-9 h-9 rounded-lg inline-flex items-center justify-center bg-cg-bg-hover border border-cg-border text-cg-text-secondary',
                },
                h(UI.DynamicIcon, { icon: 'ArrowUpFromLine', size: 18 })
              ),
              h(
                'button',
                {
                  onClick: () => setOpen(false),
                  'aria-label': 'Cerrar',
                  className:
                    'w-8 h-8 rounded-md inline-flex items-center justify-center border border-cg-border bg-cg-surface text-cg-text-secondary transition-colors hover:bg-cg-bg-hover',
                },
                h(UI.DynamicIcon, { icon: 'X', size: 16 })
              )
            ),
            h(
              'h2',
              { className: `${SERIF} text-2xl leading-none m-0 text-cg-text` },
              'Registrar egreso'
            ),
            h(
              'div',
              { className: 'flex items-center gap-1.5 mt-2 text-xs text-cg-text-muted' },
              h(UI.DynamicIcon, { icon: 'Banknote', size: 13, className: 'text-cg-text-muted' }),
              `Salida de efectivo · ${dateLabel}`
            )
          ),
          // Body
          h(
            'div',
            {
              className: 'flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5',
              style: { minHeight: 0 },
            },
            // Monto
            h(
              'div',
              { className: 'flex flex-col' },
              h('span', { className: 'text-xs font-medium text-cg-text mb-2' }, 'Monto'),
              h(
                'div',
                { className: 'relative' },
                h(
                  'span',
                  {
                    className:
                      'absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-cg-text-muted',
                  },
                  '$'
                ),
                h('input', {
                  inputMode: 'numeric',
                  placeholder: '0',
                  autoFocus: true,
                  value: amount ? amountNum.toLocaleString('es-AR') : '',
                  onChange: (e: { target: { value: string } }) =>
                    setAmount(e.target.value.replace(/\D/g, '')),
                  onKeyDown: (e: { key: string }) => {
                    if (e.key === 'Enter') void register();
                  },
                  className:
                    'w-full rounded-md border border-cg-border bg-cg-surface text-cg-text pl-9 pr-3.5 py-3 text-2xl font-medium outline-none focus:border-cg-gold-deep',
                  style: { fontVariantNumeric: 'tabular-nums' },
                })
              )
            ),
            // Tipo
            h(
              'div',
              { className: 'flex flex-col' },
              h('span', { className: 'text-xs font-medium text-cg-text mb-2' }, 'Tipo'),
              h(
                'div',
                { className: 'grid grid-cols-2 gap-2' },
                ...EXPENSE_CATEGORIES.map((c) =>
                  h(
                    'button',
                    {
                      key: c.value,
                      onClick: () => setCategory(c.value),
                      className: `flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-xs font-medium border transition-colors ${
                        category === c.value
                          ? 'bg-cg-gold-soft border-cg-gold-deep text-cg-gold-deep'
                          : 'bg-cg-surface border-cg-border text-cg-text-secondary hover:bg-cg-bg-hover'
                      }`,
                    },
                    h(UI.DynamicIcon, { icon: CAT_ICON[c.value] ?? 'Tag', size: 19 }),
                    h('span', null, c.label)
                  )
                )
              )
            ),
            // Nota
            h(
              'div',
              { className: 'flex flex-col' },
              h(
                'span',
                { className: 'text-xs font-medium text-cg-text mb-2' },
                'Nota ',
                h('span', { className: 'font-normal text-cg-text-muted' }, '· opcional')
              ),
              h(UI.Input, {
                value: notes,
                onChange: (e: { target: { value: string } }) => setNotes(e.target.value),
                placeholder: 'Ej. Alimento, gasas, jeringas',
              })
            )
          ),
          // Footer — preview del neto
          h(
            'div',
            { className: 'border-t border-cg-border bg-cg-bg-hover px-6 py-4 flex-shrink-0' },
            h(
              'div',
              { className: 'flex items-center justify-between gap-3 mb-3.5' },
              h(
                'span',
                {
                  className:
                    'text-[11px] font-bold uppercase tracking-[0.06em] text-cg-text-secondary',
                },
                'Neto de caja'
              ),
              h(
                'span',
                {
                  className: 'flex items-center gap-2',
                  style: { fontVariantNumeric: 'tabular-nums' },
                },
                h('span', { className: 'text-sm text-cg-text-muted' }, formatMoney(neto)),
                amountNum > 0 &&
                  h(
                    React.Fragment,
                    null,
                    h(UI.DynamicIcon, {
                      icon: 'ArrowRight',
                      size: 14,
                      className: 'text-cg-text-muted',
                    }),
                    h(
                      'span',
                      { className: `${SERIF} text-xl text-cg-text leading-none` },
                      formatMoney(netoNuevo)
                    )
                  )
              )
            ),
            h(
              'div',
              { className: 'flex gap-2' },
              h(
                UI.Button,
                { variant: 'outline', onClick: () => setOpen(false), disabled: busy },
                'Cancelar'
              ),
              h(
                UI.Button,
                {
                  variant: 'brand',
                  onClick: () => void register(),
                  disabled: !valid || busy,
                  className: 'flex-1 gap-1.5',
                },
                h(UI.DynamicIcon, { icon: 'ArrowUpFromLine', size: 14 }),
                'Registrar egreso'
              )
            )
          )
        )
      )
    : null;

  return h('div', null, secLabel, list, drawer);
}
