import { actions, getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useEffect, useState } = React;

/** Un proveedor de cobros listo para cobrar con QR (según `payments.providers.list`). */
export interface QrProvider {
  id: string;
  label: string;
}

interface ProviderSummary {
  id: string;
  label: string;
  channels: string[];
  configured: boolean;
}

/**
 * El primer proveedor configurado que cobra con QR, o `null`. Se consulta cada vez que se abre
 * la venta: si el negocio conectó Mercado Pago (u otro) en el medio, el QR aparece solo. Sin el
 * motor de pagos o sin proveedor configurado, no hay QR y la venta sigue con los medios fijos.
 */
export function useQrProvider(open: boolean): QrProvider | null {
  const [provider, setProvider] = useState<QrProvider | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    actions
      .execute<ProviderSummary[]>('payments.providers.list', {})
      .then((list) => {
        const found = (list ?? []).find((p) => p.configured && p.channels.includes('qr'));
        if (alive) setProvider(found ? { id: found.id, label: found.label } : null);
      })
      .catch(() => {
        if (alive) setProvider(null);
      });
    return () => {
      alive = false;
    };
  }, [open]);
  return provider;
}
