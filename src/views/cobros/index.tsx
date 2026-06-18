import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { AccountDetailDrawer } from '../../components/AccountDetailDrawer.js';
import { CounterSaleDialog } from '../../components/CounterSaleDialog.js';
import { ACCOUNT_SOURCE_LABEL } from '../../constants.js';
import { useBillingAccounts } from '../../data/useBillingAccounts.js';
import type { BillingAccountRow } from '../../data/useBillingAccounts.js';
import { formatMoney, formatDate } from '../../utils/money.js';

const React = getHostReact();
const { useState, useMemo, useEffect } = React;
const h = React.createElement;

type RangeFilter = 'mes' | '30d' | 'todas';
type PayFilter = 'todas' | 'pendiente' | 'pagada';

function daysAgoKey(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() - days);
  return t.toISOString().slice(0, 10);
}
function monthStartKey(): string {
  return new Date().toISOString().slice(0, 8) + '01';
}

export function CobrosView(props: { openAccountId?: string } = {}) {
  const [range, setRange] = useState<RangeFilter>('mes');
  const [payFilter, setPayFilter] = useState<PayFilter>('todas');
  const [search, setSearch] = useState('');
  // Deep-link: si llegamos con `openAccountId` (ej. botón "Cobrar" de una consulta),
  // abrimos directo el checkout de esa cuenta.
  const [detailId, setDetailId] = useState<string | null>(props.openAccountId ?? null);
  const [showSale, setShowSale] = useState(false);

  useEffect(() => {
    if (props.openAccountId) setDetailId(props.openAccountId);
  }, [props.openAccountId]);

  // Rango server-side (escalable): el filtro de fecha se aplica en la base.
  const apiRange = useMemo(() => {
    if (range === 'todas') return {};
    return { from: range === 'mes' ? monthStartKey() : daysAgoKey(30) };
  }, [range]);

  const { rows, loading, error, reload } = useBillingAccounts(apiRange);

  const filtered = useMemo(() => {
    let result = rows;
    if (payFilter === 'pendiente')
      result = result.filter((r) => r.paymentStatus === 'unpaid' || r.paymentStatus === 'partial');
    else if (payFilter === 'pagada') result = result.filter((r) => r.paymentStatus === 'paid');
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.clientName.toLowerCase().includes(q) || (r.petName ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, payFilter, search]);

  const detailRow = detailId ? rows.find((r) => r.id === detailId) : undefined;

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
        key: 'origen',
        header: 'Origen',
        render: (r: BillingAccountRow) =>
          h(UI.Badge, { variant: 'secondary' } as any, ACCOUNT_SOURCE_LABEL[r.source] ?? r.source),
      },
      {
        // Estado de PAGO (derivado de los cobros): lo accionable para el mostrador.
        key: 'pago',
        header: 'Pago',
        render: (r: BillingAccountRow) => {
          if (r.paymentStatus === 'na') return h('span', { className: 'text-cg-text-muted' }, '—');
          if (r.paymentStatus === 'paid') return h(UI.Badge, { variant: 'paid' } as any, 'Pagada');
          if (r.paymentStatus === 'partial')
            return h(
              UI.Badge,
              { variant: 'orange' } as any,
              `Parcial · saldo ${formatMoney(r.balance)}`
            );
          return h(UI.Badge, { variant: 'danger-soft' } as any, 'Impaga');
        },
      },
      {
        key: 'total',
        header: 'Total',
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
          h('h1', { className: 'text-2xl font-bold text-cg-text' }, 'Cobros'),
          h(
            'p',
            { className: 'text-sm text-cg-text-muted mt-1' },
            'Cuentas de la visita — consultas, vacunas y productos, todo en un solo cobro.'
          )
        ),
        h(
          UI.Button,
          { variant: 'brand', size: 'sm', onClick: () => setShowSale(true) } as any,
          h(UI.DynamicIcon, { icon: 'Plus', size: 14 } as any),
          ' Cobro rápido'
        )
      ),

      h(
        'div',
        { className: 'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm' },
        h(UI.DataTable, {
          data: filtered,
          rowKey: (r: BillingAccountRow) => r.id,
          loading,
          error,
          onRetry: reload,
          onRowClick: (r: BillingAccountRow) => setDetailId(r.id),
          columns,
          searchPlaceholder: 'Cliente o mascota',
          searchValue: search,
          onSearchChange: setSearch,
          filterSections: [
            {
              label: 'Pago',
              options: [
                { value: 'todas', label: 'Todas' },
                { value: 'pendiente', label: 'Con saldo' },
                { value: 'pagada', label: 'Saldadas' },
              ],
              value: payFilter,
              onChange: (v: string) => setPayFilter(v as PayFilter),
            },
            {
              label: 'Rango',
              options: [
                { value: 'mes', label: 'Este mes' },
                { value: '30d', label: 'Últimos 30 días' },
                { value: 'todas', label: 'Todas' },
              ],
              value: range,
              onChange: (v: string) => setRange(v as RangeFilter),
            },
          ],
          emptyState: {
            title: 'Sin cobros en este rango',
            description: 'Las cuentas se crean al cobrar servicios o aplicar vacunas.',
            icon: h(UI.DynamicIcon, { icon: 'Receipt', size: 32 } as any),
            filteredTitle: 'No se encontraron cobros con los filtros aplicados',
            filteredDescription: 'Probá cambiar el rango o la búsqueda.',
          },
          skeletonRows: 8,
        } as any)
      )
    ),

    // Detalle de la cuenta
    h(AccountDetailDrawer, {
      accountId: detailId,
      subtitle: detailRow
        ? [detailRow.clientName, detailRow.petName].filter(Boolean).join(' · ')
        : undefined,
      onClose: () => setDetailId(null),
      onChanged: () => void reload(),
    }),

    // Venta de mostrador (venta rápida sin consulta)
    h(CounterSaleDialog, {
      open: showSale,
      onOpenChange: (v: boolean) => setShowSale(v),
      onSaved: () => void reload(),
    })
  );
}
