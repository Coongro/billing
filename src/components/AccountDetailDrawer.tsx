import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import {
  PAYMENT_METHODS,
  METHOD_LABEL,
  LINE_SOURCE_LABEL,
  ACCOUNT_SOURCE_LABEL,
} from '../constants.js';
import { formatMoney, formatDate } from '../utils/money.js';
import { toast } from '../utils/toast.js';

const React = getHostReact();
const { useState, useEffect, useCallback } = React;
const h = React.createElement;

interface AccountLine {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  subtotal: string;
  source_type: string;
}
interface Payment {
  id: string;
  amount: string;
  method: string;
  paid_at: string;
}
interface AccountDetail {
  account: { id: string; status: string; source: string };
  lines: AccountLine[];
  total: string;
  paid: string;
  balance: string;
  paymentStatus: string;
  payments: Payment[];
}

interface AccountDetailDrawerProps {
  /** Cuenta a mostrar; null = cerrado. */
  accountId: string | null;
  /** Encabezado de contexto (cliente · mascota), resuelto por el caller. */
  subtitle?: string;
  /** Datos de contexto para el avatar + meta del header (los provee la lista). */
  clientName?: string;
  petName?: string | null;
  source?: string;
  openedAt?: string;
  onClose: () => void;
  /** Se llama tras cambios (línea / pago / cierre) para refrescar la lista. */
  onChanged: () => void;
}

// Neutros = tokens del repo (dark mode). Acentos = paleta del diseño.
const N = {
  100: 'var(--cg-bg-secondary)',
  200: 'var(--cg-bg-secondary)',
  300: 'var(--cg-border)',
  500: 'var(--cg-text-muted)',
  700: 'var(--cg-text)',
  950: 'var(--cg-text)',
  white: 'var(--cg-bg)',
};
const PAL = {
  teal: { soft: '#d7f2ec', deep: '#0f766e' },
  gold: { soft: '#fbeecb', lt: '#f0dca0', deep: '#b45309', dk: '#d97706' },
  sky: { soft: '#e2f0fb', deep: '#0369a1' },
  pink: { soft: '#fbe4ee', deep: '#be185d' },
  red: { soft: '#fbe3e1', deep: '#b91c1c' },
};
const MONO = "'SF Mono', ui-monospace, 'Menlo', monospace";

// Origen de la línea → icono del chip (Lucide).
const LINE_ICON: Record<string, string> = {
  fee: 'Stethoscope',
  service: 'PawPrint',
  vaccine: 'Syringe',
  product: 'Package',
};
// Medio de pago → icono.
const MEDIO_ICON: Record<string, string> = {
  efectivo: 'Banknote',
  transferencia: 'ArrowLeftRight',
  debito: 'CreditCard',
  credito: 'CreditCard',
};

// Tinte decorativo del avatar (sky / pink / teal) según un hash del nombre.
const AVATAR_TINTS = [
  { bg: PAL.sky.soft, fg: PAL.sky.deep },
  { bg: PAL.pink.soft, fg: PAL.pink.deep },
  { bg: PAL.teal.soft, fg: PAL.teal.deep },
];
function tintFor(str: string) {
  let sum = 0;
  for (const c of str || 'x') sum += c.charCodeAt(0);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

const SECTION_LABEL: any = {
  fontSize: '10.5px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: N[500],
};

/**
 * Drawer de detalle de una cuenta de cobro (diseño Claude Design "Cobros · Cuentas"):
 * contexto con avatar, líneas de cobro con chip por origen, tarjeta de totales
 * (Total − Pagado = Saldo / "Pagada"), pagos registrados y cobro inline con montos
 * rápidos + medios. Mantiene la lógica de billing (líneas, pagos, anulación).
 */
export function AccountDetailDrawer({
  accountId,
  subtitle,
  clientName,
  petName,
  source,
  openedAt,
  onClose,
  onChanged,
}: AccountDetailDrawerProps) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('efectivo');

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await actions.execute<AccountDetail | undefined>('billing.accounts.getWithLines', {
        id: accountId,
      });
      setDetail(d ?? null);
    } catch {
      // No tragar el error como "cuenta vacía": un 401 (sesión vencida) o caída de red mostraba
      // "$0 / sin líneas" y el usuario creía que perdió el cobro. Mostramos error real + reintento.
      setError('No se pudo cargar la cuenta. Reintentá o volvé a iniciar sesión.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    // Reset del estado efímero al cambiar de cuenta (el drawer se reutiliza).
    setShowPay(false);
    if (accountId) void load();
    else setDetail(null);
  }, [accountId, load]);

  const removeLine = useCallback(
    async (lineId: string) => {
      setBusy(true);
      try {
        await actions.execute('billing.lines.delete', { id: lineId });
        await load();
        onChanged();
      } catch {
        toast('No se pudo quitar', 'Intentá de nuevo.', 'info');
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged]
  );

  const openPayForm = useCallback(() => {
    const b = detail ? Math.max(0, Number(detail.balance)) : 0;
    setPayAmount(b > 0 ? Math.round(b) : 0);
    setPayMethod('efectivo');
    setShowPay(true);
  }, [detail]);

  const registerPayment = useCallback(async () => {
    if (!accountId) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast('Monto inválido', 'Ingresá un monto mayor a 0.', 'info');
      return;
    }
    setBusy(true);
    try {
      await actions.execute('billing.payments.record', {
        accountId,
        amount: String(amt),
        method: payMethod,
      });
      toast('Cobro registrado', `Se registró ${formatMoney(amt)}.`, 'success');
      setShowPay(false);
      await load();
      onChanged();
    } catch {
      toast('No se pudo registrar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  }, [accountId, payAmount, payMethod, load, onChanged]);

  const removePayment = useCallback(
    async (paymentId: string) => {
      setBusy(true);
      try {
        await actions.execute('billing.payments.delete', { id: paymentId });
        await load();
        onChanged();
      } catch {
        toast('No se pudo anular', 'Intentá de nuevo.', 'info');
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged]
  );

  const totalNum = Number(detail?.total ?? 0);
  const paidNum = Number(detail?.paid ?? 0);
  const balanceNum = Number(detail?.balance ?? 0);
  const hasBalance = balanceNum > 0.005;
  const isPaid = detail?.paymentStatus === 'paid';

  const tint = tintFor(petName || clientName || '?');
  const initial = (petName || clientName || '?').trim().charAt(0).toUpperCase();
  const originLabel = source ? (ACCOUNT_SOURCE_LABEL[source] ?? source) : null;

  // ── Línea de cobro ──
  const lineRow = (l: AccountLine) => {
    const origen = LINE_SOURCE_LABEL[l.source_type] ?? 'Otro';
    return h(
      'div',
      {
        key: l.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 0',
          borderBottom: `0.5px solid ${N[300]}`,
        },
      },
      h(
        'span',
        {
          style: {
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            flexShrink: 0,
            background: N[100],
            color: N[700],
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        h(UI.DynamicIcon, { icon: LINE_ICON[l.source_type] ?? 'Box', size: 16 } as any)
      ),
      h(
        'div',
        { style: { minWidth: 0, flex: 1 } },
        h(
          'div',
          { style: { fontSize: '14px', fontWeight: 500, color: N[950], lineHeight: 1.3 } },
          l.description
        ),
        h(
          'div',
          { style: { fontSize: '12px', color: N[500], marginTop: '3px' } },
          `${origen} · ${l.quantity} × ${formatMoney(l.unit_price)}`
        )
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '6px',
            flexShrink: 0,
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: '14px',
              fontWeight: 500,
              color: N[950],
              fontFamily: MONO,
              whiteSpace: 'nowrap',
            },
          },
          formatMoney(l.subtotal)
        ),
        h(
          'button',
          {
            onClick: () => void removeLine(l.id),
            disabled: busy,
            title: 'Quitar línea',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '11.5px',
              color: N[500],
              padding: '2px 4px',
              borderRadius: '5px',
            },
          } as any,
          h(UI.DynamicIcon, { icon: 'Trash2', size: 12 } as any),
          'Quitar'
        )
      )
    );
  };

  // ── Totales (card) ──
  const totalRow = (label: any, value: string, color?: string) =>
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      h('span', { style: { fontSize: '13px', color: N[700] } }, label),
      h(
        'span',
        { style: { fontFamily: MONO, fontSize: '14px', fontWeight: 500, color: color ?? N[950] } },
        value
      )
    );

  const totalesCard = h(
    'div',
    {
      style: {
        border: `0.5px solid ${N[300]}`,
        borderRadius: '12px',
        padding: '14px 16px',
        background: N.white,
      },
    },
    totalRow('Total', formatMoney(totalNum)),
    paidNum > 0
      ? h(
          'div',
          { style: { marginTop: '8px' } },
          totalRow(
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
              h(
                'span',
                {
                  style: {
                    width: '16px',
                    height: '16px',
                    borderRadius: '999px',
                    background: PAL.teal.soft,
                    color: PAL.teal.deep,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                },
                h(UI.DynamicIcon, { icon: 'Check', size: 11 } as any)
              ),
              'Pagado'
            ),
            `− ${formatMoney(paidNum)}`,
            PAL.teal.deep
          )
        )
      : null,
    h('div', { style: { borderTop: `0.5px dashed ${N[300]}`, margin: '12px 0' } }),
    isPaid
      ? h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h(
            'span',
            {
              style: {
                width: '34px',
                height: '34px',
                borderRadius: '999px',
                background: PAL.teal.soft,
                color: PAL.teal.deep,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              },
            },
            h(UI.DynamicIcon, { icon: 'Check', size: 18 } as any)
          ),
          h(
            'div',
            null,
            h(
              'div',
              { style: { fontSize: '18px', fontWeight: 700, color: PAL.teal.deep, lineHeight: 1 } },
              'Pagada'
            ),
            h(
              'div',
              { style: { fontSize: '12px', color: N[500], marginTop: '4px' } },
              'Cuenta saldada por completo'
            )
          )
        )
      : h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' } },
          h(
            'div',
            null,
            h('span', { style: { ...SECTION_LABEL, display: 'block' } }, 'Saldo pendiente'),
            paidNum > 0
              ? h(
                  'span',
                  { style: { fontSize: '11.5px', color: PAL.gold.deep } },
                  'Cobro parcial registrado'
                )
              : null
          ),
          h(
            'span',
            { style: { fontFamily: MONO, fontSize: '22px', fontWeight: 700, color: PAL.red.deep } },
            formatMoney(balanceNum)
          )
        )
  );

  // ── Pago registrado ──
  const pagoRow = (p: Payment) =>
    h(
      'div',
      {
        key: p.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 0',
          borderTop: `0.5px solid ${N[200]}`,
        },
      },
      h(
        'span',
        {
          style: {
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            flexShrink: 0,
            background: PAL.teal.soft,
            color: PAL.teal.deep,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        h(UI.DynamicIcon, { icon: MEDIO_ICON[p.method] ?? 'Wallet', size: 15 } as any)
      ),
      h(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        h(
          'div',
          { style: { fontSize: '13px', color: N[950], fontWeight: 500 } },
          METHOD_LABEL[p.method] ?? p.method
        ),
        h('div', { style: { fontSize: '11.5px', color: N[500] } }, formatDate(p.paid_at))
      ),
      h(
        'span',
        { style: { fontFamily: MONO, fontSize: '13.5px', color: N[950], fontWeight: 500 } },
        formatMoney(p.amount)
      ),
      h(
        'button',
        {
          onClick: () => void removePayment(p.id),
          disabled: busy,
          title: 'Anular pago',
          style: {
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '11.5px',
            color: N[500],
            padding: '2px 6px',
            borderRadius: '5px',
          },
        } as any,
        'Anular'
      )
    );

  // ── Form de cobro inline ──
  const quickBtn = (label: string, on: boolean, onClick: () => void) =>
    h(
      'button',
      {
        onClick,
        style: {
          border: `0.5px solid ${on ? N[950] : N[300]}`,
          background: on ? N[950] : N.white,
          color: on ? N.white : N[700],
          borderRadius: '7px',
          padding: '5px 10px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
        },
      } as any,
      label
    );

  const cobroForm = h(
    'div',
    {
      style: {
        marginTop: '14px',
        padding: '16px',
        border: `0.5px solid ${PAL.gold.lt}`,
        background: PAL.gold.soft,
        borderRadius: '12px',
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: PAL.gold.deep,
          marginBottom: '12px',
        },
      },
      h(UI.DynamicIcon, { icon: 'Wallet', size: 14 } as any),
      'Registrar cobro'
    ),
    // Monto
    h(
      'label',
      { style: { ...SECTION_LABEL, display: 'block', marginBottom: '7px' } },
      'Cuánto cobrás'
    ),
    h(
      'div',
      { style: { position: 'relative' } },
      h(
        'span',
        {
          style: {
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: N[500],
            fontSize: '15px',
          },
        },
        '$'
      ),
      h('input', {
        value: payAmount ? payAmount.toLocaleString('es-AR') : '',
        inputMode: 'numeric',
        placeholder: '0',
        onChange: (e: any) => {
          const digits = String(e.target.value).replace(/[^\d]/g, '');
          setPayAmount(digits ? parseInt(digits, 10) : 0);
        },
        style: {
          width: '100%',
          padding: '10px 12px 10px 26px',
          border: `0.5px solid ${payAmount > balanceNum ? PAL.red.deep : N[300]}`,
          borderRadius: '9px',
          background: N.white,
          color: N[950],
          fontSize: '16px',
          fontFamily: MONO,
          boxSizing: 'border-box',
        },
      } as any)
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' } },
      quickBtn('Saldo completo', payAmount === Math.round(balanceNum), () =>
        setPayAmount(Math.round(balanceNum))
      ),
      quickBtn('Mitad', payAmount === Math.round(balanceNum / 2), () =>
        setPayAmount(Math.round(balanceNum / 2))
      ),
      h(
        'span',
        {
          style: {
            marginLeft: 'auto',
            fontSize: '11.5px',
            color: payAmount > balanceNum ? PAL.red.deep : N[500],
          },
        },
        payAmount > balanceNum ? 'Supera el saldo' : `Saldo ${formatMoney(balanceNum)}`
      )
    ),
    // Medios
    h('label', { style: { ...SECTION_LABEL, display: 'block', margin: '16px 0 7px' } }, 'Con qué'),
    h(
      'div',
      { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' } },
      ...PAYMENT_METHODS.map((m) => {
        const sel = payMethod === m.value;
        return h(
          'button',
          {
            key: m.value,
            onClick: () => setPayMethod(m.value),
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 12px',
              border: `0.5px solid ${sel ? PAL.gold.dk : N[300]}`,
              background: N.white,
              color: N[950],
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: sel ? `0 0 0 1px ${PAL.gold.dk}` : undefined,
            },
          } as any,
          h(UI.DynamicIcon, {
            icon: MEDIO_ICON[m.value] ?? 'Wallet',
            size: 16,
            style: { color: sel ? PAL.gold.deep : N[500] },
          } as any),
          m.label
        );
      })
    ),
    // Acciones
    h(
      'div',
      { style: { display: 'flex', gap: '8px', marginTop: '18px' } },
      h(
        UI.Button,
        {
          variant: 'outline',
          disabled: busy,
          onClick: () => setShowPay(false),
          style: { flex: 1 },
        } as any,
        'Cancelar'
      ),
      h(
        UI.Button,
        {
          variant: 'brand',
          disabled: busy || !(payAmount > 0),
          onClick: () => void registerPayment(),
          style: { flex: 1.5 },
        } as any,
        h(UI.DynamicIcon, { icon: 'Check', size: 15, className: 'mr-1' } as any),
        payAmount > 0 ? `Cobrar ${formatMoney(payAmount)}` : 'Cobrar'
      )
    )
  );

  return h(
    UI.Sheet,
    {
      open: accountId !== null,
      onOpenChange: (v: boolean) => !v && onClose(),
      side: 'right',
    } as any,
    h(
      UI.SheetContent,
      {
        style: {
          width: '480px',
          maxWidth: '94vw',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        },
      } as any,

      // ── Header ──
      h(
        'div',
        {
          style: {
            padding: '22px 24px 16px',
            borderBottom: `0.5px solid ${N[200]}`,
            flexShrink: 0,
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h(
            'span',
            {
              style: {
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: PAL.gold.deep,
              },
            },
            'COBRO'
          )
        ),
        h(
          UI.SheetTitle,
          {
            style: { fontSize: '20px', fontWeight: 700, color: N[950], margin: '4px 0 16px' },
          } as any,
          'Detalle de la cuenta'
        ),
        // Contexto: avatar + cliente + meta
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h(
            'span',
            {
              style: {
                width: '42px',
                height: '42px',
                borderRadius: '11px',
                flexShrink: 0,
                background: tint.bg,
                color: tint.fg,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '17px',
              },
            },
            initial
          ),
          h(
            'div',
            { style: { minWidth: 0 } },
            h(
              'div',
              { style: { fontSize: '14px', fontWeight: 500, color: N[950] } },
              clientName || subtitle || '—'
            ),
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: N[500],
                },
              },
              petName
                ? h(
                    'span',
                    { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                    h(UI.DynamicIcon, { icon: 'PawPrint', size: 13 } as any),
                    petName
                  )
                : null,
              originLabel
                ? h(
                    'span',
                    {
                      style: {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontWeight: 500,
                        fontSize: '11.5px',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        background: source === 'counter' ? PAL.gold.soft : N[100],
                        color: source === 'counter' ? PAL.gold.deep : N[700],
                      },
                    },
                    originLabel
                  )
                : null,
              openedAt
                ? h(
                    'span',
                    { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                    h(UI.DynamicIcon, { icon: 'Calendar', size: 13 } as any),
                    formatDate(openedAt)
                  )
                : null
            )
          )
        )
      ),

      // ── Body: líneas ──
      h(
        'div',
        { style: { flex: 1, overflowY: 'auto', padding: '16px 24px' } },
        loading
          ? h('p', { style: { fontSize: '13px', color: N[500] } }, 'Cargando…')
          : error
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    alignItems: 'flex-start',
                  },
                },
                h('p', { style: { fontSize: '13px', color: PAL.red.deep, margin: 0 } }, error),
                h(
                  UI.Button,
                  { variant: 'outline', size: 'sm', onClick: () => void load() } as any,
                  'Reintentar'
                )
              )
            : h(
                'div',
                null,
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    },
                  },
                  h('span', { style: SECTION_LABEL }, 'Líneas de cobro'),
                  detail && detail.lines.length > 0
                    ? h(
                        'span',
                        {
                          style: {
                            fontSize: '11px',
                            fontWeight: 600,
                            color: N[500],
                            background: N[100],
                            borderRadius: '999px',
                            padding: '1px 7px',
                          },
                        },
                        String(detail.lines.length)
                      )
                    : null
                ),
                !detail || detail.lines.length === 0
                  ? h(
                      'div',
                      {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '16px',
                          color: N[500],
                          fontSize: '13px',
                          border: `0.5px dashed ${N[300]}`,
                          borderRadius: '10px',
                          marginTop: '8px',
                        },
                      },
                      h(UI.DynamicIcon, { icon: 'Wallet', size: 20 } as any),
                      'Esta cuenta no tiene líneas de cobro.'
                    )
                  : h('div', null, ...detail.lines.map(lineRow))
              )
      ),

      // ── Footer ──
      detail && !error
        ? h(
            'div',
            { style: { flexShrink: 0, borderTop: `0.5px solid ${N[200]}`, padding: '16px 24px' } },
            totalesCard,
            detail.payments.length > 0
              ? h(
                  'div',
                  { style: { marginTop: '14px' } },
                  h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      },
                    },
                    h('span', { style: SECTION_LABEL }, 'Pagos'),
                    h(
                      'span',
                      {
                        style: {
                          fontSize: '11px',
                          fontWeight: 600,
                          color: N[500],
                          background: N[100],
                          borderRadius: '999px',
                          padding: '1px 7px',
                        },
                      },
                      String(detail.payments.length)
                    )
                  ),
                  h('div', null, ...detail.payments.map(pagoRow))
                )
              : null,
            showPay
              ? cobroForm
              : h(
                  'div',
                  { style: { display: 'flex', gap: '8px', marginTop: '14px' } },
                  hasBalance
                    ? h(
                        UI.Button,
                        {
                          variant: 'brand',
                          disabled: busy,
                          onClick: openPayForm,
                          style: { flex: 1 },
                        } as any,
                        h(UI.DynamicIcon, { icon: 'Wallet', size: 15, className: 'mr-1' } as any),
                        `Cobrar ${formatMoney(balanceNum)}`
                      )
                    : null,
                  h(
                    UI.Button,
                    {
                      variant: 'outline',
                      onClick: onClose,
                      style: { flex: hasBalance ? '0 0 auto' : 1 },
                    } as any,
                    'Cerrar'
                  )
                )
          )
        : null
    )
  );
}
