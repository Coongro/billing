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

import { defineAction, none } from '@coongro/plugin-sdk/agentic';

/**
 * Quién debe plata. Es la primera pregunta de cualquiera que administre cobros y
 * el kit no la podía responder por este canal.
 */
export const listDebtors = defineAction({
  id: 'billing.accounts.listDebtors',
  title: 'Ver quién debe plata',
  description:
    'Los que tienen saldo pendiente, con cuánto deben y desde cuándo. Es la lista de la que sale a quién reclamarle. Trae solo lo que quedó impago: lo saldado no aparece.',
  effect: 'read',
  confirmation: 'never',
  tenantScope: 'required',
  input: none(),
  output: {
    kind: 'collection',
    fields: [
      { key: 'contact_id', name: 'contactId', label: 'Cliente', format: 'text' },
      { key: 'total', name: 'total', label: 'Facturado', format: 'money' },
      { key: 'paid', name: 'paid', label: 'Cobrado', format: 'money' },
      { key: 'balance', name: 'balance', label: 'Debe', format: 'money' },
    ],
    identifierKey: 'contact_id',
  },
});

/** La ficha de una cuenta: qué se le cargó, qué pagó y cuánto falta. */
export const getAccountWithLines = defineAction({
  id: 'billing.accounts.getWithLines',
  title: 'Ver el detalle de una cuenta',
  description:
    'Una cuenta con todos sus conceptos, lo que se cobró y el saldo que queda. Es lo que hay que mirar para explicarle a alguien de qué se compone lo que debe.',
  effect: 'read',
  confirmation: 'never',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'La cuenta que se quiere ver.',
        ref: { resource: 'billing.accounts' },
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  output: {
    kind: 'record',
    fields: [
      { key: 'total', name: 'total', label: 'Facturado', format: 'money' },
      { key: 'paid', name: 'paid', label: 'Cobrado', format: 'money' },
      { key: 'balance', name: 'balance', label: 'Saldo', format: 'money' },
    ],
  },
});

/** Los cobros de una cuenta: con qué se pagó y cuándo. */
export const listPaymentsByAccount = defineAction({
  id: 'billing.payments.listByAccount',
  title: 'Ver los cobros de una cuenta',
  description:
    'Todo lo que se cobró contra una cuenta, del más reciente al más viejo, con el medio de pago. Una cuenta puede tener varios: un cobro parcial hoy y el resto la semana que viene.',
  effect: 'read',
  confirmation: 'never',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      accountId: {
        type: 'string',
        format: 'uuid',
        description: 'La cuenta de la que se quieren ver los cobros.',
        ref: { resource: 'billing.accounts' },
      },
    },
    required: ['accountId'],
    additionalProperties: false,
  },
  output: {
    kind: 'collection',
    fields: [
      { key: 'amount', name: 'amount', label: 'Importe', format: 'money' },
      { key: 'method', name: 'method', label: 'Medio', format: 'text' },
      { key: 'paid_at', name: 'paidAt', label: 'Fecha', format: 'date' },
    ],
    identifierKey: 'id',
  },
});

/** Los conceptos de una cuenta, uno por uno. */
export const listLinesByAccount = defineAction({
  id: 'billing.lines.listByAccount',
  title: 'Ver los conceptos de una cuenta',
  description:
    'Cada cosa que se le cargó a una cuenta con su importe: el alquiler, las expensas, un punitorio, un arreglo. Es el desglose que explica el total.',
  effect: 'read',
  confirmation: 'never',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      accountId: {
        type: 'string',
        format: 'uuid',
        description: 'La cuenta de la que se quiere el desglose.',
        ref: { resource: 'billing.accounts' },
      },
    },
    required: ['accountId'],
    additionalProperties: false,
  },
  output: {
    kind: 'collection',
    fields: [
      { key: 'description', name: 'description', label: 'Concepto', format: 'text' },
      { key: 'quantity', name: 'quantity', label: 'Cantidad', format: 'text' },
      { key: 'subtotal', name: 'subtotal', label: 'Importe', format: 'money' },
    ],
    identifierKey: 'id',
  },
});

/**
 * El agujero que la destapó: un agente registró el arreglo del termotanque a
 * cargo de la inquilina y se frenó en «el cargo del mes ya existe y las
 * herramientas no permiten agregarle el gasto». Sumar un concepto a una cuenta
 * ya emitida es una operación corriente de administración —el arreglo que se le
 * pasa al inquilino, una bonificación, un ajuste— y no tenía camino publicado.
 */
export const addLine = defineAction({
  id: 'billing.lines.add',
  title: 'Sumar un concepto a una cuenta',
  description:
    'Agrega un concepto a cobrar en una cuenta que ya existe —un arreglo que paga el inquilino, una bonificación, un ajuste— y su importe pasa a integrar lo que se debe. Sirve para el mes ya emitido: no hace falta rehacerlo. Si se indica de dónde viene, no se duplica al repetir.',
  effect: 'write',
  confirmation: 'always',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      accountId: {
        type: 'string',
        format: 'uuid',
        description: 'La cuenta a la que se le suma el concepto. Tiene que existir.',
        ref: { resource: 'billing.accounts' },
      },
      description: {
        type: 'string',
        description: 'Cómo va a leerlo quien reciba el recibo. Ej: «Reposición del termotanque».',
      },
      unitPrice: {
        type: 'string',
        pattern: '^-?\\d+(?:\\.\\d+)?$',
        description: 'Precio de una unidad. En negativo para lo que resta, como una bonificación.',
      },
      quantity: {
        type: 'string',
        pattern: '^\\d+(?:\\.\\d+)?$',
        description: 'Cuántas unidades. Si se omite, una.',
      },
      subtotal: {
        type: 'string',
        pattern: '^-?\\d+(?:\\.\\d+)?$',
        description: 'El total de la línea. Si se omite, se calcula como cantidad × precio.',
      },
      sourceType: {
        type: 'string',
        description:
          'De dónde sale el concepto: qué lo originó. Es lo que después permite rastrear por qué se cobró.',
      },
      sourceRef: {
        type: 'string',
        description:
          'El identificador de eso que lo originó. Con esto la operación es idempotente: repetirla no duplica la línea.',
      },
    },
    required: ['accountId', 'description', 'unitPrice', 'sourceType'],
    additionalProperties: false,
  },
  output: {
    kind: 'record',
    fields: [
      { key: 'id', name: 'id', label: 'Concepto', format: 'text' },
      { key: 'account_id', name: 'accountId', label: 'Cuenta', format: 'text' },
      { key: 'description', name: 'description', label: 'Concepto', format: 'text' },
      { key: 'subtotal', name: 'subtotal', label: 'Importe', format: 'money' },
    ],
  },
});

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
