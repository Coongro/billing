import { getHostReact, getHostUI, actions, settings } from '@coongro/plugin-sdk';

const UI = getHostUI();
import type { CajaClose } from '../../data/useCashClose.js';
import { hhmm } from '../../utils/day.js';
import { formatMoney } from '../../utils/money.js';
import { toast } from '../../utils/toast.js';

const React = getHostReact();
const { useState, useEffect } = React;
const h = React.createElement;

const SERIF = 'font-serif font-black tracking-tight';
const EPSILON = 0.005;

interface CashCloseSectionProps {
  businessDay: string;
  efectivoCobrado: number;
  egresos: number;
  digitalCobrado: number;
  existingClose: CajaClose | null;
  reload: () => Promise<void>;
}

function digits(v: string): number {
  return parseInt(v.replace(/\D/g, ''), 10) || 0;
}

/** Input de dinero inline ($ prefijo, alineado a la derecha, formato es-AR). */
function moneyInput(value: string, onChange: (v: string) => void, placeholder?: string) {
  const num = digits(value);
  return h(
    'label',
    {
      className:
        'relative inline-flex items-center h-9 min-w-[132px] pl-6 pr-3 rounded-md border border-cg-border bg-cg-surface focus-within:border-cg-gold-deep',
    },
    h('span', { className: 'absolute left-3 text-sm text-cg-text-muted' }, '$'),
    h('input', {
      inputMode: 'numeric',
      placeholder: placeholder ?? '0',
      value: value === '' ? '' : num.toLocaleString('es-AR'),
      onChange: (e: { target: { value: string } }) => onChange(e.target.value.replace(/\D/g, '')),
      className:
        'border-none outline-none bg-transparent w-full text-right text-[15px] font-medium text-cg-text',
      style: { fontVariantNumeric: 'tabular-nums' },
    })
  );
}

/**
 * Cierre de caja (arqueo del efectivo): panel SECUNDARIO plegable. fondo + efectivo − egresos
 * = esperado, contra lo contado. Solo cuenta efectivo (lo digital va al banco).
 */
export function CashCloseSection({
  businessDay,
  efectivoCobrado,
  egresos,
  digitalCobrado,
  existingClose,
  reload,
}: CashCloseSectionProps) {
  const [open, setOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const [defaultFloat, setDefaultFloat] = useState('0');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const v = await settings.get<number>('billing.cash.openingFloat');
        if (active && typeof v === 'number') setDefaultFloat(String(Math.round(v)));
      } catch {
        /* setting no disponible: queda en 0 */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setOpeningFloat(
      existingClose ? String(Math.round(Number(existingClose.openingFloat) || 0)) : defaultFloat
    );
    setCounted(existingClose ? String(Math.round(Number(existingClose.countedCash) || 0)) : '');
  }, [existingClose, businessDay, defaultFloat]);

  const floatNum = digits(openingFloat);
  const expected = floatNum + efectivoCobrado - egresos;
  const hasCounted = counted.trim() !== '';
  const countedNum = digits(counted);
  const difference = hasCounted ? countedNum - expected : 0;
  const diffIsShort = difference < -EPSILON;
  const diffIsOver = difference > EPSILON;

  const save = async () => {
    if (!hasCounted) {
      toast('Falta el conteo', 'Ingresá cuánto efectivo contaste.', 'info');
      return;
    }
    setBusy(true);
    try {
      await actions.execute('billing.cashCloses.record', {
        businessDay,
        openingFloat: String(floatNum),
        expectedCash: String(expected),
        countedCash: String(countedNum),
        difference: String(difference),
      });
      toast(
        'Caja cerrada',
        existingClose ? 'Cierre actualizado.' : 'Se guardó el cierre del día.',
        'success'
      );
      await reload();
    } catch {
      toast('No se pudo cerrar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  };

  // Fila del arqueo: label (+ hint opcional) ... valor.
  const arqRow = (
    label: string,
    valueNode: unknown,
    opts: { hint?: string; total?: boolean } = {}
  ) =>
    h(
      'div',
      { className: 'flex items-center gap-3.5 py-2.5' },
      h(
        'div',
        { className: 'flex flex-col gap-0.5' },
        h('span', { className: `text-sm text-cg-text ${opts.total ? 'font-medium' : ''}` }, label),
        opts.hint ? h('span', { className: 'text-[11px] text-cg-text-muted' }, opts.hint) : null
      ),
      h('div', { className: 'ml-auto' }, valueNode as never)
    );

  const sep = h('div', { className: 'border-t border-cg-border my-1' });

  // ── Header plegable ──
  const head = h(
    'button',
    {
      type: 'button',
      onClick: () => setOpen((v: boolean) => !v),
      'aria-expanded': open,
      className:
        'w-full flex items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-cg-bg-hover',
    },
    h(
      'span',
      {
        className:
          'w-9 h-9 rounded-lg flex-shrink-0 inline-flex items-center justify-center bg-cg-surface border border-cg-border text-cg-text-secondary',
      },
      h(UI.DynamicIcon, { icon: 'Scale', size: 17 })
    ),
    h(
      'div',
      { className: 'flex flex-col gap-0.5 min-w-0' },
      h('span', { className: 'text-sm font-medium text-cg-text' }, 'Cierre de caja'),
      h('span', { className: 'text-xs text-cg-text-muted' }, 'Arqueo del efectivo en el cajón')
    ),
    h(
      'span',
      { className: 'ml-auto flex flex-col items-end gap-0.5' },
      h(
        'span',
        { className: 'text-[10.5px] font-medium uppercase tracking-[0.06em] text-cg-text-muted' },
        'Esperado'
      ),
      h(
        'span',
        {
          className: 'text-base font-medium text-cg-text',
          style: { fontVariantNumeric: 'tabular-nums' },
        },
        formatMoney(expected)
      )
    ),
    existingClose
      ? h(
          'span',
          {
            className:
              'ml-3 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cg-success-bg text-cg-success text-[11px] font-medium',
          },
          h(UI.DynamicIcon, { icon: 'Lock', size: 11 }),
          `Cerrada · ${hhmm(existingClose.closedAt)}`
        )
      : null,
    h(UI.DynamicIcon, {
      icon: 'ChevronDown',
      size: 18,
      className: `ml-3 text-cg-text-muted transition-transform ${open ? 'rotate-180' : ''}`,
    })
  );

  // ── Cuerpo del arqueo ──
  const diffChip = !hasCounted
    ? h('span', { className: 'ml-auto text-[12.5px] text-cg-text-muted' }, 'Ingresá lo contado')
    : h(
        'span',
        {
          className: `ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium ${
            diffIsShort
              ? 'bg-cg-red-soft text-cg-red-deep'
              : diffIsOver
                ? 'bg-cg-gold-soft text-cg-gold-deep'
                : 'bg-cg-success-bg text-cg-success'
          }`,
          style: { fontVariantNumeric: 'tabular-nums' },
        },
        h(UI.DynamicIcon, {
          icon: diffIsShort ? 'ArrowUpFromLine' : diffIsOver ? 'ArrowDownToLine' : 'Check',
          size: 13,
        }),
        diffIsShort
          ? `Falta ${formatMoney(Math.abs(difference))}`
          : diffIsOver
            ? `Sobra ${formatMoney(difference)}`
            : 'Caja exacta'
      );

  const body = open
    ? h(
        'div',
        { className: 'px-5 pb-5 pt-1 border-t border-cg-border' },
        arqRow('Fondo inicial', moneyInput(openingFloat, setOpeningFloat), {
          hint: 'con qué empezó la caja',
        }),
        arqRow(
          'Efectivo cobrado',
          h(
            'span',
            {
              className: 'text-[15px] text-cg-success',
              style: { fontVariantNumeric: 'tabular-nums' },
            },
            `+ ${formatMoney(efectivoCobrado)}`
          )
        ),
        arqRow(
          'Egresos',
          h(
            'span',
            {
              className: 'text-[15px] text-cg-text-secondary',
              style: { fontVariantNumeric: 'tabular-nums' },
            },
            `− ${formatMoney(egresos)}`
          )
        ),
        sep,
        arqRow(
          'Esperado en caja',
          h(
            'span',
            {
              className: `${SERIF} text-2xl text-cg-text leading-none`,
              style: { fontVariantNumeric: 'tabular-nums' },
            },
            formatMoney(expected)
          ),
          { total: true }
        ),
        arqRow('Contado', moneyInput(counted, setCounted, '—'), {
          hint: 'lo que contás en el cajón',
        }),
        sep,
        h(
          'div',
          { className: 'flex items-center gap-3.5 py-2.5' },
          h('span', { className: 'text-sm font-medium text-cg-text' }, 'Diferencia'),
          diffChip
        ),
        // Nota: lo digital no entra al arqueo
        h(
          'div',
          {
            className:
              'flex items-start gap-2 mt-3 px-3.5 py-3 rounded-lg bg-cg-bg-hover border border-cg-border text-[12.5px] text-cg-text-secondary leading-snug',
          },
          h(UI.DynamicIcon, {
            icon: 'Info',
            size: 14,
            className: 'text-cg-text-muted flex-shrink-0 mt-0.5',
          }),
          h(
            'span',
            null,
            'Digital del día (no entra al arqueo, va al banco): ',
            h(
              'strong',
              {
                className: 'font-medium text-cg-text',
                style: { fontVariantNumeric: 'tabular-nums' },
              },
              formatMoney(digitalCobrado)
            )
          )
        ),
        h(
          'div',
          { className: 'flex justify-end mt-4' },
          h(
            UI.Button,
            {
              variant: 'brand',
              size: 'sm',
              disabled: busy,
              onClick: () => void save(),
              className: 'gap-1.5',
            },
            h(UI.DynamicIcon, { icon: 'Lock', size: 13 }),
            existingClose ? 'Actualizar cierre' : 'Cerrar caja'
          )
        )
      )
    : null;

  return h(
    'div',
    {
      className: `rounded-xl border border-cg-border overflow-hidden ${
        open ? 'bg-cg-surface' : 'bg-cg-bg-hover'
      }`,
    },
    head,
    body
  );
}
