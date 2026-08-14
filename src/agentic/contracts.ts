/**
 * Action Contracts de billing.
 *
 * El contrato vive JUNTO al handler y es el MISMO objeto que valida en runtime:
 * por eso lo que se publica no puede desincronizarse de lo que la implementación
 * acepta.
 *
 * Este plugin llega tarde al plano agentic y eso tuvo un costo medible: el kit de
 * alquileres podía leer la deuda de un inquilino y no registrar que la pagó. Un
 * agente probado contra el catálogo completo concluyó que «no hay forma de
 * registrar cobros», con `billing.payments.record` existiendo desde el principio
 * — solo que sin publicar. Se empieza por ahí: por la operación que mueve la
 * plata de verdad.
 */

import { defineAction } from '@coongro/plugin-sdk/agentic';

export const recordPayment = defineAction({
  id: 'billing.payments.record',
  title: 'Registrar un cobro',
  description:
    'Deja registrado que se cobró plata contra una cuenta: baja su saldo y suma a la caja del día. Admite cobros parciales —se registra lo que entró, no lo que se debía— y varios cobros sobre la misma cuenta, uno por medio de pago. Se niega si la cuenta no existe o si el importe no es mayor a cero.',
  effect: 'write',
  confirmation: 'always',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      accountId: {
        type: 'string',
        format: 'uuid',
        description: 'La cuenta que se está cobrando. Tiene que existir.',
        ref: { resource: 'billing.accounts' },
      },
      amount: {
        type: 'string',
        pattern: '^\\d+(?:\\.\\d+)?$',
        description:
          'Cuánto entró, mayor a cero. Es lo que se cobró, que puede ser menos que el saldo: un cobro parcial se registra por su importe y la cuenta queda con lo que falta.',
      },
      method: {
        type: 'string',
        description: 'Con qué se pagó: efectivo, transferencia, tarjeta.',
      },
      paidAt: {
        type: 'string',
        description:
          'Cuándo se cobró de verdad, si no fue ahora. Sirve para registrar hoy un cobro de ayer sin que caiga en la caja de hoy.',
      },
      notes: {
        type: 'string',
        description: 'Aclaración del cobro, si hace falta.',
      },
    },
    required: ['accountId', 'amount', 'method'],
    additionalProperties: false,
  },
  // Devuelve el pago registrado, no un «listo»: quien cobró tiene que poder leer
  // qué quedó asentado y por cuánto, sin volver a preguntar.
  output: {
    kind: 'record',
    fields: [
      { key: 'id', name: 'id', label: 'Cobro', format: 'text' },
      { key: 'account_id', name: 'accountId', label: 'Cuenta', format: 'text' },
      { key: 'amount', name: 'amount', label: 'Importe', format: 'money' },
      { key: 'method', name: 'method', label: 'Medio', format: 'text' },
      { key: 'paid_at', name: 'paidAt', label: 'Fecha', format: 'date' },
    ],
  },
});
