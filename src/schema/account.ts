import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const accountTable = pgTable('module_billing_accounts', {
  id: uuid('id').primaryKey().notNull(),
  contact_id: uuid('contact_id'),
  pet_id: uuid('pet_id'),
  consultation_id: text('consultation_id'),
  source: text('source').notNull(),
  status: text('status').notNull(),
  // Dirección del dinero: 'receivable' = por cobrar (Cobros — un cliente nos debe);
  // 'payable' = por pagar (Salidas — le debemos a un proveedor). Convierte este ledger
  // (cuenta + líneas + pagos → estado derivado) en un motor genérico AR/AP reutilizable
  // por cualquier kit. DEFAULT 'receivable' para no cambiar el comportamiento existente
  // (Cobros/Caja/Deudores filtran receivable); NOT NULL + DEFAULT por la regla de plugins.
  direction: text('direction').notNull().default('receivable'),
  notes: text('notes'),
  opened_at: timestamp('opened_at', { mode: 'string' })
    .notNull()
    .default(sql`now()`),
});

export type AccountRow = typeof accountTable.$inferSelect;
export type NewAccountRow = typeof accountTable.$inferInsert;
