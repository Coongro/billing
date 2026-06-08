import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from '../../constants.js';
import type { CajaExpense } from '../../data/useExpenses.js';
import { localDayKey, hhmm } from '../../utils/day.js';
import { formatMoney } from '../../utils/money.js';
import { toast } from '../../utils/toast.js';

const React = getHostReact();
const { useState } = React;
const h = React.createElement;

interface ExpensesSectionProps {
  /** Día seleccionado 'YYYY-MM-DD' — para fechar el egreso en ese día. */
  day: string;
  rows: CajaExpense[];
  total: number;
  reload: () => Promise<void>;
}

/**
 * Egresos del día: total, alta inline ("Registrar egreso") y lista con anular. Las
 * mutaciones llaman a las actions de billing y refrescan vía `reload` del caller (mismo
 * patrón que el drawer de cobro).
 */
export function ExpensesSection({ day, rows, total, reload }: ExpensesSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('retiro');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const openForm = () => {
    setAmount('');
    setCategory('retiro');
    setNotes('');
    setShowForm(true);
  };

  const register = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast('Monto inválido', 'Ingresá un monto mayor a 0.', 'info');
      return;
    }
    setBusy(true);
    try {
      // Si el día seleccionado es hoy, dejamos que el server use now() (hora real). Si es un
      // día pasado, fechamos el egreso a mediodía UTC de ese día para que caiga en ese día.
      const isToday = day === localDayKey(new Date());
      const spentAt = isToday ? undefined : `${day}T12:00:00.000Z`;
      await actions.execute('billing.expenses.record', {
        amount: String(amt),
        category,
        spentAt,
        notes: notes.trim() || undefined,
      });
      toast('Egreso registrado', `Se registró ${formatMoney(amt)}.`, 'success');
      setShowForm(false);
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

  return h(
    'div',
    { className: 'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm flex flex-col gap-4' },

    // Header + acción
    h(
      'div',
      { className: 'flex items-center justify-between gap-4' },
      h(
        'div',
        null,
        h('div', { className: 'text-xs text-cg-text-muted uppercase tracking-wide' }, 'Egresos'),
        h(
          'div',
          { className: 'font-mono text-xl font-bold text-cg-danger mt-0.5' },
          total > 0 ? `− ${formatMoney(total)}` : formatMoney(0)
        )
      ),
      !showForm &&
        h(
          UI.Button,
          { variant: 'outline', size: 'sm', onClick: openForm } as any,
          h(UI.DynamicIcon, { icon: 'Minus', size: 13 } as any),
          ' Registrar egreso'
        )
    ),

    // Form inline
    showForm &&
      h(
        'div',
        { className: 'flex flex-col gap-3 rounded-lg border border-cg-border p-4' },
        h(
          'div',
          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
          h(
            'div',
            null,
            h(
              'label',
              { className: 'block text-xs font-semibold text-cg-text-muted mb-1' },
              'Monto'
            ),
            h(UI.Input, {
              type: 'number',
              size: 'sm',
              min: 0,
              step: '0.01',
              value: amount,
              onChange: (e: any) => setAmount(e.target.value),
            } as any)
          ),
          h(
            'div',
            null,
            h(
              'label',
              { className: 'block text-xs font-semibold text-cg-text-muted mb-1' },
              'Nota (opcional)'
            ),
            h(UI.Input, {
              size: 'sm',
              value: notes,
              onChange: (e: any) => setNotes(e.target.value),
              placeholder: 'Ej: pago a proveedor X',
            } as any)
          )
        ),
        h(
          'div',
          null,
          h('label', { className: 'block text-xs font-semibold text-cg-text-muted mb-1' }, 'Tipo'),
          h(UI.SegmentedControl, {
            value: category,
            options: EXPENSE_CATEGORIES,
            onChange: (v: string) => setCategory(v),
            size: 'sm',
            'aria-label': 'Tipo de egreso',
          } as any)
        ),
        h(
          'div',
          { className: 'flex gap-2 justify-end flex-wrap' },
          h(
            UI.Button,
            {
              variant: 'ghost',
              size: 'sm',
              disabled: busy,
              onClick: () => setShowForm(false),
            } as any,
            'Cancelar'
          ),
          h(
            UI.Button,
            { variant: 'brand', size: 'sm', disabled: busy, onClick: () => void register() } as any,
            'Registrar egreso'
          )
        )
      ),

    // Lista de egresos del día
    rows.length > 0 &&
      h(
        'div',
        { className: 'flex flex-col gap-2' },
        ...rows.map((e) =>
          h(
            'div',
            {
              key: e.id,
              className:
                'flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-cg-border',
            },
            h(
              'div',
              { className: 'min-w-0' },
              h(
                'div',
                { className: 'flex items-center gap-2 text-sm text-cg-text' },
                h(
                  UI.Badge,
                  { variant: 'secondary' } as any,
                  EXPENSE_CATEGORY_LABEL[e.category] ?? e.category
                ),
                e.notes && h('span', { className: 'text-cg-text-muted truncate' }, e.notes)
              ),
              h(
                'div',
                { className: 'text-xs text-cg-text-muted mt-0.5 font-mono' },
                hhmm(e.spentAt)
              )
            ),
            h(
              'div',
              { className: 'flex items-center gap-2' },
              h(
                'span',
                { className: 'font-mono font-semibold text-cg-text' },
                `− ${formatMoney(e.amount)}`
              ),
              h(
                UI.IconButton,
                {
                  variant: 'ghost',
                  size: 'sm',
                  disabled: busy,
                  'aria-label': 'Anular egreso',
                  onClick: () => void remove(e.id),
                } as any,
                h(UI.DynamicIcon, { icon: 'Trash2', size: 13 } as any)
              )
            )
          )
        )
      )
  );
}
