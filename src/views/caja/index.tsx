/**
 * Caja diaria (COONG-211) — arqueo del día: cobrado − egresos = neto.
 * Rediseño 2026-06 según diseño aprobado: header + selector de fecha, tiles de
 * resumen, cobrado por disponibilidad, tabla de cobros, egresos y cierre.
 * Reutiliza los hooks de datos reales (useCaja/useExpenses/useCashClose) +
 * tokens cg-* (dark mode). Layout en utilidades estándar/inline (sin depender
 * de clases arbitrarias del CSS del plugin).
 */
import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { PAYMENT_METHOD_GROUPS, METHOD_LABEL, ACCOUNT_SOURCE_LABEL } from '../../constants.js';
import { useCaja } from '../../data/useCaja.js';
import type { CajaPayment } from '../../data/useCaja.js';
import { useCashClose } from '../../data/useCashClose.js';
import { useExpenses } from '../../data/useExpenses.js';
import { localDayKey, addDays, hhmm } from '../../utils/day.js';
import { formatMoney, formatDate } from '../../utils/money.js';
import { useMinWidth, gridCols } from '../../utils/responsive.js';

import { CashCloseSection } from './CashCloseSection.js';
import { ExpensesSection } from './ExpensesSection.js';

const React = getHostReact();
const { useState, useMemo } = React;
const h = React.createElement;

const SERIF = 'font-serif font-black tracking-tight';

/** Icono Lucide por medio de pago */
const METHOD_ICON: Record<string, string> = {
  efectivo: 'Banknote',
  transferencia: 'ArrowRightLeft',
  debito: 'CreditCard',
  credito: 'CreditCard',
};

/** Icono por grupo de disponibilidad */
const GROUP_ICON: Record<string, string> = { disponible: 'Wallet', acreditar: 'Clock' };

/** Avatar tonal por cliente (paleta decorativa sky/pink/teal, estable por nombre) */
const AV_TONES = [
  'bg-cg-sky-lt text-cg-sky-deep',
  'bg-cg-pink-lt text-cg-pink-deep',
  'bg-cg-teal-soft text-cg-teal-deep',
];
function clientAvatar(name: string): { initial: string; cls: string } {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  let acc = 0;
  for (let i = 0; i < name.length; i++) acc = (acc * 31 + name.charCodeAt(i)) >>> 0;
  return { initial, cls: AV_TONES[acc % AV_TONES.length] };
}

/** Eyebrow uppercase reutilizable */
function eyebrow(text: string, className = 'text-cg-text-muted') {
  return h(
    'span',
    { className: `text-[11px] font-bold uppercase tracking-[0.08em] ${className}` },
    text
  );
}

/**
 * Ícono `receipt` exacto del diseño (set shibui, línea fina). Lucide no tiene un
 * equivalente prolijo, así que se renderiza el SVG original inline.
 */
function receiptIcon(size = 14) {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    h('path', { d: 'M6 3h12v18l-2.5-1.4L13 21l-2.5-1.4L8 21l-2-1.4z' }),
    h('path', { d: 'M9 8h6M9 12h4' })
  );
}

/** Encabezado de sección: icono (string Lucide o nodo) + label + contador + acción opcional */
function secLabel(opts: {
  icon?: string;
  iconNode?: React.ReactNode;
  label: string;
  count?: number | null;
  action?: unknown;
}) {
  return h(
    'div',
    { className: 'flex items-center gap-2 mb-3' },
    h(
      'span',
      { className: 'flex-shrink-0 inline-flex items-center text-cg-text-muted' },
      opts.iconNode ?? h(UI.DynamicIcon, { icon: opts.icon ?? 'Circle', size: 14 })
    ),
    eyebrow(opts.label, 'text-cg-text-secondary'),
    typeof opts.count === 'number' &&
      h(
        'span',
        {
          className:
            'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-cg-bg-hover text-cg-text-muted text-[11px] font-semibold',
        },
        String(opts.count)
      ),
    opts.action ? h('div', { className: 'ml-auto' }, opts.action as never) : null
  );
}

/** Tile de resumen */
function tile(opts: {
  icon: string;
  iconCls: string;
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
  gold?: boolean;
}) {
  return h(
    'div',
    {
      className: `flex flex-col gap-2 p-5 rounded-xl border bg-cg-surface ${
        opts.gold ? 'border-cg-gold-lt' : 'border-cg-border'
      }`,
    },
    h(
      'div',
      { className: 'flex items-center gap-2' },
      h(
        'span',
        {
          className: `w-7 h-7 rounded-md inline-flex items-center justify-center ${opts.iconCls}`,
        },
        h(UI.DynamicIcon, { icon: opts.icon, size: 15 })
      ),
      eyebrow(opts.label, opts.gold ? 'text-cg-gold-deep' : 'text-cg-text-muted')
    ),
    h(
      'div',
      {
        className: `${SERIF} font-mono-nums text-cg-text ${opts.big ? 'text-3xl' : 'text-2xl'} leading-none`,
        style: { fontVariantNumeric: 'tabular-nums' },
      },
      opts.value
    ),
    opts.sub
      ? h(
          'div',
          { className: `text-xs ${opts.gold ? 'text-cg-gold-deep' : 'text-cg-text-muted'}` },
          opts.sub
        )
      : null
  );
}

export function CajaView() {
  const todayKey = useMemo(() => localDayKey(new Date()), []);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const yesterdayKey = useMemo(() => addDays(todayKey, -1), [todayKey]);
  const wide = useMinWidth(640);

  // Ventana amplia + filtro local por día exacto (ver nota de TZ del diseño original).
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
  const digitalCobrado = total - (byMethod['efectivo'] ?? 0);

  const isToday = selectedDay === todayKey;
  const isYesterday = selectedDay === yesterdayKey;
  const dayLabel = isToday ? 'Hoy' : isYesterday ? 'Ayer' : formatDate(selectedDay);
  const dayWord = isToday ? 'hoy' : isYesterday ? 'ayer' : `del ${formatDate(selectedDay)}`;

  // ── Header + selector de fecha ──
  const header = h(
    'div',
    { className: 'flex items-end justify-between gap-4 flex-wrap' },
    h(
      'div',
      { className: 'flex flex-col gap-1.5' },
      eyebrow('Cobros', 'text-cg-gold-deep'),
      h('h1', { className: `${SERIF} text-3xl leading-none m-0 text-cg-text` }, 'Caja diaria'),
      h(
        'p',
        { className: 'text-sm text-cg-text-muted m-0' },
        'Lo cobrado y lo que salió del cajón en el día — con el arqueo para cerrar la caja.'
      )
    ),
    h(
      'div',
      { className: 'flex items-center gap-2 flex-wrap' },
      h(
        UI.Button,
        {
          variant: isToday ? 'brand' : 'outline',
          size: 'sm',
          onClick: () => setSelectedDay(todayKey),
        },
        'Hoy'
      ),
      h(
        UI.Button,
        {
          variant: isYesterday ? 'brand' : 'outline',
          size: 'sm',
          onClick: () => setSelectedDay(yesterdayKey),
        },
        'Ayer'
      ),
      h(
        'label',
        {
          className:
            'inline-flex items-center gap-2 h-9 px-3 rounded-md border border-cg-border bg-cg-surface text-sm text-cg-text cursor-pointer',
        },
        h(UI.DynamicIcon, { icon: 'Calendar', size: 15, className: 'text-cg-text-muted' }),
        h('span', null, isToday || isYesterday ? formatDate(selectedDay) : dayLabel),
        h('input', {
          type: 'date',
          value: selectedDay,
          max: todayKey,
          onChange: (e: { target: { value: string } }) =>
            e.target.value && setSelectedDay(e.target.value),
          className: 'sr-only',
          'aria-label': 'Elegir fecha',
        })
      )
    )
  );

  // ── Tiles de resumen ──
  const tiles = h(
    'div',
    { style: gridCols(3, wide) },
    tile({
      icon: 'ArrowDownToLine',
      iconCls: 'bg-cg-success-bg text-cg-success',
      label: 'Cobrado',
      value: formatMoney(total),
      sub: `${dayPayments.length} ${dayPayments.length === 1 ? 'cobro' : 'cobros'}`,
    }),
    tile({
      icon: 'ArrowUpFromLine',
      iconCls: 'bg-cg-bg-hover text-cg-text-secondary border border-cg-border',
      label: 'Egresos',
      value: expensesTotal > 0 ? `− ${formatMoney(expensesTotal)}` : formatMoney(0),
      sub: `${dayExpenses.length} ${dayExpenses.length === 1 ? 'egreso' : 'egresos'}`,
    }),
    tile({
      icon: 'Wallet',
      iconCls: 'bg-cg-surface text-cg-gold-deep border border-cg-gold-lt',
      label: 'Neto de caja',
      value: formatMoney(neto),
      sub: 'Flujo del día, no la ganancia',
      big: true,
      gold: true,
    })
  );

  // ── Cobrado por disponibilidad ──
  const cobradoGroups = h(
    'div',
    { style: gridCols(2, wide) },
    ...PAYMENT_METHOD_GROUPS.map((g) => {
      const subtotal = g.methods.reduce((s, mv) => s + (byMethod[mv] ?? 0), 0);
      // "Disponible" (efectivo en mano) se destaca con tinte teal, como el diseño.
      const disp = g.key === 'disponible';
      return h(
        'div',
        {
          key: g.key,
          className: 'rounded-xl border border-cg-border bg-cg-surface overflow-hidden',
        },
        h(
          'div',
          {
            // success-* son tokens semánticos que SÍ adaptan a dark mode (teal-soft/teal-deep
            // son primitivas fijas → quedarían como caja clara sobre fondo oscuro).
            className: `flex items-center gap-3 px-4 py-3 border-b ${
              disp ? 'bg-cg-success-bg border-cg-success-border' : 'border-cg-border'
            }`,
          },
          h(
            'span',
            {
              className: `w-8 h-8 rounded-md flex-shrink-0 inline-flex items-center justify-center bg-cg-surface border ${
                disp
                  ? 'border-cg-success-border text-cg-success'
                  : 'border-cg-border text-cg-text-secondary'
              }`,
            },
            h(UI.DynamicIcon, { icon: GROUP_ICON[g.key] ?? 'Wallet', size: 15 })
          ),
          h(
            'div',
            { className: 'flex-1 min-w-0' },
            h('div', { className: 'text-sm font-medium text-cg-text leading-tight' }, g.label),
            h(
              'div',
              { className: `text-[11px] ${disp ? 'text-cg-success' : 'text-cg-text-muted'}` },
              g.hint
            )
          ),
          h(
            'span',
            {
              className: 'font-semibold text-cg-text',
              style: { fontVariantNumeric: 'tabular-nums' },
            },
            loading ? '—' : formatMoney(subtotal)
          )
        ),
        h(
          'div',
          { className: 'px-4 py-2' },
          ...g.methods.map((mv, i) =>
            h(
              'div',
              {
                key: mv,
                className: `flex items-center gap-2.5 py-2 ${
                  i > 0 ? 'border-t border-cg-border' : ''
                }`,
              },
              h(
                'span',
                {
                  className:
                    'w-7 h-7 rounded-md inline-flex items-center justify-center bg-cg-bg-hover border border-cg-border text-cg-text-secondary',
                },
                h(UI.DynamicIcon, { icon: METHOD_ICON[mv] ?? 'CreditCard', size: 13 })
              ),
              h(
                'span',
                { className: 'flex-1 text-sm text-cg-text-secondary' },
                METHOD_LABEL[mv] ?? mv
              ),
              h(
                'span',
                {
                  className: 'text-sm text-cg-text',
                  style: { fontVariantNumeric: 'tabular-nums' },
                },
                loading ? '—' : formatMoney(byMethod[mv] ?? 0)
              )
            )
          )
        )
      );
    })
  );

  // ── Tabla de cobros (componente Table de Coongro) ──
  const cobrosRow = (r: CajaPayment) => {
    // Sin contacto resuelto useCaja devuelve "—": es venta de mostrador → ícono Store.
    const hasClient = !!r.clientName && r.clientName !== '—';
    const av = hasClient ? clientAvatar(r.clientName) : null;
    const sourceLabel = ACCOUNT_SOURCE_LABEL[r.source] ?? r.source;
    const isCounter = sourceLabel === 'Mostrador';
    return h(
      UI.TableRow,
      { key: r.id },
      h(
        UI.TableCell,
        {
          className: 'text-cg-text-secondary whitespace-nowrap',
          style: { fontVariantNumeric: 'tabular-nums' },
        },
        hhmm(r.paidAt)
      ),
      h(
        UI.TableCell,
        null,
        h(
          'span',
          { className: 'flex items-center gap-2.5 min-w-0' },
          av
            ? h(
                'span',
                {
                  className: `w-8 h-8 rounded-full flex-shrink-0 inline-flex items-center justify-center font-serif font-black text-xs ${av.cls}`,
                },
                av.initial
              )
            : h(
                'span',
                {
                  className:
                    'w-8 h-8 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-cg-bg-hover border border-cg-border text-cg-text-muted',
                },
                h(UI.DynamicIcon, { icon: 'Store', size: 15 })
              ),
          h(
            'span',
            {
              className: hasClient
                ? 'truncate font-medium text-cg-text'
                : 'truncate text-cg-text-muted',
            },
            hasClient ? r.clientName : 'Mostrador'
          )
        )
      ),
      h(
        UI.TableCell,
        null,
        h(UI.Badge, { variant: isCounter ? 'outline' : 'secondary', size: 'sm' }, sourceLabel)
      ),
      h(
        UI.TableCell,
        null,
        h(
          'span',
          { className: 'flex items-center gap-2 text-cg-text' },
          h(UI.DynamicIcon, {
            icon: METHOD_ICON[r.method] ?? 'CreditCard',
            size: 15,
            className: 'text-cg-text-muted',
          }),
          METHOD_LABEL[r.method] ?? r.method
        )
      ),
      h(
        UI.TableCell,
        { className: 'text-right font-medium', style: { fontVariantNumeric: 'tabular-nums' } },
        formatMoney(r.amount)
      )
    );
  };

  const cobrosTable = h(
    'div',
    { className: 'rounded-xl border border-cg-border bg-cg-surface overflow-hidden' },
    h(
      UI.Table,
      { className: 'w-full' },
      h(
        UI.TableHeader,
        null,
        h(
          UI.TableRow,
          null,
          h(UI.TableHead, { className: 'w-28' }, 'Hora'),
          h(UI.TableHead, null, 'Cliente'),
          h(UI.TableHead, { className: 'w-32' }, 'Origen'),
          h(UI.TableHead, { className: 'w-40' }, 'Medio'),
          h(UI.TableHead, { className: 'w-28 text-right' }, 'Monto')
        )
      ),
      h(
        UI.TableBody,
        null,
        loading
          ? h(
              UI.TableRow,
              null,
              h(
                UI.TableCell,
                { colSpan: 5, className: 'text-center text-cg-text-muted py-6' },
                'Cargando…'
              )
            )
          : error
            ? h(
                UI.TableRow,
                null,
                h(
                  UI.TableCell,
                  { colSpan: 5 },
                  h(UI.ErrorDisplay, { title: 'Error', message: error, onRetry: reload })
                )
              )
            : dayPayments.length === 0
              ? h(
                  UI.TableRow,
                  null,
                  h(
                    UI.TableCell,
                    { colSpan: 5, className: 'text-center text-cg-text-muted py-8' },
                    isToday ? 'Sin cobros hoy todavía.' : `Sin cobros ${dayWord}.`
                  )
                )
              : dayPayments.map((r: CajaPayment) => cobrosRow(r))
      )
    )
  );

  return h(
    'div',
    { className: 'font-sans min-h-screen bg-cg-bg-secondary p-6' },
    h(
      'div',
      {
        className: 'flex flex-col gap-6',
        style: { maxWidth: 1080, margin: '0 auto' },
      },
      header,
      tiles,

      h(
        'div',
        null,
        secLabel({ icon: 'ArrowDownToLine', label: 'Cobrado, por disponibilidad' }),
        cobradoGroups
      ),

      h(
        'div',
        null,
        secLabel({
          iconNode: receiptIcon(15),
          label: `Cobros ${dayWord}`,
          count: !loading && dayPayments.length > 0 ? dayPayments.length : null,
        }),
        cobrosTable
      ),

      // Egresos del día (alta + lista) — sección existente
      h(ExpensesSection, {
        day: selectedDay,
        rows: dayExpenses,
        neto,
        reload: reloadExpenses,
      }),

      // Cierre de caja (arqueo) — sección existente
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
