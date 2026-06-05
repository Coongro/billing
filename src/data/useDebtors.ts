import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useCallback, useRef } = React;

/** Deudor con nombre resuelto, listo para mostrar. */
export interface DebtorRow {
  contactId: string | null;
  clientName: string;
  debt: string;
  accountCount: number;
  oldestOpenedAt: string;
}

interface RawDebtor {
  contact_id: string | null;
  debt: string;
  account_count: number;
  oldest_opened_at: string;
}

export interface UseDebtorsResult {
  rows: DebtorRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga los clientes con saldo pendiente (billing.accounts.listDebtors) y resuelve el
 * nombre del contacto de forma blanda (si contacts no está, muestra "—"). billing es
 * kit-agnóstico.
 */
export function useDebtors(): UseDebtorsResult {
  const [rows, setRows] = useState<DebtorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const debtors = await actions.execute<RawDebtor[]>('billing.accounts.listDebtors');
      type NamedRow = { id: string; name: string };
      const contacts = await actions
        .execute<NamedRow[]>('contacts.list')
        .catch((): NamedRow[] => []);
      const contactName = new Map((contacts ?? []).map((c) => [c.id, c.name]));
      const mapped: DebtorRow[] = (debtors ?? []).map((d) => ({
        contactId: d.contact_id,
        clientName: d.contact_id ? (contactName.get(d.contact_id) ?? '—') : '—',
        debt: d.debt,
        accountCount: d.account_count,
        oldestOpenedAt: d.oldest_opened_at,
      }));
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los deudores');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}
