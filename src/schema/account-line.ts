import { numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const accountLineTable = pgTable('module_billing_account_lines', {
  id: uuid('id').primaryKey().notNull(),
  account_id: uuid('account_id').notNull(),
  product_id: uuid('product_id'),
  description: text('description').notNull(),
  quantity: numeric('quantity').notNull(),
  unit_price: numeric('unit_price').notNull(),
  subtotal: numeric('subtotal').notNull(),
  source_type: text('source_type').notNull(),
  source_ref: text('source_ref'),
});

export type AccountLineRow = typeof accountLineTable.$inferSelect;
export type NewAccountLineRow = typeof accountLineTable.$inferInsert;
