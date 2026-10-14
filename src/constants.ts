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

/**
 * Cobro con QR por el motor de pagos (`@coongro/payments`): no es un medio fijo, aparece solo si
 * hay un proveedor configurado que cobre con QR (Mercado Pago u otro).
 */
export const QR_METHOD = 'qr';

export const METHOD_LABEL: Record<string, string> = {
  ...Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])),
  [QR_METHOD]: 'QR',
};

/**
 * Agrupación de medios por DISPONIBILIDAD de la plata (no por tipo). Sale de la realidad AR:
 * efectivo y transferencia (CBU/CVU) son instantáneos y sin comisión → "disponible hoy";
 * débito y crédito (tarjeta) llegan después y con comisión → "por acreditar".
 */
export const PAYMENT_METHOD_GROUPS = [
  {
    key: 'disponible',
    label: 'Disponible hoy',
    hint: 'ya lo tenés',
    methods: ['efectivo', 'transferencia'],
  },
  {
    key: 'acreditar',
    label: 'Por acreditar',
    hint: 'llega después, con comisión',
    methods: ['debito', 'credito'],
  },
];

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
  surcharge: 'Recargo',
  rounding: 'Redondeo',
};
