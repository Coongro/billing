/**
 * Constantes de dominio compartidas por las vistas y el drawer de billing.
 * Centralizadas para no duplicar los labels/medios en cada vista.
 */

/** Medios de cobro (castellano rioplatense). El set es config de negocio, no enum de DB. */
export const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
];

export const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label])
);

/** Origen de la cuenta (cómo nació). */
export const ACCOUNT_SOURCE_LABEL: Record<string, string> = {
  consultation: 'Consulta',
  counter: 'Mostrador',
};

/** Origen de cada línea de cobro dentro de la cuenta. */
export const LINE_SOURCE_LABEL: Record<string, string> = {
  fee: 'Honorario',
  service: 'Servicio',
  vaccine: 'Vacuna',
  product: 'Producto',
};
