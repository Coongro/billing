import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useCallback, useRef } = React;

/** Egreso de caja resuelto para la vista. */
export interface CajaExpense {
  id: string;
  amount: string;
  category: string;
  spentAt: string;
  notes: string | null;
}

interface RawExpense {
  id: string;
  amount: string;
  category: string;
  spent_at: string;
  notes: string | null;
}

export interface UseExpensesResult {
  rows: CajaExpense[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga los egresos del rango (billing.expenses.listInRange). Pasar un `range` memoizado
 * para evitar recargas. Mismo patrón que useCaja, sin resolución de nombres (un egreso no
 * tiene cliente).
 */
export function useExpenses(range?: { from?: string; to?: string }): UseExpensesResult {
  const [rows, setRows] = useState<CajaExpense[]>([]);
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
      const expenses = await actions.execute<RawExpense[]>('billing.expenses.listInRange', {
        from,
        to,
      });
      const mapped: CajaExpense[] = (expenses ?? []).map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        spentAt: e.spent_at,
        notes: e.notes,
      }));
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los egresos');
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
