import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';

import { paymentTable } from '../schema/payment.js';

/**
 * El retiro del cierre pertenece al día que se cierra.
 *
 * Se fechaba con el instante del click, y la propia pantalla invita a cerrar la caja de
 * ayer al día siguiente («tenés la caja de ayer sin cerrar»). Ese retiro entraba como
 * egreso de HOY, donde ya venía descontado por otro lado: el fondo de apertura de hoy es
 * el `next_float` de ayer, o sea el efectivo que quedó DESPUÉS de retirar. Restado dos
 * veces, el arqueo anunciaba un sobrante igual al retiro.
 */
const { CashCloseRepository } = await import('./cash-close.repository.js');

/** Una base de mentira que ejecuta la consulta y guarda lo que se insertó en cada tabla. */
function baseQueGuarda() {
  const insertado = new Map<unknown, Array<Record<string, unknown>>>();

  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
    insert: (tabla: unknown) => ({
      values: (fila: Record<string, unknown>) => {
        const previas = insertado.get(tabla) ?? [];
        previas.push(fila);
        insertado.set(tabla, previas);
        return { returning: () => [fila] };
      },
    }),
    delete: () => ({ where: () => [] }),
  };

  const ormQuery = vi.fn((fn: (t: unknown) => unknown) => Promise.resolve(fn(tx)));
  return { db: { ormQuery } as unknown as ModuleDatabaseAPI, insertado };
}

describe('cerrar la caja de un día anterior', () => {
  it('fecha el retiro en el día que se cierra, no en el día del click', async () => {
    const { db, insertado } = baseQueGuarda();

    await new CashCloseRepository(db).record({
      businessDay: '2026-09-16',
      openingFloat: '10000',
      expectedCash: '90000',
      countedCash: '90000',
      difference: '0',
      withdrawn: '70000',
      nextFloat: '20000',
    });

    const pago = insertado.get(paymentTable)?.[0];
    expect(pago?.amount).toBe('70000');
    // La fecha local del pago tiene que caer en el día cerrado: es con lo que la
    // pantalla de Caja agrupa los egresos.
    expect(new Date(String(pago?.paid_at)).toISOString().slice(0, 10)).toBe('2026-09-16');
  });

  it('sin retiro no registra ninguna salida', async () => {
    const { db, insertado } = baseQueGuarda();

    await new CashCloseRepository(db).record({
      businessDay: '2026-09-16',
      openingFloat: '10000',
      expectedCash: '90000',
      countedCash: '90000',
      difference: '0',
      withdrawn: '0',
    });

    expect(insertado.get(paymentTable)).toBeUndefined();
  });
});
