import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { AccountDetailDrawer } from '../../components/AccountDetailDrawer.js';
import { useBillingAccounts } from '../../data/useBillingAccounts.js';
import type { BillingAccountRow } from '../../data/useBillingAccounts.js';
import { formatMoney, formatDate } from '../../utils/money.js';

const React = getHostReact();
const { useState, useMemo } = React;
const h = React.createElement;

type RangeFilter = 'mes' | '30d' | 'todas';
type StatusFilter = 'todas' | 'open' | 'closed';

function daysAgoKey(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() - days);
  return t.toISOString().slice(0, 10);
}
function monthStartKey(): string {
  return new Date().toISOString().slice(0, 8) + '01';
}

const SOURCE_LABEL: Record<string, string> = { consultation: 'Consulta', counter: 'Mostrador' };

export function CobrosView() {
  const [range, setRange] = useState<RangeFilter>('mes');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Rango server-side (escalable): el filtro de fecha se aplica en la base.
  const apiRange = useMemo(() => {
    if (range === 'todas') return {};
    return { from: range === 'mes' ? monthStartKey() : daysAgoKey(30) };
  }, [range]);

  const { rows, loading, error, reload } = useBillingAccounts(apiRange);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter !== 'todas') result = result.filter((r) => r.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.clientName.toLowerCase().includes(q) || (r.petName ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, statusFilter, search]);

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
          h(UI.Badge, { variant: 'secondary' } as any, SOURCE_LABEL[r.source] ?? r.source),
      },
      {
        key: 'estado',
        header: 'Estado',
        render: (r: BillingAccountRow) =>
          h(
            UI.Badge,
            { variant: r.status === 'closed' ? 'success' : 'warning' } as any,
            r.status === 'closed' ? 'Cerrada' : 'Abierta'
          ),
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
        null,
        h('h1', { className: 'text-2xl font-bold text-cg-text' }, 'Cobros'),
        h(
          'p',
          { className: 'text-sm text-cg-text-muted mt-1' },
          'Cuentas de atención — lo cobrado por consulta y por venta de mostrador.'
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
              label: 'Estado',
              options: [
                { value: 'todas', label: 'Todas' },
                { value: 'open', label: 'Abiertas' },
                { value: 'closed', label: 'Cerradas' },
              ],
              value: statusFilter,
              onChange: (v: string) => setStatusFilter(v as StatusFilter),
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
    })
  );
}
