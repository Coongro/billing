import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { desc, eq, lt, sql } from 'drizzle-orm';

import { accountLineTable } from '../schema/account-line.js';
import { accountTable } from '../schema/account.js';
import { cashCloseTable } from '../schema/cash-close.js';
import type { CashCloseRow, NewCashCloseRow } from '../schema/cash-close.js';
import { paymentTable } from '../schema/payment.js';
import { toIsoUtc } from '../utils/datetime.js';

/** Ref opaca que identifica la Salida automática de retiro de un cierre (dedupe por día). */
function withdrawRef(businessDay: string): string {
  return `cash-close:${businessDay}`;
}

export class CashCloseRepository {
  constructor(private readonly db: ModuleDatabaseAPI) {}

  /**
   * Cierra (o re-cierra) la caja de un día. Upsert app-level por `business_day`: un día
   * tiene UN cierre; re-cerrar pisa los valores. `expectedCash` y `difference` llegan ya
   * calculados desde la vista y se snapshotean (ver schema: no se derivan).
   *
   * Ciclo del efectivo (COONG-250): `withdrawn` = lo que se retira del cajón al cerrar y
   * `nextFloat` = lo que queda de fondo para mañana. Si hay retiro, se registra una
   * Salida automática en el ledger (cuenta payable + pago efectivo) — ver syncWithdraw.
   */
  async record({
    businessDay,
    openingFloat,
    expectedCash,
    countedCash,
    difference,
    withdrawn = '0',
    nextFloat = null,
    notes = null,
  }: {
    businessDay: string;
    openingFloat: string;
    expectedCash: string;
    countedCash: string;
    difference: string;
    withdrawn?: string;
    nextFloat?: string | null;
    notes?: string | null;
  }): Promise<CashCloseRow> {
    const existing = await this.getByDay({ businessDay });
    let saved: CashCloseRow;
    if (existing) {
      // Cast: drizzle .set() omite columnas con default/notNull (mismo bug pgSchema que en
      // updates de account.opened_at). closed_at va como sql`now()` porque el ISO string
      // se pierde en el update (verificado en COONG-249: el re-cierre no refrescaba la hora).
      const updated = await this.db.ormQuery((tx) =>
        tx
          .update(cashCloseTable)
          .set({
            opening_float: openingFloat,
            expected_cash: expectedCash,
            counted_cash: countedCash,
            difference,
            withdrawn,
            next_float: nextFloat,
            notes,
            closed_at: sql`now()`,
          } as unknown as Partial<CashCloseRow>)
          .where(eq(cashCloseTable.id, existing.id))
          .returning()
      );
      saved = updated[0];
    } else {
      const row = {
        id: crypto.randomUUID(),
        business_day: businessDay,
        opening_float: openingFloat,
        expected_cash: expectedCash,
        counted_cash: countedCash,
        difference,
        withdrawn,
        next_float: nextFloat,
        closed_at: new Date().toISOString(),
        notes,
      } as unknown as NewCashCloseRow;
      const created = await this.db.ormQuery((tx) =>
        tx.insert(cashCloseTable).values(row).returning()
      );
      saved = created[0];
    }
    await this.syncWithdraw(businessDay, Number(withdrawn) || 0);
    return saved;
  }

  /**
   * Mantiene la Salida automática del retiro del cierre: una cuenta payable "Retiro de
   * caja" con su línea y su pago efectivo, identificada por `consultation_id` =
   * `cash-close:<día>` (ref opaca — el mismo dedupe que usan las visitas). Re-cerrar
   * reemplaza línea y pago con el monto nuevo; retiro en 0 la elimina. Así el retiro
   * aparece en Salidas y en los egresos del día sin cargarlo a mano, sin duplicarse.
   */
  private async syncWithdraw(businessDay: string, withdrawn: number): Promise<void> {
    const ref = withdrawRef(businessDay);
    const existing = (await this.db.ormQuery((tx) =>
      tx.select().from(accountTable).where(eq(accountTable.consultation_id, ref)).limit(1)
    )) as Array<{ id: string }>;
    const accountId = existing[0]?.id;

    if (withdrawn <= 0) {
      if (accountId) {
        await this.db.ormQuery((tx) =>
          tx.delete(paymentTable).where(eq(paymentTable.account_id, accountId))
        );
        await this.db.ormQuery((tx) =>
          tx.delete(accountLineTable).where(eq(accountLineTable.account_id, accountId))
        );
        await this.db.ormQuery((tx) =>
          tx.delete(accountTable).where(eq(accountTable.id, accountId))
        );
      }
      return;
    }

    const amount = String(withdrawn);
    let id = accountId;
    if (!id) {
      id = crypto.randomUUID();
      // Cast: drizzle $inferInsert omite columnas nullable (bug conocido); runtime OK.
      await this.db.ormQuery((tx) =>
        tx.insert(accountTable).values({
          id,
          contact_id: null,
          pet_id: null,
          consultation_id: ref,
          source: 'gasto',
          status: 'open',
          direction: 'payable',
          opened_at: new Date().toISOString(),
          notes: 'Retiro de caja',
        } as never)
      );
    }
    // Reemplazo total de línea y pago: el monto del retiro es el del ÚLTIMO cierre.
    await this.db.ormQuery((tx) => tx.delete(paymentTable).where(eq(paymentTable.account_id, id)));
    await this.db.ormQuery((tx) =>
      tx.delete(accountLineTable).where(eq(accountLineTable.account_id, id))
    );
    await this.db.ormQuery((tx) =>
      tx.insert(accountLineTable).values({
        id: crypto.randomUUID(),
        account_id: id,
        product_id: null,
        description: 'Retiro de caja',
        quantity: '1',
        unit_price: amount,
        subtotal: amount,
        source_type: 'service',
        source_ref: ref,
      } as never)
    );
    await this.db.ormQuery((tx) =>
      tx.insert(paymentTable).values({
        id: crypto.randomUUID(),
        account_id: id,
        amount,
        method: 'efectivo',
        paid_at: new Date().toISOString(),
        notes: 'Retiro al cierre de caja',
      } as never)
    );
  }

  /** Cierre de un día (o undefined si ese día no se cerró), con closed_at en ISO-UTC. */
  async getByDay({ businessDay }: { businessDay: string }): Promise<CashCloseRow | undefined> {
    const rows = (await this.db.ormQuery((tx) =>
      tx.select().from(cashCloseTable).where(eq(cashCloseTable.business_day, businessDay)).limit(1)
    )) as CashCloseRow[];
    const c = rows[0];
    return c ? { ...c, closed_at: toIsoUtc(c.closed_at) } : undefined;
  }

  /**
   * Último cierre ANTERIOR a un día ('YYYY-MM-DD' compara bien como texto). Lo usa la
   * Caja para pre-cargar el fondo inicial con el `next_float` que dejó el cierre previo.
   */
  async getPrevious({ businessDay }: { businessDay: string }): Promise<CashCloseRow | undefined> {
    const rows = (await this.db.ormQuery((tx) =>
      tx
        .select()
        .from(cashCloseTable)
        .where(lt(cashCloseTable.business_day, businessDay))
        .orderBy(desc(cashCloseTable.business_day))
        .limit(1)
    )) as CashCloseRow[];
    const c = rows[0];
    return c ? { ...c, closed_at: toIsoUtc(c.closed_at) } : undefined;
  }

  /** Últimos cierres (más reciente primero), para el historial de la Caja. */
  async listRecent({ limit = 14 }: { limit?: number } = {}): Promise<CashCloseRow[]> {
    const rows = (await this.db.ormQuery((tx) =>
      tx
        .select()
        .from(cashCloseTable)
        .orderBy(desc(cashCloseTable.business_day))
        .limit(Math.min(Math.max(limit, 1), 60))
    )) as CashCloseRow[];
    return rows.map((c) => ({ ...c, closed_at: toIsoUtc(c.closed_at) }));
  }

  /** Reabre la caja borrando el cierre del día (mismo patrón void que el resto). */
  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) => tx.delete(cashCloseTable).where(eq(cashCloseTable.id, id)));
  }
}
