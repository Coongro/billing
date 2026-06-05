import { getHostReact, actions } from '@coongro/plugin-sdk';

import { loadContactNames, loadPetNames } from './contacts.js';

const React = getHostReact();
const { useState, useEffect, useCallback, useRef } = React;

/** Cuenta de cobro con nombres resueltos, lista para mostrar. */
export interface BillingAccountRow {
  id: string;
  contactId: string | null;
  petId: string | null;
  consultationId: string | null;
  source: string; // 'consultation' | 'counter'
  status: string; // 'open' | 'closed'
  openedAt: string;
  total: string;
  paid: string;
  balance: string;
  paymentStatus: string; // 'na' | 'unpaid' | 'partial' | 'paid'
  clientName: string;
  petName: string | null;
}

interface RawAccount {
  id: string;
  contact_id: string | null;
  pet_id: string | null;
  consultation_id: string | null;
  source: string;
  status: string;
  opened_at: string;
  total: string;
  paid: string;
  balance: string;
  paymentStatus: string;
}

export interface UseBillingAccountsResult {
  rows: BillingAccountRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga las cuentas de cobro (billing.accounts.listWithTotals) y resuelve el nombre
 * del cliente (contacts) y de la mascota (patients) de forma BLANDA: si esos plugins
 * no están, igual muestra la cuenta con "—" (billing es kit-agnóstico). `range`
 * filtra por fecha en la base (escalable). Pasar un `range` memoizado para evitar recargas.
 */
export function useBillingAccounts(
  range?: {
    from?: string;
    to?: string;
  },
  draft = false
): UseBillingAccountsResult {
  const [rows, setRows] = useState<BillingAccountRow[]>([]);
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
      const accounts = await actions.execute<RawAccount[]>('billing.accounts.listWithTotals', {
        from,
        to,
        draft,
      });
      const [contactName, petName] = await Promise.all([loadContactNames(), loadPetNames()]);

      const mapped: BillingAccountRow[] = (accounts ?? []).map((a) => ({
        id: a.id,
        contactId: a.contact_id,
        petId: a.pet_id,
        consultationId: a.consultation_id,
        source: a.source,
        status: a.status,
        openedAt: a.opened_at,
        total: a.total,
        paid: a.paid,
        balance: a.balance,
        paymentStatus: a.paymentStatus,
        clientName: a.contact_id ? (contactName.get(a.contact_id) ?? '—') : '—',
        petName: a.pet_id ? (petName.get(a.pet_id) ?? null) : null,
      }));
      mapped.sort((x, y) => (x.openedAt < y.openedAt ? 1 : -1));
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los cobros');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [from, to, draft]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}
