import { randomUUID } from 'node:crypto';

import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { expenseTable } from '../schema/expense.js';
import type { ExpenseRow, NewExpenseRow } from '../schema/expense.js';
import { toIsoUtc } from '../utils/datetime.js';

export class ExpenseRepository {
  constructor(private readonly db: ModuleDatabaseAPI) {}

  async list(): Promise<ExpenseRow[]> {
    return this.db.ormQuery((tx) => tx.select().from(expenseTable));
  }

  /**
   * Registra un egreso de caja (salida de efectivo). `spentAt` permite la fecha de negocio
   * (default: ahora, ISO/UTC).
   */
  async record({
    amount,
    category,
    spentAt = null,
    notes = null,
  }: {
    amount: string;
    category: string;
    spentAt?: string | null;
    notes?: string | null;
  }): Promise<ExpenseRow> {
    // Cast: drizzle $inferInsert omite columnas nullable (bug conocido); runtime inserta OK.
    const row = {
      id: randomUUID(),
      amount,
      category,
      spent_at: spentAt ?? new Date().toISOString(),
      notes,
    } as unknown as NewExpenseRow;
    const created = await this.db.ormQuery((tx) => tx.insert(expenseTable).values(row).returning());
    return created[0];
  }

  /**
   * Egresos en un rango de fechas (por `spent_at`), normalizados a ISO-UTC. Para la Caja
   * diaria: cuánto salió y por qué. Sin rango = todos.
   */
  async listInRange({ from, to }: { from?: string; to?: string } = {}): Promise<ExpenseRow[]> {
    const conditions: SQL[] = [];
    if (from) conditions.push(gte(expenseTable.spent_at, from));
    if (to) conditions.push(lte(expenseTable.spent_at, to));
    const rows = (await this.db.ormQuery((tx) => {
      const q = tx.select().from(expenseTable);
      return conditions.length ? q.where(and(...conditions)) : q;
    })) as ExpenseRow[];
    return rows.map((r) => ({ ...r, spent_at: toIsoUtc(r.spent_at) }));
  }

  async getById({ id }: { id: string }): Promise<ExpenseRow | undefined> {
    const rows = await this.db.ormQuery((tx) =>
      tx.select().from(expenseTable).where(eq(expenseTable.id, id)).limit(1)
    );
    return rows[0];
  }

  /**
   * Anula un egreso borrando la fila. Mismo patrón void que payments: ledger interno NO
   * fiscal, así que corregir un error de carga = borrar la fila.
   */
  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) => tx.delete(expenseTable).where(eq(expenseTable.id, id)));
  }
}
