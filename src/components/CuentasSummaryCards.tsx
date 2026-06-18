import { getHostReact, getHostUI } from '@coongro/plugin-sdk';

import { formatMoney } from '../utils/money.js';
import { useMinWidth } from '../utils/responsive.js';

const UI = getHostUI();
const React = getHostReact();
const h = React.createElement;

/** Métricas del rango cargado, calculadas en la vista a partir de las cuentas. */
export interface CuentasMetrics {
  porCobrar: number;
  cobrado: number;
  nConSaldo: number;
  nSaldadas: number;
  nCuentas: number;
  nDeudores: number;
}

export type CardFilter = 'pendiente' | 'pagada' | 'todas';

interface CardDef {
  key: string;
  label: string;
  icon: string;
  fg: string; // clase de color de texto (token semántico → dark-safe)
  bg: string; // clase de fondo del chip
  value: (m: CuentasMetrics) => string;
  sub: (m: CuentasMetrics) => string;
  filter?: CardFilter; // si está → la card togglea este filtro de pago
  nav?: boolean; // si está → navega (Deudores) en vez de filtrar
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const CARDS: CardDef[] = [
  {
    key: 'porCobrar',
    label: 'POR COBRAR',
    icon: 'Wallet',
    fg: 'text-cg-gold-deep',
    bg: 'bg-cg-gold-soft',
    value: (m) => formatMoney(m.porCobrar),
    sub: (m) => plural(m.nConSaldo, 'cuenta con saldo', 'cuentas con saldo'),
    filter: 'pendiente',
  },
  {
    key: 'cobrado',
    label: 'COBRADO',
    icon: 'CheckCircle2',
    fg: 'text-cg-green',
    bg: 'bg-cg-green-bg',
    value: (m) => formatMoney(m.cobrado),
    sub: (m) => plural(m.nSaldadas, 'saldada', 'saldadas'),
    filter: 'pagada',
  },
  {
    key: 'cuentas',
    label: 'CUENTAS',
    icon: 'Layers',
    fg: 'text-cg-text-muted',
    bg: 'bg-cg-bg-secondary',
    value: (m) => String(m.nCuentas),
    sub: () => 'en este rango',
    filter: 'todas',
  },
  {
    key: 'deudores',
    label: 'DEUDORES',
    icon: 'Users',
    fg: 'text-cg-danger',
    bg: 'bg-cg-danger-bg',
    value: (m) => String(m.nDeudores),
    sub: (m) => (m.nDeudores === 0 ? 'nadie debe' : 'ver detalle'),
    nav: true,
  },
];

/**
 * Tarjetas-resumen de Cuentas (diseño Cobros/Cuentas). Las 3 primeras son atajos
 * de filtro de pago; la card Deudores navega a la vista cliente-nivel (que ya no
 * tiene entrada de menú propia — se consolidó acá, COONG-216). Grilla resuelta en
 * JS (ver utils/responsive) para no depender del cascade de tailwind entre plugins.
 */
export function CuentasSummaryCards(props: {
  metrics: CuentasMetrics;
  loading: boolean;
  payFilter: CardFilter;
  onFilter: (f: CardFilter) => void;
  onOpenDeudores: () => void;
}) {
  const { metrics, loading, payFilter, onFilter, onOpenDeudores } = props;
  const wide = useMinWidth(880);
  const mid = useMinWidth(560);
  const cols = wide ? 4 : mid ? 2 : 1;

  return h(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 14,
      },
    },
    ...CARDS.map((c) => {
      const active = !!c.filter && c.filter !== 'todas' && payFilter === c.filter;
      const onClick = () => {
        if (c.nav) return onOpenDeudores();
        if (!c.filter) return;
        // Toggle: volver a "todas" si ya estaba activo este filtro.
        onFilter(active ? 'todas' : c.filter);
      };
      return h(
        'button',
        {
          key: c.key,
          type: 'button',
          onClick,
          className: [
            'flex flex-col text-left rounded-xl bg-cg-bg shadow-sm transition-colors',
            'hover:bg-cg-bg-hover',
            active ? 'border-2 border-cg-accent' : 'border border-cg-border',
          ].join(' '),
          style: { padding: active ? 15 : 16 },
        },
        h(
          'div',
          { className: 'flex items-center gap-2.5' },
          h(
            'span',
            {
              className: `inline-flex items-center justify-center rounded-lg ${c.fg} ${c.bg}`,
              style: { width: 34, height: 34 },
            },
            h(UI.DynamicIcon, { icon: c.icon, size: 17 } as any)
          ),
          h(
            'span',
            { className: 'text-[11px] font-semibold tracking-wide text-cg-text-muted' },
            c.label
          )
        ),
        h(
          'div',
          { className: 'text-2xl font-bold text-cg-text font-mono mt-2' },
          loading ? ' ' : c.value(metrics)
        ),
        h('div', { className: 'text-xs text-cg-text-muted mt-0.5' }, loading ? ' ' : c.sub(metrics))
      );
    })
  );
}
