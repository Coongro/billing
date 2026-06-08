import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Egresos de caja: salidas de EFECTIVO del cajón (retiro del dueño, pago a proveedor,
 * insumos, otros). Tabla standalone — a propósito NO se vincula a una cuenta: un egreso
 * es plata que sale, no la contracara de un cobro. El cierre de caja (cash-close) usa
 * estos egresos para reconciliar el efectivo del día.
 *
 * `category` es text libre igual que payment.method: el set de categorías es config de
 * negocio (hoy retiro/proveedor/insumos/otro, ver constants.ts), no un enum de DB que
 * obligue a migrar al sumar una. Si más adelante hicieran falta INGRESOS manuales de caja
 * (aporte de fondo, etc.), van en su propia tabla o con una columna `direction` acá.
 */
export const expenseTable = pgTable('module_billing_expenses', {
  id: uuid('id').primaryKey().notNull(),
  amount: numeric('amount').notNull(),
  category: text('category').notNull(),
  // ISO/UTC como paid_at: la Caja agrupa por fecha y necesita un string parseable (ver toIsoUtc).
  spent_at: timestamp('spent_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  notes: text('notes'),
});

export type ExpenseRow = typeof expenseTable.$inferSelect;
export type NewExpenseRow = typeof expenseTable.$inferInsert;
