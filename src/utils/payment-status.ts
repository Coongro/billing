/**
 * Estado de pago derivado de una cuenta. NO se persiste: igual que el total, se calcula
 * de SUM(pagos) vs total de líneas para no desincronizar por concurrencia.
 *
 * `status` (open/closed) gobierna la edición de líneas; `paymentStatus` gobierna el dinero.
 * Son ortogonales: una cuenta cerrada con saldo > 0 es un fiado (visible, nunca silencioso).
 *
 * - 'na'      → la cuenta no tiene cargos (total 0): no hay nada para cobrar.
 * - 'unpaid'  → impaga (no entró ningún pago).
 * - 'partial' → cobro parcial, queda saldo.
 * - 'paid'    → saldada.
 */
export type PaymentStatus = 'na' | 'unpaid' | 'partial' | 'paid';

export interface PaymentSummary {
  /** Total cobrado (SUM de pagos), como string numérico. */
  paid: string;
  /** Saldo pendiente (total − cobrado), nunca negativo. */
  balance: string;
  paymentStatus: PaymentStatus;
}

// Tolerancia de centavos: numeric llega como string y la resta puede dejar residuos float.
const EPSILON = 0.005;

export function derivePaymentSummary(
  total: string | number | null | undefined,
  paid: string | number | null | undefined
): PaymentSummary {
  const t = Number(total ?? 0);
  const p = Number(paid ?? 0);
  const rawBalance = t - p;
  const balance = rawBalance > EPSILON ? rawBalance : 0;
  let paymentStatus: PaymentStatus;
  if (t <= EPSILON) paymentStatus = 'na';
  else if (p <= EPSILON) paymentStatus = 'unpaid';
  else if (rawBalance <= EPSILON) paymentStatus = 'paid';
  else paymentStatus = 'partial';
  return { paid: String(p), balance: String(balance), paymentStatus };
}
