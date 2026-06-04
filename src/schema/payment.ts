import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Pagos (cobros) contra una cuenta. Un pago = una fila → soporta cobro parcial y split
 * (varios medios en una misma cuenta) sin tocar la cuenta. El estado de pago de la
 * cuenta se DERIVA de SUM(amount) vs el total de líneas (mismo criterio que el total:
 * nunca se persiste, para no desincronizar por concurrencia).
 */
export const paymentTable = pgTable('module_billing_payments', {
  id: uuid('id').primaryKey().notNull(),
  account_id: uuid('account_id').notNull(),
  amount: numeric('amount').notNull(),
  // 'efectivo' | 'transferencia' | 'debito' | 'credito'. Text libre a propósito: el set
  // de medios es config de negocio, no un enum de DB que obligue a migrar al sumar uno.
  method: text('method').notNull(),
  // ISO/UTC como opened_at: los reportes de cobranza por fecha necesitan formato parseable.
  paid_at: timestamp('paid_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  notes: text('notes'),
});

export type PaymentRow = typeof paymentTable.$inferSelect;
export type NewPaymentRow = typeof paymentTable.$inferInsert;
