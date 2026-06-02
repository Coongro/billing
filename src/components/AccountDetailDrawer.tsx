import { getHostReact, getHostUI, actions } from '@coongro/plugin-sdk';

const UI = getHostUI();
import { formatMoney } from '../utils/money.js';

const React = getHostReact();
const { useState, useEffect, useCallback } = React;
const h = React.createElement;

const MODULE_ID = '@coongro/billing';

function toast(title: string, message: string, type: 'success' | 'info'): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const host = (globalThis as any).coongro?.toast as
    | {
        show?: (opts: { title: string; message: string; type?: string; moduleId?: string }) => void;
      }
    | undefined;
  host?.show?.({ title, message, type, moduleId: MODULE_ID });
}

interface AccountLine {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  subtotal: string;
  source_type: string;
}
interface AccountDetail {
  account: { id: string; status: string; source: string };
  lines: AccountLine[];
  total: string;
}

const SOURCE_LABEL: Record<string, string> = {
  fee: 'Honorario',
  service: 'Servicio',
  vaccine: 'Vacuna',
  product: 'Producto',
};

interface AccountDetailDrawerProps {
  /** Cuenta a mostrar; null = cerrado. */
  accountId: string | null;
  /** Encabezado de contexto (cliente · mascota), resuelto por el caller. */
  subtitle?: string;
  onClose: () => void;
  /** Se llama tras cambios (quitar línea / cerrar cuenta) para refrescar la lista. */
  onChanged: () => void;
}

const mono = { fontFamily: 'var(--cg-font-mono, SF Mono, Menlo, monospace)' };

export function AccountDetailDrawer({
  accountId,
  subtitle,
  onClose,
  onChanged,
}: AccountDetailDrawerProps) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const d = await actions.execute<AccountDetail | undefined>('billing.accounts.getWithLines', {
        id: accountId,
      });
      setDetail(d ?? null);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
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

  const closeAccount = useCallback(async () => {
    if (!accountId) return;
    setBusy(true);
    try {
      await actions.execute('billing.accounts.close', { id: accountId });
      toast('Cuenta cerrada', 'El cobro quedó cerrado.', 'success');
      onChanged();
      onClose();
    } catch {
      toast('No se pudo cerrar', 'Intentá de nuevo.', 'info');
    } finally {
      setBusy(false);
    }
  }, [accountId, onChanged, onClose]);

  const isClosed = detail?.account.status === 'closed';

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
          h(UI.SheetTitle, null, 'Detalle de la cuenta'),
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
          : !detail || detail.lines.length === 0
            ? h(
                'p',
                { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } },
                'Esta cuenta no tiene líneas de cobro.'
              )
            : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                ...detail.lines.map((l) =>
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
                        {
                          style: {
                            fontSize: '11.5px',
                            color: 'var(--cg-text-muted)',
                            marginTop: '2px',
                          },
                        },
                        `${SOURCE_LABEL[l.source_type] ?? l.source_type} · ${l.quantity} × ${formatMoney(l.unit_price)}`
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
                      !isClosed &&
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
                  )
                )
              )
      ),

      // Total + acciones
      h(
        'div',
        { style: { flexShrink: 0, borderTop: '1px solid var(--cg-border)', padding: '16px 24px' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '14px',
            },
          },
          h('span', { style: { fontSize: '13px', color: 'var(--cg-text-muted)' } }, 'Total'),
          h(
            'span',
            { style: { ...mono, fontSize: '20px', fontWeight: 700 } },
            formatMoney(detail?.total)
          )
        ),
        h(
          'div',
          { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
          h(UI.Button, { variant: 'outline', onClick: onClose } as any, 'Cerrar'),
          !isClosed &&
            h(
              UI.Button,
              { variant: 'brand', disabled: busy, onClick: () => void closeAccount() } as any,
              h(UI.DynamicIcon, { icon: 'Check', size: 13 } as any),
              ' Cerrar cuenta'
            )
        )
      )
    )
  );
}
