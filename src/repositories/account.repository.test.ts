import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';

/**
 * Abrir una cuenta a nombre de un cliente.
 *
 * Es la única puerta de entrada publicada al canal agentic, y existe con una
 * condición: no poder pisar la referencia con la que el contrato emite el mes.
 * Si pudiera, un agente ocuparía el `source_ref` de un período y la emisión
 * real fallaría después por el índice único, sin poder explicar por qué.
 */
const { AccountRepository } = await import('./account.repository.js');

/** Una base que responde por turno y guarda lo que se le mandó insertar. */
function baseCon(respuestas: unknown[][]) {
  const cola = [...respuestas];
  const insertado: Array<Record<string, unknown>> = [];
  const ormQuery = vi.fn((fn: (tx: unknown) => unknown) => {
    // El tx mínimo que estas rutas ejercitan: un select encadenable que agota la
    // cola de respuestas, y un insert que anota la fila y la devuelve.
    const tx = {
      select: () => tx,
      from: () => tx,
      where: () => tx,
      limit: () => tx,
      insert: () => tx,
      values: (fila: Record<string, unknown>) => {
        insertado.push(fila);
        return tx;
      },
      returning: () => [insertado.at(-1)],
      then: undefined,
    };
    const salida = fn(tx);
    // Un select devuelve el propio tx encadenado: ahí va la respuesta de la cola.
    return Promise.resolve(salida === tx ? (cola.shift() ?? []) : salida);
  });
  return { db: { ormQuery } as unknown as ModuleDatabaseAPI, insertado };
}

describe('abrir una cuenta a nombre de un cliente', () => {
  it('genera su propia referencia en vez de aceptar una: no puede chocar con el mes emitido', async () => {
    const { db, insertado } = baseCon([[], []]);

    await new AccountRepository(db).openForContact({ contactId: 'cliente-1' });

    const cuenta = insertado.find((fila) => 'source' in fila);
    expect(cuenta?.source).toBe('manual');
    // La referencia del cargo de un mes tiene la forma `<leaseId>:<período>`.
    // Esta es un uuid recién generado, así que no hay forma de apuntarle.
    expect(String(cuenta?.source_ref)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(String(cuenta?.source_ref)).not.toContain(':');
  });

  it('dos aperturas para el mismo cliente no comparten referencia', async () => {
    // Si la compartieran, la segunda devolvería la primera cuenta —openForSource
    // deduplica por (source, sourceRef)— y dos cobros distintos terminarían
    // sumando al mismo saldo.
    const { db, insertado } = baseCon([[], [], [], []]);
    const repo = new AccountRepository(db);

    await repo.openForContact({ contactId: 'cliente-1' });
    await repo.openForContact({ contactId: 'cliente-1' });

    const refs = insertado.filter((fila) => 'source_ref' in fila).map((fila) => fila.source_ref);
    expect(refs).toHaveLength(2);
    expect(refs[0]).not.toBe(refs[1]);
  });
});
