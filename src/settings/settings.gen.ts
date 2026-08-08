/**
 * AUTO-GENERADO por Coongro Builder — NO editar a mano.
 * Se regenera al guardar la página de settings desde /dev/builder.
 * La lógica de negocio va en un hook de dominio que consume esto.
 */
/* eslint-disable */

import { useSettings } from '@coongro/plugin-sdk';

function toNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return fallback;
}

function toEnum<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

function toBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

export const CASH_ROUNDING = {
  off: 'off',
  _50: '50',
  _100: '100',
} as const;

/** Tipo de cada setting por su key punteada (para getSetting). */
export interface BillingSettingsByKey {
  'billing.cash.openingFloat': number;
  'billing.cash.rounding': 'off' | '50' | '100';
  'billing.cash.requireClose': boolean;
  'billing.payments.transferencia': boolean;
  'billing.payments.debito': boolean;
  'billing.payments.credito': boolean;
  'billing.payments.creditSurcharge': number;
  'billing.payments.onAccount': boolean;
}

/** Settings del plugin con defaults aplicados y coerción por tipo. */
export interface BillingSettings {
  /** Fondo inicial de caja — Efectivo con el que arranca el cajón cada día, para el arqueo. Se pre-rellena al cerrar la caja; podés ajustarlo ahí. · `billing.cash.openingFloat` · default: `0` */
  readonly cashOpeningFloat: number;
  /** Redondeo de efectivo — Al cobrar en efectivo, redondear el total para evitar vueltos con monedas. Solo afecta al efectivo; los medios digitales se cobran exactos. · `billing.cash.rounding` · default: `"off"` */
  readonly cashRounding: 'off' | '50' | '100';
  /** Exigir arqueo diario — Pedir el cierre de caja (arqueo del efectivo) de cada día antes de poder operar el día siguiente. Útil para clínicas que controlan el efectivo a diario. · `billing.cash.requireClose` · default: `false` */
  readonly cashRequireClose: boolean;
  /** Aceptar transferencia — Ofrecer transferencia (CBU/CVU) como medio de cobro. Se acredita al instante y sin comisión. · `billing.payments.transferencia` · default: `true` */
  readonly paymentsTransferencia: boolean;
  /** Aceptar débito — Ofrecer tarjeta de débito como medio de cobro. Se acredita después, con comisión del posnet. · `billing.payments.debito` · default: `true` */
  readonly paymentsDebito: boolean;
  /** Aceptar crédito — Ofrecer tarjeta de crédito como medio de cobro. Podés cargarle un recargo automático más abajo. · `billing.payments.credito` · default: `true` */
  readonly paymentsCredito: boolean;
  /** Recargo por pago con crédito (%) — Porcentaje que se suma automáticamente al cobrar con tarjeta de crédito, para cubrir la comisión del posnet. Se agrega como una línea 'Recargo por crédito' en la cuenta. 0 = sin recargo. · `billing.payments.creditSurcharge` · default: `0` */
  readonly paymentsCreditSurcharge: number;
  /** Permitir ventas a cuenta (fiado) — Dejar cuentas con saldo pendiente para cobrar después. Si lo apagás, cada cobro debe saldar el total y no se acumulan deudores. · `billing.payments.onAccount` · default: `true` */
  readonly paymentsOnAccount: boolean;
}

/** Nombre de prop → key punteada del manifest. */
export const SETTING_KEYS = {
  cashOpeningFloat: 'billing.cash.openingFloat',
  cashRounding: 'billing.cash.rounding',
  cashRequireClose: 'billing.cash.requireClose',
  paymentsTransferencia: 'billing.payments.transferencia',
  paymentsDebito: 'billing.payments.debito',
  paymentsCredito: 'billing.payments.credito',
  paymentsCreditSurcharge: 'billing.payments.creditSurcharge',
  paymentsOnAccount: 'billing.payments.onAccount',
} as const;

/** Valores por defecto (los mismos del manifest). */
export const SETTING_DEFAULTS = {
  'billing.cash.openingFloat': 0,
  'billing.cash.rounding': 'off',
  'billing.cash.requireClose': false,
  'billing.payments.transferencia': true,
  'billing.payments.debito': true,
  'billing.payments.credito': true,
  'billing.payments.creditSurcharge': 0,
  'billing.payments.onAccount': true,
} as const;

const COERCE: {
  [K in keyof BillingSettingsByKey]: (values: Record<string, unknown>) => BillingSettingsByKey[K];
} = {
  'billing.cash.openingFloat': (values) => toNum(values['billing.cash.openingFloat'], 0),
  'billing.cash.rounding': (values) =>
    toEnum(values['billing.cash.rounding'], ['off', '50', '100'], 'off'),
  'billing.cash.requireClose': (values) => toBool(values['billing.cash.requireClose'], false),
  'billing.payments.transferencia': (values) =>
    toBool(values['billing.payments.transferencia'], true),
  'billing.payments.debito': (values) => toBool(values['billing.payments.debito'], true),
  'billing.payments.credito': (values) => toBool(values['billing.payments.credito'], true),
  'billing.payments.creditSurcharge': (values) =>
    toNum(values['billing.payments.creditSurcharge'], 0),
  'billing.payments.onAccount': (values) => toBool(values['billing.payments.onAccount'], true),
};

/** Lee UNA setting tipada desde los valores crudos del tenant (para handlers). */
export function getSetting<K extends keyof BillingSettingsByKey>(
  values: Record<string, unknown>,
  key: K
): BillingSettingsByKey[K] {
  return COERCE[key](values);
}

/** Construye el objeto tipado desde los valores crudos (sin hook: handlers/tests). */
export function readBillingSettings(values: Record<string, unknown>): BillingSettings {
  return {
    cashOpeningFloat: COERCE['billing.cash.openingFloat'](values),
    cashRounding: COERCE['billing.cash.rounding'](values),
    cashRequireClose: COERCE['billing.cash.requireClose'](values),
    paymentsTransferencia: COERCE['billing.payments.transferencia'](values),
    paymentsDebito: COERCE['billing.payments.debito'](values),
    paymentsCredito: COERCE['billing.payments.credito'](values),
    paymentsCreditSurcharge: COERCE['billing.payments.creditSurcharge'](values),
    paymentsOnAccount: COERCE['billing.payments.onAccount'](values),
  };
}

/**
 * Hook reactivo: settings tipadas del plugin con defaults aplicados.
 * Envolvé esto en un hook de dominio si necesitás lógica de negocio.
 */
export function useBillingSettings(): { settings: BillingSettings; loading: boolean } {
  const { values, loading } = useSettings('billing.');
  return { settings: readBillingSettings(values), loading };
}
