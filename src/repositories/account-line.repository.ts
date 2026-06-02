import { randomUUID } from 'node:crypto';

import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { and, eq } from 'drizzle-orm';

import { accountLineTable } from '../schema/account-line.js';
import type { AccountLineRow, NewAccountLineRow } from '../schema/account-line.js';

export class AccountLineRepository {
  constructor(private readonly db: ModuleDatabaseAPI) {}

  async list(): Promise<AccountLineRow[]> {
    return this.db.ormQuery((tx) => tx.select().from(accountLineTable));
  }

  /** Líneas de una cuenta. */
  async listByAccount({ accountId }: { accountId: string }): Promise<AccountLineRow[]> {
    return this.db.ormQuery((tx) =>
      tx.select().from(accountLineTable).where(eq(accountLineTable.account_id, accountId))
    );
  }

  /**
   * Agrega una línea de cobro a una cuenta. Calcula el subtotal (qty × unit_price)
   * si no se pasa. Idempotente por `sourceRef` dentro de la cuenta: si ya existe una
   * línea con ese origen (ej. una aplicación de vacuna ya cobrada), no la duplica.
   */
  async add({
    accountId,
    productId = null,
    description,
    quantity = '1',
    unitPrice,
    subtotal,
    sourceType,
    sourceRef = null,
  }: {
    accountId: string;
    productId?: string | null;
    description: string;
    quantity?: string;
    unitPrice: string;
    subtotal?: string;
    sourceType: string;
    sourceRef?: string | null;
  }): Promise<AccountLineRow> {
    if (sourceRef) {
      const dup = await this.db.ormQuery((tx) =>
        tx
          .select()
          .from(accountLineTable)
          .where(
            and(
              eq(accountLineTable.account_id, accountId),
              eq(accountLineTable.source_ref, sourceRef)
            )
          )
          .limit(1)
      );
      if (dup[0]) return dup[0];
    }
    const computedSubtotal = subtotal ?? String(Number(quantity || '1') * Number(unitPrice || '0'));
    // Cast: drizzle $inferInsert omite columnas nullable (bug conocido); runtime OK.
    const row = {
      id: randomUUID(),
      account_id: accountId,
      product_id: productId,
      description,
      quantity,
      unit_price: unitPrice,
      subtotal: computedSubtotal,
      source_type: sourceType,
      source_ref: sourceRef,
    } as unknown as NewAccountLineRow;
    const created = await this.db.ormQuery((tx) =>
      tx.insert(accountLineTable).values(row).returning()
    );
    return created[0];
  }

  async getById({ id }: { id: string }): Promise<AccountLineRow | undefined> {
    const rows = await this.db.ormQuery((tx) =>
      tx.select().from(accountLineTable).where(eq(accountLineTable.id, id)).limit(1)
    );
    return rows[0];
  }

  async create({ data }: { data: NewAccountLineRow }): Promise<AccountLineRow[]> {
    return this.db.ormQuery((tx) => tx.insert(accountLineTable).values(data).returning());
  }

  async update({
    id,
    data,
  }: {
    id: string;
    data: Partial<NewAccountLineRow>;
  }): Promise<AccountLineRow[]> {
    return this.db.ormQuery((tx) =>
      tx.update(accountLineTable).set(data).where(eq(accountLineTable.id, id)).returning()
    );
  }

  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) => tx.delete(accountLineTable).where(eq(accountLineTable.id, id)));
  }
}
