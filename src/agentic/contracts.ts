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
      { key: 'debt', name: 'debt', label: 'Debe', format: 'money' },
      { key: 'account_count', name: 'accountCount', label: 'Cuentas con saldo', format: 'number' },
      { key: 'oldest_opened_at', name: 'oldestOpenedAt', label: 'Desde', format: 'date' },
    ],
    identifierKey: 'contact_id',
    // La fila es un CLIENTE, no una cuenta: `listDebtors` agrupa las cuentas de
    // cada uno y devuelve una sola línea por contacto. Sin decirlo, el runtime
    // etiquetaba `contact_id` como una referencia a `billing.accounts` y el
    // agente que la encadenaba le pasaba un id de contacto a «registrar un
    // cobro» — que lo habría rechazado por cuenta inexistente, con el error
    // apuntando al lugar equivocado.
    refs: { contact_id: 'contacts' },
  },
});

/**
 * El paso que falta entre «Juan debe 150.000» y «cobrale»: las cuentas, con su
 * identificador y su saldo. `listDebtors` responde a quién reclamarle; esta
 * responde qué cuenta cobrarle.
 */
export const listAccountsWithTotals = defineAction({
  id: 'billing.accounts.listWithTotals',
  title: 'Buscar cuentas con su saldo',
  description:
    'Las cuentas con lo facturado, lo cobrado y lo que falta. Es de acá que sale el identificador de la cuenta para cobrarla o sumarle un concepto. Se puede acotar por cliente, por período, por origen (`rent` = alquileres) o por el final de la referencia (`:2026-08` = los cargos del mes de agosto, sin importar cuándo se generaron). Las cuentas sin nada cargado ni cobrado no aparecen.',
  effect: 'read',
  confirmation: 'never',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'Solo las cuentas de este cliente.',
        ref: { resource: 'contacts' },
      },
      direction: {
        type: 'string',
        enum: ['receivable', 'payable'],
        description:
          'Qué lado del dinero: «receivable» lo que se cobra (por defecto), «payable» las salidas.',
      },
      source: {
        type: 'string',
        description: 'De dónde nace la cuenta. «rent» son los cargos de alquiler.',
      },
      refSuffix: {
        type: 'string',
        description:
          'Final de la referencia de origen. Para alquileres, «:2026-08» trae los cargos del mes de agosto — que es distinto de cuándo se generaron.',
      },
      from: {
        type: 'string',
        description: 'Desde cuándo se abrieron las cuentas (ISO).',
      },
      to: {
        type: 'string',
        description: 'Hasta cuándo se abrieron las cuentas (ISO).',
      },
    },
    additionalProperties: false,
  },
  output: {
    kind: 'collection',
    fields: [
      { key: 'contact_id', name: 'contactId', label: 'Cliente', format: 'text' },
      { key: 'source', name: 'source', label: 'Origen', format: 'text' },
      { key: 'source_ref', name: 'sourceRef', label: 'Referencia', format: 'text' },
      { key: 'opened_at', name: 'openedAt', label: 'Abierta', format: 'date' },
      { key: 'due_date', name: 'dueDate', label: 'Vence', format: 'date' },
      { key: 'total', name: 'total', label: 'Facturado', format: 'money' },
      { key: 'paid', name: 'paid', label: 'Cobrado', format: 'money' },
      { key: 'balance', name: 'balance', label: 'Debe', format: 'money' },
      { key: 'paymentStatus', name: 'paymentStatus', label: 'Estado', format: 'text' },
    ],
    identifierKey: 'id',
    refs: { id: 'billing.accounts' },
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
      { key: 'contact_id', name: 'contactId', label: 'Cliente', format: 'text' },
      { key: 'source', name: 'source', label: 'Origen', format: 'text' },
      { key: 'due_date', name: 'dueDate', label: 'Vence', format: 'date' },
      { key: 'opened_at', name: 'openedAt', label: 'Abierta', format: 'date' },
      {
        key: 'direction',
        name: 'direction',
        label: 'Dirección',
        format: 'text',
        values: [
          { value: 'receivable', label: 'Por cobrar' },
          { value: 'payable', label: 'Por pagar' },
        ],
      },
      { key: 'notes', name: 'notes', label: 'Notas', format: 'text' },
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

/**
 * La puerta de entrada que faltaba. Todas las demás formas de abrir una cuenta
 * quedaron excluidas con razón —una es del kit veterinario, la otra es el
 * mecanismo interno de la emisión mensual— y el resultado era un catálogo en el
 * que, si el mes todavía no se había emitido, no había ninguna cuenta a la que
 * sumarle nada: cobrarle algo a alguien quedaba en manos de que corriera la
 * generación.
 */
export const openAccountForContact = defineAction({
  id: 'billing.accounts.openForContact',
  title: 'Abrir una cuenta a nombre de un cliente',
  description:
    'Abre una cuenta suelta para cobrarle (o pagarle) algo a alguien fuera del cargo mensual: el arreglo que se le pasa al inquilino, un gasto de un proveedor. Nace vacía y no figura en ningún listado hasta que se le suma un concepto, así que el paso siguiente es siempre cargarle lo que se va a cobrar. Para el alquiler de un mes NO se usa esta: ese cargo lo emite el contrato, con su propio identificador.',
  effect: 'write',
  confirmation: 'always',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'El cliente al que se le va a cobrar o pagar.',
        ref: { resource: 'contacts' },
      },
      direction: {
        type: 'string',
        enum: ['receivable', 'payable'],
        description:
          'Para qué lado va la plata: «receivable» lo que se le cobra a alguien (por defecto), «payable» lo que se le paga.',
      },
      dueDate: {
        type: 'string',
        description: 'Fecha de vencimiento (AAAA-MM-DD), si se acordó una.',
      },
      notes: {
        type: 'string',
        description: 'De qué es la cuenta, para quien la lea después.',
      },
    },
    required: ['contactId'],
    additionalProperties: false,
  },
  output: {
    kind: 'record',
    fields: [
      { key: 'id', name: 'id', label: 'Cuenta', format: 'text' },
      { key: 'contact_id', name: 'contactId', label: 'Cliente', format: 'text' },
      { key: 'direction', name: 'direction', label: 'Dirección', format: 'text' },
      { key: 'opened_at', name: 'openedAt', label: 'Abierta', format: 'date' },
      { key: 'due_date', name: 'dueDate', label: 'Vence', format: 'date' },
    ],
    identifierKey: 'id',
    refs: { id: 'billing.accounts' },
  },
});

/**
 * La contracara de «quién me debe»: cuánto entró. Va por `paid_at`, la fecha en
 * que se cobró de verdad, no la de la cuenta — un cobro de un alquiler de marzo
 * hecho en julio cuenta en julio.
 */
export const listPaymentsInRange = defineAction({
  id: 'billing.payments.listInRange',
  title: 'Ver lo cobrado entre dos fechas',
  description:
    'Todos los cobros de un período, con el importe, el medio de pago y el cliente. Responde «cuánto entró este mes» y con qué se pagó. Incluye las salidas (los egresos se distinguen por su dirección), así que para saber el ingreso neto hay que mirar esa columna.',
  effect: 'read',
  confirmation: 'never',
  tenantScope: 'required',
  input: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Desde cuándo, inclusive (ISO). Compara contra la fecha del cobro.',
      },
      to: {
        type: 'string',
        description: 'Hasta cuándo, inclusive (ISO).',
      },
    },
    // Ambas obligatorias aunque el repositorio las acepte vacías: sin rango
    // devuelve el historial entero del tenant, que para un agente es una
    // respuesta inutilizable disfrazada de respuesta.
    required: ['from', 'to'],
    additionalProperties: false,
  },
  output: {
    kind: 'collection',
    fields: [
      { key: 'amount', name: 'amount', label: 'Importe', format: 'money' },
      { key: 'method', name: 'method', label: 'Medio', format: 'text' },
      { key: 'paid_at', name: 'paidAt', label: 'Fecha', format: 'date' },
      { key: 'contact_id', name: 'contactId', label: 'Cliente', format: 'text' },
      { key: 'account_source', name: 'accountSource', label: 'Origen', format: 'text' },
      {
        key: 'account_direction',
        name: 'accountDirection',
        label: 'Dirección',
        format: 'text',
        values: [
          { value: 'receivable', label: 'Cobro' },
          { value: 'payable', label: 'Salida' },
        ],
      },
    ],
    identifierKey: 'id',
    refs: { id: 'billing.payments' },
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
  // La referencia que devuelve es la CUENTA, no la línea. El id de una línea no
  // lo recibe ninguna operación publicada —los conceptos se leen y se corrigen
  // por cuenta— mientras que la cuenta que quedó modificada es justo lo que se
  // encadena después: cobrarla, releer su desglose, ver cuánto quedó debiendo.
  output: {
    kind: 'record',
    fields: [
      { key: 'account_id', name: 'accountId', label: 'Cuenta', format: 'text' },
      { key: 'description', name: 'description', label: 'Concepto', format: 'text' },
      { key: 'quantity', name: 'quantity', label: 'Cantidad', format: 'text' },
      { key: 'subtotal', name: 'subtotal', label: 'Importe', format: 'money' },
    ],
    identifierKey: 'account_id',
    refs: { account_id: 'billing.accounts' },
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
  // qué quedó asentado y por cuánto, sin volver a preguntar. La referencia
  // encadenable es la CUENTA —el id del pago no lo recibe ninguna operación
  // publicada—, así que después de cobrar se puede releer el saldo que quedó.
  output: {
    kind: 'record',
    fields: [
      { key: 'account_id', name: 'accountId', label: 'Cuenta', format: 'text' },
      { key: 'amount', name: 'amount', label: 'Importe', format: 'money' },
      { key: 'method', name: 'method', label: 'Medio', format: 'text' },
      { key: 'paid_at', name: 'paidAt', label: 'Fecha', format: 'date' },
    ],
    identifierKey: 'account_id',
    refs: { account_id: 'billing.accounts' },
  },
});
