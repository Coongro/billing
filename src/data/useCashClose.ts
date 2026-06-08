import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useCallback, useRef } = React;

/** Cierre de caja de un día (snapshot del arqueo). */
export interface CajaClose {
  id: string;
  businessDay: string;
  openingFloat: string;
  expectedCash: string;
  countedCash: string;
  difference: string;
  closedAt: string;
  notes: string | null;
}

interface RawClose {
  id: string;
  business_day: string;
  opening_float: string;
  expected_cash: string;
  counted_cash: string;
  difference: string;
  closed_at: string;
  notes: string | null;
}

export interface UseCashCloseResult {
  close: CajaClose | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga el cierre de caja de un día (billing.cashCloses.getByDay). `null` = ese día no se
 * cerró todavía. Re-consulta al cambiar de día.
 */
export function useCashClose(businessDay: string): UseCashCloseResult {
  const [close, setClose] = useState<CajaClose | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const c = await actions.execute<RawClose | undefined>('billing.cashCloses.getByDay', {
        businessDay,
      });
      setClose(
        c
          ? {
              id: c.id,
              businessDay: c.business_day,
              openingFloat: c.opening_float,
              expectedCash: c.expected_cash,
              countedCash: c.counted_cash,
              difference: c.difference,
              closedAt: c.closed_at,
              notes: c.notes,
            }
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el cierre');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [businessDay]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { close, loading, error, reload };
}
