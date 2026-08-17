import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';

/**
 * La guarda de sumar un concepto a una cuenta.
 *
 * `add` insertaba sin comprobar que la cuenta existiera: con un id equivocado el
 * concepto quedaba colgado de nada —plata que nadie le reclama a nadie— y quien
 * lo cargó se iba convencido de haberlo hecho.
 */
const { AccountLineRepository } = await import('./account-line.repository.js');

/** Una base que responde por turno: primero la cuenta, después el insert. */
function baseCon(respuestas: unknown[][]) {
  const cola = [...respuestas];
  const ormQuery = vi.fn(() => Promise.resolve(cola.shift() ?? []));
  return { db: { ormQuery } as unknown as ModuleDatabaseAPI, ormQuery };
}

const CUENTA = [{ id: 'cuenta-1' }];

describe('sumar un concepto a una cuenta', () => {
  it('se niega si la cuenta no existe, en vez de dejar el concepto colgado', async () => {
    const { db } = baseCon([[]]);

    await expect(
      new AccountLineRepository(db).add({
        accountId: 'fantasma',
        description: 'Reposición del termotanque',
        unitPrice: '80000',
        sourceType: 'workorder',
      })
    ).rejects.toThrow(/no existe esa cuenta/i);
  });

  it('agrega el concepto cuando la cuenta existe', async () => {
    const { db } = baseCon([
      CUENTA,
      [{ id: 'linea-1', account_id: 'cuenta-1', subtotal: '80000' }],
    ]);

    const linea = await new AccountLineRepository(db).add({
      accountId: 'cuenta-1',
      description: 'Reposición del termotanque',
      unitPrice: '80000',
      sourceType: 'workorder',
    });

    expect(linea).toMatchObject({ id: 'linea-1', account_id: 'cuenta-1' });
  });

  it('con un origen ya cargado no lo duplica: devuelve el que estaba', async () => {
    // La idempotencia por `sourceRef` es lo que permite reintentar un barrido sin
    // cobrarle dos veces el mismo arreglo al inquilino.
    const yaEstaba = { id: 'linea-previa', account_id: 'cuenta-1', source_ref: 'workorder:wo-1' };
    const { db } = baseCon([CUENTA, [yaEstaba]]);

    const linea = await new AccountLineRepository(db).add({
      accountId: 'cuenta-1',
      description: 'Reposición del termotanque',
      unitPrice: '80000',
      sourceType: 'workorder',
      sourceRef: 'workorder:wo-1',
    });

    expect(linea).toMatchObject({ id: 'linea-previa' });
  });
});
