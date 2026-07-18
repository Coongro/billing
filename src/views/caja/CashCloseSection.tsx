import { getHostReact, getHostUI, actions, settings } from '@coongro/plugin-sdk';

const UI = getHostUI();
import type { CajaClose } from '../../data/useCashClose.js';
import { usePrevFloat } from '../../data/useCashClose.js';
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
  /** Refresca cierre + pagos + historial (el retiro automático crea una Salida del día). */
  reload: () => Promise<void>;
}

function digits(v: string): number {
  return parseInt(v.replace(/\D/g, ''), 10) || 0;
}

/** Input de dinero inline ($ prefijo, alineado a la derecha, formato es-AR). */
function moneyInput(
  value: string,
  onChange: (v: string) => void,
  opts: { placeholder?: string; disabled?: boolean } = {}
) {
  const num = digits(value);
  return h(
    'label',
    {
      className: `relative inline-flex items-center h-9 min-w-[132px] pl-6 pr-3 rounded-md border border-cg-border bg-cg-surface focus-within:border-cg-gold-deep ${
        opts.disabled ? 'opacity-50' : ''
      }`,
    },
    h('span', { className: 'absolute left-3 text-sm text-cg-text-muted' }, '$'),
    h('input', {
      inputMode: 'numeric',
      placeholder: opts.placeholder ?? '0',
      value: value === '' ? '' : num.toLocaleString('es-AR'),
      disabled: opts.disabled ?? false,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value.replace(/\D/g, '')),
      className:
        'border-none outline-none bg-transparent w-full text-right text-[15px] font-medium text-cg-text',
      style: { fontVariantNumeric: 'tabular-nums' },
    })
  );
}

/** Chip de diferencia (falta/sobra/exacta), reutilizado por el modo cerrado y el editable. */
function diffChipNode(difference: number) {
  const short = difference < -EPSILON;
  const over = difference > EPSILON;
  return h(
    'span',
    {
      className: `ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium ${
        short
          ? 'bg-cg-red-soft text-cg-red-deep'
          : over
            ? 'bg-cg-gold-soft text-cg-gold-deep'
            : 'bg-cg-success-bg text-cg-success'
      }`,
      style: { fontVariantNumeric: 'tabular-nums' },
    },
    h(UI.DynamicIcon, {
      icon: short ? 'ArrowUpFromLine' : over ? 'ArrowDownToLine' : 'Check',
      size: 13,
    }),
    short
      ? `Falta ${formatMoney(Math.abs(difference))}`
      : over
        ? `Sobra ${formatMoney(difference)}`
        : 'Caja exacta'
  );
}

/**
 * Cierre de caja (arqueo del efectivo): panel SECUNDARIO plegable.
 *
 * COONG-249 — el cierre es un snapshot con autoridad: un día cerrado muestra lo GUARDADO,
 * no un recálculo en vivo; movimientos posteriores se avisan como drift. Re-cerrar pide
 * confirmación.
 *
 * COONG-250 — el cierre deja la caja lista para mañana: al contar se decide cuánto se
 * retira (Salida automática) y cuánto queda de fondo (`next_float`), que pre-carga el
 * fondo inicial del próximo día. Un día sin movimientos de efectivo cierra sin conteo.
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
  const [editing, setEditing] = useState(false);
  const [forceCount, setForceCount] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [counted, setCounted] = useState('');
  const [withdraw, setWithdraw] = useState('');
  const [busy, setBusy] = useState(false);
  const [redoOpen, setRedoOpen] = useState(false);
  const [defaultFloat, setDefaultFloat] = useState('0');
  const { prevFloat } = usePrevFloat(businessDay);

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

  // Fondo inicial: el que dejó el cierre anterior; si no hay, el default de settings.
  const inheritedFloat = prevFloat !== null ? String(Math.round(prevFloat)) : defaultFloat;

  useEffect(() => {
    setEditing(false);
    setForceCount(false);
    setOpeningFloat(
      existingClose ? String(Math.round(Number(existingClose.openingFloat) || 0)) : inheritedFloat
    );
    setCounted('');
    setWithdraw('');
  }, [existingClose, businessDay, inheritedFloat]);

  // Snapshot guardado (verdad del cierre) vs números en vivo (para el modo editable).
  const snapOpening = existingClose ? Number(existingClose.openingFloat) || 0 : 0;
  const snapExpected = existingClose ? Number(existingClose.expectedCash) || 0 : 0;
  const snapCounted = existingClose ? Number(existingClose.countedCash) || 0 : 0;
  const snapDiff = existingClose ? Number(existingClose.difference) || 0 : 0;
  const snapWithdrawn = existingClose ? Number(existingClose.withdrawn) || 0 : 0;
  const snapNextFloat =
    existingClose && existingClose.nextFloat !== null ? Number(existingClose.nextFloat) : null;

  const floatNum = digits(openingFloat);
  const liveExpected = floatNum + efectivoCobrado - egresos;
  const hasCounted = counted.trim() !== '';
  const countedNum = digits(counted);
  const difference = hasCounted ? countedNum - liveExpected : 0;
  // Retiro acotado a lo contado; el fondo de mañana es lo que no se retira.
  const withdrawNum = Math.min(digits(withdraw), countedNum);
  const nextFloatNum = Math.max(countedNum - withdrawNum, 0);

  const showSnapshot = !!existingClose && !editing;
  const noCashDay = efectivoCobrado === 0 && egresos === 0;
  const showQuick = !existingClose && !editing && noCashDay && !forceCount;

  // Drift: ¿el esperado de hoy sigue siendo el del snapshot? El retiro automático del
  // cierre es un egreso del día que ocurrió AL cerrar — se suma de vuelta para no
  // auto-acusar drift por la propia Salida que generó el cierre.
  const driftExpected = snapOpening + efectivoCobrado - egresos + snapWithdrawn;
  const hasDrift = !!existingClose && Math.abs(driftExpected - snapExpected) > EPSILON;

  const headerExpected = showSnapshot ? snapExpected : liveExpected;

  const confirmRedo = () => {
    setRedoOpen(false);
    setOpeningFloat(String(Math.round(snapOpening)));
    setCounted('');
    setWithdraw('');
    setEditing(true);
  };

  const persist = async (payload: {
    countedCash: number;
    difference: number;
    withdrawn: number;
    nextFloat: number;
  }) => {
    setBusy(true);
    try {
      await actions.execute('billing.cashCloses.record', {
        businessDay,
        openingFloat: String(floatNum),
        expectedCash: String(liveExpected),
        countedCash: String(payload.countedCash),
        difference: String(payload.difference),
        withdrawn: String(payload.withdrawn),
        nextFloat: String(payload.nextFloat),
      });
      toast(
        'Caja cerrada',
        payload.withdrawn > 0
          ? `Retiro de ${formatMoney(payload.withdrawn)} registrado en Salidas. Mañana arranca con ${formatMoney(payload.nextFloat)}.`
          : `Mañana la caja arranca con ${formatMoney(payload.nextFloat)}.`,
        'success'
      );
      setEditing(false);
      setForceCount(false);
      await reload();
    } catch {
      toast('No se pudo cerrar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!hasCounted) {
      toast('Falta el conteo', 'Ingresá cuánto efectivo contaste.', 'info');
      return;
    }
    await persist({
      countedCash: countedNum,
      difference,
      withdrawn: withdrawNum,
      nextFloat: nextFloatNum,
    });
  };

  // Día sin movimientos de efectivo: cerrar sin contar (contado = esperado = fondo).
  const quickSave = async () => {
    await persist({
      countedCash: liveExpected,
      difference: 0,
      withdrawn: 0,
      nextFloat: liveExpected,
    });
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

  const money = (n: number, cls = 'text-cg-text') =>
    h(
      'span',
      { className: `text-[15px] ${cls}`, style: { fontVariantNumeric: 'tabular-nums' } },
      formatMoney(n)
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
        showSnapshot ? 'Esperado al cierre' : 'Esperado'
      ),
      h(
        'span',
        {
          className: 'text-base font-medium text-cg-text',
          style: { fontVariantNumeric: 'tabular-nums' },
        },
        formatMoney(headerExpected)
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

  // Aviso de movimientos posteriores al cierre (en vez de recalcular en silencio).
  const driftNote = hasDrift
    ? h(
        'div',
        {
          className:
            'flex items-start gap-2 mt-3 px-3.5 py-3 rounded-lg bg-cg-gold-soft border border-cg-gold-lt text-[12.5px] text-cg-gold-deep leading-snug',
        },
        h(UI.DynamicIcon, { icon: 'TriangleAlert', size: 14, className: 'flex-shrink-0 mt-0.5' }),
        h(
          'span',
          null,
          'Hubo movimientos de efectivo después de este cierre: con los números de ahora el esperado sería ',
          h(
            'strong',
            { className: 'font-medium', style: { fontVariantNumeric: 'tabular-nums' } },
            formatMoney(driftExpected)
          ),
          '. Si corresponde, rehacé el cierre.'
        )
      )
    : null;

  // ── Cuerpo: día CERRADO → snapshot de solo lectura ──
  const closedBody = h(
    'div',
    { className: 'px-5 pb-5 pt-1 border-t border-cg-border' },
    arqRow('Fondo inicial', money(snapOpening), { hint: 'con qué empezó la caja' }),
    arqRow('Esperado al cierre', money(snapExpected)),
    arqRow('Contado', money(snapCounted), { hint: 'lo que se contó en el cajón' }),
    sep,
    h(
      'div',
      { className: 'flex items-center gap-3.5 py-2.5' },
      h('span', { className: 'text-sm font-medium text-cg-text' }, 'Diferencia'),
      diffChipNode(snapDiff)
    ),
    snapWithdrawn > 0 || snapNextFloat !== null ? sep : null,
    snapWithdrawn > 0
      ? arqRow('Retirado al cierre', money(snapWithdrawn, 'text-cg-text-secondary'), {
          hint: 'registrado como Salida',
        })
      : null,
    snapNextFloat !== null
      ? arqRow('Fondo para mañana', money(snapNextFloat, 'text-cg-gold-deep'), {
          hint: 'pre-carga el próximo cierre',
        })
      : null,
    driftNote,
    h(
      'div',
      { className: 'flex justify-end mt-4' },
      h(
        UI.Button,
        { variant: 'outline', size: 'sm', onClick: () => setRedoOpen(true), className: 'gap-1.5' },
        h(UI.DynamicIcon, { icon: 'RotateCcw', size: 13 }),
        'Rehacer cierre'
      )
    )
  );

  // Confirmación de re-cierre con el dialog del core (no window.confirm).
  const redoDialog = existingClose
    ? h(UI.ConfirmDialog, {
        open: redoOpen,
        onOpenChange: setRedoOpen,
        title: 'Rehacer el cierre de caja',
        description: h(
          'span',
          null,
          'Vas a rehacer el cierre de las ',
          h('strong', { className: 'font-medium' }, hhmm(existingClose.closedAt)),
          ' (esperado ',
          h(
            'strong',
            { className: 'font-medium', style: { fontVariantNumeric: 'tabular-nums' } },
            formatMoney(snapExpected)
          ),
          ', contado ',
          h(
            'strong',
            { className: 'font-medium', style: { fontVariantNumeric: 'tabular-nums' } },
            formatMoney(snapCounted)
          ),
          '). El cierre anterior se pisa y no queda registro.'
        ),
        confirmLabel: 'Rehacer cierre',
        onConfirm: confirmRedo,
      })
    : null;

  // ── Cuerpo: día SIN efectivo → cierre de un click ──
  const quickBody = h(
    'div',
    { className: 'px-5 pb-5 pt-1 border-t border-cg-border' },
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
        'Hoy no hubo movimientos de efectivo — no hay nada que contar. ',
        digitalCobrado > 0
          ? h(
              'span',
              null,
              'Lo digital del día (',
              h(
                'strong',
                {
                  className: 'font-medium text-cg-text',
                  style: { fontVariantNumeric: 'tabular-nums' },
                },
                formatMoney(digitalCobrado)
              ),
              ') va al banco.'
            )
          : null
      )
    ),
    arqRow('Fondo en el cajón', moneyInput(openingFloat, setOpeningFloat), {
      hint: 'queda igual para mañana',
    }),
    h(
      'div',
      { className: 'flex items-center justify-end gap-2 mt-4' },
      h(
        UI.Button,
        { variant: 'outline', size: 'sm', disabled: busy, onClick: () => setForceCount(true) },
        'Contar igual'
      ),
      h(
        UI.Button,
        {
          variant: 'brand',
          size: 'sm',
          disabled: busy,
          onClick: () => void quickSave(),
          className: 'gap-1.5',
        },
        h(UI.DynamicIcon, { icon: 'Lock', size: 13 }),
        'Cerrar sin conteo'
      )
    )
  );

  // ── Cuerpo: día abierto (o rehaciendo) → formulario editable ──
  const editDiffChip = !hasCounted
    ? h('span', { className: 'ml-auto text-[12.5px] text-cg-text-muted' }, 'Ingresá lo contado')
    : diffChipNode(difference);

  const editBody = h(
    'div',
    { className: 'px-5 pb-5 pt-1 border-t border-cg-border' },
    arqRow('Fondo inicial', moneyInput(openingFloat, setOpeningFloat), {
      hint:
        !existingClose && prevFloat !== null
          ? 'heredado del cierre anterior'
          : 'con qué empezó la caja',
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
      'Egresos en efectivo',
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
        formatMoney(liveExpected)
      ),
      { total: true }
    ),
    arqRow('Contado', moneyInput(counted, setCounted, { placeholder: '—' }), {
      hint: 'lo que contás en el cajón',
    }),
    sep,
    h(
      'div',
      { className: 'flex items-center gap-3.5 py-2.5' },
      h('span', { className: 'text-sm font-medium text-cg-text' }, 'Diferencia'),
      editDiffChip
    ),
    // ¿Qué hacés con el efectivo? Retiro (Salida automática) + fondo que queda.
    sep,
    arqRow(
      'Retirás',
      moneyInput(withdraw, setWithdraw, { placeholder: '0', disabled: !hasCounted }),
      { hint: 'se registra como Salida' }
    ),
    arqRow(
      'Dejás de fondo',
      moneyInput(
        hasCounted ? String(nextFloatNum) : '',
        (v) => setWithdraw(String(Math.max(countedNum - digits(v), 0))),
        { placeholder: '—', disabled: !hasCounted }
      ),
      { hint: 'mañana la caja arranca con esto' }
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
      { className: 'flex items-center justify-end gap-2 mt-4' },
      editing || forceCount
        ? h(
            UI.Button,
            {
              variant: 'outline',
              size: 'sm',
              disabled: busy,
              onClick: () => {
                setEditing(false);
                setForceCount(false);
              },
            },
            'Cancelar'
          )
        : null,
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
        existingClose ? 'Guardar nuevo cierre' : 'Cerrar caja'
      )
    )
  );

  const body = open ? (showSnapshot ? closedBody : showQuick ? quickBody : editBody) : null;

  return h(
    'div',
    {
      className: `rounded-xl border border-cg-border overflow-hidden ${
        open ? 'bg-cg-surface' : 'bg-cg-bg-hover'
      }`,
    },
    head,
    body,
    redoDialog
  );
}
