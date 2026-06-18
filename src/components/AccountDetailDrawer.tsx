import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { PAYMENT_METHODS, METHOD_LABEL } from '../constants.js';
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
  onClose: () => void;
  /** Se llama tras cambios (línea / pago / cierre) para refrescar la lista. */
  onChanged: () => void;
}

const mono = { fontFamily: 'var(--cg-font-mono, SF Mono, Menlo, monospace)' };
const fieldLabel = {
  display: 'block',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'var(--cg-text-muted)',
  marginBottom: '5px',
};

export function AccountDetailDrawer({
  accountId,
  subtitle,
  onClose,
  onChanged,
}: AccountDetailDrawerProps) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
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
    setPayAmount(b > 0 ? String(b) : '');
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

  const paidNum = Number(detail?.paid ?? 0);
  const hasBalance = Number(detail?.balance ?? 0) > 0.005;
  const isPaid = detail?.paymentStatus === 'paid';

  const payRow = (label: string, value: string, opts: { strong?: boolean } = {}) =>
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      h(
        'span',
        {
          style: {
            fontSize: '13px',
            color: opts.strong ? 'var(--cg-text)' : 'var(--cg-text-muted)',
          },
        },
        label
      ),
      h(
        'span',
        { style: { ...mono, fontWeight: opts.strong ? 700 : 500, fontSize: '13px' } },
        value
      )
    );

  // Fila de una línea de cobro (el origen ya lo indica el encabezado de su sección).
  const lineRow = (l: AccountLine) =>
    h(
      'div',
      {
        key: l.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '10px 12px',
          border: '1px solid var(--cg-border)',
          borderRadius: '8px',
        },
      },
      h(
        'div',
        { style: { minWidth: 0 } },
        h('div', { style: { fontSize: '13px', fontWeight: 500 } }, l.description),
        h(
          'div',
          { style: { fontSize: '11.5px', color: 'var(--cg-text-muted)', marginTop: '2px' } },
          `${l.quantity} × ${formatMoney(l.unit_price)}`
        )
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h(
          'span',
          { style: { ...mono, fontWeight: 600, fontSize: '13px' } },
          formatMoney(l.subtotal)
        ),
        h(
          UI.IconButton,
          {
            variant: 'ghost',
            size: 'sm',
            disabled: busy,
            'aria-label': `Quitar ${l.description}`,
            onClick: () => void removeLine(l.id),
          } as any,
          h(UI.DynamicIcon, { icon: 'Trash2', size: 13 } as any)
        )
      )
    );

  // Agrupa las líneas por origen (Servicios / Vacunas / Productos) para el checkout.
  const groupedLines = (lines: AccountLine[]) => {
    const GROUPS: { label: string; types: string[] }[] = [
      { label: 'Servicios', types: ['fee', 'service'] },
      { label: 'Vacunas', types: ['vaccine'] },
      { label: 'Productos', types: ['product'] },
    ];
    const seen = new Set<string>();
    const sections: { label: string; items: AccountLine[] }[] = [];
    for (const g of GROUPS) {
      const items = lines.filter((l) => g.types.includes(l.source_type));
      items.forEach((l) => seen.add(l.id));
      if (items.length) sections.push({ label: g.label, items });
    }
    const rest = lines.filter((l) => !seen.has(l.id));
    if (rest.length) sections.push({ label: 'Otros', items: rest });
    return sections.map((s) =>
      h(
        'div',
        {
          key: s.label,
          style: { display: 'flex', flexDirection: 'column', gap: '8px' },
        },
        h(
          'div',
          {
            style: {
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--cg-text-muted)',
            },
          },
          s.label
        ),
        ...s.items.map((l) => lineRow(l))
      )
    );
  };

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
        style: { width: '460px', maxWidth: '92vw', display: 'flex', flexDirection: 'column' },
      } as any,

      h(
        UI.SheetHeader,
        null,
        h(
          'div',
          null,
          h(
            'div',
            {
              style: {
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--cg-text-muted)',
                marginBottom: '4px',
              },
            },
            'COBRO'
          ),
          h(
            UI.SheetTitle,
            null,
            h(
              'span',
              { className: 'font-serif font-black tracking-tight', style: { fontSize: '21px' } },
              'Cobro de la visita'
            )
          ),
          subtitle &&
            h(
              'p',
              { style: { fontSize: '12.5px', color: 'var(--cg-text-muted)', margin: '4px 0 0' } },
              subtitle
            )
        )
      ),

      // Líneas
      h(
        'div',
        { style: { flex: 1, overflow: 'auto', padding: '16px 24px' } },
        loading
          ? h('p', { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } }, 'Cargando…')
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
                h(
                  'p',
                  { style: { fontSize: '13px', color: 'var(--cg-danger)', margin: 0 } },
                  error
                ),
                h(
                  UI.Button,
                  { variant: 'outline', size: 'sm', onClick: () => void load() } as any,
                  'Reintentar'
                )
              )
            : !detail || detail.lines.length === 0
              ? h(
                  'p',
                  { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } },
                  'Esta cuenta no tiene líneas de cobro.'
                )
              : h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
                  ...groupedLines(detail.lines)
                )
      ),

      // Totales + pagos + acciones (solo con cuenta cargada; en error/no-cargada no mostramos $0)
      detail &&
        h(
          'div',
          {
            style: { flexShrink: 0, borderTop: '1px solid var(--cg-border)', padding: '16px 24px' },
          },

          // Totales
          h(
            'div',
            {
              style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
            },
            payRow('Total', formatMoney(detail?.total), { strong: !hasBalance && !isPaid }),
            paidNum > 0 && payRow('Pagado', formatMoney(detail?.paid)),
            hasBalance &&
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    paddingTop: '8px',
                    marginTop: '2px',
                    borderTop: '1px dashed var(--cg-border)',
                  },
                },
                h('span', { style: { fontSize: '13px', fontWeight: 600 } }, 'Saldo'),
                h(
                  'span',
                  {
                    style: {
                      ...mono,
                      fontSize: '20px',
                      fontWeight: 700,
                      color: 'var(--cg-danger)',
                    },
                  },
                  formatMoney(detail?.balance)
                )
              ),
            isPaid &&
              paidNum > 0 &&
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'flex-end',
                    paddingTop: '8px',
                    marginTop: '2px',
                    borderTop: '1px dashed var(--cg-border)',
                  },
                },
                h(UI.Badge, { variant: 'paid' } as any, 'Pagada')
              )
          ),

          // Mini-lista de pagos
          detail &&
            detail.payments.length > 0 &&
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginBottom: '14px',
                },
              },
              h(
                'div',
                {
                  style: {
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--cg-text-muted)',
                  },
                },
                'Pagos'
              ),
              ...detail.payments.map((p) =>
                h(
                  'div',
                  {
                    key: p.id,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    },
                  },
                  h(
                    'div',
                    null,
                    h(
                      'span',
                      { style: { fontSize: '12.5px' } },
                      METHOD_LABEL[p.method] ?? p.method
                    ),
                    h(
                      'span',
                      {
                        style: {
                          fontSize: '11.5px',
                          color: 'var(--cg-text-muted)',
                          marginLeft: '6px',
                        },
                      },
                      formatDate(p.paid_at)
                    )
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    h(
                      'span',
                      { style: { ...mono, fontWeight: 600, fontSize: '12.5px' } },
                      formatMoney(p.amount)
                    ),
                    h(
                      UI.IconButton,
                      {
                        variant: 'ghost',
                        size: 'sm',
                        disabled: busy,
                        'aria-label': 'Anular pago',
                        onClick: () => void removePayment(p.id),
                      } as any,
                      h(UI.DynamicIcon, { icon: 'Trash2', size: 13 } as any)
                    )
                  )
                )
              )
            ),

          // Form de cobro inline, o botones de acción
          showPay
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                h(
                  'div',
                  null,
                  h('label', { style: fieldLabel }, 'Cuánto cobrás'),
                  h(UI.Input, {
                    type: 'number',
                    size: 'sm',
                    min: 0,
                    step: '0.01',
                    value: payAmount,
                    onChange: (e: any) => setPayAmount(e.target.value),
                  } as any)
                ),
                h(
                  'div',
                  null,
                  h('label', { style: fieldLabel }, 'Con qué'),
                  h(UI.SegmentedControl, {
                    value: payMethod,
                    options: PAYMENT_METHODS,
                    onChange: (v: string) => setPayMethod(v),
                    size: 'sm',
                    'aria-label': 'Medio de pago',
                  } as any)
                ),
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'flex-end',
                      flexWrap: 'wrap',
                    },
                  },
                  h(
                    UI.Button,
                    {
                      variant: 'ghost',
                      size: 'sm',
                      disabled: busy,
                      onClick: () => setShowPay(false),
                    } as any,
                    'Cancelar'
                  ),
                  h(
                    UI.Button,
                    {
                      variant: 'brand',
                      size: 'sm',
                      disabled: busy,
                      onClick: () => void registerPayment(),
                    } as any,
                    'Cobrar'
                  )
                )
              )
            : h(
                'div',
                {
                  style: {
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap',
                  },
                },
                h(UI.Button, { variant: 'outline', onClick: onClose } as any, 'Cerrar'),
                hasBalance &&
                  h(
                    UI.Button,
                    { variant: 'brand', disabled: busy, onClick: openPayForm } as any,
                    h(UI.DynamicIcon, { icon: 'Wallet', size: 13 } as any),
                    ' Cobrar'
                  )
              )
        )
    )
  );
}
