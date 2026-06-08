import { getHostReact, getHostUI, actions, settings } from '@coongro/plugin-sdk';

const UI = getHostUI();
import type { CajaClose } from '../../data/useCashClose.js';
import { hhmm } from '../../utils/day.js';
import { formatMoney } from '../../utils/money.js';
import { toast } from '../../utils/toast.js';

const React = getHostReact();
const { useState, useEffect } = React;
const h = React.createElement;

interface CashCloseSectionProps {
  businessDay: string;
  /** Efectivo cobrado del día (solo medio 'efectivo'). */
  efectivoCobrado: number;
  /** Total de egresos del día. */
  egresos: number;
  /** Cobrado por medios digitales (transferencia + tarjetas): NO entra al arqueo, va al banco. */
  digitalCobrado: number;
  existingClose: CajaClose | null;
  reload: () => Promise<void>;
}

const EPSILON = 0.005;

/**
 * Cierre de caja (arqueo) del día: fondo + efectivo cobrado − egresos = esperado, contra lo
 * contado. Sección SECUNDARIA (plegada por defecto): el cobro diario es lo central; el arqueo
 * es opcional y solo del EFECTIVO (lo digital va al banco). expected/difference se snapshotean
 * al guardar (ver schema cash-close).
 */
export function CashCloseSection({
  businessDay,
  efectivoCobrado,
  egresos,
  digitalCobrado,
  existingClose,
  reload,
}: CashCloseSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  // Fondo inicial configurable (setting billing.cash.openingFloat): el cajón rara vez arranca en
  // 0. Pre-rellena el arqueo para que el "esperado" no quede negativo por un egreso en efectivo.
  const [defaultFloat, setDefaultFloat] = useState('0');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const v = await settings.get<number>('billing.cash.openingFloat');
        if (active && typeof v === 'number') setDefaultFloat(String(v));
      } catch {
        /* setting no disponible: queda en 0 */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Sincroniza los inputs con el cierre existente al cambiar de día o cargar el cierre.
  // Día nuevo (sin cierre) → arranca con el fondo configurado, no 0.
  useEffect(() => {
    setOpeningFloat(existingClose ? existingClose.openingFloat : defaultFloat);
    setCounted(existingClose ? existingClose.countedCash : '');
  }, [existingClose, businessDay, defaultFloat]);

  const floatNum = Number(openingFloat) || 0;
  const expected = floatNum + efectivoCobrado - egresos;
  const countedNum = Number(counted);
  const hasCounted = counted.trim() !== '' && Number.isFinite(countedNum);
  const difference = hasCounted ? countedNum - expected : 0;

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

  const line = (label: string, value: string, opts: { strong?: boolean; color?: string } = {}) =>
    h(
      'div',
      { className: 'flex items-center justify-between' },
      h(
        'span',
        {
          className: `text-sm ${opts.strong ? 'text-cg-text font-semibold' : 'text-cg-text-muted'}`,
        },
        label
      ),
      h(
        'span',
        {
          className: `font-mono ${opts.strong ? 'font-bold text-base' : 'font-medium text-sm'} ${
            opts.color ?? 'text-cg-text'
          }`,
        },
        value
      )
    );

  // 'sobra' no tiene token de color propio (no hay cg-success): neutro + label. 'falta' = danger.
  const diffIsShort = difference < -EPSILON;
  const diffIsOver = difference > EPSILON;
  const diffColor = diffIsShort ? 'text-cg-danger' : 'text-cg-text';
  const diffLabel = diffIsShort ? 'falta' : diffIsOver ? 'sobra' : 'exacto';
  const diffSign = diffIsOver ? '+ ' : diffIsShort ? '− ' : '';

  return h(
    'div',
    { className: 'bg-cg-bg rounded-xl border border-cg-border shadow-sm' },

    // Header secundario: clickable para expandir/plegar
    h(
      'button',
      {
        type: 'button',
        onClick: () => setExpanded((v: boolean) => !v),
        className: 'w-full flex items-center justify-between gap-4 px-6 py-4 text-left',
      },
      h(
        'div',
        { className: 'flex items-center gap-2.5' },
        h(UI.DynamicIcon, { icon: expanded ? 'ChevronDown' : 'ChevronRight', size: 16 } as any),
        h(
          'div',
          null,
          h('div', { className: 'text-sm font-semibold text-cg-text' }, 'Cierre de caja'),
          h(
            'div',
            { className: 'text-xs text-cg-text-muted mt-0.5' },
            'Arqueo del efectivo del cajón (opcional)'
          )
        )
      ),
      existingClose
        ? h(UI.Badge, { variant: 'success' } as any, `Cerrada · ${hhmm(existingClose.closedAt)}`)
        : h('span', { className: 'text-xs text-cg-text-muted' }, 'Sin cerrar')
    ),

    // Body (solo si está expandido)
    expanded &&
      h(
        'div',
        { className: 'px-6 pb-6 pt-4 flex flex-col gap-4 border-t border-cg-border' },

        // Contexto: lo digital no entra al arqueo
        digitalCobrado > EPSILON &&
          h(
            'div',
            {
              className:
                'text-xs text-cg-text-muted bg-cg-bg-secondary rounded-lg px-3 py-2 border border-cg-border',
            },
            `Cobrado digital del día (transferencia + tarjetas): ${formatMoney(
              digitalCobrado
            )} — va al banco, no entra al arqueo del cajón.`
          ),

        // Cálculo del arqueo (solo efectivo)
        h(
          'div',
          { className: 'flex flex-col gap-2.5' },
          h(
            'div',
            { className: 'flex items-center justify-between gap-4' },
            h('label', { className: 'text-sm text-cg-text-muted' }, 'Fondo inicial'),
            h(
              'div',
              { className: 'w-32' },
              h(UI.Input, {
                type: 'number',
                size: 'sm',
                min: 0,
                step: '0.01',
                value: openingFloat,
                onChange: (e: any) => setOpeningFloat(e.target.value),
              } as any)
            )
          ),
          line('Efectivo cobrado', `+ ${formatMoney(efectivoCobrado)}`),
          line('Egresos', `− ${formatMoney(egresos)}`),
          h(
            'div',
            { className: 'border-t border-dashed border-cg-border pt-2.5' },
            line('Esperado en caja', formatMoney(expected), { strong: true })
          ),
          // Caja negativa no existe: si los egresos en efectivo superan el fondo, es que el
          // fondo inicial está subdeclarado (pagar en efectivo supone que ese dinero ya estaba
          // en el cajón). En vez de mostrar un "−$X" confuso, lo explicamos y guiamos.
          expected < -EPSILON &&
            h(
              'div',
              {
                className:
                  'text-xs text-cg-danger bg-cg-bg-secondary rounded-lg px-3 py-2 border border-cg-border',
              },
              'El esperado quedó negativo: los egresos en efectivo superan al fondo. Si los pagaste del cajón, ese dinero ya estaba ahí — subí el fondo inicial para reflejarlo.'
            ),
          h(
            'div',
            { className: 'flex items-center justify-between gap-4 pt-1' },
            h('label', { className: 'text-sm text-cg-text font-semibold' }, 'Contado'),
            h(
              'div',
              { className: 'w-32' },
              h(UI.Input, {
                type: 'number',
                size: 'sm',
                min: 0,
                step: '0.01',
                value: counted,
                placeholder: '0',
                onChange: (e: any) => setCounted(e.target.value),
              } as any)
            )
          ),
          hasCounted &&
            h(
              'div',
              { className: 'border-t border-dashed border-cg-border pt-2.5' },
              line(`Diferencia (${diffLabel})`, `${diffSign}${formatMoney(Math.abs(difference))}`, {
                strong: true,
                color: diffColor,
              })
            )
        ),

        h(
          'div',
          { className: 'flex justify-end' },
          h(
            UI.Button,
            { variant: 'brand', size: 'sm', disabled: busy, onClick: () => void save() } as any,
            h(UI.DynamicIcon, { icon: 'Lock', size: 13 } as any),
            existingClose ? ' Actualizar cierre' : ' Cerrar caja'
          )
        )
      )
  );
}
