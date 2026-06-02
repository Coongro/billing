import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { accountTable } from '../schema/account.js';
import type { AccountRow, NewAccountRow } from '../schema/account.js';
import { accountLineTable } from '../schema/account-line.js';
import type { AccountLineRow } from '../schema/account-line.js';

/** Cuenta con su total derivado de las líneas (no se persiste — concurrencia-safe). */
export interface AccountWithTotal extends AccountRow {
  total: string;
}

export class AccountRepository {
  constructor(private readonly db: ModuleDatabaseAPI) {}

  async list(): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) => tx.select().from(accountTable));
  }

  /**
   * Devuelve la cuenta abierta de la visita. Si viene `consultationId` y ya existe
   * una cuenta abierta para esa consulta, la reutiliza (así todos los actos de la
   * visita caen en UNA cuenta); si no, crea una nueva. Sin consulta = venta de mostrador.
   */
  async openForVisit({
    contactId = null,
    petId = null,
    consultationId = null,
    source = 'counter',
  }: {
    contactId?: string | null;
    petId?: string | null;
    consultationId?: string | null;
    source?: string;
  }): Promise<AccountRow> {
    if (consultationId) {
      const existing = await this.db.ormQuery((tx) =>
        tx
          .select()
          .from(accountTable)
          .where(
            and(eq(accountTable.consultation_id, consultationId), eq(accountTable.status, 'open'))
          )
          .limit(1)
      );
      if (existing[0]) return existing[0];
    }
    // Cast: drizzle $inferInsert omite columnas nullable (bug conocido); el runtime
    // inserta igual todas las claves del objeto. Ver drizzle_pgschema_insert_type_bug.
    const row = {
      id: randomUUID(),
      contact_id: contactId,
      pet_id: petId,
      consultation_id: consultationId,
      source: consultationId ? 'consultation' : source,
      status: 'open',
    } as unknown as NewAccountRow;
    const created = await this.db.ormQuery((tx) =>
      tx.insert(accountTable).values(row).returning()
    );
    return created[0];
  }

  /**
   * Lista de cuentas con total derivado (para la vista Cobros y los ingresos).
   * El total se calcula con `SUM ... GROUP BY` en la base (escalable: no trae todas
   * las líneas a memoria). Acepta rango de fechas opcional sobre `opened_at`.
   */
  async listWithTotals({
    from,
    to,
  }: { from?: string; to?: string } = {}): Promise<AccountWithTotal[]> {
    const conditions = [];
    if (from) conditions.push(gte(accountTable.opened_at, from));
    if (to) conditions.push(lte(accountTable.opened_at, to));

    const accounts = (await this.db.ormQuery((tx) => {
      const q = tx.select().from(accountTable);
      return conditions.length ? q.where(and(...conditions)) : q;
    })) as AccountRow[];

    const totals = (await this.db.ormQuery((tx) =>
      tx
        .select({
          account_id: accountLineTable.account_id,
          total: sql<string>`coalesce(sum(${accountLineTable.subtotal}::numeric), 0)::text`,
        })
        .from(accountLineTable)
        .groupBy(accountLineTable.account_id)
    )) as Array<{ account_id: string; total: string }>;

    const totalByAccount = new Map(totals.map((t) => [t.account_id, t.total]));
    return accounts.map((a) => ({ ...a, total: totalByAccount.get(a.id) ?? '0' }));
  }

  /** Cuenta + sus líneas + total (para el detalle). */
  async getWithLines({
    id,
  }: {
    id: string;
  }): Promise<{ account: AccountRow; lines: AccountLineRow[]; total: string } | undefined> {
    const accountRows = await this.db.ormQuery((tx) =>
      tx.select().from(accountTable).where(eq(accountTable.id, id)).limit(1)
    );
    const account = accountRows[0];
    if (!account) return undefined;
    const lines = (await this.db.ormQuery((tx) =>
      tx.select().from(accountLineTable).where(eq(accountLineTable.account_id, id))
    )) as AccountLineRow[];
    const total = lines.reduce((s, l) => s + Number(l.subtotal || 0), 0);
    return { account, lines, total: String(total) };
  }

  /** Cierra la cuenta (status='closed'). */
  async close({ id }: { id: string }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) =>
      tx.update(accountTable).set({ status: 'closed' }).where(eq(accountTable.id, id)).returning()
    );
  }

  async getById({ id }: { id: string }): Promise<AccountRow | undefined> {
    const rows = await this.db.ormQuery((tx) =>
      tx.select().from(accountTable).where(eq(accountTable.id, id)).limit(1)
    );
    return rows[0];
  }

  async create({ data }: { data: NewAccountRow }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) =>
      tx.insert(accountTable).values(data).returning()
    );
  }

  async update({ id, data }: { id: string; data: Partial<NewAccountRow> }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) =>
      tx.update(accountTable).set(data).where(eq(accountTable.id, id)).returning()
    );
  }

  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) =>
      tx.delete(accountTable).where(eq(accountTable.id, id))
    );
  }
}
