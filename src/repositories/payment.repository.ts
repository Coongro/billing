import { randomUUID } from 'node:crypto';

import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { eq } from 'drizzle-orm';

import { paymentTable } from '../schema/payment.js';
import type { PaymentRow, NewPaymentRow } from '../schema/payment.js';
import { toIsoUtc } from '../utils/datetime.js';

export class PaymentRepository {
  constructor(private readonly db: ModuleDatabaseAPI) {}

  async list(): Promise<PaymentRow[]> {
    return this.db.ormQuery((tx) => tx.select().from(paymentTable));
  }

  /**
   * Registra un cobro contra una cuenta. Un pago por fila → soporta cobro parcial y split.
   * `paidAt` permite la fecha de negocio (default: ahora, ISO/UTC).
   */
  async record({
    accountId,
    amount,
    method,
    paidAt = null,
    notes = null,
  }: {
    accountId: string;
    amount: string;
    method: string;
    paidAt?: string | null;
    notes?: string | null;
  }): Promise<PaymentRow> {
    // Cast: drizzle $inferInsert omite columnas nullable (bug conocido); runtime inserta OK.
    const row = {
      id: randomUUID(),
      account_id: accountId,
      amount,
      method,
      paid_at: paidAt ?? new Date().toISOString(),
      notes,
    } as unknown as NewPaymentRow;
    const created = await this.db.ormQuery((tx) => tx.insert(paymentTable).values(row).returning());
    return created[0];
  }

  /** Pagos de una cuenta, normalizados a ISO-UTC y ordenados del más reciente al más viejo. */
  async listByAccount({ accountId }: { accountId: string }): Promise<PaymentRow[]> {
    const rows = (await this.db.ormQuery((tx) =>
      tx.select().from(paymentTable).where(eq(paymentTable.account_id, accountId))
    )) as PaymentRow[];
    return rows
      .map((p) => ({ ...p, paid_at: toIsoUtc(p.paid_at) }))
      .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1));
  }

  async getById({ id }: { id: string }): Promise<PaymentRow | undefined> {
    const rows = await this.db.ormQuery((tx) =>
      tx.select().from(paymentTable).where(eq(paymentTable.id, id)).limit(1)
    );
    return rows[0];
  }

  /**
   * Anula un cobro borrando la fila. Patrón void simple (no contra-asiento): es un ledger
   * interno NO fiscal, así que corregir un error de carga = borrar la fila.
   */
  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) => tx.delete(paymentTable).where(eq(paymentTable.id, id)));
  }
}
