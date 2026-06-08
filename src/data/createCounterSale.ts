import { actions } from '@coongro/plugin-sdk';

export interface CounterSaleLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
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
    // Baja de stock (blando): vender descuenta del catálogo de products. Si products no está
    // o el producto no se trackea, la venta igual se cobra.
    if (l.productId) {
      try {
        await actions.execute('products.stock.create', {
          data: {
            product_id: l.productId,
            type: 'out',
            quantity: l.quantity,
            reference_type: 'sale',
            reference_id: account.id,
          },
        });
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
