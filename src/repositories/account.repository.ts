import { randomUUID } from 'node:crypto';

import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { accountLineTable } from '../schema/account-line.js';
import type { AccountLineRow } from '../schema/account-line.js';
import { accountTable } from '../schema/account.js';
import type { AccountRow, NewAccountRow } from '../schema/account.js';
import { paymentTable } from '../schema/payment.js';
import type { PaymentRow } from '../schema/payment.js';
import { toIsoUtc } from '../utils/datetime.js';
import { derivePaymentSummary } from '../utils/payment-status.js';
import type { PaymentStatus } from '../utils/payment-status.js';

/**
 * Cuenta con total (de líneas) y estado de cobro (de pagos) DERIVADOS — nada se persiste,
 * se calcula por SQL/agregación para ser concurrencia-safe. Ver derivePaymentSummary.
 */
export interface AccountWithTotal extends AccountRow {
  total: string;
  /** SUM de pagos. */
  paid: string;
  /** total − pagado (nunca negativo). */
  balance: string;
  paymentStatus: PaymentStatus;
}

/** Cliente con saldo pendiente agregado (para la vista Deudores). */
export interface DebtorRow {
  contact_id: string | null;
  /** Suma de saldos pendientes de todas sus cuentas. */
  debt: string;
  /** Cantidad de cuentas con saldo. */
  account_count: number;
  /** Fecha (ISO-UTC) de la cuenta con saldo más vieja — antigüedad del fiado. */
  oldest_opened_at: string;
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
    openedAt = null,
  }: {
    contactId?: string | null;
    petId?: string | null;
    consultationId?: string | null;
    source?: string;
    /** Fecha de negocio del cobro (ej. la fecha de la consulta). Default: ahora (now()). */
    openedAt?: string | null;
  }): Promise<AccountRow> {
    if (consultationId) {
      // Dedup por consultation_id SIN filtrar por estado: una consulta tiene UNA sola
      // cuenta (la de su visita). Si filtráramos por status='open', una cuenta ya cerrada
      // haría que un re-sync (o el backfill) creara una segunda cuenta para la misma
      // consulta → cuentas duplicadas y doble conteo de ingresos.
      const existing = await this.db.ormQuery((tx) =>
        tx
          .select()
          .from(accountTable)
          .where(eq(accountTable.consultation_id, consultationId))
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
      // opened_at SIEMPRE en ISO/UTC: los reportes por fecha (toDateKey/luxon) necesitan
      // un formato parseable consistente. El default now() de Postgres es local-sin-TZ y
      // no parsea como ISO. `openedAt` = fecha de negocio (ej. fecha de la consulta).
      opened_at: openedAt ?? new Date().toISOString(),
    } as unknown as NewAccountRow;
    const created = await this.db.ormQuery((tx) => tx.insert(accountTable).values(row).returning());
    return created[0];
  }

  /**
   * Mapas `account_id → total de líneas` y `account_id → cobrado (SUM pagos)`, calculados
   * con `SUM ... GROUP BY` en la base (escalable). Base de todos los saldos derivados;
   * compartido por listWithTotals y listDebtors para no duplicar las agregaciones.
   */
  private async accountTotals(): Promise<{
    totalBy: Map<string, string>;
    paidBy: Map<string, string>;
  }> {
    const lineTotals = (await this.db.ormQuery((tx) =>
      tx
        .select({
          account_id: accountLineTable.account_id,
          total: sql<string>`coalesce(sum(${accountLineTable.subtotal}::numeric), 0)::text`,
        })
        .from(accountLineTable)
        .groupBy(accountLineTable.account_id)
    )) as Array<{ account_id: string; total: string }>;
    const paidTotals = (await this.db.ormQuery((tx) =>
      tx
        .select({
          account_id: paymentTable.account_id,
          paid: sql<string>`coalesce(sum(${paymentTable.amount}::numeric), 0)::text`,
        })
        .from(paymentTable)
        .groupBy(paymentTable.account_id)
    )) as Array<{ account_id: string; paid: string }>;
    return {
      totalBy: new Map(lineTotals.map((t) => [t.account_id, t.total])),
      paidBy: new Map(paidTotals.map((p) => [p.account_id, p.paid])),
    };
  }

  /**
   * Lista de cuentas con total derivado (para la vista Cobros y los ingresos).
   * El total se calcula con `SUM ... GROUP BY` en la base (escalable: no trae todas
   * las líneas a memoria). Acepta rango de fechas opcional sobre `opened_at`.
   */
  async listWithTotals({
    from,
    to,
    draft = false,
  }: { from?: string; to?: string; draft?: boolean } = {}): Promise<AccountWithTotal[]> {
    // Por defecto excluye presupuestos (status='draft'); con draft=true devuelve SOLO esos.
    const conditions: SQL[] = [
      draft ? eq(accountTable.status, 'draft') : ne(accountTable.status, 'draft'),
    ];
    if (from) conditions.push(gte(accountTable.opened_at, from));
    if (to) conditions.push(lte(accountTable.opened_at, to));

    const accounts = (await this.db.ormQuery((tx) =>
      tx
        .select()
        .from(accountTable)
        .where(and(...conditions))
    )) as AccountRow[];

    const { totalBy, paidBy } = await this.accountTotals();
    return accounts.map((a) => {
      const total = totalBy.get(a.id) ?? '0';
      const summary = derivePaymentSummary(total, paidBy.get(a.id) ?? '0');
      return { ...a, opened_at: toIsoUtc(a.opened_at), total, ...summary };
    });
  }

  /** Cuenta + líneas + total + estado de cobro + pagos (para el detalle / drawer). */
  async getWithLines({ id }: { id: string }): Promise<
    | {
        account: AccountRow;
        lines: AccountLineRow[];
        total: string;
        paid: string;
        balance: string;
        paymentStatus: PaymentStatus;
        payments: PaymentRow[];
      }
    | undefined
  > {
    const accountRows = await this.db.ormQuery((tx) =>
      tx.select().from(accountTable).where(eq(accountTable.id, id)).limit(1)
    );
    const account = accountRows[0];
    if (!account) return undefined;
    const lines = (await this.db.ormQuery((tx) =>
      tx.select().from(accountLineTable).where(eq(accountLineTable.account_id, id))
    )) as AccountLineRow[];
    const payments = (await this.db.ormQuery((tx) =>
      tx.select().from(paymentTable).where(eq(paymentTable.account_id, id))
    )) as PaymentRow[];
    const total = lines.reduce((s, l) => s + Number(l.subtotal || 0), 0);
    const paidNum = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const summary = derivePaymentSummary(total, paidNum);
    return {
      account,
      lines,
      total: String(total),
      ...summary,
      payments: payments
        .map((p) => ({ ...p, paid_at: toIsoUtc(p.paid_at) }))
        .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1)),
    };
  }

  /**
   * Clientes con saldo pendiente, agregados por contacto (vista Deudores = "¿quién me
   * debe?"). El saldo de cada cuenta = total de líneas − total de pagos (derivado, igual
   * que en listWithTotals). Solo incluye cuentas con saldo > 0. Ordenado por deuda desc.
   */
  async listDebtors(): Promise<DebtorRow[]> {
    const accounts = (await this.db.ormQuery((tx) =>
      tx.select().from(accountTable)
    )) as AccountRow[];
    const { totalBy, paidBy } = await this.accountTotals();

    // Cuenta nula '—' como clave para los mostradores sin contacto, se mapea a null al salir.
    const byContact = new Map<string, { debt: number; count: number; oldest: string }>();
    for (const a of accounts) {
      const balance = Number(totalBy.get(a.id) ?? 0) - Number(paidBy.get(a.id) ?? 0);
      if (balance <= 0.005) continue;
      const key = a.contact_id ?? '—';
      const opened = toIsoUtc(a.opened_at);
      const cur = byContact.get(key);
      if (cur) {
        cur.debt += balance;
        cur.count += 1;
        if (opened < cur.oldest) cur.oldest = opened;
      } else {
        byContact.set(key, { debt: balance, count: 1, oldest: opened });
      }
    }
    return Array.from(byContact.entries())
      .map(([contact_id, v]) => ({
        contact_id: contact_id === '—' ? null : contact_id,
        debt: String(v.debt),
        account_count: v.count,
        oldest_opened_at: v.oldest,
      }))
      .sort((a, b) => Number(b.debt) - Number(a.debt));
  }

  /** Cierra la cuenta (status='closed'). */
  async close({ id }: { id: string }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) =>
      tx.update(accountTable).set({ status: 'closed' }).where(eq(accountTable.id, id)).returning()
    );
  }

  /**
   * Crea un presupuesto vacío: una cuenta en estado 'draft' (no es cobro todavía).
   * Se llena con líneas (lines.add) y luego se promueve con convertToCharge.
   */
  async createDraft({
    contactId = null,
    petId = null,
  }: {
    contactId?: string | null;
    petId?: string | null;
  }): Promise<AccountRow> {
    const row = {
      id: randomUUID(),
      contact_id: contactId,
      pet_id: petId,
      consultation_id: null,
      source: 'counter',
      status: 'draft',
      opened_at: new Date().toISOString(),
    } as unknown as NewAccountRow;
    const created = await this.db.ormQuery((tx) => tx.insert(accountTable).values(row).returning());
    return created[0];
  }

  /**
   * Promueve un presupuesto a cuenta de cobro viva: status 'draft'→'open' y `opened_at`=ahora
   * (la fecha del cobro es la de la conversión, no la del borrador). Las líneas ya están — no
   * se re-tipea nada (el dolor #1 del rubro). Tras convertir, el cobro vive editable aparte.
   */
  async convertToCharge({ id }: { id: string }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) =>
      tx
        .update(accountTable)
        // Cast: drizzle omite columnas con default (opened_at) del tipo de update — mismo
        // bug de pgSchema que en los inserts. El runtime actualiza igual.
        .set({
          status: 'open',
          opened_at: new Date().toISOString(),
        } as unknown as Partial<AccountRow>)
        .where(eq(accountTable.id, id))
        .returning()
    );
  }

  /** Borra una cuenta junto con sus líneas (para descartar un presupuesto). */
  async deleteWithLines({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) =>
      tx.delete(accountLineTable).where(eq(accountLineTable.account_id, id))
    );
    await this.db.ormQuery((tx) => tx.delete(accountTable).where(eq(accountTable.id, id)));
  }

  async getById({ id }: { id: string }): Promise<AccountRow | undefined> {
    const rows = await this.db.ormQuery((tx) =>
      tx.select().from(accountTable).where(eq(accountTable.id, id)).limit(1)
    );
    return rows[0];
  }

  async create({ data }: { data: NewAccountRow }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) => tx.insert(accountTable).values(data).returning());
  }

  async update({ id, data }: { id: string; data: Partial<NewAccountRow> }): Promise<AccountRow[]> {
    return this.db.ormQuery((tx) =>
      tx.update(accountTable).set(data).where(eq(accountTable.id, id)).returning()
    );
  }

  async delete({ id }: { id: string }): Promise<void> {
    await this.db.ormQuery((tx) => tx.delete(accountTable).where(eq(accountTable.id, id)));
  }
}
