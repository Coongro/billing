import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { accountLineTable } from '../schema/account-line.js';
import type { AccountLineRow, NewAccountLineRow } from '../schema/account-line.js';
import { accountTable } from '../schema/account.js';
import { toIsoUtc } from '../utils/datetime.js';

/** Línea con la fecha y el origen de su cuenta (para reportes/agregados por rango). */
export interface AccountLineInRange {
  description: string;
  quantity: string;
  subtotal: string;
  source_type: string;
  account_source: string;
  opened_at: string;
}

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
   * Líneas de todas las cuentas cuyo `opened_at` cae en el rango (join con la cuenta).
   * Pensado para reportes/dashboards (ej. "ingresos" y "ítems más cobrados" por período).
   * El filtro de fecha va sobre la cuenta, no la línea, para que todos los actos de una
   * misma visita compartan la fecha de la cuenta.
   */
  async listInRange({ from, to }: { from?: string; to?: string } = {}): Promise<
    AccountLineInRange[]
  > {
    const conditions: SQL[] = [];
    if (from) conditions.push(gte(accountTable.opened_at, from));
    if (to) conditions.push(lte(accountTable.opened_at, to));

    const rows = (await this.db.ormQuery((tx) => {
      const q = tx
        .select({
          description: accountLineTable.description,
          quantity: accountLineTable.quantity,
          subtotal: accountLineTable.subtotal,
          source_type: accountLineTable.source_type,
          account_source: accountTable.source,
          opened_at: accountTable.opened_at,
        })
        .from(accountLineTable)
        .innerJoin(accountTable, eq(accountLineTable.account_id, accountTable.id));
      return conditions.length ? q.where(and(...conditions)) : q;
    })) as AccountLineInRange[];
    return rows.map((r) => ({ ...r, opened_at: toIsoUtc(r.opened_at) }));
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
      id: crypto.randomUUID(),
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

  /**
   * Reemplaza TODAS las líneas de un origen (`sourceType`) en la cuenta por el set
   * provisto, en una sola operación. Reutilizable por cualquier productor que "posea"
   * un conjunto de líneas (servicios de una consulta, ítems de un carrito): re-sincroniza
   * sin duplicar al re-guardar y sin tocar líneas de otros orígenes (ej. vacunas) de la
   * misma cuenta. Pasar `lines` vacío limpia las de ese origen.
   */
  async syncSource({
    accountId,
    sourceType,
    lines,
  }: {
    accountId: string;
    sourceType: string;
    lines: Array<{
      productId?: string | null;
      description: string;
      quantity?: string;
      unitPrice: string;
      subtotal?: string;
      sourceRef?: string | null;
    }>;
  }): Promise<AccountLineRow[]> {
    await this.db.ormQuery((tx) =>
      tx
        .delete(accountLineTable)
        .where(
          and(
            eq(accountLineTable.account_id, accountId),
            eq(accountLineTable.source_type, sourceType)
          )
        )
    );
    const created: AccountLineRow[] = [];
    for (const l of lines) {
      created.push(
        await this.add({
          accountId,
          sourceType,
          productId: l.productId ?? null,
          description: l.description,
          quantity: l.quantity ?? '1',
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
          sourceRef: l.sourceRef ?? null,
        })
      );
    }
    return created;
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
