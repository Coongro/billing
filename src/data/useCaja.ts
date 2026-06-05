import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useCallback, useRef } = React;

/** Cobro con cliente resuelto, para la Caja diaria. */
export interface CajaPayment {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  clientName: string;
  source: string;
}

interface RawPayment {
  id: string;
  amount: string;
  method: string;
  paid_at: string;
  contact_id: string | null;
  account_source: string;
}

export interface UseCajaResult {
  rows: CajaPayment[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga los cobros del rango (billing.payments.listInRange) y resuelve el nombre del
 * cliente de forma blanda. Pasar un `range` memoizado para evitar recargas.
 */
export function useCaja(range?: { from?: string; to?: string }): UseCajaResult {
  const [rows, setRows] = useState<CajaPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const from = range?.from;
  const to = range?.to;

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const payments = await actions.execute<RawPayment[]>('billing.payments.listInRange', {
        from,
        to,
      });
      type NamedRow = { id: string; name: string };
      const contacts = await actions
        .execute<NamedRow[]>('contacts.list')
        .catch((): NamedRow[] => []);
      const contactName = new Map((contacts ?? []).map((c) => [c.id, c.name]));
      const mapped: CajaPayment[] = (payments ?? []).map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paid_at,
        source: p.account_source,
        clientName: p.contact_id ? (contactName.get(p.contact_id) ?? '—') : '—',
      }));
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la caja');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}
