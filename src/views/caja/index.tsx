import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { PAYMENT_METHOD_GROUPS, METHOD_LABEL, ACCOUNT_SOURCE_LABEL } from '../../constants.js';
import { useCaja } from '../../data/useCaja.js';
import type { CajaPayment } from '../../data/useCaja.js';
import { useCashClose } from '../../data/useCashClose.js';
import { useExpenses } from '../../data/useExpenses.js';
import { localDayKey, addDays, hhmm } from '../../utils/day.js';
import { formatMoney, formatDate } from '../../utils/money.js';

import { CashCloseSection } from './CashCloseSection.js';
import { ExpensesSection } from './ExpensesSection.js';

const React = getHostReact();
const { useState, useMemo } = React;
const h = React.createElement;

export function CajaView() {
  const todayKey = useMemo(() => localDayKey(new Date()), []);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const yesterdayKey = useMemo(() => addDays(todayKey, -1), [todayKey]);

  // Traemos una ventana amplia y filtramos localmente por el día exacto. El borde superior
  // va a +2 (no +1): un cobro/egreso de "hoy" a la tarde-noche en zonas UTC-negativas (ej.
  // AR, UTC-3) cae en el día UTC SIGUIENTE; un `to` de día+1 (00:00 UTC) lo dejaría afuera.
  // Con día+2 entra, y el filtro por localDayKey lo acota igual al día exacto.
  const apiRange = useMemo(
    () => ({ from: addDays(selectedDay, -1), to: addDays(selectedDay, 2) }),
    [selectedDay]
  );

  const { rows: payRows, loading, error, reload } = useCaja(apiRange);
  const { rows: expRows, reload: reloadExpenses } = useExpenses(apiRange);
  const { close, reload: reloadClose } = useCashClose(selectedDay);

  const dayPayments = useMemo(
    () => payRows.filter((r) => localDayKey(new Date(r.paidAt)) === selectedDay),
    [payRows, selectedDay]
  );
  const dayExpenses = useMemo(
    () => expRows.filter((e) => localDayKey(new Date(e.spentAt)) === selectedDay),
    [expRows, selectedDay]
  );

  const total = useMemo(
    () => dayPayments.reduce((s, r) => s + Number(r.amount || 0), 0),
    [dayPayments]
  );
  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of dayPayments) m[r.method] = (m[r.method] ?? 0) + Number(r.amount || 0);
    return m;
  }, [dayPayments]);
  const expensesTotal = useMemo(
    () => dayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    [dayExpenses]
  );
  const neto = total - expensesTotal;
  // "Digital del día" = todo lo que NO es efectivo (transferencia + tarjetas): va al banco,
  // no entra al arqueo del cajón. Se le pasa al cierre como contexto.
  const digitalCobrado = total - (byMethod['efectivo'] ?? 0);

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

  const isToday = selectedDay === todayKey;
  const dayLabel = isToday
    ? 'Hoy'
    : selectedDay === yesterdayKey
      ? 'Ayer'
      : formatDate(selectedDay);

  return h(
    'div',
    { className: 'font-inter min-h-screen bg-cg-bg-secondary p-6' },
    h(
      'div',
      { className: 'w-full flex flex-col gap-6' },

      // Encabezado + selector de día
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
            'Lo que entró y salió en el día, y el cierre de caja.'
          )
        ),
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h(
            UI.Button,
            {
              variant: isToday ? 'brand' : 'outline',
              size: 'sm',
              onClick: () => setSelectedDay(todayKey),
            } as any,
            'Hoy'
          ),
          h(
            UI.Button,
            {
              variant: selectedDay === yesterdayKey ? 'brand' : 'outline',
              size: 'sm',
              onClick: () => setSelectedDay(yesterdayKey),
            } as any,
            'Ayer'
          ),
          h(
            'div',
            { className: 'w-40' },
            h(UI.Input, {
              type: 'date',
              size: 'sm',
              value: selectedDay,
              max: todayKey,
              onChange: (e: any) => e.target.value && setSelectedDay(e.target.value),
              'aria-label': 'Elegir día',
            } as any)
          )
        )
      ),

      // Resumen del día: cobrado + desglose por medio + egresos + neto
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
            `Cobrado · ${dayLabel}`
          ),
          h(
            'div',
            { className: 'font-mono text-3xl font-bold text-cg-text mt-1' },
            formatMoney(total)
          ),
          h(
            'div',
            { className: 'text-xs text-cg-text-muted mt-1' },
            `${dayPayments.length} ${dayPayments.length === 1 ? 'cobro' : 'cobros'}`
          )
        ),
        // Dos grupos por disponibilidad de la plata: "Disponible hoy" vs "Por acreditar"
        ...PAYMENT_METHOD_GROUPS.map((g) => {
          const subtotal = g.methods.reduce((s, mv) => s + (byMethod[mv] ?? 0), 0);
          return h(
            'div',
            { key: g.key, className: 'flex flex-col gap-2' },
            h(
              'div',
              { className: 'flex items-baseline justify-between gap-3' },
              h(
                'div',
                null,
                h(
                  'span',
                  { className: 'text-xs font-semibold text-cg-text uppercase tracking-wide' },
                  g.label
                ),
                h('span', { className: 'text-xs text-cg-text-muted ml-2' }, g.hint)
              ),
              h(
                'span',
                { className: 'font-mono font-semibold text-cg-text' },
                formatMoney(subtotal)
              )
            ),
            h(
              'div',
              { className: 'grid grid-cols-2 gap-3' },
              ...g.methods.map((mv) =>
                h(
                  'div',
                  { key: mv, className: 'rounded-lg border border-cg-border px-3 py-2.5' },
                  h('div', { className: 'text-xs text-cg-text-muted' }, METHOD_LABEL[mv] ?? mv),
                  h(
                    'div',
                    { className: 'font-mono font-semibold text-cg-text mt-0.5' },
                    formatMoney(byMethod[mv] ?? 0)
                  )
                )
              )
            )
          );
        }),
        // Egresos + neto de caja (flujo de plata, NO ganancia)
        h(
          'div',
          {
            className:
              'flex items-center justify-between gap-4 border-t border-dashed border-cg-border pt-4',
          },
          h(
            'div',
            null,
            h('div', { className: 'text-xs text-cg-text-muted' }, 'Egresos'),
            h(
              'div',
              { className: 'font-mono font-semibold text-cg-danger mt-0.5' },
              expensesTotal > 0 ? `− ${formatMoney(expensesTotal)}` : formatMoney(0)
            )
          ),
          h(
            'div',
            { className: 'text-right' },
            h('div', { className: 'text-xs text-cg-text-muted' }, 'Neto de caja'),
            h(
              'div',
              { className: 'font-mono text-xl font-bold text-cg-text mt-0.5' },
              formatMoney(neto)
            ),
            h(
              'div',
              { className: 'text-[11px] text-cg-text-muted mt-0.5' },
              'Cobrado − Egresos · no es ganancia'
            )
          )
        )
      ),

      // Lista de cobros del día
      h(
        'div',
        { className: 'bg-cg-bg rounded-xl border border-cg-border p-6 shadow-sm' },
        h(UI.DataTable, {
          data: dayPayments,
          rowKey: (r: CajaPayment) => r.id,
          loading,
          error,
          onRetry: reload,
          columns,
          emptyState: {
            title: isToday ? 'Sin cobros hoy todavía' : `Sin cobros · ${dayLabel}`,
            description: 'Los cobros que registres aparecen acá.',
            icon: h(UI.DynamicIcon, { icon: 'Wallet', size: 32 } as any),
          },
          skeletonRows: 6,
        } as any)
      ),

      // Egresos del día (alta + lista)
      h(ExpensesSection, {
        day: selectedDay,
        rows: dayExpenses,
        total: expensesTotal,
        reload: reloadExpenses,
      }),

      // Cierre de caja (arqueo)
      h(CashCloseSection, {
        businessDay: selectedDay,
        efectivoCobrado: byMethod['efectivo'] ?? 0,
        egresos: expensesTotal,
        digitalCobrado,
        existingClose: close,
        reload: reloadClose,
      })
    )
  );
}
