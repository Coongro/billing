import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const accountTable = pgTable('module_billing_accounts', {
  id: uuid('id').primaryKey().notNull(),
  contact_id: uuid('contact_id'),
  pet_id: uuid('pet_id'),
  consultation_id: text('consultation_id'),
  source: text('source').notNull(),
  status: text('status').notNull(),
  notes: text('notes'),
  opened_at: timestamp('opened_at', { mode: 'string' }).notNull().default(sql`now()`),
});

export type AccountRow = typeof accountTable.$inferSelect;
export type NewAccountRow = typeof accountTable.$inferInsert;
