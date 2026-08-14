import type { ModuleDatabaseAPI } from '@coongro/plugin-sdk';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
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
    direction = 'receivable',
  }: {
    contactId?: string | null;
    petId?: string | null;
    consultationId?: string | null;
    source?: string;
    /** Fecha de negocio del cobro (ej. la fecha de la consulta). Default: ahora (now()). */
    openedAt?: string | null;
    /** 'receivable' (por cobrar, Cobros) | 'payable' (por pagar, Salidas). */
    direction?: string;
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
      id: crypto.randomUUID(),
      contact_id: contactId,
      pet_id: petId,
      consultation_id: consultationId,
      source: consultationId ? 'consultation' : source,
      status: 'open',
      direction,
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
  private async _accountTotals(): Promise<{
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
  /**
   * Abre una cuenta que nace de otro plugin (el alquiler de un mes, una cuota),
   * junto con sus líneas, **sin duplicar**: si ya existe una con el mismo
   * (`source`, `sourceRef`) la devuelve tal cual y no toca nada.
   *
   * La idempotencia es el requisito central de la generación automática: apretar dos
   * veces «generar el mes» no puede cobrarle dos veces al inquilino. Además del
   * chequeo previo hay un índice único parcial en la base, que es lo que sostiene el
   * caso de dos pedidos simultáneos.
   *
   * @returns la cuenta y si se creó recién (`created: false` = ya existía)
   */
  async openForSource({
    source,
    sourceRef,
    contactId = null,
    dueDate = null,
    direction = 'receivable',
    notes = null,
    openedAt = null,
    lines = [],
  }: {
    source: string;
    sourceRef: string;
    contactId?: string | null;
    dueDate?: string | null;
    direction?: string;
    notes?: string | null;
    openedAt?: string | null;
    lines?: Array<{
      description: string;
      subtotal: string | number;
      quantity?: string | number;
      unitPrice?: string | number;
      sourceType?: string;
      sourceRef?: string | null;
    }>;
  }): Promise<{ account: AccountRow; created: boolean }> {
    const existing = await this.db.ormQuery((tx) =>
      tx
        .select()
        .from(accountTable)
        .where(and(eq(accountTable.source, source), eq(accountTable.source_ref, sourceRef)))
        .limit(1)
    );
    if (existing[0]) return { account: existing[0], created: false };

    const accountId = crypto.randomUUID();
    const row = {
      id: accountId,
      contact_id: contactId,
      source,
      source_ref: sourceRef,
      due_date: dueDate,
      direction,
      status: 'open',
      notes,
      ...(openedAt ? { opened_at: toIsoUtc(openedAt) } : {}),
    } as unknown as NewAccountRow;

    const created = await this.db.ormQuery((tx) => tx.insert(accountTable).values(row).returning());

    if (lines.length > 0) {
      const lineRows = lines.map((l) => ({
        id: crypto.randomUUID(),
        account_id: accountId,
        description: l.description,
        // Un cargo de alquiler es una unidad de algo: la cantidad existe para los
        // casos que sí la usan (expensas prorrateadas, servicios medidos).
        quantity: String(l.quantity ?? 1),
        unit_price: String(l.unitPrice ?? l.subtotal),
        subtotal: String(l.subtotal),
        source_type: l.sourceType ?? source,
        source_ref: l.sourceRef ?? null,
      }));
      await this.db.ormQuery((tx) => tx.insert(accountLineTable).values(lineRows).returning());
    }

    return { account: created[0], created: true };
  }

  /**
   * Abre una cuenta a nombre de un cliente, sin ningún hecho de otro plugin
   * detrás: el arreglo que se le pasa a un inquilino fuera del cargo del mes,
   * un gasto que hay que registrarle a un proveedor.
   *
   * Existe porque las demás puertas de entrada están cerradas para el canal
   * agentic y con razón —`openForVisit` es del kit veterinario y `openForSource`
   * es el mecanismo interno de la emisión mensual—, pero cerrarlas todas dejaba
   * un hueco real: si el mes todavía no se emitió, no hay ninguna cuenta a la
   * que sumarle un concepto, y cobrarle algo a alguien se vuelve imposible
   * hasta que corra la generación.
   *
   * El `source_ref` es un identificador propio recién generado. Eso es
   * deliberado: la emisión de un mes usa `<leaseId>:<período>` y tiene un índice
   * único: si esta operación pudiera elegir la referencia, un agente podría
   * ocupar la del mes que viene y bloquear la emisión real, que después fallaría
   * sin poder explicar por qué.
   *
   * La cuenta nace vacía y no aparece en los listados hasta que tiene algo
   * cargado o cobrado (ver el filtro de `listWithTotals`): abrirla sola no
   * ensucia nada.
   */
  async openForContact({
    contactId,
    direction = 'receivable',
    notes = null,
    dueDate = null,
  }: {
    contactId: string;
    direction?: string;
    notes?: string | null;
    dueDate?: string | null;
  }): Promise<AccountRow> {
    const { account } = await this.openForSource({
      source: 'manual',
      sourceRef: crypto.randomUUID(),
      contactId,
      direction,
      notes,
      dueDate,
    });
    return account;
  }

  async listWithTotals({
    from,
    to,
    direction = 'receivable',
    source,
    refSuffix,
    contactId,
  }: {
    from?: string;
    to?: string;
    direction?: string;
    /** Filtra por origen (ej. `rent` para ver solo alquileres). */
    source?: string;
    /**
     * Filtra por el final de `source_ref`. Los cargos de alquiler se referencian como
     * `<leaseId>:<período>`, así que `:2026-08` trae los de agosto sin tener que
     * mirar `opened_at` — que es cuándo se generó el cargo, no qué mes cobra.
     */
    refSuffix?: string;
    /**
     * Filtra por cliente. Existe por el camino que va de «¿quién me debe?» a
     * «cobrale»: `listDebtors` agrupa por contacto y devuelve cuánto debe cada
     * uno, no sus cuentas. Sin este filtro, para cobrarle a alguien había que
     * traer TODAS las cuentas por cobrar del tenant y buscar las suyas a mano.
     */
    contactId?: string;
  } = {}): Promise<AccountWithTotal[]> {
    const conditions: SQL[] = [eq(accountTable.direction, direction)];
    if (from) conditions.push(gte(accountTable.opened_at, from));
    if (to) conditions.push(lte(accountTable.opened_at, to));
    if (source) conditions.push(eq(accountTable.source, source));
    if (refSuffix) conditions.push(sql`${accountTable.source_ref} like ${'%' + refSuffix}`);
    if (contactId) conditions.push(eq(accountTable.contact_id, contactId));

    const accounts = (await this.db.ormQuery((tx) => {
      const q = tx.select().from(accountTable);
      return conditions.length ? q.where(and(...conditions)) : q;
    })) as AccountRow[];

    const { totalBy, paidBy } = await this._accountTotals();
    return (
      accounts
        .map((a) => {
          const total = totalBy.get(a.id) ?? '0';
          const summary = derivePaymentSummary(total, paidBy.get(a.id) ?? '0');
          // «Vencido» no es un estado guardado: es tener saldo después de la fecha de
          // vencimiento. Guardarlo obligaría a un proceso diario y el día que no
          // corriera, una deuda vencida se vería al día.
          const vencido =
            a.due_date !== null &&
            a.due_date !== undefined &&
            a.due_date < new Date().toISOString().slice(0, 10) &&
            Number(summary.balance) > 0.005;
          return {
            ...a,
            opened_at: toIsoUtc(a.opened_at),
            total,
            ...summary,
            ...(vencido ? { status: 'overdue' } : {}),
          };
        })
        // Cuentas sin líneas NI pagos = mostradores abiertos y abandonados (ej. openForVisit
        // que nunca recibió una línea). Son ruido en Cobros, no un cobro real → se ocultan.
        // (Las consultas solo abren cuenta cuando hay servicios, así que no caen acá.)
        .filter((a) => Number(a.total) > 0.005 || Number(a.paid) > 0.005)
    );
  }

  /**
   * Cuenta + líneas + total + estado de cobro + pagos (para el detalle / drawer).
   *
   * El encabezado va DOS veces: anidado en `account`, que es lo que lee la
   * pantalla, y también arriba de todo. Lo segundo es para quien consume esto
   * como una ficha plana —la proyección del canal agentic lo es— porque si no,
   * el detalle de una cuenta puede decir cuánto se debe pero no de quién es ni
   * para qué lado va la plata.
   */
  async getWithLines({ id }: { id: string }): Promise<
    | (Omit<AccountRow, 'id'> & {
        account: AccountRow;
        lines: AccountLineRow[];
        total: string;
        paid: string;
        balance: string;
        paymentStatus: PaymentStatus;
        payments: PaymentRow[];
      })
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
    const { id: _id, ...encabezado } = account;
    return {
      ...encabezado,
      opened_at: toIsoUtc(account.opened_at),
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
  async listDebtors({ direction = 'receivable' }: { direction?: string } = {}): Promise<
    DebtorRow[]
  > {
    const accounts = (await this.db.ormQuery((tx) =>
      tx.select().from(accountTable).where(eq(accountTable.direction, direction))
    )) as AccountRow[];
    const { totalBy, paidBy } = await this._accountTotals();

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
