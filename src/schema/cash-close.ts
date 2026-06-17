import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Cierre de caja (arqueo) de un día: reconcilia el efectivo físico contado contra lo
 * esperado. Esperado = fondo inicial + efectivo cobrado − egresos.
 *
 * `expected_cash` y `difference` se GUARDAN como snapshot al cerrar (no se derivan en cada
 * lectura): un cierre es un acto puntual del día. Si después se edita/anula un cobro o un
 * egreso de ese día, el cierre debe seguir reflejando lo que realmente se contó esa vez —
 * derivarlos los reescribiría hacia atrás y el arqueo perdería sentido.
 *
 * Uno por día de negocio (`business_day`): re-cerrar pisa los valores (upsert en el repo).
 * No ponemos UNIQUE de DB para mantener la migración simple; el repo es el único escritor
 * y la concurrencia es baja (una caja, un operador).
 */
export const cashCloseTable = pgTable('module_billing_cash_closes', {
  id: uuid('id').primaryKey().notNull(),
  // Día de negocio 'YYYY-MM-DD' en zona local (cómo agrupa la Caja). Único por día.
  business_day: text('business_day').notNull(),
  opening_float: numeric('opening_float').notNull().default('0'),
  // Snapshot del esperado al momento de cerrar (fondo + efectivo cobrado − egresos).
  expected_cash: numeric('expected_cash').notNull(),
  counted_cash: numeric('counted_cash').notNull(),
  // counted − expected. Negativo = falta, positivo = sobra. Snapshot.
  difference: numeric('difference').notNull(),
  closed_at: timestamp('closed_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
  notes: text('notes'),
});

export type CashCloseRow = typeof cashCloseTable.$inferSelect;
export type NewCashCloseRow = typeof cashCloseTable.$inferInsert;
