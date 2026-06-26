import { actions } from '@coongro/plugin-sdk';

export interface CounterSaleLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  /** Reparto en lotes elegido en el editor "¿De qué lote sale?" (med/vacc). Si viene, descuenta
   * de esos lotes exactos; si no, FIFO automático. */
  batches?: Array<{ batchId: string; quantity: number }>;
}

/** Descuenta cantidades de lotes puntuales (el reparto elegido por el usuario). */
async function deductByBatches(
  productId: string,
  batches: Array<{ batchId: string; quantity: number }>,
  accountId: string
): Promise<void> {
  for (const b of batches) {
    await actions.execute('products.batches.consume', {
      productId,
      quantity: b.quantity,
      batchId: b.batchId,
      referenceType: 'sale',
      referenceId: accountId,
    });
  }
}

/**
 * Descuenta el stock de un producto vendido: del lote que vence primero (FIFO) vía el motor de
 * lotes de products → la salida queda en la trazabilidad del lote, igual que una dispensación.
 * Lo que los lotes no cubran (producto sin lotes, ej. pet shop) baja del stock genérico.
 */
/** Descuenta una línea: de los lotes elegidos si vienen, si no FIFO/genérico automático. */
async function deductLine(l: CounterSaleLine, accountId: string): Promise<void> {
  if (!l.productId) return;
  if (l.batches && l.batches.length > 0) {
    await deductByBatches(l.productId, l.batches, accountId);
  } else {
    await deductStock(l.productId, Number(l.quantity), accountId);
  }
}

async function deductStock(productId: string, quantity: number, accountId: string): Promise<void> {
  const result = await actions.execute<{ shortfall?: number }>('products.batches.consume', {
    productId,
    quantity,
    referenceType: 'sale',
    referenceId: accountId,
  });
  const shortfall = Number(result?.shortfall ?? 0);
  if (shortfall > 0) {
    await actions.execute('products.stock.create', {
      data: {
        product_id: productId,
        type: 'out',
        quantity: String(shortfall),
        reference_type: 'sale',
        reference_id: accountId,
      },
    });
  }
}

/**
 * Venta de mostrador: vender productos sueltos (antipulgas, alimento) SIN consulta, en 1-2 pasos.
 * Crea una cuenta 'mostrador' con sus líneas, **registra el cobro en el acto** (la venta de
 * mostrador se paga al instante → aparece en la Caja del día como cobrado) y **descuenta el
 * stock** (products, dependencia blanda). Atómico desde el punto de vista del usuario.
 *
 * NO deja cuentas vacías: solo se llama con líneas válidas (ver el diálogo), así que la cuenta
 * siempre nace con al menos una línea + su pago.
 */
export async function createCounterSale(input: {
  contactId?: string | null;
  method: string;
  lines: CounterSaleLine[];
}): Promise<void> {
  const valid = input.lines.filter(
    (l) => Number(l.quantity) > 0 && (l.productId || l.description.trim())
  );
  if (valid.length === 0) throw new Error('Sin ítems');

  const total = valid.reduce((s, l) => s + Number(l.quantity) * (Number(l.unitPrice) || 0), 0);

  const account = await actions.execute<{ id: string } | undefined>(
    'billing.accounts.openForVisit',
    { contactId: input.contactId ?? null } // sin consultationId → cuenta de mostrador ('counter')
  );
  if (!account?.id) throw new Error('No se pudo abrir la cuenta');

  for (const l of valid) {
    await actions.execute('billing.lines.add', {
      accountId: account.id,
      productId: l.productId,
      description: l.description.trim() || 'Producto',
      quantity: l.quantity,
      unitPrice: String(Number(l.unitPrice) || 0),
      sourceType: 'product',
    });
    // Baja de stock (blando): de los lotes elegidos si vienen, si no FIFO automático.
    if (l.productId) {
      try {
        await deductLine(l, account.id);
      } catch {
        /* products no disponible o sin stock track */
      }
    }
  }

  // Cobro en el acto: la venta de mostrador se paga al instante → entra a la Caja del día.
  if (total > 0) {
    await actions.execute('billing.payments.record', {
      accountId: account.id,
      amount: String(total),
      method: input.method,
    });
  }
}
