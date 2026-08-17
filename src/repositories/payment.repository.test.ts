import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';

/**
 * Las guardas del cobro, que es por donde entra la plata.
 *
 * `record` insertaba sin mirar nada. Con un id equivocado el pago quedaba colgado
 * de ninguna cuenta —sumaba a la caja del día sin bajarle la deuda a nadie— y con
 * un importe negativo entraba una devolución disfrazada de cobro. Quien cobra
 * desde la pantalla ve el saldo y difícilmente se equivoque; un agente recibe un
 * identificador y no tiene esa red.
 */
const { PaymentRepository } = await import('./payment.repository.js');

/** Una base que responde por turno: primero la cuenta, después el insert. */
function baseCon(respuestas: unknown[][]) {
  const cola = [...respuestas];
  const ormQuery = vi.fn(() => Promise.resolve(cola.shift() ?? []));
  return { db: { ormQuery } as unknown as ModuleDatabaseAPI, ormQuery };
}

const CUENTA = [{ id: 'cuenta-1' }];

describe('registrar un cobro', () => {
  it('se niega con importe negativo y dice cómo se registra una devolución', async () => {
    const { db, ormQuery } = baseCon([CUENTA]);

    await expect(
      new PaymentRepository(db).record({
        accountId: 'cuenta-1',
        amount: '-5000',
        method: 'efectivo',
      })
    ).rejects.toThrow(/mayor a cero|devoluci/i);
    expect(ormQuery).not.toHaveBeenCalled();
  });

  it('se niega con importe cero: un cobro de nada no es un cobro', async () => {
    const { db } = baseCon([CUENTA]);

    await expect(
      new PaymentRepository(db).record({ accountId: 'cuenta-1', amount: '0', method: 'efectivo' })
    ).rejects.toThrow(/mayor a cero/i);
  });

  it('se niega si la cuenta no existe, en vez de dejar el pago colgado', async () => {
    const { db } = baseCon([[]]);

    await expect(
      new PaymentRepository(db).record({
        accountId: 'fantasma',
        amount: '5000',
        method: 'efectivo',
      })
    ).rejects.toThrow(/no existe esa cuenta/i);
  });

  it('registra el cobro cuando la cuenta existe y el importe es válido', async () => {
    const { db } = baseCon([CUENTA, [{ id: 'pago-1', account_id: 'cuenta-1', amount: '5000' }]]);

    const pago = await new PaymentRepository(db).record({
      accountId: 'cuenta-1',
      amount: '5000',
      method: 'efectivo',
    });

    expect(pago).toMatchObject({ id: 'pago-1', account_id: 'cuenta-1' });
  });
});
