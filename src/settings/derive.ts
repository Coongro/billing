/**
 * Helpers de dominio sobre las settings tipadas de billing (settings.gen.ts).
 * La lógica de negocio (qué medios se ofrecen, redondeo, recargo) vive acá para no
 * repetirla en cada vista. Los componentes usan `useBillingSettings()` y estas funciones;
 * los flujos no-React (createCounterSale) leen las keys con `settings.get()`.
 */
import { PAYMENT_METHODS } from '../constants.js';

import type { BillingSettings } from './settings.gen.js';

export { useBillingSettings } from './settings.gen.js';
export type { BillingSettings } from './settings.gen.js';

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Descripción de la línea que representa el recargo por pago con crédito. */
export const CREDIT_SURCHARGE_SOURCE = 'surcharge';

/**
 * Medios de pago ofrecidos según las settings. El efectivo está siempre disponible
 * (es la base de la caja); transferencia/débito/crédito se ofrecen según su toggle.
 */
export function enabledMethods(s: BillingSettings): PaymentMethod[] {
  const on: Record<string, boolean> = {
    efectivo: true,
    transferencia: s.paymentsTransferencia,
    debito: s.paymentsDebito,
    credito: s.paymentsCredito,
  };
  return PAYMENT_METHODS.filter((m) => on[m.value] ?? true);
}

/** Redondea un monto de efectivo al múltiplo configurado (off = solo entero). */
export function roundCash(amount: number, mode: BillingSettings['cashRounding']): number {
  const step = mode === '50' ? 50 : mode === '100' ? 100 : 0;
  return step > 0 ? Math.round(amount / step) * step : Math.round(amount);
}

/** Monto del recargo por crédito sobre una base (0 si el % es 0 o la base no es positiva). */
export function creditSurcharge(base: number, pct: number): number {
  return pct > 0 && base > 0 ? Math.round((base * pct) / 100) : 0;
}
