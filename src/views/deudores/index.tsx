import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { useDebtors } from '../../data/useDebtors.js';
import type { DebtorRow } from '../../data/useDebtors.js';
import { formatMoney } from '../../utils/money.js';

const React = getHostReact();
const { useMemo } = React;
const h = React.createElement;

const DAY_MS = 86400000;

/** Días desde una fecha ISO. Tolera vacío/inválido. */
function daysSince(iso: string): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / DAY_MS));
}
function ageLabel(iso: string): string {
  const d = daysSince(iso);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

export function DeudoresView() {
  const { rows, loading, error, reload } = useDebtors();

  const totalDebt = useMemo(() => rows.reduce((s, r) => s + Number(r.debt || 0), 0), [rows]);

  const columns = useMemo(
    () => [
      {
        key: 'cliente',
        header: 'Cliente',
        render: (r: DebtorRow) => h('span', { className: 'font-medium' }, r.clientName),
      },
      {
        key: 'cuentas',
        header: 'Cuentas',
        render: (r: DebtorRow) =>
          h('span', { className: 'text-cg-text-muted' }, String(r.accountCount)),
      },
      {
        // Antigüedad del saldo: en AR la inflación licúa el fiado viejo → resaltar si > 30 días.
        key: 'antiguedad',
        header: 'Antigüedad',
        render: (r: DebtorRow) =>
          h(
            'span',
            {
              className:
                daysSince(r.oldestOpenedAt) > 30
                  ? 'text-cg-danger font-medium'
                  : 'text-cg-text-muted',
            },
            ageLabel(r.oldestOpenedAt)
          ),
      },
      {
        key: 'saldo',
        header: 'Saldo',
        className: 'text-right',
        render: (r: DebtorRow) =>
          h('span', { className: 'font-mono font-semibold text-cg-danger' }, formatMoney(r.debt)),
      },
    ],
    []
  );

  return h(
    'div',
    { className: 'font-inter min-h-screen bg-cg-bg-secondary p-6' },
    h(
      'div',
      { className: 'w-full flex flex-col gap-6' },

      h(
        'div',
        { className: 'flex items-end justify-between gap-4' },
        h(
          'div',
          null,
          h('h1', { className: 'text-2xl font-bold text-cg-text' }, 'Deudores'),
          h(
            'p',
            { className: 'text-sm text-cg-text-muted mt-1' },
            'Clientes con saldo pendiente — quién te debe y desde cuándo.'
          )
        ),
        rows.length > 0 &&
          h(
            'div',
            { className: 'text-right' },
            h(
              'div',
              { className: 'text-xs text-cg-text-muted uppercase tracking-wide' },
              'Total adeudado'
            ),
            h(
              'div',
              { className: 'font-mono text-xl font-bold text-cg-danger' },
              formatMoney(totalDebt)
            )
          )
      ),

      h(
        'div',
        { className: 'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm' },
        h(UI.DataTable, {
          data: rows,
          rowKey: (r: DebtorRow) => r.contactId ?? r.clientName,
          loading,
          error,
          onRetry: reload,
          columns,
          emptyState: {
            title: 'Nadie te debe nada',
            description: 'Todas las cuentas están saldadas.',
            icon: h(UI.DynamicIcon, { icon: 'CheckCircle2', size: 32 } as any),
          },
          skeletonRows: 6,
        } as any)
      )
    )
  );
}
