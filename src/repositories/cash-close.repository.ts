
import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { eq } from 'drizzle-orm';

import { cashCloseTable } from '../schema/cash-close.js';
import type { CashCloseRow, NewCashCloseRow } from '../schema/cash-close.js';
import { toIsoUtc } from '../utils/datetime.js';

export class CashCloseRepository {
  constructor(private readonly db: ModuleDatabaseAPI) {}

  /**
   * Cierra (o re-cierra) la caja de un día. Upsert app-level por `business_day`: un día
   * tiene UN cierre; re-cerrar pisa los valores. `expectedCash` y `difference` llegan ya
   * calculados desde la vista y se snapshotean (ver schema: no se derivan).
   */
  async record({
    businessDay,
    openingFloat,
    expectedCash,
    countedCash,
    difference,
    notes = null,
  }: {
    businessDay: string;
    openingFloat: string;
    expectedCash: string;
    countedCash: string;
    difference: string;
    notes?: string | null;
  }): Promise<CashCloseRow> {
    const existing = await this.getByDay({ businessDay });
    if (existing) {
      // Cast: drizzle .set() omite columnas con default/notNull (mismo bug pgSchema que en
      // updates de account.opened_at); el runtime aplica todas las claves del objeto.
      const updated = await this.db.ormQuery((tx) =>
        tx
          .update(cashCloseTable)
          .set({
            opening_float: openingFloat,
            expected_cash: expectedCash,
            counted_cash: countedCash,
            difference,
            notes,
            closed_at: new Date().toISOString(),
          } as unknown as Partial<CashCloseRow>)
          .where(eq(cashCloseTable.id, existing.id))
          .returning()
      );
      return updated[0];
    }
    const row = {
      id: crypto.randomUUID(),
      business_day: businessDay,
      opening_float: openingFloat,
      expected_cash: expectedCash,
      counted_cash: countedCash,
      difference,
      closed_at: new Date().toISOString(),
      notes,
    } as unknown as NewCashCloseRow;
    const created = await this.db.ormQuery((tx) =>
      tx.insert(cashCloseTable).values(row).returning()
    );
    return created[0];
  }

  /** Cierre de un día (o undefined si ese día no se cerró), con closed_at en ISO-UTC. */
  async getByDay({ businessDay }: { businessDay: string }): Promise<CashCloseRow | undefined> {
    const rows = (await this.db.ormQuery((tx) =>
      tx.select().from(cashCloseTable).where(eq(cashCloseTable.business_day, businessDay)).limit(1)
    )) as CashCloseRow[];
    const c = rows[0];
    return c ? { ...c, closed_at: toIsoUtc(c.closed_at) } : undefined;
  }

  /** Reabre la caja borrando el cierre del día (mismo patrón void que el resto). */
  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) => tx.delete(cashCloseTable).where(eq(cashCloseTable.id, id)));
  }
}
