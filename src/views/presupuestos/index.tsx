import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { PresupuestoDrawer } from '../../components/PresupuestoDrawer.js';
import { useBillingAccounts } from '../../data/useBillingAccounts.js';
import type { BillingAccountRow } from '../../data/useBillingAccounts.js';
import { formatMoney, formatDate } from '../../utils/money.js';

const React = getHostReact();
const { useState, useMemo, useCallback } = React;
const h = React.createElement;

export function PresupuestosView() {
  // draft=true → reusa el mismo hook/acción que Cuentas pero trae sólo borradores.
  const { rows, loading, error, reload } = useBillingAccounts(undefined, true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const detailRow = detailId ? rows.find((r) => r.id === detailId) : undefined;

  const nuevo = useCallback(async () => {
    setCreating(true);
    try {
      const acc = await actions.execute<{ id: string }>('billing.accounts.createDraft', {});
      await reload();
      if (acc?.id) setDetailId(acc.id);
    } catch {
      // sin-op: el botón se rehabilita y el usuario puede reintentar
    } finally {
      setCreating(false);
    }
  }, [reload]);

  const columns = useMemo(
    () => [
      {
        key: 'fecha',
        header: 'Fecha',
        render: (r: BillingAccountRow) =>
          h('span', { className: 'font-mono' }, formatDate(r.openedAt)),
      },
      {
        key: 'cliente',
        header: 'Cliente',
        render: (r: BillingAccountRow) =>
          h(
            'div',
            null,
            h('div', { className: 'font-medium' }, r.clientName),
            r.petName && h('div', { className: 'text-xs text-cg-text-muted mt-0.5' }, r.petName)
          ),
      },
      {
        key: 'total',
        header: 'Total estimado',
        className: 'text-right',
        render: (r: BillingAccountRow) =>
          h('span', { className: 'font-mono font-semibold' }, formatMoney(r.total)),
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
        { className: 'flex items-end justify-between gap-4 flex-wrap' },
        h(
          'div',
          null,
          h('h1', { className: 'text-2xl font-bold text-cg-text' }, 'Presupuestos'),
          h(
            'p',
            { className: 'text-sm text-cg-text-muted mt-1' },
            'Cotizaciones en borrador — al convertirlas pasan a cobro sin recargar nada.'
          )
        ),
        h(
          UI.Button,
          { variant: 'brand', disabled: creating, onClick: () => void nuevo() } as any,
          h(UI.DynamicIcon, { icon: 'Plus', size: 14 } as any),
          ' Nuevo presupuesto'
        )
      ),

      h(
        'div',
        { className: 'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm' },
        h(UI.DataTable, {
          data: rows,
          rowKey: (r: BillingAccountRow) => r.id,
          loading,
          error,
          onRetry: reload,
          onRowClick: (r: BillingAccountRow) => setDetailId(r.id),
          columns,
          emptyState: {
            title: 'Sin presupuestos',
            description: 'Creá uno con "Nuevo presupuesto" para cotizar antes de atender.',
            icon: h(UI.DynamicIcon, { icon: 'FileText', size: 32 } as any),
          },
          skeletonRows: 6,
        } as any)
      )
    ),

    h(PresupuestoDrawer, {
      accountId: detailId,
      subtitle:
        detailRow && detailRow.clientName !== '—'
          ? [detailRow.clientName, detailRow.petName].filter(Boolean).join(' · ')
          : undefined,
      onClose: () => setDetailId(null),
      onChanged: () => void reload(),
    })
  );
}
