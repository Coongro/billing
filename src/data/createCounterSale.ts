import { actions, settings } from '@coongro/plugin-sdk';

import { creditSurcharge, roundCash, CREDIT_SURCHARGE_SOURCE } from '../settings/derive.js';
import type { BillingSettings } from '../settings/derive.js';
import { toast } from '../utils/toast.js';

export interface CounterSaleLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  /** Reparto en lotes elegido en el editor "¿De qué lote sale?" (med/vacc). Si viene, descuenta
   * de esos lotes exactos; si no, FIFO automático. */
  batches?: Array<{ batchId: string; quantity: number }>;
}

/** Resultado del motor de lotes de products (subset que nos interesa). */
interface ConsumeResult {
  batches?: Array<{ expired?: boolean }>;
  shortfall?: number;
}

/** True si el consumo tocó algún lote vencido (política "avisar"). */
function usedExpired(result: ConsumeResult | undefined): boolean {
  return Boolean(result?.batches?.some((b) => b.expired));
}

/**
 * Descuenta cantidades de lotes puntuales (el reparto elegido por el usuario). Selección MANUAL:
 * el usuario eligió los lotes explícitamente, así que se permite descontar aunque estén vencidos
 * (`allowExpired`) — el aviso lo da el llamador. Devuelve si se tocó algún lote vencido.
 */
async function deductByBatches(
  productId: string,
  batches: Array<{ batchId: string; quantity: number }>,
  accountId: string
): Promise<boolean> {
  let expired = false;
  for (const b of batches) {
    const result = await actions.execute<ConsumeResult>('products.batches.consume', {
      productId,
      quantity: b.quantity,
      batchId: b.batchId,
      allowExpired: true,
      referenceType: 'sale',
      referenceId: accountId,
    });
    if (usedExpired(result)) expired = true;
  }
  return expired;
}

/**
 * Descuenta el stock de un producto vendido: del lote que vence primero (FIFO) vía el motor de
 * lotes de products → la salida queda en la trazabilidad del lote, igual que una dispensación.
 * Lo que los lotes no cubran (producto sin lotes, ej. pet shop) baja del stock genérico.
 * FIFO respeta la política de vencidos: con `allowExpired` false (block) el motor saltea los
 * vencidos. Devuelve si se tocó algún lote vencido.
 */
async function deductStock(
  productId: string,
  quantity: number,
  accountId: string,
  allowExpired: boolean
): Promise<boolean> {
  const result = await actions.execute<ConsumeResult>('products.batches.consume', {
    productId,
    quantity,
    allowExpired,
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
  return usedExpired(result);
}

/** Descuenta una línea: de los lotes elegidos si vienen, si no FIFO/genérico automático. */
async function deductLine(
  l: CounterSaleLine,
  accountId: string,
  allowExpiredFifo: boolean
): Promise<boolean> {
  if (!l.productId) return false;
  if (l.batches && l.batches.length > 0) {
    return deductByBatches(l.productId, l.batches, accountId);
  }
  return deductStock(l.productId, Number(l.quantity), accountId, allowExpiredFifo);
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

  // Política de lotes vencidos para el FIFO automático (setting genérica de stock de products).
  // 'block' (default) → el FIFO no toca vencidos; 'warn' → los usa y avisamos al final.
  const expiredPolicy = (await settings.get<string>('products.stock.expiredLots')) ?? 'block';
  const allowExpiredFifo = expiredPolicy === 'warn';

  // Ajustes al total según el medio: recargo por crédito y redondeo de efectivo (settings de
  // billing). Se agregan como una línea propia para que la cuenta cierre balanceada y el ajuste
  // quede trazable. Recargo (crédito) y redondeo (efectivo) son excluyentes por medio.
  const creditPct =
    input.method === 'credito'
      ? Number(await settings.get<number>('billing.payments.creditSurcharge')) || 0
      : 0;
  const roundingMode =
    input.method === 'efectivo'
      ? (((await settings.get<string>('billing.cash.rounding')) ??
          'off') as BillingSettings['cashRounding'])
      : 'off';
  const surcharge = creditSurcharge(total, creditPct);
  const roundingDelta = surcharge === 0 ? roundCash(total, roundingMode) - total : 0;
  const finalTotal = total + surcharge + roundingDelta;

  const account = await actions.execute<{ id: string } | undefined>(
    'billing.accounts.openForVisit',
    { contactId: input.contactId ?? null } // sin consultationId → cuenta de mostrador ('counter')
  );
  if (!account?.id) throw new Error('No se pudo abrir la cuenta');

  let anyExpired = false;
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
        anyExpired = (await deductLine(l, account.id, allowExpiredFifo)) || anyExpired;
      } catch {
        /* products no disponible o sin stock track */
      }
    }
  }

  // Línea de ajuste (recargo por crédito o redondeo de efectivo), antes de cobrar.
  if (surcharge > 0) {
    await actions.execute('billing.lines.add', {
      accountId: account.id,
      productId: null,
      description: `Recargo por crédito (${creditPct}%)`,
      quantity: '1',
      unitPrice: String(surcharge),
      sourceType: CREDIT_SURCHARGE_SOURCE,
    });
  } else if (roundingDelta !== 0) {
    await actions.execute('billing.lines.add', {
      accountId: account.id,
      productId: null,
      description: 'Redondeo de efectivo',
      quantity: '1',
      unitPrice: String(roundingDelta),
      sourceType: 'rounding',
    });
  }

  // Cobro en el acto: la venta de mostrador se paga al instante → entra a la Caja del día.
  if (finalTotal > 0) {
    await actions.execute('billing.payments.record', {
      accountId: account.id,
      amount: String(finalTotal),
      method: input.method,
    });
  }

  if (anyExpired) {
    toast(
      'Lote vencido',
      'La venta descontó de un lote vencido. Verificá el vencimiento del producto.',
      'info'
    );
  }
}
