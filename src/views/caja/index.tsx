import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { PAYMENT_METHODS, METHOD_LABEL, ACCOUNT_SOURCE_LABEL } from '../../constants.js';
import { useCaja } from '../../data/useCaja.js';
import type { CajaPayment } from '../../data/useCaja.js';
import { formatMoney } from '../../utils/money.js';

const React = getHostReact();
const { useState, useMemo } = React;
const h = React.createElement;

const DAY_MS = 86400000;

type DaySel = 'hoy' | 'ayer';

/** Clave de día (YYYY-MM-DD) en la zona horaria LOCAL del navegador. */
function localDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA');
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function CajaView() {
  const [day, setDay] = useState<DaySel>('hoy');

  // Traemos una ventana de 8 días (cubre hoy/ayer con margen) y agrupamos localmente.
  const apiRange = useMemo(
    () => ({ from: new Date(Date.now() - 8 * DAY_MS).toISOString().slice(0, 10) }),
    []
  );
  const { rows, loading, error, reload } = useCaja(apiRange);

  const targetKey = useMemo(
    () => localDayKey(day === 'hoy' ? new Date() : new Date(Date.now() - DAY_MS)),
    [day]
  );

  const dayRows = useMemo(
    () => rows.filter((r) => localDayKey(new Date(r.paidAt)) === targetKey),
    [rows, targetKey]
  );

  const total = useMemo(() => dayRows.reduce((s, r) => s + Number(r.amount || 0), 0), [dayRows]);
  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of dayRows) m[r.method] = (m[r.method] ?? 0) + Number(r.amount || 0);
    return m;
  }, [dayRows]);

  const columns = useMemo(
    () => [
      {
        key: 'hora',
        header: 'Hora',
        render: (r: CajaPayment) => h('span', { className: 'font-mono' }, hhmm(r.paidAt)),
      },
      {
        key: 'cliente',
        header: 'Cliente',
        render: (r: CajaPayment) => h('span', { className: 'font-medium' }, r.clientName),
      },
      {
        key: 'origen',
        header: 'Origen',
        render: (r: CajaPayment) =>
          h(UI.Badge, { variant: 'secondary' } as any, ACCOUNT_SOURCE_LABEL[r.source] ?? r.source),
      },
      {
        key: 'medio',
        header: 'Medio',
        render: (r: CajaPayment) => h('span', null, METHOD_LABEL[r.method] ?? r.method),
      },
      {
        key: 'monto',
        header: 'Monto',
        className: 'text-right',
        render: (r: CajaPayment) =>
          h('span', { className: 'font-mono font-semibold' }, formatMoney(r.amount)),
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
          h('h1', { className: 'text-2xl font-bold text-cg-text' }, 'Caja diaria'),
          h(
            'p',
            { className: 'text-sm text-cg-text-muted mt-1' },
            'Lo cobrado en el día, desglosado por medio de pago.'
          )
        ),
        h(
          'div',
          { className: 'w-48' },
          h(UI.SegmentedControl, {
            value: day,
            options: [
              { value: 'hoy', label: 'Hoy' },
              { value: 'ayer', label: 'Ayer' },
            ],
            onChange: (v: string) => setDay(v as DaySel),
            'aria-label': 'Día',
          } as any)
        )
      ),

      // Total + desglose por medio
      h(
        'div',
        {
          className:
            'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm flex flex-col gap-5',
        },
        h(
          'div',
          null,
          h(
            'div',
            { className: 'text-xs text-cg-text-muted uppercase tracking-wide' },
            day === 'hoy' ? 'Cobrado hoy' : 'Cobrado ayer'
          ),
          h(
            'div',
            { className: 'font-mono text-3xl font-bold text-cg-text mt-1' },
            formatMoney(total)
          ),
          h(
            'div',
            { className: 'text-xs text-cg-text-muted mt-1' },
            `${dayRows.length} ${dayRows.length === 1 ? 'cobro' : 'cobros'}`
          )
        ),
        h(
          'div',
          { className: 'grid grid-cols-2 sm:grid-cols-4 gap-3' },
          ...PAYMENT_METHODS.map((m) =>
            h(
              'div',
              {
                key: m.value,
                className: 'rounded-lg border border-cg-border px-3 py-2.5',
              },
              h('div', { className: 'text-xs text-cg-text-muted' }, m.label),
              h(
                'div',
                { className: 'font-mono font-semibold text-cg-text mt-0.5' },
                formatMoney(byMethod[m.value] ?? 0)
              )
            )
          )
        )
      ),

      // Lista de cobros del día
      h(
        'div',
        { className: 'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm' },
        h(UI.DataTable, {
          data: dayRows,
          rowKey: (r: CajaPayment) => r.id,
          loading,
          error,
          onRetry: reload,
          columns,
          emptyState: {
            title: day === 'hoy' ? 'Sin cobros hoy todavía' : 'No hubo cobros ayer',
            description: 'Los cobros que registres aparecen acá para cerrar la caja.',
            icon: h(UI.DynamicIcon, { icon: 'Wallet', size: 32 } as any),
          },
          skeletonRows: 6,
        } as any)
      )
    )
  );
}
