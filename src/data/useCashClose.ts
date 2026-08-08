import { getHostReact, actions } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useState, useEffect, useCallback, useRef } = React;

/** Cierre de caja de un día (snapshot del arqueo + ciclo retiro/fondo). */
export interface CajaClose {
  id: string;
  businessDay: string;
  openingFloat: string;
  expectedCash: string;
  countedCash: string;
  difference: string;
  /** Retirado del cajón al cerrar (Salida automática). '0' si no hubo retiro. */
  withdrawn: string;
  /** Fondo que quedó para el día siguiente. null en cierres previos a COONG-250. */
  nextFloat: string | null;
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
  withdrawn?: string;
  next_float?: string | null;
  closed_at: string;
  notes: string | null;
}

function mapClose(c: RawClose): CajaClose {
  return {
    id: c.id,
    businessDay: c.business_day,
    openingFloat: c.opening_float,
    expectedCash: c.expected_cash,
    countedCash: c.counted_cash,
    difference: c.difference,
    withdrawn: c.withdrawn ?? '0',
    nextFloat: c.next_float ?? null,
    closedAt: c.closed_at,
    notes: c.notes,
  };
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
      setClose(c ? mapClose(c) : null);
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

/**
 * Fondo inicial heredado: el `next_float` del último cierre ANTERIOR al día. `null` si no
 * hay cierre previo o si ese cierre no decidió fondo (pre COONG-250) — en ese caso la
 * vista cae al default de settings.
 */
export function usePrevFloat(businessDay: string): { prevFloat: number | null } {
  const [prevFloat, setPrevFloat] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const c = await actions.execute<RawClose | undefined>('billing.cashCloses.getPrevious', {
          businessDay,
        });
        if (active) {
          setPrevFloat(
            c?.next_float === null || c?.next_float === undefined ? null : Number(c.next_float)
          );
        }
      } catch {
        if (active) setPrevFloat(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [businessDay]);

  return { prevFloat };
}

export interface UseRecentClosesResult {
  closes: CajaClose[];
  reload: () => Promise<void>;
}

/** Últimos cierres (más reciente primero), para la tira de historial de la Caja. */
export function useRecentCloses(limit = 14): UseRecentClosesResult {
  const [closes, setCloses] = useState<CajaClose[]>([]);

  const reload = useCallback(async () => {
    try {
      const rows = await actions.execute<RawClose[]>('billing.cashCloses.listRecent', { limit });
      setCloses((rows ?? []).map(mapClose));
    } catch {
      setCloses([]);
    }
  }, [limit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { closes, reload };
}
